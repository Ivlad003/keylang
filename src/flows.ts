// Evidence for flows: ID, static, tests, and trace are separate verdicts.
// A step is checked from its parent (the trigger for a top-level step), never
// from its siblings. Reports and traces are loaded by the caller; this module
// only compares them with the specs and the snapshot.

import { createHash } from "node:crypto";
import { diagnostic, type Diagnostic } from "./diag.ts";
import { sectionNodes, walk, type Document, type Node } from "./ir.ts";
import { renderTokens } from "./parser.ts";
import type { Index } from "./resolve.ts";
import { compareText, type Span } from "./span.ts";
import { matchTest, type TestCase } from "./test-report.ts";
import { traceFlow, type ShapeNode, type TraceEvidence, type TraceRun } from "./trace-evidence.ts";
import type { Verdict } from "./verdict.ts";

interface SnapshotEdge {
  kind: string;
  source: string;
  target: string | null;
  candidates?: string[];
  resolution: string;
  file: string | null;
  line: number;
  col: number;
  reason?: string;
  text?: string;
  via?: "default" | "injected";
  hook?: string;
  site?: string;
  closure?: true;
}

interface SnapshotNodeView {
  kind: string;
  layer?: string;
  members?: string;
  signature?: string | null;
  file: string | null;
  line: number | null;
  endLine?: number;
  escapes?: { file: string; line: number; col: number; reason: string };
}

/**
 * Which call edges prove a static path. `shape`: calls written in the code.
 * `behavior`: also the default of a hook and values resolved callers inject
 * for it — what runs, not only what is written.
 */
export type StaticMode = "shape" | "behavior";

export const STATIC_MODES: readonly StaticMode[] = ["behavior", "shape"];

export interface FlowInput {
  snapshotId: string | null;
  nodes: Record<string, SnapshotNodeView>;
  edges: SnapshotEdge[];
  /** Constructs the snapshot does not turn into edges (`eval`, computed members, …). */
  coverage?: { kind: string; file: string; line: number; col: number; reason: string; text?: string }[];
  /** Default `behavior`. */
  static?: StaticMode;
  /** Test cases from `check.tests`; null when it is not configured. */
  tests: TestCase[] | null;
  /** Trace runs from `check.trace`; null when it is not configured. */
  traces: TraceRun[] | null;
}

interface Planned {
  kind: string;
  signature: string | null;
  file: string;
  span: Span;
  /** The code now has a matching symbol: the step is checked as implemented. */
  implemented: boolean;
}

type Channel = "ID" | "static" | "tests" | "trace";

