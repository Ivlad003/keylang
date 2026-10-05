// The operations that generate files from the code: the map (`map`,
// `map --check`), the baseline, the harness files (`agents`), the container
// of `# wiring` (`wire`), and `init`, which sets a repository up with them.

import { existsSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { analyze, within, type Analysis } from "../analyze.ts";
import { baselinePlanProblems, commitBaseline, planBaseline, type BaselinePlan } from "../baseline.ts";
import { CONFIG_FILE, configToJson, guessLayout, loadConfig, toPosix, type Config } from "../config.ts";
import { errorText, formatDiagnostic, isError, type Diagnostic } from "../diag.ts";
import { collectMdFiles, existingText, readTextOrNull } from "../files.ts";
import { agentsPlanProblems, commitAgents, planAgents, type AgentsPlan } from "../harness.ts";
import { commitMap, diffMap, EXPLAINED_MAP_DIR, mapPlanProblems, planMap, sourceInputProblems, sourceInputs, type CommittedStep, type MapPlan } from "../map.ts";
import { allCrlf, landing, writeAtomic, writeProblem } from "../safe-write.ts";
import { sha256 } from "../snapshot.ts";
import { generateWire, WIRE_MARKER } from "../wire-gen.ts";
import { WIRE_OUT, type AgentsPayload, type AgentsRequest, type BaselinePayload, type BaselineRequest, type GitignoreStage, type InitPayload, type InitRequest, type MapCheckPayload, type MapCheckRequest, type MapPayload, type MapRequest, type OperationContext, type OperationEnvelope, type OperationMessage, type OperationResult, type WirePayload, type WireRequest } from "./types.ts";
import { empty } from "./shared.ts";

/**
 * `keylang map --check`: renders the map from the code and compares it with
 * the files on disk. It writes nothing — not the map, the index, nor the fact
 * cache (`persistFacts` stays off). Code 1 for conflicts or stale files, 2
 * for no supported sources, a broken config or a failed analysis.
 */
export async function runMapCheck(request: MapCheckRequest, context: OperationContext): Promise<OperationEnvelope<"map-check">> {
  if (!isAbsolute(request.root)) return empty("map-check", "failed", 2, "map: root must be an absolute path");
  if (context.signal?.aborted) return empty("map-check", "cancelled", null);
  context.onProgress?.({ text: "reading the sources" });
  let analyzed: Analysis;
  try {
    analyzed = await (context.analyze ?? analyze)({ root: request.root, specs: [], withoutEvidence: true, persistFacts: false });
  } catch (error) {
    return empty("map-check", "failed", 2, errorText(error));
  }
  if (context.signal?.aborted) return empty("map-check", "cancelled", null);
  const map = analyzed.map;
  if (map === null) return empty("map-check", "failed", 2, `no supported source files under ${request.label ?? "."}; run \`keylang init\``);
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
  return { ...empty("map-check", "completed", clean ? 0 : 1), payload, messages };
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
export async function runMap(request: MapRequest, context: OperationContext): Promise<OperationEnvelope<"map">> {
  if (!isAbsolute(request.root)) return empty("map", "failed", 2, "map: root must be an absolute path");
  if (context.signal?.aborted) return empty("map", "cancelled", null);
  context.onProgress?.({ text: "reading the sources" });
  let analyzed: Analysis;
  try {
    analyzed = await (context.analyze ?? analyze)({ root: request.root, specs: [], withoutEvidence: true, persistFacts: true });
  } catch (error) {
    return empty("map", "failed", 2, errorText(error));
  }
  if (context.signal?.aborted) return empty("map", "cancelled", null);
  const map = analyzed.map;
  if (map === null) return empty("map", "failed", 2, `no supported source files under ${request.label ?? "."}; run \`keylang init\``);
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
    return { ...empty("map", "failed", 2, errorText(error)), payload };
  }
  if (plan.conflicts.length > 0) {
    payload.conflicts = plan.conflicts;
    return { ...empty("map", "completed", 1), payload, messages: [...warnings, ...mapConflictLines(plan.conflicts).map((text) => ({ level: "info" as const, text }))] };
  }
  context.onProgress?.({ text: "waiting to write" });
  try {
    await context.beforeCommit?.();
  } catch (error) {
    return { ...empty("map", "failed", 2, errorText(error)), payload };
  }
  if (context.signal?.aborted) return { ...empty("map", "cancelled", null), payload };
  let problems: string[];
  try {
    problems = mapPlanProblems(plan);
  } catch (error) {
    return { ...empty("map", "failed", 2, errorText(error)), payload };
  }
  if (problems.length > 0) {
    payload.refused = problems;
    return {
      ...empty("map", "failed", 1),
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
  return { ...empty("map", status, status === "completed" ? 0 : status === "failed" ? 2 : null), payload, messages, written, removed };
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
export async function runBaseline(request: BaselineRequest, context: OperationContext): Promise<OperationEnvelope<"baseline">> {
  if (!isAbsolute(request.root)) return empty("baseline", "failed", 2, "baseline: root must be an absolute path");
  if (context.signal?.aborted) return empty("baseline", "cancelled", null);
  context.onProgress?.({ text: "reading the sources" });
  let analyzed: Analysis;
  try {
    analyzed = await (context.analyze ?? analyze)({ root: request.root, specs: [], withoutEvidence: true, persistFacts: false });
  } catch (error) {
    return empty("baseline", "failed", 2, errorText(error));
  }
  if (context.signal?.aborted) return empty("baseline", "cancelled", null);
  if (!analyzed.snapshot) return empty("baseline", "failed", 2, "baseline: no supported source files; run `keylang init`");
  let plan: BaselinePlan;
  try {
    plan = planBaseline(analyzed.config, analyzed.snapshot);
  } catch (error) {
    return empty("baseline", "failed", 2, errorText(error));
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
  if (plan.state === "manual") return { ...empty("baseline", "completed", 1), payload, messages: lines([`${plan.path}: manual file without keylang:generated marker`]) };
  if (request.check || plan.state === "current") {
    const current = plan.state === "current";
    return { ...empty("baseline", "completed", current ? 0 : 1), payload, messages: lines(current ? [] : [`${plan.path}: stale, run \`keylang baseline\``]) };
  }
  context.onProgress?.({ text: "waiting to write" });
  try {
    await context.beforeCommit?.();
  } catch (error) {
    return { ...empty("baseline", "failed", 2, errorText(error)), payload };
  }
  if (context.signal?.aborted) return { ...empty("baseline", "cancelled", null), payload };
  let problems: string[];
  try {
    problems = baselinePlanProblems(plan);
  } catch (error) {
    return { ...empty("baseline", "failed", 2, errorText(error)), payload };
  }
  if (problems.length > 0) {
    payload.refused = problems;
    return {
      ...empty("baseline", "failed", 1),
      payload,
      messages: [...problems.map((text) => ({ level: "error" as const, text })), { level: "info", text: "nothing was written; run the baseline again to compute it from the files on disk" }],
    };
  }
  context.onProgress?.({ text: `writing ${plan.path}` });
  try {
    commitBaseline(plan);
  } catch (error) {
    payload.error = errorText(error);
    return { ...empty("baseline", "failed", 2), payload, messages: [{ level: "error", text: `${plan.path}: ${payload.error}` }] };
  }
  payload.written = true;
  return { ...empty("baseline", "completed", 0), payload, messages: lines([`${plan.path}: written`]), written: [plan.path] };
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
export async function runAgents(request: AgentsRequest, context: OperationContext): Promise<OperationEnvelope<"agents">> {
  if (!isAbsolute(request.root)) return empty("agents", "failed", 2, "agents: root must be an absolute path");
  if (context.signal?.aborted) return empty("agents", "cancelled", null);
  context.onProgress?.({ text: "reading the harness files" });
  let plan: AgentsPlan;
  try {
    plan = planAgents(request.root, request.harnesses);
  } catch (error) {
    return empty("agents", "failed", 2, errorText(error));
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
  if (plan.error !== null) return { ...empty("agents", "failed", 2, `${plan.error.file}: ${plan.error.message}`), payload };
  const changed = payload.files.filter((file) => file.action !== "keep");
  const lines = (texts: string[]): OperationMessage[] => texts.map((text) => ({ level: "info" as const, text }));
  if (request.check) return { ...empty("agents", "completed", changed.length === 0 ? 0 : 1), payload, messages: lines(changed.map((file) => `${file.path}: stale, run \`keylang agents\``)) };
  if (changed.length === 0) return { ...empty("agents", "completed", 0), payload };
  context.onProgress?.({ text: "waiting to write" });
  try {
    await context.beforeCommit?.();
  } catch (error) {
    return { ...empty("agents", "failed", 2, errorText(error)), payload };
  }
  if (context.signal?.aborted) return { ...empty("agents", "cancelled", null), payload };
  let problems: string[];
  try {
    problems = agentsPlanProblems(plan);
  } catch (error) {
    return { ...empty("agents", "failed", 2, errorText(error)), payload };
  }
  if (problems.length > 0) {
    payload.refused = problems;
    return {
      ...empty("agents", "failed", 1),
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
    ...empty("agents", status, status === "completed" ? 0 : status === "failed" ? 2 : null),
    payload,
    messages,
    written: done.filter((step) => step.action === "write").map((step) => step.path),
    removed: done.filter((step) => step.action === "remove").map((step) => step.path),
  };
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
    return { error: errorText(error) };
  }
  // Nothing to describe is a usage error (like `map`), not a finding.
  if (config.languages.length === 0) return { error: `no supported source files found under ${label} (TypeScript, JavaScript, Python, Rust)` };
  return { config };
}

const GITIGNORE_FILE = ".gitignore";

/** What `init` appends to `.gitignore`: a comment and the entry. */
const GITIGNORE_LINES = ["# keylang: local cache (index, facts, proposals, traces), not the spec", ".keylang/"];

/** A line that ignores the root `.keylang` directory: `.keylang`, `.keylang/`, `/.keylang` or `/.keylang/`, with trailing spaces as git ignores them. */
function ignoresKeylangCache(text: string): boolean {
  return text.split(/\r?\n/).some((line) => /^\/?\.keylang\/? *$/.test(line));
}

/**
 * `current` (null: no file) with the comment and `.keylang/` appended after
 * one blank line. The bytes before stay as they are; the new lines end in
 * CRLF only when every line of the file does.
 */
function withKeylangCacheIgnored(current: string | null): string {
  const text = current ?? "";
  const nl = allCrlf(text) ? "\r\n" : "\n";
  const block = GITIGNORE_LINES.map((line) => `${line}${nl}`).join("");
  if (text === "") return block;
  const ended = text.endsWith("\n") ? text : `${text}${nl}`;
  return `${ended}${/\n[ \t\r]*\n$/.test(ended) ? "" : nl}${block}`;
}

/** The `.gitignore` stage before the commit: the bytes read (null: no file), and the text to write (null: nothing to write). */
interface GitignorePlan {
  current: string | null;
  text: string | null;
  stage: GitignoreStage;
}

/** Reads the root `.gitignore` under the write rules (never through a link out of the repository) and plans the entry. Writes nothing. */
function planGitignore(root: string): GitignorePlan {
  const stage: GitignoreStage = { file: GITIGNORE_FILE, listed: false, written: false, refused: null, error: null };
  let current: string | null;
  try {
    const problem = writeProblem(root, GITIGNORE_FILE);
    if (problem !== null) return { current: null, text: null, stage: { ...stage, refused: problem } };
    const at = landing(join(root, GITIGNORE_FILE));
    current = at === null ? null : existingText(at);
  } catch (error) {
    return { current: null, text: null, stage: { ...stage, error: errorText(error) } };
  }
  const listed = current !== null && ignoresKeylangCache(current);
  return { current, text: listed ? null : withKeylangCacheIgnored(current), stage: { ...stage, listed } };
}

/** Appends the entry while the file still holds the bytes the plan read; the reason when it may not be written. Throws on an I/O error. */
function commitGitignore(root: string, plan: GitignorePlan): string | null {
  const problem = writeProblem(root, GITIGNORE_FILE, { expect: plan.current });
  if (problem !== null) return problem;
  const at = landing(join(root, GITIGNORE_FILE));
  if (at === null) return "leads through a loop of links";
  // The planned bytes exactly: their line ends were chosen from the file itself.
  writeAtomic(at, plan.text!, { exact: true });
  return null;
}

/** The code of the `.gitignore` stage: 2 an I/O error, 1 refused or (in a check) not listed, else 0. */
function gitignoreCode(stage: GitignoreStage): 0 | 1 | 2 {
  if (stage.error !== null) return 2;
  return stage.refused !== null || !stage.listed ? 1 : 0;
}

/** The line init prints for the `.gitignore` stage; null when it was already listed. */
export function gitignoreMessage(stage: GitignoreStage): OperationMessage | null {
  if (stage.error !== null) return { level: "error", text: `${stage.file}: ${stage.error}` };
  if (stage.refused !== null) return { level: "error", text: `${stage.file}: .keylang/ not added (${stage.refused})` };
  if (stage.written) return { level: "info", text: `${stage.file}: .keylang/ added` };
  if (!stage.listed) return { level: "info", text: `${stage.file}: .keylang/ is not listed; run \`keylang init\`` };
  return null;
}

/**
 * `keylang init [--check]`: an orchestration of the shared config, map,
 * baseline and agents steps, not a call of the CLI commands. Before
 * anything: the configuration (2 when it is broken or there is no supported
 * source), then the harness plan (a broken harness file is 2 and nothing is
 * written, keylang.json included) and the `.gitignore` plan. Check —
 * exactly `init --check`: the agents check (2 stops it), the baseline check,
 * then whether `.gitignore` lists `.keylang/`; 0 when all three are 0, 2 when
 * `.gitignore` cannot be read, else 1. Write, after `beforeCommit` (called
 * once for the whole run): an existing keylang.json is kept, a missing one
 * is written from the guess (an I/O error stops init, 2); `.gitignore` gets
 * `.keylang/` while it still holds the bytes planned (refused: 1, I/O: 2);
 * then map, baseline and agents run in turn, each whatever the one before it
 * did, as the CLI always has. The code is the first non-zero of
 * `.gitignore`, map, baseline, agents; any non-zero stage makes the whole run
 * `failed` — a partial init is never a success. Cancelled: the stage under
 * way names what it wrote; the rest are not run (null).
 */
export async function runInit(request: InitRequest, context: OperationContext): Promise<OperationEnvelope<"init">> {
  if (!isAbsolute(request.root)) return empty("init", "failed", 2, "init: root must be an absolute path");
  if (context.signal?.aborted) return empty("init", "cancelled", null);
  const root = request.root;
  const sources = initSources(root, request.label);
  if ("error" in sources) return empty("init", "failed", 2, sources.error);
  const { config } = sources;
  const existed = existsSync(join(root, CONFIG_FILE));
  // The same guess `loadConfig` made, with a note for every directory whose layer name had to change.
  const layout = existed ? { layers: config.layers, notes: [] } : guessLayout(root, config.exclude);
  const payload: InitPayload = {
    check: request.check,
    languages: [...config.languages],
    config: { file: CONFIG_FILE, existed, written: false, error: null, layers: [...layout.layers.keys()], notes: layout.notes },
    preflight: null,
    gitignore: null,
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
    if (payload.agents.status === "cancelled") return { ...empty("init", "cancelled", null), payload };
    if (payload.agents.exitCode === 2) return { ...empty("init", "failed", 2), payload, messages: payload.agents.messages };
    payload.baseline = await runBaseline({ kind: "baseline", root, check: true }, stage("baseline"));
    if (payload.baseline.status === "cancelled") return { ...empty("init", "cancelled", null), payload };
    payload.gitignore = planGitignore(root).stage;
    const ignore = gitignoreMessage(payload.gitignore);
    // `init --check` has always reported a failed baseline check as a difference, code 1; an unreadable `.gitignore` is I/O, 2.
    const ignored = gitignoreCode(payload.gitignore);
    const code = ignored === 2 ? 2 : payload.agents.exitCode === 0 && payload.baseline.exitCode === 0 && ignored === 0 ? 0 : 1;
    return { ...empty("init", code === 2 ? "failed" : "completed", code), payload, messages: [...payload.agents.messages, ...payload.baseline.messages, ...(ignore ? [ignore] : [])] };
  }
  // An unknown name or a broken harness file fails before any write, including keylang.json.
  payload.preflight = await runAgents({ kind: "agents", root, harnesses: request.harnesses, check: true }, stage("agents"));
  if (payload.preflight.status === "cancelled") return { ...empty("init", "cancelled", null), payload };
  if (payload.preflight.status === "failed") return { ...empty("init", "failed", payload.preflight.exitCode ?? 2), payload, messages: payload.preflight.messages };
  const ignore = planGitignore(root);
  context.onProgress?.({ text: "waiting to write" });
  try {
    await context.beforeCommit?.();
  } catch (error) {
    return { ...empty("init", "failed", 2, errorText(error)), payload };
  }
  if (context.signal?.aborted) return { ...empty("init", "cancelled", null), payload };
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
      payload.config.error = errorText(error);
      return { ...empty("init", "failed", 2), payload, messages: [...messages, { level: "error", text: `${CONFIG_FILE}: ${payload.config.error}; nothing else was written` }] };
    }
    payload.config.written = true;
    written.push(CONFIG_FILE);
    messages.push({ level: "info", text: `${CONFIG_FILE}: written (${config.languages.join(", ")}; layers: ${payload.config.layers.join(", ")})` });
  }
  // Before the map writes the cache: `.keylang/` is ignored by the time it exists.
  payload.gitignore = ignore.stage;
  if (ignore.text !== null && ignore.stage.refused === null && ignore.stage.error === null) {
    context.onProgress?.({ text: `writing ${GITIGNORE_FILE}` });
    try {
      const refused = commitGitignore(root, ignore);
      payload.gitignore = refused === null ? { ...ignore.stage, listed: true, written: true } : { ...ignore.stage, refused };
    } catch (error) {
      payload.gitignore = { ...ignore.stage, error: errorText(error) };
    }
    if (payload.gitignore.written) written.push(GITIGNORE_FILE);
  }
  const ignoreLine = gitignoreMessage(payload.gitignore);
  if (ignoreLine) messages.push(ignoreLine);
  const collect = (result: OperationResult): void => {
    messages.push(...result.messages);
    written.push(...result.written);
    removed.push(...result.removed);
  };
  const stopped = (): OperationEnvelope<"init"> => ({ ...empty("init", "cancelled", null), payload, messages, written, removed });
  payload.map = await runMap({ kind: "map", root, ...(request.label !== undefined ? { label: request.label } : {}) }, stage("map"));
  collect(payload.map);
  if (payload.map.status === "cancelled" || context.signal?.aborted) return stopped();
  payload.baseline = await runBaseline({ kind: "baseline", root, check: false }, stage("baseline"));
  collect(payload.baseline);
  if (payload.baseline.status === "cancelled" || context.signal?.aborted) return stopped();
  payload.agents = await runAgents({ kind: "agents", root, harnesses: request.harnesses, check: false }, stage("agents"));
  collect(payload.agents);
  if (payload.agents.status === "cancelled") return stopped();
  const code = [gitignoreCode(payload.gitignore), payload.map.exitCode, payload.baseline.exitCode, payload.agents.exitCode].find((exit) => exit !== 0) ?? 0;
  return { ...empty("init", code === 0 ? "completed" : "failed", code), payload, messages, written, removed };
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
export async function runWire(request: WireRequest, context: OperationContext): Promise<OperationEnvelope<"wire">> {
  if (!isAbsolute(request.root)) return empty("wire", "failed", 2, "wire: root must be an absolute path");
  const out = request.out ?? WIRE_OUT;
  const problem = wireOutProblem(request.root, out);
  if (problem !== null) return empty("wire", "failed", 2, problem);
  if (context.signal?.aborted) return empty("wire", "cancelled", null);
  context.onProgress?.({ text: "reading the specs and the sources" });
  let analyzed: Analysis;
  let specs: WireSpecInputs;
  try {
    // Read before the analysis: a spec changed in between is then refused at the commit, never missed.
    specs = wireSpecInputs(loadConfig(request.root));
    analyzed = await (context.analyze ?? analyze)({ root: request.root, withoutEvidence: true, persistFacts: false });
  } catch (error) {
    return empty("wire", "failed", 2, errorText(error));
  }
  if (context.signal?.aborted) return empty("wire", "cancelled", null);
  const snapshot = analyzed.snapshot;
  if (!snapshot) return empty("wire", "failed", 2, "wire: no supported source files; run `keylang init`");
  const payload: WirePayload = { file: out, check: request.check, state: "stale", diagnostics: [], written: false, refused: [], error: null, snapshot: snapshot.snapshotId };
  const lines = (texts: string[]): OperationMessage[] => texts.map((text) => ({ level: "info" as const, text }));
  const blocking = wiringErrors(analyzed);
  if (blocking.length > 0) {
    payload.state = "blocked";
    payload.diagnostics = blocking;
    return { ...empty("wire", "completed", 1), payload, messages: [...lines(blocking.map(formatDiagnostic)), { level: "error", text: `wire: ${blocking.length} error(s) in wiring; nothing written` }] };
  }
  const wires = analyzed.spec.wires;
  if (wires.length === 0) return { ...empty("wire", "failed", 2, `wire: no \`# wiring\` section under ${analyzed.config.dir}/`), payload };
  let text: string;
  let current: string | null;
  try {
    text = generateWire({ root: request.root, out, wires, snapshot });
    const abs = landing(join(request.root, out));
    current = abs === null ? null : existingText(abs);
  } catch (error) {
    return { ...empty("wire", "failed", 2, errorText(error)), payload };
  }
  if (current !== null && !current.startsWith(WIRE_MARKER)) {
    payload.state = "manual";
    return { ...empty("wire", "completed", 1), payload, messages: lines([`${out}: manual file without keylang:generated marker`]) };
  }
  // A checkout that turned LF into CRLF holds the same file.
  if (current !== null && current.replace(/\r\n/g, "\n") === text) payload.state = "current";
  if (request.check) return { ...empty("wire", "completed", payload.state === "current" ? 0 : 1), payload, messages: lines(payload.state === "current" ? [] : [`${out}: stale, run \`keylang wire\``]) };
  if (payload.state === "current") return { ...empty("wire", "completed", 0), payload };
  const inputs = sourceInputs(analyzed.config, snapshot.manifest.files);
  context.onProgress?.({ text: "waiting to write" });
  try {
    await context.beforeCommit?.();
  } catch (error) {
    return { ...empty("wire", "failed", 2, errorText(error)), payload };
  }
  if (context.signal?.aborted) return { ...empty("wire", "cancelled", null), payload };
  let problems: string[];
  try {
    const target = writeProblem(request.root, out, { generated: true, expect: current });
    // The target is a source file too (its own layer); its change is the expect check's to name.
    const sources = sourceInputProblems(analyzed.config, inputs, "the wiring").filter((line) => !line.startsWith(`${out}: `));
    problems = [...(target === null ? [] : [`${out}: ${target}`]), ...wireSpecProblems(analyzed.config, specs), ...sources];
  } catch (error) {
    return { ...empty("wire", "failed", 2, errorText(error)), payload };
  }
  if (problems.length > 0) {
    payload.refused = problems;
    return {
      ...empty("wire", "failed", 1),
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
    payload.error = errorText(error);
    return { ...empty("wire", "failed", 2), payload, messages: [{ level: "error", text: `${out}: ${payload.error}` }] };
  }
  payload.written = true;
  return { ...empty("wire", "completed", 0), payload, messages: lines([`${out}: written`]), written: [out] };
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
    return `wire: --out ${out}: ${errorText(error)}`;
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
