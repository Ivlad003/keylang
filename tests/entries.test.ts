// `keylang entries` (business-flows/09): entry points the code and its
// manifests write, through the real CLI on temporary repositories of several
// languages, the pure collectors on their own, and the TUI's «Entry points».

import assert from "node:assert/strict";
import { test } from "node:test";
import { binSource, binTargets, nextRoutePath, phpScript, pyprojectScripts, pythonModuleFile, rustBinTarget } from "../src/entries.ts";
import { entriesText } from "../src/operations.ts";
import { keylang, tempDir, writeTree } from "./cli-helpers.ts";
import { checkoutRepo, KEY } from "./tui-fixture.ts";
import { session } from "./tui-helpers.ts";

const TS_LAYERS = { languages: ["typescript"], module: "file", layers: { bin: ["bin/**"], app: ["src/app/**"], web: ["app/**"] } };

/** TypeScript: a `bin` of package.json, Express-style registrations and a Next.js route handler file. */
const TS_REPO: Record<string, string> = {
  "keylang.json": JSON.stringify(TS_LAYERS),
  "package.json": JSON.stringify({ name: "@acme/shop", bin: { shop: "./bin/shop.js" } }),
  "bin/shop.ts": "export function main(): number {\n  return 0;\n}\n",
  "src/app/handlers.ts": 'export function listOrders(): string[] {\n  return [];\n}\nexport default function home(): string {\n  return "hi";\n}\n',
  "src/app/server.ts": [
    'import { listOrders } from "./handlers.ts";',
    'import home from "./handlers.ts";',
    "const app = { get: (_p: string, ..._h: unknown[]) => 0, post: (_p: string, ..._h: unknown[]) => 0 };",
    'const prefix = "/v1";',
    "function pay(): number {",
    "  return 1;",
    "}",
    "function auth(): boolean {",
    "  return true;",
    "}",
    'app.get("/orders", listOrders);',
    'app.get("/", home);',
    'app.post("/pay", auth, pay);',
    // A computed path and a handler written in place: nothing in the code names them.
    'app.get(prefix + "/dyn", listOrders);',
    'app.get("/anon", () => 1);',
    "",
  ].join("\n"),
  "app/api/orders/route.ts": "export async function GET(): Promise<number> {\n  return 1;\n}\nexport function POST(): number {\n  return 2;\n}\nfunction helper(): number {\n  return 3;\n}\n",
};

/** Python, Rust and PHP in one repository: `[project.scripts]`, `__main__` blocks, a bin crate and a front-controller script. */
const MIXED_REPO: Record<string, string> = {
  "keylang.json": JSON.stringify({ languages: ["python", "rust", "php"], module: "file", layers: { shop: ["src/shop/**"], tool: ["tool/src/**"], web: ["public/**", "bin/**"] } }),
  "pyproject.toml": '[project]\nname = "shop"\n\n[project.scripts]\nshop-cli = "shop.cli:main"\n',
  "src/shop/__init__.py": "",
  "src/shop/cli.py": 'import sys\n\n\ndef main() -> int:\n    return 0\n\n\nif __name__ == "__main__":\n    sys.exit(main())\n',
  "src/shop/tool.py": 'if __name__ == "__main__":\n    print("x")\n',
  "tool/Cargo.toml": '[package]\nname = "tool"\n',
  "tool/src/main.rs": "fn main() {\n    run();\n}\n\nfn run() {}\n",
  "tool/src/lib.rs": "pub fn main() {}\n",
  "public/index.php": '<?php\nrequire "bootstrap.php";\necho "hi";\n',
  "bin/Worker.php": "<?php\nclass Worker\n{\n    public function execute(): void\n    {\n    }\n}\n",
};

function entries(dir: string, args: string[] = []): { status: number | null; stdout: string; stderr: string } {
  return keylang(dir, ["entries", ...args]);
}

test("entries: TypeScript — bin of package.json, Express literal paths with named handlers, Next route handlers", (t) => {
  const dir = tempDir(t, "keylang-entries-ts-");
  writeTree(dir, TS_REPO);
  const run = entries(dir);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(
    run.stdout.trimEnd().split("\n").map((line) => line.replace(/ {2,}/g, " ")),
    [
      "cli shop bin.shop.main bin/shop.ts:1",
      "route GET / app.handlers.home src/app/handlers.ts:4",
      "route GET /api/orders web.api.orders.route.GET app/api/orders/route.ts:1",
      "route GET /orders app.handlers.listOrders src/app/handlers.ts:1",
      "route POST /api/orders web.api.orders.route.POST app/api/orders/route.ts:4",
      "route POST /pay app.server.pay src/app/server.ts:5",
    ],
  );
  // A computed path, an inline handler and an unexported helper are no entries.
  assert.doesNotMatch(run.stdout, /dyn|anon|helper/);
});

