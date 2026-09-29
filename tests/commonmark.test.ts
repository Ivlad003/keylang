// List structure against CommonMark. mdast-util-from-markdown is CommonMark only:
// no GFM. Hypothesis: GFM (tables, task lists, tagfilter) does not change the
// block structure of lists, fences, or HTML blocks, so this projection is the
// one a person sees on GitHub for those constructs.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { fromMarkdown } from "mdast-util-from-markdown";
import type { Nodes } from "mdast";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");
const corpus = ["keylang", "examples", "tests/fixtures"];

/** Mismatches that exist before `fmt` and that `fmt` removes. The post-fmt list is empty. */
const allowBefore = new Set([
  "tests/fixtures/commonmark/lazy.md:4:owner",
  "tests/fixtures/commonmark/details.md:5:item",
  // Р9: an indented fence is inside the item for CommonMark and outside it for keylang, until fmt.
  "tests/fixtures/commonmark/fence-indent.md:5:owner",
  "tests/fixtures/commonmark/fence-indent.md:6:owner",
  "tests/fixtures/commonmark/fence-indent.md:7:owner",
]);

interface Reading {
  items: Map<number, { depth: number; parent: number | null }>;
  /** Owner item line of each non-empty source line; null means nobody. */
  owner: Map<number, number | null>;
}

function keylang(cwd: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw r.error;
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function posix(path: string): string {
  return path.split("\\").join("/");
}

interface KlNode {
  type: "node";
  span: { start: { line: number } };
  description: { value: string; span: { start: { line: number } } }[];
  children: KlNode[];
}
interface KlDoc {
  path: string;
  diagnostics: { code: string }[];
  sections: { kind: string; items: ({ type: "prose" | "code"; lines: string[] } | KlNode)[] }[];
}

function projectKeylang(doc: KlDoc, text: string): Reading {
  const items: Reading["items"] = new Map();
  const owner: Reading["owner"] = new Map();
  const walk = (node: KlNode, depth: number, parent: number | null): void => {
    const line = node.span.start.line;
    items.set(line, { depth, parent });
    owner.set(line, line);
    for (const d of node.description) {
      if (d.value.trim() !== "") owner.set(d.span.start.line, line);
    }
    for (const child of node.children) walk(child, depth + 1, line);
  };
  for (const section of doc.sections) {
    for (const item of section.items) if (item.type === "node") walk(item, 0, null);
  }
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.trim() === "") continue;
    const lineNo = i + 1;
    if (!owner.has(lineNo)) owner.set(lineNo, null);
  }
  return { items, owner };
}

function projectMdast(text: string): Reading {
  const tree = fromMarkdown(text);
  const items: Reading["items"] = new Map();
  const ranges: { line: number; start: number; end: number; depth: number }[] = [];
  const walk = (node: Nodes, blocked: boolean, depth: number, parentLine: number | null): void => {
    if (node.type === "blockquote") {
      for (const child of node.children) walk(child, true, depth, parentLine);
      return;
    }
    if (node.type === "list") {
      for (const child of node.children) walk(child, blocked || node.ordered === true, depth, parentLine);
      return;
    }
    if (node.type === "listItem") {
      const start = node.position?.start.line;
      const end = node.position?.end.line;
      if (!blocked && start !== undefined && end !== undefined) {
        items.set(start, { depth, parent: parentLine });
        ranges.push({ line: start, start, end, depth });
        for (const child of node.children) walk(child, false, depth + 1, start);
      } else {
        for (const child of node.children) walk(child, true, depth, parentLine);
      }
      return;
    }
    if ("children" in node) {
      for (const child of node.children) walk(child, blocked, depth, parentLine);
    }
  };
  walk(tree, false, 0, null);
  const owner: Reading["owner"] = new Map();
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.trim() === "") continue;
    const lineNo = i + 1;
    const hit = ranges.filter((r) => lineNo >= r.start && lineNo <= r.end).sort((a, b) => b.depth - a.depth || a.line - b.line);
    owner.set(lineNo, hit[0]?.line ?? null);
  }
  return { items, owner };
}

