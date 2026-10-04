// Colours of the TUI (256-colour palette) and the per-line highlight of raw
// keylang Markdown: keywords, declared names and references coloured by the
// layer their ID starts with, code links, comments, headings, code fences.

import type { Document, Node } from "../ir.ts";
import { sectionNodes, walk } from "../ir.ts";
import type { Span } from "../span.ts";
import type { Style } from "./screen.ts";
import type { Mark } from "./evidence.ts";

export const THEME = {
  text: { fg: 252 } as Style,
  prose: { fg: 250 } as Style,
  heading: { fg: 213, bold: true } as Style,
  keyword: { fg: 176, bold: true } as Style,
  link: { fg: 75, underline: true } as Style,
  comment: { fg: 243, italic: true } as Style,
  code: { fg: 108 } as Style,
  lineNumber: { fg: 239 } as Style,
  cursorLine: { bg: 236 } as Style,
  panel: { fg: 250, bg: 234 } as Style,
  panelTitle: { fg: 111, bg: 234, bold: true } as Style,
  selected: { fg: 231, bg: 25 } as Style,
  status: { fg: 252, bg: 237 } as Style,
  statusKey: { fg: 231, bg: 237, bold: true } as Style,
  popup: { fg: 252, bg: 238 } as Style,
  popupTitle: { fg: 231, bg: 238, bold: true } as Style,
  added: { fg: 114, bg: 22 } as Style,
  removed: { fg: 210, bg: 52 } as Style,
  hunk: { fg: 231, bg: 24, bold: true } as Style,
  stale: { fg: 242 } as Style,
  error: { fg: 203 } as Style,
  hint: { fg: 180 } as Style,
};

export const MARK_STYLE: Record<Mark, Style> = {
  ok: { fg: 71, bold: true },
  fail: { fg: 196, bold: true },
  unverified: { fg: 179, bold: true },
  planned: { fg: 141, bold: true },
  warning: { fg: 214, bold: true },
  question: { fg: 75, bold: true },
};

const LAYER_COLORS = [39, 78, 214, 141, 203, 44, 179, 111, 168, 150];

/** Colour of an ID by the layer it starts with, in the order of `keylang.json`. */
export function idStyle(id: string, layers: readonly string[]): Style {
  const head = id.split(".")[0] ?? "";
  if (head === "external") return { fg: 245 };
  const at = layers.indexOf(head);
  return { fg: at === -1 ? 81 : LAYER_COLORS[at % LAYER_COLORS.length]! };
}

/** A styled run on one line: code-point columns `[start, end)`, 0-based. */
export interface Run {
  start: number;
  end: number;
  style: Style;
}

/** Highlight runs by 1-based line; later runs win where they overlap. */
export function highlight(doc: Document | null, text: string, layers: readonly string[]): Map<number, Run[]> {
  const out = new Map<number, Run[]>();
  const lines = text.split("\n");
  const add = (line: number, run: Run): void => {
    if (run.end <= run.start) return;
    let list = out.get(line);
    if (!list) out.set(line, (list = []));
    list.push(run);
  };
  const addSpan = (span: Span, style: Style): void => {
    if (span.start.line === span.end.line) add(span.start.line, { start: span.start.col - 1, end: span.end.col - 1, style });
    else add(span.start.line, { start: span.start.col - 1, end: [...(lines[span.start.line - 1] ?? "")].length, style });
  };
  let fence = false;
  lines.forEach((content, index) => {
    const line = index + 1;
    const width = [...content].length;
    if (/^\s*(```|~~~)/.test(content)) {
      add(line, { start: 0, end: width, style: THEME.code });
      fence = !fence;
    } else if (fence) add(line, { start: 0, end: width, style: THEME.code });
    else if (/^#{1,6}\s/.test(content)) add(line, { start: 0, end: width, style: THEME.heading });
    else if (/^\s*<!--/.test(content)) add(line, { start: 0, end: width, style: THEME.comment });
    else if (!/^\s*-\s/.test(content) && content.trim() !== "") add(line, { start: 0, end: width, style: THEME.prose });
  });
  if (!doc) return out;
  const visit = (node: Node): void => {
    if (node.keyword) addSpan(node.keyword, THEME.keyword);
    if (node.name) addSpan(node.name.span, { ...(node.id ? idStyle(node.id, layers) : THEME.text), bold: true });
    if (node.link) addSpan(node.link.span, THEME.link);
    if (node.name && node.link && node.id) addSpan(node.name.span, { ...idStyle(node.id, layers), bold: true, underline: true });
    for (const ref of node.refs) addSpan(ref.span, idStyle(ref.target, layers));
    if (node.comment) addSpan(node.comment.span, THEME.comment);
  };
  for (const section of doc.sections) {
    if (section.heading) addSpan(section.heading.span, THEME.heading);
    for (const top of sectionNodes(section)) walk(top, visit);
  }
  return out;
}
