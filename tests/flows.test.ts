// Flow evidence through the real CLI: static reachability, test reports,
// traces (contract and adapter), negative trace scenarios, and `planned`.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");

function keylang(cwd: string, args: string[], env: Record<string, string> = {}, node: string[] = []): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [...node, bin, ...args], { cwd, encoding: "utf8", env: { ...process.env, ...env } });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

// The checkout fixture of design §3.4: `buy() { validate(); create(); save(); }`.
const CHECKOUT: Record<string, string> = {
  "src/domain/order.ts": "export function create(): void {}\n",
  "src/infrastructure/store.ts": "export function save(): void {}\n",
  "src/application/purchase.ts": [
    'import { create } from "../domain/order.ts";',
    'import { save } from "../infrastructure/store.ts";',
    "function validate(): void {}",
    "export function buy(): void {",
    "  validate();",
    "  create();",
    "  save();",
    "}",
    "export function later(cb: () => void): void {",
    "  cb();",
    "}",
    "export function viaCallback(): void {",
    "  later(save);",
    "}",
    "",
  ].join("\n"),
  "src/presentation/terminal.ts": 'import { buy } from "../application/purchase.ts";\nexport function checkout(): void {\n  buy();\n}\n',
};

const CHECKOUT_FLOW = "# flow checkout\n\n- trigger presentation.terminal.checkout\n- step application.purchase.buy\n  - step domain.order.create\n  - step infrastructure.store.save\n";

