// The zoom screen (.scratch/c4-zoom/issues/07): the map one level at a time,
// from the repository down to the members of a module, as C4 zooms from the
// system to the code. A level is a focus, its children, and the nodes outside
// it that the focus has edges with, as far as `depth` edges away. Pure: the
// keys in `app.ts` move through it and `view.ts` draws it.

import type { Analysis } from "../analyze.ts";
import { SYSTEM_ID } from "../explanations.ts";
import { EXTERNAL } from "../graph.ts";
import { leavesUnresolved, type AnalysisSnapshot } from "../snapshot.ts";
import { walkFlow, type FlowItem, type Trigger } from "../spec-ir.ts";
import { compareText } from "../span.ts";
import { worse, type Mark } from "./evidence.ts";
import { codeTree } from "./nav.ts";

/** The level above every layer: the repository itself (a view node, ADR 0014). */
export const ZOOM_ROOT = SYSTEM_ID;

/** Farthest neighbors a level shows: `>` stops here. */
export const MAX_DEPTH = 3;

export interface ZoomRow {
  id: string;
  kind: "layer" | "module" | "class" | "package" | "fn" | "type" | "more";
  /** A child by its name under the focus; a neighbor by its whole ID. */
  label: string;
  /** 0 for a child of the focus; n for a neighbor n edges away from it. */
  distance: number;
  /** Has a level of its own, so `+` and Enter zoom into it; a fn or type opens its code. */
  container: boolean;
  /** Edges of the snapshot with exactly one end inside the node. */
  edges: number;
  /** The worst verdict about the node or anything inside it, as the gutter marks a line. */
  mark: Mark | null;
  /** A `more` row: neighbors one edge past the depth, left out. */
  more?: number;
}

export interface ZoomLevel {
  focus: string;
  /** From the repository down to the focus. */
  crumbs: { id: string; label: string }[];
  /** The children, then the neighbors by distance, then a `more` row when some are left out. */
  rows: ZoomRow[];
}

interface ZoomIndex {
  /** Layers at the top: the repository's own in the map's order, then packages and files outside the architecture. */
  layers: readonly string[];
  children: ReadonlyMap<string, readonly string[]>;
  parent: ReadonlyMap<string, string>;
  /** Edges with exactly one end inside a node, by node. */
  degree: ReadonlyMap<string, number>;
  /** The worst verdict about each node and what is inside it. */
  marks: ReadonlyMap<string, Mark>;
}

const indexes = new WeakMap<Analysis, ZoomIndex>();

function indexOf(analysis: Analysis): ZoomIndex {
  const cached = indexes.get(analysis);
  if (cached) return cached;
  const snapshot = analysis.snapshot;
  const tree = codeTree(analysis);
  const nodes = snapshot?.nodes ?? {};
  const own = new Set(tree.layers);
  const others = Object.keys(nodes)
    .filter((id) => nodes[id]?.kind === "layer" && !own.has(id))
    .sort((a, b) => Number(a === EXTERNAL) - Number(b === EXTERNAL) || compareText(a, b));
  const layers = [...tree.layers, ...others];
  const parent = new Map<string, string>();
  for (const layer of layers) parent.set(layer, ZOOM_ROOT);
  for (const [id, kids] of tree.children) for (const kid of kids) parent.set(kid, id);
  const index: ZoomIndex = { layers, children: tree.children, parent, degree: snapshot ? degrees(snapshot) : new Map(), marks: markIndex(analysis) };
  indexes.set(analysis, index);
  return index;
}

/** The ancestors of an ID, itself included: `a.b.c` → `a`, `a.b`, `a.b.c`. */
function prefixes(id: string): string[] {
  const parts = id.split(".");
  return parts.map((_, i) => parts.slice(0, i + 1).join("."));
}

/** For every node, the edges with one end inside it and the other outside. */
function degrees(snapshot: AnalysisSnapshot): Map<string, number> {
  const out = new Map<string, number>();
  for (const edge of snapshot.edges) {
    if (edge.target === null) continue;
    const a = prefixes(edge.source);
    const b = prefixes(edge.target);
    let common = 0;
    while (common < a.length && common < b.length && a[common] === b[common]) common++;
    for (const id of [...a.slice(common), ...b.slice(common)]) out.set(id, (out.get(id) ?? 0) + 1);
  }
  return out;
}

function markIndex(analysis: Analysis): Map<string, Mark> {
  const out = new Map<string, Mark>();
  for (const verdict of analysis.verdicts) {
    const mark: Mark = verdict.verdict === "fail" ? "fail" : verdict.verdict === "unverified" ? "unverified" : "ok";
    for (const id of prefixes(verdict.area)) out.set(id, worse(out.get(id) ?? null, mark)!);
  }
  return out;
}

