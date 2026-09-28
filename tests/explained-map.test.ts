// Explained map (.scratch/explained-map): documentation comments in the
// snapshot, the second map with explanations, briefs from a model and their
// batch generation, through the real CLI.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { briefOf } from "../src/brief.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");

function keylang(cwd: string, args: string[], env: Record<string, string | undefined> = {}): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8", env: { ...process.env, ...env } });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function copy(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-explained-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(join(root, "tests/fixtures/explained"), dir, { recursive: true });
  return dir;
}

type Nodes = Record<string, { doc: string | null; fingerprint?: string; closure?: { fingerprint: string } }>;

function nodes(dir: string): Nodes {
  return (JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as { nodes: Nodes }).nodes;
}

test("briefOf: the first paragraph, two sentences, about 280 characters", () => {
  assert.equal(briefOf(""), null);
  assert.equal(briefOf(" \n\n "), null);
  assert.equal(briefOf("One. Two! Three? Four."), "One. Two!");
  assert.equal(briefOf("Reads x, e.g. from disk. Then a.b() runs it. Never more."), "Reads x, e.g. from disk. Then a.b() runs it.");
  assert.equal(briefOf("Keeps  lines\n  together.\n\nSecond paragraph."), "Keeps lines together.");
  assert.equal(briefOf("Ends with a quote.\" Next one. Third."), "Ends with a quote.\" Next one.");
  assert.equal(briefOf("Читає файл. Пише індекс. Більше нічого."), "Читає файл. Пише індекс.");
  assert.equal(briefOf("v1.2 is out. no capital after this. Done. Gone."), "v1.2 is out. no capital after this. Done.");
  const long = briefOf(`${"word ".repeat(100)}end.`);
  assert.ok(long !== null && [...long].length <= 280 && long.endsWith("word…"), long ?? "");
  const cut = briefOf("😀".repeat(400));
  assert.ok(cut !== null && [...cut].length === 280 && cut.endsWith("…"), "a cut never splits a surrogate pair");
});

test("map: documentation comments reach the snapshot as `doc`; the canonical map shows none", (t) => {
  const dir = copy(t);
  const o = keylang(dir, ["map"]);
  assert.equal(o.status, 0, o.stderr);
  const n = nodes(dir);
  const docs = Object.fromEntries(Object.entries(n).map(([id, node]) => [id, node.doc]));
  assert.deepEqual(docs, {
    app: null,
    "app.checkout": "Checkout: turns a cart into an order.",
    "app.checkout.checkout": null,
    domain: null,
    "domain.money": null,
    "domain.money.Money": "Money in cents.",
    "domain.order": "Orders and their totals. Nothing here does I/O.",
    "domain.order.Ledger": "Keeps orders in memory.",
    "domain.order.Ledger.add": "Adds an order to the ledger! Returns nothing.",
    "domain.order.Ledger.size": null,
    "domain.order.Order": "An order as the shop keeps it, e.g. after checkout. See total.",
    "domain.order.createOrder": null,
    "domain.order.total": "Sums item prices. The sum calls `items.reduce()` once.",
  });
  assert.doesNotMatch(readFileSync(join(dir, "keylang/map/domain.md"), "utf8"), /Sums item prices|Keeps orders/);
  const explain = keylang(dir, ["explain", "domain.order.total"]);
  assert.equal(explain.status, 0, explain.stderr);
  assert.match(explain.stdout, /^doc: Sums item prices\. The sum calls `items\.reduce\(\)` once\.$/m);
  assert.doesNotMatch(keylang(dir, ["explain", "domain.order.createOrder"]).stdout, /^doc:/m);

  // A comment is not code: its change moves `doc`, not the fingerprint or the closure.
  const file = join(dir, "src/domain/order.ts");
  writeFileSync(file, readFileSync(file, "utf8").replace("Sums item prices.", "Adds up item prices."));
  assert.equal(keylang(dir, ["map"]).status, 0);
  const after = nodes(dir)["domain.order.total"];
  const before = n["domain.order.total"];
  assert.equal(after?.doc, "Adds up item prices. The sum calls `items.reduce()` once.");
  assert.equal(after?.fingerprint, before?.fingerprint);
  assert.equal(after?.closure?.fingerprint, before?.closure?.fingerprint);
});

