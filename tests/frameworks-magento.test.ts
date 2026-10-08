// The Magento adapter (ADR 0022, business-flows 04, 06, 07) through the real
// CLI on a small Magento-shaped repository (`tests/fixtures/magento-shop`):
// three modules with `registration.php`, `etc/di.xml` in the global area and
// in `frontend`/`adminhtml`, preferences (one conflicting, one to a class that
// does not exist), a virtualType as a constructor argument, and plugins
// before/around/after with `sortOrder` and one `disabled`.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { keylang, root, writeTree } from "./cli-helpers.ts";

interface Edge {
  kind: string;
  source: string;
  target: string | null;
  resolution: string;
  text: string;
  via?: string;
  site?: string;
  scope?: string;
  owner?: string;
  binding?: string;
  intercepts?: string;
  reason?: string;
}

interface Snapshot {
  snapshotId: string;
  manifest: { config: { frameworks?: string[] }; files: { path: string }[]; frameworks?: { name: string; version: string; files: { path: string; sha256: string }[] }[] };
  nodes: Record<string, { kind: string; calls?: string[]; interceptedBy?: { plugin: string; via: string; name: string; site: string; scope: string }[] }>;
  edges: Edge[];
  coverage: { kind: string; file: string; line: number; reason: string; source: string | null; text: string }[];
  stats: { callsResolved: number; callsDynamic: number; callsUnresolved: number };
}

const SUBMIT = "checkout.Model.QuoteManagement.QuoteManagement.submit";
const PLACE_ORDER = "checkout.Model.QuoteManagement.QuoteManagement.placeOrder";
const CHECKOUT_DI = "app/code/Shop/Checkout/etc/di.xml";

function shop(t: TestContext, extra: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-magento-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(join(root, "tests/fixtures/magento-shop"), dir, { recursive: true });
  writeTree(dir, extra);
  return dir;
}

function map(dir: string): Snapshot {
  const r = keylang(dir, ["map"]);
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as Snapshot;
}

function calls(index: Snapshot, source: string): Edge[] {
  return index.edges.filter((e) => e.kind === "call" && e.source === source && e.resolution === "resolved");
}

function setConfig(dir: string, change: (raw: Record<string, unknown>) => void): void {
  const raw = JSON.parse(readFileSync(join(dir, "keylang.json"), "utf8")) as Record<string, unknown>;
  change(raw);
  writeFileSync(join(dir, "keylang.json"), `${JSON.stringify(raw, null, 2)}\n`);
}

test("magento: a call through an interface follows the preference of each area; the edge names via, scope, site and owner", (t) => {
  const dir = shop(t);
  const index = map(dir);
  assert.deepEqual(
    index.manifest.frameworks?.map((f) => [f.name, f.files.map((file) => file.path)]),
    [["magento", ["app/code/Shop/Checkout/etc/adminhtml/di.xml", CHECKOUT_DI, "app/code/Shop/Promo/etc/di.xml", "app/code/Shop/Promo/etc/frontend/di.xml"]]],
  );
  const place = calls(index, SUBMIT).filter((e) => e.text === "this.orderManagement.place" && e.via === "preference");
  assert.deepEqual(
    place.map((e) => [e.target, e.scope, e.site, e.owner]),
    [
      ["sales.Model.OrderService.OrderService.place", "global", `${CHECKOUT_DI}:3:5`, "checkout"],
      ["sales.Model.AdminOrderService.AdminOrderService.place", "adminhtml", "app/code/Shop/Checkout/etc/adminhtml/di.xml:3:5", "checkout"],
    ],
  );
  assert.equal(place[0]?.binding, "`Shop\\Sales\\Api\\OrderManagementInterface → Shop\\Sales\\Model\\OrderService`");
  // A leading `\` in the XML is the same class.
  assert.ok(calls(index, SUBMIT).some((e) => e.target === "sales.Model.Totals.Totals.collect" && e.via === "preference" && e.site === `${CHECKOUT_DI}:4:5`));
  // `<argument name="logger" xsi:type="object">` names a virtualType: the class it stands for.
  const log = calls(index, SUBMIT).find((e) => e.target === "checkout.Model.Logger.Logger.log");
  assert.equal(log?.via, "argument");
  assert.equal(log?.binding, "the argument `logger` → `Shop\\Checkout\\Model\\Logger` (virtualType `Shop\\Checkout\\Model\\FastLogger`)");
  // Two classes for one interface in one area: a hole, no guess.
  const ambiguous = index.coverage.find((c) => c.kind === "ambiguous-binding");
  assert.equal(ambiguous?.source, SUBMIT);
  assert.match(ambiguous?.reason ?? "", /^ambiguous binding of `Shop\\Checkout\\Api\\NotifierInterface`: `Shop\\Checkout\\Model\\EmailNotifier` \(app\/code\/Shop\/Checkout\/etc\/di\.xml:5:5\) and `Shop\\Promo\\Model\\SmsNotifier` \(app\/code\/Shop\/Promo\/etc\/di\.xml:3:5\) in scope global$/);
  assert.ok(!calls(index, SUBMIT).some((e) => e.target?.endsWith(".notify")));
  // A class the config names that no file declares: the call and the config line are holes with the reason.
  assert.ok(index.coverage.some((c) => c.kind === "unresolved-call" && c.text === "this.clock.now" && c.reason.includes("to `Shop\\Missing\\Clock`, which no analysed file declares")), JSON.stringify(index.coverage));
  assert.ok(index.coverage.some((c) => c.kind === "unresolved-binding" && c.file === CHECKOUT_DI && c.line === 6 && c.source === "checkout"));
  // The map shows the edge in `calls`, marked with its `via`.
  const mapText = readFileSync(join(dir, "keylang/map/checkout.md"), "utf8");
  assert.match(mapText, /- calls .*sales\.Model\.OrderService\.OrderService\.place.*<!-- via: .*place preference app\/code\/Shop\/Checkout\/etc\/di\.xml:3:5/);
});

