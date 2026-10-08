// Diagrams of the model (business-flows/20, ADR 0014): a flow as BPMN-like
// shapes, an entry point's call tree, the layers and their rules. A view is a
// pure function of the snapshot, the SpecIR and the check results — no model,
// no file — so the same inputs give the same JSON. The mapping follows the
// table «Відображення в BPMN» of ADR 0023: a layer is a lane, a trigger the
// start event, a step a task, `when` an exclusive gateway with its branch,
// `emits` an event, a package an external participant, and a hole on the
// route a `?` task with its reason. `layout` places the shapes in plain
// TypeScript (ranks by depth, order by spec line, fixed sizes); manual
// positions (the layout file of ticket 24) override it.

import { EXTERNAL } from "./external-ids.ts";
import type { AnalysisSnapshot } from "./snapshot.ts";
import type { Flow, FlowItem, SpecIR, Trigger } from "./spec-ir.ts";
import { compareText } from "./span.ts";

export type DiagramView =
  | { kind: "flow"; name: string }
  | { kind: "entry"; id: string; depth?: number }
  | { kind: "event"; name: string }
  | { kind: "layers" }
  | { kind: "process"; domain: string };

export type DiagramVerdict = "ok" | "fail" | "unverified" | "planned" | null;

export interface DiagramNode {
  id: string;
  kind: "start" | "task" | "gateway" | "parallel" | "event" | "timer" | "external" | "hole" | "module" | "fn" | "layer";
  label: string;
  /** The code (`id`, `file`, `line`) and the spec line (`specFile`, `specLine`) the shape stands for. */
  ref?: { id?: string; file?: string; line?: number; specFile?: string; specLine?: number };
  verdict?: DiagramVerdict;
  /** A `hole`: why the route is not proven, as `check` says it. */
  reason?: string;
  /** The lane (layer) the shape sits in. */
  group?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DiagramEdge {
  from: string;
  to: string;
  kind: "sequence" | "call" | "dependency" | "allow" | "deny" | "emits" | "continues";
  label?: string;
  verdict?: DiagramVerdict;
}

/** A lane: one layer, a band across the diagram. */
export interface DiagramGroup {
  id: string;
  label: string;
  kind: "lane";
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Diagram {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  groups: DiagramGroup[];
  /** Why the diagram is empty or cut short. */
  reason?: string;
}

/** What a diagram reads of a check result: `CheckResult` and `Verdict` both fit. */
export interface DiagramResult {
  file: string;
  line: number;
  verdict: string;
  criterion?: string;
  area?: string;
  /** The message: `evidence` of a `CheckResult`, `message` of a `Verdict`. */
  evidence?: string;
  message?: string;
}

export interface DiagramInput {
  snapshot: AnalysisSnapshot | null;
  spec: SpecIR;
  results: readonly DiagramResult[];
  view: DiagramView;
}

/** Positions that win over the automatic layout, by node id. */
export type Positions = Readonly<Record<string, { x: number; y: number; w?: number; h?: number }>>;

export const DEFAULT_DEPTH = 3;
export const MAX_DEPTH = 10;
/** An entry's call tree stops growing here; `reason` says it was cut. */
export const MAX_NODES = 400;

export const VIEW_KINDS = ["flow", "entry", "event", "layers", "process"] as const;

/** A view from the query of `GET /api/diagram`, or why it names none. */
export function parseView(query: URLSearchParams): DiagramView | string {
  const view = query.get("view");
  const need = (name: string): string | null => {
    const value = query.get(name);
    return value === null || value === "" ? null : value;
  };
  switch (view) {
    case "flow":
    case "event": {
      const name = need("name");
      return name === null ? `view=${view} needs name=` : { kind: view, name };
    }
    case "entry": {
      const id = need("id");
      if (id === null) return "view=entry needs id=";
      const depth = query.get("depth");
      if (depth === null) return { kind: "entry", id };
      const n = /^\d+$/.test(depth) ? Number(depth) : NaN;
      return n >= 1 && n <= MAX_DEPTH ? { kind: "entry", id, depth: n } : `depth must be 1–${MAX_DEPTH}`;
    }
    case "layers":
      return { kind: "layers" };
    case "process": {
      const domain = need("domain") ?? need("name");
      return domain === null ? "view=process needs domain=" : { kind: "process", domain };
    }
    default:
      return `unknown view: expected one of ${VIEW_KINDS.join(", ")}`;
  }
}

/** What there is to draw: flow names in spec order, entry points as the snapshot lists them, layers in their order. */
export function viewsOf(snapshot: AnalysisSnapshot | null, spec: SpecIR): { flows: string[]; entries: { id: string; kind: string; label: string }[]; layers: string[] } {
  return {
    flows: [...new Set(spec.flows.map((flow) => flow.name))],
    entries: (snapshot?.entries ?? []).map((entry) => ({ id: entry.id, kind: entry.kind, label: entry.label })),
    layers: snapshot ? layerOrder(snapshot) : [],
  };
}

export function diagramOf(input: DiagramInput): Diagram {
  const { view } = input;
  if (view.kind === "flow") return layout(flowDiagram(input, view.name));
  if (view.kind === "event") return empty(`no event nodes in the snapshot yet: events come with business-flows/08 and 16`);
  if (view.kind === "process") return empty(`processes are not available yet: grouping flows into processes is business-flows/12`);
  if (!input.snapshot) return empty("no snapshot: the specs were checked without code");
  if (view.kind === "entry") return layout(entryDiagram(input.snapshot, input.results, view.id, view.depth ?? DEFAULT_DEPTH));
  return layout(layersDiagram(input.snapshot, input.spec, input.results));
}

function empty(reason: string): Diagram {
  return { nodes: [], edges: [], groups: [], reason };
}

// ── verdicts ────────────────────────────────────────────────────────────────

const RANK: Record<string, number> = { fail: 3, unverified: 2, ok: 1 };

function worst(values: readonly string[]): DiagramVerdict {
  let best: DiagramVerdict = null;
  for (const value of values) if ((RANK[value] ?? 0) > (best === null ? 0 : RANK[best]!)) best = value as DiagramVerdict;
  return best;
}

function messageOf(result: DiagramResult): string {
  return result.evidence ?? result.message ?? "";
}

/** Results by `file:line`. */
function byLine(results: readonly DiagramResult[]): Map<string, DiagramResult[]> {
  const out = new Map<string, DiagramResult[]>();
  for (const result of results) {
    const key = `${result.file}:${result.line}`;
    const list = out.get(key) ?? [];
    list.push(result);
    out.set(key, list);
  }
  return out;
}

/** The worst verdict about each ID and every ID above it (`a.b.c` counts for `a.b` and `a`). */
function byArea(results: readonly DiagramResult[]): Map<string, DiagramVerdict> {
  const out = new Map<string, DiagramVerdict>();
  for (const result of results) {
    if (!result.area || RANK[result.verdict] === undefined) continue;
    const parts = result.area.split(".");
    for (let i = 1; i <= parts.length; i++) {
      const id = parts.slice(0, i).join(".");
      out.set(id, worst([out.get(id) ?? "", result.verdict]));
    }
  }
  return out;
}

// ── lanes ───────────────────────────────────────────────────────────────────

/** The repository's layers in `keylang.json` order, then the others (packages last). */
function layerOrder(snapshot: AnalysisSnapshot): string[] {
  const configured = Object.keys(snapshot.manifest.config.layers).filter((layer) => snapshot.nodes[layer]?.kind === "layer");
  const own = new Set(configured);
  const others = Object.keys(snapshot.nodes)
    .filter((id) => snapshot.nodes[id]?.kind === "layer" && !own.has(id))
    .sort((a, b) => Number(a === EXTERNAL) - Number(b === EXTERNAL) || compareText(a, b));
  return [...configured, ...others];
}

function layerOf(snapshot: AnalysisSnapshot | null, id: string): string | undefined {
  const known = snapshot?.nodes[id]?.layer;
  if (known) return known;
  const first = id.split(".")[0]!;
  return snapshot?.nodes[first]?.kind === "layer" || !snapshot ? first : undefined;
}

/** One lane per layer some node sits in, in the layers' order; sized by `layout`. */
function lanes(snapshot: AnalysisSnapshot | null, nodes: readonly DiagramNode[]): DiagramGroup[] {
  const used = new Set(nodes.flatMap((node) => (node.group ? [node.group] : [])));
  const order = snapshot ? layerOrder(snapshot) : [];
  const rest = [...used].filter((id) => !order.includes(id)).sort(compareText);
  return [...order, ...rest].filter((id) => used.has(id)).map((id) => ({ id, label: id, kind: "lane", x: 0, y: 0, w: 0, h: 0 }));
}

// ── flow ────────────────────────────────────────────────────────────────────

function flowDiagram(input: DiagramInput, name: string): Diagram {
  const flow = input.spec.flows.find((f) => f.name === name);
  if (!flow) return empty(`no flow named \`${name}\``);
  const { snapshot } = input;
  const lines = byLine(input.results);
  const planned = new Set(input.spec.planned.filter((p) => p.decl === "fn" || p.decl === "module" || p.decl === "type").map((p) => p.id));
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];

