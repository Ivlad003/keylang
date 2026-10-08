// Less information (`exclude`, `--static shape`) may move a verdict only to `unverified`.
// Temporary copies only: this repository's check reads local reports that `npm test` overwrites.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { HOOK_FLOW, HOOKS } from "./hooks-fixture.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");
const all = process.env.KEYLANG_METAMORPHIC === "all";

function keylang(cwd: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8" });
  if (r.error) throw r.error;
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function copyFixture(t: TestContext, name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `keylang-meta-${name}-`));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(join(root, "tests/fixtures", name), dir, { recursive: true });
  return dir;
}

function write(dir: string, path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

interface Row {
  criterion: string;
  area: string;
  verdict: "ok" | "fail" | "unverified" | "warning";
  evidence: string;
  file: string;
  line: number;
  code: string | null;
}

interface LayersLine {
  text: string;
  layers: string[];
}

const RANK: Record<Row["verdict"], number> = { fail: 4, warning: 3, unverified: 2, ok: 1 };

function results(dir: string, args: string[] = []): Row[] {
  const run = keylang(dir, ["check", "--format", "json", ...args]);
  assert.notEqual(run.status, 2, run.stderr);
  return (JSON.parse(run.stdout) as { results: Row[] }).results;
}

function layersLines(text: string): LayersLine[] {
  const lines: LayersLine[] = [];
  for (const line of text.split("\n")) {
    const match = /^-\s+layers\s+(.+)$/.exec(line);
    if (!match?.[1]) continue;
    const layers = match[1].split("<").map((part) => part.trim()).filter((part) => part !== "");
    lines.push({ text: `layers ${layers.join(" < ")}`, layers });
  }
  return lines;
}

function component(lines: readonly LayersLine[], layer: string): LayersLine[] {
  const seen = new Set<string>([layer]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const line of lines) {
      if (!line.layers.some((item) => seen.has(item))) continue;
      for (const item of line.layers) {
        if (seen.has(item)) continue;
        seen.add(item);
        grew = true;
      }
    }
  }
  return lines.filter((line) => line.layers.some((item) => seen.has(item)));
}

function rulesText(dir: string): string {
  return readdirSync(join(dir, "keylang"))
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => readFileSync(join(dir, "keylang", name), "utf8"))
    .join("\n");
}

function keysOf(row: Row, lines: readonly LayersLine[]): string[] {
  if (row.code === "K103" || row.criterion === "entry") return ["entry"];
  if (row.code === "K105" || row.criterion === "no-cycles") return [`no-cycles:${row.file}:${row.line}`];
  if (row.code === "K102" || row.code === "K104" || row.criterion.startsWith("deny ") || row.criterion.startsWith("allow ") || row.criterion.startsWith("exports ")) {
    return [`rule:${row.criterion}`];
  }
  if (row.code === "K101") {
    const [, from, to] = row.criterion.split(" ");
    const group = component(lines, to ?? "").filter((line) => line.layers.includes(from ?? "") || line.layers.includes(to ?? ""));
    const chosen = group.length > 0 ? group : lines.filter((line) => line.layers.includes(from ?? "") && line.layers.includes(to ?? ""));
    return (chosen.length > 0 ? chosen : [{ text: row.criterion }]).map((line) => `layers:${line.text}`);
  }
  if (row.criterion.startsWith("layers ")) return [`layers:${row.criterion}`];
  if (row.criterion === "static" || row.criterion === "tests" || row.criterion === "trace") return [`flow:${row.criterion}:${row.area}:${row.file}:${row.line}`];
  if (row.code === null) return [`spec:${row.criterion}:${row.file}:${row.line}`];
  return [`diag:${row.code}:${row.file}:${row.line}`];
}

function aggregate(rows: readonly Row[], lines: readonly LayersLine[]): Map<string, { verdict: Row["verdict"]; evidence: string }> {
  const map = new Map<string, { verdict: Row["verdict"]; evidence: string }>();
  for (const row of rows) {
    for (const key of keysOf(row, lines)) {
      const prev = map.get(key);
      if (!prev || RANK[row.verdict] > RANK[prev.verdict]) map.set(key, { verdict: row.verdict, evidence: row.evidence });
    }
  }
  return map;
}