function describe(reading: Reading, line: number): string {
  const item = reading.items.get(line);
  const itemText = item ? `item depth=${item.depth} parent=${item.parent ?? "-"}` : "no item";
  const owner = reading.owner.get(line);
  const ownerText = owner === undefined ? "no line" : `owner=${owner ?? "-"}`;
  return `${itemText}, ${ownerText}`;
}

function mismatches(rel: string, text: string, doc: KlDoc): { id: string; detail: string }[] {
  const kl = projectKeylang(doc, text);
  const md = projectMdast(text);
  const out: { id: string; detail: string }[] = [];
  const itemLines = new Set<number>([...kl.items.keys(), ...md.items.keys()]);
  const itemMismatch = new Set<number>();
  for (const line of [...itemLines].sort((a, b) => a - b)) {
    const a = kl.items.get(line);
    const b = md.items.get(line);
    const same = a !== undefined && b !== undefined && a.depth === b.depth && a.parent === b.parent;
    if (!same) {
      itemMismatch.add(line);
      const source = text.split(/\r?\n/)[line - 1] ?? "";
      out.push({
        id: `${rel}:${line}:item`,
        detail: `${rel}:${line}:item\n  source: ${JSON.stringify(source)}\n  keylang: ${describe(kl, line)}\n  mdast:   ${describe(md, line)}`,
      });
    }
  }
  const textLines = new Set<number>([...kl.owner.keys(), ...md.owner.keys()]);
  for (const line of [...textLines].sort((a, b) => a - b)) {
    if (itemMismatch.has(line)) continue;
    if ((kl.owner.get(line) ?? null) === (md.owner.get(line) ?? null)) continue;
    const source = text.split(/\r?\n/)[line - 1] ?? "";
    out.push({
      id: `${rel}:${line}:owner`,
      detail: `${rel}:${line}:owner\n  source: ${JSON.stringify(source)}\n  keylang: ${describe(kl, line)}\n  mdast:   ${describe(md, line)}`,
    });
  }
  return out;
}

function parseDir(cwd: string, dir: string): KlDoc[] {
  const o = keylang(cwd, ["parse", "--json", dir]);
  assert.ok(o.stdout.startsWith("["), o.stderr);
  return JSON.parse(o.stdout) as KlDoc[];
}

/** `parse --json` stores the path it was given, which is relative to that process's cwd. */
function relOf(cwd: string, docPath: string): string {
  const abs = isAbsolute(docPath) ? docPath : join(cwd, docPath);
  return posix(relative(cwd, abs));
}