export function evaluateFlows(docs: readonly Document[], index: Index, input: FlowInput): { diagnostics: Diagnostic[]; verdicts: Verdict[] } {
  const diagnostics: Diagnostic[] = [];
  const verdicts: Verdict[] = [];
  const planned = collectPlanned(docs, input, diagnostics);
  const graph = callGraph(input);
  // The spec line a verdict is about, for its hash: set while a node is visited.
  let spec = "";
  const verdict = (channel: Channel, area: string, value: Verdict["verdict"], file: string, span: Span, message: string, evidence?: Verdict["evidence"]): void => {
    verdicts.push({
      verdict: value,
      criterion: channel,
      area,
      snapshotId: input.snapshotId,
      specHash: specHash(spec),
      file,
      line: span.start.line,
      col: span.start.col,
      code: channel,
      message: `${value} ${area}: ${message}`,
      ...(evidence ? { evidence } : {}),
    });
  };

  for (const doc of docs) {
    for (const section of doc.sections) {
      if (section.kind !== "flow" || !section.name) continue;
      const flow = section.name.value;
      const top = sectionNodes(section);
      const triggerNode = top.find((node) => node.kind === "trigger");
      const trigger = triggerNode ? refOf(triggerNode) : null;
      let key = 0;
      const keys = new Map<Node, number>();
      const shape = (nodes: readonly Node[]): ShapeNode[] =>
        nodes.flatMap((node): ShapeNode[] => {
          if (node.kind === "when") {
            keys.set(node, key);
            return [{ kind: "when", key: key++, children: shape(node.children) }];
          }
          const id = node.kind === "step" ? refOf(node) : null;
          if (!id) return [];
          // A planned step is not expected in a trace; its children cannot be matched under it.
          if (planned.get(id)?.implemented === false) return [];
          keys.set(node, key);
          return [{ kind: "step", key: key++, id, children: shape(node.children) }];
        });
      // Steps may sit under the trigger or beside it; either way the trigger is their parent.
      const tree = shape([...(triggerNode?.children ?? []), ...top.filter((node) => node.kind !== "trigger")]);
      const triggerKey = triggerNode && trigger ? key++ : null;
      if (triggerNode && triggerKey !== null) keys.set(triggerNode, triggerKey);
      const traced: Map<number, TraceEvidence> | null =
        input.traces === null ? null : traceFlow(input.traces, flow, trigger && triggerKey !== null ? { key: triggerKey, id: trigger } : null, tree, input.snapshotId);

      const visit = (node: Node, parent: string | null, claim: Node | null): void => {
        spec = `${flow}\0${node.kind} ${renderTokens(node.tokens)}`;
        const nodeKey = keys.get(node);
        const traceOf = (): TraceEvidence | undefined => (nodeKey === undefined ? undefined : traced?.get(nodeKey));
        if (node.kind === "step" || node.kind === "trigger") {
          const id = refOf(node);
          if (id) {
            const plan = planned.get(id);
            const pending = plan !== undefined && !plan.implemented;
            const known = idVerdict(id, pending ? plan : undefined, node, doc.path, index, input, verdict);
            // A dangling id is K001 already; a static line would count it twice.
            if (node.kind === "step" && known !== "fail") {
              if (pending) verdict("static", id, "unverified", doc.path, node.span, `planned ${plan.kind}, not implemented`);
              else if (input.nodes[id] !== undefined) {
                const reach = reachability(graph, input, parent, id);
                verdict("static", id, reach.verdict, doc.path, node.span, reach.message, { provenance: "syntactic" });
              } else verdict("static", id, "unverified", doc.path, node.span, "not in the snapshot (opaque module)");
            }
            if (traced !== null) {
              if (pending) verdict("trace", id, "unverified", doc.path, node.span, `planned ${plan.kind}`);
              else {
                const evidence = traceOf();
                if (evidence) verdict("trace", id, evidence.verdict, doc.path, node.span, evidence.message, traceProvenance(evidence));
              }
            }
          }
          const next = node.kind === "step" || node.kind === "trigger" ? (id ?? parent) : parent;
          for (const child of node.children) visit(child, next, claim);
          return;
        }
        if (node.kind === "when") {
          const evidence = traceOf();
          if (evidence) verdict("trace", `when ${node.text?.value ?? ""}`, evidence.verdict, doc.path, node.span, evidence.message, traceProvenance(evidence));
        }
        if (node.kind === "invariant" || node.kind === "when" || node.kind === "then" || node.kind === "reads" || node.kind === "emits") {
          const area = claimArea(node);
          const proofs = node.children.filter((child) => child.kind === "test");
          if (proofs.length === 0 && node.kind !== "when") {
            verdict("tests", area, "unverified", doc.path, node.span, quantitative(node.text?.value ?? "") ? "needs a separate predicate or test (quantitative or negative property)" : "no test evidence");
          }
          for (const child of node.children) visit(child, parent, node);
          return;
        }
        if (node.kind === "test") {
          const name = node.label?.value ?? "";
          const file = node.text?.value ?? "";
          const matched = matchTest(input.tests, file, name, input.snapshotId);
          const area = claim ? claimArea(claim) : `test ${file} "${name}"`;
          verdict("tests", area, matched.verdict, doc.path, node.span, `${matched.message} (${file} "${name}")`, { provenance: "test-report", ...(matched.runId ? { runId: matched.runId } : {}) });
          return;
        }
        for (const child of node.children) visit(child, parent, claim);
      };
      for (const node of top) visit(node, trigger, null);
    }
  }
  return { diagnostics, verdicts };
}

function refOf(node: Node): string | null {
  return node.refs[0]?.target ?? node.id ?? null;
}

function claimArea(node: Node): string {
  const text = node.text?.value ?? node.refs[0]?.target ?? "";
  return `${node.kind} ${text}`.trim();
}

function traceProvenance(evidence: TraceEvidence): Verdict["evidence"] {
  return { provenance: "trace", ...(evidence.runId ? { runId: evidence.runId } : {}), ...(evidence.testId ? { testId: evidence.testId } : {}) };
}

/** A count, a bound, or a negation: a subsequence of calls cannot prove it. */
function quantitative(text: string): boolean {
  return /(\bno more than\b|\bat most\b|\bat least\b|\bnever\b|\bexactly\b|\bonly once\b|\bnot more\b|≤|≥|<=|>=|не більше|не менше|жодного|ніколи|рівно|лише раз)/i.test(text);
}

