// Entry points of the JavaScript web adapters (ADR 0022; business-flows/37),
// placed on the graph from what the TypeScript extractor records of the
// registrations (`FileFacts.web`); the adapters themselves only detect the
// framework and list its files (`src/frameworks/web.ts`).
//
// Express and Fastify: a router is a value (`const r = express.Router()`, a
// top-level name, followed through imports and `export default`) or a
// Fastify plugin's first parameter. `app.use('/api', r)`, `r.use('/sub', s)`
// and `fastify.register(plugin, { prefix: '/v1' })` mount one under another,
// so `r.get('/x', h)` is `GET /api/x` for each path the router is mounted at.
// `router.route('/x').get(h).post(h2)` and `fastify.route({ method, url,
// handler })` register too. The handler is the entry (the last argument, or
// `handler`); middleware before it (`app.get('/x', auth, h)`, Fastify
// `preHandler`) is named in the entry's `note` with its fn ID — no node is
// invented for the chain. A handler written in place is the registering
// module with a note. `app.use(mw)` of a fn is a `USE /prefix` entry.
//
// Next.js: `pages/api/**` default exports (`API /api/x`), server actions
// (`'use server'` file or function → `action <name>`), `middleware.ts`
// (`middleware <matcher>`). App Router `route.ts` stays the language-level
// collector's (`src/entries.ts`).
//
// Nothing is guessed from names: a receiver no registration or creation
// makes a router is no router, a mounted value keylang cannot follow is not
// mounted, and a computed path of a router is a hole with the reason.

import { fnIn, frameworkEntry, type EntryScope } from "../entries.ts";
import type { DecoratorArg, FileFacts, WebCallFact } from "../extract/facts.ts";
import type { Gap, Module } from "../graph.ts";
import type { EntryPoint } from "../snapshot.ts";

type Arg = DecoratorArg & { line: number; col: number };

export interface WebEntries {
  entries: EntryPoint[];
  holes: Gap[];
  /** `file:line` of the registrations placed here: the language-level `route` entry of the same call (ticket 09) gives way to this one. */
  supersedes: Set<string>;
}

