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

import { savedPositions, type LayoutFile } from "./diagram-layout.ts";
import { EXTERNAL } from "./external-ids.ts";
import type { AnalysisSnapshot } from "./snapshot.ts";
import { walkFlow, type Flow, type FlowItem, type SpecIR, type Trigger } from "./spec-ir.ts";
import { compareText } from "./span.ts";
import type { SystemSpec } from "./system.ts";
import type { SchemaRead } from "./schema-discover.ts";
import { discoverSystem, DISCOVERED } from "./system-discover.ts";

export type DiagramView =
  | { kind: "flow"; name: string }
  | { kind: "entry"; id: string; depth?: number }
  | { kind: "event"; name: string }
  | { kind: "layers" }
  | { kind: "process"; domain: string }
  /** A module's dependencies: what imports it, and what it imports (any ID: its module). */
  | { kind: "module"; id: string }
  /** A `# system` (system-design/03): components in zones and their relations; `@code` is the system discovered from the code. */
  | { kind: "system"; name: string }
  /** The tables of a system's data stores and their foreign keys. */
  | { kind: "er"; name: string }
  /** One sequence of a system: messages between components, top to bottom. */
  | { kind: "sequence"; name: string; seq: string };

export type DiagramVerdict = "ok" | "fail" | "unverified" | "planned" | null;

export interface DiagramNode {
  id: string;
  kind: "start" | "task" | "gateway" | "parallel" | "event" | "timer" | "external" | "hole" | "module" | "fn" | "layer" | "component" | "table" | "participant" | "anchor";
  /** A `component`: its kind in the system (`db`, `service`…), which decides its shape. */
  component?: string;
  /** A `component`: the technology as written. */
  tech?: string;
  /** A `table`: one line per column (`🔑 id bigint`). */
  lines?: string[];
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
  kind: "sequence" | "call" | "dependency" | "allow" | "deny" | "emits" | "continues" | "relation" | "message" | "lifeline" | "fk";
  label?: string;
  /** A `relation` or `message` that does not wait for an answer (`publishes`, `consumes`, `⇢`). */
  async?: boolean;
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
  /**
   * `down`: a stack, one shape per row from the top in the diagram's order (the layers view: the
   * declared layers, like an architecture drawing); else ranks as columns from the left.
   */
  direction?: "down";
  /** The shapes have their places already (ER, sequence): `layout` keeps them, only manual places win. */
  placed?: true;
  /** A system's view: its notes and what else there is to draw of it. */
  system?: SystemSummary;
}

/** What the page shows beside a system's diagram: the interview notes and the other views of the system. */
export interface SystemSummary {
  name: string;
  file: string | null;
  notes: { kind: string; text: string; line: number }[];
  sequences: string[];
  tables: number;
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
  /** Business processes of the discovered flows (`flows discover --names`): what `{kind: "process"}` draws. */
  processes?: readonly DiagramProcess[];
  /** The view's layout file (business-flows/24): its places win over the computed ones. */
  saved?: LayoutFile | null;
  /** The `# system` sections (system-design/03): what the system, ER and sequence views draw. */
  systems?: readonly SystemSpec[];
  /** The repository's schemas (system-design/07): the tables of the system of the code. */
  schemas?: SchemaRead;
}

/**
 * A business process as a model grouped it (business-flows/12): its domain
 * and its discovered flows, each with its trigger and the steps right under it.
 */
export interface DiagramProcess {
  name: string;
  domain: string;
  flows: { name: string; trigger: string; steps: string[] }[];
}

/** Positions that win over the automatic layout, by node id. */
export type Positions = Readonly<Record<string, { x: number; y: number; w?: number; h?: number }>>;

export const DEFAULT_DEPTH = 2;

export const MAX_DEPTH = 10;

/** An entry's call tree stops growing here; `reason` says it was cut. */
export const MAX_NODES = 400;

export const VIEW_KINDS = ["flow", "entry", "event", "layers", "process", "module", "system", "er", "sequence"] as const;

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
    case "module": {
      const id = need("id");

      return id === null ? "view=module needs id=" : { kind: "module", id };
    }

    case "process": {
      const domain = need("domain") ?? need("name");

      return domain === null ? "view=process needs domain=" : { kind: "process", domain };
    }

    case "system":
    case "er": {
      const name = need("name");

      return name === null ? `view=${view} needs name=` : { kind: view, name };
    }

    case "sequence": {
      const name = need("name");
      const seq = need("seq");

      return name === null || seq === null ? "view=sequence needs name= and seq=" : { kind: "sequence", name, seq };
    }

    default:
      return `unknown view: expected one of ${VIEW_KINDS.join(", ")}`;
  }
}

/**
 * The view a key of the page names (`flow:checkout`, `discovered:<name>`,
 * `entry:<id>`, `process:<domain>`, `layers`), as `diagramOf` takes it; a
 * discovered flow is drawn as a flow of the discovered view. Null for none.
 */
export function viewOfKey(key: string): { view: DiagramView; discovered: boolean } | null {
  if (key === "layers") return { view: { kind: "layers" }, discovered: false };
  const at = key.indexOf(":");

  if (at === -1) return null;
  const kind = key.slice(0, at);
  const rest = key.slice(at + 1);

  if (rest === "") return null;

  if (kind === "flow" || kind === "discovered") return { view: { kind: "flow", name: rest }, discovered: kind === "discovered" };

  if (kind === "entry") return { view: { kind: "entry", id: rest }, discovered: false };

  if (kind === "process") return { view: { kind: "process", domain: rest }, discovered: false };

  if (kind === "module") return { view: { kind: "module", id: rest }, discovered: false };

  if (kind === "system" || kind === "er") return { view: { kind, name: rest }, discovered: false };

  if (kind === "sequence") {
    const slash = rest.indexOf("/");

    return slash > 0 && slash < rest.length - 1 ? { view: { kind: "sequence", name: rest.slice(0, slash), seq: rest.slice(slash + 1) }, discovered: false } : null;
  }

  return null;
}

