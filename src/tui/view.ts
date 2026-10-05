// Drawing a TUI state into a `Grid`: pure, so a test reads the frame as text.
// Layout: title, [files] | editor with gutter | [navigation], a detail line
// and the status bar. Popups (hover, completion, palette, help) draw on top.

import { selectedAgent } from "../agent-cli.ts";
import { contextPack } from "../agent-context.ts";
import { CONFIG_FILE } from "../config.ts";
import { explainCode } from "../explain.ts";
import { explanationOf, modelName, type NodeExplanation } from "../explanations.ts";
import { ACTIONS, actionKey, catalog, exportRecord, noSnapshotReason, START_ACTIONS } from "./actions.ts";
import { highlightCode } from "./code-highlight.ts";
import { CHANNELS, evidenceOf, MARK_GLYPH, totals, worse, type LineEvidence, type Mark } from "./evidence.ts";
import { FINDING_GLYPH, VERDICTS, findingCounts, findingDetailText, findingRow, findingsOf, visibleFindings } from "./findings.ts";
import { renderMarkdown, type ReadRow } from "./markdown.ts";
import { mergeRows } from "./merge.ts";
import { navItems, type NavItem } from "./nav.ts";
import { itemNoun, recordLabel, recordStatus, reportItems, resultsReportRows } from "./reports/records.ts";
import { circled, flowOverlay, zoomEdges, zoomLevel, zoomSelectKey, ZOOM_ROOT, type FlowOverlay, type ZoomEdge, type ZoomRow } from "./zoom.ts";
import { Grid, type Style } from "./screen.ts";
import type { Buffer, Prompt, State } from "./state.ts";
import { highlight, MARK_STYLE, THEME, type Run } from "./theme.ts";
import { bufferLines, isDirty, lineLayout } from "./buffer.ts";
import { clusters, fitWidth, graphemes, padWidth, sliceCells, stringWidth, type LineLayout } from "./width.ts";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Layout {
  files: Rect | null;
  editor: Rect;
  nav: Rect | null;
  detail: Rect;
  status: Rect;
  /**
   * Where F6, help, forms and the modal steps draw: the editor area from 100
   * columns on; below that the whole body, so one active panel takes the
   * width instead of every panel being squeezed (design §2).
   */
  panel: Rect;
}

/** From this width on side panels sit beside each other; below it one is shown and overlays take the body. */
export const WIDE_COLS = 100;
/** Below this width no side panel fits next to the editor. */
export const PANEL_MIN_COLS = 60;

export const FILES_WIDTH = 24;
export const NAV_WIDTH = 32;
export const CONTEXT_WIDTH = 52;

export function layout(state: Pick<State, "cols" | "rows" | "showFiles" | "showNav"> & { context?: State["context"]; focus?: State["focus"]; lastPanel?: State["lastPanel"] }): Layout {
  const bodyTop = 1;
  const bodyHeight = Math.max(1, state.rows - 3);
  const wide = state.cols >= WIDE_COLS;
  let showFiles = state.showFiles && state.cols >= PANEL_MIN_COLS;
  let showNav = (state.showNav || state.context?.open === true) && state.cols >= PANEL_MIN_COLS;
  if (!wide && showFiles && showNav) {
    // One side panel on a narrow screen: the focused one, else the one opened last.
    const files = state.focus === "files" || (state.focus !== "nav" && state.focus !== "context" && state.lastPanel === "files");
    showFiles = files;
    showNav = !files;
  }
  const files = showFiles ? { x: 0, y: bodyTop, width: FILES_WIDTH, height: bodyHeight } : null;
  // The context panel (F4) takes the navigation's place, wider: its labels are IDs and paths.
  const width = state.context?.open === true ? Math.min(CONTEXT_WIDTH, Math.floor(state.cols / 2)) : NAV_WIDTH;
  const nav = showNav ? { x: state.cols - width, y: bodyTop, width, height: bodyHeight } : null;
  const left = files ? files.width + 1 : 0;
  const right = nav ? nav.width + 1 : 0;
  const editor = { x: left, y: bodyTop, width: Math.max(10, state.cols - left - right), height: bodyHeight };
  return {
    files,
    editor,
    panel: wide ? editor : { x: 0, y: bodyTop, width: state.cols, height: bodyHeight },
    nav,
    detail: { x: 0, y: state.rows - 2, width: state.cols, height: 1 },
    status: { x: 0, y: state.rows - 1, width: state.cols, height: 1 },
  };
}

/** One editor row: a text line, or the expanded evidence row under the cursor line. */
export type EditorRow = { kind: "line"; line: number } | { kind: "detail"; line: number };

export function lineCount(buffer: Buffer): number {
  return bufferLines(buffer).length;
}

export function gutterWidth(buffer: Buffer): number {
  return 2 + Math.max(3, String(lineCount(buffer)).length) + 1;
}

/** Rows shown from `top`: the cursor line gets an evidence row below it when it has evidence. */
export function editorRows(state: State, buffer: Buffer, height: number): EditorRow[] {
  const count = lineCount(buffer);
  const evidence = state.analysis ? evidenceOf(state.analysis, buffer.path) : new Map<number, LineEvidence>();
  const rows: EditorRow[] = [];
  for (let line = state.top; line < count && rows.length < height; line++) {
    rows.push({ kind: "line", line });
    if (line === state.cursor.line && state.mode !== "edit" && evidence.has(line + 1) && rows.length < height) rows.push({ kind: "detail", line });
  }
  return rows;
}

/**
 * Draws clusters with their code-point positions until `width` cells are
 * used; a cluster (a letter with its marks, a ZWJ emoji) takes the style of
 * its first code point. Only what fits is visited, however long the line.
 */
function drawRuns(grid: Grid, x: number, y: number, width: number, clusters: Iterable<{ cluster: string; point: number }>, runs: readonly Run[], base: Style): void {
  let col = x;
  for (const { cluster, point } of clusters) {
    if (col >= x + width) break;
    let style = base;
    for (const run of runs) if (point >= run.start && point < run.end) style = { ...base, ...run.style };
    col += grid.write(col, y, cluster, style, x + width - col);
  }
}

/** The clusters of a laid-out line from cluster `from` on. */
function* fromLayout(line: LineLayout, from: number): Generator<{ cluster: string; point: number }> {
  for (let i = from; i < line.clusters.length; i++) yield { cluster: line.clusters[i]!, point: line.points[i]! };
}

/** The clusters of `text` from the start, segmented only as far as they are read. */
function* fromText(text: string): Generator<{ cluster: string; point: number }> {
  let point = 0;
  for (const cluster of clusters(text)) {
    yield { cluster, point };
    point += [...cluster].length;
  }
}

/** Cells between clusters `from` and `to` of a laid-out line (0 when `to` is before `from`). */
function cellsBetween(line: LineLayout, from: number, to: number): number {
  const n = line.clusters.length;
  return Math.max(0, line.cells[Math.min(to, n)]! - line.cells[Math.min(from, n)]!);
}

function markCell(item: LineEvidence | undefined, stale: boolean): { glyph: string; style: Style } {
  if (!item) return { glyph: " ", style: {} };
  const style = MARK_STYLE[item.mark];
  return { glyph: MARK_GLYPH[item.mark], style: stale ? { ...style, dim: true, bold: false } : style };
}

const VERDICT_GLYPH = { ok: "✓", fail: "✗", unverified: "◌" } as const;

/** `ID ✓  static ✓  tests —  trace ◌ …`: the channels of a line, never merged into one mark. */
export function detailText(item: LineEvidence, snapshotId: string | null): { text: string; style: Style }[] {
  const parts: { text: string; style: Style }[] = [];
  const reported = new Set(item.criteria.map((c) => c.criterion));
  const flowLine = CHANNELS.some((channel) => reported.has(channel));
  if (flowLine) {
    for (const channel of CHANNELS) {
      const hit = item.criteria.find((c) => c.criterion === channel);
      parts.push({ text: `${channel} `, style: THEME.lineNumber });
      parts.push(hit ? { text: `${VERDICT_GLYPH[hit.verdict]}  `, style: MARK_STYLE[hit.verdict] } : { text: "—  ", style: THEME.lineNumber });
    }
  }
  for (const criterion of item.criteria) {
    if ((CHANNELS as readonly string[]).includes(criterion.criterion)) continue;
    parts.push({ text: `${criterion.criterion} `, style: THEME.lineNumber }, { text: `${VERDICT_GLYPH[criterion.verdict]}  `, style: MARK_STYLE[criterion.verdict] });
  }
  for (const diag of item.diagnostics) parts.push({ text: `${diag.code} `, style: THEME.lineNumber }, { text: `${diag.severity === "error" ? "✗" : "!"}  `, style: MARK_STYLE[diag.severity === "error" ? "fail" : "warning"] });
  parts.push({ text: "planned ", style: THEME.lineNumber }, item.planned ? { text: "◇  ", style: MARK_STYLE.planned } : { text: "—  ", style: THEME.lineNumber });
  if (snapshotId) parts.push({ text: `· snapshot ${snapshotId.slice(0, 8)}`, style: THEME.lineNumber });
  return parts;
}

/** The message for the cursor line: the first failing or unverified finding, with a fix hint. */
export function lineMessage(item: LineEvidence | undefined): { text: string; style: Style } | null {
  if (!item) return null;
  const diag = item.diagnostics.find((d) => d.severity === "error") ?? item.diagnostics[0];
  if (diag) {
    const fix = explainCode(diag.code)?.split("\n").find((line) => line.startsWith("fix: "));
    return { text: `${diag.code} ${diag.message}${fix ? ` — ${fix}` : ""}`, style: diag.severity === "error" ? THEME.error : MARK_STYLE.warning };
  }
  const bad = item.criteria.find((c) => c.verdict === "fail") ?? item.criteria.find((c) => c.verdict === "unverified");
  if (bad) return { text: `${bad.criterion}: ${bad.message}`, style: bad.verdict === "fail" ? THEME.error : THEME.hint };
  if (item.planned) return { text: "planned: an intention, not a fact of the snapshot", style: MARK_STYLE.planned };
  return null;
}

