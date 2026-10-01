// Drawing a TUI state into a `Grid`: pure, so a test reads the frame as text.
// Layout: title, [files] | editor with gutter | [navigation], a detail line
// and the status bar. Popups (hover, completion, palette, help) draw on top.

import { contextPack } from "../agent-context.ts";
import { CONFIG_FILE } from "../config.ts";
import { explainCode } from "../explain.ts";
import { explanationOf } from "../explanations.ts";
import { ACTIONS, catalog, exportRecord, noSnapshotReason, START_ACTIONS } from "./actions.ts";
import { highlightCode } from "./code-highlight.ts";
import { CHANNELS, evidenceOf, MARK_GLYPH, totals, type LineEvidence } from "./evidence.ts";
import { FINDING_GLYPH, VERDICTS, findingCounts, findingDetailText, findingRow, findingsOf, visibleFindings } from "./findings.ts";
import { renderMarkdown, type ReadRow } from "./markdown.ts";
import { mergeRows } from "./merge.ts";
import { navItems, type NavItem } from "./nav.ts";
import { Grid, type Style } from "./screen.ts";
import type { FeatureInfo } from "../feature-status.ts";
import { edgeLine, holeLine } from "../explain-edge.ts";
import { exportFormatOf, WIRE_OUT, type DraftFlowPayload, type DraftRulesPayload, type TracePlanPayload, type ExportPayload, type ExportRequest, type AgentsPayload, type CheckPayload, type ExplainEdgePayload, type CheckRequest, type AgentsRequest, type BaselinePayload, type FmtFile, type FmtPayload, type InitPayload, type MapCheckPayload, type MapPayload, type OperationRequest, type OperationResult, type ParsePayload, type WirePayload } from "../operations.ts";
import { formatDiagnostic, isError } from "../diag.ts";
import type { Buffer, OperationRecord, State } from "./state.ts";
import { highlight, MARK_STYLE, THEME, type Run } from "./theme.ts";
import { bufferLines, isDirty, lineLayout } from "./buffer.ts";
import { clusters, fitWidth, graphemes, padWidth, stringWidth, type LineLayout } from "./width.ts";

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
}

export const FILES_WIDTH = 24;
export const NAV_WIDTH = 32;
export const CONTEXT_WIDTH = 52;

