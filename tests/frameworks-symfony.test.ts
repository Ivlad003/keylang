// The Symfony adapter (ADR 0022, business-flows 36) through the real CLI on a
// small Symfony-shaped app: `composer.json` with `symfony/framework-bundle`,
// `config/services.yaml` with aliases, `arguments` and `_defaults: bind`,
// `config/routes.yaml` with a route and a prefixed attribute import,
// `#[Route]` on a class and its methods, an `EventSubscriberInterface`, an
// `#[AsEventListener]`, a Messenger `#[AsMessageHandler]`, an `#[AsCommand]`
// and an `#[AsCronTask]`.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { AnalysisSnapshot } from "../src/snapshot.ts";
import { keylang, tempDir, writeTree } from "./cli-helpers.ts";

const php = (lines: string[]): string => `<?php\n${lines.join("\n")}\n`;

const LAYERS = {
  controller: ["src/Controller/**"],
  service: ["src/Service/**"],
  contract: ["src/Contract/**"],
  infra: ["src/Infra/**"],
  eventdata: ["src/Event/**"],
  subscribers: ["src/EventSubscriber/**"],
  listeners: ["src/EventListener/**"],
  messages: ["src/Message/**"],
  handlers: ["src/MessageHandler/**"],
  commands: ["src/Command/**"],
  scheduler: ["src/Scheduler/**"],
};

const FLOW = [
  "# flow createOrder",
  "",
  "- trigger controller.OrderController.OrderController.create",
  "  - step service.OrderService.OrderService.place",
  "    - step infra.StripeGateway.StripeGateway.charge",
  "    - step infra.EmailNotifier.EmailNotifier.send",
  "    - step subscribers.OrderSubscriber.OrderSubscriber.onOrderPlaced",
  "    - step handlers.GenerateInvoiceHandler.GenerateInvoiceHandler.__invoke",
  "",
].join("\n");

const iface = (ns: string, name: string, method: string): string => php([`namespace ${ns};`, "", `interface ${name}`, "{", `    public function ${method}(): void;`, "}"]);
const impl = (name: string, contract: string, method: string): string => php(["namespace App\\Infra;", "", `use App\\Contract\\${contract};`, "", `class ${name} implements ${contract}`, "{", `    public function ${method}(): void`, "    {", "    }", "}"]);

const SERVICES = [
  "services:",
  "    _defaults:",
  "        autowire: true",
  "        autoconfigure: true",
  "        bind:",
  "            $notifier: '@App\\Infra\\EmailNotifier'",
  "",
  "    App\\:",
  "        resource: '../src/'",
  "",
  "    App\\Contract\\PaymentGateway: '@App\\Infra\\StripeGateway'",
  "",
  "    App\\Contract\\Clock:",
  "        alias: App\\Infra\\SystemClock",
  "",
  "    App\\Service\\Billing:",
  "        arguments:",
  "            $gateway: '@App\\Infra\\PaypalGateway'",
  "",
].join("\n");

const ROUTES = [
  "controllers:",
  "    resource:",
  "        path: ../src/Controller/",
  "        namespace: App\\Controller",
  "    type: attribute",
  "    prefix: /api",
  "",
  "health:",
  "    path: /health",
  "    controller: App\\Controller\\HealthController::check",
  "    methods: [GET]",
  "",
].join("\n");

