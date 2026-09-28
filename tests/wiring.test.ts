// End-to-end tests of `# wiring` and `keylang wire` (ADR 0003) on a copy of
// `tests/fixtures/wiring-shop`: diagnostics, the generated file, `tsc` on it,
// and the lifecycle when it runs.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");
const tsc = join(root, "node_modules/typescript/bin/tsc");

function run(cwd: string, file: string, args: string[], env: Record<string, string> = {}): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [file, ...args], { cwd, encoding: "utf8", env: { ...process.env, ...env } });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

const keylang = (cwd: string, args: string[]) => run(cwd, bin, args);

function copy(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-wiring-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(join(root, "tests/fixtures/wiring-shop"), dir, { recursive: true });
  return dir;
}

const RUNNER = `import { wire } from "./keylang.gen.ts";
import { log } from "./src/infra/db.ts";
try {
  const app = await wire({ DB: process.env.DB });
  log.push(app["app.purchase.createPurchase"].buy());
  await app.dispose();
} catch (error) {
  log.push(\`error: \${(error as Error).message}\`);
}
console.log(log.join(" → "));
`;

test("wire: generates a typed wire() that tsc accepts; each factory is built once, dependencies first, disposed newest first", (t) => {
  const dir = copy(t);
  const o = keylang(dir, ["wire"]);
  assert.equal(o.status, 0, o.stdout + o.stderr);
  assert.equal(o.stdout, "keylang.gen.ts: written\n");
  const text = readFileSync(join(dir, "keylang.gen.ts"), "utf8");
  assert.match(text, /^\/\/ keylang:generated/);
  const types = run(dir, tsc, ["-p", "."]);
  assert.equal(types.status, 0, types.stdout);
  writeFileSync(join(dir, "run.ts"), RUNNER);
  assert.equal(run(dir, "run.ts", [], { DB: "pg" }).stdout.trim(), "init db → init store → query insert → pg(insert) → dispose db");
  // `when env.DB = memory` builds only the chosen implementation; `compose` still wraps it.
  assert.equal(run(dir, "run.ts", [], { DB: "memory" }).stdout.trim(), "init memory db → init store → query insert → mem(insert) → dispose memory db");
  // The same specs and code give the same bytes; `--check` then passes and writes nothing.
  assert.equal(keylang(dir, ["wire"]).stdout, "");
  assert.equal(readFileSync(join(dir, "keylang.gen.ts"), "utf8"), text);
  assert.equal(keylang(dir, ["wire", "--check"]).status, 0);
});

test("wire: a failing factory disposes what was built and rethrows", (t) => {
  const dir = copy(t);
  writeFileSync(
    join(dir, "src/app/purchase.ts"),
    'import type { Store } from "../domain/store.ts";\n\nexport function createPurchase({ store }: { store: Store }): { buy(): string } {\n  throw new Error(`no payments for ${typeof store}`);\n}\n',
  );
  assert.equal(keylang(dir, ["wire"]).status, 0);
  writeFileSync(join(dir, "run.ts"), RUNNER);
  assert.equal(run(dir, "run.ts", [], { DB: "pg" }).stdout.trim(), "init db → init store → dispose db → error: no payments for object");
});

test("wire: a factory whose parameter does not accept the wired dependency fails tsc", (t) => {
  const dir = copy(t);
  writeFileSync(join(dir, "src/app/purchase.ts"), "export function createPurchase({ store }: { store: number }): { buy(): string } {\n  return { buy: () => String(store) };\n}\n");
  assert.equal(keylang(dir, ["wire"]).status, 0);
  const types = run(dir, tsc, ["-p", "."]);
  assert.equal(types.status, 2);
  assert.match(types.stdout, /keylang\.gen\.ts.*TS2322/);
});

test("wire --check: a stale file is exit 1 and is not rewritten; a manual file is never overwritten", (t) => {
  const dir = copy(t);
  assert.equal(keylang(dir, ["wire"]).status, 0);
  writeFileSync(join(dir, "keylang/wiring.md"), readFileSync(join(dir, "keylang/wiring.md"), "utf8").replace("    - compose infra.logged.logged\n", ""));
  const before = readFileSync(join(dir, "keylang.gen.ts"), "utf8");
  const o = keylang(dir, ["wire", "--check"]);
  assert.equal(o.status, 1);
  assert.equal(o.stdout, "keylang.gen.ts: stale, run `keylang wire`\n");
  assert.equal(readFileSync(join(dir, "keylang.gen.ts"), "utf8"), before);
  writeFileSync(join(dir, "keylang.gen.ts"), "export const mine = 1;\n");
  const manual = keylang(dir, ["wire"]);
  assert.equal(manual.status, 1);
  assert.equal(readFileSync(join(dir, "keylang.gen.ts"), "utf8"), "export const mine = 1;\n");
});

