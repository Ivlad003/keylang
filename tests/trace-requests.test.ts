// Trace on real requests (ticket business-flows/19): a plan of an entry point
// (`trace-plan --entry`), request-scoped runs in every adapter (a request names
// its flow, and its spans are a run of that flow of their own), and a flow
// drafted from what a run observed (`draft flow --from-trace`).

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
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
  const dir = mkdtempSync(join(tmpdir(), "keylang-trace-requests-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "keylang.json"), `${JSON.stringify(config, null, 2)}\n`);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

interface JsonResult {
  criterion: string;
  area: string;
  verdict: string;
  evidence: string;
}

function check(dir: string): { status: number | null; rows: JsonResult[]; stderr: string } {
  const o = keylang(dir, ["check", "--format", "json"]);
  if (!o.stdout.startsWith("{")) return { status: o.status, rows: [], stderr: o.stderr };
  return { status: o.status, rows: (JSON.parse(o.stdout) as { results: JsonResult[] }).results, stderr: o.stderr };
}

/** `verdict: evidence` of the `criterion` line of `id`, so a failed assertion shows what came instead. */
const lineOf = (rows: JsonResult[], criterion: string, id: string): string => {
  const r = rows.find((row) => row.criterion === criterion && row.area === id);
  return r ? `${r.verdict}: ${r.evidence}` : "none";
};

interface Event {
  event: string;
  runId: string;
  testId: string;
  flow: string;
  clockId?: string;
  spanId?: string;
  parentSpanId?: string | null;
  symbolId?: string;
  complete?: boolean;
}

function events(file: string): Event[] {
  return readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as Event);
}

/** Each run of the file (by run id): its flow, test id, the symbols its spans name, and its `run` records. */
function runsOf(all: Event[]): Map<string, { flow: string; testId: string; symbols: string[]; records: Event[] }> {
  const runs = new Map<string, { flow: string; testId: string; symbols: string[]; records: Event[] }>();
  for (const e of all) {
    const run = runs.get(e.runId) ?? { flow: e.flow, testId: e.testId, symbols: [], records: [] };
    assert.equal(run.flow, e.flow, `run ${e.runId} mixes flows`);
    if (e.event === "start") run.symbols.push(e.symbolId!);
    if (e.event === "run") run.records.push(e);
    runs.set(e.runId, run);
  }
  return runs;
}

/** The plan of entry `id` (`trace-plan --entry`), written to `plan.json`; its symbol ids. */
function entryPlan(dir: string, id: string, name?: string): { flow: string; ids: string[] } {
  const plan = keylang(dir, ["trace-plan", "--entry", id, ...(name ? ["--name", name] : [])]);
  assert.equal(plan.status, 0, plan.stderr);
  writeFileSync(join(dir, "plan.json"), plan.stdout);
  const parsed = JSON.parse(plan.stdout) as { schemaVersion: number; flow: string; symbols: { id: string }[] };
  assert.equal(parsed.schemaVersion, 1);
  return { flow: parsed.flow, ids: parsed.symbols.map((s) => s.id) };
}

const FLOWS = {
  "keylang/flows/buy.md": "# flow buy\n\n- trigger app.shop.buy\n  - step app.shop.charge\n",
  "keylang/flows/refund.md": "# flow refund\n\n- trigger app.shop.refund\n  - step app.shop.credit\n",
};

// ---------- trace-plan --entry ----------

/** A TS repository whose `main` reaches `charge` only through a value: the static graph has a hole there. */
const VALUE_CALL = {
  "src/app/pay.ts": "export function charge(total: number): number {\n  return total * 2;\n}\nexport function refund(total: number): number {\n  return -total;\n}\n",
  "src/app/main.ts":
    'import { charge, refund } from "./pay.ts";\nconst handlers: Record<string, (n: number) => number> = { charge, refund };\nexport function validate(n: number): number {\n  return n;\n}\nexport function unused(): number {\n  return 0;\n}\nexport function main(kind: string): number {\n  const total = validate(3);\n  const handler = handlers[kind]!;\n  return handler(total);\n}\n',
};
const JS = { languages: ["typescript", "javascript"], layers: { app: "src/app/**" }, exclude: ["run.mjs"], check: { trace: ".keylang/trace/*.jsonl" } };

test("trace-plan --entry: the fns an entry reaches, with the values a call it cannot resolve may run; same JSON as a flow's plan", (t) => {
  const dir = repo(t, JS, VALUE_CALL);
  // `handler(total)` is a call through a value: `charge` and `refund`, read as values in main.ts, are in the plan.
  assert.deepEqual(entryPlan(dir, "app.main.main"), { flow: "main", ids: ["app.main.main", "app.main.validate", "app.pay.charge", "app.pay.refund"] });
  assert.equal(entryPlan(dir, "app.main.main", "checkout").flow, "checkout");
  // A fn with no call it cannot resolve reaches only what it calls.
  assert.deepEqual(entryPlan(dir, "app.main.validate").ids, ["app.main.validate"]);
  const plan = JSON.parse(readFileSync(join(dir, "plan.json"), "utf8")) as Record<string, unknown>;
  assert.deepEqual(Object.keys(plan), ["schemaVersion", "snapshotId", "flow", "symbols"]);

  const unknown = keylang(dir, ["trace-plan", "--entry", "app.main.nope"]);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /`app\.main\.nope` is not a fn of the snapshot/);
  const both = keylang(dir, ["trace-plan", "buy", "--entry", "app.main.main"]);
  assert.equal(both.status, 2);
  assert.match(both.stderr, /give a flow or --entry <id>, not both/);
});

