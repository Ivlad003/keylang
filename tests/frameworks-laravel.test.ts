// The Laravel adapter (ADR 0022, business-flows 35) through the real CLI on a
// small Laravel-shaped app: `composer.json` with `laravel/framework`, a
// service provider that binds an interface to a class (and one to a closure),
// a facade of the repository, `routes/web.php` and `routes/api.php` with a
// prefix group, `Route::group`, a resource and a closure route, an event and
// its listener in `EventServiceProvider::$listen`, a queued job, a command
// and the schedule in `routes/console.php`.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { AnalysisSnapshot } from "../src/snapshot.ts";
import { keylang, tempDir, writeTree } from "./cli-helpers.ts";

const php = (lines: string[]): string => `<?php\n${lines.join("\n")}\n`;

const LAYERS = {
  http: ["app/Http/**"],
  domain: ["app/Domain/**"],
  infra: ["app/Infra/**"],
  providers: ["app/Providers/**"],
  console: ["app/Console/**"],
  routes: ["routes/**"],
};

const FLOW = [
  "# flow placeOrder",
  "",
  "- trigger http.Controllers.OrderController.OrderController.store",
  "  - step domain.Services.OrderService.OrderService.place",
  "    - step infra.StripeGateway.StripeGateway.charge",
  "    - step domain.Listeners.SendReceipt.SendReceipt.handle",
  "    - step domain.Jobs.ProcessInvoice.ProcessInvoice.handle",
  "",
].join("\n");

