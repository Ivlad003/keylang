// Framework adapters (ADR 0022): beside the language frontends, an adapter
// reads the configuration a framework executes (`etc/di.xml` of Magento) and
// gives the graph facts the code does not write — bindings of an interface to
// a class, constructor arguments, interceptors. The adapter only parses; the
// graph applies the facts the same way for every language (`src/graph.ts`).
//
// An adapter is detected from the analysed files, or named in `frameworks` of
// `keylang.json` (`[]` turns every adapter off). Its config files are inputs
// of the snapshot: listed in `manifest.frameworks`, part of `snapshotId` and
// cached by content in the fact cache, so a changed `di.xml` is a new snapshot.
// A framework that wires in code (Laravel, Symfony attributes) also has a
// reader of the extractor's facts in `src/framework-code/`, beside the graph.

import { laravel } from "./laravel.ts";
import { magento } from "./magento.ts";
import { celery, django, fastapi, flask } from "./python-web.ts";
import { sfcc } from "./sfcc.ts";
import { symfony } from "./symfony.ts";

/**
 * A type the configuration names: a qualified name of a language whose
 * declarations have one (PHP `Magento\Sales\Api\OrderManagementInterface`,
 * without the leading `\`), or a name declared at the top of `file`.
 */
export interface TypeName {
  name: string;
  file?: string;
}

/** Where in the config file a fact is written: 1-based. */
export interface ConfigAt {
  line: number;
  col: number;
}

/** `I → C`: a value typed `from` is an instance of `to` (Magento `<preference>`). */
export interface BindingFact extends ConfigAt {
  from: TypeName;
  to: TypeName;
}

/**
 * The constructor parameter `param` of `type` receives an instance of `value`
 * (Magento `<argument xsi:type="object">`). A `type` named `*` (`EVERY_CLASS`)
 * is every class: Symfony `_defaults: bind: $p: '@C'`.
 */
export interface ArgumentFact extends ConfigAt {
  type: TypeName;
  param: string;
  value: TypeName;
}

/** `name` stands for the class `type` with arguments of its own (Magento `<virtualType>`). */
export interface AliasFact extends ConfigAt {
  name: string;
  type: TypeName;
}

/** A plugin `name` of the class `plugin` wraps the public methods of `target` (Magento `<plugin>`). */
export interface InterceptFact extends ConfigAt {
  target: TypeName;
  name: string;
  /** Null for a declaration that only disables or reorders a plugin declared elsewhere. */
  plugin: TypeName | null;
  sortOrder: number | null;
  disabled: boolean;
}

/** The kinds of entry point a config names. */
export const ENTRY_CONFIG_KINDS = ["route", "observer", "cron", "consumer", "cli"] as const;

/**
 * An observer `name` of the event `event`: the framework calls `method` of
 * `instance` when code dispatches the event (Magento `etc/events.xml`
 * `<event name><observer name instance method? disabled?>`).
 */
export interface ObserverFact extends ConfigAt {
  event: string;
  name: string;
  /** Null for a declaration that only disables an observer declared elsewhere. */
  instance: TypeName | null;
  /** Null: the framework's default (`execute`). */
  method: string | null;
  disabled: boolean;
  /** `false`: no `observer` entry point — another entry stands for the fn (a queued job's `consumer`). */
  entry?: false;
}

/** Entry kinds an adapter writes straight from a config line (`route` needs the controllers, `observer` the events). */
export type ConfigEntryKind = "rest" | "graphql" | "cron" | "consumer" | "cli";

/**
 * An entry point the config names: the framework calls `method` of `target`
 * from outside (a REST route, a GraphQL resolver, a cron job, a queue
 * consumer, a console command). `label` is how the outside names it.
 */
export interface EntryFact extends ConfigAt {
  kind: ConfigEntryKind;
  label: string;
  target: TypeName;
  method: string;
}

/**
 * A router of the framework: URLs under `/<frontName>/` run the controllers
 * of `modules` (Magento `etc/<area>/routes.xml`
 * `<router id><route id frontName><module name/>`).
 */
export interface RouteFact extends ConfigAt {
  router: string;
  id: string;
  frontName: string;
  /** Module names as the framework registers them (`Magento_Checkout`), in config order. */
  modules: string[];
}

/**
 * An entry point a config file names (SFCC `hooks.json` → `observer`,
 * `steptypes.json` → `cron`): the script it runs, as the paths the framework
 * would try in order (each probed with the usual extensions and `index`), and
 * the fn in it, if the config names one. A PHP framework names a class
 * instead (`type`, Laravel `Route::get('/x', [C::class, 'm'])`): `fn` is its
 * method and `files` is empty. The snapshot places it on the graph
 * (`src/framework-entries.ts`); a script or class it cannot place is a hole.
 */
export interface EntryConfigFact extends ConfigAt {
  kind: (typeof ENTRY_CONFIG_KINDS)[number];
  label: string;
  files: string[];
  fn: string | null;
  /** The class whose method `fn` is, by its qualified name. */
  type?: TypeName;
  /** The HTTP method a route answers (`GET`, `POST`). */
  method?: string;
  /** What keylang could not name about it: the module stands for a handler written in place. */
  note?: string;
}

