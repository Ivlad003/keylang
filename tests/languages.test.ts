// End-to-end tests of the frontends beyond TypeScript: `init`, `map` and
// `check` through the CLI on minimal repositories copied to a temporary directory.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");

function keylang(cwd: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function copy(t: TestContext, fixture: string): string {
  const dir = mkdtempSync(join(tmpdir(), `keylang-${fixture}-`));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(join(root, "tests/fixtures", fixture), dir, { recursive: true });
  return dir;
}

/** A repository of `files` in a temporary directory. */
function repo(t: TestContext, files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-lang-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), text);
  }
  return dir;
}

interface Snapshot {
  nodes: Record<string, { kind: string; escapes?: { reason: string } }>;
  edges: { kind: string; source: string; target: string | null; resolution: string; text: string }[];
  coverage: { kind: string; file: string; line: number; text: string; reason: string; source: string | null }[];
  exports: { module: string; name: string; symbol: string | null; kind: string; form?: string; from?: string; reason?: string }[];
}

function snapshot(dir: string): Snapshot {
  return JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as Snapshot;
}

test("rust: init detects the language and layers; map follows `use`, `mod` paths and `impl` members", (t) => {
  const dir = copy(t, "rust-shop");
  const init = keylang(dir, ["init"]);
  assert.equal(init.status, 0, init.stderr);
  const config = JSON.parse(readFileSync(join(dir, "keylang.json"), "utf8"));
  assert.deepEqual(config.languages, ["rust"]);
  assert.deepEqual(Object.keys(config.layers), ["domain", "infra", "main"]);
  const index = snapshot(dir);
  for (const id of ["domain.order.Order.new", "domain.order.place", "infra.store.save", "main.main.main"]) assert.equal(index.nodes[id]?.kind, "fn", id);
  const edge = (kind: string, source: string, target: string): boolean => index.edges.some((e) => e.kind === kind && e.source === source && e.target === target);
  assert.ok(edge("import", "domain.order", "infra.db"), "`use crate::infra::db::Db`");
  assert.ok(edge("import", "infra.store", "external.serde"), "a `[dependencies]` crate is external");
  assert.ok(edge("call", "main.main.main", "infra.store.save"), "a `use`d fn");
  assert.ok(edge("call", "main.main.main", "domain.order.place"), "a path through `mod domain;`");
  assert.ok(edge("call", "domain.order.place", "domain.order.Order.new"), "`Order::new()`");
  assert.ok(edge("call", "infra.store.save", "domain.order.place"), "`crate::…::place()`");
  // Calls keylang cannot resolve syntactically stay holes, never edges.
  assert.ok(index.coverage.some((c) => c.kind === "dynamic-call" && c.reason.includes("order.total")), "a method through a value");
  assert.ok(index.coverage.some((c) => c.kind === "unsupported" && c.reason === "macro `audit!` is not expanded"));
  assert.ok(!index.coverage.some((c) => c.reason.includes("println")), "std macros are not holes");
  // `Some(…)` constructs a variant and `u64::from` is the language's: neither is a hole nor an import.
  assert.ok(!index.coverage.some((c) => /Some|u64/.test(c.reason)), JSON.stringify(index.coverage));
  assert.equal(keylang(dir, ["map", "--check"]).status, 0, "the map is deterministic");
});

test("rust: a forbidden `use` between layers is a K102 divergence", (t) => {
  const dir = copy(t, "rust-shop");
  assert.equal(keylang(dir, ["init"]).status, 0);
  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- deny domain infra\n");
  const o = keylang(dir, ["check"]);
  assert.equal(o.status, 1, o.stdout);
  assert.match(o.stdout, /src\/domain\/order\.rs:1:1: K102 divergence: `domain\.order` depends on `infra\.db`, which is denied by `deny domain infra`/);
});

test("rust: an unknown crate in `use` is an unresolved import in coverage, not an edge", (t) => {
  const dir = copy(t, "rust-shop");
  writeFileSync(join(dir, "src/infra/db.rs"), "use missing::Thing;\n\npub struct Db;\n");
  assert.equal(keylang(dir, ["init"]).status, 0);
  const index = snapshot(dir);
  assert.ok(index.coverage.some((c) => c.kind === "unresolved-import" && c.file === "src/infra/db.rs" && c.reason === "unresolved import `missing::Thing`"));
  assert.ok(!index.edges.some((e) => e.kind === "import" && e.source === "infra.db" && e.target !== null));
});

test("rust: a flow over Rust calls has static evidence; a step through a method on a value does not", (t) => {
  const dir = copy(t, "rust-shop");
  // `use crate::infra::store;` binds the module: `store::save()` is a call edge to its fn.
  writeFileSync(join(dir, "src/main.rs"), "mod domain;\nmod infra;\n\nuse crate::infra::store;\n\nfn main() {\n    store::save();\n}\n");
  assert.equal(keylang(dir, ["init"]).status, 0);
  writeFileSync(
    join(dir, "keylang/flows.md"),
    "# flow save\n\n- trigger main.main.main\n  - step infra.store.save\n    - step domain.order.place\n      - step domain.order.Order.new\n      - step domain.order.Order.total\n",
  );
  const o = keylang(dir, ["check"]);
  assert.match(o.stdout, /flows\.md:4:3: static ok infra\.store\.save: called from main\.main\.main/);
  assert.match(o.stdout, /flows\.md:6:7: static ok domain\.order\.Order\.new: called from domain\.order\.place/);
  // `order.total()` goes through a value: no edge, so the step is not proven.
  assert.match(o.stdout, /flows\.md:7:7: static unverified domain\.order\.Order\.total: no resolved path from domain\.order\.place; call through a local value `order\.total`/);
});

test("rust: a workspace member's crate name resolves to its root; `crate::` in build.rs does not reach `src/`", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "keylang-rust-ws-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const files: Record<string, string> = {
    "Cargo.toml": '[workspace]\nmembers = ["crates/*"]\n',
    "crates/shop-core/Cargo.toml": '[package]\nname = "shop-core"\nversion = "0.1.0"\n',
    "crates/shop-core/src/lib.rs": "pub fn place() {}\n",
    "crates/shop-app/Cargo.toml": '[package]\nname = "shop-app"\nversion = "0.1.0"\n\n[dependencies]\nshop-core = { path = "../shop-core" }\n',
    "crates/shop-app/src/main.rs": "use shop_core::place;\n\nfn main() {\n    place();\n}\n",
    "crates/shop-app/build.rs": "fn main() {\n    crate::gen::run();\n}\n",
    "keylang.json": JSON.stringify({ languages: ["rust"], layers: { core: ["crates/shop-core/**"], app: ["crates/shop-app/**"] } }),
  };
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), text);
  }
  assert.equal(keylang(dir, ["map"]).status, 0);
  const index = snapshot(dir);
  assert.ok(index.edges.some((e) => e.kind === "call" && e.source === "app.src.main.main" && e.target === "core.src.lib.place"), JSON.stringify(index.edges));
  assert.ok(index.coverage.some((c) => c.kind === "unresolved-import" && c.file === "crates/shop-app/build.rs"));
});

// Cargo finds the workspace root by walking up from the crate: a `[workspace]`
// in `backend/` governs `backend/crates/*` as a root one does. A `path`
// dependency on a crate of the repository, renamed through `package` or
// without any workspace, is that crate's library too, not an external package.
test("rust: a workspace under a subdirectory and `path` dependencies resolve to the crate's library, so `deny app core` is K102", (t) => {
  const core = { "Cargo.toml": '[package]\nname = "shop-core"\nversion = "0.1.0"\n', "src/lib.rs": "pub fn place() {}\n" };
  const app = (dep: string, call: string): Record<string, string> => ({
    "Cargo.toml": `[package]\nname = "shop-app"\nversion = "0.1.0"\n\n[dependencies]\n${dep}\n`,
    "src/main.rs": `fn main() {\n    ${call}::place();\n}\n`,
  });
  const under = (dir: string, files: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(files).map(([f, text]) => [`${dir}/${f}`, text]));
  const polyglot = {
    "package.json": '{ "name": "shop", "private": true }\n',
    "web/index.ts": "export const page = 1;\n",
    "keylang.json": JSON.stringify({ languages: ["typescript", "rust"], layers: { web: ["web/**"], core: ["backend/crates/core/**"], app: ["backend/crates/app/**"] } }),
    "keylang/rules.md": "# rules\n\n- deny app core\n",
  };
  const cases: Record<string, Record<string, string>> = {
    "workspace under backend/ with a glob": { "backend/Cargo.toml": '[workspace]\nmembers = ["crates/*"]\n', ...under("backend/crates/app", app('shop-core = { path = "../core" }', "shop_core")) },
    "workspace under backend/ with explicit members": { "backend/Cargo.toml": '[workspace]\nmembers = ["crates/core", "crates/app"]\n', ...under("backend/crates/app", app('shop-core = { path = "../core" }', "shop_core")) },
    "path dependency renamed through `package`": { "backend/Cargo.toml": '[workspace]\nmembers = ["crates/*"]\n', ...under("backend/crates/app", app('domain = { package = "shop-core", path = "../core" }', "domain")) },
    "path dependency without a workspace": under("backend/crates/app", app('shop-core = { path = "../core" }', "shop_core")),
  };
  for (const [name, files] of Object.entries(cases)) {
    const dir = repo(t, { ...polyglot, ...under("backend/crates/core", core), ...files });
    const o = keylang(dir, ["check"]);
    assert.equal(o.status, 1, `${name}: ${o.stdout}${o.stderr}`);
    assert.match(o.stdout, /backend\/crates\/app\/src\/main\.rs:2:5: K102 divergence: `app\.src\.main` depends on `core\.src\.lib`, which is denied by `deny app core`/, name);
    assert.match(o.stderr, /1 fail, 0 unverified, 0 ok/, name);
    assert.equal(keylang(dir, ["map"]).status, 0, name);
    const index = snapshot(dir);
    assert.ok(index.edges.some((e) => e.kind === "call" && e.source === "app.src.main.main" && e.target === "core.src.lib.place"), `${name}: ${JSON.stringify(index.edges)}`);
    assert.ok(!index.edges.some((e) => e.target === "external.shop-core" || e.target === "external.domain"), `${name}: no external edge`);
  }
});