test("wiring: a cycle is K301, a module as factory K302, a malformed condition K005, a denied dependency K102; wire writes nothing", (t) => {
  const dir = copy(t);
  writeFileSync(
    join(dir, "keylang/wiring.md"),
    "# wiring\n\n- wire domain.store.Store\n  - db infra.db.createDb\n    - when DB is memory → infra.memory-db.createMemoryDb\n- wire infra.db.createDb\n  - store domain.store.Store\n- wire app.purchase\n",
  );
  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- deny domain infra\n");
  const o = keylang(dir, ["check"]);
  assert.equal(o.status, 1);
  assert.match(o.stdout, /wiring\.md:3:1: K301 wiring cycle domain\.store\.Store → infra\.db\.createDb → domain\.store\.Store/);
  assert.match(o.stdout, /wiring\.md:5:12: K005 a wiring condition must be `env\.NAME = value`/);
  assert.match(o.stdout, /wiring\.md:4:3: K102 divergence: wiring `domain\.store\.Store` depends on `infra\.db\.createDb`, which is denied/);
  assert.match(o.stdout, /wiring\.md:8:1: K302 wire `app\.purchase` is a module; a factory must be a fn or a class/);
  const w = keylang(dir, ["wire"]);
  assert.equal(w.status, 1);
  assert.match(w.stderr, /nothing written/);
  assert.ok(!existsSync(join(dir, "keylang.gen.ts")));
});

test("wiring: the generated file is code in its layer; `check` holds it to the same rules", (t) => {
  const dir = copy(t);
  assert.equal(keylang(dir, ["wire"]).status, 0);
  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- deny wiring domain\n");
  const o = keylang(dir, ["check"]);
  assert.equal(o.status, 1);
  assert.match(o.stdout, /keylang\.gen\.ts:\d+:1: K102 divergence: `wiring\.keylang_gen` depends on `domain\.store`/);
});

test("wiring: fmt is idempotent on `# wiring` and keeps its meaning", (t) => {
  const dir = copy(t);
  const messy = "# wiring\n\n-   wire app.purchase.createPurchase\n  - store   domain.store.Store\n- wire domain.store.Store\n  - db infra.db.createDb\n    - when env.DB = memory -> infra.memory-db.createMemoryDb\n    - compose   infra.logged.logged\n";
  writeFileSync(join(dir, "keylang/wiring.md"), messy);
  assert.equal(keylang(dir, ["fmt", "keylang/wiring.md"]).status, 0);
  const once = readFileSync(join(dir, "keylang/wiring.md"), "utf8");
  assert.equal(keylang(dir, ["fmt", "--check", "keylang/wiring.md"]).status, 0);
  assert.equal(keylang(dir, ["wire"]).status, 0);
  writeFileSync(join(dir, "run.ts"), RUNNER);
  assert.equal(run(dir, "run.ts", [], { DB: "memory" }).stdout.trim(), "init memory db → init store → query insert → mem(insert) → dispose memory db");
  assert.equal(readFileSync(join(dir, "keylang/wiring.md"), "utf8"), once);
});