test("entries: --json is only JSON, stable across two runs, and --kind narrows it", (t) => {
  const dir = tempDir(t, "keylang-entries-json-");
  writeTree(dir, TS_REPO);
  const first = entries(dir, ["--json"]);
  const second = entries(dir, ["--json"]);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.stdout, second.stdout);
  const parsed = JSON.parse(first.stdout) as { snapshotId: string; kind: string | null; entries: { kind: string; id: string; label: string; framework: null; file: string; line: number; source: string }[] };
  assert.match(parsed.snapshotId, /^[0-9a-f]{64}$/);
  assert.equal(parsed.kind, null);
  assert.deepEqual(parsed.entries[0], { kind: "cli", id: "bin.shop.main", label: "shop", framework: null, file: "bin/shop.ts", line: 1, source: "package.json" });
  assert.deepEqual(parsed.entries.find((entry) => entry.label === "POST /pay")?.source, "src/app/server.ts:13");
  // Sorted by kind, label, id.
  const keys = parsed.entries.map((entry) => `${entry.kind}\u0000${entry.label}\u0000${entry.id}`);
  assert.deepEqual(keys, [...keys].sort());
  const routes = entries(dir, ["--kind", "route", "--json"]);
  assert.equal(routes.status, 0, routes.stderr);
  const narrowed = JSON.parse(routes.stdout) as { kind: string; entries: { kind: string }[] };
  assert.equal(narrowed.kind, "route");
  assert.equal(narrowed.entries.length, 5);
  assert.ok(narrowed.entries.every((entry) => entry.kind === "route"));
  // An unknown kind is a usage error.
  const bad = entries(dir, ["--kind", "nope"]);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /--kind is one of route, rest, graphql/);
  // A second map after `entries` finds the same snapshot: the fact cache carries the new fact kind.
  assert.equal(keylang(dir, ["map"]).status, 0);
  assert.equal(entries(dir, ["--json"]).stdout, first.stdout);
});

test("entries: Python main and scripts, a Rust bin crate and a PHP front controller in one repository", (t) => {
  const dir = tempDir(t, "keylang-entries-mixed-");
  writeTree(dir, MIXED_REPO);
  const run = entries(dir);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(
    run.stdout.trimEnd().split("\n").map((line) => line.replace(/ {2,}/g, " ")),
    [
      "cli shop-cli shop.cli.main src/shop/cli.py:4",
      "main public/index.php web.index public/index.php:1",
      "main src/shop/cli.py shop.cli.main src/shop/cli.py:4",
      "main src/shop/tool.py shop.tool src/shop/tool.py:1",
      "main tool/src/main.rs tool.main.main tool/src/main.rs:1",
    ],
  );
  // `pub fn main` of lib.rs is no bin target; a class in bin/ is a declaration, not a script (its framework decides, ticket 10).
  assert.doesNotMatch(run.stdout, /lib\.rs|Worker/);
  const json = JSON.parse(entries(dir, ["--json"]).stdout) as { entries: { label: string; source: string }[] };
  assert.equal(json.entries.find((entry) => entry.label === "shop-cli")?.source, "pyproject.toml");
  assert.equal(json.entries.find((entry) => entry.label === "src/shop/cli.py")?.source, "src/shop/cli.py:8");
});

test("entries: nothing found is exit 0 with the note and a hint; --json gives an empty list", (t) => {
  const dir = tempDir(t, "keylang-entries-none-");
  writeTree(dir, { "keylang.json": JSON.stringify(TS_LAYERS), "src/app/lib.ts": "export function add(a: number, b: number): number {\n  return a + b;\n}\n" });
  const run = entries(dir);
  assert.equal(run.status, 0, run.stderr);
  const lines = run.stdout.trimEnd().split("\n");
  assert.equal(lines[0], "no entry points found");
  assert.match(lines[1] ?? "", /^hint: .*package\.json.*adapter$/);
  assert.equal(run.stderr, "");
  const json = JSON.parse(entries(dir, ["--json"]).stdout) as { entries: unknown[] };
  assert.deepEqual(json.entries, []);
  const narrowed = entries(dir, ["--kind", "cron"]);
  assert.equal(narrowed.status, 0);
  assert.match(narrowed.stdout, /^no entry points found of kind cron\n/);
});

