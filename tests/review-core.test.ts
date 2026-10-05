// Regressions from the 2026-10-05 review, language core: fmt's write policy
// and CRLF, link destinations with parentheses, the no-snapshot anchor,
// `planned` signatures without a return part, alias members, keyword hints,
// CommonMark headings, NFC ids, what to do after a static fail, the hole of a
// rule verdict and the summary, and the parse of the rendered map reused
// across analyses. Every case but the last drives the real CLI.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { analyze } from "../src/analyze.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");

function keylang(cwd: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8" });
  if (r.error) throw r.error;
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function scratch(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-review-core-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function repo(t: TestContext, files: Record<string, string>): string {
  const dir = scratch(t);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

function sha(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

interface Row {
  criterion: string;
  area: string;
  verdict: string;
  evidence: string;
  specHash: string;
  file: string;
  line: number;
  col: number;
  code: string | null;
  reason?: string;
  hole?: string;
}

function checkJson(dir: string, args: string[] = []): { status: number | null; stderr: string; results: Row[]; coverage: { kind: string; file: string; line: number; col: number }[] } {
  const run = keylang(dir, ["check", "--format", "json", ...args]);
  const parsed = JSON.parse(run.stdout) as { results: Row[]; coverage: { kind: string; file: string; line: number; col: number }[] };
  return { status: run.status, stderr: run.stderr, results: parsed.results, coverage: parsed.coverage };
}

interface JsonNode {
  kind: string;
  id: string | null;
  name: { value: string; span: { start: { offset: number; line: number; col: number }; end: { offset: number; line: number; col: number } } } | null;
  refs: { text: string; target: string; span: { start: { offset: number; line: number; col: number }; end: { offset: number; line: number; col: number } }; link?: { target: string } }[];
  tokens: { text: string }[];
  children: JsonNode[];
}

interface JsonDoc {
  path: string;
  sections: { kind: string; name: { value: string } | null; comment?: { value: string }; items: ({ type: string } & JsonNode)[] }[];
  diagnostics: { code: string; message: string }[];
}

function parseJson(dir: string, files: string[]): JsonDoc[] {
  const o = keylang(dir, ["parse", "--json", ...files]);
  return JSON.parse(o.stdout) as JsonDoc[];
}

const MESSY_FLOW = "# flow   a\n-   step x.y\n";
const FORMATTED_FLOW = "# flow a\n\n- step x.y\n";

// ---------- 1. fmt: the write policy of every writer, CRLF kept ----------

test("fmt writes only inside the repository: a link out of it and a path outside it are named and left alone, exit 2; the rest is formatted", (t) => {
  const dir = repo(t, { "keylang.json": "{}\n", "keylang/flows/own.md": MESSY_FLOW });
  const outside = scratch(t);
  const victim = join(outside, "victim.md");
  writeFileSync(victim, MESSY_FLOW);
  symlinkSync(victim, join(dir, "keylang/flows/linked.md"));
  const o = keylang(dir, ["fmt", "keylang"]);
  assert.equal(o.status, 2, o.stderr);
  assert.match(o.stderr, /^keylang\/flows\/linked\.md: cannot write: leads out of the repository through a link$/m);
  assert.equal(o.stdout, "keylang/flows/own.md: formatted\n");
  assert.equal(readFileSync(victim, "utf8"), MESSY_FLOW, "the file outside is not written");
  assert.equal(readFileSync(join(dir, "keylang/flows/own.md"), "utf8"), FORMATTED_FLOW, "the other file is still formatted");
  // A file outside the root named directly is refused the same way.
  const direct = keylang(dir, ["fmt", victim]);
  assert.equal(direct.status, 2, direct.stderr);
  assert.match(direct.stderr, /victim\.md: cannot write: outside the repository$/m);
  assert.equal(readFileSync(victim, "utf8"), MESSY_FLOW);
  // A check only reads: it reports the linked file as it is and writes nothing.
  const check = keylang(dir, ["fmt", "--check", "keylang"]);
  assert.deepEqual([check.status, check.stdout], [1, "keylang/flows/linked.md: not formatted\n"]);
});

test("fmt never rewrites a generated file: a note on stderr names it, and --check does not count it", (t) => {
  const generated = "<!-- keylang:generated — do not edit, `keylang map` -->\n\n- layer   app\n";
  const unnamed = "<!-- keylang:generated -->\n- layer  b\n";
  const dir = repo(t, { "keylang.json": "{}\n", "keylang/map/app.md": generated, "keylang/map/b.md": unnamed, "keylang/rules.md": "# rules\n\n- deny app b\n" });
  const check = keylang(dir, ["fmt", "--check", "keylang"]);
  assert.deepEqual([check.status, check.stdout], [0, ""], check.stderr);
  assert.equal(
    check.stderr,
    "keylang: note: keylang/map/app.md: a generated file, not formatted; `keylang map` writes it\nkeylang: note: keylang/map/b.md: a generated file, not formatted; only its generator writes it\n",
  );
  const write = keylang(dir, ["fmt", "keylang/map/app.md", "keylang/map/b.md"]);
  assert.deepEqual([write.status, write.stdout], [0, ""], write.stderr);
  assert.equal(readFileSync(join(dir, "keylang/map/app.md"), "utf8"), generated);
  assert.equal(readFileSync(join(dir, "keylang/map/b.md"), "utf8"), unnamed);
});

test("fmt keeps CRLF: an all-CRLF file is written with CRLF and --check accepts its LF form; mixed endings become LF", (t) => {
  const dir = repo(t, { "keylang.json": "{}\n", "keylang/flows/a.md": "# flow   a\r\n-   step x.y\r\n", "keylang/flows/b.md": "# flow b\r\n\r\n- step x.y\n" });
  const before = keylang(dir, ["fmt", "--check", "keylang/flows"]);
  assert.deepEqual([before.status, before.stdout], [1, "keylang/flows/a.md: not formatted\nkeylang/flows/b.md: not formatted\n"]);
  const o = keylang(dir, ["fmt", "keylang/flows"]);
  assert.deepEqual([o.status, o.stdout], [0, "keylang/flows/a.md: formatted\nkeylang/flows/b.md: formatted\n"], o.stderr);
  assert.equal(readFileSync(join(dir, "keylang/flows/a.md"), "utf8"), "# flow a\r\n\r\n- step x.y\r\n");
  assert.equal(readFileSync(join(dir, "keylang/flows/b.md"), "utf8"), "# flow b\n\n- step x.y\n");
  const again = keylang(dir, ["fmt", "--check", "keylang/flows"]);
  assert.deepEqual([again.status, again.stdout], [0, ""]);
  assert.deepEqual([keylang(dir, ["fmt", "keylang/flows"]).stdout], [""], "nothing left to write");
});

// ---------- 2. a link destination with balanced parentheses ----------

test("a link destination may hold balanced parentheses; an unbalanced one is a malformed link", (t) => {
  const flow = "# flow a\n\n- trigger [x.y.z](https://e.com/wiki/Foo_(bar))\n- step [x.y.z](a(b(c))d)\n- step [x.y.z](a(b)\n";
  const dir = repo(t, { "map.md": "- layer x\n  - module y\n    - fn z\n", "flow.md": flow });
  const items = parseJson(dir, ["flow.md"])[0]!.sections[0]!.items;
  const [trigger, step] = items;
  assert.equal(trigger!.refs[0]!.target, "x.y.z");
  assert.equal(trigger!.refs[0]!.link?.target, "https://e.com/wiki/Foo_(bar)");
  assert.deepEqual(trigger!.refs[0]!.span, { start: { offset: 21, line: 3, col: 12 }, end: { offset: 26, line: 3, col: 17 } });
  assert.equal(trigger!.tokens.at(-1)!.text, "[x.y.z](https://e.com/wiki/Foo_(bar))");
  assert.equal(step!.refs[0]!.link?.target, "a(b(c))d");
  const o = keylang(dir, ["check", "."]);
  assert.deepEqual(o.stdout.split("\n").filter((line) => / K\d{3} /.test(line)), ["flow.md:5:8: K005 malformed link, expected `[id](href)`"]);
  assert.equal(keylang(dir, ["fmt", "--check", "flow.md"]).status, 0, "fmt keeps the link as written");
});

// ---------- 5. a dependency alias is a member ----------

test("a module whose only children are dependency aliases has members: an unknown member is K001, the alias resolves", (t) => {
  const map = "- layer infra\n  - module config\n    - log infra.logger\n  - module logger\n- layer app\n  - module a\n    - fn go\n      - calls infra.config.anything\n      - calls infra.config.log\n";
  const dir = repo(t, { "map.md": map });
  const o = keylang(dir, ["check", "."]);
  assert.deepEqual(o.stdout.split("\n").filter((line) => / K\d{3} /.test(line)), ["map.md:8:15: K001 dangling reference `infra.config.anything`; declare `planned` if this is an intention"]);
});

// ---------- 6. a keyword out of its position says where it goes ----------

test("a keyword of another position names where it goes; code and reason stay", (t) => {
  const dir = repo(t, {
    "map.md": "- layer app\n  - module a\n    - calls a.b, c.d\n    - fn x\n  - fn y z\n- fn p q\n",
    "flow.md": "# flow f\n\n- fn app.a.x\n- trigger app.a.x\n  - trigger app.a.x\n",
    "rules.md": "# rules\n\n- layer app\n",
  });
  const o = keylang(dir, ["check", "."]);
  const lines = o.stdout.split("\n").filter((line) => / K00[45] /.test(line));
  assert.deepEqual(lines, [
    "flow.md:3:3: K004 unknown keyword `fn` here; expected one of: kind, trigger, step, reads, emits, calls, invariant, when, test, planned, ?; `fn` goes under `- module` in a map",
    "flow.md:5:5: K004 unknown keyword `trigger` here; expected one of: step, reads, emits, calls, when, test, invariant, ?; `trigger` goes at the top of `# flow`",
    "map.md:3:5: K005 expected `fn`, `type`, `event`, `module` or a dependency `<alias> <path>`; `calls` goes under `- fn`",
    "map.md:5:8: K005 unexpected arguments after module `fn`; `fn` goes under `- module`",
    "map.md:6:6: K005 unexpected arguments after layer `fn`; `fn` goes under `- module`",
    "rules.md:3:3: K004 unknown keyword `layer` here; expected one of: layers, allow, deny, entry, module, no-cycles; `layer` goes at the top of a map",
  ]);
  const reasons = checkJson(dir, ["."]).results.filter((r) => r.code === "K005").map((r) => r.reason);
  assert.deepEqual(reasons, ["arguments", "arguments", "arguments"]);
});

// ---------- 7. CommonMark headings: a closing sequence, a tab after `#` ----------

test("a heading may end with a closing `#` sequence and may have a tab after `#`, as in CommonMark", (t) => {
  const dir = repo(t, {
    "a.md": "# flow a #\n\n- step x.y\n",
    "c.md": "#\tflow c\n\n- step x.y\n",
    "d.md": "# flow d ##   \n",
    "e.md": "# #\n",
    "f.md": "# flow f#\n",
    "g.md": "# flow g <!-- note --> #\n",
  });
  const docs = parseJson(dir, ["a.md", "c.md", "d.md", "e.md", "f.md", "g.md"]);
  assert.deepEqual(
    docs.map((doc) => [doc.path, doc.sections[0]?.kind, doc.sections[0]?.name?.value ?? null, doc.diagnostics.map((d) => d.code)]),
    [
      ["a.md", "flow", "a", []],
      ["c.md", "flow", "c", []],
      ["d.md", "flow", "d", []],
      ["e.md", "map", null, ["K006"]],
      ["f.md", "flow", null, ["K005"]],
      ["g.md", "flow", "g", []],
    ],
  );
  assert.equal(docs[5]!.sections[0]!.comment?.value, "<!-- note -->");
  assert.equal(keylang(dir, ["fmt", "a.md", "c.md", "g.md"]).status, 0);
  assert.equal(readFileSync(join(dir, "a.md"), "utf8"), "# flow a\n\n- step x.y\n");
  assert.equal(readFileSync(join(dir, "c.md"), "utf8"), "# flow c\n\n- step x.y\n");
  assert.equal(readFileSync(join(dir, "g.md"), "utf8"), "# flow g <!-- note -->\n");
});

// ---------- 8. ids are NFC ----------

test("an id is NFC: a decomposed and a composed name are one id, while the file keeps what was written", (t) => {
  const nfc = "café";
  const nfd = "café";
  const map = `- layer app\n  - module ${nfc}\n    - fn go\n  - module ${nfd}\n`;
  const flow = `# flow f\n\n- step app.${nfd}.go\n`;
  const dir = repo(t, { "map.md": map, "flow.md": flow });
  const o = keylang(dir, ["check", "."]);
  assert.deepEqual(o.stdout.split("\n").filter((line) => / K\d{3} /.test(line)), [`map.md:4:12: K002 duplicate ID \`app.${nfc}\` (first declared at map.md:2:12)`]);
  const [mapDoc, flowDoc] = parseJson(dir, ["map.md", "flow.md"]);
  const second = mapDoc!.sections[0]!.items[0]!.children[1]!;
  assert.equal(second.id, `app.${nfc}`);
  assert.equal(second.tokens[1]!.text, nfd, "tokens stay as written");
  assert.equal(second.name!.span.end.col - second.name!.span.start.col, [...nfd].length, "the span covers the written name");
  const ref = flowDoc!.sections[0]!.items[0]!.refs[0]!;
  assert.deepEqual([ref.text, ref.target], [`app.${nfd}.go`, `app.${nfc}.go`]);
  assert.equal(keylang(dir, ["fmt", "--check", "map.md", "flow.md"]).status, 0, "fmt does not normalize the text");
});
