// What a framework calls from outside, by its config (ADR 0022 п. 5–6,
// business-flows 08, 10): observers of events (an edge from the event to the
// observer's fn, and an `observer` entry point), and the entry points a config
// line names — REST routes, GraphQL resolvers, cron jobs, queue consumers,
// console commands — and the controllers of a route. Pure over the adapter's
// facts and lookups the graph lends; a class the config names that the
// snapshot does not have is an entry point with `unresolved` and a hole of the
// config line, never a guess.

import { typeLabel, type ConfigEntryKind, type FrameworkInput, type ObserverFact, type TypeName } from "./adapter.ts";
import type { BindingHole, ResolvedType } from "./bindings.ts";

/** What the graph lends: its declarations by the names a config writes, and how a call through a type goes. */
export interface EntryDeps {
  resolve(type: TypeName): ResolvedType;
  /** The class a config name stands for in an area: a `virtualType` is the class it names. */
  unalias(type: TypeName, scope: string): TypeName;
  isClass(id: string): boolean;
  /** A member of a class (or an interface) by name, its own or a base's. */
  member(classId: string, name: string): string | null;
  /** The classes the config binds the type to, per area, through preferences; null when it binds none. */
  bound(typeId: string, member: string): { targets: { target: string; scope: string }[]; reason: string | null } | null;
  /** The module of a framework module's directory. */
  owner(dir: string | null): string | null;
  /** Qualified names of the interfaces and bases of a class, its own and its bases', as written (lower case). */
  supertypeNames(classId: string): ReadonlySet<string>;
  /** The classes declared in an analysed file, in order. */
  classesIn(file: string): string[];
  /** Where a node is declared. */
  place(id: string): { file: string; line: number } | null;
  /** Analysed source files, sorted. */
  sources: readonly string[];
}

/** An entry point a framework's config names: the shape of the snapshot's `EntryPoint` (ADR 0022 п. 5), for the kinds a config writes. */
export interface ConfigEntry {
  kind: ConfigEntryKind | "route" | "observer";
  id: string;
  label: string;
  framework: string;
  file: string;
  line: number;
  source: string;
  unresolved?: string;
}

/** An edge from an event to the fn an observer runs. */
export interface ObserverEdge {
  /** The event's name, as the config writes it. */
  event: string;
  target: string;
  name: string;
  file: string;
  line: number;
  col: number;
  text: string;
  site: string;
  scope: string;
  owner: string | null;
  binding: string;
}

export interface FrameworkEntries {
  observers: ObserverEdge[];
  /** Event names the configs declare observers for (disabled ones too): event nodes even without a dispatch keylang read. */
  events: { name: string; file: string; line: number; col: number }[];
  entries: ConfigEntry[];
  holes: BindingHole[];
}

const GLOBAL = "global";
/** The area a framework runs an entry kind in: its binding there wins over the global one. */
const ENTRY_AREA: Record<ConfigEntryKind, string> = { rest: "webapi_rest", graphql: "graphql", cron: "crontab", consumer: GLOBAL, cli: GLOBAL };
const HTTP_ORDER = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

interface Declared {
  fact: ObserverFact;
  scope: string;
  file: string;
  owner: string | null;
  /** A global observer: the areas whose config disables it. */
  disabledIn?: string[];
}

