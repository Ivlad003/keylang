// Drafts of specs from the code, by the snapshot's edges or by a model, written
// only as proposals: `draft flow`, `draft rules`, `draft map` (printed only)
// and `code-to-spec`.

import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { analyze, type Analysis } from "../analyze.ts";
import { CONFIG_FILE, configToJson, guessLayout, loadConfig, toPosix, type Config } from "../config.ts";
import { errorText } from "../diag.ts";
import { existingText } from "../files.ts";
import { sectionNodes, walk, type Document } from "../ir.ts";
import { parse } from "../parser.ts";
import { PROPOSALS_DIR, proposalProblem } from "../proposals.ts";
import { changedFlows, codeToSpec, draftFlow, draftRules, withFlow, withRules, type FlowDraft } from "../draft.ts";
import type { LlmClient } from "../llm.ts";
import type { DraftStatus } from "../draft-llm.ts";
import { addDrafts, STATS_FILE, updateStats } from "../stats.ts";
import { sourceInputs } from "../map.ts";
import { stronglyConnected } from "../scc.ts";
import { writeProblem } from "../safe-write.ts";
import { gitChangedLines } from "../git-changes.ts";
import type { CodeFlow, CodeModelInfo, CodeToSpecCandidate, CodeToSpecPayload, CodeToSpecRequest, DraftFlowPayload, DraftFlowRequest, DraftLayoutPayload, DraftLayoutRequest, DraftModelInfo, DraftRulesPayload, DraftRulesRequest, FlowCandidate, OperationContext, OperationEnvelope, OperationMessage, RulesCandidate, RulesModelInfo } from "./types.ts";
import { commitProposal, empty, generatedIn, modelSetup, proposalRefusal, rootRelative } from "./shared.ts";

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
export async function runDraftFlow(request: DraftFlowRequest, context: OperationContext): Promise<OperationEnvelope<"draft-flow">> {
  const { root, trigger } = request;
  const mode = request.mode ?? "algo";
  if (!isAbsolute(root)) return empty("draft-flow", "failed", 2, "draft flow: root must be an absolute path");
  if (trigger === "") return empty("draft-flow", "failed", 2, "draft flow: a trigger id is required");
  if (context.signal?.aborted) return empty("draft-flow", "cancelled", null);
  context.onProgress?.({ text: "reading the sources" });
  let analyzed: Analysis;
  try {
    analyzed = await (context.analyze ?? analyze)({ root, withoutEvidence: true });
  } catch (error) {
    return empty("draft-flow", "failed", 2, errorText(error));
  }
  if (context.signal?.aborted) return empty("draft-flow", "cancelled", null);
  const snapshot = analyzed.snapshot;
  if (!snapshot) return empty("draft-flow", "failed", 2, "draft: no supported source files; run `keylang init`");
  if (snapshot.nodes[trigger]?.kind !== "fn") {
    const hint = analyzed.index.suggest(trigger);
    return empty("draft-flow", "failed", 2, `draft flow: \`${trigger}\` is not a fn of the snapshot${hint ? ` (did you mean \`${hint}\`?)` : ""}`);
  }
  // What the draft was computed from: a commit checks that keylang.json and the sources are still these.
  const inputs = sourceInputs(analyzed.config, snapshot.manifest.files);
  const algo = draftFlow(snapshot, trigger, request.name !== undefined ? { name: request.name } : {});
  const setup = await modelSetup(mode, analyzed.config);
  if ("error" in setup) return empty("draft-flow", "failed", 2, setup.error);
  const specDir = rootRelative(root, analyzed.config.dir);
  const generated = generatedIn(analyzed.docs);
  // The target and its waiting proposal as they are now, before the model answers: the basis of the write.
  let basis: FlowCandidate;
  try {
    basis = flowCandidate(root, specDir, generated, algo, request.into);
  } catch (error) {
    return empty("draft-flow", "failed", 2, errorText(error));
  }
  // A refusal before the model is asked: the payload is the algo candidate, so the target's state stays visible.
  const early = (exitCode: 1 | 2, error: string, refused: string[] = []): OperationEnvelope<"draft-flow"> => ({
    ...empty("draft-flow", "failed", exitCode),
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
    if ("cancelled" in drafted) return empty("draft-flow", "cancelled", null);
    if ("error" in drafted) return empty("draft-flow", "failed", 2, drafted.error);
    ({ draft, model } = drafted);
  }
  const candidate: FlowCandidate = model === null ? basis : { ...basis, flow: draft.text, steps: draft.steps, text: basis.problem === null ? withFlow(basis.before, draft) : null };
  const summary = model === null ? `${draft.steps.length} step(s)` : draftCountsText(model.counts);
  const payload: DraftFlowPayload = { output: request.output, mode: model === null ? "algo" : mode, candidate, summary, model, fallback: setup.fallback, statsError: null, proposal: null, refused: [], error: null };
  const notes = draftNotes(payload);
  if (request.output === "preview") {
    return { ...empty("draft-flow", "completed", 0), payload, messages: [...notes, { level: "info", text: `flow \`${draft.name}\` for ${candidate.target} (${payload.summary}); a preview, nothing written` }] };
  }
  const failed = (exitCode: 1 | 2, messages: OperationMessage[]): OperationEnvelope<"draft-flow"> => ({ ...empty("draft-flow", "failed", exitCode), payload, messages: [...notes, ...messages] });
  const refuse = (reasons: string[]): OperationEnvelope<"draft-flow"> => {
    payload.refused = reasons;
    return failed(1, [...reasons.map((text) => ({ level: "error" as const, text })), { level: "info", text: "nothing was written; the target and any proposal waiting for it are kept" }]);
  };
  const committed = await commitProposal({ root, specDir, generated, target: candidate.target, text: candidate.text!, expected: { target: candidate.before, proposal: candidate.pending }, config: analyzed.config, inputs }, context);
  if ("cancelled" in committed) return { ...empty("draft-flow", "cancelled", null), payload };
  if ("refused" in committed) return refuse(committed.refused);
  if ("failed" in committed) {
    if (committed.writing) payload.error = committed.failed;
    return failed(2, [{ level: "error", text: committed.failed }]);
  }
  const store = committed.proposal;
  payload.proposal = store;
  if (model !== null) payload.statsError = countProposed(root, model.counts);
  return {
    ...empty("draft-flow", "completed", 0),
    payload,
    messages: [
      ...notes,
      ...(payload.statsError === null ? [] : [{ level: "warning" as const, text: `${STATS_FILE} not updated: ${payload.statsError}` }]),
      { level: "info", text: `${store}: proposed flow \`${draft.name}\` for ${candidate.target} (${payload.summary})` },
    ],
    proposals: [store],
  };
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
export async function runDraftRules(request: DraftRulesRequest, context: OperationContext): Promise<OperationEnvelope<"draft-rules">> {
  const { root } = request;
  const mode = request.mode ?? "algo";
  if (!isAbsolute(root)) return empty("draft-rules", "failed", 2, "draft rules: root must be an absolute path");
  if (context.signal?.aborted) return empty("draft-rules", "cancelled", null);
  context.onProgress?.({ text: "reading the sources" });
  let analyzed: Analysis;
  try {
    analyzed = await (context.analyze ?? analyze)({ root, withoutEvidence: true });
  } catch (error) {
    return empty("draft-rules", "failed", 2, errorText(error));
  }
  if (context.signal?.aborted) return empty("draft-rules", "cancelled", null);
  const snapshot = analyzed.snapshot;
  if (!snapshot) return empty("draft-rules", "failed", 2, "draft: no supported source files; run `keylang init`");
  const inputs = sourceInputs(analyzed.config, snapshot.manifest.files);
  // Module dependencies inside the repository: a cycle among them keeps `no-cycles` out of the draft.
  const modules = new Map<string, Set<string>>();
  for (const [id, node] of Object.entries(snapshot.nodes)) if (node.kind === "module") modules.set(id, new Set((node.deps ?? []).filter((dep) => snapshot.nodes[dep]?.layer !== "external")));
  const cyclic = stronglyConnected(modules).length > 0;
  const algo = draftRules(snapshot, cyclic);
  const setup = await modelSetup(mode, analyzed.config, "draft rules");
  if ("error" in setup) return empty("draft-rules", "failed", 2, setup.error);
  const specDir = rootRelative(root, analyzed.config.dir);
  const generated = generatedIn(analyzed.docs);
  let basis: RulesCandidate;
  try {
    basis = rulesCandidate(root, specDir, generated, algo, request.into);
  } catch (error) {
    // A target that cannot be read (a directory) fails a proposal; a preview, like `--print`, never needs it.
    if (request.output === "proposal") return empty("draft-rules", "failed", 2, errorText(error));
    basis = { rules: algo, target: toPosix(request.into ?? `${specDir}/rules.md`), problem: errorText(error), before: null, pending: null, text: null };
  }
  const fallbackNote: OperationMessage[] = setup.fallback === null ? [] : [{ level: "warning", text: setup.fallback }];
  const nothingWritten: OperationMessage = { level: "info", text: "nothing was written; the target and any proposal waiting for it are kept" };
  if (request.output === "proposal") {
    const refusal = proposalRefusal(root, basis, request.pending);
    if (refusal !== null) {
      return {
        ...empty("draft-rules", "failed", refusal.exitCode),
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
    const { LlmCancelled } = await import("../llm.ts");
    const { draftRulesWithModel } = await import("../draft-llm.ts");
    try {
      const drafted = await draftRulesWithModel(analyzed, client, mode === "llm" ? "llm" : "hybrid", algo, basis.target, context.signal ? { signal: context.signal } : {});
      if (context.signal?.aborted) return empty("draft-rules", "cancelled", null);
      rules = drafted.text;
      model = { agent: client.agent, counts: drafted.counts, conflicts: drafted.conflicts };
    } catch (error) {
      if (error instanceof LlmCancelled || context.signal?.aborted) return empty("draft-rules", "cancelled", null);
      return empty("draft-rules", "failed", 2, errorText(error));
    }
  }
  const candidate: RulesCandidate = { ...basis, rules, text: basis.problem === null ? withRules(basis.before, rules) : null };
  const summary = model === null ? rulesCountText(rules) : draftCountsText(model.counts);
  const payload: DraftRulesPayload = { output: request.output, mode: model === null ? "algo" : mode, candidate, cyclic, summary, model, fallback: setup.fallback, statsError: null, proposal: null, refused: [], error: null };
  // The CLI's stderr notes: the fallback, then each conflict with its evidence.
  const notes: OperationMessage[] = [...fallbackNote, ...(model?.conflicts ?? []).map((conflict) => ({ level: "warning" as const, text: `conflict: ${conflict}` }))];
  if (request.output === "preview") {
    return { ...empty("draft-rules", "completed", 0), payload, messages: [...notes, { level: "info", text: `rules for ${candidate.target} (${summary}); a preview, nothing written` }] };
  }
  const failed = (exitCode: 1 | 2, messages: OperationMessage[]): OperationEnvelope<"draft-rules"> => ({ ...empty("draft-rules", "failed", exitCode), payload, messages: [...notes, ...messages] });
  const committed = await commitProposal({ root, specDir, generated, target: candidate.target, text: candidate.text!, expected: { target: candidate.before, proposal: candidate.pending }, config: analyzed.config, inputs }, context);
  if ("cancelled" in committed) return { ...empty("draft-rules", "cancelled", null), payload };
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
    ...empty("draft-rules", "completed", 0),
    payload,
    messages: [
      ...notes,
      ...(payload.statsError === null ? [] : [{ level: "warning" as const, text: `${STATS_FILE} not updated: ${payload.statsError}` }]),
      { level: "info", text: `${committed.proposal}: proposed rules for ${candidate.target} (${summary})` },
    ],
    proposals: [committed.proposal],
  };
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
export async function runDraftLayout(request: DraftLayoutRequest, context: OperationContext): Promise<OperationEnvelope<"draft-layout">> {
  const { root } = request;
  const mode = request.mode ?? "algo";
  if (!isAbsolute(root)) return empty("draft-layout", "failed", 2, "draft map: root must be an absolute path");
  if (context.signal?.aborted) return empty("draft-layout", "cancelled", null);
  let config: Config;
  try {
    config = loadConfig(root);
  } catch (error) {
    return empty("draft-layout", "failed", 2, errorText(error));
  }
  const configExists = existsSync(join(root, CONFIG_FILE));
  const setup = await modelSetup(mode, config, "draft map");
  if ("error" in setup) return empty("draft-layout", "failed", 2, setup.error);
  const fallbackNote: OperationMessage[] = setup.fallback === null ? [] : [{ level: "warning", text: setup.fallback }];
  if (setup.client === null) {
    // The guess loadConfig makes: folders out of the map (`exclude`, `outside`, `assume`) are no layers.
    const layers = guessLayout(root, [...config.exclude, ...config.outside, ...config.assume]).layers;
    const payload: DraftLayoutPayload = { mode: "algo", layers: Object.fromEntries(layers), preview: configToJson({ ...config, layers, guessed: true }), configExists, agent: null, fallback: setup.fallback };
    // The CLI's closing note on stderr.
    const note = configExists ? `printed only; ${CONFIG_FILE} is unchanged` : `no ${CONFIG_FILE}; \`keylang init\` writes this layout`;
    return { ...empty("draft-layout", "completed", 0), payload, messages: [...fallbackNote, { level: "info", text: note }] };
  }
  const client = setup.client;
  context.onProgress?.({ text: "reading the sources" });
  let analyzed: Analysis;
  try {
    analyzed = await (context.analyze ?? analyze)({ root, withoutEvidence: true });
  } catch (error) {
    return empty("draft-layout", "failed", 2, errorText(error));
  }
  if (context.signal?.aborted) return empty("draft-layout", "cancelled", null);
  context.onProgress?.({ text: `asking ${client.agent}` });
  const { LlmCancelled } = await import("../llm.ts");
  const { draftLayoutWithModel } = await import("../draft-llm.ts");
  let layers: Record<string, string[]>;
  try {
    layers = await draftLayoutWithModel(analyzed, client, analyzed.snapshot?.manifest.files.map((file) => file.path) ?? [], context.signal ? { signal: context.signal } : {});
  } catch (error) {
    if (error instanceof LlmCancelled || context.signal?.aborted) return empty("draft-layout", "cancelled", null);
    return empty("draft-layout", "failed", 2, errorText(error));
  }
  if (context.signal?.aborted) return empty("draft-layout", "cancelled", null);
  const preview = configToJson({ ...analyzed.config, layers: new Map(Object.entries(layers)), guessed: false });
  const payload: DraftLayoutPayload = { mode, layers, preview, configExists, agent: client.agent, fallback: null };
  return { ...empty("draft-layout", "completed", 0), payload, messages: [{ level: "info", text: `proposed by ${client.agent}; printed only; ${CONFIG_FILE} is unchanged` }] };
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
export async function runCodeToSpec(request: CodeToSpecRequest, context: OperationContext): Promise<OperationEnvelope<"code-to-spec">> {
  const { root } = request;
  const mode = request.mode ?? "algo";
  const file = request.file;
  const since = request.since;
  const line = request.line ?? null;
  if (!isAbsolute(root)) return empty("code-to-spec", "failed", 2, "code-to-spec: root must be an absolute path");
  if (file !== undefined && since !== undefined) return empty("code-to-spec", "failed", 2, "code-to-spec: give a path or --since, not both");
  if (file === undefined && since === undefined) return empty("code-to-spec", "failed", 2, "code-to-spec: a path, optionally with :line, or --since <git-ref> is required");
  if (line !== null && !(Number.isInteger(line) && line >= 0)) return empty("code-to-spec", "failed", 2, `code-to-spec: ${file}:${line}: a line is a whole number`);
  if (context.signal?.aborted) return empty("code-to-spec", "cancelled", null);
  context.onProgress?.({ text: "reading the sources" });
  let analyzed: Analysis;
  try {
    analyzed = await (context.analyze ?? analyze)({ root, withoutEvidence: true });
  } catch (error) {
    return empty("code-to-spec", "failed", 2, errorText(error));
  }
  if (context.signal?.aborted) return empty("code-to-spec", "cancelled", null);
  const snapshot = analyzed.snapshot;
  if (!snapshot) return empty("code-to-spec", "failed", 2, "code-to-spec: no supported source files; run `keylang init`");
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
      return empty("code-to-spec", "failed", 2, errorText(error));
    }
    described = changes.named;
    if (described.length > 0) notes.push({ level: "warning", text: `changed and already in flows (review those): ${described.join(", ")}` });
    if (changes.drafts.length === 0) {
      const payload: CodeToSpecPayload = { output: request.output, mode: "algo", since, described, candidate: null, summary: "nothing to draft", model: null, fallback: null, statsError: null, proposal: null, refused: [], error: null };
      return { ...empty("code-to-spec", "completed", 0), payload, messages: [...notes, { level: "info", text: `no fn outside the flows changed since ${since}; nothing proposed` }] };
    }
    drafted = { file: null, line: null, since, name: "changes", drafts: changes.drafts };
  } else {
    try {
      const position = codeToSpec(snapshot, file!, line);
      drafted = { file: file!, line, since: null, name: position.name, drafts: position.drafts };
    } catch (error) {
      return empty("code-to-spec", "failed", 2, errorText(error));
    }
  }
  const setup = await modelSetup(mode, analyzed.config, "code-to-spec");
  if ("error" in setup) return { ...empty("code-to-spec", "failed", 2), messages: [...notes, { level: "error", text: setup.error }] };
  if (setup.fallback !== null) notes.push({ level: "warning", text: setup.fallback });
  const specDir = rootRelative(root, analyzed.config.dir);
  const generated = generatedIn(analyzed.docs);
  const target = toPosix(request.into ?? `${specDir}/flows/${drafted.name}.md`);
  // The target and its waiting proposal as they are now, before any model answers: the basis of the write.
  let basis: CodeToSpecCandidate;
  let unreadable: string | null = null;
  try {
    basis = codeToSpecCandidate(root, specDir, generated, drafted, target);
  } catch (error) {
    unreadable = errorText(error);
    basis = { ...codePosition(drafted, target), problem: unreadable, before: null, pending: null, text: null };
  }
  const draftedMode = setup.client === null ? "algo" : mode;
  const payload: CodeToSpecPayload = { output: request.output, mode: draftedMode, since: drafted.since, described, candidate: basis, summary: codeSummary(basis.flows, null), model: null, fallback: setup.fallback, statsError: null, proposal: null, refused: [], error: null };
  const nothingWritten: OperationMessage = { level: "info", text: "nothing was written; the target and any proposal waiting for it are kept" };
  if (request.output === "proposal") {
    // A target that cannot be read (a directory) fails a proposal with the read's error, as the CLI did; a preview, like `--print`, never needs it.
    if (unreadable !== null) return { ...empty("code-to-spec", "failed", 2), payload, messages: [...notes, { level: "error", text: unreadable }] };
    // Checked before the model is asked: a target that cannot take the proposal costs no request.
    const refusal = proposalRefusal(root, basis, request.pending, "code-to-spec");
    if (refusal !== null) {
      payload.refused = refusal.refused;
      return { ...empty("code-to-spec", "failed", refusal.exitCode), payload, messages: [...notes, { level: "error", text: refusal.error }, ...(refusal.refused.length > 0 ? [nothingWritten] : [])] };
    }
  }
  let candidate = basis;
  if (setup.client !== null) {
    const drafts = await modelFlows(request, mode === "llm" ? "llm" : "hybrid", analyzed, setup.client, drafted.drafts, notes, context);
    if ("cancelled" in drafts) return empty("code-to-spec", "cancelled", null);
    if ("error" in drafts) return { ...empty("code-to-spec", "failed", 2), messages: [...notes, { level: "error", text: drafts.error }] };
    const modelled = { ...drafted, drafts: drafts.drafts };
    candidate = { ...basis, ...codePosition(modelled, target), text: basis.problem === null ? mergedFlows(basis.before, drafts.drafts) : null };
    payload.model = drafts.model;
    payload.candidate = candidate;
  }
  payload.summary = codeSummary(candidate.flows, payload.model);
  const names = candidate.flows.map((flow) => `\`${flow.name}\``).join(", ");
  if (request.output === "preview") {
    return { ...empty("code-to-spec", "completed", 0), payload, messages: [...notes, { level: "info", text: `${names} for ${target} (${payload.summary}); a preview, nothing written` }] };
  }
  const committed = await commitProposal({ root, specDir, generated, target, text: candidate.text!, expected: { target: candidate.before, proposal: candidate.pending }, config: analyzed.config, inputs }, context);
  if ("cancelled" in committed) return { ...empty("code-to-spec", "cancelled", null), payload };
  if ("refused" in committed) {
    payload.refused = committed.refused;
    return { ...empty("code-to-spec", "failed", 1), payload, messages: [...notes, ...committed.refused.map((text) => ({ level: "error" as const, text })), nothingWritten] };
  }
  if ("failed" in committed) {
    if (committed.writing) payload.error = committed.failed;
    return { ...empty("code-to-spec", "failed", 2), payload, messages: [...notes, { level: "error", text: committed.failed }] };
  }
  payload.proposal = committed.proposal;
  if (payload.model !== null) payload.statsError = countProposed(root, payload.model.counts);
  return {
    ...empty("code-to-spec", "completed", 0),
    payload,
    messages: [
      ...notes,
      ...(payload.statsError === null ? [] : [{ level: "warning" as const, text: `${STATS_FILE} not updated: ${payload.statsError}` }]),
      { level: "info", text: `${committed.proposal}: proposed ${names} for ${target} (${payload.summary})` },
    ],
    proposals: [committed.proposal],
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
  const { LlmCancelled } = await import("../llm.ts");
  const { draftFlowWithModel } = await import("../draft-llm.ts");
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
      return { error: errorText(error) };
    }
  }
  return { drafts, model };
}

