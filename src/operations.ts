// Shared workspace operations (ADR 0008): transport-independent orchestration
// of the application-level actions. The CLI and the TUI call the same
// interface: a typed request with an explicit absolute root, a typed result
// with a domain payload. This module never imports a transport, reads the
// working directory, or writes stdout/stderr. One operation variant at a
// time: each feature ticket adds its own, not every handler in advance.

import { closeSync, existsSync, openSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { analyze, within, type Analysis, type AnalysisRequest } from "./analyze.ts";
import { baselinePlanProblems, commitBaseline, planBaseline, type BaselinePlan } from "./baseline.ts";
import { filterChanged } from "./changed.ts";
import { checkReportText, type CheckFormat, type CheckReportData } from "./check-format.ts";
import { checkExitCode, checkReport, type CheckResult } from "./check-results.ts";
import { CONFIG_FILE, assertFormatOnly, configToJson, guessLayout, loadConfig, resolveStatic, toPosix, type Config, type StaticMode } from "./config.ts";
import { formatDiagnostic, isError, type Diagnostic } from "./diag.ts";
import { edgeExplanationLines, edgeIdKnown, explainEdge, type EdgeExplanation } from "./explain-edge.ts";
import { explainedIds, moveHint, oldExplanations } from "./explain-llm.ts";
import { isStoredExplanation } from "./explanations.ts";
import { collectMdFiles } from "./files.ts";
import { formatSource } from "./fmt.ts";
import { FACT_CACHE_FILE } from "./fact-cache.ts";
import { PROPOSALS_DIR } from "./proposals.ts";
import { featureStatus, type FeatureReport, type Gap } from "./feature-status.ts";
import { agentsPlanProblems, commitAgents, planAgents, type AgentsPlan, type HarnessCategory, type HarnessChoice, type HarnessName, type HarnessStep } from "./harness.ts";
import type { Stats } from "./graph.ts";
import type { LlmSetup } from "./llm.ts";
import { commitMap, diffMap, EXPLAINED_MAP_DIR, mapPlanProblems, planMap, sourceInputProblems, sourceInputs, type CommittedStep, type MapPlan } from "./map.ts";
import { landing, writeAtomic, writeProblem } from "./safe-write.ts";
import { sha256, type CoverageItem } from "./snapshot.ts";
import { compareText } from "./span.ts";
import type { ModuleStatus } from "./voice-local.ts";
import type { VoiceEngine } from "./voice.ts";
import { changedPathSet, deletedModuleIds, gitChangedFiles, type ChangedFiles } from "./git-changes.ts";
import { generateWire, WIRE_MARKER } from "./wire-gen.ts";

/** The known operations. `doctor` is the first; new kinds arrive with their feature. */
export interface DoctorRequest {
  kind: "doctor";
  /** Repository root (absolute): where keylang.json and the specs live. */
  root: string;
}

/** Whether a feature file is done, on the saved state of the repository (tools.md `feature`). */
export interface FeatureRequest {
  kind: "feature";
  /** Repository root (absolute). */
  root: string;
  /** The feature: `<dir>/features/<slug>.md`. */
  slug: string;
}

/** Whether the generated map on disk matches the code (`keylang map --check`). Read-only. */
export interface MapCheckRequest {
  kind: "map-check";
  /** Repository root (absolute): the directory `keylang map` is run for. */
  root: string;
  /** How messages name the root, as the caller does (`keylang map <dir>`); default `.`. */
  label?: string;
}

/** Writes the generated map, the explained map, the index and the fact cache (`keylang map`). */
export interface MapRequest {
  kind: "map";
  /** Repository root (absolute): the directory `keylang map` is run for. */
  root: string;
  /** How messages name the root, as the caller does (`keylang map <dir>`); default `.`. */
  label?: string;
}

/**
 * Writes `<dir>/rules.baseline.md` from the current layer graph (`keylang
 * baseline`), or with `check` only compares it (`keylang baseline --check`).
 */
export interface BaselineRequest {
  kind: "baseline";
  /** Repository root (absolute). */
  root: string;
  /** Compare only; nothing is written. */
  check: boolean;
}

/**
 * Installs or strips the managed harness files (`keylang agents
 * [--agents=LIST]`), or with `check` only compares them (`--check`).
 * Setting files up says nothing about whether a harness client runs.
 */
export interface AgentsRequest {
  kind: "agents";
  /** Repository root (absolute). */
  root: string;
  /** `auto`: detected from the disk (the instruction block even when none is); `none`: keylang's harness files are stripped; a list: exactly those. */
  harnesses: HarnessChoice;
  /** Compare only; nothing is written. */
  check: boolean;
}

/**
 * Rewrites Markdown files in the canonical form (`keylang fmt <paths…>`), or
 * with `check` only compares them (`--check`). Each file is formatted on its
 * own from its saved bytes by `formatSource`.
 */
export interface FmtRequest {
  kind: "fmt";
  /** Repository root (absolute): its keylang.json tells the edition. */
  root: string;
  /** Files and directories as the caller names them: absolute, or relative to `base`. */
  paths: string[];
  /** Where relative `paths` start (absolute); default the root. The CLI passes its working directory. */
  base?: string;
  /** Compare only; nothing is written. */
  check: boolean;
}

/** Where `keylang wire` writes when no `--out` is given. */
export const WIRE_OUT = "keylang.gen.ts";

/**
 * Generates the container of `# wiring` (`keylang wire [--out <file>]`), or
 * with `check` only compares it (`--check`). The generated file is never
 * compiled or run here.
 */
export interface WireRequest {
  kind: "wire";
  /** Repository root (absolute). */
  root: string;
  /** The generated file: a plain relative POSIX path with a `.ts`, `.mts` or `.cts` extension; default `WIRE_OUT`. */
  out?: string;
  /** Compare only; nothing is written. */
  check: boolean;
}

/**
 * Checks the saved specs against the code (`keylang check [paths…]
 * [--strict] [--static <mode>]`). Read-only. The output format is not part
 * of the request: it only shows the result.
 */
export interface CheckRequest {
  kind: "check";
  /** Repository root (absolute). */
  root: string;
  /** Spec files and directories: absolute, or relative to `base`; empty is the configured spec directory. */
  paths: string[];
  /** Where relative `paths` start and what reported paths are relative to (absolute); default the root. The CLI passes its working directory. */
  base?: string;
  /** An unverified verdict fails the check (code 1). */
  strict: boolean;
  /** Overrides `check.static` of keylang.json; omitted leaves the config, then `behavior`. */
  static?: StaticMode;
  /**
   * `--changed`: the full analysis, then only the findings that touch the
   * files git reports changed since `since`. Reads git; a plain check never does.
   */
  changed?: boolean;
  /** `--since <ref>`: the ref of `changed`; default `HEAD`. Only with `changed`. */
  since?: string;
}

/**
 * Explains the dependency between two ids of the saved code (`keylang check
 * --explain-edge <from> <to>`): the snapshot's edges both ways, or whether
 * their absence is proven. Read-only; the specs are not read.
 */
export interface ExplainEdgeRequest {
  kind: "explain-edge";
  /** Repository root (absolute). */
  root: string;
  /** A node, or an ancestor of nodes (a layer, a directory). */
  from: string;
  to: string;
}

/**
 * The typed result an export writes: a finished check report in one of the
 * CLI's formats, or the lines of an explained edge (the CLI has only its
 * human output). A later report kind (parse, trace-plan) joins as a variant.
 */
export type ExportSource = { kind: "check"; format: CheckFormat; report: CheckReportData } | { kind: "explain-edge"; lines: string[] };

/**
 * Saves a report that was already computed to one file: exactly the stdout
 * the CLI prints for it, without ANSI or status lines. It never runs the
 * check again. The target is a plain relative path inside the repository, not
 * a generated artifact; `expect` is the file as the caller showed it before
 * Save (null: absent) — a different file is a conflict, never overwritten.
 */
export interface ExportRequest {
  kind: "export";
  /** Repository root (absolute). */
  root: string;
  /** The target, relative to the root, POSIX. */
  path: string;
  expect: string | null;
  source: ExportSource;
}

/**
 * Sets a repository up (`keylang init [dir] [--agents=LIST]`): keylang.json
 * (an existing one is kept), the map, the baseline and the harness files, in
 * that order. With `check` it runs exactly `init --check`: the harness files
 * and the baseline are compared; the map is not (that is `map --check`).
 */
export interface InitRequest {
  kind: "init";
  /** Repository root (absolute): the directory `keylang init` is run for. */
  root: string;
  /** As in `AgentsRequest`: `auto`, `none`, or exactly the named harnesses. */
  harnesses: HarnessChoice;
  /** `init --check`: compare only; nothing is written. */
  check: boolean;
  /** How messages name the root, as the caller does (`keylang init <dir>`); default `.`. */
  label?: string;
}

export type OperationRequest = DoctorRequest | FeatureRequest | MapCheckRequest | MapRequest | BaselineRequest | AgentsRequest | FmtRequest | WireRequest | CheckRequest | ExplainEdgeRequest | InitRequest | ExportRequest;

/** The operation kinds that write files: they compute first and commit after `beforeCommit` (a check mode never calls it). */
export const WRITING_KINDS: ReadonlySet<OperationRequest["kind"]> = new Set(["map", "baseline", "agents", "fmt", "wire", "init", "export"]);

/** What an operation may use besides its request. No UI state, no shell. */
export interface OperationContext {
  /** Cancellation: the caller reports `cancelled`, never a success. */
  signal?: AbortSignal;
  /** Progress notes. Presentation only; never a source of domain data. */
  onProgress?: (progress: { text: string }) => void;
  /**
   * The analysis to run on the saved files; default `analyze`. A session
   * passes its own, which builds the snapshot off the UI thread.
   */
  analyze?: (request: AnalysisRequest) => Promise<Analysis>;
  /**
   * A writing operation calls this once, after everything is computed and
   * before its first file step; nothing is written before it resolves. A
   * session defers its analysis and conflicting saves from here on; a signal
   * aborted by then cancels the operation with nothing written.
   */
  beforeCommit?: () => Promise<void> | void;
}

export type OperationStatus = "completed" | "failed" | "cancelled";

export interface OperationMessage {
  level: "info" | "warning" | "error";
  /** Human-readable text; the payload carries the domain data. */
  text: string;
}

/** The structured doctor report. Key values never reach it. */
export interface DoctorPayload {
  /** Languages keylang indexes, in map order; empty when none were found. */
  languages: string[];
  /** True when the report was built without a keylang.json at the root. */
  configFile: boolean;
  /** True when the file exists but declares no `layers` (a guessed layout). */
  guessed: boolean;
  /** The configured agent and the state of its credentials, never the key value. */
  agent: { configured: string | null; state: "ok" | "missing" | "error"; detail: string };
  explanations: {
    /** Saved answers and briefs, and how the explained map is configured. */
    saved: number;
    briefs: number;
    /** The spec directory, relative to the root. */
    dir: string;
    /** `explain.map` in keylang.json. */
    map: boolean;
    /** Explanation files of the keylang 0.1 store, no longer read. */
    old: number;
    /** How to move them, when there are any. */
    moveHint: string | null;
  };
  voice: {
    /** The configured engine. */
    engine: "local" | "openrouter" | "auto";
    /** What the configuration resolves to now, without the key; null when nothing does. */
    resolved: { kind: "openrouter"; model: string } | { kind: "local"; modelFile: string } | null;
    /** What to install or set so an engine resolves, or null. */
    missing: string | null;
    /** An error reading the voice set-up (a key file others can read), or null. */
    error: string | null;
    /** The first downloaded local model, or null. */
    model: string | null;
    /** Where local models live (for the "none in …" report). */
    modelsDir: string;
    /** The optional native recognizer (@fugood/whisper.node). */
    native: ModuleStatus;
    /** The optional native microphone (decibri). */
    microphone: ModuleStatus;
  };
}

/** The feature status the CLI prints (`report`), with the file and the snapshot it was computed on. */
export interface FeaturePayload {
  slug: string;
  /** `<dir>/features/<slug>.md`, relative to the root. */
  file: string;
  /** The snapshot id of the analysis, or null without supported sources. */
  snapshot: string | null;
  /** The unchanged `featureStatus` object: `keylang feature --format json` prints exactly this. */
  report: FeatureReport;
}

/** How the generated map on disk differs from a fresh render. Paths are POSIX, relative to the root. */
export interface MapCheckPayload {
  /** Target files that exist without the keylang:generated marker: they block `keylang map`. */
  conflicts: string[];
  /** Generated files that are missing, changed, or no longer generated. */
  stale: string[];
  /** The graph counts of the fresh snapshot. */
  stats: Stats;
  /** The generator's warnings (unreadable directories and the like). */
  warnings: string[];
  /** The snapshot id of the fresh render. */
  snapshot: string;
}

/**
 * What `keylang map` did. With conflicts or refusals nothing is written and
 * `steps` is empty; otherwise every planned file step is listed with its
 * state, so a partial commit names what landed, what failed and what was
 * never tried. Paths are POSIX, relative to the root.
 */
export interface MapPayload {
  /** Target files without the keylang:generated marker: nothing was written. */
  conflicts: string[];
  /** Why the computed map could not be committed (`path: reason`): a target or an input changed meanwhile. Nothing was written. */
  refused: string[];
  steps: CommittedStep[];
  stats: Stats;
  warnings: string[];
  snapshot: string;
  /** Files left out because they fall outside guessed layers. */
  skipped: number;
  /** The layers are guessed: there is no keylang.json with `layers`. */
  guessed: boolean;
}

/** What `keylang baseline [--check]` found and did. The path is POSIX, relative to the root. */
export interface BaselinePayload {
  /** `<dir>/rules.baseline.md`. */
  file: string;
  check: boolean;
  /**
   * The file before the operation: `current` holds the rules of the graph
   * (CRLF read as LF), `stale` is missing or differs, `manual` has no
   * keylang:generated marker and is never written.
   */
  state: "current" | "stale" | "manual";
  /** Whether the file was written by this run. */
  written: boolean;
  /** Why the computed baseline could not be committed (`path: reason`): the target or an input changed meanwhile. Nothing was written. */
  refused: string[];
  /** The I/O error of the write, or null. */
  error: string | null;
  /** Rule lines the new baseline adds and drops against the file on disk: how the allowed architecture changes. */
  added: string[];
  removed: string[];
  /** The snapshot id the rules were computed from. */
  snapshot: string;
}

/**
 * What `keylang agents [--check]` planned and did. With `error` or `refused`
 * nothing was written and `steps` is empty; otherwise every changed file is a
 * step with its state. Paths are POSIX, relative to the root.
 */
export interface AgentsPayload {
  check: boolean;
  /** How the harnesses were chosen, and the ones the plan is for (detected, for `auto`). */
  choice: "auto" | "none" | "list";
  harnesses: HarnessName[];
  /** The keylang version the MCP command and the Stop hook pin (`npx -y keylang@<version> mcp`). */
  version: string;
  /** Every file the selection owns, with what it needs: `keep` is current. */
  files: { path: string; category: HarnessCategory; action: "keep" | "write" | "remove" }[];
  /** A broken marker or invalid JSON/TOML in `file`: the whole plan is refused, nothing written. */
  error: { file: string; message: string } | null;
  /** Why the plan could not be committed (`path: reason`): a harness file or the detection changed meanwhile. Nothing was written. */
  refused: string[];
  steps: HarnessStep[];
}

/**
 * One Markdown file of `keylang fmt`, in the order the paths name them.
 * `current`: already canonical; `stale`: not canonical, and not written (a
 * check, or a write stopped before it); `formatted`: written by this run;
 * `invalid`: the tree shape is ambiguous (K003), never rewritten;
 * `explanation`: a saved explanation, the model's text, left as it is;
 * `unreadable`, `failed`: the file could not be read or written (`error`);
 * `not-attempted`: the write was cancelled before this file.
 */
export interface FmtFile {
  /** The file as the given paths name it: what the CLI prints. */
  shown: string;
  /** POSIX, relative to the root. */
  path: string;
  state: "current" | "stale" | "formatted" | "invalid" | "explanation" | "unreadable" | "failed" | "not-attempted";
  /** `unreadable`, `failed`: why. */
  error?: string;
  /** `invalid`: the structural diagnostics, as `formatSource` gives them. */
  diagnostics?: Diagnostic[];
}

/** What `keylang fmt [--check]` found and did, file by file. */
export interface FmtPayload {
  check: boolean;
  files: FmtFile[];
}

/** What `keylang wire [--check]` found and did. The path is POSIX, relative to the root. */
export interface WirePayload {
  /** The generated file (`--out`). */
  file: string;
  check: boolean;
  /**
   * `blocked`: an error on a `# wiring` line (`diagnostics`), nothing is
   * generated; `manual`: the file exists without the keylang:generated marker
   * and is never written; `current`: it holds the generated text (CRLF read
   * as LF); `stale`: it is missing or differs.
   */
  state: "blocked" | "manual" | "current" | "stale";
  /** The error diagnostics on `# wiring` lines, as `keylang wire` prints them; empty unless blocked. */
  diagnostics: Diagnostic[];
  /** Whether the file was written by this run. */
  written: boolean;
  /** Why the computed file could not be committed (`path: reason`): the target, a spec, a source or the config changed meanwhile. Nothing was written. */
  refused: string[];
  /** The I/O error of the write, or null. */
  error: string | null;
  /** The snapshot id the file was generated from. */
  snapshot: string;
}

/**
 * What `keylang check` found on the saved files. `results`, `snapshotId`
 * and `coverage` are exactly `--format json`; `lines` and `counts` are the
 * human output and its summary. Paths are relative to the request's `base`.
 */
export interface CheckPayload {
  results: CheckResult[];
  snapshotId: string | null;
  /** Constructs of the code no confirmed edge was built from (`--format json`). */
  coverage: CoverageItem[];
  lines: string[];
  counts: { fail: number; unverified: number; ok: number };
  /** The options the check really ran with. */
  options: {
    /** The checked paths as reported (the spec directory when none was given). */
    paths: string[];
    strict: boolean;
    static: StaticMode;
    /** Who chose the static mode: the request, `check.static` of keylang.json, or the default. */
    staticFrom: "request" | "config" | "default";
    /** Specs outside the spec directory are checked on their own, without the code. */
    withoutCode: boolean;
  };
  /** Paths that hold no specs (the explained map, saved explanations): skipped, as reported. */
  notSpecs: string[];
  /** The git slice of `--changed`, or null for a full check. `results` and `counts` are the slice. */
  changed: ChangedSlice | null;
}

/** What `--changed` kept: the ref, what git reported, and how much of the full report the slice left out. */
export interface ChangedSlice {
  /** The ref compared with (`HEAD` by default). */
  since: string;
  /** No commit yet: `HEAD` is the empty tree, so every file is changed. */
  unborn: boolean;
  /** Changed, added, deleted and untracked files: POSIX, relative to the root, sorted. */
  files: string[];
  /** Module ids of deleted source files: a step naming one stays in the slice. */
  deleted: string[];
  /** Results of the full report kept in the slice, and left out of it. */
  shown: number;
  hidden: number;
}

/** The evidence between two ids: the domain result of `--explain-edge`, and the CLI's lines of it. */
export interface ExplainEdgePayload extends EdgeExplanation {
  /** The snapshot the edges come from. */
  snapshotId: string;
  /** The CLI's stdout, line by line; presentation of the same result. */
  lines: string[];
}

/** What an export did with its one file. */
export interface ExportPayload {
  path: string;
  /** The format written (an explained edge is always `human`). */
  format: CheckFormat;
  source: ExportSource["kind"];
  /** The size of the text in UTF-8 bytes. */
  bytes: number;
  /** The target existed when Save was pressed (it is replaced). */
  existed: boolean;
  written: boolean;
  /** Why nothing was written (`path: reason`): the path policy, a generated target, or a change since the form. */
  refused: string[];
  /** The I/O error of the write, or null. */
  error: string | null;
}

/**
 * What `keylang init [--check]` did, stage by stage. Each stage is the result
 * of its own shared operation, null when it was not run (a check has no map
 * stage; a failure or a cancellation stops the stages after it). There is no
 * overall atomicity: every stage names what it really wrote.
 */
export interface InitPayload {
  check: boolean;
  /** The languages of the configuration init describes. */
  languages: string[];
  config: {
    /** `keylang.json`. */
    file: string;
    /** The file was there before the commit: it is kept byte for byte. */
    existed: boolean;
    /** Whether this run wrote it (never in a check). */
    written: boolean;
    /** The I/O error of the write, or null. */
    error: string | null;
    /** The layers of the guess init wrote (or would write); the configured ones when the file is kept. */
    layers: string[];
    /** A note for every guessed directory whose layer name had to change. */
    notes: string[];
  };
  /** The harness plan checked before any write, the config included: a failure here writes nothing. Null in a check (its agents stage is the plan). */
  preflight: OperationEnvelope<"agents"> | null;
  map: OperationEnvelope<"map"> | null;
  baseline: OperationEnvelope<"baseline"> | null;
  agents: OperationEnvelope<"agents"> | null;
}

/** The payload type of each operation kind. */
export interface OperationPayloads {
  doctor: DoctorPayload;
  feature: FeaturePayload;
  "map-check": MapCheckPayload;
  map: MapPayload;
  baseline: BaselinePayload;
  agents: AgentsPayload;
  fmt: FmtPayload;
  wire: WirePayload;
  check: CheckPayload;
  "explain-edge": ExplainEdgePayload;
  init: InitPayload;
  export: ExportPayload;
}

/** The result of one operation. File paths are POSIX, relative to the request's root. */
export type OperationResult = { [K in OperationRequest["kind"]]: OperationEnvelope<K> }[OperationRequest["kind"]];

export interface OperationEnvelope<K extends OperationRequest["kind"]> {
  kind: K;
  status: OperationStatus;
  /**
   * The exit code the CLI uses for the same action: 0 ok, 1 findings,
   * 2 usage or I/O error; null when cancelled. It never ends a TUI session.
   */
  exitCode: 0 | 1 | 2 | null;
  /** The domain result; null when nothing was computed (failed or cancelled). */
  payload: OperationPayloads[K] | null;
  /** The human-readable report; presentation, not the source of domain data. */
  messages: OperationMessage[];
  /** Files the operation wrote. */
  written: string[];
  /** Files the operation removed. */
  removed: string[];
  /** Proposal files the operation created. */
  proposals: string[];
}

/** Runs one operation and returns its typed result: the payload type follows the request's kind. */
export function runOperation(request: DoctorRequest, context?: OperationContext): Promise<OperationEnvelope<"doctor">>;
export function runOperation(request: FeatureRequest, context?: OperationContext): Promise<OperationEnvelope<"feature">>;
export function runOperation(request: MapCheckRequest, context?: OperationContext): Promise<OperationEnvelope<"map-check">>;
export function runOperation(request: MapRequest, context?: OperationContext): Promise<OperationEnvelope<"map">>;
export function runOperation(request: BaselineRequest, context?: OperationContext): Promise<OperationEnvelope<"baseline">>;
export function runOperation(request: AgentsRequest, context?: OperationContext): Promise<OperationEnvelope<"agents">>;
export function runOperation(request: FmtRequest, context?: OperationContext): Promise<OperationEnvelope<"fmt">>;
export function runOperation(request: WireRequest, context?: OperationContext): Promise<OperationEnvelope<"wire">>;
export function runOperation(request: CheckRequest, context?: OperationContext): Promise<OperationEnvelope<"check">>;
export function runOperation(request: ExplainEdgeRequest, context?: OperationContext): Promise<OperationEnvelope<"explain-edge">>;
export function runOperation(request: InitRequest, context?: OperationContext): Promise<OperationEnvelope<"init">>;
export function runOperation(request: ExportRequest, context?: OperationContext): Promise<OperationEnvelope<"export">>;
export function runOperation(request: OperationRequest, context?: OperationContext): Promise<OperationResult>;
export async function runOperation(request: OperationRequest, context: OperationContext = {}): Promise<OperationResult> {
  switch (request.kind) {
    case "doctor":
      return runDoctor(request, context);
    case "feature":
      return runFeature(request, context);
    case "map-check":
      return runMapCheck(request, context);
    case "map":
      return runMap(request, context);
    case "baseline":
      return runBaseline(request, context);
    case "agents":
      return runAgents(request, context);
    case "fmt":
      return runFmt(request, context);
    case "wire":
      return runWire(request, context);
    case "check":
      return runCheck(request, context);
    case "explain-edge":
      return runExplainEdge(request, context);
    case "init":
      return runInit(request, context);
    case "export":
      return runExport(request, context);
  }
}

/**
 * A result without a payload, for a failure outside the operation (a
 * transport that could not run it) or a cancellation.
 */
export function resultWithout(kind: OperationRequest["kind"], status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string): OperationResult {
  const base = { status, exitCode, payload: null, messages: error === undefined ? [] : [{ level: "error" as const, text: error }], written: [], removed: [], proposals: [] };
  switch (kind) {
    case "doctor":
      return { kind, ...base };
    case "feature":
      return { kind, ...base };
    case "map-check":
      return { kind, ...base };
    case "map":
      return { kind, ...base };
    case "baseline":
      return { kind, ...base };
    case "agents":
      return { kind, ...base };
    case "fmt":
      return { kind, ...base };
    case "wire":
      return { kind, ...base };
    case "check":
      return { kind, ...base };
    case "explain-edge":
      return { kind, ...base };
    case "init":
      return { kind, ...base };
    case "export":
      return { kind, ...base };
  }
}

function emptyMapCheck(status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string): OperationEnvelope<"map-check"> {
  return { kind: "map-check", status, exitCode, payload: null, messages: error === undefined ? [] : [{ level: "error", text: error }], written: [], removed: [], proposals: [] };
}

/**
 * `keylang map --check`: renders the map from the code and compares it with
 * the files on disk. It writes nothing — not the map, the index, nor the fact
 * cache (`persistFacts` stays off). Code 1 for conflicts or stale files, 2
 * for no supported sources, a broken config or a failed analysis.
 */
async function runMapCheck(request: MapCheckRequest, context: OperationContext): Promise<OperationEnvelope<"map-check">> {
  if (!isAbsolute(request.root)) return emptyMapCheck("failed", 2, "map: root must be an absolute path");
  if (context.signal?.aborted) return emptyMapCheck("cancelled", null);
  context.onProgress?.({ text: "reading the sources" });
  let analyzed: Analysis;
  try {
    analyzed = await (context.analyze ?? analyze)({ root: request.root, specs: [], withoutEvidence: true, persistFacts: false });
  } catch (error) {
    return emptyMapCheck("failed", 2, messageOf(error));
  }
  if (context.signal?.aborted) return emptyMapCheck("cancelled", null);
  const map = analyzed.map;
  if (map === null) return emptyMapCheck("failed", 2, `no supported source files under ${request.label ?? "."}; run \`keylang init\``);
  context.onProgress?.({ text: "comparing with the files on disk" });
  const diff = diffMap(analyzed.config, map);
  const rel = (abs: string): string => toPosix(relative(request.root, abs));
  const payload: MapCheckPayload = {
    conflicts: diff.conflicts.map(rel),
    stale: diff.stale.map(rel),
    stats: map.graph.stats,
    warnings: [...map.graph.warnings],
    snapshot: map.index.snapshotId,
  };
  const messages: OperationMessage[] = [
    ...payload.warnings.map((text) => ({ level: "warning" as const, text: `warning: ${text}` })),
    ...mapCheckLines(payload).map((text) => ({ level: "info" as const, text })),
  ];
  const clean = payload.conflicts.length === 0 && payload.stale.length === 0;
  if (clean) messages.push({ level: "info", text: "the map is up to date" });
  return { ...emptyMapCheck("completed", clean ? 0 : 1), payload, messages };
}

function emptyMap(status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string): OperationEnvelope<"map"> {
  return { kind: "map", status, exitCode, payload: null, messages: error === undefined ? [] : [{ level: "error", text: error }], written: [], removed: [], proposals: [] };
}

/**
 * `keylang map` in two phases. Compute: the analysis (the fact cache is
 * prepared, not written) and a plan with the expected bytes of every target.
 * Commit, after `beforeCommit`: the plan is checked again — a manual target
 * or a changed target, config, source or brief refuses it with nothing
 * written — then the steps run one by one. Codes: 0 written; 1 conflicts or a
 * refused plan; 2 no sources, a broken config, a failed analysis, or an I/O
 * error part way (the payload names completed, failed and not-attempted
 * steps); null when cancelled — before the commit nothing is written, during
 * it the current step finishes and the rest is not attempted.
 */
async function runMap(request: MapRequest, context: OperationContext): Promise<OperationEnvelope<"map">> {
  if (!isAbsolute(request.root)) return emptyMap("failed", 2, "map: root must be an absolute path");
  if (context.signal?.aborted) return emptyMap("cancelled", null);
  context.onProgress?.({ text: "reading the sources" });
  let analyzed: Analysis;
  try {
    analyzed = await (context.analyze ?? analyze)({ root: request.root, specs: [], withoutEvidence: true, persistFacts: true });
  } catch (error) {
    return emptyMap("failed", 2, messageOf(error));
  }
  if (context.signal?.aborted) return emptyMap("cancelled", null);
  const map = analyzed.map;
  if (map === null) return emptyMap("failed", 2, `no supported source files under ${request.label ?? "."}; run \`keylang init\``);
  const payload: MapPayload = {
    conflicts: [],
    refused: [],
    steps: [],
    stats: map.graph.stats,
    warnings: [...map.graph.warnings],
    snapshot: map.index.snapshotId,
    skipped: map.skipped,
    guessed: analyzed.config.guessed,
  };
  const warnings = payload.warnings.map((text) => ({ level: "warning" as const, text: `warning: ${text}` }));
  let plan: MapPlan;
  try {
    plan = planMap(analyzed.config, map);
  } catch (error) {
    return { ...emptyMap("failed", 2, messageOf(error)), payload };
  }
  if (plan.conflicts.length > 0) {
    payload.conflicts = plan.conflicts;
    return { ...emptyMap("completed", 1), payload, messages: [...warnings, ...mapConflictLines(plan.conflicts).map((text) => ({ level: "info" as const, text }))] };
  }
  context.onProgress?.({ text: "waiting to write" });
  try {
    await context.beforeCommit?.();
  } catch (error) {
    return { ...emptyMap("failed", 2, messageOf(error)), payload };
  }
  if (context.signal?.aborted) return { ...emptyMap("cancelled", null), payload };
  let problems: string[];
  try {
    problems = mapPlanProblems(plan);
  } catch (error) {
    return { ...emptyMap("failed", 2, messageOf(error)), payload };
  }
  if (problems.length > 0) {
    payload.refused = problems;
    return {
      ...emptyMap("failed", 1),
      payload,
      messages: [...warnings, ...problems.map((text) => ({ level: "error" as const, text })), { level: "info", text: "nothing was written; run the map again to compute it from the files on disk" }],
    };
  }
  context.onProgress?.({ text: "writing the map" });
  const commit = await commitMap(plan, {
    ...(context.signal ? { signal: context.signal } : {}),
    onStep: (step) => context.onProgress?.({ text: `${step.action === "write" ? "writing" : "removing"} ${step.path}` }),
  });
  payload.steps = commit.steps;
  const done = commit.steps.filter((step) => step.state === "completed");
  const written = done.filter((step) => step.action === "write").map((step) => step.path);
  const removed = done.filter((step) => step.action === "remove").map((step) => step.path);
  const messages: OperationMessage[] = [...warnings, ...mapStepLines(commit.steps).map((text) => ({ level: "info" as const, text }))];
  const failed = commit.steps.find((step) => step.state === "failed");
  const untried = commit.steps.filter((step) => step.state === "not-attempted");
  if (failed) messages.push({ level: "error", text: `${failed.path}: ${failed.error ?? "failed"}` });
  if (commit.outcome !== "completed") {
    messages.push({ level: commit.outcome === "failed" ? "error" : "warning", text: `${done.length} of ${commit.steps.length} step(s) done; not attempted: ${untried.length === 0 ? "none" : untried.map((step) => step.path).join(", ")}` });
  }
  const status = commit.outcome;
  return { ...emptyMap(status, status === "completed" ? 0 : status === "failed" ? 2 : null), payload, messages, written, removed };
}

/** The conflict lines `keylang map` prints: nothing is written while any exists. */
export function mapConflictLines(conflicts: readonly string[], path: (file: string) => string = (file) => file): string[] {
  return conflicts.map((file) => `${path(file)}: manual file without keylang:generated marker`);
}

/**
 * The lines `keylang map` prints for its completed steps of both maps:
 * writes, then removals. The index and the fact cache are written silently,
 * as they always were; the payload lists them.
 */
export function mapStepLines(steps: readonly CommittedStep[], path: (file: string) => string = (file) => file): string[] {
  const shown = steps.filter((step) => step.state === "completed" && (step.artifact === "map" || step.artifact === "explained"));
  return [...shown.filter((step) => step.action === "write").map((step) => `${path(step.path)}: written`), ...shown.filter((step) => step.action === "remove").map((step) => `${path(step.path)}: removed`)];
}

/** The summary `keylang map` writes to stderr after a commit. */
export function mapSummary(payload: MapPayload): string {
  const s = payload.stats;
  return (
    `${s.files} file(s), ${s.modules} module(s), ${s.fns} fn, ${s.types} type(s), ${s.deps} dep(s); calls ${s.callsResolved} resolved, ${s.callsExternal} external, ${s.callsDynamic} dynamic, ${s.callsUnresolved} unresolved` +
    (s.importsUnresolved ? `; ${s.importsUnresolved} unresolved import(s)` : "") +
    (s.unassignedFiles ? `; ${s.unassignedFiles} file(s) outside any layer` : "") +
    (payload.skipped ? `; ${payload.skipped} file(s) outside guessed layers skipped` : "") +
    (payload.guessed ? " (layers guessed; run `keylang init` to write keylang.json)" : "")
  );
}

/**
 * The lines `map --check` prints, paths as given (the CLI makes them relative
 * to its working directory). A manual file blocks `map` itself, so with a
 * conflict "run keylang map" would not refresh the rest: stale files are then
 * not listed.
 */
export function mapCheckLines(diff: { conflicts: readonly string[]; stale: readonly string[] }, path: (file: string) => string = (file) => file): string[] {
  const lines = mapConflictLines(diff.conflicts, path);
  if (diff.conflicts.length === 0) for (const file of diff.stale) lines.push(`${path(file)}: stale, run \`keylang map\``);
  return lines;
}

function emptyBaseline(status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string): OperationEnvelope<"baseline"> {
  return { kind: "baseline", status, exitCode, payload: null, messages: error === undefined ? [] : [{ level: "error", text: error }], written: [], removed: [], proposals: [] };
}

/**
 * `keylang baseline [--check]`: the rules of the current layer graph (the
 * rule algorithm of `baselineText`) against `<dir>/rules.baseline.md`. The
 * analysis reads the code and the saved `keylang.json`, not the specs, and
 * writes no fact cache. Check: code 0 when the file matches, 1 when it is
 * stale, missing or manual; nothing is written. Write: nothing to do when it
 * matches (0); a manual file is never written (1); otherwise after
 * `beforeCommit` the plan is checked again — a target or an input changed
 * meanwhile refuses it (failed, 1) — and the file is written atomically (0,
 * or 2 on an I/O error). No sources, a broken config or a failed analysis:
 * 2, never empty rules. Cancelled: null, nothing written.
 */
async function runBaseline(request: BaselineRequest, context: OperationContext): Promise<OperationEnvelope<"baseline">> {
  if (!isAbsolute(request.root)) return emptyBaseline("failed", 2, "baseline: root must be an absolute path");
  if (context.signal?.aborted) return emptyBaseline("cancelled", null);
  context.onProgress?.({ text: "reading the sources" });
  let analyzed: Analysis;
  try {
    analyzed = await (context.analyze ?? analyze)({ root: request.root, specs: [], withoutEvidence: true, persistFacts: false });
  } catch (error) {
    return emptyBaseline("failed", 2, messageOf(error));
  }
  if (context.signal?.aborted) return emptyBaseline("cancelled", null);
  if (!analyzed.snapshot) return emptyBaseline("failed", 2, "baseline: no supported source files; run `keylang init`");
  let plan: BaselinePlan;
  try {
    plan = planBaseline(analyzed.config, analyzed.snapshot);
  } catch (error) {
    return emptyBaseline("failed", 2, messageOf(error));
  }
  const payload: BaselinePayload = {
    file: plan.path,
    check: request.check,
    state: plan.state,
    written: false,
    refused: [],
    error: null,
    added: plan.added,
    removed: plan.removed,
    snapshot: analyzed.snapshot.snapshotId,
  };
  const lines = (texts: string[]): OperationMessage[] => texts.map((text) => ({ level: "info" as const, text }));
  if (plan.state === "manual") return { ...emptyBaseline("completed", 1), payload, messages: lines([`${plan.path}: manual file without keylang:generated marker`]) };
  if (request.check || plan.state === "current") {
    const current = plan.state === "current";
    return { ...emptyBaseline("completed", current ? 0 : 1), payload, messages: lines(current ? [] : [`${plan.path}: stale, run \`keylang baseline\``]) };
  }
  context.onProgress?.({ text: "waiting to write" });
  try {
    await context.beforeCommit?.();
  } catch (error) {
    return { ...emptyBaseline("failed", 2, messageOf(error)), payload };
  }
  if (context.signal?.aborted) return { ...emptyBaseline("cancelled", null), payload };
  let problems: string[];
  try {
    problems = baselinePlanProblems(plan);
  } catch (error) {
    return { ...emptyBaseline("failed", 2, messageOf(error)), payload };
  }
  if (problems.length > 0) {
    payload.refused = problems;
    return {
      ...emptyBaseline("failed", 1),
      payload,
      messages: [...problems.map((text) => ({ level: "error" as const, text })), { level: "info", text: "nothing was written; run the baseline again to compute it from the files on disk" }],
    };
  }
  context.onProgress?.({ text: `writing ${plan.path}` });
  try {
    commitBaseline(plan);
  } catch (error) {
    payload.error = messageOf(error);
    return { ...emptyBaseline("failed", 2), payload, messages: [{ level: "error", text: `${plan.path}: ${payload.error}` }] };
  }
  payload.written = true;
  return { ...emptyBaseline("completed", 0), payload, messages: lines([`${plan.path}: written`]), written: [plan.path] };
}

function emptyAgents(status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string): OperationEnvelope<"agents"> {
  return { kind: "agents", status, exitCode, payload: null, messages: error === undefined ? [] : [{ level: "error", text: error }], written: [], removed: [], proposals: [] };
}

/**
 * `keylang agents [--check]`: the managed harness files of the chosen
 * harnesses (the unchanged adapters of `harness.ts`) against the disk. The
 * whole plan is built first: a broken marker or invalid JSON/TOML fails it
 * with code 2 naming the file, and nothing is written. Check: 0 when every
 * file is current, 1 listing the stale ones; nothing is written. Write:
 * nothing to do is 0 without `beforeCommit`; otherwise after it the inputs
 * are read again — a harness file or the detection changed meanwhile refuses
 * the plan (failed, 1) — and the files are written or removed one by one (0;
 * 2 on an I/O error part way, naming what landed and what was not
 * attempted). Cancelled: null. No harness is started.
 */
async function runAgents(request: AgentsRequest, context: OperationContext): Promise<OperationEnvelope<"agents">> {
  if (!isAbsolute(request.root)) return emptyAgents("failed", 2, "agents: root must be an absolute path");
  if (context.signal?.aborted) return emptyAgents("cancelled", null);
  context.onProgress?.({ text: "reading the harness files" });
  let plan: AgentsPlan;
  try {
    plan = planAgents(request.root, request.harnesses);
  } catch (error) {
    return emptyAgents("failed", 2, messageOf(error));
  }
  const payload: AgentsPayload = {
    check: request.check,
    choice: request.harnesses === "auto" || request.harnesses === "none" ? request.harnesses : "list",
    harnesses: [...plan.selection.harnesses],
    version: plan.version,
    files: plan.targets.map(({ path, category, action }) => ({ path, category, action })),
    error: plan.error,
    refused: [],
    steps: [],
  };
  if (plan.error !== null) return { ...emptyAgents("failed", 2, `${plan.error.file}: ${plan.error.message}`), payload };
  const changed = payload.files.filter((file) => file.action !== "keep");
  const lines = (texts: string[]): OperationMessage[] => texts.map((text) => ({ level: "info" as const, text }));
  if (request.check) return { ...emptyAgents("completed", changed.length === 0 ? 0 : 1), payload, messages: lines(changed.map((file) => `${file.path}: stale, run \`keylang agents\``)) };
  if (changed.length === 0) return { ...emptyAgents("completed", 0), payload };
  context.onProgress?.({ text: "waiting to write" });
  try {
    await context.beforeCommit?.();
  } catch (error) {
    return { ...emptyAgents("failed", 2, messageOf(error)), payload };
  }
  if (context.signal?.aborted) return { ...emptyAgents("cancelled", null), payload };
  let problems: string[];
  try {
    problems = agentsPlanProblems(plan);
  } catch (error) {
    return { ...emptyAgents("failed", 2, messageOf(error)), payload };
  }
  if (problems.length > 0) {
    payload.refused = problems;
    return {
      ...emptyAgents("failed", 1),
      payload,
      messages: [...problems.map((text) => ({ level: "error" as const, text })), { level: "info", text: "nothing was written; run agents again to plan from the files on disk" }],
    };
  }
  const commit = await commitAgents(plan, {
    ...(context.signal ? { signal: context.signal } : {}),
    onStep: (step) => context.onProgress?.({ text: `${step.action === "write" ? "writing" : "removing"} ${step.path}` }),
  });
  payload.steps = commit.steps;
  const done = commit.steps.filter((step) => step.state === "completed");
  const messages: OperationMessage[] = lines(done.map((step) => `${step.path}: ${step.action === "write" ? "written" : "removed"}`));
  for (const step of commit.steps) {
    if (step.state === "failed") messages.push({ level: "error", text: `${step.path}: ${step.error ?? "failed"}` });
    else if (step.state === "not-attempted") messages.push({ level: commit.outcome === "failed" ? "error" : "warning", text: `${step.path}: not ${step.action === "write" ? "written" : "removed"}` });
  }
  const status = commit.outcome;
  return {
    ...emptyAgents(status, status === "completed" ? 0 : status === "failed" ? 2 : null),
    payload,
    messages,
    written: done.filter((step) => step.action === "write").map((step) => step.path),
    removed: done.filter((step) => step.action === "remove").map((step) => step.path),
  };
}

function emptyInit(status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string): OperationEnvelope<"init"> {
  return { kind: "init", status, exitCode, payload: null, messages: error === undefined ? [] : [{ level: "error", text: error }], written: [], removed: [], proposals: [] };
}

/**
 * The configuration `keylang init` describes: the saved keylang.json, else
 * the guess. An error (a broken keylang.json, no supported sources) is the
 * reason init stops with code 2 before anything else, the harness selection
 * included.
 */
export function initSources(root: string, label = "."): { config: Config } | { error: string } {
  let config: Config;
  try {
    config = loadConfig(root);
  } catch (error) {
    return { error: messageOf(error) };
  }
  // Nothing to describe is a usage error (like `map`), not a finding.
  if (config.languages.length === 0) return { error: `no supported source files found under ${label} (TypeScript, JavaScript, Python, Rust)` };
  return { config };
}

/**
 * `keylang init [--check]`: an orchestration of the shared config, map,
 * baseline and agents steps, not a call of the CLI commands. Before
 * anything: the configuration (2 when it is broken or there is no supported
 * source), then the harness plan (a broken harness file is 2 and nothing is
 * written, keylang.json included). Check — exactly `init --check`: the
 * agents check (2 stops it), then the baseline check; 0 when both are 0,
 * else 1. Write, after `beforeCommit` (called once for the whole run): an
 * existing keylang.json is kept, a missing one is written from the guess
 * (an I/O error stops init, 2); then map, baseline and agents run in turn,
 * each whatever the one before it did, as the CLI always has. The code is
 * the first non-zero of map, baseline, agents; any non-zero stage makes the
 * whole run `failed` — a partial init is never a success. Cancelled: the
 * stage under way names what it wrote; the rest are not run (null).
 */
async function runInit(request: InitRequest, context: OperationContext): Promise<OperationEnvelope<"init">> {
  if (!isAbsolute(request.root)) return emptyInit("failed", 2, "init: root must be an absolute path");
  if (context.signal?.aborted) return emptyInit("cancelled", null);
  const root = request.root;
  const sources = initSources(root, request.label);
  if ("error" in sources) return emptyInit("failed", 2, sources.error);
  const { config } = sources;
  const existed = existsSync(join(root, CONFIG_FILE));
  // The same guess `loadConfig` made, with a note for every directory whose layer name had to change.
  const layout = existed ? { layers: config.layers, notes: [] } : guessLayout(root, config.exclude);
  const payload: InitPayload = {
    check: request.check,
    languages: [...config.languages],
    config: { file: CONFIG_FILE, existed, written: false, error: null, layers: [...layout.layers.keys()], notes: layout.notes },
    preflight: null,
    map: null,
    baseline: null,
    agents: null,
  };
  // The stages report their progress under their own name; they never see `beforeCommit`, it is init's.
  const stage = (name: string): OperationContext => ({
    ...(context.signal ? { signal: context.signal } : {}),
    ...(context.analyze ? { analyze: context.analyze } : {}),
    onProgress: ({ text }) => context.onProgress?.({ text: `${name}: ${text}` }),
  });
  if (request.check) {
    payload.agents = await runAgents({ kind: "agents", root, harnesses: request.harnesses, check: true }, stage("agents"));
    if (payload.agents.status === "cancelled") return { ...emptyInit("cancelled", null), payload };
    if (payload.agents.exitCode === 2) return { ...emptyInit("failed", 2), payload, messages: payload.agents.messages };
    payload.baseline = await runBaseline({ kind: "baseline", root, check: true }, stage("baseline"));
    if (payload.baseline.status === "cancelled") return { ...emptyInit("cancelled", null), payload };
    // `init --check` has always reported a failed baseline check as a difference, code 1.
    const code = payload.agents.exitCode === 0 && payload.baseline.exitCode === 0 ? 0 : 1;
    return { ...emptyInit("completed", code), payload, messages: [...payload.agents.messages, ...payload.baseline.messages] };
  }
  // An unknown name or a broken harness file fails before any write, including keylang.json.
  payload.preflight = await runAgents({ kind: "agents", root, harnesses: request.harnesses, check: true }, stage("agents"));
  if (payload.preflight.status === "cancelled") return { ...emptyInit("cancelled", null), payload };
  if (payload.preflight.status === "failed") return { ...emptyInit("failed", payload.preflight.exitCode ?? 2), payload, messages: payload.preflight.messages };
  context.onProgress?.({ text: "waiting to write" });
  try {
    await context.beforeCommit?.();
  } catch (error) {
    return { ...emptyInit("failed", 2, messageOf(error)), payload };
  }
  if (context.signal?.aborted) return { ...emptyInit("cancelled", null), payload };
  const messages: OperationMessage[] = [];
  const written: string[] = [];
  const removed: string[] = [];
  // Existence decides at the moment of the write, as it always did: a config that appeared meanwhile is kept.
  if (existsSync(join(root, CONFIG_FILE))) {
    payload.config.existed = true;
    messages.push({ level: "info", text: `${CONFIG_FILE}: already exists, kept` });
  } else {
    context.onProgress?.({ text: `writing ${CONFIG_FILE}` });
    for (const note of layout.notes) messages.push({ level: "warning", text: `note: ${note}` });
    try {
      writeAtomic(join(root, CONFIG_FILE), configToJson({ ...config, layers: layout.layers }));
    } catch (error) {
      payload.config.error = messageOf(error);
      return { ...emptyInit("failed", 2), payload, messages: [...messages, { level: "error", text: `${CONFIG_FILE}: ${payload.config.error}; nothing else was written` }] };
    }
    payload.config.written = true;
    written.push(CONFIG_FILE);
    messages.push({ level: "info", text: `${CONFIG_FILE}: written (${config.languages.join(", ")}; layers: ${payload.config.layers.join(", ")})` });
  }
  const collect = (result: OperationResult): void => {
    messages.push(...result.messages);
    written.push(...result.written);
    removed.push(...result.removed);
  };
  const stopped = (): OperationEnvelope<"init"> => ({ ...emptyInit("cancelled", null), payload, messages, written, removed });
  payload.map = await runMap({ kind: "map", root, ...(request.label !== undefined ? { label: request.label } : {}) }, stage("map"));
  collect(payload.map);
  if (payload.map.status === "cancelled" || context.signal?.aborted) return stopped();
  payload.baseline = await runBaseline({ kind: "baseline", root, check: false }, stage("baseline"));
  collect(payload.baseline);
  if (payload.baseline.status === "cancelled" || context.signal?.aborted) return stopped();
  payload.agents = await runAgents({ kind: "agents", root, harnesses: request.harnesses, check: false }, stage("agents"));
  collect(payload.agents);
  if (payload.agents.status === "cancelled") return stopped();
  const code = [payload.map.exitCode, payload.baseline.exitCode, payload.agents.exitCode].find((exit) => exit !== 0) ?? 0;
  return { ...emptyInit(code === 0 ? "completed" : "failed", code), payload, messages, written, removed };
}

function emptyFmt(status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string): OperationEnvelope<"fmt"> {
  return { kind: "fmt", status, exitCode, payload: null, messages: error === undefined ? [] : [{ level: "error", text: error }], written: [], removed: [], proposals: [] };
}

/**
 * `keylang fmt [--check]` in two phases. Compute: every file is read and
 * formatted by `formatSource`; one that cannot be read, or whose tree shape
 * is ambiguous (K003), is reported and the rest go on; a saved explanation
 * is skipped. Check stops here: code 1 for an unformatted or invalid file,
 * 2 when one cannot be read; nothing is written. Write, after
 * `beforeCommit`: each unformatted file in turn is written atomically with
 * the formatter's bytes, only while it still holds the text it was formatted
 * from — a file changed meanwhile, or one that cannot be written, fails on
 * its own and the rest are still written. Code 2 over 1 over 0, as the CLI
 * has it; null when cancelled (the files written by then are named).
 */
async function runFmt(request: FmtRequest, context: OperationContext): Promise<OperationEnvelope<"fmt">> {
  if (!isAbsolute(request.root)) return emptyFmt("failed", 2, "fmt: root must be an absolute path");
  const base = request.base ?? request.root;
  if (!isAbsolute(base)) return emptyFmt("failed", 2, "fmt: base must be an absolute path");
  if (request.paths.length === 0) return emptyFmt("failed", 2, "fmt: needs at least one path");
  if (context.signal?.aborted) return emptyFmt("cancelled", null);
  const planned: { file: FmtFile; abs: string; source: string; text: string }[] = [];
  const files: FmtFile[] = [];
  try {
    // `fmt` reads nothing of the config but the edition it asks for.
    const config = join(request.root, CONFIG_FILE);
    if (existsSync(config)) assertFormatOnly(config, readFileSync(config, "utf8"));
    context.onProgress?.({ text: "reading the files" });
    for (const shown of collectMdFiles(request.paths, base)) {
      const abs = resolve(base, shown);
      const file: FmtFile = { shown, path: toPosix(relative(request.root, abs)), state: "current" };
      files.push(file);
      let source: string;
      try {
        source = readFileSync(abs, "utf8");
      } catch (error) {
        file.state = "unreadable";
        file.error = messageOf(error);
        continue;
      }
      // The model's text is kept as it was written: formatting it would change a saved answer.
      if (isStoredExplanation(source)) {
        file.state = "explanation";
        continue;
      }
      const formatted = formatSource(shown, source);
      if (!formatted.ok) {
        file.state = "invalid";
        file.diagnostics = formatted.diagnostics;
      } else if (formatted.text !== source) {
        file.state = "stale";
        planned.push({ file, abs, source, text: formatted.text });
      }
    }
  } catch (error) {
    return emptyFmt("failed", 2, messageOf(error));
  }
  const payload: FmtPayload = { check: request.check, files };
  const finish = (status: OperationStatus, written: string[]): OperationEnvelope<"fmt"> => {
    const failed = files.some((file) => file.state === "unreadable" || file.state === "failed");
    const findings = files.some((file) => file.state === "invalid" || file.state === "stale");
    const code = failed ? 2 : findings ? 1 : 0;
    return { ...emptyFmt(status === "completed" && failed ? "failed" : status, status === "cancelled" ? null : code), payload, messages: fmtMessages(payload), written };
  };
  if (context.signal?.aborted) return finish("cancelled", []);
  if (request.check || planned.length === 0) return finish("completed", []);
  context.onProgress?.({ text: "waiting to write" });
  try {
    await context.beforeCommit?.();
  } catch (error) {
    const stopped = finish("failed", []);
    return { ...stopped, exitCode: 2, messages: [...stopped.messages, { level: "error", text: messageOf(error) }] };
  }
  if (context.signal?.aborted) return finish("cancelled", []);
  const written: string[] = [];
  let cancelled = false;
  for (const step of planned) {
    if (cancelled || context.signal?.aborted) {
      cancelled = true;
      step.file.state = "not-attempted";
      continue;
    }
    context.onProgress?.({ text: `writing ${step.file.path}` });
    try {
      commitFormatted(step.abs, step.source, step.text);
      step.file.state = "formatted";
      written.push(step.file.path);
    } catch (error) {
      step.file.state = "failed";
      step.file.error = messageOf(error);
    }
  }
  return finish(cancelled ? "cancelled" : "completed", written);
}

/**
 * Writes one formatted file: atomically at the file a link names, with the
 * formatter's bytes (`fmt` turns CRLF into LF, as it always did), and only
 * when the file still holds `source`. A file that cannot be written in place
 * (read-only) is not replaced by the rename either.
 */
function commitFormatted(abs: string, source: string, text: string): void {
  const target = landing(abs) ?? abs;
  if (readFileSync(target, "utf8") !== source) throw new Error("changed on disk while it was formatted; nothing written");
  closeSync(openSync(target, "r+"));
  writeAtomic(target, text, { exact: true });
}

/**
 * The report, file by file in path order: `info` is what `keylang fmt`
 * prints to stdout, `error` what it prints to stderr; a `warning` names a
 * skipped explanation, which the CLI passes over silently.
 */
export function fmtMessages(payload: FmtPayload): OperationMessage[] {
  const out: OperationMessage[] = [];
  for (const file of payload.files) {
    if (file.state === "stale") out.push({ level: payload.check ? "info" : "error", text: payload.check ? `${file.shown}: not formatted` : `${file.shown}: not written` });
    else if (file.state === "formatted") out.push({ level: "info", text: `${file.shown}: formatted` });
    else if (file.state === "invalid") for (const d of file.diagnostics ?? []) out.push({ level: "error", text: formatDiagnostic(d) });
    else if (file.state === "unreadable") out.push({ level: "error", text: `${file.shown}: cannot read: ${file.error}` });
    else if (file.state === "failed") out.push({ level: "error", text: `${file.shown}: cannot write: ${file.error}` });
    else if (file.state === "not-attempted") out.push({ level: "warning", text: `${file.shown}: not written (cancelled)` });
    else if (file.state === "explanation") out.push({ level: "warning", text: `${file.shown}: a saved explanation, not keylang Markdown; skipped` });
  }
  return out;
}

function emptyWire(status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string): OperationEnvelope<"wire"> {
  return { kind: "wire", status, exitCode, payload: null, messages: error === undefined ? [] : [{ level: "error", text: error }], written: [], removed: [], proposals: [] };
}

/**
 * `keylang wire [--check]` in two phases. The path policy of `out` is checked
 * before anything is read: a plain relative TypeScript path that stays inside
 * the repository through links (code 2 otherwise). Compute: the saved specs
 * and the code are analyzed (no fact cache is written); an error on a
 * `# wiring` line blocks with code 1, a missing section is code 2, then the
 * unchanged `generateWire` gives the text. A file without the generation
 * marker is never written (1). Check: 0 when the file holds the text (CRLF
 * read as LF), 1 when it is stale or missing; nothing is written, no directory
 * created. Write: nothing to do is 0 without `beforeCommit`; otherwise after
 * it the target, the specs, `tsconfig.json`, `keylang.json` and the sources
 * must be what the text was computed from — a change refuses it (failed, 1,
 * nothing written) — and the file is written atomically (0, or 2 on an I/O
 * error). Cancelled: null, nothing written.
 */
async function runWire(request: WireRequest, context: OperationContext): Promise<OperationEnvelope<"wire">> {
  if (!isAbsolute(request.root)) return emptyWire("failed", 2, "wire: root must be an absolute path");
  const out = request.out ?? WIRE_OUT;
  const problem = wireOutProblem(request.root, out);
  if (problem !== null) return emptyWire("failed", 2, problem);
  if (context.signal?.aborted) return emptyWire("cancelled", null);
  context.onProgress?.({ text: "reading the specs and the sources" });
  let analyzed: Analysis;
  let specs: WireSpecInputs;
  try {
    // Read before the analysis: a spec changed in between is then refused at the commit, never missed.
    specs = wireSpecInputs(loadConfig(request.root));
    analyzed = await (context.analyze ?? analyze)({ root: request.root, withoutEvidence: true, persistFacts: false });
  } catch (error) {
    return emptyWire("failed", 2, messageOf(error));
  }
  if (context.signal?.aborted) return emptyWire("cancelled", null);
  const snapshot = analyzed.snapshot;
  if (!snapshot) return emptyWire("failed", 2, "wire: no supported source files; run `keylang init`");
  const payload: WirePayload = { file: out, check: request.check, state: "stale", diagnostics: [], written: false, refused: [], error: null, snapshot: snapshot.snapshotId };
  const lines = (texts: string[]): OperationMessage[] => texts.map((text) => ({ level: "info" as const, text }));
  const blocking = wiringErrors(analyzed);
  if (blocking.length > 0) {
    payload.state = "blocked";
    payload.diagnostics = blocking;
    return { ...emptyWire("completed", 1), payload, messages: [...lines(blocking.map(formatDiagnostic)), { level: "error", text: `wire: ${blocking.length} error(s) in wiring; nothing written` }] };
  }
  const wires = analyzed.spec.wires;
  if (wires.length === 0) return { ...emptyWire("failed", 2, `wire: no \`# wiring\` section under ${analyzed.config.dir}/`), payload };
  let text: string;
  let current: string | null;
  try {
    text = generateWire({ root: request.root, out, wires, snapshot });
    const abs = landing(join(request.root, out));
    current = abs !== null && existsSync(abs) ? readFileSync(abs, "utf8") : null;
  } catch (error) {
    return { ...emptyWire("failed", 2, messageOf(error)), payload };
  }
  if (current !== null && !current.startsWith(WIRE_MARKER)) {
    payload.state = "manual";
    return { ...emptyWire("completed", 1), payload, messages: lines([`${out}: manual file without keylang:generated marker`]) };
  }
  // A checkout that turned LF into CRLF holds the same file.
  if (current !== null && current.replace(/\r\n/g, "\n") === text) payload.state = "current";
  if (request.check) return { ...emptyWire("completed", payload.state === "current" ? 0 : 1), payload, messages: lines(payload.state === "current" ? [] : [`${out}: stale, run \`keylang wire\``]) };
  if (payload.state === "current") return { ...emptyWire("completed", 0), payload };
  const inputs = sourceInputs(analyzed.config, snapshot.manifest.files);
  context.onProgress?.({ text: "waiting to write" });
  try {
    await context.beforeCommit?.();
  } catch (error) {
    return { ...emptyWire("failed", 2, messageOf(error)), payload };
  }
  if (context.signal?.aborted) return { ...emptyWire("cancelled", null), payload };
  let problems: string[];
  try {
    const target = writeProblem(request.root, out, { generated: true, expect: current });
    // The target is a source file too (its own layer); its change is the expect check's to name.
    const sources = sourceInputProblems(analyzed.config, inputs, "the wiring").filter((line) => !line.startsWith(`${out}: `));
    problems = [...(target === null ? [] : [`${out}: ${target}`]), ...wireSpecProblems(analyzed.config, specs), ...sources];
  } catch (error) {
    return { ...emptyWire("failed", 2, messageOf(error)), payload };
  }
  if (problems.length > 0) {
    payload.refused = problems;
    return {
      ...emptyWire("failed", 1),
      payload,
      messages: [...problems.map((text) => ({ level: "error" as const, text })), { level: "info", text: "nothing was written; run wire again to generate it from the files on disk" }],
    };
  }
  context.onProgress?.({ text: `writing ${out}` });
  try {
    const abs = landing(join(request.root, out));
    if (abs === null) throw new Error("leads through a loop of links");
    // Missing directories are created; a CRLF file keeps CRLF, as `keylang wire` always wrote it.
    writeAtomic(abs, text);
  } catch (error) {
    payload.error = messageOf(error);
    return { ...emptyWire("failed", 2), payload, messages: [{ level: "error", text: `${out}: ${payload.error}` }] };
  }
  payload.written = true;
  return { ...emptyWire("completed", 0), payload, messages: lines([`${out}: written`]), written: [out] };
}

/**
 * Why `out` cannot be the generated file (the CLI's message), or null: the
 * path policy of every write — plain, relative, inside the repository through
 * links — and a TypeScript extension. Reads nothing outside the repository and
 * writes nothing; a form may call it as the path is typed.
 */
export function wireOutProblem(root: string, out: string): string | null {
  if (!/\.(ts|mts|cts)$/.test(out)) return `wire: --out must name a TypeScript file (.ts, .mts or .cts), got \`${out}\``;
  try {
    const problem = writeProblem(root, out, { generated: true });
    return problem === null ? null : `wire: --out ${out}: ${problem}`;
  } catch (error) {
    return `wire: --out ${out}: ${messageOf(error)}`;
  }
}

/** Error diagnostics on the lines of a `# wiring` section, whatever their code: any of them can change what is generated. */
function wiringErrors(analysis: Analysis): Diagnostic[] {
  const ranges = new Map<string, [number, number][]>();
  for (const doc of analysis.docs) {
    const heads = doc.sections.map((section) => section.heading?.span.start.line ?? 1);
    doc.sections.forEach((section, i) => {
      if (section.kind !== "wiring") return;
      ranges.set(doc.path, [...(ranges.get(doc.path) ?? []), [heads[i]!, i + 1 < heads.length ? heads[i + 1]! - 1 : Number.POSITIVE_INFINITY]]);
    });
  }
  return analysis.diagnostics.filter((d) => isError(d) && (ranges.get(d.file) ?? []).some(([from, to]) => d.span.start.line >= from && d.span.start.line <= to));
}

/** What the generated text depends on besides the snapshot: every saved spec (a `# wiring` section may be in any) and `tsconfig.json` (the import form). */
interface WireSpecInputs {
  specs: Map<string, string>;
  tsconfig: string | null;
}

/** The saved specs by path (relative, POSIX) with their hash, and the root `tsconfig.json`. */
function wireSpecInputs(config: Config): WireSpecInputs {
  const dir = join(config.root, config.dir);
  const specs = new Map<string, string>();
  if (existsSync(dir)) {
    // The reading aids beside the specs are not specs: the analysis skips them too.
    const reading = [join(dir, EXPLAINED_MAP_DIR), join(dir, "explain")];
    for (const abs of collectMdFiles([dir])) {
      if (reading.some((aid) => within(abs, aid))) continue;
      const text = readTextOrNull(abs);
      if (text !== null) specs.set(toPosix(relative(config.root, abs)), sha256(text));
    }
  }
  return { specs, tsconfig: readTextOrNull(join(config.root, "tsconfig.json")) };
}

/** How the specs and `tsconfig.json` differ from the ones the wiring was computed from (`path: reason` lines). */
function wireSpecProblems(config: Config, before: WireSpecInputs): string[] {
  const now = wireSpecInputs(config);
  const problems: string[] = [];
  for (const [path, hash] of now.specs) {
    const old = before.specs.get(path);
    if (old === undefined) problems.push(`${path}: added while the wiring was computed`);
    else if (old !== hash) problems.push(`${path}: changed on disk while the wiring was computed`);
  }
  for (const path of before.specs.keys()) if (!now.specs.has(path)) problems.push(`${path}: removed while the wiring was computed`);
  if (now.tsconfig !== before.tsconfig) problems.push("tsconfig.json: changed on disk while the wiring was computed");
  return problems;
}

function readTextOrNull(abs: string): string | null {
  try {
    return readFileSync(abs, "utf8");
  } catch {
    return null;
  }
}

function emptyCheck(status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string): OperationEnvelope<"check"> {
  return { kind: "check", status, exitCode, payload: null, messages: error === undefined ? [] : [{ level: "error", text: error }], written: [], removed: [], proposals: [] };
}

/**
 * `keylang check` on the saved files: the paths (the spec directory by
 * default), the static mode (request, then keylang.json, then `behavior`)
 * and `strict`. Code 1 for a failure, or with `strict` for an unverified
 * verdict; an unverified one without `strict` is code 0 and stays in the
 * report. Code 2 for a broken config or a missing path. With `changed` the
 * report is the git slice of the full analysis (`check --changed`); without
 * git, outside a repository or with an unknown ref it is code 2. It writes
 * nothing, not even the fact cache.
 */
async function runCheck(request: CheckRequest, context: OperationContext): Promise<OperationEnvelope<"check">> {
  if (!isAbsolute(request.root)) return emptyCheck("failed", 2, "check: root must be an absolute path");
  const base = request.base ?? request.root;
  if (!isAbsolute(base)) return emptyCheck("failed", 2, "check: base must be an absolute path");
  if (context.signal?.aborted) return emptyCheck("cancelled", null);
  let config: Config;
  try {
    config = loadConfig(request.root);
  } catch (error) {
    return emptyCheck("failed", 2, messageOf(error));
  }
  const specDir = join(request.root, config.dir);
  if (request.paths.length === 0 && !existsSync(specDir)) return emptyCheck("failed", 2, `no \`${config.dir}/\` directory here; run \`keylang init\` or pass paths`);
  const specs = request.paths.length > 0 ? request.paths.map((path) => resolve(base, path)) : [specDir];
  for (const spec of specs) if (!existsSync(spec)) return emptyCheck("failed", 2, `${relative(base, spec) || spec}: not found`);
  if (request.since !== undefined && request.changed !== true) return emptyCheck("failed", 2, "check: --since requires --changed");
  // The git slice is read before the analysis: without git or with an unknown ref the check fails, it never falls back to a full one.
  const since = request.since ?? "HEAD";
  let git: ChangedFiles | null = null;
  if (request.changed === true) {
    try {
      git = gitChangedFiles(request.root, since);
    } catch (error) {
      return emptyCheck("failed", 2, messageOf(error));
    }
  }
  // Specs outside the repository's spec directory (examples, a slide) have no code to check against.
  const withoutCode = !specs.every((spec) => within(spec, specDir));
  const display = (abs: string): string => toPosix(relative(base, abs));
  context.onProgress?.({ text: "checking the saved specs against the code" });
  // A named hook default: the static evidence of `keylang check` follows it to `analyze`.
  const analyzeSaved = context.analyze ?? analyze;
  let analyzed: Analysis;
  try {
    analyzed = await analyzeSaved({
      root: request.root,
      specs,
      display,
      ...(request.static ? { static: request.static } : {}),
      ...(withoutCode ? { withoutCode: true } : {}),
    });
  } catch (error) {
    return emptyCheck("failed", 2, messageOf(error));
  }
  if (context.signal?.aborted) return emptyCheck("cancelled", null);
  const snapshotId = analyzed.snapshot?.snapshotId ?? null;
  const full = checkReport(analyzed.verdicts, snapshotId, analyzed.diagnostics);
  let report = full;
  let changed: ChangedSlice | null = null;
  if (git !== null) {
    // The whole analysis, then the slice: only findings that touch the changed files stay.
    const deleted = deletedModuleIds(config, git.deleted);
    const filtered = filterChanged({ docs: analyzed.docs, spec: analyzed.spec, diagnostics: analyzed.diagnostics, verdicts: analyzed.verdicts, nodes: analyzed.snapshot?.nodes ?? {} }, changedPathSet(request.root, git.paths, base), deleted);
    report = checkReport(filtered.verdicts, snapshotId, filtered.diagnostics);
    changed = { since, unborn: git.unborn, files: [...git.paths].sort(compareText), deleted, shown: report.results.length, hidden: full.results.length - report.results.length };
  }
  const mode = resolveStatic(request.static, analyzed.config.check.static);
  const payload: CheckPayload = {
    results: report.results,
    snapshotId,
    coverage: analyzed.snapshot?.coverage ?? [],
    lines: report.lines,
    counts: report.counts,
    options: {
      paths: specs.map((spec) => display(spec) || "."),
      strict: request.strict,
      static: mode.mode,
      staticFrom: mode.setBy === "flag" ? "request" : (mode.setBy ?? "default"),
      withoutCode,
    },
    notSpecs: analyzed.notSpecs,
    changed,
  };
  const messages: OperationMessage[] = [
    ...payload.notSpecs.map((path) => ({ level: "warning" as const, text: checkSkipNote(path) })),
    ...payload.lines.map((text) => ({ level: "info" as const, text })),
    { level: "info", text: checkSummary(payload.counts) },
  ];
  return { ...emptyCheck("completed", checkExitCode(payload.counts, request.strict)), payload, messages };
}

function emptyExplainEdge(status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string): OperationEnvelope<"explain-edge"> {
  return { kind: "explain-edge", status, exitCode, payload: null, messages: error === undefined ? [] : [{ level: "error", text: error }], written: [], removed: [], proposals: [] };
}

/**
 * `keylang check --explain-edge <from> <to>` on the saved code: a fresh
 * analysis without specs, then the edges between the ids. Code 0 whether or
 * not there is an edge; code 2 for a broken config, no snapshot or an
 * unknown id (an unknown tail under a known module included). A message after
 * the error may suggest a near id; the CLI prints only the error. Writes
 * nothing, not even the fact cache.
 */
async function runExplainEdge(request: ExplainEdgeRequest, context: OperationContext): Promise<OperationEnvelope<"explain-edge">> {
  if (!isAbsolute(request.root)) return emptyExplainEdge("failed", 2, "check --explain-edge: root must be an absolute path");
  if (context.signal?.aborted) return emptyExplainEdge("cancelled", null);
  context.onProgress?.({ text: "reading the edges of the saved code" });
  const analyzeSaved = context.analyze ?? analyze;
  let analyzed: Analysis;
  try {
    analyzed = await analyzeSaved({ root: request.root, specs: [] });
  } catch (error) {
    return emptyExplainEdge("failed", 2, messageOf(error));
  }
  if (context.signal?.aborted) return emptyExplainEdge("cancelled", null);
  const { snapshot } = analyzed;
  if (!snapshot) return emptyExplainEdge("failed", 2, "no snapshot; run inside a repository with sources");
  for (const id of [request.from, request.to]) {
    if (edgeIdKnown(snapshot, id)) continue;
    const near = analyzed.index.suggest(id);
    const failed = emptyExplainEdge("failed", 2, `unknown id \`${id}\``);
    return near === undefined ? failed : { ...failed, messages: [...failed.messages, { level: "info", text: `did you mean \`${near}\`?` }] };
  }
  const explanation = explainEdge(snapshot, request.from, request.to);
  const payload: ExplainEdgePayload = { ...explanation, snapshotId: snapshot.snapshotId, lines: edgeExplanationLines(explanation) };
  return { ...emptyExplainEdge("completed", 0), payload, messages: payload.lines.map((text) => ({ level: "info" as const, text })) };
}

function emptyExport(status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string): OperationEnvelope<"export"> {
  return { kind: "export", status, exitCode, payload: null, messages: error === undefined ? [] : [{ level: "error", text: error }], written: [], removed: [], proposals: [] };
}

/** The bytes an export writes: the CLI's stdout for the same report. */
export function exportText(source: ExportSource): string {
  return source.kind === "check" ? checkReportText(source.format, source.report) : source.lines.map((line) => `${line}\n`).join("");
}

/**
 * Why `path` cannot receive an export, or null: the write policy of every
 * repository write (plain, relative, inside through links, no directory, no
 * file with a generation marker) and the artifacts generators own — the map,
 * the explained map, the index, the fact cache and the proposals — even
 * before they exist. Reads only; a form may call it as the path is typed.
 */
export function exportTargetProblem(root: string, path: string): string | null {
  const problem = writeProblem(root, path);
  if (problem !== null) return problem;
  const target = landing(join(root, path));
  if (target === null) return "leads through a loop of links";
  const rel = toPosix(relative(realpathSync(root), target));
  const dir = specDirOf(root);
  const owned = [`${dir}/map/`, `${dir}/${EXPLAINED_MAP_DIR}/`, `${PROPOSALS_DIR}/`];
  if (rel === ".keylang/index.json" || rel === FACT_CACHE_FILE || owned.some((prefix) => rel.startsWith(prefix))) return "a generated artifact: only its generator writes it";
  return null;
}

/** The spec directory of keylang.json without the rest of the config (a broken one included): `keylang` unless it says otherwise. */
function specDirOf(root: string): string {
  try {
    const raw: unknown = JSON.parse(readFileSync(join(root, CONFIG_FILE), "utf8"));
    const dir = typeof raw === "object" && raw !== null && "dir" in raw ? raw.dir : undefined;
    return typeof dir === "string" && dir !== "" ? dir.replace(/\/+$/, "") : "keylang";
  } catch {
    return "keylang";
  }
}

/**
 * Exports a finished report to one file. Nothing is computed again: the text
 * is the CLI's stdout for the request's report. After `beforeCommit` the
 * target must pass `exportTargetProblem` and still be the file the form
 * showed (`expect`); otherwise nothing is written (failed, 1). The write is
 * atomic, the exact bytes, with missing parent directories created (0; 2 on
 * an I/O error). Cancelled: null, nothing written.
 */
async function runExport(request: ExportRequest, context: OperationContext): Promise<OperationEnvelope<"export">> {
  if (!isAbsolute(request.root)) return emptyExport("failed", 2, "export: root must be an absolute path");
  if (context.signal?.aborted) return emptyExport("cancelled", null);
  const text = exportText(request.source);
  const payload: ExportPayload = {
    path: request.path,
    format: request.source.kind === "check" ? request.source.format : "human",
    source: request.source.kind,
    bytes: Buffer.byteLength(text, "utf8"),
    existed: request.expect !== null,
    written: false,
    refused: [],
    error: null,
  };
  context.onProgress?.({ text: "waiting to write" });
  try {
    await context.beforeCommit?.();
  } catch (error) {
    return { ...emptyExport("failed", 2, messageOf(error)), payload };
  }
  if (context.signal?.aborted) return { ...emptyExport("cancelled", null), payload };
  let problem: string | null;
  try {
    problem = exportTargetProblem(request.root, request.path) ?? writeProblem(request.root, request.path, { expect: request.expect });
  } catch (error) {
    return { ...emptyExport("failed", 2, messageOf(error)), payload };
  }
  if (problem !== null) {
    payload.refused = [`${request.path}: ${problem}`];
    return { ...emptyExport("failed", 1), payload, messages: [{ level: "error", text: payload.refused[0]! }, { level: "info", text: "nothing was written; export the report again to see the file as it is now" }] };
  }
  context.onProgress?.({ text: `writing ${request.path}` });
  try {
    const abs = landing(join(request.root, request.path));
    if (abs === null) throw new Error("leads through a loop of links");
    // The CLI's bytes: no CRLF carried over from a file it replaces.
    writeAtomic(abs, text, { exact: true });
  } catch (error) {
    payload.error = messageOf(error);
    return { ...emptyExport("failed", 2), payload, messages: [{ level: "error", text: `${request.path}: ${payload.error}` }] };
  }
  payload.written = true;
  return { ...emptyExport("completed", 0), payload, messages: [{ level: "info", text: `${request.path}: written` }], written: [request.path] };
}

/** The note on a path that holds no specs, as the CLI writes it after `keylang: `. */
export function checkSkipNote(path: string): string {
  return `note: ${path}: the explained map and saved explanations are not specs; skipped`;
}

/** The CLI's closing line on stderr: `0 fail, 2 unverified, 5 ok`. */
export function checkSummary(counts: CheckPayload["counts"]): string {
  return `${counts.fail} fail, ${counts.unverified} unverified, ${counts.ok} ok`;
}

/** The slugs `keylang feature` accepts: a plain file name under `<dir>/features/`. */
export const FEATURE_SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function emptyFeature(status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string): OperationEnvelope<"feature"> {
  return { kind: "feature", status, exitCode, payload: null, messages: error === undefined ? [] : [{ level: "error", text: error }], written: [], removed: [], proposals: [] };
}

/**
 * The feature status of the saved files. It never takes unsaved text: a
 * caller with dirty buffers saves them first, explicitly. A missing file, an
 * invalid slug or config, or a failed analysis is a failure with code 2, not
 * a gap; gaps are code 1. Nothing is written.
 */
async function runFeature(request: FeatureRequest, context: OperationContext): Promise<OperationEnvelope<"feature">> {
  if (!isAbsolute(request.root)) return emptyFeature("failed", 2, "feature: root must be an absolute path");
  if (request.slug === "") return emptyFeature("failed", 2, "feature: a slug is required");
  if (!FEATURE_SLUG.test(request.slug)) return emptyFeature("failed", 2, `feature: invalid slug \`${request.slug}\``);
  if (context.signal?.aborted) return emptyFeature("cancelled", null);
  let config: Config;
  try {
    config = loadConfig(request.root);
  } catch (error) {
    return emptyFeature("failed", 2, messageOf(error));
  }
  const file = `${config.dir}/features/${request.slug}.md`;
  if (!existsSync(join(request.root, file))) return emptyFeature("failed", 2, `feature: ${file}: not found`);
  let analyzed: Analysis;
  try {
    analyzed = await (context.analyze ?? analyze)({ root: request.root });
  } catch (error) {
    return emptyFeature("failed", 2, messageOf(error));
  }
  if (context.signal?.aborted) return emptyFeature("cancelled", null);
  const report = featureStatus({ dir: config.dir, docs: analyzed.docs, spec: analyzed.spec, diagnostics: analyzed.diagnostics, verdicts: analyzed.verdicts }, request.slug);
  if (report === null) return emptyFeature("failed", 2, `feature: ${file}: not a spec keylang read`);
  const messages: OperationMessage[] = [...report.gaps.map((gap) => ({ level: "info" as const, text: gapLine(gap) })), { level: report.done ? "info" : "warning", text: featureSummary(report) }];
  return {
    ...emptyFeature("completed", report.done ? 0 : 1),
    payload: { slug: request.slug, file, snapshot: analyzed.snapshot?.snapshotId ?? null, report },
    messages,
  };
}

/** One gap as the CLI prints it: `file:line:col: kind id: reason`. */
export function gapLine(gap: Gap): string {
  return `${gap.file}:${gap.line}:${gap.col}: ${gap.kind} ${gap.id}: ${gap.reason}`;
}

/** The CLI's closing line on stderr: `done` or `N gap(s)`. */
export function featureSummary(report: FeatureReport): string {
  return report.done ? "done" : `${report.gaps.length} gap(s)`;
}

function emptyDoctor(status: OperationStatus, exitCode: 0 | 1 | 2 | null): OperationEnvelope<"doctor"> {
  return { kind: "doctor", status, exitCode, payload: null, messages: [], written: [], removed: [], proposals: [] };
}

async function runDoctor(request: DoctorRequest, context: OperationContext): Promise<OperationEnvelope<"doctor">> {
  // The root is absolute by contract: otherwise path resolution would fall
  // back on the working directory, which the operation must never read.
  if (!isAbsolute(request.root)) {
    return { ...emptyDoctor("failed", 2), messages: [{ level: "error", text: "doctor: root must be an absolute path" }] };
  }
  if (context.signal?.aborted) return emptyDoctor("cancelled", null);
  // A broken keylang.json is an error naming the file and field, not a
  // "nothing is configured" report; loadConfig already throws that way.
  let config: Config;
  try {
    config = loadConfig(request.root);
  } catch (error) {
    return { ...emptyDoctor("failed", 2), messages: [{ level: "error", text: messageOf(error) }] };
  }
  // The heavy adapters load only for this operation, as they did in the CLI.
  const { llmClient } = await import("./llm.ts");
  const { localStatus, microphoneStatus } = await import("./voice-local.ts");
  const { localModel, modelsDir, voiceEngine } = await import("./voice.ts");
  if (context.signal?.aborted) return emptyDoctor("cancelled", null);
  const native = await localStatus();
  if (context.signal?.aborted) return emptyDoctor("cancelled", null);
  const microphone = await microphoneStatus();
  const agent = agentState(config, llmClient);
  const engine = engineState(config, native.status === "ok", voiceEngine);
  const old = oldExplanations(request.root);
  const payload: DoctorPayload = {
    languages: [...config.languages],
    configFile: existsSync(join(request.root, CONFIG_FILE)),
    guessed: config.guessed,
    agent,
    explanations: {
      saved: explainedIds(config, "answers").length,
      briefs: explainedIds(config, "briefs").length,
      dir: config.dir,
      map: config.explain.map,
      old,
      moveHint: old > 0 ? moveHint(config, old) : null,
    },
    voice: {
      engine: config.voice.engine,
      ...engine,
      model: localModel(),
      modelsDir: modelsDir(),
      native,
      microphone,
    },
  };
  const report = doctorLines(payload);
  return { ...emptyDoctor("completed", 0), payload, messages: report.map((text) => ({ level: "info" as const, text })) };
}

/** The configured agent and its credential state, without the key value. */
function agentState(config: Config, llmClient: (agent: string | null) => LlmSetup): DoctorPayload["agent"] {
  if (config.agent === null) return { configured: null, state: "missing", detail: "not configured (keylang.json `agent`)" };
  try {
    const setup = llmClient(config.agent);
    if ("missing" in setup) return { configured: config.agent, state: "missing", detail: setup.missing };
    return { configured: config.agent, state: "ok", detail: "credentials found" };
  } catch (error) {
    return { configured: config.agent, state: "error", detail: messageOf(error) };
  }
}

/** The engine the voice configuration resolves to now, without the key. */
function engineState(
  config: Config,
  nativeAvailable: boolean,
  voiceEngine: (config: Config["voice"], localAvailable: boolean) => VoiceEngine,
): { resolved: DoctorPayload["voice"]["resolved"]; missing: string | null; error: string | null } {
  try {
    const found = voiceEngine(config.voice, nativeAvailable);
    if ("missing" in found) return { resolved: null, missing: found.missing, error: null };
    return found.kind === "openrouter"
      ? { resolved: { kind: "openrouter", model: found.model }, missing: null, error: null }
      : { resolved: { kind: "local", modelFile: found.modelFile }, missing: null, error: null };
  } catch (error) {
    return { resolved: null, missing: null, error: messageOf(error) };
  }
}

/** The report lines, exactly as the CLI prints them; the payload carries the data. */
function doctorLines(payload: DoctorPayload): string[] {
  const { agent, explanations, voice } = payload;
  const engine =
    voice.error ??
    (voice.resolved?.kind === "openrouter"
      ? `openrouter (${voice.resolved.model})`
      : voice.resolved?.kind === "local"
        ? `local (${voice.resolved.modelFile})`
        : voice.missing);
  const native =
    voice.native.status === "ok" ? "installed" : voice.native.status === "missing" ? "not installed (optional)" : `unavailable: ${voice.native.reason}`;
  const microphone =
    voice.microphone.status === "ok"
      ? "installed"
      : voice.microphone.status === "missing"
        ? "not installed (optional; keylang web uses the browser's microphone)"
        : `unavailable: ${voice.microphone.reason} (keylang web uses the browser's microphone)`;
  return [
    `languages: ${payload.languages.join(", ") || "none found"}${payload.configFile ? "" : ` (guessed; no ${CONFIG_FILE})`}`,
    `agent: ${agent.configured === null ? agent.detail : `${agent.configured}: ${agent.detail}`}`,
    `explanations: ${explanations.saved} saved, ${explanations.briefs} brief(s) in ${explanations.dir}/explain/; explained map ${explanations.map ? "on" : "off"} (keylang.json \`explain.map\`)${explanations.old > 0 ? `; ${explanations.moveHint}` : ""}`,
    `voice: engine ${voice.engine} → ${engine}`,
    `voice model: ${voice.model ?? `none in ${voice.modelsDir}`}`,
    `@fugood/whisper.node: ${native}`,
    `microphone (decibri): ${microphone}`,
  ];
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