function inside(id: string, scope: string): boolean {
  return scope === ZOOM_ROOT || id === scope || id.startsWith(`${scope}.`);
}

/** The node the zoom screen shows a level of above `id`: its module, its layer, or the repository. */
export function zoomParent(analysis: Analysis, id: string): string | null {
  if (id === ZOOM_ROOT) return null;
  return indexOf(analysis).parent.get(id) ?? null;
}

/** Whether `id` has a level of its own: the repository, a layer, or a module or class with children. */
export function zoomContainer(analysis: Analysis, id: string): boolean {
  if (id === ZOOM_ROOT) return true;
  return (indexOf(analysis).children.get(id)?.length ?? 0) > 0 || analysis.snapshot?.nodes[id]?.kind === "layer";
}

/**
 * Where `z` on `id` opens the screen: the level of the node itself when it
 * has one, else the level it is a row of, with that row selected. Null for
 * an ID the snapshot does not have.
 */
export function zoomTarget(analysis: Analysis, id: string): { focus: string; select: string | null } | null {
  if (id === ZOOM_ROOT) return { focus: ZOOM_ROOT, select: null };
  if (!analysis.snapshot?.nodes[id]) return null;
  if (zoomContainer(analysis, id)) return { focus: id, select: null };
  return { focus: zoomParent(analysis, id) ?? ZOOM_ROOT, select: id };
}

/** The name a reader knows a node by on a level: the repository's manifest name, else `system`, and IDs below it. */
export function crumbLabel(analysis: Analysis, id: string): string {
  if (id === ZOOM_ROOT) return analysis.snapshot?.system?.name ?? "system";
  const above = zoomParent(analysis, id);
  return above !== null && above !== ZOOM_ROOT && id.startsWith(`${above}.`) ? id.slice(above.length + 1) : id;
}

function rowKind(analysis: Analysis, id: string): ZoomRow["kind"] {
  const node = analysis.snapshot?.nodes[id];
  if (!node || node.kind === "layer") return "layer";
  if (node.kind === "module") return node.class ? "class" : node.layer === EXTERNAL ? "package" : "module";
  return node.kind;
}

/**
 * The unit a node outside the focus is shown as on this level: on a layer's
 * level, the top module of its own layer (a package is one); on a module's
 * level, the node itself.
 */
function unitOf(index: ZoomIndex, focusIsLayer: boolean, id: string): string {
  if (!focusIsLayer) return id;
  let unit = id;
  for (let up = index.parent.get(unit); up !== undefined && up !== ZOOM_ROOT && !index.layers.includes(up); up = index.parent.get(unit)) unit = up;
  return unit;
}

/**
 * One level of the zoom screen: the children of `focus` and the nodes
 * outside it at most `depth` edges away from anything inside it. Neighbors
 * are grouped as the children are: by top module on a layer's level, by
 * node on a module's level. At the repository's level nothing is outside.
 */
export function zoomLevel(analysis: Analysis, focus: string, depth: number): ZoomLevel {
  const index = indexOf(analysis);
  const snapshot = analysis.snapshot;
  const row = (id: string, distance: number, label: string): ZoomRow => ({
    id,
    kind: rowKind(analysis, id),
    label,
    distance,
    container: zoomContainer(analysis, id),
    edges: index.degree.get(id) ?? 0,
    mark: index.marks.get(id) ?? null,
  });
  const children = focus === ZOOM_ROOT ? index.layers : (index.children.get(focus) ?? []);
  const rows = children.map((id) => row(id, 0, focus === ZOOM_ROOT ? id : id.slice(focus.length + 1)));
  const crumbs: ZoomLevel["crumbs"] = [];
  for (let at: string | null = focus; at !== null; at = zoomParent(analysis, at)) crumbs.unshift({ id: at, label: crumbLabel(analysis, at) });
  if (focus === ZOOM_ROOT || !snapshot) return { focus, crumbs, rows };

  // Units outside the focus and their edges, the focus itself as one unit: a breadth-first walk from it.
  const focusIsLayer = snapshot.nodes[focus]?.kind === "layer";
  const unit = (id: string): string => (inside(id, focus) ? focus : unitOf(index, focusIsLayer, id));
  const links = new Map<string, Set<string>>();
  const link = (a: string, b: string): void => {
    if (a === b) return;
    let set = links.get(a);
    if (!set) links.set(a, (set = new Set()));
    set.add(b);
  };
  for (const edge of snapshot.edges) {
    if (edge.target === null) continue;
    const a = unit(edge.source);
    const b = unit(edge.target);
    link(a, b);
    link(b, a);
  }
  const distance = new Map<string, number>([[focus, 0]]);
  let frontier = [focus];
  for (let d = 1; d <= depth + 1 && frontier.length > 0; d++) {
    const next: string[] = [];
    for (const at of frontier) {
      for (const other of links.get(at) ?? []) {
        if (distance.has(other)) continue;
        distance.set(other, d);
        next.push(other);
      }
    }
    frontier = next;
  }
  // A module whose own member is as near says nothing more: the import is how the call gets there.
  const shadowed = (id: string, d: number): boolean => !focusIsLayer && [...distance].some(([other, od]) => od <= d && other !== id && other.startsWith(`${id}.`));
  const near = [...distance].filter(([id, d]) => id !== focus && d <= depth && !shadowed(id, d)).sort(([a, da], [b, db]) => da - db || compareText(a, b));
  rows.push(...near.map(([id, d]) => row(id, d, id)));
  const past = [...distance].filter(([id, d]) => d === depth + 1 && !shadowed(id, d)).length;
  if (past > 0) rows.push({ id: "", kind: "more", label: `${past} more at depth ${depth + 1}`, distance: depth + 1, container: false, edges: 0, mark: null, more: past });
  return { focus, crumbs, rows };
}

