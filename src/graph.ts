// Facts → graph: files become modules in layers, declarations become fn/type
// nodes, imports become dependencies. A resolved call is a syntactic edge;
// a local or missing callee stays a gap instead of a confirmed edge.

import { posix } from "node:path";
import { isAssumed, isExcluded, isOutside, layerName, OUTSIDE_LAYER, type Config } from "./config.ts";
import { readManifests, type DeclaredPackage } from "./declared-packages.ts";
import { resolveExports, UNKNOWN_EXPORT, type ExportEntry, type ExportForm, type ExportKind, type ExportRowInput, type ExportTarget, type ModuleExportsInput } from "./exports.ts";
import type { CallFact, DeclFact, ExportRow, FileFacts, HookFact, ImportBinding, MethodSigFact, OutsideDeclFact, ResultCallFact, ResultTypeFact, TypeRefFact, ValueOfFact } from "./extract/facts.ts";
import { assignExternalIds, EXTERNAL, externalSegment } from "./external-ids.ts";
import { globPrefix, matchesGlob } from "./glob.ts";
import { frontendFor, frontendOf, type Frontend, type SourceResolver } from "./frontends.ts";
import { assumedTarget, type Resolution } from "./imports.ts";
import { asciiLowerCase, caselessNames, constructorName, implicitMember, interfaceTypes, languageOf, LANGUAGES } from "./languages.ts";
import { compareText } from "./span.ts";
import type { FrameworkInput, TypeName } from "./frameworks/adapter.ts";
import { FrameworkBindings, type BoundCall, type ResolvedType } from "./frameworks/bindings.ts";
import { frameworkEntries, type ObserverEdge } from "./frameworks/entries.ts";
import { eventIds, EVENTS_LAYER } from "./frameworks/events.ts";
import type { EntryPoint, Interception } from "./snapshot.ts";

export { EXTERNAL };

export interface Graph {
  layers: Layer[];
  modules: Map<string, Module>;
  /** Source path → module that owns the file after ID merges. */
  byPath: Map<string, Module>;
  stats: Stats;
  warnings: string[];
  /** Analysis holes kept beside the graph so a clean edge list is not a claim of full coverage. */
  gaps: Gap[];
  /** Imports of files `assume` lists: neither an edge nor a hole (`assumed-import` coverage). */
  assumed: AssumedImport[];
  /** Type edges and calls with more than one target. Confirmed calls stay on functions. */
  openEdges: OpenEdge[];
  /** Config files import resolution read (`tsconfig.json`, `package.json`), with their text or null. */
  resolverInputs: Map<string, string | null>;
  /** Public names of every indexed module, resolved to symbols; sorted by module and name. */
  exports: ExportEntry[];
  /** Packages the manifests at the root and on the ancestors of analysed files declare, sorted by id. */
  packages: DeclaredPackage[];
  /** Events a framework's code dispatches or its config observes (ADR 0022 п. 6), by ID. */
  events: EventNode[];
  /** Entry points a framework's config names (ADR 0022 п. 5): observers, routes, REST, GraphQL, cron, consumers, commands. */
  frameworkEntries: EntryPoint[];
}

/**
 * An event (ADR 0022 п. 6): a node of the generated group `events`, named by
 * the literal code dispatches it with. Its calls are the observers the
 * framework runs when it is dispatched, each at its config line.
 */
export interface EventNode {
  id: string;
  /** The literal as written. */
  name: string;
  /** The first place it is written: a dispatch, else an observer's config line. */
  file: string | null;
  line: number;
  col: number;
  calls: (Call & { file: string })[];
}

export interface Gap {
  /**
   * `ambiguous-binding`: a call through a type a framework's config binds to two classes in one
   * area; `unresolved-binding`: a config fact names a class the snapshot does not have (ADR 0022);
   * `dynamic-event`: a framework's dispatch whose event name is not a literal.
   */
  kind: "unresolved-import" | "dynamic-call" | "unresolved-call" | "parse-error" | "unassigned-file" | "unsupported" | "ambiguous-binding" | "unresolved-binding" | "dynamic-event";
  file: string;
  line: number;
  col: number;
  endLine: number;
  endCol: number;
  text: string;
  reason: string;
  /** Module or function that contains the gap, when there is one. */
  source: string | null;
  /** A call through an expression whose text does not end in the member it calls (PHP `$this->repo()->ship()`): that member, which a flow matches by name. */
  name?: string;
}

/** An import of a file `assume` lists: the architecture imports it, and keylang neither reads nor requires it. */
export type AssumedImport = Omit<Gap, "kind">;

export interface OpenEdge {
  kind: "call" | "type";
  source: string;
  target: string | null;
  candidates: string[];
  file: string;
  line: number;
  col: number;
  endLine: number;
  endCol: number;
  text: string;
  resolution: "resolved" | "ambiguous" | "unresolved";
}

export interface Layer {
  name: string;
  /** Top-level modules in map order. */
  modules: Module[];
}

export interface Module {
  id: string;
  layer: string;
  name: string;
  /** Source file (or directory) relative to root; null for the external layer. */
  path: string | null;
  line: number | null;
  col: number | null;
  endLine: number | null;
  endCol: number | null;
  /** True for a directory node created only to nest file modules. */
  synthetic: boolean;
  /** A class declared in the module's source: its children are members. Other modules are files, directories or packages. */
  class: boolean;
  /** Original package name for external modules. */
  comment: string | null;
  /** Documentation comment of the module's file (its index file for a directory) or of the class; null without one. */
  doc: string | null;
  deps: Dep[];
  fns: Fn[];
  types: TypeNode[];
  children: Module[];
  /** `complete` may list no members. `opaque` does not confirm that an arbitrary name exists. */
  members: "complete" | "opaque";
  /** `export * from` sources: an indexed module, or null with the reason its names are unknown. */
  starSources: { target: string | null; reason: string }[];
  /**
   * Fingerprint of the value code outside every fn and type: a file's top-level
   * constants, assignments and calls (`<file> <hash>` per file of the module,
   * one per line), a class body's fields and constants. Absent when there is none.
   */
  values?: string;
}

export interface Dep {
  alias: string;
  target: string;
  /** The file with the import: in a directory module, not always the module's first file. */
  file: string;
  line: number;
  col: number;
  endLine: number;
  endCol: number;
  text: string;
  reexport: boolean;
  /**
   * Every import of this kind from the module names types only (TypeScript `import type`,
   * `export type … from`, or every name `type` without `verbatimModuleSyntax`): erased from
   * the code that runs, so `no-cycles` skips it.
   */
  typeOnly?: true;
  /** The import stands only in a docblock the language does not check (PHP `@var Foo`): provenance `docblock`. */
  docblock?: true;
}

export interface Fn {
  id: string;
  name: string;
  /** The file that declares it (a directory module has several). */
  file: string | null;
  line: number;
  col: number;
  endLine: number;
  endCol: number;
  signature: string | null;
  exported: boolean;
  /** A `static` class member: called on the class (`X.m()`), not on an instance. */
  static?: true;
  /** The name as written, when the ID segment differs (`m` for `X.m-static`, `go` for `Y.go-private`). */
  written?: string;
  /** Body and signature of every declaration of the fn (overloads joined); absent when an extractor gives none. */
  fingerprint?: string;
  calls: Call[];
  /** Code may call the function without naming it: it is read as a value, is an accessor, or is called implicitly. */
  escapes?: Escape;
  /** Documentation comment of the first declaration that has one (overloads share a node). */
  doc?: string;
  /** Plugin methods a framework's config wraps the fn in (ADR 0022), in the order they run. */
  interceptedBy?: Interception[];
}

export interface Escape {
  file: string;
  line: number;
  col: number;
  reason: string;
}

/** How a call edge that is not a plain call of the code came about; see `Call.via`. */
export type Via = "default" | "injected" | "callable-arg" | "closure-arg" | "preference" | "argument" | "plugin:before" | "plugin:around" | "plugin:after" | "dispatch" | "observer" | "generated-factory";

export interface Call {
  target: string;
  line: number;
  col: number;
  endLine: number;
  endCol: number;
  text: string;
  /**
   * Absent for a call written in the code. `default`: the default of a hook
   * (`request.generate ?? generateMap`); `injected`: a value a resolved caller
   * passes for the hook (`analyze({ generate: worker.generate })`, at `site`);
   * `callable-arg`: a callable reference the fn passes as an argument of a
   * call (`[$this, 'm']`, `this.m.bind(this)`, `self.m`, `Self::m`), whose
   * callee may run it — the edge sits at the argument; `closure-arg`: a call
   * written in a closure literal the fn passes as an argument (`run(() =>
   * m())`), at `site`, so the enclosing call's callee may run it. `--static
   * behavior` follows all four; `shape` none. A call the framework makes by
   * its config (ADR 0022): `preference`, `argument`, `plugin:before|around|after`,
   * at `site` in the config; `behavior` follows them, `shape` does not.
   * `dispatch`: a call of the framework's dispatcher with a literal event
   * name, to the event's node (Magento `dispatch`, NestJS `emit`), or a job
   * the fn hands to a queue (Celery `task.delay()`), at `site` of the task's
   * registration; `observer`: from an event to the fn an observer runs
   * (Magento `events.xml`, NestJS `@OnEvent`), at its config line, or to a
   * receiver of a signal the fn sends (Django `signal.send()`).
   * PHP frameworks: Laravel `$listen` and Symfony listeners, queued jobs and
   * Messenger handlers are observers of an event named by its class.
   */
  via?: Via;
  /** Config edges: the area the fact applies in. */
  scope?: string;
  /** Config edges: the module whose config declares the edge. */
  owner?: string;
  /** Config edges: the fact in words, for the verdict. */
  binding?: string;
  /** Plugin edges: the fn the plugin wraps at this call. */
  intercepts?: string;
  /** The local, parameter or field the hook call goes through. */
  hook?: string;
  /** `file:line:col` of the call that injects the value, or of the closure passed as an argument. */
  site?: string;
  /** The call sits in a closure of the function: whoever holds that value may run it. */
  closure?: true;
  /** `file:line:col` of the docblock that types the receiver (PHP `@var`, `@param`, `@return`): the edge's provenance is `docblock`. */
  docblock?: string;
  /**
   * The target is a module `outside` the architecture, whose members are no nodes (ADR 0011):
   * the member the call runs, as declared there (`Magento\Framework\DataObject::getData`).
   */
  member?: string;
  /**
   * The receiver's class is written in another declaration than the call's file: the result type
   * of the call that returned the value, or a base's property (PHP, business-flows 40). The
   * dependency rules see is on that declaration, not this edge.
   */
  indirect?: true;
}

export interface TypeNode {
  id: string;
  name: string;
  file: string | null;
  line: number;
  col: number;
  endLine: number;
  endCol: number;
  signature: string | null;
  exported: boolean;
  fingerprint?: string;
  doc?: string;
}

export interface Stats {
  files: number;
  modules: number;
  fns: number;
  types: number;
  deps: number;
  callsResolved: number;
  callsUnresolved: number;
  /** Calls into external packages and built-ins (not followed). */
  callsExternal: number;
  /** Calls through local values — `x.method()`, callbacks, closures — that a syntactic pass cannot follow. */
  callsDynamic: number;
  importsUnresolved: number;
  unassignedFiles: number;
}

/** Words that, under a module, start a declaration rather than a dependency alias. */
const CONTEXT_ALIAS = new Set(["module", "fn", "type", "event", "calls"]);

export const UNASSIGNED = "unassigned";

const NO_GLOBALS = { values: new Set<string>(), types: new Set<string>() };

function globalsOf(file: string): Frontend["globals"] {
  return frontendFor(file)?.globals ?? NO_GLOBALS;
}

interface FileEntry {
  facts: FileFacts;
  module: Module;
}