const VERBS = new Set(["get", "post", "put", "patch", "delete", "all", "head", "options"]);
const CREATOR = /(?:^|\.)(Router|express|fastify|Fastify)$/;
/** Fastify route options that run before the handler. */
const HOOKS = ["onRequest", "preParsing", "preValidation", "preHandler"];
const REQUIRE = /^require\(\s*['"`]([^'"`]+)['"`]\s*\)$/;

/** A registration with the router it is written on. */
interface Registration {
  file: string;
  call: WebCallFact;
  key: string;
}

/** Where a router is mounted: under `parent` at `prefix`. */
interface Mount {
  parent: string;
  prefix: string;
}

export function webEntries(facts: readonly FileFacts[], scope: EntryScope, active: readonly string[]): WebEntries {
  const out: WebEntries = { entries: [], holes: [], supersedes: new Set() };
  if (active.includes("express") || active.includes("fastify")) routerEntries(facts, scope, active, out);
  if (active.includes("next")) nextEntries(facts, scope, out);
  return out;
}

function routerEntries(facts: readonly FileFacts[], scope: EntryScope, active: readonly string[], out: WebEntries): void {
  const files = facts.filter((f) => f.web !== undefined);
  const resolver = new Values(scope);
  /** Kind of a router key: created by `Router()`, an app (`express()`, `fastify()`), a plugin's parameter, else a value. */
  const kinds = new Map<string, "router" | "app" | "plugin">();
  for (const file of files) {
    for (const v of file.web!.values) {
      const m = CREATOR.exec(v.callee);
      if (m !== null) kinds.set(valueKey(file.path, v.name), m[1] === "Router" ? "router" : "app");
    }
  }
  const registrations: Registration[] = [];
  for (const file of files) {
    for (const call of file.web!.calls) {
      let key: string;
      if (call.within !== undefined) {
        key = fnKey(file.path, call.within.name, call.within);
        if (call.method !== "use") kinds.set(key, "plugin");
      } else {
        const v = resolver.value(file.path, call.receiver);
        key = valueKey(v.file, v.name);
      }
      registrations.push({ file: file.path, call, key });
    }
  }
  registrations.sort((a, b) => cmp(a.file, b.file) || a.call.line - b.call.line || a.call.col - b.call.col || cmp(a.call.method, b.call.method));
  // A router is a value a creation names (`Router()`, `express()`), a plugin's parameter, or a key a route is registered on with a path.
  const routers = new Set<string>(kinds.keys());
  for (const r of registrations) {
    const m = r.call.method;
    if ((m === "route" && r.call.route === undefined) || (VERBS.has(m) && pathOf(r.call) !== null && routePath(pathOf(r.call)!))) routers.add(r.key);
  }
  const mounts = new Map<string, Mount[]>();
  const mount = (child: string, parent: string, prefix: string): void => {
    const list = mounts.get(child) ?? [];
    if (!list.some((m) => m.parent === parent && m.prefix === prefix)) list.push({ parent, prefix });
    mounts.set(child, list);
  };
  /** `use` middleware: fn → registration, at the parent's prefixes. */
  const middleware: { r: Registration; id: string; prefix: string; arg: Arg }[] = [];
  for (const r of registrations) {
    const { call, file } = r;
    const module = scope.graph.byPath.get(file);
    // `passport.use(strategy)`, `i18n.use(plugin)`: a `use` of no router is not the framework's.
    if (!routers.has(r.key)) continue;
    if (call.method === "use") {
      const first = call.args[0]!;
      const pathArg = first.kind === "string" ? first.value : null;
      const rest = pathArg === null ? call.args : call.args.slice(1);
      for (const [i, arg] of rest.entries()) {
        const child = resolver.mounted(file, arg, "value");
        if (child !== null && routers.has(child)) {
          mount(child, r.key, pathArg ?? "");
          continue;
        }
        const id = arg.kind === "name" ? fnIn(scope, file, arg.name) : null;
        if (id !== null) {
          middleware.push({ r, id, prefix: pathArg ?? "", arg });
          continue;
        }
        // `app.use(prefix, router)`: a first argument that is no router, no fn and no literal is a computed path.
        if (pathArg === null && i === 0 && rest.length > 1 && first.kind !== "function") {
          out.holes.push(hole(file, first, `the mount path is computed at run time: \`${argText(first)}\``, module));
        }
      }
    } else if (call.method === "register") {
      const child = resolver.mounted(file, call.args[0]!, "fn");
      if (child === null || !routers.has(child)) continue;
      const opts = call.args[1];
      const prefix = opts?.kind === "object" ? opts.props.find((p) => p.key === "prefix")?.value : undefined;
      if (prefix !== undefined && prefix.kind !== "string") {
        out.holes.push(hole(file, call.args[1]!, `the plugin prefix is computed at run time: \`${argText(prefix)}\``, module));
        continue;
      }
      mount(child, r.key, prefix?.kind === "string" ? prefix.value : "");
    }
  }
  // Each router's paths: the prefixes of its mounts, up to a router mounted nowhere.
  const memo = new Map<string, { prefix: string; root: string }[]>();
  const prefixes = (key: string, stack: ReadonlySet<string>): { prefix: string; root: string }[] => {
    const known = memo.get(key);
    if (known !== undefined) return known;
    const list = mounts.get(key) ?? [];
    const found: { prefix: string; root: string }[] = [];
    if (list.length === 0) found.push({ prefix: "", root: key });
    for (const m of list) {
      if (stack.has(m.parent)) continue;
      for (const p of prefixes(m.parent, new Set([...stack, key]))) found.push({ prefix: joinPath(p.prefix, m.prefix), root: p.root });
    }
    const unique = found.filter((p, i) => found.findIndex((q) => q.prefix === p.prefix && q.root === p.root) === i);
    if (stack.size === 0) memo.set(key, unique);
    return unique;
  };
  const frameworkOf = (root: string, file: string): string | null => {
    const imports = (path: string, pkg: string): boolean => scope.facts.get(path)?.imports.some((i) => i.source === pkg) ?? false;
    for (const path of [keyParts(root).file, file]) {
      if (imports(path, "fastify")) return active.includes("fastify") ? "fastify" : null;
      if (imports(path, "express")) return active.includes("express") ? "express" : null;
    }
    if (kinds.get(root) === "plugin" && active.includes("fastify")) return "fastify";
    return active.includes("express") ? "express" : active.includes("fastify") ? "fastify" : null;
  };
  const unmounted = (root: string): string | null => {
    const kind = kinds.get(root);
    const { file, name } = keyParts(root);
    if (kind === "router") return `the router \`${name}\` of ${file} is mounted nowhere keylang reads: the path is without its prefix`;
    if (kind === "plugin") return `the plugin ${name === null ? "written in place" : `\`${name}\``} of ${file} is registered nowhere keylang reads: the path is without its prefix`;
    return null;
  };
  const add = (r: Registration, verb: string, path: string, handler: Arg | DecoratorArg | undefined, before: readonly (Arg | DecoratorArg)[], at: { line: number; col: number }): void => {
    const module = scope.graph.byPath.get(r.file);
    if (module === undefined) return;
    const { id, note } = handlerOf(scope, r.file, handler);
    const chain = before.map((m) => middlewareText(scope, r.file, m));
    for (const p of prefixes(r.key, new Set())) {
      const fw = frameworkOf(p.root, r.file);
      if (fw === null) continue;
      out.supersedes.add(`${r.file}:${r.call.line}`);
      const notes = [note, chain.length > 0 ? `middleware before the handler: ${chain.join(", ")}` : null, unmounted(p.root)].filter((n): n is string => n !== null);
      const method = verb.toUpperCase();
      const label = `${method} ${p.prefix === "" && path === "*" ? "*" : joinPath(p.prefix, path)}`;
      const place = { file: r.file, line: at.line };
      const entry = frameworkEntry(scope, fw, "route", id ?? module.id, label, `${r.file}:${r.call.line}`, place);
      out.entries.push({ ...entry, ...(id === null ? place : {}), method, ...(notes.length > 0 ? { note: notes.join("; ") } : {}) });
    }
  };
  for (const r of registrations) {
    const { call, file } = r;
    const module = scope.graph.byPath.get(file);
    if (VERBS.has(call.method)) {
      const path = pathOf(call);
      const args = call.route === undefined ? call.args.slice(1) : call.args;
      if (path === null || !(routePath(path) || routers.has(r.key))) {
        if (path === null && routers.has(r.key) && (kinds.has(r.key) || mounts.has(r.key))) {
          const written = call.route ?? call.args[0]!;
          out.holes.push(hole(file, call.route === undefined ? call.args[0]! : call, `the route path is computed at run time: \`${argText(written)}\``, module));
        }
        continue;
      }
      // Fastify `get('/x', { preHandler, handler })` or `get('/x', opts, h)`.
      const last = args.at(-1);
      const opts = args.find((a) => a.kind === "object");
      const handler = last?.kind === "object" ? prop(last, "handler") : last;
      const before = [...args.slice(0, -1).filter((a) => a.kind !== "object"), ...(opts === undefined ? [] : hooksOf(opts))];
      add(r, call.method, path, handler, before, call);
    } else if (call.method === "route" && call.route === undefined) {
      const opts = call.args[0]!;
      if (opts.kind !== "object") continue;
      const url = prop(opts, "url") ?? prop(opts, "path");
      const method = prop(opts, "method");
      const methods = method?.kind === "string" ? [method.value] : method?.kind === "array" ? method.items.flatMap((i) => (i.kind === "string" ? [i.value] : [])) : [];
      if (url?.kind !== "string" || methods.length === 0 || (method?.kind === "array" && methods.length !== method.items.length)) {
        out.holes.push(hole(file, opts, `the route's ${url?.kind !== "string" ? "url" : "method"} is computed at run time`, module));
        continue;
      }
      for (const m of methods) add(r, m.toLowerCase(), url.value, prop(opts, "handler"), hooksOf(opts), call);
    }
  }
  for (const { r, id, prefix, arg } of middleware) {
    for (const p of prefixes(r.key, new Set())) {
      const fw = frameworkOf(p.root, r.file);
      if (fw === null) continue;
      const path = joinPath(p.prefix, prefix);
      const entry = frameworkEntry(scope, fw, "route", id, `USE ${path}`, `${r.file}:${r.call.line}`, { file: r.file, line: arg.line });
      const notes = [`middleware: runs before the routes under \`${path}\``, unmounted(p.root)].filter((n): n is string => n !== null);
      out.entries.push({ ...entry, note: notes.join("; ") });
    }
  }
}

