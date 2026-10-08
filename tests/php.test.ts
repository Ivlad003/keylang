// End-to-end tests of the PHP frontend: `init`, `map` and `check` through the
// CLI on minimal repositories copied to a temporary directory. A PHP import
// names a declaration by its qualified name, and a class of the file's own
// namespace needs none: the snapshot must follow both.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");

function keylang(cwd: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** The `php-shop` fixture in a temporary directory. */
function shop(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-php-shop-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(join(root, "tests/fixtures/php-shop"), dir, { recursive: true });
  return dir;
}

/** A repository of `files` in a temporary directory. */
function repo(t: TestContext, files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-php-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  write(dir, files);
  return dir;
}

function write(dir: string, files: Record<string, string>): void {
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), text);
  }
}

interface Snapshot {
  system: { name: string | null; brief: string | null; source: string | null };
  manifest: { files: { path: string }[] };
  nodes: Record<string, { kind: string; doc: string | null; escapes?: { reason: string } }>;
  edges: { kind: string; source: string; target: string | null; resolution: string; text: string; provenance: string; docblock?: string; via?: string; closure?: true; site?: string; line: number; col: number }[];
  coverage: { kind: string; file: string; line: number; reason: string; source: string | null }[];
}

function snapshot(dir: string): Snapshot {
  return JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as Snapshot;
}

function edges(index: Snapshot): string[] {
  return index.edges.map((e) => `${e.kind} ${e.source} -> ${e.target ?? "?"}`);
}

const SHOP_LAYERS = { languages: ["php"], layers: { bin: ["bin/**"], App: ["src/App/**"], Domain: ["src/Domain/**"], Infra: ["src/Infra/**"], Support: ["src/Support/**"] } };

test("php: init detects the language and the layers; map follows `use`, a class of the same namespace, calls, types and composer packages", (t) => {
  const dir = shop(t);
  const init = keylang(dir, ["init"]);
  assert.equal(init.status, 0, init.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "keylang.json"), "utf8")), { format: 2, ...SHOP_LAYERS, module: "file", layers: SHOP_LAYERS.layers });
  const index = snapshot(dir);
  const all = edges(index);
  for (const edge of [
    // `use`, a group `use` and `use function`; the vendor autoloader adds none.
    "import App.Checkout -> Domain.Order",
    "import App.Checkout -> Domain.Pricing",
    "import App.Checkout -> Infra.Store",
    "import App.Checkout -> Support.helpers",
    "import Infra.Store -> external.monolog-monolog",
    "import bin.shop -> App.Checkout",
    // `Pricing` in `Order.php` needs no `use`: the same namespace.
    "import Domain.Order -> Domain.Pricing",
    // `new`, a variable assigned `new Order(…)`, a property promoted from a typed constructor parameter, a static call, `$this`, a function.
    "call App.Checkout.Checkout.buy -> Domain.Order.Order",
    "call App.Checkout.Checkout.buy -> Domain.Order.Order.add",
    "call App.Checkout.Checkout.buy -> Infra.Store.Store.save",
    "call App.Checkout.Checkout.buy -> Domain.Pricing.Pricing.round",
    "call App.Checkout.Checkout.buy -> App.Checkout.Checkout.pick",
    "call App.Checkout.Checkout.buy -> Support.helpers.money",
    "call Domain.Order.Order.total -> Domain.Pricing.Pricing.sum",
    "call Infra.Store.Store.save -> Domain.Order.Order.total",
    // Type hints of parameters.
    "type Infra.Store.Store.save -> Domain.Order.Order",
    "type Domain.Order.Order.__construct -> Domain.Pricing.Pricing",
  ]) assert.ok(all.includes(edge), `${edge}\n${all.join("\n")}`);
  // PHP's own functions (`array_sum`, `sprintf`) and the vendor files are no nodes.
  assert.deepEqual(Object.keys(index.nodes).filter((id) => id.startsWith("external.")), ["external.monolog-monolog"]);
  assert.ok(!index.manifest.files.some((f) => f.path.startsWith("vendor/")));
  // `$handler()` calls a value: a hole, not an edge.
  assert.ok(index.coverage.some((c) => c.kind === "dynamic-call" && c.reason === "call through a local value `handler`" && c.source === "App.Checkout.Checkout.buy"), JSON.stringify(index.coverage));
  // PHPDoc: the description before the tags.
  assert.equal(index.nodes["Domain.Order.Order"]?.doc, "An order of a cart: its lines and their total.");
  assert.equal(index.nodes["Domain.Order.Order.add"]?.doc, "Adds a line.");
  assert.equal(index.nodes["Support.helpers.money"]?.doc, "Cents as a decimal string.");
  assert.equal(keylang(dir, ["map", "--check"]).status, 0);
});

test("php: a flow over PHP calls is statically ok; a forbidden `use` between layers is a K102 divergence", (t) => {
  const dir = shop(t);
  writeFileSync(join(dir, "keylang.json"), JSON.stringify(SHOP_LAYERS));
  write(dir, {
    "keylang/flows.md": "# flow checkout\n\n- trigger App.Checkout.Checkout.buy\n  - step Domain.Order.Order.add\n  - step Infra.Store.Store.save\n    - step Domain.Order.Order.total\n      - step Domain.Pricing.Pricing.sum\n  - step Support.helpers.money\n",
    "keylang/rules.md": "# rules\n\n- deny Domain Infra\n",
  });
  const ok = keylang(dir, ["check"]);
  assert.equal(ok.status, 0, ok.stdout);
  assert.match(ok.stdout, /flows\.md:7:7: static ok Domain\.Pricing\.Pricing\.sum: called from Domain\.Order\.Order\.total/);
  writeFileSync(join(dir, "src/Domain/Order.php"), readFileSync(join(dir, "src/Domain/Order.php"), "utf8").replace("namespace Shop\\Domain;\n", "namespace Shop\\Domain;\n\nuse Shop\\Infra\\Store;\n"));
  const denied = keylang(dir, ["check"]);
  assert.equal(denied.status, 1, denied.stdout);
  assert.match(denied.stdout, /src\/Domain\/Order\.php:7:1: K102 divergence: `Domain\.Order` depends on `Infra\.Store`/);
});

