// Migration between stacks (business-flows/27) through the real CLI and
// MCP, on two repositories: an old PHP one shaped like Magento (QuoteManagement
// → OrderService, a cURL call in the refund) and a new TypeScript storefront
// with a `# migration magento` table. `check` judges the rows (K001 on the
// new side, the old side against `migration.from`, K005 for `dropped`
// without a reason); `migration status` gives one flow with parity ok (the
// same test name passing in both reports), one without a counterpart (fail,
// listed as not migrated with its integration) and one without tests
// (unverified); the old stack read from its directory (read-only), from
// `map --export-index`, from a plain `.keylang/index.json`; deterministic
// `--json`. Never a model or the network.

import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { migrationStatus, type Stack } from "../src/migration.ts";
import { bin, keylang, tempDir, treeBytes, writeTree } from "./cli-helpers.ts";

const PLACE = "quote.Model.QuoteManagement.QuoteManagement.placeOrder";
const SERVICE = "sales.Model.OrderService.OrderService";

/** The old stack: PHP, Magento-shaped; three hand-written flows, the first and second with tests. */
const OLD: Record<string, string> = {
  "keylang.json": JSON.stringify({ languages: ["php"], layers: { quote: ["app/code/Quote/**"], sales: ["app/code/Sales/**"] }, check: { tests: ".keylang/reports/*.json" } }),
  "app/code/Quote/Model/QuoteManagement.php":
    "<?php\nnamespace Magento\\Quote\\Model;\n\nuse Magento\\Sales\\Model\\OrderService;\n\nclass QuoteManagement\n{\n    private OrderService $orders;\n\n    public function __construct(OrderService $orders)\n    {\n        $this->orders = $orders;\n    }\n\n    /** Places the order for a cart. */\n    public function placeOrder(int $cartId): int\n    {\n        return $this->orders->place($cartId);\n    }\n}\n",
  "app/code/Sales/Model/OrderService.php":
    "<?php\nnamespace Magento\\Sales\\Model;\n\nclass OrderService\n{\n    public function place(int $cartId): int\n    {\n        return $cartId;\n    }\n\n    public function refund(int $orderId): bool\n    {\n        $ch = curl_init('https://pay.example.com/refund');\n        return curl_exec($ch) !== false;\n    }\n\n    public function dailyReport(): array\n    {\n        return [];\n    }\n}\n",
  "keylang/flows/checkout.md": `# flow checkout\n\n- trigger ${PLACE}\n  - step ${SERVICE}.place\n    - test app/code/Quote/Test/Unit/QuoteManagementTest.php "places an order"\n`,
  "keylang/flows/refund.md": `# flow refund\n\n- trigger ${SERVICE}.refund\n  - test app/code/Sales/Test/Unit/OrderServiceTest.php "refunds an order"\n`,
  "keylang/flows/report.md": `# flow report\n\n- trigger ${SERVICE}.dailyReport\n`,
};

const TABLE = `# migration magento\n\n- map ${PLACE} → storefront.checkout.placeOrder\n- map ${SERVICE}.place → orders.service.place\n- map ${SERVICE}.dailyReport → orders.service.dailyReport\n`;

/** The new stack: TypeScript, a storefront; checkout with the same test name, a daily report without tests, the table. */
function newFiles(from: string | null): Record<string, string> {
  return {
    "keylang.json": JSON.stringify({ languages: ["typescript"], module: "file", layers: { storefront: ["src/storefront/**"], orders: ["src/orders/**"] }, check: { tests: ".keylang/reports/*.json" }, ...(from === null ? {} : { migration: { from } }) }),
    "src/storefront/checkout.ts": 'import { place } from "../orders/service.ts";\n/** Places the order for a cart. */\nexport function placeOrder(cartId: number): number {\n  return place(cartId);\n}\n',
    "src/orders/service.ts": "export function place(cartId: number): number {\n  return cartId;\n}\nexport function dailyReport(): string[] {\n  return [];\n}\n",
    "keylang/flows/checkout.md": '# flow checkout\n\n- trigger storefront.checkout.placeOrder\n  - step orders.service.place\n    - test tests/checkout.test.ts "places an order"\n',
    "keylang/flows/daily-report.md": "# flow daily-report\n\n- trigger orders.service.dailyReport\n",
    "keylang/migration.md": TABLE,
  };
}

