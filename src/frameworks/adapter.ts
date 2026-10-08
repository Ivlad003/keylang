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
// A framework that writes its configuration in the code (NestJS decorators)
// reads it from the extractor's facts of those files (`code`) instead.

import type { FileFacts } from "../extract/facts.ts";
import { magento } from "./magento.ts";
import { nestjs } from "./nestjs.ts";
import { sfcc } from "./sfcc.ts";

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

/** The constructor parameter `param` of `type` receives an instance of `value` (Magento `<argument xsi:type="object">`). */
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

/**
 * An entry point a config file names (SFCC `hooks.json` → `observer`,
 * `steptypes.json` → `cron`): the script it runs, as the paths the framework
 * would try in order (each probed with the usual extensions and `index`), and
 * the fn in it, if the config names one. The snapshot places it on the graph
 * (`src/framework-entries.ts`); a script no candidate names is a hole.
 */
export interface EntryConfigFact extends ConfigAt {
  kind: "observer" | "cron";
  label: string;
  files: string[];
  fn: string | null;
}

/** A provider token as the code writes it: a string, or a name (a const, a class) written in `file`. */
export type TokenRef = { kind: "string"; value: string } | { kind: "name"; name: string; file: string };

/**
 * A module provides `token` (NestJS `providers`): a class (`useClass`, a
 * class provider `[C]`), what another token provides (`useExisting`), or a
 * value keylang cannot name (`useFactory`, `useValue`).
 */
export interface ProviderFact extends ConfigAt {
  token: TokenRef;
  use: { kind: "class"; type: TypeName } | { kind: "existing"; token: TokenRef } | { kind: "factory" } | { kind: "value" };
}

/** The constructor parameter `param` of `type` receives what `token` provides (NestJS `@Inject(T)`). */
export interface InjectionFact extends ConfigAt {
  type: TypeName;
  param: string;
  token: TokenRef;
}

/** The method `method` of `type` runs when the event `event` is emitted (NestJS `@OnEvent('e')`). */
export interface ListenerFact extends ConfigAt {
  event: string;
  type: TypeName;
  method: string;
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
  /** Entry points the file names; absent for a framework whose configs name none. */
  entries?: EntryConfigFact[];
  /** Tokens the file's modules provide; absent for a framework without tokens. */
  providers?: ProviderFact[];
  /** Constructor parameters that receive a token's value. */
  injections?: InjectionFact[];
  /** Methods that run when an event is emitted. */
  listeners?: ListenerFact[];
  /** Why the file gave no facts: it does not parse. */
  error: { line: number; reason: string } | null;
}

/** One config file of an active adapter, with the directory of the module that declares it. */
export interface FrameworkConfig {
  facts: ConfigFacts;
  /** The framework module the config belongs to (POSIX, relative), whose code owns the edges it makes; null when none does. */
  owner: string | null;
}

/** What the graph receives from one active adapter. */
export interface FrameworkInput {
  name: string;
  configs: FrameworkConfig[];
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
  /**
   * For a framework whose configuration is written in the code (NestJS
   * decorators): the facts of a config file that is an analysed source,
   * from what the extractor recorded of it (`DeclFact.decorators`). Such a
   * file is not parsed again; its facts are cached with the file's.
   */
  code?(path: string, file: FileFacts): ConfigFacts;
}

/** `text` of a coverage entry for a framework's config keylang did not read (`framework:magento`): the framework may call any fn by it. */
export const FRAMEWORK_CONFIG = "framework:";

/** Adapters keylang has, by name. */
export const FRAMEWORK_ADAPTERS: readonly FrameworkAdapter[] = [magento, nestjs, sfcc];

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
    (value.entries === undefined || every(value.entries, (e) => isAt(e) && (e.kind === "observer" || e.kind === "cron") && typeof e.label === "string" && Array.isArray(e.files) && e.files.every((f) => typeof f === "string") && (e.fn === null || typeof e.fn === "string"))) &&
    (value.providers === undefined || every(value.providers, (p) => isAt(p) && isToken(p.token) && isRecord(p.use) && typeof p.use.kind === "string")) &&
    (value.injections === undefined || every(value.injections, (i) => isAt(i) && isTypeName(i.type) && typeof i.param === "string" && isToken(i.token))) &&
    (value.listeners === undefined || every(value.listeners, (l) => isAt(l) && typeof l.event === "string" && isTypeName(l.type) && typeof l.method === "string")) &&
    (value.error === null || (isRecord(value.error) && typeof value.error.line === "number" && typeof value.error.reason === "string"))
  );
}

function isAt(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && Number.isInteger(value.line) && Number.isInteger(value.col);
}

function isToken(value: unknown): boolean {
  return isRecord(value) && ((value.kind === "string" && typeof value.value === "string") || (value.kind === "name" && typeof value.name === "string" && typeof value.file === "string"));
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