function drawBox(grid: Grid, rect: Rect, title: string, style: Style, titleStyle: Style): void {
  grid.fill(rect.x, rect.y, rect.width, rect.height, style);
  grid.write(rect.x, rect.y, `┌${"─".repeat(Math.max(0, rect.width - 2))}┐`, style);
  for (let y = rect.y + 1; y < rect.y + rect.height - 1; y++) {
    grid.write(rect.x, y, "│", style);
    grid.write(rect.x + rect.width - 1, y, "│", style);
  }
  grid.write(rect.x, rect.y + rect.height - 1, `└${"─".repeat(Math.max(0, rect.width - 2))}┘`, style);
  if (title) grid.write(rect.x + 2, rect.y, ` ${title} `, titleStyle, rect.width - 4);
}

/** Highlight runs per parsed document: a buffer is reparsed on every edit, so the document identifies the text. */
const highlights = new WeakMap<object, { layers: string; runs: Map<number, Run[]> }>();

function runsOf(buffer: Buffer, layers: readonly string[]): Map<number, Run[]> {
  const key = layers.join(",");
  const owner = buffer.doc ?? buffer;
  const cached = highlights.get(owner);
  if (cached && cached.layers === key && owner !== buffer) return cached.runs;
  const runs = highlight(buffer.doc, buffer.text, layers);
  highlights.set(owner, { layers: key, runs });
  return runs;
}

function drawEditor(grid: Grid, state: State, rect: Rect, buffer: Buffer): void {
  const stale = state.updating || state.outdated;
  const evidence = state.analysis ? evidenceOf(state.analysis, buffer.path) : new Map<number, LineEvidence>();
  const layers = state.analysis ? [...state.analysis.config.layers.keys()] : [];
  const runs = runsOf(buffer, layers);
  const gutter = gutterWidth(buffer);
  const numberWidth = gutter - 3;
  const selection = state.selection === null ? null : [Math.min(state.selection, state.cursor.line), Math.max(state.selection, state.cursor.line)] as const;
  editorRows(state, buffer, rect.height).forEach((row, index) => {
    const y = rect.y + index;
    if (row.kind === "detail") {
      const item = evidence.get(row.line + 1)!;
      let x = rect.x + gutter;
      grid.write(rect.x, y, " ".repeat(gutter), THEME.cursorLine);
      grid.fill(x, y, rect.width - gutter, 1, THEME.cursorLine);
      x += grid.write(x, y, "└ ", { ...THEME.lineNumber, ...THEME.cursorLine });
      for (const part of detailText(item, state.analysis?.snapshot?.snapshotId ?? null)) x += grid.write(x, y, part.text, { ...part.style, bg: THEME.cursorLine.bg!, ...(stale ? { dim: true } : {}) }, rect.x + rect.width - x);
      return;
    }
    const isCursor = row.line === state.cursor.line;
    const selected = selection !== null && row.line >= selection[0] && row.line <= selection[1];
    const base: Style = selected ? { ...THEME.text, bg: 24 } : isCursor ? { ...THEME.text, ...THEME.cursorLine } : THEME.text;
    grid.fill(rect.x, y, rect.width, 1, base);
    const mark = markCell(evidence.get(row.line + 1), stale);
    grid.write(rect.x, y, mark.glyph, { ...base, ...mark.style });
    grid.write(rect.x + 2, y, String(row.line + 1).padStart(numberWidth), { ...base, fg: THEME.lineNumber.fg! });
    drawRuns(grid, rect.x + gutter, y, rect.width - gutter, fromLayout(lineLayout(buffer, row.line), state.left), runs.get(row.line + 1) ?? [], base);
  });
  if (state.ghost && state.mode === "edit" && state.ghost.path === buffer.path) {
    const rowIndex = state.ghost.line - state.top;
    const typed = lineLayout(buffer, state.ghost.line);
    const rest = graphemes(state.ghost.variants[state.ghost.index] ?? "").slice(typed.clusters.length).join("");
    const x = rect.x + gutter + cellsBetween(typed, state.left, typed.clusters.length);
    const more = state.ghost.variants.length > 1 ? `  (${state.ghost.index + 1}/${state.ghost.variants.length}, Alt+])` : "";
    if (rowIndex >= 0 && rowIndex < rect.height) grid.write(x, rect.y + rowIndex, `${rest}${more}`, { ...THEME.text, ...THEME.cursorLine, fg: 242, italic: true }, rect.x + rect.width - x);
  }
  if (state.mode === "edit" && state.focus === "editor") {
    const rowIndex = state.cursor.line - state.top;
    const x = rect.x + gutter + cellsBetween(lineLayout(buffer, state.cursor.line), state.left, state.cursor.col);
    if (rowIndex >= 0 && rowIndex < rect.height && x < rect.x + rect.width) grid.cursor = { x, y: rect.y + rowIndex };
  }
}

/** The rendered rows of a buffer per text and width, and the first row of each source line: a frame asks for them more than once. */
const reading = new WeakMap<Buffer, { text: string; width: number; rows: ReadRow[]; firstRow: Map<number, number> }>();

function readLayout(buffer: Buffer, width: number): { rows: ReadRow[]; firstRow: Map<number, number> } {
  const cached = reading.get(buffer);
  if (cached && cached.text === buffer.text && cached.width === width) return cached;
  const rows = renderMarkdown(buffer.text, width);
  const firstRow = new Map<number, number>();
  rows.forEach((row, index) => {
    if (!firstRow.has(row.source)) firstRow.set(row.source, index);
  });
  const entry = { text: buffer.text, width, rows, firstRow };
  reading.set(buffer, entry);
  return entry;
}

/** Reading mode: the rendered rows, the first row of each source line, the row of the cursor line, and the first row shown. */
function readRows(state: State, buffer: Buffer, rect: Rect): { rows: ReadRow[]; firstRow: Map<number, number>; cursorRow: number; top: number } {
  const { rows, firstRow } = readLayout(buffer, rect.width - 3);
  const at = rows.findIndex((row) => row.source - 1 >= state.cursor.line);
  const cursorRow = at === -1 ? rows.length - 1 : at;
  const top = Math.max(0, Math.min(cursorRow - Math.floor(rect.height / 3), rows.length - rect.height));
  return { rows, firstRow, cursorRow, top };
}

/** The screen row (from the editor's top) where reading mode shows the cursor line: popups anchor there. */
export function readCursorRow(state: State, buffer: Buffer, rect: Rect): number {
  const { cursorRow, top } = readRows(state, buffer, rect);
  return Math.max(0, cursorRow - top);
}

function drawRead(grid: Grid, state: State, rect: Rect, buffer: Buffer): void {
  const stale = state.updating || state.outdated;
  const evidence = state.analysis ? evidenceOf(state.analysis, buffer.path) : new Map<number, LineEvidence>();
  const { rows, firstRow, top } = readRows(state, buffer, rect);
  for (let i = 0; i < rect.height && top + i < rows.length; i++) {
    const row = rows[top + i]!;
    const y = rect.y + i;
    const isCursor = row.source - 1 === state.cursor.line;
    const base = isCursor ? { ...THEME.text, ...THEME.cursorLine } : THEME.text;
    grid.fill(rect.x, y, rect.width, 1, base);
    // The gutter mark goes on the first row a source line renders to.
    if (firstRow.get(row.source) === top + i) {
      const mark = markCell(evidence.get(row.source), stale);
      grid.write(rect.x, y, mark.glyph, { ...base, ...mark.style });
    }
    let x = rect.x + 3;
    for (const segment of row.segments) x += grid.write(x, y, segment.text, { ...base, ...segment.style }, rect.x + rect.width - x);
  }
}

function drawCode(grid: Grid, state: State, rect: Rect): void {
  const code = state.code!;
  grid.fill(rect.x, rect.y, rect.width, 1, THEME.panelTitle);
  grid.write(rect.x + 1, rect.y, `${code.file}:${code.line}`, { ...THEME.panelTitle, ...THEME.link, bg: THEME.panelTitle.bg!, link: code.link }, rect.width - 2);
  const hint = " read-only · Esc back ";
  grid.write(rect.x + rect.width - hint.length, rect.y, hint, THEME.panelTitle);
  const numberWidth = Math.max(3, String(code.lines.length).length);
  const runs = highlightCode(code.lines);
  for (let i = 0; i < rect.height - 1; i++) {
    const index = code.top + i;
    if (index >= code.lines.length) break;
    const y = rect.y + 1 + i;
    const target = index + 1 === code.line;
    const base = target ? { ...THEME.text, ...THEME.cursorLine } : THEME.text;
    grid.fill(rect.x, y, rect.width, 1, base);
    grid.write(rect.x, y, target ? "▶" : " ", { ...base, fg: 75 });
    grid.write(rect.x + 2, y, String(index + 1).padStart(numberWidth), { ...base, fg: THEME.lineNumber.fg! });
    drawRuns(grid, rect.x + numberWidth + 3, y, rect.width - numberWidth - 3, fromText(code.lines[index]!), runs[index] ?? [], base);
  }
}

/** Rows above the list of the zoom screen: the crumbs, then two rows of what the focus is. */
export const ZOOM_HEAD = 3;

/** Rows the list of the zoom screen has in `rect`. */
export function zoomListHeight(state: Pick<State, "rows">, rect: Rect): number {
  return Math.max(1, rect.height - ZOOM_HEAD);
}

/** Below this many terminal columns a zoom row leaves its brief out; the mark and the edges stay. */
const ZOOM_BRIEF_COLS = 100;

const ZOOM_KIND: Record<ZoomRow["kind"], string> = { layer: "layer", module: "module", class: "class", package: "pkg", fn: "fn", type: "type", more: "" };

/** Where an explanation's words come from, as the nav panel says it. */
function originText(e: NodeExplanation): string {
  if (e.origin === "llm") return ` (llm · ${modelName(e.agent ?? "?")} · ${e.date ?? "?"}${e.stale ? " · stale" : ""})`;
  return e.source ? ` (${e.source})` : " (code)";
}

/** Crumbs that fit `width`: the nearest levels kept, the farthest cut first behind `…`. */
export function fitCrumbs(labels: readonly string[], width: number): string {
  for (let from = 0; from < labels.length; from++) {
    const text = `${from > 0 ? "… › " : ""}${labels.slice(from).join(" › ")}`;
    if (stringWidth(text) <= width) return text;
  }
  return labels.at(-1) ?? "";
}

