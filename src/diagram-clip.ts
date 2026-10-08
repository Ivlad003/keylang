// A fragment of a diagram carried between tabs and repositories
// (business-flows/25). The clipboard holds one `text/plain`: the portable
// bundle of business-flows/26 whose ```keylang-layout``` block holds the
// copied shapes — no custom MIME type, which browsers do not carry between
// origins. The block is JSON: the shapes keyed as the layout files of
// `diagram-layout.ts` key them (`step:<id>`, `trigger:<id>`, `when:<label>`,
// `note:<n>`, twins `#2`), places relative to the fragment's top-left, and
// the lines between them keyed by their ends. Pasted elsewhere, every ID is
// re-homed by the import's ID map and layer choices; a bundle without the
// block is laid out here, a row per layer. Pure: the server reads and
// writes, the editor draws.
//
// The text is data from another repository or a person: nothing in it is
// ever run, and only its IDs, kinds, labels and numbers reach the canvas.

import { shapeBase, twinsApart } from "./diagram-layout.ts";
import type { Bundle, LayerChoice } from "./flow-bundle.ts";
import { isId } from "./parser.ts";
import { compareText } from "./span.ts";

export const CLIP_FORMAT = 1;

/** One copied shape as the editor (or the viewer) sends it: a key of its canvas and a box in model coordinates. */
export interface ClipShape {
  key: string;
  /** The keylang ID, `planned:<id>` for a drawn one, "" for none. */
  id: string;
  kind: string;
  label: string;
  /** The layer of the lane it sits in, or null. */
  layer: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  signature?: string;
  trigger?: string;
  role?: "split" | "join";
  description?: string;
  tests?: string[];
  colour?: string;
}

/** One copied line: the canvas keys of its ends. */
export interface ClipEdge {
  from: string;
  to: string;
  kind: string;
  label?: string;
  points?: { x: number; y: number }[];
}

/** The layout block: shapes by stable key, edges by the stable keys of their ends. */
export interface ClipLayout {
  format: number;
  /** The view it was copied from (`flow:checkout`), or "". */
  view: string;
  shapes: Record<string, Omit<ClipShape, "key">>;
  edges: Record<string, { kind: string; label?: string; points?: { x: number; y: number }[] }>;
}

/** A shape as the paste answers it: its stable key (what the edges name) and the rest. */
export type PastedShape = ClipShape;
export interface PastedEdge {
  from: string;
  to: string;
  kind: string;
  label?: string;
  points?: { x: number; y: number }[];
}

const KINDS: ReadonlySet<string> = new Set(["layer", "module", "fn", "type", "start", "task", "gateway", "parallel", "event", "timer", "external", "hole", "note"]);
const LINKS: ReadonlySet<string> = new Set(["sequence", "call", "dependency", "allow", "deny", "emits", "subscribes", "continues"]);
const TRIGGERS: ReadonlySet<string> = new Set(["fn", "route", "cron", "webhook", "consumer", "cli", "event"]);
/** At most this many shapes in one fragment, and this long a text field. */
const MAX_SHAPES = 2000;
const MAX_TEXT = 2000;

const round = (value: number): number => Math.round(value * 100) / 100;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const short = (value: unknown): string | undefined => (typeof value === "string" ? value.slice(0, MAX_TEXT) : undefined);

/** An ID as a shape may carry it: a dotted ID, optionally `planned:`; anything else is none. */
function cleanId(value: unknown): string {
  if (typeof value !== "string") return "";
  const bare = value.replace(/^planned:/, "");
  return bare !== "" && isId(bare) ? value : "";
}

