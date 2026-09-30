<!-- keylang:generated — не редагувати, `keylang map` -->

[README](README.md) · modules: [operations](#operations.operations)

# map

- operations
  <a id="operations"></a>
  - module [operations](../../src/operations.ts#L1)
    <a id="operations.operations"></a><br>Shared workspace operations (ADR 0008): transport-independent orchestration of the application-level actions. The CLI and the TUI call the same interface: a typed request with an explicit absolute root, a typed result with a domain payload.
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - baseline [features.baseline](features.md#features.baseline)
    - changed [features.changed](features.md#features.changed)
    - check-results [features.check-results](features.md#features.check-results)
    - config [base.config](base.md#base.config)
    - diag [base.diag](base.md#base.diag)
    - explain-llm [features.explain-llm](features.md#features.explain-llm)
    - explanations [map.explanations](map.md#map.explanations)
    - files [lang.files](lang.md#lang.files)
    - fmt [lang.fmt](lang.md#lang.fmt)
    - feature-status [features.feature-status](features.md#features.feature-status)
    - harness [features.harness](features.md#features.harness)
    - graph [map.graph](map.md#map.graph)
    - llm [features.llm](features.md#features.llm)
    - map [map.map](map.md#map.map)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - span [base.span](base.md#base.span)
    - voice-local [features.voice-local](features.md#features.voice-local)
    - voice [features.voice](features.md#features.voice)
    - git-changes [features.git-changes](features.md#features.git-changes)
    - wire-gen [map.wire-gen](map.md#map.wire-gen)
    - type [DoctorRequest](../../src/operations.ts#L34)
      <a id="operations.operations.DoctorRequest"></a><br>The known operations. `doctor` is the first; new kinds arrive with their feature.
    - type [FeatureRequest](../../src/operations.ts#L41)
      <a id="operations.operations.FeatureRequest"></a><br>Whether a feature file is done, on the saved state of the repository (tools.md `feature`).
    - type [MapCheckRequest](../../src/operations.ts#L50)
      <a id="operations.operations.MapCheckRequest"></a><br>Whether the generated map on disk matches the code (`keylang map --check`). Read-only.
    - type [MapRequest](../../src/operations.ts#L59)
      <a id="operations.operations.MapRequest"></a><br>Writes the generated map, the explained map, the index and the fact cache (`keylang map`).
    - type [BaselineRequest](../../src/operations.ts#L71)
      <a id="operations.operations.BaselineRequest"></a><br>Writes `<dir>/rules.baseline.md` from the current layer graph (`keylang baseline`), or with `check` only compares it (`keylang baseline --check`).
    - type [AgentsRequest](../../src/operations.ts#L84)
      <a id="operations.operations.AgentsRequest"></a><br>Installs or strips the managed harness files (`keylang agents [--agents=LIST]`), or with `check` only compares them (`--check`). Setting files up says nothing about whether a harness client runs.
    - type [FmtRequest](../../src/operations.ts#L99)
      <a id="operations.operations.FmtRequest"></a><br>Rewrites Markdown files in the canonical form (`keylang fmt <paths…>`), or with `check` only compares them (`--check`). Each file is formatted on its own from its saved bytes by `formatSource`.
    - type [WireRequest](../../src/operations.ts#L119)
      <a id="operations.operations.WireRequest"></a><br>Generates the container of `# wiring` (`keylang wire [--out <file>]`), or with `check` only compares it (`--check`). The generated file is never compiled or run here.
    - type [CheckRequest](../../src/operations.ts#L134)
      <a id="operations.operations.CheckRequest"></a><br>Checks the saved specs against the code (`keylang check [paths…] [--strict] [--static <mode>]`). Read-only.
    - type [InitRequest](../../src/operations.ts#L161)
      <a id="operations.operations.InitRequest"></a><br>Sets a repository up (`keylang init [dir] [--agents=LIST]`): keylang.json (an existing one is kept), the map, the baseline and the harness files, in that order. With `check` it runs exactly `init --check`: the harness files and the baseline are compared; the map is not (that is…
    - type [OperationRequest](../../src/operations.ts#L173)
      <a id="operations.operations.OperationRequest"></a>
    - type [OperationContext](../../src/operations.ts#L179)
      <a id="operations.operations.OperationContext"></a><br>What an operation may use besides its request. No UI state, no shell.
    - type [OperationStatus](../../src/operations.ts#L198) = "completed" | "failed" | "cancelled"
      <a id="operations.operations.OperationStatus"></a>
    - type [OperationMessage](../../src/operations.ts#L200)
      <a id="operations.operations.OperationMessage"></a>
    - type [DoctorPayload](../../src/operations.ts#L207)
      <a id="operations.operations.DoctorPayload"></a><br>The structured doctor report. Key values never reach it.
    - type [FeaturePayload](../../src/operations.ts#L250)
      <a id="operations.operations.FeaturePayload"></a><br>The feature status the CLI prints (`report`), with the file and the snapshot it was computed on.
    - type [MapCheckPayload](../../src/operations.ts#L261)
      <a id="operations.operations.MapCheckPayload"></a><br>How the generated map on disk differs from a fresh render. Paths are POSIX, relative to the root.
    - type [MapPayload](../../src/operations.ts#L280)
      <a id="operations.operations.MapPayload"></a><br>What `keylang map` did. With conflicts or refusals nothing is written and `steps` is empty; otherwise every planned file step is listed with its state, so a partial commit names what landed, what failed and what was never tried.
    - type [BaselinePayload](../../src/operations.ts#L296)
      <a id="operations.operations.BaselinePayload"></a><br>What `keylang baseline [--check]` found and did. The path is POSIX, relative to the root.
    - type [AgentsPayload](../../src/operations.ts#L324)
      <a id="operations.operations.AgentsPayload"></a><br>What `keylang agents [--check]` planned and did. With `error` or `refused` nothing was written and `steps` is empty; otherwise every changed file is a step with its state.
    - type [FmtFile](../../src/operations.ts#L349)
      <a id="operations.operations.FmtFile"></a><br>One Markdown file of `keylang fmt`, in the order the paths name them. `current`: already canonical; `stale`: not canonical, and not written (a check, or a write stopped before it); `formatted`: written by this run; `invalid`: the tree shape is ambiguous (K003), never rewritten…
    - type [FmtPayload](../../src/operations.ts#L362)
      <a id="operations.operations.FmtPayload"></a><br>What `keylang fmt [--check]` found and did, file by file.
    - type [WirePayload](../../src/operations.ts#L368)
      <a id="operations.operations.WirePayload"></a><br>What `keylang wire [--check]` found and did. The path is POSIX, relative to the root.
    - type [CheckPayload](../../src/operations.ts#L396)
      <a id="operations.operations.CheckPayload"></a><br>What `keylang check` found on the saved files. `results`, `snapshotId` and `coverage` are exactly `--format json`; `lines` and `counts` are the human output and its summary. Paths are relative to the request's `base`.
    - type [ChangedSlice](../../src/operations.ts#L421)
      <a id="operations.operations.ChangedSlice"></a><br>What `--changed` kept: the ref, what git reported, and how much of the full report the slice left out.
    - type [InitPayload](../../src/operations.ts#L441)
      <a id="operations.operations.InitPayload"></a><br>What `keylang init [--check]` did, stage by stage. Each stage is the result of its own shared operation, null when it was not run (a check has no map stage; a failure or a cancellation stops the stages after it).
    - type [OperationPayloads](../../src/operations.ts#L467)
      <a id="operations.operations.OperationPayloads"></a><br>The payload type of each operation kind.
    - type [OperationResult](../../src/operations.ts#L481)
      <a id="operations.operations.OperationResult"></a><br>The result of one operation. File paths are POSIX, relative to the request's root.
    - type [OperationEnvelope](../../src/operations.ts#L483)
      <a id="operations.operations.OperationEnvelope"></a>
    - fn [runOperation](../../src/operations.ts#L504) (request: DoctorRequest, context?: OperationContext) → Promise<OperationEnvelope<"doctor">>
      <a id="operations.operations.runOperation"></a><br>Runs one operation and returns its typed result: the payload type follows the request's kind.
      - calls [operations.operations.runDoctor](operations.md#operations.operations.runDoctor), [operations.operations.runFeature](operations.md#operations.operations.runFeature), [operations.operations.runMapCheck](operations.md#operations.operations.runMapCheck), [operations.operations.runMap](operations.md#operations.operations.runMap), [operations.operations.runBaseline](operations.md#operations.operations.runBaseline), [operations.operations.runAgents](operations.md#operations.operations.runAgents), [operations.operations.runFmt](operations.md#operations.operations.runFmt), [operations.operations.runWire](operations.md#operations.operations.runWire), [operations.operations.runCheck](operations.md#operations.operations.runCheck), [operations.operations.runInit](operations.md#operations.operations.runInit)
    - fn [resultWithout](../../src/operations.ts#L544) (kind: OperationRequest["kind"], status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationResult
      <a id="operations.operations.resultWithout"></a><br>A result without a payload, for a failure outside the operation (a transport that could not run it) or a cancellation.
    - fn [emptyMapCheck](../../src/operations.ts#L570) (status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationEnvelope<"map-check"> <!-- internal -->
      <a id="operations.operations.emptyMapCheck"></a>
    - fn [runMapCheck](../../src/operations.ts#L580) (request: MapCheckRequest, context: OperationContext) → Promise<OperationEnvelope<"map-check">> <!-- internal -->
      <a id="operations.operations.runMapCheck"></a><br>`keylang map --check`: renders the map from the code and compares it with the files on disk. It writes nothing — not the map, the index, nor the fact cache (`persistFacts` stays off).
      - calls [operations.operations.emptyMapCheck](operations.md#operations.operations.emptyMapCheck), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [map.map.diffMap](map.md#map.map.diffMap), [base.config.toPosix](base.md#base.config.toPosix), [operations.operations.mapCheckLines](operations.md#operations.operations.mapCheckLines)
    - fn [emptyMap](../../src/operations.ts#L612) (status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationEnvelope<"map"> <!-- internal -->
      <a id="operations.operations.emptyMap"></a>
    - fn [runMap](../../src/operations.ts#L627) (request: MapRequest, context: OperationContext) → Promise<OperationEnvelope<"map">> <!-- internal -->
      <a id="operations.operations.runMap"></a><br>`keylang map` in two phases. Compute: the analysis (the fact cache is prepared, not written) and a plan with the expected bytes of every target.
      - calls [operations.operations.emptyMap](operations.md#operations.operations.emptyMap), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [map.map.planMap](map.md#map.map.planMap), [operations.operations.mapConflictLines](operations.md#operations.operations.mapConflictLines), [map.map.mapPlanProblems](map.md#map.map.mapPlanProblems), [map.map.commitMap](map.md#map.map.commitMap), [operations.operations.mapStepLines](operations.md#operations.operations.mapStepLines)
    - fn [mapConflictLines](../../src/operations.ts#L703) (conflicts: readonly string[], path: (file: string) => string = (file) => file) → string[]
      <a id="operations.operations.mapConflictLines"></a><br>The conflict lines `keylang map` prints: nothing is written while any exists.
    - fn [mapStepLines](../../src/operations.ts#L712) (steps: readonly CommittedStep[], path: (file: string) => string = (file) => file) → string[]
      <a id="operations.operations.mapStepLines"></a><br>The lines `keylang map` prints for its completed steps of both maps: writes, then removals. The index and the fact cache are written silently, as they always were; the payload lists them.
    - fn [mapSummary](../../src/operations.ts#L718) (payload: MapPayload) → string
      <a id="operations.operations.mapSummary"></a><br>The summary `keylang map` writes to stderr after a commit.
    - fn [mapCheckLines](../../src/operations.ts#L735) (diff: { conflicts: readonly string[]; stale: readonly string[] }, path: (file: string) => string = (file) => file) → string[]
      <a id="operations.operations.mapCheckLines"></a><br>The lines `map --check` prints, paths as given (the CLI makes them relative to its working directory). A manual file blocks `map` itself, so with a conflict "run keylang map" would not refresh the rest: stale files are then not listed.
      - calls [operations.operations.mapConflictLines](operations.md#operations.operations.mapConflictLines)
    - fn [emptyBaseline](../../src/operations.ts#L741) (status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationEnvelope<"baseline"> <!-- internal -->
      <a id="operations.operations.emptyBaseline"></a>
    - fn [runBaseline](../../src/operations.ts#L757) (request: BaselineRequest, context: OperationContext) → Promise<OperationEnvelope<"baseline">> <!-- internal -->
      <a id="operations.operations.runBaseline"></a><br>`keylang baseline [--check]`: the rules of the current layer graph (the rule algorithm of `baselineText`) against `<dir>/rules.baseline.md`. The analysis reads the code and the saved `keylang.json`, not the specs, and writes no fact cache.
      - calls [operations.operations.emptyBaseline](operations.md#operations.operations.emptyBaseline), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [features.baseline.planBaseline](features.md#features.baseline.planBaseline), [features.baseline.baselinePlanProblems](features.md#features.baseline.baselinePlanProblems), [features.baseline.commitBaseline](features.md#features.baseline.commitBaseline)
    - fn [emptyAgents](../../src/operations.ts#L824) (status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationEnvelope<"agents"> <!-- internal -->
      <a id="operations.operations.emptyAgents"></a>
    - fn [runAgents](../../src/operations.ts#L840) (request: AgentsRequest, context: OperationContext) → Promise<OperationEnvelope<"agents">> <!-- internal -->
      <a id="operations.operations.runAgents"></a><br>`keylang agents [--check]`: the managed harness files of the chosen harnesses (the unchanged adapters of `harness.ts`) against the disk. The whole plan is built first: a broken marker or invalid JSON/TOML fails it with code 2 naming the file, and nothing is written.
      - calls [operations.operations.emptyAgents](operations.md#operations.operations.emptyAgents), [features.harness.planAgents](features.md#features.harness.planAgents), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [features.harness.agentsPlanProblems](features.md#features.harness.agentsPlanProblems), [features.harness.commitAgents](features.md#features.harness.commitAgents)
    - fn [emptyInit](../../src/operations.ts#L907) (status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationEnvelope<"init"> <!-- internal -->
      <a id="operations.operations.emptyInit"></a>
    - fn [initSources](../../src/operations.ts#L917) (root: string, label = ".") → { config: Config } | { error: string }
      <a id="operations.operations.initSources"></a><br>The configuration `keylang init` describes: the saved keylang.json, else the guess. An error (a broken keylang.json, no supported sources) is the reason init stops with code 2 before anything else, the harness selection included.
      - calls [base.config.loadConfig](base.md#base.config.loadConfig), [operations.operations.messageOf](operations.md#operations.operations.messageOf)
    - fn [runInit](../../src/operations.ts#L944) (request: InitRequest, context: OperationContext) → Promise<OperationEnvelope<"init">> <!-- internal -->
      <a id="operations.operations.runInit"></a><br>`keylang init [--check]`: an orchestration of the shared config, map, baseline and agents steps, not a call of the CLI commands. Before anything: the configuration (2 when it is broken or there is no supported source), then the harness plan (a broken harness file is 2 and…
      - calls [operations.operations.emptyInit](operations.md#operations.operations.emptyInit), [operations.operations.initSources](operations.md#operations.operations.initSources), [base.config.guessLayout](base.md#base.config.guessLayout), [operations.operations.runAgents](operations.md#operations.operations.runAgents), [operations.operations.runBaseline](operations.md#operations.operations.runBaseline), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic), [base.config.configToJson](base.md#base.config.configToJson), [operations.operations.runMap](operations.md#operations.operations.runMap)
    - fn [emptyFmt](../../src/operations.ts#L1029) (status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationEnvelope<"fmt"> <!-- internal -->
      <a id="operations.operations.emptyFmt"></a>
    - fn [runFmt](../../src/operations.ts#L1045) (request: FmtRequest, context: OperationContext) → Promise<OperationEnvelope<"fmt">> <!-- internal -->
      <a id="operations.operations.runFmt"></a><br>`keylang fmt [--check]` in two phases. Compute: every file is read and formatted by `formatSource`; one that cannot be read, or whose tree shape is ambiguous (K003), is reported and the rest go on; a saved explanation is skipped.
      - calls [operations.operations.emptyFmt](operations.md#operations.operations.emptyFmt), [base.config.assertFormatOnly](base.md#base.config.assertFormatOnly), [lang.files.collectMdFiles](lang.md#lang.files.collectMdFiles), [base.config.toPosix](base.md#base.config.toPosix), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [map.explanations.isStoredExplanation](map.md#map.explanations.isStoredExplanation), [lang.fmt.formatSource](lang.md#lang.fmt.formatSource), [operations.operations.fmtMessages](operations.md#operations.operations.fmtMessages), [operations.operations.commitFormatted](operations.md#operations.operations.commitFormatted)
    - fn [commitFormatted](../../src/operations.ts#L1131) (abs: string, source: string, text: string) → void <!-- internal -->
      <a id="operations.operations.commitFormatted"></a><br>Writes one formatted file: atomically at the file a link names, with the formatter's bytes (`fmt` turns CRLF into LF, as it always did), and only when the file still holds `source`. A file that cannot be written in place (read-only) is not replaced by the rename either.
      - calls [base.safe-write.landing](base.md#base.safe-write.landing), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic)
    - fn [fmtMessages](../../src/operations.ts#L1143) (payload: FmtPayload) → OperationMessage[]
      <a id="operations.operations.fmtMessages"></a><br>The report, file by file in path order: `info` is what `keylang fmt` prints to stdout, `error` what it prints to stderr; a `warning` names a skipped explanation, which the CLI passes over silently.
      - calls [base.diag.formatDiagnostic](base.md#base.diag.formatDiagnostic)
    - fn [emptyWire](../../src/operations.ts#L1157) (status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationEnvelope<"wire"> <!-- internal -->
      <a id="operations.operations.emptyWire"></a>
    - fn [runWire](../../src/operations.ts#L1176) (request: WireRequest, context: OperationContext) → Promise<OperationEnvelope<"wire">> <!-- internal -->
      <a id="operations.operations.runWire"></a><br>`keylang wire [--check]` in two phases. The path policy of `out` is checked before anything is read: a plain relative TypeScript path that stays inside the repository through links (code 2 otherwise).
      - calls [operations.operations.emptyWire](operations.md#operations.operations.emptyWire), [operations.operations.wireOutProblem](operations.md#operations.operations.wireOutProblem), [operations.operations.wireSpecInputs](operations.md#operations.operations.wireSpecInputs), [base.config.loadConfig](base.md#base.config.loadConfig), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [operations.operations.wiringErrors](operations.md#operations.operations.wiringErrors), [map.wire-gen.generateWire](map.md#map.wire-gen.generateWire), [base.safe-write.landing](base.md#base.safe-write.landing), [map.map.sourceInputs](map.md#map.map.sourceInputs), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [map.map.sourceInputProblems](map.md#map.map.sourceInputProblems), [operations.operations.wireSpecProblems](operations.md#operations.operations.wireSpecProblems), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic)
    - fn [wireOutProblem](../../src/operations.ts#L1267) (root: string, out: string) → string | null
      <a id="operations.operations.wireOutProblem"></a><br>Why `out` cannot be the generated file (the CLI's message), or null: the path policy of every write — plain, relative, inside the repository through links — and a TypeScript extension. Reads nothing outside the repository and writes nothing; a form may call it as the path is…
      - calls [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [operations.operations.messageOf](operations.md#operations.operations.messageOf)
    - fn [wiringErrors](../../src/operations.ts#L1278) (analysis: Analysis) → Diagnostic[] <!-- internal -->
      <a id="operations.operations.wiringErrors"></a><br>Error diagnostics on the lines of a `# wiring` section, whatever their code: any of them can change what is generated.
      - calls [base.diag.isError](base.md#base.diag.isError)
    - type [WireSpecInputs](../../src/operations.ts#L1291) <!-- internal -->
      <a id="operations.operations.WireSpecInputs"></a><br>What the generated text depends on besides the snapshot: every saved spec (a `# wiring` section may be in any) and `tsconfig.json` (the import form).
    - fn [wireSpecInputs](../../src/operations.ts#L1297) (config: Config) → WireSpecInputs <!-- internal -->
      <a id="operations.operations.wireSpecInputs"></a><br>The saved specs by path (relative, POSIX) with their hash, and the root `tsconfig.json`.
      - calls [lang.files.collectMdFiles](lang.md#lang.files.collectMdFiles), [map.analyze.within](map.md#map.analyze.within), [operations.operations.readTextOrNull](operations.md#operations.operations.readTextOrNull), [base.config.toPosix](base.md#base.config.toPosix), [map.snapshot.sha256](map.md#map.snapshot.sha256)
    - fn [wireSpecProblems](../../src/operations.ts#L1313) (config: Config, before: WireSpecInputs) → string[] <!-- internal -->
      <a id="operations.operations.wireSpecProblems"></a><br>How the specs and `tsconfig.json` differ from the ones the wiring was computed from (`path: reason` lines).
      - calls [operations.operations.wireSpecInputs](operations.md#operations.operations.wireSpecInputs)
    - fn [readTextOrNull](../../src/operations.ts#L1326) (abs: string) → string | null <!-- internal -->
      <a id="operations.operations.readTextOrNull"></a>
    - fn [emptyCheck](../../src/operations.ts#L1334) (status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationEnvelope<"check"> <!-- internal -->
      <a id="operations.operations.emptyCheck"></a>
    - fn [runCheck](../../src/operations.ts#L1348) (request: CheckRequest, context: OperationContext) → Promise<OperationEnvelope<"check">> <!-- internal -->
      <a id="operations.operations.runCheck"></a><br>`keylang check` on the saved files: the paths (the spec directory by default), the static mode (request, then keylang.json, then `behavior`) and `strict`. Code 1 for a failure, or with `strict` for an unverified verdict; an unverified one without `strict` is code 0 and stays in…
      - calls [operations.operations.emptyCheck](operations.md#operations.operations.emptyCheck), [base.config.loadConfig](base.md#base.config.loadConfig), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [features.git-changes.gitChangedFiles](features.md#features.git-changes.gitChangedFiles), [map.analyze.within](map.md#map.analyze.within), [base.config.toPosix](base.md#base.config.toPosix), [features.check-results.checkReport](features.md#features.check-results.checkReport), [features.git-changes.deletedModuleIds](features.md#features.git-changes.deletedModuleIds), [features.changed.filterChanged](features.md#features.changed.filterChanged), [features.git-changes.changedPathSet](features.md#features.git-changes.changedPathSet), [base.config.resolveStatic](base.md#base.config.resolveStatic), [operations.operations.checkSkipNote](operations.md#operations.operations.checkSkipNote), [operations.operations.checkSummary](operations.md#operations.operations.checkSummary), [features.check-results.checkExitCode](features.md#features.check-results.checkExitCode)
    - fn [checkSkipNote](../../src/operations.ts#L1428) (path: string) → string
      <a id="operations.operations.checkSkipNote"></a><br>The note on a path that holds no specs, as the CLI writes it after `keylang: `.
    - fn [checkSummary](../../src/operations.ts#L1433) (counts: CheckPayload["counts"]) → string
      <a id="operations.operations.checkSummary"></a><br>The CLI's closing line on stderr: `0 fail, 2 unverified, 5 ok`.
    - fn [emptyFeature](../../src/operations.ts#L1440) (status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationEnvelope<"feature"> <!-- internal -->
      <a id="operations.operations.emptyFeature"></a>
    - fn [runFeature](../../src/operations.ts#L1450) (request: FeatureRequest, context: OperationContext) → Promise<OperationEnvelope<"feature">> <!-- internal -->
      <a id="operations.operations.runFeature"></a><br>The feature status of the saved files. It never takes unsaved text: a caller with dirty buffers saves them first, explicitly.
      - calls [operations.operations.emptyFeature](operations.md#operations.operations.emptyFeature), [base.config.loadConfig](base.md#base.config.loadConfig), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [features.feature-status.featureStatus](features.md#features.feature-status.featureStatus), [operations.operations.gapLine](operations.md#operations.operations.gapLine), [operations.operations.featureSummary](operations.md#operations.operations.featureSummary)
    - fn [gapLine](../../src/operations.ts#L1481) (gap: Gap) → string
      <a id="operations.operations.gapLine"></a><br>One gap as the CLI prints it: `file:line:col: kind id: reason`.
    - fn [featureSummary](../../src/operations.ts#L1486) (report: FeatureReport) → string
      <a id="operations.operations.featureSummary"></a><br>The CLI's closing line on stderr: `done` or `N gap(s)`.
    - fn [emptyDoctor](../../src/operations.ts#L1490) (status: OperationStatus, exitCode: 0 | 1 | 2 | null) → OperationEnvelope<"doctor"> <!-- internal -->
      <a id="operations.operations.emptyDoctor"></a>
    - fn [runDoctor](../../src/operations.ts#L1494) (request: DoctorRequest, context: OperationContext) → Promise<OperationEnvelope<"doctor">> <!-- internal -->
      <a id="operations.operations.runDoctor"></a>
      - calls [operations.operations.emptyDoctor](operations.md#operations.operations.emptyDoctor), [base.config.loadConfig](base.md#base.config.loadConfig), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [operations.operations.agentState](operations.md#operations.operations.agentState), [operations.operations.engineState](operations.md#operations.operations.engineState), [features.explain-llm.oldExplanations](features.md#features.explain-llm.oldExplanations), [features.explain-llm.explainedIds](features.md#features.explain-llm.explainedIds), [features.explain-llm.moveHint](features.md#features.explain-llm.moveHint), [operations.operations.doctorLines](operations.md#operations.operations.doctorLines)
    - fn [agentState](../../src/operations.ts#L1547) (config: Config, llmClient: (agent: string | null) => LlmSetup) → DoctorPayload["agent"] <!-- internal -->
      <a id="operations.operations.agentState"></a><br>The configured agent and its credential state, without the key value.
      - calls [operations.operations.messageOf](operations.md#operations.operations.messageOf)
    - fn [engineState](../../src/operations.ts#L1559) ( config: Config, nativeAvailable: boolean, voiceEngine: (config: Config["voice"], localAvailable: boolean) => VoiceEngine, ) → { resolved: DoctorPayload["voice"]["resolved"]; missing: string | null; error: string | null } <!-- internal -->
      <a id="operations.operations.engineState"></a><br>The engine the voice configuration resolves to now, without the key.
      - calls [operations.operations.messageOf](operations.md#operations.operations.messageOf)
    - fn [doctorLines](../../src/operations.ts#L1576) (payload: DoctorPayload) → string[] <!-- internal -->
      <a id="operations.operations.doctorLines"></a><br>The report lines, exactly as the CLI prints them; the payload carries the data.
    - fn [messageOf](../../src/operations.ts#L1604) (error: unknown) → string <!-- internal -->
      <a id="operations.operations.messageOf"></a>