/** A temp repository with the given files, flows, and `check` config. */
function repo(t: { after: (f: () => void) => void }, files: Record<string, string>, specs: Record<string, string>, check: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-flow-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const layers = Object.fromEntries([...new Set(Object.keys(files).map((path) => path.split("/")[1]!))].map((layer) => [layer, `src/${layer}/**`]));
  writeFileSync(join(dir, "keylang.json"), `${JSON.stringify({ languages: ["typescript"], layers, check }, null, 2)}\n`);
  for (const [path, text] of Object.entries({ ...files, ...Object.fromEntries(Object.entries(specs).map(([p, s]) => [`keylang/${p}`, s])) })) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

function snapshotOf(dir: string): string {
  assert.equal(keylang(dir, ["map"]).status, 0);
  return JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")).snapshotId as string;
}

interface JsonResult {
  criterion: string;
  area: string;
  verdict: string;
  evidence: string;
  code: string | null;
  provenance?: string;
  runId?: string;
  testId?: string;
}

function results(dir: string, args: string[] = []): { status: number | null; rows: JsonResult[] } {
  const o = keylang(dir, ["check", "--format", "json", ...args]);
  assert.ok(o.stdout.startsWith("{"), o.stdout + o.stderr);
  return { status: o.status, rows: (JSON.parse(o.stdout) as { results: JsonResult[] }).results };
}

const row = (rows: JsonResult[], criterion: string, area: string): JsonResult | undefined => rows.find((r) => r.criterion === criterion && r.area === area);

// ---------- 16: static reachability ----------

test("static: every step is reachable from its parent, siblings need no path", (t) => {
  const dir = repo(t, CHECKOUT, { "flows/checkout.md": CHECKOUT_FLOW });
  const { status, rows } = results(dir);
  assert.equal(status, 0);
  assert.equal(row(rows, "static", "application.purchase.buy")?.verdict, "ok");
  assert.match(row(rows, "static", "application.purchase.buy")!.evidence, /called from presentation\.terminal\.checkout/);
  assert.equal(row(rows, "static", "domain.order.create")?.verdict, "ok");
  assert.equal(row(rows, "static", "infrastructure.store.save")?.verdict, "ok");
  for (const id of ["application.purchase.buy", "domain.order.create", "infrastructure.store.save"]) {
    assert.equal(row(rows, "ID", id)?.verdict, "ok", id);
    assert.equal(row(rows, "static", id)?.provenance, "syntactic");
  }
});

test("static: a removed step is K001 without a second static failure", (t) => {
  const dir = repo(t, { ...CHECKOUT, "src/infrastructure/store.ts": "export const marker = 1;\n", "src/application/purchase.ts": CHECKOUT["src/application/purchase.ts"]!.replace(/.*save.*\n/g, "") }, { "flows/checkout.md": CHECKOUT_FLOW });
  const o = keylang(dir, ["check"]);
  assert.equal(o.status, 1, o.stdout);
  assert.match(o.stdout, /keylang\/flows\/checkout\.md:6:10: K001 dangling reference `infrastructure\.store\.save`/);
  assert.doesNotMatch(o.stdout, /static \w+ infrastructure\.store\.save/);
  assert.match(o.stderr, /^1 fail,/m);
});

test("static: a step reached only through a callback is unverified with the call's position", (t) => {
  const dir = repo(t, CHECKOUT, { "flows/cb.md": "# flow cb\n\n- trigger application.purchase.viaCallback\n- step infrastructure.store.save\n" });
  const o = keylang(dir, ["check"]);
  assert.equal(o.status, 0, o.stdout);
  assert.match(o.stdout, /static unverified infrastructure\.store\.save: no resolved path from application\.purchase\.viaCallback; call through a local value `cb` at src\/application\/purchase\.ts:10:3 may reach it/);
  const strict = keylang(dir, ["check", "--strict"]);
  assert.equal(strict.status, 1);
});

test("static: no path in a fully resolved graph is unverified while the step is read as a value; a module step is not callable", (t) => {
  const dir = repo(t, CHECKOUT, { "flows/odd.md": "# flow odd\n\n- trigger domain.order.create\n- step infrastructure.store.save\n- step application.purchase\n" });
  const { status, rows } = results(dir);
  assert.equal(status, 0);
  assert.equal(row(rows, "static", "infrastructure.store.save")?.verdict, "unverified");
  // `later(save)` hands `save` to code that may call it.
  assert.match(row(rows, "static", "infrastructure.store.save")!.evidence, /no call path from domain\.order\.create in the static graph; `save` is read as a value at src\/application\/purchase\.ts:13:9/);
  assert.match(row(rows, "static", "application.purchase")!.evidence, /is a module, not a callable/);
});

// A step that only its own name can reach: a call whose receiver keylang does
// not know can still be it when the method name matches, never otherwise.
const BY_NAME: Record<string, string> = {
  "src/domain/order.ts": "export function create(): void {}\nexport function other(x: { sell(): void }): void {\n  x.sell();\n}\nexport function poke(x: { buy(): void }): void {\n  x.buy();\n}\n",
  "src/application/purchase.ts": 'import { create } from "../domain/order.ts";\nexport function buy(): void {\n  create();\n}\n',
  "src/presentation/terminal.ts": 'import { buy } from "../application/purchase.ts";\nexport function checkout(): void {\n  buy();\n}\n',
};

test("static: a step no call can reach is a confirmed absence; a call with the step's name keeps it unverified", (t) => {
  const flow = "# flow by-name\n\n- trigger domain.order.create\n- step application.purchase.buy\n";
  const dir = repo(t, BY_NAME, { "flows/a.md": flow, "flows/b.md": flow.replace("by-name", "other").replace("create", "other"), "flows/c.md": flow.replace("by-name", "poke").replace("create", "poke") });
  const o = keylang(dir, ["check"]);
  assert.equal(o.status, 1, o.stdout);
  // No call at all from `create`, none named `buy` from `other`: `buy` is called only by name.
  assert.match(o.stdout, /flows\/a\.md:4:1: static fail application\.purchase\.buy: absence: no call path from domain\.order\.create; `application\.purchase\.buy` and its callers are called only by name/);
  assert.match(o.stdout, /flows\/b\.md:4:1: static fail application\.purchase\.buy: absence: no call path from domain\.order\.other/);
  assert.match(o.stdout, /flows\/c\.md:4:1: static unverified application\.purchase\.buy: no resolved path from domain\.order\.poke; call through a local value `x\.buy` at src\/domain\/order\.ts:6:3 may reach it/);
  assert.match(o.stderr, /^2 fail, /m);
  // Once `buy` is read as a value, any code holding it may call it.
  writeFileSync(join(dir, "src/presentation/terminal.ts"), `${BY_NAME["src/presentation/terminal.ts"]}export const actions = [buy];\n`);
  const escaped = results(dir).rows.filter((r) => r.criterion === "static" && r.area === "application.purchase.buy");
  assert.deepEqual(escaped.map((r) => r.verdict), ["unverified", "unverified", "unverified"]);
  assert.match(escaped[0]!.evidence, /`buy` is read as a value at src\/presentation\/terminal\.ts:5:25/);
});

test("static: the hole named is the one with the step's name nearest the parent, not the first file", (t) => {
  const files = {
    ...CHECKOUT,
    "src/application/aaa.ts": "export function helper(name: string): boolean {\n  return name.startsWith(\"x\");\n}\n",
    "src/presentation/app.ts": [
      'import { helper } from "../application/aaa.ts";',
      "export function input(decoder: { save(): void }): void {",
      '  helper("a");',
      "  decoder.save();",
      "}",
      "",
    ].join("\n"),
    // `save` is read as a value in purchase.ts, so the missing path stays unverified.
  };
  const dir = repo(t, files, { "flows/app.md": "# flow app\n\n- trigger presentation.app.input\n- step infrastructure.store.save\n" });
  const evidence = row(results(dir).rows, "static", "infrastructure.store.save")!.evidence;
  assert.match(evidence, /no resolved path from presentation\.app\.input; call through a local value `decoder\.save` at src\/presentation\/app\.ts:4:3 may reach it \(and 1 more unresolved call in reachable code\)/);
  assert.doesNotMatch(evidence, /startsWith/);
});

test("static: recursion, direct or mutual, is a path from a function to itself", (t) => {
  const code = { "src/domain/walk.ts": "export function f(n: number): void {\n  if (n > 0) g(n);\n}\nfunction g(n: number): void {\n  f(n - 1);\n}\nexport function h(): void {\n  h();\n}\n" };
  const dir = repo(t, code, { "flows/walk.md": "# flow walk\n\n- trigger domain.walk.f\n  - step domain.walk.f\n- trigger domain.walk.h\n  - step domain.walk.h\n" });
  const o = keylang(dir, ["check"]);
  assert.equal(o.status, 0, o.stdout);
  assert.match(o.stdout, /static ok domain\.walk\.f: reachable from domain\.walk\.f via domain\.walk\.g/);
  assert.match(o.stdout, /static ok domain\.walk\.h: called from domain\.walk\.h/);
  // The map does not list a function among its own calls.
  assert.equal(keylang(dir, ["map"]).status, 0);
  assert.doesNotMatch(readFileSync(join(dir, "keylang/map/domain.md"), "utf8"), /calls domain\.walk\.h/);
});

// A hook with a default: the code calls what it is given, or its default.
const HOOKS: Record<string, string> = {
  "src/domain/build.ts": "export function build(): void {}\n",
  "src/application/analyze.ts": [
    'import { build } from "../domain/build.ts";',
    "export function analyze(request: { generate?: () => void }): void {",
    "  const generate = request.generate ?? build;",
    "  generate();",
    "}",
    "export function run(step = build): void {",
    "  step();",
    "}",
    "export class Session {",
    "  private readonly analyzer: (request: { generate?: () => void }) => void;",
    "  constructor(options: { analyzer?: (request: { generate?: () => void }) => void }) {",
    "    this.analyzer = options.analyzer ?? analyze;",
    "  }",
    "  refresh(): void {",
    "    this.analyzer({});",
    "  }",
    "}",
    "",
  ].join("\n"),
  "src/presentation/worker.ts": [
    'import { analyze } from "../application/analyze.ts";',
    "export class Worker {",
    "  readonly generate = (): void => {};",
    "}",
    "export function main(): void {",
    "  const worker = new Worker();",
    "  analyze({ generate: worker.generate });",
    "}",
    "",
  ].join("\n"),
};

const HOOK_FLOW = `# flow hooks

- trigger application.analyze.analyze
  - step domain.build.build
  - step presentation.worker.Worker.generate
`;

test("static: --static=behavior follows a hook's default and an injected value; shape follows only written calls", (t) => {
  const dir = repo(t, HOOKS, {
    "flows/hooks.md": HOOK_FLOW,
    "flows/run.md": "# flow run\n\n- trigger application.analyze.run\n  - step domain.build.build\n",
    "flows/session.md": "# flow session\n\n- trigger application.analyze.Session.refresh\n  - step application.analyze.analyze\n",
  });
  const behavior = keylang(dir, ["check", "--strict"]);
  assert.equal(behavior.status, 0, behavior.stdout);
  assert.match(behavior.stdout, /static ok domain\.build\.build: called from application\.analyze\.analyze through the default of the hook `generate`/);
  assert.match(behavior.stdout, /static ok presentation\.worker\.Worker\.generate: called from application\.analyze\.analyze through `generate` injected at src\/presentation\/worker\.ts:7:3/);
  assert.match(behavior.stdout, /static ok domain\.build\.build: called from application\.analyze\.run through the default of the hook `step`/);
  assert.match(behavior.stdout, /static ok application\.analyze\.analyze: called from application\.analyze\.Session\.refresh through the default of the hook `analyzer`/);
  assert.deepEqual(keylang(dir, ["check", "--strict", "--static", "behavior"]).stdout, behavior.stdout);
  const shape = keylang(dir, ["check", "--static=shape"]);
  assert.equal(shape.status, 0, shape.stdout);
  assert.match(shape.stdout, /static unverified domain\.build\.build: no resolved path from application\.analyze\.analyze; the default of the hook `generate` \(not followed with --static=shape\) at src\/application\/analyze\.ts:4:3 may reach it/);
  assert.match(shape.stdout, /static unverified presentation\.worker\.Worker\.generate: no resolved path from application\.analyze\.analyze; `generate` injected at src\/presentation\/worker\.ts:7:3 \(not followed with --static=shape\)/);
  assert.equal(keylang(dir, ["check", "--static=shape", "--strict"]).status, 1);
  const bad = keylang(dir, ["check", "--static=runtime"]);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /unknown --static `runtime`; expected behavior, shape/);
  // Rules do not see the injected value: the dependency is the injector's.
  assert.doesNotMatch(behavior.stdout, /K10/);
  assert.equal(keylang(dir, ["map"]).status, 0);
  const map = readFileSync(join(dir, "keylang/map/application.md"), "utf8");
  assert.match(map, /- fn \[analyze\].*\n\s+- calls domain\.build\.build\n/);
  assert.doesNotMatch(map, /calls .*presentation\.worker/);
});