test("php: composer.json names the repository and declares packages; PHP, its extensions and a package only in the lock are none", (t) => {
  const dir = shop(t);
  writeFileSync(join(dir, "keylang.json"), JSON.stringify(SHOP_LAYERS));
  write(dir, { "keylang/rules.md": "# rules\n\n- deny Infra external.phpunit-phpunit\n- deny Support external.psr-log\n- deny Support external.php\n" });
  assert.equal(keylang(dir, ["map"]).status, 0);
  assert.deepEqual(snapshot(dir).system, { name: "acme/shop", brief: "A shop that sells things online.", source: "composer.json" });
  const o = keylang(dir, ["check"]);
  // `require-dev` declares phpunit/phpunit; psr/log is only in the lock, and `php` is the platform.
  assert.doesNotMatch(o.stdout, /external\.phpunit-phpunit/);
  assert.match(o.stdout, /rules\.md:4:16: K001 dangling reference `external\.psr-log`/);
  assert.match(o.stdout, /rules\.md:5:16: K001 dangling reference `external\.php`/);
});

test("php: names resolve as PHP resolves them: a global function after the namespace's, PHP's own classes, a namespace alias, includes", (t) => {
  const dir = repo(t, {
    "keylang.json": JSON.stringify({ languages: ["php"], layers: { core: ["src/Core/**"], web: ["src/Web/**"], lib: ["lib/**"] } }),
    "lib/legacy.php": "<?php\n/** Helpers from before namespaces. */\n\nfunction legacy_total(array $xs): int { return array_sum($xs); }\n",
    "src/Core/Base.php": "<?php\nnamespace App\\Core;\n\nabstract class Base\n{\n    public function __construct() { $this->boot(); }\n    protected function boot(): void {}\n    public function hello(): string { return 'hi'; }\n}\n",
    "src/Core/Repo.php": "<?php\nnamespace App\\Core;\n\ninterface Repo { public function find(int $id): ?array; }\n",
    "src/Web/Page.php": [
      "<?php",
      "namespace App\\Web;",
      "",
      "use App\\Core;",
      "use App\\Core\\Base;",
      "",
      "final class Page extends Base",
      "{",
      "    public function __construct(private Core\\Repo $repo)",
      "    {",
      "        parent::__construct();",
      "    }",
      "",
      "    public function run(): void",
      "    {",
      "        parent::hello();",
      "        self::make();",
      "        legacy_total([1, 2]);",
      "        strlen('x');",
      "        new \\DateTimeImmutable();",
      "        $this->repo->find(1);",
      "        require_once __DIR__ . '/../../lib/legacy.php';",
      "        include $this->file();",
      "    }",
      "",
      "    public static function make(): self { return new self(new Memory()); }",
      "",
      "    private function file(): string { return 'x.php'; }",
      "}",
      "",
    ].join("\n"),
    "src/Web/Memory.php": "<?php\nnamespace App\\Web;\n\nuse App\\Core\\Repo;\n\nclass Memory implements Repo\n{\n    public function find(int $id): ?array { return null; }\n}\n",
  });
  assert.equal(keylang(dir, ["map"]).status, 0);
  const index = snapshot(dir);
  const all = edges(index);
  for (const edge of [
    // `parent::` is the base class; `self::make()` a static method of the class.
    "call web.Page.Page.__construct -> core.Base.Base.__construct",
    "call web.Page.Page.run -> core.Base.Base.hello",
    "call web.Page.Page.run -> web.Page.Page.make",
    "call web.Page.Page.make -> web.Page.Page",
    // `legacy_total` is not in `App\\Web`: PHP falls back to the global function.
    "call web.Page.Page.run -> lib.legacy.legacy_total",
    "import web.Page -> lib.legacy",
    // `Core\\Repo` through the namespace alias `use App\\Core;`.
    "import web.Page -> core.Repo",
    "type web.Page.Page.__construct -> core.Repo.Repo",
    "type web.Memory.Memory -> core.Repo.Repo",
  ]) assert.ok(all.includes(edge), `${edge}\n${all.join("\n")}`);
  // `use App\\Core;` is a namespace: no edge, no hole. `strlen` and `\\DateTimeImmutable` are PHP's own: no node.
  assert.ok(!index.coverage.some((c) => c.kind === "unresolved-import"), JSON.stringify(index.coverage));
  assert.ok(!Object.keys(index.nodes).some((id) => id.startsWith("external.")));
  // An interface is a type: a call through a value typed with it is a hole, as in TypeScript.
  assert.equal(index.nodes["core.Repo.Repo"]?.kind, "type");
  assert.ok(index.coverage.some((c) => c.kind === "dynamic-call" && c.source === "web.Page.Page.run" && c.reason === "call through an interface `Core\\Repo`"), JSON.stringify(index.coverage));
  // A path computed at run time is a hole of the module's dependencies.
  assert.ok(index.coverage.some((c) => c.kind === "unsupported" && c.reason === "an include of a path computed at run time" && c.source === "web.Page"));
  // The file's docblock documents the module, not the function under it.
  assert.equal(index.nodes["lib.legacy"]?.doc, "Helpers from before namespaces.");
  assert.equal(index.nodes["lib.legacy.legacy_total"]?.doc, null);
});

test("php: what PHP chooses at run time is a hole or an escape: `$obj->$m()`, `new $class`, `call_user_func`, callables and magic methods", (t) => {
  const dir = repo(t, {
    "keylang.json": JSON.stringify({ languages: ["php"], layers: { web: ["src/**"] } }),
    "src/Page.php": [
      "<?php",
      "namespace App;",
      "",
      "class Page",
      "{",
      "    public function run(string $m, string $class): void",
      "    {",
      "        $this->$m();",
      "        new $class();",
      "        call_user_func([$this, 'hidden']);",
      "        $routes = [[Page::class, 'show']];",
      "        $len = strlen(...);",
      "        eval('return 1;');",
      "    }",
      "",
      "    public function show(): void {}",
      "",
      "    public function __toString(): string { return 'page'; }",
      "",
      "    private function hidden(): void {}",
      "}",
      "",
    ].join("\n"),
  });
  assert.equal(keylang(dir, ["map"]).status, 0);
  const index = snapshot(dir);
  const hole = (kind: string, reason: string): boolean => index.coverage.some((c) => c.kind === kind && c.reason === reason && c.source === "web.Page.Page.run");
  assert.ok(hole("dynamic-call", "call through an expression `$this->$m()`"), JSON.stringify(index.coverage));
  assert.ok(hole("dynamic-call", "call through a local value `class`"), JSON.stringify(index.coverage));
  assert.ok(hole("unsupported", "`call_user_func` calls a callable chosen at run time"));
  assert.ok(hole("unsupported", "`eval` runs code keylang cannot read"));
  // Held as values, a framework or `call_user_func` may call them; `__toString` runs on a string conversion.
  assert.equal(index.nodes["web.Page.Page.hidden"]?.escapes?.reason, "`hidden` is read as a value");
  assert.equal(index.nodes["web.Page.Page.show"]?.escapes?.reason, "`show` is read as a value");
  assert.equal(index.nodes["web.Page.Page.__toString"]?.escapes?.reason, "`__toString` is called implicitly");
  // `strlen(...)` makes a callable: no call of `strlen`.
  assert.ok(!index.edges.some((e) => e.text === "strlen"));
});

