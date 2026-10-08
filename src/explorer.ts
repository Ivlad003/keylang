// The entry explorer of `keylang web` (business-flows/22): one level of the
// call graph around an ID at a time, for a person reading old code before
// any flow is written. `callsOf` gives the direct callees of a fn (with the
// edge's `via` and `site`), the calls keylang did not resolve there (holes,
// with the reason), the direct callers and the entry points that reach it;
// the page expands the tree lazily, one request per opened row, both down
// and up. An event node (ADR 0022 п. 6, business-flows/08) reads the same
// way: its callers publish it, its callees subscribe. `explorerFlow` turns
// the branches a person ticked into a flow draft, which the server writes
// as one proposal. Pure over the snapshot (ADR 0014: a view, `check` never
// reads it).

import { EXTERNAL } from "./external-ids.ts";
import type { FlowDraft } from "./draft.ts";
import { isTriggerKind } from "./parser.ts";
import type { AnalysisSnapshot, CoverageItem, SnapshotEdge } from "./snapshot.ts";
import { compareText } from "./span.ts";

/** Where a call is written. */
export interface CallSite {
  file: string | null;
  line: number;
  col: number;
}

/** A callee or a caller: the other end of a resolved edge, with how the edge goes. */
export interface CallRef {
  id: string;
  /** The node's kind: `fn`, `module`, `type`, `event` (business-flows/08), `layer`; `unknown` for an ID the snapshot does not list. */
  kind: string;
  file: string | null;
  line: number | null;
  layer: string | null;
  /** A package's fn: never opened. */
  external?: true;
  /** How the edge goes when it is not a plain call (`callable-arg`, `closure-arg`, `injected`, `default`; with framework adapters `preference`, `plugin`, `observer`, `dispatch`). */
  via?: string;
  /** The local, parameter or field a hook call goes through. */
  hook?: string;
  /** `file:line:col` of the call that passes the value, or of the closure. */
  site?: string;
  /** The call sits in a closure of the caller. */
  closure?: true;
  /** The first place the edge is written (by position). */
  at: CallSite;
  /** Source text of the reference. */
  text: string;
  /** How many places the same pair of IDs is written. */
  count: number;
  /** Its own resolved callees and holes: whether a row can open downwards. */
  calls: number;
  holes: number;
  /** Its own callers: whether a row can open upwards. */
  callers: number;
  /** The entry points it is, if any. */
  entries: { kind: string; label: string }[];
}

/** A call keylang did not resolve: «тут keylang сліпий». */
export interface CallHole {
  /** `unresolved`, `ambiguous`, or the coverage kind (`dynamic-call`, `dynamic-event`, …). */
  kind: string;
  reason: string;
  text: string;
  at: CallSite;
  candidates?: string[];
}

export interface Calls {
  id: string;
  node: { kind: string; file: string | null; line: number | null; layer: string | null; doc: string | null } | null;
  /** The entry points this ID is. */
  entries: { kind: string; label: string }[];
  /** Resolved callees (for an event: its subscribers), in the order the code writes them. */
  callees: CallRef[];
  /** The calls of this ID keylang did not resolve, in the order the code writes them. */
  holes: CallHole[];
  /** Resolved callers (for an event: its publishers), by file and position. */
  callers: CallRef[];
  /** Entry points this ID is reachable from over resolved edges, nearest first; `steps` is the shortest distance. */
  reachedFrom: { id: string; kind: string; label: string; steps: number }[];
  /** Why there is nothing to show. */
  reason?: string;
}

/** At most this many entry points in `reachedFrom`. */
export const MAX_REACHED_FROM = 50;
/** The upward search stops after this many IDs. */
const MAX_UPWARD = 20000;

/** The resolved edges a call tree follows: calls, and whatever an adapter adds between a fn and an event. */
function follows(edge: SnapshotEdge): boolean {
  return edge.kind === "call" && edge.resolution === "resolved" && edge.target !== null;
}

/** Indexes of the snapshot's call edges, built once per snapshot. */
interface Index {
  out: Map<string, SnapshotEdge[]>;
  in: Map<string, SnapshotEdge[]>;
  open: Map<string, SnapshotEdge[]>;
  coverage: Map<string, CoverageItem[]>;
  entries: Map<string, { kind: string; label: string }[]>;
}

const indexes = new WeakMap<AnalysisSnapshot, Index>();

