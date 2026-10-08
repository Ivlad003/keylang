// `keylang integrations` (business-flows/14): outgoing clients, incoming
// webhooks and queues, through the real CLI on a repository of TypeScript,
// Python and PHP — call sites with the host of a literal URL, the entry
// points and flows that reach them, `integrations.webhooks` — and the TUI's
// «Integrations».

import assert from "node:assert/strict";
import { test } from "node:test";
import { keylang, tempDir, treeBytes, writeTree } from "./cli-helpers.ts";
import { checkoutRepo, KEY } from "./tui-fixture.ts";
import { session } from "./tui-helpers.ts";

const MIXED: Record<string, string> = {
  "keylang.json": JSON.stringify({ languages: ["typescript", "python", "php"], module: "file", layers: { app: ["src/app/**"], shop: ["src/py/**"], web: ["src/php/**"] }, integrations: { webhooks: ["src/php/Webhook/**"] } }),
  "src/app/pay.ts": [
    'import axios from "axios";',
    'import Stripe from "stripe";',
    "export async function charge(base: string): Promise<number> {",
    '  await fetch("https://api.example.com/v1/charges", { method: "POST" });',
    '  await axios.post(base + "/refunds");',
    '  const stripe = new Stripe("sk_test");',
    "  return stripe ? 1 : 0;",
    "}",
    "",
  ].join("\n"),
  "src/app/server.ts": [
    'import { charge } from "./pay.ts";',
    "const app = { get: (_p: string, ..._h: unknown[]) => 0, post: (_p: string, ..._h: unknown[]) => 0 };",
    "export async function checkout(): Promise<number> {",
    '  return charge("https://x");',
    "}",
    "export function stripeHook(): number {",
    "  return 1;",
    "}",
    'app.post("/checkout", checkout);',
    'app.post("/stripe/webhook", stripeHook);',
    "",
  ].join("\n"),
  "src/py/shop/__init__.py": "",
  "src/py/shop/cli.py": [
    "import requests",
    "from celery import current_app",
    "",
    "",
    "def main() -> int:",
    '    requests.get("https://tax.example.org/rates")',
    '    current_app.send_task("orders.created")',
    "    return 0",
    "",
    "",
    'if __name__ == "__main__":',
    "    main()",
    "",
  ].join("\n"),
  "src/php/Gateway.php": [
    "<?php",
    "namespace Shop;",
    "use GuzzleHttp\\Client;",
    "class Gateway",
    "{",
    "    public function send(string $url): void",
    "    {",
    "        $client = new Client();",
    "        $client->request('POST', 'https://gw.example.net/pay');",
    "        $client->request('GET', $url);",
    "        $h = curl_init($url);",
    "    }",
    "}",
    "",
  ].join("\n"),
  "src/php/Webhook/Notify.php": "<?php\nnamespace Shop\\Webhook;\nclass Notify\n{\n    public function execute(): void\n    {\n    }\n}\n",
  "keylang/flows/checkout.md": "# flow checkout\n\n- trigger app.server.checkout\n",
};

interface Site {
  file: string;
  line: number;
  callee: string;
  in: string | null;
  url: string;
  host: string | null;
  reachedFrom: { kind: string; label: string; id: string; flow: { name: string; source: string } | null }[];
}
interface Report {
  snapshotId: string;
  outgoing: { id: string; kind: string; sites: Site[]; imports: { file: string; line: number; source: string }[] }[];
  webhooks: { via: string; kind: string; label: string; id: string; file: string; glob?: string }[];
  queues: { publishers: { integration: string; topic: string | null; in: string | null }[]; consumers: unknown[]; pairs: unknown[] };
  notes: string[];
}

function integrations(dir: string, args: string[] = []): { status: number | null; stdout: string; stderr: string } {
  return keylang(dir, ["integrations", ...args]);
}