const pyLayers = { languages: ["python"], layers: { domain: ["shop/domain/**"], infra: ["shop/infra/**"], app: ["shop/*"] } };

test("python: init detects the language; map follows relative and absolute imports, `self` and module bindings", (t) => {
  const dir = copy(t, "py-shop");
  assert.equal(keylang(dir, ["init"]).status, 0);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "keylang.json"), "utf8")).languages, ["python"]);
  writeFileSync(join(dir, "keylang.json"), JSON.stringify(pyLayers));
  assert.equal(keylang(dir, ["map"]).status, 0);
  const index = snapshot(dir);
  const edge = (kind: string, source: string, target: string): boolean => index.edges.some((e) => e.kind === kind && e.source === source && e.target === target);
  assert.ok(edge("import", "domain.order", "infra.db"), "`from ..infra.db import Db`");
  assert.ok(edge("import", "app.main", "infra.store"), "`from .infra.store import save`");
  assert.ok(!index.edges.some((e) => e.target === "external.json") && !("external.json" in index.nodes), "`import json` is the standard library: no node, no edge");
  assert.ok(!index.edges.some((e) => e.target === "domain.__init__"), "`from shop.domain import order` binds the module `order`, not the package");
  assert.ok(edge("call", "infra.store.save", "domain.order.place"), "`order.place()` through the module binding");
  assert.ok(edge("call", "domain.order.Order.paid", "domain.order.Order.total"), "`self.total()`");
  assert.ok(edge("call", "app.main.main", "infra.store.save"));
  assert.ok(edge("call", "domain.order.place", "domain.order.Order.total"), "`order = Order()` names the class of `order`");
  // A method through a value of unknown class, a dynamic import and a replacing decorator are holes, not edges.
  assert.ok(index.coverage.some((c) => c.kind === "dynamic-call" && c.reason === "call through a local value `self.queue.put`"), "a method of an attribute of `self`");
  assert.ok(index.coverage.some((c) => c.kind === "unsupported" && c.reason === "dynamic import"));
  assert.ok(index.coverage.some((c) => c.kind === "unsupported" && c.reason === "decorator `route` may replace `handler`"));
  assert.equal(keylang(dir, ["map", "--check"]).status, 0);
});

test("python: a forbidden import between layers is a K102 divergence", (t) => {
  const dir = copy(t, "py-shop");
  writeFileSync(join(dir, "keylang.json"), JSON.stringify(pyLayers));
  mkdirSync(join(dir, "keylang"), { recursive: true });
  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- deny domain infra\n");
  const o = keylang(dir, ["check"]);
  assert.equal(o.status, 1, o.stdout);
  assert.match(o.stdout, /shop\/domain\/order\.py:1:1: K102 divergence: `domain\.order` depends on `infra\.db`/);
});

const python3 = spawnSync("python3", ["--version"], { encoding: "utf8" }).status === 0;

test("python: `keylang trace-plan` + the Python adapter give trace evidence; a file changed after the plan is not instrumented", { skip: python3 ? false : "python3 is not installed" }, (t) => {
  const dir = copy(t, "py-shop");
  writeFileSync(join(dir, "shop/main.py"), "from .infra.store import save\n\n\ndef main():\n    save()\n");
  writeFileSync(join(dir, "run.py"), "from shop.main import main\n\nmain()\n");
  writeFileSync(join(dir, "keylang.json"), JSON.stringify({ ...pyLayers, exclude: ["run.py"], check: { trace: ".keylang/trace/*.jsonl" } }));
  mkdirSync(join(dir, "keylang"), { recursive: true });
  writeFileSync(join(dir, "keylang/flows.md"), "# flow save\n\n- trigger app.main.main\n  - step infra.store.save\n    - step domain.order.place\n      - step domain.order.Order.total\n");
  const plan = keylang(dir, ["trace-plan", "save"]);
  assert.equal(plan.status, 0, plan.stderr);
  writeFileSync(join(dir, "plan.json"), plan.stdout);
  assert.deepEqual((JSON.parse(plan.stdout) as { symbols: { id: string }[] }).symbols.map((s) => s.id), ["app.main.main", "domain.order.Order.total", "domain.order.place", "infra.store.save"]);
  const trace = (): number | null =>
    spawnSync("python3", [join(root, "adapters/python/keylang_trace.py"), "run.py"], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, KEYLANG_TRACE: ".keylang/trace/save.jsonl", KEYLANG_TRACE_PLAN: "plan.json", KEYLANG_TRACE_TEST: "run.py > @flow save" },
    }).status;
  assert.equal(trace(), 0);
  const o = keylang(dir, ["check"]);
  assert.match(o.stdout, /flows\.md:5:5: trace ok domain\.order\.place: observed in run\.py > @flow save/);
  // `order = Order(); order.total()`: static and trace evidence agree.
  assert.match(o.stdout, /flows\.md:6:7: static ok domain\.order\.Order\.total: called from domain\.order\.place/);
  assert.match(o.stdout, /flows\.md:6:7: trace ok domain\.order\.Order\.total/);

  // After the plan, `store.py` changes: its function is not instrumented, and the trace belongs to an older snapshot.
  rmSync(join(dir, ".keylang/trace"), { recursive: true, force: true });
  writeFileSync(join(dir, "shop/infra/store.py"), `${readFileSync(join(dir, "shop/infra/store.py"), "utf8")}\n# changed\n`);
  assert.equal(trace(), 0);
  const events = readFileSync(join(dir, ".keylang/trace/save.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line) as { event: string; symbolId?: string; instrumented?: string[] });
  assert.ok(!events.some((e) => e.symbolId === "infra.store.save"));
  assert.ok(!events.find((e) => e.event === "run")!.instrumented!.includes("infra.store.save"));
  assert.match(keylang(dir, ["check"]).stdout, /flows\.md:4:3: trace unverified infra\.store\.save: stale trace/);
});

const rustc = spawnSync("rustc", ["--version"], { encoding: "utf8" }).status === 0;

test("rust: explicit spans give trace evidence; a step without a span is unobserved, a span never entered is a missing step", { skip: rustc ? false : "rustc is not installed" }, (t) => {
  const dir = copy(t, "rust-shop");
  const adapter = join(root, "adapters/rust/keylang_trace.rs");
  writeFileSync(
    join(dir, "src/main.rs"),
    `mod domain;\nmod infra;\n#[path = ${JSON.stringify(adapter)}]\nmod keylang_trace;\n\nuse crate::infra::store::save;\n\nfn main() {\n    {\n        let _span = keylang_trace::span("main.main.main");\n        save();\n    }\n    keylang_trace::finish();\n}\n`,
  );
  writeFileSync(join(dir, "src/infra/store.rs"), 'pub fn save() {\n    let _span = crate::keylang_trace::span("infra.store.save");\n    crate::domain::order::place();\n}\n');
  const order = readFileSync(join(dir, "src/domain/order.rs"), "utf8")
    .replace("pub fn place() -> Db {\n", 'pub fn place() -> Db {\n    let _span = crate::keylang_trace::span("domain.order.place");\n')
    .replace("fn helper() {}", 'fn helper() {}\n\npub fn refund() {\n    let _span = crate::keylang_trace::span("domain.order.refund");\n}');
  writeFileSync(join(dir, "src/domain/order.rs"), order);
  writeFileSync(join(dir, "keylang.json"), JSON.stringify({ languages: ["rust"], layers: { domain: ["src/domain/**"], infra: ["src/infra/**"], main: ["src/*"] }, check: { trace: ".keylang/trace/*.jsonl" } }));
  mkdirSync(join(dir, "keylang"), { recursive: true });
  writeFileSync(join(dir, "keylang/flows.md"), "# flow save\n\n- trigger main.main.main\n  - step infra.store.save\n    - step domain.order.place\n      - step domain.order.Order.new\n  - step domain.order.refund\n");
  const plan = keylang(dir, ["trace-plan", "save"]);
  assert.equal(plan.status, 0, plan.stderr);
  writeFileSync(join(dir, "plan.json"), plan.stdout);
  const build = spawnSync("rustc", ["--edition", "2021", "-A", "warnings", "-o", join(dir, "shop"), "src/main.rs"], { cwd: dir, encoding: "utf8" });
  assert.equal(build.status, 0, build.stderr);
  const exec = spawnSync(join(dir, "shop"), [], { cwd: dir, encoding: "utf8", env: { ...process.env, KEYLANG_TRACE: ".keylang/trace/save.jsonl", KEYLANG_TRACE_PLAN: "plan.json", KEYLANG_TRACE_TEST: "shop > @flow save" } });
  assert.equal(exec.status, 0, exec.stderr);
  const o = keylang(dir, ["check"]);
  assert.match(o.stdout, /flows\.md:3:1: trace ok main\.main\.main: observed in shop > @flow save/);
  assert.match(o.stdout, /flows\.md:5:5: trace ok domain\.order\.place/);
  assert.match(o.stdout, /flows\.md:6:7: trace unverified domain\.order\.Order\.new: `domain\.order\.Order\.new` is not instrumented/);
  assert.match(o.stdout, /flows\.md:7:3: trace fail domain\.order\.refund: missing step in shop > @flow save/);
});

