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
import { explainDir, explanationOf, explanationPath, loadBriefs, OLD_EXPLAIN_DIR, ownLayers, readStoredExplanation, snapshotBaseline, storedIds, SYSTEM_ID, systemBaseline, type ExplanationDetail, type StoredExplanation } from "./explanations.ts";
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
  if (id === SYSTEM_ID) return analysis.snapshot ? systemBaseline(analysis.snapshot, loadBriefs(analysis.config)) : null;
  if (analysis.snapshot?.nodes[id]) return snapshotBaseline(analysis.snapshot, id);
  return plannedDecl(analysis.docs, id) ? "" : null;
}

export function isStale(analysis: Analysis, id: string, e: Explanation): boolean {
  return currentBaseline(analysis, id) !== e.closure;
}

/** A model's brief as saved: one or two sentences in one paragraph of `answerText`, cut by the rule doc comments follow. */
export function briefText(answer: string): string {
  const text = answerText(answer);
  return briefOf(text) ?? text;
}

/**
 * A model's explanation as saved (`short`, `full`, and the text a brief is
 * cut from): without the wrappers a chatty answer puts around it — a
 * leading remark paragraph that ends with `:` or has fewer than four words
 * («Sure, here is the brief:», «Certainly!») while more follows, and one
 * fenced block (```, ```markdown, ```text) that holds the whole answer. A
 * heading, a list, a quote or code is never a remark, and a fence among
 * other text is the answer's own code block, so both stay.
 */
export function answerText(answer: string): string {
  let text = answer.trim();
  for (;;) {
    const next = withoutRemark(unfenced(text));
    if (next === text) return text;
    text = next;
  }
}

/** The inside of one fenced block of Markdown or plain text that is the whole of `text`; `text` itself otherwise. */
function unfenced(text: string): string {
  const open = /^(`{3,}|~{3,})[ \t]*(?:markdown|md|text|txt|plaintext)?[ \t]*\n/i.exec(text);
  if (!open) return text;
  const lines = text.slice(open[0].length).split("\n");
  const fence = open[1]!;
  // CommonMark: a closing fence is the fence character, at least as many, and nothing after it.
  const closer = new RegExp(`^ {0,3}${fence[0] === "`" ? "`" : "~"}{${fence.length},}[ \\t]*$`);
  const close = lines.findIndex((line) => closer.test(line));
  return close === lines.length - 1 ? lines.slice(0, close).join("\n").trim() : text;
}

/** `text` without its first paragraph when that is a remark before the answer and another paragraph follows. */
function withoutRemark(text: string): string {
  const cut = /\n[ \t]*\n/.exec(text);
  if (!cut) return text;
  const first = text.slice(0, cut.index).trim();
  // Markdown structure is the answer's own: a heading, a list item, a quote, a table row, a fence.
  if (/^(?:#|[-*+>|]|\d+[.)]|`{3}|~{3})/.test(first)) return text;
  const words = first.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;
  return /:\**$/.test(first) || words < 4 ? text.slice(cut.index + cut[0].length).trim() : text;
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
    ...(options.detail === "full" ? unresolved(analysis, summary.id) : []),
    `Layer: ${summary.id.split(".")[0]}`,
  ];
  const brief = options.detail === "brief";
  const detail = brief
    ? `Write at most two short sentences in one paragraph, no line breaks, about ${BRIEF_TARGET} characters in all: what the node does, for a reader scanning a map of the codebase. Do not repeat its name or signature.`
    : options.detail === "short"
      ? "Write 2-3 sentences: what the node is for and why it exists."
      : `Answer in five sections, each under a \`## \` heading written in that language: ${FULL_SECTIONS.join("; ")}. No line-by-line narration.`;
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

/**
 * The sections of a `full` explanation, in order (c4-zoom/06): a reader zooms
 * from what the node is for down to what it calls and where it takes part.
 */
const FULL_SECTIONS = [
  "what it is for",
  "its steps",
  "its branches and edge cases",
  "what it calls: name the IDs given; for a construct keylang did not resolve, say so and do not guess its target",
  "the flows and rules it takes part in",
];

/** Most unresolved constructs a `full` prompt lists; the summary already counts them all. */
const MAX_UNRESOLVED = 20;