// ---------- 17: test reports ----------

const INVARIANT_FLOW = `${CHECKOUT_FLOW}- invariant total is the sum of the lines
  - test tests/purchase.test.ts "computes total"
`;

function report(dir: string, snapshotId: string | null, tests: object[], name = "node-test.json"): void {
  mkdirSync(join(dir, ".keylang/reports"), { recursive: true });
  writeFileSync(join(dir, ".keylang/reports", name), JSON.stringify({ schemaVersion: 1, ...(snapshotId ? { snapshotId } : {}), runId: "r1", tests }));
}

test("tests: a passing test proves its invariant, a failing one fails, none is unverified", (t) => {
  const dir = repo(t, CHECKOUT, { "flows/checkout.md": INVARIANT_FLOW }, { tests: ".keylang/reports/*.json" });
  const area = "invariant total is the sum of the lines";
  const none = results(dir);
  assert.equal(none.status, 0);
  assert.match(row(none.rows, "tests", area)!.evidence, /unverified .*: no report \(tests\/purchase\.test\.ts "computes total"\)/);
  const snapshot = snapshotOf(dir);
  report(dir, snapshot, [{ file: "tests/purchase.test.ts", name: "computes total", status: "pass" }]);
  const pass = results(dir);
  assert.equal(row(pass.rows, "tests", area)?.verdict, "ok");
  assert.equal(row(pass.rows, "tests", area)?.provenance, "test-report");
  assert.equal(row(pass.rows, "tests", area)?.runId, "r1");
  report(dir, snapshot, [{ file: "tests/purchase.test.ts", name: "computes total", status: "fail" }]);
  const fail = keylang(dir, ["check"]);
  assert.equal(fail.status, 1, fail.stdout);
  assert.match(fail.stdout, /keylang\/flows\/checkout\.md:8:3: tests fail invariant total is the sum of the lines: failed in \.keylang\/reports\/node-test\.json/);
  assert.doesNotMatch(fail.stdout, /K001/);
  report(dir, snapshot, [{ file: "tests/purchase.test.ts", name: "computes total", status: "skip" }]);
  assert.match(row(results(dir).rows, "tests", area)!.evidence, /skipped/);
});

