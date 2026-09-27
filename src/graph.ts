// Facts → graph: files become modules in layers, declarations become fn/type
// nodes, imports become dependencies and calls are resolved to IDs where the
// syntax makes the target unambiguous (`precision: syntactic`).

import { posix } from "node:path";
import { layerName, type Config } from "./config.ts";
import type { DeclFact, FileFacts } from "./extract/facts.ts";
import { globPrefix, matchesGlob } from "./glob.ts";
import { ImportResolver } from "./imports.ts";

export interface Graph {
  layers: Layer[];
  modules: Map<string, Module>;
  stats: Stats;
  warnings: string[];
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
  /** True for a directory node created only to nest file modules. */
  synthetic: boolean;
  /** Original package name for external modules. */
  comment: string | null;
  deps: Dep[];
  fns: Fn[];
  types: TypeNode[];
  children: Module[];
}

export interface Dep {
  alias: string;
  target: string;
  line: number;
  reexport: boolean;
}

export interface Fn {
  id: string;
  name: string;
  line: number;
  endLine: number;
  signature: string | null;
  exported: boolean;
  calls: Call[];
}

export interface Call {
  target: string;
  line: number;
}

export interface TypeNode {
  id: string;
  name: string;
  line: number;
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
    m = { id, layer, name, path, line, synthetic, comment: null, deps: [], fns: [], types: [], children: [] };
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
    if (m.path !== f.path) {
      // Two files map to one module (e.g. `x.ts` and `x/index.ts`).
      warnings.push(`${f.path}: same module ID as ${m.path} (${id}); merged`);
    }
    byFile.set(f.path, { facts: f, module: m });
  }

  // 2. Declarations.
  const declModule = new Map<string, Map<string, string>>(); // module id → name → node id
  for (const { facts, module } of byFile.values()) {
    const names = declModule.get(module.id) ?? new Map<string, string>();
    declModule.set(module.id, names);
    for (const d of facts.decls) addDecl(module, d, names, declModule, stats);
  }

  // 3. Imports → dependencies.
  const externalLayer = getLayer(EXTERNAL);
  const importTargets = new Map<string, Map<string, { module: Module | null; imported: string | null }>>(); // file → local → target
  for (const { facts, module } of byFile.values()) {
    const locals = new Map<string, { module: Module | null; imported: string | null }>();
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
        warnings.push(`${facts.path}:${imp.line}: unresolved import \`${imp.source}\``);
        continue;
      }
      for (const b of imp.bindings) {
        locals.set(b.local, { module: target, imported: b.kind === "named" ? b.imported : null });
      }
      const wanted = imp.bindings.find((b) => b.kind === "module")?.local ?? target.name;
      let alias = layerName(wanted);
      const existing = aliases.get(alias);
      if (existing === target.id) continue;
      // A dep's ID is `<module>.<alias>`: it must not collide with another
      // dep, a submodule, a class, a fn or a type of the same module.
      const taken = (a: string): boolean =>
        aliases.has(a) || module.deps.some((d) => d.alias === a) || module.children.some((c) => c.name === a) || module.fns.some((f) => f.name === a) || module.types.some((t) => t.name === a);
      if (existing !== undefined || taken(alias)) {
        let n = 2;
        while (taken(`${alias}${n}`)) n++;
        alias = `${alias}${n}`;
      }
      if (module.deps.some((d) => d.target === target.id)) continue;
      aliases.set(alias, target.id);
      module.deps.push({ alias, target: target.id, line: imp.line, reexport: imp.reexport });
      stats.deps++;
    }
  }

  // 4. Calls.
  for (const { facts, module } of byFile.values()) {
    const locals = importTargets.get(facts.path)!;
    const localDecls = declModule.get(module.id)!;
    const resolveCallee = (callee: string, cls: Module | null): string | null => {
      const [head, ...rest] = callee.split(".");
      if (!head) return null;
      if (head === "this") {
        const m = rest[0];
        if (!cls || !m || rest.length !== 1) return null;
        return declModule.get(cls.id)?.get(m) ?? null;
      }
      if (rest.length === 0) {
        const local = localDecls.get(head);
        if (local) return local;
        const imp = locals.get(head);
        if (imp?.module) {
          const names = declModule.get(imp.module.id);
          if (imp.imported) return names?.get(imp.imported) ?? null;
          return names?.get("default") ?? null;
        }
        return null;
      }
      if (rest.length === 1) {
        const member = rest[0]!;
        const imp = locals.get(head);
        if (imp?.module) {
          const names = declModule.get(imp.module.id);
          if (imp.imported) {
            // `Cls.method` where `Cls` is an imported class.
            const clsId = names?.get(imp.imported);
            return clsId ? (declModule.get(clsId)?.get(member) ?? null) : null;
          }
          return names?.get(member) ?? null;
        }
        const localCls = localDecls.get(head);
        if (localCls) return declModule.get(localCls)?.get(member) ?? null;
      }
      return null;
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
          const target = resolveCallee(c.callee, cls);
          if (!target) {
            const head = c.callee.split(".")[0]!;
            if (locals.get(head)?.module?.layer === EXTERNAL || JS_GLOBALS.has(head)) stats.callsExternal++;
            else if (head !== "this" && !locals.has(head) && !localDecls.has(head)) stats.callsDynamic++;
            else stats.callsUnresolved++;
            continue;
          }
          if (target === fn.id || seen.has(target)) continue;
          seen.add(target);
          fn.calls.push({ target, line: c.line });
          stats.callsResolved++;
        }
      }
    };
    attach(module.fns, facts.decls, null);
  }

  stats.modules = [...modules.values()].filter((m) => m.layer !== EXTERNAL).length;
  const orderedLayers = [...layers.values()].filter((l) => l.modules.length > 0);
  return { layers: orderedLayers, modules, stats, warnings };
}

function addDecl(module: Module, d: DeclFact, names: Map<string, string>, declModule: Map<string, Map<string, string>>, stats: Stats): void {
  const name = layerName(d.name);
  if (names.has(name)) return; // overloads / duplicate declarations
  if (d.kind === "class") {
    const id = `${module.id}.${name}`;
    const cls: Module = { id, layer: module.layer, name, path: module.path, line: d.line, synthetic: false, comment: d.exported ? null : "internal", deps: [], fns: [], types: [], children: [] };
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
    module.fns.push({ id, name, line: d.line, endLine: d.endLine, signature: d.signature, exported: d.exported, calls: [] });
    stats.fns++;
  } else {
    module.types.push({ id, name, line: d.line, signature: d.signature, exported: d.exported });
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
