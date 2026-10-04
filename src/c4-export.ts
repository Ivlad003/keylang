// C4 diagrams of the snapshot (.scratch/c4-zoom/issues/12): a view of the map
// for the tools that draw C4 (ADR 0014), in C4-PlantUML or Mermaid. A layer
// is a boundary, not a container: in C4 a container is an application or a
// store that runs on its own, and a layer of one program is not. The text is
// the snapshot and the saved briefs only — no model — so the same inputs give
// the same bytes.

import { SYSTEM_ID } from "./explanations.ts";
import { EXTERNAL } from "./graph.ts";
import type { AnalysisSnapshot } from "./snapshot.ts";
import { compareText } from "./span.ts";

export const C4_FORMATS = ["plantuml", "mermaid"] as const;
export type C4Format = (typeof C4_FORMATS)[number];
export const C4_LEVELS = ["component", "container"] as const;
export type C4Level = (typeof C4_LEVELS)[number];

export interface C4Request {
  format: C4Format;
  level: C4Level;
  /** `component` only: the one layer whose modules are drawn; the modules of other layers they touch are `Component_Ext`. */
  layer?: string;
}

/** The repository as the container level's one node: the ID its brief has (`explanationOf`), never one of the snapshot. */
const SYSTEM = SYSTEM_ID;

/** The first line of a written diagram: `export c4 --out` replaces only a file that starts with it. */
export function c4Marker(format: C4Format): string {
  return `${format === "plantuml" ? "'" : "%%"} keylang:generated — keylang export c4`;
}

/** The text is a diagram `export c4` wrote: its first non-empty line is the marker of either format. */
export function isC4Diagram(text: string): boolean {
  const first = text.replace(/^﻿/, "").split(/\r?\n/).find((line) => line.trim() !== "");
  return first !== undefined && C4_FORMATS.some((format) => first.trim() === c4Marker(format));
}

/** Text in the double quotes of a C4 macro: one line, its double quotes made single. */
function quoted(text: string): string {
  return `"${text.replace(/\s+/g, " ").replaceAll('"', "'").trim()}"`;
}

/** Aliases a diagram can use for IDs: letters, digits and `_`, distinct even where two IDs map to one. */
function aliases(): (id: string) => string {
  const byId = new Map<string, string>();
  const used = new Set<string>();
  return (id) => {
    const known = byId.get(id);
    if (known !== undefined) return known;
    const base = `n_${id.replace(/[^A-Za-z0-9_]/g, "_")}`;
    let alias = base;
    for (let n = 2; used.has(alias); n++) alias = `${base}_${n}`;
    used.add(alias);
    byId.set(id, alias);
    return alias;
  };
}

/** Edges between two drawn units, by kind. */
interface Rel {
  from: string;
  to: string;
  kinds: Map<string, number>;
}

/** `call ×3, import ×1`: the kinds of the edges a relation sums up, by name. */
function relLabel(rel: Rel): string {
  return [...rel.kinds]
    .sort(([a], [b]) => compareText(a, b))
    .map(([kind, count]) => `${kind} ×${count}`)
    .join(", ");
}

/**
 * The diagram of `request` over the snapshot. `brief` gives the text of a
 * node, a layer or the repository (`@system`), or null without one. Throws on
 * a layer the snapshot does not have, naming the layers it has.
 *
 * `component`: a boundary per layer with its modules as components and the
 * relations between modules of different layers; with `layer`, the modules
 * of that layer, the relations that touch them (inside the layer too) and the
 * modules of other layers on their far end as `Component_Ext`. `container`:
 * the repository as one container in its system boundary. Both draw the
 * packages the drawn code uses as `System_Ext`. Code outside the layers is
 * left out; edges keylang did not resolve are counted in a comment.
 */