/**
 * One row of the edges view (c4-zoom/08): the edges of the snapshot between
 * two ends at the level's granularity — a child of the focus, or a unit
 * outside it grouped as the neighbors are — with their kinds and count.
 */
export interface ZoomEdge {
  group: "in" | "out" | "external" | "inside" | "unresolved";
  from: string;
  to: string;
  /** Kinds of the edges and how many of each, most first. */
  kinds: { kind: string; count: number }[];
  count: number;
  /** Where Enter zooms: the end outside the focus, or the target of an edge between children. */
  other: string;
  /** The `unresolved` row: constructs inside the focus keylang did not turn into edges, by kind. */
  reasons?: { reason: string; count: number }[];
}

const EDGE_GROUPS: readonly ZoomEdge["group"][] = ["in", "out", "external", "inside", "unresolved"];

/** Coverage entries that are not constructs keylang failed to resolve. */
const NOT_HOLES: ReadonlySet<string> = new Set(["skipped-file", "outside-file"]);

/**
 * The edges view of a level: incoming from outside, outgoing to the code and
 * to packages, between the children, and what inside it keylang could not
 * resolve. Only edges the snapshot has: no row is drawn from a guess.
 */
export function zoomEdges(analysis: Analysis, focus: string): ZoomEdge[] {
  const snapshot = analysis.snapshot;
  if (!snapshot) return [];
  const index = indexOf(analysis);
  const children = focus === ZOOM_ROOT ? index.layers : (index.children.get(focus) ?? []);
  const focusIsLayer = snapshot.nodes[focus]?.kind === "layer";
  const childOf = (id: string): string => children.find((child) => inside(id, child)) ?? focus;
  const end = (id: string): { unit: string; in: boolean } => (inside(id, focus) ? { unit: childOf(id), in: true } : { unit: unitOf(index, focusIsLayer, id), in: false });
  const rows = new Map<string, ZoomEdge>();
  for (const edge of snapshot.edges) {
    if (edge.target === null) continue;
    const a = end(edge.source);
    const b = end(edge.target);
    if (!a.in && !b.in) continue;
    if (a.unit === b.unit) continue;
    const group: ZoomEdge["group"] = a.in && b.in ? "inside" : !a.in ? "in" : b.unit === EXTERNAL || b.unit.startsWith(`${EXTERNAL}.`) ? "external" : "out";
    const key = `${group}\0${a.unit}\0${b.unit}`;
    let row = rows.get(key);
    if (!row) rows.set(key, (row = { group, from: a.unit, to: b.unit, kinds: [], count: 0, other: group === "in" ? a.unit : b.unit }));
    row.count++;
    const kind = row.kinds.find((item) => item.kind === edge.kind);
    if (kind) kind.count++;
    else row.kinds.push({ kind: edge.kind, count: 1 });
  }
  const out = [...rows.values()];
  for (const row of out) row.kinds.sort((a, b) => b.count - a.count || compareText(a.kind, b.kind));
  out.sort((a, b) => EDGE_GROUPS.indexOf(a.group) - EDGE_GROUPS.indexOf(b.group) || b.count - a.count || compareText(a.from, b.from) || compareText(a.to, b.to));
  const holes = new Map<string, number>();
  for (const item of snapshot.coverage) {
    // Listed for the record, but no hole: a file left out or outside the architecture, an import of a file `assume` names.
    if (item.source === null || !inside(item.source, focus) || NOT_HOLES.has(item.kind) || !leavesUnresolved(item)) continue;
    holes.set(item.kind, (holes.get(item.kind) ?? 0) + 1);
  }
  if (holes.size > 0) {
    const reasons = [...holes].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || compareText(a.reason, b.reason));
    out.push({ group: "unresolved", from: focus, to: "", kinds: [], count: reasons.reduce((sum, item) => sum + item.count, 0), other: focus, reasons });
  }
  return out;
}

