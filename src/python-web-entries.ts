// The registrations of the Python web frameworks (business-flows/38, ADR
// 0022), placed on the graph: Django `urls.py` (`path`, `re_path`, `include`,
// class-based views), signals (`signal.connect(h)`, `@receiver`) and
// management commands; FastAPI routers (`APIRouter(prefix=…)`,
// `include_router`, `@router.get`) and `Depends(f)`; Flask routes and
// blueprints; Celery tasks (`@shared_task`, `@app.task`), `beat_schedule` and
// `.delay()`/`.apply_async()`. The adapters (`src/frameworks/python-web.ts`)
// only choose the files; the facts are what the Python extractor records.
//
// A registration is recognised by what its names resolve to, never by the
// names alone: `@router.get` is a route when `router` is bound to
// `fastapi.APIRouter(…)`, `receiver` when it is imported from
// `django.dispatch`. A recognised decorator returns the function it registers
// (or, for a Celery task, an object whose call runs it), so the decorator's
// hole is lifted and a call through the name proves the body. What cannot be
// read — a computed path, a view that is no fn, an `include` of something
// other than a urls module — is a hole with the reason; nothing is guessed.
//
// Edges: `Depends(f)` → `via: "injected"` from the fn whose parameter or
// route declares it; `task.delay()` → `via: "dispatch"` to the task;
// `signal.send()` → `via: "observer"` to each receiver.

import type { Config } from "./config.ts";
import { fnIn, frameworkEntry, type EntryScope } from "./entries.ts";
import type { CallFact, DeclFact, FileFacts, Kwarg, LiteralValue } from "./extract/facts.ts";
import type { Call, Fn, Gap, Graph, Module } from "./graph.ts";
import { PythonResolver } from "./python-imports.ts";
import type { EntryPoint } from "./snapshot.ts";

/** What a dotted name written in a file stands for. */
type Ref =
  | { kind: "module"; file: string }
  /** A name bound at the top of `file` (a declaration or an assignment), with attributes read on it. */
  | { kind: "name"; file: string; name: string; rest: string[] }
  /** A name of a package or of the standard library: `fastapi.APIRouter`. */
  | { kind: "external"; qualified: string };

type ObjectKind = "fastapi" | "flask" | "blueprint" | "celery" | "signal";

/** An object a module-level statement makes with a framework's constructor: `router = APIRouter(prefix="/x")`. */
interface FrameworkObject {
  kind: ObjectKind;
  key: string;
  name: string;
  file: string;
  line: number;
  col: number;
  prefix: string;
  /** FastAPI `dependencies=[Depends(f)]` of a router: they run for each of its routes. */
  dependencies: LiteralValue[];
}

/** `parent.include_router(child, prefix=…)`, `app.register_blueprint(bp, url_prefix=…)`. */
interface Mount {
  parent: string;
  child: string;
  /** Flask: the registration's `url_prefix` replaces the blueprint's own; FastAPI: it goes before it. */
  prefix: string | null;
  replaces: boolean;
}

interface Receiver {
  fn: string;
  signal: string;
  label: string;
  site: string;
}

const HTTP_VERBS = ["get", "post", "put", "patch", "delete", "head", "options", "trace"];
const VIEW_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];

export interface PythonWebResult {
  entries: EntryPoint[];
  holes: Gap[];
}

/**
 * The entries, edges and holes of the active Python web adapters (`active`,
 * their names). Adds the edges to the graph's fns and lifts the holes the
 * registrations answer (a recognised decorator, a `.delay()` or `.send()`
 * whose target it names).
 */
export function pythonWebEntries(config: Config, graph: Graph, facts: readonly FileFacts[], scope: EntryScope, active: readonly string[]): PythonWebResult {
  return new PythonWeb(config, graph, facts, scope, new Set(active)).run();
}

class PythonWeb {
  private readonly files: Map<string, FileFacts>;
  private readonly resolver: PythonResolver;
  private readonly fns = new Map<string, Fn>();
  private readonly objects = new Map<string, FrameworkObject>();
  private readonly mounts: Mount[] = [];
  private readonly entries: EntryPoint[] = [];
  private readonly holes: Gap[] = [];
  /** Positions (`file:line:col`) of decorators recognised as registrations: their holes are lifted. */
  private readonly registered = new Set<string>();
  /** Positions of calls an edge of the framework now answers: their holes are lifted. */
  private readonly answered = new Set<string>();
  /** Celery tasks by fn id, and by name. */
  private readonly tasks = new Map<string, { name: string; site: string }>();
  private readonly taskNames = new Map<string, string>();
  private readonly receivers = new Map<string, Receiver[]>();

  private readonly graph: Graph;
  private readonly scope: EntryScope;
  private readonly active: ReadonlySet<string>;

