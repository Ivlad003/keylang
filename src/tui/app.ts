// One TUI session: state, input handling, and the analysis behind it. A
// transport (terminal or WebSocket) attaches a `Surface`, feeds raw input and
// sizes, and gets ANSI frames back; the session does not know which one it is,
// except that only a terminal can hand the screen to `$EDITOR`.
//
// Analysis is the shared `analyze()` with the unsaved buffers as an overlay.
// It runs in the background: the UI keeps answering, shows "updating" and
// dims the old marks, and a result of a superseded generation is dropped.

import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { analyze, within, type Analysis, type AnalysisRequest } from "../analyze.ts";
import { CONFIG_FILE, loadConfig, toPosix } from "../config.ts";
import { collectMdFiles } from "../files.ts";
import { sectionNodes, walk, type Document, type Node } from "../ir.ts";
import { completions, definition, hover, references, targetAt, workspace, type LspPosition, type Workspace } from "../lsp-features.ts";
import { parse } from "../parser.ts";
import { compareText } from "../span.ts";
import { InputDecoder, type InputEvent, type KeyEvent, type MouseEvent } from "./input.ts";
import { applyHunks, diffLines } from "./merge.ts";
import { renderDiff, type Grid } from "./screen.ts";
import type { Buffer, Cursor, Hover, MergeState, State } from "./state.ts";
import { textToSpec } from "./text-to-spec.ts";
import { editorRows, filesTop, gutterWidth, layout, navEntries, render } from "./view.ts";
import { clusterAt, clusterOffset, graphemes, graphemeWidth, stringWidth } from "./width.ts";

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
}

/** Changes typed together are analysed once. */
const SETTLE_MS = 120;
const ESC_MS = 25;
/** A bracketed paste whose end marker has not come within this pause is ended by hand. */
const PASTE_MS = 1000;
export const PROPOSALS_DIR = ".keylang/proposals";
/** The largest frame a session draws; a bigger size from a client is cut to it. */
export const MAX_COLS = 1000;
export const MAX_ROWS = 400;

