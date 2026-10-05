// Review 2026-10-05, the config group: snapshot inputs, map order, layer
// globs, agent values, NFC IDs and `assume`. Every case drives the real CLI on
// a temporary repository.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");

function write(dir: string, path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

function keylang(cwd: string, args: string[], env: NodeJS.ProcessEnv = process.env): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8", env });
  if (r.error) throw r.error;
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function repo(t: TestContext, files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-review-config-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(files)) write(dir, path, text);
  return dir;
}

const json = (value: unknown): string => `${JSON.stringify(value)}\n`;

interface Index {
  snapshotId: string;
  manifest: { grammars: Record<string, string>; config: Record<string, unknown> };
  nodes: Record<string, { kind: string; file: string | null }>;
  edges: { kind: string; source: string; target: string | null; resolution: string }[];
  coverage: { kind: string; file: string; line: number; col: number; text: string; reason: string; source: string | null }[];
  exports: { module: string; name: string; symbol: string | null; form?: string; from?: string }[];
  stats: { callsExternal: number; callsDynamic: number; callsUnresolved: number; importsUnresolved: number };
}

function index(dir: string): Index {
  return JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as Index;
}

test("the map lists modules in code-unit order, whatever the ICU of the Node build", (t) => {
  // ICU collation puts `a_b` before `a-b` and `alpha` before `Zeta`; code units do the opposite.
  const dir = repo(t, {
    "keylang.json": json({ languages: ["typescript"], layers: { app: ["src/**"] } }),
    "src/alpha.ts": "export function alpha(): void {}\n",
    "src/Zeta.ts": "export function zeta(): void {}\n",
    "src/a_b.ts": "export function underscore(): void {}\n",
    "src/a-b.ts": "export function dash(): void {}\n",
  });
  const run = keylang(dir, ["map"]);
  assert.equal(run.status, 0, run.stderr);
  const modules = readFileSync(join(dir, "keylang/map/app.md"), "utf8")
    .split("\n")
    .flatMap((line) => /^ {2}- module \[([^\]]+)\]/.exec(line)?.slice(1) ?? []);
  assert.deepEqual(modules, ["Zeta", "a-b", "a_b", "alpha"]);
});

test("the snapshot records the real versions of the tree-sitter runtime and grammars", (t) => {
  const dir = repo(t, {
    "keylang.json": json({ languages: ["typescript"], layers: { app: ["src/**"] } }),
    "src/a.ts": "export function a(): void {}\n",
  });
  const run = keylang(dir, ["map"]);
  assert.equal(run.status, 0, run.stderr);
  const grammars = index(dir).manifest.grammars;
  assert.deepEqual(Object.keys(grammars).sort(), ["@vscode/tree-sitter-wasm", "web-tree-sitter"]);
  // `web-tree-sitter` does not export `./package.json`: reading it by name gave "unknown", and an upgrade changed no snapshot id.
  for (const [name, version] of Object.entries(grammars)) assert.match(version, /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/, name);
  const installed = (name: string): string => (JSON.parse(readFileSync(join(root, "node_modules", name, "package.json"), "utf8")) as { version: string }).version;
  assert.equal(grammars["web-tree-sitter"], installed("web-tree-sitter"));
  assert.equal(grammars["@vscode/tree-sitter-wasm"], installed("@vscode/tree-sitter-wasm"));
});