const cargoToml = '[package]\nname = "shop"\nversion = "0.1.0"\nedition = "2021"\n';

/** Verdicts of `check --format json` as `<criterion> <verdict> <area>: <reason>` lines. */
function verdicts(dir: string, args: string[] = []): { status: number | null; lines: string[] } {
  const o = keylang(dir, ["check", "--format", "json", ...args]);
  const results = (JSON.parse(o.stdout) as { results: { criterion: string; evidence: string }[] }).results;
  return { status: o.status, lines: results.map((r) => `${r.criterion} ${r.evidence}`) };
}

test("rust: a call keylang cannot name is a hole, so the step is unverified, never a confirmed absence", (t) => {
  const dir = repo(t, {
    "Cargo.toml": cargoToml,
    "keylang.json": JSON.stringify({ languages: ["rust"], layers: { app: ["src/**"] } }),
    "src/db.rs": "pub struct Db;\nimpl Db {\n    pub fn save(&self) {}\n    pub fn flush(&self) {}\n    pub fn add(&self) {}\n}\n\nimpl Drop for Db {\n    fn drop(&mut self) {}\n}\n",
    "src/main.rs":
      "mod db;\nuse crate::db::Db;\n\npub struct Order { db: Db, items: Vec<Db> }\n\nimpl Order {\n    pub fn new() -> Self { Order { db: Db, items: vec![] } }\n    pub fn total(&self) -> u32 { 1 }\n    pub fn run(&self) {\n        self.db.save();\n        self.items[0].flush();\n    }\n    pub fn boxed(self: Box<Self>) {\n        self.run();\n    }\n}\n\nfn helper() {\n    Order::new().total();\n}\n\nfn main() {\n    helper();\n    use_it(later);\n    Box::new(Order::new()).boxed();\n}\n\nfn later() {}\nfn use_it(f: fn()) { f(); }\n",
    "keylang/flows.md":
      "# flow a\n\n- trigger app.main.Order.run\n  - step app.db.Db.save\n  - step app.db.Db.flush\n\n# flow b\n\n- trigger app.main.main\n  - step app.main.helper\n    - step app.main.Order.total\n  - step app.main.later\n\n# flow c\n\n- trigger app.main.Order.boxed\n  - step app.main.Order.run\n",
  });
  const { lines } = verdicts(dir);
  assert.ok(!lines.some((line) => line.startsWith("static fail")), lines.join("\n"));
  assert.ok(lines.includes("static unverified app.db.Db.save: no resolved path from app.main.Order.run; call through a local value `self.db.save` at src/main.rs:10:9 may reach it (and 1 more unresolved call in reachable code)"), lines.join("\n"));
  assert.ok(lines.some((line) => line.startsWith("static unverified app.db.Db.flush: ") && line.includes("`self.items[0].flush`")), lines.join("\n"));
  assert.ok(lines.includes("static unverified app.main.Order.total: no resolved path from app.main.helper; call through a local value `Order::new().total` at src/main.rs:19:5 may reach it"), lines.join("\n"));
  // A fn passed as an argument is a callable the callee may run: `behavior` follows it, `shape` names it.
  assert.ok(lines.includes("static ok app.main.later: called from app.main.main through the callable `later` passed at src/main.rs:24:12"), lines.join("\n"));
  const shape = verdicts(dir, ["--static", "shape"]).lines;
  assert.ok(shape.some((line) => line.startsWith("static unverified app.main.later: no resolved path from app.main.main; the callable `later` passed as an argument (not followed in static mode shape, set by --static) at src/main.rs:24:12 may reach it")), shape.join("\n"));
  // `self: Box<Self>` is a receiver: `self.run()` is the method.
  assert.ok(lines.includes("static ok app.main.Order.run: called from app.main.Order.boxed"), lines.join("\n"));
  // The end of a scope calls `Drop::drop`; an inherent `add` is called only by name.
  assert.equal(keylang(dir, ["map"]).status, 0);
  const index = snapshot(dir);
  assert.equal(index.nodes["app.db.Db.drop"]?.escapes?.reason, "`drop` is called implicitly");
  assert.equal(index.nodes["app.db.Db.add"]?.escapes, undefined);
});

test("python: a call keylang cannot name is a hole; `X()` runs `__init__`, `self.m()` a static method, and a nested class is indexed", (t) => {
  const dir = repo(t, {
    "keylang.json": JSON.stringify({ languages: ["python"], layers: { app: ["app/**"] } }),
    "app/__init__.py": "",
    "app/main.py":
      "class Base:\n    def m(self):\n        pass\n\n\nclass Order(Base):\n    def __init__(self):\n        self.x = 1\n\n    def m(self):\n        super().m()\n\n    def total(self):\n        return 1\n\n    @staticmethod\n    def util():\n        pass\n\n    def run(self):\n        self.util()\n\n    @dataclass\n    class Line:\n        def price(self):\n            pass\n\n\ndef make():\n    return Order()\n\n\ndef later(cb):\n    cb()\n\n\ndef hit():\n    pass\n\n\ndef start():\n    make().total()\n    items = [Order()]\n    items[0].run()\n    (hit)()\n    later(make)\n",
    "keylang/flows.md":
      "# flow a\n\n- trigger app.main.start\n  - step app.main.make\n    - step app.main.Order.__init__\n  - step app.main.Order.total\n  - step app.main.Order.run\n    - step app.main.Order.util\n  - step app.main.hit\n  - step app.main.Order.Line.price\n",
  });
  const { lines } = verdicts(dir);
  assert.ok(lines.includes("static ok app.main.Order.__init__: called from app.main.make"), lines.join("\n"));
  assert.ok(lines.includes("static unverified app.main.Order.total: no resolved path from app.main.start; call through a local value `make().total` at app/main.py:42:5 may reach it (and 2 more unresolved calls in reachable code)"), lines.join("\n"));
  assert.ok(lines.some((line) => line.startsWith("static unverified app.main.Order.run: ") && line.includes("`items[0].run`")), lines.join("\n"));
  assert.ok(lines.includes("static ok app.main.Order.util: called from app.main.Order.run"), lines.join("\n"));
  assert.ok(lines.includes("static ok app.main.hit: called from app.main.start"), lines.join("\n"));
  // The member of a nested class exists: no K001, and nothing calls it.
  assert.ok(lines.includes("ID ok app.main.Order.Line.price: exact"), lines.join("\n"));
  assert.equal(keylang(dir, ["map"]).status, 0);
  const index = snapshot(dir);
  assert.ok(index.coverage.some((c) => c.kind === "dynamic-call" && c.reason === "call through a local value `super().m`"));
  assert.equal(index.nodes["app.main.make"]?.escapes?.reason, "`make` is read as a value");
});

test("python: `x.m()` through a parameter annotated with a class or a local `x = X()` is `X.m`, bases included; other values stay holes", (t) => {
  const dir = repo(t, {
    "keylang.json": JSON.stringify({ languages: ["python"], layers: { app: ["app/**"] } }),
    "app/__init__.py": "",
    "app/repo.py":
      "class Base:\n    def ping(self):\n        pass\n\n\nclass Repo(Base):\n    def __init__(self, conn):\n        self.conn = conn\n\n    def save(self):\n        pass\n\n    def load(self):\n        pass\n\n    def drop(self):\n        pass\n\n\nclass Sender:\n    def send(self):\n        pass\n\n\nNotify = Sender\n",
    "app/api.py":
      "from typing import Annotated, Optional\n\nfrom app.repo import Notify, Repo, Sender\n\n\ndef Depends(x):\n    return x\n\n\ndef annotated(repo: Repo):\n    repo.save()\n    repo.ping()\n\n\ndef injected(repo: Repo = Depends(Repo), sender: Optional[Sender] = None):\n    repo.load()\n    sender.send()\n\n\ndef marked(sender: Annotated[Sender, Depends(Sender)]):\n    sender.send()\n\n\ndef constructed(conn, fallback: Sender | None):\n    repo = Repo(conn)\n    repo.drop()\n    fallback.send()\n\n\ndef reassigned(conn, other):\n    repo = Repo(conn)\n    repo = other\n    repo.save()\n\n\ndef untyped(senders: list[Sender], notify: Notify):\n    senders.send()\n    notify.send()\n",
    "keylang/flows.md":
      "# flow a\n\n- trigger app.api.annotated\n  - step app.repo.Repo.save\n  - step app.repo.Base.ping\n\n# flow b\n\n- trigger app.api.injected\n  - step app.repo.Repo.load\n  - step app.repo.Sender.send\n\n# flow c\n\n- trigger app.api.constructed\n  - step app.repo.Repo.drop\n  - step app.repo.Sender.send\n\n# flow d\n\n- trigger app.api.reassigned\n  - step app.repo.Repo.save\n\n# flow e\n\n- trigger app.api.untyped\n  - step app.repo.Sender.send\n\n# flow f\n\n- trigger app.api.marked\n  - step app.repo.Sender.send\n",
  });
  const { lines } = verdicts(dir);
  for (const line of [
    "static ok app.repo.Repo.save: called from app.api.annotated",
    "static ok app.repo.Base.ping: called from app.api.annotated",
    "static ok app.repo.Repo.load: called from app.api.injected",
    "static ok app.repo.Sender.send: called from app.api.injected",
    "static ok app.repo.Repo.drop: called from app.api.constructed",
    "static ok app.repo.Sender.send: called from app.api.marked",
    "static ok app.repo.Sender.send: called from app.api.constructed",
    // A second assignment: the value may be anything.
    "static unverified app.repo.Repo.save: no resolved path from app.api.reassigned; call through a local value `repo.save` at app/api.py:33:5 may reach it",
    // `list[Sender]` and an alias that is not a class name no class of `x`.
    "static unverified app.repo.Sender.send: no resolved path from app.api.untyped; call through a local value `senders.send` at app/api.py:37:5 may reach it (and 1 more unresolved call in reachable code)",
  ]) assert.ok(lines.includes(line), `${line}\n---\n${lines.join("\n")}`);
});

