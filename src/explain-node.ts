// `keylang explain <id>` without a model: what the snapshot and the specs
// say about one node. Deterministic and offline; the LLM explanation (§5.4)
// builds on it and falls back to it. `nodeFacts` is also what hover says a
// node is (`lsp-features.ts`): one source for kind, signature, place, state.
// Sits after analysis (snapshot + SpecIR); entry points are `nodeFacts`,
// `summarizeNode` and `formatSummary`.

import type { Analysis } from "./analyze.ts";
import type { Node, Ref } from "./ir.ts";
import { flowsUsing, plannedDeclaration } from "./spec-ir.ts";
import { leavesUnresolved } from "./snapshot.ts";

/** What a node is by the snapshot and the specs, before any view of it shows it. */
export interface NodeFacts {
  /** The ID as declared: the spec's spelling when only a spec declares it. */
  id: string;
  /** The code (the snapshot has it), a `planned` line the code does not have yet, or only a spec line. */
  source: "code" | "planned" | "spec";
  /** `fn`, `module`, … as the snapshot or the spec has it; `planned <kind>` for a plan without code. */
  kind: string;
  /** A module that is a class in the code. */
  isClass: boolean;
  signature: string | null;
  /** Where it is declared; null for a node without a file (a layer, a package). */
  file: string | null;
  /** 1-based line and column in code points; 1 where the snapshot has none. */
  line: number;
  col: number;
  /** Its members are unknown to the snapshot. */
  opaque: boolean;
  /** A `planned` line names this node of the code: the plan is implemented. */
  implementsPlan: boolean;
}

/** The facts of `id`: from the snapshot, else from its `planned` line, else from the spec line that declares it; null when nothing does. */
export function nodeFacts(analysis: Analysis, id: string): NodeFacts | null {
  const node = analysis.snapshot?.nodes[id];
  const plan = plannedDeclaration(analysis.docs, id);

  // Precedence: the code is the truth when it has the node; a `planned` line
  // stands in until the code exists; a bare spec declaration comes last.
  if (node) {
    return { id, source: "code", kind: node.kind, isClass: node.kind === "module" && node.class === true, signature: node.signature ?? null, file: node.file, line: node.line ?? 1, col: node.col ?? 1, opaque: node.members === "opaque", implementsPlan: plan !== null };
  }

  if (plan) return { id, source: "planned", kind: `planned ${plan.kind}`, isClass: false, signature: plan.signature, file: plan.file, line: plan.line, col: plan.col, opaque: false, implementsPlan: false };
  const declared = analysis.index.lookup(id);

  if (declared.kind === "missing") return null;
  const { decl } = declared;

  return { id: decl.id, source: "spec", kind: decl.kind, isClass: false, signature: null, file: decl.file, line: decl.span.start.line, col: decl.span.start.col, opaque: declared.kind === "opaque", implementsPlan: false };
}

/** Everything `explain <id>` reports about a node: what it is, its neighbours, flows, rules, holes and fingerprint. */
export interface NodeSummary {
  id: string;
  /** `fn`, `type`, `module`, `class`, `layer`, `planned fn`, … */
  kind: string;
  signature: string | null;
  /** Brief of the documentation comment in the code. */
  doc: string | null;
  /** `file:line`, null for a layer or an external package. */
  at: string | null;
  exported: boolean | null;
  calls: string[];
  callers: string[];
  /** Plugin methods a framework's config wraps the fn in (ADR 0022), in the order they run: `P.aroundM (plugin:around `p`, etc/di.xml:12:5)`. */
  interceptedBy: string[];
  /** An event (ADR 0022 п. 6): the literal it is dispatched with, and the fns its observers run, each with its config line: `O.execute (observer `o`, etc/events.xml:3:5, scope frontend)`. */
  event?: { name: string; observers: string[] };
  deps: string[];
  dependents: string[];
  flows: string[];
  /** `file:line: rule text` of rules that name the node or a scope around it. */
  rules: string[];
  /** Constructs inside the node keylang did not turn into edges, counted by kind. */
  holes: Record<string, number>;
  fingerprint: { own: string; closure: string; complete: boolean } | null;
  planned: boolean;
  /** A `planned type` without code: its planned fields as `name?: type`; absent otherwise. */
  fields?: string[];
}

