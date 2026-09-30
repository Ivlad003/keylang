// Drawing a TUI state into a `Grid`: pure, so a test reads the frame as text.
// Layout: title, [files] | editor with gutter | [navigation], a detail line
// and the status bar. Popups (hover, completion, palette, help) draw on top.

import { contextPack } from "../agent-context.ts";
import { explainCode } from "../explain.ts";
import { explanationOf } from "../explanations.ts";
import { ACTIONS, catalog } from "./actions.ts";
import { highlightCode } from "./code-highlight.ts";
import { CHANNELS, evidenceOf, MARK_GLYPH, totals, type LineEvidence } from "./evidence.ts";
import { FINDING_GLYPH, VERDICTS, findingCounts, findingDetailText, findingRow, findingsOf, visibleFindings } from "./findings.ts";
import { renderMarkdown, type ReadRow } from "./markdown.ts";
import { mergeRows } from "./merge.ts";
import { navItems, type NavItem } from "./nav.ts";
import { Grid, type Style } from "./screen.ts";
import type { Buffer, OperationRecord, State } from "./state.ts";
import { highlight, MARK_STYLE, THEME, type Run } from "./theme.ts";
import { bufferLines, lineLayout } from "./buffer.ts";
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
    const dirty = buffer && buffer.text !== buffer.saved ? " +" : "";
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

/** The registry label of a record's action (only `doctor` so far), or its id. */
function recordLabel(record: OperationRecord): string {
  return ACTIONS.find((action) => action.id === record.action)?.label ?? record.action;
}

/** The status of a record for the F6 list and messages: `running…` or `completed · code 0`. */
export function recordStatus(record: OperationRecord): string {
  if (record.status === "running") return "running…";
  const code = record.result?.exitCode;
  return `${record.status}${code === null || code === undefined ? "" : ` · code ${code}`}`;
}

function timeStr(ms: number): string {
  return new Date(ms).toTimeString().slice(0, 8);
}

/**
 * The report rows of the record selected in the F6 panel: its parameters,
 * timings and the operation's messages. Presentation only — the payload in
 * `record.result` carries the domain data.
 */
export function resultsReportRows(state: State): { text: string; style: Style }[] {
  const record = state.records[state.results.index];
  if (!record) return [];
  const rows: { text: string; style: Style }[] = [
    { text: `root ${record.params.root} · started ${timeStr(record.started)}`, style: { ...THEME.panel, fg: 243 } },
  ];
  if (record.finished !== null) {
    rows.push({ text: `finished ${timeStr(record.finished)} · ${recordStatus(record)}`, style: { ...THEME.panel, fg: 243 } });
  }
  if (record.result) {
    for (const message of record.result.messages) rows.push({ text: `  ${message.text}`, style: message.level === "error" ? { ...THEME.panel, ...THEME.error } : THEME.panel });
  } else {
    rows.push({ text: "  running…", style: THEME.hint });
  }
  return rows;
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
  const unsaved = [...state.buffers.values()].filter((buffer) => !buffer.readOnly && buffer.text !== buffer.saved).map((buffer) => buffer.path);
  const parts: string[] = [];
  if (state.error !== null) parts.push(`outdated: ${state.error}`);
  else if (state.outdated && !state.updating) parts.push("outdated: changes since this analysis");
  if (state.updating) parts.push("updating…");
  if (unsaved.length > 0) parts.push(`unsaved inputs: ${unsaved.join(", ")}`);
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
      state.analysis === null ? (state.error !== null ? "the analysis failed; no report yet" : "analyzing…") : "no findings match the filter";
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
  const hint = analysis ? " Enter open · Tab findings · Esc back " : " Enter rerun · Esc back ";
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
    "m                  merge proposal u                    undo last merge",
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
  const label = prompt.kind === "search" ? "/" : prompt.kind === "context" ? "@" : prompt.kind === "node" ? "node: " : ":";
  grid.write(rect.x, rect.y, `${label}${prompt.text}`, THEME.statusKey);
  grid.cursor = { x: Math.min(rect.width - 1, stringWidth(label) + stringWidth(prompt.text)), y: rect.y };
  if (prompt.kind === "palette" && prompt.note) {
    // The selected action's group, or why it is unavailable; never a reason to hide it.
    grid.write(rect.x + 2 + stringWidth(label) + stringWidth(prompt.text), rect.y, `  ${prompt.note}`, { ...THEME.status, fg: 243 });
  }
  if (prompt.kind !== "palette" && prompt.kind !== "node") return;
  // The list scrolls to keep the selected entry in view.
  const shown = Math.min(10, editor.height - 2);
  const first = Math.max(0, prompt.index - shown + 1);
  const items = prompt.items.slice(first, first + shown);
  if (items.length === 0) return;
  const width = Math.min(editor.width, Math.max(...items.map((item) => stringWidth(item))) + 6);
  const y = editor.y + editor.height - items.length - 2;
  drawBox(grid, { x: editor.x, y, width, height: items.length + 2 }, prompt.kind === "node" ? `${prompt.items.length} node(s)` : `${prompt.items.length} action(s)`, THEME.popup, THEME.popupTitle);
  items.forEach((item, i) => grid.write(editor.x + 1, y + 1 + i, padWidth(` ${item}`, width - 2), first + i === prompt.index ? THEME.selected : THEME.popup, width - 2));
}

