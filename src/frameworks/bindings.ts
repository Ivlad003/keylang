// What the graph does with framework facts (ADR 0022), the same for every
// language: a call through a type the config binds (an interface, or a class
// with a preference of its own) becomes a `call` edge to the bound class's
// member, `via: "preference"`; a call through a property the constructor
// parameter `p` fills, which the config sets for the class, `via: "argument"`;
// and a call of a method a plugin wraps gains edges to the plugin's
// `before`/`around`/`after` methods. Each edge names the config line it rests
// on (`site`), the area it applies in (`scope`) and the module whose config
// declares it (`owner`). Several areas give several edges; two classes for
// one type in one area are an `ambiguous-binding` hole; a class the snapshot
// does not have is a hole with the reason. Nothing is guessed from names.

import { EVERY_CLASS, typeLabel, type FrameworkInput, type ProviderFact, type TokenRef, type TypeName } from "./adapter.ts";

/** What a name of the config stands for in the snapshot. */
export type ResolvedType = { kind: "node"; id: string } | { kind: "external" } | { kind: "missing" };

/** What the graph lends the bindings: lookups over its declarations. */
export interface BindingDeps {
  /** The class or type node a config name stands for. */
  resolve(type: TypeName): ResolvedType;
  isClass(id: string): boolean;
  /** A member of a class by name, its own or a base's; null when none keylang read has it. */
  member(classId: string, name: string): string | null;
  /** The class's chain of bases ends at one keylang has not read, which may declare any member. */
  opaqueBase(classId: string): boolean;
  /** The class's base classes and the interfaces it (or they) implement, transitively. */
  supertypes(id: string): string[];
  /** The module of a framework module's directory; null when the snapshot has none. */
  owner(dir: string | null): string | null;
  /**
   * A provider token's identity: a string by its value, a name by the
   * declaration it stands for (through the file's imports), so a token
   * declared in one file and imported in two others is one token. Null for a
   * name keylang does not resolve.
   */
  token(ref: TokenRef): string | null;
}

export type ConfigVia = "preference" | "argument" | "plugin:before" | "plugin:around" | "plugin:after";

/** One edge a binding makes, before the graph places it at a call. */
export interface BoundEdge {
  target: string;
  /** The class whose member it is: the receiver for the interceptors. */
  impl: string;
  via: "preference" | "argument";
  scope: string;
  site: string;
  owner: string | null;
  binding: string;
}

/** A call through a bound type: the edges, and what keeps it from being resolved in an area. */
export interface BoundCall {
  edges: BoundEdge[];
  /** Two classes for one type in one area. */
  ambiguous: string | null;
  /** The bound class is not in the snapshot, or does not declare the member. */
  missing: string | null;
  /** The bound class's member may be declared by a base keylang has not read. */
  opaque: string | null;
  /** The bound class belongs to a package or the language. */
  external: boolean;
}

/** Per area, the class a value of a bound type is: its name, its node when the graph has one, and the preferences it rests on. */
export interface BoundClasses {
  targets: { scope: string; name: string; node: string | null; site: string; owner: string | null; binding: string }[];
  /** Two classes for the type in one area. */
  ambiguous: string | null;
}

/** A config fact that names a class keylang does not have: a hole of the module whose config it is. */
export interface BindingHole {
  file: string;
  line: number;
  col: number;
  text: string;
  reason: string;
  source: string | null;
}

export interface PluginEdge {
  target: string;
  via: "plugin:before" | "plugin:around" | "plugin:after";
  name: string;
  site: string;
  scope: string;
  owner: string | null;
  binding: string;
}

interface Declared {
  name: string;
  written: TypeName;
  resolved: ResolvedType;
  scope: string;
  site: string;
  file: string;
  line: number;
  col: number;
  owner: string | null;
  /** `virtualType` names the binding went through. */
  aliases: string[];
  /** A preference: the type it binds, as written. */
  from: string | null;
}

