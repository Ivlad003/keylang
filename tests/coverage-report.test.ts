// `keylang coverage` (business-flows/13): where keylang does not see, through
// the real CLI on a repository of TypeScript, Python and PHP — reach from
// entry points, orphans, holes by module and normalised reason, entry points
// without a hand-written flow, «logic in data» — and the TUI's «Blind spots».

import assert from "node:assert/strict";
import { test } from "node:test";
import { normaliseReason } from "../src/coverage-report.ts";
import { isTestFile, urlOf, lineStarts } from "../src/call-sites.ts";
import { keylang, tempDir, treeBytes, writeTree } from "./cli-helpers.ts";
import { checkoutRepo, KEY } from "./tui-fixture.ts";
import { session } from "./tui-helpers.ts";

/** TypeScript routes, a Python script and a PHP class: an orphan in each language, holes, readers of configuration, a test file. */
const MIXED: Record<string, string> = {
  "keylang.json": JSON.stringify({ languages: ["typescript", "python", "php"], module: "file", layers: { app: ["src/app/**"], shop: ["src/py/**"], web: ["src/php/**"] } }),
  "src/app/server.ts": [
    "const app = { get: (_p: string, ..._h: unknown[]) => 0, post: (_p: string, ..._h: unknown[]) => 0 };",
    "export function listOrders(): number {",
    "  const url = process.env.API_URL;",
    "  return helper(url);",
    "}",
    "function helper(u: string | undefined): number {",
    "  const pick = (u ? Math.max : Math.min);",
    "  return pick(1, 2);",
    "}",
    "export function checkout(): number {",
    "  return 1;",
    "}",
    "export function orphanTs(): number {",
    "  return 2;",
    "}",
    'app.get("/orders", listOrders);',
    'app.post("/checkout", checkout);',
    "",
  ].join("\n"),
  "src/py/shop/__init__.py": "",
  "src/py/shop/cli.py": [
    "import os",
    "from django.conf import settings",
    "",
    "",
    "def main() -> int:",
    '    level = os.getenv("LEVEL")',
    "    return settings.RETRIES",
    "",
    "",
    "def dead_py() -> int:",
    "    return 1",
    "",
    "",
    'if __name__ == "__main__":',
    "    main()",
    "",
  ].join("\n"),
  "src/php/Pay.php": [
    "<?php",
    "namespace Shop;",
    "use Magento\\Framework\\App\\Config\\ScopeConfigInterface;",
    "class Pay",
    "{",
    "    private $scopeConfig;",
    "    public function __construct(ScopeConfigInterface $scopeConfig)",
    "    {",
    "        $this->scopeConfig = $scopeConfig;",
    "    }",
    "    public function active(): bool",
    "    {",
    "        $handler = $this->pick();",
    "        $handler();",
    "        return (bool) $this->scopeConfig->getValue('payment/shop/active');",
    "    }",
    "}",
    "",
  ].join("\n"),
  // Test helpers outside the default exclusions (Magento's `Test/` directories): no orphans.
  "src/app/Test/helpers.ts": "export function fixtureHelper(): number {\n  return 0;\n}\n",
  "keylang/flows/checkout.md": "# flow checkout\n\n- trigger app.server.checkout\n",
};

function coverage(dir: string, args: string[] = []): { status: number | null; stdout: string; stderr: string } {
  return keylang(dir, ["coverage", ...args]);
}

interface Report {
  snapshotId: string;
  reach: { fns: number; reachable: number; share: number; entries: number; tests: number };
  orphans: { id: string; file: string; line: number; callers: number; escapes: string | null }[];
  holes: { total: number; modules: { module: string; file: string | null; holes: number; reasons: { kind: string; reason: string; count: number }[] }[]; reasons: { kind: string; reason: string; count: number }[] };
  unflowed: { kind: string; label: string; id: string; discovered: { name: string; file: string; inView: boolean } | null }[];
  dataLogic: { signals: { id: string; label: string; count: number }[]; sites: { signal: string; file: string; line: number; text: string; in: string | null }[] };
}