/** The text of a zoom row: zoom mark, kind, name, distance, and the brief when there is room. */
export function zoomRowText(state: State, row: ZoomRow, width: number, overlay: FlowOverlay | null = null): { text: string; right: string } {
  if (row.kind === "more") return { text: `  … ${row.more} more at depth ${row.distance}: > shows them`, right: "" };
  const steps = overlay?.steps.get(row.id) ?? [];
  const away = `${row.distance > 0 ? ` ·${row.distance}` : ""}${steps.length > 0 ? ` ${steps.map(circled).join("")}` : ""}`;
  const mark = overlay ? stepsMark(overlay, steps) : row.mark;
  const right = `${mark ? MARK_GLYPH[mark] : " "} ↔ ${row.edges}`;
  const head = `${row.container ? "▸" : " "} ${ZOOM_KIND[row.kind].padEnd(6)} ${row.label}${away}`;
  const e = state.analysis?.snapshot ? explanationOf(state.analysis.snapshot, state.briefs, row.id) : null;
  if (state.cols < ZOOM_BRIEF_COLS) return { text: head, right };
  const room = width - stringWidth(head) - stringWidth(right) - 5;
  const brief = e === null ? "—" : e.text.replace(/\s+/g, " ");
  return { text: room > 4 ? `${head} · ${fitWidth(brief, room)}` : head, right };
}

const EDGE_GROUP: Record<ZoomEdge["group"], string> = { in: "in", out: "out", external: "package", inside: "inside", unresolved: "◌" };

/** An end of an edge row as the level names it: a child by its name under the focus, anything else by its ID. */
function endLabel(focus: string, id: string): string {
  return focus !== ZOOM_ROOT && id.startsWith(`${focus}.`) ? id.slice(focus.length + 1) : id;
}

/** The text of an edges-view row: group, `from → to`, the kinds with counts, and the count. */
export function zoomEdgeText(focus: string, edge: ZoomEdge, walked = false): { text: string; right: string } {
  if (edge.group === "unresolved") {
    const reasons = (edge.reasons ?? []).map((item) => `${item.reason} ×${item.count}`).join(", ");
    return { text: `◌ unresolved inside: ${reasons}`, right: `${edge.count}` };
  }
  const kinds = edge.kinds.map((item) => `${item.kind} ×${item.count}`).join(", ");
  return { text: `${walked ? "▶" : " "} ${EDGE_GROUP[edge.group].padEnd(8)} ${endLabel(focus, edge.from)} → ${endLabel(focus, edge.to)} · ${kinds}`, right: `${edge.count}` };
}

/** The worst gutter mark of the steps a row stands for: the same marks the flow's lines have. */
function stepsMark(overlay: FlowOverlay, steps: readonly number[]): Mark | null {
  let mark: Mark | null = null;
  for (const step of steps) mark = worse(mark, overlay.marks.get(step)?.mark ?? null);
  return mark;
}

/** The layers a flow walks, in the order its steps are written: `cli ① → map ②–④`. */
export function flowSequence(overlay: FlowOverlay): string {
  return overlay.sequence.map((part) => `${part.layer} ${part.first === part.last ? circled(part.first) : `${circled(part.first)}–${circled(part.last)}`}`).join(" → ");
}

/** A clickable part of the zoom screen's header row (c4-zoom/10): what it does and where it is. */
export interface ZoomButton {
  action: "up" | "in" | "shallower" | "deeper" | "edges" | "flow";
  /** Cells from the left of the header row. */
  x: number;
  width: number;
}

/**
 * The header's buttons, right-aligned, and their text: `[−] [+] [depth N ▾▴]
 * [c edges] [f flow ▾]`. Each does what its key does; the crumbs get what
 * is left of the row, so on a narrow terminal the crumbs are cut, never a
 * button. `▾` and `▴` are buttons of their own inside the depth one.
 */
export function zoomButtons(zoom: { depth: number; view: "nodes" | "edges"; flow: string | null }, width: number): { text: string; buttons: ZoomButton[] } {
  const parts: { text: string; action?: ZoomButton["action"] }[] = [
    { text: "[−]", action: "up" },
    { text: " " },
    { text: "[+]", action: "in" },
    { text: " " },
    { text: `[depth ${zoom.depth} ` },
    { text: "▾", action: "shallower" },
    { text: "▴", action: "deeper" },
    { text: "]" },
    { text: " " },
    { text: zoom.view === "edges" ? "[c nodes]" : "[c edges]", action: "edges" },
    { text: " " },
    { text: zoom.flow === null ? "[f flow ▾]" : `[f ${zoom.flow} ×]`, action: "flow" },
    { text: " " },
  ];
  const text = parts.map((part) => part.text).join("");
  let x = Math.max(0, width - stringWidth(text));
  const buttons: ZoomButton[] = [];
  for (const part of parts) {
    const cells = stringWidth(part.text);
    if (part.action) buttons.push({ action: part.action, x, width: cells });
    x += cells;
  }
  return { text, buttons };
}

/**
 * The zoom screen (c4-zoom/07): crumbs and depth, what the focus is with
 * where the words come from, then the level's rows — children, then the
 * neighbors with their distance — the selected one highlighted.
 */
function drawZoom(grid: Grid, state: State, rect: Rect): void {
  const analysis = state.analysis;
  const zoom = state.zoom;
  if (!analysis?.snapshot || !zoom) return;
  const level = zoomLevel(analysis, zoom.focus, zoom.depth);
  grid.fill(rect.x, rect.y, rect.width, 1, THEME.panelTitle);
  const overlay = zoom.flow === null ? null : flowOverlay(analysis, zoom.flow, zoom.focus, (file, line) => evidenceOf(analysis, file).get(line)?.mark ?? null);
  // The buttons keep their place on any width; the crumbs get what is left (c4-zoom/10).
  const header = zoomButtons(zoom, rect.width);
  const room = header.buttons[0]!.x - 2;
  grid.write(rect.x + 1, rect.y, fitCrumbs(level.crumbs.map((crumb) => crumb.label), room), THEME.panelTitle, room);
  grid.write(rect.x + rect.width - stringWidth(header.text), rect.y, header.text, { ...THEME.panelTitle, bold: true });
  const e = explanationOf(analysis.snapshot, state.briefs, zoom.focus);
  const about = e === null ? ["— no explanation yet: a doc comment, a README, or keylang explain --missing --llm writes one"] : wrapWords(`${e.text}${originText(e)}`, rect.width - 4).slice(0, ZOOM_HEAD - 1);
  // A flow over the level takes the second row: its layers in the order written at the top and on a layer, else its steps here.
  const atLayers = zoom.focus === ZOOM_ROOT || analysis.snapshot.nodes[zoom.focus]?.kind === "layer";
  const flowRow = overlay === null ? null : atLayers ? `flow ${overlay.flow}: ${flowSequence(overlay)}` : `flow ${overlay.flow}: ${[...overlay.steps.values()].flat().length} step(s) on this level; numbers are the order written, a trace confirms the order run`;
  (flowRow === null ? about : [about[0]!]).forEach((line, i) => grid.write(rect.x + 2, rect.y + 1 + i, line, { ...THEME.hint, ...(e === null ? {} : { fg: 250 }) }, rect.width - 3));
  if (flowRow !== null) grid.write(rect.x + 2, rect.y + 2, flowRow, { ...THEME.hint, fg: 75 }, rect.width - 3);
  const height = zoomListHeight(state, rect);
  if (zoom.view === "edges") {
    const edges = zoomEdges(analysis, zoom.focus);
    const at = Math.max(0, Math.min(zoom.selected.get(zoomSelectKey(zoom)) ?? 0, edges.length - 1));
    if (edges.length === 0) grid.write(rect.x + 2, rect.y + ZOOM_HEAD, "no edges here: c goes back to the nodes", THEME.hint);
    for (let i = 0; i < height; i++) {
      const edge = edges[zoom.top + i];
      if (!edge) break;
      const y = rect.y + ZOOM_HEAD + i;
      const walked = overlay?.pairs.has(`${edge.from}\0${edge.to}`) === true;
      const style = zoom.top + i === at ? THEME.selected : edge.group === "unresolved" ? { ...THEME.text, fg: 179 } : overlay && !walked ? { ...THEME.text, fg: 240 } : THEME.text;
      grid.fill(rect.x, y, rect.width, 1, style);
      const { text, right } = zoomEdgeText(zoom.focus, edge, walked);
      grid.write(rect.x + 1, y, text, style, rect.width - stringWidth(right) - 3);
      grid.write(rect.x + rect.width - stringWidth(right) - 1, y, right, style);
    }
    return;
  }
  const selected = Math.max(0, Math.min(zoom.selected.get(zoomSelectKey(zoom)) ?? 0, level.rows.length - 1));
  if (level.rows.length === 0) grid.write(rect.x + 2, rect.y + ZOOM_HEAD, "nothing inside: - goes up", THEME.hint);
  for (let i = 0; i < height; i++) {
    const index = zoom.top + i;
    const row = level.rows[index];
    if (!row) break;
    const y = rect.y + ZOOM_HEAD + i;
    const off = overlay !== null && row.kind !== "more" && !overlay.steps.has(row.id);
    const style = index === selected ? THEME.selected : off ? { ...THEME.text, fg: 240 } : row.kind === "more" || row.distance > 0 ? { ...THEME.text, fg: 245 } : THEME.text;
    grid.fill(rect.x, y, rect.width, 1, style);
    const { text, right } = zoomRowText(state, row, rect.width, overlay);
    grid.write(rect.x + 1, y, text, style, rect.width - stringWidth(right) - 3);
    if (right !== "") {
      const mark = overlay ? stepsMark(overlay, overlay.steps.get(row.id) ?? []) : row.mark;
      const markStyle = mark ? { ...style, ...MARK_STYLE[mark], bg: style.bg ?? THEME.text.bg! } : style;
      grid.write(rect.x + rect.width - stringWidth(right) - 1, y, right.slice(0, 1), markStyle);
      grid.write(rect.x + rect.width - stringWidth(right) - 1 + 1, y, right.slice(1), style);
    }
  }
}

const DECISION_GLYPH = { pending: "·", accepted: "a", rejected: "r" } as const;

