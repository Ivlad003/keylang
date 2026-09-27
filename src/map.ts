// `keylang map`: source files → facts → graph → map/*.md + .keylang/index.json.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sourceFiles, type Config } from "./config.ts";
import type { FileFacts } from "./extract/facts.ts";
import { extractTs } from "./extract/ts.ts";
import { buildIndex, renderMap, GENERATED_MARK } from "./emit.ts";
import { buildGraph, placeFile, type Graph } from "./graph.ts";

export interface MapResult {
  graph: Graph;
  /** File name under `<dir>/map/` → content. */
  files: Map<string, string>;
  index: ReturnType<typeof buildIndex>;
  /** Files left out because they fall outside guessed layers (docs, scripts). */
  skipped: number;
}

export async function generateMap(config: Config): Promise<MapResult> {
  // With an explicit config a file outside every layer is a finding
  // (`unassigned`); with guessed layers it is most likely not product code.
  const all = sourceFiles(config);
  const paths = config.guessed ? all.filter((p) => placeFile(config, p) !== null) : all;
  const facts: FileFacts[] = [];
  for (const p of paths) {
    const src = readFileSync(join(config.root, p), "utf8");
    facts.push(await extractTs(p, src));
  }
  const graph = buildGraph(config, facts);
  return { graph, files: renderMap(graph), index: buildIndex(graph, config.languages), skipped: all.length - paths.length };
}

/** Write map files and the index. Returns the list of written/removed map files. */
export function writeMap(config: Config, r: MapResult): { written: string[]; removed: string[] } {
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
  // Stale generated files for layers that no longer exist.
  for (const e of readdirSync(mapDir)) {
    if (!e.endsWith(".md") || r.files.has(e)) continue;
    const p = join(mapDir, e);
    if (readFileSync(p, "utf8").startsWith(GENERATED_MARK)) {
      rmSync(p);
      removed.push(p);
    }
  }
  const idxDir = join(config.root, ".keylang");
  mkdirSync(idxDir, { recursive: true });
  writeFileSync(join(idxDir, "index.json"), `${JSON.stringify(r.index, null, 2)}\n`);
  return { written, removed };
}

/** Compare generated map with the files on disk (`map --check`). */
export function diffMap(config: Config, r: MapResult): string[] {
  const mapDir = join(config.root, config.dir, "map");
  const stale: string[] = [];
  for (const [name, text] of r.files) {
    const p = join(mapDir, name);
    if (!existsSync(p) || readFileSync(p, "utf8") !== text) stale.push(p);
  }
  if (existsSync(mapDir)) {
    for (const e of readdirSync(mapDir)) {
      if (e.endsWith(".md") && !r.files.has(e) && readFileSync(join(mapDir, e), "utf8").startsWith(GENERATED_MARK)) stale.push(join(mapDir, e));
    }
  }
  return stale;
}