/** The views there are to draw, as the page lists them. */
export interface DiagramViews {
  flows: string[];
  entries: { id: string; kind: string; label: string }[];
  layers: string[];
  domains: string[];
  processes: { name: string; domain: string; flows: string[] }[];
  systems: SystemListing[];
}

/**
 * What there is to draw: flow names in spec order, entry points as the
 * snapshot lists them, layers in their order, the domains of the business
 * processes (first seen first) and the processes with their flows.
 */
export function viewsOf(
  snapshot: AnalysisSnapshot | null,
  spec: SpecIR,
  processes: readonly DiagramProcess[] = [],
  systems: readonly SystemSpec[] = [],
  schemas?: SchemaRead,
): DiagramViews {
  return {
    systems: systemListing(snapshot, systems, schemas),
    flows: [...new Set(spec.flows.map((flow) => flow.name))],
    entries: (snapshot?.entries ?? []).map((entry) => ({ id: entry.id, kind: entry.kind, label: entry.label })),
    layers: snapshot ? layerOrder(snapshot) : [],
    domains: [...new Set(processes.map((p) => p.domain))],
    processes: processes.map((p) => ({ name: p.name, domain: p.domain, flows: p.flows.map((flow) => flow.name) })),
  };
}

/** A flow as the diagram page lists it: where it is, its trigger and lane, and every ID it names (for the search). */
export interface FlowListing {
  name: string;
  file: string;
  line: number;
  trigger: string | null;
  layer: string | null;
  ids: string[];
}

/** The IDs a flow names — triggers, steps, `then <id>`, `calls` — in source order, each once. */
export function flowIds(flow: Flow): string[] {
  const ids = new Set<string>();
  walkFlow(flow, (item) => {
    if (item.kind === "trigger" || item.kind === "step" || (item.kind === "then" && item.form === "ref")) ids.add(item.target.target);
    else if (item.kind === "calls") for (const ref of item.targets) ids.add(ref.target);
  });

  return [...ids];
}

/** The flows of a spec for the list of the diagram page: the first flow of each name, in spec order. */
export function flowListing(snapshot: AnalysisSnapshot | null, spec: SpecIR): FlowListing[] {
  const seen = new Set<string>();
  const out: FlowListing[] = [];

  for (const flow of spec.flows) {
    if (seen.has(flow.name)) continue;
    seen.add(flow.name);
    const trigger = flow.triggers[0]?.target.target ?? null;
    out.push({ name: flow.name, file: flow.file, line: flow.span.start.line, trigger, layer: trigger === null ? null : (layerOf(snapshot, trigger) ?? null), ids: flowIds(flow) });
  }

  return out;
}

/** Where an ID is used: flows and discovered flows that name it (or an ID under it), and entry points whose route does. */
export interface Usages {
  id: string;
  flows: { name: string; file: string; line: number }[];
  discovered: { name: string; file: string; line: number }[];
  entries: { id: string; kind: string; label: string }[];
}

/** An ID or one under it: `a.b` matches `a.b` and `a.b.c`, not `a.bc`. */
function covers(id: string, target: string): boolean {
  return target === id || target.startsWith(`${id}.`);
}

/** The first line of a flow that names the ID, or null. */
function useIn(flow: Flow, id: string): number | null {
  let line: number | null = null;
  walkFlow(flow, (item) => {
    if (line !== null) return;
    const targets = item.kind === "trigger" || item.kind === "step" || (item.kind === "then" && item.form === "ref") ? [item.target.target] : item.kind === "calls" ? item.targets.map((ref) => ref.target) : [];

    if (targets.some((target) => covers(id, target))) line = item.span.start.line;
  });

  return line;
}

/**
 * Where `id` is used (business-flows/21): the flows of the specs and of the
 * discovered view that name it in a trigger, step, `then` or `calls`, and the
 * entry points that are it or whose flow (written or discovered, by trigger)
 * names it. Pure; each list in its source's order.
 */
export function usagesOf(snapshot: AnalysisSnapshot | null, spec: SpecIR, discovered: SpecIR | null, id: string): Usages {
  const routes = new Set<string>();

  const found = (flows: readonly Flow[]): { name: string; file: string; line: number }[] => {
    const out: { name: string; file: string; line: number }[] = [];

    for (const flow of flows) {
      const line = useIn(flow, id);

      if (line === null) continue;
      out.push({ name: flow.name, file: flow.file, line });

      for (const trigger of flow.triggers) routes.add(trigger.target.target);
    }

    return out;
  };

  const flows = found(spec.flows);
  const fromDiscovered = found(discovered?.flows ?? []);
  const entries = (snapshot?.entries ?? []).filter((entry) => covers(id, entry.id) || routes.has(entry.id)).map((entry) => ({ id: entry.id, kind: entry.kind, label: entry.label }));

  return { id, flows, discovered: fromDiscovered, entries };
}

export function diagramOf(input: DiagramInput): Diagram {
  const raw = unplaced(input);

  if (raw.placed) return input.saved ? { ...raw, nodes: raw.nodes.map((node) => {
    const manual = Object.hasOwn(input.saved!.shapes, node.id) ? input.saved!.shapes[node.id] : undefined;

    return manual ? { ...node, x: manual.x, y: manual.y, w: manual.w ?? node.w, h: manual.h ?? node.h } : node;
  }) } : raw;

  if (!input.saved) return layout(raw);
  // The layout file (business-flows/24): saved places of nodes, and of lanes, win.
  const placed = layout(raw, savedPositions(input.saved, raw));
  const lanes = input.saved.shapes;

  return { ...placed, groups: placed.groups.map((group) => {
    const box = Object.hasOwn(lanes, `lane:${group.id}`) ? lanes[`lane:${group.id}`]! : undefined;

    return box ? { ...group, x: box.x, y: box.y, w: box.w ?? group.w, h: box.h ?? group.h } : group;
  }) };
}