/** One shape from untrusted JSON, or null: a known kind, finite numbers, short strings. */
function cleanShape(raw: unknown, key: string): ClipShape | null {
  if (!isObject(raw) || !finite(raw.x) || !finite(raw.y)) return null;
  const kind = typeof raw.kind === "string" && KINDS.has(raw.kind) ? raw.kind : null;
  if (kind === null) return null;
  const shape: ClipShape = {
    key,
    id: cleanId(raw.id),
    kind,
    label: short(raw.label) ?? "",
    layer: typeof raw.layer === "string" && isId(raw.layer) ? raw.layer : null,
    x: round(raw.x),
    y: round(raw.y),
    w: finite(raw.w) && raw.w > 0 ? round(Math.min(raw.w, 5000)) : 160,
    h: finite(raw.h) && raw.h > 0 ? round(Math.min(raw.h, 5000)) : 60,
  };
  const signature = short(raw.signature);
  if (signature) shape.signature = signature;
  if (typeof raw.trigger === "string" && TRIGGERS.has(raw.trigger)) shape.trigger = raw.trigger;
  if (raw.role === "split" || raw.role === "join") shape.role = raw.role;
  const description = short(raw.description);
  if (description) shape.description = description;
  if (Array.isArray(raw.tests)) {
    const tests = raw.tests.filter((t): t is string => typeof t === "string").map((t) => t.slice(0, MAX_TEXT)).slice(0, 50);
    if (tests.length > 0) shape.tests = tests;
  }
  if (typeof raw.colour === "string" && /^#[0-9a-fA-F]{6}$/.test(raw.colour)) shape.colour = raw.colour;
  return shape;
}

function cleanPoints(raw: unknown): { x: number; y: number }[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const points = raw.filter((p): p is { x: number; y: number } => isObject(p) && finite(p.x) && finite(p.y)).slice(0, 100).map((p) => ({ x: round(p.x), y: round(p.y) }));
  return points.length > 0 ? points : undefined;
}

/** The shapes and edges of a request body (`{shapes, edges}`), or what is wrong with them. */
export function parseClipSelection(shapesRaw: unknown, edgesRaw: unknown): { shapes: ClipShape[]; edges: ClipEdge[] } | string {
  if (shapesRaw === undefined) return { shapes: [], edges: [] };
  if (!Array.isArray(shapesRaw)) return "shapes: an array of {key, id, kind, label, layer, x, y, w, h}";
  if (shapesRaw.length > MAX_SHAPES) return `shapes: at most ${MAX_SHAPES}`;
  const shapes: ClipShape[] = [];
  for (const [i, raw] of shapesRaw.entries()) {
    const key = isObject(raw) && typeof raw.key === "string" && raw.key !== "" ? raw.key.slice(0, 200) : null;
    const shape = key === null ? null : cleanShape(raw, key);
    if (shape === null) return `shapes[${i}]: needs key, a known kind, x and y`;
    shapes.push(shape);
  }
  const edges: ClipEdge[] = [];
  if (edgesRaw !== undefined) {
    if (!Array.isArray(edgesRaw)) return "edges: an array of {from, to, kind}";
    for (const raw of edgesRaw.slice(0, MAX_SHAPES * 2)) {
      if (!isObject(raw) || typeof raw.from !== "string" || typeof raw.to !== "string") continue;
      const edge: ClipEdge = { from: raw.from, to: raw.to, kind: typeof raw.kind === "string" && LINKS.has(raw.kind) ? raw.kind : "sequence" };
      const label = short(raw.label);
      if (label) edge.label = label;
      const points = cleanPoints(raw.points);
      if (points) edge.points = points;
      edges.push(edge);
    }
  }
  return { shapes, edges };
}

/** The stable key of a copied shape, as a layout file keys it: a note by its own key, the rest by what it says. */
function baseKey(shape: ClipShape): string {
  if (shape.kind === "note") return `note:${shape.key.replace(/^note:/, "")}`;
  return shapeBase(shape.kind, shape.id, shape.label);
}

/**
 * The layout block of a selection: shapes by stable key, places relative to
 * the fragment's top-left, edges between copied shapes only, by the stable
 * keys of their ends. Deterministic: the same selection gives the same text.
 */
export function clipLayout(view: string, shapes: readonly ClipShape[], edges: readonly ClipEdge[]): ClipLayout {
  const ordered = [...shapes].sort((a, b) => a.y - b.y || a.x - b.x || compareText(a.key, b.key));
  const keys = twinsApart(ordered.map((shape) => [shape.key, baseKey(shape)] as const));
  const left = Math.min(...ordered.map((s) => s.x), Infinity);
  const top = Math.min(...ordered.map((s) => s.y), Infinity);
  const dx = Number.isFinite(left) ? left : 0;
  const dy = Number.isFinite(top) ? top : 0;
  const out: ClipLayout = { format: CLIP_FORMAT, view, shapes: {}, edges: {} };
  for (const shape of ordered) {
    const { key, ...rest } = shape;
    out.shapes[keys.get(key)!] = { ...rest, x: round(shape.x - dx), y: round(shape.y - dy) };
  }
  const pairs: [string, string][] = [];
  const byPair = new Map<string, ClipEdge>();
  for (const [i, edge] of edges.entries()) {
    const from = keys.get(edge.from);
    const to = keys.get(edge.to);
    if (from === undefined || to === undefined) continue;
    pairs.push([String(i), `edge:${from}->${to}`]);
    byPair.set(String(i), edge);
  }
  for (const [i, key] of twinsApart(pairs)) {
    const edge = byPair.get(i)!;
    out.edges[key] = { kind: edge.kind, ...(edge.label ? { label: edge.label } : {}), ...(edge.points ? { points: edge.points.map((p) => ({ x: round(p.x - dx), y: round(p.y - dy) })) } : {}) };
  }
  return out;
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (isObject(value)) return Object.fromEntries(Object.keys(value).sort(compareText).map((key) => [key, sorted(value[key])]));
  return value;
}

/** The block's text: JSON with sorted keys, two-space indent, no fence it could close (`` ` `` never stays raw). */
export function clipLayoutText(layout: ClipLayout): string {
  return JSON.stringify({ format: layout.format, view: layout.view, shapes: sorted(layout.shapes), edges: sorted(layout.edges) }, null, 2).replaceAll("`", "\\u0060");
}

/** The layout block of a bundle read leniently: null when it is empty or no layout; a shape or an edge of the wrong form is left out. */
export function parseClipLayout(text: string): ClipLayout | null {
  if (text.trim() === "") return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(value) || !isObject(value.shapes)) return null;
  const out: ClipLayout = { format: finite(value.format) ? value.format : CLIP_FORMAT, view: typeof value.view === "string" ? value.view.slice(0, 500) : "", shapes: {}, edges: {} };
  for (const [key, raw] of Object.entries(value.shapes).slice(0, MAX_SHAPES)) {
    const shape = cleanShape(raw, key);
    if (shape === null) continue;
    const { key: _key, ...rest } = shape;
    out.shapes[key] = rest;
  }
  if (isObject(value.edges)) {
    for (const [key, raw] of Object.entries(value.edges).slice(0, MAX_SHAPES * 2)) {
      if (!key.startsWith("edge:") || !isObject(raw) || edgeEnds(key, out.shapes) === null) continue;
      const kind = typeof raw.kind === "string" && LINKS.has(raw.kind) ? raw.kind : "sequence";
      const label = short(raw.label);
      const points = cleanPoints(raw.points);
      out.edges[key] = { kind, ...(label ? { label } : {}), ...(points ? { points } : {}) };
    }
  }
  return out;
}