test("every provider's model follows the rule that keeps the explanation header intact", (t) => {
  const files = { "src/a.ts": "export function a(): void {}\n" };
  const layers = { app: ["src/**"] };
  // No key, no agent CLI: an invalid value must stop the command before any request.
  const env = (home: string, agent?: string): NodeJS.ProcessEnv => {
    const out: NodeJS.ProcessEnv = { ...process.env, HOME: home, PATH: "" };
    for (const name of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "OPENROUTER_API_KEY", "KEYLANG_AGENT"]) delete out[name];
    if (agent !== undefined) out.KEYLANG_AGENT = agent;
    return out;
  };
  for (const agent of ["anthropic:a-->b", "anthropic:-x", "openrouter:a--b", "openrouter:x<y", "anthropic:a b"]) {
    const dir = repo(t, { ...files, "keylang.json": json({ languages: ["typescript"], layers, agent }) });
    const run = keylang(dir, ["explain", "app.a.a", "--llm"], env(dir));
    assert.equal(run.status, 2, `${agent}: ${run.stderr}`);
    assert.match(run.stderr, /keylang\.json: `agent` must be "anthropic:<model>", "openrouter:<model>" or "cli:<name>\[:<model>\]" \(a model has no spaces/, agent);
  }
  const dir = repo(t, { ...files, "keylang.json": json({ languages: ["typescript"], layers }) });
  const variable = keylang(dir, ["explain", "app.a.a", "--llm"], env(dir, "openrouter:a-->b"));
  assert.equal(variable.status, 2, variable.stderr);
  assert.match(variable.stderr, /KEYLANG_AGENT must be .*, got "openrouter:a-->b"/);
  write(dir, ".config/keylang/agents.json", json({ use: "anthropic:x<y>" }));
  const settings = keylang(dir, ["explain", "app.a.a", "--llm"], env(dir));
  assert.equal(settings.status, 2, settings.stderr);
  assert.match(settings.stderr, /agents\.json: `use` must be .*, got "anthropic:x<y>"/);
  // A model with `/`, `.` and `:` stays valid.
  write(dir, "keylang.json", json({ languages: ["typescript"], layers, agent: "openrouter:meta-llama/llama-3.1-8b-instruct:free" }));
  rmSync(join(dir, ".config"), { recursive: true });
  const valid = keylang(dir, ["explain", "app.a.a", "--llm"], env(dir));
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stderr, /OPENROUTER_API_KEY/);
});

test("IDs from file and directory names are NFC, whatever normalization the disk keeps", (t) => {
  const nfd = `cafe${String.fromCodePoint(0x301)}`; // as macOS stores it: `e` and a combining acute accent
  const nfc = `caf${String.fromCodePoint(0xe9)}`; // as a person types it: one precomposed `é`
  const dir = repo(t, {
    // The layer name typed in NFD too: one layer with the spec's spelling.
    "keylang.json": json({ languages: ["typescript"], layers: { [`${nfd}s`]: ["src/**"] } }),
    [`src/${nfd}/menu.ts`]: `export function order(): void {}\n`,
    "src/main.ts": `import { order } from "./${nfd}/menu.ts";\nexport function main(): void {\n  order();\n}\n`,
    "keylang/flows/order.md": `# flow order\n\n- trigger ${nfc}s.main.main\n  - step ${nfc}s.${nfc}.menu.order\n`,
  });
  const run = keylang(dir, ["map"]);
  assert.equal(run.status, 0, run.stderr);
  const nodes = index(dir).nodes;
  const id = `${nfc}s.${nfc}.menu.order`;
  assert.ok(nodes[id], Object.keys(nodes).join(", "));
  assert.equal(Object.keys(nodes).some((key) => key !== key.normalize("NFC")), false);
  // The path stays the one on disk: keylang reads the file by it.
  assert.equal(nodes[id]!.file, `src/${nfd}/menu.ts`);
  assert.ok(readFileSync(join(dir, `keylang/map/${nfc}s.md`), "utf8").includes(`- module ${nfc}`));
  const check = keylang(dir, ["check", "--format", "json"]);
  assert.equal(check.status, 0, check.stdout);
  const rows = (JSON.parse(check.stdout) as { results: { criterion: string; verdict: string; code: string | null }[] }).results;
  assert.equal(rows.some((row) => row.code === "K001"), false, check.stdout);
  assert.ok(rows.some((row) => row.criterion === "ID" && row.verdict === "ok" && check.stdout.includes(id)), check.stdout);

  // Two keys that are one name once normalized: an error naming both.
  write(dir, "keylang.json", `{"languages":["typescript"],"layers":{"${nfd}s":["src/**"],"${nfc}s":["lib/**"]}}\n`);
  const twice = keylang(dir, ["map", "--check"]);
  assert.equal(twice.status, 2);
  assert.ok(twice.stderr.includes(`keylang.json: \`layers.${nfc}s\` is the layer \`layers.${nfd}s\` written in another Unicode normalization`), twice.stderr);
});

