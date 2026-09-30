// The functions of one flow that a trace adapter instruments: the flow's
// `trigger` and `step` IDs that are functions of a fresh snapshot, with the
// file, position and file hash the snapshot saw. Adapters of languages
// without Node hooks (Python, Rust) read this plan instead of the specs.

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