/** The diagram of a view before `layout` places it. */
function unplaced(input: DiagramInput): Diagram {
  const { view } = input;

  if (view.kind === "flow") return flowDiagram(input, view.name);

  if (view.kind === "system" || view.kind === "er" || view.kind === "sequence") {
    const system = systemNamed(input.snapshot, input.systems ?? [], view.name, input.schemas);

    if (system === null) return empty(view.name === CODE_SYSTEM ? "no snapshot: the system of the code needs the code" : `no system \`${view.name}\`: no \`# system ${view.name}\` in the specs`);

    if (view.kind === "system") return systemDiagram(system, input.results);

    if (view.kind === "er") {
      const er = erDiagram(system);
      // A schema file that did not parse is said where its tables would be.
      const problems = view.name === CODE_SYSTEM ? (input.schemas?.problems ?? []) : [];

      return problems.length === 0 ? er : { ...er, reason: `${er.reason ? `${er.reason}; ` : ""}not read: ${problems.join("; ")}` };
    }

    return sequenceDiagram(system, view.seq);
  }

  if (!input.snapshot) return empty("no snapshot: the specs were checked without code");

  if (view.kind === "event") return eventDiagram(input.snapshot, input.results, view.name);

  if (view.kind === "process") return processDiagram(input.snapshot, input.processes ?? [], input.results, view.domain);

  if (view.kind === "entry") return entryDiagram(input.snapshot, input.results, view.id, view.depth ?? DEFAULT_DEPTH);

  if (view.kind === "module") return moduleDiagram(input.snapshot, input.results, view.id);

  return layersDiagram(input.snapshot, input.spec, input.results);
}

function empty(reason: string): Diagram {
  return { nodes: [], edges: [], groups: [], reason };
}

/** The diagram with why it is empty or cut short, when there is a reason. */
function withReason(diagram: Diagram, reason: string | null): Diagram {
  if (reason !== null) diagram.reason = reason;

  return diagram;
}

type Box = Pick<DiagramNode, "x" | "y" | "w" | "h">;

/** A shape in its lane when it has one, `group` written before the box as every view writes it; at the origin unless placed. */
function shapeOf(shape: Omit<DiagramNode, keyof Box>, group: string | null | undefined, box: Box = { x: 0, y: 0, w: 0, h: 0 }): DiagramNode {
  const node = { ...shape };

  if (group) node.group = group;

  return { ...node, ...box };
}

/** The code a shape stands for: its ID, and the file and line when the snapshot knows them. */
function codeRef(id: string, code: { file: string | null; line: number | null } | undefined): NonNullable<DiagramNode["ref"]> {
  const ref: NonNullable<DiagramNode["ref"]> = { id };

  if (code?.file) ref.file = code.file;

  if (code?.line) ref.line = code.line;

  return ref;
}

// ── verdicts ────────────────────────────────────────────────────────────────

type RankedVerdict = "fail" | "unverified" | "ok";

const RANK = { fail: 3, unverified: 2, ok: 1 } satisfies Record<RankedVerdict, number>;

/** A verdict `check` ranks; any other text (`""`, an unknown word) counts for nothing. */
function isRanked(value: string): value is RankedVerdict {
  return Object.hasOwn(RANK, value);
}

function worst(values: readonly string[]): DiagramVerdict {
  let best: RankedVerdict | null = null;

  for (const value of values) if (isRanked(value) && (best === null || RANK[value] > RANK[best])) best = value;

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
    if (!result.area || !isRanked(result.verdict)) continue;
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

  return [...order, ...rest].flatMap((id): DiagramGroup[] => (used.has(id) ? [{ id, label: id, kind: "lane", x: 0, y: 0, w: 0, h: 0 }] : []));
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

  const add = (node: Omit<DiagramNode, keyof Box>, group?: string): DiagramNode => {
    const placed = shapeOf(node, group);
    nodes.push(placed);

    return placed;
  };

  const link = (from: string | null, to: string, kind: DiagramEdge["kind"], label?: string, verdict?: DiagramVerdict): void => {
    if (from === null) return;
    const edge: DiagramEdge = { from, to, kind };

    if (label !== undefined) edge.label = label;

    if (verdict !== undefined) edge.verdict = verdict;
    edges.push(edge);
  };

  const refOf = (id: string, line: number): NonNullable<DiagramNode["ref"]> => {
    const ref = codeRef(id, snapshot?.nodes[id]);
    ref.specFile = flow.file;
    ref.specLine = line;

    return ref;
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
      link(into, hole.id, "sequence", label);
      into = hole.id;
      label = undefined;
    }

    const node = add({ id: `${item.kind}:${line}`, kind, label: id, ref: refOf(id, line), verdict }, group);
    link(into, node.id, "sequence", label, routeVerdict ?? undefined);

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
        const gateway = add({ id: `when:${line}`, kind: "gateway", label: item.condition, ref: { specFile: flow.file, specLine: line }, verdict: worst(resultsAt(item).map((r) => r.verdict)) }, group);
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
        const task = add({ id: `then:${line}`, kind: "task", label: item.prose, ref: { specFile: flow.file, specLine: line }, verdict: worst(resultsAt(item).map((r) => r.verdict)) }, group);
        link(from, task.id, "sequence");

        return block(item.children, task.id, group);
      }

      case "emits": {
        const line = at(item);
        const name = item.body.replace(/^event\s+/, "").trim();
        // An event ID (ADR 0023 п. 1) points at the event node of the snapshot; prose names only the spec line.
        const ref = item.target !== null ? refOf(item.target.target, line) : { specFile: flow.file, specLine: line };
        const event = add({ id: `emits:${line}`, kind: "event", label: name, ref, verdict: worst(resultsAt(item).map((r) => r.verdict)) });
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
          const node = add({ id: `calls:${line}:${i}`, kind: isExternal(id) ? "external" : "task", label: id, ref: refOf(id, line), verdict }, g);
          link(from, node.id, "call", undefined, verdict ?? undefined);
        });

        return from;
      }

      case "parallel": {
        // A parallel gateway splits into one branch per step and joins them: the next item follows the join (ADR 0023).
        const line = at(item);
        const ref = { specFile: flow.file, specLine: line };
        const split = add({ id: `parallel:${line}`, kind: "parallel", label: "parallel", ref, verdict: null }, group);
        link(from, split.id, "sequence");
        const join = add({ id: `parallel:${line}:join`, kind: "parallel", label: "parallel", ref, verdict: null }, group);

        for (const child of item.children) link(one(child, split.id, group), join.id, "sequence");

        return join.id;
      }

      case "after":
      case "every": {
        // An intermediate timer event beside the sequence, as `calls` sits beside it.
        const line = at(item);
        const timer = add({ id: `${item.kind}:${line}`, kind: "timer", label: `${item.kind} ${item.value}`, ref: { specFile: flow.file, specLine: line }, verdict: worst(resultsAt(item).map((r) => r.verdict)) }, group);
        link(from, timer.id, "sequence");

        return from;
      }

      // Claims without a shape of their own: invariants, reads, tests, open questions and `continues`.
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

