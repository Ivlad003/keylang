// One TUI session: state, input handling, and the analysis behind it. A
// transport (terminal or WebSocket) attaches a `Surface`, feeds raw input and
// sizes, and gets ANSI frames back; the session does not know which one it is,
// except that only a terminal can hand the screen to `$EDITOR` or stop the
// process on Ctrl+Z. While the screen is handed away the transport detaches
// the surface: nothing is drawn until it attaches again, which repaints the
// whole frame.
//
// Analysis is the shared `analyze()` with the unsaved buffers as an overlay.
// It runs in the background: the UI keeps answering, shows "updating" and
// dims the old marks, a result of a superseded generation is dropped, and a
// failed run keeps the old marks outdated with a persistent reason.
// `keylang.json` is read from disk before every run: without it the session
// opens on a start screen and analyses only after Browse, with a guessed
// configuration and no writes; an invalid one is opened as text with the
// reason, and the analyzer does not run until a saved fix parses.
// MERGE lives in `merge-session.ts`; ghost text, voice and the agent's draft
// in `assist.ts`; the forms of the operations in `forms/` and the keys every
// prompt shares in `prompt-keys.ts`; the zoom screen in `zoom-screen.ts`; the
// F6 panel in `results-panel.ts`, with what each record shows in `reports/`.
// This class dispatches input to them and keeps the editor, the analysis and
// the session's one explicit operation with its save step and commit.

