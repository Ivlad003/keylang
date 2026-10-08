// The explanations of a node: the offline help and summary (`explain`), one
// answer of the model (`explain --llm`), what needs explaining
// (`explain --stale`, the plan of a brief batch) and the batch itself.

import { isAbsolute, resolve } from "node:path";
import { analyze, type Analysis } from "../analyze.ts";
import { errorText } from "../diag.ts";
import { answerText, briefRequest, briefText, currentBaseline, explanationRequest, moveHint, oldExplanations, readExplanation, type Explanation } from "../explain-llm.ts";
import { selectedAgent } from "../agent-cli.ts";
import { briefPlan, briefPlanText, defaultBriefJobs, staleInventory, staleInventoryText } from "../explain-inventory.ts";
import { formatSummary } from "../explain-node.ts";
import { codeExplanation, isDiagnosticCode, nodeExplanation, offlineExplanationText, savedAnswer, savedAnswerMiss, savedAnswerText, unknownIdMessage } from "../explain-offline.ts";
import { explainDir, explanationPath, formatStoredExplanation, loadBriefs, SYSTEM_ID, systemBaseline } from "../explanations.ts";
import { readTextOrNull } from "../files.ts";
import { sourceInputProblems, sourceInputs } from "../map.ts";
import { landing, writeAtomic, writeProblem } from "../safe-write.ts";
import { compareText } from "../span.ts";
import type { CommitGate, ExplainBatchPayload, ExplainBatchRequest, ExplainLlmPayload, ExplainLlmRequest, ExplainPayload, ExplainPlanPayload, ExplainPlanRequest, ExplainRequest, OperationContext, OperationEnvelope, OperationMessage, OperationStatus } from "./types.ts";
import { empty, specHashes, specProblems } from "./shared.ts";

/**
 * `keylang explain <code|id>` offline. A code needs no analysis: its help, or
 * failed 2 `unknown code`. An ID is read on a fresh analysis of the saved code
 * and specs (no evidence, no fact cache written): the summary with the saved
 * answer and brief, or failed 2 with the CLI's `unknown id … (did you mean …)`.
 * A store of keylang 0.1 is a warning note, which the CLI prints to stderr.
 * Code 0 with a payload. Nothing is written and no model is asked.
 */
export async function runExplain(request: ExplainRequest, context: OperationContext): Promise<OperationEnvelope<"explain">> {
  if (!isAbsolute(request.root)) return empty("explain", "failed", 2, "explain: root must be an absolute path");
  const subject = request.subject;
  if (subject === "") return empty("explain", "failed", 2, "explain: a code or an id is required");
  if (context.signal?.aborted) return empty("explain", "cancelled", null);
  if (isDiagnosticCode(subject)) {
    const found = codeExplanation(subject);
    if (found === null) return empty("explain", "failed", 2, `unknown code \`${subject}\``);
    const payload: ExplainPayload = { ...found, snapshotId: null, text: offlineExplanationText(found) };
    return { ...empty("explain", "completed", 0), payload, messages: [{ level: "info", text: `${found.code}: offline help` }] };
  }
  context.onProgress?.({ text: "reading the saved code and specs" });
  const analyzeSaved = context.analyze ?? analyze;
  let analyzed: Analysis;
  try {
    analyzed = await analyzeSaved({ root: request.root, withoutEvidence: true });
  } catch (error) {
    return empty("explain", "failed", 2, errorText(error));
  }
  if (context.signal?.aborted) return empty("explain", "cancelled", null);
  const old = oldExplanations(analyzed.config.root);
  const notes: OperationMessage[] = old > 0 ? [{ level: "warning", text: `note: ${moveHint(analyzed.config, old)}` }] : [];
  const found = nodeExplanation(analyzed, subject, request.detail ?? analyzed.config.explain.detail);
  if ("unknown" in found) {
    const failed = empty("explain", "failed", 2);
    return { ...failed, messages: [...notes, { level: "error", text: unknownIdMessage(subject, found.suggestion) }] };
  }
  const payload: ExplainPayload = { ...found, snapshotId: analyzed.snapshot?.snapshotId ?? null, text: offlineExplanationText(found) };
  const answer = found.saved === null ? "no saved answer" : `saved answer ${found.saved.fresh ? "fresh" : "stale"}`;
  return { ...empty("explain", "completed", 0), payload, messages: [...notes, { level: "info", text: `${found.summary.kind} ${found.id}: ${answer}` }] };
}