const APP: Record<string, string> = {
  "composer.json": JSON.stringify({ name: "shop/app", require: { php: "^8.2", "laravel/framework": "^11.0" }, autoload: { "psr-4": { "App\\": "app/" } } }, null, 2),
  "keylang.json": JSON.stringify({ languages: ["php"], layers: LAYERS }),
  // The framework is a composer package: its classes are external, not holes.
  "composer.lock": JSON.stringify({ packages: [{ name: "laravel/framework", autoload: { "psr-4": { "Illuminate\\": "src/Illuminate/" } } }] }),
  "keylang/flows.md": FLOW,
  "app/Domain/Contracts/PaymentGateway.php": php(["namespace App\\Domain\\Contracts;", "", "interface PaymentGateway", "{", "    public function charge(int $amount): bool;", "}"]),
  "app/Domain/Contracts/Clock.php": php(["namespace App\\Domain\\Contracts;", "", "interface Clock", "{", "    public function now(): int;", "}"]),
  "app/Infra/StripeGateway.php": php(["namespace App\\Infra;", "", "use App\\Domain\\Contracts\\PaymentGateway;", "", "class StripeGateway implements PaymentGateway", "{", "    public function charge(int $amount): bool", "    {", "        return $amount > 0;", "    }", "}"]),
  "app/Domain/Events/OrderPlaced.php": php(["namespace App\\Domain\\Events;", "", "class OrderPlaced", "{", "    public function __construct(public int $amount) {}", "}"]),
  "app/Domain/Listeners/AuditOrder.php": php(["namespace App\\Domain\\Listeners;", "", "class AuditOrder", "{", "    public function record(): void", "    {", "    }", "}"]),
  "app/Domain/Listeners/SendReceipt.php": php(["namespace App\\Domain\\Listeners;", "", "use App\\Domain\\Events\\OrderPlaced;", "", "class SendReceipt", "{", "    public function handle(OrderPlaced $event): void", "    {", "    }", "}"]),
  "app/Domain/Jobs/ProcessInvoice.php": php([
    "namespace App\\Domain\\Jobs;",
    "",
    "use Illuminate\\Contracts\\Queue\\ShouldQueue;",
    "use Illuminate\\Foundation\\Bus\\Dispatchable;",
    "",
    "class ProcessInvoice implements ShouldQueue",
    "{",
    "    use Dispatchable;",
    "",
    "    public function __construct(public int $amount) {}",
    "",
    "    public function handle(): void",
    "    {",
    "    }",
    "}",
  ]),
  "app/Domain/Services/OrderService.php": php([
    "namespace App\\Domain\\Services;",
    "",
    "use App\\Domain\\Contracts\\Clock;",
    "use App\\Domain\\Contracts\\PaymentGateway;",
    "use App\\Domain\\Events\\OrderPlaced;",
    "use App\\Domain\\Jobs\\ProcessInvoice;",
    "",
    "class OrderService",
    "{",
    "    public function __construct(private PaymentGateway $gateway, private Clock $clock) {}",
    "",
    "    public function place(int $amount): void",
    "    {",
    "        $this->gateway->charge($amount);",
    "        $this->clock->now();",
    "        event(new OrderPlaced($amount));",
    "        ProcessInvoice::dispatch($amount);",
    "    }",
    "}",
  ]),
  "app/Domain/Facades/Payment.php": php([
    "namespace App\\Domain\\Facades;",
    "",
    "use App\\Domain\\Contracts\\PaymentGateway;",
    "use Illuminate\\Support\\Facades\\Facade;",
    "",
    "class Payment extends Facade",
    "{",
    "    protected static function getFacadeAccessor(): string",
    "    {",
    "        return PaymentGateway::class;",
    "    }",
    "}",
  ]),
  "app/Http/Controllers/OrderController.php": php([
    "namespace App\\Http\\Controllers;",
    "",
    "use App\\Domain\\Contracts\\PaymentGateway;",
    "use App\\Domain\\Facades\\Payment;",
    "use App\\Domain\\Services\\OrderService;",
    "",
    "class OrderController",
    "{",
    "    public function __construct(private OrderService $orders, private PaymentGateway $gateway) {}",
    "",
    "    public function store(): void",
    "    {",
    "        $this->orders->place(10);",
    "    }",
    "",
    "    public function refund(): void",
    "    {",
    "        $this->gateway->charge(-1);",
    "    }",
    "",
    "    public function cancel(): void",
    "    {",
    "        Payment::charge(-2);",
    "    }",
    "}",
  ]),
  "app/Http/Controllers/PhotoController.php": php(["namespace App\\Http\\Controllers;", "", "class PhotoController", "{", "    public function index(): void {}", "", "    public function store(): void {}", "", "    public function show(int $photo): void {}", "}"]),
  "app/Http/Controllers/Admin/ReportController.php": php(["namespace App\\Http\\Controllers\\Admin;", "", "class ReportController", "{", "    public function __invoke(): void {}", "}"]),
  "app/Console/Commands/SendReport.php": php([
    "namespace App\\Console\\Commands;",
    "",
    "use Illuminate\\Console\\Command;",
    "",
    "class SendReport extends Command",
    "{",
    "    protected $signature = 'report:send {--queue}';",
    "",
    "    public function handle(): void",
    "    {",
    "    }",
    "}",
  ]),
  "app/Providers/AppServiceProvider.php": php([
    "namespace App\\Providers;",
    "",
    "use App\\Domain\\Contracts\\Clock;",
    "use App\\Domain\\Contracts\\PaymentGateway;",
    "use App\\Infra\\StripeGateway;",
    "use Illuminate\\Support\\ServiceProvider;",
    "",
    "class AppServiceProvider extends ServiceProvider",
    "{",
    "    public function register(): void",
    "    {",
    "        $this->app->bind(PaymentGateway::class, StripeGateway::class);",
    "        $this->app->singleton(Clock::class, function () {",
    "            return new \\App\\Infra\\StripeGateway();",
    "        });",
    "    }",
    "}",
  ]),
  "app/Providers/EventServiceProvider.php": php([
    "namespace App\\Providers;",
    "",
    "use App\\Domain\\Events\\OrderPlaced;",
    "use App\\Domain\\Listeners\\SendReceipt;",
    "use Illuminate\\Foundation\\Support\\Providers\\EventServiceProvider as ServiceProvider;",
    "",
    "class EventServiceProvider extends ServiceProvider",
    "{",
    "    protected $listen = [",
    "        OrderPlaced::class => [",
    "            SendReceipt::class,",
    "            'App\\Domain\\Listeners\\AuditOrder@record',",
    "        ],",
    "    ];",
    "}",
  ]),
  "routes/web.php": php([
    "use App\\Http\\Controllers\\Admin\\ReportController;",
    "use App\\Http\\Controllers\\OrderController;",
    "use App\\Http\\Controllers\\PhotoController;",
    "use Illuminate\\Support\\Facades\\Route;",
    "",
    "Route::post('/orders', [OrderController::class, 'store'])->name('orders.store');",
    "Route::resource('photos', PhotoController::class);",
    "Route::prefix('admin')->group(function () {",
    "    Route::get('/reports', ReportController::class);",
    "});",
    "Route::get('/', function () {",
    "    return 'home';",
    "});",
  ]),
  "routes/api.php": php([
    "use App\\Http\\Controllers\\OrderController;",
    "use Illuminate\\Support\\Facades\\Route;",
    "",
    "Route::group(['prefix' => 'v1'], function () {",
    "    Route::post('/refunds', [OrderController::class, 'refund']);",
    "});",
  ]),
  "routes/console.php": php([
    "use App\\Domain\\Jobs\\ProcessInvoice;",
    "use Illuminate\\Support\\Facades\\Artisan;",
    "use Illuminate\\Support\\Facades\\Schedule;",
    "",
    "Artisan::command('inspire', function () {",
    "    $this->comment('Be well.');",
    "});",
    "Schedule::command('report:send')->daily();",
    "Schedule::job(new ProcessInvoice(0))->hourly();",
  ]),
};