/** The event node a view names: its ID, `events.<literal>`, or the literal it is dispatched with. */
export function eventNamed(snapshot: AnalysisSnapshot, name: string): string | null {
  if (snapshot.nodes[name]?.kind === "event") return name;

  if (snapshot.nodes[`events.${name}`]?.kind === "event") return `events.${name}`;

  return Object.keys(snapshot.nodes).find((id) => snapshot.nodes[id]?.kind === "event" && snapshot.nodes[id]?.name === name) ?? null;
}

/**
 * An event (ADR 0022 п. 6, business-flows/08): the fns that dispatch it, the
 * event, and the fns its observers run, each in the lane of its layer. A
 * dispatch is an `emits` edge, an observer a `call` named after it.
 */
function eventDiagram(snapshot: AnalysisSnapshot, results: readonly DiagramResult[], name: string): Diagram {
  const id = eventNamed(snapshot, name);

  if (id === null) return empty(`no event \`${name}\` in the snapshot: events come from a framework adapter's dispatches and observers`);
  const event = snapshot.nodes[id]!;
  const areas = byArea(results);
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];

  const fn = (target: string): string => {
    const nodeId = `fn:${target}`;

    if (nodes.some((n) => n.id === nodeId)) return nodeId;
    const code = snapshot.nodes[target];
    nodes.push(shapeOf({ id: nodeId, kind: code?.layer === EXTERNAL ? "external" : "fn", label: target, ref: codeRef(target, code), verdict: areas.get(target) ?? null }, code?.layer));

    return nodeId;
  };

  const center: DiagramNode = { id: `event:${id}`, kind: "event", label: event.name ?? id.slice(id.indexOf(".") + 1), ref: codeRef(id, event), verdict: areas.get(id) ?? null, group: event.layer, x: 0, y: 0, w: 0, h: 0 };

  for (const publisher of event.callers ?? []) edges.push({ from: fn(publisher), to: center.id, kind: "emits", label: "dispatch" });
  nodes.push(center);

  for (const edge of snapshot.edges) {
    if (edge.kind !== "call" || edge.source !== id || edge.resolution !== "resolved" || edge.target === null) continue;
    const observer = /observer `([^`]*)`/.exec(edge.binding ?? "")?.[1];
    edges.push({ from: center.id, to: fn(edge.target), kind: "call", label: `${observer ? `observer ${observer}` : (edge.via ?? "call")}${edge.scope && edge.scope !== "global" ? ` (${edge.scope})` : ""}` });
  }

  return withReason({ nodes, edges, groups: lanes(snapshot, nodes) }, edges.length === 0 ? `\`${id}\` has neither a dispatch nor an observer keylang read` : null);
}

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
  /** The unresolved calls of each opened fn, by the shape of the fn: drawn as one hole per fn. */
  const holes = new Map<string, { reasons: Map<string, string>; file: string | null; line: number }>();

  const place = (target: string): string => {
    const known = shown.get(target);

    if (known) return known;
    const code = snapshot.nodes[target];
    const layer = code?.layer;
    const nodeId = `fn:${target}`;
    nodes.push(
      shapeOf(
        {
          id: nodeId,
          kind: layer === EXTERNAL ? "external" : code?.kind === "module" ? "module" : code?.kind === "event" ? "event" : "fn",
          label: target,
          ref: codeRef(target, code),
          verdict: areas.get(target) ?? null,
        },
        layer,
      ),
    );
    shown.set(target, nodeId);

    return nodeId;
  };

  // Where the entry starts: the fn's own place, else the place the entry point names.
  const startRef: NonNullable<DiagramNode["ref"]> = { id };
  const startFile = root?.file ? root.file : entry?.file;
  const startLine = root?.line ? root.line : entry?.line;

  if (startFile !== undefined) startRef.file = startFile;

  if (startLine !== undefined) startRef.line = startLine;
  const start = shapeOf({ id: `entry:${id}`, kind: "start", label: entry?.label ?? id, ref: startRef, verdict: areas.get(id) ?? null }, root?.layer);

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
        const at = `${edge.file}:${edge.line}:${edge.col}`;
        const own = holes.get(from) ?? { reasons: new Map<string, string>(), file: edge.file, line: edge.line };
        own.reasons.set(at, `${reason} at ${at}`);
        holes.set(from, own);
      }
    }

    frontier = next;
  }

  // One hole per fn, in its lane: the places it calls through and keylang cannot follow, counted (`? 3`).
  for (const [from, own] of holes) {
    const caller = nodes.find((node) => node.id === from)!;
    const count = own.reasons.size;
    const holeRef: NonNullable<DiagramNode["ref"]> = {};

    if (own.file) holeRef.file = own.file;
    holeRef.line = own.line;
    const hole = shapeOf({ id: `hole:${caller.ref?.id ?? from}`, kind: "hole", label: count > 1 ? `? ${count}` : "?", reason: [...own.reasons.values()].join("\n"), ref: holeRef, verdict: "unverified" }, caller.group);
    nodes.push(hole);
    edges.push({ from, to: hole.id, kind: "call", verdict: "unverified" });
  }

  return withReason({ nodes, edges, groups: lanes(snapshot, nodes) }, cut ? `cut at ${MAX_NODES} nodes` : null);
}