  const at = (item: { span: { start: { line: number } } }): number => item.span.start.line;
  const resultsAt = (item: { span: { start: { line: number } } }): DiagramResult[] => lines.get(`${flow.file}:${at(item)}`) ?? [];
  const add = (node: Omit<DiagramNode, "x" | "y" | "w" | "h">): DiagramNode => {
    const placed = { ...node, x: 0, y: 0, w: 0, h: 0 };
    nodes.push(placed);
    return placed;
  };
  const link = (from: string | null, to: string, kind: DiagramEdge["kind"], extra: { label?: string; verdict?: DiagramVerdict } = {}): void => {
    if (from !== null) edges.push({ from, to, kind, ...(extra.label !== undefined ? { label: extra.label } : {}), ...(extra.verdict !== undefined ? { verdict: extra.verdict } : {}) });
  };
  const refOf = (id: string, line: number): NonNullable<DiagramNode["ref"]> => {
    const code = snapshot?.nodes[id];
    return { id, ...(code?.file ? { file: code.file } : {}), ...(code?.line ? { line: code.line } : {}), specFile: flow.file, specLine: line };
  };
  const isExternal = (id: string): boolean => id === EXTERNAL || id.startsWith(`${EXTERNAL}.`) || snapshot?.nodes[id]?.layer === EXTERNAL;