/** A summary, or the unknown ID with the nearest declared ID as a suggestion. */
export type ExplainResult = { summary: NodeSummary } | { unknown: string; suggestion: string | null };

/** The offline summary of `id`: from the snapshot when the code has it, else from its `planned` line. */
export function summarizeNode(analysis: Analysis, id: string): ExplainResult {
  const facts = nodeFacts(analysis, id);

  // The code or a plan says what a node is; an ID only a spec line declares has nothing to summarize.
  if (facts === null || facts.source === "spec") return { unknown: id, suggestion: analysis.index.suggest(id) ?? null };
  const rules = rulesNaming(analysis, id);
  const flows = flowsUsing(analysis.spec, id);
  const at = facts.file ? `${facts.file}:${facts.line}` : null;
  const node = analysis.snapshot?.nodes[id];

  if (facts.source === "code" && node) {
    // Count the constructs inside this node that stayed unresolved, by kind.
    const holes: Record<string, number> = {};

    for (const c of analysis.snapshot?.coverage ?? []) if (c.source === id && leavesUnresolved(c)) holes[c.kind] = (holes[c.kind] ?? 0) + 1;

    const head = {
      id,
      kind: facts.isClass ? "class" : facts.kind,
      signature: facts.signature,
      doc: node.doc ?? null,
      at,
      exported: node.exported ?? null,
      calls: node.calls ?? [],
      callers: node.callers ?? [],
      interceptedBy: (node.interceptedBy ?? []).map((i) => `${i.plugin} (${i.via} \`${i.name}\`, ${i.site}${i.scope !== "global" ? `, scope ${i.scope}` : ""})`),
    };

    const tail = {
      deps: node.deps ?? [],
      dependents: node.dependents ?? [],
      flows,
      rules,
      holes,
      fingerprint: node.fingerprint && node.closure ? { own: node.fingerprint, closure: node.closure.fingerprint, complete: node.closure.complete } : null,
      planned: facts.implementsPlan,
    };

    // An event's summary carries its observers between the callers and the deps, as the JSON has always listed them.
    if (node.kind === "event") return { summary: { ...head, event: { name: node.name ?? id.slice(id.indexOf(".") + 1), observers: observersOf(analysis, id) }, ...tail } };

    return { summary: { ...head, ...tail } };
  }

  // A plan without code: only what the `planned` line and the specs say.
  const summary: NodeSummary = { id, kind: facts.kind, signature: facts.signature, doc: null, at, exported: null, calls: [], callers: [], interceptedBy: [], deps: [], dependents: [], flows, rules, holes: {}, fingerprint: null, planned: true };
  const fields = plannedDeclaration(analysis.docs, id)?.fields;

  if (fields) summary.fields = fields.map((f) => `${f.name}${f.optional ? "?" : ""}: ${f.type}`);

  return { summary };
}

