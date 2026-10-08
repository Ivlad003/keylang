// Trace adapter for TS/JS: `node --import keylang/trace …` (in this
// repository: `--import ./src/adapters/trace.ts`). Environment:
//   KEYLANG_TRACE        JSONL file to append to; without it the adapter does nothing (a relative
//                        path, like the root and the plan, is resolved once against the startup directory)
//   KEYLANG_TRACE_FLOW   flow name whose trigger and steps are instrumented
//   KEYLANG_TRACE_PLAN   a plan from `keylang trace-plan` (a flow's or `--entry <id>`): its functions
//                        are instrumented instead (one of the two is required with KEYLANG_TRACE)
//   KEYLANG_TRACE_TEST   test id, e.g. `tests/cli-repository.test.ts > @flow check …` (default: the command line)
//   KEYLANG_TRACE_RUN    run id shared by the tests of one run (default: time and pid)
//   KEYLANG_TRACE_ROOT   repository root (default: the working directory)
//   KEYLANG_FLOW         the flow this process's run is of (default: KEYLANG_TRACE_FLOW, else the plan's)
// Spans nest through AsyncLocalStorage; a span that starts after its parent
// ended (an async continuation) carries a link to the parent. Events are
// appended to the file as spans end (and in bounded batches before that), so a
// worker that `terminate()` stops or a child a signal kills leaves its spans
// behind; its `run` record, written at `exit` or by the adapter's SIGTERM/SIGINT
// handler, names its clockId, and a clock without one makes the run incomplete.
//
// A server names the flow of each request: `withFlow(name, fn)` runs `fn` as a
// run of its own (a run id and a clock of its own, its `run` record when `fn`
// settles), so concurrent requests of different flows never share spans.