test("python: `self.m`, `Cls.m`, `obj.m`, `callback=self.m` and `functools.partial(self.m)` passed as arguments and a lambda passed as one are routes `behavior` follows and `shape` names; a stored lambda stays a closure hole", (t) => {
  const dir = repo(t, {
    "keylang.json": JSON.stringify({ languages: ["python"], layers: { app: ["app/**"] } }),
    "app/__init__.py": "",
    "app/lib.py": "def run(f=None, callback=None):\n    pass\n\n\ndef save():\n    pass\n\n\nclass Repo:\n    def load(self):\n        pass\n",
    "app/svc.py": [
      "import functools",
      "",
      "from app.lib import run, save, Repo",
      "",
      "",
      "class Svc:",
      "    def main(self, repo: Repo, items):",
      "        run(self.ref)",
      "        run(Svc.static_one)",
      "        run(repo.load)",
      "        run(functools.partial(self.partial_one, 1))",
      "        run(lambda: self.in_lambda())",
      "        g = lambda: self.stored()",
      "        sorted(items, key=lambda x: self.key(x))",
      "        run(callback=self.kw)",
      "        run(save)",
      "        g()",
      "",
      "    def ref(self):",
      "        pass",
      "",
      "    @staticmethod",
      "    def static_one():",
      "        pass",
      "",
      "    def partial_one(self, x):",
      "        pass",
      "",
      "    def in_lambda(self):",
      "        pass",
      "",
      "    def stored(self):",
      "        pass",
      "",
      "    def key(self, x):",
      "        return x",
      "",
      "    def kw(self):",
      "        pass",
      "",
    ].join("\n"),
    "keylang/flows.md":
      "# flow main\n\n- trigger app.svc.Svc.main\n  - step app.svc.Svc.ref\n  - step app.svc.Svc.static_one\n  - step app.lib.Repo.load\n  - step app.svc.Svc.partial_one\n  - step app.svc.Svc.in_lambda\n  - step app.svc.Svc.stored\n  - step app.svc.Svc.key\n  - step app.svc.Svc.kw\n  - step app.lib.save\n",
  });
  const { lines } = verdicts(dir);
  assert.deepEqual(lines.filter((line) => line.startsWith("static ")), [
    "static ok app.svc.Svc.ref: called from app.svc.Svc.main through the callable `self.ref` passed at app/svc.py:8:13",
    "static ok app.svc.Svc.static_one: called from app.svc.Svc.main through the callable `Svc.static_one` passed at app/svc.py:9:13",
    "static ok app.lib.Repo.load: called from app.svc.Svc.main through the callable `repo.load` passed at app/svc.py:10:13",
    "static ok app.svc.Svc.partial_one: called from app.svc.Svc.main through the callable `self.partial_one` passed at app/svc.py:11:31",
    "static ok app.svc.Svc.in_lambda: called from app.svc.Svc.main through the closure passed at app/svc.py:12:13",
    "static unverified app.svc.Svc.stored: no resolved path from app.svc.Svc.main; reached only through a closure of app.svc.Svc.main: `this.stored` at app/svc.py:13:21 runs only when that function value is called (and 1 more unresolved call in reachable code)",
    "static ok app.svc.Svc.key: called from app.svc.Svc.main through the closure passed at app/svc.py:14:27",
    "static ok app.svc.Svc.kw: called from app.svc.Svc.main through the callable `self.kw` passed at app/svc.py:15:22",
    "static ok app.lib.save: called from app.svc.Svc.main through the callable `save` passed at app/svc.py:16:13",
  ]);
  const shape = verdicts(dir, ["--static", "shape"]).lines;
  assert.ok(shape.includes("static unverified app.svc.Svc.ref: no resolved path from app.svc.Svc.main; the callable `self.ref` passed as an argument (not followed in static mode shape, set by --static) at app/svc.py:8:13 may reach it (and 1 more unresolved call in reachable code)"), shape.join("\n"));
  assert.ok(shape.includes("static unverified app.svc.Svc.key: no resolved path from app.svc.Svc.main; the closure passed at app/svc.py:14:27 (not followed in static mode shape, set by --static) at app/svc.py:14:37 may reach it (and 1 more unresolved call in reachable code)"), shape.join("\n"));
  assert.ok(!shape.some((line) => line.startsWith("static ok")), shape.join("\n"));
});

test("rust: `Self::m` and a fn path passed as arguments and a closure passed as one are routes `behavior` follows and `shape` names; a stored closure stays a closure hole", (t) => {
  const dir = repo(t, {
    "Cargo.toml": cargoToml,
    "keylang.json": JSON.stringify({ languages: ["rust"], layers: { app: ["src/**"] } }),
    "src/main.rs": [
      "pub struct Order;",
      "",
      "impl Order {",
      "    pub fn place(&self, items: Vec<i32>) {",
      "        run(Self::assoc);",
      "        run(free);",
      "        run_boxed(|x| self.in_closure(x));",
      "        let g = |x: i32| self.stored(x);",
      "        let _: Vec<i32> = items.iter().map(|x| self.each(*x)).collect();",
      "        g(1);",
      "    }",
      "    pub fn assoc() {}",
      "    pub fn in_closure(&self, _x: i32) {}",
      "    pub fn stored(&self, _x: i32) {}",
      "    pub fn each(&self, x: i32) -> i32 { x }",
      "}",
      "",
      "pub fn free() {}",
      "pub fn run(f: fn()) { f(); }",
      "pub fn run_boxed(f: impl Fn(i32)) { f(1); }",
      "fn main() {}",
      "",
    ].join("\n"),
    "keylang/flows.md": "# flow place\n\n- trigger app.main.Order.place\n  - step app.main.Order.assoc\n  - step app.main.free\n  - step app.main.Order.in_closure\n  - step app.main.Order.stored\n  - step app.main.Order.each\n",
  });
  const { lines } = verdicts(dir);
  assert.deepEqual(lines.filter((line) => line.startsWith("static ")), [
    "static ok app.main.Order.assoc: called from app.main.Order.place through the callable `Self::assoc` passed at src/main.rs:5:13",
    "static ok app.main.free: called from app.main.Order.place through the callable `free` passed at src/main.rs:6:13",
    "static ok app.main.Order.in_closure: called from app.main.Order.place through the closure passed at src/main.rs:7:19",
    "static unverified app.main.Order.stored: no resolved path from app.main.Order.place; reached only through a closure of app.main.Order.place: `this.stored` at src/main.rs:8:26 runs only when that function value is called (and 6 more unresolved calls in reachable code)",
    "static ok app.main.Order.each: called from app.main.Order.place through the closure passed at src/main.rs:9:44",
  ]);
  const shape = verdicts(dir, ["--static", "shape"]).lines;
  assert.ok(shape.some((line) => line.startsWith("static unverified app.main.Order.assoc: no resolved path from app.main.Order.place; the callable `Self::assoc` passed as an argument (not followed in static mode shape, set by --static) at src/main.rs:5:13 may reach it")), shape.join("\n"));
  assert.ok(shape.some((line) => line.startsWith("static unverified app.main.Order.each: no resolved path from app.main.Order.place; the closure passed at src/main.rs:9:44 (not followed in static mode shape, set by --static) at src/main.rs:9:48 may reach it")), shape.join("\n"));
  assert.ok(!shape.some((line) => line.startsWith("static ok")), shape.join("\n"));
});

test("an import inside a function body is a dependency: `deny` fails on it (Python and Rust)", (t) => {
  const py = repo(t, {
    "keylang.json": JSON.stringify({ languages: ["python"], layers: { app: ["app/**"], infra: ["infra/**"] } }),
    "infra/store.py": "def save():\n    pass\n",
    "app/main.py": "def start():\n    from infra.store import save\n    save()\n",
    "keylang/rules.md": "# rules\n\n- deny app infra\n",
  });
  const p = keylang(py, ["check", "--strict"]);
  assert.equal(p.status, 1, p.stdout);
  assert.match(p.stdout, /app\/main\.py:2:5: K102 divergence: `app\.main` depends on `infra\.store`, which is denied by `deny app infra`/);
  const rs = repo(t, {
    "Cargo.toml": cargoToml,
    "keylang.json": JSON.stringify({ languages: ["rust"], layers: { app: ["src/*.rs"], infra: ["src/infra/**"] } }),
    "src/main.rs": "mod infra;\n\nfn main() {\n    use crate::infra::store;\n    store::save();\n}\n",
    "src/infra/mod.rs": "pub mod store;\n",
    "src/infra/store.rs": "pub fn save() {}\n",
    "keylang/rules.md": "# rules\n\n- deny app infra\n",
  });
  const r = keylang(rs, ["check", "--strict"]);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /src\/main\.rs:4:5: K102 divergence: `app\.main` depends on `infra\.store`/);
});

