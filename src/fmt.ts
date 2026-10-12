// Canonical formatting (`keylang fmt`). Rendered from the IR, so the output is
// idempotent by construction: `format(parse(format(x))) == format(x)`.
//
// Pipeline: Markdown → IR → text again; it never resolves IDs. Entry points:
// `formatSource` (text in, text or K003 out) and `formatDocument`. Items keep their
// raw head tokens, so `fmt` only normalises bullets, indentation and spacing.

import type { Diagnostic } from "./diag.ts";
import type { Document, Node } from "./ir.ts";
import { dedentFenceLines, parse, renderTokens } from "./parser.ts";

/**
 * Format source text. Returns the structural (K003) diagnostics instead when
 * the tree shape is ambiguous — formatting would silently re-nest items.
 */
export function formatSource(path: string, src: string): { ok: true; text: string } | { ok: false; diagnostics: Diagnostic[] } {
  const doc = parse(path, src);
  const structural = doc.diagnostics.filter((d) => d.code === "K003");

  return structural.length === 0 ? { ok: true, text: formatDocument(doc) } : { ok: false, diagnostics: structural };
}

/**
 * Render a parsed document in canonical form: the generated marker, then each
 * section's heading and items, with blocks separated by one blank line.
 */
export function formatDocument(doc: Document): string {
  const blocks: string[] = [];

  if (doc.generated !== null) blocks.push(doc.generated);

  for (const section of doc.sections) {
    if (section.heading) blocks.push(["#", section.heading.value, section.comment?.value ?? ""].filter((part) => part !== "").join(" "));
    // Consecutive nodes form one Markdown list; prose or a code block ends it,
    // so the list is flushed as its own block before the verbatim lines.
    let list = "";

    for (const item of section.items) {
      if (item.type === "node") {
        list = renderNode(list, item, 0);
      } else {
        if (list !== "") {
          blocks.push(list.trimEnd());
          list = "";
        }

        // Fenced code is re-indented to the margin; prose is kept verbatim.
        const lines = item.type === "code" ? dedentFenceLines(item.lines) : item.lines;
        blocks.push(lines.join("\n"));
      }
    }

    if (list !== "") blocks.push(list.trimEnd());
  }

  return blocks.length === 0 ? "" : `${blocks.join("\n\n")}\n`;
}

/** Append one item and its subtree to `out`: two spaces of indent per depth level, descriptions one step deeper. */
function renderNode(out: string, n: Node, depth: number): string {
  const indent = "  ".repeat(depth);
  // A field of `planned type` has one canonical spelling, `name?: type`, whatever spaces were written around the colon.
  const head = n.kind === "field" && n.name && n.text ? `${n.name.value}${n.label ? "?" : ""}: ${n.text.value}` : renderTokens(n.tokens);
  out += `${indent}- ${head}`;

  if (n.comment) out += `${n.tokens.length > 0 ? " " : ""}${n.comment.value}`;
  out += "\n";

  for (const d of n.description) out += `${indent}  ${d.value}\n`;

  for (const c of n.children) out = renderNode(out, c, depth + 1);

  return out;
}
