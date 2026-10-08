// `keylang map`: source files → facts → graph → map/*.md + .keylang/index.json.

import { existsSync, readdirSync, readFileSync, rmdirSync, rmSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseToml } from "smol-toml";
import { briefOf, readmeBrief } from "./brief.ts";
import { classifySources, CONFIG_FILE, isAnalysed, layerGlobWarnings, sourceTree, toPosix, type Config } from "./config.ts";
import { globDirectory } from "./glob.ts";
import { languageOf } from "./languages.ts";
import { compareText } from "./span.ts";
import type { FileFacts } from "./extract/facts.ts";
import { frontendFor } from "./frontends.ts";
import { isGeneratedMap, renderExplainedMap, renderMap } from "./emit.ts";
import { explanationOf, loadBriefs } from "./explanations.ts";
import { buildGraph, placeFile, type Graph } from "./graph.ts";
import { FACT_CACHE_FILE, FactCache } from "./fact-cache.ts";
import { landing, writeAtomic, writeProblem } from "./safe-write.ts";
import { collectEntries, ENTRY_MANIFESTS, type EntryManifests } from "./entries.ts";
import { buildSnapshot, EXTRACTOR_VERSION, grammarVersions, sha256, type AnalysisSnapshot, type RepositoryDocs, type SystemDoc } from "./snapshot.ts";

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
  /** The text of the fact cache for the next process (`persist`); null otherwise. Written by `commitMap`, or saved best-effort by an analysis (`saveFactCache`). */
  factCache: string | null;
}

/**
 * `persist` prepares the fact cache for the next process: `true` always
 * (`keylang map`, whose commit step writes it), `"changed"` only when the
 * facts of this run differ from the cache on disk (an analysis that saves it
 * best-effort); generation writes nothing.
 * `overlay` gives unsaved text of source files by absolute path (the language server).
 */
