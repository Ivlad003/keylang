// Analysis snapshot: the versioned fact store written to `.keylang/index.json`.
// Markdown maps are a projection of the graph; `check` in later tickets reads this file.
// `generated` is wall-clock metadata and is not part of `snapshotId`.

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import type { Config } from "./config.ts";
import type { ExportEntry } from "./exports.ts";
import { briefOf } from "./brief.ts";
import type { Gap, Graph, Module } from "./graph.ts";
import { constructorName } from "./languages.ts";
import { components } from "./scc.ts";

export const SNAPSHOT_SCHEMA = 7;
/** Bump when extraction or resolution changes the facts that `snapshotId` covers. */
export const EXTRACTOR_VERSION = "m1.9";

export type Resolution = "resolved" | "ambiguous" | "unresolved";
export type Provenance = "syntactic";
export type EdgeKind = "import" | "call" | "type" | "reexport";

export interface SnapshotEdge {
  kind: EdgeKind;
  source: string;
  /** One symbol, or null when the reference is ambiguous or unresolved. */
  target: string | null;
  /** Every symbol this reference might name. Present when `resolution` is `ambiguous`. */
  candidates?: string[];
  /** Dependency alias, only for import and reexport edges. The map prints `- <alias> <target>`. */
  alias?: string;
  file: string | null;
  /** 1-based start. `endCol` is the column after the fragment. */
  line: number;
  col: number;
  endLine: number;
  endCol: number;
  /** Source text of the reference. */
  text: string;
  resolution: Resolution;
  provenance: Provenance;
  reason?: string;
  /**
   * A call edge that is not a call written in the code: `default` — the default
   * of a hook (`request.generate ?? generateMap`); `injected` — a value a
   * resolved caller passes for that hook, at `site`. `keylang check
   * --static=shape` does not follow them; rules do not see `injected`.
   */
  via?: "default" | "injected";
  /** The local, parameter or field the hook call goes through. */
  hook?: string;
  /** `file:line:col` of the call that passes the injected value. */
  site?: string;
  /** The call sits in a closure of `source`: whoever holds that function value may run it. */
  closure?: true;
}

export interface SnapshotExport {
  module: string;
  /**
   * Public name importers use: `default` for `export default …`, `export =`
   * and `module.exports = …`. `*` marks an `export * from` whose names are
   * unknown (`reason`).
   */
  name: string;
  /**
   * Node the name stands for, through aliases, re-export chains and `export *`:
   * a fn, a class, a type, or the module of a namespace (`form: namespace`).
   * Null when it is no declaration keylang indexes (`export default 3`, a package's name).
   */
  symbol: string | null;
  kind: "fn" | "class" | "type" | "value" | "reexport";
  /**
   * How the name is exported; absent for a declaration under its own name.
   * `alias`: `export { a as b }`; `default`: the default export;
   * `reexport`: a name of another module (`from`); `namespace`: a module
   * object (`export * as ns from`, `export namespace N {}`).
   */
  form?: "alias" | "default" | "reexport" | "namespace";
  /** The local or source name when it differs from `name`: `a` for `export { a as b }`, `main` for `export default function main`. */
  local?: string;
  /** Module the name is re-exported from (for `export *`, the module that exports it). */
  from?: string;
  reason?: string;
}

export interface CoverageItem {
  /** `outside-file`: a file `outside` puts outside the architecture; listed, but no hole. */
  kind: Gap["kind"] | "skipped-file" | "outside-file";
  file: string;
  line: number;
  col: number;
  endLine: number;
  endCol: number;
  text: string;
  reason: string;
  source: string | null;
}

