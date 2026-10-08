// `keylang tour` (business-flows/15): one page for a newcomer, through the
// real CLI on a repository of TypeScript and Python — what the system is,
// layers and modules, business processes with their diagrams, entry points
// and events, integrations, blind spots and «logic in data», and where to
// start reading — deterministic, without a model; `--out` writes a generated
// file `check` does not read; `--json` the same data; the TUI's «Project tour».

import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { keylang, tempDir, treeBytes, writeTree } from "./cli-helpers.ts";
import { checkoutRepo, KEY } from "./tui-fixture.ts";
import { session } from "./tui-helpers.ts";

/** Routes and a payment client in TypeScript, a script with an HTTP client in Python, a hand-written flow, a dynamic call, an environment read. */
const MIXED: Record<string, string> = {
  "keylang.json": JSON.stringify({ languages: ["typescript", "python"], module: "file", layers: { app: ["src/app/**"], shop: ["src/py/**"] } }),
  "README.md": "# Shop\n\nShop takes orders and charges cards. It also fetches tax rates.\n",
  "src/app/README.md": "# app\n\nThe HTTP side of the shop. Routes take and list orders.\n",
  "src/app/pay.ts": '/** Charges the card through the payment API. */\nexport async function charge(total: number): Promise<number> {\n  await fetch("https://api.example.com/v1/charges", { method: "POST" });\n  return total;\n}\n',
  "src/app/server.ts": [
    'import { charge } from "./pay.ts";',
    "const app = { get: (_p: string, ..._h: unknown[]) => 0, post: (_p: string, ..._h: unknown[]) => 0 };",
    "/** Takes an order and charges the card. */",
    "export async function checkout(): Promise<number> {",
    "  return charge(total());",
    "}",
    "/** Lists the orders of the shop. */",
    "export function listOrders(): number {",
    "  const limit = process.env.LIMIT;",
    "  const pick = limit ? Math.max : Math.min;",
    "  return pick(total(), 2);",
    "}",
    "/** Sums the cart. */",
    "export function total(): number {",
    "  return 3;",
    "}",
    'app.post("/checkout", checkout);',
    'app.get("/orders", listOrders);',
    "",
  ].join("\n"),
  "src/py/shop/__init__.py": "",
  "src/py/shop/cli.py": 'import requests\n\n\ndef main() -> int:\n    """Syncs the tax rates from the tax service."""\n    requests.get("https://tax.example.org/rates")\n    return 0\n\n\nif __name__ == "__main__":\n    main()\n',
  "keylang/flows/checkout.md": "# flow checkout\n\n- trigger app.server.checkout\n  - step app.pay.charge\n",
};

interface TourFlow {
  name: string;
  description: string | null;
  trigger: string;
  entry: { kind: string; label: string };
  file: string;
  inView: boolean;
  link: string;
}
interface Tour {
  snapshotId: string;
  system: { name: string | null; brief: string | null; source: string | null; languages: string[]; files: number; fns: number; entries: number };
  layers: { name: string; brief: string | null; files: number; fns: number; modules: number; deps: { in: number; out: number; packages: number }; top: { id: string; file: string | null; fns: number; in: number; out: number }[] }[];
  processes: { source: string; domains: { name: string; processes: { name: string; description: string | null; provenance?: { agent: string; date: string }; flows: TourFlow[] }[] }[]; specified: { name: string; file: string; trigger: string | null; link: string }[] };
  entries: { total: number; kinds: { kind: string; count: number; labels: string[] }[] };
  events: { events: unknown[]; note: string | null };
  integrations: { outgoing: { id: string; sites: number; hosts: string[]; reachedFrom: number }[]; webhooks: unknown[]; queues: { publishers: number; consumers: number; pairs: number } };
  blindSpots: { reach: { fns: number; reachable: number; share: number }; orphans: number; holes: { total: number; modules: { module: string; file: string | null; holes: number; reason: string; read: string }[] }; dataLogic: { total: number; signals: { id: string; count: number; sites: { file: string; line: number; in: string | null }[] }[] } };
  startHere: { id: string; file: string; line: number; flows: number; callers: number; brief: string | null }[];
}

