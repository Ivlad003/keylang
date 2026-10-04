<!-- keylang:generated — не редагувати, `keylang map` -->

[README](README.md) · modules: [analyze](#map.analyze) · [declared-packages](#map.declared-packages) · [emit](#map.emit) · [explanations](#map.explanations) · [exports](#map.exports) · [fact-cache](#map.fact-cache) · [frontends](#map.frontends) · [graph](#map.graph) · [imports](#map.imports) · [map](#map.map) · [python-imports](#map.python-imports) · [rust-imports](#map.rust-imports) · [snapshot](#map.snapshot) · [trace-plan](#map.trace-plan) · [wire-gen](#map.wire-gen)

# map

- map
  <a id="map"></a><br>Turns source files into facts, a graph and a versioned snapshot ([`map.frontends`](map.md#map.frontends), [`map.graph`](map.md#map.graph), [`map.snapshot`](map.md#map.snapshot)), then renders generated map files with explanations ([`map.emit`](map.md#map.emit), [`map.explanations`](map.md#map.explanations)). Also derives wiring code and trace plans from that snapshot ([`map.wire-gen`](map.md#map.wire-gen)… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
  - module [analyze](../../src/analyze.ts#L1)
    <a id="map.analyze"></a><br>One analysis for the CLI and the language server: config, a fresh snapshot, spec documents, and their assessment. Generated map files are replaced by the map rendered from the fresh snapshot, so IDs resolve against current code, not a stale committed map.
    - node [external.node](external.md#external.node)
    - assess [check.assess](check.md#check.assess)
    - config [base.config](base.md#base.config)
    - declared-packages [map.declared-packages](map.md#map.declared-packages)
    - span [base.span](base.md#base.span)
    - files [lang.files](lang.md#lang.files)
    - ir [lang.ir](lang.md#lang.ir)
    - map [map.map](map.md#map.map)
    - parser [lang.parser](lang.md#lang.parser)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - test-report [check.test-report](check.md#check.test-report)
    - trace-evidence [check.trace-evidence](check.md#check.trace-evidence)
    - type [AnalysisRequest](../../src/analyze.ts#L20)
      <a id="map.analyze.AnalysisRequest"></a><br>Options bundle for one analysis run: the repository root, which spec files to check, unsaved editor buffers, and switches that skip code or evidence, persist the fact cache, or override `static` mode. It also lets the caller swap in its own snapshot builder via `generate`… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Analysis](../../src/analyze.ts#L41) extends Assessment
      <a id="map.analyze.Analysis"></a><br>Result record of analyzing a repository: bundles the resolved config, an optional map and snapshot, parsed spec documents, request paths that held no specs, and the declared packages sorted by id. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [analyze](../../src/analyze.ts#L55) (request: AnalysisRequest) → Promise<Analysis>
      <a id="map.analyze.analyze"></a><br>Loads the repo config, optionally builds the code map via [`map.map.generateMap`](map.md#map.map.generateMap), gathers spec documents (skipping generated reading aids, merging fresh map renders and overlay edits), then runs [`check.assess.assess`](check.md#check.assess.assess) with test and trace evidence. Returns the assessment bundled… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [base.config.loadConfig](base.md#base.config.loadConfig), [base.config.toPosix](base.md#base.config.toPosix), [map.map.generateMap](map.md#map.map.generateMap), [lang.files.collectMdFiles](lang.md#lang.files.collectMdFiles), [lang.parser.parse](lang.md#lang.parser.parse), [map.analyze.within](map.md#map.analyze.within), [base.span.compareText](base.md#base.span.compareText), [base.config.evidenceFiles](base.md#base.config.evidenceFiles), [base.config.resolveStatic](base.md#base.config.resolveStatic), [map.declared-packages.readManifests](map.md#map.declared-packages.readManifests), [check.assess.assess](check.md#check.assess.assess), [check.test-report.loadReports](check.md#check.test-report.loadReports), [check.trace-evidence.loadTraces](check.md#check.trace-evidence.loadTraces), [map.analyze.repositoryFile](map.md#map.analyze.repositoryFile)
    - fn [findRoot](../../src/analyze.ts#L111) (start: string) → string
      <a id="map.analyze.findRoot"></a><br>Walk up from `start` to the directory that holds `keylang.json`; `start` when there is none.
    - fn [repositoryFile](../../src/analyze.ts#L122) (root: string, path: string) → boolean <!-- internal -->
      <a id="map.analyze.repositoryFile"></a><br>`path` (relative to the root, as a flow's `test` writes it) is a file inside the repository.
      - calls [map.analyze.within](map.md#map.analyze.within)
    - fn [within](../../src/analyze.ts#L132) (abs: string, dir: string) → boolean
      <a id="map.analyze.within"></a><br>Reports whether an absolute path lies inside a directory by taking the relative path and rejecting results that climb out via `..` or resolve to a different root. Used as the boundary check by callers like [`map.analyze.repositoryFile`](map.md#map.analyze.repositoryFile) and [`tui.disk.leavesBoundary`](tui.md#tui.disk.leavesBoundary). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
  - module [declared-packages](../../src/declared-packages.ts#L1)
    <a id="map.declared-packages"></a><br>Packages a repository declares, with their original names and version ranges. A rule or a flow may name one (`external.<segment>`) before any file imports it.
    - node [external.node](external.md#external.node)
    - smol-toml [external.smol-toml](external.md#external.smol-toml)
    - config [base.config](base.md#base.config)
    - external-ids [base.external-ids](base.md#base.external-ids)
    - imports [map.imports](map.md#map.imports)
    - span [base.span](base.md#base.span)
    - type [DependencyField](../../src/declared-packages.ts#L25)
      <a id="map.declared-packages.DependencyField"></a><br>A manifest field a package is declared in.
    - type [Declaration](../../src/declared-packages.ts#L31)
      <a id="map.declared-packages.Declaration"></a><br>Where one package is declared, and its version range as written (null when the manifest gives none).
    - type [DeclaredPackage](../../src/declared-packages.ts#L39)
      <a id="map.declared-packages.DeclaredPackage"></a><br>A package a repository declares, with its `external.<segment>` id.
    - type [Add](../../src/declared-packages.ts#L51) <!-- internal -->
      <a id="map.declared-packages.Add"></a><br>Function type for a callback that records one declared dependency: the package name, the manifest file it came from, which dependency field listed it, and its version range (or null when none is given). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [readManifests](../../src/declared-packages.ts#L60) (config: Config, files: readonly string[], known: ReadonlyMap<string, string | null> = new Map()) → { packages: DeclaredPackage[]; inputs: Map<string, string | null> }
      <a id="map.declared-packages.readManifests"></a><br>The packages declared by the manifests at the root and on the ancestors of `files` (root-relative), sorted by id; their ids cover only these names. `known` holds files a resolver already read (text, or null for absent), so a manifest is parsed from the same text that went into…
      - calls [map.declared-packages.readInput](map.md#map.declared-packages.readInput), [map.declared-packages.typesTarget](map.md#map.declared-packages.typesTarget), [map.declared-packages.manifestDirs](map.md#map.declared-packages.manifestDirs), [base.config.isAnalysed](base.md#base.config.isAnalysed), [map.declared-packages.addPackages](map.md#map.declared-packages.addPackages), [map.declared-packages.addCrates](map.md#map.declared-packages.addCrates), [map.declared-packages.workspaceNames](map.md#map.declared-packages.workspaceNames), [base.external-ids.assignExternalIds](base.md#base.external-ids.assignExternalIds), [base.span.compareText](base.md#base.span.compareText)
    - fn [manifestDirs](../../src/declared-packages.ts#L105) (files: readonly string[]) → Set<string> <!-- internal -->
      <a id="map.declared-packages.manifestDirs"></a><br>The root (`""`) and every directory between a file and the root.
      - calls [base.config.toPosix](base.md#base.config.toPosix)
    - fn [typesTarget](../../src/declared-packages.ts#L117) (name: string) → string <!-- internal -->
      <a id="map.declared-packages.typesTarget"></a><br>`@types/x` → `x`, `@types/scope__pkg` → `@scope/pkg`; any other name is itself.
    - fn [workspaceNames](../../src/declared-packages.ts#L129) (read: (rel: string) => string | null, list: (rel: string) => string | null) → Set<string> <!-- internal -->
      <a id="map.declared-packages.workspaceNames"></a><br>Names of the packages in the directories the root `workspaces` names (`packages/*`, `apps/web`), read as the import resolver reads them: the same input keys and texts, and a member manifest that does not parse names none.
      - calls [map.imports.parseJsonc](map.md#map.imports.parseJsonc), [map.declared-packages.isRecord](map.md#map.declared-packages.isRecord), [map.declared-packages.workspaceDirs](map.md#map.declared-packages.workspaceDirs)
    - fn [workspaceDirs](../../src/declared-packages.ts#L147) (pattern: string, list: (rel: string) => string | null) → string[] <!-- internal -->
      <a id="map.declared-packages.workspaceDirs"></a><br>Directories one `workspaces` entry names; a trailing `/*` expands one level, as in `src/imports.ts`.
      - calls [base.config.toPosix](base.md#base.config.toPosix)
    - fn [readInput](../../src/declared-packages.ts#L158) (abs: string, rel: string) → string | null <!-- internal -->
      <a id="map.declared-packages.readInput"></a><br>A file's text, null when there is none; a `<base>/*` key lists the subdirectories of `<base>`.
      - calls [map.declared-packages.isDirectory](map.md#map.declared-packages.isDirectory), [map.declared-packages.isFile](map.md#map.declared-packages.isFile), [map.declared-packages.readText](map.md#map.declared-packages.readText)
    - fn [isFile](../../src/declared-packages.ts#L172) (abs: string) → boolean <!-- internal -->
      <a id="map.declared-packages.isFile"></a><br>Checks whether an absolute path points to an existing regular file via a synchronous stat, returning false instead of throwing on any error. Used by [`map.declared-packages.readInput`](map.md#map.declared-packages.readInput) to decide whether a candidate input file should be read. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [isDirectory](../../src/declared-packages.ts#L180) (abs: string) → boolean <!-- internal -->
      <a id="map.declared-packages.isDirectory"></a><br>Synchronously stats the given absolute path and reports whether it is a directory, returning false instead of throwing when the path is missing or inaccessible. [`map.declared-packages.readInput`](map.md#map.declared-packages.readInput) uses it for a `<base>/*` key: when `<base>` is not a directory, the listing of its… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [readText](../../src/declared-packages.ts#L189) (path: string, rel: string) → string <!-- internal -->
      <a id="map.declared-packages.readText"></a><br>The file is there but cannot be read. That is not the same error as invalid contents.
    - fn [isRecord](../../src/declared-packages.ts#L198) (value: unknown) → value is Record<string, unknown> <!-- internal -->
      <a id="map.declared-packages.isRecord"></a><br>Type guard that returns true only for non-null objects that are not arrays, narrowing the value to a string-keyed record. Used by [`map.declared-packages.table`](map.md#map.declared-packages.table) and the package/crate readers to check parsed manifest shapes before indexing fields. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [table](../../src/declared-packages.ts#L202) (rel: string, field: string, value: unknown, kind: "object" | "table") → Record<string, unknown> | undefined <!-- internal -->
      <a id="map.declared-packages.table"></a><br>Validates an optional manifest field: returns `undefined` when absent, passes the value through when [`map.declared-packages.isRecord`](map.md#map.declared-packages.isRecord) accepts it, and otherwise throws an error naming the file, field, and expected shape. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [map.declared-packages.isRecord](map.md#map.declared-packages.isRecord)
    - fn [addPackages](../../src/declared-packages.ts#L209) (rel: string, text: string, add: Add) → void <!-- internal -->
      <a id="map.declared-packages.addPackages"></a><br>`dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`. Not `node_modules`.
      - calls [map.imports.parseJsoncStrict](map.md#map.imports.parseJsoncStrict), [map.declared-packages.isRecord](map.md#map.declared-packages.isRecord), [map.declared-packages.table](map.md#map.declared-packages.table)
    - fn [addCrates](../../src/declared-packages.ts#L225) (rel: string, text: string, add: Add) → void <!-- internal -->
      <a id="map.declared-packages.addCrates"></a><br>`[dependencies]`, `[dev-dependencies]`, `[build-dependencies]`, and the same under `[target.*]`.
      - calls [map.declared-packages.isRecord](map.md#map.declared-packages.isRecord), [map.declared-packages.table](map.md#map.declared-packages.table), [map.declared-packages.crateTables](map.md#map.declared-packages.crateTables)
    - fn [crateTables](../../src/declared-packages.ts#L249) (rel: string, source: Record<string, unknown>, prefix: string) → [DependencyField, Record<string, unknown>][] <!-- internal -->
      <a id="map.declared-packages.crateTables"></a><br>Walks the fixed list of Cargo dependency section keys, running each present entry in a manifest object through [`map.declared-packages.table`](map.md#map.declared-packages.table) with a prefixed field path for validation. Returns the pairs of section key and name map that validated, skipping absent or invalid ones. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [map.declared-packages.table](map.md#map.declared-packages.table)
  - module [emit](../../src/emit.ts#L1)
    <a id="map.emit"></a><br>Snapshot → generated `map/<layer>.md` files, and the explained map: the same tree with an explanation under every node (ADR 0004).
    - node [external.node](external.md#external.node)
    - explanations [map.explanations](map.md#map.explanations)
    - graph [map.graph](map.md#map.graph)
    - span [base.span](base.md#base.span)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - fn [isGeneratedMap](../../src/emit.ts#L13) (text: string) → boolean
      <a id="map.emit.isGeneratedMap"></a><br>True when the first non-empty line is a generator marker. The text after `keylang:generated` may vary.
    - fn [codeHref](../../src/emit.ts#L24) (mapDir: string, filePath: string, line: number) → string
      <a id="map.emit.codeHref"></a><br>Markdown link target relative to a map file. `mapDir` and `filePath` are POSIX paths from the repository root (`keylang/map`, `src/a.ts`). Each segment except `.` and `..` is percent-encoded so `(`, `)`, spaces and `#` survive round-trip. `encodeURIComponent` leaves…
      - calls [map.emit.encodeSegment](map.md#map.emit.encodeSegment)
    - fn [encodeSegment](../../src/emit.ts#L33) (seg: string) → string <!-- internal -->
      <a id="map.emit.encodeSegment"></a><br>Percent-encodes a path segment with `encodeURIComponent`, then additionally replaces `(` and `)` with `%28` and `%29`, which the standard encoder leaves untouched. Used by [`map.emit.codeHref`](map.md#map.emit.codeHref) to build safe link targets. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [renderMap](../../src/emit.ts#L38) (snapshot: AnalysisSnapshot, mapDir: string) → Map<string, string>
      <a id="map.emit.renderMap"></a><br>One Markdown document per layer, keyed by file name (`domain.md`). `mapDir` is where those files are written, relative to the repo root.
      - calls [map.emit.renderLayers](map.md#map.emit.renderLayers), [map.emit.childrenByParent](map.md#map.emit.childrenByParent)
    - type [ExplainNode](../../src/emit.ts#L43) = (id: string) => NodeExplanation | null
      <a id="map.emit.ExplainNode"></a><br>A node's explanation for the explained map; null leaves the node without text.
    - fn [renderExplainedMap](../../src/emit.ts#L53) (snapshot: AnalysisSnapshot, mapDir: string, explain: ExplainNode) → Map<string, string>
      <a id="map.emit.renderExplainedMap"></a><br>The explained map: the tree of `renderMap` for reading on GitHub and in an editor. Every node has an anchor and, when it has an explanation, the text on its description line; `calls` and dependency targets link to the anchor of their node; each layer file opens with its…
      - calls [map.emit.childrenByParent](map.md#map.emit.childrenByParent), [map.emit.renderLayers](map.md#map.emit.renderLayers), [map.emit.renderReadme](map.md#map.emit.renderReadme)
    - type [Render](../../src/emit.ts#L60) <!-- internal -->
      <a id="map.emit.Render"></a><br>Bundles the state the map emitter threads through one render pass: the analysis snapshot, the parent-to-children index, the output directory, and an optional node whose map is being explained. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [renderLayers](../../src/emit.ts#L68) (r: Render) → Map<string, string> <!-- internal -->
      <a id="map.emit.renderLayers"></a><br>Builds one markdown document per layer from [`map.emit.layerIds`](map.md#map.emit.layerIds), each starting with a generated marker, an optional [`map.emit.contents`](map.md#map.emit.contents) section, and a heading with [`map.emit.describe`](map.md#map.emit.describe). Child modules ordered by [`map.emit.sortIds`](map.md#map.emit.sortIds) are appended via [`map.emit.renderModule`](map.md#map.emit.renderModule), keyed… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [map.emit.layerIds](map.md#map.emit.layerIds), [map.emit.contents](map.md#map.emit.contents), [map.emit.describe](map.md#map.emit.describe), [map.emit.sortIds](map.md#map.emit.sortIds), [map.emit.renderModule](map.md#map.emit.renderModule)
    - fn [layerIds](../../src/emit.ts#L78) (snapshot: AnalysisSnapshot) → string[] <!-- internal -->
      <a id="map.emit.layerIds"></a><br>Collects the IDs of every node in the snapshot whose kind is `"layer"` and returns them as an alphabetically sorted list. Used by [`map.emit.renderLayers`](map.md#map.emit.renderLayers) and [`map.emit.renderReadme`](map.md#map.emit.renderReadme) to iterate layers in stable order. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [anchorOf](../../src/emit.ts#L88) (id: string) → string
      <a id="map.emit.anchorOf"></a><br>The anchor of a node in the explained map: its ID, with every character other than an ASCII letter, digit, `.`, `_` or `-` written as `~<hex>~` (its code point). GitHub keeps such an `id` as written, and `~` never occurs in an ID, so two IDs never share an anchor.
    - fn [ref](../../src/emit.ts#L93) (r: Render, id: string) → string <!-- internal -->
      <a id="map.emit.ref"></a><br>A link to the node's anchor in its layer file; the bare ID in the canonical map.
      - calls [map.emit.anchorOf](map.md#map.emit.anchorOf)
    - fn [contents](../../src/emit.ts#L100) (r: Render, layerId: string) → string <!-- internal -->
      <a id="map.emit.contents"></a><br>The first lines of a layer file: back to the start page, and every module of the layer, in map order.
      - calls [map.emit.anchorOf](map.md#map.emit.anchorOf), [map.emit.sortIds](map.md#map.emit.sortIds)
    - fn [describe](../../src/emit.ts#L116) (r: Render, id: string, depth: number) → string <!-- internal -->
      <a id="map.emit.describe"></a><br>The description line of a node at `depth`: in the explained map its anchor and its explanation, if any; nothing in the canonical map.
      - calls [map.emit.anchorOf](map.md#map.emit.anchorOf), [map.emit.descriptionText](map.md#map.emit.descriptionText), [map.emit.ref](map.md#map.emit.ref)
    - fn [descriptionText](../../src/emit.ts#L131) (e: NodeExplanation, link: (id: string) => string | null = () => null) → string
      <a id="map.emit.descriptionText"></a><br>The text of a description line: `<br>` so a Markdown viewer starts it on a line of its own, the explanation, and for a brief from a model its origin. The text never starts a block (a list item, a heading, a quote, a fence), and `<` outside code is `&lt;`, so no HTML in it…
      - calls [map.explanations.modelName](map.md#map.explanations.modelName)
    - type [Counts](../../src/emit.ts#L149) <!-- internal -->
      <a id="map.emit.Counts"></a><br>Explanation counts of the nodes of one layer (the layer included).
    - fn [renderReadme](../../src/emit.ts#L156) (snapshot: AnalysisSnapshot, children: Map<string, string[]>, explain: ExplainNode) → string <!-- internal -->
      <a id="map.emit.renderReadme"></a><br>Builds the map's README text: a per-layer table counting nodes whose explanation comes from code docs, a model, a stale model brief, or nothing, with each layer's own brief via [`map.emit.descriptionText`](map.md#map.emit.descriptionText), followed by the name index from [`map.emit.index`](map.md#map.emit.index). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [map.emit.layerIds](map.md#map.emit.layerIds), [map.emit.descriptionText](map.md#map.emit.descriptionText), [map.emit.ref](map.md#map.emit.ref), [map.emit.index](map.md#map.emit.index)
    - fn [index](../../src/emit.ts#L203) (r: Render) → string[] <!-- internal -->
      <a id="map.emit.index"></a><br>One paragraph per first letter: every module and class of the repository (packages left out), by name.
      - calls [map.emit.nameOf](map.md#map.emit.nameOf), [base.span.compareText](base.md#base.span.compareText), [map.emit.anchorOf](map.md#map.emit.anchorOf)
    - fn [childrenByParent](../../src/emit.ts#L222) (snapshot: AnalysisSnapshot) → Map<string, string[]> <!-- internal -->
      <a id="map.emit.childrenByParent"></a><br>Groups node IDs from `snapshot.nodes` under their parent by splitting each dotted ID at its last dot, skipping IDs without a dot. Used by [`map.emit.renderMap`](map.md#map.emit.renderMap) and [`map.emit.renderExplainedMap`](map.md#map.emit.renderExplainedMap) to build the tree. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [sortIds](../../src/emit.ts#L235) (snapshot: AnalysisSnapshot, ids: readonly string[]) → string[] <!-- internal -->
      <a id="map.emit.sortIds"></a><br>Returns a copy of the ID list ordered by each node's source file (falling back to the name from [`map.emit.nameOf`](map.md#map.emit.nameOf) when the node is missing in the snapshot), then by line number. Used by [`map.emit.contents`](map.md#map.emit.contents), [`map.emit.renderLayers`](map.md#map.emit.renderLayers), and [`map.emit.renderModule`](map.md#map.emit.renderModule) to give stable… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [map.emit.nameOf](map.md#map.emit.nameOf)
    - fn [nameOf](../../src/emit.ts#L245) (id: string) → string <!-- internal -->
      <a id="map.emit.nameOf"></a><br>Returns the substring after the last dot in a dotted node ID, giving the bare local name (or the whole string if there is no dot). Used by [`map.emit.renderDecl`](map.md#map.emit.renderDecl), [`map.emit.renderModule`](map.md#map.emit.renderModule), [`map.emit.sortIds`](map.md#map.emit.sortIds), and [`map.emit.index`](map.md#map.emit.index) when rendering and ordering output. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [linkedName](../../src/emit.ts#L249) (mapDir: string, node: SnapshotNode, name: string) → string <!-- internal -->
      <a id="map.emit.linkedName"></a><br>Wraps a display name in a Markdown link pointing at the node's source location, built via [`map.emit.codeHref`](map.md#map.emit.codeHref). Returns the bare name when the node lacks a file or line. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [map.emit.codeHref](map.md#map.emit.codeHref)
    - fn [renderModule](../../src/emit.ts#L254) (r: Render, id: string, depth: number) → string <!-- internal -->
      <a id="map.emit.renderModule"></a><br>Produces the indented markdown block for one module in the map: a linked heading via [`map.emit.linkedName`](map.md#map.emit.linkedName) plus description from [`map.emit.describe`](map.md#map.emit.describe), one line per dependency edge from [`map.emit.depsOf`](map.md#map.emit.depsOf), then its sorted children, recursing for sub-modules and delegating other… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [map.emit.linkedName](map.md#map.emit.linkedName), [map.emit.nameOf](map.md#map.emit.nameOf), [map.emit.describe](map.md#map.emit.describe), [map.emit.depsOf](map.md#map.emit.depsOf), [map.emit.ref](map.md#map.emit.ref), [map.emit.sortIds](map.md#map.emit.sortIds), [map.emit.renderDecl](map.md#map.emit.renderDecl)
    - fn [edgesFrom](../../src/emit.ts#L277) (snapshot: AnalysisSnapshot, id: string) → readonly SnapshotEdge[] <!-- internal -->
      <a id="map.emit.edgesFrom"></a><br>Returns all edges whose source is the given id, building and memoizing a per-snapshot source→edges map on first use. Serves [`map.emit.depsOf`](map.md#map.emit.depsOf) and [`map.emit.renderDecl`](map.md#map.emit.renderDecl) as their edge lookup. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [depsOf](../../src/emit.ts#L292) (snapshot: AnalysisSnapshot, id: string) → SnapshotEdge[] <!-- internal -->
      <a id="map.emit.depsOf"></a><br>One line per dependency alias: an import and a re-export of one module are one dependency with two edges.
      - calls [map.emit.edgesFrom](map.md#map.emit.edgesFrom)
    - fn [renderDecl](../../src/emit.ts#L300) (r: Render, id: string, node: SnapshotNode, depth: number) → string <!-- internal -->
      <a id="map.emit.renderDecl"></a><br>Builds one indented markdown bullet for a declaration: a `fn`/`type` keyword, a linked name via [`map.emit.linkedName`](map.md#map.emit.linkedName), its signature, an internal marker, and the description from [`map.emit.describe`](map.md#map.emit.describe). Then appends a "calls" line listing deduplicated resolved, non-self… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [map.emit.linkedName](map.md#map.emit.linkedName), [map.emit.nameOf](map.md#map.emit.nameOf), [map.emit.describe](map.md#map.emit.describe), [map.emit.edgesFrom](map.md#map.emit.edgesFrom), [map.emit.ref](map.md#map.emit.ref)
  - module [explanations](../../src/explanations.ts#L1)
    <a id="map.explanations"></a><br>Explanations of nodes (ADR 0004): the documentation comment in the code first, then a brief a model wrote, saved under `<dir>/explain/brief/`. One lookup for the explained map, the TUI, MCP and the language server; the store and its baselines live here so that lookup needs no…
    - node [external.node](external.md#external.node)
    - brief [base.brief](base.md#base.brief)
    - config [base.config](base.md#base.config)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - type [ExplanationDetail](../../src/explanations.ts#L14) = "short" | "full" | "brief"
      <a id="map.explanations.ExplanationDetail"></a><br>`short` and `full` answer `explain <id> --llm`; `brief` is the one or two sentences of the explained map.
    - type [StoredExplanation](../../src/explanations.ts#L17)
      <a id="map.explanations.StoredExplanation"></a><br>An explanation a model wrote, with the header it is saved under.
    - fn [isStoredExplanation](../../src/explanations.ts#L31) (text: string) → boolean
      <a id="map.explanations.isStoredExplanation"></a><br>A file `explain --llm` wrote: the model's text under keylang's header, not keylang Markdown to parse or format.
    - fn [parseStoredExplanation](../../src/explanations.ts#L36) (text: string) → StoredExplanation | null
      <a id="map.explanations.parseStoredExplanation"></a><br>The saved form; null for a file keylang did not write, which is not an explanation it can date.
    - fn [formatStoredExplanation](../../src/explanations.ts#L42) (e: StoredExplanation) → string
      <a id="map.explanations.formatStoredExplanation"></a><br>Serializes a stored explanation into the on-disk text form: an HTML comment header carrying agent, date, closure, lang and detail fields, followed by the explanation body and a trailing newline. Used by [`operations.operations.runExplainBatch`](operations.md#operations.operations.runExplainBatch) and… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [explainDir](../../src/explanations.ts#L47) (config: Pick<Config, "dir">) → string
      <a id="map.explanations.explainDir"></a><br>Where explanations are saved, relative to the root: `<dir>/explain`, committed next to the map.
    - fn [explanationPath](../../src/explanations.ts#L55) (config: Pick<Config, "dir">, id: string, detail: ExplanationDetail) → string
      <a id="map.explanations.explanationPath"></a><br>File of an explanation relative to the root: `<dir>/explain/<id>.md`, a brief in `<dir>/explain/brief/<id>.md`.
      - calls [map.explanations.explainDir](map.md#map.explanations.explainDir)
    - fn [readStoredExplanation](../../src/explanations.ts#L59) (root: string, rel: string) → StoredExplanation | null
      <a id="map.explanations.readStoredExplanation"></a><br>Joins the root and relative path, and if that file exists reads it as UTF-8 and hands the text to [`map.explanations.parseStoredExplanation`](map.md#map.explanations.parseStoredExplanation); otherwise returns null without touching disk further. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [map.explanations.parseStoredExplanation](map.md#map.explanations.parseStoredExplanation)
    - fn [storedIds](../../src/explanations.ts#L65) (root: string, dir: string) → string[]
      <a id="map.explanations.storedIds"></a><br>IDs with a saved file in `dir` (relative to the root), sorted.
    - fn [loadBriefs](../../src/explanations.ts#L75) (config: Config) → Map<string, StoredExplanation>
      <a id="map.explanations.loadBriefs"></a><br>Briefs saved under `<dir>/explain/brief/`, by ID. A file without keylang's header is not one.
      - calls [map.explanations.explainDir](map.md#map.explanations.explainDir), [map.explanations.storedIds](map.md#map.explanations.storedIds), [map.explanations.readStoredExplanation](map.md#map.explanations.readStoredExplanation)
    - fn [snapshotBaseline](../../src/explanations.ts#L95) (snapshot: AnalysisSnapshot, id: string) → string | null
      <a id="map.explanations.snapshotBaseline"></a><br>The baseline an explanation of `id` is compared with: the closure fingerprint of a fn or type; for a module, class or layer, which has no closure of its own, a hash of its dependencies and of the closures of every node under it, so a change inside makes its explanation stale.…
      - calls [map.explanations.lowerBound](map.md#map.explanations.lowerBound)
    - fn [lowerBound](../../src/explanations.ts#L117) (sorted: readonly string[], key: string) → number <!-- internal -->
      <a id="map.explanations.lowerBound"></a><br>Binary-searches a lexicographically sorted string array for the first index whose element is not less than the given key, returning the array length if none qualifies. [`map.explanations.snapshotBaseline`](map.md#map.explanations.snapshotBaseline) uses it to locate an id's insertion point in a snapshot's ordered keys. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [NodeExplanation](../../src/explanations.ts#L129)
      <a id="map.explanations.NodeExplanation"></a><br>What a node is, in plain words, and where the words come from.
    - fn [explanationOf](../../src/explanations.ts#L145) (snapshot: AnalysisSnapshot, briefs: ReadonlyMap<string, StoredExplanation>, id: string) → NodeExplanation | null
      <a id="map.explanations.explanationOf"></a><br>The explanation of a node: its documentation comment, else its saved brief (fresh or stale), else null. Never a `short` or `full` explanation: those answer a question about one node, not a line of the map.
      - calls [base.brief.briefOf](base.md#base.brief.briefOf), [map.explanations.snapshotBaseline](map.md#map.explanations.snapshotBaseline)
    - fn [modelName](../../src/explanations.ts#L156) (agent: string) → string
      <a id="map.explanations.modelName"></a><br>The model of an agent, as the map shows it: `claude-sonnet-5` for `anthropic:claude-sonnet-5`.
  - module [exports](../../src/exports.ts#L1)
    <a id="map.exports"></a><br>Export tables: the symbol each public name of a module stands for, following aliases, re-export chains, namespaces and `export *`. Plain data in and out: the graph builds the rows from facts, call resolution and the snapshot's `exports` read the result, so both see the same…
    - type [ExportKind](../../src/exports.ts#L10) = "fn" | "class" | "type" | "value"
      <a id="map.exports.ExportKind"></a><br>A string-literal union naming the four categories an exported symbol can fall into: function, class, type, or plain value. It is the tag other export records in the map layer use to classify what a module exposes. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [ExportForm](../../src/exports.ts#L11) = "alias" | "default" | "reexport" | "namespace"
      <a id="map.exports.ExportForm"></a><br>A string union naming the four ways a module can expose a symbol: an aliased named export, a default export, a re-export from another module, or a namespace re-export, used by the map layer to tag each export's kind. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [ExportTarget](../../src/exports.ts#L17)
      <a id="map.exports.ExportTarget"></a><br>What a name written in a module stands for, before resolution.
    - type [ExportRowInput](../../src/exports.ts#L27)
      <a id="map.exports.ExportRowInput"></a><br>Describes one export of a module as collected from source: the public name, its `ExportKind`, an optional `ExportForm`, the differing local/source name, the module a re-export or namespace originates from, and its `ExportTarget`. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [ModuleExportsInput](../../src/exports.ts#L39)
      <a id="map.exports.ModuleExportsInput"></a><br>Describes one module's export surface for resolution: its own export rows in file order (first name wins), each `export * from` source as a module id or a null with a reason, and a flag that unknown members may supply any re-exported name. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [ExportEntry](../../src/exports.ts#L48)
      <a id="map.exports.ExportEntry"></a><br>Describes one public name a module exposes: the owning module, the exported name, the indexed declaration it resolves to (or null), and its kind, with optional form, local alias, source module, and a reason when a wildcard re-export's names are unknown. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [ExportTables](../../src/exports.ts#L61)
      <a id="map.exports.ExportTables"></a><br>Read-only query surface over per-module export tables: finds the `ExportEntry` for a public name, resolves which symbol an importer of a name actually receives (falling back to the local declaration when no entry exists), and lists all entries sorted by module and name. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Result](../../src/exports.ts#L74) <!-- internal -->
      <a id="map.exports.Result"></a><br>Pairs a computed value with `low`, the depth of the shallowest in-progress computation it read, or Infinity when it read none. Lets callers detect results that depend on an unfinished cycle. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [resolveExports](../../src/exports.ts#L80) (inputs: ReadonlyMap<string, ModuleExportsInput>, symbolKind: (id: string) => ExportKind | null, declared: (module: string, name: string) => string | null) → ExportTables
      <a id="map.exports.resolveExports"></a><br>Builds lazily memoised export tables for every module, resolving named rows and `export *` chains (via [`map.exports.pickStar`](map.md#map.exports.pickStar)) to concrete symbols while a depth guard keeps cyclic re-exports from recursing forever or caching partial answers. Returns lookup, symbol-of, and… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [map.exports.pickStar](map.md#map.exports.pickStar)
    - fn [pickStar](../../src/exports.ts#L192) (module: string, name: string, found: readonly { entry: ExportEntry; star: string | null }[]) → ExportEntry | null <!-- internal -->
      <a id="map.exports.pickStar"></a><br>The entry `export *` gives a name: the one source that has it. Two sources whose names stand for different declarations make the name ambiguous, and ESM exports neither; an unknown source is reported once, with its reason.
    - fn [compare](../../src/exports.ts#L206) (a: string, b: string) → number <!-- internal -->
      <a id="map.exports.compare"></a><br>Orders two strings by plain code-unit comparison, returning -1, 1, or 0 as a sort comparator. It performs no locale-aware or case-insensitive handling. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
  - module [fact-cache](../../src/fact-cache.ts#L1)
    <a id="map.fact-cache"></a><br>Extracted facts reused across runs. A file's facts depend only on its path, its content, and the extractor with its grammars, so that is the key; the graph and the snapshot are rebuilt from all facts every time, which keeps resolution of importers consistent when an export…
    - node [external.node](external.md#external.node)
    - facts [extract.facts](extract.md#extract.facts)
    - span [base.span](base.md#base.span)
    - type [StoredFacts](../../src/fact-cache.ts#L20) = Omit<FileFacts, "exports"> & { exports: string[] } <!-- internal -->
      <a id="map.fact-cache.StoredFacts"></a><br>Serialization shape for a cached file's facts: everything from `FileFacts` unchanged, except that `exports` becomes a plain array of strings rather than its in-memory form, so it can be written to and read from the cache on disk. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Stored](../../src/fact-cache.ts#L22) <!-- internal -->
      <a id="map.fact-cache.Stored"></a><br>Shape of the on-disk cache file: a schema number and version string, plus a per-file map keyed by path holding the file's sha256 and its cached facts so unchanged files can be skipped on reload. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [storedFiles](../../src/fact-cache.ts#L33) (value: unknown, version: string) → Stored["files"] <!-- internal -->
      <a id="map.fact-cache.storedFiles"></a><br>Entries of a cache written by this schema and version. An entry of the wrong shape — any field the graph reads, at any depth — is dropped, so its file is extracted again instead of trusted or thrown on.
      - calls [map.fact-cache.isRecord](map.md#map.fact-cache.isRecord), [map.fact-cache.isStoredFacts](map.md#map.fact-cache.isStoredFacts)
    - fn [isStoredFacts](../../src/fact-cache.ts#L43) (value: unknown) → value is StoredFacts <!-- internal -->
      <a id="map.fact-cache.isStoredFacts"></a><br>Runtime type guard that checks a deserialized cache record has the full per-file facts shape: string path, valid end position, well-formed import/decl/export/call arrays, a complete/opaque completeness flag, and a null or positioned parse error. Relies on… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [map.fact-cache.isRecord](map.md#map.fact-cache.isRecord), [map.fact-cache.isPosition](map.md#map.fact-cache.isPosition), [map.fact-cache.every](map.md#map.fact-cache.every), [map.fact-cache.isRange](map.md#map.fact-cache.isRange), [map.fact-cache.optionalTrue](map.md#map.fact-cache.optionalTrue), [map.fact-cache.optional](map.md#map.fact-cache.optional)
    - fn [isImport](../../src/fact-cache.ts#L63) (value: unknown) → boolean <!-- internal -->
      <a id="map.fact-cache.isImport"></a><br>Validates that an unknown value from the cache has the shape of an import record: a plain object via [`map.fact-cache.isRecord`](map.md#map.fact-cache.isRecord) with string source and text, a boolean reexport, a range checked by [`map.fact-cache.isRange`](map.md#map.fact-cache.isRange), an optional flag via [`map.fact-cache.optionalTrue`](map.md#map.fact-cache.optionalTrue), and… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [map.fact-cache.isRecord](map.md#map.fact-cache.isRecord), [map.fact-cache.isRange](map.md#map.fact-cache.isRange), [map.fact-cache.optionalTrue](map.md#map.fact-cache.optionalTrue), [map.fact-cache.every](map.md#map.fact-cache.every)
    - fn [isDecl](../../src/fact-cache.ts#L75) (value: unknown) → boolean <!-- internal -->
      <a id="map.fact-cache.isDecl"></a><br>Validates that an unknown value from the fact cache is a well-formed declaration record: kind is fn/class/type, with string name, range, boolean exported, valid calls/types, and recursively valid members. Optional fields are checked via [`map.fact-cache.optional`](map.md#map.fact-cache.optional) and… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [map.fact-cache.isRecord](map.md#map.fact-cache.isRecord), [map.fact-cache.isRange](map.md#map.fact-cache.isRange), [map.fact-cache.every](map.md#map.fact-cache.every), [map.fact-cache.optional](map.md#map.fact-cache.optional), [map.fact-cache.optionalTrue](map.md#map.fact-cache.optionalTrue)
    - fn [isCall](../../src/fact-cache.ts#L96) (value: unknown) → boolean <!-- internal -->
      <a id="map.fact-cache.isCall"></a><br>Validates that a cached call-site record has a string `callee`, a valid range via `isRange`, and only well-formed optional fields (bound, receiver, hook, passes, opaque/closure flags). Returns false on any shape mismatch. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [map.fact-cache.isRecord](map.md#map.fact-cache.isRecord), [map.fact-cache.isRange](map.md#map.fact-cache.isRange), [map.fact-cache.optionalTrue](map.md#map.fact-cache.optionalTrue), [map.fact-cache.optional](map.md#map.fact-cache.optional), [map.fact-cache.every](map.md#map.fact-cache.every)
    - fn [isHook](../../src/fact-cache.ts#L110) (value: unknown) → boolean <!-- internal -->
      <a id="map.fact-cache.isHook"></a><br>Checks that a value is a record (via [`map.fact-cache.isRecord`](map.md#map.fact-cache.isRecord)) with string `name`, `fallback`, and `path`, an `owner` of "self" or "constructor", and a `param` that is null or a non-negative integer per [`map.fact-cache.isInteger`](map.md#map.fact-cache.isInteger). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [map.fact-cache.isRecord](map.md#map.fact-cache.isRecord), [map.fact-cache.isInteger](map.md#map.fact-cache.isInteger)
    - fn [isPass](../../src/fact-cache.ts#L121) (value: unknown) → boolean <!-- internal -->
      <a id="map.fact-cache.isPass"></a><br>Checks that an unknown value is a plain object with an integer `arg`, string `path` and `callee`, plus optional `bound` and `receiver` fields validated via [`map.fact-cache.optional`](map.md#map.fact-cache.optional), using [`map.fact-cache.isRecord`](map.md#map.fact-cache.isRecord) for the shape test. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [map.fact-cache.isRecord](map.md#map.fact-cache.isRecord), [map.fact-cache.optional](map.md#map.fact-cache.optional)
    - fn [isExportRow](../../src/fact-cache.ts#L128) (value: unknown) → boolean <!-- internal -->
      <a id="map.fact-cache.isExportRow"></a><br>Validates that a cached value is a well-formed export row: an object (via [`map.fact-cache.isRecord`](map.md#map.fact-cache.isRecord)) with string `name`, a `kind` from the allowed set, and `local` either null or a string. Uses [`map.fact-cache.optional`](map.md#map.fact-cache.optional) to allow `form` and `from` to be absent, otherwise… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [map.fact-cache.isRecord](map.md#map.fact-cache.isRecord), [map.fact-cache.optional](map.md#map.fact-cache.optional)
    - fn [isBound](../../src/fact-cache.ts#L132) (value: unknown) → boolean <!-- internal -->
      <a id="map.fact-cache.isBound"></a><br>Returns true only when the input is exactly the string `"parameter"` or `"local"`, treating those two tags as the markers of a bound binding kind; any other value yields false. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [isRange](../../src/fact-cache.ts#L137) (value: Record<string, unknown>) → boolean <!-- internal -->
      <a id="map.fact-cache.isRange"></a><br>1-based `line`, `col`, `endLine`, `endCol`.
      - calls [map.fact-cache.isPosition](map.md#map.fact-cache.isPosition)
    - fn [isPosition](../../src/fact-cache.ts#L141) (value: unknown) → boolean <!-- internal -->
      <a id="map.fact-cache.isPosition"></a><br>Returns true only when the input passes [`map.fact-cache.isInteger`](map.md#map.fact-cache.isInteger) and is at least 1, i.e. a positive whole number usable as a line or column. Used by [`map.fact-cache.isRange`](map.md#map.fact-cache.isRange) and [`map.fact-cache.isStoredFacts`](map.md#map.fact-cache.isStoredFacts) to validate cached location fields. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [map.fact-cache.isInteger](map.md#map.fact-cache.isInteger)
    - fn [isInteger](../../src/fact-cache.ts#L145) (value: unknown) → value is number <!-- internal -->
      <a id="map.fact-cache.isInteger"></a><br>Type guard that checks a runtime value is a JavaScript number with no fractional part, narrowing it to `number`; [`map.fact-cache.isHook`](map.md#map.fact-cache.isHook) and [`map.fact-cache.isPosition`](map.md#map.fact-cache.isPosition) rely on it to validate cached fact fields. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [isString](../../src/fact-cache.ts#L149) (value: unknown) → boolean <!-- internal -->
      <a id="map.fact-cache.isString"></a><br>Returns true only when the given value is a primitive string, via a `typeof` check; used in [`map.fact-cache`](map.md#map.fact-cache) to validate untrusted fields before they are accepted into cached fact records. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [every](../../src/fact-cache.ts#L153) (value: unknown, check: (item: unknown) => boolean) → boolean <!-- internal -->
      <a id="map.fact-cache.every"></a><br>Returns true only when the input is an array and `check` holds for each element; a non-array yields false without calling `check`. Used by [`map.fact-cache.isCall`](map.md#map.fact-cache.isCall), [`map.fact-cache.isDecl`](map.md#map.fact-cache.isDecl), [`map.fact-cache.isImport`](map.md#map.fact-cache.isImport) and [`map.fact-cache.isStoredFacts`](map.md#map.fact-cache.isStoredFacts) to validate cached shapes. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [optional](../../src/fact-cache.ts#L157) (value: unknown, check: (item: unknown) => boolean) → boolean <!-- internal -->
      <a id="map.fact-cache.optional"></a><br>Returns true when the value is absent (`undefined`), otherwise defers to the supplied predicate. Shared by the row validators [`map.fact-cache.isCall`](map.md#map.fact-cache.isCall), [`map.fact-cache.isDecl`](map.md#map.fact-cache.isDecl), [`map.fact-cache.isExportRow`](map.md#map.fact-cache.isExportRow), [`map.fact-cache.isPass`](map.md#map.fact-cache.isPass), and [`map.fact-cache.isStoredFacts`](map.md#map.fact-cache.isStoredFacts) to accept… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [optionalTrue](../../src/fact-cache.ts#L161) (value: unknown) → boolean <!-- internal -->
      <a id="map.fact-cache.optionalTrue"></a><br>Returns true when the value is absent (`undefined`) or exactly `true`, treating a missing optional flag as set. Used by [`map.fact-cache.isCall`](map.md#map.fact-cache.isCall), [`map.fact-cache.isDecl`](map.md#map.fact-cache.isDecl) and [`map.fact-cache.isImport`](map.md#map.fact-cache.isImport) to validate optional boolean fields on cached facts. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [isRecord](../../src/fact-cache.ts#L165) (value: unknown) → value is Record<string, unknown> <!-- internal -->
      <a id="map.fact-cache.isRecord"></a><br>Type guard returning true only for non-null, non-array objects, narrowing the input to a string-keyed record. Shared base check used by the fact-cache validators like [`map.fact-cache.isStoredFacts`](map.md#map.fact-cache.isStoredFacts) and [`map.fact-cache.storedFiles`](map.md#map.fact-cache.storedFiles) before inspecting fields. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - module [FactCache](../../src/fact-cache.ts#L171)
      <a id="map.fact-cache.FactCache"></a><br>Caches per-file extraction results keyed by path and content hash, serving them from process memory or `FACT_CACHE_FILE` on disk when the hash matches and calling `extract` otherwise, while counting hits and misses. [`map.fact-cache.FactCache.serialize`](map.md#map.fact-cache.FactCache.serialize) writes back only the… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [constructor](../../src/fact-cache.ts#L180) (root: string, version: string, disk: Stored["files"]) <!-- internal -->
        <a id="map.fact-cache.FactCache.constructor"></a><br>Stores the given repository root, cache version string, and previously loaded per-file entries on the instance; private, so instances are only created through the class's own factory methods. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [open](../../src/fact-cache.ts#L187) (root: string, version: string) → FactCache
        <a id="map.fact-cache.FactCache.open"></a><br>`version` names the extractor and grammars; any other stored version is ignored.
        - calls [map.fact-cache.storedFiles](map.md#map.fact-cache.storedFiles), [map.fact-cache.FactCache](map.md#map.fact-cache.FactCache)
      - fn [facts](../../src/fact-cache.ts#L200) (path: string, sha256: string, extract: () => Promise<FileFacts>) → Promise<FileFacts>
        <a id="map.fact-cache.FactCache.facts"></a><br>Returns cached facts for a file, checking an in-memory map keyed by root, version and path, then the on-disk store, both validated against the given sha256; on a miss it runs the extractor and counts reuse versus extraction. Every result is written back to memory and recorded… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [serialize](../../src/fact-cache.ts#L219) () → string
        <a id="map.fact-cache.FactCache.serialize"></a><br>The text of `FACT_CACHE_FILE` with the facts of this run (and nothing else), for the next process.
        - calls [base.span.compareText](base.md#base.span.compareText)
  - module [frontends](../../src/frontends.ts#L1)
    <a id="map.frontends"></a><br>A frontend reads one family of languages: its extractor turns a file into `FileFacts`, its resolver turns an import specifier into a file, and its capabilities say which edges it looks for. Graph, snapshot and checks are the same for every language; adding one means a frontend…
    - facts [extract.facts](extract.md#extract.facts)
    - python [extract.python](extract.md#extract.python)
    - rust [extract.rust](extract.md#extract.rust)
    - ts [extract.ts](extract.md#extract.ts)
    - imports [map.imports](map.md#map.imports)
    - languages [base.languages](base.md#base.languages)
    - python-imports [map.python-imports](map.md#map.python-imports)
    - rust-imports [map.rust-imports](map.md#map.rust-imports)
    - type [Frontend](../../src/frontends.ts#L15)
      <a id="map.frontends.Frontend"></a><br>Contract a per-language analyzer fulfils: extracting facts from one file, building a per-graph resolver over the set of analyzed sources, and declaring which edge kinds it reports plus which global names count as external rather than unresolved. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [ecmascriptResolver](../../src/frontends.ts#L81) (root: string, sources: ReadonlySet<string>) → SourceResolver <!-- internal -->
      <a id="map.frontends.ecmascriptResolver"></a><br>Builds a [`map.imports.ImportResolver`](map.md#map.imports.ImportResolver) over the given root directory and source-file set and returns it as the resolver used for JavaScript/TypeScript import lookups. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [map.imports.ImportResolver](map.md#map.imports.ImportResolver)
    - fn [pythonResolver](../../src/frontends.ts#L85) (root: string, sources: ReadonlySet<string>) → SourceResolver <!-- internal -->
      <a id="map.frontends.pythonResolver"></a><br>Factory adapter that wraps a project root and its known source paths in a [`map.python-imports.PythonResolver`](map.md#map.python-imports.PythonResolver) instance and returns it typed as a generic SourceResolver. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [map.python-imports.PythonResolver](map.md#map.python-imports.PythonResolver)
    - fn [rustResolver](../../src/frontends.ts#L89) (root: string, sources: ReadonlySet<string>) → SourceResolver <!-- internal -->
      <a id="map.frontends.rustResolver"></a><br>Builds a [`map.rust-imports.RustResolver`](map.md#map.rust-imports.RustResolver) for the given project root and set of known source paths, returning it as the generic SourceResolver the frontend registry hands to callers. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [map.rust-imports.RustResolver](map.md#map.rust-imports.RustResolver)
    - fn [frontendOf](../../src/frontends.ts#L93) (language: Language) → Frontend
      <a id="map.frontends.frontendOf"></a><br>Looks up the frontend registered for a language in the module-level `FRONTENDS` table and returns it directly, with no fallback for unknown languages. [`map.graph.buildGraph`](map.md#map.graph.buildGraph) uses it to pick the parser per file. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [frontendFor](../../src/frontends.ts#L100) (path: string) → Frontend | undefined
      <a id="map.frontends.frontendFor"></a><br>Resolves a file path to the language-specific frontend used to parse it, looking the language up via [`base.languages.languageOf`](base.md#base.languages.languageOf) and indexing a static table. Returns nothing when the path's language is unknown. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [base.languages.languageOf](base.md#base.languages.languageOf)
  - module [graph](../../src/graph.ts#L1)
    <a id="map.graph"></a><br>Facts → graph: files become modules in layers, declarations become fn/type nodes, imports become dependencies. A resolved call is a syntactic edge; a local or missing callee stays a gap instead of a confirmed edge.
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - declared-packages [map.declared-packages](map.md#map.declared-packages)
    - exports [map.exports](map.md#map.exports)
    - facts [extract.facts](extract.md#extract.facts)
    - external-ids [base.external-ids](base.md#base.external-ids)
    - glob [base.glob](base.md#base.glob)
    - frontends [map.frontends](map.md#map.frontends)
    - imports [map.imports](map.md#map.imports)
    - languages [base.languages](base.md#base.languages)
    - span [base.span](base.md#base.span)
    - type [Graph](../../src/graph.ts#L19)
      <a id="map.graph.Graph"></a><br>The analysis result for a repository: layers, modules keyed by ID and by owning source path, stats, warnings, and gaps marking unanalysed spots. It also carries unresolved or multi-target edges, resolver config inputs, all public exports, and declared packages. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Gap](../../src/graph.ts#L38)
      <a id="map.graph.Gap"></a><br>Records a spot in the codebase the mapper could not resolve, tagging it with one of six kinds, a file position span, the offending text, and a reason. Also optionally names the enclosing module or function. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [OpenEdge](../../src/graph.ts#L51)
      <a id="map.graph.OpenEdge"></a><br>Describes a single call or type reference from a source node to a target that may be resolved, ambiguous (with a candidates list), or unresolved, along with the file position and span and the referencing text. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Layer](../../src/graph.ts#L65)
      <a id="map.graph.Layer"></a><br>Describes one architectural layer of the repository as a named group holding its top-level modules in the order the map lists them. It is a plain data shape with no behaviour, consumed by code that builds or renders the codebase map. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Module](../../src/graph.ts#L71)
      <a id="map.graph.Module"></a><br>Describes one node of the dependency map — a file, directory, package or class — with its location, nested `Dep`, `Fn`, `TypeNode` and child `Module` entries, plus whether its member list is complete and which `export *` sources it re-exports. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Dep](../../src/graph.ts#L99)
      <a id="map.graph.Dep"></a><br>Describes one import edge in the dependency graph: the local alias, the resolved target module, the exact source position and text of the import statement, and whether it is a re-export. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Fn](../../src/graph.ts#L112)
      <a id="map.graph.Fn"></a><br>Describes one function node in the code map: where it is declared, its signature and export status, static/private naming, an optional fingerprint of its declarations, its outgoing `Call` list, and how it may be reached without a direct named call via `Escape`. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Escape](../../src/graph.ts#L136)
      <a id="map.graph.Escape"></a><br>Record of a source location (file, line, column) paired with a free-text reason, used to report a spot where graph analysis could not resolve a reference. Carries no behavior; it is pure data shaped for diagnostics output. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Call](../../src/graph.ts#L143)
      <a id="map.graph.Call"></a><br>Describes one outgoing call edge recorded for a function: the callee name, the source span and text of the call, and optional fields marking calls that arrive through a hook (a parameter default or a value injected at a recorded site) or from inside a closure. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [TypeNode](../../src/graph.ts#L164)
      <a id="map.graph.TypeNode"></a><br>Describes one declared type in the dependency graph: its unique id, display name, source file and start/end position, optional signature and doc text, whether it is exported, and an optional content fingerprint. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Stats](../../src/graph.ts#L178)
      <a id="map.graph.Stats"></a><br>Holds counters summarizing a built graph: counts of files, modules, functions, types, and dependencies, plus call-resolution tallies (resolved, unresolved, external, dynamic), unresolved imports, and files assigned to no module. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [globalsOf](../../src/graph.ts#L201) (file: string) → Frontend["globals"] <!-- internal -->
      <a id="map.graph.globalsOf"></a><br>Looks up the language frontend for a file path via [`map.frontends.frontendFor`](map.md#map.frontends.frontendFor) and returns its globals table, falling back to an empty set when no frontend matches. Used by [`map.graph.buildGraph`](map.md#map.graph.buildGraph) to seed per-file global symbols. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [map.frontends.frontendFor](map.md#map.frontends.frontendFor)
    - type [FileEntry](../../src/graph.ts#L205) <!-- internal -->
      <a id="map.graph.FileEntry"></a><br>Pairs a file's extracted facts with the module it belongs to, giving the graph builder a single record per source file to hold both pieces of per-file state together. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [buildGraph](../../src/graph.ts#L210) (config: Config, files: FileFacts[]) → Graph
      <a id="map.graph.buildGraph"></a><br>Turns per-file facts into the whole map graph: places files into layer modules via [`map.graph.placeFile`](map.md#map.graph.placeFile), records declarations with [`map.graph.addDecl`](map.md#map.graph.addDecl), resolves imports into dependencies and external packages, then links calls and exports. Collisions, unresolved imports and… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [map.frontends.frontendOf](map.md#map.frontends.frontendOf), [map.frontends.frontendFor](map.md#map.frontends.frontendFor), [map.graph.placeFile](map.md#map.graph.placeFile), [map.graph.isIndexFile](map.md#map.graph.isIndexFile), [map.graph.addDecl](map.md#map.graph.addDecl), [map.graph.markOpaque](map.md#map.graph.markOpaque), [map.declared-packages.readManifests](map.md#map.declared-packages.readManifests), [base.external-ids.assignExternalIds](base.md#base.external-ids.assignExternalIds), [map.graph.importedPackages](map.md#map.graph.importedPackages), [base.span.compareText](base.md#base.span.compareText), [map.graph.notIndexed](map.md#map.graph.notIndexed), [map.graph.importTarget](map.md#map.graph.importTarget), [base.external-ids.externalSegment](base.md#base.external-ids.externalSegment), [base.config.layerName](base.md#base.config.layerName), [map.graph.exportInput](map.md#map.graph.exportInput), [map.exports.resolveExports](map.md#map.exports.resolveExports), [map.graph.memberKey](map.md#map.graph.memberKey), [map.graph.globalsOf](map.md#map.graph.globalsOf), [map.graph.addCall](map.md#map.graph.addCall), [map.graph.holeReason](map.md#map.graph.holeReason), [base.languages.constructorName](base.md#base.languages.constructorName), [map.graph.markEscapes](map.md#map.graph.markEscapes)
    - type [ImportTarget](../../src/graph.ts#L853) <!-- internal -->
      <a id="map.graph.ImportTarget"></a><br>What one import binding names in the file: a declaration of the module (`named`, `default`) or the module itself.
    - fn [importTarget](../../src/graph.ts#L861) (module: Module, binding: ImportBinding, whole: boolean) → ImportTarget <!-- internal -->
      <a id="map.graph.importTarget"></a><br>A specifier that names the module itself (Rust `use crate::a`, Python `from pkg import mod`) binds the module.
    - fn [exportInput](../../src/graph.ts#L873) (row: ExportRow, facts: FileFacts, module: Module, imported: ReadonlyMap<string, ImportTarget[]>, declModule: ReadonlyMap<string, ReadonlyMap<string, string>>) → ExportRowInput <!-- internal -->
      <a id="map.graph.exportInput"></a><br>One export row of a file, with what it stands for: a declaration of the module, a name or the namespace of the module an import binds, or nothing keylang indexes. A re-export (`export { a } from`, Rust `pub use`) goes through its own import; any other name through a declaration…
      - calls [base.config.layerName](base.md#base.config.layerName)
    - fn [importedPackages](../../src/graph.ts#L892) (files: readonly FileFacts[], resolve: (file: string, spec: string) => Resolution) → Set<string> <!-- internal -->
      <a id="map.graph.importedPackages"></a><br>Names of the external packages (and `node` for built-ins) the files import.
    - fn [notIndexed](../../src/graph.ts#L909) (config: Config, file: string) → string | null <!-- internal -->
      <a id="map.graph.notIndexed"></a><br>Why a resolved source file has no module; null when it is left out on purpose: not source code (JSON, CSS), a test or declaration file, `exclude`, outside guessed layers.
      - calls [base.languages.languageOf](base.md#base.languages.languageOf), [base.config.isExcluded](base.md#base.config.isExcluded), [base.config.isOutside](base.md#base.config.isOutside), [map.graph.placeFile](map.md#map.graph.placeFile)
    - fn [isIndexFile](../../src/graph.ts#L916) (file: string) → boolean <!-- internal -->
      <a id="map.graph.isIndexFile"></a><br>Reports whether a path's extension-stripped basename appears in the per-language index list, resolving the language via [`base.languages.languageOf`](base.md#base.languages.languageOf) and returning false when no language matches. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [base.languages.languageOf](base.md#base.languages.languageOf)
    - fn [addCall](../../src/graph.ts#L927) (fn: Fn, call: Call) → boolean <!-- internal -->
      <a id="map.graph.addCall"></a><br>Add a call unless an edge to the same target already says as much: a direct call proves what a hook edge does, a call outside a closure what one inside does. A stronger edge replaces the weaker ones.
    - fn [holeReason](../../src/graph.ts#L935) (c: CallFact) → string <!-- internal -->
      <a id="map.graph.holeReason"></a><br>Builds a human-readable explanation for why a call site could not be resolved to a concrete target, distinguishing hook-based calls, calls through `this`, and calls through local values. [`map.graph.buildGraph`](map.md#map.graph.buildGraph) uses the string to annotate unresolved edges. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [markEscapes](../../src/graph.ts#L947) (modules: Map<string, Module>, readIds: ReadonlyMap<string, Escape>, readMembers: ReadonlyMap<string, Escape>, calledNames: ReadonlyMap<string, Escape>, members: Decls["members"]) → void <!-- internal -->
      <a id="map.graph.markEscapes"></a><br>Functions that code may reach without naming them in a call: read as a value (`later(save)` names the declaration `save` resolves to; `obj.save` any method `save`), called implicitly, or the constructor of a class read as a value (`extends A` runs `A`'s constructor).
      - calls [base.languages.constructorName](base.md#base.languages.constructorName), [base.languages.implicitMember](base.md#base.languages.implicitMember)
    - fn [markOpaque](../../src/graph.ts#L962) (m: Module) → void <!-- internal -->
      <a id="map.graph.markOpaque"></a><br>Sets a module's `members` field to the string `"opaque"`, then recurses into each entry of `m.children` so the whole subtree is marked the same way; used by [`map.graph.buildGraph`](map.md#map.graph.buildGraph). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Decls](../../src/graph.ts#L968) <!-- internal -->
      <a id="map.graph.Decls"></a><br>Where each declaration went: several facts (overloads) may share one node.
    - fn [memberKey](../../src/graph.ts#L979) (member: string, isStatic: boolean) → string
      <a id="map.graph.memberKey"></a><br>Lookup key of a class member: `this.#m` in a static method is `static #m`.
      - calls [base.config.layerName](base.md#base.config.layerName)
    - fn [memberSegments](../../src/graph.ts#L993) (members: readonly DeclFact[]) → Map<DeclFact, { key: string; segment: string }> <!-- internal -->
      <a id="map.graph.memberSegments"></a><br>ID segments of class members. An instance member keeps its name; a static or `#private` member of the same name as another gets a suffix (`m-static`, `go-private`, `go-static-private`), which no JS name can collide with.
      - calls [map.graph.memberKey](map.md#map.graph.memberKey), [base.config.layerName](base.md#base.config.layerName)
    - fn [addDecl](../../src/graph.ts#L1015) (module: Module, d: DeclFact, names: Map<string, string>, declModule: Map<string, Map<string, string>>, decls: Decls, stats: Stats, file: string, member?: { key: string; segment: string }) → void <!-- internal -->
      <a id="map.graph.addDecl"></a><br>Registers one declaration fact as a graph node under `module`: merging duplicate or overloaded fns into the first node (extending its range, joining fingerprints), resolving interface/class name clashes, and creating class child modules whose members it recurses into via… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [base.config.layerName](base.md#base.config.layerName), [map.graph.memberSegments](map.md#map.graph.memberSegments)
    - fn [placeFile](../../src/graph.ts#L1100) (config: Config, file: string) → { layer: string; segments: string[]; stem: string } | null
      <a id="map.graph.placeFile"></a><br>Layer and module path segments for a file, from the first matching layer glob. `stem` is the path the module stands for, before segments are sanitized: the file without its extension (`src/a/b` for `src/a/b.ts` and `src/a/b/index.ts`), or its directory in `dir` mode. Two files…
      - calls [base.config.isOutside](base.md#base.config.isOutside), [base.glob.matchesGlob](base.md#base.glob.matchesGlob), [base.glob.globPrefix](base.md#base.glob.globPrefix), [base.languages.languageOf](base.md#base.languages.languageOf)
  - module [imports](../../src/imports.ts#L1)
    <a id="map.imports"></a><br>Import specifier → file. Relative paths with extension probing, `tsconfig` (or `jsconfig`, and the configs it `references`) `paths`/`baseUrl`, `package.json` `imports` (`#alias`), Node built-ins.
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - ts [extract.ts](extract.md#extract.ts)
    - type [Resolution](../../src/imports.ts#L23)
      <a id="map.imports.Resolution"></a><br>Classifies where an import specifier resolved: a file inside the repo (optionally tagged with its workspace package, whole-module, or nested-module flags), the importing file itself, an external package, a runtime builtin, generated code, or nothing. Internal results carry the… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [SourceResolver](../../src/imports.ts#L35)
      <a id="map.imports.SourceResolver"></a><br>Contract for mapping an import specifier, seen from a given file, to a resolution result, backed by a record of every config file consulted (path to text or null if missing). That record feeds the snapshot id, so cache validity tracks the configs that shaped the resolution. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [PathRule](../../src/imports.ts#L43) <!-- internal -->
      <a id="map.imports.PathRule"></a><br>Pairs a module-specifier pattern with the list of filesystem targets it maps to, each already resolved relative to the repository root. Used by the import resolver to turn aliased specifiers into candidate paths. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - module [ImportResolver](../../src/imports.ts#L49)
      <a id="map.imports.ImportResolver"></a><br>Maps an import specifier from a given file to a repository source file, a Node builtin, an external or generated module, or unresolved, honoring tsconfig `paths`/`baseUrl`, `#` subpath imports, and workspace packages. It records every config file and `node_modules` lookup it… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [constructor](../../src/imports.ts#L67) (root: string, sources: ReadonlySet<string> = new Set())
        <a id="map.imports.ImportResolver.constructor"></a><br>Builds a cached file reader that records each read's text, then uses it via [`map.imports.loadTsconfig`](map.md#map.imports.loadTsconfig) to pick up baseUrl/paths from tsconfig or jsconfig. Also parses package.json to collect declared dependency names and workspace globs. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [map.imports.readText](map.md#map.imports.readText), [map.imports.parseJsonc](map.md#map.imports.parseJsonc), [map.imports.loadTsconfig](map.md#map.imports.loadTsconfig), [map.imports.isObject](map.md#map.imports.isObject)
      - fn [known](../../src/imports.ts#L89) (pkg: string) → boolean <!-- internal -->
        <a id="map.imports.ImportResolver.known"></a><br>A package the project declares, or one installed in a `node_modules` at or above the root.
        - calls [map.imports.ImportResolver.locate](map.md#map.imports.ImportResolver.locate)
      - fn [locate](../../src/imports.ts#L100) (pkg: string) → Located <!-- internal -->
        <a id="map.imports.ImportResolver.locate"></a><br>Where `node_modules` at or above the root has the package: a link into the repository is a workspace package. Without an install, a `workspaces` entry of the root `package.json` with that `name` is one too.
        - calls [map.imports.inside](map.md#map.imports.inside), [map.imports.ImportResolver.workspaceDirs](map.md#map.imports.ImportResolver.workspaceDirs)
      - fn [workspaceDirs](../../src/imports.ts#L129) () → string[] <!-- internal -->
        <a id="map.imports.ImportResolver.workspaceDirs"></a><br>Directories the root `workspaces` globs name (`packages/*`, `apps/web`).
        - calls [base.config.toPosix](base.md#base.config.toPosix)
      - fn [packageEntry](../../src/imports.ts#L153) (dir: string, subpath: string) → string | null <!-- internal -->
        <a id="map.imports.ImportResolver.packageEntry"></a><br>The source file a workspace package names for `subpath` (`""`, `/util`): `exports` (a string, subpaths, `*` patterns, conditions), else `module`, `main`, `index`. A declaration file is not source.
        - calls [map.imports.flattenTarget](map.md#map.imports.flattenTarget), [map.imports.isObject](map.md#map.imports.isObject), [map.imports.matchPattern](map.md#map.imports.matchPattern), [map.imports.ImportResolver.probe](map.md#map.imports.ImportResolver.probe), [base.config.toPosix](base.md#base.config.toPosix)
      - fn [resolve](../../src/imports.ts#L183) (fromFile: string, spec: string) → Resolution
        <a id="map.imports.ImportResolver.resolve"></a><br>Memoizes import resolution per `(fromFile, spec)` pair in an instance cache keyed by a NUL-joined string, delegating to [`map.imports.ImportResolver.resolveUncached`](map.md#map.imports.ImportResolver.resolveUncached) only on a miss and storing its result. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [map.imports.ImportResolver.resolveUncached](map.md#map.imports.ImportResolver.resolveUncached)
      - fn [resolveUncached](../../src/imports.ts#L193) (fromFile: string, spec: string) → Resolution <!-- internal -->
        <a id="map.imports.ImportResolver.resolveUncached"></a><br>Classifies an import specifier as generated, internal, builtin, package, or unresolved, trying relative paths via [`map.imports.ImportResolver.probe`](map.md#map.imports.ImportResolver.probe), `#` subpaths, tsconfig `paths` through [`map.imports.bestMatch`](map.md#map.imports.bestMatch), then `baseUrl`. Falls back to [`extract.ts.isNodeBuiltin`](extract.md#extract.ts.isNodeBuiltin) and… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [map.imports.ImportResolver.probe](map.md#map.imports.ImportResolver.probe), [map.imports.ImportResolver.resolveSubpathImport](map.md#map.imports.ImportResolver.resolveSubpathImport), [map.imports.bestMatch](map.md#map.imports.bestMatch), [extract.ts.isNodeBuiltin](extract.md#extract.ts.isNodeBuiltin), [map.imports.ImportResolver.resolvePackage](map.md#map.imports.ImportResolver.resolvePackage)
      - fn [resolveSubpathImport](../../src/imports.ts#L222) (fromFile: string, spec: string) → Resolution <!-- internal -->
        <a id="map.imports.ImportResolver.resolveSubpathImport"></a><br>`#alias`: the `imports` of the nearest `package.json` above the importing file, as Node scopes them (an exact key, else the longest pattern prefix). A target that is not a relative path names a package.
        - calls [map.imports.ImportResolver.scopeImports](map.md#map.imports.ImportResolver.scopeImports), [map.imports.bestMatch](map.md#map.imports.bestMatch), [base.config.toPosix](base.md#base.config.toPosix), [map.imports.ImportResolver.resolve](map.md#map.imports.ImportResolver.resolve), [map.imports.ImportResolver.probe](map.md#map.imports.ImportResolver.probe)
      - fn [scopeImports](../../src/imports.ts#L245) (dir: string) → PathRule[] | null <!-- internal -->
        <a id="map.imports.ImportResolver.scopeImports"></a><br>`imports` of `<dir>/package.json`; an empty list when it has none, null without the file.
        - calls [map.imports.isObject](map.md#map.imports.isObject), [map.imports.flattenTarget](map.md#map.imports.flattenTarget)
      - fn [resolvePackage](../../src/imports.ts#L255) (fromFile: string, spec: string) → Resolution <!-- internal -->
        <a id="map.imports.ImportResolver.resolvePackage"></a><br>Extracts the package name via [`map.imports.packageName`](map.md#map.imports.packageName) and, if [`map.imports.ImportResolver.locate`](map.md#map.imports.ImportResolver.locate) finds it in the workspace, maps the subpath to a file with [`map.imports.ImportResolver.packageEntry`](map.md#map.imports.ImportResolver.packageEntry) as an internal result. Otherwise marks it external when… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [map.imports.packageName](map.md#map.imports.packageName), [map.imports.ImportResolver.locate](map.md#map.imports.ImportResolver.locate), [map.imports.ImportResolver.packageEntry](map.md#map.imports.ImportResolver.packageEntry), [map.imports.ImportResolver.known](map.md#map.imports.ImportResolver.known), [map.imports.ImportResolver.knownNear](map.md#map.imports.ImportResolver.knownNear)
      - fn [knownNear](../../src/imports.ts#L266) (fromFile: string, pkg: string) → boolean <!-- internal -->
        <a id="map.imports.ImportResolver.knownNear"></a><br>Declared in, or installed next to, a `package.json` between `fromFile` and the root.
        - calls [map.imports.isObject](map.md#map.imports.isObject)
      - fn [probe](../../src/imports.ts#L285) (candidate: string) → string | null <!-- internal -->
        <a id="map.imports.ImportResolver.probe"></a><br>Candidate file (POSIX, relative to root) → existing source file, or null.
    - type [Located](../../src/imports.ts#L311) <!-- internal -->
      <a id="map.imports.Located"></a><br>Describes where an imported package was resolved: inside a workspace member at a given directory, in installed dependencies, or not found at all (`null`). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [inside](../../src/imports.ts#L314) (root: string, abs: string) → string | null <!-- internal -->
      <a id="map.imports.inside"></a><br>`abs` (after links) as a POSIX path under `root`, outside any `node_modules`; null otherwise.
      - calls [base.config.toPosix](base.md#base.config.toPosix)
    - fn [isObject](../../src/imports.ts#L329) (value: unknown) → value is Record<string, unknown> <!-- internal -->
      <a id="map.imports.isObject"></a><br>Type guard that returns true only for non-null, non-array object values, narrowing them to a string-keyed record. Used by the resolver and tsconfig loaders in [`map.imports`](map.md#map.imports) to validate parsed JSON before reading fields. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [bestMatch](../../src/imports.ts#L339) (rules: readonly PathRule[], spec: string) → { rule: PathRule; star: string } | null <!-- internal -->
      <a id="map.imports.bestMatch"></a><br>The rule `tsc` (`matchPatternOrExact`) and Node (`PATTERN_KEY_COMPARE`) apply: an exact key, else the matching pattern with the longest prefix before `*` (then the longer key), else the first in the file. `star` is the text the `*` stands for.
      - calls [map.imports.matchPattern](map.md#map.imports.matchPattern)
    - fn [matchPattern](../../src/imports.ts#L351) (pattern: string, spec: string) → string | null <!-- internal -->
      <a id="map.imports.matchPattern"></a><br>Tests a module specifier against a single-wildcard glob (prefix`*`suffix), returning the text matched by the star, an empty string for an exact literal match, or null when it doesn't fit. Used by [`map.imports.ImportResolver.packageEntry`](map.md#map.imports.ImportResolver.packageEntry) and [`map.imports.bestMatch`](map.md#map.imports.bestMatch) to resolve… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [flattenTarget](../../src/imports.ts#L362) (t: unknown) → string[] <!-- internal -->
      <a id="map.imports.flattenTarget"></a><br>Recursively collapses a package.json `exports`/`imports` target—string, array, or conditional object—into a flat list of every string path it contains, dropping anything else. [`map.imports.ImportResolver.packageEntry`](map.md#map.imports.ImportResolver.packageEntry) and [`map.imports.ImportResolver.scopeImports`](map.md#map.imports.ImportResolver.scopeImports) use it to… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [packageName](../../src/imports.ts#L369) (spec: string) → string
      <a id="map.imports.packageName"></a><br>Extracts the bare package name from an import specifier, keeping the first path segment, or the first two when the specifier starts with `@` (a scoped package). Used by [`map.imports.ImportResolver.resolvePackage`](map.md#map.imports.ImportResolver.resolvePackage) to locate the package being imported. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [readJsonc](../../src/imports.ts#L375) (path: string) → unknown
      <a id="map.imports.readJsonc"></a><br>JSON with comments and trailing commas (tsconfig style).
      - calls [map.imports.readText](map.md#map.imports.readText), [map.imports.parseJsonc](map.md#map.imports.parseJsonc)
    - fn [parseJsonc](../../src/imports.ts#L381) (text: string) → unknown
      <a id="map.imports.parseJsonc"></a><br>The value of JSONC text; null when it does not parse.
      - calls [map.imports.stripJsonc](map.md#map.imports.stripJsonc)
    - fn [parseJsoncStrict](../../src/imports.ts#L390) (text: string) → unknown
      <a id="map.imports.parseJsoncStrict"></a><br>The value of JSONC text; throws the `JSON.parse` error when it does not parse.
      - calls [map.imports.stripJsonc](map.md#map.imports.stripJsonc)
    - fn [readText](../../src/imports.ts#L395) (path: string) → string | null <!-- internal -->
      <a id="map.imports.readText"></a><br>A file's text, or null when it is missing.
    - fn [stripJsonc](../../src/imports.ts#L400) (text: string) → string <!-- internal -->
      <a id="map.imports.stripJsonc"></a><br>Remove comments and trailing commas outside of strings.
    - type [Tsconfig](../../src/imports.ts#L421) <!-- internal -->
      <a id="map.imports.Tsconfig"></a><br>Holds the resolved compiler options from a tsconfig that matter for import resolution: an optional base directory and a list of `PathRule` alias patterns used to rewrite module specifiers. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [MergedOptions](../../src/imports.ts#L427) <!-- internal -->
      <a id="map.imports.MergedOptions"></a><br>Options of one config after its `extends` chain, before `paths` targets are placed.
    - fn [loadTsconfig](../../src/imports.ts#L440) (read: (file: string) => unknown, file: string) → Tsconfig <!-- internal -->
      <a id="map.imports.loadTsconfig"></a><br>`compilerOptions.baseUrl`/`paths` following relative `extends` chains. As in `tsc`, `paths` targets resolve against the `baseUrl` of the final options (a child config's `baseUrl` moves inherited `paths` too), or the directory of the config that declares them.
      - calls [map.imports.mergedOptions](map.md#map.imports.mergedOptions), [map.imports.placePaths](map.md#map.imports.placePaths), [map.imports.isObject](map.md#map.imports.isObject), [base.config.toPosix](base.md#base.config.toPosix)
    - fn [mergedOptions](../../src/imports.ts#L459) (read: (file: string) => unknown, file: string, depth: number) → MergedOptions <!-- internal -->
      <a id="map.imports.mergedOptions"></a><br>Resolves a tsconfig's effective `baseUrl` and `paths` by recursively following relative `extends` entries (up to depth 5, skipping package names and paths outside the tree), letting child settings override parents. Returned values are anchored to each config's directory, so… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [map.imports.isObject](map.md#map.imports.isObject), [base.config.toPosix](base.md#base.config.toPosix)
    - fn [placePaths](../../src/imports.ts#L478) (options: MergedOptions) → PathRule[] <!-- internal -->
      <a id="map.imports.placePaths"></a><br>Turns the tsconfig `paths` block into rules whose target entries are resolved to normalized POSIX paths under `baseUrl` (or the paths file's directory), dropping non-string targets. Uses [`base.config.toPosix`](base.md#base.config.toPosix) and feeds [`map.imports.loadTsconfig`](map.md#map.imports.loadTsconfig). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [base.config.toPosix](base.md#base.config.toPosix)
  - module [map](../../src/map.ts#L1)
    <a id="map.map"></a><br>`keylang map`: source files → facts → graph → map/*.md + .keylang/index.json.
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - languages [base.languages](base.md#base.languages)
    - span [base.span](base.md#base.span)
    - facts [extract.facts](extract.md#extract.facts)
    - frontends [map.frontends](map.md#map.frontends)
    - emit [map.emit](map.md#map.emit)
    - explanations [map.explanations](map.md#map.explanations)
    - graph [map.graph](map.md#map.graph)
    - fact-cache [map.fact-cache](map.md#map.fact-cache)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - type [MapResult](../../src/map.ts#L18)
      <a id="map.map.MapResult"></a><br>Bundles everything one map run produces: the `Graph`, generated map files and optional explanations keyed by file name, the `AnalysisSnapshot`, skip and fact-cache reuse counts, and the serialized fact cache text for the next run. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [generateMap](../../src/map.ts#L38) (config: Config, options: { persist?: boolean; overlay?: ReadonlyMap<string, string> } = {}) → Promise<MapResult>
      <a id="map.map.generateMap"></a><br>`persist` prepares the fact cache for the next process (`keylang map` only; the commit step writes it, generation writes nothing); `overlay` gives unsaved text of source files by absolute path (the language server).
      - calls [base.config.sourceTree](base.md#base.config.sourceTree), [base.config.toPosix](base.md#base.config.toPosix), [base.languages.languageOf](base.md#base.languages.languageOf), [base.config.isAnalysed](base.md#base.config.isAnalysed), [map.map.readSource](map.md#map.map.readSource), [map.snapshot.sha256](map.md#map.snapshot.sha256), [map.graph.placeFile](map.md#map.graph.placeFile), [map.fact-cache.FactCache.open](map.md#map.fact-cache.FactCache.open), [map.map.extractorCode](map.md#map.map.extractorCode), [map.snapshot.grammarVersions](map.md#map.snapshot.grammarVersions), [map.frontends.frontendFor](map.md#map.frontends.frontendFor), [map.map.extractGuarded](map.md#map.map.extractGuarded), [base.config.excludedSourceFiles](base.md#base.config.excludedSourceFiles), [map.map.opaqueFacts](map.md#map.map.opaqueFacts), [base.config.outsideSourceFiles](base.md#base.config.outsideSourceFiles), [map.graph.buildGraph](map.md#map.graph.buildGraph), [map.snapshot.buildSnapshot](map.md#map.snapshot.buildSnapshot), [map.explanations.loadBriefs](map.md#map.explanations.loadBriefs), [map.emit.renderExplainedMap](map.md#map.emit.renderExplainedMap), [map.explanations.explanationOf](map.md#map.explanations.explanationOf), [map.emit.renderMap](map.md#map.emit.renderMap)
    - fn [opaqueFacts](../../src/map.ts#L121) (path: string) → FileFacts <!-- internal -->
      <a id="map.map.opaqueFacts"></a><br>Builds an empty `FileFacts` record for a path with completeness set to "opaque": no imports, declarations, exports, or references, and no parse error. [`map.map.extractGuarded`](map.md#map.map.extractGuarded) and [`map.map.generateMap`](map.md#map.map.generateMap) use it as the placeholder when a file cannot or should not be analyzed. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [readSource](../../src/map.ts#L126) (abs: string) → string | null <!-- internal -->
      <a id="map.map.readSource"></a><br>A file's text; null when it no longer exists.
    - fn [extractGuarded](../../src/map.ts#L140) (extract: (path: string, src: string) => Promise<FileFacts>, path: string, src: string) → Promise<FileFacts> <!-- internal -->
      <a id="map.map.extractGuarded"></a><br>Facts of one file; a file whose syntax nests deeper than the extractor's stack (thousands of `+` terms or parentheses) is opaque with a parse error, so one pathological file does not stop the whole analysis.
      - calls [map.map.opaqueFacts](map.md#map.map.opaqueFacts)
    - type [MapDiff](../../src/map.ts#L151)
      <a id="map.map.MapDiff"></a><br>Describes the result of comparing generated output against the target directory: paths of existing files the generator does not own, and paths of generated files that are missing, changed, or extra. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [targets](../../src/map.ts#L162) (config: Config, r: MapResult) → { dir: string; files: ReadonlyMap<string, string>; artifact: "map" | "explained" }[] <!-- internal -->
      <a id="map.map.targets"></a><br>Directories the generator owns and what they should hold: the map, and the explained map (empty when `explain.map` is off, so its generated files go).
    - fn [extraGenerated](../../src/map.ts#L170) (dir: string, files: ReadonlyMap<string, string>) → string[] <!-- internal -->
      <a id="map.map.extraGenerated"></a><br>Generated files in `dir` that should not be there.
      - calls [map.emit.isGeneratedMap](map.md#map.emit.isGeneratedMap)
    - fn [mapConflicts](../../src/map.ts#L178) (config: Config, r: MapResult) → string[]
      <a id="map.map.mapConflicts"></a><br>Target files of both maps that exist and are not generated. Sorted.
      - calls [map.map.targets](map.md#map.map.targets), [map.emit.isGeneratedMap](map.md#map.emit.isGeneratedMap)
    - type [MapArtifact](../../src/map.ts#L190) = "map" | "explained" | "index" | "facts"
      <a id="map.map.MapArtifact"></a><br>What a step of the map's commit touches.
    - type [MapStep](../../src/map.ts#L193)
      <a id="map.map.MapStep"></a><br>One file step of `keylang map`: a path relative to the root, POSIX.
    - type [PlannedStep](../../src/map.ts#L199) extends MapStep <!-- internal -->
      <a id="map.map.PlannedStep"></a><br>Extends `MapStep` with the bytes a write step should produce and a precondition snapshot: the file's expected current content, null for absent, or undefined when no check applies. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [MapPlan](../../src/map.ts#L215)
      <a id="map.map.MapPlan"></a><br>What `keylang map` will do, computed before anything is written: the expected bytes of every target, the removals, and what the render was made from. Internal to one operation — not a stored format.
    - type [SourceInputs](../../src/map.ts#L227)
      <a id="map.map.SourceInputs"></a><br>What a snapshot was computed from: `keylang.json` and the source files. A change in either makes a plan built on it unfit.
    - type [MapInputs](../../src/map.ts#L235) extends SourceInputs <!-- internal -->
      <a id="map.map.MapInputs"></a><br>The inputs of the render: a change in any makes the plan unfit.
    - fn [sourceInputs](../../src/map.ts#L241) (config: Config, sources: readonly { path: string; sha256: string }[]) → SourceInputs
      <a id="map.map.sourceInputs"></a><br>The inputs of a snapshot as they are on disk now: the saved `keylang.json` and the snapshot's manifest.
      - calls [map.map.readOrNull](map.md#map.map.readOrNull)
    - fn [sourceInputProblems](../../src/map.ts#L250) (config: Config, inputs: SourceInputs, subject: string) → string[]
      <a id="map.map.sourceInputProblems"></a><br>How `keylang.json` and the source files differ from the ones `subject` was computed from (`path: reason` lines, empty when none does): a changed config, a source added, changed or removed since.
      - calls [map.map.readOrNull](map.md#map.map.readOrNull), [base.config.sourceTree](base.md#base.config.sourceTree), [map.snapshot.sha256](map.md#map.snapshot.sha256)
    - type [CommittedStep](../../src/map.ts#L269) extends MapStep
      <a id="map.map.CommittedStep"></a><br>A step after the commit: done, failed with the reason, or never tried.
    - type [MapCommit](../../src/map.ts#L274)
      <a id="map.map.MapCommit"></a><br>Result record of a map commit, holding the list of steps that were actually written plus a flag saying whether the run finished, failed, or was cancelled by a signal between steps. Cancelled runs keep whatever steps already landed. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [planMap](../../src/map.ts#L285) (config: Config, r: MapResult) → MapPlan
      <a id="map.map.planMap"></a><br>Plans both maps, the index and the fact cache: a write for every missing or changed generated file, a removal for every generated file of a layer that is gone (or of a map turned off). Reads the disk, writes nothing.
      - calls [base.config.toPosix](base.md#base.config.toPosix), [map.map.targets](map.md#map.map.targets), [map.map.readOrNull](map.md#map.map.readOrNull), [map.map.extraGenerated](map.md#map.map.extraGenerated), [map.map.mapConflicts](map.md#map.map.mapConflicts), [map.map.sourceInputs](map.md#map.map.sourceInputs), [map.map.briefsKey](map.md#map.map.briefsKey)
    - fn [mapPlanProblems](../../src/map.ts#L319) (plan: MapPlan) → string[]
      <a id="map.map.mapPlanProblems"></a><br>Why the plan may not be committed now, as `path: reason` lines; empty when it may. Every target must pass the repository's write rules (a plain path that stays inside the repository through links) and still hold the bytes the plan saw — a manual file created meanwhile included…
      - calls [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [map.map.sourceInputProblems](map.md#map.map.sourceInputProblems), [map.map.briefsKey](map.md#map.map.briefsKey)
    - fn [commitMap](../../src/map.ts#L338) (plan: MapPlan, options: { signal?: AbortSignal; onStep?: (step: MapStep) => void } = {}) → Promise<MapCommit>
      <a id="map.map.commitMap"></a><br>Runs the plan's steps in order, each an atomic write (the generator's exact bytes, the permissions of the file it replaces, links followed inside the repository) or a removal. The signal is checked between steps: the step under way finishes. `onStep` is told before each step…
      - calls [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic), [base.safe-write.landing](base.md#base.safe-write.landing)
    - fn [briefsKey](../../src/map.ts#L367) (config: Config) → string <!-- internal -->
      <a id="map.map.briefsKey"></a><br>A hash of the briefs the explained map reads.
      - calls [map.snapshot.sha256](map.md#map.snapshot.sha256), [map.explanations.loadBriefs](map.md#map.explanations.loadBriefs)
    - fn [readOrNull](../../src/map.ts#L372) (abs: string) → string | null <!-- internal -->
      <a id="map.map.readOrNull"></a><br>A file's text, or null when there is none.
    - fn [diffMap](../../src/map.ts#L381) (config: Config, r: MapResult) → MapDiff
      <a id="map.map.diffMap"></a><br>Compare both generated maps with the files on disk (`map --check`).
      - calls [map.map.mapConflicts](map.md#map.map.mapConflicts), [map.map.targets](map.md#map.map.targets), [map.map.extraGenerated](map.md#map.map.extraGenerated)
    - fn [extractorCode](../../src/map.ts#L403) () → string <!-- internal -->
      <a id="map.map.extractorCode"></a><br>A hash of the extractor's own code. Facts cached by a changed extractor are stale even when nobody bumped `EXTRACTOR_VERSION`; in the package the same files are the built `.js`.
      - calls [map.snapshot.sha256](map.md#map.snapshot.sha256)
  - module [python-imports](../../src/python-imports.ts#L1)
    <a id="map.python-imports"></a><br>Python dotted path → file. `.m.x` starts at the importing file's package (one dot per level), `a.b.x` at a source root (the repository root, then `src/`). A module is `p.py` or the package `p/__init__.py`; the longest prefix of the path that is a module names the file, and when…
    - node [external.node](external.md#external.node)
    - imports [map.imports](map.md#map.imports)
    - module [PythonResolver](../../src/python-imports.ts#L15)
      <a id="map.python-imports.PythonResolver"></a><br>Maps Python import specifiers to repository files: relative imports walk up from the importing file, absolute ones probe each existing root dir, matching `x.py` or `x/__init__.py` among indexed sources or on disk. Unmatched top-level names are reported as external packages. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [constructor](../../src/python-imports.ts#L24) (root: string, sources: ReadonlySet<string> = new Set())
        <a id="map.python-imports.PythonResolver.constructor"></a><br>Stores the project root and known source files, derives their containing directories via [`map.python-imports.directoriesOf`](map.md#map.python-imports.directoriesOf), and keeps only the candidate root dirs that exist on disk per [`map.python-imports.PythonResolver.isDir`](map.md#map.python-imports.PythonResolver.isDir). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [map.python-imports.directoriesOf](map.md#map.python-imports.directoriesOf), [map.python-imports.PythonResolver.isDir](map.md#map.python-imports.PythonResolver.isDir)
      - fn [resolve](../../src/python-imports.ts#L31) (fromFile: string, spec: string) → Resolution
        <a id="map.python-imports.PythonResolver.resolve"></a><br>Resolves a Python import specifier to a file: leading dots walk up from the importing file's directory, otherwise each configured root is probed via [`map.python-imports.PythonResolver.moduleFile`](map.md#map.python-imports.PythonResolver.moduleFile) and [`map.python-imports.PythonResolver.isDir`](map.md#map.python-imports.PythonResolver.isDir). The first match is delegated to… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [map.python-imports.PythonResolver.longest](map.md#map.python-imports.PythonResolver.longest), [map.python-imports.PythonResolver.moduleFile](map.md#map.python-imports.PythonResolver.moduleFile), [map.python-imports.PythonResolver.isDir](map.md#map.python-imports.PythonResolver.isDir)
      - fn [longest](../../src/python-imports.ts#L50) (base: string, segments: string[], fromFile: string) → Resolution | null <!-- internal -->
        <a id="map.python-imports.PythonResolver.longest"></a><br>Tries progressively shorter prefixes of the dotted import path under a base directory, asking [`map.python-imports.PythonResolver.moduleFile`](map.md#map.python-imports.PythonResolver.moduleFile) for a matching file. Returns a local resolution if it hits the importing file itself, an internal one otherwise (flagged whole when every… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [map.python-imports.PythonResolver.moduleFile](map.md#map.python-imports.PythonResolver.moduleFile)
      - fn [moduleFile](../../src/python-imports.ts#L62) (path: string) → string | null <!-- internal -->
        <a id="map.python-imports.PythonResolver.moduleFile"></a><br>`a/b.py`, else the package `a/b/__init__.py`; null for neither.
      - fn [isDir](../../src/python-imports.ts#L67) (path: string) → boolean <!-- internal -->
        <a id="map.python-imports.PythonResolver.isDir"></a><br>Reports whether a repo-relative path is a package directory, answering true immediately if it is in the known source set and otherwise checking the filesystem under the root. Used by [`map.python-imports.PythonResolver.resolve`](map.md#map.python-imports.PythonResolver.resolve) to walk candidate module paths. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [directoriesOf](../../src/python-imports.ts#L75) (files: ReadonlySet<string>) → Set<string> <!-- internal -->
      <a id="map.python-imports.directoriesOf"></a><br>Every directory above a file of `files` (POSIX, relative).
  - module [rust-imports](../../src/rust-imports.ts#L1)
    <a id="map.rust-imports"></a><br>Rust path → file. A crate is a directory with `Cargo.toml` and `[package]`; each target — the library (`src/lib.rs` or `[lib] path`), and each binary (`src/main.rs`, `src/bin/*.rs`, `src/bin/*/main.rs`, `[[bin]] path`) — is a module tree of its own rooted at that file…
    - node [external.node](external.md#external.node)
    - smol-toml [external.smol-toml](external.md#external.smol-toml)
    - imports [map.imports](map.md#map.imports)
    - glob [base.glob](base.md#base.glob)
    - type [Crate](../../src/rust-imports.ts#L23) <!-- internal -->
      <a id="map.rust-imports.Crate"></a><br>Describes one Cargo package found while mapping Rust imports: its directory, the underscored name, the library root and binary roots, and a table mapping the identifiers code uses for dependencies to package names. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - module [RustResolver](../../src/rust-imports.ts#L36)
      <a id="map.rust-imports.RustResolver"></a><br>Resolves Rust `use` paths from a file to a crate's module file, an external package, or unresolved, reading Cargo manifests (`crateAt`, `workspaceMembers`) and locating `.rs`/`mod.rs` files via `moduleFile` and `rootOf`. It records read manifests in `inputs` and checks `mod`… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - fn [constructor](../../src/rust-imports.ts#L46) (root: string, sources: ReadonlySet<string> = new Set())
        <a id="map.rust-imports.RustResolver.constructor"></a><br>Stores the repository root and known source set, then builds a name→crate map by reading the root crate via [`map.rust-imports.RustResolver.crateAt`](map.md#map.rust-imports.RustResolver.crateAt) and each directory returned by [`map.rust-imports.RustResolver.workspaceMembers`](map.md#map.rust-imports.RustResolver.workspaceMembers). Crates lacking a name are skipped, and the root… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [map.rust-imports.RustResolver.crateAt](map.md#map.rust-imports.RustResolver.crateAt), [map.rust-imports.RustResolver.workspaceMembers](map.md#map.rust-imports.RustResolver.workspaceMembers)
      - fn [resolve](../../src/rust-imports.ts#L57) (fromFile: string, spec: string) → Resolution
        <a id="map.rust-imports.RustResolver.resolve"></a><br>Turns a `use` path from a Rust file into a resolution: toolchain names and `crate.deps` entries become external packages, `crate`/`self`/`super` and workspace members are anchored via [`map.rust-imports.RustResolver.rootOf`](map.md#map.rust-imports.RustResolver.rootOf) and [`map.rust-imports.modulePath`](map.md#map.rust-imports.modulePath), then the longest… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [map.rust-imports.RustResolver.crateOf](map.md#map.rust-imports.RustResolver.crateOf), [map.rust-imports.RustResolver.rootOf](map.md#map.rust-imports.RustResolver.rootOf), [map.rust-imports.modulePath](map.md#map.rust-imports.modulePath), [map.rust-imports.RustResolver.moduleFile](map.md#map.rust-imports.RustResolver.moduleFile), [map.rust-imports.RustResolver.declares](map.md#map.rust-imports.RustResolver.declares)
      - fn [moduleFile](../../src/rust-imports.ts#L115) (rootFile: string, path: string[]) → string | null <!-- internal -->
        <a id="map.rust-imports.RustResolver.moduleFile"></a><br>The file of a module path under a target root, or null: `a/b.rs`, `a/b/mod.rs`, the root itself for `[]`.
      - fn [rootOf](../../src/rust-imports.ts#L126) (crate: Crate, file: string) → string | null <!-- internal -->
        <a id="map.rust-imports.RustResolver.rootOf"></a><br>The target root whose module tree holds `file`; null for a file outside all of them (`build.rs`).
        - calls [map.rust-imports.modulePath](map.md#map.rust-imports.modulePath), [map.rust-imports.RustResolver.declares](map.md#map.rust-imports.RustResolver.declares)
      - fn [declares](../../src/rust-imports.ts#L152) (file: string, name: string, inline = false) → boolean <!-- internal -->
        <a id="map.rust-imports.RustResolver.declares"></a><br>The file declares `mod <name>` (only an inline `mod <name> { … }` with `inline`). A text scan: the resolver does not parse sources.
      - fn [crateOf](../../src/rust-imports.ts#L164) (file: string) → Crate | null <!-- internal -->
        <a id="map.rust-imports.RustResolver.crateOf"></a><br>Walks up the directory chain from a file's parent to the repository root, returning the first crate [`map.rust-imports.RustResolver.crateAt`](map.md#map.rust-imports.RustResolver.crateAt) reports for a directory, or null if none matches. Used by [`map.rust-imports.RustResolver.resolve`](map.md#map.rust-imports.RustResolver.resolve) to find the crate a source file belongs… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [map.rust-imports.RustResolver.crateAt](map.md#map.rust-imports.RustResolver.crateAt)
      - fn [crateAt](../../src/rust-imports.ts#L173) (dir: string) → Crate | null <!-- internal -->
        <a id="map.rust-imports.RustResolver.crateAt"></a><br>Builds a cached crate record for a directory by parsing its Cargo.toml via [`map.rust-imports.RustResolver.readToml`](map.md#map.rust-imports.RustResolver.readToml): normalized package name, dependency aliases (including target-specific tables), the lib entry path, and discovered binary entry points. Returns null and caches… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
        - calls [map.rust-imports.RustResolver.readToml](map.md#map.rust-imports.RustResolver.readToml), [map.rust-imports.isObject](map.md#map.rust-imports.isObject)
      - fn [workspaceMembers](../../src/rust-imports.ts#L212) () → string[] <!-- internal -->
        <a id="map.rust-imports.RustResolver.workspaceMembers"></a><br>`[workspace] members` of the root manifest, globs expanded one directory level at a time.
        - calls [map.rust-imports.RustResolver.readToml](map.md#map.rust-imports.RustResolver.readToml), [map.rust-imports.isObject](map.md#map.rust-imports.isObject), [base.glob.globToRegExp](base.md#base.glob.globToRegExp), [map.rust-imports.readdirNames](map.md#map.rust-imports.readdirNames)
      - fn [readToml](../../src/rust-imports.ts#L231) (file: string) → Record<string, unknown> | null <!-- internal -->
        <a id="map.rust-imports.RustResolver.readToml"></a><br>Reads a TOML file relative to the resolver root, recording its text (or null if absent) in the inputs map for fingerprinting, and returns the parsed table. Throws with the file name if the TOML is malformed; serves [`map.rust-imports.RustResolver.crateAt`](map.md#map.rust-imports.RustResolver.crateAt) and… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [modulePath](../../src/rust-imports.ts#L248) (rootFile: string, file: string) → string[] <!-- internal -->
      <a id="map.rust-imports.modulePath"></a><br>Module path of a file under a target root: `src/a/b.rs` → `[a, b]`, `src/a/mod.rs` → `[a]`, the root → `[]`.
    - fn [readdirNames](../../src/rust-imports.ts#L256) (abs: string) → string[] <!-- internal -->
      <a id="map.rust-imports.readdirNames"></a><br>Lists the names of the immediate subdirectories of a path, synchronously, excluding files and sorted alphabetically. [`map.rust-imports.RustResolver.workspaceMembers`](map.md#map.rust-imports.RustResolver.workspaceMembers) uses it to expand Cargo workspace member entries. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [isObject](../../src/rust-imports.ts#L260) (value: unknown) → value is Record<string, unknown> <!-- internal -->
      <a id="map.rust-imports.isObject"></a><br>Type guard that returns true only for non-null, non-array object values, narrowing them to a string-keyed record. Used by [`map.rust-imports.RustResolver.crateAt`](map.md#map.rust-imports.RustResolver.crateAt) and [`map.rust-imports.RustResolver.workspaceMembers`](map.md#map.rust-imports.RustResolver.workspaceMembers) to validate parsed Cargo.toml tables before reading fields. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
  - module [snapshot](../../src/snapshot.ts#L1)
    <a id="map.snapshot"></a><br>Analysis snapshot: the versioned fact store written to `.keylang/index.json`. Markdown maps are a projection of the graph; `check` in later tickets reads this file. `generated` is wall-clock metadata and is not part of `snapshotId`.
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - exports [map.exports](map.md#map.exports)
    - brief [base.brief](base.md#base.brief)
    - graph [map.graph](map.md#map.graph)
    - languages [base.languages](base.md#base.languages)
    - scc [check.scc](check.md#check.scc)
    - web-tree-sitter [external.web-tree-sitter](external.md#external.web-tree-sitter)
    - vscode-tree-sitter-wasm [external.vscode-tree-sitter-wasm](external.md#external.vscode-tree-sitter-wasm)
    - type [Resolution](../../src/snapshot.ts#L18) = "resolved" | "ambiguous" | "unresolved"
      <a id="map.snapshot.Resolution"></a><br>A string union naming the three outcomes of resolving a reference in the map snapshot: a single target found, several candidates competing, or no target at all. Used as a tag on snapshot entries to record how each lookup fared. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Provenance](../../src/snapshot.ts#L19) = "syntactic"
      <a id="map.snapshot.Provenance"></a><br>A string literal union with a single member, `"syntactic"`, used by snapshot records to tag how a map entry was derived. It admits no other value, so every provenance is currently marked as syntactic. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [EdgeKind](../../src/snapshot.ts#L20) = "import" | "call" | "type" | "reexport"
      <a id="map.snapshot.EdgeKind"></a><br>Defines the closed set of string tags a snapshot edge can carry: one of four values marking whether the edge records an import, a call, a type reference, or a re-export between two nodes. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [SnapshotEdge](../../src/snapshot.ts#L22)
      <a id="map.snapshot.SnapshotEdge"></a><br>Shape of one reference record in a map snapshot: an `EdgeKind` from `source` to a resolved `target` or `candidates`, with file position, source text, `Resolution` and `Provenance`. Optional fields mark import aliases and hook-mediated calls (`via`, `hook`, `site`, `closure`). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [SnapshotExport](../../src/snapshot.ts#L57)
      <a id="map.snapshot.SnapshotExport"></a><br>Describes one public name a module exports in the snapshot: the node it resolves to through aliases and re-export chains (or null), its kind, and how it is exported (alias, default, re-export from another module, or namespace). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [CoverageItem](../../src/snapshot.ts#L86)
      <a id="map.snapshot.CoverageItem"></a><br>Describes one entry in a coverage report: a source range in a file plus a `kind` (a `Gap` kind, or a skipped/outside file), a human-readable `reason`, and an optional `source` that produced it. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [SnapshotNode](../../src/snapshot.ts#L99)
      <a id="map.snapshot.SnapshotNode"></a><br>Shape of one entry in the serialized map: kind, layer, source span, signature and flags, plus dependency, call, fingerprint and closure fields. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [AnalysisSnapshot](../../src/snapshot.ts#L137)
      <a id="map.snapshot.AnalysisSnapshot"></a><br>Defines the serialized shape of a full analysis run: a schema tag, snapshot id and timestamp, a manifest recording extractor, grammar versions, resolved config and hashed input files, plus the graph's nodes, edges, exports, coverage items and stats. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [sha256](../../src/snapshot.ts#L162) (text: string) → string
      <a id="map.snapshot.sha256"></a><br>Hashes the given text with SHA-256 and returns the hex digest. Used across the codebase as the single content-fingerprinting primitive, e.g. by [`map.snapshot.buildSnapshot`](map.md#map.snapshot.buildSnapshot) and [`operations.operations.hashOrNull`](operations.md#operations.operations.hashOrNull). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [buildSnapshot](../../src/snapshot.ts#L166) ( graph: Graph, config: Config, files: readonly { path: string; sha256: string }[], /** Files (or an unreadable directory) left out; `source`: the ID scope they belong to when no module has the file. */ skipped: readonly { file: string; reason: string; source?: string; kind?: "skipped-file" | "outside-file" }[], ) → AnalysisSnapshot
      <a id="map.snapshot.buildSnapshot"></a><br>Flattens the module graph into sorted node, edge and coverage records, computing a snapshot ID via [`map.snapshot.sha256`](map.md#map.snapshot.sha256) over config, file hashes and resolver inputs. Back-fills dependents and callers, folds gaps and skipped files into coverage, then runs [`map.snapshot.closures`](map.md#map.snapshot.closures). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [map.snapshot.grammarVersions](map.md#map.snapshot.grammarVersions), [map.snapshot.sha256](map.md#map.snapshot.sha256), [map.snapshot.docBrief](map.md#map.snapshot.docBrief), [map.snapshot.closures](map.md#map.snapshot.closures)
    - fn [closures](../../src/snapshot.ts#L376) (nodes: Record<string, SnapshotNode>, coverage: readonly CoverageItem[]) → void <!-- internal -->
      <a id="map.snapshot.closures"></a><br>`closure` of every fn and type, bottom-up over strongly connected components of the call graph: a component hashes its members' own fingerprints with the closures it calls outside itself, so a cycle terminates and every member of it changes together.
      - calls [base.languages.constructorName](base.md#base.languages.constructorName), [check.scc.components](check.md#check.scc.components), [map.snapshot.sha256](map.md#map.snapshot.sha256)
    - fn [docBrief](../../src/snapshot.ts#L419) (doc: string | null | undefined) → string | null <!-- internal -->
      <a id="map.snapshot.docBrief"></a><br>Returns null for an empty, null, or undefined doc string; otherwise hands the text to [`base.brief.briefOf`](base.md#base.brief.briefOf) and returns its result. Used by [`map.snapshot.buildSnapshot`](map.md#map.snapshot.buildSnapshot) to produce short summaries for the snapshot. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [base.brief.briefOf](base.md#base.brief.briefOf)
    - fn [exportRow](../../src/snapshot.ts#L424) (entry: ExportEntry) → SnapshotExport <!-- internal -->
      <a id="map.snapshot.exportRow"></a><br>A row of the graph's export table, with its fields in a fixed order.
    - fn [compareCoverage](../../src/snapshot.ts#L437) (a: CoverageItem, b: CoverageItem) → number <!-- internal -->
      <a id="map.snapshot.compareCoverage"></a><br>Orders two coverage entries for stable sorting: first by file path via [`map.snapshot.cmp`](map.md#map.snapshot.cmp), then numerically by line, then by kind, and finally by reason, returning the first nonzero comparison. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [map.snapshot.cmp](map.md#map.snapshot.cmp)
    - fn [cmp](../../src/snapshot.ts#L441) (a: string, b: string) → number <!-- internal -->
      <a id="map.snapshot.cmp"></a><br>Compares two strings by plain lexical ordering and returns -1, 1, or 0, giving [`map.snapshot.compareCoverage`](map.md#map.snapshot.compareCoverage) a stable tiebreaker when it sorts coverage items. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [grammarVersions](../../src/snapshot.ts#L445) () → Record<string, string>
      <a id="map.snapshot.grammarVersions"></a><br>Reads the installed versions of the two tree-sitter packages from their package.json files via a CommonJS require, substituting "unknown" when a package or its version is missing. [`map.snapshot.buildSnapshot`](map.md#map.snapshot.buildSnapshot) and [`map.map.generateMap`](map.md#map.map.generateMap) use the result so the snapshot identity… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
  - module [trace-plan](../../src/trace-plan.ts#L1)
    <a id="map.trace-plan"></a><br>The functions of one flow that a trace adapter instruments: the flow's `trigger` and `step` IDs that are functions of a fresh snapshot, with the file, position and file hash the snapshot saw. Adapters of languages without Node hooks (Python, Rust) read this plan instead of the…
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - files [lang.files](lang.md#lang.files)
    - map [map.map](map.md#map.map)
    - parser [lang.parser](lang.md#lang.parser)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - explanations [map.explanations](map.md#map.explanations)
    - type [TracePlan](../../src/trace-plan.ts#L16)
      <a id="map.trace-plan.TracePlan"></a><br>Describes the data handed to an editor adapter for one flow: the snapshot it came from and an ID-sorted list of symbols with file, line, column, and the SHA-256 of the file as indexed. The hash lets an adapter skip files that changed since the snapshot. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [tracePlan](../../src/trace-plan.ts#L29) (config: Config, flow: string) → Promise<{ plan: TracePlan; index: AnalysisSnapshot; omitted: string[] }>
      <a id="map.trace-plan.tracePlan"></a><br>The plan of `flow` on a fresh snapshot of the saved code. `omitted` are the flow's `trigger`/`step` IDs that are no function of that snapshot (a module, a type, an unknown ID, a file outside it): no adapter instruments them.
      - calls [map.trace-plan.flowSymbols](map.md#map.trace-plan.flowSymbols), [map.map.generateMap](map.md#map.map.generateMap)
    - fn [tracePlanText](../../src/trace-plan.ts#L49) (plan: TracePlan) → string
      <a id="map.trace-plan.tracePlanText"></a><br>What `keylang trace-plan` prints and an adapter reads: the plan as indented JSON and a newline.
    - fn [flowSymbols](../../src/trace-plan.ts#L54) (root: string, dir: string, flow: string) → Set<string> | null
      <a id="map.trace-plan.flowSymbols"></a><br>`trigger` and `step` IDs of the flow; null when no spec declares it.
      - calls [lang.files.collectMdFiles](lang.md#lang.files.collectMdFiles), [map.explanations.isStoredExplanation](map.md#map.explanations.isStoredExplanation), [lang.spec-ir.compileSpec](lang.md#lang.spec-ir.compileSpec), [lang.parser.parse](lang.md#lang.parser.parse), [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow)
  - module [wire-gen](../../src/wire-gen.ts#L1)
    <a id="map.wire-gen"></a><br>`keylang wire`: `# wiring` + the snapshot → `keylang.gen.ts` (ADR 0003). One memoized builder per factory: a builder awaits its dependencies, then calls the factory (`new` for a class) with them, so every node is built once per `wire()` call, after what it needs, and only when…
    - node [external.node](external.md#external.node)
    - imports [map.imports](map.md#map.imports)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - wiring [check.wiring](check.md#check.wiring)
    - type [WireInput](../../src/wire-gen.ts#L18)
      <a id="map.wire-gen.WireInput"></a><br>Input of `keylang wire`: the repository root, the POSIX output path relative to it (the generated `keylang.gen.ts` wiring code), the `# wiring` entries, and the snapshot that resolves their IDs. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Names](../../src/wire-gen.ts#L27) <!-- internal -->
      <a id="map.wire-gen.Names"></a><br>Local names of one ID in the generated file.
    - fn [generateWire](../../src/wire-gen.ts#L35) (input: WireInput) → string
      <a id="map.wire-gen.generateWire"></a><br>Emits the source of a `wire()` module: sorted imports resolved via [`check.wiring.wireImport`](check.md#check.wiring.wireImport), then memoized async builders in the dependency order from [`check.wiring.wireOrder`](check.md#check.wiring.wireOrder). The generated function tracks `dispose()` methods and releases everything newest first on completion… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [check.wiring.wireOrder](check.md#check.wiring.wireOrder), [map.wire-gen.isClass](map.md#map.wire-gen.isClass), [map.wire-gen.localNames](map.md#map.wire-gen.localNames), [map.wire-gen.importExtension](map.md#map.wire-gen.importExtension), [map.wire-gen.memberAccess](map.md#map.wire-gen.memberAccess), [check.wiring.wireImport](check.md#check.wiring.wireImport), [map.wire-gen.specifier](map.md#map.wire-gen.specifier), [map.wire-gen.key](map.md#map.wire-gen.key), [map.wire-gen.depValue](map.md#map.wire-gen.depValue)
    - fn [depValue](../../src/wire-gen.ts#L136) (d: WireDep, name: (id: string) => Names, callee: (id: string) => string) → string <!-- internal -->
      <a id="map.wire-gen.depValue"></a><br>The value of one dependency: a `when` branch chosen from `env` (else the default), wrapped by `compose` innermost first.
    - fn [memberAccess](../../src/wire-gen.ts#L146) (member: string) → string <!-- internal -->
      <a id="map.wire-gen.memberAccess"></a><br>`.name`, or `["name"]` for a member name that is not an identifier.
    - fn [isClass](../../src/wire-gen.ts#L151) (snapshot: AnalysisSnapshot, id: string) → boolean <!-- internal -->
      <a id="map.wire-gen.isClass"></a><br>A class is a module node with the class marker.
    - fn [localNames](../../src/wire-gen.ts#L162) (ids: readonly string[]) → Map<string, Names> <!-- internal -->
      <a id="map.wire-gen.localNames"></a><br>Identifiers for each ID: the ID with `_` for every character a JS name does not take. IDs that collapse to one name (`a-b.f`, `a_b.f`, `a.b.f`) each get a short hash of the ID, so a name does not change when an unrelated ID comes or goes; the helpers derived from a name are…
      - calls [map.wire-gen.shortHash](map.md#map.wire-gen.shortHash)
    - fn [shortHash](../../src/wire-gen.ts#L182) (text: string) → string <!-- internal -->
      <a id="map.wire-gen.shortHash"></a><br>Computes the SHA-256 digest of the given string and returns its first six hex characters. Used by [`map.wire-gen.localNames`](map.md#map.wire-gen.localNames) to derive short, stable identifiers from node ids. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [key](../../src/wire-gen.ts#L186) (name: string) → string <!-- internal -->
      <a id="map.wire-gen.key"></a><br>Returns the given string unchanged if it is a valid JavaScript identifier, otherwise wraps it as a JSON string literal so it can be safely emitted as an object key in generated wire code by [`map.wire-gen.generateWire`](map.md#map.wire-gen.generateWire). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [importExtension](../../src/wire-gen.ts#L195) (root: string) → "ts" | "js" | "none" <!-- internal -->
      <a id="map.wire-gen.importExtension"></a><br>How the project writes relative imports: `.ts` with `allowImportingTsExtensions` or `rewriteRelativeImportExtensions`, `.js` under `node16`/`nodenext` resolution, no extension otherwise (bundlers). Relative `extends` are followed.
      - calls [map.wire-gen.compilerOptions](map.md#map.wire-gen.compilerOptions)
    - fn [compilerOptions](../../src/wire-gen.ts#L203) (file: string, depth: number) → Record<string, unknown> <!-- internal -->
      <a id="map.wire-gen.compilerOptions"></a><br>`compilerOptions` of a tsconfig over those of its relative `extends`; package configs are not read.
      - calls [map.imports.readJsonc](map.md#map.imports.readJsonc)
    - fn [specifier](../../src/wire-gen.ts#L218) (out: string, file: string, ext: "ts" | "js" | "none") → string <!-- internal -->
      <a id="map.wire-gen.specifier"></a><br>Builds a relative import path from the output file to `file`, forcing a `./` prefix, then rewrites its extension per the `ext` mode: kept for `ts`, mapped through `RUNTIME_EXTENSION` for `js`, or stripped for TS/JS sources under `none`. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