const APP: Record<string, string> = {
  "composer.json": JSON.stringify({ name: "shop/app", require: { php: "^8.2", "symfony/framework-bundle": "^7.1", "symfony/messenger": "^7.1" }, autoload: { "psr-4": { "App\\": "src/" } } }, null, 2),
  "composer.lock": JSON.stringify({ packages: [{ name: "symfony/symfony", autoload: { "psr-4": { "Symfony\\": "src/Symfony/" } } }] }),
  "keylang.json": JSON.stringify({ languages: ["php"], layers: LAYERS }),
  "keylang/flows.md": FLOW,
  "config/services.yaml": SERVICES,
  "config/routes.yaml": ROUTES,
  "src/Contract/PaymentGateway.php": iface("App\\Contract", "PaymentGateway", "charge"),
  "src/Contract/Clock.php": iface("App\\Contract", "Clock", "now"),
  "src/Contract/Notifier.php": iface("App\\Contract", "Notifier", "send"),
  "src/Infra/StripeGateway.php": impl("StripeGateway", "PaymentGateway", "charge"),
  "src/Infra/PaypalGateway.php": impl("PaypalGateway", "PaymentGateway", "charge"),
  "src/Infra/SystemClock.php": impl("SystemClock", "Clock", "now"),
  "src/Infra/EmailNotifier.php": impl("EmailNotifier", "Notifier", "send"),
  "src/Event/OrderPlaced.php": php(["namespace App\\Event;", "", "class OrderPlaced", "{", "    public function __construct(public int $amount) {}", "}"]),
  "src/Message/GenerateInvoice.php": php(["namespace App\\Message;", "", "class GenerateInvoice", "{", "    public function __construct(public int $amount) {}", "}"]),
  "src/Service/OrderService.php": php([
    "namespace App\\Service;",
    "",
    "use App\\Contract\\Clock;",
    "use App\\Contract\\Notifier;",
    "use App\\Contract\\PaymentGateway;",
    "use App\\Event\\OrderPlaced;",
    "use App\\Message\\GenerateInvoice;",
    "use Symfony\\Component\\Messenger\\MessageBusInterface;",
    "use Symfony\\Contracts\\EventDispatcher\\EventDispatcherInterface;",
    "",
    "class OrderService",
    "{",
    "    public function __construct(",
    "        private PaymentGateway $gateway,",
    "        private Clock $clock,",
    "        private Notifier $notifier,",
    "        private EventDispatcherInterface $dispatcher,",
    "        private MessageBusInterface $bus,",
    "    ) {}",
    "",
    "    public function place(int $amount): void",
    "    {",
    "        $this->gateway->charge();",
    "        $this->clock->now();",
    "        $this->notifier->send();",
    "        $this->dispatcher->dispatch(new OrderPlaced($amount));",
    "        $this->bus->dispatch(new GenerateInvoice($amount));",
    "    }",
    "}",
  ]),
  "src/Service/Billing.php": php([
    "namespace App\\Service;",
    "",
    "use App\\Contract\\PaymentGateway;",
    "",
    "class Billing",
    "{",
    "    public function __construct(private PaymentGateway $gateway) {}",
    "",
    "    public function bill(): void",
    "    {",
    "        $this->gateway->charge();",
    "    }",
    "}",
  ]),
  "src/Controller/OrderController.php": php([
    "namespace App\\Controller;",
    "",
    "use App\\Service\\OrderService;",
    "use Symfony\\Component\\Routing\\Attribute\\Route;",
    "",
    "#[Route('/orders')]",
    "class OrderController",
    "{",
    "    public function __construct(private OrderService $orders) {}",
    "",
    "    #[Route('/{id}', methods: ['GET'])]",
    "    public function show(int $id): void",
    "    {",
    "    }",
    "",
    "    #[Route('', name: 'order_create', methods: ['POST'])]",
    "    public function create(): void",
    "    {",
    "        $this->orders->place(10);",
    "    }",
    "}",
  ]),
  "src/Controller/HealthController.php": php(["namespace App\\Controller;", "", "class HealthController", "{", "    public function check(): void", "    {", "    }", "}"]),
  "src/EventSubscriber/OrderSubscriber.php": php([
    "namespace App\\EventSubscriber;",
    "",
    "use App\\Event\\OrderPlaced;",
    "use Symfony\\Component\\EventDispatcher\\EventSubscriberInterface;",
    "",
    "class OrderSubscriber implements EventSubscriberInterface",
    "{",
    "    public static function getSubscribedEvents(): array",
    "    {",
    "        return [OrderPlaced::class => 'onOrderPlaced'];",
    "    }",
    "",
    "    public function onOrderPlaced(OrderPlaced $event): void",
    "    {",
    "    }",
    "}",
  ]),
  "src/EventListener/AuditListener.php": php([
    "namespace App\\EventListener;",
    "",
    "use App\\Event\\OrderPlaced;",
    "use Symfony\\Component\\EventDispatcher\\Attribute\\AsEventListener;",
    "",
    "#[AsEventListener(event: OrderPlaced::class, method: 'audit')]",
    "class AuditListener",
    "{",
    "    public function audit(OrderPlaced $event): void",
    "    {",
    "    }",
    "}",
  ]),
  "src/MessageHandler/GenerateInvoiceHandler.php": php([
    "namespace App\\MessageHandler;",
    "",
    "use App\\Message\\GenerateInvoice;",
    "use Symfony\\Component\\Messenger\\Attribute\\AsMessageHandler;",
    "",
    "#[AsMessageHandler]",
    "class GenerateInvoiceHandler",
    "{",
    "    public function __invoke(GenerateInvoice $message): void",
    "    {",
    "    }",
    "}",
  ]),
  "src/Command/SyncCommand.php": php([
    "namespace App\\Command;",
    "",
    "use Symfony\\Component\\Console\\Attribute\\AsCommand;",
    "use Symfony\\Component\\Console\\Command\\Command;",
    "use Symfony\\Component\\Console\\Input\\InputInterface;",
    "use Symfony\\Component\\Console\\Output\\OutputInterface;",
    "",
    "#[AsCommand(name: 'app:sync', description: 'Sync the catalog')]",
    "class SyncCommand extends Command",
    "{",
    "    protected function execute(InputInterface $input, OutputInterface $output): int",
    "    {",
    "        return Command::SUCCESS;",
    "    }",
    "}",
  ]),
  "src/Scheduler/CleanupTask.php": php([
    "namespace App\\Scheduler;",
    "",
    "use Symfony\\Component\\Scheduler\\Attribute\\AsCronTask;",
    "",
    "#[AsCronTask('0 3 * * *')]",
    "class CleanupTask",
    "{",
    "    public function __invoke(): void",
    "    {",
    "    }",
    "}",
  ]),
};