// ---------- the TS/JS adapter: withFlow ----------

test("trace adapter: a server's two concurrent requests of two flows are two runs, their spans not mixed; check proves both flows", async (t) => {
  const dir = repo(t, JS, {
    "src/app/shop.ts": [
      "const tick = (): Promise<void> => new Promise((done) => setTimeout(done, 30));",
      "export function charge(): number {",
      "  return 1;",
      "}",
      "export function credit(): number {",
      "  return 2;",
      "}",
      "export async function buy(): Promise<number> {",
      "  await tick();",
      "  return charge();",
      "}",
      "export async function refund(): Promise<number> {",
      "  await tick();",
      "  return credit();",
      "}",
      "export async function handle(path: string): Promise<number> {",
      '  return path === "/buy" ? buy() : refund();',
      "}",
      "",
    ].join("\n"),
    ...FLOWS,
  });
  assert.deepEqual(entryPlan(dir, "app.shop.handle", "server").ids, ["app.shop.buy", "app.shop.charge", "app.shop.credit", "app.shop.handle", "app.shop.refund", "app.shop.tick"]);
  // The server names each request's flow from its header; the client sends both requests at once.
  writeFileSync(
    join(dir, "run.mjs"),
    [
      "import { createServer } from 'node:http';",
      `import { withFlow } from ${JSON.stringify(adapter)};`,
      "const { handle } = await import('./src/app/shop.ts');",
      "const server = createServer((req, res) => {",
      "  void withFlow(req.headers['x-keylang-flow'], async () => res.end(String(await handle(req.url))), `${req.method} ${req.url}`);",
      "});",
      "await new Promise((done) => server.listen(0, '127.0.0.1', done));",
      "const url = `http://127.0.0.1:${server.address().port}`;",
      "const answers = await Promise.all([",
      "  fetch(`${url}/buy`, { headers: { 'x-keylang-flow': 'buy' } }).then((r) => r.text()),",
      "  fetch(`${url}/refund`, { headers: { 'x-keylang-flow': 'refund' } }).then((r) => r.text()),",
      "]);",
      "console.log(answers.join(' '));",
      "server.close();",
      "",
    ].join("\n"),
  );
  const env: Record<string, string | undefined> = { ...process.env, KEYLANG_TRACE: ".keylang/trace/server.jsonl", KEYLANG_TRACE_PLAN: "plan.json" };
  for (const name of ["KEYLANG_TRACE_RUN", "KEYLANG_TRACE_TEST", "KEYLANG_TRACE_FLOW", "KEYLANG_FLOW"]) delete env[name];
  const r = spawnSync(process.execPath, ["--import", adapter, "run.mjs"], { cwd: dir, encoding: "utf8", env, timeout: 60_000 });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "1 2\n");
  const all = events(join(dir, ".keylang/trace/server.jsonl"));
  const runs = runsOf(all);
  // Two runs, one per request; the server's own process records none, since every span was a request's.
  assert.deepEqual([...runs.values()].map((run) => [run.flow, run.testId, run.symbols.sort(), run.records.length]).sort(), [
    ["buy", "GET /buy", ["app.shop.buy", "app.shop.charge", "app.shop.handle", "app.shop.tick"], 1],
    ["refund", "GET /refund", ["app.shop.credit", "app.shop.handle", "app.shop.refund", "app.shop.tick"], 1],
  ]);
  // The requests overlapped: the second started before the first ended.
  const starts = all.filter((e) => e.event === "start" && e.symbolId === "app.shop.handle");
  const firstEnd = all.findIndex((e) => e.event === "end" && e.spanId === starts[0]!.spanId);
  assert.ok(all.indexOf(starts[1]!) < firstEnd, "the requests did not overlap");
  for (const run of runs.values()) assert.equal(run.records[0]!.complete, true);
  const c = check(dir);
  assert.notEqual(c.status, 2, c.stderr);
  assert.equal(lineOf(c.rows, "trace", "app.shop.charge"), "ok: ok app.shop.charge: observed in GET /buy");
  assert.equal(lineOf(c.rows, "trace", "app.shop.credit"), "ok: ok app.shop.credit: observed in GET /refund");
});