function configure(dir: string, explain: Record<string, unknown> | undefined): void {
  const file = join(dir, "keylang.json");
  const config = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  if (explain === undefined) delete config.explain;
  else config.explain = explain;
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
}

/** The explained map without its description lines: what is left is the canonical map. */
function withoutDescriptions(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^\s+<br>/.test(line))
    .join("\n");
}

test("map with explain.map: the explained map repeats the map's tree with doc comments; check does not read it", (t) => {
  const dir = copy(t);
  const before = keylang(dir, ["check"]);
  configure(dir, { map: true });
  const o = keylang(dir, ["map"]);
  assert.equal(o.status, 0, o.stderr);
  assert.match(o.stdout, /^keylang\/map-explained\/domain\.md: written$/m);
  assert.match(o.stdout, /^keylang\/map-explained\/README\.md: written$/m);
  const explained = readFileSync(join(dir, "keylang/map-explained/domain.md"), "utf8");
  const lines = explained.split("\n");
  const after = (head: string): string | undefined => lines[lines.findIndex((line) => line.includes(head)) + 1];
  assert.equal(after("fn [total]"), "      <br>Sums item prices. The sum calls `items.reduce()` once.");
  assert.equal(after("module [Ledger]"), "      <br>Keeps orders in memory.");
  assert.equal(after("type [Money]"), "      <br>Money in cents.");
  assert.equal(after("module [order]"), "    <br>Orders and their totals. Nothing here does I/O.");
  assert.equal(after("fn [createOrder]"), "      - calls domain.order.total", "a node without documentation has no text");
  assert.equal(withoutDescriptions(explained), readFileSync(join(dir, "keylang/map/domain.md"), "utf8"));
  const readme = readFileSync(join(dir, "keylang/map-explained/README.md"), "utf8");
  assert.match(readme, /^\| \[domain\]\(domain\.md\) \|\s*\| 6 \| 0 \| 0 \| 4 \|$/m);
  assert.match(readme, /^\| \*\*all\*\* \| \| 7 \| 0 \| 0 \| 6 \|$/m);

  const parsed = keylang(dir, ["parse", "keylang/map-explained"]);
  assert.equal(parsed.status, 0, parsed.stderr);
  assert.equal(parsed.stderr, "");
  assert.equal(keylang(dir, ["fmt", "--check", "keylang/map-explained"]).status, 0);
  const checked = keylang(dir, ["check"]);
  assert.deepEqual(checked, before, "the explained map changes nothing check sees");
  assert.doesNotMatch(checked.stdout, /K002/);
  const named = keylang(dir, ["check", "keylang/map-explained/domain.md"]);
  assert.equal(named.status, 0);
  assert.match(named.stderr, /note: keylang\/map-explained\/domain\.md: the explained map and saved explanations are not specs; skipped/);
  assert.equal(keylang(dir, ["map", "--check"]).status, 0);

  // A changed doc comment leaves the canonical map as it is and the explained map stale.
  const file = join(dir, "src/domain/order.ts");
  writeFileSync(file, readFileSync(file, "utf8").replace("Keeps orders in memory.", "Keeps orders until the process exits."));
  const stale = keylang(dir, ["map", "--check"]);
  assert.equal(stale.status, 1);
  assert.equal(stale.stdout, "keylang/map-explained/domain.md: stale, run `keylang map`\n");
  assert.equal(readFileSync(join(dir, "keylang/map-explained/domain.md"), "utf8"), explained, "--check writes nothing");
});

test("explain.map: a value that is not a boolean is exit 2; turned off, map removes its generated files and keeps manual ones", (t) => {
  const dir = copy(t);
  configure(dir, { map: "yes" });
  const bad = keylang(dir, ["map"]);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /`explain\.map` must be true or false, got "yes"/);

  configure(dir, { map: true });
  assert.equal(keylang(dir, ["map"]).status, 0);
  writeFileSync(join(dir, "keylang/map-explained/notes.md"), "# rules\n");
  configure(dir, undefined);
  const stale = keylang(dir, ["map", "--check"]);
  assert.equal(stale.status, 1);
  assert.match(stale.stdout, /^keylang\/map-explained\/README\.md: stale, run `keylang map`$/m);
  const off = keylang(dir, ["map"]);
  assert.equal(off.status, 0, off.stderr);
  assert.match(off.stdout, /^keylang\/map-explained\/domain\.md: removed$/m);
  assert.deepEqual(readdirSync(join(dir, "keylang/map-explained")), ["notes.md"]);

  // A manual file where a generated one goes blocks the whole write, as for the map.
  configure(dir, { map: true });
  writeFileSync(join(dir, "keylang/map-explained/README.md"), "my notes\n");
  const conflict = keylang(dir, ["map"]);
  assert.equal(conflict.status, 1);
  assert.equal(conflict.stdout, "keylang/map-explained/README.md: manual file without keylang:generated marker\n");
});

