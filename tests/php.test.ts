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
  edges: { kind: string; source: string; target: string | null; resolution: string; text: string }[];
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
  assert.ok(index.coverage.some((c) => c.kind === "unresolved-call" && c.source === "web.Page.Page.run" && c.reason === "unresolved call `this.repo.find`"));
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