test("integrations: call sites of TS, Python and PHP clients with the literal host, and the entry points and flows that reach them", (t) => {
  const dir = tempDir(t, "keylang-integrations-");
  writeTree(dir, MIXED);
  const r = integrations(dir, ["--json"]);
  assert.equal(r.status, 0, r.stderr);
  const report = JSON.parse(r.stdout) as Report;
  assert.equal("text" in report, false);
  const byId = new Map(report.outgoing.map((integration) => [integration.id, integration]));
  // Grouped in the data file's order.
  assert.deepEqual(report.outgoing.map((integration) => integration.id), ["guzzle", "php-curl", "stripe", "fetch", "axios", "requests", "celery"]);

  const fetch = byId.get("fetch")!.sites;
  assert.deepEqual(fetch.map((site) => [site.file, site.line, site.in, site.url, site.host]), [["src/app/pay.ts", 4, "app.pay.charge", "literal", "api.example.com"]]);
  // charge is reached from POST /checkout, whose hand-written flow is `checkout`.
  assert.deepEqual(fetch[0]!.reachedFrom, [{ kind: "route", label: "POST /checkout", id: "app.server.checkout", flow: { name: "checkout", source: "spec" } }]);
  // A URL built at run time is dynamic; an SDK constructor names no URL.
  assert.deepEqual(byId.get("axios")!.sites.map((site) => [site.callee, site.url, site.host]), [["axios.post", "dynamic", null]]);
  assert.deepEqual(byId.get("stripe")!.sites.map((site) => [site.callee, site.url]), [["Stripe", "n/a"]]);
  assert.deepEqual(byId.get("stripe")!.imports, [{ file: "src/app/pay.ts", line: 2, source: "stripe" }]);

  // Python: reached from the `__main__` block's main, with the flow `flows discover` would draft.
  const requests = byId.get("requests")!.sites;
  assert.deepEqual(requests.map((site) => [site.callee, site.host, site.in]), [["requests.get", "tax.example.org", "shop.shop.cli.main"]]);
  assert.deepEqual(requests[0]!.reachedFrom.map((reach) => [reach.kind, reach.id, reach.flow]), [["main", "shop.shop.cli.main", { name: "main", source: "discovered" }]]);

  // PHP: Guzzle through the imported class and its instance, cURL by name; nothing reaches the gateway.
  assert.deepEqual(byId.get("guzzle")!.sites.map((site) => [site.line, site.callee, site.url, site.host, site.reachedFrom.length]), [
    [8, "Client", "n/a", null, 0],
    [9, "client.request", "literal", "gw.example.net", 0],
    [10, "client.request", "dynamic", null, 0],
  ]);
  assert.deepEqual(byId.get("php-curl")!.sites.map((site) => [site.callee, site.url, site.in]), [["curl_init", "dynamic", "web.Gateway.Gateway.send"]]);

  // Webhooks: a route whose path names one, and the handler of a file `integrations.webhooks` names.
  assert.deepEqual(report.webhooks.map((hook) => [hook.via, hook.kind, hook.label, hook.id, hook.glob ?? null]), [
    ["path", "route", "POST /stripe/webhook", "app.server.stripeHook", null],
    ["config", "fn", "execute", "web.Webhook.Notify.Notify.execute", "src/php/Webhook/**"],
  ]);
  // Queues: the publisher with its literal topic; no consumer without a framework adapter.
  assert.deepEqual(report.queues.publishers, [{ integration: "celery", file: "src/py/shop/cli.py", line: 7, in: "shop.shop.cli.main", topic: "orders.created" }]);
  assert.deepEqual(report.queues.consumers, []);
  assert.ok(report.notes.some((note) => /host is read from the source text/.test(note)));

  const text = integrations(dir);
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /^outgoing: 7 integration\(s\), 9 call site\(s\)/m);
  assert.match(text.stdout, /^ {4}src\/app\/pay\.ts:4 {2}app\.pay\.charge {2}fetch {2}api\.example\.com\n {6}← route POST \/checkout \(app\.server\.checkout\) · flow checkout$/m);
  assert.match(text.stdout, /← main src\/py\/shop\/cli\.py \(shop\.shop\.cli\.main\) · flow main \(discovered\)/);
  assert.match(text.stdout, /^ {4}src\/php\/Gateway\.php:10 {2}web\.Gateway\.Gateway\.send {2}client\.request {2}dynamic URL\n {6}← no entry point reaches it$/m);
  assert.match(text.stdout, /^incoming webhooks: 2$/m);
  assert.match(text.stdout, /^ {2}publish orders\.created {2}celery {2}src\/py\/shop\/cli\.py:7/m);
});