function snapshotIdOf(dir: string): string {
  const r = keylang(dir, ["map"]);
  assert.equal(r.status, 0, r.stderr);
  return (JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as { snapshotId: string }).snapshotId;
}

function report(dir: string, snapshotId: string, tests: { file: string; name: string; status: string }[]): void {
  writeTree(dir, { ".keylang/reports/tests.json": JSON.stringify({ schemaVersion: 1, snapshotId, runId: "r1", tests }) });
}

/** Both repositories with their maps and test reports: both checkout tests pass, the old refund test passes. */
function setup(t: TestContext, withFrom = false): { old: string; next: string } {
  const old = tempDir(t, "keylang-migration-old-");
  writeTree(old, OLD);
  report(old, snapshotIdOf(old), [
    { file: "app/code/Quote/Test/Unit/QuoteManagementTest.php", name: "places an order", status: "pass" },
    { file: "app/code/Sales/Test/Unit/OrderServiceTest.php", name: "refunds an order", status: "pass" },
  ]);
  const next = tempDir(t, "keylang-migration-new-");
  writeTree(next, newFiles(withFrom ? old : null));
  report(next, snapshotIdOf(next), [{ file: "tests/checkout.test.ts", name: "places an order", status: "pass" }]);
  return { old, next };
}

type Status = {
  from: string;
  flows: { name: string; source: string; verdict: string; reasons: string[]; counterpart: { name: string; by: string } | null; steps: { old: string; status: string }[]; tests: { name: string; old: { verdict: string }; new: { verdict: string } | null }[] }[];
  counts: { ok: number; fail: number; unverified: number };
  notMigrated: { flows: { name: string }[]; entries: unknown[]; integrations: { id: string; kind: string }[] };
  withoutTests: string[];
  notes: string[];
};

function verdicts(status: Status): [string, string, string | null][] {
  return status.flows.map((flow) => [flow.name, flow.verdict, flow.counterpart?.name ?? null]);
}

test("migration status --from <old dir>: checkout ok by the same test name, refund without a counterpart fails, report without tests unverified; the old repository is not written", (t) => {
  const { old, next } = setup(t);
  const before = treeBytes(old);
  const r = keylang(next, ["migration", "status", "--from", old, "--json"]);
  assert.equal(r.status, 1, r.stderr + r.stdout);
  const status = JSON.parse(r.stdout) as Status;
  assert.deepEqual(verdicts(status), [
    ["checkout", "ok", "checkout"],
    ["refund", "fail", null],
    ["report", "unverified", "daily-report"],
  ]);
  const checkout = status.flows[0]!;
  assert.equal(checkout.counterpart?.by, "trigger");
  assert.deepEqual(checkout.steps.map((step) => [step.old, step.status]), [[PLACE, "mapped"], [`${SERVICE}.place`, "mapped"]]);
  assert.deepEqual(checkout.tests.map((item) => [item.name, item.old.verdict, item.new?.verdict]), [["places an order", "ok", "ok"]]);
  assert.deepEqual(status.flows[1]!.reasons.includes("no counterpart flow in the new stack"), true);
  assert.ok(status.flows[2]!.reasons.includes("the old flow has no tests"), status.flows[2]!.reasons.join("; "));
  assert.deepEqual(status.counts, { ok: 1, fail: 1, unverified: 1 });
  assert.deepEqual(status.notMigrated.flows.map((flow) => flow.name), ["refund"]);
  assert.deepEqual(status.notMigrated.integrations.map((item) => [item.id, item.kind]), [["php-curl", "http"]]);
  assert.deepEqual(status.withoutTests, ["report"]);
  assert.deepEqual(status.notes, []);
  assert.equal(treeBytes(old).size, before.size);
  assert.deepEqual([...treeBytes(old)], [...before], "the old repository is read, never written");

  const text = keylang(next, ["migration", "status", "--from", old]);
  assert.equal(text.status, 1);
  assert.match(text.stdout, /^ok\s+checkout\s+spec\s+→ checkout \(spec, by trigger\)$/m);
  assert.match(text.stdout, /^fail\s+refund\s+spec\s+no counterpart$/m);
  assert.match(text.stdout, /^not migrated yet:\n {2}flow refund \(spec\)\n {2}integration php-curl \(http\)/m);
  assert.match(text.stdout, /^1 fail, 1 unverified, 1 ok$/m);
});