export function frameworkEntries(inputs: readonly FrameworkInput[], deps: EntryDeps): FrameworkEntries {
  const out: FrameworkEntries = { observers: [], events: [], entries: [], holes: [] };
  const events: FrameworkEntries["events"] = [];
  for (const input of inputs) {
    const configs = input.configs.filter((c) => c.facts.error === null);
    const observers: Declared[] = [];
    for (const { facts, owner: dir } of configs) {
      const owner = deps.owner(dir);
      for (const fact of facts.observers) {
        events.push({ name: fact.event, file: facts.path, line: fact.line, col: fact.col });
        observers.push({ fact, scope: facts.scope, file: facts.path, owner });
      }
      for (const fact of facts.entries) {
        const at = { file: facts.path, line: fact.line, col: fact.col };
        const text = `${fact.kind} ${fact.label}`;
        const found = target(deps, fact.target, fact.method, facts.scope === GLOBAL ? ENTRY_AREA[fact.kind] : facts.scope);
        out.entries.push(entryOf(deps, input.name, fact.kind, found, fact.label, at));
        if (found.unresolved !== null) out.holes.push({ ...at, text, reason: found.unresolved, source: owner });
      }
    }
    for (const observer of effectiveObservers(observers)) {
      const { fact, scope, file, owner } = observer;
      const method = fact.method ?? "execute";
      const at = { file, line: fact.line, col: fact.col };
      const text = `<observer name="${fact.name}" instance="${fact.instance ? typeLabel(fact.instance) : ""}"${fact.method ? ` method="${fact.method}"` : ""}>`;
      const found = target(deps, fact.instance!, method, scope);
      const label = `${fact.event} (${fact.name}${scope === GLOBAL ? "" : `, ${scope}`})`;
      out.entries.push(entryOf(deps, input.name, "observer", found, label, at));
      if (found.unresolved !== null) {
        out.holes.push({ ...at, text, reason: found.unresolved, source: owner });
        continue;
      }
      out.observers.push({ event: fact.event, target: found.id, name: fact.name, ...at, text, site: `${file}:${fact.line}:${fact.col}`, scope, owner, binding: `observer \`${fact.name}\` (\`${typeLabel(fact.instance!)}::${method}\`) of the event \`${fact.event}\`${observer.disabledIn ? ` (disabled in ${observer.disabledIn.join(", ")})` : ""}` });
    }
    out.entries.push(...controllerEntries(input, deps));
  }
  out.events = events;
  return out;
}

/** The fn a config's class and method stand for: through a preference of the area when the class is an interface the config binds. */
function target(deps: EntryDeps, type: TypeName, method: string, area: string): { id: string; unresolved: string | null } {
  const written = `${typeLabel(type)}::${method}`;
  const resolved = deps.resolve(deps.unalias(type, area));
  if (resolved.kind === "missing") return { id: written, unresolved: `\`${typeLabel(type)}\` is named by the config, but no analysed file declares it` };
  if (resolved.kind === "external") return { id: written, unresolved: `\`${typeLabel(type)}\` belongs to a package keylang does not read` };
  const own = deps.member(resolved.id, method);
  const bound = deps.bound(resolved.id, method);
  if (bound !== null) {
    const targets = [...new Set(bound.targets.filter((t) => t.scope.split(",").includes(area)).map((t) => t.target))];
    const global = [...new Set(bound.targets.filter((t) => t.scope.split(",").includes(GLOBAL)).map((t) => t.target))];
    const chosen = targets.length > 0 ? targets : global;
    if (chosen.length === 1) return { id: chosen[0]!, unresolved: null };
    if (bound.reason !== null || chosen.length > 1) return { id: own ?? resolved.id, unresolved: bound.reason ?? `\`${typeLabel(type)}\` is bound to ${chosen.map((t) => `\`${t}\``).join(" and ")}` };
  }
  if (deps.isClass(resolved.id) && own !== null) return { id: own, unresolved: null };
  if (own !== null) return { id: own, unresolved: `no preference binds \`${typeLabel(type)}\` to a class, so what runs \`${method}\` is unknown` };
  return { id: resolved.id, unresolved: `\`${typeLabel(type)}\` has no method \`${method}\` keylang read` };
}

function entryOf(deps: EntryDeps, framework: string, kind: ConfigEntry["kind"], found: { id: string; unresolved: string | null }, label: string, at: { file: string; line: number }): ConfigEntry {
  const place = deps.place(found.id) ?? at;
  return { kind, id: found.id, label, framework, file: place.file, line: place.line, source: `${at.file}:${at.line}`, ...(found.unresolved !== null ? { unresolved: found.unresolved } : {}) };
}

/**
 * Observers in effect, per event, observer name and area: an area's
 * declaration changes the global one there (Magento merges `etc/<area>/` over
 * `etc/`); one disabled, or one of no class, runs nowhere. An area that only
 * repeats the global observer adds nothing.
 */