  constructor(config: Config, graph: Graph, facts: readonly FileFacts[], scope: EntryScope, active: ReadonlySet<string>) {
    this.graph = graph;
    this.scope = scope;
    this.active = active;
    this.files = new Map(facts.filter((f) => f.path.endsWith(".py")).map((f) => [f.path, f]));
    this.resolver = new PythonResolver(config.root, new Set(facts.map((f) => f.path)));
    const visit = (module: Module): void => {
      for (const fn of module.fns) this.fns.set(fn.id, fn);
      for (const child of module.children) visit(child);
    };
    for (const layer of graph.layers) for (const module of layer.modules) visit(module);
  }

  run(): PythonWebResult {
    for (const file of this.files.values()) this.collectObjects(file);
    for (const file of this.files.values()) this.collectMounts(file);
    for (const file of this.files.values()) this.decorated(file);
    if (this.active.has("fastapi")) for (const file of this.files.values()) this.dependsInParams(file);
    if (this.active.has("django")) {
      for (const file of this.files.values()) this.connects(file);
      this.urls();
      for (const file of this.files.values()) this.command(file);
    }
    if (this.active.has("celery")) for (const file of this.files.values()) this.beat(file);
    for (const file of this.files.values()) this.dispatches(file);
    this.lift();
    return { entries: this.entries, holes: this.holes };
  }

  // Names.

  /** What `dotted`, written in `file`, stands for; null for a name the file neither declares nor imports. */
  private resolve(file: string, dotted: string, depth = 0): Ref | null {
    const facts = this.files.get(file);
    if (facts === undefined || depth > 8 || dotted === "") return null;
    const parts = dotted.split(".");
    if (this.declares(facts, parts[0]!)) return { kind: "name", file, name: parts[0]!, rest: parts.slice(1) };
    let best: { source: string; length: number; module: boolean } | null = null;
    for (const imp of facts.imports) {
      for (const binding of imp.bindings) {
        const local = binding.local.split(".");
        if (local.length > parts.length || !local.every((p, i) => p === parts[i])) continue;
        if (best === null || local.length > best.length) best = { source: imp.source, length: local.length, module: binding.kind === "module" };
      }
    }
    if (best === null) return null;
    const rest = parts.slice(best.length);
    const found = this.resolver.resolve(file, best.source);
    if (found.kind === "internal") {
      const head: Ref = found.whole === true || best.module ? { kind: "module", file: found.file } : { kind: "name", file: found.file, name: best.source.slice(best.source.lastIndexOf(".") + 1), rest: [] };
      return this.descend(head, rest, depth);
    }
    if (found.kind === "external" || found.kind === "stdlib") return { kind: "external", qualified: [best.source.replace(/^\.+/, ""), ...rest].join(".") };
    return null;
  }

  /** A module or name with more attributes read on it; a name another module only imports is followed there. */
  private descend(ref: Ref, rest: string[], depth: number): Ref | null {
    if (ref.kind === "module") {
      if (rest.length === 0) return ref;
      return this.follow(ref.file, rest[0]!, rest.slice(1), depth);
    }
    if (ref.kind === "name") return this.follow(ref.file, ref.name, [...ref.rest, ...rest], depth);
    return ref;
  }

  private follow(file: string, name: string, rest: string[], depth: number): Ref | null {
    const facts = this.files.get(file);
    if (facts === undefined) return { kind: "name", file, name, rest };
    if (this.declares(facts, name)) return { kind: "name", file, name, rest };
    const again = this.resolve(file, [name, ...rest].join("."), depth + 1);
    return again ?? { kind: "name", file, name, rest };
  }

  /** The file binds `name` at its top: a `def`, a `class` or an assignment. */
  private declares(facts: FileFacts, name: string): boolean {
    if (facts.decls.some((d) => d.name === name) || (facts.statements ?? []).some((s) => s.target === name)) return true;
    // A plain module lists the public names it imports as values too: those are the imports'.
    return facts.exportRows.some((r) => r.name === name && r.kind === "value") && !facts.imports.some((imp) => imp.bindings.some((b) => b.local === name));
  }

  /** The qualified name of a package's name written in `file`: `APIRouter` → `fastapi.APIRouter`. */
  private qualified(file: string, dotted: string): string | null {
    const ref = this.resolve(file, dotted);
    return ref?.kind === "external" ? ref.qualified : null;
  }

  private fnOf(file: string, dotted: string): string | null {
    const ref = this.resolve(file, dotted);
    if (ref?.kind !== "name") return null;
    return fnIn(this.scope, ref.file, [ref.name, ...ref.rest].join("."));
  }

  private classOf(file: string, dotted: string): Module | null {
    const ref = this.resolve(file, dotted);
    if (ref?.kind !== "name" || ref.rest.length > 0) return null;
    return this.graph.byPath.get(ref.file)?.children.find((c) => c.class && c.name === ref.name && (c.path === null || c.path === ref.file)) ?? null;
  }