/** A PHP 7 class: untyped properties whose classes the constructor and the docblocks say. */
const PROPERTY_FILES = {
  "keylang.json": JSON.stringify({ languages: ["php"], layers: { app: ["src/App/**"], domain: ["src/Domain/**"] } }),
  "src/Domain/Store.php": "<?php\nnamespace Shop\\Domain;\n\nclass Store\n{\n    public function save(): void {}\n}\n",
  "src/Domain/Mailer.php": "<?php\nnamespace Shop\\Domain;\n\nclass Mailer\n{\n    public function send(): void {}\n}\n",
  "src/Domain/Audit.php": "<?php\nnamespace Shop\\Domain;\n\nclass Audit\n{\n    public function log(): void {}\n}\n",
  "src/Domain/Cache.php": "<?php\nnamespace Shop\\Domain;\n\nclass Cache\n{\n    public function get(): void {}\n}\n",
  "src/Domain/Repo.php": "<?php\nnamespace Shop\\Domain;\n\ninterface Repo\n{\n    public function find(int $id): ?array;\n}\n",
  "src/App/Checkout.php": [
    "<?php",
    "namespace Shop\\App;",
    "",
    "use Shop\\Domain\\Audit;",
    "use Shop\\Domain\\Cache;",
    "// Mailer is named by its docblock only, with its full name.",
    "use Shop\\Domain\\Repo;",
    "use Shop\\Domain\\Store;",
    "",
    "/**",
    " * @method Audit audit()",
    " * @property Cache $magic",
    " */",
    "class Checkout",
    "{",
    "    private $store;",
    "    /** @var \\Shop\\Domain\\Mailer|null */",
    "    private $mailer;",
    "    private $repo;",
    "    private $audit;",
    "    private $cache;",
    "    /** @var Store */",
    "    private $mixed;",
    "",
    "    /**",
    "     * @param Store $store",
    "     * @param Audit $audit",
    "     */",
    "    public function __construct(Store $store, Repo $repo, $audit, Cache $cache, Mailer $other)",
    "    {",
    "        $this->store = $store;",
    "        $this->repo = $repo;",
    "        $this->audit = $audit;",
    "        $this->cache = $cache;",
    "        $this->cache = $store;",
    "        $this->mixed = $other;",
    "    }",
    "",
    "    public function buy(): void",
    "    {",
    "        $this->store->save();",
    "        $this->mailer->send();",
    "        $this->repo->find(1);",
    "        $this->audit->log();",
    "        $this->cache->get();",
    "        $this->mixed->send();",
    "        $this->audit();",
    "        $this->magic->get();",
    "    }",
    "}",
    "",
  ].join("\n"),
};

test("php: an untyped property has the class of the constructor parameter assigned to it, or of its `@var`; a docblock type is provenance `docblock`, an interface a hole, a conflict a hole", (t) => {
  const dir = repo(t, PROPERTY_FILES);
  assert.equal(keylang(dir, ["map"]).status, 0);
  const index = snapshot(dir);
  const call = (target: string) => index.edges.find((e) => e.kind === "call" && e.source === "app.Checkout.Checkout.buy" && e.target === target);
  // `$this->store = $store` with `Store $store`: a fact of the syntax; the `@param` repeats it and adds nothing.
  assert.equal(call("domain.Store.Store.save")?.provenance, "syntactic", JSON.stringify(index.edges));
  assert.equal(call("domain.Store.Store.save")?.docblock, undefined);
  // `@var \Shop\Domain\Mailer|null` alone: the call and the import exist thanks to the docblock, at its line.
  assert.equal(call("domain.Mailer.Mailer.send")?.provenance, "docblock", JSON.stringify(index.edges));
  assert.equal(call("domain.Mailer.Mailer.send")?.docblock, "src/App/Checkout.php:17:9");
  const imported = index.edges.find((e) => e.kind === "import" && e.source === "app.Checkout" && e.target === "domain.Mailer");
  assert.equal(imported?.provenance, "docblock", JSON.stringify(index.edges));
  assert.equal(imported?.docblock, "src/App/Checkout.php:17:9");
  // `Store` stands in a `use`: the import is a statement of the code, whatever the docblocks say.
  assert.equal(index.edges.find((e) => e.kind === "import" && e.source === "app.Checkout" && e.target === "domain.Store")?.provenance, "syntactic");
  // `@param Audit $audit` for an untyped constructor parameter, assigned to the property.
  assert.equal(call("domain.Audit.Audit.log")?.provenance, "docblock");
  assert.equal(call("domain.Audit.Audit.log")?.docblock, "src/App/Checkout.php:27:8");
  // Every other edge is a fact of the syntax.
  assert.ok(index.edges.every((e) => e.provenance === "syntactic" || e.docblock !== undefined));
  const hole = (kind: string, reason: string): boolean => index.coverage.some((c) => c.kind === kind && c.reason === reason && c.source === "app.Checkout.Checkout.buy");
  // `Repo` is an interface: the call is dispatched at run time; a binding may name the class later.
  assert.ok(hole("dynamic-call", "call through an interface `Repo`"), JSON.stringify(index.coverage));
  // Two assignments of different classes, and a `@var` that contradicts the constructor: no type, a hole of the class.
  assert.ok(index.coverage.some((c) => c.kind === "unsupported" && c.reason === "ambiguous property type `$cache`: assigned `Cache` and `Store` in the constructor" && c.source === "app.Checkout.Checkout"), JSON.stringify(index.coverage));
  assert.ok(index.coverage.some((c) => c.kind === "unsupported" && c.reason === "ambiguous property type `$mixed`: `@var Store`, assigned `Mailer` in the constructor" && c.source === "app.Checkout.Checkout"), JSON.stringify(index.coverage));
  assert.equal(call("domain.Cache.Cache.get"), undefined);
  assert.equal(call("domain.Mailer.Mailer.send")?.text, "this.mailer.send");
  assert.ok(hole("dynamic-call", "call through `this` of a function value `this.cache.get`"));
  assert.ok(hole("dynamic-call", "call through `this` of a function value `this.mixed.send`"));
  // `@method` and `@property` are magic: holes, as before.
  assert.ok(hole("unresolved-call", "unresolved call `this.audit`"));
  assert.ok(hole("dynamic-call", "call through `this` of a function value `this.magic.get`"));
  assert.equal(keylang(dir, ["map", "--check"]).status, 0);
});