test("tests: two suites with the same name are ambiguous; a stale or unbound report is unverified", (t) => {
  const dir = repo(t, CHECKOUT, { "flows/checkout.md": INVARIANT_FLOW }, { tests: ".keylang/reports/*.json" });
  const area = "invariant total is the sum of the lines";
  const snapshot = snapshotOf(dir);
  report(dir, snapshot, [
    { file: "tests/purchase.test.ts", suite: "A", name: "computes total", status: "pass" },
    { file: "tests/purchase.test.ts", suite: "B", name: "computes total", status: "pass" },
  ]);
  assert.match(row(results(dir).rows, "tests", area)!.evidence, /ambiguous: A > computes total, B > computes total/);
  report(dir, "0".repeat(64), [{ file: "tests/purchase.test.ts", name: "computes total", status: "pass" }]);
  assert.match(row(results(dir).rows, "tests", area)!.evidence, /stale report/);
  report(dir, null, [{ file: "tests/purchase.test.ts", name: "computes total", status: "pass" }]);
  assert.match(row(results(dir).rows, "tests", area)!.evidence, /is not bound to a snapshot/);
});

test("tests: JUnit XML with a keylang snapshot property is evidence", (t) => {
  const dir = repo(t, CHECKOUT, { "flows/checkout.md": INVARIANT_FLOW }, { tests: "reports/junit.xml" });
  mkdirSync(join(dir, "reports"), { recursive: true });
  writeFileSync(join(dir, "reports/junit.xml"), "<testsuites/>");
  const snapshot = snapshotOf(dir);
  writeFileSync(
    join(dir, "reports/junit.xml"),
    `<?xml version="1.0"?>\n<testsuites><testsuite name="purchase"><properties><property name="keylang.snapshotId" value="${snapshot}"/></properties><testcase file="tests/purchase.test.ts" classname="purchase" name="computes total"/></testsuite></testsuites>\n`,
  );
  // One case with that name in the file: unambiguous without the suite, too.
  assert.equal(row(results(dir).rows, "tests", "invariant total is the sum of the lines")?.verdict, "ok");
  writeFileSync(join(dir, "keylang/flows/checkout.md"), INVARIANT_FLOW.replace('"computes total"', '"purchase > computes total"'));
  assert.equal(row(results(dir).rows, "tests", "invariant total is the sum of the lines")?.verdict, "ok");
});