export function buildGraph(config: Config, files: FileFacts[], frameworks: readonly FrameworkInput[] = []): Graph {
  // Resolvers read their config files up front: the snapshot id depends on them even without imports.
  // They see the files of this analysis, unsaved ones included, whatever is on disk now.
  const sources = new Set(files.map((f) => f.path));
  const resolvers = new Map<Frontend, SourceResolver>();
  for (const language of config.languages) {
    const frontend = frontendOf(language);
    if (!resolvers.has(frontend)) resolvers.set(frontend, frontend.resolver(config.root, sources, files, config));
  }
  const resolverFor = (file: string): SourceResolver | null => {
    const frontend = frontendFor(file);
    return frontend === undefined ? null : resolvers.get(frontend) ?? null;
  };
  const resolve = (file: string, spec: string): Resolution => resolverFor(file)?.resolve(file, spec) ?? { kind: "unresolved" };
  const modules = new Map<string, Module>();
  const layers = new Map<string, Layer>();
  const stats: Stats = { files: files.length, modules: 0, fns: 0, types: 0, deps: 0, callsResolved: 0, callsUnresolved: 0, callsExternal: 0, callsDynamic: 0, importsUnresolved: 0, unassignedFiles: 0 };
  const warnings: string[] = [];
  const gaps: Gap[] = [];
  const assumedImports: AssumedImport[] = [];
  const openEdges: OpenEdge[] = [];
  for (const name of config.layers.keys()) layers.set(name, { name, modules: [] });

  const getLayer = (name: string): Layer => {
    let l = layers.get(name);
    if (!l) {
      l = { name, modules: [] };
      layers.set(name, l);
    }
    return l;
  };

  /** `dir`: the path the module stands for without an extension (`src/a/b` for `src/a/b.ts`, `src/a/b/index.ts`, or the directory in `dir` mode); its parent is the directory above. */
  const ensureModule = (id: string, layer: string, path: string | null, line: number | null, synthetic: boolean, dir: string | null): Module => {
    let m = modules.get(id);
    if (m) {
      if (m.synthetic && !synthetic) {
        m.synthetic = false;
        m.path = path;
        m.line = line;
      }
      return m;
    }
    const dot = id.lastIndexOf(".");
    const name = id.slice(dot + 1);
    m = { id, layer, name, path, line, col: line === null ? null : 1, endLine: null, endCol: null, synthetic, class: false, comment: null, doc: null, deps: [], fns: [], types: [], children: [], members: layer === EXTERNAL ? "opaque" : "complete", starSources: [] };
    modules.set(id, m);
    const parentId = id.slice(0, dot);
    const parentDir = dir === null ? null : posix.dirname(dir);
    if (parentId === layer) getLayer(layer).modules.push(m);
    else ensureModule(parentId, layer, parentDir, null, true, parentDir).children.push(m);
    return m;
  };
  const representative = (m: Module, f: FileFacts): void => {
    m.path = f.path;
    m.line = 1;
    m.col = 1;
    m.endLine = f.endLine;
    m.endCol = f.endCol;
    m.doc = f.doc ?? null;
  };

  // 1. Files → modules.
  const byFile = new Map<string, FileEntry>();
  /** Module id → the path its first file stands for; a file standing for another path is an ID collision. */
  const stems = new Map<string, { stem: string; file: string; glob: string | null }>();
  const collided = new Set<Module>();
  for (const f of files) {
    const placed = placeFile(config, f.path);
    if (!placed) stats.unassignedFiles++;
    const layer = placed?.layer ?? UNASSIGNED;
    const stem = placed?.stem ?? f.path.replace(/\.[^./]+$/, "");
    const segments = placed?.segments ?? stem.split("/").map(layerName);
    const id = [layer, ...segments].join(".");
    const m = ensureModule(id, layer, f.path, 1, false, stem);
    const first = stems.get(id);
    if (!first) {
      stems.set(id, { stem, file: f.path, glob: placed?.glob ?? null });
      representative(m, f);
    } else if (first.stem !== stem) {
      // `foo.bar.ts` and `foo_bar.ts`, `2fa/` and `_2fa/`: two paths that sanitize to one ID. Their members cannot be told apart.
      // Two globs of one layer can strip different prefixes to one path (`app/core/__init__.py`, `app/db/__init__.py`); renaming may be impossible, splitting the layer is not.
      const globs = placed?.glob && first.glob && placed.glob !== first.glob ? `; or split layer \`${layer}\` so \`${first.glob}\` and \`${placed.glob}\` are separate layers` : "";
      const reason = `module ID collision: same module ID as \`${first.file}\` (\`${id}\`) from another path; the module is opaque until one of them is renamed${globs}`;
      warnings.push(`${f.path}: ${reason}`);
      gaps.push({ kind: "unsupported", file: f.path, line: 1, col: 1, endLine: f.endLine, endCol: f.endCol, text: "", reason, source: m.id });
      collided.add(m);
    } else if (config.module === "dir") {
      // Every file of a directory is its module; the index file (`index.ts`, `mod.rs`, `__init__.py`) stands for it.
      if (isIndexFile(f.path) && !(m.path !== null && isIndexFile(m.path))) representative(m, f);
    } else {
      // `x.ts` and `x/index.ts` are one module.
      warnings.push(`${f.path}: same module ID as ${m.path} (${id}); merged`);
    }
    byFile.set(f.path, { facts: f, module: m });
    if (!placed) gaps.push({ kind: "unassigned-file", file: f.path, line: 1, col: 1, endLine: f.endLine, endCol: f.endCol, text: "", reason: "outside any layer", source: m.id });
  }

  // 2. Declarations. A file is a scope of its own: in a module of several files (`module: "dir"`,
  // `x.ts` beside `x/index.ts`) a name one file declares is not in scope in another, and the same
  // name declared by two files is two symbols.
  const moduleFiles = new Map<string, FileEntry[]>();
  for (const entry of byFile.values()) moduleFiles.set(entry.module.id, [...(moduleFiles.get(entry.module.id) ?? []), entry]);
  // Module id → name → the node that keeps the name; class id → member key (`m`, `static m`, `#m`, `static #m`) → fn id.
  const declModule = new Map<string, Map<string, string>>();
  /** File → name → node id: the file's own top-level declarations, the only ones its code names without an import. */
  const fileDecls = new Map<string, Map<string, string>>();
  const decls: Decls = { ids: new Map(), fns: new Map(), classes: new Map(), types: new Set(), members: new Map() };
  const segments = new Map<DeclFact, string>();
  for (const [id, entries] of moduleFiles) {
    declModule.set(id, new Map());
    for (const [d, segment] of topSegments(entries[0]!.module, entries.map((e) => e.facts), warnings)) segments.set(d, segment);
  }
  for (const { facts, module } of byFile.values()) {
    const scope = new Map<string, string>();
    fileDecls.set(facts.path, scope);
    const names = declModule.get(module.id)!;
    if (facts.values !== undefined) module.values = `${module.values === undefined ? "" : `${module.values}\n`}${facts.path} ${facts.values}`;
    for (const d of facts.decls) {
      const key = layerName(d.name);
      const segment = segments.get(d) ?? key;
      addDecl(module, d, scope, declModule, decls, stats, facts.path, { key, segment });
      const id = decls.ids.get(d);
      if (segment === key && id !== undefined && !names.has(key)) names.set(key, id);
    }
    for (const hole of facts.unsupported) {
      // A hole in one declaration (a Python decorator that may replace a fn) belongs to that declaration.
      const [head = "", ...rest] = hole.symbol === undefined ? [] : hole.symbol.split(".").map(layerName);
      const top = scope.get(head);
      const own = top === undefined ? null : [top, ...rest].join(".");
      const source = own !== null && (decls.fns.has(own) || decls.classes.has(own)) ? own : module.id;
      gaps.push({ kind: "unsupported", file: facts.path, line: hole.line, col: hole.col, endLine: hole.endLine, endCol: hole.endCol, text: hole.text, reason: hole.reason, source });
    }
    if (facts.completeness === "opaque") {
      markOpaque(module);
      if (facts.parseError) {
        gaps.push({ kind: "parse-error", file: facts.path, line: facts.parseError.line, col: 1, endLine: facts.parseError.line, endCol: 2, text: "", reason: facts.parseError.reason, source: module.id });
      }
    }
  }
  for (const module of collided) markOpaque(module);

  // 3. Imports → dependencies.
  const externalLayer = getLayer(EXTERNAL);
  // Declared and imported packages share one ID space: a package's ID does not
  // depend on which of two colliding packages the code happens to import.
  const resolverInputs = (): Map<string, string | null> => new Map([...resolvers.values()].flatMap((resolver) => [...resolver.inputs]));
  const manifests = readManifests(config, files.map((f) => f.path), resolverInputs());
  const assigned = assignExternalIds([...importedPackages(files, resolve), ...manifests.packages.map((p) => p.name)]);
  const externalIds = assigned.ids;
  warnings.push(...assigned.warnings);
  const packages = manifests.packages.map((p) => ({ ...p, id: externalIds.get(p.name)! })).sort((a, b) => compareText(a.id, b.id));
  /** The export-table key of a file's names: its module, or the file itself in a module of several files. */
  const unitOf = (path: string): string => {
    const module = byFile.get(path)?.module;
    if (!module) return path;
    return (moduleFiles.get(module.id)?.length ?? 0) > 1 ? `${FILE_UNIT}${path}` : module.id;
  };
  const importTargets = new Map<string, Map<string, ImportTarget[]>>(); // file → local → targets
  /** File → its `export * from` sources, as export-table keys: another file of its own module too. */
  const fileStars = new Map<string, { target: string | null; reason: string }[]>();
  /** File → what its glob imports (`use m::*`, `from m import *`) bring into scope. */
  const fileGlobs = new Map<string, GlobSource[]>();
  for (const { facts, module } of byFile.values()) {
    const locals = new Map<string, ImportTarget[]>();
    importTargets.set(facts.path, locals);
    // Keyed in NFC, as IDs are: code may write a name in NFD (`cafe` + U+0301).
    const bind = (b: ImportBinding, target: ImportTarget): void => {
      const key = b.local.normalize("NFC");
      locals.set(key, [...(locals.get(key) ?? []), target]);
    };
    const globs: GlobSource[] = [];
    fileGlobs.set(facts.path, globs);
    const stars: { target: string | null; reason: string }[] = [];
    fileStars.set(facts.path, stars);
    const starFrom = (source: { target: string | null; reason: string }): void => {
      stars.push(source);
      module.starSources.push(source);
    };
    const aliases = new Map<string, string>();
    const hole = (imp: FileFacts["imports"][number], reason: string): void => {
      stats.importsUnresolved++;
      warnings.push(`${facts.path}:${imp.line}: ${reason}`);
      gaps.push({ kind: "unresolved-import", file: facts.path, line: imp.line, col: imp.col, endLine: imp.endLine, endCol: imp.endCol, text: imp.text, reason, source: module.id });
    };
    for (const imp of facts.imports) {
      const r = resolve(facts.path, imp.source);
      const star = imp.reexport && imp.bindings.length === 0;
      /**
       * What a glob import of this source brings into scope: a module's table, or names keylang
       * cannot list — a path that is no whole module too (`use Kind::*` of an enum's variants,
       * Python `from .missing import *` that only the package resolves).
       */
      const globFrom = (unit: string | null, external: boolean): void => {
        if (imp.glob) globs.push({ unit, external });
      };
      // `assume`: a file the architecture imports that keylang neither reads nor requires, present or
      // absent. No edge and no hole; its names are bound like a package's, so calls through them are external.
      const assumed = config.assume.length === 0 ? null : assumedTarget(r, () => resolverFor(facts.path)?.wouldName?.(facts.path, imp.source) ?? [], (path) => isAssumed(path, config));
      if (assumed !== null) {
        assumedImports.push({ file: facts.path, line: imp.line, col: imp.col, endLine: imp.endLine, endCol: imp.endCol, text: imp.text, reason: `assumed import \`${imp.source}\` → \`${assumed}\` (\`assume\` in keylang.json)`, source: module.id });
        globFrom(null, true);
        for (const b of imp.bindings) bind(b, importTarget(ASSUMED_MODULE, ASSUMED_MODULE.id, b, false));
        if (star) starFrom({ target: null, reason: `re-export from assumed \`${imp.source}\`` });
        continue;
      }
      let target: Module | null = null;
      if (r.kind === "internal") {
        target = byFile.get(r.file)?.module ?? null;
        if (!target) {
          // A workspace package's entry (`dist/index.js`), a file of a language
          // keylang.json does not list, a file in a build directory or one that
          // appeared after the sources were read: the dependency is there, its target unknown.
          globFrom(null, false);
          const why = r.workspace ? `workspace package entry \`${r.file}\` is not indexed` : notIndexed(config, r.file);
          if (why === null || imp.optional) {
            // Left out on purpose: tests, declaration files, `exclude`, files outside guessed layers, non-source files.
            if (star) starFrom({ target: null, reason: `re-export from excluded \`${imp.source}\`` });
            continue;
          }
          hole(imp, `unresolved import \`${imp.source}\` (${why})`);
          if (star) starFrom({ target: null, reason: `re-export from unindexed \`${imp.source}\`` });
          continue;
        }
        // A file that imports itself is a self-loop; two files merged into one module are not:
        // another file of this module is no dependency, but what the import names is bound here.
        if (target === module && r.file !== facts.path) {
          const unit = unitOf(r.file);
          globFrom(r.whole === true && !r.nested ? unit : null, false);
          for (const b of r.nested ? [] : imp.bindings) bind(b, importTarget(target, unit, b, r.whole === true));
          if (star) stars.push({ target: unit, reason: "" });
          continue;
        }
      } else if (r.kind === "local") {
        // `crate::run()` or `self::X` in the file that declares them: the name is this module's own.
        for (const b of imp.bindings) bind(b, importTarget(module, unitOf(facts.path), b, false));
        continue;
      } else if (r.kind === "stdlib") {
        // Bound to a module outside the graph: calls through the name stay external, and no node or edge appears.
        globFrom(null, true);
        for (const b of imp.bindings) bind(b, importTarget(STDLIB_MODULE, STDLIB_MODULE.id, b, false));
        if (star) starFrom({ target: null, reason: `re-export from the standard library \`${imp.source}\`` });
        continue;
      } else if (r.kind === "generated") {
        globFrom(null, false);
        if (star) starFrom({ target: null, reason: `re-export from generated \`${imp.source}\`` });
        continue;
      } else if (r.kind === "external" || r.kind === "builtin") {
        const pkg = r.kind === "builtin" ? "node" : r.pkg;
        target = ensureModule(externalIds.get(pkg) ?? `${EXTERNAL}.${externalSegment(pkg)}`, EXTERNAL, null, null, false, null);
        if (pkg !== target.name) target.comment = pkg;
        if (externalLayer.modules.length === 0) layers.set(EXTERNAL, externalLayer);
      } else {
        // `new URL("./worker", import.meta.url)` without a source file behind it names no module.
        if (imp.optional) continue;
        globFrom(null, false);
        hole(imp, `unresolved import \`${imp.source}\``);
        if (star) starFrom({ target: null, reason: `re-export from unresolved \`${imp.source}\`` });
        continue;
      }
      const unit = r.kind === "internal" ? unitOf(r.file) : target.id;
      if (target.layer === EXTERNAL) globFrom(null, true);
      else if (r.kind === "internal" && r.file !== facts.path) globFrom(r.whole === true && !r.nested ? unit : null, false);
      if (star) starFrom(target.layer === EXTERNAL ? { target: null, reason: `re-export from external \`${imp.source}\`` } : { target: unit, reason: "" });
      // Rust `a::inner::f` with `mod inner {}` in `a.rs`: `f` is not a member keylang indexed, so the name stays unbound.
      for (const b of r.kind === "internal" && r.nested ? [] : imp.bindings) bind(b, importTarget(target, unit, b, r.kind === "internal" && r.whole === true));
      // `import type`, `export type … from`: a dependency of types only, erased from the code that
      // runs. So is `import { type A }` with every name `type`, unless the file's tsconfig sets
      // `verbatimModuleSyntax` (then `import {} from` loads the module; a resolver that cannot
      // tell keeps it). An edge like any other, which `no-cycles` alone skips.
      const erased = imp.typeOnly === true || (imp.inlineTypeOnly === true && resolverFor(facts.path)?.verbatimModuleSyntax?.(facts.path) === false);
      const typeOnly = erased ? { typeOnly: true as const } : {};
      // A name written only in a docblock (PHP `@var Foo`): an edge of provenance `docblock`, until the code names the module.
      const docblock = imp.docblock ? { docblock: true as const } : {};
      const at = { file: facts.path, line: imp.line, col: imp.col, endLine: imp.endLine, endCol: imp.endCol, text: imp.text };
      // `import { a } from "./x"` and `export { b } from "./x"`: one dependency, an edge of each kind.
      const same = module.deps.filter((d) => d.target === target.id);
      if (same.length > 0) {
        const kind = same.find((d) => d.reexport === imp.reexport);
        if (!kind) module.deps.push({ alias: same[0]!.alias, target: target.id, ...at, reexport: imp.reexport, ...typeOnly, ...docblock });
        // `import type { A }`, then `import { a }` of the same module: the module runs, from the second import on.
        else if (kind.typeOnly && !erased) {
          Object.assign(kind, at);
          delete kind.typeOnly;
          if (!imp.docblock) delete kind.docblock;
        } else if (kind.docblock && !imp.docblock) {
          Object.assign(kind, at);
          delete kind.docblock;
        }
        continue;
      }
      const wanted = imp.bindings.find((b) => b.kind === "module" || b.kind === "default")?.local ?? target.name;
      let alias = layerName(wanted);
      const existing = aliases.get(alias);
      if (existing === target.id) continue;
      // A dep's ID is `<module>.<alias>`: it must not collide with another
      // dep, a submodule, a class, a fn or a type of the same module.
      // It also must not be a keyword of this position, or the map line is
      // parsed as a declaration (`- type main.type`) instead of a dependency.
      const taken = (a: string): boolean =>
        CONTEXT_ALIAS.has(a) || aliases.has(a) || module.deps.some((d) => d.alias === a) || module.children.some((c) => c.name === a) || module.fns.some((f) => f.name === a) || module.types.some((t) => t.name === a);
      if (existing !== undefined || taken(alias)) {
        let n = 2;
        while (taken(`${alias}${n}`)) n++;
        alias = `${alias}${n}`;
      }
      aliases.set(alias, target.id);
      module.deps.push({ alias, target: target.id, ...at, reexport: imp.reexport, ...typeOnly, ...docblock });
      stats.deps++;
    }
    // A table that may miss a public name: a glob import of this file brings names keylang cannot list,
    // so a call through such a name is a hole, not a package's call, whatever other globs the file has.
    if (facts.exportsIncomplete !== undefined) starFrom({ target: null, reason: facts.exportsIncomplete });
  }

  // A value read through an import whose syntax did not tell where it leads (Python `from app.limits
  // import MAX`, PHP `use App\Limits`): once the import resolves to another file of the repository,
  // the fn's fingerprint cannot cover it, and it is marked as one that reads an imported value
  // (`+`, `READS_IMPORTED_VALUE` of `extract/treesitter.ts`), which leaves its closure incomplete.
  for (const { facts } of byFile.values()) {
    const locals = importTargets.get(facts.path)!;
    const own = unitOf(facts.path);
    const fromRepository = (name: string): boolean => (locals.get(name.normalize("NFC")) ?? []).some((t) => t.module.layer !== EXTERNAL && t.unit !== own);
    const mark = (d: DeclFact): void => {
      const fn = d.readsImports?.some(fromRepository) ? decls.fns.get(decls.ids.get(d) ?? "") : undefined;
      if (fn?.fingerprint !== undefined && !fn.fingerprint.includes("+")) fn.fingerprint += "+";
      for (const m of d.members) mark(m);
    };
    for (const d of facts.decls) mark(d);
  }

  // 3b. Export tables: what each public name stands for, through aliases, re-exports and `export *`.
  // A module of several files has a table of every file's names, and each file one of its own: an
  // import names one file, so it reads that file's table (two files may export `default`).
  const exportInputs = new Map<string, ModuleExportsInput>();
  for (const [id, entries] of moduleFiles) {
    const module = entries[0]!.module;
    const opaque = module.members === "opaque";
    // Python's `from .x import *` rebinds a name; ESM's `export *` of two sources exports neither.
    const lastStar = languageOf(entries[0]!.facts.path) === "python" ? { lastStarWins: true } : {};
    const rows: ExportRowInput[] = [];
    for (const { facts } of entries) {
      const listed: ExportRow[] = facts.exportRows.length > 0 ? facts.exportRows : [...facts.exports].sort().map((name) => ({ name, kind: "value", local: name }));
      const own = listed.filter((row) => row.name !== "*").map((row) => exportInput(row, facts, fileDecls.get(facts.path)!, importTargets.get(facts.path)!));
      rows.push(...own);
      if (entries.length > 1) exportInputs.set(`${FILE_UNIT}${facts.path}`, { rows: own, stars: fileStars.get(facts.path)!, opaque, ...lastStar });
    }
    exportInputs.set(id, { rows, stars: module.starSources, opaque, ...lastStar });
  }
  const symbolKind = (id: string): ExportKind | null => (decls.classes.has(id) ? "class" : decls.fns.has(id) ? "fn" : decls.types.has(id) ? "type" : null);
  const exportTables = resolveExports(exportInputs, symbolKind, (unit, name) => (unit.startsWith(FILE_UNIT) ? fileDecls.get(unit.slice(FILE_UNIT.length)) : declModule.get(unit))?.get(layerName(name)) ?? null);
  /** A module ID for an export-table key: the module of a file's own table. */
  const moduleOfUnit = (unit: string): string => (unit.startsWith(FILE_UNIT) ? (byFile.get(unit.slice(FILE_UNIT.length))?.module.id ?? unit) : unit);

  // 4. Calls. Hook calls and the values callers pass are collected for step 5.
  /** What a call of the class runs: `constructor` in JS, `__init__` in Python. */
  const constructorOf = (classId: string): string => `${classId}.${constructorName(decls.classes.get(classId)?.path) ?? "constructor"}`;
  const hookCalls: { fn: Fn; hook: HookFact; owner: string; call: CallFact }[] = [];
  // Functions read as values: a plain read resolves like a callee in its file; a property read names any method.
  const readIds = new Map<string, Escape>();
  const readMembers = new Map<string, Escape>();
  // `x.run()` in module-level code with a receiver keylang does not know: any fn named `run`.
  const calledNames = new Map<string, Escape>();
  // Class → its internal base class, or the `extends` text when keylang has not read the base.
  const classBase = new Map<string, BaseLink>();
  /** Class → the traits it uses (PHP `use Logs;`), resolved in its file. */
  const classTraits = new Map<string, string[]>();
  /** Class → the `insteadof` and `as` rules of its trait `use` block (PHP), traits resolved. */
  const classTraitRules = new Map<string, { trait: string | null; method: string; insteadof?: string[]; alias?: string }[]>();
  /** Class → the interfaces it implements; interface → those it extends: resolved in its file. */
  const implemented = new Map<string, string[]>();
  /** Class or interface → the qualified names of its base and interfaces as its file writes them, lower case (PHP): a package's interface too. */
  const writtenSupers = new Map<string, string[]>();
  /**
   * A member of a class by name: its own, then a used trait's (PHP), then its
   * bases' — as the language looks a method up. `staticToo`: an instance may
   * reach a static member (Python, PHP). `last`: the base link the chain
   * ended at, null when the class has no base; an unread base may declare it.
   */
  const findMember = (start: string, member: string, isStatic: boolean, staticToo: boolean): { target: string | null; last: BaseLink | null } => {
    // PHP finds `total()` for `$o->TOTAL()`; its bases and traits are PHP too.
    const caseless = caselessNames(decls.classes.get(start)?.path);
    const keysOf = (name: string): string[] => [name === "constructor" ? "constructor" : memberKey(name, isStatic, caseless), ...(staticToo && !isStatic ? [memberKey(name, true, caseless)] : [])];
    const same = (a: string, b: string): boolean => (caseless ? asciiLowerCase(a) === asciiLowerCase(b) : a === b);
    const seen = new Set<string>();
    const inClass = (id: string, name = member, visited = seen): string | null => {
      if (visited.has(id)) return null;
      visited.add(id);
      const members = declModule.get(id);
      for (const key of keysOf(name)) {
        const hit = members?.get(key);
        if (hit) return hit;
      }
      const rules = classTraitRules.get(id) ?? [];
      // `Loud::hello insteadof Quiet`: Quiet's `hello` is not the class's.
      const excluded = (trait: string, method: string): boolean => rules.some((r) => r.insteadof?.includes(trait) === true && same(r.method, method));
      for (const trait of classTraits.get(id) ?? []) {
        if (excluded(trait, name)) continue;
        const hit = inClass(trait, name, visited);
        if (hit) return hit;
      }
      // `Quiet::hello as whisper`, `hello as shout`: the alias is that trait's method.
      for (const rule of rules) {
        if (rule.alias === undefined || !same(rule.alias, name)) continue;
        for (const trait of rule.trait !== null ? [rule.trait] : (classTraits.get(id) ?? []).filter((t) => !excluded(t, rule.method))) {
          const hit = inClass(trait, rule.method, new Set());
          if (hit) return hit;
        }
      }
      return null;
    };
    let last: BaseLink | null = null;
    for (let at: string | null = start; at !== null && !seen.has(at); ) {
      const hit = inClass(at);
      if (hit) return { target: hit, last };
      const base = classBase.get(at);
      if (!base) break;
      last = base;
      at = base.internal;
    }
    return { target: null, last };
  };
  /** The base a class's chain of bases ends at when keylang has not read it (a package's, a global, an unknown name); null when it has read them all. */
  const unreadBase = (id: string): BaseLink | null => {
    const seen = new Set<string>();
    for (let at = classBase.get(id); at; at = at.internal ? classBase.get(at.internal) : undefined) {
      if (!at.internal) return at;
      if (seen.has(at.internal)) return null;
      seen.add(at.internal);
    }
    return null;
  };
  const injections = new Map<string, { arg: number; path: string; target: string; site: string }[]>();
  /** Per export table of a language whose names compare without case: name in ASCII lower case → the names of its declarations; null for any other table. */
  const caselessTables = new Map<string, Map<string, string[]> | null>();
  /**
   * PHP finds a class or a function whatever the case its name is written in: `new ORDER()`
   * makes an `Order`, `HELPER()` runs `helper()`. The symbol of the one declaration of `unit`
   * whose name is `name` in another case; null when the unit's language keeps case, or when no
   * declaration or two of them (`class Twin`, `function twin`) match.
   */
  const caselessExport = (unit: string, name: string): string | null => {
    let table = caselessTables.get(unit);
    if (table === undefined) {
      const file = unit.startsWith(FILE_UNIT) ? unit.slice(FILE_UNIT.length) : moduleFiles.get(unit)?.[0]?.facts.path;
      table = caselessNames(file) ? caselessIndex(exportInputs.get(unit)?.rows ?? []) : null;
      caselessTables.set(unit, table);
    }
    const names = table?.get(asciiLowerCase(name)) ?? [];
    return names.length === 1 && names[0] !== name ? exportTables.symbolOf(unit, names[0]!) : null;
  };
  /**
   * The symbol a public name stands for in an export table (`unit`: a module, or one file of a
   * module of several files): `export { a as b }`, `export default f`, `export { x } from`,
   * `export { x as y } from`, an imported name exported again, `export * as ns from` (the
   * module), and `export * from`. A name without an export row (CommonJS, an unexported helper)
   * is the declaration of that name. PHP may write the name in another case.
   */
  const exportOf = (unit: string, name: string): string | null => exportTables.symbolOf(unit, name) ?? caselessExport(unit, name);
  /** The export table of what a symbol names as a namespace (`export * as ns`, `import * as ns; export { ns }`); null for a class or a declaration. */
  const namespaceUnit = (id: string | null): string | null => {
    if (id === null) return null;
    if (id.startsWith(FILE_UNIT)) return id;
    const m = modules.get(id);
    return m && !m.class && m.layer !== EXTERNAL ? id : null;
  };
  /** A symbol a call can run: a fn, or a class (its constructor). */
  const callable = (id: string): boolean => decls.fns.has(id) || decls.classes.has(id);
  /** Callable symbols of an export table: what a namespace object holds. Grouped once, on first use. */
  let callablesByUnit: Map<string, string[]> | null = null;
  const exportedCallables = (unit: string): string[] => {
    if (!callablesByUnit) {
      const byUnit = new Map<string, string[]>();
      for (const e of exportTables.entries()) if (e.symbol !== null && callable(e.symbol)) byUnit.set(e.module, [...(byUnit.get(e.module) ?? []), e.symbol]);
      callablesByUnit = byUnit;
    }
    return callablesByUnit.get(unit) ?? [];
  };
  /** Per file: how its names resolve to symbols. The file is the scope: its own declarations and its imports. */
  const scopeOf = (facts: FileFacts) => {
    // A name as the code writes it, which may be NFD (`cafe` + U+0301): IDs are NFC, so the file's
    // declarations are keyed by their ID segment and its imports by their NFC name.
    const imports = importTargets.get(facts.path)!;
    const locals = { get: (name: string) => imports.get(name.normalize("NFC")), has: (name: string) => imports.has(name.normalize("NFC")) };
    const declared = fileDecls.get(facts.path)!;
    const localDecls = { get: (name: string) => declared.get(layerName(name)), has: (name: string) => declared.has(layerName(name)) };
    /**
     * The symbol an import binds: the named export, or the default export of a default binding or
     * of `module.exports`. An ESM namespace object stands for no symbol: it is no function.
     */
    const importedSymbol = (imp: ImportTarget): string | null => (imp.namespace ? null : exportOf(imp.unit, imp.imported ?? "default"));
    const globs = fileGlobs.get(facts.path) ?? [];
    /**
     * What a name the file neither declares nor imports stands for through its glob imports
     * (`use m::*`, `from m import *`): the public name of each source that has it; two may.
     */
    const globbed = (name: string): string[] => {
      if (globs.length === 0 || localDecls.has(name) || locals.has(name)) return [];
      const out = new Set<string>();
      for (const g of globs) {
        const symbol = g.unit === null ? null : (exportTables.lookup(g.unit, name)?.symbol ?? null);
        if (symbol) out.add(symbol);
      }
      return [...out];
    };
    /**
     * Where a name no declaration or import binds may come from, when the glob imports do not
     * list it: `unknown` — a source whose names keylang cannot list; `external` — only a package
     * or the standard library can bind it; null — no glob import can.
     */
    const globOrigin = (): "unknown" | "external" | null => {
      if (globs.some((g) => (g.unit === null ? !g.external : exportInputs.get(g.unit)?.opaque === true || exportTables.lookup(g.unit, UNKNOWN_EXPORT) !== null))) return "unknown";
      return globs.some((g) => g.external) ? "external" : null;
    };
    /** A class by the name this file uses for it: a local declaration, an import or a glob import. */
    const classNamed = (name: string): string | null => {
      const ids = new Set<string>();
      const local = localDecls.get(name);
      if (local) ids.add(local);
      for (const imp of locals.get(name) ?? []) {
        const id = importedSymbol(imp);
        if (id) ids.add(id);
      }
      for (const id of globbed(name)) ids.add(id);
      // Only a class has members of its own; a fn or a type does not.
      const classes = [...ids].filter((id) => decls.classes.has(id));
      return classes.length === 1 ? classes[0]! : null;
    };
    /** A type declaration (an interface) by the name this file uses for it, when no class has that name. */
    const typeNamed = (name: string): string | null => {
      const ids = new Set<string>();
      const local = localDecls.get(name);
      if (local) ids.add(local);
      for (const imp of locals.get(name) ?? []) {
        const id = importedSymbol(imp);
        if (id) ids.add(id);
      }
      for (const id of globbed(name)) ids.add(id);
      if ([...ids].some((id) => decls.classes.has(id))) return null;
      const types = [...ids].filter((id) => decls.types.has(id));
      return types.length === 1 ? types[0]! : null;
    };
    /** `isStatic`: the call sits in a static member, where `this` is the class itself. */
    const resolveCallees = (callee: string, cls: Module | null, isStatic: boolean): string[] => {
      const parts = callee.split(".");
      // Python `import a.b` binds the path `a.b`: in `a.b.f()` the head is that module, not `a`.
      const cut = Math.max(1, ...parts.map((_, k) => (k > 1 && locals.has(parts.slice(0, k).join(".")) ? k : 0)));
      const head = parts.slice(0, cut).join(".");
      const rest = parts.slice(cut);
      if (!head) return [];
      const found = new Set<string>();
      if (head === "this") {
        // `this.m()`: the class's member, a used trait's, or one of a base, as `super.m()` finds it.
        const member = rest[0];
        if (!cls || !member || rest.length !== 1) return [];
        const id = findMember(cls.id, member, isStatic, staticThroughInstance(facts.path)).target;
        return id ? [id] : [];
      }
      if (rest.length === 0) {
        const local = localDecls.get(head);
        if (local) found.add(local);
        for (const imp of locals.get(head) ?? []) {
          const id = importedSymbol(imp);
          if (id && callable(id)) found.add(id);
        }
        for (const id of globbed(head)) if (callable(id)) found.add(id);
        return [...found];
      }
      if (rest.length === 1) {
        const member = rest[0]!;
        // `X.m()` on a class names its static member, its own or a base's.
        const staticOf = (clsId: string | null): string | undefined => (clsId && decls.classes.has(clsId) ? (findMember(clsId, member, true, false).target ?? undefined) : undefined);
        for (const imp of locals.get(head) ?? []) {
          if (imp.kind === "module") {
            // `import * as ns`, `require()`: a named export; for `require`, also a static member of `module.exports`.
            const id = exportOf(imp.unit, member) ?? (imp.namespace ? undefined : staticOf(exportOf(imp.unit, "default")));
            if (id) found.add(id);
            continue;
          }
          const name = imp.imported ?? "default";
          const symbol = exportOf(imp.unit, name);
          const id = staticOf(symbol);
          if (id) found.add(id);
          // `import { ns } from "./barrel"` with `export * as ns from "./x"`.
          const ns = namespaceUnit(symbol);
          const nsId = ns ? exportOf(ns, member) : null;
          if (nsId) found.add(nsId);
          // A default import of a module without `export default` (CommonJS) is its `module.exports`.
          if (imp.kind === "default" && symbol === null && exportTables.lookup(imp.unit, "default") === null) {
            const cjs = exportOf(imp.unit, member);
            if (cjs) found.add(cjs);
          }
        }
        const id = staticOf(localDecls.get(head) ?? null);
        if (id) found.add(id);
        // `Order::new()` with `use other::*`: a class or a namespace a glob import brings in.
        for (const symbol of globbed(head)) {
          const viaGlob = staticOf(symbol);
          if (viaGlob) found.add(viaGlob);
          const ns = namespaceUnit(symbol);
          const nsId = ns ? exportOf(ns, member) : null;
          if (nsId) found.add(nsId);
        }
        return [...found];
      }
      return [];
    };
    /**
     * `this.decoder.feed` with `decoder: InputDecoder` → `InputDecoder.feed`,
     * when that class, a trait it uses or a base keylang has read declares the
     * member. In Python and PHP an instance reaches a static member too.
     */
    const receiverTarget = (callee: string, receiver: string | undefined): string | null => {
      const cls = receiver ? classNamed(receiver) : null;
      return cls ? findMember(cls, callee.slice(callee.lastIndexOf(".") + 1), false, staticThroughInstance(facts.path)).target : null;
    };
    /** One target for a callee that names a declaration; null for locals, gaps and ambiguity. */
    const single = (fact: { callee: string; bound?: string; receiver?: string; opaque?: true }, cls: Module | null, isStatic: boolean): string | null => {
      if (fact.opaque) return null;
      const typed = receiverTarget(fact.callee, fact.receiver);
      if (typed) return typed;
      if (fact.bound) return null;
      const targets = resolveCallees(fact.callee, cls, isStatic);
      return targets.length === 1 ? targets[0]! : null;
    };
    /** A name of the language or of a package: calls through it are external. */
    const external = (head: string): boolean => globalsOf(facts.path).values.has(head) || (locals.get(head) ?? []).some((imp) => imp.module.layer === EXTERNAL);
    return { locals, localDecls, importedSymbol, classNamed, typeNamed, resolveCallees, receiverTarget, single, external, globOrigin };
  };
  /**
   * PHP classes and interfaces by qualified name (ASCII lower case): those of the analysed files,
   * and those of files `outside` the architecture read as declarations only (ADR 0011, business-flows 40).
   * A name two files declare is the first file's, by path, as the resolver takes it.
   */
  const phpTypes = new Map<string, Ty>();
  const outsideByName = new Map<string, OutsideEntry>();
  for (const { facts, module } of [...byFile.values()].sort((a, b) => compareText(a.facts.path, b.facts.path))) {
    if (languageOf(facts.path) !== "php") continue;
    for (const decl of facts.declarations ?? []) {
      const key = asciiLowerCase(decl.name);
      if (!outsideByName.has(key)) outsideByName.set(key, { decl, file: facts.path, module: module.id });
    }
    const declared = fileDecls.get(facts.path);
    for (const symbol of facts.symbols ?? []) {
      if (symbol.table !== "class") continue;
      const id = declared?.get(layerName(symbol.name));
      const key = asciiLowerCase(symbol.qualified);
      if (id === undefined || phpTypes.has(key)) continue;
      if (decls.classes.has(id)) phpTypes.set(key, { kind: "class", id });
      else if (decls.types.has(id)) phpTypes.set(key, { kind: "type", id });
    }
  }
  const scopes = new Map<string, ReturnType<typeof scopeOf>>();
  for (const { facts } of byFile.values()) scopes.set(facts.path, scopeOf(facts));
  // Every class's base and traits first: `super()` in one file may run the constructor of a base in another.
  for (const { facts } of byFile.values()) {
    const { resolveCallees, classNamed, external } = scopes.get(facts.path)!;
    const visit = (factDecls: readonly DeclFact[]): void => {
      for (const d of factDecls) {
        if (d.implements && d.kind !== "fn") {
          const owner = decls.ids.get(d);
          const { typeNamed } = scopes.get(facts.path)!;
          if (owner) implemented.set(owner, d.implements.map((name) => typeNamed(name) ?? classNamed(name)).filter((t): t is string => t !== null));
        }
        if ((d.implements || d.base) && d.kind !== "fn") {
          const owner = decls.ids.get(d);
          if (owner) writtenSupers.set(owner, [...(d.implements ?? []), ...(d.base ? [d.base] : [])].map((name) => asciiLowerCase(qualifiedIn(facts, name))));
        }
        const id = d.kind === "class" ? decls.ids.get(d) : undefined;
        if (!id) continue;
        if (d.traits) classTraits.set(id, d.traits.map(classNamed).filter((t): t is string => t !== null));
        if (d.traitRules) {
          const named = (written: string | null): string | null => (written === null ? null : classNamed(written));
          classTraitRules.set(id, d.traitRules.map((r) => ({ ...r, trait: named(r.trait), ...(r.insteadof ? { insteadof: r.insteadof.map(named).filter((t): t is string => t !== null) } : {}) })));
        }
        if (!d.base) continue;
        const internal = d.base.includes(".") ? resolveCallees(d.base, null, false).filter((t) => decls.classes.has(t)) : [classNamed(d.base)].filter((t): t is string => t !== null);
        // Whether an unread base is a package's or the language's is known in the class's own file.
        // A base in a file `outside` the architecture: keylang reads its declarations, not its code.
        const outside = internal.length !== 1 && languageOf(facts.path) === "php" ? asciiLowerCase(qualifiedIn(facts, d.base)) : null;
        classBase.set(id, internal.length === 1 ? { internal: internal[0]!, text: d.base, external: false } : { internal: null, text: d.base, external: external(d.base.split(".")[0]!), ...(outside !== null && outsideByName.has(outside) ? { outside } : {}) });
      }
    };
    visit(facts.decls);
  }
  /**
   * `super()` / `super.m()` in a class: the base's member, looked up through
   * its traits and the bases that do not declare it. `last`: the last base on
   * that chain, null when the class has none.
   */
  const superTarget = (cls: Module, member: string, isStatic: boolean, staticToo: boolean): { target: string | null; last: BaseLink | null } => {
    const base = classBase.get(cls.id);
    if (!base?.internal) return { target: null, last: base ?? null };
    const found = findMember(base.internal, member, isStatic, staticToo);
    return { target: found.target, last: found.last ?? base };
  };

  // 3c. PHP: the class of a value from declarations (business-flows 40) — a call's declared
  // result type, a base's property, a class or interface of a file `outside` the architecture,
  // a class a framework generates. Only what a declaration writes: nothing is guessed from names.
  /** fn and type IDs → the declaration and its file. */
  const declById = new Map<string, { decl: DeclFact; file: string }>();
  for (const { facts } of byFile.values()) {
    const visitDecl = (list: readonly DeclFact[]): void => {
      for (const d of list) {
        const id = decls.ids.get(d);
        if (id !== undefined && !declById.has(id)) declById.set(id, { decl: d, file: facts.path });
        visitDecl(d.members);
      }
    };
    visitDecl(facts.decls);
  }
  const generated = frameworks.flatMap((f) => f.generated ?? []);
  /** A PHP class or interface by its qualified name: the graph's, one `outside` the architecture, or one a framework generates. */
  const tyOfQualified = (qualified: string, generatedToo = true): Ty | null => {
    const name = qualified.replace(/^\\+/, "");
    const key = asciiLowerCase(name);
    const known = phpTypes.get(key);
    if (known) return known;
    const outside = outsideByName.get(key);
    if (outside) return { kind: "outside", entry: outside };
    if (!generatedToo) return null;
    // A class no file declares whose name is the framework's convention for one it generates (ADR 0022, business-flows 40).
    for (const g of generated) {
      if (name.length <= g.suffix.length || !name.endsWith(g.suffix)) continue;
      const of = tyOfQualified(name.slice(0, -g.suffix.length), false);
      if (of) return { kind: "factory", name, of, method: g.method };
    }
    return null;
  };
  /** A class name as a file writes it: the graph's class or interface it binds, else (PHP) what its qualified name names. */
  const tyNamed = (facts: FileFacts, written: string): Ty | null => {
    const scope = scopes.get(facts.path);
    const cls = scope?.classNamed(written) ?? null;
    if (cls) return { kind: "class", id: cls };
    const type = scope?.typeNamed(written) ?? null;
    if (type) return { kind: "type", id: type };
    return languageOf(facts.path) === "php" ? tyOfQualified(qualifiedIn(facts, written)) : null;
  };
  /**
   * A member of an `outside` class or interface: its own, a trait's, a base's and — with
   * `interfaces` — an interface's (a signature, which runs nothing). `want` picks the first
   * declaration that tells what is needed (a result type).
   */
  const outsideMember = (entry: OutsideEntry, member: string, interfaces: boolean, want: (sig: MethodSigFact) => boolean = () => true, seen = new Set<string>()): { entry: OutsideEntry; sig: MethodSigFact } | null => {
    const key = asciiLowerCase(entry.decl.name);
    if (seen.has(key)) return null;
    seen.add(key);
    if (interfaces || entry.decl.kind !== "interface") {
      const lower = asciiLowerCase(member);
      const sig = entry.decl.methods.find((m) => asciiLowerCase(m.name) === lower);
      if (sig && want(sig)) return { entry, sig };
    }
    const next = [...(entry.decl.traits ?? []), ...(entry.decl.base ? [entry.decl.base] : []), ...(interfaces ? (entry.decl.implements ?? []) : [])];
    for (const name of next) {
      const found = outsideByName.get(asciiLowerCase(name));
      const hit = found ? outsideMember(found, member, interfaces, want, seen) : null;
      if (hit) return hit;
    }
    return null;
  };
  const hasResult = (sig: MethodSigFact): boolean => sig.result !== undefined;
  /** What an interface of the graph declares a member to return: its own signature, else an interface it extends. */
  const typeSig = (typeId: string, member: string, seen = new Set<string>()): MemberHit | null => {
    if (seen.has(typeId)) return null;
    seen.add(typeId);
    const own = declById.get(typeId);
    const lower = asciiLowerCase(member);
    const sig = own?.decl.methods?.find((m) => asciiLowerCase(m.name) === lower && m.result !== undefined);
    if (sig && own) return { result: sig.result!, file: own.file, owner: { kind: "type", id: typeId } };
    for (const parent of implemented.get(typeId) ?? []) {
      const hit = typeSig(parent, member, seen);
      if (hit) return hit;
    }
    for (const written of writtenSupers.get(typeId) ?? []) {
      const entry = outsideByName.get(written);
      const hit = entry ? outsideMember(entry, member, true, hasResult) : null;
      if (hit) return { result: hit.sig.result!, file: hit.entry.file, owner: { kind: "outside", entry: hit.entry } };
    }
    return null;
  };
  /**
   * What a class's member returns when its own declaration writes no type (`{@inheritdoc}`): what
   * an interface of the class, or a base's declaration of the member, declares — PHP checks an
   * implementation against both.
   */
  const inheritedResult = (classId: string, member: string, seen = new Set<string>()): MemberHit | null => {
    if (seen.has(classId)) return null;
    seen.add(classId);
    for (const iface of implemented.get(classId) ?? []) {
      const hit = decls.types.has(iface) ? typeSig(iface, member) : null;
      if (hit) return hit;
    }
    for (const written of writtenSupers.get(classId) ?? []) {
      const entry = outsideByName.get(written);
      const hit = entry ? outsideMember(entry, member, true, hasResult) : null;
      if (hit) return { result: hit.sig.result!, file: hit.entry.file, owner: { kind: "outside", entry: hit.entry } };
    }
    const base = classBase.get(classId);
    if (base?.internal) {
      const found = findMember(base.internal, member, false, true).target;
      const own = found ? declById.get(found) : undefined;
      if (own?.decl.result) return { result: own.decl.result, file: own.file, owner: { kind: "class", id: found!.slice(0, found!.lastIndexOf(".")) } };
      return inheritedResult(base.internal, member, seen);
    }
    const entry = base?.outside ? outsideByName.get(base.outside) : undefined;
    const hit = entry ? outsideMember(entry, member, true, hasResult) : null;
    return hit ? { result: hit.sig.result!, file: hit.entry.file, owner: { kind: "outside", entry: hit.entry } } : null;
  };
  /** The member a value of class `ty` has: what a call of it runs and what it returns. Null when no declaration keylang read has it. */
  const memberHit = (ty: Ty, member: string): MemberHit | null => {
    if (ty.kind === "factory") return asciiLowerCase(member) === asciiLowerCase(ty.method) ? { gives: ty.of } : null;
    if (ty.kind === "type") return typeSig(ty.id, member);
    if (ty.kind === "outside") {
      const interfaceOnly = ty.entry.decl.kind === "interface";
      const runs = interfaceOnly ? null : outsideMember(ty.entry, member, false);
      const typed = runs?.sig.result !== undefined ? runs : outsideMember(ty.entry, member, true, hasResult);
      if (!runs && !typed) return null;
      return {
        ...(runs ? { outside: { entry: runs.entry, name: runs.sig.name } } : {}),
        ...(typed ? { result: typed.sig.result!, file: typed.entry.file, owner: { kind: "outside" as const, entry: typed.entry } } : {}),
      };
    }
    const found = findMember(ty.id, member, false, true);
    if (found.target) {
      const own = declById.get(found.target);
      const owner = found.target.slice(0, found.target.lastIndexOf("."));
      if (own?.decl.result) return { target: found.target, result: own.decl.result, file: own.file, owner: decls.classes.has(owner) ? { kind: "class", id: owner } : ty };
      return { target: found.target, ...(inheritedResult(ty.id, member) ?? {}) };
    }
    // The chain of bases ends at a class `outside` the architecture: its member, read as a declaration.
    const entry = found.last?.outside ? outsideByName.get(found.last.outside) : undefined;
    return entry ? memberHit({ kind: "outside", entry }, member) : null;
  };
  /** The class a member's result has, given the class of the value it is called on; `element`: of an element of the array it returns. */
  const resultTy = (hit: MemberHit, recv: Ty | null, element: boolean): Typed | null => {
    if (hit.gives) return element ? null : { ty: hit.gives, indirect: true };
    const r = hit.result;
    if (!r || (r.element === true) !== element) return null;
    const ty = r.self === "static" ? recv : r.self === "self" ? (hit.owner ?? recv) : r.class ? tyOfQualified(r.class) : null;
    if (!ty) return null;
    return { ty, indirect: true, ...(r.docblock && hit.file ? { doc: `${hit.file}:${r.docblock.line}:${r.docblock.col}` } : {}) };
  };
  /** The class of a property of a class or one of its bases (`$this->_eventManager` a base declares with `@var`), by the declaring class's facts. */
  const fieldTy = (classId: string, prop: string): Typed | null => {
    const withDoc = (cls: string, element: boolean | undefined, docblock: { line: number; col: number } | undefined, file: string): Typed | null => {
      const ty = element ? null : tyOfQualified(cls);
      return ty ? { ty, indirect: true, ...(docblock ? { doc: `${file}:${docblock.line}:${docblock.col}` } : {}) } : null;
    };
    const seen = new Set<string>();
    let at: string | null = classId;
    while (at !== null && !seen.has(at)) {
      seen.add(at);
      const own = declById.get(at);
      const field = own?.decl.fields?.find((f) => f.name === prop);
      if (field && own) return withDoc(field.class, field.element, field.docblock, own.file);
      const base = classBase.get(at);
      if (!base) return null;
      if (base.internal) {
        at = base.internal;
        continue;
      }
      let entry = base.outside ? outsideByName.get(base.outside) : undefined;
      const visited = new Set<string>();
      while (entry && !visited.has(entry.decl.name)) {
        visited.add(entry.decl.name);
        const f = entry.decl.fields.find((x) => x.name === prop);
        if (f) return withDoc(f.class, f.element, f.docblock, entry.file);
        entry = entry.decl.base ? outsideByName.get(asciiLowerCase(entry.decl.base)) : undefined;
      }
      return null;
    }
    return null;
  };
  /**
   * The class of a call's receiver from declarations (PHP): a value another call returned (`on`),
   * a class the file names (`receiver`), `$this`, a property a base declares (`this.x.m`), the
   * base (`parent::m()`), or a class named statically (`X::m()`).
   */
  const receiverTy = (c: Pick<ResultCallFact, "callee" | "receiver" | "on" | "bound" | "docblock" | "opaque">, ctx: CallCtx, depth: number): Typed | null => {
    if (depth > 16) return null;
    if (c.on) return valueTy(c.on, ctx, depth + 1);
    if (c.receiver) {
      const ty = tyNamed(ctx.facts, c.receiver);
      return ty ? { ty, ...(c.docblock ? { doc: `${ctx.facts.path}:${c.docblock.line}:${c.docblock.col}` } : {}) } : null;
    }
    if (c.opaque || languageOf(ctx.facts.path) !== "php") return null;
    const parts = c.callee.split(".");
    if (parts[0] === "this" && ctx.cls) {
      if (parts.length === 2) return { ty: { kind: "class", id: ctx.cls.id } };
      return parts.length === 3 ? fieldTy(ctx.cls.id, parts[1]!) : null;
    }
    if (parts[0] === "super" && ctx.cls && parts.length === 2) {
      const base = classBase.get(ctx.cls.id);
      if (base?.internal) return { ty: { kind: "class", id: base.internal } };
      const entry = base?.outside ? outsideByName.get(base.outside) : undefined;
      return entry ? { ty: { kind: "outside", entry } } : null;
    }
    if (c.bound || parts.length !== 2) return null;
    const ty = tyNamed(ctx.facts, parts[0]!);
    return ty && ty.kind !== "type" ? { ty } : null;
  };
  /** The class of a value a call returns (or of an element of it), from the declared result type of what the call runs. */
  const valueTy = (v: ValueOfFact, ctx: CallCtx, depth: number): Typed | null => {
    const call = v.call;
    let recv: Typed | null = null;
    let hit: MemberHit | null = null;
    if (!call.on && !call.receiver && !call.bound && !call.opaque && !call.callee.includes(".")) {
      // `helper()`: a function's declared result.
      const targets = scopes.get(ctx.facts.path)?.resolveCallees(call.callee, null, false).filter((id) => decls.fns.has(id)) ?? [];
      const own = targets.length === 1 ? declById.get(targets[0]!) : undefined;
      hit = own?.decl.result ? { target: targets[0]!, result: own.decl.result, file: own.file } : null;
    } else {
      recv = receiverTy(call, ctx, depth);
      hit = recv ? memberHit(recv.ty, call.member) : null;
    }
    const out = hit ? resultTy(hit, recv?.ty ?? null, v.element === true) : null;
    if (!out) return null;
    const doc = recv?.doc ?? out.doc;
    return { ty: out.ty, indirect: true, ...(doc ? { doc } : {}) };
  };
  /** The name of a class for a hole's reason. */
  const tyName = (ty: Ty): string => (ty.kind === "outside" ? lastSegmentOf(ty.entry.decl.name) : ty.kind === "factory" ? lastSegmentOf(ty.name) : ty.id.slice(ty.id.lastIndexOf(".") + 1));
  /** The ID of a declaration of a file by its dotted path there (`Class.method`, a function's name). */
  const declIdIn = (path: string, symbol: string): string | null => {
    const [head, member] = symbol.split(".");
    const decl = byFile.get(path)?.facts.decls.find((d) => d.name === head);
    const target = member === undefined ? decl : decl?.members.find((m) => m.name === member);
    return target ? (decls.ids.get(target) ?? null) : null;
  };
  /** What the graph lends the framework facts: its declarations, by the names a config writes. */
  function frameworkBindings(inputs: readonly FrameworkInput[]): FrameworkBindings {
    const { resolve, supertypes } = frameworkLookups();
    return new FrameworkBindings(inputs, {
      resolve,
      isClass: (id) => decls.classes.has(id),
      member: (classId, name) => findMember(classId, name, false, staticThroughInstance(decls.classes.get(classId)?.path ?? "")).target,
      opaqueBase: (classId) => unreadBase(classId) !== null || decls.classes.get(classId)?.members === "opaque",
      supertypes,
      owner: (dir) => (dir === null ? null : (byFile.get(dir)?.module.id ?? directoryModuleIn(config, dir, modules, layers))),
      token: (ref) => {
        if (ref.kind === "string") return `string:${ref.value}`;
        // The export a name stands for, through the file's import and any re-exports, as `unit#name`.
        const scope = scopes.get(ref.file);
        if (!scope) return null;
        let unit: string;
        let name: string;
        const imported = scope.locals.get(ref.name)?.[0];
        if (imported) {
          if (imported.module.layer === EXTERNAL) return `external:${imported.module.id}#${imported.imported ?? ref.name}`;
          if (imported.imported === null) return null;
          unit = imported.unit;
          name = imported.imported;
        } else {
          unit = unitOf(ref.file);
          name = ref.name;
        }
        for (let hop = 0; hop < 8; hop++) {
          const row = exportTables.lookup(unit, name);
          if (row?.from === undefined || row.local === undefined) break;
          unit = row.from;
          name = row.local;
        }
        return `name:${unit}#${name}`;
      },
    });
  }

  /** A config's class names resolved to the graph's declarations, and the supertypes of a class: built once. */
  let lookups: { resolve: (type: TypeName) => ResolvedType; supertypes: (id: string) => string[]; qualifiedOf: (id: string) => string | null } | null = null;
  function frameworkLookups(): NonNullable<typeof lookups> {
    if (lookups) return lookups;
    // PHP names a class by its qualified name (`FileFacts.symbols`), in any ASCII case.
    const qualified = new Map<string, string>();
    const names = new Map<string, string>();
    for (const f of [...files].sort((a, b) => compareText(a.path, b.path))) {
      for (const symbol of f.symbols ?? []) {
        if (symbol.table !== "class") continue;
        const id = fileDecls.get(f.path)?.get(layerName(symbol.name));
        const key = asciiLowerCase(symbol.qualified);
        if (id !== undefined && !qualified.has(key)) qualified.set(key, id);
        if (id !== undefined && !names.has(id)) names.set(id, key);
      }
    }
    const resolve = (type: TypeName): ResolvedType => {
      if (type.file !== undefined) {
        const id = fileDecls.get(type.file)?.get(layerName(type.name));
        if (id !== undefined) return decls.classes.has(id) || decls.types.has(id) ? { kind: "node", id } : { kind: "missing" };
        // A name the file imports (NestJS `useClass: SqlOrderRepo` in a module file): what the import binds.
        const scope = scopes.get(type.file);
        const imported = scope?.classNamed(type.name) ?? scope?.typeNamed(type.name) ?? null;
        if (imported !== null) return { kind: "node", id: imported };
        if (scope?.external(type.name)) return { kind: "external" };
        return { kind: "missing" };
      }
      const id = qualified.get(asciiLowerCase(type.name));
      if (id !== undefined) return { kind: "node", id };
      // A class no analysed file declares: a package's (composer's autoload) or PHP's own is outside the graph, not missing.
      const r = resolverFor("keylang.php")?.resolve("", type.name);
      return r?.kind === "external" || r?.kind === "stdlib" ? { kind: "external" } : { kind: "missing" };
    };
    const supertypes = (id: string): string[] => {
      const out = new Set<string>();
      const stack = [id];
      while (stack.length > 0) {
        const at = stack.pop()!;
        if (out.has(at)) continue;
        out.add(at);
        const base = classBase.get(at)?.internal;
        if (base) stack.push(base);
        stack.push(...(implemented.get(at) ?? []), ...(classTraits.get(at) ?? []));
      }
      return [...out];
    };
    lookups = { resolve, supertypes, qualifiedOf: (id) => names.get(id) ?? null };
    return lookups;
  }

  /** Qualified names (lower case) of a class, its bases and interfaces, as their files write them: a package's interface too. */
  const supertypeNames = (classId: string): Set<string> => {
    const { supertypes, qualifiedOf } = frameworkLookups();
    const out = new Set<string>();
    for (const id of supertypes(classId)) {
      const own = qualifiedOf(id);
      if (own !== null) out.add(own);
      for (const name of writtenSupers.get(id) ?? []) out.add(name);
    }
    return out;
  };

  /**
   * Plugin edges (ADR 0022): every call of a public method a plugin wraps gets
   * edges to the plugin's `before` and `around` methods ahead of it and its
   * `after` method behind it, in the order they run; every such method lists
   * its interceptors (`interceptedBy`).
   */
  function intercept(found: FrameworkBindings): void {
    const memberName = (fnId: string): string | null => {
      const fn = decls.fns.get(fnId);
      const owner = fnId.slice(0, fnId.lastIndexOf("."));
      if (!fn || fn.static || !fn.exported || !decls.classes.has(owner)) return null;
      const name = decls.members.get(fnId)?.name ?? fn.written ?? fn.name;
      return name === constructorName(fn.file) ? null : name;
    };
    for (const fn of decls.fns.values()) {
      if (fn.calls.length === 0) continue;
      const out: Call[] = [];
      const seen = new Set<string>();
      for (const call of fn.calls) {
        const member = call.via === "injected" || call.via?.startsWith("plugin:") ? null : memberName(call.target);
        const wraps = member === null ? [] : found.interceptors(receiverOf.get(call) ?? [call.target.slice(0, call.target.lastIndexOf("."))], member);
        const edge = (w: (typeof wraps)[number]): void => {
          const key = `${w.target}\0${w.via}`;
          if (seen.has(key)) return;
          seen.add(key);
          out.push({ target: w.target, line: call.line, col: call.col, endLine: call.endLine, endCol: call.endCol, text: call.text, via: w.via, site: w.site, scope: w.scope, binding: w.binding, intercepts: call.target, ...(w.owner !== null ? { owner: w.owner } : {}), ...(call.closure ? { closure: true as const } : {}) });
        };
        for (const w of wraps) if (w.via !== "plugin:after") edge(w);
        out.push(call);
        for (const w of wraps) if (w.via === "plugin:after") edge(w);
      }
      fn.calls = out;
    }
    for (const [classId, cls] of decls.classes) {
      for (const fn of cls.fns) {
        const member = memberName(fn.id);
        const wraps = member === null ? [] : found.interceptors([classId], member);
        // In the order they run around a call: `before` and `around` of each plugin by `sortOrder`, then the `after`s.
        const ordered = [...wraps.filter((w) => w.via !== "plugin:after"), ...wraps.filter((w) => w.via === "plugin:after")];
        if (ordered.length > 0) fn.interceptedBy = ordered.map((w) => ({ plugin: w.target, via: w.via, name: w.name, site: w.site, scope: w.scope }));
      }
    }
  }

  // 4a. Framework facts (ADR 0022): bindings, constructor arguments and plugins from the config the framework runs.
  const bindings = frameworks.length === 0 ? null : frameworkBindings(frameworks);
  /** The receiver's class of a call edge (and the interface a binding went through): what a plugin wraps. */
  const receiverOf = new WeakMap<Call, string[]>();
  for (const hole of bindings?.holes ?? []) gaps.push({ kind: "unresolved-binding", file: hole.file, line: hole.line, col: hole.col, endLine: hole.line, endCol: hole.col + 1, text: hole.text, reason: hole.reason, source: hole.source });
  // 4b. What the framework calls from outside (ADR 0022 п. 5–6): observers of events and the entry points its config names.
  const called = frameworks.length === 0 ? null : frameworkEntries(frameworks, {
    resolve: (type) => frameworkLookups().resolve(type),
    unalias: (type, scope) => bindings?.unalias(type, scope) ?? type,
    isClass: (id) => decls.classes.has(id),
    member: (classId, name) => findMember(classId, name, false, staticThroughInstance(decls.classes.get(classId)?.path ?? "")).target,
    bound: (typeId, member) => {
      if (!bindings?.binds(typeId)) return null;
      const b = bindings.callThroughType(typeId, member);
      const reason = b.ambiguous ?? (b.edges.length === 0 ? (b.missing ?? b.opaque ?? (b.external ? `bound to a class of a package keylang does not read` : null)) : null);
      return { targets: b.edges.map((e) => ({ target: e.target, scope: e.scope })), reason };
    },
    owner: (dir) => (dir === null ? null : (byFile.get(dir)?.module.id ?? directoryModuleIn(config, dir, modules, layers))),
    supertypeNames,
    classesIn: (file) => [...decls.classes.values()].filter((c) => c.path === file).sort((a, b) => (a.line ?? 0) - (b.line ?? 0)).map((c) => c.id),
    place: (id) => {
      const fn = decls.fns.get(id);
      if (fn) return { file: fn.file ?? decls.classes.get(id.slice(0, id.lastIndexOf(".")))?.path ?? "", line: fn.line };
      const cls = decls.classes.get(id);
      return cls?.path ? { file: cls.path, line: cls.line ?? 1 } : null;
    },
    sources: [...byFile.keys()].sort(compareText),
  });
  for (const hole of called?.holes ?? []) gaps.push({ kind: "unresolved-binding", file: hole.file, line: hole.line, col: hole.col, endLine: hole.line, endCol: hole.col + 1, text: hole.text, reason: hole.reason, source: hole.source });
  /** Qualified names (lower case) of the types whose `dispatch(name)` publishes an event. */
  const dispatchers = new Set(frameworks.flatMap((f) => f.dispatchers ?? []).map(asciiLowerCase));
  /** Calls that dispatch an event by a literal: their target is the event's ID, set once every name is known. */
  const dispatches: { call: Call; name: string; file: string }[] = [];
  for (const { facts, module } of byFile.values()) {
    const { locals, localDecls, importedSymbol, classNamed, typeNamed, resolveCallees, receiverTarget, single, external, globOrigin } = scopes.get(facts.path)!;
    const attach = (factDecls: DeclFact[], cls: Module | null): void => {
      for (const d of factDecls) {
        if (d.kind === "class") {
          const clsModule = decls.classes.get(decls.ids.get(d) ?? "");
          if (clsModule) attach(d.members, clsModule);
          continue;
        }
        if (d.kind !== "fn") continue;
        const fn = decls.fns.get(decls.ids.get(d) ?? "");
        if (!fn) continue;
        // The synthesized `Class.static` (static fields, `static {}`) runs when the class is evaluated, on module load; `this` there is the class.
        const initializer = cls !== null && d.name === "static" && d.signature === null && !d.static;
        const isStatic = d.static === true || initializer;
        if (d.accessor) fn.escapes ??= { file: facts.path, line: d.line, col: d.col, reason: "an accessor runs on property access" };
        if (d.implicit) fn.escapes ??= { file: facts.path, line: d.line, col: d.col, reason: `\`${d.name}\` is called implicitly` };
        if (initializer) fn.escapes ??= { file: facts.path, line: d.line, col: d.col, reason: "a static initializer runs when the module loads" };
        const push = (target: string, c: CallFact, extra: Partial<Call> = {}, receiver: string | null = null): void => {
          // A self-call stays an edge: recursion is a static path from a function to itself.
          // A call in a closure passed as an argument is a plain call of the code (counted as resolved) that the callee of the enclosing call may run.
          const inArg = c.closureArg ? { via: "closure-arg" as const, site: `${facts.path}:${c.closureArg.line}:${c.closureArg.col}` } : {};
          const call: Call = { target, line: c.line, col: c.col, endLine: c.endLine, endCol: c.endCol, text: c.callee, ...(c.closure ? { closure: true as const } : {}), ...inArg, ...extra };
          const added = addCall(fn, call);
          if (receiver !== null) receiverOf.set(call, [receiver]);
          if (added && !extra.via) stats.callsResolved++;
        };
        /**
         * What the framework's config says a call goes to: the value the config sets for the
         * constructor argument the receiver holds, else the class a binding gives the receiver's
         * type (an interface, or a class with a preference of its own). Null when it says nothing.
         */
        const configured = (c: CallFact, typedClass: string | null, typedType: string | null = null): { bound: BoundCall; through: string | null } | null => {
          if (!bindings) return null;
          const member = c.member ?? c.callee.slice(c.callee.lastIndexOf(".") + 1);
          if (c.param !== undefined && cls && bindings.argumentFor(cls.id, c.param)) return { bound: bindings.callThroughArgument(cls.id, c.param, member), through: null };
          const type = typedClass ?? typedType ?? (c.receiver ? typeNamed(c.receiver) : null);
          if (type !== null) return bindings.binds(type) ? { bound: bindings.callThroughType(type, member), through: type } : null;
          // `Payment::charge()` on a class the config binds that declares no `charge` (a Laravel facade): the bound class's member.
          const parts = c.callee.split(".");
          const holder = parts.length === 2 && !c.receiver && !c.bound && parts[0] !== "this" && parts[0] !== "super" ? classNamed(parts[0]!) : null;
          if (holder === null || !bindings.binds(holder) || findMember(holder, member, true, false).target !== null) return null;
          return { bound: bindings.callThroughType(holder, member), through: holder };
        };
        /** The edges a config gives a call; `counted`: the call has no edge of the code, so the config decides whether it is resolved or a hole. */
        const placeConfigured = (c: CallFact, { bound, through }: { bound: BoundCall; through: string | null }, counted: boolean): void => {
          for (const e of bound.edges) {
            const call: Call = {
              target: e.target,
              line: c.line,
              col: c.col,
              endLine: c.endLine,
              endCol: c.endCol,
              text: c.callee,
              via: e.via,
              site: e.site,
              scope: e.scope,
              binding: e.binding,
              ...(e.owner !== null ? { owner: e.owner } : {}),
              ...(c.closure && !c.closureArg ? { closure: true as const } : {}),
              ...(c.docblock ? { docblock: `${facts.path}:${c.docblock.line}:${c.docblock.col}` } : {}),
            };
            if (addCall(fn, call)) receiverOf.set(call, through === null ? [e.impl] : [e.impl, through]);
          }
          if (!counted) return;
          if (bound.edges.length > 0) stats.callsResolved++;
          if (bound.ambiguous !== null) {
            if (bound.edges.length === 0) stats.callsDynamic++;
            gaps.push({ kind: "ambiguous-binding", file: facts.path, line: c.line, col: c.col, endLine: c.endLine, endCol: c.endCol, text: c.callee, reason: bound.ambiguous, source: fn.id });
          } else if (bound.edges.length > 0) return;
          else if (bound.external) stats.callsExternal++;
          else if (bound.opaque !== null) dynamic(c, bound.opaque);
          else {
            stats.callsUnresolved++;
            gaps.push({ kind: "unresolved-call", file: facts.path, line: c.line, col: c.col, endLine: c.endLine, endCol: c.endCol, text: c.callee, reason: bound.missing ?? `unresolved call \`${c.callee}\``, source: fn.id });
          }
        };
        /**
         * A callable reference passed as the argument itself (`[$this, 'm']`, `this.m.bind(this)`,
         * `self.m`, `Self::m`) is an edge the callee of the call may run; a class so passed stays a
         * value read (its constructor escapes). Not a call, so not counted as one.
         */
        const passCallables = (c: CallFact): void => {
          for (const pass of c.passes ?? []) {
            if (pass.path !== "") continue;
            const value = single(pass, cls, isStatic);
            if (!value || decls.classes.has(value)) continue;
            addCall(fn, {
              target: value,
              line: pass.line,
              col: pass.col,
              endLine: pass.endLine,
              endCol: pass.endCol,
              text: pass.text,
              via: "callable-arg",
              ...(c.closure ? { closure: true as const } : {}),
              ...(pass.docblock ? { docblock: `${facts.path}:${pass.docblock.line}:${pass.docblock.col}` } : {}),
            });
          }
        };
        const dynamic = (c: CallFact, reason: string): void => {
          stats.callsDynamic++;
          gaps.push({ kind: "dynamic-call", file: facts.path, line: c.line, col: c.col, endLine: c.endLine, endCol: c.endCol, text: c.callee, reason, source: fn.id, ...(c.opaque && c.member ? { name: c.member } : {}) });
        };
        /**
         * A call of a framework's dispatcher (`$this->eventManager->dispatch('e', …)`): the receiver
         * is typed as one, as a class implementing one, or as a type the config binds to such a class.
         */
        const dispatching = (receiver: string): boolean => {
          const ids = [classNamed(receiver), typeNamed(receiver)].filter((id): id is string => id !== null);
          if (ids.length === 0) return dispatchers.has(asciiLowerCase(qualifiedIn(facts, receiver)));
          return dispatchingIds(ids);
        };
        const dispatchingIds = (ids: readonly string[]): boolean => ids.some((id) => [id, ...(bindings?.binds(id) ? bindings.callThroughType(id, "dispatch").edges.map((e) => e.impl) : [])].some((t) => [...supertypeNames(t)].some((name) => dispatchers.has(name))));
        /** The same for a class from declarations: an `outside` one is a dispatcher by its name or a supertype's. */
        const dispatchingTy = (ty: Ty): boolean => {
          if (ty.kind === "class" || ty.kind === "type") return dispatchingIds([ty.id]);
          if (ty.kind !== "outside") return false;
          const seen = new Set<string>();
          const queue = [ty.entry.decl.name];
          while (queue.length > 0) {
            const name = asciiLowerCase(queue.shift()!);
            if (seen.has(name)) continue;
            seen.add(name);
            if (dispatchers.has(name)) return true;
            const entry = outsideByName.get(name);
            if (entry) queue.push(...(entry.decl.base ? [entry.decl.base] : []), ...(entry.decl.implements ?? []));
          }
          return false;
        };
        const ctx: CallCtx = { facts, cls };
        const php = languageOf(facts.path) === "php";
        /** A call that runs a member of a class `outside` the architecture: an edge to its module, which has no member nodes. */
        const pushOutside = (hit: { entry: OutsideEntry; name: string }, c: CallFact, extra: Partial<Call>): void => {
          push(hit.entry.module, c, { ...extra, member: `${hit.entry.decl.name}::${hit.name}` });
        };
        for (const c of d.calls) {
          // Whatever the call itself resolves to, the callables it passes are edges of their own.
          passCallables(c);
          const parts = c.callee.split(".");
          // PHP: the receiver's class from declarations — a call's result, a base's property, a class outside the architecture.
          const recv = php && (c.on || c.receiver || (parts[0] === "this" && parts.length === 3)) ? receiverTy(c, ctx, 0) : null;
          const recvExtra: Partial<Call> = recv ? { ...(recv.doc ? { docblock: recv.doc } : {}), ...(recv.indirect ? { indirect: true as const } : {}) } : c.docblock ? { docblock: `${facts.path}:${c.docblock.line}:${c.docblock.col}` } : {};
          const dispatcher = c.nameArg && dispatchers.size > 0 && (c.receiver ? dispatching(c.receiver) || (recv !== null && dispatchingTy(recv.ty)) : recv !== null && dispatchingTy(recv.ty));
          if (c.nameArg && dispatcher) {
            if (c.nameArg.literal !== null) {
              const call: Call = { target: "", line: c.line, col: c.col, endLine: c.endLine, endCol: c.endCol, text: c.callee, via: "dispatch", ...(c.closure ? { closure: true as const } : {}), ...(c.closureArg ? { site: `${facts.path}:${c.closureArg.line}:${c.closureArg.col}` } : {}) };
              fn.calls.push(call);
              dispatches.push({ call, name: c.nameArg.literal, file: facts.path });
            } else {
              gaps.push({ kind: "dynamic-event", file: facts.path, line: c.line, col: c.col, endLine: c.endLine, endCol: c.endCol, text: c.callee, reason: `dispatch of an event whose name is computed at run time: \`${c.nameArg.text}\``, source: fn.id });
            }
          }
          // An expression keylang does not name is a hole, never an edge — unless declarations give the class of its value.
          if (c.opaque && !recv) {
            dynamic(c, `call through an expression \`${c.callee}\``);
            continue;
          }
          const head = c.callee.split(".")[0]!;
          if (head === "super" && cls && c.callee.split(".").length <= 2) {
            // `super()` runs the base constructor; `super.m()` the base's `m`.
            const member = c.callee === "super" ? "constructor" : c.callee.slice("super.".length);
            const { target, last } = superTarget(cls, member, isStatic, staticThroughInstance(facts.path));
            const outsideBase = !target && last?.outside ? outsideByName.get(last.outside) : undefined;
            const inOutside = outsideBase ? outsideMember(outsideBase, member, false) : null;
            if (target) push(target, c);
            // Bases of this repository without a constructor of their own: the implicit ones run nothing keylang indexes.
            else if (last?.internal && member === "constructor") continue;
            // `parent::__construct()` of a base outside the architecture: its member, read as a declaration.
            else if (inOutside) pushOutside({ entry: inOutside.entry, name: inOutside.sig.name }, c, {});
            else if (last && !last.internal && last.external) stats.callsExternal++;
            else dynamic(c, `call through \`super\` of ${last ? `\`${last.text}\`` : "a class without a base keylang resolved"}`);
            continue;
          }
          // The values a resolved call passes may be what its callee's hook calls.
          const callee = c.passes ? single(c, cls, isStatic) : null;
          if (callee && c.passes) {
            // `new App({ … })` passes values to the constructor.
            const owners = decls.classes.has(callee) ? [constructorOf(callee)] : [callee];
            for (const pass of c.passes) {
              const value = single(pass, cls, isStatic);
              if (!value) continue;
              for (const owner of owners) {
                const list = injections.get(owner) ?? [];
                list.push({ arg: pass.arg, path: pass.path, target: value, site: `${facts.path}:${c.line}:${c.col}` });
                injections.set(owner, list);
              }
            }
          }
          if (c.hook) {
            const fallback = single({ callee: c.hook.fallback }, cls, isStatic);
            if (fallback) push(fallback, c, { via: "default", hook: c.hook.name });
            const owner = c.hook.owner === "self" ? fn.id : cls ? constructorOf(cls.id) : null;
            if (owner && c.hook.param !== null) hookCalls.push({ fn, hook: c.hook, owner, call: c });
          }
          const member = c.member ?? c.callee.slice(c.callee.lastIndexOf(".") + 1);
          const recvClass = recv?.ty.kind === "class" ? recv.ty.id : null;
          const typed = recv ? (recvClass ? findMember(recvClass, member, false, staticThroughInstance(facts.path)).target : null) : receiverTarget(c.callee, c.receiver);
          const typedClass = recv ? (typed ? recvClass : null) : typed && c.receiver ? classNamed(c.receiver) : null;
          const framework = configured(c, typedClass, recv?.ty.kind === "type" ? recv.ty.id : recvClass);
          if (typed) {
            push(typed, c, recvExtra, typedClass);
            // A preference of the class itself, or an argument the config sets: the class that runs may be another one.
            if (framework) placeConfigured(c, framework, false);
            continue;
          }
          if (framework) {
            placeConfigured(c, framework, true);
            continue;
          }
          if (recv) {
            // A member of a class outside the architecture (a base's, or the receiver's own class there).
            const hit = recv.ty.kind === "class" || recv.ty.kind === "outside" ? memberHit(recv.ty, member) : null;
            if (hit?.outside) {
              pushOutside(hit.outside, c, recvExtra);
              continue;
            }
            // `$this->quoteFactory->create()`: the class the framework generates makes a `Quote` (ADR 0022, business-flows 40).
            if (recv.ty.kind === "factory" && asciiLowerCase(member) === asciiLowerCase(recv.ty.method)) {
              const made = recv.ty.of;
              const extra: Partial<Call> = { ...recvExtra, via: "generated-factory", binding: `\`${recv.ty.name}\` is generated: \`${member}()\` makes a \`${tyName(made)}\`` };
              if (made.kind === "class") {
                push(made.id, c, extra);
                stats.callsResolved++;
                continue;
              }
              if (made.kind === "outside" && made.entry.decl.kind !== "interface") {
                pushOutside({ entry: made.entry, name: "__construct" }, c, extra);
                stats.callsResolved++;
                continue;
              }
            }
            // `$this->repo->find()` with `Repo` an interface: PHP dispatches to a class the code does not name; a binding may.
            if (recv.ty.kind === "type" || (recv.ty.kind === "outside" && recv.ty.entry.decl.kind === "interface")) {
              dynamic(c, `call through an interface \`${c.receiver ?? tyName(recv.ty)}\``);
              continue;
            }
          }
          if (c.opaque) {
            dynamic(c, `call through an expression \`${c.callee}\``);
            continue;
          }
          // `this.waiting.get()` with `waiting = new Map()`: a method of a global or package class.
          if (c.receiver && external(c.receiver)) {
            stats.callsExternal++;
            continue;
          }
          // `$this->repo->find()` with `Repo` an interface: PHP dispatches to a class the code does not name; a binding may.
          if (c.receiver && interfaceTypes(facts.path) && typeNamed(c.receiver)) {
            dynamic(c, `call through an interface \`${c.receiver}\``);
            continue;
          }
          if (c.bound) {
            // A local binding hides an import or a module declaration of the same name.
            if (locals.has(head) || localDecls.has(head)) {
              stats.callsUnresolved++;
              gaps.push({ kind: "unresolved-call", file: facts.path, line: c.line, col: c.col, endLine: c.endLine, endCol: c.endCol, text: c.callee, reason: `shadowed by ${c.bound} \`${c.callee}\``, source: fn.id });
            } else {
              stats.callsDynamic++;
              gaps.push({ kind: "dynamic-call", file: facts.path, line: c.line, col: c.col, endLine: c.endLine, endCol: c.endCol, text: c.callee, reason: holeReason(c), source: fn.id });
            }
            continue;
          }
          if (head === "eval") continue;
          const targets = resolveCallees(c.callee, cls, isStatic);
          if (targets.length > 1) {
            openEdges.push({ kind: "call", source: fn.id, target: null, candidates: targets.sort(), file: facts.path, line: c.line, col: c.col, endLine: c.endLine, endCol: c.endCol, text: c.callee, resolution: "ambiguous" });
            continue;
          }
          const target = targets[0] ?? null;
          if (target && head === "this" && cls) {
            push(target, c, {}, cls.id);
            continue;
          }
          if (!target && php && !c.bound) {
            // `$this->getData()` of a base outside the architecture, `Registry::m()` and `new X()` of a class there.
            const holder: Ty | null = head === "this" ? (cls && parts.length === 2 ? { kind: "class", id: cls.id } : null) : head !== "super" && parts.length <= 2 ? tyNamed(facts, head) : null;
            const hit = holder && (holder.kind === "class" || (holder.kind === "outside" && holder.entry.decl.kind !== "interface")) ? (parts.length === 2 ? memberHit(holder, parts[1]!)?.outside : holder.kind === "outside" ? { entry: holder.entry, name: "__construct" } : undefined) : undefined;
            if (hit) {
              pushOutside(hit, c, {});
              continue;
            }
          }
          if (!target) {
            const imported = (locals.get(head) ?? [])[0];
            if (imported?.module.layer === EXTERNAL || globalsOf(facts.path).values.has(head)) stats.callsExternal++;
            // `this.setState()` in a class over a package's base: the package's member, as `super.setState()` is.
            else if (head === "this" && cls && c.callee.split(".").length === 2 && unreadBase(cls.id)?.external === true) stats.callsExternal++;
            else if (head !== "this" && !locals.has(head) && !localDecls.has(head)) {
              // A name no table of the file's glob imports lists: a package's, or one keylang cannot see.
              const glob = globOrigin();
              if (glob === "external") stats.callsExternal++;
              else {
                stats.callsDynamic++;
                const reason = glob === "unknown" && !c.hook ? `call through \`${c.callee}\`, a name from a glob import keylang does not follow` : holeReason(c);
                gaps.push({ kind: "dynamic-call", file: facts.path, line: c.line, col: c.col, endLine: c.endLine, endCol: c.endCol, text: c.callee, reason, source: fn.id });
              }
            } else {
              stats.callsUnresolved++;
              // `ns()` with `import * as ns`: a TypeError at run time, and no edge to the default export.
              const object = languageOf(facts.path) === "typescript" || languageOf(facts.path) === "javascript" ? "namespace object" : "module object";
              const reason = c.hook ? holeReason(c) : c.callee === head && imported?.namespace ? `call of the ${object} \`${head}\`, which is no function` : `unresolved call \`${c.callee}\``;
              gaps.push({ kind: "unresolved-call", file: facts.path, line: c.line, col: c.col, endLine: c.endLine, endCol: c.endCol, text: c.callee, reason, source: fn.id });
            }
            continue;
          }
          push(target, c);
        }
      }
    };
    attach(facts.decls, null);
    // Module-level code runs when the module loads (on an `import()` too); a
    // function value there runs whenever code holding it calls it. Neither is
    // a caller keylang follows, so what they call escapes.
    for (const c of facts.moduleCalls ?? []) {
      const escape: Escape = { file: facts.path, line: c.line, col: c.col, reason: `\`${c.callee}\` is called from ${c.closure ? "a function value outside declarations" : "module-level code"}` };
      const head = c.callee.split(".")[0]!;
      const typed = receiverTarget(c.callee, c.receiver);
      const targets = typed ? [typed] : c.bound || c.opaque || head === "super" ? [] : resolveCallees(c.callee, null, false);
      for (const id of targets) {
        const target = decls.classes.has(id) ? constructorOf(id) : id;
        if (!readIds.has(target)) readIds.set(target, escape);
      }
      if (targets.length > 0 || !c.callee.includes(".")) continue;
      if (external(head)) continue;
      const member = c.callee.slice(c.callee.lastIndexOf(".") + 1).replace(/^#/, "");
      const key = member.normalize("NFC");
      if (IDENTIFIER.test(member) && !calledNames.has(key)) calledNames.set(key, escape);
    }
    for (const ref of facts.valueRefs ?? []) {
      const escape = { file: facts.path, line: ref.line, col: ref.col, reason: `\`${ref.name}\` is read as a value` };
      if (ref.member) {
        const key = ref.name.normalize("NFC");
        if (!readMembers.has(key)) readMembers.set(key, escape);
        continue;
      }
      // A namespace object read as a value (`keep(ns)`) hands on every export of its module.
      for (const imp of ref.name.includes(".") ? [] : (locals.get(ref.name) ?? [])) {
        if (!imp.namespace) continue;
        for (const id of exportedCallables(imp.unit)) {
          const target = decls.classes.has(id) ? constructorOf(id) : id;
          if (!readIds.has(target)) readIds.set(target, escape);
        }
      }
      // A class read as a value (`extends A`, a factory argument) may be constructed anywhere.
      for (const id of resolveCallees(ref.name, null, false)) {
        const target = decls.classes.has(id) ? constructorOf(id) : id;
        if (!readIds.has(target)) readIds.set(target, escape);
      }
    }
    const resolveType = (ref: TypeRefFact): string[] => {
      const segments = ref.name.split(".");
      const head = segments[0] ?? "";
      if (!head) return [];
      const found = new Set<string>();
      const local = localDecls.get(layerName(head));
      if (local) found.add(local);
      const member = segments.length > 1 ? segments.at(-1)! : "";
      const narrowed = new Set<string>();
      for (const imp of locals.get(head) ?? []) {
        // `NS.Id` with `import * as NS`: the named export `Id`, not a member of the default export.
        if (imp.kind === "module" && segments.length === 2) {
          const id = exportOf(imp.unit, member);
          if (id) narrowed.add(id);
          continue;
        }
        const id = importedSymbol(imp);
        if (id) found.add(id);
      }
      // A namespace (`export * as T`) is not a type.
      if (!member) return [...found].filter((id) => namespaceUnit(id) === null);
      for (const id of found) {
        const ns = namespaceUnit(id);
        // `T.Id` with `import { T }` of `export * as T from "./t"`.
        const child = ns ? (segments.length === 2 ? exportOf(ns, member) : null) : declModule.get(id)?.get(layerName(member));
        if (child) narrowed.add(child);
      }
      return [...narrowed];
    };
    const noteTypes = (factDecls: DeclFact[], owner: Module): void => {
      for (const d of factDecls) {
        const source = decls.ids.get(d) ?? owner.id;
        for (const ref of d.types) {
          const targets = resolveType(ref).filter((id) => id !== source);
          if (targets.length === 0) {
            if (globalsOf(facts.path).types.has(ref.name.split(".")[0] ?? ref.name)) continue;
            openEdges.push({ kind: "type", source, target: null, candidates: [], file: facts.path, line: ref.line, col: ref.col, endLine: ref.endLine, endCol: ref.endCol, text: ref.text, resolution: "unresolved" });
            continue;
          }
          openEdges.push({
            kind: "type",
            source,
            target: targets.length === 1 ? (targets[0] ?? null) : null,
            candidates: targets.length > 1 ? targets.sort() : [],
            file: facts.path,
            line: ref.line,
            col: ref.col,
            endLine: ref.endLine,
            endCol: ref.endCol,
            text: ref.text,
            resolution: targets.length > 1 ? "ambiguous" : "resolved",
          });
        }
        if (d.kind === "class") {
          const cls = decls.classes.get(decls.ids.get(d) ?? "");
          if (cls) noteTypes(d.members, cls);
        }
      }
    };
    noteTypes(facts.decls, module);
  }

  // 5. Injected hook values: a resolved caller passes a function for the parameter the hook reads.
  for (const { fn, hook, owner, call } of hookCalls) {
    for (const item of injections.get(owner) ?? []) {
      if (item.arg !== hook.param || item.path !== hook.path) continue;
      if (item.target === fn.id || fn.calls.some((c) => c.target === item.target)) continue;
      fn.calls.push({ target: item.target, line: call.line, col: call.col, endLine: call.endLine, endCol: call.endCol, text: call.callee, via: "injected", hook: hook.name, site: item.site, ...(call.closure ? { closure: true as const } : {}) });
    }
  }
  // A method of a class whose base keylang has not read (a package, a global,
  // an unresolved name) may be called by that base: `_read` of a `Readable`,
  // `render` of a component, `connectedCallback` of an element.
  for (const id of classBase.keys()) {
    const base = unreadBase(id)?.text;
    const cls = decls.classes.get(id);
    if (!base || !cls) continue;
    for (const fn of cls.fns) if (fn.name !== constructorName(fn.file ?? cls.path)) fn.escapes ??= { file: fn.file ?? cls.path ?? "", line: fn.line, col: fn.col, reason: `\`${fn.name}\` may be called by the base class \`${base}\`` };
  }
  if (bindings) intercept(bindings);
  // Dispatches a framework reads from code (`event(new E)`, `$bus->dispatch(new M)`): an edge from the fn to the event its class names.
  for (const input of frameworks) {
    for (const { facts: config } of input.configs) {
      for (const d of config.dispatches ?? []) {
        const fn = decls.fns.get(declIdIn(config.path, d.symbol) ?? "");
        if (!fn || fn.calls.some((c) => c.via === "dispatch" && c.line === d.line && c.col === d.col)) continue;
        const call: Call = { target: "", line: d.line, col: d.col, endLine: d.endLine, endCol: d.endCol, text: d.text, via: "dispatch" };
        fn.calls.push(call);
        dispatches.push({ call, name: d.event, file: config.path });
      }
    }
  }
  markEscapes(modules, readIds, readMembers, calledNames, decls.members);
  const events = eventNodes(dispatches, called?.observers ?? [], called?.events ?? []);

  stats.modules = [...modules.values()].filter((m) => m.layer !== EXTERNAL).length;
  const orderedLayers = [...layers.values()].filter((l) => l.modules.length > 0);
  const byPath = new Map<string, Module>();
  for (const [path, entry] of byFile) byPath.set(path, entry.module);
  return {
    layers: orderedLayers,
    modules,
    byPath,
    stats,
    warnings,
    gaps,
    assumed: assumedImports,
    openEdges,
    // Manifests are inputs too: the snapshot id (and the MCP cache keyed on it) covers them.
    resolverInputs: new Map([...manifests.inputs, ...resolverInputs()]),
    // A file's own table is how imports resolve; the snapshot lists the modules' tables, by module IDs.
    exports: exportTables
      .entries()
      .filter((e) => !e.module.startsWith(FILE_UNIT))
      .map((e) => ({ ...e, symbol: e.symbol === null ? null : moduleOfUnit(e.symbol), ...(e.from !== undefined ? { from: moduleOfUnit(e.from) } : {}) })),
    packages,
    events,
    frameworkEntries: called?.entries ?? [],
  };
}

