// Analyzer soundness through the real CLI: what a call resolves to, and when a
// missing static path is a confirmed absence (`fail`) rather than `unverified`.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const bin = join(dirname(fileURLToPath(import.meta.url)), "../bin/keylang.js");

function keylang(cwd: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** A temp repository; layers default to `src/<layer>/**`. */
function repo(t: { after: (f: () => void) => void }, files: Record<string, string>, config: Record<string, unknown> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-analyzer-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const layers = Object.fromEntries([...new Set(Object.keys(files).filter((p) => p.startsWith("src/")).map((p) => p.split("/")[1]!))].map((l) => [l, `src/${l}/**`]));
  writeFileSync(join(dir, "keylang.json"), JSON.stringify({ languages: ["typescript"], layers, ...config }));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

/** `static` lines of `check`, by step id in flow order. */
function statics(dir: string): string[] {
  return keylang(dir, ["check"]).stdout.split("\n").filter((line) => / static /.test(line));
}

interface Snapshot {
  snapshotId: string;
  nodes: Record<string, { kind: string; class?: true; static?: true; name?: string; file: string | null; members?: string; escapes?: { reason: string } }>;
  edges: { kind: string; source: string; target: string | null; resolution: string; text: string; alias?: string; reason?: string; closure?: true }[];
  coverage: { kind: string; file: string; line: number; reason: string }[];
  exports: { module: string; name: string; symbol: string | null; kind: string; form?: string; local?: string; from?: string; reason?: string }[];
}

function snapshot(dir: string): Snapshot {
  const o = keylang(dir, ["map"]);
  assert.equal(o.status, 0, o.stdout + o.stderr);
  return JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as Snapshot;
}

test("exports: a default export, `export { a as b }` and barrel re-exports resolve calls", (t) => {
  const dir = repo(t, {
    "src/a/lib.ts": "export default function step(): void {}\nfunction other(): void {}\nexport { other as run };\nexport function s2(): void {}\n",
    "src/a/barrel.ts": 'export { run as renamed, s2 } from "./lib.ts";\nexport * as ns from "./lib.ts";\n',
    "src/b/main.ts": [
      'import go from "../a/lib.ts";',
      'import { run } from "../a/lib.ts";',
      'import { renamed, s2, ns } from "../a/barrel.ts";',
      "export function main(): void {",
      "  go();",
      "  run();",
      "  s2();",
      "}",
      "export function viaBarrel(): void {",
      "  renamed();",
      "  ns.s2();",
      "}",
      "",
    ].join("\n"),
    "keylang/flows/f.md": "# flow f\n\n- trigger b.main.main\n- step a.lib.step\n- step a.lib.other\n- step a.lib.s2\n\n# flow g\n\n- trigger b.main.viaBarrel\n- step a.lib.other\n",
  });
  const lines = statics(dir);
  assert.equal(lines.length, 4, lines.join("\n"));
  assert.match(lines.pop()!, /static ok a\.lib\.other: called from b\.main\.viaBarrel/);
  for (const line of lines) assert.match(line, /static ok a\.lib\.\w+: called from b\.main\.main/);
  const calls = snapshot(dir).edges.filter((e) => e.kind === "call" && e.source.startsWith("b.main.")).map((e) => `${e.source}: ${e.text} → ${e.target}`);
  assert.deepEqual(calls.sort(), ["b.main.main: go → a.lib.step", "b.main.main: run → a.lib.other", "b.main.main: s2 → a.lib.s2", "b.main.viaBarrel: ns.s2 → a.lib.s2", "b.main.viaBarrel: renamed → a.lib.other"]);
});

test("classes: `this.#m()` resolves; static, instance and #private members of one name get distinct IDs", (t) => {
  const dir = repo(t, {
    "src/a/x.ts": [
      "export function hit(): void {}",
      "export class X {",
      "  run(): void { this.#work(); }",
      "  #work(): void {}",
      "  static m(): void { hit(); }",
      "  m(): void {}",
      "}",
      "export class Y {",
      "  #go(): void { hit(); }",
      "  go(): void {}",
      "  static boot(): void { this.m(); }",
      "  static m(): void {}",
      "}",
      "export function main(): void { const y = new Y(); y.go(); }",
      "export function viaStatic(): void { X.m(); }",
      "",
    ].join("\n"),
    "keylang/flows/f.md": [
      "# flow f\n\n- trigger a.x.X.run\n- step a.x.X.work\n",
      "# flow g\n\n- trigger a.x.main\n- step a.x.hit\n",
      "# flow h\n\n- trigger a.x.viaStatic\n- step a.x.hit\n",
      "# flow i\n\n- trigger a.x.Y.boot\n- step a.x.Y.m\n",
    ].join("\n"),
  });
  const nodes = snapshot(dir).nodes;
  for (const id of ["a.x.X.work", "a.x.X.m", "a.x.X.m-static", "a.x.Y.go", "a.x.Y.go-private", "a.x.Y.m"]) assert.equal(nodes[id]?.kind, "fn", id);
  const lines = statics(dir);
  assert.match(lines[0]!, /static ok a\.x\.X\.work: called from a\.x\.X\.run/);
  // `y.go()` runs the public `go`; only `#go` calls `hit`.
  assert.match(lines[1]!, /static fail a\.x\.hit: absence: no call path from a\.x\.main/);
  assert.match(lines[2]!, /static ok a\.x\.hit: reachable from a\.x\.viaStatic via a\.x\.X\.m-static/);
  assert.match(lines[3]!, /static ok a\.x\.Y\.m: called from a\.x\.Y\.boot/);
});

test("module-level code: a wrapped function value or an object method is an escape; CommonJS exports are fns", (t) => {
  const dir = repo(t, {
    "src/a/lib.ts": "export function cache<T>(f: T): T { return f; }\nexport function step(): void {}\n",
    "src/a/api.ts": 'import { cache, step } from "./lib.ts";\nexport const load = cache(() => { step(); });\n',
    "src/a/more.ts": 'import { step } from "./lib.ts";\nexport function more(): void {}\nexport const handlers = { run() { step(); } };\nexport const typed = (() => { more(); }) as () => void;\n',
    "src/b/main.ts": 'import { load } from "../a/api.ts";\nimport { handlers, typed } from "../a/more.ts";\nexport function main(): void {\n  load();\n}\nexport function main2(): void {\n  handlers.run();\n}\nexport function main3(): void {\n  typed();\n}\n',
    "src/c/lib.js": "function step() {}\nexports.run = function () { step(); };\nmodule.exports.go = () => { step(); };\n",
    "src/c/main.js": 'const lib = require("./lib.js");\nfunction main() {\n  lib.run();\n  lib.go();\n}\nmodule.exports = { main };\n',
    "keylang/flows/f.md": [
      "# flow f\n\n- trigger b.main.main\n- step a.lib.step\n",
      "# flow g\n\n- trigger b.main.main2\n- step a.lib.step\n",
      "# flow h\n\n- trigger b.main.main3\n- step a.more.more\n",
      "# flow j\n\n- trigger c.main.main\n- step c.lib.run\n- step c.lib.go\n",
    ].join("\n"),
  }, { languages: ["typescript", "javascript"] });
  const lines = statics(dir);
  assert.match(lines[0]!, /static unverified a\.lib\.step: .*`step` is called from a function value outside declarations at src\/a\/api\.ts:2:35/);
  assert.match(lines[1]!, /static unverified a\.lib\.step: /);
  assert.match(lines[2]!, /static ok a\.more\.more: reachable from b\.main\.main3 via a\.more\.typed/);
  assert.match(lines[3]!, /static ok c\.lib\.run: called from c\.main\.main/);
  assert.match(lines[4]!, /static ok c\.lib\.go: called from c\.main\.main/);
});

test("module-level code: a module loaded by `import()` or a worker runs its top level, so its calls are not absent", (t) => {
  const dir = repo(t, {
    "src/a/plugin.ts": "export function step(): void {}\nstep();\n",
    "src/a/w.ts": "export function wstep(): void {}\nwstep();\n",
    "src/b/main.ts": 'export async function main(): Promise<void> {\n  await import("../a/plugin.ts");\n}\nexport function main2(): void {\n  new Worker(new URL("../a/w.ts", import.meta.url));\n}\n',
    "keylang/flows/f.md": "# flow f\n\n- trigger b.main.main\n- step a.plugin.step\n\n# flow g\n\n- trigger b.main.main2\n- step a.w.wstep\n",
  });
  const lines = statics(dir);
  assert.match(lines[0]!, /static unverified a\.plugin\.step: no call path from b\.main\.main in the static graph; `step` is called from module-level code at src\/a\/plugin\.ts:2:1/);
  assert.match(lines[1]!, /static unverified a\.w\.wstep: .*module-level code at src\/a\/w\.ts:2:1/);
});

test("imports: a workspace package is internal through its node_modules link or `workspaces`, and installs change the snapshot id", (t) => {
  const dir = repo(t, {
    "package.json": '{"name":"root","private":true,"workspaces":["packages/*"]}',
    "packages/lib/package.json": '{"name":"@acme/lib","exports":{".":"./src/index.ts","./util":"./src/util.ts"}}',
    "packages/lib/src/index.ts": "export function f(): void {}\n",
    "packages/lib/src/util.ts": "export function g(): void {}\n",
    "packages/app/package.json": '{"name":"@acme/app","dependencies":{"@acme/lib":"*"}}',
    "packages/app/src/main.ts": 'import { f } from "@acme/lib";\nimport { g } from "@acme/lib/util";\nexport function main(): void { f(); g(); }\n',
    "keylang/rules.md": "# rules\n\n- deny app lib\n",
  }, { layers: { app: ["packages/app/**"], lib: ["packages/lib/**"] } });
  const denied = (): string => {
    const o = keylang(dir, ["check"]);
    assert.equal(o.status, 1, o.stdout);
    return o.stdout;
  };
  // Not installed: the `workspaces` entry with that name.
  assert.match(denied(), /packages\/app\/src\/main\.ts:1:1: K102 .*depends on `lib\.src`/);
  const before = snapshot(dir).snapshotId;
  mkdirSync(join(dir, "node_modules/@acme"), { recursive: true });
  symlinkSync("../../packages/lib", join(dir, "node_modules/@acme/lib"), "dir");
  const out = denied();
  assert.match(out, /packages\/app\/src\/main\.ts:1:1: K102 .*depends on `lib\.src`/);
  assert.match(out, /packages\/app\/src\/main\.ts:2:1: K102 .*depends on `lib\.src\.util`/);
  const calls = snapshot(dir).edges.filter((e) => e.kind === "call" && e.source === "app.src.main.main").map((e) => e.target);
  assert.deepEqual(calls.sort(), ["lib.src.f", "lib.src.util.g"]);
  assert.notEqual(snapshot(dir).snapshotId, before);
  // An entry keylang does not index is a hole, not a clean dependency list.
  writeFileSync(join(dir, "packages/lib/package.json"), '{"name":"@acme/lib","exports":"./dist/index.js"}');
  mkdirSync(join(dir, "packages/lib/dist"), { recursive: true });
  writeFileSync(join(dir, "packages/lib/dist/index.js"), "exports.f = () => {};\n");
  const holes = snapshot(dir).coverage.filter((c) => c.kind === "unresolved-import").map((c) => `${c.file}:${c.line} ${c.reason}`);
  assert.ok(holes.some((h) => /main\.ts:2 unresolved import `@acme\/lib\/util`/.test(h)), holes.join("\n"));
});

test("imports: `import y = require()` and `import.meta.resolve()` are edges; a computed module URL is a hole", (t) => {
  const dir = repo(t, {
    "src/lib/y.ts": "export function f(): void {}\n",
    "src/lib/w.ts": "export function w(): void {}\n",
    "src/app/a.ts": 'import y = require("../lib/y");\nexport function main(): void { y.f(); }\n',
    "src/app/b.ts": 'export function start(): void { new Worker(import.meta.resolve("../lib/w.ts")); }\n',
    "src/app/c.ts": [
      "export function load(name: string): void {",
      "  new Worker(new URL(`../lib/${name}.ts`, import.meta.url));",
      '  new Worker(new URL("../lib/" + name + ".ts", import.meta.url));',
      "  new URL(`./img/${name}.png`, import.meta.url);",
      "}",
      "",
    ].join("\n"),
  });
  const snap = snapshot(dir);
  const imports = snap.edges.filter((e) => e.kind === "import").map((e) => `${e.source} → ${e.target}`);
  assert.ok(imports.includes("app.a → lib.y") && imports.includes("app.b → lib.w"), imports.join("\n"));
  assert.ok(snap.edges.some((e) => e.kind === "call" && e.source === "app.a.main" && e.target === "lib.y.f"));
  const computed = snap.coverage.filter((c) => c.reason === "computed specifier").map((c) => `${c.file}:${c.line}`);
  assert.deepEqual(computed, ["src/app/c.ts:2", "src/app/c.ts:3"]);
  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- deny app lib\n");
  const o = keylang(dir, ["check"]);
  assert.match(o.stdout, /src\/app\/a\.ts:1:1: K102 /);
});

test("classes: a method of a class with an external or unknown base may be called by that base", (t) => {
  const dir = repo(t, {
    "src/a/s.ts": 'import { Readable } from "node:stream";\nexport class MyStream extends Readable {\n  _read(): void { step(); }\n}\nexport class Mine extends MyStream {\n  more(): void {}\n}\nexport class Plain {\n  run(): void {}\n}\nexport function step(): void {}\nexport function main(): void {\n  new Plain().run();\n}\n',
    "keylang/flows/f.md": "# flow f\n\n- trigger a.s.main\n- step a.s.MyStream._read\n\n# flow g\n\n- trigger a.s.main\n- step a.s.Mine.more\n",
  });
  const lines = statics(dir);
  assert.match(lines[0]!, /static unverified a\.s\.MyStream\._read: .*`_read` may be called by the base class `Readable` at src\/a\/s\.ts:3:3/);
  assert.match(lines[1]!, /static unverified a\.s\.Mine\.more: .*`more` may be called by the base class `Readable`/);
});

test("receivers: a loop variable or a rebound class name hides the declared class", (t) => {
  const dir = repo(t, {
    "src/a/x.ts": [
      "export class X {",
      "  m(): void { hit(); }",
      "}",
      "export class Y { m(): void {} }",
      "export function hit(): void {}",
      "export function p(Ctor: typeof Y): void {",
      "  const X = Ctor;",
      "  const w = new X();",
      "  w.m();",
      "}",
      "export function q(list: Y[]): void {",
      "  const w = new X();",
      "  for (const w of list) w.m();",
      "}",
      "export function r(): void {",
      "  const w = new X();",
      "  w.m();",
      "}",
      "",
    ].join("\n"),
    "keylang/flows/f.md": ["p", "q", "r"].map((fn) => `# flow ${fn}\n\n- trigger a.x.${fn}\n- step a.x.hit\n`).join("\n"),
  });
  const lines = statics(dir);
  assert.match(lines[0]!, /static unverified a\.x\.hit: no resolved path from a\.x\.p; call through a local value `w\.m` at src\/a\/x\.ts:9:3/);
  assert.match(lines[1]!, /static unverified a\.x\.hit: no resolved path from a\.x\.q; call through a local value `w\.m` at src\/a\/x\.ts:13:25/);
  assert.match(lines[2]!, /static ok a\.x\.hit: reachable from a\.x\.r via a\.x\.X\.m/);
});

test("static: `eval` in code a possible route reaches keeps the step unverified", (t) => {
  const dir = repo(t, {
    "src/a/x.ts": [
      "export function step(): void {}",
      "export class Plugin {",
      "  exec(code: string): void { eval(code); }",
      "}",
      "export function main(p: { exec(c: string): void }): void {",
      '  p.exec("x");',
      "}",
      "",
    ].join("\n"),
    "keylang/flows/f.md": "# flow f\n\n- trigger a.x.main\n- step a.x.step\n",
  });
  assert.match(statics(dir)[0]!, /static unverified a\.x\.step: .*unsupported construct `eval` at src\/a\/x\.ts:3:30 may call it/);
});

test("static: `this` in an object-literal method is not the class; a route only through a closure is unverified", (t) => {
  const dir = repo(t, {
    "src/a/x.ts": [
      "export function hit(): void {}",
      "export class Z {",
      "  run(): void {",
      "    const o = { go() { this.helper(); } };",
      "  }",
      "  helper(): void {}",
      "  each(items: number[]): void { items.forEach(() => this.helper()); }",
      "}",
      "export function s(): () => void {",
      "  return () => hit();",
      "}",
      "",
    ].join("\n"),
    "keylang/flows/f.md": "# flow z\n\n- trigger a.x.Z.run\n- step a.x.Z.helper\n\n# flow s\n\n- trigger a.x.s\n- step a.x.hit\n\n# flow e\n\n- trigger a.x.Z.each\n- step a.x.Z.helper\n",
  });
  const lines = statics(dir);
  assert.match(lines[0]!, /static unverified a\.x\.Z\.helper: no resolved path from a\.x\.Z\.run; call through `this` of a function value `this\.helper` at src\/a\/x\.ts:4:24/);
  assert.match(lines[1]!, /static unverified a\.x\.hit: no resolved path from a\.x\.s; reached only through a closure of a\.x\.s: `hit` at src\/a\/x\.ts:10:16 runs only when that function value is called/);
  // An arrow keeps the method's `this`: the call resolves, still only through the closure.
  assert.match(lines[2]!, /static unverified a\.x\.Z\.helper: no resolved path from a\.x\.Z\.each; reached only through a closure of a\.x\.Z\.each/);
});

test("classes: a static initializer runs on module load; `this` in it is the class", (t) => {
  const dir = repo(t, {
    "src/a/x.ts": "export function hit(): void {}\nexport class K {\n  static v = K.make();\n  static make(): number { hit(); return 1; }\n  static { this.make(); }\n}\nexport function main(): void {}\n",
    "keylang/flows/f.md": "# flow f\n\n- trigger a.x.main\n- step a.x.hit\n\n# flow g\n\n- trigger a.x.K.static\n- step a.x.K.make\n",
  });
  const lines = statics(dir);
  assert.match(lines[0]!, /static unverified a\.x\.hit: .*a static initializer runs when the module loads at src\/a\/x\.ts:3:3/);
  assert.match(lines[1]!, /static ok a\.x\.K\.make: called from a\.x\.K\.static/);
});

test("imports: `paths` and `baseUrl` win over built-in names; the most specific pattern wins; inherited `paths` move with `baseUrl`; `#imports` of the nearest package.json", (t) => {
  const dir = repo(t, {
    "tsconfig.base.json": '{"compilerOptions":{"paths":{"constants":["./lib/constants.ts"],"@/*":["./lib/*"],"@/protected/*":["./secret/*"]}}}',
    "tsconfig.json": '{"extends":"./tsconfig.base.json","compilerOptions":{"baseUrl":"./src"}}',
    "package.json": '{"imports":{"#z":"./nowhere.ts"}}',
    "src/lib/constants.ts": "export function danger(): void {}\n",
    "src/events.ts": "export function on(): void {}\n",
    "src/lib/x.tsx": "export function x(): void {}\n",
    "src/lib/y.tsx": "export function y(): void {}\n",
    "src/lib/protected/store.ts": "export function save(): void {}\n",
    "src/secret/store.ts": "export function save(): void {}\n",
    "src/app/a.ts": [
      'import { danger } from "constants";',
      'import { on } from "events";',
      'import { save } from "@/protected/store";',
      'import { x } from "@/x";',
      'import { y } from "../lib/y.jsx";',
      "export function main(): void { danger(); on(); save(); x(); y(); }",
      "",
    ].join("\n"),
    "web/package.json": '{"name":"web","imports":{"#z":"./src/z.ts"}}',
    "web/src/z.ts": "export function z(): void {}\n",
    "web/src/app/w.ts": 'import { z } from "#z";\nexport function main(): void { z(); }\n',
    "keylang/rules.md": "# rules\n\n- deny app lib\n- deny app secret\n",
  }, { layers: { app: ["src/app/**", "web/src/app/**"], lib: ["src/lib/**", "src/events.ts", "web/src/z.ts"], secret: ["src/secret/**"] } });
  const o = keylang(dir, ["check"]);
  assert.equal(o.status, 1, o.stdout + o.stderr);
  assert.match(o.stdout, /src\/app\/a\.ts:1:1: K102 divergence: `app\.a` depends on `lib\.constants`/);
  assert.match(o.stdout, /src\/app\/a\.ts:2:1: K102 divergence: `app\.a` depends on `lib\.events`/);
  // `@/protected/*` is more specific than `@/*`, whichever comes first.
  assert.match(o.stdout, /src\/app\/a\.ts:3:1: K102 divergence: `app\.a` depends on `secret\.store`/);
  assert.doesNotMatch(o.stdout, /lib\.protected/);
  // The inherited `@/*` resolves against the child's `baseUrl`: `src/lib/x.tsx`.
  assert.match(o.stdout, /src\/app\/a\.ts:4:1: K102 divergence: `app\.a` depends on `lib\.x`/);
  assert.match(o.stdout, /src\/app\/a\.ts:5:1: K102 divergence: `app\.a` depends on `lib\.y`/);
  assert.match(o.stdout, /web\/src\/app\/w\.ts:1:1: K102 divergence: `app\.w` depends on `lib\.z`/);
  assert.doesNotMatch(o.stdout, /unverified/);
});

test("calls: `new ns.X()`, `new C().m()`, a class merged with its interface, a default import beside a same-named export, `super()`; an unknown callee is a hole", (t) => {
  const dir = repo(t, {
    "src/lib/svc.ts": [
      "export class X { constructor() { hit(); } }",
      "export interface Foo { a: number }",
      "export class Foo { run(): void { hit(); } }",
      "export class Base { constructor() { hit(); } }",
      "export class Derived extends Base { constructor() { super(); } }",
      "export function hit(): void {}",
      "",
    ].join("\n"),
    "src/lib/api.ts": "export function hit(): void {}\nexport default class Actual { static hit(): void {} }\nexport class Twin { m(): void {} static m(): void {} }\n",
    "src/app/a.ts": [
      'import * as ns from "../lib/svc.ts";',
      'import { Foo, Derived } from "../lib/svc.ts";',
      'import API from "../lib/api.ts";',
      "export function viaNamespace(): void { new ns.X(); }",
      "export function merged(): void { new Foo().run(); }",
      "export function viaDefault(): void { API.hit(); }",
      "export function viaSuper(): void { new Derived(); }",
      "export function opaque(pick: () => () => void): void { pick()(); }",
      "export function typed(foo: ns.Foo): void {}",
      "",
    ].join("\n"),
    "keylang/flows/f.md": [
      "# flow a\n\n- trigger app.a.viaNamespace\n- step lib.svc.X.constructor\n",
      "# flow b\n\n- trigger app.a.merged\n- step lib.svc.Foo.run\n",
      "# flow c\n\n- trigger app.a.viaDefault\n- step lib.api.Actual.hit\n",
      "# flow d\n\n- trigger app.a.viaSuper\n- step lib.svc.Base.constructor\n",
    ].join("\n"),
  });
  const lines = statics(dir);
  assert.match(lines[0]!, /static ok lib\.svc\.X\.constructor: called from app\.a\.viaNamespace/);
  assert.match(lines[1]!, /static ok lib\.svc\.Foo\.run: called from app\.a\.merged/);
  assert.match(lines[2]!, /static ok lib\.api\.Actual\.hit: called from app\.a\.viaDefault/);
  assert.match(lines[3]!, /static ok lib\.svc\.Base\.constructor: reachable from app\.a\.viaSuper via lib\.svc\.Derived\.constructor/);
  const snap = snapshot(dir);
  // `API` is the default export `Actual`, not the module: `API.hit()` is not `lib.api.hit`.
  assert.deepEqual(snap.edges.filter((e) => e.kind === "call" && e.source === "app.a.viaDefault").map((e) => e.target), ["lib.api.Actual.hit"]);
  assert.equal(snap.nodes["lib.svc.Foo"]?.class, true);
  assert.equal(snap.nodes["lib.api.Actual.hit"]?.static, true);
  assert.equal(snap.nodes["lib.api.Twin.m-static"]?.name, "m");
  assert.equal(snap.nodes["lib.api.Twin.m"]?.static, undefined);
  assert.ok(snap.coverage.some((c) => c.kind === "dynamic-call" && c.reason === "call through an expression `pick()`"), JSON.stringify(snap.coverage));
  // `ns.Foo` with `import * as ns` is the export `Foo` of that module.
  assert.deepEqual(snap.edges.filter((e) => e.kind === "type" && e.source === "app.a.typed").map((e) => [e.target, e.resolution]), [["lib.svc.Foo", "resolved"]]);
});

test("exports: every export form names its symbol; `export *` resolves cycles, drops ambiguous names and stays unknown for an opaque source", (t) => {
  const dir = repo(
    t,
    {
      "src/lib/x.ts": "export function a(): void {}\nexport default function d(): void {}\n",
      "src/lib/forms.ts": [
        'export { a } from "./x.ts";',
        'export { a as renamed, default as dflt } from "./x.ts";',
        'import * as ns from "./x.ts";',
        "export { ns };",
        'export * as star from "./x.ts";',
        "export namespace Util { export const k = 1; }",
        "export default 3;",
        "",
      ].join("\n"),
      "src/lib/eq.ts": "function api(): void {}\nexport = api;\n",
      "src/lib/h.ts": "function handler(): void {}\nexport default handler;\n",
      "src/lib/c1.ts": 'export * from "./c2.ts";\nexport function one(): void {}\n',
      "src/lib/c2.ts": 'export * from "./c3.ts";\nexport function two(): void {}\n',
      "src/lib/c3.ts": 'export * from "./c1.ts";\nexport function three(): void {}\n',
      "src/lib/p.ts": "export function dup(): void {}\n",
      "src/lib/q.ts": "export function dup(): void {}\n",
      "src/lib/both.ts": 'export * from "./p.ts";\nexport * from "./q.ts";\n',
      "src/lib/gen.ts": "export function g(): void {}\n",
      "src/lib/wrap.ts": 'export * from "./gen.ts";\nexport function w(): void {}\n',
      "keylang/rules.md": [
        "# rules",
        "",
        "- module lib.forms",
        "  - exports a, renamed, dflt, ns, star, Util, default",
        "- module lib.eq",
        "  - exports default",
        "- module lib.c3",
        "  - exports one, two, three",
        "- module lib.both",
        "  - exports dup",
        "- module lib.wrap",
        "  - exports w, g",
        "",
      ].join("\n"),
    },
    { exclude: ["src/lib/gen.ts"] },
  );
  const o = keylang(dir, ["check"]);
  assert.equal(o.status, 1, o.stdout + o.stderr);
  assert.deepEqual(
    o.stdout.split("\n").filter((l) => l.startsWith("keylang/rules.md")),
    ["keylang/rules.md:10:3: K104 absence: `lib.both` does not export `dup`", "keylang/rules.md:12:3: unverified re-export from `lib.gen`, whose contents keylang did not read"],
  );
  assert.match(o.stderr, /1 fail, 1 unverified, 3 ok/);
  const snap = snapshot(dir);
  const row = (module: string, name: string) => snap.exports.find((e) => e.module === module && e.name === name);
  assert.deepEqual(row("lib.forms", "a"), { module: "lib.forms", name: "a", symbol: "lib.x.a", kind: "fn", form: "reexport", from: "lib.x" });
  assert.deepEqual(row("lib.forms", "renamed"), { module: "lib.forms", name: "renamed", symbol: "lib.x.a", kind: "fn", form: "reexport", local: "a", from: "lib.x" });
  assert.equal(row("lib.forms", "dflt")?.symbol, "lib.x.d");
  assert.deepEqual([row("lib.forms", "ns")?.symbol, row("lib.forms", "ns")?.form, row("lib.forms", "star")?.form], ["lib.x", "namespace", "namespace"]);
  assert.deepEqual(row("lib.forms", "Util"), { module: "lib.forms", name: "Util", symbol: null, kind: "value", form: "namespace" });
  assert.deepEqual(row("lib.forms", "default"), { module: "lib.forms", name: "default", symbol: null, kind: "value", form: "default" });
  assert.deepEqual(row("lib.x", "default"), { module: "lib.x", name: "default", symbol: "lib.x.d", kind: "fn", form: "default", local: "d" });
  assert.deepEqual(row("lib.eq", "default"), { module: "lib.eq", name: "default", symbol: "lib.eq.api", kind: "fn", form: "default", local: "api" });
  assert.deepEqual(snap.exports.filter((e) => e.module === "lib.c1").map((e) => e.name), ["one", "three", "two"]);
  // `import * as ns from "./x.ts"` and `export { a } from "./x.ts"`: one dependency, an edge of each kind.
  assert.deepEqual(snap.edges.filter((e) => e.source === "lib.forms" && e.target === "lib.x").map((e) => `${e.kind} ${e.alias}`).sort(), ["import x", "reexport x"]);
  // Exporting a function is not reading it as a value.
  assert.equal(snap.nodes["lib.h.handler"]?.escapes, undefined);
  assert.equal(snap.nodes["lib.eq.api"]?.escapes, undefined);
});

test("static: a direct call beside the same call in a closure proves the path; a `require` parameter and a URL of a non-module are not imports; a file of an unlisted language is a hole", (t) => {
  const dir = repo(t, {
    "src/lib/x.ts": "export function hit(): void {}\n",
    "src/lib/worker.ts": "export function w(): void {}\n",
    "src/lib/legacy.js": "exports.old = function () {};\n",
    "src/app/a.ts": 'import { hit } from "../lib/x.ts";\nexport function main(): void {\n  const deferred = () => hit();\n  hit();\n  deferred();\n}\n',
    "src/app/b.ts": 'export function load(require: (s: string) => unknown): void { require("../lib/x.ts"); }\n',
    "src/app/c.ts": 'export function start(): void {\n  new Worker(new URL("../lib/worker", import.meta.url));\n  new URL("./LICENSE", import.meta.url);\n}\n',
    "src/app/d.ts": 'import { old } from "../lib/legacy.js";\nexport function use(): void { old(); }\n',
    "keylang/flows/f.md": "# flow f\n\n- trigger app.a.main\n- step lib.x.hit\n",
    "keylang/rules.md": "# rules\n\n- deny app lib\n",
  });
  const o = keylang(dir, ["check"]);
  assert.match(o.stdout, /static ok lib\.x\.hit: called from app\.a\.main/);
  assert.match(o.stdout, /src\/app\/a\.ts:1:1: K102 /);
  assert.match(o.stdout, /src\/app\/c\.ts:2:14: K102 divergence: `app\.c` depends on `lib\.worker`/);
  assert.doesNotMatch(o.stdout, /src\/app\/b\.ts:\d+:\d+: K102/);
  const snap = snapshot(dir);
  const imports = snap.coverage.filter((c) => c.kind === "unresolved-import").map((c) => `${c.file}:${c.line} ${c.reason}`);
  assert.deepEqual(imports, ["src/app/d.ts:1 unresolved import `../lib/legacy.js` (`src/lib/legacy.js` is javascript, which `languages` does not list)"]);
});

test("modules: two paths of one ID are an opaque module with a hole; scoped packages keep their own IDs; `dir` mode keeps an `index` directory and knows a class in any file", (t) => {
  const dir = repo(t, {
    "package.json": '{"dependencies":{"@scope/pkg":"1","scope-pkg":"1"}}',
    "src/lib/foo.bar.ts": "export function one(): void {}\n",
    "src/lib/foo_bar.ts": "export function two(): void {}\n",
    "src/lib/s/t/index.ts": "export function t(): void {}\n",
    "src/app/a.ts": 'import { a } from "@scope/pkg";\nimport { b } from "scope-pkg";\nexport function main(): void { a(); b(); }\n',
  });
  const o = keylang(dir, ["map"]);
  assert.equal(o.status, 0, o.stderr);
  assert.match(o.stderr, /src\/lib\/foo_bar\.ts: module ID collision: same module ID as `src\/lib\/foo\.bar\.ts` \(`lib\.foo_bar`\)/);
  assert.match(o.stderr, /`@scope\/pkg` is `external\.scope-pkg-2`/);
  const snap = JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as Snapshot;
  assert.equal(snap.nodes["lib.foo_bar"]?.members, "opaque");
  // A directory node stands for its own directory, not the one of the index file below it.
  assert.equal(snap.nodes["lib.s"]?.file, "src/lib/s");
  assert.ok(snap.coverage.some((c) => c.kind === "unsupported" && c.file === "src/lib/foo_bar.ts" && /module ID collision/.test(c.reason)));
  assert.deepEqual(snap.edges.filter((e) => e.kind === "import" && e.source === "app.a").map((e) => e.target).sort(), ["external.scope-pkg", "external.scope-pkg-2"]);

  const dirMode = repo(
    t,
    {
      "src/lib/a/z.ts": "export function z(): void {}\n",
      "src/lib/a/index.ts": "export function i(): void {}\n",
      "src/lib/a/k.ts": "export class K { m(): void {} }\n",
      "src/lib/a/index/y.ts": "export function y(): void {}\n",
      "src/lib/a/b/c.ts": "export function c(): void {}\n",
      "src/lib/p/q/r.ts": "export function r(): void {}\n",
      "keylang/wiring.md": "# wiring\n\n- wire lib.a.K\n- wire lib.a\n",
    },
    { module: "dir" },
  );
  const mapped = keylang(dirMode, ["map"]);
  assert.equal(mapped.status, 0, mapped.stderr);
  assert.doesNotMatch(mapped.stderr, /same module ID/);
  const nodes = (JSON.parse(readFileSync(join(dirMode, ".keylang/index.json"), "utf8")) as Snapshot).nodes;
  assert.equal(nodes["lib.a"]?.file, "src/lib/a/index.ts");
  assert.equal(nodes["lib.a.index"]?.file, "src/lib/a/index/y.ts");
  assert.equal(nodes["lib.a.b"]?.file, "src/lib/a/b/c.ts");
  assert.equal(nodes["lib.p"]?.file, "src/lib/p");
  assert.deepEqual([nodes["lib.a.K"]?.class, nodes["lib.a.K"]?.file], [true, "src/lib/a/k.ts"]);
  const checked = keylang(dirMode, ["check"]);
  assert.doesNotMatch(checked.stdout, /K302 wire `lib\.a\.K`/);
  assert.match(checked.stdout, /K302 wire `lib\.a` is a module/);
  assert.match(keylang(dirMode, ["explain", "lib.a.K"]).stdout, /^class lib\.a\.K/);
});

test("robustness: a file nested thousands deep is opaque, not a crash; a fact cache damaged deep inside is extracted again", (t) => {
  const dir = repo(t, {
    "src/lib/deep.ts": `export const x = ${Array.from({ length: 5000 }, (_, i) => `a${i}`).join(" + ")};\n`,
    "src/lib/ok.ts": "export function f(): void { g(); }\nexport function g(): void {}\n",
    "src/app/a.ts": 'import { f } from "../lib/ok.ts";\nexport function main(): void { f(); }\n',
    "keylang/rules.md": "# rules\n\n- deny app lib\n",
  });
  const first = snapshot(dir);
  assert.ok(first.coverage.some((c) => c.kind === "parse-error" && c.file === "src/lib/deep.ts" && /nested deeper than/.test(c.reason)), JSON.stringify(first.coverage));
  assert.equal(first.nodes["lib.deep"]?.members, "opaque");
  const file = join(dir, ".keylang/cache/facts.json");
  const cache = JSON.parse(readFileSync(file, "utf8"));
  cache.files["src/lib/ok.ts"].facts.decls[0].calls = [null];
  cache.files["src/lib/ok.ts"].facts.moduleCalls = [{ line: 1 }];
  cache.files["src/app/a.ts"].facts.imports[0].bindings = [{ kind: "weird", local: 1 }];
  cache.files["src/app/a.ts"].facts.valueRefs = [{ name: "f", line: "1", col: 1 }];
  cache.files["src/lib/deep.ts"].facts.exportRows = [{ name: "x", kind: "nope", local: null }];
  writeFileSync(file, JSON.stringify(cache));
  const o = keylang(dir, ["check"]);
  assert.equal(o.status, 1, o.stderr);
  assert.match(o.stdout, /src\/app\/a\.ts:1:1: K102 /);
  const again = snapshot(dir);
  assert.ok(again.edges.some((e) => e.kind === "call" && e.source === "lib.ok.f" && e.target === "lib.ok.g"));
  assert.ok(again.edges.some((e) => e.kind === "call" && e.source === "app.a.main" && e.target === "lib.ok.f"));
});

test("jsx: a tag naming a component is a call in `.tsx`; intrinsic, fragment and namespace tags are not; a tag in `.map` is a closure; `.ts` has no JSX", (t) => {
  const page = [
    'import { Cart } from "../ui/cart.tsx";',
    'import * as Menu from "../ui/menu.tsx";',
    'import { div, Fragment } from "../ui/html.tsx";',
    "type Props = { a: number };",
    "export function Page({ Comp }: { Comp: () => unknown }) {",
    "  return (",
    "    <div>",
    "      <Cart<Props> a={1} />",
    "      <Cart></Cart>",
    "      <Menu.Item />",
    "      <>x</>",
    "      <svg:path />",
    "      <my-button />",
    "      <Comp />",
    "    </div>",
    "  );",
    "}",
    "export function List({ items }: { items: string[] }) {",
    "  return <ul>{items.map(() => <Cart />)}</ul>;",
    "}",
    "",
  ].join("\n");
  const dir = repo(t, {
    "src/ui/cart.tsx": "export function Cart(props: { a?: number }) { return null; }\n",
    "src/ui/menu.tsx": "export function Item() { return null; }\n",
    "src/ui/html.tsx": "export function div() { return null; }\nexport function Fragment() { return null; }\n",
    "src/app/page.tsx": page,
    // The `typescript` grammar has no JSX: `<Cart />` in `.ts` is a syntax error, not a call.
    "src/app/bad.ts": 'import { Cart } from "../ui/cart.tsx";\nexport function Bad() { return <Cart />; }\n',
    "keylang/flows/f.md": "# flow f\n\n- trigger app.page.Page\n- step ui.cart.Cart\n- step ui.menu.Item\n\n# flow g\n\n- trigger app.page.List\n- step ui.cart.Cart\n",
  });
  const snap = snapshot(dir);
  // `<Cart<Props> />` and `<Cart></Cart>` are one edge to one target; `<Comp />` through the parameter is unresolved.
  const calls = snap.edges.filter((e) => e.kind === "call" && e.source.startsWith("app.")).map((e) => `${e.source}: ${e.text} → ${e.target}${e.closure ? " (closure)" : ""}`).sort();
  assert.deepEqual(calls, [
    "app.page.List: Cart → ui.cart.Cart (closure)",
    "app.page.List: items.map → null",
    "app.page.Page: Cart → ui.cart.Cart",
    "app.page.Page: Comp → null",
    "app.page.Page: Menu.Item → ui.menu.Item",
  ]);
  assert.equal(snap.nodes["ui.html.div"]?.kind, "fn");
  assert.equal(snap.nodes["app.bad"]?.members, "opaque");
  assert.ok(snap.coverage.some((c) => c.kind === "parse-error" && c.file === "src/app/bad.ts"), JSON.stringify(snap.coverage));
  const lines = statics(dir);
  assert.equal(lines.length, 3, lines.join("\n"));
  assert.match(lines[0]!, /static ok ui\.cart\.Cart: called from app\.page\.Page/);
  assert.match(lines[1]!, /static ok ui\.menu\.Item: called from app\.page\.Page/);
  assert.match(lines[2]!, /static unverified ui\.cart\.Cart: no resolved path from app\.page\.List; reached only through a closure of app\.page\.List/);
});

test("jsx: a `.jsx` file goes through the `javascript` grammar and gets the same tag calls", (t) => {
  const dir = repo(
    t,
    {
      "src/ui/cart.jsx": "export function Cart() { return <div />; }\nexport function div() { return null; }\n",
      "src/app/page.jsx": 'import { Cart, div } from "../ui/cart.jsx";\nexport function Page() {\n  return <section><Cart /><Cart.Item /></section>;\n}\nexport const top = <Cart />;\n',
    },
    { languages: ["javascript"] },
  );
  const snap = snapshot(dir);
  const calls = snap.edges.filter((e) => e.kind === "call" && e.source.startsWith("app.")).map((e) => `${e.source}: ${e.text} → ${e.target}`);
  assert.deepEqual(calls, ["app.page.Page: Cart → ui.cart.Cart", "app.page.Page: Cart.Item → null"]);
  assert.ok(!snap.edges.some((e) => e.target === "ui.cart.div"), "an intrinsic tag is not a call");
});

test("jsx: a Nest-style `.ts` file keeps its declarations and calls: decorators, angle assertions, generic arrows and `forwardRef` are what they were", (t) => {
  const dir = repo(t, {
    "src/cats/cats.controller.ts": [
      'import { Controller, Get, Inject, Injectable, Module, forwardRef } from "@nestjs/common";',
      'import { CatsService } from "./cats.service.ts";',
      "@Injectable()",
      "export class CommonService {",
      "  constructor(@Inject(forwardRef(() => CatsService)) private readonly cats: CatsService) {}",
      "}",
      '@Controller("cats")',
      "export class CatsController {",
      "  constructor(private readonly cats: CatsService) {}",
      "  @Get()",
      "  findAll(): string[] {",
      "    const raw = <string[]>this.cats.findAll();",
      "    const id = <T>(x: T) => x;",
      "    return raw.filter((c) => c.length < 3 && c.length > 0).map(id);",
      "  }",
      "}",
      "export const Common = forwardRef(() => CatsModule);",
      "@Module({ imports: [forwardRef(() => CatsModule)] })",
      "export class CatsModule {}",
      "",
    ].join("\n"),
    "src/cats/cats.service.ts": 'import { Injectable } from "@nestjs/common";\n@Injectable()\nexport class CatsService {\n  findAll(): string[] { return []; }\n}\n',
  });
  const snap = snapshot(dir);
  assert.deepEqual(
    Object.keys(snap.nodes).filter((id) => id.startsWith("cats.cats_controller")),
    ["cats.cats_controller", "cats.cats_controller.CatsController", "cats.cats_controller.CatsController.constructor", "cats.cats_controller.CatsController.findAll", "cats.cats_controller.CatsModule", "cats.cats_controller.CommonService", "cats.cats_controller.CommonService.constructor"],
  );
  assert.equal(snap.nodes["cats.cats_controller"]?.members, "complete");
  const calls = snap.edges.filter((e) => e.kind === "call").map((e) => `${e.source}: ${e.text} → ${e.target}`).sort();
  assert.deepEqual(calls, [
    "cats.cats_controller.CatsController.findAll: raw.filter → null",
    "cats.cats_controller.CatsController.findAll: raw.filter((c)=>c.length<3&&c.length>0).map → null",
    "cats.cats_controller.CatsController.findAll: this.cats.findAll → cats.cats_service.CatsService.findAll",
    "cats.cats_controller.CommonService.constructor: Inject → null",
    "cats.cats_controller.CommonService.constructor: forwardRef → null",
  ]);
  assert.ok(snap.exports.some((e) => e.module === "cats.cats_controller" && e.name === "Common" && e.kind === "value"), JSON.stringify(snap.exports));
});