test("php: a flow step and a rule through a docblock-typed property name the docblock in the verdict", (t) => {
  const dir = repo(t, {
    ...PROPERTY_FILES,
    "keylang/flows.md": "# flow buy\n\n- trigger app.Checkout.Checkout.buy\n  - step domain.Store.Store.save\n  - step domain.Mailer.Mailer.send\n  - step domain.Audit.Audit.log\n",
    "keylang/rules.md": "# rules\n\n- deny app domain.Mailer\n",
  });
  const o = keylang(dir, ["check"]);
  assert.equal(o.status, 1, o.stdout);
  assert.match(o.stdout, /flows\.md:4:3: static ok domain\.Store\.Store\.save: called from app\.Checkout\.Checkout\.buy\n/);
  assert.match(o.stdout, /flows\.md:5:3: static ok domain\.Mailer\.Mailer\.send: called from app\.Checkout\.Checkout\.buy, typed by a docblock at src\/App\/Checkout\.php:17:9\n/);
  assert.match(o.stdout, /flows\.md:6:3: static ok domain\.Audit\.Audit\.log: called from app\.Checkout\.Checkout\.buy, typed by a docblock at src\/App\/Checkout\.php:27:8\n/);
  // One dependency is one finding: the import the docblock makes, at the docblock.
  assert.match(o.stdout, /src\/App\/Checkout\.php:17:9: K102 divergence: `app\.Checkout` depends on `domain\.Mailer` \(typed by a docblock at src\/App\/Checkout\.php:17:9\), which is denied by `deny app domain\.Mailer`/);
  assert.equal(o.stdout.split("\n").filter((line) => line.includes("K102")).length, 1, o.stdout);
  // In `shape` mode a docblock edge is a type, not a hook: the step stays ok.
  const shape = keylang(dir, ["check", "--static", "shape"]);
  assert.match(shape.stdout, /flows\.md:5:3: static ok domain\.Mailer\.Mailer\.send: called from app\.Checkout\.Checkout\.buy, typed by a docblock/);
});

/** Magento's `QuoteManagement::placeOrder`: the work runs through a callable handed to a mutex typed by an interface. */
const CALLABLE_FILES = {
  "keylang.json": JSON.stringify({ languages: ["php"], layers: { Quote: ["src/Quote/**"], Infra: ["src/Infra/**"] } }),
  "src/Infra/LockManagerInterface.php": "<?php\nnamespace Shop\\Infra;\n\ninterface LockManagerInterface\n{\n    public function execute(int $id, callable $callback, array $args): mixed;\n}\n",
  "src/Infra/Logger.php": "<?php\nnamespace Shop\\Infra;\n\nclass Logger\n{\n    public function info(string $m): void {}\n    public function each(array $items, callable $fn): void {}\n    public static function flush(int $x): int { return $x; }\n}\n",
  "src/Quote/QuoteManagement.php": [
    "<?php",
    "namespace Shop\\Quote;",
    "",
    "use Shop\\Infra\\LockManagerInterface;",
    "use Shop\\Infra\\Logger;",
    "",
    "class QuoteManagement",
    "{",
    "    public function __construct(private LockManagerInterface $cartMutex, private Logger $logger) {}",
    "",
    "    public function placeOrder(int $cartId): int",
    "    {",
    "        return $this->cartMutex->execute($cartId, \\Closure::fromCallable([$this, 'placeOrderRun']), [$cartId]);",
    "    }",
    "",
    "    public function placeOrderRun(int $cartId): int",
    "    {",
    "        $this->logger->info('placing');",
    "        return $this->submitQuote($cartId);",
    "    }",
    "",
    "    public function submitQuote(int $cartId): int { return $cartId; }",
    "",
    "    public function sortItems(array $items, Logger $log): array",
    "    {",
    "        usort($items, [self::class, 'compare']);",
    "        array_map('Shop\\Infra\\Logger::flush', $items);",
    "        $this->logger->each($items, fn($item) => $this->audit($item));",
    "        $this->logger->each($items, $this->firstClass(...));",
    "        $this->logger->each($items, [$log, 'info']);",
    "        $cb = [$this, 'later'];",
    "        $f = fn() => $this->deferred();",
    "        return $items;",
    "    }",
    "",
    "    public static function compare(int $a, int $b): int { return $a <=> $b; }",
    "    public function firstClass(int $item): void {}",
    "    public function audit(int $item): void {}",
    "    public function later(): void {}",
    "    public function deferred(): void {}",
    "}",
    "",
  ].join("\n"),
};