/**
 * Event nodes (ADR 0022 п. 6): every name a literal dispatch or an observer's
 * config writes, with an ID of the group `events`. A dispatch call gets the
 * event's ID as its target; an observer is a call of the event, at its
 * config line. An event is placed at its first dispatch in the code, else at
 * its first observer declaration.
 */
function eventNodes(dispatches: readonly { call: Call; name: string; file: string }[], observers: readonly ObserverEdge[], declared: readonly { name: string; file: string; line: number; col: number }[]): EventNode[] {
  const ids = eventIds([...dispatches.map((d) => d.name), ...declared.map((d) => d.name)]);
  const nodes = new Map<string, EventNode>();
  for (const [name, id] of ids) nodes.set(id, { id, name, file: null, line: 1, col: 1, calls: [] });
  const places: { id: string; code: boolean; file: string; line: number; col: number }[] = [];
  for (const d of dispatches) {
    d.call.target = ids.get(d.name)!;
    places.push({ id: d.call.target, code: true, file: d.file, line: d.call.line, col: d.call.col });
  }
  for (const o of [...observers].sort((a, b) => compareText(a.file, b.file) || a.line - b.line || a.col - b.col)) {
    const id = ids.get(o.event)!;
    nodes.get(id)!.calls.push({ target: o.target, line: o.line, col: o.col, endLine: o.line, endCol: o.col + 1, text: o.text, via: "observer", site: o.site, scope: o.scope, binding: o.binding, file: o.file, ...(o.owner !== null ? { owner: o.owner } : {}) });
  }
  // An event no code keylang read dispatches stands at its first observer declaration.
  for (const d of declared) places.push({ id: ids.get(d.name)!, code: false, file: d.file, line: d.line, col: d.col });
  places.sort((a, b) => Number(b.code) - Number(a.code) || compareText(a.file, b.file) || a.line - b.line || a.col - b.col);
  for (const p of places) {
    const n = nodes.get(p.id)!;
    if (n.file === null) Object.assign(n, { file: p.file, line: p.line, col: p.col });
  }
  return [...nodes.values()].sort((a, b) => compareText(a.id, b.id));
}

