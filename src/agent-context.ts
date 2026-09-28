// What goes to the model (design §7.3 «Контекст»): the buffer, the nodes on
// the cursor line and their neighbours, the flows and rules naming them,
// their code and the tests of those flows — each item with a token estimate,
// so the person sees and trims what the agent reads. `@id` adds a node, `x`
// drops an item. A pack is cached by snapshot, specs and selection.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Analysis } from "./analyze.ts";
import { formatSummary, summarizeNode } from "./explain-node.ts";
import { sectionNodes, walk } from "./ir.ts";
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

const cache = new Map<string, ContextPack>();

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
  const specs = analysis.docs.filter((d) => d.generated === null).map((d) => d.path).join("\n");
  const key = createHash("sha256")
    .update([analysis.snapshot?.snapshotId ?? "", specs, input.path, input.text, ids.join(","), [...input.removed].sort().join(",")].join("\u0000"))
    .digest("hex");
  const hit = cache.get(key);
  if (hit) return hit;

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
    const incomplete = node?.members === "opaque" || node?.closure?.complete === false;
    add({ key: `node:${id}`, kind: "node", label: id, text: formatSummary(s), ...(s.kind.startsWith("planned") ? { planned: true as const } : {}), ...(incomplete ? { incomplete: true as const } : {}) });
    for (const other of [...s.calls, ...s.callers]) add({ key: `neighbor:${other}`, kind: "neighbor", label: other, text: `${nodes[other]?.kind ?? "fn"} ${other}${nodes[other]?.signature ? ` ${nodes[other]!.signature}` : ""}` });
    if (node?.file && node.line !== null && existsSync(join(analysis.config.root, node.file))) {
      const code = readFileSync(join(analysis.config.root, node.file), "utf8").split("\n").slice(node.line - 1, node.endLine ?? node.line).join("\n");
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
      const lines = sectionText(d.path, analysis, section.heading.span.start.line);
      add({ key: `${section.kind === "flow" ? "flow" : "rule"}:${d.path}:${section.heading.value}`, kind: section.kind === "flow" ? "flow" : "rule", label: section.heading.value, text: lines });
      for (const t of tests) add({ key: `test:${t}`, kind: "test", label: t, text: t });
    }
  }
  const pack = { items, tokens: items.reduce((sum, i) => sum + i.tokens, 0), key };
  cache.set(key, pack);
  return pack;
}

/** The source lines of a section, from its heading to the next heading. */
function sectionText(path: string, analysis: Analysis, heading: number): string {
  const abs = join(analysis.config.root, path);
  if (!existsSync(abs)) return "";
  const lines = readFileSync(abs, "utf8").split("\n");
  const end = lines.findIndex((line, i) => i >= heading && /^# /.test(line));
  return lines.slice(heading - 1, end === -1 ? lines.length : end).join("\n").trimEnd();
}

/** The pack as the prompt text a model gets. */
export function contextText(pack: ContextPack): string {
  return pack.items.map((i) => `[${i.kind}${i.planned ? ", planned" : ""}${i.incomplete ? ", incomplete" : ""}] ${i.label}\n${i.text}`).join("\n\n");
}