/** The key a level's selected row is kept under: one per focus and view. */
export function zoomSelectKey(zoom: { focus: string; view: "nodes" | "edges" }): string {
  return zoom.view === "edges" ? `edges\0${zoom.focus}` : zoom.focus;
}

/**
 * A flow over one zoom level (c4-zoom/09): its `trigger`, `step` and `calls`
 * numbered in the order they are written (a walk in depth, not the order they
 * run: only a trace confirms that), placed on the level's units, each number
 * with the gutter mark of its line.
 */
export interface FlowOverlay {
  flow: string;
  file: string;
  /** The numbers of the steps on each unit of the level. */
  steps: Map<string, number[]>;
  /** Each step by its number: its ID, its line in the spec, and the gutter mark there. */
  marks: Map<number, { id: string; line: number; mark: Mark | null }>;
  /** The layers the flow walks, consecutive steps of one layer as one range: `cli ① → map ②–④`. */
  sequence: { layer: string; first: number; last: number }[];
  /** `from\0to` of the level's units a step goes between (its parent to it), for the edges view. */
  pairs: Set<string>;
}

/** Flows that name `id` or something inside it, by name; all flows for the repository. */
export function flowsThrough(analysis: Analysis, id: string): string[] {
  const out = new Set<string>();
  for (const flow of analysis.spec.flows) {
    let hit = id === ZOOM_ROOT;
    walkFlow(flow, (item) => {
      if (hit) return;
      const targets = item.kind === "trigger" || item.kind === "step" ? [item.target.target] : item.kind === "calls" ? item.targets.map((ref) => ref.target) : [];
      if (targets.some((target) => inside(target, id))) hit = true;
    });
    if (hit) out.add(flow.name);
  }
  return [...out].sort(compareText);
}

export function flowOverlay(analysis: Analysis, name: string, focus: string, lineMark: (file: string, line: number) => Mark | null): FlowOverlay | null {
  const flow = analysis.spec.flows.find((item) => item.name === name);
  const snapshot = analysis.snapshot;
  if (!flow || !snapshot) return null;
  const index = indexOf(analysis);
  const children = focus === ZOOM_ROOT ? index.layers : (index.children.get(focus) ?? []);
  const focusIsLayer = snapshot.nodes[focus]?.kind === "layer";
  const unit = (id: string): string => (inside(id, focus) ? (children.find((child) => inside(id, child)) ?? focus) : unitOf(index, focusIsLayer, id));
  const layerOf = (id: string): string => snapshot.nodes[id]?.layer ?? id.split(".")[0]!;
  const overlay: FlowOverlay = { flow: flow.name, file: flow.file, steps: new Map(), marks: new Map(), sequence: [], pairs: new Set() };
  let n = 0;
  const place = (id: string, line: number, parent: string | null): void => {
    n++;
    const at = unit(id);
    overlay.steps.set(at, [...(overlay.steps.get(at) ?? []), n]);
    overlay.marks.set(n, { id, line, mark: lineMark(flow.file, line) });
    const layer = layerOf(id);
    const last = overlay.sequence.at(-1);
    if (last?.layer === layer) last.last = n;
    else overlay.sequence.push({ layer, first: n, last: n });
    if (parent !== null && unit(parent) !== at) overlay.pairs.add(`${unit(parent)}\0${at}`);
  };
  const visit = (item: Trigger | FlowItem, parent: string | null): void => {
    if (item.kind === "trigger" || item.kind === "step") place(item.target.target, item.span.start.line, parent);
    if (item.kind === "calls") for (const ref of item.targets) place(ref.target, ref.span.start.line, parent);
    if (item.kind === "test") return;
    const next = item.kind === "trigger" || item.kind === "step" ? item.target.target : parent;
    for (const child of item.children) visit(child, next);
  };
  const first = flow.triggers[0]?.target.target ?? null;
  for (const item of flow.top) visit(item, item.kind === "trigger" ? null : first);
  return overlay;
}

/** `①` for 1 up to `⑳` for 20, then the number in parentheses. */
export function circled(n: number): string {
  return n >= 1 && n <= 20 ? String.fromCodePoint(0x2460 + n - 1) : `(${n})`;
}