// ── process ─────────────────────────────────────────────────────────────────

/**
 * The processes of a domain (or the one process of that name): lanes per
 * layer, one start per flow of each process (its trigger), and the steps
 * right under it as tasks. A step two flows share is drawn once.
 */
function processDiagram(snapshot: AnalysisSnapshot, processes: readonly DiagramProcess[], results: readonly DiagramResult[], domain: string): Diagram {
  if (processes.length === 0) return empty("no business processes yet: `keylang flows discover --names` groups the discovered flows into processes");
  const chosen = processes.filter((p) => p.domain === domain);
  const shown = chosen.length > 0 ? chosen : processes.filter((p) => p.name === domain);

  if (shown.length === 0) return empty(`no process in domain \`${domain}\`; domains: ${[...new Set(processes.map((p) => p.domain))].join(", ")}`);
  const areas = byArea(results);
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const placed = new Set<string>();

  const shape = (id: string, kind: DiagramNode["kind"], label: string, code: string): void => {
    placed.add(id);
    const layer = layerOf(snapshot, code);
    nodes.push(shapeOf({ id, kind, label, ref: codeRef(code, snapshot.nodes[code]), verdict: areas.get(code) ?? null }, layer));
  };

  for (const process of shown) {
    for (const flow of process.flows) {
      const start = `start:${flow.name}`;

      if (placed.has(start)) continue;
      shape(start, "start", flow.name, flow.trigger);

      for (const step of flow.steps) {
        const id = `fn:${step}`;

        if (!placed.has(id)) shape(id, snapshot.nodes[step]?.layer === EXTERNAL ? "external" : "task", step, step);
        edges.push({ from: start, to: id, kind: "call", label: process.name });
      }
    }
  }

  return { nodes, edges, groups: lanes(snapshot, nodes) };
}

// ── module ──────────────────────────────────────────────────────────────────

/** The module an ID lies in: itself, or the nearest module above it (`a.b.f` → `a.b`); null when none. */
export function moduleOfId(snapshot: AnalysisSnapshot, id: string): string | null {
  for (let at = id; at !== ""; at = at.includes(".") ? at.slice(0, at.lastIndexOf(".")) : "") {
    const node = snapshot.nodes[at];

    if (node?.kind === "module" && node.class !== true) return at;
  }

  return null;
}

/**
 * A module's dependencies, one step each way (the map as a graph): the
 * modules that import it on the left, the module, what it imports on the
 * right — repository modules in the lanes of their layers, packages as
 * `external`; an edge counts the imports. Any ID opens the module it lies in.
 */
function moduleDiagram(snapshot: AnalysisSnapshot, results: readonly DiagramResult[], id: string): Diagram {
  const root = moduleOfId(snapshot, id);

  if (root === null) return empty(`no module \`${id}\` (nor one above it) in the snapshot`);
  const areas = byArea(results);
  const counts = new Map<string, number>();

  for (const edge of snapshot.edges) {
    if ((edge.kind !== "import" && edge.kind !== "reexport") || edge.resolution !== "resolved" || !edge.target) continue;
    const from = moduleOfId(snapshot, edge.source) ?? edge.source;
    const to = edge.target.startsWith(`${EXTERNAL}.`) ? edge.target : (moduleOfId(snapshot, edge.target) ?? edge.target);

    if (from === to || (from !== root && to !== root)) continue;
    counts.set(`${from}\u0000${to}`, (counts.get(`${from}\u0000${to}`) ?? 0) + 1);
  }

  const nodes: DiagramNode[] = [];
  const shown = new Set<string>();

  const add = (moduleId: string): void => {
    if (shown.has(moduleId) || nodes.length >= MAX_NODES) return;
    shown.add(moduleId);
    const code = snapshot.nodes[moduleId];
    const layer = code?.layer ?? (moduleId.startsWith(`${EXTERNAL}.`) ? EXTERNAL : undefined);
    nodes.push(shapeOf({ id: `mod:${moduleId}`, kind: layer === EXTERNAL ? "external" : "module", label: moduleId, ref: codeRef(moduleId, code), verdict: areas.get(moduleId) ?? null }, layer));
  };

  add(root);
  const edges: DiagramEdge[] = [];
  const pairs = [...counts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  for (const [key, count] of pairs) {
    // SAFETY: every key is `${from}\u0000${to}` and module IDs hold no NUL, so the split has exactly two parts.
    const [from, to] = key.split("\u0000") as [string, string];
    add(from);
    add(to);

    if (shown.has(from) && shown.has(to)) edges.push({ from: `mod:${from}`, to: `mod:${to}`, kind: "dependency", label: String(count) });
  }

  return withReason({ nodes, edges, groups: lanes(snapshot, nodes) }, nodes.length >= MAX_NODES ? `cut at ${MAX_NODES} nodes` : null);
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

  // SAFETY: every key is `${from}\u0000${to}` and layer names hold no NUL, so each split has exactly two parts.
  const pairs = [...counts.keys()].map((key) => key.split("\u0000") as [string, string]);
  pairs.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]) || order.indexOf(a[1]) - order.indexOf(b[1]));

  for (const [from, to] of pairs) edges.push({ from: `layer:${from}`, to: `layer:${to}`, kind: "dependency", label: String(counts.get(`${from}\u0000${to}`)) });
  // One edge per pair and effect: twenty `allow app external.<package>` are one allow of app to external.
  const rules = new Map<string, DiagramEdge & { count: number }>();

  for (const rule of spec.rules) {
    if (rule.kind !== "dependency") continue;
    const from = layerOf(snapshot, rule.from.target);
    const found = results.filter((r) => r.criterion === rule.text || (r.file === rule.file && r.line === rule.span.start.line));
    // A rule `check` says nothing against holds.
    const verdict: DiagramVerdict = worst(found.map((r) => r.verdict)) ?? "ok";

    for (const ref of rule.to) {
      const to = layerOf(snapshot, ref.target);

      if (!from || !to || !order.includes(from) || !order.includes(to)) continue;
      const key = `${from}\u0000${to}\u0000${rule.effect}`;
      const known = rules.get(key);

      if (!known) {
        const edge = { from: `layer:${from}`, to: `layer:${to}`, kind: rule.effect, label: rule.text, verdict, count: 1 };
        rules.set(key, edge);
        edges.push(edge);
      } else {
        known.count++;
        known.verdict = worst([known.verdict ?? "ok", verdict]) ?? "ok";
        known.label = `${rule.effect} ${from} → ${to} (${known.count} rules)`;
      }
    }
  }

  return { nodes, edges: edges.map((edge) => ("count" in edge ? (({ count: _count, ...rest }) => rest)(edge) : edge)), groups: [], direction: "down" };
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
  component: { w: 150, h: 70 },
  table: { w: 220, h: 60 },
  participant: { w: 140, h: 44 },
  anchor: { w: 2, h: 2 },
};