  private objectOf(file: string, dotted: string): FrameworkObject | null {
    const ref = this.resolve(file, dotted);
    return ref?.kind === "name" && ref.rest.length === 0 ? (this.objects.get(`${ref.file}#${ref.name}`) ?? null) : null;
  }

  // Objects and mounts.

  private collectObjects(file: FileFacts): void {
    for (const s of file.statements ?? []) {
      if (s.target === null || s.target.includes(".") || s.augmented || s.value.kind !== "call") continue;
      const q = this.qualified(file.path, s.value.callee);
      const kind = objectKind(q);
      if (kind === null || !this.active.has(frameworkOf(kind))) continue;
      const prefixArg = kind === "blueprint" ? kwarg(s.value.kwargs, "url_prefix") : kind === "fastapi" ? kwarg(s.value.kwargs, "prefix") : undefined;
      const dependencies = kwarg(s.value.kwargs, "dependencies");
      const key = `${file.path}#${s.target}`;
      this.objects.set(key, { kind, key, name: s.target, file: file.path, line: s.line, col: s.col, prefix: str(prefixArg) ?? "", dependencies: dependencies?.kind === "list" ? dependencies.items : [] });
    }
  }

  private collectMounts(file: FileFacts): void {
    for (const s of file.statements ?? []) {
      if (s.target !== null || s.value.kind !== "call") continue;
      const call = s.value;
      const dot = call.callee.lastIndexOf(".");
      if (dot === -1) continue;
      const verb = call.callee.slice(dot + 1);
      const parent = this.objectOf(file.path, call.callee.slice(0, dot));
      if (parent === null || (verb !== "include_router" && verb !== "register_blueprint")) continue;
      const arg = call.args[0];
      const child = arg?.kind === "name" ? this.objectOf(file.path, arg.value) : null;
      if (child === null) {
        this.hole(file.path, s.line, s.col, call.callee, `\`${call.callee}\` mounts ${arg ? `\`${text(arg)}\`` : "nothing"}, which is no router or blueprint keylang reads: its routes have no prefix from here`, this.graph.byPath.get(file.path)?.id ?? null);
        continue;
      }
      const prefix = str(kwarg(call.kwargs, verb === "include_router" ? "prefix" : "url_prefix"));
      this.mounts.push({ parent: parent.key, child: child.key, prefix: prefix ?? null, replaces: verb === "register_blueprint" });
    }
  }

  /** Every URL prefix an object's routes have: its own, behind each mount's (through the objects that mount it). */
  private prefixes(key: string, seen: ReadonlySet<string> = new Set()): string[] {
    const own = this.objects.get(key);
    if (own === undefined) return [""];
    const parents = this.mounts.filter((m) => m.child === key && !seen.has(m.parent));
    if (parents.length === 0) return [own.prefix];
    const next = new Set([...seen, key]);
    const out = new Set<string>();
    for (const m of parents) {
      const local = m.replaces ? (m.prefix ?? own.prefix) : `${m.prefix ?? ""}${own.prefix}`;
      for (const above of this.prefixes(m.parent, next)) out.add(`${above}${local}`);
    }
    return [...out].sort();
  }

  // Decorators: routes, tasks, receivers.

  private decorated(file: FileFacts): void {
    for (const d of file.decorators ?? []) {
      const dot = d.name.lastIndexOf(".");
      const verb = d.name.slice(dot + 1);
      const object = dot === -1 ? null : this.objectOf(file.path, d.name.slice(0, dot));
      const q = this.qualified(file.path, d.name);
      if (object?.kind === "fastapi" && (HTTP_VERBS.includes(verb) || verb === "api_route" || verb === "websocket")) this.route(file, d, object, verb);
      else if ((object?.kind === "flask" || object?.kind === "blueprint") && (HTTP_VERBS.includes(verb) || verb === "route")) this.route(file, d, object, verb);
      else if ((object?.kind === "celery" && verb === "task") || (this.active.has("celery") && q !== null && isQualified(q, "celery", ["shared_task"]))) this.task(file, d);
      else if (this.active.has("django") && q !== null && isQualified(q, "django", ["receiver"])) this.receiver(file, d);
    }
  }

  private route(file: FileFacts, d: NonNullable<FileFacts["decorators"]>[number], object: FrameworkObject, verb: string): void {
    const at = `${file.path}:${d.line}`;
    const fn = fnIn(this.scope, file.path, d.target);
    const path = str(d.call?.args[0] ?? kwarg(d.call?.kwargs ?? [], "path") ?? kwarg(d.call?.kwargs ?? [], "rule"));
    if (fn === null || path === undefined) {
      this.hole(file.path, d.line, d.col, d.name, fn === null ? `\`@${d.name}\` registers \`${d.target}\`, which is no fn keylang resolves` : `\`@${d.name}\` on \`${d.target}\`: the path is no literal`, this.graph.byPath.get(file.path)?.id ?? null);
      return;
    }
    this.registered.add(`${file.path}:${d.line}:${d.col}`);
    const framework = object.kind === "fastapi" ? "fastapi" : "flask";
    const methods =
      verb === "websocket" ? [null]
      : verb === "route" || verb === "api_route" ? (strings(kwarg(d.call?.kwargs ?? [], "methods")) ?? ["GET"]).map((m) => m.toUpperCase())
      : [verb.toUpperCase()];
    for (const prefix of this.prefixes(object.key)) {
      const url = joinUrl(prefix, path);
      for (const method of methods) {
        const found = frameworkEntry(this.scope, framework, "route", fn, method === null ? `WEBSOCKET ${url}` : `${method} ${url}`, at, { file: file.path, line: d.line });
        this.entries.push(method === null ? found : { ...found, method });
      }
    }
    if (framework === "fastapi") {
      const dependencies = kwarg(d.call?.kwargs ?? [], "dependencies");
      for (const item of dependencies?.kind === "list" ? dependencies.items : []) this.depends(file.path, fn, item, "dependencies");
      for (const item of object.dependencies) this.depends(object.file, fn, item, "dependencies");
    }
  }

