// Analysis snapshot: the versioned fact store written to `.keylang/index.json`.
// Markdown maps are a projection of the graph; `check` in later tickets reads this file.
// `generated` is wall-clock metadata and is not part of `snapshotId`.

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import type { Config } from "./config.ts";
import { layerName } from "./config.ts";
import type { FileFacts } from "./extract/facts.ts";
import type { Gap, Graph, Module } from "./graph.ts";

export const SNAPSHOT_SCHEMA = 4;
/** Bump when extraction or resolution changes the facts that `snapshotId` covers. */
export const EXTRACTOR_VERSION = "m1.3";

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
}

export interface SnapshotExport {
  module: string;
  /** Public name. `*` marks an `export * from` whose names are unknown (`reason`). */
  name: string;
  symbol: string | null;
  kind: "fn" | "class" | "type" | "value" | "reexport";
  /** How the name is exported when it is not a plain declaration. */
  form?: "alias" | "default" | "reexport";
  /** Module an `export *` row comes from. */
  from?: string;
  reason?: string;
}

export interface CoverageItem {
  kind: Gap["kind"] | "skipped-file";
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
  layer: string;
  file: string | null;
  line: number | null;
  col: number | null;
  /** End of the declaration. `endCol` is the column after the fragment. */
  endLine?: number;
  endCol?: number;
  signature?: string | null;
  exported?: boolean;
  members?: "complete" | "opaque";
  /** Generator comment, such as an external package name or `internal` on a class. */
  comment?: string;
  deps?: string[];
  dependents?: string[];
  calls?: string[];
  callers?: string[];
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
  facts: readonly FileFacts[],
  files: readonly { path: string; sha256: string }[],
  skipped: readonly { file: string; reason: string }[],
): AnalysisSnapshot {
  const manifestFiles = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const grammars = grammarVersions();
  const manifestConfig = {
    dir: config.dir,
    languages: [...config.languages],
    module: config.module,
    layers: Object.fromEntries(config.layers),
    exclude: [...config.exclude],
    guessed: config.guessed,
  };
  const snapshotId = sha256(
    JSON.stringify({
      schema: SNAPSHOT_SCHEMA,
      extractor: EXTRACTOR_VERSION,
      grammars,
      config: manifestConfig,
      files: manifestFiles,
    }),
  );

  const nodes: Record<string, SnapshotNode> = {};
  const visit = (m: Module): void => {
    const moduleNode: SnapshotNode = {
      kind: "module",
      layer: m.layer,
      file: m.path,
      line: m.line,
      col: m.col,
      members: m.members,
      deps: m.deps.map((d) => d.target),
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
        file: m.path,
        line: f.line,
        col: f.col,
        endLine: f.endLine,
        endCol: f.endCol,
        signature: f.signature,
        exported: f.exported,
        calls: f.calls.map((c) => c.target),
        callers: [],
      };
      nodes[f.id] = fn;
    }
    for (const t of m.types) {
      nodes[t.id] = {
        kind: "type",
        layer: m.layer,
        file: m.path,
        line: t.line,
        col: t.col,
        endLine: t.endLine,
        endCol: t.endCol,
        signature: t.signature,
        exported: t.exported,
      };
    }
    for (const c of m.children) visit(c);
  };
  for (const l of graph.layers) {
    nodes[l.name] = { kind: "layer", layer: l.name, file: null, line: null, col: null };
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
        file: m.path,
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
          file: m.path,
          line: c.line,
          col: c.col,
          endLine: c.endLine,
          endCol: c.endCol,
          text: c.text,
          resolution: "resolved",
          provenance: "syntactic",
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
  for (const { file, reason } of skipped) {
    coverage.push({ kind: "skipped-file", file, line: 1, col: 1, endLine: 1, endCol: 1, text: "", reason, source: graph.byPath.get(file)?.id ?? null });
  }
  coverage.sort(compareCoverage);

  return {
    schema: SNAPSHOT_SCHEMA,
    snapshotId,
    generated: new Date().toISOString(),
    manifest: { extractor: EXTRACTOR_VERSION, grammars, config: manifestConfig, files: manifestFiles },
    nodes: ordered,
    edges,
    exports: exportTable(graph, facts),
    coverage,
    stats: graph.stats,
  };
}