/**
 * A class name as a file writes it, qualified through the file's imports: PHP `Foo` with `use A\Foo` → `A\Foo`,
 * `\A\Foo` → `A\Foo`; TS/JS `EventEmitter2` with `import { EventEmitter2 } from "@nestjs/event-emitter"` →
 * `@nestjs/event-emitter\EventEmitter2` (the package, `\`, the exported name).
 */
function qualifiedIn(facts: FileFacts, written: string): string {
  const language = languageOf(facts.path);
  if (language === "typescript" || language === "javascript") {
    for (const imp of facts.imports) {
      const binding = imp.bindings.find((b) => b.local === written);
      if (binding !== undefined) return binding.kind === "named" ? `${imp.source}\\${binding.imported}` : imp.source;
    }
    return written;
  }
  if (written.startsWith("\\")) return written.replace(/^\\+/, "");
  const [head, ...rest] = written.split("\\");
  for (const imp of facts.imports) {
    if (/^(?:function|const) /.test(imp.source)) continue;
    if (imp.bindings.some((b) => b.kind === "named" && b.local === head)) return [imp.source.replace(/^\\+/, ""), ...rest].join("\\");
  }
  return written;
}

/** A file name no language claims: placing it in a directory gives the directory's module. */
const DIRECTORY_PROBE = "keylang-directory-probe";

