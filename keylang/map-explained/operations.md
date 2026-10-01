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
    - check-format [features.check-format](features.md#features.check-format)
    - check-results [features.check-results](features.md#features.check-results)
    - config [base.config](base.md#base.config)
    - diag [base.diag](base.md#base.diag)
    - explain-edge [features.explain-edge](features.md#features.explain-edge)
    - explain-llm [features.explain-llm](features.md#features.explain-llm)
    - explanations [map.explanations](map.md#map.explanations)
    - files [lang.files](lang.md#lang.files)
    - fmt [lang.fmt](lang.md#lang.fmt)
    - ir [lang.ir](lang.md#lang.ir)
    - parser [lang.parser](lang.md#lang.parser)
    - parse-format [lang.parse-format](lang.md#lang.parse-format)
    - fact-cache [map.fact-cache](map.md#map.fact-cache)
    - proposals [features.proposals](features.md#features.proposals)
    - draft [features.draft](features.md#features.draft)
    - feature-status [features.feature-status](features.md#features.feature-status)
    - harness [features.harness](features.md#features.harness)
    - graph [map.graph](map.md#map.graph)
    - llm [features.llm](features.md#features.llm)
    - draft-llm [features.draft-llm](features.md#features.draft-llm)
    - stats [features.stats](features.md#features.stats)
    - map [map.map](map.md#map.map)
    - scc [check.scc](check.md#check.scc)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - span [base.span](base.md#base.span)
    - voice-local [features.voice-local](features.md#features.voice-local)
    - voice [features.voice](features.md#features.voice)
    - git-changes [features.git-changes](features.md#features.git-changes)
    - wire-gen [map.wire-gen](map.md#map.wire-gen)
    - trace-plan [map.trace-plan](map.md#map.trace-plan)
    - type [DoctorRequest](../../src/operations.ts#L46)
      <a id="operations.operations.DoctorRequest"></a><br>The known operations. `doctor` is the first; new kinds arrive with their feature.
    - type [FeatureRequest](../../src/operations.ts#L53)
      <a id="operations.operations.FeatureRequest"></a><br>Whether a feature file is done, on the saved state of the repository (tools.md `feature`).
    - type [MapCheckRequest](../../src/operations.ts#L62)
      <a id="operations.operations.MapCheckRequest"></a><br>Whether the generated map on disk matches the code (`keylang map --check`). Read-only.
    - type [MapRequest](../../src/operations.ts#L71)
      <a id="operations.operations.MapRequest"></a><br>Writes the generated map, the explained map, the index and the fact cache (`keylang map`).
    - type [BaselineRequest](../../src/operations.ts#L83)
      <a id="operations.operations.BaselineRequest"></a><br>Writes `<dir>/rules.baseline.md` from the current layer graph (`keylang baseline`), or with `check` only compares it (`keylang baseline --check`).
    - type [AgentsRequest](../../src/operations.ts#L96)
      <a id="operations.operations.AgentsRequest"></a><br>Installs or strips the managed harness files (`keylang agents [--agents=LIST]`), or with `check` only compares them (`--check`). Setting files up says nothing about whether a harness client runs.
    - type [FmtRequest](../../src/operations.ts#L111)
      <a id="operations.operations.FmtRequest"></a><br>Rewrites Markdown files in the canonical form (`keylang fmt <paths…>`), or with `check` only compares them (`--check`). Each file is formatted on its own from its saved bytes by `formatSource`.
    - type [ParseRequest](../../src/operations.ts#L128)
      <a id="operations.operations.ParseRequest"></a><br>Parses spec files into the Text IR (`keylang parse [--json] <paths…>`). Read-only: nothing is analyzed and nothing is written; of keylang.json only the edition is read.
    - type [WireRequest](../../src/operations.ts#L148)
      <a id="operations.operations.WireRequest"></a><br>Generates the container of `# wiring` (`keylang wire [--out <file>]`), or with `check` only compares it (`--check`). The generated file is never compiled or run here.
    - type [CheckRequest](../../src/operations.ts#L163)
      <a id="operations.operations.CheckRequest"></a><br>Checks the saved specs against the code (`keylang check [paths…] [--strict] [--static <mode>]`). Read-only.
    - type [ExplainEdgeRequest](../../src/operations.ts#L189)
      <a id="operations.operations.ExplainEdgeRequest"></a><br>Explains the dependency between two ids of the saved code (`keylang check --explain-edge <from> <to>`): the snapshot's edges both ways, or whether their absence is proven. Read-only; the specs are not read.
    - type [ExportSource](../../src/operations.ts#L203)
      <a id="operations.operations.ExportSource"></a><br>The typed result an export writes: a finished check report in one of the CLI's formats, or the lines of an explained edge (the CLI has only its human output), the documents of a parse in a view, or a trace plan (JSON only, as the CLI prints it).
    - type [ExportFormat](../../src/operations.ts#L210) = CheckFormat | ParseFormat
      <a id="operations.operations.ExportFormat"></a><br>The formats an export writes: the check formats and the parse views.
    - type [TracePlanRequest](../../src/operations.ts#L217)
      <a id="operations.operations.TracePlanRequest"></a><br>The functions of one flow a trace adapter instruments (`keylang trace-plan <flow>`), on a fresh snapshot of the saved code and specs. Read-only: it writes nothing, not even the fact cache, and runs no test or program.
    - type [DraftFlowRequest](../../src/operations.ts#L237)
      <a id="operations.operations.DraftFlowRequest"></a><br>A flow drafted for a trigger (`keylang draft flow <trigger> --mode algo|llm|hybrid`): `algo` is only what the snapshot's call edges show; `llm` and `hybrid` ask the configured model and judge its answer against those edges (`draftFlowWithModel`: agree, llm-only, conflict…
    - type [DraftRulesRequest](../../src/operations.ts#L276)
      <a id="operations.operations.DraftRulesRequest"></a><br>Rules drafted for the repository (`keylang draft rules --mode algo|llm|hybrid`): `algo` is what the code keeps now (`draftRules`: a `layers` order or `deny` pairs, `no-cycles` without a module cycle); `llm` and `hybrid` ask the configured model and check each of its rules alone…
    - type [CodeToSpecRequest](../../src/operations.ts#L300)
      <a id="operations.operations.CodeToSpecRequest"></a><br>Flows drafted from a code position (`keylang code-to-spec <path[:line]> --mode algo`): with a line, the innermost fn holding it; without one, every exported fn of the file in declaration order — each drafted as `draft flow --mode algo` drafts it (`codeToSpec`). The spec is…
    - type [DraftLayoutRequest](../../src/operations.ts#L325)
      <a id="operations.operations.DraftLayoutRequest"></a><br>The layer layout drafted for `keylang.json` (`keylang draft map --mode algo|llm|hybrid`): `algo` is the layout keylang would guess from the directories (`guessLayout`), `llm` and `hybrid` ask the configured model, whose layers pass the validation of a written `keylang.json`.…
    - type [ExportRequest](../../src/operations.ts#L340)
      <a id="operations.operations.ExportRequest"></a><br>Saves a report that was already computed to one file: exactly the stdout the CLI prints for it, without ANSI or status lines. It never runs the check again.
    - type [InitRequest](../../src/operations.ts#L356)
      <a id="operations.operations.InitRequest"></a><br>Sets a repository up (`keylang init [dir] [--agents=LIST]`): keylang.json (an existing one is kept), the map, the baseline and the harness files, in that order. With `check` it runs exactly `init --check`: the harness files and the baseline are compared; the map is not (that is…
    - type [OperationRequest](../../src/operations.ts#L368)
      <a id="operations.operations.OperationRequest"></a>
    - type [OperationContext](../../src/operations.ts#L374)
      <a id="operations.operations.OperationContext"></a><br>What an operation may use besides its request. No UI state, no shell.
    - type [CommitPlan](../../src/operations.ts#L396)
      <a id="operations.operations.CommitPlan"></a><br>What a commit is about to write, when the operation names it before it asks (a draft: its target, whose proposal it writes).
    - type [CommitGate](../../src/operations.ts#L402) = void | { refused: string[] }
      <a id="operations.operations.CommitGate"></a><br>The caller's answer before a commit: nothing (go ahead) or the reasons the files must stay as they are.
    - type [OperationStatus](../../src/operations.ts#L404) = "completed" | "failed" | "cancelled"
      <a id="operations.operations.OperationStatus"></a>
    - type [OperationMessage](../../src/operations.ts#L406)
      <a id="operations.operations.OperationMessage"></a>
    - type [DoctorPayload](../../src/operations.ts#L413)
      <a id="operations.operations.DoctorPayload"></a><br>The structured doctor report. Key values never reach it.
    - type [FeaturePayload](../../src/operations.ts#L456)
      <a id="operations.operations.FeaturePayload"></a><br>The feature status the CLI prints (`report`), with the file and the snapshot it was computed on.
    - type [MapCheckPayload](../../src/operations.ts#L467)
      <a id="operations.operations.MapCheckPayload"></a><br>How the generated map on disk differs from a fresh render. Paths are POSIX, relative to the root.
    - type [MapPayload](../../src/operations.ts#L486)
      <a id="operations.operations.MapPayload"></a><br>What `keylang map` did. With conflicts or refusals nothing is written and `steps` is empty; otherwise every planned file step is listed with its state, so a partial commit names what landed, what failed and what was never tried.
    - type [BaselinePayload](../../src/operations.ts#L502)
      <a id="operations.operations.BaselinePayload"></a><br>What `keylang baseline [--check]` found and did. The path is POSIX, relative to the root.
    - type [AgentsPayload](../../src/operations.ts#L530)
      <a id="operations.operations.AgentsPayload"></a><br>What `keylang agents [--check]` planned and did. With `error` or `refused` nothing was written and `steps` is empty; otherwise every changed file is a step with its state.
    - type [FmtFile](../../src/operations.ts#L555)
      <a id="operations.operations.FmtFile"></a><br>One Markdown file of `keylang fmt`, in the order the paths name them. `current`: already canonical; `stale`: not canonical, and not written (a check, or a write stopped before it); `formatted`: written by this run; `invalid`: the tree shape is ambiguous (K003), never rewritten…
    - type [FmtPayload](../../src/operations.ts#L568)
      <a id="operations.operations.FmtPayload"></a><br>What `keylang fmt [--check]` found and did, file by file.
    - type [ParsePayload](../../src/operations.ts#L574)
      <a id="operations.operations.ParsePayload"></a><br>What `keylang parse` read: the documents in path order, the skipped and unreadable files.
    - type [TracePlanPayload](../../src/operations.ts#L589)
      <a id="operations.operations.TracePlanPayload"></a><br>The plan `keylang trace-plan` prints, and what it leaves out.
    - type [FlowCandidate](../../src/operations.ts#L603)
      <a id="operations.operations.FlowCandidate"></a><br>One drafted flow and what it makes of its target: the typed candidate a preview shows and a proposal writes. `before` and `pending` are the files it was built from — the expected state of a later write.
    - type [DraftFlowPayload](../../src/operations.ts#L623)
      <a id="operations.operations.DraftFlowPayload"></a><br>What `keylang draft flow` drafted, and the proposal it wrote.
    - type [RulesCandidate](../../src/operations.ts#L648)
      <a id="operations.operations.RulesCandidate"></a><br>The drafted rules and what they make of their target, as `FlowCandidate`: `before` and `pending` are the expected state of a later write.
    - type [DraftRulesPayload](../../src/operations.ts#L664)
      <a id="operations.operations.DraftRulesPayload"></a><br>What `keylang draft rules` drafted, and the proposal it wrote.
    - type [CodeFlow](../../src/operations.ts#L688)
      <a id="operations.operations.CodeFlow"></a><br>One flow of a code-to-spec draft: its trigger, name, steps and section.
    - type [CodeToSpecCandidate](../../src/operations.ts#L702)
      <a id="operations.operations.CodeToSpecCandidate"></a><br>The flows drafted from a code position and what they make of their target, as `FlowCandidate`: `before` and `pending` are the expected state of a later write.
    - type [CodeToSpecPayload](../../src/operations.ts#L725)
      <a id="operations.operations.CodeToSpecPayload"></a><br>What `keylang code-to-spec <path[:line]>` drafted, and the proposal it wrote.
    - type [DraftLayoutPayload](../../src/operations.ts#L740)
      <a id="operations.operations.DraftLayoutPayload"></a><br>What `keylang draft map` drafted: the layers, and the config the CLI prints with them.
    - type [RulesModelInfo](../../src/operations.ts#L756)
      <a id="operations.operations.RulesModelInfo"></a><br>Who proposed the rules and how each compares with the code now.
    - type [DraftModelInfo](../../src/operations.ts#L764)
      <a id="operations.operations.DraftModelInfo"></a><br>What the model's draft adds to its text: who drafted it, how its steps compare with the snapshot, what it left out.
    - type [WirePayload](../../src/operations.ts#L775)
      <a id="operations.operations.WirePayload"></a><br>What `keylang wire [--check]` found and did. The path is POSIX, relative to the root.
    - type [CheckPayload](../../src/operations.ts#L803)
      <a id="operations.operations.CheckPayload"></a><br>What `keylang check` found on the saved files. `results`, `snapshotId` and `coverage` are exactly `--format json`; `lines` and `counts` are the human output and its summary. Paths are relative to the request's `base`.
    - type [ChangedSlice](../../src/operations.ts#L828)
      <a id="operations.operations.ChangedSlice"></a><br>What `--changed` kept: the ref, what git reported, and how much of the full report the slice left out.
    - type [ExplainEdgePayload](../../src/operations.ts#L843) extends EdgeExplanation
      <a id="operations.operations.ExplainEdgePayload"></a><br>The evidence between two ids: the domain result of `--explain-edge`, and the CLI's lines of it.
    - type [ExportPayload](../../src/operations.ts#L851)
      <a id="operations.operations.ExportPayload"></a><br>What an export did with its one file.
    - type [InitPayload](../../src/operations.ts#L873)
      <a id="operations.operations.InitPayload"></a><br>What `keylang init [--check]` did, stage by stage. Each stage is the result of its own shared operation, null when it was not run (a check has no map stage; a failure or a cancellation stops the stages after it).
    - type [OperationPayloads](../../src/operations.ts#L899)
      <a id="operations.operations.OperationPayloads"></a><br>The payload type of each operation kind.
    - type [OperationResult](../../src/operations.ts#L921)
      <a id="operations.operations.OperationResult"></a><br>The result of one operation. File paths are POSIX, relative to the request's root.
    - type [OperationEnvelope](../../src/operations.ts#L923)
      <a id="operations.operations.OperationEnvelope"></a>
    - fn [runOperation](../../src/operations.ts#L944) (request: DoctorRequest, context?: OperationContext) → Promise<OperationEnvelope<"doctor">>
      <a id="operations.operations.runOperation"></a><br>Runs one operation and returns its typed result: the payload type follows the request's kind.
      - calls [operations.operations.runDoctor](operations.md#operations.operations.runDoctor), [operations.operations.runFeature](operations.md#operations.operations.runFeature), [operations.operations.runMapCheck](operations.md#operations.operations.runMapCheck), [operations.operations.runMap](operations.md#operations.operations.runMap), [operations.operations.runBaseline](operations.md#operations.operations.runBaseline), [operations.operations.runAgents](operations.md#operations.operations.runAgents), [operations.operations.runFmt](operations.md#operations.operations.runFmt), [operations.operations.runWire](operations.md#operations.operations.runWire), [operations.operations.runCheck](operations.md#operations.operations.runCheck), [operations.operations.runExplainEdge](operations.md#operations.operations.runExplainEdge), [operations.operations.runInit](operations.md#operations.operations.runInit), [operations.operations.runExport](operations.md#operations.operations.runExport), [operations.operations.runParse](operations.md#operations.operations.runParse), [operations.operations.runTracePlan](operations.md#operations.operations.runTracePlan), [operations.operations.runDraftFlow](operations.md#operations.operations.runDraftFlow), [operations.operations.runDraftRules](operations.md#operations.operations.runDraftRules), [operations.operations.runDraftLayout](operations.md#operations.operations.runDraftLayout), [operations.operations.runCodeToSpec](operations.md#operations.operations.runCodeToSpec)
    - fn [resultWithout](../../src/operations.ts#L1008) (kind: OperationRequest["kind"], status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationResult
      <a id="operations.operations.resultWithout"></a><br>A result without a payload, for a failure outside the operation (a transport that could not run it) or a cancellation.
    - fn [emptyMapCheck](../../src/operations.ts#L1050) (status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationEnvelope<"map-check"> <!-- internal -->
      <a id="operations.operations.emptyMapCheck"></a>
    - fn [runMapCheck](../../src/operations.ts#L1060) (request: MapCheckRequest, context: OperationContext) → Promise<OperationEnvelope<"map-check">> <!-- internal -->
      <a id="operations.operations.runMapCheck"></a><br>`keylang map --check`: renders the map from the code and compares it with the files on disk. It writes nothing — not the map, the index, nor the fact cache (`persistFacts` stays off).
      - calls [operations.operations.emptyMapCheck](operations.md#operations.operations.emptyMapCheck), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [map.map.diffMap](map.md#map.map.diffMap), [base.config.toPosix](base.md#base.config.toPosix), [operations.operations.mapCheckLines](operations.md#operations.operations.mapCheckLines)
    - fn [emptyMap](../../src/operations.ts#L1092) (status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationEnvelope<"map"> <!-- internal -->
      <a id="operations.operations.emptyMap"></a>
    - fn [runMap](../../src/operations.ts#L1107) (request: MapRequest, context: OperationContext) → Promise<OperationEnvelope<"map">> <!-- internal -->
      <a id="operations.operations.runMap"></a><br>`keylang map` in two phases. Compute: the analysis (the fact cache is prepared, not written) and a plan with the expected bytes of every target.
      - calls [operations.operations.emptyMap](operations.md#operations.operations.emptyMap), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [map.map.planMap](map.md#map.map.planMap), [operations.operations.mapConflictLines](operations.md#operations.operations.mapConflictLines), [map.map.mapPlanProblems](map.md#map.map.mapPlanProblems), [map.map.commitMap](map.md#map.map.commitMap), [operations.operations.mapStepLines](operations.md#operations.operations.mapStepLines)
    - fn [mapConflictLines](../../src/operations.ts#L1183) (conflicts: readonly string[], path: (file: string) => string = (file) => file) → string[]
      <a id="operations.operations.mapConflictLines"></a><br>The conflict lines `keylang map` prints: nothing is written while any exists.
    - fn [mapStepLines](../../src/operations.ts#L1192) (steps: readonly CommittedStep[], path: (file: string) => string = (file) => file) → string[]
      <a id="operations.operations.mapStepLines"></a><br>The lines `keylang map` prints for its completed steps of both maps: writes, then removals. The index and the fact cache are written silently, as they always were; the payload lists them.
    - fn [mapSummary](../../src/operations.ts#L1198) (payload: MapPayload) → string
      <a id="operations.operations.mapSummary"></a><br>The summary `keylang map` writes to stderr after a commit.
    - fn [mapCheckLines](../../src/operations.ts#L1215) (diff: { conflicts: readonly string[]; stale: readonly string[] }, path: (file: string) => string = (file) => file) → string[]
      <a id="operations.operations.mapCheckLines"></a><br>The lines `map --check` prints, paths as given (the CLI makes them relative to its working directory). A manual file blocks `map` itself, so with a conflict "run keylang map" would not refresh the rest: stale files are then not listed.
      - calls [operations.operations.mapConflictLines](operations.md#operations.operations.mapConflictLines)
    - fn [emptyBaseline](../../src/operations.ts#L1221) (status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationEnvelope<"baseline"> <!-- internal -->
      <a id="operations.operations.emptyBaseline"></a>
    - fn [runBaseline](../../src/operations.ts#L1237) (request: BaselineRequest, context: OperationContext) → Promise<OperationEnvelope<"baseline">> <!-- internal -->
      <a id="operations.operations.runBaseline"></a><br>`keylang baseline [--check]`: the rules of the current layer graph (the rule algorithm of `baselineText`) against `<dir>/rules.baseline.md`. The analysis reads the code and the saved `keylang.json`, not the specs, and writes no fact cache.
      - calls [operations.operations.emptyBaseline](operations.md#operations.operations.emptyBaseline), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [features.baseline.planBaseline](features.md#features.baseline.planBaseline), [features.baseline.baselinePlanProblems](features.md#features.baseline.baselinePlanProblems), [features.baseline.commitBaseline](features.md#features.baseline.commitBaseline)
    - fn [emptyAgents](../../src/operations.ts#L1304) (status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationEnvelope<"agents"> <!-- internal -->
      <a id="operations.operations.emptyAgents"></a>
    - fn [runAgents](../../src/operations.ts#L1320) (request: AgentsRequest, context: OperationContext) → Promise<OperationEnvelope<"agents">> <!-- internal -->
      <a id="operations.operations.runAgents"></a><br>`keylang agents [--check]`: the managed harness files of the chosen harnesses (the unchanged adapters of `harness.ts`) against the disk. The whole plan is built first: a broken marker or invalid JSON/TOML fails it with code 2 naming the file, and nothing is written.
      - calls [operations.operations.emptyAgents](operations.md#operations.operations.emptyAgents), [features.harness.planAgents](features.md#features.harness.planAgents), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [features.harness.agentsPlanProblems](features.md#features.harness.agentsPlanProblems), [features.harness.commitAgents](features.md#features.harness.commitAgents)
    - fn [emptyInit](../../src/operations.ts#L1387) (status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationEnvelope<"init"> <!-- internal -->
      <a id="operations.operations.emptyInit"></a>
    - fn [initSources](../../src/operations.ts#L1397) (root: string, label = ".") → { config: Config } | { error: string }
      <a id="operations.operations.initSources"></a><br>The configuration `keylang init` describes: the saved keylang.json, else the guess. An error (a broken keylang.json, no supported sources) is the reason init stops with code 2 before anything else, the harness selection included.
      - calls [base.config.loadConfig](base.md#base.config.loadConfig), [operations.operations.messageOf](operations.md#operations.operations.messageOf)
    - fn [runInit](../../src/operations.ts#L1424) (request: InitRequest, context: OperationContext) → Promise<OperationEnvelope<"init">> <!-- internal -->
      <a id="operations.operations.runInit"></a><br>`keylang init [--check]`: an orchestration of the shared config, map, baseline and agents steps, not a call of the CLI commands. Before anything: the configuration (2 when it is broken or there is no supported source), then the harness plan (a broken harness file is 2 and…
      - calls [operations.operations.emptyInit](operations.md#operations.operations.emptyInit), [operations.operations.initSources](operations.md#operations.operations.initSources), [base.config.guessLayout](base.md#base.config.guessLayout), [operations.operations.runAgents](operations.md#operations.operations.runAgents), [operations.operations.runBaseline](operations.md#operations.operations.runBaseline), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic), [base.config.configToJson](base.md#base.config.configToJson), [operations.operations.runMap](operations.md#operations.operations.runMap)
    - fn [emptyFmt](../../src/operations.ts#L1509) (status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationEnvelope<"fmt"> <!-- internal -->
      <a id="operations.operations.emptyFmt"></a>
    - fn [runFmt](../../src/operations.ts#L1525) (request: FmtRequest, context: OperationContext) → Promise<OperationEnvelope<"fmt">> <!-- internal -->
      <a id="operations.operations.runFmt"></a><br>`keylang fmt [--check]` in two phases. Compute: every file is read and formatted by `formatSource`; one that cannot be read, or whose tree shape is ambiguous (K003), is reported and the rest go on; a saved explanation is skipped.
      - calls [operations.operations.emptyFmt](operations.md#operations.operations.emptyFmt), [base.config.assertFormatOnly](base.md#base.config.assertFormatOnly), [lang.files.collectMdFiles](lang.md#lang.files.collectMdFiles), [base.config.toPosix](base.md#base.config.toPosix), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [map.explanations.isStoredExplanation](map.md#map.explanations.isStoredExplanation), [lang.fmt.formatSource](lang.md#lang.fmt.formatSource), [operations.operations.fmtMessages](operations.md#operations.operations.fmtMessages), [operations.operations.commitFormatted](operations.md#operations.operations.commitFormatted)
    - fn [commitFormatted](../../src/operations.ts#L1611) (abs: string, source: string, text: string) → void <!-- internal -->
      <a id="operations.operations.commitFormatted"></a><br>Writes one formatted file: atomically at the file a link names, with the formatter's bytes (`fmt` turns CRLF into LF, as it always did), and only when the file still holds `source`. A file that cannot be written in place (read-only) is not replaced by the rename either.
      - calls [base.safe-write.landing](base.md#base.safe-write.landing), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic)
    - fn [fmtMessages](../../src/operations.ts#L1623) (payload: FmtPayload) → OperationMessage[]
      <a id="operations.operations.fmtMessages"></a><br>The report, file by file in path order: `info` is what `keylang fmt` prints to stdout, `error` what it prints to stderr; a `warning` names a skipped explanation, which the CLI passes over silently.
      - calls [base.diag.formatDiagnostic](base.md#base.diag.formatDiagnostic)
    - fn [emptyWire](../../src/operations.ts#L1637) (status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationEnvelope<"wire"> <!-- internal -->
      <a id="operations.operations.emptyWire"></a>
    - fn [runWire](../../src/operations.ts#L1656) (request: WireRequest, context: OperationContext) → Promise<OperationEnvelope<"wire">> <!-- internal -->
      <a id="operations.operations.runWire"></a><br>`keylang wire [--check]` in two phases. The path policy of `out` is checked before anything is read: a plain relative TypeScript path that stays inside the repository through links (code 2 otherwise).
      - calls [operations.operations.emptyWire](operations.md#operations.operations.emptyWire), [operations.operations.wireOutProblem](operations.md#operations.operations.wireOutProblem), [operations.operations.wireSpecInputs](operations.md#operations.operations.wireSpecInputs), [base.config.loadConfig](base.md#base.config.loadConfig), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [operations.operations.wiringErrors](operations.md#operations.operations.wiringErrors), [map.wire-gen.generateWire](map.md#map.wire-gen.generateWire), [base.safe-write.landing](base.md#base.safe-write.landing), [map.map.sourceInputs](map.md#map.map.sourceInputs), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [map.map.sourceInputProblems](map.md#map.map.sourceInputProblems), [operations.operations.wireSpecProblems](operations.md#operations.operations.wireSpecProblems), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic)
    - fn [wireOutProblem](../../src/operations.ts#L1747) (root: string, out: string) → string | null
      <a id="operations.operations.wireOutProblem"></a><br>Why `out` cannot be the generated file (the CLI's message), or null: the path policy of every write — plain, relative, inside the repository through links — and a TypeScript extension. Reads nothing outside the repository and writes nothing; a form may call it as the path is…
      - calls [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [operations.operations.messageOf](operations.md#operations.operations.messageOf)
    - fn [wiringErrors](../../src/operations.ts#L1758) (analysis: Analysis) → Diagnostic[] <!-- internal -->
      <a id="operations.operations.wiringErrors"></a><br>Error diagnostics on the lines of a `# wiring` section, whatever their code: any of them can change what is generated.
      - calls [base.diag.isError](base.md#base.diag.isError)
    - type [WireSpecInputs](../../src/operations.ts#L1771) <!-- internal -->
      <a id="operations.operations.WireSpecInputs"></a><br>What the generated text depends on besides the snapshot: every saved spec (a `# wiring` section may be in any) and `tsconfig.json` (the import form).
    - fn [wireSpecInputs](../../src/operations.ts#L1777) (config: Config) → WireSpecInputs <!-- internal -->
      <a id="operations.operations.wireSpecInputs"></a><br>The saved specs by path (relative, POSIX) with their hash, and the root `tsconfig.json`.
      - calls [lang.files.collectMdFiles](lang.md#lang.files.collectMdFiles), [map.analyze.within](map.md#map.analyze.within), [operations.operations.readTextOrNull](operations.md#operations.operations.readTextOrNull), [base.config.toPosix](base.md#base.config.toPosix), [map.snapshot.sha256](map.md#map.snapshot.sha256)
    - fn [wireSpecProblems](../../src/operations.ts#L1793) (config: Config, before: WireSpecInputs) → string[] <!-- internal -->
      <a id="operations.operations.wireSpecProblems"></a><br>How the specs and `tsconfig.json` differ from the ones the wiring was computed from (`path: reason` lines).
      - calls [operations.operations.wireSpecInputs](operations.md#operations.operations.wireSpecInputs)
    - fn [readTextOrNull](../../src/operations.ts#L1806) (abs: string) → string | null <!-- internal -->
      <a id="operations.operations.readTextOrNull"></a>
    - fn [emptyCheck](../../src/operations.ts#L1814) (status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationEnvelope<"check"> <!-- internal -->
      <a id="operations.operations.emptyCheck"></a>
    - fn [runCheck](../../src/operations.ts#L1828) (request: CheckRequest, context: OperationContext) → Promise<OperationEnvelope<"check">> <!-- internal -->
      <a id="operations.operations.runCheck"></a><br>`keylang check` on the saved files: the paths (the spec directory by default), the static mode (request, then keylang.json, then `behavior`) and `strict`. Code 1 for a failure, or with `strict` for an unverified verdict; an unverified one without `strict` is code 0 and stays in…
      - calls [operations.operations.emptyCheck](operations.md#operations.operations.emptyCheck), [base.config.loadConfig](base.md#base.config.loadConfig), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [features.git-changes.gitChangedFiles](features.md#features.git-changes.gitChangedFiles), [map.analyze.within](map.md#map.analyze.within), [base.config.toPosix](base.md#base.config.toPosix), [map.analyze.analyze](map.md#map.analyze.analyze), [features.check-results.checkReport](features.md#features.check-results.checkReport), [features.git-changes.deletedModuleIds](features.md#features.git-changes.deletedModuleIds), [features.changed.filterChanged](features.md#features.changed.filterChanged), [features.git-changes.changedPathSet](features.md#features.git-changes.changedPathSet), [base.config.resolveStatic](base.md#base.config.resolveStatic), [operations.operations.checkSkipNote](operations.md#operations.operations.checkSkipNote), [operations.operations.checkSummary](operations.md#operations.operations.checkSummary), [features.check-results.checkExitCode](features.md#features.check-results.checkExitCode)
    - fn [emptyExplainEdge](../../src/operations.ts#L1909) (status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationEnvelope<"explain-edge"> <!-- internal -->
      <a id="operations.operations.emptyExplainEdge"></a>
    - fn [runExplainEdge](../../src/operations.ts#L1921) (request: ExplainEdgeRequest, context: OperationContext) → Promise<OperationEnvelope<"explain-edge">> <!-- internal -->
      <a id="operations.operations.runExplainEdge"></a><br>`keylang check --explain-edge <from> <to>` on the saved code: a fresh analysis without specs, then the edges between the ids. Code 0 whether or not there is an edge; code 2 for a broken config, no snapshot or an unknown id (an unknown tail under a known module included).
      - calls [operations.operations.emptyExplainEdge](operations.md#operations.operations.emptyExplainEdge), [map.analyze.analyze](map.md#map.analyze.analyze), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [features.explain-edge.edgeIdKnown](features.md#features.explain-edge.edgeIdKnown), [features.explain-edge.explainEdge](features.md#features.explain-edge.explainEdge), [features.explain-edge.edgeExplanationLines](features.md#features.explain-edge.edgeExplanationLines)
    - fn [emptyExport](../../src/operations.ts#L1946) (status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationEnvelope<"export"> <!-- internal -->
      <a id="operations.operations.emptyExport"></a>
    - fn [exportFormatOf](../../src/operations.ts#L1951) (source: ExportSource) → ExportFormat
      <a id="operations.operations.exportFormatOf"></a><br>The format of an export: an explained edge has only the human lines, a trace plan only its JSON.
    - fn [exportText](../../src/operations.ts#L1956) (source: ExportSource) → string
      <a id="operations.operations.exportText"></a><br>The bytes an export writes: the CLI's stdout for the same report.
      - calls [features.check-format.checkReportText](features.md#features.check-format.checkReportText), [lang.parse-format.parseReportText](lang.md#lang.parse-format.parseReportText), [map.trace-plan.tracePlanText](map.md#map.trace-plan.tracePlanText)
    - fn [exportTargetProblem](../../src/operations.ts#L1970) (root: string, path: string) → string | null
      <a id="operations.operations.exportTargetProblem"></a><br>Why `path` cannot receive an export, or null: the write policy of every repository write (plain, relative, inside through links, no directory, no file with a generation marker) and the artifacts generators own — the map, the explained map, the index, the fact cache and the…
      - calls [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [base.safe-write.landing](base.md#base.safe-write.landing), [base.config.toPosix](base.md#base.config.toPosix), [operations.operations.specDirOf](operations.md#operations.operations.specDirOf)
    - fn [specDirOf](../../src/operations.ts#L1983) (root: string) → string <!-- internal -->
      <a id="operations.operations.specDirOf"></a><br>The spec directory of keylang.json without the rest of the config (a broken one included): `keylang` unless it says otherwise.
    - fn [runExport](../../src/operations.ts#L2001) (request: ExportRequest, context: OperationContext) → Promise<OperationEnvelope<"export">> <!-- internal -->
      <a id="operations.operations.runExport"></a><br>Exports a finished report to one file. Nothing is computed again: the text is the CLI's stdout for the request's report.
      - calls [operations.operations.emptyExport](operations.md#operations.operations.emptyExport), [operations.operations.exportText](operations.md#operations.operations.exportText), [operations.operations.exportFormatOf](operations.md#operations.operations.exportFormatOf), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [operations.operations.exportTargetProblem](operations.md#operations.operations.exportTargetProblem), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [base.safe-write.landing](base.md#base.safe-write.landing), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic)
    - fn [emptyParse](../../src/operations.ts#L2046) (status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationEnvelope<"parse"> <!-- internal -->
      <a id="operations.operations.emptyParse"></a>
    - fn [runParse](../../src/operations.ts#L2058) (request: ParseRequest, context: OperationContext) → Promise<OperationEnvelope<"parse">> <!-- internal -->
      <a id="operations.operations.runParse"></a><br>`keylang parse`: every Markdown file under the paths, in their order, into the Text IR. The parser alone runs — no snapshot of the code, no rules.
      - calls [operations.operations.emptyParse](operations.md#operations.operations.emptyParse), [base.config.assertFormatOnly](base.md#base.config.assertFormatOnly), [lang.files.collectMdFiles](lang.md#lang.files.collectMdFiles), [map.explanations.isStoredExplanation](map.md#map.explanations.isStoredExplanation), [lang.parser.parse](lang.md#lang.parser.parse), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [base.diag.isError](base.md#base.diag.isError), [base.diag.formatDiagnostic](base.md#base.diag.formatDiagnostic), [lang.parse-format.parseReportText](lang.md#lang.parse-format.parseReportText)
    - fn [emptyTracePlan](../../src/operations.ts#L2096) (status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationEnvelope<"trace-plan"> <!-- internal -->
      <a id="operations.operations.emptyTracePlan"></a>
    - fn [runTracePlan](../../src/operations.ts#L2107) (request: TracePlanRequest, context: OperationContext) → Promise<OperationEnvelope<"trace-plan">> <!-- internal -->
      <a id="operations.operations.runTracePlan"></a><br>`keylang trace-plan <flow>`: the flow's `trigger` and `step` IDs from the saved specs, then a fresh snapshot of the saved code — never the session's or a cached index. Nothing is written and nothing is run.
      - calls [operations.operations.emptyTracePlan](operations.md#operations.operations.emptyTracePlan), [map.trace-plan.tracePlan](map.md#map.trace-plan.tracePlan), [base.config.loadConfig](base.md#base.config.loadConfig), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [map.trace-plan.tracePlanText](map.md#map.trace-plan.tracePlanText)
    - fn [emptyDraftFlow](../../src/operations.ts#L2125) (status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationEnvelope<"draft-flow"> <!-- internal -->
      <a id="operations.operations.emptyDraftFlow"></a><br>The note on a path that holds no specs, as the CLI writes it after `keylang: `.
    - fn [flowCandidate](../../src/operations.ts#L2135) (root: string, specDir: string, generated: (path: string) => boolean, draft: FlowDraft, into?: string) → FlowCandidate
      <a id="operations.operations.flowCandidate"></a><br>The candidate of `draft` for its target: `into`, else `<specDir>/flows/<name>.md`. A target a proposal may not change is named and not read; otherwise the text on disk and the waiting proposal are read once, here, and `withFlow` keeps the target's other sections.
      - calls [base.config.toPosix](base.md#base.config.toPosix), [features.proposals.proposalProblem](features.md#features.proposals.proposalProblem), [operations.operations.existingText](operations.md#operations.operations.existingText), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [features.draft.withFlow](features.md#features.draft.withFlow)
    - fn [runDraftFlow](../../src/operations.ts#L2161) (request: DraftFlowRequest, context: OperationContext) → Promise<OperationEnvelope<"draft-flow">> <!-- internal -->
      <a id="operations.operations.runDraftFlow"></a><br>`keylang draft flow <trigger> [--mode algo|llm|hybrid]`. Compute: the analysis of the saved files (nothing persisted), the trigger must be a fn, then the draft — `draftFlow`, or the model's (`llm`; `hybrid`, which drafts as algo with a note when no model is configured) — then…
      - calls [operations.operations.emptyDraftFlow](operations.md#operations.operations.emptyDraftFlow), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [map.map.sourceInputs](map.md#map.map.sourceInputs), [features.draft.draftFlow](features.md#features.draft.draftFlow), [operations.operations.modelSetup](operations.md#operations.operations.modelSetup), [base.config.toPosix](base.md#base.config.toPosix), [operations.operations.flowCandidate](operations.md#operations.operations.flowCandidate), [operations.operations.proposalRefusal](operations.md#operations.operations.proposalRefusal), [operations.operations.modelDraft](operations.md#operations.operations.modelDraft), [features.draft.withFlow](features.md#features.draft.withFlow), [operations.operations.draftCountsText](operations.md#operations.operations.draftCountsText), [operations.operations.draftNotes](operations.md#operations.operations.draftNotes), [operations.operations.commitProposal](operations.md#operations.operations.commitProposal), [operations.operations.countProposed](operations.md#operations.operations.countProposed)
    - fn [emptyDraftRules](../../src/operations.ts#L2252) (status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationEnvelope<"draft-rules"> <!-- internal -->
      <a id="operations.operations.emptyDraftRules"></a>
    - fn [rulesCandidate](../../src/operations.ts#L2262) (root: string, specDir: string, generated: (path: string) => boolean, rules: string, into?: string) → RulesCandidate
      <a id="operations.operations.rulesCandidate"></a><br>The candidate of the drafted `rules` for its target: `into`, else `<specDir>/rules.md`. As `flowCandidate`: a target a proposal may not change is named and not read; otherwise the text on disk and the waiting proposal are read once, here, and `withRules` keeps the target's text.
      - calls [base.config.toPosix](base.md#base.config.toPosix), [features.proposals.proposalProblem](features.md#features.proposals.proposalProblem), [operations.operations.existingText](operations.md#operations.operations.existingText), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [features.draft.withRules](features.md#features.draft.withRules)
    - fn [runDraftRules](../../src/operations.ts#L2283) (request: DraftRulesRequest, context: OperationContext) → Promise<OperationEnvelope<"draft-rules">> <!-- internal -->
      <a id="operations.operations.runDraftRules"></a><br>`keylang draft rules [--mode algo|llm|hybrid]`. Compute: the analysis of the saved files (nothing persisted), the algo rules from the module graph and its cycles, then — for a model mode with a model — the model's rules, each checked alone against the snapshot.
      - calls [operations.operations.emptyDraftRules](operations.md#operations.operations.emptyDraftRules), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [map.map.sourceInputs](map.md#map.map.sourceInputs), [check.scc.stronglyConnected](check.md#check.scc.stronglyConnected), [features.draft.draftRules](features.md#features.draft.draftRules), [operations.operations.modelSetup](operations.md#operations.operations.modelSetup), [base.config.toPosix](base.md#base.config.toPosix), [operations.operations.rulesCandidate](operations.md#operations.operations.rulesCandidate), [operations.operations.proposalRefusal](operations.md#operations.operations.proposalRefusal), [operations.operations.rulesCountText](operations.md#operations.operations.rulesCountText), [features.draft.withRules](features.md#features.draft.withRules), [operations.operations.draftCountsText](operations.md#operations.operations.draftCountsText), [operations.operations.commitProposal](operations.md#operations.operations.commitProposal), [operations.operations.countProposed](operations.md#operations.operations.countProposed)
    - fn [emptyDraftLayout](../../src/operations.ts#L2378) (status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationEnvelope<"draft-layout"> <!-- internal -->
      <a id="operations.operations.emptyDraftLayout"></a>
    - fn [runDraftLayout](../../src/operations.ts#L2391) (request: DraftLayoutRequest, context: OperationContext) → Promise<OperationEnvelope<"draft-layout">> <!-- internal -->
      <a id="operations.operations.runDraftLayout"></a><br>`keylang draft map [--mode algo|llm|hybrid]`. The saved keylang.json (or the inferred one without it) first: invalid, it fails (2) as the CLI does.
      - calls [operations.operations.emptyDraftLayout](operations.md#operations.operations.emptyDraftLayout), [base.config.loadConfig](base.md#base.config.loadConfig), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [operations.operations.modelSetup](operations.md#operations.operations.modelSetup), [base.config.guessLayout](base.md#base.config.guessLayout), [base.config.configToJson](base.md#base.config.configToJson)
    - fn [emptyCodeToSpec](../../src/operations.ts#L2438) (status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationEnvelope<"code-to-spec"> <!-- internal -->
      <a id="operations.operations.emptyCodeToSpec"></a>
    - fn [codeToSpecCandidate](../../src/operations.ts#L2449) (root: string, specDir: string, generated: (path: string) => boolean, drafted: { file: string; line: number | null; name: string; drafts: readonly FlowDraft[] }, target: string) → CodeToSpecCandidate
      <a id="operations.operations.codeToSpecCandidate"></a><br>The candidate of the flows drafted from a code position for `target`. As `flowCandidate`: a target a proposal may not change is named and not read; otherwise the text on disk and the waiting proposal are read once, here, and `withFlow` merges every flow into it in order.
      - calls [operations.operations.codePosition](operations.md#operations.operations.codePosition), [features.proposals.proposalProblem](features.md#features.proposals.proposalProblem), [operations.operations.existingText](operations.md#operations.operations.existingText), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [features.draft.withFlow](features.md#features.draft.withFlow)
    - fn [codePosition](../../src/operations.ts#L2462) (drafted: { file: string; line: number | null; name: string; drafts: readonly FlowDraft[] }, target: string) → Pick<CodeToSpecCandidate, "file" | "line" | "name" | "flows" | "print" | "target"> <!-- internal -->
      <a id="operations.operations.codePosition"></a><br>The drafted flows of a code position as a candidate shows them, before the target is read.
    - fn [runCodeToSpec](../../src/operations.ts#L2480) (request: CodeToSpecRequest, context: OperationContext) → Promise<OperationEnvelope<"code-to-spec">> <!-- internal -->
      <a id="operations.operations.runCodeToSpec"></a><br>`keylang code-to-spec <path[:line]> --mode algo`. Compute: the analysis of the saved files (nothing persisted), the fns the position names (`codeToSpec`: a line outside every fn, a file without a fn of the snapshot or without an exported one is 2 with the CLI's message), each…
      - calls [operations.operations.emptyCodeToSpec](operations.md#operations.operations.emptyCodeToSpec), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [map.map.sourceInputs](map.md#map.map.sourceInputs), [features.draft.codeToSpec](features.md#features.draft.codeToSpec), [base.config.toPosix](base.md#base.config.toPosix), [operations.operations.codeToSpecCandidate](operations.md#operations.operations.codeToSpecCandidate), [operations.operations.codePosition](operations.md#operations.operations.codePosition), [operations.operations.proposalRefusal](operations.md#operations.operations.proposalRefusal), [operations.operations.commitProposal](operations.md#operations.operations.commitProposal)
    - fn [rulesCountText](../../src/operations.ts#L2545) (rules: string) → string <!-- internal -->
      <a id="operations.operations.rulesCountText"></a><br>`2 rule(s)`: the list items of a drafted `# rules` section.
    - fn [proposalRefusal](../../src/operations.ts#L2555) (root: string, candidate: { target: string; problem: string | null; pending: string | null }, pending: "refuse" | "replace" | undefined, command = "draft") → { exitCode: 1 | 2; error: string; refused: string[] } | null <!-- internal -->
      <a id="operations.operations.proposalRefusal"></a><br>Why a proposal for the candidate's target may not even be drafted, or null — checked before a model is asked: a target a proposal may not change (2, as in the CLI), a store that breaks the write policy (2), a proposal already waiting under `pending: refuse` (1, named in…
      - calls [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem)
    - type [ProposalCommit](../../src/operations.ts#L2568) <!-- internal -->
      <a id="operations.operations.ProposalCommit"></a><br>What a drafted proposal is written from and against.
    - fn [commitProposal](../../src/operations.ts#L2588) (commit: ProposalCommit, context: OperationContext) → Promise<{ proposal: string } | { refused: string[] } | { failed: string; writing: boolean } | { cancelled: true }> <!-- internal -->
      <a id="operations.operations.commitProposal"></a><br>The commit of a drafted proposal: after `beforeCommit` (which may refuse) the target, the waiting proposal, keylang.json and the sources must still be the ones read, else it is refused and nothing is written; then the full text is written atomically. `failed` with `writing` is…
      - calls [operations.operations.messageOf](operations.md#operations.operations.messageOf), [features.proposals.proposalProblem](features.md#features.proposals.proposalProblem), [features.proposals.proposalWriteProblem](features.md#features.proposals.proposalWriteProblem), [map.map.sourceInputProblems](map.md#map.map.sourceInputProblems), [features.proposals.writeProposal](features.md#features.proposals.writeProposal)
    - fn [countProposed](../../src/operations.ts#L2619) (root: string, counts: Record<DraftStatus, number>) → string | null <!-- internal -->
      <a id="operations.operations.countProposed"></a><br>The drafted lines count as proposed once the proposal exists; a count that cannot be written never fails the draft: its error, or null.
      - calls [features.stats.updateStats](features.md#features.stats.updateStats), [features.stats.addDrafts](features.md#features.stats.addDrafts), [operations.operations.messageOf](operations.md#operations.operations.messageOf)
    - fn [modelSetup](../../src/operations.ts#L2633) (mode: "algo" | "llm" | "hybrid", agent: string | null, command = "draft") → Promise<{ client: LlmClient | null; fallback: string | null } | { error: string }> <!-- internal -->
      <a id="operations.operations.modelSetup"></a><br>The model client of a model mode, read before anything is asked: none configured, and `llm` fails as the CLI does (`<command> --mode llm: …`) while `hybrid` drafts as algo, saying why. Algo: no client.
    - fn [modelDraft](../../src/operations.ts#L2643) (request: DraftFlowRequest, mode: "llm" | "hybrid", analyzed: Analysis, client: LlmClient, context: OperationContext) → Promise<{ draft: FlowDraft; model: DraftModelInfo } | { error: string } | { cancelled: true }> <!-- internal -->
      <a id="operations.operations.modelDraft"></a><br>The model's draft, judged against the snapshot; a Cancel during its answer is `cancelled`, never an error.
      - calls [operations.operations.flowSteps](operations.md#operations.operations.flowSteps), [operations.operations.messageOf](operations.md#operations.operations.messageOf)
    - fn [flowSteps](../../src/operations.ts#L2661) (text: string, trigger: string) → string[] <!-- internal -->
      <a id="operations.operations.flowSteps"></a><br>The IDs of a drafted flow's trigger and steps in the order they stand, the requested trigger first.
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [draftCountsText](../../src/operations.ts#L2673) (counts: Record<string, number>) → string <!-- internal -->
      <a id="operations.operations.draftCountsText"></a><br>`2 agree, 1 llm-only`: the statuses that occur, as the CLI names a model draft.
    - fn [draftNotes](../../src/operations.ts#L2678) (payload: DraftFlowPayload) → OperationMessage[] <!-- internal -->
      <a id="operations.operations.draftNotes"></a><br>What the draft's text does not show, as the CLI's stderr notes: the fallback, unknown IDs, dropped lines.
    - fn [existingText](../../src/operations.ts#L2688) (abs: string) → string | null <!-- internal -->
      <a id="operations.operations.existingText"></a><br>The file's text, null when there is none; a directory or an unreadable file throws.
    - fn [checkSkipNote](../../src/operations.ts#L2692) (path: string) → string
      <a id="operations.operations.checkSkipNote"></a>
    - fn [checkSummary](../../src/operations.ts#L2697) (counts: CheckPayload["counts"]) → string
      <a id="operations.operations.checkSummary"></a><br>The CLI's closing line on stderr: `0 fail, 2 unverified, 5 ok`.
    - fn [emptyFeature](../../src/operations.ts#L2704) (status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationEnvelope<"feature"> <!-- internal -->
      <a id="operations.operations.emptyFeature"></a>
    - fn [runFeature](../../src/operations.ts#L2714) (request: FeatureRequest, context: OperationContext) → Promise<OperationEnvelope<"feature">> <!-- internal -->
      <a id="operations.operations.runFeature"></a><br>The feature status of the saved files. It never takes unsaved text: a caller with dirty buffers saves them first, explicitly.
      - calls [operations.operations.emptyFeature](operations.md#operations.operations.emptyFeature), [base.config.loadConfig](base.md#base.config.loadConfig), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [features.feature-status.featureStatus](features.md#features.feature-status.featureStatus), [operations.operations.gapLine](operations.md#operations.operations.gapLine), [operations.operations.featureSummary](operations.md#operations.operations.featureSummary)
    - fn [gapLine](../../src/operations.ts#L2745) (gap: Gap) → string
      <a id="operations.operations.gapLine"></a><br>One gap as the CLI prints it: `file:line:col: kind id: reason`.
    - fn [featureSummary](../../src/operations.ts#L2750) (report: FeatureReport) → string
      <a id="operations.operations.featureSummary"></a><br>The CLI's closing line on stderr: `done` or `N gap(s)`.
    - fn [emptyDoctor](../../src/operations.ts#L2754) (status: OperationStatus, exitCode: 0 | 1 | 2 | null) → OperationEnvelope<"doctor"> <!-- internal -->
      <a id="operations.operations.emptyDoctor"></a>
    - fn [runDoctor](../../src/operations.ts#L2758) (request: DoctorRequest, context: OperationContext) → Promise<OperationEnvelope<"doctor">> <!-- internal -->
      <a id="operations.operations.runDoctor"></a>
      - calls [operations.operations.emptyDoctor](operations.md#operations.operations.emptyDoctor), [base.config.loadConfig](base.md#base.config.loadConfig), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [operations.operations.agentState](operations.md#operations.operations.agentState), [operations.operations.engineState](operations.md#operations.operations.engineState), [features.explain-llm.oldExplanations](features.md#features.explain-llm.oldExplanations), [features.explain-llm.explainedIds](features.md#features.explain-llm.explainedIds), [features.explain-llm.moveHint](features.md#features.explain-llm.moveHint), [operations.operations.doctorLines](operations.md#operations.operations.doctorLines)
    - fn [agentState](../../src/operations.ts#L2811) (config: Config, llmClient: (agent: string | null) => LlmSetup) → DoctorPayload["agent"] <!-- internal -->
      <a id="operations.operations.agentState"></a><br>The configured agent and its credential state, without the key value.
      - calls [operations.operations.messageOf](operations.md#operations.operations.messageOf)
    - fn [engineState](../../src/operations.ts#L2823) ( config: Config, nativeAvailable: boolean, voiceEngine: (config: Config["voice"], localAvailable: boolean) => VoiceEngine, ) → { resolved: DoctorPayload["voice"]["resolved"]; missing: string | null; error: string | null } <!-- internal -->
      <a id="operations.operations.engineState"></a><br>The engine the voice configuration resolves to now, without the key.
      - calls [operations.operations.messageOf](operations.md#operations.operations.messageOf)
    - fn [doctorLines](../../src/operations.ts#L2840) (payload: DoctorPayload) → string[] <!-- internal -->
      <a id="operations.operations.doctorLines"></a><br>The report lines, exactly as the CLI prints them; the payload carries the data.
    - fn [messageOf](../../src/operations.ts#L2868) (error: unknown) → string <!-- internal -->
      <a id="operations.operations.messageOf"></a>
