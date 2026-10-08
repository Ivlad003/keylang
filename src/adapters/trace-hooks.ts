// Module hooks for the trace adapter (they run on Node's hooks thread, with a
// module graph of their own). `initialize` builds the snapshot and finds the
// symbols of one flow, or reads them from a `keylang trace-plan` file, and
// plans a wrapper for each function body; `load` applies the plan to the
// source of those files only.

import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { MessagePort } from "node:worker_threads";
import { loadConfig } from "../config.ts";
import { functionBodies, parsesCleanly, type FunctionBody } from "../extract/bodies.ts";
import { generateMap } from "../map.ts";
import { sha256 } from "../snapshot.ts";
import { flowSymbols } from "../trace-plan.ts";

export interface TraceHooksData {
  root: string;
  /** The flow whose trigger and steps are instrumented, read from the specs; null with `plan`. */
  flow: string | null;
  /** A plan from `keylang trace-plan` (absolute path): its symbols instead of a flow's, and its snapshot. */
  plan: string | null;
  port: MessagePort;
}

/**
 * Hooks → adapter. `plan` once from `initialize`: the flow's functions a
 * wrapper was planned for, and the real path of each file that holds them.
 * `loaded` from `load` for each file the plan was applied to (`commonjs` when
 * Node compiles it as CommonJS); `skipped` for a planned file that loaded with
 * other content than the snapshot saw: its functions ran without spans.
 * `unplanned` names each function of the flow no wrapper was planned for, with
 * the reason (no body at the snapshot's position, a generator, a wrapped file
 * that does not parse), so the run record can say why it is not instrumented.
 */
export type TracePlanMessage =
  | { kind: "plan"; snapshotId: string; planned: string[]; files: { path: string; ids: string[] }[]; unplanned: Record<string, string>; error?: string }
  | { kind: "loaded"; ids: string[]; commonjs: boolean }
  | { kind: "skipped"; ids: string[] };

interface FilePlan {
  /** The file the snapshot saw, and the same file with the wrappers in place. */
  sha256: string;
  source: string;
  ids: string[];
}

const plans = new Map<string, FilePlan>();
let port: MessagePort | null = null;

export async function initialize(data: TraceHooksData): Promise<void> {
  port = data.port;
  try {
    const { snapshotId, symbols } = data.plan !== null ? readPlan(data.plan) : await flowPlan(data.root, data.flow ?? "");
    const byFile = new Map<string, PlannedSymbol[]>();
    for (const symbol of symbols) {
      const list = byFile.get(symbol.file) ?? [];
      list.push(symbol);
      byFile.set(symbol.file, list);
    }
    const instrumented: string[] = [];
    const unplanned: Record<string, string> = {};
    const files: { path: string; ids: string[] }[] = [];
    for (const [file, fns] of byFile) {
      let src: string;
      try {
        src = readFileSync(join(data.root, file), "utf8");
      } catch {
        for (const fn of fns) unplanned[fn.id] = `${file} cannot be read`;
        continue;
      }
      // A plan names the file its snapshot saw: a file changed since is left alone.
      const expected = fns[0]!.sha256;
      if (expected !== null && expected !== sha256(src)) {
        for (const fn of fns) unplanned[fn.id] = "its file changed since the plan";
        continue;
      }
      const bodies = await functionBodies(file, src);
      const edits: Edit[] = [];
      const ids: string[] = [];
      for (const fn of fns) {
        const body = bodies.get(`${fn.line}:${fn.col}`);
        if (!body) unplanned[fn.id] = `no function body at ${file}:${fn.line}:${fn.col}`;
        else if (body.generator) unplanned[fn.id] = "a generator";
        if (!body || body.generator) continue;
        edits.push(...wrap(fn.id, body));
        ids.push(fn.id);
      }
      const source = applyEdits(src, edits);
      // A wrapper that breaks the file would break the test: the file is then left as it is, and not instrumented.
      if (ids.length === 0) continue;
      if (!(await parsesCleanly(file, source))) {
        for (const id of ids) unplanned[id] = `the wrapped ${file} does not parse`;
        continue;
      }
      instrumented.push(...ids);
      // Node loads a module by its real path; a root reached through a link must match that URL.
      const path = realpathSync(join(data.root, file));
      plans.set(pathToFileURL(path).href, { sha256: sha256(src), source, ids });
      files.push({ path, ids });
    }
    data.port.postMessage({ kind: "plan", snapshotId, planned: instrumented.sort(), files, unplanned } satisfies TracePlanMessage);
  } catch (e) {
    data.port.postMessage({ kind: "plan", snapshotId: "", planned: [], files: [], unplanned: {}, error: e instanceof Error ? e.message : String(e) } satisfies TracePlanMessage);
  }
}

interface PlannedSymbol {
  id: string;
  file: string;
  line: number;
  col: number;
  /** The file's hash the plan expects; null when the snapshot was built here, from the file as it is. */
  sha256: string | null;
}

