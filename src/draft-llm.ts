// `draft flow --mode llm|hybrid` (design §5.1): the model proposes a flow
// from a compact map, the flow grammar and flows of this repository; an ID
// that is neither in the snapshot nor declared `planned` sends the draft
// back once with the nearest real IDs. The answer is reconciled on the parsed
// flow, not on its lines: an item that does not parse where it stands is
// dropped, every trigger and step is judged against the algo projection with
// its nesting, and `hybrid` puts what the model missed under its caller.
// Each step line carries its provenance: `<!-- keylang:llm model=… status=… -->`.

import type { Analysis } from "./analyze.ts";
import { assess } from "./assess.ts";
import { parseConfig, resolveStatic } from "./config.ts";
import { draftFlow } from "./draft.ts";
import { formatDocument } from "./fmt.ts";
import { sectionNodes, walk, type Document, type Node } from "./ir.ts";
import type { LlmClient } from "./llm.ts";
import { isId, parse } from "./parser.ts";
import { compileSpec, type FlowItem, type Trigger } from "./spec-ir.ts";

export type DraftStatus = "agree" | "llm-only" | "algo-only" | "conflict";

export interface ModelDraft {
  name: string;
  text: string;
  counts: Record<DraftStatus, number>;
  /** IDs still unknown after the second round: they stay K001 in `check`. */
  unknown: string[];
  rounds: number;
  /** Items of the answer left out because they do not parse where they stand: `- line: why`. */
  dropped: string[];
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
  const unknown = unknownIn(analysis, text);
  let rounds = 1;
  if (unknown.length > 0) {
    // One round back to the model, then the result is shown as it is (design §5.1 p.3).
    const problems = unknown.map((id) => {
      const near = analysis.index.suggest(id);
      return `- \`${id}\` is not an ID of the map${near ? `; did you mean \`${near}\`?` : ""} Use a real ID, or declare \`planned fn ${id} …\` in the flow.`;
    });
    const retry = `${prompt}\n\nYour draft:\n\`\`\`markdown\n${text}\`\`\`\n\nProblems:\n${problems.join("\n")}\n\nAnswer with the corrected flow only.`;
    text = flowText(await client.complete({ system, prompt: retry, maxTokens: 4096 }), algo.name);
    rounds = 2;
  }
  const reconciled = reconcile(analysis, text, algo, trigger, mode, client.agent);
  return { name: algo.name, text: reconciled.text, counts: reconciled.counts, unknown: unknownIn(analysis, reconciled.text), rounds, dropped: reconciled.dropped };
}

/**
 * The model's flow judged on its IR. An item with a parse error other than
 * indentation (a step under an `invariant`, an unknown keyword) is dropped;
 * the requested trigger is added when the answer lacks it. A trigger or step
 * is `conflict` when it names no fn, `agree` when the algo projection has it
 * and its parent reaches it through resolved calls (nesting included),
 * `llm-only` otherwise. `hybrid` adds each algo step the model missed under
 * the nearest of its algo callers the draft has.
 */
function reconcile(analysis: Analysis, text: string, algo: { text: string; steps: readonly string[] }, trigger: string, mode: "llm" | "hybrid", agent: string): { text: string; counts: Record<DraftStatus, number>; dropped: string[] } {
  const nodes = analysis.snapshot!.nodes;
  const counts: Record<DraftStatus, number> = { agree: 0, "llm-only": 0, "algo-only": 0, conflict: 0 };
  const doc = parse("draft.md", text);
  const section = doc.sections.find((s) => s.kind === "flow")!;
  const lines = text.split("\n");
  const broken = new Map<number, string>();
  for (const d of doc.diagnostics) if (d.severity === "error" && d.code !== "K003" && !broken.has(d.span.start.line)) broken.set(d.span.start.line, d.message);
  const dropped: string[] = [];
  const keep = (node: Node): boolean => {
    const why = broken.get(node.span.start.line) ?? (node.kind === "unknown" ? "not a flow item" : null);
    if (why === null) {
      node.children = node.children.filter(keep);
      return true;
    }
    dropped.push(`${lines[node.span.start.line - 1]!.trim()}: ${why}`);
    return false;
  };
  section.items = section.items.filter((item) => item.type !== "node" || keep(item));
  // Where each ID first stands in the draft: the anchor an algo step goes under.
  const placed = new Map<string, Node>();
  const reach = reachability(nodes);
  const flow = compileSpec([doc]).spec.flows.find((item) => item.name === section.name?.value);
  const judge = (item: Trigger | FlowItem, parent: string | null): void => {
    const id = item.kind === "trigger" || item.kind === "step" ? item.target.target : undefined;
    if (id !== undefined) {
      const kind = nodes[id]?.kind;
      // A step names something that runs; a module or a type contradicts the snapshot.
      const status: DraftStatus = kind !== undefined && kind !== "fn" ? "conflict" : algo.steps.includes(id) && (parent === null ? id === trigger : reach(parent, id)) ? "agree" : "llm-only";
      counts[status]++;
      item.source.comment = { value: `<!-- keylang:llm model=${agent} status=${status} -->`, span: item.source.span };
      if (!placed.has(id)) placed.set(id, item.source);
    }
    if (item.kind === "test") return;
    for (const child of item.children) judge(child, id ?? parent);
  };
  const head = flow?.triggers.find((item) => item.target.target === trigger);
  // A step beside the trigger has the trigger as its parent (format §7).
  if (flow) for (const item of flow.top) judge(item, item === head ? null : trigger);
  if (!head) {
    const added = { type: "node" as const, ...algoItem("trigger", trigger) };
    const first = section.items.findIndex((item) => item.type === "node");
    section.items.splice(first === -1 ? section.items.length : first, 0, added);
    placed.set(trigger, added);
    counts["algo-only"]++;
  }
  if (mode === "hybrid") {
    for (const [id, callers] of algoCallers(algo.text)) {
      if (placed.has(id)) continue;
      const anchor = callers.map((caller) => placed.get(caller)).find((node) => node !== undefined) ?? placed.get(trigger)!;
      const step = algoItem("step", id);
      anchor.children.push(step);
      placed.set(id, step);
      counts["algo-only"]++;
    }
  }
  return { text: formatDocument(doc), counts, dropped };
}