export async function generateMap(config: Config, options: { persist?: boolean | "changed"; overlay?: ReadonlyMap<string, string> } = {}): Promise<MapResult> {
  // With an explicit config a file outside every layer is a finding
  // (`unassigned`); with guessed layers it is most likely not product code.
  // One walk sorts every source file into what is read, excluded and outside.
  const tree = classifySources(config);
  const all = tree.analysed;
  // An unsaved or proposed file that is not on disk yet is a source too (`spec-to-code` candidates).
  const added = [...(options.overlay?.keys() ?? [])].map((abs) => toPosix(relative(config.root, abs))).filter((rel) => {
    const language = languageOf(rel);
    return !rel.startsWith("../") && !all.includes(rel) && language !== undefined && config.languages.includes(language) && isAnalysed(rel, config);
  });
  if (added.length > 0) {
    all.push(...added);
    all.sort(compareText);
  }
  // One read per file: the manifest hash, the cache key and the extracted facts come from the same text.
  const indexed: { path: string; sha256: string }[] = [];
  const sources = new Map<string, { text: string; sha256: string }>();
  // Files keylang may not read (EACCES/EPERM): opaque modules and holes, as an unreadable directory.
  const unreadableFiles: { file: string; reason: string }[] = [];
  for (const p of [...all]) {
    const abs = join(config.root, p);
    const src = options.overlay?.get(abs) ?? readAnalysedSource(abs);
    if (src === null || typeof src !== "string") {
      // Removed between listing and reading: not part of this snapshot. Not readable: a hole, its module opaque.
      all.splice(all.indexOf(p), 1);
      if (src !== null && (!config.guessed || placeFile(config, p) !== null)) unreadableFiles.push({ file: p, reason: src.unreadable });
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
  const factCache = options.persist === true || (options.persist === "changed" && cache.changed()) ? cache.serialize() : null;
  // An explicitly excluded file is a module with unknown contents: in its layer, or in `unassigned`
  // under an explicit config. A guessed layout keeps a file outside its guessed layers out of the graph.
  const excluded = tree.excluded.filter((p) => !config.guessed || placeFile(config, p) !== null);
  for (const p of excluded) facts.push(opaqueFacts(p));
  // A file `outside` the architecture is not read either, but it is no hole: a module of the layer `outside`.
  const outside = tree.outside;
  for (const p of outside) facts.push(opaqueFacts(p));
  for (const { file } of unreadableFiles) facts.push(opaqueFacts(file));
  const graph = buildGraph(config, facts);
  // Layers written in keylang.json that overlap or match nothing: the layout still works, so a warning, first.
  if (!config.guessed) graph.warnings.unshift(...layerGlobWarnings(config, [...all, ...excluded, ...unreadableFiles.map((u) => u.file)].sort(compareText)));
  for (const [files, comment] of [[excluded, "excluded"], [outside, "outside"]] as const) {
    for (const p of files) {
      const module = graph.byPath.get(p);
      if (module) module.comment = comment;
    }
  }
  const mapDir = `${config.dir}/map`;
  // An unreadable directory inside a layer: a hole of the module IDs its files would have.
  const unreadable = tree.unreadable.flatMap(({ dir, reason }) => {
    graph.warnings.push(`\`${dir}\`: ${reason}; its files are not indexed`);
    const place = placeFile(config, `${dir}/${UNREADABLE_PROBE}`);
    return place === null ? [] : [{ file: dir, reason, source: [place.layer, ...place.segments.slice(0, -1)].join(".") }];
  });
  for (const { file, reason } of unreadableFiles) graph.warnings.push(`\`${file}\`: ${reason}; its contents are not indexed`);
  // Entry points: what the code and the root manifests write (ADR 0022 п. 5); the manifests join `snapshotId`.
  const manifests: EntryManifests = { "package.json": null, "pyproject.toml": null, "Cargo.toml": null };
  for (const name of ENTRY_MANIFESTS) manifests[name] = readSource(join(config.root, name));
  const entries = collectEntries({ graph, facts, manifests, exists: (path) => existsSync(join(config.root, path)) });
  const index = buildSnapshot(graph, config, indexed, [
    ...skipped.map((file) => ({ file, reason: "outside guessed layers" })),
    ...excluded.map((file) => ({ file, reason: "excluded by keylang.json" })),
    ...outside.map((file) => ({ file, reason: "outside the architecture (`outside` in keylang.json)", kind: "outside-file" as const })),
    ...unreadable,
    ...unreadableFiles,
  ], readRepositoryDocs(config), { list: entries, inputs: ENTRY_MANIFESTS.map((name) => [name, manifests[name]] as const) });
  let explained: Map<string, string> | null = null;
  if (config.explain.map) {
    const briefs = loadBriefs(config);
    explained = renderExplainedMap(index, `${config.dir}/${EXPLAINED_MAP_DIR}`, (id) => explanationOf(index, briefs, id));
  }
  return { graph, files: renderMap(index, mapDir), explained, index, skipped: skipped.length, facts: { reused: cache.reused, extracted: cache.extracted }, factCache };
}

/** Root manifests a repository names and describes itself in, in the order they are asked. */
const ROOT_MANIFESTS = ["package.json", "Cargo.toml", "pyproject.toml", "composer.json"] as const;

/**
 * What the repository writes about itself (ADR 0014, the system and container
 * levels of C4): the root README or a root manifest, and the README in each
 * layer's own directory. Read on every analysis, so an edit shows in the
 * next map without touching `snapshotId`.
 */
function readRepositoryDocs(config: Config): RepositoryDocs {
  const layers = new Map<string, string>();
  for (const [layer, globs] of config.layers) {
    const dir = globDirectory(globs);
    const readme = dir === null ? null : readReadme(config.root, dir);
    const brief = readme === null ? null : readmeBrief(readme.text);
    if (brief !== null) layers.set(layer, brief);
  }
  return { system: readSystemDoc(config.root), layers };
}

function readSystemDoc(root: string): SystemDoc {
  const about = ROOT_MANIFESTS.map((file) => ({ file, ...manifestAbout(file, readSource(join(root, file))) }));
  const name = about.find((m) => m.name !== null)?.name ?? null;
  const readme = readReadme(root, "");
  const fromReadme = readme === null ? null : readmeBrief(readme.text);
  if (readme !== null && fromReadme !== null) return { name, brief: fromReadme, source: readme.path };
  for (const m of about) {
    const brief = m.description === null ? null : briefOf(m.description);
    if (brief !== null) return { name, brief, source: m.file };
  }
  return { name, brief: null, source: null };
}

/** `README.md` in `dir` (relative, POSIX; "" for the root), its name in any case; null without one. */
function readReadme(root: string, dir: string): { path: string; text: string } | null {
  let names: string[];
  try {
    names = readdirSync(join(root, dir), { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.toLowerCase() === "readme.md")
      .map((e) => e.name)
      .sort(compareText);
  } catch {
    return null;
  }
  const name = names[0];
  if (name === undefined) return null;
  const text = readSource(join(root, dir, name));
  return text === null ? null : { path: dir === "" ? name : `${dir}/${name}`, text };
}

/**
 * `name` and `description` of a root manifest: `package.json` and
 * `composer.json` at the top, `[package]` (or `[workspace.package]`) of
 * `Cargo.toml`, `[project]` of `pyproject.toml`. A manifest that does not parse gives neither: the
 * analysis reports it where it reads the manifest's packages.
 */
function manifestAbout(file: (typeof ROOT_MANIFESTS)[number], text: string | null): { name: string | null; description: string | null } {
  if (text === null) return { name: null, description: null };
  let data: unknown;
  try {
    data = file === "package.json" || file === "composer.json" ? JSON.parse(text) : parseToml(text);
  } catch {
    return { name: null, description: null };
  }
  const field = (value: unknown, key: string): unknown => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>)[key] : undefined);
  const sections = file === "Cargo.toml" ? [field(data, "package"), field(field(data, "workspace"), "package")] : file === "pyproject.toml" ? [field(data, "project")] : [data];
  const pick = (key: string): string | null => {
    for (const section of sections) {
      const value = field(section, key);
      if (typeof value === "string" && value.trim() !== "") return value.trim();
    }
    return null;
  };
  return { name: pick("name"), description: pick("description") };
}

/** The explained map's directory under the spec directory. */
export const EXPLAINED_MAP_DIR = "map-explained";

/** The directory of discovered flows under the spec directory: a view `keylang flows discover` writes, never read as specs. */
export const DISCOVERED_FLOWS_DIR = "flows-discovered";

/** The project tour `keylang tour --out` writes by default, under the spec directory: a view, never read as a spec. */
export const TOUR_FILE = "tour.md";

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

/** A source file's text as {@link readSource}, or the reason when keylang may not read it (EACCES/EPERM): a hole, not an I/O error. */
function readAnalysedSource(abs: string): string | null | { unreadable: string } {
  try {
    return readSource(abs);
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    if (code === "EACCES" || code === "EPERM") return { unreadable: `file is not readable (${code})` };
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
function targets(config: Config, r: MapResult): { dir: string; files: ReadonlyMap<string, string>; artifact: "map" | "explained" }[] {
  return [
    { dir: join(config.root, config.dir, "map"), files: r.files, artifact: "map" },
    { dir: join(config.root, config.dir, EXPLAINED_MAP_DIR), files: r.explained ?? new Map(), artifact: "explained" },
  ];
}

/** A generated file in a map directory that is not listed under its name. */
interface ExtraGenerated {
  path: string;
  text: string;
  /**
   * The listed name that opens the same file, or null. On a case-insensitive
   * file system `Domain.md` is `domain.md` after a layer renamed by case: it
   * is not stale but misspelled, and removing it after the write would delete
   * the new map.
   */
  alias: string | null;
}

/** Generated files in `dir` that should not be there under their names. */
function extraGenerated(dir: string, files: ReadonlyMap<string, string>): ExtraGenerated[] {
  if (!existsSync(dir)) return [];
  const identity = (p: string): string | null => {
    const st = statSync(p, { throwIfNoEntry: false });
    return st === undefined ? null : `${st.dev}:${st.ino}`;
  };
  const listed = new Map<string, string>();
  for (const name of files.keys()) {
    const id = identity(join(dir, name));
    if (id !== null) listed.set(id, name);
  }
  const extra: ExtraGenerated[] = [];
  for (const e of readdirSync(dir)) {
    if (!e.endsWith(".md") || files.has(e)) continue;
    const p = join(dir, e);
    // A directory or a dangling link named `*.md` is no file of the generator: not read, not removed.
    const text = readOrNull(p);
    if (text === null || !isGeneratedMap(text)) continue;
    const id = identity(p);
    extra.push({ path: p, text, alias: id === null ? null : (listed.get(id) ?? null) });
  }
  return extra;
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

/** What a step of the map's commit touches. */
export type MapArtifact = "map" | "explained" | "index" | "facts";

/** One file step of `keylang map`: a path relative to the root, POSIX. */
export interface MapStep {
  path: string;
  action: "write" | "remove";
  artifact: MapArtifact;
}

interface PlannedStep extends MapStep {
  /** `write`: the new bytes. */
  text: string;
  /**
   * What the file must still hold when the step runs: its bytes, or null for
   * no file. Undefined: not compared — the index and the fact cache are only
   * the generator's own output.
   */
  expect: string | null | undefined;
}

/**
 * What `keylang map` will do, computed before anything is written: the
 * expected bytes of every target, the removals, and what the render was made
 * from. Internal to one operation — not a stored format.
 */
export interface MapPlan {
  root: string;
  config: Config;
  /** Target files that exist without the keylang:generated marker: they block every step. Relative, sorted. */
  conflicts: string[];
  steps: PlannedStep[];
  /** Directories of a map turned off: removed after the steps when they are empty. */
  emptyDirs: string[];
  inputs: MapInputs;
}

/** What a snapshot was computed from: `keylang.json` and the source files. A change in either makes a plan built on it unfit. */
export interface SourceInputs {
  /** The text of `keylang.json`, or null without one. */
  config: string | null;
  /** Every source file the snapshot read, with its hash (the snapshot manifest). */
  sources: readonly { path: string; sha256: string }[];
}

/** The inputs of the render: a change in any makes the plan unfit. */
interface MapInputs extends SourceInputs {
  /** A hash of the briefs the explained map was rendered with; null when it is off. */
  briefs: string | null;
}

/**
 * The inputs of a snapshot: the `keylang.json` text the analysis parsed
 * (not the disk now — a save made during the analysis must be caught at the
 * commit, not become the base) and the snapshot's manifest.
 */
export function sourceInputs(config: Config, sources: readonly { path: string; sha256: string }[]): SourceInputs {
  return { config: config.text, sources };
}

/**
 * How `keylang.json` and the source files differ from the ones `subject` was
 * computed from (`path: reason` lines, empty when none does): a changed
 * config, a source added, changed or removed since.
 */
export function sourceInputProblems(config: Config, inputs: SourceInputs, subject: string): string[] {
  const problems: string[] = [];
  if (readOrNull(join(config.root, CONFIG_FILE)) !== inputs.config) problems.push(`${CONFIG_FILE}: changed on disk while ${subject} was computed`);
  const before = new Map(inputs.sources.map((file) => [file.path, file.sha256]));
  const now = new Map<string, string>();
  for (const path of sourceTree(config).files) {
    const text = readOrNull(join(config.root, path));
    if (text !== null) now.set(path, sha256(text));
  }
  for (const [path, hash] of now) {
    const old = before.get(path);
    if (old === undefined) problems.push(`${path}: added while ${subject} was computed`);
    else if (old !== hash) problems.push(`${path}: changed on disk while ${subject} was computed`);
  }
  for (const path of before.keys()) if (!now.has(path)) problems.push(`${path}: removed while ${subject} was computed`);
  return problems;
}

/** A step after the commit: done, failed with the reason, or never tried. */
export interface CommittedStep extends MapStep {
  state: "completed" | "failed" | "not-attempted";
  error?: string;
}

export interface MapCommit {
  steps: CommittedStep[];
  /** `cancelled`: the signal stopped the commit between two steps; what was done stays done. */
  outcome: "completed" | "failed" | "cancelled";
}

/**
 * Plans both maps, the index and the fact cache: a write for every missing or
 * changed generated file, a removal for every generated file of a layer that
 * is gone (or of a map turned off). Reads the disk, writes nothing.
 */
export function planMap(config: Config, r: MapResult): MapPlan {
  const rel = (abs: string): string => toPosix(relative(config.root, abs));
  const steps: PlannedStep[] = [];
  const emptyDirs: string[] = [];
  for (const { dir, files, artifact } of targets(config, r)) {
    const extra = extraGenerated(dir, files);
    const aliases = new Map(extra.flatMap((e) => (e.alias === null ? [] : [[e.alias, e] as const])));
    for (const [name, text] of files) {
      const p = join(dir, name);
      const current = readOrNull(p);
      const alias = aliases.get(name);
      // The same file under another spelling: removed first, then written under the listed name.
      if (alias !== undefined) {
        steps.push({ path: rel(alias.path), action: "remove", artifact, text: "", expect: alias.text });
        steps.push({ path: rel(p), action: "write", artifact, text, expect: current });
      } else if (current !== text) steps.push({ path: rel(p), action: "write", artifact, text, expect: current });
    }
    // Only generated files of layers that no longer exist (or of a map turned off) may be removed.
    for (const e of extra) if (e.alias === null) steps.push({ path: rel(e.path), action: "remove", artifact, text: "", expect: e.text });
    // A map turned off leaves no empty directory behind; one with manual files stays.
    if (files.size === 0) emptyDirs.push(rel(dir));
  }
  steps.push({ path: ".keylang/index.json", action: "write", artifact: "index", text: `${JSON.stringify(r.index, null, 2)}\n`, expect: undefined });
  if (r.factCache !== null) steps.push({ path: FACT_CACHE_FILE, action: "write", artifact: "facts", text: r.factCache, expect: undefined });
  return {
    root: config.root,
    config,
    conflicts: mapConflicts(config, r).map(rel),
    steps,
    emptyDirs,
    inputs: { ...sourceInputs(config, r.index.manifest.files), briefs: config.explain.map ? briefsKey(config) : null },
  };
}

/**
 * Why the plan may not be committed now, as `path: reason` lines; empty when
 * it may. Every target must pass the repository's write rules (a plain path
 * that stays inside the repository through links) and still hold the bytes
 * the plan saw — a manual file created meanwhile included; `keylang.json`,
 * the source files and the briefs must be the ones the map was rendered from.
 */
export function mapPlanProblems(plan: MapPlan): string[] {
  const problems: string[] = [];
  for (const step of plan.steps) {
    const problem = writeProblem(plan.root, step.path, { generated: true, ...(step.expect === undefined ? {} : { expect: step.expect }) });
    if (problem !== null) problems.push(`${step.path}: ${problem}`);
  }
  problems.push(...sourceInputProblems(plan.config, plan.inputs, "the map"));
  if (plan.inputs.briefs !== null && briefsKey(plan.config) !== plan.inputs.briefs) problems.push(`${plan.config.dir}/explain/brief: changed while the map was computed`);
  return problems;
}

/**
 * Runs the plan's steps in order, each an atomic write (the generator's exact
 * bytes, the permissions of the file it replaces, links followed inside the
 * repository) or a removal. The signal is checked between steps: the step
 * under way finishes. `onStep` is told before each step starts. The first failure stops the rest, which stay
 * not-attempted; nothing done is rolled back. The caller checks
 * `mapPlanProblems` first.
 */
export async function commitMap(plan: MapPlan, options: { signal?: AbortSignal; onStep?: (step: MapStep) => void } = {}): Promise<MapCommit> {
  const steps: CommittedStep[] = plan.steps.map(({ path, action, artifact }) => ({ path, action, artifact, state: "not-attempted" }));
  for (const [i, step] of plan.steps.entries()) {
    // One turn of the event loop between steps: a cancel message sent to a worker arrives here.
    await new Promise<void>((done) => setImmediate(done));
    if (options.signal?.aborted) return { steps, outcome: "cancelled" };
    options.onStep?.({ path: step.path, action: step.action, artifact: step.artifact });
    const abs = join(plan.root, step.path);
    try {
      if (step.action === "write") writeAtomic(landing(abs) ?? abs, step.text, { exact: true });
      else rmSync(abs);
      steps[i]!.state = "completed";
    } catch (error) {
      steps[i] = { ...steps[i]!, state: "failed", error: error instanceof Error ? error.message : String(error) };
      return { steps, outcome: "failed" };
    }
  }
  for (const dir of plan.emptyDirs) {
    const abs = join(plan.root, dir);
    try {
      if (existsSync(abs) && readdirSync(abs).length === 0) rmdirSync(abs);
    } catch {
      // An empty directory left behind is no failure of the map.
    }
  }
  return { steps, outcome: "completed" };
}

/** A hash of the briefs the explained map reads. */
function briefsKey(config: Config): string {
  return sha256(JSON.stringify([...loadBriefs(config)]));
}

/** A file's text, or null when there is none. */
function readOrNull(abs: string): string | null {
  try {
    return readFileSync(abs, "utf8");
  } catch {
    return null;
  }
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
      // A file that differs only by CRLF (a Windows checkout with core.autocrlf) is current, as for baseline and wire; `map` writes LF.
      const current = readOrNull(p);
      if (current === null || current.replace(/\r\n/g, "\n") !== text) stale.push(p);
    }
    // A misspelled alias of a listed file is stale too: `map` renames it.
    stale.push(...extraGenerated(dir, files).map((e) => e.path));
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