function app(t: TestContext, extra: Record<string, string> = {}): string {
  const dir = tempDir(t, "keylang-laravel-");
  writeTree(dir, { ...APP, ...extra });
  return dir;
}

function snapshotOf(dir: string): AnalysisSnapshot {
  const run = keylang(dir, ["map"]);
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as AnalysisSnapshot;
}

function setFrameworks(dir: string, frameworks: string[]): void {
  writeTree(dir, { "keylang.json": JSON.stringify({ languages: ["php"], layers: LAYERS, frameworks }) });
}

const PLACE = "domain.Services.OrderService.OrderService.place";
const REFUND = "http.Controllers.OrderController.OrderController.refund";

test("laravel: routes, commands, the schedule, listeners and queued jobs are entry points", (t) => {
  const dir = app(t);
  const snapshot = snapshotOf(dir);
  const rows = snapshot.entries.filter((e) => e.framework === "laravel").map((e) => [e.kind, e.label, e.id, `${e.file}:${e.line}`, e.method ?? "", e.note ?? ""].join(" | "));
  assert.deepEqual(rows, [
    "cli | inspire | routes.console | routes/console.php:6 |  | closure command: the console route file stands for it",
    "cli | report:send | console.Commands.SendReport.SendReport.handle | app/Console/Commands/SendReport.php:10 |  | ",
    "consumer | App\\Domain\\Jobs\\ProcessInvoice | domain.Jobs.ProcessInvoice.ProcessInvoice.handle | app/Domain/Jobs/ProcessInvoice.php:13 |  | ",
    "cron | App\\Domain\\Jobs\\ProcessInvoice | domain.Jobs.ProcessInvoice.ProcessInvoice.handle | app/Domain/Jobs/ProcessInvoice.php:13 |  | ",
    "cron | report:send | console.Commands.SendReport.SendReport.handle | app/Console/Commands/SendReport.php:10 |  | ",
    "observer | App\\Domain\\Events\\OrderPlaced (AuditOrder) | domain.Listeners.AuditOrder.AuditOrder.record | app/Domain/Listeners/AuditOrder.php:6 |  | ",
    "observer | App\\Domain\\Events\\OrderPlaced (SendReceipt) | domain.Listeners.SendReceipt.SendReceipt.handle | app/Domain/Listeners/SendReceipt.php:8 |  | ",
    "route | GET / | routes.web | routes/web.php:12 | GET | handler written in place: the route file stands for it",
    "route | GET /admin/reports | http.Controllers.Admin.ReportController.ReportController.__invoke | app/Http/Controllers/Admin/ReportController.php:6 | GET | ",
    "route | GET /photos | http.Controllers.PhotoController.PhotoController.index | app/Http/Controllers/PhotoController.php:6 | GET | ",
    "route | GET /photos/{photo} | http.Controllers.PhotoController.PhotoController.show | app/Http/Controllers/PhotoController.php:10 | GET | ",
    "route | POST /api/v1/refunds | http.Controllers.OrderController.OrderController.refund | app/Http/Controllers/OrderController.php:17 | POST | ",
    "route | POST /orders | http.Controllers.OrderController.OrderController.store | app/Http/Controllers/OrderController.php:12 | POST | ",
    "route | POST /photos | http.Controllers.PhotoController.PhotoController.store | app/Http/Controllers/PhotoController.php:8 | POST | ",
  ]);
  // The route files, the providers are the framework's config: in manifest.frameworks.
  assert.deepEqual(snapshot.manifest.frameworks?.map((f) => [f.name, f.files.map((file) => file.path)]), [
    ["laravel", ["app/Providers/AppServiceProvider.php", "app/Providers/EventServiceProvider.php", "routes/api.php", "routes/console.php", "routes/web.php"]],
  ]);
  const listed = keylang(dir, ["entries", "--kind", "route"]);
  assert.equal(listed.status, 0, listed.stderr);
  assert.match(listed.stdout, /route\s+POST \/api\/v1\/refunds\s+http\.Controllers\.OrderController\.OrderController\.refund/);
});