test("migration status: a failing shared test in the new report fails the flow; a failing old one leaves it unverified", (t) => {
  const { old, next } = setup(t);
  const id = (JSON.parse(readFileSync(join(next, ".keylang/index.json"), "utf8")) as { snapshotId: string }).snapshotId;
  report(next, id, [{ file: "tests/checkout.test.ts", name: "places an order", status: "fail" }]);
  const failed = JSON.parse(keylang(next, ["migration", "status", "--from", old, "--json"]).stdout) as Status;
  assert.equal(failed.flows[0]!.verdict, "fail");
  assert.match(failed.flows[0]!.reasons[0]!, /^test "places an order" fails in the new stack/);
  report(next, id, [{ file: "tests/checkout.test.ts", name: "places an order", status: "pass" }]);
  const oldId = (JSON.parse(readFileSync(join(old, ".keylang/index.json"), "utf8")) as { snapshotId: string }).snapshotId;
  report(old, oldId, [{ file: "app/code/Quote/Test/Unit/QuoteManagementTest.php", name: "places an order", status: "fail" }]);
  const shaky = JSON.parse(keylang(next, ["migration", "status", "--from", old, "--json"]).stdout) as Status;
  assert.equal(shaky.flows[0]!.verdict, "unverified");
  assert.match(shaky.flows[0]!.reasons.join("\n"), /test "places an order" in the old stack: failed in/);
});

test("map --export-index: the old stack as one file gives the same parity as its directory, byte for byte apart from `from`; --json is deterministic", (t) => {
  const { old, next } = setup(t);
  const exported = join(next, "old-index.json");
  const r = keylang(old, ["map", "--export-index", exported]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /wrote .*old-index\.json/);
  const body = JSON.parse(readFileSync(exported, "utf8")) as { snapshotId: string; nodes: object; migration: { schema: number; flows: { name: string; source: string }[]; tests: unknown[] } };
  assert.equal(body.migration.schema, 1);
  assert.deepEqual(body.migration.flows.map((flow) => [flow.name, flow.source]), [["checkout", "spec"], ["refund", "spec"], ["report", "spec"]]);
  assert.equal(body.migration.tests.length, 2);
  const fromFile = keylang(next, ["migration", "status", "--from", "old-index.json", "--json"]);
  assert.equal(fromFile.status, 1, fromFile.stderr);
  const again = keylang(next, ["migration", "status", "--from", "old-index.json", "--json"]);
  assert.equal(again.stdout, fromFile.stdout, "deterministic");
  const fromDir = keylang(next, ["migration", "status", "--from", old, "--json"]);
  const strip = (text: string): object => ({ ...(JSON.parse(text) as Status), from: "" });
  assert.deepEqual(strip(fromFile.stdout), strip(fromDir.stdout));
  assert.equal((JSON.parse(fromFile.stdout) as Status).from, "old-index.json");
  assert.equal(keylang(old, ["map", "--check", "--export-index", exported]).status, 2);
});

