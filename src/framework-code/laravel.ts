// What Laravel wires in code (ADR 0022; business-flows 35), for the adapter
// `src/frameworks/laravel.ts`. Laravel writes its
// wiring in PHP, not in config files: service providers bind interfaces
// (`$this->app->bind(I::class, C::class)`, `$bindings`, `$singletons`),
// `EventServiceProvider::$listen` subscribes listeners, `routes/*.php`
// registers routes, `routes/console.php` and `Kernel::schedule` the commands
// and the schedule. The PHP extractor records the literals of those calls,
// properties and attributes (`LiteralFact`); this module reads them
// and gives the graph bindings, entry points, listeners, job handlers and the
// calls that dispatch them. Its config files — the route files, the service
// providers, `bootstrap/app.php` and the console kernel — are listed so that
// `frameworks` without `laravel` makes them holes; their facts come from code.
//
// Detected from `laravel/framework` in the root `composer.json`, or an
// `artisan` beside `bootstrap/app.php`. Nothing is guessed from names: a
// binding to a closure, a contextual binding, a controller named by a
// namespace a route provider sets are holes with the reason.

import { posix } from "node:path";
import type { CallFact, FileFacts, LiteralFact } from "../extract/facts.ts";
import type { ConfigFacts, EntryConfigFact, FrameworkConfig, ListenFact } from "../frameworks/adapter.ts";
import { arg, callsOf, cls, codeFacts, dispatchesIn, eventName, hasFacts, key, PhpCode, str, strings, type, type PhpClass } from "./php.ts";

const SERVICE_PROVIDER = "Illuminate\\Support\\ServiceProvider";
const FACADE = "Illuminate\\Support\\Facades\\Facade";
const COMMAND = "Illuminate\\Console\\Command";
const SHOULD_QUEUE = "Illuminate\\Contracts\\Queue\\ShouldQueue";
const SCHEDULE = "Illuminate\\Console\\Scheduling\\Schedule";
/** A facade (or its global alias) as the route files and the console routes use it. */
const ROUTE = ["Illuminate\\Support\\Facades\\Route", "Route"];
const SCHEDULE_FACADE = ["Illuminate\\Support\\Facades\\Schedule", "Schedule"];
const ARTISAN = ["Illuminate\\Support\\Facades\\Artisan", "Artisan"];
const EVENT = ["Illuminate\\Support\\Facades\\Event", "Event"];
const AS_COMMAND = "Symfony\\Component\\Console\\Attribute\\AsCommand";

/** Container methods that bind an abstract to a concrete class. */
const BIND_METHODS = new Set(["bind", "singleton", "scoped", "bindif", "singletonif", "scopedif"]);
const VERBS: Record<string, string[]> = { get: ["GET"], post: ["POST"], put: ["PUT"], patch: ["PATCH"], delete: ["DELETE"], options: ["OPTIONS"], any: [] };
/** `Route::resource` actions: method, path after the resource, HTTP methods; `apiResource` leaves out `create` and `edit`. */
const RESOURCE_ACTIONS: [string, string, string[]][] = [
  ["index", "", ["GET"]],
  ["create", "/create", ["GET"]],
  ["store", "", ["POST"]],
  ["show", "/{param}", ["GET"]],
  ["edit", "/{param}/edit", ["GET"]],
  ["update", "/{param}", ["PUT", "PATCH"]],
  ["destroy", "/{param}", ["DELETE"]],
];

function isOneOf(name: string | null | undefined, names: readonly string[]): boolean {
  return name !== null && name !== undefined && names.some((n) => key(n) === key(name));
}