/** The module of a directory (a framework module's root): a directory module, or the layer itself when the layer's glob starts there; null when the graph has neither. */
export function directoryModule(config: Config, dir: string, graph: Pick<Graph, "modules" | "layers">): string | null {
  return directoryModuleIn(config, dir, graph.modules, new Map(graph.layers.map((l) => [l.name, l])));
}

function directoryModuleIn(config: Config, dir: string, modules: ReadonlyMap<string, Module>, layers: ReadonlyMap<string, Layer>): string | null {
  const place = placeFile(config, dir === "" ? DIRECTORY_PROBE : `${dir}/${DIRECTORY_PROBE}`);
  if (place === null) return null;
  const segments = config.module === "dir" ? place.segments : place.segments.slice(0, -1);
  const id = [place.layer, ...segments].join(".");
  if (modules.has(id)) return id;
  return segments.length === 0 && (layers.get(place.layer)?.modules.length ?? 0) > 0 ? place.layer : null;
}

const IDENTIFIER = /^[\p{L}\p{Nl}_$][\p{L}\p{Nl}\p{Mn}\p{Mc}\p{Nd}\p{Pc}_$]*$/u;

/**
 * The export-table key of one file of a module made of several files (`module: "dir"`, `x.ts`
 * beside `x/index.ts`): `file:<path>`. No module ID has a `:`, so the keys never meet.
 */