test("tests: check.tests is validated with the field name", (t) => {
  const dir = repo(t, CHECKOUT, { "flows/checkout.md": INVARIANT_FLOW }, { tests: "reports/none.json" });
  const o = keylang(dir, ["check"]);
  assert.equal(o.status, 2);
  assert.match(o.stderr, /keylang\.json: check\.tests: no such file `reports\/none\.json`/);
  mkdirSync(join(dir, "reports"), { recursive: true });
  writeFileSync(join(dir, "reports/none.json"), JSON.stringify({ tests: [] }));
  assert.match(keylang(dir, ["check"]).stderr, /reports\/none\.json: `schemaVersion` is missing \(expected 1\)/);
  writeFileSync(join(dir, "reports/none.json"), JSON.stringify({ schemaVersion: 1, tests: [{ file: "x", name: "y", status: "green" }] }));
  const bad = keylang(dir, ["check"]);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /reports\/none\.json: tests\[0\]\.status must be "pass", "fail" or "skip", got "green"/);
});

// ---------- 18/19: traces ----------

interface SpanSpec {
  id: string;
  symbol: string;
  parent?: string;
  start: number;
  end?: number;
  clock?: string;
  links?: string[];
}

/** One test run as trace JSONL. `end` omitted leaves the span open. */
function traceRun(snapshotId: string, flow: string, spans: SpanSpec[], run: { testId?: string; complete?: boolean; dropped?: number; instrumented?: string[] } = {}): string {
  const base = { schemaVersion: 1, snapshotId, runId: "r1", testId: run.testId ?? "t1", flow, traceId: "tr" };
  const events: object[] = [];
  for (const span of spans) {
    events.push({ ...base, event: "start", spanId: span.id, parentSpanId: span.parent ?? null, symbolId: span.symbol, clockId: span.clock ?? "c", seq: span.start, ts: 1, ...(span.links ? { links: span.links } : {}) });
    if (span.end !== undefined) events.push({ ...base, event: "end", spanId: span.id, outcome: "ok", clockId: span.clock ?? "c", seq: span.end, ts: 1 });
  }
  events.push({ ...base, event: "run", complete: run.complete ?? true, dropped: run.dropped ?? 0, instrumented: run.instrumented ?? [...new Set(spans.map((s) => s.symbol))] });
  return `${events.map((e) => JSON.stringify(e)).join("\n")}\n`;
}

const T = "presentation.terminal.checkout";
const BUY = "application.purchase.buy";
const CREATE = "domain.order.create";
const SAVE = "infrastructure.store.save";
const ALL = [T, BUY, CREATE, SAVE];