/** Follows a written name to the value it stands for: a top-level name of a file, through imports and exports. */
class Values {
  private readonly scope: EntryScope;

  constructor(scope: EntryScope) {
    this.scope = scope;
  }

  /** The file and top-level name a name written in `file` stands for. */
  value(file: string, name: string, depth = 0): { file: string; name: string } {
    const facts = this.scope.facts.get(file);
    if (facts === undefined || depth > 8) return { file, name };
    if (facts.decls.some((d) => d.name === name) || facts.web?.values.some((v) => v.name === name)) return { file, name };
    for (const imp of facts.imports) {
      const binding = imp.bindings.find((b) => b.local === name);
      if (binding === undefined) continue;
      if (binding.kind === "module" && binding.namespace) return { file, name };
      const exported = binding.kind === "named" ? binding.imported : "default";
      const target = this.target(file, imp.source, imp.line, imp.col, imp.text);
      if (target === null) return { file, name };
      return this.exported(target, exported, depth + 1) ?? { file, name };
    }
    return { file, name };
  }

  /** The top-level name `file` exports as `name`. */
  exported(file: string, name: string, depth: number): { file: string; name: string } | null {
    const facts = this.scope.facts.get(file);
    const row = facts?.exportRows.find((r) => r.name === name);
    if (row === undefined || row.local === null) return null;
    if (row.from !== undefined) {
      const target = this.target(file, row.from, null, null, null);
      return target === null ? null : this.exported(target, row.local, depth + 1);
    }
    return this.value(file, row.local, depth);
  }

