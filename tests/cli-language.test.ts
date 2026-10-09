// The language through the CLI, on examples and fixtures: `check` of specs
// without code and its diagnostics, `parse --json`, references written as
// Markdown links, `fmt`, and the K008 warning on a bare `then` word.

import assert from "node:assert/strict";
import { chmodSync, copyFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { check, parse } from "../src/index.ts";
import { keylang, root, tempDir, writeTree } from "./cli-helpers.ts";

test("check shop reports the dangling slide reference", () => {
  const o = keylang(root, ["check", "examples/shop"]);
  assert.equal(o.status, 1);
  assert.match(o.stdout, /examples\/shop\/map\.md:27:13: K001 dangling reference `domain\.aggregate` \(did you mean `domain\.orderAggregate`\?\)/);
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

// `planned` is a top-level declaration, not a modifier of `step`/`trigger`:
// K005 sits on the word and says how to write it; other arities keep the old text.
test("K005 on `step planned <id>` points at the `planned` declaration", (t) => {
  const dir = tempDir(t, "keylang-step-planned-");
  const flow = "# flow p\n\n- trigger planned a.b.c\n- step a.b.d\n  - step planned a.b.e\n- step a.b c\n- step planned type a.b.f\n";
  writeTree(dir, { "keylang/flows/p.md": flow });
  const hint = (id: string, keyword = "step", kind = "fn"): string =>
    `K005 \`planned\` is a declaration, not a ${keyword} modifier: add \`- planned ${kind} ${id}\` at the top of the flow and keep \`- ${keyword} ${id}\``;
  const o = keylang(dir, ["check", "keylang/flows/p.md"]);
  assert.equal(o.status, 1, o.stdout + o.stderr);
  const k005 = o.stdout.split("\n").filter((line) => line.includes("K005"));
  assert.deepEqual(k005, [
    `keylang/flows/p.md:3:11: ${hint("a.b.c", "trigger")}`,
    `keylang/flows/p.md:5:10: ${hint("a.b.e")}`,
    "keylang/flows/p.md:6:12: K005 expected a single ID",
    `keylang/flows/p.md:7:8: ${hint("a.b.f", "step", "type")}`,
  ]);
  const json = JSON.parse(keylang(dir, ["check", "--format", "json", "keylang/flows/p.md"]).stdout) as { results: { line: number; code: string | null; evidence: string; reason?: string }[] };
  const row = json.results.find((r) => r.code === "K005" && r.line === 5);
  assert.equal(row?.evidence, hint("a.b.e").slice("K005 ".length));
  assert.equal(row?.reason, "arguments");
  const parsed = keylang(dir, ["parse", "--json", "keylang/flows/p.md"]);
  const diag = (JSON.parse(parsed.stdout) as { diagnostics: { message: string; reason?: string; span: { start: { line: number; col: number } } }[] }[])[0]!.diagnostics.find((d) => d.span.start.line === 3);
  assert.equal(diag?.message, hint("a.b.c", "trigger").slice("K005 ".length));
  assert.equal(diag?.span.start.col, 11);
  assert.equal(diag?.reason, "arguments");
});

test("deferred flow properties and a query rule stay K004, and help has no migrate", (t) => {
  const dir = tempDir(t, "keylang-deferred-");
  writeTree(dir, {
    "keylang/flows/pay.md": "# flow pay\n\n- never app.pay.charge\n- at-most 1 app.pay.charge\n- never app.pay.save before app.pay.charge\n",
    "keylang/rules.md": "# rules\n\n- query depends(X, Y)\n",
  });
  const flowWords = "kind, trigger, continues, step, parallel, reads, emits, calls, invariant, when, after, every, test, planned";
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
  // The example map is hand-written; a map `keylang map` wrote carries its marker.
  assert.equal(map.generated, null);
  const generated = JSON.parse(keylang(root, ["parse", "--json", "keylang/map/lang.md"]).stdout);
  assert.ok(generated[0].generated.startsWith("<!-- keylang:generated"));
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

test("parse names a spec it cannot read on stderr and exits 2, as fmt and check do; the readable files are still parsed", { skip: process.getuid?.() === 0 ? "root reads any file" : false }, (t) => {
  const dir = tempDir(t, "keylang-parse-unreadable-");
  writeTree(dir, { "keylang/a.md": "# rules\n\n- deny a b\n", "keylang/b.md": "# flow x\n\n- step y.z\n" });
  chmodSync(join(dir, "keylang/b.md"), 0o000);
  const tree = keylang(dir, ["parse", "keylang"]);
  assert.equal(tree.status, 2, tree.stdout + tree.stderr);
  assert.match(tree.stderr, /^keylang: keylang\/b\.md: cannot read: EACCES/m);
  assert.match(tree.stdout, /deny/, "a.md is parsed");
  const json = keylang(dir, ["parse", "--json", "keylang/b.md"]);
  assert.equal(json.status, 2);
  assert.match(json.stderr, /keylang\/b\.md: cannot read: EACCES/);
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