test("integrations: --json is the same bytes for the same inputs and only the fact cache is written", (t) => {
  const dir = tempDir(t, "keylang-integrations-");
  writeTree(dir, MIXED);
  const first = integrations(dir, ["--json"]);
  const before = treeBytes(dir);
  const second = integrations(dir, ["--json"]);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(second.stdout, first.stdout);
  const after = treeBytes(dir);
  for (const map of [before, after]) for (const path of [...map.keys()]) if (path.startsWith(".keylang/cache/")) map.delete(path);
  assert.deepEqual(after, before);
});

test("integrations: `integrations.webhooks` must be an array of globs; the error names the field", (t) => {
  const dir = tempDir(t, "keylang-integrations-");
  writeTree(dir, { "src/a.ts": "export const a = 1;\n", "keylang.json": JSON.stringify({ languages: ["typescript"], integrations: { webhooks: "src/**" } }) });
  const wrong = integrations(dir);
  assert.equal(wrong.status, 2);
  assert.match(wrong.stderr, /keylang\.json: `integrations\.webhooks` must be an array of globs, got "src\/\*\*"/);
  writeTree(dir, { "keylang.json": JSON.stringify({ languages: ["typescript"], integrations: { hooks: [] } }) });
  const unknown = integrations(dir);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /unknown field `integrations\.hooks`/);
});

test("integrations: a repository without clients says so and exits 0", (t) => {
  const dir = tempDir(t, "keylang-integrations-");
  writeTree(dir, { "keylang.json": JSON.stringify({ languages: ["rust"], module: "file", layers: { core: ["src/**"] } }), "src/lib.rs": "pub fn add(a: u32, b: u32) -> u32 {\n    a + b\n}\n" });
  const r = integrations(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^outgoing: 0 integration\(s\), 0 call site\(s\)/m);
  assert.match(r.stdout, /^incoming webhooks: 0$/m);
});

test("tui: «Integrations» in the palette shows the inventory, the same lines as the CLI", async (t) => {
  const root = checkoutRepo(t, {
    "src/infrastructure/http.ts": 'export async function ping(): Promise<number> {\n  await fetch("https://status.example.com/ping");\n  return 1;\n}\n',
  });
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.ctrlP);
  // `integrations` alone also names Doctor (agent integrations): the webhooks word picks this one.
  for (const ch of "integrations webhooks") s.send(ch);
  assert.match(s.text(), /Integrations: outgoing clients/);
  s.send(KEY.enter);
  await s.app.idle();
  const record = s.app.state.records[0]!;
  assert.equal(record.status, "completed");
  const cli = integrations(root);
  assert.equal(cli.status, 0, cli.stderr);
  assert.deepEqual(record.result!.messages.map((m) => m.text), cli.stdout.trimEnd().split("\n"));
  assert.match(cli.stdout, /src\/infrastructure\/http\.ts:2 {2}infrastructure\.http\.ping {2}fetch {2}status\.example\.com/);
  s.send(KEY.f6);
  assert.match(s.text(), /Integrations · a view, nothing is contacted/);
  assert.match(s.text(), /fetch {2}fetch {2}status\.example\.com/);
  s.send("\x1b");
});
