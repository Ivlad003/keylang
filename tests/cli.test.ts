// End-to-end tests: run the `keylang` CLI on examples and fixtures.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");

/** Run `keylang` with `cwd` as working directory. */
function keylang(cwd: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

test("check shop reports the dangling slide reference", () => {
  const o = keylang(root, ["check", "examples/shop"]);
  assert.equal(o.status, 1);
  assert.match(o.stdout, /examples\/shop\/map\.md:27:13: K001 dangling reference `domain\.aggregate`/);
  assert.match(o.stdout, /unverified no snapshot/);
  assert.doesNotMatch(o.stdout, /K103/);
  assert.match(o.stderr, /1 fail, 1 unverified, 0 ok/);
});

test("check shop-fixed is clean", () => {
  const o = keylang(root, ["check", "examples/shop-fixed"]);
  assert.equal(o.status, 0, o.stdout);
  assert.match(o.stdout, /unverified no snapshot/);
  assert.doesNotMatch(o.stdout, /K001|K101|K102|K103/);
});

// M0 criterion: the Markdown from the slides, verbatim, parses; both slide
// mistakes are reported (misplaced `options`, `domain.aggregate`). Without
// code there is no snapshot, so rules are unverified and K103 is not reported.
test("check verbatim slide", () => {
  const o = keylang(root, ["check", "tests/fixtures/slide"]);
  assert.equal(o.status, 1);
  assert.match(o.stdout, /slide\.md:12:11: K005 unexpected arguments after layer `options`/);
  assert.match(o.stdout, /slide\.md:15:13: K001 dangling reference `domain\.aggregate`/);
  assert.match(o.stdout, /unverified no snapshot/);
  assert.doesNotMatch(o.stdout, /K103/);
  assert.equal(o.stdout.trimEnd().split("\n").length, 3, o.stdout);
});

// One fixture per diagnostic family: K002 across files, K003 indentation,
// K004 keyword out of place, K005 bad arguments, K001 in a flow.
test("check diagnostics fixture", () => {
  const o = keylang(root, ["check", "tests/fixtures/diagnostics"]);
  assert.equal(o.status, 1);
  assert.equal(o.stdout, readFileSync(join(root, "tests/fixtures/diagnostics.expected"), "utf8"));
});

test("parse --json shop", () => {
  const o = keylang(root, ["parse", "--json", "examples/shop"]);
  assert.equal(o.status, 0, o.stderr);
  const docs = JSON.parse(o.stdout);
  assert.deepEqual(
    docs.map((d: { path: string }) => d.path),
    ["examples/shop/flows/checkout.md", "examples/shop/map.md", "examples/shop/rules.md"],
  );
  assert.deepEqual(
    docs.map((d: { sections: { kind: string }[] }) => d.sections[0]!.kind),
    ["flow", "map", "rules"],
  );
  const map = docs[1];
  assert.ok(map.generated.startsWith("<!-- keylang:generated"));
  // items[0] is the prose paragraph, then the four layers.
  const layer = map.sections[0].items[1];
  assert.equal(layer.type, "node");
  assert.equal(layer.kind, "layer");
  assert.equal(layer.id, "domain");
  const module = layer.children[0];
  assert.equal(module.id, "domain.orderAggregate");
  assert.equal(module.link.path, "src/domain/order.ts");
  assert.equal(module.link.line, 1);
  assert.equal(module.name.span.start.line, 9);
  assert.equal(module.name.span.start.col, 13);
  const create = module.children[0];
  assert.equal(create.kind, "fn");
  assert.equal(create.text.value, "(items: Item[]) → Order");
});

test("fmt --check passes on examples", () => {
  const o = keylang(root, ["fmt", "--check", "examples"]);
  assert.equal(o.status, 0, o.stdout);
});

test("fmt canonicalizes and is idempotent", () => {
  const fixtures = join(root, "tests/fixtures/fmt");
  const tmp = mkdtempSync(join(tmpdir(), "keylang-fmt-"));
  try {
    copyFileSync(join(fixtures, "messy.md"), join(tmp, "messy.md"));

    const check = keylang(tmp, ["fmt", "--check", "messy.md"]);
    assert.equal(check.status, 1);
    assert.equal(check.stdout, "messy.md: not formatted\n");

    assert.equal(keylang(tmp, ["fmt", "messy.md"]).status, 0);
    assert.equal(readFileSync(join(tmp, "messy.md"), "utf8"), readFileSync(join(fixtures, "messy.expected"), "utf8"));

    const again = keylang(tmp, ["fmt", "--check", "messy.md"]);
    assert.equal(again.status, 0, `fmt is not idempotent: ${again.stdout}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("fmt keeps a quoted token that touches the next one", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "keylang-fmt-quote-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const text = '# map\n\n- layer base\n  - module config\n    - fn evidence (field: "tests" | "trace") → string\n';
  writeFileSync(join(dir, "m.md"), text);
  const o = keylang(dir, ["fmt", "--check", "m.md"]);
  assert.equal(o.status, 0, o.stdout);
  assert.equal(keylang(root, ["fmt", "--check", "keylang"]).status, 0);
});

test("fmt refuses bad indentation", () => {
  const o = keylang(root, ["fmt", "--check", "tests/fixtures/diagnostics/indent.md"]);
  assert.equal(o.status, 1);
  assert.match(o.stderr, /K003/);
});

/** Copy `tests/fixtures/repo` to a temp dir so `map` can write into it. */
function repoCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-repo-"));
  cpSync(join(root, "tests/fixtures/repo"), dir, { recursive: true });
  return dir;
}

// M1: map of a small TS repository — one file per layer, deps, calls,
// class methods, `internal`, signatures — plus the index.
test("map generates the expected map and index", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true }));
  const o = keylang(dir, ["map"]);
  assert.equal(o.status, 0, o.stderr);
  const expectedDir = join(root, "tests/fixtures/repo.expected");
  const names = readdirSync(join(dir, "keylang/map")).sort();
  assert.deepEqual(names, readdirSync(expectedDir).sort());
  for (const n of names) {
    assert.equal(readFileSync(join(dir, "keylang/map", n), "utf8"), readFileSync(join(expectedDir, n), "utf8"), n);
  }
  const index = JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8"));
  assert.equal(index.schema, 4);
  assert.equal(index.nodes["domain.order"].members, "complete");
  assert.equal(index.nodes["external.node"].members, "opaque");
  assert.deepEqual(index.nodes["domain.order.createOrder"].callers, ["app.checkout.checkout"]);
  assert.ok(index.exports.some((e: { module: string; name: string; kind: string }) => e.module === "domain.order" && e.name === "createOrder" && e.kind === "fn"));
  for (const node of Object.values(index.nodes) as { precision?: unknown }[]) assert.equal("precision" in node, false);
  for (const edge of index.edges as { resolution: string; provenance: string }[]) {
    assert.ok(edge.resolution === "resolved" || edge.resolution === "ambiguous" || edge.resolution === "unresolved");
    assert.equal(edge.provenance, "syntactic");
  }
  assert.equal(keylang(dir, ["map", "--check"]).status, 0);
  assert.equal(keylang(dir, ["check"]).status, 0);
});

test("map links are relative, encoded, and round-trip", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "keylang-links-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "src/app/(shop)"), { recursive: true });
  writeFileSync(
    join(dir, "keylang.json"),
    `${JSON.stringify({ languages: ["typescript"], layers: { main: ["src/**"] } }, null, 2)}\n`,
  );
  writeFileSync(join(dir, "src/type.ts"), "export function create() {\n  return 1;\n}\n");
  writeFileSync(
    join(dir, "src/app/(shop)/page.ts"),
    'import { create } from "../../type.ts";\n\nexport function page() {\n  return create();\n}\n',
  );
  writeFileSync(join(dir, "src/my file.ts"), "export function spaced() {\n  return 1;\n}\n");
  writeFileSync(join(dir, "src/c#d.ts"), "export function hashName() {\n  return 1;\n}\n");
  writeFileSync(join(dir, "src/foo bar.ts"), "export const a = 1;\n");
  writeFileSync(join(dir, "src/foo_bar.ts"), "export const b = 2;\n");

  const first = keylang(dir, ["map"]);
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stderr, /same module ID/);
  const mapPath = join(dir, "keylang/map/main.md");
  const text = readFileSync(mapPath, "utf8");
  assert.match(text, /\]\(\.\.\/\.\.\/src\/type\.ts#L1\)/);
  assert.match(text, /\]\(\.\.\/\.\.\/src\/app\/%28shop%29\/page\.ts#L1\)/);
  assert.match(text, /\]\(\.\.\/\.\.\/src\/my%20file\.ts#L1\)/);
  assert.match(text, /\]\(\.\.\/\.\.\/src\/c%23d\.ts#L1\)/);
  assert.match(text, /- type2 main\.type\n/);
  assert.doesNotMatch(text, /- type main\.type\n/);
  for (const href of hrefs(text)) {
    const path = href.split("#")[0] ?? "";
    assert.equal(/[ ()#]/.test(path), false, href);
    assert.ok(path.startsWith("../"), href);
  }

  const again = keylang(dir, ["map"]);
  assert.equal(again.status, 0, again.stderr);
  assert.equal(readFileSync(mapPath, "utf8"), text);
  assert.equal(keylang(dir, ["map", "--check"]).status, 0);

  const parsed = keylang(dir, ["parse", "--json", "keylang/map/main.md"]);
  assert.equal(parsed.status, 0, parsed.stderr);
  const page = findNode(JSON.parse(parsed.stdout)[0], "main.app._shop_.page");
  assert.equal(page.link.path, "../../src/app/(shop)/page.ts");
  assert.equal(page.link.target, "../../src/app/(shop)/page.ts#L1");
  const spaced = findNode(JSON.parse(parsed.stdout)[0], "main.my_file");
  assert.equal(spaced.link.path, "../../src/my file.ts");

  const checked = keylang(dir, ["check"]);
  assert.doesNotMatch(checked.stdout, /K005/);
  assert.doesNotMatch(checked.stdout, /K002/);
  assert.equal(checked.status, 0, checked.stdout);
});

test("generated maps of the repo and the fixture parse", () => {
  const fixture = repoCopy();
  try {
    assert.equal(keylang(fixture, ["map"]).status, 0);
    assert.equal(keylang(root, ["map", "--check"]).status, 0, "committed keylang map is stale");
    for (const cwd of [fixture, root]) {
      for (const name of readdirSync(join(cwd, "keylang/map"))) {
        if (!name.endsWith(".md")) continue;
        const parsed = keylang(cwd, ["parse", join("keylang/map", name)]);
        assert.equal(parsed.status, 0, `${name}: ${parsed.stderr}`);
      }
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

function hrefs(markdown: string): string[] {
  return [...markdown.matchAll(/\]\(([^)]*)\)/g)].map((m) => m[1] ?? "");
}

function findNode(doc: { sections: { items: unknown[] }[] }, id: string): { link: { path: string; target: string } } {
  const walk = (node: { id?: string; children?: unknown[]; link?: { path: string; target: string } }): { link: { path: string; target: string } } | null => {
    if (node.id === id) return node as { link: { path: string; target: string } };
    for (const child of node.children ?? []) {
      const found = walk(child as { id?: string; children?: unknown[] });
      if (found) return found;
    }
    return null;
  };
  for (const section of doc.sections) {
    for (const item of section.items) {
      if (item && typeof item === "object" && "id" in item) {
        const found = walk(item as { id?: string; children?: unknown[] });
        if (found) return found;
      }
    }
  }
  throw new Error(`missing node ${id}`);
}

test("snapshot id tracks sources and config, not the clock", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.equal(keylang(dir, ["map"]).status, 0);
  const first = JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8"));
  assert.equal(keylang(dir, ["map"]).status, 0);
  const second = JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8"));
  assert.equal(second.snapshotId, first.snapshotId);
  assert.equal(second.manifest.files.length > 0, true);

  appendFileSync(join(dir, "src/domain/order.ts"), "\n");
  assert.equal(keylang(dir, ["map"]).status, 0);
  const edited = JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8"));
  assert.notEqual(edited.snapshotId, first.snapshotId);

  const cfg = JSON.parse(readFileSync(join(dir, "keylang.json"), "utf8"));
  cfg.layers.extra = ["src/extra/**"];
  writeFileSync(join(dir, "keylang.json"), `${JSON.stringify(cfg, null, 2)}\n`);
  assert.equal(keylang(dir, ["map"]).status, 0);
  const reconfigured = JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8"));
  assert.notEqual(reconfigured.snapshotId, edited.snapshotId);
});

test("snapshot keeps unresolved imports, local calls, and completeness", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "src/domain/empty.ts"), "export {}\n");
  writeFileSync(join(dir, "src/domain/bad.ts"), "export function (\n");
  appendFileSync(
    join(dir, "src/app/checkout.ts"),
    'import { missing } from "./missing.ts";\n\nexport function run(save: (n: number) => void): void {\n  save(1);\n}\n',
  );
  assert.equal(keylang(dir, ["map"]).status, 0);
  const index = JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8"));
  const coverage = index.coverage as { kind: string; file: string; line: number; reason: string }[];
  const missing = coverage.find((c) => c.kind === "unresolved-import" && c.file === "src/app/checkout.ts");
  assert.ok(missing, JSON.stringify(coverage));
  assert.equal(missing.line > 0, true);
  assert.match(missing.reason, /missing\.ts/);
  const local = coverage.find((c) => c.file === "src/app/checkout.ts" && c.reason.includes("`save`"));
  assert.ok(local, JSON.stringify(coverage.filter((c) => c.file === "src/app/checkout.ts")));
  // No module-level `save` in checkout.ts: nothing is shadowed, the parameter is a local value.
  assert.match(local.reason, /call through a local value/);
  assert.equal(index.nodes["domain.empty"].members, "complete");
  assert.equal(index.nodes["domain.bad"].members, "opaque");
  const parseError = coverage.find((c) => c.kind === "parse-error" && c.file === "src/domain/bad.ts");
  assert.ok(parseError);
  assert.equal(parseError.line > 0, true);
  const edge = (index.edges as { resolution: string; provenance: string; reason?: string; file: string | null; line: number }[]).find(
    (e) => e.resolution === "unresolved" && e.reason?.includes("missing.ts"),
  );
  assert.ok(edge);
  assert.equal(edge.provenance, "syntactic");
  assert.equal(edge.file, "src/app/checkout.ts");
  assert.equal("precision" in index.nodes["domain.order"], false);
});

test("snapshot edges name type targets, ambiguity, and unsupported constructs", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "src/domain/again.ts"), "export function total(items: number[]): number {\n  return items.length;\n}\n");
  writeFileSync(
    join(dir, "src/app/use.ts"),
    [
      'import { total } from "../domain/order.ts";',
      'import { total } from "../domain/again.ts";',
      'import { Order } from "../domain/order.ts";',
      "export function checkout(o: Order): Order {",
      "  return o;",
      "}",
      "export function run(): number {",
      "  return total([]);",
      "}",
      "namespace Hidden { export function pay(): void {} }",
      "export function dyn(xs: Array<() => void>, i: number): void {",
      "  xs[i]();",
      '  eval("1");',
      "}",
      "",
    ].join("\n"),
  );
  assert.equal(keylang(dir, ["map"]).status, 0, "map");
  const index = JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as {
    nodes: Record<string, { kind: string; line: number | null; col: number | null; endLine?: number; endCol?: number }>;
    edges: { kind: string; source: string; target: string | null; candidates?: string[]; resolution: string; provenance: string; text: string; line: number; col: number; endLine: number; endCol: number }[];
    coverage: { kind: string; file: string; line: number; col: number; endLine: number; endCol: number; reason: string }[];
  };
  const order = index.nodes["domain.order"];
  assert.equal(order?.line, 1);
  assert.equal(order?.col, 1);
  assert.ok((order?.endLine ?? 0) >= 1 && (order?.endCol ?? 0) >= 1);
  const orderType = index.nodes["domain.order.Order"];
  assert.equal(orderType?.kind, "type");
  assert.ok((orderType?.col ?? 0) >= 1);
  assert.ok((orderType?.endLine ?? 0) >= (orderType?.line ?? 0));
  assert.ok((orderType?.endCol ?? 0) >= 1);
  const created = index.nodes["domain.order.createOrder"];
  assert.ok((created?.col ?? 0) >= 1 && (created?.endLine ?? 0) >= (created?.line ?? 0) && (created?.endCol ?? 0) >= 1);
  const typeEdge = index.edges.find((edge) => edge.kind === "type" && edge.source === "app.use.checkout" && edge.target === "domain.order.Order");
  assert.ok(typeEdge, JSON.stringify(index.edges.filter((edge) => edge.kind === "type" && edge.source.startsWith("app.use"))));
  assert.equal(typeEdge.resolution, "resolved");
  assert.equal(typeEdge.provenance, "syntactic");
  assert.equal(typeEdge.text, "Order");
  assert.ok(typeEdge.endLine > typeEdge.line || typeEdge.endCol > typeEdge.col);
  const ambiguous = index.edges.find((edge) => edge.kind === "call" && edge.source === "app.use.run" && edge.resolution === "ambiguous");
  assert.ok(ambiguous, JSON.stringify(index.edges.filter((edge) => edge.source === "app.use.run")));
  assert.equal(ambiguous.target, null);
  assert.deepEqual([...(ambiguous.candidates ?? [])].sort(), ["domain.again.total", "domain.order.total"]);
  const holes = index.coverage.filter((item) => item.kind === "unsupported" && item.file === "src/app/use.ts" && item.reason.startsWith("unsupported construct"));
  assert.ok(holes.some((item) => item.reason.includes("namespace")));
  assert.ok(holes.some((item) => item.reason.includes("computed call")));
  assert.ok(holes.some((item) => item.reason.includes("eval")));
  for (const item of holes) assert.ok(item.line >= 1 && item.col >= 1 && item.endLine >= item.line && item.endCol >= 1);
});

test("packed tarball runs the CLI from node_modules", (t) => {
  const pack = spawnSync("npm", ["pack", "--json"], { cwd: root, encoding: "utf8" });
  assert.equal(pack.status, 0, pack.stderr);
  const packed = JSON.parse(pack.stdout) as { filename: string }[];
  const tarball = join(root, packed[0]!.filename);
  const tmp = mkdtempSync(join(tmpdir(), "keylang-pack-"));
  const localRepo = repoCopy();
  const packedRepo = repoCopy();
  t.after(() => {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(localRepo, { recursive: true, force: true });
    rmSync(packedRepo, { recursive: true, force: true });
    rmSync(tarball, { force: true });
  });

  const listing = spawnSync("tar", ["-tzf", tarball], { encoding: "utf8" });
  assert.equal(listing.status, 0, listing.stderr);
  const names = listing.stdout.split("\n");
  assert.ok(names.some((n) => n.endsWith("/dist/cli.js")));
  assert.ok(names.some((n) => n.endsWith("/dist/wasm/tree-sitter-typescript.wasm")));
  assert.ok(names.some((n) => n.endsWith("/dist/wasm/tree-sitter-tsx.wasm")));
  assert.ok(names.some((n) => n.endsWith("/dist/wasm/tree-sitter-javascript.wasm")));
  assert.ok(names.some((n) => n.endsWith("/bin/keylang.js")));
  assert.equal(names.some((n) => n.includes("/src/")), false);
  const published = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string; files: string[] };
  assert.ok(published.files.includes("bin"));
  assert.ok(published.files.includes("dist"));
  assert.ok(published.files.includes("dist/wasm"));

  writeFileSync(join(tmp, "package.json"), '{"name":"keylang-pack-test","private":true}\n');
  const install = spawnSync("npm", ["install", "--omit=dev", "--offline", "--ignore-scripts", tarball], {
    cwd: tmp,
    encoding: "utf8",
  });
  assert.equal(install.status, 0, install.stderr);
  const installedBin = join(tmp, "node_modules/keylang/bin/keylang.js");
  const version = spawnSync(process.execPath, [installedBin, "--version"], { cwd: tmp, encoding: "utf8" });
  assert.equal(version.status, 0, version.stderr);
  assert.equal(version.stdout, `keylang ${published.version}\n`);
  const help = spawnSync(process.execPath, [installedBin, "--help"], { cwd: tmp, encoding: "utf8" });
  assert.equal(help.stdout, keylang(root, ["--help"]).stdout);

  const localParse = keylang(localRepo, ["parse", "--json", "keylang/rules.md"]);
  const packedParse = spawnSync(process.execPath, [installedBin, "parse", "--json", "keylang/rules.md"], {
    cwd: packedRepo,
    encoding: "utf8",
  });
  assert.equal(packedParse.status, 0, packedParse.stderr);
  assert.equal(packedParse.stdout, localParse.stdout);

  assert.equal(keylang(localRepo, ["map"]).status, 0);
  const packedMap = spawnSync(process.execPath, [installedBin, "map"], { cwd: packedRepo, encoding: "utf8" });
  assert.equal(packedMap.status, 0, packedMap.stderr);
  for (const name of readdirSync(join(localRepo, "keylang/map"))) {
    assert.equal(
      readFileSync(join(packedRepo, "keylang/map", name), "utf8"),
      readFileSync(join(localRepo, "keylang/map", name), "utf8"),
      name,
    );
  }
  const localIndex = JSON.parse(readFileSync(join(localRepo, ".keylang/index.json"), "utf8"));
  const packedIndex = JSON.parse(readFileSync(join(packedRepo, ".keylang/index.json"), "utf8"));
  assert.equal(packedIndex.snapshotId, localIndex.snapshotId);
  assert.equal(packedIndex.schema, localIndex.schema);
});

test("an incompatible index is rebuilt without a diagnostic", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, ".keylang"));
  writeFileSync(join(dir, ".keylang/index.json"), '{ "schema": 0, "version": 1 }\n');
  const o = keylang(dir, ["map"]);
  const out = `${o.stdout}${o.stderr}`;
  assert.equal(o.status, 0, out);
  assert.doesNotMatch(out, /incompatible|schema|corrupt/i);
  const index = JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8"));
  assert.equal(index.schema, 4);
  assert.match(index.snapshotId, /^[0-9a-f]{64}$/);
});

// RV04: a hand-written map file has no generator marker. `map` must refuse
// before writing or deleting anything, and `--check` must not call that "stale".
test("map leaves a fact cache that check reads but never writes; a foreign cache is rebuilt", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const cache = join(dir, ".keylang/cache/facts.json");
  assert.equal(keylang(dir, ["check"]).status, 0);
  assert.equal(existsSync(cache), false, "check writes no cache");
  assert.equal(keylang(dir, ["map", "--check"]).status, 1);
  assert.equal(existsSync(cache), false, "map --check writes no cache");
  assert.equal(keylang(dir, ["map"]).status, 0);
  const stored = JSON.parse(readFileSync(cache, "utf8"));
  assert.equal(stored.schema, 1);
  assert.deepEqual(Object.keys(stored.files).sort(), ["src/app/checkout.ts", "src/domain/order.ts", "src/infra/db.ts"]);
  const before = readFileSync(cache, "utf8");
  appendFileSync(join(dir, "src/domain/order.ts"), 'import { save } from "../infra/db.ts";\nexport function again(o: Order): void { save(o); }\n');
  const checked = keylang(dir, ["check"]);
  assert.equal(checked.status, 1);
  assert.match(checked.stdout, /K102/);
  assert.equal(readFileSync(cache, "utf8"), before);
  writeFileSync(cache, JSON.stringify({ schema: 1, version: "other", files: { "src/infra/db.ts": { sha256: "x", facts: {} } } }));
  assert.equal(keylang(dir, ["map"]).status, 0);
  assert.notEqual(JSON.parse(readFileSync(cache, "utf8")).version, "other");
  writeFileSync(cache, "{ broken");
  const rebuilt = keylang(dir, ["map"]);
  assert.equal(rebuilt.status, 0, rebuilt.stderr);
  assert.doesNotMatch(rebuilt.stderr, /cache/i);
});

test("map refuses to overwrite a manual map file", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const mapDir = join(dir, "keylang/map");
  mkdirSync(mapDir, { recursive: true });
  const manual = "manual rules stay\n";
  const domain = join(mapDir, "domain.md");
  writeFileSync(domain, manual);
  const gone = join(mapDir, "gone.md");
  writeFileSync(gone, "<!-- keylang:generated — не редагувати, `keylang map` -->\n\n# map\n\n- gone\n");
  const mtime = statSync(domain).mtimeMs;

  const o = keylang(dir, ["map"]);
  const out = `${o.stdout}${o.stderr}`;
  assert.equal(o.status, 1, out);
  assert.match(out, /keylang\/map\/domain\.md/);
  assert.match(out, /keylang:generated/);
  assert.doesNotMatch(out, /stale/);
  assert.doesNotMatch(o.stdout, /written/);
  assert.equal(readFileSync(domain, "utf8"), manual);
  assert.equal(statSync(domain).mtimeMs, mtime);
  assert.equal(existsSync(join(mapDir, "app.md")), false);
  assert.equal(existsSync(join(mapDir, "infra.md")), false);
  assert.equal(existsSync(join(dir, ".keylang/index.json")), false);
  assert.equal(readFileSync(gone, "utf8").includes("- gone"), true);

  const check = keylang(dir, ["map", "--check"]);
  const checkOut = `${check.stdout}${check.stderr}`;
  assert.equal(check.status, 1, checkOut);
  assert.match(checkOut, /keylang\/map\/domain\.md/);
  assert.match(checkOut, /manual file/);
  assert.doesNotMatch(checkOut, /stale/);
  assert.equal(readFileSync(domain, "utf8"), manual);
  assert.equal(existsSync(join(mapDir, "app.md")), false);
});

// A forbidden import in the domain: deny, layer order and a cycle are all
// reported as divergences; `map --check` notices the stale map first.
test("check reports rule divergences after a forbidden import", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true }));
  assert.equal(keylang(dir, ["map"]).status, 0);
  appendFileSync(
    join(dir, "src/domain/order.ts"),
    'import { save } from "../infra/db.ts";\nimport { checkout } from "../app/checkout.ts";\n\nexport function reorder(o: Order): Order {\n  save(o);\n  return checkout(o.id, [o.total]);\n}\n',
  );
  const stale = keylang(dir, ["map", "--check"]);
  assert.equal(stale.status, 1);
  assert.equal(stale.stdout, "keylang/map/domain.md: stale, run `keylang map`\n");
  assert.equal(keylang(dir, ["map"]).status, 0);
  const o = keylang(dir, ["check"]);
  assert.equal(o.status, 1);
  assert.match(o.stdout, /src\/domain\/order\.ts:\d+:\d+: K102 divergence: `domain\.order` depends on `infra\.db`/);
  assert.match(o.stdout, /src\/domain\/order\.ts:\d+:\d+: K101 divergence: `domain\.order` depends on `app\.checkout`/);
  assert.match(o.stdout, /K105 divergence: dependency cycle app\.checkout → domain\.order → app\.checkout/);
});

test("check sees a new denied import without writing the map", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.equal(keylang(dir, ["map"]).status, 0);
  const mapBefore = readFileSync(join(dir, "keylang/map/domain.md"), "utf8");
  const indexBefore = readFileSync(join(dir, ".keylang/index.json"), "utf8");
  appendFileSync(join(dir, "src/domain/order.ts"), 'import { save } from "../infra/db.ts";\nexport function again(o: Order): void { save(o); }\n');
  const checked = keylang(dir, ["check"]);
  assert.equal(checked.status, 1, checked.stdout);
  assert.match(checked.stdout, /K102/);
  assert.match(checked.stdout, /domain\.order/);
  assert.match(checked.stdout, /infra\.db/);
  assert.equal(readFileSync(join(dir, "keylang/map/domain.md"), "utf8"), mapBefore);
  assert.equal(readFileSync(join(dir, ".keylang/index.json"), "utf8"), indexBefore);
});

test("a literal import() inside a function is a denied dependency", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  appendFileSync(
    join(dir, "src/domain/order.ts"),
    "export async function load(): Promise<void> {\n  const { save } = await import(\"../infra/db.ts\");\n  save({});\n}\n",
  );
  const checked = keylang(dir, ["check"]);
  assert.equal(checked.status, 1, checked.stdout);
  assert.match(checked.stdout, /src\/domain\/order\.ts:\d+:\d+: K102/);
});

test("a computed import specifier is coverage, not an edge", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  appendFileSync(join(dir, "src/domain/order.ts"), "export async function load(name: string): Promise<unknown> {\n  return import(`./${name}.ts`);\n}\n");
  assert.equal(keylang(dir, ["map"]).status, 0);
  const index = JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8"));
  const hole = (index.coverage as { reason: string; file: string; line: number }[]).find((item) => item.reason === "computed specifier");
  assert.ok(hole, JSON.stringify(index.coverage));
  assert.equal(hole.file, "src/domain/order.ts");
  assert.equal(hole.line > 0, true);
  const edges = index.edges as { reason?: string; target: string | null }[];
  assert.equal(edges.some((edge) => edge.reason === "computed specifier"), false);
});

test("unresolved import makes deny unverified unless --strict", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.equal(keylang(dir, ["map"]).status, 0);
  appendFileSync(join(dir, "src/domain/order.ts"), 'import { missing } from "./missing.ts";\n');
  const loose = keylang(dir, ["check"]);
  assert.equal(loose.status, 0, loose.stdout + loose.stderr);
  assert.match(loose.stdout, /unverified/);
  assert.match(loose.stdout, /missing\.ts/);
  assert.match(loose.stderr, /unverified/);
  const strict = keylang(dir, ["check", "--strict"]);
  assert.equal(strict.status, 1, strict.stderr);
  assert.match(strict.stdout, /unverified/);
});

test("removing the last function of a complete module is K001", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "keylang/flows"), { recursive: true });
  writeFileSync(join(dir, "keylang/flows/use.md"), "# flow use\n\n- step domain.order.createOrder\n");
  assert.equal(keylang(dir, ["map"]).status, 0);
  writeFileSync(join(dir, "src/domain/order.ts"), "export const marker = 1;\n");
  assert.equal(keylang(dir, ["map"]).status, 0);
  const checked = keylang(dir, ["check"]);
  assert.equal(checked.status, 1, checked.stdout);
  assert.match(checked.stdout, /K001/);
  assert.match(checked.stdout, /domain\.order\.createOrder/);
});

test("a shadowed parameter is not a confirmed call edge", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  appendFileSync(join(dir, "src/domain/order.ts"), "export function target(): number { return 1; }\nexport function run(target: () => void): void { target(); }\n");
  assert.equal(keylang(dir, ["map"]).status, 0);
  const index = JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8"));
  const edges = index.edges as { source: string; target: string | null; resolution: string; reason?: string }[];
  assert.equal(edges.some((edge) => edge.source.endsWith(".run") && edge.target?.endsWith(".target") && edge.resolution === "resolved"), false);
  const hole = (index.coverage as { source: string | null; reason: string }[]).find((item) => item.reason.includes("shadowed by parameter"));
  assert.ok(hole);
});

test("a local binding in any enclosing scope hides the module function", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const cases = [
    "export function a1({ save }: { save: () => void }): void { save(); }",
    "export function a2(o: { save: () => void }): void { const { save } = o; save(); }",
    "export function a3(): void { function save(): void {} save(); }",
    "export function a4(flag: boolean): void { if (flag) { const save = pick(); save(); } }",
    "export function a5(xs: (() => void)[]): void { xs.forEach((save) => save()); }",
    "export function a6(fs: (() => void)[]): void { for (const save of fs) save(); }",
    "export function a7(): () => void { return (save: () => void) => save(); }",
    "export function a8(): void { const save = pick(); save(); }",
    "export function a9(): void { try { pick(); } catch (save) { (save as () => void)(); } }",
  ];
  writeFileSync(join(dir, "src/domain/order.ts"), `export function save(): void {}\nexport function pick(): () => void { return save; }\n${cases.join("\n")}\nexport function direct(): void { save(); }\n`);
  assert.equal(keylang(dir, ["map"]).status, 0);
  const index = JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8"));
  const edges = index.edges as { source: string; target: string | null; resolution: string; reason?: string }[];
  for (let i = 1; i <= 9; i++) {
    const hit = edges.find((edge) => edge.source === `domain.order.a${i}` && edge.target === "domain.order.save" && edge.resolution === "resolved");
    assert.equal(hit, undefined, `a${i} must not call domain.order.save`);
  }
  assert.ok(edges.some((edge) => edge.source === "domain.order.direct" && edge.target === "domain.order.save" && edge.resolution === "resolved"));
  const reasons = (index.coverage as { source: string | null; reason: string }[]).filter((item) => item.source?.startsWith("domain.order.a")).map((item) => `${item.source} ${item.reason}`);
  assert.ok(reasons.includes("domain.order.a1 shadowed by parameter `save`"), reasons.join("\n"));
  assert.ok(reasons.includes("domain.order.a8 shadowed by local `save`"), reasons.join("\n"));
  // A method call on a parameter is a call through a local value, not shadowing.
  assert.ok(reasons.includes("domain.order.a5 call through a local value `xs.forEach`"), reasons.join("\n"));
});

test("exports lists extra public names and a missing one", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.equal(keylang(dir, ["map"]).status, 0);
  appendFileSync(
    join(dir, "src/domain/order.ts"),
    "function extra() { return 1; }\nexport { extra };\nexport const secretFlag = true;\nexport class ExtraClass {}\nexport type ExtraType = string;\n",
  );
  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- layers domain < app\n  - infra\n- module domain.order\n  - exports total, notAName\n");
  const checked = keylang(dir, ["check"]);
  assert.equal(checked.status, 1, checked.stdout);
  for (const name of ["extra", "secretFlag", "ExtraClass", "ExtraType", "createOrder"]) {
    assert.match(checked.stdout, new RegExp(`exports \`${name}\``));
  }
  assert.match(checked.stdout, /does not export `notAName`/);
});

