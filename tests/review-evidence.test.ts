// Regressions from the 2026-10-05 review of the evidence layer: trace loading
// and matching across runs, test reports, the trace adapters, and the LSP
// transport. Each case is the smallest repository that showed the bug.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");

type Context = { after: (f: () => void) => void };

function keylang(cwd: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8", maxBuffer: 1 << 28 });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** A temp repository of `files`; `config` is `keylang.json`. */
function repo(t: Context, config: object, files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-evidence-"));
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
  testId?: string;
}

function results(dir: string): JsonResult[] {
  const o = keylang(dir, ["check", "--format", "json"]);
  assert.ok(o.stdout.startsWith("{"), o.stdout + o.stderr);
  return (JSON.parse(o.stdout) as { results: JsonResult[] }).results;
}

const row = (rows: JsonResult[], criterion: string, area: string): JsonResult | undefined => rows.find((r) => r.criterion === criterion && r.area === area);

/** `verdict evidence` of the trace line of `id`, for assertion messages that show what came instead. */
const traceOf = (rows: JsonResult[], id: string): string => {
  const r = row(rows, "trace", id);
  return r ? `${r.verdict}: ${r.evidence}` : "none";
};

// The checkout fixture of design §3.4: `checkout() { buy() }`, `buy() { validate(); create(); save(); }`.
const CHECKOUT: Record<string, string> = {
  "src/domain/order.ts": "export function create(): void {}\n",
  "src/infrastructure/store.ts": "export function save(): void {}\n",
  "src/application/purchase.ts": 'import { create } from "../domain/order.ts";\nimport { save } from "../infrastructure/store.ts";\nfunction validate(): void {}\nexport function buy(): void {\n  validate();\n  create();\n  save();\n}\n',
  "src/presentation/terminal.ts": 'import { buy } from "../application/purchase.ts";\nexport function checkout(): void {\n  buy();\n}\n',
};
const LAYERS = Object.fromEntries(["domain", "infrastructure", "application", "presentation"].map((layer) => [layer, `src/${layer}/**`]));
const CHECKOUT_FLOW = "# flow checkout\n\n- trigger presentation.terminal.checkout\n- step application.purchase.buy\n  - step domain.order.create\n  - step infrastructure.store.save\n- invariant total is the sum of the lines\n  - test tests/purchase.test.ts \"computes total\"\n";
const T = "presentation.terminal.checkout";
const BUY = "application.purchase.buy";
const CREATE = "domain.order.create";
const SAVE = "infrastructure.store.save";
const ALL = [T, BUY, CREATE, SAVE];
const AREA = "invariant total is the sum of the lines";

function checkout(t: Context, check: Record<string, string>): { dir: string; snapshot: string } {
  const dir = repo(t, { languages: ["typescript"], layers: LAYERS, check }, { ...CHECKOUT, "keylang/flows/checkout.md": CHECKOUT_FLOW, "tests/purchase.test.ts": "" });
  return { dir, snapshot: snapshotOf(dir) };
}

interface SpanSpec {
  id: string;
  symbol: string;
  parent?: string;
  start: number;
  end?: number;
}

/** One test run as trace JSONL. */
function traceRun(snapshotId: string, spans: SpanSpec[], run: { testId?: string; instrumented?: string[] } = {}): string {
  const base = { schemaVersion: 1, snapshotId, runId: "r1", testId: run.testId ?? "t1", flow: "checkout", traceId: "tr" };
  const events: object[] = [];
  for (const span of spans) {
    events.push({ ...base, event: "start", spanId: span.id, parentSpanId: span.parent ?? null, symbolId: span.symbol, clockId: "c", seq: span.start, ts: 1 });
    if (span.end !== undefined) events.push({ ...base, event: "end", spanId: span.id, outcome: "ok", clockId: "c", seq: span.end, ts: 1 });
  }
  events.push({ ...base, event: "run", complete: true, dropped: 0, instrumented: run.instrumented ?? ALL, open: [] });
  return `${events.map((e) => JSON.stringify(e)).join("\n")}\n`;
}

const nested = (): SpanSpec[] => [
  { id: "a", symbol: T, start: 1, end: 10 },
  { id: "b", symbol: BUY, parent: "a", start: 2, end: 9 },
  { id: "c", symbol: CREATE, parent: "b", start: 3, end: 4 },
  { id: "d", symbol: SAVE, parent: "b", start: 5, end: 6 },
];

function writeTrace(dir: string, name: string, text: string): void {
  mkdirSync(join(dir, ".keylang/trace"), { recursive: true });
  writeFileSync(join(dir, ".keylang/trace", name), text);
}

// ---------- traces ----------

test("trace: a run of 60 000 spans loads in linear time", (t) => {
  const { dir, snapshot } = checkout(t, { trace: ".keylang/trace/*.jsonl" });
  const spans: SpanSpec[] = [{ id: "a", symbol: T, start: 0, end: 1_000_000 }];
  let seq = 1;
  for (let i = 0; i < 60_000; i++) spans.push({ id: `v${i}`, symbol: "application.purchase.validate", parent: "a", start: seq++, end: seq++ });
  spans.push({ id: "b", symbol: BUY, parent: "a", start: seq++, end: seq + 4 }, { id: "c", symbol: CREATE, parent: "b", start: seq++, end: seq++ }, { id: "d", symbol: SAVE, parent: "b", start: seq++, end: seq++ });
  writeTrace(dir, "big.jsonl", traceRun(snapshot, spans));
  const started = Date.now();
  const rows = results(dir);
  // A scan of every span per event took 28 s here; a lookup by id takes about one.
  assert.ok(Date.now() - started < 15_000, `${Date.now() - started} ms`);
  for (const id of ALL) assert.equal(row(rows, "trace", id)?.verdict, "ok", traceOf(rows, id));
});

test("trace: an end in a file read before the file with its start closes that start", (t) => {
  const { dir, snapshot } = checkout(t, { trace: ".keylang/trace/*.jsonl" });
  const lines = traceRun(snapshot, nested()).trim().split("\n");
  const isEnd = (line: string): boolean => (JSON.parse(line) as { event: string }).event === "end";
  // `a.jsonl` is read first: one process of the run wrote its ends there.
  writeTrace(dir, "a.jsonl", `${lines.filter(isEnd).join("\n")}\n`);
  writeTrace(dir, "b.jsonl", `${lines.filter((line) => !isEnd(line)).join("\n")}\n`);
  const o = keylang(dir, ["check"]);
  assert.equal(o.status, 0, o.stderr);
  const rows = results(dir);
  for (const id of ALL) assert.equal(row(rows, "trace", id)?.verdict, "ok", traceOf(rows, id));
  // An end whose start is in no file is still an error naming its line.
  writeTrace(dir, "a.jsonl", `${lines.filter(isEnd).join("\n").replace('"spanId":"a"', '"spanId":"zz"')}\n`);
  const bad = keylang(dir, ["check"]);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /\.keylang\/trace\/a\.jsonl:1: end of unknown span `zz`/);
});

