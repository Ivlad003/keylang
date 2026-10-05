// Snapshot → generated `map/<layer>.md` files, and the explained map: the same
// tree with an explanation under every node (ADR 0004).

import { posix } from "node:path";
import { modelName, SYSTEM_ID, type NodeExplanation } from "./explanations.ts";
import { EXTERNAL } from "./graph.ts";
import { compareText } from "./span.ts";
import type { AnalysisSnapshot, SnapshotEdge, SnapshotNode } from "./snapshot.ts";

export const GENERATED_MARK = "<!-- keylang:generated — не редагувати, `keylang map` -->";

/** True when the first non-empty line is a generator marker. The text after `keylang:generated` may vary. */
export function isGeneratedMap(text: string): boolean {
  const line = text.replace(/^\uFEFF/, "").split(/\r?\n/).find((l) => l.trim() !== "");
  return line !== undefined && line.startsWith("<!--") && line.includes("keylang:generated");
}

/**
 * Markdown link target relative to a map file. `mapDir` and `filePath` are
 * POSIX paths from the repository root (`keylang/map`, `src/a.ts`).
 * Each segment except `.` and `..` is percent-encoded so `(`, `)`, spaces and `#` survive round-trip.
 * `encodeURIComponent` leaves parentheses; they still terminate a Markdown link, so they are encoded too.
 */
export function codeHref(mapDir: string, filePath: string, line: number): string {
  const rel = posix.relative(mapDir, filePath);
  const encoded = rel
    .split("/")
    .map((seg) => (seg === "." || seg === ".." ? seg : encodeSegment(seg)))
    .join("/");
  return `${encoded}#L${line}`;
}

function encodeSegment(seg: string): string {
  return encodeURIComponent(seg).replaceAll("(", "%28").replaceAll(")", "%29");
}

/** One Markdown document per layer, keyed by file name (`domain.md`). `mapDir` is where those files are written, relative to the repo root. */
export function renderMap(snapshot: AnalysisSnapshot, mapDir: string): Map<string, string> {
  return renderLayers({ snapshot, children: childrenByParent(snapshot), mapDir, explain: null });
}

/** A node's explanation for the explained map; null leaves the node without text. */
export type ExplainNode = (id: string) => NodeExplanation | null;

/**
 * The explained map: the tree of `renderMap` for reading on GitHub and in an
 * editor. Every node has an anchor and, when it has an explanation, the text
 * on its description line; `calls` and dependency targets link to the anchor
 * of their node; each layer file opens with its modules, and `README.md` is
 * the start page with counts per layer and an index of modules and classes.
 * `mapDir` is the explained map's own directory, so links to code start from there.
 */
export function renderExplainedMap(snapshot: AnalysisSnapshot, mapDir: string, explain: ExplainNode): Map<string, string> {
  const children = childrenByParent(snapshot);
  const out = renderLayers({ snapshot, children, mapDir, explain });
  out.set("README.md", renderReadme(snapshot, children, explain));
  return out;
}

interface Render {
  snapshot: AnalysisSnapshot;
  children: Map<string, string[]>;
  mapDir: string;
  /** Set for the explained map. */
  explain: ExplainNode | null;
}

function renderLayers(r: Render): Map<string, string> {
  const out = new Map<string, string>();
  for (const layerId of layerIds(r.snapshot)) {
    let s = `${GENERATED_MARK}\n\n${r.explain ? `${contents(r, layerId)}\n\n` : ""}# map\n\n- ${layerId}\n${describe(r, layerId, 1)}`;
    for (const id of sortIds(r.snapshot, r.children.get(layerId) ?? [])) s += renderModule(r, id, 1);
    out.set(`${layerId}.md`, s);
  }
  return out;
}

function layerIds(snapshot: AnalysisSnapshot): string[] {
  return Object.keys(snapshot.nodes).filter((id) => snapshot.nodes[id]?.kind === "layer").sort();
}

/**
 * The anchor of a node in the explained map: its ID, with every character
 * other than an ASCII letter, digit, `.`, `_` or `-` written as `~<hex>~` (its
 * code point). GitHub keeps such an `id` as written, and `~` never occurs in
 * an ID, so two IDs never share an anchor.
 */
