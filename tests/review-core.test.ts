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