test("CommonMark list projection matches parse --json, with an allowlist only before fmt", () => {
  const before = new Map<string, { id: string; detail: string }[]>();
  for (const dir of corpus) {
    for (const doc of parseDir(root, dir)) {
      if (doc.diagnostics.some((d) => d.code === "K003")) continue;
      const rel = relOf(root, doc.path);
      before.set(rel, mismatches(rel, readFileSync(join(root, rel), "utf8"), doc));
    }
  }

  const copy = mkdtempSync(join(tmpdir(), "keylang-cm-"));
  try {
    for (const dir of corpus) {
      cpSync(join(root, dir), join(copy, dir), { recursive: true });
    }
    keylang(copy, ["fmt", ...corpus]);
    const after = new Map<string, { id: string; detail: string }[]>();
    for (const dir of corpus) {
      for (const doc of parseDir(copy, dir)) {
        if (doc.diagnostics.some((d) => d.code === "K003")) continue;
        const rel = relOf(copy, doc.path);
        after.set(rel, mismatches(rel, readFileSync(join(copy, rel), "utf8"), doc));
      }
    }
    assert.deepEqual([...before.keys()].sort(), [...after.keys()].sort(), "fmt dropped or added a parsed file");
    const problems: string[] = [];
    const seenBefore = new Set<string>();
    for (const [rel, found] of before) {
      for (const m of found) {
        seenBefore.add(m.id);
        if (!allowBefore.has(m.id)) problems.push(`unexpected before fmt:\n${m.detail}`);
      }
      for (const id of allowBefore) {
        if (id.startsWith(`${rel}:`) && !found.some((m) => m.id === id)) problems.push(`stale allowlist entry (no longer before fmt): ${id}`);
      }
      const later = after.get(rel) ?? [];
      for (const m of later) problems.push(`unexpected after fmt:\n${m.detail}`);
    }
    for (const id of allowBefore) if (!seenBefore.has(id)) problems.push(`stale allowlist entry (file not in corpus): ${id}`);
    assert.equal(problems.length, 0, problems.join("\n\n"));
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
});

test("a backtick info string, a longer closer, and an indent-of-4 fence leave the following rule visible", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "keylang-fence-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "keylang"));
  const info = "# rules\n\n```x``` inline\n\n- deny a b\n";
  const longer = "```\ncode\n````\n\n- layer a\n";
  const col4 = "# rules\n\ntext\n\n    ```\n- deny a b\n";
  writeFileSync(join(dir, "keylang/rules.md"), info);
  let o = keylang(dir, ["check", "keylang/rules.md"]);
  assert.equal(o.status, 1, o.stdout + o.stderr);
  assert.match(o.stdout, /keylang\/rules\.md:5:8: K001/);
  assert.match(o.stdout, /keylang\/rules\.md:5:10: K001/);
  assert.match(o.stderr, /2 fail/);

  writeFileSync(join(dir, "fence.md"), longer);
  o = keylang(dir, ["parse", "--json", "fence.md"]);
  assert.equal(o.status, 0, o.stderr);
  const longerDoc = (JSON.parse(o.stdout) as KlDoc[])[0]!;
  const nodes = longerDoc.sections.flatMap((s) => s.items.filter((i) => i.type === "node"));
  assert.equal(nodes.length, 1);
  assert.equal((nodes[0] as KlNode).span.start.line, 5);

  writeFileSync(join(dir, "keylang/rules.md"), col4);
  o = keylang(dir, ["check", "keylang/rules.md"]);
  assert.equal(o.status, 1, o.stdout + o.stderr);
  assert.match(o.stdout, /keylang\/rules\.md:6:8: K001/);
  assert.match(o.stdout, /keylang\/rules\.md:6:10: K001/);

  const tilde = "~~~\n```\ncode\n```\n~~~\n\n- layer a\n";
  const four = "````\n```\ncode\n```\n````\n\n- layer z\n";
  writeFileSync(join(dir, "blocks.md"), `${tilde}\n${four}`);
  o = keylang(dir, ["parse", "--json", "blocks.md"]);
  const blocks = (JSON.parse(o.stdout) as KlDoc[])[0]!;
  const codes = blocks.sections.flatMap((s) => s.items.filter((i) => i.type === "code"));
  assert.equal(codes.length, 2);
  assert.ok(codes.every((c) => c.type === "code" && c.lines.some((line) => line.includes("```"))));
  const layers = blocks.sections.flatMap((s) => s.items.filter((i): i is KlNode => i.type === "node"));
  assert.deepEqual(layers.map((n) => n.span.start.line), [7, 15]);
});

test("fmt dedents a fence under a list item and a second fmt is identical", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "keylang-dedent-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const src = "# map\n\n- layer a\n  - module b\n    ```\n    x\n    ```\n";
  const indentedBlank = "# map\n\n- layer a\n  - module b\n\n    ```\n    x\n    ```\n";
  writeFileSync(join(dir, "map.md"), src);
  assert.equal(keylang(dir, ["fmt", "map.md"]).status, 0);
  const once = readFileSync(join(dir, "map.md"), "utf8");
  assert.equal(once, "# map\n\n- layer a\n  - module b\n\n```\nx\n```\n");
  assert.equal(keylang(dir, ["fmt", "map.md"]).status, 0);
  assert.equal(readFileSync(join(dir, "map.md"), "utf8"), once);

  writeFileSync(join(dir, "map.md"), indentedBlank);
  const check = keylang(dir, ["fmt", "--check", "map.md"]);
  assert.equal(check.status, 1);
  assert.match(check.stdout, /map\.md: not formatted/);
  assert.equal(readFileSync(join(dir, "map.md"), "utf8"), indentedBlank);

  const before = codeValues(src);
  const after = codeValues(once);
  assert.deepEqual(before, after);
  assert.deepEqual(before, ["x"]);
});