interface Mock {
  url: string;
  /** The prompt of every request, in order. */
  prompts: { system: string; prompt: string }[];
  /** The answer to a prompt; an Error is answered with HTTP 400, which the SDK does not retry. */
  reply: (prompt: string) => string | Error;
}

/** A local stand-in for the Messages API: no network, answers with `mock.reply`. */
async function mockAnthropic(t: TestContext): Promise<Mock> {
  const mock: Mock = { url: "", prompts: [], reply: () => "" };
  const server = createServer((req, res) => {
    let data = "";
    req.on("data", (chunk: Buffer) => (data += chunk.toString()));
    req.on("end", () => {
      const body = JSON.parse(data) as { system: string; messages: { content: string }[] };
      const prompt = body.messages[0]?.content ?? "";
      mock.prompts.push({ system: body.system, prompt });
      const answer = mock.reply(prompt);
      if (answer instanceof Error) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: answer.message } }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5", content: [{ type: "text", text: answer }], stop_reason: "end_turn", stop_details: null, usage: { input_tokens: 10, output_tokens: 10 } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  mock.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return mock;
}

/** `keylang` without blocking this process: the mock server answers while the CLI waits. */
function keylangAsync(cwd: string, args: string[], env: Record<string, string | undefined>): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [bin, ...args], { cwd, env: { ...process.env, ...env } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

/** The node a prompt asks about: the first line of the summary is `<kind> <id> …`. */
function askedId(prompt: string): string {
  return /^Node:\n(?:planned )?\S+ (\S+)/.exec(prompt)?.[1] ?? "?";
}

function withModel(dir: string, mock: Mock): Record<string, string | undefined> {
  configure(dir, { map: true });
  const file = join(dir, "keylang.json");
  writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), agent: "anthropic:claude-opus-5" }));
  return { ANTHROPIC_BASE_URL: mock.url, ANTHROPIC_API_KEY: "test-key", ANTHROPIC_AUTH_TOKEN: undefined, HOME: dir };
}

const today = new Date().toISOString().slice(0, 10);

test("explain --llm --brief: a brief in keylang/explain/brief/ shows in the explained map with model and date, a doc comment wins, a code change makes it stale", async (t) => {
  const dir = copy(t);
  const mock = await mockAnthropic(t);
  const env = withModel(dir, mock);
  mock.reply = (prompt) => (askedId(prompt) === "domain.order.createOrder" ? "Creates an order with its total. It never saves it. A third sentence the map leaves out." : "Sums the prices; see `domain.order.nope`.");
  const brief = await keylangAsync(dir, ["explain", "domain.order.createOrder", "--llm", "--brief"], env);
  assert.equal(brief.status, 0, brief.stderr);
  assert.match(mock.prompts[0]!.system, /one or two sentences in one paragraph/);
  assert.equal(brief.stdout, `Creates an order with its total. It never saves it.\n\nanthropic:claude-opus-5 · ${today} · fresh\n`);
  const saved = readFileSync(join(dir, "keylang/explain/brief/domain.order.createOrder.md"), "utf8");
  assert.match(saved, /^<!-- keylang:explain agent=anthropic:claude-opus-5 date=\S+ closure=[0-9a-f]{64} lang=en detail=brief -->\nCreates an order with its total\. It never saves it\.\n$/);
  // A node with a doc comment keeps it in the map; a model's unknown ID is reported and stays plain text.
  const total = await keylangAsync(dir, ["explain", "domain.order.total", "--llm", "--brief"], env);
  assert.match(total.stdout, /^unknown ids: domain\.order\.nope$/m);
  assert.equal(keylang(dir, ["map"]).status, 0);
  const map = (): string[] => readFileSync(join(dir, "keylang/map-explained/domain.md"), "utf8").split("\n");
  const after = (head: string): string | undefined => map()[map().findIndex((line) => line.includes(head)) + 1];
  assert.equal(after("fn [createOrder]"), `      <br>Creates an order with its total. It never saves it. _(llm · claude-opus-5 · ${today})_`);
  assert.equal(after("fn [total]"), "      <br>Sums item prices. The sum calls `items.reduce()` once.");
  assert.match(readFileSync(join(dir, "keylang/map-explained/README.md"), "utf8"), /^\| \[domain\]\(domain\.md\) \|\s*\| 6 \| 1 \| 0 \| 3 \|$/m);
  assert.equal(keylang(dir, ["parse", "keylang/map-explained"]).status, 0);

  const order = join(dir, "src/domain/order.ts");
  writeFileSync(order, readFileSync(order, "utf8").replace("return { id, total: total(items) };", "return { id: id.trim(), total: total(items) };"));
  const check = keylang(dir, ["map", "--check"]);
  assert.equal(check.status, 1);
  assert.match(check.stdout, /^keylang\/map-explained\/domain\.md: stale/m);
  assert.equal(keylang(dir, ["map"]).status, 0);
  assert.equal(after("fn [createOrder]"), `      <br>Creates an order with its total. It never saves it. _(llm · claude-opus-5 · ${today} · stale)_`);
  assert.match(keylang(dir, ["explain", "--stale"]).stdout, /^domain\.order\.createOrder \(brief\): stale \(explained \S+\); run `keylang explain domain\.order\.createOrder --llm --brief`$/m);
});

