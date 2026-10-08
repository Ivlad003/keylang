// Entry points and holes the framework adapters add to a snapshot (ADR 0022
// п. 5), placed on the graph: an entry a config file names (SFCC `hooks.json`,
// `steptypes.json`) becomes the fn or module of its script, and SFCC adds the
// controllers the TypeScript extractor records (`server.get('Show', …)` →
// `route` `Cart-Show`) and a coverage note for a `*/cartridge` require that
// only a guessed cartridge path decided. A PHP framework (Laravel, Symfony)
// names a class and its method instead of a script; its listeners and job or
// message handlers become `call` edges from every fn that dispatches their
// event (`via: "observer"`, `via: "dispatch"`). The adapters themselves only
// parse (`src/frameworks/`); everything that needs the graph is here.

import type { Config } from "./config.ts";
import { compareEntries, entryScope, fnIn, frameworkEntry, type EntryScope } from "./entries.ts";
import type { FileFacts } from "./extract/facts.ts";
import type { ConfigFacts, EntryConfigFact, FrameworkInput, TypeName } from "./frameworks/adapter.ts";
import { cartridgeAnswers, cartridgeLayout, SUPER_MODULE, type CartridgeLayout } from "./frameworks/cartridges.ts";
import { PYTHON_WEB_FRAMEWORKS } from "./frameworks/python-web.ts";
import type { Call, Fn, Gap, Graph, Module } from "./graph.ts";
import { probeCandidates } from "./imports.ts";
import { pythonWebEntries } from "./python-web-entries.ts";
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
  const classes = phpClassFiles(facts);
  for (const framework of frameworks) {
    for (const { facts: file } of framework.configs) {
      for (const hole of file.holes ?? []) holes.push({ kind: "unsupported", file: file.path, line: hole.line, col: hole.col, endLine: hole.line, endCol: hole.col, text: hole.text, reason: hole.reason, source: graph.byPath.get(file.path)?.id ?? null });
      for (const fact of file.entries ?? []) {
        if (fact.type !== undefined) {
          const placed = placeMethod(scope, classes, fact.type, fact.fn ?? "__invoke");
          if ("reason" in placed) {
            holes.push({ kind: "unsupported", file: file.path, line: fact.line, col: fact.col, endLine: fact.line, endCol: fact.col, text: fact.label, reason: `${fact.kind} \`${fact.label}\`: ${placed.reason}`, source: graph.byPath.get(file.path)?.id ?? null });
            continue;
          }
          entries.push(withExtras(frameworkEntry(scope, framework.name, fact.kind, placed.id, fact.label, `${file.path}:${fact.line}`, placed.at), fact));
          continue;
        }
        const script = fact.files.map(probe).find((found) => found !== null) ?? null;
        const module = script === null ? undefined : graph.byPath.get(script);
        if (script === null || module === undefined) {
          const reason = `${fact.kind === "cron" ? "job step" : "hook"} \`${fact.label}\`: its script (\`${fact.files[0]}\`) is no file of the analysis`;
          holes.push({ kind: "unsupported", file: file.path, line: fact.line, col: fact.col, endLine: fact.line, endCol: fact.col, text: "", reason, source: null });
          continue;
        }
        const fn = fact.fn === null ? null : fnIn(scope, script, fact.fn);
        // A handler written in place (a closure in a route file): the module stands for it, at the registration.
        const at = fact.fn === null && fact.note !== undefined ? { file: script, line: fact.line } : { file: script, line: 1 };
        const found = frameworkEntry(scope, framework.name, fact.kind, fn ?? module.id, fact.label, `${file.path}:${fact.line}`, at);
        entries.push(withExtras(fn === null && fact.note !== undefined ? { ...found, ...at } : found, fact));
      }
    }
    holes.push(...dispatchEdges(graph, scope, classes, framework.configs));
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
  // Django, FastAPI, Flask, Celery: registrations written in the Python code (`src/python-web-entries.ts`).
  const python = frameworks.map((f) => f.name).filter((name) => PYTHON_WEB_FRAMEWORKS.includes(name));
  if (python.length > 0) {
    const found = pythonWebEntries(config, graph, facts, scope, python);
    entries.push(...found.entries);
    holes.push(...found.holes);
  }
  return { entries: entries.sort(compareEntries), holes, warnings };
}

/** The HTTP method and the note an entry fact gives its entry. */
function withExtras(entry: EntryPoint, fact: EntryConfigFact): EntryPoint {
  return { ...entry, ...(fact.method !== undefined ? { method: fact.method } : {}), ...(fact.note !== undefined ? { note: fact.note } : {}) };
}

/** PHP classes by their qualified name in ASCII lower case → the file and the name it declares. */
function phpClassFiles(facts: readonly FileFacts[]): Map<string, { file: string; name: string; facts: FileFacts }> {
  const out = new Map<string, { file: string; name: string; facts: FileFacts }>();
  for (const file of [...facts].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    for (const symbol of file.symbols ?? []) if (symbol.table === "class" && !out.has(lower(symbol.qualified))) out.set(lower(symbol.qualified), { file: file.path, name: symbol.name, facts: file });
  }
  return out;
}

function lower(name: string): string {
  return name.replace(/^\\+/, "").replace(/[A-Z]+/g, (s) => s.toLowerCase());
}