test("python: a decorator that may replace a fn is a hole of that fn, not of the module's dependencies", (t) => {
  const dir = repo(t, {
    "keylang.json": JSON.stringify({ languages: ["python"], layers: { app: ["app/**"], infra: ["infra/**"] } }),
    "infra/store.py": "def save():\n    pass\n",
    // A decorator keylang knows nothing about (a framework's route decorator is the adapter's: tests/frameworks-python-web.test.ts).
    "app/web.py": 'from tenacity import retry\n\n\n@retry(stop=3)\ndef handler():\n    pass\n\n\nclass Ctx:\n    def __exit__(self, *args):\n        pass\n',
    "keylang/rules.md": "# rules\n\n- deny app infra\n",
  });
  const { status, lines } = verdicts(dir, ["--strict"]);
  assert.equal(status, 0, lines.join("\n"));
  assert.ok(lines.includes("deny app infra convergence: no edge from `app` to `infra` and no dependency hole in the area"), lines.join("\n"));
  assert.equal(keylang(dir, ["map"]).status, 0);
  const index = snapshot(dir);
  assert.ok(index.coverage.some((c) => c.kind === "unsupported" && c.reason === "decorator `retry` may replace `handler`" && c.source === "app.web.handler"), JSON.stringify(index.coverage));
  // A framework holds the decorated fn and calls it; a dunder method runs through syntax.
  assert.equal(index.nodes["app.web.handler"]?.escapes?.reason, "`handler` is read as a value");
  assert.equal(index.nodes["app.web.Ctx.__exit__"]?.escapes?.reason, "`__exit__` is called implicitly");
});

test("rust: an attribute macro that may replace a fn is a hole of that fn, not of the module's dependencies", (t) => {
  const dir = repo(t, {
    "Cargo.toml": cargoToml,
    "keylang.json": JSON.stringify({ languages: ["rust"], layers: { app: ["src/*.rs"], infra: ["src/infra/**"] } }),
    "src/main.rs": 'mod infra;\n\n#[tokio::main]\nasync fn main() {}\n\n#[get("/orders")]\n#[inline]\nasync fn orders() {}\n',
    "src/infra/mod.rs": "pub fn save() {}\n",
    "keylang/rules.md": "# rules\n\n- deny app infra\n",
  });
  const { status, lines } = verdicts(dir, ["--strict"]);
  assert.equal(status, 0, lines.join("\n"));
  assert.equal(keylang(dir, ["map"]).status, 0);
  const index = snapshot(dir);
  const holes = index.coverage.filter((c) => c.kind === "unsupported").map((c) => `${c.reason} (${c.source})`);
  assert.deepEqual(holes, ["attribute `get` may replace `orders` (app.main.orders)"]);
  assert.equal(index.nodes["app.main.orders"]?.escapes?.reason, "`orders` is read as a value");
  assert.equal(index.nodes["app.main.main"]?.escapes, undefined, "`#[tokio::main]` runs the body");
});

test("rust: the library and each binary are separate crate roots; `crate::`, `self::` and paths through a `use` resolve in the right tree", (t) => {
  const dir = repo(t, {
    "Cargo.toml": `${cargoToml}\n[workspace]\nmembers = ["engine"]\n\n[dependencies]\nengine = { path = "engine" }\n`,
    "engine/Cargo.toml": '[package]\nname = "engine"\nversion = "0.1.0"\n\n[lib]\npath = "lib/core.rs"\n',
    "engine/lib/core.rs": "pub mod util;\n\npub fn start() {\n    util::helper();\n}\n",
    "engine/lib/util.rs": "pub fn helper() {}\n",
    "keylang.json": JSON.stringify({ languages: ["rust"], layers: { app: ["src/*.rs", "src/bin/**"], domain: ["src/domain/**"], engine: ["engine/**"] } }),
    "src/lib.rs":
      "pub mod domain;\n\npub fn helper() {}\n\n#[cfg(all(test, unix))]\nmod tests {\n    use super::*;\n}\n\n#[cfg(test)]\n// a comment between the attribute and the item\nfn only_in_tests() {}\n\n#[test]\nfn a_test() {}\n",
    "src/main.rs": "mod cli;\n\nfn helper() {\n    run();\n}\n\nfn run() {}\n\nfn main() {\n    crate::helper();\n    self::run();\n    cli::go();\n    engine::start();\n}\n",
    "src/cli.rs": "pub fn go() {\n    crate::run();\n}\n",
    "src/bin/tool.rs": "fn helper() {}\n\nfn main() {\n    crate::helper();\n    shop::helper();\n}\n",
    "src/domain/mod.rs": "pub mod order;\n",
    "src/domain/order.rs":
      "pub struct Order;\n\nimpl Order {\n    pub fn new() -> Self { Order }\n}\n\npub fn f() {}\n\npub mod inner {\n    pub fn f() {}\n}\n\npub fn via_module() {\n    use crate::domain::order;\n    order::Order::new();\n    crate::domain::order::inner::f();\n}\n",
  });
  assert.equal(keylang(dir, ["map"]).status, 0);
  const index = snapshot(dir);
  const calls = index.edges.filter((e) => e.kind === "call").map((e) => `${e.source} -> ${e.target ?? `(${e.resolution})`}`);
  for (const call of [
    "app.main.main -> app.main.helper",
    "app.main.main -> app.main.run",
    "app.cli.go -> app.main.run",
    "app.tool.main -> app.tool.helper",
    "app.tool.main -> app.lib.helper",
    "app.main.main -> engine.lib.core.start",
    "engine.lib.core.start -> engine.lib.util.helper",
    "domain.order.via_module -> domain.order.Order.new",
  ]) {
    assert.ok(calls.includes(call), `${call}\n${calls.join("\n")}`);
  }
  // `main.rs` is not the library: `crate::helper` there is its own; `inner::f` is not the top-level `f`.
  assert.ok(!calls.includes("app.main.main -> app.lib.helper"), calls.join("\n"));
  assert.ok(!calls.includes("domain.order.via_module -> domain.order.f"), calls.join("\n"));
  assert.ok(index.coverage.some((c) => c.kind === "dynamic-call" && c.reason === "call through a local value `crate::domain::order::inner::f`"), JSON.stringify(index.coverage));
  for (const id of ["app.lib.only_in_tests", "app.lib.a_test"]) assert.equal(index.nodes[id], undefined, id);
  assert.ok(!index.coverage.some((c) => c.reason.includes("`tests`")), "`#[cfg(all(test, …))]` is test code");
});