function drawMerge(grid: Grid, state: State, rect: Rect): void {
  const merge = state.merge!;
  const rows = mergeRows(merge.base, merge.hunks);
  grid.fill(rect.x, rect.y, rect.width, 1, THEME.panelTitle);
  const counts = { accepted: 0, rejected: 0, pending: 0 };
  for (const decision of merge.decisions) counts[decision]++;
  const title = `MERGE ${merge.path} · ${merge.origin} · hunk ${merge.current + 1}/${merge.hunks.length} · ${counts.accepted} accepted, ${counts.rejected} rejected, ${counts.pending} pending`;
  grid.write(rect.x + 1, rect.y, title, THEME.panelTitle, rect.width - 2);
  for (let i = 0; i < rect.height - 1; i++) {
    const row = rows[merge.top + i];
    if (!row) break;
    const y = rect.y + 1 + i;
    const current = row.hunk === merge.current;
    const decision = row.hunk === null ? null : merge.decisions[row.hunk]!;
    let style: Style = row.kind === "added" ? THEME.added : row.kind === "removed" ? THEME.removed : THEME.text;
    // What the result will hold: a rejected addition and an accepted removal are shown struck out (dim).
    if ((row.kind === "added" && decision === "rejected") || (row.kind === "removed" && decision === "accepted")) style = { ...style, dim: true };
    grid.fill(rect.x, y, rect.width, 1, style);
    grid.write(rect.x, y, current ? "▌" : " ", { ...style, fg: 75 });
    grid.write(rect.x + 1, y, decision === null ? " " : DECISION_GLYPH[decision], { ...style, bold: true });
    grid.write(rect.x + 3, y, row.kind === "added" ? "+" : row.kind === "removed" ? "-" : " ", style);
    grid.write(rect.x + 5, y, row.text, style, rect.width - 5);
  }
}

function drawPanelList(grid: Grid, rect: Rect, title: string, entries: { text: string; mark: { glyph: string; style: Style } | null; style?: Style }[], selected: number, focused: boolean, top: number): void {
  grid.fill(rect.x, rect.y, rect.width, rect.height, THEME.panel);
  grid.write(rect.x, rect.y, padWidth(` ${title}`, rect.width), THEME.panelTitle);
  for (let i = 0; i < rect.height - 1; i++) {
    const entry = entries[top + i];
    if (!entry) break;
    const y = rect.y + 1 + i;
    const style = top + i === selected && focused ? THEME.selected : top + i === selected ? { ...THEME.panel, bg: 237 } : { ...THEME.panel, ...(entry.style ?? {}) };
    grid.write(rect.x, y, padWidth(` ${entry.text}`, rect.width - 2), style);
    grid.write(rect.x + rect.width - 2, y, "  ", style);
    if (entry.mark) grid.write(rect.x + rect.width - 2, y, entry.mark.glyph, { ...style, ...entry.mark.style, ...(top + i === selected && focused ? { bg: THEME.selected.bg! } : {}) });
  }
}

export function navEntries(state: State): NavItem[] {
  return navItems(state.analysis, state.navExpanded);
}

/** Most rows the explanation of the selected node takes at the bottom of the nav panel. */
const NAV_NOTE_ROWS = 4;

/**
 * The explanation of the node selected in the nav panel, wrapped to `width`
 * cells with its origin (`code`, or `llm · model · date`, `stale`); none for a
 * node without one or an item that is no node.
 */
export function navNote(state: State, width: number): string[] {
  const item = navEntries(state)[state.navIndex];
  const snapshot = state.analysis?.snapshot;
  if (!item?.id || !snapshot || width < 8) return [];
  const e = explanationOf(snapshot, state.briefs, item.id);
  if (!e) return [];
  const origin = e.origin === "doc" ? "code" : `llm · ${e.agent ?? "?"} · ${e.date ?? "?"}${e.stale ? " · stale" : ""}`;
  const rows = wrapWords(`${e.text} (${origin})`, width);
  return rows.length > NAV_NOTE_ROWS ? [...rows.slice(0, NAV_NOTE_ROWS - 1), `${rows[NAV_NOTE_ROWS - 1]!.slice(0, Math.max(0, width - 1))}…`] : rows;
}

/** Words of `text` in rows of at most `width` cells; a longer word is cut. */
function wrapWords(text: string, width: number): string[] {
  const rows: string[] = [];
  let row = "";
  for (const word of text.split(/\s+/).filter((w) => w !== "")) {
    const next = row === "" ? word : `${row} ${word}`;
    if (stringWidth(next) <= width) row = next;
    else {
      if (row !== "") rows.push(row);
      row = stringWidth(word) <= width ? word : graphemes(word).slice(0, width).join("");
    }
  }
  if (row !== "") rows.push(row);
  return rows;
}

/** Rows of the nav panel's list: what the explanation of the selected node leaves. */
export function navListHeight(state: State, rect: Rect): number {
  const note = navNote(state, rect.width - 2).length;
  return note === 0 ? rect.height : Math.max(2, rect.height - note - 1);
}

function drawNav(grid: Grid, state: State, rect: Rect): void {
  const note = navNote(state, rect.width - 2);
  const listHeight = navListHeight(state, rect);
  if (note.length > 0) {
    const y = rect.y + listHeight;
    grid.fill(rect.x, y, rect.width, rect.height - listHeight, THEME.panel);
    grid.write(rect.x, y, "─".repeat(rect.width), { ...THEME.panel, fg: 238 });
    note.forEach((row, i) => grid.write(rect.x + 1, y + 1 + i, row, { ...THEME.panel, fg: 250 }, rect.width - 2));
    rect = { ...rect, height: listHeight };
  }
  const stale = state.updating || state.outdated;
  const entries = navEntries(state).map((item) => {
    const arrow = item.parent ? (item.expanded ? "▾ " : "▸ ") : item.kind === "heading" ? "" : "  ";
    return {
      text: `${"  ".repeat(item.depth)}${arrow}${item.label}`,
      mark: item.mark ? { glyph: MARK_GLYPH[item.mark], style: stale ? { ...MARK_STYLE[item.mark], dim: true } : MARK_STYLE[item.mark] } : null,
      ...(item.kind === "heading" ? { style: { fg: 111, bold: true } } : {}),
    };
  });
  drawPanelList(grid, rect, "NAVIGATION", entries, state.navIndex, state.focus === "nav", state.navTop);
}

/** What goes to the model: kind, label and tokens per item; `◇` planned, `?` incomplete data. */
function drawContext(grid: Grid, state: State, rect: Rect): void {
  const buffer = state.current ? state.buffers.get(state.current) : undefined;
  const pack = buffer && state.analysis ? contextPack(state.analysis, { path: buffer.path, text: buffer.text, line: state.cursor.line, added: state.context.added, removed: state.context.removed }) : null;
  const entries = (pack?.items ?? []).map((item) => ({
    text: `${item.kind.padEnd(8)} ${item.label} · ${item.tokens}`,
    mark: item.planned ? { glyph: "◇", style: { fg: 141 } } : item.incomplete ? { glyph: "?", style: { fg: 179 } } : null,
  }));
  drawPanelList(grid, rect, pack ? `CONTEXT · ${pack.tokens} tok · @ add · x drop` : "CONTEXT · analyzing…", entries, state.context.index, state.focus === "context", contextTop(state.context.index, rect));
}

/** First item shown in the context panel: the list scrolls to keep the selected item in view. A click maps rows the same way. */
export function contextTop(index: number, rect: Rect): number {
  return Math.max(0, index - rect.height + 2);
}

function drawFiles(grid: Grid, state: State, rect: Rect): void {
  const entries = state.files.map((file) => {
    const buffer = state.buffers.get(file);
    const dirty = buffer && isDirty(buffer) ? " +" : "";
    const proposal = state.proposals.includes(file) ? " ≈" : "";
    return { text: `${file}${dirty}${proposal}`, mark: null, ...(file === state.current ? { style: { fg: 231, bold: true } } : {}) };
  });
  drawPanelList(grid, rect, "FILES", entries, state.filesIndex, state.focus === "files", filesTop(state, rect));
}

/** First file shown in the panel: the list scrolls to keep the selected file in view. A click maps rows the same way. */
export function filesTop(state: Pick<State, "filesIndex">, rect: Rect): number {
  return Math.max(0, state.filesIndex - rect.height + 2);
}

// ---------- F6 results panel ----------

/** How the F6 panel splits: the entries list on top, the content of the selected entry below. */
export function resultsSplit(state: State, height: number): { list: number; report: number } {
  const entries = state.records.length + 1; // the pinned current analysis, then the records
  const list = Math.max(1, Math.min(entries, Math.floor((height - 4) / 2)));
  return { list, report: height - list - 2 };
}

/**
 * Why the shown analysis is not a plain current check: a failed run, an update
 * in flight, changes since the analysis, or unsaved buffers taken as overlay.
 */
