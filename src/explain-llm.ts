// The plain-language explanation of a node (design §5.4): what goes to the
// model, how the answer is kept, and when it is stale. An explanation lives
// in `.keylang/explain/<id>.md` beside its baseline — the closure fingerprint
// of the node when it was written — never in the map or the specs, and never
// in a verdict.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Analysis } from "./analyze.ts";
import { formatSummary, type NodeSummary } from "./explain-node.ts";
import type { LlmRequest } from "./llm.ts";
import { plannedDecl } from "./lsp-features.ts";
import { safeWrite } from "./safe-write.ts";

export interface Explanation {
  agent: string;
  /** `YYYY-MM-DD`. */
  date: string;
  /** `currentBaseline` of the node when explained: its `closure.fingerprint`; "" for a planned node. */
  closure: string;
  lang: string;
  detail: "short" | "full";
  text: string;
}

const HEADER = /^<!-- keylang:explain agent=(\S+) date=(\S+) closure=(\S*) lang=(\S+) detail=(short|full) -->\n/;

const EXPLAIN_DIR = ".keylang/explain";

export function explanationFile(root: string, id: string): string {
  return join(root, EXPLAIN_DIR, `${id}.md`);
}

export function readExplanation(root: string, id: string): Explanation | null {
  const file = explanationFile(root, id);
  if (!existsSync(file)) return null;
  const text = readFileSync(file, "utf8");
  const m = HEADER.exec(text);
  // A file keylang did not write is not an explanation it can date.
  if (!m) return null;
  return { agent: m[1]!, date: m[2]!, closure: m[3]!, lang: m[4]!, detail: m[5] as "short" | "full", text: text.slice(m[0].length).trimEnd() };
}

export function writeExplanation(root: string, id: string, e: Explanation): void {
  safeWrite(root, `${EXPLAIN_DIR}/${id}.md`, `<!-- keylang:explain agent=${e.agent} date=${e.date} closure=${e.closure} lang=${e.lang} detail=${e.detail} -->\n${e.text}\n`, { under: EXPLAIN_DIR });
}

/** IDs of every explanation written under `.keylang/explain/`, sorted. */
export function explainedIds(root: string): string[] {
  const dir = join(root, ".keylang/explain");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith(".md")).map((name) => name.slice(0, -3)).sort();
}

/**
 * The baseline an explanation of `id` is compared with now: the closure
 * fingerprint of a fn or type; for a module, class or layer, which has no
 * closure of its own, a hash of its dependencies and of the closures of every
 * node under it, so a change inside makes its explanation stale. "" for a
 * planned node (or a node with nothing to hash), null when the id is gone.
 */
export function currentBaseline(analysis: Analysis, id: string): string | null {
  const nodes = analysis.snapshot?.nodes ?? {};
  const node = nodes[id];
  if (!node) return plannedDecl(analysis.docs, id) ? "" : null;
  if (node.closure) return node.closure.fingerprint;
  const parts = Object.entries(nodes)
    .filter(([other]) => other.startsWith(`${id}.`))
    .flatMap(([other, n]) => {
      const print = n.closure?.fingerprint ?? n.fingerprint;
      return print === undefined ? [] : [`${other} ${print}`];
    })
    .sort();
  if (parts.length === 0 && (node.deps ?? []).length === 0) return "";
  return createHash("sha256").update([`deps ${(node.deps ?? []).join(",")}`, ...parts].join("\n")).digest("hex");
}

export function isStale(analysis: Analysis, id: string, e: Explanation): boolean {
  return currentBaseline(analysis, id) !== e.closure;
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
export function explanationRequest(analysis: Analysis, summary: NodeSummary, options: { lang: string; detail: "short" | "full" }): LlmRequest {
  const nodes = analysis.snapshot?.nodes ?? {};
  const signature = (id: string): string => `${id}${nodes[id]?.signature ? ` ${nodes[id]!.signature}` : ""}`;
  const node = nodes[summary.id];
  const code = node?.file && node.line !== null ? sourceLines(analysis.config.root, node.file, node.line, node.endLine ?? node.line) : null;
  const parts = [
    `Node:\n${formatSummary(summary)}`,
    ...(code ? [`Code (${node!.file}:${node!.line}):\n\`\`\`\n${code}\n\`\`\``] : []),
    ...(summary.calls.length > 0 ? [`It calls:\n${summary.calls.map(signature).join("\n")}`] : []),
    ...(summary.callers.length > 0 ? [`Called by:\n${summary.callers.map(signature).join("\n")}`] : []),
    `Layer: ${summary.id.split(".")[0]}`,
  ];
  const detail =
    options.detail === "short"
      ? "Write 2-3 sentences: what the node is for and why it exists."
      : "Explain its purpose, then its steps and branches, then edge cases. No line-by-line narration.";
  const system = [
    "You explain one node of a codebase to a developer, using the architecture description keylang keeps for the repository.",
    `Answer in the language with code \`${options.lang}\`. ${detail}`,
    "Refer to code only by the IDs given in the input, written in backticks. Never invent an ID.",
    summary.kind.startsWith("planned") ? "The node is planned and has no code yet: describe the intention, not behavior." : "Describe what the code does, not what its name suggests.",
    "Say plainly when the input does not show something (for example calls keylang could not resolve).",
  ].join("\n");
  return { system, prompt: parts.join("\n\n"), maxTokens: options.detail === "short" ? 1024 : 4096 };
}

function sourceLines(root: string, file: string, from: number, to: number): string | null {
  const abs = join(root, file);
  if (!existsSync(abs)) return null;
  // A long body is cut, and the prompt says so: the summary and signatures carry the rest.
  const lines = readFileSync(abs, "utf8").split("\n").slice(from - 1, to);
  return lines.length > 200 ? `${lines.slice(0, 200).join("\n")}\n… (${lines.length - 200} more lines not shown)` : lines.join("\n");
}
