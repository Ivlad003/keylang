// The stdout of `keylang parse [--json]` for parsed documents: the indented
// tree or the Text IR as JSON. Pure text, shared by the CLI and the TUI (and
// its export), so both give the same bytes; diagnostics are not part of it.

import { kindLabel, type Document, type Node } from "./ir.ts";

export const PARSE_FORMATS = ["tree", "json"] as const;
export type ParseFormat = (typeof PARSE_FORMATS)[number];

/** The whole stdout of `parse` in a format, every line ending in `\n`. */
export function parseReportText(format: ParseFormat, docs: readonly Document[]): string {
  if (format === "json") return `${JSON.stringify(docs, null, 2)}\n`;
  return docs.flatMap(treeLines).map((line) => `${line}\n`).join("");
}

/** One document as the tree `parse` prints: the path, each section, its nodes with their start. */
function treeLines(doc: Document): string[] {
  const out = [`${doc.path}${doc.generated !== null ? " (generated)" : ""}`];
  for (const section of doc.sections) {
    out.push(`  [${section.kind}] ${section.heading?.value ?? "(no heading)"}`);
    for (const item of section.items) if (item.type === "node") nodeLines(item, 2, out);
  }
  return out;
}

function nodeLines(n: Node, depth: number, out: string[]): void {
  let line = `${"  ".repeat(depth)}${kindLabel(n.kind)}`;
  const id = n.id ?? n.name?.value;
  if (id !== undefined) line += ` ${id}`;
  if (n.link) line += ` <${n.link.target}>`;
  if (n.text) line += ` ${JSON.stringify(n.text.value)}`;
  if (n.label) line += ` ${JSON.stringify(n.label.value)}`;
  if (n.refs.length > 0) line += ` -> ${n.refs.map((r) => r.target).join(", ")}`;
  out.push(`${line}  @${n.span.start.line}:${n.span.start.col}`);
  for (const c of n.children) nodeLines(c, depth + 1, out);
}