test("saved explanations are not specs; the store of keylang 0.1 is named with a way to move it", async (t) => {
  const dir = copy(t);
  const mock = await mockAnthropic(t);
  const env = withModel(dir, mock);
  const before = keylang(dir, ["check"]);
  // Read as a spec, an answer that starts a list would be a layer with arguments (K005).
  mock.reply = () => "- Creates an order and returns it.";
  assert.equal((await keylangAsync(dir, ["explain", "domain.order.createOrder", "--llm", "--brief"], env)).status, 0);
  assert.equal((await keylangAsync(dir, ["explain", "domain.order.createOrder", "--llm"], env)).status, 0);
  assert.ok(existsSync(join(dir, "keylang/explain/domain.order.createOrder.md")));
  assert.deepEqual(keylang(dir, ["check"]), before);
  assert.equal(keylang(dir, ["map"]).status, 0);
  assert.match(readFileSync(join(dir, "keylang/map-explained/domain.md"), "utf8"), /^      <br>\\- Creates an order and returns it\. _\(llm/m);
  assert.equal(keylang(dir, ["parse", "keylang/map-explained/domain.md"]).status, 0);

  mkdirSync(join(dir, ".keylang/explain"), { recursive: true });
  writeFileSync(join(dir, ".keylang/explain/app.checkout.md"), "<!-- keylang:explain agent=a:b date=2026-01-01 closure= lang=en detail=short -->\nOld.\n");
  const note = "keylang: note: 1 explanation(s) in .keylang/explain/ are not read any more; move them: mkdir -p keylang/explain && mv .keylang/explain/*.md keylang/explain/\n";
  const explain = keylang(dir, ["explain", "app.checkout"]);
  assert.equal(explain.stderr, note);
  assert.doesNotMatch(explain.stdout, /Old\./);
  assert.match(keylang(dir, ["doctor"], { HOME: dir }).stdout, /^explanations: 1 saved, 1 brief\(s\) in keylang\/explain\/; explained map on \(keylang\.json `explain\.map`\); 1 explanation\(s\) in \.keylang\/explain\/ are not read any more; move them: /m);
});

test("explain --missing --llm: a brief for each node without a doc comment, bottom-up; a layer's prompt carries its modules' briefs; --dry-run asks nothing", async (t) => {
  const dir = copy(t);
  const mock = await mockAnthropic(t);
  const env = withModel(dir, mock);
  mock.reply = (prompt) => `Brief of ${askedId(prompt)}.`;
  const dry = keylang(dir, ["explain", "--missing", "--llm", "--dry-run"], env);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /^would explain 6 node\(s\): 3 fn\/type, 1 class\/module, 2 layer\nestimated tokens: ~\d+ in, ~480 out\n$/);
  assert.equal(mock.prompts.length, 0);
  assert.ok(!existsSync(join(dir, "keylang/explain")));
  assert.equal(keylang(dir, ["explain", "--missing", "--limit", "2"]).stdout, "app.checkout.checkout (fn/type)\ndomain.order.Ledger.size (fn/type)\n");

  const run = await keylangAsync(dir, ["explain", "--missing", "--llm", "--jobs", "2"], env);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, "explained 6 of 6 node(s)\n");
  assert.match(run.stderr, /^\[6\/6\] /m);
  const asked = mock.prompts.map((p) => askedId(p.prompt));
  assert.deepEqual(asked.slice(0, 3).sort(), ["app.checkout.checkout", "domain.order.Ledger.size", "domain.order.createOrder"]);
  assert.equal(asked[3], "domain.money");
  assert.deepEqual(asked.slice(4).sort(), ["app", "domain"]);
  const layer = mock.prompts.find((p) => askedId(p.prompt) === "domain")!.prompt;
  assert.match(layer, /^- module `domain\.money`: Brief of domain\.money\.$/m);
  assert.match(layer, /^- module `domain\.order`: Orders and their totals\. Nothing here does I\/O\.$/m);
  assert.equal(keylang(dir, ["map"]).status, 0);
  assert.match(readFileSync(join(dir, "keylang/map-explained/domain.md"), "utf8"), new RegExp(`^    <br>Brief of domain\\.money\\. _\\(llm · claude-opus-5 · ${today}\\)_$`, "m"));

  const again = await keylangAsync(dir, ["explain", "--missing", "--llm"], env);
  assert.equal(again.stdout, "nothing to explain\n");
  assert.equal(mock.prompts.length, 6);
});

