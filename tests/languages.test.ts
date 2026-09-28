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

interface Snapshot {
  nodes: Record<string, { kind: string }>;
  edges: { kind: string; source: string; target: string | null; resolution: string; text: string }[];
  coverage: { kind: string; file: string; line: number; reason: string }[];
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
  assert.ok(edge("import", "infra.store", "external.json"), "a name outside the repository is a package");
  assert.ok(!index.edges.some((e) => e.target === "domain.__init__"), "`from shop.domain import order` binds the module `order`, not the package");
  assert.ok(edge("call", "infra.store.save", "domain.order.place"), "`order.place()` through the module binding");
  assert.ok(edge("call", "domain.order.Order.paid", "domain.order.Order.total"), "`self.total()`");
  assert.ok(edge("call", "app.main.main", "infra.store.save"));
  // A method through a variable of unknown type, a dynamic import and a replacing decorator are holes, not edges.
  assert.ok(index.coverage.some((c) => c.kind === "dynamic-call" && c.reason.includes("order.total")));
  assert.ok(index.coverage.some((c) => c.kind === "dynamic-call" && c.reason.includes("this.queue.put")), "a method of an attribute of `self`");
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
  // The step static analysis cannot prove (a method through a value) is observed at run time.
  assert.match(o.stdout, /flows\.md:6:7: static unverified domain\.order\.Order\.total/);
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