test("map warns about layer globs that overlap or match nothing, and keeps its exit codes", (t) => {
  const warnings = (stderr: string): string[] => stderr.split("\n").filter((line) => line.startsWith("warning: "));
  const overlap = repo(t, {
    "keylang.json": json({ format: 2, languages: ["typescript"], layers: { app: ["src/**"], core: ["src/**", "src/core/**"] } }),
    "src/a.ts": "export function a(): void {}\n",
    "src/b.ts": "export function b(): void {}\n",
  });
  const run = keylang(overlap, ["map"]);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(warnings(run.stderr), [
    "warning: keylang.json: 2 file(s) match the globs of both `layers.app` and `layers.core` (e.g. `src/a.ts`); the layer listed first takes them: `app` by `src/**`",
    "warning: keylang.json: `layers.core`: `src/core/**` matches no source file",
  ]);
  const again = keylang(overlap, ["map", "--check"]);
  assert.equal(again.status, 0, again.stderr);
  assert.deepEqual(warnings(again.stderr), warnings(run.stderr));
  assert.equal(keylang(overlap, ["check"]).status, 0);

  const ghost = repo(t, {
    "keylang.json": json({ format: 2, languages: ["typescript"], layers: { app: ["src/**"], ghost: ["lib/**"] } }),
    "src/a.ts": "export function a(): void {}\n",
  });
  const nomatch = keylang(ghost, ["map"]);
  assert.equal(nomatch.status, 0, nomatch.stderr);
  assert.deepEqual(warnings(nomatch.stderr), ["warning: keylang.json: `layers.ghost`: `lib/**` matches no source file"]);

  // `[` is a literal, as in a Next.js route: `src/[id]/**` matches that directory, and `lib/[**` nothing.
  const next = repo(t, {
    "keylang.json": json({ format: 2, languages: ["typescript"], layers: { page: ["src/[id]/**"], typo: ["lib/[**"], rest: ["src/**"] } }),
    "src/[id]/page.ts": "export function page(): void {}\n",
    "src/shell.ts": "export function shell(): void {}\n",
    "lib/x.ts": "export function x(): void {}\n",
  });
  const literal = keylang(next, ["map"]);
  assert.equal(literal.status, 0, literal.stderr);
  assert.deepEqual(warnings(literal.stderr), [
    "warning: keylang.json: 1 file(s) match the globs of both `layers.page` and `layers.rest` (e.g. `src/[id]/page.ts`); the layer listed first takes them: `page` by `src/[id]/**`",
    "warning: keylang.json: `layers.typo`: `lib/[**` matches no source file",
  ]);
  assert.ok(index(next).nodes["page.page.page"], Object.keys(index(next).nodes).join(", "));

  // A guessed layout warns about nothing: keylang wrote it from the tree.
  const guessed = repo(t, { "src/domain/a.ts": "export function a(): void {}\n", "src/app/b.ts": "export function b(): void {}\n" });
  assert.deepEqual(warnings(keylang(guessed, ["map"]).stderr), []);
});

// The shop of the review: `src/infra/store.ts` imports `src/config.ts`, which git ignores,
// so CI has no such file while a developer's checkout does.
const SHOP_LAYERS = { app: ["src/app/**"], domain: ["src/domain/**"], infra: ["src/infra/**"], ui: ["src/ui/**"] };
const SHOP = {
  "src/domain/order.ts": "export interface Order { total: number }\nexport function create(total: number): Order {\n  return { total };\n}\n",
  "src/infra/store.ts": 'import { settings } from "../config";\nimport type { Order } from "../domain/order.ts";\nconst db: Order[] = [];\nexport function save(order: Order): void {\n  if (settings.persist) db.push(order);\n}\n',
  "src/app/purchase.ts": 'import { create, type Order } from "../domain/order.ts";\nimport { save } from "../infra/store.ts";\nexport function buy(total: number): Order {\n  const order = create(total);\n  save(order);\n  return order;\n}\n',
  "src/ui/cli.ts": 'import { buy } from "../app/purchase.ts";\nexport function main(): void {\n  buy(3);\n}\n',
  "keylang/rules.md": "# rules\n\n- layers domain < infra < app < ui\n- deny app external, unassigned\n- deny domain app, external, infra, ui, unassigned\n- deny infra app, external, ui, unassigned\n- no-cycles\n",
};
const CONFIG_TS = "export const settings = { persist: true };\n";

