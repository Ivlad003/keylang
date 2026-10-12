<!-- keylang:generated — не редагувати, `keylang map` -->

[README](README.md) · modules: [analyze](#map.analyze) · [bpmn-export](#map.bpmn-export) · [c4-export](#map.c4-export) · [declared-packages](#map.declared-packages) · [diagram-layout](#map.diagram-layout) · [diagram](#map.diagram) · [drawio](#map.drawio) · [emit](#map.emit) · [entries](#map.entries) · [exact-path](#map.exact-path) · [explanations](#map.explanations) · [exports](#map.exports) · [fact-cache](#map.fact-cache) · [index](#map.index) · [laravel](#map.laravel) · [php](#map.php) · [react-router](#map.react-router) · [symfony](#map.symfony) · [web-entries](#map.web-entries) · [framework-entries](#map.framework-entries) · [frontends](#map.frontends) · [graph](#map.graph) · [imports](#map.imports) · [map](#map.map) · [php-imports](#map.php-imports) · [python-imports](#map.python-imports) · [python-stdlib](#map.python-stdlib) · [python-web-entries](#map.python-web-entries) · [rust-imports](#map.rust-imports) · [schema-discover](#map.schema-discover) · [snapshot](#map.snapshot) · [system-discover](#map.system-discover) · [trace-plan](#map.trace-plan) · [wire-gen](#map.wire-gen)

# map

- map
  <a id="map"></a><br>Turns source files into language-agnostic facts and a dependency graph via per-language import resolvers ([`map.frontends`](map.md#map.frontends)), then writes the snapshot ([`map.snapshot`](map.md#map.snapshot)), generated maps ([`map.emit`](map.md#map.emit)) and C4 or wiring outputs. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
  - module [analyze](../../src/analyze.ts#L1)
    <a id="map.analyze"></a><br>One analysis for the CLI and the language server: config, a fresh snapshot, spec documents, and their assessment. Generated map files are replaced by the map rendered from the fresh snapshot, so IDs resolve against current code, not a stale committed map.
    - node [external.node](external.md#external.node)
    - assess [check.assess](check.md#check.assess)
    - config [base.config](base.md#base.config)
    - declared-packages [map.declared-packages](map.md#map.declared-packages)
    - diagram-layout [map.diagram-layout](map.md#map.diagram-layout)
    - span [base.span](base.md#base.span)
    - files [lang.files](lang.md#lang.files)
    - ir [lang.ir](lang.md#lang.ir)
    - fact-cache [map.fact-cache](map.md#map.fact-cache)
    - map [map.map](map.md#map.map)
    - parser [lang.parser](lang.md#lang.parser)
    - migration [check.migration](check.md#check.migration)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - test-report [check.test-report](check.md#check.test-report)
    - trace-evidence [check.trace-evidence](check.md#check.trace-evidence)
    - type [AnalysisRequest](../../src/analyze.ts#L28)
      <a id="map.analyze.AnalysisRequest"></a><br>What to analyse and how: the root, which specs, unsaved buffers and which optional parts to skip.
    - type [Analysis](../../src/analyze.ts#L64) extends Assessment
      <a id="map.analyze.Analysis"></a><br>One analysis: the assessment plus the config, map, snapshot and parsed documents it came from.
    - fn [analyze](../../src/analyze.ts#L79) (request: AnalysisRequest) → Promise<Analysis>
      <a id="map.analyze.analyze"></a><br>Run config → snapshot → parse specs → assess for one repository; reads files, writes only the fact cache when asked.
      - calls [base.config.loadConfig](base.md#base.config.loadConfig), [base.config.toPosix](base.md#base.config.toPosix), [map.fact-cache.keepsFactCache](map.md#map.fact-cache.keepsFactCache), [map.map.generateMap](map.md#map.map.generateMap), [map.fact-cache.saveFactCache](map.md#map.fact-cache.saveFactCache), [map.analyze.readingAid](map.md#map.analyze.readingAid), [lang.files.collectMdFiles](lang.md#lang.files.collectMdFiles), [lang.files.walkReaches](lang.md#lang.files.walkReaches), [lang.parser.parse](lang.md#lang.parser.parse), [map.analyze.within](map.md#map.analyze.within), [map.analyze.parseRenderedMap](map.md#map.analyze.parseRenderedMap), [base.span.compareText](base.md#base.span.compareText), [base.config.evidenceFiles](base.md#base.config.evidenceFiles), [base.config.resolveStatic](base.md#base.config.resolveStatic), [map.declared-packages.readManifests](map.md#map.declared-packages.readManifests), [map.analyze.oldSnapshotFor](map.md#map.analyze.oldSnapshotFor), [check.test-report.loadReports](check.md#check.test-report.loadReports), [check.trace-evidence.loadTraces](check.md#check.trace-evidence.loadTraces), [map.analyze.repositoryFile](map.md#map.analyze.repositoryFile), [check.assess.assess](check.md#check.assess.assess)
    - fn [oldSnapshotFor](../../src/analyze.ts#L173) (root: string, from: string) → Promise<OldSnapshot>
      <a id="map.analyze.oldSnapshotFor"></a><br>The nodes of the old stack of a migration (`migration.from` of keylang.json, relative to the root; business-flows/27): an index file, or the old checkout analysed read-only — no fact cache, its own `migration.from` unread. An unreadable one is a state, never a thrown error: the…
      - calls [map.analyze.analyze](map.md#map.analyze.analyze), [check.migration.readOldIndex](check.md#check.migration.readOldIndex)
    - fn [parseRenderedMap](../../src/analyze.ts#L217) (path: string, text: string) → Document <!-- internal -->
      <a id="map.analyze.parseRenderedMap"></a>
      - calls [lang.parser.parse](lang.md#lang.parser.parse)
    - fn [findRoot](../../src/analyze.ts#L230) (start: string) → string
      <a id="map.analyze.findRoot"></a><br>Walk up from `start` to the directory that holds `keylang.json`; `start` when there is none.
    - fn [repositoryFile](../../src/analyze.ts#L244) (root: string, path: string) → boolean <!-- internal -->
      <a id="map.analyze.repositoryFile"></a><br>`path` (relative to the root, as a flow's `test` writes it) is a file inside the repository.
      - calls [map.analyze.within](map.md#map.analyze.within)
    - fn [readingAid](../../src/analyze.ts#L258) (specDir: string, abs: string) → boolean
      <a id="map.analyze.readingAid"></a><br>A generated reading aid beside the specs (the explained map, explanations, discovered flows, the project tour, diagram layouts): never a spec.
      - calls [map.analyze.within](map.md#map.analyze.within)
    - fn [specPathProblem](../../src/analyze.ts#L267) (config: Config, abs: string) → string | null
      <a id="map.analyze.specPathProblem"></a><br>Why `check` does not read `abs` as a spec, or null when it does: a `.md` file the walk of the spec directory reaches (no hidden directory, `node_modules` or `target` on the way) outside the reading aids.
      - calls [map.analyze.within](map.md#map.analyze.within), [lang.files.walkReaches](lang.md#lang.files.walkReaches), [map.analyze.readingAid](map.md#map.analyze.readingAid)
    - fn [within](../../src/analyze.ts#L282) (abs: string, dir: string) → boolean
      <a id="map.analyze.within"></a><br>Whether `abs` is `dir` or lies inside it (path-based, links are not followed).
  - module [bpmn-export](../../src/bpmn-export.ts#L1)
    <a id="map.bpmn-export"></a><br>BPMN 2.0 of a diagram (business-flows/28): the picture `/diagrams` draws (`diagramOf` + `layout`), as XML with its BPMNDI so Camunda Modeler or bpmn.io opens it as drawn. The mapping is the table «Відображення в BPMN» of ADR 0023: a layer is a lane of the one pool, a trigger a…
    - diagram [map.diagram](map.md#map.diagram)
    - external-ids [base.external-ids](base.md#base.external-ids)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - fn [xmlEscape](../../src/bpmn-export.ts#L41) (text: string) → string
      <a id="map.bpmn-export.xmlEscape"></a><br>Text in an XML attribute or element.
    - fn [ids](../../src/bpmn-export.ts#L46) () → (key: string) => string <!-- internal -->
      <a id="map.bpmn-export.ids"></a><br>NCName ids for the document: distinct even where two keys map to one.
    - type [StartKind](../../src/bpmn-export.ts#L67) = "message" | "timer" | "signal" | null <!-- internal -->
      <a id="map.bpmn-export.StartKind"></a><br>The BPMN start event a trigger becomes; null: a plain (none) start event.
    - fn [startKindOf](../../src/bpmn-export.ts#L70) (kind: string | null | undefined) → StartKind
      <a id="map.bpmn-export.startKindOf"></a><br>The start event of an entry point's kind (ADR 0023): a request or a message waits for a message, cron for a timer, an observer or `trigger event` for a signal.
    - type [FlowFacts](../../src/bpmn-export.ts#L81) <!-- internal -->
      <a id="map.bpmn-export.FlowFacts"></a><br>What the diagram does not keep of a flow: the kind of each trigger (by node id) and the flows it continues.
    - fn [flowFacts](../../src/bpmn-export.ts#L88) (input: DiagramInput) → FlowFacts <!-- internal -->
      <a id="map.bpmn-export.flowFacts"></a><br>The trigger kinds and `continues` targets of the drawn flow; empty for other views.
      - calls [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow)
    - type [Box](../../src/bpmn-export.ts#L110) <!-- internal -->
      <a id="map.bpmn-export.Box"></a><br>A rectangle in diagram coordinates, px.
    - type [SequenceFlow](../../src/bpmn-export.ts#L118) <!-- internal -->
      <a id="map.bpmn-export.SequenceFlow"></a><br>An edge between two shapes inside the pool.
    - type [MessageFlow](../../src/bpmn-export.ts#L127) <!-- internal -->
      <a id="map.bpmn-export.MessageFlow"></a><br>An edge between a shape and a collapsed pool, with both boxes for its waypoints.
    - fn [route](../../src/bpmn-export.ts#L137) (from: Box, to: Box) → [number, number][] <!-- internal -->
      <a id="map.bpmn-export.route"></a><br>Waypoints from one box to another: out of the right side, across, into the left side; down or up when the target is not to the right.
    - fn [renderBpmn](../../src/bpmn-export.ts#L165) (input: DiagramInput, name: string) → string
      <a id="map.bpmn-export.renderBpmn"></a><br>The BPMN of a view: `flow` (and a discovered flow, drawn as a flow), `process` and `entry`. Throws on `layers` (no process to show) and on an empty diagram, with the reason the diagram gives.
      - calls [map.diagram.diagramOf](map.md#map.diagram.diagramOf), [map.bpmn-export.bpmnOf](map.md#map.bpmn-export.bpmnOf)
    - fn [bpmnOf](../../src/bpmn-export.ts#L175) (diagram: Diagram, input: DiagramInput, name: string) → string <!-- internal -->
      <a id="map.bpmn-export.bpmnOf"></a><br>The BPMN XML of a laid-out diagram: semantic model first, then the BPMNDI shapes and edges.
      - calls [map.bpmn-export.ids](map.md#map.bpmn-export.ids), [map.bpmn-export.flowFacts](map.md#map.bpmn-export.flowFacts), [map.bpmn-export.xmlEscape](map.md#map.bpmn-export.xmlEscape), [map.bpmn-export.flowNode](map.md#map.bpmn-export.flowNode), [map.bpmn-export.route](map.md#map.bpmn-export.route)
    - fn [flowNode](../../src/bpmn-export.ts#L377) (node: DiagramNode, element: string, attrs: string, entryKind: string | null, signals: ReadonlyMap<string, string>, diagram: Diagram, id: (key: string) => string) → string[] <!-- internal -->
      <a id="map.bpmn-export.flowNode"></a><br>The semantic element of one shape in the pool.
      - calls [map.bpmn-export.xmlEscape](map.md#map.bpmn-export.xmlEscape), [map.bpmn-export.startKindOf](map.md#map.bpmn-export.startKindOf)
  - module [c4-export](../../src/c4-export.ts#L1)
    <a id="map.c4-export"></a><br>C4 diagrams of the snapshot (.scratch/c4-zoom/issues/12): a view of the map for the tools that draw C4 (ADR 0014), in C4-PlantUML or Mermaid. A layer is a boundary, not a container: in C4 a container is an application or a store that runs on its own, and a layer of one program…
    - explanations [map.explanations](map.md#map.explanations)
    - graph [map.graph](map.md#map.graph)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - span [base.span](base.md#base.span)
    - type [C4Format](../../src/c4-export.ts#L20) = (typeof C4_FORMATS)[number]
      <a id="map.c4-export.C4Format"></a><br>One C4 output language.
    - type [C4Level](../../src/c4-export.ts#L26) = (typeof C4_LEVELS)[number]
      <a id="map.c4-export.C4Level"></a><br>One C4 zoom level.
    - type [C4Request](../../src/c4-export.ts#L29)
      <a id="map.c4-export.C4Request"></a><br>What to draw: format, level and, for `component`, an optional single layer.
    - fn [c4Marker](../../src/c4-export.ts#L40) (format: C4Format) → string
      <a id="map.c4-export.c4Marker"></a><br>The first line of a written diagram: `export c4 --out` replaces only a file that starts with it.
    - fn [isC4Diagram](../../src/c4-export.ts#L45) (text: string) → boolean
      <a id="map.c4-export.isC4Diagram"></a><br>The text is a diagram `export c4` wrote: its first non-empty line is the marker of either format.
      - calls [map.c4-export.c4Marker](map.md#map.c4-export.c4Marker)
    - fn [quoted](../../src/c4-export.ts#L53) (text: string) → string <!-- internal -->
      <a id="map.c4-export.quoted"></a><br>Text in the double quotes of a C4 macro: one line, its double quotes made single.
    - fn [aliases](../../src/c4-export.ts#L58) () → (id: string) => string <!-- internal -->
      <a id="map.c4-export.aliases"></a><br>Aliases a diagram can use for IDs: letters, digits and `_`, distinct even where two IDs map to one.
    - type [Rel](../../src/c4-export.ts#L79) <!-- internal -->
      <a id="map.c4-export.Rel"></a><br>Edges between two drawn units, by kind.
    - fn [relLabel](../../src/c4-export.ts#L86) (rel: Rel) → string <!-- internal -->
      <a id="map.c4-export.relLabel"></a><br>`call ×3, import ×1`: the kinds of the edges a relation sums up, by name.
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [renderC4](../../src/c4-export.ts#L106) (snapshot: AnalysisSnapshot, brief: (id: string) => string | null, request: C4Request) → string
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
    - json [base.json](base.md#base.json)
    - span [base.span](base.md#base.span)
    - type [DependencyField](../../src/declared-packages.ts#L41)
      <a id="map.declared-packages.DependencyField"></a><br>A manifest field a package is declared in.
    - type [Declaration](../../src/declared-packages.ts#L50)
      <a id="map.declared-packages.Declaration"></a><br>Where one package is declared, and its version range as written (null when the manifest gives none).
    - type [DeclaredPackage](../../src/declared-packages.ts#L58)
      <a id="map.declared-packages.DeclaredPackage"></a><br>A package a repository declares, with its `external.<segment>` id.
    - type [Add](../../src/declared-packages.ts#L70) <!-- internal -->
      <a id="map.declared-packages.Add"></a><br>Function type for a callback that records one declared dependency: the package name, the manifest file it came from, which dependency field listed it, and its version range (or null when none is given). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [ManifestRead](../../src/declared-packages.ts#L73)
      <a id="map.declared-packages.ManifestRead"></a><br>The declared packages and every file read for them (null: absent).
    - fn [readManifests](../../src/declared-packages.ts#L85) (config: Config, files: readonly string[], known: ReadonlyMap<string, string | null> = new Map()) → ManifestRead
      <a id="map.declared-packages.readManifests"></a><br>The packages declared by the manifests at the root and on the ancestors of `files` (root-relative), sorted by id; their ids cover only these names. `known` holds files a resolver already read (text, or null for absent), so a manifest is parsed from the same text that went into…
      - calls [map.declared-packages.readInput](map.md#map.declared-packages.readInput), [map.declared-packages.cargoWorkspaces](map.md#map.declared-packages.cargoWorkspaces), [map.declared-packages.typesTarget](map.md#map.declared-packages.typesTarget), [base.span.compareText](base.md#base.span.compareText), [map.declared-packages.manifestDirs](map.md#map.declared-packages.manifestDirs), [base.config.isAnalysed](base.md#base.config.isAnalysed), [map.declared-packages.addPackages](map.md#map.declared-packages.addPackages), [map.declared-packages.addCrates](map.md#map.declared-packages.addCrates), [map.declared-packages.addComposer](map.md#map.declared-packages.addComposer), [map.imports.listWorkspaceGlob](map.md#map.imports.listWorkspaceGlob), [map.declared-packages.workspaceNames](map.md#map.declared-packages.workspaceNames), [map.declared-packages.composerPathNames](map.md#map.declared-packages.composerPathNames), [map.declared-packages.linkedPackages](map.md#map.declared-packages.linkedPackages), [base.external-ids.assignExternalIds](base.md#base.external-ids.assignExternalIds), [map.declared-packages.ecosystemOf](map.md#map.declared-packages.ecosystemOf)
    - fn [ecosystemOf](../../src/declared-packages.ts#L167) (declarations: readonly Declaration[]) → DeclaredPackage["ecosystem"] <!-- internal -->
      <a id="map.declared-packages.ecosystemOf"></a><br>npm when a `package.json` declares the package, else composer for a `composer.json`, else Cargo.
    - fn [manifestDirs](../../src/declared-packages.ts#L174) (files: readonly string[]) → Set<string> <!-- internal -->
      <a id="map.declared-packages.manifestDirs"></a><br>The root (`""`) and every directory between a file and the root.
      - calls [base.config.toPosix](base.md#base.config.toPosix)
    - fn [typesTarget](../../src/declared-packages.ts#L189) (name: string) → string <!-- internal -->
      <a id="map.declared-packages.typesTarget"></a><br>`@types/x` → `x`, `@types/scope__pkg` → `@scope/pkg`; any other name is itself.
    - fn [workspaceNames](../../src/declared-packages.ts#L204) (read: (rel: string) => string | null, list: (rel: string) => string | null) → Set<string> <!-- internal -->
      <a id="map.declared-packages.workspaceNames"></a><br>Names of the packages in the directories the root `workspaces` or the `packages` of `pnpm-workspace.yaml` name (`packages/*`, `apps/web`), read as the import resolver reads them: the same input keys and texts, and a member manifest that does not parse names none. Any glob…
      - calls [map.declared-packages.jsoncValue](map.md#map.declared-packages.jsoncValue), [base.json.isJsonObject](base.md#base.json.isJsonObject), [map.imports.pnpmWorkspacePackages](map.md#map.imports.pnpmWorkspacePackages), [map.declared-packages.workspaceDirs](map.md#map.declared-packages.workspaceDirs), [map.imports.withoutNegated](map.md#map.imports.withoutNegated), [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [linkedPackages](../../src/declared-packages.ts#L230) (root: string, declared: ReadonlyMap<string, readonly Declaration[]>, inputs: Map<string, string | null>) → Set<string> <!-- internal -->
      <a id="map.declared-packages.linkedPackages"></a><br>npm packages a declaring manifest's directory, or one above it, has in `node_modules` as a link into the repository (`npm link`, a workspace, pnpm next to the package): the resolver reads such an entry as a workspace package. Each entry looked at is an input, keyed as the…
      - calls [map.imports.inside](map.md#map.imports.inside)
    - fn [cargoWorkspaces](../../src/declared-packages.ts#L269) (read: (rel: string) => string | null) → CargoWorkspaces <!-- internal -->
      <a id="map.declared-packages.cargoWorkspaces"></a><br>Cargo workspaces as `src/rust-imports.ts` reads them: the nearest `Cargo.toml` with `[workspace]` from a crate's directory up to the root. A dependency is local when its `path`, or the `path` of the `[workspace.dependencies]` entry it inherits (`workspace = true`), stays inside…
      - calls [map.declared-packages.tomlOrNull](map.md#map.declared-packages.tomlOrNull), [map.declared-packages.isTomlTable](map.md#map.declared-packages.isTomlTable), [base.config.toPosix](base.md#base.config.toPosix), [map.declared-packages.isTomlString](map.md#map.declared-packages.isTomlString), [map.declared-packages.cargoMemberDirs](map.md#map.declared-packages.cargoMemberDirs)
    - type [CargoWorkspaces](../../src/declared-packages.ts#L342) <!-- internal -->
      <a id="map.declared-packages.CargoWorkspaces"></a><br>What `readManifests` asks of the Cargo workspaces around the crates it reads.
    - type [CargoWorkspace](../../src/declared-packages.ts#L349) <!-- internal -->
      <a id="map.declared-packages.CargoWorkspace"></a><br>The nearest `Cargo.toml` with `[workspace]`: its directory and that table.
    - fn [cargoMemberDirs](../../src/declared-packages.ts#L355) (workspace: string, member: string, list: (rel: string) => string | null) → string[] <!-- internal -->
      <a id="map.declared-packages.cargoMemberDirs"></a><br>Directories one `[workspace] members` entry names, root-relative; a glob in the last segment is expanded, as the resolver does.
      - calls [base.config.toPosix](base.md#base.config.toPosix), [base.glob.globToRegExp](base.md#base.glob.globToRegExp)
    - fn [composerPathNames](../../src/declared-packages.ts#L376) (read: (rel: string) => string | null, list: (rel: string) => string | null) → Set<string> <!-- internal -->
      <a id="map.declared-packages.composerPathNames"></a><br>Names of the packages in the root `composer.json`'s `path` repositories (`packages/*`, `modules/billing`): this repository's code, not external.
      - calls [map.declared-packages.jsonOrNull](map.md#map.declared-packages.jsonOrNull), [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString), [map.declared-packages.workspaceDirs](map.md#map.declared-packages.workspaceDirs)
    - fn [workspaceDirs](../../src/declared-packages.ts#L401) (pattern: string, list: (rel: string) => string | null) → string[] <!-- internal -->
      <a id="map.declared-packages.workspaceDirs"></a><br>Directories one `workspaces` entry names, through the same listing as `src/imports.ts` (`listWorkspaceGlob`).
      - calls [map.imports.workspaceGlob](map.md#map.imports.workspaceGlob), [map.imports.isGlob](map.md#map.imports.isGlob)
    - fn [readInput](../../src/declared-packages.ts#L413) (abs: string, rel: string) → string | null <!-- internal -->
      <a id="map.declared-packages.readInput"></a><br>A file's text, null when there is none.
      - calls [map.declared-packages.isFile](map.md#map.declared-packages.isFile), [map.declared-packages.readText](map.md#map.declared-packages.readText)
    - fn [isFile](../../src/declared-packages.ts#L418) (abs: string) → boolean <!-- internal -->
      <a id="map.declared-packages.isFile"></a><br>Whether `abs` exists and is a regular file.
    - fn [readText](../../src/declared-packages.ts#L431) (path: string, rel: string) → string <!-- internal -->
      <a id="map.declared-packages.readText"></a><br>The file is there but cannot be read. That is not the same error as invalid contents.
      - calls [base.config.withoutBom](base.md#base.config.withoutBom)
    - fn [jsonOrNull](../../src/declared-packages.ts#L441) (text: string) → JsonValue <!-- internal -->
      <a id="map.declared-packages.jsonOrNull"></a><br>A JSON document's value, null when the text does not parse.
      - calls [base.json.parseJson](base.md#base.json.parseJson), [base.config.withoutBom](base.md#base.config.withoutBom)
    - fn [jsoncValue](../../src/declared-packages.ts#L450) (text: string) → JsonValue <!-- internal -->
      <a id="map.declared-packages.jsoncValue"></a><br>A JSONC document's value, null when the text does not parse.
      - calls [map.imports.parseJsonc](map.md#map.imports.parseJsonc)
    - fn [tomlOrNull](../../src/declared-packages.ts#L455) (text: string) → TomlTable | null <!-- internal -->
      <a id="map.declared-packages.tomlOrNull"></a><br>A TOML document's root table, null when the text does not parse.
      - calls [base.config.withoutBom](base.md#base.config.withoutBom)
    - fn [isTomlTable](../../src/declared-packages.ts#L464) (value: TomlValue | undefined) → value is TomlTable <!-- internal -->
      <a id="map.declared-packages.isTomlTable"></a><br>A TOML table: not a scalar, an array or a date.
    - fn [isTomlString](../../src/declared-packages.ts#L469) (value: TomlValue | undefined) → value is string <!-- internal -->
      <a id="map.declared-packages.isTomlString"></a><br>A TOML string value.
    - fn [table](../../src/declared-packages.ts#L474) (rel: string, field: string, value: Value | undefined, kind: "object" | "table", isTable: (value: Value) => value is Table) → Table | undefined <!-- internal -->
      <a id="map.declared-packages.table"></a><br>The manifest field `value` as an object (JSON) or table (TOML); undefined when the field is absent.
    - fn [addPackages](../../src/declared-packages.ts#L483) (rel: string, text: string, add: Add) → void <!-- internal -->
      <a id="map.declared-packages.addPackages"></a><br>`dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`. Not `node_modules`.
      - calls [map.imports.parseJsoncStrict](map.md#map.imports.parseJsoncStrict), [base.json.isJsonObject](base.md#base.json.isJsonObject), [map.declared-packages.table](map.md#map.declared-packages.table), [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [addCrates](../../src/declared-packages.ts#L504) (rel: string, text: string, add: Add, local: (key: string, dep: TomlValue) => boolean) → void <!-- internal -->
      <a id="map.declared-packages.addCrates"></a><br>`[dependencies]`, `[dev-dependencies]`, `[build-dependencies]`, and the same under `[target.*]`; `local` ones are left out.
      - calls [base.config.withoutBom](base.md#base.config.withoutBom), [map.declared-packages.isTomlTable](map.md#map.declared-packages.isTomlTable), [map.declared-packages.table](map.md#map.declared-packages.table), [map.declared-packages.crateTables](map.md#map.declared-packages.crateTables), [map.declared-packages.isTomlString](map.md#map.declared-packages.isTomlString)
    - fn [addComposer](../../src/declared-packages.ts#L537) (rel: string, text: string, add: Add) → void <!-- internal -->
      <a id="map.declared-packages.addComposer"></a><br>`require` and `require-dev` of a `composer.json`, without PHP and its extensions.
      - calls [base.json.parseJson](base.md#base.json.parseJson), [base.config.withoutBom](base.md#base.config.withoutBom), [base.json.isJsonObject](base.md#base.json.isJsonObject), [map.declared-packages.table](map.md#map.declared-packages.table), [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [crateTables](../../src/declared-packages.ts#L558) (rel: string, source: TomlTable, prefix: string) → [DependencyField, TomlTable][] <!-- internal -->
      <a id="map.declared-packages.crateTables"></a><br>The dependency tables of a Cargo manifest (or a `[target.*]` table), validated, in field order.
      - calls [map.declared-packages.isTomlTable](map.md#map.declared-packages.isTomlTable), [map.declared-packages.table](map.md#map.declared-packages.table)
  - module [diagram-layout](../../src/diagram-layout.ts#L1)
    <a id="map.diagram-layout"></a><br>The layout file of a diagram view (business-flows/24, ADR 0024): `<dir>/diagrams/<view>.layout.json`, committed so a team sees the same picture. It keeps what a person gave the shapes of a view in the editor of `keylang web` — places, sizes, the bends of lines, colours and…
    - node [external.node](external.md#external.node)
    - json [base.json](base.md#base.json)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - span [base.span](base.md#base.span)
    - type [LayoutShape](../../src/diagram-layout.ts#L38)
      <a id="map.diagram-layout.LayoutShape"></a><br>One shape of a layout file: its box in model coordinates and what the editor keeps beside it.
    - type [LayoutEdge](../../src/diagram-layout.ts#L56)
      <a id="map.diagram-layout.LayoutEdge"></a><br>The bends of one line, in model coordinates.
    - type [LayoutFile](../../src/diagram-layout.ts#L61)
      <a id="map.diagram-layout.LayoutFile"></a><br>A whole layout file: format, view, and shapes and lines by stable key.
    - type [ClientEntry](../../src/diagram-layout.ts#L75)
      <a id="map.diagram-layout.ClientEntry"></a><br>The layout as the editor of the page holds it: by the key of a shape on its canvas (a diagram node's id such as `step:6`, `lane:<layer>`, an edge's `edge:<from>-><to>`, a drawn shape's `draft:3`). A drawn shape and a drawn edge say what they are (`id`, `kind`, `label`; `from`…
    - type [ClientLayout](../../src/diagram-layout.ts#L94) = Record<string, ClientEntry>
      <a id="map.diagram-layout.ClientLayout"></a><br>The editor's whole layout, by canvas key.
    - type [KeyDiagram](../../src/diagram-layout.ts#L97)
      <a id="map.diagram-layout.KeyDiagram"></a><br>What the keys are computed from: a diagram's nodes, edges and lanes (src/diagram.ts), structurally.
    - fn [viewSlug](../../src/diagram-layout.ts#L107) (view: string) → string
      <a id="map.diagram-layout.viewSlug"></a><br>A view's file name: `flow:checkout` → `flow--checkout.layout.json`; what a file name cannot hold is `_xx` hex.
    - fn [layoutPath](../../src/diagram-layout.ts#L116) (specDir: string, view: string) → string
      <a id="map.diagram-layout.layoutPath"></a><br>The layout file of a view, relative to the root, POSIX.
      - calls [map.diagram-layout.viewSlug](map.md#map.diagram-layout.viewSlug)
    - fn [shapeBase](../../src/diagram-layout.ts#L121) (kind: string, id: string, label: string) → string
      <a id="map.diagram-layout.shapeBase"></a><br>The key a shape gets from what it stands for, before twins are told apart.
    - fn [diagramKeys](../../src/diagram-layout.ts#L155) (diagram: KeyDiagram) → Map<string, string>
      <a id="map.diagram-layout.diagramKeys"></a><br>The stable key of each node of a diagram, by node id. A node of a flow (an id with a spec line) is keyed by what it says; any other node already has a stable id (`fn:<id>`, `entry:<id>`, `layer:<id>`).
      - calls [map.diagram-layout.shapeBase](map.md#map.diagram-layout.shapeBase), [map.diagram-layout.twinsApart](map.md#map.diagram-layout.twinsApart), [base.span.compareText](base.md#base.span.compareText)
    - fn [twinsApart](../../src/diagram-layout.ts#L209) (pairs: readonly (readonly [string, string])[], taken: Iterable<string> = []) → Map<string, string>
      <a id="map.diagram-layout.twinsApart"></a><br>`#2`, `#3` for a key already taken, in order.
    - fn [round](../../src/diagram-layout.ts#L226) (value: number) → number <!-- internal -->
      <a id="map.diagram-layout.round"></a>
    - fn [cleanShape](../../src/diagram-layout.ts#L229) (entry: ClientEntry) → LayoutShape <!-- internal -->
      <a id="map.diagram-layout.cleanShape"></a><br>A shape as the file stores it: rounded numbers, and only the non-empty text fields.
      - calls [map.diagram-layout.round](map.md#map.diagram-layout.round)
    - fn [layoutToFile](../../src/diagram-layout.ts#L252) (view: string, layout: ClientLayout, diagram: KeyDiagram) → LayoutFile
      <a id="map.diagram-layout.layoutToFile"></a><br>The editor's layout as the file keeps it: each key of a diagram node turned into its stable key, a lane into `lane:<layer>`, a drawn shape keyed by what it says (`step:<id>` without `planned:`), a note by its own key, an edge by the stable keys of its ends. An entry the diagram…
      - calls [map.diagram-layout.diagramKeys](map.md#map.diagram-layout.diagramKeys), [base.span.compareText](base.md#base.span.compareText), [map.diagram-layout.shapeBase](map.md#map.diagram-layout.shapeBase), [map.diagram-layout.twinsApart](map.md#map.diagram-layout.twinsApart), [map.diagram-layout.cleanShape](map.md#map.diagram-layout.cleanShape), [map.diagram-layout.round](map.md#map.diagram-layout.round)
    - fn [layoutFromFile](../../src/diagram-layout.ts#L320) (file: LayoutFile, diagram: KeyDiagram, pending: ReadonlySet<string> = new Set())
      <a id="map.diagram-layout.layoutFromFile"></a><br>The file's layout as the editor reads it: keys of the diagram's nodes, lanes and edges, and the shapes the diagram does not have — notes, and drawn shapes a proposal took (`proposed`) — under their own keys, with what is needed to draw them. `pending` names the proposals still…
      - calls [map.diagram-layout.diagramKeys](map.md#map.diagram-layout.diagramKeys)
    - type [SavedBox](../../src/diagram-layout.ts#L375)
      <a id="map.diagram-layout.SavedBox"></a><br>A node's saved box: what `layout(diagram, positions)` takes per node.
    - fn [savedPositions](../../src/diagram-layout.ts#L383) (file: LayoutFile | null, diagram: KeyDiagram)
      <a id="map.diagram-layout.savedPositions"></a><br>The saved boxes of a diagram's nodes, by node id: what `layout(diagram, positions)` takes.
      - calls [map.diagram-layout.diagramKeys](map.md#map.diagram-layout.diagramKeys)
    - fn [sorted](../../src/diagram-layout.ts#L404) (value: JsonValue) → JsonValue <!-- internal -->
      <a id="map.diagram-layout.sorted"></a><br>A JSON value with every object's keys sorted, recursively.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.span.compareText](base.md#base.span.compareText)
    - fn [layoutText](../../src/diagram-layout.ts#L413) (file: LayoutFile) → string
      <a id="map.diagram-layout.layoutText"></a><br>The file's text: the format and the view first, then shapes and edges with their keys sorted. Same layout, same bytes.
      - calls [map.diagram-layout.sorted](map.md#map.diagram-layout.sorted), [base.json.parseJson](base.md#base.json.parseJson)
    - fn [isFiniteNumber](../../src/diagram-layout.ts#L422) (value: JsonValue | undefined) → value is number <!-- internal -->
      <a id="map.diagram-layout.isFiniteNumber"></a>
    - fn [readPoint](../../src/diagram-layout.ts#L425) (value: JsonValue) → { x: number; y: number } | null <!-- internal -->
      <a id="map.diagram-layout.readPoint"></a><br>A point with finite `x` and `y`, else null.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [map.diagram-layout.isFiniteNumber](map.md#map.diagram-layout.isFiniteNumber)
    - fn [readEntry](../../src/diagram-layout.ts#L430) (value: JsonValue) → ClientEntry | null <!-- internal -->
      <a id="map.diagram-layout.readEntry"></a><br>A shape of a layout file as the editor holds it, or null without a finite `x` and `y`; a field of the wrong form is left out.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [map.diagram-layout.isFiniteNumber](map.md#map.diagram-layout.isFiniteNumber), [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [readEdge](../../src/diagram-layout.ts#L448) (value: JsonValue) → LayoutEdge | null <!-- internal -->
      <a id="map.diagram-layout.readEdge"></a><br>A line with valid points only; one bad point drops the whole line.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [map.diagram-layout.readPoint](map.md#map.diagram-layout.readPoint)
    - fn [parseLayout](../../src/diagram-layout.ts#L463) (text: string, view: string) → LayoutFile
      <a id="map.diagram-layout.parseLayout"></a><br>A layout file's text read leniently: a shape or an edge of the wrong form is left out; not JSON at all is an error.
      - calls [base.json.parseJson](base.md#base.json.parseJson), [base.json.isJsonObject](base.md#base.json.isJsonObject), [map.diagram-layout.readEntry](map.md#map.diagram-layout.readEntry), [map.diagram-layout.cleanShape](map.md#map.diagram-layout.cleanShape), [map.diagram-layout.readEdge](map.md#map.diagram-layout.readEdge), [map.diagram-layout.isFiniteNumber](map.md#map.diagram-layout.isFiniteNumber), [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [placeProblem](../../src/diagram-layout.ts#L490) (root: string, path: string, specDir: string) → string | null <!-- internal -->
      <a id="map.diagram-layout.placeProblem"></a><br>Where the layout of a view is, or why it may not be read or written there (a link out of the directory, a generated file).
      - calls [base.safe-write.targetProblem](base.md#base.safe-write.targetProblem)
    - type [SavedLayout](../../src/diagram-layout.ts#L495)
      <a id="map.diagram-layout.SavedLayout"></a><br>A view's layout file: where it is, and what it holds (null when there is none).
    - fn [readLayout](../../src/diagram-layout.ts#L505) (root: string, specDir: string, view: string) → SavedLayout
      <a id="map.diagram-layout.readLayout"></a><br>The saved layout of a view, or null when there is none. A file reached through a link out of the directory, one with a generated marker or one that is no layout throws with the reason.
      - calls [map.diagram-layout.layoutPath](map.md#map.diagram-layout.layoutPath), [map.diagram-layout.placeProblem](map.md#map.diagram-layout.placeProblem), [base.safe-write.isGeneratedText](base.md#base.safe-write.isGeneratedText), [map.diagram-layout.parseLayout](map.md#map.diagram-layout.parseLayout)
    - fn [layoutWriteProblem](../../src/diagram-layout.ts#L533) (root: string, specDir: string, view: string) → string | null
      <a id="map.diagram-layout.layoutWriteProblem"></a><br>Why the layout of a view may not be written, or null.
      - calls [map.diagram-layout.layoutPath](map.md#map.diagram-layout.layoutPath), [map.diagram-layout.placeProblem](map.md#map.diagram-layout.placeProblem), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem)
    - fn [writeLayout](../../src/diagram-layout.ts#L540) (root: string, specDir: string, file: LayoutFile) → string
      <a id="map.diagram-layout.writeLayout"></a><br>Writes the layout of a view (atomic, through `safeWrite`): its path, relative to the root. Throws `path: problem` for a link out or a generated file.
      - calls [map.diagram-layout.layoutPath](map.md#map.diagram-layout.layoutPath), [map.diagram-layout.layoutWriteProblem](map.md#map.diagram-layout.layoutWriteProblem), [base.safe-write.safeWrite](base.md#base.safe-write.safeWrite), [map.diagram-layout.layoutText](map.md#map.diagram-layout.layoutText)
  - module [diagram](../../src/diagram.ts#L1)
    <a id="map.diagram"></a><br>Diagrams of the model (business-flows/20, ADR 0014): a flow as BPMN-like shapes, an entry point's call tree, the layers and their rules. A view is a pure function of the snapshot, the SpecIR and the check results — no model, no file — so the same inputs give the same JSON.
    - diagram-layout [map.diagram-layout](map.md#map.diagram-layout)
    - external-ids [base.external-ids](base.md#base.external-ids)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - span [base.span](base.md#base.span)
    - system [check.system](check.md#check.system)
    - schema-discover [map.schema-discover](map.md#map.schema-discover)
    - system-discover [map.system-discover](map.md#map.system-discover)
    - type [DiagramView](../../src/diagram.ts#L28)
      <a id="map.diagram.DiagramView"></a><br>Which picture to draw, and of what.
    - type [DiagramVerdict](../../src/diagram.ts#L44) = "ok" | "fail" | "unverified" | "planned" | null
      <a id="map.diagram.DiagramVerdict"></a><br>A shape's colour: what `check` says about it, `planned` for declared-only code, null for nothing.
    - type [DiagramNode](../../src/diagram.ts#L47)
      <a id="map.diagram.DiagramNode"></a><br>One shape: what it stands for, its verdict and lane, and its box once laid out.
    - type [DiagramEdge](../../src/diagram.ts#L71)
      <a id="map.diagram.DiagramEdge"></a><br>One line between two shapes, with its kind and an optional label and verdict.
    - type [DiagramGroup](../../src/diagram.ts#L82)
      <a id="map.diagram.DiagramGroup"></a><br>A lane: one layer, a band across the diagram.
    - type [Diagram](../../src/diagram.ts#L93)
      <a id="map.diagram.Diagram"></a><br>A drawn view: shapes, lines, lanes, and why it is empty or cut short.
    - type [SystemSummary](../../src/diagram.ts#L111)
      <a id="map.diagram.SystemSummary"></a><br>What the page shows beside a system's diagram: the interview notes and the other views of the system.
    - type [DiagramResult](../../src/diagram.ts#L120)
      <a id="map.diagram.DiagramResult"></a><br>What a diagram reads of a check result: `CheckResult` and `Verdict` both fit.
    - type [DiagramInput](../../src/diagram.ts#L132)
      <a id="map.diagram.DiagramInput"></a><br>Everything a view is computed from.
    - type [DiagramProcess](../../src/diagram.ts#L151)
      <a id="map.diagram.DiagramProcess"></a><br>A business process as a model grouped it (business-flows/12): its domain and its discovered flows, each with its trigger and the steps right under it.
    - type [Positions](../../src/diagram.ts#L158)
      <a id="map.diagram.Positions"></a><br>Positions that win over the automatic layout, by node id.
    - fn [parseView](../../src/diagram.ts#L172) (query: URLSearchParams) → DiagramView | string
      <a id="map.diagram.parseView"></a><br>A view from the query of `GET /api/diagram`, or why it names none.
    - fn [viewOfKey](../../src/diagram.ts#L241) (key: string) → { view: DiagramView; discovered: boolean } | null
      <a id="map.diagram.viewOfKey"></a><br>The view a key of the page names (`flow:checkout`, `discovered:<name>`, `entry:<id>`, `process:<domain>`, `layers`), as `diagramOf` takes it; a discovered flow is drawn as a flow of the discovered view. Null for none.
    - type [DiagramViews](../../src/diagram.ts#L271)
      <a id="map.diagram.DiagramViews"></a><br>The views there are to draw, as the page lists them.
    - fn [viewsOf](../../src/diagram.ts#L285) ( snapshot: AnalysisSnapshot | null, spec: SpecIR, processes: readonly DiagramProcess[] = [], systems: readonly SystemSpec[] = [], schemas?: SchemaRead, ) → DiagramViews
      <a id="map.diagram.viewsOf"></a><br>What there is to draw: flow names in spec order, entry points as the snapshot lists them, layers in their order, the domains of the business processes (first seen first) and the processes with their flows.
      - calls [map.diagram.systemListing](map.md#map.diagram.systemListing), [map.diagram.layerOrder](map.md#map.diagram.layerOrder)
    - type [FlowListing](../../src/diagram.ts#L303)
      <a id="map.diagram.FlowListing"></a><br>A flow as the diagram page lists it: where it is, its trigger and lane, and every ID it names (for the search).
    - fn [flowIds](../../src/diagram.ts#L313) (flow: Flow) → string[]
      <a id="map.diagram.flowIds"></a><br>The IDs a flow names — triggers, steps, `then <id>`, `calls` — in source order, each once.
      - calls [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow)
    - fn [flowListing](../../src/diagram.ts#L324) (snapshot: AnalysisSnapshot | null, spec: SpecIR) → FlowListing[]
      <a id="map.diagram.flowListing"></a><br>The flows of a spec for the list of the diagram page: the first flow of each name, in spec order.
      - calls [map.diagram.layerOf](map.md#map.diagram.layerOf), [map.diagram.flowIds](map.md#map.diagram.flowIds)
    - type [Usages](../../src/diagram.ts#L339)
      <a id="map.diagram.Usages"></a><br>Where an ID is used: flows and discovered flows that name it (or an ID under it), and entry points whose route does.
    - fn [covers](../../src/diagram.ts#L347) (id: string, target: string) → boolean <!-- internal -->
      <a id="map.diagram.covers"></a><br>An ID or one under it: `a.b` matches `a.b` and `a.b.c`, not `a.bc`.
    - fn [useIn](../../src/diagram.ts#L352) (flow: Flow, id: string) → number | null <!-- internal -->
      <a id="map.diagram.useIn"></a><br>The first line of a flow that names the ID, or null.
      - calls [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow), [map.diagram.covers](map.md#map.diagram.covers)
    - fn [usagesOf](../../src/diagram.ts#L370) (snapshot: AnalysisSnapshot | null, spec: SpecIR, discovered: SpecIR | null, id: string) → Usages
      <a id="map.diagram.usagesOf"></a><br>Where `id` is used (business-flows/21): the flows of the specs and of the discovered view that name it in a trigger, step, `then` or `calls`, and the entry points that are it or whose flow (written or discovered, by trigger) names it. Pure; each list in its source's order.
      - calls [map.diagram.useIn](map.md#map.diagram.useIn), [map.diagram.covers](map.md#map.diagram.covers)
    - fn [diagramOf](../../src/diagram.ts#L397) (input: DiagramInput) → Diagram
      <a id="map.diagram.diagramOf"></a><br>The laid-out diagram of a view; places from the saved layout file win over computed ones.
      - calls [map.diagram.unplaced](map.md#map.diagram.unplaced), [map.diagram.layout](map.md#map.diagram.layout), [map.diagram-layout.savedPositions](map.md#map.diagram-layout.savedPositions)
    - fn [unplaced](../../src/diagram.ts#L420) (input: DiagramInput) → Diagram <!-- internal -->
      <a id="map.diagram.unplaced"></a><br>The diagram of a view before `layout` places it.
      - calls [map.diagram.flowDiagram](map.md#map.diagram.flowDiagram), [map.diagram.systemNamed](map.md#map.diagram.systemNamed), [map.diagram.empty](map.md#map.diagram.empty), [map.diagram.systemDiagram](map.md#map.diagram.systemDiagram), [map.diagram.erDiagram](map.md#map.diagram.erDiagram), [map.diagram.sequenceDiagram](map.md#map.diagram.sequenceDiagram), [map.diagram.eventDiagram](map.md#map.diagram.eventDiagram), [map.diagram.processDiagram](map.md#map.diagram.processDiagram), [map.diagram.entryDiagram](map.md#map.diagram.entryDiagram), [map.diagram.moduleDiagram](map.md#map.diagram.moduleDiagram), [map.diagram.layersDiagram](map.md#map.diagram.layersDiagram)
    - fn [empty](../../src/diagram.ts#L457) (reason: string) → Diagram <!-- internal -->
      <a id="map.diagram.empty"></a><br>An empty diagram that says why.
    - fn [withReason](../../src/diagram.ts#L462) (diagram: Diagram, reason: string | null) → Diagram <!-- internal -->
      <a id="map.diagram.withReason"></a><br>The diagram with why it is empty or cut short, when there is a reason.
    - type [Box](../../src/diagram.ts#L468) = Pick<DiagramNode, "x" | "y" | "w" | "h"> <!-- internal -->
      <a id="map.diagram.Box"></a>
    - fn [shapeOf](../../src/diagram.ts#L471) (shape: Omit<DiagramNode, keyof Box>, group: string | null | undefined, box: Box = { x: 0, y: 0, w: 0, h: 0 }) → DiagramNode <!-- internal -->
      <a id="map.diagram.shapeOf"></a><br>A shape in its lane when it has one, `group` written before the box as every view writes it; at the origin unless placed.
    - fn [codeRef](../../src/diagram.ts#L480) (id: string, code: { file: string | null; line: number | null } | undefined) → NonNullable<DiagramNode["ref"]> <!-- internal -->
      <a id="map.diagram.codeRef"></a><br>The code a shape stands for: its ID, and the file and line when the snapshot knows them.
    - type [RankedVerdict](../../src/diagram.ts#L493) = "fail" | "unverified" | "ok" <!-- internal -->
      <a id="map.diagram.RankedVerdict"></a>
    - fn [isRanked](../../src/diagram.ts#L498) (value: string) → value is RankedVerdict <!-- internal -->
      <a id="map.diagram.isRanked"></a><br>A verdict `check` ranks; any other text (`""`, an unknown word) counts for nothing.
    - fn [worst](../../src/diagram.ts#L503) (values: readonly string[]) → DiagramVerdict <!-- internal -->
      <a id="map.diagram.worst"></a><br>The most severe ranked verdict in `values`, or null when none ranks.
      - calls [map.diagram.isRanked](map.md#map.diagram.isRanked)
    - fn [messageOf](../../src/diagram.ts#L512) (result: DiagramResult) → string <!-- internal -->
      <a id="map.diagram.messageOf"></a><br>A result's text, whichever shape of result it is.
    - fn [byLine](../../src/diagram.ts#L517) (results: readonly DiagramResult[]) → Map<string, DiagramResult[]> <!-- internal -->
      <a id="map.diagram.byLine"></a><br>Results by `file:line`.
    - fn [byArea](../../src/diagram.ts#L531) (results: readonly DiagramResult[]) → Map<string, DiagramVerdict> <!-- internal -->
      <a id="map.diagram.byArea"></a><br>The worst verdict about each ID and every ID above it (`a.b.c` counts for `a.b` and `a`).
      - calls [map.diagram.isRanked](map.md#map.diagram.isRanked), [map.diagram.worst](map.md#map.diagram.worst)
    - fn [layerOrder](../../src/diagram.ts#L551) (snapshot: AnalysisSnapshot) → string[] <!-- internal -->
      <a id="map.diagram.layerOrder"></a><br>The repository's layers in `keylang.json` order, then the others (packages last).
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [layerOf](../../src/diagram.ts#L564) (snapshot: AnalysisSnapshot | null, id: string) → string | undefined <!-- internal -->
      <a id="map.diagram.layerOf"></a><br>The layer of an ID: the snapshot's, else its first segment when that is a layer (or when there is no snapshot).
    - fn [lanes](../../src/diagram.ts#L574) (snapshot: AnalysisSnapshot | null, nodes: readonly DiagramNode[]) → DiagramGroup[] <!-- internal -->
      <a id="map.diagram.lanes"></a><br>One lane per layer some node sits in, in the layers' order; sized by `layout`.
      - calls [map.diagram.layerOrder](map.md#map.diagram.layerOrder), [base.span.compareText](base.md#base.span.compareText)
    - fn [flowDiagram](../../src/diagram.ts#L589) (input: DiagramInput, name: string) → Diagram <!-- internal -->
      <a id="map.diagram.flowDiagram"></a><br>A flow as BPMN-like shapes: the trigger as the start event, each item drawn in spec order, nested items after their parent. Node ids carry the spec line (`step:12`), which `diagramKeys` later turns into stable keys.
      - calls [map.diagram.empty](map.md#map.diagram.empty), [map.diagram.byLine](map.md#map.diagram.byLine), [map.diagram.shapeOf](map.md#map.diagram.shapeOf), [map.diagram.codeRef](map.md#map.diagram.codeRef), [map.diagram.worst](map.md#map.diagram.worst), [map.diagram.layerOf](map.md#map.diagram.layerOf), [map.diagram.stripLead](map.md#map.diagram.stripLead), [map.diagram.messageOf](map.md#map.diagram.messageOf), [map.diagram.lanes](map.md#map.diagram.lanes)
    - fn [stripLead](../../src/diagram.ts#L776) (message: string, id: string) → string <!-- internal -->
      <a id="map.diagram.stripLead"></a><br>`check`'s message without its `unverified <id>: ` lead.
    - fn [eventNamed](../../src/diagram.ts#L785) (snapshot: AnalysisSnapshot, name: string) → string | null
      <a id="map.diagram.eventNamed"></a><br>The event node a view names: its ID, `events.<literal>`, or the literal it is dispatched with.
    - fn [eventDiagram](../../src/diagram.ts#L798) (snapshot: AnalysisSnapshot, results: readonly DiagramResult[], name: string) → Diagram <!-- internal -->
      <a id="map.diagram.eventDiagram"></a><br>An event (ADR 0022 п. 6, business-flows/08): the fns that dispatch it, the event, and the fns its observers run, each in the lane of its layer. A dispatch is an `emits` edge, an observer a `call` named after it.
      - calls [map.diagram.eventNamed](map.md#map.diagram.eventNamed), [map.diagram.empty](map.md#map.diagram.empty), [map.diagram.byArea](map.md#map.diagram.byArea), [map.diagram.shapeOf](map.md#map.diagram.shapeOf), [map.diagram.codeRef](map.md#map.diagram.codeRef), [map.diagram.withReason](map.md#map.diagram.withReason), [map.diagram.lanes](map.md#map.diagram.lanes)
    - fn [entryDiagram](../../src/diagram.ts#L839) (snapshot: AnalysisSnapshot, results: readonly DiagramResult[], id: string, depth: number) → Diagram <!-- internal -->
      <a id="map.diagram.entryDiagram"></a><br>An entry point's call tree: the entry as the start, the fns it calls breadth first to `depth` levels, each fn once in the lane of its layer, and one `?` hole per fn for the calls keylang could not resolve.
      - calls [map.diagram.empty](map.md#map.diagram.empty), [map.diagram.byArea](map.md#map.diagram.byArea), [map.diagram.codeRef](map.md#map.diagram.codeRef), [map.diagram.shapeOf](map.md#map.diagram.shapeOf), [map.diagram.lanes](map.md#map.diagram.lanes), [map.diagram.withReason](map.md#map.diagram.withReason)
    - fn [processDiagram](../../src/diagram.ts#L976) (snapshot: AnalysisSnapshot, processes: readonly DiagramProcess[], results: readonly DiagramResult[], domain: string) → Diagram <!-- internal -->
      <a id="map.diagram.processDiagram"></a><br>The processes of a domain (or the one process of that name): lanes per layer, one start per flow of each process (its trigger), and the steps right under it as tasks. A step two flows share is drawn once.
      - calls [map.diagram.empty](map.md#map.diagram.empty), [map.diagram.byArea](map.md#map.diagram.byArea), [map.diagram.layerOf](map.md#map.diagram.layerOf), [map.diagram.shapeOf](map.md#map.diagram.shapeOf), [map.diagram.codeRef](map.md#map.diagram.codeRef), [map.diagram.lanes](map.md#map.diagram.lanes)
    - fn [moduleOfId](../../src/diagram.ts#L1017) (snapshot: AnalysisSnapshot, id: string) → string | null
      <a id="map.diagram.moduleOfId"></a><br>The module an ID lies in: itself, or the nearest module above it (`a.b.f` → `a.b`); null when none.
    - fn [moduleDiagram](../../src/diagram.ts#L1034) (snapshot: AnalysisSnapshot, results: readonly DiagramResult[], id: string) → Diagram <!-- internal -->
      <a id="map.diagram.moduleDiagram"></a><br>A module's dependencies, one step each way (the map as a graph): the modules that import it on the left, the module, what it imports on the right — repository modules in the lanes of their layers, packages as `external`; an edge counts the imports. Any ID opens the module it…
      - calls [map.diagram.moduleOfId](map.md#map.diagram.moduleOfId), [map.diagram.empty](map.md#map.diagram.empty), [map.diagram.byArea](map.md#map.diagram.byArea), [map.diagram.shapeOf](map.md#map.diagram.shapeOf), [map.diagram.codeRef](map.md#map.diagram.codeRef), [map.diagram.withReason](map.md#map.diagram.withReason), [map.diagram.lanes](map.md#map.diagram.lanes)
    - fn [layersDiagram](../../src/diagram.ts#L1086) (snapshot: AnalysisSnapshot, spec: SpecIR, results: readonly DiagramResult[]) → Diagram <!-- internal -->
      <a id="map.diagram.layersDiagram"></a><br>The layers as a stack (top to bottom in their order), with a counted dependency line per pair of layers the code connects and one line per pair and effect of the `allow`/`deny` rules, coloured by their verdict.
      - calls [map.diagram.layerOrder](map.md#map.diagram.layerOrder), [map.diagram.byArea](map.md#map.diagram.byArea), [map.diagram.layerOf](map.md#map.diagram.layerOf), [map.diagram.worst](map.md#map.diagram.worst)
    - fn [layout](../../src/diagram.ts#L1186) (diagram: Diagram, positions: Positions = {}) → Diagram
      <a id="map.diagram.layout"></a><br>Places the shapes: the rank of a node is its longest path from a node without predecessors (back edges of a cycle ignored), its column block; within a lane and a rank, nodes go by spec line, then next to their predecessors (their mean place), then by their order in the diagram…
    - type [SystemListing](../../src/diagram.ts#L1356)
      <a id="map.diagram.SystemListing"></a><br>A system as the page lists it: its name, file, sequences and whether it has tables.
    - fn [tableCount](../../src/diagram.ts#L1366) (system: SystemSpec) → number <!-- internal -->
      <a id="map.diagram.tableCount"></a><br>How many tables the system's data stores hold.
    - fn [systemListing](../../src/diagram.ts#L1371) (snapshot: AnalysisSnapshot | null, systems: readonly SystemSpec[], schemas?: SchemaRead) → SystemListing[]
      <a id="map.diagram.systemListing"></a><br>The systems of the specs in spec order, then the one of the code when there is a snapshot.
      - calls [map.system-discover.discoverSystem](map.md#map.system-discover.discoverSystem), [map.diagram.tableCount](map.md#map.diagram.tableCount)
    - fn [systemNamed](../../src/diagram.ts#L1383) (snapshot: AnalysisSnapshot | null, systems: readonly SystemSpec[], name: string, schemas?: SchemaRead) → SystemSpec | null <!-- internal -->
      <a id="map.diagram.systemNamed"></a><br>The system a view names: a `# system` of the specs, or the one discovered from the code.
      - calls [map.system-discover.discoverSystem](map.md#map.system-discover.discoverSystem)
    - fn [summaryOf](../../src/diagram.ts#L1390) (system: SystemSpec) → SystemSummary <!-- internal -->
      <a id="map.diagram.summaryOf"></a><br>What the page shows beside a system's views: notes, sequences, table count; no file for the code system.
      - calls [map.diagram.tableCount](map.md#map.diagram.tableCount)
    - fn [systemDiagram](../../src/diagram.ts#L1403) (system: SystemSpec, results: readonly DiagramResult[]) → Diagram <!-- internal -->
      <a id="map.diagram.systemDiagram"></a><br>A system: one shape per component in the lane of its zone (the zone's path, `outer / inner`, as the lane's name), an edge per relation with its verb and caption, coloured by the `system` verdict of that relation; a component takes the worst verdict of its relations.
      - calls [map.diagram.worst](map.md#map.diagram.worst), [map.diagram.shapeOf](map.md#map.diagram.shapeOf), [map.diagram.withReason](map.md#map.diagram.withReason), [map.diagram.summaryOf](map.md#map.diagram.summaryOf)
    - fn [columnLine](../../src/diagram.ts#L1473) (column: SystemSpec["components"][number]["tables"][number]["columns"][number]) → string <!-- internal -->
      <a id="map.diagram.columnLine"></a><br>A column as one line of its table: `🔑` for the key, `→ users.id` for a foreign key.
    - fn [erDiagram](../../src/diagram.ts#L1486) (system: SystemSpec) → Diagram <!-- internal -->
      <a id="map.diagram.erDiagram"></a><br>The ER view: a table is a shape with a line per column, in a lane per data store, at most four tables in a row; a foreign key is an edge to the referenced table, `N:1` (`1:1` when the column is `unique` or the key). Placed here, not by `layout`: a table is as tall as its columns.
      - calls [map.diagram.columnLine](map.md#map.diagram.columnLine), [map.diagram.shapeOf](map.md#map.diagram.shapeOf), [map.diagram.withReason](map.md#map.diagram.withReason), [map.diagram.summaryOf](map.md#map.diagram.summaryOf)
    - fn [sequenceDiagram](../../src/diagram.ts#L1556) (system: SystemSpec, name: string) → Diagram <!-- internal -->
      <a id="map.diagram.sequenceDiagram"></a><br>A sequence: the participants in a row in the order they first appear, a lifeline down from each, and each message an arrow between two lifelines at its own height, numbered in order; an asynchronous one is dashed. A message to itself steps down its own lifeline.
      - calls [map.diagram.empty](map.md#map.diagram.empty), [map.diagram.summaryOf](map.md#map.diagram.summaryOf), [map.diagram.shapeOf](map.md#map.diagram.shapeOf), [map.diagram.withReason](map.md#map.diagram.withReason)
  - module [drawio](../../src/drawio.ts#L1)
    <a id="map.drawio"></a><br>draw.io (diagrams.net) of a diagram, and a flow from a draw.io file (business-flows/28). The export is the picture `/diagrams` draws (`diagramOf` + `layout`) as an uncompressed `<mxfile>`: lanes as swimlanes, shapes styled as the web canvas styles them, every shape and edge an…
    - node [external.node](external.md#external.node)
    - bpmn-export [map.bpmn-export](map.md#map.bpmn-export)
    - diagram [map.diagram](map.md#map.diagram)
    - parser [lang.parser](lang.md#lang.parser)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - type [StyleParts](../../src/drawio.ts#L37) = Record<string, string | number> <!-- internal -->
      <a id="map.drawio.StyleParts"></a><br>draw.io style keys and their values, written `key=value;`.
    - fn [style](../../src/drawio.ts#L40) (parts: StyleParts) → string <!-- internal -->
      <a id="map.drawio.style"></a><br>A draw.io style string from its parts, in insertion order.
    - fn [nodeStyle](../../src/drawio.ts#L47) (node: Pick<DiagramNode, "kind" | "verdict">) → string
      <a id="map.drawio.nodeStyle"></a><br>The style of a shape: the canvas's shape, colours and dashes, in draw.io's names.
      - calls [map.drawio.style](map.md#map.drawio.style)
    - fn [edgeStyle](../../src/drawio.ts#L76) (edge: DiagramEdge) → string <!-- internal -->
      <a id="map.drawio.edgeStyle"></a><br>The style of an edge: verdict colour, dashed for the non-sequence kinds, open arrows for calls and dependencies.
      - calls [map.drawio.style](map.md#map.drawio.style)
    - fn [htmlText](../../src/drawio.ts#L87) (text: string) → string <!-- internal -->
      <a id="map.drawio.htmlText"></a><br>Text as draw.io reads an `html=1` label: `&`, `<` and `>` escaped, so a condition `a < b` is no tag.
    - fn [labelOf](../../src/drawio.ts#L92) (node: DiagramNode) → string <!-- internal -->
      <a id="map.drawio.labelOf"></a><br>The label of a shape: a hole shows `?`, every other shape its label (a gateway's condition, a timer's `after 5m`).
      - calls [map.drawio.htmlText](map.md#map.drawio.htmlText)
    - fn [renderDrawio](../../src/drawio.ts#L101) (input: DiagramInput, view: string) → string
      <a id="map.drawio.renderDrawio"></a><br>The `.drawio` of a view: `view` names it (`flow:<name>`, `discovered:<name>`, `process:<domain>`, `entry:<id>`, `layers`) on the root cell and the page. Throws on an empty diagram, with its reason.
      - calls [map.diagram.diagramOf](map.md#map.diagram.diagramOf), [map.bpmn-export.xmlEscape](map.md#map.bpmn-export.xmlEscape), [map.drawio.htmlText](map.md#map.drawio.htmlText), [map.drawio.labelOf](map.md#map.drawio.labelOf), [map.drawio.nodeStyle](map.md#map.drawio.nodeStyle), [map.drawio.edgeStyle](map.md#map.drawio.edgeStyle)
    - type [XmlElement](../../src/drawio.ts#L146)
      <a id="map.drawio.XmlElement"></a><br>An element of the minimal XML tree `parseXml` builds; `text` is its direct text, concatenated.
    - fn [decode](../../src/drawio.ts#L163) (text: string) → string <!-- internal -->
      <a id="map.drawio.decode"></a><br>Character and predefined entity references decoded; an unknown named entity stays as written.
    - fn [parseXml](../../src/drawio.ts#L179) (text: string) → XmlElement
      <a id="map.drawio.parseXml"></a><br>The element tree of an XML document — what a `.drawio` file needs: tags, attributes, text, entities, comments, CDATA, processing instructions and a doctype skipped. Throws on a document that is not well formed enough to read (an unclosed or mismatched tag), naming the offset.
      - calls [map.drawio.decode](map.md#map.drawio.decode)
    - type [DrawioCell](../../src/drawio.ts#L258)
      <a id="map.drawio.DrawioCell"></a><br>One cell of a draw.io page: a shape (vertex) or an edge, with its keylang attributes.
    - type [DrawioModel](../../src/drawio.ts#L271)
      <a id="map.drawio.DrawioModel"></a><br>The cells of a draw.io page and the view it was exported as.
    - fn [plain](../../src/drawio.ts#L278) (label: string) → string <!-- internal -->
      <a id="map.drawio.plain"></a><br>HTML of a label as plain text: tags out, `<br>` and `<div>` as spaces, entities decoded, spaces collapsed.
      - calls [map.drawio.decode](map.md#map.drawio.decode)
    - fn [find](../../src/drawio.ts#L287) (element: XmlElement, name: string) → XmlElement | null <!-- internal -->
      <a id="map.drawio.find"></a><br>The first descendant element named `name`, depth first.
    - fn [parseDrawio](../../src/drawio.ts#L303) (text: string) → DrawioModel
      <a id="map.drawio.parseDrawio"></a><br>The cells of the first page of a `.drawio` file: plain, or compressed as draw.io once saved by default (base64 of raw deflate of the URI-encoded model). Cells wrapped in `<object>`/`<UserObject>` carry their attributes.
      - calls [map.drawio.parseXml](map.md#map.drawio.parseXml), [map.drawio.find](map.md#map.drawio.find), [map.drawio.plain](map.md#map.drawio.plain)
    - type [Entry](../../src/drawio.ts#L364) <!-- internal -->
      <a id="map.drawio.Entry"></a><br>One line of the flow section being rebuilt.
    - fn [indentOf](../../src/drawio.ts#L372) (line: string) → number <!-- internal -->
      <a id="map.drawio.indentOf"></a><br>The number of leading spaces.
    - fn [listLine](../../src/drawio.ts#L377) (indent: number, body: string) → string <!-- internal -->
      <a id="map.drawio.listLine"></a><br>`- step a.b` and its kin: a list line with its keyword.
    - fn [commentSafe](../../src/drawio.ts#L382) (text: string) → string <!-- internal -->
      <a id="map.drawio.commentSafe"></a><br>Text that cannot end an HTML comment.
    - fn [lineOf](../../src/drawio.ts#L387) (cell: DrawioCell) → string | null <!-- internal -->
      <a id="map.drawio.lineOf"></a><br>A flow line of a new shape, or null when it has nothing to say (no ID, no label).
    - fn [rewritten](../../src/drawio.ts#L423) (line: string, item: Trigger | FlowItem, cell: DrawioCell) → string | null <!-- internal -->
      <a id="map.drawio.rewritten"></a><br>The line of an existing item rewritten for the shape's new ID or label, or null when nothing on it changed.
    - fn [flowFromDrawio](../../src/drawio.ts#L481) (model: DrawioModel, name: string, current: { text: string; flow: Flow; firstLine: number } | null) → string
      <a id="map.drawio.flowFromDrawio"></a><br>The section of flow `name` as the drawing says it: `current` is the flow's section as it is (lines from its heading to the next heading) and `flow` its IR with lines counted from `firstLine` (the heading's line in the file); both null for a flow the specs do not have yet, which…
      - calls [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow), [map.drawio.indentOf](map.md#map.drawio.indentOf), [map.drawio.rewritten](map.md#map.drawio.rewritten), [map.drawio.lineOf](map.md#map.drawio.lineOf), [map.drawio.listLine](map.md#map.drawio.listLine), [map.drawio.commentSafe](map.md#map.drawio.commentSafe)
    - fn [drawioFlowName](../../src/drawio.ts#L689) (model: DrawioModel) → string | null
      <a id="map.drawio.drawioFlowName"></a><br>The flow a `.drawio` file draws: `flow:<name>` or `discovered:<name>` of its view, or null for any other view.
    - fn [flowSection](../../src/drawio.ts#L699) (text: string, name: string) → { text: string; firstLine: number } | null
      <a id="map.drawio.flowSection"></a><br>The section of flow `name` in a spec's text: its lines from the heading to the next heading (LF), and the heading's line; null when the text has none.
      - calls [lang.parser.parse](lang.md#lang.parser.parse)
  - module [emit](../../src/emit.ts#L1)
    <a id="map.emit"></a><br>Snapshot → generated `map/<layer>.md` files, and the explained map: the same tree with an explanation under every node (ADR 0004). The last step of the code pipeline (source → FileFacts → graph → snapshot → map/index).
    - node [external.node](external.md#external.node)
    - explanations [map.explanations](map.md#map.explanations)
    - graph [map.graph](map.md#map.graph)
    - span [base.span](base.md#base.span)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - fn [isGeneratedMap](../../src/emit.ts#L17) (text: string) → boolean
      <a id="map.emit.isGeneratedMap"></a><br>True when the first non-empty line is a generator marker. The text after `keylang:generated` may vary.
    - fn [codeHref](../../src/emit.ts#L30) (mapDir: string, filePath: string, line: number) → string
      <a id="map.emit.codeHref"></a><br>Markdown link target relative to a map file. `mapDir` and `filePath` are POSIX paths from the repository root (`keylang/map`, `src/a.ts`). Each segment except `.` and `..` is percent-encoded so `(`, `)`, spaces and `#` survive round-trip. `encodeURIComponent` leaves…
      - calls [map.emit.encodeSegment](map.md#map.emit.encodeSegment)
    - fn [encodeSegment](../../src/emit.ts#L42) (seg: string) → string <!-- internal -->
      <a id="map.emit.encodeSegment"></a><br>One path segment percent-encoded, parentheses included.
    - fn [renderMap](../../src/emit.ts#L47) (snapshot: AnalysisSnapshot, mapDir: string) → Map<string, string>
      <a id="map.emit.renderMap"></a><br>One Markdown document per layer, keyed by file name (`domain.md`). `mapDir` is where those files are written, relative to the repo root.
      - calls [map.emit.renderLayers](map.md#map.emit.renderLayers), [map.emit.childrenByParent](map.md#map.emit.childrenByParent)
    - type [ExplainNode](../../src/emit.ts#L52) = (id: string) => NodeExplanation | null
      <a id="map.emit.ExplainNode"></a><br>A node's explanation for the explained map; null leaves the node without text.
    - fn [renderExplainedMap](../../src/emit.ts#L62) (snapshot: AnalysisSnapshot, mapDir: string, explain: ExplainNode) → Map<string, string>
      <a id="map.emit.renderExplainedMap"></a><br>The explained map: the tree of `renderMap` for reading on GitHub and in an editor. Every node has an anchor and, when it has an explanation, the text on its description line; `calls` and dependency targets link to the anchor of their node; each layer file opens with its…
      - calls [map.emit.childrenByParent](map.md#map.emit.childrenByParent), [map.emit.renderLayers](map.md#map.emit.renderLayers), [map.emit.renderReadme](map.md#map.emit.renderReadme)
    - type [Render](../../src/emit.ts#L71) <!-- internal -->
      <a id="map.emit.Render"></a><br>What every render step needs: the snapshot, its tree, the output directory and, for the explained map, the explanations.
    - fn [renderLayers](../../src/emit.ts#L80) (r: Render) → Map<string, string> <!-- internal -->
      <a id="map.emit.renderLayers"></a><br>One file per layer: the mark, the explained map's contents line, the layer, then its modules and events.
      - calls [map.emit.layerIds](map.md#map.emit.layerIds), [map.emit.contents](map.md#map.emit.contents), [map.emit.describe](map.md#map.emit.describe), [map.emit.sortIds](map.md#map.emit.sortIds), [map.emit.renderDecl](map.md#map.emit.renderDecl), [map.emit.renderModule](map.md#map.emit.renderModule)
    - fn [layerIds](../../src/emit.ts#L99) (snapshot: AnalysisSnapshot) → string[] <!-- internal -->
      <a id="map.emit.layerIds"></a><br>The layer IDs of the snapshot, sorted.
    - fn [anchorOf](../../src/emit.ts#L109) (id: string) → string
      <a id="map.emit.anchorOf"></a><br>The anchor of a node in the explained map: its ID, with every character other than an ASCII letter, digit, `.`, `_` or `-` written as `~<hex>~` (its code point). GitHub keeps such an `id` as written, and `~` never occurs in an ID, so two IDs never share an anchor.
    - fn [ref](../../src/emit.ts#L114) (r: Render, id: string) → string <!-- internal -->
      <a id="map.emit.ref"></a><br>A link to the node's anchor in its layer file; the bare ID in the canonical map.
      - calls [map.emit.anchorOf](map.md#map.emit.anchorOf)
    - fn [contents](../../src/emit.ts#L122) (r: Render, layerId: string) → string <!-- internal -->
      <a id="map.emit.contents"></a><br>The first lines of a layer file: back to the start page, and every module of the layer, in map order.
      - calls [map.emit.anchorOf](map.md#map.emit.anchorOf), [map.emit.sortIds](map.md#map.emit.sortIds)
    - fn [describe](../../src/emit.ts#L144) (r: Render, id: string, depth: number) → string <!-- internal -->
      <a id="map.emit.describe"></a><br>The description line of a node at `depth`: in the explained map its anchor and its explanation, if any; nothing in the canonical map.
      - calls [map.emit.anchorOf](map.md#map.emit.anchorOf), [map.emit.descriptionText](map.md#map.emit.descriptionText), [map.emit.ref](map.md#map.emit.ref)
    - fn [descriptionText](../../src/emit.ts#L160) (e: NodeExplanation, link: (id: string) => string | null = () => null) → string
      <a id="map.emit.descriptionText"></a><br>The text of a description line: `<br>` so a Markdown viewer starts it on a line of its own, the explanation, and for a brief from a model its origin. The text never starts a block (a list item, a heading, a quote, a fence), and `<` outside code is `&lt;`, so no HTML in it…
      - calls [map.explanations.modelName](map.md#map.explanations.modelName)
    - type [Counts](../../src/emit.ts#L186) <!-- internal -->
      <a id="map.emit.Counts"></a><br>Explanation counts of the nodes of one layer (the layer included).
    - fn [renderReadme](../../src/emit.ts#L194) (snapshot: AnalysisSnapshot, children: Map<string, string[]>, explain: ExplainNode) → string <!-- internal -->
      <a id="map.emit.renderReadme"></a><br>The explained map's start page: the system section, a per-layer count table and the module index.
      - calls [map.emit.layerIds](map.md#map.emit.layerIds), [map.emit.descriptionText](map.md#map.emit.descriptionText), [map.emit.ref](map.md#map.emit.ref), [map.emit.systemSection](map.md#map.emit.systemSection), [map.emit.index](map.md#map.emit.index)
    - fn [systemSection](../../src/emit.ts#L258) (r: Render) → string[] <!-- internal -->
      <a id="map.emit.systemSection"></a><br>The start of the start page: what the repository is (the system level of C4), under its manifest name. The words come from the README or a manifest, named after them, else from a model's brief with its origin; without either, a dash and how to ask for a brief.
      - calls [map.emit.descriptionText](map.md#map.emit.descriptionText), [map.emit.ref](map.md#map.emit.ref)
    - fn [index](../../src/emit.ts#L269) (r: Render) → string[] <!-- internal -->
      <a id="map.emit.index"></a><br>One paragraph per first letter: every module and class of the repository (packages left out), by name.
      - calls [map.emit.nameOf](map.md#map.emit.nameOf), [base.span.compareText](base.md#base.span.compareText), [map.emit.anchorOf](map.md#map.emit.anchorOf)
    - fn [childrenByParent](../../src/emit.ts#L295) (snapshot: AnalysisSnapshot) → Map<string, string[]> <!-- internal -->
      <a id="map.emit.childrenByParent"></a><br>Each ID's direct children, keyed by the ID with its last segment removed.
    - fn [sortIds](../../src/emit.ts#L317) (snapshot: AnalysisSnapshot, ids: readonly string[]) → string[] <!-- internal -->
      <a id="map.emit.sortIds"></a><br>Children by file (a directory module by its name), then by line. Code-unit order, as the index and the snapshot sort: ICU collation differs between Node builds, and the map's bytes must not.
      - calls [map.emit.nameOf](map.md#map.emit.nameOf), [base.span.compareText](base.md#base.span.compareText)
    - fn [nameOf](../../src/emit.ts#L329) (id: string) → string <!-- internal -->
      <a id="map.emit.nameOf"></a><br>The last segment of an ID.
    - fn [linkedName](../../src/emit.ts#L334) (mapDir: string, node: SnapshotNode, name: string) → string <!-- internal -->
      <a id="map.emit.linkedName"></a><br>A node's name linked to its line in the code; plain when the node has no place.
      - calls [map.emit.codeHref](map.md#map.emit.codeHref)
    - fn [renderModule](../../src/emit.ts#L341) (r: Render, id: string, depth: number) → string <!-- internal -->
      <a id="map.emit.renderModule"></a><br>A module line, its description, its dependency lines, then its children, recursively.
      - calls [map.emit.linkedName](map.md#map.emit.linkedName), [map.emit.nameOf](map.md#map.emit.nameOf), [map.emit.describe](map.md#map.emit.describe), [map.emit.depsOf](map.md#map.emit.depsOf), [map.emit.ref](map.md#map.emit.ref), [map.emit.sortIds](map.md#map.emit.sortIds), [map.emit.renderDecl](map.md#map.emit.renderDecl)
    - fn [edgesFrom](../../src/emit.ts#L373) (snapshot: AnalysisSnapshot, id: string) → readonly SnapshotEdge[] <!-- internal -->
      <a id="map.emit.edgesFrom"></a><br>The edges whose source is `id`, through a per-snapshot index built on first use.
    - fn [depsOf](../../src/emit.ts#L393) (snapshot: AnalysisSnapshot, id: string) → SnapshotEdge[] <!-- internal -->
      <a id="map.emit.depsOf"></a><br>One line per dependency alias: an import and a re-export of one module are one dependency with two edges.
      - calls [map.emit.edgesFrom](map.md#map.emit.edgesFrom)
    - fn [renderDecl](../../src/emit.ts#L405) (r: Render, id: string, node: SnapshotNode, depth: number) → string <!-- internal -->
      <a id="map.emit.renderDecl"></a><br>A fn, type or event line with its signature and notes, its description, and one `calls` line.
      - calls [map.emit.linkedName](map.md#map.emit.linkedName), [map.emit.nameOf](map.md#map.emit.nameOf), [map.emit.describe](map.md#map.emit.describe), [map.emit.edgesFrom](map.md#map.emit.edgesFrom), [map.emit.ref](map.md#map.emit.ref)
  - module [entries](../../src/entries.ts#L1)
    <a id="map.entries"></a><br>Entry points of a repository without a framework adapter (ADR 0022 п. 5): only what the code and its manifests write down. `bin` of package.json and `[project.scripts]` of pyproject.toml are `cli`; `fn main` of a Rust bin target, a Python `if __name__ == "__main__":` block and…
    - smol-toml [external.smol-toml](external.md#external.smol-toml)
    - facts [extract.facts](extract.md#extract.facts)
    - graph [map.graph](map.md#map.graph)
    - imports [map.imports](map.md#map.imports)
    - json [base.json](base.md#base.json)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - type [EntryManifests](../../src/entries.ts#L23)
      <a id="map.entries.EntryManifests"></a><br>The manifests the collectors read, by POSIX path from the root; null when absent.
    - type [EntryInputs](../../src/entries.ts#L33)
      <a id="map.entries.EntryInputs"></a><br>What the collectors read: the graph, its facts, the manifests and a file-existence check.
    - type [EntryScope](../../src/entries.ts#L42)
      <a id="map.entries.EntryScope"></a><br>The graph with the facts it was built from, by file, and every fn by id: what resolves a written name to a fn and places it.
    - fn [entryScope](../../src/entries.ts#L49) (graph: Graph, facts: readonly FileFacts[]) → EntryScope
      <a id="map.entries.entryScope"></a><br>Index the graph for the collectors: facts by path, and every fn (nested modules included) by ID.
    - fn [placeOf](../../src/entries.ts#L64) (scope: EntryScope, id: string, fallback: { file: string; line: number }) → { file: string; line: number } <!-- internal -->
      <a id="map.entries.placeOf"></a><br>Where an entry's id is declared: the fn, else the module's file and first line.
    - fn [frameworkEntry](../../src/entries.ts#L75) (scope: EntryScope, framework: string, kind: EntryPoint["kind"], id: string, label: string, source: string, fallback: { file: string; line: number }) → EntryPoint
      <a id="map.entries.frameworkEntry"></a><br>An entry a framework adapter found: placed like a language-level one, with its framework's name.
      - calls [map.entries.entry](map.md#map.entries.entry)
    - fn [entry](../../src/entries.ts#L80) (scope: EntryScope, kind: EntryPoint["kind"], id: string, label: string, source: string, fallback: { file: string; line: number }) → EntryPoint <!-- internal -->
      <a id="map.entries.entry"></a><br>A fn's place for the entry, with the manifest or the code position the fact is written at as `source`.
      - calls [map.entries.placeOf](map.md#map.entries.placeOf)
    - fn [collectEntries](../../src/entries.ts#L87) (inputs: EntryInputs) → EntryPoint[]
      <a id="map.entries.collectEntries"></a><br>Every language-level entry point of the inputs, in a deterministic order: kind, label, id.
      - calls [map.entries.entryScope](map.md#map.entries.entryScope), [map.entries.binEntries](map.md#map.entries.binEntries), [map.entries.nextRouteEntries](map.md#map.entries.nextRouteEntries), [map.entries.expressRouteEntries](map.md#map.entries.expressRouteEntries), [map.entries.pythonMainEntries](map.md#map.entries.pythonMainEntries), [map.entries.pyprojectScriptEntries](map.md#map.entries.pyprojectScriptEntries), [map.entries.rustMainEntries](map.md#map.entries.rustMainEntries), [map.entries.phpScriptEntries](map.md#map.entries.phpScriptEntries), [map.entries.compareEntries](map.md#map.entries.compareEntries)
    - fn [compareEntries](../../src/entries.ts#L118) (a: EntryPoint, b: EntryPoint) → number
      <a id="map.entries.compareEntries"></a><br>The entry order of the snapshot: kind, label, ID, file, line.
      - calls [map.entries.cmp](map.md#map.entries.cmp)
    - fn [binTargets](../../src/entries.ts#L123) (packageJson: string | null) → { name: string; path: string }[]
      <a id="map.entries.binTargets"></a><br>`bin` of the root package.json: `"bin": "cli.js"` (named after the package) or `"bin": {name: path}`. Paths are POSIX, relative to the manifest.
      - calls [map.imports.parseJsonc](map.md#map.imports.parseJsonc), [map.entries.isParsedJsonObject](map.md#map.entries.isParsedJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString), [map.entries.normalizePath](map.md#map.entries.normalizePath), [base.json.isJsonObject](base.md#base.json.isJsonObject)
    - fn [binSource](../../src/entries.ts#L147) (path: string, has: (path: string) => boolean) → string | null
      <a id="map.entries.binSource"></a><br>The source file a `bin` path names: itself when the graph has it, else the TypeScript source of a JavaScript path in the same place (`bin/cli.js` → `bin/cli.ts`). A built file outside the sources resolves to nothing.
    - fn [binEntries](../../src/entries.ts#L155) (packageJson: string | null, scope: EntryScope) → EntryPoint[] <!-- internal -->
      <a id="map.entries.binEntries"></a><br>`cli` entries from package.json `bin`, one per name whose file has a source in the graph.
      - calls [map.entries.binTargets](map.md#map.entries.binTargets), [map.entries.binSource](map.md#map.entries.binSource), [map.entries.fnIn](map.md#map.entries.fnIn), [map.entries.entry](map.md#map.entries.entry)
    - fn [nextRoutePath](../../src/entries.ts#L183) (file: string) → string | null
      <a id="map.entries.nextRoutePath"></a><br>The URL path of a Next.js `app/**\/route.ts`: the directories after `app/`, without route groups (`(marketing)`); `/` for the root handler. Null for a file that is no route handler.
    - fn [nextRouteEntries](../../src/entries.ts#L194) (facts: readonly FileFacts[], scope: EntryScope) → EntryPoint[] <!-- internal -->
      <a id="map.entries.nextRouteEntries"></a><br>`route` entries for the HTTP-method handlers a Next.js route file exports.
      - calls [map.entries.nextRoutePath](map.md#map.entries.nextRoutePath), [map.entries.fnIn](map.md#map.entries.fnIn), [map.entries.entry](map.md#map.entries.entry)
    - fn [expressRouteEntries](../../src/entries.ts#L224) (facts: readonly FileFacts[], scope: EntryScope) → EntryPoint[] <!-- internal -->
      <a id="map.entries.expressRouteEntries"></a><br>`route` entries for `app.get('/x', h)`-style registrations the frontend recorded with a literal path and a named handler.
      - calls [map.entries.fnIn](map.md#map.entries.fnIn), [map.entries.entry](map.md#map.entries.entry)
    - fn [pythonMainEntries](../../src/entries.ts#L240) (facts: readonly FileFacts[], scope: EntryScope) → EntryPoint[] <!-- internal -->
      <a id="map.entries.pythonMainEntries"></a><br>`main` entries for Python `if __name__ == "__main__":` blocks: the fn the block calls, else the module.
      - calls [map.entries.fnIn](map.md#map.entries.fnIn), [map.entries.entry](map.md#map.entries.entry)
    - fn [pyprojectScripts](../../src/entries.ts#L258) (pyproject: string | null) → { name: string; module: string; fn: string | null }[]
      <a id="map.entries.pyprojectScripts"></a><br>`[project.scripts]` of pyproject.toml: script name → `pkg.module:func` (or `pkg.module` alone). Empty for no manifest or an unreadable one.
      - calls [map.entries.isTomlTable](map.md#map.entries.isTomlTable), [map.entries.isTomlString](map.md#map.entries.isTomlString)
    - fn [pythonModuleFile](../../src/entries.ts#L288) (module: string, has: (path: string) => boolean) → string | null
      <a id="map.entries.pythonModuleFile"></a><br>The source file of a dotted Python module name, at the root or under `src/`: `pkg.cli` → `pkg/cli.py`, `pkg/cli/__init__.py`, `src/pkg/cli.py`, …
    - fn [pyprojectScriptEntries](../../src/entries.ts#L296) (pyproject: string | null, scope: EntryScope) → EntryPoint[] <!-- internal -->
      <a id="map.entries.pyprojectScriptEntries"></a><br>`cli` entries for pyproject.toml scripts whose module is a file of the graph.
      - calls [map.entries.pyprojectScripts](map.md#map.entries.pyprojectScripts), [map.entries.pythonModuleFile](map.md#map.entries.pythonModuleFile), [map.entries.fnIn](map.md#map.entries.fnIn), [map.entries.entry](map.md#map.entries.entry)
    - fn [rustBinTarget](../../src/entries.ts#L319) (file: string, cargoToml: string | null, exists: (path: string) => boolean) → boolean
      <a id="map.entries.rustBinTarget"></a><br>Whether a Rust file is a bin target by Cargo's layout: `src/main.rs`, `src/bin/<name>.rs` or `src/bin/<name>/main.rs` of a crate (a `Cargo.toml` beside its `src/`), or a `[[bin]] path` of the root manifest.
      - calls [map.entries.isTomlTable](map.md#map.entries.isTomlTable), [map.entries.isTomlString](map.md#map.entries.isTomlString), [map.entries.normalizePath](map.md#map.entries.normalizePath)
    - fn [rustMainEntries](../../src/entries.ts#L341) (facts: readonly FileFacts[], scope: EntryScope, cargoToml: string | null, exists: (path: string) => boolean) → EntryPoint[] <!-- internal -->
      <a id="map.entries.rustMainEntries"></a><br>`main` entries for `fn main` of each Rust bin target.
      - calls [map.entries.rustBinTarget](map.md#map.entries.rustBinTarget), [map.entries.fnIn](map.md#map.entries.fnIn), [map.entries.entry](map.md#map.entries.entry)
    - fn [phpScript](../../src/entries.ts#L361) (file: Pick<FileFacts, "path" | "decls" | "moduleCalls">) → boolean
      <a id="map.entries.phpScript"></a><br>A PHP file run as a script, by its place: `bin/*.php` or `public/index.php`, with code at its top level. A class in `bin/` is a declaration, not a script.
    - fn [phpScriptEntries](../../src/entries.ts#L366) (facts: readonly FileFacts[], scope: EntryScope) → EntryPoint[] <!-- internal -->
      <a id="map.entries.phpScriptEntries"></a><br>`main` entries for PHP scripts; the entry is the file's module, since a script has no main fn.
      - calls [map.entries.phpScript](map.md#map.entries.phpScript), [map.entries.entry](map.md#map.entries.entry)
    - fn [fnIn](../../src/entries.ts#L386) (scope: EntryScope, file: string, name: string) → string | null
      <a id="map.entries.fnIn"></a><br>The fn a name written in `file` stands for: a fn declared there (`h`, or `Class.method`), or one imported under that name (`import { h } from "./handlers"`, `import handlers from`; `handlers.save` through a module import). Null when the graph does not resolve it: a name is no…
      - calls [map.entries.importedSymbol](map.md#map.entries.importedSymbol)
    - fn [importedSymbol](../../src/entries.ts#L419) (scope: EntryScope, module: Module, file: string, local: string, member: string | null) → string | null <!-- internal -->
      <a id="map.entries.importedSymbol"></a><br>The symbol an import of `file` binds `local` to; with `member`, the export of a module import (`ns.member`).
    - fn [normalizePath](../../src/entries.ts#L452) (path: string) → string <!-- internal -->
      <a id="map.entries.normalizePath"></a><br>A manifest path in POSIX form without a leading `./`.
    - fn [isParsedJsonObject](../../src/entries.ts#L457) (value: unknown) → value is JsonObject <!-- internal -->
      <a id="map.entries.isParsedJsonObject"></a><br>A JSON object out of `parseJsonc`, which returns what `JSON.parse` does, or null for unreadable text.
    - fn [isTomlTable](../../src/entries.ts#L462) (value: TomlValue | undefined) → value is TomlTable <!-- internal -->
      <a id="map.entries.isTomlTable"></a><br>A TOML table: an object that is neither an array nor a date.
    - fn [isTomlString](../../src/entries.ts#L467) (value: TomlValue | undefined) → value is string <!-- internal -->
      <a id="map.entries.isTomlString"></a><br>A TOML string value.
    - fn [cmp](../../src/entries.ts#L472) (a: string, b: string) → number <!-- internal -->
      <a id="map.entries.cmp"></a><br>Plain code-unit order, independent of locale.
  - module [exact-path](../../src/exact-path.ts#L1)
    <a id="map.exact-path"></a><br>Whether a path keylang derived from code exists on disk with exactly that spelling. `existsSync` answers for the file system: on APFS and NTFS `src/models/User.rs` exists when `src/models/user.rs` does, so a resolver that trusts it names a file the index does not have, and a…
    - node [external.node](external.md#external.node)
    - type [ExactFs](../../src/exact-path.ts#L14)
      <a id="map.exact-path.ExactFs"></a><br>The two calls the check makes, replaceable in tests that emulate a case-insensitive file system.
    - fn [exactExistence](../../src/exact-path.ts#L27) (root: string, fs: ExactFs = nodeFs) → (file: string) => boolean
      <a id="map.exact-path.exactExistence"></a><br>A predicate over POSIX paths relative to `root`: the file or directory exists, spelled exactly so. Listings are read once per directory, so the predicate is for one analysis, as a resolver is.
  - module [explanations](../../src/explanations.ts#L1)
    <a id="map.explanations"></a><br>Explanations of nodes (ADR 0004): the documentation comment in the code first, then a brief a model wrote, saved under `<dir>/explain/brief/`. One lookup for the explained map, the TUI, MCP and the language server; the store and its baselines live here so that lookup needs no…
    - node [external.node](external.md#external.node)
    - brief [base.brief](base.md#base.brief)
    - config [base.config](base.md#base.config)
    - graph [map.graph](map.md#map.graph)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - type [ExplanationDetail](../../src/explanations.ts#L19) = "short" | "full" | "brief"
      <a id="map.explanations.ExplanationDetail"></a><br>`short` and `full` answer `explain <id> --llm`; `brief` is the one or two sentences of the explained map.
    - type [StoredExplanation](../../src/explanations.ts#L22)
      <a id="map.explanations.StoredExplanation"></a><br>An explanation a model wrote, with the header it is saved under.
    - fn [isStoredExplanation](../../src/explanations.ts#L37) (text: string) → boolean
      <a id="map.explanations.isStoredExplanation"></a><br>A file `explain --llm` wrote: the model's text under keylang's header, not keylang Markdown to parse or format.
    - fn [isExplanationDetail](../../src/explanations.ts#L42) (text: string) → text is ExplanationDetail <!-- internal -->
      <a id="map.explanations.isExplanationDetail"></a><br>Whether `text` is one of the three details.
    - fn [parseStoredExplanation](../../src/explanations.ts#L47) (text: string) → StoredExplanation | null
      <a id="map.explanations.parseStoredExplanation"></a><br>The saved form; null for a file keylang did not write, which is not an explanation it can date.
      - calls [map.explanations.isExplanationDetail](map.md#map.explanations.isExplanationDetail)
    - fn [formatStoredExplanation](../../src/explanations.ts#L60) (e: StoredExplanation) → string
      <a id="map.explanations.formatStoredExplanation"></a><br>The file text of a saved explanation: the header line, then the model's text.
    - fn [explainDir](../../src/explanations.ts#L65) (config: Pick<Config, "dir">) → string
      <a id="map.explanations.explainDir"></a><br>Where explanations are saved, relative to the root: `<dir>/explain`, committed next to the map.
      - calls [base.config.specPath](base.md#base.config.specPath)
    - fn [explanationPath](../../src/explanations.ts#L83) (config: Pick<Config, "dir"> & { root?: string }, id: string, detail: ExplanationDetail, also: Iterable<string> = []) → string
      <a id="map.explanations.explanationPath"></a><br>File of an explanation relative to the root: `<dir>/explain/<id>.md`, a brief in `<dir>/explain/brief/<id>.md`. IDs that differ only in letter case (`type Order`, `fn order`) would share that file on APFS and NTFS, and a checkout of both breaks there, so an ID with such a twin…
      - calls [map.explanations.explainDir](map.md#map.explanations.explainDir), [map.explanations.storeName](map.md#map.explanations.storeName), [map.explanations.storeNames](map.md#map.explanations.storeNames)
    - fn [storeName](../../src/explanations.ts#L90) (names: readonly string[], id: string, also: Iterable<string>) → string <!-- internal -->
      <a id="map.explanations.storeName"></a><br>The file name of `id` in a store whose files are `names`.
      - calls [map.explanations.storedId](map.md#map.explanations.storedId)
    - fn [storedId](../../src/explanations.ts#L108) (name: string) → string <!-- internal -->
      <a id="map.explanations.storedId"></a><br>The ID a store file saves: `<id>.md` or `<id>~<hash>.md`.
    - fn [storeNames](../../src/explanations.ts#L113) (root: string, dir: string) → string[] <!-- internal -->
      <a id="map.explanations.storeNames"></a><br>Names of the `.md` files in `dir` (relative to the root), as the listing spells them.
    - fn [readStoredExplanation](../../src/explanations.ts#L125) (root: string, rel: string) → StoredExplanation | null
      <a id="map.explanations.readStoredExplanation"></a><br>The saved explanation at `rel` (relative to `root`), or null when there is no file or no keylang header.
      - calls [map.explanations.parseStoredExplanation](map.md#map.explanations.parseStoredExplanation)
    - fn [storedIds](../../src/explanations.ts#L132) (root: string, dir: string) → string[]
      <a id="map.explanations.storedIds"></a><br>IDs with a saved file in `dir` (relative to the root), sorted.
      - calls [map.explanations.storedId](map.md#map.explanations.storedId), [map.explanations.storeNames](map.md#map.explanations.storeNames)
    - fn [loadBriefs](../../src/explanations.ts#L137) (config: Config) → Map<string, StoredExplanation>
      <a id="map.explanations.loadBriefs"></a><br>Briefs saved under `<dir>/explain/brief/`, by ID. A file without keylang's header is not one.
      - calls [map.explanations.explainDir](map.md#map.explanations.explainDir), [map.explanations.storeNames](map.md#map.explanations.storeNames), [map.explanations.storedId](map.md#map.explanations.storedId), [map.explanations.readStoredExplanation](map.md#map.explanations.readStoredExplanation), [map.explanations.storeName](map.md#map.explanations.storeName)
    - fn [snapshotBaseline](../../src/explanations.ts#L167) (snapshot: AnalysisSnapshot, id: string) → string | null
      <a id="map.explanations.snapshotBaseline"></a><br>The baseline an explanation of `id` is compared with: the closure fingerprint of a fn or type; for a module, class or layer, which has no closure of its own, a hash of its dependencies, of its own value code (`values`: top-level constants, assignments, object tables, a class's…
      - calls [map.explanations.lowerBound](map.md#map.explanations.lowerBound)
    - fn [lowerBound](../../src/explanations.ts#L208) (sorted: readonly string[], key: string) → number <!-- internal -->
      <a id="map.explanations.lowerBound"></a><br>The first index in `sorted` whose value is not less than `key` (binary search).
    - fn [ownLayers](../../src/explanations.ts#L231) (snapshot: AnalysisSnapshot) → string[]
      <a id="map.explanations.ownLayers"></a><br>Layers of the snapshot that are the repository's own, sorted: packages outside it are left out.
    - fn [systemBaseline](../../src/explanations.ts#L242) (snapshot: AnalysisSnapshot, briefs: ReadonlyMap<string, StoredExplanation>) → string
      <a id="map.explanations.systemBaseline"></a><br>The baseline of the repository's brief: its layers and what the explained map says about each. A new layer or a rewritten layer brief makes the repository's brief stale; a change of code below a layer does not.
      - calls [map.explanations.ownLayers](map.md#map.explanations.ownLayers), [map.explanations.explanationOf](map.md#map.explanations.explanationOf)
    - type [NodeExplanation](../../src/explanations.ts#L249)
      <a id="map.explanations.NodeExplanation"></a><br>What a node is, in plain words, and where the words come from.
    - fn [explanationOf](../../src/explanations.ts#L267) (snapshot: AnalysisSnapshot, briefs: ReadonlyMap<string, StoredExplanation>, id: string) → NodeExplanation | null
      <a id="map.explanations.explanationOf"></a><br>The explanation of a node: its documentation comment, else its saved brief (fresh or stale), else null. Never a `short` or `full` explanation: those answer a question about one node, not a line of the map.
      - calls [map.explanations.briefExplanation](map.md#map.explanations.briefExplanation), [map.explanations.systemBaseline](map.md#map.explanations.systemBaseline), [map.explanations.snapshotBaseline](map.md#map.explanations.snapshotBaseline)
    - fn [briefExplanation](../../src/explanations.ts#L293) (brief: StoredExplanation | undefined, baseline: () => string | null) → NodeExplanation | null <!-- internal -->
      <a id="map.explanations.briefExplanation"></a><br>A saved brief as an explanation, judged stale against `baseline`; null without a brief or when it has no brief sentence.
      - calls [base.brief.briefOf](base.md#base.brief.briefOf)
    - fn [modelName](../../src/explanations.ts#L302) (agent: string) → string
      <a id="map.explanations.modelName"></a><br>The model of an agent, as the map shows it: `claude-sonnet-5` for `anthropic:claude-sonnet-5`.
  - module [exports](../../src/exports.ts#L1)
    <a id="map.exports"></a><br>Export tables: the symbol each public name of a module stands for, following aliases, re-export chains, namespaces and `export *`. Plain data in and out: the graph builds the rows from facts, call resolution and the snapshot's `exports` read the result, so both see the same…
    - type [ExportKind](../../src/exports.ts#L15) = "fn" | "class" | "type" | "value"
      <a id="map.exports.ExportKind"></a><br>What kind of thing a public name is.
    - type [ExportForm](../../src/exports.ts#L18) = "alias" | "default" | "reexport" | "namespace"
      <a id="map.exports.ExportForm"></a><br>How a name is exported when it is not a plain `export` of a local declaration.
    - type [ExportTarget](../../src/exports.ts#L24)
      <a id="map.exports.ExportTarget"></a><br>What a name written in a module stands for, before resolution.
    - type [ExportRowInput](../../src/exports.ts#L35)
      <a id="map.exports.ExportRowInput"></a><br>One public name as a file writes it, before chains are followed.
    - type [ModuleExportsInput](../../src/exports.ts#L48)
      <a id="map.exports.ModuleExportsInput"></a><br>Everything one module contributes to the export tables.
    - type [ExportEntry](../../src/exports.ts#L60)
      <a id="map.exports.ExportEntry"></a><br>A resolved public name of a module: the symbol it stands for and how it got there.
    - type [ExportTables](../../src/exports.ts#L74)
      <a id="map.exports.ExportTables"></a><br>The resolved export tables of every module, queried lazily and memoized.
    - type [Result](../../src/exports.ts#L88) <!-- internal -->
      <a id="map.exports.Result"></a><br>A computed value plus what it depended on, for cycle-aware memoization.
    - fn [resolveExports](../../src/exports.ts#L99) (inputs: ReadonlyMap<string, ModuleExportsInput>, symbolKind: (id: string) => ExportKind | null, declared: (module: string, name: string) => string | null) → ExportTables
      <a id="map.exports.resolveExports"></a><br>Build the export tables of all modules. `symbolKind` gives a node's kind (null when unknown); `declared` finds a module's own declaration of a name, the fallback for an importer when there is no export entry.
      - calls [map.exports.pickStar](map.md#map.exports.pickStar), [map.exports.compare](map.md#map.exports.compare)
    - fn [pickStar](../../src/exports.ts#L270) (module: string, name: string, found: readonly { entry: ExportEntry; star: string | null }[], lastWins = false) → ExportEntry | null <!-- internal -->
      <a id="map.exports.pickStar"></a><br>The entry `export *` gives a name: the one source that has it. Two sources whose names stand for different declarations make the name ambiguous, and ESM exports neither; with `lastWins` (Python's glob imports) the last such source gives it.
    - fn [compare](../../src/exports.ts#L304) (a: string, b: string) → number <!-- internal -->
      <a id="map.exports.compare"></a><br>Plain code-unit order, independent of locale.
  - module [fact-cache](../../src/fact-cache.ts#L1)
    <a id="map.fact-cache"></a><br>Extracted facts reused across runs. A file's facts depend only on its path, its content, and the extractor with its grammars, so that is the key; the graph and the snapshot are rebuilt from all facts every time, which keeps resolution of importers consistent when an export…
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - facts [extract.facts](extract.md#extract.facts)
    - adapter [base.adapter](base.md#base.adapter)
    - json [base.json](base.md#base.json)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - span [base.span](base.md#base.span)
    - type [StoredFacts](../../src/fact-cache.ts#L33) = Omit<FileFacts, "exports"> & { exports: string[] } <!-- internal -->
      <a id="map.fact-cache.StoredFacts"></a><br>`FileFacts` as JSON: the `exports` set is stored as a sorted array.
    - type [Stored](../../src/fact-cache.ts#L36) <!-- internal -->
      <a id="map.fact-cache.Stored"></a><br>The whole cache file: schema, extractor version, and entries by path keyed by content hash.
    - type [Field](../../src/fact-cache.ts#L45) = JsonValue | undefined <!-- internal -->
      <a id="map.fact-cache.Field"></a><br>A field of a parsed cache entry: absent, or any JSON value.
    - fn [storedConfigs](../../src/fact-cache.ts#L48) (value: JsonValue, version: string) → NonNullable<Stored["configs"]> <!-- internal -->
      <a id="map.fact-cache.storedConfigs"></a><br>Config entries of a cache of this schema and version; one of the wrong shape is parsed again.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString), [base.adapter.isConfigFacts](base.md#base.adapter.isConfigFacts)
    - fn [storedFiles](../../src/fact-cache.ts#L66) (value: JsonValue, version: string) → Stored["files"] <!-- internal -->
      <a id="map.fact-cache.storedFiles"></a><br>Entries of a cache written by this schema and version. An entry of the wrong shape — any field the graph reads, at any depth — is dropped, so its file is extracted again instead of trusted or thrown on.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString), [map.fact-cache.isStoredFacts](map.md#map.fact-cache.isStoredFacts)
    - fn [isStoredFacts](../../src/fact-cache.ts#L80) (value: Field) → value is JsonObject & StoredFacts <!-- internal -->
      <a id="map.fact-cache.isStoredFacts"></a><br>A JSON object with every field of `StoredFacts`, checked at any depth.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString), [map.fact-cache.isPosition](map.md#map.fact-cache.isPosition), [map.fact-cache.isImport](map.md#map.fact-cache.isImport), [map.fact-cache.every](map.md#map.fact-cache.every), [map.fact-cache.isDecl](map.md#map.fact-cache.isDecl), [map.fact-cache.isString](map.md#map.fact-cache.isString), [map.fact-cache.isExportRow](map.md#map.fact-cache.isExportRow), [map.fact-cache.isRange](map.md#map.fact-cache.isRange), [map.fact-cache.optionalTrue](map.md#map.fact-cache.optionalTrue), [map.fact-cache.isCall](map.md#map.fact-cache.isCall), [map.fact-cache.optional](map.md#map.fact-cache.optional)
    - fn [isImport](../../src/fact-cache.ts#L103) (value: Field) → boolean <!-- internal -->
      <a id="map.fact-cache.isImport"></a><br>An `ImportFact` of the right shape, bindings included.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString), [map.fact-cache.isRange](map.md#map.fact-cache.isRange), [base.json.isJsonBoolean](base.md#base.json.isJsonBoolean), [map.fact-cache.optionalTrue](map.md#map.fact-cache.optionalTrue), [map.fact-cache.every](map.md#map.fact-cache.every)
    - fn [isDecl](../../src/fact-cache.ts#L119) (value: Field) → boolean <!-- internal -->
      <a id="map.fact-cache.isDecl"></a><br>A `DeclFact` of the right shape, its calls, types and members checked recursively.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString), [map.fact-cache.isRange](map.md#map.fact-cache.isRange), [base.json.isJsonBoolean](base.md#base.json.isJsonBoolean), [map.fact-cache.isCall](map.md#map.fact-cache.isCall), [map.fact-cache.every](map.md#map.fact-cache.every), [map.fact-cache.isString](map.md#map.fact-cache.isString), [map.fact-cache.optional](map.md#map.fact-cache.optional), [map.fact-cache.optionalTrue](map.md#map.fact-cache.optionalTrue)
    - fn [isCall](../../src/fact-cache.ts#L143) (value: Field) → boolean <!-- internal -->
      <a id="map.fact-cache.isCall"></a><br>A `CallFact` of the right shape.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString), [map.fact-cache.isRange](map.md#map.fact-cache.isRange), [map.fact-cache.optionalTrue](map.md#map.fact-cache.optionalTrue), [map.fact-cache.isBound](map.md#map.fact-cache.isBound), [map.fact-cache.optional](map.md#map.fact-cache.optional), [map.fact-cache.isString](map.md#map.fact-cache.isString), [map.fact-cache.isHook](map.md#map.fact-cache.isHook), [map.fact-cache.isPass](map.md#map.fact-cache.isPass), [map.fact-cache.every](map.md#map.fact-cache.every)
    - fn [isHook](../../src/fact-cache.ts#L159) (value: Field) → boolean <!-- internal -->
      <a id="map.fact-cache.isHook"></a><br>A `HookFact` of the right shape.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString), [map.fact-cache.isInteger](map.md#map.fact-cache.isInteger)
    - fn [isPass](../../src/fact-cache.ts#L171) (value: Field) → boolean <!-- internal -->
      <a id="map.fact-cache.isPass"></a><br>A `PassFact` of the right shape.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString), [map.fact-cache.isBound](map.md#map.fact-cache.isBound), [map.fact-cache.optional](map.md#map.fact-cache.optional), [map.fact-cache.isString](map.md#map.fact-cache.isString)
    - fn [isExportRow](../../src/fact-cache.ts#L181) (value: Field) → boolean <!-- internal -->
      <a id="map.fact-cache.isExportRow"></a><br>An `ExportRow` of the right shape.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString), [map.fact-cache.optional](map.md#map.fact-cache.optional), [map.fact-cache.isString](map.md#map.fact-cache.isString)
    - fn [isBound](../../src/fact-cache.ts#L186) (value: Field) → boolean <!-- internal -->
      <a id="map.fact-cache.isBound"></a><br>How a call's receiver is bound: a parameter or a local.
    - fn [isRange](../../src/fact-cache.ts#L191) (value: JsonObject) → boolean <!-- internal -->
      <a id="map.fact-cache.isRange"></a><br>1-based `line`, `col`, `endLine`, `endCol`.
      - calls [map.fact-cache.isPosition](map.md#map.fact-cache.isPosition)
    - fn [isPosition](../../src/fact-cache.ts#L196) (value: Field) → boolean <!-- internal -->
      <a id="map.fact-cache.isPosition"></a><br>A 1-based line or column.
      - calls [map.fact-cache.isInteger](map.md#map.fact-cache.isInteger)
    - fn [isInteger](../../src/fact-cache.ts#L201) (value: Field) → value is number <!-- internal -->
      <a id="map.fact-cache.isInteger"></a><br>A JSON number with no fraction.
      - calls [base.json.isJsonNumber](base.md#base.json.isJsonNumber)
    - fn [isString](../../src/fact-cache.ts#L206) (value: Field) → boolean <!-- internal -->
      <a id="map.fact-cache.isString"></a><br>A JSON string, as a plain predicate for `every` and `optional`.
      - calls [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [every](../../src/fact-cache.ts#L211) (value: Field, check: (item: JsonValue) => boolean) → boolean <!-- internal -->
      <a id="map.fact-cache.every"></a><br>An array whose every item passes `check`.
    - fn [optional](../../src/fact-cache.ts#L216) (value: Field, check: (item: JsonValue) => boolean) → boolean <!-- internal -->
      <a id="map.fact-cache.optional"></a><br>Absent, or present and passing `check`.
    - fn [optionalTrue](../../src/fact-cache.ts#L221) (value: Field) → boolean <!-- internal -->
      <a id="map.fact-cache.optionalTrue"></a><br>Absent, or `true`: the encoding of an optional flag.
    - module [FactCache](../../src/fact-cache.ts#L234)
      <a id="map.fact-cache.FactCache"></a><br>The fact cache of one analysis: lookups by content hash, and the entries this run used, for saving.
      - fn [constructor](../../src/fact-cache.ts#L245) (root: string, version: string, disk: Stored["files"], configs: NonNullable<Stored["configs"]>) <!-- internal -->
        <a id="map.fact-cache.FactCache.constructor"></a><br>Stores the given repository root, cache version string, and previously loaded per-file entries on the instance; private, so instances are only created through the class's own factory methods. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - fn [open](../../src/fact-cache.ts#L253) (root: string, version: string) → FactCache
        <a id="map.fact-cache.FactCache.open"></a><br>`version` names the extractor and grammars; any other stored version is ignored.
        - calls [base.json.parseJson](base.md#base.json.parseJson), [map.fact-cache.storedFiles](map.md#map.fact-cache.storedFiles), [map.fact-cache.storedConfigs](map.md#map.fact-cache.storedConfigs), [map.fact-cache.FactCache](map.md#map.fact-cache.FactCache)
      - fn [facts](../../src/fact-cache.ts#L274) (path: string, sha256: string, extract: () => Promise<FileFacts>) → Promise<FileFacts>
        <a id="map.fact-cache.FactCache.facts"></a><br>The facts of `path` with content hash `sha256`: from memory, else disk, else `extract`.
      - fn [config](../../src/fact-cache.ts#L305) (path: string, sha256: string, adapter: string, parse: () => ConfigFacts) → ConfigFacts
        <a id="map.fact-cache.FactCache.config"></a><br>The facts of a framework config file (ADR 0022), by its content: a config whose text changed is parsed again, as a source file is. `adapter` names the adapter and its version, part of the key.
      - fn [changed](../../src/fact-cache.ts#L335) () → boolean
        <a id="map.fact-cache.FactCache.changed"></a><br>Whether the facts of this run differ from the cache on disk: a file the disk has no entry for or holds for other content, or an entry of a file this run did not read. Unchanged, a write would put back the same facts.
      - fn [serialize](../../src/fact-cache.ts#L349) () → string
        <a id="map.fact-cache.FactCache.serialize"></a><br>The text of `FACT_CACHE_FILE` with the facts of this run (and nothing else), for the next process.
        - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [keepsFactCache](../../src/fact-cache.ts#L372) (root: string) → boolean
      <a id="map.fact-cache.keepsFactCache"></a><br>A repository keylang was set up in (`keylang.json`) keeps the fact cache from every analysis of the saved files; one only browsed gets nothing written.
    - fn [saveFactCache](../../src/fact-cache.ts#L383) (root: string, text: string) → boolean
      <a id="map.fact-cache.saveFactCache"></a><br>Writes the fact cache for the next process, best-effort: the cache only saves time, so a write the protocol refuses (a link out of `.keylang/`) or the file system refuses (read-only, a sandbox, EACCES) leaves the old cache, or none, and is no error. The generator's bytes, as…
      - calls [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic), [base.safe-write.landing](base.md#base.safe-write.landing)
  - module [index](../../src/framework-code/index.ts#L1)
    <a id="map.index"></a><br>Facts the framework adapters take from code rather than config files (ADR 0022): Laravel's service providers and route files, Symfony's attributes. They read the PHP extractor's facts, so they live beside the graph (layer `map`) while the adapters themselves (`src/frameworks/`)…
    - facts [extract.facts](extract.md#extract.facts)
    - adapter [base.adapter](base.md#base.adapter)
    - laravel [map.laravel](map.md#map.laravel)
    - symfony [map.symfony](map.md#map.symfony)
    - type [CodeReader](../../src/framework-code/index.ts#L17)
      <a id="map.index.CodeReader"></a><br>What an adapter reads from code: one config per source file that says anything, given the adapter's parsed config files.
  - module [laravel](../../src/framework-code/laravel.ts#L1)
    <a id="map.laravel"></a><br>What Laravel wires in code (ADR 0022; business-flows 35), for the adapter `src/frameworks/laravel.ts`. Laravel writes its wiring in PHP, not in config files: service providers bind interfaces (`$this->app->bind(I::class, C::class)`, `$bindings`, `$singletons`)…
    - node [external.node](external.md#external.node)
    - facts [extract.facts](extract.md#extract.facts)
    - adapter [base.adapter](base.md#base.adapter)
    - php [map.php](map.md#map.php)
    - type [RouteVerbs](../../src/framework-code/laravel.ts#L56) <!-- internal -->
      <a id="map.laravel.RouteVerbs"></a><br>The HTTP methods of a `Route::<verb>` registration, by the verb in lower case; `any` names none.
    - fn [isOneOf](../../src/framework-code/laravel.ts#L74) (name: string | null | undefined, names: readonly string[]) → boolean <!-- internal -->
      <a id="map.laravel.isOneOf"></a><br>Whether a class name is one of `names`, compared as PHP class names.
      - calls [map.php.key](map.md#map.php.key)
    - fn [laravelFacts](../../src/framework-code/laravel.ts#L79) (files: readonly FileFacts[]) → FrameworkConfig[]
      <a id="map.laravel.laravelFacts"></a><br>What a Laravel repository's code wires, one `ConfigFacts` per file that says anything.
      - calls [map.php.PhpCode](map.md#map.php.PhpCode), [map.php.codeFacts](map.md#map.php.codeFacts), [map.php.PhpCode.extends](map.md#map.php.PhpCode.extends), [map.laravel.readProvider](map.md#map.laravel.readProvider), [map.laravel.readFacade](map.md#map.laravel.readFacade), [map.php.key](map.md#map.php.key), [map.laravel.readCommand](map.md#map.laravel.readCommand), [map.php.PhpCode.implements](map.md#map.php.PhpCode.implements), [map.php.PhpCode.method](map.md#map.php.PhpCode.method), [map.php.type](map.md#map.php.type), [map.laravel.commandNames](map.md#map.laravel.commandNames), [map.laravel.readRoutes](map.md#map.laravel.readRoutes), [map.laravel.readConsole](map.md#map.laravel.readConsole), [map.laravel.readKernel](map.md#map.laravel.readKernel), [map.php.dispatchesIn](map.md#map.php.dispatchesIn), [map.php.hasFacts](map.md#map.php.hasFacts)
    - fn [readProvider](../../src/framework-code/laravel.ts#L135) (code: PhpCode, provider: PhpClass, facts: ConfigFacts, keyed: Map<string, string>) → void <!-- internal -->
      <a id="map.laravel.readProvider"></a><br>A service provider: its `$bindings`, `$singletons`, `$listen`, `$subscribe` and the container calls of its methods.
      - calls [map.laravel.bind](map.md#map.laravel.bind), [map.php.eventName](map.md#map.php.eventName), [map.laravel.listen](map.md#map.laravel.listen), [map.php.cls](map.md#map.php.cls), [map.laravel.subscribe](map.md#map.laravel.subscribe), [map.php.arg](map.md#map.php.arg), [map.laravel.isOneOf](map.md#map.laravel.isOneOf), [map.php.PhpCode.calleeClass](map.md#map.php.PhpCode.calleeClass)
    - fn [bind](../../src/framework-code/laravel.ts#L177) (facts: ConfigFacts, keyed: Map<string, string>, abstract: LiteralFact | null, concrete: LiteralFact | null, at: { line: number; col: number }, written: string) → void <!-- internal -->
      <a id="map.laravel.bind"></a><br>One binding of a provider: `I::class => C::class`, `bind(I::class, C::class)`; a string key is the container's name for the class.
      - calls [map.php.cls](map.md#map.php.cls), [map.php.str](map.md#map.php.str), [map.php.key](map.md#map.php.key), [map.php.type](map.md#map.php.type)
    - fn [listen](../../src/framework-code/laravel.ts#L196) (code: PhpCode, file: string, facts: ConfigFacts, event: string, listener: LiteralFact, at: { line: number; col: number }) → void <!-- internal -->
      <a id="map.laravel.listen"></a><br>A listener of `$listen` or `Event::listen`: `L::class` (its `handle`), `[L::class, 'm']`, `'L@m'`.
      - calls [map.laravel.shortName](map.md#map.laravel.shortName), [map.php.type](map.md#map.php.type), [map.php.key](map.md#map.php.key), [map.php.PhpCode.method](map.md#map.php.PhpCode.method)
    - fn [subscribe](../../src/framework-code/laravel.ts#L219) (code: PhpCode, subscriber: string, facts: ConfigFacts, at: { line: number; col: number }) → void <!-- internal -->
      <a id="map.laravel.subscribe"></a><br>A subscriber of `$subscribe`: the array its `subscribe()` returns (`[OrderPlaced::class => 'handleOrder']`); otherwise a hole.
      - calls [map.php.PhpCode.method](map.md#map.php.PhpCode.method), [map.php.eventName](map.md#map.php.eventName), [map.php.str](map.md#map.php.str), [map.laravel.shortName](map.md#map.laravel.shortName), [map.php.type](map.md#map.php.type)
    - fn [readFacade](../../src/framework-code/laravel.ts#L238) (code: PhpCode, facade: PhpClass, facts: ConfigFacts, keyed: Map<string, string>) → void <!-- internal -->
      <a id="map.laravel.readFacade"></a><br>A facade of the repository: `getFacadeAccessor()` returns the class it stands for, or the container key a provider binds.
      - calls [map.php.PhpCode.method](map.md#map.php.PhpCode.method), [map.php.cls](map.md#map.php.cls), [map.php.str](map.md#map.php.str), [map.php.type](map.md#map.php.type)
    - fn [readCommand](../../src/framework-code/laravel.ts#L256) (command: PhpClass, facts: ConfigFacts) → void <!-- internal -->
      <a id="map.laravel.readCommand"></a><br>An Artisan command class: its `$signature` (or `$name`, `#[AsCommand]`) names it; `handle` runs.
      - calls [map.laravel.commandName](map.md#map.laravel.commandName), [map.php.key](map.md#map.php.key), [map.php.type](map.md#map.php.type)
    - fn [commandName](../../src/framework-code/laravel.ts#L265) (command: PhpClass) → string | null <!-- internal -->
      <a id="map.laravel.commandName"></a><br>A command's name: the first word of `$signature` (or `$name`, or `#[AsCommand]`'s name); null without one.
      - calls [map.php.str](map.md#map.php.str), [map.php.key](map.md#map.php.key), [map.php.arg](map.md#map.php.arg)
    - fn [commandNames](../../src/framework-code/laravel.ts#L276) (code: PhpCode, classes: readonly PhpClass[]) → Map<string, PhpClass> <!-- internal -->
      <a id="map.laravel.commandNames"></a><br>Command name → its class, for the schedule.
      - calls [map.php.PhpCode.extends](map.md#map.php.PhpCode.extends), [map.laravel.commandName](map.md#map.laravel.commandName)
    - type [Group](../../src/framework-code/laravel.ts#L290) <!-- internal -->
      <a id="map.laravel.Group"></a><br>What a route group adds to the routes inside it: URL prefixes, and the controller of `Route::controller`.
    - fn [readRoutes](../../src/framework-code/laravel.ts#L301) (code: PhpCode, file: FileFacts, facts: ConfigFacts) → void <!-- internal -->
      <a id="map.laravel.readRoutes"></a><br>The routes of `routes/web.php`, `routes/api.php` (under `/api`) and the other route files: `Route::get|post|put|patch|delete|options|any|match`, `Route::resource`/`apiResource`, inside `Route::prefix(…)->group(fn)`, `Route::group(['prefix' => …], fn)` and…
      - calls [map.laravel.isOneOf](map.md#map.laravel.isOneOf), [map.php.PhpCode.calleeClass](map.md#map.php.PhpCode.calleeClass), [map.php.str](map.md#map.php.str), [map.php.cls](map.md#map.php.cls), [map.laravel.resource](map.md#map.laravel.resource), [map.php.strings](map.md#map.php.strings), [map.php.arg](map.md#map.php.arg), [map.laravel.joinPath](map.md#map.laravel.joinPath), [map.laravel.routeAction](map.md#map.laravel.routeAction), [map.php.type](map.md#map.php.type)
    - fn [routeAction](../../src/framework-code/laravel.ts#L392) (action: LiteralFact | null, controller: string | null) → { type: string | null; fn: string | null; note?: string } | { reason: string } <!-- internal -->
      <a id="map.laravel.routeAction"></a><br>The controller method a route action names; a closure is the route file's own code.
    - fn [resource](../../src/framework-code/laravel.ts#L409) (code: PhpCode, facts: ConfigFacts, call: CallFact, prefix: string[], args: CallFact["args"] & {}, api: boolean, chain: { name: string; args: NonNullable<CallFact["args"]> }[]) → void <!-- internal -->
      <a id="map.laravel.resource"></a><br>`Route::resource('photos', C::class)`: one route per action the controller declares, `->only([…])`/`->except([…])` applied.
      - calls [map.php.str](map.md#map.php.str), [map.php.arg](map.md#map.php.arg), [map.php.cls](map.md#map.php.cls), [map.php.strings](map.md#map.php.strings), [map.laravel.singular](map.md#map.laravel.singular), [map.php.PhpCode.method](map.md#map.php.PhpCode.method), [map.laravel.joinPath](map.md#map.laravel.joinPath), [map.php.type](map.md#map.php.type)
    - fn [singular](../../src/framework-code/laravel.ts#L441) (word: string) → string <!-- internal -->
      <a id="map.laravel.singular"></a><br>The singular Laravel's `Str::singular` gives the regular plurals of a resource name.
    - fn [joinPath](../../src/framework-code/laravel.ts#L454) (parts: readonly string[]) → string <!-- internal -->
      <a id="map.laravel.joinPath"></a><br>Join URL parts into one absolute path without empty or doubled slashes.
    - fn [readConsole](../../src/framework-code/laravel.ts#L461) (code: PhpCode, file: FileFacts, facts: ConfigFacts, commands: ReadonlyMap<string, PhpClass>) → void <!-- internal -->
      <a id="map.laravel.readConsole"></a><br>`routes/console.php`: `Artisan::command('name', fn)` is a command; `Schedule::command|job|call(…)` the schedule.
      - calls [map.php.PhpCode.calleeClass](map.md#map.php.PhpCode.calleeClass), [map.laravel.isOneOf](map.md#map.laravel.isOneOf), [map.php.str](map.md#map.php.str), [map.php.arg](map.md#map.php.arg), [map.laravel.schedule](map.md#map.laravel.schedule)
    - fn [readKernel](../../src/framework-code/laravel.ts#L477) (code: PhpCode, file: FileFacts, facts: ConfigFacts, commands: ReadonlyMap<string, PhpClass>) → void <!-- internal -->
      <a id="map.laravel.readKernel"></a><br>`Kernel::schedule(Schedule $schedule)`: `$schedule->command|job|call(…)`.
      - calls [map.php.callsOf](map.md#map.php.callsOf), [map.php.key](map.md#map.php.key), [map.php.PhpCode.qualified](map.md#map.php.PhpCode.qualified), [map.laravel.schedule](map.md#map.laravel.schedule)
    - fn [schedule](../../src/framework-code/laravel.ts#L485) (facts: ConfigFacts, file: string, call: CallFact, method: string, commands: ReadonlyMap<string, PhpClass>) → void <!-- internal -->
      <a id="map.laravel.schedule"></a><br>One scheduled item: a command by name or class, a job, or a callable; anything unreadable is a hole.
      - calls [map.php.arg](map.md#map.php.arg), [map.php.key](map.md#map.php.key), [map.php.str](map.md#map.php.str), [map.php.type](map.md#map.php.type)
    - fn [shortName](../../src/framework-code/laravel.ts#L508) (qualified: string) → string <!-- internal -->
      <a id="map.laravel.shortName"></a><br>The class name without its namespace: an observer's name in the binding.
  - module [php](../../src/framework-code/php.ts#L1)
    <a id="map.php"></a><br>What the PHP framework readers (Laravel, Symfony) take from the code the PHP extractor recorded: classes by their qualified names with their bases and interfaces, the names a file's `use` statements bind, and the literals of attributes, properties and call arguments…
    - facts [extract.facts](extract.md#extract.facts)
    - adapter [base.adapter](base.md#base.adapter)
    - type [PhpClass](../../src/framework-code/php.ts#L16)
      <a id="map.php.PhpClass"></a><br>A class (or interface) of the repository by its qualified name.
    - module [PhpCode](../../src/framework-code/php.ts#L29)
      <a id="map.php.PhpCode"></a><br>The repository's PHP classes, interfaces and traits by their qualified names in ASCII lower case.
      - fn [constructor](../../src/framework-code/php.ts#L34) (files: readonly FileFacts[])
        <a id="map.php.PhpCode.constructor"></a>
        - calls [map.php.localNames](map.md#map.php.localNames), [map.php.PhpCode.qualified](map.md#map.php.PhpCode.qualified), [map.php.key](map.md#map.php.key)
      - fn [qualified](../../src/framework-code/php.ts#L57) (file: string, written: string) → string
        <a id="map.php.PhpCode.qualified"></a><br>The qualified name a class name written in `file` stands for (its `use`, else its namespace as the extractor recorded it).
        - calls [map.php.key](map.md#map.php.key)
      - fn [get](../../src/framework-code/php.ts#L64) (qualified: string) → PhpClass | undefined
        <a id="map.php.PhpCode.get"></a><br>The class of a qualified name, compared without ASCII case.
        - calls [map.php.key](map.md#map.php.key)
      - fn [lineage](../../src/framework-code/php.ts#L69) (qualified: string) → PhpClass[]
        <a id="map.php.PhpCode.lineage"></a><br>The class and its bases keylang has read, the class first.
        - calls [map.php.PhpCode.get](map.md#map.php.PhpCode.get)
      - fn [extends](../../src/framework-code/php.ts#L83) (cls: PhpClass, base: string) → boolean
        <a id="map.php.PhpCode.extends"></a><br>The class extends `base` (qualified), directly or through bases keylang has read.
        - calls [map.php.PhpCode.lineage](map.md#map.php.PhpCode.lineage), [map.php.key](map.md#map.php.key)
      - fn [implements](../../src/framework-code/php.ts#L88) (cls: PhpClass, iface: string) → boolean
        <a id="map.php.PhpCode.implements"></a><br>The class or a base implements `iface` (qualified), directly or through interfaces keylang has read.
        - calls [map.php.PhpCode.lineage](map.md#map.php.PhpCode.lineage), [map.php.key](map.md#map.php.key), [map.php.PhpCode.get](map.md#map.php.PhpCode.get)
      - fn [method](../../src/framework-code/php.ts#L107) (qualified: string, name: string) → { cls: PhpClass; decl: DeclFact } | null
        <a id="map.php.PhpCode.method"></a><br>A public method of the class or a base keylang has read; null when none declares it.
        - calls [map.php.PhpCode.lineage](map.md#map.php.PhpCode.lineage), [map.php.key](map.md#map.php.key)
      - fn [calleeClass](../../src/framework-code/php.ts#L118) (file: string, callee: string) → string | null
        <a id="map.php.PhpCode.calleeClass"></a><br>The qualified class the head of a callee written in `file` names (`Route.get` → `Illuminate\Support\Facades\Route`).
        - calls [map.php.PhpCode.qualified](map.md#map.php.PhpCode.qualified)
    - fn [localNames](../../src/framework-code/php.ts#L128) (file: FileFacts) → Map<string, string> <!-- internal -->
      <a id="map.php.localNames"></a><br>Local class names of a file's imports (in ASCII lower case) → the qualified names they bind.
      - calls [map.php.key](map.md#map.php.key)
    - fn [key](../../src/framework-code/php.ts#L142) (name: string) → string
      <a id="map.php.key"></a><br>PHP class names compare without ASCII case.
    - fn [sameClass](../../src/framework-code/php.ts#L147) (a: string, b: string) → boolean
      <a id="map.php.sameClass"></a><br>Whether two class names are the same class, ignoring a leading `\` and ASCII case.
      - calls [map.php.key](map.md#map.php.key)
    - fn [arg](../../src/framework-code/php.ts#L152) (args: readonly ArgFact[] | undefined, name: string | null, position: number | null) → LiteralFact | null
      <a id="map.php.arg"></a><br>An argument by its name, else by its position.
    - fn [str](../../src/framework-code/php.ts#L168) (value: LiteralFact | null | undefined) → string | null
      <a id="map.php.str"></a><br>The value of a string literal, else null.
    - fn [cls](../../src/framework-code/php.ts#L173) (value: LiteralFact | null | undefined) → string | null
      <a id="map.php.cls"></a><br>The name of a `X::class` literal, else null.
    - fn [strings](../../src/framework-code/php.ts#L178) (value: LiteralFact | null | undefined) → string[]
      <a id="map.php.strings"></a><br>The strings of a string or an array of strings.
    - fn [eventName](../../src/framework-code/php.ts#L189) (value: LiteralFact | null | undefined) → string | null
      <a id="map.php.eventName"></a><br>An event a listener or a dispatch names: a class by its qualified name, a string as written, a class constant as `X::NAME`.
    - fn [type](../../src/framework-code/php.ts#L202) (name: string) → TypeName
      <a id="map.php.type"></a><br>A `TypeName` from a qualified class name.
    - fn [callsOf](../../src/framework-code/php.ts#L207) (file: FileFacts) → Generator<{ call: CallFact; symbol: string | null; decl: DeclFact | null; cls: DeclFact | null }>
      <a id="map.php.callsOf"></a><br>Every call of a file with the declaration it sits in (`Class.method`, a function's name) or null at the module level.
    - fn [codeFacts](../../src/framework-code/php.ts#L218) (path: string) → ConfigFacts
      <a id="map.php.codeFacts"></a><br>Facts of one source file a framework reads, empty to start with.
    - fn [hasFacts](../../src/framework-code/php.ts#L223) (facts: ConfigFacts) → boolean
      <a id="map.php.hasFacts"></a><br>Whether a code configuration says anything.
    - fn [dispatchesIn](../../src/framework-code/php.ts#L243) (code: PhpCode, file: FileFacts) → { symbol: string; call: CallFact; event: string }[]
      <a id="map.php.dispatchesIn"></a><br>Calls that dispatch an event or a message object, in a declaration of the file: `event(new X)`, `dispatch(new J)`, `Event::dispatch(new X)`, `Bus::dispatch(new J)`, `$dispatcher->dispatch(new X)` (a string second argument names the event: Symfony `dispatch($e…
      - calls [map.php.callsOf](map.md#map.php.callsOf), [map.php.arg](map.md#map.php.arg), [map.php.PhpCode.get](map.md#map.php.PhpCode.get), [map.php.PhpCode.qualified](map.md#map.php.PhpCode.qualified), [map.php.PhpCode.method](map.md#map.php.PhpCode.method), [map.php.str](map.md#map.php.str)
  - module [react-router](../../src/framework-code/react-router.ts#L1)
    <a id="map.react-router"></a><br>Entry points of React Router route modules (`src/frameworks/react-router.ts` lists them, each owned by its routes directory), placed on the graph from the module's exports: `loader` → `GET <path>`, `action` → `POST <path>`, `clientLoader`/`clientAction` the same with…
    - entries [map.entries](map.md#map.entries)
    - adapter [base.adapter](base.md#base.adapter)
    - react-router [base.react-router](base.md#base.react-router)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - type [RouteExport](../../src/framework-code/react-router.ts#L32) <!-- internal -->
      <a id="map.react-router.RouteExport"></a><br>Whether a route module exports a name, and the fn keylang resolves it to.
    - fn [reactRouterEntries](../../src/framework-code/react-router.ts#L38) (scope: EntryScope, configs: readonly FrameworkConfig[]) → EntryPoint[]
      <a id="map.react-router.reactRouterEntries"></a><br>The entry points of every route module the adapter found, in the order of its configs.
      - calls [base.react-router.routeId](base.md#base.react-router.routeId), [base.react-router.flatRoutePath](base.md#base.react-router.flatRoutePath), [base.react-router.isLayout](base.md#base.react-router.isLayout), [map.entries.frameworkEntry](map.md#map.entries.frameworkEntry)
  - module [symfony](../../src/framework-code/symfony.ts#L1)
    <a id="map.symfony"></a><br>What Symfony wires in code (ADR 0022; business-flows 36), for the adapter `src/frameworks/symfony.ts`: the PHP attributes the extractor records (`#[Route]`, `#[AsEventListener]`, `#[AsMessageHandler]`, `#[AsCommand]`, `#[AsCronTask]`, `#[AsPeriodicTask]`, `#[AsAlias]`), a…
    - facts [extract.facts](extract.md#extract.facts)
    - adapter [base.adapter](base.md#base.adapter)
    - php [map.php](map.md#map.php)
    - fn [className](../../src/framework-code/symfony.ts#L40) (written: string) → string <!-- internal -->
      <a id="map.symfony.className"></a><br>A class name from a string: trimmed, single `\` separators, no leading `\`.
    - fn [symfonyFacts](../../src/framework-code/symfony.ts#L45) (files: readonly FileFacts[], configs: readonly ConfigFacts[]) → FrameworkConfig[]
      <a id="map.symfony.symfonyFacts"></a><br>What a Symfony repository's code wires: attributes, subscribers, dispatches; the route prefixes of `configs` apply to attribute routes.
      - calls [map.php.PhpCode](map.md#map.php.PhpCode), [map.php.codeFacts](map.md#map.php.codeFacts), [map.symfony.routes](map.md#map.symfony.routes), [map.symfony.listeners](map.md#map.symfony.listeners), [map.symfony.handlers](map.md#map.symfony.handlers), [map.symfony.commands](map.md#map.symfony.commands), [map.symfony.tasks](map.md#map.symfony.tasks), [map.symfony.aliases](map.md#map.symfony.aliases), [map.php.dispatchesIn](map.md#map.php.dispatchesIn), [map.php.hasFacts](map.md#map.php.hasFacts)
    - fn [attributes](../../src/framework-code/symfony.ts#L82) (decl: { attributes?: { name: string; args: { name?: string; value: LiteralFact }[]; line: number; col: number }[] }, names: readonly string[]) <!-- internal -->
      <a id="map.symfony.attributes"></a><br>The attributes of a declaration with one of `names`, compared as PHP class names.
      - calls [map.php.key](map.md#map.php.key)
    - fn [routes](../../src/framework-code/symfony.ts#L87) (c: PhpClass, facts: ConfigFacts, prefixes: readonly RoutePrefixFact[]) → void <!-- internal -->
      <a id="map.symfony.routes"></a><br>`#[Route]` on the class (a prefix) and on its public methods; `__invoke` for one on an invokable class.
      - calls [map.symfony.attributes](map.md#map.symfony.attributes), [map.php.str](map.md#map.php.str), [map.php.arg](map.md#map.php.arg), [map.symfony.joinPath](map.md#map.symfony.joinPath), [map.php.strings](map.md#map.php.strings), [map.php.type](map.md#map.php.type)
    - fn [joinPath](../../src/framework-code/symfony.ts#L126) (parts: readonly string[]) → string <!-- internal -->
      <a id="map.symfony.joinPath"></a><br>Join URL parts into one absolute path without empty or doubled slashes.
    - fn [listeners](../../src/framework-code/symfony.ts#L133) (code: PhpCode, c: PhpClass, facts: ConfigFacts) → void <!-- internal -->
      <a id="map.symfony.listeners"></a><br>`#[AsEventListener]` on the class or a method, and `getSubscribedEvents()` of an `EventSubscriberInterface`: observers.
      - calls [map.php.type](map.md#map.php.type), [map.symfony.attributes](map.md#map.symfony.attributes), [map.php.str](map.md#map.php.str), [map.php.arg](map.md#map.php.arg), [map.php.eventName](map.md#map.php.eventName), [map.php.PhpCode.implements](map.md#map.php.PhpCode.implements)
    - fn [handlers](../../src/framework-code/symfony.ts#L184) (c: PhpClass, facts: ConfigFacts) → void <!-- internal -->
      <a id="map.symfony.handlers"></a><br>`#[AsMessageHandler]` on the class (`__invoke`, or `method:`) or a method: a consumer of the message its `handles:` or first parameter names.
      - calls [map.php.cls](map.md#map.php.cls), [map.php.type](map.md#map.php.type), [map.symfony.attributes](map.md#map.symfony.attributes), [map.php.str](map.md#map.php.str), [map.php.arg](map.md#map.php.arg)
    - fn [commands](../../src/framework-code/symfony.ts#L199) (code: PhpCode, c: PhpClass, facts: ConfigFacts) → void <!-- internal -->
      <a id="map.symfony.commands"></a><br>`#[AsCommand('app:x')]` (or `$defaultName`) on a command: `execute`, or `__invoke` of an invokable command.
      - calls [map.symfony.attributes](map.md#map.symfony.attributes), [map.php.str](map.md#map.php.str), [map.php.arg](map.md#map.php.arg), [map.php.PhpCode.extends](map.md#map.php.PhpCode.extends), [map.php.PhpCode.method](map.md#map.php.PhpCode.method), [map.php.type](map.md#map.php.type)
    - fn [tasks](../../src/framework-code/symfony.ts#L219) (c: PhpClass, facts: ConfigFacts) → void <!-- internal -->
      <a id="map.symfony.tasks"></a><br>`#[AsCronTask('0 3 * * *')]`, `#[AsPeriodicTask('1 hour')]` on the class (`__invoke`, or `method:`) or a method: cron.
      - calls [map.php.key](map.md#map.php.key), [map.php.type](map.md#map.php.type), [map.symfony.attributes](map.md#map.symfony.attributes), [map.php.str](map.md#map.php.str), [map.php.arg](map.md#map.php.arg)
    - fn [aliases](../../src/framework-code/symfony.ts#L232) (c: PhpClass, facts: ConfigFacts) → void <!-- internal -->
      <a id="map.symfony.aliases"></a><br>`#[AsAlias(I::class)]` on a class: a binding `I → class`; without an id, the one interface the class implements.
      - calls [map.symfony.attributes](map.md#map.symfony.attributes), [map.php.cls](map.md#map.php.cls), [map.php.arg](map.md#map.php.arg), [map.php.str](map.md#map.php.str), [map.symfony.className](map.md#map.symfony.className), [map.php.type](map.md#map.php.type)
  - module [web-entries](../../src/framework-code/web-entries.ts#L1)
    <a id="map.web-entries"></a><br>Entry points of the JavaScript web adapters (ADR 0022; business-flows/37), placed on the graph from what the TypeScript extractor records of the registrations (`FileFacts.web`); the adapters themselves only detect the framework and list its files (`src/frameworks/web.ts`).
    - entries [map.entries](map.md#map.entries)
    - facts [extract.facts](extract.md#extract.facts)
    - graph [map.graph](map.md#map.graph)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - type [Arg](../../src/framework-code/web-entries.ts#L37) = DecoratorArg & { line: number; col: number } <!-- internal -->
      <a id="map.web-entries.Arg"></a><br>A decorator-style argument literal with its position.
    - type [TopName](../../src/framework-code/web-entries.ts#L40) <!-- internal -->
      <a id="map.web-entries.TopName"></a><br>A top-level name of a file.
    - type [KeyParts](../../src/framework-code/web-entries.ts#L46) <!-- internal -->
      <a id="map.web-entries.KeyParts"></a><br>A router key split: its file, and its name (null for a file's own router).
    - type [HandlerRef](../../src/framework-code/web-entries.ts#L52) <!-- internal -->
      <a id="map.web-entries.HandlerRef"></a><br>The fn a handler argument names, else why there is none.
    - type [WebEntries](../../src/framework-code/web-entries.ts#L58)
      <a id="map.web-entries.WebEntries"></a><br>What the web adapters add to the snapshot: entry points, holes, and the language-level routes they replace.
    - type [Registration](../../src/framework-code/web-entries.ts#L78) <!-- internal -->
      <a id="map.web-entries.Registration"></a><br>A registration with the router it is written on.
    - type [Mount](../../src/framework-code/web-entries.ts#L85) <!-- internal -->
      <a id="map.web-entries.Mount"></a><br>Where a router is mounted: under `parent` at `prefix`.
    - fn [webEntries](../../src/framework-code/web-entries.ts#L91) (facts: readonly FileFacts[], scope: EntryScope, active: readonly string[]) → WebEntries
      <a id="map.web-entries.webEntries"></a><br>The entry points of the active JS web frameworks: Express/Fastify routers, then Next.js.
      - calls [map.web-entries.routerEntries](map.md#map.web-entries.routerEntries), [map.web-entries.nextEntries](map.md#map.web-entries.nextEntries)
    - fn [routerEntries](../../src/framework-code/web-entries.ts#L106) (facts: readonly FileFacts[], scope: EntryScope, active: readonly string[], out: WebEntries) → void <!-- internal -->
      <a id="map.web-entries.routerEntries"></a><br>Express and Fastify, in four steps: find routers, resolve mounts between them, compute each router's full prefixes, then turn each registration and `use` middleware into entries at every prefix.
      - calls [map.web-entries.Values](map.md#map.web-entries.Values), [map.web-entries.valueKey](map.md#map.web-entries.valueKey), [map.web-entries.fnKey](map.md#map.web-entries.fnKey), [map.web-entries.Values.value](map.md#map.web-entries.Values.value), [map.web-entries.cmp](map.md#map.web-entries.cmp), [map.web-entries.pathOf](map.md#map.web-entries.pathOf), [map.web-entries.routePath](map.md#map.web-entries.routePath), [map.web-entries.Values.mounted](map.md#map.web-entries.Values.mounted), [map.entries.fnIn](map.md#map.entries.fnIn), [map.web-entries.hole](map.md#map.web-entries.hole), [map.web-entries.argText](map.md#map.web-entries.argText), [map.web-entries.keyParts](map.md#map.web-entries.keyParts), [map.web-entries.handlerOf](map.md#map.web-entries.handlerOf), [map.web-entries.middlewareText](map.md#map.web-entries.middlewareText), [map.web-entries.prop](map.md#map.web-entries.prop), [map.web-entries.hooksOf](map.md#map.web-entries.hooksOf), [map.web-entries.joinPath](map.md#map.web-entries.joinPath), [map.entries.frameworkEntry](map.md#map.entries.frameworkEntry)
    - module [Values](../../src/framework-code/web-entries.ts#L360) <!-- internal -->
      <a id="map.web-entries.Values"></a><br>Follows a written name to the value it stands for: a top-level name of a file, through imports and exports.
      - fn [constructor](../../src/framework-code/web-entries.ts#L363) (scope: EntryScope)
        <a id="map.web-entries.Values.constructor"></a>
      - fn [value](../../src/framework-code/web-entries.ts#L368) (file: string, name: string, depth = 0) → TopName
        <a id="map.web-entries.Values.value"></a><br>The file and top-level name a name written in `file` stands for.
        - calls [map.web-entries.Values.target](map.md#map.web-entries.Values.target), [map.web-entries.Values.exported](map.md#map.web-entries.Values.exported)
      - fn [exported](../../src/framework-code/web-entries.ts#L395) (file: string, name: string, depth: number) → TopName | null
        <a id="map.web-entries.Values.exported"></a><br>The top-level name `file` exports as `name`.
        - calls [map.web-entries.Values.target](map.md#map.web-entries.Values.target), [map.web-entries.Values.value](map.md#map.web-entries.Values.value)
      - fn [target](../../src/framework-code/web-entries.ts#L411) (file: string, source: string, line: number | null, col: number | null, text: string | null) → string | null
        <a id="map.web-entries.Values.target"></a><br>The file an import of `file` resolves to.
      - fn [mounted](../../src/framework-code/web-entries.ts#L426) (file: string, arg: Arg, as: "value" | "fn") → string | null
        <a id="map.web-entries.Values.mounted"></a><br>The router key an argument of `use` (a value) or `register` (a plugin fn) mounts; null when keylang cannot follow it.
        - calls [map.web-entries.Values.value](map.md#map.web-entries.Values.value), [map.web-entries.fnKey](map.md#map.web-entries.fnKey), [map.web-entries.Values.target](map.md#map.web-entries.Values.target), [map.web-entries.Values.exported](map.md#map.web-entries.Values.exported), [map.web-entries.valueKey](map.md#map.web-entries.valueKey)
    - fn [valueKey](../../src/framework-code/web-entries.ts#L445) (file: string, name: string) → string <!-- internal -->
      <a id="map.web-entries.valueKey"></a><br>A router written as a top-level name of a file.
    - fn [fnKey](../../src/framework-code/web-entries.ts#L450) (file: string, name: string | null, at: { line: number; col: number } | null) → string <!-- internal -->
      <a id="map.web-entries.fnKey"></a><br>A router that is the first parameter of a function: by the function's name, else its position.
    - fn [literalStrings](../../src/framework-code/web-entries.ts#L455) (items: readonly DecoratorArg[]) → string[] | null <!-- internal -->
      <a id="map.web-entries.literalStrings"></a><br>The strings of a list whose items are all string literals; null when one is not.
    - fn [keyParts](../../src/framework-code/web-entries.ts#L462) (key: string) → KeyParts <!-- internal -->
      <a id="map.web-entries.keyParts"></a><br>Split a router key back into its file and name.
    - fn [pathOf](../../src/framework-code/web-entries.ts#L469) (call: WebCallFact) → string | null <!-- internal -->
      <a id="map.web-entries.pathOf"></a><br>The literal path of a registration (from `route('/x')` or the first argument), else null.
    - fn [routePath](../../src/framework-code/web-entries.ts#L476) (path: string) → boolean <!-- internal -->
      <a id="map.web-entries.routePath"></a><br>A path a router registers on: `/…` or `*`.
    - fn [prop](../../src/framework-code/web-entries.ts#L481) (arg: DecoratorArg, key: string) → DecoratorArg | undefined <!-- internal -->
      <a id="map.web-entries.prop"></a><br>A property of an object literal argument.
    - fn [hooksOf](../../src/framework-code/web-entries.ts#L486) (opts: DecoratorArg) → DecoratorArg[] <!-- internal -->
      <a id="map.web-entries.hooksOf"></a><br>Fastify hooks of route options that run before the handler, in the order Fastify runs them.
      - calls [map.web-entries.prop](map.md#map.web-entries.prop)
    - fn [handlerOf](../../src/framework-code/web-entries.ts#L495) (scope: EntryScope, file: string, handler: DecoratorArg | undefined) → HandlerRef <!-- internal -->
      <a id="map.web-entries.handlerOf"></a><br>The fn a handler argument names, or why there is none.
      - calls [map.entries.fnIn](map.md#map.entries.fnIn), [map.web-entries.argText](map.md#map.web-entries.argText)
    - fn [middlewareText](../../src/framework-code/web-entries.ts#L510) (scope: EntryScope, file: string, arg: DecoratorArg) → string <!-- internal -->
      <a id="map.web-entries.middlewareText"></a><br>A middleware of a chain in words: `` `auth` (mw.auth.auth) ``, or why it has no ID.
      - calls [map.entries.fnIn](map.md#map.entries.fnIn), [map.web-entries.argText](map.md#map.web-entries.argText)
    - fn [argText](../../src/framework-code/web-entries.ts#L523) (arg: DecoratorArg) → string <!-- internal -->
      <a id="map.web-entries.argText"></a><br>An argument as source-like text, for notes and hole reasons.
    - fn [hole](../../src/framework-code/web-entries.ts#L543) (file: string, at: { line: number; col: number }, reason: string, module: Module | undefined) → Gap <!-- internal -->
      <a id="map.web-entries.hole"></a><br>An `unsupported` gap at an argument, owned by the registering module.
    - fn [joinPath](../../src/framework-code/web-entries.ts#L548) (...parts: string[]) → string <!-- internal -->
      <a id="map.web-entries.joinPath"></a><br>`/api/orders/:id` from its parts, each with or without slashes.
    - fn [nextEntries](../../src/framework-code/web-entries.ts#L562) (facts: readonly FileFacts[], scope: EntryScope, out: WebEntries) → void <!-- internal -->
      <a id="map.web-entries.nextEntries"></a><br>Next.js: Pages API handlers, server actions, `middleware.ts`.
      - calls [map.entries.frameworkEntry](map.md#map.entries.frameworkEntry), [map.web-entries.prop](map.md#map.web-entries.prop), [map.web-entries.literalStrings](map.md#map.web-entries.literalStrings), [map.web-entries.argText](map.md#map.web-entries.argText), [map.entries.fnIn](map.md#map.entries.fnIn)
    - fn [cmp](../../src/framework-code/web-entries.ts#L635) (a: string, b: string) → number <!-- internal -->
      <a id="map.web-entries.cmp"></a><br>Compare strings by code units.
  - module [framework-entries](../../src/framework-entries.ts#L1)
    <a id="map.framework-entries"></a><br>Entry points and holes the framework adapters add to a snapshot (ADR 0022 п. 5), placed on the graph: an entry a config file names (SFCC `hooks.json`, `steptypes.json`) becomes the fn or module of its script, and SFCC adds the controllers the TypeScript extractor records…
    - config [base.config](base.md#base.config)
    - entries [map.entries](map.md#map.entries)
    - facts [extract.facts](extract.md#extract.facts)
    - adapter [base.adapter](base.md#base.adapter)
    - cartridges [base.cartridges](base.md#base.cartridges)
    - react-router [map.react-router](map.md#map.react-router)
    - web-entries [map.web-entries](map.md#map.web-entries)
    - python-web [base.python-web](base.md#base.python-web)
    - web [base.web](base.md#base.web)
    - graph [map.graph](map.md#map.graph)
    - imports [map.imports](map.md#map.imports)
    - python-web-entries [map.python-web-entries](map.md#map.python-web-entries)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - type [FrameworkEntryInputs](../../src/framework-entries.ts#L37)
      <a id="map.framework-entries.FrameworkEntryInputs"></a><br>What placing framework entries needs: config, the built graph, all file facts and the active adapters.
    - type [FrameworkEntryOutputs](../../src/framework-entries.ts#L46)
      <a id="map.framework-entries.FrameworkEntryOutputs"></a><br>The entries the frameworks give, with the holes and warnings of placing them.
    - fn [frameworkEntries](../../src/framework-entries.ts#L55) ({ config, graph, facts, frameworks }: FrameworkEntryInputs) → FrameworkEntryOutputs
      <a id="map.framework-entries.frameworkEntries"></a><br>All entry points the active frameworks add, sorted, with their holes, warnings and superseded language-level routes.
      - calls [map.entries.entryScope](map.md#map.entries.entryScope), [map.imports.probeCandidates](map.md#map.imports.probeCandidates), [map.framework-entries.phpClassFiles](map.md#map.framework-entries.phpClassFiles), [map.framework-entries.placeMethod](map.md#map.framework-entries.placeMethod), [map.framework-entries.withExtras](map.md#map.framework-entries.withExtras), [map.entries.frameworkEntry](map.md#map.entries.frameworkEntry), [map.entries.fnIn](map.md#map.entries.fnIn), [base.cartridges.cartridgeLayout](base.md#base.cartridges.cartridgeLayout), [map.framework-entries.guessedOrder](map.md#map.framework-entries.guessedOrder), [map.framework-entries.controllerEntries](map.md#map.framework-entries.controllerEntries), [map.framework-entries.nestEntries](map.md#map.framework-entries.nestEntries), [map.framework-entries.pwaEntries](map.md#map.framework-entries.pwaEntries), [map.react-router.reactRouterEntries](map.md#map.react-router.reactRouterEntries), [map.python-web-entries.pythonWebEntries](map.md#map.python-web-entries.pythonWebEntries), [map.web-entries.webEntries](map.md#map.web-entries.webEntries), [map.entries.compareEntries](map.md#map.entries.compareEntries)
    - fn [withExtras](../../src/framework-entries.ts#L157) (entry: EntryPoint, fact: EntryConfigFact) → EntryPoint <!-- internal -->
      <a id="map.framework-entries.withExtras"></a><br>The HTTP method and the note an entry fact gives its entry.
    - fn [phpClassFiles](../../src/framework-entries.ts#L168) (facts: readonly FileFacts[]) → Map<string, { file: string; name: string; facts: FileFacts }> <!-- internal -->
      <a id="map.framework-entries.phpClassFiles"></a><br>PHP classes by their qualified name in ASCII lower case → the file and the name it declares.
      - calls [map.framework-entries.lower](map.md#map.framework-entries.lower)
    - fn [lower](../../src/framework-entries.ts#L180) (name: string) → string <!-- internal -->
      <a id="map.framework-entries.lower"></a><br>A PHP class name's lookup key: no leading `\`, ASCII lower case.
    - fn [placeMethod](../../src/framework-entries.ts#L188) (scope: EntryScope, classes: ReadonlyMap<string, { file: string; name: string; facts: FileFacts }>, type: TypeName, method: string) → { id: string; at: { file: string; line: number } } | { reason: string } <!-- internal -->
      <a id="map.framework-entries.placeMethod"></a><br>The fn of `method` of the class a config names, its own or a base's the analysis has; the reason when it has neither the class nor the method.
      - calls [map.framework-entries.lower](map.md#map.framework-entries.lower), [map.entries.fnIn](map.md#map.entries.fnIn)
    - fn [guessedOrder](../../src/framework-entries.ts#L224) (layout: CartridgeLayout, graph: Graph, facts: readonly FileFacts[], probe: (candidate: string) => string | null) → Gap[] <!-- internal -->
      <a id="map.framework-entries.guessedOrder"></a><br>A `*\/cartridge/…` require that two cartridges answer, or a `module.superModule`, resolved along a guessed cartridge path: the order decided the edge, and nothing the repository writes gave the order. A hole (`unsupported`) of the requiring module, so a rule over it is…
      - calls [base.cartridges.cartridgeAnswers](base.md#base.cartridges.cartridgeAnswers)
    - type [HttpMethods](../../src/framework-entries.ts#L250) <!-- internal -->
      <a id="map.framework-entries.HttpMethods"></a><br>The HTTP method of a registration, by the method or verb the code calls.
    - fn [controllerEntries](../../src/framework-entries.ts#L263) (graph: Graph, facts: readonly FileFacts[], scope: EntryScope) → EntryPoint[] <!-- internal -->
      <a id="map.framework-entries.controllerEntries"></a><br>`server.get('Show', …, handler)` in `controllers/Cart.js`: a `route` labelled `Cart-Show`. The handler is the last argument when it names a fn keylang resolves; a handler written in place has no fn ID, so the controller module stands for it, at the registration's line, with a…
      - calls [map.entries.fnIn](map.md#map.entries.fnIn), [map.entries.frameworkEntry](map.md#map.entries.frameworkEntry)
    - fn [nestEntries](../../src/framework-entries.ts#L313) (facts: readonly FileFacts[], scope: EntryScope, files: ReadonlySet<string>) → EntryPoint[] <!-- internal -->
      <a id="map.framework-entries.nestEntries"></a><br>NestJS entry points from the decorators of its config files (the sources that import `@nestjs/…`): `@Controller('orders')` + `@Get(':id')` → `route` `GET /api/orders/:id` (with the global prefix of `setGlobalPrefix('api')` when it is one literal); `@Cron('0 * * * *')`…
      - calls [map.framework-entries.allCalls](map.md#map.framework-entries.allCalls), [map.framework-entries.pathsOf](map.md#map.framework-entries.pathsOf), [map.entries.fnIn](map.md#map.entries.fnIn), [map.entries.frameworkEntry](map.md#map.entries.frameworkEntry), [map.framework-entries.joinPath](map.md#map.framework-entries.joinPath), [map.framework-entries.argText](map.md#map.framework-entries.argText)
    - fn [allCalls](../../src/framework-entries.ts#L385) (file: FileFacts) → CallFact[] <!-- internal -->
      <a id="map.framework-entries.allCalls"></a><br>Every call of a file: its declarations' (members too) and its top level's.
    - fn [pathsOf](../../src/framework-entries.ts#L401) (arg: DecoratorArg | undefined, key: string) → string[] | null <!-- internal -->
      <a id="map.framework-entries.pathsOf"></a><br>`'orders'`, `['a', 'b']`, `{ path: 'orders' }` → the paths; none written → `['']`; null for a path keylang cannot read.
    - fn [joinPath](../../src/framework-entries.ts#L422) (...parts: string[]) → string <!-- internal -->
      <a id="map.framework-entries.joinPath"></a><br>`/api/orders/:id` from its parts, each with or without slashes.
    - fn [argText](../../src/framework-entries.ts#L430) (arg: DecoratorArg | undefined) → string <!-- internal -->
      <a id="map.framework-entries.argText"></a><br>A decorator argument in words: a string's value, a name, a number; an object or an array as written.
    - fn [pwaEntries](../../src/framework-entries.ts#L459) (facts: readonly FileFacts[], scope: EntryScope, files: ReadonlySet<string>) → EntryPoint[] <!-- internal -->
      <a id="map.framework-entries.pwaEntries"></a><br>PWA Kit entry points: each `{ path, component }` of a `routes.*` file is a `route` labelled with the path on the component — a fn the file declares or imports, else the default export of the module a lazy `import()` loads, else the routes module with a note; `app.get('*'…
      - calls [map.entries.fnIn](map.md#map.entries.fnIn), [map.framework-entries.lazyDefault](map.md#map.framework-entries.lazyDefault), [map.entries.frameworkEntry](map.md#map.entries.frameworkEntry)
    - fn [lazyDefault](../../src/framework-entries.ts#L512) (scope: EntryScope, module: { deps: readonly { file: string; text: string; target: string }[] }, file: string, source: string) → string | null <!-- internal -->
      <a id="map.framework-entries.lazyDefault"></a><br>The default export of the module a routes file loads with `import('<source>')` when it is a fn, else that module; null when the import does not resolve.
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
    - type [Frontend](../../src/frontends.ts#L23)
      <a id="map.frontends.Frontend"></a><br>The per-language plug-in of the code pipeline: extractor, import resolver and what it can and cannot see.
    - fn [ecmascriptResolver](../../src/frontends.ts#L105) (root: string, sources: ReadonlySet<string>, _files: readonly FileFacts[], config?: Pick<Config, "sfcc" | "frameworks">) → SourceResolver <!-- internal -->
      <a id="map.frontends.ecmascriptResolver"></a><br>The JS/TS resolver, with SFCC cartridge and PWA Kit lookups on unless `frameworks` excludes them.
      - calls [map.imports.ImportResolver](map.md#map.imports.ImportResolver)
    - fn [pythonResolver](../../src/frontends.ts#L115) (root: string, sources: ReadonlySet<string>) → SourceResolver <!-- internal -->
      <a id="map.frontends.pythonResolver"></a><br>Python resolver; it needs only the root and the known source files.
      - calls [map.python-imports.PythonResolver](map.md#map.python-imports.PythonResolver)
    - fn [rustResolver](../../src/frontends.ts#L120) (root: string, sources: ReadonlySet<string>) → SourceResolver <!-- internal -->
      <a id="map.frontends.rustResolver"></a><br>Rust resolver; it needs only the root and the known source files.
      - calls [map.rust-imports.RustResolver](map.md#map.rust-imports.RustResolver)
    - fn [phpResolver](../../src/frontends.ts#L125) (root: string, sources: ReadonlySet<string>, files: readonly FileFacts[]) → SourceResolver <!-- internal -->
      <a id="map.frontends.phpResolver"></a><br>PHP resolver; it also needs the facts, since `use` names declarations rather than files.
      - calls [map.php-imports.PhpResolver](map.md#map.php-imports.PhpResolver)
    - fn [frontendOf](../../src/frontends.ts#L130) (language: Language) → Frontend
      <a id="map.frontends.frontendOf"></a><br>The frontend of a supported language.
    - fn [frontendFor](../../src/frontends.ts#L138) (path: string) → Frontend | undefined
      <a id="map.frontends.frontendFor"></a><br>The frontend for a source file; undefined for a file of no known language.
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
    - entries [base.entries](base.md#base.entries)
    - events [base.events](base.md#base.events)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - type [Graph](../../src/graph.ts#L30)
      <a id="map.graph.Graph"></a><br>The whole code graph of one analysis: layers of modules with their nodes and edges, plus what it could not see.
    - type [EventNode](../../src/graph.ts#L60)
      <a id="map.graph.EventNode"></a><br>An event (ADR 0022 п. 6): a node of the generated group `events`, named by the literal code dispatches it with. Its calls are the observers the framework runs when it is dispatched, each at its config line.
    - type [Gap](../../src/graph.ts#L72)
      <a id="map.graph.Gap"></a><br>A hole of the analysis: something in the code keylang could not turn into a confirmed node or edge.
    - type [AssumedImport](../../src/graph.ts#L93) = Omit<Gap, "kind">
      <a id="map.graph.AssumedImport"></a><br>An import of a file `assume` lists: the architecture imports it, and keylang neither reads nor requires it.
    - type [OpenEdge](../../src/graph.ts#L96)
      <a id="map.graph.OpenEdge"></a><br>A type edge, or a call keylang could not pin to one target.
    - type [Layer](../../src/graph.ts#L111)
      <a id="map.graph.Layer"></a><br>One architecture layer of `keylang.json` (or a synthetic one: external, unassigned, outside).
    - type [Module](../../src/graph.ts#L118)
      <a id="map.graph.Module"></a><br>A module node: a file, a directory, a class, or an external package.
    - type [Dep](../../src/graph.ts#L153)
      <a id="map.graph.Dep"></a><br>A dependency of a module on another, from an import (or re-export) statement.
    - type [Fn](../../src/graph.ts#L175)
      <a id="map.graph.Fn"></a><br>A function or method node with its outgoing calls.
    - type [Escape](../../src/graph.ts#L202)
      <a id="map.graph.Escape"></a><br>Where and why a fn may be called by code that does not name it.
    - type [Via](../../src/graph.ts#L210)
      <a id="map.graph.Via"></a><br>How a call edge that is not a plain call of the code came about; see `Call.via`.
    - type [Call](../../src/graph.ts#L213)
      <a id="map.graph.Call"></a><br>A resolved call edge from a fn.
    - type [TypeNode](../../src/graph.ts#L272)
      <a id="map.graph.TypeNode"></a><br>A type node (interface, type alias, enum…).
    - type [Stats](../../src/graph.ts#L289)
      <a id="map.graph.Stats"></a><br>Counters the map header and `--stats` report.
    - fn [globalsOf](../../src/graph.ts#L314) (file: string) → Frontend["globals"] <!-- internal -->
      <a id="map.graph.globalsOf"></a><br>The language and platform globals of a file's frontend; none for an unknown language.
      - calls [map.frontends.frontendFor](map.md#map.frontends.frontendFor)
    - type [FileEntry](../../src/graph.ts#L319) <!-- internal -->
      <a id="map.graph.FileEntry"></a><br>A file's facts and the module it ended up in.
    - fn [buildGraph](../../src/graph.ts#L329) (config: Config, files: FileFacts[], frameworks: readonly FrameworkInput[] = []) → Graph
      <a id="map.graph.buildGraph"></a><br>Build the graph from every file's facts, in numbered steps: files → modules, declarations, imports → dependencies, export tables, calls (with framework facts), injected hook values, and the final escapes and events.
      - calls [map.frontends.frontendOf](map.md#map.frontends.frontendOf), [map.frontends.frontendFor](map.md#map.frontends.frontendFor), [map.graph.placeFile](map.md#map.graph.placeFile), [map.graph.isIndexFile](map.md#map.graph.isIndexFile), [map.graph.topSegments](map.md#map.graph.topSegments), [base.config.layerName](base.md#base.config.layerName), [map.graph.addDecl](map.md#map.graph.addDecl), [map.graph.markOpaque](map.md#map.graph.markOpaque), [map.declared-packages.readManifests](map.md#map.declared-packages.readManifests), [base.external-ids.assignExternalIds](base.md#base.external-ids.assignExternalIds), [map.graph.importedPackages](map.md#map.graph.importedPackages), [base.span.compareText](base.md#base.span.compareText), [map.imports.assumedTarget](map.md#map.imports.assumedTarget), [base.config.isAssumed](base.md#base.config.isAssumed), [map.graph.importTarget](map.md#map.graph.importTarget), [map.graph.notIndexed](map.md#map.graph.notIndexed), [base.external-ids.externalSegment](base.md#base.external-ids.externalSegment), [base.languages.languageOf](base.md#base.languages.languageOf), [map.graph.exportInput](map.md#map.graph.exportInput), [map.exports.resolveExports](map.md#map.exports.resolveExports), [base.languages.caselessNames](base.md#base.languages.caselessNames), [map.graph.memberKey](map.md#map.graph.memberKey), [map.graph.caselessIndex](map.md#map.graph.caselessIndex), [map.graph.staticThroughInstance](map.md#map.graph.staticThroughInstance), [map.graph.globalsOf](map.md#map.graph.globalsOf), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [map.graph.qualifiedIn](map.md#map.graph.qualifiedIn), [map.graph.typedAs](map.md#map.graph.typedAs), [map.graph.lastSegmentOf](map.md#map.graph.lastSegmentOf), [base.bindings.FrameworkBindings](base.md#base.bindings.FrameworkBindings), [map.graph.directoryModuleIn](map.md#map.graph.directoryModuleIn), [base.bindings.FrameworkBindings.interceptors](base.md#base.bindings.FrameworkBindings.interceptors), [base.entries.frameworkEntries](base.md#base.entries.frameworkEntries), [map.graph.addCall](map.md#map.graph.addCall), [base.languages.interfaceTypes](base.md#base.languages.interfaceTypes), [map.graph.holeReason](map.md#map.graph.holeReason), [base.languages.constructorName](base.md#base.languages.constructorName), [map.graph.markEscapes](map.md#map.graph.markEscapes), [map.graph.eventNodes](map.md#map.graph.eventNodes)
    - fn [eventNodes](../../src/graph.ts#L2687) (dispatches: readonly { call: Call; name: string; file: string }[], observers: readonly ObserverEdge[], declared: readonly { name: string; file: string; line: number; col: number }[]) → EventNode[] <!-- internal -->
      <a id="map.graph.eventNodes"></a><br>Event nodes (ADR 0022 п. 6): every name a literal dispatch or an observer's config writes, with an ID of the group `events`. A dispatch call gets the event's ID as its target; an observer is a call of the event, at its config line.
      - calls [base.events.eventIds](base.md#base.events.eventIds), [base.span.compareText](base.md#base.span.compareText)
    - fn [qualifiedIn](../../src/graph.ts#L2728) (facts: FileFacts, written: string) → string <!-- internal -->
      <a id="map.graph.qualifiedIn"></a><br>A class name as a file writes it, qualified through the file's imports: PHP `Foo` with `use A\Foo` → `A\Foo`, `\A\Foo` → `A\Foo`; TS/JS `EventEmitter2` with `import { EventEmitter2 } from "@nestjs/event-emitter"` → `@nestjs/event-emitter\EventEmitter2` (the package, `\`, the…
      - calls [base.languages.languageOf](base.md#base.languages.languageOf)
    - fn [directoryModule](../../src/graph.ts#L2758) (config: Config, dir: string, graph: Pick<Graph, "modules" | "layers">) → string | null
      <a id="map.graph.directoryModule"></a><br>The module of a directory (a framework module's root): a directory module, or the layer itself when the layer's glob starts there; null when the graph has neither.
      - calls [map.graph.directoryModuleIn](map.md#map.graph.directoryModuleIn)
    - fn [directoryModuleIn](../../src/graph.ts#L2763) (config: Config, dir: string, modules: ReadonlyMap<string, Module>, layers: ReadonlyMap<string, Layer>) → string | null <!-- internal -->
      <a id="map.graph.directoryModuleIn"></a><br>`directoryModule` over raw maps: place a probe file in `dir` and take its module (or the layer itself).
      - calls [map.graph.placeFile](map.md#map.graph.placeFile)
    - type [GlobSource](../../src/graph.ts#L2785) <!-- internal -->
      <a id="map.graph.GlobSource"></a><br>What one glob import (`use m::*`, `from m import *`) brings into a file's scope.
    - type [BaseLink](../../src/graph.ts#L2793) <!-- internal -->
      <a id="map.graph.BaseLink"></a><br>A class's `extends`: the base keylang has read, or the text of one it has not, and whether that names a package's or the language's class.
    - type [MemberLookup](../../src/graph.ts#L2802) <!-- internal -->
      <a id="map.graph.MemberLookup"></a><br>A member looked up through a class's bases: the fn found (null: none), and the last base on the way (null: the class has none).
    - type [OutsideEntry](../../src/graph.ts#L2808) <!-- internal -->
      <a id="map.graph.OutsideEntry"></a><br>A class or interface of a file `outside` the architecture, read as declarations only.
    - type [Ty](../../src/graph.ts#L2820) <!-- internal -->
      <a id="map.graph.Ty"></a><br>The class of a value, as far as declarations tell it (PHP, business-flows 40): a class or an interface of the graph, one of a file `outside` the architecture, or a class a framework generates (`factory`: Magento's `XFactory`, whose `create()` gives an `X`).
    - type [CallCtx](../../src/graph.ts#L2823) <!-- internal -->
      <a id="map.graph.CallCtx"></a><br>Where a call runs, as `receiverTy` reads a call fact: the file and the class of the fn.
    - type [Typed](../../src/graph.ts#L2829) <!-- internal -->
      <a id="map.graph.Typed"></a><br>A class a value has, and the docblock it rests on (`file:line:col`) when one does.
    - fn [typedAs](../../src/graph.ts#L2837) (ty: Ty, indirect: boolean, doc: string | null | undefined) → Typed <!-- internal -->
      <a id="map.graph.typedAs"></a><br>A value's class, with `indirect` and the docblock that writes it set only when there are.
    - type [MemberHit](../../src/graph.ts#L2848) <!-- internal -->
      <a id="map.graph.MemberHit"></a><br>A member a value's class has: the fn it runs (`target`) or the `outside` member, and its declared result type.
    - fn [staticThroughInstance](../../src/graph.ts#L2863) (file: string) → boolean <!-- internal -->
      <a id="map.graph.staticThroughInstance"></a><br>Python and PHP reach a static member through an instance (`s.make()`, `$this->make()`); JavaScript does not.
      - calls [base.languages.languageOf](base.md#base.languages.languageOf)
    - type [ImportTarget](../../src/graph.ts#L2870) <!-- internal -->
      <a id="map.graph.ImportTarget"></a><br>What one import binding names in the file: a declaration of the module (`named`, `default`) or the module itself.
    - fn [unindexedModule](../../src/graph.ts#L2886) (name: string) → Module <!-- internal -->
      <a id="map.graph.unindexedModule"></a><br>A module an import may bind that is never added to the graph: an external one, so calls through its names are external. Its ID is no valid ID, so it names no node.
    - fn [importTarget](../../src/graph.ts#L2900) (module: Module, unit: string, binding: ImportBinding, whole: boolean) → ImportTarget <!-- internal -->
      <a id="map.graph.importTarget"></a><br>A specifier that names the module itself (Rust `use crate::a`, Python `from pkg import mod`) binds the module object, which is no function, like an ESM namespace.
    - fn [exportInput](../../src/graph.ts#L2913) (row: ExportRow, facts: FileFacts, scope: ReadonlyMap<string, string>, imported: ReadonlyMap<string, ImportTarget[]>) → ExportRowInput <!-- internal -->
      <a id="map.graph.exportInput"></a><br>One export row of a file, with what it stands for: a declaration of the file (`scope`), a name or the namespace of the module an import binds, or nothing keylang indexes. A re-export (`export { a } from`, Rust `pub use`) goes through its own import; any other name through a…
      - calls [base.config.layerName](base.md#base.config.layerName)
    - fn [importedPackages](../../src/graph.ts#L2944) (files: readonly FileFacts[], resolve: (file: string, spec: string) => Resolution) → Set<string> <!-- internal -->
      <a id="map.graph.importedPackages"></a><br>Names of the external packages (and `node` for built-ins) the files import.
    - fn [notIndexed](../../src/graph.ts#L2964) (config: Config, file: string) → string | null <!-- internal -->
      <a id="map.graph.notIndexed"></a><br>Why a resolved source file has no module; null when it is left out on purpose: not source code (JSON, CSS), a test or declaration file, `exclude`, outside guessed layers.
      - calls [base.languages.languageOf](base.md#base.languages.languageOf), [base.config.isExcluded](base.md#base.config.isExcluded), [base.config.isOutside](base.md#base.config.isOutside), [map.graph.placeFile](map.md#map.graph.placeFile)
    - fn [isIndexFile](../../src/graph.ts#L2975) (file: string) → boolean <!-- internal -->
      <a id="map.graph.isIndexFile"></a><br>Whether a file is its directory's index file in its language (`index.ts`, `mod.rs`, `__init__.py`).
      - calls [base.languages.languageOf](base.md#base.languages.languageOf)
    - fn [addCall](../../src/graph.ts#L2991) (fn: Fn, call: Call) → boolean <!-- internal -->
      <a id="map.graph.addCall"></a><br>Add a call unless an edge to the same target already says as much. Edges rank by what they prove: a plain call outside a closure (3) proves the path in every mode; a hook's default, a callable passed as an argument or a call in a closure passed as one (2) prove it in…
    - fn [holeReason](../../src/graph.ts#L3003) (c: CallFact) → string <!-- internal -->
      <a id="map.graph.holeReason"></a><br>The reason text of a dynamic call: through a hook, through `this` of a function value, or through a local value.
    - fn [markEscapes](../../src/graph.ts#L3018) (modules: Map<string, Module>, readIds: ReadonlyMap<string, Escape>, readMembers: ReadonlyMap<string, Escape>, calledNames: ReadonlyMap<string, Escape>, members: Decls["members"]) → void <!-- internal -->
      <a id="map.graph.markEscapes"></a><br>Functions that code may reach without naming them in a call: read as a value (`later(save)` names the declaration `save` resolves to; `obj.save` any method `save`), called implicitly, or the constructor of a class read as a value (`extends A` runs `A`'s constructor). Names read…
      - calls [map.graph.foldCase](map.md#map.graph.foldCase), [base.languages.caselessNames](base.md#base.languages.caselessNames), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [base.languages.constructorName](base.md#base.languages.constructorName), [base.languages.implicitMember](base.md#base.languages.implicitMember)
    - fn [foldCase](../../src/graph.ts#L3045) (names: ReadonlyMap<string, Escape>) → Map<string, Escape> <!-- internal -->
      <a id="map.graph.foldCase"></a><br>Names keyed in ASCII lower case, each with the escape of its first spelling: what a language whose names compare without case looks up.
      - calls [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase)
    - fn [markOpaque](../../src/graph.ts#L3054) (m: Module) → void <!-- internal -->
      <a id="map.graph.markOpaque"></a><br>Mark a module and everything under it as opaque: its member list is not known to be complete.
    - type [Decls](../../src/graph.ts#L3061) <!-- internal -->
      <a id="map.graph.Decls"></a><br>Where each declaration went: several facts (overloads) may share one node.
    - fn [caselessIndex](../../src/graph.ts#L3075) (rows: readonly ExportRowInput[]) → Map<string, string[]> <!-- internal -->
      <a id="map.graph.caselessIndex"></a><br>Name in ASCII lower case → the names of the declarations an export table lists under it. A row that stands for no declaration (a PHP constant, which keeps its case) is left out.
      - calls [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase)
    - fn [memberKey](../../src/graph.ts#L3090) (member: string, isStatic: boolean, caseless = false) → string
      <a id="map.graph.memberKey"></a><br>Lookup key of a class member: `this.#m` in a static method is `static #m`. `caseless`: a language whose method names compare without ASCII case (PHP).
      - calls [base.config.layerName](base.md#base.config.layerName), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase)
    - fn [memberSegments](../../src/graph.ts#L3107) (members: readonly DeclFact[], caseless: boolean) → Map<DeclFact, { key: string; segment: string }> <!-- internal -->
      <a id="map.graph.memberSegments"></a><br>ID segments of class members. An instance member keeps its name; a static or `#private` member of the same name as another gets a suffix (`m-static`, `go-private`, `go-static-private`), which no JS name can collide with.
      - calls [map.graph.memberKey](map.md#map.graph.memberKey), [base.config.layerName](base.md#base.config.layerName)
    - fn [topSegments](../../src/graph.ts#L3141) (module: Module, files: readonly FileFacts[], warnings: string[]) → Map<DeclFact, string> <!-- internal -->
      <a id="map.graph.topSegments"></a><br>ID segments of a module's top-level declarations. One file's declarations of a name share a node (overloads, a class merged with its interface); the same name in another file of the module (`module: "dir"`, `x.ts` beside `x/index.ts`) is another symbol, whose segment gets `-2`…
      - calls [base.span.compareText](base.md#base.span.compareText), [base.config.layerName](base.md#base.config.layerName)
    - fn [addDecl](../../src/graph.ts#L3185) (module: Module, d: DeclFact, names: Map<string, string>, declModule: Map<string, Map<string, string>>, decls: Decls, stats: Stats, file: string, member?: { key: string; segment: string }) → void <!-- internal -->
      <a id="map.graph.addDecl"></a><br>Add one declaration to a module as a node (class, fn or type), merging overloads and TS interface/class pairs into one node; a class recurses into its members.
      - calls [base.config.layerName](base.md#base.config.layerName), [map.graph.memberSegments](map.md#map.graph.memberSegments), [base.languages.caselessNames](base.md#base.languages.caselessNames)
    - fn [placeFile](../../src/graph.ts#L3300) (config: Config, file: string) → { layer: string; segments: string[]; stem: string; glob: string | null } | null
      <a id="map.graph.placeFile"></a><br>Where `file` lands: its layer, module ID segments and path stem, and the layer glob that placed it (none for `outside`).
      - calls [base.config.isOutside](base.md#base.config.isOutside), [base.config.layerName](base.md#base.config.layerName), [base.glob.matchesGlob](base.md#base.glob.matchesGlob), [base.glob.globPrefix](base.md#base.glob.globPrefix), [base.languages.languageOf](base.md#base.languages.languageOf)
    - fn [lastSegmentOf](../../src/graph.ts#L3333) (name: string) → string <!-- internal -->
      <a id="map.graph.lastSegmentOf"></a><br>The last segment of a qualified PHP name.
  - module [imports](../../src/imports.ts#L1)
    <a id="map.imports"></a><br>Import specifier → file. Relative paths with extension probing, the `paths`/`baseUrl` of the `tsconfig` (or `jsconfig`) that governs the importing file — the nearest one above it, with the configs a solution config `references` lending theirs to the files under them…
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - json [base.json](base.md#base.json)
    - ts [extract.ts](extract.md#extract.ts)
    - languages [base.languages](base.md#base.languages)
    - exact-path [map.exact-path](map.md#map.exact-path)
    - glob [base.glob](base.md#base.glob)
    - cartridges [base.cartridges](base.md#base.cartridges)
    - pwa-kit [base.pwa-kit](base.md#base.pwa-kit)
    - type [Resolution](../../src/imports.ts#L50)
      <a id="map.imports.Resolution"></a><br>What an import specifier names: a file of the repository, the importing file itself, a package, a built-in, or nothing known.
    - type [SourceResolver](../../src/imports.ts#L65)
      <a id="map.imports.SourceResolver"></a><br>The per-language resolver the graph uses: specifier → `Resolution`, plus the config files it read.
    - fn [assumedTarget](../../src/imports.ts#L91) (r: Resolution, wouldName: () => readonly string[], assumed: (path: string) => boolean) → string | null
      <a id="map.imports.assumedTarget"></a><br>The path an import names when `assumed` holds for it (`assume` in keylang.json): the file `r` resolved it to, or — when no file answers, as in a checkout without the generated or untracked file — a path the specifier would name with the usual extension candidates (`wouldName`…
      - calls [base.languages.languageOf](base.md#base.languages.languageOf)
    - type [PathRule](../../src/imports.ts#L105) <!-- internal -->
      <a id="map.imports.PathRule"></a><br>One `paths` (or `imports`) pattern with its targets.
    - module [ImportResolver](../../src/imports.ts#L116)
      <a id="map.imports.ImportResolver"></a><br>The JS/TS resolver of one graph build. It caches every answer and records every config file and `node_modules` lookup it used in `inputs`, so the snapshot id changes when any of them does.
      - fn [constructor](../../src/imports.ts#L154) (root: string, sources: ReadonlySet<string> = new Set(), fs: ExactFs = nodeFs, options: { cartridgePath?: readonly string[] | null; sfcc?: boolean; pwaKit?: boolean } = {})
        <a id="map.imports.ImportResolver.constructor"></a><br>Sets up a cached reader so each file is read once via [`map.imports.readText`](map.md#map.imports.readText) and [`map.imports.parseJsonc`](map.md#map.imports.parseJsonc), then loads baseUrl/paths through [`map.imports.loadTsconfig`](map.md#map.imports.loadTsconfig). Also collects package.json dependency names and workspaces. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
        - calls [map.imports.ImportResolver.cartridges](map.md#map.imports.ImportResolver.cartridges), [map.exact-path.exactExistence](map.md#map.exact-path.exactExistence), [map.imports.readText](map.md#map.imports.readText), [map.imports.parseJsonc](map.md#map.imports.parseJsonc), [map.imports.ImportResolver.governingConfig](map.md#map.imports.ImportResolver.governingConfig), [map.imports.dependencies](map.md#map.imports.dependencies), [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString), [map.imports.pnpmWorkspacePackages](map.md#map.imports.pnpmWorkspacePackages)
      - fn [verbatimModuleSyntax](../../src/imports.ts#L204) (file: string) → boolean
        <a id="map.imports.ImportResolver.verbatimModuleSyntax"></a><br>Whether `compilerOptions.verbatimModuleSyntax` holds for `file`: in the tsconfig that governs it — the nearest `tsconfig.json` (else `jsconfig.json`) from its directory up to the root, through `extends` — or in a config that one `references`, since a solution config (Vite's…
        - calls [map.imports.ImportResolver.governingConfig](map.md#map.imports.ImportResolver.governingConfig), [map.imports.ImportResolver.verbatimSetting](map.md#map.imports.ImportResolver.verbatimSetting), [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString), [base.config.toPosix](base.md#base.config.toPosix)
      - fn [optionsFor](../../src/imports.ts#L240) (fromFile: string) → Tsconfig <!-- internal -->
        <a id="map.imports.ImportResolver.optionsFor"></a><br>The `baseUrl`/`paths` that apply to `fromFile`: those of the tsconfig that governs it (`governingConfig`, the same one `verbatimModuleSyntax` reads) after its `extends` chain. A config without `paths` of its own that `references` projects (a solution config, Vite's `"files"…
        - calls [map.imports.ImportResolver.governingConfig](map.md#map.imports.ImportResolver.governingConfig), [map.imports.loadTsconfig](map.md#map.imports.loadTsconfig)
      - fn [governingConfig](../../src/imports.ts#L275) (dir: string) → string | null <!-- internal -->
        <a id="map.imports.ImportResolver.governingConfig"></a><br>The tsconfig (else jsconfig) of `dir` or the nearest directory above it, up to the root; null without one.
      - fn [verbatimSetting](../../src/imports.ts#L297) (file: string, depth: number) → boolean | "unset" | "unknown" <!-- internal -->
        <a id="map.imports.ImportResolver.verbatimSetting"></a><br>`verbatimModuleSyntax` as `file` sets it, its own option first, then its `extends` from the last (which tsc lets override the earlier ones). `unknown`: a config in the chain is missing, is no JSON object, is a package keylang does not find, or the chain is deeper than tsc would…
        - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonBoolean](base.md#base.json.isJsonBoolean), [base.json.isJsonString](base.md#base.json.isJsonString), [map.imports.ImportResolver.extendedConfig](map.md#map.imports.ImportResolver.extendedConfig)
      - fn [extendedConfig](../../src/imports.ts#L328) (dir: string, spec: string) → string | null <!-- internal -->
        <a id="map.imports.ImportResolver.extendedConfig"></a><br>The config file an `extends` entry of a config in `dir` names, as tsc finds it: a relative path (with `.json` added when the path itself is no file), or a package's config in a `node_modules` from `dir` up to the root — `<pkg>/<path>.json` as written or with `.json` added, the…
        - calls [base.config.toPosix](base.md#base.config.toPosix), [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString)
      - fn [locate](../../src/imports.ts#L364) (pkg: string) → Located <!-- internal -->
        <a id="map.imports.ImportResolver.locate"></a><br>Where `node_modules` at or above the root has the package: a link into the repository is a workspace package. Without an install, a `workspaces` entry of the root `package.json` or a `packages` entry of `pnpm-workspace.yaml` with that `name` is one too.
        - calls [map.imports.inside](map.md#map.imports.inside), [map.imports.ImportResolver.workspaceDirs](map.md#map.imports.ImportResolver.workspaceDirs), [base.json.isJsonObject](base.md#base.json.isJsonObject)
      - fn [workspaceDirs](../../src/imports.ts#L414) () → string[] <!-- internal -->
        <a id="map.imports.ImportResolver.workspaceDirs"></a><br>Directories the workspace globs name (`packages/*`, `packages/**`, `apps/web`): root `workspaces` and pnpm `packages`, less what a `!pattern` takes out. Each listing is an input of the snapshot id.
        - calls [map.imports.workspaceGlob](map.md#map.imports.workspaceGlob), [map.imports.isGlob](map.md#map.imports.isGlob), [map.imports.listWorkspaceGlob](map.md#map.imports.listWorkspaceGlob), [map.imports.withoutNegated](map.md#map.imports.withoutNegated)
      - fn [packageEntry](../../src/imports.ts#L441) (dir: string, subpath: string) → string | null <!-- internal -->
        <a id="map.imports.ImportResolver.packageEntry"></a><br>The source file a workspace package names for `subpath` (`""`, `/util`): `exports` (a string, subpaths, `*` patterns, conditions), else `module`, `main`, `index`. A declaration file is not source.
        - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString), [map.imports.flattenTarget](map.md#map.imports.flattenTarget), [map.imports.matchPattern](map.md#map.imports.matchPattern), [map.imports.ImportResolver.probe](map.md#map.imports.ImportResolver.probe), [base.config.toPosix](base.md#base.config.toPosix)
      - fn [resolve](../../src/imports.ts#L483) (fromFile: string, spec: string) → Resolution
        <a id="map.imports.ImportResolver.resolve"></a><br>What `spec`, imported from `fromFile`, names; cached per file and specifier.
        - calls [map.imports.ImportResolver.resolveUncached](map.md#map.imports.ImportResolver.resolveUncached)
      - fn [cartridges](../../src/imports.ts#L499) () → CartridgeLayout | null
        <a id="map.imports.ImportResolver.cartridges"></a><br>The SFCC cartridges of the analysis, once: their order joins the snapshot id as an input, so a changed cartridge path changes edges on the next run.
        - calls [base.cartridges.cartridgeLayout](base.md#base.cartridges.cartridgeLayout)
      - fn [resolveUncached](../../src/imports.ts#L514) (fromFile: string, spec: string) → Resolution <!-- internal -->
        <a id="map.imports.ImportResolver.resolveUncached"></a><br>The resolution order: generated modules, relative paths, SFCC cartridges, PWA Kit template imports, `#imports`, tsconfig `paths` and `baseUrl`, Node built-ins, and finally packages.
        - calls [map.imports.ImportResolver.probe](map.md#map.imports.ImportResolver.probe), [map.imports.ImportResolver.cartridges](map.md#map.imports.ImportResolver.cartridges), [base.cartridges.cartridgeAnswers](base.md#base.cartridges.cartridgeAnswers), [map.imports.ImportResolver.templateImport](map.md#map.imports.ImportResolver.templateImport), [map.imports.ImportResolver.resolveSubpathImport](map.md#map.imports.ImportResolver.resolveSubpathImport), [map.imports.ImportResolver.optionsFor](map.md#map.imports.ImportResolver.optionsFor), [map.imports.bestMatch](map.md#map.imports.bestMatch), [extract.ts.isNodeBuiltin](extract.md#extract.ts.isNodeBuiltin), [map.imports.ImportResolver.resolvePackage](map.md#map.imports.ImportResolver.resolvePackage)
      - fn [templateImport](../../src/imports.ts#L568) (fromFile: string, spec: string) → Resolution | null <!-- internal -->
        <a id="map.imports.ImportResolver.templateImport"></a><br>PWA Kit template extensibility: `<base>/x` (the `extends` of `ccExtensibility` in the nearest `package.json`) is `<overridesDir>/x` of that project when the file exists — an override replaces the base template's file — else the base package; `^<base>/x` is the base package…
        - calls [map.imports.ImportResolver.extensibilityAt](map.md#map.imports.ImportResolver.extensibilityAt), [map.imports.ImportResolver.probe](map.md#map.imports.ImportResolver.probe)
      - fn [extensibilityAt](../../src/imports.ts#L586) (dir: string) → { dir: string; cc: Extensibility } | null <!-- internal -->
        <a id="map.imports.ImportResolver.extensibilityAt"></a><br>The PWA Kit project of a directory: the nearest `package.json` at or above it, when it writes `ccExtensibility`.
        - calls [base.pwa-kit.extensibilityOf](base.md#base.pwa-kit.extensibilityOf), [map.imports.parseJsonc](map.md#map.imports.parseJsonc)
      - fn [resolveSubpathImport](../../src/imports.ts#L609) (fromFile: string, spec: string) → Resolution <!-- internal -->
        <a id="map.imports.ImportResolver.resolveSubpathImport"></a><br>`#alias`: the `imports` of the nearest `package.json` above the importing file, as Node scopes them (an exact key, else the longest pattern prefix). A target that is not a relative path names a package.
        - calls [map.imports.ImportResolver.scopeImports](map.md#map.imports.ImportResolver.scopeImports), [map.imports.bestMatch](map.md#map.imports.bestMatch), [base.config.toPosix](base.md#base.config.toPosix), [map.imports.ImportResolver.resolve](map.md#map.imports.ImportResolver.resolve), [map.imports.ImportResolver.probe](map.md#map.imports.ImportResolver.probe)
      - fn [scopeImports](../../src/imports.ts#L643) (dir: string) → PathRule[] | null <!-- internal -->
        <a id="map.imports.ImportResolver.scopeImports"></a><br>`imports` of `<dir>/package.json`; an empty list when it has none, null without the file.
        - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [map.imports.flattenTarget](map.md#map.imports.flattenTarget)
      - fn [resolvePackage](../../src/imports.ts#L662) (fromFile: string, spec: string) → Resolution <!-- internal -->
        <a id="map.imports.ImportResolver.resolvePackage"></a><br>A bare specifier's package: a workspace package at the root (`locate`) names its file; one installed at or above the root is external; otherwise the `node_modules` and `package.json` on the way from the file up (`near`), then the root's declaration, decide — and a package…
        - calls [map.imports.packageName](map.md#map.imports.packageName), [map.imports.ImportResolver.locate](map.md#map.imports.ImportResolver.locate), [map.imports.ImportResolver.workspaceFile](map.md#map.imports.ImportResolver.workspaceFile), [map.imports.ImportResolver.near](map.md#map.imports.ImportResolver.near), [map.imports.ImportResolver.declaredDependency](map.md#map.imports.ImportResolver.declaredDependency)
      - fn [workspaceFile](../../src/imports.ts#L675) (dir: string, pkg: string, subpath: string) → Resolution <!-- internal -->
        <a id="map.imports.ImportResolver.workspaceFile"></a><br>The file a workspace package in `dir` names for `subpath`; unresolved without one (a `dist/` entry keylang does not index).
        - calls [map.imports.ImportResolver.packageEntry](map.md#map.imports.ImportResolver.packageEntry)
      - fn [near](../../src/imports.ts#L690) (fromFile: string, pkg: string, subpath: string) → Resolution | null <!-- internal -->
        <a id="map.imports.ImportResolver.near"></a><br>The package as Node finds it from `fromFile` up to (not including) the root: in the `node_modules` of a directory on the way — a link into the repository is a workspace package, as pnpm installs them next to the importing package rather than at the root — or declared by that…
        - calls [map.imports.inside](map.md#map.imports.inside), [map.imports.ImportResolver.workspaceFile](map.md#map.imports.ImportResolver.workspaceFile), [map.imports.dependencies](map.md#map.imports.dependencies), [map.imports.ImportResolver.declaredDependency](map.md#map.imports.ImportResolver.declaredDependency)
      - fn [declaredDependency](../../src/imports.ts#L726) (dir: string, declared: ReadonlyMap<string, string | null>, pkg: string, subpath: string) → Resolution | null <!-- internal -->
        <a id="map.imports.ImportResolver.declaredDependency"></a><br>What a `package.json` in `dir` (`""`: the root) says about `pkg` through its dependency fields: null when it does not declare it (nor its `@types`); external for a version range; for a `workspace:`, `file:`, `link:` or `portal:` range this repository's code (ADR 0010) — the…
        - calls [base.config.toPosix](base.md#base.config.toPosix), [map.imports.ImportResolver.workspaceFile](map.md#map.imports.ImportResolver.workspaceFile)
      - fn [probe](../../src/imports.ts#L748) (candidate: string) → string | null <!-- internal -->
        <a id="map.imports.ImportResolver.probe"></a><br>Candidate file (POSIX, relative to root) → existing source file, or null.
        - calls [map.imports.probeCandidates](map.md#map.imports.probeCandidates)
      - fn [wouldName](../../src/imports.ts#L770) (fromFile: string, spec: string) → string[]
        <a id="map.imports.ImportResolver.wouldName"></a><br>The paths a relative specifier, the `imports` of the nearest `package.json`, the most specific `paths` pattern or `baseUrl` would name, each with the candidates `probe` tries, whether they exist or not.
        - calls [map.imports.probeCandidates](map.md#map.imports.probeCandidates), [map.imports.ImportResolver.scopeImports](map.md#map.imports.ImportResolver.scopeImports), [map.imports.bestMatch](map.md#map.imports.bestMatch), [base.config.toPosix](base.md#base.config.toPosix), [map.imports.ImportResolver.optionsFor](map.md#map.imports.ImportResolver.optionsFor)
    - fn [probeCandidates](../../src/imports.ts#L816) (candidate: string) → string[]
      <a id="map.imports.probeCandidates"></a><br>The files a candidate path may be, in the order resolution tries them: as written, the NodeNext swaps (`./x.js` written for `./x.ts`, `.tsx` or `.jsx`; `./x.jsx` for `./x.tsx`), with each extension, then its index file. None for a path that leaves the root.
    - type [Located](../../src/imports.ts#L831) <!-- internal -->
      <a id="map.imports.Located"></a><br>Where `node_modules` has a package: a workspace link (its directory), installed elsewhere, or not found.
    - fn [inside](../../src/imports.ts#L834) (root: string, abs: string) → string | null
      <a id="map.imports.inside"></a><br>`abs` (after links) as a POSIX path under `root`, outside any `node_modules`; null otherwise.
      - calls [base.config.toPosix](base.md#base.config.toPosix)
    - fn [dependencies](../../src/imports.ts#L858) (manifest: JsonValue) → Map<string, string | null> <!-- internal -->
      <a id="map.imports.dependencies"></a><br>The packages a manifest's dependency fields declare: name → range as written (null when it is no string); the first field that has a name wins.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [workspaceGlob](../../src/imports.ts#L873) (pattern: string) → string | null
      <a id="map.imports.workspaceGlob"></a><br>A workspace pattern (`packages/*`, `./apps/web/`) as a root-relative POSIX glob; null when it leaves the root.
      - calls [base.config.toPosix](base.md#base.config.toPosix)
    - fn [isGlob](../../src/imports.ts#L880) (glob: string) → boolean
      <a id="map.imports.isGlob"></a><br>Whether a workspace glob has a wildcard, so names its directories through a listing.
    - fn [listWorkspaceGlob](../../src/imports.ts#L891) (root: string, glob: string) → string
      <a id="map.imports.listWorkspaceGlob"></a><br>The directories a workspace glob names, root-relative, sorted and joined by newlines: `base/*` lists every subdirectory of `base`, as before; any other glob (`packages/**`, `packages/{libs,tools}/*`) walks the directories under its fixed prefix, never into `node_modules` or a…
      - calls [map.imports.isGlob](map.md#map.imports.isGlob), [base.glob.globToRegExp](base.md#base.glob.globToRegExp)
    - fn [withoutNegated](../../src/imports.ts#L931) (dirs: readonly string[], patterns: readonly JsonValue[]) → string[]
      <a id="map.imports.withoutNegated"></a><br>`dirs` without those a `!pattern` of `patterns` names (npm `workspaces` negation).
      - calls [base.json.isJsonString](base.md#base.json.isJsonString), [map.imports.workspaceGlob](map.md#map.imports.workspaceGlob), [base.glob.globToRegExp](base.md#base.glob.globToRegExp)
    - fn [pnpmWorkspacePackages](../../src/imports.ts#L947) (text: string) → string[]
      <a id="map.imports.pnpmWorkspacePackages"></a><br>The `packages` globs of a `pnpm-workspace.yaml`: the block list under the key (items quoted or bare, a trailing `# comment` dropped) or an inline `[a, b]` list. An exclusion (`!**\/test/**`) names no directory.
    - fn [bestMatch](../../src/imports.ts#L982) (rules: readonly PathRule[], spec: string) → { rule: PathRule; star: string } | null <!-- internal -->
      <a id="map.imports.bestMatch"></a><br>The rule `tsc` (`matchPatternOrExact`) and Node (`PATTERN_KEY_COMPARE`) apply: an exact key, else the matching pattern with the longest prefix before `*` (then the longer key), else the first in the file. `star` is the text the `*` stands for.
      - calls [map.imports.matchPattern](map.md#map.imports.matchPattern)
    - fn [matchPattern](../../src/imports.ts#L1001) (pattern: string, spec: string) → string | null <!-- internal -->
      <a id="map.imports.matchPattern"></a><br>The text a pattern's single `*` stands for in `spec` (`""` for an exact match); null when it does not match.
    - fn [flattenTarget](../../src/imports.ts#L1016) (t: JsonValue | undefined) → string[] <!-- internal -->
      <a id="map.imports.flattenTarget"></a><br>Every string of an `exports`/`imports`/`paths` target, depth first through arrays and condition objects.
      - calls [base.json.isJsonString](base.md#base.json.isJsonString), [base.json.isJsonObject](base.md#base.json.isJsonObject)
    - fn [packageName](../../src/imports.ts#L1027) (spec: string) → string
      <a id="map.imports.packageName"></a><br>The package part of a bare specifier: `@scope/name` or `name`.
    - fn [readJsonc](../../src/imports.ts#L1034) (path: string) → JsonValue
      <a id="map.imports.readJsonc"></a><br>JSON with comments and trailing commas (tsconfig style).
      - calls [map.imports.readText](map.md#map.imports.readText), [map.imports.parseJsonc](map.md#map.imports.parseJsonc)
    - fn [parseJsonc](../../src/imports.ts#L1041) (text: string) → JsonValue
      <a id="map.imports.parseJsonc"></a><br>The value of JSONC text; null when it does not parse.
      - calls [base.json.parseJson](base.md#base.json.parseJson), [map.imports.stripJsonc](map.md#map.imports.stripJsonc)
    - fn [parseJsoncStrict](../../src/imports.ts#L1050) (text: string) → JsonValue
      <a id="map.imports.parseJsoncStrict"></a><br>The value of JSONC text; throws the `JSON.parse` error when it does not parse.
      - calls [base.json.parseJson](base.md#base.json.parseJson), [map.imports.stripJsonc](map.md#map.imports.stripJsonc)
    - fn [readText](../../src/imports.ts#L1060) (path: string) → string | null <!-- internal -->
      <a id="map.imports.readText"></a><br>A file's text, or null when the path is no regular file (missing, or a directory, as `configs/base/` beside `configs/base.json` when `extends` names `./configs/base`) or cannot be read — tsc's `fileExists`, so an `extends` without `.json` falls back to `<path>.json` instead of…
    - fn [stripJsonc](../../src/imports.ts#L1069) (source: string) → string <!-- internal -->
      <a id="map.imports.stripJsonc"></a><br>Remove a leading BOM, and comments and trailing commas outside of strings.
      - calls [base.config.withoutBom](base.md#base.config.withoutBom)
    - type [Tsconfig](../../src/imports.ts#L1098) <!-- internal -->
      <a id="map.imports.Tsconfig"></a><br>The module-resolution options keylang reads: `baseUrl` and the placed `paths` rules.
    - type [LoadedTsconfig](../../src/imports.ts#L1104) <!-- internal -->
      <a id="map.imports.LoadedTsconfig"></a><br>One config file as `optionsFor` combines it: its own options, and those of each project it `references` with that project's directory.
    - type [MergedOptions](../../src/imports.ts#L1110) <!-- internal -->
      <a id="map.imports.MergedOptions"></a><br>Options of one config after its `extends` chain, before `paths` targets are placed.
    - fn [loadTsconfig](../../src/imports.ts#L1126) (read: (file: string) => JsonValue, file: string) → LoadedTsconfig <!-- internal -->
      <a id="map.imports.loadTsconfig"></a><br>`compilerOptions.baseUrl`/`paths` of one config following relative `extends` chains. As in `tsc`, `paths` targets resolve against the `baseUrl` of the final options (a child config's `baseUrl` moves inherited `paths` too), or the directory of the config that declares them.
      - calls [map.imports.mergedOptions](map.md#map.imports.mergedOptions), [map.imports.placePaths](map.md#map.imports.placePaths), [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.config.toPosix](base.md#base.config.toPosix), [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [mergedOptions](../../src/imports.ts#L1150) (read: (file: string) => JsonValue, file: string, depth: number) → MergedOptions <!-- internal -->
      <a id="map.imports.mergedOptions"></a><br>`baseUrl`/`paths` of a config after its relative `extends` chain (later parents override earlier ones).
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.config.toPosix](base.md#base.config.toPosix), [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [placePaths](../../src/imports.ts#L1177) (options: MergedOptions) → PathRule[] <!-- internal -->
      <a id="map.imports.placePaths"></a><br>Turn `paths` targets into root-relative paths against `baseUrl`, else the declaring config's directory.
      - calls [base.json.isJsonString](base.md#base.json.isJsonString), [base.config.toPosix](base.md#base.config.toPosix)
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
    - php [extract.php](extract.md#extract.php)
    - emit [map.emit](map.md#map.emit)
    - explanations [map.explanations](map.md#map.explanations)
    - graph [map.graph](map.md#map.graph)
    - index [map.index](map.md#map.index)
    - adapter [base.adapter](base.md#base.adapter)
    - fact-cache [map.fact-cache](map.md#map.fact-cache)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - json [base.json](base.md#base.json)
    - entries [map.entries](map.md#map.entries)
    - framework-entries [map.framework-entries](map.md#map.framework-entries)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - type [MapResult](../../src/map.ts#L38)
      <a id="map.map.MapResult"></a><br>Everything one map generation produces: the graph, both rendered maps, the snapshot, and fact-cache bookkeeping.
    - fn [generateMap](../../src/map.ts#L60) (config: Config, options: { persist?: boolean | "changed"; overlay?: ReadonlyMap<string, string>; adapters?: readonly FrameworkAdapter[] } = {}) → Promise<MapResult>
      <a id="map.map.generateMap"></a><br>`persist` prepares the fact cache for the next process: `true` always (`keylang map`, whose commit step writes it), `"changed"` only when the facts of this run differ from the cache on disk (an analysis that saves it best-effort); generation writes nothing. `overlay` gives…
      - calls [base.config.classifySources](base.md#base.config.classifySources), [base.config.toPosix](base.md#base.config.toPosix), [base.config.isAnalysed](base.md#base.config.isAnalysed), [base.span.compareText](base.md#base.span.compareText), [map.map.readAnalysedSource](map.md#map.map.readAnalysedSource), [map.map.isSourceText](map.md#map.map.isSourceText), [map.graph.placeFile](map.md#map.graph.placeFile), [map.snapshot.sha256](map.md#map.snapshot.sha256), [map.fact-cache.FactCache.open](map.md#map.fact-cache.FactCache.open), [map.map.extractorCode](map.md#map.map.extractorCode), [map.snapshot.grammarVersions](map.md#map.snapshot.grammarVersions), [map.frontends.frontendFor](map.md#map.frontends.frontendFor), [map.map.extractGuarded](map.md#map.map.extractGuarded), [base.languages.languageOf](base.md#base.languages.languageOf), [extract.php.declarationsOnly](extract.md#extract.php.declarationsOnly), [map.map.readFrameworks](map.md#map.map.readFrameworks), [map.map.opaqueFacts](map.md#map.map.opaqueFacts), [map.graph.buildGraph](map.md#map.graph.buildGraph), [base.config.layerGlobWarnings](base.md#base.config.layerGlobWarnings), [map.map.readSource](map.md#map.map.readSource), [map.framework-entries.frameworkEntries](map.md#map.framework-entries.frameworkEntries), [map.entries.collectEntries](map.md#map.entries.collectEntries), [map.entries.compareEntries](map.md#map.entries.compareEntries), [map.snapshot.buildSnapshot](map.md#map.snapshot.buildSnapshot), [map.map.ownerSource](map.md#map.map.ownerSource), [map.map.readRepositoryDocs](map.md#map.map.readRepositoryDocs), [map.map.explainedMapOf](map.md#map.map.explainedMapOf), [map.emit.renderMap](map.md#map.emit.renderMap)
    - fn [explainedMapOf](../../src/map.ts#L232) (config: Config, index: AnalysisSnapshot) → Map<string, string>
      <a id="map.map.explainedMapOf"></a><br>The explained map of a snapshot (file name under `<dir>/map-explained/` → content): the saved briefs where there are some, else the offline explanation. A viewer (`web --read-only`, the static export) shows it even when `explain.map` is off; it writes nothing.
      - calls [map.explanations.loadBriefs](map.md#map.explanations.loadBriefs), [map.emit.renderExplainedMap](map.md#map.emit.renderExplainedMap), [map.explanations.explanationOf](map.md#map.explanations.explanationOf)
    - type [FrameworkReading](../../src/map.ts#L239) <!-- internal -->
      <a id="map.map.FrameworkReading"></a><br>The framework adapters' inputs to the graph, their manifest in the snapshot, and the config files they could not read.
    - fn [readFrameworks](../../src/map.ts#L249) ( config: Config, sources: readonly string[], read: ReadonlyMap<string, { text: string; sha256: string }>, overlay: ReadonlyMap<string, string> | undefined, cache: FactCache, available: readonly FrameworkAdapter[] | undefined, facts: readonly FileFacts[], outside: readonly string[], ) → FrameworkReading <!-- internal -->
      <a id="map.map.readFrameworks"></a><br>The config files of the framework adapters the repository uses, parsed (or reused from the fact cache by content), and what the manifest lists of them.
      - calls [map.map.readSource](map.md#map.map.readSource), [base.span.compareText](base.md#base.span.compareText), [base.config.isAnalysed](base.md#base.config.isAnalysed), [base.config.isOutside](base.md#base.config.isOutside), [base.adapter.activeAdapters](base.md#base.adapter.activeAdapters), [map.snapshot.sha256](map.md#map.snapshot.sha256), [map.fact-cache.FactCache.config](map.md#map.fact-cache.FactCache.config), [map.map.preferencesOnly](map.md#map.map.preferencesOnly)
    - fn [preferencesOnly](../../src/map.ts#L335) (facts: ConfigFacts) → ConfigFacts <!-- internal -->
      <a id="map.map.preferencesOnly"></a><br>What the graph takes of a config of code `outside` the architecture (business-flows 40): its preferences, which say what class a value of an interface is. Its plugins, observers, arguments and entry points belong to code keylang does not analyse; a file that does not parse…
    - type [OwnerSource](../../src/map.ts#L340) <!-- internal -->
      <a id="map.map.OwnerSource"></a><br>The `source` field of a framework config's hole; absent when no module owns the file.
    - fn [ownerSource](../../src/map.ts#L349) (config: Config, graph: Graph, owner: string | null) → OwnerSource <!-- internal -->
      <a id="map.map.ownerSource"></a><br>The module a config file of `owner`'s directory belongs to, for a hole of its own: the directory's module, or the module of a file in it when the directory is a whole layer (a rule's area holds that module, not the layer node).
      - calls [map.graph.directoryModule](map.md#map.graph.directoryModule), [base.span.compareText](base.md#base.span.compareText)
    - fn [readRepositoryDocs](../../src/map.ts#L369) (config: Config) → RepositoryDocs <!-- internal -->
      <a id="map.map.readRepositoryDocs"></a><br>What the repository writes about itself (ADR 0014, the system and container levels of C4): the root README or a root manifest, and the README in each layer's own directory. Read on every analysis, so an edit shows in the next map without touching `snapshotId`.
      - calls [base.glob.globDirectory](base.md#base.glob.globDirectory), [map.map.readReadme](map.md#map.map.readReadme), [base.brief.readmeBrief](base.md#base.brief.readmeBrief), [map.map.readSystemDoc](map.md#map.map.readSystemDoc)
    - fn [readSystemDoc](../../src/map.ts#L384) (root: string) → SystemDoc <!-- internal -->
      <a id="map.map.readSystemDoc"></a><br>The repository's own name and brief: the root README first, else the first root manifest with a description.
      - calls [map.map.manifestAbout](map.md#map.map.manifestAbout), [map.map.readSource](map.md#map.map.readSource), [map.map.readReadme](map.md#map.map.readReadme), [base.brief.readmeBrief](base.md#base.brief.readmeBrief), [base.brief.briefOf](base.md#base.brief.briefOf)
    - fn [readReadme](../../src/map.ts#L402) (root: string, dir: string) → { path: string; text: string } | null <!-- internal -->
      <a id="map.map.readReadme"></a><br>`README.md` in `dir` (relative, POSIX; "" for the root), its name in any case; null without one.
      - calls [base.span.compareText](base.md#base.span.compareText), [map.map.readSource](map.md#map.map.readSource)
    - type [ManifestAbout](../../src/map.ts#L424) <!-- internal -->
      <a id="map.map.ManifestAbout"></a><br>What a root manifest says the repository is called and what it does.
    - type [ManifestValue](../../src/map.ts#L430) = JsonValue | TomlValue <!-- internal -->
      <a id="map.map.ManifestValue"></a><br>A value of a parsed root manifest: JSON (`package.json`, `composer.json`) or TOML (`Cargo.toml`, `pyproject.toml`).
    - fn [isManifestTable](../../src/map.ts#L433) (value: ManifestValue | undefined) → value is JsonObject | TomlTable <!-- internal -->
      <a id="map.map.isManifestTable"></a><br>Whether a parsed manifest value is a table (an object, not an array or a TOML date).
    - fn [isManifestText](../../src/map.ts#L439) (value: ManifestValue | undefined) → value is string <!-- internal -->
      <a id="map.map.isManifestText"></a><br>Whether a parsed manifest value is text.
    - fn [manifestAbout](../../src/map.ts#L449) (file: (typeof ROOT_MANIFESTS)[number], text: string | null) → ManifestAbout <!-- internal -->
      <a id="map.map.manifestAbout"></a><br>`name` and `description` of a root manifest: `package.json` and `composer.json` at the top, `[package]` (or `[workspace.package]`) of `Cargo.toml`, `[project]` of `pyproject.toml`. A manifest that does not parse gives neither: the analysis reports it where it reads the…
      - calls [base.json.parseJson](base.md#base.json.parseJson), [map.map.isManifestTable](map.md#map.map.isManifestTable), [map.map.isManifestText](map.md#map.map.isManifestText)
    - fn [opaqueFacts](../../src/map.ts#L490) (path: string) → FileFacts <!-- internal -->
      <a id="map.map.opaqueFacts"></a><br>The facts of a file keylang does not read: no members, completeness `opaque`.
    - fn [readSource](../../src/map.ts#L495) (abs: string) → string | null <!-- internal -->
      <a id="map.map.readSource"></a><br>A file's text; null when it no longer exists.
    - type [AnalysedSource](../../src/map.ts#L505) = string | null | { unreadable: string } <!-- internal -->
      <a id="map.map.AnalysedSource"></a><br>A source file's text, null when it is gone, or why keylang may not read it.
    - fn [isSourceText](../../src/map.ts#L508) (src: AnalysedSource) → src is string <!-- internal -->
      <a id="map.map.isSourceText"></a><br>Whether the read gave text (not a missing file, not an unreadable one).
    - fn [readAnalysedSource](../../src/map.ts#L513) (abs: string) → AnalysedSource <!-- internal -->
      <a id="map.map.readAnalysedSource"></a><br>A source file's text as readSource, or the reason when keylang may not read it (EACCES/EPERM): a hole, not an I/O error.
      - calls [map.map.readSource](map.md#map.map.readSource)
    - fn [extractGuarded](../../src/map.ts#L529) (extract: (path: string, src: string) => Promise<FileFacts>, path: string, src: string) → Promise<FileFacts> <!-- internal -->
      <a id="map.map.extractGuarded"></a><br>Facts of one file; a file whose syntax nests deeper than the extractor's stack (thousands of `+` terms or parentheses) is opaque with a parse error, so one pathological file does not stop the whole analysis.
      - calls [map.map.opaqueFacts](map.md#map.map.opaqueFacts)
    - type [MapDiff](../../src/map.ts#L542)
      <a id="map.map.MapDiff"></a><br>What `map --check` finds: hand-written files in the way, and generated files that differ.
    - fn [targets](../../src/map.ts#L553) (config: Config, r: MapResult) → { dir: string; files: ReadonlyMap<string, string>; artifact: "map" | "explained" }[] <!-- internal -->
      <a id="map.map.targets"></a><br>Directories the generator owns and what they should hold: the map, and the explained map (empty when `explain.map` is off, so its generated files go).
    - type [ExtraGenerated](../../src/map.ts#L561) <!-- internal -->
      <a id="map.map.ExtraGenerated"></a><br>A generated file in a map directory that is not listed under its name.
    - fn [extraGenerated](../../src/map.ts#L574) (dir: string, files: ReadonlyMap<string, string>) → ExtraGenerated[] <!-- internal -->
      <a id="map.map.extraGenerated"></a><br>Generated files in `dir` that should not be there under their names.
      - calls [map.map.readOrNull](map.md#map.map.readOrNull), [map.emit.isGeneratedMap](map.md#map.emit.isGeneratedMap)
    - fn [mapConflicts](../../src/map.ts#L612) (config: Config, r: MapResult) → string[]
      <a id="map.map.mapConflicts"></a><br>Target files of both maps that exist and are not generated. Sorted.
      - calls [map.map.targets](map.md#map.map.targets), [map.emit.isGeneratedMap](map.md#map.emit.isGeneratedMap)
    - type [MapArtifact](../../src/map.ts#L627) = "map" | "explained" | "index" | "facts"
      <a id="map.map.MapArtifact"></a><br>What a step of the map's commit touches.
    - type [MapStep](../../src/map.ts#L630)
      <a id="map.map.MapStep"></a><br>One file step of `keylang map`: a path relative to the root, POSIX.
    - type [PlannedStep](../../src/map.ts#L637) extends MapStep <!-- internal -->
      <a id="map.map.PlannedStep"></a><br>A planned step with the bytes to write and the bytes the target must still hold.
    - type [MapPlan](../../src/map.ts#L653)
      <a id="map.map.MapPlan"></a><br>What `keylang map` will do, computed before anything is written: the expected bytes of every target, the removals, and what the render was made from. Internal to one operation — not a stored format.
    - type [SourceInputs](../../src/map.ts#L665)
      <a id="map.map.SourceInputs"></a><br>What a snapshot was computed from: `keylang.json` and the source files. A change in either makes a plan built on it unfit.
    - type [MapInputs](../../src/map.ts#L673) extends SourceInputs <!-- internal -->
      <a id="map.map.MapInputs"></a><br>The inputs of the render: a change in any makes the plan unfit.
    - fn [sourceInputs](../../src/map.ts#L683) (config: Config, sources: readonly { path: string; sha256: string }[]) → SourceInputs
      <a id="map.map.sourceInputs"></a><br>The inputs of a snapshot: the `keylang.json` text the analysis parsed (not the disk now — a save made during the analysis must be caught at the commit, not become the base) and the snapshot's manifest.
    - fn [sourceInputProblems](../../src/map.ts#L692) (config: Config, inputs: SourceInputs, subject: string) → string[]
      <a id="map.map.sourceInputProblems"></a><br>How `keylang.json` and the source files differ from the ones `subject` was computed from (`path: reason` lines, empty when none does): a changed config, a source added, changed or removed since.
      - calls [map.map.readOrNull](map.md#map.map.readOrNull), [base.config.sourceTree](base.md#base.config.sourceTree), [map.snapshot.sha256](map.md#map.snapshot.sha256)
    - type [CommittedStep](../../src/map.ts#L721) extends MapStep
      <a id="map.map.CommittedStep"></a><br>A step after the commit: done, failed with the reason, or never tried.
    - type [MapCommit](../../src/map.ts#L727)
      <a id="map.map.MapCommit"></a><br>The result of a commit: each step's state, and how the commit ended.
    - fn [planMap](../../src/map.ts#L738) (config: Config, r: MapResult) → MapPlan
      <a id="map.map.planMap"></a><br>Plans both maps, the index and the fact cache: a write for every missing or changed generated file, a removal for every generated file of a layer that is gone (or of a map turned off). Reads the disk, writes nothing.
      - calls [base.config.toPosix](base.md#base.config.toPosix), [map.map.targets](map.md#map.map.targets), [map.map.extraGenerated](map.md#map.map.extraGenerated), [map.map.readOrNull](map.md#map.map.readOrNull), [map.map.mapConflicts](map.md#map.map.mapConflicts), [map.map.sourceInputs](map.md#map.map.sourceInputs), [map.map.briefsKey](map.md#map.map.briefsKey)
    - fn [mapPlanProblems](../../src/map.ts#L792) (plan: MapPlan) → string[]
      <a id="map.map.mapPlanProblems"></a><br>Why the plan may not be committed now, as `path: reason` lines; empty when it may. Every target must pass the repository's write rules (a plain path that stays inside the repository through links) and still hold the bytes the plan saw — a manual file created meanwhile included…
      - calls [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [map.map.sourceInputProblems](map.md#map.map.sourceInputProblems), [map.map.briefsKey](map.md#map.map.briefsKey)
    - fn [commitMap](../../src/map.ts#L821) (plan: MapPlan, options: { signal?: AbortSignal; onStep?: (step: MapStep) => void } = {}) → Promise<MapCommit>
      <a id="map.map.commitMap"></a><br>Runs the plan's steps in order, each an atomic write (the generator's exact bytes, the permissions of the file it replaces, links followed inside the repository) or a removal. The signal is checked between steps: the step under way finishes. `onStep` is told before each step…
      - calls [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic), [base.safe-write.landing](base.md#base.safe-write.landing)
    - fn [briefsKey](../../src/map.ts#L859) (config: Config) → string <!-- internal -->
      <a id="map.map.briefsKey"></a><br>A hash of the briefs the explained map reads.
      - calls [map.snapshot.sha256](map.md#map.snapshot.sha256), [map.explanations.loadBriefs](map.md#map.explanations.loadBriefs)
    - fn [readOrNull](../../src/map.ts#L864) (abs: string) → string | null <!-- internal -->
      <a id="map.map.readOrNull"></a><br>A file's text, or null when there is none.
    - fn [diffMap](../../src/map.ts#L873) (config: Config, r: MapResult) → MapDiff
      <a id="map.map.diffMap"></a><br>Compare both generated maps with the files on disk (`map --check`).
      - calls [map.map.mapConflicts](map.md#map.map.mapConflicts), [map.map.targets](map.md#map.map.targets), [map.map.readOrNull](map.md#map.map.readOrNull), [map.map.extraGenerated](map.md#map.map.extraGenerated)
    - fn [extractorCode](../../src/map.ts#L903) () → string <!-- internal -->
      <a id="map.map.extractorCode"></a><br>A hash of the extractor's own code. Facts cached by a changed extractor are stale even when nobody bumped `EXTRACTOR_VERSION`; in the package the same files are the built `.js`.
      - calls [map.snapshot.sha256](map.md#map.snapshot.sha256)
  - module [php-imports](../../src/php-imports.ts#L1)
    <a id="map.php-imports"></a><br>PHP qualified name → file. A PHP import names a declaration, not a file: `App\Domain\Order` is the class `Order` of the namespace `App\Domain` wherever it is declared, so the resolver looks names up among the declarations of the analysed files (`FileFacts.symbols`), the way…
    - node [external.node](external.md#external.node)
    - facts [extract.facts](extract.md#extract.facts)
    - imports [map.imports](map.md#map.imports)
    - json [base.json](base.md#base.json)
    - languages [base.languages](base.md#base.languages)
    - module [PhpResolver](../../src/php-imports.ts#L39)
      <a id="map.php-imports.PhpResolver"></a><br>Resolves PHP specifiers against the declarations of the analysed files and the packages of the composer lock.
      - fn [constructor](../../src/php-imports.ts#L51) (root: string, sources: ReadonlySet<string> = new Set(), files: readonly FileFacts[] = [])
        <a id="map.php-imports.PhpResolver.constructor"></a>
        - calls [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [map.php-imports.readText](map.md#map.php-imports.readText), [map.php-imports.packagePrefixes](map.md#map.php-imports.packagePrefixes)
      - fn [resolve](../../src/php-imports.ts#L85) (fromFile: string, spec: string) → Resolution
        <a id="map.php-imports.PhpResolver.resolve"></a>
        - calls [map.php-imports.PhpResolver.include](map.md#map.php-imports.PhpResolver.include), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase)
      - fn [include](../../src/php-imports.ts#L116) (fromFile: string, path: string) → Resolution <!-- internal -->
        <a id="map.php-imports.PhpResolver.include"></a><br>`include <path>`: an analysed file, a file on disk keylang does not index, or nothing; composer's own files are generated.
    - fn [packagePrefixes](../../src/php-imports.ts#L131) (text: string) → { prefix: string; name: string }[]
      <a id="map.php-imports.packagePrefixes"></a><br>Namespace prefixes of each package a composer lock or `installed.json` lists; none when it is no such JSON.
      - calls [base.json.parseJson](base.md#base.json.parseJson), [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase)
    - fn [readText](../../src/php-imports.ts#L166) (abs: string) → string | null <!-- internal -->
      <a id="map.php-imports.readText"></a><br>The file's text, or null when it does not exist or cannot be read.
  - module [python-imports](../../src/python-imports.ts#L1)
    <a id="map.python-imports"></a><br>Python dotted path → file. `.m.x` starts at the importing file's package (one dot per level), `a.b.x` at a source root (the repository root, then `src/`). A module is `p.py` or the package `p/__init__.py`; the longest prefix of the path that is a module names the file, and when…
    - node [external.node](external.md#external.node)
    - imports [map.imports](map.md#map.imports)
    - exact-path [map.exact-path](map.md#map.exact-path)
    - python-stdlib [map.python-stdlib](map.md#map.python-stdlib)
    - module [PythonResolver](../../src/python-imports.ts#L28)
      <a id="map.python-imports.PythonResolver"></a><br>Resolves Python import specs (`a.b.x`, `..m.x`, `m.*`) to repository files or to stdlib/external packages.
      - fn [constructor](../../src/python-imports.ts#L41) (root: string, sources: ReadonlySet<string> = new Set(), fs: ExactFs = nodeFs)
        <a id="map.python-imports.PythonResolver.constructor"></a><br>Stores the project root and known source files, derives their containing directories via [`map.python-imports.directoriesOf`](map.md#map.python-imports.directoriesOf), and keeps only the candidate root dirs that exist on disk per [`map.python-imports.PythonResolver.isDir`](map.md#map.python-imports.PythonResolver.isDir). _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [map.exact-path.exactExistence](map.md#map.exact-path.exactExistence), [map.python-imports.directoriesOf](map.md#map.python-imports.directoriesOf), [map.python-imports.PythonResolver.isDir](map.md#map.python-imports.PythonResolver.isDir)
      - fn [resolve](../../src/python-imports.ts#L51) (fromFile: string, spec: string) → Resolution
        <a id="map.python-imports.PythonResolver.resolve"></a><br>Resolves a Python import spec from a file, walking parent dirs for relative imports or scanning source roots via [`map.python-imports.PythonResolver.longest`](map.md#map.python-imports.PythonResolver.longest); otherwise classifies it as stdlib or an external package. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
        - calls [map.python-imports.PythonResolver.longest](map.md#map.python-imports.PythonResolver.longest), [map.python-imports.PythonResolver.moduleFile](map.md#map.python-imports.PythonResolver.moduleFile), [map.python-imports.PythonResolver.hasPython](map.md#map.python-imports.PythonResolver.hasPython), [map.python-stdlib.isPythonStdlib](map.md#map.python-stdlib.isPythonStdlib)
      - fn [longest](../../src/python-imports.ts#L99) (base: string, segments: string[], fromFile: string, least: number) → Resolution | null <!-- internal -->
        <a id="map.python-imports.PythonResolver.longest"></a><br>The longest prefix of `segments` of at least `least` segments under `base` that is a module.
        - calls [map.python-imports.PythonResolver.moduleFile](map.md#map.python-imports.PythonResolver.moduleFile)
      - fn [moduleFile](../../src/python-imports.ts#L118) (path: string) → string | null <!-- internal -->
        <a id="map.python-imports.PythonResolver.moduleFile"></a><br>`a/b.py`, else the package `a/b/__init__.py`; null for neither.
      - fn [hasPython](../../src/python-imports.ts#L125) (path: string) → boolean <!-- internal -->
        <a id="map.python-imports.PythonResolver.hasPython"></a><br>A directory with a `.py` file in it or below: among the sources, or on disk (an excluded package).
        - calls [map.python-imports.PythonResolver.isDir](map.md#map.python-imports.PythonResolver.isDir)
      - fn [isDir](../../src/python-imports.ts#L154) (path: string) → boolean <!-- internal -->
        <a id="map.python-imports.PythonResolver.isDir"></a><br>A directory among the analysed sources' parents, else on disk.
    - fn [directoriesOf](../../src/python-imports.ts#L163) (files: ReadonlySet<string>) → Set<string> <!-- internal -->
      <a id="map.python-imports.directoriesOf"></a><br>Every directory above a file of `files` (POSIX, relative).
  - module [python-stdlib](../../src/python-stdlib.ts#L1)
    <a id="map.python-stdlib"></a><br>Top-level modules of the Python standard library: the union of `sys.stdlib_module_names` over CPython 3.10–3.14, copied from the generated `Python/stdlib_module_names.h` of each CPython branch (no npm package carries this list, and analysis never runs a Python interpreter). The…
    - fn [isPythonStdlib](../../src/python-stdlib.ts#L52) (name: string) → boolean
      <a id="map.python-stdlib.isPythonStdlib"></a><br>`name` (the first segment of a dotted import) is a module of the Python standard library.
  - module [python-web-entries](../../src/python-web-entries.ts#L1)
    <a id="map.python-web-entries"></a><br>The registrations of the Python web frameworks (business-flows/38, ADR 0022), placed on the graph: Django `urls.py` (`path`, `re_path`, `include`, class-based views), signals (`signal.connect(h)`, `@receiver`) and management commands; FastAPI routers (`APIRouter(prefix=…)`…
    - config [base.config](base.md#base.config)
    - entries [map.entries](map.md#map.entries)
    - facts [extract.facts](extract.md#extract.facts)
    - events [base.events](base.md#base.events)
    - graph [map.graph](map.md#map.graph)
    - python-imports [map.python-imports](map.md#map.python-imports)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - type [Ref](../../src/python-web-entries.ts#L37) <!-- internal -->
      <a id="map.python-web-entries.Ref"></a><br>What a dotted name written in a file stands for.
    - type [ObjectKind](../../src/python-web-entries.ts#L45) = "fastapi" | "flask" | "blueprint" | "celery" | "signal" <!-- internal -->
      <a id="map.python-web-entries.ObjectKind"></a><br>The framework objects a module-level constructor call can make.
    - type [FrameworkObject](../../src/python-web-entries.ts#L48) <!-- internal -->
      <a id="map.python-web-entries.FrameworkObject"></a><br>An object a module-level statement makes with a framework's constructor: `router = APIRouter(prefix="/x")`.
    - type [Mount](../../src/python-web-entries.ts#L61) <!-- internal -->
      <a id="map.python-web-entries.Mount"></a><br>`parent.include_router(child, prefix=…)`, `app.register_blueprint(bp, url_prefix=…)`.
    - type [Receiver](../../src/python-web-entries.ts#L70) <!-- internal -->
      <a id="map.python-web-entries.Receiver"></a><br>A fn connected to a signal, with the label its entry shows and where it was connected.
    - type [PythonWebResult](../../src/python-web-entries.ts#L84)
      <a id="map.python-web-entries.PythonWebResult"></a><br>Entry points and unanswered registrations (holes) the adapters found.
    - fn [pythonWebEntries](../../src/python-web-entries.ts#L95) (config: Config, graph: Graph, facts: readonly FileFacts[], scope: EntryScope, active: readonly string[]) → PythonWebResult
      <a id="map.python-web-entries.pythonWebEntries"></a><br>The entries, edges and holes of the active Python web adapters (`active`, their names). Adds the edges to the graph's fns and lifts the holes the registrations answer (a recognised decorator, a `.delay()` or `.send()` whose target it names).
      - calls [map.python-web-entries.PythonWeb.run](map.md#map.python-web-entries.PythonWeb.run), [map.python-web-entries.PythonWeb](map.md#map.python-web-entries.PythonWeb)
    - module [PythonWeb](../../src/python-web-entries.ts#L100) <!-- internal -->
      <a id="map.python-web-entries.PythonWeb"></a><br>One pass of the Python web adapters over the facts; its state is the objects, mounts and registrations found so far.
      - fn [constructor](../../src/python-web-entries.ts#L123) (config: Config, graph: Graph, facts: readonly FileFacts[], scope: EntryScope, active: ReadonlySet<string>)
        <a id="map.python-web-entries.PythonWeb.constructor"></a>
        - calls [map.python-imports.PythonResolver](map.md#map.python-imports.PythonResolver)
      - fn [run](../../src/python-web-entries.ts#L141) () → PythonWebResult
        <a id="map.python-web-entries.PythonWeb.run"></a><br>The passes in dependency order; each pass reads every file before the next starts.
        - calls [map.python-web-entries.PythonWeb.collectObjects](map.md#map.python-web-entries.PythonWeb.collectObjects), [map.python-web-entries.PythonWeb.collectMounts](map.md#map.python-web-entries.PythonWeb.collectMounts), [map.python-web-entries.PythonWeb.decorated](map.md#map.python-web-entries.PythonWeb.decorated), [map.python-web-entries.PythonWeb.dependsInParams](map.md#map.python-web-entries.PythonWeb.dependsInParams), [map.python-web-entries.PythonWeb.connects](map.md#map.python-web-entries.PythonWeb.connects), [map.python-web-entries.PythonWeb.urls](map.md#map.python-web-entries.PythonWeb.urls), [map.python-web-entries.PythonWeb.command](map.md#map.python-web-entries.PythonWeb.command), [map.python-web-entries.PythonWeb.beat](map.md#map.python-web-entries.PythonWeb.beat), [map.python-web-entries.PythonWeb.dispatches](map.md#map.python-web-entries.PythonWeb.dispatches), [map.python-web-entries.PythonWeb.signalEvents](map.md#map.python-web-entries.PythonWeb.signalEvents), [map.python-web-entries.PythonWeb.lift](map.md#map.python-web-entries.PythonWeb.lift)
      - fn [resolve](../../src/python-web-entries.ts#L173) (file: string, dotted: string, depth = 0) → Ref | null <!-- internal -->
        <a id="map.python-web-entries.PythonWeb.resolve"></a><br>What `dotted`, written in `file`, stands for; null for a name the file neither declares nor imports.
        - calls [map.python-web-entries.PythonWeb.declares](map.md#map.python-web-entries.PythonWeb.declares), [map.python-imports.PythonResolver.resolve](map.md#map.python-imports.PythonResolver.resolve), [map.python-web-entries.PythonWeb.descend](map.md#map.python-web-entries.PythonWeb.descend)
      - fn [descend](../../src/python-web-entries.ts#L213) (ref: Ref, rest: string[], depth: number) → Ref | null <!-- internal -->
        <a id="map.python-web-entries.PythonWeb.descend"></a><br>A module or name with more attributes read on it; a name another module only imports is followed there.
        - calls [map.python-web-entries.PythonWeb.follow](map.md#map.python-web-entries.PythonWeb.follow)
      - fn [follow](../../src/python-web-entries.ts#L226) (file: string, name: string, rest: string[], depth: number) → Ref | null <!-- internal -->
        <a id="map.python-web-entries.PythonWeb.follow"></a><br>`name` of `file` with `rest`: declared there, or re-resolved through that file's own imports.
        - calls [map.python-web-entries.PythonWeb.declares](map.md#map.python-web-entries.PythonWeb.declares), [map.python-web-entries.PythonWeb.resolve](map.md#map.python-web-entries.PythonWeb.resolve)
      - fn [declares](../../src/python-web-entries.ts#L238) (facts: FileFacts, name: string) → boolean <!-- internal -->
        <a id="map.python-web-entries.PythonWeb.declares"></a><br>The file binds `name` at its top: a `def`, a `class` or an assignment.
      - fn [qualified](../../src/python-web-entries.ts#L246) (file: string, dotted: string) → string | null <!-- internal -->
        <a id="map.python-web-entries.PythonWeb.qualified"></a><br>The qualified name of a package's name written in `file`: `APIRouter` → `fastapi.APIRouter`.
        - calls [map.python-web-entries.PythonWeb.resolve](map.md#map.python-web-entries.PythonWeb.resolve)
      - fn [fnOf](../../src/python-web-entries.ts#L253) (file: string, dotted: string) → string | null <!-- internal -->
        <a id="map.python-web-entries.PythonWeb.fnOf"></a><br>The ID of the fn `dotted` names in `file`, or null when it names none.
        - calls [map.python-web-entries.PythonWeb.resolve](map.md#map.python-web-entries.PythonWeb.resolve), [map.entries.fnIn](map.md#map.entries.fnIn)
      - fn [classOf](../../src/python-web-entries.ts#L262) (file: string, dotted: string) → Module | null <!-- internal -->
        <a id="map.python-web-entries.PythonWeb.classOf"></a><br>The class module `dotted` names in `file`, or null.
        - calls [map.python-web-entries.PythonWeb.resolve](map.md#map.python-web-entries.PythonWeb.resolve)
      - fn [objectOf](../../src/python-web-entries.ts#L271) (file: string, dotted: string) → FrameworkObject | null <!-- internal -->
        <a id="map.python-web-entries.PythonWeb.objectOf"></a><br>The framework object `dotted` names in `file`, or null.
        - calls [map.python-web-entries.PythonWeb.resolve](map.md#map.python-web-entries.PythonWeb.resolve)
      - fn [collectObjects](../../src/python-web-entries.ts#L280) (file: FileFacts) → void <!-- internal -->
        <a id="map.python-web-entries.PythonWeb.collectObjects"></a><br>`x = Constructor(…)` at module level where the constructor is a framework's: routers, apps, blueprints, Celery apps, signals.
        - calls [map.python-web-entries.PythonWeb.qualified](map.md#map.python-web-entries.PythonWeb.qualified), [map.python-web-entries.objectKind](map.md#map.python-web-entries.objectKind), [map.python-web-entries.frameworkOf](map.md#map.python-web-entries.frameworkOf), [map.python-web-entries.kwarg](map.md#map.python-web-entries.kwarg), [map.python-web-entries.str](map.md#map.python-web-entries.str)
      - fn [collectMounts](../../src/python-web-entries.ts#L296) (file: FileFacts) → void <!-- internal -->
        <a id="map.python-web-entries.PythonWeb.collectMounts"></a><br>`parent.include_router(child)` / `app.register_blueprint(bp)` at module level; a child that is no known object is a hole.
        - calls [map.python-web-entries.PythonWeb.objectOf](map.md#map.python-web-entries.PythonWeb.objectOf), [map.python-web-entries.PythonWeb.hole](map.md#map.python-web-entries.PythonWeb.hole), [map.python-web-entries.text](map.md#map.python-web-entries.text), [map.python-web-entries.str](map.md#map.python-web-entries.str), [map.python-web-entries.kwarg](map.md#map.python-web-entries.kwarg)
      - fn [prefixes](../../src/python-web-entries.ts#L321) (key: string, seen: ReadonlySet<string> = new Set()) → string[] <!-- internal -->
        <a id="map.python-web-entries.PythonWeb.prefixes"></a><br>Every URL prefix an object's routes have: its own, behind each mount's (through the objects that mount it).
      - fn [decorated](../../src/python-web-entries.ts#L345) (file: FileFacts) → void <!-- internal -->
        <a id="map.python-web-entries.PythonWeb.decorated"></a><br>Every decorator of the file: a route of a known router/app, a Celery task, or a Django `@receiver`.
        - calls [map.python-web-entries.PythonWeb.objectOf](map.md#map.python-web-entries.PythonWeb.objectOf), [map.python-web-entries.PythonWeb.qualified](map.md#map.python-web-entries.PythonWeb.qualified), [map.python-web-entries.PythonWeb.route](map.md#map.python-web-entries.PythonWeb.route), [map.python-web-entries.isQualified](map.md#map.python-web-entries.isQualified), [map.python-web-entries.PythonWeb.task](map.md#map.python-web-entries.PythonWeb.task), [map.python-web-entries.PythonWeb.receiver](map.md#map.python-web-entries.PythonWeb.receiver)
      - fn [route](../../src/python-web-entries.ts#L361) (file: FileFacts, d: NonNullable<FileFacts["decorators"]>[number], object: FrameworkObject, verb: string) → void <!-- internal -->
        <a id="map.python-web-entries.PythonWeb.route"></a><br>A route decorator: one entry per URL prefix and HTTP method, plus FastAPI `dependencies`.
        - calls [map.entries.fnIn](map.md#map.entries.fnIn), [map.python-web-entries.str](map.md#map.python-web-entries.str), [map.python-web-entries.kwarg](map.md#map.python-web-entries.kwarg), [map.python-web-entries.PythonWeb.hole](map.md#map.python-web-entries.PythonWeb.hole), [map.python-web-entries.strings](map.md#map.python-web-entries.strings), [map.python-web-entries.PythonWeb.prefixes](map.md#map.python-web-entries.PythonWeb.prefixes), [map.python-web-entries.joinUrl](map.md#map.python-web-entries.joinUrl), [map.entries.frameworkEntry](map.md#map.entries.frameworkEntry), [map.python-web-entries.PythonWeb.depends](map.md#map.python-web-entries.PythonWeb.depends)
      - fn [task](../../src/python-web-entries.ts#L402) (file: FileFacts, d: NonNullable<FileFacts["decorators"]>[number]) → void <!-- internal -->
        <a id="map.python-web-entries.PythonWeb.task"></a><br>A Celery task: a `consumer` entry under its registered name (`name=`, else `module.fn`).
        - calls [map.entries.fnIn](map.md#map.entries.fnIn), [map.python-web-entries.PythonWeb.hole](map.md#map.python-web-entries.PythonWeb.hole), [map.python-web-entries.str](map.md#map.python-web-entries.str), [map.python-web-entries.kwarg](map.md#map.python-web-entries.kwarg), [map.python-web-entries.moduleName](map.md#map.python-web-entries.moduleName), [map.entries.frameworkEntry](map.md#map.entries.frameworkEntry)
      - fn [receiver](../../src/python-web-entries.ts#L419) (file: FileFacts, d: NonNullable<FileFacts["decorators"]>[number]) → void <!-- internal -->
        <a id="map.python-web-entries.PythonWeb.receiver"></a><br>`@receiver(signal | [signals], sender=…)`: one receiver per signal.
        - calls [map.entries.fnIn](map.md#map.entries.fnIn), [map.python-web-entries.PythonWeb.hole](map.md#map.python-web-entries.PythonWeb.hole), [map.python-web-entries.PythonWeb.observe](map.md#map.python-web-entries.PythonWeb.observe), [map.python-web-entries.kwarg](map.md#map.python-web-entries.kwarg)
      - fn [observe](../../src/python-web-entries.ts#L436) (file: string, line: number, col: number, signal: LiteralValue, fn: string, sender: LiteralValue | undefined) → void <!-- internal -->
        <a id="map.python-web-entries.PythonWeb.observe"></a><br>A receiver of a signal: an `observer` entry, and the fn `signal.send()` reaches.
        - calls [map.python-web-entries.PythonWeb.signalKey](map.md#map.python-web-entries.PythonWeb.signalKey), [map.python-web-entries.PythonWeb.hole](map.md#map.python-web-entries.PythonWeb.hole), [map.python-web-entries.text](map.md#map.python-web-entries.text), [map.entries.frameworkEntry](map.md#map.entries.frameworkEntry)
      - fn [signalKey](../../src/python-web-entries.ts#L454) (file: string, dotted: string) → string | null <!-- internal -->
        <a id="map.python-web-entries.PythonWeb.signalKey"></a><br>A signal's identity: the qualified name of Django's, `file#name` of one the repository makes with `Signal()`.
        - calls [map.python-web-entries.PythonWeb.resolve](map.md#map.python-web-entries.PythonWeb.resolve), [map.python-web-entries.isQualified](map.md#map.python-web-entries.isQualified)
      - fn [connects](../../src/python-web-entries.ts#L468) (file: FileFacts) → void <!-- internal -->
        <a id="map.python-web-entries.PythonWeb.connects"></a><br>`signal.connect(handler, sender=M)` at module level, or in a fn (`AppConfig.ready`).
        - calls [map.python-web-entries.PythonWeb.signalKey](map.md#map.python-web-entries.PythonWeb.signalKey), [map.python-web-entries.kwarg](map.md#map.python-web-entries.kwarg), [map.python-web-entries.PythonWeb.fnOf](map.md#map.python-web-entries.PythonWeb.fnOf), [map.python-web-entries.PythonWeb.hole](map.md#map.python-web-entries.PythonWeb.hole), [map.python-web-entries.text](map.md#map.python-web-entries.text), [map.python-web-entries.PythonWeb.observe](map.md#map.python-web-entries.PythonWeb.observe), [map.python-web-entries.PythonWeb.eachCall](map.md#map.python-web-entries.PythonWeb.eachCall)
      - fn [urls](../../src/python-web-entries.ts#L505) () → void <!-- internal -->
        <a id="map.python-web-entries.PythonWeb.urls"></a><br>`urlpatterns` from each root urls module (one no other `include`s), with the prefixes `include` adds.
        - calls [map.python-web-entries.PythonWeb.patterns](map.md#map.python-web-entries.PythonWeb.patterns), [map.python-web-entries.PythonWeb.includes](map.md#map.python-web-entries.PythonWeb.includes), [map.python-web-entries.PythonWeb.walkUrls](map.md#map.python-web-entries.PythonWeb.walkUrls)
      - fn [patterns](../../src/python-web-entries.ts#L517) (file: FileFacts) → LiteralValue[] <!-- internal -->
        <a id="map.python-web-entries.PythonWeb.patterns"></a><br>The items of every top-level statement of the file that assigns `urlpatterns`.
      - fn [includes](../../src/python-web-entries.ts#L522) (file: string, value: LiteralValue, found: (target: string) => void) → void <!-- internal -->
        <a id="map.python-web-entries.PythonWeb.includes"></a><br>The urls modules a pattern `include`s, without reporting anything.
        - calls [map.python-web-entries.PythonWeb.isDjango](map.md#map.python-web-entries.PythonWeb.isDjango), [map.python-web-entries.kwarg](map.md#map.python-web-entries.kwarg), [map.python-web-entries.PythonWeb.includedFile](map.md#map.python-web-entries.PythonWeb.includedFile)
      - fn [includedFile](../../src/python-web-entries.ts#L534) (file: string, arg: LiteralValue | undefined) → string | LiteralValue[] | null <!-- internal -->
        <a id="map.python-web-entries.PythonWeb.includedFile"></a><br>What `include(x)` includes: a urls module's file, an inline list of patterns, or null.
        - calls [map.python-imports.PythonResolver.resolve](map.md#map.python-imports.PythonResolver.resolve), [map.python-web-entries.PythonWeb.resolve](map.md#map.python-web-entries.PythonWeb.resolve)
      - fn [walkUrls](../../src/python-web-entries.ts#L559) (path: string, prefix: string, seen: ReadonlySet<string>) → void <!-- internal -->
        <a id="map.python-web-entries.PythonWeb.walkUrls"></a><br>Every pattern of a urls module under `prefix`; `seen` stops include cycles.
        - calls [map.python-web-entries.PythonWeb.patterns](map.md#map.python-web-entries.PythonWeb.patterns), [map.python-web-entries.PythonWeb.urlPattern](map.md#map.python-web-entries.PythonWeb.urlPattern)
      - fn [urlPattern](../../src/python-web-entries.ts#L569) (file: FileFacts, value: LiteralValue, prefix: string, seen: ReadonlySet<string>) → void <!-- internal -->
        <a id="map.python-web-entries.PythonWeb.urlPattern"></a><br>One `path(route, view)`: an include (recursing with a longer prefix), a class-based view, or a function view.
        - calls [map.python-web-entries.PythonWeb.isDjango](map.md#map.python-web-entries.PythonWeb.isDjango), [map.python-web-entries.PythonWeb.hole](map.md#map.python-web-entries.PythonWeb.hole), [map.python-web-entries.text](map.md#map.python-web-entries.text), [map.python-web-entries.str](map.md#map.python-web-entries.str), [map.python-web-entries.kwarg](map.md#map.python-web-entries.kwarg), [map.python-web-entries.PythonWeb.includedFile](map.md#map.python-web-entries.PythonWeb.includedFile), [map.python-web-entries.PythonWeb.walkUrls](map.md#map.python-web-entries.PythonWeb.walkUrls), [map.python-web-entries.PythonWeb.classOf](map.md#map.python-web-entries.PythonWeb.classOf), [map.entries.frameworkEntry](map.md#map.entries.frameworkEntry), [map.python-web-entries.PythonWeb.fnOf](map.md#map.python-web-entries.PythonWeb.fnOf)
      - fn [isDjango](../../src/python-web-entries.ts#L641) (file: string, callee: string, names: string[]) → boolean <!-- internal -->
        <a id="map.python-web-entries.PythonWeb.isDjango"></a><br>`callee` in `file` is one of Django's `names` (any module of the `django` package).
        - calls [map.python-web-entries.PythonWeb.qualified](map.md#map.python-web-entries.PythonWeb.qualified), [map.python-web-entries.isQualified](map.md#map.python-web-entries.isQualified)
      - fn [command](../../src/python-web-entries.ts#L648) (file: FileFacts) → void <!-- internal -->
        <a id="map.python-web-entries.PythonWeb.command"></a><br>`<app>/management/commands/<name>.py` with a class `Command`: `manage.py <name>` runs its `handle`.
        - calls [map.entries.fnIn](map.md#map.entries.fnIn), [map.entries.frameworkEntry](map.md#map.entries.frameworkEntry)
      - fn [beat](../../src/python-web-entries.ts#L664) (file: FileFacts) → void <!-- internal -->
        <a id="map.python-web-entries.PythonWeb.beat"></a><br>`beat_schedule = {name: {"task": "…", "schedule": crontab(…)}}`, in a Celery config or Django settings.
        - calls [map.python-web-entries.kwarg](map.md#map.python-web-entries.kwarg), [map.python-web-entries.str](map.md#map.python-web-entries.str), [map.python-web-entries.entryOf](map.md#map.python-web-entries.entryOf), [map.python-web-entries.PythonWeb.hole](map.md#map.python-web-entries.PythonWeb.hole), [map.python-web-entries.text](map.md#map.python-web-entries.text), [map.python-web-entries.PythonWeb.qualified](map.md#map.python-web-entries.PythonWeb.qualified), [map.python-web-entries.scheduleText](map.md#map.python-web-entries.scheduleText), [map.entries.frameworkEntry](map.md#map.entries.frameworkEntry)
      - fn [dependsInParams](../../src/python-web-entries.ts#L698) (file: FileFacts) → void <!-- internal -->
        <a id="map.python-web-entries.PythonWeb.dependsInParams"></a><br>`Depends(f)` in a parameter: the fn calls `f` with what the framework injects.
        - calls [map.entries.fnIn](map.md#map.entries.fnIn), [map.python-web-entries.PythonWeb.depends](map.md#map.python-web-entries.PythonWeb.depends)
      - fn [depends](../../src/python-web-entries.ts#L707) (file: string, fn: string, value: LiteralValue, hook: string) → void <!-- internal -->
        <a id="map.python-web-entries.PythonWeb.depends"></a><br>`Depends(f)` / `Security(f)` → an `injected` edge from `fn` to `f` (or to a class's `__init__`); a package's dependency is left alone.
        - calls [map.python-web-entries.PythonWeb.qualified](map.md#map.python-web-entries.PythonWeb.qualified), [map.python-web-entries.isQualified](map.md#map.python-web-entries.isQualified), [map.python-web-entries.kwarg](map.md#map.python-web-entries.kwarg), [map.python-web-entries.PythonWeb.resolve](map.md#map.python-web-entries.PythonWeb.resolve), [map.python-web-entries.PythonWeb.fnOf](map.md#map.python-web-entries.PythonWeb.fnOf), [map.python-web-entries.PythonWeb.constructorOf](map.md#map.python-web-entries.PythonWeb.constructorOf), [map.python-web-entries.PythonWeb.hole](map.md#map.python-web-entries.PythonWeb.hole), [map.python-web-entries.text](map.md#map.python-web-entries.text), [map.python-web-entries.PythonWeb.edge](map.md#map.python-web-entries.PythonWeb.edge)
      - fn [constructorOf](../../src/python-web-entries.ts#L731) (file: string, dotted: string) → string | null <!-- internal -->
        <a id="map.python-web-entries.PythonWeb.constructorOf"></a><br>The `__init__` of the class `dotted` names: what `Depends(SomeClass)` calls.
        - calls [map.python-web-entries.PythonWeb.classOf](map.md#map.python-web-entries.PythonWeb.classOf)
      - fn [dispatches](../../src/python-web-entries.ts#L738) (file: FileFacts) → void <!-- internal -->
        <a id="map.python-web-entries.PythonWeb.dispatches"></a><br>`task.delay()` / `task.apply_async()` → the task (`dispatch`); `signal.send()` → its receivers (`observer`).
        - calls [map.python-web-entries.PythonWeb.eachCall](map.md#map.python-web-entries.PythonWeb.eachCall), [map.python-web-entries.PythonWeb.fnOf](map.md#map.python-web-entries.PythonWeb.fnOf), [map.python-web-entries.PythonWeb.edge](map.md#map.python-web-entries.PythonWeb.edge), [map.python-web-entries.PythonWeb.signalKey](map.md#map.python-web-entries.PythonWeb.signalKey)
      - fn [signalEvents](../../src/python-web-entries.ts#L789) () → void <!-- internal -->
        <a id="map.python-web-entries.PythonWeb.signalEvents"></a><br>Signals as events (ADR 0022 п. 6): each signal that is sent or received is a node of the group `events`, named by the signal (`events.order_placed`, `events.post_save`); `send()` is a `dispatch` edge to it and each receiver an `observer` edge from it, at the receiver's…
        - calls [map.python-web-entries.compare](map.md#map.python-web-entries.compare), [base.events.eventSegment](base.md#base.events.eventSegment), [map.python-web-entries.splitSite](map.md#map.python-web-entries.splitSite), [map.python-web-entries.PythonWeb.edge](map.md#map.python-web-entries.PythonWeb.edge)
      - fn [eachCall](../../src/python-web-entries.ts#L838) (file: FileFacts, visit: (caller: string, call: CallFact) => void) → void <!-- internal -->
        <a id="map.python-web-entries.PythonWeb.eachCall"></a><br>Every call written in a fn of the file (methods of top-level classes included), with the fn's id.
        - calls [map.entries.fnIn](map.md#map.entries.fnIn)
      - fn [edge](../../src/python-web-entries.ts#L856) (source: string, call: Call) → void <!-- internal -->
        <a id="map.python-web-entries.PythonWeb.edge"></a><br>Adds `call` to the fn `source`, unless the same edge (target, via, position) is there already.
      - fn [lift](../../src/python-web-entries.ts#L866) () → void <!-- internal -->
        <a id="map.python-web-entries.PythonWeb.lift"></a><br>Lifts the holes a registration answers: a recognised decorator's, a dispatch's or a send's call.
      - fn [hole](../../src/python-web-entries.ts#L887) (file: string, line: number, col: number, fragment: string, reason: string, source: string | null) → void <!-- internal -->
        <a id="map.python-web-entries.PythonWeb.hole"></a><br>Records an `unsupported` hole: a registration that could not be read, with the reason.
    - fn [objectKind](../../src/python-web-entries.ts#L893) (q: string | null) → ObjectKind | null <!-- internal -->
      <a id="map.python-web-entries.objectKind"></a><br>The kind of framework object a qualified constructor name makes, or null.
      - calls [map.python-web-entries.isQualified](map.md#map.python-web-entries.isQualified)
    - fn [frameworkOf](../../src/python-web-entries.ts#L910) (kind: ObjectKind) → string <!-- internal -->
      <a id="map.python-web-entries.frameworkOf"></a><br>The adapter (framework name) an object kind belongs to.
    - fn [isQualified](../../src/python-web-entries.ts#L915) (q: string, pkg: string, names: readonly string[]) → boolean <!-- internal -->
      <a id="map.python-web-entries.isQualified"></a><br>`fastapi.routing.APIRouter` is `APIRouter` of `fastapi`; no `names` accepts any name of the package.
    - fn [kwarg](../../src/python-web-entries.ts#L922) (kwargs: readonly Kwarg[], name: string) → LiteralValue | undefined <!-- internal -->
      <a id="map.python-web-entries.kwarg"></a><br>The value of keyword argument `name`, or undefined.
    - fn [entryOf](../../src/python-web-entries.ts#L927) (dict: Extract<LiteralValue, { kind: "dict" }>, key: string) → LiteralValue | undefined <!-- internal -->
      <a id="map.python-web-entries.entryOf"></a><br>The value of the string key `key` in a dict literal, or undefined.
    - fn [str](../../src/python-web-entries.ts#L932) (value: LiteralValue | undefined) → string | undefined <!-- internal -->
      <a id="map.python-web-entries.str"></a><br>A string literal's value, or undefined for anything else.
    - fn [strings](../../src/python-web-entries.ts#L937) (value: LiteralValue | undefined) → string[] | undefined <!-- internal -->
      <a id="map.python-web-entries.strings"></a><br>A list of string literals, or undefined for anything else.
      - calls [map.python-web-entries.str](map.md#map.python-web-entries.str)
    - fn [text](../../src/python-web-entries.ts#L945) (value: LiteralValue) → string <!-- internal -->
      <a id="map.python-web-entries.text"></a><br>A value in words: a literal as written, a call by its callee.
    - fn [joinUrl](../../src/python-web-entries.ts#L965) (prefix: string, path: string) → string <!-- internal -->
      <a id="map.python-web-entries.joinUrl"></a><br>A URL from a router's prefix and a route's path: `/orders` + `/{id}`; at least `/`.
    - fn [moduleName](../../src/python-web-entries.ts#L972) (file: string) → string <!-- internal -->
      <a id="map.python-web-entries.moduleName"></a><br>The dotted module name of a Python file, as Celery names its tasks: `shop/tasks.py` → `shop.tasks`.
    - fn [scheduleText](../../src/python-web-entries.ts#L977) (value: LiteralValue | undefined, qualified: (dotted: string) => string | null) → string <!-- internal -->
      <a id="map.python-web-entries.scheduleText"></a><br>Celery's `crontab(minute=0, hour="*\/3")` as cron fields; a number of seconds; another schedule as written.
      - calls [map.python-web-entries.isQualified](map.md#map.python-web-entries.isQualified), [map.python-web-entries.kwarg](map.md#map.python-web-entries.kwarg), [map.python-web-entries.text](map.md#map.python-web-entries.text)
    - fn [compare](../../src/python-web-entries.ts#L1006) (a: string, b: string) → number <!-- internal -->
      <a id="map.python-web-entries.compare"></a><br>Code-unit order of two strings.
    - fn [splitSite](../../src/python-web-entries.ts#L1011) (site: string) → [string, number, number] <!-- internal -->
      <a id="map.python-web-entries.splitSite"></a><br>`file:line:col` of a registration, split.
  - module [rust-imports](../../src/rust-imports.ts#L1)
    <a id="map.rust-imports"></a><br>Rust path → file. A crate is a directory with `Cargo.toml` and `[package]`; each target — the library (`src/lib.rs` or `[lib] path`), and each binary (`src/main.rs`, `src/bin/*.rs`, `src/bin/*/main.rs`, `[[bin]] path`) — is a module tree of its own rooted at that file…
    - node [external.node](external.md#external.node)
    - smol-toml [external.smol-toml](external.md#external.smol-toml)
    - imports [map.imports](map.md#map.imports)
    - exact-path [map.exact-path](map.md#map.exact-path)
    - glob [base.glob](base.md#base.glob)
    - type [Crate](../../src/rust-imports.ts#L30) <!-- internal -->
      <a id="map.rust-imports.Crate"></a><br>One Cargo package of the repository, with its targets and dependency names.
    - module [RustResolver](../../src/rust-imports.ts#L44)
      <a id="map.rust-imports.RustResolver"></a><br>Resolves Rust `use` paths (`crate::`, `self::`, `super::`, crate names) to files or packages; caches manifests, crates and `mod` scans.
      - fn [constructor](../../src/rust-imports.ts#L58) (root: string, sources: ReadonlySet<string> = new Set(), fs: ExactFs = nodeFs)
        <a id="map.rust-imports.RustResolver.constructor"></a><br>Stores the repository root and known source files, then registers every named workspace member crate found via [`map.rust-imports.RustResolver.workspaceMembers`](map.md#map.rust-imports.RustResolver.workspaceMembers) and [`map.rust-imports.RustResolver.crateAt`](map.md#map.rust-imports.RustResolver.crateAt), plus the top-level crate, by crate name. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
        - calls [map.exact-path.exactExistence](map.md#map.exact-path.exactExistence)
      - fn [resolve](../../src/rust-imports.ts#L64) (fromFile: string, spec: string) → Resolution
        <a id="map.rust-imports.RustResolver.resolve"></a><br>Turns a `use` path from a Rust file into a resolution: toolchain names and `crate.deps` entries become external packages, `crate`/`self`/`super` and workspace members are anchored via [`map.rust-imports.RustResolver.rootOf`](map.md#map.rust-imports.RustResolver.rootOf) and [`map.rust-imports.modulePath`](map.md#map.rust-imports.modulePath), then the longest… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [map.rust-imports.RustResolver.crateOf](map.md#map.rust-imports.RustResolver.crateOf), [map.rust-imports.RustResolver.rootOf](map.md#map.rust-imports.RustResolver.rootOf), [map.rust-imports.modulePath](map.md#map.rust-imports.modulePath), [map.rust-imports.RustResolver.pathDependency](map.md#map.rust-imports.RustResolver.pathDependency), [map.rust-imports.RustResolver.membersOf](map.md#map.rust-imports.RustResolver.membersOf), [map.rust-imports.RustResolver.moduleFile](map.md#map.rust-imports.RustResolver.moduleFile), [map.rust-imports.RustResolver.declares](map.md#map.rust-imports.RustResolver.declares)
      - fn [moduleFile](../../src/rust-imports.ts#L143) (rootFile: string, path: string[]) → string | null <!-- internal -->
        <a id="map.rust-imports.RustResolver.moduleFile"></a><br>The file of a module path under a target root, or null: `a/b.rs`, `a/b/mod.rs`, the root itself for `[]`.
      - fn [rootOf](../../src/rust-imports.ts#L158) (crate: Crate, file: string) → string | null <!-- internal -->
        <a id="map.rust-imports.RustResolver.rootOf"></a><br>The target root whose module tree holds `file`; null for a file outside all of them (`build.rs`).
        - calls [map.rust-imports.modulePath](map.md#map.rust-imports.modulePath), [map.rust-imports.RustResolver.declares](map.md#map.rust-imports.RustResolver.declares)
      - fn [declares](../../src/rust-imports.ts#L191) (file: string, name: string, inline = false) → boolean <!-- internal -->
        <a id="map.rust-imports.RustResolver.declares"></a><br>The file declares `mod <name>` (only an inline `mod <name> { … }` with `inline`). A text scan: the resolver does not parse sources.
      - fn [crateOf](../../src/rust-imports.ts#L209) (file: string) → Crate | null <!-- internal -->
        <a id="map.rust-imports.RustResolver.crateOf"></a><br>The nearest crate at or above the file's directory, as Cargo finds a package.
        - calls [map.rust-imports.RustResolver.crateAt](map.md#map.rust-imports.RustResolver.crateAt)
      - fn [crateAt](../../src/rust-imports.ts#L221) (dir: string) → Crate | null <!-- internal -->
        <a id="map.rust-imports.RustResolver.crateAt"></a><br>The crate whose `Cargo.toml` with `[package]` is in `dir`, or null (a workspace-only manifest, or none); cached.
        - calls [map.rust-imports.RustResolver.manifestAt](map.md#map.rust-imports.RustResolver.manifestAt), [map.rust-imports.isTable](map.md#map.rust-imports.isTable), [map.rust-imports.isText](map.md#map.rust-imports.isText), [map.rust-imports.insideRoot](map.md#map.rust-imports.insideRoot)
      - fn [pathDependency](../../src/rust-imports.ts#L276) (crate: Crate, name: string) → Crate | null <!-- internal -->
        <a id="map.rust-imports.RustResolver.pathDependency"></a><br>The crate a `path` dependency named `name` in code points at, when it is inside the repository; null otherwise.
        - calls [map.rust-imports.RustResolver.crateAt](map.md#map.rust-imports.RustResolver.crateAt)
      - fn [membersOf](../../src/rust-imports.ts#L287) (crate: Crate) → Map<string, Crate> <!-- internal -->
        <a id="map.rust-imports.RustResolver.membersOf"></a><br>The members of the crate's workspace by name, as Cargo finds it: the nearest `Cargo.toml` with `[workspace]` from the crate's directory up to the analysis root, its `members` expanded relative to that manifest's directory, plus the root package itself; a crate under no…
        - calls [map.rust-imports.RustResolver.manifestAt](map.md#map.rust-imports.RustResolver.manifestAt), [map.rust-imports.isTable](map.md#map.rust-imports.isTable), [map.rust-imports.RustResolver.workspaceMembers](map.md#map.rust-imports.RustResolver.workspaceMembers), [map.rust-imports.RustResolver.crateAt](map.md#map.rust-imports.RustResolver.crateAt)
      - fn [workspaceMembers](../../src/rust-imports.ts#L320) (dir: string) → string[] <!-- internal -->
        <a id="map.rust-imports.RustResolver.workspaceMembers"></a><br>`[workspace] members` of the manifest in `dir`, root-relative, globs expanded one directory level at a time.
        - calls [map.rust-imports.RustResolver.manifestAt](map.md#map.rust-imports.RustResolver.manifestAt), [map.rust-imports.isTable](map.md#map.rust-imports.isTable), [map.rust-imports.isText](map.md#map.rust-imports.isText), [map.rust-imports.insideRoot](map.md#map.rust-imports.insideRoot), [base.glob.globToRegExp](base.md#base.glob.globToRegExp), [map.rust-imports.readdirNames](map.md#map.rust-imports.readdirNames)
      - fn [manifestAt](../../src/rust-imports.ts#L353) (dir: string) → TomlTable | null <!-- internal -->
        <a id="map.rust-imports.RustResolver.manifestAt"></a><br>The parsed `Cargo.toml` of a directory (root-relative, "" for the root), read once; null without one.
        - calls [map.rust-imports.RustResolver.readToml](map.md#map.rust-imports.RustResolver.readToml)
      - fn [readToml](../../src/rust-imports.ts#L364) (file: string) → TomlTable | null <!-- internal -->
        <a id="map.rust-imports.RustResolver.readToml"></a><br>A parsed TOML file, recording its text (or its absence) in `inputs`; a syntax error names the file.
    - fn [modulePath](../../src/rust-imports.ts#L385) (rootFile: string, file: string) → string[] <!-- internal -->
      <a id="map.rust-imports.modulePath"></a><br>Module path of a file under a target root: `src/a/b.rs` → `[a, b]`, `src/a/mod.rs` → `[a]`, the root → `[]`.
    - fn [insideRoot](../../src/rust-imports.ts#L396) (dir: string) → string | null <!-- internal -->
      <a id="map.rust-imports.insideRoot"></a><br>A normalized root-relative directory when it stays inside the repository ("" for the root); null when it leaves it.
    - fn [readdirNames](../../src/rust-imports.ts#L403) (abs: string) → string[] <!-- internal -->
      <a id="map.rust-imports.readdirNames"></a><br>The subdirectory names of `abs`, sorted.
    - fn [isTable](../../src/rust-imports.ts#L408) (value: TomlValue | undefined) → value is TomlTable <!-- internal -->
      <a id="map.rust-imports.isTable"></a><br>A Cargo.toml table: neither a list nor a date, the other values TOML gives as objects.
    - fn [isText](../../src/rust-imports.ts#L413) (value: TomlValue | undefined) → value is string <!-- internal -->
      <a id="map.rust-imports.isText"></a><br>A TOML string.
  - module [schema-discover](../../src/schema-discover.ts#L1)
    <a id="map.schema-discover"></a><br>Tables of a repository's schemas (system-design/07): `*.prisma` through `@mrleebo/prisma-ast` and `CREATE TABLE` / `CREATE INDEX` of `*.sql` through `pgsql-ast-parser` (PostgreSQL's grammar, which reads standard SQL; a dialect it does not know is a problem line, not an error).…
    - node [external.node](external.md#external.node)
    - pgsql-ast-parser [external.pgsql-ast-parser](external.md#external.pgsql-ast-parser)
    - analyze [map.analyze](map.md#map.analyze)
    - config [base.config](base.md#base.config)
    - diag [base.diag](base.md#base.diag)
    - glob [base.glob](base.md#base.glob)
    - parser [lang.parser](lang.md#lang.parser)
    - system [check.system](check.md#check.system)
    - system-discover [map.system-discover](map.md#map.system-discover)
    - mrleebo-prisma-ast [external.mrleebo-prisma-ast](external.md#external.mrleebo-prisma-ast)
    - type [SchemaRead](../../src/schema-discover.ts#L26)
      <a id="map.schema-discover.SchemaRead"></a><br>A schema file's tables, or why it was not read.
    - fn [segment](../../src/schema-discover.ts#L35) (name: string) → string <!-- internal -->
      <a id="map.schema-discover.segment"></a><br>A name as an ID segment: kept when it is one, else every other character as `_`.
      - calls [lang.parser.isSegment](lang.md#lang.parser.isSegment)
    - type [PrismaValue](../../src/schema-discover.ts#L56) = AttributeArgument["value"] <!-- internal -->
      <a id="map.schema-discover.PrismaValue"></a><br>What an attribute argument or an assignment holds in the Prisma AST.
    - fn [isText](../../src/schema-discover.ts#L59) (value: PrismaValue | undefined) → value is string <!-- internal -->
      <a id="map.schema-discover.isText"></a><br>A literal of the Prisma AST: an identifier or a still-quoted string.
    - fn [isPrismaNode](../../src/schema-discover.ts#L64) (value: PrismaValue | undefined) → value is KeyValue | Func | RelationArray | ObjectValue <!-- internal -->
      <a id="map.schema-discover.isPrismaNode"></a><br>A node of the Prisma AST (it has a `type`), not a literal or a list.
    - fn [unquote](../../src/schema-discover.ts#L69) (value: PrismaValue | undefined) → string | null <!-- internal -->
      <a id="map.schema-discover.unquote"></a><br>A text literal without its surrounding double quotes; null for anything else.
      - calls [map.schema-discover.isText](map.md#map.schema-discover.isText)
    - fn [arrayArg](../../src/schema-discover.ts#L74) (attribute: Attribute | BlockAttribute, key?: string) → string[] <!-- internal -->
      <a id="map.schema-discover.arrayArg"></a><br>The names of an attribute argument that is an array (`[a, b]`), or of a `key: [a, b]` argument.
      - calls [map.schema-discover.isPrismaNode](map.md#map.schema-discover.isPrismaNode)
    - fn [prismaTables](../../src/schema-discover.ts#L91) (text: string) → Promise<DiscoveredSchema>
      <a id="map.schema-discover.prismaTables"></a><br>The tables of a Prisma schema: a model is a table (`@@map` names it), a scalar field a column, `@relation(fields, references)` a foreign key.
      - calls [map.schema-discover.unquote](map.md#map.schema-discover.unquote), [map.schema-discover.segment](map.md#map.schema-discover.segment), [map.schema-discover.arrayArg](map.md#map.schema-discover.arrayArg)
    - fn [sqlTables](../../src/schema-discover.ts#L155) (text: string) → DiscoveredSchema
      <a id="map.schema-discover.sqlTables"></a><br>The tables of SQL: `CREATE TABLE` (columns, keys, `NOT NULL`, `UNIQUE`, references) and `CREATE INDEX`; other statements are skipped.
      - calls [map.schema-discover.segment](map.md#map.schema-discover.segment), [map.schema-discover.markColumn](map.md#map.schema-discover.markColumn)
    - fn [markColumn](../../src/schema-discover.ts#L209) (table: SystemTable, name: string, change: (column: SystemColumn) => SystemColumn) → void <!-- internal -->
      <a id="map.schema-discover.markColumn"></a><br>Replaces the column named `name` (as a segment) with `change` of it; a missing column is ignored.
      - calls [map.schema-discover.segment](map.md#map.schema-discover.segment)
    - fn [findSchemaFiles](../../src/schema-discover.ts#L228) (root: string, skip: readonly string[] = []) → string[]
      <a id="map.schema-discover.findSchemaFiles"></a><br>The schema files under the root — `*.prisma` and `*.sql`, outside hidden and dependency directories and the `exclude` and `outside` globs — relative to the root; at most 200 files of at most 1 MB each.
      - calls [base.config.toPosix](base.md#base.config.toPosix), [base.glob.firstMatchingGlob](base.md#base.glob.firstMatchingGlob)
    - fn [readSchemas](../../src/schema-discover.ts#L270) (root: string, files: readonly string[]) → Promise<SchemaRead>
      <a id="map.schema-discover.readSchemas"></a><br>The schema files found and parsed; a file that does not parse is a problem line.
      - calls [map.schema-discover.prismaTables](map.md#map.schema-discover.prismaTables), [map.schema-discover.sqlTables](map.md#map.schema-discover.sqlTables), [base.diag.errorText](base.md#base.diag.errorText)
    - type [Done](../../src/schema-discover.ts#L289) = Pick<Analysis, "config" | "snapshot"> <!-- internal -->
      <a id="map.schema-discover.Done"></a>
    - fn [schemaFiles](../../src/schema-discover.ts#L301) (done: Done) → string[]
      <a id="map.schema-discover.schemaFiles"></a><br>The schema files of an analysis's repository, found once per analysis: what the cache of `keylang web` watches.
      - calls [map.schema-discover.findSchemaFiles](map.md#map.schema-discover.findSchemaFiles)
    - fn [codeSchemas](../../src/schema-discover.ts#L315) (done: Done) → Promise<SchemaRead>
      <a id="map.schema-discover.codeSchemas"></a><br>The schemas of an analysis's repository, read once per analysis and only when asked (the system of the code, its ER view): `check` and the language server never walk the tree for them. None for specs checked without code.
      - calls [map.schema-discover.readSchemas](map.md#map.schema-discover.readSchemas), [map.schema-discover.schemaFiles](map.md#map.schema-discover.schemaFiles)
    - fn [readCodeSchemas](../../src/schema-discover.ts#L333) (done: Done) → SchemaRead | undefined
      <a id="map.schema-discover.readCodeSchemas"></a><br>The schemas `codeSchemas` has read for this analysis already, or undefined.
  - module [snapshot](../../src/snapshot.ts#L1)
    <a id="map.snapshot"></a><br>Analysis snapshot: the versioned fact store written to `.keylang/index.json`. Markdown maps are a projection of the graph; `check` in later tickets reads this file. `generated` is wall-clock metadata and is not part of `snapshotId`.
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - exports [map.exports](map.md#map.exports)
    - brief [base.brief](base.md#base.brief)
    - glob [base.glob](base.md#base.glob)
    - json [base.json](base.md#base.json)
    - events [base.events](base.md#base.events)
    - graph [map.graph](map.md#map.graph)
    - languages [base.languages](base.md#base.languages)
    - scc [check.scc](check.md#check.scc)
    - type [Resolution](../../src/snapshot.ts#L33) = "resolved" | "ambiguous" | "unresolved"
      <a id="map.snapshot.Resolution"></a><br>How far an edge's target is known: one symbol, several candidates, or none.
    - type [Provenance](../../src/snapshot.ts#L41) = "syntactic" | "docblock"
      <a id="map.snapshot.Provenance"></a><br>`syntactic`: a fact of the code the language runs. `docblock`: a fact written only in a documentation comment the language does not check (PHP `@var Foo` above an untyped property, `@param Foo $x`): static analysers trust it, and so does keylang, naming it in the verdict.
    - type [EdgeKind](../../src/snapshot.ts#L44) = "import" | "call" | "type" | "reexport"
      <a id="map.snapshot.EdgeKind"></a><br>What kind of reference an edge is.
    - type [SnapshotEdge](../../src/snapshot.ts#L47)
      <a id="map.snapshot.SnapshotEdge"></a><br>One observed reference in the code, with its position, resolution and provenance.
    - type [SnapshotExport](../../src/snapshot.ts#L135)
      <a id="map.snapshot.SnapshotExport"></a><br>One public name of a module and what it stands for.
    - type [CoverageItem](../../src/snapshot.ts#L165)
      <a id="map.snapshot.CoverageItem"></a><br>Something the analysis skipped or could not resolve, with where and why.
    - fn [leavesUnresolved](../../src/snapshot.ts#L186) (item: Pick<CoverageItem, "kind">) → boolean
      <a id="map.snapshot.leavesUnresolved"></a><br>A coverage entry that leaves something unresolved: every kind but `assumed-import`, an import of a file `assume` lists, which names no node on purpose and so can hide no edge.
    - type [SnapshotNode](../../src/snapshot.ts#L191)
      <a id="map.snapshot.SnapshotNode"></a><br>One node of the snapshot: a layer, module (file, directory or class), fn, type or event.
    - type [TypeField](../../src/snapshot.ts#L255)
      <a id="map.snapshot.TypeField"></a><br>One member of a type's shape: `note?: string` is `{ name: "note", optional: true, type: "string" }`.
    - type [Interception](../../src/snapshot.ts#L262)
      <a id="map.snapshot.Interception"></a><br>A plugin method that wraps a fn, from a framework config.
    - type [FrameworkManifest](../../src/snapshot.ts#L274)
      <a id="map.snapshot.FrameworkManifest"></a><br>A framework adapter that read the repository, with the config files it read: inputs of `snapshotId`.
    - type [SystemDoc](../../src/snapshot.ts#L284)
      <a id="map.snapshot.SystemDoc"></a><br>What the repository says about itself: the system level of C4. A node of the explained map and the zoom screen, never an ID of the language (ADR 0014).
    - type [RepositoryDocs](../../src/snapshot.ts#L294)
      <a id="map.snapshot.RepositoryDocs"></a><br>Text the repository writes about itself and its layers, read at the edge (`map.ts`).
    - type [EntryKind](../../src/snapshot.ts#L304) = (typeof ENTRY_KINDS)[number]
      <a id="map.snapshot.EntryKind"></a><br>One of `ENTRY_KINDS`.
    - fn [isEntryKind](../../src/snapshot.ts#L307) (value: string) → value is EntryKind
      <a id="map.snapshot.isEntryKind"></a><br>`value` is an entry kind (input validation for the index and the CLI).
    - type [EntryPoint](../../src/snapshot.ts#L316)
      <a id="map.snapshot.EntryPoint"></a><br>An entry point: a fn (or a module's top level) execution starts from, as the code or a manifest writes it. A fact, not an edge: nothing calls it from inside the repository.
    - type [AnalysisSnapshot](../../src/snapshot.ts#L342)
      <a id="map.snapshot.AnalysisSnapshot"></a><br>The whole fact store as `.keylang/index.json` holds it.
    - fn [sha256](../../src/snapshot.ts#L381) (text: string) → string
      <a id="map.snapshot.sha256"></a><br>Lowercase hex SHA-256 of the text's UTF-8 bytes.
    - fn [buildSnapshot](../../src/snapshot.ts#L389) ( graph: Graph, config: Config, files: readonly { path: string; sha256: string }[], /** Files (or an unreadable directory) left out; `source`: the ID scope they belong to when no module has the file. */ skipped: readonly { file: string; reason: string; source?: string; kind?: "skipped-file" | "outside-file"; text?: string }[], docs: RepositoryDocs = { system: { name: null, brief: null, source: null }, layers: new Map() }, /** The entry points and the manifests they were read from (path → text or null), which `snapshotId` covers like the sources. */ entries: { list: readonly EntryPoint[]; inputs: readonly (readonly [string, string | null])[] } = { list: [], inputs: [] }, /** Framework adapters in use and their config files, which `snapshotId` covers like the sources. */ frameworks: readonly FrameworkManifest[] = [], ) → AnalysisSnapshot
      <a id="map.snapshot.buildSnapshot"></a><br>The snapshot of a built graph: its ID over every input that decides the facts, and the facts themselves in a stable order.
      - calls [map.snapshot.grammarVersions](map.md#map.snapshot.grammarVersions), [map.snapshot.sha256](map.md#map.snapshot.sha256), [map.snapshot.docBrief](map.md#map.snapshot.docBrief), [map.snapshot.readsImportedValue](map.md#map.snapshot.readsImportedValue), [map.snapshot.indexDoc](map.md#map.snapshot.indexDoc), [base.glob.globDirectory](base.md#base.glob.globDirectory), [map.snapshot.compareCoverage](map.md#map.snapshot.compareCoverage), [map.snapshot.closures](map.md#map.snapshot.closures), [map.snapshot.exportRow](map.md#map.snapshot.exportRow)
    - fn [closures](../../src/snapshot.ts#L764) (nodes: Record<string, SnapshotNode>, coverage: readonly CoverageItem[], readsImported: ReadonlySet<string>) → void <!-- internal -->
      <a id="map.snapshot.closures"></a><br>`closure` of every fn and type, bottom-up over strongly connected components of the call graph: a component hashes its members' own fingerprints with the closures it calls outside itself, so a cycle terminates and every member of it changes together.
      - calls [base.languages.constructorName](base.md#base.languages.constructorName), [check.scc.components](check.md#check.scc.components), [map.snapshot.sha256](map.md#map.snapshot.sha256)
    - fn [readsImportedValue](../../src/snapshot.ts#L834) (print: string) → boolean <!-- internal -->
      <a id="map.snapshot.readsImportedValue"></a><br>Whether an extractor fingerprint marks a declaration that reads a value imported from another file of the repository: it ends with `+` (`READS_IMPORTED_VALUE` of `extract/treesitter.ts`, never a hex digit; overloads join with `:`, so any part may carry it).
    - fn [docBrief](../../src/snapshot.ts#L839) (doc: string | null | undefined) → string | null <!-- internal -->
      <a id="map.snapshot.docBrief"></a><br>The brief of a doc comment, or null without one.
      - calls [base.brief.briefOf](base.md#base.brief.briefOf)
    - fn [indexDoc](../../src/snapshot.ts#L848) (modules: readonly Module[], dir: string | null) → string | null <!-- internal -->
      <a id="map.snapshot.indexDoc"></a><br>The doc comment of the index module right in a layer's own directory (`src/tui/index.ts`, `mod.rs`, `__init__.py`: the index names of its language), as a brief.
      - calls [base.languages.languageOf](base.md#base.languages.languageOf), [map.snapshot.docBrief](map.md#map.snapshot.docBrief)
    - fn [exportRow](../../src/snapshot.ts#L864) (entry: ExportEntry) → SnapshotExport <!-- internal -->
      <a id="map.snapshot.exportRow"></a><br>A row of the graph's export table, with its fields in a fixed order.
    - fn [compareCoverage](../../src/snapshot.ts#L879) (a: CoverageItem, b: CoverageItem) → number <!-- internal -->
      <a id="map.snapshot.compareCoverage"></a><br>Coverage order: file, line, kind, reason; ties keep their insertion order (a stable sort).
      - calls [map.snapshot.cmp](map.md#map.snapshot.cmp)
    - fn [cmp](../../src/snapshot.ts#L884) (a: string, b: string) → number <!-- internal -->
      <a id="map.snapshot.cmp"></a><br>Code-unit order of two strings.
    - fn [grammarVersions](../../src/snapshot.ts#L898) ()
      <a id="map.snapshot.grammarVersions"></a><br>What parses the code, in `snapshotId` and the fact-cache key: the web-tree-sitter runtime as Node resolves it, and the grammars as the extractor loads them — from `dist/wasm` in the package, whose version prepack writes beside them, else from the installed…
      - calls [map.snapshot.installedVersion](map.md#map.snapshot.installedVersion), [map.snapshot.bundledGrammarsVersion](map.md#map.snapshot.bundledGrammarsVersion)
    - fn [bundledGrammarsVersion](../../src/snapshot.ts#L910) () → string | null <!-- internal -->
      <a id="map.snapshot.bundledGrammarsVersion"></a><br>The version prepack recorded beside the grammars in `dist/wasm`; null in a checkout.
      - calls [map.snapshot.readJson](map.md#map.snapshot.readJson), [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [installedVersion](../../src/snapshot.ts#L924) (name: string, resolve: () => string) → string | null <!-- internal -->
      <a id="map.snapshot.installedVersion"></a><br>The version in the nearest `package.json` of that name above the file `resolve` finds: a package's `exports` may not list `./package.json` (web-tree-sitter does not), so reading it by name fails. Null when the package is not installed.
      - calls [map.snapshot.readJson](map.md#map.snapshot.readJson), [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [readJson](../../src/snapshot.ts#L946) (file: string) → JsonObject | null <!-- internal -->
      <a id="map.snapshot.readJson"></a><br>A JSON object file, or null when it is missing, unreadable or not an object.
      - calls [base.json.parseJson](base.md#base.json.parseJson), [base.json.isJsonObject](base.md#base.json.isJsonObject)
  - module [system-discover](../../src/system-discover.ts#L1)
    <a id="map.system-discover"></a><br>The system of a repository's code (system-design/06): a pure function of the snapshot, no model. A layer with entry points is a component — a `service` for HTTP, CLI and scripts, a `worker` for cron and consumers — bound to its layer; a package of the technology catalog the…
    - external-ids [base.external-ids](base.md#base.external-ids)
    - parser [lang.parser](lang.md#lang.parser)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - span [base.span](base.md#base.span)
    - system-catalog [check.system-catalog](check.md#check.system-catalog)
    - system [check.system](check.md#check.system)
    - type [DiscoveredSchema](../../src/system-discover.ts#L45)
      <a id="map.system-discover.DiscoveredSchema"></a><br>Tables a schema reader found (system-design/07), by the technology of their database.
    - fn [discoverSystem](../../src/system-discover.ts#L55) (snapshot: AnalysisSnapshot, schemas: readonly DiscoveredSchema[] = []) → SystemSpec
      <a id="map.system-discover.discoverSystem"></a><br>The system of the snapshot's code; the same object for the same snapshot and schemas.
      - calls [map.system-discover.build](map.md#map.system-discover.build)
    - fn [adoptedName](../../src/system-discover.ts#L67) (snapshot: Pick<AnalysisSnapshot, "system">) → string
      <a id="map.system-discover.adoptedName"></a><br>The name the system of the code takes as a section (`# system <name>`): the repository's, as a segment.
      - calls [map.system-discover.segmentOf](map.md#map.system-discover.segmentOf)
    - fn [segmentOf](../../src/system-discover.ts#L72) (text: string, fallback: string) → string <!-- internal -->
      <a id="map.system-discover.segmentOf"></a><br>`text` as a lowercase ID segment (other characters become `-`), or `fallback` when nothing valid is left.
      - calls [lang.parser.isSegment](lang.md#lang.parser.isSegment)
    - fn [layerOfId](../../src/system-discover.ts#L79) (snapshot: AnalysisSnapshot, id: string) → string | null <!-- internal -->
      <a id="map.system-discover.layerOfId"></a><br>The layer of the nearest snapshot node at or above `id`, trimming one segment at a time.
    - fn [component](../../src/system-discover.ts#L90) (name: string, kind: ComponentKind, tech: string | null, code: string[]) → SystemComponent <!-- internal -->
      <a id="map.system-discover.component"></a><br>A discovered component: no zone, scale, tables or position yet.
    - fn [build](../../src/system-discover.ts#L95) (snapshot: AnalysisSnapshot, schemas: readonly DiscoveredSchema[]) → SystemSpec <!-- internal -->
      <a id="map.system-discover.build"></a><br>Builds the system: components, then stores, then relations, then sequences.
      - calls [check.system.moduleGraph](check.md#check.system.moduleGraph), [map.system-discover.layerOfId](map.md#map.system-discover.layerOfId), [base.span.compareText](base.md#base.span.compareText), [map.system-discover.component](map.md#map.system-discover.component), [map.system-discover.segmentOf](map.md#map.system-discover.segmentOf), [check.system-catalog.technologiesOfPackage](check.md#check.system-catalog.technologiesOfPackage), [check.system-catalog.isSqlClient](check.md#check.system-catalog.isSqlClient), [check.system.modulesUnder](check.md#check.system.modulesUnder), [check.system.reach](check.md#check.system.reach), [check.system-catalog.evidenceIds](check.md#check.system-catalog.evidenceIds), [map.system-discover.sequencesOf](map.md#map.system-discover.sequencesOf)
    - fn [fnOf](../../src/system-discover.ts#L218) (snapshot: AnalysisSnapshot, id: string) → string | null <!-- internal -->
      <a id="map.system-discover.fnOf"></a><br>The nearest fn at or above an ID, or null (a module's top level).
    - fn [sequencesOf](../../src/system-discover.ts#L241) ( snapshot: AnalysisSnapshot, graph: ModuleGraph, entries: readonly EntryPoint[], services: readonly SystemComponent[], stores: readonly { tech: Technology; component: SystemComponent }[], client: string | null, ) → SystemSequence[] <!-- internal -->
      <a id="map.system-discover.sequencesOf"></a><br>A sequence per entry point (HTTP first, then background, then the rest; at most 20): from the entry's fn, its calls in source order depth first, to depth 6, each fn once; a call into the code of another component is a message to it (and the walk goes on there), a call into a…
      - calls [map.system-discover.fnOf](map.md#map.system-discover.fnOf), [check.system-catalog.evidenceIds](check.md#check.system-catalog.evidenceIds), [base.span.compareText](base.md#base.span.compareText), [base.external-ids.externalPackageId](base.md#base.external-ids.externalPackageId), [map.system-discover.segmentOf](map.md#map.system-discover.segmentOf)
    - fn [systemMarkdown](../../src/system-discover.ts#L373) (system: SystemSpec, name: string) → string
      <a id="map.system-discover.systemMarkdown"></a><br>The discovered system as a `# system` section: what `keylang system discover` prints.
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
    - type [TracePlan](../../src/trace-plan.ts#L25)
      <a id="map.trace-plan.TracePlan"></a><br>The JSON contract a trace adapter reads: which functions to wrap, and where.
    - fn [tracePlan](../../src/trace-plan.ts#L38) (config: Config, flow: string) → Promise<{ plan: TracePlan; index: AnalysisSnapshot; omitted: string[] }>
      <a id="map.trace-plan.tracePlan"></a><br>The plan of `flow` on a fresh snapshot of the saved code. `omitted` are the flow's `trigger`/`step` IDs that are no function of that snapshot (a module, a type, an unknown ID, a file outside it): no adapter instruments them.
      - calls [map.trace-plan.flowSymbols](map.md#map.trace-plan.flowSymbols), [map.map.generateMap](map.md#map.map.generateMap), [map.trace-plan.planOf](map.md#map.trace-plan.planOf)
    - fn [entryTracePlan](../../src/trace-plan.ts#L53) (config: Config, entry: string, flow?: string) → Promise<{ plan: TracePlan; index: AnalysisSnapshot; omitted: string[] }>
      <a id="map.trace-plan.entryTracePlan"></a><br>The plan of the entry point `entry` (a fn of a fresh snapshot): every fn reachable from it (`reachableFrom`). `flow` names the runs it records; by default the entry's last segment. A request or a process names its own flow at run time (`X-Keylang-Flow`, `KEYLANG_FLOW`).
      - calls [map.map.generateMap](map.md#map.map.generateMap), [map.trace-plan.planOf](map.md#map.trace-plan.planOf), [map.trace-plan.reachableFrom](map.md#map.trace-plan.reachableFrom)
    - fn [reachableFrom](../../src/trace-plan.ts#L69) (index: AnalysisSnapshot, entry: string) → Set<string>
      <a id="map.trace-plan.reachableFrom"></a><br>The fns `entry` may run: the closure over resolved calls. A reached fn with a call keylang did not resolve (a call through a value, a dynamic member) widens it, since a trace is there to see where such a call goes: every fn whose name is the called name, and every fn read as a…
    - type [TraceScope](../../src/trace-plan.ts#L155) <!-- internal -->
      <a id="map.trace-plan.TraceScope"></a>
    - fn [planOf](../../src/trace-plan.ts#L158) (index: AnalysisSnapshot, flow: string, wanted: ReadonlySet<string>) → TraceScope <!-- internal -->
      <a id="map.trace-plan.planOf"></a><br>The plan for `wanted` IDs on `index`: fns with a known position and file hash become symbols, the rest is `omitted`.
    - fn [tracePlanText](../../src/trace-plan.ts#L181) (plan: TracePlan) → string
      <a id="map.trace-plan.tracePlanText"></a><br>What `keylang trace-plan` prints and an adapter reads: the plan as indented JSON and a newline.
    - fn [flowSymbols](../../src/trace-plan.ts#L186) (root: string, dir: string, flow: string) → Set<string> | null
      <a id="map.trace-plan.flowSymbols"></a><br>`trigger` and `step` IDs of the flow; null when no spec declares it.
      - calls [lang.files.collectMdFiles](lang.md#lang.files.collectMdFiles), [map.explanations.isStoredExplanation](map.md#map.explanations.isStoredExplanation), [lang.spec-ir.compileSpec](lang.md#lang.spec-ir.compileSpec), [lang.parser.parse](lang.md#lang.parser.parse), [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow)
  - module [wire-gen](../../src/wire-gen.ts#L1)
    <a id="map.wire-gen"></a><br>`keylang wire`: `# wiring` + the snapshot → `keylang.gen.ts` (ADR 0003). One memoized builder per factory: a builder awaits its dependencies, then calls the factory (`new` for a class) with them, so every node is built once per `wire()` call, after what it needs, and only when…
    - node [external.node](external.md#external.node)
    - imports [map.imports](map.md#map.imports)
    - json [base.json](base.md#base.json)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - wiring [check.wiring](check.md#check.wiring)
    - type [WireInput](../../src/wire-gen.ts#L25)
      <a id="map.wire-gen.WireInput"></a><br>What `generateWire` needs: the project root (for tsconfig), the output path, the wires and the snapshot.
    - type [Names](../../src/wire-gen.ts#L34) <!-- internal -->
      <a id="map.wire-gen.Names"></a><br>Local names of one ID in the generated file.
    - fn [generateWire](../../src/wire-gen.ts#L43) (input: WireInput) → string
      <a id="map.wire-gen.generateWire"></a><br>The text of the generated wiring file; throws on a cycle or a factory the file could not import.
      - calls [check.wiring.wireOrder](check.md#check.wiring.wireOrder), [map.wire-gen.isClass](map.md#map.wire-gen.isClass), [map.wire-gen.localNames](map.md#map.wire-gen.localNames), [map.wire-gen.importExtension](map.md#map.wire-gen.importExtension), [map.wire-gen.memberAccess](map.md#map.wire-gen.memberAccess), [check.wiring.wireImport](check.md#check.wiring.wireImport), [map.wire-gen.specifier](map.md#map.wire-gen.specifier), [map.wire-gen.key](map.md#map.wire-gen.key), [map.wire-gen.depValue](map.md#map.wire-gen.depValue)
    - fn [depValue](../../src/wire-gen.ts#L163) (d: WireDep, name: (id: string) => Names, callee: (id: string) => string) → string <!-- internal -->
      <a id="map.wire-gen.depValue"></a><br>The value of one dependency: a `when` branch chosen from `env` (else the default), wrapped by `compose` innermost first.
    - fn [memberAccess](../../src/wire-gen.ts#L179) (member: string) → string <!-- internal -->
      <a id="map.wire-gen.memberAccess"></a><br>`.name`, or `["name"]` for a member name that is not an identifier.
    - fn [isClass](../../src/wire-gen.ts#L184) (snapshot: AnalysisSnapshot, id: string) → boolean <!-- internal -->
      <a id="map.wire-gen.isClass"></a><br>A class is a module node with the class marker.
    - fn [localNames](../../src/wire-gen.ts#L196) (ids: readonly string[]) → Map<string, Names> <!-- internal -->
      <a id="map.wire-gen.localNames"></a><br>Identifiers for each ID: the ID with `_` for every character a JS name does not take. IDs that collapse to one name (`a-b.f`, `a_b.f`, `a.b.f`) each get a short hash of the ID, so a name does not change when an unrelated ID comes or goes; the helpers derived from a name are…
      - calls [map.wire-gen.shortHash](map.md#map.wire-gen.shortHash)
    - fn [shortHash](../../src/wire-gen.ts#L227) (text: string) → string <!-- internal -->
      <a id="map.wire-gen.shortHash"></a><br>The first six hex digits of the SHA-256 of `text`: a stable disambiguator.
    - fn [key](../../src/wire-gen.ts#L232) (name: string) → string <!-- internal -->
      <a id="map.wire-gen.key"></a><br>An object key: bare when it is a JS identifier, else quoted.
    - fn [importExtension](../../src/wire-gen.ts#L241) (root: string) → "ts" | "js" | "none" <!-- internal -->
      <a id="map.wire-gen.importExtension"></a><br>How the project writes relative imports: `.ts` with `allowImportingTsExtensions` or `rewriteRelativeImportExtensions`, `.js` under `node16`/`nodenext` resolution, no extension otherwise (bundlers). Relative `extends` are followed.
      - calls [map.wire-gen.compilerOptions](map.md#map.wire-gen.compilerOptions), [map.wire-gen.moduleResolution](map.md#map.wire-gen.moduleResolution)
    - fn [moduleResolution](../../src/wire-gen.ts#L253) (options: JsonObject) → string <!-- internal -->
      <a id="map.wire-gen.moduleResolution"></a><br>The module resolution tsc uses: the explicit one, else the one `module` implies (node16/node18/node20 → node16, nodenext → nodenext).
    - fn [compilerOptions](../../src/wire-gen.ts#L261) (file: string, depth: number) → JsonObject <!-- internal -->
      <a id="map.wire-gen.compilerOptions"></a><br>`compilerOptions` of a tsconfig over those of its relative `extends`; package configs are not read.
      - calls [map.imports.readJsonc](map.md#map.imports.readJsonc), [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [specifier](../../src/wire-gen.ts#L281) (out: string, file: string, ext: "ts" | "js" | "none") → string <!-- internal -->
      <a id="map.wire-gen.specifier"></a><br>The import specifier for `file` as seen from the output file, with the extension the project's resolution expects.