const FILE_UNIT = "file:";

/** What one glob import (`use m::*`, `from m import *`) brings into a file's scope. */
interface GlobSource {
  /** The export table of the source; null when keylang cannot list its names. */
  unit: string | null;
  /** A package or the standard library: a name only it can bind is called outside the graph. */
  external: boolean;
}

/** A class's `extends`: the base keylang has read, or the text of one it has not, and whether that names a package's or the language's class. */
interface BaseLink {
  internal: string | null;
  text: string;
  external: boolean;
  /** PHP: the unread base is a class of a file `outside` the architecture, read as declarations (its qualified name, ASCII lower case). */
  outside?: string;
}

/** A class or interface of a file `outside` the architecture, read as declarations only. */
interface OutsideEntry {
  decl: OutsideDeclFact;
  file: string;
  /** The opaque module of the file: the target of a call that runs one of its members. */
  module: string;
}

/**
 * The class of a value, as far as declarations tell it (PHP, business-flows 40): a class or an
 * interface of the graph, one of a file `outside` the architecture, or a class a framework
 * generates (`factory`: Magento's `XFactory`, whose `create()` gives an `X`).
 */
type Ty = { kind: "class"; id: string } | { kind: "type"; id: string } | { kind: "outside"; entry: OutsideEntry } | { kind: "factory"; name: string; of: Ty; method: string };