/** What a Laravel repository's code wires, one `ConfigFacts` per file that says anything. */
export function laravelFacts(files: readonly FileFacts[]): FrameworkConfig[] {
  const code = new PhpCode(files);
  const out = new Map<string, ConfigFacts>();
  const at = (path: string): ConfigFacts => {
    let facts = out.get(path);
    if (!facts) out.set(path, (facts = codeFacts(path)));
    return facts;
  };
  const classes = [...code.classes.values()].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.decl.line - b.decl.line));
  /** Container keys a provider binds by a string (`$this->app->singleton('payment', C::class)`), for a facade's accessor. */
  const keyed = new Map<string, string>();
  const providers = classes.filter((c) => c.file.startsWith("app/Providers/") || code.extends(c, SERVICE_PROVIDER));
  for (const provider of providers) readProvider(code, provider, at(provider.file), keyed);
  for (const facade of classes.filter((c) => code.extends(c, FACADE))) readFacade(code, facade, at(facade.file), keyed);
  // Listeners: observer entries; every listener is known before a job decides it is no consumer.
  const listens = [...out.values()].flatMap((f) => (f.listens ?? []).map((l) => ({ ...l, file: f.path })));
  const listenerClasses = new Set(listens.map((l) => key(l.listener.name)));
  for (const l of listens) at(l.file).entries!.push({ kind: "observer", label: l.event, files: [], fn: l.method, type: l.listener, line: l.line, col: l.col });
  for (const command of classes.filter((c) => code.extends(c, COMMAND))) readCommand(command, at(command.file));
  for (const job of classes.filter((c) => code.implements(c, SHOULD_QUEUE) && !listenerClasses.has(key(c.qualified)))) {
    const handle = code.method(job.qualified, "handle");
    if (!handle) continue;
    const facts = at(job.file);
    facts.entries!.push({ kind: "consumer", label: job.qualified, files: [], fn: handle.decl.name, type: type(job.qualified), line: job.decl.line, col: job.decl.col });
    facts.handlers!.push({ kind: "job", message: job.qualified, handler: type(job.qualified), method: handle.decl.name, line: job.decl.line, col: job.decl.col });
  }
  const commands = commandNames(code, classes);
  for (const file of code.files) {
    if (/^routes\/[^/]+\.php$/.test(file.path) && file.path !== "routes/console.php" && file.path !== "routes/channels.php") readRoutes(code, file, at(file.path));
    if (file.path === "routes/console.php") readConsole(code, file, at(file.path), commands);
    if (file.path === "app/Console/Kernel.php") readKernel(code, file, at(file.path), commands);
    for (const d of dispatchesIn(code, file)) at(file.path).dispatches!.push({ symbol: d.symbol, event: d.event, text: d.call.callee, line: d.call.line, col: d.call.col, endLine: d.call.endLine, endCol: d.call.endCol });
  }
  return [...out.values()].filter(hasFacts).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)).map((facts) => ({ facts, owner: facts.path }));
}

/** A service provider: its `$bindings`, `$singletons`, `$listen`, `$subscribe` and the container calls of its methods. */
function readProvider(code: PhpCode, provider: PhpClass, facts: ConfigFacts, keyed: Map<string, string>): void {
  for (const prop of provider.decl.properties ?? []) {
    if (prop.name === "bindings" || prop.name === "singletons") {
      for (const item of prop.value.kind === "array" ? prop.value.items : []) bind(facts, keyed, item.key, item.value, prop, `$${prop.name}`);
    } else if (prop.name === "listen") {
      for (const item of prop.value.kind === "array" ? prop.value.items : []) {
        const event = eventName(item.key);
        if (event === null) continue;
        const listeners = item.value.kind === "array" ? item.value.items.map((i) => i.value) : [item.value];
        for (const listener of listeners) listen(code, provider.file, facts, event, listener, prop);
      }
    } else if (prop.name === "subscribe") {
      for (const item of prop.value.kind === "array" ? prop.value.items : []) {
        const subscriber = cls(item.value);
        if (subscriber !== null) subscribe(code, subscriber, facts, prop);
      }
    }
  }
  for (const member of provider.decl.members) {
    for (const call of member.calls) {
      const parts = call.callee.split(".");
      if (parts.length === 3 && parts[0] === "this" && parts[1] === "app" && BIND_METHODS.has(parts[2]!.toLowerCase())) {
        bind(facts, keyed, arg(call.args, "abstract", 0), arg(call.args, "concrete", 1), call, `$this->app->${parts[2]}()`);
      } else if (call.chain?.[0]?.name.toLowerCase() === "when" && call.chain.at(-1)?.name.toLowerCase() === "give" && call.callee.startsWith("$this->app->when")) {
        facts.holes!.push({ line: call.line, col: call.col, text: call.callee, reason: "a contextual binding (`when()->needs()->give()`) gives one class a value of its own; keylang does not read it" });
      } else if (parts.length === 2 && isOneOf(code.calleeClass(provider.file, call.callee), EVENT) && parts[1]!.toLowerCase() === "listen") {
        const event = eventName(arg(call.args, null, 0));
        const listener = arg(call.args, null, 1);
        if (event !== null && listener !== null) listen(code, provider.file, facts, event, listener, call);
      }
    }
  }
}