  private task(file: FileFacts, d: NonNullable<FileFacts["decorators"]>[number]): void {
    const fn = fnIn(this.scope, file.path, d.target);
    if (fn === null) {
      this.hole(file.path, d.line, d.col, d.name, `\`@${d.name}\` registers \`${d.target}\`, which is no fn keylang resolves`, this.graph.byPath.get(file.path)?.id ?? null);
      return;
    }
    this.registered.add(`${file.path}:${d.line}:${d.col}`);
    const name = str(kwarg(d.call?.kwargs ?? [], "name")) ?? `${moduleName(file.path)}.${d.target}`;
    this.tasks.set(fn, { name, site: `${file.path}:${d.line}:${d.col}` });
    this.taskNames.set(name, fn);
    this.entries.push(frameworkEntry(this.scope, "celery", "consumer", fn, name, `${file.path}:${d.line}`, { file: file.path, line: d.line }));
  }

  private receiver(file: FileFacts, d: NonNullable<FileFacts["decorators"]>[number]): void {
    const fn = fnIn(this.scope, file.path, d.target);
    const first = d.call?.args[0];
    const signals = first?.kind === "list" ? first.items : first === undefined ? [] : [first];
    if (fn === null || signals.length === 0) {
      this.hole(file.path, d.line, d.col, d.name, fn === null ? `\`@${d.name}\` registers \`${d.target}\`, which is no fn keylang resolves` : `\`@${d.name}\` on \`${d.target}\` names no signal`, this.graph.byPath.get(file.path)?.id ?? null);
      return;
    }
    this.registered.add(`${file.path}:${d.line}:${d.col}`);
    for (const signal of signals) this.observe(file.path, d.line, d.col, signal, fn, kwarg(d.call?.kwargs ?? [], "sender"));
  }

  /** A receiver of a signal: an `observer` entry, and the fn `signal.send()` reaches. */
  private observe(file: string, line: number, col: number, signal: LiteralValue, fn: string, sender: LiteralValue | undefined): void {
    const key = signal.kind === "name" ? this.signalKey(file, signal.value) : null;
    if (key === null) {
      this.hole(file, line, col, text(signal), `\`${text(signal)}\` is no signal keylang resolves: Django's (\`django.db.models.signals\`…) or a \`Signal()\` of the repository`, fn);
      return;
    }
    const name = key.slice(Math.max(key.lastIndexOf("."), key.lastIndexOf("#")) + 1);
    const label = sender?.kind === "name" ? `${name} (sender=${sender.value})` : name;
    const site = `${file}:${line}:${col}`;
    this.receivers.set(key, [...(this.receivers.get(key) ?? []), { fn, signal: name, label, site }]);
    this.entries.push(frameworkEntry(this.scope, "django", "observer", fn, label, `${file}:${line}`, { file, line }));
  }

  /** A signal's identity: the qualified name of Django's, `file#name` of one the repository makes with `Signal()`. */
  private signalKey(file: string, dotted: string): string | null {
    const ref = this.resolve(file, dotted);
    if (ref?.kind === "external") return isQualified(ref.qualified, "django", []) && /\.signals\.[A-Za-z_]+$/.test(ref.qualified) ? ref.qualified : null;
    if (ref?.kind === "name" && ref.rest.length === 0) return this.objects.get(`${ref.file}#${ref.name}`)?.kind === "signal" ? `${ref.file}#${ref.name}` : null;
    return null;
  }