function indexOf(snapshot: AnalysisSnapshot): Index {
  const known = indexes.get(snapshot);
  if (known) return known;
  const push = (map: Map<string, SnapshotEdge[]>, key: string, edge: SnapshotEdge): void => {
    const list = map.get(key);
    if (list) list.push(edge);
    else map.set(key, [edge]);
  };
  const index: Index = { out: new Map(), in: new Map(), open: new Map(), coverage: new Map(), entries: new Map() };
  for (const edge of snapshot.edges) {
    if (edge.kind !== "call") continue;
    if (follows(edge)) {
      push(index.out, edge.source, edge);
      push(index.in, edge.target!, edge);
    } else if (edge.resolution !== "resolved") push(index.open, edge.source, edge);
  }
  for (const item of snapshot.coverage) {
    if (item.source === null || item.kind === "outside-file" || item.kind === "assumed-import" || item.kind === "skipped-file") continue;
    const list = index.coverage.get(item.source);
    if (list) list.push(item);
    else index.coverage.set(item.source, [item]);
  }
  for (const entry of snapshot.entries) {
    const list = index.entries.get(entry.id) ?? [];
    list.push({ kind: entry.kind, label: entry.label });
    index.entries.set(entry.id, list);
  }
  indexes.set(snapshot, index);
  return index;
}

const byPosition = (a: CallSite, b: CallSite): number => compareText(a.file ?? "", b.file ?? "") || a.line - b.line || a.col - b.col;

/**
 * One level around `id`: its callees and holes, its callers, and the entry
 * points above it. An unknown ID gives empty lists and a `reason`.
 */
export function callsOf(snapshot: AnalysisSnapshot, id: string): Calls {
  const index = indexOf(snapshot);
  const code = snapshot.nodes[id];
  const entries = index.entries.get(id) ?? [];
  const base: Calls = { id, node: code ? { kind: code.kind, file: code.file, line: code.line, layer: code.layer, doc: code.doc } : null, entries, callees: [], holes: [], callers: [], reachedFrom: [] };
  if (!code) return { ...base, reason: `no fn \`${id}\` in the snapshot` };
  const ref = (other: string, edges: readonly SnapshotEdge[]): CallRef => {
    const node = snapshot.nodes[other];
    const first = [...edges].sort((a, b) => byPosition(a, b))[0]!;
    return {
      id: other,
      kind: node?.kind ?? "unknown",
      file: node?.file ?? null,
      line: node?.line ?? null,
      layer: node?.layer ?? null,
      ...(node?.layer === EXTERNAL ? { external: true as const } : {}),
      ...(first.via ? { via: first.via } : {}),
      ...(first.hook ? { hook: first.hook } : {}),
      ...(first.site ? { site: first.site } : {}),
      ...(first.closure ? { closure: true as const } : {}),
      at: { file: first.file, line: first.line, col: first.col },
      text: first.text,
      count: edges.length,
      calls: new Set((index.out.get(other) ?? []).map((e) => e.target)).size,
      holes: holesOf(index, other).length,
      callers: new Set((index.in.get(other) ?? []).map((e) => e.source)).size,
      entries: index.entries.get(other) ?? [],
    };
  };
  const group = (edges: readonly SnapshotEdge[], end: (edge: SnapshotEdge) => string): CallRef[] => {
    const by = new Map<string, SnapshotEdge[]>();
    for (const edge of edges) {
      const other = end(edge);
      const list = by.get(other);
      if (list) list.push(edge);
      else by.set(other, [edge]);
    }
    return [...by].map(([other, list]) => ref(other, list)).sort((a, b) => byPosition(a.at, b.at) || compareText(a.id, b.id));
  };
  return {
    ...base,
    callees: group(index.out.get(id) ?? [], (edge) => edge.target!),
    holes: holesOf(index, id),
    callers: group(index.in.get(id) ?? [], (edge) => edge.source),
    reachedFrom: reachedFrom(snapshot, index, id),
  };
}

