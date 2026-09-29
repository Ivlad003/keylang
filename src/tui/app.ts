// One TUI session: state, input handling, and the analysis behind it. A
// transport (terminal or WebSocket) attaches a `Surface`, feeds raw input and
// sizes, and gets ANSI frames back; the session does not know which one it is,
// except that only a terminal can hand the screen to `$EDITOR`. While the
// screen is handed away the transport detaches the surface: nothing is drawn
// until it attaches again, which repaints the whole frame.
//
// Analysis is the shared `analyze()` with the unsaved buffers as an overlay.
// It runs in the background: the UI keeps answering, shows "updating" and
// dims the old marks, and a result of a superseded generation is dropped.
// MERGE lives in `merge-session.ts`; ghost text, voice and the agent's draft
// in `assist.ts`; this class dispatches input to them and keeps the editor.

import { existsSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { analyze, within, type Analysis, type AnalysisRequest } from "../analyze.ts";
import { CONFIG_FILE, loadConfig, toPosix } from "../config.ts";
import { collectMdFiles } from "../files.ts";
import { sectionNodes, walk, type Document, type Node } from "../ir.ts";
import { completions, definition, hover, references, targetAt, workspace, type LspPosition, type Workspace } from "../lsp-features.ts";
import { contextPack, type ContextPack } from "../agent-context.ts";
import { formatSummary, summarizeNode } from "../explain-node.ts";
import { isStale, readExplanation } from "../explain-llm.ts";
import { loadBriefs } from "../explanations.ts";
import { EXPLAINED_MAP_DIR } from "../map.ts";
import { searchNodes } from "../node-search.ts";
import { defaultMicrophone } from "../voice-local.ts";
import { compareText } from "../span.ts";
import { Assist, countSuggestion, type Microphone } from "./assist.ts";
import { bufferLines, lineLayout, newBuffer, setText } from "./buffer.ts";
import { readText, splitEol, withEol, writeInside } from "./disk.ts";
import { InputDecoder, type InputEvent, type KeyEvent, type MouseEvent } from "./input.ts";
import { errorText, MergeSession } from "./merge-session.ts";
import { renderDiff, type Grid } from "./screen.ts";
import type { Buffer, Cursor, Hover, State } from "./state.ts";
import { textToSpec } from "./text-to-spec.ts";
import { contextTop, editorRows, filesTop, gutterWidth, layout, navEntries, navListHeight, readCursorRow, render } from "./view.ts";
import { clusterAt, clusterAtCell, graphemes, scrollToFit } from "./width.ts";

export interface Surface {
  kind: "terminal" | "web";
  write(ansi: string): void;
  /** Terminal only: open a file in `$EDITOR`, handing it the screen. */
  openEditor?: (abs: string, line: number) => Promise<void>;
}

export type Analyzer = (request: AnalysisRequest) => Promise<Analysis>;

export interface AppOptions {
  root: string;
  cols: number;
  rows: number;
  analyzer?: Analyzer;
  onQuit?: () => void;
  /**
   * Microphone PCM (16 kHz, mono, s16le) until `stop` is called or the source
   * ends; null: no microphone. Default: the optional `decibri`. `keylang web`
   * passes the browser's microphone; tests pass recorded PCM.
   */
  microphone?: Microphone;
}

/** Changes typed together are analysed once. */
const SETTLE_MS = 120;
const ESC_MS = 25;
/** A bracketed paste whose end marker has not come within this pause is ended by hand. */
const PASTE_MS = 1000;
/** The largest frame a session draws; a bigger size from a client is cut to it. */
export const MAX_COLS = 1000;
export const MAX_ROWS = 400;
/** At most this many of one key in one chunk are a key held down (auto-repeat); more are pasted text. */
const HELD_KEYS = 32;
/** Keys handled before the mode: they show panels and reanalyse, and never edit. */
const PANEL_KEYS = new Set(["f2", "f3", "f4", "f5"]);

/** Most nodes the `s` prompt lists. */
const NODE_HITS = 50;

export class App {
  readonly state: State;
  private surface: Surface | null = null;
  private previous: Grid | null = null;
  private readonly decoder = new InputDecoder();
  private readonly analyzer: Analyzer;
  private readonly onQuit: () => void;
  private readonly merges: MergeSession;
  private readonly assist: Assist;
  private escTimer: NodeJS.Timeout | null = null;
  private settleTimer: NodeJS.Timeout | null = null;
  private generation = 0;
  /** Bumped on every buffer change; an analysis started before the last one is outdated on arrival. */
  private edits = 0;
  private running = 0;
  private waiters: (() => void)[] = [];
  private closed = false;

  constructor(options: AppOptions) {
    this.analyzer = options.analyzer ?? analyze;
    this.onQuit = options.onQuit ?? (() => {});
    this.state = {
      root: options.root,
      cols: options.cols,
      rows: options.rows,
      files: [],
      current: null,
      buffers: new Map(),
      cursor: { line: 0, col: 0 },
      top: 0,
      left: 0,
      mode: "view",
      focus: "editor",
      showFiles: false,
      showNav: true,
      navIndex: 0,
      navTop: 0,
      navExpanded: new Set(),
      filesIndex: 0,
      analysis: null,
      updating: false,
      outdated: false,
      error: null,
      hover: null,
      code: null,
      merge: null,
      lastMerge: null,
      completion: null,
      selection: null,
      prompt: null,
      help: false,
      back: [],
      message: null,
      proposals: [],
      context: { open: false, index: 0, added: [], removed: new Set() },
      ghost: null,
      search: null,
      quitArmed: false,
      briefs: new Map(),
    };
    // The helpers reach the session through closures: its private methods stay private.
    this.merges = new MergeSession({
      state: this.state,
      load: (path) => this.load(path),
      open: (path, cursor) => this.open(path, cursor),
      clampCursor: () => this.clampCursor(),
      reanalyze: () => this.reanalyze(),
      reanalyzeSoon: () => this.reanalyzeSoon(),
    });
    const app = this;
    this.assist = new Assist(
      {
        state: this.state,
        get closed() {
          return app.closed;
        },
        buffer: () => this.buffer(),
        contextPack: () => this.contextPack(),
        edit: (change) => this.edit(change),
        openProposal: (path) => this.merges.open(path),
        track: (work) => this.track(work),
        settled: () => this.wake(),
        draw: () => this.draw(),
      },
      options.microphone ?? defaultMicrophone,
    );
    // The first frame comes from disk, before any analysis: a cold start shows text at once.
    this.state.files = this.diskFiles();
    const first = this.state.files.find((file) => file.includes("/flows/")) ?? this.state.files[0];
    if (first) this.open(first, { line: 0, col: 0 }, false);
    this.state.proposals = this.merges.scan();
    this.reanalyze();
  }

  // ---------- transport ----------

  attach(surface: Surface, cols: number, rows: number): void {
    this.surface = surface;
    this.previous = null;
    this.resize(cols, rows);
  }

  /** No surface: the screen belongs to someone else (a reconnect, `$EDITOR`, a stop); nothing is drawn. */
  detach(): void {
    this.surface = null;
  }

  resize(cols: number, rows: number): void {
    this.state.cols = Math.max(20, Math.min(MAX_COLS, cols));
    this.state.rows = Math.max(8, Math.min(MAX_ROWS, rows));
    this.state.hover = null;
    this.keepVisible();
    this.draw();
  }

  input(chunk: string): void {
    if (this.escTimer) clearTimeout(this.escTimer);
    this.escTimer = null;
    const events = this.decoder.feed(chunk);
    for (let i = 0; i < events.length; ) {
      const run = typedRun(events, i);
      // Many typed keys in one chunk are a paste from a terminal without bracketed paste: one edit, not one
      // per key — and outside the editor not a string of commands (a pasted path in MERGE would accept and
      // write hunks). A few of one key is the key held down.
      const held = run.length <= HELD_KEYS && run.every((key) => key.name === run[0]!.name);
      if (run.length > 1 && !this.state.prompt && !this.state.completion && (this.state.mode === "edit" || !held)) {
        this.safely({ type: "paste", text: run.map((key) => (key.name === "enter" ? "\n" : key.name === "tab" ? "  " : key.text!)).join("") });
        i += run.length;
        continue;
      }
      // The run is handled key by key; it is not measured again from each of its keys.
      const keys = Math.max(1, run.length);
      for (let k = 0; k < keys; k++) this.safely(events[i + k]!);
      i += keys;
    }
    if (this.decoder.waiting || this.decoder.pasting) {
      this.escTimer = setTimeout(
        () => {
          this.escTimer = null;
          for (const event of this.decoder.flush()) this.safely(event);
          this.draw();
        },
        this.decoder.pasting ? PASTE_MS : ESC_MS,
      );
    }
    this.draw();
  }

  /** One event; a failure (a file that cannot be written) is a message, never the end of the session and its unsaved buffers. */
  private safely(event: InputEvent): void {
    try {
      this.handle(event);
    } catch (error) {
      this.state.message = `error: ${errorText(error)}`;
    }
  }

  /** The current frame, as the transport would show it. */
  frame(): Grid {
    return render(this.state);
  }

  /** Files with unsaved changes. */
  unsaved(): string[] {
    return [...this.state.buffers.values()].filter((buffer) => buffer.text !== buffer.saved).map((buffer) => buffer.path);
  }

  /** Resolves when no analysis is running or waiting to start. */
  idle(): Promise<void> {
    if (this.quiet()) return Promise.resolve();
    return new Promise((done) => this.waiters.push(done));
  }

  close(): void {
    this.closed = true;
    if (this.escTimer) clearTimeout(this.escTimer);
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = null;
    this.assist.close();
    this.surface = null;
    this.wake();
  }

  private draw(): void {
    if (!this.surface) return;
    const grid = render(this.state);
    this.surface.write(renderDiff(this.previous, grid));
    this.previous = grid;
  }

  /** Full repaint. */
  redraw(): void {
    this.previous = null;
    this.draw();
  }

  // ---------- analysis ----------

  private overlay(): Map<string, string> {
    const overlay = new Map<string, string>();
    for (const buffer of this.state.buffers.values()) if (!buffer.readOnly && buffer.text !== buffer.saved) overlay.set(resolve(this.state.root, buffer.path), buffer.text);
    return overlay;
  }

  /** `F5` or a save: analyse now. */
  reanalyze(): void {
    if (this.closed) return;
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = null;
    const generation = ++this.generation;
    const edits = this.edits;
    this.state.updating = true;
    this.running++;
    this.analyzer({ root: this.state.root, overlay: this.overlay() })
      .then(
        (analysis) => {
          if (generation !== this.generation || this.closed) return;
          this.state.analysis = analysis;
          try {
            this.adoptResult(analysis, edits);
          } catch (error) {
            this.state.message = `error: ${errorText(error)}`;
          }
        },
        (error: unknown) => {
          if (generation !== this.generation || this.closed) return;
          this.state.updating = false;
          this.state.error = `analysis failed: ${errorText(error)}`;
          this.state.message = this.state.error;
        },
      )
      .finally(() => {
        this.running--;
        this.draw();
        this.wake();
      });
    this.draw();
  }

  private adoptResult(analysis: Analysis, edits: number): void {
    this.state.updating = false;
    // Typing while it ran: the marks belong to older text and stay dimmed until the next run.
    this.state.outdated = edits !== this.edits;
    this.state.error = null;
    this.adopt(analysis);
  }

  /** Typing: mark results outdated now, analyse once the typing settles. */
  private reanalyzeSoon(): void {
    this.edits++;
    this.state.outdated = true;
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      this.reanalyze();
    }, SETTLE_MS);
  }

  /** Async work of a helper (a model, a microphone): `idle()` waits for it, and the frame follows it. */
  private track(work: Promise<void>): void {
    this.running++;
    void work.finally(() => {
      this.running--;
      this.draw();
      this.wake();
    });
  }

  private quiet(): boolean {
    return this.running === 0 && this.settleTimer === null && !this.assist.waiting;
  }

  private wake(): void {
    if (!this.quiet()) return;
    const waiters = this.waiters;
    this.waiters = [];
    for (const done of waiters) done();
  }

  /** Files and clean buffers follow the new analysis (a regenerated map, a change on disk). */
  private adopt(analysis: Analysis): void {
    const explained = [...(analysis.map?.explained?.keys() ?? [])].map((name) => `${analysis.config.dir}/${EXPLAINED_MAP_DIR}/${name}`);
    const paths = new Set([...this.diskFiles(), ...analysis.docs.map((doc) => doc.path), ...explained]);
    this.state.files = sortFiles([...paths], analysis);
    this.state.briefs = loadBriefs(analysis.config);
    const ws = workspace(this.state.root, analysis, new Map());
    for (const buffer of this.state.buffers.values()) {
      if (buffer.text !== buffer.saved) continue;
      const fresh = ws.text(buffer.path);
      const text = fresh === null ? buffer.text : splitEol(fresh).text;
      // The explained map is no spec, so the analysis has no document of it: its marker decides.
      const doc = analysis.docs.find((d) => d.path === buffer.path);
      buffer.readOnly = doc ? doc.generated !== null : buffer.doc?.generated != null;
      if (text !== buffer.text) {
        setText(buffer, text);
        buffer.saved = text;
        buffer.disk = readText(resolve(this.state.root, buffer.path));
      }
    }
    if (this.state.current === null && this.state.files[0]) this.open(this.state.files[0], { line: 0, col: 0 }, false);
    this.state.proposals = this.merges.scan();
    this.clampCursor();
  }

  private diskFiles(): string[] {
    let dir: string;
    try {
      dir = join(this.state.root, loadConfig(this.state.root).dir);
    } catch {
      dir = join(this.state.root, "keylang");
    }
    // The settings are `keylang.json` in the same editor, not a separate form (design §7.1).
    const config = existsSync(join(this.state.root, CONFIG_FILE)) ? [CONFIG_FILE] : [];
    if (!existsSync(dir)) return config;
    // Saved explanations are the model's text about nodes, not specs to edit.
    const store = join(dir, "explain");
    const specs = collectMdFiles([dir]).filter((abs) => !within(abs, store));
    return sortFiles([...specs.map((abs) => toPosix(relative(this.state.root, abs))), ...config], null);
  }

  // ---------- buffers ----------

  private buffer(): Buffer | null {
    return this.state.current ? (this.state.buffers.get(this.state.current) ?? null) : null;
  }

  private load(path: string): Buffer {
    const existing = this.state.buffers.get(path);
    if (existing) return existing;
    const analysis = this.state.analysis;
    const disk = readText(resolve(this.state.root, path));
    const loaded = (analysis ? workspace(this.state.root, analysis, new Map()).text(path) : null) ?? disk ?? "";
    const { text, eol } = splitEol(loaded);
    const buffer = newBuffer(path, text, eol, disk);
    this.state.buffers.set(path, buffer);
    return buffer;
  }

  private open(path: string, cursor: Cursor, remember = true): void {
    if (remember && this.state.current) this.state.back.push({ path: this.state.current, cursor: { ...this.state.cursor }, mode: this.state.mode === "code" ? "view" : this.state.mode });
    this.load(path);
    this.state.current = path;
    this.state.cursor = { ...cursor };
    this.state.filesIndex = Math.max(0, this.state.files.indexOf(path));
    if (this.state.mode === "code" || this.state.mode === "merge") this.state.mode = "view";
    this.state.selection = null;
    this.state.completion = null;
    this.state.hover = null;
    this.clampCursor();
    this.state.top = Math.max(0, this.state.cursor.line - 3);
    this.keepVisible();
  }

  private lines(): readonly string[] {
    const buffer = this.buffer();
    return buffer ? bufferLines(buffer) : [];
  }

  private clampCursor(): void {
    const buffer = this.buffer();
    const cursor = this.state.cursor;
    if (!buffer) {
      cursor.line = 0;
      cursor.col = 0;
      return;
    }
    cursor.line = Math.max(0, Math.min(cursor.line, bufferLines(buffer).length - 1));
    cursor.col = Math.max(0, Math.min(cursor.col, lineLayout(buffer, cursor.line).clusters.length));
  }

  /** Scrolls so the cursor is on screen; the layout of its line answers in logarithmic time, however long the line. */
  private keepVisible(): void {
    const buffer = this.buffer();
    if (!buffer) return;
    const editor = layout(this.state).editor;
    // One row stays free for the evidence row under the cursor line.
    const height = Math.max(1, editor.height - 1);
    if (this.state.cursor.line < this.state.top) this.state.top = this.state.cursor.line;
    if (this.state.cursor.line >= this.state.top + height) this.state.top = this.state.cursor.line - height + 1;
    // `left` and the cursor count clusters; what must fit is their width in cells.
    const textWidth = editor.width - gutterWidth(buffer) - 1;
    const line = lineLayout(buffer, this.state.cursor.line);
    const col = Math.min(this.state.cursor.col, line.clusters.length);
    if (col < this.state.left) this.state.left = col;
    this.state.left = scrollToFit(line, this.state.left, col, textWidth);
  }

  private edit(change: (lines: string[], cursor: Cursor) => void, coalesce = false): void {
    const buffer = this.buffer();
    if (!buffer) return;
    if (buffer.readOnly) {
      this.state.message = `${buffer.path} is generated by \`keylang map\`; change the code or the rules instead`;
      return;
    }
    // `u` undoes a merge only while nothing was typed after it.
    if (this.state.lastMerge?.path === buffer.path) this.state.lastMerge = null;
    const last = buffer.undo.at(-1);
    if (!coalesce || !last || last.text === buffer.text) buffer.undo.push({ text: buffer.text, cursor: { ...this.state.cursor } });
    if (buffer.undo.length > 200) buffer.undo.shift();
    const lines = buffer.text.split("\n");
    change(lines, this.state.cursor);
    setText(buffer, lines.join("\n"));
    this.clampCursor();
    this.keepVisible();
    this.state.hover = null;
    this.reanalyzeSoon();
  }

  private save(): void {
    const buffer = this.buffer();
    if (!buffer || buffer.readOnly) return;
    const abs = resolve(this.state.root, buffer.path);
    // Another editor or `git checkout` changed the file: the first Ctrl+S asks, the second overwrites.
    if (readText(abs) !== buffer.disk && !buffer.overwrite) {
      buffer.overwrite = true;
      this.state.message = `${buffer.path} changed on disk since it was opened: Ctrl+S again overwrites it, Ctrl+Z undoes your edits`;
      return;
    }
    const written = withEol(buffer.text, buffer.eol);
    // A save stays in the repository, even through a link whose target does not exist yet.
    writeInside(this.state.root, abs, written);
    buffer.saved = buffer.text;
    buffer.disk = written;
    buffer.overwrite = false;
    this.state.message = `${buffer.path}: saved`;
    this.reanalyze();
  }

  // ---------- positions and targets ----------

  /** The workspace of the latest analysis, with this session's buffers as the documents. */
  private live(): Workspace | null {
    const analysis = this.state.analysis;
    if (!analysis) return null;
    const docs = analysis.docs.map((doc) => this.state.buffers.get(doc.path)?.doc ?? doc);
    for (const buffer of this.state.buffers.values()) if (buffer.doc && !docs.some((doc) => doc.path === buffer.path)) docs.push(buffer.doc);
    const texts = new Map([...this.state.buffers.values()].map((buffer) => [resolve(this.state.root, buffer.path), buffer.text] as const));
    return workspace(this.state.root, { ...analysis, docs }, texts);
  }

  private lspPosition(cursor: Cursor): LspPosition {
    const buffer = this.buffer();
    if (!buffer) return { line: cursor.line, character: 0 };
    const line = lineLayout(buffer, cursor.line);
    return { line: cursor.line, character: line.units[Math.min(cursor.col, line.clusters.length)]! };
  }

  /** The editor line and column under a screen cell, or null. */
  private cellAt(x: number, y: number): Cursor | null {
    const buffer = this.buffer();
    if (!buffer || (this.state.mode !== "view" && this.state.mode !== "edit")) return null;
    const editor = layout(this.state).editor;
    if (x < editor.x || x >= editor.x + editor.width || y < editor.y || y >= editor.y + editor.height) return null;
    const row = editorRows(this.state, buffer, editor.height)[y - editor.y];
    if (!row || row.kind !== "line") return null;
    const textX = x - editor.x - gutterWidth(buffer);
    if (textX < 0) return { line: row.line, col: 0 };
    return { line: row.line, col: clusterAtCell(lineLayout(buffer, row.line), this.state.left, textX) };
  }

  /** The UTF-16 offset of a cursor in the buffer. */
  private offsetOf(at: Cursor): number {
    const buffer = this.buffer();
    if (!buffer) return 0;
    const lines = bufferLines(buffer);
    let offset = 0;
    for (let i = 0; i < at.line; i++) offset += lines[i]!.length + 1;
    const line = lineLayout(buffer, at.line);
    return offset + line.units[Math.min(at.col, line.clusters.length)]!;
  }

  /** The id or link at the cursor; on an item line without one under the cursor, its first. */
  private targetNear(cursor: Cursor): Cursor | null {
    const buffer = this.buffer();
    if (!buffer?.doc) return null;
    if (targetAt(buffer.doc, this.offsetOf(cursor))) return cursor;
    let found: Cursor | null = null;
    forNodes(buffer.doc, (node) => {
      if (found || node.span.start.line !== cursor.line + 1) return;
      // Cursor navigation: the first ref of this item when the cursor is not already on an id.
      const span = node.refs[0]?.span ?? (node.id && node.name ? node.name.span : null);
      if (span) found = { line: span.start.line - 1, col: clusterAt(this.lines()[span.start.line - 1] ?? "", span.start.col - 1) };
    });
    return found;
  }

  private hoverAt(cursor: Cursor, x: number, y: number, source: Hover["source"]): Hover | null {
    const ws = this.live();
    const path = this.state.current;
    if (!ws || !path || !this.buffer()?.doc) return null;
    const position = this.lspPosition(cursor);
    const result = hover(ws, path, position);
    if (!result) return null;
    const lines: Hover["lines"] = [];
    const parts = result.contents.value.split("\n\n");
    parts.forEach((part, index) => {
      const text = part.replace(/\*\*/g, "").replace(/`/g, "");
      if (index === 0) lines.push({ text, kind: "title" });
      else if (part.startsWith("- ")) lines.push({ text: `• ${text.slice(2)}`, kind: "evidence" });
      else lines.push({ text, kind: "text" });
    });
    const target = definition(ws, path, position);
    if (target) {
      const file = fileURLToPath(target.uri);
      if (extname(file) !== ".md" && existsSync(file)) {
        const code = readFileSync(file, "utf8").split("\n").slice(target.range.start.line, target.range.start.line + 4);
        lines.push({ text: "", kind: "rule" }, ...code.map((text) => ({ text: text.replace(/\t/g, "  "), kind: "code" as const })));
      }
    }
    const uses = references(ws, path, position).length;
    if (uses > 0) lines.push({ text: `referenced ${uses} time(s) in specs`, kind: "text" });
    return { x, y, lines, source };
  }

  /** Where a popup at the cursor line is anchored: the raw line in the editor, the rendered row in reading mode. */
  private cursorAnchor(col: number): { x: number; y: number } {
    const editor = layout(this.state).editor;
    const buffer = this.buffer();
    if (this.state.mode === "read" && buffer) return { x: editor.x + 3, y: editor.y + readCursorRow(this.state, buffer, editor) };
    const line = buffer ? lineLayout(buffer, this.state.cursor.line) : null;
    const cells = line ? Math.max(0, line.cells[Math.min(col, line.clusters.length)]! - line.cells[Math.min(this.state.left, line.clusters.length)]!) : 0;
    return { x: editor.x + (buffer ? gutterWidth(buffer) : 0) + cells, y: editor.y + this.state.cursor.line - this.state.top };
  }

  // ---------- navigation ----------

  private goToCode(): void {
    const at = this.targetNear(this.state.cursor);
    const ws = this.live();
    const path = this.state.current;
    if (!at || !ws || !path) {
      this.state.message = ws ? "no id or code link on this line" : "analysis is still running";
      return;
    }
    const target = definition(ws, path, this.lspPosition(at));
    if (!target) {
      this.state.message = "no code for this id (planned, or not in the snapshot)";
      return;
    }
    this.state.cursor = at;
    this.jump(fileURLToPath(target.uri), target.range.start.line + 1);
  }

  /** Opens a file at a line: a spec in the editor, code in `$EDITOR` or the built-in viewer. */
  private jump(abs: string, line: number): void {
    const rel = toPosix(relative(this.state.root, abs));
    if (extname(abs) === ".md" && !rel.startsWith("..")) {
      this.open(rel, { line: line - 1, col: 0 });
      return;
    }
    if (this.surface?.openEditor) {
      // The transport detaches the surface while the editor has the screen and repaints when it is back.
      void this.surface.openEditor(abs, line);
      return;
    }
    let lines: string[];
    try {
      lines = readFileSync(abs, "utf8").split("\n");
    } catch {
      this.state.message = `${rel}: cannot read`;
      return;
    }
    if (this.state.current) this.state.back.push({ path: this.state.current, cursor: { ...this.state.cursor }, mode: this.state.mode });
    const editor = layout(this.state).editor;
    this.state.code = { file: rel, line, lines, top: Math.max(0, line - 1 - Math.floor((editor.height - 1) / 3)), link: `vscode://file${pathToFileURL(abs).pathname}:${line}` };
    this.state.mode = "code";
    this.state.hover = null;
  }

  /** The ID of the node whose item is at the cursor line or the nearest one above it (a description, `calls`). */
  private nodeAtCursor(): string | null {
    const doc = this.buffer()?.doc;
    if (!doc) return null;
    let best: { id: string; line: number } | null = null;
    forNodes(doc, (node) => {
      const line = node.span.start.line - 1;
      if (node.id && line <= this.state.cursor.line && (best === null || line >= best.line)) best = { id: node.id, line };
    });
    return (best as { id: string; line: number } | null)?.id ?? null;
  }

  /** The 0-based line of the item that declares `id` in the file at `path`, or null. */
  private lineOfNode(path: string, id: string): number | null {
    const doc = this.load(path).doc;
    let line: number | null = null;
    if (doc) forNodes(doc, (node) => void (line ??= node.id === id ? node.span.start.line - 1 : null));
    return line;
  }

  /** The map directory of each variant, relative to the root. */
  private mapDirs(analysis: Analysis): { map: string; explained: string } {
    return { map: `${analysis.config.dir}/map/`, explained: `${analysis.config.dir}/${EXPLAINED_MAP_DIR}/` };
  }

  /** `t`: the same layer file in the other map, the cursor on the same node. */
  private toggleMap(): void {
    const analysis = this.state.analysis;
    const path = this.state.current;
    if (!analysis || !path) {
      this.state.message = analysis ? "no file open" : "analysis is still running";
      return;
    }
    const dirs = this.mapDirs(analysis);
    let target: string;
    if (path.startsWith(dirs.map)) {
      if (!analysis.map?.explained) {
        this.state.message = 'the explained map is off: add "explain": {"map": true} to keylang.json, then F5';
        return;
      }
      target = dirs.explained + path.slice(dirs.map.length);
    } else if (path.startsWith(dirs.explained) && path !== `${dirs.explained}README.md`) {
      target = dirs.map + path.slice(dirs.explained.length);
    } else {
      this.state.message = "t switches a layer file between the map and the explained map";
      return;
    }
    const id = this.nodeAtCursor();
    const line = id ? this.lineOfNode(target, id) : null;
    this.open(target, { line: line ?? 0, col: 0 });
  }

  /** The node's line in the map the reader is in: the explained map from one of its files, the map otherwise. */
  private goToNode(id: string): void {
    const analysis = this.state.analysis;
    const node = analysis?.snapshot?.nodes[id];
    if (!analysis || !node) return this.goToSpec(id);
    const dirs = this.mapDirs(analysis);
    const explained = this.state.current?.startsWith(dirs.explained) === true && analysis.map?.explained?.has(`${node.layer}.md`) === true;
    const path = `${explained ? dirs.explained : dirs.map}${node.layer}.md`;
    const line = this.lineOfNode(path, id);
    if (line === null) return this.goToSpec(id);
    const text = bufferLines(this.load(path))[line] ?? "";
    this.open(path, { line, col: graphemes(/^\s*(?:- )?/.exec(text)![0]).length });
  }

  private goToSpec(id: string | null): void {
    const analysis = this.state.analysis;
    if (!analysis || !id) {
      this.state.message = "no id here";
      return;
    }
    const found = analysis.index.lookup(id);
    if (found.kind === "missing") {
      this.state.message = `\`${id}\` is not declared in any spec`;
      return;
    }
    const lines = bufferLines(this.load(found.decl.file));
    this.open(found.decl.file, { line: found.decl.span.start.line - 1, col: clusterAt(lines[found.decl.span.start.line - 1] ?? "", found.decl.span.start.col - 1) });
  }

  private idAtCursor(): string | null {
    const buffer = this.buffer();
    const at = this.targetNear(this.state.cursor);
    if (!buffer?.doc || !at) return null;
    const target = targetAt(buffer.doc, this.offsetOf(at));
    return target?.kind === "id" ? target.id : null;
  }

  private goBack(): void {
    this.state.completion = null;
    const place = this.state.back.pop();
    if (!place) {
      if (this.state.mode === "code") this.state.mode = "view";
      return;
    }
    this.load(place.path);
    this.state.current = place.path;
    this.state.cursor = { ...place.cursor };
    this.state.mode = place.mode;
    this.state.code = null;
    this.clampCursor();
    this.keepVisible();
  }

  // ---------- events ----------

  private handle(event: InputEvent): void {
    // A ghost line answers the next key in the editor (Tab takes it, Alt+] cycles); a click, a paste,
    // a panel key or anything outside the editor drops it, so it is never taken into other text.
    if (this.state.ghost && !(event.type === "mouse" && event.action !== "down") && !(event.type === "key" && this.state.mode === "edit" && !this.state.prompt && !this.state.help && !PANEL_KEYS.has(event.name) && !(event.ctrl && event.name === "c"))) this.assist.dropGhost();
    if (event.type === "mouse") {
      this.mouse(event);
      return;
    }
    if (event.type === "paste") {
      if (this.state.prompt) this.promptType(event.text.replace(/\n/g, " "));
      else if (this.state.mode === "edit") this.insert(event.text);
      else this.state.message = "paste: press i to edit first";
      return;
    }
    this.state.message = null;
    if (event.name !== "q" && !(event.ctrl && event.name === "c")) this.state.quitArmed = false;
    if (event.ctrl && event.name === "c") return this.quit();
    if (this.state.help) {
      this.state.help = false;
      return;
    }
    if (this.state.prompt) return this.promptKey(event);
    if (event.name === "f5") return this.reanalyze();
    // Panels take the focus only where keys go to the focused panel (the view); in the editor, MERGE and
    // the code viewer they are shown, and the keys still go where they went.
    const focusable = this.state.mode === "view" || this.state.mode === "read";
    if (event.name === "f2") {
      this.state.showFiles = !this.state.showFiles;
      if (this.state.showFiles && focusable) this.state.focus = "files";
      else if (!this.state.showFiles && this.state.focus === "files") this.state.focus = "editor";
      return this.keepVisible();
    }
    if (event.name === "f3") {
      this.state.showNav = !this.state.showNav;
      if (!this.state.showNav && this.state.focus === "nav") this.state.focus = "editor";
      return this.keepVisible();
    }
    if (event.name === "f4") return this.toggleContext(focusable);
    switch (this.state.mode) {
      case "merge":
        return this.merges.key(event);
      case "code":
        return this.codeKey(event);
      case "edit":
        return this.editKey(event);
      default:
        if (this.state.focus === "context") return this.contextKey(event);
        if (this.state.focus === "nav") return this.navKey(event);
        if (this.state.focus === "files") return this.filesKey(event);
        return this.viewKey(event);
    }
  }

  private quit(): void {
    const dirty = this.unsaved();
    if (dirty.length > 0 && !this.state.quitArmed) {
      this.state.quitArmed = true;
      this.state.message = `unsaved changes in ${dirty.join(", ")}: Ctrl+S saves, q or Ctrl+C again quits`;
      return;
    }
    this.close();
    this.onQuit();
  }

  private move(lines: number): void {
    this.state.cursor.line += lines;
    this.clampCursor();
    this.keepVisible();
    if (this.state.hover?.source === "key") this.state.hover = null;
  }

  private common(event: KeyEvent): boolean {
    const page = Math.max(1, layout(this.state).editor.height - 2);
    const shift = event.shift && this.state.mode === "edit";
    if (shift && (event.name === "up" || event.name === "down")) this.state.selection ??= this.state.cursor.line;
    else if (["up", "down", "pageup", "pagedown", "left", "right", "home", "end"].includes(event.name)) this.state.selection = null;
    switch (event.name) {
      case "up":
        this.move(-1);
        return true;
      case "down":
        this.move(1);
        return true;
      case "pageup":
        this.move(-page);
        return true;
      case "pagedown":
        this.move(page);
        return true;
      case "left":
        this.state.cursor.col = Math.max(0, this.state.cursor.col - 1);
        this.keepVisible();
        return true;
      case "right":
        this.state.cursor.col++;
        this.clampCursor();
        this.keepVisible();
        return true;
      case "home":
        this.state.cursor.col = 0;
        this.keepVisible();
        return true;
      case "end":
        this.state.cursor.col = Number.MAX_SAFE_INTEGER;
        this.clampCursor();
        this.keepVisible();
        return true;
      default:
        return false;
    }
  }

  private cycleFocus(): void {
    const order = ["editor", ...(this.state.context.open ? ["context"] : this.state.showNav ? ["nav"] : []), ...(this.state.showFiles ? ["files"] : [])] as const;
    const at = order.indexOf(this.state.focus as (typeof order)[number]);
    this.state.focus = order[(at + 1) % order.length] as State["focus"];
    if (this.state.focus === "nav") this.fixNavIndex(1);
  }

  private viewKey(event: KeyEvent): void {
    if (!event.ctrl && !event.alt && this.common(event)) return;
    if (event.name === "enter" && event.alt) return this.goToSpec(this.idAtCursor());
    if (event.ctrl && event.name === "o") return this.goBack();
    if (event.ctrl && event.name === "g") return this.textToSpec();
    if (event.ctrl && event.name === "space") return this.assist.agentDraft();
    if (event.ctrl && event.name === "r") {
      // A recording started in the editor is stopped from anywhere.
      if (this.assist.recordingNow) return this.assist.voice();
      this.state.message = "voice goes where the cursor is: press i to edit, then Ctrl+R";
      return;
    }
    if (event.ctrl || event.alt) return;
    switch (event.name) {
      case "enter":
        return this.goToCode();
      case "tab":
        return this.cycleFocus();
      case "k":
        return this.move(-1);
      case "j":
        return this.move(1);
      case "g":
        this.state.cursor = { line: 0, col: 0 };
        return this.keepVisible();
      case "G":
        this.state.cursor = { line: this.lines().length - 1, col: 0 };
        return this.keepVisible();
      case "K": {
        const at = this.targetNear(this.state.cursor);
        const buffer = this.buffer();
        if (!at || !buffer) {
          this.state.message = "no id on this line";
          return;
        }
        const anchor = this.cursorAnchor(at.col);
        this.state.hover = this.hoverAt(at, anchor.x, anchor.y, "key");
        if (!this.state.hover) this.state.message = this.state.analysis ? "nothing known about this id" : "analysis is still running";
        return;
      }
      case "escape":
        this.state.hover = null;
        this.state.selection = null;
        if (this.state.mode === "read") this.state.mode = "view";
        return;
      case "v":
        this.state.mode = this.state.mode === "read" ? "view" : "read";
        this.state.hover = null;
        return;
      case "i": {
        const buffer = this.buffer();
        if (!buffer) return;
        if (buffer.readOnly) {
          this.state.message = `${buffer.path} is generated by \`keylang map\`; change the code or the rules instead`;
          return;
        }
        this.state.mode = "edit";
        this.state.hover = null;
        return;
      }
      case "m":
        return this.merges.open();
      case "u":
        return this.merges.undo();
      case "e":
        return this.explainAtCursor();
      case "t":
        return this.toggleMap();
      case "s":
        this.state.prompt = { kind: "node", text: "", items: [], ids: [], index: 0 };
        return this.findNodes();
      case "?":
        this.state.help = true;
        return;
      case "/":
        this.state.prompt = { kind: "search", text: this.state.search ?? "", items: [], index: 0 };
        return;
      case ":":
        this.state.prompt = { kind: "palette", text: "", items: this.paletteItems(""), index: 0 };
        return;
      case "n":
        return this.findNext();
      case "q":
        return this.quit();
      default:
        return;
    }
  }

  private editKey(event: KeyEvent): void {
    const ghost = this.state.ghost;
    if (ghost) {
      if (event.alt && event.name === "]") {
        ghost.index = (ghost.index + 1) % ghost.variants.length;
        return;
      }
      if (event.name === "tab" && !this.state.completion) {
        this.state.ghost = null;
        return this.assist.acceptGhost(ghost);
      }
      this.assist.dropGhost();
      if (event.name === "escape") return;
    }
    this.editKeyWithoutGhost(event);
    if (this.state.mode === "edit") this.assist.ghostSoon();
  }

  private editKeyWithoutGhost(event: KeyEvent): void {
    const completion = this.state.completion;
    if (completion) {
      if (event.name === "up" || event.name === "down") {
        completion.index = (completion.index + (event.name === "up" ? -1 : 1) + completion.items.length) % completion.items.length;
        return;
      }
      if (event.name === "tab" || event.name === "enter") return this.acceptCompletion();
      if (event.name === "escape") {
        countSuggestion(this.state.root, "completion", "rejected", completion.shown);
        this.state.completion = null;
        return;
      }
    }
    if (event.ctrl && event.name === "s") return this.save();
    if (event.ctrl && event.name === "r") return this.assist.voice();
    if (event.ctrl && event.name === "z") return this.undoEdit();
    if (event.ctrl && event.name === "g") return this.textToSpec();
    if (event.ctrl && event.name === "space") return this.complete(true);
    if (event.ctrl && event.name === "o") return this.goBack();
    if (event.name === "escape") {
      this.state.mode = "view";
      this.state.selection = null;
      this.state.completion = null;
      return;
    }
    if (this.common(event)) {
      this.state.completion = null;
      return;
    }
    if (event.name === "enter") {
      this.edit((lines, cursor) => {
        const line = lines[cursor.line] ?? "";
        const chars = graphemes(line);
        const indent = /^\s*/.exec(line)![0];
        // A new item continues the list at the same depth.
        const bullet = /^\s*-\s/.test(line) && chars.slice(cursor.col).join("").trim() === "" ? "- " : "";
        lines.splice(cursor.line, 1, chars.slice(0, cursor.col).join(""), indent + bullet + chars.slice(cursor.col).join(""));
        cursor.line++;
        cursor.col = [...indent].length + bullet.length;
      });
      this.state.completion = null;
      return;
    }
    if (event.name === "backspace") {
      this.edit((lines, cursor) => {
        if (cursor.col > 0) {
          const chars = graphemes(lines[cursor.line] ?? "");
          chars.splice(cursor.col - 1, 1);
          lines[cursor.line] = chars.join("");
          cursor.col--;
        } else if (cursor.line > 0) {
          const previous = lines[cursor.line - 1]!;
          lines.splice(cursor.line - 1, 2, previous + (lines[cursor.line] ?? ""));
          cursor.line--;
          cursor.col = graphemes(previous).length;
        }
      }, true);
      return this.complete(false);
    }
    if (event.name === "delete") {
      this.edit((lines, cursor) => {
        const chars = graphemes(lines[cursor.line] ?? "");
        if (cursor.col < chars.length) {
          chars.splice(cursor.col, 1);
          lines[cursor.line] = chars.join("");
        } else if (cursor.line < lines.length - 1) lines.splice(cursor.line, 2, chars.join("") + lines[cursor.line + 1]!);
      }, true);
      return;
    }
    if (event.name === "tab") return this.insert("  ");
    if (event.text !== undefined && !event.ctrl && !event.alt) return this.insert(event.text);
  }

  private insert(raw: string): void {
    const text = printable(raw);
    const buffer = this.buffer();
    if (text === "" || !buffer) return;
    // The cursor line as laid out before the edit: the split point without segmenting the line again.
    const layout = lineLayout(buffer, this.state.cursor.line);
    this.edit((lines, cursor) => {
      const line = lines[cursor.line] ?? "";
      const col = Math.min(cursor.col, layout.clusters.length);
      const at = layout.units[col]!;
      const parts = text.split("\n");
      const before = line.slice(0, at);
      const after = line.slice(at);
      // The cursor is counted in clusters of the result: a combining mark joins the letter before it,
      // and only the last cluster before the cursor can join what is typed.
      if (parts.length === 1) {
        lines[cursor.line] = before + parts[0] + after;
        cursor.col = col === 0 ? graphemes(parts[0]!).length : col - 1 + graphemes(layout.clusters[col - 1]! + parts[0]).length;
        return;
      }
      const inserted = [before + parts[0], ...parts.slice(1, -1), parts.at(-1)! + after];
      lines.splice(cursor.line, 1, ...inserted);
      cursor.line += parts.length - 1;
      cursor.col = graphemes(parts.at(-1)!).length;
    }, [...text].length === 1 && text !== " ");
    this.complete(false);
  }

  private undoEdit(): void {
    this.state.completion = null;
    const buffer = this.buffer();
    const last = buffer?.undo.pop();
    if (!buffer || !last) {
      this.state.message = "nothing to undo";
      return;
    }
    setText(buffer, last.text);
    this.state.cursor = { ...last.cursor };
    this.clampCursor();
    this.keepVisible();
    this.reanalyzeSoon();
  }

  // ---------- completion ----------

  /** Opens or refreshes the completion list; `explicit` (Ctrl+Space) also opens it mid-word. */
  private complete(explicit: boolean): void {
    const ws = this.live();
    const path = this.state.current;
    const buffer = this.buffer();
    if (!ws || !path || !buffer?.doc) {
      this.state.completion = null;
      return;
    }
    const line = lineLayout(buffer, this.state.cursor.line);
    const col = Math.min(this.state.cursor.col, line.clusters.length);
    // The word under the cursor, found back from it: a regex anchored at the end of the line
    // (`[^\s,]*$`) backtracks from every column and made one key quadratic in the line.
    let from = col;
    while (from > 0 && !/[\s,]/u.test(line.clusters[from - 1]!)) from--;
    const prefix = line.clusters.slice(from, col).join("").toLowerCase();
    if (!explicit && !this.state.completion && !(col > 0 && /[\s.]$/u.test(line.clusters[col - 1]!)) && prefix.length < 2) {
      this.state.completion = null;
      return;
    }
    const all = completions(ws, path, this.lspPosition(this.state.cursor));
    const starts = all.filter((item) => item.label.toLowerCase().startsWith(prefix));
    const contains = all.filter((item) => !item.label.toLowerCase().startsWith(prefix) && item.label.toLowerCase().includes(prefix));
    const items = [...starts, ...contains];
    const open = items.length > 0 && !(items.length === 1 && items[0]!.label.toLowerCase() === prefix);
    const shown = this.state.completion?.shown;
    if (open && shown === undefined) countSuggestion(this.state.root, "completion", "proposed", null);
    this.state.completion = open ? { items, index: 0, from, shown: shown ?? Date.now() } : null;
  }

  private acceptCompletion(): void {
    const completion = this.state.completion;
    if (!completion) return;
    const item = completion.items[completion.index]!;
    this.state.completion = null;
    countSuggestion(this.state.root, "completion", "accepted", completion.shown);
    // The list belongs to the word it was opened on; text moved under it since is not replaced.
    if (completion.from > this.state.cursor.col) return;
    this.edit((lines, cursor) => {
      const chars = graphemes(lines[cursor.line] ?? "");
      chars.splice(completion.from, cursor.col - completion.from, item.label);
      lines[cursor.line] = chars.join("");
      cursor.col = completion.from + graphemes(item.label).length;
    });
  }

  // ---------- panels ----------

  private fixNavIndex(direction: 1 | -1): void {
    const items = navEntries(this.state);
    if (items.length === 0) return;
    let index = Math.max(0, Math.min(this.state.navIndex, items.length - 1));
    while (items[index]?.kind === "heading" && index + direction >= 0 && index + direction < items.length) index += direction;
    this.state.navIndex = index;
    const nav = layout(this.state).nav;
    const height = (nav ? navListHeight(this.state, nav) : 2) - 1;
    if (index < this.state.navTop) this.state.navTop = index;
    if (index >= this.state.navTop + height) this.state.navTop = index - height + 1;
  }

  // ---------- context panel ----------

  private toggleContext(focus = true): void {
    const context = this.state.context;
    context.open = !context.open;
    if (context.open && focus) this.state.focus = "context";
    else if (!context.open && this.state.focus === "context") this.state.focus = "editor";
    this.keepVisible();
  }

  /** The pack for the current buffer and cursor line; null before the first analysis. */
  contextPack(): ContextPack | null {
    const buffer = this.buffer();
    const analysis = this.state.analysis;
    if (!buffer || !analysis) return null;
    const context = this.state.context;
    return contextPack(analysis, { path: buffer.path, text: buffer.text, line: this.state.cursor.line, added: context.added, removed: context.removed });
  }

  private contextKey(event: KeyEvent): void {
    const pack = this.contextPack();
    const items = pack?.items ?? [];
    const context = this.state.context;
    switch (event.name) {
      case "up":
      case "k":
        context.index = Math.max(0, context.index - 1);
        return;
      case "down":
      case "j":
        context.index = Math.min(Math.max(0, items.length - 1), context.index + 1);
        return;
      case "x": {
        const item = items[context.index];
        if (!item) return;
        context.removed.add(item.key);
        context.added = context.added.filter((id) => `node:${id}` !== item.key);
        context.index = Math.min(context.index, Math.max(0, items.length - 2));
        this.state.message = `context: ${item.label} left out`;
        return;
      }
      case "@":
        this.state.prompt = { kind: "context", text: "", items: [], index: 0 };
        return;
      case "tab":
        return this.cycleFocus();
      case "escape":
        return this.toggleContext();
      default:
        return;
    }
  }

  private addToContext(id: string): void {
    const analysis = this.state.analysis;
    if (!analysis) {
      this.state.message = "analysis is still running";
      return;
    }
    const result = summarizeNode(analysis, id);
    if ("unknown" in result) {
      this.state.message = `unknown id \`${id}\`${result.suggestion ? ` (did you mean \`${result.suggestion}\`?)` : ""}`;
      return;
    }
    const context = this.state.context;
    context.removed.delete(`node:${id}`);
    if (!context.added.includes(id)) context.added.push(id);
    this.state.message = `context: ${id} added`;
  }

  /** `e`: the offline summary of the id under the cursor, with its saved explanation (model, date, stale?). */
  private explainAtCursor(): void {
    const id = this.idAtCursor();
    const analysis = this.state.analysis;
    if (!id || !analysis) {
      this.state.message = analysis ? "no id on this line" : "analysis is still running";
      return;
    }
    const result = summarizeNode(analysis, id);
    if ("unknown" in result) {
      this.state.message = `unknown id \`${id}\``;
      return;
    }
    const saved = readExplanation(analysis.config, id);
    const lines: Hover["lines"] = formatSummary(result.summary).split("\n").map((text, i) => ({ text, kind: i === 0 ? "title" : "text" }));
    if (saved) {
      lines.push({ text: "", kind: "rule" });
      for (const text of saved.text.split("\n")) lines.push({ text, kind: "text" });
      lines.push({ text: `${saved.agent} · ${saved.date} · ${isStale(analysis, id, saved) ? "stale" : "fresh"}`, kind: "evidence" });
    } else {
      lines.push({ text: "no explanation yet: keylang explain <id> --llm", kind: "evidence" });
    }
    const anchor = this.cursorAnchor(0);
    this.state.hover = { x: layout(this.state).editor.x + 2, y: anchor.y, lines, source: "key" };
  }

  private navKey(event: KeyEvent): void {
    const items = navEntries(this.state);
    const item = items[this.state.navIndex];
    switch (event.name) {
      case "up":
      case "k":
        this.state.navIndex = Math.max(0, this.state.navIndex - 1);
        return this.fixNavIndex(-1);
      case "down":
      case "j":
        this.state.navIndex = Math.min(items.length - 1, this.state.navIndex + 1);
        return this.fixNavIndex(1);
      case "right":
      case "left": {
        if (!item?.parent) return;
        const open = event.name === "right";
        if (item.kind === "layer") {
          if (open) this.state.navExpanded.delete(`-${item.key}`);
          else this.state.navExpanded.add(`-${item.key}`);
        } else if (open) this.state.navExpanded.add(item.key);
        else this.state.navExpanded.delete(item.key);
        return;
      }
      case "enter":
        if (!item) return;
        if (event.alt) {
          if (item.spec) this.open(item.spec.file, { line: item.spec.line - 1, col: 0 });
        } else if (item.code) this.jump(resolve(this.state.root, item.code.file), item.code.line);
        else if (item.spec) this.open(item.spec.file, { line: item.spec.line - 1, col: 0 });
        else if (item.parent) this.navKey({ ...event, name: item.expanded ? "left" : "right", alt: false });
        if (this.state.mode !== "code") this.state.focus = "editor";
        return;
      case "tab":
        return this.cycleFocus();
      case "escape":
        this.state.focus = "editor";
        return;
      case "q":
        return this.quit();
      case "?":
        this.state.help = true;
        return;
      default:
        return;
    }
  }

  private filesKey(event: KeyEvent): void {
    switch (event.name) {
      case "up":
      case "k":
        this.state.filesIndex = Math.max(0, this.state.filesIndex - 1);
        return;
      case "down":
      case "j":
        this.state.filesIndex = Math.min(this.state.files.length - 1, this.state.filesIndex + 1);
        return;
      case "enter": {
        const file = this.state.files[this.state.filesIndex];
        if (file) this.open(file, { line: 0, col: 0 });
        this.state.focus = "editor";
        return;
      }
      case "tab":
        return this.cycleFocus();
      case "escape":
        this.state.focus = "editor";
        return;
      case "q":
        return this.quit();
      default:
        return;
    }
  }

  private codeKey(event: KeyEvent): void {
    const code = this.state.code;
    if (!code) return;
    const page = Math.max(1, layout(this.state).editor.height - 2);
    switch (event.name) {
      case "up":
      case "k":
        code.top = Math.max(0, code.top - 1);
        return;
      case "down":
      case "j":
        code.top = Math.min(Math.max(0, code.lines.length - 1), code.top + 1);
        return;
      case "pageup":
        code.top = Math.max(0, code.top - page);
        return;
      case "pagedown":
        code.top = Math.min(Math.max(0, code.lines.length - 1), code.top + page);
        return;
      case "escape":
      case "q":
        return this.goBack();
      case "o":
        if (event.ctrl) return this.goBack();
        return;
      case "?":
        this.state.help = true;
        return;
      default:
        return;
    }
  }

  // ---------- mouse ----------

  private mouse(event: MouseEvent): void {
    const area = layout(this.state);
    const inside = (rect: { x: number; y: number; width: number; height: number } | null): boolean => rect !== null && event.x >= rect.x && event.x < rect.x + rect.width && event.y >= rect.y && event.y < rect.y + rect.height;
    // With the context panel open, the panel on the right is the context, not the navigation it covers.
    const context = this.state.context.open && inside(area.nav);
    if (event.action === "wheel-up" || event.action === "wheel-down") {
      const delta = event.action === "wheel-up" ? -3 : 3;
      if (this.state.mode === "code" && this.state.code) this.state.code.top = Math.max(0, Math.min(this.state.code.lines.length - 1, this.state.code.top + delta));
      else if (this.state.mode === "merge" && this.state.merge) this.state.merge.top = Math.max(0, this.state.merge.top + delta);
      else if (context) this.state.context.index = Math.max(0, Math.min(Math.max(0, (this.contextPack()?.items.length ?? 1) - 1), this.state.context.index + delta));
      else if (inside(area.nav)) this.state.navTop = Math.max(0, this.state.navTop + delta);
      else {
        this.state.top = Math.max(0, Math.min(this.lines().length - 1, this.state.top + delta));
        this.state.cursor.line = Math.max(this.state.top, Math.min(this.state.cursor.line, this.state.top + area.editor.height - 2));
        this.clampCursor();
      }
      this.state.hover = null;
      return;
    }
    if (event.action === "move") {
      if (this.state.mode !== "view" && this.state.mode !== "edit") return;
      const cell = this.cellAt(event.x, event.y);
      if (!cell) {
        if (this.state.hover?.source === "mouse") this.state.hover = null;
        return;
      }
      this.state.hover = this.hoverAt(cell, event.x, event.y, "mouse");
      return;
    }
    if (event.action !== "down" || event.button !== 0) return;
    this.state.message = null;
    // A click elsewhere would open another file and drop the decisions made so far.
    if (this.state.mode === "merge") {
      this.state.message = "finish the merge first: w writes the decided hunks, Esc cancels";
      return;
    }
    if (context && area.nav) {
      const row = event.y - area.nav.y - 1;
      const index = contextTop(this.state.context.index, area.nav) + row;
      if (row < 0 || index >= (this.contextPack()?.items.length ?? 0)) return;
      this.state.context.index = index;
      if (this.state.mode === "view" || this.state.mode === "read") this.state.focus = "context";
      return;
    }
    if (inside(area.nav) && area.nav) {
      const index = this.state.navTop + event.y - area.nav.y - 1;
      if (index < this.state.navTop) return;
      this.state.focus = "nav";
      this.state.navIndex = index;
      this.fixNavIndex(1);
      const item = navEntries(this.state)[this.state.navIndex];
      if (item?.parent && event.x - area.nav.x <= item.depth * 2 + 2) return this.navKey({ type: "key", name: item.expanded ? "left" : "right", ctrl: false, alt: false, shift: false });
      return this.navKey({ type: "key", name: "enter", ctrl: false, alt: event.alt, shift: false });
    }
    if (inside(area.files) && area.files) {
      const row = event.y - area.files.y - 1;
      const index = filesTop(this.state, area.files) + row;
      if (row < 0 || index >= this.state.files.length) return;
      this.state.filesIndex = index;
      this.state.focus = "files";
      return this.filesKey({ type: "key", name: "enter", ctrl: false, alt: false, shift: false });
    }
    const cell = this.cellAt(event.x, event.y);
    if (!cell) return;
    this.state.focus = "editor";
    this.state.cursor = cell;
    this.state.selection = null;
    this.state.completion = null;
    this.keepVisible();
    // Ctrl+click goes to the code, like Enter.
    if (event.ctrl && this.state.mode === "view") this.goToCode();
  }

  // ---------- search and palette ----------

  private promptType(text: string): void {
    const prompt = this.state.prompt!;
    prompt.text += text;
    if (prompt.kind === "palette") {
      prompt.items = this.paletteItems(prompt.text);
      prompt.index = 0;
    }
    if (prompt.kind === "node") this.findNodes();
  }

  /** The nodes matching the `s` prompt: names and IDs as a subsequence, then words of their explanations. */
  private findNodes(): void {
    const prompt = this.state.prompt;
    const analysis = this.state.analysis;
    if (prompt?.kind !== "node") return;
    const hits = analysis ? searchNodes(analysis, this.state.briefs, { query: prompt.text, limit: NODE_HITS, fuzzy: true }) : [];
    prompt.items = hits.map((hit) => `${hit.id}${hit.explanation ? `  ${hit.explanation.text}` : ""}`);
    prompt.ids = hits.map((hit) => hit.id);
    prompt.index = 0;
  }

  private promptKey(event: KeyEvent): void {
    const prompt = this.state.prompt!;
    if (event.name === "escape") {
      this.state.prompt = null;
      return;
    }
    if (event.name === "backspace") {
      prompt.text = graphemes(prompt.text).slice(0, -1).join("");
      if (prompt.kind === "palette") {
        prompt.items = this.paletteItems(prompt.text);
        prompt.index = 0;
      }
      if (prompt.kind === "node") this.findNodes();
      return;
    }
    if ((event.name === "up" || event.name === "down") && (prompt.kind === "palette" || prompt.kind === "node") && prompt.items.length > 0) {
      prompt.index = (prompt.index + (event.name === "up" ? -1 : 1) + prompt.items.length) % prompt.items.length;
      return;
    }
    if (event.name === "enter") {
      this.state.prompt = null;
      if (prompt.kind === "search") {
        this.state.search = prompt.text;
        this.findNext();
      } else if (prompt.kind === "context") {
        this.addToContext(prompt.text.trim().replace(/^@/, ""));
      } else if (prompt.kind === "node") {
        const id = prompt.ids?.[prompt.index];
        if (id) this.goToNode(id);
      } else {
        const chosen = prompt.items[prompt.index];
        if (chosen) this.runCommand(chosen);
      }
      return;
    }
    if (event.text !== undefined && !event.ctrl && !event.alt) this.promptType(event.text);
  }

  private commands(): string[] {
    return ["check (F5)", "files panel (F2)", "navigation panel (F3)", "find a node (s)", "map / explained map (t)", "reading mode (v)", "edit (i)", "merge proposal (m)", "keys (?)", "quit (q)", ...this.state.files.map((file) => `open ${file}`)];
  }

  private paletteItems(query: string): string[] {
    const q = query.toLowerCase();
    // Fuzzy: the query's characters appear in order.
    return this.commands().filter((command) => {
      let at = 0;
      for (const ch of command.toLowerCase()) if (ch === q[at]) at++;
      return at === q.length;
    });
  }

  private runCommand(command: string): void {
    if (command.startsWith("open ")) return this.open(command.slice(5), { line: 0, col: 0 });
    const key = /\((.+)\)$/.exec(command)?.[1] ?? "";
    const event: KeyEvent = { type: "key", name: key.toLowerCase() === "f5" ? "f5" : key === "F2" ? "f2" : key === "F3" ? "f3" : key, ctrl: false, alt: false, shift: false, text: key };
    this.handle(event);
  }

  private findNext(): void {
    const query = this.state.search;
    if (!query) return;
    const lines = this.lines();
    for (let step = 1; step <= lines.length; step++) {
      const line = (this.state.cursor.line + step) % lines.length;
      const at = lines[line]!.toLowerCase().indexOf(query.toLowerCase());
      if (at !== -1) {
        this.state.cursor = { line, col: graphemes(lines[line]!.slice(0, at)).length };
        this.keepVisible();
        return;
      }
    }
    this.state.message = `not found: ${query}`;
  }

  // ---------- text → spec ----------

  private textToSpec(): void {
    const buffer = this.buffer();
    if (!buffer?.doc || buffer.readOnly) return;
    const lines = buffer.text.split("\n");
    let from: number;
    let to: number;
    if (this.state.selection !== null) {
      from = Math.min(this.state.selection, this.state.cursor.line);
      to = Math.max(this.state.selection, this.state.cursor.line);
    } else {
      // The paragraph of free text around the cursor.
      const prose = (line: string | undefined): boolean => line !== undefined && line.trim() !== "" && !/^\s*(-\s|#|```|<!--)/.test(line);
      if (!prose(lines[this.state.cursor.line])) {
        this.state.message = "text → spec: put the cursor on free text or select lines (Shift+↑↓)";
        return;
      }
      from = this.state.cursor.line;
      to = this.state.cursor.line;
      while (prose(lines[from - 1])) from--;
      while (prose(lines[to + 1])) to++;
    }
    const text = lines.slice(from, to + 1).join("\n");
    const indent = /^\s*/.exec(lines[from] ?? "")![0].length;
    const nodes = this.state.analysis?.snapshot?.nodes ?? {};
    const planned = plannedIds(this.state.analysis?.docs ?? []);
    const known = [...Object.keys(nodes), ...planned.map((item) => item.id)];
    const callables = [...Object.keys(nodes).filter((id) => nodes[id]!.kind === "fn"), ...planned.filter((item) => item.kind === "fn").map((item) => item.id)];
    const items = textToSpec(text, indent, known, callables);
    if (items.length === 0) {
      this.state.message = "text → spec: no step, when, emits or invariant found in the text";
      return;
    }
    // Items already right after the text came from an earlier Ctrl+G: only the missing ones are proposed.
    let end = to + 1;
    while (end < lines.length && /^\s*-\s/.test(lines[end]!)) end++;
    const present = new Set(lines.slice(to + 1, end).map((line) => line.trimEnd()));
    const missing = items.filter((item) => !present.has(item.trimEnd()));
    if (missing.length === 0) {
      this.state.message = "text → spec: the items of this text are already there";
      return;
    }
    const proposed = [...lines.slice(0, end), ...missing, ...lines.slice(end)];
    this.state.selection = null;
    this.merges.start(buffer.path, "text-to-spec", lines, proposed, null, null);
  }
}

function forNodes(doc: Document, visit: (node: Node) => void): void {
  for (const section of doc.sections) for (const top of sectionNodes(section)) walk(top, visit);
}

function plannedIds(docs: readonly Document[]): { id: string; kind: string }[] {
  const out: { id: string; kind: string }[] = [];
  for (const doc of docs) {
    forNodes(doc, (node) => {
      if (node.kind === "planned" && node.id) out.push({ id: node.id, kind: node.label?.value ?? "fn" });
    });
  }
  return out;
}

/** Hand-written specs first (flows, rules), then generated map files, then `keylang.json`. */
function sortFiles(files: string[], analysis: Analysis | null): string[] {
  const rank = (file: string): number => (file === CONFIG_FILE ? 2 : analysis?.docs.find((doc) => doc.path === file)?.generated != null || /(^|\/)map(-explained)?\//.test(file) ? 1 : 0);
  return [...new Set(files)].sort((a, b) => rank(a) - rank(b) || compareText(a, b));
}

/** The keys from `from` on that only type text (letters, Enter, Tab without modifiers). */
function typedRun(events: readonly InputEvent[], from: number): KeyEvent[] {
  const run: KeyEvent[] = [];
  for (let i = from; i < events.length; i++) {
    const event = events[i]!;
    if (event.type !== "key" || event.ctrl || event.alt || (event.text === undefined && event.name !== "enter" && event.name !== "tab")) break;
    run.push(event);
  }
  return run;
}

/**
 * Text that may go into a spec: escape sequences (colored output pasted from a
 * terminal) and other control characters are removed; tabs and line breaks stay.
 */
function printable(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?|\x1b\[[0-9;?<=>]*[ -/]*[@-~]?|\x1b[@-_]?/g, "")
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "");
}
