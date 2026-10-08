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
import { EVENTS_LAYER } from "./frameworks/events.ts";
import type { Gap, Graph, Module, Via } from "./graph.ts";
import { constructorName, LANGUAGES, languageOf } from "./languages.ts";
import { components } from "./scc.ts";

export const SNAPSHOT_SCHEMA = 9;
/** Bump when extraction or resolution changes the facts that `snapshotId` covers. */
export const EXTRACTOR_VERSION = "m1.24";

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
   * argument, the closure at `site`. A call the framework makes by its
   * configuration (ADR 0022), at `site` in the config: `preference` — a call
   * through an interface (or a class) the config binds to a class;
   * `argument` — a call through a constructor argument the config sets
   * (Magento `<argument xsi:type="object">`, NestJS `@Inject(T)`); `plugin:before`, `plugin:around`,
   * `plugin:after` — a plugin method that wraps the call; `dispatch` — a
   * call of the framework's event dispatcher with a literal name, from the fn
   * to the event's node; `observer` — from an event to the fn an observer
   * runs, `file` and `site` at the config line (Magento `events.xml`, Laravel
   * `$listen`, Symfony listeners, queued jobs and Messenger handlers);
   * `generated-factory` — a call of the member a framework's generated class
   * makes its stem's object with (Magento `XFactory::create()` → `X`, ADR 0022,
   * business-flows 40), to that class (`binding` says so); `object-manager` — a
   * call of a framework's service locator with a class literal (Magento
   * `$objectManager->get(X::class)`), to `X` or the class a preference binds
   * the interface `X` to (then with `site` and `scope`). `keylang check
   * --static=shape` follows none of them; rules do not see `injected`, and see
   * a config edge as a dependency of `owner`.
   */
  via?: Via;
  /** Config edges: where the framework applies the fact (`global`, `frontend`, `adminhtml`…). */
  scope?: string;
  /** Config edges: the module whose config declares the edge, which `deny` sees as its source; absent when no module owns the config. */
  owner?: string;
  /** Config edges: the fact in words, as the verdict names it — `` `I → C` ``, `` plugin `p` (`P`) on `X` ``. */
  binding?: string;
  /** Plugin edges: the fn the plugin wraps at this call. */
  intercepts?: string;
  /** The local, parameter or field the hook call goes through. */
  hook?: string;
  /** `file:line:col` of the call that passes the injected value, of the closure passed as an argument, or of the config line a config edge rests on. */
  site?: string;
  /** The call sits in a closure of `source`: whoever holds that function value may run it. */
  closure?: true;
  /** `file:line:col` of the docblock a `docblock` edge rests on: the `@var`, `@param` or `@return` that types the receiver, or the import's own position. */
  docblock?: string;
  /** An unresolved call through an expression whose `text` does not end in the member it calls: that member (PHP `ship` of `$this->repo()->ship()`). */
  name?: string;
  /**
   * The target is a module `outside` the architecture (ADR 0011), whose members are no nodes:
   * the member the call runs as its file declares it (`Magento\Framework\DataObject::getData`,
   * business-flows 40).
   */
  member?: string;
  /**
   * PHP: the receiver's class is written in another declaration than the call's file — the result
   * type of the call that returned the value (`$this->repo->get()->save()`), or a property of a
   * base. Flows follow the edge; rules do not see it as a dependency: the module depends on the
   * declaration that hands the value over, which has its own edges.
   */
  indirect?: true;
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
  /**
   * `event` (ADR 0022 п. 6): an event a framework's code dispatches or its
   * config observes, in the generated group `events`; its `calls` are the
   * observers, its `callers` the fns that dispatch it.
   */
  kind: "layer" | "module" | "fn" | "type" | "event";
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
  /** fn: the name as written, when the ID segment differs (`m` for `X.m-static`, `go` for `Y.go-private`); event: the literal, when its ID segment differs. */
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
   * reaches has a call keylang did not resolve, reads a value imported from
   * another file, or has no fingerprint.
   */
  closure?: { fingerprint: string; complete: boolean };
  /**
   * module (a file, a directory or a class): SHA-256 of its value code outside
   * every fn and type — top-level constants, assignments, object tables and
   * calls of its files, a class's fields and constants — without comments and
   * layout. Absent when it has none. Part of the baseline of its explanation.
   */
  values?: string;
  /** fn: the plugins the framework's config wraps it in (ADR 0022), in the order they run. */
  interceptedBy?: Interception[];
}

