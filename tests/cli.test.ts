// End-to-end tests: run the `keylang` CLI on examples and fixtures.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, copyFileSync, cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
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
  assert.equal(
    o.stdout,
    "examples/shop/map.md:27:13: K001 dangling reference `domain.aggregate` (did you mean `domain.orderAggregate`?)\n",
  );
  assert.equal(o.stderr, "3 file(s): 1 error(s), 0 warning(s)\n");
});

test("check shop-fixed is clean", () => {
  const o = keylang(root, ["check", "examples/shop-fixed"]);
  assert.equal(o.status, 0, o.stdout);
  assert.equal(o.stdout, "");
});

// M0 criterion: the Markdown from the slides, verbatim, parses; both slide
// mistakes are reported (misplaced `options`, `domain.aggregate`); since M1
// the broken link also leaves `domain.orderAggregate` unreachable (K103).
test("check verbatim slide", () => {
  const o = keylang(root, ["check", "tests/fixtures/slide"]);
  assert.equal(o.status, 1);
  assert.match(o.stdout, /slide\.md:12:11: K005 unexpected arguments after layer `options`/);
  assert.match(o.stdout, /slide\.md:15:13: K001 dangling reference `domain\.aggregate`/);
  assert.match(o.stdout, /slide\.md:2:5: K103 absence: module `domain\.orderAggregate`/);
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
  assert.equal(index.version, 1);
  assert.deepEqual(index.nodes["domain.order.createOrder"].callers, ["app.checkout.checkout"]);
  assert.equal(keylang(dir, ["map", "--check"]).status, 0);
  assert.equal(keylang(dir, ["check"]).status, 0);
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
  assert.equal(
    o.stdout,
    [
      "keylang/map/domain.md:7:10: K102 divergence: `domain.order` depends on `infra.db`, which is denied by `deny`",
      "keylang/map/domain.md:8:16: K101 divergence: `domain.order` depends on `app.checkout` (layers say `domain < app`, dependencies must point down)",
      "keylang/rules.md:8:1: K105 divergence: dependency cycle app.checkout → domain.order → app.checkout",
      "",
    ].join("\n"),
  );
});