  // Django.

  /** `signal.connect(handler, sender=M)` at module level, or in a fn (`AppConfig.ready`). */
  private connects(file: FileFacts): void {
    for (const s of file.statements ?? []) {
      if (s.target !== null || s.value.kind !== "call" || !s.value.callee.endsWith(".connect")) continue;
      const signal = s.value.callee.slice(0, -".connect".length);
      if (this.signalKey(file.path, signal) === null) continue;
      const handler = s.value.args[0] ?? kwarg(s.value.kwargs, "receiver");
      const fn = handler?.kind === "name" ? this.fnOf(file.path, handler.value) : null;
      if (fn === null) {
        this.hole(file.path, s.line, s.col, s.value.callee, `\`${s.value.callee}(${handler ? text(handler) : ""})\` connects no fn keylang resolves`, this.graph.byPath.get(file.path)?.id ?? null);
        continue;
      }
      this.observe(file.path, s.line, s.col, { kind: "name", value: signal }, fn, kwarg(s.value.kwargs, "sender"));
    }
    this.eachCall(file, (_caller, c) => {
      if (!c.callee.endsWith(".connect") || c.bound) return;
      const signal = c.callee.slice(0, -".connect".length);
      if (this.signalKey(file.path, signal) === null) return;
      const handler = (c.passes ?? []).find((p) => p.arg === 0 && p.path === "");
      const fn = handler === undefined || handler.bound ? null : this.fnOf(file.path, handler.callee);
      if (fn === null) {
        this.hole(file.path, c.line, c.col, c.callee, `\`${c.callee}(…)\` connects no fn keylang resolves`, this.graph.byPath.get(file.path)?.id ?? null);
        return;
      }
      this.observe(file.path, c.line, c.col, { kind: "name", value: signal }, fn, undefined);
    });
  }

  /** `urlpatterns` from each root urls module (one no other `include`s), with the prefixes `include` adds. */
  private urls(): void {
    const urlFiles = [...this.files.values()].filter((f) => (f.statements ?? []).some((s) => s.target === "urlpatterns"));
    const included = new Set<string>();
    for (const file of urlFiles) for (const value of this.patterns(file)) this.includes(file.path, value, (target) => included.add(target));
    for (const file of urlFiles) if (!included.has(file.path)) this.walkUrls(file.path, "", new Set());
  }

  private patterns(file: FileFacts): LiteralValue[] {
    return (file.statements ?? []).filter((s) => s.target === "urlpatterns").flatMap((s) => (s.value.kind === "list" ? s.value.items : [s.value]));
  }

  /** The urls modules a pattern `include`s, without reporting anything. */
  private includes(file: string, value: LiteralValue, found: (target: string) => void): void {
    if (value.kind !== "call" || !this.isDjango(file, value.callee, ["path", "re_path", "url"])) return;
    const view = value.args[1] ?? kwarg(value.kwargs, "view");
    if (view?.kind !== "call" || !this.isDjango(file, view.callee, ["include"])) return;
    const target = this.includedFile(file, view.args[0]);
    if (typeof target === "string") found(target);
    else if (target !== null) for (const item of target) this.includes(file, item, found);
  }

  /** What `include(x)` includes: a urls module's file, an inline list of patterns, or null. */
  private includedFile(file: string, arg: LiteralValue | undefined): string | LiteralValue[] | null {
    if (arg?.kind === "list") {
      const first = arg.items[0];
      return first?.kind === "string" || first?.kind === "name" ? this.includedFile(file, first) : arg.items;
    }
    if (arg?.kind === "string") {
      const found = this.resolver.resolve(file, arg.value);
      return found.kind === "internal" && found.whole === true ? found.file : null;
    }
    if (arg?.kind === "name") {
      const ref = this.resolve(file, arg.value);
      return ref?.kind === "module" ? ref.file : null;
    }
    return null;
  }

  private walkUrls(path: string, prefix: string, seen: ReadonlySet<string>): void {
    const file = this.files.get(path);
    if (file === undefined || seen.has(path)) return;
    const next = new Set([...seen, path]);
    for (const value of this.patterns(file)) this.urlPattern(file, value, prefix, next);
  }