/** The unresolved and ambiguous calls of `id`, and the coverage items of the snapshot about it at other places (a `dynamic-event`), by position. */
function holesOf(index: Index, id: string): CallHole[] {
  const out: CallHole[] = [];
  const seen = new Set<string>();
  for (const edge of index.open.get(id) ?? []) {
    const key = `${edge.file}:${edge.line}:${edge.col}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const reason = edge.resolution === "ambiguous" ? `ambiguous call \`${edge.text}\`: ${(edge.candidates ?? []).join(", ")}` : (edge.reason ?? `unresolved call \`${edge.text}\``);
    out.push({ kind: edge.resolution, reason, text: edge.text, at: { file: edge.file, line: edge.line, col: edge.col }, ...(edge.candidates ? { candidates: edge.candidates } : {}) });
  }
  for (const item of index.coverage.get(id) ?? []) {
    const key = `${item.file}:${item.line}:${item.col}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: item.kind, reason: item.reason, text: item.text, at: { file: item.file, line: item.line, col: item.col } });
  }
  return out.sort((a, b) => byPosition(a.at, b.at));
}

/** Breadth first up the resolved edges: the entry points that reach `id`, nearest first, then by kind and label. */
function reachedFrom(snapshot: AnalysisSnapshot, index: Index, id: string): Calls["reachedFrom"] {
  const steps = new Map<string, number>([[id, 0]]);
  let frontier = [id];
  while (frontier.length > 0 && steps.size < MAX_UPWARD) {
    const next: string[] = [];
    for (const at of frontier) {
      for (const edge of index.in.get(at) ?? []) {
        if (steps.has(edge.source)) continue;
        steps.set(edge.source, steps.get(at)! + 1);
        next.push(edge.source);
      }
    }
    frontier = next;
  }
  const out: Calls["reachedFrom"] = [];
  for (const entry of snapshot.entries) {
    const n = steps.get(entry.id);
    if (n !== undefined) out.push({ id: entry.id, kind: entry.kind, label: entry.label, steps: n });
  }
  return out.sort((a, b) => a.steps - b.steps || compareText(a.kind, b.kind) || compareText(a.label, b.label)).slice(0, MAX_REACHED_FROM);
}

/** An event of the snapshot (business-flows/08): who publishes it and who subscribes. */
export interface EventListing {
  id: string;
  file: string | null;
  line: number | null;
  publishers: number;
  subscribers: number;
}

/** The event nodes of the snapshot by ID, or why there are none. */
export function eventsOf(snapshot: AnalysisSnapshot | null): { events: EventListing[]; reason?: string } {
  if (!snapshot) return { events: [], reason: "no snapshot: the specs were checked without code" };
  const index = indexOf(snapshot);
  const events: EventListing[] = [];
  for (const [id, node] of Object.entries(snapshot.nodes)) {
    // `event` is the node kind ADR 0022 п. 6 adds; older snapshots have none.
    if ((node.kind as string) !== "event") continue;
    events.push({ id, file: node.file, line: node.line, publishers: new Set((index.in.get(id) ?? []).map((e) => e.source)).size, subscribers: new Set((index.out.get(id) ?? []).map((e) => e.target)).size });
  }
  events.sort((a, b) => compareText(a.id, b.id));
  return events.length > 0 ? { events } : { events, reason: "no event nodes in the snapshot: events (`dispatch` → observers) come with a framework adapter, business-flows/08" };
}

/** A branch a person ticked: a step and the steps under it. */
export interface ExplorerStep {
  id: string;
  steps?: ExplorerStep[];
}

export interface ExplorerFlowRequest {
  name: string;
  trigger: string;
  steps: ExplorerStep[];
}

/** The provenance comment of a flow saved from the explorer. */
export const EXPLORER_MARK = "<!-- keylang:web explorer -->";

/** A flow name the target `<dir>/flows/<name>.md` can carry: a word, hyphens and underscores. */
const FLOW_NAME = /^[A-Za-z_][A-Za-z0-9_-]{0,79}$/;
/** At most this many steps, this deep: a ticked tree, not a dump of the graph. */
const MAX_STEPS = 500;
const MAX_LEVEL = 30;

/**
 * The request body of `POST /api/flow-proposal` as a request, or why not:
 * `{name, trigger, steps}`, where a step is an ID or `{id, steps?}`.
 */
export function parseExplorerFlow(body: unknown): ExplorerFlowRequest | string {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return "the body must be a JSON object {name, trigger, steps}";
  const { name, trigger, steps } = body as Record<string, unknown>;
  if (typeof name !== "string" || !FLOW_NAME.test(name)) return "name: a flow name of letters, digits, `-` and `_`, starting with a letter or `_`";
  if (typeof trigger !== "string" || trigger === "") return "trigger: the ID of a fn";
  let count = 0;
  const parse = (value: unknown, level: number, where: string): ExplorerStep[] | string => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) return `${where}: an array of steps`;
    if (level > MAX_LEVEL) return `${where}: deeper than ${MAX_LEVEL} levels`;
    const out: ExplorerStep[] = [];
    for (const [i, item] of value.entries()) {
      if (++count > MAX_STEPS) return `more than ${MAX_STEPS} steps`;
      if (typeof item === "string" && item !== "") {
        out.push({ id: item });
        continue;
      }
      if (typeof item !== "object" || item === null || typeof (item as { id?: unknown }).id !== "string" || (item as { id: string }).id === "") return `${where}[${i}]: an ID or {id, steps}`;
      const children = parse((item as { steps?: unknown }).steps, level + 1, `${where}[${i}].steps`);
      if (typeof children === "string") return children;
      out.push({ id: (item as { id: string }).id, ...(children.length > 0 ? { steps: children } : {}) });
    }
    return out;
  };
  const parsed = parse(steps, 0, "steps");
  if (typeof parsed === "string") return parsed;
  return { name, trigger, steps: parsed };
}

/**
 * The flow a person ticked in the explorer, as a draft: `trigger`, then each
 * step nested under the step that calls it, in the order given. Every step
 * must be a fn of the repository the step above it (the trigger at the top)
 * calls by a resolved edge: the draft claims only what the edges show, as
 * `draft flow` does; an entry point of a kind the grammar names is a typed
 * trigger (`trigger route <id>`). A step reached not by a plain call carries the same
 * `via` comment as `draft flow`, and a fn with calls keylang did not resolve
 * the same `unresolved` comment. The provenance comment under the heading
 * says where it came from. A string: why the tree is not a flow.
 */
export function explorerFlow(snapshot: AnalysisSnapshot, request: ExplorerFlowRequest): FlowDraft | string {
  const index = indexOf(snapshot);
  const isFn = (id: string): boolean => snapshot.nodes[id]?.kind === "fn" && snapshot.nodes[id]?.layer !== EXTERNAL;
  if (!isFn(request.trigger)) return `trigger: \`${request.trigger}\` is not a fn of the repository`;
  const lines = [`# flow ${request.name}`, "", EXPLORER_MARK, ""];
  const steps: string[] = [];
  const comment = (id: string, parent: string | null): string => {
    let out = "";
    if (parent !== null) {
      const edge = (index.out.get(parent) ?? []).filter((e) => e.target === id).sort((a, b) => byPosition(a, b))[0];
      if (edge?.via === "callable-arg") out += " <!-- keylang:algo via callable -->";
      else if (edge?.via === "closure-arg") out += " <!-- keylang:algo via closure -->";
      else if (edge?.via) out += ` <!-- keylang:algo via ${edge.via} -->`;
    }
    const open = holesOf(index, id).map((hole) => `${hole.text || hole.reason} (${hole.at.file}:${hole.at.line})`);
    // Closing `-->` inside a comment would end it early.
    if (open.length > 0) out += ` <!-- keylang:algo unresolved: ${open.join("; ").replace(/-->/g, "-- >")} -->`;
    return out;
  };
  const walk = (list: readonly ExplorerStep[], parent: string, level: number): string | null => {
    for (const step of list) {
      if (!isFn(step.id)) return `step \`${step.id}\` is not a fn of the repository`;
      if (!(index.out.get(parent) ?? []).some((e) => e.target === step.id)) return `step \`${step.id}\`: \`${parent}\` does not call it (no resolved call edge)`;
      steps.push(step.id);
      lines.push(`${"  ".repeat(level)}- step ${step.id}${comment(step.id, parent)}`);
      const problem = walk(step.steps ?? [], step.id, level + 1);
      if (problem !== null) return problem;
    }
    return null;
  };
  steps.push(request.trigger);
  // An entry point of a kind the grammar names is a typed trigger, as `flows discover` writes it (ADR 0023 п. 3).
  const kind = snapshot.entries.find((entry) => entry.id === request.trigger)?.kind;
  lines.push(`- trigger ${kind !== undefined && isTriggerKind(kind) ? `${kind} ` : ""}${request.trigger}${comment(request.trigger, null)}`);
  const problem = walk(request.steps, request.trigger, 1);
  if (problem !== null) return problem;
  return { name: request.name, text: `${lines.join("\n")}\n`, steps };
}