export function anchorOf(id: string): string {
  return [...id].map((ch) => (/[A-Za-z0-9._-]/.test(ch) ? ch : `~${ch.codePointAt(0)!.toString(16)}~`)).join("");
}

/** A link to the node's anchor in its layer file; the bare ID in the canonical map. */
function ref(r: Render, id: string): string {
  if (!r.explain) return id;
  const layer = r.snapshot.nodes[id]?.layer ?? id.split(".")[0]!;
  return `[${id}](${layer}.md#${anchorOf(id)})`;
}

/** The first lines of a layer file: back to the start page, and every module of the layer, in map order. */
function contents(r: Render, layerId: string): string {
  const modules: string[] = [];
  const visit = (id: string): void => {
    const node = r.snapshot.nodes[id];
    if (node?.kind !== "module" || node.class) return;
    modules.push(`[${id.slice(layerId.length + 1)}](#${anchorOf(id)})`);
    for (const child of sortIds(r.snapshot, r.children.get(id) ?? [])) visit(child);
  };
  for (const id of sortIds(r.snapshot, r.children.get(layerId) ?? [])) visit(id);
  return `[README](README.md)${modules.length > 0 ? ` · modules: ${modules.join(" · ")}` : ""}`;
}

/**
 * The description line of a node at `depth`: in the explained map its anchor
 * and its explanation, if any; nothing in the canonical map.
 */
function describe(r: Render, id: string, depth: number): string {
  if (!r.explain) return "";
  const e = r.explain(id);
  return `${"  ".repeat(depth)}<a id="${anchorOf(id)}"></a>${e === null ? "" : descriptionText(e, (other) => (r.snapshot.nodes[other] ? ref(r, other) : null))}\n`;
}

/**
 * The text of a description line: `<br>` so a Markdown viewer starts it on a
 * line of its own, the explanation, and for a brief from a model its origin.
 * The text never starts a block (a list item, a heading, a quote, a fence),
 * and `<` outside code is `&lt;`, so no HTML in it (`Promise<void>`, a stray
 * `<details>`, `<!--`) hides text or opens a comment: the file stays the same
 * keylang and GitHub shows the words written. `link` turns an ID in backticks
 * into a link; one it does not know (a model's invention) stays plain code.
 */
export function descriptionText(e: NodeExplanation, link: (id: string) => string | null = () => null): string {
  let text = e.text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(`[^`]*`)/)
    .map((part, i) => (i % 2 === 1 ? part : part.replaceAll("<", "&lt;").replaceAll("-->", "--&gt;")))
    .join("");
  if (/^\d+[.)]/.test(text)) text = text.replace(/^(\d+)([.)])/, "$1\\$2");
  else if (/^(?:[-*+_=#>|]|~~~|```)/.test(text)) text = `\\${text}`;
  text = text.replace(/`([\p{L}_$][\p{L}\p{M}\p{N}_$-]*(?:\.[\p{L}_$][\p{L}\p{M}\p{N}_$-]*)+)`/gu, (code, id: string) => {
    const target = link(id);
    return target === null ? code : target.replace(/^\[([^\]]*)\]/, "[`$1`]");
  });
  const origin = e.origin === "llm" ? ` _(llm · ${modelName(e.agent ?? "?")} · ${e.date ?? "?"}${e.stale ? " · stale" : ""})_` : "";
  return `<br>${text}${origin}`;
}

/** Explanation counts of the nodes of one layer (the layer included). */
interface Counts {
  doc: number;
  llm: number;
  stale: number;
  none: number;
}