test("laravel: a call through a bound interface and a facade are call edges with via, site and owner; an event and a queued job are event nodes with their observers", (t) => {
  const dir = app(t);
  const snapshot = snapshotOf(dir);
  const calls = (source: string) => snapshot.edges.filter((e) => e.kind === "call" && e.source === source && e.resolution === "resolved" && e.via !== undefined);
  assert.deepEqual(
    calls(PLACE).map((e) => [e.via, e.target, e.site, e.owner, e.binding]),
    [
      ["preference", "infra.StripeGateway.StripeGateway.charge", "app/Providers/AppServiceProvider.php:13:9", "providers.AppServiceProvider", "`App\\Domain\\Contracts\\PaymentGateway → App\\Infra\\StripeGateway`"],
      // `event(new OrderPlaced)` and `ProcessInvoice::dispatch()`: edges to the events their classes name.
      ["dispatch", "events.App-Domain-Events-OrderPlaced", undefined, undefined, undefined],
      ["dispatch", "events.App-Domain-Jobs-ProcessInvoice", undefined, undefined, undefined],
    ],
  );
  // The listeners of `$listen` (a class, and a string `Class@method`) and the job's `handle` observe the events.
  assert.deepEqual(
    snapshot.edges.filter((e) => e.via === "observer").map((e) => [e.source, e.target, e.site, e.owner]),
    [
      ["events.App-Domain-Events-OrderPlaced", "domain.Listeners.SendReceipt.SendReceipt.handle", "app/Providers/EventServiceProvider.php:10:15", "providers.EventServiceProvider"],
      ["events.App-Domain-Events-OrderPlaced", "domain.Listeners.AuditOrder.AuditOrder.record", "app/Providers/EventServiceProvider.php:10:15", "providers.EventServiceProvider"],
      ["events.App-Domain-Jobs-ProcessInvoice", "domain.Jobs.ProcessInvoice.ProcessInvoice.handle", "app/Domain/Jobs/ProcessInvoice.php:7:1", "domain.Jobs.ProcessInvoice"],
    ],
  );
  assert.equal(snapshot.nodes["events.App-Domain-Events-OrderPlaced"]?.kind, "event");
  assert.deepEqual(
    calls(REFUND).map((e) => [e.text, e.via, e.target]),
    [["this.gateway.charge", "preference", "infra.StripeGateway.StripeGateway.charge"]],
  );
  // The facade's accessor names the interface; the provider binds it: `Payment::charge()` reaches the class.
  assert.deepEqual(
    calls("http.Controllers.OrderController.OrderController.cancel").map((e) => [e.text, e.via, e.target, e.site, e.binding]),
    [["Payment.charge", "preference", "infra.StripeGateway.StripeGateway.charge", "app/Domain/Facades/Payment.php:9:5", "`App\\Domain\\Facades\\Payment → App\\Domain\\Contracts\\PaymentGateway → App\\Infra\\StripeGateway`"]],
  );
  // A binding to a closure is a hole with the reason; the call through it stays a hole.
  assert.ok(snapshot.coverage.some((c) => c.file === "app/Providers/AppServiceProvider.php" && c.line === 14 && /binds `App\\Domain\\Contracts\\Clock` to a closure/.test(c.reason)), JSON.stringify(snapshot.coverage));
  assert.ok(snapshot.coverage.some((c) => c.kind === "dynamic-call" && c.text === "this.clock.now"));
});

