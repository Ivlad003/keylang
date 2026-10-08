// Executable examples and the grammar appendix of the format spec:
// docs/grammar.md, docs/semantics.md and docs/snapshot.md.
//
// A group is the fences a reader sees: `keylang` (and other `path=` files), an
// optional `fmt` fence immediately after its `keylang` fence, and a closing
// `diagnostics` fence. The test writes that directory and runs the real CLI.
// mdast drops the newline that ends a fence; `fmt` writes exactly one.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { fromMarkdown } from "mdast-util-from-markdown";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");
/** The format spec, split by section; every executable example lives in one of these. */
const specSources = ["docs/grammar.md", "docs/semantics.md", "docs/snapshot.md"];

interface Md {
  type: string;
  lang?: string | null;
  meta?: string | null;
  value?: string;
  position?: { start: { line: number } };
  children?: Md[];
}

interface ExampleFile {
  path: string;
  lang: string;
  body: string;
  fmt: string | null;
  line: number;
}

interface Group {
  files: ExampleFile[];
  diagnostics: string;
  diagnosticsLine: number;
  rules: string[];
  keylangLine: number;
}

interface Cli {
  status: number;
  stdout: string;
  stderr: string;
}

function codes(markdown: string): Md[] {
  const tree = fromMarkdown(markdown) as unknown as Md;
  const out: Md[] = [];
  const walk = (node: Md): void => {
    if (node.type === "code") out.push(node);
    for (const child of node.children ?? []) walk(child);
  };
  walk(tree);
  return out;
}

function metaPath(meta: string): string | null {
  const token = meta.split(/\s+/).find((part) => part.startsWith("path="));
  return token === undefined ? null : token.slice("path=".length);
}

function ruleTokens(meta: string): string[] {
  return meta.split(/\s+/).filter((part) => /^Р\d+$/u.test(part)).map((part) => part.slice(1));
}

/** Groups in `markdown`, or harness errors that name a fence line. */
function collectGroups(markdown: string, source: string): { groups: Group[]; errors: string[] } {
  const groups: Group[] = [];
  const errors: string[] = [];
  let open: Group | null = null;
  let fmtOk = false;
  for (const node of codes(markdown)) {
    const lang = node.lang ?? "";
    const meta = node.meta ?? "";
    const hasPath = metaPath(meta) !== null;
    if (!hasPath && lang !== "keylang" && lang !== "diagnostics" && lang !== "fmt") continue;
    const line = node.position?.start.line ?? 0;
    const value = node.value ?? "";
    if (lang === "diagnostics") {
      if (open === null) errors.push(`${source}:${line}: diagnostics fence without a group`);
      else {
        open.diagnostics = value;
        open.diagnosticsLine = line;
        groups.push(open);
        open = null;
      }
      fmtOk = false;
      continue;
    }
    if (lang === "fmt") {
      const prev = open?.files.at(-1);
      if (open === null || prev === undefined || prev.lang !== "keylang" || prev.fmt !== null || !fmtOk) {
        errors.push(`${source}:${line}: fmt fence must follow a keylang fence`);
      } else prev.fmt = value;
      fmtOk = false;
      continue;
    }
    const path = lang === "keylang" ? (metaPath(meta) ?? "keylang/example.md") : metaPath(meta);
    if (lang === "keylang" && !path!.startsWith("keylang/")) {
      errors.push(`${source}:${line}: keylang path must start with keylang/, found \`${path}\``);
      fmtOk = false;
      continue;
    }
    if (path === null || path === "") {
      errors.push(`${source}:${line}: file fence needs path=`);
      fmtOk = false;
      continue;
    }
    if (open === null) open = { files: [], diagnostics: "", diagnosticsLine: 0, rules: [], keylangLine: 0 };
    if (lang === "keylang" && open.keylangLine === 0) open.keylangLine = line;
    open.rules.push(...ruleTokens(meta));
    open.files.push({ path, lang, body: value.endsWith("\n") ? value : `${value}\n`, fmt: null, line });
    fmtOk = lang === "keylang";
  }
  if (open !== null) {
    const line = open.keylangLine || open.files[0]?.line || 0;
    errors.push(`${source}:${line}: keylang fence has no diagnostics fence`);
  }
  return { groups, errors };
}

function kLines(text: string): string[] {
  return text.split("\n").filter((line) => line !== "" && /K\d{3}/.test(line));
}