test("coverage: an orphan, a hole, an entry point without a flow and logic in data each land in their own section (TS, Python, PHP)", (t) => {
  const dir = tempDir(t, "keylang-coverage-");
  writeTree(dir, MIXED);
  const r = coverage(dir, ["--json"]);
  assert.equal(r.status, 0, r.stderr);
  const report = JSON.parse(r.stdout) as Report;
  assert.match(report.snapshotId, /^[0-9a-f]{64}$/);
  assert.equal("text" in report, false, "--json is the report without the CLI's text");

  // (1) Reach: the entry fns and what they call; the fn of the test file is left out.
  assert.equal(report.reach.entries, 3);
  assert.equal(report.reach.tests, 1);
  const orphanIds = report.orphans.map((orphan) => orphan.id);
  // (2) Orphans in every language; entry fns, what they reach and test files are not.
  for (const id of ["app.server.orphanTs", "shop.shop.cli.dead_py", "web.Pay.Pay.active"]) assert.ok(orphanIds.includes(id), `${id} in ${orphanIds.join(", ")}`);
  for (const id of ["app.server.listOrders", "app.server.helper", "app.server.checkout", "shop.shop.cli.main", "app.Test.helpers.fixtureHelper"]) assert.ok(!orphanIds.includes(id), id);
  assert.equal(report.reach.reachable, 4);
  assert.equal(report.reach.fns, report.reach.reachable + report.orphans.length);
  assert.equal(report.reach.share, Math.round((4 / report.reach.fns) * 10000) / 10000);
  assert.deepEqual(report.orphans, [...report.orphans].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line)));

  // (3) Holes by module, reasons normalised: the PHP `$handler()` and the TS `pick(…)` through a local value.
  const php = report.holes.modules.find((module) => module.module === "web.Pay");
  assert.ok(php, JSON.stringify(report.holes.modules));
  assert.equal(php.file, "src/php/Pay.php");
  assert.ok(php.reasons.every((reason) => !/`(?!X`)[^`]+`/.test(reason.reason)), "every backticked name is X");
  const ts = report.holes.modules.find((module) => module.module === "app.server");
  assert.deepEqual(ts?.reasons, [{ kind: "dynamic-call", reason: "call through a local value `X`", count: 1 }]);
  assert.equal(report.holes.total, report.holes.modules.reduce((sum, module) => sum + module.holes, 0));
  assert.ok(report.holes.modules.every((module, i, all) => i === 0 || all[i - 1]!.holes >= module.holes), "most holes first");

  // (4) Entry points without a hand-written flow: `checkout` has one; the others have a discovered flow not yet in the view.
  assert.deepEqual(report.unflowed.map((entry) => entry.id), ["shop.shop.cli.main", "app.server.listOrders"]);
  assert.deepEqual(report.unflowed.map((entry) => entry.discovered), [{ name: "main", file: "shop.md", inView: false }, { name: "listOrders", file: "app.md", inView: false }]);

  // (5) Logic in data: Magento's ScopeConfigInterface, Django settings, os.getenv, process.env.
  const sites = report.dataLogic.sites.map((site) => `${site.signal} ${site.file}:${site.line} ${site.in} ${site.text}`);
  assert.deepEqual(sites, [
    "magento-scope-config src/php/Pay.php:15 web.Pay.Pay.active this.scopeConfig.getValue",
    "django-settings src/py/shop/cli.py:7 shop.shop.cli.main settings.RETRIES",
    "python-env src/py/shop/cli.py:6 shop.shop.cli.main os.getenv",
    "node-env src/app/server.ts:3 app.server.listOrders process.env",
  ]);
  assert.deepEqual(report.dataLogic.signals.map((signal) => [signal.id, signal.count]), [["magento-scope-config", 1], ["django-settings", 1], ["python-env", 1], ["node-env", 1]]);

  // The text has the five sections; exit 0.
  const text = coverage(dir);
  assert.equal(text.status, 0, text.stderr);
  for (const heading of [/^reach: 4 of \d+ fn reachable from 3 entry point\(s\)/m, /^orphans: \d+ fn no entry point reaches/m, /^holes: \d+ unresolved place\(s\)/m, /^entry points without a hand-written flow: 2$/m, /^logic in data — check by hand: 4 call\(s\)/m]) assert.match(text.stdout, heading);
  assert.match(text.stdout, /^ {2}app\.server\.orphanTs {2}src\/app\/server\.ts:13 {2}no caller$/m);
  assert.match(text.stdout, /^ {4}src\/php\/Pay\.php:15 {2}web\.Pay\.Pay\.active {2}this\.scopeConfig\.getValue$/m);
});

test("coverage: --json is the same bytes for the same inputs; writes nothing but the fact cache; a discovered flow in the view is named", (t) => {
  const dir = tempDir(t, "keylang-coverage-");
  writeTree(dir, MIXED);
  const first = coverage(dir, ["--json"]);
  const before = treeBytes(dir);
  const second = coverage(dir, ["--json"]);
  assert.equal(second.stdout, first.stdout);
  const after = treeBytes(dir);
  for (const map of [before, after]) for (const path of [...map.keys()]) if (path.startsWith(".keylang/cache/")) map.delete(path);
  assert.deepEqual(after, before);
  assert.ok(![...after.keys()].some((path) => path.startsWith("keylang/map") || path.startsWith("keylang/flows-discovered")), "coverage writes no view");

  const discovered = keylang(dir, ["flows", "discover"]);
  assert.equal(discovered.status, 0, discovered.stderr);
  const report = JSON.parse(coverage(dir, ["--json"]).stdout) as Report;
  assert.deepEqual(report.unflowed.map((entry) => entry.discovered?.inView), [true, true]);
  assert.match(coverage(dir).stdout, /discovered flow listOrders in keylang\/flows-discovered\/app\.md/);
});