// ---------- draft flow --from-trace ----------

test("draft flow --from-trace: a step the static graph cannot see (a call through a value) is drafted with the trace marker, and check proves it by trace", (t) => {
  const dir = repo(t, JS, VALUE_CALL);
  entryPlan(dir, "app.main.main");
  writeFileSync(join(dir, "run.mjs"), "const { main } = await import('./src/app/main.ts');\nmain(process.argv[2]);\n");
  const record = (kind: string, test: string): void => {
    const env: Record<string, string | undefined> = { ...process.env, KEYLANG_TRACE: ".keylang/trace/checkout.jsonl", KEYLANG_TRACE_PLAN: "plan.json", KEYLANG_FLOW: "checkout", KEYLANG_TRACE_TEST: test };
    for (const name of ["KEYLANG_TRACE_RUN", "KEYLANG_TRACE_FLOW"]) delete env[name];
    const r = spawnSync(process.execPath, ["--import", adapter, "run.mjs", kind], { cwd: dir, encoding: "utf8", env, timeout: 60_000 });
    assert.equal(r.status, 0, r.stderr);
  };
  record("charge", "pay by card");
  const drafted = keylang(dir, ["draft", "flow", "--from-trace", ".keylang/trace/checkout.jsonl", "--print"]);
  assert.equal(drafted.status, 0, drafted.stderr);
  // Nesting from the spans, order from their starts; `charge` ran through `handler(total)`, which static cannot follow.
  const flow = "# flow checkout\n\n- trigger app.main.main\n  - step app.main.validate\n  - step app.pay.charge <!-- keylang:trace via observed -->\n";
  assert.equal(drafted.stdout, flow);
  // Without --print the draft is a proposal, as `draft flow` writes one.
  const proposed = keylang(dir, ["draft", "flow", "--from-trace", ".keylang/trace/checkout.jsonl"]);
  assert.equal(proposed.status, 0, proposed.stderr);
  assert.match(proposed.stdout, /^\.keylang\/proposals\/keylang\/flows\/checkout\.md: proposed flow `checkout` for keylang\/flows\/checkout\.md \(3 step\(s\)\)/);
  assert.equal(readFileSync(join(dir, ".keylang/proposals/keylang/flows/checkout.md"), "utf8"), flow);

  // The person keeps the draft: static cannot prove the step, the trace does.
  mkdirSync(join(dir, "keylang/flows"), { recursive: true });
  writeFileSync(join(dir, "keylang/flows/checkout.md"), flow);
  const c = check(dir);
  assert.notEqual(c.status, 2, c.stderr);
  assert.match(lineOf(c.rows, "static", "app.pay.charge"), /^unverified: /);
  assert.equal(lineOf(c.rows, "trace", "app.pay.charge"), "ok: ok app.pay.charge: observed in pay by card");

  // A second run in the file: the draft needs --run, and the error lists the runs.
  record("refund", "refund");
  const ambiguous = keylang(dir, ["draft", "flow", "--from-trace", ".keylang/trace/checkout.jsonl", "--print"]);
  assert.equal(ambiguous.status, 2);
  assert.match(ambiguous.stderr, /has 2 runs; name one with --run: .*\(flow checkout, pay by card, 3 span\(s\)\); .*\(flow checkout, refund, 3 span\(s\)\)/);
  const second = events(join(dir, ".keylang/trace/checkout.jsonl")).find((e) => e.testId === "refund")!.runId;
  const picked = keylang(dir, ["draft", "flow", "--from-trace", ".keylang/trace/checkout.jsonl", "--run", second, "--name", "give-back", "--print"]);
  assert.equal(picked.status, 0, picked.stderr);
  assert.equal(picked.stdout, "# flow give-back\n\n- trigger app.main.main\n  - step app.main.validate\n  - step app.pay.refund <!-- keylang:trace via observed -->\n");
  const missing = keylang(dir, ["draft", "flow", "--from-trace", ".keylang/trace/checkout.jsonl", "--run", "nope", "--print"]);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /no run `nope` with spans/);
  const mixed = keylang(dir, ["draft", "flow", "app.main.main", "--from-trace", ".keylang/trace/checkout.jsonl"]);
  assert.equal(mixed.status, 2);
  assert.match(mixed.stderr, /give a trigger or --from-trace <file\.jsonl>, not both/);
});

