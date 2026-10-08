// One analysis for the CLI and the language server: config, a fresh snapshot,
// spec documents, and their assessment. Generated map files are replaced by the
// map rendered from the fresh snapshot, so IDs resolve against current code,
// not a stale committed map. Nothing is written but, when asked, the fact cache.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { assess, type Assessment } from "./assess.ts";
import { CONFIG_FILE, evidenceFiles, loadConfig, resolveStatic, toPosix, type Config, type StaticMode } from "./config.ts";
import { readManifests, type DeclaredPackage } from "./declared-packages.ts";
import { compareText } from "./span.ts";
import { collectMdFiles } from "./files.ts";
import type { Document } from "./ir.ts";
import { keepsFactCache, saveFactCache } from "./fact-cache.ts";
import { DISCOVERED_FLOWS_DIR, EXPLAINED_MAP_DIR, generateMap, type MapResult } from "./map.ts";
import { parse } from "./parser.ts";
import type { AnalysisSnapshot } from "./snapshot.ts";
import { loadReports } from "./test-report.ts";
import { loadTraces } from "./trace-evidence.ts";

export interface AnalysisRequest {
  /** Repository root (directory of `keylang.json`). Absolute. */
  root: string;
  /** Spec files or directories, absolute. Default: `<root>/<dir>`. */
  specs?: readonly string[];
  /** Unsaved buffer text by absolute path. */
  overlay?: ReadonlyMap<string, string>;
  /** Path shown in diagnostics for an absolute file. Default: relative to root. */
  display?: (abs: string) => string;
  /** Check the specs on their own, without the repository's code (examples, slides). */
  withoutCode?: boolean;
  /** Leave test reports and traces out (`keylang map` needs only the snapshot). */
  withoutEvidence?: boolean;
  /** Write the fact cache for the next process (`keylang map`). */
  persistFacts?: boolean;
  /**
   * Save the fact cache for the next process now, best-effort, when the facts
   * of this run differ from it (`check`, `feature`, `hook stop`): a write that
   * fails is no error. Only without an overlay, in a repository with `keylang.json`.
   */
  saveFacts?: boolean;
  /** Builds the snapshot; the TUI passes one that runs in a worker thread. Default: `generateMap`. */
  generate?: (config: Config, options: { persist: boolean | "changed"; overlay: ReadonlyMap<string, string> }) => Promise<MapResult>;
  /** Overrides `config.check.static`. Omitted leaves the config, then `behavior`. */
  static?: StaticMode;
}

export interface Analysis extends Assessment {
  config: Config;
  map: MapResult | null;
  snapshot: AnalysisSnapshot | null;
  docs: Document[];
  /** Paths the request named that hold no specs (the explained map, saved explanations), as displayed. */
  notSpecs: string[];
  /**
   * Packages the repository declares, sorted by id: the map's, or without
   * languages those of the root manifests; none for specs checked without code.
   */
  packages: readonly DeclaredPackage[];
}

