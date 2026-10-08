// The Magento adapter (ADR 0022, business-flows 04, 06, 07, 08, 10) through
// the real CLI on a small Magento-shaped repository (`tests/fixtures/magento-shop`):
// three modules with `registration.php`, `etc/di.xml` in the global area and
// in `frontend`/`adminhtml`, preferences (one conflicting, one to a class that
// does not exist), a virtualType as a constructor argument, plugins
// before/around/after with `sortOrder` and one `disabled`; events dispatched
// by literal and by a computed name, observed in three areas (one disabled in
// `frontend`, one of a class that does not exist); and an entry point of every
// kind: routes and controllers, webapi.xml, schema.graphqls, crontab.xml,
// queue_consumer.xml and a console command in di.xml.

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
  line: number;
}

interface Entry {
  kind: string;
  id: string;
  label: string;
  framework: string | null;
  file: string;
  line: number;
  source: string;
  unresolved?: string;
}

interface Snapshot {
  snapshotId: string;
  manifest: { config: { frameworks?: string[] }; files: { path: string }[]; frameworks?: { name: string; version: string; files: { path: string; sha256: string }[] }[] };
  nodes: Record<string, { kind: string; layer: string; file: string | null; line: number | null; name?: string; calls?: string[]; callers?: string[]; interceptedBy?: { plugin: string; via: string; name: string; site: string; scope: string }[] }>;
  edges: Edge[];
  coverage: { kind: string; file: string; line: number; reason: string; source: string | null; text: string }[];
  stats: { callsResolved: number; callsDynamic: number; callsUnresolved: number };
  entries: Entry[];
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
    [
      [
        "magento",
        [
          "app/code/Shop/Checkout/etc/adminhtml/di.xml",
          "app/code/Shop/Checkout/etc/adminhtml/routes.xml",
          CHECKOUT_DI,
          "app/code/Shop/Checkout/etc/events.xml",
          "app/code/Shop/Checkout/etc/frontend/events.xml",
          "app/code/Shop/Checkout/etc/frontend/routes.xml",
          "app/code/Shop/Checkout/etc/schema.graphqls",
          "app/code/Shop/Promo/etc/adminhtml/events.xml",
          "app/code/Shop/Promo/etc/di.xml",
          "app/code/Shop/Promo/etc/frontend/di.xml",
          "app/code/Shop/Sales/etc/crontab.xml",
          "app/code/Shop/Sales/etc/queue_consumer.xml",
          "app/code/Shop/Sales/etc/webapi.xml",
        ],
      ],
    ],
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
  assert.equal(on.manifest.frameworks?.[0]?.files.length, 13);
  assert.ok(on.edges.some((e) => e.via === "preference" && e.target === "sales.Model.OrderService.OrderService.place"));
  setConfig(explicit, (raw) => {
    raw.frameworks = ["rails"];
  });
  const unknown = keylang(explicit, ["map"]);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /`frameworks\[0\]` must be one of [^\n]*"magento"[^\n]*"sfcc"[^\n]*, got "rails"/);
});

