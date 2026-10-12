// The difference between two analyses of one repository (`keylang diff`,
// `GET /api/graph-diff`): which modules (and with `fn`, functions) were added,
// removed or changed, which dependency edges (and calls) appeared or went,
// which flow steps changed, which findings are new or fixed, and how the
// specs were weakened (K108). A pure function of the two analyses: no git, no
// file, the same inputs give the same JSON, sorted by ID or key.
//
// A change is read from what the code is, never where it sits: a node's
// fingerprint, signature, dependencies, layer and file — not its line. A
// finding is matched by code, criterion and area (and its verdict and message
// with positions taken out), so a rule that moved a line is no new finding.
//
// Sits after `analyze` (snapshot + SpecIR + verdicts) in features; formats
// and the diagram are in graph-diff-format.ts. Entry points: `graphDiff`,
// `newFails`, and the types.

import { createHash } from "node:crypto";
import type { Analysis } from "./analyze.ts";
import { checkReport, type CheckResult } from "./check-results.ts";
import { planItems } from "./feature-status.ts";
import type { Document } from "./ir.ts";
import type { AnalysisSnapshot, SnapshotNode } from "./snapshot.ts";
import { compareText } from "./span.ts";
import type { Revision } from "./revision-tree.ts";
import { specWeakenings, type Weakening } from "./weakening.ts";

/** How deep the diff goes: modules and their dependencies, or also functions and their calls. */
export type DiffLevel = "module" | "fn";

export const DIFF_LEVELS: readonly DiffLevel[] = ["module", "fn"];

/** Whether `text` names a diff level. */
export function isDiffLevel(text: string): text is DiffLevel {
  return DIFF_LEVELS.some((level) => level === text);
}

/** What changed in a node that is in both analyses. */
export type NodeChange = "signature" | "body" | "deps" | "layer" | "file";

/** A node added, removed or changed. */
export interface DiffNode {
  id: string;
  kind: "module" | "fn";
  status: "added" | "removed" | "changed";
  /** The head's file, else the base's; null for a package. */
  file: string | null;
  /** The head's layer, else the base's. */
  layer: string;
  /** For `changed`: what changed, in a fixed order; empty otherwise. */
  changes: NodeChange[];
}

/** A dependency between modules (`dep`) or a call between functions (`call`) that appeared or went. */
export interface DiffEdge {
  source: string;
  target: string;
  kind: "dep" | "call";
  status: "added" | "removed";
}

/** A flow added, removed, or with steps that appeared or went (keys of `planItems`, parents joined by ` › `). */
export interface DiffFlow {
  name: string;
  status: "added" | "removed" | "changed";
  steps: { key: string; status: "added" | "removed" }[];
}

/** A finding (a check result that is not ok) the head has and the base has not (`new`), or the other way (`fixed`). */
export interface DiffFinding {
  code: string | null;
  criterion: string;
  area: string;
  verdict: CheckResult["verdict"];
  message: string;
  /** The side's position: the head's for `new`, the base's for `fixed`. */
  file: string;
  line: number;
  status: "new" | "fixed";
}

/** One side of the diff as the reports name it. */
export interface DiffSide {
  ref: string;
  commit: string | null;
  short: string | null;
  subject: string | null;
  label: string;
}

/** The whole difference, every list sorted by ID or key. */
export interface GraphDiff {
  base: DiffSide;
  head: DiffSide;
  level: DiffLevel;
  nodes: DiffNode[];
  edges: DiffEdge[];
  flows: DiffFlow[];
  findings: DiffFinding[];
  /** K108: how the specs got weaker from the base to the head. */
  weakenings: Weakening[];
}

/** The difference between the `base` and `head` analyses at `level`. Pure. */
export function graphDiff(input: { base: Analysis; head: Analysis; baseRevision: Revision; headRevision: Revision; level: DiffLevel }): GraphDiff {
  const { base, head, level } = input;
  const baseGraph = graphOf(base.snapshot, level);
  const headGraph = graphOf(head.snapshot, level);

  return {
    base: sideOf(input.baseRevision),
    head: sideOf(input.headRevision),
    level,
    nodes: nodeDiff(baseGraph, headGraph),
    edges: edgeDiff(baseGraph.edges, headGraph.edges),
    flows: flowDiff(base, head),
    findings: findingDiff(base, head),
    weakenings: specWeakenings(ownSpecs(base), ownSpecs(head), head.config.dir, input.baseRevision.label),
  };
}

