// Drawing a TUI state into a `Grid`: pure, so a test reads the frame as text.
// Layout: title, [files] | editor with gutter | [navigation], a detail line
// and the status bar. Popups (hover, completion, palette, help) draw on top.

import { selectedAgent } from "../agent-cli.ts";
import { contextPack } from "../agent-context.ts";
import { CONFIG_FILE } from "../config.ts";
import { explainCode } from "../explain.ts";
import { formatSummary } from "../explain-node.ts";
import { briefCounts } from "../explain-inventory.ts";
import type { SavedAnswer } from "../explain-offline.ts";
import { explanationOf, modelName, type NodeExplanation } from "../explanations.ts";
import { ACTIONS, actionKey, catalog, exportRecord, noSnapshotReason, START_ACTIONS } from "./actions.ts";
import { highlightCode } from "./code-highlight.ts";
import { CHANNELS, evidenceOf, MARK_GLYPH, totals, worse, type LineEvidence, type Mark } from "./evidence.ts";
import { FINDING_GLYPH, VERDICTS, findingCounts, findingDetailText, findingRow, findingsOf, visibleFindings } from "./findings.ts";
import { renderMarkdown, type ReadRow } from "./markdown.ts";
import { mergeRows } from "./merge.ts";
import { navItems, type NavItem } from "./nav.ts";
import { circled, flowOverlay, zoomEdges, zoomLevel, zoomSelectKey, ZOOM_ROOT, type FlowOverlay, type ZoomEdge, type ZoomRow } from "./zoom.ts";
import { Grid, type Style } from "./screen.ts";
import { STAGES, type FeatureInfo, type FeatureReport, type Gap, type Hint } from "../feature-status.ts";
import { edgeLine, holeLine } from "../explain-edge.ts";
import { checkSummary, exportFormatOf, WIRE_OUT, type ExportC4Payload, type FeatureQuestionsPayload, type CodeToSpecPayload, type DraftFlowPayload, type DraftRulesPayload, type TracePlanPayload, type ExplainPayload, type ExplainLlmPayload, type ExplainPlanPayload, type ExplainPlanRequest, type ExplainBatchPayload, type ExplainBatchRequest, type ExportPayload, type ExportRequest, type AgentsPayload, type ExplainEdgePayload, type CheckRequest, type AgentsRequest, type BaselinePayload, type FmtFile, type FmtPayload, type GitignoreStage, type InitPayload, type MapCheckPayload, type MapPayload, type OperationRequest, type OperationResult, type ParsePayload, type SpecToCodePayload, type ApplyCodePayload, type WirePayload } from "../operations.ts";
import { PROPOSALS_DIR } from "../proposals.ts";
import { formatDiagnostic, isError } from "../diag.ts";
import type { Buffer, OperationRecord, State } from "./state.ts";
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

/** The registry label of a record's action, with its parameter (the feature slug), or its id. */
function recordLabel(record: OperationRecord): string {
  const label = ACTIONS.find((action) => action.id === record.action)?.label ?? (record.action === "agent-draft" ? "Ctrl+Space: the agent's flow draft" : record.action);
  if (record.params.kind === "baseline") return `${label} · ${record.params.check ? "check" : "write"}`;
  if (record.params.kind === "agents") return `${label} · ${record.params.check ? "check" : "write"} · ${choiceText(record.params.harnesses)}`;
  if (record.params.kind === "init") return `${label} · ${record.params.check ? "check" : "write"} · ${choiceText(record.params.harnesses)}`;
  if (record.params.kind === "fmt") return `${label} · ${record.params.check ? "check" : "write"} · ${record.params.paths.join(" ")}`;
  if (record.params.kind === "wire") return `${label} · ${record.params.check ? "check" : "write"} · ${record.params.out ?? WIRE_OUT}`;
  if (record.params.kind === "check") return `${label} · ${checkParams(record.params)}`;
  if (record.params.kind === "explain-edge") return `${label} · ${record.params.from} ↔ ${record.params.to}`;
  if (record.params.kind === "export") return `${label} · ${exportFormat(record.params)} · ${record.params.path}`;
  if (record.params.kind === "parse") return `${label} · ${record.params.format} · ${record.params.paths.join(" ")}`;
  if (record.params.kind === "trace-plan") return `${label} · ${record.params.flow}`;
  if (record.params.kind === "explain") return `${label} · ${record.params.subject}`;
  if (record.params.kind === "explain-llm") return `${label} · ${record.params.detail ?? "default detail"} · ${record.params.id}`;
  if (record.params.kind === "explain-plan") return `${label} · ${operationLabel(record.params)}`;
  if (record.params.kind === "explain-batch") return `${label} · ${operationLabel(record.params)}`;
  if (record.params.kind === "draft-flow") return `${label} · ${record.params.mode ?? "algo"} · ${record.params.output} · ${record.params.trigger}`;
  if (record.params.kind === "draft-rules") return `${label} · ${record.params.mode ?? "algo"} · ${record.params.output}${record.params.into !== undefined ? ` · ${record.params.into}` : ""}`;
  if (record.params.kind === "draft-layout") return `${label} · ${record.params.mode ?? "algo"}`;
  if (record.params.kind === "code-to-spec") return `${label} · ${record.params.mode ?? "algo"} · ${record.params.output}${record.params.into !== undefined ? ` · ${record.params.into}` : ""}`;
  if (record.params.kind === "spec-to-code") return `${label} · ${record.params.mode ?? "algo"} · ${record.params.output} · ${record.params.id}${record.params.into !== undefined ? ` · ${record.params.into}` : ""}`;
  if (record.params.kind === "apply-code") return `${label} · ${record.params.mode ?? "algo"} · ${record.params.candidate.targets.length} file(s)`;
  if (record.params.kind === "export-c4") return `${label} · ${record.params.format} · ${record.params.level}${record.params.layer !== undefined ? ` · ${record.params.layer}` : ""}${record.params.out !== undefined ? ` · ${record.params.out}` : ""}`;
  return record.params.kind === "feature" || record.params.kind === "feature-questions" ? `${label} · ${record.params.slug}` : label;
}

/** How messages name an operation: `doctor`, `feature pay`. */
export function operationLabel(request: OperationRequest): string {
  if (request.kind === "baseline") return request.check ? "baseline check" : "baseline write";
  if (request.kind === "agents") return request.check ? "agents check" : "agents write";
  if (request.kind === "init") return request.check ? "init check" : "init";
  if (request.kind === "fmt") return request.check ? "fmt check" : "fmt write";
  if (request.kind === "wire") return request.check ? "wire check" : "wire write";
  if (request.kind === "explain-edge") return `check --explain-edge ${request.from} ${request.to}`;
  if (request.kind === "export") return `export ${exportFormat(request)} ${request.path}`;
  if (request.kind === "parse") return request.format === "json" ? "parse --json" : "parse";
  if (request.kind === "trace-plan") return `trace-plan ${request.flow}`;
  if (request.kind === "explain") return `explain ${request.subject}`;
  if (request.kind === "explain-plan") return explainPlanLabel(request);
  if (request.kind === "explain-batch") return explainBatchLabel(request);
  if (request.kind === "explain-llm") return `explain ${request.id} --llm${request.detail === "full" ? " --full" : request.detail === "brief" ? " --brief" : ""}`;
  if (request.kind === "draft-flow") return `draft flow ${request.trigger}${request.mode !== undefined && request.mode !== "algo" ? ` --mode ${request.mode}` : ""}${request.output === "preview" ? " --print" : ""}`;
  if (request.kind === "draft-rules") return `draft rules${request.mode !== undefined && request.mode !== "algo" ? ` --mode ${request.mode}` : ""}${request.into !== undefined ? ` --into ${request.into}` : ""}${request.output === "preview" ? " --print" : ""}`;
  if (request.kind === "code-to-spec") return `code-to-spec ${codeSource(request)} --mode ${request.mode ?? "algo"}${request.into !== undefined ? ` --into ${request.into}` : ""}${request.output === "preview" ? " --print" : ""}`;
  if (request.kind === "spec-to-code") return `spec-to-code ${request.id}${request.into !== undefined ? ` --into ${request.into}` : ""}${request.mode === "llm" ? " --mode llm" : ""}${request.output === "preview" ? " --print" : ""}`;
  if (request.kind === "apply-code") return `spec-to-code ${request.candidate.id}${request.mode === "llm" ? " --mode llm" : ""} --apply`;
  if (request.kind === "draft-layout") return `draft map${request.mode !== undefined && request.mode !== "algo" ? ` --mode ${request.mode}` : ""}`;
  if (request.kind === "check") return ["check", ...(request.strict ? ["--strict"] : []), ...(request.changed === true ? ["--changed"] : []), ...(request.changed === true && request.since !== undefined ? ["--since", request.since] : [])].join(" ");
  if (request.kind === "feature-questions") return `feature ${request.slug} questions`;
  if (request.kind === "export-c4") return ["export c4", `--format ${request.format}`, `--level ${request.level}`, ...(request.layer !== undefined ? [`--layer ${request.layer}`] : []), ...(request.out !== undefined ? [`--out ${request.out}`] : [])].join(" ");
  return request.kind === "feature" ? `feature ${request.slug}` : request.kind === "map-check" ? "map check" : request.kind === "map" ? "map write" : request.kind;
}

/** The source of a code-to-spec as the CLI names it: `src/a.ts:8` or `--since HEAD`. */
function codeSource(source: { file?: string | null | undefined; line?: number | null | undefined; since?: string | null | undefined }): string {
  if (source.since !== undefined && source.since !== null) return `--since ${source.since}`;
  return `${source.file ?? ""}${source.line !== undefined && source.line !== null ? `:${source.line}` : ""}`;
}

/** The status of a record for the F6 list: `running…` or `completed · code 0`, and `outdated` once its inputs changed. */
export function recordStatus(record: OperationRecord): string {
  if (record.status === "running") return record.progress === null ? "running…" : `running: ${record.progress}…`;
  const code = record.result?.exitCode;
  return `${record.status}${code === null || code === undefined ? "" : ` · code ${code}`}${record.outdated !== null ? " · outdated" : ""}`;
}

/** The status with the domain outcome when there is one: `done · code 0`, `2 gap(s) · code 1`. */
export function recordSummary(record: OperationRecord): string {
  const result = record.result;
  if (result?.kind === "feature" && result.payload !== null) {
    const { report } = result.payload;
    return `${report.done ? "done" : `${report.gaps.length} gap(s)`} · code ${result.exitCode}`;
  }
  if (result?.kind === "feature-questions" && result.payload !== null) return `${questionsOutcome(result.payload)} · code ${result.exitCode}`;
  if (result?.kind === "export-c4" && result.payload !== null) return `${c4Outcome(result.payload, result.exitCode)} · code ${result.exitCode}`;
  if (result?.kind === "map-check" && result.payload !== null) return `${mapCheckOutcome(result.payload)} · code ${result.exitCode}`;
  if (result?.kind === "map" && result.payload !== null) return `${mapOutcome(record.status, result.payload)}${result.exitCode === null ? "" : ` · code ${result.exitCode}`}`;
  if (result?.kind === "baseline" && result.payload !== null) return `${baselineOutcome(record.status, result.payload)}${result.exitCode === null ? "" : ` · code ${result.exitCode}`}`;
  if (result?.kind === "agents" && result.payload !== null) return `${agentsOutcome(record.status, result.payload)}${result.exitCode === null ? "" : ` · code ${result.exitCode}`}`;
  if (result?.kind === "init" && result.payload !== null) return `${initOutcome(record.status, result.payload)}${result.exitCode === null ? "" : ` · code ${result.exitCode}`}`;
  if (result?.kind === "fmt" && result.payload !== null) return `${fmtOutcome(record.status, result.payload)}${result.exitCode === null ? "" : ` · code ${result.exitCode}`}`;
  if (result?.kind === "check" && result.payload !== null) return `${checkSummary(result.payload.counts)} · code ${result.exitCode}`;
  if (result?.kind === "explain-edge" && result.payload !== null) return `${edgeOutcome(result.payload)} · code ${result.exitCode}`;
  if (result?.kind === "wire" && result.payload !== null) return `${wireOutcome(record.status, result.payload, result.exitCode)}${result.exitCode === null ? "" : ` · code ${result.exitCode}`}`;
  if (result?.kind === "export" && result.payload !== null) return `${exportOutcome(record.status, result.payload)}${result.exitCode === null ? "" : ` · code ${result.exitCode}`}`;
  if (result?.kind === "parse" && result.payload !== null) return `${parseOutcome(result.payload)} · code ${result.exitCode}`;
  if (result?.kind === "trace-plan" && result.payload !== null) return `${tracePlanOutcome(result.payload)} · code ${result.exitCode}`;
  if (result?.kind === "explain" && result.payload !== null) return `${explainOutcome(result.payload)} · code ${result.exitCode}`;
  if (result?.kind === "explain-plan" && result.payload !== null) return `${explainPlanOutcome(result.payload)} · code ${result.exitCode}`;
  if (result?.kind === "explain-llm" && result.payload !== null) return `${explainLlmOutcome(result.payload)}${result.exitCode === null ? "" : ` · code ${result.exitCode}`}`;
  if (result?.kind === "explain-batch" && result.payload !== null) return `${explainBatchOutcome(result.payload)}${result.exitCode === null ? "" : ` · code ${result.exitCode}`}`;
  if (result?.kind === "draft-flow" && result.payload !== null) return `${draftOutcome(record.status, result.payload)}${result.exitCode === null ? "" : ` · code ${result.exitCode}`}`;
  if (result?.kind === "draft-rules" && result.payload !== null) return `${draftOutcome(record.status, result.payload)}${result.exitCode === null ? "" : ` · code ${result.exitCode}`}`;
  if (result?.kind === "code-to-spec" && result.payload !== null) return `${draftOutcome(record.status, result.payload)}${result.exitCode === null ? "" : ` · code ${result.exitCode}`}`;
  if (result?.kind === "spec-to-code" && result.payload !== null) return `${specCodeOutcome(record.status, result.payload)}${result.exitCode === null ? "" : ` · code ${result.exitCode}`}`;
  if (result?.kind === "apply-code" && result.payload !== null) return `${applyOutcome(record.status, result.payload)}${result.exitCode === null ? "" : ` · code ${result.exitCode}`}`;
  if (result?.kind === "draft-layout" && result.payload !== null) return `${Object.keys(result.payload.layers).length} layer(s), nothing written · code ${result.exitCode}`;
  return recordStatus(record);
}