// ---------- the Python adapter: keylang_trace.flow() ----------

const python3 = spawnSync("python3", ["--version"], { encoding: "utf8" }).status === 0;

test("python: keylang_trace.flow() on two threads at once makes two runs of two flows, their spans not mixed", { skip: python3 ? false : "python3 is not installed" }, (t) => {
  const dir = repo(t, { languages: ["python"], layers: { app: ["app/**"] }, exclude: ["run.py", "cli.py"], check: { trace: ".keylang/trace/*.jsonl" } }, {
    "app/__init__.py": "",
    "app/shop.py":
      "def charge():\n    return 1\n\n\ndef credit():\n    return 2\n\n\ndef buy(barrier):\n    barrier.wait()\n    return charge()\n\n\ndef refund(barrier):\n    barrier.wait()\n    return credit()\n\n\ndef handle(kind, barrier):\n    return buy(barrier) if kind == \"buy\" else refund(barrier)\n",
    // Both requests hold their trigger open until the other has started: the spans interleave in time.
    "run.py": [
      "import threading",
      "",
      "import keylang_trace",
      "from app.shop import handle",
      "",
      "barrier = threading.Barrier(2)",
      "answers = {}",
      "",
      "",
      "def serve(kind):",
      "    with keylang_trace.flow(kind, test=f\"POST /{kind}\"):",
      "        answers[kind] = handle(kind, barrier)",
      "",
      "",
      "threads = [threading.Thread(target=serve, args=(kind,)) for kind in (\"buy\", \"refund\")]",
      "for thread in threads:",
      "    thread.start()",
      "for thread in threads:",
      "    thread.join()",
      "print(answers[\"buy\"], answers[\"refund\"])",
      "",
    ].join("\n"),
    ...FLOWS,
  });
  entryPlan(dir, "app.shop.handle", "server");
  const env: Record<string, string | undefined> = { ...process.env, KEYLANG_TRACE: ".keylang/trace/server.jsonl", KEYLANG_TRACE_PLAN: "plan.json" };
  for (const name of ["KEYLANG_TRACE_RUN", "KEYLANG_TRACE_TEST", "KEYLANG_FLOW"]) delete env[name];
  const r = spawnSync("python3", [join(root, "adapters/python/keylang_trace.py"), "run.py"], { cwd: dir, encoding: "utf8", env, timeout: 60_000 });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "1 2\n");
  const runs = runsOf(events(join(dir, ".keylang/trace/server.jsonl")));
  assert.deepEqual([...runs.values()].map((run) => [run.flow, run.testId, run.symbols.sort(), run.records.map((e) => e.complete)]).sort(), [
    ["buy", "POST /buy", ["app.shop.buy", "app.shop.charge", "app.shop.handle"], [true]],
    ["refund", "POST /refund", ["app.shop.credit", "app.shop.handle", "app.shop.refund"], [true]],
  ]);
  const c = check(dir);
  assert.notEqual(c.status, 2, c.stderr);
  assert.equal(lineOf(c.rows, "trace", "app.shop.charge"), "ok: ok app.shop.charge: observed in POST /buy");
  assert.equal(lineOf(c.rows, "trace", "app.shop.credit"), "ok: ok app.shop.credit: observed in POST /refund");

  // KEYLANG_FLOW names the flow of a whole process (a command, not a server).
  rmSync(join(dir, ".keylang/trace"), { recursive: true, force: true });
  writeFileSync(join(dir, "cli.py"), "import threading\n\nfrom app.shop import buy\n\nprint(buy(threading.Barrier(1)))\n");
  const cli = spawnSync("python3", [join(root, "adapters/python/keylang_trace.py"), "cli.py"], { cwd: dir, encoding: "utf8", env: { ...env, KEYLANG_FLOW: "buy" }, timeout: 60_000 });
  assert.equal(cli.status, 0, cli.stderr);
  const one = [...runsOf(events(join(dir, ".keylang/trace/server.jsonl"))).values()];
  assert.deepEqual(one.map((run) => [run.flow, run.testId]), [["buy", "python3 cli.py"]]);
  assert.equal(lineOf(check(dir).rows, "trace", "app.shop.charge"), "ok: ok app.shop.charge: observed in python3 cli.py");
});

