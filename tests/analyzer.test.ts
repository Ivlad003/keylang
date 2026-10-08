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
  edges: { kind: string; source: string; target: string | null; resolution: string; text: string; alias?: string; reason?: string; closure?: true; typeOnly?: true; via?: string }[];
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

test("imports: a pnpm workspace package is internal through `pnpm-workspace.yaml`, a nested `node_modules` link into the repository, or a `workspace:` range; never external", (t) => {
  const files = {
    "package.json": '{"name":"root","private":true}',
    "pnpm-workspace.yaml": "packages:\n  - 'apps/*'\n  - \"packages/*\"\n  - '!**/test/**'\n",
    "apps/web/package.json": '{"name":"web","dependencies":{"@acme/db":"workspace:*"}}',
    "apps/web/src/page.ts": 'import { query } from "@acme/db";\nexport function page(): void { query(); }\n',
    "packages/db/package.json": '{"name":"@acme/db","main":"./src/index.ts"}',
    "packages/db/src/index.ts": "export function query(): void {}\n",
    "keylang/rules.md": "# rules\n\n- deny web db\n",
  };
  const layers = { layers: { web: ["apps/web/src/**"], db: ["packages/db/src/**"] } };
  const denied = (dir: string): void => {
    const o = keylang(dir, ["check"]);
    assert.equal(o.status, 1, o.stdout + o.stderr);
    assert.match(o.stdout, /apps\/web\/src\/page\.ts:1:1: K102 .*`web\.page` depends on `db\.index`/);
    assert.doesNotMatch(o.stdout, /external/);
  };
  // Not installed: `packages` of pnpm-workspace.yaml names the directory.
  const dir = repo(t, files, layers);
  denied(dir);
  const edges = snapshot(dir).edges.filter((e) => e.kind === "import" && e.source === "web.page").map((e) => `${e.target} ${e.resolution}`);
  assert.deepEqual(edges, ["db.index resolved"]);
  // pnpm-style install: the link lives in the app's own node_modules, not the root's.
  mkdirSync(join(dir, "apps/web/node_modules/@acme"), { recursive: true });
  symlinkSync("../../../../packages/db", join(dir, "apps/web/node_modules/@acme/db"), "dir");
  denied(dir);
  // Without pnpm-workspace.yaml the link alone says the package is this repository's.
  rmSync(join(dir, "pnpm-workspace.yaml"));
  denied(dir);
  // Neither a workspace list nor a link: a `workspace:` range is not an external package but an unresolved import.
  const bare = repo(t, { ...files, "pnpm-workspace.yaml": "packages: []\n" }, layers);
  const o = keylang(bare, ["check"]);
  assert.equal(o.status, 0, o.stdout + o.stderr);
  assert.match(o.stdout, /unverified/);
  assert.doesNotMatch(o.stdout, /\b1 ok/);
  const holes = snapshot(bare).coverage.filter((c) => c.kind === "unresolved-import").map((c) => c.reason);
  assert.ok(holes.some((h) => /unresolved import `@acme\/db`/.test(h)), holes.join("\n"));
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
  // An arrow keeps the method's `this`: the call resolves; the arrow is an argument of `forEach`, so `behavior` follows it as a closure passed.
  assert.match(lines[2]!, /static ok a\.x\.Z\.helper: called from a\.x\.Z\.each through the closure passed at src\/a\/x\.ts:7:47/);
  const shape = keylang(dir, ["check", "--static", "shape"]).stdout.split("\n").filter((line) => / static /.test(line));
  assert.match(shape[1]!, /static unverified a\.x\.hit: no resolved path from a\.x\.s; reached only through a closure of a\.x\.s/);
  assert.match(shape[2]!, /static unverified a\.x\.Z\.helper: no resolved path from a\.x\.Z\.each; the closure passed at src\/a\/x\.ts:7:47 \(not followed in static mode shape, set by --static\) at src\/a\/x\.ts:7:53 may reach it/);
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

test("imports: `paths`/`baseUrl` come from the tsconfig that governs the importing file, not the root's; a solution config lends each referenced project's `paths` to the files under it", (t) => {
  const files = {
    "src/data/db.ts": "export function db(): void {}\n",
    "apps/web/src/data/db.ts": "export function db(): void {}\n",
    "apps/web/src/ui/page.ts": 'import { db } from "@/data/db";\nexport function page(): void { db(); }\n',
    "apps/admin/src/data/db.ts": "export function db(): void {}\n",
    "apps/admin/src/ui/page.ts": 'import { db } from "@/data/db";\nexport function page(): void { db(); }\n',
    "keylang/rules.md": "# rules\n\n- deny ui data\n",
  };
  const layers = { layers: { ui: ["apps/*/src/ui/**"], data: ["apps/*/src/data/**"], lib: ["src/**"] } };
  const app = '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["./src/*"]}}}';
  const denied = (dir: string): void => {
    const o = keylang(dir, ["check"]);
    assert.equal(o.status, 1, o.stdout + o.stderr);
    assert.match(o.stdout, /apps\/web\/src\/ui\/page\.ts:1:1: K102 .*`ui\.web\.src\.ui\.page` depends on `data\.web\.src\.data\.db`/);
    assert.match(o.stdout, /apps\/admin\/src\/ui\/page\.ts:1:1: K102 .*`ui\.admin\.src\.ui\.page` depends on `data\.admin\.src\.data\.db`/);
    assert.doesNotMatch(o.stdout, /lib\.data|unverified/);
    const edges = snapshot(dir).edges.filter((e) => e.kind === "import" && e.source.startsWith("ui.")).map((e) => `${e.source} -> ${e.target} ${e.resolution}`);
    assert.deepEqual(edges.sort(), ["ui.admin.src.ui.page -> data.admin.src.data.db resolved", "ui.web.src.ui.page -> data.web.src.data.db resolved"]);
  };
  // The root alias names another file: the nested tsconfig's alias governs apps/web/.
  const root = '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["src/*"]}}}';
  denied(repo(t, { ...files, "tsconfig.json": root, "apps/web/tsconfig.json": app, "apps/admin/tsconfig.json": app }, layers));
  // No root tsconfig at all: the nested one still resolves the alias.
  denied(repo(t, { ...files, "apps/web/tsconfig.json": app, "apps/admin/tsconfig.json": app }, layers));
  // A solution config at the root: each referenced project's `paths` apply to the files under its directory only.
  const solution = '{"files":[],"references":[{"path":"./apps/admin/tsconfig.app.json"},{"path":"./apps/web/tsconfig.app.json"}]}';
  denied(repo(t, { ...files, "tsconfig.json": solution, "apps/web/tsconfig.app.json": app, "apps/admin/tsconfig.app.json": app }, layers));
});

test("imports: a tsconfig `extends` without `.json` beside a directory of the same name reads `<path>.json`, as tsc does, instead of failing with EISDIR", (t) => {
  const dir = repo(t, {
    "package.json": '{"name":"fx"}',
    "tsconfig.json": '{"extends":"./configs/base"}',
    "configs/base.json": '{"compilerOptions":{"verbatimModuleSyntax":true}}',
    "configs/base/README.md": "# base\n",
    "src/a/a.ts": 'import { type B } from "../b/b";\nexport const a: B = 1;\n',
    "src/b/b.ts": "export type B = number;\n",
  });
  const o = keylang(dir, ["map"]);
  assert.equal(o.status, 0, o.stdout + o.stderr);
  assert.doesNotMatch(o.stderr, /EISDIR/);
  // `configs/base.json` sets verbatimModuleSyntax, so the inline-`type` import stays one that loads the module.
  const edges = snapshot(dir).edges.filter((e) => e.kind === "import" && e.source === "a.a").map((e) => `${e.target} ${e.resolution}${e.typeOnly ? " typeOnly" : ""}`);
  assert.deepEqual(edges, ["b.b resolved"]);
  const check = keylang(dir, ["check"]);
  assert.equal(check.status, 0, check.stdout + check.stderr);
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

test("colliding package names get one ID space over declared and imported names together, not only the imported ones", (t) => {
  const dir = repo(t, {
    "package.json": '{"dependencies":{"@scope/pkg":"1","scope-pkg":"1"}}',
    "src/app/a.ts": 'import { a } from "@scope/pkg";\nexport function main(): void { a(); }\n',
  });
  const o = keylang(dir, ["map"]);
  assert.equal(o.status, 0, o.stderr);
  // `scope-pkg` is declared but not imported; it still keeps the segment, so `@scope/pkg` is `-2`.
  assert.match(o.stderr, /packages `scope-pkg` and `@scope\/pkg` share the ID segment `scope-pkg`; `@scope\/pkg` is `external\.scope-pkg-2`/);
  const snap = JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as Snapshot;
  assert.deepEqual(snap.edges.filter((e) => e.kind === "import" && e.source === "app.a").map((e) => e.target), ["external.scope-pkg-2"]);
  assert.equal(snap.nodes["external.scope-pkg"], undefined);
});

test("a manifest on an analysed file's path enters the snapshot id; a broken one makes `map` and `map --check` exit 2", (t) => {
  const dir = repo(t, {
    "src/app/package.json": '{"devDependencies":{"vitest":"1"}}\n',
    "src/app/a.ts": "export function main(): void {}\n",
  });
  assert.equal(keylang(dir, ["map"]).status, 0);
  const id = (): string => (JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as Snapshot).snapshotId;
  const before = id();
  writeFileSync(join(dir, "src/app/package.json"), '{"devDependencies":{"vitest":"2"}}\n');
  assert.equal(keylang(dir, ["map"]).status, 0);
  assert.notEqual(id(), before);

  writeFileSync(join(dir, "src/app/package.json"), "{ not json\n");
  for (const args of [["map"], ["map", "--check"]]) {
    const run = keylang(dir, args);
    assert.equal(run.status, 2, `${args.join(" ")}: ${run.stderr}`);
    assert.match(run.stderr, /src\/app\/package\.json: invalid JSON/);
  }
});

test("robustness: a file nested thousands deep is opaque, not a crash; a fact cache damaged deep inside is extracted again", (t) => {
  const dir = repo(t, {
    "src/lib/deep.ts": `export const x = ${Array.from({ length: 5000 }, (_, i) => `a${i}`).join(" + ")};\n`,
    "src/lib/ok.ts": "export function f(): void { g(); }\nexport function g(): void {}\n",
    "src/lib/box.ts": "export class Box { open(): void {} }\n",
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
  // A field the checks once missed: the graph maps a class's traits, which a string is not.
  cache.files["src/lib/box.ts"].facts.decls[0].traits = "Logs";
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
  // The arrow in `.map` is a closure passed as an argument: `behavior` follows it, `shape` names it.
  assert.match(lines[2]!, /static ok ui\.cart\.Cart: called from app\.page\.List through the closure passed at src\/app\/page\.tsx:19:25/);
  const shape = keylang(dir, ["check", "--static", "shape"]).stdout.split("\n").filter((line) => / static /.test(line));
  assert.match(shape[2]!, /static unverified ui\.cart\.Cart: no resolved path from app\.page\.List; the closure passed at src\/app\/page\.tsx:19:25 \(not followed in static mode shape, set by --static\)/);
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

test("jsx: `memo` / `forwardRef` / `lazy` from `react` unwrap a `const` into the fn they wrap; a type import, `let`, a local name or another package stays a value", (t) => {
  const dir = repo(t, {
    "package.json": JSON.stringify({ dependencies: { react: "^19.0.0", "styled-components": "^6.0.0" } }),
    "src/ui/api.ts": "export function fetchCart(): void {}\nexport function price(): void {}\n",
    "src/ui/heavy.tsx": "export default function Heavy() { return null; }\n",
    "src/ui/wrapped.tsx": [
      'import React, { memo, forwardRef, lazy } from "react";',
      'import * as ReactNS from "react";',
      'import { forwardRef as ref } from "react";',
      'import { fetchCart, price } from "./api.ts";',
      "export const Cart = memo(() => {",
      "  fetchCart();",
      "  return <div />;",
      "});",
      "export const Input = forwardRef((props: {}, ref: unknown) => {",
      "  fetchCart();",
      "  return null;",
      "});",
      'export const Heavy = lazy(() => import("./heavy.tsx"));',
      "export const Named = React.memo(() => {",
      "  fetchCart();",
      "  return null;",
      "});",
      "export const Ns = ReactNS.memo(() => price());",
      "export const Field = ref((props, r) => price());",
      "export const Box = React.memo(function Box() { return <Line />; });",
      "export let Late = memo(() => price());",
      "export function Line() { return null; }",
      "",
    ].join("\n"),
    "src/ui/typed.tsx": [
      'import type React from "react";',
      'import { type memo, forwardRef } from "react";',
      'import { price } from "./api.ts";',
      "export const Typed = React.memo(() => price());",
      "export const TypedName = memo(() => price());",
      "export const Still = forwardRef(() => price());",
      "",
    ].join("\n"),
    "src/ui/other.tsx": [
      'import styled from "styled-components";',
      'import { price } from "./api.ts";',
      "function memo(f: unknown) { return f; }",
      "export const Local = memo(() => price());",
      "export const Btn = styled(() => price());",
      "",
    ].join("\n"),
    "src/local/own.tsx": [
      'import { observer } from "mobx-react";',
      "export function helper(): void {}",
      "function memo(f: () => null) {",
      "  return f;",
      "}",
      "export const Cart = memo(() => {",
      "  helper();",
      "  return null;",
      "});",
      "export const Watched = observer(() => null);",
      "",
    ].join("\n"),
    "src/cats/cats.module.ts": ['import { forwardRef } from "@nestjs/common";', "export class CatsModule {}", "export const Common = forwardRef(() => CatsModule);", ""].join("\n"),
    "src/app/page.tsx": [
      'import { Box, Cart, Field, Heavy, Input, Named, Ns } from "../ui/wrapped.tsx";',
      "export function Page() {",
      "  return (",
      "    <main>",
      "      <Cart />",
      "      <Input />",
      "      <Heavy />",
      "      <Named />",
      "      <Ns />",
      "      <Field />",
      "      <Box />",
      "    </main>",
      "  );",
      "}",
      "",
    ].join("\n"),
  });
  const snap = snapshot(dir);
  const modules = new Set(["ui.wrapped", "ui.typed", "ui.other", "local.own", "cats.cats_module"]);
  assert.deepEqual(
    snap.exports.filter((e) => modules.has(e.module)).map((e) => `${e.module}.${e.name}:${e.kind}`).sort(),
    [
      "cats.cats_module.CatsModule:class",
      "cats.cats_module.Common:value",
      "local.own.Cart:value",
      "local.own.Watched:value",
      "local.own.helper:fn",
      "ui.other.Btn:value",
      "ui.other.Local:value",
      "ui.typed.Still:fn",
      "ui.typed.Typed:value",
      "ui.typed.TypedName:value",
      "ui.wrapped.Box:fn",
      "ui.wrapped.Cart:fn",
      "ui.wrapped.Field:fn",
      "ui.wrapped.Heavy:fn",
      "ui.wrapped.Input:fn",
      "ui.wrapped.Late:value",
      "ui.wrapped.Line:fn",
      "ui.wrapped.Named:fn",
      "ui.wrapped.Ns:fn",
    ],
  );
  for (const id of ["ui.wrapped.Cart", "ui.wrapped.Input", "ui.wrapped.Heavy", "ui.wrapped.Named", "ui.wrapped.Ns", "ui.wrapped.Field", "ui.wrapped.Box", "ui.typed.Still"]) assert.equal(snap.nodes[id]?.kind, "fn", id);
  for (const id of ["ui.wrapped.Late", "ui.typed.Typed", "ui.typed.TypedName", "ui.other.Local", "ui.other.Btn", "local.own.Cart", "local.own.Watched", "cats.cats_module.Common"]) assert.equal(snap.nodes[id], undefined, id);
  assert.deepEqual(Object.keys(snap.nodes).filter((id) => id.startsWith("local.own.")).sort(), ["local.own.helper", "local.own.memo"]);
  assert.match(snap.nodes["local.own.helper"]?.escapes?.reason ?? "", /function value outside declarations/);
  const calls = snap.edges.filter((e) => e.kind === "call").map((e) => `${e.source}: ${e.text} → ${e.target}`).sort();
  assert.deepEqual(calls, [
    "app.page.Page: Box → ui.wrapped.Box",
    "app.page.Page: Cart → ui.wrapped.Cart",
    "app.page.Page: Field → ui.wrapped.Field",
    "app.page.Page: Heavy → ui.wrapped.Heavy",
    "app.page.Page: Input → ui.wrapped.Input",
    "app.page.Page: Named → ui.wrapped.Named",
    "app.page.Page: Ns → ui.wrapped.Ns",
    "ui.typed.Still: price → ui.api.price",
    "ui.wrapped.Box: Line → ui.wrapped.Line",
    "ui.wrapped.Cart: fetchCart → ui.api.fetchCart",
    "ui.wrapped.Field: price → ui.api.price",
    "ui.wrapped.Input: fetchCart → ui.api.fetchCart",
    "ui.wrapped.Named: fetchCart → ui.api.fetchCart",
    "ui.wrapped.Ns: price → ui.api.price",
  ]);
  const facts = JSON.parse(readFileSync(join(dir, ".keylang/cache/facts.json"), "utf8")) as { files: Record<string, { facts: { moduleCalls: { callee: string }[] } }> };
  const moduleCalls = (file: string) => facts.files[file]!.facts.moduleCalls.map((c) => c.callee);
  // The wrapper call itself stays a module-level call; the wrapped body moves into the fn.
  assert.deepEqual(moduleCalls("src/ui/wrapped.tsx"), ["memo", "forwardRef", "lazy", "React.memo", "ReactNS.memo", "ref", "React.memo", "memo", "price"]);
  // A wrapper that unwraps nothing keeps its body's calls at module level.
  assert.deepEqual(moduleCalls("src/ui/typed.tsx"), ["React.memo", "price", "memo", "price", "forwardRef"]);
  assert.deepEqual(moduleCalls("src/cats/cats.module.ts"), ["forwardRef"]);
});

test("jsx: `createElement` / `jsx` / `jsxs` / `jsxDEV` imported from React call the component; a string or a lowercase name does not", (t) => {
  const dir = repo(t, {
    "package.json": JSON.stringify({ dependencies: { react: "^19.0.0" } }),
    "src/ui/cart.ts": "export function Cart() { return null; }\nexport function Badge() { return null; }\n",
    "src/app/page.ts": [
      'import { jsx, jsxs } from "react/jsx-runtime";',
      'import { createElement, createElement as h } from "react";',
      'import React from "react";',
      'import { jsxDEV } from "react/jsx-dev-runtime";',
      'import { Badge, Cart } from "../ui/cart.ts";',
      "export function div() { return null; }",
      "export function Fragment() { return null; }",
      "export function Page() {",
      "  createElement(Cart, null);",
      "  jsx(Cart.Item, {});",
      "  jsxs(Cart, {});",
      "  jsxDEV(Cart, {}, null, false, undefined, undefined);",
      '  jsx("div", {});',
      "  jsx(Fragment, {});",
      "  jsx(div, {});",
      "  h(Badge);",
      "  React.createElement(Badge, null);",
      "}",
      "export function List(items: string[]) {",
      "  return items.map(() => createElement(Cart));",
      "}",
      "export function Shadow() {",
      "  function createElement(type: unknown) { return type; }",
      "  return createElement(Cart);",
      "}",
      "",
    ].join("\n"),
  });
  const snap = snapshot(dir);
  const calls = snap.edges
    .filter((e) => e.kind === "call" && e.source.startsWith("app."))
    .map((e) => `${e.source}: ${e.text} → ${e.target}${e.closure ? " (closure)" : ""}${e.via === "callable-arg" ? " (callable)" : ""}`)
    .sort();
  // A component call covers the same component passed as a callable; `div` and the shadowed factory's `Cart` are callables passed, not component calls.
  assert.deepEqual(calls, [
    "app.page.List: Cart → ui.cart.Cart (closure)",
    "app.page.List: items.map → null",
    "app.page.Page: Badge → ui.cart.Badge",
    "app.page.Page: Cart → ui.cart.Cart",
    "app.page.Page: Cart.Item → null",
    "app.page.Page: Fragment → app.page.Fragment",
    "app.page.Page: div → app.page.div (callable)",
    "app.page.Shadow: Cart → ui.cart.Cart (callable)",
    "app.page.Shadow: createElement → null",
  ]);
  assert.ok(!calls.some((line) => line.includes("div") && !line.endsWith("(callable)")), calls.join("\n"));
  const facts = JSON.parse(readFileSync(join(dir, ".keylang/cache/facts.json"), "utf8")) as {
    files: Record<string, { facts: { decls: { name: string; calls: { callee: string; passes?: { arg: number; callee: string }[] }[] }[] } }>;
  };
  const page = facts.files["src/app/page.ts"]!.facts.decls.find((d) => d.name === "Page")!;
  // The factory call stays, with the component as the same `passes` a hook would see, and the component call is added beside it.
  assert.deepEqual(
    page.calls.map((c) => c.callee),
    ["createElement", "Cart", "jsx", "Cart.Item", "jsxs", "Cart", "jsxDEV", "Cart", "jsx", "jsx", "Fragment", "jsx", "h", "Badge", "React.createElement", "Badge"],
  );
  assert.deepEqual(page.calls[0]!.passes?.map((p) => `${p.arg}:${p.callee}`), ["0:Cart"]);
  const shadow = facts.files["src/app/page.ts"]!.facts.decls.find((d) => d.name === "Shadow")!;
  assert.deepEqual(shadow.calls.map((c) => c.callee), ["createElement"]);
  assert.deepEqual(shadow.calls[0]!.passes?.map((p) => `${p.arg}:${p.callee}`), ["0:Cart"]);
});

test("jsx: a type-only import from React binds no factory: `import type React`, `{ type createElement }`, `import type * as React` keep one ordinary call", (t) => {
  const dir = repo(t, {
    "package.json": JSON.stringify({ dependencies: { react: "^19.0.0" } }),
    "src/ui/cart.ts": "export function Cart() { return null; }\n",
    "src/app/default.ts": ['import type React from "react";', 'import { Cart } from "../ui/cart.ts";', "export function Page() { return React.createElement(Cart); }", ""].join("\n"),
    "src/app/named.ts": ['import { type createElement, type createElement as h } from "react";', 'import { type jsx } from "react/jsx-runtime";', 'import { Cart } from "../ui/cart.ts";', "export function Page() { createElement(Cart); h(Cart); return jsx(Cart, {}); }", ""].join("\n"),
    "src/app/ns.ts": ['import type * as React from "react";', 'import type * as Runtime from "react/jsx-runtime";', 'import { Cart } from "../ui/cart.ts";', "export function Page() { Runtime.jsx(Cart, {}); return React.createElement(Cart); }", ""].join("\n"),
    "src/app/value.ts": ['import React, { type memo, createElement } from "react";', 'import { Cart } from "../ui/cart.ts";', "export function Page() { createElement(Cart); return React.createElement(Cart); }", ""].join("\n"),
  });
  const snap = snapshot(dir);
  const calls = snap.edges
    .filter((e) => e.kind === "call")
    .map((e) => `${e.source}: ${e.text} → ${e.target}${e.via === "callable-arg" ? " (callable)" : ""}`)
    .sort();
  // The factory call goes into the `react` package (no edge); only a value import adds the component call. Elsewhere `Cart` is a callable passed to an ordinary call.
  assert.deepEqual(calls, ["app.default.Page: Cart → ui.cart.Cart (callable)", "app.named.Page: Cart → ui.cart.Cart (callable)", "app.ns.Page: Cart → ui.cart.Cart (callable)", "app.value.Page: Cart → ui.cart.Cart"]);
  const facts = JSON.parse(readFileSync(join(dir, ".keylang/cache/facts.json"), "utf8")) as {
    files: Record<string, { facts: { decls: { name: string; calls: { callee: string; passes?: { arg: number; callee: string }[] }[] }[] } }>;
  };
  const pageCalls = (file: string) => facts.files[file]!.facts.decls.find((d) => d.name === "Page")!.calls;
  assert.deepEqual(pageCalls("src/app/default.ts").map((c) => c.callee), ["React.createElement"]);
  assert.deepEqual(pageCalls("src/app/named.ts").map((c) => c.callee), ["createElement", "h", "jsx"]);
  assert.deepEqual(pageCalls("src/app/ns.ts").map((c) => c.callee), ["Runtime.jsx", "React.createElement"]);
  assert.deepEqual(pageCalls("src/app/value.ts").map((c) => c.callee), ["createElement", "Cart", "React.createElement", "Cart"]);
  // A type-only factory call still passes its component, as any ordinary call does.
  assert.deepEqual(pageCalls("src/app/default.ts")[0]!.passes?.map((p) => `${p.arg}:${p.callee}`), ["0:Cart"]);
});

test("jsx: a local `createElement` or one imported from another module does not call its first argument", (t) => {
  const dir = repo(t, {
    "src/ui/cart.ts": "export function Cart() { return null; }\n",
    "src/lib/save.ts": "export function save() { return null; }\n",
    "src/app/dom.ts": "export function createElement(type: unknown, props: unknown) { return props; }\n",
    "src/app/page.ts": [
      'import { createElement } from "./dom.ts";',
      'import { save } from "../lib/save.ts";',
      'import { Cart } from "../ui/cart.ts";',
      "export function Page() {",
      "  return createElement(Cart, { go: save });",
      "}",
      "",
    ].join("\n"),
    "src/local/own.ts": [
      "export function Cart() { return null; }",
      "export function Page() {",
      "  function createElement(type: unknown, props: { go?: () => void }) { return props; }",
      "  return createElement(Cart, { go: Page });",
      "}",
      "",
    ].join("\n"),
  });
  const snap = snapshot(dir);
  const calls = snap.edges
    .filter((e) => e.kind === "call")
    .map((e) => `${e.source}: ${e.text} → ${e.target}${e.via === "callable-arg" ? " (callable)" : ""}`)
    .sort();
  // No component call; `Cart` is a callable passed as the argument itself, `go: save` inside an object is not.
  assert.deepEqual(calls, ["app.page.Page: Cart → ui.cart.Cart (callable)", "app.page.Page: createElement → app.dom.createElement", "local.own.Page: Cart → local.own.Cart (callable)", "local.own.Page: createElement → null"]);
  const facts = JSON.parse(readFileSync(join(dir, ".keylang/cache/facts.json"), "utf8")) as {
    files: Record<string, { facts: { decls: { name: string; calls: { callee: string; passes?: { arg: number; path: string; callee: string }[] }[] }[] } }>;
  };
  const imported = facts.files["src/app/page.ts"]!.facts.decls.find((d) => d.name === "Page")!;
  assert.deepEqual(imported.calls.map((c) => c.callee), ["createElement"]);
  assert.deepEqual(imported.calls[0]!.passes?.map((p) => `${p.arg}:${p.path}:${p.callee}`), ["0::Cart", "1:go:save"]);
  const local = facts.files["src/local/own.ts"]!.facts.decls.find((d) => d.name === "Page")!;
  assert.deepEqual(local.calls.map((c) => c.callee), ["createElement"]);
  assert.deepEqual(local.calls[0]!.passes?.map((p) => `${p.arg}:${p.path}:${p.callee}`), ["0::Cart", "1:go:Page"]);
});

test("static: a callable passed as an argument (`this.m.bind(this)`, `this.m`, `obj.m`, `save`) and a closure passed as one are routes `behavior` follows and `shape` names; a stored arrow stays a closure hole", (t) => {
  const dir = repo(t, {
    "src/lib/x.ts": "export function run(f: () => void): void { f(); }\nexport function save(): void {}\nexport class B { m(): void {} }\n",
    "src/app/a.ts": [
      'import { run, save, B } from "../lib/x.ts";',
      "export class A {",
      "  main(obj: B, items: number[]): void {",
      "    run(this.bound.bind(this));",
      "    run(this.ref);",
      "    run(obj.m);",
      "    run(() => this.inArrow());",
      "    const g = () => this.stored();",
      "    items.forEach((x) => this.each(x));",
      "    run(save);",
      "    g();",
      "  }",
      "  bound(): void {}",
      "  ref(): void {}",
      "  inArrow(): void {}",
      "  stored(): void {}",
      "  each(x: number): void {}",
      "}",
      "",
    ].join("\n"),
    "keylang/flows/f.md": [
      "# flow main",
      "",
      "- trigger app.a.A.main",
      "  - calls app.a.A.bound, app.a.A.stored",
      "  - step app.a.A.bound",
      "  - step app.a.A.ref",
      "  - step lib.x.B.m",
      "  - step app.a.A.inArrow",
      "  - step app.a.A.stored",
      "  - step app.a.A.each",
      "  - step lib.x.save",
      "",
    ].join("\n"),
  });
  const lines = statics(dir).map((line) => line.replace(/^keylang\/flows\/f\.md:\d+:\d+: /, ""));
  assert.deepEqual(lines, [
    "static ok app.a.A.bound: called from app.a.A.main through the callable `this.bound.bind(this)` passed at src/app/a.ts:4:9",
    "static unverified app.a.A.stored: `this.stored` at src/app/a.ts:8:21 is in a closure of app.a.A.main and runs only when that function value is called",
    "static ok app.a.A.bound: called from app.a.A.main through the callable `this.bound.bind(this)` passed at src/app/a.ts:4:9",
    "static ok app.a.A.ref: called from app.a.A.main through the callable `this.ref` passed at src/app/a.ts:5:9",
    "static ok lib.x.B.m: called from app.a.A.main through the callable `obj.m` passed at src/app/a.ts:6:9",
    "static ok app.a.A.inArrow: called from app.a.A.main through the closure passed at src/app/a.ts:7:9",
    // The four holes: `this.bound.bind` (a call of `Function.prototype.bind`), `items.forEach`, `g()` and `f()` in `run`.
    "static unverified app.a.A.stored: no resolved path from app.a.A.main; reached only through a closure of app.a.A.main: `this.stored` at src/app/a.ts:8:21 runs only when that function value is called (and 4 more unresolved calls in reachable code)",
    "static ok app.a.A.each: called from app.a.A.main through the closure passed at src/app/a.ts:9:19",
    "static ok lib.x.save: called from app.a.A.main through the callable `save` passed at src/app/a.ts:10:9",
  ]);
  const shape = keylang(dir, ["check", "--static", "shape"]).stdout;
  assert.match(shape, /static unverified app\.a\.A\.bound: the callable `this\.bound\.bind\(this\)` passed as an argument \(not followed in static mode shape, set by --static\) at src\/app\/a\.ts:4:9\n/);
  assert.match(shape, /static unverified lib\.x\.save: no resolved path from app\.a\.A\.main; the callable `save` passed as an argument \(not followed in static mode shape, set by --static\) at src\/app\/a\.ts:10:9 may reach it/);
  assert.match(shape, /static unverified app\.a\.A\.each: no resolved path from app\.a\.A\.main; the closure passed at src\/app\/a\.ts:9:19 \(not followed in static mode shape, set by --static\) at src\/app\/a\.ts:9:26 may reach it/);
  assert.doesNotMatch(shape, /static ok/);
  const snap = snapshot(dir) as Snapshot & { edges: { via?: string; site?: string }[]; stats: { callsResolved: number } };
  const main = snap.edges
    .filter((e) => e.kind === "call" && e.source === "app.a.A.main" && e.resolution === "resolved")
    .map((e) => `${e.text} → ${e.target}${e.via ? ` via ${e.via}` : ""}${e.closure ? " (closure)" : ""}`);
  assert.deepEqual(main, [
    "this.bound.bind(this) → app.a.A.bound via callable-arg",
    "run → lib.x.run",
    "this.ref → app.a.A.ref via callable-arg",
    "obj.m → lib.x.B.m via callable-arg",
    "this.inArrow → app.a.A.inArrow via closure-arg (closure)",
    "this.stored → app.a.A.stored (closure)",
    "this.each → app.a.A.each via closure-arg (closure)",
    "save → lib.x.save via callable-arg",
  ]);
  // Resolved call edges: `run` and the three calls in closures; callables passed are not calls.
  assert.equal(snap.stats.callsResolved, 4);
});

/**
 * Runs `keylang <args>` for each command in a copy of `files` on a casefold
 * tmpfs in a user namespace, which models APFS and NTFS. Each command's
 * output follows a `=== <i>` line; null when the platform has no such file system.
 */
function onCasefold(t: { after: (f: () => void) => void }, files: Record<string, string>, commands: string[][]): string | null {
  if (process.platform !== "linux" || spawnSync("unshare", ["-rm", "true"]).status !== 0) return null;
  const fixture = mkdtempSync(join(tmpdir(), "keylang-casefold-src-"));
  const mount = mkdtempSync(join(tmpdir(), "keylang-casefold-"));
  t.after(() => {
    rmSync(fixture, { recursive: true, force: true });
    rmSync(mount, { recursive: true, force: true });
  });
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(fixture, path)), { recursive: true });
    writeFileSync(join(fixture, path), text);
  }
  const script = [
    'mount -t tmpfs -o casefold tmpfs "$1" 2>/dev/null || { echo SKIP:mount; exit 0; }',
    'mkdir "$1/repo" && chattr +F "$1/repo" 2>/dev/null || { echo SKIP:chattr; exit 0; }',
    'cp -r "$2/." "$1/repo/" && cd "$1/repo" || exit 1',
    'node=$3; bin=$4; shift 4; i=0',
    'for c in "$@"; do echo "=== $i"; eval "\\"$node\\" \\"$bin\\" $c" 2>&1; i=$((i+1)); done',
  ].join("\n");
  const run = spawnSync("unshare", ["-rm", "sh", "-c", script, "sh", mount, fixture, process.execPath, bin, ...commands.map((c) => c.join(" "))], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  return /^SKIP:/m.test(run.stdout) ? null : run.stdout;
}

test("guessed layout: an import of a directory in another letter case is a hole on a case-insensitive file system, not silently dropped", (t) => {
  const files = {
    "keylang/rules.md": "# rules\n\n- deny ui db\n",
    "src/ui/view.ts": 'import { query } from "../DB/conn";\nexport function view(): void { query(); }\n',
    "src/db/conn.ts": "export function query(): void {}\n",
  };
  const out = onCasefold(t, files, [["check"]]);
  if (out === null) return t.skip("casefold tmpfs is not available here");
  assert.match(out, /unverified unresolved import `\.\.\/DB\/conn`/, out);
  assert.match(out, /0 fail, 1 unverified, 0 ok/, out);
});

test("no-cycles: `import(\"./a\").A` and `typeof import(\"./a\")` in a type are type-only dependencies, not a runtime cycle", (t) => {
  const a = 'import { fb } from "./b";\nexport type A = number;\nexport function fa(): void {\n  fb(1);\n}\n';
  const variants = [
    'export function fb(x: import("./a").A): void {}\n',
    'export type B = import("./a").A;\nexport function fb(x: B): void {}\n',
    'let x: typeof import("./a");\nexport function fb(x2: number): void {}\n',
    'export function fb(x: Array<import("./a").A>): import("./a").A {\n  return x[0] as import("./a").A;\n}\n',
  ];
  for (const b of variants) {
    const dir = repo(t, { "keylang/rules.md": "# rules\n\n- no-cycles\n", "src/app/a.ts": a, "src/app/b.ts": b });
    const o = keylang(dir, ["check"]);
    assert.equal(o.status, 0, `${b}\n${o.stdout}`);
    assert.match(o.stdout + o.stderr, /0 fail, 0 unverified, 1 ok/, b);
    const edge = snapshot(dir).edges.find((e) => e.kind === "import" && e.source === "app.b" && e.target === "app.a");
    assert.equal(edge?.typeOnly, true, `${b}: ${JSON.stringify(edge)}`);
  }
  // A runtime `import()` still is one.
  const dir = repo(t, { "keylang/rules.md": "# rules\n\n- no-cycles\n", "src/app/a.ts": a, "src/app/b.ts": 'export async function fb(x: number): Promise<void> {\n  await import("./a");\n}\n' });
  assert.match(keylang(dir, ["check"]).stdout, /K105 divergence: dependency cycle app\.a → app\.b → app\.a/);
});