/**
 * A call in the code that dispatches an event or a message object
 * (`event(new X)`, `$bus->dispatch(new X)`), in the declaration `symbol` of
 * the file: an edge `via: "dispatch"` from that fn to the event `event`,
 * named by the class (or the string a Symfony dispatch passes as its name).
 */
export interface DispatchFact extends ConfigAt {
  symbol: string;
  event: string;
  text: string;
  endLine: number;
  endCol: number;
}

/** Something the config writes that keylang does not read (a binding to a closure, an expression): a hole of the file with the reason. */
export interface ConfigHole extends ConfigAt {
  text: string;
  reason: string;
}

/** Symfony `config/routes.yaml`: the routes of the attributes of classes under `dir` have `prefix` before their path. */
export interface RoutePrefixFact extends ConfigAt {
  dir: string;
  prefix: string;
}

/** The facts of one config file. Depends only on its path and text, so the fact cache keeps it. */
export interface ConfigFacts {
  path: string;
  /** Where the facts apply: `global`, or an area of the framework (`frontend`, `adminhtml`, `webapi_rest`). */
  scope: string;
  bindings: BindingFact[];
  arguments: ArgumentFact[];
  aliases: AliasFact[];
  intercepts: InterceptFact[];
  /** Observers of events (Magento `events.xml`); absent for a framework whose configs name none. */
  observers?: ObserverFact[];
  /** Entry points as a class and a method (Magento `webapi.xml`, `crontab.xml`, …); absent likewise. */
  classEntries?: EntryFact[];
  /** Routers whose controllers are entry points (Magento `routes.xml`); absent likewise. */
  routes?: RouteFact[];
  /** Entry points the file names; absent for a framework whose configs name none. */
  entries?: EntryConfigFact[];
  /** Calls of the code that dispatch an event or a message. */
  dispatches?: DispatchFact[];
  /** What the file writes that keylang does not read. */
  holes?: ConfigHole[];
  /** Prefixes of attribute routes. */
  routePrefixes?: RoutePrefixFact[];
  /** Why the file gave no facts: it does not parse. */
  error: { line: number; reason: string } | null;
}

/** One config file of an active adapter, with the directory of the module that declares it. */
export interface FrameworkConfig {
  facts: ConfigFacts;
  /** The framework module the config belongs to (POSIX, relative), whose code owns the edges it makes; null when none does. */
  owner: string | null;
}

/** A module of the framework, by the name its config uses (`Magento_Checkout`), and its directory. */
export interface FrameworkModule {
  name: string;
  dir: string;
}

/** What the graph receives from one active adapter. */
export interface FrameworkInput {
  name: string;
  configs: FrameworkConfig[];
  /** The framework's modules: where a route's controllers are. */
  modules?: FrameworkModule[];
  /**
   * Qualified names of the types whose `dispatch(name, …)` publishes the event
   * `name` (Magento `Magento\Framework\Event\ManagerInterface` and its classes):
   * a call of it through a value of one of them, or of a class implementing one, is an edge to the event.
   */
  dispatchers?: string[];
  /** Where the framework keeps the controllers of a route. */
  controllers?: ControllerConvention;
}

/** What an adapter sees of the repository: the analysed source files and a reader. */
export interface FrameworkContext {
  /** Analysed source files, POSIX, relative to the root, sorted. */
  sources: readonly string[];
  /** A file's text, relative to the root; null when it is missing or unreadable. */
  read(path: string): string | null;
  /** Names of the subdirectories of a directory, relative to the root, sorted; none when it is missing. */
  dirs(path: string): string[];
  /** A path keylang reads at all: not excluded, outside the architecture or assumed. */
  analysed(path: string): boolean;
}

export interface FrameworkAdapter {
  /** The name in `frameworks` of `keylang.json` and in `manifest.frameworks`. */
  name: string;
  /** Version of what `parse` gives: part of the fact-cache key and `snapshotId`. */
  version: string;
  /** The repository uses the framework. */
  detect(context: FrameworkContext): boolean;
  /** Config files the framework executes, sorted, each with the module that owns it. */
  files(context: FrameworkContext): { path: string; owner: string | null }[];
  /** The facts of one config file. */
  parse(path: string, text: string): ConfigFacts;
  /** The framework's modules by name, for the controllers of a route. */
  modules?(context: FrameworkContext): FrameworkModule[];
  /** Types whose `dispatch` publishes an event; see `FrameworkInput.dispatchers`. */
  dispatchers?: readonly string[];
  /** URL path of a controller for a route (`Controller/Cart/Add.php` of `checkout` → `/checkout/cart/add`), and the HTTP methods of interfaces it implements. */
  controllers?: ControllerConvention;
}