export function findingStateRow(state: State): string | null {
  const unsaved = [...state.buffers.values()].filter((buffer) => !buffer.readOnly && isDirty(buffer)).map((buffer) => buffer.path);
  const parts: string[] = [];
  if (state.config.kind === "invalid-config") parts.push(`invalid keylang.json: ${state.config.reason}`);
  if (state.error !== null) parts.push(`outdated: ${state.error}`);
  else if (state.outdated && !state.updating) parts.push("outdated: changes since this analysis");
  if (state.updating) parts.push("updating…");
  if (unsaved.length > 0) parts.push(`unsaved inputs: ${unsaved.join(", ")}`);
  const note = configNote(state);
  if (note !== null) parts.push(note);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Rows above the list for the full message of the selected finding and for its metadata. */
const DETAIL_MESSAGE_ROWS = 3;
const DETAIL_META_ROWS = 2;

/**
 * The details of the selected finding, wrapped to `width`: its full message
 * (the list row cuts it) and then criterion, provenance, snapshot and reason;
 * without a selection, why the list is empty. Always the same number of rows,
 * so the list does not jump while the selection moves.
 */
export function findingDetailRows(state: State, width: number): string[] {
  const selected = visibleFindings(findingsOf(state.analysis), state.results.filter)[state.results.finding];
  if (!selected) {
    const why =
      state.analysis === null ? (state.error !== null ? "the analysis failed; no report yet" : (noSnapshotReason(state) ?? "analyzing…")) : "no findings match the filter";
    return padRows([why]);
  }
  return padRows([...clipRows(wrapCells(selected.evidence, width), DETAIL_MESSAGE_ROWS, width), ...clipRows(wrapCells(findingDetailText(selected), width), DETAIL_META_ROWS, width)]);
}

/** The first `count` rows; a cut ends with `…`. */
function clipRows(rows: string[], count: number, width: number): string[] {
  return rows.length > count ? [...rows.slice(0, count - 1), `${fitWidth(rows[count - 1]!, width - 1)}…`] : rows;
}

function padRows(rows: string[]): string[] {
  return [...rows, ...Array<string>(Math.max(0, DETAIL_MESSAGE_ROWS + DETAIL_META_ROWS - rows.length)).fill("")];
}

/** `text` cut into rows of at most `width` cells, at spaces where it can. */
function wrapCells(text: string, width: number): string[] {
  const rows: string[] = [];
  let rest = text;
  while (stringWidth(rest) > width && width > 0) {
    const fit = fitWidth(rest, width);
    const space = fit.lastIndexOf(" ");
    // A cluster wider than the row still takes one row, so the loop always advances.
    const cut = space > 0 ? space : Math.max(fit.length, graphemes(rest)[0]!.length);
    rows.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  rows.push(rest);
  return rows;
}

/** Rows the findings list takes inside the panel `rect`: the counts, the state and the details of the selected finding come first. */
export function findingsListRows(state: State, rect: Rect): number {
  const { report } = resultsSplit(state, rect.height);
  const detail = findingDetailRows(state, rect.width - 2).length;
  return Math.max(1, report - detail - (findingStateRow(state) === null ? 0 : 1));
}

/** The F6 panel over the editor area: the entries on top, the content of the selected entry below. */
function drawResults(grid: Grid, state: State, rect: Rect): void {
  const results = state.results;
  const records = state.records;
  const analysis = results.entry === "analysis";
  const record = records[results.index];
  // What Tab selects in the record's report (a feature's gaps, a check's results, an edge's evidence…), and its name.
  const checked = !analysis && reportItems(state).length > 0;
  const gaps = checked && record?.result?.kind === "feature";
  const item = record === undefined ? "finding" : itemNoun(record.kind);
  // The readiness screen offers the model's questions only while an agent is set; without one `m` says how to set it (c4-zoom/11).
  const ask = record?.result?.kind === "feature" && record.result.payload !== null && state.analysis !== null && selectedAgent(state.analysis.config.agent) !== null ? " · m questions" : "";
  const exportable = !analysis && record !== undefined && !("reason" in exportRecord(state));
  // Esc only folds the panel; x is the separate Cancel of the running operation (design §4).
  const proposed = (record?.result?.kind === "draft-flow" || record?.result?.kind === "draft-rules" || record?.result?.kind === "code-to-spec" || record?.result?.kind === "feature-questions") && record.result.payload?.proposal != null;
  const codeProposed = record?.result?.kind === "spec-to-code" && (record.result.payload?.proposals.length ?? 0) > 0;
  const hint = analysis
    ? " Enter open · Tab findings · Esc back "
    : record?.status === "running"
      ? " x cancel · Esc back "
      : proposed
        ? " Enter open MERGE · Esc back "
        : codeProposed
        ? " Enter pick a proposal · Esc back "
        : record?.result?.kind === "spec-to-code" && record.status === "completed" && record.result.payload !== null && record.outdated === null
        ? " Enter rerun · a apply all · Esc back "
        : record?.result?.kind === "draft-layout" && record.result.payload !== null && record.outdated === null
        ? " Enter move layers into keylang.json · Esc back "
        : gaps
        ? results.scrollReport
          ? ` Enter open gap · Tab entries${ask} · Esc back `
          : ` Enter rerun · Tab gaps${ask} · Esc back `
        : ask !== ""
        ? ` Enter rerun${ask} · Esc back `
        : checked
          ? results.scrollReport
            ? ` Enter open ${item} · Tab entries${exportable ? " · e export" : ""} · Esc back `
            : ` Enter rerun · Tab ${item === "evidence" ? item : `${item}s`}${exportable ? " · e export" : ""} · Esc back `
          : exportable
            ? " Enter rerun · e export · Esc back "
            : " Enter rerun · Esc back ";
  // Sideways scrolling is named only where a row is cut.
  const wide = !analysis && results.scrollReport && reportOverflow(resultsReportRows(state), rect.width - 4) > 0;
  const shown = wide ? hint.replace(" · Esc back ", " · ←→ scroll · Esc back ") : hint;
  grid.fill(rect.x, rect.y, rect.width, 1, THEME.panelTitle);
  grid.write(rect.x + 1, rect.y, `RESULTS · F6 · ${records.length} run(s)`, THEME.panelTitle, rect.width - 2);
  // On a narrow panel the keys win over the title: they are the way on and back.
  grid.write(Math.max(rect.x, rect.x + rect.width - stringWidth(shown) - 1), rect.y, shown, THEME.panelTitle, rect.width);
  const { list: listHeight } = resultsSplit(state, rect.height);
  const entryIndex = analysis ? 0 : results.index + 1;
  const first = Math.max(0, Math.min(entryIndex, records.length + 1 - listHeight));
  const counts = findingCounts(findingsOf(state.analysis));
  for (let i = 0; i < listHeight; i++) {
    const at = first + i;
    const y = rect.y + 1 + i;
    const selected = at === entryIndex && !results.scrollReport;
    const style = selected ? THEME.selected : i % 2 === 0 ? THEME.panel : { ...THEME.panel, bg: 234 };
    grid.fill(rect.x, y, rect.width, 1, style);
    if (at === 0) {
      // The pinned current analysis, with the full counts of the report (findings, not gutter lines).
      const summary = VERDICTS.map((verdict) => `${FINDING_GLYPH[verdict]} ${counts[verdict]}`).join(" ");
      grid.write(rect.x + 1, y, `1  Current analysis · ${summary}`, style, rect.width - 2);
    } else {
      const record = records[at - 1]!;
      grid.write(rect.x + 1, y, `${at + 1}  ${recordLabel(record)}  ${recordStatus(record)}`, style, rect.width - 2);
    }
  }
  const dividerY = rect.y + 1 + listHeight;
  grid.fill(rect.x, dividerY, rect.width, 1, THEME.panel);
  grid.write(rect.x, dividerY, "─".repeat(rect.width), { ...THEME.panel, fg: 238 });
  if (analysis) return drawFindings(grid, state, rect, dividerY);
  const rows = resultsReportRows(state);
  // A long row is cut at the panel's edge with `…`; ←→ (after Tab) scroll the report sideways to read it whole.
  const left = Math.max(0, Math.min(results.left, reportOverflow(rows, rect.width - 4)));
  for (let i = 0; i < rect.height - listHeight - 2; i++) {
    const row = rows[results.top + i];
    const y = dividerY + 1 + i;
    // Below the report's end the panel stays a panel: the editor never shows through it.
    if (!row) {
      grid.fill(rect.x, y, rect.width, 1, THEME.panel);
      continue;
    }
    grid.fill(rect.x, y, rect.width, 1, row.style);
    grid.write(rect.x + 1, y, results.scrollReport ? "▌" : " ", { ...row.style, fg: 75 });
    grid.write(rect.x + 3, y, sliceCells(row.text, left, rect.width - 4), row.style, rect.width - 4);
  }
}

/**
 * How far ←→ can scroll the report: until the widest row ends in view. A
 * scrolled row starts with `…` in a cell of its own (`sliceCells`), so that
 * is one cell more than the row exceeds `width` by; 0 when every row fits.
 */
export function reportOverflow(rows: readonly { text: string }[], width: number): number {
  let widest = 0;
  for (const row of rows) widest = Math.max(widest, stringWidth(row.text));
  return widest > width ? widest - width + 1 : 0;
}

/** The full findings report of the current analysis: counts, filters, the selected finding's details, and the list. */
function drawFindings(grid: Grid, state: State, rect: Rect, dividerY: number): void {
  const results = state.results;
  const all = findingsOf(state.analysis);
  const visible = visibleFindings(all, results.filter);
  const counts = findingCounts(all);
  const hidden = all.length - visible.length;
  // The full counts and the filter never change the report; the hidden count is visible.
  const countsRow: { text: string; style: Style }[] = [];
  for (const verdict of VERDICTS) {
    countsRow.push({ text: `${FINDING_GLYPH[verdict]} ${counts[verdict]} `, style: { ...MARK_STYLE[verdict], ...(results.filter[verdict] ? {} : { dim: true, fg: 243 }) } });
  }
  countsRow.push(
    { text: `· ${all.length} findings`, style: { ...THEME.panel, fg: 243 } },
    { text: ` · ${hidden} hidden`, style: { ...THEME.panel, fg: hidden > 0 ? 179 : 243 } },
    { text: " · f/u/w/o filter", style: { ...THEME.panel, fg: 243 } },
  );
  grid.fill(rect.x, dividerY, rect.width, 1, THEME.panel);
  let x = rect.x + 1;
  for (const part of countsRow) x += grid.write(x, dividerY, part.text, part.style, rect.x + rect.width - x);
  let y = dividerY + 1;
  const stateRow = findingStateRow(state);
  if (stateRow) {
    grid.fill(rect.x, y, rect.width, 1, THEME.panel);
    grid.write(rect.x + 1, y, stateRow, state.error !== null ? { ...THEME.panel, fg: 160 } : { ...THEME.panel, fg: 179 }, rect.width - 2);
    y++;
  }
  for (const detail of findingDetailRows(state, rect.width - 2)) {
    if (y >= rect.y + rect.height) break;
    grid.fill(rect.x, y, rect.width, 1, THEME.panel);
    grid.write(rect.x + 1, y, detail, { ...THEME.panel, fg: 250 }, rect.width - 2);
    y++;
  }
  const listTop = y;
  for (let i = 0; listTop + i < rect.y + rect.height; i++) {
    const result = visible[results.top + i];
    if (!result) break;
    const isSelected = results.top + i === results.finding && results.scrollReport;
    const style = isSelected ? THEME.selected : THEME.panel;
    grid.fill(rect.x, listTop + i, rect.width, 1, style);
    grid.write(rect.x + 1, listTop + i, FINDING_GLYPH[result.verdict], { ...style, ...MARK_STYLE[result.verdict] });
    grid.write(rect.x + 3, listTop + i, findingRow(result), style, rect.width - 4);
  }
}

function drawHover(grid: Grid, state: State, editor: Rect): void {
  const hover = state.hover!;
  const width = Math.min(editor.width - 2, Math.max(24, ...hover.lines.map((line) => stringWidth(line.text) + 4)), 72);
  const height = Math.min(hover.lines.length + 2, Math.max(3, editor.height - 1));
  const x = Math.max(editor.x, Math.min(hover.x, editor.x + editor.width - width));
  const below = hover.y + 1 + height <= editor.y + editor.height;
  const y = below ? hover.y + 1 : Math.max(editor.y, hover.y - height);
  drawBox(grid, { x, y, width, height }, "", THEME.popup, THEME.popupTitle);
  hover.lines.slice(0, height - 2).forEach((line, i) => {
    const style = line.kind === "title" ? THEME.popupTitle : line.kind === "code" ? { ...THEME.popup, fg: 180 } : line.kind === "evidence" ? { ...THEME.popup, fg: 250 } : line.kind === "rule" ? { ...THEME.popup, fg: 243 } : THEME.popup;
    grid.write(x + 2, y + 1 + i, line.kind === "rule" ? "─".repeat(width - 4) : line.text, style, width - 4);
  });
}

function drawCompletion(grid: Grid, state: State, editor: Rect, buffer: Buffer): void {
  const completion = state.completion!;
  const visible = completion.items.slice(Math.max(0, completion.index - 7), Math.max(0, completion.index - 7) + 8);
  const offset = Math.max(0, completion.index - 7);
  const width = Math.min(editor.width - 4, Math.max(20, ...visible.map((item) => stringWidth(item.label) + stringWidth(item.detail ?? "") + 5)), 70);
  const x = Math.min(editor.x + gutterWidth(buffer) + cellsBetween(lineLayout(buffer, state.cursor.line), state.left, completion.from), editor.x + editor.width - width);
  const rowY = editor.y + state.cursor.line - state.top;
  const height = visible.length + 2;
  const y = rowY + 1 + height <= editor.y + editor.height ? rowY + 1 : Math.max(editor.y, rowY - height);
  drawBox(grid, { x, y, width, height }, `${completion.items.length} ids`, THEME.popup, THEME.popupTitle);
  visible.forEach((item, i) => {
    const selected = offset + i === completion.index;
    const style = selected ? THEME.selected : THEME.popup;
    const detail = item.labelDetails?.description === "planned" ? `planned ${item.detail ?? ""}` : (item.detail ?? "");
    grid.write(x + 1, y + 1 + i, padWidth(` ${item.label}  ${detail}`, width - 2), style);
  });
}

/** The keys of each mode as key and meaning; the help lays them out in two columns where they fit. */
const HELP: Record<string, [string, string][]> = {
  zoom: [
    ["↑↓ PgUp PgDn g G", "move"],
    ["+ / Enter", "zoom into a layer, module or class"],
    ["Enter on fn or type", "its code; Esc comes back here"],
    ["- / Esc / Backspace", "one level up; at the top Esc closes, the view stays put"],
    ["> / <", "neighbors one edge farther / nearer (0–3)"],
    ["s", "find a node and zoom to its level"],
    ["e / K", "explain the node"],
    ["c", "the level's edges as rows: in, out, packages, inside, unresolved"],
    ["f", "lay a flow over the levels: its steps numbered in the order written; f again takes it off"],
    ["F", "the next flow through this level"],
    ["x", "explain an edge: on an edge row its edges; on nodes, x then x on another"],
    ["Alt+Enter", "go to its declaration"],
    ["q", "back to the view at the node"],
    [": / Ctrl+P", "actions"],
    ["F6", "results"],
    ["Ctrl+Z", "stop keylang (a terminal; fg resumes it)"],
  ],
  view: [
    ["↑↓ PgUp PgDn g G", "move"],
    ["Enter / Ctrl+click", "go to code"],
    ["z", "zoom: the map level by level"],
    ["K / mouse hover", "hover"],
    ["Alt+Enter", "go to spec"],
    ["Tab", "next panel"],
    ["Ctrl+O", "back"],
    ["F2 / F3", "files / nav"],
    ["v", "reading mode"],
    ["F5", "check again"],
    ["i", "edit"],
    ["m", "merge or list"],
    ["u", "undo last merge"],
    ["/  n", "search"],
    [": / Ctrl+P", "actions"],
    ["F6", "results"],
    ["q / Ctrl+C", "quit"],
    ["?", "keys, explain"],
    ["e", "explain id"],
    ["F4", "agent context"],
    ["t", "explained map"],
    ["s", "find a node"],
    ["Ctrl+Space", "agent draft as MERGE"],
    ["in context", "@ add id · x drop · Esc close"],
    ["Ctrl+Z", "stop keylang (a terminal; fg resumes it)"],
  ],
  edit: [
    ["type", "edit"],
    ["Ctrl+S", "save"],
    ["Ctrl+Space", "complete IDs"],
    ["Tab / Enter", "accept completion"],
    ["Shift+↑↓", "select lines"],
    ["Ctrl+G", "text → spec (MERGE)"],
    ["Ctrl+Z", "undo"],
    ["Esc", "back to view"],
    ["Ctrl+R", "voice"],
    ["Tab / Alt+]", "ghost line: take / next"],
    ["Ctrl+P", "actions, help"],
    ["F6", "results"],
    ["? and :", "typed here: Ctrl+P → Keys and help opens this"],
  ],
  merge: [
    ["n / N  ↑↓", "next / previous hunk"],
    ["a / r", "accept / reject hunk"],
    ["u", "undo last decision"],
    ["w", "write result"],
    ["Esc", "cancel (nothing written)"],
    ["Ctrl+P", "catalogue: read-only actions work, the rest say why"],
  ],
  code: [
    ["↑↓ PgUp PgDn", "scroll"],
    ["Esc / Ctrl+O / q", "back"],
    ["Ctrl+P", "action palette"],
    ["F6", "results"],
    ["Ctrl+Z", "stop keylang (a terminal; fg resumes it)"],
  ],
  read: [
    ["↑↓", "move"],
    ["Enter", "go to code"],
    ["v / Esc", "raw Markdown"],
    ["Ctrl+Z", "stop keylang (a terminal; fg resumes it)"],
  ],
};

/** The key rows of a mode: two pairs a row where both fit in `width`, else one; a long pair takes its own row. */
function keyRows(pairs: readonly [string, string][], width: number): string[] {
  const cells = pairs.map(([key, meaning]) => `${padWidth(key, 18)} ${meaning}`);
  const column = KEY_COLUMN;
  const rows: string[] = [];
  for (let i = 0; i < cells.length; i++) {
    const left = cells[i]!;
    const right = cells[i + 1];
    if (width >= column * 2 && stringWidth(left) < column && right !== undefined && stringWidth(right) <= column) {
      rows.push(`${padWidth(left, column)}${right}`);
      i++;
    } else rows.push(left);
  }
  return rows;
}

/** Cells of one column of the help's key rows. */
const KEY_COLUMN = 36;

/**
 * The rows of the help popup, wrapped to `width`: the keys of the mode, the
 * offline help of the line's diagnostic, then the whole catalogue by group —
 * the same registry the palette searches, with each key as the mode has it
 * and the reason of each unavailable action.
 */
export function helpRows(state: State, width: number): string[] {
  const buffer = state.current ? (state.buffers.get(state.current) ?? null) : null;
  const lines: string[] = [];
  // The diagnostic of the cursor line comes first: it is why `?` was pressed there.
  if (buffer && state.analysis) {
    const item = evidenceOf(state.analysis, buffer.path).get(state.cursor.line + 1);
    const code = item?.diagnostics[0]?.code;
    const explained = code ? explainCode(code) : null;
    if (explained) lines.push(...explained.split("\n"), "");
  }
  lines.push(...keyRows(HELP[state.mode] ?? HELP.view!, width));
  const entries = catalog(state);
  lines.push("", `Actions · Ctrl+P${state.mode === "view" || state.mode === "read" ? " or :" : ""} finds each by its name or CLI alias:`);
  const groups = [...new Set(ACTIONS.map((action) => action.group))];
  for (const group of groups) {
    lines.push(`${group}:`);
    for (const entry of entries) {
      if (entry.action.group !== group || entry.action.id.startsWith("open:")) continue;
      const key = actionKey(entry.action, state.mode);
      lines.push(`  ${entry.action.label}${key !== null ? ` · ${key}` : ""}${entry.reason !== null ? ` — ${entry.reason}` : ""}`);
    }
  }
  const files = entries.filter((entry) => entry.action.id.startsWith("open:")).length;
  lines.push(`Files:`, `  Open <file> for each of the ${files} file(s) — type its name`);
  // A wrapped row goes on under its text, indented past the line's own indent.
  return lines.flatMap((line) => {
    const indent = " ".repeat((/^ */.exec(line)?.[0].length ?? 0) + 2);
    const [first, ...rest] = wrapCells(line, width);
    return [first!, ...rest.flatMap((row) => wrapCells(`${indent}${row}`, width))];
  });
}

/** Where the help popup draws, its rows and how many of them show at once. */
function helpBox(state: State): { rect: Rect; rows: string[]; visible: number } {
  const panel = layout(state).panel;
  const width = Math.max(10, Math.min(panel.width, 96));
  const rows = helpRows(state, width - 4);
  const height = Math.min(panel.height, rows.length + 2);
  // A scrolled help keeps its last row for where it is and how to move.
  const visible = rows.length > height - 2 ? Math.max(1, height - 3) : height - 2;
  return { rect: { x: panel.x + Math.max(0, Math.floor((panel.width - width) / 2)), y: panel.y, width, height }, rows, visible };
}

/** The last first row the help can scroll to. */
export function helpScrollMax(state: State): number {
  const box = helpBox(state);
  return Math.max(0, box.rows.length - box.visible);
}

function drawHelp(grid: Grid, state: State): void {
  const { rect, rows, visible } = helpBox(state);
  const top = Math.max(0, Math.min(state.helpTop, rows.length - visible));
  drawBox(grid, rect, `keys · ${state.mode}`, THEME.popup, THEME.popupTitle);
  rows.slice(top, top + visible).forEach((line, i) => grid.write(rect.x + 2, rect.y + 1 + i, line, THEME.popup, rect.width - 4));
  if (visible < rows.length) grid.write(rect.x + 2, rect.y + rect.height - 2, `${top + 1}–${top + visible} of ${rows.length} · ↑↓ PgUp PgDn scroll · any other key closes`, { ...THEME.popup, fg: 243 }, rect.width - 4);
}

/**
 * How the prompt line and the box over the editor show each kind of prompt:
 * the label before the typed text; what stands as typed when a form types
 * into its rows (the prompt's text otherwise); the box's title; and whether
 * the selected item's note follows on the line (a search, a context ID, a
 * node or a flow have none).
 */
interface PromptLook {
  label: string | ((prompt: Prompt) => string);
  typed?: (prompt: Prompt) => string | null;
  title?: (prompt: Prompt) => string;
  noted: boolean;
}

const PROMPT_LOOKS: { [K in Prompt["kind"]]: PromptLook } = {
  search: { label: "/", noted: false },
  context: { label: "@", noted: false },
  node: { label: "node: ", title: (prompt) => `${prompt.items.length} node(s)`, noted: false },
  flow: { label: "flow: ", title: (prompt) => `${prompt.items.length} flow(s) · Enter lays it over the levels`, noted: false },
  palette: { label: ":", title: (prompt) => `${prompt.items.length} action(s)`, noted: true },
  feature: { label: "feature slug: ", title: (prompt) => `${prompt.items.length} feature file(s)`, noted: true },
  proposal: { label: "proposal: ", title: (prompt) => `${prompt.items.length} proposal(s)`, noted: true },
  "new-spec": { label: (prompt) => newSpecLabel(prompt.form?.field), title: () => "kind of the new spec", noted: true },
  baseline: { label: "baseline: ", title: () => "baseline rules", noted: true },
  agents: { label: "agents (auto, none, claude,codex…): ", title: () => "harness integrations", noted: true },
  init: { label: "init harnesses (auto, none, claude,codex…): ", title: () => "set up keylang", noted: true },
  fmt: { label: "fmt paths: ", title: () => "format specifications", noted: true },
  parse: { label: "parse paths: ", title: () => "parse specifications: Text IR", noted: true },
  "trace-plan": { label: "trace-plan flow: ", title: (prompt) => `${prompt.items.length} flow(s): trace plan`, noted: true },
  explain: {
    label: (prompt) => (prompt.explainModel ? "explain --llm: " : prompt.explainPlan ? "explain " : "explain: "),
    title: (prompt) =>
      prompt.explainModel ? `${prompt.items.length} id(s): explain with the model · ${prompt.explainModel.detail}` : prompt.explainPlan ? "explanations to do · only the batch row asks the model and writes" : `${prompt.items.length} match(es): explain offline`,
    noted: true,
  },
  wire: { label: "wire out: ", title: () => "wiring container", noted: true },
  "full-check": { label: "check paths: ", title: () => "check options", noted: true },
  // The edge form types into its selected row; the status line shows both ids.
  "explain-edge": { label: "explain edge: ", typed: (prompt) => (prompt.edge ? `${prompt.edge.from || "?"} ↔ ${prompt.edge.to || "?"}` : null), title: () => "edge between two ids", noted: true },
  export: { label: "export to: ", title: () => "export the report", noted: true },
  "draft-flow": { label: "draft flow: ", typed: (prompt) => (prompt.draft ? prompt.draft.trigger || "?" : null), title: (prompt) => `draft flow · ${prompt.draft?.mode ?? "algo"}`, noted: true },
  "draft-rules": { label: "draft rules: ", typed: (prompt) => (prompt.rulesDraft ? prompt.rulesDraft.into || "(default target)" : null), title: (prompt) => `draft rules · ${prompt.rulesDraft?.mode ?? "algo"}`, noted: true },
  "draft-layout": { label: "draft map: ", typed: (prompt) => (prompt.layoutDraft ? `--mode ${prompt.layoutDraft.mode}` : null), title: (prompt) => `draft map · ${prompt.layoutDraft?.mode ?? "algo"}`, noted: true },
  "code-to-spec": {
    label: "code to spec: ",
    typed: (prompt) => {
      const form = prompt.codeDraft;
      if (!form) return null;
      return form.source === "since" ? `--since ${form.since || "?"}` : `${form.file || "?"}${form.line.trim() !== "" ? `:${form.line.trim()}` : ""}`;
    },
    title: (prompt) => `code to spec · ${prompt.codeDraft?.mode ?? "algo"}`,
    noted: true,
  },
  "spec-to-code": { label: "spec to code: ", typed: (prompt) => (prompt.specCode ? prompt.specCode.id || "?" : null), title: (prompt) => `spec to code · ${prompt.specCode?.mode === "llm" ? "llm" : "template"}`, noted: true },
  "export-c4": { label: "export c4: ", title: () => "C4 diagram of the map · no model", noted: true },
};

function drawPrompt(grid: Grid, state: State, rect: Rect, editor: Rect): void {
  const prompt = state.prompt!;
  const look = PROMPT_LOOKS[prompt.kind];
  grid.fill(rect.x, rect.y, rect.width, 1, THEME.status);
  const label = typeof look.label === "string" ? look.label : look.label(prompt);
  const typed = look.typed?.(prompt) ?? prompt.text;
  grid.write(rect.x, rect.y, `${label}${typed}`, THEME.statusKey);
  grid.cursor = { x: Math.min(rect.width - 1, stringWidth(label) + stringWidth(typed)), y: rect.y };
  // A message (a refused Run: which field and why) wins over the note: the prompt covers the message line.
  const noteText = state.message ?? (look.noted ? prompt.note : undefined) ?? "";
  const noted = noteText !== "";
  const noteX = rect.x + 2 + stringWidth(label) + stringWidth(typed);
  // A note cut by the screen's edge (a field's error, an unavailable action's reason) is also shown whole in the form's box.
  const noteCut = noted && stringWidth(`  ${noteText}`) > rect.width - noteX;
  if (noted) {
    // The selected action's group, or why it is unavailable; never a reason to hide it.
    grid.write(noteX, rect.y, `  ${noteText}`, { ...THEME.status, fg: state.message !== null ? 179 : 243 });
  }
  if (prompt.kind === "search" || prompt.kind === "context") return;
  // The list scrolls to keep the selected entry in view.
  const shown = Math.min(10, editor.height - 2);
  const first = Math.max(0, prompt.index - shown + 1);
  const items = prompt.items.slice(first, first + shown);
  if (items.length === 0) return;
  // Rows that describe the form (init: the root, the layout, the files) stand above its choices and are never selected.
  const noteRows = noteCut ? wrapCells(noteText, Math.max(8, editor.width - 4)) : [];
  const details = [...noteRows, ...(prompt.details ?? [])].slice(0, Math.max(0, editor.height - items.length - 3));
  const width = Math.min(editor.width, Math.max(...[...items, ...details].map((item) => stringWidth(item))) + 6);
  const y = editor.y + editor.height - items.length - details.length - 2;
  drawBox(grid, { x: editor.x, y, width, height: items.length + details.length + 2 }, look.title?.(prompt) ?? "", THEME.popup, THEME.popupTitle);
  details.forEach((row, i) => grid.write(editor.x + 1, y + 1 + i, padWidth(` ${row}`, width - 2), { ...THEME.popup, fg: i < noteRows.length ? 179 : 243 }, width - 2));
  items.forEach((item, i) => grid.write(editor.x + 1, y + 1 + details.length + i, padWidth(` ${item}`, width - 2), first + i === prompt.index ? THEME.selected : THEME.popup, width - 2));
}

/** The label of the field the new-spec form is on. */
function newSpecLabel(field: "kind" | "path" | "name" | undefined): string {
  return field === "path" ? "new spec path: " : field === "name" ? "flow name: " : "new spec kind: ";
}

/**
 * The footer keys of each mode: `keys` as many as fit, then `tail`, which
 * always shows — the way to the help and the palette on any width. In editing
 * `?` is typed text, so the tail names Ctrl+P there.
 */
const HINTS: Record<string, { keys: string[]; tail: string }> = {
  view: { keys: ["Enter code", "Alt+Enter spec", "/ search", "s node", "F5 check", "F6 results", "i edit"], tail: "? keys · Ctrl+P actions" },
  edit: { keys: ["Ctrl+S save", "Ctrl+Space complete", "Ctrl+G text→spec", "Esc view"], tail: "Ctrl+P actions, help" },
  read: { keys: ["Enter code", "v raw", "F5 check"], tail: "? keys · Ctrl+P actions" },
  code: { keys: ["Esc back", "↑↓ scroll"], tail: "? keys · Ctrl+P actions" },
  merge: { keys: ["a accept", "r reject", "u undo", "n next", "w write"], tail: "Esc cancel · ? keys" },
  zoom: { keys: ["Enter/+ in", "- up", "> < depth", "c edges", "f flow", "e explain", "s find", "q back"], tail: "? keys · Ctrl+P actions" },
};

/** The footer hint of the mode that fits in `width` cells: the leading keys that fit, and the tail. */
export function footerHint(mode: State["mode"], width: number): string {
  const { keys, tail } = HINTS[mode] ?? HINTS.view!;
  const shown: string[] = [];
  for (const key of keys) {
    if (stringWidth([...shown, key, tail].join(" · ")) > width) break;
    shown.push(key);
  }
  return [...shown, tail].join(" · ");
}

/**
 * Where the analysis takes its settings from, when that is not a plain saved
 * `keylang.json`: a guess (no config), or the saved file while the buffer of
 * `keylang.json` has unsaved edits that do not take effect.
 */
export function configNote(state: State): string | null {
  const parts: string[] = [];
  if (state.config.kind === "missing-config" && state.analysis) parts.push("guessed configuration: no keylang.json, nothing written");
  const buffer = state.buffers.get(CONFIG_FILE);
  if (buffer && isDirty(buffer)) parts.push("keylang.json unsaved: the analysis uses the saved file");
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** The save step before an operation that reads the disk (design §2.5), over the editor area. */
function drawBarrier(grid: Grid, state: State, editor: Rect): void {
  const barrier = state.barrier!;
  const rows: { text: string; style: Style }[] = [];
  if (barrier.writes !== null) {
    rows.push({ text: barrier.writesNote ?? "Writes (generated files only; a manual file stops it):", style: THEME.popup });
    rows.push(...barrier.writes.map((file) => ({ text: `  ${file}`, style: THEME.popup })));
  }
  if (barrier.files.length > 0) {
    rows.push({ text: "The operation reads the files on disk. Unsaved:", style: THEME.popup });
    rows.push(...barrier.files.map((file) => ({ text: `  ${file}`, style: THEME.popup })));
  }
  if (barrier.error !== null) rows.push({ text: `not saved: ${barrier.error}`, style: { ...THEME.popup, ...THEME.error, bg: THEME.popup.bg! } });
  rows.push({ text: "", style: THEME.popup });
  const width = Math.min(editor.width, Math.max(44, ...rows.map((row) => stringWidth(row.text) + 4)));
  const height = Math.min(editor.height, rows.length + 4);
  const x = editor.x + Math.max(0, Math.floor((editor.width - width) / 2));
  const y = editor.y + 1;
  drawBox(grid, { x, y, width, height }, barrier.files.length > 0 ? `Save before ${barrier.action}` : barrier.action, THEME.popup, THEME.popupTitle);
  rows.slice(0, height - 4).forEach((row, i) => grid.write(x + 2, y + 1 + i, row.text, row.style, width - 4));
  const buttonsY = y + height - 3;
  let bx = x + 2;
  bx += grid.write(bx, buttonsY, barrier.files.length > 0 ? "[Save and continue]" : "[Continue]", barrier.choice === "save" ? THEME.selected : THEME.popup, x + width - 2 - bx);
  bx += grid.write(bx, buttonsY, "    ", THEME.popup, x + width - 2 - bx);
  grid.write(bx, buttonsY, "[Back]", barrier.choice === "back" ? THEME.selected : THEME.popup, x + width - 2 - bx);
  grid.write(x + 2, y + height - 2, "←→ choose · Enter do it · Esc back", { ...THEME.popup, fg: 243 }, width - 4);
}

/** The quit step while an operation runs (design §5), over the editor area. */
function drawQuit(grid: Grid, state: State, editor: Rect): void {
  const step = state.quit!;
  const rows = step.waiting
    ? [`Cancelling ${step.label}: waiting for its current file step.`, "The session ends when it settles; unsaved buffers are asked about first."]
    : [`${step.label} is running.`, "Cancel and exit stops it after its current file step; what it wrote stays.", "Unsaved buffers are asked about after it."];
  const width = Math.min(editor.width, Math.max(44, ...rows.map((row) => stringWidth(row) + 4)));
  const height = Math.min(editor.height, rows.length + 5);
  const x = editor.x + Math.max(0, Math.floor((editor.width - width) / 2));
  const y = editor.y + 1;
  drawBox(grid, { x, y, width, height }, "Quit while an operation runs", THEME.popup, THEME.popupTitle);
  rows.slice(0, height - 4).forEach((row, i) => grid.write(x + 2, y + 1 + i, row, THEME.popup, width - 4));
  const buttonsY = y + height - 3;
  if (step.waiting) {
    grid.write(x + 2, buttonsY, "cancelling…", { ...THEME.popup, fg: 179 }, width - 4);
    grid.write(x + 2, y + height - 2, "Esc stay in the session (the cancel goes on)", { ...THEME.popup, fg: 243 }, width - 4);
    return;
  }
  let bx = x + 2;
  bx += grid.write(bx, buttonsY, "[Stay]", step.choice === "stay" ? THEME.selected : THEME.popup, x + width - 2 - bx);
  bx += grid.write(bx, buttonsY, "    ", THEME.popup, x + width - 2 - bx);
  grid.write(bx, buttonsY, "[Cancel and exit]", step.choice === "cancel" ? THEME.selected : THEME.popup, x + width - 2 - bx);
  grid.write(x + 2, y + height - 2, "←→ choose · Enter do it · Esc stay · q cancel and exit", { ...THEME.popup, fg: 243 }, width - 4);
}

/** The start screen of a repository without `keylang.json` (design §2.1): what was found and what can be done. */
function drawStart(grid: Grid, state: State, rect: Rect): void {
  if (state.config.kind !== "missing-config") return;
  const { languages, layers, notes } = state.config;
  grid.fill(rect.x, rect.y, rect.width, rect.height, {});
  const found = languages.length > 0 ? `Found: ${languages.join(", ")}${layers.length > 0 ? ` · layers: ${layers.join(", ")}` : ""}` : "Found: no supported source files (TypeScript, JavaScript, Python, Rust)";
  const rows: { text: string; style: Style }[] = [
    { text: "keylang.json is not here yet", style: THEME.heading },
    { text: `Root: ${state.root}`, style: THEME.text },
    { text: found, style: THEME.text },
    ...notes.map((note) => ({ text: `  ${note}`, style: THEME.comment })),
    { text: "", style: THEME.text },
  ];
  const labels = new Map(ACTIONS.map((action) => [action.id, action.label]));
  START_ACTIONS.forEach((id, index) => rows.push({ text: `${index === state.start ? ">" : " "} ${labels.get(id) ?? id}`, style: index === state.start ? THEME.selected : THEME.text }));
  rows.push({ text: "", style: THEME.text });
  rows.push({ text: "Nothing is written until you choose Init and confirm its form.", style: THEME.hint });
  rows.push({ text: "Enter choose · ↑↓ move · : all actions · ? help · q quit", style: THEME.comment });
  rows.slice(0, rect.height - 1).forEach((row, i) => grid.write(rect.x + 2, rect.y + 1 + i, row.text, row.style, rect.width - 3));
}

export function render(state: State): Grid {
  const grid = new Grid(state.cols, state.rows);
  const area = layout(state);
  const buffer = state.current ? (state.buffers.get(state.current) ?? null) : null;
  // Title
  grid.fill(0, 0, state.cols, 1, THEME.status);
  const dirty = buffer?.newFile ? " [+ new, not on disk]" : buffer && isDirty(buffer) ? " [+]" : "";
  const readOnly = buffer?.readOnly ? " [generated, read-only]" : "";
  grid.write(1, 0, `keylang · ${state.current ?? "no spec files"}${dirty}${readOnly}`, THEME.statusKey, state.cols - 14);
  const modeLabel = ` ${state.mode.toUpperCase()} `;
  grid.write(state.cols - modeLabel.length, 0, modeLabel, { ...THEME.statusKey, bg: state.mode === "edit" ? 28 : state.mode === "merge" ? 94 : state.mode === "zoom" ? 30 : 25 });
  // Body
  // The start screen takes the whole body: there are no panels to show before Browse.
  const start = state.start !== null && state.mode === "view";
  if (area.files && !start) {
    drawFiles(grid, state, area.files);
    grid.fill(area.files.x + area.files.width, area.files.y, 1, area.files.height, { fg: 238 });
    for (let y = area.files.y; y < area.files.y + area.files.height; y++) grid.write(area.files.x + area.files.width, y, "│", { fg: 238 });
  }
  if (area.nav && !start) {
    for (let y = area.nav.y; y < area.nav.y + area.nav.height; y++) grid.write(area.nav.x - 1, y, "│", { fg: 238 });
    if (state.context.open) drawContext(grid, state, area.nav);
    else drawNav(grid, state, area.nav);
  }
  if (start) drawStart(grid, state, { x: 0, y: area.editor.y, width: state.cols, height: area.editor.height });
  else if (state.mode === "code" && state.code) drawCode(grid, state, area.editor);
  else if (state.mode === "zoom" && state.zoom) drawZoom(grid, state, area.editor);
  else if (state.mode === "merge" && state.merge) drawMerge(grid, state, area.editor);
  else if (buffer && state.mode === "read") drawRead(grid, state, area.editor, buffer);
  else if (buffer) drawEditor(grid, state, area.editor, buffer);
  else grid.write(area.editor.x + 2, area.editor.y + 1, state.error ?? "No spec files. Run `keylang init`, then add rules or flows under keylang/.", THEME.hint);
  // Detail line: a transient message, else the finding on the cursor line.
  grid.fill(0, area.detail.y, state.cols, 1, {});
  const item = buffer && state.analysis && state.mode !== "merge" && state.mode !== "code" && state.mode !== "zoom" ? evidenceOf(state.analysis, buffer.path).get(state.cursor.line + 1) : undefined;
  const detail = state.message ? { text: state.message, style: THEME.hint } : lineMessage(item);
  if (detail) grid.write(1, area.detail.y, detail.text, detail.style, state.cols - 2);
  // Status bar
  grid.fill(0, area.status.y, state.cols, 1, THEME.status);
  // The footer's tail (help, palette) is kept on any width: the state texts stop before it.
  const tail = footerHint(state.mode, 0);
  const end = Math.max(1, state.cols - stringWidth(tail) - 2);
  let x = 1;
  const put = (text: string, style: Style): void => {
    x += grid.write(x, area.status.y, text, style, end - x);
  };
  if (state.analysis) {
    const count = totals(state.analysis);
    const stale = state.updating || state.outdated;
    put(`✗ ${count.fail}`, { ...THEME.status, ...MARK_STYLE.fail, bg: THEME.status.bg!, ...(stale ? { dim: true } : {}) });
    put(`  ◌ ${count.unverified}`, { ...THEME.status, ...MARK_STYLE.unverified, bg: THEME.status.bg!, ...(stale ? { dim: true } : {}) });
    put(`  ✓ ${count.ok}`, { ...THEME.status, ...MARK_STYLE.ok, bg: THEME.status.bg!, ...(stale ? { dim: true } : {}) });
  }
  // The open feature file's stage and open questions, as of its last save and analysis (c4-zoom/11).
  const feature = state.featureLine;
  if (feature !== null && feature.path === state.current) put(`  feature ${feature.stage} · questions ${feature.questions}`, { ...THEME.status, fg: 75 });
  const invalid = state.config.kind === "invalid-config" ? state.config.reason : null;
  const phase = state.updating
    ? "  updating… results shown are stale"
    : invalid !== null
      ? `  invalid keylang.json: ${invalid}`
      : state.error
        ? `  outdated: ${state.error}`
        : state.outdated
          ? "  outdated: changes since this analysis"
          : state.analysis
            ? ""
            : state.config.kind === "missing-config"
              ? "  no keylang.json: Browse (Enter) or F5 analyses with a guessed configuration"
              : "  analyzing…";
  // Where the settings come from goes first: a long failure reason must not cut it off.
  const note = configNote(state);
  if (note !== null) put(`  ${note}`, { ...THEME.status, fg: 179 });
  put(phase, { ...THEME.status, fg: (state.error || invalid !== null) && !state.updating ? 160 : 179 });
  // A snapshot is its own property: a valid config may find no sources.
  if (state.analysis && !state.analysis.snapshot) put("  no supported source files", { ...THEME.status, fg: 179 });
  if (state.proposals.length > 0 && state.mode !== "merge") put(`  ≈ ${state.proposals.length} proposal(s): m`, { ...THEME.status, fg: 141 });
  const hints = footerHint(state.mode, state.cols - x - 3);
  grid.write(Math.max(x + 2, state.cols - stringWidth(hints) - 1), area.status.y, hints, THEME.status);
  // Popups
  if (state.results.open && !state.results.viewing) drawResults(grid, state, area.panel);
  if (state.hover && (state.mode === "view" || state.mode === "edit" || state.mode === "read" || state.mode === "zoom")) drawHover(grid, state, area.editor);
  if (state.completion && buffer && state.mode === "edit") drawCompletion(grid, state, area.editor, buffer);
  if (state.help) drawHelp(grid, state);
  if (state.prompt) drawPrompt(grid, state, area.detail, area.panel);
  if (state.barrier) drawBarrier(grid, state, area.panel);
  if (state.quit) drawQuit(grid, state, area.panel);
  return grid;
}