function idVerdict(
  id: string,
  plan: Planned | undefined,
  node: Node,
  file: string,
  index: Index,
  input: FlowInput,
  verdict: (channel: Channel, area: string, value: Verdict["verdict"], file: string, span: Span, message: string) => void,
): Verdict["verdict"] {
  const say = (value: Verdict["verdict"], message: string): Verdict["verdict"] => {
    verdict("ID", id, value, file, node.span, message);
    return value;
  };
  if (plan) return say("unverified", `planned ${plan.kind}`);
  if (input.nodes[id] !== undefined || index.lookup(id).kind === "exact") return say("ok", "exact");
  if (moduleMembers(input.nodes, id) === "opaque") return say("unverified", "opaque module");
  return say("fail", "K001 dangling reference");
}

interface Step {
  from: string;
  to: string;
  edge: SnapshotEdge;
}

interface CallGraph {
  /** Resolved call edges by source; `to` is a class's constructor for `new X()`. */
  resolved: Map<string, Step[]>;
  /** Unresolved and ambiguous call edges by source function. */
  open: Map<string, SnapshotEdge[]>;
  /** Every known caller of a fn: resolved edges of both kinds and ambiguous candidates. */
  callers: Map<string, Step[]>;
  /** Fns by the name code calls them (`callName`), for calls whose receiver is unknown. */
  byName: Map<string, string[]>;
  /** Unsupported constructs by file. */
  unsupported: Map<string, NonNullable<FlowInput["coverage"]>>;
  /** A module keylang has not read (excluded, unparsed): its calls are unknown. */
  opaque: string | null;
}

function callGraph(input: FlowInput): CallGraph {
  const resolved = new Map<string, Step[]>();
  const open = new Map<string, SnapshotEdge[]>();
  const callers = new Map<string, Step[]>();
  const add = <T>(map: Map<string, T[]>, key: string, item: T): void => {
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  };
  // `new X()` names the class; what runs is its constructor.
  const callable = (id: string): string => (input.nodes[id]?.kind !== "fn" && input.nodes[`${id}.constructor`]?.kind === "fn" ? `${id}.constructor` : id);
  for (const edge of input.edges) {
    if (edge.kind !== "call") continue;
    if (edge.resolution === "resolved" && edge.target) {
      const step = { from: edge.source, to: callable(edge.target), edge };
      add(resolved, edge.source, step);
      add(callers, step.to, step);
    } else {
      add(open, edge.source, edge);
      for (const candidate of edge.candidates ?? []) add(callers, callable(candidate), { from: edge.source, to: callable(candidate), edge });
    }
  }
  const byName = new Map<string, string[]>();
  for (const [id, node] of Object.entries(input.nodes)) if (node.kind === "fn") add(byName, callName(id), id);
  const unsupported = new Map<string, NonNullable<FlowInput["coverage"]>>();
  for (const item of input.coverage ?? []) if (item.kind === "unsupported") add(unsupported, item.file, item);
  const opaque = Object.entries(input.nodes).find(([, node]) => node.kind === "module" && node.members === "opaque" && node.layer !== "external")?.[0] ?? null;
  return { resolved, open, callers, byName, unsupported, opaque };
}

function lastSegment(text: string): string {
  return text.slice(text.lastIndexOf(".") + 1);
}

/**
 * The name code calls a fn by: `m` for `X.m` and `X.m-static`, `#go` for
 * `X.go-private` (§11: a member that shares its name with another gets a suffix).
 */
function callName(id: string): string {
  const segment = lastSegment(id);
  const suffix = /-(static-private|private|static)$/.exec(segment);
  if (!suffix) return segment;
  const name = segment.slice(0, suffix.index);
  return suffix[1] === "static" ? name : `#${name}`;
}

/** Fns a call by `name` (`feed`, `#work`) may run. A `#work` call also matches a private member whose ID has no suffix. */
function namedLike(graph: CallGraph, name: string): string[] {
  const plain = graph.byName.get(name) ?? [];
  return name.startsWith("#") ? [...plain, ...(graph.byName.get(name.slice(1)) ?? [])] : plain;
}

function describeVia(edge: SnapshotEdge): string {
  return edge.via === "injected" ? `\`${edge.hook ?? edge.text ?? ""}\` injected at ${edge.site ?? "?"}` : `the default of the hook \`${edge.hook ?? edge.text ?? ""}\``;
}