/** Whether the diff brings a new failure: a new `fail` finding or a weakened spec (K108). */
export function newFails(diff: GraphDiff): number {
  return diff.findings.filter((finding) => finding.status === "new" && finding.verdict === "fail").length + diff.weakenings.length;
}

function sideOf(revision: Revision): DiffSide {
  return { ref: revision.ref, commit: revision.commit, short: revision.short, subject: revision.subject, label: revision.label };
}

/** What a node is, for comparing: everything a change is read from, lines left out. */
interface NodeFacts {
  kind: "module" | "fn";
  layer: string;
  file: string | null;
  signature: string | null;
  /** A digest of the body: a fn's fingerprint; a module's values and the fingerprints of its members. */
  body: string;
  /** Sorted dependencies (a module) or calls (a fn). */
  deps: string[];
}

/** The nodes and edges of one snapshot at a level. */
interface LevelGraph {
  nodes: Map<string, NodeFacts>;
  /** `source\0target\0kind`. */
  edges: Set<string>;
}

/**
 * The module (and fn) nodes of a snapshot and their edges: a module's
 * dependencies (`deps`), and at `fn` a fn's calls. A module's body digest
 * covers its values and every fn and type it holds, so a changed function
 * shows on its module at the module level too.
 */
function graphOf(snapshot: AnalysisSnapshot | null, level: DiffLevel): LevelGraph {
  const nodes = new Map<string, NodeFacts>();
  const edges = new Set<string>();

  if (snapshot === null) return { nodes, edges };
  const all = snapshot.nodes;
  // Members by the module that holds them: the longest prefix of the ID that is a module.
  const members = new Map<string, string[]>();

  for (const [id, node] of Object.entries(all)) {
    if (node.kind !== "fn" && node.kind !== "type") continue;
    const owner = moduleOf(all, id);

    if (owner === null) continue;
    members.set(owner, [...(members.get(owner) ?? []), `${id}\0${node.fingerprint ?? ""}\0${node.signature ?? ""}`]);
  }

  // Sorted by ID, so the body digests and the edges come out the same every run.
  for (const id of Object.keys(all).sort(compareText)) {
    const node = all[id]!;

    if (node.kind === "module") {
      const deps = [...(node.deps ?? [])].sort(compareText);
      const body = digest([node.values ?? "", ...(members.get(id) ?? []).sort(compareText)]);
      nodes.set(id, factsOf("module", node, body, deps));

      for (const dep of deps) edges.add(`${id}\0${dep}\0dep`);
    } else if (node.kind === "fn" && level === "fn") {
      const calls = [...new Set(node.calls ?? [])].sort(compareText);
      nodes.set(id, factsOf("fn", node, node.fingerprint ?? "", calls));

      for (const call of calls) edges.add(`${id}\0${call}\0call`);
    }
  }

  return { nodes, edges };
}

function factsOf(kind: NodeFacts["kind"], node: SnapshotNode, body: string, deps: string[]): NodeFacts {
  return { kind, layer: node.layer, file: node.file, signature: node.signature ?? null, body, deps };
}

/** The module `id` lies in: itself or its longest prefix that is a module node; null when none is. */
function moduleOf(nodes: AnalysisSnapshot["nodes"], id: string): string | null {
  let at = id.lastIndexOf(".");

  // Walk up the dotted ID; a class is a module too, so a method belongs to its class.
  while (at > 0) {
    const prefix = id.slice(0, at);

    if (nodes[prefix]?.kind === "module") return prefix;
    at = prefix.lastIndexOf(".");
  }

  return null;
}

function digest(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("\n")).digest("hex");
}

/** Added, removed and changed nodes, sorted by ID. */
function nodeDiff(base: LevelGraph, head: LevelGraph): DiffNode[] {
  const out: DiffNode[] = [];
  const ids = [...new Set([...base.nodes.keys(), ...head.nodes.keys()])].sort(compareText);

  for (const id of ids) {
    const before = base.nodes.get(id);
    const after = head.nodes.get(id);

    if (before === undefined && after !== undefined) out.push({ id, kind: after.kind, status: "added", file: after.file, layer: after.layer, changes: [] });
    else if (after === undefined && before !== undefined) out.push({ id, kind: before.kind, status: "removed", file: before.file, layer: before.layer, changes: [] });
    else if (before !== undefined && after !== undefined) {
      // What changed, in the order of `NodeChange`.
      const changes: NodeChange[] = [];

      if (before.signature !== after.signature) changes.push("signature");

      if (before.body !== after.body) changes.push("body");

      if (before.deps.join("\n") !== after.deps.join("\n")) changes.push("deps");

      if (before.layer !== after.layer) changes.push("layer");

      if (before.file !== after.file) changes.push("file");

      if (changes.length > 0) out.push({ id, kind: after.kind, status: "changed", file: after.file, layer: after.layer, changes });
    }
  }

  return out;
}

