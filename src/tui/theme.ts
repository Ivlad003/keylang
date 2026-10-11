// Colours of the TUI (256-colour palette) and the per-line highlight of raw
// keylang Markdown: keywords, declared names and references coloured by the
// layer their ID starts with, code links, comments, headings, code fences.
// Layer: TUI drawing. `view.ts` applies `highlight` to the editor lines; the
// styles here are shared by every panel. Highlight reads the Markdown IR, never re-parses.

import type { Document, Node } from "../ir.ts";
import { sectionNodes, walk } from "../ir.ts";
import type { Span } from "../span.ts";
import type { Style } from "./screen.ts";
import type { Mark } from "./evidence.ts";

/** The named styles of every TUI surface: editor text, panels, status line, popups, merge diff. */
export const THEME = {
  text: { fg: 252 },
  prose: { fg: 250 },
  heading: { fg: 213, bold: true },
  keyword: { fg: 176, bold: true },
  link: { fg: 75, underline: true },
  comment: { fg: 243, italic: true },
  code: { fg: 108 },
  lineNumber: { fg: 239 },
  cursorLine: { bg: 236 },
  panel: { fg: 250, bg: 234 },
  panelTitle: { fg: 111, bg: 234, bold: true },
  selected: { fg: 231, bg: 25 },
  status: { fg: 252, bg: 237 },
  statusKey: { fg: 231, bg: 237, bold: true },
  popup: { fg: 252, bg: 238 },
  popupTitle: { fg: 231, bg: 238, bold: true },
  added: { fg: 114, bg: 22 },
  removed: { fg: 210, bg: 52 },
  hunk: { fg: 231, bg: 24, bold: true },
  stale: { fg: 242 },
  error: { fg: 203 },
  hint: { fg: 180 },
} satisfies Record<string, Style>;

/** The style of each evidence mark in the gutter and in reports. */
export const MARK_STYLE: Record<Mark, Style> = {
  ok: { fg: 71, bold: true },
  fail: { fg: 196, bold: true },
  unverified: { fg: 179, bold: true },
  planned: { fg: 141, bold: true },
  warning: { fg: 214, bold: true },
  question: { fg: 75, bold: true },
};

/** Colours given to layers in config order; they cycle after ten. */
const LAYER_COLORS = [39, 78, 214, 141, 203, 44, 179, 111, 168, 150];

/** Colour of an ID by the layer it starts with, in the order of `keylang.json`. */
export function idStyle(id: string, layers: readonly string[]): Style {
  const head = id.split(".")[0] ?? "";

  // External packages are grey; an unknown head (not a configured layer) gets one fixed colour.
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

  // Collect runs per line, dropping empty ones.
  const add = (line: number, run: Run): void => {
    if (run.end <= run.start) return;
    let list = out.get(line);

    if (!list) out.set(line, (list = []));
    list.push(run);
  };

  // IR spans are 1-based in `col`; runs are 0-based. A span that crosses lines
  // is coloured only on its first line, to its end.
  const addSpan = (span: Span, style: Style): void => {
    if (span.start.line === span.end.line) add(span.start.line, { start: span.start.col - 1, end: span.end.col - 1, style });
    else add(span.start.line, { start: span.start.col - 1, end: [...(lines[span.start.line - 1] ?? "")].length, style });
  };

  // Pass 1, line-based: code fences (the fence lines and everything between),
  // headings, HTML comments, and prose (any non-list, non-blank line).
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

  // Pass 2, from the IR: keywords, names, links, references and comments of
  // every node. These come later, so they override the line styles.
  if (!doc) return out;

  const visit = (node: Node): void => {
    if (node.keyword) addSpan(node.keyword, THEME.keyword);

    if (node.name) addSpan(node.name.span, { ...(node.id ? idStyle(node.id, layers) : THEME.text), bold: true });

    if (node.link) addSpan(node.link.span, THEME.link);

    // A name that also has a code link is underlined, overriding the plain name run above.
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