function effectiveObservers(declared: readonly Declared[]): Declared[] {
  const out: Declared[] = [];
  const groups = new Map<string, Declared[]>();
  for (const d of declared) {
    const key = `${d.fact.event}\0${d.fact.name}`;
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  const merge = (list: readonly Declared[]): Declared | null => {
    const [first, ...rest] = list;
    if (first === undefined) return null;
    let cur: Declared = first;
    for (const d of rest) {
      const prev: Declared = cur;
      // A later declaration changes what it writes; the site stays the one that names the class.
      cur = d.fact.instance ? { ...d, fact: { ...d.fact, method: d.fact.method ?? prev.fact.method } } : { ...prev, fact: { ...prev.fact, method: d.fact.method ?? prev.fact.method, disabled: d.fact.disabled } };
    }
    return cur;
  };
  for (const list of groups.values()) {
    const global = merge(list.filter((d) => d.scope === GLOBAL));
    const live = (d: Declared | null): d is Declared => d !== null && !d.fact.disabled && d.fact.instance !== null;
    const areas = [...new Set(list.filter((d) => d.scope !== GLOBAL).map((d) => d.scope))].sort();
    const disabledIn: string[] = [];
    for (const area of areas) {
      const effective = merge([...list.filter((d) => d.scope === GLOBAL), ...list.filter((d) => d.scope === area)]);
      if (!live(effective)) {
        if (live(global)) disabledIn.push(area);
        continue;
      }
      if (live(global) && typeLabel(global.fact.instance!) === typeLabel(effective.fact.instance!) && (global.fact.method ?? "execute") === (effective.fact.method ?? "execute")) continue;
      out.push({ ...effective, scope: area });
    }
    if (live(global)) out.push(disabledIn.length > 0 ? { ...global, disabledIn } : global);
  }
  return out.sort((a, b) => (a.fact.event < b.fact.event ? -1 : a.fact.event > b.fact.event ? 1 : 0) || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) || a.fact.line - b.fact.line);
}

/**
 * The controllers of the routes of one framework: every class in a file under
 * `<module dir>/<controller dir>/<Path>/<Action>.php` of a module a route
 * names, labelled `GET|POST /<frontName>/<path>/<action>` by the HTTP
 * interfaces it (or a base) implements, `*` with none.
 */
function controllerEntries(input: FrameworkInput, deps: EntryDeps): ConfigEntry[] {
  const convention = input.controllers;
  if (!convention) return [];
  const out: ConfigEntry[] = [];
  const dirs = new Map<string, string[]>();
  for (const m of input.modules ?? []) dirs.set(m.name, [...(dirs.get(m.name) ?? []), m.dir]);
  const methods = new Map(Object.entries(convention.methods).map(([name, method]) => [asciiLower(name), method]));
  for (const { facts } of input.configs) {
    for (const route of facts.routes) {
      for (const module of route.modules) {
        for (const dir of dirs.get(module) ?? []) {
          const base = `${dir === "" ? "" : `${dir}/`}${convention.dir(facts.scope)}/`;
          // The frontend's controllers do not include the admin's, which live under them.
          const other = facts.scope === "adminhtml" ? null : `${dir === "" ? "" : `${dir}/`}${convention.dir("adminhtml")}/`;
          for (const file of deps.sources) {
            if (!file.startsWith(base) || !file.endsWith(".php") || (other !== null && other !== base && file.startsWith(other))) continue;
            const segments = file.slice(base.length, -".php".length).split("/");
            // A class right in the controller directory is a base of the controllers, not one.
            if (segments.length < 2) continue;
            const action = segments.pop()!;
            const url = `${convention.prefix(facts.scope)}/${route.frontName}/${segments.join("_").toLowerCase()}/${action.toLowerCase()}`;
            for (const cls of deps.classesIn(file)) {
              const execute = deps.member(cls, convention.member);
              if (execute === null) continue;
              const names = deps.supertypeNames(cls);
              const verbs = HTTP_ORDER.filter((verb) => [...names].some((name) => methods.get(name) === verb));
              const place = deps.place(execute) ?? { file, line: 1 };
              out.push({ kind: "route", id: execute, label: `${verbs.length > 0 ? verbs.join("|") : "*"} ${url}`, framework: input.name, file: place.file, line: place.line, source: `${facts.path}:${route.line}` });
            }
          }
        }
      }
    }
  }
  return out;
}

function asciiLower(name: string): string {
  return name.replace(/[A-Z]+/g, (letters) => letters.toLowerCase());
}