interface Row {
  criterion: string;
  verdict: string;
  evidence: string;
  code: string | null;
}

function verdicts(dir: string): { status: number | null; rows: Row[]; stdout: string } {
  const run = keylang(dir, ["check", "--format", "json"]);
  return { status: run.status, stdout: run.stdout, rows: (JSON.parse(run.stdout) as { results: Row[] }).results };
}

test("assume: an import of a file keylang neither reads nor requires is no edge and no hole, present or absent", (t) => {
  const config = (extra: Record<string, unknown> = {}): string => json({ format: 2, languages: ["typescript"], layers: SHOP_LAYERS, ...extra });
  // Without `assume` the missing file is a dependency hole: `deny infra …` cannot say ok.
  const ci = repo(t, { ...SHOP, "keylang.json": config() });
  const hole = verdicts(ci);
  assert.equal(hole.rows.find((row) => row.criterion === "deny infra app external ui unassigned")?.verdict, "unverified", hole.stdout);

  for (const present of [false, true]) {
    const dir = repo(t, { ...SHOP, ...(present ? { "src/config.ts": CONFIG_TS } : {}), "keylang.json": config({ assume: ["src/config.ts"] }) });
    const map = keylang(dir, ["map"]);
    assert.equal(map.status, 0, map.stderr);
    assert.doesNotMatch(map.stderr, /unresolved import|config/, `present: ${present}`);
    const snapshot = index(dir);
    // Never indexed, even when present: no module, no manifest entry, no edge.
    assert.equal(Object.keys(snapshot.nodes).some((id) => id.endsWith(".config")), false, Object.keys(snapshot.nodes).join(", "));
    assert.equal(JSON.stringify(snapshot.manifest).includes("src/config.ts\",\"sha256"), false);
    assert.deepEqual(snapshot.manifest.config.assume, ["src/config.ts"]);
    assert.equal(snapshot.edges.some((edge) => edge.source === "infra.store" && edge.kind === "import" && edge.target === null), false, JSON.stringify(snapshot.edges));
    const entries = snapshot.coverage.filter((item) => item.kind === "assumed-import");
    assert.deepEqual(
      entries.map(({ file, line, col, text, reason, source }) => ({ file, line, col, text, reason, source })),
      [{ file: "src/infra/store.ts", line: 1, col: 1, text: 'import { settings } from "../config";', reason: "assumed import `../config` → `src/config.ts` (`assume` in keylang.json)", source: "infra.store" }],
      `present: ${present}`,
    );
    assert.equal(snapshot.coverage.some((item) => item.kind === "unresolved-import"), false);
    // Rules see no hole: the same verdicts in CI and in a checkout that has the file.
    const run = verdicts(dir);
    assert.equal(run.status, 0, run.stdout);
    for (const row of run.rows) assert.notEqual(row.verdict, "unverified", `present: ${present}: ${row.criterion}: ${row.evidence}`);
    assert.equal(keylang(dir, ["check", "--strict"]).status, 0);
  }
});

