// End-to-end tests: run the `keylang` CLI on examples and fixtures.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { GRAMMARS, wasmFile } from "../src/extract/grammars.ts";
import { check, parse } from "../src/index.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");

/** Run `keylang` with `cwd` as working directory. */
function keylang(cwd: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  // `check --format json` on this repository is over the default 1 MiB buffer; a cut output must fail, not parse half.
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw r.error;
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

test("deferred flow properties and a query rule stay K004, and help has no migrate", (t) => {
  const dir = tempDir(t, "keylang-deferred-");
  writeTree(dir, {
    "keylang/flows/pay.md": "# flow pay\n\n- never app.pay.charge\n- at-most 1 app.pay.charge\n- never app.pay.save before app.pay.charge\n",
    "keylang/rules.md": "# rules\n\n- query depends(X, Y)\n",
  });
  const flowWords = "kind, trigger, step, reads, emits, calls, invariant, when, test, planned";
  const flow = keylang(dir, ["check", "keylang/flows/pay.md"]);
  assert.equal(flow.status, 1, flow.stdout);
  assert.match(flow.stdout, new RegExp(`pay\\.md:3:3: K004 unknown keyword \`never\` here; expected one of: ${flowWords}`));
  assert.match(flow.stdout, new RegExp(`pay\\.md:4:3: K004 unknown keyword \`at-most\` here; expected one of: ${flowWords}`));
  assert.match(flow.stdout, new RegExp(`pay\\.md:5:3: K004 unknown keyword \`never\` here; expected one of: ${flowWords}`));
  const rules = keylang(dir, ["check", "keylang/rules.md"]);
  assert.equal(rules.status, 1, rules.stdout);
  assert.match(rules.stdout, /rules\.md:3:3: K004 unknown keyword `query` here; expected one of: layers, allow, deny, entry, module, no-cycles/);
  const help = keylang(root, ["--help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.doesNotMatch(help.stdout, /\bmigrate\b/);
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

test("fmt over a directory formats every file it can and names each one it cannot write, exit 2", { skip: process.getuid?.() === 0 ? "root writes read-only files" : false }, (t) => {
  const dir = mkdtempSync(join(tmpdir(), "keylang-fmt-dir-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const messy = readFileSync(join(root, "tests/fixtures/fmt/messy.md"), "utf8");
  const expected = readFileSync(join(root, "tests/fixtures/fmt/messy.expected"), "utf8");
  for (const name of ["a.md", "b.md", "c.md"]) writeFileSync(join(dir, name), messy);
  chmodSync(join(dir, "b.md"), 0o444);
  const o = keylang(dir, ["fmt", "."]);
  assert.equal(o.status, 2, o.stderr);
  assert.match(o.stderr, /^b\.md: cannot write: EACCES/m);
  assert.equal(readFileSync(join(dir, "a.md"), "utf8"), expected);
  assert.equal(readFileSync(join(dir, "b.md"), "utf8"), messy);
  assert.equal(readFileSync(join(dir, "c.md"), "utf8"), expected, "the file after the failure is formatted too");
  assert.equal(o.stdout, "a.md: formatted\nc.md: formatted\n");
});

// An astral letter (two UTF-16 code units, one code point) in the IDs and before the link.
const LINKED_MAP = "# map\n\n- layer 𝒳\n  - module a\n    - fn go\n      - calls 𝒳.a.b, [𝒳.a.go](𝒳.md#𝒳.a.go)\n    - fn b\n";

test("a reference written as a Markdown link resolves by its text; the span is the ID inside the brackets", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "keylang-link-ref-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "map.md"), LINKED_MAP);
  const rules = "# rules\n\n- deny [𝒳.a](x.md) [𝒳.zz](y.md#𝒳.zz)\n- allow [](x) 𝒳\n- allow [не id](x) 𝒳\n- allow [𝒳.a](x 𝒳\n";
  writeFileSync(join(dir, "rules.md"), rules);

  const parsed = keylang(dir, ["parse", "--json", "map.md"]);
  assert.equal(parsed.status, 0, parsed.stdout + parsed.stderr);
  const calls = JSON.parse(parsed.stdout)[0].sections[0].items[0].children[0].children[0].children[0];
  assert.equal(calls.kind, "calls");
  const [bare, linked] = calls.refs;
  const line = LINKED_MAP.split("\n")[5]!;
  const lineStart = LINKED_MAP.indexOf(line);
  const colOf = (needle: string): number => [...line.slice(0, line.indexOf(needle))].length + 1;
  assert.deepEqual(bare.span.start, { offset: lineStart + line.indexOf("𝒳.a.b"), line: 6, col: colOf("𝒳.a.b") });
  assert.equal(bare.link, undefined);
  assert.equal(linked.text, "𝒳.a.go");
  assert.equal(linked.target, "𝒳.a.go");
  assert.equal(linked.link.target, "𝒳.md#𝒳.a.go");
  assert.equal(linked.link.path, "𝒳.md");
  const start = lineStart + line.indexOf("[𝒳.a.go]") + 1;
  assert.deepEqual(linked.span, {
    start: { offset: start, line: 6, col: colOf("[𝒳.a.go]") + 1 },
    end: { offset: start + "𝒳.a.go".length, line: 6, col: colOf("[𝒳.a.go]") + 1 + [..."𝒳.a.go"].length },
  });

  const o = keylang(dir, ["check", "."]);
  const found = o.stdout.split("\n").filter((l) => / K\d{3} /.test(l));
  assert.deepEqual(found.map((l) => l.replace(/ K(\d{3}) .*/, " K$1")), ["rules.md:3:21: K001", "rules.md:4:9: K005", "rules.md:5:9: K005", "rules.md:6:9: K005"], o.stdout);
  assert.match(o.stdout, /rules\.md:3:21: K001 dangling reference `𝒳\.zz`/);
  assert.match(o.stdout, /rules\.md:4:9: K005 malformed link, expected `\[id\]\(href\)`/);
  assert.match(o.stdout, /rules\.md:5:9: K005 expected an ID as the link text, found `не id`/);
  assert.match(o.stdout, /rules\.md:6:9: K005 malformed link, expected `\[id\]\(href\)`/);
});

test("fmt keeps a link reference a link and a bare ID bare, idempotently", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "keylang-link-fmt-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "map.md"), LINKED_MAP.replace("calls 𝒳.a.b, [", "calls   𝒳.a.b ,["));
  assert.equal(keylang(dir, ["fmt", "--check", "map.md"]).status, 1);
  assert.equal(keylang(dir, ["fmt", "map.md"]).status, 0);
  assert.equal(readFileSync(join(dir, "map.md"), "utf8"), LINKED_MAP);
  assert.equal(keylang(dir, ["fmt", "--check", "map.md"]).status, 0);
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
  assert.equal(index.schema, 7);
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

test("packed tarball runs the CLI from node_modules", async (t) => {
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
  // Every grammar the runtime loads ships in dist/wasm, which the package reads instead of @vscode/tree-sitter-wasm.
  for (const grammar of GRAMMARS) assert.ok(names.some((n) => n.endsWith(`/dist/wasm/${wasmFile(grammar)}`)), grammar);
  assert.ok(names.some((n) => n.endsWith("/bin/keylang.js")));
  for (const asset of ["xterm.js", "xterm.css", "addon-fit.js", "xterm.LICENSE"]) assert.ok(names.some((n) => n.endsWith(`/dist/web/${asset}`)), asset);
  assert.ok(names.some((n) => n.endsWith("/dist/tui/analysis-worker.js")));
  assert.ok(names.some((n) => n.endsWith("/dist/tui/operation-worker.js")));
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
  // The library entry the README documents: `import { parse } from "keylang"`.
  const api = spawnSync(process.execPath, ["--input-type=module", "-e", 'const k = await import("keylang"); console.log(typeof k.parse)'], { cwd: tmp, encoding: "utf8" });
  assert.equal(api.stdout, "function\n", api.stderr);
  assert.doesNotMatch(listing.stdout, /dist\/tui\/websocket\.js/, "prepack starts from an empty dist/");
  // Without the optional voice modules (no prebuilt binary for a platform, or `--omit=optional`) the CLI works and says so.
  // A directory of its own: module resolution must not find the first install in a parent's node_modules.
  const bare = mkdtempSync(join(tmpdir(), "keylang-bare-"));
  try {
    writeFileSync(join(bare, "package.json"), '{"name":"keylang-bare-test","private":true}\n');
    const bareInstall = spawnSync("npm", ["install", "--omit=dev", "--omit=optional", "--offline", "--ignore-scripts", tarball], { cwd: bare, encoding: "utf8" });
    assert.equal(bareInstall.status, 0, bareInstall.stderr);
    assert.ok(!existsSync(join(bare, "node_modules/decibri")) && !existsSync(join(bare, "node_modules/@fugood/whisper.node")));
    const doctor = spawnSync(process.execPath, [join(bare, "node_modules/keylang/bin/keylang.js"), "doctor"], { cwd: bare, encoding: "utf8", env: { ...process.env, HOME: bare } });
    assert.equal(doctor.status, 0, doctor.stderr);
    assert.match(doctor.stdout, /^@fugood\/whisper\.node: not installed \(optional\)$/m);
    assert.match(doctor.stdout, /^microphone \(decibri\): not installed/m);
    // Installed but not loadable (no prebuilt binary for the platform): unavailable with the reason, still code 0,
    // and whisper.node's console.warn while it looks for a binary does not reach the output.
    mkdirSync(join(bare, "node_modules/decibri"), { recursive: true });
    writeFileSync(join(bare, "node_modules/decibri/package.json"), '{"name":"decibri","version":"0.0.0","main":"index.js"}\n');
    writeFileSync(join(bare, "node_modules/decibri/index.js"), 'throw new Error("Failed to load native binding");\n');
    mkdirSync(join(bare, "node_modules/@fugood/whisper.node"), { recursive: true });
    writeFileSync(join(bare, "node_modules/@fugood/whisper.node/package.json"), '{"name":"@fugood/whisper.node","version":"0.0.0","main":"index.js"}\n');
    writeFileSync(
      join(bare, "node_modules/@fugood/whisper.node/index.js"),
      'exports.initWhisper = async () => { throw new Error("no binary"); };\nexports.loadWhisperModule = async () => { console.warn("Not found package for your platform, fallback to local build"); throw new Error("Failed to load whisper.node: no build/Release/index.node"); };\n',
    );
    const broken = spawnSync(process.execPath, [join(bare, "node_modules/keylang/bin/keylang.js"), "doctor"], { cwd: bare, encoding: "utf8", env: { ...process.env, HOME: bare } });
    assert.equal(broken.status, 0, broken.stderr);
    assert.match(broken.stdout, /^@fugood\/whisper\.node: unavailable: Failed to load whisper\.node: no build\/Release\/index\.node; Not found package for your platform/m);
    assert.match(broken.stdout, /^microphone \(decibri\): unavailable: Failed to load native binding/m);
    assert.match(broken.stdout, /^voice: engine auto → install the optional @fugood\/whisper\.node/m, "an unavailable whisper is not an engine");
    assert.doesNotMatch(`${broken.stdout}${broken.stderr}`, /^Not found package/m);
  } finally {
    rmSync(bare, { recursive: true, force: true });
  }

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
  // The TUI's operation worker runs from the package's JS entry: the same map check as the packed CLI.
  // A script file, not `--eval`: a worker inherits the parent's exec flags, and `--input-type` refuses a file entry.
  const workerScript = join(tmp, "operation-worker-check.mjs");
  writeFileSync(
    workerScript,
    `const { OperationWorker } = await import(${JSON.stringify(pathToFileURL(join(tmp, "node_modules/keylang/dist/tui/background.js")).href)});\n` +
      `const worker = new OperationWorker();\n` +
      `const result = await worker.run({ kind: "map-check", root: ${JSON.stringify(packedRepo)} });\n` +
      `worker.close();\n` +
      `console.log(JSON.stringify([result.status, result.exitCode]));\n` +
      `if (result.status !== "completed") console.error(JSON.stringify(result.messages));\n`,
  );
  const packedWorker = spawnSync(process.execPath, [workerScript], { cwd: tmp, encoding: "utf8" });
  assert.equal(packedWorker.stdout, `${JSON.stringify(["completed", spawnSync(process.execPath, [installedBin, "map", "--check"], { cwd: packedRepo, encoding: "utf8" }).status])}\n`, packedWorker.stderr);
  const localIndex = JSON.parse(readFileSync(join(localRepo, ".keylang/index.json"), "utf8"));
  const packedIndex = JSON.parse(readFileSync(join(packedRepo, ".keylang/index.json"), "utf8"));
  assert.equal(packedIndex.snapshotId, localIndex.snapshotId);
  assert.equal(packedIndex.schema, localIndex.schema);
  // Rust and Python parse with the package's own grammars too: the same map and snapshot as the checkout.
  for (const fixture of ["rust-shop", "py-shop"]) {
    const local = mkdtempSync(join(tmpdir(), `keylang-${fixture}-`));
    const packedCopy = mkdtempSync(join(tmpdir(), `keylang-${fixture}-packed-`));
    t.after(() => {
      rmSync(local, { recursive: true, force: true });
      rmSync(packedCopy, { recursive: true, force: true });
    });
    cpSync(join(root, "tests/fixtures", fixture), local, { recursive: true });
    cpSync(join(root, "tests/fixtures", fixture), packedCopy, { recursive: true });
    assert.equal(keylang(local, ["init"]).status, 0, fixture);
    const packedInit = spawnSync(process.execPath, [installedBin, "init"], { cwd: packedCopy, encoding: "utf8" });
    assert.equal(packedInit.status, 0, `${fixture}: ${packedInit.stderr}`);
    const maps = readdirSync(join(local, "keylang/map"));
    assert.ok(maps.length > 0, fixture);
    for (const name of maps) assert.equal(readFileSync(join(packedCopy, "keylang/map", name), "utf8"), readFileSync(join(local, "keylang/map", name), "utf8"), `${fixture}: ${name}`);
    const snapshotOf = (dir: string): string => (JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as { snapshotId: string }).snapshotId;
    assert.equal(snapshotOf(packedCopy), snapshotOf(local), fixture);
  }

  // `keylang web` from the package: xterm.js from dist/web, the snapshot from the dist worker.
  const web = spawn(process.execPath, [installedBin, "web", "--port", "0"], { cwd: packedRepo, stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => web.kill("SIGINT"));
  let out = "";
  web.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));
  const started = Date.now();
  while (!/keylang web: (\S+)/.test(out)) {
    assert.ok(Date.now() - started < 10000, "keylang web did not print its URL");
    await new Promise((done) => setTimeout(done, 20));
  }
  const url = new URL(/keylang web: (\S+)/.exec(out)![1]!);
  const asset = await fetch(new URL("/assets/xterm.js", url));
  assert.equal(asset.status, 200);
  assert.ok((await asset.text()).length > 100000);
  const frames: string[] = [];
  const socket = new WebSocket(`ws://${url.host}/ws`, ["keylang", `keylang.t.${new URLSearchParams(url.hash.slice(1)).get("t")}`]);
  socket.onmessage = (event) => frames.push(String(event.data));
  socket.onopen = () => socket.send(JSON.stringify({ type: "hello", session: "packed-session", cols: 100, rows: 24 }));
  while (!/✗ 0/.test(frames.join(""))) {
    assert.ok(Date.now() - started < 20000, `no analysis over the socket: ${frames.join("").slice(-400)}`);
    await new Promise((done) => setTimeout(done, 20));
  }
  socket.close();
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
  assert.equal(index.schema, 7);
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

test("a worker loaded by URL is a module edge, and deleting the worker is reported", (t) => {
  const files = {
    "src/cli.ts": 'import { start } from "./pool.ts";\nexport function main(): void {\n  start();\n}\n',
    "src/pool.ts": [
      'import { Worker } from "node:worker_threads";',
      "export function start(): Worker {",
      '  return new Worker(new URL(import.meta.url.endsWith(".ts") ? "./worker.ts" : "./worker.js", import.meta.url));',
      "}",
      "",
    ].join("\n"),
    "src/worker.ts": 'import { parentPort } from "node:worker_threads";\nparentPort?.on("message", () => {});\n',
    "src/hooks.ts": "export async function load(url: string, context: unknown, next: (u: string, c: unknown) => unknown): Promise<unknown> {\n  return next(url, context);\n}\n",
    "src/trace.ts": 'import { register } from "node:module";\nconst hooks = import.meta.url.endsWith(".ts") ? "./hooks.ts" : "./hooks.js";\nregister(hooks, { parentURL: import.meta.url });\n',
  };
  // The worker runs in its own thread, so it stays an entry; the edge now backs the entry.
  const dir = mainRepo(t, files, "- layers main\n- entry\n  - main.cli\n  - main.trace\n  - main.worker\n");
  assert.equal(keylang(dir, ["map"]).status, 0);
  const map = readFileSync(join(dir, "keylang/map/main.md"), "utf8");
  assert.match(map, /- module \[pool\][^\n]*\n(\s+- [^\n]*\n)*?\s+- worker main\.worker\n/);
  assert.match(map, /- module \[trace\][^\n]*\n(\s+- [^\n]*\n)*?\s+- hooks main\.hooks\n/);
  const ok = keylang(dir, ["check", "--strict"]);
  assert.equal(ok.status, 0, ok.stdout);
  rmSync(join(dir, "src/worker.ts"));
  const gone = keylang(dir, ["check"]);
  assert.equal(gone.status, 1, gone.stdout);
  assert.match(gone.stdout, /keylang\/rules\.md:7:5: K001 dangling reference `main\.worker`/);
  const mapped = keylang(dir, ["map"]);
  assert.match(mapped.stderr, /src\/pool\.ts:3: unresolved import `\.\/worker\.ts`/);
  // Without the entry line the gap still blocks a clean `--strict`: the missing module may be anything.
  writeFileSync(join(dir, "keylang/rules.md"), "# rules\n\n- layers main\n- deny main.pool main.cli\n");
  const strict = keylang(dir, ["check", "--strict"]);
  assert.equal(strict.status, 1, strict.stdout);
  assert.match(strict.stdout, /rules\.md:4:1: unverified unresolved import `\.\/worker\.(ts|js)` \(src\/pool\.ts:3:21\)/);
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
  assert.match(checked.stdout, /K102 divergence: `domain\.order` depends on `infra\.db`, which is denied by `deny domain infra` \(keylang\/rules\.md:3\)/);
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

/** Command keys from `keylang --help`: the words of a line indented by exactly two spaces, up to a token that starts with `<`, `[` or `-`, or up to two spaces. Every `explain` variant is one key. */
function helpCommandKeys(help: string): string[] {
  const keys: string[] = [];
  for (const line of help.split("\n")) {
    if (!line.startsWith("  ") || line.startsWith("   ")) continue;
    const words: string[] = [];
    for (const token of line.slice(2).split(" ")) {
      if (token === "" || token.startsWith("<") || token.startsWith("[") || token.startsWith("-")) break;
      words.push(token);
    }
    if (words.length > 0) keys.push(words.join(" "));
  }
  return [...new Set(keys)];
}

/** First column of the commands table in tools.md, in backticks. */
function toolsCommandKeys(tools: string): string[] {
  const keys: string[] = [];
  for (const line of tools.split("\n")) {
    const cell = /^\| `([^`]+)` \|/.exec(line);
    if (cell) keys.push(cell[1]!);
  }
  return keys.filter((key) => key !== "keylang");
}

/** A help key missing from the table, or a table key that `--help` does not have. */
function commandTableDrift(help: string, tools: string): string | null {
  const fromHelp = new Set(helpCommandKeys(help));
  const fromTable = toolsCommandKeys(tools);
  for (const key of fromHelp) if (!fromTable.includes(key)) return key;
  for (const key of fromTable) if (!fromHelp.has(key)) return key;
  return null;
}

test("the commands table in tools.md lists every command from --help", () => {
  const help = keylang(root, ["--help"]);
  assert.equal(help.status, 0, help.stderr);
  const tools = readFileSync(join(root, "docs/tools.md"), "utf8");
  const drift = commandTableDrift(help.stdout, tools);
  assert.equal(drift, null, drift ?? "");
  assert.ok(tools.includes("| `keylang` |"), "the bare keylang row is the TUI");
  const withoutDoctor = tools.replace("| `doctor` |", "| `clerk` |");
  assert.equal(commandTableDrift(help.stdout, withoutDoctor), "doctor");
  const withInvented = tools.replace("| `doctor` |", "| `doctor` |\n| `teleport` | nowhere | | 2 | |");
  assert.equal(commandTableDrift(help.stdout, withInvented), "teleport");
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
  for (const id of ["cli.cli.main", "cli.cli.cmdCheck", "map.analyze.analyze", "check.rules.evaluateRules", "features.check-format.checkReportText"]) {
    assert.ok(events.some((event) => event.event === "start" && event.symbolId === id), id);
  }
});

// The TUI flow of `keylang/flows/tui.md`: one F5 in a session wired as
// `keylang` wires it, so the snapshot comes from `SnapshotWorker`.
test("@flow tui: F5 reanalyses with the snapshot from the worker", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const trace = join(root, ".keylang/trace/tui.jsonl");
  rmSync(trace, { force: true });
  const r = spawnSync(process.execPath, ["--import", join(root, "src/adapters/trace.ts"), join(root, "tests/fixtures/tui-session/session.ts"), dir], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, KEYLANG_TRACE: trace, KEYLANG_TRACE_FLOW: "tui", KEYLANG_TRACE_TEST: "tests/cli.test.ts > @flow tui", KEYLANG_TRACE_ROOT: root },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^[0-9a-f]{64}\n$/, "the session got a snapshot");
  const events = readFileSync(trace, "utf8").trim().split("\n").map((line) => JSON.parse(line) as { event: string; symbolId?: string; complete?: boolean });
  assert.equal(events.at(-1)?.event, "run");
  assert.equal(events.at(-1)?.complete, true);
  for (const id of ["tui.app.App.input", "tui.input.InputDecoder.feed", "tui.app.App.handle", "tui.app.App.reanalyze", "map.analyze.analyze", "tui.background.SnapshotWorker.generate"]) {
    assert.ok(events.some((event) => event.event === "start" && event.symbolId === id), id);
  }
});

test("the in-repo check flow reports ID, static, tests, and trace separately", () => {
  const checked = keylang(root, ["check", "--format", "json"]);
  const rows = (JSON.parse(checked.stdout) as { results: { criterion: string; area: string; verdict: string; evidence: string }[] }).results;
  const steps = ["cli.cli.run", "cli.cli.cmdCheck", "map.analyze.analyze", "map.map.generateMap", "lang.parser.parse", "check.assess.assess", "check.resolve.check", "check.rules.evaluateRules", "check.flows.evaluateFlows", "features.check-format.checkReportText"];
  for (const id of steps) {
    for (const criterion of ["ID", "static", "trace"]) assert.ok(rows.some((row) => row.criterion === criterion && row.area === id), `${criterion} ${id}`);
    assert.equal(rows.find((row) => row.criterion === "ID" && row.area === id)?.verdict, "ok", id);
    assert.equal(rows.find((row) => row.criterion === "static" && row.area === id)?.verdict, "ok", id);
  }
  // The trace of the @flow test above belongs to this snapshot.
  for (const id of steps) assert.equal(rows.find((row) => row.criterion === "trace" && row.area === id)?.verdict, "ok", id);
  // The TUI flow: `this.decoder.feed`, the `analyzer` hook's default, and the injected `generate` are static paths.
  for (const id of ["tui.input.InputDecoder.feed", "tui.app.App.handle", "tui.app.App.reanalyze", "tui.background.SnapshotWorker.generate"]) {
    assert.equal(rows.find((row) => row.criterion === "static" && row.area === id)?.verdict, "ok", id);
  }
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
  const unverified = body.results.find((row) => row.verdict === "unverified" && row.criterion === "deny domain infra");
  assert.ok(unverified && unverified.snapshotId === body.snapshotId, json.stdout);
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
  const denyOk = JSON.parse(results(["--format", "json"]).stdout).results as { criterion: string; verdict: string; evidence: string; specHash?: string }[];
  const convergence = denyOk.filter((row) => row.verdict === "ok");
  assert.ok(convergence.every((row) => /^convergence: /.test(row.evidence) && /^[0-9a-f]{64}$/.test(row.specHash ?? "")), JSON.stringify(convergence));
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
    [{ ...config, languages: ["cobol"] }, /keylang\.json: `languages\[0\]` must be one of "javascript", "python", "rust", "typescript", got "cobol"/],
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

function tempDir(t: { after: (fn: () => void) => void }, prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeTree(dir: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, dirname(path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
}

/** Relative paths and their bytes, so a command that must not write can be compared. */
function treeBytes(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (rel: string): void => {
    let names: string[];
    try {
      names = readdirSync(join(dir, rel));
    } catch {
      return;
    }
    for (const name of names) {
      const path = rel === "" ? name : `${rel}/${name}`;
      if (statSync(join(dir, path)).isDirectory()) walk(path);
      else out.set(path, readFileSync(join(dir, path), "utf8"));
    }
  };
  walk("");
  return out;
}

function git(dir: string, args: string[]): void {
  const r = spawnSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test", ...args], { cwd: dir, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
}

const VERSION = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version as string;
const LAYERS = { languages: ["typescript"], module: "file", layers: { app: ["src/app/**"], domain: ["src/domain/**"] } };
const PAY = "export function charge(): number {\n  return 1;\n}\n";
const ORDER = "export function price(): number {\n  return 2;\n}\n";

test("help lists agents, feature, baseline, check --changed and hook stop", () => {
  const help = keylang(root, ["--help"]);
  assert.equal(help.status, 0);
  for (const phrase of ["agents", "--agents", "feature", "baseline", "--changed", "hook stop"]) assert.match(help.stdout, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("init: managed AGENTS.md block keeps foreign CRLF text, is idempotent, and baseline adds no fail", (t) => {
  const foreign = "Чужий заголовок\r\n\r\nНе чіпати.\r\n";
  const make = (): string => {
    const dir = tempDir(t, "keylang-launch-");
    writeTree(dir, {
      "package.json": `${JSON.stringify({ name: "shop", private: true, dependencies: { stripe: "1.0.0" } })}\n`,
      "src/domain/order.ts": ORDER,
      "src/app/pay.ts": 'import { price } from "../domain/order.ts";\nimport Stripe from "stripe";\nexport function charge(): number {\n  return price() + (Stripe ? 1 : 0);\n}\n',
      "AGENTS.md": foreign,
    });
    mkdirSync(join(dir, ".claude"));
    return dir;
  };
  const run = (dir: string): string => {
    const init = keylang(dir, ["init"]);
    assert.equal(init.status, 0, init.stderr);
    const check = keylang(dir, ["check"]);
    assert.equal(check.status, 0, check.stdout);
    assert.doesNotMatch(check.stdout, /rules\.baseline\.md:\d+:\d+: K102/);
    const agents = keylang(dir, ["agents", "--check"]);
    assert.equal(agents.status, 0, agents.stdout);
    const block = readFileSync(join(dir, "AGENTS.md"), "utf8");
    assert.ok(block.startsWith(foreign), "foreign text is a byte prefix");
    assert.match(block, /<!-- keylang:begin -->/);
    assert.match(block, /<!-- keylang:end -->/);
    assert.ok(block.includes("\r\n"));
    assert.ok(Buffer.byteLength(block.slice(block.indexOf("<!-- keylang:begin -->"), block.indexOf("<!-- keylang:end -->") + "<!-- keylang:end -->".length)) <= 4096);
    return block;
  };
  const first = run(make());
  const secondDir = make();
  const once = run(secondDir);
  const again = keylang(secondDir, ["init"]);
  assert.equal(again.status, 0, again.stderr);
  assert.equal(readFileSync(join(secondDir, "AGENTS.md"), "utf8"), once);
  assert.equal(once.replace(/\r\n/g, "\n"), first.replace(/\r\n/g, "\n"));
});

test("agents: --agents=none writes no harness files; unknown name and broken markers write nothing", (t) => {
  const dir = tempDir(t, "keylang-none-");
  writeTree(dir, { "src/app/pay.ts": PAY, "src/domain/order.ts": ORDER });
  const none = keylang(dir, ["init", "--agents=none"]);
  assert.equal(none.status, 0, none.stderr);
  assert.equal(existsSync(join(dir, "AGENTS.md")), false);
  assert.equal(existsSync(join(dir, "CLAUDE.md")), false);
  assert.equal(existsSync(join(dir, ".mcp.json")), false);
  assert.equal(existsSync(join(dir, ".agents/skills/keylang-feature/SKILL.md")), false);
  assert.ok(existsSync(join(dir, "keylang.json")));
  assert.ok(existsSync(join(dir, "keylang/rules.baseline.md")));
  const check = keylang(dir, ["check"]);
  assert.equal(check.status, 0, check.stdout);

  const bad = tempDir(t, "keylang-agents-bad-");
  writeTree(bad, { "src/app/pay.ts": PAY });
  const before = treeBytes(bad);
  const unknown = keylang(bad, ["init", "--agents=nope"]);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /claude, codex, opencode, cursor, or none/);
  assert.deepEqual(treeBytes(bad), before);

  writeTree(bad, { "AGENTS.md": "<!-- keylang:begin -->\nнемає кінця\n" });
  const marked = readFileSync(join(bad, "AGENTS.md"), "utf8");
  const broken = keylang(bad, ["agents"]);
  assert.equal(broken.status, 2);
  assert.match(broken.stderr, /AGENTS\.md: broken markers/);
  assert.equal(readFileSync(join(bad, "AGENTS.md"), "utf8"), marked);
  assert.equal(existsSync(join(bad, "keylang.json")), false);
});

test("agents: MCP servers, skill copies, Claude deny and a stale --check that writes nothing", (t) => {
  const dir = tempDir(t, "keylang-mcp-cfg-");
  writeTree(dir, {
    "src/app/pay.ts": PAY,
    ".mcp.json": `${JSON.stringify({ mcpServers: { other: { command: "echo", args: ["hi"] } }, keep: true }, null, 2)}\n`,
    ".claude/settings.json": `${JSON.stringify({ permissions: { allow: ["Bash"], deny: ["Read(secret)"] }, hooks: { PostToolUse: [{ hooks: [{ type: "command", command: "echo kept" }] }] } }, null, 2)}\n`,
    "opencode.json": `${JSON.stringify({ mcp: { other: { type: "local", command: ["echo"] } } }, null, 2)}\n`,
  });
  mkdirSync(join(dir, ".codex"));
  mkdirSync(join(dir, ".cursor"));
  const init = keylang(dir, ["init", "--agents=claude,codex,opencode,cursor"]);
  assert.equal(init.status, 0, init.stderr);
  const mcp = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8")) as { keep: boolean; mcpServers: Record<string, { command: string; args?: string[] }> };
  assert.equal(mcp.keep, true);
  assert.deepEqual(mcp.mcpServers.other, { command: "echo", args: ["hi"] });
  assert.deepEqual(mcp.mcpServers.keylang, { command: "npx", args: ["-y", `keylang@${VERSION}`, "mcp"] });
  const cursor = JSON.parse(readFileSync(join(dir, ".cursor/mcp.json"), "utf8")) as { mcpServers: { keylang: { args: string[] } } };
  assert.deepEqual(cursor.mcpServers.keylang.args, ["-y", `keylang@${VERSION}`, "mcp"]);
  const toml = readFileSync(join(dir, ".codex/config.toml"), "utf8");
  assert.match(toml, /keylang@/);
  assert.match(toml, new RegExp(`keylang@${VERSION.replace(/\./g, "\\.")}`));
  const open = JSON.parse(readFileSync(join(dir, "opencode.json"), "utf8")) as { mcp: Record<string, { type?: string; command?: string[] }> };
  assert.deepEqual(open.mcp.other, { type: "local", command: ["echo"] });
  assert.equal(open.mcp.keylang?.type, "local");
  assert.deepEqual(open.mcp.keylang?.command, ["npx", "-y", `keylang@${VERSION}`, "mcp"]);
  const skillA = readFileSync(join(dir, ".agents/skills/keylang-feature/SKILL.md"), "utf8");
  const skillC = readFileSync(join(dir, ".claude/skills/keylang-feature/SKILL.md"), "utf8");
  assert.equal(skillA, skillC);
  assert.match(skillA, /^---\nname: keylang-feature\n/);
  assert.match(skillA, /^description: /m);
  assert.equal(statSync(join(dir, ".claude/skills/keylang-feature/SKILL.md")).isSymbolicLink(), false);
  const settings = JSON.parse(readFileSync(join(dir, ".claude/settings.json"), "utf8")) as {
    permissions: { allow: string[]; deny: string[] };
    hooks: { PostToolUse: unknown[]; Stop: { hooks: { command: string }[] }[] };
  };
  assert.deepEqual(settings.permissions.allow, ["Bash"]);
  for (const rule of ["Edit(keylang/rules.md)", "Write(keylang/rules.md)", "Edit(keylang/rules.baseline.md)", "Write(keylang/rules.baseline.md)"]) assert.ok(settings.permissions.deny.includes(rule), rule);
  assert.ok(settings.permissions.deny.includes("Read(secret)"));
  assert.equal(settings.hooks.PostToolUse.length, 1);
  assert.match(JSON.stringify(settings.hooks.Stop), new RegExp(`keylang@${VERSION.replace(/\./g, "\\.")} hook stop`));
  assert.match(readFileSync(join(dir, ".codex/hooks.json"), "utf8"), /hook stop/);
  assert.match(readFileSync(join(dir, "AGENTS.md"), "utf8"), /trusted project/);

  mcp.mcpServers.keylang.args = ["-y", "keylang@0.0.0", "mcp"];
  writeFileSync(join(dir, ".mcp.json"), `${JSON.stringify(mcp, null, 2)}\n`);
  writeFileSync(join(dir, ".claude/skills/keylang-feature/SKILL.md"), skillC.replace("keylang", "keylang-edited"));
  const held = treeBytes(dir);
  const stale = keylang(dir, ["agents", "--check"]);
  assert.equal(stale.status, 1, stale.stdout);
  assert.match(stale.stdout, /\.mcp\.json: stale/);
  assert.match(stale.stdout, /SKILL\.md: stale/);
  assert.deepEqual(treeBytes(dir), held);
  assert.equal(keylang(dir, ["agents", "--check", "--agents=none"]).status, 1);
});

test("agents: invalid JSON or TOML exits 2 and writes nothing", (t) => {
  const dir = tempDir(t, "keylang-bad-json-");
  writeTree(dir, { "src/app/pay.ts": PAY, ".mcp.json": "{ not json\n", ".codex/config.toml": "mcp_servers = [\n" });
  mkdirSync(join(dir, ".claude"));
  const before = treeBytes(dir);
  const json = keylang(dir, ["agents", "--agents=claude"]);
  assert.equal(json.status, 2);
  assert.match(json.stderr, /\.mcp\.json: invalid JSON/);
  assert.deepEqual(treeBytes(dir), before);
  const toml = keylang(dir, ["agents", "--agents=codex"]);
  assert.equal(toml.status, 2);
  assert.match(toml.stderr, /\.codex\/config\.toml: invalid TOML/);
  assert.deepEqual(treeBytes(dir), before);
});

test("baseline: a new cross-layer import or package is K102; an allowed package is not; --check writes nothing", (t) => {
  const dir = tempDir(t, "keylang-baseline-");
  writeTree(dir, { "package.json": `${JSON.stringify({ name: "shop", private: true, dependencies: { stripe: "1.0.0" } })}\n`, "keylang.json": `${JSON.stringify(LAYERS)}\n`, "src/app/pay.ts": PAY, "src/domain/order.ts": ORDER });
  assert.equal(keylang(dir, ["baseline"]).status, 0);
  const text = readFileSync(join(dir, "keylang/rules.baseline.md"), "utf8");
  assert.match(text, /keylang:generated/);
  assert.match(text, /deny app domain, external, unassigned/);
  assert.equal(keylang(dir, ["baseline"]).status, 0);
  assert.equal(readFileSync(join(dir, "keylang/rules.baseline.md"), "utf8"), text);
  assert.equal(keylang(dir, ["baseline", "--check"]).status, 0);
  writeFileSync(join(dir, "src/app/pay.ts"), 'import { price } from "../domain/order.ts";\nexport function charge(): number {\n  return price();\n}\n');
  const drifted = keylang(dir, ["baseline", "--check"]);
  assert.equal(drifted.status, 1);
  assert.match(drifted.stdout, /keylang baseline/);
  assert.equal(readFileSync(join(dir, "keylang/rules.baseline.md"), "utf8"), text);
  const denied = keylang(dir, ["check"]);
  assert.equal(denied.status, 1, denied.stdout);
  assert.match(denied.stdout, /K102 divergence: `app\.pay` depends on `domain\.order`/);
  assert.match(denied.stdout, /rules\.baseline\.md/);
  writeFileSync(join(dir, "src/app/pay.ts"), 'import Stripe from "stripe";\nexport function charge(): number {\n  return Stripe ? 1 : 0;\n}\n');
  const pkg = keylang(dir, ["check"]);
  assert.match(pkg.stdout, /K102 divergence: `app\.pay` depends on `external\.stripe`/);
  assert.equal(keylang(dir, ["baseline"]).status, 0);
  const allowed = keylang(dir, ["check"]);
  assert.doesNotMatch(allowed.stdout, /external\.stripe/);
  assert.equal(allowed.status, 0, allowed.stdout);
});

test("feature: planned, static and rule gaps, then done; JSON is the only stdout", (t) => {
  const dir = tempDir(t, "keylang-feature-");
  writeTree(dir, {
    "keylang.json": `${JSON.stringify(LAYERS)}\n`,
    "src/app/pay.ts": PAY,
    "src/domain/order.ts": ORDER,
    "keylang/features/pay.md": "# flow pay\n\n- planned fn app.pay.refund (n: number) → number\n- trigger app.pay.charge\n  - step app.pay.refund\n  - step domain.order.price\n",
  });
  assert.equal(keylang(dir, ["baseline"]).status, 0);
  const gap = keylang(dir, ["feature", "pay", "--format", "json"]);
  assert.equal(gap.status, 1, gap.stdout);
  const body = JSON.parse(gap.stdout) as { done: boolean; gaps: { kind: string; id: string }[] };
  assert.equal(body.done, false);
  assert.ok(body.gaps.some((item) => item.kind === "planned" && item.id === "app.pay.refund"));
  assert.ok(body.gaps.some((item) => item.kind === "static" && item.id === "domain.order.price"));
  assert.equal(gap.stdout.trimEnd() + "\n", gap.stdout);
  const missing = keylang(dir, ["feature", "nope"]);
  assert.equal(missing.status, 2);
  writeFileSync(join(dir, "src/app/pay.ts"), 'import { price } from "../domain/order.ts";\nexport function charge(): number {\n  return refund(price());\n}\nexport function refund(n: number): number {\n  return n;\n}\n');
  const ruled = keylang(dir, ["feature", "pay", "--format", "json"]);
  assert.equal(ruled.status, 1, ruled.stdout);
  const ruledBody = JSON.parse(ruled.stdout) as { gaps: { kind: string }[] };
  assert.ok(ruledBody.gaps.some((item) => item.kind === "rule"));
  assert.match(keylang(dir, ["check"]).stdout, /K102/);
  assert.equal(keylang(dir, ["baseline"]).status, 0);
  const done = keylang(dir, ["feature", "pay", "--format", "json"]);
  assert.equal(done.status, 0, done.stdout + done.stderr);
  assert.equal((JSON.parse(done.stdout) as { done: boolean }).done, true);
});

test("check --changed filters to the touched files; hook stop blocks once and writes nothing", (t) => {
  const dir = tempDir(t, "keylang-changed-");
  writeTree(dir, {
    "keylang.json": `${JSON.stringify(LAYERS)}\n`,
    "src/app/pay.ts": PAY,
    "src/domain/order.ts": ORDER,
    "keylang/flows/old.md": "# flow old\n\n- planned fn domain.order.later (n: number) → number\n- trigger domain.order.price\n  - step domain.order.later\n",
  });
  assert.equal(keylang(dir, ["baseline"]).status, 0);
  git(dir, ["init"]);
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "base"]);
  const plain = keylang(dir, ["check", "--changed"]);
  assert.equal(plain.status, 0, plain.stdout);
  assert.doesNotMatch(plain.stdout, /domain\.order\.later/);
  writeFileSync(join(dir, "src/app/pay.ts"), 'import { price } from "../domain/order.ts";\nexport function charge(): number {\n  return price();\n}\n');
  const changed = keylang(dir, ["check", "--changed"]);
  assert.equal(changed.status, 1, changed.stdout);
  assert.match(changed.stdout, /K102/);
  assert.doesNotMatch(changed.stdout, /domain\.order\.later/);
  writeFileSync(join(dir, "keylang/flows/old.md"), "# flow old\n\n- trigger domain.order.missing\n");
  const spec = keylang(dir, ["check", "--changed"]);
  assert.match(spec.stdout, /K001 dangling reference `domain\.order\.missing`/);
  const bare = tempDir(t, "keylang-nogit-");
  writeTree(bare, { "keylang.json": `${JSON.stringify(LAYERS)}\n`, "src/app/pay.ts": PAY, "keylang/rules.md": "# rules\n\n- deny app domain\n" });
  assert.notEqual(keylang(bare, ["check"]).status, 2);
  const noGit = keylang(bare, ["check", "--changed"]);
  assert.equal(noGit.status, 2);
  assert.match(noGit.stderr, /git/);

  const event = JSON.stringify({ hook_event_name: "Stop", stop_hook_active: false });
  const hook = (input: string): { status: number | null; stdout: string } => {
    const r = spawnSync(process.execPath, [bin, "hook", "stop"], { cwd: dir, input, encoding: "utf8" });
    return { status: r.status, stdout: r.stdout };
  };
  const dirty = treeBytes(dir);
  const blocked = hook(event);
  const again = hook(event);
  assert.equal(blocked.status, 0, blocked.stdout);
  assert.equal(again.stdout, blocked.stdout);
  const decision = JSON.parse(blocked.stdout) as { decision: string; reason: string };
  assert.equal(decision.decision, "block");
  assert.match(decision.reason, /src\/app\/pay\.ts:\d+/);
  const skipped = hook(JSON.stringify({ stop_hook_active: true }));
  assert.equal(skipped.status, 0);
  assert.equal(JSON.parse(skipped.stdout).decision, undefined);
  assert.deepEqual(treeBytes(dir), dirty);
  writeFileSync(join(dir, "src/app/pay.ts"), PAY);
  writeFileSync(join(dir, "keylang/flows/old.md"), "# flow old\n\n- planned fn domain.order.later (n: number) → number\n- trigger domain.order.price\n  - step domain.order.later\n");
  const clean = hook(event);
  assert.equal(clean.status, 0, clean.stdout);
  JSON.parse(clean.stdout);
  assert.notEqual(JSON.parse(clean.stdout).decision, "block");
});

test("check --changed and hook stop in a repository without commits: every file is changed, not a git error", (t) => {
  const dir = tempDir(t, "keylang-unborn-");
  writeTree(dir, {
    "keylang.json": `${JSON.stringify(LAYERS)}\n`,
    "src/app/pay.ts": 'import { price } from "../domain/order.ts";\nexport function charge(): number {\n  return price();\n}\n',
    "src/domain/order.ts": ORDER,
    "keylang/rules.md": "# rules\n\n- deny app domain\n",
  });
  git(dir, ["init"]);
  const untracked = keylang(dir, ["check", "--changed"]);
  assert.equal(untracked.status, 1, untracked.stderr);
  assert.match(untracked.stdout, /K102/);
  git(dir, ["add", "."]);
  const staged = keylang(dir, ["check", "--changed"]);
  assert.equal(staged.status, 1, staged.stderr);
  assert.match(staged.stdout, /K102/);
  const hook = spawnSync(process.execPath, [bin, "hook", "stop"], { cwd: dir, input: JSON.stringify({ hook_event_name: "Stop", stop_hook_active: false }), encoding: "utf8" });
  assert.equal(hook.status, 0, hook.stderr);
  assert.equal(JSON.parse(hook.stdout).decision, "block");
});

test("planned module external.<pkg> is static ok only from the importing parent module", (t) => {
  const feature = "# flow pay\n\n- planned module external.stripe\n- trigger app.pay.charge\n  - step external.stripe\n";
  const dir = tempDir(t, "keylang-external-");
  writeTree(dir, {
    "keylang.json": `${JSON.stringify(LAYERS)}\n`,
    "package.json": "{}\n",
    "src/app/pay.ts": PAY,
    "src/domain/order.ts": ORDER,
    "keylang/features/pay.md": feature,
  });
  const before = keylang(dir, ["check"]);
  assert.match(before.stdout, /unverified external\.stripe: planned module/);
  assert.match(before.stdout, /static unverified external\.stripe: planned module, not implemented/);
  writeFileSync(join(dir, "package.json"), `${JSON.stringify({ dependencies: { stripe: "1.0.0" } })}\n`);
  // Declared in the manifest, not yet imported: still a planned module, not K202.
  const declared = keylang(dir, ["check"]);
  assert.equal(declared.status, 0, declared.stdout + declared.stderr);
  assert.match(declared.stdout, /unverified external\.stripe: planned module/);
  assert.match(declared.stdout, /static unverified external\.stripe: planned module, not implemented/);
  assert.doesNotMatch(declared.stdout, /K202|K002/);
  writeFileSync(join(dir, "src/domain/order.ts"), 'import Stripe from "stripe";\nexport function price(): number {\n  return Stripe ? 2 : 0;\n}\n');
  const other = keylang(dir, ["check"]);
  assert.match(other.stdout, /K202 planned module `external\.stripe`/);
  assert.match(other.stdout, /static unverified external\.stripe: no import of `external\.stripe` from `app\.pay`/);
  const status = JSON.parse(keylang(dir, ["feature", "pay", "--format", "json"]).stdout) as { gaps: { kind: string; id: string; line: number }[] };
  assert.ok(status.gaps.some((gap) => gap.kind === "static" && gap.id === "external.stripe" && gap.line === 5));
  writeFileSync(join(dir, "src/domain/order.ts"), ORDER);
  writeFileSync(join(dir, "src/app/pay.ts"), 'import Stripe from "stripe";\nexport function charge(): number {\n  return Stripe ? 1 : 0;\n}\n');
  const own = keylang(dir, ["check"]);
  assert.match(own.stdout, /K202 planned module `external\.stripe`/);
  assert.match(own.stdout, /static ok external\.stripe: imported by `app\.pay`/);
});

test("init: the keylang skill under .claude is not a Claude harness, so a second init adds no Claude adapters", (t) => {
  const dir = tempDir(t, "keylang-skill-claude-");
  writeTree(dir, { "src/app/pay.ts": PAY, "src/domain/order.ts": ORDER });
  mkdirSync(join(dir, ".cursor"));
  assert.equal(keylang(dir, ["init"]).status, 0);
  assert.equal(existsSync(join(dir, ".claude/skills/keylang-feature/SKILL.md")), true);
  assert.equal(existsSync(join(dir, "CLAUDE.md")), false);
  assert.equal(existsSync(join(dir, ".mcp.json")), false);
  assert.equal(existsSync(join(dir, ".claude/settings.json")), false);
  assert.equal(keylang(dir, ["init"]).status, 0);
  assert.equal(keylang(dir, ["agents"]).status, 0);
  assert.equal(existsSync(join(dir, "CLAUDE.md")), false);
  assert.equal(existsSync(join(dir, ".mcp.json")), false);
  assert.equal(existsSync(join(dir, ".claude/settings.json")), false);
  assert.ok(existsSync(join(dir, ".cursor/mcp.json")));
});

test("check --changed and hook stop report K001 when the step's source file was deleted", (t) => {
  const dir = tempDir(t, "keylang-deleted-");
  writeTree(dir, {
    "keylang.json": `${JSON.stringify(LAYERS)}\n`,
    "src/app/pay.ts": PAY,
    "src/domain/order.ts": ORDER,
    "keylang/flows/price.md": "# flow price\n\n- trigger app.pay.charge\n  - step domain.order.price\n",
  });
  git(dir, ["init"]);
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "base"]);
  rmSync(join(dir, "src/domain/order.ts"));
  const full = keylang(dir, ["check"]);
  assert.equal(full.status, 1, full.stdout);
  assert.match(full.stdout, /K001 dangling reference `domain\.order\.price`/);
  const changed = keylang(dir, ["check", "--changed"]);
  assert.equal(changed.status, 1, changed.stdout);
  assert.match(changed.stdout, /K001 dangling reference `domain\.order\.price`/);
  const hook = spawnSync(process.execPath, [bin, "hook", "stop"], {
    cwd: dir,
    input: JSON.stringify({ hook_event_name: "Stop", stop_hook_active: false }),
    encoding: "utf8",
  });
  assert.equal(hook.status, 0, hook.stderr);
  const decision = JSON.parse(hook.stdout) as { decision?: string; reason?: string };
  assert.equal(decision.decision, "block");
  assert.match(decision.reason ?? "", /keylang\/flows\/price\.md:\d+/);
});

test("K008 warns when one undotted then word matches a declared id", (t) => {
  const dir = tempDir(t, "keylang-k008-");
  cpSync(join(root, "tests/fixtures/repo"), dir, { recursive: true });
  const flow = "# flow save\n\n- when the write fails\n  - then save\n";
  writeTree(dir, { "keylang/flows/save.md": flow });
  assert.equal(keylang(dir, ["map"]).status, 0);
  const out = keylang(dir, ["check", "--strict"]);
  assert.equal(out.status, 0, out.stdout + out.stderr);
  assert.match(out.stdout, /keylang\/flows\/save\.md:4:10: K008 `then save` is read as text, not a reference \(did you mean `then infra\.db\.save`\?\)/);
  assert.match(out.stderr, /^0 fail, /m);
  assert.equal(keylang(dir, ["check"]).status, 0);

  writeTree(dir, { "keylang/flows/link.md": "# flow link\n\n- when the write fails\n  - then [save](../map/infra.md)\n" });
  const link = keylang(dir, ["check"]);
  assert.match(link.stdout, /keylang\/flows\/link\.md:4:11: K008 `then save` is read as text/);

  writeTree(dir, { "keylang/flows/save.md": "# flow save\n\n- planned fn app.cart.save () → void\n- when the write fails\n  - then save\n" });
  const both = keylang(dir, ["check"]);
  const saveAt = both.stdout.indexOf("`then app.cart.save`");
  const infraAt = both.stdout.indexOf("`then infra.db.save`");
  assert.ok(saveAt !== -1 && infraAt !== -1 && saveAt < infraAt, both.stdout);

  writeTree(dir, { "keylang/flows/case.md": "# flow case\n\n- when the write fails\n  - then Save\n" });
  assert.doesNotMatch(keylang(dir, ["check", "keylang/flows/case.md"]).stdout, /K008/);

  const quiet = "# flow quiet\n\n- when the write fails\n  - then retry ≤ 3, backoff\n  - then infra.db.save\n  - then [infra.db.save](x.md)\n  - then nothing\n";
  writeTree(dir, { "keylang/flows/quiet.md": quiet });
  assert.doesNotMatch(keylang(dir, ["check", "keylang/flows/quiet.md"]).stdout, /K008/);

  const json = keylang(dir, ["check", "--format", "json", "keylang/flows/link.md"]);
  const row = (JSON.parse(json.stdout) as { results: { code: string | null; verdict: string }[] }).results.find((item) => item.code === "K008");
  assert.equal(row?.verdict, "warning");
  const sarif = keylang(dir, ["check", "--format", "sarif", "keylang/flows/link.md"]);
  assert.match(sarif.stdout, /"ruleId": "K008"[\s\S]*?"level": "warning"/);
  const github = keylang(dir, ["check", "--format", "github", "keylang/flows/link.md"]);
  assert.match(github.stdout, /::warning .*title=K008::/);

  const found = check([
    parse("map.md", "# map\n\n- layer infra\n  - module db\n    - fn save () → void\n"),
    parse("flow.md", "# flow f\n\n- planned fn app.cart.save () → void\n- when the write fails\n  - then save\n"),
  ]).diagnostics.filter((diag) => diag.code === "K008");
  assert.equal(found.length, 1);
  assert.equal(found[0]!.severity, "warning");
  assert.match(found[0]!.message, /`then app\.cart\.save`, `then infra\.db\.save`/);

  const explained = keylang(root, ["explain", "K008"]);
  assert.equal(explained.status, 0, explained.stderr);
  assert.match(explained.stdout, /full id/);
  assert.match(explained.stdout, /several words/);
  const parsed = keylang(dir, ["parse", "--json", "keylang/flows/save.md"]);
  assert.equal(parsed.status, 0, parsed.stderr);
  assert.doesNotMatch(parsed.stdout + parsed.stderr, /K008/);
  assert.equal(keylang(dir, ["fmt", "--check", "keylang/flows/save.md"]).status, 0);
});

// DX commands (design §7.5): pre-commit hook, shell completions, spec skeletons.

test("check --changed keeps a flow of an unchanged spec whose step is in a changed file, and drops the others", (t) => {
  const dir = tempDir(t, "keylang-changed-flow-");
  const calls = 'import { price } from "../domain/order.ts";\nexport function charge(): number {\n  return price();\n}\n';
  writeTree(dir, {
    "keylang.json": `${JSON.stringify(LAYERS)}\n`,
    "src/app/pay.ts": calls,
    "src/domain/order.ts": ORDER,
    "src/domain/stock.ts": "export function left(): number {\n  return 0;\n}\nexport function count(): number {\n  return 1;\n}\n",
    "keylang/flows/pay.md": "# flow pay\n\n- trigger app.pay.charge\n  - step domain.order.price\n",
    "keylang/flows/stock.md": "# flow stock\n\n- trigger domain.stock.left\n  - step domain.stock.count\n",
  });
  git(dir, ["init"]);
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "base"]);
  writeFileSync(join(dir, "src/app/pay.ts"), PAY);
  const full = keylang(dir, ["check"]);
  assert.match(full.stdout, /keylang\/flows\/stock\.md:4/);
  const changed = keylang(dir, ["check", "--changed"]);
  assert.equal(changed.status, 1, changed.stdout);
  assert.match(changed.stdout, /keylang\/flows\/pay\.md:4:\d+: static fail/);
  assert.doesNotMatch(changed.stdout, /flows\/stock\.md/);
});

test("hook install writes an executable pre-commit hook once, --check writes nothing, a foreign hook stays", (t) => {
  const dir = tempDir(t, "keylang-precommit-");
  writeTree(dir, { "keylang.json": `${JSON.stringify(LAYERS)}\n`, "src/app/pay.ts": PAY });
  git(dir, ["init"]);
  const hook = join(dir, ".git/hooks/pre-commit");

  const missing = keylang(dir, ["hook", "install", "--check"]);
  assert.equal(missing.status, 1, missing.stderr);
  assert.match(missing.stderr, /keylang hook install/);
  assert.equal(existsSync(hook), false);

  const first = keylang(dir, ["hook", "install"]);
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /\.git\/hooks\/pre-commit/);
  const text = readFileSync(hook, "utf8");
  assert.match(text, /^#!\/bin\/sh\n/);
  assert.match(text, new RegExp(`npx -y keylang@${VERSION.replace(/\./g, "\\.")} check --changed`));
  assert.notEqual(statSync(hook).mode & 0o111, 0);
  assert.equal(keylang(dir, ["hook", "install", "--check"]).status, 0);

  const again = keylang(dir, ["hook", "install"]);
  assert.equal(again.status, 0, again.stderr);
  assert.equal(readFileSync(hook, "utf8"), text);

  // A keylang hook of another version is rewritten in place; --check calls it stale.
  writeFileSync(hook, text.replace(`keylang@${VERSION}`, "keylang@0.0.1"));
  assert.equal(keylang(dir, ["hook", "install", "--check"]).status, 1);
  assert.equal(keylang(dir, ["hook", "install"]).status, 0);
  assert.equal(readFileSync(hook, "utf8"), text);

  // Not executable: --check fails and install restores the mode.
  chmodSync(hook, 0o644);
  assert.equal(keylang(dir, ["hook", "install", "--check"]).status, 1);
  assert.equal(keylang(dir, ["hook", "install"]).status, 0);
  assert.notEqual(statSync(hook).mode & 0o111, 0);

  const foreign = "#!/bin/sh\nnpm run lint\n";
  writeFileSync(hook, foreign);
  const refused = keylang(dir, ["hook", "install"]);
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /pre-commit/);
  assert.match(refused.stderr, /check --changed/);
  assert.equal(readFileSync(hook, "utf8"), foreign);
  assert.equal(keylang(dir, ["hook", "install", "--check"]).status, 1);
  assert.equal(readFileSync(hook, "utf8"), foreign);
});

test("hook install follows core.hooksPath and needs a git repository", (t) => {
  const dir = tempDir(t, "keylang-hookspath-");
  git(dir, ["init"]);
  git(dir, ["config", "core.hooksPath", ".githooks"]);
  const o = keylang(dir, ["hook", "install"]);
  assert.equal(o.status, 0, o.stderr);
  assert.ok(existsSync(join(dir, ".githooks/pre-commit")));
  assert.equal(existsSync(join(dir, ".git/hooks/pre-commit")), false);

  const bare = tempDir(t, "keylang-hook-nogit-");
  const none = keylang(bare, ["hook", "install"]);
  assert.equal(none.status, 2);
  assert.match(none.stderr, /git/);
  assert.equal(keylang(bare, ["hook", "nope"]).status, 2);
});

test("completions print a script for bash, zsh and fish with every command and flag", () => {
  const help = keylang(root, ["--help"]).stdout;
  for (const shell of ["bash", "zsh", "fish"]) {
    const o = keylang(root, ["completions", shell]);
    assert.equal(o.status, 0, o.stderr);
    assert.equal(o.stderr, "");
    for (const word of ["check", "map", "hook", "install", "completions", "new", "module", "draft", "code-to-spec", "--changed", "--layer", "--format"]) {
      // fish names a long flag `-l changed`.
      const shown = shell === "fish" && word.startsWith("--") ? `-l ${word.slice(2)}` : word;
      assert.match(o.stdout, new RegExp(`(^|[\\s'"(])${shown.replace(/-/g, "\\-")}([\\s'");]|$)`, "m"), `${shell}: ${word}`);
      assert.ok(help.includes(word), `--help lists ${word}`);
    }
  }
  const bash = spawnSync("bash", ["-n"], { input: keylang(root, ["completions", "bash"]).stdout, encoding: "utf8" });
  if (!bash.error) assert.equal(bash.status, 0, bash.stderr);

  const unknown = keylang(root, ["completions", "tcsh"]);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /bash, zsh, fish/);
  assert.equal(keylang(root, ["completions"]).status, 2);
});

test("new flow and new module write a skeleton that check accepts and never overwrite", (t) => {
  const dir = tempDir(t, "keylang-new-");
  writeTree(dir, { "keylang.json": `${JSON.stringify(LAYERS)}\n`, "src/app/pay.ts": PAY, "src/domain/order.ts": ORDER });

  const flow = keylang(dir, ["new", "flow", "refund"]);
  assert.equal(flow.status, 0, flow.stderr);
  assert.match(flow.stdout, /keylang\/flows\/refund\.md/);
  const flowText = readFileSync(join(dir, "keylang/flows/refund.md"), "utf8");
  assert.match(flowText, /^# flow refund\n/);

  const module = keylang(dir, ["new", "module", "payments", "--layer", "app"]);
  assert.equal(module.status, 0, module.stderr);
  assert.match(module.stdout, /keylang\/features\/payments\.md/);
  const moduleText = readFileSync(join(dir, "keylang/features/payments.md"), "utf8");
  assert.match(moduleText, /^# flow payments\n\nA feature file: .*`keylang feature payments` says what is still missing\. .*`- trigger` and `- step`.*\n\n- planned module app\.payments\n$/);
  // The explanatory paragraph is prose only: check and feature see the same file without it.
  const withNote = [keylang(dir, ["check", "keylang/features/payments.md"]), keylang(dir, ["feature", "payments"])];
  writeFileSync(join(dir, "keylang/features/payments.md"), "# flow payments\n\n- planned module app.payments\n");
  const withoutNote = [keylang(dir, ["check", "keylang/features/payments.md"]), keylang(dir, ["feature", "payments"])];
  writeFileSync(join(dir, "keylang/features/payments.md"), moduleText);
  const outcome = (runs: typeof withNote) =>
    runs.map((run) => ({ status: run.status, stdout: run.stdout.replace(/payments\.md:\d+:/g, "payments.md:N:"), stderr: run.stderr }));
  assert.deepEqual(outcome(withNote), outcome(withoutNote));
  assert.match(withNote[1]!.stdout, /planned `app\.payments` is not implemented/);

  const checked = keylang(dir, ["check"]);
  assert.equal(checked.status, 0, checked.stdout);
  assert.doesNotMatch(checked.stdout, /K\d{3}/);
  assert.equal(keylang(dir, ["fmt", "--check", "keylang/flows/refund.md", "keylang/features/payments.md"]).status, 0);

  const before = treeBytes(dir);
  const twice = keylang(dir, ["new", "flow", "refund"]);
  assert.equal(twice.status, 2);
  assert.match(twice.stderr, /exists/);
  assert.equal(keylang(dir, ["new", "module", "payments", "--layer", "app"]).status, 2);
  const badLayer = keylang(dir, ["new", "module", "billing", "--layer", "infra"]);
  assert.equal(badLayer.status, 2);
  assert.match(badLayer.stderr, /infra/);
  assert.match(badLayer.stderr, /app, domain/);
  assert.equal(keylang(dir, ["new", "module", "billing"]).status, 2);
  assert.equal(keylang(dir, ["new", "flow", "bad name"]).status, 2);
  assert.equal(keylang(dir, ["new", "flow"]).status, 2);
  assert.equal(keylang(dir, ["new", "thing", "x"]).status, 2);
  assert.deepEqual(treeBytes(dir), before);
});

