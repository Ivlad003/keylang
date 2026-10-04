// Facts → graph: files become modules in layers, declarations become fn/type
// nodes, imports become dependencies. A resolved call is a syntactic edge;
// a local or missing callee stays a gap instead of a confirmed edge.

import { posix } from "node:path";
import { isExcluded, layerName, type Config } from "./config.ts";
import { readManifests, type DeclaredPackage } from "./declared-packages.ts";
import { resolveExports, type ExportEntry, type ExportForm, type ExportKind, type ExportRowInput, type ExportTarget, type ModuleExportsInput } from "./exports.ts";
import type { CallFact, DeclFact, ExportRow, FileFacts, HookFact, ImportBinding, TypeRefFact } from "./extract/facts.ts";
import { assignExternalIds, EXTERNAL, externalSegment } from "./external-ids.ts";
import { globPrefix, matchesGlob } from "./glob.ts";
import { frontendFor, frontendOf, type Frontend, type SourceResolver } from "./frontends.ts";
import type { Resolution } from "./imports.ts";
import { constructorName, implicitMember, LANGUAGES, languageOf } from "./languages.ts";
import { compareText } from "./span.ts";

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
  /** Type edges and calls with more than one target. Confirmed calls stay on functions. */
  openEdges: OpenEdge[];
  /** Config files import resolution read (`tsconfig.json`, `package.json`), with their text or null. */
  resolverInputs: Map<string, string | null>;
  /** Public names of every indexed module, resolved to symbols; sorted by module and name. */
  exports: ExportEntry[];
  /** Packages the manifests at the root and on the ancestors of analysed files declare, sorted by id. */
  packages: DeclaredPackage[];
}

export interface Gap {
  kind: "unresolved-import" | "dynamic-call" | "unresolved-call" | "parse-error" | "unassigned-file" | "unsupported";
  file: string;
  line: number;
  col: number;
  endLine: number;
  endCol: number;
  text: string;
  reason: string;
  /** Module or function that contains the gap, when there is one. */
  source: string | null;
}

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
}

export interface Escape {
  file: string;
  line: number;
  col: number;
  reason: string;
}

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
   * passes for the hook (`analyze({ generate: worker.generate })`, at `site`).
   */
  via?: "default" | "injected";
  /** The local, parameter or field the hook call goes through. */
  hook?: string;
  /** `file:line:col` of the call that injects the value. */
  site?: string;
  /** The call sits in a closure of the function: whoever holds that value may run it. */
  closure?: true;
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