test("magento: plugins wrap every call of the method in sortOrder; a disabled one gives no edge; one on an interface wraps its implementations", (t) => {
  const dir = shop(t);
  const index = map(dir);
  const wrapped = calls(index, PLACE_ORDER).map((e) => `${e.via ?? "call"} ${e.target}`);
  assert.deepEqual(wrapped, [
    "plugin:before promo.Plugin.AuditPlugin.AuditPlugin.beforeSubmit",
    "plugin:around promo.Plugin.CouponPlugin.CouponPlugin.aroundSubmit",
    `call ${SUBMIT}`,
    "plugin:after promo.Plugin.AuditPlugin.AuditPlugin.afterSubmit",
  ]);
  assert.ok(calls(index, PLACE_ORDER).filter((e) => e.via?.startsWith("plugin:")).every((e) => e.intercepts === SUBMIT && e.owner === "promo"));
  assert.ok(!index.edges.some((e) => e.target === "promo.Plugin.LegacyPlugin.LegacyPlugin.beforeSubmit"), "a disabled plugin gives no edge");
  assert.deepEqual(
    index.nodes[SUBMIT]?.interceptedBy?.map((i) => `${i.via} ${i.name} ${i.plugin}`),
    ["plugin:before audit promo.Plugin.AuditPlugin.AuditPlugin.beforeSubmit", "plugin:around coupon promo.Plugin.CouponPlugin.CouponPlugin.aroundSubmit", "plugin:after audit promo.Plugin.AuditPlugin.AuditPlugin.afterSubmit"],
  );
  // `guard` is declared on the interface, in `frontend`: it wraps the bound call to the implementation.
  const guard = calls(index, SUBMIT).find((e) => e.target === "promo.Plugin.GuardPlugin.GuardPlugin.beforePlace");
  assert.equal(guard?.via, "plugin:before");
  assert.equal(guard?.scope, "frontend");
  assert.equal(guard?.intercepts, "sales.Model.OrderService.OrderService.place");
  assert.equal(index.nodes["sales.Model.OrderService.OrderService.place"]?.interceptedBy?.[0]?.name, "guard");

  const explain = keylang(dir, ["explain", SUBMIT]);
  assert.equal(explain.status, 0, explain.stderr);
  assert.match(explain.stdout, /\nintercepted by: promo\.Plugin\.AuditPlugin\.AuditPlugin\.beforeSubmit \(plugin:before `audit`, app\/code\/Shop\/Promo\/etc\/di\.xml:6:9\), promo\.Plugin\.CouponPlugin\.CouponPlugin\.aroundSubmit \(plugin:around `coupon`, app\/code\/Shop\/Promo\/etc\/di\.xml:5:9\), promo\.Plugin\.AuditPlugin\.AuditPlugin\.afterSubmit/);

  const draft = keylang(dir, ["draft", "flow", PLACE_ORDER, "--mode", "algo", "--print"]);
  assert.equal(draft.status, 0, draft.stderr);
  assert.match(draft.stdout, /\n {2}- step promo\.Plugin\.CouponPlugin\.CouponPlugin\.aroundSubmit <!-- keylang:algo via plugin:around app\/code\/Shop\/Promo\/etc\/di\.xml:5:9 -->/);
  assert.match(draft.stdout, /\n {4}- step sales\.Model\.OrderService\.OrderService\.place <!-- keylang:algo via preference app\/code\/Shop\/Checkout\/etc\/di\.xml:3:5 -->/);
  assert.match(draft.stdout, /\n {4}- step sales\.Model\.AdminOrderService\.AdminOrderService\.place <!-- keylang:algo via preference app\/code\/Shop\/Checkout\/etc\/adminhtml\/di\.xml:3:5 scope adminhtml -->/);
  // The ambiguous call is a blind spot of the draft, not a step.
  assert.match(draft.stdout, /unresolved: [^\n]*this\.notifier\.notify/);
});