function renderReadme(snapshot: AnalysisSnapshot, children: Map<string, string[]>, explain: ExplainNode): string {
  const r: Render = { snapshot, children, mapDir: "", explain };
  const counts = new Map<string, Counts>();
  for (const [id, node] of Object.entries(snapshot.nodes)) {
    if (node.layer === EXTERNAL) continue;
    let c = counts.get(node.layer);
    if (!c) counts.set(node.layer, (c = { doc: 0, llm: 0, stale: 0, none: 0 }));
    const e = explain(id);
    if (e === null) c.none++;
    else if (e.origin === "doc") c.doc++;
    else if (e.stale) c.stale++;
    else c.llm++;
  }
  const total: Counts = { doc: 0, llm: 0, stale: 0, none: 0 };
  const rows: string[] = [];
  for (const layer of layerIds(snapshot)) {
    const c = counts.get(layer);
    const e = explain(layer);
    const text = e === null ? "" : descriptionText(e, (id) => (snapshot.nodes[id] ? ref(r, id) : null)).slice("<br>".length).replaceAll("|", "\\|");
    if (!c) {
      rows.push(`| [${layer}](${layer}.md) | ${text} | | | | |`);
      continue;
    }
    for (const key of ["doc", "llm", "stale", "none"] as const) total[key] += c[key];
    rows.push(`| [${layer}](${layer}.md) | ${text} | ${c.doc} | ${c.llm} | ${c.stale} | ${c.none} |`);
  }
  return [
    GENERATED_MARK,
    "",
    ...systemSection(r),
    "## Explained map",
    "",
    "The tree of the map with a brief under each node: the documentation comment from the code, or a brief a model wrote, marked _(llm · model · date)_ and _stale_ once the code under it changed. `keylang map` writes it from the code and `explain/brief/`; it never asks a model.",
    "",
    "| Layer | Explanation | Code | LLM | LLM, stale | None |",
    "|---|---|---|---|---|---|",
    ...rows,
    `| **all** | | ${total.doc} | ${total.llm} | ${total.stale} | ${total.none} |`,
    "",
    "## Index",
    "",
    "Modules and classes by name; the parent ID follows each one.",
    "",
    ...index(r),
  ].join("\n");
}

/**
 * The start of the start page: what the repository is (the system level of
 * C4), under its manifest name. The words come from the README or a manifest,
 * named after them, else from a model's brief with its origin; without
 * either, a dash and how to ask for a brief.
 */
function systemSection(r: Render): string[] {
  const name = (r.snapshot.system?.name ?? "Repository").replaceAll("<", "&lt;");
  const e = r.explain?.(SYSTEM_ID) ?? null;
  if (e === null) return [`## ${name}`, "", "— Neither a README paragraph nor a manifest description says what this repository is; `keylang explain --missing --llm` asks a model for a brief.", ""];
  const text = descriptionText(e, (id) => (r.snapshot.nodes[id] ? ref(r, id) : null)).slice("<br>".length);
  return [`## ${name}`, "", `${text}${e.origin === "doc" && e.source ? ` _(${e.source})_` : ""}`, ""];
}

/** One paragraph per first letter: every module and class of the repository (packages left out), by name. */
function index(r: Render): string[] {
  const entries = Object.entries(r.snapshot.nodes)
    .filter(([, node]) => node.kind === "module" && node.layer !== EXTERNAL)
    .map(([id]) => ({ id, name: nameOf(id), parent: id.slice(0, id.lastIndexOf(".")) }))
    // Code-unit order of the lowercase names: the same on every Node, whatever its ICU.
    .sort((a, b) => compareText(a.name.toLowerCase(), b.name.toLowerCase()) || compareText(a.id, b.id));
  const groups = new Map<string, string[]>();
  for (const e of entries) {
    const letter = [...e.name][0]!.toUpperCase();
    const layer = r.snapshot.nodes[e.id]!.layer;
    const line = `[${e.name}](${layer}.md#${anchorOf(e.id)}) (${e.parent})`;
    const group = groups.get(letter);
    if (group) group.push(line);
    else groups.set(letter, [line]);
  }
  return [...groups].flatMap(([letter, lines]) => [`**${letter}** · ${lines.join(" · ")}`, ""]);
}


function childrenByParent(snapshot: AnalysisSnapshot): Map<string, string[]> {
  const children = new Map<string, string[]>();
  for (const id of Object.keys(snapshot.nodes)) {
    const dot = id.lastIndexOf(".");
    if (dot === -1) continue;
    const parent = id.slice(0, dot);
    const list = children.get(parent);
    if (list) list.push(id);
    else children.set(parent, [id]);
  }
  return children;
}