test("coverage: without entry points every fn is an orphan and the report says where entry points come from", (t) => {
  const dir = tempDir(t, "keylang-coverage-");
  writeTree(dir, { "keylang.json": JSON.stringify({ languages: ["python"], module: "file", layers: { lib: ["lib/**"] } }), "lib/calc.py": "def add(a, b):\n    return a + b\n" });
  const r = coverage(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^reach: 0 of 1 fn reachable from 0 entry point\(s\) over resolved calls \(0\.0 %\)$/m);
  assert.match(r.stdout, /no entry points: see `keylang entries`/);
  assert.match(r.stdout, /^ {2}lib\.calc\.add {2}lib\/calc\.py:1 {2}no caller$/m);
  assert.match(r.stdout, /^logic in data — check by hand: 0 call\(s\)/m);
});

test("coverage: a broken keylang.json is exit 2 naming the file", (t) => {
  const dir = tempDir(t, "keylang-coverage-");
  writeTree(dir, { "keylang.json": "{", "src/a.ts": "export const a = 1;\n" });
  const r = coverage(dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /keylang\.json: invalid JSON/);
});

test("coverage: reasons normalise their names, test files are recognised, a call's URL is read from its first arguments", () => {
  assert.equal(normaliseReason("call through a local value `s.charges.create`"), "call through a local value `X`");
  assert.equal(normaliseReason("shadowed by local `fetch` and `x`"), "shadowed by local `X` and `X`");
  for (const path of ["tests/a.ts", "src/__tests__/a.ts", "src/a.test.ts", "pkg/test_x.py", "pkg/x_test.py", "Test/Unit/PayTest.php", "src/spec/a.ts"]) assert.equal(isTestFile(path), true, path);
  for (const path of ["src/a.ts", "src/testing.py", "src/Pay.php", "src/latest/x.ts"]) assert.equal(isTestFile(path), false, path);
  const url = (source: string, callee: string): ReturnType<typeof urlOf> => urlOf(source, lineStarts(source), 1, 1, callee);
  assert.deepEqual(url('fetch("https://api.example.com/orders")', "fetch"), { url: "literal", host: "api.example.com" });
  assert.deepEqual(url("$c->request('GET', 'https://tax.example.net:8443/rate');", "c.request"), { url: "literal", host: "tax.example.net" });
  assert.deepEqual(url("requests.post(f\"https://pay.example.org/{id}\", json={})", "requests.post"), { url: "literal", host: "pay.example.org" });
  assert.deepEqual(url("axios.get(base + '/x')", "axios.get"), { url: "dynamic", host: null });
  assert.deepEqual(url("$client->request('POST', $url)", "client.request"), { url: "dynamic", host: null });
  assert.deepEqual(url('new Stripe("sk_test")', "Stripe"), { url: "n/a", host: null });
  assert.deepEqual(url("curl_init()", "curl_init"), { url: "n/a", host: null });
  assert.deepEqual(url('reqwest::get::<String>("https://r.example.com")', "reqwest::get"), { url: "literal", host: "r.example.com" });
  assert.deepEqual(url("httpx.get(\n    url=\"https://h.example.com/a\",\n)", "httpx.get"), { url: "literal", host: "h.example.com" });
});

test("tui: «Blind spots» in the palette shows the coverage report, the same lines as the CLI", async (t) => {
  const root = checkoutRepo(t, {
    "src/presentation/handlers.ts": "export function listOrders(): string[] {\n  return [];\n}\nexport function unused(): number {\n  return 1;\n}\n",
    "src/presentation/server.ts": 'import { listOrders } from "./handlers.ts";\nconst app = { get: (_p: string, _h: unknown) => 0 };\napp.get("/orders", listOrders);\n',
  });
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.ctrlP);
  for (const ch of "blind spots") s.send(ch);
  assert.match(s.text(), /Blind spots: unreached fns/);
  s.send(KEY.enter);
  await s.app.idle();
  assert.equal(s.app.state.records.length, 1);
  const record = s.app.state.records[0]!;
  assert.equal(record.status, "completed");
  assert.equal(record.result?.exitCode, 0);
  const cli = coverage(root);
  assert.equal(cli.status, 0, cli.stderr);
  assert.deepEqual(record.result!.messages.map((m) => m.text), cli.stdout.trimEnd().split("\n"));
  assert.match(cli.stdout, /presentation\.handlers\.unused {2}src\/presentation\/handlers\.ts:4 {2}no caller/);
  s.send(KEY.f6);
  assert.match(s.text(), /Blind spots · a view, check does not read it/);
  assert.match(s.text(), /orphan {2}presentation\.handlers\.unused/);
  s.send("\x1b");
});