/** Map files of `dir` with code line numbers removed: added comments move lines, nothing else. */
function mapWithoutLines(dir: string, name: string): string {
  return readFileSync(join(dir, "keylang/map", name), "utf8").replace(/#L\d+/g, "");
}

function docs(dir: string): Record<string, string | null> {
  const nodes = (JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as { nodes: Record<string, { doc: string | null }> }).nodes;
  return Object.fromEntries(Object.entries(nodes).filter(([id]) => !id.startsWith("external")).map(([id, n]) => [id, n.doc]));
}

test("rust: `///`, `/** */`, `//!` and `/*! */` document items and modules; `#[doc = …]` gives none; the map does not change", (t) => {
  const dir = copy(t, "rust-shop");
  assert.equal(keylang(dir, ["init"]).status, 0);
  const before = mapWithoutLines(dir, "domain.md");
  writeFileSync(join(dir, "src/domain/mod.rs"), "/*! The shop's domain: orders and their totals. */\npub mod order;\n");
  const order = readFileSync(join(dir, "src/domain/order.rs"), "utf8")
    .replace("use crate", "//! Orders and how they are placed.\nuse crate")
    .replace("pub struct Order", "/// An order with its total.\n///\n/// Later paragraphs stay out of the brief.\n#[derive(Debug)]\npub struct Order")
    .replace("    pub fn new()", "    /// Creates an empty order.\n    pub fn new()")
    .replace("    pub fn total(", "    /** The total in cents. */\n    pub fn total(")
    .replace("pub fn place()", "// A note, not documentation.\npub fn place()")
    .replace("fn helper()", "#[doc = \"Written as an attribute.\"]\nfn helper()");
  writeFileSync(join(dir, "src/domain/order.rs"), order);
  assert.equal(keylang(dir, ["map"]).status, 0);
  const d = docs(dir);
  assert.equal(d["domain.mod"], "The shop's domain: orders and their totals.");
  assert.equal(d["domain.order"], "Orders and how they are placed.");
  assert.equal(d["domain.order.Order"], "An order with its total.");
  assert.equal(d["domain.order.Order.new"], "Creates an empty order.");
  assert.equal(d["domain.order.Order.total"], "The total in cents.");
  assert.equal(d["domain.order.place"], null);
  assert.equal(d["domain.order.helper"], null);
  assert.equal(mapWithoutLines(dir, "domain.md"), before);
});

test("python: docstrings of a package, module, class and def are `doc`; an f-string is none; the map does not change", (t) => {
  const dir = copy(t, "py-shop");
  assert.equal(keylang(dir, ["init"]).status, 0);
  const before = mapWithoutLines(dir, "domain.md");
  writeFileSync(join(dir, "shop/domain/__init__.py"), `"""The shop's domain."""\n`);
  const order = readFileSync(join(dir, "shop/domain/order.py"), "utf8")
    .replace("from ..infra", '"""Orders and how they are placed.\n\nMore about orders.\n"""\nfrom ..infra')
    .replace("class Order:\n", 'class Order:\n    r"""An order with an amount.\n\n    Details stay out.\n    """\n\n')
    .replace("    def total(self):\n", '    def total(self):\n        """The amount. Same as `self.amount`."""\n')
    .replace("    def paid(self):\n", '    def paid(self):\n        f"""Paid {self.amount}."""\n')
    .replace("def place():\n", 'def place():\n    # A comment is not a docstring.\n    """Places an order and stores it."""\n')
    .replace("def _helper():\n", "def _helper():\n    'One line, single quotes.'\n");
  writeFileSync(join(dir, "shop/domain/order.py"), order);
  assert.equal(keylang(dir, ["map"]).status, 0);
  const d = docs(dir);
  assert.equal(d["domain.__init__"], "The shop's domain.");
  assert.equal(d["domain.order"], "Orders and how they are placed.");
  assert.equal(d["domain.order.Order"], "An order with an amount.");
  assert.equal(d["domain.order.Order.total"], "The amount. Same as `self.amount`.");
  assert.equal(d["domain.order.Order.paid"], null);
  assert.equal(d["domain.order.place"], "Places an order and stores it.");
  assert.equal(d["domain.order._helper"], "One line, single quotes.");
  assert.equal(d["main.main.main"], null);
  assert.equal(mapWithoutLines(dir, "domain.md"), before);
});

test("rust and python: a re-exported name has form `reexport`, its symbol and its source module", (t) => {
  const dir = repo(t, {
    "Cargo.toml": cargoToml,
    "keylang.json": JSON.stringify({ languages: ["rust", "python"], layers: { app: ["src/*.rs"], domain: ["src/domain/**"], py: ["shop/**"] } }),
    "src/lib.rs": "pub mod domain;\n\npub use crate::domain::order::place as run;\n",
    "src/domain/mod.rs": "pub mod order;\n",
    "src/domain/order.rs": "pub fn place() {}\n",
    "shop/__init__.py": "",
    "shop/domain/__init__.py": "from .order import place\nfrom . import _private\n",
    "shop/domain/order.py": "def place():\n    pass\n\n\ndef other():\n    pass\n",
    "shop/domain/_private.py": "",
    "shop/app.py": "import shop.domain.order\nfrom shop.domain import place\n\n\ndef run():\n    place()\n    shop.domain.order.other()\n",
  });
  assert.equal(keylang(dir, ["map"]).status, 0);
  const index = snapshot(dir);
  assert.deepEqual(index.exports.find((e) => e.module === "app.lib" && e.name === "run"), { module: "app.lib", name: "run", symbol: "domain.order.place", kind: "fn", form: "reexport", from: "domain.order" });
  assert.deepEqual(index.exports.find((e) => e.module === "py.domain" && e.name === "place"), { module: "py.domain", name: "place", symbol: "py.domain.order.place", kind: "fn", form: "reexport", from: "py.domain.order" });
  assert.ok(!index.exports.some((e) => e.module === "py.domain" && e.name === "_private"), "a private name is not re-exported");
  const calls = index.edges.filter((e) => e.kind === "call" && e.source === "py.app.run").map((e) => `${e.target} ${e.text}`);
  assert.deepEqual(calls.sort(), ["py.domain.order.other shop.domain.order.other", "py.domain.order.place place"]);
});

test("python: the trace adapter records a function by file, name and first line; generators and coroutines are not instrumented; `sys.exit(3)` is incomplete", { skip: python3 ? false : "python3 is not installed" }, (t) => {
  const dir = repo(t, {
    "keylang.json": JSON.stringify({ languages: ["python"], layers: { app: ["app/**"] }, exclude: ["run.py"], check: { trace: ".keylang/trace/*.jsonl" } }),
    "app/__init__.py": "",
    "app/main.py": "class A:\n    def save(self):\n        pass\n\n\nclass B:\n    def save(self):\n        pass\n\n\ndef gen():\n    yield 1\n\n\nasync def fetch():\n    pass\n\n\ndef start():\n    A().save()\n    gen()\n\n\ndef stop():\n    import sys\n    sys.exit(3)\n",
    "run.py": "import sys\nfrom app.main import start, stop\n\nstart()\nif len(sys.argv) > 1:\n    stop()\n",
    "keylang/flows.md": "# flow a\n\n- trigger app.main.start\n  - step app.main.B.save\n  - step app.main.gen\n  - step app.main.fetch\n",
  });
  const plan = keylang(dir, ["trace-plan", "a"]);
  assert.equal(plan.status, 0, plan.stderr);
  writeFileSync(join(dir, "plan.json"), plan.stdout);
  const trace = (...args: string[]): number | null =>
    spawnSync("python3", [join(root, "adapters/python/keylang_trace.py"), "run.py", ...args], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, KEYLANG_TRACE: ".keylang/trace/a.jsonl", KEYLANG_TRACE_PLAN: "plan.json", KEYLANG_TRACE_TEST: "run.py > @flow a" },
    }).status;
  assert.equal(trace(), 0);
  const o = keylang(dir, ["check"]);
  // `A.save` ran; its code is not the planned `B.save` declared further down.
  assert.match(o.stdout, /flows\.md:4:3: trace fail app\.main\.B\.save: missing step in run\.py > @flow a/);
  // A generator that was never iterated and a coroutine that was never awaited are not observable.
  assert.match(o.stdout, /flows\.md:5:3: trace unverified app\.main\.gen: `app\.main\.gen` is not instrumented/);
  assert.match(o.stdout, /flows\.md:6:3: trace unverified app\.main\.fetch: `app\.main\.fetch` is not instrumented/);
  rmSync(join(dir, ".keylang/trace"), { recursive: true, force: true });
  assert.equal(trace("exit"), 3);
  const run = readFileSync(join(dir, ".keylang/trace/a.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line) as { event: string; complete?: boolean }).find((e) => e.event === "run");
  assert.equal(run?.complete, false);
});

const asyncShop = (adapter: string): string => `#[path = ${JSON.stringify(adapter)}]
mod keylang_trace;

use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll, RawWaker, RawWakerVTable, Waker};

/// Pending once, then ready: a suspension point.
struct Yield(bool);
impl Future for Yield {
    type Output = ();
    fn poll(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<()> {
        if self.0 { Poll::Ready(()) } else { self.0 = true; cx.waker().wake_by_ref(); Poll::Pending }
    }
}

async fn slow() {
    // A guard kept across \`.await\` would adopt \`quick\`, polled meanwhile.
    let _span = keylang_trace::span("app.main.slow");
    Yield(false).await;
}

async fn quick() {
    keylang_trace::instrument("app.main.quick", async {
        nested();
    })
    .await
}

fn nested() {
    // keylang_trace::span("app.main.nested");
}

fn waker() -> Waker {
    fn clone(_: *const ()) -> RawWaker { RawWaker::new(std::ptr::null(), &VTABLE) }
    fn noop(_: *const ()) {}
    static VTABLE: RawWakerVTable = RawWakerVTable::new(clone, noop, noop, noop);
    unsafe { Waker::from_raw(RawWaker::new(std::ptr::null(), &VTABLE)) }
}

/// Poll two futures in turn on this thread until both are done.
fn join(a: impl Future<Output = ()>, b: impl Future<Output = ()>) {
    let waker = waker();
    let mut cx = Context::from_waker(&waker);
    let (mut a, mut b) = (Box::pin(a), Box::pin(b));
    let (mut done_a, mut done_b) = (false, false);
    while !(done_a && done_b) {
        if !done_a { done_a = a.as_mut().poll(&mut cx).is_ready(); }
        if !done_b { done_b = b.as_mut().poll(&mut cx).is_ready(); }
    }
}

fn run() {
    let _span = keylang_trace::span("app.main.run");
    join(slow(), quick());
}

fn main() {
    run();
    keylang_trace::finish();
}
`;

test("rust: a span in async code comes from `instrument`, not a guard; a span in a comment does not instrument", { skip: rustc ? false : "rustc is not installed" }, (t) => {
  const dir = repo(t, {
    "Cargo.toml": cargoToml,
    "keylang.json": JSON.stringify({ languages: ["rust"], layers: { app: ["src/*.rs"] }, check: { trace: ".keylang/trace/*.jsonl" } }),
    "src/main.rs": asyncShop(join(root, "adapters/rust/keylang_trace.rs")),
    "keylang/flows.md": "# flow a\n\n- trigger app.main.run\n  - step app.main.slow\n    - step app.main.quick\n  - step app.main.quick\n    - step app.main.nested\n",
  });
  const plan = keylang(dir, ["trace-plan", "a"]);
  assert.equal(plan.status, 0, plan.stderr);
  writeFileSync(join(dir, "plan.json"), plan.stdout);
  const build = spawnSync("rustc", ["--edition", "2021", "-A", "warnings", "-o", join(dir, "shop"), "src/main.rs"], { cwd: dir, encoding: "utf8" });
  assert.equal(build.status, 0, build.stderr);
  const exec = spawnSync(join(dir, "shop"), [], { cwd: dir, encoding: "utf8", env: { ...process.env, KEYLANG_TRACE: ".keylang/trace/a.jsonl", KEYLANG_TRACE_PLAN: "plan.json", KEYLANG_TRACE_TEST: "shop > @flow a" } });
  assert.equal(exec.status, 0, exec.stderr);
  const events = readFileSync(join(dir, ".keylang/trace/a.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line) as { event: string; spanId?: string; parentSpanId?: string | null; symbolId?: string; instrumented?: string[] });
  const start = (id: string): { spanId?: string; parentSpanId?: string | null } | undefined => events.find((e) => e.event === "start" && e.symbolId === id);
  assert.equal(start("app.main.slow"), undefined, "a guard in async code is not recorded");
  assert.equal(start("app.main.quick")?.parentSpanId, start("app.main.run")?.spanId, "an instrumented future nests where it was created");
  assert.deepEqual(events.find((e) => e.event === "run")?.instrumented, ["app.main.quick", "app.main.run"]);
  const o = keylang(dir, ["check"]);
  assert.match(o.stdout, /flows\.md:4:3: trace unverified app\.main\.slow: `app\.main\.slow` is not instrumented/);
  assert.match(o.stdout, /flows\.md:5:5: trace unverified app\.main\.quick: parent step `app\.main\.slow` not observed/);
  assert.match(o.stdout, /flows\.md:6:3: trace ok app\.main\.quick: observed in shop > @flow a/);
  assert.match(o.stdout, /flows\.md:7:5: trace unverified app\.main\.nested: `app\.main\.nested` is not instrumented/);
});

test("python: init on a single package in the repository root makes a layer of each subpackage, so the baseline denies between them", (t) => {
  const pkg = (dir: string): Record<string, string> => ({ [`app/${dir}/__init__.py`]: "", [`app/${dir}/mod.py`]: "x = 1\n" });
  const dir = repo(t, { "pyproject.toml": "[project]\n", "app/__init__.py": "", "app/main.py": "from app.api import mod\n", ...pkg("api"), ...pkg("services"), ...pkg("db"), ...pkg("core") });
  const o = keylang(dir, ["init", "--agents=none"]);
  assert.equal(o.status, 0, o.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "keylang.json"), "utf8")).layers, {
    api: ["app/api/**"],
    core: ["app/core/**"],
    db: ["app/db/**"],
    services: ["app/services/**"],
    main: ["app/*"],
  });
  const baseline = readFileSync(join(dir, "keylang/rules.baseline.md"), "utf8");
  assert.match(baseline, /^- deny api core, db, external, main, services, unassigned$/m);
  assert.match(baseline, /^- deny main core, db, external, services, unassigned$/m, "`main` imports `api`, so the baseline keeps that edge");
  assert.equal(keylang(dir, ["check"]).status, 0);
});

