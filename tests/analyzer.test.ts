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
  nodes: Record<string, { kind: string; escapes?: { reason: string } }>;
  edges: { kind: string; source: string; target: string | null; resolution: string; text: string }[];
  coverage: { kind: string; file: string; line: number; reason: string }[];
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