  private urlPattern(file: FileFacts, value: LiteralValue, prefix: string, seen: ReadonlySet<string>): void {
    const module = this.graph.byPath.get(file.path)?.id ?? null;
    if (value.kind !== "call" || !this.isDjango(file.path, value.callee, ["path", "re_path", "url"])) {
      if (value.kind === "call") this.hole(file.path, value.line, value.col, value.callee, `\`${value.callee}(…)\` in \`urlpatterns\` is no \`path\`/\`re_path\` keylang reads`, module);
      else this.hole(file.path, 1, 1, text(value), `\`${text(value)}\` in \`urlpatterns\` is no \`path\`/\`re_path\` keylang reads`, module);
      return;
    }
    const route = str(value.args[0] ?? kwarg(value.kwargs, "route"));
    const view = value.args[1] ?? kwarg(value.kwargs, "view");
    const at = `${file.path}:${value.line}`;
    if (route === undefined || view === undefined) {
      this.hole(file.path, value.line, value.col, value.callee, `\`${value.callee}(…)\`: the route is no literal, or the view is missing`, module);
      return;
    }
    const url = `${prefix}${route.replace(/^\^/, "").replace(/\$$/, "")}`;
    if (view.kind === "call" && this.isDjango(file.path, view.callee, ["include"])) {
      const target = this.includedFile(file.path, view.args[0]);
      if (typeof target === "string") this.walkUrls(target, url, seen);
      else if (target !== null) for (const item of target) this.urlPattern(file, item, url, seen);
      else this.hole(file.path, view.line, view.col, view.callee, `\`include(${view.args[0] ? text(view.args[0]) : ""})\` names no urls module keylang reads`, module);
      return;
    }
    if (view.kind === "call" && view.callee.endsWith(".as_view")) {
      const cls = this.classOf(file.path, view.callee.slice(0, -".as_view".length));
      if (cls === null) {
        this.hole(file.path, view.line, view.col, view.callee, `\`${view.callee}()\` is a view of a class keylang does not resolve`, module);
        return;
      }
      const methods = cls.fns.filter((fn) => VIEW_METHODS.includes(fn.written ?? fn.name));
      if (methods.length === 0) {
        this.entries.push({ ...frameworkEntry(this.scope, "django", "route", cls.id, `/${url}`, at, { file: file.path, line: value.line }), note: `class-based view without a handler method of its own: the class \`${cls.name}\` stands for it` });
        return;
      }
      for (const fn of methods) {
        const method = (fn.written ?? fn.name).toUpperCase();
        this.entries.push({ ...frameworkEntry(this.scope, "django", "route", fn.id, `${method} /${url}`, at, { file: file.path, line: value.line }), method });
      }
      return;
    }
    const fn = view.kind === "name" ? this.fnOf(file.path, view.value) : null;
    if (fn === null) {
      this.hole(file.path, value.line, value.col, value.callee, `the view \`${text(view)}\` of \`/${url}\` is no fn keylang resolves`, module);
      return;
    }
    this.entries.push(frameworkEntry(this.scope, "django", "route", fn, `/${url}`, at, { file: file.path, line: value.line }));
  }

  private isDjango(file: string, callee: string, names: string[]): boolean {
    const q = this.qualified(file, callee);
    return q !== null && isQualified(q, "django", names);
  }

  /** `<app>/management/commands/<name>.py` with a class `Command`: `manage.py <name>` runs its `handle`. */
  private command(file: FileFacts): void {
    const match = /(?:^|\/)management\/commands\/([^/]+)\.py$/.exec(file.path);
    const cls = file.decls.find((d) => d.kind === "class" && d.name === "Command");
    if (match === null || match[1]!.startsWith("_") || cls === undefined) return;
    const module = this.graph.byPath.get(file.path);
    const id = fnIn(this.scope, file.path, "Command.handle") ?? module?.children.find((c) => c.class && c.name === "Command")?.id ?? module?.id;
    if (id === undefined) return;
    this.entries.push(frameworkEntry(this.scope, "django", "cli", id, `manage.py ${match[1]}`, `${file.path}:${cls.line}`, { file: file.path, line: cls.line }));
  }

  // Celery.

  /** `beat_schedule = {name: {"task": "…", "schedule": crontab(…)}}`, in a Celery config or Django settings. */
  private beat(file: FileFacts): void {
    for (const s of file.statements ?? []) {
      const last = s.target?.slice(s.target.lastIndexOf(".") + 1).toLowerCase();
      const schedule = last === "beat_schedule" || last === "celery_beat_schedule" ? s.value : s.target === null && s.value.kind === "call" && s.value.callee.endsWith(".conf.update") ? kwarg(s.value.kwargs, "beat_schedule") : undefined;
      if (schedule?.kind !== "dict") continue;
      for (const { key, value } of schedule.entries) {
        const name = str(key);
        const task = value.kind === "dict" ? str(entryOf(value, "task")) : undefined;
        if (name === undefined || task === undefined) {
          this.hole(file.path, s.line, s.col, s.target ?? "beat_schedule", `a \`beat_schedule\` entry \`${text(key)}\` names no task by a literal`, this.graph.byPath.get(file.path)?.id ?? null);
          continue;
        }
        const fn = this.taskNames.get(task);
        if (fn === undefined) {
          this.hole(file.path, s.line, s.col, s.target ?? "beat_schedule", `the \`beat_schedule\` entry \`${name}\` runs the task \`${task}\`, which no analysed file registers`, this.graph.byPath.get(file.path)?.id ?? null);
          continue;
        }
        const when = value.kind === "dict" ? scheduleText(entryOf(value, "schedule"), this.qualified.bind(this, file.path)) : "?";
        this.entries.push(frameworkEntry(this.scope, "celery", "cron", fn, `${name} (${when})`, `${file.path}:${s.line}`, { file: file.path, line: s.line }));
      }
    }
  }