export interface SnapshotNode {
  kind: "layer" | "module" | "fn" | "type";
  /** A module node that is a class declared in its parent module: its children are members, `<id>.constructor` (Python `<id>.__init__`) its constructor. */
  class?: true;
  layer: string;
  file: string | null;
  line: number | null;
  col: number | null;
  /** End of the declaration. `endCol` is the column after the fragment. */
  endLine?: number;
  endCol?: number;
  signature?: string | null;
  exported?: boolean;
  /** fn: a `static` class member, called on the class (`X.m()`). */
  static?: true;
  /** fn: the name as written, when the ID segment differs (`m` for `X.m-static`, `go` for `Y.go-private`). */
  name?: string;
  members?: "complete" | "opaque";
  /** Generator comment, such as an external package name or `internal` on a class. */
  comment?: string;
  /** Brief of the documentation comment in the code (`src/brief.ts`); null without one, and for a layer. */
  doc: string | null;
  deps?: string[];
  dependents?: string[];
  calls?: string[];
  callers?: string[];
  /** A fn that code may call without naming it in a call: read as a value, an accessor, or called implicitly. */
  escapes?: { file: string; line: number; col: number; reason: string };
  /** fn and type: SHA-256 of the declaration's syntax without comments and layout. */
  fingerprint?: string;
  /**
   * fn and type: the fingerprint of the node with everything it calls, transitively
   * (a call cycle hashes as one). `complete: false` when the node or something it
   * reaches has a call keylang did not resolve, or has no fingerprint.
   */
  closure?: { fingerprint: string; complete: boolean };
}

export interface AnalysisSnapshot {
  schema: typeof SNAPSHOT_SCHEMA;
  snapshotId: string;
  generated: string;
  manifest: {
    extractor: string;
    grammars: Record<string, string>;
    config: {
      dir: string;
      languages: string[];
      module: Config["module"];
      layers: Record<string, string[]>;
      exclude: string[];
      outside: string[];
      guessed: boolean;
    };
    files: { path: string; sha256: string }[];
  };
  nodes: Record<string, SnapshotNode>;
  edges: SnapshotEdge[];
  exports: SnapshotExport[];
  coverage: CoverageItem[];
  stats: Graph["stats"];
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function buildSnapshot(
  graph: Graph,
  config: Config,
  files: readonly { path: string; sha256: string }[],
  /** Files (or an unreadable directory) left out; `source`: the ID scope they belong to when no module has the file. */
  skipped: readonly { file: string; reason: string; source?: string; kind?: "skipped-file" | "outside-file" }[],
): AnalysisSnapshot {
  const manifestFiles = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const grammars = grammarVersions();
  const manifestConfig = {
    dir: config.dir,
    languages: [...config.languages],
    module: config.module,
    layers: Object.fromEntries(config.layers),
    exclude: [...config.exclude],
    outside: [...config.outside],
    guessed: config.guessed,
  };
  const snapshotId = sha256(
    JSON.stringify({
      schema: SNAPSHOT_SCHEMA,
      extractor: EXTRACTOR_VERSION,
      grammars,
      config: manifestConfig,
      files: manifestFiles,
      // `paths`, `references` and declared packages decide edges as much as the sources do.
      resolution: [...graph.resolverInputs].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([path, text]) => [path, text === null ? null : sha256(text)]),
    }),
  );

  const nodes: Record<string, SnapshotNode> = {};
  const visit = (m: Module): void => {
    const moduleNode: SnapshotNode = {
      kind: "module",
      ...(m.class ? { class: true as const } : {}),
      layer: m.layer,
      file: m.path,
      line: m.line,
      col: m.col,
      members: m.members,
      doc: docBrief(m.doc),
      deps: [...new Set(m.deps.map((d) => d.target))],
      dependents: [],
    };
    if (m.endLine !== null) moduleNode.endLine = m.endLine;
    if (m.endCol !== null) moduleNode.endCol = m.endCol;
    if (m.comment) moduleNode.comment = m.comment;
    nodes[m.id] = moduleNode;
    for (const f of m.fns) {
      const fn: SnapshotNode = {
        kind: "fn",
        layer: m.layer,
        file: f.file ?? m.path,
        line: f.line,
        col: f.col,
        endLine: f.endLine,
        endCol: f.endCol,
        signature: f.signature,
        exported: f.exported,
        ...(f.static ? { static: true as const } : {}),
        ...(f.written !== undefined ? { name: f.written } : {}),
        doc: docBrief(f.doc),
        calls: [...new Set(f.calls.filter((c) => c.via !== "injected").map((c) => c.target))],
        callers: [],
      };
      if (f.escapes) fn.escapes = f.escapes;
      if (f.fingerprint !== undefined) fn.fingerprint = sha256(`${f.signature ?? ""}\u0000${f.fingerprint}`);
      nodes[f.id] = fn;
    }
    for (const t of m.types) {
      nodes[t.id] = {
        kind: "type",
        layer: m.layer,
        file: t.file ?? m.path,
        line: t.line,
        col: t.col,
        endLine: t.endLine,
        endCol: t.endCol,
        signature: t.signature,
        exported: t.exported,
        doc: docBrief(t.doc),
        ...(t.fingerprint !== undefined ? { fingerprint: sha256(t.fingerprint) } : {}),
      };
    }
    for (const c of m.children) visit(c);
  };
  for (const l of graph.layers) {
    nodes[l.name] = { kind: "layer", layer: l.name, file: null, line: null, col: null, doc: null };
    for (const m of l.modules) visit(m);
  }
  for (const [id, n] of Object.entries(nodes)) {
    for (const d of n.deps ?? []) nodes[d]?.dependents?.push(id);
    for (const c of n.calls ?? []) nodes[c]?.callers?.push(id);
  }
  for (const n of Object.values(nodes)) {
    n.dependents?.sort();
    n.callers?.sort();
  }