function tour(dir: string, args: string[] = []): { status: number | null; stdout: string; stderr: string } {
  return keylang(dir, ["tour", ...args]);
}

const SECTIONS = ["## 1. What the system is", "## 2. Layers and modules", "## 3. Business processes", "## 4. Entry points and events", "## 5. Integrations", "## 6. Blind spots and logic in data", "## 7. Where to start reading"];

test("tour: all seven sections on a TypeScript and Python repository, the same bytes on a second run, no model and nothing written", (t) => {
  const dir = tempDir(t, "keylang-tour-");
  writeTree(dir, MIXED);
  assert.equal(keylang(dir, ["flows", "discover"]).status, 0);
  const first = tour(dir);
  assert.equal(first.status, 0, first.stderr);
  const before = treeBytes(dir);
  const second = tour(dir);
  assert.equal(second.stdout, first.stdout, "deterministic");
  const after = treeBytes(dir);
  for (const map of [before, after]) for (const path of [...map.keys()]) if (path.startsWith(".keylang/cache/")) map.delete(path);
  assert.deepEqual(after, before, "read-only but the fact cache");

  const md = first.stdout;
  let at = -1;
  for (const heading of SECTIONS) {
    const next = md.indexOf(`\n${heading}\n`);
    assert.ok(next > at, `${heading} in order`);
    at = next;
  }
  // 1: the README's brief and the layer's own README.
  assert.match(md, /Shop takes orders and charges cards\. It also fetches tax rates\. \(README\.md\)/);
  assert.match(md, /typescript, python/);
  // 2: sizes and coupling: app imports nothing from another layer; shop imports a package.
  assert.match(md, /^### app — 2 file\(s\), 4 fn, deps in 0 · out 0 · packages 0$/m);
  assert.match(md, /^The HTTP side of the shop\. Routes take and list orders\.$/m);
  assert.match(md, /^\| `app\.server` \| src\/app\/server\.ts \| 3 \| 0 \| 1 \|$/m);
  assert.match(md, /^### shop — 2 file\(s\), 1 fn, deps in 0 · out 0 · packages 1$/m);
  // 3: the discovered flows with their offline description, diagram link and file; the hand-written flow.
  assert.match(md, /^- \*\*listOrders\*\* — route `GET \/orders` · Lists the orders of the shop\. Sums the cart\. · \[diagram\]\(\/diagrams#view=discovered&name=listOrders\) · `keylang\/flows-discovered\/app\.md`$/m);
  assert.match(md, /^- \*\*main\*\* — main `src\/py\/shop\/cli\.py` · Syncs the tax rates from the tax service\. · \[diagram\]\(\/diagrams#view=discovered&name=main\) · `keylang\/flows-discovered\/shop\.md`$/m);
  assert.match(md, /^- \*\*checkout\*\* · trigger `app\.server\.checkout` · \[diagram\]\(\/diagrams#view=flow&name=checkout\) · `keylang\/flows\/checkout\.md:1`$/m);
  // 4: by kind with the labels; no event nodes: the section says why.
  assert.match(md, /^- main: 1 — `src\/py\/shop\/cli\.py`$/m);
  assert.match(md, /^- route: 2 — `GET \/orders`, `POST \/checkout`$/m);
  assert.match(md, /no event nodes in the snapshot/);
  // 5: outgoing clients with their hosts.
  assert.match(md, /^- \*\*fetch\*\* .*1 call site\(s\) · api\.example\.com · reached from 1 entry point\(s\)$/m);
  assert.match(md, /^- \*\*requests\*\* .*1 call site\(s\) · tax\.example\.org · reached from 1 entry point\(s\)$/m);
  // 6: the hole and the environment read, each with what to read by hand.
  assert.match(md, /^- `app\.server` — 1 hole\(s\), dynamic-call: call through a local value `X` · read `src\/app\/server\.ts`$/m);
  assert.match(md, /^- node-env · .* — 1 · read `src\/app\/server\.ts:9` \(app\.server\.listOrders\)$/m);
  // 7: ranked by flows through a fn, then callers, then ID.
  assert.match(md, /^1\. `app\.server\.total` — src\/app\/server\.ts:14 · 1 flow\(s\), 2 caller\(s\) · Sums the cart\.$/m);
});

test("tour --json: the same data as the page", (t) => {
  const dir = tempDir(t, "keylang-tour-");
  writeTree(dir, MIXED);
  const r = tour(dir, ["--json"]);
  assert.equal(r.status, 0, r.stderr);
  const data = JSON.parse(r.stdout) as Tour;
  assert.equal("text" in data, false);
  assert.match(data.snapshotId, /^[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(data), ["snapshotId", "system", "layers", "processes", "entries", "events", "integrations", "blindSpots", "startHere"]);
  assert.deepEqual([data.system.name, data.system.source, data.system.languages, data.system.fns, data.system.entries], [null, "README.md", ["typescript", "python"], 5, 3]);
  assert.deepEqual(data.layers.map((layer) => [layer.name, layer.files, layer.fns, layer.deps]), [
    ["app", 2, 4, { in: 0, out: 0, packages: 0 }],
    ["shop", 2, 1, { in: 0, out: 0, packages: 1 }],
  ]);
  assert.equal(data.layers[0]!.brief, "The HTTP side of the shop. Routes take and list orders.");
  // No names README: the discovered flows by layer, with the offline description; the view is not written yet.
  assert.equal(data.processes.source, "discovered");
  const flows = data.processes.domains.flatMap((domain) => domain.processes.flatMap((p) => p.flows));
  assert.deepEqual(flows.map((flow) => [flow.name, flow.trigger, flow.file, flow.inView, flow.link]), [
    ["listOrders", "app.server.listOrders", "keylang/flows-discovered/app.md", false, "/diagrams#view=discovered&name=listOrders"],
    ["main", "shop.shop.cli.main", "keylang/flows-discovered/shop.md", false, "/diagrams#view=discovered&name=main"],
  ]);
  assert.deepEqual(data.processes.specified.map((flow) => [flow.name, flow.trigger, flow.link]), [["checkout", "app.server.checkout", "/diagrams#view=flow&name=checkout"]]);
  assert.deepEqual(data.entries.kinds.map((kind) => [kind.kind, kind.count]), [["main", 1], ["route", 2]]);
  assert.deepEqual(data.events.events, []);
  assert.match(data.events.note ?? "", /no event nodes/);
  assert.deepEqual(data.integrations.outgoing.map((integration) => [integration.id, integration.sites, integration.hosts]), [
    ["fetch", 1, ["api.example.com"]],
    ["requests", 1, ["tax.example.org"]],
  ]);
  assert.equal(data.blindSpots.holes.total, 1);
  assert.deepEqual(data.blindSpots.holes.modules.map((m) => [m.module, m.read]), [["app.server", "src/app/server.ts"]]);
  assert.deepEqual(data.blindSpots.dataLogic.signals.map((s) => [s.id, s.count, s.sites[0]?.line]), [["node-env", 1, 9]]);
  assert.ok(data.startHere.length >= 1 && data.startHere.length <= 10);
  assert.deepEqual(data.startHere.slice(0, 2).map((fn) => [fn.id, fn.flows, fn.callers]), [
    ["app.server.total", 1, 2],
    ["app.pay.charge", 1, 1],
  ]);
});

test("tour: business processes from the names README, with their provenance; a flow no process names goes under «Other flows»", (t) => {
  const dir = tempDir(t, "keylang-tour-");
  writeTree(dir, MIXED);
  assert.equal(keylang(dir, ["flows", "discover"]).status, 0);
  writeFileSync(
    join(dir, "keylang/flows-discovered/README.md"),
    [
      "<!-- keylang:generated — не редагувати, `keylang flows discover` -->",
      "",
      "# Business processes",
      "",
      "## Інтеграції",
      "",
      "### Tax sync",
      "",
      "<!-- keylang:llm model=cli:claude:test date=2026-10-07 closure=abc layer=shop -->",
      "",
      "Keeps the tax rates current.",
      "",
      "- in: —",
      "- out: tax rates",
      "- flows: [main](shop.md#flow-main)",
      "",
    ].join("\n"),
  );
  const data = JSON.parse(tour(dir, ["--json"]).stdout) as Tour;
  assert.equal(data.processes.source, "names");
  assert.deepEqual(data.processes.domains.map((domain) => [domain.name, domain.processes.map((p) => [p.name, p.description, p.provenance?.agent ?? null, p.flows.map((f) => f.name)])]), [
    ["Інтеграції", [["Tax sync", "Keeps the tax rates current.", "cli:claude:test", ["main"]]]],
    ["Other flows", [["app", null, null, ["listOrders"]]]],
  ]);
  const md = tour(dir).stdout;
  assert.match(md, /^### Інтеграції$/m);
  assert.match(md, /^#### Tax sync$/m);
  assert.match(md, /^Keeps the tax rates current\. \(model cli:claude:test, 2026-10-07\)$/m);
});

test("tour --out writes a generated file that check does not read; a manual file or a spec path is refused", (t) => {
  const dir = tempDir(t, "keylang-tour-");
  writeTree(dir, MIXED);
  const checked = keylang(dir, ["check"]);
  const out = tour(dir, ["--out", "keylang/tour.md"]);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stdout, "");
  assert.match(out.stderr, /wrote keylang\/tour\.md/);
  const text = readFileSync(join(dir, "keylang/tour.md"), "utf8");
  assert.match(text.split("\n")[0]!, /^<!-- keylang:generated .*keylang tour/);
  assert.equal(text.slice(text.indexOf("\n") + 1), `\n${tour(dir).stdout}`);
  // `check` reads the same specs as before the tour was written: the tour is no spec.
  const again = keylang(dir, ["check"]);
  assert.equal(again.status, checked.status);
  assert.equal(again.stdout, checked.stdout);
  assert.doesNotMatch(again.stdout + again.stderr, /tour\.md/);
  // Written again over its own file.
  assert.equal(tour(dir, ["--out", "keylang/tour.md"]).status, 0);
  // A file someone wrote is not replaced.
  writeFileSync(join(dir, "docs-tour.md"), "# my notes\n");
  const manual = tour(dir, ["--out", "docs-tour.md"]);
  assert.equal(manual.status, 1);
  assert.match(manual.stderr, /docs-tour\.md: manual file without keylang:generated marker/);
  assert.equal(readFileSync(join(dir, "docs-tour.md"), "utf8"), "# my notes\n");
  // A place check would read as a spec is refused.
  const spec = tour(dir, ["--out", "keylang/flows/tour.md"]);
  assert.equal(spec.status, 2);
  assert.match(spec.stderr, /check would read it as a spec/);
});

test("tui: «Project tour» in the palette shows the tour in F6, the same lines as the CLI", async (t) => {
  const root = checkoutRepo(t);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.ctrlP);
  for (const ch of "project tour") s.send(ch);
  assert.match(s.text(), /Project tour: /);
  s.send(KEY.enter);
  await s.app.idle();
  const record = s.app.state.records[0]!;
  assert.equal(record.status, "completed");
  const cli = tour(root);
  assert.equal(cli.status, 0, cli.stderr);
  assert.deepEqual(record.result!.messages.map((m) => m.text), cli.stdout.trimEnd().split("\n"));
  s.send(KEY.f6);
  assert.match(s.text(), /Project tour · a view, check does not read it/);
  s.send("\x1b");
});