/** Edges only one side has, sorted by `source→target:kind`. */
function edgeDiff(base: ReadonlySet<string>, head: ReadonlySet<string>): DiffEdge[] {
  const edge = (key: string, status: DiffEdge["status"]): DiffEdge => {
    // SAFETY: every key is `source\0target\0kind` with kind `dep` or `call` (graphOf), and IDs hold no NUL.
    const [source, target, kind] = key.split("\0") as [string, string, DiffEdge["kind"]];

    return { source, target, kind, status };
  };

  const out = [...[...head].flatMap((key) => (base.has(key) ? [] : [edge(key, "added")])), ...[...base].flatMap((key) => (head.has(key) ? [] : [edge(key, "removed")]))];

  return out.sort((a, b) => compareText(edgeKey(a), edgeKey(b)) || compareText(a.status, b.status));
}

/** The key an edge is known by: `source→target:kind`. */
export function edgeKey(edge: Pick<DiffEdge, "source" | "target" | "kind">): string {
  return `${edge.source}→${edge.target}:${edge.kind}`;
}

/** Flows of hand-written specs whose plan items differ, by name. */
function flowDiff(base: Analysis, head: Analysis): DiffFlow[] {
  // Each flow's plan items as display keys; a name declared twice keeps its first flow (K002 says so).
  const itemsOf = (analysis: Analysis): Map<string, string[]> => {
    const flows = new Map<string, string[]>();

    for (const flow of analysis.spec.flows) if (!flows.has(flow.name)) flows.set(flow.name, planItems(flow).map(({ key }) => key.split("\0").slice(1).join(" › ")));

    return flows;
  };

  const before = itemsOf(base);
  const after = itemsOf(head);
  const out: DiffFlow[] = [];

  for (const name of [...new Set([...before.keys(), ...after.keys()])].sort(compareText)) {
    const was = before.get(name);
    const now = after.get(name);
    // Steps as multisets: a step kept twice and removed once is one removal.
    const steps = [...multisetMinus(now ?? [], was ?? []).map((key) => ({ key, status: "added" as const })), ...multisetMinus(was ?? [], now ?? []).map((key) => ({ key, status: "removed" as const }))].sort((a, b) => compareText(a.key, b.key) || compareText(a.status, b.status));

    if (was === undefined) out.push({ name, status: "added", steps });
    else if (now === undefined) out.push({ name, status: "removed", steps });
    else if (steps.length > 0) out.push({ name, status: "changed", steps });
  }

  return out;
}

/** The items of `from` left after taking out one occurrence per item of `take`. */
function multisetMinus(from: readonly string[], take: readonly string[]): string[] {
  const left = new Map<string, number>();

  for (const item of take) left.set(item, (left.get(item) ?? 0) + 1);

  return from.filter((item) => {
    const count = left.get(item) ?? 0;

    if (count === 0) return true;
    left.set(item, count - 1);

    return false;
  });
}

/**
 * Findings (every check result but `ok`) only one side has. Two findings are
 * the same when code, criterion, area and verdict match and their messages
 * match with positions (`:12`, `line 12`) taken out, as a multiset: a rule
 * broken again from the same module is a new finding, one that moved a line is not.
 */
function findingDiff(base: Analysis, head: Analysis): DiffFinding[] {
  const findingsOf = (analysis: Analysis): CheckResult[] => checkReport(analysis.verdicts, analysis.snapshot?.snapshotId ?? null, analysis.diagnostics).results.filter((result) => result.verdict !== "ok");
  const identity = (result: CheckResult): string => [result.code ?? "", result.criterion, result.area, result.verdict, withoutPositions(result.evidence)].join("\0");
  const before = findingsOf(base);
  const after = findingsOf(head);

  const pick = (from: readonly CheckResult[], against: readonly CheckResult[], status: DiffFinding["status"]): DiffFinding[] => {
    const left = new Map<string, number>();

    for (const result of against) left.set(identity(result), (left.get(identity(result)) ?? 0) + 1);

    return from.flatMap((result) => {
      const key = identity(result);
      const count = left.get(key) ?? 0;

      if (count > 0) {
        left.set(key, count - 1);

        return [];
      }

      return [{ code: result.code, criterion: result.criterion, area: result.area, verdict: result.verdict, message: result.evidence, file: result.file, line: result.line, status }];
    });
  };

  return [...pick(after, before, "new"), ...pick(before, after, "fixed")].sort(
    (a, b) => compareText(a.status, b.status) || compareText(a.code ?? "", b.code ?? "") || compareText(a.criterion, b.criterion) || compareText(a.area, b.area) || compareText(a.message, b.message),
  );
}

