// What goes to the model (design §7.3 «Контекст»): the buffer, the nodes on
// the cursor line and their neighbours, the flows and rules naming them,
// their code and the tests of those flows — each item with a token estimate,
// so the person sees and trims what the agent reads. `@id` adds a node, `x`
// drops an item. Everything comes from one analysis: specs as it parsed
// them (unsaved buffers included), code only when the file still has the
// bytes its snapshot hashed. Packs are cached per analysis, a few per buffer
// state, and go when the analysis does.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Analysis } from "./analyze.ts";
import { formatSummary, summarizeNode } from "./explain-node.ts";
import { formatDocument } from "./fmt.ts";
import { sectionNodes, walk, type Document, type Section } from "./ir.ts";
import { parse } from "./parser.ts";

export type ContextKind = "buffer" | "node" | "neighbor" | "flow" | "rule" | "code" | "test";

export interface ContextItem {
  /** Stable within a pack: `x` removes by key. */
  key: string;
  kind: ContextKind;
  label: string;
  text: string;
  tokens: number;
  /** A declared intention, not code. */
  planned?: true;
  /** The node reaches code keylang did not resolve, or its module is opaque: the model sees less than runs. */
  incomplete?: true;
}

export interface ContextPack {
  items: ContextItem[];
  tokens: number;
  /** Cache key: snapshot, specs, buffer, cursor ids, additions and removals. */
  key: string;
}

export interface ContextInput {
  path: string;
  text: string;
  /** 0-based cursor line. */
  line: number;
  added: readonly string[];
  removed: ReadonlySet<string>;
}

/** Roughly four characters a token: an estimate for the person, not a bill. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Packs of one analysis by key, oldest first; a new analysis (every overlay change makes one) starts empty. */
const cache = new WeakMap<Analysis, Map<string, ContextPack>>();
/** Buffer states kept per analysis: typing between two analyses makes a new one each key press. */
const PACKS_PER_ANALYSIS = 16;
const specDigests = new WeakMap<Analysis, string>();

export function contextPack(analysis: Analysis, input: ContextInput): ContextPack {
  const doc = parse(input.path, input.text);
  const onLine: string[] = [];
  for (const section of doc.sections) {
    for (const top of sectionNodes(section)) {
      walk(top, (node) => {
        if (node.span.start.line !== input.line + 1) return;
        for (const ref of node.refs) onLine.push(ref.target);
        if (node.id && node.kind === "planned") onLine.push(node.id);
      });
    }
  }
  const ids = [...new Set([...onLine, ...input.added])];
  const key = createHash("sha256")
    .update([analysis.snapshot?.snapshotId ?? "", specDigest(analysis), input.path, input.text, ids.join(","), [...input.removed].sort().join(",")].join("\u0000"))
    .digest("hex");
  const packs = cache.get(analysis) ?? new Map<string, ContextPack>();
  cache.set(analysis, packs);
  const hit = packs.get(key);
  if (hit) {
    // Most recently used last: the oldest goes first when the cache is full.
    packs.delete(key);
    packs.set(key, hit);
    return hit;
  }

  const items: ContextItem[] = [];
  const add = (item: Omit<ContextItem, "tokens">): void => {
    if (input.removed.has(item.key) || items.some((i) => i.key === item.key)) return;
    items.push({ ...item, tokens: estimateTokens(item.text) });
  };
  add({ key: `buffer:${input.path}`, kind: "buffer", label: input.path, text: input.text });
  const nodes = analysis.snapshot?.nodes ?? {};
  for (const id of ids) {
    const result = summarizeNode(analysis, id);
    if ("unknown" in result) continue;
    const s = result.summary;
    const node = nodes[id];
    const source = node?.file && node.line !== null ? snapshotSource(analysis, node.file) : null;
    // Code that changed on disk after the snapshot is left out: its lines no longer match the facts.
    const incomplete = node?.members === "opaque" || node?.closure?.complete === false || (Boolean(node?.file) && node?.line !== null && source === null);
    add({ key: `node:${id}`, kind: "node", label: id, text: formatSummary(s), ...(s.kind.startsWith("planned") ? { planned: true as const } : {}), ...(incomplete ? { incomplete: true as const } : {}) });
    for (const other of [...s.calls, ...s.callers]) add({ key: `neighbor:${other}`, kind: "neighbor", label: other, text: `${nodes[other]?.kind ?? "fn"} ${other}${nodes[other]?.signature ? ` ${nodes[other]!.signature}` : ""}` });
    if (source !== null && node?.file && node.line !== null) {
      const code = source.split("\n").slice(node.line - 1, node.endLine ?? node.line).join("\n");
      add({ key: `code:${id}`, kind: "code", label: `${node.file}:${node.line}`, text: code });
    }
  }
  for (const d of analysis.docs) {
    if (d.generated !== null) continue;
    for (const section of d.sections) {
      if (section.kind === "map" || !section.heading) continue;
      let named = false;
      const tests: string[] = [];
      for (const top of sectionNodes(section)) {
        walk(top, (node) => {
          if (node.refs.some((ref) => ids.includes(ref.target)) || (node.id !== null && ids.includes(node.id))) named = true;
          if (node.kind === "test" && node.text) tests.push(`${node.text.value}${node.label ? ` "${node.label.value}"` : ""}`);
        });
      }
      if (!named) continue;
      const lines = sectionText(d, section);
      add({ key: `${section.kind === "flow" ? "flow" : "rule"}:${d.path}:${section.heading.value}`, kind: section.kind === "flow" ? "flow" : "rule", label: section.heading.value, text: lines });
      for (const t of tests) add({ key: `test:${t}`, kind: "test", label: t, text: t });
    }
  }
  const pack = { items, tokens: items.reduce((sum, i) => sum + i.tokens, 0), key };
  packs.set(key, pack);
  while (packs.size > PACKS_PER_ANALYSIS) packs.delete(packs.keys().next().value!);
  return pack;
}

/** A section as the analysis read it (an unsaved buffer included), in canonical form. */
function sectionText(doc: Document, section: Section): string {
  return formatDocument({ path: doc.path, generated: null, sections: [section], diagnostics: [] }).trimEnd();
}

/** What every hand-written spec of the analysis says: part of the pack key, so a changed rule or flow elsewhere is a new pack. */
function specDigest(analysis: Analysis): string {
  let digest = specDigests.get(analysis);
  if (digest === undefined) {
    const hash = createHash("sha256");
    for (const doc of analysis.docs) if (doc.generated === null) hash.update(`${doc.path}\u0000${formatDocument(doc)}\u0000`);
    digest = hash.digest("hex");
    specDigests.set(analysis, digest);
  }
  return digest;
}

/** The text of a source file when it still has the bytes the snapshot hashed; null otherwise. */
function snapshotSource(analysis: Analysis, file: string): string | null {
  const abs = join(analysis.config.root, file);
  const expected = analysis.snapshot?.manifest.files.find((f) => f.path === file)?.sha256;
  if (expected === undefined || !existsSync(abs)) return null;
  const text = readFileSync(abs, "utf8");
  return createHash("sha256").update(text).digest("hex") === expected ? text : null;
}

/** The pack as the prompt text a model gets. */
export function contextText(pack: ContextPack): string {
  return pack.items.map((i) => `[${i.kind}${i.planned ? ", planned" : ""}${i.incomplete ? ", incomplete" : ""}] ${i.label}\n${i.text}`).join("\n\n");
}