/** The constructs inside the node keylang did not turn into edges, with their line and code, for the calls section of `full`. */
function unresolved(analysis: Analysis, id: string): string[] {
  const items = (analysis.snapshot?.coverage ?? []).filter((c) => c.source === id);
  if (items.length === 0) return [];
  const lines = items.slice(0, MAX_UNRESOLVED).map((c) => `- ${c.file}:${c.line}: \`${c.text.replace(/\s+/g, " ").trim()}\` — ${c.reason}`);
  if (items.length > MAX_UNRESOLVED) lines.push(`… (${items.length - MAX_UNRESOLVED} more not shown)`);
  return [`Constructs inside it keylang did not resolve to an edge:\n${lines.join("\n")}`];
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
export type BriefLevel = "fn/type" | "class/module" | "layer" | "system";

export interface PlannedBrief {
  id: string;
  level: BriefLevel;
  /** Nodes of one wave only need briefs of earlier waves: fn and types, then modules deepest first, then layers. */
  wave: number;
}

/**
 * The nodes a batch explains, in the order it asks: fn and types, then
 * classes and modules from the deepest up, then layers, then the repository
 * itself (`SYSTEM_ID`). A node with a doc comment is never asked about: the
 * code already says what it does; nor is the repository when its README or a
 * manifest says it. External packages have no code here, so they are left out.
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
  if (!snapshot.system?.brief) {
    const brief = briefs.get(SYSTEM_ID);
    const stale = brief !== undefined && systemBaseline(snapshot, briefs) !== brief.closure;
    if (batch === "stale" ? stale : brief === undefined || stale) out.push({ id: SYSTEM_ID, level: "system", wave: 2000 });
  }
  return out.sort((a, b) => a.wave - b.wave || compareText(a.id, b.id));
}

/** Most flows the repository's prompt names; the rest are counted. */
const MAX_FLOWS = 40;

/**
 * The request for the repository's brief: its name, its layers with what the
 * explained map says about them, its flows and the packages it uses. The
 * README and manifests had nothing to say, or no model is asked at all.
 */
export function systemRequest(analysis: Analysis, options: { lang: string; briefs: ReadonlyMap<string, StoredExplanation> }): LlmRequest {
  const snapshot = analysis.snapshot;
  const layers = snapshot === null ? [] : ownLayers(snapshot).map((id) => {
    const e = explanationOf(snapshot, options.briefs, id);
    return `- layer \`${id}\`${e ? `: ${e.text}` : ""}`;
  });
  const flows = analysis.spec.flows.slice(0, MAX_FLOWS).map((flow) => `- flow ${flow.name}${flow.triggers[0] ? ` (trigger \`${flow.triggers[0].target.target}\`)` : ""}`);
  if (analysis.spec.flows.length > MAX_FLOWS) flows.push(`… (${analysis.spec.flows.length - MAX_FLOWS} more not shown)`);
  const packages = snapshot === null ? [] : Object.keys(snapshot.nodes).filter((id) => id.startsWith(`${EXTERNAL}.`) && !id.slice(EXTERNAL.length + 1).includes("."));
  const parts = [
    `Repository: ${snapshot?.system.name ?? "(no name in a manifest)"}`,
    `Layers, with what the explained map says about them:\n${layers.length > 0 ? layers.join("\n") : "(none)"}`,
    ...(flows.length > 0 ? [`Flows the specs describe:\n${flows.join("\n")}`] : []),
    ...(packages.length > 0 ? [`Packages it uses: ${packages.slice(0, MAX_MEMBERS).map((id) => `\`${id}\``).join(", ")}${packages.length > MAX_MEMBERS ? ", …" : ""}`] : []),
  ];
  const system = [
    "You describe a whole repository to a developer who opens it for the first time, using the architecture description keylang keeps for it.",
    `Answer in the language with code \`${options.lang}\`. Write at most two short sentences in one paragraph, no line breaks, about ${BRIEF_TARGET} characters in all: what the repository is and who it is for.`,
    "Refer to code only by the IDs given in the input, written in backticks. Never invent an ID.",
    "Say only what the input shows; no remarks about the input or what it leaves out.",
  ].join("\n");
  return { system, prompt: parts.join("\n\n"), maxTokens: 1024 };
}

/** A rough size of the batch for `--dry-run`: about four characters a token, and a brief of about 80 tokens out. */
export function estimateTokens(analysis: Analysis, plan: readonly PlannedBrief[], briefs: ReadonlyMap<string, StoredExplanation>): { input: number; output: number } {
  let chars = 0;
  for (const { id } of plan) {
    const request = briefRequest(analysis, id, analysis.config.explain.lang, briefs);
    if (request !== null) chars += request.system.length + request.prompt.length;
  }
  return { input: Math.ceil(chars / 4), output: plan.length * 80 };
}

/** The request for the brief of `id`: the repository's or a node's; null when the id is gone from the snapshot. */
export function briefRequest(analysis: Analysis, id: string, lang: string, briefs: ReadonlyMap<string, StoredExplanation>): LlmRequest | null {
  if (id === SYSTEM_ID) return systemRequest(analysis, { lang, briefs });
  const result = summarizeNode(analysis, id);
  return "unknown" in result ? null : explanationRequest(analysis, result.summary, { lang, detail: "brief", briefs });
}
