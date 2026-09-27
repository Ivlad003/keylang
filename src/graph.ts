// Facts → graph: files become modules in layers, declarations become fn/type
// nodes, imports become dependencies. A resolved call is a syntactic edge;
// a local or missing callee stays a gap instead of a confirmed edge.

import { posix } from "node:path";
import { layerName, type Config } from "./config.ts";
import type { DeclFact, FileFacts, TypeRefFact } from "./extract/facts.ts";
import { globPrefix, matchesGlob } from "./glob.ts";
import { ImportResolver } from "./imports.ts";

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
  /** Original package name for external modules. */
  comment: string | null;
  deps: Dep[];
  fns: Fn[];
  types: TypeNode[];
  children: Module[];
  /** `complete` may list no members. `opaque` does not confirm that an arbitrary name exists. */
  members: "complete" | "opaque";
}

export interface Dep {
  alias: string;
  target: string;
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
  line: number;
  col: number;
  endLine: number;
  endCol: number;
  signature: string | null;
  exported: boolean;
  calls: Call[];
}

export interface Call {
  target: string;
  line: number;
  col: number;
  endLine: number;
  endCol: number;
  text: string;
}

export interface TypeNode {
  id: string;
  name: string;
  line: number;
  col: number;
  endLine: number;
  endCol: number;
  signature: string | null;
  exported: boolean;
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

export const EXTERNAL = "external";

/** Words that, under a module, start a declaration rather than a dependency alias. */
const CONTEXT_ALIAS = new Set(["module", "fn", "type", "event", "calls"]);

/** Language and platform globals: calls to them are external, not unresolved. */
const JS_GLOBALS = new Set(
  "Array ArrayBuffer BigInt Boolean Buffer DataView Date Error EvalError Float32Array Float64Array Function Int8Array Int16Array Int32Array Intl JSON Map Math Number Object Promise Proxy RangeError Reflect RegExp Set String Symbol SyntaxError TypeError URIError URL URLSearchParams Uint8Array Uint16Array Uint32Array Uint8ClampedArray WeakMap WeakRef WeakSet AbortController TextDecoder TextEncoder Response Request Headers FormData Blob Event EventTarget WebSocket Worker console process globalThis window document navigator crypto performance fetch structuredClone queueMicrotask setTimeout clearTimeout setInterval clearInterval setImmediate clearImmediate requestAnimationFrame cancelAnimationFrame parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent encodeURI decodeURI atob btoa alert require".split(" "),
);
export const UNASSIGNED = "unassigned";

interface FileEntry {
  facts: FileFacts;
  module: Module;
}

export function buildGraph(config: Config, files: FileFacts[]): Graph {
  const resolver = new ImportResolver(config.root);
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

  const ensureModule = (id: string, layer: string, path: string | null, line: number | null, synthetic: boolean): Module => {
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
    m = { id, layer, name, path, line, col: line === null ? null : 1, endLine: null, endCol: null, synthetic, comment: null, deps: [], fns: [], types: [], children: [], members: layer === EXTERNAL ? "opaque" : "complete" };
    modules.set(id, m);
    const parentId = id.slice(0, dot);
    if (parentId === layer) getLayer(layer).modules.push(m);
    else ensureModule(parentId, layer, path === null ? null : posix.dirname(path), null, true).children.push(m);
    return m;
  };

  // 1. Files → modules.
  const byFile = new Map<string, FileEntry>();
  for (const f of files) {
    const placed = placeFile(config, f.path);
    if (!placed) stats.unassignedFiles++;
    const layer = placed?.layer ?? UNASSIGNED;
    const segments = placed?.segments ?? f.path.replace(/\.[^.]+$/, "").split("/").map(layerName);
    const id = [layer, ...segments].join(".");
    const m = ensureModule(id, layer, f.path, 1, false);
    m.line = 1;
    m.col = 1;
    m.endLine = f.endLine;
    m.endCol = f.endCol;
    if (m.path !== f.path) {
      // Two files map to one module (e.g. `x.ts` and `x/index.ts`).
      warnings.push(`${f.path}: same module ID as ${m.path} (${id}); merged`);
    }
    byFile.set(f.path, { facts: f, module: m });
    if (!placed) gaps.push({ kind: "unassigned-file", file: f.path, line: 1, col: 1, endLine: f.endLine, endCol: f.endCol, text: "", reason: "outside any layer", source: m.id });
    for (const hole of f.unsupported) {
      gaps.push({ kind: "unsupported", file: f.path, line: hole.line, col: hole.col, endLine: hole.endLine, endCol: hole.endCol, text: hole.text, reason: hole.reason, source: m.id });
    }
  }

  // 2. Declarations.
  const declModule = new Map<string, Map<string, string>>(); // module id → name → node id
  for (const { facts, module } of byFile.values()) {
    const names = declModule.get(module.id) ?? new Map<string, string>();
    declModule.set(module.id, names);
    for (const d of facts.decls) addDecl(module, d, names, declModule, stats);
    if (facts.completeness === "opaque") {
      markOpaque(module);
      if (facts.parseError) {
        gaps.push({ kind: "parse-error", file: facts.path, line: facts.parseError.line, col: 1, endLine: facts.parseError.line, endCol: 2, text: "", reason: facts.parseError.reason, source: module.id });
      }
    }
  }

  // 3. Imports → dependencies.
  const externalLayer = getLayer(EXTERNAL);
  const importTargets = new Map<string, Map<string, { module: Module | null; imported: string | null }[]>>(); // file → local → targets
  for (const { facts, module } of byFile.values()) {
    const locals = new Map<string, { module: Module | null; imported: string | null }[]>();
    importTargets.set(facts.path, locals);
    const aliases = new Map<string, string>();
    for (const imp of facts.imports) {
      const r = resolver.resolve(facts.path, imp.source);
      let target: Module | null = null;
      if (r.kind === "internal") {
        target = byFile.get(r.file)?.module ?? null;
        if (!target) continue; // excluded file (tests, d.ts)
        if (target === module) continue;
      } else if (r.kind === "generated") {
        continue;
      } else if (r.kind === "external" || r.kind === "builtin") {
        const pkg = r.kind === "builtin" ? "node" : r.pkg;
        const id = `${EXTERNAL}.${layerName(pkg.replace(/^@/, "").replace("/", "-"))}`;
        target = ensureModule(id, EXTERNAL, null, null, false);
        if (pkg !== target.name) target.comment = pkg;
        if (externalLayer.modules.length === 0) layers.set(EXTERNAL, externalLayer);
      } else {
        stats.importsUnresolved++;
        const reason = `unresolved import \`${imp.source}\``;
        warnings.push(`${facts.path}:${imp.line}: ${reason}`);
        gaps.push({ kind: "unresolved-import", file: facts.path, line: imp.line, col: imp.col, endLine: imp.endLine, endCol: imp.endCol, text: imp.text, reason, source: module.id });
        continue;
      }
      for (const b of imp.bindings) {
        const list = locals.get(b.local) ?? [];
        list.push({ module: target, imported: b.kind === "named" ? b.imported : null });
        locals.set(b.local, list);
      }
      const wanted = imp.bindings.find((b) => b.kind === "module")?.local ?? target.name;
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
      if (module.deps.some((d) => d.target === target.id)) continue;
      aliases.set(alias, target.id);
      module.deps.push({ alias, target: target.id, line: imp.line, col: imp.col, endLine: imp.endLine, endCol: imp.endCol, text: imp.text, reexport: imp.reexport });
      stats.deps++;
    }
  }

  // 4. Calls.
  for (const { facts, module } of byFile.values()) {
    const locals = importTargets.get(facts.path)!;
    const localDecls = declModule.get(module.id)!;
    const resolveCallees = (callee: string, cls: Module | null): string[] => {
      const [head, ...rest] = callee.split(".");
      if (!head) return [];
      const found = new Set<string>();
      if (head === "this") {
        const member = rest[0];
        if (!cls || !member || rest.length !== 1) return [];
        const id = declModule.get(cls.id)?.get(member);
        return id ? [id] : [];
      }
      if (rest.length === 0) {
        const local = localDecls.get(head);
        if (local) found.add(local);
        for (const imp of locals.get(head) ?? []) {
          if (!imp.module) continue;
          const names = declModule.get(imp.module.id);
          const id = imp.imported ? names?.get(imp.imported) : names?.get("default");
          if (id) found.add(id);
        }
        return [...found];
      }
      if (rest.length === 1) {
        const member = rest[0]!;
        for (const imp of locals.get(head) ?? []) {
          if (!imp.module) continue;
          const names = declModule.get(imp.module.id);
          if (imp.imported) {
            const clsId = names?.get(imp.imported);
            const id = clsId ? declModule.get(clsId)?.get(member) : undefined;
            if (id) found.add(id);
          } else {
            const id = names?.get(member);
            if (id) found.add(id);
          }
        }
        const localCls = localDecls.get(head);
        if (localCls) {
          const id = declModule.get(localCls)?.get(member);
          if (id) found.add(id);
        }
        return [...found];
      }
      return [];
    };
    const attach = (fns: Fn[], factDecls: DeclFact[], cls: Module | null): void => {
      for (const d of factDecls) {
        if (d.kind === "class") {
          const parent = cls ?? module;
          const clsModule = parent.children.find((c) => c.id === `${parent.id}.${layerName(d.name)}`) ?? null;
          if (clsModule) attach(clsModule.fns, d.members, clsModule);
          continue;
        }
        if (d.kind !== "fn") continue;
        const fn = fns.find((f) => f.name === layerName(d.name));
        if (!fn) continue;
        const seen = new Set<string>();
        for (const c of d.calls) {
          const head = c.callee.split(".")[0]!;
          const shadow = d.shadows.find((s) => s.name === head);
          if (shadow && head !== "this") {
            stats.callsUnresolved++;
            const why = shadow.kind === "parameter" ? "shadowed by parameter" : "shadowed by local";
            gaps.push({ kind: "unresolved-call", file: facts.path, line: c.line, col: c.col, endLine: c.endLine, endCol: c.endCol, text: c.callee, reason: `${why} \`${c.callee}\``, source: fn.id });
            continue;
          }
          if (head === "eval") continue;
          const targets = resolveCallees(c.callee, cls);
          if (targets.length > 1) {
            openEdges.push({ kind: "call", source: fn.id, target: null, candidates: targets.sort(), file: facts.path, line: c.line, col: c.col, endLine: c.endLine, endCol: c.endCol, text: c.callee, resolution: "ambiguous" });
            continue;
          }
          const target = targets[0] ?? null;
          if (!target) {
            const imported = (locals.get(head) ?? []).find((imp) => imp.module);
            if (imported?.module?.layer === EXTERNAL || JS_GLOBALS.has(head)) stats.callsExternal++;
            else if (head !== "this" && !locals.has(head) && !localDecls.has(head)) {
              stats.callsDynamic++;
              gaps.push({ kind: "dynamic-call", file: facts.path, line: c.line, col: c.col, endLine: c.endLine, endCol: c.endCol, text: c.callee, reason: `call through a local value \`${c.callee}\``, source: fn.id });
            } else {
              stats.callsUnresolved++;
              gaps.push({ kind: "unresolved-call", file: facts.path, line: c.line, col: c.col, endLine: c.endLine, endCol: c.endCol, text: c.callee, reason: `unresolved call \`${c.callee}\``, source: fn.id });
            }
            continue;
          }
          if (target === fn.id || seen.has(target)) continue;
          seen.add(target);
          fn.calls.push({ target, line: c.line, col: c.col, endLine: c.endLine, endCol: c.endCol, text: c.callee });
          stats.callsResolved++;
        }
      }
    };
    attach(module.fns, facts.decls, null);
    const resolveType = (ref: TypeRefFact): string[] => {
      const head = ref.name.split(".")[0] ?? "";
      if (!head) return [];
      const found = new Set<string>();
      const local = localDecls.get(layerName(head));
      if (local) found.add(local);
      for (const imp of locals.get(head) ?? []) {
        if (!imp.module) continue;
        const names = declModule.get(imp.module.id);
        const id = imp.imported ? names?.get(layerName(imp.imported)) : names?.get("default");
        if (id) found.add(id);
      }
      const member = ref.name.includes(".") ? ref.name.slice(ref.name.lastIndexOf(".") + 1) : "";
      if (!member) return [...found];
      const narrowed = new Set<string>();
      for (const id of found) {
        const child = declModule.get(id)?.get(layerName(member));
        if (child) narrowed.add(child);
      }
      return [...narrowed];
    };
    const noteTypes = (decls: DeclFact[], owner: Module): void => {
      for (const d of decls) {
        const source = owner.id === module.id ? (declModule.get(module.id)?.get(layerName(d.name)) ?? module.id) : (declModule.get(owner.id)?.get(layerName(d.name)) ?? owner.id);
        for (const ref of d.types) {
          const targets = resolveType(ref).filter((id) => id !== source);
          if (targets.length === 0) {
            if (TYPE_GLOBALS.has(ref.name.split(".")[0] ?? ref.name)) continue;
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
          const cls = owner.children.find((child) => child.name === layerName(d.name));
          if (cls) noteTypes(d.members, cls);
        }
      }
    };
    noteTypes(facts.decls, module);
  }

  stats.modules = [...modules.values()].filter((m) => m.layer !== EXTERNAL).length;
  const orderedLayers = [...layers.values()].filter((l) => l.modules.length > 0);
  const byPath = new Map<string, Module>();
  for (const [path, entry] of byFile) byPath.set(path, entry.module);
  return { layers: orderedLayers, modules, byPath, stats, warnings, gaps, openEdges };
}

const TYPE_GLOBALS = new Set(
  "Promise Array ReadonlyArray Record Partial Required Readonly Pick Omit Exclude Extract NonNullable ReturnType Parameters ConstructorParameters InstanceType Map Set WeakMap WeakSet Date RegExp Error Iterable Iterator AsyncIterable AsyncIterator Generator IterableIterator Buffer Function Object Boolean Number String".split(" "),
);

function markOpaque(m: Module): void {
  m.members = "opaque";
  for (const c of m.children) markOpaque(c);
}

function addDecl(module: Module, d: DeclFact, names: Map<string, string>, declModule: Map<string, Map<string, string>>, stats: Stats): void {
  const name = layerName(d.name);
  if (names.has(name)) return; // overloads / duplicate declarations
  if (d.kind === "class") {
    const id = `${module.id}.${name}`;
    const cls: Module = { id, layer: module.layer, name, path: module.path, line: d.line, col: d.col, endLine: d.endLine, endCol: d.endCol, synthetic: false, comment: d.exported ? null : "internal", deps: [], fns: [], types: [], children: [], members: "complete" };
    module.children.push(cls);
    names.set(name, id);
    const members = new Map<string, string>();
    declModule.set(id, members);
    for (const m of d.members) addDecl(cls, m, members, declModule, stats);
    return;
  }
  const id = `${module.id}.${name}`;
  names.set(name, id);
  if (d.kind === "fn") {
    module.fns.push({ id, name, line: d.line, col: d.col, endLine: d.endLine, endCol: d.endCol, signature: d.signature, exported: d.exported, calls: [] });
    stats.fns++;
  } else {
    module.types.push({ id, name, line: d.line, col: d.col, endLine: d.endLine, endCol: d.endCol, signature: d.signature, exported: d.exported });
    stats.types++;
  }
}

/** Layer and module path segments for a file, from the first matching layer glob. */
export function placeFile(config: Config, file: string): { layer: string; segments: string[] } | null {
  for (const [layer, globs] of config.layers) {
    for (const g of globs) {
      if (!matchesGlob(file, g)) continue;
      const prefix = globPrefix(g);
      let rel = prefix && file.startsWith(`${prefix}/`) ? file.slice(prefix.length + 1) : file;
      rel = rel.replace(/\.[^./]+$/, "");
      let segments = rel.split("/");
      if (config.module === "dir" && segments.length > 1) segments = segments.slice(0, -1);
      if (segments.length > 1 && segments.at(-1) === "index") segments = segments.slice(0, -1);
      return { layer, segments: segments.map(layerName) };
    }
  }
  return null;
}
