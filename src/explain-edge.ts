// The evidence between two ids of one snapshot (`keylang check
// --explain-edge <a> <b>`): the edges from `a` (or a node under it) to `b`,
// then back, or — with no edge — whether that absence is proven. Only the
// snapshot's own edges and coverage count; nothing is inferred from the map text.

import { leavesUnresolved, type AnalysisSnapshot, type CoverageItem, type SnapshotEdge } from "./snapshot.ts";
import { compareText } from "./span.ts";

/** One edge between the two ids: `forward` is `from → to`, `backward` is `to → from`. */
export interface EdgeEvidence {
  direction: "forward" | "backward";
  edge: SnapshotEdge;
}

/**
 * `edges`: at least one edge; `complete`: no edge and nothing unresolved in
 * `from` that could form one — the absence is proven; `unresolved`: no
 * confirmed edge, but constructs of `from` were not resolved, so it is not.
 */
export type EdgeConclusion = "edges" | "complete" | "unresolved";

export interface EdgeExplanation {
  from: string;
  to: string;
  /** `from → to` first, then `to → from`; each by kind, file, line, column, source. */
  edges: EdgeEvidence[];
  /** With no edge: the unresolved constructs in `from`, by file, line, column, reason. Empty when there are edges. */
  holes: CoverageItem[];
  conclusion: EdgeConclusion;
}

/** An id names a node or an ancestor of nodes (a layer or a directory), never an unknown tail under a known module. */
export function edgeIdKnown(snapshot: AnalysisSnapshot, id: string): boolean {
  return snapshot.nodes[id] !== undefined || Object.keys(snapshot.nodes).some((key) => key.startsWith(`${id}.`));
}

const under = (id: string, scope: string): boolean => id === scope || id.startsWith(`${scope}.`);

/** The edges and the coverage between two known ids (see `edgeIdKnown`). */
export function explainEdge(snapshot: AnalysisSnapshot, from: string, to: string): EdgeExplanation {
  const between =
    (a: string, b: string) =>
    (edge: SnapshotEdge): boolean =>
      under(edge.source, a) && ((edge.target !== null && under(edge.target, b)) || (edge.candidates ?? []).some((id) => under(id, b)));
  const forward = between(from, to);
  const backward = between(to, from);
  const edges = snapshot.edges
    .filter((edge) => forward(edge) || backward(edge))
    .sort((a, b) => Number(!forward(a)) - Number(!forward(b)) || compareText(a.kind, b.kind) || compareText(a.file ?? "", b.file ?? "") || a.line - b.line || a.col - b.col || compareText(a.source, b.source))
    .map((edge): EdgeEvidence => ({ direction: forward(edge) ? "forward" : "backward", edge }));
  if (edges.length > 0) return { from, to, edges, holes: [], conclusion: "edges" };
  const holes = snapshot.coverage
    .filter((item) => item.source !== null && under(item.source, from) && leavesUnresolved(item))
    .sort((a, b) => compareText(a.file, b.file) || a.line - b.line || a.col - b.col || compareText(a.reason, b.reason));
  return { from, to, edges, holes, conclusion: holes.length === 0 ? "complete" : "unresolved" };
}

/** One edge as the CLI prints it: kind, resolution, provenance, range, fragment, `source → target`, candidates, hook, reason. */
export function edgeLine(edge: SnapshotEdge): string {
  const via = edge.candidates?.length ? ` [${edge.candidates.join(", ")}]` : "";
  const hook = edge.via === "default" ? ` (default of the hook \`${edge.hook ?? ""}\`)` : edge.via === "injected" ? ` (injected as \`${edge.hook ?? ""}\` at ${edge.site ?? "?"})` : "";
  const fragment = edge.text ? ` \`${edge.text.replace(/\s+/g, " ")}\`` : "";
  return `${edge.kind} ${edge.resolution} ${edge.provenance} ${edge.file}:${edge.line}:${edge.col}-${edge.endLine}:${edge.endCol}${fragment} ${edge.source} → ${edge.target ?? "?"}${via}${hook}${edge.reason ? ` (${edge.reason})` : ""}`;
}

/** One unresolved construct as the CLI prints it. */
export function holeLine(hole: CoverageItem): string {
  return `unresolved ${hole.file}:${hole.line}:${hole.col} ${hole.reason}`;
}

/** The CLI's stdout of `check --explain-edge`, line by line. */
export function edgeExplanationLines(explanation: EdgeExplanation): string[] {
  if (explanation.conclusion === "edges") return explanation.edges.map(({ edge }) => edgeLine(edge));
  if (explanation.conclusion === "complete") return ["no edge, coverage complete"];
  return [`no confirmed edge; ${explanation.holes.length} unresolved construct(s) in \`${explanation.from}\` could form one`, ...explanation.holes.map(holeLine)];
}
