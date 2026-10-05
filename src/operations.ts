// Shared workspace operations (ADR 0008): transport-independent orchestration
// of the application-level actions. The CLI and the TUI call the same
// interface: a typed request with an explicit absolute root, a typed result
// with a domain payload. This module never imports a transport, reads the
// working directory, or writes stdout/stderr. One operation variant at a
// time: each feature ticket adds its own, not every handler in advance.

import { closeSync, existsSync, openSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, posix, relative, resolve } from "node:path";
import { contextForIds, contextText } from "./agent-context.ts";
import { analyze, within, type Analysis, type AnalysisRequest } from "./analyze.ts";
import { baselinePlanProblems, commitBaseline, planBaseline, type BaselinePlan } from "./baseline.ts";
import { C4_FORMATS, C4_LEVELS, isC4Diagram, renderC4, type C4Format, type C4Level } from "./c4-export.ts";
import { filterChanged } from "./changed.ts";
import { checkReportText, type CheckFormat, type CheckReportData } from "./check-format.ts";
import { checkExitCode, checkReport, type CheckResult } from "./check-results.ts";
import { CONFIG_FILE, assertFormatOnly, configToJson, guessLayout, loadConfig, parseConfig, resolveStatic, toPosix, type Config, type StaticMode } from "./config.ts";
import { formatDiagnostic, isError, type Diagnostic } from "./diag.ts";
import { edgeExplanationLines, edgeIdKnown, explainEdge, type EdgeExplanation } from "./explain-edge.ts";
import { briefRequest, briefText, currentBaseline, explainedIds, explanationRequest, isStale, moveHint, oldExplanations, readExplanation, type BriefBatch, type Explanation } from "./explain-llm.ts";
import { cliVersion, probeAgentClis, resolveAgent, selectedAgent, type AgentCliProbe, type AgentSource } from "./agent-cli.ts";
import { briefPlan, briefPlanText, defaultBriefJobs, staleInventory, staleInventoryText, type BriefPlan, type PlannedBriefEntry, type StaleInventory } from "./explain-inventory.ts";
import { formatSummary, summarizeNode, type NodeSummary } from "./explain-node.ts";
import { codeExplanation, isDiagnosticCode, nodeExplanation, offlineExplanationText, savedAnswer, savedAnswerMiss, savedAnswerText, unknownIdMessage, type AnswerMiss, type ExplainLink, type OfflineExplanation, type SavedAnswer } from "./explain-offline.ts";
import { explainDir, explanationOf, explanationPath, formatStoredExplanation, isStoredExplanation, loadBriefs, SYSTEM_ID, systemBaseline, type ExplanationDetail } from "./explanations.ts";
import { collectMdFiles } from "./files.ts";
import { formatSource } from "./fmt.ts";
import { sectionNodes, walk, type Document } from "./ir.ts";
import { parse } from "./parser.ts";
import { parseReportText, type ParseFormat } from "./parse-format.ts";
import { FACT_CACHE_FILE } from "./fact-cache.ts";
import { codeProposalProblem, PROPOSALS_DIR, proposalProblem, proposalWriteProblem, writeProposal, type ProposalBasis } from "./proposals.ts";
import { fileDiffText, plannedCodeTarget, specToCode, specToCodeText, type CodeCandidate, type FileCandidate } from "./spec-to-code.ts";
import type { Verdict } from "./verdict.ts";
import { changedFlows, codeToSpec, draftFlow, draftRules, withFlow, withRules, type FlowDraft } from "./draft.ts";
import { featureStatus, idsIn, type FeatureBase, type FeatureReport, type Gap, type Hint } from "./feature-status.ts";
import { agentsPlanProblems, commitAgents, planAgents, type AgentsPlan, type HarnessCategory, type HarnessChoice, type HarnessName, type HarnessStep } from "./harness.ts";
import type { Stats } from "./graph.ts";
import type { LlmClient, LlmClientOptions, LlmSetup } from "./llm.ts";
import type { DraftStatus } from "./draft-llm.ts";
import { addDrafts, STATS_FILE, updateStats } from "./stats.ts";
import { commitMap, diffMap, EXPLAINED_MAP_DIR, mapPlanProblems, planMap, sourceInputProblems, sourceInputs, type CommittedStep, type MapPlan, type SourceInputs } from "./map.ts";
import { stronglyConnected } from "./scc.ts";
import { landing, safeWrite, writeAtomic, writeProblem } from "./safe-write.ts";
import { sha256, type CoverageItem } from "./snapshot.ts";
import { compareText } from "./span.ts";
import type { ModuleStatus } from "./voice-local.ts";
import type { VoiceEngine } from "./voice.ts";
import { changedPathSet, deletedModuleIds, gitChangedFiles, gitChangedLines, readFeatureBase, type ChangedFiles } from "./git-changes.ts";
import { generateWire, WIRE_MARKER } from "./wire-gen.ts";
import { tracePlan, tracePlanText, type TracePlan } from "./trace-plan.ts";

/** The known operations. `doctor` is the first; new kinds arrive with their feature. */
export interface DoctorRequest {
  kind: "doctor";
  /** Repository root (absolute): where keylang.json and the specs live. */
  root: string;
}

/** «Ask the model for questions» on the feature readiness screen (c4-zoom/11): a proposal of `- ? …` lines for the feature file. */
export interface FeatureQuestionsRequest {
  kind: "feature-questions";
  /** Repository root (absolute). */
  root: string;
  /** The feature: `<dir>/features/<slug>.md`. */
  slug: string;
}

