// Analysis snapshot: the versioned fact store written to `.keylang/index.json`.
// Markdown maps are a projection of the graph; `check` in later tickets reads this file.
// `generated` is wall-clock metadata and is not part of `snapshotId`.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "./config.ts";
import type { ExportEntry } from "./exports.ts";
import { briefOf } from "./brief.ts";
import { globDirectory } from "./glob.ts";
import type { Gap, Graph, Module, Via } from "./graph.ts";
import { constructorName, LANGUAGES, languageOf } from "./languages.ts";
import { components } from "./scc.ts";

export const SNAPSHOT_SCHEMA = 8;
/** Bump when extraction or resolution changes the facts that `snapshotId` covers. */
export const EXTRACTOR_VERSION = "m1.16";

export type Resolution = "resolved" | "ambiguous" | "unresolved";
/**
 * `syntactic`: a fact of the code the language runs. `docblock`: a fact written
 * only in a documentation comment the language does not check (PHP `@var Foo`
 * above an untyped property, `@param Foo $x`): static analysers trust it, and
 * so does keylang, naming it in the verdict.
 */
export type Provenance = "syntactic" | "docblock";
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
   * A call edge that is not a plain call written in the code: `default` — the
   * default of a hook (`request.generate ?? generateMap`); `injected` — a value
   * a resolved caller passes for that hook, at `site`; `callable-arg` — a
   * callable reference the source passes as an argument (`[$this, 'm']`,
   * `this.m.bind(this)`, `self.m`, `Self::m`), the edge at the argument;
   * `closure-arg` — a call in a closure literal the source passes as an
   * argument, the closure at `site`. `keylang check --static=shape` follows
   * none of them; rules do not see `injected`.
   */
  via?: Via;
  /** The local, parameter or field the hook call goes through. */
  hook?: string;
  /** `file:line:col` of the call that passes the injected value, or of the closure passed as an argument. */
  site?: string;
  /** The call sits in a closure of `source`: whoever holds that function value may run it. */
  closure?: true;
  /** `file:line:col` of the docblock a `docblock` edge rests on: the `@var` or `@param` that types the receiver, or the import's own position. */
  docblock?: string;
  /**
   * An import or re-export of types only (TypeScript `import type`, `export type … from`,
   * `export type * from`; `import { type A }` and `export { type A } from` with every name `type`
   * when the file's tsconfig does not set `verbatimModuleSyntax`), erased from the code that
   * runs: `no-cycles` skips it, other rules and the map see it as any import.
   */
  typeOnly?: true;
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
  /**
   * `outside-file`: a file `outside` puts outside the architecture; listed, but no hole.
   * `assumed-import`: an import of a file `assume` lists — no edge, and no hole either.
   */
  kind: Gap["kind"] | "skipped-file" | "outside-file" | "assumed-import";
  file: string;
  line: number;
  col: number;
  endLine: number;
  endCol: number;
  text: string;
  reason: string;
  source: string | null;
}

/**
 * A coverage entry that leaves something unresolved: every kind but
 * `assumed-import`, an import of a file `assume` lists, which names no node
 * on purpose and so can hide no edge.
 */