function monotonic(fixture: string, operator: string, before: Map<string, { verdict: string; evidence: string }>, after: Map<string, { verdict: string; evidence: string }>): void {
  const bad: string[] = [];
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const left = before.get(key);
    const right = after.get(key);
    const from = left?.verdict ?? "unverified";
    const to = right?.verdict ?? "unverified";
    if (from === to || to === "unverified") continue;
    bad.push(`${fixture} ${operator} ${key}: ${from} → ${to}\n  before: ${left?.evidence ?? "(absent)"}\n  after: ${right?.evidence ?? "(absent)"}`);
  }
  assert.equal(bad.length, 0, bad.join("\n"));
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    const abs = join(dir, rel);
    let entries;
    try {
      entries = readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === "target" || entry.name === ".git" || entry.name === "keylang") continue;
      const path = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (/\.(ts|tsx|js|jsx|py|rs)$/.test(entry.name)) out.push(path);
    }
  };
  walk("");
  return out.sort();
}

function withExclude(dir: string, file: string): void {
  const path = join(dir, "keylang.json");
  const raw = JSON.parse(readFileSync(path, "utf8")) as { exclude?: string[] };
  raw.exclude = [...(raw.exclude ?? []), file];
  writeFileSync(path, `${JSON.stringify(raw, null, 2)}\n`);
}

function excludePair(t: TestContext, fixture: string, dir: string): void {
  const lines = layersLines(rulesText(dir));
  const baseRows = results(dir);
  const base = aggregate(baseRows, lines);
  const edges = baseRows
    .filter((row) => row.code === "K101" || row.code === "K102")
    .map((row) => row.file)
    .filter((file) => !file.endsWith(".md"))
    .sort();
  const files = all ? sourceFiles(dir) : [edges[0] ?? sourceFiles(dir)[0]].filter((file): file is string => file !== undefined);
  for (const file of files) {
    const copy = mkdtempSync(join(tmpdir(), "keylang-meta-ex-"));
    t.after(() => rmSync(copy, { recursive: true, force: true }));
    cpSync(dir, copy, { recursive: true });
    withExclude(copy, file);
    monotonic(fixture, `exclude ${file}`, base, aggregate(results(copy), layersLines(rulesText(copy))));
  }
}

const STANDARD = `# rules

- layers domain < app
  - infra
- deny domain infra
- deny app domain
- entry
  - app
- no-cycles
- module domain.order
  - no-cycles
  - exports Order, place
`;

/** PHP 7: a property typed only by its `@var`; the call through it is an edge of provenance `docblock`. */
const PHP_DOCBLOCK: Record<string, string> = {
  "keylang.json": `${JSON.stringify({ languages: ["php"], layers: { app: ["src/App/**"], domain: ["src/Domain/**"] } })}\n`,
  "src/Domain/Store.php": "<?php\nnamespace Shop\\Domain;\n\nclass Store\n{\n    public function save(): void {}\n}\n",
  "src/Domain/Mailer.php": "<?php\nnamespace Shop\\Domain;\n\nclass Mailer\n{\n    public function send(): void {}\n}\n",
  "src/App/Checkout.php": "<?php\nnamespace Shop\\App;\n\nuse Shop\\Domain\\Mailer;\nuse Shop\\Domain\\Store;\n\nclass Checkout\n{\n    private $store;\n    /** @var Mailer */\n    private $mailer;\n\n    public function __construct(Store $store)\n    {\n        $this->store = $store;\n    }\n\n    public function buy(): void\n    {\n        $this->store->save();\n        $this->mailer->send();\n    }\n}\n",
  "keylang/flows.md": "# flow buy\n\n- trigger app.Checkout.Checkout.buy\n  - step domain.Store.Store.save\n  - step domain.Mailer.Mailer.send\n",
};

