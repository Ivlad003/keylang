// `keylang map`: source files → facts → graph → map/*.md + .keylang/index.json.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { excludedSourceFiles, isExcluded, sourceTree, toPosix, type Config } from "./config.ts";
import { languageOf } from "./languages.ts";
import { compareText } from "./span.ts";
import type { FileFacts } from "./extract/facts.ts";
import { frontendFor } from "./frontends.ts";
import { isGeneratedMap, renderExplainedMap, renderMap } from "./emit.ts";
import { explanationOf, loadBriefs } from "./explanations.ts";
import { buildGraph, placeFile, type Graph } from "./graph.ts";
import { FactCache } from "./fact-cache.ts";
import { buildSnapshot, EXTRACTOR_VERSION, grammarVersions, sha256, type AnalysisSnapshot } from "./snapshot.ts";

export interface MapResult {
  graph: Graph;
  /** File name under `<dir>/map/` → content. */
  files: Map<string, string>;
  /** File name under `<dir>/map-explained/` → content; null when `explain.map` is off. */
  explained: Map<string, string> | null;
  index: AnalysisSnapshot;
  /** Files left out because they fall outside guessed layers (docs, scripts). */
  skipped: number;
  /** Source files whose facts were reused from a cache, and files parsed in this run. */
  facts: { reused: number; extracted: number };
}

/**
 * `persist` writes the fact cache for the next process (`keylang map` only);
 * `overlay` gives unsaved text of source files by absolute path (the language server).
 */
export async function generateMap(config: Config, options: { persist?: boolean; overlay?: ReadonlyMap<string, string> } = {}): Promise<MapResult> {
  // With an explicit config a file outside every layer is a finding
  // (`unassigned`); with guessed layers it is most likely not product code.
  const tree = sourceTree(config);
  const all = tree.files;
  // An unsaved or proposed file that is not on disk yet is a source too (`spec-to-code` candidates).
  const added = [...(options.overlay?.keys() ?? [])].map((abs) => toPosix(relative(config.root, abs))).filter((rel) => {
    const language = languageOf(rel);
    return !rel.startsWith("../") && !all.includes(rel) && language !== undefined && config.languages.includes(language) && !isExcluded(rel, config.exclude);
  });
  if (added.length > 0) {
    all.push(...added);
    all.sort(compareText);
  }
  // One read per file: the manifest hash, the cache key and the extracted facts come from the same text.
  const indexed: { path: string; sha256: string }[] = [];
  const sources = new Map<string, { text: string; sha256: string }>();
  for (const p of [...all]) {
    const abs = join(config.root, p);
    const src = options.overlay?.get(abs) ?? readSource(abs);
    if (src === null) {
      // Removed between listing and reading: not part of this snapshot.
      all.splice(all.indexOf(p), 1);
      continue;
    }
    const hash = sha256(src);
    sources.set(p, { text: src, sha256: hash });
    indexed.push({ path: p, sha256: hash });
  }
  const skipped = config.guessed ? all.filter((p) => placeFile(config, p) === null) : [];
  const skippedSet = new Set(skipped);
  const cache = FactCache.open(config.root, JSON.stringify({ extractor: EXTRACTOR_VERSION, code: extractorCode(), grammars: grammarVersions() }));
  const facts: FileFacts[] = [];
  for (const p of all) {
    if (skippedSet.has(p)) continue;
    const src = sources.get(p);
    if (src === undefined) continue;
    const frontend = frontendFor(p);
    if (!frontend) continue;
    facts.push(await cache.facts(p, src.sha256, () => extractGuarded(frontend.extract, p, src.text)));
  }
  if (options.persist) cache.save();
  // An explicitly excluded file inside a layer is a module with unknown contents.
  const excluded = excludedSourceFiles(config).filter((p) => placeFile(config, p) !== null);
  for (const p of excluded) facts.push(opaqueFacts(p));
  const graph = buildGraph(config, facts);
  for (const p of excluded) {
    const module = graph.byPath.get(p);
    if (module) module.comment = "excluded";
  }
  const mapDir = `${config.dir}/map`;
  // An unreadable directory inside a layer: a hole of the module IDs its files would have.
  const unreadable = tree.unreadable.flatMap(({ dir, reason }) => {
    graph.warnings.push(`\`${dir}\`: ${reason}; its files are not indexed`);
    const place = placeFile(config, `${dir}/${UNREADABLE_PROBE}`);
    return place === null ? [] : [{ file: dir, reason, source: [place.layer, ...place.segments.slice(0, -1)].join(".") }];
  });
  const index = buildSnapshot(graph, config, indexed, [
    ...skipped.map((file) => ({ file, reason: "outside guessed layers" })),
    ...excluded.map((file) => ({ file, reason: "excluded by keylang.json" })),
    ...unreadable,
  ]);
  let explained: Map<string, string> | null = null;
  if (config.explain.map) {
    const briefs = loadBriefs(config);
    explained = renderExplainedMap(index, `${config.dir}/${EXPLAINED_MAP_DIR}`, (id) => explanationOf(index, briefs, id));
  }
  return { graph, files: renderMap(index, mapDir), explained, index, skipped: skipped.length, facts: { reused: cache.reused, extracted: cache.extracted } };
}