function traced(t: { after: (f: () => void) => void }, flow = CHECKOUT_FLOW): { dir: string; snapshot: string; write: (text: string) => JsonResult[] } {
  const dir = repo(t, CHECKOUT, { "flows/checkout.md": flow }, { trace: ".keylang/trace/*.jsonl" });
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

const nested = (): SpanSpec[] => [
  { id: "a", symbol: T, start: 1, end: 10 },
  { id: "b", symbol: BUY, parent: "a", start: 2, end: 9 },
  { id: "c", symbol: CREATE, parent: "b", start: 3, end: 4 },
  { id: "d", symbol: SAVE, parent: "b", start: 5, end: 6 },
];

test("trace: nested steps in order are ok, with provenance, run, and test", (t) => {
  const { snapshot, write } = traced(t);
  const rows = write(traceRun(snapshot, "checkout", nested(), { instrumented: ALL }));
  for (const id of [BUY, CREATE, SAVE]) {
    const r = row(rows, "trace", id);
    assert.equal(r?.verdict, "ok", `${id}: ${r?.evidence}`);
    assert.equal(r?.provenance, "trace");
    assert.equal(r?.runId, "r1");
    assert.equal(r?.testId, "t1");
  }
  // Every step shows its four kinds of evidence separately.
  for (const criterion of ["ID", "static", "trace"]) assert.ok(row(rows, criterion, SAVE), criterion);
});

test("trace: another snapshot or no snapshot is not current evidence", (t) => {
  const { write } = traced(t);
  assert.match(row(write(traceRun("f".repeat(64), "checkout", nested())), "trace", SAVE)!.evidence, /stale trace/);
  const unbound = traceRun("x", "checkout", nested()).replace(/"snapshotId":"x",/g, "");
  assert.match(row(write(unbound), "trace", SAVE)!.evidence, /is not bound to a snapshot/);
});

test("trace: a removed step fails in a complete run and is unverified when events were dropped", (t) => {
  const { snapshot, write } = traced(t);
  const without = nested().filter((span) => span.symbol !== SAVE);
  const fail = row(write(traceRun(snapshot, "checkout", without, { instrumented: ALL })), "trace", SAVE);
  assert.equal(fail?.verdict, "fail");
  assert.match(fail!.evidence, /missing step in t1/);
  const dropped = row(write(traceRun(snapshot, "checkout", without, { instrumented: ALL, dropped: 1 })), "trace", SAVE);
  assert.equal(dropped?.verdict, "unverified");
  assert.match(dropped!.evidence, /incomplete trace \(1 dropped\)/);
  const unfinished: SpanSpec[] = without.map((span) => (span.id === "a" ? { id: span.id, symbol: span.symbol, start: span.start } : span));
  const open = row(write(traceRun(snapshot, "checkout", unfinished, { instrumented: ALL })), "trace", SAVE);
  assert.match(open!.evidence, /incomplete trace/);
});

test("trace: an extra call between steps does not change ok", (t) => {
  const { snapshot, write } = traced(t);
  const spans: SpanSpec[] = [
    { id: "a", symbol: T, start: 1, end: 12 },
    { id: "b", symbol: BUY, parent: "a", start: 2, end: 11 },
    { id: "c", symbol: CREATE, parent: "b", start: 3, end: 4 },
    { id: "x", symbol: "application.purchase.validate", parent: "b", start: 5, end: 6 },
    { id: "d", symbol: SAVE, parent: "x", start: 7, end: 8 },
  ];
  const rows = write(traceRun(snapshot, "checkout", spans, { instrumented: ALL }));
  for (const id of [BUY, CREATE, SAVE]) assert.equal(row(rows, "trace", id)?.verdict, "ok", id);
});

test("trace: siblings on different clocks without links have unverified order", (t) => {
  const { snapshot, write } = traced(t);
  const spans = nested().map((span) => (span.id === "d" ? { ...span, clock: "worker" } : span));
  const r = row(write(traceRun(snapshot, "checkout", spans, { instrumented: ALL })), "trace", SAVE);
  assert.equal(r?.verdict, "unverified");
  assert.match(r!.evidence, /order unverified: `domain\.order\.create` and `infrastructure\.store\.save` ran on different clocks without links/);
  const linked = spans.map((span) => (span.id === "d" ? { ...span, links: ["c"] } : span));
  assert.equal(row(write(traceRun(snapshot, "checkout", linked, { instrumented: ALL })), "trace", SAVE)?.verdict, "ok");
});

test("trace: overlapping siblings are parallel, an async child needs a link, one span is one step", (t) => {
  const { snapshot, write } = traced(t);
  const overlap = nested().map((span) => (span.id === "c" ? { ...span, end: 7 } : span));
  assert.match(row(write(traceRun(snapshot, "checkout", overlap, { instrumented: ALL })), "trace", SAVE)!.evidence, /parallel/);
  const late = [
    { id: "a", symbol: T, start: 1, end: 10 },
    { id: "b", symbol: BUY, parent: "a", start: 2, end: 3 },
    { id: "c", symbol: CREATE, parent: "b", start: 4, end: 5 },
    { id: "d", symbol: SAVE, parent: "b", start: 6, end: 7, links: ["b"] },
  ];
  const rows = write(traceRun(snapshot, "checkout", late, { instrumented: ALL }));
  assert.match(row(rows, "trace", CREATE)!.evidence, /async step without a link to `application\.purchase\.buy`/);
  assert.equal(row(rows, "trace", SAVE)?.verdict, "ok");
  const twice = CHECKOUT_FLOW.replace("  - step infrastructure.store.save\n", "  - step infrastructure.store.save\n  - step infrastructure.store.save\n");
  const again = traced(t, twice);
  const both = again.write(traceRun(again.snapshot, "checkout", nested(), { instrumented: ALL })).filter((r) => r.criterion === "trace" && r.area === SAVE);
  assert.deepEqual(both.map((r) => r.verdict), ["ok", "fail"]);
});

test("trace: a when branch that did not run is unverified and its steps are not required", (t) => {
  const flow = `${CHECKOUT_FLOW}- when the item is out of stock\n  - step application.purchase.later\n`;
  const { snapshot, write } = traced(t, flow);
  const rows = write(traceRun(snapshot, "checkout", nested(), { instrumented: [...ALL, "application.purchase.later"] }));
  assert.equal(row(rows, "trace", "when the item is out of stock")?.verdict, "unverified");
  assert.match(row(rows, "trace", "when the item is out of stock")!.evidence, /branch not exercised/);
  assert.match(row(rows, "trace", "application.purchase.later")!.evidence, /branch not exercised/);
  assert.equal(rows.some((r) => r.criterion === "trace" && r.verdict === "fail"), false);
});

test("trace: a count or a negation needs its own predicate", (t) => {
  const dir = repo(t, CHECKOUT, { "flows/checkout.md": `${CHECKOUT_FLOW}- invariant no more than 3 retries\n` });
  assert.match(row(results(dir).rows, "tests", "invariant no more than 3 retries")!.evidence, /needs a separate predicate or test \(quantitative or negative property\)/);
});

test("trace: check.trace is validated on input", (t) => {
  const { dir, write } = traced(t);
  assert.ok(write(traceRun("s", "checkout", [])));
  writeFileSync(join(dir, ".keylang/trace/t.jsonl"), '{"schemaVersion":2,"runId":"r","testId":"t","flow":"f","event":"run"}\n');
  const o = keylang(dir, ["check"]);
  assert.equal(o.status, 2);
  assert.match(o.stderr, /\.keylang\/trace\/t\.jsonl:1: unsupported trace schemaVersion 2/);
  writeFileSync(join(dir, ".keylang/trace/t.jsonl"), '{"schemaVersion":1,"runId":"r","testId":"t","flow":"f","event":"start","spanId":"a"}\n');
  assert.match(keylang(dir, ["check"]).stderr, /t\.jsonl:1: `symbolId` must be a non-empty string/);
});

// The adapter: instrumented TS in a child process, spans with snapshot ids.
test("trace adapter: repeats and recursion get their own spans; an async continuation is linked", (t) => {
  const files = {
    "src/app/main.ts": [
      "export function fact(n: number): number {",
      "  return n <= 1 ? 1 : n * fact(n - 1);",
      "}",
      "export function run(): number {",
      "  return fact(3) + fact(2);",
      "}",
      "export const later = (): number => fact(1);",
      "export function kick(): Promise<number> {",
      "  return new Promise((done) => setTimeout(() => done(later()), 1));",
      "}",
      "",
    ].join("\n"),
  };
  const dir = repo(t, files, { "flows/f.md": "# flow f\n\n- trigger app.main.run\n  - step app.main.fact\n    - step app.main.fact\n\n# flow k\n\n- trigger app.main.kick\n  - step app.main.later\n" }, { trace: ".keylang/trace/*.jsonl" });
  const snapshot = snapshotOf(dir);
  const script = "const m = await import('./src/app/main.ts'); m.run(); await m.kick();";
  for (const [flow, testId] of [["f", "fact"], ["k", "kick"]] as const) {
    const r = spawnSync(process.execPath, ["--import", join(root, "src/adapters/trace.ts"), "--input-type=module", "-e", script], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, KEYLANG_TRACE: join(dir, `.keylang/trace/${flow}.jsonl`), KEYLANG_TRACE_FLOW: flow, KEYLANG_TRACE_TEST: testId, KEYLANG_TRACE_RUN: "run1" },
    });
    assert.equal(r.status, 0, r.stderr);
  }
  const events = readFileSync(join(dir, ".keylang/trace/f.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
  const facts = events.filter((e) => e.event === "start" && e.symbolId === "app.main.fact");
  // run() calls fact(3) → fact(2) → fact(1) and fact(2) → fact(1); later() adds fact(1).
  assert.equal(facts.length, 6);
  assert.equal(new Set(facts.map((e) => e.spanId)).size, facts.length);
  assert.ok(events.every((e) => e.snapshotId === snapshot));
  const meta = events.find((e) => e.event === "run");
  assert.equal(meta.complete, true);
  assert.deepEqual(meta.instrumented, ["app.main.fact", "app.main.run"]);
  const kick = readFileSync(join(dir, ".keylang/trace/k.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
  const later = kick.find((e) => e.event === "start" && e.symbolId === "app.main.later");
  const kickSpan = kick.find((e) => e.event === "start" && e.symbolId === "app.main.kick");
  assert.deepEqual(later.links, [kickSpan.spanId]);
  const rows = results(dir).rows;
  assert.equal(row(rows, "trace", "app.main.later")?.verdict, "ok");
  assert.deepEqual(rows.filter((r) => r.criterion === "trace" && r.area === "app.main.fact").map((r) => r.verdict), ["ok", "ok"]);
});

// ---------- 20: planned ----------

test("planned: a declared intention is unverified, not K001; without it K001 suggests planned", (t) => {
  const flow = "# flow refund\n\n- planned fn application.purchase.refund (order: Order) → Promise<Refund>\n- trigger presentation.terminal.checkout\n- step application.purchase.refund\n";
  const dir = repo(t, CHECKOUT, { "flows/refund.md": flow });
  const o = keylang(dir, ["check"]);
  assert.equal(o.status, 0, o.stdout);
  assert.doesNotMatch(o.stdout, /K001/);
  assert.match(o.stdout, /ID unverified application\.purchase\.refund: planned fn/);
  assert.match(o.stdout, /static unverified application\.purchase\.refund: planned fn, not implemented/);
  writeFileSync(join(dir, "keylang/flows/refund.md"), flow.replace(/- planned.*\n/, ""));
  const missing = keylang(dir, ["check"]);
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, /K001 dangling reference `application\.purchase\.refund`.*; declare `planned` if this is an intention/);
});

test("planned: an implemented intention is checked as code and hints to remove the declaration", (t) => {
  const flow = "# flow refund\n\n- planned fn application.purchase.refund (order: string) → void\n- trigger presentation.terminal.checkout\n- step application.purchase.refund\n";
  const code = { ...CHECKOUT, "src/application/purchase.ts": `${CHECKOUT["src/application/purchase.ts"]}export function refund(order: string): void {}\n` };
  const dir = repo(t, code, { "flows/refund.md": flow });
  const o = keylang(dir, ["check"]);
  assert.equal(o.status, 1, o.stdout);
  assert.match(o.stdout, /keylang\/flows\/refund\.md:3:1: K202 planned fn `application\.purchase\.refund` is implemented \(src\/application\/purchase\.ts:\d+\); remove the declaration/);
  assert.match(o.stdout, /ID ok application\.purchase\.refund: exact/);
  // Implemented and checked as code: nothing calls `refund`, and nothing could.
  assert.match(o.stdout, /static fail application\.purchase\.refund: absence: no call path from presentation\.terminal\.checkout/);
  writeFileSync(join(dir, "keylang/flows/refund.md"), flow.replace("(order: string) → void", "(order: number) → void"));
  const signature = keylang(dir, ["check"]);
  assert.equal(signature.status, 1);
  assert.match(signature.stdout, /K201 planned fn `application\.purchase\.refund` has signature `\(order: number\) → void`, the code has `\(order: string\) → void`/);
});

test("planned: a different kind or a duplicate declaration is reported", (t) => {
  const flow = "# flow refund\n\n- planned type application.purchase.buy\n- planned fn domain.order.later\n- planned fn domain.order.later\n";
  const dir = repo(t, CHECKOUT, { "flows/refund.md": flow });
  const o = keylang(dir, ["check"]);
  assert.equal(o.status, 1, o.stdout);
  assert.match(o.stdout, /refund\.md:3:1: K201 planned type `application\.purchase\.buy` is implemented as a fn/);
  assert.match(o.stdout, /refund\.md:5:1: K002 duplicate planned `domain\.order\.later` \(first declared at keylang\/flows\/refund\.md:4:\d+\)/);
});

test("planned: fmt canonicalizes the line and parse --json gives its own node kind", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "keylang-planned-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, "f.md");
  writeFileSync(file, "# flow f\n\n-   planned   fn   domain.x.y   (a:  A)→B\n");
  assert.equal(keylang(dir, ["fmt", "f.md"]).status, 0);
  assert.equal(readFileSync(file, "utf8"), "# flow f\n\n- planned fn domain.x.y (a: A)→B\n");
  assert.equal(keylang(dir, ["fmt", "--check", "f.md"]).status, 0);
  const docs = JSON.parse(keylang(dir, ["parse", "--json", "f.md"]).stdout);
  const node = docs[0].sections[0].items.find((item: { type: string }) => item.type === "node");
  assert.equal(node.kind, "planned");
  assert.equal(node.id, "domain.x.y");
  assert.equal(node.label.value, "fn");
  assert.equal(node.text.value, "(a: A)→B");
});
