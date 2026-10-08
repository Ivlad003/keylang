// `keylang map` and the snapshot: the generated map and index, links and
// route segments, snapshot ids and what the index records (unresolved
// imports, holes, type edges, class members, receivers of method calls), the
// fact cache, a manual map file, and module ID collisions.

import assert from "node:assert/strict";
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { analyze } from "../src/analyze.ts";
import { runOperation } from "../src/operations.ts";
import { keylang, mainRepo, repoCopy, root, tempDir, writeTree } from "./cli-helpers.ts";

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
  assert.equal(index.schema, 8);
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
  const page = findNode(JSON.parse(parsed.stdout)[0], "main.app.$g-shop.page");
  assert.equal(page.link.path, "../../src/app/(shop)/page.ts");
  assert.equal(page.link.target, "../../src/app/(shop)/page.ts#L1");
  const spaced = findNode(JSON.parse(parsed.stdout)[0], "main.my_file");
  assert.equal(spaced.link.path, "../../src/my file.ts");

  const checked = keylang(dir, ["check"]);
  assert.doesNotMatch(checked.stdout, /K005/);
  assert.doesNotMatch(checked.stdout, /K002/);
  assert.equal(checked.status, 0, checked.stdout);
});

test("Next route segments (shop) and [id] are different modules and resolve by the encoded id", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "keylang-routes-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "app/(shop)/cart"), { recursive: true });
  mkdirSync(join(dir, "app/[id]"), { recursive: true });
  mkdirSync(join(dir, "keylang/flows"), { recursive: true });
  writeFileSync(join(dir, "keylang.json"), `${JSON.stringify({ languages: ["typescript"], layers: { main: ["app/**"] } }, null, 2)}\n`);
  writeFileSync(join(dir, "app/(shop)/cart/layout.tsx"), "export function ShopLayout(): number {\n  return 1;\n}\n");
  writeFileSync(join(dir, "app/(shop)/cart/page.tsx"), "export function CartPage(): number {\n  return 2;\n}\n");
  writeFileSync(join(dir, "app/[id]/page.tsx"), "export function ItemPage(): number {\n  return 3;\n}\n");
  const shop = "main.$g-shop.cart.page.CartPage";
  const item = "main.$p-id.page.ItemPage";
  writeFileSync(join(dir, "keylang/flows/routes.md"), `# flow routes\n\n- step ${shop}\n- step ${item}\n`);

  const mapped = keylang(dir, ["map"]);
  assert.equal(mapped.status, 0, mapped.stderr);
  const map = readFileSync(join(dir, "keylang/map/main.md"), "utf8");
  assert.match(map, /\$g-shop/);
  assert.match(map, /\$p-id/);
  assert.match(map, /app\/%28shop%29\/cart\/page\.tsx#L1/);
  assert.match(map, /app\/%5Bid%5D\/page\.tsx#L1/);
  assert.doesNotMatch(map, /_shop_|_id_/);
  const index = JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as {
    nodes: Record<string, { kind: string; file?: string }>;
    edges: { source: string; target: string | null }[];
  };
  assert.equal(index.nodes["main.$g-shop.cart.page"]?.file, "app/(shop)/cart/page.tsx");
  assert.equal(index.nodes["main.$p-id.page"]?.file, "app/[id]/page.tsx");
  assert.equal(index.nodes["main._shop_.cart.page"], undefined);
  assert.equal(index.nodes["main._id_.page"], undefined);
  // A layout file and a page file are not an edge just because of the directories.
  assert.equal(
    index.edges.some((e) => (e.source.includes("ShopLayout") && (e.target ?? "").includes("CartPage")) || (e.source.includes("CartPage") && (e.target ?? "").includes("ShopLayout"))),
    false,
  );

  const resolved = keylang(dir, ["check"]);
  assert.equal(resolved.status, 0, resolved.stdout);
  assert.doesNotMatch(resolved.stdout, /K001/);

  writeFileSync(join(dir, "keylang/flows/old.md"), "# flow old\n\n- step main._shop_.cart.page.CartPage\n");
  const stale = keylang(dir, ["check"]);
  assert.equal(stale.status, 1);
  assert.match(stale.stdout, /K001 dangling reference `main\._shop_\.cart\.page\.CartPage`/);
  assert.doesNotMatch(stale.stdout, /K001 dangling reference `main\.\$g-shop/);
  assert.doesNotMatch(stale.stdout, /K001 dangling reference `main\.\$p-id/);
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

test("a bare import is external when a package.json between the file and the root declares it, as Node looks for it", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "src/app/web"), { recursive: true });
  writeFileSync(join(dir, "src/app/web/package.json"), JSON.stringify({ dependencies: { "left-pad": "1" } }));
  writeFileSync(join(dir, "src/app/web/ui.ts"), 'import pad from "left-pad";\n\nexport function ui(): string {\n  return pad("a", 2);\n}\n');
  appendFileSync(join(dir, "src/app/checkout.ts"), 'import pad from "left-pad";\n');
  assert.equal(keylang(dir, ["map"]).status, 0);
  const unresolved = (): string[] =>
    (JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")).coverage as { kind: string; file: string; text: string }[])
      .filter((c) => c.kind === "unresolved-import" && c.text.includes("left-pad"))
      .map((c) => c.file);
  // checkout.ts is outside web/: web's package.json does not reach it.
  assert.deepEqual(unresolved(), ["src/app/checkout.ts"]);
  writeFileSync(join(dir, "src/app/web/package.json"), "{}");
  assert.equal(keylang(dir, ["map", "--check"]).status, 1, "the nested package.json is an input of the snapshot");
  assert.equal(keylang(dir, ["map"]).status, 0);
  assert.deepEqual(unresolved(), ["src/app/checkout.ts", "src/app/web/ui.ts"]);
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
  assert.equal(index.schema, 8);
  assert.match(index.snapshotId, /^[0-9a-f]{64}$/);
});

test("map and check leave a fact cache the next run reads; map --check writes none; a foreign cache is rebuilt", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const cache = join(dir, ".keylang/cache/facts.json");
  assert.equal(keylang(dir, ["check"]).status, 0);
  assert.equal(existsSync(cache), true, "check leaves the cache for the next run");
  rmSync(cache);
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
  assert.notEqual(readFileSync(cache, "utf8"), before, "the changed file's facts replace its entry");
  assert.match(readFileSync(cache, "utf8"), /"again"/);
  writeFileSync(cache, JSON.stringify({ schema: 1, version: "other", files: { "src/infra/db.ts": { sha256: "x", facts: {} } } }));
  assert.equal(keylang(dir, ["map"]).status, 0);
  assert.notEqual(JSON.parse(readFileSync(cache, "utf8")).version, "other");
  // An entry of the wrong shape is extracted again, not trusted.
  const good = JSON.parse(readFileSync(cache, "utf8"));
  good.files["src/infra/db.ts"].facts.exports = [1];
  good.files["src/domain/order.ts"].facts = { path: "src/domain/order.ts" };
  writeFileSync(cache, JSON.stringify(good));
  const reshaped = keylang(dir, ["check"]);
  assert.equal(reshaped.status, 1, reshaped.stderr);
  assert.match(reshaped.stdout, /K102/);
  writeFileSync(cache, "{ broken");
  const rebuilt = keylang(dir, ["map"]);
  assert.equal(rebuilt.status, 0, rebuilt.stderr);
  assert.doesNotMatch(rebuilt.stderr, /cache/i);
});