/** The requested check options as the F6 list names them: `keylang · strict · static shape`. */
function checkParams(request: CheckRequest): string {
  return [
    request.paths.length > 0 ? request.paths.join(" ") : "spec directory",
    request.strict ? "strict" : "not strict",
    `static ${request.static ?? "from config"}`,
    ...(request.changed === true ? [`changed since ${request.since ?? "HEAD"}`] : []),
  ].join(" · ");
}

/** The format an export request writes: an explained edge has only the human lines. */
function exportFormat(request: ExportRequest): string {
  return exportFormatOf(request.source);
}

/** `K001: offline help`, `fn a.b: saved answer fresh`, `module a: no saved answer`. */
function explainOutcome(payload: ExplainPayload): string {
  if (payload.subject === "code") return `${payload.code}: offline help`;
  return `${payload.summary.kind} ${payload.id}: ${payload.saved === null ? "no saved answer" : `saved answer ${payload.saved.fresh ? "fresh" : "stale"}`}`;
}

/** `fn a.b: the fresh saved answer, no request`, `…: new short answer saved`, `…: no model, nothing asked`, `…: refused, nothing written`. */
function explainLlmOutcome(payload: ExplainLlmPayload): string {
  const what = `${payload.summary.kind} ${payload.id}`;
  if (payload.source === "cache") return `${what}: the fresh saved ${payload.detail} answer, no request`;
  if (payload.source === "offline") return `${what}: no model, nothing asked; ${payload.answer === null ? "no saved answer" : `saved answer ${payload.answer.fresh ? "fresh" : "stale"}`}`;
  if (payload.written !== null) return `${what}: new ${payload.detail} answer saved to ${payload.written}`;
  if (payload.refused.length > 0) return `${what}: refused, nothing written`;
  return `${what}: the model failed, nothing written`;
}

/** The CLI command of an inventory: `explain --stale`, `explain --missing --dry-run --limit 3 --jobs 2`. */
function explainPlanLabel(request: ExplainPlanRequest): string {
  if (request.list === "stale-saved") return "explain --stale";
  return [`explain --${request.batch}`, ...(request.estimate === true ? ["--dry-run"] : []), ...(request.limit !== undefined ? ["--limit", String(request.limit)] : []), ...(request.jobs !== undefined ? ["--jobs", String(request.jobs)] : [])].join(" ");
}

/** `2 stale, 1 gone of 5 saved explanation(s)`, `nothing to explain: zero work, no request`, `6 brief(s) planned, ~1200 in, ~480 out tokens (approximate)`. */
function explainPlanOutcome(payload: ExplainPlanPayload): string {
  if (payload.list === "stale-saved") {
    const stale = payload.entries.filter((entry) => entry.state === "stale").length;
    return payload.entries.length === 0 ? `every one of ${payload.saved} saved explanation(s) is fresh` : `${stale} stale, ${payload.entries.length - stale} gone of ${payload.saved} saved explanation(s)`;
  }
  if (payload.plan.length === 0) return "nothing to explain: zero work, no request";
  const cut = payload.candidates > payload.plan.length ? ` of ${payload.candidates}` : "";
  return `${payload.plan.length}${cut} brief(s) planned${payload.estimate === null ? "" : `, ~${payload.estimate.input} in, ~${payload.estimate.output} out tokens (approximate)`}`;
}

/** The CLI command of a batch: `explain --missing --llm --limit 3 --jobs 2`. */
function explainBatchLabel(request: ExplainBatchRequest): string {
  return [`explain --${request.batch} --llm`, ...(request.limit !== undefined ? ["--limit", String(request.limit)] : []), ...(request.jobs !== undefined ? ["--jobs", String(request.jobs)] : [])].join(" ");
}

/** `6 of 6 brief(s) written`, `5 of 6 brief(s) written, 1 failed`, `cancelled: 1 of 6 written, 5 not started`, `outdated: …`. */
function explainBatchOutcome(payload: ExplainBatchPayload): string {
  if (payload.plan.length === 0) return "nothing to explain: zero work, no request";
  const counts = `${payload.done.length} of ${payload.plan.length} brief(s) written${payload.failed.length > 0 ? `, ${payload.failed.length} failed` : ""}${payload.notStarted.length > 0 ? `, ${payload.notStarted.length} not started` : ""}`;
  if (payload.stopped === "cancelled") return `cancelled: ${counts}`;
  if (payload.stopped === "outdated") return `outdated, stopped: ${counts}`;
  if (payload.stopped === "refused") return `refused: ${counts}`;
  return payload.failed.length > 0 ? `partial: ${counts}` : counts;
}

/** What became of one planned node of a batch: `written <file>`, `failed: <reason>`, `not started`. */
export function batchState(payload: ExplainBatchPayload, id: string): string {
  const done = payload.done.find((entry) => entry.id === id);
  if (done) return `written ${done.file}`;
  const failed = payload.failed.find((entry) => entry.id === id);
  return failed ? `failed: ${failed.reason}` : "not started";
}

/** A saved answer or brief: its provenance on one row, then its text and the IDs it made up. */
function savedRows(rows: { text: string; style: Style }[], label: string, saved: SavedAnswer): void {
  rows.push({ text: `── ${label} · ${saved.detail} · ${saved.agent} · ${saved.date} · ${saved.fresh ? "fresh" : "stale: the code changed since"} · ${saved.file} ──`, style: { ...THEME.panel, fg: saved.fresh ? 243 : 179 } });
  for (const line of saved.text.split("\n")) {
    // A `full` answer is in sections: a `##` heading is a bold title row.
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    rows.push(heading ? { text: `  ${heading[1]!}`, style: { ...THEME.panel, bold: true } } : { text: `  ${line}`, style: THEME.panel });
  }
  if (saved.unknownIds.length > 0) rows.push({ text: `  unknown ids (in no snapshot, no planned; not followed): ${saved.unknownIds.join(", ")}`, style: { ...THEME.panel, fg: 179 } });
}

/** `4 function(s) to instrument, 1 step id(s) left out`: the plan and what no adapter instruments. */
function tracePlanOutcome(payload: TracePlanPayload): string {
  return `${payload.plan.symbols.length} function(s) to instrument${payload.omitted.length > 0 ? `, ${payload.omitted.length} id(s) left out` : ""}`;
}

/** `3 step(s), preview, nothing written`, `3 step(s) proposed for <target>`, `refused, nothing written`, `write failed`. */
/** `written docs/c4.puml`, or the size of a diagram only shown. */
function c4Outcome(payload: ExportC4Payload, exitCode: 0 | 1 | 2 | null): string {
  if (payload.out !== null) return `written ${payload.out}`;
  return exitCode === 0 ? `${payload.text.split("\n").length - 1} line(s), nothing written` : "nothing written";
}

/** `3 question(s) proposed`, with the answer's lines left out when there were any. */
function questionsOutcome(payload: FeatureQuestionsPayload): string {
  const asked = payload.proposal !== null ? `${payload.questions.length} question(s) proposed` : payload.questions.length === 0 ? "no question asked" : `${payload.questions.length} question(s), nothing written`;
  return payload.dropped > 0 ? `${asked}, ${payload.dropped} line(s) left out` : asked;
}

function draftOutcome(status: OperationRecord["status"], payload: DraftFlowPayload | DraftRulesPayload | CodeToSpecPayload): string {
  if (payload.candidate === null) return `no fn outside the flows changed since ${"since" in payload ? payload.since : ""}, nothing written`;
  if (payload.output === "preview") return `${payload.summary}, preview, nothing written`;
  if (payload.proposal !== null) return `${payload.summary} proposed for ${payload.candidate.target}`;
  if (payload.refused.length > 0) return "refused, nothing written";
  if (payload.error !== null) return "write failed";
  return `${status}, nothing written`;
}

/** What spec-to-code did with its candidate: previewed, proposed (all, or the ones before it stopped), refused. */
function specCodeOutcome(status: OperationRecord["status"], payload: SpecToCodePayload): string {
  const total = payload.candidate.targets.length;
  if (payload.output === "preview") return `${payload.summary}, preview, nothing written`;
  if (payload.proposals.length === total) return `${payload.summary} proposed`;
  if (payload.proposals.length > 0) return `${status} after ${payload.proposals.length} of ${total} proposal(s)`;
  if (payload.refused.length > 0) return "refused, nothing written";
  if (payload.error !== null) return "write failed, nothing written";
  return `${status}, nothing written`;
}

/** `3 file(s) written`, `refused, nothing written`, `1 of 3 file(s) written, failed|cancelled`. */
function applyOutcome(status: OperationRecord["status"], payload: ApplyCodePayload): string {
  const done = payload.files.filter((file) => file.state === "completed").length;
  if (done === payload.files.length) return `${done} file(s) written`;
  if (payload.refused.length > 0) return "refused, nothing written";
  if (done === 0) return `${status}, nothing written`;
  return `${done} of ${payload.files.length} file(s) written, ${status}`;
}

/** `2 document(s), 1 error(s), 0 warning(s)`: what the parser found, the same counts as the CLI's stderr. */
function parseOutcome(payload: ParsePayload): string {
  const errors = payload.diagnostics.filter(isError).length;
  return `${payload.documents.length} document(s), ${errors} error(s), ${payload.diagnostics.length - errors} warning(s)`;
}

/** `written`, `replaced`, `refused, nothing written`, `write failed`, `cancelled, nothing written`. */
function exportOutcome(status: OperationRecord["status"], payload: ExportPayload): string {
  if (payload.written) return payload.existed ? "replaced" : "written";
  if (payload.refused.length > 0) return "refused, nothing written";
  if (payload.error !== null) return "write failed";
  return `${status}, nothing written`;
}

/** `2 edge(s)`, `no edge, coverage complete`, `no confirmed edge, 1 unresolved`: what the snapshot says between the two ids. */
function edgeOutcome(payload: ExplainEdgePayload): string {
  if (payload.conclusion === "edges") return `${payload.edges.length} edge(s)`;
  return payload.conclusion === "complete" ? "no edge, coverage complete" : `no confirmed edge, ${payload.holes.length} unresolved`;
}

/**
 * The evidence of an explain-edge report the arrows select after Tab: every
 * edge (`→` from → to, `←` to → from), or every unresolved construct when
 * there is none. `file` is null for an edge with no position in the code.
 */
export function edgeItems(payload: ExplainEdgePayload): { file: string | null; line: number; col: number; text: string }[] {
  if (payload.edges.length > 0) {
    return payload.edges.map(({ direction, edge }) => ({ file: edge.file, line: edge.line, col: edge.col, text: `${direction === "forward" ? "→" : "←"} ${edgeLine(edge)}` }));
  }
  return payload.holes.map((hole) => ({ file: hole.file, line: hole.line, col: hole.col, text: holeLine(hole) }));
}

/** `written`, `up to date`, `stale`, `2 error(s) in wiring`, `manual file`, `inputs changed, nothing written`: what wire found and really did. */
function wireOutcome(status: OperationRecord["status"], payload: WirePayload, exitCode: 0 | 1 | 2 | null): string {
  if (payload.state === "blocked") return `${payload.diagnostics.length} error(s) in wiring, nothing written`;
  if (payload.state === "manual") return "manual file, not written";
  if (payload.refused.length > 0) return "inputs changed, nothing written";
  if (payload.error !== null) return "write failed";
  if (exitCode === 2) return "not generated";
  if (status === "cancelled") return "cancelled, nothing written";
  if (payload.written) return "written";
  return payload.state === "current" ? "up to date" : payload.check ? "stale" : "not written";
}