test("entries: the pure collectors read manifests and paths as written", () => {
  assert.deepEqual(binTargets('{ "name": "@acme/shop", "bin": "cli.js" }'), [{ name: "shop", path: "cli.js" }]);
  assert.deepEqual(binTargets('{ "bin": { "a": "./bin/a.js", "b": "bin\\\\b.mjs", "c": 3 } }'), [
    { name: "a", path: "bin/a.js" },
    { name: "b", path: "bin/b.mjs" },
  ]);
  assert.deepEqual(binTargets(null), []);
  assert.deepEqual(binTargets("{ not json"), []);
  const sources = new Set(["bin/a.ts", "bin/c.mts"]);
  assert.equal(binSource("bin/a.js", (path) => sources.has(path)), "bin/a.ts");
  assert.equal(binSource("bin/c.mjs", (path) => sources.has(path)), "bin/c.mts");
  assert.equal(binSource("dist/cli.js", (path) => sources.has(path)), null);
  assert.equal(nextRoutePath("app/route.ts"), "/");
  assert.equal(nextRoutePath("src/app/(shop)/api/orders/[id]/route.tsx"), "/api/orders/[id]");
  assert.equal(nextRoutePath("src/app/api/orders/handlers.ts"), null);
  assert.equal(nextRoutePath("app/route.py"), null);
  assert.deepEqual(pyprojectScripts('[project]\nname = "x"\n[project.scripts]\nx = "pkg.cli:main"\ny = "pkg.run"\nz = 3\n'), [
    { name: "x", module: "pkg.cli", fn: "main" },
    { name: "y", module: "pkg.run", fn: null },
  ]);
  assert.deepEqual(pyprojectScripts("[project\nbroken"), []);
  assert.deepEqual(pyprojectScripts(null), []);
  const py = new Set(["src/pkg/cli.py", "pkg/run/__init__.py"]);
  assert.equal(pythonModuleFile("pkg.cli", (path) => py.has(path)), "src/pkg/cli.py");
  assert.equal(pythonModuleFile("pkg.run", (path) => py.has(path)), "pkg/run/__init__.py");
  assert.equal(pythonModuleFile("pkg.none", (path) => py.has(path)), null);
  const crates = new Set(["Cargo.toml", "tool/Cargo.toml"]);
  assert.equal(rustBinTarget("src/main.rs", null, (path) => crates.has(path)), true);
  assert.equal(rustBinTarget("tool/src/bin/x.rs", null, (path) => crates.has(path)), true);
  assert.equal(rustBinTarget("other/src/main.rs", null, (path) => crates.has(path)), false);
  assert.equal(rustBinTarget("src/lib.rs", null, (path) => crates.has(path)), false);
  assert.equal(rustBinTarget("src/tools/run.rs", '[[bin]]\nname = "run"\npath = "src/tools/run.rs"\n', () => false), true);
  assert.equal(rustBinTarget("src/tools/run.rs", "[[bin\nbroken", () => false), false);
  assert.equal(phpScript({ path: "public/index.php", decls: [], moduleCalls: [] }), true);
  assert.equal(phpScript({ path: "bin/Worker.php", decls: [{} as never], moduleCalls: [] }), false);
  assert.equal(phpScript({ path: "src/index.php", decls: [], moduleCalls: [] }), false);
  assert.equal(entriesText([]), "no entry points found\nhint: keylang records entry points the code and its manifests write: `bin` of package.json, `[project.scripts]` of pyproject.toml, `fn main` of a Rust bin target, `if __name__ == \"__main__\"`, a script in bin/ or public/index.php, exported GET/POST of app/**/route.ts, app.get('/x', handler) with a literal path; a framework's routes, cron jobs and consumers need its adapter\n");
});

test("tui: «Entry points» in the palette lists the entries of the saved code, the same lines as the CLI", async (t) => {
  const root = checkoutRepo(t, {
    "src/presentation/handlers.ts": "export function listOrders(): string[] {\n  return [];\n}\n",
    "src/presentation/server.ts": 'import { listOrders } from "./handlers.ts";\nconst app = { get: (_p: string, _h: unknown) => 0 };\napp.get("/orders", listOrders);\n',
  });
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.ctrlP);
  for (const ch of "entry points") s.send(ch);
  assert.match(s.text(), /Entry points: where execution starts/);
  s.send(KEY.enter);
  await s.app.idle();
  assert.equal(s.app.state.records.length, 1);
  const record = s.app.state.records[0]!;
  assert.equal(record.status, "completed");
  assert.equal(record.result?.exitCode, 0);
  const cli = entries(root);
  assert.equal(cli.status, 0, cli.stderr);
  assert.deepEqual(record.result!.messages.map((m) => m.text), cli.stdout.trimEnd().split("\n"));
  assert.match(cli.stdout, /route\s+GET \/orders\s+presentation\.handlers\.listOrders\s+src\/presentation\/handlers\.ts:1/);
  // F6 shows the list and the stdout; nothing was written beside the fact cache.
  s.send(KEY.f6);
  assert.match(s.text(), /Entry points · every kind · read-only/);
  assert.match(s.text(), /1 entry point\(s\) · code 0/);
  s.send("\x1b");
});
