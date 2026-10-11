// `# system <name>` (system-design/02): the sections compiled into a
// `SystemSpec` — components with their zones, relations, tables, sequences
// and interview notes — and what `check` says of them. Names are local to a
// system: an unknown component is K401, an `fk` to an unknown table or
// column K402, a second declaration K002. A relation from a component bound
// to code (`- code <id>`) is judged by the static graph (Р9): `ok` when the
// bound code reaches, through its imports, a driver of the target's
// technology or the target's own code; `unverified` otherwise — a network
// call is invisible to the graph, so the system never says `fail`. K403
// warns when the bound code reaches a driver no relation of it names.

import { createHash } from "node:crypto";
import { diagnostic, type Diagnostic } from "./diag.ts";
import { externalPackageId, EXTERNAL } from "./external-ids.ts";
import { sectionNodes, type Document, type Node } from "./ir.ts";
import type { ComponentKind } from "./parser.ts";
import { nearestName } from "./resolve.ts";
import { compareText, type Span } from "./span.ts";
import { evidenceIds, technologiesOfPackage, technologyOf, type Technology } from "./system-catalog.ts";
import type { Verdict, VerdictKind } from "./verdict.ts";

export interface SystemZone {
  name: string;
  label: string | null;
  /** The enclosing zone, or null at the top. */
  parent: string | null;
  line: number;
}

export interface SystemColumn {
  name: string;
  type: string;
  pk: boolean;
  unique: boolean;
  nullable: boolean;
  fk: { table: string; column: string; span: Span } | null;
  line: number;
}

export interface SystemTable {
  name: string;
  /** The data store it lives in. */
  component: string;
  columns: SystemColumn[];
  indexes: { text: string; line: number }[];
  description: string;
  line: number;
}

export interface SystemComponent {
  name: string;
  kind: ComponentKind;
  /** The technology as written (`postgres 16`), or null. */
  tech: string | null;
  /** The innermost zone, or null. */
  zone: string | null;
  /** Map IDs of `- code` lines. */
  code: string[];
  scale: string | null;
  description: string;
  tables: SystemTable[];
  line: number;
  col: number;
}

export type RelationVerb = "calls" | "reads" | "writes" | "publishes" | "consumes" | "replicates" | "uses";

export interface SystemRelation {
  from: string;
  verb: RelationVerb;
  to: string;
  caption: string | null;
  line: number;
  col: number;
  /** Of the target name. */
  span: Span;
}

export interface SystemMessage {
  from: string;
  to: string;
  text: string | null;
  async: boolean;
  line: number;
}

export interface SystemSequence {
  name: string;
  messages: SystemMessage[];
  line: number;
}

export type NoteKind = "requirement" | "nfr" | "estimate" | "tradeoff" | "question";

export interface SystemSpec {
  name: string;
  file: string;
  line: number;
  zones: SystemZone[];
  components: SystemComponent[];
  relations: SystemRelation[];
  sequences: SystemSequence[];
  notes: { kind: NoteKind; text: string; line: number }[];
}

/** Every `# system` section of the documents in file and line order, and the diagnostics of their names (K002, K401, K402). */
export function systemsOf(docs: readonly Document[]): { systems: SystemSpec[]; diagnostics: Diagnostic[] } {
  const systems: SystemSpec[] = [];
  const diagnostics: Diagnostic[] = [];
  const seen = new Map<string, { file: string; span: Span }>();

  for (const doc of docs) {
    for (const section of doc.sections) {
      if (section.kind !== "system" || section.name === null) continue;
      const name = section.name.value;
      const first = seen.get(name);

      if (first) diagnostics.push(diagnostic("K002", doc.path, section.name.span, `duplicate system \`${name}\` (first declared at ${first.file}:${first.span.start.line}:${first.span.start.col})`));
      else seen.set(name, { file: doc.path, span: section.name.span });
      const compiled = compileSystem(doc.path, name, section.name.span.start.line, sectionNodes(section), diagnostics);

      if (!first) systems.push(compiled);
    }
  }

  return { systems, diagnostics };
}

