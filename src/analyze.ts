// One analysis for the CLI and the language server: config, a fresh snapshot,
// spec documents, and their assessment. Generated map files are replaced by the
// map rendered from the fresh snapshot, so IDs resolve against current code,
// not a stale committed map. Nothing is written.

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import { assess, type Assessment } from "./assess.ts";
import { declaredExternalIds } from "./declared-packages.ts";
import { CONFIG_FILE, evidenceFiles, loadConfig, resolveStatic, toPosix, type Config, type StaticMode } from "./config.ts";
import { compareText } from "./span.ts";
import { collectMdFiles } from "./files.ts";
import type { Document } from "./ir.ts";
import { EXPLAINED_MAP_DIR, generateMap, type MapResult } from "./map.ts";
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
  /** Builds the snapshot; the TUI passes one that runs in a worker thread. Default: `generateMap`. */
  generate?: (config: Config, options: { persist: boolean; overlay: ReadonlyMap<string, string> }) => Promise<MapResult>;
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
}

export async function analyze(request: AnalysisRequest): Promise<Analysis> {
  const { root } = request;
  const config = loadConfig(root);
  const display = request.display ?? ((abs: string) => toPosix(relative(root, abs)));
  const overlay = request.overlay ?? new Map<string, string>();
  const options = { persist: request.persistFacts === true, overlay };
  const generate = request.generate ?? generateMap;
  const map = config.languages.length > 0 && request.withoutCode !== true ? await generate(config, options) : null;
  const snapshot = map?.index ?? null;
  const specDir = join(root, config.dir);
  const specs = request.specs ?? (existsSync(specDir) ? [specDir] : []);
  // Generated reading aids beside the specs: never assessed, so the explained map repeats no ID (K002).
  const reading = [join(specDir, EXPLAINED_MAP_DIR), join(specDir, "explain")];
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
      docs.push(parse(display(abs), text));
    }
  }
  docs.sort((a, b) => compareText(a.path, b.path));
  // Reports and traces are evidence about code; specs checked on their own have none.
  const evidence = snapshot !== null && request.withoutEvidence !== true;
  const testFiles = evidence ? evidenceFiles(config, "tests") : null;
  const traceFiles = evidence ? evidenceFiles(config, "trace") : null;
  const staticMode = resolveStatic(request.static, config.check.static);
  const assessment = assess(
    docs,
    snapshot,
    {
      tests: testFiles === null ? null : loadReports(root, testFiles),
      traces: traceFiles === null ? null : loadTraces(root, traceFiles),
      static: staticMode.mode,
      ...(staticMode.setBy ? { staticSetBy: staticMode.setBy } : {}),
      ...(request.withoutCode ? {} : { knownExternal: declaredExternalIds(root) }),
    },
    config.format,
  );
  return { ...assessment, config, map, snapshot, docs, notSpecs };
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

export function within(abs: string, dir: string): boolean {
  const rel = relative(dir, abs);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/**
 * `abs` spelled under `root` when it reaches the repository only through a
 * link above it (`/var` → `/private/var` on macOS): the spec directory and the
 * snapshot are found by the path's place, not its spelling. Links inside the
 * repository keep their spelling; a path outside it is returned as it is.
 */
export function spelledUnder(abs: string, root: string): string {
  if (within(abs, root)) return abs;
  let realRoot: string;
  try {
    realRoot = realpathSync(root);
  } catch {
    return abs;
  }
  const rest: string[] = [];
  for (let dir = abs; ; dir = dirname(dir)) {
    try {
      if (realpathSync(dir) === realRoot) return join(root, ...rest.reverse());
    } catch {
      // A missing ancestor: keep climbing.
    }
    if (dirname(dir) === dir) return abs;
    rest.push(basename(dir));
  }
}