test("exclude and --static shape never switch ok and fail", (t) => {
  const repo = copyFixture(t, "repo");
  const original = readFileSync(join(repo, "keylang/rules.md"), "utf8");
  writeFileSync(join(repo, "keylang/rules.md"), `${original.trimEnd()}\n- deny app domain\n- module domain.order\n  - no-cycles\n  - exports Order, total, createOrder\n`);
  assert.ok(readFileSync(join(repo, "keylang/rules.md"), "utf8").startsWith(original.trimEnd()));
  excludePair(t, "repo", repo);

  const py = copyFixture(t, "py-shop");
  write(py, "keylang.json", `${JSON.stringify({ languages: ["python"], layers: { domain: ["shop/domain/**"], infra: ["shop/infra/**"], app: ["shop/*"] } })}\n`);
  write(py, "keylang/rules.md", STANDARD.replace("module domain.order", "module domain.order"));
  excludePair(t, "py-shop", py);

  const rust = copyFixture(t, "rust-shop");
  assert.equal(keylang(rust, ["init", "--agents=none"]).status, 0);
  const rustCfg = JSON.parse(readFileSync(join(rust, "keylang.json"), "utf8")) as { layers: Record<string, unknown> };
  const names = Object.keys(rustCfg.layers);
  const low = names[0] ?? "domain";
  const high = names[1] ?? low;
  const nested = names[2];
  write(
    rust,
    "keylang/rules.md",
    `# rules\n\n- layers ${low} < ${high}\n${nested ? `  - ${nested}\n` : ""}- deny ${low} ${high}\n- deny ${high} ${low}\n- entry\n  - ${high}\n- no-cycles\n`,
  );
  excludePair(t, "rust-shop", rust);

  const wiring = copyFixture(t, "wiring-shop");
  write(wiring, "keylang/rules.md", STANDARD.replace("- module domain.order\n  - no-cycles\n  - exports Order, place", "- module domain.store\n  - no-cycles\n  - exports Store"));
  excludePair(t, "wiring-shop", wiring);

  const php = mkdtempSync(join(tmpdir(), "keylang-meta-php-"));
  t.after(() => rmSync(php, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(PHP_DOCBLOCK)) write(php, path, text);
  const withDocblock = aggregate(results(php), []);
  write(php, "src/App/Checkout.php", PHP_DOCBLOCK["src/App/Checkout.php"]!.replace("    /** @var Mailer */\n", ""));
  const withoutDocblock = aggregate(results(php), []);
  monotonic("php-docblock", "remove @var", withDocblock, withoutDocblock);
  const moved = [...withDocblock]
    .filter(([key, left]) => left.verdict !== (withoutDocblock.get(key)?.verdict ?? "unverified"))
    .map(([key, left]) => `${key.split(":")[2]} ${left.verdict} → ${withoutDocblock.get(key)?.verdict ?? "unverified"}`)
    .sort();
  assert.deepEqual(moved, ["domain.Mailer.Mailer.send ok → unverified"]);

  const hooks = mkdtempSync(join(tmpdir(), "keylang-meta-hooks-"));
  t.after(() => rmSync(hooks, { recursive: true, force: true }));
  const layers = Object.fromEntries([...new Set(Object.keys(HOOKS).map((path) => path.split("/")[1]!))].map((layer) => [layer, `src/${layer}/**`]));
  write(hooks, "keylang.json", `${JSON.stringify({ languages: ["typescript"], layers }, null, 2)}\n`);
  for (const [path, text] of Object.entries(HOOKS)) write(hooks, path, text);
  write(hooks, "keylang/flows/hooks.md", HOOK_FLOW);
  const before = aggregate(results(hooks, ["--static", "behavior"]), []);
  const after = aggregate(results(hooks, ["--static", "shape"]), []);
  monotonic("hooks", "--static shape", before, after);
  const changed = [...before]
    .filter(([key, left]) => left.verdict !== (after.get(key)?.verdict ?? "unverified"))
    .map(([key, left]) => `${key.split(":")[2]} ${left.verdict} → ${after.get(key)?.verdict ?? "unverified"}`)
    .sort();
  assert.deepEqual(changed, ["domain.build.build ok → unverified", "presentation.worker.Worker.generate ok → unverified"]);
});

test("06: excluding the far side of a cycle is unverified, not ok", (t) => {
  const { base, excluded } = excludeCase(
    t,
    "cycle",
    {
      "keylang.json": `${JSON.stringify({ languages: ["typescript"], layers: { app: "src/app/**", infra: "src/infra/**" } })}\n`,
      "src/app/a.ts": 'import { b } from "../infra/b.ts";\nexport function a(): void { b(); }\n',
      "src/infra/b.ts": 'import { a } from "../app/a.ts";\nexport function b(): void { a(); }\n',
      "keylang/rules.md": "# rules\n\n- module app.a\n  - no-cycles\n",
    },
    "src/infra/b.ts",
  );
  assert.equal(base.find((item) => item.criterion === "no-cycles")?.verdict, "fail", JSON.stringify(base));
  assert.equal(excluded.find((item) => item.criterion === "no-cycles")?.verdict, "unverified", JSON.stringify(excluded));
});

// A minimal pair: the fixture as written, then the same files with `file` excluded.
function excludeCase(t: TestContext, name: string, files: Record<string, string>, file: string): { base: Row[]; excluded: Row[]; status: number | null } {
  const dir = mkdtempSync(join(tmpdir(), `keylang-meta-${name}-`));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(files)) write(dir, path, text);
  const lines = layersLines(rulesText(dir));
  const base = results(dir);
  withExclude(dir, file);
  const run = keylang(dir, ["check", "--format", "json"]);
  assert.notEqual(run.status, 2, run.stderr);
  const excluded = (JSON.parse(run.stdout) as { results: Row[] }).results;
  monotonic(name, `exclude ${file}`, aggregate(base, lines), aggregate(excluded, lines));
  return { base, excluded, status: run.status };
}