function app(t: TestContext, extra: Record<string, string> = {}): string {
  const dir = tempDir(t, "keylang-symfony-");
  writeTree(dir, { ...APP, ...extra });
  return dir;
}

function snapshotOf(dir: string): AnalysisSnapshot {
  const run = keylang(dir, ["map"]);
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as AnalysisSnapshot;
}

const PLACE = "service.OrderService.OrderService.place";

test("symfony: attribute routes under the routes.yaml prefix, a yaml route, subscribers, listeners, handlers, commands and cron tasks are entry points", (t) => {
  const dir = app(t);
  const snapshot = snapshotOf(dir);
  const rows = snapshot.entries.filter((e) => e.framework === "symfony").map((e) => [e.kind, e.label, e.id, e.source, e.method ?? ""].join(" | "));
  assert.deepEqual(rows, [
    "cli | app:sync | commands.SyncCommand.SyncCommand.execute | src/Command/SyncCommand.php:9 | ",
    "consumer | App\\Message\\GenerateInvoice | handlers.GenerateInvoiceHandler.GenerateInvoiceHandler.__invoke | src/MessageHandler/GenerateInvoiceHandler.php:7 | ",
    "cron | App\\Scheduler\\CleanupTask::__invoke (0 3 * * *) | scheduler.CleanupTask.CleanupTask.__invoke | src/Scheduler/CleanupTask.php:6 | ",
    "observer | App\\Event\\OrderPlaced (AuditListener) | listeners.AuditListener.AuditListener.audit | src/EventListener/AuditListener.php:7 | ",
    "observer | App\\Event\\OrderPlaced (OrderSubscriber) | subscribers.OrderSubscriber.OrderSubscriber.onOrderPlaced | src/EventSubscriber/OrderSubscriber.php:9 | ",
    "route | GET /api/orders/{id} | controller.OrderController.OrderController.show | src/Controller/OrderController.php:12 | GET",
    "route | GET /health | controller.HealthController.HealthController.check | config/routes.yaml:8 | GET",
    "route | POST /api/orders | controller.OrderController.OrderController.create | src/Controller/OrderController.php:17 | POST",
  ]);
  assert.deepEqual(snapshot.manifest.frameworks?.map((f) => [f.name, f.files.map((file) => file.path)]), [["symfony", ["config/routes.yaml", "config/services.yaml"]]]);
});