test("assume: a path-mapped specifier names the path it would resolve to; `assume` is in the snapshot id and wins over `outside`", (t) => {
  const store = 'import { settings } from "@/generated/settings";\nexport function save(): boolean {\n  return settings.persist;\n}\n';
  const files = {
    ...SHOP,
    "src/infra/store.ts": store,
    "tsconfig.json": json({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } } }),
  };
  const config = (extra: Record<string, unknown>): string => json({ format: 2, languages: ["typescript"], layers: SHOP_LAYERS, ...extra });
  const dir = repo(t, { ...files, "keylang.json": config({ assume: ["src/generated/**"] }) });
  assert.equal(keylang(dir, ["map"]).status, 0);
  const assumed = index(dir);
  assert.deepEqual(
    assumed.coverage.filter((item) => item.kind === "assumed-import").map((item) => item.reason),
    ["assumed import `@/generated/settings` → `src/generated/settings.ts` (`assume` in keylang.json)"],
  );
  const run = verdicts(dir);
  for (const row of run.rows) assert.notEqual(row.verdict, "unverified", `${row.criterion}: ${row.evidence}`);

  // The same file `outside` names too: `assume` wins, so the import is no K107.
  write(dir, "src/generated/settings.ts", "export const settings = { persist: true };\n");
  write(dir, "keylang.json", config({ assume: ["src/generated/**"], outside: ["src/generated/**"] }));
  const both = verdicts(dir);
  assert.equal(both.status, 0, both.stdout);
  assert.equal(both.rows.some((row) => row.code === "K107"), false, both.stdout);
  assert.equal(keylang(dir, ["map"]).status, 0);
  assert.equal(Object.keys(index(dir).nodes).some((id) => id.startsWith("outside.")), false);

  // Without `assume` the snapshot is another one.
  write(dir, "keylang.json", config({ outside: ["src/generated/**"] }));
  assert.equal(keylang(dir, ["map"]).status, 0);
  assert.notEqual(index(dir).snapshotId, assumed.snapshotId);
  assert.ok(verdicts(dir).rows.some((row) => row.code === "K107"));
});

test("assume: names an assumed import binds are called outside the graph, like a package's", (t) => {
  const store = [
    'import { loadSettings, Settings } from "../config";',
    'import * as cfg from "../config";',
    'export { settings } from "../config";',
    "export class Store extends Settings {",
    "  save(): boolean {",
    "    return loadSettings().persist && cfg.flag() && this.inherited();",
    "  }",
    "}",
    "export function save(order: unknown): void {}",
    "",
  ].join("\n");
  const dir = repo(t, { ...SHOP, "src/infra/store.ts": store, "keylang.json": json({ format: 2, languages: ["typescript"], layers: SHOP_LAYERS, assume: ["src/config.ts"] }) });
  const map = keylang(dir, ["map"]);
  assert.equal(map.status, 0, map.stderr);
  const snapshot = index(dir);
  // Each import is an `assumed-import`, and the calls through its names are no holes.
  assert.deepEqual(
    snapshot.coverage.filter((item) => item.file === "src/infra/store.ts").map((item) => `${item.kind} ${item.line}`),
    ["assumed-import 1", "assumed-import 2", "assumed-import 3"],
  );
  assert.deepEqual([snapshot.stats.callsExternal, snapshot.stats.callsDynamic, snapshot.stats.callsUnresolved, snapshot.stats.importsUnresolved], [3, 0, 0, 0]);
  // A name re-exported from the file is no symbol keylang indexes, and comes from no node.
  assert.deepEqual(
    snapshot.exports.filter((row) => row.module === "infra.store" && row.name === "settings"),
    [{ module: "infra.store", name: "settings", symbol: null, kind: "value", form: "reexport" }],
  );
});

test("assume is validated like exclude, and init and draft map do not write it", (t) => {
  const dir = repo(t, { ...SHOP });
  for (const [assume, error] of [
    ["src/config.ts", '`assume` must be an array of globs, got "src/config.ts"'],
    [["src/config.ts", 3], "`assume` must be an array of globs, got [\"src/config.ts\",3]"],
  ] as const) {
    write(dir, "keylang.json", json({ languages: ["typescript"], layers: SHOP_LAYERS, assume }));
    const run = keylang(dir, ["map", "--check"]);
    assert.equal(run.status, 2, run.stderr);
    assert.ok(run.stderr.includes(`keylang.json: ${error}`), run.stderr);
  }
  write(dir, "keylang.json", json({ languages: ["typescript"], layers: SHOP_LAYERS, assume: ["src/config.ts"] }));
  const draft = keylang(dir, ["draft", "map"]);
  assert.equal(draft.status, 0, draft.stderr);
  assert.doesNotMatch(draft.stdout, /assume/);
  const fresh = repo(t, { ...SHOP, "src/config.ts": CONFIG_TS });
  assert.equal(keylang(fresh, ["init", "--agents=none"]).status, 0);
  assert.doesNotMatch(readFileSync(join(fresh, "keylang.json"), "utf8"), /assume/);
});