interface Plugin {
  target: string;
  /** The intercepted type as the config writes it. */
  targetWritten: string;
  name: string;
  plugin: TypeName | null;
  pluginWritten: string | null;
  sortOrder: number | null;
  disabled: boolean;
  scope: string;
  site: string;
  file: string;
  line: number;
  col: number;
  owner: string | null;
}

const GLOBAL = "global";
const KINDS = [
  ["before", "plugin:before"],
  ["around", "plugin:around"],
  ["after", "plugin:after"],
] as const;

export class FrameworkBindings {
  private readonly deps: BindingDeps;
  /** Type id → its preferences, in config order. */
  private readonly preferences = new Map<string, Declared[]>();
  /** Qualified name in ASCII lower case → preferences of a type the graph has no node for (one `outside` the architecture). */
  private readonly preferencesByName = new Map<string, Declared[]>();
  /** Class id → constructor parameter in ASCII lower case → the values the config sets. */
  private readonly argumentsOf = new Map<string, Map<string, (Declared & { param: string })[]>>();
  /** Type id → plugin declarations on it. */
  private readonly plugins = new Map<string, Plugin[]>();
  /** Holes of facts that name a class the snapshot does not have. */
  readonly holes: BindingHole[] = [];
  private readonly interceptorCache = new Map<string, PluginEdge[]>();
  private active: Plugin[] | null = null;
  readonly any: boolean;
  /** Constructor parameter in ASCII lower case → the values the config sets for every class (Symfony `_defaults: bind: $p: '@C'`). */
  private readonly everyClass = new Map<string, (Declared & { param: string })[]>();
  /** The class a name of the config stands for in an area: a `virtualType` is the class it names. */
  readonly unalias: (type: TypeName, scope: string) => TypeName;

