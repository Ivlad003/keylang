// The plain-language explanation of a node (design §5.4, ADR 0004): what goes
// to the model, how the answer is kept, and when it is stale. An explanation
// lives in `<dir>/explain/<id>.md` (a brief for the explained map in
// `<dir>/explain/brief/<id>.md`) beside its baseline — the closure
// fingerprint of the node when it was written — and never in a verdict.

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { snapshotSource } from "./agent-context.ts";
import type { Analysis } from "./analyze.ts";
import { briefOf } from "./brief.ts";
import type { Config } from "./config.ts";
import { formatSummary, summarizeNode, type NodeSummary } from "./explain-node.ts";
import { explainDir, explanationOf, explanationPath, OLD_EXPLAIN_DIR, readStoredExplanation, snapshotBaseline, storedIds, type ExplanationDetail, type StoredExplanation } from "./explanations.ts";
import { EXTERNAL } from "./graph.ts";
import type { LlmRequest } from "./llm.ts";
import { plannedDecl } from "./lsp-features.ts";
import { compareText } from "./span.ts";

export type Explanation = StoredExplanation;

/** The saved explanation of `id` at this detail: `short` and `full` share `<id>.md`, a brief has its own file. */
export function readExplanation(config: Config, id: string, detail: ExplanationDetail = "short"): Explanation | null {
  const e = readStoredExplanation(config.root, explanationPath(config, id, detail));
  return e !== null && (e.detail === "brief") === (detail === "brief") ? e : null;
}

/** IDs of every saved explanation (`answers`) or brief, sorted. */
export function explainedIds(config: Config, kind: "answers" | "briefs"): string[] {
  return storedIds(config.root, kind === "briefs" ? `${explainDir(config)}/brief` : explainDir(config));
}

/** Explanation files in the store of keylang 0.1, which is not read any more. */
export function oldExplanations(root: string): number {
  const dir = join(root, OLD_EXPLAIN_DIR);
  return existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith(".md")).length : 0;
}

/** How to move the store of keylang 0.1 to where explanations live now. */
export function moveHint(config: Config, count: number): string {
  return `${count} explanation(s) in ${OLD_EXPLAIN_DIR}/ are not read any more; move them: mkdir -p ${explainDir(config)} && mv ${OLD_EXPLAIN_DIR}/*.md ${explainDir(config)}/`;
}

/**
 * The baseline an explanation of `id` is compared with now (`snapshotBaseline`):
 * "" for a planned node, which has no code yet; null when the id is gone.
 */
export function currentBaseline(analysis: Analysis, id: string): string | null {
  if (analysis.snapshot?.nodes[id]) return snapshotBaseline(analysis.snapshot, id);
  return plannedDecl(analysis.docs, id) ? "" : null;
}

export function isStale(analysis: Analysis, id: string, e: Explanation): boolean {
  return currentBaseline(analysis, id) !== e.closure;
}

/** A model's brief as saved: one or two sentences in one paragraph, cut by the rule doc comments follow. */
export function briefText(answer: string): string {
  return briefOf(answer) ?? answer.trim();
}

/**
 * `` `a.b.c` `` in the answer that are neither snapshot IDs nor declared
 * `planned`. Only a path that starts with a layer is an ID at all: `` `process.env` `` is code.
 */
export function unknownIds(analysis: Analysis, text: string): string[] {
  const layers = new Set([...analysis.config.layers.keys(), ...Object.keys(analysis.snapshot?.nodes ?? {}).map((id) => id.split(".")[0]!)]);
  const out = new Set<string>();
  for (const m of text.matchAll(/`([\p{L}_$][\p{L}\p{N}_$-]*(?:\.[\p{L}_$][\p{L}\p{N}_$-]*)+)`/gu)) {
    const id = m[1]!;
    if (!layers.has(id.split(".")[0]!)) continue;
    if (analysis.snapshot?.nodes[id] === undefined && plannedDecl(analysis.docs, id) === null) out.add(id);
  }
  return [...out].sort();
}

/**
 * The request: the node's summary, its code, the signatures around it, and
 * the words of the specs that mention it (layer, flows, rules). Not the repository.
 */
export function explanationRequest(analysis: Analysis, summary: NodeSummary, options: { lang: string; detail: ExplanationDetail; briefs: ReadonlyMap<string, StoredExplanation> }): LlmRequest {
  const nodes = analysis.snapshot?.nodes ?? {};
  const signature = (id: string): string => `${id}${nodes[id]?.signature ? ` ${nodes[id]!.signature}` : ""}`;
  const node = nodes[summary.id];
  // The code as the snapshot read it: a file changed since is left out, and the prompt says so.
  const source = node?.file ? snapshotSource(analysis, node.file) : null;
  const code = source !== null && node?.line !== null && node?.line !== undefined ? sourceLines(source, node.line, node.endLine ?? node.line) : null;
  const parts = [
    `Node:\n${formatSummary(summary)}`,
    ...(code ? [`Code (${node!.file}:${node!.line}):\n\`\`\`\n${code}\n\`\`\``] : []),
    ...(node?.file && source === null ? [`Code: not shown — ${node.file} changed after the analysis read it.`] : []),
    ...(summary.calls.length > 0 ? [`It calls:\n${summary.calls.map(signature).join("\n")}`] : []),
    ...(summary.callers.length > 0 ? [`Called by:\n${summary.callers.map(signature).join("\n")}`] : []),
    ...members(analysis, summary.id, options.briefs),
    `Layer: ${summary.id.split(".")[0]}`,
  ];
  const brief = options.detail === "brief";
  const detail = brief
    ? `Write at most two short sentences in one paragraph, no line breaks, about ${BRIEF_TARGET} characters in all: what the node does, for a reader scanning a map of the codebase. Do not repeat its name or signature.`
    : options.detail === "short"
      ? "Write 2-3 sentences: what the node is for and why it exists."
      : "Explain its purpose, then its steps and branches, then edge cases. No line-by-line narration.";
  const system = [
    "You explain one node of a codebase to a developer, using the architecture description keylang keeps for the repository.",
    `Answer in the language with code \`${options.lang}\`. ${detail}`,
    "Refer to code only by the IDs given in the input, written in backticks. Never invent an ID.",
    summary.kind.startsWith("planned") ? "The node is planned and has no code yet: describe the intention, not behavior." : "Describe what the code does, not what its name suggests.",
    // A brief is read on the map, not as an answer: remarks about the input there are noise (ticket explained-map/12).
    brief ? "Say only what the code does; no remarks about the input or what it leaves out." : "Say plainly when the input does not show something (for example calls keylang could not resolve).",
  ].join("\n");
  return { system, prompt: parts.join("\n\n"), maxTokens: options.detail === "full" ? 4096 : 1024 };
}