// ---------- the Rust adapter: keylang_trace::flow() ----------

const rustc = spawnSync("rustc", ["--version"], { encoding: "utf8" }).status === 0;

test("rust: keylang_trace::flow() on two threads at once makes two runs of two flows, their spans not mixed", { skip: rustc ? false : "rustc is not installed" }, (t) => {
  const rust = join(root, "adapters/rust/keylang_trace.rs");
  const dir = repo(t, { languages: ["rust"], layers: { app: ["src/*.rs"] }, check: { trace: ".keylang/trace/*.jsonl" } }, {
    "Cargo.toml": '[package]\nname = "shop"\nversion = "0.1.0"\nedition = "2021"\n',
    "src/main.rs": `#[path = ${JSON.stringify(rust)}]
mod keylang_trace;

use std::sync::{Arc, Barrier};

fn charge() -> u32 {
    let _span = keylang_trace::span("app.main.charge");
    1
}

fn credit() -> u32 {
    let _span = keylang_trace::span("app.main.credit");
    2
}

fn buy(barrier: &Barrier) -> u32 {
    let _span = keylang_trace::span("app.main.buy");
    barrier.wait();
    charge()
}

fn refund(barrier: &Barrier) -> u32 {
    let _span = keylang_trace::span("app.main.refund");
    barrier.wait();
    credit()
}

fn handle(kind: &str, barrier: &Barrier) -> u32 {
    let _span = keylang_trace::span("app.main.handle");
    if kind == "buy" { buy(barrier) } else { refund(barrier) }
}

fn main() {
    let barrier = Arc::new(Barrier::new(2));
    let threads: Vec<_> = ["buy", "refund"]
        .into_iter()
        .map(|kind| {
            let barrier = barrier.clone();
            std::thread::spawn(move || keylang_trace::flow(kind, || handle(kind, &barrier)))
        })
        .collect();
    let mut answers: Vec<String> = threads.into_iter().map(|t| t.join().unwrap().to_string()).collect();
    // An async handler: the run is the future's while it is polled.
    answers.push(block_on(keylang_trace::in_flow("buy", async { handle("buy", &Barrier::new(1)) })).to_string());
    println!("{}", answers.join(" "));
    keylang_trace::finish();
}

fn block_on<F: std::future::Future>(future: F) -> F::Output {
    let mut future = std::pin::pin!(future);
    let mut cx = std::task::Context::from_waker(std::task::Waker::noop());
    loop {
        if let std::task::Poll::Ready(value) = future.as_mut().poll(&mut cx) {
            return value;
        }
    }
}
`,
    "keylang/flows/buy.md": "# flow buy\n\n- trigger app.main.buy\n  - step app.main.charge\n",
    "keylang/flows/refund.md": "# flow refund\n\n- trigger app.main.refund\n  - step app.main.credit\n",
  });
  entryPlan(dir, "app.main.handle", "server");
  const build = spawnSync("rustc", ["--edition", "2021", "-A", "warnings", "-o", join(dir, "shop"), "src/main.rs"], { cwd: dir, encoding: "utf8" });
  assert.equal(build.status, 0, build.stderr);
  const env: Record<string, string | undefined> = { ...process.env, KEYLANG_TRACE: ".keylang/trace/server.jsonl", KEYLANG_TRACE_PLAN: "plan.json", KEYLANG_TRACE_TEST: "shop" };
  for (const name of ["KEYLANG_TRACE_RUN", "KEYLANG_TRACE_ROOT", "KEYLANG_FLOW"]) delete env[name];
  const exec = spawnSync(join(dir, "shop"), [], { cwd: dir, encoding: "utf8", env });
  assert.equal(exec.status, 0, exec.stderr);
  assert.equal(exec.stdout, "1 2 1\n");
  const runs = runsOf(events(join(dir, ".keylang/trace/server.jsonl")));
  assert.deepEqual([...runs.values()].map((run) => [run.flow, run.testId, run.symbols.sort(), run.records.map((e) => e.complete)]).sort(), [
    ["buy", "shop", ["app.main.buy", "app.main.charge", "app.main.handle"], [true]],
    ["buy", "shop", ["app.main.buy", "app.main.charge", "app.main.handle"], [true]],
    ["refund", "shop", ["app.main.credit", "app.main.handle", "app.main.refund"], [true]],
  ]);
  const c = check(dir);
  assert.notEqual(c.status, 2, c.stderr);
  assert.equal(lineOf(c.rows, "trace", "app.main.charge"), "ok: ok app.main.charge: observed in shop");
  assert.equal(lineOf(c.rows, "trace", "app.main.credit"), "ok: ok app.main.credit: observed in shop");
});