/** One binding of a provider: `I::class => C::class`, `bind(I::class, C::class)`; a string key is the container's name for the class. */
function bind(facts: ConfigFacts, keyed: Map<string, string>, abstract: LiteralFact | null, concrete: LiteralFact | null, at: { line: number; col: number }, written: string): void {
  const from = cls(abstract) ?? null;
  const name = str(abstract);
  const to = cls(concrete);
  if (to !== null && from !== null) {
    if (key(from) !== key(to)) facts.bindings.push({ from: type(from), to: type(to), line: at.line, col: at.col });
  } else if (to !== null && name !== null) keyed.set(name, to);
  else if (concrete === null) return;
  else if (from !== null || name !== null) {
    const what = from ?? name!;
    const reason = concrete.kind === "closure" ? `\`${written}\` binds \`${what}\` to a closure: the class it builds is code keylang does not read` : `\`${written}\` binds \`${what}\` to an expression keylang does not read`;
    facts.holes!.push({ line: at.line, col: at.col, text: written, reason });
  }
}

/** A listener of `$listen` or `Event::listen`: `L::class` (its `handle`), `[L::class, 'm']`, `'L@m'`. */
function listen(code: PhpCode, file: string, facts: ConfigFacts, event: string, listener: LiteralFact, at: { line: number; col: number }): void {
  const add = (cls: string, method: string): void => {
    const fact: ListenFact = { event, listener: type(cls), method, line: at.line, col: at.col };
    if (!(facts.listens ?? []).some((l) => l.event === fact.event && key(l.listener.name) === key(cls) && l.method === method)) facts.listens!.push(fact);
  };
  if (listener.kind === "class") return add(listener.name, code.method(listener.name, "handle") || !code.method(listener.name, "__invoke") ? "handle" : "__invoke");
  if (listener.kind === "array" && listener.items.length === 2 && listener.items[0]!.value.kind === "class" && listener.items[1]!.value.kind === "string") return add(listener.items[0]!.value.name, listener.items[1]!.value.value);
  if (listener.kind === "string") {
    const [name, method] = listener.value.split("@");
    if (name && /^\\?[A-Za-z_][A-Za-z0-9_\\]*$/.test(name)) return add(name.replace(/^\\+/, ""), method || "handle");
  }
  facts.holes!.push({ line: at.line, col: at.col, text: event, reason: `a listener of \`${event}\` is an expression keylang does not read (in \`${file}\`)` });
}

/** A subscriber of `$subscribe`: the array its `subscribe()` returns (`[OrderPlaced::class => 'handleOrder']`); otherwise a hole. */
function subscribe(code: PhpCode, subscriber: string, facts: ConfigFacts, at: { line: number; col: number }): void {
  const method = code.method(subscriber, "subscribe");
  const returned = method?.decl.returns;
  if (returned?.kind !== "array") {
    facts.holes!.push({ line: at.line, col: at.col, text: subscriber, reason: `the subscriber \`${subscriber}\` registers its listeners in \`subscribe()\` code keylang does not read` });
    return;
  }
  for (const item of returned.items) {
    const event = eventName(item.key);
    const handler = str(item.value);
    if (event !== null && handler !== null) facts.listens!.push({ event, listener: type(subscriber), method: handler, line: at.line, col: at.col });
  }
}

/** A facade of the repository: `getFacadeAccessor()` returns the class it stands for, or the container key a provider binds. */
function readFacade(code: PhpCode, facade: PhpClass, facts: ConfigFacts, keyed: Map<string, string>): void {
  const accessor = code.method(facade.qualified, "getFacadeAccessor");
  if (!accessor) return;
  const returned = accessor.decl.returns;
  const target = cls(returned) ?? (str(returned) !== null ? (keyed.get(str(returned)!) ?? null) : null);
  if (target !== null) {
    facts.bindings.push({ from: type(facade.qualified), to: type(target), line: accessor.decl.line, col: accessor.decl.col });
    return;
  }
  const what = str(returned) !== null ? `the container key \`${str(returned)}\`, which no service provider binds to a class` : "an expression keylang does not read";
  facts.holes!.push({ line: accessor.decl.line, col: accessor.decl.col, text: `${facade.name}::getFacadeAccessor`, reason: `the facade \`${facade.qualified}\` stands for ${what}` });
}