function compileSystem(file: string, name: string, line: number, nodes: readonly Node[], diagnostics: Diagnostic[]): SystemSpec {
  const system: SystemSpec = { name, file, line, zones: [], components: [], relations: [], sequences: [], notes: [] };
  const declared = new Map<string, Span>();

  const declare = (what: string, scope: Map<string, Span>, value: string, span: Span): boolean => {
    const prev = scope.get(value);

    if (prev) {
      diagnostics.push(diagnostic("K002", file, span, `duplicate ${what} \`${value}\` (first declared at ${file}:${prev.start.line}:${prev.start.col})`));

      return false;
    }

    scope.set(value, span);

    return true;
  };

  const text = (node: Node): string => node.description.map((line) => line.value).join("\n");
  const sequenceNames = new Map<string, Span>();
  const pendingRefs: { name: string; span: Span; what: string }[] = [];

  const visit = (node: Node, zone: string | null): void => {
    if (node.kind === "zone" && node.name) {
      if (declare("zone", declared, node.name.value, node.name.span)) system.zones.push({ name: node.name.value, label: node.text?.value ?? null, parent: zone, line: node.span.start.line });

      for (const child of node.children) visit(child, node.name.value);
    } else if (node.kind === "component" && node.name && node.label) {
      if (!declare("component", declared, node.name.value, node.name.span)) return;
      const component: SystemComponent = { name: node.name.value, kind: node.label.value as ComponentKind, tech: node.text?.value ?? null, zone, code: [], scale: null, description: text(node), tables: [], line: node.span.start.line, col: node.name.span.start.col };
      system.components.push(component);
      const tables = new Map<string, Span>();

      for (const child of node.children) {
        if (child.kind === "code") component.code.push(...child.refs.map((ref) => ref.target));
        else if (child.kind === "scale") component.scale = child.text?.value ?? null;
        else if (child.kind === "relation" && child.name && child.label) {
          system.relations.push({ from: component.name, verb: child.label.value as RelationVerb, to: child.name.value, caption: child.text?.value ?? null, line: child.span.start.line, col: child.span.start.col, span: child.name.span });
          pendingRefs.push({ name: child.name.value, span: child.name.span, what: `\`${child.label.value}\`` });
        } else if (child.kind === "table" && child.name && declare("table", tables, child.name.value, child.name.span)) {
          component.tables.push(compileTable(file, component.name, child, diagnostics));
        }
      }
    } else if (node.kind === "sequence" && node.name) {
      if (!declare("sequence", sequenceNames, node.name.value, node.name.span)) return;
      const sequence: SystemSequence = { name: node.name.value, messages: [], line: node.span.start.line };

      for (const child of node.children) {
        if (child.kind !== "message" || !child.name || !child.label) continue;
        const arrow = child.tokens[1]?.text;
        sequence.messages.push({ from: child.name.value, to: child.label.value, text: child.text?.value ?? null, async: arrow === "⇢" || arrow === "-->", line: child.span.start.line });
        pendingRefs.push({ name: child.name.value, span: child.name.span, what: "the message" }, { name: child.label.value, span: child.label.span, what: "the message" });
      }

      system.sequences.push(sequence);
    } else if ((node.kind === "requirement" || node.kind === "nfr" || node.kind === "estimate" || node.kind === "tradeoff" || node.kind === "question") && node.text) {
      system.notes.push({ kind: node.kind, text: node.text.value, line: node.span.start.line });
    }
  };

  for (const node of nodes) visit(node, null);
  const components = new Set(system.components.map((component) => component.name));

  for (const ref of pendingRefs) {
    if (components.has(ref.name)) continue;
    const near = nearestName(ref.name, components);
    diagnostics.push(diagnostic("K401", file, ref.span, `unknown component \`${ref.name}\` in ${ref.what} of system \`${name}\`${near === undefined ? "" : ` (did you mean \`${near}\`?)`}`));
  }

  checkForeignKeys(file, system, diagnostics);

  return system;
}

function compileTable(file: string, component: string, node: Node, diagnostics: Diagnostic[]): SystemTable {
  const table: SystemTable = { name: node.name!.value, component, columns: [], indexes: [], description: node.description.map((line) => line.value).join("\n"), line: node.span.start.line };
  const columns = new Map<string, Span>();

  for (const child of node.children) {
    if (child.kind === "index" && child.text) table.indexes.push({ text: child.text.value, line: child.span.start.line });

    if (child.kind !== "column" || !child.name || !child.text) continue;
    const flags = child.tokens.slice(2);
    const words = flags.map((token) => token.text);
    const at = words.indexOf("fk");
    const target = at === -1 ? undefined : flags[at + 1];
    const [fkTable, fkColumn] = target ? target.text.split(".") : [];

    if (columns.has(child.name.value)) {
      const prev = columns.get(child.name.value)!;
      diagnostics.push(diagnostic("K002", file, child.name.span, `duplicate column \`${child.name.value}\` of table \`${table.name}\` (first declared at ${file}:${prev.start.line}:${prev.start.col})`));
      continue;
    }

    columns.set(child.name.value, child.name.span);
    table.columns.push({
      name: child.name.value,
      type: child.text.value,
      pk: words.includes("pk"),
      unique: words.includes("unique"),
      nullable: words.includes("null"),
      fk: target && fkTable && fkColumn ? { table: fkTable, column: fkColumn, span: target.span } : null,
      line: child.span.start.line,
    });
  }

  return table;
}