// ---------- PHP: a DI-like call, and the adapter as auto_prepend_file on a web server ----------

const PHP_CONFIG = { languages: ["php"], layers: { app: ["src/**"] }, exclude: ["index.php"], check: { trace: ".keylang/trace/*.jsonl" } };

/** A container hands out the payment gateway: `$gateway->capture()` is a call keylang cannot resolve, as Magento's DI is. */
const PHP_DI = {
  "src/Container.php": "<?php\nnamespace Shop;\n\nclass Container\n{\n    public function create(string $name): object\n    {\n        return new Gateway();\n    }\n}\n",
  "src/Gateway.php": "<?php\nnamespace Shop;\n\nclass Gateway\n{\n    public function capture(int $total): int\n    {\n        return $total * 2;\n    }\n}\n",
  "src/Checkout.php":
    "<?php\nnamespace Shop;\n\nclass Checkout\n{\n    public function __construct(private Container $container)\n    {\n    }\n\n    public function place(int $total): int\n    {\n        $gateway = $this->container->create('payment');\n        return $gateway->capture($total);\n    }\n}\n",
  "index.php": "<?php\nrequire __DIR__ . '/src/Container.php';\nrequire __DIR__ . '/src/Gateway.php';\nrequire __DIR__ . '/src/Checkout.php';\necho (new Shop\\Checkout(new Shop\\Container()))->place(3);\n",
};

const PHP_DRAFT = "# flow checkout\n\n- trigger app.Checkout.Checkout.place\n  - step app.Container.Container.create\n  - step app.Gateway.Gateway.capture <!-- keylang:trace via observed -->\n";

/** Static has a hole at the DI call, trace observed it: the step of the drafted flow is `trace ok`. */
function assertDiFlow(dir: string, file: string, runId: string): void {
  const drafted = keylang(dir, ["draft", "flow", "--from-trace", file, "--run", runId, "--print"]);
  assert.equal(drafted.status, 0, drafted.stderr);
  assert.equal(drafted.stdout, PHP_DRAFT);
  mkdirSync(join(dir, "keylang/flows"), { recursive: true });
  writeFileSync(join(dir, "keylang/flows/checkout.md"), PHP_DRAFT);
  const c = check(dir);
  assert.notEqual(c.status, 2, c.stderr);
  assert.match(lineOf(c.rows, "static", "app.Gateway.Gateway.capture"), /^unverified: unverified app\.Gateway\.Gateway\.capture: no resolved path from app\.Checkout\.Checkout\.place; call through a local value `gateway\.capture`/);
  assert.equal(lineOf(c.rows, "trace", "app.Gateway.Gateway.capture"), "ok: ok app.Gateway.Gateway.capture: observed in GET /index.php");
}

