// Facts → graph: files become modules in layers, declarations become fn/type
// nodes, imports become dependencies. A resolved call is a syntactic edge;
// a local or missing callee stays a gap instead of a confirmed edge.

import { posix } from "node:path";
import { layerName, type Config } from "./config.ts";
import type { CallFact, DeclFact, FileFacts, HookFact, TypeRefFact } from "./extract/facts.ts";
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
  /** Config files import resolution read (`tsconfig.json`, `package.json`), with their text or null. */
  resolverInputs: Map<string, string | null>;
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
  calls: Call[];
  /** Code may call the function without naming it: it is read as a value, is an accessor, or is called implicitly. */
  escapes?: Escape;
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
    m = { id, layer, name, path, line, col: line === null ? null : 1, endLine: null, endCol: null, synthetic, comment: null, deps: [], fns: [], types: [], children: [], members: layer === EXTERNAL ? "opaque" : "complete", starSources: [] };
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
  // Module id → name → node id; class id → member key (`m`, `static m`, `#m`, `static #m`) → fn id.
  const declModule = new Map<string, Map<string, string>>();
  const decls: Decls = { ids: new Map(), fns: new Map(), classes: new Map(), members: new Map() };
  for (const { facts, module } of byFile.values()) {
    const names = declModule.get(module.id) ?? new Map<string, string>();
    declModule.set(module.id, names);
    for (const d of facts.decls) addDecl(module, d, names, declModule, decls, stats, facts.path);
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
      const star = imp.reexport && imp.bindings.length === 0;
      let target: Module | null = null;
      if (r.kind === "internal") {
        target = byFile.get(r.file)?.module ?? null;
        if (!target && r.workspace) {
          // A workspace package's entry (`dist/index.js`) keylang does not index: the dependency is there, its target unknown.
          stats.importsUnresolved++;
          const reason = `unresolved import \`${imp.source}\` (workspace package entry \`${r.file}\` is not indexed)`;
          warnings.push(`${facts.path}:${imp.line}: ${reason}`);
          gaps.push({ kind: "unresolved-import", file: facts.path, line: imp.line, col: imp.col, endLine: imp.endLine, endCol: imp.endCol, text: imp.text, reason, source: module.id });
          if (star) module.starSources.push({ target: null, reason: `re-export from unindexed \`${imp.source}\`` });
          continue;
        }
        if (!target) {
          if (star) module.starSources.push({ target: null, reason: `re-export from excluded \`${imp.source}\`` });
          continue; // excluded file (tests, d.ts)
        }
        // A file that imports itself is a self-loop; two files merged into one module are not.
        if (target === module && r.file !== facts.path) continue;
      } else if (r.kind === "generated") {
        if (star) module.starSources.push({ target: null, reason: `re-export from generated \`${imp.source}\`` });
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
        if (star) module.starSources.push({ target: null, reason: `re-export from unresolved \`${imp.source}\`` });
        continue;
      }
      if (star) module.starSources.push(target.layer === EXTERNAL ? { target: null, reason: `re-export from external \`${imp.source}\`` } : { target: target.id, reason: "" });
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
      module.deps.push({ alias, target: target.id, file: facts.path, line: imp.line, col: imp.col, endLine: imp.endLine, endCol: imp.endCol, text: imp.text, reexport: imp.reexport });
      stats.deps++;
    }
  }

  // 4. Calls. Hook calls and the values callers pass are collected for step 5.
  const hookCalls: { fn: Fn; hook: HookFact; owner: string; call: CallFact }[] = [];
  // Functions read as values: a plain read resolves like a callee in its file; a property read names any method.
  const readIds = new Map<string, Escape>();
  const readMembers = new Map<string, Escape>();
  // `x.run()` in module-level code with a receiver keylang does not know: any fn named `run`.
  const calledNames = new Map<string, Escape>();
  // Class → its internal base class, or the `extends` text when keylang has not read the base.
  const classBase = new Map<string, { internal: string | null; text: string }>();
  const injections = new Map<string, { arg: number; path: string; target: string; site: string }[]>();
  const moduleFiles = new Map<string, FileEntry[]>();
  for (const entry of byFile.values()) {
    const list = moduleFiles.get(entry.module.id) ?? [];
    list.push(entry);
    moduleFiles.set(entry.module.id, list);
  }
  const reexports = (facts: FileFacts, name: string, kind?: "module"): boolean => facts.imports.some((imp) => imp.reexport && imp.bindings.some((b) => b.local === name && (kind === undefined || b.kind === kind)));
  /**
   * The symbol a public name of a module stands for: `export { a as b }`,
   * `export default f`, `export { x } from`, `export { x as y } from`, an
   * imported name exported again, and `export * from`. A name without an
   * export row (CommonJS, an unexported helper) is the declaration of that name.
   */
  const resolveExport = (target: Module, name: string, seen: Set<string> = new Set()): string | null => {
    const key = `${target.id}\0${name}`;
    if (seen.has(key)) return null;
    seen.add(key);
    const names = declModule.get(target.id);
    for (const { facts } of moduleFiles.get(target.id) ?? []) {
      const imported = importTargets.get(facts.path);
      const follow = (local: string): string | null => {
        for (const imp of imported?.get(local) ?? []) {
          // A module binding exported again is its default export.
          const id = imp.module ? resolveExport(imp.module, imp.imported ?? "default", seen) : null;
          if (id) return id;
        }
        return null;
      };
      // `export * as name from`: a namespace, not a symbol.
      if (reexports(facts, name, "module")) return null;
      if (reexports(facts, name)) {
        const id = follow(name);
        if (id) return id;
        continue;
      }
      for (const row of facts.exportRows) {
        if (row.name !== name || row.kind === "reexport") continue;
        const local = row.local ?? name;
        const id = names?.get(layerName(local)) ?? follow(local);
        if (id) return id;
      }
    }
    if (name !== "default") {
      for (const star of target.starSources) {
        const from = star.target ? modules.get(star.target) : undefined;
        const id = from ? resolveExport(from, name, seen) : null;
        if (id) return id;
      }
    }
    return names?.get(layerName(name)) ?? null;
  };
  /** `export * as ns from "./x"`: the module a re-exported namespace names. */
  const namespaceOf = (target: Module, name: string): Module | null => {
    for (const { facts } of moduleFiles.get(target.id) ?? []) {
      if (!reexports(facts, name, "module")) continue;
      const from = importTargets.get(facts.path)?.get(name)?.find((imp) => imp.module && imp.imported === null)?.module;
      if (from) return from;
    }
    return null;
  };
  for (const { facts, module } of byFile.values()) {
    const locals = importTargets.get(facts.path)!;
    const localDecls = declModule.get(module.id)!;
    /** The symbol an import binds: the named export, or the default export of a module binding. */
    const importedSymbol = (imp: { module: Module | null; imported: string | null }): string | null => (imp.module ? resolveExport(imp.module, imp.imported ?? "default") : null);
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
      const [head, ...rest] = callee.split(".");
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
          if (id) found.add(id);
        }
        return [...found];
      }
      if (rest.length === 1) {
        const member = rest[0]!;
        // `X.m()` on a class names its static member.
        const staticOf = (clsId: string | null): string | undefined => (clsId && decls.classes.has(clsId) ? declModule.get(clsId)?.get(memberKey(member, true)) : undefined);
        for (const imp of locals.get(head) ?? []) {
          if (!imp.module) continue;
          if (imp.imported) {
            const symbol = resolveExport(imp.module, imp.imported);
            const id = staticOf(symbol);
            if (id) found.add(id);
            // `import { ns } from "./barrel"` with `export * as ns from "./x"`.
            const ns = symbol ? null : namespaceOf(imp.module, imp.imported);
            const nsId = ns ? resolveExport(ns, member) : null;
            if (nsId) found.add(nsId);
          } else {
            const id = resolveExport(imp.module, member) ?? staticOf(resolveExport(imp.module, "default"));
            if (id) found.add(id);
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
    const single = (fact: { callee: string; bound?: string; receiver?: string }, cls: Module | null, isStatic: boolean): string | null => {
      const typed = receiverTarget(fact.callee, fact.receiver);
      if (typed) return typed;
      if (fact.bound) return null;
      const targets = resolveCallees(fact.callee, cls, isStatic);
      return targets.length === 1 ? targets[0]! : null;
    };
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
        if (initializer) fn.escapes ??= { file: facts.path, line: d.line, col: d.col, reason: "a static initializer runs when the module loads" };
        const seen = new Set<string>();
        const push = (target: string, c: CallFact, extra: Partial<Call> = {}): void => {
          // A self-call stays an edge: recursion is a static path from a function to itself.
          if (seen.has(target)) return;
          seen.add(target);
          fn.calls.push({ target, line: c.line, col: c.col, endLine: c.endLine, endCol: c.endCol, text: c.callee, ...(c.closure ? { closure: true as const } : {}), ...extra });
          if (!extra.via) stats.callsResolved++;
        };
        for (const c of d.calls) {
          const head = c.callee.split(".")[0]!;
          // The values a resolved call passes may be what its callee's hook calls.
          const callee = c.passes ? single(c, cls, isStatic) : null;
          if (callee && c.passes) {
            // `new App({ … })` passes values to the constructor.
            const owners = decls.classes.has(callee) ? [`${callee}.constructor`] : [callee];
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
            const owner = c.hook.owner === "self" ? fn.id : cls ? `${cls.id}.constructor` : null;
            if (owner && c.hook.param !== null) hookCalls.push({ fn, hook: c.hook, owner, call: c });
          }
          const typed = receiverTarget(c.callee, c.receiver);
          if (typed) {
            push(typed, c);
            continue;
          }
          // `this.waiting.get()` with `waiting = new Map()`: a method of a global or package class.
          if (c.receiver && (JS_GLOBALS.has(c.receiver) || (locals.get(c.receiver) ?? []).some((imp) => imp.module?.layer === EXTERNAL))) {
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
            const imported = (locals.get(head) ?? []).find((imp) => imp.module);
            if (imported?.module?.layer === EXTERNAL || JS_GLOBALS.has(head)) stats.callsExternal++;
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
      const targets = typed ? [typed] : c.bound ? [] : resolveCallees(c.callee, null, false);
      for (const id of targets) {
        const target = decls.classes.has(id) ? `${id}.constructor` : id;
        if (!readIds.has(target)) readIds.set(target, escape);
      }
      if (targets.length > 0 || !c.callee.includes(".")) continue;
      if (JS_GLOBALS.has(head) || (locals.get(head) ?? []).some((imp) => imp.module?.layer === EXTERNAL)) continue;
      const member = c.callee.slice(c.callee.lastIndexOf(".") + 1).replace(/^#/, "");
      if (!calledNames.has(member)) calledNames.set(member, escape);
    }
    for (const d of facts.decls) {
      const id = d.kind === "class" && d.base ? decls.ids.get(d) : undefined;
      if (!id || !d.base) continue;
      const internal = d.base.includes(".") ? resolveCallees(d.base, null, false).filter((t) => decls.classes.has(t)) : [classNamed(d.base)].filter((t): t is string => t !== null);
      classBase.set(id, { internal: internal.length === 1 ? internal[0]! : null, text: d.base });
    }
    for (const ref of facts.valueRefs ?? []) {
      const escape = { file: facts.path, line: ref.line, col: ref.col, reason: `\`${ref.name}\` is read as a value` };
      if (ref.member) {
        if (!readMembers.has(ref.name)) readMembers.set(ref.name, escape);
        continue;
      }
      // A class read as a value (`extends A`, a factory argument) may be constructed anywhere.
      for (const id of resolveCallees(ref.name, null, false)) {
        const target = decls.classes.has(id) ? `${id}.constructor` : id;
        if (!readIds.has(target)) readIds.set(target, escape);
      }
    }
    const resolveType = (ref: TypeRefFact): string[] => {
      const head = ref.name.split(".")[0] ?? "";
      if (!head) return [];
      const found = new Set<string>();
      const local = localDecls.get(layerName(head));
      if (local) found.add(local);
      for (const imp of locals.get(head) ?? []) {
        const id = importedSymbol(imp);
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
    const noteTypes = (factDecls: DeclFact[], owner: Module): void => {
      for (const d of factDecls) {
        const source = decls.ids.get(d) ?? owner.id;
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
    for (const fn of cls.fns) if (fn.name !== "constructor") fn.escapes ??= { file: fn.file ?? cls.path ?? "", line: fn.line, col: fn.col, reason: `\`${fn.name}\` may be called by the base class \`${base}\`` };
  }
  markEscapes(modules, readIds, readMembers, calledNames, decls.members);

  stats.modules = [...modules.values()].filter((m) => m.layer !== EXTERNAL).length;
  const orderedLayers = [...layers.values()].filter((l) => l.modules.length > 0);
  const byPath = new Map<string, Module>();
  for (const [path, entry] of byFile) byPath.set(path, entry.module);
  return { layers: orderedLayers, modules, byPath, stats, warnings, gaps, openEdges, resolverInputs: resolver.inputs };
}

function holeReason(c: CallFact): string {
  if (c.hook) return `call through the hook \`${c.hook.name}\` (default \`${c.hook.fallback}\`)`;
  if (c.callee.startsWith("this.")) return `call through \`this\` of a function value \`${c.callee}\``;
  return `call through a local value \`${c.callee}\``;
}

/** Called by the language without a call expression in the code. */
const IMPLICIT_METHODS = new Set(["then", "next", "return", "throw", "toString", "valueOf", "toJSON"]);

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
      const ref = readIds.get(fn.id) ?? (isClass && fn.name !== "constructor" ? readMembers.get(name) : undefined) ?? calledNames.get(name);
      if (ref) fn.escapes = ref;
      else if (isClass && !members.get(fn.id)?.hash && IMPLICIT_METHODS.has(name)) fn.escapes = { file: fn.file ?? m.path ?? "", line: fn.line, col: fn.col, reason: `\`${name}\` is called implicitly` };
    }
    for (const child of m.children) if (!modules.has(child.id)) visit(child, true);
  };
  for (const m of modules.values()) visit(m, false);
}

const TYPE_GLOBALS = new Set(
  "Promise Array ReadonlyArray Record Partial Required Readonly Pick Omit Exclude Extract NonNullable ReturnType Parameters ConstructorParameters InstanceType Map Set WeakMap WeakSet Date RegExp Error Iterable Iterator AsyncIterable AsyncIterator Generator IterableIterator Buffer Function Object Boolean Number String".split(" "),
);

function markOpaque(m: Module): void {
  m.members = "opaque";
  for (const c of m.children) markOpaque(c);
}

/** Where each declaration went: several facts (overloads) may share one node. */
interface Decls {
  ids: Map<DeclFact, string>;
  fns: Map<string, Fn>;
  classes: Map<string, Module>;
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
    if (d.kind === "fn" && decls.fns.has(existing)) decls.ids.set(d, existing);
    return;
  }
  if (d.kind === "class") {
    const id = `${module.id}.${name}`;
    const cls: Module = { id, layer: module.layer, name, path: file, line: d.line, col: d.col, endLine: d.endLine, endCol: d.endCol, synthetic: false, comment: d.exported ? null : "internal", deps: [], fns: [], types: [], children: [], members: "complete", starSources: [] };
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
    const fn: Fn = { id, name, file, line: d.line, col: d.col, endLine: d.endLine, endCol: d.endCol, signature: d.signature, exported: d.exported, calls: [] };
    module.fns.push(fn);
    decls.fns.set(id, fn);
    stats.fns++;
  } else {
    module.types.push({ id, name, file, line: d.line, col: d.col, endLine: d.endLine, endCol: d.endCol, signature: d.signature, exported: d.exported });
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