export function renderC4(snapshot: AnalysisSnapshot, brief: (id: string) => string | null, request: C4Request): string {
  const alias = aliases();
  const nodes = snapshot.nodes;
  const name = snapshot.system.name ?? "repository";
  const layers = Object.keys(snapshot.manifest.config.layers).filter((layer) => nodes[layer]?.kind === "layer");
  if (request.layer !== undefined && !layers.includes(request.layer)) throw new Error(`export c4: no layer \`${request.layer}\`; layers: ${layers.join(", ")}`);
  const container = request.level === "container";
  const plantuml = request.format === "plantuml";
  const comment = plantuml ? "'" : "%%";

  // The drawn unit of a node: its package, else the repository (container) or its layer's top module (component).
  const packageOf = (id: string): string | null => (id.startsWith(`${EXTERNAL}.`) ? id.split(".").slice(0, 2).join(".") : null);
  const topModules = new Map<string, string[]>();
  for (const [id, node] of Object.entries(nodes)) {
    if (node.kind !== "module" || !layers.includes(node.layer)) continue;
    if (nodes[id.slice(0, id.lastIndexOf("."))]?.kind !== "layer") continue;
    topModules.set(node.layer, [...(topModules.get(node.layer) ?? []), id]);
  }
  for (const list of topModules.values()) list.sort(compareText);
  const layerOf = (id: string): string | null => {
    const layer = nodes[id]?.layer;
    return layer !== undefined && layers.includes(layer) ? layer : null;
  };
  const unitOf = (id: string): string | null => {
    const pkg = packageOf(id);
    if (pkg !== null) return pkg;
    const layer = layerOf(id);
    if (layer === null) return null;
    if (container) return SYSTEM;
    return (topModules.get(layer) ?? []).find((top) => id === top || id.startsWith(`${top}.`)) ?? null;
  };
  const inScope = (unit: string): boolean => request.layer === undefined || layerOf(unit) === request.layer;

  const rels = new Map<string, Rel>();
  const packages = new Set<string>();
  const outside = new Set<string>();
  let unresolved = 0;
  for (const edge of snapshot.edges) {
    const from = unitOf(edge.source);
    // Code outside the layers is not drawn; nothing starts at a package.
    if (from === null || packageOf(from) !== null) continue;
    if (edge.target === null) {
      if (inScope(from)) unresolved++;
      continue;
    }
    const to = unitOf(edge.target);
    if (to === null || to === from) continue;
    const toPackage = packageOf(to) !== null;
    if (request.layer === undefined) {
      // All layers at once: a relation crosses a layer, else the diagram is every edge of the map.
      if (!container && !toPackage && layerOf(from) === layerOf(to)) continue;
    } else if (!inScope(from) && (toPackage || !inScope(to))) continue;
    if (toPackage) packages.add(to);
    else if (!inScope(to)) outside.add(to);
    if (!inScope(from)) outside.add(from);
    const key = `${from}\0${to}`;
    let rel = rels.get(key);
    if (!rel) rels.set(key, (rel = { from, to, kinds: new Map() }));
    rel.kinds.set(edge.kind, (rel.kinds.get(edge.kind) ?? 0) + 1);
  }

  const text = (id: string): string => quoted(brief(id) ?? "");
  const out: string[] = [c4Marker(request.format)];
  if (!plantuml) out.push("%% Mermaid C4 is experimental: https://mermaid.js.org/syntax/c4.html");
  out.push(plantuml ? "@startuml" : container ? "C4Container" : "C4Component");
  if (plantuml) out.push(`!include <C4/${container ? "C4_Container" : "C4_Component"}>`);
  out.push(`title ${quoted(`${name} — ${container ? "containers" : request.layer !== undefined ? `components of ${request.layer}` : "components"}`).slice(1, -1)}`, "");
  if (container) {
    out.push(`System_Boundary(${alias("@boundary")}, ${quoted(name)}) {`);
    out.push(`  Container(${alias(SYSTEM)}, ${quoted(name)}, ${quoted(snapshot.manifest.config.languages.join(", "))}, ${text(SYSTEM)})`);
    out.push("}");
  } else {
    for (const layer of layers) {
      if (request.layer !== undefined && layer !== request.layer) continue;
      const about = brief(layer);
      // C4-PlantUML takes a boundary's description since v2.10; Mermaid has none, so the brief is a comment there.
      if (!plantuml && about !== null) out.push(`%% ${layer}: ${about.replace(/\s+/g, " ").trim()}`);
      out.push(`Container_Boundary(${alias(layer)}, ${quoted(layer)}${plantuml && about !== null ? `, $descr=${quoted(about)}` : ""}) {`);
      for (const id of topModules.get(layer) ?? []) out.push(`  Component(${alias(id)}, ${quoted(id.slice(layer.length + 1))}, ${quoted(nodes[id]?.file ?? "module")}, ${text(id)})`);
      out.push("}");
    }
    for (const id of [...outside].sort(compareText)) out.push(`Component_Ext(${alias(id)}, ${quoted(id)}, ${quoted(nodes[id]?.file ?? "module")}, ${text(id)})`);
  }
  for (const id of [...packages].sort(compareText)) out.push(`System_Ext(${alias(id)}, ${quoted(nodes[id]?.comment ?? id.slice(EXTERNAL.length + 1))}, "package")`);
  out.push("");
  for (const rel of [...rels.values()].sort((a, b) => compareText(a.from, b.from) || compareText(a.to, b.to))) out.push(`Rel(${alias(rel.from)}, ${alias(rel.to)}, ${quoted(relLabel(rel))})`);
  if (unresolved > 0) out.push(`${comment} ${unresolved} edge(s) keylang did not resolve are not drawn`);
  if (plantuml) out.push("@enduml");
  return `${out.join("\n")}\n`;
}