  constructor(inputs: readonly FrameworkInput[], deps: BindingDeps) {
    this.deps = deps;
    const configs = inputs.flatMap((input) => input.configs).filter((c) => c.facts.error === null);
    this.any = configs.length > 0;
    // `virtualType V type=C`: V is C wherever a config names it.
    const aliases = new Map<string, { type: TypeName; scope: string }[]>();
    for (const { facts } of configs) for (const a of facts.aliases) aliases.set(key(a.name), [...(aliases.get(key(a.name)) ?? []), { type: a.type, scope: facts.scope }]);
    const unalias = (t: TypeName, scope: string): { type: TypeName; aliases: string[] } => {
      const seen: string[] = [];
      let cur = t;
      for (;;) {
        if (cur.file !== undefined) return { type: cur, aliases: seen };
        const list = aliases.get(key(cur.name));
        const hit = list?.find((a) => a.scope === scope) ?? list?.find((a) => a.scope === GLOBAL) ?? list?.[0];
        if (!hit || seen.includes(cur.name)) return { type: cur, aliases: seen };
        seen.push(cur.name);
        cur = hit.type;
      }
    };
    this.unalias = (t, scope) => unalias(t, scope).type;
    const declared = (written: TypeName, scope: string, file: string, at: { line: number; col: number }, owner: string | null, from: string | null = null): Declared => {
      const { type, aliases: through } = unalias(written, scope);
      return { name: type.name, written: type, resolved: deps.resolve(type), scope, site: `${file}:${at.line}:${at.col}`, file, line: at.line, col: at.col, owner, aliases: through, from };
    };
    for (const { facts, owner: dir } of configs) {
      const owner = deps.owner(dir);
      for (const b of facts.bindings) {
        const from = deps.resolve(unalias(b.from, facts.scope).type);
        const to = declared(b.to, facts.scope, facts.path, b, owner, b.from.name);
        if (from.kind !== "node") {
          // A type of code `outside` the architecture: the graph finds its preference by name (business-flows 40).
          if (b.from.file === undefined) {
            const name = key(unalias(b.from, facts.scope).type.name);
            this.preferencesByName.set(name, [...(this.preferencesByName.get(name) ?? []), to]);
          }
          continue;
        }
        this.preferences.set(from.id, [...(this.preferences.get(from.id) ?? []), to]);
        if (to.resolved.kind === "missing") this.hole(facts.path, b, `<preference for="${typeLabel(b.from)}" type="${typeLabel(b.to)}">`, `the preference \`${typeLabel(b.from)} → ${typeLabel(b.to)}\` names \`${typeLabel(to.written)}\`, which no analysed file declares`, owner);
      }
      for (const a of facts.arguments) {
        if (a.type.name === EVERY_CLASS && a.type.file === undefined) {
          const value = { ...declared(a.value, facts.scope, facts.path, a, owner), param: a.param };
          this.everyClass.set(asciiLower(a.param), [...(this.everyClass.get(asciiLower(a.param)) ?? []), value]);
          if (value.resolved.kind === "missing") this.hole(facts.path, a, `${a.param}: ${typeLabel(a.value)}`, `the argument \`${a.param}\` of every class names \`${typeLabel(value.written)}\`, which no analysed file declares`, owner);
          continue;
        }
        // A virtualType's arguments are those of its class, for the instances it names.
        const holder = deps.resolve(unalias(a.type, facts.scope).type);
        if (holder.kind !== "node" || !deps.isClass(holder.id)) continue;
        const value = { ...declared(a.value, facts.scope, facts.path, a, owner), param: a.param };
        const params = this.argumentsOf.get(holder.id) ?? new Map<string, (Declared & { param: string })[]>();
        params.set(asciiLower(a.param), [...(params.get(asciiLower(a.param)) ?? []), value]);
        this.argumentsOf.set(holder.id, params);
        if (value.resolved.kind === "missing") this.hole(facts.path, a, `<argument name="${a.param}">${typeLabel(a.value)}</argument>`, `the argument \`${a.param}\` of \`${typeLabel(a.type)}\` names \`${typeLabel(value.written)}\`, which no analysed file declares`, owner);
      }
      for (const p of facts.intercepts) {
        const target = deps.resolve(unalias(p.target, facts.scope).type);
        if (target.kind !== "node") continue;
        const list = this.plugins.get(target.id) ?? [];
        list.push({ target: target.id, targetWritten: typeLabel(p.target), name: p.name, plugin: p.plugin, pluginWritten: p.plugin ? typeLabel(p.plugin) : null, sortOrder: p.sortOrder, disabled: p.disabled, scope: facts.scope, site: `${facts.path}:${p.line}:${p.col}`, file: facts.path, line: p.line, col: p.col, owner });
        this.plugins.set(target.id, list);
      }
    }
    this.linkTokens(configs, declared);
    // A plugin of a class keylang does not have wraps methods nobody can name: a hole of its declaration.
    for (const plugin of this.activePlugins()) {
      if (plugin.plugin && deps.resolve(plugin.plugin).kind === "missing") this.hole(plugin.file, plugin, `<plugin name="${plugin.name}" type="${plugin.pluginWritten}">`, `the plugin \`${plugin.name}\` names \`${plugin.pluginWritten}\`, which no analysed file declares`, plugin.owner);
    }
  }