/** An Artisan command class: its `$signature` (or `$name`, `#[AsCommand]`) names it; `handle` runs. */
function readCommand(command: PhpClass, facts: ConfigFacts): void {
  const name = commandName(command);
  const handle = command.decl.members.find((m) => key(m.name) === "handle");
  if (name === null || !handle) return;
  facts.entries!.push({ kind: "cli", label: name, files: [], fn: handle.name, type: type(command.qualified), line: command.decl.line, col: command.decl.col });
}

function commandName(command: PhpClass): string | null {
  const prop = (command.decl.properties ?? []).find((p) => p.name === "signature" || p.name === "name");
  const fromProp = str(prop?.value);
  const attribute = (command.decl.attributes ?? []).find((a) => key(a.name) === key(AS_COMMAND));
  const written = fromProp ?? str(arg(attribute?.args, "name", 0));
  const name = written?.trim().split(/\s+/)[0];
  return name ? name : null;
}

/** Command name → its class, for the schedule. */
function commandNames(code: PhpCode, classes: readonly PhpClass[]): Map<string, PhpClass> {
  const out = new Map<string, PhpClass>();
  for (const c of classes) {
    if (!code.extends(c, COMMAND)) continue;
    const name = commandName(c);
    if (name !== null && !out.has(name)) out.set(name, c);
  }
  return out;
}

interface Group {
  prefix: string[];
  controller: string | null;
}

/**
 * The routes of `routes/web.php`, `routes/api.php` (under `/api`) and the
 * other route files: `Route::get|post|put|patch|delete|options|any|match`,
 * `Route::resource`/`apiResource`, inside `Route::prefix(…)->group(fn)`,
 * `Route::group(['prefix' => …], fn)` and `Route::controller(C::class)->group(fn)`.
 */
function readRoutes(code: PhpCode, file: FileFacts, facts: ConfigFacts): void {
  const groups = new Map<string, Group>();
  const position = (p: { line: number; col: number }): string => `${p.line}:${p.col}`;
  const isRoute = (call: CallFact): boolean => (call.chain ? isOneOf(call.chain[0]!.class, ROUTE) : isOneOf(code.calleeClass(file.path, call.callee), ROUTE));
  const links = (call: CallFact) => call.chain ?? [{ name: call.callee.slice(call.callee.lastIndexOf(".") + 1), args: call.args ?? [] }];
  for (const call of file.moduleCalls) {
    if (!isRoute(call)) continue;
    const chain = links(call);
    const last = chain.at(-1)!;
    if (last.name.toLowerCase() !== "group") continue;
    const group: Group = { prefix: [], controller: null };
    for (const link of chain) {
      const first = link.args.find((a) => a.name === undefined)?.value ?? null;
      if (link.name === "prefix") group.prefix.push(str(first) ?? "");
      if (link.name === "controller") group.controller = cls(first);
      if (link.name.toLowerCase() === "group" && first?.kind === "array") {
        for (const item of first.items) {
          if (str(item.key) === "prefix") group.prefix.push(str(item.value) ?? "");
          if (str(item.key) === "controller") group.controller = cls(item.value);
        }
      }
    }
    const closure = last.args.map((a) => a.value).find((v) => v.kind === "closure");
    if (closure?.kind === "closure") groups.set(position(closure), group);
  }
  const base = file.path === "routes/api.php" ? ["api"] : [];
  for (const call of file.moduleCalls) {
    if (!isRoute(call)) continue;
    const chain = links(call);
    const last = chain.at(-1)!;
    const verb = last.name.toLowerCase();
    if (!(verb in VERBS) && verb !== "match" && verb !== "resource" && verb !== "apiresource") continue;
    const enclosing = (call.closures ?? (call.closureArg ? [call.closureArg] : [])).map((p) => groups.get(position(p))).filter((g): g is Group => g !== undefined);
    const prefix = [...base, ...enclosing.flatMap((g) => g.prefix), ...chain.slice(0, -1).filter((l) => l.name === "prefix").map((l) => str(l.args[0]?.value) ?? "")];
    const controller = enclosing.map((g) => g.controller).filter((c) => c !== null).at(-1) ?? null;
    if (verb === "resource" || verb === "apiresource") {
      resource(code, facts, call, prefix, last.args, verb === "apiresource", chain);
      continue;
    }
    const methods = verb === "match" ? strings(arg(last.args, "methods", 0)).map((m) => m.toUpperCase()) : VERBS[verb]!;
    const uri = str(arg(last.args, "uri", verb === "match" ? 1 : 0));
    if (uri === null) {
      facts.holes!.push({ line: call.line, col: call.col, text: call.callee, reason: "a route whose path is an expression keylang does not read" });
      continue;
    }
    const path = joinPath([...prefix, uri]);
    const action = arg(last.args, "action", verb === "match" ? 2 : 1);
    const handler = routeAction(action, controller);
    for (const method of methods.length > 0 ? methods : [null]) {
      const label = method === null ? path : `${method} ${path}`;
      if ("reason" in handler) {
        facts.holes!.push({ line: call.line, col: call.col, text: call.callee, reason: `route \`${label}\`: ${handler.reason}` });
        continue;
      }
      const entry: EntryConfigFact = { kind: "route", label, files: handler.type === null ? [file.path] : [], fn: handler.fn, line: call.line, col: call.col, ...(handler.type !== null ? { type: type(handler.type) } : {}), ...(method !== null ? { method } : {}), ...(handler.note ? { note: handler.note } : {}) };
      facts.entries!.push(entry);
    }
  }
}

