// Explained map (.scratch/explained-map): documentation comments in the
// snapshot, the second map with explanations, briefs from a model and their
// batch generation, through the real CLI.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
