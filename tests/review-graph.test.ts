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
  nodes: Record<string, { kind: string; name?: string; file: string | null; members?: string; escapes?: { reason: string }; deps?: string[]; dependents?: string[] }>;
  edges: { kind: string; source: string; target: string | null; resolution: string; text: string; line: number; col: number; candidates?: string[]; alias?: string; reason?: string; typeOnly?: true }[];
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
  // File-private helpers of one name are common in a directory: their IDs show it, without a warning.
  assert.doesNotMatch(stderr, /helper/);
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
  const { snapshot, stderr } = map(dir);
  // Both `make` are exported: the first file by path keeps the name, and the module's public name is ambiguous.
  assert.equal(snapshot.nodes["ui.parts.make"]?.file, "src/ui/parts/button.ts");
  assert.equal(snapshot.nodes["ui.parts.make-2"]?.file, "src/ui/parts/card.ts");
  assert.match(stderr, /src\/ui\/parts\/card\.ts: `make` is also exported by `src\/ui\/parts\/button\.ts`, another file of module `ui\.parts`; its ID here is `ui\.parts\.make-2`/);
  assert.deepEqual(calls(snapshot), ["ui.page.page → ui.parts.card", "ui.page.page → ui.parts.make", "ui.page.page → ui.parts.make-2"]);
});