/** K402: an `fk` names a table of no data store of the system, or a column that table does not have. */
function checkForeignKeys(file: string, system: SystemSpec, diagnostics: Diagnostic[]): void {
  const tables = new Map<string, SystemTable>();

  for (const component of system.components) for (const table of component.tables) if (!tables.has(table.name)) tables.set(table.name, table);

  for (const table of tables.values()) {
    for (const column of table.columns) {
      if (column.fk === null) continue;
      const target = tables.get(column.fk.table);

      if (!target) {
        const near = nearestName(column.fk.table, tables.keys());
        diagnostics.push(diagnostic("K402", file, column.fk.span, `\`fk\` names table \`${column.fk.table}\`, which no data store of system \`${system.name}\` has${near === undefined ? "" : ` (did you mean \`${near}\`?)`}`));
      } else if (!target.columns.some((other) => other.name === column.fk!.column)) {
        diagnostics.push(diagnostic("K402", file, column.fk.span, `\`fk\` names column \`${column.fk.column}\`, which table \`${target.name}\` does not have`));
      }
    }
  }
}

// ── evidence ────────────────────────────────────────────────────────────────

/** What the system check reads of a snapshot. */
export interface SystemSnapshot {
  snapshotId: string;
  nodes: Readonly<Record<string, { kind: string; class?: boolean }>>;
  edges: readonly { kind: string; source: string; target: string | null }[];
}

/** The repository's modules and their dependencies, module to module, and the packages each imports. */
export interface ModuleGraph {
  modules: ReadonlySet<string>;
  out: ReadonlyMap<string, ReadonlySet<string>>;
  packages: ReadonlyMap<string, ReadonlySet<string>>;
}

/** The module an ID lies in: itself or the nearest module above it, never a package; null for none. */
function moduleOf(nodes: SystemSnapshot["nodes"], id: string): string | null {
  for (let at = id; at !== ""; at = at.includes(".") ? at.slice(0, at.lastIndexOf(".")) : "") {
    const node = nodes[at];

    if (node?.kind === "module" && node.class !== true) return at.startsWith(`${EXTERNAL}.`) ? null : at;
  }

  return null;
}

export function moduleGraph(snapshot: SystemSnapshot): ModuleGraph {
  const modules = new Set<string>();

  for (const [id, node] of Object.entries(snapshot.nodes)) if (node.kind === "module" && node.class !== true && !id.startsWith(`${EXTERNAL}.`)) modules.add(id);
  const out = new Map<string, Set<string>>();
  const packages = new Map<string, Set<string>>();

  const add = (map: Map<string, Set<string>>, key: string, value: string): void => {
    let set = map.get(key);

    if (!set) map.set(key, (set = new Set()));
    set.add(value);
  };

  for (const edge of snapshot.edges) {
    if (edge.target === null) continue;
    const from = moduleOf(snapshot.nodes, edge.source);

    if (from === null) continue;
    const pkg = externalPackageId(edge.target);

    if (pkg !== null) add(packages, from, pkg);
    else {
      const to = moduleOf(snapshot.nodes, edge.target);

      if (to !== null && to !== from) add(out, from, to);
    }
  }

  return { modules, out, packages };
}

/** The modules of the repository the IDs name: each module equal to or under one of them. */
export function modulesUnder(graph: ModuleGraph, ids: readonly string[]): string[] {
  return [...graph.modules].filter((module) => ids.some((id) => module === id || module.startsWith(`${id}.`))).sort(compareText);
}

/**
 * The first module reached from `start` through imports for which `hit` holds,
 * with the path to it (start first); breadth first, so the path is a shortest.
 */
export function reach(graph: ModuleGraph, start: readonly string[], hit: (module: string) => boolean): string[] | null {
  const parent = new Map<string, string | null>();
  const queue: string[] = [];

  for (const module of start) if (!parent.has(module)) {
    parent.set(module, null);
    queue.push(module);
  }

  for (let i = 0; i < queue.length; i++) {
    const module = queue[i]!;

    if (hit(module)) {
      const path: string[] = [];

      for (let at: string | null = module; at !== null; at = parent.get(at) ?? null) path.unshift(at);

      return path;
    }

    for (const next of [...(graph.out.get(module) ?? [])].sort(compareText)) {
      if (parent.has(next)) continue;
      parent.set(next, module);
      queue.push(next);
    }
  }

  return null;
}

function pathText(path: readonly string[]): string {
  return path.length <= 3 ? path.map((id) => `\`${id}\``).join(" → ") : `\`${path[0]}\` → … → \`${path.at(-1)}\` (${path.length - 1} imports)`;
}