function exportTable(graph: Graph, facts: readonly FileFacts[]): SnapshotExport[] {
  const own = new Map<string, SnapshotExport[]>();
  const stars = new Map<string, Module>();
  for (const file of facts) {
    const module = graph.byPath.get(file.path);
    if (!module) continue;
    const rows = own.get(module.id) ?? [];
    own.set(module.id, rows);
    stars.set(module.id, module);
    const listed = file.exportRows.length > 0 ? file.exportRows : [...file.exports].sort().map((name) => ({ name, kind: "value" as const, local: name }));
    for (const row of listed) {
      if (row.name === "*" && row.kind === "reexport") continue;
      if (rows.some((item) => item.name === row.name)) continue;
      const symbol = row.kind === "alias" && isForeign(file, row) ? null : findSymbol(module, row.local ?? row.name);
      const kind = symbol?.kind ?? (row.kind === "fn" || row.kind === "class" || row.kind === "type" ? row.kind : "value");
      const form = row.kind === "alias" || row.kind === "default" ? row.kind : row.name === "default" ? "default" : undefined;
      rows.push({ module: module.id, name: row.name, symbol: symbol?.id ?? null, kind, ...(form ? { form } : {}) });
    }
  }
  // `export * from "./x"` re-exports every name of x except `default`, transitively.
  const expanded = new Map<string, SnapshotExport[]>();
  const expand = (id: string, visiting: Set<string>): SnapshotExport[] => {
    const done = expanded.get(id);
    if (done) return done;
    const rows = [...(own.get(id) ?? [])];
    const module = stars.get(id);
    if (module && !visiting.has(id)) {
      visiting.add(id);
      for (const star of module.starSources) {
        if (star.target === null || !own.has(star.target)) {
          rows.push({ module: id, name: "*", symbol: null, kind: "reexport", form: "reexport", reason: star.reason || `re-export from \`${star.target}\`` });
          continue;
        }
        for (const row of expand(star.target, visiting)) {
          if (row.name === "default" || rows.some((item) => item.name === row.name)) continue;
          rows.push({ ...row, module: id, form: "reexport", from: row.from ?? star.target });
        }
      }
      visiting.delete(id);
    }
    expanded.set(id, rows);
    return rows;
  };
  const out = [...own.keys()].flatMap((id) => expand(id, new Set()));
  out.sort((a, b) => (a.module < b.module ? -1 : a.module > b.module ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return out;
}

/** `export { a as b } from "./x"` names a symbol of x, not a local declaration. */
function isForeign(file: FileFacts, row: { name: string }): boolean {
  return file.imports.some((imp) => imp.reexport && imp.bindings.some((binding) => binding.local === row.name));
}

function findSymbol(m: Module, name: string): { id: string; kind: "fn" | "class" | "type" } | null {
  const key = layerName(name);
  const fn = m.fns.find((f) => f.name === key);
  if (fn) return { id: fn.id, kind: "fn" };
  const type = m.types.find((t) => t.name === key);
  if (type) return { id: type.id, kind: "type" };
  const child = m.children.find((c) => c.name === key && !c.synthetic);
  if (child) return { id: child.id, kind: "class" };
  return null;
}

function compareCoverage(a: CoverageItem, b: CoverageItem): number {
  return cmp(a.file, b.file) || a.line - b.line || cmp(a.kind, b.kind) || cmp(a.reason, b.reason);
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function grammarVersions(): Record<string, string> {
  const require = createRequire(import.meta.url);
  const version = (name: string): string => {
    try {
      return (require(`${name}/package.json`) as { version?: string }).version ?? "unknown";
    } catch {
      return "unknown";
    }
  };
  return {
    "web-tree-sitter": version("web-tree-sitter"),
    "@vscode/tree-sitter-wasm": version("@vscode/tree-sitter-wasm"),
  };
}