test("wire: a default export, an alias, IDs that collapse to one name (`memory-db`, `memory.db`, `memory_db`) — the generated file type-checks and runs", (t) => {
  const dir = copy(t);
  writeFileSync(join(dir, "src/infra/pg.ts"), 'import { log, type Db } from "./db.ts";\n\nexport default function createPg(): Db {\n  log.push("init pg");\n  return { query: (sql) => `pg2(${sql})`, dispose: () => void log.push("dispose pg") };\n}\n');
  writeFileSync(join(dir, "src/infra/named.ts"), 'import type { Db } from "./db.ts";\n\nfunction wrap(inner: Db): Db {\n  return { query: (sql) => `named(${inner.query(sql)})`, dispose: () => inner.dispose() };\n}\n\nexport { wrap as named };\n');
  // `infra.memory.db.createMemoryDb` and `infra.memory_db.createMemoryDb` sanitize to the name of `infra.memory-db.createMemoryDb`.
  mkdirSync(join(dir, "src/infra/memory"));
  for (const [file, from, tag] of [
    ["src/infra/memory/db.ts", "../db.ts", "nested"],
    ["src/infra/memory_db.ts", "./db.ts", "underscore"],
  ] as const) {
    writeFileSync(join(dir, file), `import { log, type Db } from "${from}";\n\nexport function createMemoryDb(): Db {\n  log.push("init ${tag}");\n  return { query: (sql) => \`${tag}(\${sql})\`, dispose: () => void log.push("dispose ${tag}") };\n}\n`);
  }
  writeFileSync(
    join(dir, "keylang/wiring.md"),
    [
      "# wiring",
      "",
      "- wire app.purchase.createPurchase",
      "  - store domain.store.Store",
      "- wire domain.store.Store",
      "  - db infra.pg.createPg",
      "    - when env.DB = memory → infra.memory-db.createMemoryDb",
      "    - when env.DB = nested → infra.memory.db.createMemoryDb",
      "    - when env.DB = underscore → infra.memory_db.createMemoryDb",
      "    - compose infra.named.wrap",
      "",
    ].join("\n"),
  );
  const o = keylang(dir, ["wire"]);
  assert.equal(o.status, 0, o.stdout + o.stderr);
  const text = readFileSync(join(dir, "keylang.gen.ts"), "utf8");
  assert.match(text, /^import infra_pg_createPg from "\.\/src\/infra\/pg\.ts";$/m, "a default export is a default import");
  assert.match(text, /^import \{ named as infra_named_wrap \} from "\.\/src\/infra\/named\.ts";$/m, "an alias is imported by its exported name");
  const locals = [...text.matchAll(/createMemoryDb as (\w+)/g)].map((m) => m[1]!);
  assert.equal(new Set(locals).size, 3, `three distinct locals: ${locals.join(", ")}`);
  const types = run(dir, tsc, ["-p", "."]);
  assert.equal(types.status, 0, types.stdout);
  writeFileSync(join(dir, "run.ts"), RUNNER);
  // `compose` wraps whichever branch is chosen.
  assert.equal(run(dir, "run.ts", [], { DB: "pg" }).stdout.trim(), "init pg → init store → named(pg2(insert)) → dispose pg");
  for (const tag of ["nested", "underscore"]) assert.equal(run(dir, "run.ts", [], { DB: tag }).stdout.trim(), `init ${tag} → init store → named(${tag}(insert)) → dispose ${tag}`);
  assert.equal(run(dir, "run.ts", [], { DB: "memory" }).stdout.trim(), "init memory db → init store → named(mem(insert)) → dispose memory db");
  // The names are stable: the same input gives the same bytes.
  assert.equal(keylang(dir, ["wire", "--check"]).status, 0);
});

test("wire: under nodenext a JS source keeps `.js` and `.mts` becomes `.mjs`; the emitted file loads in Node", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "keylang-wiring-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const sub of ["src/infra", "src/app", "keylang"]) mkdirSync(join(dir, sub), { recursive: true });
  writeFileSync(join(dir, "package.json"), '{ "type": "module" }\n');
  writeFileSync(join(dir, "keylang.json"), JSON.stringify({ languages: ["typescript", "javascript"], layers: { infra: ["src/infra/**"], app: ["src/app/**"], wiring: ["keylang.gen.ts"] } }));
  // The module resolution comes through `extends`.
  writeFileSync(join(dir, "tsconfig.base.json"), JSON.stringify({ compilerOptions: { module: "nodenext", moduleResolution: "nodenext" } }));
  writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ extends: "./tsconfig.base.json", compilerOptions: { target: "es2022", strict: true, allowJs: true, outDir: "out", types: [] }, include: ["src", "keylang.gen.ts"] }));
  writeFileSync(join(dir, "src/infra/plain.js"), 'export function plain() {\n  return "js";\n}\n');
  writeFileSync(join(dir, "src/infra/modern.mts"), 'export function modern(): string {\n  return "mts";\n}\n');
  writeFileSync(join(dir, "src/app/main.ts"), "export function main(deps: { a: string; b: string }): string {\n  return `${deps.a}+${deps.b}`;\n}\n");
  writeFileSync(join(dir, "keylang/wiring.md"), "# wiring\n\n- wire app.main.main\n  - a infra.plain.plain\n  - b infra.modern.modern\n");
  const o = keylang(dir, ["wire"]);
  assert.equal(o.status, 0, o.stdout + o.stderr);
  const text = readFileSync(join(dir, "keylang.gen.ts"), "utf8");
  assert.match(text, /from "\.\/src\/infra\/plain\.js";/);
  assert.match(text, /from "\.\/src\/infra\/modern\.mjs";/);
  assert.match(text, /from "\.\/src\/app\/main\.js";/);
  const emit = run(dir, tsc, ["-p", "."]);
  assert.equal(emit.status, 0, emit.stdout);
  writeFileSync(join(dir, "run.mjs"), 'const { wire } = await import("./out/keylang.gen.js");\nconsole.log((await wire({}))["app.main.main"]);\n');
  const loaded = run(dir, "run.mjs", []);
  assert.equal(loaded.stdout.trim(), "js+mts", loaded.stderr);
});