/** A message with its positions taken out: `file.md:12:3` → `file.md:#`, `line 12` → `line #`. */
function withoutPositions(message: string): string {
  return message.replace(/:\d+(?::\d+)?/g, ":#").replace(/\bline \d+/g, "line #");
}

/** A node of the picture of a diff: a changed one or a neighbour of one, with what the snapshots know of it. */
export interface SubgraphNode {
  id: string;
  kind: "module" | "fn";
  layer: string;
  file: string | null;
  line: number | null;
  /** null: unchanged, drawn as context. */
  diff: DiffNode["status"] | null;
}

/** An edge between two nodes of the picture; `diff` null when both sides have it. */
export interface SubgraphEdge {
  source: string;
  target: string;
  kind: DiffEdge["kind"];
  diff: DiffEdge["status"] | null;
}

/** The picture of a diff: what is drawn, and how many nodes did not fit. */
export interface DiffSubgraph {
  nodes: SubgraphNode[];
  edges: SubgraphEdge[];
  /** Nodes left out past the limit. */
  more: number;
}

/** At most this many nodes in the picture of a diff. */
export const SUBGRAPH_LIMIT = 60;

/**
 * The changed nodes and their neighbours one edge away (over the edges of
 * either side), changed ones first, each group by ID, at most `limit`; the
 * edges of either side between the nodes kept. Pure.
 */
export function diffSubgraph(diff: GraphDiff, base: Analysis, head: Analysis, limit: number = SUBGRAPH_LIMIT): DiffSubgraph {
  const baseGraph = graphOf(base.snapshot, diff.level);
  const headGraph = graphOf(head.snapshot, diff.level);
  const status = new Map(diff.nodes.map((node) => [node.id, node.status]));
  const changed = diff.nodes.map((node) => node.id);
  const allEdges = new Set([...baseGraph.edges, ...headGraph.edges]);
  const neighbours = new Set<string>();

  // One step from a changed node, either direction; only nodes of the level (a package is a module node too).
  for (const key of allEdges) {
    const [source = "", target = ""] = key.split("\0");
    const known = (id: string): boolean => headGraph.nodes.has(id) || baseGraph.nodes.has(id);

    if (status.has(source) && !status.has(target) && known(target)) neighbours.add(target);

    if (status.has(target) && !status.has(source) && known(source)) neighbours.add(source);
  }

  const order = [...changed, ...[...neighbours].sort(compareText)];
  const kept = order.slice(0, limit);
  const shown = new Set(kept);

  const nodes = kept.map((id): SubgraphNode => {
    // The head's facts first; a removed node is known only by the base.
    const facts = headGraph.nodes.get(id) ?? baseGraph.nodes.get(id)!;
    const code = head.snapshot?.nodes[id] ?? base.snapshot?.nodes[id];

    return { id, kind: facts.kind, layer: facts.layer, file: facts.file, line: code?.line ?? null, diff: status.get(id) ?? null };
  });

  const edges = [...allEdges]
    .flatMap((key): SubgraphEdge[] => {
      // SAFETY: every key is `source\0target\0kind` with kind `dep` or `call` (graphOf).
      const [source, target, kind] = key.split("\0") as [string, string, DiffEdge["kind"]];

      if (!shown.has(source) || !shown.has(target) || source === target) return [];
      const edgeDiffOf = headGraph.edges.has(key) && baseGraph.edges.has(key) ? null : headGraph.edges.has(key) ? "added" : "removed";

      return [{ source, target, kind, diff: edgeDiffOf }];
    })
    .sort((a, b) => compareText(edgeKey(a), edgeKey(b)));

  return { nodes, edges, more: order.length - kept.length };
}

/** The documents a person wrote: the rendered map and other generated files left out. */
function ownSpecs(analysis: Analysis): Document[] {
  return analysis.docs.filter((doc) => doc.generated === null);
}