/** The observers of an event, in config order: the fn, the observer's name, its config line and area. */
function observersOf(analysis: Analysis, id: string): string[] {
  return (analysis.snapshot?.edges ?? [])
    // An observer edge goes from the event to the fn it runs; the observer's
    // name is quoted in the edge's binding text.
    .filter((e) => e.kind === "call" && e.source === id && e.via === "observer" && e.target !== null)
    .map((e) => `${e.target} (observer \`${/observer `([^`]*)`/.exec(e.binding ?? "")?.[1] ?? "?"}\`, ${e.site ?? `${e.file}:${e.line}:${e.col}`}${e.scope && e.scope !== "global" ? `, scope ${e.scope}` : ""})`);
}

/** `file:line: rule text` of the rule and module lines that name `id` or a scope around it, sorted; the generated map's are left out. */
function rulesNaming(analysis: Analysis, id: string): string[] {
  const within = (scope: string): boolean => id === scope || id.startsWith(`${scope}.`);
  const skipped = new Set(analysis.docs.filter((doc) => doc.generated !== null).map((doc) => doc.path));
  const seen = new Set<Node>();
  const rules: string[] = [];

  // One line per spec node, even when several of its refs name `id`.
  const add = (file: string, node: Node): void => {
    if (seen.has(node)) return;
    seen.add(node);
    rules.push(`${file}:${node.span.start.line}: ${node.tokens.map((token) => token.text).join(" ")}`.trimEnd());
  };

  const consider = (file: string, root: Node, refs: readonly Ref[]): void => {
    if (skipped.has(file)) return;

    for (const ref of refs) {
      if (!within(ref.target)) continue;
      const node = nodeHolding(root, ref);

      if (node) add(file, node);
    }
  };

  // Rules, rejected `layers` lines and module bindings are the spec lines
  // that can name a scope around `id`.
  for (const rule of analysis.spec.rules) {
    if (rule.kind === "dependency") consider(rule.file, rule.source, [rule.from, ...rule.to]);
    else if (rule.kind === "entry") consider(rule.file, rule.source, rule.entries);
    else if (rule.kind === "layers") consider(rule.file, rule.source, rule.nested);
  }

  for (const line of analysis.spec.rejectedLayers) consider(line.file, line.source, line.nested);

  for (const mod of analysis.spec.modules) consider(mod.file, mod.source, [mod.target]);

  // Plain string sort: stable output, though `f:10` sorts before `f:9`.
  return rules.sort();
}

/** The allow, deny, entry item, nested layer, or module line that holds `ref`. */
function nodeHolding(root: Node, ref: Ref): Node | null {
  // Depth-first search for the node whose own refs include this one.
  if (root.refs.includes(ref)) return root;

  for (const child of root.children) {
    const found = nodeHolding(child, ref);

    if (found) return found;
  }

  return null;
}

/** The summary as text: one line per fact, empty facts left out. */
export function formatSummary(s: NodeSummary): string {
  const lines = [`${s.kind} ${s.id}${s.signature ? ` ${s.signature}` : ""}`];
  // The second line: place, visibility and plan state, whichever are known.
  const where = [s.at, s.exported === true ? "exported" : s.exported === false ? "internal" : null, s.planned && !s.kind.startsWith("planned") ? "planned, implemented" : null, s.kind.startsWith("planned") ? "planned, not implemented" : null];
  const whereText = where.filter((x) => x !== null).join(" · ");

  if (whereText) lines.push(whereText);

  if (s.doc) lines.push(`doc: ${s.doc}`);

  // A type's field may hold a comma (`Map<string, number>`): fields are separated by `;`.
  if (s.fields) lines.push(`fields: ${s.fields.join("; ")}`);

  const list = (label: string, items: readonly string[]): void => {
    if (items.length > 0) lines.push(`${label}: ${items.join(", ")}`);
  };

  // An event has dispatchers and observers instead of calls and callers;
  // its literal name is shown only when it differs from the ID's tail.
  if (s.event) {
    if (s.event.name !== s.id.slice(s.id.indexOf(".") + 1)) lines.push(`name: ${s.event.name}`);
    list("dispatched by", s.callers);
    list("observers", s.event.observers);

    if (s.callers.length === 0) lines.push("dispatched by no code keylang read");

    if (s.event.observers.length === 0) lines.push("no observer in the config keylang read");
  } else {
    list("calls", s.calls);
    list("called by", s.callers);
  }

  list("intercepted by", s.interceptedBy);
  list("depends on", s.deps);
  list("used by", s.dependents);
  list("flows", s.flows);

  for (const rule of s.rules) lines.push(`rule ${rule}`);
  // Hole kinds sorted by name so the text is stable.
  const holes = Object.entries(s.holes).sort(([a], [b]) => (a < b ? -1 : 1)).map(([kind, n]) => `${n} ${kind}`);
  list("not resolved", holes);

  if (s.fingerprint) lines.push(`fingerprint ${s.fingerprint.own.slice(0, 12)} · closure ${s.fingerprint.closure.slice(0, 12)}${s.fingerprint.complete ? "" : " (incomplete)"}`);

  return lines.join("\n");
}