  /** A trigger, step or `then <id>`: its shape, and a hole before it when `check` left the route into it unverified. */
  const target = (item: Trigger | FlowItem, id: string, from: string | null, label?: string): string => {
    const line = at(item);
    const found = resultsAt(item);
    const statics = found.filter((r) => r.criterion === "static");
    const isPlanned = planned.has(id) && snapshot?.nodes[id] === undefined;
    const verdict: DiagramVerdict = isPlanned ? "planned" : worst(found.map((r) => r.verdict));
    const routeVerdict: DiagramVerdict = isPlanned ? "planned" : worst(statics.map((r) => r.verdict));
    const kind: DiagramNode["kind"] = item.kind === "trigger" ? "start" : isExternal(id) ? "external" : "task";
    const group = layerOf(snapshot, id);
    let into = from;
    const unproven = isPlanned ? undefined : statics.find((r) => r.verdict === "unverified");
    if (unproven) {
      const hole = add({ id: `hole:${line}`, kind: "hole", label: "?", reason: stripLead(messageOf(unproven), id), ref: { specFile: flow.file, specLine: line }, verdict: "unverified" });
      link(into, hole.id, "sequence", label !== undefined ? { label } : {});
      into = hole.id;
      label = undefined;
    }
    const node = add({ id: `${item.kind}:${line}`, kind, label: id, ref: refOf(id, line), verdict, ...(group ? { group } : {}) });
    link(into, node.id, "sequence", { ...(label !== undefined ? { label } : {}), ...(routeVerdict !== null ? { verdict: routeVerdict } : {}) });
    return node.id;
  };

