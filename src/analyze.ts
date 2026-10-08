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
import { collectMdFiles, walkReaches } from "./files.ts";
import type { Document } from "./ir.ts";
import { keepsFactCache, saveFactCache } from "./fact-cache.ts";
import { DISCOVERED_FLOWS_DIR, EXPLAINED_MAP_DIR, generateMap, TOUR_FILE, type MapResult } from "./map.ts";
import { parse } from "./parser.ts";
import { readOldIndex, type NodeView, type OldSnapshot } from "./migration.ts";
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
  /**
   * Leave `migration.from` unread: the old IDs of `# migration` rows stay
   * unverified. The old repository's own analysis passes it, so a chain of
   * migrations is never followed.
   */
  withoutMigration?: boolean;
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
  const notSpec = (abs: string): boolean => readingAid(specDir, abs);
  const notSpecs = specs.filter(notSpec).map(display);
  const files = collectMdFiles(specs.filter((spec) => !notSpec(spec))).filter((abs) => !notSpec(abs));
  // An unsaved buffer joins the specs only where the walk of `check` would find it on disk.
  for (const abs of overlay.keys()) if (abs.endsWith(".md") && !files.includes(abs) && !notSpec(abs) && specs.some((spec) => walkReaches(spec, abs))) files.push(abs);
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
  // The old stack of a migration (business-flows/27), loaded only when keylang.json names one.
  const migration: OldSnapshot =
    request.withoutMigration === true || request.withoutCode === true || config.migration.from === null
      ? { state: "absent" }
      : await oldSnapshotFor(root, config.migration.from);
  const assessment = assess(
    docs,
    snapshot,
    {
      tests: testFiles === null ? null : loadReports(root, testFiles),
      traces: traceFiles === null ? null : loadTraces(root, traceFiles),
      static: staticMode.mode,
      migration,
      ...(staticMode.setBy ? { staticSetBy: staticMode.setBy } : {}),
      ...(request.withoutCode ? {} : { knownExternal: new Set(packages.map((p) => p.id)), testFileExists: (path: string) => repositoryFile(root, path) }),
    },
    config.format,
  );
  return { ...assessment, config, map, snapshot, docs, notSpecs, packages };
}

/** Old snapshots `check` has read in this process, by path: a directory once, a file while it is the same. */
const oldIds = new Map<string, { stamp: string; ids: Promise<{ snapshotId: string; nodes: Record<string, NodeView> }> }>();

/**
 * The nodes of the old stack of a migration (`migration.from` of
 * keylang.json, relative to the root; business-flows/27): an index file, or
 * the old checkout analysed read-only — no fact cache, its own
 * `migration.from` unread. An unreadable one is a state, never a thrown
 * error: the rows stay unverified and say why.
 */
export async function oldSnapshotFor(root: string, from: string): Promise<OldSnapshot> {
  const abs = isAbsolute(from) ? from : resolve(root, from);
  try {
    const stat = statSync(abs);
    const stamp = stat.isDirectory() ? "dir" : `${stat.mtimeMs}:${stat.size}`;
    let known = oldIds.get(abs);
    if (known === undefined || known.stamp !== stamp) {
      const ids = stat.isDirectory()
        ? analyze({ root: abs, withoutEvidence: true, withoutMigration: true }).then((old) => {
            if (old.snapshot === null) throw new Error("no code to read (`languages` in its keylang.json is empty)");
            return { snapshotId: old.snapshot.snapshotId, nodes: old.snapshot.nodes };
          })
        : Promise.resolve().then(() => readOldIndex(abs));
      known = { stamp, ids };
      oldIds.set(abs, known);
      // A failure is not remembered: the next check reads again.
      ids.catch(() => oldIds.delete(abs));
    }
    const { snapshotId, nodes } = await known.ids;
    return { state: "loaded", from, snapshotId, nodes };
  } catch (error) {
    return { state: "error", from, reason: error instanceof Error ? error.message : String(error) };
  }
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

/** A generated reading aid beside the specs (the explained map, explanations, discovered flows, the project tour): never a spec. */
export function readingAid(specDir: string, abs: string): boolean {
  return [EXPLAINED_MAP_DIR, "explain", DISCOVERED_FLOWS_DIR, TOUR_FILE].some((dir) => within(abs, join(specDir, dir)));
}

/**
 * Why `check` does not read `abs` as a spec, or null when it does: a `.md`
 * file the walk of the spec directory reaches (no hidden directory,
 * `node_modules` or `target` on the way) outside the reading aids.
 */
export function specPathProblem(config: Config, abs: string): string | null {
  const specDir = join(config.root, config.dir);
  const reason =
    !abs.endsWith(".md") ? "not a `.md` file"
    : !within(abs, specDir) ? `outside the spec directory \`${config.dir}/\``
    : !walkReaches(specDir, abs) ? "under a hidden directory, `node_modules` or `target`, which check skips"
    : readingAid(specDir, abs) ? "a generated reading aid, not a spec"
    : null;
  return reason === null ? null : `\`keylang check\` does not read this file as a spec: ${reason}`;
}

export function within(abs: string, dir: string): boolean {
  const rel = relative(dir, abs);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}