test("an identifier written in NFD in code has the NFC ID a spec writes and keeps its name as written; the code's own references to it resolve", (t) => {
  const nfd = `cafe${String.fromCodePoint(0x301)}`; // `e` and a combining acute accent
  const nfc = `caf${String.fromCodePoint(0xe9)}`; // one precomposed `é`
  const dir = repo(
    t,
    {
      "src/a.ts": `export class Big${nfd} {}\nexport function ${nfd}(): void {\n  ${nfd}2();\n  new Big${nfd}();\n}\nfunction ${nfd}2(): void {}\n`,
      "pkg/__init__.py": "",
      "pkg/m.py": `def ${nfd}():\n    pass\ndef run():\n    ${nfd}()\n`,
      // Python reads identifiers normalized: the NFC name imports the NFD declaration.
      "pkg/u.py": `from .m import ${nfc}\ndef go():\n    ${nfc}()\n`,
      "keylang/flows/order.md": `# flow order\n\n- trigger app.a.${nfc}\n  - calls app.a.${nfc}2\n`,
      "keylang/flows/go.md": `# flow go\n\n- trigger py.u.go\n  - calls py.m.${nfc}\n`,
      "keylang/rules.md": `# rules\n\n- module app.a\n  - exports Big${nfc}, ${nfc}\n- module py.m\n  - exports ${nfc}, run\n`,
    },
    { languages: ["typescript", "python"], layers: { app: ["src/**"], py: ["pkg/**"] } },
  );
  const { snapshot } = map(dir);
  assert.equal(Object.keys(snapshot.nodes).some((id) => id !== id.normalize("NFC")), false, Object.keys(snapshot.nodes).join(", "));
  assert.equal(snapshot.nodes[`app.a.${nfc}`]?.name, nfd);
  assert.equal(snapshot.nodes[`py.m.${nfc}`]?.name, nfd);
  assert.deepEqual(calls(snapshot), [`app.a.${nfc} → app.a.Big${nfc}`, `app.a.${nfc} → app.a.${nfc}2`, `py.m.run → py.m.${nfc}`, `py.u.go → py.m.${nfc}`]);
  assert.deepEqual(holes(snapshot), []);
  // The export table keeps the names as the code writes them; `exports` compares them in NFC.
  assert.ok(snapshot.exports.some((row) => row.module === "app.a" && row.name === nfd));
  const o = keylang(dir, ["check"]);
  assert.equal(o.status, 0, o.stdout);
  assert.doesNotMatch(o.stdout, /K104|fail/);
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

test("typescript: `import * as ns` is a namespace object, not the default export: calling it is a hole and `ns.f()` reads no value; `require()` stays `module.exports`", (t) => {
  const b = "export function helper(): void {}\nexport function later(x: unknown): void {}\nexport default function defFn(): void {}\n";
  const dir = repo(
    t,
    {
      "src/b.ts": b,
      "src/a.ts": 'import * as ns from "./b";\nexport function callNs(): void { ns(); }\nexport function useNs(): void { ns.helper(); new ns.later(); }\n',
      "src/d.js": "module.exports = function main() {};\nmodule.exports.x = function () {};\n",
      "src/e.js": 'const d = require("./d");\nfunction run() { d(); d.x(); }\nmodule.exports = { run };\n',
    },
    { languages: ["typescript", "javascript"] },
  );
  const { snapshot } = map(dir);
  assert.deepEqual(calls(snapshot), ["app.a.useNs → app.b.helper", "app.a.useNs → app.b.later", "app.e.run → app.d.default", "app.e.run → app.d.x"]);
  assert.deepEqual(holes(snapshot), ["app.a.callNs: unresolved-call call of the namespace object `ns`, which is no function"]);
  // Reading a member of a module binding reads that member, not the binding.
  assert.deepEqual(Object.keys(snapshot.nodes).filter((id) => snapshot.nodes[id]?.escapes), []);
});

test("typescript: a namespace object read as a value hands on every export of its module", (t) => {
  const dir = repo(t, {
    "src/b.ts": "export function helper(): void {}\nexport class Box { constructor() {} }\nexport default function defFn(): void {}\n",
    "src/c.ts": 'import * as nb from "./b";\nexport function pass(keep: (x: unknown) => void): void { keep(nb); }\n',
  });
  const { snapshot } = map(dir);
  const escaping = Object.entries(snapshot.nodes)
    .filter(([, node]) => node.escapes?.reason === "`nb` is read as a value")
    .map(([id]) => id)
    .sort();
  assert.deepEqual(escaping, ["app.b.Box.constructor", "app.b.defFn", "app.b.helper"]);
});

test("typescript: `this.m()` follows the base classes as `super.m()` does; through a package's base it is external, through an unknown one a hole", (t) => {
  const dir = repo(t, {
    "package.json": '{"dependencies":{"react":"18"}}',
    "src/base.ts": "export class Base { greet(): void {} }\n",
    "src/a.ts": [
      'import { Component } from "react";',
      'import { Base } from "./base";',
      "export class C extends Component { m(): void { this.setState({}); super.setState({}); this.render(); } render(): null { return null; } }",
      "export class D extends Base { m(): void { this.greet(); super.greet(); } }",
      "export class E extends D { n(): void { this.greet(); this.m(); } }",
      "export class F extends Unknown { k(): void { this.zz(); } }",
      "",
    ].join("\n"),
  });
  const { snapshot } = map(dir);
  assert.deepEqual(calls(snapshot, "app.a."), ["app.a.C.m → app.a.C.render", "app.a.D.m → app.base.Base.greet", "app.a.E.n → app.a.D.m", "app.a.E.n → app.base.Base.greet"]);
  assert.deepEqual(holes(snapshot, "app.a."), ["app.a.F.k: unresolved-call unresolved call `this.zz`"]);
});

test("python: `self.m()` follows the base classes; a static or class method is found through an instance too", (t) => {
  const dir = repo(
    t,
    {
      "pkg/__init__.py": "",
      "pkg/a.py": "class Base:\n    def greet(self): pass\n    @staticmethod\n    def make(): pass\n",
      "pkg/m.py": "from .a import Base\nclass Child(Base):\n    def go(self):\n        self.greet()\n        self.make()\ndef use():\n    s = Base()\n    s.make()\n",
    },
    { languages: ["python"], layers: { app: ["pkg/**"] } },
  );
  const { snapshot } = map(dir);
  assert.deepEqual(calls(snapshot, "app.m."), ["app.m.Child.go → app.a.Base.greet", "app.m.Child.go → app.a.Base.make", "app.m.use → app.a.Base", "app.m.use → app.a.Base.make"]);
  assert.deepEqual(holes(snapshot, "app.m."), []);
});

test("php: `$this->m()` finds a method of a `use`d trait and of the base class; a static method is found through an instance too", (t) => {
  const dir = repo(
    t,
    {
      "src/Service.php": [
        "<?php",
        "namespace App;",
        "trait Logs { public function log(): void {} }",
        "class Base { public function greet(): void {} public static function make(): void {} }",
        "class Service extends Base {",
        "    use Logs;",
        "    public function run(): void { $this->log(); $this->greet(); $this->make(); }",
        "}",
        "function useIt(Service $s): void { $s->make(); $s->log(); }",
        "",
      ].join("\n"),
    },
    { languages: ["php"] },
  );
  const { snapshot } = map(dir);
  assert.deepEqual(calls(snapshot, "app.Service."), [
    "app.Service.Service.run → app.Service.Base.greet",
    "app.Service.Service.run → app.Service.Base.make",
    "app.Service.Service.run → app.Service.Logs.log",
    "app.Service.useIt → app.Service.Base.make",
    "app.Service.useIt → app.Service.Logs.log",
  ]);
  assert.deepEqual(holes(snapshot, "app.Service."), []);
});

test("php: a method is found whatever the case its call is written in, as PHP finds it", (t) => {
  const dir = repo(
    t,
    {
      "src/Order.php": [
        "<?php",
        "namespace App;",
        "trait Logs { public function log(): void {} }",
        "class Base { public function greet(): void {} public static function make(): void {} }",
        "class Order extends Base {",
        "    use Logs;",
        "    public function total(): int { return $this->HELPER() + self::Tax() + static::TAX(); }",
        "    private function helper(): int { return 1; }",
        "    public static function tax(): int { return 2; }",
        "    public function run(): void { $this->GREET(); parent::Greet(); $this->Make(); $this->LOG(); }",
        "}",
        "function useIt(Order $o): int { $o->Run(); return $o->TOTAL() + Order::TAX(); }",
        "",
      ].join("\n"),
    },
    { languages: ["php"] },
  );
  const { snapshot } = map(dir);
  assert.deepEqual(calls(snapshot), [
    "app.Order.Order.run → app.Order.Base.greet",
    "app.Order.Order.run → app.Order.Base.make",
    "app.Order.Order.run → app.Order.Logs.log",
    "app.Order.Order.total → app.Order.Order.helper",
    "app.Order.Order.total → app.Order.Order.tax",
    "app.Order.useIt → app.Order.Order.run",
    "app.Order.useIt → app.Order.Order.tax",
    "app.Order.useIt → app.Order.Order.total",
  ]);
  assert.deepEqual(holes(snapshot), []);
  // IDs keep the case the declaration is written in.
  assert.ok(snapshot.nodes["app.Order.Order.helper"] && !snapshot.nodes["app.Order.Order.HELPER"]);
});

test("rust: a name from `use m::*` resolves through that module's public items; two globs that both have it are ambiguous; a glob of a crate keeps it external", (t) => {
  const dir = repo(
    t,
    {
      "Cargo.toml": '[package]\nname = "demo"\nversion = "0.1.0"\n',
      "src/main.rs": "mod other;\nmod third;\nuse other::*;\nuse third::*;\nuse std::collections::*;\nfn main() {\n    from_glob();\n    both();\n    Order::new();\n    from_std();\n}\n",
      "src/other.rs": "pub fn from_glob() {}\npub fn both() {}\npub struct Order;\nimpl Order { pub fn new() -> Self { Order } }\n",
      "src/third.rs": "pub fn both() {}\n",
    },
    { languages: ["rust"] },
  );
  const { snapshot } = map(dir);
  assert.deepEqual(calls(snapshot, "app.main."), ["app.main.main → app.other.Order.new", "app.main.main → app.other.from_glob"]);
  const ambiguous = snapshot.edges.filter((e) => e.resolution === "ambiguous").map((e) => `${e.text}: ${e.candidates?.join(", ")}`);
  assert.deepEqual(ambiguous, ["both: app.other.both, app.third.both"]);
  assert.deepEqual(holes(snapshot, "app.main."), []);
});

test("python: a name from `from m import *` resolves through `m`'s public names, a class base too; a glob keylang cannot read says so", (t) => {
  const dir = repo(
    t,
    {
      "pkg/__init__.py": "",
      "pkg/a.py": "def fa(): pass\nclass Base:\n    def greet(self): pass\n",
      "pkg/m.py": "from .a import *\ndef run(keep):\n    fa()\n    Base()\n    keep(fa)\nclass Child(Base):\n    def go(self): self.greet()\n",
      "pkg/n.py": "from .missing import *\ndef run(): gone()\n",
    },
    { languages: ["python"], layers: { app: ["pkg/**"] } },
  );
  const { snapshot } = map(dir);
  assert.deepEqual(calls(snapshot, "app.m."), ["app.m.Child.go → app.a.Base.greet", "app.m.run → app.a.Base", "app.m.run → app.a.fa"]);
  assert.equal(snapshot.nodes["app.a.fa"]?.escapes?.reason, "`fa` is read as a value");
  assert.deepEqual(holes(snapshot, "app.n."), ["app.n.run: dynamic-call call through `gone`, a name from a glob import keylang does not follow"]);
});

test("python: a module an import binds is a module object: calling it is a hole, not its `default`; passing it on hands on its functions", (t) => {
  const dir = repo(
    t,
    {
      "pkg/__init__.py": "",
      "pkg/m.py": "def default():\n    pass\ndef f():\n    pass\n",
      "pkg/u.py": "import pkg.m as mm\nfrom pkg import m\nfrom . import m as m2\ndef run(register):\n    m()\n    mm()\n    m2()\n    m.f()\n    register(mm)\n",
    },
    { languages: ["python"], layers: { app: ["pkg/**"] } },
  );
  const { snapshot } = map(dir);
  assert.deepEqual(calls(snapshot, "app.u."), ["app.u.run → app.m.f"]);
  assert.deepEqual(holes(snapshot, "app.u."), [
    "app.u.run: dynamic-call call through a local value `register`",
    "app.u.run: unresolved-call call of the module object `m2`, which is no function",
    "app.u.run: unresolved-call call of the module object `m`, which is no function",
    "app.u.run: unresolved-call call of the module object `mm`, which is no function",
  ]);
  assert.equal(snapshot.nodes["app.m.default"]?.escapes?.reason, "`mm` is read as a value");
  assert.equal(snapshot.nodes["app.m.f"]?.escapes?.reason, "`mm` is read as a value");
});

test("python: an import from a module that does not exist is an unresolved import, not a dependency on the package above it", (t) => {
  const dir = repo(
    t,
    {
      "pkg/__init__.py": "",
      "pkg/m.py": "def f(): pass\n",
      "pkg/n.py": "from .missing import *\nfrom .absent import f\nfrom pkg.absent2 import g\nfrom . import m\nfrom .m import *\nfrom . import *\n",
    },
    { languages: ["python"], layers: { app: ["pkg/**"] } },
  );
  const { snapshot } = map(dir);
  const imports = snapshot.edges.filter((e) => e.kind === "import" && e.source === "app.n").map((e) => `${e.line} ${e.target ?? e.reason}`);
  assert.deepEqual(imports, ["4 app.m", "6 app.__init__", "1 unresolved import `.missing.*`", "2 unresolved import `.absent.f`", "3 unresolved import `pkg.absent2.g`"]);
});

test("typescript: `import type`, `export type … from` and, without verbatimModuleSyntax, `import { type A }` are import edges marked `typeOnly`: `no-cycles` skips them, while `deny`, the map, `deps` and `explain` see them", (t) => {
  const dir = repo(
    t,
    {
      "src/a/a.ts": 'import { b } from "../b/b";\nimport { e } from "../b/e";\nexport interface A { x: number }\nexport function a(): void { b(); e(); }\n',
      "src/b/b.ts": 'import type { A } from "../a/a";\nexport function b(x?: A): void {}\n',
      "src/b/c.ts": 'export type { A } from "../a/a";\n',
      "src/b/d.ts": 'import { type A } from "../a/a";\nexport function d(x?: A): void {}\n',
      // A type-only import, then one that loads the module: one dependency, which runs.
      "src/b/e.ts": 'import type { A } from "../a/a";\nimport { a } from "../a/a";\nexport function e(x?: A): void { a(); }\n',
      "keylang/rules.md": "# rules\n\n- no-cycles\n- deny b a\n",
    },
    { layers: { a: ["src/a/**"], b: ["src/b/**"] } },
  );
  const { snapshot } = map(dir);
  const toA = snapshot.edges.filter((e) => e.target === "a.a").map((e) => `${e.kind}${e.typeOnly ? " typeOnly" : ""} ${e.source}:${e.line}`).sort();
  // No tsconfig, so no verbatimModuleSyntax: `import { type A }` is erased like `import type { A }`.
  assert.deepEqual(toA, ["import b.e:2", "import typeOnly b.b:1", "import typeOnly b.d:1", "reexport typeOnly b.c:1"]);
  assert.deepEqual(snapshot.edges.filter((e) => e.kind === "type" && e.source.split(".").length === 2), [], "no module-to-module `type` edge");
  assert.deepEqual(snapshot.nodes["b.b"]?.deps, ["a.a"]);
  assert.deepEqual(snapshot.nodes["a.a"]?.dependents, ["b.b", "b.c", "b.d", "b.e"]);
  assert.deepEqual(snapshot.exports.filter((e) => e.module === "b.c").map((e) => `${e.name} → ${e.symbol}`), ["A → a.a.A"]);
  // The map prints a type-only dependency like any other.
  assert.match(readFileSync(join(dir, "keylang/map/b.md"), "utf8"), /- module \[b\]\(\.\.\/\.\.\/src\/b\/b\.ts#L1\)\n {4}- a a\.a\n/);
  assert.match(keylang(dir, ["explain", "b.b"]).stdout, /^depends on: a\.a$/m);
  const o = keylang(dir, ["check"]);
  assert.equal(o.status, 1, o.stdout);
  // The only cycle runs through the import of `b.e` that loads `a.a`.
  assert.deepEqual(o.stdout.match(/K105 .*/g), ["K105 divergence: dependency cycle a.a → b.e → a.a"]);
  for (const m of ["b\\.b", "b\\.c", "b\\.d", "b\\.e"]) assert.match(o.stdout, new RegExp(`K102 divergence: \`${m}\` depends on \`a\\.a\``));
});

test("typescript: a name a generic binds — a type parameter, a mapped type's key, an `infer` — is no type reference in its scope", (t) => {
  const dir = repo(t, {
    "src/a.ts": [
      "export interface Box<T> { value: T }",
      "export type Pair<K, V extends K = K> = { k: K; v: V };",
      "export type Keys<T> = { readonly [K in keyof T]: T[K] };",
      "export type Item<T> = T extends Array<infer U extends Box<number>> ? U : never;",
      "export function f<T>(x: T): T { return x; }",
      "export class C<T, U extends Box<T>> {",
      "  m(x: T): U | undefined { return undefined; }",
      "  g<V>(v: V, t: T): Box<V> { return { value: v }; }",
      "}",
      "export class D<T> extends C<T, Box<T>> {}",
      "export const h = <R,>(r: R): R => r;",
      "export function outer<Q>(q: Q): void {",
      "  const arrow = <S,>(y: Q, s: S): Q => y;",
      "}",
      "export function free(x: T): void {}",
      "",
    ].join("\n"),
  });
  const { snapshot } = map(dir);
  const types = snapshot.edges.filter((e) => e.kind === "type").map((e) => `${e.source} ${e.text} → ${e.target ?? e.resolution}`);
  // A constraint names a type (`U extends Box<T>`: `Box`, not `T`); `T` outside any generic is still a type keylang does not know.
  assert.deepEqual(types.sort(), ["app.a.C Box → app.a.Box", "app.a.C.g Box → app.a.Box", "app.a.D Box → app.a.Box", "app.a.Item Box → app.a.Box", "app.a.free T → unresolved"]);
});

test("typescript: `export type * from` and `export type * as NS from` are read as type-only re-exports, not a syntax error", (t) => {
  const dir = repo(t, {
    "src/t.ts": "export type T = 1;\nexport interface U { u: T }\n",
    "src/a.ts": 'export type * from "./t";\nexport function keep(): void {}\n',
    "src/b.ts": '/** Types of `t`. */\nexport type * as NS from "./t";\n',
    "src/use.ts": 'import type { T } from "./a";\nimport type { NS } from "./b";\nexport function f(x: T, y: NS.U): void {}\n',
  });
  const { snapshot } = map(dir);
  assert.deepEqual(snapshot.coverage.filter((c) => c.kind === "parse-error"), []);
  assert.equal(snapshot.nodes["app.a"]?.members, "complete");
  assert.equal(snapshot.nodes["app.b"]?.members, "complete");
  const rows = snapshot.exports.filter((e) => e.module === "app.a" || e.module === "app.b").map((e) => `${e.module} ${e.name} → ${e.symbol}`);
  assert.deepEqual(rows, ["app.a T → app.t.T", "app.a U → app.t.U", "app.a keep → app.a.keep", "app.b NS → app.t"]);
  // The text is the statement as written, `type` included.
  const toT = snapshot.edges.filter((e) => e.target === "app.t").map((e) => `${e.kind}${e.typeOnly ? " typeOnly" : ""} ${e.source} ${e.text}`);
  assert.deepEqual(toT, ['reexport typeOnly app.a export type * from "./t";', 'reexport typeOnly app.b export type * as NS from "./t";']);
  const types = snapshot.edges.filter((e) => e.kind === "type" && e.source === "app.use.f").map((e) => `${e.text} → ${e.target}`);
  assert.deepEqual(types, ["T → app.t.T", "NS.U → app.t.U"]);
});

test("php: a class or a function is found whatever the case its name is written in, as PHP finds it; two declarations whose names differ only in case leave such a name a hole", (t) => {
  const dir = repo(
    t,
    {
      "src/Order.php": [
        "<?php",
        "namespace App;",
        "class Order { public static function make(): void {} public function total(): int { return 1; } }",
        "function helper(): int { return 2; }",
        "function local(): int { $o = new ORDER(); return $o->total() + HELPER(); }",
        "",
      ].join("\n"),
      // PHP keeps classes and functions apart; the export table of the file holds both.
      "src/Twin.php": "<?php\nnamespace App;\nclass Twin {}\nfunction twin(): void {}\n",
      "src/Use.php": [
        "<?php",
        "namespace App;",
        "use App\\order as Alias;",
        "function useIt(ORDER $p): int {",
        "    $o = new ORDER();",
        "    ORDER::MAKE();",
        "    TWIN();",
        "    $a = new alias();",
        "    return HELPER() + $o->total() + $a->TOTAL();",
        "}",
        "",
      ].join("\n"),
    },
    { languages: ["php"] },
  );
  const { snapshot } = map(dir);
  assert.deepEqual(calls(snapshot), [
    "app.Order.local → app.Order.Order",
    "app.Order.local → app.Order.Order.total",
    "app.Order.local → app.Order.helper",
    "app.Use.useIt → app.Order.Order",
    "app.Use.useIt → app.Order.Order.make",
    "app.Use.useIt → app.Order.Order.total",
    "app.Use.useIt → app.Order.helper",
  ]);
  assert.deepEqual(holes(snapshot), ["app.Use.useIt: unresolved-call unresolved call `TWIN`"]);
  const types = snapshot.edges.filter((e) => e.kind === "type").map((e) => `${e.source} ${e.text} → ${e.target}`);
  assert.deepEqual(types, ["app.Use.useIt ORDER → app.Order.Order"]);
  // IDs keep the case the declaration is written in.
  assert.ok(snapshot.nodes["app.Order.Order"] && snapshot.nodes["app.Order.helper"]);
  assert.deepEqual(Object.keys(snapshot.nodes).filter((id) => /ORDER|HELPER/.test(id)), []);
});

test("typescript: a step to a package is proved by an import from the parent's module that loads it, never by `import type` or `export type … from`", (t) => {
  const dir = repo(t, {
    "package.json": '{"dependencies":{"zod":"3.0.0","yup":"1.0.0"}}',
    "src/a.ts": 'import type { ZodType } from "zod";\nexport type { Schema } from "yup";\nexport function run(x?: ZodType): void {}\n',
    // A runtime import in another module proves nothing for `app.a`.
    "src/b.ts": 'import { z } from "zod";\nexport function other(): unknown { return z; }\n',
    "src/c.ts": 'import type { ZodType } from "zod";\nimport { z } from "zod";\nexport function both(x?: ZodType): unknown { return z; }\n',
    "keylang/flows/f.md": "# flow f\n\n- trigger app.a.run\n  - step external.zod\n  - step external.yup\n",
    "keylang/flows/g.md": "# flow g\n\n- trigger app.c.both\n  - step external.zod\n",
  });
  map(dir);
  const o = keylang(dir, ["check"]);
  assert.equal(o.status, 0, o.stdout + o.stderr);
  const statics = o.stdout.split("\n").filter((line) => line.includes(" static "));
  assert.deepEqual(statics, [
    "keylang/flows/f.md:4:3: static unverified external.zod: no import of `external.zod` from `app.a`; the type-only import at src/a.ts:1:1 is erased from the code that runs",
    "keylang/flows/f.md:5:3: static unverified external.yup: no import of `external.yup` from `app.a`; the type-only import at src/a.ts:2:1 is erased from the code that runs",
    "keylang/flows/g.md:4:3: static ok external.zod: imported by `app.c`",
  ]);
});

test("typescript: a class's type-parameter constraint and default, and a method signature of an interface or an object type, are type references of their declaration", (t) => {
  const dir = repo(t, {
    "src/order.ts": "export class Order {}\nexport interface Item {}\nexport class Base<T> {}\n",
    "src/c.ts": [
      'import { Order, Item, Base } from "./order";',
      "export class C<T extends Order, U = Item> extends Base<T> {}",
      "export interface Repo<Q> { save(o: Order): void; find<T extends Item>(x: T): Q; }",
      "export type R = { load(): Order };",
      "export const E = class<V extends Order> {};",
      "",
    ].join("\n"),
  });
  const { snapshot } = map(dir);
  const types = snapshot.edges.filter((e) => e.kind === "type").map((e) => `${e.source} ${e.text}:${e.line}:${e.col} → ${e.target}`);
  // A type parameter's own name (`T`, `Q`, `V`) is no reference.
  assert.deepEqual(types.sort(), [
    "app.c.C Item:2:37 → app.order.Item",
    "app.c.C Order:2:26 → app.order.Order",
    "app.c.E Order:5:34 → app.order.Order",
    "app.c.R Order:4:27 → app.order.Order",
    "app.c.Repo Item:3:65 → app.order.Item",
    "app.c.Repo Order:3:36 → app.order.Order",
  ]);
});

test("php: a hole, a callable or a module-level call that names a method or a function in another case is a possible route to it, never an absence `fail`; a case-sensitive language keeps its `fail`", (t) => {
  const dir = repo(
    t,
    {
      "src/Jobs.php": [
        "<?php",
        "namespace App;",
        "class Job { public function run(): void {} }",
        "class Store { public function save(): void {} }",
        "class Base { public function work(): void {} }",
        "class Child extends Base { public function WORK(): void {} }",
        "class Kernel { public function handle(): void {} }",
        "function helper(): void {}",
        "function start($x): void { $x->RUN(); }",
        "function keep(Store $o): array { return [$o, 'SAVE']; }",
        "function go(Base $b): void { $b->work(); }",
        "function begin(): void {}",
        "",
      ].join("\n"),
      // Code outside declarations runs when the file is included.
      "src/boot.php": "<?php\nnamespace App;\n$kernel = make_kernel();\n$kernel->HANDLE();\ncall_user_func('App\\HELPER');\n",
      "src/t.ts": "export class Task { run(): void {} }\nexport function start(x: any): void { x.RUN(); }\n",
      "keylang/flows/begin.md": "# flow begin\n\n- trigger app.Jobs.begin\n  - step app.Jobs.Store.save\n  - step app.Jobs.Kernel.handle\n  - step app.Jobs.helper\n",
      "keylang/flows/jobs.md": "# flow jobs\n\n- trigger app.Jobs.start\n  - step app.Jobs.Job.run\n",
      "keylang/flows/task.md": "# flow task\n\n- trigger app.t.start\n  - step app.t.Task.run\n",
      "keylang/flows/work.md": "# flow work\n\n- trigger app.Jobs.go\n  - step app.Jobs.Child.WORK\n  - calls app.Jobs.Child.WORK\n",
    },
    { languages: ["php", "typescript"] },
  );
  map(dir);
  const o = keylang(dir, ["check"]);
  // The only `fail`: a TypeScript call `x.RUN()` cannot run `run`.
  assert.equal(o.status, 1, o.stdout + o.stderr);
  const statics = o.stdout.split("\n").filter((line) => line.includes(" static "));
  assert.deepEqual(statics, [
    "keylang/flows/begin.md:4:3: static unverified app.Jobs.Store.save: no call path from app.Jobs.begin in the static graph; `SAVE` is read as a value at src/Jobs.php:10:41, so code keylang cannot follow may call `app.Jobs.Store.save`",
    "keylang/flows/begin.md:5:3: static unverified app.Jobs.Kernel.handle: no call path from app.Jobs.begin in the static graph; `kernel.HANDLE` is called from module-level code at src/boot.php:4:1, so code keylang cannot follow may call `app.Jobs.Kernel.handle`",
    "keylang/flows/begin.md:6:3: static unverified app.Jobs.helper: no call path from app.Jobs.begin in the static graph; `call_user_func` calls a callable chosen at run time at src/boot.php:5:1 may call it",
    "keylang/flows/jobs.md:4:3: static unverified app.Jobs.Job.run: no resolved path from app.Jobs.start; call through a local value `x.RUN` at src/Jobs.php:9:28 may reach it",
    "keylang/flows/task.md:4:3: static fail app.t.Task.run: absence: no call path from app.t.start; `app.t.Task.run` and its callers are called only by name, and no call from app.t.start's reachable code can reach them; add a call to `app.t.Task.run` in `app.t.start` or in a function it reaches",
    "keylang/flows/work.md:4:3: static unverified app.Jobs.Child.WORK: no resolved path from app.Jobs.go; `b.work` may dispatch to another `work` at src/Jobs.php:11:30 may reach it",
    "keylang/flows/work.md:5:11: static unverified app.Jobs.Child.WORK: no resolved call from app.Jobs.go; `b.work` may dispatch to another `work` at src/Jobs.php:11:30",
  ]);
});

test("typescript: a class field that holds no function names its types for the class — its annotation, its initializer, an index signature; a type parameter of the class does not", (t) => {
  const dir = repo(t, {
    "src/order.ts": "export class Order {}\nexport interface Repo {}\nexport interface Item {}\nexport function make(): Order { return new Order(); }\n",
    "src/c.ts": [
      'import { Order, Repo, Item, make } from "./order";',
      "export class C<T> {",
      "  repo!: Order;",
      "  x: Order = make();",
      "  private readonly r?: Repo;",
      "  static s = new Map<string, Item>();",
      "  #p?: T;",
      "  [key: string]: Item | T | undefined;",
      "  h: (o: Order) => void = (o) => {};",
      "}",
      "",
    ].join("\n"),
  });
  const { snapshot } = map(dir);
  const types = snapshot.edges.filter((e) => e.kind === "type" && e.source.startsWith("app.c.")).map((e) => `${e.source} ${e.text}:${e.line}:${e.col} → ${e.target}`);
  assert.deepEqual(types.sort(), [
    "app.c.C Item:6:30 → app.order.Item",
    "app.c.C Item:8:18 → app.order.Item",
    "app.c.C Order:3:10 → app.order.Order",
    "app.c.C Order:4:6 → app.order.Order",
    "app.c.C Repo:5:24 → app.order.Repo",
    // A field that holds a function is a fn of its own, with its own references.
    "app.c.C.h Order:9:10 → app.order.Order",
  ]);
});

test("php: a constructor written `__CONSTRUCT` is the class's `__construct`, the member `new X()` runs", (t) => {
  const dir = repo(
    t,
    {
      "src/App/Order.php": "<?php\nnamespace App;\nclass Order {\n  public function __CONSTRUCT() { $this->init(); }\n  private function init(): void {}\n}\nfunction make(): Order { return new Order(); }\n",
      "keylang/flows/make.md": "# flow make\n- trigger app.Order.make\n  - step app.Order.Order.__construct\n",
    },
    { languages: ["php"], layers: { app: ["src/App/**"] } },
  );
  const { snapshot } = map(dir);
  assert.ok(snapshot.nodes["app.Order.Order.__construct"], Object.keys(snapshot.nodes).join(", "));
  assert.equal(snapshot.nodes["app.Order.Order.__CONSTRUCT"], undefined);
  const check = keylang(dir, ["check", "keylang/flows/make.md"]);
  assert.equal(check.status, 0, check.stdout + check.stderr);
  assert.match(check.stdout, /static ok app\.Order\.Order\.__construct: called from app\.Order\.make/);
});