test("php: a callable passed as an argument (`\\Closure::fromCallable([$this, 'm'])`, `[self::class, 'm']`, `'Cls::m'`, `$this->m(...)`, `[$obj, 'm']`) and a closure passed as one are routes `behavior` follows and `shape` names; stored ones stay holes", (t) => {
  const dir = repo(t, {
    ...CALLABLE_FILES,
    "keylang/flows.md": [
      "# flow place",
      "",
      "- trigger Quote.QuoteManagement.QuoteManagement.placeOrder",
      "  - step Quote.QuoteManagement.QuoteManagement.placeOrderRun",
      "    - step Quote.QuoteManagement.QuoteManagement.submitQuote",
      "",
      "# flow sort",
      "",
      "- trigger Quote.QuoteManagement.QuoteManagement.sortItems",
      "  - step Quote.QuoteManagement.QuoteManagement.compare",
      "  - step Infra.Logger.Logger.flush",
      "  - step Quote.QuoteManagement.QuoteManagement.audit",
      "  - step Quote.QuoteManagement.QuoteManagement.firstClass",
      "  - step Infra.Logger.Logger.info",
      "  - step Quote.QuoteManagement.QuoteManagement.later",
      "  - step Quote.QuoteManagement.QuoteManagement.deferred",
      "",
    ].join("\n"),
  });
  // The algo draft follows the callable into `placeOrderRun` and its callees, and says how.
  const draft = keylang(dir, ["draft", "flow", "Quote.QuoteManagement.QuoteManagement.placeOrder", "--mode", "algo", "--print"]);
  assert.equal(draft.status, 0, draft.stderr);
  assert.equal(
    draft.stdout,
    [
      "# flow placeOrder",
      "",
      "- trigger Quote.QuoteManagement.QuoteManagement.placeOrder <!-- keylang:algo unresolved: this.cartMutex.execute (src/Quote/QuoteManagement.php:13) -->",
      "  - step Quote.QuoteManagement.QuoteManagement.placeOrderRun <!-- keylang:algo via callable -->",
      "    - step Infra.Logger.Logger.info",
      "    - step Quote.QuoteManagement.QuoteManagement.submitQuote",
      "",
    ].join("\n"),
  );
  const sort = keylang(dir, ["draft", "flow", "Quote.QuoteManagement.QuoteManagement.sortItems", "--mode", "algo", "--print"]).stdout;
  assert.match(sort, /^  - step Quote\.QuoteManagement\.QuoteManagement\.compare <!-- keylang:algo via callable -->$/m);
  assert.match(sort, /^  - step Quote\.QuoteManagement\.QuoteManagement\.audit <!-- keylang:algo via closure -->$/m);
  assert.match(sort, /^  - step Quote\.QuoteManagement\.QuoteManagement\.deferred$/m);

  const o = keylang(dir, ["check"]);
  const lines = o.stdout.split("\n").filter((line) => / static /.test(line));
  assert.deepEqual(
    lines.map((line) => line.replace(/^keylang\/flows\.md:\d+:\d+: /, "").replace(/Quote\.QuoteManagement\.QuoteManagement\./g, "Q.")),
    [
      "static ok Q.placeOrderRun: called from Q.placeOrder through the callable `[$this, 'placeOrderRun']` passed at src/Quote/QuoteManagement.php:13:74",
      "static ok Q.submitQuote: called from Q.placeOrderRun",
      "static ok Q.compare: called from Q.sortItems through the callable `[self::class, 'compare']` passed at src/Quote/QuoteManagement.php:26:23",
      "static ok Infra.Logger.Logger.flush: called from Q.sortItems through the callable `'Shop\\Infra\\Logger::flush'` passed at src/Quote/QuoteManagement.php:27:19",
      "static ok Q.audit: called from Q.sortItems through the closure passed at src/Quote/QuoteManagement.php:28:37",
      "static ok Q.firstClass: called from Q.sortItems through the callable `$this->firstClass(...)` passed at src/Quote/QuoteManagement.php:29:37",
      "static ok Infra.Logger.Logger.info: called from Q.sortItems through the callable `[$log, 'info']` passed at src/Quote/QuoteManagement.php:30:37",
      // A callable or a closure stored in a variable: whoever holds it may run it, as before.
      "static unverified Q.later: no call path from Q.sortItems in the static graph; `later` is read as a value at src/Quote/QuoteManagement.php:31:15, so code keylang cannot follow may call `Q.later`",
      "static unverified Q.deferred: no resolved path from Q.sortItems; reached only through a closure of Q.sortItems: `this.deferred` at src/Quote/QuoteManagement.php:32:22 runs only when that function value is called",
    ],
    o.stdout,
  );
  // `shape` follows neither and names what it did not follow.
  const shape = keylang(dir, ["check", "--static", "shape"]).stdout;
  assert.match(shape, /static unverified Quote\.QuoteManagement\.QuoteManagement\.placeOrderRun: no resolved path from Quote\.QuoteManagement\.QuoteManagement\.placeOrder; the callable `\[\$this, 'placeOrderRun'\]` passed as an argument \(not followed in static mode shape, set by --static\) at src\/Quote\/QuoteManagement\.php:13:74 may reach it/);
  assert.match(shape, /static ok Quote\.QuoteManagement\.QuoteManagement\.submitQuote: called from Quote\.QuoteManagement\.QuoteManagement\.placeOrderRun/);
  assert.match(shape, /static unverified Quote\.QuoteManagement\.QuoteManagement\.audit: no resolved path from Quote\.QuoteManagement\.QuoteManagement\.sortItems; the closure passed at src\/Quote\/QuoteManagement\.php:28:37 \(not followed in static mode shape, set by --static\) at src\/Quote\/QuoteManagement\.php:28:50 may reach it/);

  // The snapshot: `via` and position on each edge; a callable passed is no call, so it is not counted as one.
  assert.equal(keylang(dir, ["map"]).status, 0);
  const index = JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as Snapshot & {
    nodes: Record<string, { calls?: string[] }>;
    edges: { via?: string; site?: string; closure?: true; line: number; col: number }[];
    stats: { callsResolved: number };
  };
  const edges = index.edges
    .filter((e) => e.kind === "call" && e.source.startsWith("Quote.QuoteManagement.QuoteManagement.sortItems"))
    .map((e) => `${e.text} → ${e.target ?? "?"}${e.via ? ` via ${e.via}` : ""}${e.closure ? " (closure)" : ""}${e.site ? ` site ${e.site}` : ""} @${e.line}:${e.col}`);
  assert.deepEqual(edges, [
    "[self::class, 'compare'] → Quote.QuoteManagement.QuoteManagement.compare via callable-arg @26:23",
    "'Shop\\Infra\\Logger::flush' → Infra.Logger.Logger.flush via callable-arg @27:19",
    "this.logger.each → Infra.Logger.Logger.each @28:9",
    "this.audit → Quote.QuoteManagement.QuoteManagement.audit via closure-arg (closure) site src/Quote/QuoteManagement.php:28:37 @28:50",
    "$this->firstClass(...) → Quote.QuoteManagement.QuoteManagement.firstClass via callable-arg @29:37",
    "[$log, 'info'] → Infra.Logger.Logger.info via callable-arg @30:37",
    "this.deferred → Quote.QuoteManagement.QuoteManagement.deferred (closure) @32:22",
  ]);
  // Resolved call edges: `info`, `submitQuote`, `each`, `audit`, `deferred` — the five callables passed add nothing.
  assert.equal(index.stats.callsResolved, 5);
  assert.ok(index.nodes["Quote.QuoteManagement.QuoteManagement.placeOrder"]?.calls?.includes("Quote.QuoteManagement.QuoteManagement.placeOrderRun"), "the map lists the callable as a call");
});