  /** Draws a block of items after `from`; returns the node the next item follows. */
  const block = (items: readonly (Trigger | FlowItem)[], from: string | null, group: string | undefined): string | null => {
    let tail = from;
    for (const item of items) tail = one(item, tail, group);
    return tail;
  };

  const one = (item: Trigger | FlowItem, from: string | null, group: string | undefined): string | null => {
    switch (item.kind) {
      case "trigger":
      case "step": {
        const id = target(item, item.target.target, from);
        return block(item.children, id, layerOf(snapshot, item.target.target));
      }
      case "when": {
        const line = at(item);
        const gateway = add({ id: `when:${line}`, kind: "gateway", label: item.condition, ref: { specFile: flow.file, specLine: line }, verdict: worst(resultsAt(item).map((r) => r.verdict)), ...(group ? { group } : {}) });
        link(from, gateway.id, "sequence");
        // The branch hangs off the gateway under its condition; the default path goes on from the gateway.
        let tail: string | null = gateway.id;
        let first = true;
        for (const child of item.children) {
          const before = edges.length;
          tail = one(child, tail, group);
          if (first && edges.length > before && edges[before]!.from === gateway.id) {
            edges[before] = { ...edges[before]!, label: item.condition };
            first = false;
          }
        }
        return gateway.id;
      }
      case "then": {
        if (item.form === "ref") {
          const id = target(item, item.target.target, from);
          return block(item.children, id, layerOf(snapshot, item.target.target));
        }
        const line = at(item);
        const task = add({ id: `then:${line}`, kind: "task", label: item.prose, ref: { specFile: flow.file, specLine: line }, verdict: worst(resultsAt(item).map((r) => r.verdict)), ...(group ? { group } : {}) });
        link(from, task.id, "sequence");
        return block(item.children, task.id, group);
      }
      case "emits": {
        const line = at(item);
        const name = item.body.replace(/^event\s+/, "").trim();
        const event = add({ id: `emits:${line}`, kind: "event", label: name, ref: { specFile: flow.file, specLine: line }, verdict: worst(resultsAt(item).map((r) => r.verdict)) });
        link(from, event.id, "emits");
        return event.id;
      }
      case "calls": {
        // A call without order: the parent calls each target itself, beside the sequence.
        const line = at(item);
        const found = resultsAt(item);
        item.targets.forEach((ref, i) => {
          const id = ref.target;
          const verdict = worst(found.filter((r) => r.area === id).map((r) => r.verdict));
          const g = layerOf(snapshot, id);
          const node = add({ id: `calls:${line}:${i}`, kind: isExternal(id) ? "external" : "task", label: id, ref: refOf(id, line), verdict, ...(g ? { group: g } : {}) });
          link(from, node.id, "call", verdict !== null ? { verdict } : {});
        });
        return from;
      }
      // Claims without a shape of their own: invariants, reads, tests and open questions.
      default:
        return from;
    }
  };

