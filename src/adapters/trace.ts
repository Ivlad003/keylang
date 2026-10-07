// Trace adapter for TS/JS `@flow` tests: `node --import keylang/trace …`
// (in this repository: `--import ./src/adapters/trace.ts`). Environment:
//   KEYLANG_TRACE        JSONL file to append to; without it the adapter does nothing
//   KEYLANG_TRACE_FLOW   flow name whose trigger and steps are instrumented (required with KEYLANG_TRACE)
//   KEYLANG_TRACE_TEST   test id, e.g. `tests/cli-repository.test.ts > @flow check …` (required with KEYLANG_TRACE)
//   KEYLANG_TRACE_RUN    run id shared by the tests of one run (default: time and pid)
//   KEYLANG_TRACE_ROOT   repository root (default: the working directory)
// Spans nest through AsyncLocalStorage; a span that starts after its parent
// ended (an async continuation) carries a link to the parent. Events are
// appended to the file as spans end (and in bounded batches before that), so a
// worker that `terminate()` stops or a child a signal kills leaves its spans
// behind; its `run` record, written at `exit` or by the adapter's SIGTERM/SIGINT
// handler, names its clockId, and a clock without one makes the run incomplete.

import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { createRequire, register } from "node:module";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { isMainThread, MessageChannel, receiveMessageOnPort } from "node:worker_threads";
import { TRACE_SCHEMA } from "../trace-evidence.ts";
import { runId } from "./run-id.ts";
import type { TracePlanMessage } from "./trace-hooks.ts";

interface Span {
  spanId: string;
  ended: boolean;
}

type Plan = Extract<TracePlanMessage, { kind: "plan" }>;

// Without a trace file there is nothing to record, so the import can stay in a test configuration.
const output = process.env.KEYLANG_TRACE;
if (output) record(output);

function record(file: string): void {
  const flow = process.env.KEYLANG_TRACE_FLOW;
  const testId = process.env.KEYLANG_TRACE_TEST;
  const missing = [flow ? null : "KEYLANG_TRACE_FLOW", testId ? null : "KEYLANG_TRACE_TEST"].filter((name) => name !== null);
  if (!flow || !testId) throw new Error(`keylang trace: KEYLANG_TRACE is set, so ${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} required too`);
  const run = runId();
  // Workers and child processes inherit the id, so the processes of one test are one run:
  // a step one of them ran is never missing from another's own run.
  process.env.KEYLANG_TRACE_RUN = run;
  const root = resolve(process.env.KEYLANG_TRACE_ROOT ?? process.cwd());

  const { port1, port2 } = new MessageChannel();
  const hooks = import.meta.url.endsWith(".ts") ? "./trace-hooks.ts" : "./trace-hooks.js";
  register(hooks, { parentURL: import.meta.url, data: { root, flow, port: port2 }, transferList: [port2] });
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
  // Span ids are unique across the processes of one run: several may share KEYLANG_TRACE_RUN.
  const clockId = `pid-${process.pid}-${randomBytes(4).toString("hex")}`;
  const lines: string[] = [];
  const open = new Set<string>();
  let seq = 0;
  let spans = 0;

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
    mkdirSync(dirname(resolve(file)), { recursive: true });
    appendFileSync(resolve(file), text);
  };

  const write = (event: Record<string, unknown>): void => {
    lines.push(JSON.stringify({ schemaVersion: TRACE_SCHEMA, snapshotId: planned()?.snapshotId ?? null, runId: run, testId, flow, traceId: `${run}:${testId}`, ...event }));
  };

  const start = (symbolId: string): Span => {
    const parent = context.getStore() ?? null;
    const span: Span = { spanId: `${clockId}:s${++spans}`, ended: false };
    write({ event: "start", spanId: span.spanId, parentSpanId: parent?.spanId ?? null, symbolId, clockId, seq: ++seq, ts: performance.now(), ...(parent?.ended ? { links: [parent.spanId] } : {}) });
    open.add(span.spanId);
    if (lines.length >= BUFFER) flush();
    return span;
  };

  const finish = (span: Span, outcome: "ok" | "error"): void => {
    span.ended = true;
    open.delete(span.spanId);
    write({ event: "end", spanId: span.spanId, outcome, clockId, seq: ++seq, ts: performance.now() });
    flush();
  };

  (globalThis as { __keylangTrace?: unknown }).__keylangTrace = {
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
  };

  // A process that crashed did not run the flow to its end: its spans are not complete evidence.
  // A non-zero exit code alone is not a crash (`keylang check` exits 1 on findings); it is recorded.
  let crashed = false;
  process.on("uncaughtExceptionMonitor", () => (crashed = true));
  /** The `run` record of this process, once: at `exit`, or earlier when a signal is about to end the process. */
  let recorded = false;
  const record = (code: number | null, killed: boolean): void => {
    if (recorded) return;
    recorded = true;
    const info = planned();
    write({
      event: "run",
      clockId,
      complete: !killed && info !== null && !info.error && open.size === 0 && !crashed,
      dropped: 0,
      instrumented: info === null ? [] : instrumented(info, loads),
      ...(code !== null && code !== 0 ? { exitCode: code } : {}),
      open: [...open],
      ...(info?.error ? { error: info.error } : {}),
    });
    flush();
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
function instrumented(plan: Plan, loads: Loads): string[] {
  const cache = createRequire(import.meta.url).cache;
  const left = new Set(loads.skipped);
  for (const file of plan.files) {
    const copy = cache[file.path];
    // A `require` of an ES module the hooks loaded first gets that module, wrappers included.
    if (copy === undefined || loads.own.has(copy) || file.ids.every((id) => loads.imported.has(id))) continue;
    for (const id of file.ids) left.add(id);
  }
  return plan.planned.filter((id) => !left.has(id));
}