test("php: init on a Laravel layout takes composer's PSR-4 root for the layers; tests and the framework's caches are not indexed", (t) => {
  const dir = repo(t, {
    "composer.json": JSON.stringify({ name: "acme/blog", autoload: { "psr-4": { "App\\": "app/" } }, "autoload-dev": { "psr-4": { "Tests\\": "tests/" } } }),
    "app/Models/Post.php": "<?php\nnamespace App\\Models;\n\nclass Post\n{\n    public function publish(): void {}\n}\n",
    "app/Http/Controllers/PostController.php": "<?php\nnamespace App\\Http\\Controllers;\n\nuse App\\Models\\Post;\n\nclass PostController\n{\n    public function store(Post $post): void\n    {\n        $post->publish();\n    }\n}\n",
    "app/Http/Controllers/PostControllerTest.php": "<?php\nnamespace App\\Http\\Controllers;\n\nclass PostControllerTest {}\n",
    "tests/Feature/PostTest.php": "<?php\nnamespace Tests\\Feature;\n\nclass PostTest {}\n",
    "bootstrap/cache/services.php": "<?php return [];\n",
    "storage/framework/views/0f1e.php": "<?php echo 1;\n",
    "routes/web.php": "<?php\nuse App\\Http\\Controllers\\PostController;\n\nRoute::post('/posts', [PostController::class, 'store']);\n",
  });
  assert.equal(keylang(dir, ["init"]).status, 0);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "keylang.json"), "utf8")).layers, { Http: ["app/Http/**"], Models: ["app/Models/**"] });
  const index = snapshot(dir);
  assert.deepEqual(index.manifest.files.map((f) => f.path), ["app/Http/Controllers/PostController.php", "app/Models/Post.php", "routes/web.php"]);
  assert.ok(edges(index).includes("call Http.Controllers.PostController.PostController.store -> Models.Post.Post.publish"));
  // The route holds the action as a value: the framework calls it.
  assert.equal(index.nodes["Http.Controllers.PostController.PostController.store"]?.escapes?.reason, "`store` is read as a value");
});

test("php: spec-to-code puts a planned method into its class, a new class into a file with the namespace beside it, and writes a failing PHPUnit test", (t) => {
  const dir = shop(t);
  writeFileSync(join(dir, "keylang.json"), JSON.stringify(SHOP_LAYERS));
  const composer = JSON.parse(readFileSync(join(dir, "composer.json"), "utf8")) as Record<string, unknown>;
  writeFileSync(join(dir, "composer.json"), JSON.stringify({ ...composer, "autoload-dev": { "psr-4": { "Shop\\Tests\\": "tests/" } } }));
  write(dir, {
    "keylang/refund.md": [
      "# flow refund",
      "",
      "- planned fn Domain.Order.Order.refund (int $amount) → void",
      "- planned fn Domain.Refund.Refund.make () → void",
      "- trigger App.Checkout.Checkout.buy",
      "  - step Domain.Order.Order.refund",
      "    - test tests/RefundTest.php \"testRefund\"",
      "    - test tests/RefundTest.php \"refunds_twice\"",
      "    - test tests/RefundTest.php \"refunds the order\"",
      "",
    ].join("\n"),
  });
  assert.equal(keylang(dir, ["map"]).status, 0);
  const method = keylang(dir, ["spec-to-code", "Domain.Order.Order.refund", "--print"]);
  assert.equal(method.status, 0, method.stderr);
  // Into the class body, indented as its members; its signature is the plan's: K202, not K201.
  assert.match(method.stdout, /^src\/Domain\/Order\.php\n@@ line 31 @@\n\+\n\+ {4}public function refund\(int \$amount\): void\n\+ {4}\{\n\+ {8}throw new \\LogicException\('not implemented: Domain\.Order\.Order\.refund'\);\n\+ {4}\}\n/);
  assert.match(method.stdout, /K202 planned fn `Domain\.Order\.Order\.refund` is implemented/);
  assert.doesNotMatch(method.stdout, /K201/);
  assert.ok(method.stdout.includes([
    "tests/RefundTest.php (new file)",
    "@@ line 1 @@",
    "+<?php",
    "+",
    "+namespace Shop\\Tests;",
    "+",
    "+use PHPUnit\\Framework\\TestCase;",
    "+use Shop\\Domain\\Order;",
    "+",
    "+final class RefundTest extends TestCase",
    "+{",
    "+    public function testRefund(): void",
    "+    {",
    "+        $this->assertTrue(method_exists(Order::class, 'refund'));",
    "+        $this->fail('not written: drive flow `refund` through Order::refund and assert what the flow promises');",
    "+    }",
    "+",
    "+    #[\\PHPUnit\\Framework\\Attributes\\Test]",
    "+    public function refunds_twice(): void",
  ].join("\n")), method.stdout);
  // A test name with spaces is no method name: the person writes it.
  assert.match(method.stderr + method.stdout, /test tests\/RefundTest\.php "refunds the order": write it by hand \(a PHPUnit test is a method, and `refunds the order` is no method name\)/);

  const created = keylang(dir, ["spec-to-code", "Domain.Refund.Refund.make", "--print"]);
  assert.equal(created.status, 0, created.stderr);
  assert.ok(created.stdout.startsWith(["src/Domain/Refund.php (new file)", "@@ line 1 @@", "+<?php", "+", "+declare(strict_types=1);", "+", "+namespace Shop\\Domain;", "+", "+class Refund", "+{", "+    public function make(): void"].join("\n")), created.stdout);
});