/** One provenance-marked item of the algo projection, as the parser reads it. */
function algoItem(kind: "trigger" | "step", id: string): Node {
  const section = parse("algo.md", `# flow algo\n\n- ${kind} ${id} <!-- keylang:algo status=algo-only -->\n`).sections[0]!;
  return sectionNodes(section)[0]!;
}

/** Each step of the algo draft (preorder) with its callers there, nearest first. */
function algoCallers(text: string): [string, string[]][] {
  const out: [string, string[]][] = [];
  const visit = (item: Trigger | FlowItem, path: string[]): void => {
    // A `when` has no id, and the projection does not look through it.
    if (item.kind !== "trigger" && item.kind !== "step") return;
    const id = item.target.target;
    if (item.kind === "step") out.push([id, [...path].reverse()]);
    for (const child of item.children) visit(child, [...path, id]);
  };
  for (const flow of compileSpec([parse("algo.md", text)]).spec.flows) for (const item of flow.top) visit(item, []);
  return out;
}

/** Whether `from` reaches `to` through resolved calls of the snapshot, as a static step proof would. */
function reachability(nodes: NonNullable<Analysis["snapshot"]>["nodes"]): (from: string, to: string) => boolean {
  const memo = new Map<string, Set<string>>();
  return (from, to) => {
    let reached = memo.get(from);
    if (!reached) {
      reached = new Set<string>();
      const queue = [...(nodes[from]?.calls ?? [])];
      while (queue.length > 0) {
        const id = queue.pop()!;
        if (reached.has(id)) continue;
        reached.add(id);
        queue.push(...(nodes[id]?.calls ?? []));
      }
      memo.set(from, reached);
    }
    return reached.has(to);
  };
}

/**
 * The flow section of an answer: the first fenced block (or the whole
 * answer), under the requested heading. An ID written as code in an item
 * (`` - step `a.b` ``, which the prompt's own examples invite) is the ID.
 */
function flowText(answer: string, name: string): string {
  const fenced = /```(?:markdown|md)?\n([\s\S]*?)```/.exec(answer);
  const body = (fenced ? fenced[1]! : answer).trim().split("\n");
  const start = body.findIndex((line) => /^# flow\b/.test(line));
  const section = start === -1 ? body : body.slice(start + 1);
  const end = section.findIndex((line) => /^# /.test(line));
  const lines = (end === -1 ? section : section.slice(0, end))
    .filter((line, i, all) => line.trim() !== "" || (i > 0 && all[i - 1]!.trim() !== ""))
    .map((line) => (/^\s*- /.test(line) ? line.replace(/`([^`\s]+)`/g, (whole, inner: string) => (isId(inner) ? inner : whole)) : line));
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
  const mode = resolveStatic(undefined, analysis.config.check.static);
  const evidence = { tests: null as null, traces: null as null, static: mode.mode, ...(mode.setBy ? { staticSetBy: mode.setBy } : {}) };
  const base = assess(others, analysis.snapshot, evidence, analysis.config.format);
  const known = new Set(base.diagnostics.map(key));
  const knownVerdicts = new Set(base.verdicts.map((v) => `${v.criterion}:${v.file}:${v.line}:${v.message}`));
  const result = assess([...others, doc], analysis.snapshot, evidence, analysis.config.format);
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
