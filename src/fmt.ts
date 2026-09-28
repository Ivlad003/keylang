// Canonical formatting (`keylang fmt`). Rendered from the IR, so the output is
// idempotent by construction: `format(parse(format(x))) == format(x)`.

import type { Diagnostic } from "./diag.ts";
import type { Document, Node } from "./ir.ts";
import { parse, renderTokens } from "./parser.ts";

/**
 * Format source text. Returns the structural (K003) diagnostics instead when
 * the tree shape is ambiguous — formatting would silently re-nest items.
 */
export function formatSource(path: string, src: string): { ok: true; text: string } | { ok: false; diagnostics: Diagnostic[] } {
  const doc = parse(path, src);
  const structural = doc.diagnostics.filter((d) => d.code === "K003");
  return structural.length === 0 ? { ok: true, text: formatDocument(doc) } : { ok: false, diagnostics: structural };
}

export function formatDocument(doc: Document): string {
  const blocks: string[] = [];
  if (doc.generated !== null) blocks.push(doc.generated);
  for (const section of doc.sections) {
    if (section.heading) blocks.push(["#", section.heading.value, section.comment?.value ?? ""].filter((part) => part !== "").join(" "));
    let list = "";
    for (const item of section.items) {
      if (item.type === "node") {
        list = renderNode(list, item, 0);
      } else {
        if (list !== "") {
          blocks.push(list.trimEnd());
          list = "";
        }
        blocks.push(item.lines.join("\n"));
      }
    }
    if (list !== "") blocks.push(list.trimEnd());
  }
  return blocks.length === 0 ? "" : `${blocks.join("\n\n")}\n`;
}

function renderNode(out: string, n: Node, depth: number): string {
  const indent = "  ".repeat(depth);
  out += `${indent}- ${renderTokens(n.tokens)}`;
  if (n.comment) out += `${n.tokens.length > 0 ? " " : ""}${n.comment.value}`;
  out += "\n";
  for (const d of n.description) out += `${indent}  ${d.value}\n`;
  for (const c of n.children) out = renderNode(out, c, depth + 1);
  return out;
}