const php = spawnSync("php", ["--version"], { encoding: "utf8" }).status === 0;
/** A PHPUnit to run under `php`: `KEYLANG_PHPUNIT` (a phar or a script), else `phpunit` on the PATH. */
const phpunit = php ? (process.env.KEYLANG_PHPUNIT ?? (spawnSync("sh", ["-c", "command -v phpunit"], { encoding: "utf8" }).stdout.trim() || null)) : null;
const ADAPTER = join(root, "adapters/php/keylang_trace.php");

const TRACE_FILES: Record<string, string> = {
  "keylang.json": JSON.stringify({ languages: ["php"], layers: { app: ["src/App/**"], domain: ["src/Domain/**"] }, exclude: ["run.php"], check: { trace: ".keylang/trace/*.jsonl", tests: ".keylang/reports/*.json" } }),
  "src/App/Checkout.php": [
    "<?php",
    "namespace Shop\\App;",
    "",
    "use Shop\\Domain\\Order;",
    "",
    "class Checkout",
    "{",
    "    public function buy(): int",
    "    {",
    "        $order = new Order();",
    "        $order->add(3);",
    "        foreach ($order->each() as $price) {",
    "        }",
    "        return $order->total();",
    "    }",
    "",
    "    public function fails(): void",
    "    {",
    "        throw new \\RuntimeException('boom');",
    "    }",
    "}",
    "",
  ].join("\n"),
  "src/Domain/Order.php": [
    "<?php",
    "namespace Shop\\Domain;",
    "",
    "class Order",
    "{",
    "    /** @var list<int> */",
    "    private array $lines = [];",
    "",
    "    public function add(int $price): void",
    "    {",
    "        $this->lines[] = $price;",
    "    }",
    "",
    "    public function total(): int",
    "    {",
    "        return array_sum($this->lines);",
    "    }",
    "",
    "    /** @return \\Generator<int> */",
    "    public function each(): \\Generator",
    "    {",
    "        yield from $this->lines;",
    "    }",
    "}",
    "",
  ].join("\n"),
  "autoload.php": "<?php\nspl_autoload_register(static function (string $class): void {\n    require __DIR__ . '/src/' . str_replace('\\\\', '/', substr($class, strlen('Shop\\\\'))) . '.php';\n});\n",
  "run.php": "<?php\nrequire __DIR__ . '/autoload.php';\n\n$checkout = new Shop\\App\\Checkout();\necho $checkout->buy(), \"\\n\";\nif (($argv[1] ?? '') === 'crash') {\n    $checkout->fails();\n}\n",
  "keylang/flows.md": "# flow buy\n\n- trigger app.Checkout.Checkout.buy\n  - step domain.Order.Order.add\n  - step domain.Order.Order.each\n  - step domain.Order.Order.total\n",
};

/** The trace plan of `flow`, written to `plan.json`. */
function planOf(dir: string, flow: string): string[] {
  const plan = keylang(dir, ["trace-plan", flow]);
  assert.equal(plan.status, 0, plan.stderr);
  writeFileSync(join(dir, "plan.json"), plan.stdout);
  return (JSON.parse(plan.stdout) as { symbols: { id: string }[] }).symbols.map((s) => s.id);
}

function traceEvents(dir: string, flow: string): { event: string; symbolId?: string; outcome?: string; complete?: boolean; instrumented?: string[]; testId: string; parentSpanId?: string | null; spanId?: string }[] {
  return readFileSync(join(dir, `.keylang/trace/${flow}.jsonl`), "utf8").trim().split("\n").map((line) => JSON.parse(line));
}

test("php: `keylang trace-plan` + the PHP adapter give trace evidence; a generator and a file changed after the plan are not instrumented; a crash is incomplete", { skip: php ? false : "php is not installed" }, (t) => {
  const dir = repo(t, TRACE_FILES);
  assert.deepEqual(planOf(dir, "buy"), ["app.Checkout.Checkout.buy", "domain.Order.Order.add", "domain.Order.Order.each", "domain.Order.Order.total"]);
  const trace = (...args: string[]): { status: number | null; stdout: string; stderr: string } => {
    const r = spawnSync("php", [ADAPTER, "run.php", ...args], { cwd: dir, encoding: "utf8", env: { ...process.env, KEYLANG_TRACE: ".keylang/trace/buy.jsonl", KEYLANG_TRACE_PLAN: "plan.json", KEYLANG_TRACE_TEST: "run.php > @flow buy" } });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
  };
  const ran = trace();
  assert.equal(ran.status, 0, ran.stderr);
  // The program runs as without the adapter.
  assert.equal(ran.stdout, "3\n");
  const events = traceEvents(dir, "buy");
  const starts = events.filter((e) => e.event === "start");
  assert.deepEqual(starts.map((e) => e.symbolId), ["app.Checkout.Checkout.buy", "domain.Order.Order.add", "domain.Order.Order.total"]);
  // The steps nest under the trigger by the call stack.
  assert.ok(starts.slice(1).every((e) => e.parentSpanId === starts[0]!.spanId));
  const run = events.find((e) => e.event === "run")!;
  assert.equal(run.complete, true);
  assert.deepEqual(run.instrumented, ["app.Checkout.Checkout.buy", "domain.Order.Order.add", "domain.Order.Order.total"]);
  const o = keylang(dir, ["check"]);
  assert.match(o.stdout, /flows\.md:4:3: trace ok domain\.Order\.Order\.add: observed in run\.php > @flow buy/);
  assert.match(o.stdout, /flows\.md:6:3: trace ok domain\.Order\.Order\.total/);
  // A generator suspends and resumes: its frames give no nesting, so it is not instrumented.
  assert.match(o.stdout, /flows\.md:5:3: trace unverified domain\.Order\.Order\.each: `domain\.Order\.Order\.each` is not instrumented/);

  // An uncaught exception stops the flow short: the run is incomplete, and the span it left is an error.
  rmSync(join(dir, ".keylang/trace"), { recursive: true, force: true });
  assert.equal(trace("crash").status, 255);
  const crashed = traceEvents(dir, "buy");
  assert.equal(crashed.find((e) => e.event === "run")?.complete, false);

  // After the plan, `Order.php` changes: its functions are not instrumented, and the trace is the old snapshot's.
  rmSync(join(dir, ".keylang/trace"), { recursive: true, force: true });
  writeFileSync(join(dir, "src/Domain/Order.php"), `${readFileSync(join(dir, "src/Domain/Order.php"), "utf8")}// changed\n`);
  assert.equal(trace().status, 0);
  const changed = traceEvents(dir, "buy");
  assert.ok(!changed.some((e) => e.symbolId === "domain.Order.Order.add"));
  assert.deepEqual(changed.find((e) => e.event === "run")?.instrumented, ["app.Checkout.Checkout.buy"]);
  assert.match(keylang(dir, ["check"]).stdout, /flows\.md:4:3: trace unverified domain\.Order\.Order\.add: stale trace/);
});

