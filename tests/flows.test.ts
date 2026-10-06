// Flow evidence through the real CLI: static reachability, test reports,
// traces (contract and adapter), negative trace scenarios, and `planned`.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { HOOK_FLOW, HOOKS } from "./hooks-fixture.ts";

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
  file: string;
  line: number;
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

test("static: a trigger and steps written as links give the verdicts, positions and hashes of the bare IDs", (t) => {
  const linked = CHECKOUT_FLOW.replace(/(trigger|step) ([\w.]+)/g, (_, keyword: string, id: string) => `${keyword} [${id}](../map/${id.split(".")[0]}.md#${id})`);
  assert.notEqual(linked, CHECKOUT_FLOW);
  const bare = results(repo(t, CHECKOUT, { "flows/checkout.md": CHECKOUT_FLOW })).rows;
  const link = results(repo(t, CHECKOUT, { "flows/checkout.md": linked })).rows;
  assert.equal(row(link, "static", "application.purchase.buy")?.verdict, "ok");
  assert.deepEqual(link, bare);
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

test("calls: a direct call of the parent is static ok, a reliable absence fails, a call keylang cannot pin is unverified; reads is ID only", (t) => {
  const flow = [
    "# flow calls",
    "",
    "- trigger presentation.terminal.checkout",
    "  - calls application.purchase.buy",
    "  - calls domain.order.create",
    "- step application.purchase.buy",
    "  - calls domain.order.create, infrastructure.store.save",
    "  - reads domain.order.create",
    "  - calls presentation.terminal.checkout",
    "",
  ].join("\n");
  const later = "# flow later\n\n- trigger application.purchase.later\n  - calls infrastructure.store.save\n";
  const dir = repo(t, CHECKOUT, { "flows/calls.md": flow, "flows/later.md": later });
  const o = keylang(dir, ["check"]);
  assert.equal(o.status, 1, o.stdout);
  const lines = o.stdout.split("\n").filter((line) => /flows\/(calls|later)\.md:([4-9]):/.test(line));
  assert.deepEqual(lines, [
    "keylang/flows/calls.md:4:11: ID ok application.purchase.buy: exact",
    "keylang/flows/calls.md:4:11: static ok application.purchase.buy: called from presentation.terminal.checkout",
    "keylang/flows/calls.md:5:11: ID ok domain.order.create: exact",
    "keylang/flows/calls.md:5:11: static fail domain.order.create: absence: `presentation.terminal.checkout` does not call `domain.order.create` (it reaches it via application.purchase.buy; `step` proves a path); add a direct call in `presentation.terminal.checkout`",
    "keylang/flows/calls.md:6:1: ID ok application.purchase.buy: exact",
    "keylang/flows/calls.md:6:1: static ok application.purchase.buy: called from presentation.terminal.checkout",
    "keylang/flows/calls.md:7:11: ID ok domain.order.create: exact",
    "keylang/flows/calls.md:7:11: static ok domain.order.create: called from application.purchase.buy",
    "keylang/flows/calls.md:7:32: ID ok infrastructure.store.save: exact",
    "keylang/flows/calls.md:7:32: static ok infrastructure.store.save: called from application.purchase.buy",
    "keylang/flows/calls.md:8:11: ID ok domain.order.create: exact",
    "keylang/flows/calls.md:9:11: ID ok presentation.terminal.checkout: exact",
    "keylang/flows/calls.md:9:11: static fail presentation.terminal.checkout: absence: `application.purchase.buy` does not call `presentation.terminal.checkout`; add a direct call in `application.purchase.buy`",
    "keylang/flows/later.md:4:11: ID ok infrastructure.store.save: exact",
    "keylang/flows/later.md:4:11: static unverified infrastructure.store.save: no resolved call from application.purchase.later; `save` is read as a value at src/application/purchase.ts:13:9, so code keylang cannot follow may call `infrastructure.store.save`",
  ]);
  assert.match(o.stderr, /^2 fail, /m);
  // The spec text is untouched: fmt keeps it.
  assert.equal(keylang(dir, ["fmt", "--check", "keylang/flows"]).status, 0);
});

test("K003: ok on a recovered line and its subtree is unverified, fail stays fail, siblings keep ok", (t) => {
  const flow = [
    "# flow checkout",
    "",
    "- trigger presentation.terminal.checkout",
    "- step application.purchase.buy",
    "   - step domain.order.create",
    "    - step presentation.terminal.checkout",
    "  - step infrastructure.store.save",
    "",
  ].join("\n");
  const dir = repo(t, CHECKOUT, { "flows/checkout.md": flow, "rules.md": "# rules\n\n - deny domain presentation\n- deny domain application\n" });
  const o = keylang(dir, ["check"]);
  assert.equal(o.status, 1, o.stdout);
  const lines = o.stdout.split("\n").filter((line) => /flows\/checkout\.md:[5-7]:/.test(line));
  assert.deepEqual(lines, [
    "keylang/flows/checkout.md:5:4: K003 indentation must be a multiple of 2 spaces, found 3",
    "keylang/flows/checkout.md:5:4: ID unverified domain.order.create: structure recovered after K003 at 5:4; on that structure: exact",
    "keylang/flows/checkout.md:5:4: static unverified domain.order.create: structure recovered after K003 at 5:4; on that structure: called from application.purchase.buy",
    "keylang/flows/checkout.md:6:5: ID unverified presentation.terminal.checkout: structure recovered after K003 at 5:4; on that structure: exact",
    "keylang/flows/checkout.md:6:5: static fail presentation.terminal.checkout: absence: no call path from domain.order.create; `presentation.terminal.checkout` and its callers are called only by name, and no call from domain.order.create's reachable code can reach them; add a call to `presentation.terminal.checkout` in `domain.order.create` or in a function it reaches",
    "keylang/flows/checkout.md:7:3: ID ok infrastructure.store.save: exact",
    "keylang/flows/checkout.md:7:3: static ok infrastructure.store.save: called from application.purchase.buy",
  ]);
  // Rules too: the recovered rule line is unverified, an even one keeps its ok.
  const { rows } = results(dir);
  const deny = (area: string): JsonResult | undefined => rows.find((r) => r.criterion === `deny ${area}`);
  assert.equal(deny("domain presentation")?.verdict, "unverified");
  assert.equal(deny("domain presentation")?.evidence, "structure recovered after K003 at 3:2; on that structure: convergence: no edge from `domain` to `presentation` and no dependency hole in the area");
  assert.equal(deny("domain application")?.verdict, "ok");
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

test("calls: an unresolved call by the target's name in the parent keeps it unverified; another name does not", (t) => {
  const flow = (fn: string): string => `# flow ${fn}\n\n- trigger domain.order.${fn}\n  - calls application.purchase.buy\n`;
  const dir = repo(t, BY_NAME, { "flows/poke.md": flow("poke"), "flows/other.md": flow("other") });
  const o = keylang(dir, ["check"]);
  assert.match(o.stdout, /flows\/poke\.md:4:11: static unverified application\.purchase\.buy: no resolved call from domain\.order\.poke; call through a local value `x\.buy` at src\/domain\/order\.ts:6:3 may be it/);
  assert.match(o.stdout, /flows\/other\.md:4:11: static fail application\.purchase\.buy: absence: `domain\.order\.other` does not call `application\.purchase\.buy`; add a direct call in `domain\.order\.other`$/m);
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

test("static: with no possible route, the escape is cited, not an unrelated unresolved call", (t) => {
  const files = {
    ...CHECKOUT,
    "src/application/aaa.ts": "export function helper(x: { feed(): void }): void {\n  x.feed();\n}\n",
    "src/presentation/app.ts": 'import { helper } from "../application/aaa.ts";\nexport function input(x: { feed(): void }): void {\n  helper(x);\n}\n',
  };
  const dir = repo(t, files, { "flows/app.md": "# flow app\n\n- trigger presentation.app.input\n- step infrastructure.store.save\n" });
  const evidence = row(results(dir).rows, "static", "infrastructure.store.save")!.evidence;
  // `x.feed()` cannot be `save`, and `save` escapes in `viaCallback`, which `input` never reaches.
  assert.match(evidence, /^unverified infrastructure\.store\.save: no call path from presentation\.app\.input in the static graph; `save` is read as a value at src\/application\/purchase\.ts:13:9/);
  assert.doesNotMatch(evidence, /feed/);
});

/** A temp repository of one `app` layer in the given languages, with its files as written. */
function appRepo(t: { after: (f: () => void) => void }, languages: string[], files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-flow-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [path, text] of Object.entries({ "keylang.json": JSON.stringify({ languages, layers: { app: ["src/app/**"] } }), ...files })) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

test("static: code keylang does not read names a caller even when the name is not ASCII", (t) => {
  const dir = appRepo(t, ["python"], {
    "src/app/main.py": 'def зберегти(): pass\ndef start(): pass\nexec("зберегти()")\n',
    "keylang/flows/f.md": "# flow f\n\n- trigger app.main.start\n  - step app.main.зберегти\n",
  });
  const r = row(results(dir).rows, "static", "app.main.зберегти");
  assert.equal(r?.verdict, "unverified", r?.evidence);
  assert.match(r!.evidence, /`exec` runs code keylang cannot read at src\/app\/main\.py:3:1 may call it/);
});

test("static: a path through a function whose calls may not run its body is not a proof", (t) => {
  const dir = appRepo(t, ["python", "typescript"], {
    // Python runs `replacement` for `decorated()`: the body that calls `hit` never runs.
    "src/app/main.py": 'def hit(): print("HIT")\ndef replacement(): print("REPLACEMENT")\ndef replace(fn): return replacement\n@replace\ndef decorated(): hit()\ndef start(): decorated()\n@staticmethod\ndef kept(): hit()\ndef other(): kept()\n',
    // A module with a syntax error does not load.
    "src/app/broken.ts": "export function hit(): void {}\nexport function lonely(): void {}\nexport function start(): void {\n  mid();\n}\nfunction mid(): void {\n  hit();\n  const x = (;\n}\n",
    "keylang/flows/f.md": "# flow f\n\n- trigger app.main.start\n  - step app.main.hit\n  - step app.main.decorated\n\n# flow g\n\n- trigger app.main.other\n  - step app.main.hit\n\n# flow h\n\n- trigger app.broken.start\n  - step app.broken.hit\n  - step app.broken.lonely\n",
  });
  const o = keylang(dir, ["check", "--strict"]);
  assert.equal(o.status, 1, o.stdout);
  assert.match(o.stdout, /f\.md:4:3: static unverified app\.main\.hit: reachable from app\.main\.start via app\.main\.decorated, but `app\.main\.decorated` may not run its own body: decorator `replace` may replace `decorated` at src\/app\/main\.py:4:1/);
  assert.match(o.stdout, /f\.md:5:3: static unverified app\.main\.decorated: called from app\.main\.start, but `app\.main\.decorated` may not run its own body/);
  // A decorator that keeps the function is not a doubt.
  assert.match(o.stdout, /f\.md:10:3: static ok app\.main\.hit: reachable from app\.main\.other via app\.main\.kept/);
  assert.match(o.stdout, /f\.md:15:3: static unverified app\.broken\.hit: reachable from app\.broken\.start via app\.broken\.mid, but `app\.broken\.start` is in a module that does not parse: syntax error at src\/app\/broken\.ts:8:\d+/);
  // Nor is an absence confirmed by calls read from it.
  assert.match(o.stdout, /f\.md:16:3: static unverified app\.broken\.lonely: no call path from app\.broken\.start in the static graph; `app\.broken\.start` is in a module that does not parse/);
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
  assert.match(shape.stdout, /static unverified domain\.build\.build: no resolved path from application\.analyze\.analyze; the default of the hook `generate` \(not followed in static mode shape, set by --static\) at src\/application\/analyze\.ts:4:3 may reach it/);
  assert.match(shape.stdout, /static unverified presentation\.worker\.Worker\.generate: no resolved path from application\.analyze\.analyze; `generate` injected at src\/presentation\/worker\.ts:7:3 \(not followed in static mode shape, set by --static\)/);
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

test("check.static in keylang.json is the mode; --static overrides it and names itself in the evidence", (t) => {
  const flow = { "flows/hooks.md": HOOK_FLOW };
  const shaped = repo(t, HOOKS, flow, { static: "shape" });
  const flagged = repo(t, HOOKS, flow);
  const plain = repo(t, HOOKS, flow);

  const stamp = (row: JsonResult): string => `${row.criterion}\t${row.verdict}\t${row.file}\t${row.line}`;
  const fromConfig = results(shaped);
  const fromFlag = results(flagged, ["--static=shape"]);
  assert.deepEqual(fromConfig.rows.map(stamp), fromFlag.rows.map(stamp));
  assert.match(fromConfig.rows.find((row) => row.evidence.includes("not followed"))!.evidence, /not followed in static mode shape, set by keylang\.json check\.static/);
  assert.match(fromFlag.rows.find((row) => row.evidence.includes("not followed"))!.evidence, /not followed in static mode shape, set by --static/);
  assert.doesNotMatch(JSON.stringify(fromConfig.rows), /not followed with --static=shape/);
  const sarif = keylang(shaped, ["check", "--format", "sarif"]);
  assert.match(sarif.stdout, /not followed in static mode shape, set by keylang\.json check\.static/);
  assert.equal(keylang(shaped, ["check", "--strict"]).status, 1);

  const overridden = keylang(shaped, ["check", "--static=behavior"]);
  const untouched = keylang(plain, ["check"]);
  assert.equal(overridden.status, 0, overridden.stdout + overridden.stderr);
  assert.equal(overridden.stdout, untouched.stdout);

  // An unborn repository treats every file as changed, so --changed still names the config.
  assert.equal(spawnSync("git", ["init"], { cwd: shaped, encoding: "utf8" }).status, 0);
  const changed = keylang(shaped, ["check", "--changed"]);
  assert.match(changed.stdout, /not followed in static mode shape, set by keylang\.json check\.static/);
  const hook = spawnSync(process.execPath, [bin, "hook", "stop"], {
    cwd: shaped,
    input: JSON.stringify({ hook_event_name: "Stop", stop_hook_active: false }),
    encoding: "utf8",
  });
  assert.equal(hook.status, 0, hook.stderr);
  // The shape verdict is unverified, not a fail, so the stop hook does not block.
  assert.equal(hook.stdout, "{}\n", hook.stdout);

  mkdirSync(join(shaped, "keylang/features"), { recursive: true });
  writeFileSync(join(shaped, "keylang/features/hooks.md"), HOOK_FLOW);
  const feature = keylang(shaped, ["feature", "hooks"]);
  assert.equal(feature.status, 1, feature.stdout + feature.stderr);
  assert.match(feature.stdout, /static domain\.build\.build/);

  for (const bad of ["runtime", 1]) {
    const dir = repo(t, HOOKS, { "flows/hooks.md": HOOK_FLOW });
    const config = JSON.parse(readFileSync(join(dir, "keylang.json"), "utf8")) as { check: { static: unknown } };
    config.check = { static: bad };
    writeFileSync(join(dir, "keylang.json"), `${JSON.stringify(config)}\n`);
    for (const command of ["check", "map"]) {
      const out = keylang(dir, [command]);
      assert.equal(out.status, 2, `${command} ${JSON.stringify(bad)}: ${out.stderr}`);
      assert.match(out.stderr, /keylang\.json/);
      assert.match(out.stderr, new RegExp("`check\\.static` must be \"behavior\" or \"shape\", got " + JSON.stringify(bad).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  }
  const unknown = keylang(plain, ["check", "--static=runtime"]);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /unknown --static `runtime`; expected behavior, shape/);
  const help = keylang(plain, ["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--static <mode>[\s\S]*?this flag, then keylang\.json check\.static,\n\s*then behavior/);
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

test("tests: JUnit is read as XML: each suite keeps its own snapshot, attributes may use either quote", (t) => {
  const dir = repo(t, CHECKOUT, { "flows/checkout.md": INVARIANT_FLOW }, { tests: "reports/junit.xml" });
  const area = "invariant total is the sum of the lines";
  mkdirSync(join(dir, "reports"), { recursive: true });
  writeFileSync(join(dir, "reports/junit.xml"), "<testsuites/>");
  const snapshot = snapshotOf(dir);
  const suite = (name: string, id: string, cases: string): string => `<testsuite name='${name}'><properties><property name='keylang.snapshotId' value='${id}'/></properties>${cases}</testsuite>`;
  const junit = (body: string): void => writeFileSync(join(dir, "reports/junit.xml"), `<?xml version='1.0' encoding='UTF-8'?>\n<!-- merged by CI -->\n<testsuites>\n${body}\n</testsuites>\n`);
  // Single quotes, entities, and a comment are plain XML.
  junit(suite("purchase", snapshot, "<testcase file='tests/purchase.test.ts' classname='purchase' name='computes &apos;total&apos;'/><testcase file='tests/purchase.test.ts' classname='purchase' name='computes total'/>"));
  assert.equal(row(results(dir).rows, "tests", area)?.verdict, "ok");
  // A merged report: the first suite is current, the suite that holds the case ran against older code.
  junit(`${suite("other", snapshot, "<testcase file='tests/other.test.ts' classname='other' name='x'/>")}\n${suite("purchase", "0".repeat(64), "<testcase file='tests/purchase.test.ts' classname='purchase' name='computes total'><failure message='no'/></testcase>")}`);
  assert.match(row(results(dir).rows, "tests", area)!.evidence, /unverified .*stale report reports\/junit\.xml/);
  // A property on the testcase binds that case only.
  junit(`<testsuite name="purchase"><testcase file="tests/purchase.test.ts" classname="purchase" name="computes total"><properties><property name="keylang.snapshotId" value="${snapshot}"/></properties><skipped/></testcase></testsuite>`);
  assert.match(row(results(dir).rows, "tests", area)!.evidence, /skipped in reports\/junit\.xml/);
  // Broken XML is an error naming the file and the line.
  writeFileSync(join(dir, "reports/junit.xml"), `<testsuites>\n<testsuite name="a">\n<testcase name="b">\n</testsuite>\n</testsuites>\n`);
  const bad = keylang(dir, ["check"]);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /reports\/junit\.xml:4: invalid XML: <\/testsuite> does not close <testcase>/);
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

/** One test run as trace JSONL. `end` omitted leaves the span open; `endClock` ends it on another clock. */
function traceRun(snapshotId: string, flow: string, spans: (SpanSpec & { endClock?: string })[], run: { testId?: string; complete?: boolean; dropped?: unknown; instrumented?: string[]; open?: string[] } = {}): string {
  const base = { schemaVersion: 1, snapshotId, runId: "r1", testId: run.testId ?? "t1", flow, traceId: "tr" };
  const events: object[] = [];
  for (const span of spans) {
    events.push({ ...base, event: "start", spanId: span.id, parentSpanId: span.parent ?? null, symbolId: span.symbol, clockId: span.clock ?? "c", seq: span.start, ts: 1, ...(span.links ? { links: span.links } : {}) });
    if (span.end !== undefined) events.push({ ...base, event: "end", spanId: span.id, outcome: "ok", clockId: span.endClock ?? span.clock ?? "c", seq: span.end, ts: 1 });
  }
  events.push({ ...base, event: "run", complete: run.complete ?? true, dropped: run.dropped ?? 0, instrumented: run.instrumented ?? [...new Set(spans.map((s) => s.symbol))], ...(run.open ? { open: run.open } : {}) });
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
  const twiceRows = again.write(traceRun(again.snapshot, "checkout", nested(), { instrumented: ALL }));
  const both = twiceRows.filter((r) => r.criterion === "trace" && r.area === SAVE);
  assert.deepEqual(both.map((r) => r.verdict), ["ok", "fail"]);
  // One call satisfies both siblings statically: order and multiplicity are trace concerns.
  assert.deepEqual(twiceRows.filter((r) => r.criterion === "static" && r.area === SAVE).map((r) => r.verdict), ["ok", "ok"]);
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
  const dir = repo(t, CHECKOUT, { "flows/checkout.md": `${CHECKOUT_FLOW}- invariant no more than 3 retries\n` }, { tests: ".keylang/reports/*.json" });
  assert.match(row(results(dir).rows, "tests", "invariant no more than 3 retries")!.evidence, /needs a separate predicate or test \(quantitative or negative property\)/);
});

test("tests: a test file missing from the repository is a K203 warning, with or without check.tests", (t) => {
  const flow = `${INVARIANT_FLOW}- step infrastructure.store.save\n  - test tests/store.test.ts "saves"\n`;
  for (const check of [{}, { tests: ".keylang/reports/*.json" }]) {
    const dir = repo(t, CHECKOUT, { "flows/checkout.md": flow }, check);
    mkdirSync(join(dir, "tests"));
    writeFileSync(join(dir, "tests/store.test.ts"), "");
    const o = keylang(dir, ["check", "--strict"]);
    assert.match(o.stdout, /^keylang\/flows\/checkout\.md:8:10: K203 `tests\/purchase\.test\.ts` does not exist$/m);
    assert.doesNotMatch(o.stdout, /K203 `tests\/store\.test\.ts`/);
    const { rows } = results(dir);
    const warning = rows.find((r) => r.code === "K203");
    assert.equal(warning?.verdict, "warning");
    if (Object.keys(check).length === 0) {
      // A warning blocks nothing, not even with --strict; everything else stays as it was.
      assert.equal(o.status, 0, o.stdout);
      assert.deepEqual(rows.filter((r) => r.criterion === "tests"), []);
    } else assert.match(row(rows, "tests", "invariant total is the sum of the lines")!.evidence, /no report/);
  }
});

test("tests: without check.tests there is no tests evidence, and --strict does not count it", (t) => {
  const dir = repo(t, CHECKOUT, { "flows/checkout.md": `${INVARIANT_FLOW}- invariant no more than 3 retries\n- invariant stock is reserved\n` });
  // The test file exists: a missing one would be a K203 warning.
  mkdirSync(join(dir, "tests"));
  writeFileSync(join(dir, "tests/purchase.test.ts"), "");
  const { status, rows } = results(dir, ["--strict"]);
  assert.equal(status, 0, JSON.stringify(rows.filter((r) => r.verdict !== "ok")));
  assert.deepEqual(rows.filter((r) => r.criterion === "tests"), []);
  assert.doesNotMatch(keylang(dir, ["check"]).stdout, /\btests\b/);
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
  // Metadata of a `run` event is validated too: a string count is not zero.
  const bad = (field: string, value: unknown): string => `{"schemaVersion":1,"runId":"r","testId":"t","flow":"f","event":"run","complete":true,"dropped":0,"instrumented":[],"open":[],"${field}":${JSON.stringify(value)}}\n`;
  for (const [field, value, message] of [
    ["dropped", "5", /t\.jsonl:1: `dropped` must be a non-negative integer/],
    ["dropped", -1, /`dropped` must be a non-negative integer/],
    ["complete", "yes", /t\.jsonl:1: `complete` must be a boolean/],
    ["open", "s1", /t\.jsonl:1: `open` must be an array of span ids/],
  ] as const) {
    writeFileSync(join(dir, ".keylang/trace/t.jsonl"), bad(field, value));
    const o = keylang(dir, ["check"]);
    assert.equal(o.status, 2, `${field}: ${o.stdout}`);
    assert.match(o.stderr, message);
  }
});

test("trace: every span of the trigger and of a step is a candidate; an early return is not a missing step", (t) => {
  const { snapshot, write } = traced(t);
  // `checkout("empty")` returns before `buy`; then `buy` returns early once before the real call.
  const spans: SpanSpec[] = [
    { id: "a0", symbol: T, start: 1, end: 2 },
    { id: "a", symbol: T, start: 3, end: 14 },
    { id: "b0", symbol: BUY, parent: "a", start: 4, end: 5 },
    { id: "b", symbol: BUY, parent: "a", start: 6, end: 11 },
    { id: "c", symbol: CREATE, parent: "b", start: 7, end: 8 },
    { id: "d", symbol: SAVE, parent: "b", start: 9, end: 10 },
  ];
  const rows = write(traceRun(snapshot, "checkout", spans, { instrumented: ALL }));
  for (const id of ALL) assert.equal(row(rows, "trace", id)?.verdict, "ok", `${id}: ${row(rows, "trace", id)?.evidence}`);
  // A sibling's order is kept while the search looks further: `save` before the only full `create` is still out of order.
  const late: SpanSpec[] = [
    { id: "a", symbol: T, start: 1, end: 12 },
    { id: "b", symbol: BUY, parent: "a", start: 2, end: 11 },
    { id: "d", symbol: SAVE, parent: "b", start: 3, end: 4 },
    { id: "c", symbol: CREATE, parent: "b", start: 5, end: 6 },
  ];
  const order = write(traceRun(snapshot, "checkout", late, { instrumented: ALL }));
  assert.equal(row(order, "trace", CREATE)?.verdict, "ok");
  assert.match(row(order, "trace", SAVE)!.evidence, /fail infrastructure\.store\.save: out of order: starts before `domain\.order\.create`/);
  // No invocation of the trigger runs `save`: a real absence stays a failure.
  const none = write(traceRun(snapshot, "checkout", spans.filter((span) => span.symbol !== SAVE), { instrumented: ALL }));
  assert.equal(row(none, "trace", CREATE)?.verdict, "ok");
  assert.match(row(none, "trace", SAVE)!.evidence, /fail infrastructure\.store\.save: missing step in t1/);
});

test("trace: an incomplete run confirms nothing it observed", (t) => {
  const { dir, snapshot, write } = traced(t);
  const verdicts = (rows: JsonResult[]): string[] => ALL.map((id) => row(rows, "trace", id)?.verdict ?? "none");
  // Two starts and no end: the steps were seen, but the run never finished.
  const unfinished: SpanSpec[] = [
    { id: "a", symbol: T, start: 1 },
    { id: "b", symbol: BUY, parent: "a", start: 2 },
  ];
  const open = write(traceRun(snapshot, "checkout", unfinished, { instrumented: ALL, complete: false, open: ["a", "b"] }));
  assert.deepEqual(verdicts(open), ["unverified", "unverified", "unverified", "unverified"]);
  assert.match(row(open, "trace", BUY)!.evidence, /unverified application\.purchase\.buy: observed in t1; incomplete trace/);
  // Every span closed, but the adapter reports one still open or events dropped.
  assert.deepEqual(verdicts(write(traceRun(snapshot, "checkout", nested(), { instrumented: ALL, open: ["x"] }))), ["unverified", "unverified", "unverified", "unverified"]);
  const dropped = write(traceRun(snapshot, "checkout", nested(), { instrumented: ALL, dropped: 2 }));
  assert.match(row(dropped, "trace", SAVE)!.evidence, /observed in t1; incomplete trace \(2 dropped\)/);
  // An order violation in a run that did not finish may be an event it lost.
  const swapped = nested().map((span) => (span.id === "c" ? { ...span, start: 7, end: 8 } : span));
  const lost = row(write(traceRun(snapshot, "checkout", swapped, { instrumented: ALL, complete: false })), "trace", SAVE);
  assert.equal(lost?.verdict, "unverified", lost?.evidence);
  assert.equal(keylang(dir, ["check", "--strict"]).status, 1);
});

test("trace: many calls of every step still give a verdict, not a give-up", (t) => {
  const LATER = "application.purchase.later";
  const flow = `# flow checkout\n\n- trigger ${T}\n  - step ${BUY}\n  - step ${CREATE}\n  - step ${SAVE}\n  - step ${LATER}\n`;
  const { snapshot, write } = traced(t, flow);
  // 150 calls of each step, and every `later` before the first `buy`: no choice puts `later` last.
  const spans: SpanSpec[] = [{ id: "t", symbol: T, start: 0, end: 100_000 }];
  let seq = 1;
  for (const symbol of [LATER, BUY, CREATE, SAVE]) for (let i = 0; i < 150; i++) spans.push({ id: `${symbol}-${i}`, symbol, parent: "t", start: seq++, end: seq++ });
  const started = Date.now();
  const rows = write(traceRun(snapshot, "checkout", spans, { instrumented: [...ALL, LATER] }));
  for (const id of [BUY, CREATE, SAVE]) assert.equal(row(rows, "trace", id)?.verdict, "ok", `${id}: ${row(rows, "trace", id)?.evidence}`);
  assert.match(row(rows, "trace", LATER)!.evidence, /^fail application\.purchase\.later: out of order: starts before `infrastructure\.store\.save`/);
  assert.ok(Date.now() - started < 20_000, `${Date.now() - started} ms`);
});

test("trace: one run is one run across trace files", (t) => {
  const { dir, snapshot, write } = traced(t);
  const [head, ...rest] = traceRun(snapshot, "checkout", nested(), { instrumented: ALL }).trim().split("\n");
  // The processes of one test may write to different files; the run event is in the second one.
  mkdirSync(join(dir, ".keylang/trace"), { recursive: true });
  writeFileSync(join(dir, ".keylang/trace/u.jsonl"), `${rest.slice(-1).join("\n")}\n`);
  const rows = write(`${[head, ...rest.slice(0, -1)].join("\n")}\n`);
  for (const id of [BUY, CREATE, SAVE]) assert.equal(row(rows, "trace", id)?.verdict, "ok", `${id}: ${row(rows, "trace", id)?.evidence}`);
  // Each process reports its own `run` event: the run is complete only when all of them are.
  writeFileSync(join(dir, ".keylang/trace/u.jsonl"), traceRun(snapshot, "checkout", [], { complete: false, instrumented: ALL }));
  assert.equal(row(write(traceRun(snapshot, "checkout", nested(), { instrumented: ALL })), "trace", SAVE)?.verdict, "unverified");
});

test("trace: sequence numbers of different clocks are not compared", (t) => {
  const { snapshot, write } = traced(t);
  // `create` starts and ends on different clocks: its end does not order it before `save`.
  const spans = nested().map((span) => (span.id === "c" ? { ...span, end: 1, endClock: "worker" } : span));
  const r = row(write(traceRun(snapshot, "checkout", spans, { instrumented: ALL })), "trace", SAVE);
  assert.equal(r?.verdict, "unverified", r?.evidence);
  assert.match(r!.evidence, /order unverified: `domain\.order\.create` ended on another clock than `infrastructure\.store\.save` started/);
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

test("trace adapter: a test that returns early from the trigger before the real call is ok", (t) => {
  const files = {
    "src/app/shop.ts": [
      "export function save(n: number): number {",
      "  return n;",
      "}",
      "export function createOrder(items: number[]): number {",
      "  return items.length;",
      "}",
      "export function checkout(items: number[]): void {",
      "  if (items.length === 0) return;",
      "  save(createOrder(items));",
      "}",
      "",
    ].join("\n"),
  };
  const dir = repo(t, files, { "flows/buy.md": "# flow buy\n\n- trigger app.shop.checkout\n  - step app.shop.createOrder\n  - step app.shop.save\n" }, { trace: ".keylang/trace/*.jsonl" });
  snapshotOf(dir);
  const r = spawnSync(process.execPath, ["--import", join(root, "src/adapters/trace.ts"), "--input-type=module", "-e", "const m = await import('./src/app/shop.ts'); m.checkout([]); m.checkout([2]);"], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, KEYLANG_TRACE: join(dir, ".keylang/trace/buy.jsonl"), KEYLANG_TRACE_FLOW: "buy", KEYLANG_TRACE_TEST: "shop > @flow buy" },
  });
  assert.equal(r.status, 0, r.stderr);
  const rows = results(dir, ["--strict"]).rows;
  for (const id of ["app.shop.checkout", "app.shop.createOrder", "app.shop.save"]) assert.equal(row(rows, "trace", id)?.verdict, "ok", `${id}: ${row(rows, "trace", id)?.evidence}`);
});

test("trace adapter: an empty function body is instrumented and still loads", (t) => {
  const files = { "src/app/main.ts": "export function noop() {}\nexport const none = () => {};\nexport function main(): void {\n  noop();\n  none();\n}\n" };
  const dir = repo(t, files, { "flows/f.md": "# flow f\n\n- trigger app.main.main\n  - step app.main.noop\n  - step app.main.none\n" }, { trace: ".keylang/trace/*.jsonl" });
  snapshotOf(dir);
  const r = spawnSync(process.execPath, ["--import", join(root, "src/adapters/trace.ts"), "--input-type=module", "-e", "const m = await import('./src/app/main.ts'); m.main();"], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, KEYLANG_TRACE: join(dir, ".keylang/trace/f.jsonl"), KEYLANG_TRACE_FLOW: "f", KEYLANG_TRACE_TEST: "empty" },
  });
  assert.equal(r.status, 0, r.stderr);
  const meta = readFileSync(join(dir, ".keylang/trace/f.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line)).find((e) => e.event === "run");
  assert.equal(meta.complete, true);
  assert.deepEqual(meta.instrumented, ["app.main.main", "app.main.none", "app.main.noop"]);
  const rows = results(dir).rows;
  for (const id of ["app.main.main", "app.main.noop", "app.main.none"]) assert.equal(row(rows, "trace", id)?.verdict, "ok", id);
});

// ---------- check output of flow evidence ----------

test("check formats: every result has specHash and provenance; an unverified flow result is the rule `unverified`", (t) => {
  const specs = { "rules.md": "# rules\n\n- deny application infrastructure\n", "flows/cb.md": "# flow cb\n\n- trigger application.purchase.viaCallback\n- step infrastructure.store.save\n- step infrastructure.store.gone\n" };
  const dir = repo(t, CHECKOUT, specs, { tests: ".keylang/reports/*.json" });
  const json = keylang(dir, ["check", "--format", "json"]);
  assert.equal(json.status, 1, json.stderr);
  const rows = (JSON.parse(json.stdout) as { results: (JsonResult & { specHash?: string })[] }).results;
  for (const code of ["K102", "K001"]) assert.ok(rows.some((r) => r.code === code), code);
  for (const r of rows) {
    assert.match(r.specHash ?? "", /^[0-9a-f]{64}$/, `${r.code} ${r.evidence}`);
    assert.ok(["syntactic", "test-report", "trace"].includes(r.provenance ?? ""), `${r.code} ${r.evidence}`);
  }
  // The same rule line gives the same hash as the verdict it explains.
  const k102 = rows.find((r) => r.code === "K102")!;
  assert.equal(k102.criterion, "deny application infrastructure");
  assert.equal(k102.provenance, "syntactic");
  const sarif = JSON.parse(keylang(dir, ["check", "--format", "sarif"]).stdout);
  const results = sarif.runs[0].results as { ruleId: string; level: string; properties: { criterion: string; verdict: string; provenance?: string } }[];
  const note = results.find((r) => r.properties.criterion === "static" && r.properties.verdict === "unverified");
  assert.equal(note?.ruleId, "unverified");
  assert.equal(note?.level, "note");
  assert.equal(note?.properties.provenance, "syntactic");
  assert.ok(results.filter((r) => r.properties.verdict === "unverified").every((r) => r.ruleId === "unverified"));
  const rules = (sarif.runs[0].tool.driver.rules as { id: string }[]).map((rule) => rule.id);
  assert.ok(!rules.includes("static") && !rules.includes("tests"), rules.join(" "));
  const github = keylang(dir, ["check", "--format", "github"]).stdout;
  assert.match(github, /^::notice file=keylang\/flows\/cb\.md,line=4,col=1,title=unverified::unverified infrastructure\.store\.save: /m);
  assert.doesNotMatch(github, /title=(static|tests|trace|ID)::/);
});

test("check formats: columns count code points, and SARIF says so", (t) => {
  // The quote is the 26th code point of its line, the 27th UTF-16 unit: 😀 is two units.
  const dir = repo(t, CHECKOUT, { "flows/f.md": `${CHECKOUT_FLOW}  - test tests/😀.test.ts "never closed\n` });
  assert.match(keylang(dir, ["check"]).stdout, /flows\/f\.md:7:26: K005 unterminated quote/);
  const sarif = JSON.parse(keylang(dir, ["check", "--format", "sarif"]).stdout);
  assert.equal(sarif.runs[0].columnKind, "unicodeCodePoints");
  const k005 = (sarif.runs[0].results as { ruleId: string; locations: { physicalLocation: { region: { startLine: number; startColumn: number } } }[] }[]).find((r) => r.ruleId === "K005");
  assert.deepEqual(k005?.locations[0]?.physicalLocation.region, { startLine: 7, startColumn: 26 });
  assert.match(keylang(dir, ["check", "--format", "github"]).stdout, /^::error file=keylang\/flows\/f\.md,line=7,col=26,title=K005::unterminated quote$/m);
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
  const flow = "# flow refund\n\n- planned type application.purchase.buy\n- planned fn domain.order.later\n- planned fn domain.order.later\n- planned event domain.order.create\n";
  const dir = repo(t, CHECKOUT, { "flows/refund.md": flow });
  const o = keylang(dir, ["check"]);
  assert.equal(o.status, 1, o.stdout);
  assert.match(o.stdout, /refund\.md:3:1: K201 planned type `application\.purchase\.buy` is implemented as a fn/);
  assert.match(o.stdout, /refund\.md:5:1: K002 duplicate planned `domain\.order\.later` \(first declared at keylang\/flows\/refund\.md:4:\d+\)/);
  // An event is a kind of its own: a function with its ID is not the event implemented.
  assert.match(o.stdout, /refund\.md:6:1: K201 planned event `domain\.order\.create` is implemented as a fn/);
  assert.doesNotMatch(o.stdout, /K202/);
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

// ---------- inclusion: recursion, interleaving, foreign trees, later triggers, nested siblings ----------

const H = "domain.walk.h";

test("trace: a recursive step needs its own nested span", (t) => {
  const code = { "src/domain/walk.ts": "export function h(): void {\n  h();\n}\n" };
  const one = "# flow rec\n\n- trigger domain.walk.h\n- step domain.walk.h\n";
  const two = "# flow rec\n\n- trigger domain.walk.h\n- step domain.walk.h\n  - step domain.walk.h\n";
  const dir = repo(t, code, { "flows/rec.md": one }, { trace: ".keylang/trace/*.jsonl" });
  const snapshot = snapshotOf(dir);
  const write = (flow: string, spans: SpanSpec[]): JsonResult[] => {
    writeFileSync(join(dir, "keylang/flows/rec.md"), flow);
    mkdirSync(join(dir, ".keylang/trace"), { recursive: true });
    writeFileSync(join(dir, ".keylang/trace/t.jsonl"), traceRun(snapshot, "rec", spans, { instrumented: [H] }));
    return results(dir).rows;
  };
  const stepsOf = (rows: JsonResult[]): JsonResult[] => rows.filter((r) => r.criterion === "trace" && r.area === H).slice(1);
  const lone = [{ id: "a", symbol: H, start: 1, end: 4 }];
  const missing = stepsOf(write(one, lone));
  assert.equal(missing.length, 1);
  assert.match(missing[0]!.evidence, /fail domain\.walk\.h: missing step in t1/);
  const nestedSpan = [...lone, { id: "b", symbol: H, parent: "a", start: 2, end: 3 }];
  assert.deepEqual(stepsOf(write(one, nestedSpan)).map((r) => r.verdict), ["ok"]);
  const deep = stepsOf(write(two, nestedSpan));
  assert.deepEqual(deep.map((r) => r.verdict), ["ok", "fail"]);
  assert.match(deep[1]!.evidence, /missing step in t1/);
});

test("trace: interleaved siblings keep the later span; a swapped nesting is a missing step", (t) => {
  const { snapshot, write } = traced(t);
  const woven: SpanSpec[] = [
    { id: "a", symbol: T, start: 1, end: 12 },
    { id: "b", symbol: BUY, parent: "a", start: 2, end: 11 },
    { id: "d1", symbol: SAVE, parent: "b", start: 3, end: 4 },
    { id: "c", symbol: CREATE, parent: "b", start: 5, end: 6 },
    { id: "d2", symbol: SAVE, parent: "b", start: 7, end: 8 },
  ];
  const rows = write(traceRun(snapshot, "checkout", woven, { instrumented: ALL }));
  assert.equal(row(rows, "trace", CREATE)?.verdict, "ok");
  assert.equal(row(rows, "trace", SAVE)?.verdict, "ok");
  assert.doesNotMatch(row(rows, "trace", SAVE)!.evidence, /out of order/);

  const code = {
    "src/domain/order.ts": "export function create(): void {}\n",
    "src/infrastructure/store.ts": "export function save(): void {}\n",
    "src/application/purchase.ts": 'import { create } from "../domain/order.ts";\nimport { save } from "../infrastructure/store.ts";\nexport function buy(): void {\n  create();\n}\nexport function later(): void {\n  save();\n}\n',
    "src/presentation/terminal.ts": 'import { buy, later } from "../application/purchase.ts";\nexport function checkout(): void {\n  buy();\n  later();\n}\n',
  };
  const LATER = "application.purchase.later";
  const flow = `# flow checkout\n\n- trigger ${T}\n- step ${BUY}\n  - step ${CREATE}\n- step ${LATER}\n  - step ${SAVE}\n`;
  const dir = repo(t, code, { "flows/checkout.md": flow }, { trace: ".keylang/trace/*.jsonl" });
  const id = snapshotOf(dir);
  const run = (spans: SpanSpec[]): { status: number | null; rows: JsonResult[] } => {
    mkdirSync(join(dir, ".keylang/trace"), { recursive: true });
    writeFileSync(join(dir, ".keylang/trace/t.jsonl"), traceRun(id, "checkout", spans, { instrumented: [...ALL, LATER] }));
    return results(dir);
  };
  const swapped = run([
    { id: "a", symbol: T, start: 1, end: 10 },
    { id: "b", symbol: BUY, parent: "a", start: 2, end: 5 },
    { id: "d", symbol: SAVE, parent: "b", start: 3, end: 4 },
    { id: "e", symbol: LATER, parent: "a", start: 6, end: 9 },
    { id: "c", symbol: CREATE, parent: "e", start: 7, end: 8 },
  ]);
  assert.match(row(swapped.rows, "trace", CREATE)!.evidence, /missing step in t1/);
  assert.match(row(swapped.rows, "trace", SAVE)!.evidence, /missing step in t1/);
  const straight = run([
    { id: "b0", symbol: BUY, parent: "a", start: 2, end: 3 },
    { id: "e0", symbol: LATER, parent: "a", start: 4, end: 5 },
    { id: "a", symbol: T, start: 1, end: 14 },
    { id: "b", symbol: BUY, parent: "a", start: 6, end: 9 },
    { id: "c", symbol: CREATE, parent: "b", start: 7, end: 8 },
    { id: "e", symbol: LATER, parent: "a", start: 10, end: 13 },
    { id: "d", symbol: SAVE, parent: "e", start: 11, end: 12 },
  ]);
  assert.equal(straight.status, 0, JSON.stringify(straight.rows.filter((r) => r.verdict !== "ok")));
  for (const area of [BUY, CREATE, LATER, SAVE]) {
    assert.equal(row(straight.rows, "trace", area)?.verdict, "ok", area);
    assert.equal(row(straight.rows, "static", area)?.verdict, "ok", area);
  }
});

test("trace: a when step is not ordered against the siblings of when", (t) => {
  const flow = `# flow checkout\n\n- trigger ${T}\n- step ${BUY}\n  - step ${CREATE}\n  - when the item is out of stock\n    - step ${SAVE}\n`;
  const { snapshot, write } = traced(t, flow);
  const spans: SpanSpec[] = [
    { id: "a", symbol: T, start: 1, end: 10 },
    { id: "b", symbol: BUY, parent: "a", start: 2, end: 9 },
    { id: "d", symbol: SAVE, parent: "b", start: 3, end: 4 },
    { id: "c", symbol: CREATE, parent: "b", start: 5, end: 6 },
  ];
  const rows = write(traceRun(snapshot, "checkout", spans, { instrumented: ALL }));
  assert.match(row(rows, "trace", "when the item is out of stock")!.evidence, /branch exercised/);
  assert.equal(row(rows, "trace", SAVE)?.verdict, "ok");
  assert.equal(row(rows, "trace", CREATE)?.verdict, "ok");
});

test("trace: a step seen only in another call tree is unverified, not a missing step", (t) => {
  const { dir, snapshot, write } = traced(t);
  const base = nested().filter((span) => span.symbol !== SAVE);
  const outside = (span: SpanSpec): JsonResult[] => write(traceRun(snapshot, "checkout", [...base, span], { instrumented: ALL }));
  const worker = outside({ id: "d", symbol: SAVE, start: 1, end: 2, clock: "worker" });
  assert.equal(row(worker, "trace", SAVE)?.verdict, "unverified");
  assert.match(row(worker, "trace", SAVE)!.evidence, /observed outside `application\.purchase\.buy` in another call tree \(root `infrastructure\.store\.save`\)/);
  const linked = outside({ id: "d", symbol: SAVE, start: 1, end: 2, clock: "worker", links: ["b"] });
  assert.match(row(linked, "trace", SAVE)!.evidence, /observed outside `application\.purchase\.buy` in another call tree/);
  const later = outside({ id: "d", symbol: SAVE, start: 11, end: 12 });
  assert.match(row(later, "trace", SAVE)!.evidence, /observed outside `application\.purchase\.buy` in another call tree \(root `infrastructure\.store\.save`\)/);
  const early = outside({ id: "d", symbol: SAVE, start: 1, end: 2 });
  assert.match(row(early, "trace", SAVE)!.evidence, /fail infrastructure\.store\.save: missing step in t1/);
  const sameTree = outside({ id: "d", symbol: SAVE, parent: "a", start: 11, end: 12 });
  assert.match(row(sameTree, "trace", SAVE)!.evidence, /fail infrastructure\.store\.save: missing step in t1/);
  outside({ id: "d", symbol: SAVE, start: 1, end: 2, clock: "worker" });
  const checked = results(dir);
  assert.equal(checked.status, 0, checked.rows.filter((r) => r.verdict === "fail").map((r) => r.evidence).join("\n"));
  assert.equal(row(checked.rows, "trace", SAVE)?.verdict, "unverified");
  assert.equal(keylang(dir, ["check", "--strict"]).status, 1);
  const json = keylang(dir, ["check", "--format", "json"]);
  assert.ok(json.stdout.startsWith("{"), json.stdout);
  assert.equal(json.stdout.trim().endsWith("}"), true);
});

test("trace: a later trigger and a child of a planned step are unverified when a trace is configured", (t) => {
  const planned = `# flow refund\n\n- planned fn application.purchase.refund () → void\n- trigger ${T}\n- step application.purchase.refund\n  - step ${SAVE}\n    - step ${CREATE}\n`;
  const { snapshot, write } = traced(t, planned);
  const rows = write(traceRun(snapshot, "refund", nested(), { instrumented: ALL }));
  assert.match(row(rows, "trace", SAVE)!.evidence, /unverified infrastructure\.store\.save: parent step `application\.purchase\.refund` is planned/);
  assert.match(row(rows, "static", SAVE)!.evidence, /parent `application\.purchase\.refund` is planned, not implemented/);
  assert.match(row(rows, "trace", CREATE)!.evidence, /parent step `application\.purchase\.refund` is planned/);
  const save = rows.find((r) => r.criterion === "trace" && r.area === SAVE);
  assert.equal(save?.verdict, "unverified");

  const two = `# flow checkout\n\n- trigger ${T}\n  - step ${BUY}\n- trigger ${BUY}\n  - step ${CREATE}\n`;
  const second = traced(t, two);
  const both = second.write(traceRun(second.snapshot, "checkout", nested(), { instrumented: ALL }));
  assert.equal(row(both, "trace", T)?.verdict, "ok");
  assert.equal(row(both, "trace", BUY)?.verdict, "ok");
  const laterTrigger = both.filter((r) => r.criterion === "trace" && r.area === BUY);
  assert.equal(laterTrigger.length, 2);
  assert.match(laterTrigger[1]!.evidence, /a flow is matched from its first trigger only/);
  assert.match(row(both, "trace", CREATE)!.evidence, /a flow is matched from its first trigger only/);
  assert.equal(results(second.dir).status, 0);
  assert.equal(keylang(second.dir, ["check", "--strict"]).status, 1);
  const quiet = repo(t, CHECKOUT, { "flows/walk.md": "# flow walk\n\n- trigger domain.walk.h\n  - step domain.walk.h\n- trigger domain.walk.h\n  - step domain.walk.h\n".replaceAll("domain.walk.h", "presentation.terminal.checkout") });
  assert.doesNotMatch(keylang(quiet, ["check"]).stdout, /first trigger only/);
});

test("trace: a sibling nested in the previous sibling fails, sync and async", (t) => {
  const { dir, snapshot, write } = traced(t);
  const sync: SpanSpec[] = [
    { id: "a", symbol: T, start: 1, end: 10 },
    { id: "b", symbol: BUY, parent: "a", start: 2, end: 9 },
    { id: "c", symbol: CREATE, parent: "b", start: 3, end: 6 },
    { id: "d", symbol: SAVE, parent: "c", start: 4, end: 5 },
  ];
  const failSync = write(traceRun(snapshot, "checkout", sync, { instrumented: ALL }));
  assert.match(row(failSync, "trace", SAVE)!.evidence, /fail infrastructure\.store\.save: nested in `domain\.order\.create`, not after it/);
  assert.equal(results(dir).status, 1);
  const asyncSpan: SpanSpec[] = [
    { id: "a", symbol: T, start: 1, end: 10 },
    { id: "b", symbol: BUY, parent: "a", start: 2, end: 9 },
    { id: "c", symbol: CREATE, parent: "b", start: 3, end: 4 },
    { id: "d", symbol: SAVE, parent: "c", start: 5, end: 6, links: ["c"] },
  ];
  assert.match(row(write(traceRun(snapshot, "checkout", asyncSpan, { instrumented: ALL })), "trace", SAVE)!.evidence, /nested in `domain\.order\.create`, not after it/);
  const open = write(traceRun(snapshot, "checkout", sync, { instrumented: ALL, complete: false }));
  assert.equal(row(open, "trace", SAVE)?.verdict, "unverified");
  assert.match(row(open, "trace", SAVE)!.evidence, /nested in `domain\.order\.create`/);

  const twice = CHECKOUT_FLOW.replace("  - step infrastructure.store.save\n", "  - step infrastructure.store.save\n  - step infrastructure.store.save\n");
  const again = traced(t, twice);
  const inner: SpanSpec[] = [
    { id: "a", symbol: T, start: 1, end: 12 },
    { id: "b", symbol: BUY, parent: "a", start: 2, end: 11 },
    { id: "c", symbol: CREATE, parent: "b", start: 3, end: 4 },
    { id: "d", symbol: SAVE, parent: "b", start: 5, end: 8 },
    { id: "e", symbol: SAVE, parent: "d", start: 6, end: 7 },
  ];
  const saves = again.write(traceRun(again.snapshot, "checkout", inner, { instrumented: ALL })).filter((r) => r.criterion === "trace" && r.area === SAVE);
  assert.ok(saves.some((r) => /nested in `infrastructure\.store\.save`, not after it/.test(r.evidence)), saves.map((r) => r.evidence).join(" | "));

  const noTrigger = "# flow checkout\n\n- step domain.order.create\n- step infrastructure.store.save\n";
  const bare = traced(t, noTrigger);
  const bareFail = bare.write(traceRun(bare.snapshot, "checkout", [
    { id: "c", symbol: CREATE, start: 3, end: 6 },
    { id: "d", symbol: SAVE, parent: "c", start: 4, end: 5 },
  ], { instrumented: [CREATE, SAVE] }));
  assert.match(row(bareFail, "trace", SAVE)!.evidence, /nested in `domain\.order\.create`, not after it/);
  const rescued = bare.write(traceRun(bare.snapshot, "checkout", [
    { id: "c", symbol: CREATE, start: 3, end: 6 },
    { id: "d", symbol: SAVE, parent: "c", start: 4, end: 5 },
    { id: "e", symbol: SAVE, start: 7, end: 8 },
  ], { instrumented: [CREATE, SAVE] }));
  assert.equal(row(rescued, "trace", SAVE)?.verdict, "ok", row(rescued, "trace", SAVE)?.evidence);
});