test("trace: a run that never entered the trigger says nothing about the flow", (t) => {
  const { dir, snapshot } = checkout(t, { trace: ".keylang/trace/*.jsonl" });
  // A unit test of `save` alone: PHPUnit and several processes without a shared run id make such runs.
  const unit = traceRun(snapshot, [{ id: "u1", symbol: SAVE, start: 1, end: 2 }], { testId: "unit-save" });
  const e2e = traceRun(snapshot, nested(), { testId: "e2e" });
  for (const text of [e2e + unit, unit + e2e]) {
    writeTrace(dir, "t.jsonl", text);
    const rows = results(dir);
    for (const id of ALL) assert.equal(row(rows, "trace", id)?.verdict, "ok", traceOf(rows, id));
  }
  // Alone, it is no run of the flow: unverified, never a missing trigger.
  writeTrace(dir, "t.jsonl", unit);
  const alone = results(dir);
  for (const id of ALL) assert.equal(traceOf(alone, id), `unverified: unverified ${id}: trigger not observed in unit-save`);
  // Among the runs that entered the trigger, one that skipped a step still fails it.
  writeTrace(dir, "t.jsonl", e2e + unit + traceRun(snapshot, nested().filter((span) => span.symbol !== SAVE), { testId: "e2e-2" }));
  const broken = results(dir);
  assert.equal(traceOf(broken, SAVE), `fail: fail ${SAVE}: missing step in e2e-2`);
  assert.equal(row(broken, "trace", T)?.verdict, "ok");
});

test("trace: a snapshotId of another type is an error naming the line; a byte order mark is not", (t) => {
  const { dir, snapshot } = checkout(t, { trace: ".keylang/trace/*.jsonl" });
  writeTrace(dir, "t.jsonl", `\uFEFF${traceRun(snapshot, nested())}`);
  const rows = results(dir);
  for (const id of ALL) assert.equal(row(rows, "trace", id)?.verdict, "ok", traceOf(rows, id));
  writeTrace(dir, "t.jsonl", traceRun(snapshot, nested()).replace(`"snapshotId":"${snapshot}"`, '"snapshotId":123'));
  const bad = keylang(dir, ["check"]);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /\.keylang\/trace\/t\.jsonl:1: `snapshotId` must be a string or null/);
  // Missing or null is no snapshot, not an error.
  writeTrace(dir, "t.jsonl", traceRun(snapshot, nested()).replaceAll(`"snapshotId":"${snapshot}"`, '"snapshotId":null'));
  assert.match(traceOf(results(dir), SAVE), /unverified: .* is not bound to a snapshot/);
});