/** The explained map's directory under the spec directory. */
export const EXPLAINED_MAP_DIR = "map-explained";

/** A file name to place an unreadable directory in the layers, as any of its source files would be. */
const UNREADABLE_PROBE = "keylang-unreadable.ts";

function opaqueFacts(path: string): FileFacts {
  return { path, endLine: 1, endCol: 1, imports: [], decls: [], exports: new Set(), reexportsAll: [], exportRows: [], unsupported: [], valueRefs: [], moduleCalls: [], completeness: "opaque", parseError: null };
}

/** A file's text; null when it no longer exists. */
function readSource(abs: string): string | null {
  try {
    return readFileSync(abs, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Facts of one file; a file whose syntax nests deeper than the extractor's
 * stack (thousands of `+` terms or parentheses) is opaque with a parse error,
 * so one pathological file does not stop the whole analysis.
 */
async function extractGuarded(extract: (path: string, src: string) => Promise<FileFacts>, path: string, src: string): Promise<FileFacts> {
  try {
    return await extract(path, src);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    const lines = src.split("\n");
    const last = lines.at(-1) ?? "";
    return { ...opaqueFacts(path), endLine: lines.length, endCol: [...last].length + 1, parseError: { line: 1, reason: "nesting too deep to read" } };
  }
}

export interface MapDiff {
  /** Existing target files that do not belong to the generator. */
  conflicts: string[];
  /** Missing, changed, or extra generated files. */
  stale: string[];
}

/**
 * Directories the generator owns and what they should hold: the map, and the
 * explained map (empty when `explain.map` is off, so its generated files go).
 */
function targets(config: Config, r: MapResult): { dir: string; files: ReadonlyMap<string, string> }[] {
  return [
    { dir: join(config.root, config.dir, "map"), files: r.files },
    { dir: join(config.root, config.dir, EXPLAINED_MAP_DIR), files: r.explained ?? new Map() },
  ];
}

/** Generated files in `dir` that should not be there. */
function extraGenerated(dir: string, files: ReadonlyMap<string, string>): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((e) => e.endsWith(".md") && !files.has(e) && isGeneratedMap(readFileSync(join(dir, e), "utf8")))
    .map((e) => join(dir, e));
}

/** Target files of both maps that exist and are not generated. Sorted. */
export function mapConflicts(config: Config, r: MapResult): string[] {
  const conflicts: string[] = [];
  for (const { dir, files } of targets(config, r)) {
    for (const name of files.keys()) {
      const p = join(dir, name);
      if (existsSync(p) && !isGeneratedMap(readFileSync(p, "utf8"))) conflicts.push(p);
    }
  }
  return conflicts.sort();
}

/**
 * Write both maps and the index. A manual target file blocks every write and
 * every removal: the generator checks all targets before touching disk.
 */
export function writeMap(config: Config, r: MapResult): { written: string[]; removed: string[]; conflicts: string[] } {
  const conflicts = mapConflicts(config, r);
  if (conflicts.length > 0) return { written: [], removed: [], conflicts };
  const written: string[] = [];
  const removed: string[] = [];
  for (const { dir, files } of targets(config, r)) {
    if (files.size > 0) mkdirSync(dir, { recursive: true });
    for (const [name, text] of files) {
      const p = join(dir, name);
      if (!existsSync(p) || readFileSync(p, "utf8") !== text) {
        writeFileSync(p, text);
        written.push(p);
      }
    }
    // Only generated files of layers that no longer exist (or of a map turned off) may be removed.
    for (const p of extraGenerated(dir, files)) {
      rmSync(p);
      removed.push(p);
    }
    // A map turned off leaves no empty directory behind; one with manual files stays.
    if (files.size === 0 && existsSync(dir) && readdirSync(dir).length === 0) rmdirSync(dir);
  }
  const idxDir = join(config.root, ".keylang");
  mkdirSync(idxDir, { recursive: true });
  writeFileSync(join(idxDir, "index.json"), `${JSON.stringify(r.index, null, 2)}\n`);
  return { written, removed, conflicts };
}

/** Compare both generated maps with the files on disk (`map --check`). */
export function diffMap(config: Config, r: MapResult): MapDiff {
  const conflicts = mapConflicts(config, r);
  const conflicted = new Set(conflicts);
  const stale: string[] = [];
  for (const { dir, files } of targets(config, r)) {
    for (const [name, text] of files) {
      const p = join(dir, name);
      if (conflicted.has(p)) continue;
      if (!existsSync(p) || readFileSync(p, "utf8") !== text) stale.push(p);
    }
    stale.push(...extraGenerated(dir, files));
  }
  return { conflicts, stale };
}

let extractorHash: string | null = null;

/**
 * A hash of the extractor's own code. Facts cached by a changed extractor are
 * stale even when nobody bumped `EXTRACTOR_VERSION`; in the package the same
 * files are the built `.js`.
 */
function extractorCode(): string {
  if (extractorHash !== null) return extractorHash;
  const dir = fileURLToPath(new URL("./extract/", import.meta.url));
  const files = readdirSync(dir).filter((name) => /\.(ts|js)$/.test(name)).sort();
  extractorHash = sha256(files.map((name) => `${name}\0${readFileSync(join(dir, name), "utf8")}`).join("\0"));
  return extractorHash;
}