/** One cell of the grid: the largest shape and the gaps around it. */
const CELL_W = 200;

const CELL_H = 90;

const LANE_PAD = 20;

/** At most this many shapes one above another in a lane's rank; more wrap into the next column. */
const MAX_ROWS = 8;

/** Edges that order shapes left to right; `allow` and `deny` only annotate. */
const ORDERING: ReadonlySet<DiagramEdge["kind"]> = new Set(["sequence", "call", "dependency", "emits", "continues", "relation"]);

/**
 * Places the shapes: the rank of a node is its longest path from a node
 * without predecessors (back edges of a cycle ignored), its column block;
 * within a lane and a rank, nodes go by spec line, then next to their
 * predecessors (their mean place), then by their order in the diagram; more
 * than `MAX_ROWS` of them wrap into further columns of the block. Lanes are
 * horizontal bands as tall as their fullest rank.
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
  // Within a lane and a rank: spec-line order (a flow reads as its spec), then — for shapes of code —
  // next to what leads into them (the mean place of their predecessors, rank by rank), then diagram order.
  const preds = new Map<string, string[]>();

  for (const [from, list] of out) for (const to of list) if (forward.has(`${from}\u0000${to}`)) preds.set(to, [...(preds.get(to) ?? []), from]);
  const ordinal = new Map<string, number>();
  const byRank = new Map<number, DiagramNode[]>();

  for (const node of diagram.nodes) byRank.set(rank.get(node.id)!, [...(byRank.get(rank.get(node.id)!) ?? []), node]);
  const slot = new Map<string, number>();
  const count = new Map<string, number>();

  for (const r of [...byRank.keys()].sort((a, b) => a - b)) {
    const pull = (node: DiagramNode): number => {
      const known = (preds.get(node.id) ?? []).map((id) => ordinal.get(id)).filter((value): value is number => value !== undefined);

      return known.length === 0 ? Infinity : known.reduce((sum, value) => sum + value, 0) / known.length;
    };

    const keys = new Map(byRank.get(r)!.map((node) => [node.id, pull(node)]));
    const sorted = [...byRank.get(r)!].sort((a, b) => laneOf(a) - laneOf(b) || (a.ref?.specLine ?? Infinity) - (b.ref?.specLine ?? Infinity) || keys.get(a.id)! - keys.get(b.id)! || index.get(a.id)! - index.get(b.id)!);

    for (const node of sorted) {
      const key = `${laneOf(node)}:${r}`;
      const n = count.get(key) ?? 0;
      count.set(key, n + 1);
      slot.set(node.id, n);
      ordinal.set(node.id, laneOf(node) * 100000 + n);
    }
  }

  // A lane's rank with many shapes wraps into columns of at most MAX_ROWS (filled top to bottom, then
  // the next column): a fn calling thirty others is a block, not a column taller than the screen.
  const columns = new Map<number, number>();

  const rowsOf = (key: string): number => {
    const n = count.get(key) ?? 0;

    return Math.ceil(n / Math.ceil(n / MAX_ROWS));
  };

  for (const [key, n] of count) {
    const r = Number(key.split(":")[1]);
    columns.set(r, Math.max(columns.get(r) ?? 1, Math.ceil(n / MAX_ROWS)));
  }

  const left = new Map<number, number>();
  let x = LANE_PAD;

  for (let r = 0; r <= Math.max(0, ...columns.keys()); r++) {
    left.set(r, x);
    x += (columns.get(r) ?? 1) * CELL_W;
  }

  const rows = new Map<number, number>();

  for (const key of count.keys()) {
    const lane = Number(key.split(":")[0]);
    rows.set(lane, Math.max(rows.get(lane) ?? 0, rowsOf(key)));
  }

  const top = new Map<number, number>();
  let y = 0;
  // A system's components outside every zone (a client, a CDN) stand above the zones; elsewhere shapes without a lane go last.
  const laneSeq = laneIds.map((_, i) => i);

  if (diagram.system) laneSeq.unshift(laneIds.length);
  else laneSeq.push(laneIds.length);

  for (const lane of laneSeq) {
    if (!rows.has(lane)) continue;
    top.set(lane, y);
    y += rows.get(lane)! * CELL_H + 2 * LANE_PAD;
  }

  const nodes = diagram.nodes.map((node): DiagramNode => {
    const size = SIZE[node.kind];
    const lane = laneOf(node);
    const r = rank.get(node.id)!;
    const height = rowsOf(`${lane}:${r}`);
    const n = slot.get(node.id)!;

    // A stack: one row per shape, in the diagram's order; the canvas draws its edges as arcs beside it.
    const placed =
      diagram.direction === "down"
        ? { ...node, x: LANE_PAD + (CELL_W - size.w) / 2, y: LANE_PAD + index.get(node.id)! * CELL_H + (CELL_H - size.h) / 2, w: size.w, h: size.h }
        : {
            ...node,
            x: left.get(r)! + Math.floor(n / height) * CELL_W + (CELL_W - size.w) / 2,
            y: top.get(lane)! + LANE_PAD + (n % height) * CELL_H + (CELL_H - size.h) / 2,
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

// ── system (system-design/03–05) ────────────────────────────────────────────

/** The name of the system discovered from the code (system-design/06): not a section name (no `@` in a segment). */
export const CODE_SYSTEM = DISCOVERED;

