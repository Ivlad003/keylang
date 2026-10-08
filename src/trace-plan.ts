// The functions of one flow that a trace adapter instruments: the flow's
// `trigger` and `step` IDs that are functions of a fresh snapshot, with the
// file, position and file hash the snapshot saw. Adapters of languages
// without Node hooks (Python, Rust) read this plan instead of the specs.
// The plan of an entry point (`--entry <id>`) is the same JSON for the
// functions reachable from it, so a scenario can be traced before its flow is
// written (`draft flow --from-trace`).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "./config.ts";
import { collectMdFiles } from "./files.ts";
import { generateMap } from "./map.ts";
import { parse } from "./parser.ts";
import { compileSpec, walkFlow } from "./spec-ir.ts";
import type { AnalysisSnapshot } from "./snapshot.ts";
import { isStoredExplanation } from "./explanations.ts";

export interface TracePlan {
  schemaVersion: 1;
  snapshotId: string;
  flow: string;
  /** Sorted by ID. `sha256` is the file the snapshot indexed: an adapter leaves a changed file alone. */
  symbols: { id: string; name: string; file: string; line: number; col: number; sha256: string }[];
}

/**
 * The plan of `flow` on a fresh snapshot of the saved code. `omitted` are the
 * flow's `trigger`/`step` IDs that are no function of that snapshot (a module,
 * a type, an unknown ID, a file outside it): no adapter instruments them.
 */
export async function tracePlan(config: Config, flow: string): Promise<{ plan: TracePlan; index: AnalysisSnapshot; omitted: string[] }> {
  const wanted = flowSymbols(config.root, config.dir, flow);
  if (wanted === null) throw new Error(`no flow \`${flow}\` under ${config.dir}/`);
  const { index } = await generateMap(config);
  return planOf(index, flow, wanted);
}

/**
 * The plan of the entry point `entry` (a fn of a fresh snapshot): every fn
 * reachable from it (`reachableFrom`). `flow` names the runs it records; by
 * default the entry's last segment. A request or a process names its own
 * flow at run time (`X-Keylang-Flow`, `KEYLANG_FLOW`).
 */
export async function entryTracePlan(config: Config, entry: string, flow?: string): Promise<{ plan: TracePlan; index: AnalysisSnapshot; omitted: string[] }> {
  const { index } = await generateMap(config);
  if (index.nodes[entry]?.kind !== "fn") throw new Error(`\`${entry}\` is not a fn of the snapshot`);
  return planOf(index, flow || entry.slice(entry.lastIndexOf(".") + 1), reachableFrom(index, entry));
}

/**
 * The fns `entry` may run: the closure over resolved calls. A reached fn with
 * a call keylang did not resolve (a call through a value, a dynamic member)
 * widens it, since a trace is there to see where such a call goes: every fn
 * whose name is the called name, and every fn read as a value in the files
 * the reached fns are in or import. An over-approximation: a function of the
 * plan that never runs costs a wrapper; one left out costs the evidence.
 */
export function reachableFrom(index: AnalysisSnapshot, entry: string): Set<string> {
  const fileOf = (id: string): string | null => index.nodes[id]?.file ?? null;
  // The files each file imports, from the dependencies of its module nodes.
  const imports = new Map<string, Set<string>>();
  for (const node of Object.values(index.nodes)) {
    if (node.kind !== "module" || node.file === null) continue;
    const set = imports.get(node.file) ?? new Set<string>();
    for (const dep of node.deps ?? []) {
      const file = fileOf(dep);
      if (file !== null && file !== node.file) set.add(file);
    }
    imports.set(node.file, set);
  }
  const holes = new Map<string, string[]>();
  for (const item of index.coverage) {
    if ((item.kind !== "dynamic-call" && item.kind !== "unresolved-call") || item.source === null) continue;
    holes.set(item.source, [...(holes.get(item.source) ?? []), item.text]);
  }
  const fns = Object.entries(index.nodes).filter(([, node]) => node.kind === "fn" && node.layer !== "external");
  const byName = new Map<string, string[]>();
  for (const [id, node] of fns) {
    const name = node.name ?? id.slice(id.lastIndexOf(".") + 1);
    byName.set(name, [...(byName.get(name) ?? []), id]);
  }
  const reached = new Set<string>();
  const files = new Set<string>();
  const queue: string[] = [];
  const add = (id: string): void => {
    const node = index.nodes[id];
    if (reached.has(id) || node?.kind !== "fn" || node.layer === "external") return;
    reached.add(id);
    if (node.file !== null) files.add(node.file);
    queue.push(id);
  };
  add(entry);
  let widened = false;
  for (;;) {
    while (queue.length > 0) {
      const id = queue.pop()!;
      for (const callee of index.nodes[id]?.calls ?? []) add(callee);
      for (const text of holes.get(id) ?? []) {
        widened = true;
        // `$this->repo->save`, `handlers[kind]`, `handler`: the last name written is the one called.
        const name = /([A-Za-z_$][\w$]*)\W*$/.exec(text)?.[1];
        if (name !== undefined) for (const candidate of byName.get(name) ?? []) add(candidate);
      }
    }
    if (!widened) break;
    // A value read in a reached file or a file it imports: a call through a value may run it.
    const near = new Set(files);
    for (const file of files) for (const dep of imports.get(file) ?? []) near.add(dep);
    for (const [id, node] of fns) if (node.escapes && near.has(node.escapes.file)) add(id);
    if (queue.length === 0) break;
  }
  return reached;
}

function planOf(index: AnalysisSnapshot, flow: string, wanted: ReadonlySet<string>): { plan: TracePlan; index: AnalysisSnapshot; omitted: string[] } {
  const hashes = new Map(index.manifest.files.map((f) => [f.path, f.sha256]));
  const symbols: TracePlan["symbols"] = [];
  const omitted: string[] = [];
  for (const id of [...wanted].sort()) {
    const node = index.nodes[id];
    const sha256 = node?.file ? hashes.get(node.file) : undefined;
    if (node?.kind !== "fn" || !node.file || node.line === null || node.col === null || sha256 === undefined) {
      omitted.push(id);
      continue;
    }
    symbols.push({ id, name: id.slice(id.lastIndexOf(".") + 1), file: node.file, line: node.line, col: node.col, sha256 });
  }
  return { plan: { schemaVersion: 1, snapshotId: index.snapshotId, flow, symbols }, index, omitted };
}

/** What `keylang trace-plan` prints and an adapter reads: the plan as indented JSON and a newline. */
export function tracePlanText(plan: TracePlan): string {
  return `${JSON.stringify(plan, null, 2)}\n`;
}

/** `trigger` and `step` IDs of the flow; null when no spec declares it. */
export function flowSymbols(root: string, dir: string, flow: string): Set<string> | null {
  let found = false;
  const out = new Set<string>();
  for (const file of collectMdFiles([join(root, dir)])) {
    const text = readFileSync(file, "utf8");
    // A saved explanation is the model's text: a `# flow` in it declares nothing.
    if (isStoredExplanation(text)) continue;
    const { spec } = compileSpec([parse(file, text)]);
    for (const item of spec.flows) {
      if (item.name !== flow) continue;
      found = true;
      walkFlow(item, (node) => {
        if (node.kind === "trigger" || node.kind === "step") out.add(node.target.target);
      });
    }
  }
  return found ? out : null;
}
