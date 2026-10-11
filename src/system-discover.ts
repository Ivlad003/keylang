// The system of a repository's code (system-design/06): a pure function of
// the snapshot, no model. A layer with entry points is a component — a
// `service` for HTTP, CLI and scripts, a `worker` for cron and consumers —
// bound to its layer; a package of the technology catalog the code imports
// is a data store, queue or outside service; a relation is an import path
// from a component's code to a driver or to another component's code; a
// sequence follows an entry point's calls in source order and writes a
// message where a call crosses into another component or a driver. The
// result is a `SystemSpec` the diagrams draw and `systemMarkdown` writes as
// a `# system` a person can adopt.

import { externalPackageId, EXTERNAL } from "./external-ids.ts";
import { isSegment, type ComponentKind } from "./parser.ts";
import type { AnalysisSnapshot, EntryPoint } from "./snapshot.ts";
import { compareText } from "./span.ts";
import { evidenceIds, isSqlClient, technologiesOfPackage, TECHNOLOGIES, type Technology } from "./system-catalog.ts";
import { moduleGraph, modulesUnder, reach, type ModuleGraph, type RelationVerb, type SystemComponent, type SystemMessage, type SystemSequence, type SystemSpec, type SystemTable } from "./system.ts";

/** The name the discovered system has in the views: no `# system` section can take it (`@` is no segment character). */
export const DISCOVERED = "@code";

const HTTP: ReadonlySet<string> = new Set(["route", "rest", "graphql", "controller", "webhook"]);
const BACKGROUND: ReadonlySet<string> = new Set(["cron", "consumer", "observer"]);
const SYNTHETIC: ReadonlySet<string> = new Set([EXTERNAL, "unassigned", "outside", "events"]);
/** Sequences drawn at most, and messages in one. */
const MAX_SEQUENCES = 20;
const MAX_MESSAGES = 30;
const MAX_CALL_DEPTH = 6;

/** Tables a schema reader found (system-design/07), by the technology of their database. */
export interface DiscoveredSchema {
  tech: string;
  tables: SystemTable[];
}

const cache = new WeakMap<object, { schemas: readonly DiscoveredSchema[]; system: SystemSpec }>();

/** The system of the snapshot's code; the same object for the same snapshot and schemas. */
export function discoverSystem(snapshot: AnalysisSnapshot, schemas: readonly DiscoveredSchema[] = []): SystemSpec {
  const known = cache.get(snapshot);
  if (known && (known.schemas === schemas || (known.schemas.length === 0 && schemas.length === 0))) return known.system;
  const system = build(snapshot, schemas);
  cache.set(snapshot, { schemas, system });
  return system;
}

/** The name the system of the code takes as a section (`# system <name>`): the repository's, as a segment. */
export function adoptedName(snapshot: Pick<AnalysisSnapshot, "system">): string {
  return segmentOf(snapshot.system.name ?? "app", "app");
}

function segmentOf(text: string, fallback: string): string {
  const cleaned = text.toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^[^\p{L}_]+/u, "").replace(/-+$/, "");
  return isSegment(cleaned) ? cleaned : fallback;
}

function layerOfId(snapshot: AnalysisSnapshot, id: string): string | null {
  for (let at = id; at !== ""; at = at.includes(".") ? at.slice(0, at.lastIndexOf(".")) : "") {
    const node = snapshot.nodes[at];
    if (node) return node.layer;
  }
  return null;
}

function component(name: string, kind: ComponentKind, tech: string | null, code: string[]): SystemComponent {
  return { name, kind, tech, zone: null, code, scale: null, description: "", tables: [], line: 0, col: 0 };
}

