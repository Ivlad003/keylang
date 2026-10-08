// Business names of discovered flows (business-flows/12): offline
// descriptions from doc comments under each `# flow` of the view, and
// `flows discover --names`, which asks a model once per layer group to group
// the flows into business processes, written as
// `keylang/flows-discovered/README.md` with provenance and a baseline that
// goes stale when a step's code changes. Through the real CLI with a fake
// agent CLI on temporary repositories of TypeScript and Python; never a real
// model or network.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { analyze } from "../src/analyze.ts";
import { diagramOf, viewsOf } from "../src/diagram.ts";
import { processViews, readProcesses } from "../src/discover-names.ts";
import { fakeAgents, type FakeAgents } from "./agent-fixture.ts";
import { bin, tempDir, treeBytes, writeTree } from "./cli-helpers.ts";

const REPO: Record<string, string> = {
  "keylang.json": JSON.stringify({ languages: ["typescript", "python"], module: "file", layers: { app: ["src/app/**"], shop: ["src/shop/**"] } }),
  "src/app/handlers.ts":
    'import { load } from "./store.ts";\n/** Lists the orders of the shopper. Used by the account page. */\nexport function listOrders(): string[] {\n  return load();\n}\n/** Pays for the cart. */\nexport function pay(): number {\n  return 1;\n}\n',
  "src/app/store.ts": "/** Loads the orders from the store. Reads one table. */\nexport function load(): string[] {\n  return [];\n}\n",
  "src/app/server.ts": 'import { listOrders, pay } from "./handlers.ts";\nconst app = { get: (_p: string, ..._h: unknown[]) => 0, post: (_p: string, ..._h: unknown[]) => 0 };\napp.get("/orders", listOrders);\napp.post("/pay", pay);\n',
  "pyproject.toml": '[project]\nname = "shop"\n\n[project.scripts]\nshop-py = "shop.cli:main"\n',
  "src/shop/__init__.py": "",
  "src/shop/cli.py": 'def helper() -> int:\n    """Computes the exit code. Always one."""\n    return 1\n\n\ndef main() -> int:\n    """Runs the shop command line."""\n    return helper()\n',
};

const VIEW = "keylang/flows-discovered";

const REPLY = JSON.stringify({
  processes: [
    {
      name: "Замовлення покупця",
      description: "Покупець переглядає свої замовлення й оплачує кошик. Дані беруться зі сховища `app.store.load` і `app.ghost.invented`.",
      domain: "Оплата",
      inputs: ["Cart"],
      outputs: ["Order"],
      flows: ["listOrders", "pay", "noSuchFlow"],
    },
  ],
});

function repo(t: { after: (fn: () => void) => void }): string {
  const dir = tempDir(t, "keylang-names-");
  writeTree(dir, REPO);
  return dir;
}

function read(dir: string, path: string): string {
  return readFileSync(join(dir, path), "utf8");
}

