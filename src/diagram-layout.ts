// The layout file of a diagram view (business-flows/24, ADR 0024):
// `<dir>/diagrams/<view>.layout.json`, committed so a team sees the same
// picture. It keeps what a person gave the shapes of a view in the editor of
// `keylang web` — places, sizes, the bends of lines, colours and notes — and
// never what they mean: content changes only through proposals.
//
// A shape is keyed by what it stands for in the spec, never by its index or
// its spec line: a step by its ID (`step:application.purchase.buy`), a
// trigger by its fn, a `when` by its condition, an event by its name, a lane
// by its layer, a line by the keys of its ends; a second shape with the same
// key gets `#2`. So a reordered or edited spec keeps the layout of what it
// still says, and a planned step that a proposal turns into a step keeps the
// place it was drawn at. The JSON is deterministic: keys sorted, numbers
// rounded to hundredths, two-space indent, one trailing newline — a moved
// shape is a one-line diff.
//
// The directory is a view (ADR 0014): `check` never reads it, `map` never
// writes it. Reads and writes go through the protocol of `safe-write.ts`: a
// link out of the directory or a file with a generated marker is refused.

import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isGeneratedText, safeWrite, targetProblem, writeProblem } from "./safe-write.ts";
import { compareText } from "./span.ts";

/** The directory of layout files under the spec directory: a view, never read as specs. */
export const DIAGRAMS_DIR = "diagrams";

export const LAYOUT_FORMAT = 1;

/** One shape of a layout file: its box in model coordinates and what the editor keeps beside it. */
export interface LayoutShape {
  x: number;
  y: number;
  w?: number;
  h?: number;
  /** A shape the diagram of the code does not have (a note, a drawn shape): its keylang ID, kind and label, to draw it again. */
  id?: string;
  kind?: string;
  label?: string;
  /** A note's text. */
  note?: string;
  /** A fill colour (`#rrggbb`). */
  colour?: string;
  /** The spec a proposal of this drawn shape went to: until a merge puts it in the spec, the editor marks it. */
  proposed?: string;
}

export interface LayoutEdge {
  points: { x: number; y: number }[];
}

export interface LayoutFile {
  format: number;
  view: string;
  shapes: Record<string, LayoutShape>;
  edges: Record<string, LayoutEdge>;
}

/**
 * The layout as the editor of the page holds it: by the key of a shape on
 * its canvas (a diagram node's id such as `step:6`, `lane:<layer>`, an
 * edge's `edge:<from>-><to>`, a drawn shape's `draft:3`). A drawn shape and a
 * drawn edge say what they are (`id`, `kind`, `label`; `from`, `to`), which
 * is what the file keys them by.
 */
export interface ClientEntry {
  x: number;
  y: number;
  w?: number;
  h?: number;
  points?: { x: number; y: number }[];
  id?: string;
  kind?: string;
  label?: string;
  note?: string;
  colour?: string;
  proposed?: string;
  from?: string;
  to?: string;
  /** In an answer: a drawn shape whose proposal still waits (`pending`) or was not merged (`rejected`). */
  status?: "pending" | "rejected";
}

export type ClientLayout = Record<string, ClientEntry>;

/** What the keys are computed from: a diagram's nodes, edges and lanes (src/diagram.ts), structurally. */
export interface KeyDiagram {
  nodes: readonly { id: string; kind: string; label: string; ref?: { id?: string } }[];
  edges: readonly { from: string; to: string; kind: string }[];
  groups: readonly { id: string }[];
}

/** A diagram node whose id holds a spec line (`step:12`, `parallel:9:join`, `calls:4:0`): a flow's, keyed anew. */
const LINE_ID = /^(?:trigger|step|then|when|emits|after|every|parallel|hole|calls):\d/;