function build(snapshot: AnalysisSnapshot, schemas: readonly DiscoveredSchema[]): SystemSpec {
  const system: SystemSpec = { name: DISCOVERED, file: "", line: 0, zones: [], components: [], relations: [], sequences: [], notes: [] };
  const graph = moduleGraph(snapshot);
  const entries = snapshot.entries ?? [];
  const layers = Object.keys(snapshot.manifest.config.layers).filter((layer) => !SYNTHETIC.has(layer));

  // Components of the code: a layer with entry points each.
  const byLayer = new Map<string, EntryPoint[]>();
  for (const entry of entries) {
    const layer = layerOfId(snapshot, entry.id);
    if (layer === null || SYNTHETIC.has(layer)) continue;
    byLayer.set(layer, [...(byLayer.get(layer) ?? []), entry]);
  }
  const services: SystemComponent[] = [];
  for (const layer of layers) {
    const own = byLayer.get(layer);
    if (!own) continue;
    const http = own.some((entry) => HTTP.has(entry.kind));
    const kind: ComponentKind = !http && own.every((entry) => BACKGROUND.has(entry.kind)) ? "worker" : "service";
    const frameworks = [...new Set(own.map((entry) => entry.framework).filter((name): name is string => name !== null))].sort(compareText);
    const tech = frameworks.length > 0 ? frameworks.join(", ") : own.every((entry) => entry.kind === "cli") ? "cli" : null;
    services.push(component(segmentOf(layer, "service"), kind, tech, [layer]));
  }
  if (services.length === 0 && layers.length > 0) services.push(component(segmentOf(snapshot.system.name ?? "app", "app"), "service", null, layers));
  const names = new Set(services.map((service) => service.name));

  // Data stores, queues and outside services: one per technology the code imports.
  const stores = new Map<string, { tech: Technology; component: SystemComponent }>();
  const imported = new Set<string>();
  for (const pkgs of graph.packages.values()) for (const pkg of pkgs) imported.add(pkg);
  const addStore = (tech: Technology): void => {
    if (stores.has(tech.name)) return;
    let name = tech.name;
    for (let n = 2; names.has(name); n++) name = `${tech.name}-${n}`;
    names.add(name);
    stores.set(tech.name, { tech, component: component(name, tech.kind, tech.name, []) });
  };
  for (const pkg of [...imported].sort(compareText)) {
    const techs = technologiesOfPackage(pkg);
    if (techs.length === 1) addStore(techs[0]!);
  }
  const hasSqlDriver = [...stores.values()].some(({ tech }) => tech.sql === true);
  const sql = TECHNOLOGIES.find((tech) => tech.name === "sql")!;
  if (!hasSqlDriver && [...imported].some(isSqlClient)) addStore(sql);
  // Tables of schemas go to the store of their technology, or a database of their own.
  for (const schema of schemas) {
    // `sql` (a `.sql` file, a Prisma schema without a provider) is the SQL database the code talks to, if one.
    const named = schema.tech === "sql" ? undefined : TECHNOLOGIES.find((item) => item.name === schema.tech && item.kind === "db");
    const tech = named ?? [...stores.values()].find(({ tech: item }) => item.sql === true)?.tech ?? sql;
    addStore(tech);
    const store = stores.get(tech.name)!.component;
    for (const table of schema.tables) if (!store.tables.some((known) => known.name === table.name)) store.tables.push({ ...table, component: store.name });
  }

  const http = services.filter((service) => (byLayer.get(service.code[0] ?? "") ?? []).some((entry) => HTTP.has(entry.kind)));
  if (http.length > 0) {
    let name = "client";
    for (let n = 2; names.has(name); n++) name = `client-${n}`;
    names.add(name);
    system.components.push(component(name, "client", "HTTP", []));
    for (const service of http) system.relations.push({ from: name, verb: "calls", to: service.name, caption: "HTTP", line: 0, col: 0, span: NO_SPAN });
  }
  system.components.push(...services, ...[...stores.values()].map((store) => store.component));

  // Relations: an import path from a component's code to a driver, or to another component's code.
  for (const service of services) {
    const start = modulesUnder(graph, service.code);
    const consumer = (byLayer.get(service.code[0] ?? "") ?? []).some((entry) => entry.kind === "consumer");
    for (const other of services) {
      if (other === service) continue;
      const targets = new Set(modulesUnder(graph, other.code));
      if (reach(graph, start, (module) => targets.has(module) && !start.includes(module)) !== null) system.relations.push({ from: service.name, verb: "calls", to: other.name, caption: "import", line: 0, col: 0, span: NO_SPAN });
    }
    for (const { tech, component: store } of stores.values()) {
      const drivers = evidenceIds(tech);
      if (reach(graph, start, (module) => [...(graph.packages.get(module) ?? [])].some((pkg) => drivers.has(pkg))) === null) continue;
      const verb: RelationVerb = tech.kind === "queue" ? (consumer ? "consumes" : "publishes") : tech.kind === "external" || tech.kind === "auth" ? "calls" : "uses";
      system.relations.push({ from: service.name, verb, to: store.name, caption: null, line: 0, col: 0, span: NO_SPAN });
    }
  }

  system.sequences = sequencesOf(snapshot, graph, entries, services, [...stores.values()], http.length > 0 ? system.components[0]!.name : null);
  return system;
}