export function layout(state: Pick<State, "cols" | "rows" | "showFiles" | "showNav"> & { context?: State["context"] }): Layout {
  const bodyTop = 1;
  const bodyHeight = Math.max(1, state.rows - 3);
  const files = state.showFiles && state.cols >= 60 ? { x: 0, y: bodyTop, width: FILES_WIDTH, height: bodyHeight } : null;
  // The context panel (F4) takes the navigation's place, wider: its labels are IDs and paths.
  const width = state.context?.open === true ? Math.min(CONTEXT_WIDTH, Math.floor(state.cols / 2)) : NAV_WIDTH;
  const nav = (state.showNav || state.context?.open === true) && state.cols >= 70 ? { x: state.cols - width, y: bodyTop, width, height: bodyHeight } : null;
  const left = files ? files.width + 1 : 0;
  const right = nav ? nav.width + 1 : 0;
  return {
    files,
    editor: { x: left, y: bodyTop, width: Math.max(10, state.cols - left - right), height: bodyHeight },
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
  // Prose staleness needs a baseline (ticket 21); the state is named, not guessed.
  parts.push({ text: "stale n/a", style: THEME.lineNumber });
  if (snapshotId) parts.push({ text: `  · snapshot ${snapshotId.slice(0, 8)}`, style: THEME.lineNumber });
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

/** Reading mode: the rendered rows, the row of the cursor line, and the first row shown. */
function readRows(state: State, buffer: Buffer, rect: Rect): { rows: ReadRow[]; cursorRow: number; top: number } {
  const rows = renderMarkdown(buffer.text, rect.width - 3);
  const at = rows.findIndex((row) => row.source - 1 >= state.cursor.line);
  const cursorRow = at === -1 ? rows.length - 1 : at;
  const top = Math.max(0, Math.min(cursorRow - Math.floor(rect.height / 3), rows.length - rect.height));
  return { rows, cursorRow, top };
}

/** The screen row (from the editor's top) where reading mode shows the cursor line: popups anchor there. */
export function readCursorRow(state: State, buffer: Buffer, rect: Rect): number {
  const { cursorRow, top } = readRows(state, buffer, rect);
  return Math.max(0, cursorRow - top);
}

function drawRead(grid: Grid, state: State, rect: Rect, buffer: Buffer): void {
  const stale = state.updating || state.outdated;
  const evidence = state.analysis ? evidenceOf(state.analysis, buffer.path) : new Map<number, LineEvidence>();
  const { rows, top } = readRows(state, buffer, rect);
  for (let i = 0; i < rect.height && top + i < rows.length; i++) {
    const row = rows[top + i]!;
    const y = rect.y + i;
    const isCursor = row.source - 1 === state.cursor.line;
    const base = isCursor ? { ...THEME.text, ...THEME.cursorLine } : THEME.text;
    grid.fill(rect.x, y, rect.width, 1, base);
    const first = rows.findIndex((r) => r.source === row.source) === top + i;
    if (first) {
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
  if (record.params.kind === "draft-flow") return `${label} · ${record.params.mode ?? "algo"} · ${record.params.output} · ${record.params.trigger}`;
  if (record.params.kind === "draft-rules") return `${label} · ${record.params.mode ?? "algo"} · ${record.params.output}${record.params.into !== undefined ? ` · ${record.params.into}` : ""}`;
  return record.params.kind === "feature" ? `${label} · ${record.params.slug}` : label;
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
  if (request.kind === "draft-flow") return `draft flow ${request.trigger}${request.mode !== undefined && request.mode !== "algo" ? ` --mode ${request.mode}` : ""}${request.output === "preview" ? " --print" : ""}`;
  if (request.kind === "draft-rules") return `draft rules${request.mode !== undefined && request.mode !== "algo" ? ` --mode ${request.mode}` : ""}${request.into !== undefined ? ` --into ${request.into}` : ""}${request.output === "preview" ? " --print" : ""}`;
  if (request.kind === "check") return ["check", ...(request.strict ? ["--strict"] : []), ...(request.changed === true ? ["--changed"] : []), ...(request.changed === true && request.since !== undefined ? ["--since", request.since] : [])].join(" ");
  return request.kind === "feature" ? `feature ${request.slug}` : request.kind === "map-check" ? "map check" : request.kind === "map" ? "map write" : request.kind;
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
  if (result?.kind === "map-check" && result.payload !== null) return `${mapCheckOutcome(result.payload)} · code ${result.exitCode}`;
  if (result?.kind === "map" && result.payload !== null) return `${mapOutcome(record.status, result.payload)}${result.exitCode === null ? "" : ` · code ${result.exitCode}`}`;
  if (result?.kind === "baseline" && result.payload !== null) return `${baselineOutcome(record.status, result.payload)}${result.exitCode === null ? "" : ` · code ${result.exitCode}`}`;
  if (result?.kind === "agents" && result.payload !== null) return `${agentsOutcome(record.status, result.payload)}${result.exitCode === null ? "" : ` · code ${result.exitCode}`}`;
  if (result?.kind === "init" && result.payload !== null) return `${initOutcome(record.status, result.payload)}${result.exitCode === null ? "" : ` · code ${result.exitCode}`}`;
  if (result?.kind === "fmt" && result.payload !== null) return `${fmtOutcome(record.status, result.payload)}${result.exitCode === null ? "" : ` · code ${result.exitCode}`}`;
  if (result?.kind === "check" && result.payload !== null) return `${checkOutcome(result.payload)} · code ${result.exitCode}`;
  if (result?.kind === "explain-edge" && result.payload !== null) return `${edgeOutcome(result.payload)} · code ${result.exitCode}`;
  if (result?.kind === "wire" && result.payload !== null) return `${wireOutcome(record.status, result.payload, result.exitCode)}${result.exitCode === null ? "" : ` · code ${result.exitCode}`}`;
  if (result?.kind === "export" && result.payload !== null) return `${exportOutcome(record.status, result.payload)}${result.exitCode === null ? "" : ` · code ${result.exitCode}`}`;
  if (result?.kind === "parse" && result.payload !== null) return `${parseOutcome(result.payload)} · code ${result.exitCode}`;
  if (result?.kind === "trace-plan" && result.payload !== null) return `${tracePlanOutcome(result.payload)} · code ${result.exitCode}`;
  if (result?.kind === "draft-flow" && result.payload !== null) return `${draftOutcome(record.status, result.payload)}${result.exitCode === null ? "" : ` · code ${result.exitCode}`}`;
  if (result?.kind === "draft-rules" && result.payload !== null) return `${draftOutcome(record.status, result.payload)}${result.exitCode === null ? "" : ` · code ${result.exitCode}`}`;
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

/** `0 fail, 2 unverified, 5 ok`: the CLI's summary line. */
function checkOutcome(payload: CheckPayload): string {
  return `${payload.counts.fail} fail, ${payload.counts.unverified} unverified, ${payload.counts.ok} ok`;
}

/** The format an export request writes: an explained edge has only the human lines. */
function exportFormat(request: ExportRequest): string {
  return exportFormatOf(request.source);
}

/** `4 function(s) to instrument, 1 step id(s) left out`: the plan and what no adapter instruments. */
function tracePlanOutcome(payload: TracePlanPayload): string {
  return `${payload.plan.symbols.length} function(s) to instrument${payload.omitted.length > 0 ? `, ${payload.omitted.length} id(s) left out` : ""}`;
}

/** `3 step(s), preview, nothing written`, `3 step(s) proposed for <target>`, `refused, nothing written`, `write failed`. */
function draftOutcome(status: OperationRecord["status"], payload: DraftFlowPayload | DraftRulesPayload): string {
  if (payload.output === "preview") return `${payload.summary}, preview, nothing written`;
  if (payload.proposal !== null) return `${payload.summary} proposed for ${payload.candidate.target}`;
  if (payload.refused.length > 0) return "refused, nothing written";
  if (payload.error !== null) return "write failed";
  return `${status}, nothing written`;
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

/** `set up`, `partial: map failed`, `keylang.json not written`, `cancelled after map`, or a check's two stages: never a success for a partial run. */
function initOutcome(status: OperationRecord["status"], payload: InitPayload): string {
  if (payload.preflight !== null && payload.preflight.status === "failed" && payload.preflight.payload !== null) return agentsOutcome(payload.preflight.status, payload.preflight.payload);
  if (payload.check) {
    const agents = payload.agents?.payload ? `harness files ${agentsOutcome(payload.agents.status, payload.agents.payload)}` : "harness files not checked";
    const baseline = payload.baseline?.payload ? `baseline ${baselineOutcome(payload.baseline.status, payload.baseline.payload)}` : payload.baseline ? "baseline not checked" : "";
    return [agents, baseline].filter((part) => part !== "").join(", ");
  }
  if (payload.config.error !== null) return "keylang.json not written, nothing else attempted";
  const stages = initStages(payload);
  if (status === "completed") return `set up: ${stages.map((stage) => stage.name).join(", ")}`;
  const bad = stages.filter((stage) => stage.result !== null && stage.result.exitCode !== 0).map((stage) => stage.name);
  const missing = stages.filter((stage) => stage.result === null).map((stage) => stage.name);
  if (status === "cancelled") return `cancelled${missing.length > 0 ? `, not run: ${missing.join(", ")}` : ""}`;
  return `partial: ${bad.join(", ")} did not finish`;
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
    // Design §2.7: the outcome, the saved state it was computed on, the gaps, and the non-blocking tests and trace.
    const { file, snapshot, report } = result.payload;
    const selected = state.results.scrollReport ? state.results.gap : -1;
    rows.push({ text: `Feature · ${result.payload.slug} · saved state · ${file}`, style: { ...THEME.panel, bold: true } });
    rows.push({
      text: `${report.done ? "Done" : `${report.gaps.length} gap(s)`} · code ${result.exitCode} · snapshot ${snapshot === null ? "none" : snapshot.slice(0, 8)}`,
      style: { ...THEME.panel, ...(report.done ? MARK_STYLE.ok : MARK_STYLE.fail), bg: THEME.panel.bg! },
    });
    report.gaps.forEach((gap, index) => {
      rows.push({ text: `${gap.kind.padEnd(8)} ${gap.id}  ${gap.file}:${gap.line}:${gap.col}  ${gap.reason}`, style: index === selected ? THEME.selected : THEME.panel, gap: index });
    });
    rows.push({ text: `Info (not blocking): tests ${infoSummary(report.info.tests)} · trace ${infoSummary(report.info.trace)}`, style: { ...THEME.panel, fg: 243 } });
    for (const item of [...report.info.tests, ...report.info.trace]) rows.push({ text: `  ${item.verdict} ${item.id}  ${item.file}:${item.line}  ${item.reason}`, style: { ...THEME.panel, fg: 243 } });
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
    if (payload.preflight?.status === "failed") {
      stageRow("harness plan", `${payload.preflight.messages.map((message) => message.text).join("; ")}${code(payload.preflight)}`, true);
      rows.push({ text: "  checked before any write: nothing was written, keylang.json included", style: THEME.hint });
    } else if (!payload.check) {
      const config = payload.config;
      stageRow(config.file, config.existed ? "kept as it is" : config.written ? `written (layers: ${config.layers.join(", ")})` : config.error !== null ? `failed: ${config.error}` : "not written", config.error !== null);
      for (const note of config.notes) rows.push({ text: `    note: ${note}`, style: { ...THEME.panel, fg: 243 } });
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
        stageRow(name, payload.config.error !== null || record.status !== "cancelled" ? "not run" : "not run (cancelled)", false);
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
    rows.push({ text: `${checkOutcome(payload)} · code ${result.exitCode}`, style: { ...THEME.panel, ...(result.exitCode === 0 ? MARK_STYLE.ok : MARK_STYLE.fail), bg: THEME.panel.bg! } });
    // Code 0 is not proof: unverified verdicts stay visible as incomplete evidence.
    if (!options.strict && payload.counts.unverified > 0) rows.push({ text: `  incomplete: ${payload.counts.unverified} unverified, not proven · strict would make it code 1`, style: { ...THEME.panel, fg: 179 } });
    if (options.withoutCode) rows.push({ text: "  specs outside the spec directory: checked on their own, without the code", style: { ...THEME.panel, fg: 243 } });
    for (const path of payload.notSpecs) rows.push({ text: `  ${path}: the explained map and saved explanations are not specs; skipped`, style: { ...THEME.panel, fg: 243 } });
    payload.results.forEach((item, index) => {
      rows.push({ text: `${FINDING_GLYPH[item.verdict]} ${findingRow(item)}`, style: index === selected ? THEME.selected : item.verdict === "ok" ? { ...THEME.panel, fg: 243 } : THEME.panel, gap: index });
    });
    if (payload.coverage.length > 0) rows.push({ text: `coverage: ${payload.coverage.length} unresolved construct(s) in the code`, style: { ...THEME.panel, fg: 243 } });
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
      unreadable: "unreadable",
      failed: "not written",
      "not-attempted": "not written",
    };
    for (const file of payload.files) {
      const why = file.state === "explanation" ? ": a saved explanation, not keylang Markdown" : file.state === "not-attempted" ? ": cancelled before it" : file.error === undefined ? "" : `: ${file.error}`;
      const bad = file.state === "failed" || file.state === "unreadable" || file.state === "invalid";
      rows.push({ text: `  ${label[file.state].padEnd(13)} ${file.path}${why}`, style: bad ? { ...THEME.panel, ...THEME.error } : file.state === "current" || file.state === "explanation" ? { ...THEME.panel, fg: 243 } : THEME.panel });
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
  const gaps = record?.result?.kind === "feature" && (record.result.payload?.report.gaps.length ?? 0) > 0;
  const checked =
    (record?.result?.kind === "check" && (record.result.payload?.results.length ?? 0) > 0) ||
    (record?.result?.kind === "explain-edge" && record.result.payload !== null && edgeItems(record.result.payload).length > 0) ||
    (record?.result?.kind === "parse" && (record.result.payload?.diagnostics.length ?? 0) > 0) ||
    (record?.result?.kind === "trace-plan" && (record.result.payload?.plan.symbols.length ?? 0) > 0);
  const item = record?.kind === "explain-edge" ? "evidence" : record?.kind === "parse" ? "diagnostic" : record?.kind === "trace-plan" ? "symbol" : "finding";
  const exportable = !analysis && record !== undefined && !("reason" in exportRecord(state));
  // Esc only folds the panel; x is the separate Cancel of the running operation (design §4).
  const proposed = (record?.result?.kind === "draft-flow" || record?.result?.kind === "draft-rules") && record.result.payload?.proposal != null;
  const hint = analysis
    ? " Enter open · Tab findings · Esc back "
    : record?.status === "running"
      ? " x cancel · Esc back "
      : proposed
        ? " Enter open MERGE · Esc back "
        : gaps
        ? results.scrollReport
          ? " Enter open gap · Tab entries · Esc back "
          : " Enter rerun · Tab gaps · Esc back "
        : checked
          ? results.scrollReport
            ? ` Enter open ${item} · Tab entries · e export · Esc back `
            : ` Enter rerun · Tab ${item === "evidence" ? item : `${item}s`} · e export · Esc back `
          : exportable
            ? " Enter rerun · e export · Esc back "
            : " Enter rerun · Esc back ";
  grid.fill(rect.x, rect.y, rect.width, 1, THEME.panelTitle);
  grid.write(rect.x + 1, rect.y, `RESULTS · F6 · ${records.length} run(s)`, THEME.panelTitle, rect.width - 2);
  grid.write(rect.x + rect.width - hint.length - 1, rect.y, hint, THEME.panelTitle);
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
  for (let i = 0; i < rect.height - listHeight - 2; i++) {
    const row = rows[results.top + i];
    if (!row) break;
    const y = dividerY + 1 + i;
    grid.fill(rect.x, y, rect.width, 1, row.style);
    grid.write(rect.x + 1, y, results.scrollReport ? "▌" : " ", { ...row.style, fg: 75 });
    grid.write(rect.x + 3, y, row.text, row.style, rect.width - 4);
  }
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

const HELP: Record<string, string[]> = {
  view: [
    "↑↓ PgUp PgDn g G   move          Enter / Ctrl+click   go to code",
    "K / mouse hover    hover          Alt+Enter            go to spec",
    "Tab                next panel     Ctrl+O               back",
    "F2 / F3            files / nav    v                    reading mode",
    "F5                 check again    i                    edit",
    "m                  merge or list  u                    undo last merge",
    "/  n               search         : / Ctrl+P           actions",
    "F6                 results        q / Ctrl+C           quit",
    "?                  keys, explain",
    "F4                 agent context  e                    explain id",
    "s                  find a node    t                    explained map",
    "Ctrl+Space         agent draft of this flow as MERGE",
    "  in context: @ add id · x drop · Esc close",
  ],
  edit: [
    "type               edit           Ctrl+S               save",
    "Ctrl+Space         complete IDs   Tab / Enter          accept completion",
    "Shift+↑↓           select lines   Ctrl+G               text → spec (merge)",
    "Ctrl+Z             undo           Esc                  back to view",
    "Ctrl+P             action palette F6                   results",
  ],
  merge: [
    "n / N  ↑↓          next / previous hunk   a   accept hunk   r   reject hunk",
    "u                  undo last decision     w   write result  Esc cancel (nothing written)",
    "Ctrl+P             action catalogue (read-only actions work; the rest explain why)",
  ],
  code: ["↑↓ PgUp PgDn       scroll         Esc / Ctrl+O / q     back", "Ctrl+P             action palette F6                   results"],
  read: ["↑↓                 move           Enter                go to code      v / Esc   raw Markdown"],
};

function drawHelp(grid: Grid, state: State, editor: Rect, buffer: Buffer | null): void {
  const lines = [...(HELP[state.mode] ?? HELP.view!)];
  if (buffer && state.analysis) {
    const item = evidenceOf(state.analysis, buffer.path).get(state.cursor.line + 1);
    const code = item?.diagnostics[0]?.code;
    const explained = code ? explainCode(code) : null;
    if (explained) lines.push("", ...explained.split("\n"));
  }
  // The keyed, currently available actions come from the same registry the palette searches.
  const keyed = catalog(state)
    .filter((entry) => entry.action.key !== undefined && entry.reason === null)
    .map((entry) => `${entry.action.key} ${entry.action.label}`);
  if (keyed.length > 0) lines.push("", ...wrapWords(`actions: ${keyed.join(" · ")}`, Math.min(64, editor.width - 8)));
  const width = Math.min(editor.width, Math.max(...lines.map((line) => stringWidth(line))) + 4);
  const height = Math.min(editor.height, lines.length + 2);
  drawBox(grid, { x: editor.x + Math.max(0, Math.floor((editor.width - width) / 2)), y: editor.y + 1, width, height }, `keys · ${state.mode}`, THEME.popup, THEME.popupTitle);
  lines.slice(0, height - 2).forEach((line, i) => grid.write(editor.x + Math.max(0, Math.floor((editor.width - width) / 2)) + 2, editor.y + 2 + i, line, THEME.popup, width - 4));
}

function drawPrompt(grid: Grid, state: State, rect: Rect, editor: Rect): void {
  const prompt = state.prompt!;
  grid.fill(rect.x, rect.y, rect.width, 1, THEME.status);
  const label = prompt.kind === "new-spec" ? newSpecLabel(prompt.form?.field) : prompt.kind === "search" ? "/" : prompt.kind === "context" ? "@" : prompt.kind === "node" ? "node: " : prompt.kind === "feature" ? "feature slug: " : prompt.kind === "proposal" ? "proposal: " : prompt.kind === "baseline" ? "baseline: " : prompt.kind === "agents" ? "agents (auto, none, claude,codex…): " : prompt.kind === "init" ? "init harnesses (auto, none, claude,codex…): " : prompt.kind === "fmt" ? "fmt paths: " : prompt.kind === "parse" ? "parse paths: " : prompt.kind === "trace-plan" ? "trace-plan flow: " : prompt.kind === "wire" ? "wire out: " : prompt.kind === "full-check" ? "check paths: " : prompt.kind === "explain-edge" ? "explain edge: " : prompt.kind === "export" ? "export to: " : prompt.kind === "draft-flow" ? "draft flow: " : prompt.kind === "draft-rules" ? "draft rules: " : ":";
  // The edge form types into its selected row; the status line shows both ids.
  const typed = prompt.kind === "explain-edge" && prompt.edge ? `${prompt.edge.from || "?"} ↔ ${prompt.edge.to || "?"}` : prompt.kind === "draft-flow" && prompt.draft ? prompt.draft.trigger || "?" : prompt.kind === "draft-rules" && prompt.rulesDraft ? prompt.rulesDraft.into || "(default target)" : prompt.text;
  grid.write(rect.x, rect.y, `${label}${typed}`, THEME.statusKey);
  grid.cursor = { x: Math.min(rect.width - 1, stringWidth(label) + stringWidth(typed)), y: rect.y };
  if ((prompt.kind === "palette" || prompt.kind === "feature" || prompt.kind === "proposal" || prompt.kind === "new-spec" || prompt.kind === "baseline" || prompt.kind === "agents" || prompt.kind === "init" || prompt.kind === "fmt" || prompt.kind === "parse" || prompt.kind === "trace-plan" || prompt.kind === "wire" || prompt.kind === "full-check" || prompt.kind === "explain-edge" || prompt.kind === "export" || prompt.kind === "draft-flow" || prompt.kind === "draft-rules") && prompt.note) {
    // The selected action's group, or why it is unavailable; never a reason to hide it.
    grid.write(rect.x + 2 + stringWidth(label) + stringWidth(typed), rect.y, `  ${prompt.note}`, { ...THEME.status, fg: 243 });
  }
  if (prompt.kind === "search" || prompt.kind === "context") return;
  // The list scrolls to keep the selected entry in view.
  const shown = Math.min(10, editor.height - 2);
  const first = Math.max(0, prompt.index - shown + 1);
  const items = prompt.items.slice(first, first + shown);
  if (items.length === 0) return;
  // Rows that describe the form (init: the root, the layout, the files) stand above its choices and are never selected.
  const details = (prompt.details ?? []).slice(0, Math.max(0, editor.height - items.length - 3));
  const width = Math.min(editor.width, Math.max(...[...items, ...details].map((item) => stringWidth(item))) + 6);
  const y = editor.y + editor.height - items.length - details.length - 2;
  drawBox(grid, { x: editor.x, y, width, height: items.length + details.length + 2 }, prompt.kind === "node" ? `${prompt.items.length} node(s)` : prompt.kind === "feature" ? `${prompt.items.length} feature file(s)` : prompt.kind === "proposal" ? `${prompt.items.length} proposal(s)` : prompt.kind === "new-spec" ? "kind of the new spec" : prompt.kind === "baseline" ? "baseline rules" : prompt.kind === "agents" ? "harness integrations" : prompt.kind === "init" ? "set up keylang" : prompt.kind === "fmt" ? "format specifications" : prompt.kind === "parse" ? "parse specifications: Text IR" : prompt.kind === "trace-plan" ? `${prompt.items.length} flow(s): trace plan` : prompt.kind === "wire" ? "wiring container" : prompt.kind === "full-check" ? "check options" : prompt.kind === "explain-edge" ? "edge between two ids" : prompt.kind === "export" ? "export the report" : prompt.kind === "draft-flow" ? `draft flow · ${prompt.draft?.mode ?? "algo"}` : prompt.kind === "draft-rules" ? `draft rules · ${prompt.rulesDraft?.mode ?? "algo"}` : `${prompt.items.length} action(s)`, THEME.popup, THEME.popupTitle);
  details.forEach((row, i) => grid.write(editor.x + 1, y + 1 + i, padWidth(` ${row}`, width - 2), { ...THEME.popup, fg: 243 }, width - 2));
  items.forEach((item, i) => grid.write(editor.x + 1, y + 1 + details.length + i, padWidth(` ${item}`, width - 2), first + i === prompt.index ? THEME.selected : THEME.popup, width - 2));
}

/** The label of the field the new-spec form is on. */
function newSpecLabel(field: "kind" | "path" | "name" | undefined): string {
  return field === "path" ? "new spec path: " : field === "name" ? "flow name: " : "new spec kind: ";
}

const HINTS: Record<string, string> = {
  view: "Enter code · Alt+Enter spec · / search · s node · F5 check · F6 results · i edit · ? keys",
  edit: "Ctrl+S save · Ctrl+Space complete · Ctrl+G text→spec · Esc view · ? keys",
  read: "Enter code · v raw · F5 check · ? keys",
  code: "Esc back · ↑↓ scroll · ? keys",
  merge: "a accept · r reject · u undo · n next · w write · Esc cancel",
};

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
    rows.push({ text: "Writes (generated files only; a manual file stops it):", style: THEME.popup });
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
  grid.write(state.cols - modeLabel.length, 0, modeLabel, { ...THEME.statusKey, bg: state.mode === "edit" ? 28 : state.mode === "merge" ? 94 : 25 });
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
  else if (state.mode === "merge" && state.merge) drawMerge(grid, state, area.editor);
  else if (buffer && state.mode === "read") drawRead(grid, state, area.editor, buffer);
  else if (buffer) drawEditor(grid, state, area.editor, buffer);
  else grid.write(area.editor.x + 2, area.editor.y + 1, state.error ?? "No spec files. Run `keylang init`, then add rules or flows under keylang/.", THEME.hint);
  // Detail line: a transient message, else the finding on the cursor line.
  grid.fill(0, area.detail.y, state.cols, 1, {});
  const item = buffer && state.analysis && state.mode !== "merge" && state.mode !== "code" ? evidenceOf(state.analysis, buffer.path).get(state.cursor.line + 1) : undefined;
  const detail = state.message ? { text: state.message, style: THEME.hint } : lineMessage(item);
  if (detail) grid.write(1, area.detail.y, detail.text, detail.style, state.cols - 2);
  // Status bar
  grid.fill(0, area.status.y, state.cols, 1, THEME.status);
  let x = 1;
  if (state.analysis) {
    const count = totals(state.analysis);
    const stale = state.updating || state.outdated;
    x += grid.write(x, area.status.y, `✗ ${count.fail}`, { ...THEME.status, ...MARK_STYLE.fail, bg: THEME.status.bg!, ...(stale ? { dim: true } : {}) });
    x += grid.write(x, area.status.y, `  ◌ ${count.unverified}`, { ...THEME.status, ...MARK_STYLE.unverified, bg: THEME.status.bg!, ...(stale ? { dim: true } : {}) });
    x += grid.write(x, area.status.y, `  ✓ ${count.ok}`, { ...THEME.status, ...MARK_STYLE.ok, bg: THEME.status.bg!, ...(stale ? { dim: true } : {}) });
  }
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
  if (note !== null) x += grid.write(x, area.status.y, `  ${note}`, { ...THEME.status, fg: 179 });
  x += grid.write(x, area.status.y, phase, { ...THEME.status, fg: (state.error || invalid !== null) && !state.updating ? 160 : 179 });
  // A snapshot is its own property: a valid config may find no sources.
  if (state.analysis && !state.analysis.snapshot) x += grid.write(x, area.status.y, "  no supported source files", { ...THEME.status, fg: 179 });
  if (state.proposals.length > 0 && state.mode !== "merge") x += grid.write(x, area.status.y, `  ≈ ${state.proposals.length} proposal(s): m`, { ...THEME.status, fg: 141 });
  const hints = HINTS[state.mode] ?? HINTS.view!;
  const hintWidth = stringWidth(hints);
  if (x + hintWidth + 3 < state.cols) grid.write(state.cols - hintWidth - 1, area.status.y, hints, THEME.status);
  // Popups
  if (state.results.open && !state.results.viewing) drawResults(grid, state, area.editor);
  if (state.hover && (state.mode === "view" || state.mode === "edit" || state.mode === "read")) drawHover(grid, state, area.editor);
  if (state.completion && buffer && state.mode === "edit") drawCompletion(grid, state, area.editor, buffer);
  if (state.help) drawHelp(grid, state, area.editor, buffer);
  if (state.prompt) drawPrompt(grid, state, area.detail, area.editor);
  if (state.barrier) drawBarrier(grid, state, area.editor);
  return grid;
}
