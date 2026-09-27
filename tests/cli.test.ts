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
// mistakes are reported (misplaced `options`, `domain.aggregate`); since M1
// the broken link also leaves `domain.orderAggregate` unreachable (K103).
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
  assert.equal(index.schema, 2);
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
  assert.match(local.reason, /shadowed by parameter/);
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
  assert.equal(index.schema, 2);
  assert.match(index.snapshotId, /^[0-9a-f]{64}$/);
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
});

test("explain covers every diagnostic code", () => {
  for (const code of ["K001", "K002", "K003", "K004", "K005", "K006", "K101", "K102", "K103", "K104", "K105"]) {
    const explained = keylang(root, ["explain", code]);
    assert.equal(explained.status, 0, explained.stderr);
    assert.match(explained.stdout, /example:/);
    assert.match(explained.stdout, /fix:/);
  }
  assert.match(keylang(root, ["explain", "K001"]).stdout, /planned/);
  assert.equal(keylang(root, ["explain", "NOPE"]).status, 2);
});

test("planned id is unverified and an unknown id stays K001", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.equal(keylang(dir, ["map"]).status, 0);
  mkdirSync(join(dir, "keylang/flows"), { recursive: true });
  writeFileSync(join(dir, "keylang/flows/later.md"), "# flow later\n\n- planned fn domain.order.refund (order: Order) → Promise<void>\n- step domain.order.refund\n");
  const planned = keylang(dir, ["check"]);
  assert.doesNotMatch(planned.stdout, /K001 dangling reference `domain\.order\.refund`/);
  assert.match(planned.stdout, /planned/);
  writeFileSync(join(dir, "keylang/flows/later.md"), "# flow later\n\n- step domain.order.refund\n");
  const missing = keylang(dir, ["check"]);
  assert.equal(missing.status, 1);
  const k001 = missing.stdout.split("\n").filter((line) => /K001 dangling reference `domain\.order\.refund`/.test(line));
  assert.equal(k001.length, 1, missing.stdout);
  assert.match(missing.stderr, /^1 fail,/m);
  assert.match(missing.stdout, /planned/);
});

test("an incomplete trace is unverified and a finished trace can fail a missing step", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.equal(keylang(dir, ["map"]).status, 0);
  const snapshot = JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")).snapshotId as string;
  mkdirSync(join(dir, "keylang/flows"), { recursive: true });
  mkdirSync(join(dir, "keylang/trace"), { recursive: true });
  writeFileSync(join(dir, "keylang/flows/pay.md"), "# flow pay\n\n- trigger domain.order.total\n  - step domain.order.createOrder\n");
  writeFileSync(join(dir, "keylang/trace/pay.jsonl"), `${JSON.stringify({ flow: "pay", symbolId: "domain.order.total", event: "start", snapshotId: "other" })}\n{"event":"meta","complete":true,"dropped":0}\n`);
  const cfg = JSON.parse(readFileSync(join(dir, "keylang.json"), "utf8"));
  cfg.check = { trace: "keylang/trace/pay.jsonl" };
  writeFileSync(join(dir, "keylang.json"), `${JSON.stringify(cfg, null, 2)}\n`);
  const stale = keylang(dir, ["check"]);
  assert.match(stale.stdout, /stale trace/);
  writeFileSync(
    join(dir, "keylang/trace/pay.jsonl"),
    `${JSON.stringify({ flow: "pay", symbolId: "domain.order.total", event: "start", snapshotId: snapshot })}\n{"event":"meta","complete":true,"dropped":1}\n`,
  );
  const partial = keylang(dir, ["check"]);
  assert.match(partial.stdout, /incomplete trace|unverified/);
  writeFileSync(
    join(dir, "keylang/trace/pay.jsonl"),
    `${JSON.stringify({ flow: "pay", symbolId: "domain.order.total", event: "start", snapshotId: snapshot })}\n{"event":"meta","complete":true,"dropped":0}\n`,
  );
  const missing = keylang(dir, ["check"]);
  assert.match(missing.stdout, /trace fail missing step/);
});

test("the in-repo check flow reports separate evidence", () => {
  const checked = keylang(root, ["check"]);
  assert.match(checked.stdout, /ID ok/);
  assert.match(checked.stdout, /static ok/);
  assert.match(checked.stdout, /tests ok/);
  assert.match(checked.stdout, /trace ok/);
  const summary = /(\d+) fail, (\d+) unverified, (\d+) ok/.exec(checked.stderr);
  assert.ok(summary);
  const unverifiedLines = checked.stdout.split("\n").filter((line) => /: unverified /.test(line) || / unverified /.test(line));
  const okLines = checked.stdout.split("\n").filter((line) => / ID ok | static ok | tests ok | trace ok /.test(line));
  assert.equal(Number(summary[2]), unverifiedLines.length);
  assert.ok(okLines.length > 0);
  assert.ok(Number(summary[3]) >= okLines.length);
  const again = keylang(root, ["check"]);
  assert.equal(again.status, checked.status);
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

test("json includes a trace fail", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.equal(keylang(dir, ["map"]).status, 0);
  const snapshot = JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")).snapshotId as string;
  mkdirSync(join(dir, "keylang/flows"), { recursive: true });
  mkdirSync(join(dir, "keylang/trace"), { recursive: true });
  writeFileSync(join(dir, "keylang/flows/pay.md"), "# flow pay\n\n- trigger domain.order.total\n  - step domain.order.createOrder\n");
  writeFileSync(join(dir, "keylang/trace/pay.jsonl"), `${JSON.stringify({ flow: "pay", symbolId: "domain.order.total", event: "start", snapshotId: snapshot })}\n{"event":"meta","complete":true,"dropped":0}\n`);
  const cfg = JSON.parse(readFileSync(join(dir, "keylang.json"), "utf8"));
  cfg.check = { trace: "keylang/trace/pay.jsonl" };
  writeFileSync(join(dir, "keylang.json"), `${JSON.stringify(cfg, null, 2)}\n`);
  const json = keylang(dir, ["check", "--format", "json"]);
  assert.equal(json.status, 1, json.stderr);
  const body = JSON.parse(json.stdout) as { results: { verdict: string; evidence: string }[] };
  assert.ok(body.results.some((row) => row.verdict === "fail" && row.evidence.includes("trace fail")));
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
  const report = JSON.parse(sarif.stdout);
  assert.equal(report.version, "2.1.0");
  assert.equal(report.runs[0].tool.driver.name, "keylang");
  assert.match(github.stdout, /::error /);
  const bad = keylang(dir, ["check", "--format", "xml"]);
  assert.equal(bad.status, 2);
});
