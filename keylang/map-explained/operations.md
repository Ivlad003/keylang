<!-- keylang:generated — не редагувати, `keylang map` -->

[README](README.md) · modules: [operations](#operations.operations)

# map

- operations
  <a id="operations"></a>
  - module [operations](../../src/operations.ts#L1)
    <a id="operations.operations"></a><br>Shared workspace operations (ADR 0008): transport-independent orchestration of the application-level actions. The CLI and the TUI call the same interface: a typed request with an explicit absolute root, a typed result with a domain payload.
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - config [base.config](base.md#base.config)
    - explain-llm [features.explain-llm](features.md#features.explain-llm)
    - feature-status [features.feature-status](features.md#features.feature-status)
    - llm [features.llm](features.md#features.llm)
    - voice-local [features.voice-local](features.md#features.voice-local)
    - voice [features.voice](features.md#features.voice)
    - type [DoctorRequest](../../src/operations.ts#L19)
      <a id="operations.operations.DoctorRequest"></a><br>The known operations. `doctor` is the first; new kinds arrive with their feature.
    - type [FeatureRequest](../../src/operations.ts#L26)
      <a id="operations.operations.FeatureRequest"></a><br>Whether a feature file is done, on the saved state of the repository (tools.md `feature`).
    - type [OperationRequest](../../src/operations.ts#L34) = DoctorRequest | FeatureRequest
      <a id="operations.operations.OperationRequest"></a>
    - type [OperationContext](../../src/operations.ts#L37)
      <a id="operations.operations.OperationContext"></a><br>What an operation may use besides its request. No UI state, no shell.
    - type [OperationStatus](../../src/operations.ts#L49) = "completed" | "failed" | "cancelled"
      <a id="operations.operations.OperationStatus"></a>
    - type [OperationMessage](../../src/operations.ts#L51)
      <a id="operations.operations.OperationMessage"></a>
    - type [DoctorPayload](../../src/operations.ts#L58)
      <a id="operations.operations.DoctorPayload"></a><br>The structured doctor report. Key values never reach it.
    - type [FeaturePayload](../../src/operations.ts#L101)
      <a id="operations.operations.FeaturePayload"></a><br>The feature status the CLI prints (`report`), with the file and the snapshot it was computed on.
    - type [OperationPayloads](../../src/operations.ts#L112)
      <a id="operations.operations.OperationPayloads"></a><br>The payload type of each operation kind.
    - type [OperationResult](../../src/operations.ts#L118)
      <a id="operations.operations.OperationResult"></a><br>The result of one operation. File paths are POSIX, relative to the request's root.
    - type [OperationEnvelope](../../src/operations.ts#L120)
      <a id="operations.operations.OperationEnvelope"></a>
    - fn [runOperation](../../src/operations.ts#L141) (request: DoctorRequest, context?: OperationContext) → Promise<OperationEnvelope<"doctor">>
      <a id="operations.operations.runOperation"></a><br>Runs one operation and returns its typed result: the payload type follows the request's kind.
      - calls [operations.operations.runDoctor](operations.md#operations.operations.runDoctor), [operations.operations.runFeature](operations.md#operations.operations.runFeature)
    - fn [emptyFeature](../../src/operations.ts#L156) (status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationEnvelope<"feature"> <!-- internal -->
      <a id="operations.operations.emptyFeature"></a>
    - fn [runFeature](../../src/operations.ts#L166) (request: FeatureRequest, context: OperationContext) → Promise<OperationEnvelope<"feature">> <!-- internal -->
      <a id="operations.operations.runFeature"></a><br>The feature status of the saved files. It never takes unsaved text: a caller with dirty buffers saves them first, explicitly.
      - calls [operations.operations.emptyFeature](operations.md#operations.operations.emptyFeature), [base.config.loadConfig](base.md#base.config.loadConfig), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [features.feature-status.featureStatus](features.md#features.feature-status.featureStatus), [operations.operations.gapLine](operations.md#operations.operations.gapLine), [operations.operations.featureSummary](operations.md#operations.operations.featureSummary)
    - fn [gapLine](../../src/operations.ts#L197) (gap: Gap) → string
      <a id="operations.operations.gapLine"></a><br>One gap as the CLI prints it: `file:line:col: kind id: reason`.
    - fn [featureSummary](../../src/operations.ts#L202) (report: FeatureReport) → string
      <a id="operations.operations.featureSummary"></a><br>The CLI's closing line on stderr: `done` or `N gap(s)`.
    - fn [emptyDoctor](../../src/operations.ts#L206) (status: OperationStatus, exitCode: 0 | 1 | 2 | null) → OperationEnvelope<"doctor"> <!-- internal -->
      <a id="operations.operations.emptyDoctor"></a>
    - fn [runDoctor](../../src/operations.ts#L210) (request: DoctorRequest, context: OperationContext) → Promise<OperationEnvelope<"doctor">> <!-- internal -->
      <a id="operations.operations.runDoctor"></a>
      - calls [operations.operations.emptyDoctor](operations.md#operations.operations.emptyDoctor), [base.config.loadConfig](base.md#base.config.loadConfig), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [operations.operations.agentState](operations.md#operations.operations.agentState), [operations.operations.engineState](operations.md#operations.operations.engineState), [features.explain-llm.oldExplanations](features.md#features.explain-llm.oldExplanations), [features.explain-llm.explainedIds](features.md#features.explain-llm.explainedIds), [features.explain-llm.moveHint](features.md#features.explain-llm.moveHint), [operations.operations.doctorLines](operations.md#operations.operations.doctorLines)
    - fn [agentState](../../src/operations.ts#L263) (config: Config, llmClient: (agent: string | null) => LlmSetup) → DoctorPayload["agent"] <!-- internal -->
      <a id="operations.operations.agentState"></a><br>The configured agent and its credential state, without the key value.
      - calls [operations.operations.messageOf](operations.md#operations.operations.messageOf)
    - fn [engineState](../../src/operations.ts#L275) ( config: Config, nativeAvailable: boolean, voiceEngine: (config: Config["voice"], localAvailable: boolean) => VoiceEngine, ) → { resolved: DoctorPayload["voice"]["resolved"]; missing: string | null; error: string | null } <!-- internal -->
      <a id="operations.operations.engineState"></a><br>The engine the voice configuration resolves to now, without the key.
      - calls [operations.operations.messageOf](operations.md#operations.operations.messageOf)
    - fn [doctorLines](../../src/operations.ts#L292) (payload: DoctorPayload) → string[] <!-- internal -->
      <a id="operations.operations.doctorLines"></a><br>The report lines, exactly as the CLI prints them; the payload carries the data.
    - fn [messageOf](../../src/operations.ts#L320) (error: unknown) → string <!-- internal -->
      <a id="operations.operations.messageOf"></a>
