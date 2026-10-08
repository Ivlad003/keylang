// Asynchronous flows (ADR 0023, business-flows/17–18) through the real CLI:
// `parallel` groups (static from the group's parent, trace in any order with
// the neighbours ordered against the whole group), `trigger route|cron|
// consumer|webhook <id>` against the snapshot's entry points, `continues`, and
// the timers `after` / `every`; their K-codes, `fmt` and `flows discover`.
// TypeScript and Python fixtures; `every` against a cron entry point, which
// no adapter of the repository reports yet, through `evaluateFlows` itself.

import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { analyze } from "../src/analyze.ts";
import { checkResults } from "../src/check-results.ts";
import { diagramOf } from "../src/diagram.ts";
import { evaluateFlows, type FlowInput } from "../src/flows.ts";
import { parse } from "../src/parser.ts";
import { check } from "../src/resolve.ts";
import { compileSpec } from "../src/spec-ir.ts";
import { evidenceOf, totals } from "../src/tui/evidence.ts";
import { keylang, tempDir, writeTree } from "./cli-helpers.ts";

/** An Express-style app: `POST /orders` runs `placeOrder`, `POST /webhooks/payment` runs `paid` (literal routes, business-flows/09). */
const SHOP: Record<string, string> = {
  "keylang.json": JSON.stringify({ languages: ["typescript"], module: "file", layers: { app: ["src/app/**"] } }),
  "src/app/handlers.ts": [
    "export function reserve(): void {}",
    "export function mail(): void {}",
    "export function erp(): void {}",
    "export function confirm(): void {}",
    "export function refund(): void {}",
    "",
  ].join("\n"),
  "src/app/server.ts": [
    'import { confirm, erp, mail, reserve } from "./handlers.ts";',
    "const app = { post: (_p: string, ..._h: unknown[]) => 0 };",
    "export function placeOrder(): void {",
    "  reserve();",
    "  erp();",
    "  mail();",
    "  confirm();",
    "}",
    "export function paid(): void {",
    "  confirm();",
    "}",
    "export function sweep(): void {}",
    'app.post("/orders", placeOrder);',
    'app.post("/webhooks/payment", paid);',
    "",
  ].join("\n"),
};

const PLACE_ORDER = [
  "# flow place-order",
  "",
  "- trigger route app.server.placeOrder",
  "- parallel",
  "  - step app.handlers.reserve",
  "  - step app.handlers.mail",
  "  - step app.handlers.erp",
  "- step app.handlers.confirm",
  "",
].join("\n");

const PAYMENT = ["# flow payment", "", "- continues place-order", "- trigger route app.server.paid", "- step app.handlers.confirm", ""].join("\n");

interface Row {
  criterion: string;
  area: string;
  verdict: string;
  evidence: string;
  file: string;
  line: number;
  provenance?: string;
}

function repo(t: { after: (fn: () => void) => void }, flows: Record<string, string>, check: object = {}, files: Record<string, string> = SHOP): string {
  const dir = tempDir(t, "keylang-async-");
  const config = { ...(JSON.parse(files["keylang.json"]!) as object), check };
  writeTree(dir, { ...files, "keylang.json": JSON.stringify(config), ...Object.fromEntries(Object.entries(flows).map(([path, text]) => [`keylang/flows/${path}`, text])) });
  return dir;
}

function snapshotOf(dir: string): string {
  const run = keylang(dir, ["map"]);
  assert.equal(run.status, 0, run.stderr);
  return (JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as { snapshotId: string }).snapshotId;
}

function results(dir: string): { status: number | null; rows: Row[]; diagnostics: { code: string; message: string; line: number; col: number }[] } {
  const o = keylang(dir, ["check", "--format", "json"]);
  assert.ok(o.stdout.startsWith("{"), o.stdout + o.stderr);
  const rows = (JSON.parse(o.stdout) as { results: (Row & { col: number })[] }).results;
  const diagnostics = rows.filter((r) => /^K\d{3}$/.test(r.criterion)).map((r) => ({ code: r.criterion, message: r.evidence, line: r.line, col: r.col }));
  return { status: o.status, rows, diagnostics };
}