/** Where a call runs, as `receiverTy` reads a call fact: the file and the class of the fn. */
interface CallCtx {
  facts: FileFacts;
  cls: Module | null;
}

/** A class a value has, and the docblock it rests on (`file:line:col`) when one does. */
interface Typed {
  ty: Ty;
  doc?: string;
  /** The class is written in another declaration than the call's file: a method's result type, a base's property. */
  indirect?: true;
}

/** A member a value's class has: the fn it runs (`target`) or the `outside` member, and its declared result type. */
interface MemberHit {
  /** An fn of the graph the call runs. */
  target?: string;
  /** A member of a class `outside` the architecture: its entry and name as declared. */
  outside?: { entry: OutsideEntry; name: string };
  /** The declared result type and the file that writes it (for a docblock's position). */
  result?: ResultTypeFact;
  file?: string;
  /** The class that declares the member: what `self` names. */
  owner?: Ty;
  /** A generated class's member: the class of its result as the framework generates it. */
  gives?: Ty;
}

/** Python and PHP reach a static member through an instance (`s.make()`, `$this->make()`); JavaScript does not. */
function staticThroughInstance(file: string): boolean {
  const language = languageOf(file);
  return language === "python" || language === "php";
}

/** What one import binding names in the file: a declaration of the module (`named`, `default`) or the module itself. */
interface ImportTarget {
  module: Module;
  /** The export table the binding's names resolve in: the module's, or the imported file's in a module of several files. */
  unit: string;
  kind: ImportBinding["kind"];
  /** The export the binding names: its name, `default`, or null for the whole module. */
  imported: string | null;
  /** An ESM namespace object (`import * as ns`): no function and no default value, unlike `module.exports` of `require()`. */
  namespace: boolean;
}

/**
 * A module an import may bind that is never added to the graph: an external
 * one, so calls through its names are external. Its ID is no valid ID, so it
 * names no node.
 */
function unindexedModule(name: string): Module {
  return { id: `${EXTERNAL}.<${name}>`, layer: EXTERNAL, name: `<${name}>`, path: null, line: null, col: null, endLine: null, endCol: null, synthetic: true, class: false, comment: null, doc: null, deps: [], fns: [], types: [], children: [], members: "opaque", starSources: [] };
}

/** What a standard-library import (Python `typing`) binds. */
const STDLIB_MODULE = unindexedModule("stdlib");

/** What an import of a file `assume` lists binds: code keylang deliberately leaves unread, as it leaves a package. */
const ASSUMED_MODULE = unindexedModule("assumed");

/**
 * A specifier that names the module itself (Rust `use crate::a`, Python `from pkg import mod`)
 * binds the module object, which is no function, like an ESM namespace.
 */
function importTarget(module: Module, unit: string, binding: ImportBinding, whole: boolean): ImportTarget {
  if (whole || binding.kind === "module") return { module, unit, kind: "module", imported: null, namespace: whole || (binding.kind === "module" && binding.namespace === true) };
  return binding.kind === "default" ? { module, unit, kind: "default", imported: "default", namespace: false } : { module, unit, kind: "named", imported: binding.imported, namespace: false };
}

/**
 * One export row of a file, with what it stands for: a declaration of the
 * file (`scope`), a name or the namespace of the module an import binds, or
 * nothing keylang indexes. A re-export (`export { a } from`, Rust `pub use`)
 * goes through its own import; any other name through a declaration of the
 * file or an import of the file.
 */
function exportInput(row: ExportRow, facts: FileFacts, scope: ReadonlyMap<string, string>, imported: ReadonlyMap<string, ImportTarget[]>): ExportRowInput {
  const name = row.name;
  // Rows of frontends that say how a name is exported in `kind`.
  const legacy: ExportForm | undefined = row.kind === "default" || (row.kind === "alias" && name === "default") ? "default" : row.kind === "alias" && row.local !== null && row.local !== name ? "alias" : row.kind === "reexport" ? "reexport" : undefined;
  let form = row.form ?? legacy;
  const kind: ExportKind = row.kind === "fn" || row.kind === "class" || row.kind === "type" ? row.kind : "value";
  const reexported = facts.imports.some((imp) => imp.reexport && imp.bindings.some((b) => b.local === name));
  const local = row.local ?? name;
  const declared = reexported ? undefined : scope.get(layerName(local));
  const found = declared === undefined ? imported.get((reexported ? name : local).normalize("NFC"))?.[0] : undefined;
  // The standard library and an assumed file are no nodes: such a name comes from no module of the snapshot.
  const from = found?.module.synthetic ? undefined : found?.module.id;
  let target: ExportTarget = { kind: "none" };
  if (declared !== undefined) target = { kind: "symbol", id: declared };
  else if (found && found.module.layer !== EXTERNAL) target = found.kind === "module" ? { kind: "namespace", module: found.unit } : { kind: "name", module: found.unit, name: found.imported ?? "default" };
  if (target.kind === "namespace" && form !== "default") form = "namespace";
  return { name, kind, ...(form ? { form } : {}), ...(row.local !== null && row.local !== name ? { local: row.local } : {}), ...(from ? { from } : {}), target };
}