/** A system as the page lists it: its name, file, sequences and whether it has tables. */
export interface SystemListing {
  name: string;
  file: string | null;
  line: number | null;
  sequences: string[];
  tables: number;
  components: number;
}

function tableCount(system: SystemSpec): number {
  return system.components.reduce((sum, component) => sum + component.tables.length, 0);
}

/** The systems of the specs in spec order, then the one of the code when there is a snapshot. */
export function systemListing(snapshot: AnalysisSnapshot | null, systems: readonly SystemSpec[], schemas?: SchemaRead): SystemListing[] {
  const out: SystemListing[] = systems.map((system) => ({ name: system.name, file: system.file, line: system.line, sequences: system.sequences.map((seq) => seq.name), tables: tableCount(system), components: system.components.length }));

  if (snapshot) {
    const code = discoverSystem(snapshot, schemas?.schemas);
    out.push({ name: CODE_SYSTEM, file: null, line: null, sequences: code.sequences.map((seq) => seq.name), tables: tableCount(code), components: code.components.length });
  }

  return out;
}

/** The system a view names: a `# system` of the specs, or the one discovered from the code. */
function systemNamed(snapshot: AnalysisSnapshot | null, systems: readonly SystemSpec[], name: string, schemas?: SchemaRead): SystemSpec | null {
  if (name === CODE_SYSTEM) return snapshot ? discoverSystem(snapshot, schemas?.schemas) : null;

  return systems.find((system) => system.name === name) ?? null;
}

function summaryOf(system: SystemSpec): SystemSummary {
  return { name: system.name, file: system.name === CODE_SYSTEM ? null : system.file, notes: system.notes.map((note) => ({ ...note })), sequences: system.sequences.map((seq) => seq.name), tables: tableCount(system) };
}

/** Verbs whose sender does not wait for an answer. */
const ASYNC_VERBS = new Set(["publishes", "consumes", "replicates"]);

/**
 * A system: one shape per component in the lane of its zone (the zone's
 * path, `outer / inner`, as the lane's name), an edge per relation with its
 * verb and caption, coloured by the `system` verdict of that relation; a
 * component takes the worst verdict of its relations.
 */
function systemDiagram(system: SystemSpec, results: readonly DiagramResult[]): Diagram {
  const criterion = `system ${system.name}`;
  const verdictOf = new Map<string, DiagramVerdict>();

  for (const result of results) if (result.criterion === criterion && result.area !== undefined) verdictOf.set(result.area, worst([verdictOf.get(result.area) ?? "", result.verdict]));
  const zones = new Map(system.zones.map((zone) => [zone.name, zone]));

  const zonePath = (name: string | null): string | undefined => {
    const parts: string[] = [];

    for (let at = name; at !== null; at = zones.get(at)?.parent ?? null) parts.unshift(at);

    return parts.length === 0 ? undefined : parts.join(" / ");
  };

  const byComponent = new Map<string, DiagramVerdict[]>();

  const edges: DiagramEdge[] = system.relations.map((relation) => {
    const verdict = verdictOf.get(`${relation.from} ${relation.verb} ${relation.to}`) ?? null;

    if (verdict) byComponent.set(relation.from, [...(byComponent.get(relation.from) ?? []), verdict]);

    const edge: DiagramEdge = { from: `component:${relation.from}`, to: `component:${relation.to}`, kind: "relation", label: relation.caption ? `${relation.verb}: ${relation.caption}` : relation.verb };

    if (ASYNC_VERBS.has(relation.verb)) edge.async = true;

    if (verdict) edge.verdict = verdict;

    return edge;
  });

  const nodes: DiagramNode[] = system.components.map((component) => {
    // `tech` sits between the kind and the label, as the view always wrote a component.
    const head: Pick<DiagramNode, "id" | "kind" | "component" | "tech"> = { id: `component:${component.name}`, kind: "component", component: component.kind };

    if (component.tech) head.tech = component.tech;
    const ref: NonNullable<DiagramNode["ref"]> = {};

    if (component.code[0]) ref.id = component.code[0];

    // The code system is read from the code, not from a spec line.
    if (system.name !== CODE_SYSTEM) {
      ref.specFile = system.file;
      ref.specLine = component.line;
    }

    const verdict = worst((byComponent.get(component.name) ?? []).filter((v): v is NonNullable<DiagramVerdict> => v !== null));

    return shapeOf({ ...head, label: component.name, ref, verdict }, zonePath(component.zone));
  });

  const groupIds = [...new Set(nodes.flatMap((node) => (node.group === undefined ? [] : [node.group])))];
  const groups: DiagramGroup[] = groupIds.map((id) => ({ id, label: id, kind: "lane", x: 0, y: 0, w: 0, h: 0 }));

  return withReason({ nodes, edges, groups, system: summaryOf(system) }, nodes.length === 0 ? `system \`${system.name}\` has no components` : null);
}

const TABLE_W = 230;

const TABLE_HEAD = 30;

const TABLE_ROW = 18;

const TABLE_GAP = 50;

const TABLES_PER_ROW = 4;