/** A view's file name: `flow:checkout` → `flow--checkout.layout.json`; what a file name cannot hold is `_xx` hex. */
export function viewSlug(view: string): string {
  const at = view.indexOf(":");
  const encode = (text: string): string => text.replace(/[^A-Za-z0-9.-]/g, (c) => [...Buffer.from(c, "utf8")].map((b) => `_${b.toString(16).padStart(2, "0")}`).join(""));
  return at === -1 ? encode(view) : `${encode(view.slice(0, at))}--${encode(view.slice(at + 1))}`;
}

/** The layout file of a view, relative to the root, POSIX. */
export function layoutPath(specDir: string, view: string): string {
  return `${specDir === "" ? "" : `${specDir}/`}${DIAGRAMS_DIR}/${viewSlug(view)}.layout.json`;
}

/** The key a shape gets from what it stands for, before twins are told apart. */
export function shapeBase(kind: string, id: string, label: string): string {
  const bare = id.replace(/^planned:/, "");
  switch (kind) {
    case "lane":
      return `lane:${bare || label}`;
    case "start":
      return `trigger:${bare || label}`;
    case "gateway":
      return `when:${label}`;
    case "event":
      return `emits:${label}`;
    case "timer":
      return `timer:${label}`;
    case "layer":
      return `layer:${bare || label}`;
    case "task":
    case "fn":
    case "module":
    case "type":
    case "external":
      return bare !== "" ? `step:${bare}` : `then:${label}`;
    default:
      return `${kind}:${bare || label}`;
  }
}

/**
 * The stable key of each node of a diagram, by node id. A node of a flow
 * (an id with a spec line) is keyed by what it says; any other node already
 * has a stable id (`fn:<id>`, `entry:<id>`, `layer:<id>`). Parallel gateways
 * are keyed by the shapes on their branches, a hole by the shape it stands
 * before. Twins get `#2`, `#3` in diagram order.
 */
export function diagramKeys(diagram: KeyDiagram): Map<string, string> {
  const base = new Map<string, string>();
  const out = new Map<string, string[]>();
  const into = new Map<string, string[]>();
  for (const edge of diagram.edges) {
    out.set(edge.from, [...(out.get(edge.from) ?? []), edge.to]);
    into.set(edge.to, [...(into.get(edge.to) ?? []), edge.from]);
  }
  const lineKeyed = (id: string): boolean => LINE_ID.test(id);
  for (const node of diagram.nodes) {
    if (!lineKeyed(node.id)) base.set(node.id, node.id);
    else if (node.id.startsWith("calls:")) base.set(node.id, `calls:${node.ref?.id ?? node.label}`);
    else if (node.kind !== "parallel" && node.kind !== "hole") base.set(node.id, shapeBase(node.kind, node.ref?.id ?? "", node.label));
  }
  // Shapes that say something first, twins apart; then a hole stands before the shape it leads to, a parallel gateway is its branches.
  const said = twinsApart(diagram.nodes.filter((node) => base.has(node.id)).map((node) => [node.id, base.get(node.id)!]));
  for (const [id, key] of said) base.set(id, key);
  const resolve = (id: string, seen: Set<string>): string => {
    const known = base.get(id);
    if (known !== undefined) return known;
    if (seen.has(id)) return "?";
    seen.add(id);
    const node = diagram.nodes.find((n) => n.id === id);
    if (!node) return "?";
    let key: string;
    if (node.kind === "hole") key = `hole:${(out.get(id) ?? []).map((to) => resolve(to, seen)).sort(compareText).join("+")}`;
    else if (id.endsWith(":join")) key = `parallel-join:${(into.get(id) ?? []).map((from) => resolve(from, seen)).sort(compareText).join("+")}`;
    else key = `parallel:${(out.get(id) ?? []).map((to) => resolve(to, seen)).sort(compareText).join("+")}`;
    base.set(id, key);
    return key;
  };
  for (const node of diagram.nodes) resolve(node.id, new Set());
  const derived = twinsApart(diagram.nodes.filter((node) => !said.has(node.id)).map((node) => [node.id, base.get(node.id)!]), said.values());
  return new Map(diagram.nodes.map((node) => [node.id, said.get(node.id) ?? derived.get(node.id)!]));
}