const NO_SPAN = { start: { offset: 0, line: 0, col: 0 }, end: { offset: 0, line: 0, col: 0 } };

/** The nearest fn at or above an ID, or null (a module's top level). */
function fnOf(snapshot: AnalysisSnapshot, id: string): string | null {
  for (let at = id; at !== ""; at = at.includes(".") ? at.slice(0, at.lastIndexOf(".")) : "") {
    const node = snapshot.nodes[at];
    if (node?.kind === "fn") return at;
    if (node?.kind === "module" && node.class !== true) return null;
  }
  return null;
}

/**
 * A sequence per entry point (HTTP first, then background, then the rest; at
 * most 20): from the entry's fn, its calls in source order depth first, to
 * depth 6, each fn once; a call into the code of another component is a
 * message to it (and the walk goes on there), a call into a driver a message
 * to that store. A call on a value (`pool.query`) is unresolved in the
 * snapshot: in a fn of a module that imports one store's driver it is taken
 * as a message to that store — a guess by the module, said so in the docs.
 * Entries whose walk meets no other component are left out.
 */
function sequencesOf(
  snapshot: AnalysisSnapshot,
  graph: ModuleGraph,
  entries: readonly EntryPoint[],
  services: readonly SystemComponent[],
  stores: readonly { tech: Technology; component: SystemComponent }[],
  client: string | null,
): SystemSequence[] {
  const calls = new Map<string, { target: string | null; text: string; line: number; col: number }[]>();
  for (const edge of snapshot.edges) {
    if (edge.kind !== "call") continue;
    const from = fnOf(snapshot, edge.source) ?? edge.source;
    calls.set(from, [...(calls.get(from) ?? []), { target: edge.target, text: edge.text, line: edge.line, col: edge.col }]);
  }
  const moduleOf = (id: string): string | null => {
    for (let at = id; at !== ""; at = at.includes(".") ? at.slice(0, at.lastIndexOf(".")) : "") if (graph.modules.has(at)) return at;
    return null;
  };
  /** The one store whose driver a module imports, or null for none or several. */
  const storeOfModule = new Map<string, SystemComponent | null>();
  const moduleStore = (module: string | null): SystemComponent | null => {
    if (module === null) return null;
    if (!storeOfModule.has(module)) {
      const found = new Set<SystemComponent>();
      for (const pkg of graph.packages.get(module) ?? []) {
        for (const store of stores) if (evidenceIds(store.tech).has(pkg)) found.add(store.component);
      }
      storeOfModule.set(module, found.size === 1 ? [...found][0]! : null);
    }
    return storeOfModule.get(module)!;
  };
  for (const list of calls.values()) list.sort((a, b) => a.line - b.line || a.col - b.col);
  const ownerOf = (id: string): SystemComponent | null => services.find((service) => service.code.some((code) => id === code || id.startsWith(`${code}.`))) ?? null;
  const storeOf = (pkg: string): SystemComponent | null => {
    for (const store of stores) if (evidenceIds(store.tech).has(pkg)) return store.component;
    return null;
  };
  const rank = (entry: EntryPoint): number => (HTTP.has(entry.kind) ? 0 : BACKGROUND.has(entry.kind) ? 1 : 2);
  const ordered = [...entries].sort((a, b) => rank(a) - rank(b) || compareText(a.label, b.label));
  const out: SystemSequence[] = [];
  const used = new Set<string>();
  for (const entry of ordered) {
    if (out.length >= MAX_SEQUENCES) break;
    const owner = ownerOf(entry.id);
    if (owner === null) continue;
    const messages: SystemMessage[] = [];
    if (client !== null && HTTP.has(entry.kind)) messages.push({ from: client, to: owner.name, text: entry.label, async: false, line: 0 });
    const seen = new Set<string>();
    const walk = (fn: string, at: SystemComponent, depth: number): void => {
      if (depth > MAX_CALL_DEPTH || seen.has(fn) || messages.length >= MAX_MESSAGES) return;
      seen.add(fn);
      for (const call of calls.get(fn) ?? []) {
        if (messages.length >= MAX_MESSAGES) return;
        if (call.target === null) {
          const store = moduleStore(moduleOf(fn));
          if (store === null) continue;
          const text = call.text.replace(/\s+/g, " ").slice(0, 40);
          const last = messages.at(-1);
          if (!(last && last.from === at.name && last.to === store.name)) messages.push({ from: at.name, to: store.name, text, async: store.kind === "queue", line: 0 });
          continue;
        }
        const pkg = externalPackageId(call.target);
        if (pkg !== null) {
          const store = storeOf(pkg);
          if (store === null) continue;
          const text = call.target.slice(EXTERNAL.length + 1);
          const last = messages.at(-1);
          if (!(last && last.from === at.name && last.to === store.name && last.text === text)) messages.push({ from: at.name, to: store.name, text, async: store.kind === "queue", line: 0 });
          continue;
        }
        const next = ownerOf(call.target);
        if (next !== null && next !== at) messages.push({ from: at.name, to: next.name, text: call.target.slice(call.target.lastIndexOf(".") + 1), async: false, line: 0 });
        walk(call.target, next ?? at, depth + 1);
      }
    };
    walk(entry.id, owner, 0);
    const crossing = messages.filter((message) => !(message.from === client && message.to === owner.name));
    if (crossing.length === 0) continue;
    let name = segmentOf(entry.label, "entry");
    for (let n = 2; used.has(name); n++) name = `${segmentOf(entry.label, "entry")}-${n}`;
    used.add(name);
    out.push({ name, messages, line: 0 });
  }
  return out;
}