  /**
   * Tokens (NestJS): an injection `@Inject(T)` of a constructor parameter gets
   * what the providers of `T` give — the class of `useClass` (or of a class
   * provider), through `useExisting` to another token's — as a constructor
   * argument the config sets, so `this.x.m()` goes to that class's `m`. A
   * factory or a value provider names no class: a hole of its declaration.
   */
  private linkTokens(configs: readonly FrameworkInput["configs"][number][], declared: (written: TypeName, scope: string, file: string, at: { line: number; col: number }, owner: string | null, from?: string | null) => Declared): void {
    const providers = new Map<string, { fact: ProviderFact; file: string; scope: string; owner: string | null }[]>();
    for (const { facts, owner: dir } of configs) {
      const owner = this.deps.owner(dir);
      for (const p of facts.providers ?? []) {
        const k = this.deps.token(p.token);
        if (k === null) continue;
        providers.set(k, [...(providers.get(k) ?? []), { fact: p, file: facts.path, scope: facts.scope, owner }]);
        if (p.use.kind === "factory" || p.use.kind === "value") {
          const how = p.use.kind === "factory" ? "useFactory" : "useValue";
          this.hole(facts.path, p, `{ provide: ${tokenLabel(p.token)}, ${how} }`, `\`${how}\` provides ${tokenLabel(p.token)}: the value is made at run time, so calls through an injection of it are not followed`, owner);
        }
      }
    }
    /** The classes a token's providers give, following `useExisting`. */
    const classesOf = (k: string, seen: Set<string>): { type: TypeName; file: string; scope: string; owner: string | null; at: ProviderFact; via: string }[] => {
      if (seen.has(k)) return [];
      seen.add(k);
      return (providers.get(k) ?? []).flatMap(({ fact, file, scope, owner }) => {
        if (fact.use.kind === "class") return [{ type: fact.use.type, file, scope, owner, at: fact, via: tokenLabel(fact.token) }];
        if (fact.use.kind !== "existing") return [];
        const next = this.deps.token(fact.use.token);
        // The alias is the fact the injection rests on: its line, its module.
        return next === null ? [] : classesOf(next, seen).map((c) => ({ ...c, file, scope, owner, at: fact, via: `${tokenLabel(fact.token)} → ${c.via}` }));
      });
    };
    for (const { facts } of configs) {
      for (const inj of facts.injections ?? []) {
        const holder = this.deps.resolve(inj.type);
        const k = this.deps.token(inj.token);
        if (holder.kind !== "node" || !this.deps.isClass(holder.id) || k === null) continue;
        for (const c of classesOf(k, new Set())) {
          const value = { ...declared(c.type, c.scope, c.file, c.at, c.owner, c.via), param: inj.param };
          if (value.resolved.kind === "missing" && c.at.use.kind === "class" && !this.holes.some((h) => h.file === c.file && h.line === c.at.line && h.col === c.at.col)) {
            this.hole(c.file, c.at, `{ provide: ${tokenLabel(c.at.token)}, useClass: ${typeLabel(c.type)} }`, `the provider of ${tokenLabel(c.at.token)} names \`${c.type.name}\`, which no analysed file declares`, c.owner);
          }
          const params = this.argumentsOf.get(holder.id) ?? new Map<string, (Declared & { param: string })[]>();
          params.set(asciiLower(inj.param), [...(params.get(asciiLower(inj.param)) ?? []), value]);
          this.argumentsOf.set(holder.id, params);
        }
      }
    }
  }

  private hole(file: string, at: { line: number; col: number }, text: string, reason: string, source: string | null): void {
    this.holes.push({ file, line: at.line, col: at.col, text, reason, source });
  }

  /** A type the config binds: a call through it goes where the binding says. */
  binds(type: string): boolean {
    return this.preferences.has(type);
  }

  /** The values the config sets for the constructor parameter `param` of the class; none when it sets none. */
  argumentFor(classId: string, param: string): boolean {
    return this.valuesOf(classId, param).length > 0;
  }

  /** A call of `member` through a value typed `type` (a type or a class the config binds). */
  callThroughType(type: string, member: string): BoundCall {
    const out = emptyCall();
    for (const [scope, chain] of this.effective(type, out)) this.place(out, chain, member, "preference", scope);
    return finish(out);
  }

  /** A call of `member` through the property the constructor parameter `param` of `classId` fills. */
  callThroughArgument(classId: string, param: string, member: string): BoundCall {
    const out = emptyCall();
    const values = this.valuesOf(classId, param);
    for (const [scope, list] of groupBy(values, (v) => v.scope)) {
      const distinct = distinctTargets(list);
      if (distinct.length > 1) {
        out.ambiguous ??= `ambiguous binding of the argument \`${param}\`: ${distinct.map(describe).join(" and ")} in scope ${scope}`;
        continue;
      }
      const value = distinct[0]!;
      // An interface as the argument's value goes on through its own preference.
      const chain: Declared[] = [value];
      if (value.resolved.kind === "node" && this.preferences.has(value.resolved.id)) {
        const next = this.effective(value.resolved.id, out).get(scope) ?? this.effective(value.resolved.id, out).get(GLOBAL);
        if (next) chain.push(...next);
      }
      this.place(out, chain, member, "argument", scope, `the argument \`${param}\``);
    }
    return finish(out);
  }

