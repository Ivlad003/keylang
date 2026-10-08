// Regressions from the 2026-10-06 review of the trace adapters: a process of a
// run that ends without writing its own `run` record (a terminated worker, a
// killed child, a forked worker) must leave the step `unverified`, never a
// false `fail missing step`, and a forked process must not replay its parent's
// events. Each case is the smallest repository that showed the bug.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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

test("trace adapter: overloads, CommonJS exports and `(…) satisfies T` are instrumented; a function left out says why", (t) => {
  const dir = repo(t, JS_LAYERS, {
    "src/app/legacy.cjs": "exports.a = function () {\n  return 1;\n};\n",
    "src/app/legacy2.cjs": "module.exports = {\n  b: function () {\n    return 2;\n  },\n  c: () => {\n    return 3;\n  },\n};\n",
    "src/app/main.ts": [
      'import legacy from "./legacy.cjs";',
      'import legacy2 from "./legacy2.cjs";',
      "type H = (x: number) => number;",
      "export function fmt(x: number): string;",
      "export function fmt(x: string): string;",
      "export function fmt(x: unknown): string {",
      "  return String(x);",
      "}",
      "export class Svc {",
      "  run(x: number): string;",
      "  run(x: string): string;",
      "  run(x: unknown): string {",
      "    return fmt(x as number);",
      "  }",
      "}",
      "export const typed = ((x: number): number => {",
      "  return x + 1;",
      "}) satisfies H;",
      "export const asd = ((x: number): number => x * 2) as H;",
      "export const plain = (x: number): number => x;",
      "export function* gen(): Generator<number> {",
      "  yield 1;",
      "}",
      "export function main(): void {",
      "  legacy.a();",
      "  legacy2.b();",
      "  legacy2.c();",
      "  typed(1);",
      "  asd(1);",
      "  plain(1);",
      "  new Svc().run(1);",
      "  [...gen()];",
      "}",
      "",
    ].join("\n"),
    "keylang/flows/f.md":
      "# flow f\n\n- trigger app.main.main\n  - step app.legacy.a\n  - step app.legacy2.b\n  - step app.legacy2.c\n  - step app.main.typed\n  - step app.main.asd\n  - step app.main.plain\n  - step app.main.Svc.run\n    - step app.main.fmt\n  - step app.main.gen\n",
  });
  snapshotOf(dir);
  const r = traced(dir, "const m = await import('./src/app/main.ts'); m.main();");
  assert.equal(r.status, 0, r.stderr);
  const run = events(dir, "f.jsonl").find((e) => e.event === "run") as Event & { instrumented: string[]; uninstrumented?: Record<string, string> };
  assert.deepEqual(run.instrumented, ["app.legacy.a", "app.legacy2.b", "app.legacy2.c", "app.main.Svc.run", "app.main.asd", "app.main.fmt", "app.main.main", "app.main.plain", "app.main.typed"]);
  // The one function left out is named with the reason, in the run record and in the verdict.
  assert.deepEqual(run.uninstrumented, { "app.main.gen": "a generator" });
  const c = check(dir);
  assert.notEqual(c.status, 2, c.stderr);
  for (const id of ["app.legacy.a", "app.legacy2.b", "app.legacy2.c", "app.main.typed", "app.main.asd", "app.main.plain", "app.main.Svc.run", "app.main.fmt"]) {
    assert.equal(traceOf(c.rows, id), `ok: ok ${id}: observed in t`, id);
  }
  assert.equal(traceOf(c.rows, "app.main.gen"), "unverified: unverified app.main.gen: `app.main.gen` is not instrumented (a generator)");
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

// ---------- the Python adapter ----------

const python3 = spawnSync("python3", ["--version"], { encoding: "utf8" }).status === 0;
const pythonAdapter = join(root, "adapters/python/keylang_trace.py");

/** A Python repository whose `main()` runs `crunch` as `body` says, traced under the adapter for flow `crunch`. */
function pythonRun(t: Context, body: string): { dir: string; stdout: string; stderr: string; status: number | null } {
  const dir = repo(t, { languages: ["python"], layers: { app: ["app/**"] }, exclude: ["run.py"], check: { trace: ".keylang/trace/*.jsonl" } }, {
    "app/__init__.py": "",
    "app/work.py": "def crunch(x):\n    return x * 2\n",
    "app/main.py": `import os\nimport sys\nfrom multiprocessing import Pool\n\nfrom app.work import crunch\n\n\ndef main():\n${body}`,
    "run.py": "from app.main import main\n\nprint(main())\n",
    "keylang/flows.md": "# flow crunch\n\n- trigger app.main.main\n  - step app.work.crunch\n",
  });
  const plan = keylang(dir, ["trace-plan", "crunch"]);
  assert.equal(plan.status, 0, plan.stderr);
  writeFileSync(join(dir, "plan.json"), plan.stdout);
  const env: Record<string, string | undefined> = { ...process.env, KEYLANG_TRACE: ".keylang/trace/crunch.jsonl", KEYLANG_TRACE_PLAN: "plan.json", KEYLANG_TRACE_TEST: "run.py > @flow crunch" };
  delete env.KEYLANG_TRACE_RUN;
  const r = spawnSync("python3", [pythonAdapter, "run.py"], { cwd: dir, encoding: "utf8", env, timeout: 60_000 });
  return { dir, stdout: r.stdout, stderr: r.stderr, status: r.status };
}

test("python: a step run in a forked multiprocessing worker is recorded by the worker, so it is unverified, not missing", { skip: python3 ? false : "python3 is not installed" }, (t) => {
  // A pool closed and joined lets its worker leave through `_exit_function` and `os._exit`: the finalizer writes the record.
  const r = pythonRun(t, "    pool = Pool(1)\n    try:\n        return pool.map(crunch, [1, 2])\n    finally:\n        pool.close()\n        pool.join()\n");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "[2, 4]\n");
  const all = events(r.dir, "crunch.jsonl");
  const runs = all.filter((e) => e.event === "run");
  // The worker wrote its own spans and its own run record, on a clock of its own pid.
  assert.ok(all.some((e) => e.event === "start" && e.symbolId === "app.work.crunch"), JSON.stringify(all));
  assert.equal(runs.length, 2, JSON.stringify(runs));
  assert.equal(new Set(runs.map((e) => e.clockId)).size, 2, JSON.stringify(runs));
  assert.equal(new Set(runs.map((e) => e.runId)).size, 1);
  const c = check(r.dir);
  assert.notEqual(c.status, 2, c.stderr);
  assert.match(traceOf(c.rows, "app.work.crunch"), /^unverified: unverified app\.work\.crunch: observed outside `app\.main\.main` in another call tree/);
  // `with Pool(1)` ends with `terminate()`: SIGTERM may end the worker before its finalizer, or the sentinel may win.
  // Either way its spans are on disk, and a missing record makes the run incomplete rather than the step missing.
  const killed = pythonRun(t, "    with Pool(1) as pool:\n        return pool.map(crunch, [1, 2])\n");
  assert.equal(killed.status, 0, killed.stderr);
  assert.equal(killed.stdout, "[2, 4]\n");
  const rest = events(killed.dir, "crunch.jsonl");
  assert.ok(rest.some((e) => e.event === "start" && e.symbolId === "app.work.crunch"), JSON.stringify(rest));
  const records = rest.filter((e) => e.event === "run").length;
  assert.ok(records === 1 || records === 2, JSON.stringify(rest));
  const k = check(killed.dir);
  assert.notEqual(k.status, 2, k.stderr);
  assert.match(traceOf(k.rows, "app.work.crunch"), records === 1 ? /^unverified: unverified app\.work\.crunch: incomplete trace \(1 process ended without its run record\)/ : /^unverified: unverified app\.work\.crunch: observed outside/);
});

test("python: a process forked with os.fork() records only its own events, with span ids of its own", { skip: python3 ? false : "python3 is not installed" }, (t) => {
  // The child exits normally, so its `atexit` runs: before the fix it replayed the parent's buffered events under the same span ids.
  const r = pythonRun(t, "    pid = os.fork()\n    if pid == 0:\n        crunch(1)\n        sys.exit(0)\n    os.waitpid(pid, 0)\n    return crunch(2)\n");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "4\n");
  const all = events(r.dir, "crunch.jsonl");
  const starts = all.filter((e) => e.event === "start");
  assert.equal(new Set(starts.map((e) => e.spanId)).size, starts.length, `span ids repeat: ${JSON.stringify(starts)}`);
  // The child inherited the parent's open `main` span but does not end it: that span belongs to the parent's clock.
  assert.equal(all.filter((e) => e.event === "end" && e.spanId === starts[0]!.spanId).length, 1, JSON.stringify(all));
  const c = check(r.dir);
  assert.notEqual(c.status, 2, c.stderr);
  assert.equal(traceOf(c.rows, "app.work.crunch"), "ok: ok app.work.crunch: observed in run.py > @flow crunch");
});