/** The length a brief is asked for: under the 280 characters `briefOf` cuts at, so a brief ends on its own sentence. */
const BRIEF_TARGET = 200;

/** Most member lines a prompt carries; a layer of hundreds of modules is summed up by its first ones. */
const MAX_MEMBERS = 80;

/**
 * The members right under a module, class or layer with their explanations
 * (doc comments, briefs): a layer is explained through its modules, a module
 * through its functions and types.
 */
function members(analysis: Analysis, id: string, briefs: ReadonlyMap<string, StoredExplanation>): string[] {
  const snapshot = analysis.snapshot;
  if (!snapshot || snapshot.nodes[id]?.kind === "fn" || snapshot.nodes[id]?.kind === "type") return [];
  const prefix = `${id}.`;
  const direct = Object.keys(snapshot.nodes).filter((other) => other.startsWith(prefix) && !other.slice(prefix.length).includes("."));
  if (direct.length === 0) return [];
  const lines = direct.slice(0, MAX_MEMBERS).map((other) => {
    const node = snapshot.nodes[other]!;
    const kind = node.class ? "class" : node.kind;
    const e = explanationOf(snapshot, briefs, other);
    return `- ${kind} \`${other}\`${e ? `: ${e.text}` : ""}`;
  });
  if (direct.length > MAX_MEMBERS) lines.push(`… (${direct.length - MAX_MEMBERS} more not shown)`);
  return [`Members, with what the explained map says about them:\n${lines.join("\n")}`];
}

function sourceLines(text: string, from: number, to: number): string {
  // A long body is cut, and the prompt says so: the summary and signatures carry the rest.
  const lines = text.split("\n").slice(from - 1, to);
  return lines.length > 200 ? `${lines.slice(0, 200).join("\n")}\n… (${lines.length - 200} more lines not shown)` : lines.join("\n");
}

/** Which briefs a batch writes: nodes with no explanation or a stale brief (`missing`), or only stale briefs (`stale`). */
export type BriefBatch = "missing" | "stale";

/** Levels of the explained map, explained bottom-up: a parent's prompt carries its members' briefs. */
export type BriefLevel = "fn/type" | "class/module" | "layer";

export interface PlannedBrief {
  id: string;
  level: BriefLevel;
  /** Nodes of one wave only need briefs of earlier waves: fn and types, then modules deepest first, then layers. */
  wave: number;
}

/**
 * The nodes a batch explains, in the order it asks: fn and types, then
 * classes and modules from the deepest up, then layers. A node with a doc
 * comment is never asked about: the code already says what it does. External
 * packages have no code here, so they are left out.
 */
export function planBriefs(analysis: Analysis, batch: BriefBatch, briefs: ReadonlyMap<string, StoredExplanation>): PlannedBrief[] {
  const snapshot = analysis.snapshot;
  if (!snapshot) return [];
  const out: PlannedBrief[] = [];
  for (const [id, node] of Object.entries(snapshot.nodes)) {
    if (node.layer === EXTERNAL || node.doc) continue;
    const brief = briefs.get(id);
    const stale = brief !== undefined && snapshotBaseline(snapshot, id) !== brief.closure;
    if (batch === "stale" ? !stale : brief !== undefined && !stale) continue;
    const depth = id.split(".").length;
    if (node.kind === "fn" || node.kind === "type") out.push({ id, level: "fn/type", wave: 0 });
    else if (node.kind === "module") out.push({ id, level: "class/module", wave: 1000 - depth });
    else out.push({ id, level: "layer", wave: 1000 });
  }
  return out.sort((a, b) => a.wave - b.wave || compareText(a.id, b.id));
}

/** A rough size of the batch for `--dry-run`: about four characters a token, and a brief of about 80 tokens out. */
export function estimateTokens(analysis: Analysis, plan: readonly PlannedBrief[], briefs: ReadonlyMap<string, StoredExplanation>): { input: number; output: number } {
  let chars = 0;
  for (const { id } of plan) {
    const result = summarizeNode(analysis, id);
    if ("unknown" in result) continue;
    const request = explanationRequest(analysis, result.summary, { lang: analysis.config.explain.lang, detail: "brief", briefs });
    chars += request.system.length + request.prompt.length;
  }
  return { input: Math.ceil(chars / 4), output: plan.length * 80 };
}