  const ordered: Record<string, SnapshotNode> = {};
  for (const id of Object.keys(nodes).sort()) {
    const node = nodes[id];
    if (node) ordered[id] = node;
  }

  const edges: SnapshotEdge[] = [];
  const visitEdges = (m: Module): void => {
    for (const d of m.deps) {
      edges.push({
        kind: d.reexport ? "reexport" : "import",
        source: m.id,
        target: d.target,
        alias: d.alias,
        file: d.file,
        line: d.line,
        col: d.col,
        endLine: d.endLine,
        endCol: d.endCol,
        text: d.text,
        resolution: "resolved",
        provenance: "syntactic",
      });
    }
    for (const f of m.fns) {
      for (const c of f.calls) {
        edges.push({
          kind: "call",
          source: f.id,
          target: c.target,
          file: f.file ?? m.path,
          line: c.line,
          col: c.col,
          endLine: c.endLine,
          endCol: c.endCol,
          text: c.text,
          resolution: "resolved",
          provenance: "syntactic",
          ...(c.via ? { via: c.via } : {}),
          ...(c.hook ? { hook: c.hook } : {}),
          ...(c.site ? { site: c.site } : {}),
          ...(c.closure ? { closure: true as const } : {}),
        });
      }
    }
    for (const c of m.children) visitEdges(c);
  };
  for (const l of graph.layers) for (const m of l.modules) visitEdges(m);
  for (const open of graph.openEdges) {
    const edge: SnapshotEdge = {
      kind: open.kind,
      source: open.source,
      target: open.target,
      file: open.file,
      line: open.line,
      col: open.col,
      endLine: open.endLine,
      endCol: open.endCol,
      text: open.text,
      resolution: open.resolution,
      provenance: "syntactic",
    };
    if (open.candidates.length > 0) edge.candidates = open.candidates;
    edges.push(edge);
  }

  const coverage: CoverageItem[] = [];
  for (const gap of graph.gaps) {
    coverage.push({ kind: gap.kind, file: gap.file, line: gap.line, col: gap.col, endLine: gap.endLine, endCol: gap.endCol, text: gap.text, reason: gap.reason, source: gap.source });
    if (gap.kind === "unresolved-import" || gap.kind === "dynamic-call" || gap.kind === "unresolved-call") {
      edges.push({
        kind: gap.kind === "unresolved-import" ? "import" : "call",
        source: gap.source ?? gap.file,
        target: null,
        file: gap.file,
        line: gap.line,
        col: gap.col,
        endLine: gap.endLine,
        endCol: gap.endCol,
        text: gap.text,
        resolution: "unresolved",
        provenance: "syntactic",
        reason: gap.reason,
      });
    }
  }
  for (const { file, reason, source, kind } of skipped) {
    coverage.push({ kind: kind ?? "skipped-file", file, line: 1, col: 1, endLine: 1, endCol: 1, text: "", reason, source: source ?? graph.byPath.get(file)?.id ?? null });
  }
  coverage.sort(compareCoverage);
  closures(ordered, coverage);