/** `3 file(s) canonical`, `2 not formatted`, `1 formatted, 1 invalid`, `1 of 2 formatted, cancelled`: what fmt found and really did. */
function fmtOutcome(status: OperationRecord["status"], payload: FmtPayload): string {
  const count = (state: FmtFile["state"]): number => payload.files.filter((file) => file.state === state).length;
  const parts: string[] = [];
  const planned = count("formatted") + count("failed") + count("not-attempted");
  if (status === "cancelled" && planned > 0) parts.push(`${count("formatted")} of ${planned} formatted, cancelled`);
  else if (count("formatted") > 0) parts.push(`${count("formatted")} formatted`);
  if (count("stale") > 0) parts.push(`${count("stale")} not formatted`);
  if (count("invalid") > 0) parts.push(`${count("invalid")} invalid`);
  if (count("failed") > 0) parts.push(`${count("failed")} not written`);
  if (count("unreadable") > 0) parts.push(`${count("unreadable")} unreadable`);
  if (parts.length === 0) parts.push(payload.files.length === 0 ? "no Markdown files" : `${count("current")} file(s) canonical`);
  return parts.join(", ");
}

/** `auto`, `none`, `claude, codex`: the selection as requested. */
function choiceText(choice: AgentsRequest["harnesses"]): string {
  return typeof choice === "string" ? choice : choice.join(", ");
}

/** `up to date`, `2 stale`, `3 written, 1 removed`, `broken file, nothing written`, `2 of 4 step(s) done, failed`. */
function agentsOutcome(status: OperationRecord["status"], payload: AgentsPayload): string {
  if (payload.error !== null) return `${payload.error.file} is broken, nothing written`;
  if (payload.refused.length > 0) return "inputs changed, nothing written";
  const changed = payload.files.filter((file) => file.action !== "keep").length;
  if (payload.check || changed === 0) return changed === 0 ? "up to date" : `${changed} stale`;
  const done = payload.steps.filter((step) => step.state === "completed");
  if (status === "completed") {
    const written = done.filter((step) => step.action === "write").length;
    const removed = done.length - written;
    return `${written} written${removed > 0 ? `, ${removed} removed` : ""}`;
  }
  return `${done.length} of ${payload.steps.length} step(s) done, ${status}`;
}

/**
 * `set up`, `partial: map failed`, `keylang.json not written`, `cancelled
 * after map`, or a check's three stages: never a success for a partial run.
 * A completed write names the stages with their own reports; `.gitignore`
 * is named once it failed or did not run.
 */
function initOutcome(status: OperationRecord["status"], payload: InitPayload): string {
  if (payload.preflight !== null && payload.preflight.status === "failed" && payload.preflight.payload !== null) return agentsOutcome(payload.preflight.status, payload.preflight.payload);
  if (payload.check) {
    const agents = payload.agents?.payload ? `harness files ${agentsOutcome(payload.agents.status, payload.agents.payload)}` : "harness files not checked";
    const baseline = payload.baseline?.payload ? `baseline ${baselineOutcome(payload.baseline.status, payload.baseline.payload)}` : payload.baseline ? "baseline not checked" : "";
    const ignore = payload.gitignore === null ? "" : `.gitignore ${gitignoreOutcome(payload.gitignore, true)}`;
    return [agents, baseline, ignore].filter((part) => part !== "").join(", ");
  }
  if (payload.config.error !== null) return "keylang.json not written, nothing else attempted";
  const stages = initStages(payload);
  if (status === "completed") return `set up: ${stages.map((stage) => stage.name).join(", ")}`;
  const ignore = payload.gitignore;
  const bad = [...(ignore !== null && gitignoreFailed(ignore) ? [".gitignore"] : []), ...stages.filter((stage) => stage.result !== null && stage.result.exitCode !== 0).map((stage) => stage.name)];
  const missing = [...(ignore === null ? [".gitignore"] : []), ...stages.filter((stage) => stage.result === null).map((stage) => stage.name)];
  if (status === "cancelled") return `cancelled${missing.length > 0 ? `, not run: ${missing.join(", ")}` : ""}`;
  return `partial: ${bad.join(", ")} did not finish`;
}

/** What init's `.gitignore` stage found or did: `lists .keylang/`, `.keylang/ added`, `does not list .keylang/`, a refusal or an I/O error. */
function gitignoreOutcome(stage: GitignoreStage, check: boolean): string {
  if (stage.error !== null) return `failed: ${stage.error}`;
  if (stage.refused !== null) return `${check ? "not read" : ".keylang/ not added"} (${stage.refused})`;
  if (stage.written) return ".keylang/ added";
  return stage.listed ? "lists .keylang/" : "does not list .keylang/";
}

/** The stage keeps init from code 0: an I/O error, a refusal, or no `.keylang/` line (a check). */
function gitignoreFailed(stage: GitignoreStage): boolean {
  return stage.error !== null || stage.refused !== null || !stage.listed;
}

/** The stages of an init write, in the order they ran. */
function initStages(payload: InitPayload): { name: string; result: OperationResult | null }[] {
  return [
    { name: "map", result: payload.map },
    { name: "baseline", result: payload.baseline },
    { name: "agents", result: payload.agents },
  ];
}

/** `3 written, 1 removed`, `1 conflict(s), nothing written`, `2 of 5 done, failed` — what a map write really did. */
function mapOutcome(status: OperationRecord["status"], payload: MapPayload): string {
  if (payload.conflicts.length > 0) return `${payload.conflicts.length} conflict(s), nothing written`;
  if (payload.refused.length > 0) return "inputs changed, nothing written";
  const done = payload.steps.filter((step) => step.state === "completed");
  if (status === "completed") {
    const written = done.filter((step) => step.action === "write").length;
    const removed = done.length - written;
    return `${written} written${removed > 0 ? `, ${removed} removed` : ""}`;
  }
  return `${done.length} of ${payload.steps.length} step(s) done, ${status}`;
}

/** `up to date`, `stale`, `written`, `manual file, nothing written`, `inputs changed, nothing written`. */
function baselineOutcome(status: OperationRecord["status"], payload: BaselinePayload): string {
  if (payload.state === "manual") return payload.check ? "manual file" : "manual file, nothing written";
  if (payload.refused.length > 0) return "inputs changed, nothing written";
  if (payload.error !== null) return "write failed, nothing written";
  if (payload.written) return "written";
  if (payload.state === "current") return "up to date";
  return payload.check ? "stale" : `${status}, nothing written`;
}

/** `up to date`, `3 stale`, `1 conflict(s)` (conflicts first: they block `keylang map`). */
function mapCheckOutcome(payload: MapCheckPayload): string {
  if (payload.conflicts.length > 0) return `${payload.conflicts.length} conflict(s)${payload.stale.length > 0 ? `, ${payload.stale.length} stale` : ""}`;
  return payload.stale.length > 0 ? `${payload.stale.length} stale` : "up to date";
}

function timeStr(ms: number): string {
  return new Date(ms).toTimeString().slice(0, 8);
}

/** One gap or hint of a feature report, as the readiness screen lists it. */
export interface FeatureItem {
  item: Gap | Hint;
  /** A hint: the next step of a stage, never blocking done. */
  hint: boolean;
}

/** The gaps and hints of a feature report up the ladder, a stage's gaps before its hints: the rows Tab and the arrows select. */
export function featureItems(report: FeatureReport): FeatureItem[] {
  return STAGES.flatMap((stage) => [
    ...report.gaps.filter((gap) => gap.stage === stage).map((item) => ({ item, hint: false })),
    ...report.hints.filter((hint) => hint.stage === stage).map((item) => ({ item, hint: true })),
  ]);
}

/** `idea › behavior › [structure] › ready › done`: the ladder with the current stage in brackets. */
export function stageLadder(stage: FeatureReport["stage"]): string {
  return STAGES.map((step) => (step === stage ? `[${step}]` : step)).join(" › ");
}

/**
 * The report rows of the record selected in the F6 panel: its parameters,
 * timings and the operation's messages. Presentation only — the payload in
 * `record.result` carries the domain data.
 */