/** `keylang` with the fake agents first on PATH, a home of its own (no agents.json) and `env`. */
function run(t: { after: (fn: () => void) => void }, cwd: string, args: string[], fake: FakeAgents | null, env: Record<string, string> = {}): { status: number | null; stdout: string; stderr: string } {
  const home = tempDir(t, "keylang-names-home-");
  mkdirSync(join(home, ".config"), { recursive: true });
  const base: Record<string, string | undefined> = { ...process.env, HOME: home, KEYLANG_AGENT: undefined, KEYLANG_NESTED: undefined, ANTHROPIC_API_KEY: undefined, OPENROUTER_API_KEY: undefined };
  const path = fake ? `${fake.bin}:${process.env.PATH ?? ""}` : (process.env.PATH ?? "");
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8", env: { ...base, PATH: path, ...(fake?.env ?? {}), ...env } as NodeJS.ProcessEnv });
  if (r.error) throw r.error;
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

test("flows discover: an offline description from the trigger's JSDoc and Python docstring and the first sentence of each first-level step, with provenance", (t) => {
  const dir = repo(t);
  const r = run(t, dir, ["flows", "discover"], null);
  assert.equal(r.status, 0, r.stderr);
  const app = read(dir, `${VIEW}/app.md`);
  assert.match(
    app,
    /^# flow listOrders\n\n<!-- keylang:discover entry=route label="GET \/orders" steps=2 holes=0 -->\n\n<!-- keylang:discover doc=app\.handlers\.listOrders,app\.store\.load -->\n\nLists the orders of the shopper\. Used by the account page\. Loads the orders from the store\.\n\n- trigger route app\.handlers\.listOrders\n/m,
  );
  assert.match(app, /^# flow pay\n\n<!-- keylang:discover entry=route label="POST \/pay" steps=1 holes=0 -->\n\n<!-- keylang:discover doc=app\.handlers\.pay -->\n\nPays for the cart\.\n\n- trigger route app\.handlers\.pay\n/m);
  const shop = read(dir, `${VIEW}/shop.md`);
  assert.match(shop, /<!-- keylang:discover doc=shop\.cli\.main,shop\.cli\.helper -->\n\nRuns the shop command line\. Computes the exit code\.\n\n- trigger shop\.cli\.main\n/);
  // Deterministic, no model: a second run gives the same bytes, and the view is current.
  const before = treeBytes(join(dir, VIEW));
  assert.equal(run(t, dir, ["flows", "discover"], null).status, 0);
  assert.deepEqual(treeBytes(join(dir, VIEW)), before);
  assert.equal(run(t, dir, ["flows", "discover", "--check"], null).status, 0);
  assert.ok(!existsSync(join(dir, `${VIEW}/README.md`)), "no README without --names");
});

test("flows discover --names --dry-run: the requests and a token estimate, nothing written, no model asked", (t) => {
  const dir = repo(t);
  const fake = fakeAgents(t, ["claude"], { reply: REPLY });
  const r = run(t, dir, ["flows", "discover", "--names", "--dry-run"], fake, { KEYLANG_AGENT: "cli:claude" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^would ask 2 request\(s\) for 3 flow\(s\): ~\d+ input tokens, ~\d+ output tokens$/m);
  assert.match(r.stdout, /^ {2}app: listOrders, pay$/m);
  assert.equal(fake.calls().length, 0);
  assert.ok(!existsSync(join(dir, VIEW)), "nothing written, not even the view");
  const limited = run(t, dir, ["flows", "discover", "--names", "--dry-run", "--limit", "1"], fake, { KEYLANG_AGENT: "cli:claude" });
  assert.match(limited.stdout, /^would ask 1 request\(s\)/m);
});

test("flows discover --names without a model: hybrid writes the offline view with a note, llm is exit 2 and writes nothing", (t) => {
  const dir = repo(t);
  const llm = run(t, dir, ["flows", "discover", "--names", "--mode", "llm"], null);
  assert.equal(llm.status, 2, llm.stderr);
  assert.match(llm.stderr, /no model configured/);
  assert.ok(!existsSync(join(dir, VIEW)));
  const hybrid = run(t, dir, ["flows", "discover", "--names"], null);
  assert.equal(hybrid.status, 0, hybrid.stderr);
  assert.match(hybrid.stderr, /no model: offline descriptions only/);
  assert.ok(existsSync(join(dir, `${VIEW}/app.md`)));
  assert.ok(!existsSync(join(dir, `${VIEW}/README.md`)));
  assert.equal(run(t, dir, ["flows", "discover", "--names", "--mode", "nope"], null).status, 2);
});

test("flows discover --names: one request per layer group, README with provenance, unknown names dropped; stale after a step's code changes; the process diagram", async (t) => {
  const dir = repo(t);
  const fake = fakeAgents(t, ["claude"], { reply: REPLY, model: "claude-test-5" });
  const env = { KEYLANG_AGENT: "cli:claude" };
  const r = run(t, dir, ["flows", "discover", "--names", "--jobs", "1"], fake, env);
  assert.equal(r.status, 0, r.stderr);
  // Two layer groups (app, shop), not one request per flow.
  assert.equal(fake.calls().length, 2);
  const prompt = fake.calls()[0]!.stdin;
  assert.match(prompt, /listOrders/);
  assert.match(prompt, /Lists the orders of the shopper/);
  assert.match(r.stderr, /dropped unknown flow name\(s\) in app: noSuchFlow/);
  assert.match(r.stderr, /unknown ids: app\.ghost\.invented/);
  // The shop group's answer names no flow of its own: nothing of it is kept.
  assert.match(r.stderr, /dropped unknown flow name\(s\) in shop: listOrders, noSuchFlow, pay/);
  const readme = read(dir, `${VIEW}/README.md`);
  assert.equal(readme.split("\n")[0], "<!-- keylang:generated — не редагувати, `keylang flows discover` -->");
  assert.match(readme, /^## Оплата\n\n### Замовлення покупця\n\n<!-- keylang:llm model=cli:claude:claude-test-5 date=\d{4}-\d{2}-\d{2} closure=[0-9a-f]{64} layer=app -->\n\nПокупець переглядає свої замовлення й оплачує кошик\./m);
  assert.match(readme, /^- in: Cart$/m);
  assert.match(readme, /^- out: Order$/m);
  assert.match(readme, /^- flows: \[listOrders\]\(app\.md#flow-listorders\), \[pay\]\(app\.md#flow-pay\)$/m);
  assert.doesNotMatch(readme, /noSuchFlow/);
  // The view of the flows is unchanged by naming, and check stays as it was.
  assert.equal(run(t, dir, ["flows", "discover", "--check"], null).status, 0);
  const processes = readProcesses(dir, "keylang");
  assert.equal(processes.length, 1);
  assert.deepEqual(processes[0]!.flows, ["listOrders", "pay"]);

  // Fresh: --names --stale asks nothing.
  const fresh = run(t, dir, ["flows", "discover", "--names", "--stale"], fake, env);
  assert.equal(fresh.status, 0, fresh.stderr);
  assert.match(fresh.stderr, /no stale process/);
  assert.equal(fake.calls().length, 2);

  // A step's code changes: the process is stale; --stale lists it in a dry run and asks again only for its group.
  writeFileSync(join(dir, "src/app/store.ts"), "/** Loads the orders from the store. Reads one table. */\nexport function load(): string[] {\n  return [\"x\"];\n}\n");
  const listed = run(t, dir, ["flows", "discover", "--names", "--stale", "--dry-run"], fake, env);
  assert.equal(listed.status, 0, listed.stderr);
  assert.match(listed.stdout, /^stale: Замовлення покупця \(app\)$/m);
  assert.match(listed.stdout, /^would ask 1 request\(s\)/m);
  assert.equal(fake.calls().length, 2);
  const again = run(t, dir, ["flows", "discover", "--names", "--stale"], fake, env);
  assert.equal(again.status, 0, again.stderr);
  assert.equal(fake.calls().length, 3);
  const after = run(t, dir, ["flows", "discover", "--names", "--stale", "--dry-run"], fake, env);
  assert.match(after.stdout, /^would ask 0 request\(s\)/m);

  // The process view of the diagram: lanes per layer, one start per flow.
  const analysis = await analyze({ root: dir });
  const views = processViews(analysis.snapshot!, analysis.spec, readProcesses(dir, "keylang"));
  const listing = viewsOf(analysis.snapshot, analysis.spec, views);
  assert.deepEqual(listing.processes, [{ name: "Замовлення покупця", domain: "Оплата", flows: ["listOrders", "pay"] }]);
  const diagram = diagramOf({ snapshot: analysis.snapshot, spec: analysis.spec, results: [], view: { kind: "process", domain: "Оплата" }, processes: views });
  assert.equal(diagram.reason, undefined);
  const starts = diagram.nodes.filter((node) => node.kind === "start");
  assert.deepEqual(starts.map((node) => node.label).sort(), ["listOrders", "pay"]);
  assert.ok(diagram.nodes.some((node) => node.ref?.id === "app.store.load"));
  assert.deepEqual(diagram.groups.map((group) => group.id), ["app"]);
  const none = diagramOf({ snapshot: analysis.snapshot, spec: analysis.spec, results: [], view: { kind: "process", domain: "Доставка" }, processes: views });
  assert.equal(none.nodes.length, 0);
  assert.match(none.reason ?? "", /Доставка/);
});
