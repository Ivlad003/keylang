// The zoom screen (.scratch/c4-zoom/issues/07): the map one level at a time,
// from the repository down to the members of a module, as C4 zooms from the
// system to the code. A level is a focus, its children, and the nodes outside
// it that the focus has edges with, as far as `depth` edges away. Pure: the
// keys in `app.ts` move through it and `view.ts` draws it.

import type { Analysis } from "../analyze.ts";
import { SYSTEM_ID } from "../explanations.ts";
import { EXTERNAL } from "../graph.ts";
import type { AnalysisSnapshot } from "../snapshot.ts";
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