test("exports compares aliases, default, and export * names, not map ids", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "src/domain/parts.ts"), "export function fromX(): number { return 1; }\nexport const valX = 1;\nexport default 3;\n");
  writeFileSync(
    join(dir, "src/domain/order.ts"),
    'export * from "./parts.ts";\nconst a = 1;\nexport { a as b };\nfunction extra(): number { return a; }\nexport { extra };\nexport default function main(): void {}\n',
  );
  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- module domain.order\n  - exports fromX, valX, b, extra, default\n");
  const checked = keylang(dir, ["check"]);
  assert.equal(checked.status, 0, checked.stdout + checked.stderr);
  assert.doesNotMatch(checked.stdout, /K001|K104/);
  assert.match(checked.stderr, /0 fail, 0 unverified, 1 ok/);
  assert.equal(keylang(dir, ["map"]).status, 0);
  const map = readFileSync(join(dir, "keylang/map/domain.md"), "utf8");
  assert.match(map, /- fn \[extra\]\([^)]*\)(?! <!-- internal -->)/);
  assert.doesNotMatch(map, /extra\]\([^)]*\).*internal/);
});

test("export * from an opaque module leaves exports unverified", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  appendFileSync(join(dir, "src/domain/order.ts"), 'export * from "node:path";\n');
  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- module domain.order\n  - exports Order, total, createOrder, join\n");
  const checked = keylang(dir, ["check"]);
  assert.equal(checked.status, 0, checked.stdout);
  assert.match(checked.stdout, /keylang\/rules\.md:4:3: unverified re-export from external `node:path`/);
  assert.doesNotMatch(checked.stdout, /K104|K001/);
});

