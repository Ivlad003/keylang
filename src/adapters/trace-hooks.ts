// Module hooks for the trace adapter (they run on Node's hooks thread, with a
// module graph of their own). `initialize` builds the snapshot, finds the
// symbols of one flow, and plans a wrapper for each function body; `load`
// applies the plan to the source of those files only.

import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { MessagePort } from "node:worker_threads";
import { loadConfig } from "../config.ts";
import { functionBodies, type FunctionBody } from "../extract/bodies.ts";
import { generateMap } from "../map.ts";
import { sha256 } from "../snapshot.ts";
import { flowSymbols } from "../trace-plan.ts";

export interface TraceHooksData {
  root: string;
  flow: string;
  port: MessagePort;
}

/**
 * Hooks → adapter. `plan` once from `initialize`: the flow's functions a
 * wrapper was planned for. `loaded` from `load` for each file the plan was
 * actually applied to: only those symbols are instrumented, so a file that
 * loaded under another URL or with other content never counts as observed.
 */
export type TracePlanMessage =
  | { kind: "plan"; snapshotId: string; planned: string[]; error?: string }
  | { kind: "loaded"; ids: string[] };

interface FilePlan {
  sha256: string;
  edits: { at: number; text: string }[];
}

const plans = new Map<string, FilePlan & { ids: string[] }>();
let port: MessagePort | null = null;

export async function initialize(data: TraceHooksData): Promise<void> {
  port = data.port;
  try {
    const config = loadConfig(data.root);
    const { index } = await generateMap(config);
    const wanted = flowSymbols(data.root, config.dir, data.flow) ?? new Set<string>();
    const byFile = new Map<string, { id: string; line: number; col: number }[]>();
    for (const id of wanted) {
      const node = index.nodes[id];
      if (node?.kind !== "fn" || !node.file || node.line === null || node.col === null) continue;
      const list = byFile.get(node.file) ?? [];
      list.push({ id, line: node.line, col: node.col });
      byFile.set(node.file, list);
    }
    const instrumented: string[] = [];
    for (const [file, fns] of byFile) {
      const src = readFileSync(join(data.root, file), "utf8");
      const bodies = await functionBodies(file, src);
      const edits: FilePlan["edits"] = [];
      const ids: string[] = [];
      for (const fn of fns) {
        const body = bodies.get(`${fn.line}:${fn.col}`);
        if (!body || body.generator) continue;
        edits.push(...wrap(fn.id, body));
        ids.push(fn.id);
      }
      instrumented.push(...ids);
      // Node loads a module by its real path; a root reached through a link must match that URL.
      plans.set(pathToFileURL(realpathSync(join(data.root, file))).href, { sha256: sha256(src), edits: edits.sort((a, b) => b.at - a.at), ids });
    }
    data.port.postMessage({ kind: "plan", snapshotId: index.snapshotId, planned: instrumented.sort() } satisfies TracePlanMessage);
  } catch (e) {
    data.port.postMessage({ kind: "plan", snapshotId: "", planned: [], error: e instanceof Error ? e.message : String(e) } satisfies TracePlanMessage);
  }
}

/** `{ BODY }` → `{ return __keylangTrace.run(id, () => { BODY }); }`; an arrow keeps `this` and `arguments`. */
function wrap(id: string, body: FunctionBody): { at: number; text: string }[] {
  const arrow = body.async ? "async () =>" : "() =>";
  const call = `globalThis.__keylangTrace.run(${JSON.stringify(id)}, ${body.async}, ${arrow}`;
  if (body.expression) return [
    { at: body.start, text: `${call} (` },
    { at: body.end, text: "))" },
  ];
  return [
    { at: body.start, text: ` return ${call} {` },
    { at: body.end, text: "}); " },
  ];
}

type LoadResult = { format?: string | null; source?: string | ArrayBuffer | Uint8Array | null; shortCircuit?: boolean };

export async function load(url: string, context: unknown, nextLoad: (url: string, context: unknown) => Promise<LoadResult>): Promise<LoadResult> {
  const result = await nextLoad(url, context);
  const plan = plans.get(url);
  if (!plan || result.source === null || result.source === undefined) return result;
  let source = typeof result.source === "string" ? result.source : Buffer.from(result.source as Uint8Array).toString("utf8");
  // The plan was made for the snapshot's copy of the file; a different file is left alone.
  if (sha256(source) !== plan.sha256) return result;
  for (const edit of plan.edits) source = source.slice(0, edit.at) + edit.text + source.slice(edit.at);
  port?.postMessage({ kind: "loaded", ids: plan.ids } satisfies TracePlanMessage);
  return { ...result, source };
}