/** The discovered system as a `# system` section: what `keylang system discover` prints. */
export function systemMarkdown(system: SystemSpec, name: string): string {
  const lines: string[] = [`# system ${name}`, "", "<!-- keylang system discover: from the code's entry points, layers and imported packages; adopt it by editing -->", ""];
  for (const component of system.components) {
    lines.push(`- ${component.kind} ${component.name}${component.tech ? ` ${component.tech}` : ""}`);
    if (component.code.length > 0) lines.push(`  - code ${component.code.join(", ")}`);
    for (const relation of system.relations) if (relation.from === component.name) lines.push(`  - ${relation.verb} ${relation.to}${relation.caption ? ` ${relation.caption}` : ""}`);
    for (const table of component.tables) {
      lines.push(`  - table ${table.name}`);
      for (const column of table.columns) lines.push(`    - ${column.name} ${column.type}${column.pk ? " pk" : ""}${column.unique ? " unique" : ""}${column.nullable ? " null" : ""}${column.fk ? ` fk ${column.fk.table}.${column.fk.column}` : ""}`);
      for (const index of table.indexes) lines.push(`    - index ${index.text}`);
    }
  }
  for (const sequence of system.sequences) {
    lines.push(`- sequence ${sequence.name}`);
    for (const message of sequence.messages) lines.push(`  - ${message.from} ${message.async ? "⇢" : "→"} ${message.to}${message.text ? ` ${message.text}` : ""}`);
  }
  return `${lines.join("\n")}\n`;
}


