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
    - voice-local [features.voice-local](features.md#features.voice-local)
    - voice [features.voice](features.md#features.voice)
    - wire-gen [map.wire-gen](map.md#map.wire-gen)
    - type [DoctorRequest](../../src/operations.ts#L30)
      <a id="operations.operations.DoctorRequest"></a><br>The known operations. `doctor` is the first; new kinds arrive with their feature.
    - type [FeatureRequest](../../src/operations.ts#L37)
      <a id="operations.operations.FeatureRequest"></a><br>Whether a feature file is done, on the saved state of the repository (tools.md `feature`).
    - type [MapCheckRequest](../../src/operations.ts#L46)
      <a id="operations.operations.MapCheckRequest"></a><br>Whether the generated map on disk matches the code (`keylang map --check`). Read-only.
    - type [MapRequest](../../src/operations.ts#L55)
      <a id="operations.operations.MapRequest"></a><br>Writes the generated map, the explained map, the index and the fact cache (`keylang map`).
    - type [BaselineRequest](../../src/operations.ts#L67)
      <a id="operations.operations.BaselineRequest"></a><br>Writes `<dir>/rules.baseline.md` from the current layer graph (`keylang baseline`), or with `check` only compares it (`keylang baseline --check`).
    - type [AgentsRequest](../../src/operations.ts#L80)
      <a id="operations.operations.AgentsRequest"></a><br>Installs or strips the managed harness files (`keylang agents [--agents=LIST]`), or with `check` only compares them (`--check`). Setting files up says nothing about whether a harness client runs.
    - type [FmtRequest](../../src/operations.ts#L95)
      <a id="operations.operations.FmtRequest"></a><br>Rewrites Markdown files in the canonical form (`keylang fmt <paths…>`), or with `check` only compares them (`--check`). Each file is formatted on its own from its saved bytes by `formatSource`.
    - type [WireRequest](../../src/operations.ts#L115)
      <a id="operations.operations.WireRequest"></a><br>Generates the container of `# wiring` (`keylang wire [--out <file>]`), or with `check` only compares it (`--check`). The generated file is never compiled or run here.
    - type [OperationRequest](../../src/operations.ts#L125)
      <a id="operations.operations.OperationRequest"></a>
    - type [OperationContext](../../src/operations.ts#L131)
      <a id="operations.operations.OperationContext"></a><br>What an operation may use besides its request. No UI state, no shell.
    - type [OperationStatus](../../src/operations.ts#L150) = "completed" | "failed" | "cancelled"
      <a id="operations.operations.OperationStatus"></a>
    - type [OperationMessage](../../src/operations.ts#L152)
      <a id="operations.operations.OperationMessage"></a>
    - type [DoctorPayload](../../src/operations.ts#L159)
      <a id="operations.operations.DoctorPayload"></a><br>The structured doctor report. Key values never reach it.
    - type [FeaturePayload](../../src/operations.ts#L202)
      <a id="operations.operations.FeaturePayload"></a><br>The feature status the CLI prints (`report`), with the file and the snapshot it was computed on.
    - type [MapCheckPayload](../../src/operations.ts#L213)
      <a id="operations.operations.MapCheckPayload"></a><br>How the generated map on disk differs from a fresh render. Paths are POSIX, relative to the root.
    - type [MapPayload](../../src/operations.ts#L232)
      <a id="operations.operations.MapPayload"></a><br>What `keylang map` did. With conflicts or refusals nothing is written and `steps` is empty; otherwise every planned file step is listed with its state, so a partial commit names what landed, what failed and what was never tried.
    - type [BaselinePayload](../../src/operations.ts#L248)
      <a id="operations.operations.BaselinePayload"></a><br>What `keylang baseline [--check]` found and did. The path is POSIX, relative to the root.
    - type [AgentsPayload](../../src/operations.ts#L276)
      <a id="operations.operations.AgentsPayload"></a><br>What `keylang agents [--check]` planned and did. With `error` or `refused` nothing was written and `steps` is empty; otherwise every changed file is a step with its state.
    - type [FmtFile](../../src/operations.ts#L301)
      <a id="operations.operations.FmtFile"></a><br>One Markdown file of `keylang fmt`, in the order the paths name them. `current`: already canonical; `stale`: not canonical, and not written (a check, or a write stopped before it); `formatted`: written by this run; `invalid`: the tree shape is ambiguous (K003), never rewritten…
    - type [FmtPayload](../../src/operations.ts#L314)
      <a id="operations.operations.FmtPayload"></a><br>What `keylang fmt [--check]` found and did, file by file.
    - type [WirePayload](../../src/operations.ts#L320)
      <a id="operations.operations.WirePayload"></a><br>What `keylang wire [--check]` found and did. The path is POSIX, relative to the root.
    - type [OperationPayloads](../../src/operations.ts#L344)
      <a id="operations.operations.OperationPayloads"></a><br>The payload type of each operation kind.
    - type [OperationResult](../../src/operations.ts#L356)
      <a id="operations.operations.OperationResult"></a><br>The result of one operation. File paths are POSIX, relative to the request's root.
    - type [OperationEnvelope](../../src/operations.ts#L358)
      <a id="operations.operations.OperationEnvelope"></a>
    - fn [runOperation](../../src/operations.ts#L379) (request: DoctorRequest, context?: OperationContext) → Promise<OperationEnvelope<"doctor">>
      <a id="operations.operations.runOperation"></a><br>Runs one operation and returns its typed result: the payload type follows the request's kind.
      - calls [operations.operations.runDoctor](operations.md#operations.operations.runDoctor), [operations.operations.runFeature](operations.md#operations.operations.runFeature), [operations.operations.runMapCheck](operations.md#operations.operations.runMapCheck), [operations.operations.runMap](operations.md#operations.operations.runMap), [operations.operations.runBaseline](operations.md#operations.operations.runBaseline), [operations.operations.runAgents](operations.md#operations.operations.runAgents), [operations.operations.runFmt](operations.md#operations.operations.runFmt), [operations.operations.runWire](operations.md#operations.operations.runWire)
    - fn [resultWithout](../../src/operations.ts#L413) (kind: OperationRequest["kind"], status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationResult
      <a id="operations.operations.resultWithout"></a><br>A result without a payload, for a failure outside the operation (a transport that could not run it) or a cancellation.
    - fn [emptyMapCheck](../../src/operations.ts#L435) (status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationEnvelope<"map-check"> <!-- internal -->
      <a id="operations.operations.emptyMapCheck"></a>
    - fn [runMapCheck](../../src/operations.ts#L445) (request: MapCheckRequest, context: OperationContext) → Promise<OperationEnvelope<"map-check">> <!-- internal -->
      <a id="operations.operations.runMapCheck"></a><br>`keylang map --check`: renders the map from the code and compares it with the files on disk. It writes nothing — not the map, the index, nor the fact cache (`persistFacts` stays off).
      - calls [operations.operations.emptyMapCheck](operations.md#operations.operations.emptyMapCheck), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [map.map.diffMap](map.md#map.map.diffMap), [base.config.toPosix](base.md#base.config.toPosix), [operations.operations.mapCheckLines](operations.md#operations.operations.mapCheckLines)
    - fn [emptyMap](../../src/operations.ts#L477) (status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationEnvelope<"map"> <!-- internal -->
      <a id="operations.operations.emptyMap"></a>
    - fn [runMap](../../src/operations.ts#L492) (request: MapRequest, context: OperationContext) → Promise<OperationEnvelope<"map">> <!-- internal -->
      <a id="operations.operations.runMap"></a><br>`keylang map` in two phases. Compute: the analysis (the fact cache is prepared, not written) and a plan with the expected bytes of every target.
      - calls [operations.operations.emptyMap](operations.md#operations.operations.emptyMap), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [map.map.planMap](map.md#map.map.planMap), [operations.operations.mapConflictLines](operations.md#operations.operations.mapConflictLines), [map.map.mapPlanProblems](map.md#map.map.mapPlanProblems), [map.map.commitMap](map.md#map.map.commitMap), [operations.operations.mapStepLines](operations.md#operations.operations.mapStepLines)
    - fn [mapConflictLines](../../src/operations.ts#L568) (conflicts: readonly string[], path: (file: string) => string = (file) => file) → string[]
      <a id="operations.operations.mapConflictLines"></a><br>The conflict lines `keylang map` prints: nothing is written while any exists.
    - fn [mapStepLines](../../src/operations.ts#L577) (steps: readonly CommittedStep[], path: (file: string) => string = (file) => file) → string[]
      <a id="operations.operations.mapStepLines"></a><br>The lines `keylang map` prints for its completed steps of both maps: writes, then removals. The index and the fact cache are written silently, as they always were; the payload lists them.
    - fn [mapSummary](../../src/operations.ts#L583) (payload: MapPayload) → string
      <a id="operations.operations.mapSummary"></a><br>The summary `keylang map` writes to stderr after a commit.
    - fn [mapCheckLines](../../src/operations.ts#L600) (diff: { conflicts: readonly string[]; stale: readonly string[] }, path: (file: string) => string = (file) => file) → string[]
      <a id="operations.operations.mapCheckLines"></a><br>The lines `map --check` prints, paths as given (the CLI makes them relative to its working directory). A manual file blocks `map` itself, so with a conflict "run keylang map" would not refresh the rest: stale files are then not listed.
      - calls [operations.operations.mapConflictLines](operations.md#operations.operations.mapConflictLines)
    - fn [emptyBaseline](../../src/operations.ts#L606) (status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationEnvelope<"baseline"> <!-- internal -->
      <a id="operations.operations.emptyBaseline"></a>
    - fn [runBaseline](../../src/operations.ts#L622) (request: BaselineRequest, context: OperationContext) → Promise<OperationEnvelope<"baseline">> <!-- internal -->
      <a id="operations.operations.runBaseline"></a><br>`keylang baseline [--check]`: the rules of the current layer graph (the rule algorithm of `baselineText`) against `<dir>/rules.baseline.md`. The analysis reads the code and the saved `keylang.json`, not the specs, and writes no fact cache.
      - calls [operations.operations.emptyBaseline](operations.md#operations.operations.emptyBaseline), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [features.baseline.planBaseline](features.md#features.baseline.planBaseline), [features.baseline.baselinePlanProblems](features.md#features.baseline.baselinePlanProblems), [features.baseline.commitBaseline](features.md#features.baseline.commitBaseline)
    - fn [emptyAgents](../../src/operations.ts#L689) (status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationEnvelope<"agents"> <!-- internal -->
      <a id="operations.operations.emptyAgents"></a>
    - fn [runAgents](../../src/operations.ts#L705) (request: AgentsRequest, context: OperationContext) → Promise<OperationEnvelope<"agents">> <!-- internal -->
      <a id="operations.operations.runAgents"></a><br>`keylang agents [--check]`: the managed harness files of the chosen harnesses (the unchanged adapters of `harness.ts`) against the disk. The whole plan is built first: a broken marker or invalid JSON/TOML fails it with code 2 naming the file, and nothing is written.
      - calls [operations.operations.emptyAgents](operations.md#operations.operations.emptyAgents), [features.harness.planAgents](features.md#features.harness.planAgents), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [features.harness.agentsPlanProblems](features.md#features.harness.agentsPlanProblems), [features.harness.commitAgents](features.md#features.harness.commitAgents)
    - fn [emptyFmt](../../src/operations.ts#L772) (status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationEnvelope<"fmt"> <!-- internal -->
      <a id="operations.operations.emptyFmt"></a>
    - fn [runFmt](../../src/operations.ts#L788) (request: FmtRequest, context: OperationContext) → Promise<OperationEnvelope<"fmt">> <!-- internal -->
      <a id="operations.operations.runFmt"></a><br>`keylang fmt [--check]` in two phases. Compute: every file is read and formatted by `formatSource`; one that cannot be read, or whose tree shape is ambiguous (K003), is reported and the rest go on; a saved explanation is skipped.
      - calls [operations.operations.emptyFmt](operations.md#operations.operations.emptyFmt), [base.config.assertFormatOnly](base.md#base.config.assertFormatOnly), [lang.files.collectMdFiles](lang.md#lang.files.collectMdFiles), [base.config.toPosix](base.md#base.config.toPosix), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [map.explanations.isStoredExplanation](map.md#map.explanations.isStoredExplanation), [lang.fmt.formatSource](lang.md#lang.fmt.formatSource), [operations.operations.fmtMessages](operations.md#operations.operations.fmtMessages), [operations.operations.commitFormatted](operations.md#operations.operations.commitFormatted)
    - fn [commitFormatted](../../src/operations.ts#L874) (abs: string, source: string, text: string) → void <!-- internal -->
      <a id="operations.operations.commitFormatted"></a><br>Writes one formatted file: atomically at the file a link names, with the formatter's bytes (`fmt` turns CRLF into LF, as it always did), and only when the file still holds `source`. A file that cannot be written in place (read-only) is not replaced by the rename either.
      - calls [base.safe-write.landing](base.md#base.safe-write.landing), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic)
    - fn [fmtMessages](../../src/operations.ts#L886) (payload: FmtPayload) → OperationMessage[]
      <a id="operations.operations.fmtMessages"></a><br>The report, file by file in path order: `info` is what `keylang fmt` prints to stdout, `error` what it prints to stderr; a `warning` names a skipped explanation, which the CLI passes over silently.
      - calls [base.diag.formatDiagnostic](base.md#base.diag.formatDiagnostic)
    - fn [emptyWire](../../src/operations.ts#L900) (status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationEnvelope<"wire"> <!-- internal -->
      <a id="operations.operations.emptyWire"></a>
    - fn [runWire](../../src/operations.ts#L919) (request: WireRequest, context: OperationContext) → Promise<OperationEnvelope<"wire">> <!-- internal -->
      <a id="operations.operations.runWire"></a><br>`keylang wire [--check]` in two phases. The path policy of `out` is checked before anything is read: a plain relative TypeScript path that stays inside the repository through links (code 2 otherwise).
      - calls [operations.operations.emptyWire](operations.md#operations.operations.emptyWire), [operations.operations.wireOutProblem](operations.md#operations.operations.wireOutProblem), [operations.operations.wireSpecInputs](operations.md#operations.operations.wireSpecInputs), [base.config.loadConfig](base.md#base.config.loadConfig), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [operations.operations.wiringErrors](operations.md#operations.operations.wiringErrors), [map.wire-gen.generateWire](map.md#map.wire-gen.generateWire), [base.safe-write.landing](base.md#base.safe-write.landing), [map.map.sourceInputs](map.md#map.map.sourceInputs), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [map.map.sourceInputProblems](map.md#map.map.sourceInputProblems), [operations.operations.wireSpecProblems](operations.md#operations.operations.wireSpecProblems), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic)
    - fn [wireOutProblem](../../src/operations.ts#L1010) (root: string, out: string) → string | null
      <a id="operations.operations.wireOutProblem"></a><br>Why `out` cannot be the generated file (the CLI's message), or null: the path policy of every write — plain, relative, inside the repository through links — and a TypeScript extension. Reads nothing outside the repository and writes nothing; a form may call it as the path is…
      - calls [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [operations.operations.messageOf](operations.md#operations.operations.messageOf)
    - fn [wiringErrors](../../src/operations.ts#L1021) (analysis: Analysis) → Diagnostic[] <!-- internal -->
      <a id="operations.operations.wiringErrors"></a><br>Error diagnostics on the lines of a `# wiring` section, whatever their code: any of them can change what is generated.
      - calls [base.diag.isError](base.md#base.diag.isError)
    - type [WireSpecInputs](../../src/operations.ts#L1034) <!-- internal -->
      <a id="operations.operations.WireSpecInputs"></a><br>What the generated text depends on besides the snapshot: every saved spec (a `# wiring` section may be in any) and `tsconfig.json` (the import form).
    - fn [wireSpecInputs](../../src/operations.ts#L1040) (config: Config) → WireSpecInputs <!-- internal -->
      <a id="operations.operations.wireSpecInputs"></a><br>The saved specs by path (relative, POSIX) with their hash, and the root `tsconfig.json`.
      - calls [lang.files.collectMdFiles](lang.md#lang.files.collectMdFiles), [map.analyze.within](map.md#map.analyze.within), [operations.operations.readTextOrNull](operations.md#operations.operations.readTextOrNull), [base.config.toPosix](base.md#base.config.toPosix), [map.snapshot.sha256](map.md#map.snapshot.sha256)
    - fn [wireSpecProblems](../../src/operations.ts#L1056) (config: Config, before: WireSpecInputs) → string[] <!-- internal -->
      <a id="operations.operations.wireSpecProblems"></a><br>How the specs and `tsconfig.json` differ from the ones the wiring was computed from (`path: reason` lines).
      - calls [operations.operations.wireSpecInputs](operations.md#operations.operations.wireSpecInputs)
    - fn [readTextOrNull](../../src/operations.ts#L1069) (abs: string) → string | null <!-- internal -->
      <a id="operations.operations.readTextOrNull"></a>
    - fn [emptyFeature](../../src/operations.ts#L1080) (status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationEnvelope<"feature"> <!-- internal -->
      <a id="operations.operations.emptyFeature"></a>
    - fn [runFeature](../../src/operations.ts#L1090) (request: FeatureRequest, context: OperationContext) → Promise<OperationEnvelope<"feature">> <!-- internal -->
      <a id="operations.operations.runFeature"></a><br>The feature status of the saved files. It never takes unsaved text: a caller with dirty buffers saves them first, explicitly.
      - calls [operations.operations.emptyFeature](operations.md#operations.operations.emptyFeature), [base.config.loadConfig](base.md#base.config.loadConfig), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [features.feature-status.featureStatus](features.md#features.feature-status.featureStatus), [operations.operations.gapLine](operations.md#operations.operations.gapLine), [operations.operations.featureSummary](operations.md#operations.operations.featureSummary)
    - fn [gapLine](../../src/operations.ts#L1121) (gap: Gap) → string
      <a id="operations.operations.gapLine"></a><br>One gap as the CLI prints it: `file:line:col: kind id: reason`.
    - fn [featureSummary](../../src/operations.ts#L1126) (report: FeatureReport) → string
      <a id="operations.operations.featureSummary"></a><br>The CLI's closing line on stderr: `done` or `N gap(s)`.
    - fn [emptyDoctor](../../src/operations.ts#L1130) (status: OperationStatus, exitCode: 0 | 1 | 2 | null) → OperationEnvelope<"doctor"> <!-- internal -->
      <a id="operations.operations.emptyDoctor"></a>
    - fn [runDoctor](../../src/operations.ts#L1134) (request: DoctorRequest, context: OperationContext) → Promise<OperationEnvelope<"doctor">> <!-- internal -->
      <a id="operations.operations.runDoctor"></a>
      - calls [operations.operations.emptyDoctor](operations.md#operations.operations.emptyDoctor), [base.config.loadConfig](base.md#base.config.loadConfig), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [operations.operations.agentState](operations.md#operations.operations.agentState), [operations.operations.engineState](operations.md#operations.operations.engineState), [features.explain-llm.oldExplanations](features.md#features.explain-llm.oldExplanations), [features.explain-llm.explainedIds](features.md#features.explain-llm.explainedIds), [features.explain-llm.moveHint](features.md#features.explain-llm.moveHint), [operations.operations.doctorLines](operations.md#operations.operations.doctorLines)
    - fn [agentState](../../src/operations.ts#L1187) (config: Config, llmClient: (agent: string | null) => LlmSetup) → DoctorPayload["agent"] <!-- internal -->
      <a id="operations.operations.agentState"></a><br>The configured agent and its credential state, without the key value.
      - calls [operations.operations.messageOf](operations.md#operations.operations.messageOf)
    - fn [engineState](../../src/operations.ts#L1199) ( config: Config, nativeAvailable: boolean, voiceEngine: (config: Config["voice"], localAvailable: boolean) => VoiceEngine, ) → { resolved: DoctorPayload["voice"]["resolved"]; missing: string | null; error: string | null } <!-- internal -->
      <a id="operations.operations.engineState"></a><br>The engine the voice configuration resolves to now, without the key.
      - calls [operations.operations.messageOf](operations.md#operations.operations.messageOf)
    - fn [doctorLines](../../src/operations.ts#L1216) (payload: DoctorPayload) → string[] <!-- internal -->
      <a id="operations.operations.doctorLines"></a><br>The report lines, exactly as the CLI prints them; the payload carries the data.
    - fn [messageOf](../../src/operations.ts#L1244) (error: unknown) → string <!-- internal -->
      <a id="operations.operations.messageOf"></a>