/** `2 rule(s)`: the list items of a drafted `# rules` section. */
function rulesCountText(rules: string): string {
  return `${rules.split("\n").filter((line) => line.startsWith("- ")).length} rule(s)`;
}

/** The drafted lines count as proposed once the proposal exists; a count that cannot be written never fails the draft: its error, or null. */
function countProposed(root: string, counts: Record<DraftStatus, number>): string | null {
  try {
    updateStats(root, (stats) => addDrafts(stats, counts, "proposed"));
    return null;
  } catch (error) {
    return errorText(error);
  }
}

/** The model's draft, judged against the snapshot; a Cancel during its answer is `cancelled`, never an error. */
async function modelDraft(request: DraftFlowRequest, mode: "llm" | "hybrid", analyzed: Analysis, client: LlmClient, context: OperationContext): Promise<{ draft: FlowDraft; model: DraftModelInfo } | { error: string } | { cancelled: true }> {
  context.onProgress?.({ text: `asking ${client.agent}` });
  const { LlmCancelled } = await import("../llm.ts");
  const { draftFlowWithModel } = await import("../draft-llm.ts");
  try {
    const model = await draftFlowWithModel(analyzed, request.trigger, client, mode, request.name, request.context, context.signal ? { signal: context.signal } : {});
    if (context.signal?.aborted) return { cancelled: true };
    return {
      draft: { name: model.name, text: model.text, steps: flowSteps(model.text, request.trigger) },
      model: { agent: client.agent, counts: model.counts, unknown: model.unknown, rounds: model.rounds, dropped: model.dropped },
    };
  } catch (error) {
    if (error instanceof LlmCancelled || context.signal?.aborted) return { cancelled: true };
    return { error: errorText(error) };
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