export async function analyze(request: AnalysisRequest): Promise<Analysis> {
  const { root } = request;
  const config = loadConfig(root);
  const display = request.display ?? ((abs: string) => toPosix(relative(root, abs)));
  const overlay = request.overlay ?? new Map<string, string>();
  // Facts of unsaved text are no cache of the files on disk.
  const save = request.persistFacts !== true && request.saveFacts === true && overlay.size === 0 && keepsFactCache(root);
  const options = { persist: request.persistFacts === true || (save ? ("changed" as const) : false), overlay };
  const generate = request.generate ?? generateMap;
  const map = config.languages.length > 0 && request.withoutCode !== true ? await generate(config, options) : null;
  if (save && map?.factCache) saveFactCache(root, map.factCache);
  const snapshot = map?.index ?? null;
  const specDir = join(root, config.dir);
  const specs = request.specs ?? (existsSync(specDir) ? [specDir] : []);
  // Generated reading aids beside the specs: never assessed, so the explained map repeats no ID (K002)
  // and a discovered flow is no claim (ADR 0014).
  const reading = [join(specDir, EXPLAINED_MAP_DIR), join(specDir, "explain"), join(specDir, DISCOVERED_FLOWS_DIR)];
  const notSpec = (abs: string): boolean => reading.some((dir) => within(abs, dir));
  const notSpecs = specs.filter(notSpec).map(display);
  const files = collectMdFiles(specs.filter((spec) => !notSpec(spec))).filter((abs) => !notSpec(abs));
  for (const abs of overlay.keys()) if (abs.endsWith(".md") && !files.includes(abs) && !notSpec(abs) && specs.some((spec) => within(abs, spec))) files.push(abs);
  const mapDir = join(specDir, "map");
  const docs: Document[] = [];
  for (const abs of files) {
    const text = overlay.get(abs) ?? readFileSync(abs, "utf8");
    const doc = parse(display(abs), text);
    // A generated map file is replaced by the fresh render below.
    if (map && within(abs, mapDir) && doc.generated !== null) continue;
    docs.push(doc);
  }
  if (map) {
    for (const [name, text] of map.files) {
      const abs = join(mapDir, name);
      if (docs.some((doc) => doc.path === display(abs))) continue;
      docs.push(parseRenderedMap(display(abs), text));
    }
  }
  docs.sort((a, b) => compareText(a.path, b.path));
  // Reports and traces are evidence about code; specs checked on their own have none.
  const evidence = snapshot !== null && request.withoutEvidence !== true;
  const testFiles = evidence ? evidenceFiles(config, "tests") : null;
  const traceFiles = evidence ? evidenceFiles(config, "trace") : null;
  const staticMode = resolveStatic(request.static, config.check.static);
  const packages = request.withoutCode === true ? [] : (map?.graph.packages ?? readManifests(config, []).packages);
  const assessment = assess(
    docs,
    snapshot,
    {
      tests: testFiles === null ? null : loadReports(root, testFiles),
      traces: traceFiles === null ? null : loadTraces(root, traceFiles),
      static: staticMode.mode,
      ...(staticMode.setBy ? { staticSetBy: staticMode.setBy } : {}),
      ...(request.withoutCode ? {} : { knownExternal: new Set(packages.map((p) => p.id)), testFileExists: (path: string) => repositoryFile(root, path) }),
    },
    config.format,
  );
  return { ...assessment, config, map, snapshot, docs, notSpecs, packages };
}

/**
 * The rendered map files, parsed, by their display path and the hash of the
 * text. The snapshot reaches the specs through the Markdown it renders, not
 * an index built from it directly: the positions in that map file are the
 * contract K001, K002 and LSP definition point at. Rendering stays per
 * analysis; the parse is reused while the text is the same, so the repeated
 * analyses of one process (MCP, LSP, TUI) parse each map text once.
 * Documents are read-only past `parse`, so one may serve many analyses.
 */
const renderedMap = new Map<string, { hash: string; doc: Document }>();

function parseRenderedMap(path: string, text: string): Document {
  const hash = createHash("sha256").update(text).digest("hex");
  const known = renderedMap.get(path);
  if (known?.hash === hash) return known.doc;
  const doc = parse(path, text);
  renderedMap.set(path, { hash, doc });
  return doc;
}

/** Walk up from `start` to the directory that holds `keylang.json`; `start` when there is none. */
export function findRoot(start: string): string {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, CONFIG_FILE))) return dir;
    const parent = join(dir, "..");
    if (parent === dir) return start;
    dir = parent;
  }
}

/** `path` (relative to the root, as a flow's `test` writes it) is a file inside the repository. */
function repositoryFile(root: string, path: string): boolean {
  const abs = resolve(root, path);
  if (!within(abs, root)) return false;
  try {
    return statSync(abs).isFile();
  } catch {
    return false;
  }
}

export function within(abs: string, dir: string): boolean {
  const rel = relative(dir, abs);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}