/**
 * `keylang explain <id> --llm`. The analysis of the saved files (no
 * evidence, nothing persisted); an unknown ID is 2 with the CLI's message.
 * A fresh saved answer of the same detail and language is the result (0),
 * nothing asked or written. No usable model: the offline summary and the
 * saved answer with the CLI's note (0), nothing asked. Otherwise the inputs
 * are fixed — keylang.json, the sources, the specs and the saved file's
 * bytes — and the model is asked once (`answerText` drops a remark and a
 * fence around the whole answer; a brief is then cut by `briefText`). A
 * Cancel during the answer is cancelled; a timeout, an empty answer or a
 * provider error is 2; both keep the saved file. After `beforeCommit`
 * (which may refuse: 1) the inputs and the saved file must still be the
 * ones read (else 1, nothing written); then the file is written atomically
 * (0; 2 on an I/O error). The map is never written here: the explained map
 * follows the next `keylang map`.
 */
export async function runExplainLlm(request: ExplainLlmRequest, context: OperationContext): Promise<OperationEnvelope<"explain-llm">> {
  const { root, id } = request;
  if (!isAbsolute(root)) return empty("explain-llm", "failed", 2, "explain: root must be an absolute path");
  if (id === "") return empty("explain-llm", "failed", 2, "explain: a code or an id is required");
  if (isDiagnosticCode(id)) return empty("explain-llm", "failed", 2, `explain --llm: \`${id}\` is a diagnostic code: its help is offline (explain ${id})`);
  if (context.signal?.aborted) return empty("explain-llm", "cancelled", null);
  context.onProgress?.({ text: "reading the saved code and specs" });
  let analyzed: Analysis;
  try {
    analyzed = await (context.analyze ?? analyze)({ root, withoutEvidence: true });
  } catch (error) {
    return empty("explain-llm", "failed", 2, errorText(error));
  }
  if (context.signal?.aborted) return empty("explain-llm", "cancelled", null);
  const config = analyzed.config;
  const old = oldExplanations(config.root);
  const notes: OperationMessage[] = old > 0 ? [{ level: "warning", text: `note: ${moveHint(config, old)}` }] : [];
  const detail = request.detail ?? config.explain.detail;
  const found = nodeExplanation(analyzed, id, detail);
  if ("unknown" in found) return { ...empty("explain-llm", "failed", 2), messages: [...notes, { level: "error", text: unknownIdMessage(id, found.suggestion) }] };
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
    return { ...empty("explain-llm", "completed", 0), payload, messages: [...notes, { level: "info", text: `${what}: the saved ${detail} answer is fresh; read, no request` }] };
  }
  const { answeringAgent, llmClient, LlmCancelled } = await import("../llm.ts");
  const setup = llmClient(config.agent, { root: config.root });
  if ("missing" in setup) {
    payload.source = "offline";
    payload.unavailable = setup.missing;
    payload.text = `${formatSummary(found.summary)}\n${previous === null ? "" : `\n${savedAnswerText(previous)}`}`;
    return { ...empty("explain-llm", "completed", 0), payload, messages: [...notes, { level: "warning", text: `${setup.missing}; showing what the snapshot says` }] };
  }
  const client = setup.client;
  payload.source = "model";
  payload.answer = null;
  // What the answer is computed from: a commit checks these are still the files on disk.
  const inputs = sourceInputs(config, analyzed.snapshot?.manifest.files ?? []);
  const specs = specHashes(root, analyzed.docs);
  const failed = (exitCode: 1 | 2, messages: OperationMessage[]): OperationEnvelope<"explain-llm"> => ({ ...empty("explain-llm", "failed", exitCode), payload, messages: [...notes, ...messages] });
  context.onProgress?.({ text: `asking ${client.agent}` });
  let answer: string;
  let reported: string | null = null;
  try {
    answer = await client.complete(explanationRequest(analyzed, found.summary, { lang, detail, briefs: loadBriefs(config) }), { ...(context.signal ? { signal: context.signal } : {}), onModel: (model) => (reported = model) });
  } catch (error) {
    if (error instanceof LlmCancelled || context.signal?.aborted) return empty("explain-llm", "cancelled", null);
    payload.error = errorText(error);
    return failed(2, [{ level: "error", text: payload.error }]);
  }
  if (context.signal?.aborted) return empty("explain-llm", "cancelled", null);
  const text = detail === "brief" ? briefText(answer) : answerText(answer);
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
    payload.error = errorText(error);
    return failed(2, [{ level: "error", text: payload.error }]);
  }
  if (context.signal?.aborted) return { ...empty("explain-llm", "cancelled", null), payload };
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
    payload.error = errorText(error);
    return failed(2, [{ level: "error", text: payload.error }]);
  }
  if (problems.length > 0) return refuse(problems);
  context.onProgress?.({ text: `writing ${file}` });
  try {
    writeAtomic(landing(resolve(root, file))!, formatStoredExplanation(e));
  } catch (error) {
    payload.error = errorText(error);
    return failed(2, [{ level: "error", text: payload.error }]);
  }
  payload.written = file;
  payload.text = savedAnswerText(payload.answer);
  return { ...empty("explain-llm", "completed", 0), payload, messages: [...notes, { level: "info", text: `${what}: ${client.agent} wrote the ${detail} answer to ${file}` }], written: [file] };
}