/** The controller method a route action names; a closure is the route file's own code. */
function routeAction(action: LiteralFact | null, controller: string | null): { type: string | null; fn: string | null; note?: string } | { reason: string } {
  if (action === null) return { reason: "the route names no action" };
  if (action.kind === "array" && action.items.length === 2 && action.items[0]!.value.kind === "class" && action.items[1]!.value.kind === "string") return { type: action.items[0]!.value.name, fn: action.items[1]!.value.value };
  if (action.kind === "class") return { type: action.name, fn: "__invoke" };
  if (action.kind === "closure") return { type: null, fn: null, note: "handler written in place: the route file stands for it" };
  if (action.kind === "string" && controller !== null && !action.value.includes("@")) return { type: controller, fn: action.value };
  if (action.kind === "string") return { reason: `the action \`${action.value}\` names its controller by the namespace a route provider sets, which keylang does not read` };
  return { reason: "the action is an expression keylang does not read" };
}

/** `Route::resource('photos', C::class)`: one route per action the controller declares, `->only([…])`/`->except([…])` applied. */
function resource(code: PhpCode, facts: ConfigFacts, call: CallFact, prefix: string[], args: CallFact["args"] & {}, api: boolean, chain: { name: string; args: NonNullable<CallFact["args"]> }[]): void {
  const name = str(arg(args, "name", 0));
  const controller = cls(arg(args, "controller", 1));
  if (name === null || controller === null) {
    facts.holes!.push({ line: call.line, col: call.col, text: call.callee, reason: "a resource route whose name or controller is an expression keylang does not read" });
    return;
  }
  const only = chain.find((l) => l.name === "only");
  const except = chain.find((l) => l.name === "except");
  const kept = (action: string): boolean => (only ? strings(only.args[0]?.value).includes(action) : true) && !(except && strings(except.args[0]?.value).includes(action));
  // Laravel names the parameter by the singular of the last segment (`photos` → `{photo}`).
  const last = name.split(".").at(-1)!;
  const param = singular(last.replace(/-/g, "_"));
  const segments = name.split(".").map((segment, i, all) => (i < all.length - 1 ? `${segment}/{${singular(segment)}}` : segment));
  for (const [action, tail, methods] of RESOURCE_ACTIONS) {
    if (api && (action === "create" || action === "edit")) continue;
    if (!kept(action) || !code.method(controller, action)) continue;
    const path = joinPath([...prefix, ...segments, tail.replace("{param}", `{${param}}`)]);
    for (const method of methods) facts.entries!.push({ kind: "route", label: `${method} ${path}`, files: [], fn: action, type: type(controller), method, line: call.line, col: call.col });
  }
}