import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire, register } from "node:module";
import { dirname, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { isMainThread, MessageChannel, receiveMessageOnPort } from "node:worker_threads";
import { TRACE_SCHEMA } from "../trace-evidence.ts";
import { runId } from "./run-id.ts";
import type { TracePlanMessage } from "./trace-hooks.ts";

/** One run being recorded: the process's own, or one request's (`withFlow`). */
interface Scope {
  runId: string;
  testId: string;
  flow: string;
  clockId: string;
  seq: number;
  spans: number;
  open: Set<string>;
}

interface Span {
  spanId: string;
  ended: boolean;
  scope: Scope;
}

type Plan = Extract<TracePlanMessage, { kind: "plan" }>;

/** What the adapter puts on `globalThis`: the wrappers' entry and the request scopes. */
interface TraceApi {
  run<T>(symbolId: string, isAsync: boolean, body: () => T): T;
  own(module: object): void;
  withFlow<T>(flow: string, body: () => T, testId?: string): T;
}

const api = (): TraceApi | undefined => (globalThis as { __keylangTrace?: TraceApi }).__keylangTrace;

/**
 * Runs `fn` as a run of `flow`: the spans it makes, in its async continuations
 * too, go to a run of their own (its own run id and clock; `testId`, else the
 * process's test id), and its `run` record is written when `fn` returns or its
 * promise settles. A request handler names the flow from `X-Keylang-Flow`:
 *
 *     app.use((req, res, next) => withFlow(req.get("x-keylang-flow"), () => new Promise((done) => { res.on("close", done); next(); })));
 *
 * Without a flow name, or when the adapter does not record (no `KEYLANG_TRACE`),
 * it only calls `fn`.
 */
export function withFlow<T>(flow: string | null | undefined, fn: () => T, testId?: string): T {
  const trace = api();
  return trace && flow ? trace.withFlow(flow, fn, testId) : fn();
}

// Without a trace file there is nothing to record, so the import can stay in a test configuration.
// A second copy of this module (an app's own import by another URL) finds the first one recording.
const output = process.env.KEYLANG_TRACE;
if (output && !api()) record(output);

function record(given: string): void {
  const planPath = process.env.KEYLANG_TRACE_PLAN ? resolve(process.env.KEYLANG_TRACE_PLAN) : null;
  const specFlow = process.env.KEYLANG_TRACE_FLOW || null;
  if (!specFlow && !planPath) throw new Error("keylang trace: KEYLANG_TRACE is set, so KEYLANG_TRACE_FLOW is required too (or KEYLANG_TRACE_PLAN, a plan from `keylang trace-plan`)");
  const flow = process.env.KEYLANG_FLOW || specFlow || planFlow(planPath!);
  const run = runId();
  // Workers and child processes inherit the id, so the processes of one test are one run:
  // a step one of them ran is never missing from another's own run.
  process.env.KEYLANG_TRACE_RUN = run;
  const root = resolve(process.env.KEYLANG_TRACE_ROOT ?? process.cwd());
  const testId = process.env.KEYLANG_TRACE_TEST || commandLine(root);
  // Relative paths are the startup directory's, once: a program that changes its directory (`process.chdir()`)
  // still writes into the repository, and a child started elsewhere gets the same absolute paths.
  const file = resolve(given);
  process.env.KEYLANG_TRACE = file;
  process.env.KEYLANG_TRACE_ROOT = root;
  if (planPath) process.env.KEYLANG_TRACE_PLAN = planPath;

  const { port1, port2 } = new MessageChannel();
  const hooks = import.meta.url.endsWith(".ts") ? "./trace-hooks.ts" : "./trace-hooks.js";
  register(hooks, { parentURL: import.meta.url, data: { root, flow: planPath ? null : specFlow, plan: planPath, port: port2 }, transferList: [port2] });
  let plan: Plan | null = null;
  const loads: Loads = { imported: new Set(), skipped: new Set(), own: new WeakSet() };
  /** Reads what the hooks thread sent so far: the plan, then the files it was applied to or left alone. */
  const planned = (): Plan | null => {
    for (;;) {
      const message = receiveMessageOnPort(port1)?.message as TracePlanMessage | undefined;
      if (!message) break;
      if (message.kind === "plan") plan = message;
      else if (message.kind === "skipped") for (const id of message.ids) loads.skipped.add(id);
      // A CommonJS copy proves itself by `own`: Node may run a copy it cached before instead.
      else if (!message.commonjs) for (const id of message.ids) loads.imported.add(id);
    }
    return plan;
  };
  port1.unref();

  const context = new AsyncLocalStorage<Span>();
  const scopes = new AsyncLocalStorage<Scope>();
  // Span ids are unique across the processes of one run: several may share KEYLANG_TRACE_RUN.
  const clockId = `pid-${process.pid}-${randomBytes(4).toString("hex")}`;
  const processScope: Scope = { runId: run, testId, flow, clockId, seq: 0, spans: 0, open: new Set() };
  let requests = 0;
  const lines: string[] = [];

  // Events reach the file as they happen: on every `end` and once this many
  // pile up, not only at exit. A worker stopped by `worker.terminate()`, a
  // child killed by a signal or a process gone with its parent's `process.exit()`
  // never runs `exit`; its spans must already be on disk, and the missing `run`
  // record of its clock tells `check` the run is incomplete.
  const BUFFER = 64;
  const flush = (): void => {
    if (lines.length === 0) return;
    const text = `${lines.join("\n")}\n`;
    lines.length = 0;
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, text);
  };

  const write = (scope: Scope, event: Record<string, unknown>): void => {
    lines.push(JSON.stringify({ schemaVersion: TRACE_SCHEMA, snapshotId: planned()?.snapshotId ?? null, runId: scope.runId, testId: scope.testId, flow: scope.flow, traceId: `${scope.runId}:${scope.testId}`, ...event }));
  };

  const start = (symbolId: string): Span => {
    const scope = scopes.getStore() ?? processScope;
    // A span of another run (the process's, around a request) is no parent here: the request's run starts at its root.
    const outer = context.getStore();
    const parent = outer?.scope === scope ? outer : null;
    const span: Span = { spanId: `${scope.clockId}:s${++scope.spans}`, ended: false, scope };
    write(scope, { event: "start", spanId: span.spanId, parentSpanId: parent?.spanId ?? null, symbolId, clockId: scope.clockId, seq: ++scope.seq, ts: performance.now(), ...(parent?.ended ? { links: [parent.spanId] } : {}) });
    scope.open.add(span.spanId);
    if (lines.length >= BUFFER) flush();
    return span;
  };

  const finish = (span: Span, outcome: "ok" | "error"): void => {
    span.ended = true;
    const { scope } = span;
    scope.open.delete(span.spanId);
    write(scope, { event: "end", spanId: span.spanId, outcome, clockId: scope.clockId, seq: ++scope.seq, ts: performance.now() });
    flush();
  };

  /** The `run` record of `scope`: complete when it was not cut short and no span of it is open. */
  const runRecord = (scope: Scope, cut: { killed: boolean; crashed: boolean; code: number | null }): void => {
    const info = planned();
    const left = info === null ? null : instrumented(info, loads);
    write(scope, {
      event: "run",
      clockId: scope.clockId,
      complete: !cut.killed && info !== null && !info.error && scope.open.size === 0 && !cut.crashed,
      dropped: 0,
      instrumented: left?.ids ?? [],
      ...(left && Object.keys(left.reasons).length > 0 ? { uninstrumented: left.reasons } : {}),
      ...(cut.code !== null && cut.code !== 0 ? { exitCode: cut.code } : {}),
      open: [...scope.open],
      ...(info?.error ? { error: info.error } : {}),
    });
    flush();
  };

  const traceApi: TraceApi = {
    run<T>(symbolId: string, isAsync: boolean, body: () => T): T {
      const span = start(symbolId);
      let result: T;
      try {
        result = context.run(span, body);
      } catch (e) {
        finish(span, "error");
        throw e;
      }
      if (isAsync && result instanceof Promise) {
        return result.then(
          (value) => {
            finish(span, "ok");
            return value;
          },
          (error: unknown) => {
            finish(span, "error");
            throw error;
          },
        ) as T;
      }
      finish(span, "ok");
      return result;
    },
    /** A planned CommonJS file ran from the wrapped source: `module` is that copy. */
    own(module: object): void {
      loads.own.add(module);
    },
    withFlow<T>(name: string, body: () => T, scopeTest?: string): T {
      const n = ++requests;
      const scope: Scope = { runId: `${run}.r${n}`, testId: scopeTest || testId, flow: name, clockId: `${clockId}.r${n}`, seq: 0, spans: 0, open: new Set() };
      // A request that throws did not run its flow to the end, as a crashed process did not.
      const done = (crashed: boolean): void => runRecord(scope, { killed: false, crashed, code: null });
      let result: T;
      try {
        result = scopes.run(scope, () => context.exit(body));
      } catch (e) {
        done(true);
        throw e;
      }
      if (result instanceof Promise) {
        return result.then(
          (value) => {
            done(false);
            return value;
          },
          (error: unknown) => {
            done(true);
            throw error;
          },
        ) as T;
      }
      done(false);
      return result;
    },
  };
  (globalThis as { __keylangTrace?: TraceApi }).__keylangTrace = traceApi;

  // A process that crashed did not run the flow to its end: its spans are not complete evidence.
  // A non-zero exit code alone is not a crash (`keylang check` exits 1 on findings); it is recorded.
  let crashed = false;
  process.on("uncaughtExceptionMonitor", () => (crashed = true));
  /** The `run` record of this process, once: at `exit`, or earlier when a signal is about to end the process. */
  let recorded = false;
  const record = (code: number | null, killed: boolean): void => {
    if (recorded) return;
    recorded = true;
    // A server whose every span was a request's has no run of its own to report.
    if (requests > 0 && processScope.spans === 0) {
      flush();
      return;
    }
    runRecord(processScope, { killed, crashed, code });
  };
  process.on("exit", (code) => record(code, false));
  // A signal with no handler ends the process without `exit`. The adapter writes
  // what it has and the record of a run cut short, then lets the signal do its
  // work; a handler of the program itself keeps its turn, and the adapter only flushes.
  if (isMainThread) {
    for (const signal of ["SIGTERM", "SIGINT"] as const) {
      const onSignal = (): void => {
        process.removeListener(signal, onSignal);
        if (process.listenerCount(signal) > 0) {
          flush();
          return;
        }
        record(null, true);
        process.kill(process.pid, signal);
      };
      process.on(signal, onSignal);
    }
  }
}