test("a tab in the fence indent is left as written", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "keylang-fence-tab-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const src = "# map\n\n- layer a\n\n\t```\n\tx\n\t```\n";
  writeFileSync(join(dir, "map.md"), src);
  assert.equal(keylang(dir, ["fmt", "--check", "map.md"]).status, 0, "a tabbed fence is already canonical");
  assert.equal(readFileSync(join(dir, "map.md"), "utf8"), src);
});

test("multiline HTML blocks of types 1–5 are prose, and a rule after them is still checked", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "keylang-html-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "keylang"));
  const hidden = "# rules\n\n<!--\n- deny a b\n-->\n";
  writeFileSync(join(dir, "keylang/rules.md"), hidden);
  const check = keylang(dir, ["check", "keylang/rules.md"]);
  assert.equal(check.status, 0, check.stdout + check.stderr);
  assert.equal(check.stdout, "");
  const parsed = keylang(dir, ["parse", "--json", "keylang/rules.md"]);
  const doc = (JSON.parse(parsed.stdout) as KlDoc[])[0]!;
  const prose = doc.sections.flatMap((s) => s.items.filter((i) => i.type === "prose"));
  assert.ok(prose.some((i) => i.type === "prose" && i.lines.includes("- deny a b")));
  assert.equal(doc.sections.flatMap((s) => s.items.filter((i) => i.type === "node")).length, 0);

  const flow = "# rules\n\n<!--\n# flow x\n-->\n\n- deny c d\n";
  writeFileSync(join(dir, "keylang/rules.md"), flow);
  const flowDoc = (JSON.parse(keylang(dir, ["parse", "--json", "keylang/rules.md"]).stdout) as KlDoc[])[0]!;
  assert.ok(flowDoc.sections.every((s) => s.kind !== "flow"));
  const still = keylang(dir, ["check", "keylang/rules.md"]);
  assert.equal(still.status, 1);
  assert.match(still.stdout, /keylang\/rules\.md:7:8: K001/);

  const described = "# map\n\n- layer a\n  <!--\n  - module hidden\n  -->\n";
  writeFileSync(join(dir, "map.md"), described);
  const map = (JSON.parse(keylang(dir, ["parse", "--json", "map.md"]).stdout) as KlDoc[])[0]!;
  const layer = map.sections[0]!.items.find((i): i is KlNode => i.type === "node");
  assert.ok(layer);
  assert.equal(layer.children.length, 0);
  assert.deepEqual(layer.description.map((d) => d.span.start.line), [4, 5, 6]);

  const pre = "<pre>\n\n\n- layer x\n\n</pre>\n";
  writeFileSync(join(dir, "pre.md"), pre);
  assert.equal(keylang(dir, ["fmt", "pre.md"]).status, 0);
  assert.equal(readFileSync(join(dir, "pre.md"), "utf8"), pre);
  assert.equal(keylang(dir, ["fmt", "--check", "pre.md"]).status, 0);

  // Types 1–5. A `- deny` and a heading inside the block are not nodes; a rule after the block is.
  const blocks: [string, string][] = [
    ["<script>", "</script>"],
    ["<style>", "</style>"],
    ["<textarea>", "</textarea>"],
    ["<?php", "?>"],
    ["<!DOCTYPE", ">"],
    ["<![CDATA[", "]]>"],
  ];
  for (const [open, close] of blocks) {
    const text = `# rules\n\n${open}\n- deny a b\n# flow x\n${close}\n\n- deny c d\n`;
    writeFileSync(join(dir, "keylang/rules.md"), text);
    const hidden = keylang(dir, ["check", "keylang/rules.md"]);
    assert.equal(hidden.status, 1, `${open}\n${hidden.stdout}${hidden.stderr}`);
    assert.match(hidden.stdout, /keylang\/rules\.md:8:8: K001/, open);
    assert.match(hidden.stdout, /keylang\/rules\.md:8:10: K001/, open);
    assert.doesNotMatch(hidden.stdout, /:4:/, open);
    assert.doesNotMatch(hidden.stdout, /:5:/, open);
    const doc = (JSON.parse(keylang(dir, ["parse", "--json", "keylang/rules.md"]).stdout) as KlDoc[])[0]!;
    assert.ok(doc.sections.every((s) => s.kind !== "flow"), open);
    const nodes = doc.sections.flatMap((s) => s.items.filter((i): i is KlNode => i.type === "node"));
    assert.deepEqual(nodes.map((n) => n.span.start.line), [8], open);
    const prose = doc.sections.flatMap((s) => s.items.filter((i) => i.type === "prose"));
    assert.ok(prose.some((i) => i.type === "prose" && i.lines.includes("- deny a b")), open);
  }
});