const HINTS: Record<string, string> = {
  view: "Enter code · Alt+Enter spec · / search · s node · F5 check · F6 results · i edit · ? keys",
  edit: "Ctrl+S save · Ctrl+Space complete · Ctrl+G text→spec · Esc view · ? keys",
  read: "Enter code · v raw · F5 check · ? keys",
  code: "Esc back · ↑↓ scroll · ? keys",
  merge: "a accept · r reject · u undo · n next · w write · Esc cancel",
};

export function render(state: State): Grid {
  const grid = new Grid(state.cols, state.rows);
  const area = layout(state);
  const buffer = state.current ? (state.buffers.get(state.current) ?? null) : null;
  // Title
  grid.fill(0, 0, state.cols, 1, THEME.status);
  const dirty = buffer && buffer.text !== buffer.saved ? " [+]" : "";
  const readOnly = buffer?.readOnly ? " [generated, read-only]" : "";
  grid.write(1, 0, `keylang · ${state.current ?? "no spec files"}${dirty}${readOnly}`, THEME.statusKey, state.cols - 14);
  const modeLabel = ` ${state.mode.toUpperCase()} `;
  grid.write(state.cols - modeLabel.length, 0, modeLabel, { ...THEME.statusKey, bg: state.mode === "edit" ? 28 : state.mode === "merge" ? 94 : 25 });
  // Body
  if (area.files) {
    drawFiles(grid, state, area.files);
    grid.fill(area.files.x + area.files.width, area.files.y, 1, area.files.height, { fg: 238 });
    for (let y = area.files.y; y < area.files.y + area.files.height; y++) grid.write(area.files.x + area.files.width, y, "│", { fg: 238 });
  }
  if (area.nav) {
    for (let y = area.nav.y; y < area.nav.y + area.nav.height; y++) grid.write(area.nav.x - 1, y, "│", { fg: 238 });
    if (state.context.open) drawContext(grid, state, area.nav);
    else drawNav(grid, state, area.nav);
  }
  if (state.mode === "code" && state.code) drawCode(grid, state, area.editor);
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
  const phase = state.updating ? "  updating… results shown are stale" : state.error ? `  outdated: ${state.error}` : state.outdated ? "  outdated: changes since this analysis" : state.analysis ? "" : "  analyzing…";
  x += grid.write(x, area.status.y, phase, { ...THEME.status, fg: state.error && !state.updating ? 160 : 179 });
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
  return grid;
}
