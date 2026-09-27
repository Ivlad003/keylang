// Trace adapter for TS/JS `@flow` tests: `node --import keylang/trace …`
// (in this repository: `--import ./src/adapters/trace.ts`). Environment:
//   KEYLANG_TRACE        JSONL file to append to (required)
//   KEYLANG_TRACE_FLOW   flow name whose trigger and steps are instrumented (required)
//   KEYLANG_TRACE_TEST   test id, e.g. `tests/cli.test.ts > @flow check …` (required)
//   KEYLANG_TRACE_RUN    run id shared by the tests of one run (default: time and pid)
//   KEYLANG_TRACE_ROOT   repository root (default: the working directory)
// Spans nest through AsyncLocalStorage; a span that starts after its parent
// ended (an async continuation) carries a link to the parent.

import { AsyncLocalStorage } from "node:async_hooks";
import { appendFileSync, mkdirSync } from "node:fs";
import { register } from "node:module";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { MessageChannel, receiveMessageOnPort } from "node:worker_threads";
import type { TracePlanMessage } from "./trace-hooks.ts";

interface Span {
  spanId: string;
  ended: boolean;
}

const file = process.env.KEYLANG_TRACE;
const flow = process.env.KEYLANG_TRACE_FLOW;
const testId = process.env.KEYLANG_TRACE_TEST;
if (!file || !flow || !testId) throw new Error("keylang trace: KEYLANG_TRACE, KEYLANG_TRACE_FLOW and KEYLANG_TRACE_TEST are required");
const runId = process.env.KEYLANG_TRACE_RUN ?? `${Date.now().toString(36)}-${process.pid}`;
const root = resolve(process.env.KEYLANG_TRACE_ROOT ?? process.cwd());

const { port1, port2 } = new MessageChannel();
const hooks = import.meta.url.endsWith(".ts") ? "./trace-hooks.ts" : "./trace-hooks.js";
register(hooks, { parentURL: import.meta.url, data: { root, flow, port: port2 }, transferList: [port2] });
let plan: TracePlanMessage | null = null;
const planned = (): TracePlanMessage | null => {
  plan ??= (receiveMessageOnPort(port1)?.message as TracePlanMessage | undefined) ?? null;
  return plan;
};
port1.unref();

const context = new AsyncLocalStorage<Span>();
const clockId = `pid-${process.pid}`;
const lines: string[] = [];
const open = new Set<string>();
let seq = 0;
let spans = 0;

const write = (event: Record<string, unknown>): void => {
  lines.push(JSON.stringify({ schemaVersion: 1, snapshotId: planned()?.snapshotId ?? null, runId, testId, flow, traceId: `${runId}:${testId}`, ...event }));
};

const start = (symbolId: string): Span => {
  const parent = context.getStore() ?? null;
  const span: Span = { spanId: `s${++spans}`, ended: false };
  write({ event: "start", spanId: span.spanId, parentSpanId: parent?.spanId ?? null, symbolId, clockId, seq: ++seq, ts: performance.now(), ...(parent?.ended ? { links: [parent.spanId] } : {}) });
  open.add(span.spanId);
  return span;
};

const finish = (span: Span, outcome: "ok" | "error"): void => {
  span.ended = true;
  open.delete(span.spanId);
  write({ event: "end", spanId: span.spanId, outcome, clockId, seq: ++seq, ts: performance.now() });
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
};

process.on("exit", () => {
  const info = planned();
  write({
    event: "run",
    complete: info !== null && !info.error && open.size === 0,
    dropped: 0,
    instrumented: info?.instrumented ?? [],
    open: [...open],
    ...(info?.error ? { error: info.error } : {}),
  });
  mkdirSync(dirname(resolve(file)), { recursive: true });
  appendFileSync(resolve(file), `${lines.join("\n")}\n`);
});