/** `check` of every `# system`: K002/K401/K402 of the names, the `system` verdicts of relations from bound code, K403. */
export function systemCheck(docs: readonly Document[], snapshot: SystemSnapshot | null): { systems: SystemSpec[]; diagnostics: Diagnostic[]; verdicts: Verdict[] } {
  const { systems, diagnostics } = systemsOf(docs);
  const verdicts: Verdict[] = [];

  if (snapshot === null) return { systems, diagnostics, verdicts };
  const graph = moduleGraph(snapshot);

  for (const system of systems) {
    const byName = new Map(system.components.map((component) => [component.name, component]));

    for (const relation of system.relations) {
      const from = byName.get(relation.from);
      const to = byName.get(relation.to);

      if (!from || !to || from.code.length === 0) continue;
      const result = judge(graph, from, to);

      if (result === null) continue;
      const criterion = `system ${system.name}`;
      const area = `${relation.from} ${relation.verb} ${relation.to}`;
      verdicts.push({
        verdict: result.verdict,
        criterion,
        area,
        snapshotId: snapshot.snapshotId,
        specHash: createHash("sha256").update(`${criterion}: ${area}`).digest("hex"),
        file: system.file,
        line: relation.line,
        col: relation.col,
        code: null,
        message: `${area}: ${result.reason}`,
        evidence: { provenance: "syntactic" },
      });
    }

    for (const component of system.components) undeclaredStores(system, component, graph, diagnostics);
  }

  return { systems, diagnostics, verdicts };
}

function judge(graph: ModuleGraph, from: SystemComponent, to: SystemComponent): { verdict: VerdictKind; reason: string } | null {
  const start = modulesUnder(graph, from.code);

  if (start.length === 0) return { verdict: "unverified", reason: `the snapshot has no module under ${from.code.map((id) => `\`${id}\``).join(", ")}` };

  if (to.code.length > 0) {
    const targets = new Set(modulesUnder(graph, to.code));
    const path = reach(graph, start, (module) => targets.has(module) && !start.includes(module));

    return path !== null ? { verdict: "ok", reason: `${pathText(path)} imports the code of \`${to.name}\`` } : { verdict: "unverified", reason: `no import from the code of \`${from.name}\` reaches the code of \`${to.name}\`; a network call is not in the static graph` };
  }

  const tech = technologyOf(to.tech);

  if (tech === null) return null;
  const drivers = evidenceIds(tech);
  const path = reach(graph, start, (module) => [...(graph.packages.get(module) ?? [])].some((pkg) => drivers.has(pkg)));

  if (path === null) return { verdict: "unverified", reason: `no import from the code of \`${from.name}\` reaches a ${tech.name} client (${[...drivers].slice(0, 4).map((id) => `\`${id}\``).join(", ")}…)` };
  const pkg = [...graph.packages.get(path.at(-1)!)!].filter((id) => drivers.has(id)).sort(compareText)[0]!;

  return { verdict: "ok", reason: `${pathText(path)} imports \`${pkg}\`` };
}

/** K403: the code of a component reaches a driver of exactly one technology, and no relation of the component goes to a component of it. */
function undeclaredStores(system: SystemSpec, component: SystemComponent, graph: ModuleGraph, diagnostics: Diagnostic[]): void {
  if (component.code.length === 0) return;
  const start = modulesUnder(graph, component.code);
  const named = new Set<string>();

  for (const relation of system.relations) {
    if (relation.from !== component.name) continue;
    const tech = technologyOf(system.components.find((other) => other.name === relation.to)?.tech);

    if (tech) named.add(tech.name);
  }

  const reported = new Set<string>();
  const seen = new Set<string>();
  const queue = [...start];

  for (const module of queue) seen.add(module);

  for (let i = 0; i < queue.length; i++) {
    const module = queue[i]!;

    for (const pkg of [...(graph.packages.get(module) ?? [])].sort(compareText)) {
      const techs = technologiesOfPackage(pkg);
      const tech: Technology | undefined = techs.length === 1 ? techs[0] : undefined;

      if (!tech || tech.kind === "external" || tech.kind === "auth" || named.has(tech.name) || reported.has(tech.name)) continue;
      reported.add(tech.name);
      diagnostics.push(diagnostic("K403", system.file, { start: { offset: 0, line: component.line, col: component.col }, end: { offset: 0, line: component.line, col: component.col } }, `the code of \`${component.name}\` imports \`${pkg}\` (${tech.name}) in \`${module}\`, but no relation of \`${component.name}\` goes to a ${tech.name} component`));
    }

    for (const next of graph.out.get(module) ?? []) if (!seen.has(next)) {
      seen.add(next);
      queue.push(next);
    }
  }
}