test("init: two directories in the repository root, a package without subpackages and a `src/` repository keep their guessed layers", (t) => {
  const two = repo(t, { "app/__init__.py": "", "app/api/__init__.py": "", "app/api/mod.py": "x = 1\n", "tools/run.py": "y = 2\n" });
  assert.equal(keylang(two, ["init", "--agents=none"]).status, 0);
  assert.deepEqual(JSON.parse(readFileSync(join(two, "keylang.json"), "utf8")).layers, { app: ["app/**"], tools: ["tools/**"] });
  const flat = repo(t, { "app/__init__.py": "", "app/main.py": "x = 1\n" });
  assert.equal(keylang(flat, ["init", "--agents=none"]).status, 0);
  assert.deepEqual(JSON.parse(readFileSync(join(flat, "keylang.json"), "utf8")).layers, { app: ["app/**"] });
  const ts = repo(t, { "src/app/main.ts": "export const x = 1;\n", "src/domain/order.ts": "export const y = 2;\n", "src/index.ts": "export {};\n" });
  assert.equal(keylang(ts, ["init", "--agents=none"]).status, 0);
  assert.deepEqual(JSON.parse(readFileSync(join(ts, "keylang.json"), "utf8")).layers, { app: ["src/app/**"], domain: ["src/domain/**"], main: ["src/*"] });
});

test("python: the standard library is no `external.*` node, edge or K102; another package is, and a repository module of a stdlib name resolves to the repository", (t) => {
  const mail = "import asyncio\nimport typing\nfrom email.message import EmailMessage\nimport aiosmtplib\nfrom .logging import setup\n\n\ndef send():\n    asyncio.run(None)\n    aiosmtplib.send(EmailMessage())\n    setup()\n";
  const dir = repo(t, { "app/__init__.py": "", "app/mail.py": mail, "app/logging.py": "def setup():\n    pass\n" });
  assert.equal(keylang(dir, ["init", "--agents=none"]).status, 0);
  const index = snapshot(dir);
  const externals = Object.keys(index.nodes).filter((id) => id.startsWith("external."));
  assert.deepEqual(externals, ["external.aiosmtplib"]);
  assert.ok(index.edges.some((e) => e.kind === "import" && e.source === "app.mail" && e.target === "app.logging"), "`from .logging import setup` is the repository's `app/logging.py`");
  assert.ok(index.edges.some((e) => e.kind === "call" && e.source === "app.mail.send" && e.target === "app.logging.setup"));
  assert.deepEqual(index.coverage.filter((c) => c.file === "app/mail.py"), [], "a call into the standard library is external, not a hole");
  assert.doesNotMatch(readFileSync(join(dir, "keylang/map/external.md"), "utf8"), /asyncio|email|typing/);
  const baseline = readFileSync(join(dir, "keylang/rules.baseline.md"), "utf8");
  assert.match(baseline, /^- allow app external\.aiosmtplib$/m);
  assert.doesNotMatch(baseline, /asyncio|email|typing/);
  // A new standard-library import under `deny app external` is no divergence; a new package is.
  writeFileSync(join(dir, "app/mail.py"), `import json\nimport smtplib\n${mail}`);
  const clean = keylang(dir, ["check"]);
  assert.equal(clean.status, 0, clean.stdout);
  writeFileSync(join(dir, "app/mail.py"), `import httpx\n${mail}`);
  const o = keylang(dir, ["check"]);
  assert.equal(o.status, 1, o.stdout);
  assert.match(o.stdout, /K102 divergence: `app\.mail` depends on `external\.httpx`/);
  assert.doesNotMatch(o.stdout, /external\.(asyncio|email|typing|json|smtplib)/);
});

test("rust and python: `use crate::models::User` / `from app.models import User` through a `mod.rs` / `__init__.py` re-export is a dependency `deny` fails on, whatever the file system (the resolver never names a file by another spelling)", (t) => {
  // `models/User.rs` does not exist; on APFS and NTFS `existsSync` says it does through `user.rs`. The exact
  // check (tests/exact-path.test.ts) keeps the longest-prefix walk at `models/mod.rs`, so this is the verdict everywhere.
  const rust = repo(t, {
    "Cargo.toml": '[package]\nname = "shop"\nversion = "0.1.0"\n',
    "src/lib.rs": "pub mod api;\npub mod models;\n",
    "src/models/mod.rs": "mod user;\npub use user::User;\n",
    "src/models/user.rs": "pub struct User;\n\nimpl User {\n    pub fn new() -> Self {\n        User\n    }\n}\n",
    "src/api/mod.rs": "use crate::models::User;\n\npub fn handle() -> User {\n    User::new()\n}\n",
    "keylang.json": JSON.stringify({ languages: ["rust"], layers: { api: ["src/api/**"], domain: ["src/models/**"] } }),
    "keylang/rules.md": "# rules\n\n- deny api domain\n",
  });
  assert.equal(keylang(rust, ["map"]).status, 0);
  const r = keylang(rust, ["check"]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /src\/api\/mod\.rs:1:1: K102 divergence: `api\.mod` depends on `domain\.mod`/);
  assert.match(r.stderr, /2 fail, 0 unverified/);
  assert.doesNotMatch(r.stdout, /is not indexed/);
  const rustIndex = snapshot(rust);
  assert.ok(rustIndex.edges.some((e) => e.kind === "call" && e.source === "api.mod.handle" && e.target === "domain.user.User.new"), "`User::new()` through the re-export");

  const py = repo(t, {
    "app/__init__.py": "",
    "app/models/__init__.py": "from .user import User\n",
    "app/models/user.py": "class User:\n    def __init__(self):\n        pass\n",
    "app/api/__init__.py": "",
    "app/api/views.py": "from app.models import User\n\n\ndef handle():\n    return User()\n",
    "keylang.json": JSON.stringify({ languages: ["python"], layers: { api: ["app/api/**"], domain: ["app/models/**"] } }),
    "keylang/rules.md": "# rules\n\n- deny api domain\n",
  });
  assert.equal(keylang(py, ["map"]).status, 0);
  const p = keylang(py, ["check"]);
  assert.equal(p.status, 1, p.stdout + p.stderr);
  assert.match(p.stdout, /app\/api\/views\.py:1:1: K102 divergence: `api\.views` depends on `domain\.__init__`/);
  assert.match(p.stderr, /2 fail, 0 unverified/);
  assert.doesNotMatch(p.stdout, /is not indexed/);
  const pyIndex = snapshot(py);
  assert.ok(pyIndex.edges.some((e) => e.kind === "call" && e.source === "api.views.handle" && e.target === "domain.user.User"), "`User()` through the re-export");
});