test("php: an instrumented function keeps its lines, its result and its exception; a method of the same name elsewhere is not the plan's", { skip: php ? false : "php is not installed" }, (t) => {
  const dir = repo(t, {
    ...TRACE_FILES,
    "src/Domain/Order.php": "<?php\nnamespace Shop\\Domain;\n\nclass Order\n{\n    public function add(int $price): void {}\n\n    public function total(): int { return 7; }\n\n    public function each(): \\Generator { yield 1; }\n\n    public function where(): int { return __LINE__; }\n}\n\nclass Draft\n{\n    public function total(): int { return 0; }\n}\n",
    "run.php": "<?php\nrequire __DIR__ . '/autoload.php';\n\n$order = new Shop\\Domain\\Order();\necho $order->total(), ' ', $order->where(), ' ', (new Shop\\Domain\\Draft())->total(), \"\\n\";\ntry {\n    (new Shop\\App\\Checkout())->fails();\n} catch (\\RuntimeException $e) {\n    echo $e->getMessage(), ' ', $e->getLine(), \"\\n\";\n}\n",
    "keylang/flows.md": "# flow buy\n\n- trigger app.Checkout.Checkout.fails\n  - step domain.Order.Order.total\n  - step domain.Order.Order.where\n",
  });
  planOf(dir, "buy");
  const r = spawnSync("php", [ADAPTER, "run.php"], { cwd: dir, encoding: "utf8", env: { ...process.env, KEYLANG_TRACE: ".keylang/trace/buy.jsonl", KEYLANG_TRACE_PLAN: "plan.json", KEYLANG_TRACE_TEST: "run.php > @flow buy" } });
  assert.equal(r.status, 0, r.stderr);
  // `__LINE__` and the exception's line are the source's: the span sits on the lines of the braces.
  assert.equal(r.stdout, "7 12 0\nboom 19\n");
  const events = traceEvents(dir, "buy");
  assert.deepEqual(events.filter((e) => e.event === "start").map((e) => e.symbolId), ["domain.Order.Order.total", "domain.Order.Order.where", "app.Checkout.Checkout.fails"]);
  // The exception leaves `fails` with outcome `error`.
  const fails = events.find((e) => e.event === "start" && e.symbolId === "app.Checkout.Checkout.fails")!;
  assert.equal(events.find((e) => e.event === "end" && e.spanId === fails.spanId)?.outcome, "error");
});

test("php: keylang's PHPUnit extension writes a report bound to the snapshot, and with the adapter each test is a trace run", { skip: phpunit ? false : "phpunit is not installed" }, (t) => {
  const dir = repo(t, {
    ...TRACE_FILES,
    "keylang/flows.md": "# flow buy\n\n- trigger app.Checkout.Checkout.buy\n  - step domain.Order.Order.add\n  - step domain.Order.Order.total\n  - test tests/BuyTest.php \"testBuy\"\n",
    "phpunit.xml": '<?xml version="1.0"?>\n<phpunit bootstrap="tests/bootstrap.php">\n    <extensions>\n        <bootstrap class="Keylang\\PHPUnit\\Extension"/>\n    </extensions>\n    <testsuites>\n        <testsuite name="all">\n            <directory>tests</directory>\n        </testsuite>\n    </testsuites>\n</phpunit>\n',
    "tests/bootstrap.php": `<?php\nrequire __DIR__ . '/../autoload.php';\nrequire ${JSON.stringify(join(root, "adapters/php/keylang_phpunit.php"))};\n`,
    "tests/BuyTest.php": "<?php\nnamespace Shop\\Tests;\n\nuse PHPUnit\\Framework\\TestCase;\nuse Shop\\App\\Checkout;\n\nfinal class BuyTest extends TestCase\n{\n    public function testBuy(): void\n    {\n        $this->assertSame(3, (new Checkout())->buy());\n    }\n\n    public function testLater(): void\n    {\n        $this->markTestSkipped('later');\n    }\n}\n",
  });
  assert.equal(keylang(dir, ["map"]).status, 0);
  planOf(dir, "buy");
  const r = spawnSync("php", ["-d", `auto_prepend_file=${ADAPTER}`, phpunit!], { cwd: dir, encoding: "utf8", env: { ...process.env, KEYLANG_TRACE: ".keylang/trace/buy.jsonl", KEYLANG_TRACE_PLAN: "plan.json", KEYLANG_TRACE_TEST: undefined } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const report = JSON.parse(readFileSync(join(dir, ".keylang/reports/phpunit.json"), "utf8")) as { schemaVersion: number; snapshotId: string; tests: { file: string; suite: string; name: string; status: string }[] };
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.snapshotId, (JSON.parse(readFileSync(join(dir, "plan.json"), "utf8")) as { snapshotId: string }).snapshotId);
  assert.deepEqual(report.tests, [
    { file: "tests/BuyTest.php", suite: "BuyTest", name: "testBuy", status: "pass" },
    { file: "tests/BuyTest.php", suite: "BuyTest", name: "testLater", status: "skip" },
  ]);
  const events = traceEvents(dir, "buy");
  // `testLater` reaches none of the flow's functions: it ran something else and is no run of the flow.
  assert.ok(events.every((e) => e.testId === "tests/BuyTest.php > BuyTest > testBuy"));
  assert.equal(events.filter((e) => e.event === "run").length, 1);
  const o = keylang(dir, ["check"]);
  assert.equal(o.status, 0, o.stdout);
  assert.match(o.stdout, /flows\.md:6:3: tests ok test tests\/BuyTest\.php "testBuy": passed in \.keylang\/reports\/phpunit\.json/);
  assert.match(o.stdout, /flows\.md:3:1: trace ok app\.Checkout\.Checkout\.buy/);
  assert.match(o.stdout, /flows\.md:4:3: trace ok domain\.Order\.Order\.add: observed in tests\/BuyTest\.php > BuyTest > testBuy/);
});
