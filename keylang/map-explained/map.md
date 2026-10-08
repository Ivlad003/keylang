<!-- keylang:generated — не редагувати, `keylang map` -->

[README](README.md) · modules: [analyze](#map.analyze) · [c4-export](#map.c4-export) · [declared-packages](#map.declared-packages) · [diagram](#map.diagram) · [emit](#map.emit) · [entries](#map.entries) · [exact-path](#map.exact-path) · [explanations](#map.explanations) · [exports](#map.exports) · [fact-cache](#map.fact-cache) · [framework-entries](#map.framework-entries) · [frontends](#map.frontends) · [graph](#map.graph) · [imports](#map.imports) · [map](#map.map) · [php-imports](#map.php-imports) · [python-imports](#map.python-imports) · [python-stdlib](#map.python-stdlib) · [rust-imports](#map.rust-imports) · [snapshot](#map.snapshot) · [trace-plan](#map.trace-plan) · [wire-gen](#map.wire-gen)

# map

- map
  <a id="map"></a><br>Turns source files into language-agnostic facts and a dependency graph via per-language import resolvers ([`map.frontends`](map.md#map.frontends)), then writes the snapshot ([`map.snapshot`](map.md#map.snapshot)), generated maps ([`map.emit`](map.md#map.emit)) and C4 or wiring outputs. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
  - module [analyze](../../src/analyze.ts#L1)
    <a id="map.analyze"></a><br>One analysis for the CLI and the language server: config, a fresh snapshot, spec documents, and their assessment. Generated map files are replaced by the map rendered from the fresh snapshot, so IDs resolve against current code, not a stale committed map.
    - node [external.node](external.md#external.node)
    - assess [check.assess](check.md#check.assess)
    - config [base.config](base.md#base.config)
    - declared-packages [map.declared-packages](map.md#map.declared-packages)
    - span [base.span](base.md#base.span)
    - files [lang.files](lang.md#lang.files)
    - ir [lang.ir](lang.md#lang.ir)
    - fact-cache [map.fact-cache](map.md#map.fact-cache)
    - map [map.map](map.md#map.map)
    - parser [lang.parser](lang.md#lang.parser)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - test-report [check.test-report](check.md#check.test-report)
    - trace-evidence [check.trace-evidence](check.md#check.trace-evidence)
    - type [AnalysisRequest](../../src/analyze.ts#L22)
      <a id="map.analyze.AnalysisRequest"></a><br>Options for one analysis run: an absolute repository root, optional spec paths and unsaved buffer overlays, flags to skip code or evidence and to persist or save the fact cache, plus a pluggable snapshot generator and static-mode override. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
    - type [Analysis](../../src/analyze.ts#L49) extends Assessment
      <a id="map.analyze.Analysis"></a><br>Result record of analyzing a repository: bundles the resolved config, an optional map and snapshot, parsed spec documents, request paths that held no specs, and the declared packages sorted by id. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [analyze](../../src/analyze.ts#L63) (request: AnalysisRequest) → Promise<Analysis>
      <a id="map.analyze.analyze"></a><br>Generates the code map via [`map.map.generateMap`](map.md#map.map.generateMap), parses spec Markdown plus rendered map files, and runs [`check.assess.assess`](check.md#check.assess.assess) with test and trace evidence, returning the result with config, map and docs. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
      - calls [base.config.loadConfig](base.md#base.config.loadConfig), [base.config.toPosix](base.md#base.config.toPosix), [map.fact-cache.keepsFactCache](map.md#map.fact-cache.keepsFactCache), [map.map.generateMap](map.md#map.map.generateMap), [map.fact-cache.saveFactCache](map.md#map.fact-cache.saveFactCache), [map.analyze.readingAid](map.md#map.analyze.readingAid), [lang.files.collectMdFiles](lang.md#lang.files.collectMdFiles), [lang.files.walkReaches](lang.md#lang.files.walkReaches), [lang.parser.parse](lang.md#lang.parser.parse), [map.analyze.within](map.md#map.analyze.within), [map.analyze.parseRenderedMap](map.md#map.analyze.parseRenderedMap), [base.span.compareText](base.md#base.span.compareText), [base.config.evidenceFiles](base.md#base.config.evidenceFiles), [base.config.resolveStatic](base.md#base.config.resolveStatic), [map.declared-packages.readManifests](map.md#map.declared-packages.readManifests), [check.assess.assess](check.md#check.assess.assess), [check.test-report.loadReports](check.md#check.test-report.loadReports), [check.trace-evidence.loadTraces](check.md#check.trace-evidence.loadTraces), [map.analyze.repositoryFile](map.md#map.analyze.repositoryFile)
    - fn [parseRenderedMap](../../src/analyze.ts#L133) (path: string, text: string) → Document <!-- internal -->
      <a id="map.analyze.parseRenderedMap"></a>
      - calls [lang.parser.parse](lang.md#lang.parser.parse)
    - fn [findRoot](../../src/analyze.ts#L143) (start: string) → string
      <a id="map.analyze.findRoot"></a><br>Walk up from `start` to the directory that holds `keylang.json`; `start` when there is none.
    - fn [repositoryFile](../../src/analyze.ts#L154) (root: string, path: string) → boolean <!-- internal -->
      <a id="map.analyze.repositoryFile"></a><br>`path` (relative to the root, as a flow's `test` writes it) is a file inside the repository.
      - calls [map.analyze.within](map.md#map.analyze.within)
    - fn [readingAid](../../src/analyze.ts#L165) (specDir: string, abs: string) → boolean <!-- internal -->
      <a id="map.analyze.readingAid"></a><br>A generated reading aid beside the specs (the explained map, explanations, discovered flows): never a spec.
      - calls [map.analyze.within](map.md#map.analyze.within)
    - fn [specPathProblem](../../src/analyze.ts#L174) (config: Config, abs: string) → string | null
      <a id="map.analyze.specPathProblem"></a><br>Why `check` does not read `abs` as a spec, or null when it does: a `.md` file the walk of the spec directory reaches (no hidden directory, `node_modules` or `target` on the way) outside the reading aids.
      - calls [map.analyze.within](map.md#map.analyze.within), [lang.files.walkReaches](lang.md#lang.files.walkReaches), [map.analyze.readingAid](map.md#map.analyze.readingAid)
    - fn [within](../../src/analyze.ts#L185) (abs: string, dir: string) → boolean
      <a id="map.analyze.within"></a><br>Reports whether an absolute path lies inside a directory by taking the relative path and rejecting results that climb out via `..` or resolve to a different root. Used as the boundary check by callers like [`map.analyze.repositoryFile`](map.md#map.analyze.repositoryFile) and [`tui.disk.leavesBoundary`](tui.md#tui.disk.leavesBoundary). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
  - module [c4-export](../../src/c4-export.ts#L1)
    <a id="map.c4-export"></a><br>C4 diagrams of the snapshot (.scratch/c4-zoom/issues/12): a view of the map for the tools that draw C4 (ADR 0014), in C4-PlantUML or Mermaid. A layer is a boundary, not a container: in C4 a container is an application or a store that runs on its own, and a layer of one program…
    - explanations [map.explanations](map.md#map.explanations)
    - graph [map.graph](map.md#map.graph)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - span [base.span](base.md#base.span)
    - type [C4Format](../../src/c4-export.ts#L14) = (typeof C4_FORMATS)[number]
      <a id="map.c4-export.C4Format"></a>
    - type [C4Level](../../src/c4-export.ts#L16) = (typeof C4_LEVELS)[number]
      <a id="map.c4-export.C4Level"></a>
    - type [C4Request](../../src/c4-export.ts#L18)
      <a id="map.c4-export.C4Request"></a>
    - fn [c4Marker](../../src/c4-export.ts#L29) (format: C4Format) → string
      <a id="map.c4-export.c4Marker"></a><br>The first line of a written diagram: `export c4 --out` replaces only a file that starts with it.
    - fn [isC4Diagram](../../src/c4-export.ts#L34) (text: string) → boolean
      <a id="map.c4-export.isC4Diagram"></a><br>The text is a diagram `export c4` wrote: its first non-empty line is the marker of either format.
      - calls [map.c4-export.c4Marker](map.md#map.c4-export.c4Marker)
    - fn [quoted](../../src/c4-export.ts#L40) (text: string) → string <!-- internal -->
      <a id="map.c4-export.quoted"></a><br>Text in the double quotes of a C4 macro: one line, its double quotes made single.
    - fn [aliases](../../src/c4-export.ts#L45) () → (id: string) => string <!-- internal -->
      <a id="map.c4-export.aliases"></a><br>Aliases a diagram can use for IDs: letters, digits and `_`, distinct even where two IDs map to one.
    - type [Rel](../../src/c4-export.ts#L61) <!-- internal -->
      <a id="map.c4-export.Rel"></a><br>Edges between two drawn units, by kind.
    - fn [relLabel](../../src/c4-export.ts#L68) (rel: Rel) → string <!-- internal -->
      <a id="map.c4-export.relLabel"></a><br>`call ×3, import ×1`: the kinds of the edges a relation sums up, by name.
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [renderC4](../../src/c4-export.ts#L88) (snapshot: AnalysisSnapshot, brief: (id: string) => string | null, request: C4Request) → string
      <a id="map.c4-export.renderC4"></a><br>The diagram of `request` over the snapshot. `brief` gives the text of a node, a layer or the repository (`@system`), or null without one. Throws on a layer the snapshot does not have, naming the layers it has.
      - calls [map.c4-export.aliases](map.md#map.c4-export.aliases), [base.span.compareText](base.md#base.span.compareText), [map.c4-export.c4Marker](map.md#map.c4-export.c4Marker), [map.c4-export.quoted](map.md#map.c4-export.quoted), [map.c4-export.relLabel](map.md#map.c4-export.relLabel)
  - module [declared-packages](../../src/declared-packages.ts#L1)
    <a id="map.declared-packages"></a><br>Packages a repository declares, with their original names and version ranges. A rule or a flow may name one (`external.<segment>`) before any file imports it.
    - node [external.node](external.md#external.node)
    - smol-toml [external.smol-toml](external.md#external.smol-toml)
    - config [base.config](base.md#base.config)
    - external-ids [base.external-ids](base.md#base.external-ids)
    - glob [base.glob](base.md#base.glob)
    - imports [map.imports](map.md#map.imports)
    - span [base.span](base.md#base.span)
    - type [DependencyField](../../src/declared-packages.ts#L34)
      <a id="map.declared-packages.DependencyField"></a><br>A manifest field a package is declared in.
    - type [Declaration](../../src/declared-packages.ts#L43)
      <a id="map.declared-packages.Declaration"></a><br>Where one package is declared, and its version range as written (null when the manifest gives none).
    - type [DeclaredPackage](../../src/declared-packages.ts#L51)
      <a id="map.declared-packages.DeclaredPackage"></a><br>A package a repository declares, with its `external.<segment>` id.
    - type [Add](../../src/declared-packages.ts#L63) <!-- internal -->
      <a id="map.declared-packages.Add"></a><br>Function type for a callback that records one declared dependency: the package name, the manifest file it came from, which dependency field listed it, and its version range (or null when none is given). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [readManifests](../../src/declared-packages.ts#L72) (config: Config, files: readonly string[], known: ReadonlyMap<string, string | null> = new Map()) → { packages: DeclaredPackage[]; inputs: Map<string, string | null> }
      <a id="map.declared-packages.readManifests"></a><br>The packages declared by the manifests at the root and on the ancestors of `files` (root-relative), sorted by id; their ids cover only these names. `known` holds files a resolver already read (text, or null for absent), so a manifest is parsed from the same text that went into…
      - calls [map.declared-packages.readInput](map.md#map.declared-packages.readInput), [map.declared-packages.cargoWorkspaces](map.md#map.declared-packages.cargoWorkspaces), [map.declared-packages.typesTarget](map.md#map.declared-packages.typesTarget), [base.span.compareText](base.md#base.span.compareText), [map.declared-packages.manifestDirs](map.md#map.declared-packages.manifestDirs), [base.config.isAnalysed](base.md#base.config.isAnalysed), [map.declared-packages.addPackages](map.md#map.declared-packages.addPackages), [map.declared-packages.addCrates](map.md#map.declared-packages.addCrates), [map.declared-packages.addComposer](map.md#map.declared-packages.addComposer), [map.imports.listWorkspaceGlob](map.md#map.imports.listWorkspaceGlob), [map.declared-packages.workspaceNames](map.md#map.declared-packages.workspaceNames), [map.declared-packages.composerPathNames](map.md#map.declared-packages.composerPathNames), [map.declared-packages.linkedPackages](map.md#map.declared-packages.linkedPackages), [base.external-ids.assignExternalIds](base.md#base.external-ids.assignExternalIds), [map.declared-packages.ecosystemOf](map.md#map.declared-packages.ecosystemOf)
    - fn [ecosystemOf](../../src/declared-packages.ts#L130) (declarations: readonly Declaration[]) → DeclaredPackage["ecosystem"] <!-- internal -->
      <a id="map.declared-packages.ecosystemOf"></a><br>npm when a `package.json` declares the package, else composer for a `composer.json`, else Cargo.
    - fn [manifestDirs](../../src/declared-packages.ts#L136) (files: readonly string[]) → Set<string> <!-- internal -->
      <a id="map.declared-packages.manifestDirs"></a><br>The root (`""`) and every directory between a file and the root.
      - calls [base.config.toPosix](base.md#base.config.toPosix)
    - fn [typesTarget](../../src/declared-packages.ts#L148) (name: string) → string <!-- internal -->
      <a id="map.declared-packages.typesTarget"></a><br>`@types/x` → `x`, `@types/scope__pkg` → `@scope/pkg`; any other name is itself.
    - fn [workspaceNames](../../src/declared-packages.ts#L162) (read: (rel: string) => string | null, list: (rel: string) => string | null) → Set<string> <!-- internal -->
      <a id="map.declared-packages.workspaceNames"></a><br>Names of the packages in the directories the root `workspaces` or the `packages` of `pnpm-workspace.yaml` name (`packages/*`, `apps/web`), read as the import resolver reads them: the same input keys and texts, and a member manifest that does not parse names none. Any glob…
      - calls [map.imports.parseJsonc](map.md#map.imports.parseJsonc), [map.declared-packages.isRecord](map.md#map.declared-packages.isRecord), [map.imports.pnpmWorkspacePackages](map.md#map.imports.pnpmWorkspacePackages), [map.declared-packages.workspaceDirs](map.md#map.declared-packages.workspaceDirs), [map.imports.withoutNegated](map.md#map.imports.withoutNegated)
    - fn [linkedPackages](../../src/declared-packages.ts#L184) (root: string, declared: ReadonlyMap<string, readonly Declaration[]>, inputs: Map<string, string | null>) → Set<string> <!-- internal -->
      <a id="map.declared-packages.linkedPackages"></a><br>npm packages a declaring manifest's directory, or one above it, has in `node_modules` as a link into the repository (`npm link`, a workspace, pnpm next to the package): the resolver reads such an entry as a workspace package. Each entry looked at is an input, keyed as the…
      - calls [map.imports.inside](map.md#map.imports.inside)
    - fn [cargoWorkspaces](../../src/declared-packages.ts#L214) (read: (rel: string) => string | null) → { local(dir: string, key: string, dep: unknown): boolean; memberNames(crateDirs: readonly string[], list: (rel: string) => string | null): Set<string>; } <!-- internal -->
      <a id="map.declared-packages.cargoWorkspaces"></a><br>Cargo workspaces as `src/rust-imports.ts` reads them: the nearest `Cargo.toml` with `[workspace]` from a crate's directory up to the root. A dependency is local when its `path`, or the `path` of the `[workspace.dependencies]` entry it inherits (`workspace = true`), stays inside…
      - calls [base.config.withoutBom](base.md#base.config.withoutBom), [map.declared-packages.isRecord](map.md#map.declared-packages.isRecord), [base.config.toPosix](base.md#base.config.toPosix), [map.declared-packages.cargoMemberDirs](map.md#map.declared-packages.cargoMemberDirs)
    - fn [cargoMemberDirs](../../src/declared-packages.ts#L275) (workspace: string, member: string, list: (rel: string) => string | null) → string[] <!-- internal -->
      <a id="map.declared-packages.cargoMemberDirs"></a><br>Directories one `[workspace] members` entry names, root-relative; a glob in the last segment is expanded, as the resolver does.
      - calls [base.config.toPosix](base.md#base.config.toPosix), [base.glob.globToRegExp](base.md#base.glob.globToRegExp)
    - fn [composerPathNames](../../src/declared-packages.ts#L290) (read: (rel: string) => string | null, list: (rel: string) => string | null) → Set<string> <!-- internal -->
      <a id="map.declared-packages.composerPathNames"></a><br>Names of the packages in the root `composer.json`'s `path` repositories (`packages/*`, `modules/billing`): this repository's code, not external.
      - calls [base.config.withoutBom](base.md#base.config.withoutBom), [map.declared-packages.isRecord](map.md#map.declared-packages.isRecord), [map.declared-packages.workspaceDirs](map.md#map.declared-packages.workspaceDirs)
    - fn [workspaceDirs](../../src/declared-packages.ts#L316) (pattern: string, list: (rel: string) => string | null) → string[] <!-- internal -->
      <a id="map.declared-packages.workspaceDirs"></a><br>Directories one `workspaces` entry names, through the same listing as `src/imports.ts` (`listWorkspaceGlob`).
      - calls [map.imports.workspaceGlob](map.md#map.imports.workspaceGlob), [map.imports.isGlob](map.md#map.imports.isGlob)
    - fn [readInput](../../src/declared-packages.ts#L325) (abs: string, rel: string) → string | null <!-- internal -->
      <a id="map.declared-packages.readInput"></a><br>A file's text, null when there is none.
      - calls [map.declared-packages.isFile](map.md#map.declared-packages.isFile), [map.declared-packages.readText](map.md#map.declared-packages.readText)
    - fn [isFile](../../src/declared-packages.ts#L329) (abs: string) → boolean <!-- internal -->
      <a id="map.declared-packages.isFile"></a><br>Checks whether an absolute path points to an existing regular file via a synchronous stat, returning false instead of throwing on any error. Used by [`map.declared-packages.readInput`](map.md#map.declared-packages.readInput) to decide whether a candidate input file should be read. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [readText](../../src/declared-packages.ts#L342) (path: string, rel: string) → string <!-- internal -->
      <a id="map.declared-packages.readText"></a><br>The file is there but cannot be read. That is not the same error as invalid contents.
      - calls [base.config.withoutBom](base.md#base.config.withoutBom)
    - fn [isRecord](../../src/declared-packages.ts#L351) (value: unknown) → value is Record<string, unknown> <!-- internal -->
      <a id="map.declared-packages.isRecord"></a><br>Type guard that returns true only for non-null objects that are not arrays, narrowing the value to a string-keyed record. Used by [`map.declared-packages.table`](map.md#map.declared-packages.table) and the package/crate readers to check parsed manifest shapes before indexing fields. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [table](../../src/declared-packages.ts#L355) (rel: string, field: string, value: unknown, kind: "object" | "table") → Record<string, unknown> | undefined <!-- internal -->
      <a id="map.declared-packages.table"></a><br>Validates an optional manifest field: returns `undefined` when absent, passes the value through when [`map.declared-packages.isRecord`](map.md#map.declared-packages.isRecord) accepts it, and otherwise throws an error naming the file, field, and expected shape. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [map.declared-packages.isRecord](map.md#map.declared-packages.isRecord)
    - fn [addPackages](../../src/declared-packages.ts#L362) (rel: string, text: string, add: Add) → void <!-- internal -->
      <a id="map.declared-packages.addPackages"></a><br>`dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`. Not `node_modules`.
      - calls [map.imports.parseJsoncStrict](map.md#map.imports.parseJsoncStrict), [map.declared-packages.isRecord](map.md#map.declared-packages.isRecord), [map.declared-packages.table](map.md#map.declared-packages.table)
    - fn [addCrates](../../src/declared-packages.ts#L378) (rel: string, text: string, add: Add, local: (key: string, dep: unknown) => boolean) → void <!-- internal -->
      <a id="map.declared-packages.addCrates"></a><br>`[dependencies]`, `[dev-dependencies]`, `[build-dependencies]`, and the same under `[target.*]`; `local` ones are left out.
      - calls [base.config.withoutBom](base.md#base.config.withoutBom), [map.declared-packages.isRecord](map.md#map.declared-packages.isRecord), [map.declared-packages.table](map.md#map.declared-packages.table), [map.declared-packages.crateTables](map.md#map.declared-packages.crateTables)
    - fn [addComposer](../../src/declared-packages.ts#L405) (rel: string, text: string, add: Add) → void <!-- internal -->
      <a id="map.declared-packages.addComposer"></a><br>`require` and `require-dev` of a `composer.json`, without PHP and its extensions.
      - calls [base.config.withoutBom](base.md#base.config.withoutBom), [map.declared-packages.isRecord](map.md#map.declared-packages.isRecord), [map.declared-packages.table](map.md#map.declared-packages.table)
    - fn [crateTables](../../src/declared-packages.ts#L420) (rel: string, source: Record<string, unknown>, prefix: string) → [DependencyField, Record<string, unknown>][] <!-- internal -->
      <a id="map.declared-packages.crateTables"></a><br>Walks the fixed list of Cargo dependency section keys, running each present entry in a manifest object through [`map.declared-packages.table`](map.md#map.declared-packages.table) with a prefixed field path for validation. Returns the pairs of section key and name map that validated, skipping absent or invalid ones. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [map.declared-packages.table](map.md#map.declared-packages.table)
  - module [diagram](../../src/diagram.ts#L1)
    <a id="map.diagram"></a><br>Diagrams of the model (business-flows/20, ADR 0014): a flow as BPMN-like shapes, an entry point's call tree, the layers and their rules. A view is a pure function of the snapshot, the SpecIR and the check results — no model, no file — so the same inputs give the same JSON.
    - external-ids [base.external-ids](base.md#base.external-ids)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - span [base.span](base.md#base.span)
    - type [DiagramView](../../src/diagram.ts#L17)
      <a id="map.diagram.DiagramView"></a>
    - type [DiagramVerdict](../../src/diagram.ts#L24) = "ok" | "fail" | "unverified" | "planned" | null
      <a id="map.diagram.DiagramVerdict"></a>
    - type [DiagramNode](../../src/diagram.ts#L26)
      <a id="map.diagram.DiagramNode"></a>
    - type [DiagramEdge](../../src/diagram.ts#L43)
      <a id="map.diagram.DiagramEdge"></a>
    - type [DiagramGroup](../../src/diagram.ts#L52)
      <a id="map.diagram.DiagramGroup"></a><br>A lane: one layer, a band across the diagram.
    - type [Diagram](../../src/diagram.ts#L62)
      <a id="map.diagram.Diagram"></a>
    - type [DiagramResult](../../src/diagram.ts#L71)
      <a id="map.diagram.DiagramResult"></a><br>What a diagram reads of a check result: `CheckResult` and `Verdict` both fit.
    - type [DiagramInput](../../src/diagram.ts#L82)
      <a id="map.diagram.DiagramInput"></a>
    - type [DiagramProcess](../../src/diagram.ts#L95)
      <a id="map.diagram.DiagramProcess"></a><br>A business process as a model grouped it (business-flows/12): its domain and its discovered flows, each with its trigger and the steps right under it.
    - type [Positions](../../src/diagram.ts#L102)
      <a id="map.diagram.Positions"></a><br>Positions that win over the automatic layout, by node id.
    - fn [parseView](../../src/diagram.ts#L112) (query: URLSearchParams) → DiagramView | string
      <a id="map.diagram.parseView"></a><br>A view from the query of `GET /api/diagram`, or why it names none.
    - fn [viewsOf](../../src/diagram.ts#L148) ( snapshot: AnalysisSnapshot | null, spec: SpecIR, processes: readonly DiagramProcess[] = [], ) → { flows: string[]; entries: { id: string; kind: string; label: string }[]; layers: string[]; domains: string[]; processes: { name: string; domain: string; flows: string[] }[] }
      <a id="map.diagram.viewsOf"></a><br>What there is to draw: flow names in spec order, entry points as the snapshot lists them, layers in their order, the domains of the business processes (first seen first) and the processes with their flows.
      - calls [map.diagram.layerOrder](map.md#map.diagram.layerOrder)
    - type [FlowListing](../../src/diagram.ts#L163)
      <a id="map.diagram.FlowListing"></a><br>A flow as the diagram page lists it: where it is, its trigger and lane, and every ID it names (for the search).
    - fn [flowIds](../../src/diagram.ts#L173) (flow: Flow) → string[]
      <a id="map.diagram.flowIds"></a><br>The IDs a flow names — triggers, steps, `then <id>`, `calls` — in source order, each once.
      - calls [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow)
    - fn [flowListing](../../src/diagram.ts#L183) (snapshot: AnalysisSnapshot | null, spec: SpecIR) → FlowListing[]
      <a id="map.diagram.flowListing"></a><br>The flows of a spec for the list of the diagram page: the first flow of each name, in spec order.
      - calls [map.diagram.layerOf](map.md#map.diagram.layerOf), [map.diagram.flowIds](map.md#map.diagram.flowIds)
    - type [Usages](../../src/diagram.ts#L196)
      <a id="map.diagram.Usages"></a><br>Where an ID is used: flows and discovered flows that name it (or an ID under it), and entry points whose route does.
    - fn [covers](../../src/diagram.ts#L204) (id: string, target: string) → boolean <!-- internal -->
      <a id="map.diagram.covers"></a><br>An ID or one under it: `a.b` matches `a.b` and `a.b.c`, not `a.bc`.
    - fn [useIn](../../src/diagram.ts#L209) (flow: Flow, id: string) → number | null <!-- internal -->
      <a id="map.diagram.useIn"></a><br>The first line of a flow that names the ID, or null.
      - calls [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow), [map.diagram.covers](map.md#map.diagram.covers)
    - fn [usagesOf](../../src/diagram.ts#L225) (snapshot: AnalysisSnapshot | null, spec: SpecIR, discovered: SpecIR | null, id: string) → Usages
      <a id="map.diagram.usagesOf"></a><br>Where `id` is used (business-flows/21): the flows of the specs and of the discovered view that name it in a trigger, step, `then` or `calls`, and the entry points that are it or whose flow (written or discovered, by trigger) names it. Pure; each list in its source's order.
      - calls [map.diagram.useIn](map.md#map.diagram.useIn), [map.diagram.covers](map.md#map.diagram.covers)
    - fn [diagramOf](../../src/diagram.ts#L243) (input: DiagramInput) → Diagram
      <a id="map.diagram.diagramOf"></a>
      - calls [map.diagram.layout](map.md#map.diagram.layout), [map.diagram.flowDiagram](map.md#map.diagram.flowDiagram), [map.diagram.empty](map.md#map.diagram.empty), [map.diagram.processDiagram](map.md#map.diagram.processDiagram), [map.diagram.entryDiagram](map.md#map.diagram.entryDiagram), [map.diagram.layersDiagram](map.md#map.diagram.layersDiagram)
    - fn [empty](../../src/diagram.ts#L253) (reason: string) → Diagram <!-- internal -->
      <a id="map.diagram.empty"></a>
    - fn [worst](../../src/diagram.ts#L261) (values: readonly string[]) → DiagramVerdict <!-- internal -->
      <a id="map.diagram.worst"></a>
    - fn [messageOf](../../src/diagram.ts#L267) (result: DiagramResult) → string <!-- internal -->
      <a id="map.diagram.messageOf"></a>
    - fn [byLine](../../src/diagram.ts#L272) (results: readonly DiagramResult[]) → Map<string, DiagramResult[]> <!-- internal -->
      <a id="map.diagram.byLine"></a><br>Results by `file:line`.
    - fn [byArea](../../src/diagram.ts#L284) (results: readonly DiagramResult[]) → Map<string, DiagramVerdict> <!-- internal -->
      <a id="map.diagram.byArea"></a><br>The worst verdict about each ID and every ID above it (`a.b.c` counts for `a.b` and `a`).
      - calls [map.diagram.worst](map.md#map.diagram.worst)
    - fn [layerOrder](../../src/diagram.ts#L300) (snapshot: AnalysisSnapshot) → string[] <!-- internal -->
      <a id="map.diagram.layerOrder"></a><br>The repository's layers in `keylang.json` order, then the others (packages last).
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [layerOf](../../src/diagram.ts#L309) (snapshot: AnalysisSnapshot | null, id: string) → string | undefined <!-- internal -->
      <a id="map.diagram.layerOf"></a>
    - fn [lanes](../../src/diagram.ts#L317) (snapshot: AnalysisSnapshot | null, nodes: readonly DiagramNode[]) → DiagramGroup[] <!-- internal -->
      <a id="map.diagram.lanes"></a><br>One lane per layer some node sits in, in the layers' order; sized by `layout`.
      - calls [map.diagram.layerOrder](map.md#map.diagram.layerOrder), [base.span.compareText](base.md#base.span.compareText)
    - fn [flowDiagram](../../src/diagram.ts#L326) (input: DiagramInput, name: string) → Diagram <!-- internal -->
      <a id="map.diagram.flowDiagram"></a>
      - calls [map.diagram.empty](map.md#map.diagram.empty), [map.diagram.byLine](map.md#map.diagram.byLine), [map.diagram.worst](map.md#map.diagram.worst), [map.diagram.layerOf](map.md#map.diagram.layerOf), [map.diagram.stripLead](map.md#map.diagram.stripLead), [map.diagram.messageOf](map.md#map.diagram.messageOf), [map.diagram.lanes](map.md#map.diagram.lanes)
    - fn [stripLead](../../src/diagram.ts#L464) (message: string, id: string) → string <!-- internal -->
      <a id="map.diagram.stripLead"></a><br>`check`'s message without its `unverified <id>: ` lead.
    - fn [entryDiagram](../../src/diagram.ts#L471) (snapshot: AnalysisSnapshot, results: readonly DiagramResult[], id: string, depth: number) → Diagram <!-- internal -->
      <a id="map.diagram.entryDiagram"></a>
      - calls [map.diagram.empty](map.md#map.diagram.empty), [map.diagram.byArea](map.md#map.diagram.byArea), [map.diagram.lanes](map.md#map.diagram.lanes)
    - fn [processDiagram](../../src/diagram.ts#L572) (snapshot: AnalysisSnapshot, processes: readonly DiagramProcess[], results: readonly DiagramResult[], domain: string) → Diagram <!-- internal -->
      <a id="map.diagram.processDiagram"></a><br>The processes of a domain (or the one process of that name): lanes per layer, one start per flow of each process (its trigger), and the steps right under it as tasks. A step two flows share is drawn once.
      - calls [map.diagram.empty](map.md#map.diagram.empty), [map.diagram.byArea](map.md#map.diagram.byArea), [map.diagram.layerOf](map.md#map.diagram.layerOf), [map.diagram.lanes](map.md#map.diagram.lanes)
    - fn [layersDiagram](../../src/diagram.ts#L607) (snapshot: AnalysisSnapshot, spec: SpecIR, results: readonly DiagramResult[]) → Diagram <!-- internal -->
      <a id="map.diagram.layersDiagram"></a>
      - calls [map.diagram.layerOrder](map.md#map.diagram.layerOrder), [map.diagram.byArea](map.md#map.diagram.byArea), [map.diagram.layerOf](map.md#map.diagram.layerOf), [map.diagram.worst](map.md#map.diagram.worst)
    - fn [layout](../../src/diagram.ts#L668) (diagram: Diagram, positions: Positions = {}) → Diagram
      <a id="map.diagram.layout"></a><br>Places the shapes: the rank of a node is its longest path from a node without predecessors (back edges of a cycle ignored), its column; within a lane and a rank, nodes go by spec line, then by their order in the diagram. Lanes are horizontal bands as tall as their fullest rank.…
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
      <a id="map.emit.renderLayers"></a><br>Builds one markdown file per layer from [`map.emit.layerIds`](map.md#map.emit.layerIds), each with a generated marker, optional contents from [`map.emit.contents`](map.md#map.emit.contents), the layer's description, and its sorted child modules rendered via [`map.emit.renderModule`](map.md#map.emit.renderModule). _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
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
      <a id="map.emit.renderReadme"></a><br>Builds the map's top-level README: system section via [`map.emit.systemSection`](map.md#map.emit.systemSection), a per-layer table counting nodes by brief source (code doc, LLM, stale, none) with totals, and a name index from [`map.emit.index`](map.md#map.emit.index). _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [map.emit.layerIds](map.md#map.emit.layerIds), [map.emit.descriptionText](map.md#map.emit.descriptionText), [map.emit.ref](map.md#map.emit.ref), [map.emit.systemSection](map.md#map.emit.systemSection), [map.emit.index](map.md#map.emit.index)
    - fn [systemSection](../../src/emit.ts#L209) (r: Render) → string[] <!-- internal -->
      <a id="map.emit.systemSection"></a><br>The start of the start page: what the repository is (the system level of C4), under its manifest name. The words come from the README or a manifest, named after them, else from a model's brief with its origin; without either, a dash and how to ask for a brief.
      - calls [map.emit.descriptionText](map.md#map.emit.descriptionText), [map.emit.ref](map.md#map.emit.ref)
    - fn [index](../../src/emit.ts#L218) (r: Render) → string[] <!-- internal -->
      <a id="map.emit.index"></a><br>One paragraph per first letter: every module and class of the repository (packages left out), by name.
      - calls [map.emit.nameOf](map.md#map.emit.nameOf), [base.span.compareText](base.md#base.span.compareText), [map.emit.anchorOf](map.md#map.emit.anchorOf)
    - fn [childrenByParent](../../src/emit.ts#L237) (snapshot: AnalysisSnapshot) → Map<string, string[]> <!-- internal -->
      <a id="map.emit.childrenByParent"></a><br>Groups node IDs from `snapshot.nodes` under their parent by splitting each dotted ID at its last dot, skipping IDs without a dot. Used by [`map.emit.renderMap`](map.md#map.emit.renderMap) and [`map.emit.renderExplainedMap`](map.md#map.emit.renderExplainedMap) to build the tree. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [sortIds](../../src/emit.ts#L255) (snapshot: AnalysisSnapshot, ids: readonly string[]) → string[] <!-- internal -->
      <a id="map.emit.sortIds"></a><br>Children by file (a directory module by its name), then by line. Code-unit order, as the index and the snapshot sort: ICU collation differs between Node builds, and the map's bytes must not.
      - calls [map.emit.nameOf](map.md#map.emit.nameOf), [base.span.compareText](base.md#base.span.compareText)
    - fn [nameOf](../../src/emit.ts#L265) (id: string) → string <!-- internal -->
      <a id="map.emit.nameOf"></a><br>Returns the substring after the last dot in a dotted node ID, giving the bare local name (or the whole string if there is no dot). Used by [`map.emit.renderDecl`](map.md#map.emit.renderDecl), [`map.emit.renderModule`](map.md#map.emit.renderModule), [`map.emit.sortIds`](map.md#map.emit.sortIds), and [`map.emit.index`](map.md#map.emit.index) when rendering and ordering output. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [linkedName](../../src/emit.ts#L269) (mapDir: string, node: SnapshotNode, name: string) → string <!-- internal -->
      <a id="map.emit.linkedName"></a><br>Wraps a display name in a Markdown link pointing at the node's source location, built via [`map.emit.codeHref`](map.md#map.emit.codeHref). Returns the bare name when the node lacks a file or line. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [map.emit.codeHref](map.md#map.emit.codeHref)
    - fn [renderModule](../../src/emit.ts#L274) (r: Render, id: string, depth: number) → string <!-- internal -->
      <a id="map.emit.renderModule"></a><br>Renders a module as an indented markdown bullet with its linked name, comment, description and dependency edges, then recurses into nested modules or emits child declarations via [`map.emit.renderDecl`](map.md#map.emit.renderDecl) in sorted order. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [map.emit.linkedName](map.md#map.emit.linkedName), [map.emit.nameOf](map.md#map.emit.nameOf), [map.emit.describe](map.md#map.emit.describe), [map.emit.depsOf](map.md#map.emit.depsOf), [map.emit.ref](map.md#map.emit.ref), [map.emit.sortIds](map.md#map.emit.sortIds), [map.emit.renderDecl](map.md#map.emit.renderDecl)
    - fn [edgesFrom](../../src/emit.ts#L297) (snapshot: AnalysisSnapshot, id: string) → readonly SnapshotEdge[] <!-- internal -->
      <a id="map.emit.edgesFrom"></a><br>Returns all edges whose source is the given id, building and memoizing a per-snapshot source→edges map on first use. Serves [`map.emit.depsOf`](map.md#map.emit.depsOf) and [`map.emit.renderDecl`](map.md#map.emit.renderDecl) as their edge lookup. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - fn [depsOf](../../src/emit.ts#L312) (snapshot: AnalysisSnapshot, id: string) → SnapshotEdge[] <!-- internal -->
      <a id="map.emit.depsOf"></a><br>One line per dependency alias: an import and a re-export of one module are one dependency with two edges.
      - calls [map.emit.edgesFrom](map.md#map.emit.edgesFrom)
    - fn [renderDecl](../../src/emit.ts#L320) (r: Render, id: string, node: SnapshotNode, depth: number) → string <!-- internal -->
      <a id="map.emit.renderDecl"></a><br>Builds one indented markdown bullet for a declaration: a `fn`/`type` keyword, a linked name via [`map.emit.linkedName`](map.md#map.emit.linkedName), its signature, an internal marker, and the description from [`map.emit.describe`](map.md#map.emit.describe). Then appends a "calls" line listing deduplicated resolved, non-self… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [map.emit.linkedName](map.md#map.emit.linkedName), [map.emit.nameOf](map.md#map.emit.nameOf), [map.emit.describe](map.md#map.emit.describe), [map.emit.edgesFrom](map.md#map.emit.edgesFrom), [map.emit.ref](map.md#map.emit.ref)
  - module [entries](../../src/entries.ts#L1)
    <a id="map.entries"></a><br>Entry points of a repository without a framework adapter (ADR 0022 п. 5): only what the code and its manifests write down. `bin` of package.json and `[project.scripts]` of pyproject.toml are `cli`; `fn main` of a Rust bin target, a Python `if __name__ == "__main__":` block and…
    - smol-toml [external.smol-toml](external.md#external.smol-toml)
    - facts [extract.facts](extract.md#extract.facts)
    - graph [map.graph](map.md#map.graph)
    - imports [map.imports](map.md#map.imports)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - type [EntryManifests](../../src/entries.ts#L18)
      <a id="map.entries.EntryManifests"></a><br>The manifests the collectors read, by POSIX path from the root; null when absent.
    - type [EntryInputs](../../src/entries.ts#L27)
      <a id="map.entries.EntryInputs"></a>
    - type [EntryScope](../../src/entries.ts#L36)
      <a id="map.entries.EntryScope"></a><br>The graph with the facts it was built from, by file, and every fn by id: what resolves a written name to a fn and places it.
    - fn [entryScope](../../src/entries.ts#L42) (graph: Graph, facts: readonly FileFacts[]) → EntryScope
      <a id="map.entries.entryScope"></a>
    - fn [placeOf](../../src/entries.ts#L53) (scope: EntryScope, id: string, fallback: { file: string; line: number }) → { file: string; line: number } <!-- internal -->
      <a id="map.entries.placeOf"></a><br>Where an entry's id is declared: the fn, else the module's file and first line.
    - fn [frameworkEntry](../../src/entries.ts#L61) (scope: EntryScope, framework: string, kind: EntryPoint["kind"], id: string, label: string, source: string, fallback: { file: string; line: number }) → EntryPoint
      <a id="map.entries.frameworkEntry"></a><br>An entry a framework adapter found: placed like a language-level one, with its framework's name.
      - calls [map.entries.entry](map.md#map.entries.entry)
    - fn [entry](../../src/entries.ts#L66) (scope: EntryScope, kind: EntryPoint["kind"], id: string, label: string, source: string, fallback: { file: string; line: number }) → EntryPoint <!-- internal -->
      <a id="map.entries.entry"></a><br>A fn's place for the entry, with the manifest or the code position the fact is written at as `source`.
      - calls [map.entries.placeOf](map.md#map.entries.placeOf)
    - fn [collectEntries](../../src/entries.ts#L72) (inputs: EntryInputs) → EntryPoint[]
      <a id="map.entries.collectEntries"></a><br>Every language-level entry point of the inputs, in a deterministic order: kind, label, id.
      - calls [map.entries.entryScope](map.md#map.entries.entryScope), [map.entries.binEntries](map.md#map.entries.binEntries), [map.entries.nextRouteEntries](map.md#map.entries.nextRouteEntries), [map.entries.expressRouteEntries](map.md#map.entries.expressRouteEntries), [map.entries.pythonMainEntries](map.md#map.entries.pythonMainEntries), [map.entries.pyprojectScriptEntries](map.md#map.entries.pyprojectScriptEntries), [map.entries.rustMainEntries](map.md#map.entries.rustMainEntries), [map.entries.phpScriptEntries](map.md#map.entries.phpScriptEntries), [map.entries.compareEntries](map.md#map.entries.compareEntries)
    - fn [compareEntries](../../src/entries.ts#L95) (a: EntryPoint, b: EntryPoint) → number
      <a id="map.entries.compareEntries"></a>
      - calls [map.entries.cmp](map.md#map.entries.cmp)
    - fn [binTargets](../../src/entries.ts#L100) (packageJson: string | null) → { name: string; path: string }[]
      <a id="map.entries.binTargets"></a><br>`bin` of the root package.json: `"bin": "cli.js"` (named after the package) or `"bin": {name: path}`. Paths are POSIX, relative to the manifest.
      - calls [map.imports.parseJsonc](map.md#map.imports.parseJsonc), [map.entries.isRecord](map.md#map.entries.isRecord), [map.entries.normalizePath](map.md#map.entries.normalizePath)
    - fn [binSource](../../src/entries.ts#L119) (path: string, has: (path: string) => boolean) → string | null
      <a id="map.entries.binSource"></a><br>The source file a `bin` path names: itself when the graph has it, else the TypeScript source of a JavaScript path in the same place (`bin/cli.js` → `bin/cli.ts`). A built file outside the sources resolves to nothing.
    - fn [binEntries](../../src/entries.ts#L124) (packageJson: string | null, scope: EntryScope) → EntryPoint[] <!-- internal -->
      <a id="map.entries.binEntries"></a>
      - calls [map.entries.binTargets](map.md#map.entries.binTargets), [map.entries.binSource](map.md#map.entries.binSource), [map.entries.fnIn](map.md#map.entries.fnIn), [map.entries.entry](map.md#map.entries.entry)
    - fn [nextRoutePath](../../src/entries.ts#L147) (file: string) → string | null
      <a id="map.entries.nextRoutePath"></a><br>The URL path of a Next.js `app/**\/route.ts`: the directories after `app/`, without route groups (`(marketing)`); `/` for the root handler. Null for a file that is no route handler.
    - fn [nextRouteEntries](../../src/entries.ts#L154) (facts: readonly FileFacts[], scope: EntryScope) → EntryPoint[] <!-- internal -->
      <a id="map.entries.nextRouteEntries"></a>
      - calls [map.entries.nextRoutePath](map.md#map.entries.nextRoutePath), [map.entries.fnIn](map.md#map.entries.fnIn), [map.entries.entry](map.md#map.entries.entry)
    - fn [expressRouteEntries](../../src/entries.ts#L175) (facts: readonly FileFacts[], scope: EntryScope) → EntryPoint[] <!-- internal -->
      <a id="map.entries.expressRouteEntries"></a>
      - calls [map.entries.fnIn](map.md#map.entries.fnIn), [map.entries.entry](map.md#map.entries.entry)
    - fn [pythonMainEntries](../../src/entries.ts#L187) (facts: readonly FileFacts[], scope: EntryScope) → EntryPoint[] <!-- internal -->
      <a id="map.entries.pythonMainEntries"></a>
      - calls [map.entries.fnIn](map.md#map.entries.fnIn), [map.entries.entry](map.md#map.entries.entry)
    - fn [pyprojectScripts](../../src/entries.ts#L202) (pyproject: string | null) → { name: string; module: string; fn: string | null }[]
      <a id="map.entries.pyprojectScripts"></a><br>`[project.scripts]` of pyproject.toml: script name → `pkg.module:func` (or `pkg.module` alone). Empty for no manifest or an unreadable one.
      - calls [map.entries.isRecord](map.md#map.entries.isRecord)
    - fn [pythonModuleFile](../../src/entries.ts#L223) (module: string, has: (path: string) => boolean) → string | null
      <a id="map.entries.pythonModuleFile"></a><br>The source file of a dotted Python module name, at the root or under `src/`: `pkg.cli` → `pkg/cli.py`, `pkg/cli/__init__.py`, `src/pkg/cli.py`, …
    - fn [pyprojectScriptEntries](../../src/entries.ts#L229) (pyproject: string | null, scope: EntryScope) → EntryPoint[] <!-- internal -->
      <a id="map.entries.pyprojectScriptEntries"></a>
      - calls [map.entries.pyprojectScripts](map.md#map.entries.pyprojectScripts), [map.entries.pythonModuleFile](map.md#map.entries.pythonModuleFile), [map.entries.fnIn](map.md#map.entries.fnIn), [map.entries.entry](map.md#map.entries.entry)
    - fn [rustBinTarget](../../src/entries.ts#L248) (file: string, cargoToml: string | null, exists: (path: string) => boolean) → boolean
      <a id="map.entries.rustBinTarget"></a><br>Whether a Rust file is a bin target by Cargo's layout: `src/main.rs`, `src/bin/<name>.rs` or `src/bin/<name>/main.rs` of a crate (a `Cargo.toml` beside its `src/`), or a `[[bin]] path` of the root manifest.
      - calls [map.entries.isRecord](map.md#map.entries.isRecord), [map.entries.normalizePath](map.md#map.entries.normalizePath)
    - fn [rustMainEntries](../../src/entries.ts#L262) (facts: readonly FileFacts[], scope: EntryScope, cargoToml: string | null, exists: (path: string) => boolean) → EntryPoint[] <!-- internal -->
      <a id="map.entries.rustMainEntries"></a>
      - calls [map.entries.rustBinTarget](map.md#map.entries.rustBinTarget), [map.entries.fnIn](map.md#map.entries.fnIn), [map.entries.entry](map.md#map.entries.entry)
    - fn [phpScript](../../src/entries.ts#L277) (file: Pick<FileFacts, "path" | "decls" | "moduleCalls">) → boolean
      <a id="map.entries.phpScript"></a><br>A PHP file run as a script, by its place: `bin/*.php` or `public/index.php`, with code at its top level. A class in `bin/` is a declaration, not a script.
    - fn [phpScriptEntries](../../src/entries.ts#L281) (facts: readonly FileFacts[], scope: EntryScope) → EntryPoint[] <!-- internal -->
      <a id="map.entries.phpScriptEntries"></a>
      - calls [map.entries.phpScript](map.md#map.entries.phpScript), [map.entries.entry](map.md#map.entries.entry)
    - fn [fnIn](../../src/entries.ts#L298) (scope: EntryScope, file: string, name: string) → string | null
      <a id="map.entries.fnIn"></a><br>The fn a name written in `file` stands for: a fn declared there (`h`, or `Class.method`), or one imported under that name (`import { h } from "./handlers"`, `import handlers from`; `handlers.save` through a module import). Null when the graph does not resolve it: a name is no…
      - calls [map.entries.importedSymbol](map.md#map.entries.importedSymbol)
    - fn [importedSymbol](../../src/entries.ts#L319) (scope: EntryScope, module: Module, file: string, local: string, member: string | null) → string | null <!-- internal -->
      <a id="map.entries.importedSymbol"></a><br>The symbol an import of `file` binds `local` to; with `member`, the export of a module import (`ns.member`).
    - fn [normalizePath](../../src/entries.ts#L340) (path: string) → string <!-- internal -->
      <a id="map.entries.normalizePath"></a>
    - fn [isRecord](../../src/entries.ts#L344) (value: unknown) → value is Record<string, unknown> <!-- internal -->
      <a id="map.entries.isRecord"></a>
    - fn [cmp](../../src/entries.ts#L348) (a: string, b: string) → number <!-- internal -->
      <a id="map.entries.cmp"></a>
  - module [exact-path](../../src/exact-path.ts#L1)
    <a id="map.exact-path"></a><br>Whether a path keylang derived from code exists on disk with exactly that spelling. `existsSync` answers for the file system: on APFS and NTFS `src/models/User.rs` exists when `src/models/user.rs` does, so a resolver that trusts it names a file the index does not have, and a…
    - node [external.node](external.md#external.node)
    - type [ExactFs](../../src/exact-path.ts#L14)
      <a id="map.exact-path.ExactFs"></a><br>The two calls the check makes, replaceable in tests that emulate a case-insensitive file system.
    - fn [exactExistence](../../src/exact-path.ts#L26) (root: string, fs: ExactFs = nodeFs) → (file: string) => boolean
      <a id="map.exact-path.exactExistence"></a><br>A predicate over POSIX paths relative to `root`: the file or directory exists, spelled exactly so. Listings are read once per directory, so the predicate is for one analysis, as a resolver is.
  - module [explanations](../../src/explanations.ts#L1)
    <a id="map.explanations"></a><br>Explanations of nodes (ADR 0004): the documentation comment in the code first, then a brief a model wrote, saved under `<dir>/explain/brief/`. One lookup for the explained map, the TUI, MCP and the language server; the store and its baselines live here so that lookup needs no…
    - node [external.node](external.md#external.node)
    - brief [base.brief](base.md#base.brief)
    - config [base.config](base.md#base.config)
    - graph [map.graph](map.md#map.graph)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - type [ExplanationDetail](../../src/explanations.ts#L15) = "short" | "full" | "brief"
      <a id="map.explanations.ExplanationDetail"></a><br>`short` and `full` answer `explain <id> --llm`; `brief` is the one or two sentences of the explained map.
    - type [StoredExplanation](../../src/explanations.ts#L18)
      <a id="map.explanations.StoredExplanation"></a><br>An explanation a model wrote, with the header it is saved under.
    - fn [isStoredExplanation](../../src/explanations.ts#L32) (text: string) → boolean
      <a id="map.explanations.isStoredExplanation"></a><br>A file `explain --llm` wrote: the model's text under keylang's header, not keylang Markdown to parse or format.
    - fn [parseStoredExplanation](../../src/explanations.ts#L37) (text: string) → StoredExplanation | null
      <a id="map.explanations.parseStoredExplanation"></a><br>The saved form; null for a file keylang did not write, which is not an explanation it can date.
    - fn [formatStoredExplanation](../../src/explanations.ts#L43) (e: StoredExplanation) → string
      <a id="map.explanations.formatStoredExplanation"></a><br>Serializes a stored explanation into the on-disk text form: an HTML comment header carrying agent, date, closure, lang and detail fields, followed by the explanation body and a trailing newline. Used by `operations.operations.runExplainBatch` and… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [explainDir](../../src/explanations.ts#L48) (config: Pick<Config, "dir">) → string
      <a id="map.explanations.explainDir"></a><br>Where explanations are saved, relative to the root: `<dir>/explain`, committed next to the map.
      - calls [base.config.specPath](base.md#base.config.specPath)
    - fn [explanationPath](../../src/explanations.ts#L66) (config: Pick<Config, "dir"> & { root?: string }, id: string, detail: ExplanationDetail, also: Iterable<string> = []) → string
      <a id="map.explanations.explanationPath"></a><br>File of an explanation relative to the root: `<dir>/explain/<id>.md`, a brief in `<dir>/explain/brief/<id>.md`. IDs that differ only in letter case (`type Order`, `fn order`) would share that file on APFS and NTFS, and a checkout of both breaks there, so an ID with such a twin…
      - calls [map.explanations.explainDir](map.md#map.explanations.explainDir), [map.explanations.storeName](map.md#map.explanations.storeName), [map.explanations.storeNames](map.md#map.explanations.storeNames)
    - fn [storeName](../../src/explanations.ts#L72) (names: readonly string[], id: string, also: Iterable<string>) → string <!-- internal -->
      <a id="map.explanations.storeName"></a><br>The file name of `id` in a store whose files are `names`.
      - calls [map.explanations.storedId](map.md#map.explanations.storedId)
    - fn [storedId](../../src/explanations.ts#L83) (name: string) → string <!-- internal -->
      <a id="map.explanations.storedId"></a><br>The ID a store file saves: `<id>.md` or `<id>~<hash>.md`.
    - fn [storeNames](../../src/explanations.ts#L88) (root: string, dir: string) → string[] <!-- internal -->
      <a id="map.explanations.storeNames"></a><br>Names of the `.md` files in `dir` (relative to the root), as the listing spells them.
    - fn [readStoredExplanation](../../src/explanations.ts#L96) (root: string, rel: string) → StoredExplanation | null
      <a id="map.explanations.readStoredExplanation"></a><br>Joins the root and relative path, and if that file exists reads it as UTF-8 and hands the text to [`map.explanations.parseStoredExplanation`](map.md#map.explanations.parseStoredExplanation); otherwise returns null without touching disk further. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [map.explanations.parseStoredExplanation](map.md#map.explanations.parseStoredExplanation)
    - fn [storedIds](../../src/explanations.ts#L102) (root: string, dir: string) → string[]
      <a id="map.explanations.storedIds"></a><br>IDs with a saved file in `dir` (relative to the root), sorted.
      - calls [map.explanations.storedId](map.md#map.explanations.storedId), [map.explanations.storeNames](map.md#map.explanations.storeNames)
    - fn [loadBriefs](../../src/explanations.ts#L107) (config: Config) → Map<string, StoredExplanation>
      <a id="map.explanations.loadBriefs"></a><br>Briefs saved under `<dir>/explain/brief/`, by ID. A file without keylang's header is not one.
      - calls [map.explanations.explainDir](map.md#map.explanations.explainDir), [map.explanations.storeNames](map.md#map.explanations.storeNames), [map.explanations.storedId](map.md#map.explanations.storedId), [map.explanations.readStoredExplanation](map.md#map.explanations.readStoredExplanation), [map.explanations.storeName](map.md#map.explanations.storeName)
    - fn [snapshotBaseline](../../src/explanations.ts#L130) (snapshot: AnalysisSnapshot, id: string) → string | null
      <a id="map.explanations.snapshotBaseline"></a><br>The baseline an explanation of `id` is compared with: the closure fingerprint of a fn or type; for a module, class or layer, which has no closure of its own, a hash of its dependencies and of the closures of every node under it, so a change inside makes its explanation stale (a…
      - calls [map.explanations.lowerBound](map.md#map.explanations.lowerBound)
    - fn [lowerBound](../../src/explanations.ts#L152) (sorted: readonly string[], key: string) → number <!-- internal -->
      <a id="map.explanations.lowerBound"></a><br>Binary-searches a lexicographically sorted string array for the first index whose element is not less than the given key, returning the array length if none qualifies. [`map.explanations.snapshotBaseline`](map.md#map.explanations.snapshotBaseline) uses it to locate an id's insertion point in a snapshot's ordered keys. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [ownLayers](../../src/explanations.ts#L172) (snapshot: AnalysisSnapshot) → string[]
      <a id="map.explanations.ownLayers"></a><br>Layers of the snapshot that are the repository's own, sorted: packages outside it are left out.
    - fn [systemBaseline](../../src/explanations.ts#L183) (snapshot: AnalysisSnapshot, briefs: ReadonlyMap<string, StoredExplanation>) → string
      <a id="map.explanations.systemBaseline"></a><br>The baseline of the repository's brief: its layers and what the explained map says about each. A new layer or a rewritten layer brief makes the repository's brief stale; a change of code below a layer does not.
      - calls [map.explanations.ownLayers](map.md#map.explanations.ownLayers), [map.explanations.explanationOf](map.md#map.explanations.explanationOf)
    - type [NodeExplanation](../../src/explanations.ts#L189)
      <a id="map.explanations.NodeExplanation"></a><br>What a node is, in plain words, and where the words come from.
    - fn [explanationOf](../../src/explanations.ts#L207) (snapshot: AnalysisSnapshot, briefs: ReadonlyMap<string, StoredExplanation>, id: string) → NodeExplanation | null
      <a id="map.explanations.explanationOf"></a><br>The explanation of a node: its documentation comment, else its saved brief (fresh or stale), else null. Never a `short` or `full` explanation: those answer a question about one node, not a line of the map.
      - calls [map.explanations.briefExplanation](map.md#map.explanations.briefExplanation), [map.explanations.systemBaseline](map.md#map.explanations.systemBaseline), [map.explanations.snapshotBaseline](map.md#map.explanations.snapshotBaseline)
    - fn [briefExplanation](../../src/explanations.ts#L219) (brief: StoredExplanation | undefined, baseline: () => string | null) → NodeExplanation | null <!-- internal -->
      <a id="map.explanations.briefExplanation"></a>
      - calls [base.brief.briefOf](base.md#base.brief.briefOf)
    - fn [modelName](../../src/explanations.ts#L226) (agent: string) → string
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
      <a id="map.exports.ModuleExportsInput"></a><br>Describes one module's export surface for resolution: its own export rows in file order (first name wins), each `export * from` source as a module id or a null with a reason, and a flag that unknown members may supply any re-exported name. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - type [ExportEntry](../../src/exports.ts#L50)
      <a id="map.exports.ExportEntry"></a><br>Describes one public name a module exposes: the owning module, the exported name, the indexed declaration it resolves to (or null), and its kind, with optional form, local alias, source module, and a reason when a wildcard re-export's names are unknown. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [ExportTables](../../src/exports.ts#L63)
      <a id="map.exports.ExportTables"></a><br>Read-only query surface over per-module export tables: finds the `ExportEntry` for a public name, resolves which symbol an importer of a name actually receives (falling back to the local declaration when no entry exists), and lists all entries sorted by module and name. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Result](../../src/exports.ts#L76) <!-- internal -->
      <a id="map.exports.Result"></a><br>Pairs a computed value with `low`, the depth of the shallowest in-progress computation it read, or Infinity when it read none. Lets callers detect results that depend on an unfinished cycle. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [resolveExports](../../src/exports.ts#L82) (inputs: ReadonlyMap<string, ModuleExportsInput>, symbolKind: (id: string) => ExportKind | null, declared: (module: string, name: string) => string | null) → ExportTables
      <a id="map.exports.resolveExports"></a><br>Builds lazily memoised export tables for every module, resolving named rows and `export *` chains (via [`map.exports.pickStar`](map.md#map.exports.pickStar)) to concrete symbols while a depth guard keeps cyclic re-exports from recursing forever or caching partial answers. Returns lookup, symbol-of, and… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [map.exports.pickStar](map.md#map.exports.pickStar), [map.exports.compare](map.md#map.exports.compare)
    - fn [pickStar](../../src/exports.ts#L195) (module: string, name: string, found: readonly { entry: ExportEntry; star: string | null }[], lastWins = false) → ExportEntry | null <!-- internal -->
      <a id="map.exports.pickStar"></a><br>The entry `export *` gives a name: the one source that has it. Two sources whose names stand for different declarations make the name ambiguous, and ESM exports neither; with `lastWins` (Python's glob imports) the last such source gives it.
    - fn [compare](../../src/exports.ts#L213) (a: string, b: string) → number <!-- internal -->
      <a id="map.exports.compare"></a><br>Orders two strings by plain code-unit comparison, returning -1, 1, or 0 as a sort comparator. It performs no locale-aware or case-insensitive handling. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
  - module [fact-cache](../../src/fact-cache.ts#L1)
    <a id="map.fact-cache"></a><br>Extracted facts reused across runs. A file's facts depend only on its path, its content, and the extractor with its grammars, so that is the key; the graph and the snapshot are rebuilt from all facts every time, which keeps resolution of importers consistent when an export…
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - facts [extract.facts](extract.md#extract.facts)
    - adapter [base.adapter](base.md#base.adapter)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - span [base.span](base.md#base.span)
    - type [StoredFacts](../../src/fact-cache.ts#L25) = Omit<FileFacts, "exports"> & { exports: string[] } <!-- internal -->
      <a id="map.fact-cache.StoredFacts"></a><br>Serialization shape for a cached file's facts: everything from `FileFacts` unchanged, except that `exports` becomes a plain array of strings rather than its in-memory form, so it can be written to and read from the cache on disk. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Stored](../../src/fact-cache.ts#L27) <!-- internal -->
      <a id="map.fact-cache.Stored"></a><br>Shape of the on-disk cache file: a schema number and version string, plus a per-file map keyed by path holding the file's sha256 and its cached facts so unchanged files can be skipped on reload. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - fn [storedConfigs](../../src/fact-cache.ts#L36) (value: unknown, version: string) → NonNullable<Stored["configs"]> <!-- internal -->
      <a id="map.fact-cache.storedConfigs"></a><br>Config entries of a cache of this schema and version; one of the wrong shape is parsed again.
      - calls [map.fact-cache.isRecord](map.md#map.fact-cache.isRecord), [base.adapter.isConfigFacts](base.md#base.adapter.isConfigFacts)
    - fn [storedFiles](../../src/fact-cache.ts#L51) (value: unknown, version: string) → Stored["files"] <!-- internal -->
      <a id="map.fact-cache.storedFiles"></a><br>Entries of a cache written by this schema and version. An entry of the wrong shape — any field the graph reads, at any depth — is dropped, so its file is extracted again instead of trusted or thrown on.
      - calls [map.fact-cache.isRecord](map.md#map.fact-cache.isRecord), [map.fact-cache.isStoredFacts](map.md#map.fact-cache.isStoredFacts)
    - fn [isStoredFacts](../../src/fact-cache.ts#L61) (value: unknown) → value is StoredFacts <!-- internal -->
      <a id="map.fact-cache.isStoredFacts"></a><br>Type guard that structurally validates an unknown cached value as per-file facts (path, positions, imports, decls, exports, calls, completeness, parse error, optional doc/symbols), used by [`map.fact-cache.storedFiles`](map.md#map.fact-cache.storedFiles). _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [map.fact-cache.isRecord](map.md#map.fact-cache.isRecord), [map.fact-cache.isPosition](map.md#map.fact-cache.isPosition), [map.fact-cache.isImport](map.md#map.fact-cache.isImport), [map.fact-cache.every](map.md#map.fact-cache.every), [map.fact-cache.isDecl](map.md#map.fact-cache.isDecl), [map.fact-cache.isString](map.md#map.fact-cache.isString), [map.fact-cache.isExportRow](map.md#map.fact-cache.isExportRow), [map.fact-cache.isRange](map.md#map.fact-cache.isRange), [map.fact-cache.optionalTrue](map.md#map.fact-cache.optionalTrue), [map.fact-cache.isCall](map.md#map.fact-cache.isCall), [map.fact-cache.optional](map.md#map.fact-cache.optional)
    - fn [isImport](../../src/fact-cache.ts#L82) (value: unknown) → boolean <!-- internal -->
      <a id="map.fact-cache.isImport"></a><br>Type guard that validates a cached import fact: a record with string source and text, a valid range via [`map.fact-cache.isRange`](map.md#map.fact-cache.isRange), boolean reexport, optional true-only flags, and well-formed module, default or named bindings. _(llm · claude:claude-opus-5-5 · 2026-10-06)_
      - calls [map.fact-cache.isRecord](map.md#map.fact-cache.isRecord), [map.fact-cache.isRange](map.md#map.fact-cache.isRange), [map.fact-cache.optionalTrue](map.md#map.fact-cache.optionalTrue), [map.fact-cache.every](map.md#map.fact-cache.every)
    - fn [isDecl](../../src/fact-cache.ts#L97) (value: unknown) → boolean <!-- internal -->
      <a id="map.fact-cache.isDecl"></a><br>Type guard checking that a cached value is a valid fn, class, or type declaration with name, range ([`map.fact-cache.isRange`](map.md#map.fact-cache.isRange)), calls, and types, recursively validating members. Optional flags and strings are verified via [`map.fact-cache.optional`](map.md#map.fact-cache.optional) and… _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [map.fact-cache.isRecord](map.md#map.fact-cache.isRecord), [map.fact-cache.isRange](map.md#map.fact-cache.isRange), [map.fact-cache.isCall](map.md#map.fact-cache.isCall), [map.fact-cache.every](map.md#map.fact-cache.every), [map.fact-cache.isString](map.md#map.fact-cache.isString), [map.fact-cache.optional](map.md#map.fact-cache.optional), [map.fact-cache.optionalTrue](map.md#map.fact-cache.optionalTrue)
    - fn [isCall](../../src/fact-cache.ts#L120) (value: unknown) → boolean <!-- internal -->
      <a id="map.fact-cache.isCall"></a><br>Validates that a cached call-site record has a string `callee`, a valid range via `isRange`, and only well-formed optional fields (bound, receiver, hook, passes, opaque/closure flags). Returns false on any shape mismatch. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [map.fact-cache.isRecord](map.md#map.fact-cache.isRecord), [map.fact-cache.isRange](map.md#map.fact-cache.isRange), [map.fact-cache.optionalTrue](map.md#map.fact-cache.optionalTrue), [map.fact-cache.isBound](map.md#map.fact-cache.isBound), [map.fact-cache.optional](map.md#map.fact-cache.optional), [map.fact-cache.isString](map.md#map.fact-cache.isString), [map.fact-cache.isHook](map.md#map.fact-cache.isHook), [map.fact-cache.isPass](map.md#map.fact-cache.isPass), [map.fact-cache.every](map.md#map.fact-cache.every)
    - fn [isHook](../../src/fact-cache.ts#L135) (value: unknown) → boolean <!-- internal -->
      <a id="map.fact-cache.isHook"></a><br>Checks that a value is a record (via [`map.fact-cache.isRecord`](map.md#map.fact-cache.isRecord)) with string `name`, `fallback`, and `path`, an `owner` of "self" or "constructor", and a `param` that is null or a non-negative integer per [`map.fact-cache.isInteger`](map.md#map.fact-cache.isInteger). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [map.fact-cache.isRecord](map.md#map.fact-cache.isRecord), [map.fact-cache.isInteger](map.md#map.fact-cache.isInteger)
    - fn [isPass](../../src/fact-cache.ts#L146) (value: unknown) → boolean <!-- internal -->
      <a id="map.fact-cache.isPass"></a><br>Checks that an unknown value is a plain object with an integer `arg`, string `path` and `callee`, plus optional `bound` and `receiver` fields validated via [`map.fact-cache.optional`](map.md#map.fact-cache.optional), using [`map.fact-cache.isRecord`](map.md#map.fact-cache.isRecord) for the shape test. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [map.fact-cache.isRecord](map.md#map.fact-cache.isRecord), [map.fact-cache.isBound](map.md#map.fact-cache.isBound), [map.fact-cache.optional](map.md#map.fact-cache.optional), [map.fact-cache.isString](map.md#map.fact-cache.isString)
    - fn [isExportRow](../../src/fact-cache.ts#L153) (value: unknown) → boolean <!-- internal -->
      <a id="map.fact-cache.isExportRow"></a><br>Validates that a cached value is a well-formed export row: an object (via [`map.fact-cache.isRecord`](map.md#map.fact-cache.isRecord)) with string `name`, a `kind` from the allowed set, and `local` either null or a string. Uses [`map.fact-cache.optional`](map.md#map.fact-cache.optional) to allow `form` and `from` to be absent, otherwise… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [map.fact-cache.isRecord](map.md#map.fact-cache.isRecord), [map.fact-cache.optional](map.md#map.fact-cache.optional), [map.fact-cache.isString](map.md#map.fact-cache.isString)
    - fn [isBound](../../src/fact-cache.ts#L157) (value: unknown) → boolean <!-- internal -->
      <a id="map.fact-cache.isBound"></a><br>Returns true only when the input is exactly the string `"parameter"` or `"local"`, treating those two tags as the markers of a bound binding kind; any other value yields false. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [isRange](../../src/fact-cache.ts#L162) (value: Record<string, unknown>) → boolean <!-- internal -->
      <a id="map.fact-cache.isRange"></a><br>1-based `line`, `col`, `endLine`, `endCol`.
      - calls [map.fact-cache.isPosition](map.md#map.fact-cache.isPosition)
    - fn [isPosition](../../src/fact-cache.ts#L166) (value: unknown) → boolean <!-- internal -->
      <a id="map.fact-cache.isPosition"></a><br>Returns true only when the input passes [`map.fact-cache.isInteger`](map.md#map.fact-cache.isInteger) and is at least 1, i.e. a positive whole number usable as a line or column. Used by [`map.fact-cache.isRange`](map.md#map.fact-cache.isRange) and [`map.fact-cache.isStoredFacts`](map.md#map.fact-cache.isStoredFacts) to validate cached location fields. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [map.fact-cache.isInteger](map.md#map.fact-cache.isInteger)
    - fn [isInteger](../../src/fact-cache.ts#L170) (value: unknown) → value is number <!-- internal -->
      <a id="map.fact-cache.isInteger"></a><br>Type guard that checks a runtime value is a JavaScript number with no fractional part, narrowing it to `number`; [`map.fact-cache.isHook`](map.md#map.fact-cache.isHook) and [`map.fact-cache.isPosition`](map.md#map.fact-cache.isPosition) rely on it to validate cached fact fields. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [isString](../../src/fact-cache.ts#L174) (value: unknown) → boolean <!-- internal -->
      <a id="map.fact-cache.isString"></a><br>Returns true only when the given value is a primitive string, via a `typeof` check; used in [`map.fact-cache`](map.md#map.fact-cache) to validate untrusted fields before they are accepted into cached fact records. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [every](../../src/fact-cache.ts#L178) (value: unknown, check: (item: unknown) => boolean) → boolean <!-- internal -->
      <a id="map.fact-cache.every"></a><br>Returns true only when the input is an array and `check` holds for each element; a non-array yields false without calling `check`. Used by [`map.fact-cache.isCall`](map.md#map.fact-cache.isCall), [`map.fact-cache.isDecl`](map.md#map.fact-cache.isDecl), [`map.fact-cache.isImport`](map.md#map.fact-cache.isImport) and [`map.fact-cache.isStoredFacts`](map.md#map.fact-cache.isStoredFacts) to validate cached shapes. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [optional](../../src/fact-cache.ts#L182) (value: unknown, check: (item: unknown) => boolean) → boolean <!-- internal -->
      <a id="map.fact-cache.optional"></a><br>Returns true when the value is absent (`undefined`), otherwise defers to the supplied predicate. Shared by the row validators [`map.fact-cache.isCall`](map.md#map.fact-cache.isCall), [`map.fact-cache.isDecl`](map.md#map.fact-cache.isDecl), [`map.fact-cache.isExportRow`](map.md#map.fact-cache.isExportRow), [`map.fact-cache.isPass`](map.md#map.fact-cache.isPass), and [`map.fact-cache.isStoredFacts`](map.md#map.fact-cache.isStoredFacts) to accept… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [optionalTrue](../../src/fact-cache.ts#L186) (value: unknown) → boolean <!-- internal -->
      <a id="map.fact-cache.optionalTrue"></a><br>Returns true when the value is absent (`undefined`) or exactly `true`, treating a missing optional flag as set. Used by [`map.fact-cache.isCall`](map.md#map.fact-cache.isCall), [`map.fact-cache.isDecl`](map.md#map.fact-cache.isDecl) and [`map.fact-cache.isImport`](map.md#map.fact-cache.isImport) to validate optional boolean fields on cached facts. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [isRecord](../../src/fact-cache.ts#L190) (value: unknown) → value is Record<string, unknown> <!-- internal -->
      <a id="map.fact-cache.isRecord"></a><br>Type guard returning true only for non-null, non-array objects, narrowing the input to a string-keyed record. Shared base check used by the fact-cache validators like [`map.fact-cache.isStoredFacts`](map.md#map.fact-cache.isStoredFacts) and [`map.fact-cache.storedFiles`](map.md#map.fact-cache.storedFiles) before inspecting fields. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - module [FactCache](../../src/fact-cache.ts#L197)
      <a id="map.fact-cache.FactCache"></a><br>Caches per-file extracted facts keyed by content hash, checking process memory then the on-disk store before extracting, via [`map.fact-cache.FactCache.facts`](map.md#map.fact-cache.FactCache.facts). [`map.fact-cache.FactCache.changed`](map.md#map.fact-cache.FactCache.changed) detects drift and [`map.fact-cache.FactCache.serialize`](map.md#map.fact-cache.FactCache.serialize) writes this run's facts. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - fn [constructor](../../src/fact-cache.ts#L208) (root: string, version: string, disk: Stored["files"], configs: NonNullable<Stored["configs"]>) <!-- internal -->
        <a id="map.fact-cache.FactCache.constructor"></a><br>Stores the given repository root, cache version string, and previously loaded per-file entries on the instance; private, so instances are only created through the class's own factory methods. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - fn [open](../../src/fact-cache.ts#L216) (root: string, version: string) → FactCache
        <a id="map.fact-cache.FactCache.open"></a><br>`version` names the extractor and grammars; any other stored version is ignored.
        - calls [map.fact-cache.storedFiles](map.md#map.fact-cache.storedFiles), [map.fact-cache.storedConfigs](map.md#map.fact-cache.storedConfigs), [map.fact-cache.FactCache](map.md#map.fact-cache.FactCache)
      - fn [facts](../../src/fact-cache.ts#L232) (path: string, sha256: string, extract: () => Promise<FileFacts>) → Promise<FileFacts>
        <a id="map.fact-cache.FactCache.facts"></a><br>Returns cached facts for a file, checking an in-memory map keyed by root, version and path, then the on-disk store, both validated against the given sha256; on a miss it runs the extractor and counts reuse versus extraction. Every result is written back to memory and recorded… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - fn [config](../../src/fact-cache.ts#L255) (path: string, sha256: string, adapter: string, parse: () => ConfigFacts) → ConfigFacts
        <a id="map.fact-cache.FactCache.config"></a><br>The facts of a framework config file (ADR 0022), by its content: a config whose text changed is parsed again, as a source file is. `adapter` names the adapter and its version, part of the key.
      - fn [changed](../../src/fact-cache.ts#L279) () → boolean
        <a id="map.fact-cache.FactCache.changed"></a><br>Whether the facts of this run differ from the cache on disk: a file the disk has no entry for or holds for other content, or an entry of a file this run did not read. Unchanged, a write would put back the same facts.
      - fn [serialize](../../src/fact-cache.ts#L288) () → string
        <a id="map.fact-cache.FactCache.serialize"></a><br>The text of `FACT_CACHE_FILE` with the facts of this run (and nothing else), for the next process.
        - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [keepsFactCache](../../src/fact-cache.ts#L304) (root: string) → boolean
      <a id="map.fact-cache.keepsFactCache"></a><br>A repository keylang was set up in (`keylang.json`) keeps the fact cache from every analysis of the saved files; one only browsed gets nothing written.
    - fn [saveFactCache](../../src/fact-cache.ts#L315) (root: string, text: string) → boolean
      <a id="map.fact-cache.saveFactCache"></a><br>Writes the fact cache for the next process, best-effort: the cache only saves time, so a write the protocol refuses (a link out of `.keylang/`) or the file system refuses (read-only, a sandbox, EACCES) leaves the old cache, or none, and is no error. The generator's bytes, as…
      - calls [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic), [base.safe-write.landing](base.md#base.safe-write.landing)
  - module [framework-entries](../../src/framework-entries.ts#L1)
    <a id="map.framework-entries"></a><br>Entry points and holes the framework adapters add to a snapshot (ADR 0022 п. 5), placed on the graph: an entry a config file names (SFCC `hooks.json`, `steptypes.json`) becomes the fn or module of its script, and SFCC adds the controllers the TypeScript extractor records…
    - config [base.config](base.md#base.config)
    - entries [map.entries](map.md#map.entries)
    - facts [extract.facts](extract.md#extract.facts)
    - adapter [base.adapter](base.md#base.adapter)
    - cartridges [base.cartridges](base.md#base.cartridges)
    - graph [map.graph](map.md#map.graph)
    - imports [map.imports](map.md#map.imports)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - type [FrameworkEntryInputs](../../src/framework-entries.ts#L18)
      <a id="map.framework-entries.FrameworkEntryInputs"></a>
    - fn [frameworkEntries](../../src/framework-entries.ts#L26) ({ config, graph, facts, frameworks }: FrameworkEntryInputs) → { entries: EntryPoint[]; holes: Gap[]; warnings: string[] }
      <a id="map.framework-entries.frameworkEntries"></a>
      - calls [map.entries.entryScope](map.md#map.entries.entryScope), [map.imports.probeCandidates](map.md#map.imports.probeCandidates), [map.entries.fnIn](map.md#map.entries.fnIn), [map.entries.frameworkEntry](map.md#map.entries.frameworkEntry), [base.cartridges.cartridgeLayout](base.md#base.cartridges.cartridgeLayout), [map.framework-entries.guessedOrder](map.md#map.framework-entries.guessedOrder), [map.framework-entries.controllerEntries](map.md#map.framework-entries.controllerEntries), [map.entries.compareEntries](map.md#map.entries.compareEntries)
    - fn [guessedOrder](../../src/framework-entries.ts#L71) (layout: CartridgeLayout, graph: Graph, facts: readonly FileFacts[], probe: (candidate: string) => string | null) → Gap[] <!-- internal -->
      <a id="map.framework-entries.guessedOrder"></a><br>A `*\/cartridge/…` require that two cartridges answer, or a `module.superModule`, resolved along a guessed cartridge path: the order decided the edge, and nothing the repository writes gave the order. A hole (`unsupported`) of the requiring module, so a rule over it is…
      - calls [base.cartridges.cartridgeAnswers](base.md#base.cartridges.cartridgeAnswers)
    - fn [controllerEntries](../../src/framework-entries.ts#L97) (graph: Graph, facts: readonly FileFacts[], scope: EntryScope) → EntryPoint[] <!-- internal -->
      <a id="map.framework-entries.controllerEntries"></a><br>`server.get('Show', …, handler)` in `controllers/Cart.js`: a `route` labelled `Cart-Show`. The handler is the last argument when it names a fn keylang resolves; a handler written in place has no fn ID, so the controller module stands for it, at the registration's line, with a…
      - calls [map.entries.fnIn](map.md#map.entries.fnIn), [map.entries.frameworkEntry](map.md#map.entries.frameworkEntry)
  - module [frontends](../../src/frontends.ts#L1)
    <a id="map.frontends"></a><br>A frontend reads one family of languages: its extractor turns a file into `FileFacts`, its resolver turns an import specifier into a file, and its capabilities say which edges it looks for. Graph, snapshot and checks are the same for every language; adding one means a frontend…
    - config [base.config](base.md#base.config)
    - facts [extract.facts](extract.md#extract.facts)
    - php [extract.php](extract.md#extract.php)
    - python [extract.python](extract.md#extract.python)
    - rust [extract.rust](extract.md#extract.rust)
    - ts [extract.ts](extract.md#extract.ts)
    - imports [map.imports](map.md#map.imports)
    - languages [base.languages](base.md#base.languages)
    - php-imports [map.php-imports](map.md#map.php-imports)
    - python-imports [map.python-imports](map.md#map.python-imports)
    - rust-imports [map.rust-imports](map.md#map.rust-imports)
    - type [Frontend](../../src/frontends.ts#L18)
      <a id="map.frontends.Frontend"></a><br>Contract for a language plugin: extracts per-file facts from source, builds one shared import resolver per graph, declares which edge kinds it reports, and lists platform globals treated as external. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
    - fn [ecmascriptResolver](../../src/frontends.ts#L97) (root: string, sources: ReadonlySet<string>, _files: readonly FileFacts[], config?: Pick<Config, "sfcc" | "frameworks">) → SourceResolver <!-- internal -->
      <a id="map.frontends.ecmascriptResolver"></a><br>Builds the source resolver for JavaScript/TypeScript frontends by constructing a [`map.imports.ImportResolver`](map.md#map.imports.ImportResolver) over the given project root and set of known source files. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
      - calls [map.imports.ImportResolver](map.md#map.imports.ImportResolver)
    - fn [pythonResolver](../../src/frontends.ts#L103) (root: string, sources: ReadonlySet<string>) → SourceResolver <!-- internal -->
      <a id="map.frontends.pythonResolver"></a><br>Factory adapter that wraps a project root and its known source paths in a [`map.python-imports.PythonResolver`](map.md#map.python-imports.PythonResolver) instance and returns it typed as a generic SourceResolver. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [map.python-imports.PythonResolver](map.md#map.python-imports.PythonResolver)
    - fn [rustResolver](../../src/frontends.ts#L107) (root: string, sources: ReadonlySet<string>) → SourceResolver <!-- internal -->
      <a id="map.frontends.rustResolver"></a><br>Factory that builds a Rust source resolver by constructing [`map.rust-imports.RustResolver`](map.md#map.rust-imports.RustResolver) from the project root and the set of known source files, returning it as a generic resolver. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [map.rust-imports.RustResolver](map.md#map.rust-imports.RustResolver)
    - fn [phpResolver](../../src/frontends.ts#L111) (root: string, sources: ReadonlySet<string>, files: readonly FileFacts[]) → SourceResolver <!-- internal -->
      <a id="map.frontends.phpResolver"></a>
      - calls [map.php-imports.PhpResolver](map.md#map.php-imports.PhpResolver)
    - fn [frontendOf](../../src/frontends.ts#L115) (language: Language) → Frontend
      <a id="map.frontends.frontendOf"></a><br>Looks up the frontend registered for a language in the module-level `FRONTENDS` table and returns it directly, with no fallback for unknown languages. [`map.graph.buildGraph`](map.md#map.graph.buildGraph) uses it to pick the parser per file. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - fn [frontendFor](../../src/frontends.ts#L122) (path: string) → Frontend | undefined
      <a id="map.frontends.frontendFor"></a><br>Resolves a file path to the language-specific frontend used to parse it, looking the language up via [`base.languages.languageOf`](base.md#base.languages.languageOf) and indexing a static table. Returns nothing when the path's language is unknown. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
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
    - adapter [base.adapter](base.md#base.adapter)
    - bindings [base.bindings](base.md#base.bindings)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - type [Graph](../../src/graph.ts#L22)
      <a id="map.graph.Graph"></a><br>The full analysis result: layers, modules keyed by ID and by owning source path, stats, warnings, coverage gaps, assumed imports, ambiguous open edges, resolver config inputs, sorted exports and declared packages. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
    - type [Gap](../../src/graph.ts#L43)
      <a id="map.graph.Gap"></a><br>Records a spot in the codebase the mapper could not resolve, tagging it with one of six kinds, a file position span, the offending text, and a reason. Also optionally names the enclosing module or function. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - type [AssumedImport](../../src/graph.ts#L61) = Omit<Gap, "kind">
      <a id="map.graph.AssumedImport"></a><br>An import of a file `assume` lists: the architecture imports it, and keylang neither reads nor requires it.
    - type [OpenEdge](../../src/graph.ts#L63)
      <a id="map.graph.OpenEdge"></a><br>Describes a single call or type reference from a source node to a target that may be resolved, ambiguous (with a candidates list), or unresolved, along with the file position and span and the referencing text. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Layer](../../src/graph.ts#L77)
      <a id="map.graph.Layer"></a><br>Describes one architectural layer of the repository as a named group holding its top-level modules in the order the map lists them. It is a plain data shape with no behaviour, consumed by code that builds or renders the codebase map. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Module](../../src/graph.ts#L83)
      <a id="map.graph.Module"></a><br>Describes one node of the dependency map — a file, directory, package or class — with its location, nested `Dep`, `Fn`, `TypeNode` and child `Module` entries, plus whether its member list is complete and which `export *` sources it re-exports. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Dep](../../src/graph.ts#L111)
      <a id="map.graph.Dep"></a><br>Records one import edge between modules: the alias, target module, importing file with its exact source span and text, and whether it re-exports. It also flags type-only imports, which the cycle check ignores. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
    - type [Fn](../../src/graph.ts#L132)
      <a id="map.graph.Fn"></a><br>Describes one function node in the code map: where it is declared, its signature and export status, static/private naming, an optional fingerprint of its declarations, its outgoing `Call` list, and how it may be reached without a direct named call via `Escape`. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - type [Escape](../../src/graph.ts#L158)
      <a id="map.graph.Escape"></a><br>Record of a source location (file, line, column) paired with a free-text reason, used to report a spot where graph analysis could not resolve a reference. Carries no behavior; it is pure data shaped for diagnostics output. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Via](../../src/graph.ts#L166)
      <a id="map.graph.Via"></a><br>How a call edge that is not a plain call of the code came about; see `Call.via`.
    - type [Call](../../src/graph.ts#L168)
      <a id="map.graph.Call"></a><br>Describes one outgoing call edge recorded for a function: the callee name, the source span and text of the call, and optional fields marking calls that arrive through a hook (a parameter default or a value injected at a recorded site) or from inside a closure. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - type [TypeNode](../../src/graph.ts#L207)
      <a id="map.graph.TypeNode"></a><br>Describes one declared type in the dependency graph: its unique id, display name, source file and start/end position, optional signature and doc text, whether it is exported, and an optional content fingerprint. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Stats](../../src/graph.ts#L221)
      <a id="map.graph.Stats"></a><br>Holds counters summarizing a built graph: counts of files, modules, functions, types, and dependencies, plus call-resolution tallies (resolved, unresolved, external, dynamic), unresolved imports, and files assigned to no module. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [globalsOf](../../src/graph.ts#L244) (file: string) → Frontend["globals"] <!-- internal -->
      <a id="map.graph.globalsOf"></a><br>Looks up the language frontend for a file path via [`map.frontends.frontendFor`](map.md#map.frontends.frontendFor) and returns its globals table, falling back to an empty set when no frontend matches. Used by [`map.graph.buildGraph`](map.md#map.graph.buildGraph) to seed per-file global symbols. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [map.frontends.frontendFor](map.md#map.frontends.frontendFor)
    - type [FileEntry](../../src/graph.ts#L248) <!-- internal -->
      <a id="map.graph.FileEntry"></a><br>Pairs a file's extracted facts with the module it belongs to, giving the graph builder a single record per source file to hold both pieces of per-file state together. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [buildGraph](../../src/graph.ts#L253) (config: Config, files: FileFacts[], frameworks: readonly FrameworkInput[] = []) → Graph
      <a id="map.graph.buildGraph"></a><br>Turns analyzed files into the architecture graph: places them into layered modules, registers declarations, resolves imports, exports and calls into edges, and records unresolved spots as gaps and warnings. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
      - calls [map.frontends.frontendOf](map.md#map.frontends.frontendOf), [map.frontends.frontendFor](map.md#map.frontends.frontendFor), [map.graph.placeFile](map.md#map.graph.placeFile), [map.graph.isIndexFile](map.md#map.graph.isIndexFile), [map.graph.topSegments](map.md#map.graph.topSegments), [base.config.layerName](base.md#base.config.layerName), [map.graph.addDecl](map.md#map.graph.addDecl), [map.graph.markOpaque](map.md#map.graph.markOpaque), [map.declared-packages.readManifests](map.md#map.declared-packages.readManifests), [base.external-ids.assignExternalIds](base.md#base.external-ids.assignExternalIds), [map.graph.importedPackages](map.md#map.graph.importedPackages), [base.span.compareText](base.md#base.span.compareText), [map.imports.assumedTarget](map.md#map.imports.assumedTarget), [base.config.isAssumed](base.md#base.config.isAssumed), [map.graph.importTarget](map.md#map.graph.importTarget), [map.graph.notIndexed](map.md#map.graph.notIndexed), [base.external-ids.externalSegment](base.md#base.external-ids.externalSegment), [base.languages.languageOf](base.md#base.languages.languageOf), [map.graph.exportInput](map.md#map.graph.exportInput), [map.exports.resolveExports](map.md#map.exports.resolveExports), [base.languages.caselessNames](base.md#base.languages.caselessNames), [map.graph.memberKey](map.md#map.graph.memberKey), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [map.graph.caselessIndex](map.md#map.graph.caselessIndex), [map.graph.staticThroughInstance](map.md#map.graph.staticThroughInstance), [map.graph.globalsOf](map.md#map.graph.globalsOf), [base.bindings.FrameworkBindings](base.md#base.bindings.FrameworkBindings), [map.graph.directoryModuleIn](map.md#map.graph.directoryModuleIn), [base.bindings.FrameworkBindings.interceptors](base.md#base.bindings.FrameworkBindings.interceptors), [map.graph.addCall](map.md#map.graph.addCall), [base.languages.interfaceTypes](base.md#base.languages.interfaceTypes), [map.graph.holeReason](map.md#map.graph.holeReason), [base.languages.constructorName](base.md#base.languages.constructorName), [map.graph.markEscapes](map.md#map.graph.markEscapes)
    - fn [directoryModule](../../src/graph.ts#L1358) (config: Config, dir: string, graph: Pick<Graph, "modules" | "layers">) → string | null
      <a id="map.graph.directoryModule"></a><br>The module of a directory (a framework module's root): a directory module, or the layer itself when the layer's glob starts there; null when the graph has neither.
      - calls [map.graph.directoryModuleIn](map.md#map.graph.directoryModuleIn)
    - fn [directoryModuleIn](../../src/graph.ts#L1362) (config: Config, dir: string, modules: ReadonlyMap<string, Module>, layers: ReadonlyMap<string, Layer>) → string | null <!-- internal -->
      <a id="map.graph.directoryModuleIn"></a>
      - calls [map.graph.placeFile](map.md#map.graph.placeFile)
    - type [GlobSource](../../src/graph.ts#L1380) <!-- internal -->
      <a id="map.graph.GlobSource"></a><br>What one glob import (`use m::*`, `from m import *`) brings into a file's scope.
    - type [BaseLink](../../src/graph.ts#L1388) <!-- internal -->
      <a id="map.graph.BaseLink"></a><br>A class's `extends`: the base keylang has read, or the text of one it has not, and whether that names a package's or the language's class.
    - fn [staticThroughInstance](../../src/graph.ts#L1395) (file: string) → boolean <!-- internal -->
      <a id="map.graph.staticThroughInstance"></a><br>Python and PHP reach a static member through an instance (`s.make()`, `$this->make()`); JavaScript does not.
      - calls [base.languages.languageOf](base.md#base.languages.languageOf)
    - type [ImportTarget](../../src/graph.ts#L1401) <!-- internal -->
      <a id="map.graph.ImportTarget"></a><br>What one import binding names in the file: a declaration of the module (`named`, `default`) or the module itself.
    - fn [unindexedModule](../../src/graph.ts#L1417) (name: string) → Module <!-- internal -->
      <a id="map.graph.unindexedModule"></a><br>A module an import may bind that is never added to the graph: an external one, so calls through its names are external. Its ID is no valid ID, so it names no node.
    - fn [importTarget](../../src/graph.ts#L1431) (module: Module, unit: string, binding: ImportBinding, whole: boolean) → ImportTarget <!-- internal -->
      <a id="map.graph.importTarget"></a><br>A specifier that names the module itself (Rust `use crate::a`, Python `from pkg import mod`) binds the module object, which is no function, like an ESM namespace.
    - fn [exportInput](../../src/graph.ts#L1443) (row: ExportRow, facts: FileFacts, scope: ReadonlyMap<string, string>, imported: ReadonlyMap<string, ImportTarget[]>) → ExportRowInput <!-- internal -->
      <a id="map.graph.exportInput"></a><br>One export row of a file, with what it stands for: a declaration of the file (`scope`), a name or the namespace of the module an import binds, or nothing keylang indexes. A re-export (`export { a } from`, Rust `pub use`) goes through its own import; any other name through a…
      - calls [base.config.layerName](base.md#base.config.layerName)
    - fn [importedPackages](../../src/graph.ts#L1463) (files: readonly FileFacts[], resolve: (file: string, spec: string) => Resolution) → Set<string> <!-- internal -->
      <a id="map.graph.importedPackages"></a><br>Names of the external packages (and `node` for built-ins) the files import.
    - fn [notIndexed](../../src/graph.ts#L1480) (config: Config, file: string) → string | null <!-- internal -->
      <a id="map.graph.notIndexed"></a><br>Why a resolved source file has no module; null when it is left out on purpose: not source code (JSON, CSS), a test or declaration file, `exclude`, outside guessed layers.
      - calls [base.languages.languageOf](base.md#base.languages.languageOf), [base.config.isExcluded](base.md#base.config.isExcluded), [base.config.isOutside](base.md#base.config.isOutside), [map.graph.placeFile](map.md#map.graph.placeFile)
    - fn [isIndexFile](../../src/graph.ts#L1487) (file: string) → boolean <!-- internal -->
      <a id="map.graph.isIndexFile"></a><br>Reports whether a path's extension-stripped basename appears in the per-language index list, resolving the language via [`base.languages.languageOf`](base.md#base.languages.languageOf) and returning false when no language matches. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [base.languages.languageOf](base.md#base.languages.languageOf)
    - fn [addCall](../../src/graph.ts#L1502) (fn: Fn, call: Call) → boolean <!-- internal -->
      <a id="map.graph.addCall"></a><br>Add a call unless an edge to the same target already says as much. Edges rank by what they prove: a plain call outside a closure (3) proves the path in every mode; a hook's default, a callable passed as an argument or a call in a closure passed as one (2) prove it in…
    - fn [holeReason](../../src/graph.ts#L1511) (c: CallFact) → string <!-- internal -->
      <a id="map.graph.holeReason"></a><br>Builds a human-readable explanation for why a call site could not be resolved to a concrete target, distinguishing hook-based calls, calls through `this`, and calls through local values. [`map.graph.buildGraph`](map.md#map.graph.buildGraph) uses the string to annotate unresolved edges. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [markEscapes](../../src/graph.ts#L1524) (modules: Map<string, Module>, readIds: ReadonlyMap<string, Escape>, readMembers: ReadonlyMap<string, Escape>, calledNames: ReadonlyMap<string, Escape>, members: Decls["members"]) → void <!-- internal -->
      <a id="map.graph.markEscapes"></a><br>Functions that code may reach without naming them in a call: read as a value (`later(save)` names the declaration `save` resolves to; `obj.save` any method `save`), called implicitly, or the constructor of a class read as a value (`extends A` runs `A`'s constructor). Names read…
      - calls [map.graph.foldCase](map.md#map.graph.foldCase), [base.languages.caselessNames](base.md#base.languages.caselessNames), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [base.languages.constructorName](base.md#base.languages.constructorName), [base.languages.implicitMember](base.md#base.languages.implicitMember)
    - fn [foldCase](../../src/graph.ts#L1546) (names: ReadonlyMap<string, Escape>) → Map<string, Escape> <!-- internal -->
      <a id="map.graph.foldCase"></a><br>Names keyed in ASCII lower case, each with the escape of its first spelling: what a language whose names compare without case looks up.
      - calls [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase)
    - fn [markOpaque](../../src/graph.ts#L1552) (m: Module) → void <!-- internal -->
      <a id="map.graph.markOpaque"></a><br>Sets a module's `members` field to the string `"opaque"`, then recurses into each entry of `m.children` so the whole subtree is marked the same way; used by [`map.graph.buildGraph`](map.md#map.graph.buildGraph). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Decls](../../src/graph.ts#L1558) <!-- internal -->
      <a id="map.graph.Decls"></a><br>Where each declaration went: several facts (overloads) may share one node.
    - fn [caselessIndex](../../src/graph.ts#L1572) (rows: readonly ExportRowInput[]) → Map<string, string[]> <!-- internal -->
      <a id="map.graph.caselessIndex"></a><br>Name in ASCII lower case → the names of the declarations an export table lists under it. A row that stands for no declaration (a PHP constant, which keeps its case) is left out.
      - calls [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase)
    - fn [memberKey](../../src/graph.ts#L1584) (member: string, isStatic: boolean, caseless = false) → string
      <a id="map.graph.memberKey"></a><br>Lookup key of a class member: `this.#m` in a static method is `static #m`. `caseless`: a language whose method names compare without ASCII case (PHP).
      - calls [base.config.layerName](base.md#base.config.layerName), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase)
    - fn [memberSegments](../../src/graph.ts#L1600) (members: readonly DeclFact[], caseless: boolean) → Map<DeclFact, { key: string; segment: string }> <!-- internal -->
      <a id="map.graph.memberSegments"></a><br>ID segments of class members. An instance member keeps its name; a static or `#private` member of the same name as another gets a suffix (`m-static`, `go-private`, `go-static-private`), which no JS name can collide with.
      - calls [map.graph.memberKey](map.md#map.graph.memberKey), [base.config.layerName](base.md#base.config.layerName)
    - fn [topSegments](../../src/graph.ts#L1629) (module: Module, files: readonly FileFacts[], warnings: string[]) → Map<DeclFact, string> <!-- internal -->
      <a id="map.graph.topSegments"></a><br>ID segments of a module's top-level declarations. One file's declarations of a name share a node (overloads, a class merged with its interface); the same name in another file of the module (`module: "dir"`, `x.ts` beside `x/index.ts`) is another symbol, whose segment gets `-2`…
      - calls [base.span.compareText](base.md#base.span.compareText), [base.config.layerName](base.md#base.config.layerName)
    - fn [addDecl](../../src/graph.ts#L1659) (module: Module, d: DeclFact, names: Map<string, string>, declModule: Map<string, Map<string, string>>, decls: Decls, stats: Stats, file: string, member?: { key: string; segment: string }) → void <!-- internal -->
      <a id="map.graph.addDecl"></a><br>Registers a declaration in a module as a function, type, or class node, recursing into class members. Overloads merge into the first function node, and a type yields to a same-named class or function. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
      - calls [base.config.layerName](base.md#base.config.layerName), [map.graph.memberSegments](map.md#map.graph.memberSegments), [base.languages.caselessNames](base.md#base.languages.caselessNames)
    - fn [placeFile](../../src/graph.ts#L1745) (config: Config, file: string) → { layer: string; segments: string[]; stem: string; glob: string | null } | null
      <a id="map.graph.placeFile"></a><br>Where `file` lands: its layer, module ID segments and path stem, and the layer glob that placed it (none for `outside`).
      - calls [base.config.isOutside](base.md#base.config.isOutside), [base.config.layerName](base.md#base.config.layerName), [base.glob.matchesGlob](base.md#base.glob.matchesGlob), [base.glob.globPrefix](base.md#base.glob.globPrefix), [base.languages.languageOf](base.md#base.languages.languageOf)
  - module [imports](../../src/imports.ts#L1)
    <a id="map.imports"></a><br>Import specifier → file. Relative paths with extension probing, the `paths`/`baseUrl` of the `tsconfig` (or `jsconfig`) that governs the importing file — the nearest one above it, with the configs a solution config `references` lending theirs to the files under them…
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - ts [extract.ts](extract.md#extract.ts)
    - languages [base.languages](base.md#base.languages)
    - exact-path [map.exact-path](map.md#map.exact-path)
    - glob [base.glob](base.md#base.glob)
    - cartridges [base.cartridges](base.md#base.cartridges)
    - type [Resolution](../../src/imports.ts#L37)
      <a id="map.imports.Resolution"></a><br>Classifies where an import specifier leads: an internal file (optionally via a workspace package, as the whole module, or a nested module), the importing file itself, an external package, a builtin, stdlib, generated, or unresolved. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
    - type [SourceResolver](../../src/imports.ts#L51)
      <a id="map.imports.SourceResolver"></a><br>Per-language contract for turning an import specifier into a `Resolution`, exposing the config files read (which feed the snapshot id) plus optional hooks for candidate paths and TypeScript `verbatimModuleSyntax`. _(llm · claude:claude-opus-5-5 · 2026-10-06)_
    - fn [assumedTarget](../../src/imports.ts#L77) (r: Resolution, wouldName: () => readonly string[], assumed: (path: string) => boolean) → string | null
      <a id="map.imports.assumedTarget"></a><br>The path an import names when `assumed` holds for it (`assume` in keylang.json): the file `r` resolved it to, or — when no file answers, as in a checkout without the generated or untracked file — a path the specifier would name with the usual extension candidates (`wouldName`…
      - calls [base.languages.languageOf](base.md#base.languages.languageOf)
    - type [PathRule](../../src/imports.ts#L87) <!-- internal -->
      <a id="map.imports.PathRule"></a><br>Pairs a module-specifier pattern with the list of filesystem targets it maps to, each already resolved relative to the repository root. Used by the import resolver to turn aliased specifiers into candidate paths. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - module [ImportResolver](../../src/imports.ts#L93)
      <a id="map.imports.ImportResolver"></a><br>Resolves import specifiers from project files to internal files, packages, or builtins via [`map.imports.ImportResolver.resolve`](map.md#map.imports.ImportResolver.resolve), reading tsconfig paths, package.json and node_modules, and records every config read as snapshot inputs. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
      - fn [constructor](../../src/imports.ts#L127) (root: string, sources: ReadonlySet<string> = new Set(), fs: ExactFs = nodeFs, options: { cartridgePath?: readonly string[] | null; sfcc?: boolean } = {})
        <a id="map.imports.ImportResolver.constructor"></a><br>Sets up a cached reader so each file is read once via [`map.imports.readText`](map.md#map.imports.readText) and [`map.imports.parseJsonc`](map.md#map.imports.parseJsonc), then loads baseUrl/paths through [`map.imports.loadTsconfig`](map.md#map.imports.loadTsconfig). Also collects package.json dependency names and workspaces. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
        - calls [map.imports.ImportResolver.cartridges](map.md#map.imports.ImportResolver.cartridges), [map.exact-path.exactExistence](map.md#map.exact-path.exactExistence), [map.imports.readText](map.md#map.imports.readText), [map.imports.parseJsonc](map.md#map.imports.parseJsonc), [map.imports.ImportResolver.governingConfig](map.md#map.imports.ImportResolver.governingConfig), [map.imports.dependencies](map.md#map.imports.dependencies), [map.imports.isObject](map.md#map.imports.isObject), [map.imports.pnpmWorkspacePackages](map.md#map.imports.pnpmWorkspacePackages)
      - fn [verbatimModuleSyntax](../../src/imports.ts#L168) (file: string) → boolean
        <a id="map.imports.ImportResolver.verbatimModuleSyntax"></a><br>Whether `compilerOptions.verbatimModuleSyntax` holds for `file`: in the tsconfig that governs it — the nearest `tsconfig.json` (else `jsconfig.json`) from its directory up to the root, through `extends` — or in a config that one `references`, since a solution config (Vite's…
        - calls [map.imports.ImportResolver.governingConfig](map.md#map.imports.ImportResolver.governingConfig), [map.imports.ImportResolver.verbatimSetting](map.md#map.imports.ImportResolver.verbatimSetting), [map.imports.isObject](map.md#map.imports.isObject), [base.config.toPosix](base.md#base.config.toPosix)
      - fn [optionsFor](../../src/imports.ts#L197) (fromFile: string) → Tsconfig <!-- internal -->
        <a id="map.imports.ImportResolver.optionsFor"></a><br>The `baseUrl`/`paths` that apply to `fromFile`: those of the tsconfig that governs it (`governingConfig`, the same one `verbatimModuleSyntax` reads) after its `extends` chain. A config without `paths` of its own that `references` projects (a solution config, Vite's `"files"…
        - calls [map.imports.ImportResolver.governingConfig](map.md#map.imports.ImportResolver.governingConfig), [map.imports.loadTsconfig](map.md#map.imports.loadTsconfig)
      - fn [governingConfig](../../src/imports.ts#L224) (dir: string) → string | null <!-- internal -->
        <a id="map.imports.ImportResolver.governingConfig"></a><br>The tsconfig (else jsconfig) of `dir` or the nearest directory above it, up to the root; null without one.
      - fn [verbatimSetting](../../src/imports.ts#L242) (file: string, depth: number) → boolean | "unset" | "unknown" <!-- internal -->
        <a id="map.imports.ImportResolver.verbatimSetting"></a><br>`verbatimModuleSyntax` as `file` sets it, its own option first, then its `extends` from the last (which tsc lets override the earlier ones). `unknown`: a config in the chain is missing, is no JSON object, is a package keylang does not find, or the chain is deeper than tsc would…
        - calls [map.imports.isObject](map.md#map.imports.isObject), [map.imports.ImportResolver.extendedConfig](map.md#map.imports.ImportResolver.extendedConfig)
      - fn [extendedConfig](../../src/imports.ts#L267) (dir: string, spec: string) → string | null <!-- internal -->
        <a id="map.imports.ImportResolver.extendedConfig"></a><br>The config file an `extends` entry of a config in `dir` names, as tsc finds it: a relative path (with `.json` added when the path itself is no file), or a package's config in a `node_modules` from `dir` up to the root — `<pkg>/<path>.json` as written or with `.json` added, the…
        - calls [base.config.toPosix](base.md#base.config.toPosix)
      - fn [locate](../../src/imports.ts#L292) (pkg: string) → Located <!-- internal -->
        <a id="map.imports.ImportResolver.locate"></a><br>Where `node_modules` at or above the root has the package: a link into the repository is a workspace package. Without an install, a `workspaces` entry of the root `package.json` or a `packages` entry of `pnpm-workspace.yaml` with that `name` is one too.
        - calls [map.imports.inside](map.md#map.imports.inside), [map.imports.ImportResolver.workspaceDirs](map.md#map.imports.ImportResolver.workspaceDirs)
      - fn [workspaceDirs](../../src/imports.ts#L325) () → string[] <!-- internal -->
        <a id="map.imports.ImportResolver.workspaceDirs"></a><br>Directories the workspace globs name (`packages/*`, `packages/**`, `apps/web`): root `workspaces` and pnpm `packages`, less what a `!pattern` takes out. Each listing is an input of the snapshot id.
        - calls [map.imports.workspaceGlob](map.md#map.imports.workspaceGlob), [map.imports.isGlob](map.md#map.imports.isGlob), [map.imports.listWorkspaceGlob](map.md#map.imports.listWorkspaceGlob), [map.imports.withoutNegated](map.md#map.imports.withoutNegated)
      - fn [packageEntry](../../src/imports.ts#L346) (dir: string, subpath: string) → string | null <!-- internal -->
        <a id="map.imports.ImportResolver.packageEntry"></a><br>The source file a workspace package names for `subpath` (`""`, `/util`): `exports` (a string, subpaths, `*` patterns, conditions), else `module`, `main`, `index`. A declaration file is not source.
        - calls [map.imports.flattenTarget](map.md#map.imports.flattenTarget), [map.imports.isObject](map.md#map.imports.isObject), [map.imports.matchPattern](map.md#map.imports.matchPattern), [map.imports.ImportResolver.probe](map.md#map.imports.ImportResolver.probe), [base.config.toPosix](base.md#base.config.toPosix)
      - fn [resolve](../../src/imports.ts#L376) (fromFile: string, spec: string) → Resolution
        <a id="map.imports.ImportResolver.resolve"></a><br>Resolves an import specifier from a given file, memoizing results per file-and-specifier pair and delegating cache misses to [`map.imports.ImportResolver.resolveUncached`](map.md#map.imports.ImportResolver.resolveUncached). _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
        - calls [map.imports.ImportResolver.resolveUncached](map.md#map.imports.ImportResolver.resolveUncached)
      - fn [cartridges](../../src/imports.ts#L390) () → CartridgeLayout | null
        <a id="map.imports.ImportResolver.cartridges"></a><br>The SFCC cartridges of the analysis, once: their order joins the snapshot id as an input, so a changed cartridge path changes edges on the next run.
        - calls [base.cartridges.cartridgeLayout](base.md#base.cartridges.cartridgeLayout)
      - fn [resolveUncached](../../src/imports.ts#L398) (fromFile: string, spec: string) → Resolution <!-- internal -->
        <a id="map.imports.ImportResolver.resolveUncached"></a><br>Classifies an import specifier as generated, internal file, builtin, or package: relative paths go through [`map.imports.ImportResolver.probe`](map.md#map.imports.ImportResolver.probe), `#` through [`map.imports.ImportResolver.resolveSubpathImport`](map.md#map.imports.ImportResolver.resolveSubpathImport). Others try [`map.imports.bestMatch`](map.md#map.imports.bestMatch) paths, then baseUrl… _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
        - calls [map.imports.ImportResolver.probe](map.md#map.imports.ImportResolver.probe), [map.imports.ImportResolver.cartridges](map.md#map.imports.ImportResolver.cartridges), [base.cartridges.cartridgeAnswers](base.md#base.cartridges.cartridgeAnswers), [map.imports.ImportResolver.resolveSubpathImport](map.md#map.imports.ImportResolver.resolveSubpathImport), [map.imports.ImportResolver.optionsFor](map.md#map.imports.ImportResolver.optionsFor), [map.imports.bestMatch](map.md#map.imports.bestMatch), [extract.ts.isNodeBuiltin](extract.md#extract.ts.isNodeBuiltin), [map.imports.ImportResolver.resolvePackage](map.md#map.imports.ImportResolver.resolvePackage)
      - fn [resolveSubpathImport](../../src/imports.ts#L434) (fromFile: string, spec: string) → Resolution <!-- internal -->
        <a id="map.imports.ImportResolver.resolveSubpathImport"></a><br>`#alias`: the `imports` of the nearest `package.json` above the importing file, as Node scopes them (an exact key, else the longest pattern prefix). A target that is not a relative path names a package.
        - calls [map.imports.ImportResolver.scopeImports](map.md#map.imports.ImportResolver.scopeImports), [map.imports.bestMatch](map.md#map.imports.bestMatch), [base.config.toPosix](base.md#base.config.toPosix), [map.imports.ImportResolver.resolve](map.md#map.imports.ImportResolver.resolve), [map.imports.ImportResolver.probe](map.md#map.imports.ImportResolver.probe)
      - fn [scopeImports](../../src/imports.ts#L457) (dir: string) → PathRule[] | null <!-- internal -->
        <a id="map.imports.ImportResolver.scopeImports"></a><br>`imports` of `<dir>/package.json`; an empty list when it has none, null without the file.
        - calls [map.imports.isObject](map.md#map.imports.isObject), [map.imports.flattenTarget](map.md#map.imports.flattenTarget)
      - fn [resolvePackage](../../src/imports.ts#L474) (fromFile: string, spec: string) → Resolution <!-- internal -->
        <a id="map.imports.ImportResolver.resolvePackage"></a><br>A bare specifier's package: a workspace package at the root (`locate`) names its file; one installed at or above the root is external; otherwise the `node_modules` and `package.json` on the way from the file up (`near`), then the root's declaration, decide — and a package…
        - calls [map.imports.packageName](map.md#map.imports.packageName), [map.imports.ImportResolver.locate](map.md#map.imports.ImportResolver.locate), [map.imports.ImportResolver.workspaceFile](map.md#map.imports.ImportResolver.workspaceFile), [map.imports.ImportResolver.near](map.md#map.imports.ImportResolver.near), [map.imports.ImportResolver.declaredDependency](map.md#map.imports.ImportResolver.declaredDependency)
      - fn [workspaceFile](../../src/imports.ts#L484) (dir: string, pkg: string, subpath: string) → Resolution <!-- internal -->
        <a id="map.imports.ImportResolver.workspaceFile"></a><br>The file a workspace package in `dir` names for `subpath`; unresolved without one (a `dist/` entry keylang does not index).
        - calls [map.imports.ImportResolver.packageEntry](map.md#map.imports.ImportResolver.packageEntry)
      - fn [near](../../src/imports.ts#L498) (fromFile: string, pkg: string, subpath: string) → Resolution | null <!-- internal -->
        <a id="map.imports.ImportResolver.near"></a><br>The package as Node finds it from `fromFile` up to (not including) the root: in the `node_modules` of a directory on the way — a link into the repository is a workspace package, as pnpm installs them next to the importing package rather than at the root — or declared by that…
        - calls [map.imports.inside](map.md#map.imports.inside), [map.imports.ImportResolver.workspaceFile](map.md#map.imports.ImportResolver.workspaceFile), [map.imports.dependencies](map.md#map.imports.dependencies), [map.imports.ImportResolver.declaredDependency](map.md#map.imports.ImportResolver.declaredDependency)
      - fn [declaredDependency](../../src/imports.ts#L526) (dir: string, declared: ReadonlyMap<string, string | null>, pkg: string, subpath: string) → Resolution | null <!-- internal -->
        <a id="map.imports.ImportResolver.declaredDependency"></a><br>What a `package.json` in `dir` (`""`: the root) says about `pkg` through its dependency fields: null when it does not declare it (nor its `@types`); external for a version range; for a `workspace:`, `file:`, `link:` or `portal:` range this repository's code (ADR 0010) — the…
        - calls [base.config.toPosix](base.md#base.config.toPosix), [map.imports.ImportResolver.workspaceFile](map.md#map.imports.ImportResolver.workspaceFile)
      - fn [probe](../../src/imports.ts#L540) (candidate: string) → string | null <!-- internal -->
        <a id="map.imports.ImportResolver.probe"></a><br>Candidate file (POSIX, relative to root) → existing source file, or null.
        - calls [map.imports.probeCandidates](map.md#map.imports.probeCandidates)
      - fn [wouldName](../../src/imports.ts#L558) (fromFile: string, spec: string) → string[]
        <a id="map.imports.ImportResolver.wouldName"></a><br>The paths a relative specifier, the `imports` of the nearest `package.json`, the most specific `paths` pattern or `baseUrl` would name, each with the candidates `probe` tries, whether they exist or not.
        - calls [map.imports.probeCandidates](map.md#map.imports.probeCandidates), [map.imports.ImportResolver.scopeImports](map.md#map.imports.ImportResolver.scopeImports), [map.imports.bestMatch](map.md#map.imports.bestMatch), [base.config.toPosix](base.md#base.config.toPosix), [map.imports.ImportResolver.optionsFor](map.md#map.imports.ImportResolver.optionsFor)
    - fn [probeCandidates](../../src/imports.ts#L593) (candidate: string) → string[]
      <a id="map.imports.probeCandidates"></a><br>The files a candidate path may be, in the order resolution tries them: as written, the NodeNext swaps (`./x.js` written for `./x.ts`, `.tsx` or `.jsx`; `./x.jsx` for `./x.tsx`), with each extension, then its index file. None for a path that leaves the root.
    - type [Located](../../src/imports.ts#L604) <!-- internal -->
      <a id="map.imports.Located"></a><br>Describes where an imported package was resolved: inside a workspace member at a given directory, in installed dependencies, or not found at all (`null`). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [inside](../../src/imports.ts#L607) (root: string, abs: string) → string | null
      <a id="map.imports.inside"></a><br>`abs` (after links) as a POSIX path under `root`, outside any `node_modules`; null otherwise.
      - calls [base.config.toPosix](base.md#base.config.toPosix)
    - fn [isObject](../../src/imports.ts#L622) (value: unknown) → value is Record<string, unknown> <!-- internal -->
      <a id="map.imports.isObject"></a><br>Type guard that returns true only for non-null, non-array object values, narrowing them to a string-keyed record. Used by the resolver and tsconfig loaders in [`map.imports`](map.md#map.imports) to validate parsed JSON before reading fields. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [dependencies](../../src/imports.ts#L630) (manifest: unknown) → Map<string, string | null> <!-- internal -->
      <a id="map.imports.dependencies"></a><br>The packages a manifest's dependency fields declare: name → range as written (null when it is no string); the first field that has a name wins.
      - calls [map.imports.isObject](map.md#map.imports.isObject)
    - fn [workspaceGlob](../../src/imports.ts#L641) (pattern: string) → string | null
      <a id="map.imports.workspaceGlob"></a><br>A workspace pattern (`packages/*`, `./apps/web/`) as a root-relative POSIX glob; null when it leaves the root.
      - calls [base.config.toPosix](base.md#base.config.toPosix)
    - fn [isGlob](../../src/imports.ts#L647) (glob: string) → boolean
      <a id="map.imports.isGlob"></a><br>Whether a workspace glob has a wildcard, so names its directories through a listing.
    - fn [listWorkspaceGlob](../../src/imports.ts#L658) (root: string, glob: string) → string
      <a id="map.imports.listWorkspaceGlob"></a><br>The directories a workspace glob names, root-relative, sorted and joined by newlines: `base/*` lists every subdirectory of `base`, as before; any other glob (`packages/**`, `packages/{libs,tools}/*`) walks the directories under its fixed prefix, never into `node_modules` or a…
      - calls [map.imports.isGlob](map.md#map.imports.isGlob), [base.glob.globToRegExp](base.md#base.glob.globToRegExp)
    - fn [withoutNegated](../../src/imports.ts#L688) (dirs: readonly string[], patterns: readonly unknown[]) → string[]
      <a id="map.imports.withoutNegated"></a><br>`dirs` without those a `!pattern` of `patterns` names (npm `workspaces` negation).
      - calls [map.imports.workspaceGlob](map.md#map.imports.workspaceGlob), [base.glob.globToRegExp](base.md#base.glob.globToRegExp)
    - fn [pnpmWorkspacePackages](../../src/imports.ts#L702) (text: string) → string[]
      <a id="map.imports.pnpmWorkspacePackages"></a><br>The `packages` globs of a `pnpm-workspace.yaml`: the block list under the key (items quoted or bare, a trailing `# comment` dropped) or an inline `[a, b]` list. An exclusion (`!**\/test/**`) names no directory.
    - fn [bestMatch](../../src/imports.ts#L730) (rules: readonly PathRule[], spec: string) → { rule: PathRule; star: string } | null <!-- internal -->
      <a id="map.imports.bestMatch"></a><br>The rule `tsc` (`matchPatternOrExact`) and Node (`PATTERN_KEY_COMPARE`) apply: an exact key, else the matching pattern with the longest prefix before `*` (then the longer key), else the first in the file. `star` is the text the `*` stands for.
      - calls [map.imports.matchPattern](map.md#map.imports.matchPattern)
    - fn [matchPattern](../../src/imports.ts#L742) (pattern: string, spec: string) → string | null <!-- internal -->
      <a id="map.imports.matchPattern"></a><br>Tests a module specifier against a single-wildcard glob (prefix`*`suffix), returning the text matched by the star, an empty string for an exact literal match, or null when it doesn't fit. Used by [`map.imports.ImportResolver.packageEntry`](map.md#map.imports.ImportResolver.packageEntry) and [`map.imports.bestMatch`](map.md#map.imports.bestMatch) to resolve… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [flattenTarget](../../src/imports.ts#L753) (t: unknown) → string[] <!-- internal -->
      <a id="map.imports.flattenTarget"></a><br>Recursively collapses a package.json `exports`/`imports` target—string, array, or conditional object—into a flat list of every string path it contains, dropping anything else. [`map.imports.ImportResolver.packageEntry`](map.md#map.imports.ImportResolver.packageEntry) and [`map.imports.ImportResolver.scopeImports`](map.md#map.imports.ImportResolver.scopeImports) use it to… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [packageName](../../src/imports.ts#L760) (spec: string) → string
      <a id="map.imports.packageName"></a><br>Extracts the bare package name from an import specifier, keeping the first path segment, or the first two when the specifier starts with `@` (a scoped package). Used by [`map.imports.ImportResolver.resolvePackage`](map.md#map.imports.ImportResolver.resolvePackage) to locate the package being imported. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [readJsonc](../../src/imports.ts#L766) (path: string) → unknown
      <a id="map.imports.readJsonc"></a><br>JSON with comments and trailing commas (tsconfig style).
      - calls [map.imports.readText](map.md#map.imports.readText), [map.imports.parseJsonc](map.md#map.imports.parseJsonc)
    - fn [parseJsonc](../../src/imports.ts#L772) (text: string) → unknown
      <a id="map.imports.parseJsonc"></a><br>The value of JSONC text; null when it does not parse.
      - calls [map.imports.stripJsonc](map.md#map.imports.stripJsonc)
    - fn [parseJsoncStrict](../../src/imports.ts#L781) (text: string) → unknown
      <a id="map.imports.parseJsoncStrict"></a><br>The value of JSONC text; throws the `JSON.parse` error when it does not parse.
      - calls [map.imports.stripJsonc](map.md#map.imports.stripJsonc)
    - fn [readText](../../src/imports.ts#L791) (path: string) → string | null <!-- internal -->
      <a id="map.imports.readText"></a><br>A file's text, or null when the path is no regular file (missing, or a directory, as `configs/base/` beside `configs/base.json` when `extends` names `./configs/base`) or cannot be read — tsc's `fileExists`, so an `extends` without `.json` falls back to `<path>.json` instead of…
    - fn [stripJsonc](../../src/imports.ts#L800) (source: string) → string <!-- internal -->
      <a id="map.imports.stripJsonc"></a><br>Remove a leading BOM, and comments and trailing commas outside of strings.
      - calls [base.config.withoutBom](base.md#base.config.withoutBom)
    - type [Tsconfig](../../src/imports.ts#L822) <!-- internal -->
      <a id="map.imports.Tsconfig"></a><br>Holds the resolved compiler options from a tsconfig that matter for import resolution: an optional base directory and a list of `PathRule` alias patterns used to rewrite module specifiers. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [LoadedTsconfig](../../src/imports.ts#L828) <!-- internal -->
      <a id="map.imports.LoadedTsconfig"></a><br>One config file as `optionsFor` combines it: its own options, and those of each project it `references` with that project's directory.
    - type [MergedOptions](../../src/imports.ts#L834) <!-- internal -->
      <a id="map.imports.MergedOptions"></a><br>Options of one config after its `extends` chain, before `paths` targets are placed.
    - fn [loadTsconfig](../../src/imports.ts#L850) (read: (file: string) => unknown, file: string) → LoadedTsconfig <!-- internal -->
      <a id="map.imports.loadTsconfig"></a><br>`compilerOptions.baseUrl`/`paths` of one config following relative `extends` chains. As in `tsc`, `paths` targets resolve against the `baseUrl` of the final options (a child config's `baseUrl` moves inherited `paths` too), or the directory of the config that declares them.
      - calls [map.imports.mergedOptions](map.md#map.imports.mergedOptions), [map.imports.placePaths](map.md#map.imports.placePaths), [map.imports.isObject](map.md#map.imports.isObject), [base.config.toPosix](base.md#base.config.toPosix)
    - fn [mergedOptions](../../src/imports.ts#L869) (read: (file: string) => unknown, file: string, depth: number) → MergedOptions <!-- internal -->
      <a id="map.imports.mergedOptions"></a><br>Resolves a tsconfig's effective `baseUrl` and `paths` by recursively following relative `extends` entries (up to depth 5, skipping package names and paths outside the tree), letting child settings override parents. Returned values are anchored to each config's directory, so… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [map.imports.isObject](map.md#map.imports.isObject), [base.config.toPosix](base.md#base.config.toPosix)
    - fn [placePaths](../../src/imports.ts#L888) (options: MergedOptions) → PathRule[] <!-- internal -->
      <a id="map.imports.placePaths"></a><br>Turns the tsconfig `paths` block into rules whose target entries are resolved to normalized POSIX paths under `baseUrl` (or the paths file's directory), dropping non-string targets. Uses [`base.config.toPosix`](base.md#base.config.toPosix) and feeds [`map.imports.loadTsconfig`](map.md#map.imports.loadTsconfig). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [base.config.toPosix](base.md#base.config.toPosix)
  - module [map](../../src/map.ts#L1)
    <a id="map.map"></a><br>`keylang map`: source files → facts → graph → map/*.md + .keylang/index.json.
    - node [external.node](external.md#external.node)
    - smol-toml [external.smol-toml](external.md#external.smol-toml)
    - brief [base.brief](base.md#base.brief)
    - config [base.config](base.md#base.config)
    - glob [base.glob](base.md#base.glob)
    - languages [base.languages](base.md#base.languages)
    - span [base.span](base.md#base.span)
    - facts [extract.facts](extract.md#extract.facts)
    - frontends [map.frontends](map.md#map.frontends)
    - emit [map.emit](map.md#map.emit)
    - explanations [map.explanations](map.md#map.explanations)
    - graph [map.graph](map.md#map.graph)
    - adapter [base.adapter](base.md#base.adapter)
    - fact-cache [map.fact-cache](map.md#map.fact-cache)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - entries [map.entries](map.md#map.entries)
    - framework-entries [map.framework-entries](map.md#map.framework-entries)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - type [MapResult](../../src/map.ts#L24)
      <a id="map.map.MapResult"></a><br>Bundles everything one map run produces: the `Graph`, generated map files and optional explanations keyed by file name, the `AnalysisSnapshot`, skip and fact-cache reuse counts, and the serialized fact cache text for the next run. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [generateMap](../../src/map.ts#L46) (config: Config, options: { persist?: boolean | "changed"; overlay?: ReadonlyMap<string, string>; adapters?: readonly FrameworkAdapter[] } = {}) → Promise<MapResult>
      <a id="map.map.generateMap"></a><br>`persist` prepares the fact cache for the next process: `true` always (`keylang map`, whose commit step writes it), `"changed"` only when the facts of this run differ from the cache on disk (an analysis that saves it best-effort); generation writes nothing. `overlay` gives…
      - calls [base.config.classifySources](base.md#base.config.classifySources), [base.config.toPosix](base.md#base.config.toPosix), [base.languages.languageOf](base.md#base.languages.languageOf), [base.config.isAnalysed](base.md#base.config.isAnalysed), [base.span.compareText](base.md#base.span.compareText), [map.map.readAnalysedSource](map.md#map.map.readAnalysedSource), [map.graph.placeFile](map.md#map.graph.placeFile), [map.snapshot.sha256](map.md#map.snapshot.sha256), [map.fact-cache.FactCache.open](map.md#map.fact-cache.FactCache.open), [map.map.extractorCode](map.md#map.map.extractorCode), [map.snapshot.grammarVersions](map.md#map.snapshot.grammarVersions), [map.frontends.frontendFor](map.md#map.frontends.frontendFor), [map.map.extractGuarded](map.md#map.map.extractGuarded), [map.map.readFrameworks](map.md#map.map.readFrameworks), [map.map.opaqueFacts](map.md#map.map.opaqueFacts), [map.graph.buildGraph](map.md#map.graph.buildGraph), [base.config.layerGlobWarnings](base.md#base.config.layerGlobWarnings), [map.map.readSource](map.md#map.map.readSource), [map.entries.collectEntries](map.md#map.entries.collectEntries), [map.framework-entries.frameworkEntries](map.md#map.framework-entries.frameworkEntries), [map.entries.compareEntries](map.md#map.entries.compareEntries), [map.snapshot.buildSnapshot](map.md#map.snapshot.buildSnapshot), [map.map.ownerSource](map.md#map.map.ownerSource), [map.map.readRepositoryDocs](map.md#map.map.readRepositoryDocs), [map.explanations.loadBriefs](map.md#map.explanations.loadBriefs), [map.emit.renderExplainedMap](map.md#map.emit.renderExplainedMap), [map.explanations.explanationOf](map.md#map.explanations.explanationOf), [map.emit.renderMap](map.md#map.emit.renderMap)
    - fn [readFrameworks](../../src/map.ts#L152) ( config: Config, sources: readonly string[], read: ReadonlyMap<string, { text: string; sha256: string }>, overlay: ReadonlyMap<string, string> | undefined, cache: FactCache, available: readonly FrameworkAdapter[] | undefined, ) → { inputs: FrameworkInput[]; manifest: FrameworkManifest[]; unread: { path: string; owner: string | null; reason: string; framework: string }[] } <!-- internal -->
      <a id="map.map.readFrameworks"></a><br>The config files of the framework adapters the repository uses, parsed (or reused from the fact cache by content), and what the manifest lists of them.
      - calls [map.map.readSource](map.md#map.map.readSource), [base.span.compareText](base.md#base.span.compareText), [base.config.isAnalysed](base.md#base.config.isAnalysed), [base.adapter.activeAdapters](base.md#base.adapter.activeAdapters), [map.snapshot.sha256](map.md#map.snapshot.sha256), [map.fact-cache.FactCache.config](map.md#map.fact-cache.FactCache.config)
    - fn [ownerSource](../../src/map.ts#L202) (config: Config, graph: Graph, owner: string | null) → { source?: string } <!-- internal -->
      <a id="map.map.ownerSource"></a><br>The module a config file of `owner`'s directory belongs to, for a hole of its own: the directory's module, or the module of a file in it when the directory is a whole layer (a rule's area holds that module, not the layer node).
      - calls [map.graph.directoryModule](map.md#map.graph.directoryModule), [base.span.compareText](base.md#base.span.compareText)
    - fn [readRepositoryDocs](../../src/map.ts#L218) (config: Config) → RepositoryDocs <!-- internal -->
      <a id="map.map.readRepositoryDocs"></a><br>What the repository writes about itself (ADR 0014, the system and container levels of C4): the root README or a root manifest, and the README in each layer's own directory. Read on every analysis, so an edit shows in the next map without touching `snapshotId`.
      - calls [base.glob.globDirectory](base.md#base.glob.globDirectory), [map.map.readReadme](map.md#map.map.readReadme), [base.brief.readmeBrief](base.md#base.brief.readmeBrief), [map.map.readSystemDoc](map.md#map.map.readSystemDoc)
    - fn [readSystemDoc](../../src/map.ts#L229) (root: string) → SystemDoc <!-- internal -->
      <a id="map.map.readSystemDoc"></a>
      - calls [map.map.manifestAbout](map.md#map.map.manifestAbout), [map.map.readSource](map.md#map.map.readSource), [map.map.readReadme](map.md#map.map.readReadme), [base.brief.readmeBrief](base.md#base.brief.readmeBrief), [base.brief.briefOf](base.md#base.brief.briefOf)
    - fn [readReadme](../../src/map.ts#L243) (root: string, dir: string) → { path: string; text: string } | null <!-- internal -->
      <a id="map.map.readReadme"></a><br>`README.md` in `dir` (relative, POSIX; "" for the root), its name in any case; null without one.
      - calls [base.span.compareText](base.md#base.span.compareText), [map.map.readSource](map.md#map.map.readSource)
    - fn [manifestAbout](../../src/map.ts#L265) (file: (typeof ROOT_MANIFESTS)[number], text: string | null) → { name: string | null; description: string | null } <!-- internal -->
      <a id="map.map.manifestAbout"></a><br>`name` and `description` of a root manifest: `package.json` and `composer.json` at the top, `[package]` (or `[workspace.package]`) of `Cargo.toml`, `[project]` of `pyproject.toml`. A manifest that does not parse gives neither: the analysis reports it where it reads the…
    - fn [opaqueFacts](../../src/map.ts#L294) (path: string) → FileFacts <!-- internal -->
      <a id="map.map.opaqueFacts"></a><br>Builds an empty `FileFacts` record for a path with completeness set to "opaque": no imports, declarations, exports, or references, and no parse error. [`map.map.extractGuarded`](map.md#map.map.extractGuarded) and [`map.map.generateMap`](map.md#map.map.generateMap) use it as the placeholder when a file cannot or should not be analyzed. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [readSource](../../src/map.ts#L299) (abs: string) → string | null <!-- internal -->
      <a id="map.map.readSource"></a><br>A file's text; null when it no longer exists.
    - fn [readAnalysedSource](../../src/map.ts#L309) (abs: string) → string | null | { unreadable: string } <!-- internal -->
      <a id="map.map.readAnalysedSource"></a><br>A source file's text as readSource, or the reason when keylang may not read it (EACCES/EPERM): a hole, not an I/O error.
      - calls [map.map.readSource](map.md#map.map.readSource)
    - fn [extractGuarded](../../src/map.ts#L324) (extract: (path: string, src: string) => Promise<FileFacts>, path: string, src: string) → Promise<FileFacts> <!-- internal -->
      <a id="map.map.extractGuarded"></a><br>Facts of one file; a file whose syntax nests deeper than the extractor's stack (thousands of `+` terms or parentheses) is opaque with a parse error, so one pathological file does not stop the whole analysis.
      - calls [map.map.opaqueFacts](map.md#map.map.opaqueFacts)
    - type [MapDiff](../../src/map.ts#L335)
      <a id="map.map.MapDiff"></a><br>Describes the result of comparing generated output against the target directory: paths of existing files the generator does not own, and paths of generated files that are missing, changed, or extra. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [targets](../../src/map.ts#L346) (config: Config, r: MapResult) → { dir: string; files: ReadonlyMap<string, string>; artifact: "map" | "explained" }[] <!-- internal -->
      <a id="map.map.targets"></a><br>Directories the generator owns and what they should hold: the map, and the explained map (empty when `explain.map` is off, so its generated files go).
    - type [ExtraGenerated](../../src/map.ts#L354) <!-- internal -->
      <a id="map.map.ExtraGenerated"></a><br>A generated file in a map directory that is not listed under its name.
    - fn [extraGenerated](../../src/map.ts#L367) (dir: string, files: ReadonlyMap<string, string>) → ExtraGenerated[] <!-- internal -->
      <a id="map.map.extraGenerated"></a><br>Generated files in `dir` that should not be there under their names.
      - calls [map.map.readOrNull](map.md#map.map.readOrNull), [map.emit.isGeneratedMap](map.md#map.emit.isGeneratedMap)
    - fn [mapConflicts](../../src/map.ts#L392) (config: Config, r: MapResult) → string[]
      <a id="map.map.mapConflicts"></a><br>Target files of both maps that exist and are not generated. Sorted.
      - calls [map.map.targets](map.md#map.map.targets), [map.emit.isGeneratedMap](map.md#map.emit.isGeneratedMap)
    - type [MapArtifact](../../src/map.ts#L404) = "map" | "explained" | "index" | "facts"
      <a id="map.map.MapArtifact"></a><br>What a step of the map's commit touches.
    - type [MapStep](../../src/map.ts#L407)
      <a id="map.map.MapStep"></a><br>One file step of `keylang map`: a path relative to the root, POSIX.
    - type [PlannedStep](../../src/map.ts#L413) extends MapStep <!-- internal -->
      <a id="map.map.PlannedStep"></a><br>Extends `MapStep` with the bytes a write step should produce and a precondition snapshot: the file's expected current content, null for absent, or undefined when no check applies. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [MapPlan](../../src/map.ts#L429)
      <a id="map.map.MapPlan"></a><br>What `keylang map` will do, computed before anything is written: the expected bytes of every target, the removals, and what the render was made from. Internal to one operation — not a stored format.
    - type [SourceInputs](../../src/map.ts#L441)
      <a id="map.map.SourceInputs"></a><br>What a snapshot was computed from: `keylang.json` and the source files. A change in either makes a plan built on it unfit.
    - type [MapInputs](../../src/map.ts#L449) extends SourceInputs <!-- internal -->
      <a id="map.map.MapInputs"></a><br>The inputs of the render: a change in any makes the plan unfit.
    - fn [sourceInputs](../../src/map.ts#L459) (config: Config, sources: readonly { path: string; sha256: string }[]) → SourceInputs
      <a id="map.map.sourceInputs"></a><br>The inputs of a snapshot: the `keylang.json` text the analysis parsed (not the disk now — a save made during the analysis must be caught at the commit, not become the base) and the snapshot's manifest.
    - fn [sourceInputProblems](../../src/map.ts#L468) (config: Config, inputs: SourceInputs, subject: string) → string[]
      <a id="map.map.sourceInputProblems"></a><br>How `keylang.json` and the source files differ from the ones `subject` was computed from (`path: reason` lines, empty when none does): a changed config, a source added, changed or removed since.
      - calls [map.map.readOrNull](map.md#map.map.readOrNull), [base.config.sourceTree](base.md#base.config.sourceTree), [map.snapshot.sha256](map.md#map.snapshot.sha256)
    - type [CommittedStep](../../src/map.ts#L487) extends MapStep
      <a id="map.map.CommittedStep"></a><br>A step after the commit: done, failed with the reason, or never tried.
    - type [MapCommit](../../src/map.ts#L492)
      <a id="map.map.MapCommit"></a><br>Result record of a map commit, holding the list of steps that were actually written plus a flag saying whether the run finished, failed, or was cancelled by a signal between steps. Cancelled runs keep whatever steps already landed. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [planMap](../../src/map.ts#L503) (config: Config, r: MapResult) → MapPlan
      <a id="map.map.planMap"></a><br>Plans both maps, the index and the fact cache: a write for every missing or changed generated file, a removal for every generated file of a layer that is gone (or of a map turned off). Reads the disk, writes nothing.
      - calls [base.config.toPosix](base.md#base.config.toPosix), [map.map.targets](map.md#map.map.targets), [map.map.extraGenerated](map.md#map.map.extraGenerated), [map.map.readOrNull](map.md#map.map.readOrNull), [map.map.mapConflicts](map.md#map.map.mapConflicts), [map.map.sourceInputs](map.md#map.map.sourceInputs), [map.map.briefsKey](map.md#map.map.briefsKey)
    - fn [mapPlanProblems](../../src/map.ts#L544) (plan: MapPlan) → string[]
      <a id="map.map.mapPlanProblems"></a><br>Why the plan may not be committed now, as `path: reason` lines; empty when it may. Every target must pass the repository's write rules (a plain path that stays inside the repository through links) and still hold the bytes the plan saw — a manual file created meanwhile included…
      - calls [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [map.map.sourceInputProblems](map.md#map.map.sourceInputProblems), [map.map.briefsKey](map.md#map.map.briefsKey)
    - fn [commitMap](../../src/map.ts#L563) (plan: MapPlan, options: { signal?: AbortSignal; onStep?: (step: MapStep) => void } = {}) → Promise<MapCommit>
      <a id="map.map.commitMap"></a><br>Runs the plan's steps in order, each an atomic write (the generator's exact bytes, the permissions of the file it replaces, links followed inside the repository) or a removal. The signal is checked between steps: the step under way finishes. `onStep` is told before each step…
      - calls [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic), [base.safe-write.landing](base.md#base.safe-write.landing)
    - fn [briefsKey](../../src/map.ts#L592) (config: Config) → string <!-- internal -->
      <a id="map.map.briefsKey"></a><br>A hash of the briefs the explained map reads.
      - calls [map.snapshot.sha256](map.md#map.snapshot.sha256), [map.explanations.loadBriefs](map.md#map.explanations.loadBriefs)
    - fn [readOrNull](../../src/map.ts#L597) (abs: string) → string | null <!-- internal -->
      <a id="map.map.readOrNull"></a><br>A file's text, or null when there is none.
    - fn [diffMap](../../src/map.ts#L606) (config: Config, r: MapResult) → MapDiff
      <a id="map.map.diffMap"></a><br>Compare both generated maps with the files on disk (`map --check`).
      - calls [map.map.mapConflicts](map.md#map.map.mapConflicts), [map.map.targets](map.md#map.map.targets), [map.map.readOrNull](map.md#map.map.readOrNull), [map.map.extraGenerated](map.md#map.map.extraGenerated)
    - fn [extractorCode](../../src/map.ts#L631) () → string <!-- internal -->
      <a id="map.map.extractorCode"></a><br>A hash of the extractor's own code. Facts cached by a changed extractor are stale even when nobody bumped `EXTRACTOR_VERSION`; in the package the same files are the built `.js`.
      - calls [map.snapshot.sha256](map.md#map.snapshot.sha256)
  - module [php-imports](../../src/php-imports.ts#L1)
    <a id="map.php-imports"></a><br>PHP qualified name → file. A PHP import names a declaration, not a file: `App\Domain\Order` is the class `Order` of the namespace `App\Domain` wherever it is declared, so the resolver looks names up among the declarations of the analysed files (`FileFacts.symbols`), the way…
    - node [external.node](external.md#external.node)
    - facts [extract.facts](extract.md#extract.facts)
    - imports [map.imports](map.md#map.imports)
    - languages [base.languages](base.md#base.languages)
    - module [PhpResolver](../../src/php-imports.ts#L32)
      <a id="map.php-imports.PhpResolver"></a>
      - fn [constructor](../../src/php-imports.ts#L44) (root: string, sources: ReadonlySet<string> = new Set(), files: readonly FileFacts[] = [])
        <a id="map.php-imports.PhpResolver.constructor"></a>
        - calls [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [map.php-imports.readText](map.md#map.php-imports.readText), [map.php-imports.packagePrefixes](map.md#map.php-imports.packagePrefixes)
      - fn [resolve](../../src/php-imports.ts#L66) (fromFile: string, spec: string) → Resolution
        <a id="map.php-imports.PhpResolver.resolve"></a>
        - calls [map.php-imports.PhpResolver.include](map.md#map.php-imports.PhpResolver.include), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase)
      - fn [include](../../src/php-imports.ts#L86) (fromFile: string, path: string) → Resolution <!-- internal -->
        <a id="map.php-imports.PhpResolver.include"></a><br>`include <path>`: an analysed file, a file on disk keylang does not index, or nothing; composer's own files are generated.
    - fn [packagePrefixes](../../src/php-imports.ts#L96) (text: string) → { prefix: string; name: string }[]
      <a id="map.php-imports.packagePrefixes"></a><br>Namespace prefixes of each package a composer lock or `installed.json` lists; none when it is no such JSON.
      - calls [map.php-imports.isRecord](map.md#map.php-imports.isRecord), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase)
    - fn [readText](../../src/php-imports.ts#L122) (abs: string) → string | null <!-- internal -->
      <a id="map.php-imports.readText"></a>
    - fn [isRecord](../../src/php-imports.ts#L130) (value: unknown) → value is Record<string, unknown> <!-- internal -->
      <a id="map.php-imports.isRecord"></a>
  - module [python-imports](../../src/python-imports.ts#L1)
    <a id="map.python-imports"></a><br>Python dotted path → file. `.m.x` starts at the importing file's package (one dot per level), `a.b.x` at a source root (the repository root, then `src/`). A module is `p.py` or the package `p/__init__.py`; the longest prefix of the path that is a module names the file, and when…
    - node [external.node](external.md#external.node)
    - imports [map.imports](map.md#map.imports)
    - exact-path [map.exact-path](map.md#map.exact-path)
    - python-stdlib [map.python-stdlib](map.md#map.python-stdlib)
    - module [PythonResolver](../../src/python-imports.ts#L22)
      <a id="map.python-imports.PythonResolver"></a><br>Maps Python import specs to repo files by trying `.py` modules and `__init__.py` packages across source roots or relative parent dirs, counting unsaved buffers as existing; unmatched imports become stdlib or external. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - fn [constructor](../../src/python-imports.ts#L35) (root: string, sources: ReadonlySet<string> = new Set(), fs: ExactFs = nodeFs)
        <a id="map.python-imports.PythonResolver.constructor"></a><br>Stores the project root and known source files, derives their containing directories via [`map.python-imports.directoriesOf`](map.md#map.python-imports.directoriesOf), and keeps only the candidate root dirs that exist on disk per [`map.python-imports.PythonResolver.isDir`](map.md#map.python-imports.PythonResolver.isDir). _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [map.exact-path.exactExistence](map.md#map.exact-path.exactExistence), [map.python-imports.directoriesOf](map.md#map.python-imports.directoriesOf), [map.python-imports.PythonResolver.isDir](map.md#map.python-imports.PythonResolver.isDir)
      - fn [resolve](../../src/python-imports.ts#L44) (fromFile: string, spec: string) → Resolution
        <a id="map.python-imports.PythonResolver.resolve"></a><br>Resolves a Python import spec from a file, walking parent dirs for relative imports or scanning source roots via [`map.python-imports.PythonResolver.longest`](map.md#map.python-imports.PythonResolver.longest); otherwise classifies it as stdlib or an external package. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
        - calls [map.python-imports.PythonResolver.longest](map.md#map.python-imports.PythonResolver.longest), [map.python-imports.PythonResolver.moduleFile](map.md#map.python-imports.PythonResolver.moduleFile), [map.python-imports.PythonResolver.hasPython](map.md#map.python-imports.PythonResolver.hasPython), [map.python-stdlib.isPythonStdlib](map.md#map.python-stdlib.isPythonStdlib)
      - fn [longest](../../src/python-imports.ts#L76) (base: string, segments: string[], fromFile: string, least: number) → Resolution | null <!-- internal -->
        <a id="map.python-imports.PythonResolver.longest"></a><br>The longest prefix of `segments` of at least `least` segments under `base` that is a module.
        - calls [map.python-imports.PythonResolver.moduleFile](map.md#map.python-imports.PythonResolver.moduleFile)
      - fn [moduleFile](../../src/python-imports.ts#L88) (path: string) → string | null <!-- internal -->
        <a id="map.python-imports.PythonResolver.moduleFile"></a><br>`a/b.py`, else the package `a/b/__init__.py`; null for neither.
      - fn [hasPython](../../src/python-imports.ts#L94) (path: string) → boolean <!-- internal -->
        <a id="map.python-imports.PythonResolver.hasPython"></a><br>A directory with a `.py` file in it or below: among the sources, or on disk (an excluded package).
        - calls [map.python-imports.PythonResolver.isDir](map.md#map.python-imports.PythonResolver.isDir)
      - fn [isDir](../../src/python-imports.ts#L113) (path: string) → boolean <!-- internal -->
        <a id="map.python-imports.PythonResolver.isDir"></a><br>Reports whether a repo-relative path is a package directory, answering true immediately if it is in the known source set and otherwise checking the filesystem under the root. Used by [`map.python-imports.PythonResolver.resolve`](map.md#map.python-imports.PythonResolver.resolve) to walk candidate module paths. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - fn [directoriesOf](../../src/python-imports.ts#L121) (files: ReadonlySet<string>) → Set<string> <!-- internal -->
      <a id="map.python-imports.directoriesOf"></a><br>Every directory above a file of `files` (POSIX, relative).
  - module [python-stdlib](../../src/python-stdlib.ts#L1)
    <a id="map.python-stdlib"></a><br>Top-level modules of the Python standard library: the union of `sys.stdlib_module_names` over CPython 3.10–3.14, copied from the generated `Python/stdlib_module_names.h` of each CPython branch (no npm package carries this list, and analysis never runs a Python interpreter). The…
    - fn [isPythonStdlib](../../src/python-stdlib.ts#L49) (name: string) → boolean
      <a id="map.python-stdlib.isPythonStdlib"></a><br>`name` (the first segment of a dotted import) is a module of the Python standard library.
  - module [rust-imports](../../src/rust-imports.ts#L1)
    <a id="map.rust-imports"></a><br>Rust path → file. A crate is a directory with `Cargo.toml` and `[package]`; each target — the library (`src/lib.rs` or `[lib] path`), and each binary (`src/main.rs`, `src/bin/*.rs`, `src/bin/*/main.rs`, `[[bin]] path`) — is a module tree of its own rooted at that file…
    - node [external.node](external.md#external.node)
    - smol-toml [external.smol-toml](external.md#external.smol-toml)
    - imports [map.imports](map.md#map.imports)
    - exact-path [map.exact-path](map.md#map.exact-path)
    - glob [base.glob](base.md#base.glob)
    - type [Crate](../../src/rust-imports.ts#L24) <!-- internal -->
      <a id="map.rust-imports.Crate"></a><br>Describes one Cargo package found while mapping Rust imports: its directory, the underscored name, the library root and binary roots, and a table mapping the identifiers code uses for dependencies to package names. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - module [RustResolver](../../src/rust-imports.ts#L37)
      <a id="map.rust-imports.RustResolver"></a><br>Resolves Rust `use` paths to project files or external packages using Cargo manifests, workspace members and module-file layout, via [`map.rust-imports.RustResolver.resolve`](map.md#map.rust-imports.RustResolver.resolve); it records manifests read in `inputs`. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - fn [constructor](../../src/rust-imports.ts#L51) (root: string, sources: ReadonlySet<string> = new Set(), fs: ExactFs = nodeFs)
        <a id="map.rust-imports.RustResolver.constructor"></a><br>Stores the repository root and known source files, then registers every named workspace member crate found via [`map.rust-imports.RustResolver.workspaceMembers`](map.md#map.rust-imports.RustResolver.workspaceMembers) and [`map.rust-imports.RustResolver.crateAt`](map.md#map.rust-imports.RustResolver.crateAt), plus the top-level crate, by crate name. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
        - calls [map.exact-path.exactExistence](map.md#map.exact-path.exactExistence)
      - fn [resolve](../../src/rust-imports.ts#L57) (fromFile: string, spec: string) → Resolution
        <a id="map.rust-imports.RustResolver.resolve"></a><br>Turns a `use` path from a Rust file into a resolution: toolchain names and `crate.deps` entries become external packages, `crate`/`self`/`super` and workspace members are anchored via [`map.rust-imports.RustResolver.rootOf`](map.md#map.rust-imports.RustResolver.rootOf) and [`map.rust-imports.modulePath`](map.md#map.rust-imports.modulePath), then the longest… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [map.rust-imports.RustResolver.crateOf](map.md#map.rust-imports.RustResolver.crateOf), [map.rust-imports.RustResolver.rootOf](map.md#map.rust-imports.RustResolver.rootOf), [map.rust-imports.modulePath](map.md#map.rust-imports.modulePath), [map.rust-imports.RustResolver.pathDependency](map.md#map.rust-imports.RustResolver.pathDependency), [map.rust-imports.RustResolver.membersOf](map.md#map.rust-imports.RustResolver.membersOf), [map.rust-imports.RustResolver.moduleFile](map.md#map.rust-imports.RustResolver.moduleFile), [map.rust-imports.RustResolver.declares](map.md#map.rust-imports.RustResolver.declares)
      - fn [moduleFile](../../src/rust-imports.ts#L116) (rootFile: string, path: string[]) → string | null <!-- internal -->
        <a id="map.rust-imports.RustResolver.moduleFile"></a><br>The file of a module path under a target root, or null: `a/b.rs`, `a/b/mod.rs`, the root itself for `[]`.
      - fn [rootOf](../../src/rust-imports.ts#L127) (crate: Crate, file: string) → string | null <!-- internal -->
        <a id="map.rust-imports.RustResolver.rootOf"></a><br>The target root whose module tree holds `file`; null for a file outside all of them (`build.rs`).
        - calls [map.rust-imports.modulePath](map.md#map.rust-imports.modulePath), [map.rust-imports.RustResolver.declares](map.md#map.rust-imports.RustResolver.declares)
      - fn [declares](../../src/rust-imports.ts#L153) (file: string, name: string, inline = false) → boolean <!-- internal -->
        <a id="map.rust-imports.RustResolver.declares"></a><br>The file declares `mod <name>` (only an inline `mod <name> { … }` with `inline`). A text scan: the resolver does not parse sources.
      - fn [crateOf](../../src/rust-imports.ts#L165) (file: string) → Crate | null <!-- internal -->
        <a id="map.rust-imports.RustResolver.crateOf"></a><br>Walks up the directory chain from a file's parent to the repository root, returning the first crate [`map.rust-imports.RustResolver.crateAt`](map.md#map.rust-imports.RustResolver.crateAt) reports for a directory, or null if none matches. Used by [`map.rust-imports.RustResolver.resolve`](map.md#map.rust-imports.RustResolver.resolve) to find the crate a source file belongs… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [map.rust-imports.RustResolver.crateAt](map.md#map.rust-imports.RustResolver.crateAt)
      - fn [crateAt](../../src/rust-imports.ts#L174) (dir: string) → Crate | null <!-- internal -->
        <a id="map.rust-imports.RustResolver.crateAt"></a><br>Builds a cached crate record for a directory by parsing its Cargo.toml via [`map.rust-imports.RustResolver.readToml`](map.md#map.rust-imports.RustResolver.readToml): normalized package name, dependency aliases (including target-specific tables), the lib entry path, and discovered binary entry points. Returns null and caches… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [map.rust-imports.RustResolver.manifestAt](map.md#map.rust-imports.RustResolver.manifestAt), [map.rust-imports.isObject](map.md#map.rust-imports.isObject), [map.rust-imports.insideRoot](map.md#map.rust-imports.insideRoot)
      - fn [pathDependency](../../src/rust-imports.ts#L214) (crate: Crate, name: string) → Crate | null <!-- internal -->
        <a id="map.rust-imports.RustResolver.pathDependency"></a><br>The crate a `path` dependency named `name` in code points at, when it is inside the repository; null otherwise.
        - calls [map.rust-imports.RustResolver.crateAt](map.md#map.rust-imports.RustResolver.crateAt)
      - fn [membersOf](../../src/rust-imports.ts#L224) (crate: Crate) → Map<string, Crate> <!-- internal -->
        <a id="map.rust-imports.RustResolver.membersOf"></a><br>The members of the crate's workspace by name, as Cargo finds it: the nearest `Cargo.toml` with `[workspace]` from the crate's directory up to the analysis root, its `members` expanded relative to that manifest's directory, plus the root package itself; a crate under no…
        - calls [map.rust-imports.RustResolver.manifestAt](map.md#map.rust-imports.RustResolver.manifestAt), [map.rust-imports.isObject](map.md#map.rust-imports.isObject), [map.rust-imports.RustResolver.workspaceMembers](map.md#map.rust-imports.RustResolver.workspaceMembers), [map.rust-imports.RustResolver.crateAt](map.md#map.rust-imports.RustResolver.crateAt)
      - fn [workspaceMembers](../../src/rust-imports.ts#L247) (dir: string) → string[] <!-- internal -->
        <a id="map.rust-imports.RustResolver.workspaceMembers"></a><br>`[workspace] members` of the manifest in `dir`, root-relative, globs expanded one directory level at a time.
        - calls [map.rust-imports.RustResolver.manifestAt](map.md#map.rust-imports.RustResolver.manifestAt), [map.rust-imports.isObject](map.md#map.rust-imports.isObject), [map.rust-imports.insideRoot](map.md#map.rust-imports.insideRoot), [base.glob.globToRegExp](base.md#base.glob.globToRegExp), [map.rust-imports.readdirNames](map.md#map.rust-imports.readdirNames)
      - fn [manifestAt](../../src/rust-imports.ts#L271) (dir: string) → Record<string, unknown> | null <!-- internal -->
        <a id="map.rust-imports.RustResolver.manifestAt"></a><br>The parsed `Cargo.toml` of a directory (root-relative, "" for the root), read once; null without one.
        - calls [map.rust-imports.RustResolver.readToml](map.md#map.rust-imports.RustResolver.readToml)
      - fn [readToml](../../src/rust-imports.ts#L279) (file: string) → Record<string, unknown> | null <!-- internal -->
        <a id="map.rust-imports.RustResolver.readToml"></a><br>Reads a TOML file relative to the resolver root, recording its text (or null if absent) in the inputs map for fingerprinting, and returns the parsed table. Throws with the file name if the TOML is malformed; serves [`map.rust-imports.RustResolver.crateAt`](map.md#map.rust-imports.RustResolver.crateAt) and… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - fn [modulePath](../../src/rust-imports.ts#L296) (rootFile: string, file: string) → string[] <!-- internal -->
      <a id="map.rust-imports.modulePath"></a><br>Module path of a file under a target root: `src/a/b.rs` → `[a, b]`, `src/a/mod.rs` → `[a]`, the root → `[]`.
    - fn [insideRoot](../../src/rust-imports.ts#L305) (dir: string) → string | null <!-- internal -->
      <a id="map.rust-imports.insideRoot"></a><br>A normalized root-relative directory when it stays inside the repository ("" for the root); null when it leaves it.
    - fn [readdirNames](../../src/rust-imports.ts#L310) (abs: string) → string[] <!-- internal -->
      <a id="map.rust-imports.readdirNames"></a><br>Lists the names of the immediate subdirectories of a path, synchronously, excluding files and sorted alphabetically. [`map.rust-imports.RustResolver.workspaceMembers`](map.md#map.rust-imports.RustResolver.workspaceMembers) uses it to expand Cargo workspace member entries. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [isObject](../../src/rust-imports.ts#L314) (value: unknown) → value is Record<string, unknown> <!-- internal -->
      <a id="map.rust-imports.isObject"></a><br>Type guard that returns true only for non-null, non-array object values, narrowing them to a string-keyed record. Used by [`map.rust-imports.RustResolver.crateAt`](map.md#map.rust-imports.RustResolver.crateAt) and [`map.rust-imports.RustResolver.workspaceMembers`](map.md#map.rust-imports.RustResolver.workspaceMembers) to validate parsed Cargo.toml tables before reading fields. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
  - module [snapshot](../../src/snapshot.ts#L1)
    <a id="map.snapshot"></a><br>Analysis snapshot: the versioned fact store written to `.keylang/index.json`. Markdown maps are a projection of the graph; `check` in later tickets reads this file. `generated` is wall-clock metadata and is not part of `snapshotId`.
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - exports [map.exports](map.md#map.exports)
    - brief [base.brief](base.md#base.brief)
    - glob [base.glob](base.md#base.glob)
    - graph [map.graph](map.md#map.graph)
    - languages [base.languages](base.md#base.languages)
    - scc [check.scc](check.md#check.scc)
    - type [Resolution](../../src/snapshot.ts#L22) = "resolved" | "ambiguous" | "unresolved"
      <a id="map.snapshot.Resolution"></a><br>A string union naming the three outcomes of resolving a reference in the map snapshot: a single target found, several candidates competing, or no target at all. Used as a tag on snapshot entries to record how each lookup fared. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Provenance](../../src/snapshot.ts#L29) = "syntactic" | "docblock"
      <a id="map.snapshot.Provenance"></a><br>`syntactic`: a fact of the code the language runs. `docblock`: a fact written only in a documentation comment the language does not check (PHP `@var Foo` above an untyped property, `@param Foo $x`): static analysers trust it, and so does keylang, naming it in the verdict.
    - type [EdgeKind](../../src/snapshot.ts#L30) = "import" | "call" | "type" | "reexport"
      <a id="map.snapshot.EdgeKind"></a><br>Defines the closed set of string tags a snapshot edge can carry: one of four values marking whether the edge records an import, a call, a type reference, or a re-export between two nodes. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [SnapshotEdge](../../src/snapshot.ts#L32)
      <a id="map.snapshot.SnapshotEdge"></a><br>A reference edge in the snapshot: kind, source, resolved target or ambiguous candidates, exact source span and text, resolution and provenance, plus flags for hook-default/injected calls, closures and type-only imports. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
    - type [SnapshotExport](../../src/snapshot.ts#L94)
      <a id="map.snapshot.SnapshotExport"></a><br>Describes one public name a module exports in the snapshot: the node it resolves to through aliases and re-export chains (or null), its kind, and how it is exported (alias, default, re-export from another module, or namespace). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [CoverageItem](../../src/snapshot.ts#L123)
      <a id="map.snapshot.CoverageItem"></a><br>A coverage entry pinning a source span (file, start/end line and column, text) with a reason and optional source; its kind is a gap kind or marks a skipped file, a file placed outside, or an assumed import. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
    - fn [leavesUnresolved](../../src/snapshot.ts#L144) (item: Pick<CoverageItem, "kind">) → boolean
      <a id="map.snapshot.leavesUnresolved"></a><br>A coverage entry that leaves something unresolved: every kind but `assumed-import`, an import of a file `assume` lists, which names no node on purpose and so can hide no edge.
    - type [SnapshotNode](../../src/snapshot.ts#L148)
      <a id="map.snapshot.SnapshotNode"></a><br>Shape of one entry in the serialized map: kind, layer, source span, signature and flags, plus dependency, call, fingerprint and closure fields. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - type [Interception](../../src/snapshot.ts#L194)
      <a id="map.snapshot.Interception"></a><br>A plugin method that wraps a fn, from a framework config.
    - type [FrameworkManifest](../../src/snapshot.ts#L206)
      <a id="map.snapshot.FrameworkManifest"></a><br>A framework adapter that read the repository, with the config files it read: inputs of `snapshotId`.
    - type [SystemDoc](../../src/snapshot.ts#L216)
      <a id="map.snapshot.SystemDoc"></a><br>What the repository says about itself: the system level of C4. A node of the explained map and the zoom screen, never an ID of the language (ADR 0014).
    - type [RepositoryDocs](../../src/snapshot.ts#L226)
      <a id="map.snapshot.RepositoryDocs"></a><br>Text the repository writes about itself and its layers, read at the edge (`map.ts`).
    - type [EntryKind](../../src/snapshot.ts#L234) = (typeof ENTRY_KINDS)[number]
      <a id="map.snapshot.EntryKind"></a>
    - fn [isEntryKind](../../src/snapshot.ts#L236) (value: string) → value is EntryKind
      <a id="map.snapshot.isEntryKind"></a>
    - type [EntryPoint](../../src/snapshot.ts#L245)
      <a id="map.snapshot.EntryPoint"></a><br>An entry point: a fn (or a module's top level) execution starts from, as the code or a manifest writes it. A fact, not an edge: nothing calls it from inside the repository.
    - type [AnalysisSnapshot](../../src/snapshot.ts#L264)
      <a id="map.snapshot.AnalysisSnapshot"></a><br>A versioned, serialisable record of one analysis run: extractor, grammars, config and file hashes, plus the resulting nodes, edges, exports, coverage and stats. It also carries the repo description, which is kept out of its ID. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
    - fn [sha256](../../src/snapshot.ts#L302) (text: string) → string
      <a id="map.snapshot.sha256"></a><br>Hashes the given text with SHA-256 and returns the hex digest. Used across the codebase as the single content-fingerprinting primitive, e.g. by [`map.snapshot.buildSnapshot`](map.md#map.snapshot.buildSnapshot) and `operations.operations.hashOrNull`. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [buildSnapshot](../../src/snapshot.ts#L306) ( graph: Graph, config: Config, files: readonly { path: string; sha256: string }[], /** Files (or an unreadable directory) left out; `source`: the ID scope they belong to when no module has the file. */ skipped: readonly { file: string; reason: string; source?: string; kind?: "skipped-file" | "outside-file"; text?: string }[], docs: RepositoryDocs = { system: { name: null, brief: null, source: null }, layers: new Map() }, /** The entry points and the manifests they were read from (path → text or null), which `snapshotId` covers like the sources. */ entries: { list: readonly EntryPoint[]; inputs: readonly (readonly [string, string | null])[] } = { list: [], inputs: [] }, /** Framework adapters in use and their config files, which `snapshotId` covers like the sources. */ frameworks: readonly FrameworkManifest[] = [], ) → AnalysisSnapshot
      <a id="map.snapshot.buildSnapshot"></a><br>Converts the analyzed graph into a sorted snapshot of layer/module/fn/type nodes with reverse links, resolved and unresolved edges, and coverage gaps, keyed by a hash of config, files and grammars; [`map.snapshot.closures`](map.md#map.snapshot.closures) finishes it. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [map.snapshot.grammarVersions](map.md#map.snapshot.grammarVersions), [map.snapshot.sha256](map.md#map.snapshot.sha256), [map.snapshot.docBrief](map.md#map.snapshot.docBrief), [map.snapshot.readsImportedValue](map.md#map.snapshot.readsImportedValue), [map.snapshot.indexDoc](map.md#map.snapshot.indexDoc), [base.glob.globDirectory](base.md#base.glob.globDirectory), [map.snapshot.compareCoverage](map.md#map.snapshot.compareCoverage), [map.snapshot.closures](map.md#map.snapshot.closures), [map.snapshot.exportRow](map.md#map.snapshot.exportRow)
    - fn [closures](../../src/snapshot.ts#L545) (nodes: Record<string, SnapshotNode>, coverage: readonly CoverageItem[], readsImported: ReadonlySet<string>) → void <!-- internal -->
      <a id="map.snapshot.closures"></a><br>`closure` of every fn and type, bottom-up over strongly connected components of the call graph: a component hashes its members' own fingerprints with the closures it calls outside itself, so a cycle terminates and every member of it changes together.
      - calls [base.languages.constructorName](base.md#base.languages.constructorName), [check.scc.components](check.md#check.scc.components), [map.snapshot.sha256](map.md#map.snapshot.sha256)
    - fn [readsImportedValue](../../src/snapshot.ts#L595) (print: string) → boolean <!-- internal -->
      <a id="map.snapshot.readsImportedValue"></a><br>Whether an extractor fingerprint marks a declaration that reads a value imported from another file of the repository: it ends with `+` (`READS_IMPORTED_VALUE` of `extract/treesitter.ts`, never a hex digit; overloads join with `:`, so any part may carry it).
    - fn [docBrief](../../src/snapshot.ts#L599) (doc: string | null | undefined) → string | null <!-- internal -->
      <a id="map.snapshot.docBrief"></a><br>Returns null for an empty, null, or undefined doc string; otherwise hands the text to [`base.brief.briefOf`](base.md#base.brief.briefOf) and returns its result. Used by [`map.snapshot.buildSnapshot`](map.md#map.snapshot.buildSnapshot) to produce short summaries for the snapshot. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [base.brief.briefOf](base.md#base.brief.briefOf)
    - fn [indexDoc](../../src/snapshot.ts#L608) (modules: readonly Module[], dir: string | null) → string | null <!-- internal -->
      <a id="map.snapshot.indexDoc"></a><br>The doc comment of the index module right in a layer's own directory (`src/tui/index.ts`, `mod.rs`, `__init__.py`: the index names of its language), as a brief.
      - calls [base.languages.languageOf](base.md#base.languages.languageOf), [map.snapshot.docBrief](map.md#map.snapshot.docBrief)
    - fn [exportRow](../../src/snapshot.ts#L620) (entry: ExportEntry) → SnapshotExport <!-- internal -->
      <a id="map.snapshot.exportRow"></a><br>A row of the graph's export table, with its fields in a fixed order.
    - fn [compareCoverage](../../src/snapshot.ts#L633) (a: CoverageItem, b: CoverageItem) → number <!-- internal -->
      <a id="map.snapshot.compareCoverage"></a><br>Orders two coverage entries for stable sorting: first by file path via [`map.snapshot.cmp`](map.md#map.snapshot.cmp), then numerically by line, then by kind, and finally by reason, returning the first nonzero comparison. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [map.snapshot.cmp](map.md#map.snapshot.cmp)
    - fn [cmp](../../src/snapshot.ts#L637) (a: string, b: string) → number <!-- internal -->
      <a id="map.snapshot.cmp"></a><br>Compares two strings by plain lexical ordering and returns -1, 1, or 0, giving [`map.snapshot.compareCoverage`](map.md#map.snapshot.compareCoverage) a stable tiebreaker when it sorts coverage items. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [grammarVersions](../../src/snapshot.ts#L651) () → Record<string, string>
      <a id="map.snapshot.grammarVersions"></a><br>What parses the code, in `snapshotId` and the fact-cache key: the web-tree-sitter runtime as Node resolves it, and the grammars as the extractor loads them — from `dist/wasm` in the package, whose version prepack writes beside them, else from the installed…
      - calls [map.snapshot.installedVersion](map.md#map.snapshot.installedVersion), [map.snapshot.bundledGrammarsVersion](map.md#map.snapshot.bundledGrammarsVersion)
    - fn [bundledGrammarsVersion](../../src/snapshot.ts#L662) () → string | null <!-- internal -->
      <a id="map.snapshot.bundledGrammarsVersion"></a><br>The version prepack recorded beside the grammars in `dist/wasm`; null in a checkout.
      - calls [map.snapshot.readJson](map.md#map.snapshot.readJson)
    - fn [installedVersion](../../src/snapshot.ts#L673) (name: string, resolve: () => string) → string | null <!-- internal -->
      <a id="map.snapshot.installedVersion"></a><br>The version in the nearest `package.json` of that name above the file `resolve` finds: a package's `exports` may not list `./package.json` (web-tree-sitter does not), so reading it by name fails. Null when the package is not installed.
      - calls [map.snapshot.readJson](map.md#map.snapshot.readJson)
    - fn [readJson](../../src/snapshot.ts#L689) (file: string) → Record<string, unknown> | null <!-- internal -->
      <a id="map.snapshot.readJson"></a>
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
    - type [TracePlan](../../src/trace-plan.ts#L19)
      <a id="map.trace-plan.TracePlan"></a><br>Describes the data handed to an editor adapter for one flow: the snapshot it came from and an ID-sorted list of symbols with file, line, column, and the SHA-256 of the file as indexed. The hash lets an adapter skip files that changed since the snapshot. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [tracePlan](../../src/trace-plan.ts#L32) (config: Config, flow: string) → Promise<{ plan: TracePlan; index: AnalysisSnapshot; omitted: string[] }>
      <a id="map.trace-plan.tracePlan"></a><br>The plan of `flow` on a fresh snapshot of the saved code. `omitted` are the flow's `trigger`/`step` IDs that are no function of that snapshot (a module, a type, an unknown ID, a file outside it): no adapter instruments them.
      - calls [map.trace-plan.flowSymbols](map.md#map.trace-plan.flowSymbols), [map.map.generateMap](map.md#map.map.generateMap), [map.trace-plan.planOf](map.md#map.trace-plan.planOf)
    - fn [entryTracePlan](../../src/trace-plan.ts#L45) (config: Config, entry: string, flow?: string) → Promise<{ plan: TracePlan; index: AnalysisSnapshot; omitted: string[] }>
      <a id="map.trace-plan.entryTracePlan"></a><br>The plan of the entry point `entry` (a fn of a fresh snapshot): every fn reachable from it (`reachableFrom`). `flow` names the runs it records; by default the entry's last segment. A request or a process names its own flow at run time (`X-Keylang-Flow`, `KEYLANG_FLOW`).
      - calls [map.map.generateMap](map.md#map.map.generateMap), [map.trace-plan.planOf](map.md#map.trace-plan.planOf), [map.trace-plan.reachableFrom](map.md#map.trace-plan.reachableFrom)
    - fn [reachableFrom](../../src/trace-plan.ts#L59) (index: AnalysisSnapshot, entry: string) → Set<string>
      <a id="map.trace-plan.reachableFrom"></a><br>The fns `entry` may run: the closure over resolved calls. A reached fn with a call keylang did not resolve (a call through a value, a dynamic member) widens it, since a trace is there to see where such a call goes: every fn whose name is the called name, and every fn read as a…
    - fn [planOf](../../src/trace-plan.ts#L116) (index: AnalysisSnapshot, flow: string, wanted: ReadonlySet<string>) → { plan: TracePlan; index: AnalysisSnapshot; omitted: string[] } <!-- internal -->
      <a id="map.trace-plan.planOf"></a>
    - fn [tracePlanText](../../src/trace-plan.ts#L133) (plan: TracePlan) → string
      <a id="map.trace-plan.tracePlanText"></a><br>What `keylang trace-plan` prints and an adapter reads: the plan as indented JSON and a newline.
    - fn [flowSymbols](../../src/trace-plan.ts#L138) (root: string, dir: string, flow: string) → Set<string> | null
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
      <a id="map.wire-gen.generateWire"></a><br>Emits the source of a `wire()` module: sorted imports resolved via [`check.wiring.wireImport`](check.md#check.wiring.wireImport), then memoized async builders in the dependency order from [`check.wiring.wireOrder`](check.md#check.wiring.wireOrder). The generated function tracks `dispose()` methods and releases everything newest first on completion… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
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
      - calls [map.wire-gen.compilerOptions](map.md#map.wire-gen.compilerOptions), [map.wire-gen.moduleResolution](map.md#map.wire-gen.moduleResolution)
    - fn [moduleResolution](../../src/wire-gen.ts#L204) (options: Record<string, unknown>) → string <!-- internal -->
      <a id="map.wire-gen.moduleResolution"></a><br>The module resolution tsc uses: the explicit one, else the one `module` implies (node16/node18/node20 → node16, nodenext → nodenext).
    - fn [compilerOptions](../../src/wire-gen.ts#L211) (file: string, depth: number) → Record<string, unknown> <!-- internal -->
      <a id="map.wire-gen.compilerOptions"></a><br>`compilerOptions` of a tsconfig over those of its relative `extends`; package configs are not read.
      - calls [map.imports.readJsonc](map.md#map.imports.readJsonc)
    - fn [specifier](../../src/wire-gen.ts#L226) (out: string, file: string, ext: "ts" | "js" | "none") → string <!-- internal -->
      <a id="map.wire-gen.specifier"></a><br>Builds a relative import path from the output file to `file`, forcing a `./` prefix, then rewrites its extension per the `ext` mode: kept for `ts`, mapped through `RUNTIME_EXTENSION` for `js`, or stripped for TS/JS sources under `none`. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