export class App {
  readonly state: State;
  private surface: Surface | null = null;
  private previous: Grid | null = null;
  private readonly decoder = new InputDecoder();
  private readonly analyzer: Analyzer;
  private readonly onQuit: () => void;
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
      search: null,
      quitArmed: false,
    };
    // The first frame comes from disk, before any analysis: a cold start shows text at once.
    this.state.files = this.diskFiles();
    const first = this.state.files.find((file) => file.includes("/flows/")) ?? this.state.files[0];
    if (first) this.open(first, { line: 0, col: 0 }, false);
    this.state.proposals = this.scanProposals();
    this.reanalyze();
  }

  // ---------- transport ----------

  attach(surface: Surface, cols: number, rows: number): void {
    this.surface = surface;
    this.previous = null;
    this.resize(cols, rows);
  }

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
      // Many typed keys in one chunk are a paste from a terminal without bracketed paste: one edit, not one per key.
      if (run.length > 1 && this.state.mode === "edit" && !this.state.prompt && !this.state.completion) {
        this.safely({ type: "paste", text: run.map((key) => (key.name === "enter" ? "\n" : key.name === "tab" ? "  " : key.text!)).join("") });
        i += run.length;
        continue;
      }
      this.safely(events[i]!);
      i++;
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
      this.state.message = `error: ${error instanceof Error ? error.message : String(error)}`;
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
    if (this.running === 0 && this.settleTimer === null) return Promise.resolve();
    return new Promise((done) => this.waiters.push(done));
  }

  close(): void {
    this.closed = true;
    if (this.escTimer) clearTimeout(this.escTimer);
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = null;
    this.surface = null;
    this.wake();
  }

  private draw(): void {
    if (!this.surface) return;
    const grid = render(this.state);
    this.surface.write(renderDiff(this.previous, grid));
    this.previous = grid;
  }

  /** Full repaint, after `$EDITOR` gave the screen back. */
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
            this.state.message = `error: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
        (error: unknown) => {
          if (generation !== this.generation || this.closed) return;
          this.state.updating = false;
          this.state.error = `analysis failed: ${error instanceof Error ? error.message : String(error)}`;
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

  private wake(): void {
    if (this.running > 0 || this.settleTimer !== null) return;
    const waiters = this.waiters;
    this.waiters = [];
    for (const done of waiters) done();
  }

  /** Files and clean buffers follow the new analysis (a regenerated map, a change on disk). */
  private adopt(analysis: Analysis): void {
    const paths = new Set([...this.diskFiles(), ...analysis.docs.map((doc) => doc.path)]);
    this.state.files = sortFiles([...paths], analysis);
    const ws = workspace(this.state.root, analysis, new Map());
    for (const buffer of this.state.buffers.values()) {
      if (buffer.text !== buffer.saved) continue;
      const fresh = ws.text(buffer.path);
      const text = fresh === null ? buffer.text : splitEol(fresh).text;
      buffer.readOnly = analysis.docs.find((doc) => doc.path === buffer.path)?.generated != null;
      if (text !== buffer.text) {
        buffer.text = text;
        buffer.saved = text;
        buffer.doc = docOf(buffer.path, text);
        buffer.disk = readText(resolve(this.state.root, buffer.path));
      }
    }
    if (this.state.current === null && this.state.files[0]) this.open(this.state.files[0], { line: 0, col: 0 }, false);
    this.state.proposals = this.scanProposals();
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
    return sortFiles([...collectMdFiles([dir]).map((abs) => toPosix(relative(this.state.root, abs))), ...config], null);
  }

  /** Proposals that may be merged; the rest are listed with the reason they are ignored. */
  private scanProposals(): string[] {
    return this.proposalFiles().filter((path) => this.proposalProblem(path) === null);
  }

  private proposalFiles(): string[] {
    const dir = join(this.state.root, PROPOSALS_DIR);
    if (!existsSync(dir)) return [];
    // An unreadable proposals directory means no proposals, not the end of a session with unsaved buffers.
    try {
      return readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .map((entry) => toPosix(relative(dir, join(entry.parentPath, entry.name))))
        .sort(compareText);
    } catch {
      return [];
    }
  }

  /** The spec directory relative to the root, POSIX (`keylang`). */
  private specDir(): string {
    let dir = "keylang";
    try {
      dir = loadConfig(this.state.root).dir;
    } catch {
      // A broken keylang.json is reported by the analysis; the default directory still bounds proposals.
    }
    return toPosix(relative(this.state.root, resolve(this.state.root, dir)));
  }

  /**
   * Why `.keylang/proposals/<path>` may not be merged, or null. A proposal
   * replaces one hand-written spec: a Markdown file under the spec directory,
   * not a generated map file, and not reached through a link that leads out.
   */
  private proposalProblem(path: string): string | null {
    try {
      return this.proposalLimits(path);
    } catch (error) {
      return `cannot be checked: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private proposalLimits(path: string): string | null {
    const specDir = this.specDir();
    if (path.split("/").some((part) => part === ".." || part === "." || part === "")) return "not a plain relative path";
    // The same files `check` reads as specs: none under hidden directories, `node_modules` or `target`.
    if (path.split("/").slice(0, -1).some((part) => part.startsWith(".") || part === "node_modules" || part === "target")) return "in a directory specs are not read from";
    if (specDir === ".." || specDir.startsWith("../")) return "the spec directory is outside the repository";
    if (specDir !== "" && !path.startsWith(`${specDir}/`)) return `outside ${specDir}/: a proposal changes specs only`;
    if (path.startsWith(`${specDir === "" ? "" : `${specDir}/`}map/`)) return "a generated map file: change the code or the rules, then run `keylang map`";
    const abs = resolve(this.state.root, path);
    if (existsSync(abs) && parse(path, readFileSync(abs, "utf8")).generated !== null) return "a generated file: it is written by `keylang map` only";
    if (this.state.analysis?.docs.some((doc) => doc.path === path && doc.generated !== null)) return "a generated file: it is written by `keylang map` only";
    const specRoot = resolve(this.state.root, specDir);
    if (!within(realPrefix(abs), existsSync(specRoot) ? realpathSync(specRoot) : specRoot)) return `leads out of ${specDir || "."}/ through a link`;
    return null;
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
    const doc = docOf(path, text);
    const buffer: Buffer = { path, text, saved: text, readOnly: doc !== null && doc.generated !== null, eol, disk, overwrite: false, doc, undo: [] };
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

  private lines(): string[] {
    return this.buffer()?.text.split("\n") ?? [];
  }

  private clampCursor(): void {
    const lines = this.lines();
    const cursor = this.state.cursor;
    cursor.line = Math.max(0, Math.min(cursor.line, lines.length - 1));
    cursor.col = Math.max(0, Math.min(cursor.col, graphemes(lines[cursor.line] ?? "").length));
  }

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
    if (this.state.cursor.col < this.state.left) this.state.left = this.state.cursor.col;
    const clusters = graphemes(this.lines()[this.state.cursor.line] ?? "");
    while (this.state.left < this.state.cursor.col && stringWidth(clusters.slice(this.state.left, this.state.cursor.col).join("")) > textWidth) this.state.left++;
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
    buffer.text = lines.join("\n");
    buffer.doc = docOf(buffer.path, buffer.text);
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
    writeAtomic(abs, written);
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
    const line = this.lines()[cursor.line] ?? "";
    return { line: cursor.line, character: clusterOffset(line, cursor.col) };
  }

  /** The column under screen x on a text line, counting wide characters. */
  private columnAt(line: string, x: number): number {
    const clusters = graphemes(line);
    let width = 0;
    for (let i = this.state.left; i < clusters.length; i++) {
      width += Math.max(1, graphemeWidth(clusters[i]!));
      if (width > x) return i;
    }
    return clusters.length;
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
    return { line: row.line, col: this.columnAt(this.lines()[row.line] ?? "", textX) };
  }

  /** The id or link at the cursor; on an item line without one under the cursor, its first. */
  private targetNear(cursor: Cursor): Cursor | null {
    const buffer = this.buffer();
    if (!buffer?.doc) return null;
    const offsetOf = (at: Cursor): number => {
      const lines = this.lines();
      let offset = 0;
      for (let i = 0; i < at.line; i++) offset += lines[i]!.length + 1;
      return offset + clusterOffset(lines[at.line] ?? "", at.col);
    };
    if (targetAt(buffer.doc, offsetOf(cursor))) return cursor;
    let found: Cursor | null = null;
    forNodes(buffer.doc, (node) => {
      if (found || node.span.start.line !== cursor.line + 1) return;
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
      const surface = this.surface;
      void surface.openEditor!(abs, line).then(() => this.redraw());
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
    const lines = this.load(found.decl.file).text.split("\n");
    this.open(found.decl.file, { line: found.decl.span.start.line - 1, col: clusterAt(lines[found.decl.span.start.line - 1] ?? "", found.decl.span.start.col - 1) });
  }

  private idAtCursor(): string | null {
    const buffer = this.buffer();
    const at = this.targetNear(this.state.cursor);
    if (!buffer?.doc || !at) return null;
    const lines = this.lines();
    let offset = 0;
    for (let i = 0; i < at.line; i++) offset += lines[i]!.length + 1;
    offset += clusterOffset(lines[at.line] ?? "", at.col);
    const target = targetAt(buffer.doc, offset);
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
    if (event.name === "f2") {
      this.state.showFiles = !this.state.showFiles;
      this.state.focus = this.state.showFiles ? "files" : "editor";
      return this.keepVisible();
    }
    if (event.name === "f3") {
      this.state.showNav = !this.state.showNav;
      if (!this.state.showNav && this.state.focus === "nav") this.state.focus = "editor";
      return this.keepVisible();
    }
    switch (this.state.mode) {
      case "merge":
        return this.mergeKey(event);
      case "code":
        return this.codeKey(event);
      case "edit":
        return this.editKey(event);
      default:
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
    const order = ["editor", ...(this.state.showNav ? ["nav"] : []), ...(this.state.showFiles ? ["files"] : [])] as const;
    const at = order.indexOf(this.state.focus as (typeof order)[number]);
    this.state.focus = order[(at + 1) % order.length] as State["focus"];
    if (this.state.focus === "nav") this.fixNavIndex(1);
  }

  private viewKey(event: KeyEvent): void {
    if (!event.ctrl && !event.alt && this.common(event)) return;
    if (event.name === "enter" && event.alt) return this.goToSpec(this.idAtCursor());
    if (event.ctrl && event.name === "o") return this.goBack();
    if (event.ctrl && event.name === "g") return this.textToSpec();
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
        const editor = layout(this.state).editor;
        const y = editor.y + at.line - this.state.top;
        this.state.hover = this.hoverAt(at, editor.x + gutterWidth(buffer) + at.col - this.state.left, y, "key");
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
        return this.openProposal();
      case "u":
        return this.undoMerge();
      case "e":
        this.state.message = "explain (LLM) is part of M7; ? shows the diagnostic explanation";
        return;
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
    const completion = this.state.completion;
    if (completion) {
      if (event.name === "up" || event.name === "down") {
        completion.index = (completion.index + (event.name === "up" ? -1 : 1) + completion.items.length) % completion.items.length;
        return;
      }
      if (event.name === "tab" || event.name === "enter") return this.acceptCompletion();
      if (event.name === "escape") {
        this.state.completion = null;
        return;
      }
    }
    if (event.ctrl && event.name === "s") return this.save();
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
    if (text === "") return;
    this.edit((lines, cursor) => {
      const chars = graphemes(lines[cursor.line] ?? "");
      const parts = text.split("\n");
      const before = chars.slice(0, cursor.col).join("");
      const after = chars.slice(cursor.col).join("");
      // The cursor is counted in clusters of the result: a combining mark joins the letter before it.
      if (parts.length === 1) {
        lines[cursor.line] = before + parts[0] + after;
        cursor.col = graphemes(before + parts[0]).length;
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
    buffer.text = last.text;
    buffer.doc = docOf(buffer.path, buffer.text);
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
    if (!ws || !path || !this.buffer()?.doc) {
      this.state.completion = null;
      return;
    }
    const line = graphemes(this.lines()[this.state.cursor.line] ?? "");
    const before = line.slice(0, this.state.cursor.col).join("");
    const from = graphemes(before.replace(/[^\s,]*$/u, "")).length;
    const prefix = line.slice(from, this.state.cursor.col).join("").toLowerCase();
    if (!explicit && !this.state.completion && !/[\s.]$/u.test(before) && prefix.length < 2) {
      this.state.completion = null;
      return;
    }
    const all = completions(ws, path, this.lspPosition(this.state.cursor));
    const starts = all.filter((item) => item.label.toLowerCase().startsWith(prefix));
    const contains = all.filter((item) => !item.label.toLowerCase().startsWith(prefix) && item.label.toLowerCase().includes(prefix));
    const items = [...starts, ...contains];
    this.state.completion = items.length > 0 && !(items.length === 1 && items[0]!.label.toLowerCase() === prefix) ? { items, index: 0, from } : null;
  }

  private acceptCompletion(): void {
    const completion = this.state.completion;
    if (!completion) return;
    const item = completion.items[completion.index]!;
    this.state.completion = null;
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
    const height = (nav?.height ?? 2) - 1;
    if (index < this.state.navTop) this.state.navTop = index;
    if (index >= this.state.navTop + height) this.state.navTop = index - height + 1;
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
    if (event.action === "wheel-up" || event.action === "wheel-down") {
      const delta = event.action === "wheel-up" ? -3 : 3;
      if (this.state.mode === "code" && this.state.code) this.state.code.top = Math.max(0, Math.min(this.state.code.lines.length - 1, this.state.code.top + delta));
      else if (this.state.mode === "merge" && this.state.merge) this.state.merge.top = Math.max(0, this.state.merge.top + delta);
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
      return;
    }
    if ((event.name === "up" || event.name === "down") && prompt.kind === "palette" && prompt.items.length > 0) {
      prompt.index = (prompt.index + (event.name === "up" ? -1 : 1) + prompt.items.length) % prompt.items.length;
      return;
    }
    if (event.name === "enter") {
      this.state.prompt = null;
      if (prompt.kind === "search") {
        this.state.search = prompt.text;
        this.findNext();
      } else {
        const chosen = prompt.items[prompt.index];
        if (chosen) this.runCommand(chosen);
      }
      return;
    }
    if (event.text !== undefined && !event.ctrl && !event.alt) this.promptType(event.text);
  }

  private commands(): string[] {
    return ["check (F5)", "files panel (F2)", "navigation panel (F3)", "reading mode (v)", "edit (i)", "merge proposal (m)", "keys (?)", "quit (q)", ...this.state.files.map((file) => `open ${file}`)];
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

  // ---------- merge ----------

  /**
   * Opens `.keylang/proposals/<path>` of the current file (or the first one)
   * as a MERGE diff against the file on disk. Proposals that break the
   * format's limits are ignored with the reason.
   */
  private openProposal(): void {
    const proposals = this.scanProposals();
    this.state.proposals = proposals;
    const ignored = this.proposalFiles()
      .map((file) => ({ file, problem: this.proposalProblem(file) }))
      .filter((item) => item.problem !== null);
    const path = proposals.find((file) => file === this.state.current) ?? proposals[0];
    if (!path) {
      this.state.message = ignored.length > 0 ? `proposal ignored: ${ignored.map((item) => `${item.file} (${item.problem})`).join("; ")}` : `no proposals under ${PROPOSALS_DIR}/`;
      return;
    }
    const buffer = this.load(path);
    if (path !== this.state.current) this.open(path, { line: 0, col: 0 });
    // The proposal changes the file on disk; unsaved edits would show up as hunks that revert them.
    if (buffer.text !== buffer.saved) {
      this.state.message = `${path} has unsaved changes: save (Ctrl+S) or undo them before merging its proposal`;
      return;
    }
    const disk = readText(resolve(this.state.root, path));
    const proposed = lf(readFileSync(join(this.state.root, PROPOSALS_DIR, path), "utf8"));
    this.startMerge(path, "proposal", splitEol(disk ?? "").text.split("\n"), proposed.split("\n"), disk);
  }

  private startMerge(path: string, origin: MergeState["origin"], base: string[], proposed: string[], disk: string | null): void {
    const hunks = diffLines(base, proposed);
    if (hunks.length === 0) {
      this.state.message = "the proposal matches the file; nothing to merge";
      if (origin === "proposal") rmSync(join(this.state.root, PROPOSALS_DIR, path), { force: true });
      this.state.proposals = this.scanProposals();
      return;
    }
    this.state.merge = { path, origin, base, disk, hunks, decisions: hunks.map(() => "pending"), history: [], current: 0, top: Math.max(0, hunks[0]!.baseStart - 3) };
    this.state.mode = "merge";
    this.state.hover = null;
    this.state.completion = null;
  }

  private mergeKey(event: KeyEvent): void {
    const merge = this.state.merge;
    if (!merge) return;
    const focus = (index: number): void => {
      merge.current = Math.max(0, Math.min(merge.hunks.length - 1, index));
      const hunk = merge.hunks[merge.current]!;
      // Rows before the hunk: base lines plus the added lines of earlier hunks.
      let row = hunk.baseStart;
      for (let i = 0; i < merge.current; i++) row += merge.hunks[i]!.lines.length;
      merge.top = Math.max(0, row - 3);
    };
    const nextPending = (): void => {
      const after = merge.decisions.findIndex((decision, index) => index > merge.current && decision === "pending");
      const any = merge.decisions.findIndex((decision) => decision === "pending");
      if (after !== -1) focus(after);
      else if (any !== -1) focus(any);
    };
    switch (event.name) {
      case "a":
      case "r":
        merge.history.push({ hunk: merge.current, previous: merge.decisions[merge.current]! });
        merge.decisions[merge.current] = event.name === "a" ? "accepted" : "rejected";
        nextPending();
        return;
      case "u": {
        const last = merge.history.pop();
        if (last === undefined) {
          this.state.message = "no decision to undo";
          return;
        }
        merge.decisions[last.hunk] = last.previous;
        focus(last.hunk);
        return;
      }
      case "n":
      case "down":
      case "j":
        return focus(merge.current + 1);
      case "N":
      case "up":
      case "k":
        return focus(merge.current - 1);
      case "w":
        return this.writeMerge();
      case "escape":
      case "q":
        this.state.merge = null;
        this.state.mode = "view";
        this.state.message = "merge cancelled; nothing written";
        return;
      case "?":
        this.state.help = true;
        return;
      default:
        return;
    }
  }

  private leaveMerge(merge: MergeState, message: string): void {
    this.state.merge = null;
    this.state.mode = merge.origin === "text-to-spec" ? "edit" : "view";
    this.state.message = message;
    this.clampCursor();
  }

  /**
   * Applies the accepted hunks. A proposal file is the external change being
   * confirmed, so the result goes to disk; the proposal is removed once every
   * hunk is decided, and kept while some are pending. A `Ctrl+G` result goes
   * to the buffer, which `Ctrl+S` saves. Nothing is written over a file that
   * changed since the merge began.
   */
  private writeMerge(): void {
    const merge = this.state.merge!;
    const buffer = this.load(merge.path);
    const accepted = merge.decisions.filter((decision) => decision === "accepted").length;
    const pending = merge.decisions.filter((decision) => decision === "pending").length;
    const base = merge.base.join("\n");
    const result = applyHunks(merge.base, merge.hunks, merge.decisions).join("\n");
    if (merge.origin === "text-to-spec") {
      if (buffer.text !== base) return this.leaveMerge(merge, `${merge.path} changed during the merge; nothing applied — press Ctrl+G again`);
      if (accepted === 0) return this.leaveMerge(merge, "merge: nothing accepted; the buffer is unchanged");
      buffer.undo.push({ text: base, cursor: { ...this.state.cursor } });
      buffer.text = result;
      buffer.doc = docOf(buffer.path, result);
      this.state.lastMerge = { path: merge.path, before: base, after: result, disk: null, proposal: null };
      this.leaveMerge(merge, `merge: ${accepted} of ${merge.hunks.length} hunk(s) applied; u undoes`);
      this.reanalyzeSoon();
      return;
    }
    if (accepted === 0 && pending > 0) {
      this.state.message = "nothing accepted yet: a accepts, r rejects; the proposal is kept until every hunk is decided (Esc leaves)";
      return;
    }
    const abs = resolve(this.state.root, merge.path);
    if (readText(abs) !== merge.disk) return this.leaveMerge(merge, `${merge.path} changed on disk during the merge; nothing written — press m to compare again`);
    if (buffer.text !== buffer.saved) return this.leaveMerge(merge, `${merge.path} has unsaved changes; nothing written`);
    const proposalAbs = join(this.state.root, PROPOSALS_DIR, merge.path);
    const proposalText = readText(proposalAbs);
    let disk: { before: string | null; after: string } | null = null;
    if (accepted > 0) {
      const after = withEol(result, buffer.eol);
      writeAtomic(abs, after);
      buffer.disk = after;
      disk = { before: merge.disk, after };
      buffer.undo.push({ text: buffer.text, cursor: { ...this.state.cursor } });
      buffer.text = result;
      buffer.saved = result;
      buffer.doc = docOf(buffer.path, result);
    }
    const consumed = pending === 0;
    if (consumed) rmSync(proposalAbs, { force: true });
    this.state.proposals = this.scanProposals();
    this.state.lastMerge = { path: merge.path, before: accepted > 0 ? base : buffer.text, after: buffer.text, disk, proposal: consumed && proposalText !== null ? { abs: proposalAbs, text: proposalText } : null };
    const written = accepted > 0 ? ` and written to ${merge.path}` : "";
    const kept = consumed ? "" : `; ${pending} pending hunk(s) stay in the proposal`;
    this.leaveMerge(merge, `merge: ${accepted} of ${merge.hunks.length} hunk(s) applied${written}${kept}; u undoes`);
    this.reanalyze();
  }

  /** Undoes the last merge while the file still holds its result, on disk too, and restores a consumed proposal. */
  private undoMerge(): void {
    const last = this.state.lastMerge;
    if (!last) {
      this.state.message = "no merge to undo";
      return;
    }
    const buffer = this.load(last.path);
    const abs = resolve(this.state.root, last.path);
    if (buffer.text !== last.after || (last.disk !== null && readText(abs) !== last.disk.after)) {
      this.state.lastMerge = null;
      this.state.message = `${last.path} changed after the merge; u no longer applies (Ctrl+Z in edit mode undoes edits)`;
      return;
    }
    if (last.disk) {
      if (last.disk.before === null) rmSync(abs, { force: true });
      else writeAtomic(abs, last.disk.before);
      buffer.saved = last.before;
      buffer.disk = last.disk.before;
    }
    if (last.proposal) writeAtomic(last.proposal.abs, last.proposal.text);
    buffer.text = last.before;
    buffer.doc = docOf(buffer.path, last.before);
    this.state.lastMerge = null;
    this.state.proposals = this.scanProposals();
    this.state.message = `merge undone in ${last.path}${last.proposal ? "; the proposal is back" : ""}`;
    this.clampCursor();
    this.reanalyze();
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
    this.startMerge(buffer.path, "text-to-spec", lines, proposed, null);
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
  const rank = (file: string): number => (file === CONFIG_FILE ? 2 : analysis?.docs.find((doc) => doc.path === file)?.generated != null || /(^|\/)map\//.test(file) ? 1 : 0);
  return [...new Set(files)].sort((a, b) => rank(a) - rank(b) || compareText(a, b));
}

/** The parsed spec of a buffer; `keylang.json` is plain text. */
function docOf(path: string, text: string): Document | null {
  return extname(path) === ".md" ? parse(path, text) : null;
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

function lf(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

/**
 * A file's text with `\n` line ends, and the ending a save restores. Only a
 * file that uses CRLF throughout is converted; mixed endings stay as they
 * are, so a save does not touch lines nobody edited.
 */
function splitEol(raw: string): { text: string; eol: Buffer["eol"] } {
  const crlf = raw.split("\r\n").length - 1;
  const lfs = raw.split("\n").length - 1;
  return crlf > 0 && crlf === lfs ? { text: lf(raw), eol: "\r\n" } : { text: raw, eol: "\n" };
}

function withEol(text: string, eol: Buffer["eol"]): string {
  return eol === "\n" ? text : text.replace(/\n/g, eol);
}

function readText(abs: string): string | null {
  try {
    return readFileSync(abs, "utf8");
  } catch {
    return null;
  }
}

/**
 * Writes through a temporary file and a rename, so a crash never leaves half
 * a spec; a missing directory is created. A symlinked file is written at its
 * target, so the link stays.
 */
function writeAtomic(abs: string, text: string): void {
  const target = linkTarget(abs);
  mkdirSync(dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  // The new file keeps the permissions of the one it replaces.
  const mode = existsSync(target) ? statSync(target).mode & 0o7777 : undefined;
  try {
    writeFileSync(temporary, text, mode === undefined ? {} : { mode });
    if (mode !== undefined) chmodSync(temporary, mode);
    renameSync(temporary, target);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

/** Where a write to `abs` lands: through a symlink (even one whose target does not exist yet) to its target. */
function linkTarget(abs: string): string {
  let path = abs;
  for (let hops = 0; hops < 32; hops++) {
    let link: string;
    try {
      if (!lstatSync(path).isSymbolicLink()) return path;
      link = readlinkSync(path);
    } catch {
      return path;
    }
    path = resolve(dirname(path), link);
  }
  return path;
}

/** `abs` with its longest existing prefix resolved through links; the rest of the path does not exist yet. */
function realPrefix(abs: string): string {
  let dir = abs;
  const rest: string[] = [];
  while (!existsSync(dir)) {
    const parent = dirname(dir);
    if (parent === dir) return abs;
    rest.unshift(relative(parent, dir));
    dir = parent;
  }
  return join(realpathSync(dir), ...rest);
}
