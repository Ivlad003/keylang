// Regressions of the analyzer review of 2026-10-05 (zone: extract, graph): a
// call is an edge only when the language makes the name mean that symbol.
// Every test runs the real CLI on a minimal repository in a temporary directory.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const bin = join(dirname(fileURLToPath(import.meta.url)), "../bin/keylang.js");

function keylang(cwd: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** A repository of `files` with `config` as its keylang.json (TypeScript and one layer `app` over `src/**` unless it says otherwise). */
function repo(t: TestContext, files: Record<string, string>, config: Record<string, unknown> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-review-graph-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "keylang.json"), JSON.stringify({ languages: ["typescript"], layers: { app: ["src/**"] }, ...config }));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

interface Snapshot {
  nodes: Record<string, { kind: string; name?: string; file: string | null; members?: string; escapes?: { reason: string } }>;
  edges: { kind: string; source: string; target: string | null; resolution: string; text: string; candidates?: string[]; alias?: string; reason?: string }[];
  coverage: { kind: string; file: string; line: number; reason: string; source: string | null }[];
  exports: { module: string; name: string; symbol: string | null; kind: string; form?: string; from?: string }[];
}

function map(dir: string): { snapshot: Snapshot; stderr: string } {
  const o = keylang(dir, ["map"]);
  assert.equal(o.status, 0, o.stdout + o.stderr);
  return { snapshot: JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as Snapshot, stderr: o.stderr };
}

/** Resolved call edges as `source → target`, sorted. */
function calls(s: Snapshot, prefix = ""): string[] {
  return s.edges
    .filter((e) => e.kind === "call" && e.resolution === "resolved" && e.source.startsWith(prefix))
    .map((e) => `${e.source} → ${e.target}`)
    .sort();
}

/** Holes of calls as `source: text (reason)`, sorted. */
function holes(s: Snapshot, prefix = ""): string[] {
  return s.coverage
    .filter((c) => (c.kind === "dynamic-call" || c.kind === "unresolved-call") && (c.source ?? "").startsWith(prefix))
    .map((c) => `${c.source}: ${c.kind} ${c.reason}`)
    .sort();
}

test("module of several files: each file keeps its own names; a same-named declaration of another file is another node; a sibling's export is not in scope without an import", (t) => {
  const dir = repo(
    t,
    {
      "src/a/x.ts": "export function run(): void { helper(); }\nfunction helper(): void { onlyX(); }\nfunction onlyX(): void {}\n",
      "src/a/y.ts": "export function other(): void { helper(); }\nfunction helper(): void {}\n",
      "src/a/z.ts": "export function globalUser(): void { fetchData(); }\n",
      "src/a/w.ts": "export function fetchData(): void {}\n",
      "src/a/v.ts": 'import { other as o } from "./y";\nimport * as y from "./y";\nexport function alias(): void { o(); y.other(); }\n',
    },
    { module: "dir" },
  );
  const { snapshot, stderr } = map(dir);
  // Two files of one module declare `helper`: two symbols, never one node with both bodies.
  assert.equal(snapshot.nodes["app.a.helper"]?.file, "src/a/x.ts");
  assert.equal(snapshot.nodes["app.a.helper-2"]?.file, "src/a/y.ts");
  assert.equal(snapshot.nodes["app.a.helper-2"]?.name, "helper");
  assert.match(stderr, /src\/a\/y\.ts: `helper` is also declared in `src\/a\/x\.ts`/);
  assert.deepEqual(calls(snapshot), ["app.a.alias → app.a.other", "app.a.helper → app.a.onlyX", "app.a.other → app.a.helper-2", "app.a.run → app.a.helper"]);
  // `fetchData` is declared in another file and not imported: in TypeScript it is not in scope here.
  assert.deepEqual(holes(snapshot), ["app.a.globalUser: dynamic-call call through a local value `fetchData`"]);
  // Another file of the same module is no dependency of it.
  assert.deepEqual(snapshot.edges.filter((e) => e.kind === "import"), []);
});

test("`x.ts` beside `x/index.ts` in file mode: one module, two scopes; an import names the file it resolves to", (t) => {
  const dir = repo(t, {
    "src/x.ts": "export function fromFile(): void { helper(); }\nfunction helper(): void { onlyFile(); }\nfunction onlyFile(): void {}\n",
    "src/x/index.ts": 'import { fromFile } from "../x";\nexport function fromIndex(): void { fromFile(); helper(); }\nfunction helper(): void {}\n',
    "src/user.ts": 'import { fromIndex } from "./x/index";\nimport { fromFile } from "./x";\nexport function use(): void { fromIndex(); fromFile(); }\n',
  });
  const { snapshot, stderr } = map(dir);
  assert.match(stderr, /same module ID as .*\(app\.x\); merged/);
  assert.equal(snapshot.nodes["app.x.helper"]?.file, "src/x.ts");
  assert.equal(snapshot.nodes["app.x.helper-2"]?.file, "src/x/index.ts");
  assert.deepEqual(calls(snapshot), ["app.user.use → app.x.fromFile", "app.user.use → app.x.fromIndex", "app.x.fromFile → app.x.helper", "app.x.fromIndex → app.x.fromFile", "app.x.fromIndex → app.x.helper-2", "app.x.helper → app.x.onlyFile"]);
  assert.deepEqual(holes(snapshot), []);
});