// ---------- the PHP adapter ----------

const php = spawnSync("php", ["-r", 'echo extension_loaded("pcntl") ? "pcntl" : "no";'], { encoding: "utf8" });
const pcntl = php.status === 0 && php.stdout === "pcntl";

test("php: a process forked with pcntl_fork() records only its own events, with a clock and span ids of its own", { skip: pcntl ? false : php.status === 0 ? "php has no pcntl extension" : "php is not installed" }, (t) => {
  const dir = repo(t, { languages: ["php"], layers: { app: ["src/App/**"] }, exclude: ["run.php"], check: { trace: ".keylang/trace/*.jsonl" } }, {
    "src/App/Work.php": "<?php\nnamespace Shop\\App;\n\nclass Work\n{\n    public function crunch(int $x): int\n    {\n        return $x * 2;\n    }\n\n    public function main(): int\n    {\n        $pid = pcntl_fork();\n        if ($pid === 0) {\n            $this->crunch(1);\n            exit(0);\n        }\n        pcntl_waitpid($pid, $status);\n        return $this->crunch(2);\n    }\n}\n",
    "run.php": "<?php\nrequire __DIR__ . '/src/App/Work.php';\necho (new Shop\\App\\Work())->main(), \"\\n\";\n",
    "keylang/flows.md": "# flow crunch\n\n- trigger app.Work.Work.main\n  - step app.Work.Work.crunch\n",
  });
  const plan = keylang(dir, ["trace-plan", "crunch"]);
  assert.equal(plan.status, 0, plan.stderr);
  writeFileSync(join(dir, "plan.json"), plan.stdout);
  const r = spawnSync("php", [join(root, "adapters/php/keylang_trace.php"), "run.php"], { cwd: dir, encoding: "utf8", env: { ...process.env, KEYLANG_TRACE: ".keylang/trace/crunch.jsonl", KEYLANG_TRACE_PLAN: "plan.json", KEYLANG_TRACE_TEST: "run.php > @flow crunch" }, timeout: 60_000 });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "4\n");
  const all = events(dir, "crunch.jsonl");
  const starts = all.filter((e) => e.event === "start");
  assert.equal(new Set(starts.map((e) => e.spanId)).size, starts.length, `span ids repeat: ${JSON.stringify(starts)}`);
  assert.equal(new Set(all.filter((e) => e.event === "run").map((e) => e.clockId)).size, 2, JSON.stringify(all));
  const c = check(dir);
  assert.notEqual(c.status, 2, c.stderr);
  assert.equal(traceOf(c.rows, "app.Work.Work.crunch"), "ok: ok app.Work.Work.crunch: observed in run.php > @flow crunch");
});