test("symfony: services.yaml aliases, arguments and _defaults bind are call edges with via and site; an event and a message are event nodes with their subscribers, listeners and handlers", (t) => {
  const dir = app(t);
  const snapshot = snapshotOf(dir);
  const calls = (source: string) => snapshot.edges.filter((e) => e.kind === "call" && e.source === source && e.resolution === "resolved" && e.via !== undefined).map((e) => [e.via, e.target, e.site, e.owner ?? null]);
  assert.deepEqual(calls(PLACE), [
    ["preference", "infra.StripeGateway.StripeGateway.charge", "config/services.yaml:11:5", null],
    ["preference", "infra.SystemClock.SystemClock.now", "config/services.yaml:13:5", null],
    ["argument", "infra.EmailNotifier.EmailNotifier.send", "config/services.yaml:6:13", null],
    // `$dispatcher->dispatch(new OrderPlaced)`, `$bus->dispatch(new GenerateInvoice)`: edges to the events their classes name.
    ["dispatch", "events.App-Event-OrderPlaced", undefined, null],
    ["dispatch", "events.App-Message-GenerateInvoice", undefined, null],
  ]);
  assert.deepEqual(
    snapshot.edges.filter((e) => e.via === "observer").map((e) => [e.source, e.target, e.site, e.binding]),
    [
      ["events.App-Event-OrderPlaced", "listeners.AuditListener.AuditListener.audit", "src/EventListener/AuditListener.php:7:3", "observer `AuditListener` (`App\\EventListener\\AuditListener::audit`) of the event `App\\Event\\OrderPlaced`"],
      ["events.App-Event-OrderPlaced", "subscribers.OrderSubscriber.OrderSubscriber.onOrderPlaced", "src/EventSubscriber/OrderSubscriber.php:9:5", "observer `OrderSubscriber` (`App\\EventSubscriber\\OrderSubscriber::onOrderPlaced`) of the event `App\\Event\\OrderPlaced`"],
      ["events.App-Message-GenerateInvoice", "handlers.GenerateInvoiceHandler.GenerateInvoiceHandler.__invoke", "src/MessageHandler/GenerateInvoiceHandler.php:7:3", "observer `handler GenerateInvoiceHandler` (`App\\MessageHandler\\GenerateInvoiceHandler::__invoke`) of the event `App\\Message\\GenerateInvoice`"],
    ],
  );
  // `arguments: $gateway` of one service wins over the alias of the interface.
  assert.deepEqual(calls("service.Billing.Billing.bill"), [["argument", "infra.PaypalGateway.PaypalGateway.charge", "config/services.yaml:18:13", null]]);
});