test("one failing deny does not hide the verdicts of other denies", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  appendFileSync(join(dir, "src/domain/order.ts"), 'import { save } from "../infra/db.ts";\nimport { gone } from "./missing.ts";\nexport function keep(o: Order): void { save(o); gone(); }\n');
  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- deny domain infra\n- deny domain app\n- deny app domain\n");
  const checked = keylang(dir, ["check"]);
  assert.equal(checked.status, 1, checked.stdout);
  assert.match(checked.stdout, /K102 divergence: `domain\.order` depends on `infra\.db`/);
  assert.match(checked.stdout, /keylang\/rules\.md:4:1: unverified unresolved import `\.\/missing\.ts` \(src\/domain\/order\.ts:\d+:\d+\)/);
  assert.match(checked.stdout, /keylang\/rules\.md:5:1: K102|src\/app\/checkout\.ts:\d+:\d+: K102 divergence: `app\.checkout` depends on `domain\.order`/);
});

test("calls through local values do not make deny unverified", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  appendFileSync(join(dir, "src/domain/order.ts"), "export function each(xs: number[], f: (n: number) => void): void { xs.forEach(f); f(1); }\n");
  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- deny domain infra\n");
  const checked = keylang(dir, ["check", "--strict"]);
  assert.equal(checked.status, 0, checked.stdout);
  assert.match(checked.stderr, /0 fail, 0 unverified, 1 ok/);
});