export function leavesUnresolved(item: Pick<CoverageItem, "kind">): boolean {
  return item.kind !== "assumed-import";
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
  /**
   * Brief of the documentation comment in the code (`src/brief.ts`); null
   * without one. A layer's is the README of its own directory, else the doc
   * comment of the index module there (`index.ts`, `mod.rs`, `__init__.py`).
   */
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

/**
 * What the repository says about itself: the system level of C4. A node of the
 * explained map and the zoom screen, never an ID of the language (ADR 0014).
 */
export interface SystemDoc {
  /** `name` of the first root manifest that has one: `package.json`, `Cargo.toml`, `pyproject.toml`. */
  name: string | null;
  /** Brief of the root README's first prose paragraph, else of a root manifest's `description`. */
  brief: string | null;
  /** The file the brief came from, relative to the root; null without a brief. */
  source: string | null;
}

/** Text the repository writes about itself and its layers, read at the edge (`map.ts`). */
export interface RepositoryDocs {
  system: SystemDoc;
  /** Brief of the README in a layer's own directory, by layer. */
  layers: ReadonlyMap<string, string>;
}

/** Where execution starts, by what starts it (ADR 0022 п. 5). Without a framework adapter only `route`, `cli` and `main` occur. */
export const ENTRY_KINDS = ["route", "rest", "graphql", "cron", "consumer", "cli", "observer", "webhook", "controller", "main"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

export function isEntryKind(value: string): value is EntryKind {
  return (ENTRY_KINDS as readonly string[]).includes(value);
}

/**
 * An entry point: a fn (or a module's top level) execution starts from, as
 * the code or a manifest writes it. A fact, not an edge: nothing calls it
 * from inside the repository. Sorted by kind, label, id.
 */
export interface EntryPoint {
  kind: EntryKind;
  /** The fn that starts, or the module whose top level runs (a script, a `bin` without a `main`). */
  id: string;
  /** How the outside names it: `GET /orders`, the `bin` or script name, the script's path. */
  label: string;
  /** The framework whose adapter found it; null for one the language itself writes. */
  framework: string | null;
  /** Where the fn or module is declared. */
  file: string;
  line: number;
  /** The file the fact is written in: a manifest (`package.json`, `pyproject.toml`), a framework config, or the code file itself. */
  source: string;
}

export interface AnalysisSnapshot {
  schema: typeof SNAPSHOT_SCHEMA;
  snapshotId: string;
  generated: string;
  /**
   * The repository's own description. Read again by every analysis and left
   * out of `snapshotId`: a README is no code, so editing it keeps test reports
   * and traces of the snapshot current.
   */
  system: SystemDoc;
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
      assume: string[];
      guessed: boolean;
    };
    files: { path: string; sha256: string }[];
  };
  nodes: Record<string, SnapshotNode>;
  edges: SnapshotEdge[];
  exports: SnapshotExport[];
  coverage: CoverageItem[];
  stats: Graph["stats"];
  /** Where execution starts (`keylang entries`): facts of the code and its manifests, in a fixed order. */
  entries: EntryPoint[];
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
  docs: RepositoryDocs = { system: { name: null, brief: null, source: null }, layers: new Map() },
  /** The entry points and the manifests they were read from (path → text or null), which `snapshotId` covers like the sources. */
  entries: { list: readonly EntryPoint[]; inputs: readonly (readonly [string, string | null])[] } = { list: [], inputs: [] },
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
    assume: [...config.assume],
    guessed: config.guessed,
  };
  const snapshotId = sha256(
    JSON.stringify({
      schema: SNAPSHOT_SCHEMA,
      extractor: EXTRACTOR_VERSION,
      grammars,
      config: manifestConfig,
      files: manifestFiles,
      // An excluded or outside file is a module whatever it holds, and a skipped one a target left out on purpose.
      skipped: skipped.map(({ file, kind }) => `${kind ?? "skipped-file"} ${file}`).sort(),
      // `paths`, `references` and declared packages decide edges as much as the sources do.
      resolution: [...graph.resolverInputs].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([path, text]) => [path, text === null ? null : sha256(text)]),
      // The manifests entry points come from (`bin`, `[project.scripts]`, `[[bin]]`) decide them as the sources do.
      entries: [...entries.inputs].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([path, text]) => [path, text === null ? null : sha256(text)]),
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
    nodes[l.name] = { kind: "layer", layer: l.name, file: null, line: null, col: null, doc: docs.layers.get(l.name) ?? indexDoc(l.modules, globDirectory(config.layers.get(l.name) ?? [])) };
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
        provenance: d.docblock ? "docblock" : "syntactic",
        ...(d.docblock ? { docblock: `${d.file}:${d.line}:${d.col}` } : {}),
        ...(d.typeOnly ? { typeOnly: true as const } : {}),
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
          provenance: c.docblock ? "docblock" : "syntactic",
          ...(c.docblock ? { docblock: c.docblock } : {}),
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
  for (const item of graph.assumed) coverage.push({ kind: "assumed-import", ...item });
  coverage.sort(compareCoverage);
  closures(ordered, coverage);

  return {
    schema: SNAPSHOT_SCHEMA,
    snapshotId,
    generated: new Date().toISOString(),
    system: docs.system,
    manifest: { extractor: EXTRACTOR_VERSION, grammars, config: manifestConfig, files: manifestFiles },
    nodes: ordered,
    edges,
    exports: graph.exports.map(exportRow),
    coverage,
    stats: graph.stats,
    entries: [...entries.list],
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

/**
 * The doc comment of the index module right in a layer's own directory
 * (`src/tui/index.ts`, `mod.rs`, `__init__.py`: the index names of its
 * language), as a brief.
 */
function indexDoc(modules: readonly Module[], dir: string | null): string | null {
  if (dir === null) return null;
  for (const m of modules) {
    if (m.path === null || !m.doc || !m.path.startsWith(`${dir}/`) || m.path.slice(dir.length + 1).includes("/")) continue;
    const language = languageOf(m.path);
    const base = m.path.slice(dir.length + 1).replace(/\.[^.]+$/, "");
    if (language !== undefined && LANGUAGES[language].index.includes(base)) return docBrief(m.doc);
  }
  return null;
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

/** Where prepack writes the version of the grammars it copies into `dist/wasm` (scripts/copy-wasm.mjs). */
export const GRAMMARS_MANIFEST = "grammars.json";

/**
 * What parses the code, in `snapshotId` and the fact-cache key: the
 * web-tree-sitter runtime as Node resolves it, and the grammars as the
 * extractor loads them — from `dist/wasm` in the package, whose version
 * prepack writes beside them, else from the installed
 * `@vscode/tree-sitter-wasm` of a checkout. `unknown` when neither is found.
 */
export function grammarVersions(): Record<string, string> {
  // `require.resolve`, not `import.meta.resolve`: the trace adapter builds its snapshot on
  // Node's module hooks thread, which has no `import.meta.resolve`, and its id must match.
  const require = createRequire(import.meta.url);
  return {
    "web-tree-sitter": installedVersion("web-tree-sitter", () => require.resolve("web-tree-sitter")) ?? "unknown",
    "@vscode/tree-sitter-wasm": bundledGrammarsVersion() ?? installedVersion("@vscode/tree-sitter-wasm", () => require.resolve("@vscode/tree-sitter-wasm/package.json")) ?? "unknown",
  };
}

/** The version prepack recorded beside the grammars in `dist/wasm`; null in a checkout. */
function bundledGrammarsVersion(): string | null {
  const manifest = readJson(join(dirname(fileURLToPath(import.meta.url)), "wasm", GRAMMARS_MANIFEST));
  return typeof manifest?.version === "string" ? manifest.version : null;
}

/**
 * The version in the nearest `package.json` of that name above the file
 * `resolve` finds: a package's `exports` may not list `./package.json`
 * (web-tree-sitter does not), so reading it by name fails. Null when the
 * package is not installed.
 */
function installedVersion(name: string, resolve: () => string): string | null {
  let dir: string;
  try {
    dir = dirname(resolve());
  } catch {
    return null;
  }
  for (;;) {
    const manifest = readJson(join(dir, "package.json"));
    if (manifest?.name === name) return typeof manifest.version === "string" ? manifest.version : null;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(readFileSync(file, "utf8"));
    return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
