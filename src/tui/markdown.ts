// Reading mode (`v`): the spec rendered as text — headings, bullets, tables,
// code blocks, inline code, emphasis and links — wrapped to the width. Every
// row keeps its source line, so the gutter marks and `Enter` on an ID still
// work. A small renderer instead of marked + marked-terminal keeps the
// package free of their dependency tree; the subset matches what specs use.
// Layer: TUI drawing. `view.ts` draws the rows `renderMarkdown` returns; the
// wrapping comes from `width.ts`.

import type { Style } from "./screen.ts";
import { THEME } from "./theme.ts";
import { stringWidth, wrapRuns } from "./width.ts";

/** A run of text with one style. */
export interface Segment {
  text: string;
  style: Style;
}

/** One screen row of the rendered spec and the source line it came from. */
export interface ReadRow {
  segments: Segment[];
  /** 1-based source line. */
  source: number;
}

/** Inline Markdown: group 1 `code`, group 2 **bold**, groups 3–4 [text](target), group 5 _italic_. */
const INLINE = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|_([^_]+)_/gu;

// A web link with no control character (C0, DEL, C1): only such a target becomes an OSC 8 link.
const WEB_LINK = new RegExp(String.raw`^https?://[^\s\x00-\x1f\x7f-\x9f]+$`);

/** Inline Markdown of one line as styled segments; `base` is the style of plain text. */
export function inline(written: string, base: Style): Segment[] {
  // Anchors and line breaks written as HTML (the explained map's) show nothing, as on GitHub.
  const text = written
    .replace(/<a\s[^>]*><\/a>|<br\s*\/?>/gi, "")
    .replace(/&(lt|gt|amp);/g, (_, name: string) => (name === "lt" ? "<" : name === "gt" ? ">" : "&"));

  const out: Segment[] = [];
  let at = 0;

  // Plain text between matches keeps `base`; each match becomes one styled segment.
  for (const match of text.matchAll(INLINE)) {
    if (match.index > at) out.push({ text: text.slice(at, match.index), style: base });

    if (match[1] !== undefined) out.push({ text: match[1], style: { ...base, fg: 180 } });
    else if (match[2] !== undefined) out.push({ text: match[2], style: { ...base, bold: true } });
    else if (match[3] !== undefined) {
      const style: Style = { ...base, ...THEME.link };

      // Only a safe web target becomes a clickable terminal link; any other target is styled but inert.
      if (WEB_LINK.test(match[4]!)) style.link = match[4]!;
      out.push({ text: match[3], style });
    }
    else if (match[5] !== undefined) out.push({ text: match[5], style: { ...base, italic: true } });
    at = match.index + match[0].length;
  }

  if (at < text.length) out.push({ text: text.slice(at), style: base });

  return out;
}

/** Word-wraps segments to `width` cells (`wrapRuns`); continuation rows start with `hang` spaces. */
function wrap(segments: Segment[], width: number, hang: number, source: number): ReadRow[] {
  return wrapRuns(segments, width, hang, {}).map((row) => ({ segments: row, source }));
}

/** A Markdown table block as aligned rows; columns are capped at an even share of the width and cut with `…`. */
function tableRows(block: { text: string; line: number }[], width: number): ReadRow[] {
  // Split each row into trimmed cells, dropping the outer pipes; a rule row is `---`/`:-:` cells only.
  const cells = block.map((row) => row.text.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()));
  const isRule = (row: string[]): boolean => row.every((cell) => /^:?-+:?$/.test(cell));
  const widths: number[] = [];

  // Column widths from the non-rule rows, measured without backticks (they are not drawn).
  for (const row of cells) if (!isRule(row)) row.forEach((cell, i) => (widths[i] = Math.max(widths[i] ?? 0, stringWidth(cell.replace(/`/g, "")))));
  const budget = Math.max(4, Math.floor((width - widths.length * 3) / Math.max(1, widths.length)));

  return cells.map((row, index) => {
    const source = block[index]!.line;

    // The rule row becomes a box-drawing line; the first row is the header and is bold.
    if (isRule(row)) return { segments: [{ text: widths.map((w) => "─".repeat(Math.min(w, budget) + 2)).join("┼"), style: THEME.lineNumber }], source };
    const segments: Segment[] = [];
    row.forEach((cell, i) => {
      if (i > 0) segments.push({ text: "│", style: THEME.lineNumber });
      const text = cell.replace(/`/g, "");
      const cut = stringWidth(text) > budget ? `${[...text].slice(0, budget - 1).join("")}…` : text;
      segments.push({ text: ` ${cut}${" ".repeat(Math.max(0, Math.min(widths[i] ?? 0, budget) - stringWidth(cut)))} `, style: index === 0 ? { ...THEME.text, bold: true } : THEME.text });
    });

    return { segments, source };
  });
}

/** The spec as reading-mode rows wrapped to `width`, each tagged with its 1-based source line. */
export function renderMarkdown(text: string, width: number): ReadRow[] {
  const lines = text.split("\n");
  const rows: ReadRow[] = [];
  let fence = false;
  let table: { text: string; line: number }[] = [];

  // Table rows are collected and rendered together, since column widths depend on every row.
  const endTable = (): void => {
    if (table.length > 0) rows.push(...tableRows(table, width));
    table = [];
  };

  // One line at a time, by priority: fence markers, fenced code, table rows,
  // whole-line comments (hidden), headings, list items, blank lines, prose.
  lines.forEach((content, index) => {
    const source = index + 1;

    if (/^\s*(```|~~~)/.test(content)) {
      endTable();
      fence = !fence;

      return;
    }

    if (fence) {
      rows.push({ segments: [{ text: `  ${content}`, style: THEME.code }], source });

      return;
    }

    if (/^\s*\|/.test(content)) {
      table.push({ text: content, line: source });

      return;
    }

    endTable();

    if (/^\s*<!--.*-->\s*$/.test(content)) return;
    const heading = /^(#{1,6})\s+(.*)$/.exec(content);

    if (heading) {
      const level = heading[1]!.length;
      const style: Style = level === 1 ? { ...THEME.heading, underline: true } : { ...THEME.heading, fg: 177 };
      rows.push(...wrap(inline(level === 1 ? heading[2]!.toUpperCase() : heading[2]!, style), width, 0, source));

      return;
    }

    const item = /^(\s*)-\s+(.*)$/.exec(content);

    if (item) {
      const indent = item[1]!.length;
      rows.push(...wrap([{ text: `${" ".repeat(indent)}• `, style: THEME.keyword }, ...inline(item[2]!, THEME.text)], width, indent + 2, source));

      return;
    }

    if (content.trim() === "") {
      rows.push({ segments: [], source });

      return;
    }

    const indent = /^\s*/.exec(content)![0].length;
    rows.push(...wrap([{ text: " ".repeat(indent), style: {} }, ...inline(content.trim(), THEME.prose)], width, indent, source));
  });
  endTable();

  return rows;
}