/** The singular Laravel's `Str::singular` gives the regular plurals of a resource name. */
function singular(word: string): string {
  if (/ies$/.test(word)) return `${word.slice(0, -3)}y`;
  if (/(ss|us)$/.test(word)) return word;
  if (/(x|ch|sh|ss)es$/.test(word)) return word.slice(0, -2);
  if (/s$/.test(word)) return word.slice(0, -1);
  return word;
}

function joinPath(parts: readonly string[]): string {
  const segments = parts.flatMap((p) => p.split("/")).filter((s) => s !== "");
  return `/${segments.join("/")}`;
}

/** `routes/console.php`: `Artisan::command('name', fn)` is a command; `Schedule::command|job|call(…)` the schedule. */
function readConsole(code: PhpCode, file: FileFacts, facts: ConfigFacts, commands: ReadonlyMap<string, PhpClass>): void {
  for (const call of file.moduleCalls) {
    if (call.chain) continue;
    const holder = code.calleeClass(file.path, call.callee);
    const method = call.callee.slice(call.callee.lastIndexOf(".") + 1).toLowerCase();
    if (isOneOf(holder, ARTISAN) && method === "command") {
      const name = str(arg(call.args, "signature", 0))?.trim().split(/\s+/)[0];
      if (name) facts.entries!.push({ kind: "cli", label: name, files: [file.path], fn: null, note: "closure command: the console route file stands for it", line: call.line, col: call.col });
    } else if (isOneOf(holder, SCHEDULE_FACADE)) schedule(facts, file.path, call, method, commands);
  }
}

/** `Kernel::schedule(Schedule $schedule)`: `$schedule->command|job|call(…)`. */
function readKernel(code: PhpCode, file: FileFacts, facts: ConfigFacts, commands: ReadonlyMap<string, PhpClass>): void {
  for (const { call, symbol } of callsOf(file)) {
    if (symbol === null || !call.receiver || key(code.qualified(file.path, call.receiver)) !== key(SCHEDULE)) continue;
    schedule(facts, file.path, call, call.callee.slice(call.callee.lastIndexOf(".") + 1).toLowerCase(), commands);
  }
}

function schedule(facts: ConfigFacts, file: string, call: CallFact, method: string, commands: ReadonlyMap<string, PhpClass>): void {
  const first = arg(call.args, null, 0);
  if (method === "command") {
    const command = first?.kind === "class" ? ([...commands.values()].find((c) => key(c.qualified) === key(first.name)) ?? null) : commands.get(str(first)?.trim().split(/\s+/)[0] ?? "") ?? null;
    const label = first?.kind === "class" ? first.name : (str(first)?.trim() ?? "?");
    const handle = command?.decl.members.find((m) => key(m.name) === "handle");
    if (command && handle) facts.entries!.push({ kind: "cron", label, files: [], fn: handle.name, type: type(command.qualified), line: call.line, col: call.col });
    else facts.holes!.push({ line: call.line, col: call.col, text: call.callee, reason: `the schedule runs the command \`${label}\`, which no command class of the analysed files declares` });
  } else if (method === "job") {
    const job = first?.kind === "new" || first?.kind === "class" ? first.name : null;
    if (job !== null) facts.entries!.push({ kind: "cron", label: job, files: [], fn: "handle", type: type(job), line: call.line, col: call.col });
    else facts.holes!.push({ line: call.line, col: call.col, text: call.callee, reason: "the schedule runs a job keylang does not read" });
  } else if (method === "call") {
    if (first?.kind === "closure") facts.entries!.push({ kind: "cron", label: `${posix.basename(file)}:${call.line}`, files: [file], fn: null, note: "scheduled closure: the file stands for it", line: call.line, col: call.col });
    else if (first?.kind === "array" && first.items.length === 2 && first.items[0]!.value.kind === "class" && first.items[1]!.value.kind === "string") facts.entries!.push({ kind: "cron", label: `${first.items[0]!.value.name}::${first.items[1]!.value.value}`, files: [], fn: first.items[1]!.value.value, type: type(first.items[0]!.value.name), line: call.line, col: call.col });
    else facts.holes!.push({ line: call.line, col: call.col, text: call.callee, reason: "the schedule calls an expression keylang does not read" });
  }
}
