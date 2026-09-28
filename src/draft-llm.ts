// `draft flow --mode llm|hybrid` (design §5.1): the model proposes a flow
// from a compact map, the flow grammar and flows of this repository; an ID
// that is neither in the snapshot nor declared `planned` sends the draft
// back once with the nearest real IDs. `hybrid` then reconciles every step
// with the algo projection and adds what the model missed. Each step line
// carries its provenance: `<!-- keylang:llm model=… status=… -->`.

import type { Analysis } from "./analyze.ts";
import { assess } from "./assess.ts";
import { parseConfig } from "./config.ts";
import { draftFlow } from "./draft.ts";
import { sectionNodes, walk, type Document } from "./ir.ts";
import type { LlmClient } from "./llm.ts";
import { parse } from "./parser.ts";

export type DraftStatus = "agree" | "llm-only" | "algo-only" | "conflict";

export interface ModelDraft {
  name: string;
  text: string;
  counts: Record<DraftStatus, number>;
  /** IDs still unknown after the second round: they stay K001 in `check`. */
  unknown: string[];
  rounds: number;
}

const GRAMMAR = `A flow is Markdown:
# flow <name>

- trigger <fn id>
  - step <fn id>            (a function the trigger calls; nest a step under the step that calls it)
    - step <fn id>
  - when <condition>        (a branch: its steps nest under it)
    - step <fn id>
  - invariant <plain text>
- planned fn <id> (<params>) → <result>   (top level: an intention with no code yet)

Two spaces per level. IDs are the dotted IDs of the map below.`;

/** `context`: the pack from the TUI context panel, sent as it is shown. */
export async function draftFlowWithModel(analysis: Analysis, trigger: string, client: LlmClient, mode: "llm" | "hybrid", name?: string, context?: string): Promise<ModelDraft> {
  const snapshot = analysis.snapshot!;
  const algo = draftFlow(snapshot, trigger, name !== undefined ? { name } : {});
  const system = [
    "You draft one keylang flow: the steps a trigger function goes through, for a developer reading the architecture.",
    GRAMMAR,
    "Use only IDs from the map, or declare a new one with `planned` in the same flow. Never present an intention as existing code.",
    "Answer with the flow only, in one ```markdown block.",
  ].join("\n\n");
  const prompt = [
    `Draft \`# flow ${algo.name}\` for the trigger \`${trigger}\`.`,
    `Map (fn id and signature):\n${compactMap(analysis, algo.steps)}`,
    ...similarFlows(analysis.docs, algo.steps).map((flow, i) => `Flow ${i + 1} of this repository:\n\`\`\`markdown\n${flow}\n\`\`\``),
    ...(context ? [`Context chosen by the developer:\n${context}`] : []),
  ].join("\n\n");
  let text = flowText(await client.complete({ system, prompt, maxTokens: 4096 }), algo.name);
  let unknown = unknownIn(analysis, text);
  let rounds = 1;
  if (unknown.length > 0) {
    // One round back to the model, then the result is shown as it is (design §5.1 p.3).
    const problems = unknown.map((id) => {
      const near = analysis.index.suggest(id);
      return `- \`${id}\` is not an ID of the map${near ? `; did you mean \`${near}\`?` : ""} Use a real ID, or declare \`planned fn ${id} …\` in the flow.`;
    });
    const retry = `${prompt}\n\nYour draft:\n\`\`\`markdown\n${text}\`\`\`\n\nProblems:\n${problems.join("\n")}\n\nAnswer with the corrected flow only.`;
    text = flowText(await client.complete({ system, prompt: retry, maxTokens: 4096 }), algo.name);
    unknown = unknownIn(analysis, text);
    rounds = 2;
  }
  return { name: algo.name, ...reconcile(analysis, text, algo.steps, mode, client.agent), unknown, rounds };
}

/** Status of each step line against the algo projection; `hybrid` appends the steps only algo has. */
function reconcile(analysis: Analysis, text: string, algoSteps: readonly string[], mode: "llm" | "hybrid", agent: string): { text: string; counts: Record<DraftStatus, number> } {
  const nodes = analysis.snapshot!.nodes;
  const counts: Record<DraftStatus, number> = { agree: 0, "llm-only": 0, "algo-only": 0, conflict: 0 };
  const seen = new Set<string>();
  const lines = text.replace(/\n+$/, "").split("\n").map((line) => {
    const m = /^(\s*- (?:trigger|step) )(\S+)(.*)$/.exec(line);
    if (!m) return line;
    const id = m[2]!;
    seen.add(id);
    const node = nodes[id];
    // A step names something that runs; a module or a type contradicts the snapshot.
    const status: DraftStatus = node !== undefined && node.kind !== "fn" ? "conflict" : algoSteps.includes(id) ? "agree" : "llm-only";
    counts[status]++;
    const rest = m[3]!.replace(/\s*<!--.*-->\s*$/, "");
    return `${m[1]}${id}${rest} <!-- keylang:llm model=${agent} status=${status} -->`;
  });
  if (mode === "hybrid") {
    for (const id of algoSteps) {
      if (seen.has(id)) continue;
      counts["algo-only"]++;
      lines.push(`  - step ${id} <!-- keylang:algo status=algo-only -->`);
    }
  }
  return { text: `${lines.join("\n")}\n`, counts };
}