  // Edges.

  /** `Depends(f)` in a parameter: the fn calls `f` with what the framework injects. */
  private dependsInParams(file: FileFacts): void {
    for (const p of file.paramCalls ?? []) {
      const fn = fnIn(this.scope, file.path, p.symbol);
      if (fn !== null) this.depends(file.path, fn, p.value, p.param);
    }
  }

  private depends(file: string, fn: string, value: LiteralValue, hook: string): void {
    if (value.kind !== "call") return;
    const q = this.qualified(file, value.callee);
    if (q === null || !isQualified(q, "fastapi", ["Depends", "Security"])) return;
    const arg = value.args[0] ?? kwarg(value.kwargs, "dependency");
    if (arg === undefined) return;
    const ref = arg.kind === "name" ? this.resolve(file, arg.value) : null;
    if (ref?.kind === "external") return;
    const target = arg.kind === "name" ? (this.fnOf(file, arg.value) ?? this.constructorOf(file, arg.value)) : null;
    if (target === null) {
      this.hole(file, value.line, value.col, `${value.callee}(${text(arg)})`, `\`${value.callee}(${text(arg)})\` injects what no fn keylang resolves returns`, fn);
      return;
    }
    const site = `${file}:${value.line}:${value.col}`;
    this.edge(fn, { target, line: value.line, col: value.col, endLine: value.line, endCol: value.col + value.callee.length, text: `${value.callee}(${text(arg)})`, via: "injected", hook, site });
  }

  private constructorOf(file: string, dotted: string): string | null {
    const cls = this.classOf(file, dotted);
    return cls?.fns.find((fn) => (fn.written ?? fn.name) === "__init__")?.id ?? null;
  }

  /** `task.delay()` / `task.apply_async()` → the task (`dispatch`); `signal.send()` → its receivers (`observer`). */
  private dispatches(file: FileFacts): void {
    this.eachCall(file, (caller, c) => {
      if (c.bound || c.opaque) return;
      const task = /^(.+)\.(delay|apply_async)$/.exec(c.callee);
      if (task !== null && this.active.has("celery")) {
        const fn = this.fnOf(file.path, task[1]!);
        const known = fn === null ? undefined : this.tasks.get(fn);
        if (fn !== null && known !== undefined) {
          this.edge(caller, { target: fn, line: c.line, col: c.col, endLine: c.endLine, endCol: c.endCol, text: c.callee, via: "dispatch", site: known.site, binding: `Celery task \`${known.name}\``, ...(c.closure ? { closure: true as const } : {}) });
          this.answered.add(`${file.path}:${c.line}:${c.col}`);
        }
        return;
      }
      const send = /^(.+)\.(send|send_robust)$/.exec(c.callee);
      if (send !== null && this.active.has("django")) {
        const key = this.signalKey(file.path, send[1]!);
        const receivers = key === null ? [] : (this.receivers.get(key) ?? []);
        for (const r of receivers) this.edge(caller, { target: r.fn, line: c.line, col: c.col, endLine: c.endLine, endCol: c.endCol, text: c.callee, via: "observer", site: r.site, binding: `receiver of the signal \`${r.signal}\``, ...(c.closure ? { closure: true as const } : {}) });
        if (key !== null) this.answered.add(`${file.path}:${c.line}:${c.col}`);
      }
    });
  }

  /** Every call written in a fn of the file (methods of top-level classes included), with the fn's id. */
  private eachCall(file: FileFacts, visit: (caller: string, call: CallFact) => void): void {
    const each = (d: DeclFact, symbol: string): void => {
      if (d.kind === "class") {
        for (const m of d.members) each(m, `${symbol}.${m.name}`);
        return;
      }
      if (d.kind !== "fn") return;
      const id = fnIn(this.scope, file.path, symbol);
      if (id !== null) for (const c of d.calls) visit(id, c);
    };
    for (const d of file.decls) each(d, d.name);
  }

  private edge(source: string, call: Call): void {
    const fn = this.fns.get(source);
    if (fn === undefined) return;
    if (fn.calls.some((c) => c.target === call.target && c.via === call.via && c.line === call.line && c.col === call.col)) return;
    fn.calls.push(call);
  }