test("check finds the snapshot for any spelling of the spec path", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  appendFileSync(join(dir, "src/domain/order.ts"), 'import { save } from "../infra/db.ts";\nexport function again(o: Order): void { save(o); }\n');
  for (const [cwd, args] of [
    [dir, ["check", "keylang"]],
    [dir, ["check", "./keylang"]],
    [dir, ["check", join(dir, "keylang")]],
    [join(dir, "keylang"), ["check", "."]],
    [join(dir, "src"), ["check"]],
  ] as const) {
    const checked = keylang(cwd, [...args]);
    assert.equal(checked.status, 1, `${cwd} ${args.join(" ")}\n${checked.stdout}`);
    assert.match(checked.stdout, /K102/);
  }
});

test("check sees a layer moved in keylang.json without map", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.equal(keylang(dir, ["map"]).status, 0);
  const before = readFileSync(join(dir, "keylang/map/app.md"), "utf8");
  const config = JSON.parse(readFileSync(join(dir, "keylang.json"), "utf8"));
  config.layers = { domain: ["src/domain/**", "src/app/**"], infra: "src/infra/**" };
  writeFileSync(join(dir, "keylang.json"), JSON.stringify(config));
  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- deny domain infra\n");
  const checked = keylang(dir, ["check"]);
  assert.equal(checked.status, 1, checked.stdout);
  assert.match(checked.stdout, /src\/app\/checkout\.ts:\d+:\d+: K102 divergence: `domain\.checkout` depends on `infra\.db`/);
  assert.equal(readFileSync(join(dir, "keylang/map/app.md"), "utf8"), before);
});