test("symfony: a flow through the container and the dispatcher is static ok in behavior, unverified in --static shape; deny sees the config edges", (t) => {
  const dir = app(t);
  const behavior = keylang(dir, ["check"]);
  assert.equal(behavior.status, 0, behavior.stdout + behavior.stderr);
  assert.match(behavior.stdout, /flows\.md:5:5: static ok infra\.StripeGateway\.StripeGateway\.charge: called from service\.OrderService\.OrderService\.place through the preference `App\\Contract\\PaymentGateway → App\\Infra\\StripeGateway` in `config\/services\.yaml:11`\n/);
  assert.match(behavior.stdout, /flows\.md:6:5: static ok infra\.EmailNotifier\.EmailNotifier\.send: called from [^\n]* through the argument `notifier`/);
  assert.match(behavior.stdout, /flows\.md:7:5: static ok subscribers\.OrderSubscriber\.OrderSubscriber\.onOrderPlaced: reachable from service\.OrderService\.OrderService\.place via events\.App-Event-OrderPlaced /);
  assert.match(behavior.stdout, /flows\.md:8:5: static ok handlers\.GenerateInvoiceHandler\.GenerateInvoiceHandler\.__invoke: reachable from [^\n]* via events\.App-Message-GenerateInvoice \([^\n]*the observer `handler GenerateInvoiceHandler`/);
  const shape = keylang(dir, ["check", "--static", "shape"]);
  for (const line of [5, 6, 7, 8]) assert.match(shape.stdout, new RegExp(`flows\\.md:${line}:5: static unverified `));
  assert.match(shape.stdout, /flows\.md:4:3: static ok service\.OrderService\.OrderService\.place/);

  writeTree(dir, { "keylang/rules.md": "# rules\n\n- deny service infra\n" });
  const denied = keylang(dir, ["check"]);
  assert.equal(denied.status, 1, denied.stdout);
  const k102 = denied.stdout.split("\n").filter((line) => line.includes("K102"));
  assert.deepEqual(k102, [
    "config/services.yaml:6:13: K102 divergence: `service.OrderService.OrderService` depends on `infra.EmailNotifier.EmailNotifier` through the argument `notifier` → `App\\Infra\\EmailNotifier` (config/services.yaml:6), which is denied by `deny service infra` (keylang/rules.md:3)",
    "config/services.yaml:11:5: K102 divergence: `service.OrderService.OrderService` depends on `infra.StripeGateway.StripeGateway` through the preference `App\\Contract\\PaymentGateway → App\\Infra\\StripeGateway` (config/services.yaml:11), which is denied by `deny service infra` (keylang/rules.md:3)",
    "config/services.yaml:13:5: K102 divergence: `service.OrderService.OrderService` depends on `infra.SystemClock.SystemClock` through the preference `App\\Contract\\Clock → App\\Infra\\SystemClock` (config/services.yaml:13), which is denied by `deny service infra` (keylang/rules.md:3)",
    "config/services.yaml:18:13: K102 divergence: `service.Billing.Billing` depends on `infra.PaypalGateway.PaypalGateway` through the argument `gateway` → `App\\Infra\\PaypalGateway` (config/services.yaml:18), which is denied by `deny service infra` (keylang/rules.md:3)",
  ]);
});

test("symfony: flows discover drafts the entry points' flows; an XML config is a hole, not a guess", (t) => {
  const dir = app(t);
  assert.equal(keylang(dir, ["map"]).status, 0);
  const discover = keylang(dir, ["flows", "discover", "--print"]);
  assert.equal(discover.status, 0, discover.stderr);
  assert.match(discover.stdout, /^- trigger consumer handlers\.GenerateInvoiceHandler\.GenerateInvoiceHandler\.__invoke$/m);
  assert.match(discover.stdout, /^- trigger cron scheduler\.CleanupTask\.CleanupTask\.__invoke$/m);
  assert.match(discover.stdout, /^- trigger route controller\.OrderController\.OrderController\.show$/m);
  writeTree(dir, { "config/services.xml": '<?xml version="1.0"?>\n<container><services><service id="App\\Contract\\Clock" alias="App\\Infra\\OtherClock"/></services></container>\n' });
  const snapshot = snapshotOf(dir);
  const hole = snapshot.coverage.find((c) => c.file === "config/services.xml");
  assert.equal(hole?.kind, "skipped-file");
  assert.equal(hole?.text, "framework:symfony");
  assert.match(hole?.reason ?? "", /^`config\/services\.xml` is Symfony config keylang does not read/);
  // A config the framework runs and keylang did not read: a step without a path is unverified, not fail.
  const coverage = keylang(dir, ["coverage"]);
  assert.equal(coverage.status, 0, coverage.stderr);
  assert.match(coverage.stdout, /skipped-file/);
});

test("symfony: `frameworks: []` turns the adapter off — ok becomes unverified, never fail", (t) => {
  const dir = app(t);
  const on = keylang(dir, ["check"]);
  writeTree(dir, { "keylang.json": JSON.stringify({ languages: ["php"], layers: LAYERS, frameworks: [] }) });
  const off = snapshotOf(dir);
  assert.equal(off.manifest.frameworks, undefined);
  assert.deepEqual(off.entries.filter((e) => e.framework === "symfony"), []);
  assert.ok(!off.edges.some((e) => e.via === "preference" || e.via === "argument" || e.via === "observer" || e.via === "dispatch"));
  assert.ok(!Object.values(off.nodes).some((node) => node.kind === "event"));
  assert.ok(off.coverage.some((c) => c.kind === "skipped-file" && c.file === "config/services.yaml" && c.text === "framework:symfony"));
  const r = keylang(dir, ["check"]);
  const verdicts = (out: string): Map<string, string> => new Map([...out.matchAll(/^(\S+:\d+:\d+): static (ok|fail|unverified) /gm)].map((m) => [m[1]!, m[2]!]));
  const before = verdicts(on.stdout);
  const after = verdicts(r.stdout);
  assert.equal(before.size, 5);
  for (const [at, verdict] of before) {
    const now = after.get(at);
    assert.ok(now === verdict || now === "unverified", `${at}: ${verdict} → ${now}`);
  }
  for (const line of [5, 6, 7, 8]) assert.equal(after.get(`keylang/flows.md:${line}:5`), "unverified");
});