function describeHole(edge: SnapshotEdge, target: string): string {
  if (edge.resolution === "ambiguous") return `ambiguous call \`${edge.text ?? edge.source}\` [${(edge.candidates ?? []).join(", ")}]`;
  if (edge.resolution === "resolved") {
    if (edge.via) return `${describeVia(edge)} (not followed with --static=shape)`;
    return `\`${edge.text ?? ""}\` may dispatch to another \`${lastSegment(edge.text ?? callName(target))}\``;
  }
  return edge.reason ?? `unresolved call \`${edge.text ?? ""}\``;
}

function at(edge: SnapshotEdge): string {
  return `${edge.file}:${edge.line}:${edge.col}`;
}

/**
 * Static reachability of `target` from `parent`.
 *
 * `ok`: a path over resolved calls outside closures (in `behavior` mode also
 * hook defaults and injected values). Otherwise the question is whether code
 * keylang cannot follow could still reach the target:
 * - a call with an unknown receiver (`x.feed()`, `cb()`) may run any fn of the
 *   same name, so the search goes on through every fn named like it; so does
 *   a resolved method call (an override may run instead), an ambiguous call
 *   (every candidate), a call in a closure (it runs only if that value is
 *   called), and a hook edge in `shape` mode. A path found this way is
 *   `unverified`, naming its first such call.
 * - a fn on some route to the target that escapes (read as a value, an
 *   accessor, an implicit method, called from a closure, from module-level
 *   code or by a base class keylang has not read) may be run by any code
 *   holding it; `eval`, `new Function`, a computed call in code a proven or
 *   possible route reaches, a computed member or a namespace that mentions
 *   such a fn, and a module keylang has not read are the same: `unverified`.
 * - otherwise the target is reachable only by name and no name matches:
 *   `fail`, a confirmed absence.
 */
function reachability(graph: CallGraph, input: FlowInput, parent: string | null, target: string): { verdict: Verdict["verdict"]; message: string } {
  if (parent === null) return { verdict: "unverified", message: "no trigger to reach it from" };
  const from = input.nodes[parent];
  if (!from) return { verdict: "unverified", message: `parent \`${parent}\` is not in the snapshot` };
  if (from.kind !== "fn") return { verdict: "unverified", message: `parent \`${parent}\` is a ${from.kind}, not a callable` };
  const to = input.nodes[target];
  if (to && to.kind !== "fn") return { verdict: "unverified", message: `\`${target}\` is a ${to.kind}, not a callable` };
  const behavior = (input.static ?? "behavior") === "behavior";
  // A call in a closure runs only when that function value is called: it is a possible route, not a proof.
  const proves = (step: Step): boolean => !step.edge.closure && (behavior || step.edge.via === undefined);

  // 1. A proof: breadth-first over the edges this mode follows.
  const previous = new Map<string, Step>();
  const depth = new Map<string, number>([[parent, 0]]);
  const queue = [parent];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const step of graph.resolved.get(id) ?? []) {
      if (!proves(step)) continue;
      // A step that is its own parent is reached by recursion.
      if (step.to === target) {
        previous.set(target, step);
        return { verdict: "ok", message: routeMessage(parent, target, previous) };
      }
      if (depth.has(step.to)) continue;
      depth.set(step.to, depth.get(id)! + 1);
      previous.set(step.to, step);
      queue.push(step.to);
    }
  }

  // 2. A possible route through calls keylang cannot pin to one target.
  const { edge: uncertain, seen: possible } = possibleRoute(graph, input, parent, target, proves);
  const holes = [...depth.keys()].flatMap((id) => (graph.open.get(id) ?? []).map((edge) => ({ edge, depth: depth.get(id)! })));
  const more = (shown: SnapshotEdge): string => {
    const others = holes.filter((hole) => hole.edge !== shown).length;
    return others > 0 ? ` (and ${others} more unresolved call${others === 1 ? "" : "s"} in reachable code)` : "";
  };
  if (uncertain?.closure && uncertain.resolution === "resolved" && !uncertain.via) {
    return { verdict: "unverified", message: `no resolved path from ${parent}; reached only through a closure of ${uncertain.source}: \`${uncertain.text ?? ""}\` at ${at(uncertain)} runs only when that function value is called${more(uncertain)}` };
  }
  if (uncertain) return { verdict: "unverified", message: `no resolved path from ${parent}; ${describeHole(uncertain, target)} at ${at(uncertain)} may reach it${more(uncertain)}` };

  // 3. Code that may run a fn without naming it.
  const routes = callersOf(graph, target);
  // `eval` and computed calls count in code reached by a possible route too, not only by a proof.
  const blocker = escapeOf(graph, input, routes, new Set([...depth.keys(), ...possible]));
  if (blocker) {
    const best = bestHole(holes, target);
    const lead = best ? `no resolved path from ${parent}; ${describeHole(best, target)} at ${at(best)} may reach it${more(best)}` : `no call path from ${parent} in the static graph`;
    return { verdict: "unverified", message: `${lead}; ${blocker}` };
  }
  const unseen = holes.length > 0 && graph.opaque ? graph.opaque : null;
  if (unseen) return { verdict: "unverified", message: `no call path from ${parent} in the static graph; \`${unseen}\` is opaque and may call it` };
  return { verdict: "fail", message: `absence: no call path from ${parent}; \`${target}\` and its callers are called only by name, and no call from ${parent}'s reachable code can reach them` };
}