  block(flow.top, null, undefined);
  return { nodes, edges, groups: lanes(snapshot, nodes) };
}

/** `check`'s message without its `unverified <id>: ` lead. */
function stripLead(message: string, id: string): string {
  const lead = `unverified ${id}: `;
  return message.startsWith(lead) ? message.slice(lead.length) : message;
}

// ── entry ───────────────────────────────────────────────────────────────────

function entryDiagram(snapshot: AnalysisSnapshot, results: readonly DiagramResult[], id: string, depth: number): Diagram {
  const entry = snapshot.entries.find((e) => e.id === id);
  const root = snapshot.nodes[id];
  if (!entry && root?.kind !== "fn") return empty(`no entry point or fn \`${id}\``);
  const areas = byArea(results);
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const shown = new Map<string, string>();
  const calls = new Map<string, AnalysisSnapshot["edges"]>();
  for (const edge of snapshot.edges) {
    if (edge.kind !== "call") continue;
    const list = calls.get(edge.source) ?? [];
    list.push(edge);
    calls.set(edge.source, list);
  }
  let cut = false;
  const place = (target: string): string => {
    const known = shown.get(target);
    if (known) return known;
    const code = snapshot.nodes[target];
    const layer = code?.layer;
    const nodeId = `fn:${target}`;
    nodes.push({
      id: nodeId,
      kind: layer === EXTERNAL ? "external" : code?.kind === "module" ? "module" : "fn",
      label: target,
      ref: { id: target, ...(code?.file ? { file: code.file } : {}), ...(code?.line ? { line: code.line } : {}) },
      verdict: areas.get(target) ?? null,
      ...(layer ? { group: layer } : {}),
      x: 0,
      y: 0,
      w: 0,
      h: 0,
    });
    shown.set(target, nodeId);
    return nodeId;
  };
  const start: DiagramNode = {
    id: `entry:${id}`,
    kind: "start",
    label: entry?.label ?? id,
    ref: { id, ...(root?.file ? { file: root.file } : entry ? { file: entry.file } : {}), ...(root?.line ? { line: root.line } : entry ? { line: entry.line } : {}) },
    verdict: areas.get(id) ?? null,
    ...(root?.layer ? { group: root.layer } : {}),
    x: 0,
    y: 0,
    w: 0,
    h: 0,
  };
  nodes.push(start);
  shown.set(id, start.id);
  // A script runs its module's top level, whose calls the snapshot does not record: what it imports stands for them, unopened.
  if (root?.kind === "module") {
    for (const edge of snapshot.edges) {
      if (edge.source !== id || (edge.kind !== "import" && edge.kind !== "reexport") || edge.resolution !== "resolved" || !edge.target) continue;
      if (shown.has(edge.target)) continue;
      edges.push({ from: start.id, to: place(edge.target), kind: "dependency", label: "import" });
    }
    return { nodes, edges, groups: lanes(snapshot, nodes) };
  }
  // Breadth first: a fn is opened (its calls drawn) when it is less than `depth` calls from the entry.
  let frontier = [id];
  for (let level = 0; level < depth && frontier.length > 0; level++) {
    const next: string[] = [];
    for (const source of frontier) {
      const from = shown.get(source)!;
      const seen = new Set<string>();
      for (const edge of calls.get(source) ?? []) {
        if (nodes.length >= MAX_NODES) {
          cut = true;
          break;
        }
        if (edge.resolution === "resolved" && edge.target) {
          const isNew = !shown.has(edge.target);
          const to = place(edge.target);
          if (seen.has(to)) continue;
          seen.add(to);
          edges.push({ from, to, kind: "call" });
          if (isNew && snapshot.nodes[edge.target]?.layer !== EXTERNAL) next.push(edge.target);
          continue;
        }
        const reason = edge.resolution === "ambiguous" ? `ambiguous call \`${edge.text}\` [${(edge.candidates ?? []).join(", ")}]` : (edge.reason ?? `unresolved call \`${edge.text}\``);
        const hole: DiagramNode = { id: `hole:${edge.file}:${edge.line}:${edge.col}`, kind: "hole", label: "?", reason: `${reason} at ${edge.file}:${edge.line}:${edge.col}`, ref: { ...(edge.file ? { file: edge.file } : {}), line: edge.line }, verdict: "unverified", x: 0, y: 0, w: 0, h: 0 };
        if (shown.has(hole.id)) continue;
        shown.set(hole.id, hole.id);
        nodes.push(hole);
        edges.push({ from, to: hole.id, kind: "call", verdict: "unverified" });
      }
    }
    frontier = next;
  }
  return { nodes, edges, groups: lanes(snapshot, nodes), ...(cut ? { reason: `cut at ${MAX_NODES} nodes` } : {}) };
}

// ── layers ──────────────────────────────────────────────────────────────────

function layersDiagram(snapshot: AnalysisSnapshot, spec: SpecIR, results: readonly DiagramResult[]): Diagram {
  const order = layerOrder(snapshot);
  const areas = byArea(results);
  const nodes: DiagramNode[] = order.map((layer) => ({ id: `layer:${layer}`, kind: "layer", label: layer, ref: { id: layer }, verdict: areas.get(layer) ?? null, x: 0, y: 0, w: 0, h: 0 }));
  const edges: DiagramEdge[] = [];
  const counts = new Map<string, number>();
  for (const edge of snapshot.edges) {
    if (edge.target === null) continue;
    const from = snapshot.nodes[edge.source]?.layer;
    const to = snapshot.nodes[edge.target]?.layer;
    if (!from || !to || from === to) continue;
    const key = `${from}\u0000${to}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const pairs = [...counts.keys()].map((key) => key.split("\u0000") as [string, string]);
  pairs.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]) || order.indexOf(a[1]) - order.indexOf(b[1]));
  for (const [from, to] of pairs) edges.push({ from: `layer:${from}`, to: `layer:${to}`, kind: "dependency", label: String(counts.get(`${from}\u0000${to}`)) });
  for (const rule of spec.rules) {
    if (rule.kind !== "dependency") continue;
    const from = layerOf(snapshot, rule.from.target);
    const found = results.filter((r) => r.criterion === rule.text || (r.file === rule.file && r.line === rule.span.start.line));
    // A rule `check` says nothing against holds.
    const verdict: DiagramVerdict = worst(found.map((r) => r.verdict)) ?? "ok";
    for (const ref of rule.to) {
      const to = layerOf(snapshot, ref.target);
      if (!from || !to || !order.includes(from) || !order.includes(to)) continue;
      edges.push({ from: `layer:${from}`, to: `layer:${to}`, kind: rule.effect, label: rule.text, verdict });
    }
  }
  return { nodes, edges, groups: [] };
}

// ── layout ──────────────────────────────────────────────────────────────────

const SIZE: Record<DiagramNode["kind"], { w: number; h: number }> = {
  start: { w: 36, h: 36 },
  event: { w: 36, h: 36 },
  timer: { w: 36, h: 36 },
  gateway: { w: 50, h: 50 },
  parallel: { w: 50, h: 50 },
  hole: { w: 60, h: 40 },
  task: { w: 160, h: 60 },
  external: { w: 160, h: 60 },
  module: { w: 160, h: 60 },
  fn: { w: 160, h: 60 },
  layer: { w: 160, h: 60 },
};
/** One cell of the grid: the largest shape and the gaps around it. */
const CELL_W = 200;
const CELL_H = 90;
const LANE_PAD = 20;
/** Edges that order shapes left to right; `allow` and `deny` only annotate. */
const ORDERING: ReadonlySet<DiagramEdge["kind"]> = new Set(["sequence", "call", "dependency", "emits", "continues"]);

/**
 * Places the shapes: the rank of a node is its longest path from a node
 * without predecessors (back edges of a cycle ignored), its column; within a
 * lane and a rank, nodes go by spec line, then by their order in the
 * diagram. Lanes are horizontal bands as tall as their fullest rank.
 * `positions` override the computed place of a node. Pure: a new diagram.
 */
export function layout(diagram: Diagram, positions: Positions = {}): Diagram {
  const index = new Map(diagram.nodes.map((node, i) => [node.id, i]));
  const out = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const edge of diagram.edges) {
    if (!ORDERING.has(edge.kind) || !index.has(edge.from) || !index.has(edge.to) || edge.from === edge.to) continue;
    out.set(edge.from, [...(out.get(edge.from) ?? []), edge.to]);
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }
  // Depth first from every root in order, then from whatever a cycle left unreached: an edge back onto the stack is ignored.
  const rank = new Map<string, number>();
  const state = new Map<string, "open" | "done">();
  const order: string[] = [];
  const visit = (id: string): void => {
    if (state.get(id)) return;
    state.set(id, "open");
    for (const next of out.get(id) ?? []) visit(next);
    state.set(id, "done");
    order.push(id);
  };
  const roots = diagram.nodes.filter((node) => !indegree.get(node.id)).map((node) => node.id);
  for (const id of [...roots, ...diagram.nodes.map((node) => node.id)]) visit(id);
  // `order` is a reverse topological order of the edges kept; ranks follow it backwards.
  const forward = new Set<string>();
  const position = new Map(order.map((id, i) => [id, i]));
  for (const [from, list] of out) for (const to of list) if (position.get(from)! > position.get(to)!) forward.add(`${from}\u0000${to}`);
  for (const id of [...order].reverse()) {
    const own = rank.get(id) ?? 0;
    rank.set(id, own);
    for (const to of out.get(id) ?? []) if (forward.has(`${id}\u0000${to}`)) rank.set(to, Math.max(rank.get(to) ?? 0, own + 1));
  }

  const laneIds = diagram.groups.map((group) => group.id);
  const laneOf = (node: DiagramNode): number => (node.group !== undefined && laneIds.includes(node.group) ? laneIds.indexOf(node.group) : laneIds.length);
  // Slots by lane and rank, in spec-line order.
  const sorted = [...diagram.nodes].sort((a, b) => laneOf(a) - laneOf(b) || rank.get(a.id)! - rank.get(b.id)! || (a.ref?.specLine ?? Infinity) - (b.ref?.specLine ?? Infinity) || index.get(a.id)! - index.get(b.id)!);
  const slot = new Map<string, number>();
  const rows = new Map<number, number>();
  const used = new Map<string, number>();
  for (const node of sorted) {
    const key = `${laneOf(node)}:${rank.get(node.id)}`;
    const n = used.get(key) ?? 0;
    used.set(key, n + 1);
    slot.set(node.id, n);
    rows.set(laneOf(node), Math.max(rows.get(laneOf(node)) ?? 0, n + 1));
  }
  const top = new Map<number, number>();
  let y = 0;
  for (let lane = 0; lane <= laneIds.length; lane++) {
    if (!rows.has(lane)) continue;
    top.set(lane, y);
    y += rows.get(lane)! * CELL_H + 2 * LANE_PAD;
  }
  const nodes = diagram.nodes.map((node): DiagramNode => {
    const size = SIZE[node.kind];
    const lane = laneOf(node);
    const placed = {
      ...node,
      x: LANE_PAD + rank.get(node.id)! * CELL_W + (CELL_W - size.w) / 2,
      y: top.get(lane)! + LANE_PAD + slot.get(node.id)! * CELL_H + (CELL_H - size.h) / 2,
      w: size.w,
      h: size.h,
    };
    const manual = Object.hasOwn(positions, node.id) ? positions[node.id] : undefined;
    return manual ? { ...placed, x: manual.x, y: manual.y, w: manual.w ?? placed.w, h: manual.h ?? placed.h } : placed;
  });
  const right = Math.max(0, ...nodes.map((node) => node.x + node.w)) + LANE_PAD;
  const groups = diagram.groups.map((group, lane): DiagramGroup => {
    const members = nodes.filter((node) => laneOf(node) === lane);
    const from = Math.min(top.get(lane) ?? 0, ...members.map((node) => node.y - LANE_PAD));
    const to = Math.max((top.get(lane) ?? 0) + (rows.get(lane) ?? 0) * CELL_H + 2 * LANE_PAD, ...members.map((node) => node.y + node.h + LANE_PAD));
    return { ...group, x: 0, y: from, w: right, h: to - from };
  });
  return { ...diagram, nodes, groups };
}
