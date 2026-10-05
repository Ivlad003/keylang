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
// in `assist.ts`; this class dispatches input to them and keeps the editor.

import { existsSync, lstatSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { analyze, within, type Analysis, type AnalysisRequest } from "../analyze.ts";
import { CONFIG_FILE, guessLayout, loadConfig, parseConfig, resolveStatic, STATIC_MODES, toPosix, withLayers, type StaticMode } from "../config.ts";
import { collectMdFiles } from "../files.ts";
import { sectionNodes, walk, type Document, type Node } from "../ir.ts";
import { completions, definition, hover, references, targetAt, workspace, type LspPosition, type Workspace } from "../lsp-features.ts";
import { contextPack, contextText, type ContextPack } from "../agent-context.ts";
import type { CheckResult } from "../check-results.ts";
import { edgeIdKnown } from "../explain-edge.ts";
import { formatSummary, summarizeNode } from "../explain-node.ts";
import { codeExplanation, isDiagnosticCode, nodeExplanation, savedAnswerMiss, unknownIdMessage, type SavedAnswer } from "../explain-offline.ts";
import { flowOverlay, flowsThrough, MAX_DEPTH, zoomContainer, zoomEdges, zoomLevel, zoomParent, zoomSelectKey, zoomTarget, ZOOM_ROOT, type FlowOverlay, type ZoomEdge, type ZoomRow } from "./zoom.ts";
import { readExplanation } from "../explain-llm.ts";
import { selectedAgent } from "../agent-cli.ts";
import { defaultBriefJobs, positiveIntegerProblem } from "../explain-inventory.ts";
import type { LlmSetup } from "../llm.ts";
import { EXPLANATIONS } from "../explain.ts";
import { explainDir, explanationPath, loadBriefs, type ExplanationDetail } from "../explanations.ts";
import { FACT_CACHE_FILE } from "../fact-cache.ts";
import { baselinePath } from "../baseline.ts";
import { harnessChoice, HARNESS_PATHS, planAgents, type HarnessChoice } from "../harness.ts";
import { EXPLAINED_MAP_DIR } from "../map.ts";
import { searchNodes } from "../node-search.ts";
import { codeToSpecTriggers } from "../draft.ts";
import { plannedCodeTarget } from "../spec-to-code.ts";
import { PROPOSALS_DIR, proposalProblem } from "../proposals.ts";
import { C4_FORMATS, C4_LEVELS, isC4Diagram } from "../c4-export.ts";
import { exportTargetProblem, exportText, FEATURE_SLUG, featureReportOf, featureSlugOf, initSources, resultWithout, runOperation, WIRE_OUT, wireOutProblem, WRITING_KINDS, type CodeToSpecRequest, type CodeToSpecSource, type CommitGate, type CommitPlan, type DraftFlowRequest, type DraftLayoutRequest, type DraftRulesRequest, type ExplainBatchRequest, type ExplainPlanRequest, type ExportC4Request, type ExportFormat, type ExportSource, type OperationContext, type OperationRequest, type OperationResult, type SpecToCodeRequest } from "../operations.ts";
import { CHECK_FORMATS, isCheckFormat } from "../check-format.ts";
import { formatDiagnostic } from "../diag.ts";
import { PARSE_FORMATS, type ParseFormat } from "../parse-format.ts";
import { defaultMicrophone } from "../voice-local.ts";
import { compareText } from "../span.ts";
import { WIRE_MARKER } from "../wire-gen.ts";
import { actionLabel, applyRecord, catalog, exportRecord, matchActions, MERGE_REASON, NO_AGENT_REASON, noSnapshotReason, START_ACTIONS } from "./actions.ts";
import { Assist, countSuggestion, type Microphone } from "./assist.ts";
import { OperationWorker } from "./background.ts";
import { bufferLines, isDirty, lineLayout, newBuffer, newFileBuffer, setText } from "./buffer.ts";
import { readText, splitEol, withEol, writeInside } from "./disk.ts";
import { defaultSpecPath, flowNameProblem, newSpecProblem, SPEC_KINDS, specTemplate, suggestedFlowName } from "./new-spec.ts";
import { DEFAULT_FILTER, FILTER_KEYS, findingsOf, sameResult, visibleFindings } from "./findings.ts";
import { InputDecoder, type InputEvent, type KeyEvent, type MouseEvent } from "./input.ts";
import { mergeRows } from "./merge.ts";
import { errorText, MergeSession, type ProposalEntry } from "./merge-session.ts";
import { renderDiff, type Grid } from "./screen.ts";
import type { Buffer, C4Form, CodeDraftForm, ConfigState, Cursor, DraftForm, ExplainPlanForm, Hover, Mode, NewSpecForm, OperationRecord, RulesDraftForm, SpecCodeForm, State } from "./state.ts";
import { evidenceOf } from "./evidence.ts";
import { textToSpec } from "./text-to-spec.ts";
import { batchState, contextTop, edgeItems, editorRows, featureItems, filesTop, findingsListRows, gutterWidth, helpScrollMax, layout, navEntries, navListHeight, operationLabel, PANEL_MIN_COLS, readCursorRow, recordSummary, render, reportOverflow, resultsReportRows, resultsSplit, ZOOM_HEAD, zoomListHeight, zoomButtons, type ZoomButton } from "./view.ts";
import { clusterAt, clusterAtCell, graphemes, padWidth, scrollToFit, stringWidth } from "./width.ts";

export interface Surface {
  write(ansi: string): void;
  /** Terminal only: open a file in `$EDITOR`, handing it the screen. */
  openEditor?: (abs: string, line: number) => Promise<void>;
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
/** Keys handled before the mode: they show panels and reanalyse, and never edit. */
const PANEL_KEYS = new Set(["f2", "f3", "f4", "f5", "f6"]);

/** Most nodes the `s` prompt lists. */
const NODE_HITS = 50;

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
  /** `llmClient`, loaded with the first model form: the form says before a run why no model can be asked. */
  private llmSetup: ((agent: string | null) => LlmSetup) | null = null;
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

  constructor(options: AppOptions) {
    this.analyzer = options.analyzer ?? analyze;
    this.operationWorker = options.operationWorker ?? null;
    // Doctor only reads settings and probes optional native modules: it stays here. Feature and
    // map-check analyse the whole repository in the worker, which has no fallback to this thread.
    this.operations = options.operations ?? ((request, context) => (request.kind === "doctor" ? runOperation(request, context) : this.worker().run(request, context)));
    this.onQuit = options.onQuit ?? (() => {});
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
    // The first frame comes from disk, before any analysis: a cold start shows text at once.
    this.state.files = this.diskFiles();
    const first = this.state.files.find((file) => file.includes("/flows/")) ?? this.state.files[0];
    if (first) this.open(first, { line: 0, col: 0 }, false);
    this.state.proposals = this.merges.scan();
    const config = configState(this.state.root);
    this.state.config = config;
    // No config: the start screen, and no analysis until Browse (design §2.1). Invalid: its text, at the field.
    if (config.kind === "missing-config") this.state.start = 0;
    else if (config.kind === "invalid-config") this.openConfig(config.reason, false);
    else this.reanalyze();
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
    // A closed session takes no keys: nothing may start an analysis, a save or an operation after it.
    if (this.closed) return;
    if (this.escTimer) clearTimeout(this.escTimer);
    this.escTimer = null;
    const events = this.decoder.feed(chunk);
    for (let i = 0; i < events.length; ) {
      const run = typedRun(events, i);
      if (run.length > 1 && !this.state.prompt && !this.state.completion && !this.state.results.open && pastedRun(run, this.state.mode === "edit")) {
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
    return render(this.state);
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
    const grid = render(this.state);
    this.surface.write(renderDiff(this.previous, grid));
    this.previous = grid;
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
          const selected = this.selectedFinding();
          this.state.analysis = analysis;
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
    const config = configState(this.state.root);
    this.state.config = config;
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
    this.clampFinding();
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
    const explained = [...(analysis.map?.explained?.keys() ?? [])].map((name) => `${analysis.config.dir}/${EXPLAINED_MAP_DIR}/${name}`);
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
   * analysis against the plan at HEAD, as `keylang feature` computes it. It
   * follows a save and its analysis, never typing: while the buffer has
   * unsaved edits the last line stays.
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
    // The plan at HEAD is read in the operation worker: the session's thread starts no git process.
    // A newer refresh (another analysis, another file) supersedes this one; an unknown base keeps the line.
    this.track(
      this.worker()
        .featureBase(this.state.root, path)
        .then((base) => {
          if (request !== this.featureLineRequest || this.closed || base === null) return;
          const report = featureReportOf(analysis, slug, base);
          this.state.featureLine = report === null ? null : { path, stage: report.stage, questions: report.gaps.filter((gap) => gap.kind === "question").length };
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
    if (remember && this.state.current) this.state.back.push({ path: this.state.current, cursor: { ...this.state.cursor }, mode: this.state.mode === "code" ? "view" : this.state.mode });
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
    return { map: `${analysis.config.dir}/map/`, explained: `${analysis.config.dir}/${EXPLAINED_MAP_DIR}/` };
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
    // The save step is modal: the pointer and pasted text do not reach what is under it.
    if (event.type === "mouse") {
      if (!this.state.barrier && !this.state.quit) this.mouse(event);
      return;
    }
    if (event.type === "paste") {
      if (this.state.results.open || this.state.barrier || this.state.quit) return;
      if (this.state.prompt) this.promptType(event.text.replace(/\n/g, " "));
      else if (this.state.mode === "edit") this.insert(event.text);
      else this.state.message = "paste: press i to edit first";
      return;
    }
    this.state.message = null;
    if (event.name !== "q" && !(event.ctrl && event.name === "c")) this.state.quitArmed = false;
    if (event.ctrl && event.name === "c") return this.quit();
    if (this.state.quit) return this.quitKey(event);
    // The help scrolls with the arrows and a page; any other key closes it.
    if (this.state.help) return this.helpKey(event);
    if (this.state.barrier) return this.barrierKey(event);
    if (this.state.prompt) return this.promptKey(event);
    // Ctrl+P opens the palette from any ordinary mode (view/read/edit/code) and from the panels; in MERGE it
    // allows viewing the catalogue and independent read-only actions, the rest explain why they are blocked.
    if (event.ctrl && event.name === "p") return this.openPalette();
    // In raw mode the terminal sends Ctrl+Z as a key, not SIGTSTP: outside the editor (where it undoes) and
    // MERGE (where `u` does), it stops keylang as in any shell. A surface that cannot stop (web) ignores it.
    if (event.ctrl && event.name === "z" && this.state.mode !== "edit" && this.state.mode !== "merge") return this.surface?.suspend?.();
    if (this.state.results.open) {
      if (this.state.results.viewing) {
        // The panel is hidden while the finding's target is shown; the keys go to the editor or the
        // code viewer. Esc / Ctrl+O (and q in the code viewer) bring the list back and put back the place the finding was opened
        // from (Esc in edit mode leaves editing first); F6 closes the panel and stays at the target.
        if ((event.name === "escape" && this.state.mode !== "edit") || (event.ctrl && event.name === "o") || (event.name === "q" && this.state.mode === "code")) return this.returnToFindings();
        if (event.name === "f6") return this.closeResults();
      } else {
        return this.resultsKey(event);
      }
    }
    if (this.state.start !== null && event.name !== "f6") return this.startKey(event);
    if (event.name === "f5") return this.reanalyze();
    if (event.name === "f6") return this.openResults();
    // Panels take the focus only where keys go to the focused panel (the view); in the editor, MERGE and
    // the code viewer they are shown, and the keys still go where they went.
    const focusable = this.state.mode === "view" || this.state.mode === "read";
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
        return this.zoomKey(event);
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
        return this.openZoom(this.idAtCursor() ?? this.nodeAtCursor());
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
        return this.openZoom(item?.id ?? null);
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

  // ---------- the zoom screen (c4-zoom/07) ----------

  /**
   * `z`: the zoom screen at `id` (its own level, or the level it is a row
   * of, that row selected), else at the repository. The view underneath stays
   * as it is; `q` comes back to it at the node selected last.
   */
  private openZoom(id: string | null): void {
    const analysis = this.state.analysis;
    if (!analysis?.snapshot) {
      this.state.message = analysis ? (noSnapshotReason(this.state) ?? "no code snapshot to zoom into") : "analysis is still running";
      return;
    }
    const target = (id === null ? null : zoomTarget(analysis, id)) ?? { focus: ZOOM_ROOT, select: null };
    this.state.zoom ??= { focus: ZOOM_ROOT, depth: 1, selected: new Map(), top: 0, view: "nodes", from: null, flow: null };
    this.state.mode = "zoom";
    this.state.focus = "editor";
    this.state.hover = null;
    this.state.completion = null;
    this.state.selection = null;
    this.zoomTo(target.focus, target.select);
  }

  /** The level of `focus`, `select` (or the row selected there before) under the cursor. */
  private zoomTo(focus: string, select: string | null): void {
    const zoom = this.state.zoom!;
    zoom.focus = focus;
    zoom.top = 0;
    if (select !== null && zoom.view === "nodes") {
      const index = this.zoomRows().findIndex((row) => row.id === select);
      if (index >= 0) zoom.selected.set(focus, index);
    }
    this.state.hover = null;
    this.keepZoomVisible();
  }

  /** The edges view of the level shown (`c`): its rows. */
  private zoomEdgeRows(): ZoomEdge[] {
    const analysis = this.state.analysis;
    const zoom = this.state.zoom;
    if (!analysis?.snapshot || !zoom) return [];
    this.zoomRows();
    return zoomEdges(analysis, zoom.focus);
  }

  /** How many rows the shown view of the level has. */
  private zoomCount(): number {
    return this.state.zoom?.view === "edges" ? this.zoomEdgeRows().length : this.zoomRows().length;
  }

  /** The rows of the level shown; the repository's when the focus left the snapshot with a new analysis. */
  private zoomRows(): ZoomRow[] {
    const analysis = this.state.analysis;
    const zoom = this.state.zoom;
    if (!analysis?.snapshot || !zoom) return [];
    if (zoom.focus !== ZOOM_ROOT && !analysis.snapshot.nodes[zoom.focus]) {
      zoom.focus = ZOOM_ROOT;
      this.state.message = "that level is gone from the snapshot: back at the repository";
    }
    return zoomLevel(analysis, zoom.focus, zoom.depth).rows;
  }

  /** The selected row of the shown view, clamped to `rows`. */
  private zoomIndex(rows: readonly unknown[]): number {
    const zoom = this.state.zoom!;
    return Math.max(0, Math.min(zoom.selected.get(zoomSelectKey(zoom)) ?? 0, rows.length - 1));
  }

  /** Keeps the selected row inside the shown rows of the zoom screen. */
  private keepZoomVisible(): void {
    const zoom = this.state.zoom;
    if (!zoom) return;
    const visible = Math.max(1, zoomListHeight(this.state, layout(this.state).editor));
    const at = zoom.view === "edges" ? this.zoomIndex(this.zoomEdgeRows()) : this.zoomIndex(this.zoomRows());
    if (at < zoom.top) zoom.top = at;
    else if (at >= zoom.top + visible) zoom.top = at - visible + 1;
  }

  /** One level up, the cursor on the node it came from; at the repository Esc closes the screen. */
  private zoomUp(close: boolean): void {
    const analysis = this.state.analysis!;
    const zoom = this.state.zoom!;
    const above = zoomParent(analysis, zoom.focus);
    if (above === null) {
      if (close) return this.closeZoom();
      this.state.message = "the repository is the top level: q closes the zoom";
      return;
    }
    this.zoomTo(above, zoom.focus);
  }

  /** `>` and `<`: neighbors one edge farther or nearer, from none up to `MAX_DEPTH`. */
  private zoomDepth(delta: number): void {
    const zoom = this.state.zoom!;
    if (zoom.view === "edges") {
      this.state.message = "the edges view shows direct edges: c goes back to the nodes and their depth";
      return;
    }
    const depth = Math.max(0, Math.min(MAX_DEPTH, zoom.depth + delta));
    if (depth === zoom.depth) {
      this.state.message = delta > 0 ? `depth ${MAX_DEPTH} is the farthest` : "depth 0: only the children";
      return;
    }
    const before = this.zoomRows();
    const selected = before[this.zoomIndex(before)]?.id ?? null;
    zoom.depth = depth;
    const rows = this.zoomRows();
    const index = selected === null ? -1 : rows.findIndex((row) => row.id === selected);
    zoom.selected.set(zoom.focus, index >= 0 ? index : this.zoomIndex(rows));
    this.keepZoomVisible();
  }

  /** `q`: back to the view, at the node selected on the level (in the map of its layer), or at the focus. */
  private closeZoom(follow = true): void {
    const rows = this.zoomRows();
    const row = rows[this.zoomIndex(rows)];
    const focus = this.state.zoom?.focus ?? ZOOM_ROOT;
    this.state.mode = "view";
    this.state.hover = null;
    if (!follow) return;
    const id = row && row.kind !== "more" ? row.id : focus;
    if (id !== ZOOM_ROOT) this.goToNode(id);
  }

  /** Enter on a fn or type: its code in the viewer; Esc there comes back to this level. */
  private zoomCode(id: string): void {
    const node = this.state.analysis?.snapshot?.nodes[id];
    if (!node?.file) {
      this.state.message = `\`${id}\` has no code to open`;
      return;
    }
    this.jump(resolve(this.state.root, node.file), node.line ?? 1);
  }

  /** The wheel scrolls the rows of the zoom screen; a click on a row selects it and opens nothing. */
  private zoomMouse(event: MouseEvent, editor: { x: number; y: number; width: number; height: number }): void {
    const zoom = this.state.zoom;
    if (!zoom) return;
    if (event.action === "wheel-up" || event.action === "wheel-down") {
      zoom.top = Math.max(0, Math.min(Math.max(0, this.zoomCount() - 1), zoom.top + (event.action === "wheel-up" ? -3 : 3)));
      this.state.hover = null;
      return;
    }
    if (event.action !== "down" || event.button !== 0) return;
    // A button of the header does what its key does.
    if (event.y === editor.y) {
      const button = zoomButtons(zoom, editor.width).buttons.find((item) => event.x - editor.x >= item.x && event.x - editor.x < item.x + item.width);
      if (button) this.zoomButton(button.action);
      return;
    }
    const index = zoom.top + event.y - editor.y - ZOOM_HEAD;
    if (event.y < editor.y + ZOOM_HEAD || index >= this.zoomCount()) return;
    zoom.selected.set(zoomSelectKey(zoom), index);
    this.state.hover = null;
  }

  /** A header button of the zoom screen: the same as its key. */
  private zoomButton(action: ZoomButton["action"]): void {
    const key = { up: "-", in: "+", shallower: "<", deeper: ">", edges: "c", flow: "f" }[action];
    this.zoomKey({ type: "key", name: key, ctrl: false, alt: false, shift: false, text: key });
  }

  /** `e` and `K`: the explain hover of the selected node, as `e` shows it in the view. */
  private zoomExplain(row: ZoomRow | undefined): void {
    const analysis = this.state.analysis;
    if (!analysis || !row || row.kind === "more") return;
    const found = nodeExplanation(analysis, row.id, analysis.config.explain.detail);
    if ("unknown" in found) {
      this.state.message = unknownIdMessage(row.id, found.suggestion);
      return;
    }
    const editor = layout(this.state).editor;
    const zoom = this.state.zoom!;
    const at = zoom.view === "edges" ? this.zoomIndex(this.zoomEdgeRows()) : this.zoomIndex(this.zoomRows());
    const y = editor.y + ZOOM_HEAD + (at - zoom.top);
    this.state.hover = { x: editor.x + 2, y, lines: this.explainLines(row.id, found), source: "key" };
  }

  /** `f`: the flow picker, the flows through this level first; with a flow laid over the levels, `f` takes it off. */
  private zoomFlowKey(): void {
    const zoom = this.state.zoom!;
    if (zoom.flow !== null) {
      this.state.message = `flow ${zoom.flow} taken off`;
      zoom.flow = null;
      return;
    }
    this.state.prompt = { kind: "flow", text: "", items: [], ids: [], index: 0 };
    this.findFlows();
  }

  /** The flow picker's list: every flow whose name has the typed text, those through the level first. */
  private findFlows(): void {
    const prompt = this.state.prompt;
    const analysis = this.state.analysis;
    if (prompt?.kind !== "flow" || !analysis) return;
    const through = new Set(flowsThrough(analysis, this.state.zoom?.focus ?? ZOOM_ROOT));
    const query = prompt.text.trim().toLowerCase();
    const names = [...new Set(analysis.spec.flows.map((flow) => flow.name))].filter((name) => name.toLowerCase().includes(query));
    names.sort((a, b) => Number(through.has(b)) - Number(through.has(a)) || (a < b ? -1 : a > b ? 1 : 0));
    prompt.ids = names;
    prompt.items = names.map((name) => `${name}${through.has(name) ? " · through this level" : ""}`);
    prompt.index = Math.min(prompt.index, Math.max(0, names.length - 1));
  }

  /** `F`: the next flow through the level, after the one laid over it. */
  private zoomNextFlow(): void {
    const zoom = this.state.zoom!;
    const through = flowsThrough(this.state.analysis!, zoom.focus);
    if (through.length === 0) {
      this.state.message = "no flow goes through this level";
      return;
    }
    const at = zoom.flow === null ? -1 : through.indexOf(zoom.flow);
    zoom.flow = through[(at + 1) % through.length]!;
    this.state.message = `flow ${zoom.flow} (${((at + 1) % through.length) + 1} of ${through.length} through this level)`;
  }

  /** The flow laid over the shown level, numbered on its units. */
  private zoomOverlay(): FlowOverlay | null {
    const analysis = this.state.analysis;
    const zoom = this.state.zoom;
    if (!analysis || !zoom || zoom.flow === null) return null;
    return flowOverlay(analysis, zoom.flow, zoom.focus, (file, line) => evidenceOf(analysis, file).get(line)?.mark ?? null);
  }

  /** `c`: the level's edges as rows, or back to its nodes. */
  private zoomToggleView(): void {
    const zoom = this.state.zoom!;
    zoom.view = zoom.view === "edges" ? "nodes" : "edges";
    zoom.top = 0;
    this.state.hover = null;
    this.keepZoomVisible();
  }

  /** Enter on an edge: the level of its other end, in the edges view; a fn or type, the level it is a row of. */
  private zoomAlongEdge(edge: ZoomEdge): void {
    const analysis = this.state.analysis!;
    const target = zoomContainer(analysis, edge.other) ? edge.other : zoomParent(analysis, edge.other);
    if (target === null || edge.group === "unresolved") {
      this.state.message = edge.group === "unresolved" ? "these constructs have no edge to follow: e explains the node" : `\`${edge.other}\` has no level`;
      return;
    }
    this.zoomTo(target, null);
  }

  /** `x`: in the edges view the edges of the selected row; on nodes, the first `x` marks the from end, the second explains from it to the selected node. */
  private zoomExplainEdge(row: ZoomRow | undefined, edge: ZoomEdge | undefined): void {
    const zoom = this.state.zoom!;
    let from: string;
    let to: string;
    if (zoom.view === "edges") {
      if (!edge || edge.group === "unresolved") return;
      from = edge.from;
      to = edge.to;
    } else {
      if (!row || row.kind === "more") return;
      if (zoom.from === null || zoom.from === row.id) {
        zoom.from = row.id;
        this.state.message = `from ${row.id}: x on another node explains the edges between them`;
        return;
      }
      from = zoom.from;
      to = row.id;
      zoom.from = null;
    }
    this.requestOperation("explain-edge", { kind: "explain-edge", root: this.state.root, from: from === ZOOM_ROOT ? to : from, to });
  }

  private zoomKey(event: KeyEvent): void {
    const analysis = this.state.analysis;
    const zoom = this.state.zoom;
    if (!analysis?.snapshot || !zoom) {
      this.state.mode = "view";
      return;
    }
    const edges = zoom.view === "edges" ? this.zoomEdgeRows() : [];
    const rows = zoom.view === "edges" ? [] : this.zoomRows();
    const count = zoom.view === "edges" ? edges.length : rows.length;
    const at = zoom.view === "edges" ? this.zoomIndex(edges) : this.zoomIndex(rows);
    const row = rows[at];
    const edge = edges[at];
    const page = Math.max(1, zoomListHeight(this.state, layout(this.state).editor) - 1);
    const select = (index: number): void => {
      zoom.selected.set(zoomSelectKey(zoom), Math.max(0, Math.min(index, count - 1)));
      this.state.hover = null;
      this.keepZoomVisible();
    };
    if (event.alt && event.name === "enter") {
      const id = zoom.view === "edges" ? edge?.other : row && row.kind !== "more" ? row.id : undefined;
      if (id === undefined) return;
      // With a flow laid over the level, a step of it goes to its line in the flow.
      const overlay = this.zoomOverlay();
      const step = overlay?.steps.get(id)?.[0];
      const line = step === undefined ? undefined : overlay!.marks.get(step)?.line;
      this.closeZoom(false);
      if (overlay && line !== undefined) return this.open(overlay.file, { line: line - 1, col: 0 });
      return this.goToSpec(id);
    }
    if (event.ctrl || event.alt) return;
    switch (event.name) {
      case "up":
      case "k":
        return select(at - 1);
      case "down":
      case "j":
        return select(at + 1);
      case "pageup":
        return select(at - page);
      case "pagedown":
        return select(at + page);
      case "home":
      case "g":
        return select(0);
      case "end":
      case "G":
        return select(count - 1);
      case "+":
      case "=":
      case "enter": {
        if (zoom.view === "edges") return edge ? this.zoomAlongEdge(edge) : undefined;
        if (!row) return;
        if (row.kind === "more") return this.zoomDepth(1);
        if (row.container) return this.zoomTo(row.id, null);
        if (event.name === "enter") return this.zoomCode(row.id);
        this.state.message = `\`${row.id}\` has no level of its own: Enter opens its code`;
        return;
      }
      case "-":
      case "backspace":
        return this.zoomUp(false);
      case "escape":
        if (this.state.hover) {
          this.state.hover = null;
          return;
        }
        return this.zoomUp(true);
      case ">":
        return this.zoomDepth(1);
      case "<":
        return this.zoomDepth(-1);
      case "s":
        this.state.prompt = { kind: "node", text: "", items: [], ids: [], index: 0 };
        return this.findNodes();
      case "e":
      case "K":
        return zoom.view === "edges" ? this.zoomExplain(edge ? this.zoomRows().find((item) => item.id === edge.other) : undefined) : this.zoomExplain(row);
      case "c":
        return this.zoomToggleView();
      case "f":
        return this.zoomFlowKey();
      case "F":
        return this.zoomNextFlow();
      case "x":
        return this.zoomExplainEdge(row, edge);
      case ":":
        return this.openPalette();
      case "?":
        this.state.help = true;
        return;
      case "q":
        return this.closeZoom();
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

  // ---------- operations and results (F6) ----------

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
   * buffers are dirty (design §2.5), then as the session's one explicit
   * operation. A second one is refused while one runs.
   */
  private requestOperation(action: string, request: OperationRequest): void {
    if (this.state.activeOperation !== null) {
      this.state.message = "an operation is already running";
      return;
    }
    if (request.kind === "baseline") {
      // The baseline reads the code and the saved keylang.json, not the specs. The form already
      // explained the write, so only a dirty keylang.json opens the step, which names the target.
      const isConfig = (path: string): boolean => path === CONFIG_FILE;
      const writes = !request.check && this.dirtyInputs().some(isConfig) ? { writes: [baselinePath({ dir: this.specDir() })] } : {};
      return this.withSavedInputs(operationLabel(request), () => this.startOperation(action, request), { inputs: isConfig, ...writes });
    }
    if (request.kind === "agents") {
      // Agents reads the harness files only, never the specs or keylang.json: dirty spec and config
      // buffers stay dirty. The form already showed what the write changes, so there is no extra step.
      const isHarness = (path: string): boolean => (HARNESS_PATHS as readonly string[]).includes(path);
      return this.withSavedInputs(operationLabel(request), () => this.startOperation(action, request), { inputs: isHarness });
    }
    if (request.kind === "init") {
      // Init reads the saved keylang.json (kept when it exists), the harness files and the code, never
      // the specs: dirty spec buffers stay dirty. The form already named the classes of files it writes.
      const isInput = (path: string): boolean => path === CONFIG_FILE || (HARNESS_PATHS as readonly string[]).includes(path);
      const writes = !request.check && this.dirtyInputs().some(isInput) ? { writes: this.initTargets() } : {};
      return this.withSavedInputs(operationLabel(request), () => this.startOperation(action, request), { inputs: isInput, ...writes });
    }
    if (request.kind === "fmt" || request.kind === "parse") {
      // Fmt and parse read the saved bytes of the chosen files and the edition in keylang.json: those
      // dirty buffers are saved first; other dirty specs stay dirty and are never read behind them.
      const selected = request.paths.map((path) => toPosix(relative(this.state.root, resolve(this.state.root, path))));
      const isInput = (path: string): boolean => path === CONFIG_FILE || selected.some((chosen) => chosen === "" || path === chosen || path.startsWith(`${chosen}/`));
      return this.withSavedInputs(operationLabel(request), () => this.startOperation(action, request), { inputs: isInput });
    }
    if (request.kind === "check") {
      // Check reads the saved specs under its paths and the saved keylang.json: those dirty buffers are
      // saved first; other dirty buffers stay dirty. The check itself never writes.
      const selected = (request.paths.length > 0 ? request.paths : [this.specDir()]).map((path) => toPosix(relative(this.state.root, resolve(this.state.root, path))));
      const isInput = (path: string): boolean => path === CONFIG_FILE || selected.some((chosen) => chosen === "" || path === chosen || path.startsWith(`${chosen}/`));
      return this.withSavedInputs(operationLabel(request), () => this.startOperation(action, request), { inputs: isInput });
    }
    if (request.kind === "explain-edge") {
      // Explain-edge reads the saved code and keylang.json, never the specs: only a dirty keylang.json is saved first.
      return this.withSavedInputs(operationLabel(request), () => this.startOperation(action, request), { inputs: (path) => path === CONFIG_FILE });
    }
    if (request.kind === "explain") {
      // A code's help reads nothing: no save step. A node's summary reads the saved specs and their
      // saved explanations under the spec directory, keylang.json and the code: those dirty buffers are saved first.
      if (isDiagnosticCode(request.subject)) return this.startOperation(action, request);
      const dir = `${this.specDir()}/`;
      return this.withSavedInputs(operationLabel(request), () => this.startOperation(action, request), { inputs: (path) => path === CONFIG_FILE || path.startsWith(dir) });
    }
    if (request.kind === "explain-plan") {
      // The inventory reads the saved explanations and specs under the spec directory, keylang.json and the code: those dirty buffers are saved first.
      const dir = `${this.specDir()}/`;
      return this.withSavedInputs(operationLabel(request), () => this.startOperation(action, request), { inputs: (path) => path === CONFIG_FILE || path.startsWith(dir) });
    }
    if (request.kind === "explain-batch") {
      // As the plan: the saved specs and explanations under the spec directory, keylang.json and the code
      // are saved first; the step names the briefs the batch writes.
      const dir = `${this.specDir()}/`;
      const isInput = (path: string): boolean => path === CONFIG_FILE || path.startsWith(dir);
      const writes = this.dirtyInputs().some(isInput) ? { writes: [`${explainDir({ dir: this.specDir() })}/brief/<id>.md of each planned node`] } : {};
      return this.withSavedInputs(operationLabel(request), () => this.startOperation(action, request), { inputs: isInput, ...writes });
    }
    if (request.kind === "explain-llm") {
      // As a node's offline summary: the saved specs and explanations under the spec directory, keylang.json
      // and the code are saved first; the step names the explanation a new answer would replace.
      const dir = `${this.specDir()}/`;
      const isInput = (path: string): boolean => path === CONFIG_FILE || path.startsWith(dir);
      const writes = this.dirtyInputs().some(isInput) ? { writes: [explanationPath({ dir: this.specDir() }, request.id, request.detail ?? "short")] } : {};
      return this.withSavedInputs(operationLabel(request), () => this.startOperation(action, request), { inputs: isInput, ...writes });
    }
    if (request.kind === "export-c4") {
      // The diagram reads the saved code, keylang.json and the saved briefs under the spec directory: those
      // dirty buffers are saved first; the step names the file it writes, when there is one.
      const dir = `${this.specDir()}/`;
      const isInput = (path: string): boolean => path === CONFIG_FILE || path.startsWith(dir);
      const writes = request.out !== undefined && this.dirtyInputs().some(isInput) ? { writes: [request.out] } : {};
      return this.withSavedInputs(operationLabel(request), () => this.startOperation(action, request), { inputs: isInput, ...writes });
    }
    if (request.kind === "feature-questions") {
      // The questions read the saved feature file, the specs around it, keylang.json and the code: those dirty
      // buffers are saved first; the step names the proposal the answer becomes.
      const dir = `${this.specDir()}/`;
      const isInput = (path: string): boolean => path === CONFIG_FILE || path.startsWith(dir);
      const writes = this.dirtyInputs().some(isInput) ? { writes: [`${PROPOSALS_DIR}/${dir}features/${request.slug}.md`] } : {};
      return this.withSavedInputs(operationLabel(request), () => this.startOperation(action, request), { inputs: isInput, ...writes });
    }
    if (request.kind === "trace-plan") {
      // The plan reads the saved specs under the spec directory (the flow), keylang.json and the code:
      // those dirty buffers are saved first, so the plan's IDs and hashes are the files on disk.
      const dir = `${this.specDir()}/`;
      return this.withSavedInputs(operationLabel(request), () => this.startOperation(action, request), { inputs: (path) => path === CONFIG_FILE || path.startsWith(dir) });
    }
    if (request.kind === "draft-flow") {
      // The draft reads the saved code and keylang.json; the target is read from disk and was refused
      // above when dirty. Only a dirty keylang.json is saved first; other dirty specs stay dirty.
      const isConfig = (path: string): boolean => path === CONFIG_FILE;
      const writes = request.output === "proposal" && this.dirtyInputs().some(isConfig) ? { writes: [`${PROPOSALS_DIR}/${this.draftTarget({ trigger: request.trigger, name: request.name ?? "", into: request.into ?? "" }).target}`] } : {};
      return this.withSavedInputs(operationLabel(request), () => this.startOperation(action, request), { inputs: isConfig, ...writes });
    }
    if (request.kind === "code-to-spec") {
      // As a flow draft: the saved code and keylang.json; the target was refused above when dirty. Only a dirty keylang.json is saved first.
      const isConfig = (path: string): boolean => path === CONFIG_FILE;
      const target = this.codeDraftTarget(this.codeDraftFormOf(request));
      const writes = request.output === "proposal" && this.dirtyInputs().some(isConfig) ? { writes: [`${PROPOSALS_DIR}/${target}`] } : {};
      return this.withSavedInputs(operationLabel(request), () => this.startOperation(action, request), { inputs: isConfig, ...writes });
    }
    if (request.kind === "spec-to-code") {
      // The candidate reads the saved specs (the planned signature, the flows' tests), keylang.json and
      // the code: those dirty buffers are saved first; the step names the proposals it would write.
      const dir = `${this.specDir()}/`;
      const isInput = (path: string): boolean => path === CONFIG_FILE || path.startsWith(dir);
      const placed = this.specCodeTarget({ id: request.id, into: request.into ?? "", mode: request.mode ?? "algo", output: request.output });
      const code = placed !== null && "file" in placed ? placed.file : "<the module's file>";
      const writes = request.output === "proposal" && this.dirtyInputs().some(isInput) ? { writes: [`${PROPOSALS_DIR}/${code}`, `${PROPOSALS_DIR}/<each new test file of its flows>`] } : {};
      return this.withSavedInputs(operationLabel(request), () => this.startOperation(action, request), { inputs: isInput, ...writes });
    }
    if (request.kind === "apply-code") {
      // Nothing is computed again: no dirty buffer is read or saved. The step names every file the
      // candidate writes, so the write is a decision of its own, never the end of a generation.
      const files = request.candidate.targets.map((target) => target.file);
      return this.withSavedInputs(operationLabel(request), () => this.startOperation(action, request), { inputs: () => false, writes: files, writesNote: "Writes these files directly, as spec-to-code --apply (no proposal, no test is run):" });
    }
    if (request.kind === "draft-rules") {
      // As a flow draft: the saved code and keylang.json (and the saved specs the model's rules are checked
      // with); only a dirty keylang.json is saved first; the target was refused above when dirty.
      const isConfig = (path: string): boolean => path === CONFIG_FILE;
      const writes = request.output === "proposal" && this.dirtyInputs().some(isConfig) ? { writes: [`${PROPOSALS_DIR}/${this.rulesTarget(request.into ?? "")}`] } : {};
      return this.withSavedInputs(operationLabel(request), () => this.startOperation(action, request), { inputs: isConfig, ...writes });
    }
    if (request.kind === "draft-layout") {
      // The layout reads the saved keylang.json and the code and writes nothing: no save step. A dirty
      // keylang.json stays dirty — the move goes into that buffer, and only after it was edited does it refuse.
      return this.startOperation(action, request);
    }
    if (request.kind === "wire") {
      // Wire reads the saved specs and keylang.json: every dirty spec or config buffer is saved first.
      // A write names its target in that step; without dirty buffers the form already did.
      const writes = !request.check && this.dirtyInputs().length > 0 ? { writes: [request.out ?? WIRE_OUT] } : {};
      return this.withSavedInputs(operationLabel(request), () => this.startOperation(action, request), writes);
    }
    if (request.kind !== "map") return this.withSavedInputs(operationLabel(request), () => this.startOperation(action, request));
    // The map reads the code and the saved keylang.json, not the specs: dirty specs stay dirty
    // and go into the analysis after the commit as overlays. The step names the targets first.
    this.withSavedInputs(operationLabel(request), () => this.startOperation(action, request), { writes: this.mapTargets(), inputs: (path) => path === CONFIG_FILE });
  }

  /** What `keylang map` may write, as the step before it shows. */
  private mapTargets(): string[] {
    const dir = this.specDir();
    return [`${dir}/map/*.md`, `${dir}/${EXPLAINED_MAP_DIR}/*.md`, ".keylang/index.json", FACT_CACHE_FILE];
  }

  /** The classes of files `keylang init` may write, as its form and its save step name them. */
  private initTargets(): string[] {
    const config = existsSync(join(this.state.root, CONFIG_FILE)) ? [] : [CONFIG_FILE];
    return [...config, ...this.mapTargets(), baselinePath({ dir: this.specDir() }), "the harness files of the selection"];
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
   * message, never the end of the session.
   */
  private startOperation(action: string, request: OperationRequest): void {
    if (this.state.activeOperation !== null) {
      this.state.message = "an operation is already running";
      return;
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
      if (request.kind === "draft-flow" || request.kind === "draft-rules") this.afterDraft(record, origin);
      if (request.kind === "code-to-spec") this.afterCodeDraft(record, origin);
      if (request.kind === "spec-to-code") this.afterSpecCode(record, origin);
      if (request.kind === "apply-code") this.afterApplyCode(record);
      if (request.kind === "draft-layout") this.afterLayoutDraft(record);
      if (request.kind === "feature-questions") this.afterFeatureQuestions(record, origin);
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
  }

  /**
   * The session's answer before a commit: a draft's target edited in a buffer
   * while the draft was prepared keeps its text and gets no proposal (the
   * proposal would be judged against the disk under unsaved edits).
   */
  private commitGate(request: OperationRequest, plan?: CommitPlan): CommitGate {
    if (request.kind === "explain-llm" || request.kind === "explain-batch") {
      // A saved explanation edited in a buffer while the model answered keeps its text: the answer is not written over it.
      const edited = (plan?.targets ?? []).filter((target) => {
        const buffer = this.state.buffers.get(target);
        return buffer !== undefined && isDirty(buffer);
      });
      return edited.length > 0 ? { refused: edited.map((target) => `${target}: edited in this session while the model answered; save or undo the edits, then ask again`) } : undefined;
    }
    if (request.kind === "export-c4") {
      // A diagram open with unsaved edits is never written under.
      const edited = (plan?.targets ?? []).filter((target) => {
        const buffer = this.state.buffers.get(target);
        return buffer !== undefined && isDirty(buffer);
      });
      return edited.length > 0 ? { refused: edited.map((target) => `${target}: open with unsaved edits; save or undo them, then export again`) } : undefined;
    }
    if (request.kind === "feature-questions") {
      // The feature file edited while the model answered keeps its text: the proposal would be judged against the disk under unsaved edits.
      const edited = (plan?.targets ?? []).filter((target) => {
        const buffer = this.state.buffers.get(target);
        return buffer !== undefined && isDirty(buffer);
      });
      return edited.length > 0 ? { refused: edited.map((target) => `${target}: edited in this session while the model answered; save or undo the edits, then ask again`) } : undefined;
    }
    if (request.kind === "apply-code") {
      const conflicts = this.applyConflicts(request.candidate.targets.map((target) => target.file), false);
      return conflicts.length > 0 ? { refused: conflicts } : undefined;
    }
    if ((request.kind !== "draft-flow" && request.kind !== "draft-rules" && request.kind !== "code-to-spec" && request.kind !== "spec-to-code") || request.output !== "proposal") return;
    // The operation names the target it resolved; code-to-spec's default target depends on the snapshot it read.
    const targets = plan?.targets ?? (request.kind === "draft-rules" ? [this.rulesTarget(request.into ?? "")] : request.kind === "draft-flow" ? [this.draftTarget({ trigger: request.trigger, name: request.name ?? "", into: request.into ?? "" }).target] : []);
    const edited = targets.filter((target) => {
      const buffer = this.state.buffers.get(target);
      return buffer !== undefined && isDirty(buffer);
    });
    if (edited.length > 0) return { refused: edited.map((target) => `${target}: edited in this session while the draft was prepared; save or undo the edits, then draft again`) };
  }

  /** Cancel (palette, `x` in F6): the running operation ends as cancelled with exit code null. Esc never does this. */
  private cancelOperation(): void {
    if (!this.cancelActive) {
      this.state.message = "no operation is running";
      return;
    }
    this.cancelActive();
  }

  /** The session's operation worker, started on first use; after a failure the next request starts a new one. */
  private worker(): OperationWorker {
    this.operationWorker ??= new OperationWorker();
    return this.operationWorker;
  }

  /** The feature form: the slug of the current feature file, else typed or chosen from the feature files. */
  private openFeaturePrompt(): void {
    const prefix = `${this.specDir()}/features/`;
    const current = this.state.current;
    const initial = current !== null && current.startsWith(prefix) && current.endsWith(".md") && !current.slice(prefix.length).includes("/") ? current.slice(prefix.length, -3) : "";
    this.state.prompt = { kind: "feature", text: initial, items: [], ids: [], index: 0 };
    this.refreshFeaturePrompt();
  }

  /** The feature files matching the typed slug, and the target the form would check. */
  private refreshFeaturePrompt(): void {
    const prompt = this.state.prompt;
    if (prompt?.kind !== "feature") return;
    const prefix = `${this.specDir()}/features/`;
    const slugs = this.state.files.filter((path) => path.startsWith(prefix) && path.endsWith(".md") && !path.slice(prefix.length).includes("/")).map((path) => path.slice(prefix.length, -3));
    const query = prompt.text.toLowerCase();
    // The exact slug first, then the other matches in file order.
    const matches = slugs.filter((slug) => slug.toLowerCase().includes(query)).sort((a, b) => Number(b === prompt.text) - Number(a === prompt.text));
    prompt.ids = matches;
    prompt.items = matches.map((slug) => `${slug}  ${prefix}${slug}.md`);
    prompt.index = 0;
    this.featureNote();
  }

  /** The slug Enter would check: the selected feature file, else the typed text. */
  private featureSlug(): string {
    const prompt = this.state.prompt!;
    return prompt.ids?.[prompt.index] ?? prompt.text.trim();
  }

  private featureNote(): void {
    const prompt = this.state.prompt!;
    const slug = this.featureSlug();
    prompt.note =
      slug === ""
        ? "type a slug: <dir>/features/<slug>.md"
        : FEATURE_SLUG.test(slug)
          ? `checks ${this.state.root}/${this.specDir()}/features/${slug}.md on disk`
          : `invalid slug \`${slug}\`: letters, digits, . _ - (not first)`;
  }

  /** Enter in the feature form: the same slug rule as the CLI; an invalid one keeps the form and the text. */
  private submitFeature(): void {
    const slug = this.featureSlug();
    if (!FEATURE_SLUG.test(slug)) {
      this.state.message = slug === "" ? "feature: a slug is required" : `feature: invalid slug \`${slug}\``;
      return;
    }
    this.state.prompt = null;
    this.requestOperation("feature", { kind: "feature", root: this.state.root, slug });
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

  /**
   * Finished questions: the proposal opens in MERGE while the person is still
   * where they asked — the same file, mode and text, the same report in F6
   * (or the editor) and nothing else open; otherwise it waits as any
   * proposal. The answer's lines left out are counted either way.
   */
  private afterFeatureQuestions(record: OperationRecord, origin: DraftOrigin): void {
    const result = record.result;
    if (result?.kind !== "feature-questions" || result.status !== "completed" || result.payload === null) return;
    const { file, questions, dropped, proposal, agent } = result.payload;
    const left = dropped > 0 ? ` · ${dropped} line(s) of the answer left out: no \`- ? …\` question, or past the fifth` : "";
    if (proposal === null) {
      this.state.message = `questions: ${agent} asked no question, nothing proposed${left}`;
      return;
    }
    if (this.stillWhereAsked(origin)) {
      if (origin.results) this.closeResults();
      this.merges.open(file);
      if (this.state.merge?.path === file) {
        this.state.message = `questions: ${questions.length} proposed for ${file}${left} · MERGE: decide the hunks, w writes ${file}`;
        return;
      }
    }
    this.state.message = `questions: ${proposal} waits: m, Proposals or Enter in F6 opens MERGE${left}`;
  }

  /** The file, mode and text an operation started from are current, F6 shows the report it started from (or stays closed), and nothing else is open. */
  private stillWhereAsked(origin: DraftOrigin): boolean {
    const results = this.state.results;
    const panel = origin.results ? results.open && !results.viewing && results.entry === "record" && results.index === origin.record : !results.open;
    const current = this.state.current === origin.path && this.state.mode === origin.mode && (origin.path === null || this.state.buffers.get(origin.path)?.version === origin.version);
    return panel && current && this.state.merge === null && this.state.prompt === null && this.state.barrier === null && !this.state.help;
  }

  // ---------- baseline ----------

  /** The baseline form: the mode (write or check) and the target from the saved config's spec directory. */
  private openBaselinePrompt(): void {
    const target = baselinePath({ dir: this.specDir() });
    this.state.prompt = {
      kind: "baseline",
      text: "",
      items: [`Write ${target}`, `Check ${target} (writes nothing)`],
      ids: ["write", "check"],
      notes: [
        "the dependencies the code has now become the allowed ones: a new edge between layers or a new package is K102",
        "compares the file with the current layer graph; code 1 when it is stale",
      ],
      index: 0,
    };
    this.state.prompt.note = this.state.prompt.notes![0]!;
  }

  /** Enter in the baseline form: the chosen mode runs as the session's operation. */
  private submitBaseline(): void {
    const prompt = this.state.prompt!;
    const check = prompt.ids?.[prompt.index] === "check";
    this.state.prompt = null;
    this.requestOperation("baseline", { kind: "baseline", root: this.state.root, check });
  }

  // ---------- agents (harness integrations) ----------

  /**
   * The agents form: the typed selection (empty is auto, `none`, or names as
   * in `--agents`) and the mode. It shows what the selection resolves to and
   * which files it would change, read from the disk; nothing runs a harness.
   */
  private openAgentsPrompt(): void {
    this.state.prompt = { kind: "agents", text: "", items: [], ids: ["write", "check"], index: 0 };
    this.refreshAgentsPrompt();
  }

  /** What a selection would do now: the read-only plan of the shared operation, or why it cannot be planned. */
  private agentsPreview(choice: HarnessChoice): { changed: string[]; note: string } {
    try {
      const plan = planAgents(this.state.root, choice);
      if (plan.error !== null) return { changed: [], note: `${plan.error.file}: ${plan.error.message}: nothing can be written until it is fixed` };
      const harnesses = plan.selection.harnesses.join(", ");
      const who =
        choice === "auto" ? `auto: ${harnesses === "" ? "no harness detected, the AGENTS.md block only" : `detected ${harnesses}`}` : choice === "none" ? "none: keylang's harness files are stripped" : harnesses;
      const changed = plan.targets.filter((target) => target.action !== "keep");
      const counts = new Map<string, number>();
      for (const target of changed) counts.set(target.category, (counts.get(target.category) ?? 0) + 1);
      const what = changed.length === 0 ? "every file is current" : `changes ${[...counts].map(([category, n]) => `${category} ${n}`).join(", ")}`;
      const mcp = plan.selection.harnesses.length > 0 ? ` · MCP npx -y keylang@${plan.version} mcp` : "";
      return { changed: changed.map((target) => target.path), note: `${who} · ${what}${mcp} · sets up files only; it does not test the clients` };
    } catch (error) {
      return { changed: [], note: errorText(error) };
    }
  }

  /** The typed selection as a choice, or why it is not one (the CLI's message for `--agents`). */
  private agentsChoice(): HarnessChoice | { error: string } {
    const text = this.state.prompt?.text.trim() ?? "";
    try {
      return text === "" || text === "auto" ? "auto" : harnessChoice(text);
    } catch (error) {
      return { error: errorText(error) };
    }
  }

  private refreshAgentsPrompt(): void {
    const prompt = this.state.prompt;
    if (prompt?.kind !== "agents") return;
    const choice = this.agentsChoice();
    if (typeof choice === "object" && "error" in choice) {
      prompt.items = ["Write the harness files", "Check the harness files (writes nothing)"];
      prompt.note = `${choice.error} · type auto (empty), none, or claude,codex,opencode,cursor`;
      return;
    }
    const preview = this.agentsPreview(choice);
    const shown = preview.changed.length > 3 ? `${preview.changed.slice(0, 3).join(", ")}, …` : preview.changed.join(", ");
    prompt.items = [preview.changed.length === 0 ? "Write: nothing to change" : `Write ${preview.changed.length} file(s): ${shown}`, "Check the harness files (writes nothing)"];
    prompt.note = preview.note;
  }

  /** Enter in the agents form: the typed selection with the chosen mode runs as the session's operation; an invalid one keeps the form. */
  private submitAgents(): void {
    const prompt = this.state.prompt!;
    const choice = this.agentsChoice();
    if (typeof choice === "object" && "error" in choice) {
      this.state.message = `agents: ${choice.error}`;
      return;
    }
    const check = prompt.ids?.[prompt.index] === "check";
    this.state.prompt = null;
    this.requestOperation("agents", { kind: "agents", root: this.state.root, harnesses: choice, check });
  }

  // ---------- init ----------

  /**
   * The init form: the harness selection as in the agents form (empty is
   * auto), then write or check. Its notes name the root, the languages and
   * layers it describes (the saved keylang.json when there is one: it is
   * kept), what the selection resolves to, and which classes of files each
   * mode touches; nothing runs until Enter.
   */
  private openInitPrompt(): void {
    this.state.prompt = { kind: "init", text: "", items: [], ids: ["write", "check"], notes: [], index: 0 };
    this.refreshInitPrompt();
  }

  private refreshInitPrompt(): void {
    const prompt = this.state.prompt;
    if (prompt?.kind !== "init") return;
    const root = this.state.root;
    const sources = initSources(root);
    const existed = existsSync(join(root, CONFIG_FILE));
    let found: string;
    if ("error" in sources) found = `${sources.error}: init stops with code 2 and writes nothing`;
    else {
      const layers = existed ? [...sources.config.layers.keys()] : [...guessLayout(root, sources.config.exclude).layers.keys()];
      found = `${sources.config.languages.join(", ")} · layers: ${layers.length > 0 ? layers.join(", ") : "none"}`;
    }
    const choice = this.agentsChoice();
    const harness = typeof choice === "object" && "error" in choice ? `${choice.error} · type auto (empty), none, or claude,codex,opencode,cursor` : this.agentsPreview(choice).note;
    const baseline = baselinePath({ dir: this.specDir() });
    prompt.details = [
      `Root: ${root}`,
      `Found: ${found}`,
      existed ? "keylang.json: exists, kept byte for byte (no new guess replaces it)" : "keylang.json: none yet, written from this guess",
      `Harnesses: ${harness}`,
      `Write, in order: ${existed ? "" : "keylang.json, "}the map (${this.specDir()}/map/, .keylang/), ${baseline}, the harness files — each file on its own, no overall rollback`,
      "Check: as `keylang init --check` — the harness files and the baseline only; the map is not compared (Map: check does)",
    ];
    prompt.items = [`Initialize: ${existed ? "keep" : "write"} keylang.json, map, baseline, harness files`, "Check as `keylang init --check` (writes nothing)"];
    prompt.notes = ["writes the files listed above, in order", "writes nothing; code 1 when a harness file or the baseline is stale"];
    prompt.note = prompt.notes[prompt.index] ?? "";
  }

  /** Enter in the init form: the typed selection with the chosen mode runs as the session's operation; an invalid one keeps the form. */
  private submitInit(): void {
    const prompt = this.state.prompt!;
    const choice = this.agentsChoice();
    if (typeof choice === "object" && "error" in choice) {
      this.state.message = `init: ${choice.error}`;
      return;
    }
    const check = prompt.ids?.[prompt.index] === "check";
    this.state.prompt = null;
    this.requestOperation("init", { kind: "init", root: this.state.root, harnesses: choice, check });
  }

  // ---------- fmt ----------

  /** The fmt form: the current spec file by default — a directory only when typed — then the mode. */
  private openFmtPrompt(): void {
    const current = this.state.current;
    const initial = current !== null && extname(current) === ".md" ? current : "";
    this.state.prompt = { kind: "fmt", text: initial, items: [], ids: ["write", "check"], index: 0 };
    this.refreshFmtPrompt();
  }

  /** The typed paths of the fmt or parse form, relative to the root, or why they cannot be used. */
  private promptPaths(): string[] | { error: string } {
    const paths = (this.state.prompt?.text ?? "").trim().split(/\s+/).filter((path) => path !== "");
    if (paths.length === 0) return { error: "type a spec file or a directory, relative to the root" };
    const outside = paths.find((path) => !within(resolve(this.state.root, path), this.state.root));
    return outside === undefined ? paths : { error: `${outside}: outside the repository` };
  }

  /** The form shows the real set the paths expand to, from the disk, and both modes. */
  private refreshFmtPrompt(): void {
    const prompt = this.state.prompt;
    if (prompt?.kind !== "fmt") return;
    const paths = this.promptPaths();
    if (!Array.isArray(paths)) {
      prompt.items = ["Write: format the files", "Check the files (writes nothing)"];
      prompt.note = paths.error;
      return;
    }
    const selection = this.markdownSelection(paths);
    if ("error" in selection) {
      prompt.items = ["Write: format the files", "Check the files (writes nothing)"];
      prompt.note = selection.error;
      return;
    }
    prompt.items = [`Write: format ${selection.files.length} file(s)`, `Check ${selection.files.length} file(s) (writes nothing)`];
    prompt.note = `${selection.note} · saved explanations are skipped`;
  }

  /** The Markdown files the paths expand to on disk, and a note naming them and how many are unsaved (saved first). */
  private markdownSelection(paths: readonly string[]): { files: string[]; note: string } | { error: string } {
    let files: string[];
    try {
      files = collectMdFiles(paths, this.state.root).map((file) => toPosix(relative(this.state.root, resolve(this.state.root, file))));
    } catch (error) {
      return { error: `${errorText(error)} · a new spec is saved first` };
    }
    const shown = files.length > 3 ? `${files.slice(0, 3).join(", ")}, …` : files.join(", ");
    const dirty = files.filter((file) => {
      const buffer = this.state.buffers.get(file);
      return buffer !== undefined && isDirty(buffer);
    }).length;
    return { files, note: `${files.length === 0 ? "no Markdown files" : shown}${dirty > 0 ? ` · ${dirty} unsaved, saved first` : ""}` };
  }

  /** Enter in the fmt form: the typed paths with the chosen mode run as the session's operation. */
  private submitFmt(): void {
    const prompt = this.state.prompt!;
    const paths = this.promptPaths();
    if (!Array.isArray(paths)) {
      this.state.message = `fmt: ${paths.error}`;
      return;
    }
    const check = prompt.ids?.[prompt.index] === "check";
    this.state.prompt = null;
    this.requestOperation("fmt", { kind: "fmt", root: this.state.root, paths, check });
  }

  // ---------- parse ----------

  /** The parse form: the current spec file by default — a directory only when typed — then the view. */
  private openParsePrompt(): void {
    const current = this.state.current;
    const initial = current !== null && extname(current) === ".md" ? current : "";
    this.state.prompt = { kind: "parse", text: initial, items: [], ids: [...PARSE_FORMATS], index: 0 };
    this.refreshParsePrompt();
  }

  /** The form shows the real set the paths expand to and both views; parsing needs no snapshot and writes nothing. */
  private refreshParsePrompt(): void {
    const prompt = this.state.prompt;
    if (prompt?.kind !== "parse") return;
    const paths = this.promptPaths();
    const selection = Array.isArray(paths) ? this.markdownSelection(paths) : paths;
    const count = "files" in selection ? ` of ${selection.files.length} file(s)` : "";
    prompt.items = [`Tree${count}: as keylang parse prints it`, `JSON${count}: as keylang parse --json prints it`];
    prompt.note = "error" in selection ? selection.error : `${selection.note} · saved explanations are skipped · no code snapshot needed · writes nothing`;
  }

  /** Enter in the parse form: the typed paths in the chosen view run as the session's operation. */
  private submitParse(): void {
    const prompt = this.state.prompt!;
    const paths = this.promptPaths();
    if (!Array.isArray(paths)) {
      this.state.message = `parse: ${paths.error}`;
      return;
    }
    const format: ParseFormat = prompt.ids?.[prompt.index] === "json" ? "json" : "tree";
    this.state.prompt = null;
    this.requestOperation("parse", { kind: "parse", root: this.state.root, paths, format });
  }

  // ---------- wire ----------

  /** The wire form: the generated file (the CLI's default), then the mode. */
  private openWirePrompt(): void {
    this.state.prompt = { kind: "wire", text: WIRE_OUT, items: [], ids: ["write", "check"], index: 0 };
    this.refreshWirePrompt();
  }

  /** The typed output path (POSIX, relative to the root), or why it cannot be the generated file. */
  private wireOut(): string | { error: string } {
    const out = (this.state.prompt?.text ?? "").trim();
    if (out === "") return { error: "type the generated file, relative to the root (keylang.gen.ts)" };
    const problem = wireOutProblem(this.state.root, out);
    return problem === null ? out : { error: problem.replace(/^wire: /, "") };
  }

  /** The form shows the path problem as it is typed, and the state of the file on disk. Reading only. */
  private refreshWirePrompt(): void {
    const prompt = this.state.prompt;
    if (prompt?.kind !== "wire") return;
    const out = this.wireOut();
    if (typeof out !== "string") {
      prompt.items = ["Write: generate the container", "Check the container (writes nothing)"];
      prompt.note = out.error;
      return;
    }
    const current = readText(resolve(this.state.root, out));
    const onDisk = current === null ? "not on disk yet" : current.startsWith(WIRE_MARKER) ? "generated file on disk" : "a manual file on disk: never written over";
    const dirty = this.dirtyInputs().length;
    prompt.items = [`Write ${out}`, `Check ${out} (writes nothing)`];
    prompt.note = `from the saved # wiring and the code · ${onDisk}${dirty > 0 ? ` · ${dirty} unsaved, saved first` : ""} · never compiled or run`;
  }

  /** Enter in the wire form: the typed file with the chosen mode runs as the session's operation; an invalid path keeps the form. */
  private submitWire(): void {
    const prompt = this.state.prompt!;
    const out = this.wireOut();
    if (typeof out !== "string") {
      this.state.message = `wire: ${out.error}`;
      return;
    }
    const check = prompt.ids?.[prompt.index] === "check";
    this.state.prompt = null;
    this.requestOperation("wire", { kind: "wire", root: this.state.root, out, check });
  }

  /** What Enter over the selected wire report opens: the first blocking error, else the generated file when it is on disk. */
  private wireTarget(): { file: string; line: number; col: number } | null {
    const result = this.state.records[this.state.results.index]?.result;
    if (result?.kind !== "wire" || result.payload === null) return null;
    const first = result.payload.diagnostics[0];
    if (first) return { file: first.file, line: first.span.start.line, col: first.span.start.col };
    return existsSync(resolve(this.state.root, result.payload.file)) ? { file: result.payload.file, line: 1, col: 1 } : null;
  }

  /** The generated code opens in the read-only viewer, not as a writable buffer; Esc / Ctrl+O come back to the report. */
  private openWireTarget(): void {
    const target = this.wireTarget();
    if (target) this.openTarget(target.file, target.line, target.col);
  }

  // ---------- full check ----------

  /** The check form: the spec directory by default, not strict, the static mode of keylang.json. */
  private openCheckPrompt(): void {
    this.state.prompt = { kind: "full-check", text: this.specDir(), items: [], ids: ["strict", "static", "changed", "since", "run"], index: 4, checkOptions: { strict: false, static: null, changed: false, since: "HEAD" } };
    this.refreshCheckPrompt();
  }

  /** The typed paths, relative to the root (none: the spec directory), or why they cannot be checked here. */
  private checkPaths(): string[] | { error: string } {
    const paths = (this.state.prompt?.text ?? "").trim().split(/\s+/).filter((path) => path !== "");
    const outside = paths.find((path) => !within(resolve(this.state.root, path), this.state.root));
    return outside === undefined ? paths : { error: `${outside}: outside the repository` };
  }

  /** The options as items, and the real set of spec files the paths expand to. Reading only. */
  private refreshCheckPrompt(): void {
    const prompt = this.state.prompt;
    if (prompt?.kind !== "full-check" || !prompt.checkOptions) return;
    const options = prompt.checkOptions;
    let configured: StaticMode | undefined;
    try {
      configured = loadConfig(this.state.root).check.static;
    } catch {
      configured = undefined;
    }
    const effective = resolveStatic(options.static ?? undefined, configured).mode;
    prompt.items = [
      options.strict ? "strict: on · an unverified verdict fails (code 1)" : "strict: off · unverified stays visible; code 0 unless something fails",
      options.static === null ? `static: ${effective}, ${configured === undefined ? "the default" : "from keylang.json check.static"}` : `static: ${options.static}, override of keylang.json`,
      options.changed ? "changed: on · the full analysis, then only findings touching files git reports changed" : "changed: off · every finding of the paths; git is not read",
      `since: ${options.since}${prompt.ids?.[prompt.index] === "since" ? "▏" : ""}${options.changed ? " · the git ref the working tree is compared with" : " · used with changed on"}`,
      "Run the check (writes nothing)",
    ];
    const paths = this.checkPaths();
    if (!Array.isArray(paths)) {
      prompt.note = paths.error;
      return;
    }
    let files: string[];
    try {
      files = collectMdFiles(paths.length > 0 ? paths : [this.specDir()], this.state.root).map((file) => toPosix(relative(this.state.root, resolve(this.state.root, file))));
    } catch (error) {
      prompt.note = `${errorText(error)} · ←→ change the selected option`;
      return;
    }
    const dirty = new Set(this.dirtyInputs());
    const unsaved = files.filter((file) => dirty.has(file)).length + (dirty.has(CONFIG_FILE) ? 1 : 0);
    prompt.note = `${files.length} spec file(s)${unsaved > 0 ? ` · ${unsaved} unsaved, saved first` : ""} · ${prompt.ids?.[prompt.index] === "since" ? "type the git ref" : "←→ change the selected option"}`;
  }

  /** ←→ on an option of the check form: strict flips; the static mode cycles config → behavior → shape. */
  private changeCheckOption(delta: 1 | -1): void {
    const prompt = this.state.prompt;
    const options = prompt?.checkOptions;
    if (!prompt || !options) return;
    if (prompt.ids?.[prompt.index] === "strict") options.strict = !options.strict;
    if (prompt.ids?.[prompt.index] === "changed") options.changed = !options.changed;
    if (prompt.ids?.[prompt.index] === "static") {
      const modes: (StaticMode | null)[] = [null, ...STATIC_MODES];
      options.static = modes[(modes.indexOf(options.static) + delta + modes.length) % modes.length]!;
    }
    this.refreshCheckPrompt();
  }

  /** Enter in the check form, on any row: the typed paths with the chosen options run as the session's operation. */
  private submitCheck(): void {
    const options = this.state.prompt?.checkOptions ?? { strict: false, static: null, changed: false, since: "HEAD" };
    const paths = this.checkPaths();
    if (!Array.isArray(paths)) {
      this.state.message = `check: ${paths.error}`;
      return;
    }
    const since = options.since.trim();
    if (options.changed && since === "") {
      this.state.message = "check: changed needs a git ref (HEAD by default)";
      return;
    }
    this.state.prompt = null;
    // The ref goes with changed only, as `--since` needs `--changed`; HEAD is the default and is not repeated.
    const slice = options.changed ? { changed: true, ...(since !== "HEAD" ? { since } : {}) } : {};
    this.requestOperation("full-check", { kind: "check", root: this.state.root, paths, strict: options.strict, ...(options.static !== null ? { static: options.static } : {}), ...slice });
  }

  // ---------- explain edge ----------

  /** The edge form: the id under the cursor fills only the first field; the second is typed. */
  private openEdgePrompt(): void {
    const from = this.state.mode === "merge" || this.state.start !== null ? null : this.idAtCursor();
    this.state.prompt = { kind: "explain-edge", text: "", items: [], ids: ["from", "to", "run"], index: from === null ? 0 : 1, edge: { from: from ?? "", to: "" } };
    this.refreshEdgePrompt();
  }

  /** The rows, and a note on the selected id against the session's current snapshot (the operation reads the saved code again). */
  private refreshEdgePrompt(): void {
    const prompt = this.state.prompt;
    if (prompt?.kind !== "explain-edge" || !prompt.edge) return;
    const { from, to } = prompt.edge;
    const field = prompt.ids?.[prompt.index];
    const caret = (row: string): string => (field === row ? "▏" : "");
    prompt.items = [`from: ${from}${caret("from")}`, `to: ${to}${caret("to")}`, "Explain the edge (reads the saved code, writes nothing)"];
    const id = field === "from" ? from.trim() : field === "to" ? to.trim() : "";
    const snapshot = this.state.analysis?.snapshot ?? null;
    if (field === "run") prompt.note = from.trim() === "" || to.trim() === "" ? "two ids are needed: ↑ to the empty one" : "Enter explains both directions";
    else if (id === "") prompt.note = `type the ${field === "from" ? "first" : "second"} id · ↑↓ the other field`;
    else if (snapshot === null) prompt.note = "no current snapshot to look the id up; the operation reads the saved code";
    else if (edgeIdKnown(snapshot, id)) prompt.note = `${id}: in the current snapshot`;
    else {
      const near = this.state.analysis?.index.suggest(id);
      prompt.note = `${id}: not in the current snapshot${near === undefined ? "" : ` · did you mean ${near}?`}`;
    }
  }

  /** Enter in the edge form, on any row: both ids run as the session's operation; an empty one keeps the form. */
  private submitEdge(): void {
    const prompt = this.state.prompt;
    if (prompt?.kind !== "explain-edge" || !prompt.edge) return;
    const from = prompt.edge.from.trim();
    const to = prompt.edge.to.trim();
    if (from === "" || to === "") {
      prompt.index = from === "" ? 0 : 1;
      this.refreshEdgePrompt();
      this.state.message = "explain edge: two ids are needed: <from> <to>";
      return;
    }
    this.state.prompt = null;
    this.requestOperation("explain-edge", { kind: "explain-edge", root: this.state.root, from, to });
  }

  // ---------- explain (offline) ----------

  /** The explain form: the ID under the cursor, else the code of the line's diagnostic, is the visible default. */
  private openExplainPrompt(): void {
    let initial = "";
    if (this.state.mode !== "merge") {
      const buffer = this.buffer();
      const code = buffer && this.state.analysis ? evidenceOf(this.state.analysis, buffer.path).get(this.state.cursor.line + 1)?.diagnostics[0]?.code : undefined;
      initial = this.idAtCursor() ?? code ?? "";
    }
    this.state.prompt = { kind: "explain", text: initial, items: [], ids: [], index: 0 };
    this.refreshExplainPrompt();
  }

  /** The codes or the IDs of the session's snapshot matching the typed text (the exact one first). */
  private refreshExplainPrompt(): void {
    const prompt = this.state.prompt;
    if (prompt?.kind !== "explain") return;
    if (prompt.explainPlan) return this.refreshExplainPlanPrompt();
    const typed = prompt.text.trim();
    let ids: string[];
    if (!prompt.explainModel && /^k\d*$/i.test(typed)) ids = Object.keys(EXPLANATIONS).filter((code) => code.startsWith(typed.toUpperCase())).sort(compareText);
    else {
      const analysis = this.state.analysis;
      const hits = analysis && typed !== "" ? searchNodes(analysis, this.state.briefs, { query: typed, limit: NODE_HITS, fuzzy: true }).map((hit) => hit.id) : [];
      ids = [...new Set(hits)].sort((a, b) => Number(b === typed) - Number(a === typed));
    }
    prompt.ids = ids;
    prompt.items = ids;
    prompt.index = 0;
    this.explainNote();
  }

  /** The subject Enter explains: the selected entry of the list, else the typed text. */
  private explainSubject(): string {
    const prompt = this.state.prompt!;
    return prompt.ids?.[prompt.index] ?? prompt.text.trim();
  }

  private explainNote(): void {
    const prompt = this.state.prompt!;
    if (prompt.explainModel) return this.explainModelNote(prompt.explainModel.detail);
    if (prompt.explainPlan) return this.refreshExplainPlanPrompt();
    const subject = this.explainSubject();
    if (subject === "") {
      prompt.note = "type a diagnostic code (K001) or an id";
      return;
    }
    if (isDiagnosticCode(subject)) {
      prompt.note = `${subject.toUpperCase()}: ${codeExplanation(subject) ? "offline help of the code · reads nothing, saves nothing first" : "not a keylang code"}`;
      return;
    }
    const analysis = this.state.analysis;
    const found = analysis ? nodeExplanation(analysis, subject, analysis.config.explain.detail) : null;
    const known = found === null ? "" : "unknown" in found ? `: not in the current snapshot${found.suggestion ? ` (did you mean ${found.suggestion}?)` : ""}` : ": in the current snapshot";
    prompt.note = `${subject}${known} · a fresh analysis of the saved code and specs · offline: no model, writes nothing`;
  }

  /** Enter in the explain form: the subject runs as the session's operation; an empty one keeps the form. */
  private submitExplain(): void {
    if (this.state.prompt?.explainPlan) return this.submitExplainPlan();
    const subject = this.explainSubject();
    if (subject === "") {
      this.state.message = "explain: a code or an id is required";
      return;
    }
    const model = this.state.prompt?.explainModel;
    if (model) {
      if (isDiagnosticCode(subject)) {
        this.state.message = `explain --llm: ${subject.toUpperCase()} is a diagnostic code: its help is offline (Ctrl+P Explain)`;
        return;
      }
      this.state.prompt = null;
      this.requestOperation("explain-llm", { kind: "explain-llm", root: this.state.root, id: subject, detail: model.detail });
      return;
    }
    this.state.prompt = null;
    this.requestOperation("explain", { kind: "explain", root: this.state.root, subject });
  }

  // ---------- explain with the model ----------

  /** The model's explanation form: the ID under the cursor and the detail of keylang.json by default. */
  private openExplainModelPrompt(): void {
    const initial = this.state.mode === "merge" ? "" : (this.idAtCursor() ?? "");
    const detail = this.state.analysis?.config.explain.detail ?? "short";
    this.state.prompt = { kind: "explain", text: initial, items: [], ids: [], index: 0, explainModel: { detail } };
    this.refreshExplainPrompt();
    if (this.llmSetup !== null) return;
    this.track(
      import("../llm.ts").then(({ llmClient }) => {
        this.llmSetup = (agent) => llmClient(agent, { root: this.state.root });
        if (this.state.prompt?.kind === "explain" && this.state.prompt.explainModel) {
          this.explainNote();
          this.draw();
        }
      }),
    );
  }

  /** ←→ in the model's form: short, full, brief. */
  private changeExplainDetail(step: number): void {
    const model = this.state.prompt?.explainModel;
    if (!model) return;
    const details: ExplanationDetail[] = ["short", "full", "brief"];
    model.detail = details[(details.indexOf(model.detail) + step + details.length) % details.length]!;
    this.explainNote();
  }

  /**
   * What Enter would do, by the session's analysis: read a fresh saved answer
   * (no request), ask the model once and save, or — no model — show the
   * summary and the saved answer; with the detail, the language and the agent.
   */
  private explainModelNote(detail: ExplanationDetail): void {
    const prompt = this.state.prompt!;
    const id = this.explainSubject();
    const analysis = this.state.analysis;
    const agent = analysis ? selectedAgent(analysis.config.agent) : null;
    const lang = analysis?.config.explain.lang ?? "en";
    const settings = `${detail} (←→) · lang ${lang} · agent ${agent ?? "none"} · keylang.json sets lang and agent`;
    if (id === "") {
      prompt.note = `type an id · ${settings}`;
      return;
    }
    if (isDiagnosticCode(id)) {
      prompt.note = `${id.toUpperCase()} is a diagnostic code: its help is offline (Ctrl+P Explain) · ${settings}`;
      return;
    }
    const found = analysis ? nodeExplanation(analysis, id, detail) : null;
    if (found === null || "unknown" in found) {
      const near = found !== null && found.suggestion ? ` (did you mean ${found.suggestion}?)` : "";
      prompt.note = `${id}: ${found === null ? "analysis is still running" : `not in the current snapshot${near}`} · ${settings}`;
      return;
    }
    const saved = readExplanation(analysis!.config, id, detail);
    const miss = savedAnswerMiss(analysis!, id, saved, lang, detail);
    if (miss === null && saved !== null) {
      prompt.note = `${id}: the saved ${detail} answer (${saved.agent} · ${saved.date}) is fresh: read, no request, nothing written · ${settings}`;
      return;
    }
    const why = miss === "missing" || saved === null ? `no saved ${detail === "brief" ? "brief" : "answer"}` : miss === "stale" ? "the saved answer is stale" : miss === "lang" ? `the saved answer is in ${saved.lang}` : `the saved answer is ${saved.detail}`;
    const setup = this.llmSetup === null ? null : this.llmSetup(agent);
    const ask =
      setup === null
        ? "checking the model…"
        : "missing" in setup
          ? `no request can be made: ${setup.missing}; Enter shows the summary and the saved answer`
          : `asks ${setup.client.agent} once, then saves ${explanationPath(analysis!.config, id, detail)}`;
    prompt.note = `${id}: ${why} · ${ask} · ${settings}`;
  }

  // ---------- explanations to do (inventory, brief plan, dry run) ----------

  /** The inventory form: the stale saved explanations by default; limit and jobs empty (every candidate, 4). */
  private openExplainPlanPrompt(row: "list" | "batch" = "list"): void {
    this.state.prompt = { kind: "explain", text: "", items: [], ids: [row], index: 0, explainPlan: { list: row === "batch" ? "missing" : "stale-saved", limit: "", jobs: "" } };
    this.refreshExplainPlanPrompt();
    if (row !== "batch" || this.llmSetup !== null) return;
    // The batch row names the model it would ask; the client module loads off the key path.
    this.track(
      import("../llm.ts").then(({ llmClient }) => {
        this.llmSetup = (agent) => llmClient(agent, { root: this.state.root });
        if (this.state.prompt?.kind === "explain" && this.state.prompt.explainPlan) {
          this.refreshExplainPlanPrompt();
          this.draw();
        }
      }),
    );
  }

  /** The request the form makes, or the field it refuses with the CLI's message. */
  private explainPlanRequest(form: ExplainPlanForm): ExplainPlanRequest | { field: "limit" | "jobs"; text: string } {
    if (form.list === "stale-saved") return { kind: "explain-plan", root: this.state.root, list: "stale-saved" };
    const limit = form.limit.trim();
    const jobs = form.jobs.trim();
    const limitProblem = limit === "" ? null : positiveIntegerProblem("--limit", limit);
    if (limitProblem !== null) return { field: "limit", text: limitProblem };
    const jobsProblem = jobs === "" ? null : positiveIntegerProblem("--jobs", jobs);
    if (jobsProblem !== null) return { field: "jobs", text: jobsProblem };
    return { kind: "explain-plan", root: this.state.root, list: "briefs", batch: form.list, ...(limit !== "" ? { limit: Number(limit) } : {}), ...(jobs !== "" ? { jobs: Number(jobs) } : {}), estimate: true };
  }

  /** The rows (the list; limit and jobs for a brief plan; run), what the selected list is and is not, and a note on the selected row. */
  private refreshExplainPlanPrompt(): void {
    const prompt = this.state.prompt;
    const form = prompt?.explainPlan;
    if (prompt?.kind !== "explain" || !form) return;
    const selected = prompt.ids?.[prompt.index] ?? "list";
    const names: Record<ExplainPlanForm["list"], string> = {
      "stale-saved": "stale saved explanations (answers and briefs)",
      missing: "brief plan: missing and stale briefs",
      stale: "brief plan: stale briefs only",
    };
    const next = EXPLAIN_PLAN_LISTS[(EXPLAIN_PLAN_LISTS.indexOf(form.list) + 1) % EXPLAIN_PLAN_LISTS.length]!;
    const rows: { id: string; text: string }[] = [{ id: "list", text: `list:   ${names[form.list]} · ←→ ${names[next]}` }];
    if (form.list !== "stale-saved") {
      rows.push({ id: "limit", text: `limit:  ${form.limit}${selected === "limit" ? "▏" : ""}${form.limit.trim() === "" ? "  (empty: every candidate)" : ""}` });
      rows.push({ id: "jobs", text: `jobs:   ${form.jobs}${selected === "jobs" ? "▏" : ""}${form.jobs.trim() === "" ? `  (empty: ${defaultBriefJobs(this.agentName())}, the requests a batch keeps in flight)` : ""}` });
    }
    rows.push({ id: "run", text: form.list === "stale-saved" ? "List them (reads the saved files, no model, writes nothing)" : "Plan and estimate: a dry run (no model, writes nothing)" });
    if (form.list !== "stale-saved") rows.push({ id: "batch", text: "Ask the model for them: the batch (plans again, saves each brief)" });
    prompt.ids = rows.map((row) => row.id);
    prompt.items = rows.map((row) => row.text);
    prompt.index = Math.max(0, prompt.ids.indexOf(selected));
    prompt.details = [
      form.list === "stale-saved"
        ? "keylang explain --stale: every saved answer and brief whose code changed since (stale) or whose id is gone; each is asked again one by one (explain <id> --llm); not the brief plan"
        : form.list === "missing"
          ? "keylang explain --missing --dry-run: the briefs a batch would ask for, bottom-up — nodes with no doc comment and no fresh brief, stale briefs included"
          : "keylang explain --stale --dry-run: only the stale briefs a batch would ask for again — not the saved answers, not gone ids, not missing briefs",
    ];
    const request = this.explainPlanRequest(form);
    const now = prompt.ids[prompt.index]!;
    if ("field" in request) prompt.note = now === request.field || now === "run" ? request.text : `${request.field}: ${request.text}`;
    else if (now === "limit") prompt.note = "a whole number of at least 1: the plan is cut to it before the estimate";
    else if (now === "jobs") prompt.note = "a whole number of at least 1, for the batch the plan is for; a dry run asks nothing";
    else if (now === "batch") {
      const batch = this.explainBatchRequest(request);
      prompt.note = `${operationLabel(batch)} · ${this.explainBatchAsk()} · plans again on a fresh analysis of the saved files; ${batch.jobs ?? defaultBriefJobs(this.agentName())} request(s) at a time within a wave, bottom-up; each brief saved to ${explainDir({ dir: this.specDir() })}/brief/ as it lands`;
    }
    else prompt.note = `${operationLabel(request)} · a fresh analysis of the saved code and specs · no model, writes nothing`;
  }

  /** ←→ on the list row. */
  private changeExplainPlanList(delta: -1 | 1): void {
    const prompt = this.state.prompt;
    const form = prompt?.explainPlan;
    if (!form || prompt.ids?.[prompt.index] !== "list") return;
    form.list = EXPLAIN_PLAN_LISTS[(EXPLAIN_PLAN_LISTS.indexOf(form.list) + delta + EXPLAIN_PLAN_LISTS.length) % EXPLAIN_PLAN_LISTS.length]!;
    this.refreshExplainPlanPrompt();
  }

  /** Enter: a refused limit or jobs keeps the form with the field selected, else the inventory runs as the session's operation. */
  private submitExplainPlan(): void {
    const prompt = this.state.prompt;
    const form = prompt?.explainPlan;
    if (!form) return;
    const request = this.explainPlanRequest(form);
    if ("field" in request) {
      prompt.index = Math.max(0, prompt.ids!.indexOf(request.field));
      this.refreshExplainPlanPrompt();
      this.state.message = `explain: ${request.text}`;
      return;
    }
    this.state.prompt = null;
    if (prompt.ids?.[prompt.index] === "batch") return this.requestOperation("explain-batch", this.explainBatchRequest(request));
    this.requestOperation("explain-plan", request);
  }

  /** The batch of a brief plan's form: the same list, limit and jobs, no estimate. */
  private explainBatchRequest(plan: ExplainPlanRequest): ExplainBatchRequest {
    const batch = plan.list === "briefs" ? plan.batch : "missing";
    const limit = plan.list === "briefs" ? plan.limit : undefined;
    return { kind: "explain-batch", root: this.state.root, batch, ...(limit !== undefined ? { limit } : {}), jobs: (plan.list === "briefs" ? plan.jobs : undefined) ?? defaultBriefJobs(this.agentName()) };
  }

  /** Who the batch row would ask, by the session's configuration, or why no request can be made. */
  private explainBatchAsk(): string {
    const setup = this.llmSetup === null ? null : this.llmSetup(this.state.analysis?.config.agent ?? null);
    return setup === null ? "checking the model…" : "missing" in setup ? `no request can be made: ${setup.missing}` : `asks ${setup.client.agent} once a brief`;
  }

  // ---------- trace plan ----------

  /** The trace-plan form: the flow under the cursor is the visible default; the list is the flows of the current documents. */
  private openTracePlanPrompt(): void {
    const initial = this.state.mode === "merge" ? null : this.flowAtCursor();
    this.state.prompt = { kind: "trace-plan", text: initial ?? "", items: [], ids: [], index: 0 };
    this.refreshTracePlanPrompt();
  }

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

  /** The declared flows matching the typed name (the exact one first), each with the file that declares it. */
  private refreshTracePlanPrompt(): void {
    const prompt = this.state.prompt;
    if (prompt?.kind !== "trace-plan") return;
    // The flows of the current documents (dirty buffers included), not the file names; the operation reads them saved.
    const declared = new Map<string, string>();
    for (const flow of this.state.analysis?.spec.flows ?? []) if (!declared.has(flow.name)) declared.set(flow.name, flow.file);
    const typed = prompt.text.trim();
    const query = typed.toLowerCase();
    const names = [...declared.keys()].filter((name) => name.toLowerCase().includes(query)).sort((a, b) => Number(b === typed) - Number(a === typed) || compareText(a, b));
    prompt.ids = names;
    prompt.items = names.map((name) => `${name}  ${declared.get(name)}`);
    prompt.index = 0;
    this.tracePlanNote();
  }

  /** The flow Enter plans: the selected one of the list, else the typed name. */
  private tracePlanFlow(): string {
    const prompt = this.state.prompt!;
    return prompt.ids?.[prompt.index] ?? prompt.text.trim();
  }

  private tracePlanNote(): void {
    const prompt = this.state.prompt!;
    const flow = this.tracePlanFlow();
    const known = this.state.analysis?.spec.flows.some((item) => item.name === flow) ?? false;
    prompt.note =
      flow === ""
        ? "type a flow name: # flow <name>"
        : `${flow}${known ? "" : ": not in the current documents"} · a fresh snapshot of the saved code · writes nothing, runs nothing`;
  }

  /** Enter in the trace-plan form: the flow runs as the session's operation; an empty name keeps the form. */
  private submitTracePlan(): void {
    const flow = this.tracePlanFlow();
    if (flow === "") {
      this.state.message = "trace-plan: a flow name is required";
      return;
    }
    this.state.prompt = null;
    this.requestOperation("trace-plan", { kind: "trace-plan", root: this.state.root, flow });
  }

  // ---------- draft flow (algo, hybrid, llm) ----------

  /**
   * The draft-flow form (design §2.4): the fn under the cursor, else the
   * trigger of the flow under the cursor, is the visible default; name and
   * target stay empty for the CLI's defaults, shown next to them. The output
   * is a proposal unless preview is chosen; the mode is the CLI's default
   * (hybrid) when a model is configured, else algo.
   */
  private openDraftPrompt(): void {
    const snapshot = this.state.analysis?.snapshot ?? null;
    const id = this.state.mode === "merge" ? null : this.idAtCursor();
    const trigger = id !== null && snapshot?.nodes[id]?.kind === "fn" ? id : (this.triggerAtCursor() ?? "");
    const mode = this.agentName() !== null ? "hybrid" : "algo";
    this.state.prompt = { kind: "draft-flow", text: "", items: [], ids: [], index: 0, draft: { trigger, name: "", into: "", mode, output: "proposal" } };
    this.refreshDraftPrompt();
  }

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

  /** The name and target the draft would use: the typed ones, else the CLI's defaults. */
  private draftTarget(form: { trigger: string; name: string; into: string }): { name: string; target: string } {
    const trigger = form.trigger.trim();
    const name = form.name.trim() !== "" ? form.name.trim() : trigger.slice(trigger.lastIndexOf(".") + 1);
    const into = form.into.trim();
    return { name, target: into !== "" ? toPosix(into) : `${this.merges.specDir()}/flows/${name || "<name>"}.md` };
  }

  /** The callable IDs of the current snapshot that contain the typed trigger, at most eight. */
  private triggerMatches(typed: string): string[] {
    const nodes = this.state.analysis?.snapshot?.nodes ?? {};
    if (nodes[typed]?.kind === "fn") return [];
    const query = typed.toLowerCase();
    return Object.keys(nodes)
      .filter((id) => nodes[id]!.kind === "fn" && nodes[id]!.layer !== "external" && id.toLowerCase().includes(query))
      .sort(compareText)
      .slice(0, 8);
  }

  /** Why a draft may not start now, or null: the checks the CLI makes first, then a pending proposal and an unsaved target (a proposal only). */
  private draftProblem(form: DraftForm): { field: string; text: string } | null {
    const trigger = form.trigger.trim();
    if (trigger === "") return { field: "trigger", text: "a trigger id is required" };
    const snapshot = this.state.analysis?.snapshot ?? null;
    if (snapshot !== null && snapshot.nodes[trigger]?.kind !== "fn") {
      const hint = this.state.analysis?.index.suggest(trigger);
      return { field: "trigger", text: `\`${trigger}\` is not a fn of the current snapshot${hint ? ` (did you mean \`${hint}\`?)` : ""}` };
    }
    if (form.mode === "llm" && this.agentName() === null) return { field: "mode", text: "--mode llm needs a model: set `agent` in keylang.json (hybrid drafts from the snapshot without one)" };
    if (form.output === "preview") return null;
    const { target } = this.draftTarget(form);
    const problem = proposalProblem(this.state.root, this.merges.specDir(), target, (path) => this.generatedDoc(path));
    if (problem !== null) return { field: form.into.trim() === "" ? "name" : "into", text: `${target}: ${problem}` };
    if (this.proposalWaiting(target)) return { field: "into", text: `a proposal for ${target} is waiting: merge it first (m, or Proposals)` };
    const buffer = this.state.buffers.get(target);
    if (buffer && isDirty(buffer)) return { field: "into", text: `${target} has unsaved changes: save (Ctrl+S) or undo them before a draft into it` };
    return null;
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

  /** The rows, the root, and a note on the selected row; nothing is read but the snapshot and the target's state. */
  private refreshDraftPrompt(): void {
    const prompt = this.state.prompt;
    const form = prompt?.draft;
    if (prompt?.kind !== "draft-flow" || !form) return;
    const selected = prompt.ids?.[prompt.index] ?? "trigger";
    const caret = (row: string): string => (selected === row ? "▏" : "");
    const { name, target } = this.draftTarget(form);
    const matches = this.triggerMatches(form.trigger.trim());
    const rows: { id: string; text: string }[] = [
      { id: "trigger", text: `trigger: ${form.trigger}${caret("trigger")}` },
      ...matches.map((id) => ({ id: `fn:${id}`, text: `    fn ${id}` })),
      { id: "name", text: `name:    ${form.name}${caret("name")}${form.name.trim() === "" ? `  (default ${name || "the trigger's last segment"})` : ""}` },
      { id: "into", text: `target:  ${form.into}${caret("into")}${form.into.trim() === "" ? `  (default ${target})` : ""}` },
      { id: "mode", text: `mode:    ${form.mode} · ←→ ${DRAFT_MODES[(DRAFT_MODES.indexOf(form.mode) + 1) % DRAFT_MODES.length]}` },
      { id: "output", text: `output:  ${form.output} · ←→ ${form.output === "proposal" ? "preview" : "proposal"}` },
      { id: "run", text: form.output === "proposal" ? `Create the proposal ${PROPOSALS_DIR}/${target} (the target itself is not written)` : "Preview the draft (writes nothing)" },
    ];
    prompt.ids = rows.map((row) => row.id);
    prompt.items = rows.map((row) => row.text);
    prompt.index = Math.max(0, prompt.ids.indexOf(selected));
    prompt.details = [`root: ${this.state.root} · the target is relative to it · ${form.mode === "algo" ? "algo: only the calls the snapshot resolved" : "the model's steps are marked agree, llm-only or conflict; never evidence"}`];
    const now = prompt.ids[prompt.index]!;
    const problem = this.draftProblem(form);
    const agent = this.agentName();
    if (now.startsWith("fn:")) prompt.note = `Enter takes ${now.slice(3)} as the trigger`;
    else if (now === "mode")
      prompt.note =
        form.mode === "algo"
          ? "algo: only the calls the snapshot resolved; no model"
          : agent === null
            ? form.mode === "hybrid"
              ? "no model configured (agent in keylang.json): hybrid drafts from the snapshot only, as algo, and says so"
              : (problem?.text ?? "")
            : form.mode === "hybrid"
              ? `${agent} drafts with the context pack (F4); the steps it missed come from the snapshot`
              : `${agent} drafts with the context pack (F4); each step is judged against the snapshot`;
    else if (now === "trigger") {
      const trigger = form.trigger.trim();
      const snapshot = this.state.analysis?.snapshot ?? null;
      prompt.note =
        trigger === ""
          ? "type a callable id · ↓ picks a match"
          : snapshot === null
            ? "no current snapshot to look it up; the operation reads the saved code"
            : snapshot.nodes[trigger]?.kind === "fn"
              ? `${trigger}: a fn of the current snapshot`
              : (problem?.text ?? "");
    } else if (problem !== null && (problem.field === now || now === "run" || now === "output")) prompt.note = problem.text;
    else if (now === "into" || now === "name") prompt.note = existsSync(join(this.state.root, target)) ? `${target} exists: its other sections are kept` : `${target} is a new file`;
    else prompt.note = form.output === "proposal" ? "Enter proposes; MERGE applies it hunk by hunk" : "Enter shows the draft in F6; nothing is written";
  }

  /** ←→ on the mode row (algo, hybrid, llm) or the output row (proposal or preview). */
  private changeDraftChoice(delta: -1 | 1): void {
    const prompt = this.state.prompt;
    const row = prompt?.ids?.[prompt.index];
    if (prompt?.kind !== "draft-flow" || !prompt.draft) return;
    if (row === "mode") prompt.draft.mode = DRAFT_MODES[(DRAFT_MODES.indexOf(prompt.draft.mode) + delta + DRAFT_MODES.length) % DRAFT_MODES.length]!;
    else if (row === "output") prompt.draft.output = prompt.draft.output === "proposal" ? "preview" : "proposal";
    else return;
    this.refreshDraftPrompt();
  }

  /**
   * Enter in the draft form. On a match it takes that trigger; elsewhere a
   * problem keeps the form (the typed values stay) with the field selected,
   * else the draft runs as the session's operation.
   */
  private submitDraft(): void {
    const prompt = this.state.prompt;
    const form = prompt?.draft;
    if (prompt?.kind !== "draft-flow" || !form) return;
    const row = prompt.ids?.[prompt.index] ?? "";
    if (row.startsWith("fn:")) {
      form.trigger = row.slice(3);
      prompt.index = -1;
      prompt.ids = [];
      this.refreshDraftPrompt();
      prompt.index = prompt.ids!.indexOf("name");
      this.refreshDraftPrompt();
      return;
    }
    const problem = this.draftProblem(form);
    if (problem !== null) {
      prompt.index = Math.max(0, prompt.ids!.indexOf(problem.field));
      this.refreshDraftPrompt();
      this.state.message = `draft flow: ${problem.text}`;
      return;
    }
    const name = form.name.trim();
    const into = form.into.trim();
    // The model sees the context pack as F4 shows it now: taken once, before anything else opens.
    const pack = form.mode === "algo" ? null : this.contextPack();
    this.state.prompt = null;
    this.requestOperation("draft-flow", {
      kind: "draft-flow",
      root: this.state.root,
      trigger: form.trigger.trim(),
      ...(name !== "" ? { name } : {}),
      ...(into !== "" ? { into: toPosix(into) } : {}),
      output: form.output,
      pending: "refuse",
      ...(form.mode !== "algo" ? { mode: form.mode } : {}),
      ...(pack ? { context: contextText(pack) } : {}),
    });
  }

  /**
   * A finished draft: a proposal opens in MERGE only while the file, the mode
   * and the text the operation started from are still current and nothing
   * else is open; otherwise it waits, named in the message and the list.
   */
  private afterDraft(record: OperationRecord, origin: DraftOrigin): void {
    const result = record.result;
    if (result?.kind === "draft-rules") return this.afterRulesDraft(record, origin);
    if (result?.kind !== "draft-flow" || result.status !== "completed" || result.payload?.proposal == null) return;
    const { candidate, model } = result.payload;
    const target = candidate.target;
    // What the proposal does not show: IDs still unknown, and the model's lines that did not parse where they stood.
    const notes = model === null ? "" : [...(model.unknown.length > 0 ? [`still unknown after ${model.rounds} round(s): ${model.unknown.join(", ")}`] : []), ...(model.dropped.length > 0 ? [`dropped from the model's draft: ${model.dropped.join("; ")}`] : [])].join("; ");
    const agent = record.action === AGENT_DRAFT;
    if (this.stillWhereDraftStarted(origin)) {
      this.merges.open(target);
      if (this.state.merge?.path === target) this.state.message = agent && notes ? `agent: ${notes}` : `${agent ? "agent" : "draft flow"}: ${PROPOSALS_DIR}/${target} · MERGE: decide the hunks, w writes ${target}${notes ? ` · ${notes}` : ""}`;
      return;
    }
    // The person moved on (another file, an edit, a merge): the draft waits as a proposal; focus stays where it is.
    this.state.message = agent
      ? `agent: the draft of flow ${candidate.name} is a proposal for ${target}: m merges it${notes ? `; ${notes}` : ""}`
      : `draft flow: ${PROPOSALS_DIR}/${target} waits: m, Proposals or Enter in F6 opens MERGE${notes ? ` · ${notes}` : ""}`;
  }

  /** The file, the mode and the text a draft started from are still current and nothing else is open: its proposal may open MERGE by itself. */
  private stillWhereDraftStarted(origin: DraftOrigin): boolean {
    const current = this.state.current === origin.path && this.state.mode === origin.mode && (origin.path === null ? true : this.state.buffers.get(origin.path)?.version === origin.version);
    return current && this.state.merge === null && this.state.prompt === null && this.state.barrier === null && !this.state.results.open && !this.state.help;
  }

  /** A finished rules draft: the proposal opens MERGE under the same rule as a flow draft's; its conflicts are named, never taken for the workspace's verdict. */
  private afterRulesDraft(record: OperationRecord, origin: DraftOrigin): void {
    const result = record.result;
    if (result?.kind !== "draft-rules" || result.status !== "completed" || result.payload === null) return;
    const { candidate, model } = result.payload;
    const conflicts = model === null || model.conflicts.length === 0 ? "" : ` · ${model.conflicts.length} conflict(s) with the code now: F6 names them`;
    if (result.payload.proposal === null) {
      if (conflicts !== "") this.state.message = `${this.state.message ?? ""}${conflicts}`;
      return;
    }
    const target = candidate.target;
    if (this.stillWhereDraftStarted(origin)) {
      this.merges.open(target);
      if (this.state.merge?.path === target) this.state.message = `draft rules: ${PROPOSALS_DIR}/${target} · MERGE: decide the hunks, w writes ${target}${conflicts}`;
      return;
    }
    this.state.message = `draft rules: ${PROPOSALS_DIR}/${target} waits: m, Proposals or Enter in F6 opens MERGE${conflicts}`;
  }

  // ---------- draft rules (algo, hybrid, llm) ----------

  /**
   * The draft-rules form (design §2.4 `draft rules`): the target (empty: the
   * CLI's `<dir>/rules.md`, shown next to it), the mode (hybrid with a
   * model, else algo) and preview or proposal.
   */
  private openRulesDraftPrompt(): void {
    const mode = this.agentName() !== null ? "hybrid" : "algo";
    this.state.prompt = { kind: "draft-rules", text: "", items: [], ids: [], index: 0, rulesDraft: { into: "", mode, output: "proposal" } };
    this.refreshRulesDraftPrompt();
  }

  /** The target a rules draft would use: the typed one, else the CLI's default. */
  private rulesTarget(into: string): string {
    return into.trim() !== "" ? toPosix(into.trim()) : `${this.merges.specDir()}/rules.md`;
  }

  /** Why a rules draft may not start now, or null: a model llm needs, then (a proposal only) the target, a pending proposal, an unsaved target. */
  private rulesDraftProblem(form: RulesDraftForm): { field: string; text: string } | null {
    if (form.mode === "llm" && this.agentName() === null) return { field: "mode", text: "--mode llm needs a model: set `agent` in keylang.json (hybrid drafts from the snapshot without one)" };
    if (form.output === "preview") return null;
    const target = this.rulesTarget(form.into);
    const problem = proposalProblem(this.state.root, this.merges.specDir(), target, (path) => this.generatedDoc(path));
    if (problem !== null) return { field: "into", text: `${target}: ${problem}` };
    if (this.proposalWaiting(target)) return { field: "into", text: `a proposal for ${target} is waiting: merge it first (m, or Proposals)` };
    const buffer = this.state.buffers.get(target);
    if (buffer && isDirty(buffer)) return { field: "into", text: `${target} has unsaved changes: save (Ctrl+S) or undo them before a draft into it` };
    return null;
  }

  /** The rows, the root and what the model sees, and a note on the selected row. */
  private refreshRulesDraftPrompt(): void {
    const prompt = this.state.prompt;
    const form = prompt?.rulesDraft;
    if (prompt?.kind !== "draft-rules" || !form) return;
    const selected = prompt.ids?.[prompt.index] ?? "into";
    const target = this.rulesTarget(form.into);
    const rows: { id: string; text: string }[] = [
      { id: "into", text: `target:  ${form.into}${selected === "into" ? "▏" : ""}${form.into.trim() === "" ? `  (default ${target})` : ""}` },
      { id: "mode", text: `mode:    ${form.mode} · ←→ ${DRAFT_MODES[(DRAFT_MODES.indexOf(form.mode) + 1) % DRAFT_MODES.length]}` },
      { id: "output", text: `output:  ${form.output} · ←→ ${form.output === "proposal" ? "preview" : "proposal"}` },
      { id: "run", text: form.output === "proposal" ? `Create the proposal ${PROPOSALS_DIR}/${target} (the target itself is not written)` : "Preview the draft (writes nothing)" },
    ];
    prompt.ids = rows.map((row) => row.id);
    prompt.items = rows.map((row) => row.text);
    prompt.index = Math.max(0, prompt.ids.indexOf(selected));
    prompt.details = [
      `root: ${this.state.root} · the target is relative to it · ${form.mode === "algo" ? "algo: the rules the code keeps now (layers or deny, no-cycles without a module cycle)" : "the model sees the layers and the edges between them; each of its rules is checked alone: agree, conflict or llm-only — never the workspace's verdict"}`,
    ];
    const now = prompt.ids[prompt.index]!;
    const problem = this.rulesDraftProblem(form);
    const agent = this.agentName();
    if (now === "mode")
      prompt.note =
        form.mode === "algo"
          ? "algo: the rules the code keeps now; no model"
          : agent === null
            ? form.mode === "hybrid"
              ? "no model configured (agent in keylang.json): hybrid drafts from the snapshot only, as algo, and says so"
              : (problem?.text ?? "")
            : form.mode === "hybrid"
              ? `${agent} proposes rules; the algo rules it missed are added`
              : `${agent} proposes rules; each is checked alone against the snapshot`;
    else if (problem !== null && (problem.field === now || now === "run" || now === "output")) prompt.note = problem.text;
    else if (now === "into") prompt.note = existsSync(join(this.state.root, target)) ? `${target} exists: its prose and other sections are kept; the rules join its last # rules section` : `${target} is a new file`;
    else prompt.note = form.output === "proposal" ? "Enter proposes; MERGE applies it hunk by hunk" : "Enter shows the draft in F6; nothing is written";
  }

  /** ←→ on the mode row (algo, hybrid, llm) or the output row (proposal or preview). */
  private changeRulesDraftChoice(delta: -1 | 1): void {
    const prompt = this.state.prompt;
    const row = prompt?.ids?.[prompt.index];
    if (prompt?.kind !== "draft-rules" || !prompt.rulesDraft) return;
    if (row === "mode") prompt.rulesDraft.mode = DRAFT_MODES[(DRAFT_MODES.indexOf(prompt.rulesDraft.mode) + delta + DRAFT_MODES.length) % DRAFT_MODES.length]!;
    else if (row === "output") prompt.rulesDraft.output = prompt.rulesDraft.output === "proposal" ? "preview" : "proposal";
    else return;
    this.refreshRulesDraftPrompt();
  }

  /** Enter in the rules form: a problem keeps the form with the field selected, else the draft runs as the session's operation. */
  private submitRulesDraft(): void {
    const prompt = this.state.prompt;
    const form = prompt?.rulesDraft;
    if (prompt?.kind !== "draft-rules" || !form) return;
    const problem = this.rulesDraftProblem(form);
    if (problem !== null) {
      prompt.index = Math.max(0, prompt.ids!.indexOf(problem.field));
      this.refreshRulesDraftPrompt();
      this.state.message = `draft rules: ${problem.text}`;
      return;
    }
    const into = form.into.trim();
    this.state.prompt = null;
    const request: DraftRulesRequest = {
      kind: "draft-rules",
      root: this.state.root,
      ...(into !== "" ? { into: toPosix(into) } : {}),
      output: form.output,
      pending: "refuse",
      ...(form.mode !== "algo" ? { mode: form.mode } : {}),
    };
    this.requestOperation("draft-rules", request);
  }

  // ---------- code-to-spec: flows from a source file, a line or the git changes (algo, hybrid, llm) ----------

  /**
   * The code-to-spec form (design §2.4 `code-to-spec`): the source is a
   * file — the code viewer's file and line, else the file (and, for a fn,
   * the line) of the ID under the cursor, else empty fields and a list of
   * the source files — or the git changes since a ref (`HEAD`). An empty
   * line drafts every exported fn; an empty target is the CLI's default.
   * The mode is the model's (hybrid) when one is configured, else algo.
   */
  private openCodeDraftPrompt(): void {
    const code = this.state.mode === "code" ? this.state.code : null;
    let file = code?.file ?? "";
    let line = code ? String(code.line) : "";
    if (!code && this.state.mode !== "merge") {
      const id = this.idAtCursor();
      const node = id === null ? undefined : this.state.analysis?.snapshot?.nodes[id];
      if (node?.file) {
        file = node.file;
        line = node.kind === "fn" && node.line !== null && node.line !== undefined ? String(node.line) : "";
      }
    }
    const mode = this.agentName() !== null ? "hybrid" : "algo";
    this.state.prompt = { kind: "code-to-spec", text: "", items: [], ids: [], index: 0, codeDraft: { source: "file", file, line, since: "HEAD", into: "", mode, output: "proposal" } };
    this.refreshCodeDraftPrompt();
  }

  /**
   * What the current snapshot says of the form's position: the fns it
   * names and the spec's name, or why it names none (the CLI's message);
   * null without a snapshot or a file, and for a git change (git decides
   * when the draft runs). Reads the snapshot only.
   */
  private codePosition(form: CodeDraftForm): { name: string; triggers: string[] } | { error: string; field: "file" | "line" } | null {
    const snapshot = this.state.analysis?.snapshot ?? null;
    const file = toPosix(form.file.trim());
    if (form.source !== "file" || snapshot === null || file === "") return null;
    const line = form.line.trim() === "" ? null : Number(form.line.trim());
    try {
      return codeToSpecTriggers(snapshot, file, line);
    } catch (error) {
      const declares = Object.values(snapshot.nodes).some((node) => node.kind === "fn" && node.file === file);
      return { error: errorText(error), field: declares ? "line" : "file" };
    }
  }

  /** The target the draft would use: the typed one, else the CLI's default — `changes` for a git change, the position's name for a file (`<name>` while it names no fn). */
  private codeDraftTarget(form: CodeDraftForm): string {
    const into = form.into.trim();
    if (into !== "") return toPosix(into);
    if (form.source === "since") return `${this.merges.specDir()}/flows/changes.md`;
    const position = this.codePosition(form);
    return `${this.merges.specDir()}/flows/${position !== null && "name" in position ? position.name : "<name>"}.md`;
  }

  /** The source files of the current snapshot that declare a fn and contain the typed text, at most eight. */
  private sourceMatches(typed: string): string[] {
    const nodes = this.state.analysis?.snapshot?.nodes ?? {};
    const files = new Set<string>();
    for (const node of Object.values(nodes)) if (node.kind === "fn" && node.file && node.layer !== "external") files.add(node.file);
    if (files.has(typed)) return [];
    const query = typed.toLowerCase();
    return [...files].filter((file) => file.toLowerCase().includes(query)).sort(compareText).slice(0, 8);
  }

  /** Why the draft may not start now, or null: the source's fields, a model llm needs, then (a proposal only) the target, a pending proposal, an unsaved target. */
  private codeDraftProblem(form: CodeDraftForm): { field: string; text: string } | null {
    let position: ReturnType<App["codePosition"]> = null;
    if (form.source === "since") {
      if (form.since.trim() === "") return { field: "since", text: "a git ref is required (HEAD: the changes not committed yet)" };
    } else {
      if (form.file.trim() === "") return { field: "file", text: "a source file is required, relative to the root" };
      const line = form.line.trim();
      if (line !== "" && !(/^\d+$/.test(line) && Number(line) >= 1)) return { field: "line", text: `line \`${line}\`: a whole number from 1, or empty for every exported fn of the file` };
      position = this.codePosition(form);
      if (position !== null && "error" in position) return { field: position.field, text: position.error };
    }
    if (form.mode === "llm" && this.agentName() === null) return { field: "mode", text: "--mode llm needs a model: set `agent` in keylang.json (hybrid drafts from the snapshot without one)" };
    if (form.output === "preview") return null;
    // Without a snapshot the default target of a file is not known yet: the operation checks it.
    if (form.source === "file" && form.into.trim() === "" && position === null) return null;
    const target = this.codeDraftTarget(form);
    const problem = proposalProblem(this.state.root, this.merges.specDir(), target, (path) => this.generatedDoc(path));
    if (problem !== null) return { field: "into", text: `${target}: ${problem}` };
    if (this.proposalWaiting(target)) return { field: "into", text: `a proposal for ${target} is waiting: merge it first (m, or Proposals)` };
    const buffer = this.state.buffers.get(target);
    if (buffer && isDirty(buffer)) return { field: "into", text: `${target} has unsaved changes: save (Ctrl+S) or undo them before a draft into it` };
    return null;
  }

  /** The rows, the root, and a note on the selected row: what the source names, the mode, the target's state or why it cannot run. */
  private refreshCodeDraftPrompt(): void {
    const prompt = this.state.prompt;
    const form = prompt?.codeDraft;
    if (prompt?.kind !== "code-to-spec" || !form) return;
    const selected = prompt.ids?.[prompt.index] ?? (form.source === "file" ? "file" : "since");
    const caret = (row: string): string => (selected === row ? "▏" : "");
    const target = this.codeDraftTarget(form);
    // Only the chosen source's rows: the other source's fields are kept as typed but never sent.
    const sourceRows: { id: string; text: string }[] =
      form.source === "file"
        ? [
            { id: "file", text: `file:    ${form.file}${caret("file")}` },
            ...this.sourceMatches(toPosix(form.file.trim())).map((file) => ({ id: `src:${file}`, text: `    ${file}` })),
            { id: "line", text: `line:    ${form.line}${caret("line")}${form.line.trim() === "" ? "  (none: every exported fn of the file)" : ""}` },
          ]
        : [{ id: "since", text: `since:   ${form.since}${caret("since")}  (git ref: the fns changed in the working tree since it)` }];
    const rows: { id: string; text: string }[] = [
      { id: "source", text: `source:  ${form.source === "file" ? "a file or a line" : "git changes"} · ←→ ${form.source === "file" ? "git changes" : "a file or a line"}` },
      ...sourceRows,
      { id: "into", text: `target:  ${form.into}${caret("into")}${form.into.trim() === "" ? `  (default ${target})` : ""}` },
      { id: "mode", text: `mode:    ${form.mode} · ←→ ${DRAFT_MODES[(DRAFT_MODES.indexOf(form.mode) + 1) % DRAFT_MODES.length]}` },
      { id: "output", text: `output:  ${form.output} · ←→ ${form.output === "proposal" ? "preview" : "proposal"}` },
      { id: "run", text: form.output === "proposal" ? `Create the proposal ${PROPOSALS_DIR}/${target} (the target itself is not written)` : "Preview the flows (writes nothing)" },
    ];
    prompt.ids = rows.map((row) => row.id);
    prompt.items = rows.map((row) => row.text);
    const fallbackRow = selected === "file" || selected === "line" || selected.startsWith("src:") ? "since" : selected === "since" ? "file" : selected;
    prompt.index = Math.max(0, prompt.ids.indexOf(prompt.ids.includes(selected) ? selected : fallbackRow));
    const scope = form.source === "file" ? "the file and the target are relative to it" : "the target is relative to it; git runs in it and only reads";
    const how = form.mode === "algo" ? `algo: only the calls the snapshot resolved; no model, no search beyond the ${form.source === "file" ? "file" : "changed fns"}` : "the model drafts each flow; its steps are marked agree, llm-only or conflict; never evidence";
    prompt.details = [`root: ${this.state.root} · ${scope} · ${how}`];
    const now = prompt.ids[prompt.index]!;
    const problem = this.codeDraftProblem(form);
    const position = this.codePosition(form);
    const named = position !== null && "triggers" in position ? (form.line.trim() === "" ? `${position.triggers.length} exported fn(s): ${position.triggers.join(", ")}` : `line ${form.line.trim()} is in ${position.triggers[0]}`) : null;
    const agent = this.agentName();
    if (now.startsWith("src:")) prompt.note = `Enter takes ${now.slice(4)} as the file`;
    else if (now === "source") prompt.note = form.source === "file" ? "the fn at a line, or every exported fn of a file" : "every fn changed since the ref, untracked files whole; a fn already in a hand-written flow is named, not drafted again";
    else if (now === "file" && form.file.trim() === "") prompt.note = "type a source file · ↓ picks a match";
    else if (now === "mode")
      prompt.note =
        form.mode === "algo"
          ? "algo: only the calls the snapshot resolved; no model"
          : agent === null
            ? form.mode === "hybrid"
              ? "no model configured (agent in keylang.json): hybrid drafts from the snapshot only, as algo, and says so"
              : (problem?.text ?? "")
            : `${agent} drafts each flow in turn with the context pack (F4)${form.mode === "hybrid" ? "; the steps it missed come from the snapshot" : "; each step is judged against the snapshot"}`;
    else if (problem !== null && (problem.field === now || now === "run" || now === "output")) prompt.note = problem.text;
    else if (now === "file" || now === "line")
      prompt.note = named ?? (this.state.analysis?.snapshot ? "" : "no current snapshot to look it up; the operation reads the saved code");
    else if (now === "since") prompt.note = "the saved working tree against the ref: no checkout, no commit";
    else if (now === "into") prompt.note = existsSync(join(this.state.root, target)) ? `${target} exists: its other sections are kept, a section of the same flow is replaced` : `${target} is a new file`;
    else prompt.note = form.output === "proposal" ? `Enter proposes${named ? ` ${named}` : ""}; MERGE applies it hunk by hunk` : "Enter shows the flows in F6; nothing is written";
  }

  /** ←→ on the source row (a file or the git changes), the mode row (algo, hybrid, llm) or the output row (proposal or preview). */
  private changeCodeDraftChoice(delta: -1 | 1): void {
    const prompt = this.state.prompt;
    const form = prompt?.codeDraft;
    const row = prompt?.ids?.[prompt.index];
    if (prompt?.kind !== "code-to-spec" || !form) return;
    if (row === "source") form.source = form.source === "file" ? "since" : "file";
    else if (row === "mode") form.mode = DRAFT_MODES[(DRAFT_MODES.indexOf(form.mode) + delta + DRAFT_MODES.length) % DRAFT_MODES.length]!;
    else if (row === "output") form.output = form.output === "proposal" ? "preview" : "proposal";
    else return;
    this.refreshCodeDraftPrompt();
  }

  /** The request of the form: only the chosen source's fields; the model's context as F4 shows it now. */
  private codeDraftRequest(form: CodeDraftForm): CodeToSpecRequest {
    const line = form.line.trim();
    const into = form.into.trim();
    const pack = form.mode === "algo" ? null : this.contextPack();
    const source: CodeToSpecSource = form.source === "since" ? { since: form.since.trim() } : { file: toPosix(form.file.trim()), ...(line !== "" ? { line: Number(line) } : {}) };
    return {
      kind: "code-to-spec",
      root: this.state.root,
      ...source,
      ...(into !== "" ? { into: toPosix(into) } : {}),
      output: form.output,
      pending: "refuse",
      ...(form.mode !== "algo" ? { mode: form.mode } : {}),
      ...(pack ? { context: contextText(pack) } : {}),
    };
  }

  /** The form a request was made from, enough to name its default target. */
  private codeDraftFormOf(request: CodeToSpecRequest): CodeDraftForm {
    return {
      source: request.since !== undefined ? "since" : "file",
      file: request.file ?? "",
      line: request.line === undefined ? "" : String(request.line),
      since: request.since ?? "",
      into: request.into ?? "",
      mode: request.mode ?? "algo",
      output: request.output,
    };
  }

  /**
   * Enter in the code-to-spec form. On a match it takes that file and moves
   * to the line; elsewhere a problem keeps the form (the typed values stay)
   * with the field selected, else the draft runs as the session's operation.
   */
  private submitCodeDraft(): void {
    const prompt = this.state.prompt;
    const form = prompt?.codeDraft;
    if (prompt?.kind !== "code-to-spec" || !form) return;
    const row = prompt.ids?.[prompt.index] ?? "";
    if (row.startsWith("src:")) {
      form.file = row.slice(4);
      prompt.index = -1;
      prompt.ids = [];
      this.refreshCodeDraftPrompt();
      prompt.index = prompt.ids!.indexOf("line");
      this.refreshCodeDraftPrompt();
      return;
    }
    const problem = this.codeDraftProblem(form);
    if (problem !== null) {
      prompt.index = Math.max(0, prompt.ids!.indexOf(problem.field));
      this.refreshCodeDraftPrompt();
      this.state.message = `code-to-spec: ${problem.text}`;
      return;
    }
    // The model sees the context pack as F4 shows it now: taken once, before anything else opens.
    const request = this.codeDraftRequest(form);
    this.state.prompt = null;
    this.requestOperation("code-to-spec", request);
  }

  /** A finished code-to-spec draft: the proposal opens MERGE under the same rule as a flow draft's, naming every flow it proposes and the model's notes. */
  private afterCodeDraft(record: OperationRecord, origin: DraftOrigin): void {
    const result = record.result;
    if (result?.kind !== "code-to-spec" || result.status !== "completed" || result.payload === null) return;
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
    if (this.stillWhereDraftStarted(origin)) {
      this.merges.open(candidate.target);
      if (this.state.merge?.path === candidate.target) this.state.message = `code-to-spec: ${PROPOSALS_DIR}/${candidate.target} (${flows}) · MERGE: decide the hunks, w writes ${candidate.target}${notes}`;
      return;
    }
    this.state.message = `code-to-spec: ${PROPOSALS_DIR}/${candidate.target} (${flows}) waits: m, Proposals or Enter in F6 opens MERGE${notes}`;
  }

  // ---------- spec-to-code: a stub and failing tests for a planned fn (template), or the model's code ----------

  /** The planned fns of the current analysis that no code implements yet: the IDs spec-to-code builds. */
  private plannedFns(): string[] {
    const analysis = this.state.analysis;
    if (!analysis) return [];
    const nodes = analysis.snapshot?.nodes ?? {};
    return [...new Set(analysis.spec.planned.filter((item) => item.decl === "fn" && nodes[item.id] === undefined).map((item) => item.id))].sort(compareText);
  }

  /**
   * The spec-to-code form (design §2.4 `spec-to-code`): the planned fn —
   * given (a feature's planned gap), else the one under the cursor, else
   * typed or picked from the planned fns — the code file (empty: the
   * module's, shown next to it), the mode (the offline template unless
   * llm is chosen) and preview or proposal.
   */
  private openSpecCodePrompt(id?: string): void {
    let initial = id ?? "";
    if (id === undefined && this.state.mode !== "merge") {
      const at = this.idAtCursor();
      if (at !== null && this.plannedFns().includes(at)) initial = at;
    }
    this.state.prompt = { kind: "spec-to-code", text: "", items: [], ids: [], index: 0, specCode: { id: initial, into: "", mode: "algo", output: "proposal" } };
    this.refreshSpecCodePrompt();
  }

  /** Where the code would go, or why spec-to-code builds none: its own checks on the current analysis; null without one or without an ID. */
  private specCodeTarget(form: SpecCodeForm): ReturnType<typeof plannedCodeTarget> | null {
    const analysis = this.state.analysis;
    const id = form.id.trim();
    if (!analysis || id === "") return null;
    const into = form.into.trim();
    return plannedCodeTarget(analysis, id, into !== "" ? toPosix(into) : undefined);
  }

  /** The planned fns containing the typed text, at most eight; none once it is one. */
  private plannedMatches(typed: string): string[] {
    const planned = this.plannedFns();
    if (planned.includes(typed)) return [];
    const query = typed.toLowerCase();
    return planned.filter((id) => id.toLowerCase().includes(query)).slice(0, 8);
  }

  /** Why spec-to-code may not start now, or null: an ID, spec-to-code's own checks, a model llm needs, then (a proposal only) a proposal waiting for the code file. */
  private specCodeProblem(form: SpecCodeForm): { field: string; text: string } | null {
    if (form.id.trim() === "") return { field: "id", text: "a planned fn id is required" };
    const placed = this.specCodeTarget(form);
    if (placed !== null && "error" in placed) return { field: placed.field, text: placed.error };
    if (form.mode === "llm" && this.agentName() === null) return { field: "mode", text: "--mode llm needs a model: set `agent` in keylang.json (algo writes the template without one)" };
    // Without an analysis the operation checks the ID; a test file's waiting proposal it refuses too.
    if (form.output === "preview" || placed === null) return null;
    if (this.proposalWaiting(placed.file)) return { field: "into", text: `a proposal for ${placed.file} is waiting: merge it first (m, or Proposals)` };
    return null;
  }

  /** The rows, the root and what the template is, and a note on the selected row. */
  private refreshSpecCodePrompt(): void {
    const prompt = this.state.prompt;
    const form = prompt?.specCode;
    if (prompt?.kind !== "spec-to-code" || !form) return;
    const selected = prompt.ids?.[prompt.index] ?? "id";
    const caret = (row: string): string => (selected === row ? "▏" : "");
    const placed = this.specCodeTarget(form);
    const file = placed !== null && "file" in placed ? placed.file : null;
    const rows: { id: string; text: string }[] = [
      { id: "id", text: `id:      ${form.id}${caret("id")}` },
      ...this.plannedMatches(form.id.trim()).map((id) => ({ id: `planned:${id}`, text: `    planned fn ${id}` })),
      { id: "into", text: `target:  ${form.into}${caret("into")}${form.into.trim() === "" ? `  (default ${file ?? "the module's file"})` : ""}` },
      { id: "mode", text: `mode:    ${form.mode} · ←→ ${form.mode === "algo" ? "llm" : "algo"}` },
      { id: "output", text: `output:  ${form.output} · ←→ ${form.output === "proposal" ? "preview" : "proposal"}` },
      { id: "run", text: form.output === "proposal" ? `Create the proposals under ${PROPOSALS_DIR}/: the code and each new test (no file itself is written)` : "Preview the candidate (writes nothing)" },
    ];
    prompt.ids = rows.map((row) => row.id);
    prompt.items = rows.map((row) => row.text);
    prompt.index = Math.max(0, prompt.ids.indexOf(selected));
    const how =
      form.mode === "algo"
        ? "template: the declared signature with a body that fails until written, a failing node:test per flow test; no model"
        : "llm: the model writes the function and each new test file; checked as code, proposed for MERGE, never accepted for you; the tests are not run";
    prompt.details = [`root: ${this.state.root} · the target is relative to it · ${how}`];
    const now = prompt.ids[prompt.index]!;
    const problem = this.specCodeProblem(form);
    const planned = this.plannedFns();
    const agent = this.agentName();
    if (now.startsWith("planned:")) prompt.note = `Enter takes ${now.slice(8)}`;
    else if (now === "mode")
      prompt.note =
        form.mode === "algo"
          ? "algo: the template, offline; no model"
          : agent === null
            ? (problem?.text ?? "")
            : `${agent} writes the code, then each new test file: one request each; its credentials are checked before the first`;
    else if (now === "id" && form.id.trim() === "") prompt.note = this.state.analysis ? `type a planned fn · ↓ picks one (${planned.length} planned, not implemented)` : "no current analysis to look it up; the operation reads the saved specs";
    else if (problem !== null && (problem.field === now || now === "run" || now === "output")) prompt.note = problem.text;
    else if (now === "id") prompt.note = file === null ? "no current analysis to look it up; the operation reads the saved specs" : `${form.id.trim()}: planned fn, its code goes to ${file}`;
    else if (now === "into") prompt.note = file === null ? "" : existsSync(join(this.state.root, file)) ? `${file} exists: the stub is appended, the rest is kept` : `${file} is a new file`;
    else prompt.note = form.output === "proposal" ? "Enter proposes the code and its tests; each merges on its own in MERGE" : "Enter shows the candidate in F6; nothing is written";
  }

  /** ←→ on the mode row (algo or llm) or the output row (proposal or preview). */
  private changeSpecCodeOutput(): void {
    const prompt = this.state.prompt;
    const row = prompt?.ids?.[prompt.index];
    if (prompt?.kind !== "spec-to-code" || !prompt.specCode) return;
    if (row === "mode") prompt.specCode.mode = prompt.specCode.mode === "algo" ? "llm" : "algo";
    else if (row === "output") prompt.specCode.output = prompt.specCode.output === "proposal" ? "preview" : "proposal";
    else return;
    this.refreshSpecCodePrompt();
  }

  /** Enter in the form: a match takes that ID; elsewhere a problem keeps the form with the field selected, else spec-to-code runs as the session's operation. */
  private submitSpecCode(): void {
    const prompt = this.state.prompt;
    const form = prompt?.specCode;
    if (prompt?.kind !== "spec-to-code" || !form) return;
    const row = prompt.ids?.[prompt.index] ?? "";
    if (row.startsWith("planned:")) {
      form.id = row.slice(8);
      prompt.index = -1;
      prompt.ids = [];
      this.refreshSpecCodePrompt();
      prompt.index = prompt.ids!.indexOf("into");
      this.refreshSpecCodePrompt();
      return;
    }
    const problem = this.specCodeProblem(form);
    if (problem !== null) {
      prompt.index = Math.max(0, prompt.ids!.indexOf(problem.field));
      this.refreshSpecCodePrompt();
      this.state.message = `spec-to-code: ${problem.text}`;
      return;
    }
    const into = form.into.trim();
    this.state.prompt = null;
    const request: SpecToCodeRequest = { kind: "spec-to-code", root: this.state.root, id: form.id.trim(), ...(into !== "" ? { into: toPosix(into) } : {}), output: form.output, pending: "refuse", ...(form.mode === "llm" ? { mode: "llm" as const } : {}) };
    this.requestOperation("spec-to-code", request);
  }

  /**
   * Finished spec-to-code proposals: the code file opens MERGE under the
   * same rule as a draft's, and the message names the tests waiting next;
   * otherwise they all wait. A candidate is never the feature done.
   */
  private afterSpecCode(record: OperationRecord, origin: DraftOrigin): void {
    const result = record.result;
    if (result?.kind !== "spec-to-code" || result.payload === null || result.payload.proposals.length === 0) return;
    const files = result.payload.proposals.map((store) => store.slice(PROPOSALS_DIR.length + 1));
    const [code, ...rest] = files;
    const next = rest.length > 0 ? ` · then m or Proposals: ${rest.join(", ")}` : "";
    const partial = result.status === "completed" ? "" : ` · ${result.status}: only these were proposed`;
    if (result.status === "completed" && this.stillWhereDraftStarted(origin)) {
      this.merges.open(code);
      if (this.state.merge?.path === code) {
        const after = result.payload.mode === "llm" ? `the model's code is a candidate: review it, run its tests, then check` : "run check after: the stub is not the feature done";
        this.state.message = `spec-to-code: ${PROPOSALS_DIR}/${code} · MERGE: decide the hunks, w writes ${code}${next} · ${after}`;
        return;
      }
    }
    this.state.message = `spec-to-code: ${files.length} proposal(s) wait: ${files.join(", ")} · m, Proposals or Enter in F6 opens them${partial}`;
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

  /** The draft-layout form (design §2.4 `draft map`): the mode (hybrid with a model, else algo), then run; nothing is written. */
  private openLayoutDraftPrompt(): void {
    const mode = this.agentName() !== null ? "hybrid" : "algo";
    this.state.prompt = { kind: "draft-layout", text: "", items: [], ids: [], index: 0, layoutDraft: { mode } };
    this.refreshLayoutDraftPrompt();
  }

  private refreshLayoutDraftPrompt(): void {
    const prompt = this.state.prompt;
    const form = prompt?.layoutDraft;
    if (prompt?.kind !== "draft-layout" || !form) return;
    const selected = prompt.ids?.[prompt.index] ?? "mode";
    const rows = [
      { id: "mode", text: `mode:    ${form.mode} · ←→ ${DRAFT_MODES[(DRAFT_MODES.indexOf(form.mode) + 1) % DRAFT_MODES.length]}` },
      { id: "run", text: "Draft the layers (writes nothing; F6 shows them, Enter there moves them into keylang.json's buffer)" },
    ];
    prompt.ids = rows.map((row) => row.id);
    prompt.items = rows.map((row) => row.text);
    prompt.index = Math.max(0, prompt.ids.indexOf(selected));
    const exists = existsSync(join(this.state.root, CONFIG_FILE));
    prompt.details = [
      `root: ${this.state.root} · drafted from the saved ${CONFIG_FILE}${exists ? "" : " (none: the inferred one)"} and the code · only layers change, in the buffer, until Ctrl+S`,
    ];
    const agent = this.agentName();
    const problem = this.layoutDraftProblem(form.mode);
    if (prompt.ids[prompt.index] === "mode")
      prompt.note =
        form.mode === "algo"
          ? "algo: the layers keylang would guess from the directories; no model"
          : agent === null
            ? form.mode === "hybrid"
              ? "no model configured (agent in keylang.json): hybrid drafts as algo, and says so"
              : (problem ?? "")
            : `${agent} groups the source files into layers, validated as keylang.json`;
    else prompt.note = problem ?? "Enter drafts; nothing is written, not even a proposal";
  }

  /** Why a layout draft may not start: llm needs a model. */
  private layoutDraftProblem(mode: "algo" | "hybrid" | "llm"): string | null {
    return mode === "llm" && this.agentName() === null ? "--mode llm needs a model: set `agent` in keylang.json (hybrid drafts as algo without one)" : null;
  }

  private changeLayoutDraftMode(delta: -1 | 1): void {
    const prompt = this.state.prompt;
    if (prompt?.kind !== "draft-layout" || !prompt.layoutDraft || prompt.ids?.[prompt.index] !== "mode") return;
    prompt.layoutDraft.mode = DRAFT_MODES[(DRAFT_MODES.indexOf(prompt.layoutDraft.mode) + delta + DRAFT_MODES.length) % DRAFT_MODES.length]!;
    this.refreshLayoutDraftPrompt();
  }

  private submitLayoutDraft(): void {
    const prompt = this.state.prompt;
    const form = prompt?.layoutDraft;
    if (prompt?.kind !== "draft-layout" || !form) return;
    const problem = this.layoutDraftProblem(form.mode);
    if (problem !== null) {
      prompt.index = 0;
      this.refreshLayoutDraftPrompt();
      this.state.message = `draft map: ${problem}`;
      return;
    }
    this.state.prompt = null;
    const request: DraftLayoutRequest = { kind: "draft-layout", root: this.state.root, ...(form.mode !== "algo" ? { mode: form.mode } : {}) };
    this.requestOperation("draft-layout", request);
  }

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
      this.closeResults();
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
    this.closeResults();
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

  // ---------- export ----------

  /**
   * The export form of the report `exportRecord` picks (design §2.6): the
   * format, the path (a default per format under `.keylang/export/`) and the
   * target as it is now. Nothing is written before Save; Esc writes nothing.
   */
  private openExportPrompt(): void {
    if (this.state.activeOperation !== null) {
      this.state.message = "export: an operation is already running";
      return;
    }
    const found = exportRecord(this.state);
    if ("reason" in found) {
      this.state.message = `export: ${found.reason}`;
      return;
    }
    const { record } = found;
    // A parse report is exported in the view it was shown in, unless another is chosen.
    // A trace plan has one format, the JSON the adapters read.
    const formats: readonly ExportFormat[] = record.kind === "check" ? CHECK_FORMATS : record.kind === "parse" ? PARSE_FORMATS : record.kind === "trace-plan" ? ["json"] : ["human"];
    const format: ExportFormat = record.kind === "check" || record.kind === "trace-plan" ? "json" : record.params.kind === "parse" ? record.params.format : "human";
    this.state.prompt = {
      kind: "export",
      text: defaultExportPath(record.kind, format),
      items: [],
      ids: ["format", "path", "save"],
      index: 2,
      exportForm: { record: record.id, formats, format, custom: false, expect: null, problem: null, bytes: this.exportBytes(record, format) },
    };
    this.refreshExportPrompt();
  }

  /** The bytes of the report in a format: exactly what the CLI prints, from the record's payload. */
  private exportBytes(record: OperationRecord, format: ExportFormat): number {
    const source = exportSourceOf(record, format);
    return source === null ? 0 : Buffer.byteLength(exportText(source), "utf8");
  }

  /** Why the typed target cannot receive the export now, or null. A dirty buffer of it is never written under. */
  private exportProblem(path: string): string | null {
    if (path === "") return "type the target path, relative to the root";
    let problem: string | null;
    try {
      problem = exportTargetProblem(this.state.root, path);
    } catch (error) {
      problem = errorText(error);
    }
    if (problem !== null) return problem;
    const buffer = this.state.buffers.get(path);
    return buffer && isDirty(buffer) ? "open with unsaved edits: save or undo them first; an export never writes under them" : null;
  }

  /** The rows of the form: the report (and whether it is outdated), the target as it is now, and what Save writes. Reading only. */
  private refreshExportPrompt(): void {
    const prompt = this.state.prompt;
    const form = prompt?.exportForm;
    if (prompt?.kind !== "export" || !form) return;
    const record = this.state.records.find((candidate) => candidate.id === form.record);
    const path = prompt.text.trim();
    prompt.items = [
      `format: ${form.format}${form.formats.length > 1 ? ` · ←→ ${form.formats.join(" / ")}` : " · the only output of an explained edge"}`,
      `path: ${prompt.text}▏`,
      `Save ${path === "" ? "…" : path} (writes this one file)`,
    ];
    form.problem = this.exportProblem(path);
    let target: string;
    if (form.problem !== null) {
      form.expect = null;
      target = `refused: ${form.problem}`;
    } else {
      // What the form shows is what Save expects: a change after this is a conflict.
      form.expect = readText(resolve(this.state.root, path));
      const parent = dirname(path);
      target =
        form.expect !== null
          ? `exists, ${Buffer.byteLength(form.expect, "utf8")} bytes: replaced on Save`
          : `new file${parent !== "." && !existsSync(resolve(this.state.root, parent)) ? ` · creates ${parent}/` : ""}`;
    }
    prompt.details = [
      record ? `report #${record.id}: ${operationLabel(record.params)} · ${recordSummary(record)}` : "the report is gone",
      ...(record?.outdated != null ? [`outdated: ${record.outdated} · saved as it ran; nothing is checked again`] : []),
      `target: ${path === "" ? "—" : path} · ${target}`,
      `${form.bytes} bytes of ${form.format}: the CLI's stdout, no ANSI, no status lines`,
    ];
    prompt.note = form.problem ?? "Enter saves · ←→ format · Esc writes nothing";
  }

  /** ←→ in the export form: the next format; an untouched default path follows it. */
  private changeExportFormat(delta: 1 | -1): void {
    const prompt = this.state.prompt;
    const form = prompt?.exportForm;
    if (!prompt || !form) return;
    const record = this.state.records.find((candidate) => candidate.id === form.record);
    form.format = form.formats[(form.formats.indexOf(form.format) + delta + form.formats.length) % form.formats.length]!;
    if (!form.custom && record) prompt.text = defaultExportPath(record.kind, form.format);
    if (record) form.bytes = this.exportBytes(record, form.format);
    this.refreshExportPrompt();
  }

  /**
   * Enter in the export form, on any row: the report as it ran goes to the
   * shown target through the file protocol. A refusal keeps the form; the
   * target is expected as the form last showed it.
   */
  private submitExport(): void {
    const prompt = this.state.prompt;
    const form = prompt?.exportForm;
    if (prompt?.kind !== "export" || !form) return;
    const record = this.state.records.find((candidate) => candidate.id === form.record);
    const source = record ? exportSourceOf(record, form.format) : null;
    if (!record || source === null) {
      this.state.prompt = null;
      this.state.message = "export: the report is gone";
      return;
    }
    const path = prompt.text.trim();
    const problem = this.exportProblem(path);
    if (problem !== null || form.problem !== null) {
      // A target that became writable since the form showed a refusal is shown again first.
      this.refreshExportPrompt();
      this.state.message = problem === null ? "export: the target changed; check the form and press Enter again" : `export: ${problem}`;
      return;
    }
    this.state.prompt = null;
    this.startOperation("export", { kind: "export", root: this.state.root, path, expect: form.expect, source });
  }

  // ---------- export c4 ----------

  /**
   * The C4 form (c4-zoom/12): the format, the level, one layer or all, and
   * the file to write. Without a file the diagram shows in F6 and nothing is
   * written. Nothing runs before Enter; Esc runs nothing.
   */
  private openC4Prompt(): void {
    const layers = this.state.analysis ? [...this.state.analysis.config.layers.keys()] : [];
    this.state.prompt = { kind: "export-c4", text: "", items: [], ids: ["format", "level", "layer", "out", "run"], index: 4, c4: { format: "plantuml", level: "component", layer: null, layers } };
    this.refreshC4Prompt();
  }

  /** The request the form would run: the CLI's flags, a layer only at the component level. */
  private c4Request(form: C4Form, out: string): ExportC4Request {
    return {
      kind: "export-c4",
      root: this.state.root,
      format: form.format,
      level: form.level,
      ...(form.level === "component" && form.layer !== null ? { layer: form.layer } : {}),
      ...(out !== "" ? { out: toPosix(out) } : {}),
    };
  }

  /** The rows of the form, and what Enter would do with the file as it is now. Reading only. */
  private refreshC4Prompt(): void {
    const prompt = this.state.prompt;
    const form = prompt?.c4;
    if (prompt?.kind !== "export-c4" || !form) return;
    const out = prompt.text.trim();
    prompt.items = [
      `format: ${form.format} · ←→ ${C4_FORMATS.join(" / ")}`,
      `level: ${form.level} · ←→ ${C4_LEVELS.join(" / ")}`,
      form.level === "component" ? `layer: ${form.layer ?? "all"} · ←→ all / ${form.layers.join(" / ")}` : "layer: — the container level draws the repository as one container",
      `out: ${prompt.text}▏`,
      `Run ${operationLabel(this.c4Request(form, out))}`,
    ];
    if (out === "") {
      prompt.note = "no file: the diagram shows in F6 and nothing is written · type a path to write it";
      return;
    }
    const current = readText(resolve(this.state.root, out));
    prompt.note =
      current === null
        ? `${out}: a new file, written on Enter`
        : isC4Diagram(current)
          ? `${out}: a diagram export c4 wrote: replaced on Enter`
          : `${out}: not a diagram export c4 wrote: Enter refuses it, nothing is written`;
  }

  /** ←→ on the format, the level or the layer row: the next choice. */
  private changeC4Choice(delta: 1 | -1): void {
    const prompt = this.state.prompt;
    const form = prompt?.c4;
    if (!prompt || !form) return;
    const row = prompt.ids?.[prompt.index];
    const next = <T>(list: readonly T[], value: T): T => list[(list.indexOf(value) + delta + list.length) % list.length]!;
    if (row === "format") form.format = next(C4_FORMATS, form.format);
    else if (row === "level") form.level = next(C4_LEVELS, form.level);
    else if (row === "layer" && form.level === "component") form.layer = next([null, ...form.layers], form.layer);
    else return;
    this.refreshC4Prompt();
  }

  /** Enter on any row: the export as the form shows it; the operation checks the file again before it writes. */
  private submitC4(): void {
    const prompt = this.state.prompt;
    const form = prompt?.c4;
    if (prompt?.kind !== "export-c4" || !form) return;
    const request = this.c4Request(form, prompt.text.trim());
    this.state.prompt = null;
    this.requestOperation("export-c4", request);
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

  /** F6 or the palette: the pinned current analysis and the history of operation records. */
  private openResults(): void {
    const results = this.state.results;
    // Already open: keep the current selection — re-entering must not capture a stale focus or reset the record.
    if (results.open) return;
    results.open = true;
    results.previousFocus = this.state.focus;
    results.scrollReport = false;
    results.viewing = false;
    results.top = 0;
    results.left = 0;
    // The pinned "Current analysis" is the first entry; with records, the newest one stays selected as before.
    results.entry = this.state.records.length > 0 ? "record" : "analysis";
    results.index = Math.max(0, this.state.records.length - 1);
    this.clampFinding();
    this.state.focus = "results";
  }

  /** Esc closes the panel, not the running operation; the focus goes back where F6 was pressed. */
  private closeResults(): void {
    this.state.results.open = false;
    this.state.results.scrollReport = false;
    this.state.results.viewing = false;
    this.state.results.origin = null;
    this.state.focus = this.state.results.previousFocus;
  }

  /** Enter in the panel: reruns the selected record with its exact parameters. */
  private rerunRecord(): void {
    const record = this.state.records[this.state.results.index];
    if (!record) return;
    if (record.status === "running") {
      this.state.message = "this operation is still running";
      return;
    }
    // An export was made from the target as its form showed it: a new one shows the target again first.
    if (record.params.kind === "export") {
      this.state.message = "export: select the report and press e: the form shows the target again before Save";
      return;
    }
    // A proposed draft: Enter opens its MERGE (checked again: a proposal merged or rewritten since is judged as it is now).
    if ((record.result?.kind === "draft-flow" || record.result?.kind === "draft-rules" || record.result?.kind === "code-to-spec") && record.result.payload?.proposal != null && record.result.payload.candidate !== null) {
      this.closeResults();
      return this.merges.open(record.result.payload.candidate.target);
    }
    // The model's questions: Enter opens MERGE of the feature file (checked again, as a draft's).
    if (record.result?.kind === "feature-questions" && record.result.payload?.proposal != null) {
      this.closeResults();
      return this.merges.open(record.result.payload.file);
    }
    // Spec-to-code proposes several files: Enter opens the proposals list on the first still waiting, so each merges on its own.
    if (record.result?.kind === "spec-to-code" && (record.result.payload?.proposals.length ?? 0) > 0) {
      this.closeResults();
      return this.openProposals(record.result.payload!.proposals.map((store) => store.slice(PROPOSALS_DIR.length + 1)));
    }
    // A current layout draft: Enter moves its layers into keylang.json's buffer; an outdated one drafts again.
    if (record.result?.kind === "draft-layout" && record.result.payload !== null && record.outdated === null) return this.moveLayers(record);
    // Doctor reads no specs; a feature rerun reads the saved files, so dirty buffers go through the save step.
    if (record.params.kind === "doctor") return this.startOperation(record.action, record.params);
    return this.requestOperation(record.action, record.params);
  }

  /** While the panel is open its keys stay with it; Tab switches between the entries and the content. */
  private resultsKey(event: KeyEvent): void {
    if (this.state.results.entry === "analysis") return this.findingsKey(event);
    const results = this.state.results;
    const records = this.state.records;
    const page = Math.max(1, layout(this.state).panel.height - 4);
    const select = (next: number): void => {
      results.index = Math.max(0, Math.min(Math.max(0, records.length - 1), next));
      // Each record shows its report from the top; a selection change never keeps a scroll offset of another report.
      results.top = 0;
      results.left = 0;
      results.gap = 0;
    };
    switch (event.name) {
      case "left":
      case "right": {
        // Sideways over the report (after Tab): a long row of an edge, a JSON line or a path is read whole.
        if (!results.scrollReport) return;
        const max = reportOverflow(resultsReportRows(this.state), layout(this.state).panel.width - 4);
        results.left = Math.max(0, Math.min(max, results.left + (event.name === "left" ? -SIDE_STEP : SIDE_STEP)));
        return;
      }
      case "up":
      case "k":
        if (results.scrollReport) return this.scrollReport(-1);
        if (results.index === 0) {
          // The pinned current analysis sits above the records.
          results.entry = "analysis";
          results.top = 0;
          return this.clampFinding();
        }
        return select(results.index - 1);
      case "down":
      case "j":
        if (results.scrollReport) return this.scrollReport(1);
        return select(results.index + 1);
      case "pageup":
        if (results.scrollReport) return this.scrollReport(-page);
        return select(results.index - page);
      case "pagedown":
        if (results.scrollReport) return this.scrollReport(page);
        return select(results.index + page);
      case "tab":
        results.scrollReport = !results.scrollReport;
        if (results.scrollReport) this.showGapReason();
        return;
      case "enter":
        // Over the gaps of a feature record Enter opens the selected gap; over the entries it reruns.
        if (results.scrollReport && this.selectedGap()) return this.openGap();
        // Over a wire report: the generated file in the read-only viewer, or the first blocking error.
        if (results.scrollReport && this.wireTarget()) return this.openWireTarget();
        return this.rerunRecord();
      case "f5":
        return this.reanalyze();
      case "f6":
      case "escape":
        return this.closeResults();
      case "x":
        return this.cancelOperation();
      case "e":
        return this.openExportPrompt();
      case "a":
        return this.applyCandidate(this.state.records[this.state.results.index]);
      case "g":
        // Over a planned gap of a feature report: the spec-to-code form for the same ID.
        if (results.scrollReport) return this.specCodeForGap();
        return;
      case "m": {
        // On a feature report: the model's open questions for that feature, as a proposal (c4-zoom/11).
        const record = records[results.index];
        if (record?.result?.kind === "feature" && record.params.kind === "feature") return this.askFeatureQuestions(record.params.slug);
        return;
      }
      case "q":
        return this.quit();
      case "?":
        this.state.help = true;
        return;
      default:
        return;
    }
  }

  /** The keys of the pinned "Current analysis" entry: the findings list with verdict filters. */
  private findingsKey(event: KeyEvent): void {
    const results = this.state.results;
    const page = Math.max(1, findingsListRows(this.state, layout(this.state).panel));
    switch (event.name) {
      case "up":
      case "k":
        if (results.scrollReport) return this.moveFinding(-1);
        return; // The analysis entry is pinned at the top; nothing above it.
      case "down":
      case "j":
        if (results.scrollReport) return this.moveFinding(1);
        if (this.state.records.length > 0) {
          // Below the pinned entry come the records.
          results.entry = "record";
          results.index = 0;
          results.top = 0;
        }
        return;
      case "pageup":
      case "pagedown":
        if (results.scrollReport) return this.moveFinding(event.name === "pageup" ? -page : page);
        return;
      case "tab":
        // Tab switches the arrows between the entries and the findings.
        results.scrollReport = !results.scrollReport;
        return;
      case "enter":
        // Enter opens the selected finding straight away; back in the list the arrows select findings.
        results.scrollReport = true;
        return this.openFinding();
      case "f5":
        return this.reanalyze();
      case "f6":
      case "escape":
        return this.closeResults();
      case "x":
        return this.cancelOperation();
      case "q":
        return this.quit();
      case "?":
        this.state.help = true;
        return;
      default: {
        // The filters hide verdicts; the report itself and its totals stay unchanged.
        const verdict = FILTER_KEYS.get(event.name);
        if (verdict === undefined) return;
        results.filter[verdict] = !results.filter[verdict];
        return this.clampFinding();
      }
    }
  }

  /** Moves the finding selection and keeps it in the visible part of the list. */
  private moveFinding(delta: number): void {
    this.state.results.finding += delta;
    this.clampFinding();
  }

  /** The finding selection stays within the filtered list, and the list scrolls to keep it in view. */
  private clampFinding(): void {
    const results = this.state.results;
    const visible = visibleFindings(findingsOf(this.state.analysis), results.filter);
    results.finding = Math.max(0, Math.min(results.finding, Math.max(0, visible.length - 1)));
    const rows = findingsListRows(this.state, layout(this.state).panel);
    if (results.finding < results.top) results.top = results.finding;
    if (results.finding >= results.top + rows) results.top = results.finding - rows + 1;
  }

  /** The finding selected in the filtered list of the current analysis, if any. */
  private selectedFinding(): CheckResult | undefined {
    return visibleFindings(findingsOf(this.state.analysis), this.state.results.filter)[this.state.results.finding];
  }

  /**
   * Enter on a finding: the panel hides while the target is shown — a spec
   * position in the editor (the file need not be among the Markdown buffers)
   * or the line in the read-only code viewer. Esc / Ctrl+O return to the list
   * without losing the selection and put back the place it was opened from.
   */
  private openFinding(): void {
    const finding = this.selectedFinding();
    if (finding) this.openTarget(finding.file, finding.line, finding.col);
  }

  /** Shows a spec position (1-based line, code-point column) or a code line with the F6 panel hidden; the origin is kept for the way back. */
  private openTarget(file: string, targetLine: number, targetCol: number): void {
    const results = this.state.results;
    // Leaving MERGE for the target would drop the open hunk decisions.
    if (this.state.mode === "merge") {
      this.state.message = "finish the merge first: it opens after MERGE";
      return;
    }
    const origin = { path: this.state.current, cursor: { ...this.state.cursor }, top: this.state.top, mode: this.state.mode, code: this.state.code };
    const abs = resolve(this.state.root, file);
    if (extname(file) === ".md" && !file.startsWith("..")) {
      const lines = bufferLines(this.load(file));
      const line = Math.max(0, Math.min(targetLine - 1, lines.length - 1));
      // Verdict columns are 1-based code points; the cursor counts grapheme clusters.
      const col = clusterAt(lines[line] ?? "", targetCol - 1);
      this.open(file, { line, col }, false);
      this.state.code = null;
    } else if (!this.showCode(file, abs, targetLine)) {
      return;
    }
    results.viewing = true;
    results.origin = origin;
    this.state.message = `Esc or Ctrl+O: back to the ${results.entry === "analysis" ? "findings list" : "report"} · F6: stay here`;
  }

  /** Back from a finding's target: the list with its selection, over the place the finding was opened from. */
  private returnToFindings(): void {
    const results = this.state.results;
    const origin = results.origin;
    results.viewing = false;
    results.origin = null;
    if (!origin) return;
    if (origin.path !== null) {
      this.load(origin.path);
      this.state.filesIndex = Math.max(0, this.state.files.indexOf(origin.path));
    }
    this.state.current = origin.path;
    this.state.cursor = { ...origin.cursor };
    this.state.mode = origin.mode;
    this.state.code = origin.code;
    this.state.selection = null;
    this.state.completion = null;
    this.state.hover = null;
    this.clampCursor();
    this.state.top = origin.top;
  }

  private scrollReport(delta: number): void {
    // Over the findings the selection moves, so it never leaves the shown rows.
    if (this.state.results.entry === "analysis") return this.moveFinding(delta);
    const results = this.state.results;
    const rows = resultsReportRows(this.state);
    const gaps = this.recordGaps();
    // A parse or trace-plan report is long text under its items: ↑↓ select one, a page or the wheel scrolls the text.
    const kind = this.state.records[results.index]?.kind;
    const scrollText = (kind === "parse" || kind === "trace-plan") && Math.abs(delta) > 1;
    if (gaps.length > 0 && !scrollText) {
      // A feature report: the arrows select a gap, and the report scrolls to keep it in view.
      results.gap = Math.max(0, Math.min(results.gap + delta, gaps.length - 1));
      const row = rows.findIndex((item) => item.gap === results.gap);
      const height = Math.max(1, resultsSplit(this.state, layout(this.state).panel.height).report);
      if (row < results.top) results.top = row;
      if (row >= results.top + height) results.top = row - height + 1;
      return this.showGapReason();
    }
    // The last page ends at the report's last row: a page down never leaves a lone row on an empty panel.
    const height = Math.max(1, resultsSplit(this.state, layout(this.state).panel.height).report);
    results.top = Math.max(0, Math.min(results.top + delta, Math.max(0, rows.length - height)));
  }

  /**
   * The items of the selected record the arrows select after Tab: the gaps of
   * a feature record, every result of a check record, the evidence of an
   * explain-edge record (an edge with no file has an empty one), the
   * diagnostics of a parse record; none for the others.
   * `text` is the whole reason, which the report row may cut.
   */
  private recordGaps(): readonly { file: string; line: number; col: number; text: string }[] {
    const result = this.state.records[this.state.results.index]?.result;
    // The gaps and hints up the stage ladder, as the readiness screen lists them (c4-zoom/11).
    if (result?.kind === "feature") return result.payload === null ? [] : featureItems(result.payload.report).map(({ item, hint }) => ({ file: item.file, line: item.line, col: item.col, text: `${hint ? "hint " : ""}${item.kind} ${item.id}: ${item.reason}` }));
    if (result?.kind === "check") return (result.payload?.results ?? []).map((item: CheckResult) => ({ file: item.file, line: item.line, col: item.col, text: `${item.verdict} ${item.code ?? item.criterion}: ${item.evidence}` }));
    if (result?.kind === "explain-edge" && result.payload !== null) return edgeItems(result.payload).map((item) => ({ ...item, file: item.file ?? "" }));
    // A place an explanation names: the node, a related ID the snapshot or a planned declares, a flow, a rule line.
    if (result?.kind === "explain" && result.payload?.subject === "node") return result.payload.links.map((link) => ({ file: link.file ?? "", line: link.line, col: link.col, text: link.text }));
    // A node the inventory lists: its code (or its planned line); a gone ID has no place.
    if (result?.kind === "explain-plan" && result.payload !== null) {
      const entries = result.payload.list === "stale-saved" ? result.payload.entries.map((entry) => ({ place: entry.place, text: `${entry.id}${entry.kind === "brief" ? " (brief)" : ""}: ${entry.state}` })) : result.payload.plan.map((entry) => ({ place: entry.place, text: `${entry.id} (${entry.level}): ${entry.reason}` }));
      return entries.map(({ place, text }) => ({ file: place?.file ?? "", line: place?.line ?? 1, col: place?.col ?? 1, text }));
    }
    // A node of the batch's plan, with what became of it.
    if (result?.kind === "explain-batch" && result.payload !== null) return result.payload.plan.map((entry) => ({ file: entry.place?.file ?? "", line: entry.place?.line ?? 1, col: entry.place?.col ?? 1, text: `${entry.id} (${entry.level}): ${batchState(result.payload!, entry.id)}` }));
    if (result?.kind === "explain-llm" && result.payload !== null) return result.payload.links.map((link) => ({ file: link.file ?? "", line: link.line, col: link.col, text: link.text }));
    // A diagnostic names its document as the paths did (`./a.md`): opened by its path from the root.
    // A symbol of a trace plan: its declaration in the code (1-based line and column, as the snapshot has them).
    if (result?.kind === "trace-plan") return (result.payload?.plan.symbols ?? []).map((symbol) => ({ file: symbol.file, line: symbol.line, col: symbol.col, text: `${symbol.id} ${symbol.file}:${symbol.line}:${symbol.col}` }));
    if (result?.kind === "parse") return (result.payload?.diagnostics ?? []).map((d) => ({ file: toPosix(relative(this.state.root, resolve(this.state.root, d.file))), line: d.span.start.line, col: d.span.start.col, text: formatDiagnostic(d) }));
    return [];
  }

  private selectedGap(): { file: string; line: number; col: number; text: string } | undefined {
    return this.recordGaps()[this.state.results.gap];
  }

  /** The report row cuts a long reason; the message line shows the selected item's whole reason. */
  private showGapReason(): void {
    const gap = this.selectedGap();
    if (gap) this.state.message = `${gap.file === "" ? `${gap.text} · no position in the code` : `${gap.text} · Enter opens ${gap.file}:${gap.line}`}${this.plannedGap() !== null ? " · g: spec-to-code" : ""}`;
  }

  /** The ID of the selected gap of a feature report when it is a planned fn no code implements yet, else null. */
  private plannedGap(): string | null {
    const result = this.state.records[this.state.results.index]?.result;
    if (result?.kind !== "feature" || result.payload === null) return null;
    const entry = featureItems(result.payload.report)[this.state.results.gap];
    return entry !== undefined && !entry.hint && entry.item.kind === "planned" && this.plannedFns().includes(entry.item.id) ? entry.item.id : null;
  }

  /** `g` on a planned gap: the spec-to-code form with its ID; the report stays in the history. */
  private specCodeForGap(): void {
    const id = this.plannedGap();
    if (id === null) {
      this.state.message = "g drafts code for a planned fn gap of a feature report";
      return;
    }
    this.closeResults();
    this.openSpecCodePrompt(id);
  }

  /** Enter on a gap or a check result: its file and position, like a finding (Esc / Ctrl+O come back to the report). */
  private openGap(): void {
    const gap = this.selectedGap();
    if (gap && gap.file !== "") this.openTarget(gap.file, gap.line, gap.col);
  }

  // ---------- mouse ----------

  private mouse(event: MouseEvent): void {
    // The F6 panel is modal over the editor area: only the wheel scrolls its report.
    // While a finding's target is shown (viewing), the keys and the wheel go to it instead.
    if (this.state.results.open && !this.state.results.viewing) {
      if (event.action === "wheel-up" || event.action === "wheel-down") this.scrollReport(event.action === "wheel-up" ? -3 : 3);
      return;
    }
    // The start screen covers the editor: a click never moves the hidden cursor.
    if (this.state.start !== null) return;
    const area = layout(this.state);
    const inside = (rect: { x: number; y: number; width: number; height: number } | null): boolean => rect !== null && event.x >= rect.x && event.x < rect.x + rect.width && event.y >= rect.y && event.y < rect.y + rect.height;
    // With the context panel open, the panel on the right is the context, not the navigation it covers.
    const context = this.state.context.open && inside(area.nav);
    // The zoom screen covers the editor: its rows, not the hidden buffer, take the wheel and the clicks.
    if (this.state.mode === "zoom" && inside(area.editor)) return this.zoomMouse(event, area.editor);
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
      const row = event.y - area.nav.y - 1;
      const index = this.state.navTop + row;
      // The title, the space below the last item and the explanation under the list open nothing.
      if (row < 0 || row >= navListHeight(this.state, area.nav) - 1 || index >= navEntries(this.state).length) return;
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
    // The baseline and layout forms are choices, not queries.
    if (prompt.kind === "baseline" || prompt.kind === "draft-layout") return;
    // The since row of the check form takes the git ref; every other row types the paths.
    if (prompt.kind === "full-check" && prompt.checkOptions && prompt.ids?.[prompt.index] === "since") prompt.checkOptions.since += text;
    else if (prompt.kind === "explain-edge") {
      const field = prompt.ids?.[prompt.index];
      if (prompt.edge && (field === "from" || field === "to")) prompt.edge[field] += text;
    } else if (prompt.kind === "draft-flow") {
      const field = prompt.ids?.[prompt.index];
      if (prompt.draft && (field === "trigger" || field === "name" || field === "into")) prompt.draft[field] += text;
    } else if (prompt.kind === "draft-rules") {
      if (prompt.rulesDraft && prompt.ids?.[prompt.index] === "into") prompt.rulesDraft.into += text;
    } else if (prompt.kind === "code-to-spec") {
      const field = prompt.ids?.[prompt.index];
      // The line is a number: anything but digits is not typed into it.
      if (prompt.codeDraft && (field === "file" || field === "into" || field === "since")) prompt.codeDraft[field] += text;
      else if (prompt.codeDraft && field === "line") prompt.codeDraft.line += text.replace(/[^0-9]/g, "");
    } else if (prompt.kind === "spec-to-code") {
      const field = prompt.ids?.[prompt.index];
      if (prompt.specCode && (field === "id" || field === "into")) prompt.specCode[field] += text;
    } else if (prompt.kind === "explain" && prompt.explainPlan) {
      // Typed as is: 0, 1.5 or a word are refused on Enter with the CLI's message.
      const field = prompt.ids?.[prompt.index];
      if (field === "limit" || field === "jobs") prompt.explainPlan[field] += text;
    } else prompt.text += text;
    if (prompt.kind === "export" && prompt.exportForm) prompt.exportForm.custom = true;
    if (prompt.kind === "palette") this.refreshPalette();
    if (prompt.kind === "node") this.findNodes();
    if (prompt.kind === "flow") this.findFlows();
    if (prompt.kind === "feature") this.refreshFeaturePrompt();
    if (prompt.kind === "proposal") this.refreshProposalPrompt();
    if (prompt.kind === "new-spec") this.refreshNewSpec();
    if (prompt.kind === "agents") this.refreshAgentsPrompt();
    if (prompt.kind === "init") this.refreshInitPrompt();
    if (prompt.kind === "fmt") this.refreshFmtPrompt();
    if (prompt.kind === "parse") this.refreshParsePrompt();
    if (prompt.kind === "trace-plan") this.refreshTracePlanPrompt();
    if (prompt.kind === "explain") this.refreshExplainPrompt();
    if (prompt.kind === "wire") this.refreshWirePrompt();
    if (prompt.kind === "full-check") this.refreshCheckPrompt();
    if (prompt.kind === "explain-edge") this.refreshEdgePrompt();
    if (prompt.kind === "export") this.refreshExportPrompt();
    if (prompt.kind === "draft-flow") this.refreshDraftPrompt();
    if (prompt.kind === "draft-rules") this.refreshRulesDraftPrompt();
    if (prompt.kind === "code-to-spec") this.refreshCodeDraftPrompt();
    if (prompt.kind === "spec-to-code") this.refreshSpecCodePrompt();
    if (prompt.kind === "export-c4") this.refreshC4Prompt();
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
      const field = prompt.ids?.[prompt.index];
      if (prompt.kind === "full-check" && prompt.checkOptions && field === "since") prompt.checkOptions.since = graphemes(prompt.checkOptions.since).slice(0, -1).join("");
      else if (prompt.kind === "explain-edge") {
        if (prompt.edge && (field === "from" || field === "to")) prompt.edge[field] = graphemes(prompt.edge[field]).slice(0, -1).join("");
      } else if (prompt.kind === "draft-flow") {
        if (prompt.draft && (field === "trigger" || field === "name" || field === "into")) prompt.draft[field] = graphemes(prompt.draft[field]).slice(0, -1).join("");
      } else if (prompt.kind === "draft-rules") {
        if (prompt.rulesDraft && field === "into") prompt.rulesDraft.into = graphemes(prompt.rulesDraft.into).slice(0, -1).join("");
      } else if (prompt.kind === "code-to-spec") {
        if (prompt.codeDraft && (field === "file" || field === "line" || field === "into" || field === "since")) prompt.codeDraft[field] = graphemes(prompt.codeDraft[field]).slice(0, -1).join("");
      } else if (prompt.kind === "spec-to-code") {
        if (prompt.specCode && (field === "id" || field === "into")) prompt.specCode[field] = graphemes(prompt.specCode[field]).slice(0, -1).join("");
      } else if (prompt.kind === "explain" && prompt.explainPlan) {
        if (field === "limit" || field === "jobs") prompt.explainPlan[field] = graphemes(prompt.explainPlan[field]).slice(0, -1).join("");
      } else prompt.text = graphemes(prompt.text).slice(0, -1).join("");
      if (prompt.kind === "export" && prompt.exportForm) prompt.exportForm.custom = true;
      if (prompt.kind === "palette") this.refreshPalette();
      if (prompt.kind === "node") this.findNodes();
      if (prompt.kind === "flow") this.findFlows();
      if (prompt.kind === "feature") this.refreshFeaturePrompt();
      if (prompt.kind === "proposal") this.refreshProposalPrompt();
      if (prompt.kind === "new-spec") this.refreshNewSpec();
      if (prompt.kind === "agents") this.refreshAgentsPrompt();
      if (prompt.kind === "init") this.refreshInitPrompt();
      if (prompt.kind === "fmt") this.refreshFmtPrompt();
      if (prompt.kind === "parse") this.refreshParsePrompt();
      if (prompt.kind === "trace-plan") this.refreshTracePlanPrompt();
      if (prompt.kind === "explain") this.refreshExplainPrompt();
      if (prompt.kind === "wire") this.refreshWirePrompt();
      if (prompt.kind === "full-check") this.refreshCheckPrompt();
      if (prompt.kind === "explain-edge") this.refreshEdgePrompt();
      if (prompt.kind === "export") this.refreshExportPrompt();
      if (prompt.kind === "draft-flow") this.refreshDraftPrompt();
      if (prompt.kind === "draft-rules") this.refreshRulesDraftPrompt();
      if (prompt.kind === "code-to-spec") this.refreshCodeDraftPrompt();
      if (prompt.kind === "spec-to-code") this.refreshSpecCodePrompt();
      if (prompt.kind === "export-c4") this.refreshC4Prompt();
      return;
    }
    if ((event.name === "left" || event.name === "right") && prompt.kind === "export-c4") return this.changeC4Choice(event.name === "left" ? -1 : 1);
    if ((event.name === "left" || event.name === "right") && prompt.kind === "spec-to-code") return this.changeSpecCodeOutput();
    if ((event.name === "left" || event.name === "right") && prompt.kind === "explain" && prompt.explainPlan) return this.changeExplainPlanList(event.name === "left" ? -1 : 1);
    if ((event.name === "left" || event.name === "right") && prompt.kind === "explain" && prompt.explainModel) return this.changeExplainDetail(event.name === "left" ? -1 : 1);
    if ((event.name === "left" || event.name === "right") && prompt.kind === "code-to-spec") return this.changeCodeDraftChoice(event.name === "left" ? -1 : 1);
    if ((event.name === "left" || event.name === "right") && prompt.kind === "draft-flow") return this.changeDraftChoice(event.name === "left" ? -1 : 1);
    if ((event.name === "left" || event.name === "right") && prompt.kind === "draft-rules") return this.changeRulesDraftChoice(event.name === "left" ? -1 : 1);
    if ((event.name === "left" || event.name === "right") && prompt.kind === "draft-layout") return this.changeLayoutDraftMode(event.name === "left" ? -1 : 1);
    if ((event.name === "left" || event.name === "right") && prompt.kind === "full-check") return this.changeCheckOption(event.name === "left" ? -1 : 1);
    if ((event.name === "left" || event.name === "right") && prompt.kind === "export") return this.changeExportFormat(event.name === "left" ? -1 : 1);
    if ((event.name === "up" || event.name === "down") && (prompt.kind === "palette" || prompt.kind === "node" || prompt.kind === "flow" || prompt.kind === "feature" || prompt.kind === "proposal" || prompt.kind === "new-spec" || prompt.kind === "baseline" || prompt.kind === "agents" || prompt.kind === "init" || prompt.kind === "fmt" || prompt.kind === "parse" || prompt.kind === "trace-plan" || prompt.kind === "explain" || prompt.kind === "wire" || prompt.kind === "full-check" || prompt.kind === "explain-edge" || prompt.kind === "export" || prompt.kind === "draft-flow" || prompt.kind === "draft-rules" || prompt.kind === "draft-layout" || prompt.kind === "code-to-spec" || prompt.kind === "spec-to-code" || prompt.kind === "export-c4") && prompt.items.length > 0) {
      prompt.index = (prompt.index + (event.name === "up" ? -1 : 1) + prompt.items.length) % prompt.items.length;
      if (prompt.kind === "palette" || prompt.kind === "proposal" || prompt.kind === "new-spec" || prompt.kind === "baseline" || prompt.kind === "init") prompt.note = prompt.notes?.[prompt.index] ?? "";
      if (prompt.kind === "feature") this.featureNote();
      if (prompt.kind === "trace-plan") this.tracePlanNote();
      if (prompt.kind === "explain") this.explainNote();
      if (prompt.kind === "full-check") this.refreshCheckPrompt();
      if (prompt.kind === "explain-edge") this.refreshEdgePrompt();
      if (prompt.kind === "export") this.refreshExportPrompt();
      if (prompt.kind === "draft-flow") this.refreshDraftPrompt();
      if (prompt.kind === "draft-rules") this.refreshRulesDraftPrompt();
      if (prompt.kind === "draft-layout") this.refreshLayoutDraftPrompt();
      if (prompt.kind === "code-to-spec") this.refreshCodeDraftPrompt();
      if (prompt.kind === "spec-to-code") this.refreshSpecCodePrompt();
      if (prompt.kind === "export-c4") this.refreshC4Prompt();
      return;
    }
    if (event.name === "enter" && prompt.kind === "export-c4") return this.submitC4();
    if (event.name === "enter" && prompt.kind === "feature") return this.submitFeature();
    if (event.name === "enter" && prompt.kind === "baseline") return this.submitBaseline();
    if (event.name === "enter" && prompt.kind === "agents") return this.submitAgents();
    if (event.name === "enter" && prompt.kind === "init") return this.submitInit();
    if (event.name === "enter" && prompt.kind === "fmt") return this.submitFmt();
    if (event.name === "enter" && prompt.kind === "parse") return this.submitParse();
    if (event.name === "enter" && prompt.kind === "trace-plan") return this.submitTracePlan();
    if (event.name === "enter" && prompt.kind === "explain") return this.submitExplain();
    if (event.name === "enter" && prompt.kind === "wire") return this.submitWire();
    if (event.name === "enter" && prompt.kind === "full-check") return this.submitCheck();
    if (event.name === "enter" && prompt.kind === "explain-edge") return this.submitEdge();
    if (event.name === "enter" && prompt.kind === "export") return this.submitExport();
    if (event.name === "enter" && prompt.kind === "draft-flow") return this.submitDraft();
    if (event.name === "enter" && prompt.kind === "draft-rules") return this.submitRulesDraft();
    if (event.name === "enter" && prompt.kind === "draft-layout") return this.submitLayoutDraft();
    if (event.name === "enter" && prompt.kind === "code-to-spec") return this.submitCodeDraft();
    if (event.name === "enter" && prompt.kind === "spec-to-code") return this.submitSpecCode();
    if (event.name === "enter" && prompt.kind === "proposal") return this.submitProposal();
    if (event.name === "enter" && prompt.kind === "new-spec") return this.submitNewSpec();
    if (event.name === "enter") {
      this.state.prompt = null;
      if (prompt.kind === "search") {
        this.state.search = prompt.text;
        this.findNext();
      } else if (prompt.kind === "context") {
        this.addToContext(prompt.text.trim().replace(/^@/, ""));
      } else if (prompt.kind === "flow") {
        const name = prompt.ids?.[prompt.index];
        if (name && this.state.zoom) this.state.zoom.flow = name;
      } else if (prompt.kind === "node") {
        const id = prompt.ids?.[prompt.index];
        if (id && this.state.mode === "zoom") this.openZoom(id);
        else if (id) this.goToNode(id);
      } else {
        const id = prompt.ids?.[prompt.index];
        if (id) this.runAction(id);
      }
      return;
    }
    if (event.text !== undefined && !event.ctrl && !event.alt) this.promptType(event.text);
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
    prompt.note = prompt.notes[0] ?? "";
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
    const focusable = this.state.mode === "view" || this.state.mode === "read";
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
        return this.openZoom(null);
      case "context":
        return this.toggleContext(focusable);
      case "results":
        return this.openResults();
      case "doctor":
        return this.startOperation("doctor", { kind: "doctor", root: this.state.root });
      case "feature":
        return this.openFeaturePrompt();
      case "export-c4":
        return this.openC4Prompt();
      case "feature-questions": {
        const slug = this.state.current === null ? null : featureSlugOf(this.state.current, this.specDir());
        if (slug !== null) this.askFeatureQuestions(slug);
        return;
      }
      case "full-check":
        return this.openCheckPrompt();
      case "explain-edge":
        return this.openEdgePrompt();
      case "export":
        return this.openExportPrompt();
      case "map-check":
        return this.requestOperation("map-check", { kind: "map-check", root: this.state.root });
      case "map":
        return this.requestOperation("map", { kind: "map", root: this.state.root });
      case "baseline":
        return this.openBaselinePrompt();
      case "agents":
        return this.openAgentsPrompt();
      case "init":
        return this.openInitPrompt();
      case "fmt":
        return this.openFmtPrompt();
      case "parse":
        return this.openParsePrompt();
      case "trace-plan":
        return this.openTracePlanPrompt();
      case "explain":
        return this.openExplainPrompt();
      case "explain-llm":
        return this.openExplainModelPrompt();
      case "explain-plan":
        return this.openExplainPlanPrompt();
      case "explain-batch":
        return this.openExplainPlanPrompt("batch");
      case "draft-flow":
        return this.openDraftPrompt();
      case "draft-rules":
        return this.openRulesDraftPrompt();
      case "draft-layout":
        return this.openLayoutDraftPrompt();
      case "code-to-spec":
        return this.openCodeDraftPrompt();
      case "spec-to-code":
        return this.openSpecCodePrompt();
      case "wire":
        return this.openWirePrompt();
      case "cancel":
        return this.cancelOperation();
      case "find-node":
        this.state.prompt = { kind: "node", text: "", items: [], ids: [], index: 0 };
        return this.findNodes();
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

/** Where an export goes unless a path is typed: `.keylang/export/check.json`, `.keylang/export/edge.txt`, `.keylang/export/parse.txt`, `.keylang/export/trace-plan.json`. */
function defaultExportPath(kind: OperationRecord["kind"], format: ExportFormat): string {
  const extension: Record<ExportFormat, string> = { human: "txt", json: "json", sarif: "sarif", github: "github.txt", tree: "txt" };
  const name = kind === "explain-edge" ? "edge" : kind === "parse" || kind === "trace-plan" ? kind : "check";
  return `.keylang/export/${name}.${extension[format]}`;
}

/** The typed report of a finished record in a format, or null when it has none. */
function exportSourceOf(record: OperationRecord, format: ExportFormat): ExportSource | null {
  const result = record.result;
  if (result?.kind === "check" && result.payload !== null && isCheckFormat(format)) {
    const { results, snapshotId, coverage, lines } = result.payload;
    return { kind: "check", format, report: { results, snapshotId, coverage, lines } };
  }
  if (result?.kind === "explain-edge" && result.payload !== null) return { kind: "explain-edge", lines: result.payload.lines };
  // The documents as parsed then: the export renders them, it never parses again.
  const view = PARSE_FORMATS.find((candidate) => candidate === format);
  if (result?.kind === "parse" && result.payload !== null && view !== undefined) return { kind: "parse", format: view, documents: result.payload.documents };
  // The plan as it was computed: its snapshot and hashes, never a new plan.
  if (result?.kind === "trace-plan" && result.payload !== null && format === "json") return { kind: "trace-plan", plan: result.payload.plan };
  return null;
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

/** `keylang.json` as it is on disk now: missing (with the guessed layout), invalid (with the reason) or valid. */
function configState(root: string): ConfigState {
  const file = join(root, CONFIG_FILE);
  if (!existsSync(file)) {
    const guessed = loadConfig(root);
    return { kind: "missing-config", languages: [...guessed.languages], layers: [...guessed.layers.keys()], notes: guessLayout(root, guessed.exclude).notes };
  }
  try {
    parseConfig(file, readFileSync(file, "utf8"));
    return { kind: "configured" };
  } catch (error) {
    // The file is the one open in the editor: the reason keeps only the field.
    const text = errorText(error);
    return { kind: "invalid-config", reason: text.startsWith(`${file}: `) ? text.slice(file.length + 2) : text };
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

/** Cells one ←/→ scrolls a report sideways. */
const SIDE_STEP = 16;

/** The record action of a `Ctrl+Space` draft: the draft-flow operation asked for by the agent key, not the form. */
const AGENT_DRAFT = "agent-draft";

/** The draft form's modes in ←→ order. */
const DRAFT_MODES = ["algo", "hybrid", "llm"] as const;

/** The lists of the inventory form, in ←→ order. */
const EXPLAIN_PLAN_LISTS = ["stale-saved", "missing", "stale"] as const;

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