export function resultsReportRows(state: State): { text: string; style: Style; gap?: number }[] {
  const record = state.records[state.results.index];
  if (!record) return [];
  const rows: { text: string; style: Style; gap?: number }[] = [
    { text: `root ${record.params.root} · started ${timeStr(record.started)}`, style: { ...THEME.panel, fg: 243 } },
  ];
  if (record.finished !== null) {
    rows.push({ text: `finished ${timeStr(record.finished)} · ${recordStatus(record)}`, style: { ...THEME.panel, fg: 243 } });
  }
  if (record.outdated !== null) rows.push({ text: `outdated: ${record.outdated} · Enter reruns`, style: { ...THEME.panel, fg: 179 } });
  const result = record.result;
  if (result?.kind === "feature" && result.payload !== null) {
    // Design §2.7: the outcome, the saved state it was computed on, the stage on its ladder, the gaps and
    // hints by the stage that fixes them (c4-zoom/11), and the non-blocking tests and trace.
    const { file, snapshot, report } = result.payload;
    const selected = state.results.scrollReport ? state.results.gap : -1;
    rows.push({ text: `Feature · ${result.payload.slug} · saved state · ${file}`, style: { ...THEME.panel, bold: true } });
    rows.push({
      text: `${report.done ? "Done" : `${report.gaps.length} gap(s)`} · code ${result.exitCode} · snapshot ${snapshot === null ? "none" : snapshot.slice(0, 8)}`,
      style: { ...THEME.panel, ...(report.done ? MARK_STYLE.ok : MARK_STYLE.fail), bg: THEME.panel.bg! },
    });
    rows.push({ text: `stage  ${stageLadder(report.stage)}`, style: { ...THEME.panel, bold: true } });
    const items = featureItems(report);
    for (const stage of STAGES) {
      const here = items.flatMap((entry, index) => (entry.item.stage === stage ? [{ ...entry, index }] : []));
      if (here.length === 0) continue;
      const gaps = here.filter((entry) => !entry.hint).length;
      const hints = here.length - gaps;
      // The rows stay flush with the header, as before the stages: a narrow panel cuts the reason, not the place.
      rows.push({ text: `${stage} · ${[...(gaps > 0 ? [`${gaps} gap(s)`] : []), ...(hints > 0 ? [`${hints} hint(s), not blocking`] : [])].join(" · ")}`, style: { ...THEME.panel, fg: 75, bold: true } });
      for (const { item, hint, index } of here) {
        const text = `${hint ? `hint ${item.kind}` : item.kind.padEnd(8)} ${item.id}  ${item.file}:${item.line}:${item.col}  ${item.reason}`;
        rows.push({ text, style: index === selected ? THEME.selected : hint ? { ...THEME.panel, fg: 247 } : THEME.panel, gap: index });
      }
    }
    // A rule fail that is not this change's no longer blocks; without git none can be told inherited, so every one blocks.
    const { rules } = report.info;
    const inherited = rules === null ? "unknown without git: every rule fail blocks" : rules.length === 0 ? "—" : String(rules.length);
    rows.push({ text: `Info (not blocking): tests ${infoSummary(report.info.tests)} · trace ${infoSummary(report.info.trace)} · inherited rule fails ${inherited}`, style: { ...THEME.panel, fg: 243 } });
    for (const item of [...report.info.tests, ...report.info.trace, ...(rules ?? [])]) rows.push({ text: `  ${item.verdict} ${item.id}  ${item.file}:${item.line}  ${item.reason}`, style: { ...THEME.panel, fg: 243 } });
  } else if (result?.kind === "map-check" && result.payload !== null) {
    // Nothing was written: the check compares a fresh render with the files on disk.
    const { payload } = result;
    const clean = payload.conflicts.length === 0 && payload.stale.length === 0;
    rows.push({ text: `Map check · read-only, nothing written · snapshot ${payload.snapshot.slice(0, 8)}`, style: { ...THEME.panel, bold: true } });
    rows.push({ text: `${mapCheckOutcome(payload)} · code ${result.exitCode}`, style: { ...THEME.panel, ...(clean ? MARK_STYLE.ok : MARK_STYLE.fail), bg: THEME.panel.bg! } });
    for (const file of payload.conflicts) rows.push({ text: `  conflict ${file}: manual file without keylang:generated marker`, style: THEME.panel });
    for (const file of payload.stale) rows.push({ text: `  stale    ${file}${payload.conflicts.length > 0 ? " (after the conflicts are resolved)" : ""}`, style: THEME.panel });
    for (const warning of payload.warnings) rows.push({ text: `  warning: ${warning}`, style: { ...THEME.panel, fg: 179 } });
    const stats = payload.stats;
    rows.push({ text: `${stats.files} file(s), ${stats.modules} module(s), ${stats.fns} fn, ${stats.types} type(s), ${stats.deps} dep(s)`, style: { ...THEME.panel, fg: 243 } });
  } else if (result?.kind === "map" && result.payload !== null) {
    // What landed on disk, step by step: a partial commit is named as partial, nothing is rolled back.
    const { payload } = result;
    rows.push({ text: `Map write · generated files only · snapshot ${payload.snapshot.slice(0, 8)}`, style: { ...THEME.panel, bold: true } });
    const ok = record.status === "completed" && result.exitCode === 0;
    rows.push({ text: `${mapOutcome(record.status, payload)}${result.exitCode === null ? "" : ` · code ${result.exitCode}`}`, style: { ...THEME.panel, ...(ok ? MARK_STYLE.ok : MARK_STYLE.fail), bg: THEME.panel.bg! } });
    for (const file of payload.conflicts) rows.push({ text: `  conflict ${file}: manual file without keylang:generated marker`, style: THEME.panel });
    for (const line of payload.refused) rows.push({ text: `  refused  ${line}`, style: THEME.panel });
    if (payload.refused.length > 0) rows.push({ text: "  nothing was written · Enter computes the map again", style: THEME.hint });
    const state = { completed: "", failed: "failed ", "not-attempted": "not attempted " } as const;
    for (const step of payload.steps) {
      const verb = step.action === "write" ? "written" : "removed";
      const text = step.state === "completed" ? `  ${verb.padEnd(8)} ${step.path}` : `  ${state[step.state]}${step.path}${step.error === undefined ? "" : `: ${step.error}`}`;
      rows.push({ text, style: step.state === "failed" ? { ...THEME.panel, ...THEME.error } : step.state === "not-attempted" ? { ...THEME.panel, fg: 243 } : THEME.panel });
    }
    if (payload.steps.length === 0 && payload.conflicts.length === 0 && payload.refused.length === 0 && record.status === "cancelled") rows.push({ text: "  cancelled before writing: nothing written", style: THEME.panel });
    for (const warning of payload.warnings) rows.push({ text: `  warning: ${warning}`, style: { ...THEME.panel, fg: 179 } });
    const stats = payload.stats;
    rows.push({ text: `${stats.files} file(s), ${stats.modules} module(s), ${stats.fns} fn, ${stats.types} type(s), ${stats.deps} dep(s)`, style: { ...THEME.panel, fg: 243 } });
  } else if (result?.kind === "baseline" && result.payload !== null) {
    // The allowed architecture as rule lines: what the new baseline adds and drops against the file on disk.
    const { payload } = result;
    const ok = result.exitCode === 0;
    rows.push({ text: `Baseline ${payload.check ? "check · read-only, nothing written" : "write"} · ${payload.file} · snapshot ${payload.snapshot.slice(0, 8)}`, style: { ...THEME.panel, bold: true } });
    rows.push({ text: `${baselineOutcome(record.status, payload)}${result.exitCode === null ? "" : ` · code ${result.exitCode}`}`, style: { ...THEME.panel, ...(ok ? MARK_STYLE.ok : MARK_STYLE.fail), bg: THEME.panel.bg! } });
    for (const message of result.messages) rows.push({ text: `  ${message.text}`, style: message.level === "error" ? { ...THEME.panel, ...THEME.error } : THEME.panel });
    if (payload.refused.length > 0) rows.push({ text: "  Enter computes the baseline again", style: THEME.hint });
    if (payload.state !== "manual" && (payload.added.length > 0 || payload.removed.length > 0)) {
      rows.push({ text: payload.written ? "Allowed dependencies changed:" : "The current graph would change the allowed dependencies:", style: { ...THEME.panel, fg: 243 } });
      for (const line of payload.added) rows.push({ text: `  + ${line}`, style: THEME.panel });
      for (const line of payload.removed) rows.push({ text: `  - ${line}`, style: THEME.panel });
    }
  } else if (result?.kind === "agents" && result.payload !== null) {
    // Managed files only: the report names the selection, the pinned version and each file; setting up is not a test of the client.
    const { payload } = result;
    const ok = result.exitCode === 0;
    const who = payload.choice === "list" ? payload.harnesses.join(", ") : `${payload.choice}${payload.choice === "auto" ? ` → ${payload.harnesses.join(", ") || "no harness detected"}` : ""}`;
    rows.push({ text: `Agents ${payload.check ? "check · read-only, nothing written" : "write"} · ${who} · keylang@${payload.version}`, style: { ...THEME.panel, bold: true } });
    rows.push({ text: `${agentsOutcome(record.status, payload)}${result.exitCode === null ? "" : ` · code ${result.exitCode}`}`, style: { ...THEME.panel, ...(ok ? MARK_STYLE.ok : MARK_STYLE.fail), bg: THEME.panel.bg! } });
    if (payload.error !== null) rows.push({ text: `  ${payload.error.file}: ${payload.error.message}`, style: { ...THEME.panel, ...THEME.error } });
    for (const line of payload.refused) rows.push({ text: `  refused  ${line}`, style: THEME.panel });
    if (payload.refused.length > 0) rows.push({ text: "  nothing was written · Enter plans again", style: THEME.hint });
    const steps = new Map(payload.steps.map((step) => [step.path, step]));
    for (const file of payload.files) {
      const step = steps.get(file.path);
      const verb = file.action === "write" ? "written" : "removed";
      const state =
        file.action === "keep"
          ? "current"
          : payload.check || payload.refused.length > 0
            ? "stale"
            : step === undefined || step.state === "not-attempted"
              ? `not ${verb}`
              : step.state === "failed"
                ? "failed"
                : verb;
      const style = step?.state === "failed" ? { ...THEME.panel, ...THEME.error } : file.action === "keep" ? { ...THEME.panel, fg: 243 } : THEME.panel;
      rows.push({ text: `  ${state.padEnd(11)} ${file.category.padEnd(12)} ${file.path}${step?.error === undefined ? "" : `: ${step.error}`}`, style });
    }
    if (payload.steps.length === 0 && payload.refused.length === 0 && record.status === "cancelled") rows.push({ text: "  cancelled before writing: nothing written", style: THEME.panel });
    rows.push({ text: "Files only: no client is started or tested.", style: { ...THEME.panel, fg: 243 } });
  } else if (result?.kind === "init" && result.payload !== null) {
    // Stage by stage, each with what it really did; a partial init is named as partial and nothing is rolled back.
    const { payload } = result;
    const ok = record.status === "completed" && result.exitCode === 0;
    rows.push({ text: `Init ${payload.check ? "check (as init --check) · read-only, nothing written" : "write"} · ${payload.languages.join(", ")}`, style: { ...THEME.panel, bold: true } });
    rows.push({ text: `${initOutcome(record.status, payload)}${result.exitCode === null ? "" : ` · code ${result.exitCode}`}`, style: { ...THEME.panel, ...(ok ? MARK_STYLE.ok : MARK_STYLE.fail), bg: THEME.panel.bg! } });
    const stageRow = (name: string, text: string, failed: boolean): void => {
      rows.push({ text: `  ${name.padEnd(13)} ${text}`, style: failed ? { ...THEME.panel, ...THEME.error } : THEME.panel });
    };
    const code = (stage: OperationResult): string => (stage.exitCode === null ? "" : ` · code ${stage.exitCode}`);
    const notRun = payload.config.error !== null || record.status !== "cancelled" ? "not run" : "not run (cancelled)";
    // `.gitignore` is a file stage of init itself, not an operation: no code of its own, its reason on the row.
    const gitignoreRow = (): void => {
      const stage = payload.gitignore;
      if (stage === null) stageRow(".gitignore", notRun, false);
      else stageRow(stage.file, gitignoreOutcome(stage, payload.check), gitignoreFailed(stage));
    };
    if (payload.preflight?.status === "failed") {
      stageRow("harness plan", `${payload.preflight.messages.map((message) => message.text).join("; ")}${code(payload.preflight)}`, true);
      rows.push({ text: "  checked before any write: nothing was written, keylang.json included", style: THEME.hint });
    } else if (!payload.check) {
      const config = payload.config;
      stageRow(config.file, config.existed ? "kept as it is" : config.written ? `written (layers: ${config.layers.join(", ")})` : config.error !== null ? `failed: ${config.error}` : "not written", config.error !== null);
      for (const note of config.notes) rows.push({ text: `    note: ${note}`, style: { ...THEME.panel, fg: 243 } });
      gitignoreRow();
    }
    const stages: { name: string; result: OperationResult | null }[] = payload.check
      ? [
          { name: "agents", result: payload.agents },
          { name: "baseline", result: payload.baseline },
        ]
      : payload.preflight?.status === "failed"
        ? []
        : initStages(payload);
    for (const { name, result: stage } of stages) {
      if (stage === null) {
        stageRow(name, notRun, false);
        continue;
      }
      const outcome =
        stage.kind === "map" && stage.payload !== null
          ? mapOutcome(stage.status, stage.payload)
          : stage.kind === "baseline" && stage.payload !== null
            ? baselineOutcome(stage.status, stage.payload)
            : stage.kind === "agents" && stage.payload !== null
              ? agentsOutcome(stage.status, stage.payload)
              : stage.status;
      stageRow(name, `${outcome}${code(stage)}`, stage.exitCode !== 0);
      for (const message of stage.messages) if (message.level === "error") rows.push({ text: `    ${message.text}`, style: { ...THEME.panel, ...THEME.error } });
      if (stage.kind === "map") for (const line of stage.payload?.refused ?? []) rows.push({ text: `    refused ${line}`, style: THEME.panel });
      for (const step of stage.kind === "map" || stage.kind === "agents" ? (stage.payload?.steps ?? []) : []) {
        if (step.state === "failed") rows.push({ text: `    failed ${step.path}${step.error === undefined ? "" : `: ${step.error}`}`, style: { ...THEME.panel, ...THEME.error } });
        else if (step.state === "not-attempted") rows.push({ text: `    not attempted ${step.path}`, style: { ...THEME.panel, fg: 243 } });
      }
    }
    if (payload.check) gitignoreRow();
    rows.push({ text: `written: ${result.written.length} file(s)${result.removed.length > 0 ? `, removed: ${result.removed.length}` : ""}`, style: { ...THEME.panel, fg: 243 } });
    if (payload.check) rows.push({ text: "The map is not part of init --check: Map: check compares it.", style: { ...THEME.panel, fg: 243 } });
    else if (!ok) rows.push({ text: "  Enter runs init again: a kept keylang.json and hand-written files stay as they are", style: THEME.hint });
    rows.push({ text: "Files only: no harness client is started or tested.", style: { ...THEME.panel, fg: 243 } });
  } else if (result?.kind === "check" && result.payload !== null) {
    // A report of the saved files, apart from the pinned current analysis: its options, its outcome, then every result.
    const { payload } = result;
    const { options } = payload;
    const from = options.staticFrom === "request" ? "override" : options.staticFrom === "config" ? "keylang.json check.static" : "default";
    const selected = state.results.scrollReport ? state.results.gap : -1;
    rows.push({ text: `Check · read-only, nothing written · saved files · ${options.paths.join(" ")}`, style: { ...THEME.panel, bold: true } });
    rows.push({ text: `strict ${options.strict ? "on" : "off"} · static ${options.static} (${from}) · snapshot ${payload.snapshotId === null ? "none" : payload.snapshotId.slice(0, 8)}`, style: { ...THEME.panel, fg: 243 } });
    // The git slice is always named: its ref, what git reported, and what the full report had besides.
    if (payload.changed !== null) {
      const slice = payload.changed;
      rows.push({ text: `changed since ${slice.since} · ${slice.files.length} changed file(s) · ${slice.shown} of ${slice.shown + slice.hidden} result(s) shown, ${slice.hidden} hidden`, style: { ...THEME.panel, fg: 179 } });
      if (slice.unborn) rows.push({ text: "  no commit yet: HEAD is the empty tree, every file is changed", style: { ...THEME.panel, fg: 243 } });
      if (slice.deleted.length > 0) rows.push({ text: `  deleted module(s) kept in the slice: ${slice.deleted.join(", ")}`, style: { ...THEME.panel, fg: 243 } });
    } else rows.push({ text: "scope: every finding of the paths (not changed)", style: { ...THEME.panel, fg: 243 } });
    rows.push({ text: `${checkSummary(payload.counts)} · code ${result.exitCode}`, style: { ...THEME.panel, ...(result.exitCode === 0 ? MARK_STYLE.ok : MARK_STYLE.fail), bg: THEME.panel.bg! } });
    // Code 0 is not proof: unverified verdicts stay visible as incomplete evidence.
    if (!options.strict && payload.counts.unverified > 0) rows.push({ text: `  incomplete: ${payload.counts.unverified} unverified, not proven · strict would make it code 1`, style: { ...THEME.panel, fg: 179 } });
    if (options.withoutCode) rows.push({ text: "  specs outside the spec directory: checked on their own, without the code", style: { ...THEME.panel, fg: 243 } });
    for (const path of payload.notSpecs) rows.push({ text: `  ${path}: the explained map and saved explanations are not specs; skipped`, style: { ...THEME.panel, fg: 243 } });
    payload.results.forEach((item, index) => {
      rows.push({ text: `${FINDING_GLYPH[item.verdict]} ${findingRow(item)}`, style: index === selected ? THEME.selected : item.verdict === "ok" ? { ...THEME.panel, fg: 243 } : THEME.panel, gap: index });
    });
    // An import of a file `assume` names is listed in coverage, but keylang left it unread on purpose: no unresolved construct.
    const unresolved = payload.coverage.filter((item) => item.kind !== "assumed-import").length;
    if (unresolved > 0) rows.push({ text: `coverage: ${unresolved} unresolved construct(s) in the code`, style: { ...THEME.panel, fg: 243 } });
  } else if (result?.kind === "explain-edge" && result.payload !== null) {
    // The snapshot's evidence between two ids: both directions, or why an absence is (not) proven.
    const { payload } = result;
    const selected = state.results.scrollReport ? state.results.gap : -1;
    rows.push({ text: `Explain edge · read-only, nothing written · saved code · snapshot ${payload.snapshotId.slice(0, 8)}`, style: { ...THEME.panel, bold: true } });
    rows.push({ text: `→ ${payload.from} → ${payload.to} first, then ← ${payload.to} → ${payload.from}`, style: { ...THEME.panel, fg: 243 } });
    const forward = payload.edges.filter((item) => item.direction === "forward").length;
    if (payload.conclusion === "edges") {
      rows.push({ text: `${payload.edges.length} edge(s): ${forward} → , ${payload.edges.length - forward} ← · code ${result.exitCode}`, style: { ...THEME.panel, ...MARK_STYLE.ok, bg: THEME.panel.bg! } });
    } else if (payload.conclusion === "complete") {
      rows.push({ text: `no edge, coverage complete · code ${result.exitCode}`, style: { ...THEME.panel, ...MARK_STYLE.ok, bg: THEME.panel.bg! } });
      rows.push({ text: `  absence proven: no edge either way, nothing unresolved in ${payload.from}`, style: { ...THEME.panel, fg: 243 } });
    } else {
      rows.push({ text: `no confirmed edge · code ${result.exitCode}`, style: { ...THEME.panel, fg: 179 } });
      rows.push({ text: `  not proven absent: ${payload.holes.length} unresolved construct(s) in ${payload.from} could form one`, style: { ...THEME.panel, fg: 179 } });
    }
    const items = edgeItems(payload);
    items.forEach((item, index) => {
      rows.push({ text: `  ${item.text}`, style: index === selected ? THEME.selected : THEME.panel, gap: index });
      const candidates = payload.edges[index]?.edge.candidates ?? [];
      if (candidates.length > 0) rows.push({ text: `      ambiguous: one of ${candidates.join(", ")}; no single target is confirmed`, style: { ...THEME.panel, fg: 179 } });
    });
    if (items.length > 0) rows.push({ text: "  Tab, then Enter opens the evidence in the code", style: THEME.hint });
  } else if (result?.kind === "export" && result.payload !== null) {
    // One file: the report it came from, the format, and what happened to the target.
    const { payload } = result;
    const ok = result.exitCode === 0;
    const from = record.params.kind === "export" ? record.params.source.kind : payload.source;
    rows.push({ text: `Export · ${payload.format} of the ${from} report · ${payload.path} · ${payload.bytes} bytes`, style: { ...THEME.panel, bold: true } });
    rows.push({ text: `${exportOutcome(record.status, payload)}${result.exitCode === null ? "" : ` · code ${result.exitCode}`}`, style: { ...THEME.panel, ...(ok ? MARK_STYLE.ok : MARK_STYLE.fail), bg: THEME.panel.bg! } });
    for (const message of result.messages) rows.push({ text: `  ${message.text}`, style: message.level === "error" ? { ...THEME.panel, ...THEME.error } : THEME.panel });
    rows.push({ text: "  the report as it ran; nothing was checked again", style: { ...THEME.panel, fg: 243 } });
  } else if (result?.kind === "wire" && result.payload !== null) {
    // The generated file with what happened to it; the code itself opens read-only on Enter.
    const { payload } = result;
    const ok = result.exitCode === 0;
    rows.push({ text: `Wire ${payload.check ? "check · read-only, nothing written" : "write"} · ${payload.file} · snapshot ${payload.snapshot.slice(0, 8)}`, style: { ...THEME.panel, bold: true } });
    rows.push({ text: `${wireOutcome(record.status, payload, result.exitCode)}${result.exitCode === null ? "" : ` · code ${result.exitCode}`}`, style: { ...THEME.panel, ...(ok ? MARK_STYLE.ok : MARK_STYLE.fail), bg: THEME.panel.bg! } });
    for (const message of result.messages) rows.push({ text: `  ${message.text}`, style: message.level === "error" ? { ...THEME.panel, ...THEME.error } : THEME.panel });
    if (payload.refused.length > 0) rows.push({ text: "  Enter on the entry generates it again", style: THEME.hint });
    if (payload.diagnostics.length > 0) rows.push({ text: "  Tab, then Enter opens the first error", style: THEME.hint });
    else if (payload.state !== "blocked" && (payload.written || payload.state !== "stale")) rows.push({ text: `  Tab, then Enter shows ${payload.file} read-only · never compiled or run here`, style: THEME.hint });
  } else if (result?.kind === "parse" && result.payload !== null) {
    // The Text IR of the saved files: the diagnostics first (Tab, then Enter opens one), then the CLI's stdout.
    const { payload } = result;
    const selected = state.results.scrollReport ? state.results.gap : -1;
    const paths = record.params.kind === "parse" ? record.params.paths.join(" ") : "";
    rows.push({ text: `Parse · read-only, nothing written · saved files · ${paths} · ${payload.format}`, style: { ...THEME.panel, bold: true } });
    rows.push({ text: `${parseOutcome(payload)} · code ${result.exitCode}`, style: { ...THEME.panel, ...(result.exitCode === 0 ? MARK_STYLE.ok : MARK_STYLE.fail), bg: THEME.panel.bg! } });
    rows.push({ text: "  the parser alone: no code snapshot, no rules; offsets count UTF-16 code units, columns code points", style: { ...THEME.panel, fg: 243 } });
    for (const file of payload.skipped) rows.push({ text: `  ${file}: a saved explanation, not keylang Markdown; skipped`, style: { ...THEME.panel, fg: 243 } });
    for (const file of payload.unreadable) rows.push({ text: `  ${file}: cannot be read; parsed as empty text, as the CLI does`, style: { ...THEME.panel, ...THEME.error } });
    payload.diagnostics.forEach((d, index) => {
      rows.push({ text: `  ${formatDiagnostic(d)}`, style: index === selected ? THEME.selected : isError(d) ? { ...THEME.panel, ...THEME.error } : { ...THEME.panel, fg: 179 }, gap: index });
    });
    if (payload.diagnostics.length > 0) rows.push({ text: "  Tab, then ↑↓ select a diagnostic and Enter opens it · PgUp PgDn scroll the text", style: THEME.hint });
    rows.push({ text: `── ${payload.format === "json" ? "keylang parse --json" : "keylang parse"} · stdout ──`, style: { ...THEME.panel, fg: 243 } });
    const lines = payload.text.split("\n");
    if (lines.at(-1) === "") lines.pop();
    for (const line of lines) rows.push({ text: line, style: THEME.panel });
  } else if (result?.kind === "explain" && result.payload !== null) {
    // Offline: a code's help, or the node's summary with its saved answer and brief apart, each with its provenance.
    const { payload } = result;
    if (payload.subject === "code") {
      rows.push({ text: `Explain · ${payload.code} · offline help of the code · nothing read, nothing written`, style: { ...THEME.panel, bold: true } });
      rows.push({ text: `${explainOutcome(payload)} · code ${result.exitCode}`, style: { ...THEME.panel, ...MARK_STYLE.ok, bg: THEME.panel.bg! } });
      for (const line of payload.text.trimEnd().split("\n")) rows.push({ text: `  ${line}`, style: THEME.panel });
    } else {
      const selected = state.results.scrollReport ? state.results.gap : -1;
      rows.push({ text: `Explain · ${payload.id} · offline, no model, nothing written · saved code and specs · snapshot ${payload.snapshotId === null ? "none" : payload.snapshotId.slice(0, 8)}`, style: { ...THEME.panel, bold: true } });
      rows.push({ text: `${explainOutcome(payload)} · code ${result.exitCode}`, style: { ...THEME.panel, ...MARK_STYLE.ok, bg: THEME.panel.bg! } });
      for (const message of result.messages) if (message.level === "warning") rows.push({ text: `  ${message.text}`, style: { ...THEME.panel, fg: 179 } });
      rows.push({ text: "── the snapshot and the specs (doc: is the code's documentation comment) ──", style: { ...THEME.panel, fg: 243 } });
      for (const line of formatSummary(payload.summary).split("\n")) rows.push({ text: `  ${line}`, style: THEME.panel });
      if (payload.saved !== null) savedRows(rows, "saved answer", payload.saved);
      else rows.push({ text: `  no saved ${payload.detail === "brief" ? "brief" : "answer"}: keylang explain ${payload.id} --llm${payload.detail === "brief" ? " --brief" : ""} asks the model; nothing here does`, style: { ...THEME.panel, fg: 243 } });
      if (payload.brief !== null) savedRows(rows, "saved brief (the explained map)", payload.brief);
      if (payload.links.length > 0) rows.push({ text: "── places ──", style: { ...THEME.panel, fg: 243 } });
      payload.links.forEach((link, index) => {
        rows.push({ text: `  ${link.text}`, style: index === selected ? THEME.selected : link.file === null ? { ...THEME.panel, fg: 243 } : THEME.panel, gap: index });
      });
      if (payload.links.length > 0) rows.push({ text: "  Tab, then ↑↓ select a place and Enter opens it", style: THEME.hint });
    }
  } else if (result?.kind === "explain-plan" && result.payload !== null) {
    // What needs explaining: the stale and gone saved explanations, or a brief plan in waves with its approximate size; Tab, then Enter opens a known node.
    const { payload } = result;
    const selected = state.results.scrollReport ? state.results.gap : -1;
    const snapshot = `snapshot ${payload.snapshotId === null ? "none" : payload.snapshotId.slice(0, 8)}`;
    const place = (where: { file: string; line: number } | null): string => (where === null ? "" : `  ${where.file}:${where.line}`);
    if (payload.list === "stale-saved") {
      rows.push({ text: `Explanations to do · stale saved answers and briefs (keylang explain --stale) · no model, nothing written · saved code and specs · ${snapshot}`, style: { ...THEME.panel, bold: true } });
      rows.push({ text: `${explainPlanOutcome(payload)} · code ${result.exitCode}`, style: { ...THEME.panel, ...MARK_STYLE.ok, bg: THEME.panel.bg! } });
      for (const message of result.messages) if (message.level === "warning") rows.push({ text: `  ${message.text}`, style: { ...THEME.panel, fg: 179 } });
      rows.push({ text: "  the saved explanations themselves, not the brief plan: a stale one is asked again by its command; a gone id is only listed, nothing generates it", style: { ...THEME.panel, fg: 243 } });
      payload.entries.forEach((entry, index) => {
        const what = `${entry.id}${entry.kind === "brief" ? " (brief)" : ""}`;
        const text = entry.state === "gone" ? `${what}: gone (explained ${entry.date}) · ${entry.file} · not in the snapshot, not planned` : `${what}: stale (explained ${entry.date}) · ${entry.again}${place(entry.place)}`;
        rows.push({ text: `  ${text}`, style: index === selected ? THEME.selected : entry.state === "gone" ? { ...THEME.panel, fg: 243 } : THEME.panel, gap: index });
      });
    } else {
      const command = `keylang explain --${payload.batch}${payload.estimate === null ? "" : " --dry-run"}${payload.limit === null ? "" : ` --limit ${payload.limit}`} --jobs ${payload.jobs}`;
      rows.push({ text: `Explanations to do · brief plan: ${payload.batch === "missing" ? "missing and stale briefs" : "stale briefs only"} (${command}) · a preview: no model, nothing written · ${snapshot}`, style: { ...THEME.panel, bold: true } });
      rows.push({ text: `${explainPlanOutcome(payload)} · code ${result.exitCode}`, style: { ...THEME.panel, ...MARK_STYLE.ok, bg: THEME.panel.bg! } });
      for (const message of result.messages) if (message.level === "warning") rows.push({ text: `  ${message.text}`, style: { ...THEME.panel, fg: 179 } });
      const { counts } = payload;
      rows.push({ text: `  ${briefCounts(counts)} · ${payload.waves.length} wave(s) bottom-up · jobs ${payload.jobs} · limit ${payload.limit ?? "none"}${payload.candidates > payload.plan.length ? ` (${payload.candidates - payload.plan.length} more left out)` : ""}`, style: THEME.panel });
      if (payload.estimate !== null) rows.push({ text: `  approximate tokens: ~${payload.estimate.input} in, ~${payload.estimate.output} out — about 4 characters a token and 80 a brief; not the API's count or cost`, style: THEME.panel });
      rows.push({ text: `  left out: ${payload.skipped.documented} node(s) with a doc comment, ${payload.skipped.fresh} with a fresh brief${payload.gone.length > 0 ? ` · gone, never asked for: ${payload.gone.join(", ")}` : ""}`, style: { ...THEME.panel, fg: 243 } });
      rows.push({ text: "  a preview, not a permission: the batch (the form's last row, or keylang explain --missing --llm) plans again on its own analysis", style: { ...THEME.panel, fg: 243 } });
      let index = 0;
      payload.waves.forEach((wave, number) => {
        rows.push({ text: `── wave ${number + 1} · ${wave.level} · ${wave.ids.length} ──`, style: { ...THEME.panel, fg: 243 } });
        for (const id of wave.ids) {
          const entry = payload.plan[index]!;
          rows.push({ text: `  ${id} (${entry.level}) · ${entry.reason === "stale" ? "stale brief" : "no brief"}${place(entry.place)}`, style: index === selected ? THEME.selected : entry.place === null ? { ...THEME.panel, fg: 243 } : THEME.panel, gap: index });
          index++;
        }
      });
      if (payload.plan.length === 0) rows.push({ text: "  zero work: no node needs a brief; no request would be made", style: THEME.panel });
    }
    const listed = payload.list === "stale-saved" ? payload.entries.length : payload.plan.length;
    if (listed > 0) rows.push({ text: "  Tab, then ↑↓ select a node and Enter opens its code", style: THEME.hint });
  } else if (result?.kind === "explain-batch" && result.payload !== null) {
    // A batch: what it planned, what landed, what failed with why, what was never asked; Tab, then Enter opens a node.
    const { payload } = result;
    const selected = state.results.scrollReport ? state.results.gap : -1;
    const ok = result.exitCode === 0;
    rows.push({ text: `Explain briefs with the model · keylang ${explainBatchLabel({ kind: "explain-batch", root: "", batch: payload.batch, ...(payload.limit !== null ? { limit: payload.limit } : {}), jobs: payload.jobs })} · lang ${payload.lang} · agent ${payload.agent || "none"} · snapshot ${payload.snapshotId === null ? "none" : payload.snapshotId.slice(0, 8)}`, style: { ...THEME.panel, bold: true } });
    rows.push({ text: `${explainBatchOutcome(payload)}${result.exitCode === null ? "" : ` · code ${result.exitCode}`}`, style: { ...THEME.panel, ...(ok ? MARK_STYLE.ok : MARK_STYLE.fail), bg: THEME.panel.bg! } });
    if (payload.stopped === "cancelled") rows.push({ text: "  cancelled: no request was started after it, the ones in flight were closed; the briefs written before stay (no rollback)", style: { ...THEME.panel, fg: 179 } });
    if (payload.stopped === "outdated") rows.push({ text: "  the inputs changed while the batch ran: nothing was asked for or written after it; the briefs written before stay — run the batch again", style: { ...THEME.panel, fg: 179 } });
    if (payload.stopped === "refused") rows.push({ text: "  the session refused the write: nothing was written", style: { ...THEME.panel, fg: 179 } });
    for (const message of result.messages) if (message.level === "warning" || (message.level === "error" && payload.refused.includes(message.text))) rows.push({ text: `  ${message.text}`, style: message.level === "error" ? { ...THEME.panel, ...THEME.error } : { ...THEME.panel, fg: 179 } });
    if (payload.plan.length > 0) rows.push({ text: `  ${payload.plan.length} planned · ${payload.done.length} written · ${payload.failed.length} failed · ${payload.notStarted.length} not started · jobs ${payload.jobs} · limit ${payload.limit ?? "none"} · a run again asks only for what is still missing or stale`, style: { ...THEME.panel, fg: 243 } });
    let wave: number | null = null;
    payload.plan.forEach((entry, index) => {
      if (entry.wave !== wave) rows.push({ text: `── ${entry.level} ──`, style: { ...THEME.panel, fg: 243 } });
      wave = entry.wave;
      const now = batchState(payload, entry.id);
      const style = index === selected ? THEME.selected : now.startsWith("failed") ? { ...THEME.panel, ...THEME.error } : now === "not started" ? { ...THEME.panel, fg: 243 } : THEME.panel;
      rows.push({ text: `  ${entry.id} (${entry.level}) · ${now}`, style, gap: index });
    });
    if (payload.plan.length === 0) rows.push({ text: "  zero work: no node needs a brief; no request was made", style: THEME.panel });
    if (payload.plan.length > 0) rows.push({ text: "  Tab, then ↑↓ select a node and Enter opens its code", style: THEME.hint });
  } else if (result?.kind === "explain-llm" && result.payload !== null) {
    // The model's answer with where it came from (cache, model, none), the summary it was asked about, and what was written.
    const { payload } = result;
    const selected = state.results.scrollReport ? state.results.gap : -1;
    const ok = result.exitCode === 0;
    rows.push({ text: `Explain with the model · ${payload.id} · ${payload.detail} · lang ${payload.lang} · agent ${payload.agent ?? "none"} · saved code and specs · snapshot ${payload.snapshotId === null ? "none" : payload.snapshotId.slice(0, 8)}`, style: { ...THEME.panel, bold: true } });
    rows.push({ text: `${explainLlmOutcome(payload)}${result.exitCode === null ? "" : ` · code ${result.exitCode}`}`, style: { ...THEME.panel, ...(ok ? MARK_STYLE.ok : MARK_STYLE.fail), bg: THEME.panel.bg! } });
    const why = payload.reason === "missing" ? "no saved answer" : payload.reason === "stale" ? "the saved answer was stale" : payload.reason === "lang" ? `the saved answer was in ${payload.previous?.lang ?? "another language"}` : payload.reason === "detail" ? `the saved answer was ${payload.previous?.detail ?? "another detail"}` : null;
    if (payload.source === "cache") rows.push({ text: "  read from the saved file: fresh, same detail and language; the model was not asked, nothing was written", style: { ...THEME.panel, fg: 243 } });
    if (payload.source === "model" && why !== null) rows.push({ text: `  ${why}: the model was asked once${payload.written === null ? "" : `; the map is not written (the explained map follows keylang map)`}`, style: { ...THEME.panel, fg: 243 } });
    for (const message of result.messages) if (message.level !== "info") rows.push({ text: `  ${message.text}`, style: message.level === "error" ? { ...THEME.panel, ...THEME.error } : { ...THEME.panel, fg: 179 } });
    rows.push({ text: "── the snapshot and the specs (doc: is the code's documentation comment) ──", style: { ...THEME.panel, fg: 243 } });
    for (const line of formatSummary(payload.summary).split("\n")) rows.push({ text: `  ${line}`, style: THEME.panel });
    if (payload.source === "model" && payload.answer !== null) savedRows(rows, payload.written === null ? "the model's answer, not written" : "new answer, saved", payload.answer);
    if (payload.source === "model" && payload.written === null) {
      if (payload.previous !== null) savedRows(rows, "saved answer, kept", payload.previous);
      else rows.push({ text: "  no saved answer: nothing was written", style: { ...THEME.panel, fg: 243 } });
    }
    if (payload.source !== "model") {
      if (payload.answer !== null) savedRows(rows, payload.source === "cache" ? "saved answer, read" : "saved answer", payload.answer);
      else rows.push({ text: "  no saved answer", style: { ...THEME.panel, fg: 243 } });
    }
    if (payload.links.length > 0) rows.push({ text: "── places ──", style: { ...THEME.panel, fg: 243 } });
    payload.links.forEach((link, index) => {
      rows.push({ text: `  ${link.text}`, style: index === selected ? THEME.selected : link.file === null ? { ...THEME.panel, fg: 243 } : THEME.panel, gap: index });
    });
    if (payload.links.length > 0) rows.push({ text: "  Tab, then ↑↓ select a place and Enter opens it", style: THEME.hint });
  } else if (result?.kind === "trace-plan" && result.payload !== null) {
    // The plan an adapter reads: a summary, each symbol (Tab, then Enter opens it in the code), then the CLI's stdout.
    const { payload } = result;
    const { plan } = payload;
    const selected = state.results.scrollReport ? state.results.gap : -1;
    rows.push({ text: `Trace plan · flow ${plan.flow} · read-only, nothing written, nothing run · fresh snapshot ${plan.snapshotId.slice(0, 8)} · schemaVersion ${plan.schemaVersion}`, style: { ...THEME.panel, bold: true } });
    rows.push({ text: `${tracePlanOutcome(payload)} · code ${result.exitCode}`, style: { ...THEME.panel, ...MARK_STYLE.ok, bg: THEME.panel.bg! } });
    rows.push({ text: "  a plan is no evidence: a step is observed only by a trace run, and an adapter leaves a file whose sha256 changed alone", style: { ...THEME.panel, fg: 243 } });
    plan.symbols.forEach((symbol, index) => {
      rows.push({ text: `  ${symbol.id}  ${symbol.file}:${symbol.line}:${symbol.col}  sha256 ${symbol.sha256.slice(0, 12)}`, style: index === selected ? THEME.selected : THEME.panel, gap: index });
    });
    if (payload.omitted.length > 0) rows.push({ text: `  not in the plan (no function of the snapshot): ${payload.omitted.join(", ")}`, style: { ...THEME.panel, fg: 179 } });
    if (plan.symbols.length > 0) rows.push({ text: "  Tab, then ↑↓ select a symbol and Enter opens it in the code · PgUp PgDn scroll the JSON", style: THEME.hint });
    rows.push({ text: `── keylang trace-plan ${plan.flow} · stdout ──`, style: { ...THEME.panel, fg: 243 } });
    const lines = payload.text.split("\n");
    if (lines.at(-1) === "") lines.pop();
    for (const line of lines) rows.push({ text: line, style: THEME.panel });
  } else if (result?.kind === "export-c4" && result.payload !== null) {
    // The diagram as the CLI prints it; written, only where it went (c4-zoom/12).
    const { payload } = result;
    rows.push({ text: `C4 diagram · ${payload.format} · ${payload.level}${payload.layer !== null ? ` · layer ${payload.layer}` : ""} · ${payload.out !== null ? `written to ${payload.out}` : "shown here, nothing written"}`, style: { ...THEME.panel, bold: true } });
    rows.push({ text: `${c4Outcome(payload, result.exitCode)} · code ${result.exitCode}`, style: { ...THEME.panel, ...(result.exitCode === 0 ? MARK_STYLE.ok : MARK_STYLE.fail), bg: THEME.panel.bg! } });
    for (const message of result.messages) rows.push({ text: `  ${message.text}`, style: message.level === "error" ? { ...THEME.panel, ...THEME.error } : THEME.panel });
    if (payload.out === null && result.exitCode === 0) {
      rows.push({ text: `── keylang ${operationLabel(record.params)} · stdout ──`, style: { ...THEME.panel, fg: 243 } });
      const lines = payload.text.split("\n");
      if (lines.at(-1) === "") lines.pop();
      for (const line of lines) rows.push({ text: line, style: THEME.panel });
    }
  } else if (result?.kind === "feature-questions" && result.payload !== null) {
    // The model's questions as proposed: the feature file itself is written only through MERGE (c4-zoom/11).
    const { payload } = result;
    rows.push({ text: `Questions · ${payload.agent} · ${payload.file} · proposal; the feature file itself is not written`, style: { ...THEME.panel, bold: true } });
    rows.push({ text: `${questionsOutcome(payload)} · code ${result.exitCode}`, style: { ...THEME.panel, ...(result.exitCode === 0 ? MARK_STYLE.ok : MARK_STYLE.fail), bg: THEME.panel.bg! } });
    for (const message of result.messages) rows.push({ text: `  ${message.text}`, style: message.level === "error" ? { ...THEME.panel, ...THEME.error } : THEME.panel });
    for (const question of payload.questions) rows.push({ text: `  ${question}`, style: { ...THEME.panel, ...MARK_STYLE.question, bg: THEME.panel.bg! } });
    if (payload.proposal !== null) rows.push({ text: `  Enter opens MERGE of ${payload.file} (m and Proposals too)`, style: THEME.hint });
  } else if (result?.kind === "draft-flow" && result.payload !== null) {
    // The candidate: what it keeps of the target, the flow section, and for a preview the whole proposed text.
    const { payload } = result;
    const { candidate } = payload;
    const ok = result.exitCode === 0;
    rows.push({ text: `Draft flow · ${payload.mode}${payload.fallback !== null ? " (hybrid without a model)" : ""} · ${candidate.trigger} → ${candidate.target} · ${payload.output === "preview" ? "preview, nothing written" : "proposal; the target itself is not written"}`, style: { ...THEME.panel, bold: true } });
    rows.push({ text: `${draftOutcome(record.status, payload)}${result.exitCode === null ? "" : ` · code ${result.exitCode}`}`, style: { ...THEME.panel, ...(ok ? MARK_STYLE.ok : MARK_STYLE.fail), bg: THEME.panel.bg! } });
    for (const message of result.messages) rows.push({ text: `  ${message.text}`, style: message.level === "error" ? { ...THEME.panel, ...THEME.error } : THEME.panel });
    const kept = candidate.before === null ? "a new file" : "exists: its other sections are kept, a section of the same flow is replaced";
    rows.push({ text: `  target ${candidate.target}: ${candidate.problem ?? kept}`, style: candidate.problem !== null ? { ...THEME.panel, fg: 179 } : { ...THEME.panel, fg: 243 } });
    if (payload.model === null) rows.push({ text: "  only the calls the snapshot resolved are steps; an unresolved one is a comment on its caller", style: { ...THEME.panel, fg: 243 } });
    else {
      rows.push({ text: `  drafted by ${payload.model.agent} in ${payload.model.rounds} round(s): agree — the snapshot's calls have it; llm-only — the model's alone; conflict — not a fn`, style: { ...THEME.panel, fg: 243 } });
      rows.push({ text: "  the statuses are provenance, not evidence: only check decides a verdict", style: { ...THEME.panel, fg: 243 } });
    }
    if (payload.proposal !== null) rows.push({ text: `  Enter opens MERGE of ${candidate.target} (m and Proposals too)`, style: THEME.hint });
    else if (payload.output === "preview") rows.push({ text: "  Enter drafts again · the form's proposal output writes it", style: THEME.hint });
    rows.push({ text: `── keylang draft flow ${candidate.trigger}${payload.mode !== "algo" ? ` --mode ${payload.mode}` : ""} --print · stdout ──`, style: { ...THEME.panel, fg: 243 } });
    const flowLines = candidate.flow.split("\n");
    if (flowLines.at(-1) === "") flowLines.pop();
    for (const line of flowLines) rows.push({ text: line, style: THEME.panel });
    if (payload.output === "preview" && candidate.text !== null && candidate.text !== candidate.flow) {
      rows.push({ text: `── ${candidate.target} as proposed ──`, style: { ...THEME.panel, fg: 243 } });
      const lines = candidate.text.replace(/\r\n/g, "\n").split("\n");
      if (lines.at(-1) === "") lines.pop();
      for (const line of lines) rows.push({ text: line, style: THEME.panel });
    }
  } else if (result?.kind === "draft-rules" && result.payload !== null) {
    // The drafted rules: how each compares with the code now, the conflicts with their evidence apart, then the CLI's stdout.
    const { payload } = result;
    const { candidate } = payload;
    const ok = result.exitCode === 0;
    rows.push({ text: `Draft rules · ${payload.mode}${payload.fallback !== null ? " (hybrid without a model)" : ""} → ${candidate.target} · ${payload.output === "preview" ? "preview, nothing written" : "proposal; the target itself is not written"}`, style: { ...THEME.panel, bold: true } });
    rows.push({ text: `${draftOutcome(record.status, payload)}${result.exitCode === null ? "" : ` · code ${result.exitCode}`}`, style: { ...THEME.panel, ...(ok ? MARK_STYLE.ok : MARK_STYLE.fail), bg: THEME.panel.bg! } });
    for (const message of result.messages) if (!message.text.startsWith("conflict: ")) rows.push({ text: `  ${message.text}`, style: message.level === "error" ? { ...THEME.panel, ...THEME.error } : THEME.panel });
    const kept = candidate.before === null ? "a new file" : "exists: its prose and other sections are kept; the rules join its last # rules section, a rule it has is not repeated";
    rows.push({ text: `  target ${candidate.target}: ${candidate.problem ?? kept}`, style: candidate.problem !== null ? { ...THEME.panel, fg: 179 } : { ...THEME.panel, fg: 243 } });
    rows.push({ text: `  algo: the rules the code keeps now${payload.cyclic ? "; the modules form a cycle, so no no-cycles" : ""}`, style: { ...THEME.panel, fg: 243 } });
    if (payload.model !== null) {
      rows.push({ text: `  proposed by ${payload.model.agent}, each rule checked alone against the snapshot: agree — the code keeps it; conflict — the code breaks it now; llm-only — not enough evidence; algo-only — the snapshot's`, style: { ...THEME.panel, fg: 243 } });
      rows.push({ text: "  the statuses are the draft's, not the workspace's verdict: the current report is unchanged, only check decides", style: { ...THEME.panel, fg: 243 } });
      if (payload.model.conflicts.length > 0) {
        rows.push({ text: `  conflicts (${payload.model.conflicts.length}): the code breaks these rules now`, style: { ...THEME.panel, fg: 179 } });
        for (const conflict of payload.model.conflicts) rows.push({ text: `    conflict: ${conflict}`, style: { ...THEME.panel, fg: 179 } });
      }
    }
    if (payload.proposal !== null) rows.push({ text: `  Enter opens MERGE of ${candidate.target} (m and Proposals too)`, style: THEME.hint });
    else if (payload.output === "preview") rows.push({ text: "  Enter drafts again · the form's proposal output writes it", style: THEME.hint });
    rows.push({ text: `── keylang draft rules${payload.mode !== "algo" ? ` --mode ${payload.mode}` : ""} --print · stdout ──`, style: { ...THEME.panel, fg: 243 } });
    const ruleLines = candidate.rules.split("\n");
    if (ruleLines.at(-1) === "") ruleLines.pop();
    for (const line of ruleLines) rows.push({ text: line, style: THEME.panel });
    if (payload.output === "preview" && candidate.text !== null && candidate.text !== candidate.rules) {
      rows.push({ text: `── ${candidate.target} as proposed ──`, style: { ...THEME.panel, fg: 243 } });
      const lines = candidate.text.replace(/\r\n/g, "\n").split("\n");
      if (lines.at(-1) === "") lines.pop();
      for (const line of lines) rows.push({ text: line, style: THEME.panel });
    }
  } else if (result?.kind === "code-to-spec" && result.payload !== null) {
    // The flows the source names, the model's notes, what they make of the target, the CLI's --print, and for a preview the whole proposed text.
    const { payload } = result;
    const { candidate } = payload;
    const ok = result.exitCode === 0;
    const position = codeSource({ file: candidate?.file, line: candidate?.line, since: payload.since });
    const mode = `${payload.mode}${payload.fallback !== null ? " (hybrid without a model)" : ""}`;
    rows.push({ text: `Code to spec · ${mode} · ${position}${candidate !== null ? ` → ${candidate.target} · ${payload.output === "preview" ? "preview, nothing written" : "proposal; the target itself is not written"}` : " · nothing to draft, nothing written"}`, style: { ...THEME.panel, bold: true } });
    rows.push({ text: `${draftOutcome(record.status, payload)}${result.exitCode === null ? "" : ` · code ${result.exitCode}`}`, style: { ...THEME.panel, ...(ok ? MARK_STYLE.ok : MARK_STYLE.fail), bg: THEME.panel.bg! } });
    for (const message of result.messages) rows.push({ text: `  ${message.text}`, style: message.level === "error" ? { ...THEME.panel, ...THEME.error } : message.level === "warning" ? { ...THEME.panel, fg: 179 } : THEME.panel });
    const scope =
      payload.since !== null
        ? `every fn changed in the working tree since ${payload.since}, untracked files whole; a fn already in a hand-written flow is named for review, not drafted again`
        : candidate !== null && candidate.line !== null
          ? `line ${candidate.line}: the innermost fn holding it`
          : "every exported fn of the file, in declaration order";
    rows.push({ text: `  ${scope}${candidate !== null ? `; the spec is named ${candidate.name}` : ""}`, style: { ...THEME.panel, fg: 243 } });
    if (payload.described.length > 0) rows.push({ text: `  already in flows (review those): ${payload.described.join(", ")}`, style: { ...THEME.panel, fg: 179 } });
    if (candidate !== null) {
      for (const flow of candidate.flows) rows.push({ text: `  flow ${flow.name} · trigger ${flow.trigger} · ${flow.steps.length} step(s)`, style: THEME.panel });
      const kept = candidate.before === null ? "a new file" : "exists: its other sections are kept, a section of the same flow is replaced";
      rows.push({ text: `  target ${candidate.target}: ${candidate.problem ?? kept}`, style: candidate.problem !== null ? { ...THEME.panel, fg: 179 } : { ...THEME.panel, fg: 243 } });
      if (payload.model === null) rows.push({ text: "  only the calls the snapshot resolved are steps; an unresolved one is a comment on its caller", style: { ...THEME.panel, fg: 243 } });
      else {
        rows.push({ text: `  drafted by ${payload.model.agent}, one request per flow: agree — the snapshot's calls have it; llm-only — the model's alone; conflict — not a fn`, style: { ...THEME.panel, fg: 243 } });
        rows.push({ text: "  the statuses are provenance, not evidence: only check decides a verdict", style: { ...THEME.panel, fg: 243 } });
      }
      if (payload.proposal !== null) rows.push({ text: `  Enter opens MERGE of ${candidate.target} (m and Proposals too)`, style: THEME.hint });
      else if (payload.output === "preview") rows.push({ text: "  Enter drafts again · the form's proposal output writes it", style: THEME.hint });
      rows.push({ text: `── keylang code-to-spec ${position} --mode ${payload.mode} --print · stdout ──`, style: { ...THEME.panel, fg: 243 } });
      const printLines = candidate.print.split("\n");
      if (printLines.at(-1) === "") printLines.pop();
      for (const line of printLines) rows.push({ text: line, style: THEME.panel });
      if (payload.output === "preview" && candidate.text !== null && candidate.text !== candidate.print) {
        rows.push({ text: `── ${candidate.target} as proposed ──`, style: { ...THEME.panel, fg: 243 } });
        const lines = candidate.text.replace(/\r\n/g, "\n").split("\n");
        if (lines.at(-1) === "") lines.pop();
        for (const line of lines) rows.push({ text: line, style: THEME.panel });
      }
    }
  } else if (result?.kind === "spec-to-code" && result.payload !== null) {
    // Each file as its own proposal, the candidate's findings as a preview of check, the test notes, the CLI's stdout.
    const { payload } = result;
    const { candidate } = payload;
    const ok = result.exitCode === 0;
    const muted = { ...THEME.panel, fg: 243 };
    rows.push({ text: `Spec to code · ${payload.mode === "llm" ? "llm" : "template"} · ${candidate.id} → ${candidate.targets.length} file(s) · ${payload.output === "preview" ? "preview, nothing written" : "proposals; no source or test file itself is written"}`, style: { ...THEME.panel, bold: true } });
    rows.push({ text: `${specCodeOutcome(record.status, payload)}${result.exitCode === null ? "" : ` · code ${result.exitCode}`}`, style: { ...THEME.panel, ...(ok ? MARK_STYLE.ok : MARK_STYLE.fail), bg: THEME.panel.bg! } });
    for (const message of result.messages) rows.push({ text: `  ${message.text}`, style: message.level === "error" ? { ...THEME.panel, ...THEME.error } : message.level === "warning" ? { ...THEME.panel, fg: 179 } : THEME.panel });
    if (payload.model !== null) rows.push({ text: `  written by ${payload.model.agent} in ${payload.model.requests} request(s): provenance, not evidence — review each hunk in MERGE; nothing is accepted for you and its tests are not run`, style: muted });
    for (const target of candidate.targets) {
      const store = `${PROPOSALS_DIR}/${target.file}`;
      const state = payload.proposals.includes(store) ? `proposed as ${store}` : target.pending !== null ? `a proposal was waiting at ${store}` : payload.output === "preview" ? "previewed" : "not proposed";
      rows.push({ text: `  ${target.role} ${target.file}${target.before === null ? " (new file)" : " (the stub is appended)"} · ${state}`, style: THEME.panel });
    }
    rows.push({ text: `  with the candidate in place: ${candidate.verdicts.length} verdict(s), ${candidate.diagnostics.length} diagnostic(s) — the candidate's, a preview of check; not the workspace's verdict, and not the feature done`, style: muted });
    if (payload.proposals.length > 0) rows.push({ text: "  Enter opens the proposals list: each file merges on its own (m and Proposals too)", style: THEME.hint });
    else if (payload.output === "preview") rows.push({ text: "  Enter builds it again · the form's proposal output writes the proposals", style: THEME.hint });
    if (record.status === "completed" && record.outdated === null && payload.proposals.length === 0)
      rows.push({ text: `  a applies the entire candidate: writes these ${candidate.targets.length} file(s) directly, as --apply, after a step that names them — no proposal, no test is run`, style: THEME.hint });
    rows.push({ text: `── keylang spec-to-code ${candidate.id}${payload.mode === "llm" ? " --mode llm" : ""} --print · stdout ──`, style: muted });
    const lines = candidate.print.replace(/\r\n/g, "\n").split("\n");
    if (lines.at(-1) === "") lines.pop();
    for (const line of lines) rows.push({ text: line, style: THEME.panel });
  } else if (result?.kind === "apply-code" && result.payload !== null) {
    // Each file of the candidate with what happened to it: written, failed with its error, not attempted.
    const { payload } = result;
    const ok = result.exitCode === 0;
    rows.push({ text: `Apply spec-to-code candidate · ${payload.id} → ${payload.files.length} file(s) · written directly, no proposal`, style: { ...THEME.panel, bold: true } });
    rows.push({ text: `${applyOutcome(record.status, payload)}${result.exitCode === null ? "" : ` · code ${result.exitCode}`}`, style: { ...THEME.panel, ...(ok ? MARK_STYLE.ok : MARK_STYLE.fail), bg: THEME.panel.bg! } });
    for (const message of result.messages) rows.push({ text: `  ${message.text}`, style: message.level === "error" ? { ...THEME.panel, ...THEME.error } : THEME.panel });
    for (const file of payload.files) {
      const state = file.state === "completed" ? "written" : file.state === "failed" ? `failed: ${file.error ?? ""}` : "not attempted";
      rows.push({ text: `  ${file.role} ${file.file} · ${state}`, style: file.state === "failed" ? { ...THEME.panel, ...THEME.error } : THEME.panel });
    }
    rows.push({ text: "  no test was run and the feature is not marked done; u undoes only the last MERGE, not this write", style: { ...THEME.panel, fg: 243 } });
  } else if (result?.kind === "draft-layout" && result.payload !== null) {
    // The drafted layers, then what Enter does with them, then the CLI's stdout.
    const { payload } = result;
    rows.push({ text: `Draft layers · ${payload.mode}${payload.fallback !== null ? " (hybrid without a model)" : ""} · nothing written, not even a proposal`, style: { ...THEME.panel, bold: true } });
    rows.push({ text: `${recordSummary(record)}`, style: { ...THEME.panel, ...MARK_STYLE.ok, bg: THEME.panel.bg! } });
    for (const message of result.messages) rows.push({ text: `  ${message.text}`, style: THEME.panel });
    rows.push({ text: `  ${payload.agent === null ? "algo: the layers keylang would guess from the directories" : `proposed by ${payload.agent}, validated as keylang.json: a proposal, never assigned without you`}`, style: { ...THEME.panel, fg: 243 } });
    for (const [name, globs] of Object.entries(payload.layers)) rows.push({ text: `  ${name}  ${globs.join(", ")}`, style: THEME.panel });
    if (record.outdated === null)
      rows.push({
        text: `  Enter: move the layers into ${payload.configExists ? "keylang.json's buffer — only layers change, every other field stays" : "a new keylang.json buffer, the inferred config with these layers"}; written only by Ctrl+S, Ctrl+Z undoes`,
        style: THEME.hint,
      });
    rows.push({ text: `── keylang draft map${payload.mode !== "algo" ? ` --mode ${payload.mode}` : ""} · stdout ──`, style: { ...THEME.panel, fg: 243 } });
    const lines = payload.preview.split("\n");
    if (lines.at(-1) === "") lines.pop();
    for (const line of lines) rows.push({ text: line, style: THEME.panel });
  } else if (result?.kind === "fmt" && result.payload !== null) {
    // Every file of the selection with what happened to it; a failure never hides the files already written.
    const { payload } = result;
    const ok = result.exitCode === 0;
    rows.push({ text: `Fmt ${payload.check ? "check · read-only, nothing written" : "write"} · ${payload.files.length} file(s)`, style: { ...THEME.panel, bold: true } });
    rows.push({ text: `${fmtOutcome(record.status, payload)}${result.exitCode === null ? "" : ` · code ${result.exitCode}`}`, style: { ...THEME.panel, ...(ok ? MARK_STYLE.ok : MARK_STYLE.fail), bg: THEME.panel.bg! } });
    const label: Record<FmtFile["state"], string> = {
      current: "canonical",
      stale: payload.check ? "not formatted" : "not written",
      formatted: "formatted",
      invalid: "invalid",
      explanation: "skipped",
      generated: "skipped",
      unreadable: "unreadable",
      failed: "not written",
      "not-attempted": "not written",
    };
    for (const file of payload.files) {
      const why = file.state === "explanation" ? ": a saved explanation, not keylang Markdown" : file.state === "generated" ? ": a generated file, its generator writes it" : file.state === "not-attempted" ? ": cancelled before it" : file.error === undefined ? "" : `: ${file.error}`;
      const bad = file.state === "failed" || file.state === "unreadable" || file.state === "invalid";
      rows.push({ text: `  ${label[file.state].padEnd(13)} ${file.path}${why}`, style: bad ? { ...THEME.panel, ...THEME.error } : file.state === "current" || file.state === "explanation" || file.state === "generated" ? { ...THEME.panel, fg: 243 } : THEME.panel });
      for (const d of file.diagnostics ?? []) rows.push({ text: `    ${d.span.start.line}:${d.span.start.col} ${d.code} ${d.message}`, style: { ...THEME.panel, ...THEME.error } });
    }
    // A message about no one file (the commit could not start) is shown as it is.
    for (const message of result.messages) if (!payload.files.some((file) => message.text.startsWith(`${file.shown}:`))) rows.push({ text: `  ${message.text}`, style: { ...THEME.panel, ...THEME.error } });
  } else if (result) {
    for (const message of result.messages) rows.push({ text: `  ${message.text}`, style: message.level === "error" ? { ...THEME.panel, ...THEME.error } : THEME.panel });
  } else {
    rows.push({ text: `  ${record.progress === null ? "running…" : `running: ${record.progress}…`} · x cancels`, style: THEME.hint });
  }
  return rows;
}