/**
 * The fn of `method` of the class a config names, its own or a base's the
 * analysis has; the reason when it has neither the class nor the method.
 */
function placeMethod(scope: EntryScope, classes: ReadonlyMap<string, { file: string; name: string; facts: FileFacts }>, type: TypeName, method: string): { id: string; at: { file: string; line: number } } | { reason: string } {
  const seen = new Set<string>();
  let at = classes.get(lower(type.name));
  if (at === undefined) return { reason: `it names \`${type.name}\`, which no analysed file declares` };
  while (at !== undefined && !seen.has(at.file + at.name)) {
    seen.add(at.file + at.name);
    const decl = at.facts.decls.find((d) => d.kind === "class" && d.name === at!.name);
    const member = decl?.members.find((m) => m.kind === "fn" && lower(m.name) === lower(method));
    if (decl && member) {
      const id = fnIn(scope, at.file, `${at.name}.${member.name}`);
      if (id !== null) return { id, at: { file: at.file, line: member.line } };
    }
    // The method may be a base's: follow `extends` through the file's imports.
    const base = decl?.base;
    if (!base) break;
    const qualified = at.facts.imports.find((imp) => imp.bindings.some((b) => lower(b.local) === lower(base)) && !/^(function|const|include) /.test(imp.source))?.source ?? base;
    at = classes.get(lower(qualified));
  }
  return { reason: `\`${type.name}\` declares no method \`${method}\` keylang has read` };
}

/**
 * Edges from every fn that dispatches an event or a message to the listeners
 * and handlers the framework runs for it (ADR 0022 п. 6): `via: "observer"`
 * for a listener of the event, `via: "dispatch"` for the handler of a job or
 * a message, at the dispatching call, with the line of the config that
 * subscribes the listener as `site` and its file's module as `owner`. Until
 * events are nodes of their own (`events.*`), the edge goes straight from the
 * dispatching fn to the listener; the event names it in `binding`.
 */
function dispatchEdges(graph: Graph, scope: EntryScope, classes: ReadonlyMap<string, { file: string; name: string; facts: FileFacts }>, configs: readonly { facts: ConfigFacts }[]): Gap[] {
  const holes: Gap[] = [];
  type Target = { id: string; via: "observer" | "dispatch"; site: string; owner: string | null; binding: string };
  const byEvent = new Map<string, Target[]>();
  const add = (event: string, target: Target): void => {
    const list = byEvent.get(lower(event)) ?? [];
    if (!list.some((t) => t.id === target.id && t.via === target.via)) list.push(target);
    byEvent.set(lower(event), list);
  };
  for (const { facts: file } of configs) {
    const owner = graph.byPath.get(file.path)?.id ?? null;
    for (const l of file.listens ?? []) {
      const placed = placeMethod(scope, classes, l.listener, l.method);
      if ("reason" in placed) {
        holes.push({ kind: "unsupported", file: file.path, line: l.line, col: l.col, endLine: l.line, endCol: l.col, text: l.listener.name, reason: `listener of \`${l.event}\`: ${placed.reason}`, source: owner });
        continue;
      }
      // A listener its own class declares (an attribute) belongs to no other module: the dispatching fn owns the edge.
      add(l.event, { id: placed.id, via: "observer", site: `${file.path}:${l.line}:${l.col}`, owner: placed.at.file === file.path ? null : owner, binding: `listener \`${l.listener.name}::${l.method}\` of the event \`${l.event}\`` });
    }
    for (const h of file.handlers ?? []) {
      const placed = placeMethod(scope, classes, h.handler, h.method);
      if ("reason" in placed) continue;
      const binding = h.kind === "job" ? `queued job \`${h.handler.name}::${h.method}\`` : `handler \`${h.handler.name}::${h.method}\` of the message \`${h.message}\``;
      // The handler declares itself: the dispatching fn owns the edge, a dependency the code does not write when it names only the message.
      add(h.message, { id: placed.id, via: "dispatch", site: `${file.path}:${h.line}:${h.col}`, owner: null, binding });
    }
  }
  if (byEvent.size === 0) return holes;
  for (const { facts: file } of configs) {
    for (const d of file.dispatches ?? []) {
      const targets = byEvent.get(lower(d.event));
      if (!targets) continue;
      const source = fnIn(scope, file.path, d.symbol);
      const fn = source === null ? null : fnOf(graph, source);
      if (fn === null) continue;
      for (const t of targets) {
        if (fn.calls.some((c) => c.target === t.id && c.via === t.via && c.line === d.line && c.col === d.col)) continue;
        const call: Call = { target: t.id, line: d.line, col: d.col, endLine: d.endLine, endCol: d.endCol, text: d.text, via: t.via, site: t.site, binding: t.binding, ...(t.owner !== null ? { owner: t.owner } : {}) };
        fn.calls.push(call);
      }
    }
  }
  return holes;
}

/** The fn node of an id: a member of its module or of a class in it. */
function fnOf(graph: Graph, id: string): Fn | null {
  const visit = (module: Module): Fn | null => {
    const own = module.fns.find((fn) => fn.id === id);
    if (own) return own;
    for (const child of module.children) if (id.startsWith(`${child.id}.`)) return visit(child);
    return null;
  };
  for (const layer of graph.layers) for (const module of layer.modules) if (id.startsWith(`${module.id}.`)) {
    const found = visit(module);
    if (found) return found;
  }
  return null;
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
