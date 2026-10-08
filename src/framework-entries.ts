// Entry points and holes the framework adapters add to a snapshot (ADR 0022
// п. 5), placed on the graph: an entry a config file names (SFCC `hooks.json`,
// `steptypes.json`) becomes the fn or module of its script, and SFCC adds the
// controllers the TypeScript extractor records (`server.get('Show', …)` →
// `route` `Cart-Show`) and a coverage note for a `*/cartridge` require that
// only a guessed cartridge path decided; NestJS adds the methods its
// decorators name (`@Get`, `@Cron`, `@OnEvent`, `@MessagePattern`, `@Query`).
// The adapters themselves only parse (`src/frameworks/`); everything that
// needs the graph is here.

import type { Config } from "./config.ts";
import { compareEntries, entryScope, fnIn, frameworkEntry, type EntryScope } from "./entries.ts";
import type { CallFact, DeclFact, DecoratorArg, FileFacts } from "./extract/facts.ts";
import type { FrameworkInput } from "./frameworks/adapter.ts";
import { cartridgeAnswers, cartridgeLayout, SUPER_MODULE, type CartridgeLayout } from "./frameworks/cartridges.ts";
import type { Gap, Graph } from "./graph.ts";
import { probeCandidates } from "./imports.ts";
import type { EntryPoint } from "./snapshot.ts";

export interface FrameworkEntryInputs {
  config: Config;
  graph: Graph;
  facts: readonly FileFacts[];
  /** The active adapters with their parsed config files. */
  frameworks: readonly FrameworkInput[];
}

export function frameworkEntries({ config, graph, facts, frameworks }: FrameworkEntryInputs): { entries: EntryPoint[]; holes: Gap[]; warnings: string[] } {
  const scope = entryScope(graph, facts);
  const sources = new Set(facts.map((f) => f.path));
  const probe = (candidate: string): string | null => probeCandidates(candidate).find((p) => sources.has(p)) ?? null;
  const entries: EntryPoint[] = [];
  const holes: Gap[] = [];
  const warnings: string[] = [];
  for (const framework of frameworks) {
    for (const { facts: file } of framework.configs) {
      for (const fact of file.entries ?? []) {
        const script = fact.files.map(probe).find((found) => found !== null) ?? null;
        const module = script === null ? undefined : graph.byPath.get(script);
        if (script === null || module === undefined) {
          const reason = `${fact.kind === "cron" ? "job step" : "hook"} \`${fact.label}\`: its script (\`${fact.files[0]}\`) is no file of the analysis`;
          holes.push({ kind: "unsupported", file: file.path, line: fact.line, col: fact.col, endLine: fact.line, endCol: fact.col, text: "", reason, source: null });
          continue;
        }
        const fn = fact.fn === null ? null : fnIn(scope, script, fact.fn);
        entries.push(frameworkEntry(scope, framework.name, fact.kind, fn ?? module.id, fact.label, `${file.path}:${fact.line}`, { file: script, line: 1 }));
      }
    }
  }
  if (frameworks.some((f) => f.name === "sfcc")) {
    const layout = cartridgeLayout(config.root, sources, config.sfcc.cartridgePath);
    if (layout !== null) {
      if (layout.source === "guessed" && layout.cartridges.length > 1) {
        warnings.push(`sfcc: cartridge path guessed (by name): ${layout.path.map((c) => c.name).join(":")}; set \`sfcc.cartridgePath\` in keylang.json`);
      }
      for (const c of layout.cartridges) {
        if (layout.source !== "guessed" && !layout.path.includes(c)) warnings.push(`sfcc: cartridge \`${c.name}\` is not on the cartridge path (${layout.source}): \`*/cartridge/…\` never reaches it`);
      }
      holes.push(...guessedOrder(layout, graph, facts, probe));
    }
    entries.push(...controllerEntries(graph, facts, scope));
  }
  const nest = frameworks.find((f) => f.name === "nestjs");
  if (nest !== undefined) entries.push(...nestEntries(facts, scope, new Set(nest.configs.map((c) => c.facts.path))));
  return { entries: entries.sort(compareEntries), holes, warnings };
}

/**
 * A `*\/cartridge/…` require that two cartridges answer, or a
 * `module.superModule`, resolved along a guessed cartridge path: the order
 * decided the edge, and nothing the repository writes gave the order. A hole
 * (`unsupported`) of the requiring module, so a rule over it is unverified
 * rather than proven by a guess.
 */