/** The flow section of an answer: the first fenced block (or the whole answer), under the requested heading. */
function flowText(answer: string, name: string): string {
  const fenced = /```(?:markdown|md)?\n([\s\S]*?)```/.exec(answer);
  const body = (fenced ? fenced[1]! : answer).trim().split("\n");
  const start = body.findIndex((line) => /^# flow\b/.test(line));
  const section = start === -1 ? body : body.slice(start + 1);
  const end = section.findIndex((line) => /^# /.test(line));
  const lines = (end === -1 ? section : section.slice(0, end)).filter((line, i, all) => line.trim() !== "" || (i > 0 && all[i - 1]!.trim() !== ""));
  return `# flow ${name}\n\n${lines.join("\n").trim()}\n`;
}

/** Referenced IDs that are neither snapshot nodes nor `planned` in the draft or the specs. */
function unknownIn(analysis: Analysis, text: string): string[] {
  const doc = parse("draft.md", text);
  const planned = new Set<string>();
  const refs = new Set<string>();
  for (const d of [doc, ...analysis.docs]) {
    for (const section of d.sections) {
      for (const top of sectionNodes(section)) {
        walk(top, (node) => {
          if (node.kind === "planned" && node.id) planned.add(node.id);
          if (d === doc) for (const ref of node.refs) refs.add(ref.target);
        });
      }
    }
  }
  return [...refs].filter((id) => analysis.snapshot!.nodes[id] === undefined && !planned.has(id)).sort();
}

/** The fns the draft can reach, then the rest of their modules; at most 300 lines, which the prompt says. */
function compactMap(analysis: Analysis, steps: readonly string[]): string {
  const nodes = analysis.snapshot!.nodes;
  const modules = new Set(steps.map((id) => id.slice(0, id.lastIndexOf("."))));
  const ids = [...new Set([...steps, ...Object.keys(nodes).filter((id) => nodes[id]!.kind === "fn" && [...modules].some((m) => id.startsWith(`${m}.`)))])];
  const lines = ids.slice(0, 300).map((id) => `${id}${nodes[id]?.signature ? ` ${nodes[id]!.signature}` : ""}`);
  if (ids.length > 300) lines.push(`… ${ids.length - 300} more fns not shown`);
  return lines.join("\n");
}

/** Up to three hand-written flows, those sharing most IDs with the draft first. */
function similarFlows(docs: readonly Document[], steps: readonly string[]): string[] {
  const flows: { text: string; shared: number }[] = [];
  for (const doc of docs) {
    if (doc.generated !== null) continue;
    for (const section of doc.sections) {
      if (section.kind !== "flow" || !section.heading) continue;
      const ids = new Set<string>();
      const body: string[] = [`# ${section.heading.value}`, ""];
      for (const top of sectionNodes(section)) {
        walk(top, (node) => {
          for (const ref of node.refs) ids.add(ref.target);
        });
      }
      for (const item of section.items) if (item.type === "node") body.push(...lineTree(item, 0));
      flows.push({ text: body.join("\n"), shared: steps.filter((id) => ids.has(id)).length });
    }
  }
  return flows.sort((a, b) => b.shared - a.shared).slice(0, 3).map((f) => f.text);
}

function lineTree(node: { tokens: { text: string }[]; children: unknown[] }, level: number): string[] {
  const out = [`${"  ".repeat(level)}- ${node.tokens.map((t) => t.text).join(" ")}`];
  for (const child of node.children as { tokens: { text: string }[]; children: unknown[] }[]) out.push(...lineTree(child, level + 1));
  return out;
}

export interface RulesDraft {
  text: string;
  counts: Record<DraftStatus, number>;
  /** A `conflict` line with the finding that refutes it: `rule → file:line: message`. */
  conflicts: string[];
}

/**
 * `draft rules --mode llm|hybrid`: the model proposes rules from the layer
 * dependencies; each is checked at once against the current snapshot, alone,
 * as `check` would: `agree` when it holds, `conflict` when the code breaks it
 * (with the edge), `llm-only` when the evidence is not enough. `hybrid` adds
 * the algo rules the model did not give.
 */
export async function draftRulesWithModel(analysis: Analysis, client: LlmClient, mode: "llm" | "hybrid", algoText: string, target: string): Promise<RulesDraft> {
  const snapshot = analysis.snapshot!;
  const uses = new Map<string, number>();
  for (const e of snapshot.edges) {
    if (e.resolution !== "resolved" || e.target === null) continue;
    const from = snapshot.nodes[e.source]?.layer;
    const to = snapshot.nodes[e.target]?.layer;
    if (from && to && from !== to && to !== "external") uses.set(`${from} → ${to}`, (uses.get(`${from} → ${to}`) ?? 0) + 1);
  }
  const answer = await client.complete({
    system: [
      "You propose architecture rules in keylang for one repository.",
      "Rules are Markdown list items under `# rules`: `- layers a < b < c` (b may use a, not the other way), `- deny a b` (a must not depend on b), `- allow a b`, `- no-cycles`. IDs are layer or module IDs.",
      "Propose rules a team would want to keep, not only what the code does today. Answer with the rules only, in one ```markdown block.",
    ].join("\n\n"),
    prompt: `Layers: ${[...analysis.config.layers.keys()].join(", ")}\n\nDependencies between layers (edges):\n${[...uses].map(([pair, n]) => `${pair}: ${n}`).join("\n") || "none"}`,
    maxTokens: 2048,
  });
  const body = (/```(?:markdown|md)?\n([\s\S]*?)```/.exec(answer)?.[1] ?? answer).split("\n").filter((line) => /^\s*- /.test(line));
  const counts: Record<DraftStatus, number> = { agree: 0, "llm-only": 0, "algo-only": 0, conflict: 0 };
  const conflicts: string[] = [];
  const others = analysis.docs.filter((d) => d.path !== target && !d.sections.some((s) => s.kind === "rules"));
  const lines = ["# rules", ""];
  const seen = new Set<string>();
  for (const raw of body) {
    const rule = raw.replace(/\s*<!--.*-->\s*$/, "").trim();
    if (seen.has(rule)) continue;
    seen.add(rule);
    const status = judgeRule(analysis, others, target, rule, conflicts);
    counts[status]++;
    lines.push(`${rule} <!-- keylang:llm model=${client.agent} status=${status} -->`);
  }
  if (mode === "hybrid") {
    for (const line of algoText.split("\n").filter((l) => l.startsWith("- "))) {
      const rule = line.replace(/\s*<!--.*-->\s*$/, "");
      if (seen.has(rule)) continue;
      counts["algo-only"]++;
      lines.push(line);
    }
  }
  return { text: `${lines.join("\n")}\n`, counts, conflicts };
}

/** One rule, checked alone against the snapshot: what it adds to a check without it. */
function judgeRule(analysis: Analysis, others: readonly Document[], target: string, rule: string, conflicts: string[]): DraftStatus {
  const doc = parse(target, `# rules\n\n${rule}\n`);
  const broken = doc.diagnostics.find((d) => d.severity === "error");
  if (broken) {
    conflicts.push(`${rule} → does not parse: ${broken.message}`);
    return "conflict";
  }
  const key = (d: { code: string; file: string; span: { start: { line: number; col: number } }; message: string }): string => `${d.code}:${d.file}:${d.span.start.line}:${d.span.start.col}:${d.message}`;
  const base = assess(others, analysis.snapshot, { tests: null, traces: null });
  const known = new Set(base.diagnostics.map(key));
  const knownVerdicts = new Set(base.verdicts.map((v) => `${v.criterion}:${v.file}:${v.line}:${v.message}`));
  const result = assess([...others, doc], analysis.snapshot, { tests: null, traces: null });
  const added = result.diagnostics.filter((d) => d.severity === "error" && !known.has(key(d)));
  if (added.length > 0) {
    conflicts.push(`${rule} → ${added[0]!.file}:${added[0]!.span.start.line}: ${added[0]!.code} ${added[0]!.message}`);
    return "conflict";
  }
  const verdicts = result.verdicts.filter((v) => !knownVerdicts.has(`${v.criterion}:${v.file}:${v.line}:${v.message}`));
  const failed = verdicts.find((v) => v.verdict === "fail");
  if (failed) {
    conflicts.push(`${rule} → ${failed.message}`);
    return "conflict";
  }
  // No new finding and nothing left unverified: the code keeps the rule (a `layers` order has no verdict of its own when it holds).
  return verdicts.some((v) => v.verdict === "unverified") ? "llm-only" : "agree";
}

/**
 * `draft map --mode llm|hybrid`: the model proposes layers (name → globs),
 * validated as `keylang.json` would be. Only printed: layers are never
 * assigned without a person (design §5.1 p.4).
 */
export async function draftLayoutWithModel(analysis: Analysis, client: LlmClient, files: readonly string[]): Promise<Record<string, string[]>> {
  const answer = await client.complete({
    system: "You group the source files of a repository into architecture layers. Answer with one JSON object only: layer name (one lowercase word) → array of POSIX globs relative to the root.",
    prompt: `Current layers: ${JSON.stringify(Object.fromEntries(analysis.config.layers))}\n\nSource files:\n${files.slice(0, 400).join("\n")}${files.length > 400 ? `\n… ${files.length - 400} more files not shown` : ""}`,
    maxTokens: 2048,
  });
  const json = /\{[\s\S]*\}/.exec(answer)?.[0] ?? "";
  // The same validation as a written keylang.json: names, globs, shape.
  const raw = parseConfig("proposed layers", JSON.stringify({ layers: JSON.parse(json) as unknown }));
  return Object.fromEntries(Object.entries(raw.layers ?? {}).map(([name, globs]) => [name, Array.isArray(globs) ? globs : [globs]]));
}