function isK003Line(line: string, path: string): boolean {
  if (!line.startsWith(`${path}:`)) return false;
  return /^\d+:\d+: K003 /.test(line.slice(path.length + 1));
}

function withFinalNewline(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}

// Each example is its own CLI process. The compile cache is what keeps two
// dozen short startups inside the suite budget on a cold tree.
const compileCache = join(tmpdir(), "keylang-node-compile");
mkdirSync(compileCache, { recursive: true });

function spawnCli(cwd: string, args: string[]): Promise<Cli> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, ...args], { cwd, env: { ...process.env, NODE_COMPILE_CACHE: compileCache } });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", reject);
    child.on("close", (status) => {
      resolve({ status: status ?? 1, stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8") });
    });
  });
}

async function checkGroup(group: Group, source: string): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "keylang-format-"));
  try {
    for (const file of group.files) {
      const abs = join(dir, file.path);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, file.body);
    }
    const checked = await spawnCli(dir, ["check"]);
    if (checked.status === 2) throw new Error(`${source}:${group.diagnosticsLine}: check failed\n${checked.stderr}`);
    const actual = kLines(checked.stdout);
    const expected = kLines(group.diagnostics);
    if (actual.join("\n") !== expected.join("\n")) {
      throw new Error(`${source}:${group.diagnosticsLine}: diagnostics differ\nexpected:\n${expected.join("\n")}\nactual:\n${actual.join("\n")}`);
    }
    for (const file of group.files) {
      if (file.fmt === null) continue;
      const abs = join(dir, file.path);
      const before = readFileSync(abs);
      const lines = file.fmt.split("\n").filter((line) => line !== "");
      const refusal = lines.length > 0 && lines.every((line) => isK003Line(line, file.path));
      const formatted = await spawnCli(dir, ["fmt", file.path]);
      const after = readFileSync(abs);
      if (refusal) {
        if (formatted.status !== 1 || !before.equals(after)) {
          throw new Error(`${source}:${file.line}: fmt should refuse ${file.path} with status 1 and leave it unchanged\nstatus ${formatted.status}\nstderr:\n${formatted.stderr}`);
        }
        const stderrLines = formatted.stderr.split("\n").filter((line) => line !== "");
        if (stderrLines.join("\n") !== lines.join("\n")) {
          throw new Error(`${source}:${file.line}: fmt stderr differs\nexpected:\n${lines.join("\n")}\nactual:\n${stderrLines.join("\n")}`);
        }
        continue;
      }
      const want = withFinalNewline(file.fmt);
      if (formatted.status !== 0 || after.toString("utf8") !== want) {
        throw new Error(`${source}:${file.line}: fmt output differs for ${file.path}\nstatus ${formatted.status}\nexpected:\n${want}\nactual:\n${after.toString("utf8")}\nstderr:\n${formatted.stderr}`);
      }
      const again = await spawnCli(dir, ["fmt", file.path]);
      if (again.status !== 0 || !readFileSync(abs).equals(after)) {
        throw new Error(`${source}:${file.line}: second fmt changed ${file.path}\n${readFileSync(abs).toString("utf8")}`);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

interface Parent {
  suffix: string;
  lines: (item: string) => string[];
}

interface Position {
  name: string;
  k004: boolean;
  parents: Parent[];
}

const POSITIONS: Position[] = [
  { name: "map-top", k004: false, parents: [{ suffix: "", lines: (item) => [item] }] },
  { name: "rules-top", k004: true, parents: [{ suffix: "", lines: (item) => ["# rules", item] }] },
  { name: "flow-top", k004: true, parents: [{ suffix: "", lines: (item) => ["# flow checkout", item] }] },
  { name: "wiring-top", k004: true, parents: [{ suffix: "", lines: (item) => ["# wiring", item] }] },
  { name: "under-layer", k004: false, parents: [{ suffix: "", lines: (item) => ["- layer app", `  ${item}`] }] },
  { name: "under-module", k004: false, parents: [{ suffix: "", lines: (item) => ["- layer app", "  - module checkout", `    ${item}`] }] },
  { name: "under-fn", k004: true, parents: [{ suffix: "", lines: (item) => ["- layer app", "  - module checkout", "    - fn buy", `      ${item}`] }] },
  { name: "under-rule-module", k004: true, parents: [{ suffix: "", lines: (item) => ["# rules", "- module app.checkout", `  ${item}`] }] },
  {
    name: "under-step",
    k004: true,
    parents: [
      { suffix: "-step", lines: (item) => ["# flow checkout", "- step app.buy", `  ${item}`] },
      { suffix: "-trigger", lines: (item) => ["# flow checkout", "- trigger app.buy", `  ${item}`] },
    ],
  },
  { name: "under-when", k004: true, parents: [{ suffix: "", lines: (item) => ["# flow checkout", "- when paid", `  ${item}`] }] },
  { name: "under-parallel", k004: true, parents: [{ suffix: "", lines: (item) => ["# flow checkout", "- parallel", `  ${item}`] }] },
  {
    name: "under-invariant",
    k004: true,
    parents: [
      { suffix: "-invariant", lines: (item) => ["# flow checkout", "- invariant holds", `  ${item}`] },
      { suffix: "-then", lines: (item) => ["# flow checkout", "- when paid", "  - then app.buy", `    ${item}`] },
    ],
  },
  {
    name: "under-timer",
    k004: true,
    parents: [
      { suffix: "-after", lines: (item) => ["# flow checkout", "- after 30m", `  ${item}`] },
      { suffix: "-every", lines: (item) => ["# flow checkout", "- every @daily", `  ${item}`] },
    ],
  },
  { name: "under-wire-dep", k004: true, parents: [{ suffix: "", lines: (item) => ["# wiring", "- wire app.buy", "  - db app.pool", `    ${item}`] }] },
];

const POSITION_NAMES = [
  "map-top",
  "rules-top",
  "flow-top",
  "wiring-top",
  "under-layer",
  "under-module",
  "under-fn",
  "under-ref",
  "under-rule-module",
  "under-step",
  "under-when",
  "under-parallel",
  "under-invariant",
  "under-timer",
  "under-wire",
  "under-wire-dep",
  "under-other",
];

interface Keyword {
  word: string;
  kind: string;
}

function productions(ebnf: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const match of ebnf.matchAll(/^([a-z][a-z0-9-]*)\s*=\s*([\s\S]*?);/gm)) out.set(match[1]!, match[2]!);
  return out;
}

function keywords(rhs: string): Keyword[] {
  const out: Keyword[] = [];
  for (const match of rhs.matchAll(/"([^"]+)"(?:\s*->\s*([A-Za-z0-9-]+))?/g)) out.push({ word: match[1]!, kind: match[2] ?? match[1]! });
  return out;
}

interface DocJson {
  path: string;
  diagnostics: { code: string; message: string }[];
  sections: { items: ItemJson[] }[];
}

interface ItemJson {
  type: string;
  kind?: string;
  span?: { start: { line: number } };
  children?: ItemJson[];
}

function deepestKind(doc: DocJson): string | undefined {
  let best: { line: number; kind: string } | undefined;
  // Nested nodes have no `type`; only the top-level item is tagged `node`.
  const walk = (item: ItemJson): void => {
    if (item.kind && item.span) {
      const line = item.span.start.line;
      if (best === undefined || line >= best.line) best = { line, kind: item.kind };
    }
    for (const child of item.children ?? []) walk(child);
  };
  for (const section of doc.sections) for (const item of section.items) walk(item);
  return best?.kind;
}

function probeFiles(ebnf: string): Map<string, string> {
  const defs = productions(ebnf);
  const files = new Map<string, string>();
  for (const position of POSITIONS) {
    const rhs = defs.get(position.name);
    if (rhs === undefined) continue;
    const words = keywords(rhs);
    for (const parent of position.parents) {
      if (position.k004) files.set(`g/${position.name}${parent.suffix}--unknown.md`, `${parent.lines("- zz").join("\n")}\n`);
      for (const keyword of words) files.set(`g/${position.name}${parent.suffix}--${keyword.word}.md`, `${parent.lines(`- ${keyword.word}`).join("\n")}\n`);
    }
  }
  return files;
}

/** Differences between the ebnf block and one `parse --json` of every probe. */
function grammarDiff(ebnf: string, docs: Map<string, DocJson>): string[] {
  const defs = productions(ebnf);
  const errors: string[] = [];
  for (const position of POSITIONS) {
    const rhs = defs.get(position.name);
    if (rhs === undefined) {
      errors.push(`${position.name}: production missing from the ebnf block`);
      continue;
    }
    const words = keywords(rhs);
    const ebnfSet = new Set(words.map((keyword) => keyword.word));
    for (const parent of position.parents) {
      const tag = `${position.name}${parent.suffix}`;
      if (position.k004) {
        const doc = docs.get(`g/${tag}--unknown.md`);
        const message = doc?.diagnostics.find((diag) => diag.code === "K004" && diag.message.includes("expected one of:"))?.message;
        if (doc === undefined || message === undefined) {
          errors.push(`${tag}: unknown word did not report expected one of`);
          continue;
        }
        const got = new Set(message.split("expected one of: ")[1]!.split(", "));
        for (const word of got) if (!ebnfSet.has(word)) errors.push(`${position.name}: word \`${word}\` is in the parser expected one of, not in the ebnf`);
        for (const word of ebnfSet) if (!got.has(word)) errors.push(`${position.name}: word \`${word}\` is in the ebnf, not in the parser expected one of`);
      }
      for (const keyword of words) {
        const path = `g/${tag}--${keyword.word}.md`;
        const doc = docs.get(path);
        if (doc === undefined) {
          errors.push(`${tag}: missing probe for \`${keyword.word}\``);
          continue;
        }
        if (doc.diagnostics.some((diag) => diag.code === "K004")) errors.push(`${tag}: \`${keyword.word}\` produced K004`);
        const kind = deepestKind(doc);
        if (kind !== keyword.kind) errors.push(`${tag}: \`${keyword.word}\` has kind ${kind ?? "(none)"}, expected ${keyword.kind}`);
      }
    }
  }
  return errors;
}

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      await fn(items[index]!);
    }
  });
  await Promise.all(workers);
}