// ---------- relative KEYLANG_TRACE / KEYLANG_TRACE_PLAN and a program that changes its directory ----------

test("trace adapter: a relative KEYLANG_TRACE is the startup directory's, even after process.chdir(); children get it absolute", (t) => {
  const dir = repo(t, JS_LAYERS, {
    "src/app/main.ts": 'export function step(): number {\n  return 1;\n}\nexport function main(): number {\n  process.chdir("work");\n  console.log(process.env.KEYLANG_TRACE);\n  return step();\n}\n',
    "work/.keep": "",
    "keylang/flows/f.md": "# flow f\n\n- trigger app.main.main\n  - step app.main.step\n",
  });
  snapshotOf(dir);
  writeFileSync(join(dir, "run.mjs"), "const m = await import('./src/app/main.ts'); m.main();");
  const env: Record<string, string | undefined> = { ...process.env, KEYLANG_TRACE: ".keylang/trace/f.jsonl", KEYLANG_TRACE_FLOW: "f", KEYLANG_TRACE_TEST: "t" };
  delete env.KEYLANG_TRACE_RUN;
  delete env.KEYLANG_TRACE_ROOT;
  const r = spawnSync(process.execPath, ["--import", adapter, "run.mjs"], { cwd: dir, encoding: "utf8", env, timeout: 60_000 });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), join(realpathOrSelf(dir), ".keylang/trace/f.jsonl"));
  assert.equal(existsSync(join(dir, "work/.keylang")), false);
  const c = check(dir);
  assert.equal(traceOf(c.rows, "app.main.step"), "ok: ok app.main.step: observed in t");
});

const rustc = spawnSync("rustc", ["--version"], { encoding: "utf8" }).status === 0;

