// Code from a planned spec: `spec-to-code` builds a candidate (a stub or the
// model's code, with failing tests) and proposes it file by file;
// `spec-to-code --apply` writes a candidate already built.

import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { analyze, type Analysis } from "../analyze.ts";
import { CONFIG_FILE, loadConfig, toPosix } from "../config.ts";
import { errorText } from "../diag.ts";
import { existingText, readTextOrNull } from "../files.ts";
import { codeProposalProblem, PROPOSALS_DIR, proposalWriteProblem, writeProposal } from "../proposals.ts";
import { fileDiffText, plannedCodeTarget, specToCode, specToCodeText, type CodeCandidate, type FileCandidate } from "../spec-to-code.ts";
import type { LlmClient } from "../llm.ts";
import { sourceInputProblems, sourceInputs } from "../map.ts";
import { landing, writeAtomic, writeProblem } from "../safe-write.ts";
import type { ApplyCodePayload, ApplyCodeRequest, CandidateBasis, CodeProposalTarget, CommitGate, OperationContext, OperationEnvelope, OperationMessage, SpecToCodeCandidate, SpecToCodePayload, SpecToCodeRequest } from "./types.ts";
import { empty, modelSetup, specHashes, specProblems } from "./shared.ts";

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
export async function runSpecToCode(request: SpecToCodeRequest, context: OperationContext): Promise<OperationEnvelope<"spec-to-code">> {
  const { root } = request;
  if (!isAbsolute(root)) return empty("spec-to-code", "failed", 2, "spec-to-code: root must be an absolute path");
  if (request.id.trim() === "") return empty("spec-to-code", "failed", 2, "spec-to-code: a planned id is required");
  const mode = request.mode ?? "algo";
  if (mode !== "algo" && mode !== "llm") return empty("spec-to-code", "failed", 2, `spec-to-code: --mode must be algo or llm, got \`${String(mode)}\``);
  if (context.signal?.aborted) return empty("spec-to-code", "cancelled", null);
  context.onProgress?.({ text: "reading the sources" });
  let analyzed: Analysis;
  try {
    analyzed = await (context.analyze ?? analyze)({ root, withoutEvidence: true });
  } catch (error) {
    return empty("spec-to-code", "failed", 2, errorText(error));
  }
  if (context.signal?.aborted) return empty("spec-to-code", "cancelled", null);
  const snapshot = analyzed.snapshot;
  if (!snapshot) return empty("spec-to-code", "failed", 2, "spec-to-code: no supported source files; run `keylang init`");
  const basis: CandidateBasis = { ...sourceInputs(analyzed.config, snapshot.manifest.files), specs: specHashes(root, analyzed.docs) };
  const into = request.into === undefined ? undefined : toPosix(request.into);
  const setup = await modelSetup(mode, analyzed.config, "spec-to-code");
  if ("error" in setup) return empty("spec-to-code", "failed", 2, setup.error);
  const nothingWritten: OperationMessage = { level: "info", text: "nothing was written; the files and any proposal waiting for them are kept" };
  const model = setup.client;
  if (model !== null && request.output === "proposal") {
    // Checked before the model is asked: a code file whose proposal cannot be written costs no request. The ID's own problems are specToCode's.
    const placed = plannedCodeTarget(analyzed, request.id, into);
    if (!("error" in placed)) {
      const store = `${PROPOSALS_DIR}/${placed.file}`;
      const storeProblem = writeProblem(root, store, { under: PROPOSALS_DIR, generated: true });
      if (storeProblem !== null) return empty("spec-to-code", "failed", 2, `${store}: ${storeProblem}`);
      if ((request.pending ?? "refuse") === "refuse" && existingText(join(root, store)) !== null) {
        return { ...empty("spec-to-code", "failed", 1), messages: [{ level: "error", text: `${store}: a proposal for ${placed.file} is waiting; merge it (m) or remove it before a new candidate` }, nothingWritten] };
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
  const { LlmCancelled } = await import("../llm.ts");
  let candidate: SpecToCodeCandidate;
  try {
    candidate = specToCodeCandidate(root, await specToCode(analyzed, request.id, into, counted, context.signal ? { signal: context.signal } : {}), basis);
  } catch (error) {
    if (error instanceof LlmCancelled || context.signal?.aborted) return empty("spec-to-code", "cancelled", null);
    return empty("spec-to-code", "failed", 2, errorText(error));
  }
  if (context.signal?.aborted) return empty("spec-to-code", "cancelled", null);
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
  if (request.output === "preview") return { ...empty("spec-to-code", "completed", 0), payload, messages: [...notes, { level: "info", text: `${payload.summary} for ${candidate.id}; a preview, nothing written` }] };
  // The whole set is checked before the first write.
  for (const target of candidate.targets) {
    const problem = codeProposalProblem(root, target.file);
    if (problem !== null) return { ...empty("spec-to-code", "failed", 2), payload, messages: [...notes, { level: "error", text: `spec-to-code: ${target.file}: ${problem}` }] };
    const store = `${PROPOSALS_DIR}/${target.file}`;
    const storeProblem = writeProblem(root, store, { under: PROPOSALS_DIR, generated: true });
    if (storeProblem !== null) return { ...empty("spec-to-code", "failed", 2), payload, messages: [...notes, { level: "error", text: `${store}: ${storeProblem}` }] };
  }
  if ((request.pending ?? "refuse") === "refuse") {
    const waiting = candidate.targets.filter((target) => target.pending !== null).map((target) => `${PROPOSALS_DIR}/${target.file}: a proposal for ${target.file} is waiting; merge it (m) or remove it before a new candidate`);
    if (waiting.length > 0) {
      payload.refused = waiting;
      return { ...empty("spec-to-code", "failed", 1), payload, messages: [...notes, ...waiting.map((text) => ({ level: "error" as const, text })), nothingWritten] };
    }
  }
  context.onProgress?.({ text: "waiting to write" });
  let gate: CommitGate;
  try {
    gate = await context.beforeCommit?.({ targets: candidate.targets.map((target) => target.file) });
  } catch (error) {
    return { ...empty("spec-to-code", "failed", 2), payload, messages: [...notes, { level: "error", text: errorText(error) }] };
  }
  if (context.signal?.aborted) return { ...empty("spec-to-code", "cancelled", null), payload };
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
      return { ...empty("spec-to-code", "failed", 2), payload, messages: [...notes, { level: "error", text: errorText(error) }] };
    }
  }
  if (refused.length > 0) {
    payload.refused = refused;
    return { ...empty("spec-to-code", "failed", 1), payload, messages: [...notes, ...refused.map((text) => ({ level: "error" as const, text })), nothingWritten] };
  }
  // One file at a time, each atomic: what was written before a Cancel or an error is named, never undone behind the person's back.
  const written: string[] = [];
  const sofar = (): OperationMessage[] => (written.length === 0 ? [] : [{ level: "info", text: `proposed before it stopped: ${written.join(", ")}` }]);
  for (const target of candidate.targets) {
    if (written.length > 0 && context.signal?.aborted) {
      payload.proposals = [...written];
      return { ...empty("spec-to-code", "cancelled", null), payload, messages: [...notes, ...sofar()], proposals: [...written] };
    }
    const store = `${PROPOSALS_DIR}/${target.file}`;
    context.onProgress?.({ text: `writing ${store}` });
    try {
      writeProposal(root, target.file, target.after, { target: target.before, proposal: target.pending });
    } catch (error) {
      payload.proposals = [...written];
      payload.error = errorText(error);
      return { ...empty("spec-to-code", "failed", 2), payload, messages: [...notes, { level: "error", text: payload.error }, ...sofar()], proposals: [...written] };
    }
    written.push(store);
  }
  payload.proposals = written;
  return {
    ...empty("spec-to-code", "completed", 0),
    payload,
    messages: [...notes, { level: "info", text: `proposed ${written.join(", ")} for ${candidate.id}; each merges on its own in MERGE` }],
    proposals: [...written],
  };
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
export async function runApplyCode(request: ApplyCodeRequest, context: OperationContext): Promise<OperationEnvelope<"apply-code">> {
  const { root, candidate } = request;
  if (!isAbsolute(root)) return empty("apply-code", "failed", 2, "spec-to-code: root must be an absolute path");
  if (candidate.targets.length === 0) return empty("apply-code", "failed", 2, "spec-to-code: the candidate has no file to apply");
  if (context.signal?.aborted) return empty("apply-code", "cancelled", null);
  const payload: ApplyCodePayload = { id: candidate.id, files: candidate.targets.map((target) => ({ role: target.role, file: target.file, state: "not-attempted" })), refused: [], error: null };
  const nothingWritten: OperationMessage = { level: "info", text: "nothing was written; the files and any proposal waiting for them are kept" };
  const check = (): OperationEnvelope<"apply-code"> | null => {
    let problems: ReturnType<typeof applyProblems>;
    try {
      problems = applyProblems(request);
    } catch (error) {
      return { ...empty("apply-code", "failed", 2, errorText(error)), payload };
    }
    if (problems.policy !== null) return { ...empty("apply-code", "failed", 2, problems.policy), payload };
    if (problems.refused.length === 0) return null;
    payload.refused = problems.refused;
    return { ...empty("apply-code", "failed", 1), payload, messages: [...problems.refused.map((text) => ({ level: "error" as const, text })), nothingWritten] };
  };
  context.onProgress?.({ text: "checking the candidate's files" });
  const before = check();
  if (before !== null) return before;
  context.onProgress?.({ text: "waiting to write" });
  let gate: CommitGate;
  try {
    gate = await context.beforeCommit?.({ targets: candidate.targets.map((target) => target.file) });
  } catch (error) {
    return { ...empty("apply-code", "failed", 2, errorText(error)), payload };
  }
  if (context.signal?.aborted) return { ...empty("apply-code", "cancelled", null), payload };
  if (gate && gate.refused.length > 0) {
    payload.refused = [...gate.refused];
    return { ...empty("apply-code", "failed", 1), payload, messages: [...gate.refused.map((text) => ({ level: "error" as const, text })), nothingWritten] };
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
    return { ...empty("apply-code", status, status === "failed" ? 2 : null), payload, messages, written: [...written] };
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
      step.error = errorText(error);
      payload.error = step.error;
      return stopped("failed", step.error);
    }
    step.state = "completed";
    written.push(target.file);
  }
  return {
    ...empty("apply-code", "completed", 0),
    payload,
    messages: [{ level: "info", text: `${written.join(", ")} written for ${candidate.id}; no test was run` }],
    written: [...written],
  };
}
