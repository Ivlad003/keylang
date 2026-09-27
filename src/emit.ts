// Snapshot → generated `map/<layer>.md` files.

import { posix } from "node:path";
import type { AnalysisSnapshot, SnapshotEdge, SnapshotNode } from "./snapshot.ts";

export const GENERATED_MARK = "<!-- keylang:generated — не редагувати, `keylang map` -->";

/** True when the first non-empty line is a generator marker. The text after `keylang:generated` may vary. */
export function isGeneratedMap(text: string): boolean {
  const line = text.split(/\r?\n/).find((l) => l.trim() !== "");
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
  const out = new Map<string, string>();
  const children = childrenByParent(snapshot);
  for (const layerId of Object.keys(snapshot.nodes).filter((id) => snapshot.nodes[id]?.kind === "layer").sort()) {
    let s = `${GENERATED_MARK}\n\n# map\n\n- ${layerId}\n`;
    for (const id of sortIds(snapshot, children.get(layerId) ?? [])) s += renderModule(snapshot, children, mapDir, id, 1);
    out.set(`${layerId}.md`, s);
  }
  return out;
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

function sortIds(snapshot: AnalysisSnapshot, ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => {
    const na = snapshot.nodes[a];
    const nb = snapshot.nodes[b];
    const ka = na?.file ?? nameOf(a);
    const kb = nb?.file ?? nameOf(b);
    return ka.localeCompare(kb, "en") || (na?.line ?? 0) - (nb?.line ?? 0);
  });
}

function nameOf(id: string): string {
  return id.slice(id.lastIndexOf(".") + 1);
}

function linkedName(mapDir: string, node: SnapshotNode, name: string): string {
  if (!node.file || node.line === null) return name;
  return `[${name}](${codeHref(mapDir, node.file, node.line)})`;
}

function renderModule(snapshot: AnalysisSnapshot, children: Map<string, string[]>, mapDir: string, id: string, depth: number): string {
  const node = snapshot.nodes[id];
  if (!node) return "";
  const pad = "  ".repeat(depth);
  let head = linkedName(mapDir, node, nameOf(id));
  if (node.comment) head += ` <!-- ${node.comment} -->`;
  let s = `${pad}- module ${head}\n`;
  for (const edge of depsOf(snapshot, id)) s += `${pad}  - ${edge.alias} ${edge.target}\n`;
  const nested = children.get(id) ?? [];
  const body = sortIds(snapshot, nested);
  for (const childId of body) {
    const child = snapshot.nodes[childId];
    if (!child) continue;
    if (child.kind === "module") s += renderModule(snapshot, children, mapDir, childId, depth + 1);
    else s += renderDecl(snapshot, mapDir, childId, child, depth + 1);
  }
  return s;
}

function depsOf(snapshot: AnalysisSnapshot, id: string): SnapshotEdge[] {
  return snapshot.edges
    .filter((e) => e.source === id && (e.kind === "import" || e.kind === "reexport") && e.resolution === "resolved" && e.alias && e.target)
    .sort((a, b) => a.line - b.line);
}

function renderDecl(snapshot: AnalysisSnapshot, mapDir: string, id: string, node: SnapshotNode, depth: number): string {
  const pad = "  ".repeat(depth);
  const keyword = node.kind === "type" ? "type" : "fn";
  let head = linkedName(mapDir, node, nameOf(id));
  if (node.signature) head += ` ${node.signature}`;
  if (node.exported === false) head += " <!-- internal -->";
  let s = `${pad}- ${keyword} ${head}\n`;
  const calls = snapshot.edges
    .filter((e) => e.source === id && e.kind === "call" && e.resolution === "resolved" && e.target)
    .sort((a, b) => a.line - b.line);
  if (calls.length > 0) s += `${pad}  - calls ${calls.map((c) => c.target).join(", ")}\n`;
  return s;
}
