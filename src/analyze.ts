// One analysis for the CLI and the language server: config, a fresh snapshot,
// spec documents, and their assessment. Generated map files are replaced by the
// map rendered from the fresh snapshot, so IDs resolve against current code,
// not a stale committed map. Nothing is written.

import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { assess, type Assessment } from "./assess.ts";
import { evidenceFiles, loadConfig, toPosix, type Config } from "./config.ts";
import { collectMdFiles } from "./files.ts";
import type { Document } from "./ir.ts";
import { generateMap, type MapResult } from "./map.ts";
import { parse } from "./parser.ts";
import type { AnalysisSnapshot } from "./snapshot.ts";
import { loadReports } from "./test-report.ts";
import { loadTraces } from "./trace-evidence.ts";

export { filesToReextract } from "./fact-cache.ts";

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
}

export interface Analysis extends Assessment {
  config: Config;
  map: MapResult | null;
  snapshot: AnalysisSnapshot | null;
  docs: Document[];
}

export async function analyze(request: AnalysisRequest): Promise<Analysis> {
  const { root } = request;
  const config = loadConfig(root);
  const display = request.display ?? ((abs: string) => toPosix(relative(root, abs)));
  const overlay = request.overlay ?? new Map<string, string>();
  const map = config.languages.length > 0 && request.withoutCode !== true ? await generateMap(config) : null;
  const snapshot = map?.index ?? null;
  const specDir = join(root, config.dir);
  const specs = request.specs ?? (existsSync(specDir) ? [specDir] : []);
  const files = collectMdFiles(specs);
  for (const abs of overlay.keys()) if (abs.endsWith(".md") && !files.includes(abs) && specs.some((spec) => within(abs, spec))) files.push(abs);
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
  docs.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  // Reports and traces are evidence about code; specs checked on their own have none.
  const testFiles = snapshot ? evidenceFiles(config, "tests") : null;
  const traceFiles = snapshot ? evidenceFiles(config, "trace") : null;
  const assessment = assess(docs, snapshot, {
    tests: testFiles === null ? null : loadReports(root, testFiles),
    traces: traceFiles === null ? null : loadTraces(root, traceFiles),
  });
  return { ...assessment, config, map, snapshot, docs };
}

/** Walk up from `start` to the directory that holds `keylang.json`; `start` when there is none. */
export function findRoot(start: string): string {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, "keylang.json"))) return dir;
    const parent = join(dir, "..");
    if (parent === dir) return start;
    dir = parent;
  }
}

export function within(abs: string, dir: string): boolean {
  const rel = relative(dir, abs);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/"));
}
