// `keylang explain <code|id>` without a model: the help of a diagnostic code,
// or what the snapshot and the specs say about a node with the explanations
// saved for it. One result for the CLI, the TUI palette and `e`: the doc
// comment of the code (in the summary), the saved short/full answer and the
// saved brief stay apart, each with its own provenance. Reads only; never asks a model.

import type { Analysis } from "./analyze.ts";
import { explainCode } from "./explain.ts";
import { formatSummary, summarizeNode, type NodeSummary } from "./explain-node.ts";
import { isStale, readExplanation, unknownIds, type Explanation } from "./explain-llm.ts";
import { explanationPath, type ExplanationDetail } from "./explanations.ts";
import { plannedDecl } from "./lsp-features.ts";

/** `K001`, `k104`: a diagnostic code, whatever its case, as the CLI tells it from an ID. */
export function isDiagnosticCode(subject: string): boolean {
  return /^k\d+$/i.test(subject);
}

/** An explanation a model wrote, as saved, judged against the current analysis. */
export interface SavedAnswer {
  agent: string;
  /** `YYYY-MM-DD`. */
  date: string;
  lang: string;
  detail: ExplanationDetail;
  text: string;
  /** Its baseline is the node's closure now. */
  fresh: boolean;
  /** `` `a.b` `` of the text that are neither snapshot IDs nor declared `planned`: shown, never followed. */
  unknownIds: string[];
  /** Where it is saved, relative to the root. */
  file: string;
}

/** A position the summary names: the node itself, a related ID, a flow or a rule line. Only known places; an ID without one has `file: null`. */
export interface ExplainLink {
  role: "location" | "calls" | "called by" | "depends on" | "used by" | "flow" | "rule";
  /** The related ID or flow name; null for the location and a rule line. */
  id: string | null;
  /** Relative to the root, POSIX; null for an ID with no file (an external package, a layer). */
  file: string | null;
  /** 1-based. */
  line: number;
  col: number;
  /** One line for a list: `calls domain.order.create  src/domain/order.ts:1`. */
  text: string;
}

export interface CodeExplanation {
  subject: "code";
  /** Upper case, as printed. */
  code: string;
  /** Cause, example and fix, the CLI's lines. */
  text: string;
}

export interface NodeExplanation {
  subject: "node";
  id: string;
  summary: NodeSummary;
  /** The detail asked for: the saved answer of that kind (`short` and `full` share one file). */
  detail: ExplanationDetail;
  saved: SavedAnswer | null;
  /** The saved brief of the explained map, apart from the answer; null when `detail` is `brief` (then it is `saved`). */
  brief: SavedAnswer | null;
  links: ExplainLink[];
}

export type OfflineExplanation = CodeExplanation | NodeExplanation;

/** The help of a diagnostic code, or null for a code keylang does not have. */
export function codeExplanation(code: string): CodeExplanation | null {
  const text = explainCode(code);
  return text === null ? null : { subject: "code", code: code.toUpperCase(), text };
}

/** The CLI's error for an ID that is neither in the snapshot nor declared `planned`. */
export function unknownIdMessage(id: string, suggestion: string | null): string {
  return `unknown id \`${id}\`${suggestion ? ` (did you mean \`${suggestion}\`?)` : ""}`;
}

/** The offline explanation of `id` on `analysis`, or why there is none. */
export function nodeExplanation(analysis: Analysis, id: string, detail: ExplanationDetail): NodeExplanation | { unknown: string; suggestion: string | null } {
  const result = summarizeNode(analysis, id);
  if ("unknown" in result) return result;
  const saved = readExplanation(analysis.config, id, detail);
  const brief = detail === "brief" ? null : readExplanation(analysis.config, id, "brief");
  return {
    subject: "node",
    id,
    summary: result.summary,
    detail,
    saved: saved === null ? null : savedAnswer(analysis, id, saved),
    brief: brief === null ? null : savedAnswer(analysis, id, brief),
    links: summaryLinks(analysis, result.summary),
  };
}

export function savedAnswer(analysis: Analysis, id: string, e: Explanation): SavedAnswer {
  return { agent: e.agent, date: e.date, lang: e.lang, detail: e.detail, text: e.text, fresh: !isStale(analysis, id, e), unknownIds: unknownIds(analysis, e.text), file: explanationPath(analysis.config, id, e.detail) };
}

/** A saved answer as the CLI prints it: the text, a blank line, `agent · date · fresh|stale`, and the made-up IDs. */
export function savedAnswerText(saved: SavedAnswer): string {
  const unknown = saved.unknownIds.length > 0 ? `unknown ids: ${saved.unknownIds.join(", ")}\n` : "";
  return `${saved.text}\n\n${saved.agent} · ${saved.date} · ${saved.fresh ? "fresh" : "stale"}\n${unknown}`;
}

/** The CLI's stdout for an offline explanation, byte for byte. */
export function offlineExplanationText(explanation: OfflineExplanation): string {
  if (explanation.subject === "code") return `${explanation.text}\n`;
  const summary = `${formatSummary(explanation.summary)}\n`;
  return explanation.saved === null ? summary : `${summary}\n${savedAnswerText(explanation.saved)}`;
}

/** The places the summary names, in its order; a related ID is a place only where the snapshot or a `planned` declares it. */
function summaryLinks(analysis: Analysis, summary: NodeSummary): ExplainLink[] {
  const links: ExplainLink[] = [];
  const at = summary.at === null ? null : /^(.*):(\d+)$/.exec(summary.at);
  if (at) links.push({ role: "location", id: null, file: at[1]!, line: Number(at[2]), col: 1, text: `at ${summary.at}` });
  const place = (file: string | null, line: number): string => (file === null ? "no file: outside the code" : `${file}:${line}`);
  const related = (role: ExplainLink["role"], ids: readonly string[]): void => {
    for (const id of ids) {
      const node = analysis.snapshot?.nodes[id];
      const plan = node?.file ? null : plannedDecl(analysis.docs, id);
      const where: [string | null, number, number] = node?.file ? [node.file, node.line ?? 1, 1] : plan ? [plan.file, plan.line, plan.col] : [null, 1, 1];
      const [file, line, col] = where;
      links.push({ role, id, file, line, col, text: `${role} ${id}  ${place(file, line)}${plan ? " (planned)" : ""}` });
    }
  };
  related("calls", summary.calls);
  related("called by", summary.callers);
  related("depends on", summary.deps);
  related("used by", summary.dependents);
  for (const name of summary.flows) {
    const flow = analysis.spec.flows.find((candidate) => candidate.name === name);
    const file = flow?.file ?? null;
    const line = flow?.span.start.line ?? 1;
    links.push({ role: "flow", id: name, file, line, col: flow?.span.start.col ?? 1, text: `flow ${name}  ${place(file, line)}` });
  }
  for (const rule of summary.rules) {
    const m = /^(.*?):(\d+): /.exec(rule);
    if (m) links.push({ role: "rule", id: null, file: m[1]!, line: Number(m[2]), col: 1, text: `rule ${rule}` });
  }
  return links;
}