test("a type-1 HTML block ends on any of the four end tags, and the following rule is checked", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "keylang-html-end-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "keylang"));

  // `</pre>` ends `<script>`: CommonMark's end tag need not match the opener.
  const crossed = "# rules\n\n<script>\n</pre>\n- deny a b\n</script>\n";
  writeFileSync(join(dir, "keylang/rules.md"), crossed);
  const check = keylang(dir, ["check", "keylang/rules.md"]);
  assert.equal(check.status, 1, check.stdout + check.stderr);
  assert.match(check.stdout, /keylang\/rules\.md:5:8: K001/);
  assert.match(check.stdout, /keylang\/rules\.md:5:10: K001/);
  assert.doesNotMatch(check.stderr, /^0 fail, 0 unverified, 0 ok$/m);
  const nodes = nodesOf(dir, "keylang/rules.md");
  assert.deepEqual(nodes.map((n) => n.span.start.line), [5]);

  // A space before `>` is not the end tag, so the rule stays inside the block.
  const spaced = "# rules\n\n<script>\n</script >\n- deny a b\n</script>\n";
  writeFileSync(join(dir, "keylang/rules.md"), spaced);
  const inside = keylang(dir, ["check", "keylang/rules.md"]);
  assert.equal(inside.status, 0, inside.stdout + inside.stderr);
  assert.equal(inside.stdout, "");
  assert.equal(nodesOf(dir, "keylang/rules.md").length, 0);

  // Case does not matter, and `<PRE>` ends on `</TEXTAREA>`.
  const upper = "# rules\n\n<PRE>\n</TEXTAREA>\n- deny a b\n";
  writeFileSync(join(dir, "keylang/rules.md"), upper);
  const upperCheck = keylang(dir, ["check", "keylang/rules.md"]);
  assert.equal(upperCheck.status, 1, upperCheck.stdout + upperCheck.stderr);
  assert.match(upperCheck.stdout, /keylang\/rules\.md:5:8: K001/);
  assert.match(upperCheck.stdout, /keylang\/rules\.md:5:10: K001/);

  // A heading after the end tag opens a flow; it is not swallowed with the block.
  const flow = "# rules\n\n<style>\n</script>\n# flow pay\n- trigger save\n</style>\n";
  writeFileSync(join(dir, "keylang/rules.md"), flow);
  const flowDoc = (JSON.parse(keylang(dir, ["parse", "--json", "keylang/rules.md"]).stdout) as KlDoc[])[0]!;
  assert.ok(flowDoc.sections.some((s) => s.kind === "flow"));
  const flowCheck = keylang(dir, ["check", "keylang/rules.md"]);
  assert.doesNotMatch(flowCheck.stderr, /^0 fail, 0 unverified, 0 ok$/m);
});

function nodesOf(dir: string, file: string): KlNode[] {
  const parsed = keylang(dir, ["parse", "--json", file]);
  const doc = (JSON.parse(parsed.stdout) as KlDoc[])[0]!;
  return doc.sections.flatMap((s) => s.items.filter((i): i is KlNode => i.type === "node"));
}

function codeValues(text: string): string[] {
  const out: string[] = [];
  const walk = (node: Nodes): void => {
    if (node.type === "code") out.push(node.value);
    if ("children" in node) for (const child of node.children) walk(child);
  };
  walk(fromMarkdown(text));
  return out;
}