test("magento: a flow step through a preference is `static ok` in behavior and `unverified` in --static shape, naming the config line", (t) => {
  const dir = shop(t);
  const behavior = keylang(dir, ["check"]);
  assert.equal(behavior.status, 0, behavior.stdout);
  assert.match(behavior.stdout, /flows\.md:6:5: static ok sales\.Model\.OrderService\.OrderService\.place: called from checkout\.Model\.QuoteManagement\.QuoteManagement\.submit through the preference `Shop\\Sales\\Api\\OrderManagementInterface → Shop\\Sales\\Model\\OrderService` in `app\/code\/Shop\/Checkout\/etc\/di\.xml:3`\n/);
  assert.match(behavior.stdout, /flows\.md:4:3: static ok promo\.Plugin\.CouponPlugin\.CouponPlugin\.aroundSubmit: called from checkout\.Model\.QuoteManagement\.QuoteManagement\.placeOrder through the plugin `coupon` \(`Shop\\Promo\\Plugin\\CouponPlugin`\) on `Shop\\Checkout\\Model\\QuoteManagement` \(plugin:around\) in `app\/code\/Shop\/Promo\/etc\/di\.xml:5`\n/);
  assert.match(behavior.stdout, /flows\.md:8:5: static ok checkout\.Model\.Logger\.Logger\.log: called from [^\n]* through the argument `logger`/);
  const shape = keylang(dir, ["check", "--static", "shape"]);
  assert.match(shape.stdout, /flows\.md:6:5: static unverified sales\.Model\.OrderService\.OrderService\.place: no resolved path from checkout\.Model\.QuoteManagement\.QuoteManagement\.submit; the preference `[^`]*` in `app\/code\/Shop\/Checkout\/etc\/di\.xml:3` \(not followed in static mode shape, set by --static\)/);
  assert.match(shape.stdout, /flows\.md:4:3: static unverified promo\.Plugin\.CouponPlugin\.CouponPlugin\.aroundSubmit/);
  // A call written in the code stays ok in both.
  assert.match(shape.stdout, /flows\.md:5:3: static ok checkout\.Model\.QuoteManagement\.QuoteManagement\.submit: called from/);
});

test("magento: `deny` sees the edges of a config as dependencies of the module that declares them, at the config line, in every area", (t) => {
  const dir = shop(t, { "keylang/rules.md": "# rules\n\n- deny checkout sales.Model\n" });
  const r = keylang(dir, ["check"]);
  assert.equal(r.status, 1, r.stdout);
  const k102 = r.stdout.split("\n").filter((line) => line.includes("K102"));
  assert.deepEqual(k102, [
    "app/code/Shop/Checkout/etc/adminhtml/di.xml:3:5: K102 divergence: `checkout` depends on `sales.Model.AdminOrderService.AdminOrderService` through the preference `Shop\\Sales\\Api\\OrderManagementInterface → Shop\\Sales\\Model\\AdminOrderService` (app/code/Shop/Checkout/etc/adminhtml/di.xml:3, scope adminhtml), which is denied by `deny checkout sales.Model` (keylang/rules.md:3)",
    "app/code/Shop/Checkout/etc/di.xml:3:5: K102 divergence: `checkout` depends on `sales.Model.OrderService.OrderService` through the preference `Shop\\Sales\\Api\\OrderManagementInterface → Shop\\Sales\\Model\\OrderService` (app/code/Shop/Checkout/etc/di.xml:3), which is denied by `deny checkout sales.Model` (keylang/rules.md:3)",
    "app/code/Shop/Checkout/etc/di.xml:4:5: K102 divergence: `checkout` depends on `sales.Model.Totals.Totals` through the preference `Shop\\Checkout\\Api\\TotalsInterface → Shop\\Sales\\Model\\Totals` (app/code/Shop/Checkout/etc/di.xml:4), which is denied by `deny checkout sales.Model` (keylang/rules.md:3)",
  ]);
});

test("magento: `frameworks: []` turns the adapter off; `[\"magento\"]` turns it on without detection", (t) => {
  const dir = shop(t);
  setConfig(dir, (raw) => {
    raw.frameworks = [];
  });
  const off = map(dir);
  assert.equal(off.manifest.frameworks, undefined);
  assert.deepEqual(off.manifest.config.frameworks, []);
  assert.ok(!off.edges.some((e) => e.via === "preference" || e.via?.startsWith("plugin:")));
  assert.ok(off.coverage.some((c) => c.kind === "dynamic-call" && c.reason === "call through an interface `OrderManagementInterface`"), JSON.stringify(off.coverage));
  const r = keylang(dir, ["check"]);
  assert.match(r.stdout, /flows\.md:6:5: static unverified sales\.Model\.OrderService\.OrderService\.place: [^\n]*call through an interface `OrderManagementInterface`/);

  // Explicitly on: a component no `ComponentRegistrar::MODULE` registers is not detected, but its config is read.
  const explicit = shop(t);
  for (const name of ["Checkout", "Sales", "Promo"]) {
    const path = join(explicit, `app/code/Shop/${name}/registration.php`);
    writeFileSync(path, readFileSync(path, "utf8").replace("ComponentRegistrar::MODULE", "ComponentRegistrar::LIBRARY"));
  }
  assert.equal(map(explicit).manifest.frameworks, undefined, "no module, no app/etc/di.xml: Magento is not detected");
  setConfig(explicit, (raw) => {
    raw.frameworks = ["magento"];
  });
  const on = map(explicit);
  assert.equal(on.manifest.frameworks?.[0]?.files.length, 4);
  assert.ok(on.edges.some((e) => e.via === "preference" && e.target === "sales.Model.OrderService.OrderService.place"));
  setConfig(explicit, (raw) => {
    raw.frameworks = ["rails"];
  });
  const unknown = keylang(explicit, ["map"]);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /`frameworks\[0\]` must be one of "laravel", "magento", "sfcc", "symfony", got "rails"/);
});

test("magento: a changed di.xml is a new snapshot and a new fact-cache entry; one that does not parse is a skipped-file hole", (t) => {
  const dir = shop(t);
  const before = map(dir);
  const cache = (): { configs?: Record<string, { sha256: string; facts: { bindings: unknown[] } }> } => JSON.parse(readFileSync(join(dir, ".keylang/cache/facts.json"), "utf8"));
  const sha = (text: string): string => createHash("sha256").update(text).digest("hex");
  const di = join(dir, CHECKOUT_DI);
  const text = readFileSync(di, "utf8");
  assert.equal(cache().configs?.[CHECKOUT_DI]?.sha256, `magento@1\0${sha(text)}`);
  assert.equal(cache().configs?.[CHECKOUT_DI]?.facts.bindings.length, 4);
  // The map on disk goes stale with the config, as with the code.
  writeFileSync(di, text.replace('    <preference for="Shop\\Checkout\\Api\\TotalsInterface" type="\\Shop\\Sales\\Model\\Totals"/>\n', ""));
  assert.notEqual(keylang(dir, ["map", "--check"]).status, 0);
  const after = map(dir);
  assert.notEqual(after.snapshotId, before.snapshotId);
  assert.equal(cache().configs?.[CHECKOUT_DI]?.facts.bindings.length, 3);
  assert.ok(!after.edges.some((e) => e.target === "sales.Model.Totals.Totals.collect"));
  assert.ok(after.coverage.some((c) => c.kind === "dynamic-call" && c.reason === "call through an interface `TotalsInterface`"));

  writeFileSync(di, "<config><preference for=\"A\" type=\"B\"></config>\n");
  const broken = map(dir);
  const skipped = broken.coverage.find((c) => c.file === CHECKOUT_DI);
  assert.equal(skipped?.kind, "skipped-file");
  assert.equal(skipped?.source, "checkout.registration");
  assert.equal(skipped?.text, "framework:magento");
  assert.match(skipped?.reason ?? "", /^`app\/code\/Shop\/Checkout\/etc\/di\.xml` is no well-formed XML: /);
  // The rest of the modules still work: the plugins of Promo are there.
  assert.ok(broken.edges.some((e) => e.via === "plugin:around"));
});

test("magento: a cycle of preferences ends; a dependency only the config makes is recorded in the baseline with its config line", (t) => {
  const reg = (name: string): string => `<?php\n\\Magento\\Framework\\Component\\ComponentRegistrar::register(\\Magento\\Framework\\Component\\ComponentRegistrar::MODULE, 'Shop_${name}', __DIR__);\n`;
  const dir = mkdtempSync(join(tmpdir(), "keylang-magento-cycle-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeTree(dir, {
    "keylang.json": JSON.stringify({ languages: ["php"], layers: { wiring: ["app/code/Shop/Wiring/**"], core: ["app/code/Shop/Core/**"] } }),
    "app/code/Shop/Wiring/registration.php": reg("Wiring"),
    "app/code/Shop/Core/registration.php": reg("Core"),
    "app/code/Shop/Core/Api/RunnerInterface.php": "<?php\nnamespace Shop\\Core\\Api;\n\ninterface RunnerInterface\n{\n    public function run(): void;\n}\n",
    "app/code/Shop/Core/Model/A.php": "<?php\nnamespace Shop\\Core\\Model;\n\nclass A implements \\Shop\\Core\\Api\\RunnerInterface\n{\n    public function run(): void {}\n}\n",
    "app/code/Shop/Core/Model/B.php": "<?php\nnamespace Shop\\Core\\Model;\n\nclass B extends A\n{\n    public function run(): void {}\n}\n",
    "app/code/Shop/Core/Model/Job.php": "<?php\nnamespace Shop\\Core\\Model;\n\nuse Shop\\Core\\Api\\RunnerInterface;\n\nclass Job\n{\n    public function __construct(private RunnerInterface $runner) {}\n\n    public function go(): void\n    {\n        $this->runner->run();\n    }\n}\n",
    // RunnerInterface → A → B → A: the chain stops where it would repeat.
    "app/code/Shop/Wiring/etc/di.xml": '<config>\n    <preference for="Shop\\Core\\Api\\RunnerInterface" type="Shop\\Core\\Model\\A"/>\n    <preference for="Shop\\Core\\Model\\A" type="Shop\\Core\\Model\\B"/>\n    <preference for="Shop\\Core\\Model\\B" type="Shop\\Core\\Model\\A"/>\n</config>\n',
  });
  const index = map(dir);
  const run = calls(index, "core.Model.Job.Job.go").filter((e) => e.via === "preference");
  assert.deepEqual(run.map((e) => [e.target, e.owner, e.binding]), [["core.Model.A.A.run", "wiring", "`Shop\\Core\\Api\\RunnerInterface → Shop\\Core\\Model\\A → Shop\\Core\\Model\\B → Shop\\Core\\Model\\A`"]]);
  const baseline = keylang(dir, ["baseline"]);
  assert.equal(baseline.status, 0, baseline.stderr);
  const text = readFileSync(join(dir, "keylang/rules.baseline.md"), "utf8");
  assert.match(text, /\n- deny wiring external, unassigned\n/);
  assert.match(text, /\n<!-- keylang:baseline wiring → core only through the framework config: preference app\/code\/Shop\/Wiring\/etc\/di\.xml:2:5 -->\n/);
  // The baseline with its provenance line is a rules file `check` reads: no finding.
  const check = keylang(dir, ["check"]);
  assert.equal(check.status, 0, check.stdout);
});
