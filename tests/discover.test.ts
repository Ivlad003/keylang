// `keylang flows discover` and `keylang flows adopt` (business-flows/11):
// a flow draft for every entry point as a generated view
// `keylang/flows-discovered/<layer>.md` that `check` does not read, and one
// discovered flow adopted as a proposal. Through the real CLI on temporary
// repositories of TypeScript and Python.

import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { DISCOVER_MARK } from "../src/discover.ts";
import { proposalProblem } from "../src/proposals.ts";
import { keylang, tempDir, treeBytes, writeTree } from "./cli-helpers.ts";
import { checkoutRepo, KEY } from "./tui-fixture.ts";
import { session } from "./tui-helpers.ts";

/** Two kinds of entry points in two languages: `bin` and `[project.scripts]` are `cli`, Express-style registrations are `route`. */
const REPO: Record<string, string> = {
  "keylang.json": JSON.stringify({ languages: ["typescript", "python"], module: "file", layers: { bin: ["bin/**"], app: ["src/app/**"], shop: ["src/shop/**"] } }),
  "package.json": JSON.stringify({ name: "shop", bin: { shop: "./bin/shop.js" } }),
  "bin/shop.ts": 'import { listOrders } from "../src/app/handlers.ts";\nexport function main(): number {\n  listOrders();\n  return 0;\n}\n',
  "src/app/handlers.ts": 'import { load } from "./store.ts";\nexport function listOrders(): string[] {\n  return load();\n}\nexport function pay(): number {\n  const x: any = {};\n  x.charge();\n  return 1;\n}\n',
  "src/app/store.ts": "export function load(): string[] {\n  return [];\n}\n",
  "src/app/server.ts": 'import { listOrders, pay } from "./handlers.ts";\nconst app = { get: (_p: string, ..._h: unknown[]) => 0, post: (_p: string, ..._h: unknown[]) => 0 };\napp.get("/orders", listOrders);\napp.post("/pay", pay);\n',
  "pyproject.toml": '[project]\nname = "shop"\n\n[project.scripts]\nshop-py = "shop.cli:main"\n',
  "src/shop/__init__.py": "",
  "src/shop/cli.py": "def helper() -> int:\n    return 1\n\n\ndef main() -> int:\n    return helper()\n",
};

const VIEW = "keylang/flows-discovered";

function repo(t: { after: (fn: () => void) => void }, extra: Record<string, string> = {}): string {
  const dir = tempDir(t, "keylang-discover-");
  writeTree(dir, { ...REPO, ...extra });
  return dir;
}

function read(dir: string, path: string): string {
  return readFileSync(join(dir, path), "utf8");
}