test("explain --missing --llm: a failed node is named with exit 1 and a rerun asks only for it; --stale --llm asks only for stale briefs; no key is exit 2", async (t) => {
  const dir = copy(t);
  const mock = await mockAnthropic(t);
  const env = withModel(dir, mock);
  mock.reply = (prompt) => (askedId(prompt) === "domain.order.createOrder" ? new Error("model is overloaded") : `Brief of ${askedId(prompt)}.`);
  const run = await keylangAsync(dir, ["explain", "--missing", "--llm"], env);
  assert.equal(run.status, 1, run.stderr);
  assert.match(run.stdout, /^explained 5 of 6 node\(s\)\nfailed: domain\.order\.createOrder: .*model is overloaded/);
  assert.equal(readdirSync(join(dir, "keylang/explain/brief")).length, 5, "every other brief is kept");

  mock.prompts.length = 0;
  mock.reply = (prompt) => `Brief of ${askedId(prompt)}.`;
  const rerun = await keylangAsync(dir, ["explain", "--missing", "--llm"], env);
  assert.equal(rerun.status, 0, rerun.stderr);
  assert.deepEqual(mock.prompts.map((p) => askedId(p.prompt)), ["domain.order.createOrder"]);

  // The body of createOrder changes: its brief, its caller's, and both layers' go stale.
  const order = join(dir, "src/domain/order.ts");
  writeFileSync(order, readFileSync(order, "utf8").replace("return { id, total: total(items) };", "return { id: id.trim(), total: total(items) };"));
  mock.prompts.length = 0;
  const stale = await keylangAsync(dir, ["explain", "--stale", "--llm"], env);
  assert.equal(stale.status, 0, stale.stderr);
  assert.deepEqual(mock.prompts.map((p) => askedId(p.prompt)).sort(), ["app", "app.checkout.checkout", "domain", "domain.order.createOrder"]);

  const noKey = keylang(dir, ["explain", "--missing", "--llm"], { ...env, ANTHROPIC_API_KEY: undefined });
  assert.equal(noKey.status, 0, "nothing is missing, so no model is needed");
  const bad = keylang(dir, ["explain", "--missing", "--llm", "--jobs", "0"]);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /--jobs must be a positive whole number, got `0`/);
  rmSync(join(dir, "keylang/explain"), { recursive: true });
  const missingKey = keylang(dir, ["explain", "--missing", "--llm"], { ...env, ANTHROPIC_API_KEY: undefined });
  assert.equal(missingKey.status, 2);
  assert.match(missingKey.stderr, /no Anthropic credentials/);
});