test("laravel: a flow through the binding, the listener and the job is static ok in behavior and unverified in --static shape", (t) => {
  const dir = app(t);
  const behavior = keylang(dir, ["check"]);
  assert.equal(behavior.status, 0, behavior.stdout + behavior.stderr);
  assert.match(behavior.stdout, /flows\.md:5:5: static ok infra\.StripeGateway\.StripeGateway\.charge: called from domain\.Services\.OrderService\.OrderService\.place through the preference `App\\Domain\\Contracts\\PaymentGateway → App\\Infra\\StripeGateway` in `app\/Providers\/AppServiceProvider\.php:13`\n/);
  assert.match(behavior.stdout, /flows\.md:6:5: static ok domain\.Listeners\.SendReceipt\.SendReceipt\.handle: reachable from domain\.Services\.OrderService\.OrderService\.place via events\.App-Domain-Events-OrderPlaced \([^\n]*the observer `SendReceipt` \(`App\\Domain\\Listeners\\SendReceipt::handle`\) of the event `App\\Domain\\Events\\OrderPlaced` in `app\/Providers\/EventServiceProvider\.php:10`\)\n/);
  assert.match(behavior.stdout, /flows\.md:7:5: static ok domain\.Jobs\.ProcessInvoice\.ProcessInvoice\.handle: reachable from [^\n]* via events\.App-Domain-Jobs-ProcessInvoice \([^\n]*the observer `queued job ProcessInvoice`/);
  const shape = keylang(dir, ["check", "--static", "shape"]);
  assert.match(shape.stdout, /flows\.md:5:5: static unverified infra\.StripeGateway\.StripeGateway\.charge/);
  assert.match(shape.stdout, /flows\.md:6:5: static unverified domain\.Listeners\.SendReceipt\.SendReceipt\.handle/);
  // A call written in the code stays ok in both.
  assert.match(shape.stdout, /flows\.md:4:3: static ok domain\.Services\.OrderService\.OrderService\.place/);
});

test("laravel: `deny` sees a binding, a facade and a listener as dependencies of the code that declares them, at its line", (t) => {
  const dir = app(t, { "keylang/rules.md": "# rules\n\n- deny providers domain.Listeners.AuditOrder\n- deny domain infra\n" });
  const r = keylang(dir, ["check"]);
  assert.equal(r.status, 1, r.stdout);
  const k102 = r.stdout.split("\n").filter((line) => line.includes("K102") && line.includes("through"));
  assert.deepEqual(k102, [
    // The facade's accessor is the facade's own config: through it the facade depends on the bound class.
    "app/Domain/Facades/Payment.php:9:5: K102 divergence: `domain.Facades.Payment` depends on `infra.StripeGateway.StripeGateway` through the preference `App\\Domain\\Facades\\Payment → App\\Domain\\Contracts\\PaymentGateway → App\\Infra\\StripeGateway` (app/Domain/Facades/Payment.php:9), which is denied by `deny domain infra` (keylang/rules.md:4)",
    // `'Class@method'` names the listener in a string: no `use`, so only the observer edge makes the dependency.
    "app/Providers/EventServiceProvider.php:10:15: K102 divergence: `providers.EventServiceProvider` depends on `domain.Listeners.AuditOrder.AuditOrder` through the observer `AuditOrder` (`App\\Domain\\Listeners\\AuditOrder::record`) of the event `App\\Domain\\Events\\OrderPlaced` (app/Providers/EventServiceProvider.php:10), which is denied by `deny providers domain.Listeners.AuditOrder` (keylang/rules.md:3)",
  ]);
  // The binding is the provider's dependency, not the caller's: `deny domain infra` holds for it.
  assert.ok(!r.stdout.includes("`domain.Services.OrderService` depends on `infra"), r.stdout);
});

test("laravel: flows discover drafts a flow for the entry points; coverage names what stays blind", (t) => {
  const dir = app(t);
  assert.equal(keylang(dir, ["map"]).status, 0);
  const discover = keylang(dir, ["flows", "discover", "--print"]);
  assert.equal(discover.status, 0, discover.stderr);
  // `store` is the trigger of the specified flow; the other entry points are drafted, typed by their kind.
  assert.match(discover.stderr, /already specified: http\.Controllers\.OrderController\.OrderController\.store/);
  assert.match(discover.stdout, /^- trigger route http\.Controllers\.OrderController\.OrderController\.refund\n {2}- step infra\.StripeGateway\.StripeGateway\.charge <!-- keylang:algo via preference app\/Providers\/AppServiceProvider\.php:13:9 -->$/m);
  assert.match(discover.stdout, /^- trigger consumer domain\.Jobs\.ProcessInvoice\.ProcessInvoice\.handle$/m);
  const coverage = keylang(dir, ["coverage"]);
  assert.equal(coverage.status, 0, coverage.stderr);
  assert.match(coverage.stdout, /unsupported: `X` binds `X` to a closure: the class it builds is code keylang does not read/);
  assert.match(coverage.stdout, /route {2}POST \/api\/v1\/refunds {2}http\.Controllers\.OrderController\.OrderController\.refund/);
});

test("laravel: `frameworks: []` turns the adapter off — ok and fail become unverified, never the other way", (t) => {
  const dir = app(t, { "keylang/rules.md": "# rules\n\n- deny providers domain.Listeners.AuditOrder\n" });
  const on = keylang(dir, ["check"]);
  setFrameworks(dir, []);
  const off = snapshotOf(dir);
  assert.equal(off.manifest.frameworks, undefined);
  assert.deepEqual(off.entries.filter((e) => e.framework === "laravel"), []);
  assert.ok(!off.edges.some((e) => e.via === "preference" || e.via === "observer" || e.via === "dispatch"));
  assert.ok(!Object.values(off.nodes).some((node) => node.kind === "event"));
  // Each config file the adapter would read is a hole of the snapshot.
  assert.ok(off.coverage.some((c) => c.kind === "skipped-file" && c.file === "routes/web.php" && c.text === "framework:laravel"));
  const r = keylang(dir, ["check"]);
  const verdicts = (out: string): Map<string, string> => new Map([...out.matchAll(/^(\S+:\d+:\d+): static (ok|fail|unverified) /gm)].map((m) => [m[1]!, m[2]!]));
  const before = verdicts(on.stdout);
  const after = verdicts(r.stdout);
  assert.ok(before.size > 0);
  for (const [at, verdict] of before) {
    const now = after.get(at);
    assert.ok(now === verdict || now === "unverified", `${at}: ${verdict} → ${now}`);
  }
  assert.equal(after.get("keylang/flows.md:6:5"), "unverified");
  // The listener's K102 was the observer edge alone: with the adapter off the rule is unverified, not ok.
  assert.match(on.stdout, /K102[^\n]*through the observer `AuditOrder`/);
  assert.ok(!/K102/.test(r.stdout), r.stdout);
  assert.match(r.stdout, /keylang\/rules\.md:3:1: unverified [^\n]*`laravel` config keylang does not read/);
});