function guessedOrder(layout: CartridgeLayout, graph: Graph, facts: readonly FileFacts[], probe: (candidate: string) => string | null): Gap[] {
  if (layout.source !== "guessed" || layout.path.length < 2) return [];
  const holes: Gap[] = [];
  const order = layout.path.map((c) => c.name).join(":");
  for (const file of facts) {
    const module = graph.byPath.get(file.path);
    for (const imp of file.imports) {
      if (!imp.source.startsWith("*/") && imp.source !== SUPER_MODULE) continue;
      const answers = cartridgeAnswers(layout, file.path, imp.source, probe);
      if (!Array.isArray(answers) || answers.length === 0 || (imp.source !== SUPER_MODULE && answers.length < 2)) continue;
      const reason = `cartridge path guessed: \`${imp.source}\` resolved to \`${answers[0]}\` by the order ${order} (cartridges by name); set \`sfcc.cartridgePath\` in keylang.json`;
      holes.push({ kind: "unsupported", file: file.path, line: imp.line, col: imp.col, endLine: imp.endLine, endCol: imp.endCol, text: imp.text, reason, source: module?.id ?? null });
    }
  }
  return holes;
}

const CONTROLLER = /^(?:.*\/)?cartridges\/[^/]+\/cartridge\/controllers\/([^/]+)\.js$/;
const HTTP_METHODS: Record<string, string> = { get: "GET", post: "POST" };

/**
 * `server.get('Show', …, handler)` in `controllers/Cart.js`: a `route`
 * labelled `Cart-Show`. The handler is the last argument when it names a fn
 * keylang resolves; a handler written in place has no fn ID, so the
 * controller module stands for it, at the registration's line, with a note.
 */
function controllerEntries(graph: Graph, facts: readonly FileFacts[], scope: EntryScope): EntryPoint[] {
  const out: EntryPoint[] = [];
  for (const file of facts) {
    const match = CONTROLLER.exec(file.path);
    const module = graph.byPath.get(file.path);
    if (match === null || module === undefined) continue;
    for (const fact of file.entries ?? []) {
      if (fact.kind !== "sfra") continue;
      const fn = fact.callee === null ? null : fnIn(scope, file.path, fact.callee);
      const notes: string[] = [];
      if (fact.method === "append" || fact.method === "prepend" || fact.method === "replace") notes.push(`server.${fact.method}: changes the route a cartridge further down the path declares`);
      if (fact.callee === null) notes.push("handler written in place: the controller module stands for it");
      else if (fn === null) notes.push(`handler \`${fact.callee}\` does not resolve to a fn: the controller module stands for it`);
      const at = { file: file.path, line: fact.line };
      const found = frameworkEntry(scope, "sfcc", "route", fn ?? module.id, `${match[1]}-${fact.label}`, `${file.path}:${fact.line}`, at);
      const method = HTTP_METHODS[fact.method ?? ""];
      out.push({ ...found, ...(fn === null ? at : {}), ...(method === undefined ? {} : { method }), ...(notes.length > 0 ? { note: notes.join("; ") } : {}) });
    }
  }
  return out;
}

const NEST_HTTP: Record<string, string> = { Get: "GET", Post: "POST", Put: "PUT", Patch: "PATCH", Delete: "DELETE", Options: "OPTIONS", Head: "HEAD", All: "ALL", Search: "SEARCH" };
const NEST_GRAPHQL = new Set(["Query", "Mutation", "Subscription"]);

/**
 * NestJS entry points from the decorators of its config files (the sources
 * that import `@nestjs/…`): `@Controller('orders')` + `@Get(':id')` →
 * `route` `GET /api/orders/:id` (with the global prefix of
 * `setGlobalPrefix('api')` when it is one literal); `@Cron('0 * * * *')`,
 * `@Interval(ms)`, `@Timeout(ms)` → `cron` labelled `Class.method <schedule>`;
 * `@OnEvent('e')` → `observer` `e`; `@MessagePattern(p)`, `@EventPattern(p)`
 * → `consumer`; `@Resolver()` + `@Query`/`@Mutation`/`@Subscription` →
 * `graphql` `Query.name`. Each is the decorated method's fn.
 */