const row = (rows: Row[], criterion: string, area: string): Row | undefined => rows.find((r) => r.criterion === criterion && r.area === area);

// ---------- K-codes ----------

test("async flows: unknown trigger kind, bad timers, an empty parallel and continues to a missing flow are K-codes at their words", (t) => {
  const flow = [
    "# flow broken",
    "",
    "- trigger queue app.server.placeOrder",
    "- continues nowhere",
    "- continues place-ordr",
    "- parallel",
    "- parallel",
    "  - ? which first?",
    "- step app.handlers.confirm",
    "  - after soon",
    "  - after 30",
    "  - every day",
    "  - every 0 * * *",
    "- parallel now",
    "  - step app.handlers.mail",
    "",
  ].join("\n");
  const dir = repo(t, { "place.md": PLACE_ORDER, "broken.md": flow });
  const o = keylang(dir, ["check"]);
  assert.equal(o.status, 1, o.stdout);
  const at = (line: number, col: number, code: string, text: string): void => {
    const pattern = new RegExp(`^keylang/flows/broken\\.md:${line}:${col}: ${code} ${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "m");
    assert.match(o.stdout, pattern, o.stdout);
  };
  at(3, 11, "K005", "unknown trigger kind `queue`; expected one of: route, cron, consumer, webhook");
  at(4, 13, "K206", "`continues` names flow `nowhere`, which no `# flow` declares");
  at(5, 13, "K206", "`continues` names flow `place-ordr`, which no `# flow` declares (did you mean `place-order`?)");
  at(6, 3, "K009", "`parallel` has no steps");
  at(7, 3, "K009", "`parallel` has no steps");
  at(8, 5, "K004", "unknown keyword `?` here; expected one of: step");
  at(10, 11, "K005", "expected `after <duration>`");
  at(11, 11, "K005", "expected `after <duration>`");
  at(12, 11, "K005", "expected `every <schedule>`");
  at(13, 11, "K005", "expected `every <schedule>`");
  at(14, 12, "K005", "`parallel` takes no arguments");
  // Every new word was K004 before: nothing else in the file is reported.
  assert.doesNotMatch(o.stdout, /K004 unknown keyword `(parallel|continues|after|every)`/);
  // `parse` reports the parser's codes, the compile and resolve codes need `check`.
  const parsed = JSON.parse(keylang(dir, ["parse", "--json", "keylang/flows/broken.md"]).stdout) as { diagnostics: { code: string; span: { start: { line: number; col: number } } }[] }[];
  const codes = parsed[0]!.diagnostics.map((d) => `${d.span.start.line}:${d.span.start.col} ${d.code}`);
  assert.ok(codes.includes("3:11 K005"), codes.join(", "));
  for (const code of ["K009", "K206", "K205"]) assert.equal(codes.some((c) => c.endsWith(code)), false, code);
  // `keylang explain` knows the new codes.
  for (const code of ["K009", "K205", "K206"]) {
    const explained = keylang(dir, ["explain", code]);
    assert.equal(explained.status, 0, explained.stderr);
    assert.match(explained.stdout, new RegExp(`^${code}: `));
  }
});

test("async flows: the new words are keywords only in `# flow`; elsewhere they keep their old meaning", (t) => {
  const dir = repo(t, {});
  writeTree(dir, { "keylang/rules.md": "# rules\n\n- parallel\n", "keylang/map/extra.md": "- layer app\n  - module extra\n    - every app.handlers\n" });
  const o = keylang(dir, ["check"]);
  assert.match(o.stdout, /keylang\/rules\.md:3:3: K004 unknown keyword `parallel` here/);
  // Under a module `every app.handlers` is a dependency with the alias `every`, as `test foo.bar` is (Р7).
  assert.doesNotMatch(o.stdout, /extra\.md/);
});

// ---------- parallel: static ----------

test("parallel: static — every step of the group is reached from the group's parent, a step it does not reach fails", (t) => {
  const flow = PLACE_ORDER.replace("  - step app.handlers.erp\n", "  - step app.handlers.erp\n  - step app.handlers.refund\n");
  const dir = repo(t, { "place.md": flow });
  const { status, rows } = results(dir);
  assert.equal(status, 1);
  for (const id of ["app.handlers.reserve", "app.handlers.mail", "app.handlers.erp", "app.handlers.confirm"]) {
    const r = row(rows, "static", id);
    assert.equal(r?.verdict, "ok", `${id}: ${r?.evidence}`);
    assert.match(r!.evidence, /called from app\.server\.placeOrder/);
  }
  const refund = row(rows, "static", "app.handlers.refund");
  assert.equal(refund?.verdict, "fail", refund?.evidence);
  assert.match(refund!.evidence, /absence: no call path from app\.server\.placeOrder/);
});

test("parallel: static under a nested step and in Python — the parent of the group is the step around it", (t) => {
  const files: Record<string, string> = {
    "keylang.json": JSON.stringify({ languages: ["python"], module: "file", layers: { shop: ["src/shop/**"] } }),
    "src/shop/__init__.py": "",
    "src/shop/jobs.py": "def notify() -> None:\n    pass\n\n\ndef reserve() -> None:\n    pass\n\n\ndef settle() -> None:\n    reserve()\n    notify()\n\n\ndef main() -> None:\n    settle()\n",
  };
  const flow = "# flow settle\n\n- trigger shop.jobs.main\n- step shop.jobs.settle\n  - parallel\n    - step shop.jobs.notify\n    - step shop.jobs.reserve\n";
  const dir = repo(t, { "settle.md": flow }, {}, files);
  const { status, rows } = results(dir);
  assert.equal(status, 0, JSON.stringify(rows));
  for (const id of ["shop.jobs.notify", "shop.jobs.reserve"]) {
    assert.equal(row(rows, "static", id)?.verdict, "ok", id);
    assert.match(row(rows, "static", id)!.evidence, /called from shop\.jobs\.settle/);
  }
});

// ---------- parallel: trace ----------

interface SpanSpec {
  id: string;
  symbol: string;
  parent?: string;
  start: number;
  end: number;
}

function traceRun(snapshotId: string, flow: string, spans: SpanSpec[], instrumented: string[]): string {
  const base = { schemaVersion: 1, snapshotId, runId: "r1", testId: "t1", flow, traceId: "tr" };
  const events: object[] = [];
  for (const span of spans) {
    events.push({ ...base, event: "start", spanId: span.id, parentSpanId: span.parent ?? null, symbolId: span.symbol, clockId: "c", seq: span.start, ts: 1 });
    events.push({ ...base, event: "end", spanId: span.id, outcome: "ok", clockId: "c", seq: span.end, ts: 1 });
  }
  events.push({ ...base, event: "run", complete: true, dropped: 0, instrumented });
  return `${events.map((e) => JSON.stringify(e)).join("\n")}\n`;
}

const P = "app.server.placeOrder";
const RESERVE = "app.handlers.reserve";
const MAIL = "app.handlers.mail";
const ERP = "app.handlers.erp";
const CONFIRM = "app.handlers.confirm";
const STEPS = [P, RESERVE, MAIL, ERP, CONFIRM];

function traced(t: { after: (fn: () => void) => void }, flows: Record<string, string> = { "place.md": PLACE_ORDER }): { snapshot: string; write: (text: string) => Row[]; dir: string } {
  const dir = repo(t, flows, { trace: ".keylang/trace/*.jsonl" });
  const snapshot = snapshotOf(dir);
  return {
    dir,
    snapshot,
    write: (text) => {
      mkdirSync(join(dir, ".keylang/trace"), { recursive: true });
      writeFileSync(join(dir, ".keylang/trace/t.jsonl"), text);
      return results(dir).rows;
    },
  };
}

test("parallel: trace — overlapping steps of a group are ok in any order; the next step after the whole group is ok", (t) => {
  const { snapshot, write } = traced(t);
  // `mail` starts before `reserve`, `erp` overlaps both: order inside the group is not checked.
  const spans: SpanSpec[] = [
    { id: "p", symbol: P, start: 1, end: 20 },
    { id: "m", symbol: MAIL, parent: "p", start: 2, end: 6 },
    { id: "r", symbol: RESERVE, parent: "p", start: 3, end: 5 },
    { id: "e", symbol: ERP, parent: "p", start: 4, end: 8 },
    { id: "c", symbol: CONFIRM, parent: "p", start: 9, end: 10 },
  ];
  const rows = write(traceRun(snapshot, "place-order", spans, STEPS));
  for (const id of [RESERVE, MAIL, ERP, CONFIRM]) {
    const r = row(rows, "trace", id);
    assert.equal(r?.verdict, "ok", `${id}: ${r?.evidence}`);
    assert.equal(r?.provenance, "trace");
  }
  // In sequence, reversed, is as good.
  const sequential: SpanSpec[] = [
    { id: "p", symbol: P, start: 1, end: 20 },
    { id: "e", symbol: ERP, parent: "p", start: 2, end: 3 },
    { id: "m", symbol: MAIL, parent: "p", start: 4, end: 5 },
    { id: "r", symbol: RESERVE, parent: "p", start: 6, end: 7 },
    { id: "c", symbol: CONFIRM, parent: "p", start: 8, end: 9 },
  ];
  const again = write(traceRun(snapshot, "place-order", sequential, STEPS));
  for (const id of [RESERVE, MAIL, ERP, CONFIRM]) assert.equal(row(again, "trace", id)?.verdict, "ok", id);
});

test("parallel: trace — a step of the group missing from a complete run fails; the next step before the group ends is not ordered", (t) => {
  const { snapshot, write } = traced(t);
  const missing: SpanSpec[] = [
    { id: "p", symbol: P, start: 1, end: 20 },
    { id: "r", symbol: RESERVE, parent: "p", start: 2, end: 3 },
    { id: "e", symbol: ERP, parent: "p", start: 4, end: 5 },
    { id: "c", symbol: CONFIRM, parent: "p", start: 6, end: 7 },
  ];
  const rows = write(traceRun(snapshot, "place-order", missing, STEPS));
  const mail = row(rows, "trace", MAIL);
  assert.equal(mail?.verdict, "fail", mail?.evidence);
  assert.match(mail!.evidence, /missing step in t1/);
  assert.equal(row(rows, "trace", CONFIRM)?.verdict, "ok");
  // `confirm` starts while `erp` still runs: the group has not finished.
  const early: SpanSpec[] = [
    { id: "p", symbol: P, start: 1, end: 20 },
    { id: "r", symbol: RESERVE, parent: "p", start: 2, end: 3 },
    { id: "m", symbol: MAIL, parent: "p", start: 4, end: 5 },
    { id: "e", symbol: ERP, parent: "p", start: 6, end: 9 },
    { id: "c", symbol: CONFIRM, parent: "p", start: 7, end: 8 },
  ];
  const overlap = row(write(traceRun(snapshot, "place-order", early, STEPS)), "trace", CONFIRM);
  assert.equal(overlap?.verdict, "unverified", overlap?.evidence);
  assert.match(overlap!.evidence, /starts before `app\.handlers\.erp` ends \(parallel\)/);
  // A step of the group that starts before the sibling before the group is out of order.
  const flow = "# flow place-order\n\n- trigger route app.server.placeOrder\n- step app.handlers.confirm\n- parallel\n  - step app.handlers.reserve\n  - step app.handlers.mail\n";
  const before = traced(t, { "place.md": flow });
  const spans: SpanSpec[] = [
    { id: "p", symbol: P, start: 1, end: 20 },
    { id: "r", symbol: RESERVE, parent: "p", start: 2, end: 3 },
    { id: "c", symbol: CONFIRM, parent: "p", start: 4, end: 5 },
    { id: "m", symbol: MAIL, parent: "p", start: 6, end: 7 },
  ];
  const ordered = before.write(traceRun(before.snapshot, "place-order", spans, STEPS));
  assert.equal(row(ordered, "trace", MAIL)?.verdict, "ok");
  assert.match(row(ordered, "trace", RESERVE)!.evidence, /out of order: starts before `app\.handlers\.confirm`/);
});

// ---------- triggers ----------

test("trigger route: ok on an Express literal route, with the entry's label in the verdict", (t) => {
  const dir = repo(t, { "place.md": PLACE_ORDER, "payment.md": PAYMENT });
  const { status, rows } = results(dir);
  assert.equal(status, 0, JSON.stringify(rows.filter((r) => r.verdict === "fail")));
  const place = row(rows, "static", "route app.server.placeOrder");
  assert.equal(place?.verdict, "ok", place?.evidence);
  assert.match(place!.evidence, /entry point `POST \/orders`/);
  assert.equal(place?.line, 3);
  assert.equal(row(rows, "ID", "app.server.placeOrder")?.verdict, "ok");
  assert.match(row(rows, "static", "route app.server.paid")!.evidence, /entry point `POST \/webhooks\/payment`/);
  const text = keylang(dir, ["check"]).stdout;
  assert.match(text, /keylang\/flows\/place\.md:3:1: static ok route app\.server\.placeOrder: entry point `POST \/orders`/);
});

test("trigger: a kind the entry point does not have is K205 on the kind; a fn no entry names is unverified", (t) => {
  const flow = "# flow place-order\n\n- trigger cron app.server.placeOrder\n\n# flow sweep\n\n- trigger webhook app.server.sweep\n";
  const dir = repo(t, { "place.md": flow });
  const o = keylang(dir, ["check"]);
  assert.equal(o.status, 1, o.stdout);
  assert.match(o.stdout, /^keylang\/flows\/place\.md:3:11: K205 `trigger cron` names `app\.server\.placeOrder`, which the snapshot records as an entry point of another kind: route `POST \/orders`$/m);
  assert.match(o.stdout, /keylang\/flows\/place\.md:7:1: static unverified webhook app\.server\.sweep: `app\.server\.sweep` is not an entry point the snapshot records \(`keylang entries`\); a framework's webhook entry points need its adapter/);
});

test("trigger: in Python a `main` entry point named as a route is K205; the plain trigger form is unchanged", (t) => {
  const files: Record<string, string> = {
    "keylang.json": JSON.stringify({ languages: ["python"], module: "file", layers: { shop: ["src/shop/**"] } }),
    "pyproject.toml": '[project]\nname = "shop"\n\n[project.scripts]\nshop-cli = "shop.cli:main"\n',
    "src/shop/__init__.py": "",
    "src/shop/cli.py": "def helper() -> int:\n    return 1\n\n\ndef main() -> int:\n    return helper()\n",
  };
  const dir = repo(t, { "cli.md": "# flow cli\n\n- trigger route shop.cli.main\n- step shop.cli.helper\n\n# flow plain\n\n- trigger shop.cli.main\n" }, {}, files);
  const { rows, diagnostics } = results(dir);
  const k205 = diagnostics.find((d) => d.code === "K205");
  assert.ok(k205, JSON.stringify(diagnostics));
  assert.equal(k205.line, 3);
  assert.equal(k205.col, 11);
  assert.match(k205.message, /cli `shop-cli`/);
  assert.equal(row(rows, "static", "shop.cli.helper")?.verdict, "ok");
  // A plain trigger names no kind: no entry verdict.
  assert.equal(rows.some((r) => r.area.startsWith("route ") && r.line === 8), false);
});

// ---------- continues ----------

test("continues: the other flow exists (ID ok); a trace never crosses requests", (t) => {
  const { snapshot, write } = traced(t, { "place.md": PLACE_ORDER, "payment.md": PAYMENT });
  const rows = write(traceRun(snapshot, "payment", [{ id: "p", symbol: "app.server.paid", start: 1, end: 4 }, { id: "c", symbol: CONFIRM, parent: "p", start: 2, end: 3 }], ["app.server.paid", CONFIRM]));
  const id = row(rows, "ID", "continues place-order");
  assert.equal(id?.verdict, "ok", id?.evidence);
  assert.match(id!.evidence, /flow `place-order` at keylang\/flows\/place\.md:1/);
  const trace = row(rows, "trace", "continues place-order");
  assert.equal(trace?.verdict, "unverified");
  assert.match(trace!.evidence, /crosses requests/);
  assert.equal(row(rows, "trace", CONFIRM)?.verdict, "ok");
});

// ---------- timers ----------

test("after / every: only a nested test checks a timer; every without a cron entry point is static unverified", (t) => {
  const flow = [
    "# flow payment",
    "",
    "- trigger route app.server.paid",
    "- step app.handlers.confirm",
    "  - after 30m",
    "  - after 1h",
    '    - test tests/payment.test.ts "times out"',
    "- every 15m",
    '  - test tests/payment.test.ts "sweeps"',
    "",
  ].join("\n");
  const dir = repo(t, { "payment.md": flow }, { tests: ".keylang/reports/*.json" });
  writeTree(dir, { "tests/payment.test.ts": "" });
  const snapshot = snapshotOf(dir);
  mkdirSync(join(dir, ".keylang/reports"), { recursive: true });
  const tests = [
    { file: "tests/payment.test.ts", name: "times out", status: "pass" },
    { file: "tests/payment.test.ts", name: "sweeps", status: "fail" },
  ];
  writeFileSync(join(dir, ".keylang/reports/r.json"), JSON.stringify({ schemaVersion: 1, snapshotId: snapshot, runId: "r1", tests }));
  const { rows } = results(dir);
  const bare = row(rows, "tests", "after 30m");
  assert.equal(bare?.verdict, "unverified");
  assert.match(bare!.evidence, /no test evidence: only a nested `test` checks a timer/);
  assert.equal(row(rows, "tests", "after 1h")?.verdict, "ok");
  assert.equal(row(rows, "tests", "every 15m")?.verdict, "fail");
  const every = row(rows, "static", "every 15m");
  assert.equal(every?.verdict, "unverified");
  assert.match(every!.evidence, /`app\.server\.paid` is not a cron entry point the snapshot records; only a nested `test` checks it/);
  // `after` has no static evidence at all.
  assert.equal(row(rows, "static", "after 30m"), undefined);
  // Without `check.tests` nothing asks for the tests channel.
  const quiet = repo(t, { "payment.md": flow });
  writeTree(quiet, { "tests/payment.test.ts": "" });
  assert.equal(results(quiet).rows.some((r) => r.criterion === "tests"), false);
});

function evaluate(flow: string, nodes: string[], entries: FlowInput["entries"]): ReturnType<typeof evaluateFlows> {
  const docs = [parse("keylang/flows/jobs.md", flow)];
  const { spec } = compileSpec(docs);
  const { index } = check(docs);
  const view = Object.fromEntries(nodes.map((id) => [id, { kind: "fn", file: "src/jobs.ts", line: 1 }]));
  return evaluateFlows(spec, index, { snapshotId: "s", nodes: view, edges: [], tests: null, traces: null, ...(entries ? { entries } : {}) });
}

test("every: static against a cron entry point's schedule — the same is ok, another fails, an unknown one is unverified; trigger cron/consumer", () => {
  const flow = "# flow clean\n\n- trigger cron app.jobs.clean\n- every 0 0 * * *\n- every @hourly\n- every 15m\n";
  const label = "sales_clean_quotes 0 0 * * *";
  const out = evaluate(flow, ["app.jobs.clean"], [{ kind: "cron", id: "app.jobs.clean", label, framework: "magento" }]);
  const get = (criterion: string, area: string) => out.verdicts.find((v) => v.criterion === criterion && v.area === area);
  assert.equal(get("static", "cron app.jobs.clean")?.verdict, "ok");
  assert.match(get("static", "cron app.jobs.clean")!.message, /entry point `sales_clean_quotes 0 0 \* \* \*` \(magento\)/);
  assert.equal(get("static", "every 0 0 * * *")?.verdict, "ok");
  assert.equal(get("static", "every @hourly")?.verdict, "fail");
  assert.match(get("static", "every @hourly")!.message, /runs on `0 0 \* \* \*`, not `@hourly`/);
  assert.equal(get("static", "every 15m")?.verdict, "unverified");
  assert.match(get("static", "every 15m")!.message, /does not compare/);
  // `@daily` is the same schedule as `0 0 * * *`; a quoted cron is the bare one.
  const macro = evaluate('# flow clean\n\n- trigger cron app.jobs.clean\n- every @daily\n- every "0 0 * * *"\n', ["app.jobs.clean"], [{ kind: "cron", id: "app.jobs.clean", label }]);
  assert.deepEqual(macro.verdicts.filter((v) => v.criterion === "static" && v.area.startsWith("every")).map((v) => v.verdict), ["ok", "ok"]);
  // A label without a schedule, and a snapshot without entry points.
  const silent = evaluate(flow, ["app.jobs.clean"], [{ kind: "cron", id: "app.jobs.clean", label: "sales_clean_quotes" }]);
  assert.match(silent.verdicts.find((v) => v.area === "every 0 0 * * *")!.message, /does not say its schedule/);
  const old = evaluate(flow, ["app.jobs.clean"], undefined);
  assert.match(old.verdicts.find((v) => v.area === "cron app.jobs.clean")!.message, /records no entry points/);
  const consumer = evaluate("# flow q\n\n- trigger consumer app.jobs.clean\n", ["app.jobs.clean"], [{ kind: "consumer", id: "app.jobs.clean", label: "sales.rule.update" }]);
  assert.equal(consumer.verdicts.find((v) => v.area === "consumer app.jobs.clean")?.verdict, "ok");
  const wrong = evaluate("# flow q\n\n- trigger webhook app.jobs.clean\n", ["app.jobs.clean"], [{ kind: "consumer", id: "app.jobs.clean", label: "sales.rule.update" }]);
  assert.deepEqual(wrong.diagnostics.map((d) => [d.code, d.span.start.line, d.span.start.col]), [["K205", 3, 11]]);
});

// ---------- fmt ----------

test("fmt: every new form has one canonical spelling and a second fmt changes nothing", (t) => {
  const messy = [
    "# flow   payment",
    "",
    "- continues    place-order",
    "-   trigger   webhook   app.server.paid",
    "- parallel",
    "  -   step app.handlers.reserve",
    "  - step   app.handlers.mail",
    "- step app.handlers.confirm",
    "  - after   30m",
    "  - every   0  *  *  *  *",
    '    -  test   tests/x.test.ts   "y"',
    '  - every   "0 0 * * *"',
    "- every @daily",
    "",
  ].join("\n");
  const canonical = [
    "# flow payment",
    "",
    "- continues place-order",
    "- trigger webhook app.server.paid",
    "- parallel",
    "  - step app.handlers.reserve",
    "  - step app.handlers.mail",
    "- step app.handlers.confirm",
    "  - after 30m",
    "  - every 0 * * * *",
    '    - test tests/x.test.ts "y"',
    '  - every "0 0 * * *"',
    "- every @daily",
    "",
  ].join("\n");
  const dir = repo(t, { "payment.md": messy, "place.md": PLACE_ORDER });
  const path = "keylang/flows/payment.md";
  assert.equal(keylang(dir, ["fmt", "--check", path]).status, 1);
  const first = keylang(dir, ["fmt", path]);
  assert.equal(first.status, 0, first.stdout + first.stderr);
  assert.equal(readFileSync(join(dir, path), "utf8"), canonical);
  assert.equal(keylang(dir, ["fmt", "--check", path]).status, 0);
  // The verdicts do not change with the spelling.
  writeFileSync(join(dir, path), messy);
  const before = results(dir).rows.map((r) => `${r.criterion} ${r.area} ${r.verdict}`);
  writeFileSync(join(dir, path), canonical);
  assert.deepEqual(results(dir).rows.map((r) => `${r.criterion} ${r.area} ${r.verdict}`), before);
});

// ---------- flows discover ----------

test("flows discover: an entry point of kind route, cron, consumer or webhook is written as a typed trigger", (t) => {
  const dir = repo(t, {});
  const run = keylang(dir, ["flows", "discover", "--print"]);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^- trigger route app\.server\.placeOrder$/m);
  assert.match(run.stdout, /^- trigger route app\.server\.paid$/m);
  // The view is a draft `check` would accept: written into flows/ it gives the entry verdict.
  const adopted = run.stdout.split(/(?=^# flow )/m).find((part) => part.startsWith("# flow placeOrder"))!;
  writeTree(dir, { "keylang/flows/place.md": adopted });
  assert.equal(row(results(dir).rows, "static", "route app.server.placeOrder")?.verdict, "ok");
});

// ---------- gutter ----------

test("gutter: a parallel line shows the worst mark of its steps and is not counted as a line of its own", async (t) => {
  const flow = PLACE_ORDER.replace("  - step app.handlers.erp\n", "  - step app.handlers.erp\n  - step app.handlers.refund\n");
  const dir = repo(t, { "place.md": flow });
  const analysis = await analyze({ root: dir });
  const lines = evidenceOf(analysis, "keylang/flows/place.md");
  assert.equal(lines.get(5)?.mark, "ok");
  assert.equal(lines.get(8)?.mark, "fail");
  assert.equal(lines.get(4)?.mark, "fail");
  assert.equal(lines.get(4)?.group, true);
  assert.deepEqual(lines.get(4)?.criteria, []);
  const fixed = repo(t, { "place.md": PLACE_ORDER });
  const ok = await analyze({ root: fixed });
  assert.equal(evidenceOf(ok, "keylang/flows/place.md").get(4)?.mark, "ok");
  // The trigger, the three steps of the group and the step after it.
  assert.equal(totals(ok).ok, 5);
});

// ---------- diagram ----------

test("diagram: a parallel group is a split and a join gateway around its steps; a timer is a timer event (ADR 0023 BPMN table)", async (t) => {
  const flow = `${PLACE_ORDER}  - after 30m\n`;
  const dir = repo(t, { "place.md": flow });
  const analysis = await analyze({ root: dir });
  const results = checkResults(analysis.verdicts, analysis.snapshot?.snapshotId ?? null, analysis.diagnostics);
  const diagram = diagramOf({ snapshot: analysis.snapshot, spec: analysis.spec, results, view: { kind: "flow", name: "place-order" } });
  const kinds = diagram.nodes.map((node) => `${node.kind} ${node.id}`);
  assert.ok(kinds.includes("parallel parallel:4") && kinds.includes("parallel parallel:4:join"), kinds.join(", "));
  assert.ok(kinds.includes("timer after:9"), kinds.join(", "));
  const from = (id: string): string[] => diagram.edges.filter((edge) => edge.from === id).map((edge) => edge.to).sort();
  assert.deepEqual(from("parallel:4"), ["step:5", "step:6", "step:7"]);
  for (const step of ["step:5", "step:6", "step:7"]) assert.deepEqual(from(step), ["parallel:4:join"]);
  assert.deepEqual(from("parallel:4:join"), ["step:8"]);
});