test("format spec examples run through check and fmt, and the ebnf matches the parser", async () => {
  const docs = specSources.map((source) => ({ source, text: readFileSync(join(root, source), "utf8") }));
  const collected = docs.map((doc) => ({ source: doc.source, ...collectGroups(doc.text, doc.source) }));
  assert.deepEqual(collected.flatMap((c) => c.errors), []);
  const groups = collected.flatMap((c) => c.groups);
  const sourceOf = new Map(collected.flatMap((c) => c.groups.map((group) => [group, c.source] as const)));
  const text = docs.map((doc) => doc.text).join("\n");
  const bodies = groups.flatMap((group) => group.files.map((file) => file.body)).join("\n");
  const diagnostics = groups.map((group) => group.diagnostics).join("\n");
  assert.ok(groups.length >= 4);
  assert.match(bodies, /Домен чистий/);
  assert.match(bodies, /check\.rules\.evaluate/);
  assert.match(bodies, /options infrastructure\.config\.server/);
  assert.match(bodies, /domain\.aggregate/);
  assert.match(diagnostics, /K008/);
  assert.match(diagnostics, /K106/);

  const decided = [...text.matchAll(/\*\*Р(\d+)\./gu)].map((match) => match[1]!);
  for (let n = 1; n <= 15; n++) assert.ok(decided.includes(String(n)), `Р${n} is a decision heading`);
  const tagged = new Set(groups.flatMap((group) => group.rules));
  const missing = [...new Set(decided)].filter((n) => !tagged.has(n));
  assert.deepEqual(missing, [], `decisions without an example: ${missing.map((n) => `Р${n}`).join(", ")}`);

  const refusal = groups.find((group) => group.rules.includes("4"));
  assert.ok(refusal?.files.some((file) => file.fmt !== null && file.fmt.includes("K003")));
  const snapshots = groups.filter((group) => group.rules.includes("13"));
  assert.ok(snapshots.some((group) => group.files.some((file) => file.path === "keylang.json") && group.files.some((file) => file.path.startsWith("src/") && file.path.endsWith(".ts"))));
  assert.ok(snapshots.some((group) => kLines(group.diagnostics).length === 0));
  assert.ok(snapshots.some((group) => group.diagnostics.includes("K001") && group.diagnostics.includes("domain.order.missing")));
  const continued = groups.find((group) => group.rules.includes("14"));
  assert.equal(continued?.files.filter((file) => file.path.startsWith("keylang/")).length, 2);
  assert.match(continued?.diagnostics ?? "", /K002/);
  assert.match(continued?.diagnostics ?? "", /first declared at/);

  assert.equal(codes(text).filter((node) => node.lang === "ebnf").length, 1);
  const grammar = docs.find((doc) => doc.source === "docs/grammar.md")!.text;
  const ebnfNodes = codes(grammar).filter((node) => node.lang === "ebnf");
  assert.equal(ebnfNodes.length, 1);
  const appendix = grammar.split("\n").findIndex((line) => line.startsWith("## Додаток А"));
  assert.ok(appendix >= 0 && (ebnfNodes[0]?.position?.start.line ?? 0) > appendix + 1, "the ebnf is in Appendix A of grammar.md");
  assert.equal(text.includes("heading  :="), false);
  assert.equal(text.includes("item     :="), false);
  const ebnf = ebnfNodes[0]!.value ?? "";
  const names = [...productions(ebnf).keys()];
  for (const name of POSITION_NAMES) assert.ok(names.includes(name), `ebnf production ${name}`);
  for (const bit of ["→", "business", "technical", "planned", "emits", "exports", "compose"]) assert.ok(ebnf.includes(bit), bit);

  const k005 = docs.find((doc) => doc.text.includes("K005 unexpected arguments after layer `options`"))!;
  const source = k005.source;
  const mutatedDoc = k005.text.replace("K005 unexpected arguments after layer `options`", "K005 not the message check prints");
  const mutatedGroups = collectGroups(mutatedDoc, source);
  assert.deepEqual(mutatedGroups.errors, []);
  const mutated = mutatedGroups.groups.find((group) => group.diagnostics.includes("K005 not the message check prints"));
  assert.ok(mutated);

  const twoFiles = [
    "```keylang path=keylang/map/a.md",
    "- options x",
    "```",
    "```keylang path=keylang/rules.md",
    "# rules",
    "- layer domain",
    "```",
    "```diagnostics",
    "keylang/map/a.md:1:11: K005 unexpected arguments after layer `options` (a dependency `<alias> <path>` must be nested under a module)",
    "keylang/rules.md:2:3: K004 unknown keyword `layer` here; expected one of: layers, allow, deny, entry, module, no-cycles; `layer` goes at the top of a map",
    "```",
    "",
  ].join("\n");
  const synthetic = collectGroups(twoFiles, "synthetic.md");
  assert.deepEqual(synthetic.errors, []);
  assert.equal(synthetic.groups.length, 1);
  assert.deepEqual(synthetic.groups[0]!.files.map((file) => file.path), ["keylang/map/a.md", "keylang/rules.md"]);

  const orphan = collectGroups("```keylang path=keylang/map.md\n- layer domain\n```\n", "orphan.md");
  assert.ok(orphan.errors.some((error) => error.includes("orphan.md:1:") && error.includes("no diagnostics")));
  const outside = collectGroups("```keylang path=map.md\n- layer domain\n```\n```diagnostics\n```\n", "outside.md");
  assert.ok(outside.errors.some((error) => error.includes("outside.md:1:") && error.includes("keylang/")));

  const problems: string[] = [];
  const jobs: (() => Promise<void>)[] = [
    ...groups.map((group) => async () => checkGroup(group, sourceOf.get(group)!)),
    async () => checkGroup(mutated!, source),
    async () => checkGroup(synthetic.groups[0]!, "synthetic.md"),
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "keylang-grammar-"));
      try {
        for (const [path, body] of probeFiles(ebnf)) {
          const abs = join(dir, path);
          mkdirSync(dirname(abs), { recursive: true });
          writeFileSync(abs, body);
        }
        const parsed = await spawnCli(dir, ["parse", "--json", "."]);
        if (parsed.status === 2) throw new Error(`parse --json failed\n${parsed.stderr}`);
        const docs = new Map<string, DocJson>();
        for (const doc of JSON.parse(parsed.stdout) as DocJson[]) docs.set(doc.path, doc);
        const diff = grammarDiff(ebnf, docs);
        if (diff.length > 0) throw new Error(diff.join("\n"));
        const dropped = ebnf.replace(/^(rules-top = )"layers" \| /m, "$1");
        const droppedDiff = grammarDiff(dropped, docs);
        const report = droppedDiff.join("\n");
        if (!report.includes("rules-top") || !report.includes("`layers`")) {
          throw new Error(`dropping layers did not name the position and the word\n${report}`);
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  ];
  await pool(jobs, 8, async (job) => {
    try {
      await job();
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  });
  const self = problems.filter((problem) => problem.includes(`${source}:${mutated!.diagnosticsLine}:`));
  const rest = problems.filter((problem) => !problem.includes("K005 not the message check prints") && !problem.startsWith(`${source}:${mutated!.diagnosticsLine}:`));
  assert.ok(self.length >= 1, `mutated diagnostics block was not reported at ${source}:${mutated!.diagnosticsLine}`);
  assert.deepEqual(rest, []);
});