test("module of several files: an import of one file gets that file's exports, `default` included, not another file's of the same name", (t) => {
  const dir = repo(
    t,
    {
      "src/ui/parts/button.ts": "export default function button(): void {}\nexport function make(): void {}\n",
      "src/ui/parts/card.ts": "export default function card(): void {}\nexport function make(): void {}\n",
      "src/ui/page/page.ts": 'import Card, { make } from "../parts/card";\nimport * as button from "../parts/button";\nexport function page(): void { Card(); make(); button.make(); }\n',
    },
    { module: "dir", layers: { ui: ["src/ui/**"] } },
  );
  const { snapshot } = map(dir);
  // Both `make` are exported: the first file by path keeps the name.
  assert.equal(snapshot.nodes["ui.parts.make"]?.file, "src/ui/parts/button.ts");
  assert.equal(snapshot.nodes["ui.parts.make-2"]?.file, "src/ui/parts/card.ts");
  assert.deepEqual(calls(snapshot), ["ui.page.page → ui.parts.card", "ui.page.page → ui.parts.make", "ui.page.page → ui.parts.make-2"]);
});

test("rust: a name bound by `for`, `if let`, `while let` or a `match` arm shadows the module's fn; a `match` guard does not bind", (t) => {
  const dir = repo(
    t,
    {
      "Cargo.toml": '[package]\nname = "demo"\nversion = "0.1.0"\n',
      "src/main.rs": [
        "fn fa() {}",
        "fn fb() {}",
        "fn fc() {}",
        "fn fd() {}",
        "fn fe() {}",
        "fn fg() {}",
        "fn ready() -> bool { true }",
        "struct P { fg: fn() }",
        "fn main() {",
        "    let fs: Vec<fn()> = vec![];",
        "    for fa in fs.iter() { fa(); }",
        "    if let Some(fb) = fs.first() { fb(); }",
        "    match fs.first() { Some(fc) if ready() => fc(), _ => {} }",
        "    while let Some(fd) = fs.first() { fd(); }",
        "    if let Some(x) = fs.first() { let fe = x; fe(); }",
        "    let p = P { fg: fa };",
        "    match p { P { fg } => fg() }",
        "}",
        "",
      ].join("\n"),
    },
    { languages: ["rust"] },
  );
  const { snapshot } = map(dir);
  assert.deepEqual(calls(snapshot, "app.main.main"), ["app.main.main → app.main.ready"]);
  const shadowed = holes(snapshot, "app.main.main").filter((h) => h.includes("shadowed"));
  assert.deepEqual(shadowed, ["fa", "fb", "fc", "fd", "fe", "fg"].map((name) => `app.main.main: unresolved-call shadowed by local \`${name}\``));
});

test("python: a `case` capture and `:=` shadow the module's fn; a value pattern does not", (t) => {
  const dir = repo(
    t,
    {
      "pkg/__init__.py": "",
      "pkg/m.py": [
        "def fa(): pass",
        "def fb(): pass",
        "def fc(): pass",
        "def fd(): pass",
        "def fe(): pass",
        "def ff(): pass",
        "def fg(): pass",
        "def run(v, items, Color):",
        "    match v:",
        "        case (fa,): fa()",
        '        case {"k": fb}: fb()',
        "        case str() as fe: fe()",
        "        case [*ff]: ff()",
        "        case P(x=fg): fg()",
        "        case Color.RED: fd()",
        "    print((fc := items.pop()))",
        "    fc()",
        "",
      ].join("\n"),
    },
    { languages: ["python"], layers: { app: ["pkg/**"] } },
  );
  const { snapshot } = map(dir);
  assert.deepEqual(calls(snapshot, "app.m.run"), ["app.m.run → app.m.fd"]);
  const shadowed = holes(snapshot, "app.m.run").filter((h) => h.includes("shadowed"));
  assert.deepEqual(shadowed, ["fa", "fb", "fc", "fe", "ff", "fg"].map((name) => `app.m.run: unresolved-call shadowed by local \`${name}\``));
});

test("typescript: a `const` or `function` in one `case` is in scope in every case of its `switch`", (t) => {
  const dir = repo(t, {
    "src/d.ts": "export function f(): void {}\nexport function g(): void {}\nexport function h(): void {}\n",
    "src/c.ts": [
      'import { f, g, h } from "./d";',
      "export function sw(k: number): void {",
      "  switch (k) {",
      "    case 1: const f = () => {}; break;",
      "    case 2: f(); h(); break;",
      "    case 3: { g(); function h(): void {} }",
      "    default: g();",
      "  }",
      "}",
      "",
    ].join("\n"),
  });
  const { snapshot } = map(dir);
  // `function h` in a block of case 3 is scoped to that block, not to the switch.
  assert.deepEqual(calls(snapshot, "app.c."), ["app.c.sw → app.d.g", "app.c.sw → app.d.h"]);
  assert.deepEqual(holes(snapshot, "app.c."), ["app.c.sw: unresolved-call shadowed by local `f`"]);
});