const NESTED_LAYERS = "# rules\n\n- layers domain < app\n  - infra\n";
const NESTED_CONFIG = `${JSON.stringify({ languages: ["typescript"], layers: { domain: "src/domain/**", app: "src/app/**", infra: "src/infra/**" } })}\n`;

test("07: excluding an upward file in a nested layer is unverified, not ok", (t) => {
  const { base, excluded } = excludeCase(
    t,
    "layers-nested",
    {
      "keylang.json": NESTED_CONFIG,
      "src/domain/d.ts": "export function d(): void {}\n",
      "src/app/y.ts": "export function y(): void {}\n",
      "src/infra/x.ts": 'import { y } from "../app/y.ts";\nexport function x(): void {\n  y();\n}\n',
      "keylang/rules.md": NESTED_LAYERS,
    },
    "src/infra/x.ts",
  );
  assert.ok(base.some((row) => row.code === "K101"), JSON.stringify(base));
  const row = excluded.find((item) => item.criterion.startsWith("layers"));
  assert.equal(row?.verdict, "unverified", JSON.stringify(excluded));
  assert.match(row?.evidence ?? "", /src\/infra\/x\.ts:1:1/);
});

test("07: excluding an upward file outside every layer is unverified, not ok", (t) => {
  const { base, excluded } = excludeCase(
    t,
    "layers-outside",
    {
      "keylang.json": NESTED_CONFIG,
      "src/domain/d.ts": "export function d(): void {}\n",
      "src/app/y.ts": "export function y(): void {}\n",
      "src/misc/z.ts": 'import { y } from "../app/y.ts";\nexport function z(): void {\n  y();\n}\n',
      "keylang/rules.md": NESTED_LAYERS,
    },
    "src/misc/z.ts",
  );
  assert.ok(base.some((row) => row.criterion.startsWith("layers")), JSON.stringify(base));
  const row = excluded.find((item) => item.criterion.startsWith("layers"));
  assert.equal(row?.verdict, "unverified", JSON.stringify(excluded));
  assert.match(row?.evidence ?? "", /src\/misc\/z\.ts:1:1/);
});