function routeMessage(parent: string, target: string, previous: Map<string, Step>): string {
  const steps: Step[] = [];
  // do-while: a recursive step (target = parent) still has its route.
  let id = target;
  do {
    const step = previous.get(id)!;
    steps.unshift(step);
    id = step.from;
  } while (id !== parent);
  const notes = steps.filter((step) => step.edge.via).map((step) => (steps.length === 1 ? describeVia(step.edge) : `${step.from} → ${step.to}: ${describeVia(step.edge)}`));
  if (steps.length === 1) return `called from ${parent}${notes.length > 0 ? ` through ${notes[0]}` : ""}`;
  const through = notes.length > 0 ? ` (${notes.join("; ")})` : "";
  return `reachable from ${parent} via ${steps.slice(0, -1).map((step) => step.to).join(" → ")}${through}`;
}

/**
 * Breadth-first search that also follows calls with more than one possible
 * target and calls in closures. Returns the first such call on the shortest
 * route (null when there is none) and every fn the search reached.
 */
function possibleRoute(graph: CallGraph, input: FlowInput, parent: string, target: string, proves: (step: Step) => boolean): { edge: SnapshotEdge | null; seen: Set<string> } {
  const first = new Map<string, SnapshotEdge | null>([[parent, null]]);
  const queue = [parent];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const lead = first.get(id) ?? null;
    const next: { to: string; edge: SnapshotEdge | null }[] = [];
    for (const step of graph.resolved.get(id) ?? []) {
      next.push({ to: step.to, edge: proves(step) ? null : step.edge });
      // A method call may run an override of the same name.
      if (step.edge.text?.includes(".") && !step.edge.via) for (const other of namedLike(graph, callName(step.to))) if (other !== step.to) next.push({ to: other, edge: step.edge });
    }
    for (const edge of graph.open.get(id) ?? []) {
      const names = edge.resolution === "ambiguous" ? (edge.candidates ?? []) : namedLike(graph, lastSegment(edge.text ?? ""));
      for (const other of names) next.push({ to: input.nodes[other]?.kind === "fn" ? other : `${other}.constructor`, edge });
    }
    for (const item of next) {
      if (first.has(item.to)) continue;
      const via = lead ?? item.edge;
      if (item.to === target) return { edge: via, seen: new Set(first.keys()) };
      first.set(item.to, via);
      queue.push(item.to);
    }
  }
  return { edge: null, seen: new Set(first.keys()) };
}

/** Every fn with a resolved or candidate route to `target`, the target included. */
function callersOf(graph: CallGraph, target: string): Set<string> {
  const seen = new Set([target]);
  const stack = [target];
  while (stack.length > 0) {
    for (const step of graph.callers.get(stack.pop()!) ?? []) {
      if (seen.has(step.from)) continue;
      seen.add(step.from);
      stack.push(step.from);
    }
  }
  return seen;
}