test("rust: relative KEYLANG_TRACE and KEYLANG_TRACE_PLAN are the startup directory's, though main changes its directory before the first span", { skip: rustc ? false : "rustc is not installed" }, (t) => {
  const rust = join(root, "adapters/rust/keylang_trace.rs");
  const dir = repo(t, { languages: ["rust"], layers: { app: ["src/*.rs"] }, check: { trace: ".keylang/trace/*.jsonl" } }, {
    "Cargo.toml": '[package]\nname = "shop"\nversion = "0.1.0"\nedition = "2021"\n',
    "src/main.rs": `#[path = ${JSON.stringify(rust)}]
mod keylang_trace;

fn checkout() {
    let _span = keylang_trace::span("app.main.checkout");
}

fn main() {
    std::env::set_current_dir("work").unwrap();
    checkout();
    keylang_trace::finish();
}
`,
    "work/.keep": "",
    "keylang/flows.md": "# flow checkout\n\n- trigger app.main.checkout\n",
  });
  const plan = keylang(dir, ["trace-plan", "checkout"]);
  assert.equal(plan.status, 0, plan.stderr);
  writeFileSync(join(dir, "plan.json"), plan.stdout);
  const build = spawnSync("rustc", ["--edition", "2021", "-A", "warnings", "-o", join(dir, "shop"), "src/main.rs"], { cwd: dir, encoding: "utf8" });
  assert.equal(build.status, 0, build.stderr);
  const env: Record<string, string | undefined> = { ...process.env, KEYLANG_TRACE: ".keylang/trace/checkout.jsonl", KEYLANG_TRACE_PLAN: "plan.json", KEYLANG_TRACE_TEST: "shop > @flow checkout" };
  delete env.KEYLANG_TRACE_ROOT;
  const exec = spawnSync(join(dir, "shop"), [], { cwd: dir, encoding: "utf8", env });
  assert.equal(exec.status, 0, exec.stderr);
  assert.equal(existsSync(join(dir, "work/.keylang")), false);
  const c = check(dir);
  assert.equal(traceOf(c.rows, "app.main.checkout"), "ok: ok app.main.checkout: observed in shop > @flow checkout");
});

test("python: a relative KEYLANG_TRACE is the startup directory's, though the script calls os.chdir()", { skip: python3 ? false : "python3 is not installed" }, (t) => {
  const r = pythonRun(t, '    os.chdir(os.path.dirname(os.path.abspath(__file__)))\n    print(os.environ["KEYLANG_TRACE"])\n    return crunch(2)\n');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, `${join(realpathOrSelf(r.dir), ".keylang/trace/crunch.jsonl")}\n4\n`);
  assert.equal(existsSync(join(r.dir, "app/.keylang")), false);
  assert.equal(traceOf(check(r.dir).rows, "app.work.crunch"), "ok: ok app.work.crunch: observed in run.py > @flow crunch");
});

test("php: a relative KEYLANG_TRACE is the startup directory's, though the script changes its directory", { skip: php.status === 0 ? false : "php is not installed" }, (t) => {
  const dir = repo(t, { languages: ["php"], layers: { domain: ["src/Domain/**"] }, exclude: ["run.php"], check: { trace: ".keylang/trace/*.jsonl" } }, {
    "src/Domain/Order.php": "<?php\nnamespace Shop\\Domain;\n\nfunction total(): int\n{\n    return 3;\n}\n",
    "run.php": "<?php\nrequire __DIR__ . '/src/Domain/Order.php';\nchdir(__DIR__ . '/work');\necho getenv('KEYLANG_TRACE'), \"\\n\";\nShop\\Domain\\total();\n",
    "work/.keep": "",
    "keylang/flows.md": "# flow sum\n\n- trigger domain.Order.total\n",
  });
  const plan = keylang(dir, ["trace-plan", "sum"]);
  assert.equal(plan.status, 0, plan.stderr);
  writeFileSync(join(dir, "plan.json"), plan.stdout);
  const env: Record<string, string | undefined> = { ...process.env, KEYLANG_TRACE: ".keylang/trace/sum.jsonl", KEYLANG_TRACE_PLAN: "plan.json", KEYLANG_TRACE_TEST: "run.php > @flow sum" };
  delete env.KEYLANG_TRACE_ROOT;
  const r = spawnSync("php", [join(root, "adapters/php/keylang_trace.php"), "run.php"], { cwd: dir, encoding: "utf8", env });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), join(realpathOrSelf(dir), ".keylang/trace/sum.jsonl"));
  assert.equal(existsSync(join(dir, "work/.keylang")), false);
  assert.equal(traceOf(check(dir).rows, "domain.Order.total"), "ok: ok domain.Order.total: observed in run.php > @flow sum");
});

/** The directory as a process started in it sees it (`/tmp` may be a link). */
function realpathOrSelf(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}
