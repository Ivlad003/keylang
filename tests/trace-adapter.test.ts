// Regressions from the 2026-10-06 review of the trace adapters: a process of a
// run that ends without writing its own `run` record (a terminated worker, a
// killed child, a forked worker) must leave the step `unverified`, never a
// false `fail missing step`, and a forked process must not replay its parent's
// events. Each case is the smallest repository that showed the bug.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");
const adapter = join(root, "src/adapters/trace.ts");

type Context = { after: (f: () => void) => void };

function keylang(cwd: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8", maxBuffer: 1 << 28 });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** A temp repository of `files`; `config` is `keylang.json`. */
function repo(t: Context, config: object, files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-trace-adapter-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "keylang.json"), `${JSON.stringify(config, null, 2)}\n`);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

function snapshotOf(dir: string): string {
  assert.equal(keylang(dir, ["map"]).status, 0);
  return (JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as { snapshotId: string }).snapshotId;
}

interface JsonResult {
  criterion: string;
  area: string;
  verdict: string;
  evidence: string;
}

/** `check --format json` results; the exit code is 2 only when a trace file could not be read at all. */
function check(dir: string): { status: number | null; rows: JsonResult[]; stderr: string } {
  const o = keylang(dir, ["check", "--format", "json"]);
  if (!o.stdout.startsWith("{")) return { status: o.status, rows: [], stderr: o.stderr };
  return { status: o.status, rows: (JSON.parse(o.stdout) as { results: JsonResult[] }).results, stderr: o.stderr };
}

/** `verdict evidence` of the trace line of `id`, for assertion messages that show what came instead. */
const traceOf = (rows: JsonResult[], id: string): string => {
  const r = rows.find((row) => row.criterion === "trace" && row.area === id);
  return r ? `${r.verdict}: ${r.evidence}` : "none";
};

interface Event {
  event: string;
  runId: string;
  clockId?: string;
  spanId?: string;
  symbolId?: string;
  complete?: boolean;
}

function events(dir: string, name: string): Event[] {
  return readFileSync(join(dir, ".keylang/trace", name), "utf8")
    .trim()
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as Event);
}

// ---------- the TS/JS adapter ----------

const JS_LAYERS = { languages: ["typescript", "javascript"], layers: { app: "src/app/**" }, exclude: ["run.mjs"], check: { trace: ".keylang/trace/*.jsonl" } };

/** `script` (an ES module, a file so that a worker or child can inherit the flags) under the adapter, recording flow `f`; no run id is given. */
function traced(dir: string, script: string): { status: number | null; stderr: string } {
  writeFileSync(join(dir, "run.mjs"), script);
  const env: Record<string, string | undefined> = { ...process.env, KEYLANG_TRACE: join(dir, ".keylang/trace/f.jsonl"), KEYLANG_TRACE_FLOW: "f", KEYLANG_TRACE_TEST: "t" };
  delete env.KEYLANG_TRACE_RUN;
  const r = spawnSync(process.execPath, ["--import", adapter, "run.mjs"], { cwd: dir, encoding: "utf8", env, timeout: 60_000 });
  return { status: r.status, stderr: r.stderr };
}

test("trace adapter: a worker stopped by worker.terminate() leaves its step unverified, not missing", (t) => {
  const dir = repo(t, JS_LAYERS, {
    "src/app/main.ts":
      'import { Worker } from "node:worker_threads";\nexport async function main(): Promise<void> {\n  const worker = new Worker(new URL("./w.ts", import.meta.url));\n  await new Promise((done) => worker.once("message", done));\n  await worker.terminate();\n}\n',
    "src/app/w.ts": 'import { parentPort } from "node:worker_threads";\nexport function inWorker(): number {\n  return 2;\n}\ninWorker();\nparentPort!.postMessage("done");\nsetInterval(() => {}, 1000);\n',
    "keylang/flows/f.md": "# flow f\n\n- trigger app.main.main\n  - step app.w.inWorker\n",
  });
  snapshotOf(dir);
  const r = traced(dir, "const m = await import('./src/app/main.ts'); await m.main();");
  assert.equal(r.status, 0, r.stderr);
  const all = events(dir, "f.jsonl");
  // The worker's span is on disk even though its `exit` never ran.
  assert.ok(all.some((e) => e.event === "start" && e.symbolId === "app.w.inWorker"), JSON.stringify(all));
  const c = check(dir);
  assert.notEqual(c.status, 2, c.stderr);
  // The worker's clock has spans but no `run` record: the run is incomplete, so nothing in it is a proven absence.
  assert.equal(traceOf(c.rows, "app.w.inWorker"), "unverified: unverified app.w.inWorker: incomplete trace (1 process ended without its run record)");
});

