// `keylang map`: source files → facts → graph → map/*.md + .keylang/index.json.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sourceFiles, type Config } from "./config.ts";
import type { FileFacts } from "./extract/facts.ts";
import { extractTs } from "./extract/ts.ts";
import { isGeneratedMap, renderMap } from "./emit.ts";
import { buildGraph, placeFile, type Graph } from "./graph.ts";
import { cachedFacts } from "./fact-cache.ts";
import { buildSnapshot, sha256, type AnalysisSnapshot } from "./snapshot.ts";

export interface MapResult {
  graph: Graph;
  /** File name under `<dir>/map/` → content. */
  files: Map<string, string>;
  index: AnalysisSnapshot;
  /** Files left out because they fall outside guessed layers (docs, scripts). */
  skipped: number;
}

export async function generateMap(config: Config): Promise<MapResult> {
  // With an explicit config a file outside every layer is a finding
  // (`unassigned`); with guessed layers it is most likely not product code.
  const all = sourceFiles(config);
  const indexed: { path: string; sha256: string }[] = [];
  const sources = new Map<string, string>();
  for (const p of all) {
    const src = readFileSync(join(config.root, p), "utf8");
    sources.set(p, src);
    indexed.push({ path: p, sha256: sha256(src) });
  }
  const skipped = config.guessed ? all.filter((p) => placeFile(config, p) === null) : [];
  const skippedSet = new Set(skipped);
  const facts: FileFacts[] = [];
  for (const p of all) {
    if (skippedSet.has(p)) continue;
    const src = sources.get(p);
    if (src === undefined) continue;
    const hash = sha256(src);
    facts.push(await cachedFacts(`${config.root}\0${p}`, hash, () => extractTs(p, src)));
  }
  const graph = buildGraph(config, facts);
  const mapDir = `${config.dir}/map`;
  const index = buildSnapshot(graph, config, facts, indexed, skipped);
  return { graph, files: renderMap(index, mapDir), index, skipped: skipped.length };
}

export interface MapDiff {
  /** Existing target files that do not belong to the generator. */
  conflicts: string[];
  /** Missing, changed, or extra generated files. */
  stale: string[];
}

/** Target files under `<dir>/map/` that exist and are not generated. Sorted. */
export function mapConflicts(config: Config, r: MapResult): string[] {
  const mapDir = join(config.root, config.dir, "map");
  const conflicts: string[] = [];
  for (const name of r.files.keys()) {
    const p = join(mapDir, name);
    if (existsSync(p) && !isGeneratedMap(readFileSync(p, "utf8"))) conflicts.push(p);
  }
  return conflicts.sort();
}

/**
 * Write map files and the index. A manual target file blocks every write and
 * every removal: the generator checks all targets before touching disk.
 */
export function writeMap(config: Config, r: MapResult): { written: string[]; removed: string[]; conflicts: string[] } {
  const conflicts = mapConflicts(config, r);
  if (conflicts.length > 0) return { written: [], removed: [], conflicts };
  const mapDir = join(config.root, config.dir, "map");
  mkdirSync(mapDir, { recursive: true });
  const written: string[] = [];
  const removed: string[] = [];
  for (const [name, text] of r.files) {
    const p = join(mapDir, name);
    if (!existsSync(p) || readFileSync(p, "utf8") !== text) {
      writeFileSync(p, text);
      written.push(p);
    }
  }
  // Only generated files for layers that no longer exist may be removed.
  for (const e of readdirSync(mapDir)) {
    if (!e.endsWith(".md") || r.files.has(e)) continue;
    const p = join(mapDir, e);
    if (isGeneratedMap(readFileSync(p, "utf8"))) {
      rmSync(p);
      removed.push(p);
    }
  }
  const idxDir = join(config.root, ".keylang");
  mkdirSync(idxDir, { recursive: true });
  writeFileSync(join(idxDir, "index.json"), `${JSON.stringify(r.index, null, 2)}\n`);
  return { written, removed, conflicts };
}

/** Compare generated map with the files on disk (`map --check`). */
export function diffMap(config: Config, r: MapResult): MapDiff {
  const mapDir = join(config.root, config.dir, "map");
  const conflicts = mapConflicts(config, r);
  const conflicted = new Set(conflicts);
  const stale: string[] = [];
  for (const [name, text] of r.files) {
    const p = join(mapDir, name);
    if (conflicted.has(p)) continue;
    if (!existsSync(p) || readFileSync(p, "utf8") !== text) stale.push(p);
  }
  if (existsSync(mapDir)) {
    for (const e of readdirSync(mapDir)) {
      if (e.endsWith(".md") && !r.files.has(e) && isGeneratedMap(readFileSync(join(mapDir, e), "utf8"))) stale.push(join(mapDir, e));
    }
  }
  return { conflicts, stale };
}