/** `ok 2 · unverified 1`, or `—` when the feature has none. */
function infoSummary(items: readonly FeatureInfo[]): string {
  if (items.length === 0) return "—";
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.verdict, (counts.get(item.verdict) ?? 0) + 1);
  return [...counts].map(([verdict, count]) => `${verdict} ${count}`).join(", ");
}

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
  const gaps = record?.result?.kind === "feature" && record.result.payload !== null && featureItems(record.result.payload.report).length > 0;
  // The readiness screen offers the model's questions only while an agent is set; without one `m` says how to set it (c4-zoom/11).
  const ask = record?.result?.kind === "feature" && record.result.payload !== null && state.analysis !== null && selectedAgent(state.analysis.config.agent) !== null ? " · m questions" : "";
  const checked =
    (record?.result?.kind === "check" && (record.result.payload?.results.length ?? 0) > 0) ||
    (record?.result?.kind === "explain-edge" && record.result.payload !== null && edgeItems(record.result.payload).length > 0) ||
    (record?.result?.kind === "parse" && (record.result.payload?.diagnostics.length ?? 0) > 0) ||
    (record?.result?.kind === "trace-plan" && (record.result.payload?.plan.symbols.length ?? 0) > 0) ||
    (record?.result?.kind === "explain" && record.result.payload?.subject === "node" && record.result.payload.links.length > 0) ||
    (record?.result?.kind === "explain-llm" && (record.result.payload?.links.length ?? 0) > 0) ||
    (record?.result?.kind === "explain-plan" && record.result.payload !== null && (record.result.payload.list === "stale-saved" ? record.result.payload.entries.length : record.result.payload.plan.length) > 0) ||
    (record?.result?.kind === "explain-batch" && (record.result.payload?.plan.length ?? 0) > 0);
  const item = record?.kind === "explain-edge" ? "evidence" : record?.kind === "parse" ? "diagnostic" : record?.kind === "trace-plan" ? "symbol" : record?.kind === "explain" || record?.kind === "explain-llm" ? "place" : record?.kind === "explain-plan" || record?.kind === "explain-batch" ? "node" : "finding";
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