import { existsSync, lstatSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { basename, extname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { analyze, within, type Analysis, type AnalysisRequest } from "../analyze.ts";
import { CONFIG_FILE, guessLayout, loadConfig, parseConfig, specPath, toPosix, withLayers } from "../config.ts";
import { collectMdFiles } from "../files.ts";
import { sectionNodes, walk, type Document, type Node } from "../ir.ts";
import { completions, definition, hoverContent, references, runsText, targetAt, workspace, type LspPosition, type Workspace } from "../lsp-features.ts";
import { contextPack, contextText, type ContextPack } from "../agent-context.ts";
import type { CheckResult } from "../check-results.ts";
import { formatSummary, summarizeNode } from "../explain-node.ts";
import { codeExplanation, isDiagnosticCode, nodeExplanation, unknownIdMessage, type SavedAnswer } from "../explain-offline.ts";
import { selectedAgent } from "../agent-cli.ts";
import { explainDir, explanationPath, loadBriefs } from "../explanations.ts";
import { FACT_CACHE_FILE } from "../fact-cache.ts";
import { baselinePath } from "../baseline.ts";
import { HARNESS_PATHS } from "../harness.ts";
import { EXPLAINED_MAP_DIR } from "../map.ts";
import { searchNodes } from "../node-search.ts";
import { PROPOSALS_DIR } from "../proposals.ts";
import { featureReportOf, featureSlugOf, resultWithout, runOperation, WIRE_OUT, WRITING_KINDS, type CommitGate, type CommitPlan, type DraftFlowRequest, type OperationContext, type OperationRequest, type OperationResult } from "../operations.ts";
import { defaultMicrophone } from "../voice-local.ts";
import { compareText } from "../span.ts";
import { actionLabel, applyRecord, catalog, matchActions, MERGE_CLICK, MERGE_REASON, NO_AGENT_REASON, noSnapshotReason, START_ACTIONS } from "./actions.ts";
import { Assist, countSuggestion, type Microphone } from "./assist.ts";
import { OperationWorker } from "./background.ts";
import { chatTakesKeys, Clip, newClip } from "./clip.ts";
import { ClipChat } from "./clip-chat.ts";
import { newFailsAfter, openQuestions } from "./clip-questions.ts";
import { placeClip, placeOf, readPlace, writePlace } from "./clip-memory.ts";
import { bufferLines, isDirty, lineLayout, newBuffer, newFileBuffer, setText } from "./buffer.ts";
import { readText, splitEol, withEol, writeInside } from "./disk.ts";
import { defaultSpecPath, flowNameProblem, newSpecProblem, SPEC_KINDS, specTemplate, suggestedFlowName } from "./new-spec.ts";
import { DEFAULT_FILTER, findingsOf, sameResult, visibleFindings } from "./findings.ts";
import { InputDecoder, type InputEvent, type KeyEvent, type MouseEvent } from "./input.ts";
import { mergeRows } from "./merge.ts";
import { errorText, MergeSession, type ProposalEntry } from "./merge-session.ts";
import { codeDraftFormOf, codeDraftTarget, DraftForms, flowDraftTarget, rulesDraftTarget, specCodePlace } from "./forms/draft.ts";
import { ExplainForms } from "./forms/explain.ts";
import { ExportForms } from "./forms/export.ts";
import type { FormHost } from "./forms/host.ts";
import { RunForms } from "./forms/run.ts";
import { ResultsPanel } from "./results-panel.ts";
import { ZoomScreen } from "./zoom-screen.ts";
import { NODE_HITS, noteOfSelection, promptKey, typeInto, type PromptKeys } from "./prompt-keys.ts";
import { renderDiff, type Grid } from "./screen.ts";
import type { Buffer, ConfigState, Cursor, Hover, Mode, NewSpecForm, OperationRecord, Prompt, State } from "./state.ts";
import { evidenceOf } from "./evidence.ts";
import { textToSpec } from "./text-to-spec.ts";
import { operationLabel, recordSummary } from "./reports/records.ts";
import { clipOnScreen, contextTop, editorRows, filesTop, gutterWidth, helpScrollMax, layout, navEntries, navListHeight, PANEL_MIN_COLS, readCursorRow, render } from "./view.ts";
import { clusterAt, clusterAtCell, graphemes, padWidth, scrollToFit, stringWidth } from "./width.ts";

export interface Surface {
  write(ansi: string): void;
  /**
   * Terminal only: open a file in `$EDITOR` (a terminal editor gets the screen). Resolves to what the status
   * line should say — the window a GUI editor opened, an editor that did not start — or null.
   */
  openEditor?: (abs: string, line: number) => Promise<string | null>;
  /** Terminal only: stop the process as a shell's Ctrl+Z does; the screen is restored first and repainted when it continues. */
  suspend?: () => void;
}

export type Analyzer = (request: AnalysisRequest) => Promise<Analysis>;

/** Runs one explicit operation; the session's default is the shared `runOperation`. Tests inject a gated one. */
export type OperationRunner = (request: OperationRequest, context: OperationContext) => Promise<OperationResult>;

export interface AppOptions {
  root: string;
  cols: number;
  rows: number;
  analyzer?: Analyzer;
  /** Replaces every operation runner (tests inject a gated one); default: doctor here, the rest in `operationWorker`. */
  operations?: OperationRunner;
  /** The worker that runs feature and map-check; the session owns it and closes it. Default: one started on first use. */
  operationWorker?: OperationWorker;
  onQuit?: () => void;
  /**
   * Microphone PCM (16 kHz, mono, s16le) until `stop` is called or the source
   * ends; null: no microphone. Default: the optional `decibri`. `keylang web`
   * passes the browser's microphone; tests pass recorded PCM.
   */
  microphone?: Microphone;
  /** The user's home: `~/.config/keylang/tui.json` there keeps the clip's place. Default: the home directory of the process's user; tests pass a temporary one. */
  home?: string;
}

/** Changes typed together are analysed once. */
const SETTLE_MS = 120;
/** A lone ESC, or a cluster that may go on, waits this long for the rest of its sequence. */
const ESC_MS = 25;
/** A bracketed paste whose end marker has not come within this pause is ended by hand. */
const PASTE_MS = 1000;
/** The largest frame a session draws; a bigger size from a client is cut to it. */
export const MAX_COLS = 1000;
export const MAX_ROWS = 400;
/** At most this many of one key in one chunk are a key held down (auto-repeat); more are pasted text. */
const HELD_KEYS = 32;
/** Outside the editor, at most this many keys of one chunk are keys typed while the session was busy; more are pasted text. */
const TYPED_KEYS = 8;
/** Keys handled before the mode: they show panels and the clip's chat and reanalyse, and never edit. */
const PANEL_KEYS = new Set(["f2", "f3", "f4", "f5", "f6", "f7"]);

export class App {
  readonly state: State;
  private surface: Surface | null = null;
  private previous: Grid | null = null;
  private readonly decoder = new InputDecoder();
  private readonly analyzer: Analyzer;
  private readonly operations: OperationRunner;
  /** Created on the first operation that needs it; closed with the session. */
  private operationWorker: OperationWorker | null;
  /** Cancels the running operation: its record turns cancelled now, a late result is dropped. Null when none runs. */
  private cancelActive: (() => void) | null = null;
  private readonly onQuit: () => void;
  private readonly merges: MergeSession;
  private readonly assist: Assist;
  /** The forms of the draft operations: flow, rules, layers, code-to-spec and spec-to-code. */
  private readonly drafts: DraftForms;
  /** The explain forms: offline, with the model, and the inventory with its batch. */
  private readonly explains: ExplainForms;
  /** The forms of the operations that read the repository as it is saved: feature, baseline, agents, init, fmt, parse, wire, check, an edge, a trace plan. */
  private readonly runs: RunForms;
  /** The export forms: a report to a file, and the C4 diagram. */
  private readonly exports: ExportForms;
  /** The zoom screen's keys and pointer. */
  private readonly zoomScreen: ZoomScreen;
  /** The F6 panel's keys. */
  private readonly results: ResultsPanel;
  /** The clip in the editor's corner and its chat window: their pointer and keys. */
  private readonly clip: Clip;
  /** What the clip answers in its chat: commands, and the model's reply as the session's operation. */
  private readonly chat: ClipChat;
  /** The user's home, where `~/.config/keylang/tui.json` keeps the clip's place. */
  private readonly home: string;
  private escTimer: NodeJS.Timeout | null = null;
  private settleTimer: NodeJS.Timeout | null = null;
  private generation = 0;
  /** What each layout draft was made against (by record id): its layers move into keylang.json's buffer only while that still holds. */
  private layoutBases = new Map<number, LayoutBasis>();
  /** Bumped on every buffer change; an analysis started before the last one is outdated on arrival. */
  private edits = 0;
  private running = 0;
  private waiters: (() => void)[] = [];
  private closed = false;
  /** The id of the next operation record. */
  private nextRecord = 1;
  /** The newest feature-line refresh: a base that arrives for an older one is dropped. */
  private featureLineRequest = 0;
  /** The proposals list as scanned when it was opened or last refreshed; Enter scans again. */
  private proposalEntries: ProposalEntry[] = [];
  /** What the open save step starts after Save and continue; null when none is open. */
  private afterSave: (() => void) | null = null;
  /** Which dirty buffers the open save step lists: the inputs its operation reads. */
  private barrierInputs: (path: string) => boolean = () => true;
  /**
   * The record whose operation is writing files now (between `beforeCommit`
   * and its result), or null. Meanwhile an analysis is not started or
   * adopted, and saves and merge writes wait: the report after the commit
   * describes the disk as it is then.
   */
  private committing: number | null = null;
  /** How messages name the committing operation (`map write`). */
  private committingLabel = "an operation";
  /** An analysis was asked for during a commit: it runs when the commit ends. */
  private analysisAfterCommit = false;
  /** The workspace `live()` built last, with what it was built from: the analysis and each buffer at its version. */
  private liveWorkspace: { analysis: Analysis; buffers: Buffer[]; versions: number[]; ws: Workspace } | null = null;
  /** The rows of the last hover, for its workspace, file and target (or position off any target). */
  private lastHover: { ws: Workspace; path: string; key: string; lines: Hover["lines"] | null } | null = null;

  constructor(options: AppOptions) {
    this.analyzer = options.analyzer ?? analyze;
    this.operationWorker = options.operationWorker ?? null;
    // Doctor only reads settings and probes optional native modules: it stays here. Feature and
    // map-check analyse the whole repository in the worker, which has no fallback to this thread.
    this.operations = options.operations ?? ((request, context) => (request.kind === "doctor" ? runOperation(request, context) : this.worker().run(request, context)));
    this.onQuit = options.onQuit ?? (() => {});
    this.home = options.home ?? homedir();
    this.state = {
      root: options.root,
      config: { kind: "configured" },
      start: null,
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
      lastPanel: "nav",
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
      helpTop: 0,
      back: [],
      message: null,
      proposals: [],
      context: { open: false, index: 0, added: [], removed: new Set() },
      ghost: null,
      search: null,
      quitArmed: false,
      records: [],
      activeOperation: null,
      barrier: null,
      quit: null,
      results: { open: false, entry: "record", index: 0, finding: 0, gap: 0, filter: { ...DEFAULT_FILTER }, top: 0, left: 0, scrollReport: false, viewing: false, origin: null, previousFocus: "editor" },
      briefs: new Map(),
      zoom: null,
      featureLine: null,
      clip: newClip(),
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
        track: (work) => this.track(work),
        settled: () => this.wake(),
        draw: () => this.draw(),
      },
      options.microphone ?? defaultMicrophone,
    );
    const forms: FormHost = {
      state: this.state,
      specDir: () => this.specDir(),
      proposalDir: () => this.merges.specDir(),
      agentName: () => this.agentName(),
      contextPack: () => this.contextPack(),
      dirtyInputs: () => this.dirtyInputs(),
      generatedDoc: (path) => this.generatedDoc(path),
      proposalWaiting: (path) => this.proposalWaiting(path),
      buffer: () => this.buffer(),
      idAtCursor: () => this.idAtCursor(),
      flowAtCursor: () => this.flowAtCursor(),
      triggerAtCursor: () => this.triggerAtCursor(),
      plannedFns: () => this.plannedFns(),
      requestOperation: (action, request) => this.requestOperation(action, request),
      startOperation: (action, request) => this.startOperation(action, request),
      track: (work) => this.track(work),
      draw: () => this.draw(),
    };
    this.drafts = new DraftForms(forms);
    this.explains = new ExplainForms(forms);
    this.runs = new RunForms(forms);
    this.exports = new ExportForms(forms);
    this.zoomScreen = new ZoomScreen({
      state: this.state,
      goToNode: (id) => this.goToNode(id),
      goToSpec: (id) => this.goToSpec(id),
      open: (path, cursor) => this.open(path, cursor),
      jump: (abs, line) => this.jump(abs, line),
      explainLines: (id, found) => this.explainLines(id, found),
      openNodeSearch: () => this.openNodeSearch(),
      openPalette: () => this.openPalette(),
      requestOperation: (action, request) => this.requestOperation(action, request),
    });
    this.chat = new ClipChat({
      state: this.state,
      buffer: () => this.buffer(),
      idAtCursor: () => this.idAtCursor(),
      contextPack: () => this.contextPack(),
      startOperation: (action, request, then) => this.startOperation(action, request, then),
      requestOperation: (action, request, then) => this.requestOperation(action, request, then),
      cancelOperation: () => this.cancelOperation(),
      track: (work) => this.track(work),
      proposalDir: () => this.merges.specDir(),
      generatedDoc: (path) => this.generatedDoc(path),
      proposalWaiting: (path) => this.proposalWaiting(path),
      rescanProposals: () => {
        this.state.proposals = this.merges.scan();
      },
    });
    this.clip = new Clip({
      state: this.state,
      editor: () => layout(this.state).editor,
      clipOnScreen: () => clipOnScreen(this.state),
      said: (text) => this.chat.said(text),
      cancelReply: () => this.chat.cancel(),
      opened: () => this.chat.opened(),
      placed: () => this.keepPlace(),
    });
    this.results = new ResultsPanel({
      state: this.state,
      reanalyze: () => this.reanalyze(),
      quit: () => this.quit(),
      requestOperation: (action, request) => this.requestOperation(action, request),
      cancelOperation: () => this.cancelOperation(),
      openMerge: (path) => this.merges.open(path),
      openProposals: (prefer) => this.openProposals(prefer),
      moveLayers: (record) => this.moveLayers(record),
      applyCandidate: (record) => this.applyCandidate(record),
      askFeatureQuestions: (slug) => this.askFeatureQuestions(slug),
      openExport: () => this.exports.openExportPrompt(),
      openSpecCode: (id) => this.drafts.openSpecCode(id),
      plannedFns: () => this.plannedFns(),
      load: (path) => this.load(path),
      open: (path, cursor, remember) => this.open(path, cursor, remember),
      showCode: (rel, abs, line) => this.showCode(rel, abs, line),
      clampCursor: () => this.clampCursor(),
    });
    // The first frame comes from disk, before any analysis: a cold start shows text at once.
    this.state.files = this.diskFiles();
    const first = this.state.files.find((file) => file.includes("/flows/")) ?? this.state.files[0];
    if (first) this.open(first, { line: 0, col: 0 }, false);
    this.state.proposals = this.merges.scan();
    // The clip's memory (ADR 0021): where the person left it and its window, and today's conversation.
    this.restorePlace();
    this.chat.restore();
    const { config, clip } = configState(this.state.root);
    this.state.config = config;
    if (clip !== null) this.state.clip.enabled = clip;
    // No config: the start screen, and no analysis until Browse (design §2.1). Invalid: its text, at the field.
    if (config.kind === "missing-config") this.state.start = 0;
    else if (config.kind === "invalid-config") this.openConfig(config.reason, false);
    else this.reanalyze();
  }

  /** The clip's place from tui.json as the session starts; a file it cannot use is said once and left as it is until a drag. */
  private restorePlace(): void {
    const { place, problem } = readPlace(this.home);
    placeClip(this.state.clip, place);
    if (problem !== null) this.state.message = `${problem}; ignored: the clip and its window start where they do by default, and the first drag rewrites the file`;
  }

  /** A drag, a keyboard move or a resize of the clip or its window ended, or they were put back: tui.json keeps the place. */
  private keepPlace(): void {
    try {
      writePlace(this.home, placeOf(this.state.clip));
    } catch (error) {
      this.state.message = `the clip's place is not kept: ${errorText(error)}`;
    }
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
    // Below 60 columns no side panel is drawn: a focused one gives the focus back, so keys never go to a list nobody sees.
    const focus = this.state.focus;
    if ((focus === "files" || focus === "nav" || focus === "context") && !this.drawable(focus)) this.state.focus = "editor";
    this.keepVisible();
    this.draw();
  }

  input(chunk: string): void {
    // A closed session takes no keys: nothing may start an analysis, a save or an operation after it.
    if (this.closed) return;
    if (this.escTimer) clearTimeout(this.escTimer);
    this.escTimer = null;
    const events = this.decoder.feed(chunk);
    for (let i = 0; i < events.length; ) {
      const typed = typedRun(events, i);
      // In the clip's chat a pasted line break is a space but Enter sends: an Enter that ends the chunk
      // (typed keys coalesced with it) is left out of the paste and sends the line after it.
      const chat = chatTakesKeys(this.state);
      const run = chat && typed.length > 1 && typed.at(-1)!.name === "enter" ? typed.slice(0, -1) : typed;
      if (run.length > 1 && !this.state.prompt && !this.state.completion && !this.state.help && !(this.state.results.open && !this.state.results.viewing) && pastedRun(run, this.state.mode === "edit" || chat)) {
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
    // Whatever path the event took (Esc, a click on another file, MERGE, a panel), a ghost request for a place left is aborted.
    this.assist.cancelStaleGhost();
  }

  /** The current frame, as the transport would show it. */
  frame(): Grid {
    return this.paint();
  }

  /** Files with unsaved changes. */
  unsaved(): string[] {
    return [...this.state.buffers.values()].filter(isDirty).map((buffer) => buffer.path);
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
    this.chat.close();
    this.surface = null;
    // A running operation is cancelled and the worker ends: before a commit at once, during one after its
    // current file step (a signal's end of the session waits for that write, not for a rollback).
    this.state.quit = null;
    this.cancelActive?.();
    this.operationWorker?.close();
    this.wake();
  }

  private draw(): void {
    if (!this.surface) return;
    const grid = this.paint();
    this.surface.write(renderDiff(this.previous, grid));
    this.previous = grid;
  }

  /** The frame of the state now. The clip's counter follows what it counts — the analysis, the open file, the chat — so it is counted here (spec §4.6). */
  private paint(): Grid {
    this.state.clip.questions = openQuestions(this.state).length;
    return render(this.state);
  }

  // ---------- analysis ----------

  private overlay(): Map<string, string> {
    const overlay = new Map<string, string>();
    // The configuration always comes from disk: unparsed text of a dirty `keylang.json` is no overlay.
    for (const buffer of this.state.buffers.values()) if (!buffer.readOnly && buffer.path !== CONFIG_FILE && isDirty(buffer)) overlay.set(resolve(this.state.root, buffer.path), buffer.text);
    return overlay;
  }

  /** `F5` or a save (`explicit`), or typing that settled: analyse now. */
  reanalyze(explicit = true): void {
    if (this.closed) return;
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = null;
    if (this.committing !== null) {
      this.analysisAfterCommit = true;
      this.state.message = `${this.committingLabel} is writing files: the analysis runs when it finishes`;
      return;
    }
    if (!this.readConfig(explicit)) return;
    const generation = ++this.generation;
    const edits = this.edits;
    this.state.updating = true;
    this.running++;
    this.analyzer({ root: this.state.root, overlay: this.overlay() })
      .then(
        (analysis) => {
          if (generation !== this.generation || this.closed) return;
          const selected = this.results.selectedFinding();
          const previous = this.state.analysis;
          this.state.analysis = analysis;
          // The clip counts the fails this analysis added (spec §4.6).
          this.state.clip.newFails = newFailsAfter(this.state.clip.newFails, previous, analysis);
          try {
            this.adoptResult(analysis, edits, selected);
          } catch (error) {
            this.state.message = `error: ${errorText(error)}`;
          }
        },
        (error: unknown) => {
          if (generation !== this.generation || this.closed) return;
          // Keep the last useful report, but never let it pass as current again:
          // it stays outdated with the persistent reason until a new generation succeeds.
          this.state.updating = false;
          this.state.outdated = true;
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

  /**
   * Reads `keylang.json` again before a run. False: it is invalid, and the
   * analyzer is not run — it would only fail with the same error again. The
   * last report stays outdated; a run in flight (on the old config) is dropped.
   */
  private readConfig(explicit: boolean): boolean {
    const before = this.state.config;
    const { config, clip } = configState(this.state.root);
    this.state.config = config;
    if (clip !== null) this.state.clip.enabled = clip;
    if (config.kind !== "invalid-config") return true;
    this.generation++;
    this.state.updating = false;
    this.state.outdated = this.state.analysis !== null;
    const changed = before.kind !== "invalid-config" || before.reason !== config.reason;
    if (explicit || changed) this.state.message = `keylang.json is invalid: ${config.reason} — fix it and save (Ctrl+S); nothing was analysed`;
    // The config broke under an open session: show its text at the field, unless the user is typing elsewhere.
    if (before.kind !== "invalid-config" && this.state.current !== CONFIG_FILE && (this.state.mode === "view" || this.state.mode === "read")) this.openConfig(config.reason, true);
    return false;
  }

  /** Opens `keylang.json` as text with the cursor on the field (or the JSON position) the reason names. */
  private openConfig(reason: string, remember: boolean): void {
    const text = this.state.buffers.get(CONFIG_FILE)?.text ?? splitEol(readText(join(this.state.root, CONFIG_FILE)) ?? "").text;
    this.open(CONFIG_FILE, configErrorCursor(text, reason), remember);
  }

  /** The start screen's Browse: the current analysis with the guessed configuration; nothing is written. */
  private browse(): void {
    this.state.start = null;
    this.reanalyze();
  }

  /** Keys of the start screen: choose an item; the palette, help, F6 and quitting work as elsewhere. */
  private startKey(event: KeyEvent): void {
    const index = this.state.start ?? 0;
    if (event.name === "up" || event.name === "k") this.state.start = Math.max(0, index - 1);
    else if (event.name === "down" || event.name === "j") this.state.start = Math.min(START_ACTIONS.length - 1, index + 1);
    else if (event.name === "enter") this.runAction(START_ACTIONS[index]!);
    else if (event.name === "f5") this.browse();
    else if (event.text === ":") this.openPalette();
    else if (event.text === "?") this.state.help = true;
    else if (event.name === "q") this.quit();
  }

  private adoptResult(analysis: Analysis, edits: number, selected: CheckResult | undefined): void {
    this.state.updating = false;
    // Typing while it ran: the marks belong to older text and stay dimmed until the next run.
    this.state.outdated = edits !== this.edits;
    this.state.error = null;
    this.adopt(analysis);
    // The findings list follows the new analysis: the selected finding stays selected while it is still reported.
    const at = selected ? visibleFindings(findingsOf(analysis), this.state.results.filter).findIndex((result) => sameResult(result, selected)) : -1;
    if (at >= 0) this.state.results.finding = at;
    this.results.clampFinding();
  }

  /** Typing: mark results outdated now, analyse once the typing settles. */
  private reanalyzeSoon(): void {
    if (this.closed) return;
    this.edits++;
    this.state.outdated = true;
    this.inputsChanged("inputs edited since this run");
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      this.reanalyze(false);
    }, SETTLE_MS);
  }

  /**
   * Async work of a helper (a model, a microphone, an operation's result):
   * `idle()` waits for it, and the frame follows it. Work that fails is a
   * message, as a key that fails is (`safely`): never an unhandled rejection,
   * which would end a terminal session and every session of `keylang web`.
   */
  private track(work: Promise<void>): void {
    this.running++;
    void work
      .catch((error: unknown) => {
        if (!this.closed) this.state.message = `error: ${errorText(error)}`;
      })
      .finally(() => {
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
    const explained = [...(analysis.map?.explained?.keys() ?? [])].map((name) => specPath(analysis.config.dir, `${EXPLAINED_MAP_DIR}/${name}`));
    // A new specification is listed from the moment its buffer opens, before any file exists.
    const fresh = [...this.state.buffers.values()].filter((buffer) => buffer.newFile).map((buffer) => buffer.path);
    const paths = new Set([...this.diskFiles(), ...analysis.docs.map((doc) => doc.path), ...explained, ...fresh]);
    this.state.files = sortFiles([...paths], analysis);
    this.state.briefs = loadBriefs(analysis.config);
    const ws = workspace(this.state.root, analysis, new Map());
    for (const buffer of this.state.buffers.values()) {
      if (isDirty(buffer)) continue;
      const fresh = ws.text(buffer.path);
      const text = fresh === null ? buffer.text : splitEol(fresh).text;
      // The explained map is no spec, so the analysis has no document of it: its marker decides.
      const doc = analysis.docs.find((d) => d.path === buffer.path);
      buffer.readOnly = doc ? doc.generated !== null : buffer.doc?.generated != null;
      if (text !== buffer.text) {
        setText(buffer, text);
        buffer.saved = text;
        buffer.disk = readText(resolve(this.state.root, buffer.path));
        this.inputsChanged(`${buffer.path} changed on disk since this run`);
      }
    }
    // A snapshot other than the one a result was computed on: the code changed under it.
    const snapshotId = analysis.snapshot?.snapshotId ?? null;
    for (const record of this.state.records) {
      const result = record.result;
      const computedOn =
        result?.kind === "feature" || result?.kind === "map-check" || (result?.kind === "baseline" && result.payload?.check === true)
          ? (result.payload?.snapshot ?? undefined)
          : result?.kind === "check" || result?.kind === "explain-edge" || result?.kind === "explain" || result?.kind === "explain-llm" || result?.kind === "explain-plan" || result?.kind === "explain-batch"
            ? (result.payload?.snapshotId ?? undefined)
            : result?.kind === "trace-plan"
              ? (result.payload?.plan.snapshotId ?? undefined)
              : result?.kind === "entries"
                ? (result.payload?.snapshotId ?? undefined)
                : undefined;
      if (computedOn !== undefined && computedOn !== snapshotId) record.outdated ??= "the code snapshot changed since this run";
    }
    if (this.state.current === null && this.state.files[0]) this.open(this.state.files[0], { line: 0, col: 0 }, false);
    this.state.proposals = this.merges.scan();
    this.clampCursor();
    this.refreshFeatureLine();
  }

  /**
   * The status line's `feature <stage> · questions <n>` of the current file
   * when it is a feature file (c4-zoom/11): its report on the session's
   * analysis against the plan at its base (the merge-base with the main
   * branch, else HEAD), as `keylang feature` computes it. It follows a save
   * and its analysis, never typing: while the buffer has unsaved edits the
   * last line stays.
   */
  private refreshFeatureLine(): void {
    const path = this.state.current;
    const analysis = this.state.analysis;
    const slug = path === null || analysis === null ? null : featureSlugOf(path, analysis.config.dir);
    const request = ++this.featureLineRequest;
    if (path === null || analysis === null || slug === null) {
      this.state.featureLine = null;
      return;
    }
    const buffer = this.state.buffers.get(path);
    if (buffer !== undefined && (buffer.newFile || isDirty(buffer))) {
      if (this.state.featureLine?.path !== path) this.state.featureLine = null;
      return;
    }
    // The plan at the base is read in the operation worker: the session's thread starts no git process.
    // A newer refresh (another analysis, another file) supersedes this one; an unknown base keeps the line.
    this.track(
      this.worker()
        .featureBase(this.state.root, path)
        .then((base) => {
          if (request !== this.featureLineRequest || this.closed || base === null) return;
          const report = featureReportOf(analysis, slug, base);
          this.state.featureLine = report === null ? null : { path, stage: report.stage, questions: report.gaps.filter((gap) => gap.kind === "question").length, gaps: report.gaps };
        }),
    );
  }

  /** Why a generated buffer takes no edits, naming its generator. */
  private readOnlyReason(path: string): string {
    return path === baselinePath({ dir: this.specDir() })
      ? `${path} is generated by \`keylang baseline\`; change the code, or write rules by hand in another rules file`
      : `${path} is generated by \`keylang map\`; change the code or the rules instead`;
  }

  /** The spec directory of the saved configuration (`keylang` when it cannot be read). */
  private specDir(): string {
    try {
      return loadConfig(this.state.root).dir;
    } catch {
      return "keylang";
    }
  }

  private diskFiles(): string[] {
    const dir = join(this.state.root, this.specDir());
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
    // Opening a file leaves the start screen; the analysis still waits for Browse or F5.
    this.state.start = null;
    // The place remembered is one in the editor: the code viewer and MERGE show what `Ctrl+O` cannot bring back,
    // and a `merge` mode without `state.merge` would take every key and answer none.
    if (remember && this.state.current) this.state.back.push({ path: this.state.current, cursor: { ...this.state.cursor }, mode: this.state.mode === "code" || this.state.mode === "merge" ? "view" : this.state.mode });
    this.load(path);
    this.state.current = path;
    this.state.cursor = { ...cursor };
    this.state.filesIndex = Math.max(0, this.state.files.indexOf(path));
    // The file is shown in the view: a screen over the editor goes. The zoom keeps its state, so `z` (or
    // Ctrl+O, when the place was remembered) comes back to it.
    if (this.state.mode === "code" || this.state.mode === "merge" || this.state.mode === "zoom") this.state.mode = "view";
    this.state.selection = null;
    this.state.completion = null;
    this.state.hover = null;
    this.clampCursor();
    this.state.top = Math.max(0, this.state.cursor.line - 3);
    this.keepVisible();
    if (this.state.featureLine?.path !== path) this.refreshFeatureLine();
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
    // Scrolled further than this line needs (a longer line was before it): back as far as its end still
    // fits, which keeps the cursor in view too, so a short line is never drawn blank.
    this.state.left = Math.min(this.state.left, scrollToFit(line, 0, line.clusters.length, textWidth));
  }

  private edit(change: (lines: string[], cursor: Cursor) => void, coalesce = false): void {
    const buffer = this.buffer();
    if (!buffer) return;
    if (buffer.readOnly) {
      this.state.message = this.readOnlyReason(buffer.path);
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
    if (this.writingNow()) return;
    // A new file is written only where nothing is yet: a file created meanwhile is never overwritten, however often Ctrl+S is pressed.
    const problem = buffer.newFile ? this.newFileProblem(buffer) : null;
    if (problem !== null) {
      this.state.message = `${buffer.path}: not saved: ${problem}; your text stays in this buffer`;
      return;
    }
    // Another editor or `git checkout` changed the file: the first Ctrl+S asks, the second overwrites.
    if (!buffer.newFile && this.changedOnDisk(buffer) && !buffer.overwrite) {
      buffer.overwrite = true;
      this.state.message = `${buffer.path} changed on disk since it was opened: Ctrl+S again overwrites it, Ctrl+Z undoes your edits`;
      return;
    }
    this.persist(buffer);
    this.state.message = `${buffer.path}: saved`;
    this.reanalyze();
  }

  private changedOnDisk(buffer: Buffer): boolean {
    return readText(resolve(this.state.root, buffer.path)) !== buffer.disk;
  }

  /**
   * Why the first save of a new specification may not happen, or null: the
   * path rules again (the configuration or a link may have changed since the
   * form), and the target must still not exist.
   */
  private newFileProblem(buffer: Buffer): string | null {
    // A new keylang.json (layers moved in without one) lands in the root, where nothing may be yet.
    if (buffer.path === CONFIG_FILE) return existsSync(resolve(this.state.root, CONFIG_FILE)) ? "the file was created on disk after this buffer opened; it is kept as it is" : null;
    const problem = newSpecProblem(this.state.root, this.merges.specDir(), buffer.path, (path) => this.generatedDoc(path));
    if (problem !== null) return problem;
    return existsSync(resolve(this.state.root, buffer.path)) ? "the file was created on disk after this buffer opened; it is kept as it is" : null;
  }

  /** The analysis knows `path` as a generated document. */
  private generatedDoc(path: string): boolean {
    return this.state.analysis?.docs.some((doc) => doc.path === path && doc.generated !== null) === true;
  }

  /** Writes the buffer's text with its line ending; the buffer is clean after. Throws when the write fails. */
  private persist(buffer: Buffer): void {
    const written = withEol(buffer.text, buffer.eol);
    if (buffer.newFile) {
      const problem = this.newFileProblem(buffer);
      if (problem !== null) throw new Error(problem);
    }
    // A save stays in the repository, even through a link whose target does not exist yet; a new spec stays in the spec directory.
    const boundary = buffer.newFile && buffer.path !== CONFIG_FILE ? resolve(this.state.root, this.merges.specDir()) : this.state.root;
    writeInside(boundary, resolve(this.state.root, buffer.path), written);
    buffer.saved = buffer.text;
    buffer.disk = written;
    buffer.newFile = false;
    buffer.overwrite = false;
    this.inputsChanged("inputs saved since this run");
  }

  /** The unsaved spec and config buffers, in path order: what an operation on the disk would not see. */
  private dirtyInputs(): string[] {
    return [...this.state.buffers.values()]
      .filter((buffer) => !buffer.readOnly && isDirty(buffer))
      .map((buffer) => buffer.path)
      .sort(compareText);
  }

  /**
   * Runs `run` on saved inputs (design §2.5). Without dirty buffers it runs at
   * once; with them the save step opens: Save and continue or Back. Every
   * operation that reads the disk goes through here; doctor and help do not.
   */
  private withSavedInputs(action: string, run: () => void, options: { writes?: string[]; writesNote?: string; inputs?: (path: string) => boolean } = {}): void {
    const inputs = options.inputs ?? (() => true);
    const files = this.dirtyInputs().filter(inputs);
    if (files.length === 0 && options.writes === undefined) return run();
    this.state.barrier = { action, files, writes: options.writes ?? null, writesNote: options.writesNote ?? null, choice: "save", error: null };
    this.afterSave = run;
    this.barrierInputs = inputs;
  }

  /** The keys of the save step: ←→/Tab choose, Enter does it, Esc is Back. */
  private barrierKey(event: KeyEvent): void {
    const barrier = this.state.barrier!;
    if (event.name === "left" || event.name === "right" || event.name === "tab" || event.name === "h" || event.name === "l") barrier.choice = barrier.choice === "save" ? "back" : "save";
    else if (event.name === "escape" || (event.name === "enter" && barrier.choice === "back")) this.leaveBarrier();
    else if (event.name === "enter") this.saveAndContinue();
  }

  /** Back: nothing is written and the operation does not start. */
  private leaveBarrier(): void {
    const action = this.state.barrier?.action ?? "the operation";
    this.state.barrier = null;
    this.afterSave = null;
    this.state.message = `${action}: not started; nothing was saved`;
  }

  /**
   * Saves the listed buffers one by one through the ordinary save path. The
   * first failure (a file changed on disk, a write error) stops: the step
   * stays open with the reason, the operation does not start, and the files
   * already saved stay saved — there is no rollback.
   */
  private saveAndContinue(): void {
    const barrier = this.state.barrier!;
    let saved = 0;
    for (const path of barrier.files) {
      const buffer = this.state.buffers.get(path);
      if (!buffer || buffer.readOnly || !isDirty(buffer)) continue;
      let problem: string | null = buffer.newFile ? this.newFileProblem(buffer) : null;
      if (problem !== null) problem = `${problem}; the text stays in its buffer`;
      else if (!buffer.newFile && this.changedOnDisk(buffer)) problem = "changed on disk since it was opened; open it to compare (Ctrl+S twice overwrites)";
      else {
        try {
          this.persist(buffer);
        } catch (error) {
          problem = errorText(error);
        }
      }
      if (problem !== null) {
        barrier.error = `${path}: ${problem}`;
        barrier.files = this.dirtyInputs().filter(this.barrierInputs);
        this.state.message = `${barrier.action}: not started; ${saved} file(s) saved, ${barrier.error}`;
        if (saved > 0) this.reanalyze(false);
        return;
      }
      saved++;
    }
    const run = this.afterSave;
    this.state.barrier = null;
    this.afterSave = null;
    this.reanalyze(false);
    run?.();
  }

  // ---------- positions and targets ----------

  /**
   * The workspace of the latest analysis, with this session's buffers as the
   * documents. The pointer asks for it on every cell it crosses: the same
   * analysis and the same buffers at the same versions give the one built last.
   */
  private live(): Workspace | null {
    const analysis = this.state.analysis;
    if (!analysis) return null;
    const buffers = [...this.state.buffers.values()];
    const last = this.liveWorkspace;
    if (last?.analysis === analysis && last.buffers.length === buffers.length && buffers.every((buffer, i) => last.buffers[i] === buffer && last.versions[i] === buffer.version)) return last.ws;
    const docs = analysis.docs.map((doc) => this.state.buffers.get(doc.path)?.doc ?? doc);
    for (const buffer of buffers) if (buffer.doc && !docs.some((doc) => doc.path === buffer.path)) docs.push(buffer.doc);
    const texts = new Map(buffers.map((buffer) => [resolve(this.state.root, buffer.path), buffer.text] as const));
    const ws = workspace(this.state.root, { ...analysis, docs }, texts);
    this.liveWorkspace = { analysis, buffers, versions: buffers.map((buffer) => buffer.version), ws };
    return ws;
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

  /**
   * The hover at a cursor, anchored at a cell. The rows are made once per
   * target (an ID or a link) and workspace — wherever on the target the
   * pointer is, they are the same — and once per position off any target.
   */
  private hoverAt(cursor: Cursor, x: number, y: number, source: Hover["source"]): Hover | null {
    const ws = this.live();
    const path = this.state.current;
    const doc = this.buffer()?.doc;
    if (!ws || !path || !doc) return null;
    const target = targetAt(doc, this.offsetOf(cursor));
    const key = target === null ? `at ${cursor.line}:${cursor.col}` : `${target.kind} ${target.span.start.offset}-${target.span.end.offset}`;
    const last = this.lastHover;
    const lines = last?.ws === ws && last.path === path && last.key === key ? last.lines : this.hoverRows(ws, path, this.lspPosition(cursor));
    this.lastHover = { ws, path, key, lines };
    return lines === null ? null : { x, y, lines, source };
  }

  /** The popup's rows of the hover at a position: the hover's parts as they are, the code at the declaration, the uses in specs. */
  private hoverRows(ws: Workspace, path: string, position: LspPosition): Hover["lines"] | null {
    const content = hoverContent(ws, path, position);
    if (!content) return null;
    const lines: Hover["lines"] = [{ text: runsText(content.title), kind: "title" }];
    if (content.place !== null) lines.push({ text: content.place, kind: "text" });
    for (const line of content.evidence) lines.push({ text: `• ${runsText(line)}`, kind: "evidence" });
    if (content.flows.length > 0) lines.push({ text: `flows: ${content.flows.join(", ")}`, kind: "text" });
    const declaration = content.declaration;
    const code = declaration === null || extname(declaration.file) === ".md" ? null : readText(resolve(this.state.root, declaration.file));
    if (declaration !== null && code !== null) {
      const shown = code.split("\n").slice(declaration.line - 1, declaration.line + 3);
      lines.push({ text: "", kind: "rule" }, ...shown.map((text) => ({ text: text.replace(/\t/g, "  "), kind: "code" as const })));
    }
    const uses = references(ws, path, position).length;
    if (uses > 0) lines.push({ text: `referenced ${uses} time(s) in specs`, kind: "text" });
    return lines;
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
      // The transport detaches the surface while the editor has the screen and repaints when it is back;
      // what happened elsewhere (a GUI editor's window, an editor that did not start) is the status line's.
      this.track(
        this.surface.openEditor(abs, line).then((note) => {
          if (note !== null && !this.closed) this.state.message = note;
        }),
      );
      return;
    }
    const place = this.state.current ? { path: this.state.current, cursor: { ...this.state.cursor }, mode: this.state.mode } : null;
    if (this.showCode(rel, abs, line) && place) this.state.back.push(place);
  }

  /** The built-in read-only viewer at `line` of a code file; false (with a message) when it cannot be read. */
  private showCode(rel: string, abs: string, line: number): boolean {
    let lines: string[];
    try {
      lines = readFileSync(abs, "utf8").split(/\r?\n/);
    } catch {
      this.state.message = `${rel}: cannot read`;
      return false;
    }
    const at = Math.max(1, Math.min(line, lines.length));
    const editor = layout(this.state).editor;
    this.state.code = { file: rel, line: at, lines, top: Math.max(0, at - 1 - Math.floor((editor.height - 1) / 3)), link: `vscode://file${pathToFileURL(abs).pathname}:${at}` };
    this.state.mode = "code";
    this.state.hover = null;
    return true;
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
    return { map: specPath(analysis.config.dir, "map/"), explained: specPath(analysis.config.dir, `${EXPLAINED_MAP_DIR}/`) };
  }

  /** `t`: the same layer file in the other map, the cursor on the same node. */
  private toggleMap(): void {
    const analysis = this.state.analysis;
    const path = this.state.current;
    if (!analysis || !path) {
      this.state.message = analysis ? "no file open" : (noSnapshotReason(this.state) ?? "analysis is still running");
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
    // `open` remembers editor modes only; a MERGE or the code viewer is never restored without what it showed.
    this.state.mode = place.mode === "merge" || place.mode === "code" ? "view" : place.mode;
    this.state.code = null;
    this.clampCursor();
    this.keepVisible();
  }

  // ---------- events ----------

  private handle(event: InputEvent): void {
    // A ghost line answers the next key in the editor (Tab takes it, Alt+] cycles); a click, a paste,
    // a panel key or anything outside the editor (the clip's chat too) drops it, so it is never taken into other text.
    if (this.state.ghost && !(event.type === "mouse" && event.action !== "down") && !(event.type === "key" && this.state.mode === "edit" && !this.state.prompt && !this.state.help && !chatTakesKeys(this.state) && !PANEL_KEYS.has(event.name) && !(event.ctrl && event.name === "c"))) this.assist.dropGhost();
    // The save step is modal: the pointer and pasted text do not reach what is under it.
    if (event.type === "mouse") {
      if (!this.state.barrier && !this.state.quit) this.mouse(event);
      return;
    }
    if (event.type === "paste") {
      // While a finding's target is shown (viewing) the panel is hidden and text goes to the target, as keys do.
      if ((this.state.results.open && !this.state.results.viewing) || this.state.barrier || this.state.quit) return;
      // The help is modal: text pasted over it would go into the hidden buffer, which it covers.
      if (this.state.help) return;
      if (this.state.prompt) this.promptType(event.text.replace(/\n/g, " "));
      else if (chatTakesKeys(this.state)) this.clip.paste(printable(event.text));
      else if (this.state.mode === "edit") this.insert(event.text);
      else this.state.message = pasteRefusal(this.state);
      return;
    }
    this.state.message = null;
    if (event.name !== "q" && !(event.ctrl && event.name === "c")) this.state.quitArmed = false;
    if (event.ctrl && event.name === "c") return this.quit();
    if (this.state.quit) return this.quitKey(event);
    // The help scrolls with the arrows and a page; any other key closes it.
    if (this.state.help) return this.helpKey(event);
    if (this.state.barrier) return this.barrierKey(event);
    // The palette does not open over a form: that would drop what was typed in it. Ctrl+P says how to go on.
    if (this.state.prompt && event.ctrl && event.name === "p") {
      if (this.state.prompt.kind !== "palette") this.state.message = "Ctrl+P: the palette does not open over a form: Enter runs it, Esc closes it, then Ctrl+P";
      return;
    }
    if (this.state.prompt) return this.promptKey(event);
    // Ctrl+P opens the palette from any ordinary mode (view/read/edit/code) and from the panels; in MERGE it
    // allows viewing the catalogue and independent read-only actions, the rest explain why they are blocked.
    if (event.ctrl && event.name === "p") return this.openPalette();
    // Ctrl+S still saves the buffer being edited: a person who typed in the chat expects the file to save.
    if (chatTakesKeys(this.state) && event.ctrl && event.name === "s" && this.state.mode === "edit") return this.save();
    // The clip's focused window takes every other key, `?` and letters as text; F2–F7 stay global.
    if (chatTakesKeys(this.state) && !PANEL_KEYS.has(event.name)) return this.clip.key(event);
    // In raw mode the terminal sends Ctrl+Z as a key, not SIGTSTP: outside the editor (where it undoes) and
    // MERGE (where `u` does), it stops keylang as in any shell. A surface that cannot stop (web) ignores it.
    if (event.ctrl && event.name === "z" && this.state.mode !== "edit" && this.state.mode !== "merge") return this.surface?.suspend?.();
    if (this.state.results.open) {
      if (this.state.results.viewing) {
        // The panel is hidden while the finding's target is shown; the keys go to the editor or the
        // code viewer. Esc / Ctrl+O (and q in the code viewer) bring the list back and put back the place the finding was opened
        // from (Esc in edit mode leaves editing first); F6 closes the panel and stays at the target.
        if ((event.name === "escape" && this.state.mode !== "edit") || (event.ctrl && event.name === "o") || (event.name === "q" && this.state.mode === "code")) return this.results.returnToFindings();
        if (event.name === "f6") return this.results.closeResults();
      } else {
        return this.results.resultsKey(event);
      }
    }
    if (this.state.start !== null && event.name !== "f6") return this.startKey(event);
    if (event.name === "f7") return this.clip.toggle();
    if (event.name === "f5") return this.reanalyze();
    if (event.name === "f6") return this.results.openResults();
    // Panels take the focus only where keys go to the focused panel (the view); in the editor, MERGE,
    // the code viewer and the clip's focused window they are shown, and the keys still go where they went.
    const focusable = (this.state.mode === "view" || this.state.mode === "read") && !chatTakesKeys(this.state);
    if (event.name === "f2") return this.toggleFiles(focusable);
    if (event.name === "f3") return this.toggleNav(focusable);
    if (event.name === "f4") return this.toggleContext(focusable);
    switch (this.state.mode) {
      case "merge":
        // `w` writes the merged file: it waits while the map is written.
        if (event.name === "w" && this.writingNow()) return;
        return this.merges.key(event);
      case "code":
        return this.codeKey(event);
      case "zoom":
        return this.zoomScreen.zoomKey(event);
      case "edit":
        return this.editKey(event);
      default:
        if (this.state.focus === "context") return this.contextKey(event);
        if (this.state.focus === "nav") return this.navKey(event);
        if (this.state.focus === "files") return this.filesKey(event);
        return this.viewKey(event);
    }
  }

  private helpKey(event: KeyEvent): void {
    const page = Math.max(1, layout(this.state).panel.height - 4);
    const step = event.name === "up" || event.name === "k" ? -1 : event.name === "down" || event.name === "j" ? 1 : event.name === "pageup" ? -page : event.name === "pagedown" ? page : 0;
    if (step === 0) {
      this.state.help = false;
      this.state.helpTop = 0;
      return;
    }
    this.state.helpTop = Math.max(0, Math.min(this.state.helpTop + step, helpScrollMax(this.state)));
  }

  /**
   * `q` / Ctrl+C. While an operation runs, the quit step asks first (Stay or
   * Cancel and exit; `q` again in it is Cancel and exit); then unsaved
   * buffers ask once more; then the session ends.
   */
  private quit(): void {
    const step = this.state.quit;
    if (step?.waiting) {
      this.state.message = `${step.label}: cancelling after the current file; the session ends when it settles (Esc stays)`;
      return;
    }
    if (this.state.activeOperation !== null) {
      if (step) return this.cancelAndQuit();
      const label = this.activeLabel();
      this.state.quit = { label, choice: "stay", waiting: false };
      this.state.message = `${label} is running: stay, or cancel it and quit (q again)`;
      return;
    }
    this.state.quit = null;
    this.quitIfSaved();
  }

  /** The ordinary end of a session: unsaved buffers ask once (the second q quits), then it closes. */
  private quitIfSaved(note?: string): void {
    const dirty = this.unsaved();
    if (dirty.length > 0 && !this.state.quitArmed) {
      this.state.quitArmed = true;
      this.state.message = `${note === undefined ? "" : `${note} · `}unsaved changes in ${dirty.join(", ")}: Ctrl+S saves, q or Ctrl+C again quits`;
      return;
    }
    this.close();
    this.onQuit();
  }

  /** How messages name the running operation. */
  private activeLabel(): string {
    const record = this.state.records.find((entry) => entry.id === this.state.activeOperation);
    return record ? operationLabel(record.params) : "an operation";
  }

  /** The keys of the quit step: ←→/Tab choose, Enter does it, Esc stays; while it waits only Esc (stay) counts. */
  private quitKey(event: KeyEvent): void {
    const step = this.state.quit!;
    if (event.name === "q") return this.quit();
    if (event.name === "escape" || (event.name === "enter" && step.choice === "stay" && !step.waiting)) {
      this.state.quit = null;
      this.state.message = step.waiting ? `${step.label}: the cancel goes on; the session stays` : `${step.label}: still running; the session stays`;
      return;
    }
    if (step.waiting) return this.quit();
    if (event.name === "left" || event.name === "right" || event.name === "tab" || event.name === "h" || event.name === "l") step.choice = step.choice === "stay" ? "cancel" : "stay";
    else if (event.name === "enter") this.cancelAndQuit();
  }

  /**
   * Cancel and exit: the operation is cancelled — before a commit at once,
   * during one after its current file step — and the session ends when it
   * settles (`quitAfterSettle`), never in the middle of a file write.
   */
  private cancelAndQuit(): void {
    const step = this.state.quit!;
    step.waiting = true;
    this.cancelActive?.();
    // Still waiting: the operation is in its commit and finishes the current file step first.
    if (this.state.quit === step) this.state.message = `${step.label}: cancelling after the current file; the session ends when it settles`;
  }

  /**
   * An operation settled under the quit step. After Cancel and exit the
   * unsaved buffers decide again, with what the operation wrote named; an
   * operation that ended by itself while the step asked only closes the step.
   */
  private quitAfterSettle(record: OperationRecord): void {
    const step = this.state.quit;
    if (!step) return;
    this.state.quit = null;
    const result = record.result;
    const written = result === null ? [] : [...result.written, ...result.removed];
    const outcome = `${step.label}: ${recordSummary(record)} · ${written.length === 0 ? "nothing written" : `written: ${written.join(", ")}`}`;
    if (!step.waiting) {
      this.state.message = `${outcome} · q quits`;
      return;
    }
    this.state.quitArmed = false;
    this.quitIfSaved(outcome);
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

  /** `Tab`: the editor, then each open side panel that is drawn once it has the focus. */
  private cycleFocus(): void {
    const panels: SidePanel[] = [...(this.state.context.open ? ["context" as const] : this.state.showNav ? ["nav" as const] : []), ...(this.state.showFiles ? ["files" as const] : [])];
    const order: State["focus"][] = ["editor", ...panels.filter((panel) => this.drawable(panel))];
    const at = order.indexOf(this.state.focus);
    this.state.focus = order[(at + 1) % order.length]!;
    if (this.state.focus === "nav") this.fixNavIndex(1);
  }

  /**
   * Whether `panel` is drawn when it has the focus (below 100 columns the
   * focused panel is the one shown). Below 60 columns none is: keys must not
   * go to a list nobody sees.
   */
  private drawable(panel: SidePanel): boolean {
    const area = layout({ ...this.state, focus: panel });
    return (panel === "files" ? area.files : area.nav) !== null;
  }

  /** `K`: the hover of the id nearest the cursor, as the mouse would show it. */
  private hoverAtCursor(): void {
    const at = this.targetNear(this.state.cursor);
    const buffer = this.buffer();
    if (!at || !buffer) {
      // A line without an ID: the hover is the role of the line under the cursor, if it has one.
      const anchor = this.cursorAnchor(this.state.cursor.col);
      this.state.hover = buffer ? this.hoverAt(this.state.cursor, anchor.x, anchor.y, "key") : null;
      if (!this.state.hover) this.state.message = "no id on this line";
      return;
    }
    const anchor = this.cursorAnchor(at.col);
    this.state.hover = this.hoverAt(at, anchor.x, anchor.y, "key");
    if (!this.state.hover) this.state.message = this.state.analysis ? "nothing known about this id" : "analysis is still running";
  }

  private viewKey(event: KeyEvent): void {
    if (!event.ctrl && !event.alt && this.common(event)) return;
    if (event.name === "enter" && event.alt) return this.goToSpec(this.idAtCursor());
    if (event.ctrl && event.name === "o") return this.goBack();
    if (event.ctrl && event.name === "g") return this.textToSpec();
    if (event.ctrl && event.name === "space") return this.draftAtCursor();
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
      case "K":
        return this.hoverAtCursor();
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
          this.state.message = this.readOnlyReason(buffer.path);
          return;
        }
        this.state.mode = "edit";
        this.state.hover = null;
        return;
      }
      case "m":
        return this.mergeOrPick();
      case "u":
        if (this.writingNow()) return;
        return this.merges.undo();
      case "e":
        return this.explainAtCursor();
      case "t":
        return this.toggleMap();
      case "z":
        return this.zoomScreen.openZoom(this.idAtCursor() ?? this.nodeAtCursor());
      case "s":
        return this.openNodeSearch();
      case "?":
        this.state.help = true;
        return;
      case "/":
        this.state.prompt = { kind: "search", text: this.state.search ?? "", items: [], index: 0 };
        return;
      case ":":
        return this.openPalette();
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
        countSuggestion(this.state, "completion", "rejected", completion.shown);
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
    if (open && shown === undefined) countSuggestion(this.state, "completion", "proposed", null);
    this.state.completion = open ? { items, index: 0, from, shown: shown ?? Date.now() } : null;
  }

  private acceptCompletion(): void {
    const completion = this.state.completion;
    if (!completion) return;
    const item = completion.items[completion.index]!;
    this.state.completion = null;
    countSuggestion(this.state, "completion", "accepted", completion.shown);
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

  private toggleFiles(focusable: boolean): void {
    this.state.showFiles = !this.state.showFiles;
    if (this.state.showFiles) this.state.lastPanel = "files";
    this.narrowNote();
    if (this.state.showFiles && focusable && this.drawable("files")) this.state.focus = "files";
    else if (!this.state.showFiles && this.state.focus === "files") this.state.focus = "editor";
    this.keepVisible();
  }

  private toggleNav(focusable: boolean): void {
    this.state.showNav = !this.state.showNav;
    if (this.state.showNav) this.state.lastPanel = "nav";
    this.narrowNote();
    if (!this.state.showNav && this.state.focus === "nav") this.state.focus = "editor";
    this.keepVisible();
  }

  /** F4 and the palette: the context panel; it takes the focus only where keys go to panels (`focusable`). */
  private toggleContext(focusable: boolean): void {
    const context = this.state.context;
    context.open = !context.open;
    if (context.open) this.state.lastPanel = "nav";
    this.narrowNote();
    if (context.open && focusable && this.drawable("context")) this.state.focus = "context";
    else if (!context.open && this.state.focus === "context") this.state.focus = "editor";
    this.keepVisible();
  }

  /** A side panel needs 60 columns: below that a toggle says so instead of seeming to do nothing. */
  private narrowNote(): void {
    if (this.state.cols < PANEL_MIN_COLS) this.state.message = `side panels need ${PANEL_MIN_COLS} columns (now ${this.state.cols}): widen the terminal; Ctrl+P still reaches every action`;
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
        return this.toggleContext(false);
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

  /**
   * `e`: offline, from the session's analysis as it is shown — the summary of
   * the ID under the cursor with its saved answer and brief, each with its
   * provenance, or the help of the line's diagnostic code. Never a model and
   * never a file read behind the analysis' back, apart from the saved
   * explanations; the popup says when the analysis has unsaved buffers or is outdated.
   * The palette's Explain reads the saved files fresh instead.
   */
  private explainAtCursor(): void {
    const analysis = this.state.analysis;
    if (!analysis) {
      this.state.message = "analysis is still running";
      return;
    }
    const id = this.idAtCursor();
    const anchor = this.cursorAnchor(0);
    const x = layout(this.state).editor.x + 2;
    const found = id === null ? null : nodeExplanation(analysis, id, analysis.config.explain.detail);
    if (found === null || "unknown" in found) {
      // No known ID here: the help of the line's diagnostic code (an unknown ID is K001), offline.
      const unknown = id !== null && found !== null && "unknown" in found ? unknownIdMessage(id, found.suggestion) : null;
      const buffer = this.buffer();
      const code = buffer ? evidenceOf(analysis, buffer.path).get(this.state.cursor.line + 1)?.diagnostics[0]?.code : undefined;
      const help = code === undefined ? null : codeExplanation(code);
      if (!help) {
        this.state.message = unknown ?? "no id or diagnostic on this line";
        return;
      }
      const lines: Hover["lines"] = help.text.split("\n").map((text, i) => ({ text, kind: i === 0 ? "title" : "text" }));
      if (unknown !== null) lines.push({ text: unknown, kind: "evidence" });
      lines.push({ text: `keylang explain ${help.code} · the offline help of the line's diagnostic`, kind: "evidence" });
      this.state.hover = { x, y: anchor.y, lines, source: "key" };
      return;
    }
    this.state.hover = { x, y: anchor.y, lines: this.explainLines(id!, found), source: "key" };
  }

  /** The explain hover of a known node: the summary, the session's analysis, and each saved explanation with its origin. */
  private explainLines(id: string, found: Exclude<ReturnType<typeof nodeExplanation>, { unknown: string }>): Hover["lines"] {
    const lines: Hover["lines"] = formatSummary(found.summary).split("\n").map((text, i) => ({ text, kind: i === 0 ? "title" : "text" }));
    const overlay = this.dirtyInputs().some((path) => path.endsWith(".md"));
    const outdated = this.state.outdated || this.state.updating || this.state.error !== null;
    lines.push({ text: `the session's analysis${overlay ? " · with unsaved buffers (overlay)" : ""}${outdated ? " · outdated" : ""} · Ctrl+P Explain reads the saved files`, kind: "evidence" });
    const answer = (label: string, saved: SavedAnswer): void => {
      lines.push({ text: "", kind: "rule" });
      // A `full` answer is in sections: its `##` headings read as titles.
      for (const text of saved.text.split("\n")) {
        const heading = /^#{1,6}\s+(.*)$/.exec(text);
        lines.push(heading ? { text: heading[1]!, kind: "title" } : { text, kind: "text" });
      }
      lines.push({ text: `${label} · ${saved.agent} · ${saved.date} · ${saved.fresh ? "fresh" : "stale"}`, kind: "evidence" });
      if (saved.unknownIds.length > 0) lines.push({ text: `unknown ids: ${saved.unknownIds.join(", ")}`, kind: "evidence" });
    };
    if (found.saved) answer(`saved ${found.saved.detail} answer`, found.saved);
    if (found.brief) answer("saved brief", found.brief);
    if (!found.saved) lines.push({ text: `no saved answer · offline: e asks no model (Ctrl+P Explain with the model, or keylang explain ${id} --llm, does)`, kind: "evidence" });
    return lines;
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
      case "z":
        return this.zoomScreen.openZoom(item?.id ?? null);
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

  // ---------- the code viewer ----------

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

  // ---------- operations ----------

  /**
   * Records that an input changed: a feature or check result computed before
   * it is outdated from now on, and so is a spec-to-code preview (one still
   * running too: a model's answer to the old bytes is not the current code).
   */
  private inputsChanged(reason: string): void {
    for (const record of this.state.records) {
      const preview = record.params.kind === "spec-to-code" && record.params.output === "preview";
      // A code's help reads nothing, so no input makes it outdated.
      const node = (record.params.kind === "explain" && !isDiagnosticCode(record.params.subject)) || record.params.kind === "explain-llm" || record.params.kind === "explain-plan" || record.params.kind === "explain-batch";
      if (record.kind === "feature" || record.kind === "check" || record.kind === "parse" || record.kind === "trace-plan" || node || preview) record.outdated ??= reason;
    }
  }

  /**
   * Starts an operation that reads the saved files: after the save step when
   * buffers it reads are dirty or it names what it writes (design §2.5), then
   * as the session's one explicit operation. A second one is refused while
   * one runs. `then` hears the record when it ends (not when the step is left).
   */
  private requestOperation(action: string, request: OperationRequest, then?: (record: OperationRecord) => void): void {
    if (this.state.activeOperation !== null) {
      this.state.message = "an operation is already running";
      return;
    }
    const step = this.saveStep(request);
    if (step === null) {
      this.startOperation(action, request, then);
      return;
    }
    this.withSavedInputs(operationLabel(request), () => this.startOperation(action, request, then), step);
  }

  /**
   * The save step of an operation: which dirty buffers it reads (saved
   * first; the rest stay dirty and are never read behind them) and what it
   * writes, named before it starts — always for the map and an apply, else
   * when the step opens for dirty inputs anyway (the form already named the
   * target). Null: no step, it starts at once.
   */
  private saveStep(request: OperationRequest): { inputs?: (path: string) => boolean; writes?: string[]; writesNote?: string } | null {
    const config = (path: string): boolean => path === CONFIG_FILE;
    const dir = `${this.specDir()}/`;
    const specs = (path: string): boolean => path === CONFIG_FILE || path.startsWith(dir);
    const harness = (path: string): boolean => (HARNESS_PATHS as readonly string[]).includes(path);
    // The chosen files and directories, as the paths name them from the root, and keylang.json.
    const chosen = (paths: readonly string[]): ((path: string) => boolean) => {
      const selected = paths.map((path) => toPosix(relative(this.state.root, resolve(this.state.root, path))));
      return (path) => path === CONFIG_FILE || selected.some((item) => item === "" || path === item || path.startsWith(`${item}/`));
    };
    const naming = (inputs: (path: string) => boolean, targets: string[] | null): { inputs: (path: string) => boolean; writes?: string[] } => ({ inputs, ...(targets !== null && this.dirtyInputs().some(inputs) ? { writes: targets } : {}) });
    switch (request.kind) {
      // Doctor reads settings only; a layout draft writes nothing and moves its layers into keylang.json's
      // buffer later, so a dirty keylang.json stays dirty (only an edit after the draft refuses the move).
      case "doctor":
      case "draft-layout":
        return null;
      // The clip's reply reads no file: the request carries the buffer and the pack as the session shows them.
      case "assistant-reply":
        return null;
      // A feature, the map check and an export read the saved files: every dirty buffer is saved first.
      case "feature":
      case "map-check":
      case "export":
        return {};
      // The baseline reads the code and the saved keylang.json, not the specs.
      case "baseline":
        return naming(config, request.check ? null : [baselinePath({ dir: this.specDir() })]);
      // Agents reads the harness files only; the form already showed what a write changes.
      case "agents":
        return { inputs: harness };
      // Init reads the saved keylang.json (kept when it exists), the harness files and the code, never the specs.
      case "init":
        return naming((path) => config(path) || harness(path), request.check ? null : this.initTargets());
      // Fmt and parse read the chosen files and the edition in keylang.json.
      case "fmt":
      case "parse":
        return { inputs: chosen(request.paths) };
      // Check reads the specs under its paths (the spec directory by default) and keylang.json.
      case "check":
        return { inputs: chosen(request.paths.length > 0 ? request.paths : [this.specDir()]) };
      // An edge and the entry points read the saved code and keylang.json, never the specs.
      case "explain-edge":
      case "entries":
        return { inputs: config };
      // The blind spots read the code, keylang.json and the hand-written flows (a trigger they name has a flow).
      case "coverage":
      case "integrations":
      case "tour":
        return { inputs: specs };
      // A code's help reads nothing. A node's summary, the inventory and a trace plan read the specs and
      // the saved explanations under the spec directory, keylang.json and the code.
      case "explain":
        return isDiagnosticCode(request.subject) ? null : { inputs: specs };
      case "explain-plan":
      case "trace-plan":
        return { inputs: specs };
      case "explain-batch":
        return naming(specs, [`${explainDir({ dir: this.specDir() })}/brief/<id>.md of each planned node`]);
      case "explain-llm":
        return naming(specs, [explanationPath({ dir: this.specDir() }, request.id, request.detail ?? "short")]);
      // The diagram reads the code, keylang.json and the saved briefs.
      case "export-c4":
        return naming(specs, request.out === undefined ? null : [request.out]);
      // The questions read the feature file, the specs around it, keylang.json and the code.
      case "feature-questions":
        return naming(specs, [`${PROPOSALS_DIR}/${dir}features/${request.slug}.md`]);
      // A draft reads the saved code and keylang.json (rules also the specs they are checked with); its
      // target is read from disk, and its form refused a dirty one.
      case "draft-flow":
        return naming(config, request.output === "proposal" ? [`${PROPOSALS_DIR}/${flowDraftTarget(this.merges.specDir(), { trigger: request.trigger, name: request.name ?? "", into: request.into ?? "" }).target}`] : null);
      case "draft-rules":
        return naming(config, request.output === "proposal" ? [`${PROPOSALS_DIR}/${rulesDraftTarget(this.merges.specDir(), request.into ?? "")}`] : null);
      case "code-to-spec":
        return naming(config, request.output === "proposal" ? [`${PROPOSALS_DIR}/${codeDraftTarget(this.merges.specDir(), this.state.analysis?.snapshot ?? null, codeDraftFormOf(request))}`] : null);
      // Discovered flows read the code, keylang.json and the hand-written flows (a trigger they name is skipped).
      case "flows-discover":
        return naming(specs, request.output === "write" ? [`${dir}flows-discovered/<layer>.md`] : null);
      case "flows-adopt":
        return naming(specs, [`${PROPOSALS_DIR}/${request.into ?? `${dir}flows/${request.name}.md`}`]);
      // The candidate reads the specs (the planned signature, the flows' tests), keylang.json and the code.
      case "spec-to-code": {
        const placed = specCodePlace(this.state.analysis, { id: request.id, into: request.into ?? "", mode: request.mode ?? "algo", output: request.output });
        const code = placed !== null && "file" in placed ? placed.file : "<the module's file>";
        return naming(specs, request.output === "proposal" ? [`${PROPOSALS_DIR}/${code}`, `${PROPOSALS_DIR}/<each new test file of its flows>`] : null);
      }
      // Nothing is computed again: no buffer is read or saved. The write is a decision of its own: the step names every file.
      case "apply-code":
        return { inputs: () => false, writes: request.candidate.targets.map((target) => target.file), writesNote: "Writes these files directly, as spec-to-code --apply (no proposal, no test is run):" };
      // Wire reads the saved specs and keylang.json.
      case "wire":
        return naming(() => true, request.check ? null : [request.out ?? WIRE_OUT]);
      // The map reads the code and the saved keylang.json, not the specs: dirty specs go into the analysis after the commit.
      case "map":
        return { writes: this.mapTargets(), inputs: config };
    }
  }

  /** What `keylang map` may write, as the step before it shows. */
  private mapTargets(): string[] {
    const dir = this.specDir();
    return [`${dir}/map/*.md`, `${dir}/${EXPLAINED_MAP_DIR}/*.md`, ".keylang/index.json", FACT_CACHE_FILE];
  }

  /** The classes of files `keylang init` may write, as its form and its save step name them. */
  private initTargets(): string[] {
    const config = existsSync(join(this.state.root, CONFIG_FILE)) ? [] : [CONFIG_FILE];
    return [...config, ".gitignore (.keylang/, unless a line lists it)", ...this.mapTargets(), baselinePath({ dir: this.specDir() }), "the harness files of the selection"];
  }

  /** True (with the reason shown) while an operation writes files: saves and merge writes wait for it. */
  private writingNow(): boolean {
    if (this.committing === null) return false;
    this.state.message = `${this.committingLabel} is writing files: try again when it finishes; your text stays in the buffer`;
    return true;
  }

  /**
   * A writing operation is about to touch files: an analysis in flight is
   * dropped (it read the disk before the commit) and none starts until the
   * commit ends. A record no longer running (cancelled) changes nothing: its
   * aborted signal makes the operation stop with nothing written.
   */
  private beginCommit(record: OperationRecord): void {
    if (record.status !== "running" || this.closed) return;
    this.committing = record.id;
    this.committingLabel = operationLabel(record.params);
    if (this.settleTimer) {
      clearTimeout(this.settleTimer);
      this.settleTimer = null;
      this.analysisAfterCommit = true;
    }
    if (this.state.updating) this.analysisAfterCommit = true;
    this.generation++;
    this.state.updating = false;
  }

  /**
   * After a writing operation — completed, cancelled part way or failed part
   * way — the old analysis is superseded and a full one runs with the dirty
   * buffers as overlays. Clean buffers follow the disk through it; a dirty
   * buffer of a written file keeps its text and is named.
   */
  private endCommit(result: OperationResult): string | null {
    const wasCommitting = this.committing !== null;
    this.committing = null;
    const touched = [...result.written, ...result.removed];
    if (!wasCommitting && touched.length === 0 && !this.analysisAfterCommit) return null;
    this.analysisAfterCommit = false;
    const kept: string[] = [];
    for (const path of touched) {
      const buffer = this.state.buffers.get(path);
      if (!buffer) continue;
      if (isDirty(buffer)) {
        kept.push(path);
        continue;
      }
      // A clean buffer takes the new bytes and their line ends now, even when the analysis after this fails.
      const raw = readText(resolve(this.state.root, path));
      buffer.disk = raw;
      if (raw === null) continue;
      const { text, eol } = splitEol(raw);
      buffer.eol = eol;
      if (text !== buffer.text) {
        setText(buffer, text);
        buffer.saved = text;
        this.inputsChanged(`${path} was written since this run`);
      }
    }
    this.clampCursor();
    for (const record of this.state.records) {
      if (record.kind === "map-check" && result.kind === "map" && touched.length > 0) record.outdated ??= "the map was written since this run";
      const file = record.result?.kind === "baseline" ? record.result.payload?.file : undefined;
      if (record.params.kind === "baseline" && record.params.check && file !== undefined && touched.includes(file)) record.outdated ??= "the baseline was written since this run";
      if (record.params.kind === "agents" && record.params.check && result.kind === "agents" && touched.length > 0) record.outdated ??= "the harness files were written since this run";
      // Init writes what map, baseline and agents write: their checks, and an init check, no longer hold.
      const checks = record.params.kind === "map-check" || (record.params.kind === "baseline" && record.params.check) || (record.params.kind === "agents" && record.params.check) || (record.params.kind === "init" && record.params.check);
      if (checks && result.kind === "init" && touched.length > 0) record.outdated ??= "keylang init wrote files since this run";
      const checked = record.params.kind === "fmt" && record.params.check && record.result?.kind === "fmt" ? (record.result.payload?.files ?? []) : [];
      if (checked.some((file) => touched.includes(file.path))) record.outdated ??= "the files were formatted since this run";
      const wired = record.params.kind === "wire" && record.params.check && record.result?.kind === "wire" ? record.result.payload?.file : undefined;
      if (wired !== undefined && touched.includes(wired)) record.outdated ??= "the wiring was written since this run";
    }
    this.reanalyze(false);
    return kept.length === 0 ? null : `${kept.join(", ")} changed on disk under unsaved edits: the text stays in the buffer (Ctrl+S twice overwrites, Ctrl+Z undoes)`;
  }

  /**
   * Runs an operation as the session's one explicit operation and records it
   * for F6. The UI never blocks: the record turns "running" and the result
   * (or a failure) lands later; a second operation is refused while one runs.
   * A failure — or a code 1 or 2 of the operation — is a visible record and a
   * message, never the end of the session. `then` hears the record once it
   * ends, unless the session closed first. Returns the record, or null when
   * another operation runs.
   */
  private startOperation(action: string, request: OperationRequest, then?: (record: OperationRecord) => void): OperationRecord | null {
    if (this.state.activeOperation !== null) {
      this.state.message = "an operation is already running";
      return null;
    }
    const record: OperationRecord = {
      id: this.nextRecord++,
      action,
      kind: request.kind,
      params: request,
      started: Date.now(),
      finished: null,
      status: "running",
      result: null,
      outdated: null,
      progress: null,
    };
    const label = operationLabel(request);
    const buffer = this.state.current === null ? undefined : this.state.buffers.get(this.state.current);
    const origin: DraftOrigin = { path: this.state.current, mode: this.state.mode, version: buffer?.version ?? null, results: this.state.results.open, record: this.state.results.index };
    this.state.records.push(record);
    if (request.kind === "draft-layout") this.layoutBases.set(record.id, this.layoutBasis());
    this.state.activeOperation = record.id;
    this.state.message = `${label}: running…`;
    // One explicit operation at a time: no ghost request is made (or shown) until it ends.
    this.assist.suspendGhost();
    const controller = new AbortController();
    // The first outcome wins: a result after Cancel, or a second one, never changes the record.
    const settle = (result: OperationResult): void => {
      if (record.status !== "running") return;
      record.result = result;
      record.status = result.status;
      record.finished = Date.now();
      this.state.activeOperation = null;
      this.cancelActive = null;
      // A result after the session closed is recorded only: no message, merge, open file or analysis follows it.
      if (this.closed) {
        this.committing = null;
        return;
      }
      const note = WRITING_KINDS.has(request.kind) ? this.endCommit(result) : null;
      // After init the saved keylang.json decides (endCommit read it again): with it, the start screen is done.
      if (request.kind === "init" && this.state.start !== null && this.state.config.kind !== "missing-config") this.state.start = null;
      // Completion adds a message; it never changes the open file.
      this.state.message = `${label}: ${recordSummary(record)} · F6 shows the report${note === null ? "" : ` · ${note}`}`;
      this.afterProposed(record, origin);
      if (request.kind === "apply-code") this.afterApplyCode(record);
      if (request.kind === "draft-layout") this.afterLayoutDraft(record);
      then?.(record);
      this.quitAfterSettle(record);
      this.draw();
    };
    this.cancelActive = () => {
      controller.abort();
      // During a commit the operation stops between two file steps; its result names what was written.
      if (this.committing === record.id) {
        record.progress = "cancelling after the current file";
        this.state.message = `${label}: cancelling after the current file…`;
        this.draw();
        return;
      }
      settle(resultWithout(request.kind, "cancelled", null));
    };
    const onProgress = ({ text }: { text: string }): void => {
      if (record.status !== "running") return;
      record.progress = text;
      this.state.message = `${label}: ${text}…`;
      this.draw();
    };
    // The session's analyzer serves an operation run on this thread; the worker has its own.
    let work: Promise<OperationResult>;
    try {
      const beforeCommit = (plan?: CommitPlan): CommitGate => {
        this.beginCommit(record);
        return this.commitGate(request, plan);
      };
      work = this.operations(record.params, { analyze: this.analyzer, signal: controller.signal, onProgress, ...(WRITING_KINDS.has(request.kind) ? { beforeCommit } : {}) });
    } catch (error) {
      work = Promise.reject(error);
    }
    this.track(work.then(settle, (error: unknown) => settle(resultWithout(request.kind, "failed", 2, errorText(error)))));
    this.draw();
    return record;
  }

  /**
   * The session's answer before a commit: a target open with unsaved edits
   * keeps its text and is not written under — an explanation or a feature
   * file edited while the model answered, a diagram, a draft's target edited
   * while the draft was prepared (the proposal would be judged against the
   * disk under them) — and an apply stops at what blocks its files.
   */
  private commitGate(request: OperationRequest, plan?: CommitPlan): CommitGate {
    const refuse = (targets: readonly string[], why: string): CommitGate => {
      const edited = targets.filter((target) => {
        const buffer = this.state.buffers.get(target);
        return buffer !== undefined && isDirty(buffer);
      });
      return edited.length > 0 ? { refused: edited.map((target) => `${target}: ${why}`) } : undefined;
    };
    switch (request.kind) {
      case "explain-llm":
      case "explain-batch":
      case "feature-questions":
        return refuse(plan?.targets ?? [], "edited in this session while the model answered; save or undo the edits, then ask again");
      case "export-c4":
        return refuse(plan?.targets ?? [], "open with unsaved edits; save or undo them, then export again");
      case "apply-code": {
        const conflicts = this.applyConflicts(request.candidate.targets.map((target) => target.file), false);
        return conflicts.length > 0 ? { refused: conflicts } : undefined;
      }
      case "draft-flow":
      case "draft-rules":
      case "code-to-spec":
      case "spec-to-code": {
        if (request.output !== "proposal") return undefined;
        // The operation names the target it resolved; code-to-spec's default target depends on the snapshot it read.
        const targets = plan?.targets ?? (request.kind === "draft-rules" ? [rulesDraftTarget(this.merges.specDir(), request.into ?? "")] : request.kind === "draft-flow" ? [flowDraftTarget(this.merges.specDir(), { trigger: request.trigger, name: request.name ?? "", into: request.into ?? "" }).target] : []);
        return refuse(targets, "edited in this session while the draft was prepared; save or undo the edits, then draft again");
      }
      default:
        return undefined;
    }
  }

  /** Cancel (palette, `x` in F6): the running operation ends as cancelled with exit code null. Esc never does this. */
  private cancelOperation(): void {
    if (!this.cancelActive) {
      this.state.message = "no operation is running";
      return;
    }
    this.cancelActive();
  }

  /**
   * A finished operation that proposed files: what MERGE opens by itself, or
   * the message saying what waits. The answer's lines it left out and the
   * model's notes are named either way; a preview or a run that proposed
   * nothing only adds its notes to the message.
   */
  private afterProposed(record: OperationRecord, origin: DraftOrigin): void {
    const result = record.result;
    switch (result?.kind) {
      case "draft-flow": {
        if (result.status !== "completed" || result.payload?.proposal == null) return;
        const { candidate, model } = result.payload;
        const target = candidate.target;
        // What the proposal does not show: IDs still unknown, and the model's lines that did not parse where they stood.
        const notes = model === null ? "" : [...(model.unknown.length > 0 ? [`still unknown after ${model.rounds} round(s): ${model.unknown.join(", ")}`] : []), ...(model.dropped.length > 0 ? [`dropped from the model's draft: ${model.dropped.join("; ")}`] : [])].join("; ");
        const agent = record.action === AGENT_DRAFT;
        return this.afterProposal(origin, {
          target,
          report: false,
          opened: agent && notes ? `agent: ${notes}` : `${agent ? "agent" : "draft flow"}: ${PROPOSALS_DIR}/${target} · MERGE: decide the hunks, w writes ${target}${notes ? ` · ${notes}` : ""}`,
          // The person moved on (another file, an edit, a merge): the draft waits as a proposal; focus stays where it is.
          waits: agent ? `agent: the draft of flow ${candidate.name} is a proposal for ${target}: m merges it${notes ? `; ${notes}` : ""}` : `draft flow: ${PROPOSALS_DIR}/${target} waits: m, Proposals or Enter in F6 opens MERGE${notes ? ` · ${notes}` : ""}`,
        });
      }
      case "draft-rules": {
        // Its conflicts are named, never taken for the workspace's verdict.
        if (result.status !== "completed" || result.payload === null) return;
        const { candidate, model } = result.payload;
        const conflicts = model === null || model.conflicts.length === 0 ? "" : ` · ${model.conflicts.length} conflict(s) with the code now: F6 names them`;
        if (result.payload.proposal === null) {
          if (conflicts !== "") this.state.message = `${this.state.message ?? ""}${conflicts}`;
          return;
        }
        const target = candidate.target;
        return this.afterProposal(origin, { target, report: false, opened: `draft rules: ${PROPOSALS_DIR}/${target} · MERGE: decide the hunks, w writes ${target}${conflicts}`, waits: `draft rules: ${PROPOSALS_DIR}/${target} waits: m, Proposals or Enter in F6 opens MERGE${conflicts}` });
      }
      case "code-to-spec": {
        // Every flow it proposes is named, and the model's notes.
        if (result.status !== "completed" || result.payload === null) return;
        const { candidate, model, described } = result.payload;
        const review = described.length > 0 ? ` · already in flows (review those): ${described.join(", ")}` : "";
        if (candidate === null || result.payload.proposal === null) {
          if (review !== "") this.state.message = `${this.state.message ?? ""}${review}`;
          return;
        }
        const flows = candidate.flows.map((flow) => flow.name).join(", ");
        const unknown = model === null ? [] : model.flows.flatMap((flow) => flow.unknown);
        const dropped = model === null ? 0 : model.flows.reduce((sum, flow) => sum + flow.dropped.length, 0);
        const notes = `${review}${unknown.length > 0 ? ` · still unknown: ${unknown.join(", ")}` : ""}${dropped > 0 ? ` · ${dropped} line(s) dropped from the model's drafts: F6 names them` : ""}`;
        const target = candidate.target;
        return this.afterProposal(origin, { target, report: false, opened: `code-to-spec: ${PROPOSALS_DIR}/${target} (${flows}) · MERGE: decide the hunks, w writes ${target}${notes}`, waits: `code-to-spec: ${PROPOSALS_DIR}/${target} (${flows}) waits: m, Proposals or Enter in F6 opens MERGE${notes}` });
      }
      case "spec-to-code": {
        // The code file opens; the tests wait next. A run that stopped opens nothing: what it proposed waits. A candidate is never the feature done.
        if (result.payload === null || result.payload.proposals.length === 0) return;
        const files = result.payload.proposals.map((store) => store.slice(PROPOSALS_DIR.length + 1));
        const [code, ...rest] = files;
        const next = rest.length > 0 ? ` · then m or Proposals: ${rest.join(", ")}` : "";
        const after = result.payload.mode === "llm" ? "the model's code is a candidate: review it, run its tests, then check" : "run check after: the stub is not the feature done";
        const partial = result.status === "completed" ? "" : ` · ${result.status}: only these were proposed`;
        return this.afterProposal(origin, {
          target: result.status === "completed" ? code! : null,
          report: false,
          opened: `spec-to-code: ${PROPOSALS_DIR}/${code} · MERGE: decide the hunks, w writes ${code}${next} · ${after}`,
          waits: `spec-to-code: ${files.length} proposal(s) wait: ${files.join(", ")} · m, Proposals or Enter in F6 opens them${partial}`,
        });
      }
      case "feature-questions": {
        // The model's questions open in MERGE from the readiness report they were asked from, too.
        if (result.status !== "completed" || result.payload === null) return;
        const { file, questions, dropped, proposal, agent } = result.payload;
        const left = dropped > 0 ? ` · ${dropped} line(s) of the answer left out: no \`- ? …\` question, or past the fifth` : "";
        if (proposal === null) {
          this.state.message = `questions: ${agent} asked no question, nothing proposed${left}`;
          return;
        }
        return this.afterProposal(origin, { target: file, report: true, opened: `questions: ${questions.length} proposed for ${file}${left} · MERGE: decide the hunks, w writes ${file}`, waits: `questions: ${proposal} waits: m, Proposals or Enter in F6 opens MERGE${left}` });
      }
      default:
        return;
    }
  }

  /**
   * A finished operation proposed `target`: MERGE opens it by itself only
   * while the person is still where the operation started (`report`: F6 may
   * still show the report it started from, and closes); otherwise — or when
   * MERGE cannot open it, or `target` is null — the proposal waits and the
   * message says so.
   */
  private afterProposal(origin: DraftOrigin, proposal: { target: string | null; report: boolean; opened: string; waits: string }): void {
    const { target, report } = proposal;
    if (target !== null && this.stillWhereStarted(origin, report)) {
      if (report && origin.results) this.results.closeResults();
      this.merges.open(target);
      if (this.state.merge?.path === target) {
        this.state.message = proposal.opened;
        return;
      }
    }
    this.state.message = proposal.waits;
  }

  /**
   * The file, mode and text an operation started from are current and nothing
   * else is open; with `report`, F6 may show the report it started from, else
   * it must be closed. The clip's chat with the focus counts as open: MERGE
   * takes the focus from it, so the letters typed for a message would decide
   * the hunks and `w` would write the spec.
   */
  private stillWhereStarted(origin: DraftOrigin, report: boolean): boolean {
    const results = this.state.results;
    const panel = report && origin.results ? results.open && !results.viewing && results.entry === "record" && results.index === origin.record : !results.open;
    const current = this.state.current === origin.path && this.state.mode === origin.mode && (origin.path === null || this.state.buffers.get(origin.path)?.version === origin.version);
    return panel && current && this.state.merge === null && this.state.prompt === null && this.state.barrier === null && !this.state.help && !this.state.clip.chat.focused;
  }

  /** The session's operation worker, started on first use; after a failure the next request starts a new one. */
  private worker(): OperationWorker {
    this.operationWorker ??= new OperationWorker();
    return this.operationWorker;
  }

  /**
   * «Ask the model for questions» (c4-zoom/11): one request with the saved
   * feature file and the context around its ids; the answer's `- ? …` lines
   * are a proposal that MERGE accepts. Without an agent it says how to set
   * one and changes nothing.
   */
  private askFeatureQuestions(slug: string): void {
    if (this.agentName() === null) {
      this.state.message = `ask the model for questions: ${NO_AGENT_REASON}`;
      return;
    }
    this.requestOperation("feature-questions", { kind: "feature-questions", root: this.state.root, slug });
  }

  // ---------- the flow under the cursor ----------

  /** The `# flow <name>` section the cursor is in, or null. */
  private flowAtCursor(): string | null {
    const doc = this.buffer()?.doc;
    if (!doc) return null;
    const offset = this.offsetOf(this.state.cursor);
    let found: string | null = null;
    for (const section of doc.sections) {
      const start = section.heading?.span.start.offset ?? 0;
      if (start > offset) break;
      found = section.kind === "flow" && section.name ? section.name.value : null;
    }
    return found;
  }

  // ---------- the agent and its draft at the cursor (Ctrl+Space) ----------

  /** The effective agent (`KEYLANG_AGENT`, agents.json, the saved keylang.json as the last analysis read it), or null. Credentials are checked by the operation. */
  private agentName(): string | null {
    const analysis = this.state.analysis;
    return analysis ? selectedAgent(analysis.config.agent) : null;
  }

  /**
   * `Ctrl+Space` in the view: the agent drafts the flow under the cursor
   * into this file — hybrid, with the context pack as F4 shows it now — as
   * the session's draft-flow operation. It needs a model (never a silent
   * algo draft). The request is frozen here: a file opened or a context item
   * changed later is neither in the prompt nor the target, and the proposal
   * opens as MERGE only while the session is still where it was asked.
   */
  private draftAtCursor(): void {
    const buffer = this.buffer();
    const analysis = this.state.analysis;
    if (!buffer || !analysis?.snapshot) {
      this.state.message = analysis ? "no spec open" : "analysis is still running";
      return;
    }
    if (this.state.activeOperation !== null) {
      this.state.message = "an operation is already running";
      return;
    }
    // The draft is proposed against the file on disk; unsaved edits would come back as hunks that revert them.
    if (isDirty(buffer)) {
      this.state.message = `${buffer.path} has unsaved changes: save (Ctrl+S) or undo them before asking for a draft`;
      return;
    }
    if (this.proposalWaiting(buffer.path)) {
      this.state.message = `a proposal for ${buffer.path} is waiting: m merges it before a new draft`;
      return;
    }
    const name = this.flowAtCursor();
    const trigger = name === null ? null : this.triggerAtCursor();
    if (name === null || trigger === null) {
      this.state.message = "Ctrl+Space drafts a flow: put the cursor in a `# flow` with a `trigger`";
      return;
    }
    const pack = this.contextPack();
    const request: DraftFlowRequest = { kind: "draft-flow", root: this.state.root, trigger, name, into: buffer.path, output: "proposal", pending: "refuse", mode: "hybrid", ...(pack ? { context: contextText(pack) } : {}) };
    this.state.message = `agent: drafting flow ${name}…`;
    const work = (async () => {
      const { llmClient } = await import("../llm.ts");
      const setup = llmClient(analysis.config.agent, { root: this.state.root });
      if ("missing" in setup) {
        this.state.message = `agent: ${setup.missing}`;
        return;
      }
      if (!this.closed) this.requestOperation(AGENT_DRAFT, request);
    })().catch((error: unknown) => {
      this.state.message = `agent: ${errorText(error)}`;
    });
    this.track(work);
  }

  /** The `trigger` of the flow section under the cursor, or null. */
  private triggerAtCursor(): string | null {
    const flow = this.flowAtCursor();
    const found = flow === null ? undefined : this.state.analysis?.spec.flows.find((item) => item.name === flow && item.file === this.state.current);
    return found?.triggers[0]?.target.target ?? null;
  }

  /** Something is at `.keylang/proposals/<path>`: a proposal (or a link) the person has not resolved. */
  private proposalWaiting(path: string): boolean {
    try {
      lstatSync(join(this.state.root, PROPOSALS_DIR, path));
      return true;
    } catch {
      return false;
    }
  }

  // ---------- spec-to-code: the planned fns, and a candidate applied whole ----------

  /** The planned fns of the current analysis that no code implements yet: the IDs spec-to-code builds. */
  private plannedFns(): string[] {
    const analysis = this.state.analysis;
    if (!analysis) return [];
    const nodes = analysis.snapshot?.nodes ?? {};
    return [...new Set(analysis.spec.planned.filter((item) => item.decl === "fn" && nodes[item.id] === undefined).map((item) => item.id))].sort(compareText);
  }

  /**
   * `a` in F6 on a finished spec-to-code record: applies the entire
   * candidate (`spec-to-code --apply`) after a step that names every file.
   * Refused before that step: a run that did not finish, an outdated
   * candidate (an input saved or its files written since), a file with
   * unsaved edits or open in MERGE, a proposal waiting for one — merging it
   * is the way then; applying never clears it.
   */
  private applyCandidate(record: OperationRecord | undefined): void {
    const result = record?.result;
    if (record?.status === "running") {
      this.state.message = "this operation is still running";
      return;
    }
    if (!record || result?.kind !== "spec-to-code" || result.payload === null || record.status !== "completed") {
      this.state.message = "a applies a spec-to-code candidate: select a finished spec-to-code run";
      return;
    }
    if (record.outdated !== null) {
      this.state.message = `spec-to-code --apply: not started: the candidate is outdated (${record.outdated}); Enter builds it again`;
      return;
    }
    const { candidate, mode } = result.payload;
    const conflicts = this.applyConflicts(candidate.targets.map((target) => target.file), true);
    if (conflicts.length > 0) {
      this.state.message = `spec-to-code --apply: not started: ${conflicts.join("; ")}`;
      return;
    }
    this.requestOperation("apply-code", { kind: "apply-code", root: this.state.root, candidate, mode, pending: "refuse" });
  }

  /** What in this session stops applying `files`: an open MERGE on one, unsaved edits, and (before the run) a waiting proposal. */
  private applyConflicts(files: readonly string[], proposals: boolean): string[] {
    const conflicts: string[] = [];
    for (const file of files) {
      const buffer = this.state.buffers.get(file);
      if (this.state.merge?.path === file) conflicts.push(`MERGE is open on ${file}: write it (w) or leave it (Esc) first`);
      else if (buffer !== undefined && isDirty(buffer)) conflicts.push(`${file} has unsaved edits: save or undo them first; they are kept`);
      else if (proposals && existsSync(join(this.state.root, PROPOSALS_DIR, file))) conflicts.push(`a proposal for ${file} is waiting: merge it in MERGE (Enter in F6, m or Proposals) instead; applying never removes it`);
    }
    return conflicts;
  }

  /**
   * After an apply: every spec-to-code candidate for a file it wrote is
   * outdated (applying it again would overwrite newer code), and the message
   * says what was written. `u` stays the undo of the last MERGE.
   */
  private afterApplyCode(record: OperationRecord): void {
    const result = record.result;
    if (result?.kind !== "apply-code") return;
    const written = new Set(result.written);
    if (written.size > 0) {
      for (const other of this.state.records) {
        if (other.result?.kind === "spec-to-code" && other.result.payload?.candidate.targets.some((target) => written.has(target.file))) other.outdated ??= "its files were written since this run";
      }
    }
    if (result.status === "completed") this.state.message = `spec-to-code --apply: ${result.written.join(", ")} written · no test was run; run them, then check · u undoes only the last MERGE, not this write`;
  }

  // ---------- draft map: layers into keylang.json's buffer ----------

  /** keylang.json as the session has it now: its buffer's version, the file, the code snapshot. */
  private layoutBasis(): LayoutBasis {
    return { version: this.state.buffers.get(CONFIG_FILE)?.version ?? null, disk: readText(join(this.state.root, CONFIG_FILE)), snapshot: this.state.analysis?.snapshot?.snapshotId ?? null };
  }

  /** Why the layers of a layout draft no longer fit the session, or null: keylang.json was edited, saved or changed on disk, or the code moved on. */
  private layoutStale(record: OperationRecord): string | null {
    const basis = this.layoutBases.get(record.id);
    if (!basis) return "the draft's basis is unknown";
    const now = this.layoutBasis();
    const buffer = this.state.buffers.get(CONFIG_FILE);
    // A buffer opened after the start is an edit only when its text is not the file the draft read.
    const edited = basis.version !== null ? now.version !== basis.version : buffer !== undefined && (buffer.newFile || buffer.text !== splitEol(basis.disk ?? "").text);
    if (edited) return `${CONFIG_FILE} was edited in this session since the draft started`;
    if (now.disk !== basis.disk) return `${CONFIG_FILE} changed on disk since the draft started`;
    if (basis.snapshot !== null && now.snapshot !== null && now.snapshot !== basis.snapshot) return "the code snapshot changed since the draft started";
    return null;
  }

  /** A finished layout draft: nothing moves by itself; an edit made meanwhile makes it outdated at once. */
  private afterLayoutDraft(record: OperationRecord): void {
    if (record.result?.kind !== "draft-layout" || record.status !== "completed" || record.result.payload === null) return;
    const stale = this.layoutStale(record);
    if (stale !== null) {
      record.outdated ??= stale;
      this.state.message = `draft map: outdated: ${stale}; your text is kept · Enter in F6 drafts again`;
      return;
    }
    this.state.message = `draft map: ${Object.keys(record.result.payload.layers).length} layer(s), nothing written · F6, Enter moves them into ${CONFIG_FILE}'s buffer`;
  }

  /**
   * Enter on a finished layout draft in F6: its layers replace only `layers`
   * of keylang.json's buffer — every other field stays, unknown ones too — as
   * one undoable edit; nothing is written until Ctrl+S. Without keylang.json
   * a new buffer opens with the inferred config and these layers. A buffer
   * edited (or a file changed) since the draft started makes it outdated:
   * nothing moves, Enter drafts again. Text that is not a JSON object is
   * opened with its reason, never repaired.
   */
  private moveLayers(record: OperationRecord): void {
    const result = record.result;
    if (result?.kind !== "draft-layout" || result.payload === null) return;
    if (this.state.merge !== null) {
      this.state.message = MERGE_REASON;
      return;
    }
    const stale = this.layoutStale(record);
    if (stale !== null) {
      record.outdated = stale;
      this.state.message = `draft map: outdated: ${stale}; nothing moved, your text is kept · Enter drafts again`;
      return;
    }
    const { layers, preview } = result.payload;
    const existing = this.state.buffers.get(CONFIG_FILE);
    const onDisk = existing === undefined && existsSync(join(this.state.root, CONFIG_FILE));
    const buffer = existing ?? (onDisk ? this.load(CONFIG_FILE) : newFileBuffer(CONFIG_FILE, ""));
    // Without keylang.json the base is the config `draft map` printed: the inferred one, as `init` writes it.
    const base = existing === undefined && !onDisk ? preview : buffer.text;
    const moved = withLayers(CONFIG_FILE, base, layers);
    if ("error" in moved) {
      this.results.closeResults();
      this.openConfig(moved.error, true);
      this.state.message = `draft map: ${moved.error} — nothing was changed; fix it, then draft again (Enter in F6)`;
      return;
    }
    if (moved.text === buffer.text && !buffer.newFile) {
      this.state.message = `draft map: ${CONFIG_FILE} already has these layers; nothing changed`;
      return;
    }
    if (!this.state.buffers.has(CONFIG_FILE)) this.state.buffers.set(CONFIG_FILE, buffer);
    if (buffer.newFile && !this.state.files.includes(CONFIG_FILE)) this.state.files = sortFiles([...this.state.files, CONFIG_FILE], this.state.analysis);
    this.results.closeResults();
    this.open(CONFIG_FILE, { line: 0, col: 0 });
    // In the editor, as after any edit: Ctrl+S and Ctrl+Z act on it at once.
    this.state.mode = "edit";
    // One edit: Ctrl+Z gives the text back as it was before the move.
    if (this.state.lastMerge?.path === CONFIG_FILE) this.state.lastMerge = null;
    buffer.undo.push({ text: buffer.text, cursor: { ...this.state.cursor } });
    if (buffer.undo.length > 200) buffer.undo.shift();
    setText(buffer, moved.text);
    const at = moved.text.split("\n").findIndex((line) => line.startsWith('  "layers"'));
    this.state.cursor = { line: Math.max(0, at), col: 0 };
    this.clampCursor();
    this.state.top = Math.max(0, this.state.cursor.line - 3);
    this.keepVisible();
    // The move is done; the record does not move the same layers twice.
    record.outdated = `its layers were moved into ${CONFIG_FILE}'s buffer`;
    let invalid: string | null = null;
    try {
      parseConfig(CONFIG_FILE, moved.text);
    } catch (error) {
      invalid = errorText(error);
    }
    this.state.message = `draft map: layers moved into ${CONFIG_FILE} (unsaved): Ctrl+S saves and analyses with them, Ctrl+Z undoes${invalid === null ? "" : ` · still invalid apart from layers: ${invalid}`}`;
  }

  // ---------- new specification ----------

  /** The form of a new specification (design §2.8): kind, then path, then (for a flow) its name. Nothing exists until Ctrl+S. */
  private openNewSpec(): void {
    this.state.prompt = { kind: "new-spec", text: "", items: [], ids: [], notes: [], index: 0, form: { field: "kind", kind: "flow", path: "" } };
    this.refreshNewSpec();
  }

  /** The items and the note of the field being typed. The root is always named: the path is relative to it. */
  private refreshNewSpec(): void {
    const prompt = this.state.prompt;
    const form = prompt?.form;
    if (prompt?.kind !== "new-spec" || !form) return;
    if (form.field === "kind") {
      const query = prompt.text.toLowerCase();
      const kinds = SPEC_KINDS.filter((entry) => entry.kind.includes(query));
      prompt.items = kinds.map((entry) => entry.label);
      prompt.ids = kinds.map((entry) => entry.kind);
      prompt.notes = kinds.map((entry) => `Enter: then the path under ${defaultSpecPath(entry.kind, this.merges.specDir()) || "."} · root ${this.state.root}`);
      prompt.index = 0;
      prompt.note = prompt.notes[0] ?? "no such kind: flow, rules, wiring, feature, blank";
      return;
    }
    prompt.items = [];
    prompt.ids = [];
    prompt.notes = [];
    if (form.field === "path") {
      const path = prompt.text.trim();
      const problem = newSpecProblem(this.state.root, this.merges.specDir(), path, (p) => this.generatedDoc(p));
      const exists = this.state.buffers.has(path) || existsSync(resolve(this.state.root, path));
      // The verdict first: a narrow screen cuts the end of the line, and the root is the longest part.
      prompt.note = `${problem !== null ? `cannot use: ${problem}` : exists ? "exists: Enter opens it as it is" : "new file: nothing is written until Ctrl+S"} · root ${this.state.root}`;
      return;
    }
    const problem = flowNameProblem(prompt.text.trim());
    prompt.note = problem ?? `# flow ${prompt.text.trim()} in ${form.path}`;
  }

  /** Enter in the form: the next field, or the buffer. An invalid field keeps the form with its text and says why. */
  private submitNewSpec(): void {
    const prompt = this.state.prompt!;
    const form = prompt.form!;
    if (form.field === "kind") {
      const kind = prompt.ids?.[prompt.index] as NewSpecForm["kind"] | undefined;
      if (kind === undefined) return;
      form.kind = kind;
      form.field = "path";
      prompt.text = defaultSpecPath(kind, this.merges.specDir());
      return this.refreshNewSpec();
    }
    if (form.field === "path") {
      const path = prompt.text.trim();
      const problem = newSpecProblem(this.state.root, this.merges.specDir(), path, (p) => this.generatedDoc(p));
      if (problem !== null) {
        this.state.message = `new spec: ${path || "(no path)"}: ${problem}; nothing created`;
        return;
      }
      // An existing file (or a buffer already open for it) opens as it is; nothing is cleared.
      if (this.state.buffers.has(path) || existsSync(resolve(this.state.root, path))) {
        this.state.prompt = null;
        this.open(path, { line: 0, col: 0 });
        this.state.message = `${path}: exists; opened as it is`;
        return;
      }
      form.path = path;
      if (form.kind === "flow") {
        form.field = "name";
        prompt.text = suggestedFlowName(path);
        return this.refreshNewSpec();
      }
      return this.createSpec(form.kind, path, form.kind === "feature" ? basename(path, ".md") : "");
    }
    const name = prompt.text.trim();
    const problem = flowNameProblem(name);
    if (problem !== null) {
      this.state.message = `new spec: ${problem}`;
      return;
    }
    this.createSpec("flow", form.path, name);
  }

  /** Opens the new, unsaved buffer in the editor at its end: listed in FILES and analysed as overlay, no file or directory until Ctrl+S. */
  private createSpec(kind: NewSpecForm["kind"], path: string, name: string): void {
    this.state.prompt = null;
    const buffer = newFileBuffer(path, specTemplate(kind, name));
    this.state.buffers.set(path, buffer);
    this.state.files = sortFiles([...this.state.files, path], this.state.analysis);
    const lines = bufferLines(buffer);
    this.open(path, { line: lines.length - 1, col: 0 });
    this.state.mode = "edit";
    this.state.message = `${path}: new ${kind === "blank" ? "file" : kind}, not on disk yet: Ctrl+S creates it`;
    this.reanalyzeSoon();
  }

  // ---------- proposals list ----------

  /**
   * `m`: the proposal of the current file opens directly; otherwise the
   * proposals list, so no target is chosen for the person. Without a mergeable
   * proposal the message names the ignored ones and their reasons, as before.
   */
  private mergeOrPick(): void {
    const proposals = this.merges.scan();
    if (this.state.current !== null && proposals.includes(this.state.current)) return this.merges.open(this.state.current);
    if (proposals.length > 0) return this.openProposals();
    this.merges.open();
  }

  /** The proposals list (design §2.9): every file under `.keylang/proposals/`, scanned now; viewing writes nothing. */
  private openProposals(prefer: readonly string[] = []): void {
    this.proposalEntries = this.merges.entries();
    this.state.proposals = this.merges.scan();
    if (this.proposalEntries.length === 0) {
      this.state.message = `no proposals under ${PROPOSALS_DIR}/`;
      return;
    }
    this.state.prompt = { kind: "proposal", text: "", items: [], ids: [], notes: [], index: 0 };
    // `prefer`: the targets of one operation, the first still listed selected.
    this.refreshProposalPrompt(prefer.find((path) => this.proposalEntries.some((entry) => entry.path === path)));
  }

  /** The list entries whose path contains the typed text, in POSIX path order, each with its note. */
  private refreshProposalPrompt(selected?: string): void {
    const prompt = this.state.prompt;
    if (prompt?.kind !== "proposal") return;
    const query = prompt.text.toLowerCase();
    const entries = this.proposalEntries.filter((entry) => entry.path.toLowerCase().includes(query));
    const width = Math.max(0, ...entries.map((entry) => stringWidth(entry.path)));
    prompt.items = entries.map((entry) => `${padWidth(entry.path, width)}  ${proposalSummary(entry)}`);
    prompt.ids = entries.map((entry) => entry.path);
    prompt.notes = entries.map((entry) => (entry.problem !== null ? `cannot merge: ${entry.problem}` : `Enter merges into ${entry.path} on disk`));
    prompt.index = Math.max(0, selected === undefined ? 0 : prompt.ids.indexOf(selected));
    prompt.note = prompt.notes[prompt.index] ?? "no proposal matches";
  }

  /**
   * Enter in the list: the entry is scanned again first, so a proposal
   * removed, rewritten or broken since the list was built is judged as it is
   * now. A mergeable one opens in MERGE against the file on disk; any other
   * keeps the list open with its reason, and nothing is written.
   */
  private submitProposal(): void {
    const prompt = this.state.prompt!;
    const path = prompt.ids?.[prompt.index];
    if (path === undefined) return;
    this.proposalEntries = this.merges.entries();
    this.state.proposals = this.merges.scan();
    const entry = this.proposalEntries.find((candidate) => candidate.path === path);
    this.refreshProposalPrompt(path);
    if (!entry) {
      prompt.note = `${path}: the proposal is gone`;
      return;
    }
    if (entry.problem !== null) return;
    this.state.prompt = null;
    this.merges.open(path);
  }

  // ---------- mouse ----------

  private mouse(event: MouseEvent): void {
    // The F6 panel is modal over the editor area: only the wheel scrolls its report.
    // While a finding's target is shown (viewing), the keys and the wheel go to it instead.
    if (this.state.results.open && !this.state.results.viewing) {
      if (event.action === "wheel-up" || event.action === "wheel-down") this.results.scrollReport(event.action === "wheel-up" ? -3 : 3);
      return;
    }
    // The start screen covers the editor: a click never moves the hidden cursor.
    if (this.state.start !== null) return;
    // The clip and its window are over the editor and the panels.
    if (this.clip.mouse(event)) return;
    const area = layout(this.state);
    const inside = (rect: { x: number; y: number; width: number; height: number } | null): boolean => rect !== null && event.x >= rect.x && event.x < rect.x + rect.width && event.y >= rect.y && event.y < rect.y + rect.height;
    // With the context panel open, the panel on the right is the context, not the navigation it covers.
    const context = this.state.context.open && inside(area.nav);
    // The zoom screen covers the editor: its rows, not the hidden buffer, take the wheel and the clicks.
    if (this.state.mode === "zoom" && inside(area.editor)) return this.zoomScreen.zoomMouse(event, area.editor);
    if (event.action === "wheel-up" || event.action === "wheel-down") {
      const delta = event.action === "wheel-up" ? -3 : 3;
      // Like every list the wheel scrolls, it stops with the last row at the top.
      const scroll = (top: number, rows: number): number => Math.max(0, Math.min(rows - 1, top + delta));
      const merge = this.state.merge;
      if (this.state.mode === "code" && this.state.code) this.state.code.top = scroll(this.state.code.top, this.state.code.lines.length);
      else if (this.state.mode === "merge" && merge) merge.top = scroll(merge.top, mergeRows(merge.base, merge.hunks).length);
      else if (context) this.state.context.index = Math.max(0, Math.min(Math.max(0, (this.contextPack()?.items.length ?? 1) - 1), this.state.context.index + delta));
      else if (inside(area.nav)) this.state.navTop = scroll(this.state.navTop, navEntries(this.state).length);
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
    if (this.state.mode === "merge") {
      this.state.message = MERGE_CLICK;
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
      const row = event.y - area.nav.y - 1;
      const index = this.state.navTop + row;
      // The title, the space below the last item and the explanation under the list open nothing.
      if (row < 0 || row >= navListHeight(this.state, area.nav) - 1 || index >= navEntries(this.state).length) return;
      // As F3 and the context panel: the focus moves only where keys go to the focused panel; while
      // editing the keys still type, so the focus (and with it the cursor) stays in the editor.
      if (this.state.mode === "view" || this.state.mode === "read") this.state.focus = "nav";
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

  /** Text typed or pasted while a prompt is open: into the selected row's field. */
  private promptType(text: string): void {
    const prompt = this.state.prompt!;
    typeInto(prompt, this.keysFor(prompt), text);
  }

  /**
   * What the keys of each kind of prompt do: which text the selected row
   * edits, what follows typing, a move and a change, and what Enter runs.
   */
  private keysFor(prompt: Prompt): PromptKeys {
    const close = (): void => {
      this.state.prompt = null;
    };
    const selected = (): string | undefined => prompt.ids?.[prompt.index];
    switch (prompt.kind) {
      case "search":
        return {
          submit: () => {
            close();
            this.state.search = prompt.text;
            this.findNext();
          },
        };
      case "context":
        return {
          submit: () => {
            close();
            this.addToContext(prompt.text.trim().replace(/^@/, ""));
          },
        };
      case "palette":
        return {
          typed: () => this.refreshPalette(),
          moved: () => noteOfSelection(prompt),
          submit: () => {
            const id = selected();
            // Nothing matches: the palette stays with the query, so it can be corrected.
            if (id === undefined) {
              this.state.message = `no action matches "${prompt.text}": Backspace edits the query, Esc closes`;
              return;
            }
            close();
            this.runAction(id);
          },
        };
      case "node":
        return {
          typed: () => this.findNodes(),
          submit: () => {
            close();
            const id = selected();
            if (id && this.state.mode === "zoom") this.zoomScreen.openZoom(id);
            else if (id) this.goToNode(id);
          },
        };
      case "flow":
        return {
          typed: () => this.zoomScreen.findFlows(),
          submit: () => {
            close();
            const name = selected();
            if (name && this.state.zoom) this.state.zoom.flow = name;
          },
        };
      case "proposal":
        return { typed: () => this.refreshProposalPrompt(), moved: () => noteOfSelection(prompt), submit: () => this.submitProposal() };
      case "new-spec":
        return { typed: () => this.refreshNewSpec(), moved: () => noteOfSelection(prompt), submit: () => this.submitNewSpec() };
      case "explain":
        return this.explains.keys(prompt)!;
      case "feature":
      case "baseline":
      case "agents":
      case "init":
      case "fmt":
      case "parse":
      case "wire":
      case "trace-plan":
      case "full-check":
      case "explain-edge":
        return this.runs.keys(prompt)!;
      case "draft-flow":
      case "draft-rules":
      case "draft-layout":
      case "code-to-spec":
      case "spec-to-code":
        return this.drafts.keys(prompt)!;
      case "export":
      case "export-c4":
        return this.exports.keys(prompt)!;
    }
  }

  /** `s` (the view, the zoom) and «Find a node»: the node search, its matches following the text typed. */
  private openNodeSearch(): void {
    this.state.prompt = { kind: "node", text: "", items: [], ids: [], index: 0 };
    this.findNodes();
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
    promptKey(prompt, this.keysFor(prompt), event);
  }

  /** `:` in view/read, Ctrl+P anywhere: the full catalogue with fuzzy search. */
  private openPalette(): void {
    this.state.prompt = { kind: "palette", text: "", items: [], ids: [], notes: [], index: 0 };
    this.refreshPalette();
  }

  /** The catalogue entries matching the prompt text, as parallel item arrays. */
  private refreshPalette(): void {
    const prompt = this.state.prompt;
    if (prompt?.kind !== "palette") return;
    const entries = matchActions(catalog(this.state), prompt.text);
    prompt.items = entries.map((entry) => actionLabel(entry.action, this.state.mode));
    prompt.ids = entries.map((entry) => entry.action.id);
    prompt.notes = entries.map((entry) => entry.reason ?? (entry.note === null ? entry.action.group : `${entry.action.group} · ${entry.note}`));
    prompt.index = 0;
    prompt.note = prompt.notes[0] ?? "no action matches: Backspace edits the query, Esc closes";
  }

  /**
   * Executes a palette action by its id. An unavailable action explains its
   * reason; execution never synthesizes fake key events. New actions join the
   * registry in `actions.ts` and get their case here with the feature.
   */
  private runAction(id: string): void {
    const entry = catalog(this.state).find((candidate) => candidate.action.id === id);
    if (!entry) return;
    if (entry.reason !== null) {
      this.state.message = `${entry.action.label}: ${entry.reason}`;
      return;
    }
    const focusable = (this.state.mode === "view" || this.state.mode === "read") && !chatTakesKeys(this.state);
    switch (id) {
      case "check":
        if (this.state.start !== null) return this.browse();
        return this.reanalyze();
      case "browse":
        return this.browse();
      case "files":
        return this.toggleFiles(focusable);
      case "navigation":
        return this.toggleNav(focusable);
      case "zoom":
        return this.zoomScreen.openZoom(null);
      case "context":
        return this.toggleContext(focusable);
      case "results":
        return this.results.openResults();
      case "doctor":
        return this.requestOperation("doctor", { kind: "doctor", root: this.state.root });
      case "entries":
        return this.requestOperation("entries", { kind: "entries", root: this.state.root });
      case "flows-discover":
        return this.requestOperation("flows-discover", { kind: "flows-discover", root: this.state.root, output: "write" });
      case "coverage":
        return this.requestOperation("coverage", { kind: "coverage", root: this.state.root });
      case "integrations":
        return this.requestOperation("integrations", { kind: "integrations", root: this.state.root });
      case "tour":
        return this.requestOperation("tour", { kind: "tour", root: this.state.root });
      case "feature":
        return this.runs.openFeaturePrompt();
      case "export-c4":
        return this.exports.openC4Prompt();
      case "feature-questions": {
        const slug = this.state.current === null ? null : featureSlugOf(this.state.current, this.specDir());
        if (slug !== null) this.askFeatureQuestions(slug);
        return;
      }
      case "full-check":
        return this.runs.openCheckPrompt();
      case "explain-edge":
        return this.runs.openEdgePrompt();
      case "export":
        return this.exports.openExportPrompt();
      case "map-check":
        return this.requestOperation("map-check", { kind: "map-check", root: this.state.root });
      case "map":
        return this.requestOperation("map", { kind: "map", root: this.state.root });
      case "baseline":
        return this.runs.openBaselinePrompt();
      case "agents":
        return this.runs.openAgentsPrompt();
      case "init":
        return this.runs.openInitPrompt();
      case "fmt":
        return this.runs.openFmtPrompt();
      case "parse":
        return this.runs.openParsePrompt();
      case "trace-plan":
        return this.runs.openTracePlanPrompt();
      case "explain":
        return this.explains.open();
      case "explain-llm":
        return this.explains.openModel();
      case "explain-plan":
        return this.explains.openPlan();
      case "explain-batch":
        return this.explains.openPlan("batch");
      case "draft-flow":
        return this.drafts.openFlow();
      case "draft-rules":
        return this.drafts.openRules();
      case "draft-layout":
        return this.drafts.openLayout();
      case "code-to-spec":
        return this.drafts.openCode();
      case "spec-to-code":
        return this.drafts.openSpecCode();
      case "wire":
        return this.runs.openWirePrompt();
      case "cancel":
        return this.cancelOperation();
      case "find-node":
        return this.openNodeSearch();
      case "toggle-map":
        return this.toggleMap();
      case "search":
        this.state.prompt = { kind: "search", text: this.state.search ?? "", items: [], index: 0 };
        return;
      case "go-to-code":
        return this.goToCode();
      case "go-to-spec":
        return this.goToSpec(this.idAtCursor());
      case "back":
        return this.goBack();
      case "hover":
        return this.hoverAtCursor();
      case "explain-cursor":
        return this.explainAtCursor();
      case "open-config":
        return this.open(CONFIG_FILE, { line: 0, col: 0 });
      case "save":
        return this.save();
      case "text-to-spec":
        return this.textToSpec();
      case "agent-draft":
        return this.draftAtCursor();
      case "voice":
        return this.assist.voice();
      case "undo-merge":
        if (this.writingNow()) return;
        return this.merges.undo();
      case "apply-code": {
        const found = applyRecord(this.state);
        if ("record" in found) return this.applyCandidate(found.record);
        this.state.message = `${entry.action.label}: ${found.reason}`;
        return;
      }
      case "reading": {
        if (!this.buffer()) return;
        this.state.mode = "read";
        this.state.hover = null;
        return;
      }
      case "edit": {
        const buffer = this.buffer();
        if (!buffer) return;
        this.state.mode = "edit";
        this.state.hover = null;
        return;
      }
      case "merge":
        return this.mergeOrPick();
      case "proposals":
        return this.openProposals();
      case "new-spec":
        return this.openNewSpec();
      case "help":
        this.state.help = true;
        return;
      case "clip-reset":
        return this.clip.reset();
      case "version":
        this.state.message = `keylang ${packageVersion()}`;
        return;
      case "quit":
        return this.quit();
      default:
        if (id.startsWith("open:")) return this.open(id.slice("open:".length), { line: 0, col: 0 });
    }
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

/** Why pasted text went nowhere, and the way to where it would go: only the editor takes text. */
function pasteRefusal(state: State): string {
  if (state.start !== null) return "paste: nothing takes text here: choose Browse or Init first, then i edits a file";
  if (state.mode === "merge") return "paste: MERGE takes no text: finish it (w writes, Esc cancels), then i edits";
  if (state.mode === "code") return "paste: the code viewer is read-only; Esc goes back to where it was opened from";
  if (state.mode === "zoom") return "paste: the zoom screen takes no text: q goes back to the view, then i edits";
  if (state.focus !== "editor") return "paste: the panel takes no text: Esc goes to the editor, then i edits";
  return "paste: press i to edit first";
}

/**
 * Whether a run of typed keys from one chunk is text pasted by a terminal
 * without bracketed paste rather than keys. In the editor every run is: one
 * edit, not one per key. Elsewhere keys coalesce whenever the session is
 * busy, so a short run (`jk`, `gG`) and one key held down stay commands; a
 * long run or one with Enter or Tab is pasted text, and a pasted path is not
 * a string of commands (in MERGE its `a` and `w` would accept and write).
 */
function pastedRun(run: readonly KeyEvent[], editing: boolean): boolean {
  if (editing) return true;
  const held = run.length <= HELD_KEYS && run.every((key) => key.name === run[0]!.name);
  return !held && (run.length > TYPED_KEYS || run.some((key) => key.name === "enter" || key.name === "tab"));
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

/**
 * `keylang.json` as it is on disk now: missing (with the guessed layout),
 * invalid (with the reason) or valid; and whether it shows the clip — null
 * when an invalid file cannot say, so the clip stays as it was.
 */
function configState(root: string): { config: ConfigState; clip: boolean | null } {
  const file = join(root, CONFIG_FILE);
  if (!existsSync(file)) {
    const guessed = loadConfig(root);
    return { config: { kind: "missing-config", languages: [...guessed.languages], layers: [...guessed.layers.keys()], notes: guessLayout(root, guessed.exclude).notes }, clip: true };
  }
  try {
    const raw = parseConfig(file, readFileSync(file, "utf8"));
    return { config: { kind: "configured" }, clip: raw.assistant?.clip ?? true };
  } catch (error) {
    // The file is the one open in the editor: the reason keeps only the field.
    const text = errorText(error);
    return { config: { kind: "invalid-config", reason: text.startsWith(`${file}: `) ? text.slice(file.length + 2) : text }, clip: null };
  }
}

/**
 * Where the config error is: the line and column of an invalid JSON message
 * (`line 3 column 5`, else `position N`), or the key the first quoted field
 * path names (`check.trace` → `"check"`, then `"trace"` after it); else the start.
 */
export function configErrorCursor(text: string, reason: string): Cursor {
  const at = (offset: number): Cursor => {
    const before = text.slice(0, offset).split("\n");
    return { line: before.length - 1, col: graphemes(before.at(-1)!).length };
  };
  const lineCol = /line (\d+) column (\d+)/.exec(reason);
  if (lineCol) {
    const line = Number(lineCol[1]) - 1;
    const lineText = text.split("\n")[line] ?? "";
    return { line, col: graphemes(lineText.slice(0, Number(lineCol[2]) - 1)).length };
  }
  const position = /position (\d+)/.exec(reason);
  if (position) return at(Math.min(text.length, Number(position[1])));
  const field = /`([^`]+)`/.exec(reason);
  if (!field) return { line: 0, col: 0 };
  let offset = -1;
  for (const segment of field[1]!.split(".")) {
    const next = text.indexOf(JSON.stringify(segment), offset + 1);
    if (next === -1) break;
    offset = next;
  }
  return offset === -1 ? { line: 0, col: 0 } : at(offset);
}

/** The package version, for the "About keylang" palette action. */
function packageVersion(): string {
  return (createRequire(import.meta.url)("../../package.json") as { version: string }).version;
}

/** The list text of a proposal after its path: kind, a new file, and the hunk count or that it is ignored. */
function proposalSummary(entry: ProposalEntry): string {
  const parts: string[] = [entry.kind];
  if (entry.newFile) parts.push("new file");
  if (entry.hunks !== null) parts.push(`${entry.hunks} hunk(s)`);
  if (entry.problem !== null) parts.push("cannot merge");
  return parts.join(" · ");
}

/** The record action of a `Ctrl+Space` draft: the draft-flow operation asked for by the agent key, not the form. */
const AGENT_DRAFT = "agent-draft";


/** A side panel that can take the focus: files (F2), navigation (F3) or the context in its place (F4). */
type SidePanel = "files" | "nav" | "context";

/** What a layout draft was made against: keylang.json's buffer (null: none open), the file, the code snapshot. */
interface LayoutBasis {
  version: number | null;
  disk: string | null;
  snapshot: string | null;
}

/** Where the session was when a draft started: a proposal opens by itself only while this is still so. */
interface DraftOrigin {
  path: string | null;
  mode: Mode;
  version: number | null;
  /** The F6 panel was open, on the record at `record`: an operation started from a report. */
  results: boolean;
  record: number;
}