/** The trigger and steps of `flow`, from the specs and a fresh snapshot. */
async function flowPlan(root: string, flow: string): Promise<{ snapshotId: string; symbols: PlannedSymbol[] }> {
  const config = loadConfig(root);
  const { index } = await generateMap(config);
  const wanted = flowSymbols(root, config.dir, flow) ?? new Set<string>();
  const symbols: PlannedSymbol[] = [];
  for (const id of wanted) {
    const node = index.nodes[id];
    if (node?.kind !== "fn" || !node.file || node.line === null || node.col === null) continue;
    symbols.push({ id, file: node.file, line: node.line, col: node.col, sha256: null });
  }
  return { snapshotId: index.snapshotId, symbols };
}

/** A `keylang trace-plan` file (schema 1): its snapshot, flow and symbols; anything else is an error naming the file. */
export function readPlan(path: string): { snapshotId: string; flow: string; symbols: PlannedSymbol[] } {
  let plan: unknown;
  try {
    plan = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new Error(`${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const value = (typeof plan === "object" && plan !== null ? plan : {}) as { schemaVersion?: unknown; snapshotId?: unknown; flow?: unknown; symbols?: unknown };
  if (value.schemaVersion !== 1 || typeof value.snapshotId !== "string" || typeof value.flow !== "string" || !Array.isArray(value.symbols)) {
    throw new Error(`${path}: not a plan of schema 1 from \`keylang trace-plan\``);
  }
  const symbols: PlannedSymbol[] = [];
  for (const item of value.symbols as unknown[]) {
    const s = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
    if (typeof s.id !== "string" || typeof s.file !== "string" || typeof s.line !== "number" || typeof s.col !== "number" || typeof s.sha256 !== "string") continue;
    symbols.push({ id: s.id, file: s.file, line: s.line, col: s.col, sha256: s.sha256 });
  }
  return { snapshotId: value.snapshotId, flow: value.flow, symbols };
}

/** Text inserted at an offset of the original source. */
interface Edit {
  at: number;
  text: string;
}

/** `{ BODY }` → `{ return __keylangTrace.run(id, () => { BODY }); }`; an arrow keeps `this` and `arguments`. */
function wrap(id: string, body: FunctionBody): Edit[] {
  const arrow = body.async ? "async () =>" : "() =>";
  const call = `globalThis.__keylangTrace.run(${JSON.stringify(id)}, ${body.async}, ${arrow}`;
  if (body.expression) return [
    { at: body.start, text: `${call} (` },
    { at: body.end, text: "))" },
  ];
  // `{}`: both halves go to one offset, so they are one edit.
  if (body.start === body.end) return [{ at: body.start, text: ` return ${call} {}); ` }];
  return [
    { at: body.start, text: ` return ${call} {` },
    { at: body.end, text: "}); " },
  ];
}

/** Insert every edit; edits at one offset keep the order they were made in. */
function applyEdits(src: string, edits: readonly Edit[]): string {
  const order = edits.map((edit, i) => ({ ...edit, i })).sort((a, b) => b.at - a.at || b.i - a.i);
  let out = src;
  for (const edit of order) out = out.slice(0, edit.at) + edit.text + out.slice(edit.at);
  return out;
}

type LoadResult = { format?: string | null; source?: string | ArrayBuffer | Uint8Array | null; shortCircuit?: boolean };

export async function load(url: string, context: unknown, nextLoad: (url: string, context: unknown) => Promise<LoadResult>): Promise<LoadResult> {
  const result = await nextLoad(url, context);
  // `?query` and `#hash` load the same file as another module instance: it gets the wrappers too.
  const plan = plans.get(url.replace(/[?#].*$/s, ""));
  if (!plan) return result;
  const commonjs = result.format === "commonjs" || result.format === "commonjs-typescript";
  // Node leaves a CommonJS file to its CommonJS loader (no source here), which would read it past the wrappers.
  const original = result.source ?? (commonjs ? readFileSync(fileURLToPath(url)) : null);
  const source = original === null ? null : typeof original === "string" ? original : Buffer.from(original as Uint8Array).toString("utf8");
  // The plan was made for the snapshot's copy of the file; a different file is left alone.
  if (source === null || sha256(source) !== plan.sha256) {
    port?.postMessage({ kind: "skipped", ids: plan.ids } satisfies TracePlanMessage);
    return result;
  }
  port?.postMessage({ kind: "loaded", ids: plan.ids, commonjs } satisfies TracePlanMessage);
  if (!commonjs) return { ...result, source: plan.source };
  // Node compiles a CommonJS source given here as it is and routes its `require` calls through these hooks,
  // unless the CommonJS loader cached a copy of the file first. The appended line (after the last one, so
  // no line moves) names the module object this source made, so the adapter can tell its copy from that one.
  return { ...result, source: `${plan.source}\n;globalThis.__keylangTrace.own(module);\n` };
}