test("a flow id resolves against current code, not the committed map", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "keylang/flows"), { recursive: true });
  writeFileSync(join(dir, "keylang/flows/use.md"), "# flow use\n\n- step domain.order.createOrder\n");
  assert.equal(keylang(dir, ["map"]).status, 0);
  writeFileSync(join(dir, "src/domain/order.ts"), "export function createOrders(): void {}\n");
  const checked = keylang(dir, ["check"]);
  assert.equal(checked.status, 1, checked.stdout);
  assert.match(checked.stdout, /keylang\/flows\/use\.md:3:8: K001 dangling reference `domain\.order\.createOrder` \(did you mean `domain\.order\.createOrders`\?\); declare `planned` if this is an intention/);
});

test("a member of an explicitly excluded file is unverified, not K001", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "keylang/flows"), { recursive: true });
  writeFileSync(join(dir, "keylang/flows/use.md"), "# flow use\n\n- step domain.order.createOrder\n");
  const config = JSON.parse(readFileSync(join(dir, "keylang.json"), "utf8"));
  config.exclude = ["src/domain/order.ts"];
  writeFileSync(join(dir, "keylang.json"), JSON.stringify(config));
  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- deny domain infra\n");
  const checked = keylang(dir, ["check"]);
  assert.equal(checked.status, 0, checked.stdout);
  assert.doesNotMatch(checked.stdout, /K001/);
  assert.match(checked.stdout, /keylang\/flows\/use\.md:3:1: ID unverified domain\.order\.createOrder: opaque module/);
  // One ID verdict for the reference, not a second resolver line for the same position.
  assert.doesNotMatch(checked.stdout, /: unverified opaque module `domain\.order`/);
  assert.match(checked.stdout, /static unverified domain\.order\.createOrder: not in the snapshot \(opaque module\)/);
  assert.match(checked.stdout, /keylang\/rules\.md:3:1: unverified excluded by keylang\.json/);
  assert.equal(keylang(dir, ["map"]).status, 0);
  assert.match(readFileSync(join(dir, "keylang/map/domain.md"), "utf8"), /module \[order\]\([^)]*\) <!-- excluded -->/);
});