/** The two ends of a layout edge key. */
function edgeEnds(key: string, shapes: Record<string, unknown>): [string, string] | null {
  // A key may hold `->` inside a `when:` label: the split that names two shapes wins.
  const bare = key.replace(/#\d+$/, "").slice("edge:".length);
  for (let at = bare.indexOf("->"); at !== -1; at = bare.indexOf("->", at + 1)) {
    const from = bare.slice(0, at);
    const to = bare.slice(at + 2);
    if (Object.hasOwn(shapes, from) && Object.hasOwn(shapes, to)) return [from, to];
  }
  return null;
}

/**
 * The flow of a selection that is no flow view: `# flow <name>` with the
 * selection's trigger (a start shape) and its named shapes as steps, left to
 * right; a drawn shape is declared `planned` with its kind and signature.
 */
export function fragmentFlow(name: string, shapes: readonly ClipShape[]): string | null {
  const named = [...shapes].filter((s) => s.id !== "" && s.kind !== "note").sort((a, b) => a.x - b.x || a.y - b.y || compareText(a.key, b.key));
  if (named.length === 0) return null;
  const planned: string[] = [];
  const items: string[] = [];
  const seen = new Set<string>();
  const start = named.find((s) => s.kind === "start");
  for (const shape of start ? [start, ...named.filter((s) => s !== start)] : named) {
    const bare = shape.id.replace(/^planned:/, "");
    if (seen.has(bare)) continue;
    seen.add(bare);
    if (shape.id.startsWith("planned:")) {
      const kind = shape.kind === "module" || shape.kind === "type" || shape.kind === "event" ? shape.kind : "fn";
      const signature = shape.signature?.replace(/\s+/g, " ").trim().replace(/<!--|-->/g, "") ?? "";
      planned.push(`- planned ${kind} ${bare}${signature ? ` ${signature}` : ""}`);
    }
    if (shape === start) items.push(`- trigger ${shape.trigger && shape.trigger !== "fn" ? `${shape.trigger} ` : ""}${bare}`);
    else items.push(`${start ? "  " : ""}- step ${bare}`);
  }
  return `# flow ${name}\n\n${[...planned, ...items].join("\n")}\n`;
}

/** A flow name from a selection: the first named shape's last segment and `-fragment`. */
export function fragmentName(shapes: readonly ClipShape[]): string {
  const first = [...shapes].filter((s) => s.id !== "").sort((a, b) => a.x - b.x || a.y - b.y)[0];
  const stem = (first?.id.replace(/^planned:/, "").split(".").at(-1) ?? "selection").replace(/[^\p{L}\p{N}_-]/gu, "");
  return `${stem || "selection"}-fragment`;
}

/**
 * The shapes a paste draws, with IDs re-homed: an ID the import mapped takes
 * its target (`planned:` when the target lacks it); any other ID takes the
 * mapped layer as its first segment and is planned. `ids` and `choices` empty:
 * the IDs as they are (a paste into the same repository makes its own copies).
 * Without a layout block the bundle's flows are laid out: a row per layer,
 * their IDs left to right, a sequence line between neighbours.
 */
export function pastedShapes(bundle: Bundle, ids: readonly { from: string; to: string; planned: boolean }[], choices: readonly LayerChoice[]): { shapes: PastedShape[]; edges: PastedEdge[]; laidOut: boolean } {
  const byId = new Map(ids.map((x) => [x.from, x]));
  const layerTo = new Map(choices.map((c) => [c.from, c.to]));
  const rehome = (raw: string): string => {
    if (raw === "") return "";
    const bare = raw.replace(/^planned:/, "");
    const mapped = byId.get(bare);
    if (mapped) return mapped.planned ? `planned:${mapped.to}` : mapped.to;
    if (choices.length === 0) return raw;
    const [layer, ...rest] = bare.split(".");
    const to = layerTo.get(layer!);
    return to === undefined ? raw : `planned:${[to, ...rest].join(".")}`;
  };
  const layerOf = (layer: string | null, id: string): string | null => {
    if (layer !== null && choices.length > 0) return layerTo.get(layer) ?? null;
    if (layer !== null) return layer;
    const bare = id.replace(/^planned:/, "");
    return bare === "" ? null : bare.split(".")[0]!;
  };
  const layout = parseClipLayout(bundle.layout);
  if (layout !== null && Object.keys(layout.shapes).length > 0) {
    const shapes: PastedShape[] = Object.entries(layout.shapes).map(([key, shape]) => {
      const id = rehome(shape.id);
      // A label that is the ID (the viewer draws IDs) follows the ID.
      const label = shape.label === shape.id.replace(/^planned:/, "") ? id.replace(/^planned:/, "") : shape.label;
      return { ...shape, key, id, label, layer: layerOf(shape.layer, id) };
    });
    const edges: PastedEdge[] = [];
    for (const [key, edge] of Object.entries(layout.edges)) {
      const ends = edgeEnds(key, layout.shapes);
      if (ends) edges.push({ from: ends[0], to: ends[1], ...edge });
    }
    return { shapes, edges, laidOut: false };
  }
  // No layout: each flow's IDs in order, a row per (target) layer.
  const shapes: PastedShape[] = [];
  const edges: PastedEdge[] = [];
  const rows = new Map<string, number>();
  const columns = new Map<string, number>();
  const keyOf = new Map<string, string>();
  for (const flow of bundle.flows) {
    const trigger = /^\s*- trigger\s+(?:(?:fn|route|cron|webhook|consumer|cli|event)\s+)?([^\s<]+)/m.exec(flow.text)?.[1] ?? null;
    let previous: string | null = null;
    for (const source of flowOrder(bundle, flow.name, flow.text)) {
      if (source.split(".")[0] === "external") continue;
      let key = keyOf.get(source);
      if (key === undefined) {
        const id = rehome(source);
        const layer = layerOf(null, id) ?? "";
        if (!rows.has(layer)) rows.set(layer, rows.size);
        const column = columns.get(layer) ?? 0;
        columns.set(layer, column + 1);
        const start = source === trigger;
        const label = id.replace(/^planned:/, "").split(".").at(-1) ?? id;
        key = start ? `trigger:${id.replace(/^planned:/, "")}` : `step:${id.replace(/^planned:/, "")}`;
        keyOf.set(source, key);
        const node = bundle.nodes.find((n) => n.id === source);
        shapes.push({
          key,
          id,
          kind: start ? "start" : "task",
          label,
          layer: layer === "" ? null : layer,
          x: column * 200,
          y: rows.get(layer)! * 130,
          w: start ? 36 : 160,
          h: start ? 36 : 60,
          ...(start ? { trigger: "fn" } : {}),
          ...(node?.signature && id.startsWith("planned:") ? { signature: node.signature } : {}),
        });
      }
      if (previous !== null && previous !== key && !edges.some((e) => e.from === previous && e.to === key)) edges.push({ from: previous, to: key, kind: "sequence" });
      previous = key;
    }
  }
  return { shapes, edges, laidOut: true };
}

/** The IDs a flow names, in order (`flowIds` of the bundle module would parse again; the nodes table keeps the order of first mention). */
function flowOrder(bundle: Bundle, flow: string, text: string): string[] {
  const named = bundle.nodes.filter((n) => n.flows.includes(flow) && n.role === "flow").map((n) => n.id);
  if (named.length > 0) return named;
  const out: string[] = [];
  for (const m of text.matchAll(/^\s*- (?:trigger|step|then)\s+(?:(?:fn|route|cron|webhook|consumer|cli|event)\s+)?([^\s<]+)/gm)) if (isId(m[1]!) && !out.includes(m[1]!)) out.push(m[1]!);
  return out;
}