// ---------- test reports ----------

function writeReport(dir: string, name: string, text: string): void {
  mkdirSync(join(dir, ".keylang/reports"), { recursive: true });
  writeFileSync(join(dir, ".keylang/reports", name), text);
}

const testsOf = (rows: JsonResult[]): string => {
  const r = row(rows, "tests", AREA);
  return r ? `${r.verdict}: ${r.evidence}` : "none";
};

test("tests: snapshotId and runId of another type are errors naming the field; missing or null is unbound", (t) => {
  const { dir, snapshot } = checkout(t, { tests: ".keylang/reports/*" });
  const report = (fields: object, row: object = {}): string => JSON.stringify({ schemaVersion: 1, runId: "r", ...fields, tests: [{ file: "tests/purchase.test.ts", name: "computes total", status: "pass", ...row }] });
  for (const [fields, rowFields, message] of [
    [{ snapshotId: 123 }, {}, /\.keylang\/reports\/r\.json: `snapshotId` must be a string or null, got 123/],
    [{ snapshotId: snapshot, runId: 5 }, {}, /\.keylang\/reports\/r\.json: `runId` must be a string or null, got 5/],
    [{ snapshotId: snapshot }, { snapshotId: false }, /\.keylang\/reports\/r\.json: tests\[0\]\.snapshotId must be a string or null, got false/],
  ] as const) {
    writeReport(dir, "r.json", report(fields, rowFields));
    const o = keylang(dir, ["check"]);
    assert.equal(o.status, 2, o.stdout);
    assert.match(o.stderr, message);
  }
  writeReport(dir, "r.json", report({ snapshotId: null, runId: null }));
  assert.match(testsOf(results(dir)), /unverified: .*report \.keylang\/reports\/r\.json is not bound to a snapshot/);
  writeReport(dir, "r.json", report({ snapshotId: snapshot }));
  assert.match(testsOf(results(dir)), /^ok: /);
});

test("tests: a JSON report with a byte order mark is read like one without", (t) => {
  const { dir, snapshot } = checkout(t, { tests: ".keylang/reports/*" });
  writeReport(dir, "r.json", `\uFEFF${JSON.stringify({ schemaVersion: 1, snapshotId: snapshot, runId: "r", tests: [{ file: "tests/purchase.test.ts", name: "computes total", status: "pass" }] })}`);
  assert.match(testsOf(results(dir)), /^ok: .*passed in \.keylang\/reports\/r\.json/);
});

test("tests: two results of other snapshots are a stale report, not ambiguous", (t) => {
  const { dir } = checkout(t, { tests: ".keylang/reports/*" });
  const old = "0".repeat(64);
  writeReport(dir, "r.json", JSON.stringify({ schemaVersion: 1, snapshotId: old, runId: "r", tests: ["A", "B"].map((suite) => ({ file: "tests/purchase.test.ts", suite, name: "computes total", status: "pass" })) }));
  assert.match(testsOf(results(dir)), /^unverified: .*stale report \.keylang\/reports\/r\.json \(snapshot 000000000000\)/);
});

test("tests: a JUnit file attribute with the absolute path under the root matches; a testcase without one says so", (t) => {
  const { dir, snapshot } = checkout(t, { tests: ".keylang/reports/*" });
  const junit = (attributes: string): string =>
    `<?xml version="1.0"?>\n<testsuites><testsuite name="purchase"><properties><property name="keylang.snapshotId" value="${snapshot}"/></properties><testcase ${attributes} name="computes total"/></testsuite></testsuites>\n`;
  // PHPUnit and jest-junit write the absolute path.
  writeReport(dir, "junit.xml", junit(`file="${join(dir, "tests/purchase.test.ts")}" classname="PurchaseTest"`));
  assert.match(testsOf(results(dir)), /^ok: .*passed in \.keylang\/reports\/junit\.xml/);
  // Outside the root the path stays as it is, and names no file of the repository.
  writeReport(dir, "junit.xml", junit(`file="/elsewhere/tests/purchase.test.ts" classname="PurchaseTest"`));
  assert.match(testsOf(results(dir)), /^unverified: .*: no report \(tests\/purchase\.test\.ts "computes total"\)/);
  // pytest's default xunit2 and jest-junit without addFileAttribute write no `file`.
  writeReport(dir, "junit.xml", junit('classname="tests.purchase_test"'));
  assert.match(testsOf(results(dir)), /^unverified: .*: no report: \.keylang\/reports\/junit\.xml has the test without a `file` attribute/);
});