test("no-cycles reports the component that contains d", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "keylang-cycle-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "keylang.json"), `${JSON.stringify({ languages: ["typescript"], layers: { main: ["src/**"] } }, null, 2)}\n`);
  writeFileSync(join(dir, "src/a.ts"), 'import "./b.ts";\nimport "./d.ts";\nexport const a = 1;\n');
  writeFileSync(join(dir, "src/b.ts"), 'import "./c.ts";\nexport const b = 1;\n');
  writeFileSync(join(dir, "src/c.ts"), 'import "./a.ts";\nexport const c = 1;\n');
  writeFileSync(join(dir, "src/d.ts"), 'import "./c.ts";\nexport const d = 1;\n');
  mkdirSync(join(dir, "keylang"), { recursive: true });
  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- module main.d\n  - no-cycles\n");
  const checked = keylang(dir, ["check"]);
  assert.equal(checked.status, 1, checked.stdout);
  assert.match(checked.stdout, /K105/);
  assert.match(checked.stdout, /main\.d/);
});

test("entry does not treat a sibling as reachable", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "keylang-entry-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "src/pkg"), { recursive: true });
  writeFileSync(join(dir, "keylang.json"), `${JSON.stringify({ languages: ["typescript"], layers: { main: ["src/**"] } }, null, 2)}\n`);
  writeFileSync(join(dir, "src/pkg/live.ts"), "export const live = 1;\n");
  writeFileSync(join(dir, "src/pkg/dead.ts"), "export const dead = 1;\n");
  mkdirSync(join(dir, "keylang"), { recursive: true });
  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- entry\n  - main.pkg.live\n");
  const checked = keylang(dir, ["check"]);
  assert.match(checked.stdout, /K103/);
  assert.match(checked.stdout, /main\.pkg\.dead/);
  assert.doesNotMatch(checked.stdout, /main\.pkg\.live[\s\S]*K103[\s\S]*main\.pkg\.live/);
});

/** A temp repository with one layer `main` over `src/**`, the given files, and rules. */
function mainRepo(t: { after: (f: () => void) => void }, files: Record<string, string>, rules: string): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-main-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "keylang.json"), `${JSON.stringify({ languages: ["typescript"], layers: { main: ["src/**"] } }, null, 2)}\n`);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  mkdirSync(join(dir, "keylang"), { recursive: true });
  writeFileSync(join(dir, "keylang/rules.md"), `# rules\n\n${rules}`);
  return dir;
}

test("no-cycles: a self-import is a cycle, two cycles are two findings, an acyclic graph is quiet", (t) => {
  const self = mainRepo(t, { "src/a.ts": 'import "./a.ts";\nexport const a = 1;\n' }, "- no-cycles\n");
  const selfChecked = keylang(self, ["check"]);
  assert.equal(selfChecked.status, 1, selfChecked.stdout);
  assert.match(selfChecked.stdout, /K105 divergence: dependency cycle main\.a → main\.a/);
  const two = mainRepo(
    t,
    { "src/a.ts": 'import "./b.ts";\n', "src/b.ts": 'import "./a.ts";\n', "src/c.ts": 'import "./d.ts";\n', "src/d.ts": 'import "./c.ts";\n' },
    "- no-cycles\n",
  );
  const twoChecked = keylang(two, ["check"]);
  assert.equal(twoChecked.stdout.match(/K105/g)?.length, 2, twoChecked.stdout);
  const none = mainRepo(t, { "src/a.ts": 'import "./b.ts";\n', "src/b.ts": "export const b = 1;\n" }, "- no-cycles\n");
  const quiet = keylang(none, ["check"]);
  assert.equal(quiet.status, 0, quiet.stdout);
  assert.doesNotMatch(quiet.stdout, /K105/);
});