test("flows discover: one generated view per layer, marked and commented, the same bytes on a second run", (t) => {
  const dir = repo(t);
  const run = keylang(dir, ["flows", "discover"]);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stderr, /discovered 4 flows \(0 already specified\), 1 with blind spots/);
  const app = read(dir, `${VIEW}/app.md`);
  assert.equal(app.split("\n")[0], DISCOVER_MARK);
  assert.match(app, /^# flow listOrders\n\n<!-- keylang:discover entry=route label="GET \/orders" steps=2 holes=0 -->\n\n- trigger app\.handlers\.listOrders\n {2}- step app\.store\.load\n/m);
  assert.match(app, /<!-- keylang:discover entry=route label="POST \/pay" steps=1 holes=1 -->\n\n- trigger app\.handlers\.pay <!-- keylang:algo unresolved: x\.charge/);
  // Two `main` triggers get distinct names, as `code-to-spec` gives them; each layer of an entry is its own file.
  assert.match(read(dir, `${VIEW}/bin.md`), /^# flow shop-main\n\n<!-- keylang:discover entry=cli label="shop" steps=3 holes=0 -->/m);
  assert.match(read(dir, `${VIEW}/shop.md`), /^# flow cli-main\n\n<!-- keylang:discover entry=cli label="shop-py" steps=2 holes=0 -->\n\n- trigger shop\.cli\.main\n {2}- step shop\.cli\.helper\n/m);
  const before = treeBytes(join(dir, VIEW));
  const again = keylang(dir, ["flows", "discover"]);
  assert.equal(again.status, 0, again.stderr);
  assert.deepEqual(treeBytes(join(dir, VIEW)), before);
  assert.equal(keylang(dir, ["flows", "discover", "--check"]).status, 0);
  // --print writes nothing and prints the same files; filters narrow what is printed.
  const printed = keylang(dir, ["flows", "discover", "--print", "--kind", "route"]);
  assert.equal(printed.status, 0, printed.stderr);
  assert.match(printed.stdout, /# flow listOrders/);
  assert.doesNotMatch(printed.stdout, /shop-main|cli-main/);
  assert.match(printed.stderr, /discovered 2 flows/);
  assert.deepEqual(treeBytes(join(dir, VIEW)), before);
  const limited = keylang(dir, ["flows", "discover", "--print", "--layer", "app", "--limit", "1", "--depth", "0"]);
  assert.equal(limited.status, 0, limited.stderr);
  assert.match(limited.stdout, /# flow listOrders\n\n.*steps=1 holes=0 -->\n\n- trigger app\.handlers\.listOrders\n(?! {2}- step)/);
  assert.doesNotMatch(limited.stdout, /flow pay/);
  assert.equal(keylang(dir, ["flows", "discover", "--kind", "nope"]).status, 2);
  assert.equal(keylang(dir, ["flows", "discover", "--limit", "0"]).status, 2);
});

test("flows discover --check: exit 1 after a code change, nothing written; 0 after the view is written again", (t) => {
  const dir = repo(t);
  assert.equal(keylang(dir, ["flows", "discover", "--check"]).status, 1, "no view yet is stale");
  assert.equal(keylang(dir, ["flows", "discover"]).status, 0);
  writeFileSync(join(dir, "src/app/handlers.ts"), read(dir, "src/app/handlers.ts").replace("  x.charge();\n", "  x.charge();\n  load();\n"));
  const before = treeBytes(join(dir, VIEW));
  const stale = keylang(dir, ["flows", "discover", "--check"]);
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /keylang\/flows-discovered\/app\.md/);
  assert.deepEqual(treeBytes(join(dir, VIEW)), before);
  assert.equal(keylang(dir, ["flows", "discover"]).status, 0);
  assert.match(read(dir, `${VIEW}/app.md`), /label="POST \/pay" steps=2 holes=1/);
  assert.equal(keylang(dir, ["flows", "discover", "--check"]).status, 0);
  // A manual file where the view goes is never replaced.
  writeFileSync(join(dir, `${VIEW}/bin.md`), "# flow mine\n\n- trigger bin.shop.main\n");
  const conflict = keylang(dir, ["flows", "discover"]);
  assert.equal(conflict.status, 1);
  assert.match(conflict.stderr, /bin\.md: manual file without keylang:generated marker/);
});

test("check does not read flows-discovered/: the same report before and after discover, a stale id there included", (t) => {
  const dir = repo(t, { "keylang/rules.md": "# rules\n\n- no-cycles\n" });
  const before = keylang(dir, ["check"]);
  assert.equal(keylang(dir, ["flows", "discover"]).status, 0);
  // A discovered flow naming a fn that no longer exists: a stale view, not a K001.
  writeFileSync(join(dir, `${VIEW}/app.md`), `${read(dir, `${VIEW}/app.md`)}\n# flow gone\n\n- trigger app.handlers.gone\n`);
  const after = keylang(dir, ["check"]);
  assert.equal(after.status, before.status, after.stdout);
  assert.equal(after.stdout, before.stdout);
  assert.doesNotMatch(after.stdout, /flows-discovered|K001/);
});

test("flows adopt: one discovered flow becomes a proposal; accepted, check sees the flow", (t) => {
  const dir = repo(t);
  assert.equal(keylang(dir, ["flows", "discover"]).status, 0);
  const adopt = keylang(dir, ["flows", "adopt", "listOrders"]);
  assert.equal(adopt.status, 0, adopt.stderr);
  const store = ".keylang/proposals/keylang/flows/listOrders.md";
  assert.match(adopt.stderr, new RegExp(store.replace(/\./g, "\\.")));
  const proposal = read(dir, store);
  assert.match(proposal, /^# flow listOrders\n\n<!-- keylang:discover adopted entry=route label="GET \/orders" steps=2 holes=0 from=keylang\/flows-discovered\/app\.md -->\n\n- trigger app\.handlers\.listOrders\n {2}- step app\.store\.load\n$/);
  assert.equal(existsSync(join(dir, "keylang/flows/listOrders.md")), false, "a proposal, not the spec");
  // A second adopt while the proposal waits is refused.
  assert.equal(keylang(dir, ["flows", "adopt", "listOrders"]).status, 1);
  const accept = keylang(dir, ["proposals", "accept", "keylang/flows/listOrders.md"]);
  assert.equal(accept.status, 0, accept.stderr);
  const check = keylang(dir, ["check"]);
  assert.equal(check.status, 0, check.stdout + check.stderr);
  assert.match(check.stdout, /listOrders/);
  // Now specified by hand: the view leaves it out and says so.
  const rerun = keylang(dir, ["flows", "discover"]);
  assert.equal(rerun.status, 0, rerun.stderr);
  assert.match(rerun.stderr, /already specified: app\.handlers\.listOrders \(keylang\/flows\/listOrders\.md, flow listOrders\)/);
  assert.match(rerun.stderr, /discovered 3 flows \(1 already specified\)/);
  assert.doesNotMatch(read(dir, `${VIEW}/app.md`), /flow listOrders/);
  // Adopting it again names where it is written.
  const twice = keylang(dir, ["flows", "adopt", "listOrders"]);
  assert.equal(twice.status, 2);
  assert.match(twice.stderr, /already specified in keylang\/flows\/listOrders\.md/);
  // --into adds the flow to an existing spec, beside its other sections.
  writeFileSync(join(dir, "keylang/flows/pay.md"), "# flow other\n\n- trigger app.store.load\n");
  const into = keylang(dir, ["flows", "adopt", "pay", "--into", "keylang/flows/pay.md"]);
  assert.equal(into.status, 0, into.stderr);
  assert.match(read(dir, ".keylang/proposals/keylang/flows/pay.md"), /^# flow other\n\n- trigger app\.store\.load\n\n# flow pay\n\n<!-- keylang:discover adopted entry=route label="POST \/pay"/);
  const unknown = keylang(dir, ["flows", "adopt", "nosuch"]);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /no discovered flow `nosuch`/);
});

test("flows-discovered/ is generated: proposals, draft --into and apply_diff's gate refuse it", (t) => {
  const dir = repo(t);
  assert.equal(keylang(dir, ["flows", "discover"]).status, 0);
  const problem = proposalProblem(dir, "keylang", `${VIEW}/app.md`);
  assert.match(problem ?? "", /flows discover/);
  assert.match(proposalProblem(dir, "keylang", `${VIEW}/new.md`) ?? "", /flows discover/);
  const draft = keylang(dir, ["draft", "flow", "app.handlers.pay", "--into", `${VIEW}/app.md`]);
  assert.equal(draft.status, 2);
  assert.match(draft.stderr, /flows discover/);
  const into = keylang(dir, ["flows", "adopt", "pay", "--into", `${VIEW}/app.md`]);
  assert.equal(into.status, 2);
  assert.match(into.stderr, /flows discover/);
});

test("tui: «Discover flows» in the palette writes the view and shows the summary in F6", async (t) => {
  const root = checkoutRepo(t, {
    "src/presentation/handlers.ts": "export function listOrders(): string[] {\n  return [];\n}\n",
    "src/presentation/server.ts": 'import { listOrders } from "./handlers.ts";\nconst app = { get: (_p: string, _h: unknown) => 0 };\napp.get("/orders", listOrders);\n',
  });
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.ctrlP);
  for (const ch of "discover flows") s.send(ch);
  assert.match(s.text(), /Discover flows: a flow draft for every entry point/);
  s.send(KEY.enter);
  await s.app.idle();
  const record = s.app.state.records.at(-1)!;
  assert.equal(record.status, "completed");
  assert.equal(record.result?.exitCode, 0);
  assert.match(read(root, "keylang/flows-discovered/presentation.md"), /# flow listOrders\n\n<!-- keylang:discover entry=route label="GET \/orders" steps=1 holes=0 -->/);
  // The same view the CLI writes: its check finds it current.
  assert.equal(keylang(root, ["flows", "discover", "--check"]).status, 0);
  s.send(KEY.f6);
  assert.match(s.text(), /discovered 1 flows \(0 already specified\), 0 with blind spots · code 0/);
  assert.match(s.text(), /listOrders {2}route GET \/orders/);
  s.send("\x1b");
});
