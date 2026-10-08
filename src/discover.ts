// `keylang flows discover` and `keylang flows adopt` (business-flows/11): a
// flow draft for every entry point of the snapshot, `draftFlow` from the
// entry's fn, as a generated view `<dir>/flows-discovered/<layer>.md` (ADR
// 0014: a view, not a spec — `check` does not read it). A trigger a
// hand-written flow already names is left out and reported. `adoptedFlow`
// turns one discovered flow into the draft a proposal is made of. Pure over
// the snapshot and the flows of the specs; the operation writes.

import { distinctNames, draftFlow, type FlowDraft } from "./draft.ts";
import { DISCOVERED_FLOWS_DIR } from "./map.ts";
import type { Flow } from "./spec-ir.ts";
import type { AnalysisSnapshot, EntryKind, EntryPoint } from "./snapshot.ts";
import { compareText } from "./span.ts";

/** The view's directory under the spec directory. */
export const DISCOVERED_DIR = DISCOVERED_FLOWS_DIR;

/** The first line of every file of the view. */
export const DISCOVER_MARK = "<!-- keylang:generated — не редагувати, `keylang flows discover` -->";

export interface DiscoverOptions {
  /** Only entry points of this kind. */
  kind?: EntryKind;
  /** Only entry points whose fn is in this layer. */
  layer?: string;
  /** At most this many flows, in entry order (kind, label, id). */
  limit?: number;
  /** The depth of each draft (`draftFlow`), 4 by default. */
  depth?: number;
}

/** One discovered flow: the draft of one entry point's fn. */
export interface DiscoveredFlow {
  name: string;
  trigger: string;
  entry: { kind: EntryKind; label: string };
  /** The layer of the trigger, which names the view's file. */
  layer: string;
  /** The view's file, relative to its directory: `<layer>.md`. */
  file: string;
  /** IDs of the steps, trigger first. */
  steps: string[];
  /** Calls on the route keylang did not resolve: each an `unresolved` comment of the draft. */
  holes: number;
  /** The `# flow` section as the view writes it, with its `keylang:discover` comment; ends with a newline. */
  text: string;
}

export interface Discovery {
  flows: DiscoveredFlow[];
  /** Triggers a hand-written flow already names: not drafted. */
  specified: { trigger: string; file: string; flow: string }[];
  /** Entry points whose id is a module's top level, not a fn: no trigger to draft from. */
  notFns: EntryPoint[];
  /** The view: file name under `<dir>/flows-discovered/` → text. */
  files: Map<string, string>;
}

/** Each trigger the hand-written flows name, with the first flow (by file, then name) that names it. */
export function specifiedTriggers(flows: readonly Flow[]): Map<string, { file: string; flow: string }> {
  const out = new Map<string, { file: string; flow: string }>();
  const sorted = [...flows].sort((a, b) => compareText(a.file, b.file) || compareText(a.name, b.name));
  for (const flow of sorted) for (const trigger of flow.triggers) if (!out.has(trigger.target.target)) out.set(trigger.target.target, { file: flow.file, flow: flow.name });
  return out;
}

/**
 * The flows of the view: one draft per fn an entry point names (the first
 * entry of a fn, in the snapshot's order, labels it), names kept apart as
 * `code-to-spec` keeps them, grouped by the trigger's layer, flows of a file
 * by name. The same snapshot and specs give the same bytes.
 */
export function discoverFlows(snapshot: AnalysisSnapshot, specified: ReadonlyMap<string, { file: string; flow: string }>, options: DiscoverOptions = {}): Discovery {
  const seen = new Set<string>();
  const notFns: EntryPoint[] = [];
  const skipped: Discovery["specified"] = [];
  const chosen: EntryPoint[] = [];
  for (const entry of snapshot.entries) {
    if (options.kind !== undefined && entry.kind !== options.kind) continue;
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    const node = snapshot.nodes[entry.id];
    if (node?.kind !== "fn") {
      notFns.push(entry);
      continue;
    }
    if (options.layer !== undefined && node.layer !== options.layer) continue;
    const written = specified.get(entry.id);
    if (written !== undefined) {
      skipped.push({ trigger: entry.id, ...written });
      continue;
    }
    if (options.limit !== undefined && chosen.length >= options.limit) continue;
    chosen.push(entry);
  }
  const depth = options.depth ?? 4;
  const drafts = distinctNames(chosen.map((entry) => draftFlow(snapshot, entry.id, { depth })));
  const holes = holesBySource(snapshot);
  const flows = drafts.map((draft, i): DiscoveredFlow => {
    const entry = chosen[i]!;
    const layer = snapshot.nodes[entry.id]!.layer;
    const count = draft.steps.reduce((sum, id) => sum + (holes.get(id) ?? 0), 0);
    const flow = { name: draft.name, trigger: entry.id, entry: { kind: entry.kind, label: entry.label }, layer, file: `${layer}.md`, steps: draft.steps, holes: count };
    return { ...flow, text: withComment(draft.text, `keylang:discover entry=${entry.kind} label="${quoted(entry.label)}" steps=${draft.steps.length} holes=${count}`) };
  });
  const files = new Map<string, string>();
  const byFile = new Map<string, DiscoveredFlow[]>();
  for (const flow of flows) byFile.set(flow.file, [...(byFile.get(flow.file) ?? []), flow]);
  for (const file of [...byFile.keys()].sort(compareText)) {
    const sections = byFile.get(file)!.sort((a, b) => compareText(a.name, b.name)).map((flow) => flow.text);
    files.set(file, `${DISCOVER_MARK}\n\n${sections.join("\n")}`);
  }
  return { flows, specified: skipped, notFns, files };
}

/**
 * The draft `flows adopt` proposes: the discovered flow with its comment
 * turned into provenance — `adopted`, and the view's file it came from.
 */
export function adoptedFlow(flow: DiscoveredFlow, specDir: string): FlowDraft {
  const from = `${specDir === "" ? "" : `${specDir}/`}${DISCOVERED_DIR}/${flow.file}`;
  const text = flow.text.replace("<!-- keylang:discover entry=", "<!-- keylang:discover adopted entry=").replace(/ -->\n/, ` from=${from} -->\n`);
  return { name: flow.name, text, steps: flow.steps };
}

/** `discovered N flows (M already specified), K with blind spots`. */
export function discoverySummary(discovery: Pick<Discovery, "flows" | "specified">): string {
  const blind = discovery.flows.filter((flow) => flow.holes > 0).length;
  return `discovered ${discovery.flows.length} flows (${discovery.specified.length} already specified), ${blind} with blind spots`;
}

/** The unresolved and dynamic calls of each fn: what `draftFlow` writes as an `unresolved` comment. */
function holesBySource(snapshot: AnalysisSnapshot): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of snapshot.coverage) {
    if ((c.kind !== "dynamic-call" && c.kind !== "unresolved-call" && c.kind !== "ambiguous-binding") || c.source === null) continue;
    out.set(c.source, (out.get(c.source) ?? 0) + 1);
  }
  return out;
}

/** The draft with an HTML comment as its own paragraph under the heading. */
function withComment(text: string, comment: string): string {
  const [heading, ...rest] = text.split("\n");
  return [heading, "", `<!-- ${comment} -->`, ...rest].join("\n");
}

/** A label inside `"…"` of a comment: no double quote, no `-->`. */
function quoted(label: string): string {
  return label.replace(/"/g, "'").replace(/-->/g, "-- >").replace(/\n/g, " ");
}