  /** Lifts the holes a registration answers: a recognised decorator's, a dispatch's or a send's call. */
  private lift(): void {
    const { graph } = this;
    graph.gaps = graph.gaps.filter((gap) => {
      const at = `${gap.file}:${gap.line}:${gap.col}`;
      if (gap.kind === "unsupported" && this.registered.has(at) && gap.reason.startsWith("decorator ")) return false;
      if ((gap.kind === "unresolved-call" || gap.kind === "dynamic-call") && this.answered.has(at)) {
        if (gap.kind === "unresolved-call") graph.stats.callsUnresolved--;
        else graph.stats.callsDynamic--;
        graph.stats.callsResolved++;
        return false;
      }
      return true;
    });
  }

  private hole(file: string, line: number, col: number, fragment: string, reason: string, source: string | null): void {
    this.holes.push({ kind: "unsupported", file, line, col, endLine: line, endCol: col + 1, text: fragment, reason, source });
  }
}

function objectKind(q: string | null): ObjectKind | null {
  if (q === null) return null;
  if (isQualified(q, "fastapi", ["FastAPI", "APIRouter"])) return "fastapi";
  if (isQualified(q, "flask", ["Flask"])) return "flask";
  if (isQualified(q, "flask", ["Blueprint"])) return "blueprint";
  if (isQualified(q, "celery", ["Celery"])) return "celery";
  if (isQualified(q, "django", ["Signal"])) return "signal";
  return null;
}

function frameworkOf(kind: ObjectKind): string {
  return kind === "blueprint" ? "flask" : kind === "signal" ? "django" : kind;
}

/** `fastapi.routing.APIRouter` is `APIRouter` of `fastapi`; no `names` accepts any name of the package. */
function isQualified(q: string, pkg: string, names: readonly string[]): boolean {
  const parts = q.split(".");
  return parts[0] === pkg && (names.length === 0 || names.includes(parts.at(-1)!));
}

function kwarg(kwargs: readonly Kwarg[], name: string): LiteralValue | undefined {
  return kwargs.find((k) => k.name === name)?.value;
}

function entryOf(dict: Extract<LiteralValue, { kind: "dict" }>, key: string): LiteralValue | undefined {
  return dict.entries.find((e) => e.key.kind === "string" && e.key.value === key)?.value;
}

function str(value: LiteralValue | undefined): string | undefined {
  return value?.kind === "string" ? value.value : undefined;
}

/** A list of string literals, or undefined for anything else. */
function strings(value: LiteralValue | undefined): string[] | undefined {
  if (value?.kind !== "list") return undefined;
  const out = value.items.map(str);
  return out.every((s) => s !== undefined) ? (out as string[]) : undefined;
}

/** A value in words: a literal as written, a call by its callee. */
function text(value: LiteralValue): string {
  switch (value.kind) {
    case "string":
      return JSON.stringify(value.value);
    case "number":
      return String(value.value);
    case "name":
      return value.value;
    case "call":
      return `${value.callee}(${[...value.args.map(text), ...value.kwargs.map((k) => `${k.name}=${text(k.value)}`)].join(", ")})`;
    case "list":
      return `[${value.items.map(text).join(", ")}]`;
    case "dict":
      return `{${value.entries.map((e) => `${text(e.key)}: ${text(e.value)}`).join(", ")}}`;
    default:
      return value.text;
  }
}

/** A URL from a router's prefix and a route's path: `/orders` + `/{id}`; at least `/`. */
function joinUrl(prefix: string, path: string): string {
  const url = `${prefix}${path}`;
  return url === "" ? "/" : url.startsWith("/") ? url : `/${url}`;
}

/** The dotted module name of a Python file, as Celery names its tasks: `shop/tasks.py` → `shop.tasks`. */
function moduleName(file: string): string {
  return file.replace(/^src\//, "").replace(/(?:\/__init__)?\.py$/, "").split("/").join(".");
}

/** Celery's `crontab(minute=0, hour="*\/3")` as cron fields; a number of seconds; another schedule as written. */
function scheduleText(value: LiteralValue | undefined, qualified: (dotted: string) => string | null): string {
  if (value === undefined) return "?";
  if (value.kind === "number") return `every ${value.value}s`;
  if (value.kind === "call") {
    const q = qualified(value.callee);
    if (q !== null && isQualified(q, "celery", ["crontab"])) {
      // Positional order of `crontab`; cron's field order differs.
      const positional = ["minute", "hour", "day_of_week", "day_of_month", "month_of_year"];
      const field = (name: string): string => {
        const v = kwarg(value.kwargs, name) ?? value.args[positional.indexOf(name)];
        return v === undefined ? "*" : v.kind === "string" ? v.value : v.kind === "number" ? String(v.value) : text(v);
      };
      return ["minute", "hour", "day_of_month", "month_of_year", "day_of_week"].map(field).join(" ");
    }
    return `every ${text(value)}`;
  }
  return text(value);
}