  /** What the config sets for the parameter of the class: its own arguments, else those for every class. */
  private valuesOf(classId: string, param: string): (Declared & { param: string })[] {
    const own = this.argumentsOf.get(classId)?.get(asciiLower(param)) ?? [];
    return own.length > 0 ? own : (this.everyClass.get(asciiLower(param)) ?? []);
  }

  /**
   * Per area, the chain of preferences from `type` to the class a value of it
   * is: `I → C`, then `C → D` when C has a preference of its own, until a
   * class without one (or a cycle). An area without its own preference uses
   * the global one; two in one area make it ambiguous.
   */
  private effective(type: string, out: BoundCall): Map<string, Declared[]> {
    const result = new Map<string, Declared[]>();
    const own = this.preferences.get(type) ?? [];
    const scopes = [...new Set(own.map((d) => d.scope))].sort((a, b) => (a === GLOBAL ? -1 : b === GLOBAL ? 1 : a < b ? -1 : a > b ? 1 : 0));
    for (const scope of scopes) {
      const chain: Declared[] = [];
      const seen = new Set<string>([type]);
      let at = type;
      for (;;) {
        const list = this.preferences.get(at) ?? [];
        const here = list.filter((d) => d.scope === scope);
        const candidates = distinctTargets(here.length > 0 ? here : list.filter((d) => d.scope === GLOBAL));
        if (candidates.length === 0) break;
        if (candidates.length > 1) {
          out.ambiguous ??= `ambiguous binding of \`${candidates[0]!.from ?? chain.at(-1)?.name ?? at}\`: ${candidates.map(describe).join(" and ")} in scope ${scope}`;
          chain.length = 0;
          break;
        }
        const next = candidates[0]!;
        chain.push(next);
        if (next.resolved.kind !== "node" || seen.has(next.resolved.id)) break;
        seen.add(next.resolved.id);
        at = next.resolved.id;
      }
      if (chain.length > 0) result.set(scope, chain);
    }
    return result;
  }

  /**
   * A type the graph has no node for (an interface `outside` the architecture, business-flows 40),
   * by its qualified name: per area, the class a value of it is through the preferences — the last
   * name of the chain as `effective` follows it, by name until a preference names a graph node.
   * The graph looks the class up among its declarations; `binding` says which preferences it took.
   */
  boundByName(name: string): BoundClasses {
    return this.bound({ name }, this.preferencesByName.get(key(name)) ?? []);
  }

  /** The same for a type of the graph (`effective`, ending at the class rather than at a member). */
  boundClasses(type: string): BoundClasses {
    return this.bound({ name: type }, this.preferences.get(type) ?? []);
  }