/**
 * Children by file (a directory module by its name), then by line. Code-unit
 * order, as the index and the snapshot sort: ICU collation differs between
 * Node builds, and the map's bytes must not.
 */
function sortIds(snapshot: AnalysisSnapshot, ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => {
    const na = snapshot.nodes[a];
    const nb = snapshot.nodes[b];
    const ka = na?.file ?? nameOf(a);
    const kb = nb?.file ?? nameOf(b);
    return compareText(ka, kb) || (na?.line ?? 0) - (nb?.line ?? 0);
  });
}

function nameOf(id: string): string {
  return id.slice(id.lastIndexOf(".") + 1);
}

function linkedName(mapDir: string, node: SnapshotNode, name: string): string {
  if (!node.file || node.line === null) return name;
  return `[${name}](${codeHref(mapDir, node.file, node.line)})`;
}

function renderModule(r: Render, id: string, depth: number): string {
  const { snapshot, mapDir } = r;
  const node = snapshot.nodes[id];
  if (!node) return "";
  const pad = "  ".repeat(depth);
  let head = linkedName(mapDir, node, nameOf(id));
  if (node.comment) head += ` <!-- ${node.comment} -->`;
  let s = `${pad}- module ${head}\n${describe(r, id, depth + 1)}`;
  for (const edge of depsOf(snapshot, id)) s += `${pad}  - ${edge.alias} ${ref(r, edge.target!)}\n`;
  const nested = r.children.get(id) ?? [];
  const body = sortIds(snapshot, nested);
  for (const childId of body) {
    const child = snapshot.nodes[childId];
    if (!child) continue;
    if (child.kind === "module") s += renderModule(r, childId, depth + 1);
    else s += renderDecl(r, childId, child, depth + 1);
  }
  return s;
}

/** Edges by source, built once per snapshot: each module and declaration reads its own, not the whole list. */
const edgesBySource = new WeakMap<AnalysisSnapshot, Map<string, SnapshotEdge[]>>();

function edgesFrom(snapshot: AnalysisSnapshot, id: string): readonly SnapshotEdge[] {
  let index = edgesBySource.get(snapshot);
  if (!index) {
    index = new Map();
    for (const edge of snapshot.edges) {
      const list = index.get(edge.source);
      if (list) list.push(edge);
      else index.set(edge.source, [edge]);
    }
    edgesBySource.set(snapshot, index);
  }
  return index.get(id) ?? [];
}

/** One line per dependency alias: an import and a re-export of one module are one dependency with two edges. */
function depsOf(snapshot: AnalysisSnapshot, id: string): SnapshotEdge[] {
  const edges = edgesFrom(snapshot, id)
    .filter((e) => e.source === id && (e.kind === "import" || e.kind === "reexport") && e.resolution === "resolved" && e.alias && e.target)
    .sort((a, b) => a.line - b.line);
  const seen = new Set<string | undefined>();
  return edges.filter((e) => !seen.has(e.alias) && seen.add(e.alias));
}

function renderDecl(r: Render, id: string, node: SnapshotNode, depth: number): string {
  const { snapshot, mapDir } = r;
  const pad = "  ".repeat(depth);
  const keyword = node.kind === "type" ? "type" : "fn";
  let head = linkedName(mapDir, node, nameOf(id));
  if (node.signature) head += ` ${node.signature}`;
  if (node.exported === false) head += " <!-- internal -->";
  let s = `${pad}- ${keyword} ${head}\n${describe(r, id, depth + 1)}`;
  const calls = edgesFrom(snapshot, id)
    // An injected value is the caller's choice, not this function's code; a self-call is not a dependency.
    .filter((e) => e.source === id && e.kind === "call" && e.resolution === "resolved" && e.target && e.target !== id && e.via !== "injected")
    .sort((a, b) => a.line - b.line);
  if (calls.length > 0) s += `${pad}  - calls ${[...new Set(calls.map((c) => c.target!))].map((target) => ref(r, target)).join(", ")}\n`;
  return s;
}