test("magento: a changed di.xml is a new snapshot and a new fact-cache entry; one that does not parse is a skipped-file hole", (t) => {
  const dir = shop(t);
  const before = map(dir);
  const cache = (): { configs?: Record<string, { sha256: string; facts: { bindings: unknown[] } }> } => JSON.parse(readFileSync(join(dir, ".keylang/cache/facts.json"), "utf8"));
  const sha = (text: string): string => createHash("sha256").update(text).digest("hex");
  const di = join(dir, CHECKOUT_DI);
  const text = readFileSync(di, "utf8");
  assert.equal(cache().configs?.[CHECKOUT_DI]?.sha256, `magento@2\0${sha(text)}`);
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

const SUBMIT_BEFORE = "events.checkout_submit_before";
const SUBMIT_AFTER = "events.checkout_submit_all_after";

test("magento: a literal dispatch is an edge to an event node; events.xml of every area gives observer edges; a disabled observer and a computed name are no edges", (t) => {
  const dir = shop(t);
  const index = map(dir);
  // Events form a generated group of their own, named by the literal, whoever dispatches them.
  assert.equal(index.nodes.events?.kind, "layer");
  assert.deepEqual(
    Object.keys(index.nodes).filter((id) => index.nodes[id]?.kind === "event"),
    [SUBMIT_AFTER, SUBMIT_BEFORE, "events.sales-order-place_after"],
  );
  // A name an ID segment cannot hold keeps its literal; the event no code dispatches stands at its observer's line.
  assert.deepEqual([index.nodes["events.sales-order-place_after"]?.name, index.nodes["events.sales-order-place_after"]?.file, index.nodes["events.sales-order-place_after"]?.line], ["sales.order.place_after", "app/code/Shop/Promo/etc/adminhtml/events.xml", 7]);
  assert.deepEqual([index.nodes[SUBMIT_BEFORE]?.file, index.nodes[SUBMIT_BEFORE]?.line], ["app/code/Shop/Checkout/Model/QuoteManagement.php", 36]);
  const dispatched = calls(index, SUBMIT).filter((e) => e.via === "dispatch");
  assert.deepEqual(dispatched.map((e) => [e.target, e.text]), [
    [SUBMIT_BEFORE, "this.eventManager.dispatch"],
    [SUBMIT_AFTER, "this.eventManager.dispatch"],
  ]);
  assert.deepEqual(index.nodes[SUBMIT_AFTER]?.callers, [SUBMIT]);
  // Observers: the global one, an area's own, another module's in adminhtml; `method` names the fn.
  const observers = index.edges.filter((e) => e.via === "observer").map((e) => [e.source, e.target, e.scope, e.site, e.owner]);
  assert.deepEqual(observers, [
    [SUBMIT_AFTER, "checkout.Observer.NotifyCustomer.NotifyCustomer.execute", "global", "app/code/Shop/Checkout/etc/events.xml:4:9", "checkout"],
    [SUBMIT_BEFORE, "checkout.Observer.FrontendGuard.FrontendGuard.guard", "frontend", "app/code/Shop/Checkout/etc/frontend/events.xml:7:9", "checkout"],
    [SUBMIT_BEFORE, "promo.Observer.AuditSubmit.AuditSubmit.execute", "adminhtml", "app/code/Shop/Promo/etc/adminhtml/events.xml:4:9", "promo"],
  ]);
  // `disabled="true"` in frontend takes the global observer out of that area, and says so.
  assert.equal(index.edges.find((e) => e.via === "observer" && e.source === SUBMIT_AFTER)?.binding, "observer `notify_customer` (`Shop\\Checkout\\Observer\\NotifyCustomer::execute`) of the event `checkout_submit_all_after` (disabled in frontend)");
  // A name computed at run time is a hole, never an edge; an observer of a class nobody declares is one too.
  const dynamic = index.coverage.filter((c) => c.kind === "dynamic-event");
  assert.deepEqual(dynamic.map((c) => [c.file, c.line, c.source, c.reason]), [["app/code/Shop/Checkout/Model/QuoteManagement.php", 43, SUBMIT, "dispatch of an event whose name is computed at run time: `'checkout_' . $order['type'] . '_placed'`"]]);
  assert.ok(index.coverage.some((c) => c.kind === "unresolved-binding" && c.file === "app/code/Shop/Promo/etc/adminhtml/events.xml" && c.line === 7 && c.source === "promo"));

  // The map: an `events` file with each event, who dispatches it and its observers.
  const events = readFileSync(join(dir, "keylang/map/events.md"), "utf8");
  assert.match(events, /\n- events\n {2}- event \[checkout_submit_before\]\(\.\.\/\.\.\/app\/code\/Shop\/Checkout\/Model\/QuoteManagement\.php#L36\) <!-- dispatched by: checkout\.Model\.QuoteManagement\.QuoteManagement\.submit -->\n {4}- calls promo\.Observer\.AuditSubmit\.AuditSubmit\.execute, checkout\.Observer\.FrontendGuard\.FrontendGuard\.guard <!-- via: /);
  assert.match(events, /\n {2}- event \[sales-order-place_after\]\([^)]*\) <!-- name: sales\.order\.place_after; dispatched by no code keylang read -->\n/);
  assert.match(readFileSync(join(dir, "keylang/map/checkout.md"), "utf8"), /- fn \[submit\][^\n]*\n\s+- calls [^\n]*events\.checkout_submit_before[^\n]*events\.checkout_submit_all_after/);
  // The map with events in it checks clean: every event ID resolves.
  const check = keylang(dir, ["check"]);
  assert.equal(check.status, 0, check.stdout);
});

test("magento: `explain` of an event names who dispatches it and its observers; a flow steps through an event to an observer", (t) => {
  const dir = shop(t, {
    "keylang/flows/events.md": `# flow submitEvents

- trigger checkout.Model.QuoteManagement.QuoteManagement.submit
  - step ${SUBMIT_BEFORE}
    - step promo.Observer.AuditSubmit.AuditSubmit.execute
  - step ${SUBMIT_AFTER}
    - step checkout.Observer.NotifyCustomer.NotifyCustomer.execute
  - step events.sales-order-place_after
  - step events.checkout_submit_al
`,
  });
  map(dir);
  const explain = keylang(dir, ["explain", SUBMIT_AFTER]);
  assert.equal(explain.status, 0, explain.stderr);
  assert.equal(
    explain.stdout,
    `event ${SUBMIT_AFTER}\napp/code/Shop/Checkout/Model/QuoteManagement.php:42\ndispatched by: ${SUBMIT}\nobservers: checkout.Observer.NotifyCustomer.NotifyCustomer.execute (observer \`notify_customer\`, app/code/Shop/Checkout/etc/events.xml:4:9)\nflows: submitEvents\n`,
  );
  const odd = keylang(dir, ["explain", "events.sales-order-place_after"]);
  assert.match(odd.stdout, /\nname: sales\.order\.place_after\n[^]*dispatched by no code keylang read\nno observer in the config keylang read/);

  const r = keylang(dir, ["check"]);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /flows\/events\.md:4:3: static ok events\.checkout_submit_before: called from checkout\.Model\.QuoteManagement\.QuoteManagement\.submit through the dispatch `this\.eventManager\.dispatch` at app\/code\/Shop\/Checkout\/Model\/QuoteManagement\.php:36:9\n/);
  assert.match(r.stdout, /flows\/events\.md:7:5: static ok checkout\.Observer\.NotifyCustomer\.NotifyCustomer\.execute: called from events\.checkout_submit_all_after through the observer `notify_customer` [^\n]* \(disabled in frontend\) in `app\/code\/Shop\/Checkout\/etc\/events\.xml:4`\n/);
  assert.match(r.stdout, /flows\/events\.md:5:5: static ok promo\.Observer\.AuditSubmit\.AuditSubmit\.execute: called from events\.checkout_submit_before through the observer `promo_audit` [^\n]* in `app\/code\/Shop\/Promo\/etc\/adminhtml\/events\.xml:4` \(scope adminhtml\)\n/);
  // An event the trigger does not publish, with a dispatch of a computed name on the way: maybe it does.
  assert.match(r.stdout, /flows\/events\.md:8:3: static unverified events\.sales-order-place_after: no dispatch of `events\.sales-order-place_after` from checkout\.Model\.QuoteManagement\.QuoteManagement\.submit in the static graph; dispatch of an event whose name is computed at run time: [^\n]* at app\/code\/Shop\/Checkout\/Model\/QuoteManagement\.php:43 may publish it\n/);
  // An event ID is an ID: a typo is K001 with the event as the suggestion.
  assert.match(r.stdout, /flows\/events\.md:9:10: K001 dangling reference `events\.checkout_submit_al` \(did you mean `events\.checkout_submit_all_after`\?\)/);
  // `shape` does not follow what the framework does: a dispatch is not a call written in the code.
  const shape = keylang(dir, ["check", "--static", "shape"]);
  assert.match(shape.stdout, /flows\/events\.md:4:3: static unverified events\.checkout_submit_before: no resolved path from [^\n]*the dispatch `this\.eventManager\.dispatch` \(not followed in static mode shape, set by --static\)/);
});

test("magento: entry points of every kind come from the config, labelled as the outside names them; a class nobody declares is an entry with `unresolved` and a hole", (t) => {
  const dir = shop(t);
  const index = map(dir);
  const magento = index.entries.filter((e) => e.framework === "magento").map((e) => [e.kind, e.label, e.id, e.source, ...(e.unresolved ? [e.unresolved] : [])]);
  assert.deepEqual(magento, [
    ["cli", "shop_promo_reindex", "promo.Console.ReindexCommand.ReindexCommand.execute", "app/code/Shop/Promo/etc/di.xml:12"],
    ["consumer", "shop.order.export", "sales.Model.OrderService.OrderService.save", "app/code/Shop/Sales/etc/queue_consumer.xml:3"],
    ["cron", "shop_clean_orders 0 3 * * *", "sales.Cron.CleanOrders.CleanOrders.execute", "app/code/Shop/Sales/etc/crontab.xml:4"],
    ["cron", "shop_sync_orders (config_path crontab/default/jobs/shop_sync_orders/schedule/cron_expr)", "sales.Cron.CleanOrders.CleanOrders.sync", "app/code/Shop/Sales/etc/crontab.xml:7"],
    ["graphql", "Mutation.placeOrder", "checkout.Model.Resolver.PlaceOrder.PlaceOrder.resolve", "app/code/Shop/Checkout/etc/schema.graphqls:5"],
    ["observer", "checkout_submit_all_after (notify_customer)", "checkout.Observer.NotifyCustomer.NotifyCustomer.execute", "app/code/Shop/Checkout/etc/events.xml:4"],
    ["observer", "checkout_submit_before (frontend_guard, frontend)", "checkout.Observer.FrontendGuard.FrontendGuard.guard", "app/code/Shop/Checkout/etc/frontend/events.xml:7"],
    ["observer", "checkout_submit_before (promo_audit, adminhtml)", "promo.Observer.AuditSubmit.AuditSubmit.execute", "app/code/Shop/Promo/etc/adminhtml/events.xml:4"],
    ["observer", "sales.order.place_after (ghost, adminhtml)", "Shop\\Promo\\Observer\\Missing::execute", "app/code/Shop/Promo/etc/adminhtml/events.xml:7", "`Shop\\Promo\\Observer\\Missing` is named by the config, but no analysed file declares it"],
    // The service is an interface: the entry is the implementation's method, through the preference.
    ["rest", "POST /V1/orders/:id/place [Shop_Sales::place, self]", "sales.Model.OrderService.OrderService.place", "app/code/Shop/Sales/etc/webapi.xml:3"],
    ["rest", "POST /V1/orders/:id/refund [anonymous]", "Shop\\Sales\\Api\\RefundInterface::refund", "app/code/Shop/Sales/etc/webapi.xml:10", "`Shop\\Sales\\Api\\RefundInterface` is named by the config, but no analysed file declares it"],
    // Controllers: `Controller/<Path>/<Action>.php` of a module a route names; the admin's under `/admin`.
    ["route", "GET /admin/shopcheckout/order/view", "checkout.Controller.Adminhtml.Order.View.View.execute", "app/code/Shop/Checkout/etc/adminhtml/routes.xml:4"],
    ["route", "GET|POST /checkout/cart/index", "checkout.Controller.Cart.Index.Index.execute", "app/code/Shop/Checkout/etc/frontend/routes.xml:4"],
    ["route", "POST /checkout/cart/add", "checkout.Controller.Cart.Add.Add.execute", "app/code/Shop/Checkout/etc/frontend/routes.xml:4"],
  ]);
  // The fn's own place, not the config line.
  assert.deepEqual(index.entries.find((e) => e.kind === "cron")?.file, "app/code/Shop/Sales/Cron/CleanOrders.php");
  assert.ok(index.coverage.some((c) => c.kind === "unresolved-binding" && c.file === "app/code/Shop/Sales/etc/webapi.xml" && c.line === 10 && c.source === "sales"));
  // Deterministic: a second map gives the same list.
  assert.deepEqual(map(dir).entries, index.entries);

  // `keylang entries` prints them; `trigger cron` and `every` read the kind and the schedule.
  const listed = keylang(dir, ["entries"]);
  assert.equal(listed.status, 0, listed.stderr);
  assert.match(listed.stdout, /rest +POST \/V1\/orders\/:id\/place \[Shop_Sales::place, self\]/);
  writeTree(dir, { "keylang/flows/cron.md": "# flow clean\n\n- trigger cron sales.Cron.CleanOrders.CleanOrders.execute\n- every 0 3 * * *\n" });
  const check = keylang(dir, ["check"]);
  assert.match(check.stdout, /flows\/cron\.md:3:1: [^\n]*ok[^\n]*entry point `shop_clean_orders 0 3 \* \* \*` \(magento\)/);
  assert.match(check.stdout, /flows\/cron\.md:4:1: static ok [^\n]*runs on `0 3 \* \* \*`/);
});

/** Factories Magento generates (business-flows 40): `InvoiceFactory` is declared nowhere, `TotalsFactory` by hand. */
const FACTORIES: Record<string, string> = {
  "app/code/Shop/Sales/Model/Invoice.php": "<?php\nnamespace Shop\\Sales\\Model;\n\nclass Invoice\n{\n    public function register(): void {}\n    public function pay(): void {}\n}\n",
  "app/code/Shop/Sales/Model/TotalsFactory.php": "<?php\nnamespace Shop\\Sales\\Model;\n\nclass TotalsFactory\n{\n    public function create(): Totals { return new Totals(); }\n}\n",
  "app/code/Shop/Sales/Model/InvoiceService.php": [
    "<?php",
    "namespace Shop\\Sales\\Model;",
    "",
    "use Magento\\Catalog\\Model\\ProductFactory;",
    "",
    "class InvoiceService",
    "{",
    "    public function __construct(",
    "        private InvoiceFactory $invoiceFactory,",
    "        private TotalsFactory $totalsFactory,",
    "        private ProductFactory $productFactory",
    "    ) {}",
    "",
    "    public function invoice(): void",
    "    {",
    "        $invoice = $this->invoiceFactory->create();",
    "        $invoice->register();",
    "        $this->invoiceFactory->create()->pay();",
    "        $this->totalsFactory->create()->collect([]);",
    "        $this->productFactory->create();",
    "    }",
    "}",
    "",
  ].join("\n"),
  "keylang/flows/invoice.md": "# flow invoice\n\n- trigger sales.Model.InvoiceService.InvoiceService.invoice\n  - step sales.Model.Invoice.Invoice.register\n",
};

test("magento: a factory Magento generates (`XFactory` no file declares) makes an `X` — an edge `via: generated-factory` and the class of its result; off with the adapter", (t) => {
  const dir = shop(t, FACTORIES);
  const index = map(dir);
  const source = "sales.Model.InvoiceService.InvoiceService.invoice";
  const edges = calls(index, source).map((e) => `${e.line} ${e.target}${e.via ? ` ${e.via}` : ""}${e.binding ? ` (${e.binding})` : ""}`).sort();
  assert.deepEqual(edges, [
    "16 sales.Model.Invoice.Invoice generated-factory (`Shop\\Sales\\Model\\InvoiceFactory` is generated: `create()` returns a new `Invoice`)",
    "17 sales.Model.Invoice.Invoice.register",
    "18 sales.Model.Invoice.Invoice.pay",
    // A factory the code declares is a class like any other.
    "19 sales.Model.Totals.Totals.collect",
    "19 sales.Model.TotalsFactory.TotalsFactory.create",
  ]);
  // A factory of a class keylang has not read is not a fact: the call stays a hole.
  assert.ok(index.coverage.some((c) => c.source === source && c.line === 20 && c.reason === "unresolved call `this.productFactory.create`"), JSON.stringify(index.coverage));
  assert.match(keylang(dir, ["check"]).stdout, /flows\/invoice\.md:4:3: static ok sales\.Model\.Invoice\.Invoice\.register: called from sales\.Model\.InvoiceService\.InvoiceService\.invoice\n/);

  setConfig(dir, (raw) => {
    raw.frameworks = [];
  });
  const off = map(dir);
  assert.ok(!off.edges.some((e) => e.via === "generated-factory"));
  assert.deepEqual(calls(off, source).map((e) => e.target).sort(), ["sales.Model.Totals.Totals.collect", "sales.Model.TotalsFactory.TotalsFactory.create"]);
  // Without the adapter the step is not proven, and not disproven either: Magento's config is unread.
  assert.match(keylang(dir, ["check"]).stdout, /flows\/invoice\.md:4:3: static unverified sales\.Model\.Invoice\.Invoice\.register/);
});