  private bound({ name }: { name: string }, own: readonly Declared[]): BoundClasses {
    const out = emptyCall();
    const targets: BoundClasses["targets"] = [];
    const scopes = [...new Set(own.map((d) => d.scope))].sort((a, b) => (a === GLOBAL ? -1 : b === GLOBAL ? 1 : a < b ? -1 : a > b ? 1 : 0));
    for (const scope of scopes) {
      const chain: Declared[] = [];
      const seen = new Set<string>([name, `?${key(name)}`]);
      let list = own;
      for (;;) {
        const here = list.filter((d) => d.scope === scope);
        const candidates = distinctTargets(here.length > 0 ? here : list.filter((d) => d.scope === GLOBAL));
        if (candidates.length === 0) break;
        if (candidates.length > 1) {
          out.ambiguous ??= `ambiguous binding of \`${candidates[0]!.from ?? chain.at(-1)?.name ?? name}\`: ${candidates.map(describe).join(" and ")} in scope ${scope}`;
          chain.length = 0;
          break;
        }
        const next = candidates[0]!;
        chain.push(next);
        const id = next.resolved.kind === "node" ? next.resolved.id : `?${key(next.name)}`;
        if (seen.has(id)) break;
        seen.add(id);
        list = next.resolved.kind === "node" ? (this.preferences.get(next.resolved.id) ?? []) : (this.preferencesByName.get(key(next.name)) ?? []);
      }
      const last = chain.at(-1);
      if (!last) continue;
      const aliases = chain.flatMap((d) => d.aliases);
      const through = aliases.length > 0 ? ` (virtualType ${aliases.map((v) => `\`${v}\``).join(", ")})` : "";
      const binding = `\`${chain[0]!.from !== null ? `${chain[0]!.from} → ` : ""}${chain.map((d) => d.name).join(" → ")}\`${through}`;
      targets.push({ scope, name: last.name, node: last.resolved.kind === "node" ? last.resolved.id : null, site: chain[0]!.site, owner: chain[0]!.owner, binding });
    }
    return { targets, ambiguous: out.ambiguous };
  }

  /** The edge (or the reason there is none) of one area's chain. */
  private place(out: BoundCall, chain: readonly Declared[], member: string, via: "preference" | "argument", scope: string, lead = ""): void {
    const last = chain.at(-1);
    if (!last) return;
    const aliases = chain.flatMap((d) => d.aliases);
    const names = chain.map((d) => d.name).join(" → ");
    const through = aliases.length > 0 ? ` (virtualType ${aliases.map((v) => `\`${v}\``).join(", ")})` : "";
    const binding = `${lead ? `${lead} → ` : ""}\`${chain[0]!.from !== null ? `${chain[0]!.from} → ` : ""}${names}\`${through}`;
    if (last.resolved.kind === "external") {
      out.external = true;
      return;
    }
    if (last.resolved.kind === "missing") {
      out.missing ??= `bound by ${binding} (${last.site}) to \`${last.name}\`, which no analysed file declares`;
      return;
    }
    const impl = last.resolved.id;
    if (!this.deps.isClass(impl)) {
      out.missing ??= `bound by ${binding} (${last.site}) to \`${last.name}\`, which is no class`;
      return;
    }
    const target = this.deps.member(impl, member);
    if (!target) {
      if (this.deps.opaqueBase(impl)) out.opaque ??= `bound to opaque \`${last.name}\` by ${binding} (${last.site}): \`${member}\` may be declared by a base keylang has not read`;
      else out.missing ??= `bound by ${binding} (${last.site}) to \`${last.name}\`, which has no \`${member}\``;
      return;
    }
    const first = chain[0]!;
    const existing = out.edges.find((e) => e.target === target && e.via === via);
    if (existing) {
      existing.scope = [...new Set([...existing.scope.split(","), scope])].sort(scopeOrder).join(",");
      return;
    }
    out.edges.push({ target, impl, via, scope, site: first.site, owner: first.owner, binding });
  }

  /** Plugin declarations in effect: per type, name and area, the last one wins; a disabled one or one of no class is not. */
  private activePlugins(): Plugin[] {
    if (this.active) return this.active;
    const out: Plugin[] = [];
    this.active = out;
    for (const list of this.plugins.values()) {
      const byName = groupBy(list, (p) => p.name);
      for (const decls of byName.values()) {
        const global = merge(decls.filter((p) => p.scope === GLOBAL));
        if (global && !global.disabled && global.plugin) out.push(global);
        for (const [scope, own] of groupBy(decls.filter((p) => p.scope !== GLOBAL), (p) => p.scope)) {
          const effective = merge([...decls.filter((p) => p.scope === GLOBAL), ...own]);
          if (!effective || effective.disabled || !effective.plugin) continue;
          // The global declaration already applies in this area unless the area changed the plugin's class.
          if (global && !global.disabled && global.plugin && effective.pluginWritten === global.pluginWritten) continue;
          out.push({ ...effective, scope });
        }
      }
    }
    return out;
  }

  /**
   * The plugin methods that wrap `member` of a value of `types` (the receiver's
   * class, and the interface a binding went through), in the order they run:
   * by `sortOrder`, then name; each plugin's `before`, `around`, `after`.
   */
  interceptors(types: readonly string[], member: string): PluginEdge[] {
    const cacheKey = `${[...types].sort().join(",")}\0${asciiLower(member)}`;
    const cached = this.interceptorCache.get(cacheKey);
    if (cached) return cached;
    const supers = new Set(types.flatMap((t) => this.deps.supertypes(t)));
    const active = this.activePlugins().filter((p) => supers.has(p.target));
    active.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) || (a.scope < b.scope ? -1 : a.scope > b.scope ? 1 : 0));
    const out: PluginEdge[] = [];
    for (const p of active) {
      const cls = p.plugin ? this.deps.resolve(p.plugin) : null;
      if (cls?.kind !== "node" || !this.deps.isClass(cls.id)) continue;
      for (const [prefix, via] of KINDS) {
        const target = this.deps.member(cls.id, `${prefix}${member.charAt(0).toUpperCase()}${member.slice(1)}`);
        if (target) out.push({ target, via, name: p.name, site: p.site, scope: p.scope, owner: p.owner, binding: `plugin \`${p.name}\` (\`${p.pluginWritten}\`) on \`${p.targetWritten}\`` });
      }
    }
    this.interceptorCache.set(cacheKey, out);
    return out;
  }
}