/**
 * Where a framework keeps the controllers of a route and how it names their
 * URLs: a controller is a class in a file under `<module dir>/<dir>/`, whose
 * `member` runs; the HTTP method comes from the interfaces it implements.
 */
export interface ControllerConvention {
  /** The directory of controllers in a module, by area (`frontend` → `Controller`, `adminhtml` → `Controller/Adminhtml`). */
  dir(area: string): string;
  /** The URL prefix of an area (`adminhtml` → `/admin`), empty for none. */
  prefix(area: string): string;
  member: string;
  /** Qualified interface name → HTTP method. */
  methods: Readonly<Record<string, string>>;
}

/** The type name of an argument fact that applies to the constructor of every class. */
export const EVERY_CLASS = "*";

/** `text` of a coverage entry for a framework's config keylang did not read (`framework:magento`): the framework may call any fn by it. */
export const FRAMEWORK_CONFIG = "framework:";

/** Adapters keylang has, by name. */
export const FRAMEWORK_ADAPTERS: readonly FrameworkAdapter[] = [laravel, magento, sfcc, symfony, django, fastapi, flask, celery];

export const FRAMEWORK_NAMES: readonly string[] = FRAMEWORK_ADAPTERS.map((a) => a.name).sort();

/**
 * The adapters of a repository: those `frameworks` names, or with the field
 * absent those detected. `available` lets a test add an adapter of its own.
 */
export function activeAdapters(frameworks: readonly string[] | null, context: FrameworkContext, available: readonly FrameworkAdapter[] = FRAMEWORK_ADAPTERS): FrameworkAdapter[] {
  if (frameworks !== null) return available.filter((a) => frameworks.includes(a.name));
  return available.filter((a) => a.detect(context));
}

/** A label for a type the configuration names: its qualified name, or `file#name`. */
export function typeLabel(t: TypeName): string {
  return t.file === undefined ? t.name : `${t.file}#${t.name}`;
}

/** Whether a cached value has the shape of `ConfigFacts`; a cache entry of another shape is parsed again. */
export function isConfigFacts(value: unknown): value is ConfigFacts {
  if (!isRecord(value)) return false;
  return (
    typeof value.path === "string" &&
    typeof value.scope === "string" &&
    every(value.bindings, (b) => isAt(b) && isTypeName(b.from) && isTypeName(b.to)) &&
    every(value.arguments, (a) => isAt(a) && isTypeName(a.type) && typeof a.param === "string" && isTypeName(a.value)) &&
    every(value.aliases, (a) => isAt(a) && typeof a.name === "string" && isTypeName(a.type)) &&
    every(value.intercepts, (i) => isAt(i) && isTypeName(i.target) && typeof i.name === "string" && (i.plugin === null || isTypeName(i.plugin)) && (i.sortOrder === null || typeof i.sortOrder === "number") && typeof i.disabled === "boolean") &&
    (value.observers === undefined || every(value.observers, (o) => isAt(o) && typeof o.event === "string" && typeof o.name === "string" && (o.instance === null || isTypeName(o.instance)) && (o.method === null || typeof o.method === "string") && typeof o.disabled === "boolean")) &&
    (value.classEntries === undefined || every(value.classEntries, (e) => isAt(e) && typeof e.kind === "string" && typeof e.label === "string" && isTypeName(e.target) && typeof e.method === "string")) &&
    (value.routes === undefined || every(value.routes, (r) => isAt(r) && typeof r.router === "string" && typeof r.id === "string" && typeof r.frontName === "string" && Array.isArray(r.modules) && r.modules.every((m) => typeof m === "string"))) &&
    (value.entries === undefined || every(value.entries, (e) => isAt(e) && (ENTRY_CONFIG_KINDS as readonly unknown[]).includes(e.kind) && typeof e.label === "string" && Array.isArray(e.files) && e.files.every((f) => typeof f === "string") && (e.fn === null || typeof e.fn === "string") && (e.type === undefined || isTypeName(e.type)) && (e.method === undefined || typeof e.method === "string") && (e.note === undefined || typeof e.note === "string"))) &&
    (value.dispatches === undefined || every(value.dispatches, (d) => isAt(d) && typeof d.symbol === "string" && typeof d.event === "string" && typeof d.text === "string")) &&
    (value.holes === undefined || every(value.holes, (h) => isAt(h) && typeof h.text === "string" && typeof h.reason === "string")) &&
    (value.routePrefixes === undefined || every(value.routePrefixes, (r) => isAt(r) && typeof r.dir === "string" && typeof r.prefix === "string")) &&
    (value.error === null || (isRecord(value.error) && typeof value.error.line === "number" && typeof value.error.reason === "string"))
  );
}

function isAt(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && Number.isInteger(value.line) && Number.isInteger(value.col);
}

function isTypeName(value: unknown): boolean {
  return isRecord(value) && typeof value.name === "string" && (value.file === undefined || typeof value.file === "string");
}

function every(value: unknown, check: (item: Record<string, unknown>) => boolean): boolean {
  return Array.isArray(value) && value.every((item) => isRecord(item) && check(item));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