test("php: a DI-like call is a hole for static; the entry plan follows it by name, and a request's trace makes the drafted step trace ok", (t) => {
  const dir = repo(t, PHP_CONFIG, PHP_DI);
  const { ids } = entryPlan(dir, "app.Checkout.Checkout.place", "web");
  assert.deepEqual(ids, ["app.Checkout.Checkout.place", "app.Container.Container.create", "app.Gateway.Gateway.capture"]);
  // The events the PHP adapter writes for `GET /index.php` with `X-Keylang-Flow: checkout`, as JSONL schema 1.
  const { snapshotId } = JSON.parse(readFileSync(join(dir, "plan.json"), "utf8")) as { snapshotId: string };
  const base = { schemaVersion: 1, snapshotId, runId: "19a.r1f2e3d4c", testId: "GET /index.php", flow: "checkout", traceId: "19a.r1f2e3d4c:GET /index.php" };
  const clock = "php-41-0a0b0c0d";
  const lines = [
    { ...base, event: "start", spanId: `${clock}:s1`, parentSpanId: null, symbolId: "app.Checkout.Checkout.place", clockId: clock, seq: 1, ts: 1 },
    { ...base, event: "start", spanId: `${clock}:s2`, parentSpanId: `${clock}:s1`, symbolId: "app.Container.Container.create", clockId: clock, seq: 2, ts: 2 },
    { ...base, event: "end", spanId: `${clock}:s2`, outcome: "ok", clockId: clock, seq: 3, ts: 3 },
    { ...base, event: "start", spanId: `${clock}:s3`, parentSpanId: `${clock}:s1`, symbolId: "app.Gateway.Gateway.capture", clockId: clock, seq: 4, ts: 4 },
    { ...base, event: "end", spanId: `${clock}:s3`, outcome: "ok", clockId: clock, seq: 5, ts: 5 },
    { ...base, event: "end", spanId: `${clock}:s1`, outcome: "ok", clockId: clock, seq: 6, ts: 6 },
    { ...base, event: "run", clockId: clock, complete: true, dropped: 0, instrumented: ids, open: [] },
  ];
  mkdirSync(join(dir, ".keylang/trace"), { recursive: true });
  writeFileSync(join(dir, ".keylang/trace/web.jsonl"), `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);
  assertDiFlow(dir, ".keylang/trace/web.jsonl", base.runId);
});

const php = spawnSync("php", ["--version"], { encoding: "utf8" }).status === 0;

test("php: on a web server (auto_prepend_file), a request that names its flow by header or cookie is a run of that flow; one that names none records nothing", { skip: php ? false : "php is not installed" }, async (t) => {
  const dir = repo(t, PHP_CONFIG, PHP_DI);
  entryPlan(dir, "app.Checkout.Checkout.place", "web");
  const port = 20000 + Math.floor(Math.random() * 20000);
  const server = spawn("php", ["-d", `auto_prepend_file=${join(root, "adapters/php/keylang_trace.php")}`, "-S", `127.0.0.1:${port}`, "-t", dir], {
    cwd: dir,
    env: { ...process.env, KEYLANG_TRACE: join(dir, ".keylang/trace/web.jsonl"), KEYLANG_TRACE_PLAN: join(dir, "plan.json"), KEYLANG_TRACE_ROOT: dir, KEYLANG_TRACE_TEST: "", KEYLANG_FLOW: "" },
    stdio: "ignore",
  });
  t.after(() => server.kill());
  const url = `http://127.0.0.1:${port}/index.php`;
  // Requests that name no flow (these, until the server answers) record nothing.
  for (let i = 0; ; i++) {
    try {
      assert.equal(await (await fetch(url)).text(), "6");
      break;
    } catch (e) {
      if (i > 100) throw e;
      await new Promise((done) => setTimeout(done, 100));
    }
  }
  assert.equal(await (await fetch(url, { headers: { "X-Keylang-Flow": "checkout" } })).text(), "6");
  assert.equal(await (await fetch(url, { headers: { Cookie: "X-Keylang-Flow=checkout" } })).text(), "6");
  const all = events(join(dir, ".keylang/trace/web.jsonl"));
  const runs = [...runsOf(all).values()];
  const place = ["app.Checkout.Checkout.place", "app.Container.Container.create", "app.Gateway.Gateway.capture"];
  assert.deepEqual(runs.map((run) => [run.flow, run.testId, run.symbols, run.records.map((e) => e.complete)]), [
    ["checkout", "GET /index.php", place, [true]],
    ["checkout", "GET /index.php", place, [true]],
  ]);
  assertDiFlow(dir, ".keylang/trace/web.jsonl", all[0]!.runId);
});