test("no-cycles under a directory module routes through that module", (t) => {
  const dir = mainRepo(
    t,
    { "src/a.ts": 'import "./pkg/y.ts";\nimport "./b.ts";\n', "src/b.ts": 'import "./a.ts";\n', "src/pkg/y.ts": 'import "../a.ts";\n' },
    "- module main.pkg\n  - no-cycles\n",
  );
  const checked = keylang(dir, ["check"]);
  assert.equal(checked.status, 1, checked.stdout);
  assert.match(checked.stdout, /K105 divergence: dependency cycle main\.pkg\.y → main\.a → main\.pkg\.y/);
});

test("entry follows re-exports, skips directory modules, and names the hole", (t) => {
  const dir = mainRepo(
    t,
    {
      "src/main.ts": 'import { a } from "./lib/index.ts";\nexport const run = a;\n',
      "src/lib/index.ts": 'export * from "./a.ts";\nexport { b } from "./b.ts";\n',
      "src/lib/a.ts": "export const a = 1;\n",
      "src/lib/b.ts": "export const b = 1;\n",
      "src/lib/c.ts": "export const c = 1;\n",
    },
    "- entry\n  - main.main\n",
  );
  const checked = keylang(dir, ["check"]);
  assert.match(checked.stdout, /K103 absence: module `main\.lib\.c` is not reachable/);
  assert.doesNotMatch(checked.stdout, /`main\.lib\.(a|b|index)`|`main\.lib` is not/);
  appendFileSync(join(dir, "src/main.ts"), 'import "./missing.ts";\n');
  const holed = keylang(dir, ["check"]);
  assert.doesNotMatch(holed.stdout, /K103/);
  assert.match(holed.stdout, /unverified not reached, but unresolved import `\.\/missing\.ts` \(src\/main\.ts:3:1\) may reach it/);
});

test("explain-edge prints the import and writes nothing", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const before = readdirSync(dir);
  const explained = keylang(dir, ["check", "--explain-edge", "app.checkout", "domain.order"]);
  assert.equal(explained.status, 0, explained.stderr);
  assert.match(explained.stdout, /import resolved syntactic/);
  assert.match(explained.stdout, /src\/app\/checkout\.ts:\d+:\d+/);
  assert.deepEqual(readdirSync(dir), before);
  const unknown = keylang(dir, ["check", "--explain-edge", "no.such", "domain.order"]);
  assert.equal(unknown.status, 2, unknown.stderr);
  const tail = keylang(dir, ["check", "--explain-edge", "app.checkout.nonexistent", "domain.order"]);
  assert.equal(tail.status, 2, tail.stdout);
  assert.match(tail.stderr, /unknown id `app\.checkout\.nonexistent`/);
});

test("explain-edge lists import and call edges in a stable order, and holes when there is no edge", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const both = keylang(dir, ["check", "--explain-edge", "app", "domain"]);
  assert.equal(both.status, 0, both.stderr);
  const lines = both.stdout.trimEnd().split("\n");
  assert.ok(lines.some((line) => /^call resolved syntactic src\/app\/checkout\.ts:\d+:\d+-\d+:\d+ .* app\.checkout\.\w+ → domain\.order\.\w+$/.test(line)), both.stdout);
  assert.ok(lines.some((line) => /^import resolved syntactic src\/app\/checkout\.ts:1:1-/.test(line)), both.stdout);
  assert.deepEqual(lines, [...lines].sort((a, b) => (a.split(" ")[0]! < b.split(" ")[0]! ? -1 : a.split(" ")[0]! > b.split(" ")[0]! ? 1 : 0)));
  assert.equal(keylang(dir, ["check", "--explain-edge", "app", "domain"]).stdout, both.stdout);
  const small = mainRepo(t, { "src/a.ts": "export function a(): void {}\n", "src/b.ts": "export function b(): void {}\n" }, "");
  const clean = keylang(small, ["check", "--explain-edge", "main.a", "main.b"]);
  assert.equal(clean.stdout, "no edge, coverage complete\n");
  appendFileSync(join(small, "src/a.ts"), "export function later(cb: () => void): void { cb(); }\n");
  const holed = keylang(small, ["check", "--explain-edge", "main.a", "main.b"]);
  assert.equal(holed.stdout, "no confirmed edge; 1 unresolved construct(s) in `main.a` could form one\nunresolved src/a.ts:2:47 call through a local value `cb`\n");
});

test("explain covers every diagnostic code", () => {
  // The codes as `src/diag.ts` declares them, so a new code without an explanation fails here.
  const codes = [...readFileSync(join(root, "src/diag.ts"), "utf8").matchAll(/\| "(K\d{3})"/g)].map((m) => m[1]!);
  assert.ok(codes.length >= 13, codes.join(" "));
  const table = readFileSync(join(root, "docs/format.md"), "utf8");
  for (const code of codes) {
    assert.match(table, new RegExp(`\\| ${code} \\| (error|warning) \\|`), `format.md §7 lists ${code}`);
    const explained = keylang(root, ["explain", code]);
    assert.equal(explained.status, 0, explained.stderr);
    assert.match(explained.stdout, /example:/);
    assert.match(explained.stdout, /fix:/);
  }
  assert.match(keylang(root, ["explain", "K001"]).stdout, /planned/);
  assert.match(keylang(root, ["explain", "k102"]).stdout, /^K102: /);
  assert.equal(keylang(root, ["explain", "NOPE"]).status, 2);
  assert.equal(keylang(root, ["explain", "toString"]).status, 2);
});

// The one real flow of keylang: `keylang check` on a repository. The trace
// adapter instruments the trigger and steps of `keylang/flows/check.md`; the
// trace lands in `.keylang/trace/` (git-ignored, like `.keylang/index.json`).
test("@flow check: check reports a denied import without writing the map", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  appendFileSync(join(dir, "src/domain/order.ts"), 'import { save } from "../infra/db.ts";\nexport function again(o: Order): void { save(o); }\n');
  const trace = join(root, ".keylang/trace/check.jsonl");
  rmSync(trace, { force: true });
  const r = spawnSync(process.execPath, ["--import", join(root, "src/adapters/trace.ts"), bin, "check"], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, KEYLANG_TRACE: trace, KEYLANG_TRACE_FLOW: "check", KEYLANG_TRACE_TEST: "tests/cli.test.ts > @flow check", KEYLANG_TRACE_ROOT: root },
  });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /K102 divergence: `domain\.order` depends on `infra\.db`/);
  assert.equal(existsSync(join(dir, ".keylang/index.json")), false);
  const events = readFileSync(trace, "utf8").trim().split("\n").map((line) => JSON.parse(line) as { event: string; symbolId?: string; complete?: boolean });
  assert.equal(events.at(-1)?.event, "run");
  assert.equal(events.at(-1)?.complete, true);
  for (const id of ["cli.cli.main", "cli.cli.cmdCheck", "map.analyze.analyze", "check.rules.evaluateRules", "cli.cli.writeCheck"]) {
    assert.ok(events.some((event) => event.event === "start" && event.symbolId === id), id);
  }
});