  return {
    schema: SNAPSHOT_SCHEMA,
    snapshotId,
    generated: new Date().toISOString(),
    manifest: { extractor: EXTRACTOR_VERSION, grammars, config: manifestConfig, files: manifestFiles },
    nodes: ordered,
    edges,
    exports: graph.exports.map(exportRow),
    coverage,
    stats: graph.stats,
  };
}

/**
 * `closure` of every fn and type, bottom-up over strongly connected
 * components of the call graph: a component hashes its members' own
 * fingerprints with the closures it calls outside itself, so a cycle
 * terminates and every member of it changes together.
 */
function closures(nodes: Record<string, SnapshotNode>, coverage: readonly CoverageItem[]): void {
  const holes = new Set(coverage.filter((c) => c.kind === "dynamic-call" || c.kind === "unresolved-call").map((c) => c.source));
  // A hole in a declaration itself (a decorator or attribute macro that may replace it): what a call of
  // it runs is not the body keylang read. For a class it is every member, the constructor included.
  for (const c of coverage) {
    if (c.kind !== "unsupported" || c.source === null) continue;
    const owner = nodes[c.source];
    if (owner?.kind === "fn") holes.add(c.source);
    else if (owner?.class) for (const id of Object.keys(nodes)) if (id.startsWith(`${c.source}.`) && nodes[id]?.kind === "fn") holes.add(id);
  }
  // `new C()` (Python `C()`) names the class; what runs is its constructor, named by the class's language.
  const runs = (target: string): string | null => {
    if (nodes[target]?.kind === "fn") return target;
    const constructor = `${target}.${constructorName(nodes[target]?.file) ?? "constructor"}`;
    return nodes[target]?.class && nodes[constructor]?.kind === "fn" ? constructor : null;
  };
  const adj = new Map<string, Set<string>>();
  for (const [id, node] of Object.entries(nodes)) {
    if (node.kind !== "fn" && node.kind !== "type") continue;
    adj.set(id, new Set((node.calls ?? []).map(runs).filter((target): target is string => target !== null)));
  }
  const done = new Map<string, { fingerprint: string; complete: boolean }>();
  // Tarjan emits a component after every component it reaches.
  for (const component of components(adj)) {
    const members = [...component].sort();
    const inside = new Set(members);
    const outside = [...new Set(members.flatMap((id) => [...(adj.get(id) ?? [])]).filter((id) => !inside.has(id)))].sort();
    let complete = members.every((id) => nodes[id]?.fingerprint !== undefined && !holes.has(id));
    const parts = members.map((id) => `${id}=${nodes[id]?.fingerprint ?? "?"}`);
    for (const id of outside) {
      const closure = done.get(id);
      if (!closure?.complete) complete = false;
      parts.push(`${id}>${closure?.fingerprint ?? "?"}`);
    }
    const closure = { fingerprint: sha256(parts.join("\n")), complete };
    for (const id of members) {
      done.set(id, closure);
      const node = nodes[id];
      if (node) node.closure = closure;
    }
  }
}

function docBrief(doc: string | null | undefined): string | null {
  return doc ? briefOf(doc) : null;
}

/** A row of the graph's export table, with its fields in a fixed order. */
function exportRow(entry: ExportEntry): SnapshotExport {
  return {
    module: entry.module,
    name: entry.name,
    symbol: entry.symbol,
    kind: entry.kind,
    ...(entry.form ? { form: entry.form } : {}),
    ...(entry.local !== undefined ? { local: entry.local } : {}),
    ...(entry.from !== undefined ? { from: entry.from } : {}),
    ...(entry.reason !== undefined ? { reason: entry.reason } : {}),
  };
}

function compareCoverage(a: CoverageItem, b: CoverageItem): number {
  return cmp(a.file, b.file) || a.line - b.line || cmp(a.kind, b.kind) || cmp(a.reason, b.reason);
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function grammarVersions(): Record<string, string> {
  const require = createRequire(import.meta.url);
  // Literal specifiers: the import graph sees which packages the snapshot id depends on.
  const version = (load: () => unknown): string => {
    try {
      return (load() as { version?: string }).version ?? "unknown";
    } catch {
      return "unknown";
    }
  };
  return {
    "web-tree-sitter": version(() => require("web-tree-sitter/package.json")),
    "@vscode/tree-sitter-wasm": version(() => require("@vscode/tree-sitter-wasm/package.json")),
  };
}