/** A column as one line of its table: `🔑` for the key, `→ users.id` for a foreign key. */
function columnLine(column: SystemSpec["components"][number]["tables"][number]["columns"][number]): string {
  const marks = [column.pk ? "🔑" : "", column.unique && !column.pk ? "◆" : ""].join("");
  const tail = [column.nullable ? "null" : "", column.fk ? `→ ${column.fk.table}.${column.fk.column}` : ""].filter((part) => part !== "").join(" ");

  return `${marks ? `${marks} ` : ""}${column.name}: ${column.type}${tail ? ` ${tail}` : ""}`;
}

/**
 * The ER view: a table is a shape with a line per column, in a lane per data
 * store, at most four tables in a row; a foreign key is an edge to the
 * referenced table, `N:1` (`1:1` when the column is `unique` or the key).
 * Placed here, not by `layout`: a table is as tall as its columns.
 */
function erDiagram(system: SystemSpec): Diagram {
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const groups: DiagramGroup[] = [];
  const tableId = new Map<string, string>();
  let y = 0;

  for (const component of system.components) {
    if (component.tables.length === 0) continue;
    const laneTop = y;
    y += TABLE_HEAD + 10;

    for (let row = 0; row < component.tables.length; row += TABLES_PER_ROW) {
      const tables = component.tables.slice(row, row + TABLES_PER_ROW);
      let tallest = 0;
      tables.forEach((table, i) => {
        const id = `table:${component.name}.${table.name}`;

        if (!tableId.has(table.name)) tableId.set(table.name, id);
        const lines = table.columns.map(columnLine);
        const h = TABLE_HEAD + Math.max(1, lines.length) * TABLE_ROW + 8;
        tallest = Math.max(tallest, h);
        const shape: Omit<DiagramNode, keyof Box> = { id, kind: "table", label: table.name, lines };

        if (system.name !== CODE_SYSTEM) shape.ref = { specFile: system.file, specLine: table.line };
        nodes.push(shapeOf(shape, component.name, { x: 20 + i * (TABLE_W + TABLE_GAP), y, w: TABLE_W, h }));
      });
      y += tallest + TABLE_GAP;
    }

    const label = `${component.name}${component.tech ? ` (${component.tech})` : ""}`;
    groups.push({ id: component.name, label, kind: "lane", x: 0, y: laneTop, w: 0, h: y - laneTop - TABLE_GAP / 2 });
  }

  const right = Math.max(0, ...nodes.map((node) => node.x + node.w)) + 20;

  for (const group of groups) group.w = right;

  for (const component of system.components) {
    for (const table of component.tables) {
      for (const column of table.columns) {
        if (column.fk === null) continue;
        const to = tableId.get(column.fk.table);

        if (!to) continue;
        edges.push({ from: `table:${component.name}.${table.name}`, to, kind: "fk", label: `${column.name} ${column.unique || column.pk ? "1:1" : "N:1"}` });
      }
    }
  }

  return withReason({ nodes, edges, groups, placed: true, system: summaryOf(system) }, nodes.length === 0 ? `system \`${system.name}\` has no tables: add \`- table <name>\` under a data store` : null);
}

const LIFELINE_GAP = 190;

const MESSAGE_GAP = 46;

const PARTICIPANT_W = 140;

const PARTICIPANT_H = 44;

/**
 * A sequence: the participants in a row in the order they first appear, a
 * lifeline down from each, and each message an arrow between two lifelines
 * at its own height, numbered in order; an asynchronous one is dashed. A
 * message to itself steps down its own lifeline. Placed here.
 */
function sequenceDiagram(system: SystemSpec, name: string): Diagram {
  const sequence = system.sequences.find((seq) => seq.name === name);

  if (!sequence) return { ...empty(`no sequence \`${name}\` in system \`${system.name}\``), system: summaryOf(system) };
  const order: string[] = [];

  for (const message of sequence.messages) for (const who of [message.from, message.to]) if (!order.includes(who)) order.push(who);
  const kinds = new Map(system.components.map((component) => [component.name, component]));
  const center = (who: string): number => 20 + order.indexOf(who) * LIFELINE_GAP + PARTICIPANT_W / 2;

  const nodes: DiagramNode[] = order.map((who) => {
    const component = kinds.get(who);

    const shape: Omit<DiagramNode, keyof Box> = { id: `participant:${who}`, kind: "participant", label: who };

    if (component) shape.component = component.kind;

    if (component?.tech) shape.tech = component.tech;

    return shapeOf(shape, undefined, { x: center(who) - PARTICIPANT_W / 2, y: 0, w: PARTICIPANT_W, h: PARTICIPANT_H });
  });

  const edges: DiagramEdge[] = [];
  const top = PARTICIPANT_H + 30;
  sequence.messages.forEach((message, i) => {
    const y = top + i * MESSAGE_GAP;
    const from = `anchor:${i}:from`;
    const to = `anchor:${i}:to`;
    const self = message.from === message.to;
    nodes.push({ id: from, kind: "anchor", label: "", x: center(message.from) - 1, y, w: 2, h: 2 });
    nodes.push({ id: to, kind: "anchor", label: "", x: center(message.to) - 1 + (self ? 0 : 0), y: y + (self ? MESSAGE_GAP / 2 : 0), w: 2, h: 2 });
    const edge: DiagramEdge = { from, to, kind: "message", label: `${i + 1}. ${message.text ?? ""}`.trim() };

    if (message.async) edge.async = true;
    edges.push(edge);
  });
  const bottom = top + sequence.messages.length * MESSAGE_GAP;

  for (const who of order) {
    nodes.push({ id: `anchor:end:${who}`, kind: "anchor", label: "", x: center(who) - 1, y: bottom, w: 2, h: 2 });
    edges.unshift({ from: `participant:${who}`, to: `anchor:end:${who}`, kind: "lifeline" });
  }

  return withReason({ nodes, edges, groups: [], placed: true, system: summaryOf(system) }, sequence.messages.length === 0 ? `sequence \`${name}\` has no messages` : null);
}