function nestEntries(facts: readonly FileFacts[], scope: EntryScope, files: ReadonlySet<string>): EntryPoint[] {
  const prefixes = new Set<string>();
  let computedPrefix: string | null = null;
  for (const file of facts) {
    for (const call of allCalls(file)) {
      if (!call.callee.endsWith(".setGlobalPrefix") || call.literal === undefined) continue;
      if (call.literal === null) computedPrefix ??= `${file.path}:${call.line}`;
      else prefixes.add(call.literal);
    }
  }
  const prefixNote = computedPrefix !== null ? `the global prefix at ${computedPrefix} is no literal: the path is without it` : prefixes.size > 1 ? `two global prefixes (${[...prefixes].sort().join(", ")}): the path is without them` : null;
  const prefix = prefixNote === null && prefixes.size === 1 ? [...prefixes][0]! : "";
  const out: EntryPoint[] = [];
  for (const file of facts) {
    if (!files.has(file.path)) continue;
    for (const cls of file.decls) {
      if (cls.kind !== "class") continue;
      const classDecorators = cls.decorators ?? [];
      const controller = classDecorators.find((d) => d.name === "Controller");
      const resolver = classDecorators.some((d) => d.name === "Resolver");
      const controllerPaths = controller === undefined ? null : pathsOf(controller.args[0], "path");
      for (const member of cls.members) {
        if (member.kind !== "fn") continue;
        const id = fnIn(scope, file.path, `${cls.name}.${member.name}`);
        if (id === null) continue;
        for (const d of member.decorators ?? []) {
          if (d.param !== undefined) continue;
          const add = (kind: EntryPoint["kind"], label: string, extra: Partial<EntryPoint> = {}): void => {
            out.push({ ...frameworkEntry(scope, "nestjs", kind, id, label, `${file.path}:${d.line}`, { file: file.path, line: member.line }), ...extra });
          };
          const method = NEST_HTTP[d.name];
          if (method !== undefined && controllerPaths !== null) {
            for (const base of controllerPaths) {
              for (const path of pathsOf(d.args[0], "path") ?? [""]) add("route", `${method} ${joinPath(prefix, base, path)}`, { method, ...(prefixNote !== null ? { note: prefixNote } : {}) });
            }
          } else if (d.name === "Cron" || d.name === "Interval" || d.name === "Timeout") {
            const schedule = d.name === "Cron" ? argText(d.args[0]) : `${d.name === "Interval" ? "every" : "after"} ${argText(d.args.at(-1))}ms`;
            add("cron", `${cls.name}.${member.name} ${schedule}`);
          } else if (d.name === "OnEvent") {
            const first = d.args[0];
            const events = first?.kind === "array" ? first.items.map(argText) : [argText(first)];
            for (const event of events) add("observer", event, first?.kind === "string" || first?.kind === "array" ? {} : { note: "the event name is no literal" });
          } else if (d.name === "MessagePattern" || d.name === "EventPattern") {
            add("consumer", argText(d.args[0]));
          } else if (resolver && NEST_GRAPHQL.has(d.name)) {
            const named = d.args.flatMap((a) => (a.kind === "object" ? a.props : [])).find((p) => p.key === "name")?.value;
            add("graphql", `${d.name}.${named?.kind === "string" ? named.value : member.name}`);
          }
        }
      }
    }
  }
  return out;
}

/** Every call of a file: its declarations' (members too) and its top level's. */
function allCalls(file: FileFacts): CallFact[] {
  const out: CallFact[] = [...file.moduleCalls];
  const visit = (decls: readonly DeclFact[]): void => {
    for (const d of decls) {
      out.push(...d.calls);
      visit(d.members);
    }
  };
  visit(file.decls);
  return out;
}

/** `'orders'`, `['a', 'b']`, `{ path: 'orders' }` → the paths; none written → `['']`; null for a path keylang cannot read. */
function pathsOf(arg: DecoratorArg | undefined, key: string): string[] | null {
  if (arg === undefined) return [""];
  if (arg.kind === "string") return [arg.value];
  if (arg.kind === "array") {
    const paths = arg.items.flatMap((i) => (i.kind === "string" ? [i.value] : []));
    return paths.length === arg.items.length ? paths : null;
  }
  if (arg.kind === "object") {
    const path = arg.props.find((p) => p.key === key)?.value;
    return path === undefined ? [""] : pathsOf(path, key);
  }
  return null;
}

/** `/api/orders/:id` from its parts, each with or without slashes. */
function joinPath(...parts: string[]): string {
  return `/${parts
    .flatMap((p) => p.split("/"))
    .filter((p) => p !== "")
    .join("/")}`;
}

/** A decorator argument in words: a string's value, a name, a number; an object or an array as written. */
function argText(arg: DecoratorArg | undefined): string {
  if (arg === undefined) return "";
  switch (arg.kind) {
    case "string":
      return arg.value;
    case "number":
      return String(arg.value);
    case "name":
      return arg.name;
    case "object":
      return `{ ${arg.props.map((p) => `${p.key}: ${p.value.kind === "string" ? JSON.stringify(p.value.value) : argText(p.value)}`).join(", ")} }`;
    case "array":
      return `[${arg.items.map(argText).join(", ")}]`;
    case "function":
      return "() => …";
    case "other":
      return arg.text;
  }
}
