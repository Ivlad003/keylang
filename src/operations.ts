// Shared workspace operations (ADR 0008): transport-independent orchestration
// of the application-level actions. The CLI and the TUI call the same
// interface: a typed request with an explicit absolute root, a typed result
// with a domain payload. This module never imports a transport, reads the
// working directory, or writes stdout/stderr. One operation variant at a
// time: each feature ticket adds its own, not every handler in advance.

import { existsSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { analyze, type Analysis, type AnalysisRequest } from "./analyze.ts";
import { baselinePlanProblems, commitBaseline, planBaseline, type BaselinePlan } from "./baseline.ts";
import { CONFIG_FILE, loadConfig, toPosix, type Config } from "./config.ts";
import { explainedIds, moveHint, oldExplanations } from "./explain-llm.ts";
import { featureStatus, type FeatureReport, type Gap } from "./feature-status.ts";
import type { Stats } from "./graph.ts";
import type { LlmSetup } from "./llm.ts";
import { commitMap, diffMap, mapPlanProblems, planMap, type CommittedStep, type MapPlan } from "./map.ts";
import type { ModuleStatus } from "./voice-local.ts";
import type { VoiceEngine } from "./voice.ts";

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

export type OperationRequest = DoctorRequest | FeatureRequest | MapCheckRequest | MapRequest | BaselineRequest;

/** The operation kinds that write files: they compute first and commit after `beforeCommit` (a check mode never calls it). */
export const WRITING_KINDS: ReadonlySet<OperationRequest["kind"]> = new Set(["map", "baseline"]);

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

/** The payload type of each operation kind. */
export interface OperationPayloads {
  doctor: DoctorPayload;
  feature: FeaturePayload;
  "map-check": MapCheckPayload;
  map: MapPayload;
  baseline: BaselinePayload;
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