export function buildGraph(config: Config, files: FileFacts[]): Graph {
  // Resolvers read their config files up front: the snapshot id depends on them even without imports.
  // They see the files of this analysis, unsaved ones included, whatever is on disk now.
  const sources = new Set(files.map((f) => f.path));
  const resolvers = new Map<Frontend, SourceResolver>();
  for (const language of config.languages) {
    const frontend = frontendOf(language);
    if (!resolvers.has(frontend)) resolvers.set(frontend, frontend.resolver(config.root, sources));
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
  const stems = new Map<string, { stem: string; file: string }>();
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
      stems.set(id, { stem, file: f.path });
      representative(m, f);
    } else if (first.stem !== stem) {
      // `foo.bar.ts` and `foo_bar.ts`, `2fa/` and `_2fa/`: two paths that sanitize to one ID. Their members cannot be told apart.
      const reason = `module ID collision: same module ID as \`${first.file}\` (\`${id}\`) from another path; the module is opaque until one of them is renamed`;
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

  // 2. Declarations.
  // Module id → name → node id; class id → member key (`m`, `static m`, `#m`, `static #m`) → fn id.
  const declModule = new Map<string, Map<string, string>>();
  const decls: Decls = { ids: new Map(), fns: new Map(), classes: new Map(), types: new Set(), members: new Map() };
  for (const { facts, module } of byFile.values()) {
    const names = declModule.get(module.id) ?? new Map<string, string>();
    declModule.set(module.id, names);
    for (const d of facts.decls) addDecl(module, d, names, declModule, decls, stats, facts.path);
    for (const hole of facts.unsupported) {
      // A hole in one declaration (a Python decorator that may replace a fn) belongs to that declaration.
      const own = hole.symbol === undefined ? null : [module.id, ...hole.symbol.split(".").map(layerName)].join(".");
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
  const importTargets = new Map<string, Map<string, ImportTarget[]>>(); // file → local → targets
  for (const { facts, module } of byFile.values()) {
    const locals = new Map<string, ImportTarget[]>();
    importTargets.set(facts.path, locals);
    const aliases = new Map<string, string>();
    const hole = (imp: FileFacts["imports"][number], reason: string): void => {
      stats.importsUnresolved++;
      warnings.push(`${facts.path}:${imp.line}: ${reason}`);
      gaps.push({ kind: "unresolved-import", file: facts.path, line: imp.line, col: imp.col, endLine: imp.endLine, endCol: imp.endCol, text: imp.text, reason, source: module.id });
    };
    for (const imp of facts.imports) {
      const r = resolve(facts.path, imp.source);
      const star = imp.reexport && imp.bindings.length === 0;
      let target: Module | null = null;
      if (r.kind === "internal") {
        target = byFile.get(r.file)?.module ?? null;
        if (!target) {
          // A workspace package's entry (`dist/index.js`), a file of a language
          // keylang.json does not list, a file in a build directory or one that
          // appeared after the sources were read: the dependency is there, its target unknown.
          const why = r.workspace ? `workspace package entry \`${r.file}\` is not indexed` : notIndexed(config, r.file);
          if (why === null || imp.optional) {
            // Left out on purpose: tests, declaration files, `exclude`, files outside guessed layers, non-source files.
            if (star) module.starSources.push({ target: null, reason: `re-export from excluded \`${imp.source}\`` });
            continue;
          }
          hole(imp, `unresolved import \`${imp.source}\` (${why})`);
          if (star) module.starSources.push({ target: null, reason: `re-export from unindexed \`${imp.source}\`` });
          continue;
        }
        // A file that imports itself is a self-loop; two files merged into one module are not.
        if (target === module && r.file !== facts.path) continue;
      } else if (r.kind === "local") {
        // `crate::run()` or `self::X` in the file that declares them: the name is this module's own.
        for (const b of imp.bindings) locals.set(b.local, [...(locals.get(b.local) ?? []), importTarget(module, b, false)]);
        continue;
      } else if (r.kind === "generated") {
        if (star) module.starSources.push({ target: null, reason: `re-export from generated \`${imp.source}\`` });
        continue;
      } else if (r.kind === "external" || r.kind === "builtin") {
        const pkg = r.kind === "builtin" ? "node" : r.pkg;
        target = ensureModule(externalIds.get(pkg) ?? `${EXTERNAL}.${externalSegment(pkg)}`, EXTERNAL, null, null, false, null);
        if (pkg !== target.name) target.comment = pkg;
        if (externalLayer.modules.length === 0) layers.set(EXTERNAL, externalLayer);
      } else {
        // `new URL("./worker", import.meta.url)` without a source file behind it names no module.
        if (imp.optional) continue;
        hole(imp, `unresolved import \`${imp.source}\``);
        if (star) module.starSources.push({ target: null, reason: `re-export from unresolved \`${imp.source}\`` });
        continue;
      }
      if (star) module.starSources.push(target.layer === EXTERNAL ? { target: null, reason: `re-export from external \`${imp.source}\`` } : { target: target.id, reason: "" });
      // Rust `a::inner::f` with `mod inner {}` in `a.rs`: `f` is not a member keylang indexed, so the name stays unbound.
      for (const b of r.kind === "internal" && r.nested ? [] : imp.bindings) {
        const list = locals.get(b.local) ?? [];
        list.push(importTarget(target, b, r.kind === "internal" && r.whole === true));
        locals.set(b.local, list);
      }
      // `import { a } from "./x"` and `export { b } from "./x"`: one dependency, an edge of each kind.
      const same = module.deps.filter((d) => d.target === target.id);
      if (same.length > 0) {
        if (!same.some((d) => d.reexport === imp.reexport)) module.deps.push({ alias: same[0]!.alias, target: target.id, file: facts.path, line: imp.line, col: imp.col, endLine: imp.endLine, endCol: imp.endCol, text: imp.text, reexport: imp.reexport });
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
      module.deps.push({ alias, target: target.id, file: facts.path, line: imp.line, col: imp.col, endLine: imp.endLine, endCol: imp.endCol, text: imp.text, reexport: imp.reexport });
      stats.deps++;
    }
  }

  // 3b. Export tables: what each public name stands for, through aliases, re-exports and `export *`.
  const moduleFiles = new Map<string, FileEntry[]>();
  for (const entry of byFile.values()) {
    const list = moduleFiles.get(entry.module.id) ?? [];
    list.push(entry);
    moduleFiles.set(entry.module.id, list);
  }
  const exportInputs = new Map<string, ModuleExportsInput>();
  for (const [id, entries] of moduleFiles) {
    const module = entries[0]!.module;
    const rows: ExportRowInput[] = [];
    for (const { facts } of entries) {
      const listed: ExportRow[] = facts.exportRows.length > 0 ? facts.exportRows : [...facts.exports].sort().map((name) => ({ name, kind: "value", local: name }));
      for (const row of listed) if (row.name !== "*") rows.push(exportInput(row, facts, module, importTargets.get(facts.path)!, declModule));
    }
    exportInputs.set(id, { rows, stars: module.starSources, opaque: module.members === "opaque" });
  }
  const symbolKind = (id: string): ExportKind | null => (decls.classes.has(id) ? "class" : decls.fns.has(id) ? "fn" : decls.types.has(id) ? "type" : null);
  const exportTables = resolveExports(exportInputs, symbolKind, (module, name) => declModule.get(module)?.get(layerName(name)) ?? null);

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
  const classBase = new Map<string, { internal: string | null; text: string }>();
  const injections = new Map<string, { arg: number; path: string; target: string; site: string }[]>();
  /**
   * The symbol a public name of a module stands for: `export { a as b }`,
   * `export default f`, `export { x } from`, `export { x as y } from`, an
   * imported name exported again, `export * as ns from` (the module), and
   * `export * from`. A name without an export row (CommonJS, an unexported
   * helper) is the declaration of that name.
   */
  const resolveExport = (target: Module, name: string): string | null => exportTables.symbolOf(target.id, name);
  /** A module that a symbol names as a namespace (`export * as ns`, `import * as ns; export { ns }`); null for a class or a declaration. */
  const namespaceModule = (id: string | null): Module | null => {
    const m = id === null ? undefined : modules.get(id);
    return m && !m.class && m.layer !== EXTERNAL ? m : null;
  };
  /** A symbol a call can run: a fn, or a class (its constructor). */
  const callable = (id: string): boolean => decls.fns.has(id) || decls.classes.has(id);
  /** Per file: how its names resolve to symbols. */
  const scopeOf = (facts: FileFacts, module: Module) => {
    const locals = importTargets.get(facts.path)!;
    const localDecls = declModule.get(module.id)!;
    /** The symbol an import binds: the named export, or the default export of a default or whole-module binding. */
    const importedSymbol = (imp: ImportTarget): string | null => resolveExport(imp.module, imp.imported ?? "default");
    /** A class by the name this file uses for it: a local declaration or an import. */
    const classNamed = (name: string): string | null => {
      const ids = new Set<string>();
      const local = localDecls.get(name);
      if (local) ids.add(local);
      for (const imp of locals.get(name) ?? []) {
        const id = importedSymbol(imp);
        if (id) ids.add(id);
      }
      // Only a class has members of its own; a fn or a type does not.
      const classes = [...ids].filter((id) => decls.classes.has(id));
      return classes.length === 1 ? classes[0]! : null;
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
        const member = rest[0];
        if (!cls || !member || rest.length !== 1) return [];
        const id = declModule.get(cls.id)?.get(memberKey(member, isStatic));
        return id ? [id] : [];
      }
      if (rest.length === 0) {
        const local = localDecls.get(head);
        if (local) found.add(local);
        for (const imp of locals.get(head) ?? []) {
          const id = importedSymbol(imp);
          if (id && callable(id)) found.add(id);
        }
        return [...found];
      }
      if (rest.length === 1) {
        const member = rest[0]!;
        // `X.m()` on a class names its static member.
        const staticOf = (clsId: string | null): string | undefined => (clsId && decls.classes.has(clsId) ? declModule.get(clsId)?.get(memberKey(member, true)) : undefined);
        for (const imp of locals.get(head) ?? []) {
          if (imp.kind === "module") {
            // `import * as ns`, `require()`: a named export; for `require`, also a static member of `module.exports`.
            const id = resolveExport(imp.module, member) ?? staticOf(resolveExport(imp.module, "default"));
            if (id) found.add(id);
            continue;
          }
          const name = imp.imported ?? "default";
          const symbol = resolveExport(imp.module, name);
          const id = staticOf(symbol);
          if (id) found.add(id);
          // `import { ns } from "./barrel"` with `export * as ns from "./x"`.
          const ns = namespaceModule(symbol);
          const nsId = ns ? resolveExport(ns, member) : null;
          if (nsId) found.add(nsId);
          // A default import of a module without `export default` (CommonJS) is its `module.exports`.
          if (imp.kind === "default" && symbol === null && exportTables.lookup(imp.module.id, "default") === null) {
            const cjs = resolveExport(imp.module, member);
            if (cjs) found.add(cjs);
          }
        }
        const id = staticOf(localDecls.get(head) ?? null);
        if (id) found.add(id);
        return [...found];
      }
      return [];
    };
    /** `this.decoder.feed` with `decoder: InputDecoder` → `InputDecoder.feed`, when that class has the member. */
    const receiverTarget = (callee: string, receiver: string | undefined): string | null => {
      if (!receiver) return null;
      const cls = classNamed(receiver);
      const member = callee.slice(callee.lastIndexOf(".") + 1);
      return cls ? (declModule.get(cls)?.get(memberKey(member, false)) ?? null) : null;
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
    return { locals, localDecls, importedSymbol, classNamed, resolveCallees, receiverTarget, single, external };
  };
  const scopes = new Map<string, ReturnType<typeof scopeOf>>();
  for (const { facts, module } of byFile.values()) scopes.set(facts.path, scopeOf(facts, module));
  // Every class's base first: `super()` in one file may run the constructor of a base in another.
  for (const { facts } of byFile.values()) {
    const { resolveCallees, classNamed } = scopes.get(facts.path)!;
    const visit = (factDecls: readonly DeclFact[]): void => {
      for (const d of factDecls) {
        const id = d.kind === "class" ? decls.ids.get(d) : undefined;
        if (!id || !d.base) continue;
        const internal = d.base.includes(".") ? resolveCallees(d.base, null, false).filter((t) => decls.classes.has(t)) : [classNamed(d.base)].filter((t): t is string => t !== null);
        classBase.set(id, { internal: internal.length === 1 ? internal[0]! : null, text: d.base });
      }
    };
    visit(facts.decls);
  }
  /**
   * `super()` / `super.m()` in a class: the base's member, looked up through
   * bases that do not declare it. `last`: the last base on that chain, null
   * when the class has none.
   */
  const superTarget = (cls: Module, member: string, isStatic: boolean): { target: string | null; last: { internal: string | null; text: string } | null } => {
    const seen = new Set<string>();
    let last: { internal: string | null; text: string } | null = null;
    for (let at = classBase.get(cls.id); at; at = at.internal ? classBase.get(at.internal) : undefined) {
      last = at;
      if (!at.internal || seen.has(at.internal)) break;
      seen.add(at.internal);
      const id = declModule.get(at.internal)?.get(member === "constructor" ? "constructor" : memberKey(member, isStatic));
      if (id) return { target: id, last };
    }
    return { target: null, last };
  };
  for (const { facts, module } of byFile.values()) {
    const { locals, localDecls, importedSymbol, resolveCallees, receiverTarget, single, external } = scopes.get(facts.path)!;
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
        const push = (target: string, c: CallFact, extra: Partial<Call> = {}): void => {
          // A self-call stays an edge: recursion is a static path from a function to itself.
          const added = addCall(fn, { target, line: c.line, col: c.col, endLine: c.endLine, endCol: c.endCol, text: c.callee, ...(c.closure ? { closure: true as const } : {}), ...extra });
          if (added && !extra.via) stats.callsResolved++;
        };
        const dynamic = (c: CallFact, reason: string): void => {
          stats.callsDynamic++;
          gaps.push({ kind: "dynamic-call", file: facts.path, line: c.line, col: c.col, endLine: c.endLine, endCol: c.endCol, text: c.callee, reason, source: fn.id });
        };
        for (const c of d.calls) {
          // An expression keylang does not name is a hole, never an edge.
          if (c.opaque) {
            dynamic(c, `call through an expression \`${c.callee}\``);
            continue;
          }
          const head = c.callee.split(".")[0]!;
          if (head === "super" && cls && c.callee.split(".").length <= 2) {
            // `super()` runs the base constructor; `super.m()` the base's `m`.
            const member = c.callee === "super" ? "constructor" : c.callee.slice("super.".length);
            const { target, last } = superTarget(cls, member, isStatic);
            if (target) push(target, c);
            // Bases of this repository without a constructor of their own: the implicit ones run nothing keylang indexes.
            else if (last?.internal && member === "constructor") continue;
            else if (last && !last.internal && external(last.text.split(".")[0]!)) stats.callsExternal++;
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
          const typed = receiverTarget(c.callee, c.receiver);
          if (typed) {
            push(typed, c);
            continue;
          }
          // `this.waiting.get()` with `waiting = new Map()`: a method of a global or package class.
          if (c.receiver && external(c.receiver)) {
            stats.callsExternal++;
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
          if (!target) {
            const imported = (locals.get(head) ?? [])[0];
            if (imported?.module.layer === EXTERNAL || globalsOf(facts.path).values.has(head)) stats.callsExternal++;
            else if (head !== "this" && !locals.has(head) && !localDecls.has(head)) {
              stats.callsDynamic++;
              gaps.push({ kind: "dynamic-call", file: facts.path, line: c.line, col: c.col, endLine: c.endLine, endCol: c.endCol, text: c.callee, reason: holeReason(c), source: fn.id });
            } else {
              stats.callsUnresolved++;
              gaps.push({ kind: "unresolved-call", file: facts.path, line: c.line, col: c.col, endLine: c.endLine, endCol: c.endCol, text: c.callee, reason: c.hook ? holeReason(c) : `unresolved call \`${c.callee}\``, source: fn.id });
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
      if (IDENTIFIER.test(member) && !calledNames.has(member)) calledNames.set(member, escape);
    }
    for (const ref of facts.valueRefs ?? []) {
      const escape = { file: facts.path, line: ref.line, col: ref.col, reason: `\`${ref.name}\` is read as a value` };
      if (ref.member) {
        if (!readMembers.has(ref.name)) readMembers.set(ref.name, escape);
        continue;
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
          const id = resolveExport(imp.module, member);
          if (id) narrowed.add(id);
          continue;
        }
        const id = importedSymbol(imp);
        if (id) found.add(id);
      }
      // A namespace (`export * as T`) is not a type.
      if (!member) return [...found].filter((id) => namespaceModule(id) === null);
      for (const id of found) {
        const ns = namespaceModule(id);
        // `T.Id` with `import { T }` of `export * as T from "./t"`.
        const child = ns ? (segments.length === 2 ? resolveExport(ns, member) : null) : declModule.get(id)?.get(layerName(member));
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
  const unknownBase = (id: string, seen: Set<string>): string | null => {
    const base = classBase.get(id);
    if (!base || seen.has(id)) return null;
    seen.add(id);
    return base.internal === null ? base.text : unknownBase(base.internal, seen);
  };
  for (const id of classBase.keys()) {
    const base = unknownBase(id, new Set());
    const cls = decls.classes.get(id);
    if (!base || !cls) continue;
    for (const fn of cls.fns) if (fn.name !== constructorName(fn.file ?? cls.path)) fn.escapes ??= { file: fn.file ?? cls.path ?? "", line: fn.line, col: fn.col, reason: `\`${fn.name}\` may be called by the base class \`${base}\`` };
  }
  markEscapes(modules, readIds, readMembers, calledNames, decls.members);

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
    openEdges,
    // Manifests are inputs too: the snapshot id (and the MCP cache keyed on it) covers them.
    resolverInputs: new Map([...manifests.inputs, ...resolverInputs()]),
    exports: exportTables.entries(),
    packages,
  };
}

const IDENTIFIER = /^[\p{L}\p{Nl}_$][\p{L}\p{Nl}\p{Mn}\p{Mc}\p{Nd}\p{Pc}_$]*$/u;

/** What one import binding names in the file: a declaration of the module (`named`, `default`) or the module itself. */
interface ImportTarget {
  module: Module;
  kind: ImportBinding["kind"];
  /** The export the binding names: its name, `default`, or null for the whole module. */
  imported: string | null;
}

/** A specifier that names the module itself (Rust `use crate::a`, Python `from pkg import mod`) binds the module. */
function importTarget(module: Module, binding: ImportBinding, whole: boolean): ImportTarget {
  if (whole || binding.kind === "module") return { module, kind: "module", imported: null };
  return binding.kind === "default" ? { module, kind: "default", imported: "default" } : { module, kind: "named", imported: binding.imported };
}

/**
 * One export row of a file, with what it stands for: a declaration of the
 * module, a name or the namespace of the module an import binds, or nothing
 * keylang indexes. A re-export (`export { a } from`, Rust `pub use`) goes
 * through its own import; any other name through a declaration of the module
 * or an import of the file.
 */
function exportInput(row: ExportRow, facts: FileFacts, module: Module, imported: ReadonlyMap<string, ImportTarget[]>, declModule: ReadonlyMap<string, ReadonlyMap<string, string>>): ExportRowInput {
  const name = row.name;
  // Rows of frontends that say how a name is exported in `kind`.
  const legacy: ExportForm | undefined = row.kind === "default" || (row.kind === "alias" && name === "default") ? "default" : row.kind === "alias" && row.local !== null && row.local !== name ? "alias" : row.kind === "reexport" ? "reexport" : undefined;
  let form = row.form ?? legacy;
  const kind: ExportKind = row.kind === "fn" || row.kind === "class" || row.kind === "type" ? row.kind : "value";
  const reexported = facts.imports.some((imp) => imp.reexport && imp.bindings.some((b) => b.local === name));
  const local = row.local ?? name;
  const declared = reexported ? undefined : declModule.get(module.id)?.get(layerName(local));
  const found = declared === undefined ? imported.get(reexported ? name : local)?.[0] : undefined;
  const from = found?.module.id;
  let target: ExportTarget = { kind: "none" };
  if (declared !== undefined) target = { kind: "symbol", id: declared };
  else if (found && found.module.layer !== EXTERNAL) target = found.kind === "module" ? { kind: "namespace", module: found.module.id } : { kind: "name", module: found.module.id, name: found.imported ?? "default" };
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
  if (language === undefined || isExcluded(file, config.exclude)) return null;
  if (config.guessed && placeFile(config, file) === null) return null;
  return config.languages.includes(language) ? `\`${file}\` is not indexed` : `\`${file}\` is ${language}, which \`languages\` does not list`;
}

function isIndexFile(file: string): boolean {
  const language = languageOf(file);
  const base = posix.basename(file).replace(/\.[^.]+$/, "");
  return language !== undefined && LANGUAGES[language].index.includes(base);
}

/**
 * Add a call unless an edge to the same target already says as much: a
 * direct call proves what a hook edge does, a call outside a closure what one
 * inside does. A stronger edge replaces the weaker ones. True when added.
 */
function addCall(fn: Fn, call: Call): boolean {
  const covers = (a: Call, b: Call): boolean => a.target === b.target && (a.via === undefined || a.via === b.via) && (a.closure !== true || b.closure === true);
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
 * value (`extends A` runs `A`'s constructor).
 */
function markEscapes(modules: Map<string, Module>, readIds: ReadonlyMap<string, Escape>, readMembers: ReadonlyMap<string, Escape>, calledNames: ReadonlyMap<string, Escape>, members: Decls["members"]): void {
  const visit = (m: Module, isClass: boolean): void => {
    for (const fn of m.fns) {
      if (fn.escapes) continue;
      // A member is named in code as written (`go`), whatever suffix its ID has (`go-private`).
      const name = members.get(fn.id)?.name ?? fn.name;
      const ref = readIds.get(fn.id) ?? (isClass && fn.name !== constructorName(fn.file ?? m.path) ? readMembers.get(name) : undefined) ?? calledNames.get(name);
      if (ref) fn.escapes = ref;
      else if (isClass && !members.get(fn.id)?.hash && implicitMember(fn.file ?? m.path, name)) fn.escapes = { file: fn.file ?? m.path ?? "", line: fn.line, col: fn.col, reason: `\`${name}\` is called implicitly` };
    }
    for (const child of m.children) if (child.class) visit(child, true);
  };
  for (const m of modules.values()) visit(m, false);
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

/** Lookup key of a class member: `this.#m` in a static method is `static #m`. */
export function memberKey(member: string, isStatic: boolean): string {
  const hash = member.startsWith("#");
  return `${isStatic ? "static " : ""}${hash ? "#" : ""}${layerName(hash ? member.slice(1) : member)}`;
}

/** Suffixes of a member whose name another member of the class already has. */
const MEMBER_SUFFIX = ["", "-static", "-private", "-static-private"];

/**
 * ID segments of class members. An instance member keeps its name; a static
 * or `#private` member of the same name as another gets a suffix (`m-static`,
 * `go-private`, `go-static-private`), which no JS name can collide with.
 * Priority: instance, static, `#private`, static `#private`.
 */
function memberSegments(members: readonly DeclFact[]): Map<DeclFact, { key: string; segment: string }> {
  const rank = (m: DeclFact): number => (m.static ? 1 : 0) + (m.hash ? 2 : 0);
  const out = new Map<DeclFact, { key: string; segment: string }>();
  const byKey = new Map<string, string>();
  const used = new Set<string>();
  for (const m of [...members].sort((a, b) => rank(a) - rank(b))) {
    const key = memberKey(`${m.hash ? "#" : ""}${m.name}`, m.static === true);
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

function addDecl(module: Module, d: DeclFact, names: Map<string, string>, declModule: Map<string, Map<string, string>>, decls: Decls, stats: Stats, file: string, member?: { key: string; segment: string }): void {
  const name = member?.segment ?? layerName(d.name);
  const key = member?.key ?? name;
  const existing = names.get(key);
  if (existing !== undefined) {
    // Overloads and duplicate declarations: the implementation's calls join the first node.
    if (d.kind === "fn" && decls.fns.has(existing)) {
      decls.ids.set(d, existing);
      const fn = decls.fns.get(existing)!;
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
    const cls: Module = { id, layer: module.layer, name, path: file, line: d.line, col: d.col, endLine: d.endLine, endCol: d.endCol, synthetic: false, class: true, comment: d.exported ? null : "internal", doc: d.doc ?? null, deps: [], fns: [], types: [], children: [], members: "complete", starSources: [] };
    module.children.push(cls);
    names.set(key, id);
    decls.ids.set(d, id);
    decls.classes.set(id, cls);
    const members = new Map<string, string>();
    declModule.set(id, members);
    const segments = memberSegments(d.members);
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
export function placeFile(config: Config, file: string): { layer: string; segments: string[]; stem: string } | null {
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
      return { layer, segments: segments.map(layerName), stem: [...(under ? [prefix] : []), ...segments].join("/") };
    }
  }
  return null;
}