/** `#2`, `#3` for a key already taken, in order. */
function twinsApart(pairs: readonly (readonly [string, string])[], taken: Iterable<string> = []): Map<string, string> {
  const used = new Map<string, number>();
  for (const key of taken) used.set(key, 1);
  const out = new Map<string, string>();
  for (const [id, key] of pairs) {
    const n = (used.get(key) ?? 0) + 1;
    used.set(key, n);
    out.set(id, n === 1 ? key : `${key}#${n}`);
  }
  return out;
}

const round = (value: number): number => Math.round(value * 100) / 100;

function cleanShape(entry: ClientEntry): LayoutShape {
  const shape: LayoutShape = { x: round(entry.x), y: round(entry.y) };
  if (typeof entry.w === "number") shape.w = round(entry.w);
  if (typeof entry.h === "number") shape.h = round(entry.h);
  for (const field of ["id", "kind", "label", "note", "colour", "proposed"] as const) {
    const value = entry[field];
    if (typeof value === "string" && value !== "") shape[field] = value;
  }
  return shape;
}

/**
 * The editor's layout as the file keeps it: each key of a diagram node turned
 * into its stable key, a lane into `lane:<layer>`, a drawn shape keyed by
 * what it says (`step:<id>` without `planned:`), a note by its own key, an
 * edge by the stable keys of its ends. An entry the diagram does not know
 * and that says nothing of itself is dropped.
 */