test("python: `from m import *` of a module without `__all__` brings the names m imports: a call through one is an edge, not a hole or a package's call; a module that binds names keylang does not list makes such a call a hole even beside a stdlib glob", (t) => {
  const dir = repo(t, {
    "keylang.json": JSON.stringify({ languages: ["python"], layers: { app: ["app/**"] } }),
    "keylang/flows.md": "# flow run\n\n- trigger app.main.run\n  - step app.util.helper\n",
    "app/__init__.py": "",
    "app/util.py": "def helper():\n    return 1\n",
    "app/base.py": "from .util import helper\n\n\ndef own():\n    return 2\n",
    "app/main.py": "from math import *\nfrom .base import *\n\n\ndef run():\n    return helper() + own() + sqrt(4)\n",
  });
  const map = keylang(dir, ["map"]);
  assert.equal(map.status, 0, map.stderr);
  assert.match(map.stderr, /calls 2 resolved, 1 external, 0 dynamic/, "`sqrt` is math's; `helper` and `own` are the repository's");
  const index = snapshot(dir);
  assert.ok(index.edges.some((e) => e.kind === "call" && e.source === "app.main.run" && e.target === "app.util.helper"), "`helper()` through the glob of a module that imports it");
  assert.ok(!index.edges.some((e) => e.kind === "reexport"), "a plain module re-exports nothing: the dependency is an import");
  assert.deepEqual(index.exports.filter((e) => e.module === "app.base"), [
    { module: "app.base", name: "helper", symbol: "app.util.helper", kind: "fn", from: "app.util" },
    { module: "app.base", name: "own", symbol: "app.base.own", kind: "fn" },
  ]);
  const flow = keylang(dir, ["check"]);
  assert.equal(flow.status, 0, flow.stdout + flow.stderr);
  assert.match(flow.stdout, /static ok app\.util\.helper: called from app\.main\.run/);
  // Without the stdlib glob the verdict is the same (before: a hole «call through a local value helper»).
  writeFileSync(join(dir, "app/main.py"), "from .base import *\n\n\ndef run():\n    return helper() + own()\n");
  assert.match(keylang(dir, ["map"]).stderr, /calls 2 resolved, 0 external, 0 dynamic/);
  assert.match(keylang(dir, ["check"]).stdout, /static ok app\.util\.helper/);
  // `exports` sees the imported name as a public one, and says where it is from.
  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- module app.base\n  - exports own\n");
  const rule = keylang(dir, ["check"]);
  assert.equal(rule.status, 1, rule.stdout);
  assert.match(rule.stdout, /K104 divergence: `app\.base` exports `helper` \(fn, imported from `app\.util`\), which is not listed in `exports`/);
  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- module app.base\n  - exports own, helper\n");
  assert.doesNotMatch(keylang(dir, ["check"]).stdout, /K104/);
  // A module-level `for` binds names the table does not list: a name no table has is a hole, not math's —
  // `sqrt` included, as beside an unresolved glob: either source may bind it.
  writeFileSync(join(dir, "app/base.py"), "from .util import helper\n\nfor flag in (1,):\n    pass\n\n\ndef own():\n    return 2\n");
  writeFileSync(join(dir, "app/main.py"), "from math import *\nfrom .base import *\n\n\ndef run():\n    return helper() + mystery() + sqrt(4)\n");
  assert.match(keylang(dir, ["map"]).stderr, /calls 1 resolved, 0 external, 2 dynamic/);
  const open = snapshot(dir);
  assert.ok(open.coverage.some((c) => c.kind === "dynamic-call" && c.text === "mystery" && c.reason === "call through `mystery`, a name from a glob import keylang does not follow"), JSON.stringify(open.coverage));
  assert.equal(open.exports.find((e) => e.module === "app.base" && e.name === "*")?.reason, "a module-level `for` binds names keylang does not list");
  const unverified = keylang(dir, ["check"]);
  assert.equal(unverified.status, 0, unverified.stdout);
  assert.match(unverified.stdout, /unverified a module-level `for` binds names keylang does not list/);
  assert.doesNotMatch(unverified.stdout, /K104/);
});

test("python: a root directory without Python code does not hide a pip package or a package under src/; a namespace package's head is no hole", (t) => {
  const config = JSON.stringify({ languages: ["python"], layers: { app: "app/**", other: "other/**", cfg: "src/config/**" } });
  // (b) `redis/` holds only a Dockerfile: `import redis` is the pip package.
  const pip = repo(t, {
    "keylang.json": config,
    "keylang/rules.md": "# rules\n\n- deny app external.redis\n",
    "redis/Dockerfile": "FROM redis\n",
    "redis/redis.conf": "port 6379\n",
    "app/cache.py": "import redis\n\n\ndef client():\n    return redis.Redis()\n",
  });
  assert.match(keylang(pip, ["check"]).stdout, /K102 divergence: `app\.cache` depends on `external\.redis`, which is denied by `deny app external\.redis`/);
  // (c) A root `config/` with settings.yaml does not hide `src/config/`.
  const src = repo(t, {
    "keylang.json": config,
    "keylang/rules.md": "# rules\n\n- deny app cfg\n",
    "config/settings.yaml": "a: 1\n",
    "src/config/__init__.py": "",
    "src/config/settings.py": "DEBUG = True\n",
    "app/main.py": "from config import settings\n\n\ndef debug():\n    return settings.DEBUG\n",
  });
  assert.match(keylang(src, ["check"]).stdout, /K102 divergence: `app\.main` depends on `cfg/);
  // (a) PEP 420: `nsp/` has no `__init__.py`, yet `import nsp.inner.mod` works.
  const ns = repo(t, {
    "keylang.json": JSON.stringify({ languages: ["python"], layers: { app: "app/**", other: "other/**", nsp: "nsp/**" } }),
    "keylang/rules.md": "# rules\n\n- deny app other\n",
    "nsp/inner/mod.py": "def f():\n    return 1\n",
    "other/x.py": "def g():\n    return 2\n",
    "app/cache.py": "import nsp.inner.mod\n\n\ndef run():\n    return nsp.inner.mod.f()\n",
  });
  const checked = keylang(ns, ["check"]);
  assert.match(checked.stdout + checked.stderr, /0 fail, 0 unverified, 1 ok/, checked.stdout);
  assert.equal(keylang(ns, ["map"]).status, 0);
  assert.ok(!snapshot(ns).coverage.some((c) => c.kind === "unresolved-import"), JSON.stringify(snapshot(ns).coverage));
  assert.ok(snapshot(ns).edges.some((e) => e.kind === "import" && e.source === "app.cache" && e.target === "nsp.inner.mod"));
});

test("rust: a fn declared inside a fn, or a parameter of one, shadows the module item of that name", (t) => {
  const dir = repo(t, {
    "Cargo.toml": '[package]\nname = "app"\nversion = "0.1.0"\n',
    "keylang.json": JSON.stringify({ languages: ["rust"], layers: { app: ["src/**"] } }),
    "keylang/flows/f.md": "# flow f\n\n- trigger app.main.run\n  - step app.main.helper\n",
    "src/main.rs": [
      "fn helper() {}",
      "",
      "pub fn run() {",
      "    fn helper() {}",
      "    helper();",
      "}",
      "",
      "pub fn run_param() {",
      "    fn inner(helper: fn()) {",
      "        helper();",
      "    }",
      "    inner(other);",
      "}",
      "",
      "fn other() {}",
      "",
      "fn main() {",
      "    run();",
      "    run_param();",
      "    helper();",
      "}",
      "",
    ].join("\n"),
  });
  assert.equal(keylang(dir, ["map"]).status, 0);
  const toHelper = snapshot(dir).edges.filter((e) => e.kind === "call" && e.target === "app.main.helper").map((e) => e.source);
  assert.deepEqual(toHelper, ["app.main.main"]);
  assert.match(keylang(dir, ["check"]).stdout, /static unverified app\.main\.helper: .*shadowed by local `helper`/);
});

test("python: two `from .x import *` in `__init__.py` with one name export the last one, as Python binds it", (t) => {
  const files = {
    "keylang.json": JSON.stringify({ languages: ["python"], layers: { app: "shop/app/**" } }),
    "shop/app/a.py": "def V():\n    return 1\n\n\ndef f():\n    return 0\n",
    "shop/app/b.py": "def V():\n    return 2\n\n\ndef g():\n    return 0\n",
    "shop/app/__init__.py": "from .a import *\nfrom .b import *\n",
  };
  const all = repo(t, { ...files, "keylang/rules.md": "# rules\n\n- module app.__init__\n  - exports V, f, g\n" });
  const ok = keylang(all, ["check"]);
  assert.equal(ok.status, 0, ok.stdout);
  assert.match(ok.stdout + ok.stderr, /0 fail, 0 unverified, 1 ok/);
  const without = repo(t, { ...files, "keylang/rules.md": "# rules\n\n- module app.__init__\n  - exports f, g\n" });
  assert.match(keylang(without, ["check"]).stdout, /K104 divergence: `app\.__init__` exports `V` \(fn, re-exported from `app\.b`\)/);
});