/** A token as the code writes it: `ORDER_REPO`, `'CLOCK'`. */
function tokenLabel(t: TokenRef): string {
  return t.kind === "string" ? `'${t.value}'` : t.name;
}

function emptyCall(): BoundCall {
  return { edges: [], ambiguous: null, missing: null, opaque: null, external: false };
}

function finish(out: BoundCall): BoundCall {
  out.edges.sort((a, b) => scopeOrder(a.scope, b.scope) || (a.target < b.target ? -1 : a.target > b.target ? 1 : 0));
  return out;
}

/** Declarations that name different classes: one per class. */
function distinctTargets<T extends Declared>(list: readonly T[]): T[] {
  const seen = new Map<string, T>();
  for (const d of list) {
    const k = d.resolved.kind === "node" ? d.resolved.id : `?${key(d.name)}`;
    if (!seen.has(k)) seen.set(k, d);
  }
  return [...seen.values()];
}

function describe(d: Declared): string {
  return `\`${d.name}\` (${d.site})`;
}

/** Declarations of one plugin in config order, merged: a later one changes what it writes. */
function merge(decls: readonly Plugin[]): Plugin | null {
  let out: Plugin | null = null;
  for (const d of decls) {
    if (out === null) {
      out = { ...d };
      continue;
    }
    const prev: Plugin = out;
    out = { ...prev, plugin: d.plugin ?? prev.plugin, pluginWritten: d.pluginWritten ?? prev.pluginWritten, sortOrder: d.sortOrder ?? prev.sortOrder, disabled: d.disabled };
    if (d.plugin) Object.assign(out, { site: d.site, file: d.file, line: d.line, col: d.col, owner: d.owner });
  }
  return out;
}

function groupBy<T>(list: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of list) out.set(keyOf(item), [...(out.get(keyOf(item)) ?? []), item]);
  return out;
}

function scopeOrder(a: string, b: string): number {
  return a === b ? 0 : a === GLOBAL ? -1 : b === GLOBAL ? 1 : a < b ? -1 : 1;
}

function key(name: string): string {
  return asciiLower(name.replace(/^\\+/, ""));
}

function asciiLower(name: string): string {
  return name.replace(/[A-Z]+/g, (letters) => letters.toLowerCase());
}