/** Whether a feature file is done, on the saved state of the repository (tools.md `feature`). */
export interface FeatureRequest {
  kind: "feature";
  /** Repository root (absolute). */
  root: string;
  /** The feature: `<dir>/features/<slug>.md`. */
  slug: string;
  /** Base commit the plan is compared with; default `HEAD`. An explicit one that cannot be read fails with code 2. */
  since?: string;
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

/**
 * Parses spec files into the Text IR (`keylang parse [--json] <paths…>`).
 * Read-only: nothing is analyzed and nothing is written; of keylang.json only
 * the edition is read. A saved explanation is skipped and named.
 */
export interface ParseRequest {
  kind: "parse";
  /** Repository root (absolute): its keylang.json tells the edition. */
  root: string;
  /** Files and directories as the caller names them: absolute, or relative to `base`; at least one. */
  paths: string[];
  /** Where relative `paths` start (absolute); default the root. The CLI passes its working directory. */
  base?: string;
  /** How the caller shows the documents: `payload.text` is the CLI's stdout in it. */
  format: ParseFormat;
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
 * `keylang explain <code|id>` without `--llm`: the help of a diagnostic code
 * (`K001`, any case; nothing is read), or the offline summary of a node on a
 * fresh analysis of the saved code and specs with the explanations saved for
 * it. Read-only and offline: no model, no write, not even the fact cache.
 */
export interface ExplainRequest {
  kind: "explain";
  /** Repository root (absolute). */
  root: string;
  /** A diagnostic code or an ID. */
  subject: string;
  /** Which saved answer is shown (`--full`, `--brief`); default `explain.detail` of keylang.json. */
  detail?: ExplanationDetail;
}

/**
 * `keylang explain <id> --llm [--full|--brief]`: one node's explanation by
 * the configured model. A fresh saved answer of the same detail and language
 * is read instead of asking (no request, no write); without a usable model
 * the offline summary and the saved answer are shown, as the CLI does. A new
 * answer is saved to `<dir>/explain/<id>.md` (a brief to `brief/<id>.md`)
 * only after the commit check. The language and the agent come from
 * keylang.json (`explain.lang`, `agent`); the request names neither.
 */
export interface ExplainLlmRequest {
  kind: "explain-llm";
  /** Repository root (absolute). */
  root: string;
  /** A node of the snapshot or a declared `planned` ID; a diagnostic code is the offline `explain`. */
  id: string;
  /** `--full`, `--brief`; default `explain.detail` of keylang.json. */
  detail?: ExplanationDetail;
}

/**
 * What explanations need work, read-only and offline: `stale-saved` is
 * `explain --stale` (saved answers and briefs that are stale or gone);
 * `briefs` is the plan of a brief batch (`explain --missing|--stale` without
 * `--llm`), `estimate` its `--dry-run` size. No model, no write, not even the fact cache.
 */
export type ExplainPlanRequest =
  | { kind: "explain-plan"; root: string; list: "stale-saved" }
  | {
      kind: "explain-plan";
      /** Repository root (absolute). */
      root: string;
      list: "briefs";
      /** `missing` also plans stale briefs; `stale` plans only them. */
      batch: BriefBatch;
      /** `--limit`: a whole number of at least 1; absent for every candidate. */
      limit?: number;
      /** `--jobs` of the batch it plans: a whole number of at least 1; default 4, 2 for an agent CLI. */
      jobs?: number;
      /** `--dry-run`: count the plan and estimate its tokens. */
      estimate?: boolean;
    };

/**
 * `keylang explain --missing|--stale --llm [--limit N] [--jobs N]`: a brief
 * for each node of the plan, bottom-up, by the configured model. The plan is
 * made again on a fresh analysis of the saved files (a preview is never
 * applied): `briefPlan`, cut to `limit`. Within a wave at most `jobs`
 * requests are in flight; a parent's prompt carries the briefs its members
 * got in earlier waves. Each brief is written on its own as soon as it is
 * answered, after the commit check: its file must still hold the bytes the
 * plan read. That keylang.json, the sources and the specs are the ones the
 * plan was made from is checked once per wave — before it asks (from the
 * second wave on) and before its first write — not before every brief. The
 * dry run is `explain-plan` with `estimate`.
 */
export interface ExplainBatchRequest {
  kind: "explain-batch";
  /** Repository root (absolute). */
  root: string;
  /** `missing` also asks again for stale briefs; `stale` only for them. */
  batch: BriefBatch;
  /** `--limit`: a whole number of at least 1; absent for every candidate. */
  limit?: number;
  /** `--jobs`: requests in flight within a wave, a whole number of at least 1; default 4, 2 for an agent CLI. */
  jobs?: number;
}

/**
 * The typed result an export writes: a finished check report in one of the
 * CLI's formats, or the lines of an explained edge (the CLI has only its
 * human output), the documents of a parse in a view, or a trace plan (JSON only, as the CLI prints it).
 */
export type ExportSource =
  | { kind: "check"; format: CheckFormat; report: CheckReportData }
  | { kind: "explain-edge"; lines: string[] }
  | { kind: "parse"; format: ParseFormat; documents: Document[] }
  | { kind: "trace-plan"; plan: TracePlan };

/** The formats an export writes: the check formats and the parse views. */
export type ExportFormat = CheckFormat | ParseFormat;

/**
 * The functions of one flow a trace adapter instruments (`keylang trace-plan
 * <flow>`), on a fresh snapshot of the saved code and specs. Read-only: it
 * writes nothing, not even the fact cache, and runs no test or program.
 */
export interface TracePlanRequest {
  kind: "trace-plan";
  /** Repository root (absolute). */
  root: string;
  /** The flow's name, as its `# flow <name>` heading declares it. */
  flow: string;
}

/**
 * A flow drafted for a trigger (`keylang draft flow <trigger> --mode
 * algo|llm|hybrid`): `algo` is only what the snapshot's call edges show;
 * `llm` and `hybrid` ask the configured model and judge its answer against
 * those edges (`draftFlowWithModel`: agree, llm-only, conflict; hybrid adds
 * the steps the model missed). Without a model `hybrid` drafts as `algo`
 * with a visible note and `llm` fails. `preview`
 * computes the candidate and writes nothing (`--print`: no proposal, no
 * stats, not the target); `proposal` writes the target's full proposed text
 * to `.keylang/proposals/<target>`. The target itself is never written: MERGE
 * applies a proposal.
 */
export interface DraftFlowRequest {
  kind: "draft-flow";
  /** Repository root (absolute). */
  root: string;
  /** A fn of the snapshot. */
  trigger: string;
  /** The flow's name; default the trigger's last segment. */
  name?: string;
  /** The target spec, relative to the root, POSIX; default `<dir>/flows/<name>.md`. */
  into?: string;
  output: "preview" | "proposal";
  /** Default `algo`: no model. */
  mode?: "algo" | "llm" | "hybrid";
  /**
   * What the developer chose to show the model (the TUI's context pack), as
   * text taken when the draft started; a model mode only.
   */
  context?: string;
  /**
   * A proposal already waiting for the target when the draft starts:
   * `replace` overwrites it (the CLI's policy), `refuse` writes nothing (the
   * TUI: a pending proposal is never covered by a new one). Default `refuse`.
   * Either way a proposal that appears or changes during the work is kept.
   */
  pending?: "refuse" | "replace";
}

/**
 * Rules drafted for the repository (`keylang draft rules --mode
 * algo|llm|hybrid`): `algo` is what the code keeps now (`draftRules`: a
 * `layers` order or `deny` pairs, `no-cycles` without a module cycle); `llm`
 * and `hybrid` ask the configured model and check each of its rules alone
 * against the snapshot (`draftRulesWithModel`: agree, conflict with the
 * finding that refutes it, llm-only; hybrid adds the algo rules it missed).
 * Without a model `hybrid` drafts as `algo` with a visible note and `llm`
 * fails. `preview` writes nothing; `proposal` writes the target's full text
 * (`withRules`: its prose and other sections kept) to
 * `.keylang/proposals/<target>`. The target itself is never written.
 */
export interface DraftRulesRequest {
  kind: "draft-rules";
  /** Repository root (absolute). */
  root: string;
  /** The target spec, relative to the root, POSIX; default `<dir>/rules.md`. */
  into?: string;
  output: "preview" | "proposal";
  /** Default `algo`: no model. */
  mode?: "algo" | "llm" | "hybrid";
  /** As in `DraftFlowRequest`: `replace` is the CLI's policy, `refuse` (default) the TUI's. */
  pending?: "refuse" | "replace";
}

/**
 * Flows drafted from code (`keylang code-to-spec <path[:line]> | --since
 * <ref> [--mode algo|llm|hybrid]`). The source is a code position or a git
 * change, never both. A position: with a line, the innermost fn holding
 * it; without one, every exported fn of the file in declaration order
 * (`codeToSpec`); the spec is named after that fn, or the file's module. A
 * change (`changedFlows`): each fn whose lines changed in the working tree
 * since the ref, or that lives in a file git does not track yet; a fn a
 * hand-written flow already names is reported (`described`), not drafted
 * again; the spec is `changes`. No changed fn left is a success that writes
 * nothing. `algo` drafts each fn from the snapshot's calls; `llm` and
 * `hybrid` ask the configured model once per flow (`draftFlowWithModel`),
 * and without a model `hybrid` drafts as algo with a visible note while
 * `llm` fails. `preview` writes nothing (`--print`: the target is not even
 * read for it to work); `proposal` writes the target's full text, every
 * flow merged into it by `withFlow`, to `.keylang/proposals/<target>`. The
 * target is never written.
 */
export type CodeToSpecRequest = {
  kind: "code-to-spec";
  /** Repository root (absolute). */
  root: string;
  /** The target spec, relative to the root, POSIX; default `<dir>/flows/<name>.md`. */
  into?: string;
  output: "preview" | "proposal";
  /** Default `algo`: no model. */
  mode?: "algo" | "llm" | "hybrid";
  /** As in `DraftFlowRequest`: what the developer chose to show the model, taken when the draft started; a model mode only. */
  context?: string;
  /** As in `DraftFlowRequest`: `replace` is the CLI's policy, `refuse` (default) the TUI's. */
  pending?: "refuse" | "replace";
} & CodeToSpecSource;

/** Where code-to-spec drafts from: a code position or a git change, never both. */
export type CodeToSpecSource =
  | {
      /** The source file, relative to the root, POSIX. */
      file: string;
      /** A 1-based line of the file; absent: every exported fn. */
      line?: number;
      since?: undefined;
    }
  | {
      /** A git ref: the fns changed in the working tree since it (`HEAD`: the uncommitted ones), untracked files whole. */
      since: string;
      file?: undefined;
      line?: undefined;
    };

/**
 * `keylang spec-to-code <id> [--into] [--mode algo|llm] [--print]`: for the
 * planned fn `id`, in the file of its module, a stub with its declared
 * signature (`algo`) or the model's function (`llm`), and for each `test`
 * its flows name in a file that does not exist yet a failing node:test
 * file (`algo`) or the model's test (`llm`) (`specToCode`). The candidate
 * is analyzed as the code it would be. `preview` writes nothing;
 * `proposal` writes each file's full text to `.keylang/proposals/<file>`,
 * never the file itself — MERGE applies each on its own.
 */
export interface SpecToCodeRequest {
  kind: "spec-to-code";
  /** Repository root (absolute). */
  root: string;
  /** The planned fn. */
  id: string;
  /** The code file, relative to the root, POSIX; default the module's file. */
  into?: string;
  output: "preview" | "proposal";
  /** A proposal already waiting for one of the files: `replace` is the CLI's policy, `refuse` (default) the TUI's. */
  pending?: "refuse" | "replace";
  /** Default `algo`: the template, no model. `llm` needs the configured model (no hybrid: there is no contract for mixing a stub with the model's body). */
  mode?: "algo" | "llm";
}

/**
 * Applies a whole spec-to-code candidate (`keylang spec-to-code <id>
 * --apply`): every file of it is written with its proposed text, directly —
 * no proposal. The candidate is the one a spec-to-code run reported (preview
 * or proposal, template or model): nothing is computed again. Before the
 * first write every file must still hold the text the candidate was built
 * from, and `keylang.json`, the sources and the specs must be the ones it
 * read; a file a code proposal may not change stops it. Each file is
 * written atomically in turn; there is no rollback, so a failure part way
 * names what was written and what was not.
 */
export interface ApplyCodeRequest {
  kind: "apply-code";
  /** Repository root (absolute). */
  root: string;
  /** The candidate exactly as spec-to-code reported it. */
  candidate: SpecToCodeCandidate;
  /** Who built it (spec-to-code's mode); only how the result is named. */
  mode?: "algo" | "llm";
  /**
   * A proposal waiting for one of the files: `refuse` (default, the TUI's —
   * merge it instead) or `keep` (the CLI's `--apply`: the file is written,
   * the proposal stays). A waiting proposal is never removed.
   */
  pending?: "refuse" | "keep";
}

/**
 * The layer layout drafted for `keylang.json` (`keylang draft map --mode
 * algo|llm|hybrid`): `algo` is the layout keylang would guess from the
 * directories (`guessLayout`), `llm` and `hybrid` ask the configured model,
 * whose layers pass the validation of a written `keylang.json`. Without a
 * model `hybrid` drafts as `algo` with a visible note and `llm` fails. It
 * writes nothing, ever: no proposal (the proposal store holds specs, not
 * JSON), not keylang.json. Moving the layers into the config is the
 * caller's explicit edit of its buffer.
 */
export interface DraftLayoutRequest {
  kind: "draft-layout";
  /** Repository root (absolute). */
  root: string;
  /** Default `algo`: no model. */
  mode?: "algo" | "llm" | "hybrid";
}

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
 * `keylang export c4` (c4-zoom/12): a C4 diagram of the saved code, as text
 * or written to `out`. `format` and `level` come as typed and are checked
 * here, so the CLI and the TUI refuse the same values with the same message.
 */
export interface ExportC4Request {
  kind: "export-c4";
  /** Repository root (absolute). */
  root: string;
  /** `plantuml` or `mermaid`. */
  format: string;
  /** `component` or `container`. */
  level: string;
  /** `component` only: the one layer to draw. */
  layer?: string;
  /** The file to write, relative to the root; left out, the diagram is only the result. */
  out?: string;
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

export type OperationRequest = DoctorRequest | FeatureRequest | FeatureQuestionsRequest | ExportC4Request | MapCheckRequest | MapRequest | BaselineRequest | AgentsRequest | FmtRequest | WireRequest | CheckRequest | ExplainEdgeRequest | ExplainRequest | ExplainLlmRequest | ExplainPlanRequest | ExplainBatchRequest | InitRequest | ExportRequest | ParseRequest | TracePlanRequest | DraftFlowRequest | DraftRulesRequest | DraftLayoutRequest | CodeToSpecRequest | SpecToCodeRequest | ApplyCodeRequest;

/** The operation kinds that write files: they compute first and commit after `beforeCommit` (a check mode never calls it). */
export const WRITING_KINDS: ReadonlySet<OperationRequest["kind"]> = new Set(["feature-questions", "export-c4", "map", "baseline", "agents", "fmt", "wire", "init", "export", "draft-flow", "draft-rules", "code-to-spec", "spec-to-code", "apply-code", "explain-llm", "explain-batch"]);

/** What an operation may use besides its request. No UI state, no shell. */
export interface OperationContext {
  /** Cancellation: the caller reports `cancelled`, never a success. */
  signal?: AbortSignal;
  /** Progress notes. Presentation only; never a source of domain data. */
  onProgress?: (progress: OperationProgress) => void;
  /**
   * The analysis to run on the saved files; default `analyze`. A session
   * passes its own, which builds the snapshot off the UI thread.
   */
  analyze?: (request: AnalysisRequest) => Promise<Analysis>;
  /**
   * A writing operation calls this once, after everything is computed and
   * before its first file step; nothing is written before it resolves. A
   * session defers its analysis and conflicting saves from here on; a signal
   * aborted by then cancels the operation with nothing written. The answer
   * may refuse the write with reasons (draft-flow reads it: failed, code 1,
   * nothing written).
   */
  beforeCommit?: (plan?: CommitPlan) => Promise<CommitGate> | CommitGate;
}

/** A progress note; a batch adds the step it just finished (`[done/total] id` on the CLI's stderr). */
export interface OperationProgress {
  text: string;
  step?: BatchStep;
}

/** One node of a batch finished: written, or failed with the reason. */
export interface BatchStep {
  /** Nodes finished so far, this one included. */
  done: number;
  /** Nodes in the plan. */
  total: number;
  id: string;
  /** The reason the node failed, or null when its brief was written. */
  failed: string | null;
}

/** What a commit is about to write, when the operation names it before it asks (a draft: its target, whose proposal it writes). */
export interface CommitPlan {
  /** The files whose proposals are written (specs, or spec-to-code's code and tests), or the files apply-code writes; relative to the root, POSIX. */
  targets: string[];
}

/** The caller's answer before a commit: nothing (go ahead) or the reasons the files must stay as they are. */
export type CommitGate = void | { refused: string[] };

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
  /**
   * The effective agent, where it came from (`KEYLANG_AGENT`, agents.json or
   * keylang.json), and the state of its credentials or its CLI binary, never
   * the key value.
   */
  agent: { configured: string | null; source: AgentSource | null; state: "ok" | "missing" | "error"; detail: string };
  /** The agent CLI presets on this machine and their versions (`--version` only). */
  agentClis: AgentCliProbe[];
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

/** The questions a model proposed for a feature file (c4-zoom/11). */
export interface FeatureQuestionsPayload {
  /** `<dir>/features/<slug>.md`, relative to the root. */
  file: string;
  /** The model that answered. */
  agent: string;
  /** The `- ? …` lines proposed, in the order the model wrote them; at most five. */
  questions: string[];
  /** Lines of the answer that were no `- ? …` question, or past the fifth: left out. */
  dropped: number;
  /** The proposal written, or null (nothing to propose, or nothing written). */
  proposal: string | null;
}

/** A C4 diagram (c4-zoom/12): its text and, with `--out`, the file it went to. */
export interface ExportC4Payload {
  text: string;
  format: C4Format;
  level: C4Level;
  layer: string | null;
  /** The file written, relative to the root and POSIX; null when only printed (or refused). */
  out: string | null;
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

/** What `keylang parse` read: the documents in path order, the skipped and unreadable files. */
export interface ParsePayload {
  format: ParseFormat;
  /** The Text IR of each file, named as the paths name it; offsets count UTF-16 code units. */
  documents: Document[];
  /** Saved explanations, as the paths name them: the model's text, not parsed. */
  skipped: string[];
  /** Files that could not be read: each is parsed as empty text, as the CLI always did. */
  unreadable: string[];
  /** The diagnostics of every document, in document order. */
  diagnostics: Diagnostic[];
  /** The CLI's stdout for `format`, byte for byte. */
  text: string;
}

/** The plan `keylang trace-plan` prints, and what it leaves out. */
export interface TracePlanPayload {
  /** Exactly the adapters' input: schemaVersion, snapshotId, flow, symbols sorted by ID with the file hashes. */
  plan: TracePlan;
  /** The flow's trigger and step IDs that are no function of the snapshot: never instrumented, never evidence. */
  omitted: string[];
  /** The CLI's stdout, byte for byte. */
  text: string;
}

/**
 * One drafted flow and what it makes of its target: the typed candidate a
 * preview shows and a proposal writes. `before` and `pending` are the files
 * it was built from — the expected state of a later write.
 */
export interface FlowCandidate {
  trigger: string;
  name: string;
  /** IDs of the steps, trigger first. */
  steps: string[];
  /** The `# flow` section alone: what `draft flow --print` writes. */
  flow: string;
  /** The target spec, relative to the root, POSIX. */
  target: string;
  /** Why the target cannot take a proposal, or null; with a problem the target is not read. */
  problem: string | null;
  /** The target on disk the candidate was built from (null: no file). */
  before: string | null;
  /** The proposal already waiting for the target then (null: none). */
  pending: string | null;
  /** The target's full proposed text: its other sections kept, a section of the same flow replaced. Null with a problem. */
  text: string | null;
}

/** What `keylang draft flow` drafted, and the proposal it wrote. */
export interface DraftFlowPayload {
  output: "preview" | "proposal";
  /** The mode that drafted it: `algo` also for a hybrid without a model (see `fallback`). */
  mode: "algo" | "llm" | "hybrid";
  candidate: FlowCandidate;
  /** `3 step(s)` for algo, `2 agree, 1 llm-only` for a model draft, as the CLI names the draft. */
  summary: string;
  /** The model's draft beyond its text; null for algo. Its statuses are provenance, never evidence. */
  model: DraftModelInfo | null;
  /** A hybrid without a model: why, as the CLI says it before it drafts from the snapshot only. */
  fallback: string | null;
  /** The model's counts could not go to `.keylang/stats.json`: why. The proposal stays written. */
  statsError: string | null;
  /** The proposal file written (`.keylang/proposals/<target>`), or null. */
  proposal: string | null;
  /** Why nothing was written: a pending proposal, or a target or proposal changed during the work. */
  refused: string[];
  /** The write failed with this error. */
  error: string | null;
}

/**
 * The drafted rules and what they make of their target, as `FlowCandidate`:
 * `before` and `pending` are the expected state of a later write.
 */
export interface RulesCandidate {
  /** The drafted `# rules` section alone: what `draft rules --print` writes. */
  rules: string;
  /** The target spec, relative to the root, POSIX. */
  target: string;
  /** Why the target cannot take a proposal, or null; with a problem the target is not read. */
  problem: string | null;
  /** The target on disk the candidate was built from (null: no file). */
  before: string | null;
  /** The proposal already waiting for the target then (null: none). */
  pending: string | null;
  /** The target's full proposed text (`withRules`): its prose and other sections kept, a rule it has not repeated. Null with a problem. */
  text: string | null;
}

/** What `keylang draft rules` drafted, and the proposal it wrote. */
export interface DraftRulesPayload {
  output: "preview" | "proposal";
  /** The mode that drafted it: `algo` also for a hybrid without a model (see `fallback`). */
  mode: "algo" | "llm" | "hybrid";
  candidate: RulesCandidate;
  /** The snapshot has a module cycle: the algo rules have no `no-cycles`. */
  cyclic: boolean;
  /** `2 rule(s)` for algo, `1 agree, 1 conflict, 2 algo-only` for a model draft. */
  summary: string;
  /** The model's draft beyond its text; null for algo. Its statuses are the draft's, never a verdict of the workspace. */
  model: RulesModelInfo | null;
  /** A hybrid without a model: why, as the CLI says it before it drafts from the snapshot only. */
  fallback: string | null;
  /** The model's counts could not go to `.keylang/stats.json`: why. The proposal stays written. */
  statsError: string | null;
  /** The proposal file written (`.keylang/proposals/<target>`), or null. */
  proposal: string | null;
  /** Why nothing was written: a pending proposal, or a target, proposal or input changed during the work. */
  refused: string[];
  /** The write failed with this error. */
  error: string | null;
}

/** One flow of a code-to-spec draft: its trigger, name, steps and section. */
export interface CodeFlow {
  trigger: string;
  name: string;
  /** IDs of the steps, trigger first. */
  steps: string[];
  /** The `# flow` section alone. */
  flow: string;
}

/**
 * The flows drafted from a code position and what they make of their
 * target, as `FlowCandidate`: `before` and `pending` are the expected state
 * of a later write.
 */
export interface CodeToSpecCandidate {
  /** The source file, relative to the root, POSIX; null for a git change. */
  file: string | null;
  line: number | null;
  /** The git ref of a change, or null for a code position. */
  since: string | null;
  /** The spec's name: the fn's with a line, the file's module's without, `changes` for a git change. */
  name: string;
  /** In the order `code-to-spec` drafts them. */
  flows: CodeFlow[];
  /** The flow sections joined: what `code-to-spec --print` writes. */
  print: string;
  /** The target spec, relative to the root, POSIX. */
  target: string;
  /** Why the target cannot take a proposal (or be read), or null; with a problem the target is not read. */
  problem: string | null;
  /** The target on disk the candidate was built from (null: no file). */
  before: string | null;
  /** The proposal already waiting for the target then (null: none). */
  pending: string | null;
  /** The target's full proposed text: each flow merged by `withFlow`, the other sections kept. Null with a problem. */
  text: string | null;
}

/** What `keylang code-to-spec` drafted, and the proposal it wrote. */
export interface CodeToSpecPayload {
  output: "preview" | "proposal";
  /** The mode that drafted it: `algo` also for a hybrid without a model (see `fallback`). */
  mode: "algo" | "llm" | "hybrid";
  /** The git ref of a change, or null for a code position. */
  since: string | null;
  /** A git change: the changed fns a hand-written flow already names — reported for review, not drafted again. */
  described: string[];
  /** Null only for a git change with no fn left to draft: nothing proposed, no target. */
  candidate: CodeToSpecCandidate | null;
  /** `2 flow(s), 5 step(s)` for algo, `2 flow(s), 3 agree, 1 llm-only` for a model draft; `nothing to draft` without a candidate. */
  summary: string;
  /** The model's drafts beyond their text; null for algo. Its statuses are provenance, never evidence. */
  model: CodeModelInfo | null;
  /** A hybrid without a model: why, as the CLI says it before it drafts from the snapshot only. */
  fallback: string | null;
  /** The model's counts could not go to `.keylang/stats.json`: why. The proposal stays written. */
  statsError: string | null;
  /** The proposal file written (`.keylang/proposals/<target>`), or null. */
  proposal: string | null;
  /** Why nothing was written: a pending proposal, or a target, proposal or input changed during the work. */
  refused: string[];
  /** The write failed with this error. */
  error: string | null;
}

/** Who drafted the flows of a code-to-spec, and what each of its answers adds to its text. */
export interface CodeModelInfo {
  agent: string;
  /** Summed over the flows. */
  counts: Record<DraftStatus, number>;
  /** One per flow, in the candidate's order. */
  flows: { name: string; rounds: number; unknown: string[]; dropped: string[] }[];
}

/** One file of a spec-to-code candidate, as its proposal would replace it. */
export interface CodeProposalTarget {
  /** `code`: the planned fn's file; `test`: a new e2e test file of its flows. */
  role: "code" | "test";
  /** Relative to the root, POSIX. */
  file: string;
  /** The file on disk the candidate was built from (null: no file). */
  before: string | null;
  /** The file's full proposed text. */
  after: string;
  /** The proposal already waiting for the file then (null: none). */
  pending: string | null;
  /** The file and its `-`/`+` lines, as `spec-to-code --print` shows it. */
  diff: string;
}

/** What spec-to-code builds for a planned fn: every file it proposes, and what `check` would say with them in place. */
export interface SpecToCodeCandidate {
  id: string;
  /** The code file first, then the new test files in path order. */
  targets: CodeProposalTarget[];
  /** `test` entries left to the person, each with the reason. */
  testNotes: string[];
  /** The candidate's own findings — what `check` would add with it in place: a preview, never the workspace's verdict. */
  verdicts: Verdict[];
  diagnostics: Diagnostic[];
  /** What `spec-to-code <id> --print` writes on stdout. */
  print: string;
  /** The inputs it was built from: applying it later checks they are still so. */
  basis: CandidateBasis;
}

/** What a spec-to-code candidate was read from: `keylang.json`, the snapshot's sources, the hand-written specs. */
export interface CandidateBasis extends SourceInputs {
  /** Each hand-written spec of the analysis with the hash of its text then (null: unreadable). */
  specs: { path: string; sha256: string | null }[];
}

/** One file of an applied candidate and what happened to it. */
export interface AppliedFile {
  role: "code" | "test";
  /** Relative to the root, POSIX. */
  file: string;
  state: "completed" | "failed" | "not-attempted";
  error?: string;
}

/** What `spec-to-code --apply` wrote of a candidate. */
export interface ApplyCodePayload {
  id: string;
  /** Every file of the candidate in its order; all `not-attempted` when it was refused. */
  files: AppliedFile[];
  /** Why nothing was written: a file, a waiting proposal or an input changed, or the session refused. */
  refused: string[];
  /** The write that failed part way, with its error. */
  error: string | null;
}

/** The model behind an `llm` spec-to-code candidate. */
export interface SpecCodeModelInfo {
  agent: string;
  /** One for the code, one per new test file. */
  requests: number;
}

/** What `keylang spec-to-code` built, and the proposals it wrote. */
export interface SpecToCodePayload {
  output: "preview" | "proposal";
  mode: "algo" | "llm";
  candidate: SpecToCodeCandidate;
  /** Who wrote the code and the tests of an `llm` candidate; null for the template. Provenance only: the candidate is reviewed in MERGE, never accepted for it. */
  model: SpecCodeModelInfo | null;
  /** `code src/a.ts + 1 test file(s)`. */
  summary: string;
  /** The proposal files written (`.keylang/proposals/<file>`), in the candidate's order; on a failure part way, the ones written before it. */
  proposals: string[];
  /** Why nothing was written: a pending proposal, or a file, proposal or input changed during the work. */
  refused: string[];
  /** A write failed with this error. */
  error: string | null;
}

/** What `keylang draft map` drafted: the layers, and the config the CLI prints with them. */
export interface DraftLayoutPayload {
  /** The mode that drafted it: `algo` also for a hybrid without a model (see `fallback`). */
  mode: "algo" | "llm" | "hybrid";
  /** Layer name → globs, in the order drafted; valid as `layers` of keylang.json. */
  layers: Record<string, string[]>;
  /** What `draft map` prints: the saved (or inferred) config as `init` writes it, with these layers. Never written. */
  preview: string;
  /** keylang.json existed when the layout was drafted. */
  configExists: boolean;
  /** The model that proposed the layers; null for algo. */
  agent: string | null;
  /** A hybrid without a model: why, as the CLI says it before it drafts from the snapshot only. */
  fallback: string | null;
}

/** Who proposed the rules and how each compares with the code now. */
export interface RulesModelInfo {
  agent: string;
  counts: Record<DraftStatus, number>;
  /** Each `conflict` rule with the finding that refutes it: `rule → file:line: code message`. */
  conflicts: string[];
}

/** What the model's draft adds to its text: who drafted it, how its steps compare with the snapshot, what it left out. */
export interface DraftModelInfo {
  agent: string;
  counts: Record<DraftStatus, number>;
  /** IDs still unknown after the second round (K001 after a merge unless declared planned). */
  unknown: string[];
  rounds: number;
  /** Items of the answer left out: `- line: why`. */
  dropped: string[];
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

/** An offline explanation (`explain-offline.ts`) with the snapshot it was read on and the CLI's stdout of it. */
export type ExplainPayload = OfflineExplanation & {
  /** The snapshot of a node's analysis; null for a code (nothing is analysed) or a repository without sources. */
  snapshotId: string | null;
  /** The CLI's stdout; presentation of the same result. */
  text: string;
};

/**
 * What `explain <id> --llm` showed and saved. `source`: `cache` — a fresh
 * saved answer of the same detail and language, read; `model` — a new
 * answer, saved (or refused, failed, with `previous` kept); `offline` — no
 * model could be asked (`unavailable`), the summary and the saved answer.
 */
export interface ExplainLlmPayload {
  id: string;
  summary: NodeSummary;
  detail: ExplanationDetail;
  /** `explain.lang` of keylang.json. */
  lang: string;
  /** `agent` of keylang.json; null when none is configured. */
  agent: string | null;
  source: "cache" | "model" | "offline";
  /** Why the saved answer did not do (`savedAnswerMiss`); null when it did (cache). */
  reason: AnswerMiss | null;
  /** Why no model could be asked (the CLI's note), or null. */
  unavailable: string | null;
  /** The saved answer of this detail before the run, judged against the run's analysis; kept unless `written`. */
  previous: SavedAnswer | null;
  /** The answer shown: the cached one, the new one (written or not), or the saved one offline; null offline without one. */
  answer: SavedAnswer | null;
  /** The file written, relative to the root; null when nothing was written. */
  written: string | null;
  /** Why the new answer was not written: its file, keylang.json, a source or a spec changed while the model answered, or the session refused. */
  refused: string[];
  /** The model's or the write's error, or null. */
  error: string | null;
  links: ExplainLink[];
  snapshotId: string | null;
  /** The CLI's stdout (empty when it prints none: a failure). */
  text: string;
}

/** What explanations need work (`explain-inventory.ts`), on the snapshot it was read on, with the CLI's stdout of it. */
export type ExplainPlanPayload = (({ list: "stale-saved" } & StaleInventory) | ({ list: "briefs" } & BriefPlan)) & {
  snapshotId: string | null;
  /** The CLI's stdout; presentation of the same result. */
  text: string;
};

/**
 * What a brief batch planned, wrote and left. `stopped`: null — the batch
 * ran to the end of its plan (failed nodes are named, code 1); `cancelled`
 * — Cancel, no new request was started and the ones in flight were closed;
 * `outdated` — keylang.json, a source or a spec changed while it ran (or the
 * sources could not be read again), found at a wave's check, so no further
 * brief was written or asked for (`refused` names the changes);
 * `refused` — the session refused the commit (`refused`). Briefs written
 * before the stop stay: there is no rollback.
 */
export interface ExplainBatchPayload {
  batch: BriefBatch;
  limit: number | null;
  jobs: number;
  /** The agent that answered (keylang.json `agent`). */
  agent: string;
  /** `explain.lang` of keylang.json. */
  lang: string;
  /** The plan the batch made on its own analysis, in the order it asks. */
  plan: PlannedBriefEntry[];
  /** Briefs written, in the order they landed; `file` relative to the root. */
  done: { id: string; file: string }[];
  /** Nodes whose request or write failed, by id: the other nodes went on. */
  failed: { id: string; reason: string }[];
  /** Planned nodes neither written nor failed: not started after the stop, or closed in flight; in plan order. */
  notStarted: string[];
  stopped: "cancelled" | "outdated" | "refused" | null;
  /** The changed inputs (`outdated`) or the session's reasons (`refused`). */
  refused: string[];
  snapshotId: string | null;
  /** The CLI's stdout: `explained N of M node(s)` and a `failed: <id>: <reason>` line each. */
  text: string;
}

/** What an export did with its one file. */
export interface ExportPayload {
  path: string;
  /** The format written (an explained edge is always `human`). */
  format: ExportFormat;
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
  "feature-questions": FeatureQuestionsPayload;
  "export-c4": ExportC4Payload;
  "map-check": MapCheckPayload;
  map: MapPayload;
  baseline: BaselinePayload;
  agents: AgentsPayload;
  fmt: FmtPayload;
  wire: WirePayload;
  check: CheckPayload;
  "explain-edge": ExplainEdgePayload;
  explain: ExplainPayload;
  "explain-llm": ExplainLlmPayload;
  "explain-plan": ExplainPlanPayload;
  "explain-batch": ExplainBatchPayload;
  init: InitPayload;
  export: ExportPayload;
  parse: ParsePayload;
  "trace-plan": TracePlanPayload;
  "draft-flow": DraftFlowPayload;
  "draft-rules": DraftRulesPayload;
  "draft-layout": DraftLayoutPayload;
  "code-to-spec": CodeToSpecPayload;
  "spec-to-code": SpecToCodePayload;
  "apply-code": ApplyCodePayload;
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
export function runOperation(request: ExplainRequest, context?: OperationContext): Promise<OperationEnvelope<"explain">>;
export function runOperation(request: ExplainLlmRequest, context?: OperationContext): Promise<OperationEnvelope<"explain-llm">>;
export function runOperation(request: ExplainPlanRequest, context?: OperationContext): Promise<OperationEnvelope<"explain-plan">>;
export function runOperation(request: ExplainBatchRequest, context?: OperationContext): Promise<OperationEnvelope<"explain-batch">>;
export function runOperation(request: InitRequest, context?: OperationContext): Promise<OperationEnvelope<"init">>;
export function runOperation(request: ExportRequest, context?: OperationContext): Promise<OperationEnvelope<"export">>;
export function runOperation(request: ParseRequest, context?: OperationContext): Promise<OperationEnvelope<"parse">>;
export function runOperation(request: TracePlanRequest, context?: OperationContext): Promise<OperationEnvelope<"trace-plan">>;
export function runOperation(request: DraftFlowRequest, context?: OperationContext): Promise<OperationEnvelope<"draft-flow">>;
export function runOperation(request: DraftRulesRequest, context?: OperationContext): Promise<OperationEnvelope<"draft-rules">>;
export function runOperation(request: DraftLayoutRequest, context?: OperationContext): Promise<OperationEnvelope<"draft-layout">>;
export function runOperation(request: CodeToSpecRequest, context?: OperationContext): Promise<OperationEnvelope<"code-to-spec">>;
export function runOperation(request: SpecToCodeRequest, context?: OperationContext): Promise<OperationEnvelope<"spec-to-code">>;
export function runOperation(request: ApplyCodeRequest, context?: OperationContext): Promise<OperationEnvelope<"apply-code">>;
export function runOperation(request: FeatureQuestionsRequest, context?: OperationContext): Promise<OperationEnvelope<"feature-questions">>;
export function runOperation(request: ExportC4Request, context?: OperationContext): Promise<OperationEnvelope<"export-c4">>;
export function runOperation(request: OperationRequest, context?: OperationContext): Promise<OperationResult>;
export async function runOperation(request: OperationRequest, context: OperationContext = {}): Promise<OperationResult> {
  switch (request.kind) {
    case "doctor":
      return runDoctor(request, context);
    case "feature":
      return runFeature(request, context);
    case "feature-questions":
      return runFeatureQuestions(request, context);
    case "export-c4":
      return runExportC4(request, context);
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
    case "explain":
      return runExplain(request, context);
    case "explain-llm":
      return runExplainLlm(request, context);
    case "explain-plan":
      return runExplainPlan(request, context);
    case "explain-batch":
      return runExplainBatch(request, context);
    case "init":
      return runInit(request, context);
    case "export":
      return runExport(request, context);
    case "parse":
      return runParse(request, context);
    case "trace-plan":
      return runTracePlan(request, context);
    case "draft-flow":
      return runDraftFlow(request, context);
    case "draft-rules":
      return runDraftRules(request, context);
    case "draft-layout":
      return runDraftLayout(request, context);
    case "code-to-spec":
      return runCodeToSpec(request, context);
    case "spec-to-code":
      return runSpecToCode(request, context);
    case "apply-code":
      return runApplyCode(request, context);
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
    case "feature-questions":
      return { kind, ...base };
    case "export-c4":
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
    case "explain":
      return { kind, ...base };
    case "explain-llm":
      return { kind, ...base };
    case "explain-plan":
      return { kind, ...base };
    case "explain-batch":
      return { kind, ...base };
    case "init":
      return { kind, ...base };
    case "export":
      return { kind, ...base };
    case "parse":
      return { kind, ...base };
    case "trace-plan":
      return { kind, ...base };
    case "draft-flow":
      return { kind, ...base };
    case "draft-rules":
      return { kind, ...base };
    case "draft-layout":
      return { kind, ...base };
    case "code-to-spec":
      return { kind, ...base };
    case "spec-to-code":
      return { kind, ...base };
    case "apply-code":
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

function emptyExplain(status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string): OperationEnvelope<"explain"> {
  return { kind: "explain", status, exitCode, payload: null, messages: error === undefined ? [] : [{ level: "error", text: error }], written: [], removed: [], proposals: [] };
}

/**
 * `keylang explain <code|id>` offline. A code needs no analysis: its help, or
 * failed 2 `unknown code`. An ID is read on a fresh analysis of the saved code
 * and specs (no evidence, no fact cache written): the summary with the saved
 * answer and brief, or failed 2 with the CLI's `unknown id … (did you mean …)`.
 * A store of keylang 0.1 is a warning note, which the CLI prints to stderr.
 * Code 0 with a payload. Nothing is written and no model is asked.
 */
async function runExplain(request: ExplainRequest, context: OperationContext): Promise<OperationEnvelope<"explain">> {
  if (!isAbsolute(request.root)) return emptyExplain("failed", 2, "explain: root must be an absolute path");
  const subject = request.subject;
  if (subject === "") return emptyExplain("failed", 2, "explain: a code or an id is required");
  if (context.signal?.aborted) return emptyExplain("cancelled", null);
  if (isDiagnosticCode(subject)) {
    const found = codeExplanation(subject);
    if (found === null) return emptyExplain("failed", 2, `unknown code \`${subject}\``);
    const payload: ExplainPayload = { ...found, snapshotId: null, text: offlineExplanationText(found) };
    return { ...emptyExplain("completed", 0), payload, messages: [{ level: "info", text: `${found.code}: offline help` }] };
  }
  context.onProgress?.({ text: "reading the saved code and specs" });
  const analyzeSaved = context.analyze ?? analyze;
  let analyzed: Analysis;
  try {
    analyzed = await analyzeSaved({ root: request.root, withoutEvidence: true });
  } catch (error) {
    return emptyExplain("failed", 2, messageOf(error));
  }
  if (context.signal?.aborted) return emptyExplain("cancelled", null);
  const old = oldExplanations(analyzed.config.root);
  const notes: OperationMessage[] = old > 0 ? [{ level: "warning", text: `note: ${moveHint(analyzed.config, old)}` }] : [];
  const found = nodeExplanation(analyzed, subject, request.detail ?? analyzed.config.explain.detail);
  if ("unknown" in found) {
    const failed = emptyExplain("failed", 2);
    return { ...failed, messages: [...notes, { level: "error", text: unknownIdMessage(subject, found.suggestion) }] };
  }
  const payload: ExplainPayload = { ...found, snapshotId: analyzed.snapshot?.snapshotId ?? null, text: offlineExplanationText(found) };
  const answer = found.saved === null ? "no saved answer" : `saved answer ${found.saved.fresh ? "fresh" : "stale"}`;
  return { ...emptyExplain("completed", 0), payload, messages: [...notes, { level: "info", text: `${found.summary.kind} ${found.id}: ${answer}` }] };
}

function emptyExplainLlm(status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string): OperationEnvelope<"explain-llm"> {
  return { kind: "explain-llm", status, exitCode, payload: null, messages: error === undefined ? [] : [{ level: "error", text: error }], written: [], removed: [], proposals: [] };
}

/**
 * `keylang explain <id> --llm`. The analysis of the saved files (no
 * evidence, nothing persisted); an unknown ID is 2 with the CLI's message.
 * A fresh saved answer of the same detail and language is the result (0),
 * nothing asked or written. No usable model: the offline summary and the
 * saved answer with the CLI's note (0), nothing asked. Otherwise the inputs
 * are fixed — keylang.json, the sources, the specs and the saved file's
 * bytes — and the model is asked once (a brief is cut by `briefText`). A
 * Cancel during the answer is cancelled; a timeout, an empty answer or a
 * provider error is 2; both keep the saved file. After `beforeCommit`
 * (which may refuse: 1) the inputs and the saved file must still be the
 * ones read (else 1, nothing written); then the file is written atomically
 * (0; 2 on an I/O error). The map is never written here: the explained map
 * follows the next `keylang map`.
 */
async function runExplainLlm(request: ExplainLlmRequest, context: OperationContext): Promise<OperationEnvelope<"explain-llm">> {
  const { root, id } = request;
  if (!isAbsolute(root)) return emptyExplainLlm("failed", 2, "explain: root must be an absolute path");
  if (id === "") return emptyExplainLlm("failed", 2, "explain: a code or an id is required");
  if (isDiagnosticCode(id)) return emptyExplainLlm("failed", 2, `explain --llm: \`${id}\` is a diagnostic code: its help is offline (explain ${id})`);
  if (context.signal?.aborted) return emptyExplainLlm("cancelled", null);
  context.onProgress?.({ text: "reading the saved code and specs" });
  let analyzed: Analysis;
  try {
    analyzed = await (context.analyze ?? analyze)({ root, withoutEvidence: true });
  } catch (error) {
    return emptyExplainLlm("failed", 2, messageOf(error));
  }
  if (context.signal?.aborted) return emptyExplainLlm("cancelled", null);
  const config = analyzed.config;
  const old = oldExplanations(config.root);
  const notes: OperationMessage[] = old > 0 ? [{ level: "warning", text: `note: ${moveHint(config, old)}` }] : [];
  const detail = request.detail ?? config.explain.detail;
  const found = nodeExplanation(analyzed, id, detail);
  if ("unknown" in found) return { ...emptyExplainLlm("failed", 2), messages: [...notes, { level: "error", text: unknownIdMessage(id, found.suggestion) }] };
  const { lang } = config.explain;
  const file = explanationPath(config, id, detail);
  // The saved file as read: the commit writes only over these bytes.
  const savedBytes = readTextOrNull(resolve(root, file));
  const saved = readExplanation(config, id, detail);
  const previous = saved === null ? null : savedAnswer(analyzed, id, saved);
  const reason = savedAnswerMiss(analyzed, id, saved, lang, detail);
  const payload: ExplainLlmPayload = {
    id,
    summary: found.summary,
    detail,
    lang,
    agent: selectedAgent(config.agent),
    source: "cache",
    reason,
    unavailable: null,
    previous,
    answer: previous,
    written: null,
    refused: [],
    error: null,
    links: found.links,
    snapshotId: analyzed.snapshot?.snapshotId ?? null,
    text: "",
  };
  const what = `${found.summary.kind} ${id}`;
  if (reason === null && previous !== null) {
    payload.text = savedAnswerText(previous);
    return { ...emptyExplainLlm("completed", 0), payload, messages: [...notes, { level: "info", text: `${what}: the saved ${detail} answer is fresh; read, no request` }] };
  }
  const { answeringAgent, llmClient, LlmCancelled } = await import("./llm.ts");
  const setup = llmClient(config.agent, { root: config.root });
  if ("missing" in setup) {
    payload.source = "offline";
    payload.unavailable = setup.missing;
    payload.text = `${formatSummary(found.summary)}\n${previous === null ? "" : `\n${savedAnswerText(previous)}`}`;
    return { ...emptyExplainLlm("completed", 0), payload, messages: [...notes, { level: "warning", text: `${setup.missing}; showing what the snapshot says` }] };
  }
  const client = setup.client;
  payload.source = "model";
  payload.answer = null;
  // What the answer is computed from: a commit checks these are still the files on disk.
  const inputs = sourceInputs(config, analyzed.snapshot?.manifest.files ?? []);
  const specs = specHashes(root, analyzed.docs);
  const failed = (exitCode: 1 | 2, messages: OperationMessage[]): OperationEnvelope<"explain-llm"> => ({ ...emptyExplainLlm("failed", exitCode), payload, messages: [...notes, ...messages] });
  context.onProgress?.({ text: `asking ${client.agent}` });
  let answer: string;
  let reported: string | null = null;
  try {
    answer = await client.complete(explanationRequest(analyzed, found.summary, { lang, detail, briefs: loadBriefs(config) }), { ...(context.signal ? { signal: context.signal } : {}), onModel: (model) => (reported = model) });
  } catch (error) {
    if (error instanceof LlmCancelled || context.signal?.aborted) return emptyExplainLlm("cancelled", null);
    payload.error = messageOf(error);
    return failed(2, [{ level: "error", text: payload.error }]);
  }
  if (context.signal?.aborted) return emptyExplainLlm("cancelled", null);
  const text = detail === "brief" ? briefText(answer) : answer.trim();
  if (text === "") {
    payload.error = `${client.agent} answered without text; nothing written`;
    return failed(2, [{ level: "error", text: payload.error }]);
  }
  const e: Explanation = { agent: answeringAgent(client, reported), date: new Date().toISOString().slice(0, 10), closure: currentBaseline(analyzed, id) ?? "", lang, detail, text };
  payload.answer = savedAnswer(analyzed, id, e);
  const keep = { level: "info" as const, text: previous === null ? "nothing was written" : `nothing was written; ${file} keeps the saved answer` };
  context.onProgress?.({ text: "waiting to write" });
  let gate: CommitGate;
  try {
    gate = await context.beforeCommit?.({ targets: [file] });
  } catch (error) {
    payload.error = messageOf(error);
    return failed(2, [{ level: "error", text: payload.error }]);
  }
  if (context.signal?.aborted) return { ...emptyExplainLlm("cancelled", null), payload };
  const refuse = (reasons: string[]): OperationEnvelope<"explain-llm"> => {
    payload.refused = reasons;
    return failed(1, [...reasons.map((reason) => ({ level: "error" as const, text: reason })), keep]);
  };
  if (gate && gate.refused.length > 0) return refuse(gate.refused);
  let problems: string[];
  try {
    const target = writeProblem(root, file, { under: explainDir(config), expect: savedBytes });
    problems = [...(target === null ? [] : [`${file}: ${target}`]), ...sourceInputProblems(config, inputs, "the explanation"), ...specProblems(root, specs, "the explanation")];
  } catch (error) {
    payload.error = messageOf(error);
    return failed(2, [{ level: "error", text: payload.error }]);
  }
  if (problems.length > 0) return refuse(problems);
  context.onProgress?.({ text: `writing ${file}` });
  try {
    writeAtomic(landing(resolve(root, file))!, formatStoredExplanation(e));
  } catch (error) {
    payload.error = messageOf(error);
    return failed(2, [{ level: "error", text: payload.error }]);
  }
  payload.written = file;
  payload.text = savedAnswerText(payload.answer);
  return { ...emptyExplainLlm("completed", 0), payload, messages: [...notes, { level: "info", text: `${what}: ${client.agent} wrote the ${detail} answer to ${file}` }], written: [file] };
}

function emptyExplainPlan(status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string): OperationEnvelope<"explain-plan"> {
  return { kind: "explain-plan", status, exitCode, payload: null, messages: error === undefined ? [] : [{ level: "error", text: error }], written: [], removed: [], proposals: [] };
}

/**
 * `explain --stale` and the plan of `explain --missing|--stale` (with
 * `--dry-run` its estimate) on a fresh analysis of the saved code and specs
 * (no evidence, no fact cache written). A brief plan needs a snapshot: failed
 * 2 with the CLI's message without one. An empty plan is completed 0 (zero
 * work). A store of keylang 0.1 is a warning note. No model, nothing written.
 */
async function runExplainPlan(request: ExplainPlanRequest, context: OperationContext): Promise<OperationEnvelope<"explain-plan">> {
  if (!isAbsolute(request.root)) return emptyExplainPlan("failed", 2, "explain: root must be an absolute path");
  if (request.list === "briefs") {
    for (const [flag, value] of [["--limit", request.limit], ["--jobs", request.jobs]] as const) {
      if (value !== undefined && (!Number.isInteger(value) || value < 1)) return emptyExplainPlan("failed", 2, `${flag} must be a positive whole number, got \`${value}\``);
    }
  }
  if (context.signal?.aborted) return emptyExplainPlan("cancelled", null);
  context.onProgress?.({ text: "reading the saved code, specs and explanations" });
  const analyzeSaved = context.analyze ?? analyze;
  let analyzed: Analysis;
  try {
    analyzed = await analyzeSaved({ root: request.root, withoutEvidence: true });
  } catch (error) {
    return emptyExplainPlan("failed", 2, messageOf(error));
  }
  if (context.signal?.aborted) return emptyExplainPlan("cancelled", null);
  const old = oldExplanations(analyzed.config.root);
  const notes: OperationMessage[] = old > 0 ? [{ level: "warning", text: `note: ${moveHint(analyzed.config, old)}` }] : [];
  const snapshotId = analyzed.snapshot?.snapshotId ?? null;
  if (request.list === "stale-saved") {
    const inventory = staleInventory(analyzed);
    const payload: ExplainPlanPayload = { list: "stale-saved", ...inventory, snapshotId, text: staleInventoryText(inventory) };
    const stale = inventory.entries.filter((entry) => entry.state === "stale").length;
    return { ...emptyExplainPlan("completed", 0), payload, messages: [...notes, { level: "info", text: `${stale} stale, ${inventory.entries.length - stale} gone of ${inventory.saved} saved explanation(s)` }] };
  }
  if (!analyzed.snapshot) return { ...emptyExplainPlan("failed", 2), messages: [...notes, { level: "error", text: "no snapshot: explain --missing needs a repository with sources" }] };
  const plan = briefPlan(analyzed, { batch: request.batch, limit: request.limit ?? null, jobs: request.jobs ?? defaultBriefJobs(selectedAgent(analyzed.config.agent)), estimate: request.estimate === true });
  const payload: ExplainPlanPayload = { list: "briefs", ...plan, snapshotId, text: briefPlanText(plan) };
  const summary = plan.plan.length === 0 ? "nothing to explain" : `${plan.plan.length} brief(s) planned${plan.estimate === null ? "" : `, ~${plan.estimate.input} in, ~${plan.estimate.output} out (approximate)`}`;
  return { ...emptyExplainPlan("completed", 0), payload, messages: [...notes, { level: "info", text: summary }] };
}

function emptyExplainBatch(status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string): OperationEnvelope<"explain-batch"> {
  return { kind: "explain-batch", status, exitCode, payload: null, messages: error === undefined ? [] : [{ level: "error", text: error }], written: [], removed: [], proposals: [] };
}

/** `explained 5 of 6 node(s)` and `failed: <id>: <reason>` lines: the CLI's stdout of a batch. */
function explainBatchText(payload: Pick<ExplainBatchPayload, "done" | "failed" | "plan">): string {
  return `explained ${payload.done.length} of ${payload.plan.length} node(s)\n${payload.failed.map((f) => `failed: ${f.id}: ${f.reason}\n`).join("")}`;
}

/**
 * `explain --missing|--stale --llm`. Compute: limit and jobs as the CLI
 * checks them (2), a fresh analysis of the saved files (no snapshot is 2
 * with the CLI's message), the plan (`briefPlan`; empty is `nothing to
 * explain`, 0, no model needed), the model (none is 2). The inputs are
 * fixed: keylang.json, the sources, the specs and the bytes of every planned
 * brief file. Then the waves: at most `jobs` requests at a time within one;
 * a failure of a node (the model's error, an empty answer, its brief file
 * changed, a write error) is named and the others go on. `beforeCommit` is
 * asked once, before the first write; after it Cancel closes the requests in
 * flight and starts none, and what was written stays. A changed input stops
 * the batch: no brief is written or asked for after it is found — the
 * inputs are checked before each wave asks (from the second on) and before
 * its first write; within a wave a write checks only its own file, so a
 * change after a wave's first write is found before the next wave. The
 * briefs written before the stop stay. Ran to the end: 0,
 * or 1 with failed nodes (the CLI's batch exception: a failed write of one
 * brief is 1 too); stopped by a change or a refusal: 1; cancelled: null.
 */
async function runExplainBatch(request: ExplainBatchRequest, context: OperationContext): Promise<OperationEnvelope<"explain-batch">> {
  const { root } = request;
  if (!isAbsolute(root)) return emptyExplainBatch("failed", 2, "explain: root must be an absolute path");
  for (const [flag, value] of [["--limit", request.limit], ["--jobs", request.jobs]] as const) {
    if (value !== undefined && (!Number.isInteger(value) || value < 1)) return emptyExplainBatch("failed", 2, `${flag} must be a positive whole number, got \`${value}\``);
  }
  if (context.signal?.aborted) return emptyExplainBatch("cancelled", null);
  context.onProgress?.({ text: "reading the saved code, specs and briefs" });
  let analyzed: Analysis;
  try {
    analyzed = await (context.analyze ?? analyze)({ root, withoutEvidence: true });
  } catch (error) {
    return emptyExplainBatch("failed", 2, messageOf(error));
  }
  if (context.signal?.aborted) return emptyExplainBatch("cancelled", null);
  const config = analyzed.config;
  const old = oldExplanations(config.root);
  const notes: OperationMessage[] = old > 0 ? [{ level: "warning", text: `note: ${moveHint(config, old)}` }] : [];
  if (!analyzed.snapshot) return { ...emptyExplainBatch("failed", 2), messages: [...notes, { level: "error", text: "no snapshot: explain --missing needs a repository with sources" }] };
  const jobs = request.jobs ?? defaultBriefJobs(selectedAgent(config.agent));
  const { plan } = briefPlan(analyzed, { batch: request.batch, limit: request.limit ?? null, jobs, estimate: false });
  const { lang } = config.explain;
  const payload: ExplainBatchPayload = {
    batch: request.batch,
    limit: request.limit ?? null,
    jobs,
    agent: selectedAgent(config.agent) ?? "",
    lang,
    plan,
    done: [],
    failed: [],
    notStarted: [],
    stopped: null,
    refused: [],
    snapshotId: analyzed.snapshot.snapshotId,
    text: "",
  };
  if (plan.length === 0) {
    payload.text = "nothing to explain\n";
    return { ...emptyExplainBatch("completed", 0), payload, messages: [...notes, { level: "info", text: "nothing to explain: zero work, no request" }] };
  }
  const { answeringAgent, llmClient, LlmCancelled } = await import("./llm.ts");
  const setup = llmClient(config.agent, { root: config.root });
  if ("missing" in setup) return { ...emptyExplainBatch("failed", 2), messages: [...notes, { level: "error", text: setup.missing }] };
  const client = setup.client;
  payload.agent = client.agent;
  // What every brief is computed from. Checking them reads and hashes every source again, so it
  // runs once per wave, not before each brief; each write still checks its own file (`expect`).
  const inputs = sourceInputs(config, analyzed.snapshot.manifest.files);
  const specs = specHashes(root, analyzed.docs);
  /** How keylang.json, the sources and the specs differ from the ones the plan read; a tree that cannot be read again is a reason too. */
  const inputsChanged = (): string[] => {
    try {
      return [...sourceInputProblems(config, inputs, "the batch"), ...specProblems(root, specs, "the batch")];
    } catch (error) {
      return [`the sources could not be read again: ${messageOf(error)}`];
    }
  };
  const files = new Map(plan.map((entry) => [entry.id, explanationPath(config, entry.id, "brief")]));
  const expected = new Map([...files.values()].map((file) => [file, readTextOrNull(resolve(root, file))]));
  const briefs = loadBriefs(config);
  // Stops the requests in flight when the batch stops for a change or a refusal; Cancel is the caller's signal.
  const halt = new AbortController();
  const signal = context.signal ? AbortSignal.any([context.signal, halt.signal]) : halt.signal;
  const cancelled = (): boolean => context.signal?.aborted === true;
  const stop = (why: "cancelled" | "outdated" | "refused", reasons: string[] = []): void => {
    if (payload.stopped !== null) return;
    payload.stopped = why;
    payload.refused = reasons;
    halt.abort();
  };
  const notStarted = new Set<string>();
  const written: string[] = [];
  let gate: Promise<CommitGate> | null = null;
  /** The wave whose inputs were found unchanged before its first write. */
  let checkedWave: number | null = null;
  let finished = 0;
  const finish = (id: string, failed: string | null): void => {
    if (failed !== null) payload.failed.push({ id, reason: failed });
    finished++;
    context.onProgress?.({ text: `${finished}/${plan.length} · ${id}${failed === null ? "" : `: failed: ${failed}`}`, step: { done: finished, total: plan.length, id, failed } });
  };
  /** The brief of one node of `wave`: asked, checked, written; a stop leaves it not started. */
  const one = async (id: string, wave: number): Promise<void> => {
    if (cancelled()) stop("cancelled");
    if (payload.stopped !== null) return void notStarted.add(id);
    const request = briefRequest(analyzed, id, lang, briefs);
    if (request === null) return finish(id, "the id is gone from the snapshot");
    let answer: string;
    let reported: string | null = null;
    try {
      answer = await client.complete(request, { signal, onModel: (model) => (reported = model) });
    } catch (error) {
      if (cancelled()) stop("cancelled");
      if (error instanceof LlmCancelled || signal.aborted) return void notStarted.add(id);
      return finish(id, messageOf(error));
    }
    if (cancelled()) stop("cancelled");
    if (payload.stopped !== null) return void notStarted.add(id);
    const text = briefText(answer);
    if (text === "") return finish(id, `${client.agent} answered without text; nothing written`);
    // Asked once, before the first write: from here on the session defers its own writes and Cancel stops between briefs.
    gate ??= Promise.resolve()
      .then(() => context.beforeCommit?.({ targets: [...files.values()] }))
      .catch((error: unknown) => ({ refused: [messageOf(error)] }));
    const answered = await gate;
    if (cancelled()) stop("cancelled");
    if (answered && answered.refused.length > 0) stop("refused", answered.refused);
    if (payload.stopped !== null) return void notStarted.add(id);
    // The wave's first write checks the inputs (synchronously: no other brief writes in between).
    if (checkedWave !== wave) {
      const changed = inputsChanged();
      if (changed.length > 0) {
        stop("outdated", changed);
        return void notStarted.add(id);
      }
      checkedWave = wave;
    }
    const file = files.get(id)!;
    let target: string | null;
    try {
      target = writeProblem(root, file, { under: explainDir(config), expect: expected.get(file) ?? null });
    } catch (error) {
      return finish(id, messageOf(error));
    }
    if (target !== null) return finish(id, `${file}: ${target}`);
    // The repository's baseline reads the layer briefs this batch just wrote.
    const closure = id === SYSTEM_ID ? systemBaseline(analyzed.snapshot!, briefs) : (currentBaseline(analyzed, id) ?? "");
    const e: Explanation = { agent: answeringAgent(client, reported), date: new Date().toISOString().slice(0, 10), closure, lang, detail: "brief", text };
    try {
      writeAtomic(landing(resolve(root, file))!, formatStoredExplanation(e));
    } catch (error) {
      return finish(id, messageOf(error));
    }
    // A parent asked later reads this brief in its members.
    briefs.set(id, e);
    payload.done.push({ id, file });
    written.push(file);
    finish(id, null);
  };
  context.onProgress?.({ text: `asking ${client.agent}: ${plan.length} brief(s), ${jobs} at a time` });
  const waves = [...new Set(plan.map((entry) => entry.wave))];
  for (const [index, wave] of waves.entries()) {
    // From the second wave on, the inputs are checked before it asks: a change made during the last wave costs no request.
    if (index > 0 && payload.stopped === null && !cancelled()) {
      const changed = inputsChanged();
      if (changed.length > 0) stop("outdated", changed);
    }
    const queue = plan.filter((entry) => entry.wave === wave).map((entry) => entry.id);
    const workers = Array.from({ length: Math.min(jobs, queue.length) }, async () => {
      for (let id = queue.shift(); id !== undefined; id = queue.shift()) await one(id, wave);
    });
    await Promise.all(workers);
  }
  payload.failed.sort((a, b) => compareText(a.id, b.id));
  payload.notStarted = plan.map((entry) => entry.id).filter((id) => notStarted.has(id));
  payload.text = explainBatchText(payload);
  const counts = `${payload.done.length} of ${plan.length} brief(s) written${payload.failed.length > 0 ? `, ${payload.failed.length} failed` : ""}${payload.notStarted.length > 0 ? `, ${payload.notStarted.length} not started` : ""}`;
  const failures = payload.failed.map((f) => ({ level: "error" as const, text: `${f.id}: ${f.reason}` }));
  const result = (status: OperationStatus, exitCode: 0 | 1 | null, messages: OperationMessage[]): OperationEnvelope<"explain-batch"> => ({ ...emptyExplainBatch(status, exitCode), payload, messages: [...notes, ...messages], written });
  if (payload.stopped === "cancelled") return result("cancelled", null, [...failures, { level: "info", text: `cancelled: ${counts}; the written briefs stay` }]);
  if (payload.stopped !== null) {
    const why = payload.stopped === "outdated" ? "the inputs changed while the batch ran: no further brief was asked for or written" : "the session refused the write";
    return result("failed", 1, [...payload.refused.map((text) => ({ level: "error" as const, text })), ...failures, { level: "info", text: `${why}; ${counts}; the written briefs stay` }]);
  }
  return result("completed", payload.failed.length > 0 ? 1 : 0, [...failures, { level: "info", text: counts }]);
}

function emptyExport(status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string): OperationEnvelope<"export"> {
  return { kind: "export", status, exitCode, payload: null, messages: error === undefined ? [] : [{ level: "error", text: error }], written: [], removed: [], proposals: [] };
}

/** The format of an export: an explained edge has only the human lines, a trace plan only its JSON. */
export function exportFormatOf(source: ExportSource): ExportFormat {
  return source.kind === "explain-edge" ? "human" : source.kind === "trace-plan" ? "json" : source.format;
}

/** The bytes an export writes: the CLI's stdout for the same report. */
export function exportText(source: ExportSource): string {
  if (source.kind === "check") return checkReportText(source.format, source.report);
  if (source.kind === "parse") return parseReportText(source.format, source.documents);
  if (source.kind === "trace-plan") return tracePlanText(source.plan);
  return source.lines.map((line) => `${line}\n`).join("");
}

/**
 * Why `path` cannot receive an export, or null: the write policy of every
 * repository write (plain, relative, inside through links, no directory, no
 * file with a generation marker) and the artifacts generators own — the map,
 * the explained map, the index, the fact cache and the proposals — even
 * before they exist. `dir` is the spec directory of the caller's loaded
 * config (`Config.dir`); left out, the one the saved keylang.json names.
 * Reads only; a form may call it as the path is typed.
 */
export function exportTargetProblem(root: string, path: string, dir: string = savedSpecDir(root)): string | null {
  const problem = writeProblem(root, path);
  if (problem !== null) return problem;
  const target = landing(join(root, path));
  if (target === null) return "leads through a loop of links";
  const rel = toPosix(relative(realpathSync(root), target));
  // `posix.join`: a spec directory `.` owns `map/`, not `./map/`.
  const owned = [posix.join(dir, "map"), posix.join(dir, EXPLAINED_MAP_DIR), PROPOSALS_DIR].map((prefix) => `${prefix}/`);
  if (rel === ".keylang/index.json" || rel === FACT_CACHE_FILE || owned.some((prefix) => rel.startsWith(prefix))) return "a generated artifact: only its generator writes it";
  return null;
}

/**
 * The spec directory of the saved keylang.json as `loadConfig` reads it — the
 * same parser, so `./keylang` and `keylang/` are `keylang` — and `keylang`
 * without the file or with one that does not validate (as the TUI's own).
 */
function savedSpecDir(root: string): string {
  const file = join(root, CONFIG_FILE);
  try {
    return parseConfig(file, readFileSync(file, "utf8")).dir ?? "keylang";
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
    format: exportFormatOf(request.source),
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

function emptyParse(status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string): OperationEnvelope<"parse"> {
  return { kind: "parse", status, exitCode, payload: null, messages: error === undefined ? [] : [{ level: "error", text: error }], written: [], removed: [], proposals: [] };
}

/**
 * `keylang parse`: every Markdown file under the paths, in their order, into
 * the Text IR. The parser alone runs — no snapshot of the code, no rules.
 * Messages: a `warning` note per skipped explanation, then each diagnostic
 * by its severity — all of which the CLI prints to stderr. Code 1 when a diagnostic is
 * an error, else 0; 2 for a missing path or an edition this keylang cannot
 * read, with no payload.
 */
async function runParse(request: ParseRequest, context: OperationContext): Promise<OperationEnvelope<"parse">> {
  if (!isAbsolute(request.root)) return emptyParse("failed", 2, "parse: root must be an absolute path");
  const base = request.base ?? request.root;
  if (!isAbsolute(base)) return emptyParse("failed", 2, "parse: base must be an absolute path");
  if (request.paths.length === 0) return emptyParse("failed", 2, "parse: at least one path is required");
  if (context.signal?.aborted) return emptyParse("cancelled", null);
  const documents: Document[] = [];
  const skipped: string[] = [];
  const unreadable: string[] = [];
  const messages: OperationMessage[] = [];
  try {
    // `parse` reads nothing of the config but the edition it asks for.
    const config = join(request.root, CONFIG_FILE);
    if (existsSync(config)) assertFormatOnly(config, readFileSync(config, "utf8"));
    context.onProgress?.({ text: "parsing the files" });
    for (const file of collectMdFiles(request.paths, base)) {
      let text: string;
      try {
        text = readFileSync(resolve(base, file), "utf8");
      } catch {
        unreadable.push(file);
        text = "";
      }
      if (isStoredExplanation(text)) {
        skipped.push(file);
        messages.push({ level: "warning", text: `note: ${file}: a saved explanation, not keylang Markdown; skipped` });
      } else documents.push(parse(file, text));
    }
  } catch (error) {
    return emptyParse("failed", 2, messageOf(error));
  }
  if (context.signal?.aborted) return emptyParse("cancelled", null);
  const diagnostics = documents.flatMap((doc) => doc.diagnostics);
  for (const d of diagnostics) messages.push({ level: isError(d) ? "error" : "warning", text: formatDiagnostic(d) });
  const payload: ParsePayload = { format: request.format, documents, skipped, unreadable, diagnostics, text: parseReportText(request.format, documents) };
  return { ...emptyParse("completed", diagnostics.some(isError) ? 1 : 0), payload, messages };
}

function emptyTracePlan(status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string): OperationEnvelope<"trace-plan"> {
  return { kind: "trace-plan", status, exitCode, payload: null, messages: error === undefined ? [] : [{ level: "error", text: error }], written: [], removed: [], proposals: [] };
}

/**
 * `keylang trace-plan <flow>`: the flow's `trigger` and `step` IDs from the
 * saved specs, then a fresh snapshot of the saved code — never the session's
 * or a cached index. Nothing is written and nothing is run. Code 0 with the
 * plan; 2 with no payload for a missing name, an unknown flow or a broken
 * keylang.json, with the CLI's message.
 */
async function runTracePlan(request: TracePlanRequest, context: OperationContext): Promise<OperationEnvelope<"trace-plan">> {
  if (!isAbsolute(request.root)) return emptyTracePlan("failed", 2, "trace-plan: root must be an absolute path");
  if (request.flow === "") return emptyTracePlan("failed", 2, "trace-plan: a flow name is required");
  if (context.signal?.aborted) return emptyTracePlan("cancelled", null);
  context.onProgress?.({ text: "reading the flow and a fresh snapshot of the saved code" });
  let found: Awaited<ReturnType<typeof tracePlan>>;
  try {
    found = await tracePlan(loadConfig(request.root), request.flow);
  } catch (error) {
    return emptyTracePlan("failed", 2, messageOf(error));
  }
  if (context.signal?.aborted) return emptyTracePlan("cancelled", null);
  const { plan, omitted } = found;
  const payload: TracePlanPayload = { plan, omitted, text: tracePlanText(plan) };
  return { ...emptyTracePlan("completed", 0), payload, messages: [{ level: "info", text: `flow ${plan.flow}: ${plan.symbols.length} function(s) to instrument on snapshot ${plan.snapshotId}` }] };
}

/** The note on a path that holds no specs, as the CLI writes it after `keylang: `. */
function emptyDraftFlow(status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string): OperationEnvelope<"draft-flow"> {
  return { kind: "draft-flow", status, exitCode, payload: null, messages: error === undefined ? [] : [{ level: "error", text: error }], written: [], removed: [], proposals: [] };
}

/**
 * The candidate of `draft` for its target: `into`, else
 * `<specDir>/flows/<name>.md`. A target a proposal may not change is named
 * and not read; otherwise the text on disk and the waiting proposal are read
 * once, here, and `withFlow` keeps the target's other sections. Reads only.
 */
export function flowCandidate(root: string, specDir: string, generated: (path: string) => boolean, draft: FlowDraft, into?: string): FlowCandidate {
  const target = toPosix(into ?? `${specDir}/flows/${draft.name}.md`);
  const base = { trigger: draft.steps[0]!, name: draft.name, steps: draft.steps, flow: draft.text, target };
  const problem = proposalProblem(root, specDir, target, generated);
  if (problem !== null) return { ...base, problem, before: null, pending: null, text: null };
  const store = `${PROPOSALS_DIR}/${target}`;
  const before = existingText(join(root, target));
  // A store that breaks the write policy (a link out) is never read; the write names it.
  const pending = writeProblem(root, store, { under: PROPOSALS_DIR, generated: true }) === null ? existingText(join(root, store)) : null;
  return { ...base, problem: null, before, pending, text: withFlow(before, draft) };
}

/**
 * `keylang draft flow <trigger> [--mode algo|llm|hybrid]`. Compute: the
 * analysis of the saved files (nothing persisted), the trigger must be a fn,
 * then the draft — `draftFlow`, or the model's (`llm`; `hybrid`, which drafts
 * as algo with a note when no model is configured) — then the candidate
 * against the target on disk. A preview ends there (0). A proposal: a target
 * a proposal may not change is 2, as in the CLI; a waiting proposal with
 * `pending: refuse` is 1, nothing written. After `beforeCommit` (which may
 * refuse) the target, the waiting proposal, keylang.json and the sources
 * must still be the ones read (else 1, nothing written); then the full text
 * is written atomically (0; 2 on an I/O error) and a model draft's counts go
 * to the stats. Cancelled — during the model's answer too: null, nothing
 * written, not even the stats.
 */
async function runDraftFlow(request: DraftFlowRequest, context: OperationContext): Promise<OperationEnvelope<"draft-flow">> {
  const { root, trigger } = request;
  const mode = request.mode ?? "algo";
  if (!isAbsolute(root)) return emptyDraftFlow("failed", 2, "draft flow: root must be an absolute path");
  if (trigger === "") return emptyDraftFlow("failed", 2, "draft flow: a trigger id is required");
  if (context.signal?.aborted) return emptyDraftFlow("cancelled", null);
  context.onProgress?.({ text: "reading the sources" });
  let analyzed: Analysis;
  try {
    analyzed = await (context.analyze ?? analyze)({ root, withoutEvidence: true });
  } catch (error) {
    return emptyDraftFlow("failed", 2, messageOf(error));
  }
  if (context.signal?.aborted) return emptyDraftFlow("cancelled", null);
  const snapshot = analyzed.snapshot;
  if (!snapshot) return emptyDraftFlow("failed", 2, "draft: no supported source files; run `keylang init`");
  if (snapshot.nodes[trigger]?.kind !== "fn") {
    const hint = analyzed.index.suggest(trigger);
    return emptyDraftFlow("failed", 2, `draft flow: \`${trigger}\` is not a fn of the snapshot${hint ? ` (did you mean \`${hint}\`?)` : ""}`);
  }
  // What the draft was computed from: a commit checks that keylang.json and the sources are still these.
  const inputs = sourceInputs(analyzed.config, snapshot.manifest.files);
  const algo = draftFlow(snapshot, trigger, request.name !== undefined ? { name: request.name } : {});
  const setup = await modelSetup(mode, analyzed.config);
  if ("error" in setup) return emptyDraftFlow("failed", 2, setup.error);
  const specDir = toPosix(relative(root, resolve(root, analyzed.config.dir)));
  const generated = (path: string): boolean => analyzed.docs.some((doc) => doc.path === path && doc.generated !== null);
  // The target and its waiting proposal as they are now, before the model answers: the basis of the write.
  let basis: FlowCandidate;
  try {
    basis = flowCandidate(root, specDir, generated, algo, request.into);
  } catch (error) {
    return emptyDraftFlow("failed", 2, messageOf(error));
  }
  // A refusal before the model is asked: the payload is the algo candidate, so the target's state stays visible.
  const early = (exitCode: 1 | 2, error: string, refused: string[] = []): OperationEnvelope<"draft-flow"> => ({
    ...emptyDraftFlow("failed", exitCode),
    payload: { output: request.output, mode: setup.client === null ? "algo" : mode, candidate: basis, summary: `${algo.steps.length} step(s)`, model: null, fallback: setup.fallback, statsError: null, proposal: null, refused, error: null },
    messages: [
      ...(setup.fallback === null ? [] : [{ level: "warning" as const, text: setup.fallback }]),
      { level: "error", text: error },
      ...(refused.length > 0 ? [{ level: "info" as const, text: "nothing was written; the target and any proposal waiting for it are kept" }] : []),
    ],
  });
  if (request.output === "proposal") {
    // Checked before the model is asked: a target that cannot take the proposal costs no request.
    const refusal = proposalRefusal(root, basis, request.pending);
    if (refusal !== null) return early(refusal.exitCode, refusal.error, refusal.refused);
  }
  let draft: FlowDraft = algo;
  let model: DraftModelInfo | null = null;
  if (setup.client !== null) {
    const drafted = await modelDraft(request, mode === "llm" ? "llm" : "hybrid", analyzed, setup.client, context);
    if ("cancelled" in drafted) return emptyDraftFlow("cancelled", null);
    if ("error" in drafted) return emptyDraftFlow("failed", 2, drafted.error);
    ({ draft, model } = drafted);
  }
  const candidate: FlowCandidate = model === null ? basis : { ...basis, flow: draft.text, steps: draft.steps, text: basis.problem === null ? withFlow(basis.before, draft) : null };
  const summary = model === null ? `${draft.steps.length} step(s)` : draftCountsText(model.counts);
  const payload: DraftFlowPayload = { output: request.output, mode: model === null ? "algo" : mode, candidate, summary, model, fallback: setup.fallback, statsError: null, proposal: null, refused: [], error: null };
  const notes = draftNotes(payload);
  if (request.output === "preview") {
    return { ...emptyDraftFlow("completed", 0), payload, messages: [...notes, { level: "info", text: `flow \`${draft.name}\` for ${candidate.target} (${payload.summary}); a preview, nothing written` }] };
  }
  const failed = (exitCode: 1 | 2, messages: OperationMessage[]): OperationEnvelope<"draft-flow"> => ({ ...emptyDraftFlow("failed", exitCode), payload, messages: [...notes, ...messages] });
  const refuse = (reasons: string[]): OperationEnvelope<"draft-flow"> => {
    payload.refused = reasons;
    return failed(1, [...reasons.map((text) => ({ level: "error" as const, text })), { level: "info", text: "nothing was written; the target and any proposal waiting for it are kept" }]);
  };
  const committed = await commitProposal({ root, specDir, generated, target: candidate.target, text: candidate.text!, expected: { target: candidate.before, proposal: candidate.pending }, config: analyzed.config, inputs }, context);
  if ("cancelled" in committed) return { ...emptyDraftFlow("cancelled", null), payload };
  if ("refused" in committed) return refuse(committed.refused);
  if ("failed" in committed) {
    if (committed.writing) payload.error = committed.failed;
    return failed(2, [{ level: "error", text: committed.failed }]);
  }
  const store = committed.proposal;
  payload.proposal = store;
  if (model !== null) payload.statsError = countProposed(root, model.counts);
  return {
    ...emptyDraftFlow("completed", 0),
    payload,
    messages: [
      ...notes,
      ...(payload.statsError === null ? [] : [{ level: "warning" as const, text: `${STATS_FILE} not updated: ${payload.statsError}` }]),
      { level: "info", text: `${store}: proposed flow \`${draft.name}\` for ${candidate.target} (${payload.summary})` },
    ],
    proposals: [store],
  };
}

function emptyDraftRules(status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string): OperationEnvelope<"draft-rules"> {
  return { kind: "draft-rules", status, exitCode, payload: null, messages: error === undefined ? [] : [{ level: "error", text: error }], written: [], removed: [], proposals: [] };
}

/**
 * The candidate of the drafted `rules` for its target: `into`, else
 * `<specDir>/rules.md`. As `flowCandidate`: a target a proposal may not
 * change is named and not read; otherwise the text on disk and the waiting
 * proposal are read once, here, and `withRules` keeps the target's text.
 */
export function rulesCandidate(root: string, specDir: string, generated: (path: string) => boolean, rules: string, into?: string): RulesCandidate {
  const target = toPosix(into ?? `${specDir}/rules.md`);
  const problem = proposalProblem(root, specDir, target, generated);
  if (problem !== null) return { rules, target, problem, before: null, pending: null, text: null };
  const store = `${PROPOSALS_DIR}/${target}`;
  const before = existingText(join(root, target));
  const pending = writeProblem(root, store, { under: PROPOSALS_DIR, generated: true }) === null ? existingText(join(root, store)) : null;
  return { rules, target, problem: null, before, pending, text: withRules(before, rules) };
}

/**
 * `keylang draft rules [--mode algo|llm|hybrid]`. Compute: the analysis of
 * the saved files (nothing persisted), the algo rules from the module graph
 * and its cycles, then — for a model mode with a model — the model's rules,
 * each checked alone against the snapshot. The rest is `runDraftFlow`'s
 * contract: the target is checked before the model is asked, a preview ends
 * with the candidate (0, nothing written), a proposal is written only while
 * the target, the waiting proposal, keylang.json and the sources are the
 * ones read (else 1), a model draft's counts go to the stats, and a Cancel
 * is `cancelled` with nothing written.
 */
async function runDraftRules(request: DraftRulesRequest, context: OperationContext): Promise<OperationEnvelope<"draft-rules">> {
  const { root } = request;
  const mode = request.mode ?? "algo";
  if (!isAbsolute(root)) return emptyDraftRules("failed", 2, "draft rules: root must be an absolute path");
  if (context.signal?.aborted) return emptyDraftRules("cancelled", null);
  context.onProgress?.({ text: "reading the sources" });
  let analyzed: Analysis;
  try {
    analyzed = await (context.analyze ?? analyze)({ root, withoutEvidence: true });
  } catch (error) {
    return emptyDraftRules("failed", 2, messageOf(error));
  }
  if (context.signal?.aborted) return emptyDraftRules("cancelled", null);
  const snapshot = analyzed.snapshot;
  if (!snapshot) return emptyDraftRules("failed", 2, "draft: no supported source files; run `keylang init`");
  const inputs = sourceInputs(analyzed.config, snapshot.manifest.files);
  // Module dependencies inside the repository: a cycle among them keeps `no-cycles` out of the draft.
  const modules = new Map<string, Set<string>>();
  for (const [id, node] of Object.entries(snapshot.nodes)) if (node.kind === "module") modules.set(id, new Set((node.deps ?? []).filter((dep) => snapshot.nodes[dep]?.layer !== "external")));
  const cyclic = stronglyConnected(modules).length > 0;
  const algo = draftRules(snapshot, cyclic);
  const setup = await modelSetup(mode, analyzed.config, "draft rules");
  if ("error" in setup) return emptyDraftRules("failed", 2, setup.error);
  const specDir = toPosix(relative(root, resolve(root, analyzed.config.dir)));
  const generated = (path: string): boolean => analyzed.docs.some((doc) => doc.path === path && doc.generated !== null);
  let basis: RulesCandidate;
  try {
    basis = rulesCandidate(root, specDir, generated, algo, request.into);
  } catch (error) {
    // A target that cannot be read (a directory) fails a proposal; a preview, like `--print`, never needs it.
    if (request.output === "proposal") return emptyDraftRules("failed", 2, messageOf(error));
    basis = { rules: algo, target: toPosix(request.into ?? `${specDir}/rules.md`), problem: messageOf(error), before: null, pending: null, text: null };
  }
  const fallbackNote: OperationMessage[] = setup.fallback === null ? [] : [{ level: "warning", text: setup.fallback }];
  const nothingWritten: OperationMessage = { level: "info", text: "nothing was written; the target and any proposal waiting for it are kept" };
  if (request.output === "proposal") {
    const refusal = proposalRefusal(root, basis, request.pending);
    if (refusal !== null) {
      return {
        ...emptyDraftRules("failed", refusal.exitCode),
        payload: { output: request.output, mode: setup.client === null ? "algo" : mode, candidate: basis, cyclic, summary: rulesCountText(algo), model: null, fallback: setup.fallback, statsError: null, proposal: null, refused: refusal.refused, error: null },
        messages: [...fallbackNote, { level: "error", text: refusal.error }, ...(refusal.refused.length > 0 ? [nothingWritten] : [])],
      };
    }
  }
  let rules = algo;
  let model: RulesModelInfo | null = null;
  if (setup.client !== null) {
    const client = setup.client;
    context.onProgress?.({ text: `asking ${client.agent}` });
    const { LlmCancelled } = await import("./llm.ts");
    const { draftRulesWithModel } = await import("./draft-llm.ts");
    try {
      const drafted = await draftRulesWithModel(analyzed, client, mode === "llm" ? "llm" : "hybrid", algo, basis.target, context.signal ? { signal: context.signal } : {});
      if (context.signal?.aborted) return emptyDraftRules("cancelled", null);
      rules = drafted.text;
      model = { agent: client.agent, counts: drafted.counts, conflicts: drafted.conflicts };
    } catch (error) {
      if (error instanceof LlmCancelled || context.signal?.aborted) return emptyDraftRules("cancelled", null);
      return emptyDraftRules("failed", 2, messageOf(error));
    }
  }
  const candidate: RulesCandidate = { ...basis, rules, text: basis.problem === null ? withRules(basis.before, rules) : null };
  const summary = model === null ? rulesCountText(rules) : draftCountsText(model.counts);
  const payload: DraftRulesPayload = { output: request.output, mode: model === null ? "algo" : mode, candidate, cyclic, summary, model, fallback: setup.fallback, statsError: null, proposal: null, refused: [], error: null };
  // The CLI's stderr notes: the fallback, then each conflict with its evidence.
  const notes: OperationMessage[] = [...fallbackNote, ...(model?.conflicts ?? []).map((conflict) => ({ level: "warning" as const, text: `conflict: ${conflict}` }))];
  if (request.output === "preview") {
    return { ...emptyDraftRules("completed", 0), payload, messages: [...notes, { level: "info", text: `rules for ${candidate.target} (${summary}); a preview, nothing written` }] };
  }
  const failed = (exitCode: 1 | 2, messages: OperationMessage[]): OperationEnvelope<"draft-rules"> => ({ ...emptyDraftRules("failed", exitCode), payload, messages: [...notes, ...messages] });
  const committed = await commitProposal({ root, specDir, generated, target: candidate.target, text: candidate.text!, expected: { target: candidate.before, proposal: candidate.pending }, config: analyzed.config, inputs }, context);
  if ("cancelled" in committed) return { ...emptyDraftRules("cancelled", null), payload };
  if ("refused" in committed) {
    payload.refused = committed.refused;
    return failed(1, [...committed.refused.map((text) => ({ level: "error" as const, text })), nothingWritten]);
  }
  if ("failed" in committed) {
    if (committed.writing) payload.error = committed.failed;
    return failed(2, [{ level: "error", text: committed.failed }]);
  }
  payload.proposal = committed.proposal;
  if (model !== null) payload.statsError = countProposed(root, model.counts);
  return {
    ...emptyDraftRules("completed", 0),
    payload,
    messages: [
      ...notes,
      ...(payload.statsError === null ? [] : [{ level: "warning" as const, text: `${STATS_FILE} not updated: ${payload.statsError}` }]),
      { level: "info", text: `${committed.proposal}: proposed rules for ${candidate.target} (${summary})` },
    ],
    proposals: [committed.proposal],
  };
}

function emptyDraftLayout(status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string): OperationEnvelope<"draft-layout"> {
  return { kind: "draft-layout", status, exitCode, payload: null, messages: error === undefined ? [] : [{ level: "error", text: error }], written: [], removed: [], proposals: [] };
}

/**
 * `keylang draft map [--mode algo|llm|hybrid]`. The saved keylang.json (or
 * the inferred one without it) first: invalid, it fails (2) as the CLI
 * does. Algo guesses the layers from the directories and needs no
 * analysis; a model mode with a model analyses the saved files (nothing
 * persisted) and asks for the layers of its source files. Invalid layers
 * from the model fail (2) and are never returned; Cancel is `cancelled`.
 * Nothing is written in any case.
 */
async function runDraftLayout(request: DraftLayoutRequest, context: OperationContext): Promise<OperationEnvelope<"draft-layout">> {
  const { root } = request;
  const mode = request.mode ?? "algo";
  if (!isAbsolute(root)) return emptyDraftLayout("failed", 2, "draft map: root must be an absolute path");
  if (context.signal?.aborted) return emptyDraftLayout("cancelled", null);
  let config: Config;
  try {
    config = loadConfig(root);
  } catch (error) {
    return emptyDraftLayout("failed", 2, messageOf(error));
  }
  const configExists = existsSync(join(root, CONFIG_FILE));
  const setup = await modelSetup(mode, config, "draft map");
  if ("error" in setup) return emptyDraftLayout("failed", 2, setup.error);
  const fallbackNote: OperationMessage[] = setup.fallback === null ? [] : [{ level: "warning", text: setup.fallback }];
  if (setup.client === null) {
    const layers = guessLayout(root, config.exclude).layers;
    const payload: DraftLayoutPayload = { mode: "algo", layers: Object.fromEntries(layers), preview: configToJson({ ...config, layers, guessed: true }), configExists, agent: null, fallback: setup.fallback };
    // The CLI's closing note on stderr.
    const note = configExists ? `printed only; ${CONFIG_FILE} is unchanged` : `no ${CONFIG_FILE}; \`keylang init\` writes this layout`;
    return { ...emptyDraftLayout("completed", 0), payload, messages: [...fallbackNote, { level: "info", text: note }] };
  }
  const client = setup.client;
  context.onProgress?.({ text: "reading the sources" });
  let analyzed: Analysis;
  try {
    analyzed = await (context.analyze ?? analyze)({ root, withoutEvidence: true });
  } catch (error) {
    return emptyDraftLayout("failed", 2, messageOf(error));
  }
  if (context.signal?.aborted) return emptyDraftLayout("cancelled", null);
  context.onProgress?.({ text: `asking ${client.agent}` });
  const { LlmCancelled } = await import("./llm.ts");
  const { draftLayoutWithModel } = await import("./draft-llm.ts");
  let layers: Record<string, string[]>;
  try {
    layers = await draftLayoutWithModel(analyzed, client, analyzed.snapshot?.manifest.files.map((file) => file.path) ?? [], context.signal ? { signal: context.signal } : {});
  } catch (error) {
    if (error instanceof LlmCancelled || context.signal?.aborted) return emptyDraftLayout("cancelled", null);
    return emptyDraftLayout("failed", 2, messageOf(error));
  }
  if (context.signal?.aborted) return emptyDraftLayout("cancelled", null);
  const preview = configToJson({ ...analyzed.config, layers: new Map(Object.entries(layers)), guessed: false });
  const payload: DraftLayoutPayload = { mode, layers, preview, configExists, agent: client.agent, fallback: null };
  return { ...emptyDraftLayout("completed", 0), payload, messages: [{ level: "info", text: `proposed by ${client.agent}; printed only; ${CONFIG_FILE} is unchanged` }] };
}

function emptyCodeToSpec(status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string): OperationEnvelope<"code-to-spec"> {
  return { kind: "code-to-spec", status, exitCode, payload: null, messages: error === undefined ? [] : [{ level: "error", text: error }], written: [], removed: [], proposals: [] };
}

/** What code-to-spec drafted from its source, before the target is read. */
interface CodeDrafted {
  file: string | null;
  line: number | null;
  since: string | null;
  name: string;
  drafts: readonly FlowDraft[];
}

/**
 * The candidate of the flows drafted from code for `target`. As
 * `flowCandidate`: a target a proposal may not change is named and not
 * read; otherwise the text on disk and the waiting proposal are read once,
 * here, and `withFlow` merges every flow into it in order. Reads only; a
 * target that cannot be read throws.
 */
export function codeToSpecCandidate(root: string, specDir: string, generated: (path: string) => boolean, drafted: CodeDrafted, target: string): CodeToSpecCandidate {
  const base = codePosition(drafted, target);
  const problem = proposalProblem(root, specDir, target, generated);
  if (problem !== null) return { ...base, problem, before: null, pending: null, text: null };
  const store = `${PROPOSALS_DIR}/${target}`;
  const before = existingText(join(root, target));
  const pending = writeProblem(root, store, { under: PROPOSALS_DIR, generated: true }) === null ? existingText(join(root, store)) : null;
  return { ...base, problem: null, before, pending, text: mergedFlows(before, drafted.drafts) };
}

/** The target's text with each flow merged by `withFlow`, in order. */
function mergedFlows(before: string | null, drafts: readonly FlowDraft[]): string | null {
  let text = before;
  for (const draft of drafts) text = withFlow(text, draft);
  return text;
}

/** The drafted flows as a candidate shows them, before the target is read. */
function codePosition(drafted: CodeDrafted, target: string): Pick<CodeToSpecCandidate, "file" | "line" | "since" | "name" | "flows" | "print" | "target"> {
  const flows = drafted.drafts.map((draft) => ({ trigger: draft.steps[0]!, name: draft.name, steps: draft.steps, flow: draft.text }));
  return { file: drafted.file, line: drafted.line, since: drafted.since, name: drafted.name, flows, print: drafted.drafts.map((draft) => draft.text).join("\n"), target };
}

/** The IDs the hand-written flows name: a changed fn among them already has a flow to review. */
function describedIds(docs: readonly Document[]): Set<string> {
  const named = new Set<string>();
  for (const doc of docs) {
    if (doc.generated !== null) continue;
    for (const section of doc.sections) {
      if (section.kind !== "flow") continue;
      for (const top of sectionNodes(section)) walk(top, (node) => node.refs.forEach((ref) => named.add(ref.target)));
    }
  }
  return named;
}

/**
 * `keylang code-to-spec <path[:line]> | --since <ref> [--mode]`. Compute:
 * the analysis of the saved files (nothing persisted), then the source — a
 * position (`codeToSpec`: a line outside every fn, a file without a fn of
 * the snapshot or without an exported one is 2 with the CLI's message) or
 * a git change read in the root (`gitChangedLines`: no git, no repository,
 * a bad ref is 2; no fn left to draft is 0 with no candidate and nothing
 * written) — each fn drafted from the snapshot's calls, then the model
 * mode's client (`llm` without one is 2), then the candidate against the
 * target on disk. A proposal is checked before the model is asked: a
 * target a proposal may not change is 2, a waiting proposal under `refuse`
 * is 1. The model drafts each flow in turn; a Cancel before or during any
 * of its answers is `cancelled` with no payload, an error is 2 — never a
 * partial candidate. A preview ends with the candidate (0). A proposal
 * follows `runDraftFlow`: after `beforeCommit` the target, the waiting
 * proposal, keylang.json and the sources must still be the ones read (else
 * 1, nothing written); then the full text is written atomically (0; 2 on
 * an I/O error) and a model draft's counts go to the stats.
 */
async function runCodeToSpec(request: CodeToSpecRequest, context: OperationContext): Promise<OperationEnvelope<"code-to-spec">> {
  const { root } = request;
  const mode = request.mode ?? "algo";
  const file = request.file;
  const since = request.since;
  const line = request.line ?? null;
  if (!isAbsolute(root)) return emptyCodeToSpec("failed", 2, "code-to-spec: root must be an absolute path");
  if (file !== undefined && since !== undefined) return emptyCodeToSpec("failed", 2, "code-to-spec: give a path or --since, not both");
  if (file === undefined && since === undefined) return emptyCodeToSpec("failed", 2, "code-to-spec: a path, optionally with :line, or --since <git-ref> is required");
  if (line !== null && !(Number.isInteger(line) && line >= 0)) return emptyCodeToSpec("failed", 2, `code-to-spec: ${file}:${line}: a line is a whole number`);
  if (context.signal?.aborted) return emptyCodeToSpec("cancelled", null);
  context.onProgress?.({ text: "reading the sources" });
  let analyzed: Analysis;
  try {
    analyzed = await (context.analyze ?? analyze)({ root, withoutEvidence: true });
  } catch (error) {
    return emptyCodeToSpec("failed", 2, messageOf(error));
  }
  if (context.signal?.aborted) return emptyCodeToSpec("cancelled", null);
  const snapshot = analyzed.snapshot;
  if (!snapshot) return emptyCodeToSpec("failed", 2, "code-to-spec: no supported source files; run `keylang init`");
  const inputs = sourceInputs(analyzed.config, snapshot.manifest.files);
  // What the text does not show, in the order the CLI says it on stderr.
  const notes: OperationMessage[] = [];
  let drafted: CodeDrafted;
  let described: string[] = [];
  if (since !== undefined) {
    context.onProgress?.({ text: `reading the git changes since ${since}` });
    let changes: ReturnType<typeof changedFlows>;
    try {
      changes = changedFlows(snapshot, gitChangedLines(root, since), describedIds(analyzed.docs));
    } catch (error) {
      return emptyCodeToSpec("failed", 2, messageOf(error));
    }
    described = changes.named;
    if (described.length > 0) notes.push({ level: "warning", text: `changed and already in flows (review those): ${described.join(", ")}` });
    if (changes.drafts.length === 0) {
      const payload: CodeToSpecPayload = { output: request.output, mode: "algo", since, described, candidate: null, summary: "nothing to draft", model: null, fallback: null, statsError: null, proposal: null, refused: [], error: null };
      return { ...emptyCodeToSpec("completed", 0), payload, messages: [...notes, { level: "info", text: `no fn outside the flows changed since ${since}; nothing proposed` }] };
    }
    drafted = { file: null, line: null, since, name: "changes", drafts: changes.drafts };
  } else {
    try {
      const position = codeToSpec(snapshot, file!, line);
      drafted = { file: file!, line, since: null, name: position.name, drafts: position.drafts };
    } catch (error) {
      return emptyCodeToSpec("failed", 2, messageOf(error));
    }
  }
  const setup = await modelSetup(mode, analyzed.config, "code-to-spec");
  if ("error" in setup) return { ...emptyCodeToSpec("failed", 2), messages: [...notes, { level: "error", text: setup.error }] };
  if (setup.fallback !== null) notes.push({ level: "warning", text: setup.fallback });
  const specDir = toPosix(relative(root, resolve(root, analyzed.config.dir)));
  const generated = (path: string): boolean => analyzed.docs.some((doc) => doc.path === path && doc.generated !== null);
  const target = toPosix(request.into ?? `${specDir}/flows/${drafted.name}.md`);
  // The target and its waiting proposal as they are now, before any model answers: the basis of the write.
  let basis: CodeToSpecCandidate;
  let unreadable: string | null = null;
  try {
    basis = codeToSpecCandidate(root, specDir, generated, drafted, target);
  } catch (error) {
    unreadable = messageOf(error);
    basis = { ...codePosition(drafted, target), problem: unreadable, before: null, pending: null, text: null };
  }
  const draftedMode = setup.client === null ? "algo" : mode;
  const payload: CodeToSpecPayload = { output: request.output, mode: draftedMode, since: drafted.since, described, candidate: basis, summary: codeSummary(basis.flows, null), model: null, fallback: setup.fallback, statsError: null, proposal: null, refused: [], error: null };
  const nothingWritten: OperationMessage = { level: "info", text: "nothing was written; the target and any proposal waiting for it are kept" };
  if (request.output === "proposal") {
    // A target that cannot be read (a directory) fails a proposal with the read's error, as the CLI did; a preview, like `--print`, never needs it.
    if (unreadable !== null) return { ...emptyCodeToSpec("failed", 2), payload, messages: [...notes, { level: "error", text: unreadable }] };
    // Checked before the model is asked: a target that cannot take the proposal costs no request.
    const refusal = proposalRefusal(root, basis, request.pending, "code-to-spec");
    if (refusal !== null) {
      payload.refused = refusal.refused;
      return { ...emptyCodeToSpec("failed", refusal.exitCode), payload, messages: [...notes, { level: "error", text: refusal.error }, ...(refusal.refused.length > 0 ? [nothingWritten] : [])] };
    }
  }
  let candidate = basis;
  if (setup.client !== null) {
    const drafts = await modelFlows(request, mode === "llm" ? "llm" : "hybrid", analyzed, setup.client, drafted.drafts, notes, context);
    if ("cancelled" in drafts) return emptyCodeToSpec("cancelled", null);
    if ("error" in drafts) return { ...emptyCodeToSpec("failed", 2), messages: [...notes, { level: "error", text: drafts.error }] };
    const modelled = { ...drafted, drafts: drafts.drafts };
    candidate = { ...basis, ...codePosition(modelled, target), text: basis.problem === null ? mergedFlows(basis.before, drafts.drafts) : null };
    payload.model = drafts.model;
    payload.candidate = candidate;
  }
  payload.summary = codeSummary(candidate.flows, payload.model);
  const names = candidate.flows.map((flow) => `\`${flow.name}\``).join(", ");
  if (request.output === "preview") {
    return { ...emptyCodeToSpec("completed", 0), payload, messages: [...notes, { level: "info", text: `${names} for ${target} (${payload.summary}); a preview, nothing written` }] };
  }
  const committed = await commitProposal({ root, specDir, generated, target, text: candidate.text!, expected: { target: candidate.before, proposal: candidate.pending }, config: analyzed.config, inputs }, context);
  if ("cancelled" in committed) return { ...emptyCodeToSpec("cancelled", null), payload };
  if ("refused" in committed) {
    payload.refused = committed.refused;
    return { ...emptyCodeToSpec("failed", 1), payload, messages: [...notes, ...committed.refused.map((text) => ({ level: "error" as const, text })), nothingWritten] };
  }
  if ("failed" in committed) {
    if (committed.writing) payload.error = committed.failed;
    return { ...emptyCodeToSpec("failed", 2), payload, messages: [...notes, { level: "error", text: committed.failed }] };
  }
  payload.proposal = committed.proposal;
  if (payload.model !== null) payload.statsError = countProposed(root, payload.model.counts);
  return {
    ...emptyCodeToSpec("completed", 0),
    payload,
    messages: [
      ...notes,
      ...(payload.statsError === null ? [] : [{ level: "warning" as const, text: `${STATS_FILE} not updated: ${payload.statsError}` }]),
      { level: "info", text: `${committed.proposal}: proposed ${names} for ${target} (${payload.summary})` },
    ],
    proposals: [committed.proposal],
  };
}

function emptySpecToCode(status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string): OperationEnvelope<"spec-to-code"> {
  return { kind: "spec-to-code", status, exitCode, payload: null, messages: error === undefined ? [] : [{ level: "error", text: error }], written: [], removed: [], proposals: [] };
}

/** The candidate as the operation reports it: each file with the proposal waiting for it now (read only when the store passes the write policy). */
function specToCodeCandidate(root: string, built: CodeCandidate, basis: CandidateBasis): SpecToCodeCandidate {
  const target = (role: "code" | "test", file: FileCandidate): CodeProposalTarget => {
    const store = `${PROPOSALS_DIR}/${file.file}`;
    const pending = writeProblem(root, store, { under: PROPOSALS_DIR, generated: true }) === null ? existingText(join(root, store)) : null;
    return { role, file: file.file, before: file.before, after: file.after, pending, diff: fileDiffText(file) };
  };
  return {
    id: built.id,
    targets: [target("code", built), ...built.tests.map((test) => target("test", test))],
    testNotes: built.testNotes,
    verdicts: built.verdicts,
    diagnostics: built.diagnostics,
    print: specToCodeText(built),
    basis,
  };
}

/** The hand-written specs the candidate was built from, as they are on disk now: a planned signature or a flow's `test` changed meanwhile makes it unfit. */
function specHashes(root: string, docs: readonly Document[]): CandidateBasis["specs"] {
  return docs.filter((doc) => doc.generated === null).map((doc) => ({ path: doc.path, sha256: hashOrNull(readTextOrNull(resolve(root, doc.path))) }));
}

function hashOrNull(text: string | null): string | null {
  return text === null ? null : sha256(text);
}

/** `path: changed on disk while the candidate was computed` for each spec of the basis that is not the same now. */
function specProblems(root: string, specs: CandidateBasis["specs"], subject = "the candidate"): string[] {
  return specs.filter((spec) => hashOrNull(readTextOrNull(resolve(root, spec.path))) !== spec.sha256).map((spec) => `${spec.path}: changed on disk while ${subject} was computed`);
}

/**
 * `keylang spec-to-code <id> [--into]`, template mode. Compute: the analysis
 * of the saved files (nothing persisted; no snapshot is 2), then
 * `specToCode` — an ID not planned, implemented (named with its place), a
 * `deny` its flow breaks or a file not of its module is 2 with the CLI's
 * message and no payload. A preview ends with the candidate (0). A
 * proposal checks the whole set before the first write: a file a code
 * proposal may not change or a store that breaks the write policy is 2, a
 * proposal waiting for any file under `refuse` is 1, all named. After
 * `beforeCommit` (which may refuse) every file, its waiting proposal,
 * keylang.json, the sources and the specs must still be the ones read,
 * else 1 and nothing is written. Then each proposal is written atomically
 * in turn; a Cancel or an I/O error part way stops there and the result
 * names the proposals already written. No stats: the template is no
 * model's draft, and the model's code is not counted either (as the CLI
 * never did).
 *
 * `llm`: the configured model writes the function and each new test file
 * (`llm` without a model is 2 with the CLI's message, before any request).
 * The analysis, the specs, the sources and the code file are read before
 * the first request, so a change during an answer makes the candidate
 * unfit at the commit (1, the new bytes kept). For a proposal the code
 * file's store and waiting proposal are checked before the model is asked.
 * An answer without the function or a declared test is 2 and nothing is
 * written; a Cancel before or during any answer is `cancelled` with no
 * payload; a timeout or a provider error is 2 with its message.
 */
async function runSpecToCode(request: SpecToCodeRequest, context: OperationContext): Promise<OperationEnvelope<"spec-to-code">> {
  const { root } = request;
  if (!isAbsolute(root)) return emptySpecToCode("failed", 2, "spec-to-code: root must be an absolute path");
  if (request.id.trim() === "") return emptySpecToCode("failed", 2, "spec-to-code: a planned id is required");
  const mode = request.mode ?? "algo";
  if (mode !== "algo" && mode !== "llm") return emptySpecToCode("failed", 2, `spec-to-code: --mode must be algo or llm, got \`${String(mode)}\``);
  if (context.signal?.aborted) return emptySpecToCode("cancelled", null);
  context.onProgress?.({ text: "reading the sources" });
  let analyzed: Analysis;
  try {
    analyzed = await (context.analyze ?? analyze)({ root, withoutEvidence: true });
  } catch (error) {
    return emptySpecToCode("failed", 2, messageOf(error));
  }
  if (context.signal?.aborted) return emptySpecToCode("cancelled", null);
  const snapshot = analyzed.snapshot;
  if (!snapshot) return emptySpecToCode("failed", 2, "spec-to-code: no supported source files; run `keylang init`");
  const basis: CandidateBasis = { ...sourceInputs(analyzed.config, snapshot.manifest.files), specs: specHashes(root, analyzed.docs) };
  const into = request.into === undefined ? undefined : toPosix(request.into);
  const setup = await modelSetup(mode, analyzed.config, "spec-to-code");
  if ("error" in setup) return emptySpecToCode("failed", 2, setup.error);
  const nothingWritten: OperationMessage = { level: "info", text: "nothing was written; the files and any proposal waiting for them are kept" };
  const model = setup.client;
  if (model !== null && request.output === "proposal") {
    // Checked before the model is asked: a code file whose proposal cannot be written costs no request. The ID's own problems are specToCode's.
    const placed = plannedCodeTarget(analyzed, request.id, into);
    if (!("error" in placed)) {
      const store = `${PROPOSALS_DIR}/${placed.file}`;
      const storeProblem = writeProblem(root, store, { under: PROPOSALS_DIR, generated: true });
      if (storeProblem !== null) return emptySpecToCode("failed", 2, `${store}: ${storeProblem}`);
      if ((request.pending ?? "refuse") === "refuse" && existingText(join(root, store)) !== null) {
        return { ...emptySpecToCode("failed", 1), messages: [{ level: "error", text: `${store}: a proposal for ${placed.file} is waiting; merge it (m) or remove it before a new candidate` }, nothingWritten] };
      }
    }
  }
  // The model's requests in order: one for the code, then one per new test file; each named in the progress.
  let requests = 0;
  const counted: LlmClient | undefined =
    model === null
      ? undefined
      : {
          ...model,
          complete: (llmRequest, options) => {
            requests++;
            context.onProgress?.({ text: `asking ${model.agent} (request ${requests}: ${requests === 1 ? "the code" : "a test file"})` });
            return model.complete(llmRequest, options);
          },
        };
  context.onProgress?.({ text: model === null ? `building ${request.id} and checking it as code` : `asking ${model.agent} for ${request.id}` });
  const { LlmCancelled } = await import("./llm.ts");
  let candidate: SpecToCodeCandidate;
  try {
    candidate = specToCodeCandidate(root, await specToCode(analyzed, request.id, into, counted, context.signal ? { signal: context.signal } : {}), basis);
  } catch (error) {
    if (error instanceof LlmCancelled || context.signal?.aborted) return emptySpecToCode("cancelled", null);
    return emptySpecToCode("failed", 2, messageOf(error));
  }
  if (context.signal?.aborted) return emptySpecToCode("cancelled", null);
  const tests = candidate.targets.length - 1;
  const payload: SpecToCodePayload = {
    output: request.output,
    mode,
    candidate,
    model: model === null ? null : { agent: model.agent, requests },
    summary: `code ${candidate.targets[0]!.file} + ${tests} test file(s)`,
    proposals: [],
    refused: [],
    error: null,
  };
  // The test entries left to the person, as the CLI says them on stderr.
  const notes: OperationMessage[] = candidate.testNotes.map((text) => ({ level: "warning", text }));
  if (request.output === "preview") return { ...emptySpecToCode("completed", 0), payload, messages: [...notes, { level: "info", text: `${payload.summary} for ${candidate.id}; a preview, nothing written` }] };
  // The whole set is checked before the first write.
  for (const target of candidate.targets) {
    const problem = codeProposalProblem(root, target.file);
    if (problem !== null) return { ...emptySpecToCode("failed", 2), payload, messages: [...notes, { level: "error", text: `spec-to-code: ${target.file}: ${problem}` }] };
    const store = `${PROPOSALS_DIR}/${target.file}`;
    const storeProblem = writeProblem(root, store, { under: PROPOSALS_DIR, generated: true });
    if (storeProblem !== null) return { ...emptySpecToCode("failed", 2), payload, messages: [...notes, { level: "error", text: `${store}: ${storeProblem}` }] };
  }
  if ((request.pending ?? "refuse") === "refuse") {
    const waiting = candidate.targets.filter((target) => target.pending !== null).map((target) => `${PROPOSALS_DIR}/${target.file}: a proposal for ${target.file} is waiting; merge it (m) or remove it before a new candidate`);
    if (waiting.length > 0) {
      payload.refused = waiting;
      return { ...emptySpecToCode("failed", 1), payload, messages: [...notes, ...waiting.map((text) => ({ level: "error" as const, text })), nothingWritten] };
    }
  }
  context.onProgress?.({ text: "waiting to write" });
  let gate: CommitGate;
  try {
    gate = await context.beforeCommit?.({ targets: candidate.targets.map((target) => target.file) });
  } catch (error) {
    return { ...emptySpecToCode("failed", 2), payload, messages: [...notes, { level: "error", text: messageOf(error) }] };
  }
  if (context.signal?.aborted) return { ...emptySpecToCode("cancelled", null), payload };
  const refused: string[] = gate ? [...gate.refused] : [];
  if (refused.length === 0) {
    try {
      for (const target of candidate.targets) {
        const problem = codeProposalProblem(root, target.file);
        const changed = problem !== null ? `${target.file}: ${problem}` : proposalWriteProblem(root, target.file, { target: target.before, proposal: target.pending });
        if (changed !== null) refused.push(changed);
      }
      refused.push(...sourceInputProblems(analyzed.config, basis, "the candidate"));
      refused.push(...specProblems(root, basis.specs));
    } catch (error) {
      return { ...emptySpecToCode("failed", 2), payload, messages: [...notes, { level: "error", text: messageOf(error) }] };
    }
  }
  if (refused.length > 0) {
    payload.refused = refused;
    return { ...emptySpecToCode("failed", 1), payload, messages: [...notes, ...refused.map((text) => ({ level: "error" as const, text })), nothingWritten] };
  }
  // One file at a time, each atomic: what was written before a Cancel or an error is named, never undone behind the person's back.
  const written: string[] = [];
  const sofar = (): OperationMessage[] => (written.length === 0 ? [] : [{ level: "info", text: `proposed before it stopped: ${written.join(", ")}` }]);
  for (const target of candidate.targets) {
    if (written.length > 0 && context.signal?.aborted) {
      payload.proposals = [...written];
      return { ...emptySpecToCode("cancelled", null), payload, messages: [...notes, ...sofar()], proposals: [...written] };
    }
    const store = `${PROPOSALS_DIR}/${target.file}`;
    context.onProgress?.({ text: `writing ${store}` });
    try {
      writeProposal(root, target.file, target.after, { target: target.before, proposal: target.pending });
    } catch (error) {
      payload.proposals = [...written];
      payload.error = messageOf(error);
      return { ...emptySpecToCode("failed", 2), payload, messages: [...notes, { level: "error", text: payload.error }, ...sofar()], proposals: [...written] };
    }
    written.push(store);
  }
  payload.proposals = written;
  return {
    ...emptySpecToCode("completed", 0),
    payload,
    messages: [...notes, { level: "info", text: `proposed ${written.join(", ")} for ${candidate.id}; each merges on its own in MERGE` }],
    proposals: [...written],
  };
}

function emptyApplyCode(status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string): OperationEnvelope<"apply-code"> {
  return { kind: "apply-code", status, exitCode, payload: null, messages: error === undefined ? [] : [{ level: "error", text: error }], written: [], removed: [], proposals: [] };
}

/**
 * Why the candidate may not be applied now. `policy`: a file no code
 * proposal may change, or one the write protocol refuses (a link out, a
 * generated file, a directory) — the first such, as `--apply` always named
 * it. `refused`: every file that no longer holds the text the candidate was
 * built from, every proposal waiting for one (under `refuse`), and every
 * input changed since — a source that is one of the files is named once, as
 * that file.
 */
function applyProblems(request: ApplyCodeRequest): { policy: string | null; refused: string[] } {
  const { root, candidate } = request;
  for (const target of candidate.targets) {
    const problem = codeProposalProblem(root, target.file);
    if (problem !== null) return { policy: `spec-to-code: ${target.file}: ${problem}`, refused: [] };
  }
  for (const target of candidate.targets) {
    const problem = writeProblem(root, target.file);
    if (problem !== null) return { policy: `${target.file}: ${problem}`, refused: [] };
  }
  const refused: string[] = [];
  for (const target of candidate.targets) {
    const changed = writeProblem(root, target.file, { expect: target.before });
    if (changed !== null) refused.push(`${target.file}: ${changed}`);
  }
  if ((request.pending ?? "refuse") === "refuse") {
    for (const target of candidate.targets) {
      const store = `${PROPOSALS_DIR}/${target.file}`;
      if (existsSync(join(root, store))) refused.push(`${store}: a proposal for ${target.file} is waiting; merge it in MERGE (m) instead of applying the candidate — applying never removes it`);
    }
  }
  const files = new Set(candidate.targets.map((target) => target.file));
  const { basis } = candidate;
  if (readTextOrNull(join(root, CONFIG_FILE)) !== basis.config) refused.push(`${CONFIG_FILE}: changed on disk while the candidate was computed`);
  else refused.push(...sourceInputProblems(loadConfig(root), basis, "the candidate").filter((line) => !files.has(line.slice(0, line.indexOf(": ")))));
  refused.push(...specProblems(root, basis.specs));
  return { policy: null, refused };
}

/**
 * `keylang spec-to-code <id> --apply` on a candidate already built (see
 * `ApplyCodeRequest`). A file of the candidate no code proposal may change
 * is 2; a file, a waiting proposal (under `refuse`) or an input changed
 * since the candidate is 1 with each named, nothing written. After
 * `beforeCommit` (which may refuse: 1) everything is checked again. Then
 * each file is written atomically in turn, checked once more just before;
 * a Cancel between two files stops there (`cancelled`), a failed write is 2
 * — the files before it stay written, the ones after are not attempted.
 * Nothing is tested and no proposal is touched.
 */
async function runApplyCode(request: ApplyCodeRequest, context: OperationContext): Promise<OperationEnvelope<"apply-code">> {
  const { root, candidate } = request;
  if (!isAbsolute(root)) return emptyApplyCode("failed", 2, "spec-to-code: root must be an absolute path");
  if (candidate.targets.length === 0) return emptyApplyCode("failed", 2, "spec-to-code: the candidate has no file to apply");
  if (context.signal?.aborted) return emptyApplyCode("cancelled", null);
  const payload: ApplyCodePayload = { id: candidate.id, files: candidate.targets.map((target) => ({ role: target.role, file: target.file, state: "not-attempted" })), refused: [], error: null };
  const nothingWritten: OperationMessage = { level: "info", text: "nothing was written; the files and any proposal waiting for them are kept" };
  const check = (): OperationEnvelope<"apply-code"> | null => {
    let problems: ReturnType<typeof applyProblems>;
    try {
      problems = applyProblems(request);
    } catch (error) {
      return { ...emptyApplyCode("failed", 2, messageOf(error)), payload };
    }
    if (problems.policy !== null) return { ...emptyApplyCode("failed", 2, problems.policy), payload };
    if (problems.refused.length === 0) return null;
    payload.refused = problems.refused;
    return { ...emptyApplyCode("failed", 1), payload, messages: [...problems.refused.map((text) => ({ level: "error" as const, text })), nothingWritten] };
  };
  context.onProgress?.({ text: "checking the candidate's files" });
  const before = check();
  if (before !== null) return before;
  context.onProgress?.({ text: "waiting to write" });
  let gate: CommitGate;
  try {
    gate = await context.beforeCommit?.({ targets: candidate.targets.map((target) => target.file) });
  } catch (error) {
    return { ...emptyApplyCode("failed", 2, messageOf(error)), payload };
  }
  if (context.signal?.aborted) return { ...emptyApplyCode("cancelled", null), payload };
  if (gate && gate.refused.length > 0) {
    payload.refused = [...gate.refused];
    return { ...emptyApplyCode("failed", 1), payload, messages: [...gate.refused.map((text) => ({ level: "error" as const, text })), nothingWritten] };
  }
  const again = check();
  if (again !== null) return again;
  // One file at a time, each atomic: what was written before a Cancel or an error is named, never undone behind the person's back.
  const written: string[] = [];
  const stopped = (status: "failed" | "cancelled", error?: string): OperationEnvelope<"apply-code"> => {
    const rest = payload.files.filter((file) => file.state === "not-attempted").map((file) => file.file);
    const messages: OperationMessage[] = [
      ...(error === undefined ? [] : [{ level: "error" as const, text: error }]),
      ...(written.length === 0 ? [] : [{ level: "info" as const, text: `written before it stopped: ${written.join(", ")}` }]),
      ...(rest.length === 0 ? [] : [{ level: "info" as const, text: `not written: ${rest.join(", ")}` }]),
    ];
    return { ...emptyApplyCode(status, status === "failed" ? 2 : null), payload, messages, written: [...written] };
  };
  for (const [i, target] of candidate.targets.entries()) {
    const step = payload.files[i]!;
    if (i > 0) {
      // A Cancel lands between two files.
      await new Promise<void>((done) => setImmediate(done));
      if (context.signal?.aborted) return stopped("cancelled");
    }
    context.onProgress?.({ text: `writing ${target.file}` });
    try {
      const problem = writeProblem(root, target.file, { expect: target.before });
      if (problem !== null) throw new Error(`${target.file}: ${problem}`);
      writeAtomic(landing(join(root, target.file))!, target.after);
    } catch (error) {
      step.state = "failed";
      step.error = messageOf(error);
      payload.error = step.error;
      return stopped("failed", step.error);
    }
    step.state = "completed";
    written.push(target.file);
  }
  return {
    ...emptyApplyCode("completed", 0),
    payload,
    messages: [{ level: "info", text: `${written.join(", ")} written for ${candidate.id}; no test was run` }],
    written: [...written],
  };
}

/** `2 flow(s), 6 step(s)` for algo; `2 flow(s), 3 agree, 1 llm-only` for a model draft. */
function codeSummary(flows: readonly CodeFlow[], model: CodeModelInfo | null): string {
  if (model !== null) return `${flows.length} flow(s), ${draftCountsText(model.counts)}`;
  return `${flows.length} flow(s), ${flows.reduce((sum, flow) => sum + flow.steps.length, 0)} step(s)`;
}

/**
 * The model's draft of each flow in turn, judged against the snapshot. The
 * notes of each answer (unknown IDs, dropped lines) join `notes` as it
 * comes, as the CLI prints them. A Cancel is checked before every request
 * and during each answer: `cancelled`, never the flows drafted so far.
 */
async function modelFlows(
  request: CodeToSpecRequest,
  mode: "llm" | "hybrid",
  analyzed: Analysis,
  client: LlmClient,
  algo: readonly FlowDraft[],
  notes: OperationMessage[],
  context: OperationContext,
): Promise<{ drafts: FlowDraft[]; model: CodeModelInfo } | { error: string } | { cancelled: true }> {
  const { LlmCancelled } = await import("./llm.ts");
  const { draftFlowWithModel } = await import("./draft-llm.ts");
  const drafts: FlowDraft[] = [];
  const model: CodeModelInfo = { agent: client.agent, counts: { agree: 0, "llm-only": 0, "algo-only": 0, conflict: 0 }, flows: [] };
  for (const [i, flow] of algo.entries()) {
    if (context.signal?.aborted) return { cancelled: true };
    const trigger = flow.steps[0]!;
    context.onProgress?.({ text: `asking ${client.agent}${algo.length > 1 ? ` (flow ${i + 1} of ${algo.length}: ${flow.name})` : ""}` });
    try {
      const answer = await draftFlowWithModel(analyzed, trigger, client, mode, flow.name, request.context, context.signal ? { signal: context.signal } : {});
      if (context.signal?.aborted) return { cancelled: true };
      if (answer.unknown.length > 0) notes.push({ level: "warning", text: `still unknown after ${answer.rounds} round(s): ${answer.unknown.join(", ")}` });
      for (const line of answer.dropped) notes.push({ level: "warning", text: `dropped from the model's draft: ${line}` });
      for (const [status, n] of Object.entries(answer.counts) as [DraftStatus, number][]) model.counts[status] += n;
      model.flows.push({ name: answer.name, rounds: answer.rounds, unknown: answer.unknown, dropped: answer.dropped });
      drafts.push({ name: answer.name, text: answer.text, steps: flowSteps(answer.text, trigger) });
    } catch (error) {
      if (error instanceof LlmCancelled || context.signal?.aborted) return { cancelled: true };
      return { error: messageOf(error) };
    }
  }
  return { drafts, model };
}

/** `2 rule(s)`: the list items of a drafted `# rules` section. */
function rulesCountText(rules: string): string {
  return `${rules.split("\n").filter((line) => line.startsWith("- ")).length} rule(s)`;
}

/**
 * Why a proposal for the candidate's target may not even be drafted, or null
 * — checked before a model is asked: a target a proposal may not change (2,
 * as in the CLI), a store that breaks the write policy (2), a proposal
 * already waiting under `pending: refuse` (1, named in `refused`).
 */
function proposalRefusal(root: string, candidate: { target: string; problem: string | null; pending: string | null }, pending: "refuse" | "replace" | undefined, command = "draft"): { exitCode: 1 | 2; error: string; refused: string[] } | null {
  const store = `${PROPOSALS_DIR}/${candidate.target}`;
  if (candidate.problem !== null) return { exitCode: 2, error: `${command}: ${candidate.target}: ${candidate.problem}`, refused: [] };
  const storeProblem = writeProblem(root, store, { under: PROPOSALS_DIR, generated: true });
  if (storeProblem !== null) return { exitCode: 2, error: `${store}: ${storeProblem}`, refused: [] };
  if ((pending ?? "refuse") === "refuse" && candidate.pending !== null) {
    const waiting = `${store}: a proposal for ${candidate.target} is waiting; merge it (m) or remove it before a new draft`;
    return { exitCode: 1, error: waiting, refused: [waiting] };
  }
  return null;
}

/** What a drafted proposal is written from and against. */
interface ProposalCommit {
  root: string;
  specDir: string;
  generated: (path: string) => boolean;
  target: string;
  text: string;
  /** The target and the waiting proposal the text was built from. */
  expected: ProposalBasis;
  config: Config;
  /** keylang.json and the sources the draft was computed from. */
  inputs: SourceInputs;
}

/**
 * The commit of a drafted proposal: after `beforeCommit` (which may refuse)
 * the target, the waiting proposal, keylang.json and the sources must still
 * be the ones read, else it is refused and nothing is written; then the full
 * text is written atomically. `failed` with `writing` is an error of the
 * write itself.
 */
async function commitProposal(commit: ProposalCommit, context: OperationContext): Promise<{ proposal: string } | { refused: string[] } | { failed: string; writing: boolean } | { cancelled: true }> {
  const { root, target, expected } = commit;
  context.onProgress?.({ text: "waiting to write" });
  let gate: CommitGate;
  try {
    gate = await context.beforeCommit?.({ targets: [target] });
  } catch (error) {
    return { failed: messageOf(error), writing: false };
  }
  if (context.signal?.aborted) return { cancelled: true };
  if (gate && gate.refused.length > 0) return { refused: gate.refused };
  let problems: string[];
  try {
    const problem = proposalProblem(root, commit.specDir, target, commit.generated);
    const written = problem !== null ? `${target}: ${problem}` : proposalWriteProblem(root, target, expected);
    problems = [...(written === null ? [] : [written]), ...sourceInputProblems(commit.config, commit.inputs, "the draft")];
  } catch (error) {
    return { failed: messageOf(error), writing: false };
  }
  if (problems.length > 0) return { refused: problems };
  const store = `${PROPOSALS_DIR}/${target}`;
  context.onProgress?.({ text: `writing ${store}` });
  try {
    writeProposal(root, target, commit.text, expected);
  } catch (error) {
    return { failed: messageOf(error), writing: true };
  }
  return { proposal: store };
}

/** The drafted lines count as proposed once the proposal exists; a count that cannot be written never fails the draft: its error, or null. */
function countProposed(root: string, counts: Record<DraftStatus, number>): string | null {
  try {
    updateStats(root, (stats) => addDrafts(stats, counts, "proposed"));
    return null;
  } catch (error) {
    return messageOf(error);
  }
}

/**
 * The model client of a model mode, read before anything is asked: none
 * configured, and `llm` fails as the CLI does (`<command> --mode llm: …`)
 * while `hybrid` drafts as algo, saying why. Algo: no client.
 */
async function modelSetup(mode: "algo" | "llm" | "hybrid", config: Pick<Config, "agent" | "root">, command = "draft"): Promise<{ client: LlmClient | null; fallback: string | null } | { error: string }> {
  if (mode === "algo") return { client: null, fallback: null };
  const { llmClient } = await import("./llm.ts");
  const setup = llmClient(config.agent, { root: config.root });
  if (!("missing" in setup)) return { client: setup.client, fallback: null };
  if (mode === "llm") return { error: `${command} --mode llm: ${setup.missing}` };
  return { client: null, fallback: `${setup.missing}; drafting from the snapshot only (--mode algo)` };
}

/** The model's draft, judged against the snapshot; a Cancel during its answer is `cancelled`, never an error. */
async function modelDraft(request: DraftFlowRequest, mode: "llm" | "hybrid", analyzed: Analysis, client: LlmClient, context: OperationContext): Promise<{ draft: FlowDraft; model: DraftModelInfo } | { error: string } | { cancelled: true }> {
  context.onProgress?.({ text: `asking ${client.agent}` });
  const { LlmCancelled } = await import("./llm.ts");
  const { draftFlowWithModel } = await import("./draft-llm.ts");
  try {
    const model = await draftFlowWithModel(analyzed, request.trigger, client, mode, request.name, request.context, context.signal ? { signal: context.signal } : {});
    if (context.signal?.aborted) return { cancelled: true };
    return {
      draft: { name: model.name, text: model.text, steps: flowSteps(model.text, request.trigger) },
      model: { agent: client.agent, counts: model.counts, unknown: model.unknown, rounds: model.rounds, dropped: model.dropped },
    };
  } catch (error) {
    if (error instanceof LlmCancelled || context.signal?.aborted) return { cancelled: true };
    return { error: messageOf(error) };
  }
}

/** The IDs of a drafted flow's trigger and steps in the order they stand, the requested trigger first. */
function flowSteps(text: string, trigger: string): string[] {
  const ids = [trigger];
  for (const section of parse("draft.md", text).sections) {
    for (const top of sectionNodes(section)) walk(top, (node) => {
      if (node.kind !== "trigger" && node.kind !== "step") return;
      for (const ref of node.refs) if (!ids.includes(ref.target)) ids.push(ref.target);
    });
  }
  return ids;
}

/** `2 agree, 1 llm-only`: the statuses that occur, as the CLI names a model draft. */
function draftCountsText(counts: Record<string, number>): string {
  return Object.entries(counts).filter(([, n]) => n > 0).map(([status, n]) => `${n} ${status}`).join(", ");
}

/** What the draft's text does not show, as the CLI's stderr notes: the fallback, unknown IDs, dropped lines. */
function draftNotes(payload: DraftFlowPayload): OperationMessage[] {
  const notes: OperationMessage[] = [];
  if (payload.fallback !== null) notes.push({ level: "warning", text: payload.fallback });
  const model = payload.model;
  if (model !== null && model.unknown.length > 0) notes.push({ level: "warning", text: `still unknown after ${model.rounds} round(s): ${model.unknown.join(", ")} (K001 after the merge unless declared planned)` });
  for (const line of model?.dropped ?? []) notes.push({ level: "warning", text: `dropped from the model's draft: ${line}` });
  return notes;
}

/** The file's text, null when there is none; a directory or an unreadable file throws. */
function existingText(abs: string): string | null {
  return existsSync(abs) ? readFileSync(abs, "utf8") : null;
}

export function checkSkipNote(path: string): string {
  return `note: ${path}: the explained map and saved explanations are not specs; skipped`;
}

/** The CLI's closing line on stderr: `0 fail, 2 unverified, 5 ok`. */
export function checkSummary(counts: CheckPayload["counts"]): string {
  return `${counts.fail} fail, ${counts.unverified} unverified, ${counts.ok} ok`;
}

/** The slugs `keylang feature` accepts: a plain file name under `<dir>/features/`. */
export const FEATURE_SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** The slug of `path` when it is a feature file `<dir>/features/<slug>.md`, else null. */
export function featureSlugOf(path: string, dir: string): string | null {
  const prefix = `${dir}/features/`;
  if (!path.startsWith(prefix) || !path.endsWith(".md")) return null;
  const slug = path.slice(prefix.length, -3);
  return FEATURE_SLUG.test(slug) ? slug : null;
}

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
  let base: FeatureBase;
  try {
    base = readFeatureBase(request.root, file, request.since, "feature");
  } catch (error) {
    return emptyFeature("failed", 2, messageOf(error));
  }
  const report = featureReportOf(analyzed, request.slug, base);
  if (report === null) return emptyFeature("failed", 2, `feature: ${file}: not a spec keylang read`);
  const messages: OperationMessage[] = [
    ...report.gaps.map((gap) => ({ level: "info" as const, text: gapLine(gap) })),
    ...report.hints.map((hint) => ({ level: "info" as const, text: hintLine(hint) })),
    { level: report.done ? "info" : "warning", text: featureSummary(report) },
  ];
  return {
    ...emptyFeature("completed", report.done ? 0 : 1),
    payload: { slug: request.slug, file, snapshot: analyzed.snapshot?.snapshotId ?? null, report },
    messages,
  };
}

/** The report of feature `slug` on one analysis and its base: the CLI's `feature`, and the TUI's status line on the session's analysis. */
export function featureReportOf(analyzed: Analysis, slug: string, base: FeatureBase): FeatureReport | null {
  const config = analyzed.config;
  return featureStatus(
    { dir: config.dir, docs: analyzed.docs, spec: analyzed.spec, diagnostics: analyzed.diagnostics, verdicts: analyzed.verdicts, nodes: analyzed.snapshot?.nodes ?? {}, base, index: analyzed.index, format: config.format, layers: [...config.layers.keys()] },
    slug,
  );
}

/** Most questions one request proposes: a person answers them in one sitting. */
const MAX_QUESTIONS = 5;

function emptyFeatureQuestions(status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string): OperationEnvelope<"feature-questions"> {
  return { kind: "feature-questions", status, exitCode, payload: null, messages: error === undefined ? [] : [{ level: "error", text: error }], written: [], removed: [], proposals: [] };
}

/** The model's answer as questions: its `- ? <text>` lines, at most `MAX_QUESTIONS`, and how many other lines were left out. */
export function questionLines(answer: string): { questions: string[]; dropped: number } {
  const lines = answer.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== "" && !/^```/.test(line));
  const questions = lines.filter((line) => /^[-*] \?\s+\S/.test(line)).map((line) => `- ? ${line.replace(/^[-*] \?\s+/, "").replace(/\s+/g, " ")}`);
  const kept = questions.slice(0, MAX_QUESTIONS);
  return { questions: kept, dropped: lines.length - kept.length };
}

/**
 * `text` with `questions` at the top level of its first flow: after the
 * questions its item list starts with, else before its first item (after
 * the heading and prose); a file with no flow yet gets a `# flow <slug>`
 * with them. The rest of the file is kept as written.
 */
export function withQuestions(text: string, questions: readonly string[], slug: string): string {
  const lines = text.split("\n");
  const heading = lines.findIndex((line) => /^#\s+flow\s+\S/.test(line));
  if (heading === -1) return `${text.replace(/\n*$/, "\n")}\n# flow ${slug}\n\n${questions.join("\n")}\n`;
  let at = heading + 1;
  while (at < lines.length && !/^#\s/.test(lines[at]!) && !/^[-*+] /.test(lines[at]!)) at++;
  if (at < lines.length && /^[-*+] /.test(lines[at]!)) {
    while (at < lines.length && /^[-*+] \?\s/.test(lines[at]!)) at++;
    return [...lines.slice(0, at), ...questions, ...lines.slice(at)].join("\n");
  }
  // No item in the flow: after its last non-blank line, before the next heading.
  let end = at;
  while (end > heading + 1 && lines[end - 1]!.trim() === "") end--;
  return [...lines.slice(0, end), "", ...questions, ...(at < lines.length ? [""] : []), ...lines.slice(at)].join("\n").replace(/\n*$/, "\n");
}

/**
 * «Ask the model for questions» on the feature readiness screen (c4-zoom/11):
 * one request with the feature file and what keylang knows around its ids;
 * the answer's `- ? …` lines, at most five, become a proposal for the file
 * that a person accepts hunk by hunk in MERGE. Nothing is written to the
 * feature itself. No model configured, a missing file or a target a proposal
 * may not change is 2; a proposal already waiting is 1; Cancel is cancelled.
 */
async function runFeatureQuestions(request: FeatureQuestionsRequest, context: OperationContext): Promise<OperationEnvelope<"feature-questions">> {
  const { root, slug } = request;
  if (!isAbsolute(root)) return emptyFeatureQuestions("failed", 2, "feature questions: root must be an absolute path");
  if (!FEATURE_SLUG.test(slug)) return emptyFeatureQuestions("failed", 2, `feature questions: invalid slug \`${slug}\``);
  if (context.signal?.aborted) return emptyFeatureQuestions("cancelled", null);
  let analyzed: Analysis;
  try {
    analyzed = await (context.analyze ?? analyze)({ root, withoutEvidence: true });
  } catch (error) {
    return emptyFeatureQuestions("failed", 2, messageOf(error));
  }
  if (context.signal?.aborted) return emptyFeatureQuestions("cancelled", null);
  const config = analyzed.config;
  const file = `${config.dir}/features/${slug}.md`;
  const doc = analyzed.docs.find((item) => item.path === file);
  if (!doc) return emptyFeatureQuestions("failed", 2, `feature questions: ${file}: not found`);
  const setup = await modelSetup("llm", config, "feature questions");
  if ("error" in setup) return emptyFeatureQuestions("failed", 2, setup.error.replace(" --mode llm", ""));
  const client = setup.client!;
  const specDir = toPosix(relative(root, resolve(root, config.dir)));
  const generated = (path: string): boolean => analyzed.docs.some((item) => item.path === path && item.generated !== null);
  const problem = proposalProblem(root, specDir, file, generated);
  const store = `${PROPOSALS_DIR}/${file}`;
  const before = problem === null ? existingText(join(root, file)) : null;
  const pending = problem === null && writeProblem(root, store, { under: PROPOSALS_DIR, generated: true }) === null ? existingText(join(root, store)) : null;
  const refusal = proposalRefusal(root, { target: file, problem, pending }, "refuse", "feature questions");
  if (refusal !== null) return { ...emptyFeatureQuestions("failed", refusal.exitCode, refusal.error) };
  const inputs = sourceInputs(config, analyzed.snapshot?.manifest.files ?? []);
  const text = before ?? "";
  const around = analyzed.snapshot ? contextText(contextForIds(analyzed, idsIn(doc))) : "(no code snapshot)";
  context.onProgress?.({ text: `asking ${client.agent}` });
  const { LlmCancelled } = await import("./llm.ts");
  let answer: string;
  try {
    answer = await client.complete(
      {
        system: [
          "You review the specification of one feature before a coding agent implements it; keylang checks the plan against the code, and a person answers the open questions.",
          `Answer in the language with code \`${config.explain.lang}\`.`,
          `Ask at most ${MAX_QUESTIONS} questions a person must answer before an agent can implement the feature without guessing: who or what starts it, its boundaries, its failure cases, the data it needs, what must not change.`,
          "Write each question on a line of its own as `- ? <question>` and nothing else: no heading, no numbering, no answer.",
          "Do not ask what the specification or the context below already says.",
        ].join("\n"),
        prompt: `Feature file ${file}:\n\`\`\`\n${text}\n\`\`\`\n\nWhat keylang knows around its ids:\n${around}`,
        maxTokens: 1024,
      },
      context.signal ? { signal: context.signal } : {},
    );
  } catch (error) {
    if (error instanceof LlmCancelled || context.signal?.aborted) return emptyFeatureQuestions("cancelled", null);
    return emptyFeatureQuestions("failed", 2, messageOf(error));
  }
  if (context.signal?.aborted) return emptyFeatureQuestions("cancelled", null);
  const { questions, dropped } = questionLines(answer);
  const payload: FeatureQuestionsPayload = { file, agent: client.agent, questions, dropped, proposal: null };
  const droppedNote = dropped > 0 ? [{ level: "info" as const, text: `${dropped} line(s) of the answer were no \`- ? …\` question or past the fifth: left out` }] : [];
  if (questions.length === 0) return { ...emptyFeatureQuestions("completed", 0), payload, messages: [...droppedNote, { level: "info", text: `${client.agent} asked no question: nothing proposed` }] };
  const committed = await commitProposal({ root, specDir, generated, target: file, text: withQuestions(text, questions, slug), expected: { target: before, proposal: pending }, config, inputs }, context);
  if ("cancelled" in committed) return { ...emptyFeatureQuestions("cancelled", null), payload };
  if ("refused" in committed) return { ...emptyFeatureQuestions("failed", 1), payload, messages: [...committed.refused.map((text) => ({ level: "error" as const, text })), { level: "info", text: "nothing was written" }] };
  if ("failed" in committed) return { ...emptyFeatureQuestions("failed", 2), payload, messages: [{ level: "error", text: committed.failed }] };
  payload.proposal = committed.proposal;
  return {
    ...emptyFeatureQuestions("completed", 0),
    payload,
    messages: [...droppedNote, { level: "info", text: `${committed.proposal}: ${questions.length} open question(s) proposed for ${file}; MERGE accepts them hunk by hunk` }],
    proposals: [committed.proposal],
  };
}

function emptyExportC4(status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string): OperationEnvelope<"export-c4"> {
  return { kind: "export-c4", status, exitCode, payload: null, messages: error === undefined ? [] : [{ level: "error", text: error }], written: [], removed: [], proposals: [] };
}

/**
 * Why `out` (as typed: relative to the root, or absolute) cannot receive a
 * diagram, the CLI's message, or null. The path policy of every write —
 * plain, relative, inside the repository through links, not a directory —
 * is checked before the target is read, as `wireOutProblem` does: a file
 * outside is never opened. A file there passes only as a diagram this
 * command wrote, which the operation checks once the path passes. Reads
 * nothing outside the repository; a form may call it as the path is typed.
 */
export function c4OutProblem(root: string, out: string): string | null {
  const path = toPosix(relative(root, resolve(root, out)));
  try {
    const problem = writeProblem(root, path, { generated: true });
    return problem === null ? null : `export c4: --out ${out}: ${problem}; nothing written`;
  } catch (error) {
    return `export c4: --out ${out}: ${messageOf(error)}`;
  }
}

/**
 * `keylang export c4` (c4-zoom/12): the diagram of the saved code and the
 * saved briefs, no model. With `out` it is written to that file, which must
 * pass the write policy (`c4OutProblem`, checked before the file is read)
 * and be new or a diagram this command wrote (its marker line); any other
 * file is 2 with nothing written. An unknown format, level or layer is 2.
 */
async function runExportC4(request: ExportC4Request, context: OperationContext): Promise<OperationEnvelope<"export-c4">> {
  const { root } = request;
  if (!isAbsolute(root)) return emptyExportC4("failed", 2, "export c4: root must be an absolute path");
  const format = C4_FORMATS.find((item) => item === request.format);
  if (format === undefined) return emptyExportC4("failed", 2, `export c4: unknown --format \`${request.format}\`; expected ${C4_FORMATS.join(", ")}`);
  const level = C4_LEVELS.find((item) => item === request.level);
  if (level === undefined) return emptyExportC4("failed", 2, `export c4: unknown --level \`${request.level}\`; expected ${C4_LEVELS.join(", ")}`);
  if (request.layer !== undefined && level !== "component") return emptyExportC4("failed", 2, "export c4: --layer draws the components of one layer: use it with --level component");
  if (request.out !== undefined && request.out.trim() === "") return emptyExportC4("failed", 2, "export c4: --out needs a file path");
  // Before the analysis, as `wire` does: a path the policy refuses costs nothing and is never read.
  const outProblem = request.out === undefined ? null : c4OutProblem(root, request.out);
  if (outProblem !== null) return emptyExportC4("failed", 2, outProblem);
  if (context.signal?.aborted) return emptyExportC4("cancelled", null);
  let analyzed: Analysis;
  try {
    analyzed = await (context.analyze ?? analyze)({ root, withoutEvidence: true });
  } catch (error) {
    return emptyExportC4("failed", 2, messageOf(error));
  }
  if (context.signal?.aborted) return emptyExportC4("cancelled", null);
  const snapshot = analyzed.snapshot;
  if (!snapshot) return emptyExportC4("failed", 2, "export c4: no supported source files to draw");
  const briefs = loadBriefs(analyzed.config);
  // A brief made for older code would describe what is no longer there: only current ones are drawn.
  const brief = (id: string): string | null => {
    const explained = explanationOf(snapshot, briefs, id);
    return explained !== null && !explained.stale ? explained.text : null;
  };
  let text: string;
  try {
    text = renderC4(snapshot, brief, { format, level, ...(request.layer !== undefined ? { layer: request.layer } : {}) });
  } catch (error) {
    return emptyExportC4("failed", 2, messageOf(error));
  }
  const payload: ExportC4Payload = { text, format, level, layer: request.layer ?? null, out: null };
  if (request.out === undefined) return { ...emptyExportC4("completed", 0), payload };
  const out = toPosix(relative(root, resolve(root, request.out)));
  // Checked again right before the read: a link may have changed during the analysis.
  const problem = c4OutProblem(root, request.out);
  if (problem !== null) return { ...emptyExportC4("failed", 2, problem), payload };
  let current: string | null;
  try {
    current = existingText(resolve(root, out));
  } catch (error) {
    return { ...emptyExportC4("failed", 2, `${out}: ${messageOf(error)}`), payload };
  }
  if (current !== null && !isC4Diagram(current)) return { ...emptyExportC4("failed", 2, `${out}: not a diagram \`keylang export c4\` wrote (no keylang:generated marker on its first line); nothing written`), payload };
  context.onProgress?.({ text: "waiting to write" });
  let gate: CommitGate;
  try {
    gate = await context.beforeCommit?.({ targets: [out] });
  } catch (error) {
    return { ...emptyExportC4("failed", 2, messageOf(error)), payload };
  }
  if (context.signal?.aborted) return { ...emptyExportC4("cancelled", null), payload };
  if (gate && gate.refused.length > 0) return { ...emptyExportC4("failed", 2), payload, messages: gate.refused.map((line) => ({ level: "error" as const, text: line })) };
  try {
    safeWrite(root, out, text, { generated: true, expect: current });
  } catch (error) {
    return { ...emptyExportC4("failed", 2, messageOf(error)), payload };
  }
  return { ...emptyExportC4("completed", 0), payload: { ...payload, out }, written: [out], messages: [{ level: "info", text: `${out}: written` }] };
}

/** One gap as the CLI prints it: `file:line:col: kind id: reason`. */
export function gapLine(gap: Gap): string {
  return `${gap.file}:${gap.line}:${gap.col}: ${gap.kind} ${gap.id}: ${gap.reason}`;
}

/** One hint as the CLI prints it after the gaps: `hint: file:line:col: kind id: reason`. */
export function hintLine(hint: Hint): string {
  return `hint: ${hint.file}:${hint.line}:${hint.col}: ${hint.kind} ${hint.id}: ${hint.reason}`;
}

/** The CLI's closing line on stderr: `done`, or `N gap(s) · stage <stage>`. */
export function featureSummary(report: FeatureReport): string {
  return report.done ? "done" : `${report.gaps.length} gap(s) · stage ${report.stage}`;
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
  const [agent, agentClis] = await Promise.all([agentState(config, llmClient), probeAgentClis()]);
  if (context.signal?.aborted) return emptyDoctor("cancelled", null);
  const engine = engineState(config, native.status === "ok", voiceEngine);
  const old = oldExplanations(request.root);
  const payload: DoctorPayload = {
    languages: [...config.languages],
    configFile: existsSync(join(request.root, CONFIG_FILE)),
    guessed: config.guessed,
    agent,
    agentClis,
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

/** The effective agent, its source and its credential or binary state, without the key value. */
async function agentState(config: Config, llmClient: (agent: string | null, options: LlmClientOptions) => LlmSetup): Promise<DoctorPayload["agent"]> {
  let resolved: ReturnType<typeof resolveAgent>;
  try {
    resolved = resolveAgent(config.agent, process.env, homedir());
  } catch (error) {
    return { configured: config.agent, source: null, state: "error", detail: messageOf(error) };
  }
  const { agent: configured, source } = resolved;
  if (configured === null) return { configured: null, source: null, state: "missing", detail: "not configured (keylang.json `agent`, KEYLANG_AGENT or ~/.config/keylang/agents.json)" };
  try {
    const setup = llmClient(config.agent, { root: config.root });
    if ("missing" in setup) return { configured, source, state: "missing", detail: setup.missing };
    const bin = setup.client.bin;
    if (bin === undefined) return { configured, source, state: "ok", detail: "credentials found" };
    // Login is the CLI's own: keylang never runs a login or status command.
    const version = await cliVersion(bin);
    return { configured, source, state: "ok", detail: `${bin} (${version ?? "no version"}); login is checked on the first request` };
  } catch (error) {
    return { configured, source, state: "error", detail: messageOf(error) };
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
    `agent: ${agent.configured === null ? agent.detail : `${agent.configured}${agent.source === null || agent.source === "keylang.json" ? "" : ` (from ${agent.source})`}: ${agent.detail}`}`,
    `agent CLIs: ${payload.agentClis.map((cli) => `${cli.name} ${cli.bin === null ? "—" : (cli.version ?? "?")}`).join(" · ")}`,
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