/**
 * `explain --stale` and the plan of `explain --missing|--stale` (with
 * `--dry-run` its estimate) on a fresh analysis of the saved code and specs
 * (no evidence, no fact cache written). A brief plan needs a snapshot: failed
 * 2 with the CLI's message without one. An empty plan is completed 0 (zero
 * work). A store of keylang 0.1 is a warning note. No model, nothing written.
 */
export async function runExplainPlan(request: ExplainPlanRequest, context: OperationContext): Promise<OperationEnvelope<"explain-plan">> {
  if (!isAbsolute(request.root)) return empty("explain-plan", "failed", 2, "explain: root must be an absolute path");
  if (request.list === "briefs") {
    for (const [flag, value] of [["--limit", request.limit], ["--jobs", request.jobs]] as const) {
      if (value !== undefined && (!Number.isInteger(value) || value < 1)) return empty("explain-plan", "failed", 2, `${flag} must be a positive whole number, got \`${value}\``);
    }
  }
  if (context.signal?.aborted) return empty("explain-plan", "cancelled", null);
  context.onProgress?.({ text: "reading the saved code, specs and explanations" });
  const analyzeSaved = context.analyze ?? analyze;
  let analyzed: Analysis;
  try {
    analyzed = await analyzeSaved({ root: request.root, withoutEvidence: true });
  } catch (error) {
    return empty("explain-plan", "failed", 2, errorText(error));
  }
  if (context.signal?.aborted) return empty("explain-plan", "cancelled", null);
  const old = oldExplanations(analyzed.config.root);
  const notes: OperationMessage[] = old > 0 ? [{ level: "warning", text: `note: ${moveHint(analyzed.config, old)}` }] : [];
  const snapshotId = analyzed.snapshot?.snapshotId ?? null;
  if (request.list === "stale-saved") {
    const inventory = staleInventory(analyzed);
    const payload: ExplainPlanPayload = { list: "stale-saved", ...inventory, snapshotId, text: staleInventoryText(inventory) };
    const stale = inventory.entries.filter((entry) => entry.state === "stale").length;
    return { ...empty("explain-plan", "completed", 0), payload, messages: [...notes, { level: "info", text: `${stale} stale, ${inventory.entries.length - stale} gone of ${inventory.saved} saved explanation(s)` }] };
  }
  if (!analyzed.snapshot) return { ...empty("explain-plan", "failed", 2), messages: [...notes, { level: "error", text: "no snapshot: explain --missing needs a repository with sources" }] };
  const plan = briefPlan(analyzed, { batch: request.batch, limit: request.limit ?? null, jobs: request.jobs ?? defaultBriefJobs(selectedAgent(analyzed.config.agent)), estimate: request.estimate === true });
  const payload: ExplainPlanPayload = { list: "briefs", ...plan, snapshotId, text: briefPlanText(plan) };
  const summary = plan.plan.length === 0 ? "nothing to explain" : `${plan.plan.length} brief(s) planned${plan.estimate === null ? "" : `, ~${plan.estimate.input} in, ~${plan.estimate.output} out (approximate)`}`;
  return { ...empty("explain-plan", "completed", 0), payload, messages: [...notes, { level: "info", text: summary }] };
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
export async function runExplainBatch(request: ExplainBatchRequest, context: OperationContext): Promise<OperationEnvelope<"explain-batch">> {
  const { root } = request;
  if (!isAbsolute(root)) return empty("explain-batch", "failed", 2, "explain: root must be an absolute path");
  for (const [flag, value] of [["--limit", request.limit], ["--jobs", request.jobs]] as const) {
    if (value !== undefined && (!Number.isInteger(value) || value < 1)) return empty("explain-batch", "failed", 2, `${flag} must be a positive whole number, got \`${value}\``);
  }
  if (context.signal?.aborted) return empty("explain-batch", "cancelled", null);
  context.onProgress?.({ text: "reading the saved code, specs and briefs" });
  let analyzed: Analysis;
  try {
    analyzed = await (context.analyze ?? analyze)({ root, withoutEvidence: true });
  } catch (error) {
    return empty("explain-batch", "failed", 2, errorText(error));
  }
  if (context.signal?.aborted) return empty("explain-batch", "cancelled", null);
  const config = analyzed.config;
  const old = oldExplanations(config.root);
  const notes: OperationMessage[] = old > 0 ? [{ level: "warning", text: `note: ${moveHint(config, old)}` }] : [];
  if (!analyzed.snapshot) return { ...empty("explain-batch", "failed", 2), messages: [...notes, { level: "error", text: "no snapshot: explain --missing needs a repository with sources" }] };
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
    return { ...empty("explain-batch", "completed", 0), payload, messages: [...notes, { level: "info", text: "nothing to explain: zero work, no request" }] };
  }
  const { answeringAgent, llmClient, LlmCancelled } = await import("../llm.ts");
  const setup = llmClient(config.agent, { root: config.root });
  if ("missing" in setup) return { ...empty("explain-batch", "failed", 2), messages: [...notes, { level: "error", text: setup.missing }] };
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
      return [`the sources could not be read again: ${errorText(error)}`];
    }
  };
  const planned = plan.map((entry) => entry.id);
  const files = new Map(planned.map((id) => [id, explanationPath(config, id, "brief", planned)]));
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
      return finish(id, errorText(error));
    }
    if (cancelled()) stop("cancelled");
    if (payload.stopped !== null) return void notStarted.add(id);
    const text = briefText(answer);
    if (text === "") return finish(id, `${client.agent} answered without text; nothing written`);
    // Asked once, before the first write: from here on the session defers its own writes and Cancel stops between briefs.
    gate ??= Promise.resolve()
      .then(() => context.beforeCommit?.({ targets: [...files.values()] }))
      .catch((error: unknown) => ({ refused: [errorText(error)] }));
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
      return finish(id, errorText(error));
    }
    if (target !== null) return finish(id, `${file}: ${target}`);
    // The repository's baseline reads the layer briefs this batch just wrote.
    const closure = id === SYSTEM_ID ? systemBaseline(analyzed.snapshot!, briefs) : (currentBaseline(analyzed, id) ?? "");
    const e: Explanation = { agent: answeringAgent(client, reported), date: new Date().toISOString().slice(0, 10), closure, lang, detail: "brief", text };
    try {
      writeAtomic(landing(resolve(root, file))!, formatStoredExplanation(e));
    } catch (error) {
      return finish(id, errorText(error));
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
  const result = (status: OperationStatus, exitCode: 0 | 1 | null, messages: OperationMessage[]): OperationEnvelope<"explain-batch"> => ({ ...empty("explain-batch", status, exitCode), payload, messages: [...notes, ...messages], written });
  if (payload.stopped === "cancelled") return result("cancelled", null, [...failures, { level: "info", text: `cancelled: ${counts}; the written briefs stay` }]);
  if (payload.stopped !== null) {
    const why = payload.stopped === "outdated" ? "the inputs changed while the batch ran: no further brief was asked for or written" : "the session refused the write";
    return result("failed", 1, [...payload.refused.map((text) => ({ level: "error" as const, text })), ...failures, { level: "info", text: `${why}; ${counts}; the written briefs stay` }]);
  }
  return result("completed", payload.failed.length > 0 ? 1 : 0, [...failures, { level: "info", text: counts }]);
}