// RV04: a hand-written map file has no generator marker. `map` must refuse
// before writing or deleting anything, and `--check` must not call that "stale".
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

interface IndexEdge {
  kind: string;
  source: string;
  target: string | null;
  resolution: string;
  text: string;
  via?: string;
  closure?: boolean;
}

function mapIndex(dir: string): { nodes: Record<string, { kind: string; calls?: string[]; escapes?: { reason: string } }>; edges: IndexEdge[]; coverage: { reason: string; text: string }[] } {
  const r = keylang(dir, ["map"]);
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8"));
}

test("class members: arrow fields are fns, field initializers run in the constructor or the static initializer, computed keys are unsupported", (t) => {
  const code = [
    'import { later, boot, init, make, hidden, count } from "./lib.ts";',
    "export class Implicit {",
    "  private readonly parts = make();",
    "  static registry = boot();",
    "  static {",
    "    init();",
    "  }",
    "  handler = () => later();",
    "  readonly generate = (n: number): number => count(n);",
    "  [Symbol.iterator]() {",
    "    return hidden();",
    "  }",
    "  get size(): number {",
    "    return count(1);",
    "  }",
    "}",
    "export class Explicit {",
    "  private readonly parts = make();",
    "  handler = () => later();",
    "  constructor() {",
    "    init();",
    "  }",
    "}",
    "",
  ].join("\n");
  const lib = "export function later(): void {}\nexport function boot(): void {}\nexport function init(): void {}\nexport function make(): void {}\nexport function hidden(): void {}\nexport function count(n: number): number { return n; }\n";
  const dir = mainRepo(t, { "src/a.ts": code, "src/lib.ts": lib }, "- layers main\n");
  const index = mapIndex(dir);
  const calls = (id: string): string[] => [...(index.nodes[id]?.calls ?? [])].sort();
  // No `constructor` in the code: the class still constructs, and the map says what that runs.
  assert.deepEqual(calls("main.a.Implicit.constructor"), ["main.lib.make"]);
  assert.deepEqual(calls("main.a.Implicit.static"), ["main.lib.boot", "main.lib.init"]);
  assert.deepEqual(calls("main.a.Implicit.handler"), ["main.lib.later"]);
  assert.deepEqual(calls("main.a.Implicit.generate"), ["main.lib.count"]);
  assert.deepEqual(calls("main.a.Implicit.size"), ["main.lib.count"]);
  assert.equal(index.nodes["main.a.Implicit.size"]?.escapes?.reason, "an accessor runs on property access");
  assert.equal(Object.keys(index.nodes).some((id) => id.startsWith("main.a.Implicit._")), false);
  assert.ok(index.coverage.some((item) => item.reason === "unsupported construct `computed class member`" && item.text.startsWith("[Symbol.iterator]")));
  // An explicit constructor runs the initializers, never an arrow field's body.
  assert.deepEqual(calls("main.a.Explicit.constructor"), ["main.lib.init", "main.lib.make"]);
  assert.deepEqual(calls("main.a.Explicit.handler"), ["main.lib.later"]);
  const map = readFileSync(join(dir, "keylang/map/main.md"), "utf8");
  assert.match(map, /- fn \[constructor\]\(\.\.\/\.\.\/src\/a\.ts#L3\)\n\s+- calls main\.lib\.make\n/);
  assert.match(map, /- fn \[handler\]\(\.\.\/\.\.\/src\/a\.ts#L8\) \(\)\n\s+- calls main\.lib\.later\n/);
  // A static ok from the constructor to an arrow field's call would be false.
  writeFileSync(join(dir, "keylang/flows.md"), "# flow build\n\n- trigger main.a.Explicit.constructor\n  - step main.lib.make\n  - step main.lib.later\n");
  const checked = keylang(dir, ["check"]);
  assert.match(checked.stdout, /static ok main\.lib\.make: called from main\.a\.Explicit\.constructor/);
  assert.match(checked.stdout, /static fail main\.lib\.later: absence: no call path from main\.a\.Explicit\.constructor/);
});

test("a field or a local of a known class resolves its method calls; any other receiver stays a hole", (t) => {
  const code = [
    'import { Decoder } from "./decoder.ts";',
    "export class App {",
    "  private readonly decoder = new Decoder();",
    "  private readonly typed: Decoder;",
    "  private loose: { feed(s: string): void } = { feed() {} };",
    "  private readonly cache = new Map<string, number>();",
    "  constructor(private readonly given: Decoder) {",
    "    this.typed = given;",
    "  }",
    "  input(s: string): void {",
    "    this.decoder.feed(s);",
    "    this.typed.flush();",
    "    this.given.reset();",
    "    this.loose.feed(s);",
    "    this.cache.get(s);",
    "  }",
    "}",
    "export function run(d: Decoder): void {",
    "  const local = new Decoder();",
    "  local.flush();",
    "  d.reset();",
    "}",
    "",
  ].join("\n");
  const decoder = "export class Decoder {\n  feed(s: string): void {}\n  flush(): void {}\n  reset(): void {}\n}\n";
  const index = mapIndex(mainRepo(t, { "src/app.ts": code, "src/decoder.ts": decoder }, "- layers main\n"));
  const resolved = (source: string): string[] => index.edges.filter((e) => e.kind === "call" && e.source === source && e.resolution === "resolved").map((e) => `${e.text} ${e.target}`).sort();
  assert.deepEqual(resolved("main.app.App.input"), ["this.decoder.feed main.decoder.Decoder.feed", "this.given.reset main.decoder.Decoder.reset", "this.typed.flush main.decoder.Decoder.flush"]);
  assert.deepEqual(resolved("main.app.run"), ["Decoder main.decoder.Decoder", "d.reset main.decoder.Decoder.reset", "local.flush main.decoder.Decoder.flush"]);
  assert.ok(index.edges.some((e) => e.source === "main.app.App.input" && e.text === "this.loose.feed" && e.resolution === "unresolved"));
  // A method of a global class is an external call, not a hole.
  assert.equal(index.edges.some((e) => e.text === "this.cache.get"), false);
});

test("a module ID collision from two globs of one layer suggests splitting the layer; one within a glob keeps the old text", (t) => {
  const dir = tempDir(t, "keylang-collision-");
  writeTree(dir, {
    "keylang.json": `${JSON.stringify({ languages: ["python", "typescript"], layers: { core: ["app/core/**", "app/db/**"], web: ["web/**"] } })}\n`,
    "app/__init__.py": "",
    "app/core/__init__.py": "x = 1\n",
    "app/db/__init__.py": "y = 2\n",
    "web/foo.bar.ts": "export const a = 1;\n",
    "web/foo_bar.ts": "export const b = 2;\n",
  });
  const o = keylang(dir, ["map"]);
  assert.match(o.stderr, /warning: app\/db\/__init__\.py: module ID collision: same module ID as `app\/core\/__init__\.py` \(`core\.__init__`\) from another path; the module is opaque until one of them is renamed; or split layer `core` so `app\/core\/\*\*` and `app\/db\/\*\*` are separate layers\n/);
  assert.match(o.stderr, /warning: web\/foo_bar\.ts: module ID collision: same module ID as `web\/foo\.bar\.ts` \(`web\.foo_bar`\) from another path; the module is opaque until one of them is renamed\n/);
});

// A `keylang.json` saved while the analysis runs (Ctrl+S in the TUI, an editor): the plan was computed from the old text, so the commit must refuse.
test("map and wire: keylang.json changed during the analysis refuses the commit (failed, 1, nothing written), as a change after the plan does", async (t) => {
  const dir = tempDir(t, "keylang-map-race-");
  writeTree(dir, {
    "keylang.json": `${JSON.stringify({ languages: ["typescript"], layers: { app: ["src/app/**"] } })}\n`,
    "src/app/a.ts": "export function a(): number {\n  return 1;\n}\n",
    "src/core/c.ts": "export function c(): number {\n  return 2;\n}\n",
  });
  const withCore = `${JSON.stringify({ languages: ["typescript"], layers: { app: ["src/app/**"], core: ["src/core/**"] } })}\n`;
  const map = await runOperation(
    { kind: "map", root: dir },
    {
      analyze: async (request) => {
        const analyzed = await analyze(request);
        writeFileSync(join(dir, "keylang.json"), withCore);
        return analyzed;
      },
      beforeCommit: async () => undefined,
    },
  );
  assert.equal(map.status, "failed", JSON.stringify(map.messages));
  assert.equal(map.exitCode, 1);
  assert.ok(map.messages.some((m) => m.text === "keylang.json: changed on disk while the map was computed"), JSON.stringify(map.messages));
  assert.equal(existsSync(join(dir, "keylang/map")), false, "nothing written");
  assert.equal(existsSync(join(dir, ".keylang/index.json")), false);
  // The map of the saved config is then not stale.
  assert.equal(keylang(dir, ["map"]).status, 0);
  assert.equal(keylang(dir, ["map", "--check"]).status, 0);

  const shop = tempDir(t, "keylang-wire-race-");
  cpSync(join(root, "tests/fixtures/wiring-shop"), shop, { recursive: true });
  const config = readFileSync(join(shop, "keylang.json"), "utf8");
  const excluded = `${JSON.stringify({ ...JSON.parse(config), exclude: ["src/infra/memory-db.ts"] })}\n`;
  const wire = await runOperation(
    { kind: "wire", root: shop, check: false },
    {
      analyze: async (request) => {
        const analyzed = await analyze(request);
        writeFileSync(join(shop, "keylang.json"), excluded);
        return analyzed;
      },
      beforeCommit: async () => undefined,
    },
  );
  assert.equal(wire.status, "failed", JSON.stringify(wire.messages));
  assert.equal(wire.exitCode, 1);
  assert.ok(wire.messages.some((m) => m.text === "keylang.json: changed on disk while the wiring was computed"), JSON.stringify(wire.messages));
  assert.equal(existsSync(join(shop, "keylang.gen.ts")), false, "nothing written");
});