test("trace adapter: a child killed with SIGTERM flushes its spans and its run record, so its step is unverified, not missing", (t) => {
  const dir = repo(t, JS_LAYERS, {
    "src/app/main.ts":
      'import { fork } from "node:child_process";\nexport async function main(): Promise<void> {\n  const child = fork(new URL("./server.ts", import.meta.url));\n  await new Promise((done) => child.once("message", done));\n  child.kill("SIGTERM");\n  await new Promise((done) => child.once("exit", done));\n}\n',
    "src/app/server.ts": 'export function handle(): number {\n  return 1;\n}\nhandle();\nprocess.send!("ready");\nsetInterval(() => {}, 1000);\n',
    "keylang/flows/f.md": "# flow f\n\n- trigger app.main.main\n  - step app.server.handle\n",
  });
  snapshotOf(dir);
  const r = traced(dir, "const m = await import('./src/app/main.ts'); await m.main();");
  assert.equal(r.status, 0, r.stderr);
  const all = events(dir, "f.jsonl");
  assert.ok(all.some((e) => e.event === "start" && e.symbolId === "app.server.handle"), JSON.stringify(all));
  // The signal handler wrote the child's own `run` record, incomplete, and the process still died of the signal.
  const runs = all.filter((e) => e.event === "run");
  assert.equal(runs.length, 2, JSON.stringify(runs));
  assert.ok(runs.some((e) => e.complete === false), JSON.stringify(runs));
  assert.equal(new Set(runs.map((e) => e.runId)).size, 1);
  const c = check(dir);
  assert.notEqual(c.status, 2, c.stderr);
  assert.equal(traceOf(c.rows, "app.server.handle"), "unverified: unverified app.server.handle: incomplete trace");
});

test("trace adapter: a SIGTERM handler of the program keeps its turn; the adapter only flushes", (t) => {
  const dir = repo(t, JS_LAYERS, {
    "src/app/main.ts":
      'import { fork } from "node:child_process";\nexport async function main(): Promise<void> {\n  const child = fork(new URL("./server.ts", import.meta.url));\n  await new Promise((done) => child.once("message", done));\n  child.kill("SIGTERM");\n  const code = await new Promise((done) => child.once("exit", done));\n  if (code !== 7) throw new Error(`exit ${String(code)}`);\n}\n',
    "src/app/server.ts": 'export function handle(): number {\n  return 1;\n}\nprocess.on("SIGTERM", () => {\n  handle();\n  process.exit(7);\n});\nprocess.send!("ready");\nsetInterval(() => {}, 1000);\n',
    "keylang/flows/f.md": "# flow f\n\n- trigger app.main.main\n  - step app.server.handle\n",
  });
  snapshotOf(dir);
  const r = traced(dir, "const m = await import('./src/app/main.ts'); await m.main();");
  assert.equal(r.status, 0, r.stderr);
  const runs = events(dir, "f.jsonl").filter((e) => e.event === "run");
  // The child's own handler ran `handle()` and exited: its `exit` wrote the one run record of the child.
  assert.equal(runs.length, 2, JSON.stringify(runs));
  const c = check(dir);
  assert.notEqual(c.status, 2, c.stderr);
  assert.match(traceOf(c.rows, "app.server.handle"), /^unverified: unverified app\.server\.handle: observed outside/);
});

test("trace evidence: a clock with spans but no run record of its own makes the run incomplete", (t) => {
  const dir = repo(t, JS_LAYERS, {
    "src/app/main.ts": "export function main(): void {}\nexport function never(): void {}\n",
    "src/app/w.ts": "export function inWorker(): number {\n  return 2;\n}\n",
    "keylang/flows/f.md": "# flow f\n\n- trigger app.main.main\n  - step app.main.never\n  - step app.w.inWorker\n",
  });
  const snapshotId = snapshotOf(dir);
  const base = { schemaVersion: 1, snapshotId, runId: "r1", testId: "t", flow: "f", traceId: "r1:t" };
  const lines: Record<string, unknown>[] = [
    { ...base, event: "start", spanId: "a:s1", parentSpanId: null, symbolId: "app.main.main", clockId: "a", seq: 1, ts: 1 },
    { ...base, event: "start", spanId: "b:s1", parentSpanId: null, symbolId: "app.w.inWorker", clockId: "b", seq: 1, ts: 2 },
    { ...base, event: "end", spanId: "b:s1", outcome: "ok", clockId: "b", seq: 2, ts: 3 },
    { ...base, event: "end", spanId: "a:s1", outcome: "ok", clockId: "a", seq: 2, ts: 4 },
    { ...base, event: "run", clockId: "a", complete: true, dropped: 0, instrumented: ["app.main.main", "app.main.never", "app.w.inWorker"], open: [] },
  ];
  mkdirSync(join(dir, ".keylang/trace"), { recursive: true });
  writeFileSync(join(dir, ".keylang/trace/f.jsonl"), `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`);
  const c = check(dir);
  assert.notEqual(c.status, 2, c.stderr);
  // Clock `b` ended without its record: what it would have shown is unknown, so nothing is a proven absence.
  assert.equal(traceOf(c.rows, "app.main.never"), "unverified: unverified app.main.never: incomplete trace (1 process ended without its run record)");
  assert.equal(traceOf(c.rows, "app.w.inWorker"), "unverified: unverified app.w.inWorker: incomplete trace (1 process ended without its run record)");
  // A run record without `clockId` (an older adapter) does not say whose it is: with one, no clock is judged, as before.
  lines.push({ ...base, event: "run", complete: true, dropped: 0, instrumented: ["app.main.main", "app.main.never", "app.w.inWorker"], open: [] });
  writeFileSync(join(dir, ".keylang/trace/f.jsonl"), `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`);
  assert.equal(traceOf(check(dir).rows, "app.main.never"), "fail: fail app.main.never: missing step in t");
});