/** Why code keylang cannot follow may still run a fn of `routes`; null when every route is by name. */
function escapeOf(graph: CallGraph, input: FlowInput, routes: Set<string>, reachable: ReadonlySet<string>): string | null {
  for (const id of [...routes].sort()) {
    const escapes = input.nodes[id]?.escapes;
    if (escapes) return `${escapes.reason} at ${escapes.file}:${escapes.line}:${escapes.col}, so code keylang cannot follow may call \`${id}\``;
  }
  for (const id of [...routes].sort()) {
    const closure = (graph.callers.get(id) ?? []).find((step) => step.edge.closure);
    if (closure) return `\`${id}\` is called from a closure in \`${closure.from}\` at ${at(closure.edge)}, which code keylang cannot follow may run`;
  }
  const names = [...routes].map((id) => callName(id).replace(/^#/, ""));
  for (const [file, items] of [...graph.unsupported].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    for (const item of items) {
      // `eval`, `new Function`, `obj[key]()`, `import(expr)` in reachable code may call anything.
      const inReachable = [...reachable].some((id) => {
        const node = input.nodes[id];
        return node?.file === file && node.line !== null && item.line >= node.line && item.line <= (node.endLine ?? node.line);
      });
      const mentions = item.text !== undefined && names.some((name) => new RegExp(`\\b${name.replace(/[$]/g, "\\$")}\\b`).test(item.text!));
      if (inReachable || mentions) return `${item.reason} at ${file}:${item.line}:${item.col} may call it`;
    }
  }
  return null;
}

/** The hole most likely to be the missing link: named like the target, then nearest the parent, then by position. */
function bestHole(holes: { edge: SnapshotEdge; depth: number }[], target: string): SnapshotEdge | null {
  const name = callName(target).replace(/^#/, "");
  const rank = (hole: { edge: SnapshotEdge; depth: number }): number => (hole.edge.resolution === "ambiguous" && hole.edge.candidates?.includes(target) ? 0 : lastSegment(hole.edge.text ?? "").replace(/^#/, "") === name ? 1 : 2);
  const sorted = [...holes].sort((a, b) => rank(a) - rank(b) || a.depth - b.depth || compareText(a.edge.file ?? "", b.edge.file ?? "") || a.edge.line - b.edge.line || a.edge.col - b.edge.col);
  return sorted[0]?.edge ?? null;
}

function moduleMembers(nodes: FlowInput["nodes"], id: string): "complete" | "opaque" | null {
  let cur = id;
  for (;;) {
    const dot = cur.lastIndexOf(".");
    if (dot === -1) return null;
    cur = cur.slice(0, dot);
    const node = nodes[cur];
    if (node?.kind === "module" && (node.members === "complete" || node.members === "opaque")) return node.members;
  }
}

/**
 * `planned` declarations. A duplicate is K002. When the code has the symbol,
 * a different kind or signature is K201, a match is the K202 hint to remove
 * the declaration, and the step is checked as implemented.
 */
function collectPlanned(docs: readonly Document[], input: FlowInput, diagnostics: Diagnostic[]): Map<string, Planned> {
  const planned = new Map<string, Planned>();
  for (const doc of docs) {
    for (const section of doc.sections) {
      for (const top of sectionNodes(section)) {
        walk(top, (node) => {
          if (node.kind !== "planned" || !node.id) return;
          const span = node.name?.span ?? node.span;
          const first = planned.get(node.id);
          if (first) {
            diagnostics.push(diagnostic("K002", doc.path, node.span, `duplicate planned \`${node.id}\` (first declared at ${first.file}:${first.span.start.line}:${first.span.start.col})`));
            return;
          }
          const kind = node.label?.value ?? "fn";
          const signature = node.text?.value ?? null;
          const code = input.nodes[node.id];
          const entry: Planned = { kind, signature, file: doc.path, span, implemented: false };
          planned.set(node.id, entry);
          if (!code) return;
          entry.implemented = true;
          if (kind !== "event" && code.kind !== kind) {
            diagnostics.push(diagnostic("K201", doc.path, node.span, `planned ${kind} \`${node.id}\` is implemented as a ${code.kind} (${code.file ?? "?"}:${code.line ?? 1})`));
          } else if (signature !== null && code.signature && normalizeSignature(signature) !== normalizeSignature(code.signature)) {
            diagnostics.push(diagnostic("K201", doc.path, node.span, `planned ${kind} \`${node.id}\` has signature \`${signature}\`, the code has \`${code.signature}\` (${code.file ?? "?"}:${code.line ?? 1})`));
          } else {
            diagnostics.push(diagnostic("K202", doc.path, node.span, `planned ${kind} \`${node.id}\` is implemented (${code.file ?? "?"}:${code.line ?? 1}); remove the declaration`));
          }
        });
      }
    }
  }
  return planned;
}

function normalizeSignature(text: string): string {
  return text.replace(/->/g, "→").replace(/\s+/g, "").replace(/;$/, "");
}

function specHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
