// The contract of the shared workspace operations (ADR 0008): each request,
// the payload of its result, the envelope a result comes in, and what an
// operation may use besides its request. Types, but for two constants: the
// default target of `wire` and the kinds that write.

import type { Analysis, AnalysisRequest } from "../analyze.ts";
import type { C4Format, C4Level } from "../c4-export.ts";
import type { CheckFormat, CheckReportData } from "../check-format.ts";
import type { CheckCounts, CheckResult } from "../check-results.ts";
import type { StaticMode } from "../config.ts";
import type { Diagnostic } from "../diag.ts";
import type { EdgeExplanation } from "../explain-edge.ts";
import type { BriefBatch } from "../explain-llm.ts";
import type { AgentCliProbe, AgentSource } from "../agent-cli.ts";
import type { BriefPlan, PlannedBriefEntry, StaleInventory } from "../explain-inventory.ts";
import type { NodeSummary } from "../explain-node.ts";
import type { AnswerMiss, ExplainLink, OfflineExplanation, SavedAnswer } from "../explain-offline.ts";
import type { ExplanationDetail } from "../explanations.ts";
import type { Document } from "../ir.ts";
import type { ParseFormat } from "../parse-format.ts";
import type { Verdict } from "../verdict.ts";
import type { FeatureReport, Stage } from "../feature-status.ts";
import type { HarnessCategory, HarnessChoice, HarnessName, HarnessStep } from "../harness.ts";
import type { Stats } from "../graph.ts";
import type { DraftStatus } from "../draft-llm.ts";
import type { CommittedStep, SourceInputs } from "../map.ts";
import type { CoverageItem } from "../snapshot.ts";
import type { ModuleStatus } from "../voice-local.ts";
import type { TracePlan } from "../trace-plan.ts";

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

/** Whether a feature file is done, on the saved state of the repository (cli.md `feature`); a rule fail blocks only when it is this change's. */
export interface FeatureRequest {
  kind: "feature";
  /** Repository root (absolute). */
  root: string;
  /** The feature: `<dir>/features/<slug>.md`. */
  slug: string;
  /**
   * Base commit the plan is compared with; default the merge-base of HEAD
   * with the main branch, else `HEAD` (`featureBaseOrigin`). An explicit one
   * that cannot be read fails with code 2.
   */
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
 * [--strict] [--static <mode>]`). Read-only but for the local fact cache,
 * saved best-effort for the next run. The output format is not part of the
 * request: it only shows the result.
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

/** One message of the clip's conversation: the person's or the clip's. */
export interface ChatTurn {
  role: "you" | "clip";
  text: string;
}

/**
 * The clip's reply (ADR 0021): one answer of the configured model to the
 * conversation, with what the session shows around it. The TUI is its only
 * caller (spec П3: the chat is interactive, no CLI command asks it). It
 * writes nothing: a `keylang path=<file>` block of the answer comes back as
 * a candidate the TUI gates and writes as a proposal.
 */
export interface AssistantReplyRequest {
  kind: "assistant-reply";
  /** Repository root (absolute). */
  root: string;
  /** The conversation, oldest first, the person's new message last; the prompt keeps the newest 16 000 characters, whole messages. */
  history: ChatTurn[];
  /** The open file as the session shows it, unsaved edits included; the prompt keeps 400 lines around the cursor. Null: no file is open. */
  file: {
    path: string;
    text: string;
    /** The cursor's line, 0-based. */
    line: number;
    /** The ID under the cursor, or null. */
    id: string | null;
  } | null;
  /** The F4 pack as the model reads it (`contextText`), without its buffer item: `file` is that buffer. Null without an analysis. */
  context: string | null;
  /** The open feature file's stage and gaps (`gapLine`), as the status line has them; null for any other file. */
  feature: { stage: Stage; gaps: string[] } | null;
  /** The open questions, `file:line: text` each (the clip's counter); empty when there are none. */
  questions: string[];
}

/** Every request `runOperation` takes: its `kind` names the operation and the payload of its result. */
export type OperationRequest = DoctorRequest | FeatureRequest | FeatureQuestionsRequest | ExportC4Request | MapCheckRequest | MapRequest | BaselineRequest | AgentsRequest | FmtRequest | WireRequest | CheckRequest | ExplainEdgeRequest | ExplainRequest | ExplainLlmRequest | ExplainPlanRequest | ExplainBatchRequest | InitRequest | ExportRequest | ParseRequest | TracePlanRequest | DraftFlowRequest | DraftRulesRequest | DraftLayoutRequest | CodeToSpecRequest | SpecToCodeRequest | ApplyCodeRequest | AssistantReplyRequest;

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

/** How an operation ended: `completed` (with or without findings), `failed`, or `cancelled` by the caller. */
export type OperationStatus = "completed" | "failed" | "cancelled";

/** One line of an operation's human-readable report, with its level. */
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

/** What the model answered in the clip's chat. Nothing was written. */
export interface AssistantReplyPayload {
  /** The model that answered (`cli:claude:<model>` when its CLI reported one). */
  agent: string;
  /** The answer without its `keylang path=` blocks; empty when it was only a block. */
  reply: string;
  /** The first `keylang path=<file>` block the answer closed, with its full text: a candidate the TUI gates and writes as a proposal. Null: none. */
  proposal: { path: string; text: string } | null;
  /** The paths of the answer's other `keylang path=` blocks, left out: only the first closed one is a candidate. */
  dropped: string[];
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
 * `generated`: a file with a `keylang:generated` marker, its generator's, left as it is;
 * `unreadable`, `failed`: the file could not be read or written (`error`),
 * a target outside the repository included;
 * `not-attempted`: the write was cancelled before this file.
 */
export interface FmtFile {
  /** The file as the given paths name it: what the CLI prints. */
  shown: string;
  /** POSIX, relative to the root. */
  path: string;
  state: "current" | "stale" | "formatted" | "invalid" | "explanation" | "generated" | "unreadable" | "failed" | "not-attempted";
  /** `unreadable`, `failed`: why. */
  error?: string;
  /** `invalid`: the structural diagnostics, as `formatSource` gives them. */
  diagnostics?: Diagnostic[];
  /** `generated`: the command its marker names (`keylang map`), when it names one. */
  generator?: string;
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
  counts: CheckCounts;
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
  /** The root `.gitignore` and keylang's local cache; null when the stage did not run. */
  gitignore: GitignoreStage | null;
  map: OperationEnvelope<"map"> | null;
  baseline: OperationEnvelope<"baseline"> | null;
  agents: OperationEnvelope<"agents"> | null;
}

/**
 * Whether the root `.gitignore` lists `.keylang/`: the index, the fact
 * cache, proposals, test reports and traces are a local cache, never the
 * spec. Repository hygiene, not a harness file: `--agents=none` has it too.
 */
export interface GitignoreStage {
  /** `.gitignore`, relative to the root. */
  file: string;
  /** It lists `.keylang/`: it did before the run, or this run added it. */
  listed: boolean;
  /** This run appended `.keylang/` (never in a check). */
  written: boolean;
  /** Why it was neither read nor written: a link out of the repository, a directory, a change since it was read. */
  refused: string | null;
  /** The I/O error of the read or the write, or null. */
  error: string | null;
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
  "assistant-reply": AssistantReplyPayload;
}

/** The result of one operation. File paths are POSIX, relative to the request's root. */
export type OperationResult = { [K in OperationRequest["kind"]]: OperationEnvelope<K> }[OperationRequest["kind"]];

/** The result of one operation of kind `K`: how it ended, its exit code and payload, its report, and the files it wrote, removed or proposed. */
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