/** Names of the external packages (and `node` for built-ins) the files import. */
function importedPackages(files: readonly FileFacts[], resolve: (file: string, spec: string) => Resolution): Set<string> {
  const packages = new Set<string>();
  for (const f of files) {
    for (const imp of f.imports) {
      const r = resolve(f.path, imp.source);
      if (r.kind === "external") packages.add(r.pkg);
      else if (r.kind === "builtin") packages.add("node");
    }
  }
  return packages;
}

/**
 * Why a resolved source file has no module; null when it is left out on
 * purpose: not source code (JSON, CSS), a test or declaration file,
 * `exclude`, outside guessed layers.
 */
function notIndexed(config: Config, file: string): string | null {
  const language = languageOf(file);
  if (language === undefined || isExcluded(file, config.exclude) || isOutside(file, config.outside)) return null;
  if (config.guessed && placeFile(config, file) === null) return null;
  return config.languages.includes(language) ? `\`${file}\` is not indexed` : `\`${file}\` is ${language}, which \`languages\` does not list`;
}

function isIndexFile(file: string): boolean {
  const language = languageOf(file);
  const base = posix.basename(file).replace(/\.[^.]+$/, "");
  return language !== undefined && LANGUAGES[language].index.includes(base);
}

/**
 * Add a call unless an edge to the same target already says as much. Edges
 * rank by what they prove: a plain call outside a closure (3) proves the
 * path in every mode; a hook's default, a callable passed as an argument or
 * a call in a closure passed as one (2) prove it in `behavior`, and one of
 * them says as much as another; a call in a stored closure (1) is only a
 * possible route, and two of them differ by `via`. A stronger edge replaces
 * the weaker ones. True when added.
 */
function addCall(fn: Fn, call: Call): boolean {
  const rank = (c: Call): number => (c.via === undefined ? (c.closure ? 1 : 3) : c.via === "closure-arg" || !c.closure ? 2 : 1);
  const covers = (a: Call, b: Call): boolean => a.target === b.target && (rank(a) > rank(b) || (rank(a) === rank(b) && (rank(a) !== 1 || a.via === b.via)));
  if (fn.calls.some((c) => covers(c, call))) return false;
  fn.calls = fn.calls.filter((c) => !covers(call, c));
  fn.calls.push(call);
  return true;
}

function holeReason(c: CallFact): string {
  if (c.hook) return `call through the hook \`${c.hook.name}\` (default \`${c.hook.fallback}\`)`;
  if (c.callee.startsWith("this.")) return `call through \`this\` of a function value \`${c.callee}\``;
  return `call through a local value \`${c.callee}\``;
}

/**
 * Functions that code may reach without naming them in a call: read as a value
 * (`later(save)` names the declaration `save` resolves to; `obj.save` any
 * method `save`), called implicitly, or the constructor of a class read as a
 * value (`extends A` runs `A`'s constructor). Names read and called are keyed in NFC;
 * a fn of PHP matches them in any ASCII case (`[$o, 'SAVE']` reads `save`).
 */
function markEscapes(modules: Map<string, Module>, readIds: ReadonlyMap<string, Escape>, readMembers: ReadonlyMap<string, Escape>, calledNames: ReadonlyMap<string, Escape>, members: Decls["members"]): void {
  const caselessReads = foldCase(readMembers);
  const caselessCalls = foldCase(calledNames);
  const visit = (m: Module, isClass: boolean): void => {
    for (const fn of m.fns) {
      if (fn.escapes) continue;
      // A member is named in code as written (`go`), whatever suffix its ID has (`go-private`).
      const name = members.get(fn.id)?.name ?? fn.written ?? fn.name;
      const key = name.normalize("NFC");
      const file = fn.file ?? m.path;
      const caseless = caselessNames(file);
      const named = (exact: ReadonlyMap<string, Escape>, folded: ReadonlyMap<string, Escape>): Escape | undefined => exact.get(key) ?? (caseless ? folded.get(asciiLowerCase(key)) : undefined);
      const ref = readIds.get(fn.id) ?? (isClass && fn.name !== constructorName(file) ? named(readMembers, caselessReads) : undefined) ?? named(calledNames, caselessCalls);
      if (ref) fn.escapes = ref;
      else if (isClass && !members.get(fn.id)?.hash && implicitMember(file, name)) fn.escapes = { file: file ?? "", line: fn.line, col: fn.col, reason: `\`${name}\` is called implicitly` };
    }
    for (const child of m.children) if (child.class) visit(child, true);
  };
  for (const m of modules.values()) visit(m, false);
}

/** Names keyed in ASCII lower case, each with the escape of its first spelling: what a language whose names compare without case looks up. */
function foldCase(names: ReadonlyMap<string, Escape>): Map<string, Escape> {
  const out = new Map<string, Escape>();
  for (const [name, escape] of names) if (!out.has(asciiLowerCase(name))) out.set(asciiLowerCase(name), escape);
  return out;
}

function markOpaque(m: Module): void {
  m.members = "opaque";
  for (const c of m.children) markOpaque(c);
}

/** Where each declaration went: several facts (overloads) may share one node. */
interface Decls {
  ids: Map<DeclFact, string>;
  fns: Map<string, Fn>;
  classes: Map<string, Module>;
  /** Type node ids. */
  types: Set<string>;
  /** Class member fn id → its name as written without `#`, and whether it is `#private`. */
  members: Map<string, { name: string; hash: boolean }>;
}

/**
 * Name in ASCII lower case → the names of the declarations an export table lists under it. A row that
 * stands for no declaration (a PHP constant, which keeps its case) is left out.
 */
function caselessIndex(rows: readonly ExportRowInput[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const row of rows) {
    if (row.target.kind !== "symbol") continue;
    const key = asciiLowerCase(row.name);
    const names = out.get(key) ?? [];
    if (!names.includes(row.name)) out.set(key, [...names, row.name]);
  }
  return out;
}

/** Lookup key of a class member: `this.#m` in a static method is `static #m`. `caseless`: a language whose method names compare without ASCII case (PHP). */
export function memberKey(member: string, isStatic: boolean, caseless = false): string {
  const hash = member.startsWith("#");
  const key = `${isStatic ? "static " : ""}${hash ? "#" : ""}${layerName(hash ? member.slice(1) : member)}`;
  return caseless ? asciiLowerCase(key) : key;
}

/** Suffixes of a member whose name another member of the class already has. */
const MEMBER_SUFFIX = ["", "-static", "-private", "-static-private"];

/**
 * ID segments of class members. An instance member keeps its name; a static
 * or `#private` member of the same name as another gets a suffix (`m-static`,
 * `go-private`, `go-static-private`), which no JS name can collide with.
 * Priority: instance, static, `#private`, static `#private`. A segment keeps
 * the case of the declaration; a `caseless` key does not (PHP).
 */
function memberSegments(members: readonly DeclFact[], caseless: boolean): Map<DeclFact, { key: string; segment: string }> {
  const rank = (m: DeclFact): number => (m.static ? 1 : 0) + (m.hash ? 2 : 0);
  const out = new Map<DeclFact, { key: string; segment: string }>();
  const byKey = new Map<string, string>();
  const used = new Set<string>();
  for (const m of [...members].sort((a, b) => rank(a) - rank(b))) {
    const key = memberKey(`${m.hash ? "#" : ""}${m.name}`, m.static === true, caseless);
    let segment = byKey.get(key);
    if (segment === undefined) {
      const name = layerName(m.name);
      segment = used.has(name) ? `${name}${MEMBER_SUFFIX[rank(m)]}` : name;
      used.add(segment);
      byKey.set(key, segment);
    }
    out.set(m, { key, segment });
  }
  return out;
}

/**
 * ID segments of a module's top-level declarations. One file's declarations
 * of a name share a node (overloads, a class merged with its interface); the
 * same name in another file of the module (`module: "dir"`, `x.ts` beside
 * `x/index.ts`) is another symbol, whose segment gets `-2`, `-3`… (no
 * declaration name has a `-`): an exported declaration keeps the plain
 * segment before an internal one, then the first file by path. A second
 * exported declaration of a name is worth a warning; file-private helpers of
 * the same name are common in a directory, and their IDs show it.
 */
function topSegments(module: Module, files: readonly FileFacts[], warnings: string[]): Map<DeclFact, string> {
  const groups = new Map<string, { file: string; decls: DeclFact[]; exported: boolean }[]>();
  for (const f of [...files].sort((a, b) => compareText(a.path, b.path))) {
    const own = new Map<string, DeclFact[]>();
    for (const d of f.decls) own.set(layerName(d.name), [...(own.get(layerName(d.name)) ?? []), d]);
    for (const [key, list] of own) groups.set(key, [...(groups.get(key) ?? []), { file: f.path, decls: list, exported: list.some((d) => d.exported) }]);
  }
  const taken = new Set([...groups.keys(), ...module.children.map((c) => c.name)]);
  const out = new Map<DeclFact, string>();
  for (const [key, list] of groups) {
    // A stable sort: files keep their path order among exported and among internal declarations.
    const ordered = [...list].sort((a, b) => Number(b.exported) - Number(a.exported));
    ordered.forEach((group, i) => {
      let segment = key;
      if (i > 0) {
        let n = 2;
        while (taken.has(`${key}-${n}`)) n++;
        segment = `${key}-${n}`;
        taken.add(segment);
        if (group.exported) warnings.push(`${group.file}: \`${group.decls[0]!.name}\` is also exported by \`${ordered[0]!.file}\`, another file of module \`${module.id}\`; its ID here is \`${module.id}.${segment}\``);
      }
      for (const d of group.decls) out.set(d, segment);
    });
  }
  return out;
}

/** The key the last declaration of each scope (`names`) went under: overloads follow one another. */
const lastKeys = new WeakMap<Map<string, string>, string>();

function addDecl(module: Module, d: DeclFact, names: Map<string, string>, declModule: Map<string, Map<string, string>>, decls: Decls, stats: Stats, file: string, member?: { key: string; segment: string }): void {
  const name = member?.segment ?? layerName(d.name);
  const key = member?.key ?? name;
  const previous = lastKeys.get(names);
  lastKeys.set(names, key);
  const existing = names.get(key);
  if (existing !== undefined) {
    // Overloads and duplicate declarations of one scope (a file, a class): the implementation's calls join the first node.
    if (d.kind === "fn" && decls.fns.has(existing)) {
      decls.ids.set(d, existing);
      const fn = decls.fns.get(existing)!;
      // Overloads stand next to each other: the node's range runs on to the implementation,
      // so its code (an explanation's prompt, `context`) holds the body. A duplicate declared further away keeps its own range.
      if (previous === key && fn.file === file && d.line > fn.endLine) {
        fn.endLine = d.endLine;
        fn.endCol = d.endCol;
      }
      if (fn.fingerprint !== undefined && d.fingerprint !== undefined) fn.fingerprint = `${fn.fingerprint}:${d.fingerprint}`;
      if (fn.doc === undefined && d.doc !== undefined) fn.doc = d.doc;
      return;
    }
    // `interface Foo` and `class Foo` merge in TypeScript: the value (class or
    // fn) is the node, whichever comes first, and the type's references are its own.
    if (d.kind === "type" || !decls.types.has(existing)) {
      if (d.kind === "type") decls.ids.set(d, existing);
      return;
    }
    module.types.splice(module.types.findIndex((t) => t.id === existing), 1);
    decls.types.delete(existing);
    stats.types--;
  }
  if (d.kind === "class") {
    const id = `${module.id}.${name}`;
    const cls: Module = { id, layer: module.layer, name, path: file, line: d.line, col: d.col, endLine: d.endLine, endCol: d.endCol, synthetic: false, class: true, comment: d.exported ? null : "internal", doc: d.doc ?? null, deps: [], fns: [], types: [], children: [], members: "complete", starSources: [], ...(d.values !== undefined ? { values: d.values } : {}) };
    module.children.push(cls);
    names.set(key, id);
    decls.ids.set(d, id);
    decls.classes.set(id, cls);
    const members = new Map<string, string>();
    declModule.set(id, members);
    const segments = memberSegments(d.members, caselessNames(file));
    for (const m of d.members) {
      addDecl(cls, m, members, declModule, decls, stats, file, segments.get(m));
      const fnId = decls.ids.get(m);
      if (fnId && !decls.members.has(fnId)) decls.members.set(fnId, { name: m.name, hash: m.hash === true });
    }
    return;
  }
  const id = `${module.id}.${name}`;
  names.set(key, id);
  decls.ids.set(d, id);
  if (d.kind === "fn") {
    const fn: Fn = {
      id,
      name,
      file,
      line: d.line,
      col: d.col,
      endLine: d.endLine,
      endCol: d.endCol,
      signature: d.signature,
      exported: d.exported,
      ...(d.static ? { static: true as const } : {}),
      ...(d.name !== name ? { written: d.name } : {}),
      calls: [],
      ...(d.fingerprint !== undefined ? { fingerprint: d.fingerprint } : {}),
      ...(d.doc !== undefined ? { doc: d.doc } : {}),
    };
    module.fns.push(fn);
    decls.fns.set(id, fn);
    stats.fns++;
  } else {
    module.types.push({ id, name, file, line: d.line, col: d.col, endLine: d.endLine, endCol: d.endCol, signature: d.signature, exported: d.exported, ...(d.fingerprint !== undefined ? { fingerprint: d.fingerprint } : {}), ...(d.doc !== undefined ? { doc: d.doc } : {}) });
    decls.types.add(id);
    stats.types++;
  }
}

/**
 * Layer and module path segments for a file, from the first matching layer
 * glob. `stem` is the path the module stands for, before segments are
 * sanitized: the file without its extension (`src/a/b` for `src/a/b.ts` and
 * `src/a/b/index.ts`), or its directory in `dir` mode. Two files of one ID
 * and one stem are one module; two stems of one ID are a collision.
 */
/** Where `file` lands: its layer, module ID segments and path stem, and the layer glob that placed it (none for `outside`). */
export function placeFile(config: Config, file: string): { layer: string; segments: string[]; stem: string; glob: string | null } | null {
  // `outside` wins over the layers: such a file is not part of the architecture. Its ID follows its path, as in `unassigned`.
  if (isOutside(file, config.outside)) {
    const stem = file.replace(/\.[^./]+$/, "");
    return { layer: OUTSIDE_LAYER, segments: stem.split("/").map(layerName), stem, glob: null };
  }
  for (const [layer, globs] of config.layers) {
    for (const g of globs) {
      if (!matchesGlob(file, g)) continue;
      const prefix = globPrefix(g);
      const under = prefix !== "" && file.startsWith(`${prefix}/`);
      const rel = (under ? file.slice(prefix.length + 1) : file).replace(/\.[^./]+$/, "");
      let segments = rel.split("/");
      const language = languageOf(file);
      if (config.module === "dir" && segments.length > 1) segments = segments.slice(0, -1);
      // The index file of a directory (`index.ts`, `mod.rs`, `__init__.py`) is its module; in `dir` mode the file name is gone already, and a directory named `index` is a module of its own.
      else if (segments.length > 1 && language !== undefined && LANGUAGES[language].index.includes(segments.at(-1)!)) segments = segments.slice(0, -1);
      return { layer, segments: segments.map(layerName), stem: [...(under ? [prefix] : []), ...segments].join("/"), glob: g };
    }
  }
  return null;
}

/** The last segment of a qualified PHP name. */
function lastSegmentOf(name: string): string {
  return name.slice(name.lastIndexOf("\\") + 1);
}
