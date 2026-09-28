// Reading mode (`v`): the spec rendered as text — headings, bullets, tables,
// code blocks, inline code, emphasis and links — wrapped to the width. Every
// row keeps its source line, so the gutter marks and `Enter` on an ID still
// work. A small renderer instead of marked + marked-terminal keeps the
// package free of their dependency tree; the subset matches what specs use.

import type { Style } from "./screen.ts";
import { THEME } from "./theme.ts";
import { stringWidth } from "./width.ts";

export interface Segment {
  text: string;
  style: Style;
}

export interface ReadRow {
  segments: Segment[];
  /** 1-based source line. */
  source: number;
}

const INLINE = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|_([^_]+)_/gu;

export function inline(written: string, base: Style): Segment[] {
  // Anchors and line breaks written as HTML (the explained map's) show nothing, as on GitHub.
  const text = written.replace(/<a\s[^>]*><\/a>|<br\s*\/?>/gi, "");
  const out: Segment[] = [];
  let at = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > at) out.push({ text: text.slice(at, match.index), style: base });
    if (match[1] !== undefined) out.push({ text: match[1], style: { ...base, fg: 180 } });
    else if (match[2] !== undefined) out.push({ text: match[2], style: { ...base, bold: true } });
    else if (match[3] !== undefined) out.push({ text: match[3], style: { ...base, ...THEME.link, ...(/^https?:\/\/[^\s\x00-\x1f\x7f-\x9f]+$/.test(match[4]!) ? { link: match[4]! } : {}) } });
    else if (match[5] !== undefined) out.push({ text: match[5], style: { ...base, italic: true } });
    at = match.index + match[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at), style: base });
  return out;
}

/** Word-wraps segments to `width` cells; continuation rows start with `hang` spaces. */
function wrap(segments: Segment[], width: number, hang: number, source: number): ReadRow[] {
  const rows: ReadRow[] = [];
  let row: Segment[] = [];
  let used = 0;
  const flush = (): void => {
    rows.push({ segments: row, source });
    row = hang > 0 ? [{ text: " ".repeat(hang), style: {} }] : [];
    used = hang;
  };
  for (const segment of segments) {
    for (const word of segment.text.split(/(?<= )/u)) {
      const w = stringWidth(word);
      if (used + stringWidth(word.trimEnd()) > width && used > hang) flush();
      row.push({ text: word, style: segment.style });
      used += w;
    }
  }
  rows.push({ segments: row, source });
  return rows;
}

function tableRows(block: { text: string; line: number }[], width: number): ReadRow[] {
  const cells = block.map((row) => row.text.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()));
  const isRule = (row: string[]): boolean => row.every((cell) => /^:?-+:?$/.test(cell));
  const widths: number[] = [];
  for (const row of cells) if (!isRule(row)) row.forEach((cell, i) => (widths[i] = Math.max(widths[i] ?? 0, stringWidth(cell.replace(/`/g, "")))));
  const budget = Math.max(4, Math.floor((width - widths.length * 3) / Math.max(1, widths.length)));
  return cells.map((row, index) => {
    const source = block[index]!.line;
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

export function renderMarkdown(text: string, width: number): ReadRow[] {
  const lines = text.split("\n");
  const rows: ReadRow[] = [];
  let fence = false;
  let table: { text: string; line: number }[] = [];
  const endTable = (): void => {
    if (table.length > 0) rows.push(...tableRows(table, width));
    table = [];
  };
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