test("wiring: K302 for compose on a module, a type or a class, a method, an unexported fn and Python code; K002 for a dependency named twice; K102 names the deny rule; wire writes nothing", (t) => {
  const dir = copy(t);
  writeFileSync(join(dir, "src/infra/hidden.ts"), 'import type { Db } from "./db.ts";\n\nfunction hidden(): Db {\n  return { query: (sql) => sql, dispose: () => {} };\n}\n\nexport const used = hidden;\n');
  writeFileSync(join(dir, "src/infra/py_db.py"), "def create_db():\n    return None\n");
  writeFileSync(join(dir, "keylang.json"), JSON.stringify({ languages: ["typescript", "python"], layers: { domain: ["src/domain/**"], infra: ["src/infra/**"], app: ["src/app/**"], wiring: ["keylang.gen.ts"] } }));
  writeFileSync(
    join(dir, "keylang/wiring.md"),
    [
      "# wiring",
      "",
      "- wire app.purchase.createPurchase",
      "  - store domain.store.Store",
      "  - store domain.store.Store",
      "- wire domain.store.Store",
      "  - db infra.db.createDb",
      "    - compose infra.db",
      "    - compose infra.db.Db",
      "    - compose domain.store.Store",
      "- wire infra.hidden.hidden",
      "- wire infra.py_db.create_db",
      "- wire domain.store.Store.save",
      "",
    ].join("\n"),
  );
  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- deny domain infra\n");
  const o = keylang(dir, ["check"]);
  assert.equal(o.status, 1);
  assert.match(o.stdout, /wiring\.md:5:3: K002 dependency `store` of `app\.purchase\.createPurchase` is named twice/);
  assert.match(o.stdout, /wiring\.md:8:5: K302 compose `infra\.db` is a module; a decorator must be a fn of one argument/);
  assert.match(o.stdout, /wiring\.md:9:5: K302 compose `infra\.db\.Db` is a type; a decorator must be a fn of one argument/);
  assert.match(o.stdout, /wiring\.md:10:5: K302 compose `domain\.store\.Store` is a class; a decorator must be a fn of one argument/);
  assert.match(o.stdout, /wiring\.md:11:1: K302 wire `infra\.hidden\.hidden` is not exported by src\/infra\/hidden\.ts/);
  assert.match(o.stdout, /wiring\.md:12:1: K302 wire `infra\.py_db\.create_db` is python code \(src\/infra\/py_db\.py\); `keylang wire` generates TypeScript/);
  assert.match(o.stdout, /wiring\.md:13:1: K302 wire `domain\.store\.Store\.save` is a method of the class `domain\.store\.Store`/);
  assert.match(o.stdout, /wiring\.md:7:3: K102 divergence: wiring `domain\.store\.Store` depends on `infra\.db\.createDb`, which is denied by `deny domain infra` \(keylang\/rules\.md:3\)/);
  const w = keylang(dir, ["wire"]);
  assert.equal(w.status, 1);
  assert.ok(!existsSync(join(dir, "keylang.gen.ts")));
});

