// End-to-end tests of `# wiring` and `keylang wire` (ADR 0003) on a copy of
// `tests/fixtures/wiring-shop`: diagnostics, the generated file, `tsc` on it,
// and the lifecycle when it runs.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