/** A plugin method that wraps a fn, from a framework config. */
export interface Interception {
  /** The plugin method: `P.beforePlace`, `P.aroundPlace`, `P.afterPlace`. */
  plugin: string;
  via: "plugin:before" | "plugin:around" | "plugin:after";
  /** The plugin's name in the config. */
  name: string;
  /** `file:line:col` of the declaration in the config. */
  site: string;
  scope: string;
}

/** A framework adapter that read the repository, with the config files it read: inputs of `snapshotId`. */
export interface FrameworkManifest {
  name: string;
  version: string;
  files: { path: string; sha256: string }[];
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
  /**
   * Why the config's class or method is not a fn keylang read (the class is not
   * in the snapshot, an interface no preference binds): `id` is then the best
   * node known, or the written `Class::method`, and the config line is a hole.
   */
  unresolved?: string;
  /** The HTTP method a framework route answers (`GET`, `POST`); absent when the registration names none. */
  method?: string;
  /** What keylang could not name about it: a handler written in place, so `id` is the module that registers it. */
  note?: string;
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
      /** As `keylang.json` writes it; absent when it does not. */
      frameworks?: string[];
      guessed: boolean;
    };
    files: { path: string; sha256: string }[];
    /** Framework adapters in use and the config files they read (ADR 0022); absent when none is. */
    frameworks?: FrameworkManifest[];
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
  skipped: readonly { file: string; reason: string; source?: string; kind?: "skipped-file" | "outside-file"; text?: string }[],
  docs: RepositoryDocs = { system: { name: null, brief: null, source: null }, layers: new Map() },
  /** The entry points and the manifests they were read from (path → text or null), which `snapshotId` covers like the sources. */
  entries: { list: readonly EntryPoint[]; inputs: readonly (readonly [string, string | null])[] } = { list: [], inputs: [] },
  /** Framework adapters in use and their config files, which `snapshotId` covers like the sources. */
  frameworks: readonly FrameworkManifest[] = [],
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
    ...(config.frameworks !== null ? { frameworks: [...config.frameworks] } : {}),
    guessed: config.guessed,
  };
  const frameworkFiles = frameworks.map((f) => ({ name: f.name, version: f.version, files: [...f.files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) }));
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
      // A framework's config (`etc/di.xml`) decides edges as the code does (ADR 0022).
      ...(frameworkFiles.length > 0 ? { frameworks: frameworkFiles } : {}),
    }),
  );

  const nodes: Record<string, SnapshotNode> = {};
  // fns and types that read a value imported from another file: their closure cannot cover it.
  const readsImported = new Set<string>();
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
    if (m.values !== undefined) moduleNode.values = sha256(m.values);
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
      if (f.interceptedBy && f.interceptedBy.length > 0) fn.interceptedBy = f.interceptedBy;
      if (f.fingerprint !== undefined) fn.fingerprint = sha256(`${f.signature ?? ""}\u0000${f.fingerprint}`);
      if (f.fingerprint !== undefined && readsImportedValue(f.fingerprint)) readsImported.add(f.id);
      nodes[f.id] = fn;
    }
    for (const t of m.types) {
      if (t.fingerprint !== undefined && readsImportedValue(t.fingerprint)) readsImported.add(t.id);
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
  // Events (ADR 0022 п. 6): a generated group of its own, whoever dispatches them.
  const events = graph.events ?? [];
  if (events.length > 0) nodes[EVENTS_LAYER] = { kind: "layer", layer: EVENTS_LAYER, file: null, line: null, col: null, doc: null };
  for (const e of events) {
    nodes[e.id] = {
      kind: "event",
      layer: EVENTS_LAYER,
      file: e.file,
      line: e.file === null ? null : e.line,
      col: e.file === null ? null : e.col,
      ...(e.id.slice(EVENTS_LAYER.length + 1) !== e.name ? { name: e.name } : {}),
      doc: null,
      calls: [...new Set(e.calls.map((c) => c.target))],
      callers: [],
    };
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
          ...(c.member ? { member: c.member } : {}),
          ...(c.indirect ? { indirect: true as const } : {}),
          ...(c.via ? { via: c.via } : {}),
          ...(c.hook ? { hook: c.hook } : {}),
          ...(c.site ? { site: c.site } : {}),
          ...(c.scope ? { scope: c.scope } : {}),
          ...(c.owner ? { owner: c.owner } : {}),
          ...(c.binding ? { binding: c.binding } : {}),
          ...(c.intercepts ? { intercepts: c.intercepts } : {}),
          ...(c.closure ? { closure: true as const } : {}),
        });
      }
    }
    for (const c of m.children) visitEdges(c);
  };
  for (const l of graph.layers) for (const m of l.modules) visitEdges(m);
  for (const e of events) {
    for (const c of e.calls) {
      edges.push({
        kind: "call",
        source: e.id,
        target: c.target,
        file: c.file,
        line: c.line,
        col: c.col,
        endLine: c.endLine,
        endCol: c.endCol,
        text: c.text,
        resolution: "resolved",
        provenance: "syntactic",
        ...(c.via ? { via: c.via } : {}),
        ...(c.site ? { site: c.site } : {}),
        ...(c.scope ? { scope: c.scope } : {}),
        ...(c.owner ? { owner: c.owner } : {}),
        ...(c.binding ? { binding: c.binding } : {}),
      });
    }
  }
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
    if (gap.kind === "unresolved-import" || gap.kind === "dynamic-call" || gap.kind === "unresolved-call" || gap.kind === "ambiguous-binding") {
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
        ...(gap.name ? { name: gap.name } : {}),
      });
    }
  }
  for (const { file, reason, source, kind, text } of skipped) {
    coverage.push({ kind: kind ?? "skipped-file", file, line: 1, col: 1, endLine: 1, endCol: 1, text: text ?? "", reason, source: source ?? graph.byPath.get(file)?.id ?? null });
  }
  for (const item of graph.assumed) coverage.push({ kind: "assumed-import", ...item });
  coverage.sort(compareCoverage);
  closures(ordered, coverage, readsImported);

  return {
    schema: SNAPSHOT_SCHEMA,
    snapshotId,
    generated: new Date().toISOString(),
    system: docs.system,
    manifest: { extractor: EXTRACTOR_VERSION, grammars, config: manifestConfig, files: manifestFiles, ...(frameworkFiles.length > 0 ? { frameworks: frameworkFiles } : {}) },
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
function closures(nodes: Record<string, SnapshotNode>, coverage: readonly CoverageItem[], readsImported: ReadonlySet<string>): void {
  const holes = new Set(coverage.filter((c) => c.kind === "dynamic-call" || c.kind === "unresolved-call" || c.kind === "ambiguous-binding").map((c) => c.source));
  for (const id of readsImported) holes.add(id);
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
    // A dispatched event runs its observers: it is a step of the closure, with no body of its own.
    if (nodes[target]?.kind === "fn" || nodes[target]?.kind === "event") return target;
    const constructor = `${target}.${constructorName(nodes[target]?.file) ?? "constructor"}`;
    return nodes[target]?.class && nodes[constructor]?.kind === "fn" ? constructor : null;
  };
  const adj = new Map<string, Set<string>>();
  for (const [id, node] of Object.entries(nodes)) {
    if (node.kind !== "fn" && node.kind !== "type" && node.kind !== "event") continue;
    adj.set(id, new Set((node.calls ?? []).map(runs).filter((target): target is string => target !== null)));
  }
  const done = new Map<string, { fingerprint: string; complete: boolean }>();
  // Tarjan emits a component after every component it reaches.
  for (const component of components(adj)) {
    const members = [...component].sort();
    const inside = new Set(members);
    const outside = [...new Set(members.flatMap((id) => [...(adj.get(id) ?? [])]).filter((id) => !inside.has(id)))].sort();
    const own = (id: string): string | undefined => (nodes[id]?.kind === "event" ? `event ${nodes[id]?.name ?? id}` : nodes[id]?.fingerprint);
    let complete = members.every((id) => own(id) !== undefined && !holes.has(id));
    const parts = members.map((id) => `${id}=${own(id) ?? "?"}`);
    for (const id of outside) {
      const closure = done.get(id);
      if (!closure?.complete) complete = false;
      parts.push(`${id}>${closure?.fingerprint ?? "?"}`);
    }
    const closure = { fingerprint: sha256(parts.join("\n")), complete };
    for (const id of members) {
      done.set(id, closure);
      const node = nodes[id];
      if (node && node.kind !== "event") node.closure = closure;
    }
  }
}

/**
 * Whether an extractor fingerprint marks a declaration that reads a value
 * imported from another file of the repository: it ends with `+`
 * (`READS_IMPORTED_VALUE` of `extract/treesitter.ts`, never a hex digit;
 * overloads join with `:`, so any part may carry it).
 */
function readsImportedValue(print: string): boolean {
  return print.includes("+");
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
