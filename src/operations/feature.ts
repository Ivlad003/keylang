// Feature readiness: the status of a feature file (`keylang feature`) and
// the open questions a model proposes for it (c4-zoom/11).

import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { contextForIds, contextText } from "../agent-context.ts";
import { analyze, type Analysis } from "../analyze.ts";
import { loadConfig, specPath, type Config } from "../config.ts";
import { errorText } from "../diag.ts";
import { existingText } from "../files.ts";
import { PROPOSALS_DIR, proposalProblem } from "../proposals.ts";
import { featureStatus, idsIn, type FeatureBase, type FeatureReport, type Gap, type Hint } from "../feature-status.ts";
import { sourceInputs } from "../map.ts";
import { writeProblem } from "../safe-write.ts";
import { deletedModuleIds, readFeatureBase } from "../git-changes.ts";
import type { FeatureQuestionsPayload, FeatureQuestionsRequest, FeatureRequest, OperationContext, OperationEnvelope, OperationMessage } from "./types.ts";
import { commitProposal, empty, generatedIn, modelSetup, proposalRefusal, rootRelative } from "./shared.ts";

/** The slugs `keylang feature` accepts: a plain file name under `<dir>/features/`. */
export const FEATURE_SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** The slug of `path` when it is a feature file `<dir>/features/<slug>.md`, else null. */
export function featureSlugOf(path: string, dir: string): string | null {
  const prefix = specPath(dir, "features/");
  if (!path.startsWith(prefix) || !path.endsWith(".md")) return null;
  const slug = path.slice(prefix.length, -3);
  return FEATURE_SLUG.test(slug) ? slug : null;
}

/**
 * The feature status of the saved files. It never takes unsaved text: a
 * caller with dirty buffers saves them first, explicitly. A missing file, an
 * invalid slug or config, or a failed analysis is a failure with code 2, not
 * a gap; gaps are code 1. Nothing is written but the local fact cache
 * (best-effort, as `check`).
 */
export async function runFeature(request: FeatureRequest, context: OperationContext): Promise<OperationEnvelope<"feature">> {
  if (!isAbsolute(request.root)) return empty("feature", "failed", 2, "feature: root must be an absolute path");
  if (request.slug === "") return empty("feature", "failed", 2, "feature: a slug is required");
  if (!FEATURE_SLUG.test(request.slug)) return empty("feature", "failed", 2, `feature: invalid slug \`${request.slug}\``);
  if (context.signal?.aborted) return empty("feature", "cancelled", null);
  let config: Config;
  try {
    config = loadConfig(request.root);
  } catch (error) {
    return empty("feature", "failed", 2, errorText(error));
  }
  const file = specPath(config.dir, `features/${request.slug}.md`);
  if (!existsSync(join(request.root, file))) return empty("feature", "failed", 2, `feature: ${file}: not found`);
  let analyzed: Analysis;
  try {
    analyzed = await (context.analyze ?? analyze)({ root: request.root, saveFacts: true });
  } catch (error) {
    return empty("feature", "failed", 2, errorText(error));
  }
  if (context.signal?.aborted) return empty("feature", "cancelled", null);
  let base: FeatureBase;
  try {
    base = readFeatureBase(request.root, file, request.since, "feature");
  } catch (error) {
    return empty("feature", "failed", 2, errorText(error));
  }
  const report = featureReportOf(analyzed, request.slug, base);
  if (report === null) return empty("feature", "failed", 2, `feature: ${file}: not a spec keylang read`);
  const messages: OperationMessage[] = [
    ...report.gaps.map((gap) => ({ level: "info" as const, text: gapLine(gap) })),
    ...report.hints.map((hint) => ({ level: "info" as const, text: hintLine(hint) })),
    { level: report.done ? "info" : "warning", text: featureSummary(report) },
  ];
  return {
    ...empty("feature", "completed", report.done ? 0 : 1),
    payload: { slug: request.slug, file, snapshot: analyzed.snapshot?.snapshotId ?? null, report },
    messages,
  };
}

/**
 * The report of feature `slug` on one analysis and its base: the CLI's
 * `feature`, MCP `feature_status`, and the TUI's status line on the session's
 * analysis. What changed since the base decides which rule fails are this
 * change's, as `check --changed` slices them; without it every one blocks.
 */