/** The flow a plan file names; a file that is no plan stops the process with its path. */
function planFlow(path: string): string {
  let flow: unknown;
  try {
    flow = (JSON.parse(readFileSync(path, "utf8")) as { flow?: unknown }).flow;
  } catch (e) {
    throw new Error(`keylang trace: ${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (typeof flow !== "string" || flow === "") throw new Error(`keylang trace: ${path}: not a plan of schema 1 from \`keylang trace-plan\``);
  return flow;
}

/** The test id of a process without KEYLANG_TRACE_TEST: its command line, the script relative to the root. */
function commandLine(root: string): string {
  const [, script, ...args] = process.argv;
  return ["node", ...(script ? [relative(root, script) || script] : []), ...args].join(" ");
}

/** What the hooks did with the planned files in this process. */
interface Loads {
  /** Planned functions of files loaded as ES modules with the wrappers. */
  imported: Set<string>;
  /** Planned functions of files that loaded with other content than the snapshot saw. */
  skipped: Set<string>;
  /** Module objects of planned CommonJS files that ran from the wrapped source. */
  own: WeakSet<object>;
}

/**
 * The plan's functions this process would have recorded had it called them:
 * every function a wrapper was planned for, whether or not the process loaded
 * its file (code it never loaded never ran here). Left out: a file that loaded
 * with other content than the snapshot saw, and a file whose copy in the
 * CommonJS cache is not the wrapped one: read by the CommonJS loader past the
 * hooks (a `require` from a module they never saw), or an ES module that
 * `require` loaded before any `import` did.
 */
function instrumented(plan: Plan, loads: Loads): { ids: string[]; reasons: Record<string, string> } {
  const cache = createRequire(import.meta.url).cache;
  // Each function of the flow left out, with the reason: the run record names them for `check`.
  const reasons: Record<string, string> = { ...plan.unplanned };
  for (const id of loads.skipped) reasons[id] = "its file loaded with other content than the snapshot saw";
  for (const file of plan.files) {
    const copy = cache[file.path];
    // A `require` of an ES module the hooks loaded first gets that module, wrappers included.
    if (copy === undefined || loads.own.has(copy) || file.ids.every((id) => loads.imported.has(id))) continue;
    for (const id of file.ids) reasons[id] ??= "its file was loaded past the trace hooks";
  }
  return { ids: plan.planned.filter((id) => !(id in reasons)), reasons };
}