test("the in-repo check flow reports ID, static, tests, and trace separately", () => {
  const checked = keylang(root, ["check", "--format", "json"]);
  const rows = (JSON.parse(checked.stdout) as { results: { criterion: string; area: string; verdict: string; evidence: string }[] }).results;
  const steps = ["cli.cli.run", "cli.cli.cmdCheck", "map.analyze.analyze", "map.map.generateMap", "lang.parser.parse", "check.assess.assess", "check.resolve.check", "check.rules.evaluateRules", "check.flows.evaluateFlows", "cli.cli.writeCheck"];
  for (const id of steps) {
    for (const criterion of ["ID", "static", "trace"]) assert.ok(rows.some((row) => row.criterion === criterion && row.area === id), `${criterion} ${id}`);
    assert.equal(rows.find((row) => row.criterion === "ID" && row.area === id)?.verdict, "ok", id);
    assert.equal(rows.find((row) => row.criterion === "static" && row.area === id)?.verdict, "ok", id);
  }
  // The trace of the @flow test above belongs to this snapshot.
  for (const id of steps) assert.equal(rows.find((row) => row.criterion === "trace" && row.area === id)?.verdict, "ok", id);
  assert.ok(rows.some((row) => row.criterion === "tests" && row.area.startsWith("invariant a denied import")));
  const again = keylang(root, ["check", "--format", "json"]);
  assert.equal(again.stdout, checked.stdout);
});
test("a missing member of an opaque module is unverified", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.equal(keylang(dir, ["map"]).status, 0);
  mkdirSync(join(dir, "keylang/flows"), { recursive: true });
  writeFileSync(join(dir, "keylang/flows/ext.md"), "# flow ext\n\n- step external.node.readFile\n");
  const checked = keylang(dir, ["check"]);
  assert.match(checked.stdout, /ID unverified external\.node\.readFile: opaque module/);
  assert.doesNotMatch(checked.stdout, /K001 dangling reference `external\.node\.readFile`/);
});

test("check formats share the exit code", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  appendFileSync(join(dir, "src/domain/order.ts"), 'import { save } from "../infra/db.ts";\n');
  const human = keylang(dir, ["check", "--format", "human"]);
  const json = keylang(dir, ["check", "--format", "json"]);
  const sarif = keylang(dir, ["check", "--format", "sarif"]);
  const github = keylang(dir, ["check", "--format", "github"]);
  assert.equal(human.status, 1);
  assert.equal(json.status, human.status);
  assert.equal(sarif.status, human.status);
  assert.equal(github.status, human.status);
  const body = JSON.parse(json.stdout);
  assert.ok(Array.isArray(body.results));
  assert.ok(body.results.some((row: { verdict: string; code: string }) => row.verdict === "fail" && row.code === "K102"));
  assertSarif(JSON.parse(sarif.stdout));
  assert.match(github.stdout, /::error /);
  const bad = keylang(dir, ["check", "--format", "xml"]);
  assert.equal(bad.status, 2);
});

/** The structure SARIF 2.1.0 requires of what keylang writes (checked offline). */
function assertSarif(report: any): void {
  assert.equal(report.version, "2.1.0");
  assert.match(report.$schema, /sarif-schema-2\.1\.0\.json$/);
  assert.ok(Array.isArray(report.runs) && report.runs.length === 1);
  const run = report.runs[0];
  assert.equal(typeof run.tool.driver.name, "string");
  const ids = (run.tool.driver.rules as { id: string; shortDescription: { text: string } }[]).map((rule) => rule.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const result of run.results) {
    assert.ok(["error", "warning", "note", "none"].includes(result.level), result.level);
    assert.equal(typeof result.message.text, "string");
    assert.equal(ids[result.ruleIndex], result.ruleId);
    for (const location of result.locations) {
      const physical = location.physicalLocation;
      assert.equal(typeof physical.artifactLocation.uri, "string");
      assert.ok(Number.isInteger(physical.region.startLine) && physical.region.startLine >= 1);
      assert.ok(Number.isInteger(physical.region.startColumn) && physical.region.startColumn >= 1);
    }
  }
}

test("formats carry fail, warning, unverified, and coverage; --strict exits alike", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  // Not reachable from the entry, and the only unresolved import is its own.
  writeFileSync(join(dir, "src/domain/lonely.ts"), 'import { gone } from "./missing.ts";\nexport const lonely = gone;\n');
  const results = (args: string[]): { status: number | null; stdout: string } => keylang(dir, ["check", ...args]);
  const json = results(["--format", "json"]);
  assert.equal(json.status, 0, json.stdout);
  const body = JSON.parse(json.stdout) as { snapshotId: string; results: { criterion: string; area: string; verdict: string; evidence: string; snapshotId: string; code: string | null }[]; coverage: { reason: string }[] };
  const k103 = body.results.find((row) => row.code === "K103");
  assert.ok(k103, json.stdout);
  assert.equal(k103.verdict, "warning");
  assert.equal(k103.criterion, "entry");
  assert.equal(k103.area, "domain.lonely");
  const unverified = body.results.find((row) => row.verdict === "unverified");
  assert.ok(unverified && unverified.criterion === "deny domain infra" && unverified.snapshotId === body.snapshotId, json.stdout);
  assert.ok(body.coverage.some((item) => item.reason === "unresolved import `./missing.ts`"));
  for (const format of ["human", "json", "sarif", "github"]) {
    assert.equal(results(["--format", format]).status, 0, format);
    assert.equal(results(["--format", format, "--strict"]).status, 1, format);
  }
  const sarif = JSON.parse(results(["--format", "sarif"]).stdout);
  assertSarif(sarif);
  const levels = (sarif.runs[0].results as { level: string; ruleId: string }[]).map((result) => `${result.ruleId}:${result.level}`);
  assert.ok(levels.includes("K103:warning"), levels.join(" "));
  assert.ok(levels.includes("unverified:note"), levels.join(" "));
  const github = results(["--format", "github"]).stdout;
  assert.match(github, /^::warning file=src\/domain\/lonely\.ts,line=1,col=1,title=K103::absence: module `domain\.lonely`/m);
  assert.match(github, /^::notice file=keylang\/rules\.md,line=5,col=1,title=unverified::unresolved import `\.\/missing\.ts` \(src\/domain\/lonely\.ts:1:1\)$/m);
  const bad = keylang(dir, ["check", "--format", "xml"]);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /unknown --format `xml`; expected human, json, sarif, github/);
});

test("keylang.json errors name the file and the field, exit 2", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const config = JSON.parse(readFileSync(join(dir, "keylang.json"), "utf8"));
  const cases: [unknown, RegExp][] = [
    [{ ...config, check: { tests: "reports/none.json" } }, /keylang\.json: check\.tests: no such file `reports\/none\.json`/],
    [{ ...config, check: { tests: 5 } }, /keylang\.json: `check\.tests` must be a path, got 5/],
    [{ ...config, check: { junit: "x" } }, /keylang\.json: unknown field `check\.junit`/],
    [{ ...config, languages: ["cobol"] }, /keylang\.json: `languages\[0\]` must be "typescript" or "javascript", got "cobol"/],
    [{ ...config, layers: { domain: 1 } }, /keylang\.json: `layers\.domain` must be a glob or an array of globs, got 1/],
  ];
  for (const [body, message] of cases) {
    writeFileSync(join(dir, "keylang.json"), JSON.stringify(body));
    const checked = keylang(dir, ["check"]);
    assert.equal(checked.status, 2, checked.stdout + checked.stderr);
    assert.match(checked.stderr, message);
  }
  writeFileSync(join(dir, "keylang.json"), "{ nope");
  const broken = keylang(dir, ["map"]);
  assert.equal(broken.status, 2);
  assert.match(broken.stderr, /keylang\.json: invalid JSON/);
});