  /** The file an import of `file` resolves to. */
  target(file: string, source: string, line: number | null, col: number | null, text: string | null): string | null {
    const module = this.scope.graph.byPath.get(file);
    if (module === undefined) return null;
    const dep =
      module.deps.find((d) => d.file === file && d.line === line && d.col === col) ??
      module.deps.find((d) => d.file === file && d.text === text) ??
      module.deps.find((d) => d.file === file && (d.text.includes(`"${source}"`) || d.text.includes(`'${source}'`) || d.text.includes(`\`${source}\``)));
    return dep === undefined ? null : (this.scope.graph.modules.get(dep.target)?.path ?? null);
  }

  /** The router key an argument of `use` (a value) or `register` (a plugin fn) mounts; null when keylang cannot follow it. */
  mounted(file: string, arg: Arg, as: "value" | "fn"): string | null {
    let at: { file: string; name: string } | null = null;
    if (arg.kind === "name" && !arg.name.includes(".")) at = this.value(file, arg.name);
    else if (arg.kind === "function") return as === "fn" ? fnKey(file, null, arg) : null;
    else if (arg.kind === "other") {
      const required = REQUIRE.exec(arg.text);
      const target = required === null ? null : this.target(file, required[1]!, null, null, null);
      if (target !== null) at = this.exported(target, "default", 0);
    }
    if (at === null) return null;
    return as === "fn" ? fnKey(at.file, at.name, null) : valueKey(at.file, at.name);
  }
}

/** A router written as a top-level name of a file. */
function valueKey(file: string, name: string): string {
  return `v\0${file}\0${name}`;
}

/** A router that is the first parameter of a function: by the function's name, else its position. */
function fnKey(file: string, name: string | null, at: { line: number; col: number } | null): string {
  return name !== null ? `f\0${file}\0${name}` : `p\0${file}\0${at?.line ?? 0}:${at?.col ?? 0}`;
}

function keyParts(key: string): { file: string; name: string | null } {
  const [kind, file, name] = key.split("\0");
  return { file: file ?? "", name: kind === "p" ? null : (name ?? null) };
}

function pathOf(call: WebCallFact): string | null {
  const arg = call.route ?? call.args[0];
  return arg?.kind === "string" ? arg.value : null;
}

/** A path a router registers on: `/…` or `*`. */
function routePath(path: string): boolean {
  return path.startsWith("/") || path === "*";
}

function prop(arg: DecoratorArg, key: string): DecoratorArg | undefined {
  return arg.kind === "object" ? arg.props.find((p) => p.key === key)?.value : undefined;
}

/** Fastify hooks of route options that run before the handler, in the order Fastify runs them. */
function hooksOf(opts: DecoratorArg): DecoratorArg[] {
  return HOOKS.flatMap((key): DecoratorArg[] => {
    const value = prop(opts, key);
    return value === undefined ? [] : value.kind === "array" ? value.items : [value];
  });
}

/** The fn a handler argument names, or why there is none. */
function handlerOf(scope: EntryScope, file: string, handler: DecoratorArg | undefined): { id: string | null; note: string | null } {
  if (handler === undefined) return { id: null, note: "no handler keylang reads: the registering module stands for it" };
  if (handler.kind === "function") return { id: null, note: "handler written in place: the registering module stands for it" };
  if (handler.kind === "name") {
    const id = fnIn(scope, file, handler.name);
    return id !== null ? { id, note: null } : { id: null, note: `handler \`${handler.name}\` does not resolve to a fn: the registering module stands for it` };
  }
  return { id: null, note: `handler \`${argText(handler)}\` is no name keylang resolves: the registering module stands for it` };
}

/** A middleware of a chain in words: `` `auth` (mw.auth.auth) ``, or why it has no ID. */
function middlewareText(scope: EntryScope, file: string, arg: DecoratorArg): string {
  if (arg.kind === "function") return "a function written in place";
  if (arg.kind === "name") {
    const id = fnIn(scope, file, arg.name);
    return `\`${arg.name}\` (${id ?? "unresolved"})`;
  }
  return `\`${argText(arg)}\` (unresolved)`;
}