export function featureReportOf(analyzed: Analysis, slug: string, base: FeatureBase): FeatureReport | null {
  const config = analyzed.config;
  const changed = base.state === "unavailable" ? undefined : { files: new Set(base.changes.files), deleted: deletedModuleIds(config, base.changes.deleted) };
  return featureStatus(
    {
      dir: config.dir,
      docs: analyzed.docs,
      spec: analyzed.spec,
      diagnostics: analyzed.diagnostics,
      verdicts: analyzed.verdicts,
      nodes: analyzed.snapshot?.nodes ?? {},
      edges: analyzed.snapshot?.edges ?? [],
      base,
      ...(changed !== undefined ? { changed } : {}),
      index: analyzed.index,
      format: config.format,
      layers: [...config.layers.keys()],
    },
    slug,
  );
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

/** Most questions one request proposes: a person answers them in one sitting. */
const MAX_QUESTIONS = 5;

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
export async function runFeatureQuestions(request: FeatureQuestionsRequest, context: OperationContext): Promise<OperationEnvelope<"feature-questions">> {
  const { root, slug } = request;
  if (!isAbsolute(root)) return empty("feature-questions", "failed", 2, "feature questions: root must be an absolute path");
  if (!FEATURE_SLUG.test(slug)) return empty("feature-questions", "failed", 2, `feature questions: invalid slug \`${slug}\``);
  if (context.signal?.aborted) return empty("feature-questions", "cancelled", null);
  let analyzed: Analysis;
  try {
    analyzed = await (context.analyze ?? analyze)({ root, withoutEvidence: true });
  } catch (error) {
    return empty("feature-questions", "failed", 2, errorText(error));
  }
  if (context.signal?.aborted) return empty("feature-questions", "cancelled", null);
  const config = analyzed.config;
  const file = specPath(config.dir, `features/${slug}.md`);
  const doc = analyzed.docs.find((item) => item.path === file);
  if (!doc) return empty("feature-questions", "failed", 2, `feature questions: ${file}: not found`);
  const setup = await modelSetup("llm", config, "feature questions");
  if ("error" in setup) return empty("feature-questions", "failed", 2, setup.error.replace(" --mode llm", ""));
  const client = setup.client!;
  const specDir = rootRelative(root, config.dir);
  const generated = generatedIn(analyzed.docs);
  const problem = proposalProblem(root, specDir, file, generated);
  const store = `${PROPOSALS_DIR}/${file}`;
  const before = problem === null ? existingText(join(root, file)) : null;
  const pending = problem === null && writeProblem(root, store, { under: PROPOSALS_DIR, generated: true }) === null ? existingText(join(root, store)) : null;
  const refusal = proposalRefusal(root, { target: file, problem, pending }, "refuse", "feature questions");
  if (refusal !== null) return { ...empty("feature-questions", "failed", refusal.exitCode, refusal.error) };
  const inputs = sourceInputs(config, analyzed.snapshot?.manifest.files ?? []);
  const text = before ?? "";
  const around = analyzed.snapshot ? contextText(contextForIds(analyzed, idsIn(doc))) : "(no code snapshot)";
  context.onProgress?.({ text: `asking ${client.agent}` });
  const { LlmCancelled } = await import("../llm.ts");
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
    if (error instanceof LlmCancelled || context.signal?.aborted) return empty("feature-questions", "cancelled", null);
    return empty("feature-questions", "failed", 2, errorText(error));
  }
  if (context.signal?.aborted) return empty("feature-questions", "cancelled", null);
  const { questions, dropped } = questionLines(answer);
  const payload: FeatureQuestionsPayload = { file, agent: client.agent, questions, dropped, proposal: null };
  const droppedNote = dropped > 0 ? [{ level: "info" as const, text: `${dropped} line(s) of the answer were no \`- ? …\` question or past the fifth: left out` }] : [];
  if (questions.length === 0) return { ...empty("feature-questions", "completed", 0), payload, messages: [...droppedNote, { level: "info", text: `${client.agent} asked no question: nothing proposed` }] };
  const committed = await commitProposal({ root, specDir, generated, target: file, text: withQuestions(text, questions, slug), expected: { target: before, proposal: pending }, config, inputs }, context);
  if ("cancelled" in committed) return { ...empty("feature-questions", "cancelled", null), payload };
  if ("refused" in committed) return { ...empty("feature-questions", "failed", 1), payload, messages: [...committed.refused.map((text) => ({ level: "error" as const, text })), { level: "info", text: "nothing was written" }] };
  if ("failed" in committed) return { ...empty("feature-questions", "failed", 2), payload, messages: [{ level: "error", text: committed.failed }] };
  payload.proposal = committed.proposal;
  return {
    ...empty("feature-questions", "completed", 0),
    payload,
    messages: [...droppedNote, { level: "info", text: `${committed.proposal}: ${questions.length} open question(s) proposed for ${file}; MERGE accepts them hunk by hunk` }],
    proposals: [committed.proposal],
  };
}