function drawPrompt(grid: Grid, state: State, rect: Rect, editor: Rect): void {
  const prompt = state.prompt!;
  grid.fill(rect.x, rect.y, rect.width, 1, THEME.status);
  const label = prompt.kind === "new-spec" ? newSpecLabel(prompt.form?.field) : prompt.kind === "search" ? "/" : prompt.kind === "context" ? "@" : prompt.kind === "node" ? "node: " : prompt.kind === "flow" ? "flow: " : prompt.kind === "feature" ? "feature slug: " : prompt.kind === "proposal" ? "proposal: " : prompt.kind === "baseline" ? "baseline: " : prompt.kind === "agents" ? "agents (auto, none, claude,codex…): " : prompt.kind === "init" ? "init harnesses (auto, none, claude,codex…): " : prompt.kind === "fmt" ? "fmt paths: " : prompt.kind === "parse" ? "parse paths: " : prompt.kind === "trace-plan" ? "trace-plan flow: " : prompt.kind === "explain" ? (prompt.explainModel ? "explain --llm: " : prompt.explainPlan ? "explain " : "explain: ") : prompt.kind === "wire" ? "wire out: " : prompt.kind === "full-check" ? "check paths: " : prompt.kind === "explain-edge" ? "explain edge: " : prompt.kind === "export" ? "export to: " : prompt.kind === "draft-flow" ? "draft flow: " : prompt.kind === "draft-rules" ? "draft rules: " : prompt.kind === "draft-layout" ? "draft map: " : prompt.kind === "code-to-spec" ? "code to spec: " : prompt.kind === "spec-to-code" ? "spec to code: " : prompt.kind === "export-c4" ? "export c4: " : ":";
  // The edge form types into its selected row; the status line shows both ids.
  const typed = prompt.kind === "explain-edge" && prompt.edge ? `${prompt.edge.from || "?"} ↔ ${prompt.edge.to || "?"}` : prompt.kind === "draft-flow" && prompt.draft ? prompt.draft.trigger || "?" : prompt.kind === "draft-rules" && prompt.rulesDraft ? prompt.rulesDraft.into || "(default target)" : prompt.kind === "draft-layout" && prompt.layoutDraft ? `--mode ${prompt.layoutDraft.mode}` : prompt.kind === "spec-to-code" && prompt.specCode ? prompt.specCode.id || "?" : prompt.kind === "code-to-spec" && prompt.codeDraft ? (prompt.codeDraft.source === "since" ? `--since ${prompt.codeDraft.since || "?"}` : `${prompt.codeDraft.file || "?"}${prompt.codeDraft.line.trim() !== "" ? `:${prompt.codeDraft.line.trim()}` : ""}`) : prompt.text;
  grid.write(rect.x, rect.y, `${label}${typed}`, THEME.statusKey);
  grid.cursor = { x: Math.min(rect.width - 1, stringWidth(label) + stringWidth(typed)), y: rect.y };
  const kinded = (prompt.kind === "palette" || prompt.kind === "feature" || prompt.kind === "proposal" || prompt.kind === "new-spec" || prompt.kind === "baseline" || prompt.kind === "agents" || prompt.kind === "init" || prompt.kind === "fmt" || prompt.kind === "parse" || prompt.kind === "trace-plan" || prompt.kind === "explain" || prompt.kind === "wire" || prompt.kind === "full-check" || prompt.kind === "explain-edge" || prompt.kind === "export" || prompt.kind === "draft-flow" || prompt.kind === "draft-rules" || prompt.kind === "draft-layout" || prompt.kind === "code-to-spec" || prompt.kind === "spec-to-code" || prompt.kind === "export-c4");
  // A message (a refused Run: which field and why) wins over the note: the prompt covers the message line.
  const noteText = state.message ?? (kinded ? prompt.note : undefined) ?? "";
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
  drawBox(grid, { x: editor.x, y, width, height: items.length + details.length + 2 }, prompt.kind === "node" ? `${prompt.items.length} node(s)` : prompt.kind === "flow" ? `${prompt.items.length} flow(s) · Enter lays it over the levels` : prompt.kind === "feature" ? `${prompt.items.length} feature file(s)` : prompt.kind === "proposal" ? `${prompt.items.length} proposal(s)` : prompt.kind === "new-spec" ? "kind of the new spec" : prompt.kind === "baseline" ? "baseline rules" : prompt.kind === "agents" ? "harness integrations" : prompt.kind === "init" ? "set up keylang" : prompt.kind === "fmt" ? "format specifications" : prompt.kind === "parse" ? "parse specifications: Text IR" : prompt.kind === "trace-plan" ? `${prompt.items.length} flow(s): trace plan` : prompt.kind === "explain" ? (prompt.explainModel ? `${prompt.items.length} id(s): explain with the model · ${prompt.explainModel.detail}` : prompt.explainPlan ? "explanations to do · only the batch row asks the model and writes" : `${prompt.items.length} match(es): explain offline`) : prompt.kind === "wire" ? "wiring container" : prompt.kind === "full-check" ? "check options" : prompt.kind === "explain-edge" ? "edge between two ids" : prompt.kind === "export" ? "export the report" : prompt.kind === "draft-flow" ? `draft flow · ${prompt.draft?.mode ?? "algo"}` : prompt.kind === "draft-rules" ? `draft rules · ${prompt.rulesDraft?.mode ?? "algo"}` : prompt.kind === "draft-layout" ? `draft map · ${prompt.layoutDraft?.mode ?? "algo"}` : prompt.kind === "code-to-spec" ? `code to spec · ${prompt.codeDraft?.mode ?? "algo"}` : prompt.kind === "spec-to-code" ? `spec to code · ${prompt.specCode?.mode === "llm" ? "llm" : "template"}` : prompt.kind === "export-c4" ? "C4 diagram of the map · no model" : `${prompt.items.length} action(s)`, THEME.popup, THEME.popupTitle);
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