function argText(arg: DecoratorArg): string {
  switch (arg.kind) {
    case "string":
      return JSON.stringify(arg.value);
    case "number":
      return String(arg.value);
    case "name":
      return arg.name;
    case "function":
      return "() => …";
    case "other":
      return arg.text;
    case "array":
      return `[${arg.items.map(argText).join(", ")}]`;
    case "object":
      return `{ ${arg.props.map((p) => `${p.key}: ${argText(p.value)}`).join(", ")} }`;
  }
}

function hole(file: string, at: { line: number; col: number }, reason: string, module: Module | undefined): Gap {
  return { kind: "unsupported", file, line: at.line, col: at.col, endLine: at.line, endCol: at.col, text: "", reason, source: module?.id ?? null };
}

/** `/api/orders/:id` from its parts, each with or without slashes. */
function joinPath(...parts: string[]): string {
  return `/${parts
    .flatMap((p) => p.split("/"))
    .filter((p) => p !== "")
    .join("/")}`;
}

const PAGES_API = /(?:^|\/)pages\/(api\/.+)\.(?:ts|tsx|js|jsx|mjs)$/;
const MIDDLEWARE = /^(?:src\/)?middleware\.(?:ts|js|mjs)$/;

/** Next.js: Pages API handlers, server actions, `middleware.ts`. */
function nextEntries(facts: readonly FileFacts[], scope: EntryScope, out: WebEntries): void {
  for (const file of facts) {
    const module = scope.graph.byPath.get(file.path);
    if (module === undefined) continue;
    const top = { file: file.path, line: module.line ?? 1 };
    const exportedFn = (name: string): string | null => {
      const row = scope.graph.exports.find((e) => e.module === module.id && e.name === name);
      return row?.symbol != null && scope.fns.has(row.symbol) ? row.symbol : null;
    };
    const api = PAGES_API.exec(file.path);
    if (api !== null) {
      const id = exportedFn("default");
      const entry = frameworkEntry(scope, "next", "route", id ?? module.id, `API /${api[1]!.replace(/\/index$/, "")}`, `${file.path}:${top.line}`, top);
      out.entries.push(id === null ? { ...entry, note: "the default export is no fn keylang resolves: the module stands for it" } : entry);
    }
    if (MIDDLEWARE.test(file.path)) {
      const id = exportedFn("middleware") ?? exportedFn("default");
      const matcher = file.web?.config === undefined ? undefined : prop(file.web.config, "matcher");
      const paths = matcher?.kind === "string" ? [matcher.value] : matcher?.kind === "array" && matcher.items.every((i) => i.kind === "string") ? matcher.items.map((i) => (i as { value: string }).value) : null;
      const notes = [id === null ? "no exported `middleware` fn keylang resolves: the module stands for it" : null, matcher !== undefined && paths === null ? `the matcher is no literal: \`${argText(matcher)}\`` : null].filter((n): n is string => n !== null);
      const label = paths === null ? "middleware" : `middleware ${paths.join(", ")}`;
      const entry = frameworkEntry(scope, "next", "route", id ?? module.id, label, `${file.path}:${top.line}`, top);
      out.entries.push(notes.length > 0 ? { ...entry, note: notes.join("; ") } : entry);
    }
    const web = file.web;
    if (web === undefined) continue;
    const seen = new Set<string>();
    const action = (name: string, id: string | null, line: number, note: string | null): void => {
      if (seen.has(`${name}\0${id}`)) return;
      seen.add(`${name}\0${id}`);
      const place = { file: file.path, line };
      const entry = frameworkEntry(scope, "next", "route", id ?? module.id, `action ${name}`, `${file.path}:${line}`, place);
      out.entries.push({ ...entry, ...(id === null ? place : {}), ...(note !== null ? { note } : {}) });
    };
    // `'use server'` at the top of the file: every exported fn is an action.
    if (web.useServer) {
      for (const row of file.exportRows) {
        const id = exportedFn(row.name);
        if (id !== null) action(row.name, id, scope.fns.get(id)?.line ?? top.line, null);
      }
    }
    for (const a of web.actions ?? []) {
      const id = a.top && a.name !== null ? fnIn(scope, file.path, a.name) : null;
      action(a.name ?? "(anonymous)", id, a.line, id === null ? "a server action written inside another function: the module stands for it" : null);
    }
  }
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