test("07: excluding the far side of a cycle outside every layer is unverified, not ok", (t) => {
  const { base, excluded } = excludeCase(
    t,
    "cycle-outside",
    {
      "keylang.json": `${JSON.stringify({ languages: ["typescript"], layers: { app: "src/app/**" } })}\n`,
      "src/app/a.ts": 'import { b } from "../misc/b.ts";\nexport function a(): void {\n  b();\n}\n',
      "src/misc/b.ts": 'import { a } from "../app/a.ts";\nexport function b(): void {\n  a();\n}\n',
      "keylang/rules.md": "# rules\n\n- module app.a\n  - no-cycles\n",
    },
    "src/misc/b.ts",
  );
  assert.equal(base.find((item) => item.criterion === "no-cycles")?.verdict, "fail", JSON.stringify(base));
  assert.equal(excluded.find((item) => item.criterion === "no-cycles")?.verdict, "unverified", JSON.stringify(excluded));
});

test("08: excluding the only importer of an allowed package adds no K001", (t) => {
  const { excluded, status } = excludeCase(
    t,
    "external",
    {
      "keylang.json": `${JSON.stringify({ languages: ["typescript"], layers: { app: "src/app/**", infra: "src/infra/**" } })}\n`,
      "package.json": `${JSON.stringify({ dependencies: { pg: "1.0.0" } })}\n`,
      "src/app/a.ts": "export function a(): void {}\n",
      "src/infra/db.ts": 'import pg from "pg";\nexport function db(): void {\n  pg;\n}\n',
      "keylang/rules.md": "# rules\n\n- deny infra external\n- allow infra external.pg\n",
    },
    "src/infra/db.ts",
  );
  assert.equal(status, 0, JSON.stringify(excluded));
  assert.equal(excluded.find((item) => item.criterion === "deny infra external")?.verdict, "unverified", JSON.stringify(excluded));
});

/** PHP: a callable and a closure passed as arguments, a callable stored in a variable, and a plain call beside them. */
const PHP_CALLABLES: Record<string, string> = {
  "keylang.json": `${JSON.stringify({ languages: ["php"], layers: { app: ["src/App/**"], domain: ["src/Domain/**"] } })}\n`,
  "src/Domain/Store.php": "<?php\nnamespace Shop\\Domain;\n\nclass Store\n{\n    public function save(): void {}\n    public function flush(): void {}\n    public function audit(): void {}\n    public function later(): void {}\n}\n",
  "src/App/Checkout.php":
    "<?php\nnamespace Shop\\App;\n\nuse Shop\\Domain\\Store;\n\nclass Checkout\n{\n    public function __construct(private Store $store) {}\n\n    public function buy(): void\n    {\n        $this->store->save();\n        $this->lock(\\Closure::fromCallable([$this->store, 'flush']), fn() => $this->store->audit());\n        $cb = [$this->store, 'later'];\n    }\n\n    private function lock(callable $a, callable $b): void {}\n}\n",
  "keylang/flows.md": "# flow buy\n\n- trigger app.Checkout.Checkout.buy\n  - step domain.Store.Store.save\n  - step domain.Store.Store.flush\n  - step domain.Store.Store.audit\n  - step domain.Store.Store.later\n",
};

test("--static shape only weakens a step through a callable or a closure passed as an argument: ok → unverified, never fail", (t) => {
  const php = mkdtempSync(join(tmpdir(), "keylang-meta-callables-"));
  t.after(() => rmSync(php, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(PHP_CALLABLES)) write(php, path, text);
  const before = aggregate(results(php, ["--static", "behavior"]), []);
  const after = aggregate(results(php, ["--static", "shape"]), []);
  monotonic("php-callables", "--static shape", before, after);
  const changed = [...before]
    .filter(([key, left]) => left.verdict !== (after.get(key)?.verdict ?? "unverified"))
    .map(([key, left]) => `${key.split(":")[2]} ${left.verdict} → ${after.get(key)?.verdict ?? "unverified"}`)
    .sort();
  // The plain call stays ok in both; the stored callable is unverified in both.
  assert.deepEqual(changed, ["domain.Store.Store.audit ok → unverified", "domain.Store.Store.flush ok → unverified"]);
  assert.equal(before.get("flow:static:domain.Store.Store.save:keylang/flows.md:4")?.verdict, "ok");
  assert.equal(before.get("flow:static:domain.Store.Store.later:keylang/flows.md:7")?.verdict, "unverified");
});