export function layoutToFile(view: string, layout: ClientLayout, diagram: KeyDiagram): LayoutFile {
  const nodeKeys = diagramKeys(diagram);
  const laneIds = new Set(diagram.groups.map((group) => group.id));
  const shapes: Record<string, LayoutShape> = {};
  const edges: Record<string, LayoutEdge> = {};
  const byClient = new Map<string, string>();
  const drawn: [string, string][] = [];
  const entries = Object.entries(layout).sort(([a], [b]) => compareText(a, b));
  for (const [key, entry] of entries) {
    if (entry.from !== undefined || entry.to !== undefined || key.startsWith("edge:")) continue;
    if (nodeKeys.has(key)) byClient.set(key, nodeKeys.get(key)!);
    else if (key.startsWith("lane:") && laneIds.has(key.slice("lane:".length))) byClient.set(key, key);
    else if (entry.kind === "note") byClient.set(key, `note:${key.replace(/^note:/, "")}`);
    else if (typeof entry.kind === "string" && entry.kind !== "") drawn.push([key, shapeBase(entry.kind, entry.id ?? "", entry.label ?? "")]);
  }
  for (const [key, stable] of twinsApart(drawn, byClient.values())) byClient.set(key, stable);
  for (const [key, entry] of entries) {
    const stable = byClient.get(key);
    if (stable === undefined) continue;
    const shape = cleanShape(entry);
    // What the diagram of the code draws needs no ID or kind to be drawn again.
    if (nodeKeys.has(key) || key.startsWith("lane:")) for (const field of ["id", "kind", "label", "proposed"] as const) delete shape[field];
    shapes[stable] = shape;
  }
  // Edges: the diagram's by their ends (`edge:<from>-><to>`, `#n` for a second one), a drawn one by its `from` and `to`.
  const edgePairs: [string, string][] = [];
  for (const [key, entry] of entries) {
    if (!entry.points || entry.points.length === 0) continue;
    let ends: [string, string] | null = null;
    if (entry.from !== undefined && entry.to !== undefined) ends = [entry.from, entry.to];
    else {
      const match = /^edge:(.+?)->(.+?)(?:#\d+)?$/.exec(key);
      if (match) ends = [match[1]!, match[2]!];
    }
    if (ends === null) continue;
    const from = byClient.get(ends[0]) ?? nodeKeys.get(ends[0]);
    const to = byClient.get(ends[1]) ?? nodeKeys.get(ends[1]);
    if (from === undefined || to === undefined) continue;
    edgePairs.push([key, `edge:${from}->${to}`]);
  }
  for (const [key, stable] of twinsApart(edgePairs)) edges[stable] = { points: layout[key]!.points!.map((p) => ({ x: round(p.x), y: round(p.y) })) };
  return { format: LAYOUT_FORMAT, view, shapes, edges };
}

/**
 * The file's layout as the editor reads it: keys of the diagram's nodes,
 * lanes and edges, and the shapes the diagram does not have — notes, and
 * drawn shapes a proposal took (`proposed`) — under their own keys, with
 * what is needed to draw them. `pending` names the proposals still waiting:
 * a drawn shape whose proposal waits is `pending`, else `rejected`.
 */
export function layoutFromFile(file: LayoutFile, diagram: KeyDiagram, pending: ReadonlySet<string> = new Set()): ClientLayout {
  const nodeKeys = diagramKeys(diagram);
  const byStable = new Map([...nodeKeys].map(([id, key]) => [key, id]));
  const laneIds = new Set(diagram.groups.map((group) => group.id));
  const out: ClientLayout = {};
  for (const [stable, shape] of Object.entries(file.shapes)) {
    const id = byStable.get(stable);
    if (id !== undefined) out[id] = { x: shape.x, y: shape.y, ...(shape.w !== undefined ? { w: shape.w } : {}), ...(shape.h !== undefined ? { h: shape.h } : {}), ...(shape.colour ? { colour: shape.colour } : {}) };
    else if (stable.startsWith("lane:") && laneIds.has(stable.slice("lane:".length))) out[stable] = { ...shape };
    else if (stable.startsWith("note:")) out[stable.slice("note:".length)] = { ...shape, kind: "note" };
    else if (shape.proposed && shape.kind) out[stable] = { ...shape, status: pending.has(shape.proposed) ? "pending" : "rejected" };
  }
  const edgeKey = new Map<string, number>();
  const clientEdges = new Map<string, string>();
  for (const edge of diagram.edges) {
    const base = `edge:${edge.from}->${edge.to}`;
    const n = edgeKey.get(base) ?? 0;
    edgeKey.set(base, n + 1);
    const from = nodeKeys.get(edge.from);
    const to = nodeKeys.get(edge.to);
    if (from === undefined || to === undefined) continue;
    const stable = `edge:${from}->${to}`;
    let unique = stable;
    for (let i = 2; clientEdges.has(unique); i++) unique = `${stable}#${i}`;
    clientEdges.set(unique, n === 0 ? base : `${base}#${n}`);
  }
  for (const [stable, edge] of Object.entries(file.edges)) {
    const key = clientEdges.get(stable);
    if (key !== undefined) out[key] = { x: 0, y: 0, points: edge.points.map((p) => ({ ...p })) };
  }
  return out;
}

/** The saved boxes of a diagram's nodes, by node id: what `layout(diagram, positions)` takes. */
export function savedPositions(file: LayoutFile | null, diagram: KeyDiagram): Record<string, { x: number; y: number; w?: number; h?: number }> {
  if (file === null) return {};
  const out: Record<string, { x: number; y: number; w?: number; h?: number }> = {};
  for (const [id, key] of diagramKeys(diagram)) {
    const shape = Object.hasOwn(file.shapes, key) ? file.shapes[key] : undefined;
    if (shape) out[id] = { x: shape.x, y: shape.y, ...(shape.w !== undefined ? { w: shape.w } : {}), ...(shape.h !== undefined ? { h: shape.h } : {}) };
  }
  return out;
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort(compareText)
        .map((key) => [key, sorted((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

/** The file's text: the format and the view first, then shapes and edges with their keys sorted. Same layout, same bytes. */
export function layoutText(file: LayoutFile): string {
  return `${JSON.stringify({ format: file.format, view: file.view, shapes: sorted(file.shapes), edges: sorted(file.edges) }, null, 2)}\n`;
}

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const isPoint = (value: unknown): value is { x: number; y: number } => isObject(value) && Number.isFinite(value.x) && Number.isFinite(value.y);

/** A layout file's text read leniently: a shape or an edge of the wrong form is left out; not JSON at all is an error. */
export function parseLayout(text: string, view: string): LayoutFile {
  const value: unknown = JSON.parse(text);
  if (!isObject(value)) throw new Error("not a layout: the JSON is no object");
  const shapes: Record<string, LayoutShape> = {};
  const edges: Record<string, LayoutEdge> = {};
  if (isObject(value.shapes)) {
    for (const [key, raw] of Object.entries(value.shapes)) {
      if (!isPoint(raw)) continue;
      const entry = raw as unknown as ClientEntry;
      shapes[key] = cleanShape({ ...entry, ...(Number.isFinite(entry.w) ? {} : { w: undefined }), ...(Number.isFinite(entry.h) ? {} : { h: undefined }) } as ClientEntry);
    }
  }
  if (isObject(value.edges)) {
    for (const [key, raw] of Object.entries(value.edges)) {
      if (isObject(raw) && Array.isArray(raw.points) && raw.points.every(isPoint)) edges[key] = { points: (raw.points as { x: number; y: number }[]).map((p) => ({ x: p.x, y: p.y })) };
    }
  }
  return { format: typeof value.format === "number" ? value.format : LAYOUT_FORMAT, view: typeof value.view === "string" ? value.view : view, shapes, edges };
}

/** Where the layout of a view is, or why it may not be read or written there (a link out of the directory, a generated file). */
function placeProblem(root: string, path: string, specDir: string): string | null {
  return targetProblem(root, path, { under: `${specDir === "" ? "" : `${specDir}/`}${DIAGRAMS_DIR}` }) ?? targetProblem(root, path);
}

/**
 * The saved layout of a view, or null when there is none. A file reached
 * through a link out of the directory, one with a generated marker or one
 * that is no layout throws with the reason.
 */
export function readLayout(root: string, specDir: string, view: string): { path: string; file: LayoutFile | null } {
  const path = layoutPath(specDir, view);
  // The directory itself must be there before a link in it can be judged; nothing there, no layout.
  let exists = true;
  try {
    lstatSync(join(root, path));
  } catch {
    exists = false;
  }
  if (!exists) return { path, file: null };
  const problem = placeProblem(root, path, specDir);
  if (problem !== null) throw new Error(`${path}: ${problem}`);
  const text = readFileSync(join(root, path), "utf8");
  if (isGeneratedText(text)) throw new Error(`${path}: a generated file, not a layout`);
  try {
    return { path, file: parseLayout(text, view) };
  } catch (error) {
    throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Why the layout of a view may not be written, or null. */
export function layoutWriteProblem(root: string, specDir: string, view: string): string | null {
  const path = layoutPath(specDir, view);
  return placeProblem(root, path, specDir) ?? writeProblem(root, path, { under: `${specDir === "" ? "" : `${specDir}/`}${DIAGRAMS_DIR}` });
}

/** Writes the layout of a view (atomic, through `safeWrite`): its path, relative to the root. Throws `path: problem` for a link out or a generated file. */
export function writeLayout(root: string, specDir: string, file: LayoutFile): string {
  const path = layoutPath(specDir, file.view);
  const problem = layoutWriteProblem(root, specDir, file.view);
  if (problem !== null) throw new Error(`${path}: ${problem}`);
  safeWrite(root, path, layoutText(file), { under: `${specDir === "" ? "" : `${specDir}/`}${DIAGRAMS_DIR}` });
  return path;
}