test("wire: any error on a `# wiring` line blocks it — K003 indentation included; nothing written", (t) => {
  const dir = copy(t);
  writeFileSync(join(dir, "keylang/wiring.md"), readFileSync(join(dir, "keylang/wiring.md"), "utf8").replace("  - store domain.store.Store", "   - store domain.store.Store"));
  const w = keylang(dir, ["wire"]);
  assert.equal(w.status, 1, w.stdout + w.stderr);
  assert.match(w.stdout, /wiring\.md:4:4: K003 indentation must be a multiple of 2 spaces/);
  assert.match(w.stderr, /nothing written/);
  assert.ok(!existsSync(join(dir, "keylang.gen.ts")));
});

test("wire --out: an absolute path, `..`, a link out of the repository or a non-TS file is exit 2 with nothing written; a missing directory is created", (t) => {
  const dir = copy(t);
  const outside = mkdtempSync(join(tmpdir(), "keylang-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  symlinkSync(outside, join(dir, "gen-link"));
  const escape = `../${basename(dir)}-escape.ts`;
  const cases: [string, RegExp][] = [
    [join(outside, "abs.ts"), /not a plain relative path/],
    [escape, /not a plain relative path/],
    ["gen-link/linked.ts", /leads out of the repository through a link/],
    ["gen/wire.js", /must name a TypeScript file/],
  ];
  for (const [out, why] of cases) {
    const o = keylang(dir, ["wire", "--out", out]);
    assert.equal(o.status, 2, `${out}: ${o.stdout}${o.stderr}`);
    assert.match(o.stderr, why);
  }
  assert.deepEqual(readdirSync(outside), [], "nothing lands outside");
  assert.ok(!existsSync(join(dir, escape)));
  // `--check` is held to the same path before anything is read.
  assert.equal(keylang(dir, ["wire", "--check", "--out", escape]).status, 2);
  const nested = keylang(dir, ["wire", "--out", "gen/wiring/keylang.gen.ts"]);
  assert.equal(nested.status, 0, nested.stderr);
  assert.match(readFileSync(join(dir, "gen/wiring/keylang.gen.ts"), "utf8"), /from "\.\.\/\.\.\/src\/app\/purchase\.ts"/);
});

test("wiring: a `when` value is compared as written — `a,b` is one value, whatever the canonical text of the item", (t) => {
  const dir = copy(t);
  writeFileSync(join(dir, "keylang/wiring.md"), readFileSync(join(dir, "keylang/wiring.md"), "utf8").replace("when env.DB = memory →", "when env.DB = memory,local →"));
  assert.equal(keylang(dir, ["wire"]).status, 0);
  assert.match(readFileSync(join(dir, "keylang.gen.ts"), "utf8"), /env\["DB"\] === "memory,local"/);
  writeFileSync(join(dir, "run.ts"), RUNNER);
  assert.equal(run(dir, "run.ts", [], { DB: "memory,local" }).stdout.trim(), "init memory db → init store → query insert → mem(insert) → dispose memory db");
  assert.equal(run(dir, "run.ts", [], { DB: "memory" }).stdout.trim(), "init db → init store → query insert → pg(insert) → dispose db");
});

test("wire: when a factory fails and a disposer fails too, the factory's error stays first", (t) => {
  const dir = copy(t);
  writeFileSync(join(dir, "src/infra/db.ts"), readFileSync(join(dir, "src/infra/db.ts"), "utf8").replace('dispose: () => void log.push("dispose db")', 'dispose: () => {\n    throw new Error("db will not close");\n  }'));
  writeFileSync(join(dir, "src/app/purchase.ts"), 'import type { Store } from "../domain/store.ts";\n\nexport function createPurchase({ store }: { store: Store }): { buy(): string } {\n  throw new Error(`no payments for ${typeof store}`);\n}\n');
  assert.equal(keylang(dir, ["wire"]).status, 0);
  writeFileSync(
    join(dir, "run.ts"),
    'import { wire } from "./keylang.gen.ts";\ntry {\n  await wire({});\n} catch (error) {\n  const all = error instanceof AggregateError ? error.errors : [error];\n  console.log(all.map((e: Error) => e.message).join(" | "));\n}\n',
  );
  assert.equal(run(dir, "run.ts", []).stdout.trim(), "no payments for object | db will not close");
});