test("migration status --from a plain .keylang/index.json: flows only as discovered drafts, with a note; no old stack at all is exit 2", (t) => {
  const { old, next } = setup(t);
  const plain = keylang(next, ["migration", "status", "--from", join(old, ".keylang/index.json"), "--json"]);
  assert.equal(plain.status, 0, plain.stderr);
  const status = JSON.parse(plain.stdout) as Status;
  assert.deepEqual(status.flows, [], "PHP without a framework adapter has no entry points to draft from");
  assert.match(status.notes.join("\n"), /plain index\.json/);
  assert.match(status.notes.join("\n"), /integrations are unknown/);
  const none = keylang(next, ["migration", "status"]);
  assert.equal(none.status, 2);
  assert.match(none.stderr, /no old stack: pass `--from/);
  assert.equal(keylang(next, ["migration", "parity"]).status, 2);
});

test("check: the new side of a row is a reference (K001 unless code or a planned has it); the old side resolves against migration.from; dropped without a reason is K005", (t) => {
  const { old, next } = setup(t, true);
  writeTree(next, {
    "keylang/migration.md": `${TABLE}- map ${SERVICE}.cancel → orders.service.cancel\n- map ${SERVICE}.refund → planned orders.service.refund\n- map ${SERVICE}.refund → planned orders.service.refundLater\n- dropped ${SERVICE}.dailyReport\n- dropped quote.Model.Legacy.gone no longer sold\n`,
    "keylang/features/refund.md": "# flow refund\n\n- planned fn orders.service.refund (orderId: number) → boolean\n\n- trigger orders.service.refund\n",
  });
  const r = keylang(next, ["check"]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const lines = r.stdout.split("\n").filter((line) => line.startsWith("keylang/migration.md"));
  const at = (line: number): string[] => lines.filter((item) => item.startsWith(`keylang/migration.md:${line}:`));
  for (const line of [3, 4, 5]) assert.match(at(line).join("\n"), new RegExp(`:${line}:7: migration ok \\S+: in the old snapshot ${old.replaceAll("/", "\\/")}`), `row ${line}`);
  assert.match(at(6).join("\n"), /:6:7: K001 dangling reference `sales\.Model\.OrderService\.OrderService\.cancel` in the old stack/);
  assert.match(at(6).join("\n"), /:6:\d+: K001 dangling reference `orders\.service\.cancel`/);
  assert.doesNotMatch(at(7).join("\n"), /K001/, "a planned declaration answers the new side");
  assert.match(at(8).join("\n"), /K001 dangling reference `orders\.service\.refundLater`/);
  assert.match(at(9).join("\n"), /K005 expected `dropped <id> <reason>`/);
  assert.match(at(10).join("\n"), /K001 dangling reference `quote\.Model\.Legacy\.gone` in the old stack/);

  // Without migration.from the old side stays unverified, and says why.
  writeTree(next, { "keylang.json": newFiles(null)["keylang.json"]!, "keylang/migration.md": TABLE });
  const bare = keylang(next, ["check", "keylang/migration.md"]);
  assert.match(bare.stdout, /keylang\/migration\.md:3:7: migration unverified quote\.Model\.QuoteManagement\.QuoteManagement\.placeOrder: no old snapshot \(set `migration\.from` in keylang\.json\)/);
  assert.doesNotMatch(bare.stdout, /K001/);
  // A broken migration.from is a reason, not a crash.
  writeFileSync(join(next, "keylang.json"), JSON.stringify({ ...JSON.parse(newFiles(null)["keylang.json"]!), migration: { from: "nowhere" } }));
  assert.match(keylang(next, ["check", "keylang/migration.md"]).stdout, /migration unverified \S+: old snapshot nowhere unreadable/);
  writeFileSync(join(next, "keylang.json"), JSON.stringify({ ...JSON.parse(newFiles(null)["keylang.json"]!), migration: { form: "x" } }));
  const bad = keylang(next, ["check"]);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /unknown field `migration\.form`/);
});

test("migration status with migration.from of keylang.json; a dropped trigger is not judged; the MCP tool gives the same JSON and writes nothing", async (t) => {
  const { old, next } = setup(t, true);
  writeTree(next, { "keylang/migration.md": `${TABLE}- dropped ${SERVICE}.refund refunds move to the payment provider\n` });
  const r = keylang(next, ["migration", "status", "--json"]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const status = JSON.parse(r.stdout) as Status & { droppedFlows: { name: string; reason: string }[]; dropped: { id: string }[] };
  assert.deepEqual(verdicts(status), [["checkout", "ok", "checkout"], ["report", "unverified", "daily-report"]]);
  assert.deepEqual(status.droppedFlows, [{ name: "refund", reason: "refunds move to the payment provider" }]);
  assert.deepEqual(status.notMigrated.flows, []);
  assert.deepEqual(status.notMigrated.integrations, [], "the cURL call sits in a dropped fn");

  const client = new Client({ name: "keylang-test", version: "0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [bin, "mcp"], cwd: next, stderr: "pipe" }));
  t.after(() => client.close());
  assert.ok((await client.listTools()).tools.some((tool) => tool.name === "migration_status"));
  const before = [...treeBytes(next)].filter(([path]) => !path.startsWith(".keylang/cache"));
  const answer = (await client.callTool({ name: "migration_status", arguments: {} })) as { content: { text: string }[]; isError?: boolean };
  assert.notEqual(answer.isError, true, answer.content[0]?.text);
  assert.deepEqual(JSON.parse(answer.content.map((c) => c.text).join("")), JSON.parse(r.stdout));
  assert.deepEqual([...treeBytes(next)].filter(([path]) => !path.startsWith(".keylang/cache")), before, "read-only");
  void old;
});

test("parity, pure: a planned step not implemented yet fails; one inside an opaque module is unverified; an unmapped step is unverified", () => {
  const flow = { name: "pay", source: "spec" as const, file: "keylang/flows/pay.md", trigger: "old.pay.run", steps: ["old.pay.run", "old.pay.charge", "old.pay.log"], tests: [] };
  const old: Stack = { snapshotId: "a", nodes: {}, entries: [{ kind: "cron", label: "0 * * * *", id: "old.pay.sweep" }], flows: [flow], tests: null, integrations: null };
  const current: Stack = {
    snapshotId: "b",
    nodes: { app: { kind: "layer" }, "app.pay": { kind: "module", members: "complete" }, "app.pay.run": { kind: "fn" }, "app.vendor": { kind: "module", members: "opaque" } },
    entries: [],
    flows: [{ name: "pay", source: "spec", file: "keylang/flows/pay.md", trigger: "app.pay.run", steps: ["app.pay.run"], tests: [] }],
    tests: null,
    integrations: null,
  };
  const row = (oldId: string, to: string, planned = false) => ({ kind: "map" as const, section: "m", old: oldId, to, planned, reason: null, file: "keylang/migration.md", line: 1, col: 1, oldSpan: { start: { offset: 0, line: 1, col: 1 }, end: { offset: 0, line: 1, col: 1 } }, text: "" });
  const planned = migrationStatus({ from: "old", old, current, rows: [row("old.pay.run", "app.pay.run"), row("old.pay.charge", "app.pay.charge", true)] });
  assert.equal(planned.flows[0]!.verdict, "fail");
  assert.deepEqual(planned.flows[0]!.reasons, ["old.pay.charge → app.pay.charge: planned, not implemented yet"]);
  assert.deepEqual(planned.notMigrated.entries, [{ kind: "cron", label: "0 * * * *", id: "old.pay.sweep" }]);
  const opaque = migrationStatus({ from: "old", old, current, rows: [row("old.pay.run", "app.pay.run"), row("old.pay.charge", "app.vendor.charge")] });
  assert.equal(opaque.flows[0]!.verdict, "unverified");
  assert.match(opaque.flows[0]!.reasons.join("\n"), /app\.vendor\.charge: inside an opaque module/);
  assert.match(opaque.flows[0]!.reasons.join("\n"), /step old\.pay\.log is not in the migration table/);
  assert.match(opaque.notes.join("\n"), /no test report/);
});
