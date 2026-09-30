<!-- keylang:generated — не редагувати, `keylang map` -->

[README](README.md) · modules: [operations](#operations.operations)

# map

- operations
  <a id="operations"></a>
  - module [operations](../../src/operations.ts#L1)
    <a id="operations.operations"></a><br>Shared workspace operations (ADR 0008): transport-independent orchestration of the application-level actions. The CLI and the TUI call the same interface: a typed request with an explicit absolute root, a typed result with a domain payload.
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - explain-llm [features.explain-llm](features.md#features.explain-llm)
    - llm [features.llm](features.md#features.llm)
    - voice-local [features.voice-local](features.md#features.voice-local)
    - voice [features.voice](features.md#features.voice)
    - type [DoctorRequest](../../src/operations.ts#L17)
      <a id="operations.operations.DoctorRequest"></a><br>The known operations. `doctor` is the first; new kinds arrive with their feature.
    - type [OperationRequest](../../src/operations.ts#L23) = DoctorRequest
      <a id="operations.operations.OperationRequest"></a>
    - type [OperationContext](../../src/operations.ts#L26)
      <a id="operations.operations.OperationContext"></a><br>What an operation may use besides its request. No UI state, no shell.
    - type [OperationStatus](../../src/operations.ts#L33) = "completed" | "failed" | "cancelled"
      <a id="operations.operations.OperationStatus"></a>
    - type [OperationMessage](../../src/operations.ts#L35)
      <a id="operations.operations.OperationMessage"></a>
    - type [DoctorPayload](../../src/operations.ts#L42)
      <a id="operations.operations.DoctorPayload"></a><br>The structured doctor report. Key values never reach it.
    - type [OperationResult](../../src/operations.ts#L85)
      <a id="operations.operations.OperationResult"></a><br>The result of one operation. File paths are POSIX, relative to the request's root.
    - fn [runOperation](../../src/operations.ts#L106) (request: OperationRequest, context: OperationContext = {}) → Promise<OperationResult>
      <a id="operations.operations.runOperation"></a><br>Runs one operation and returns its typed result.
      - calls [operations.operations.runDoctor](operations.md#operations.operations.runDoctor)
    - fn [emptyDoctor](../../src/operations.ts#L113) (status: OperationStatus, exitCode: 0 | 1 | 2 | null) → OperationResult <!-- internal -->
      <a id="operations.operations.emptyDoctor"></a>
    - fn [runDoctor](../../src/operations.ts#L117) (request: DoctorRequest, context: OperationContext) → Promise<OperationResult> <!-- internal -->
      <a id="operations.operations.runDoctor"></a>
      - calls [operations.operations.emptyDoctor](operations.md#operations.operations.emptyDoctor), [base.config.loadConfig](base.md#base.config.loadConfig), [operations.operations.messageOf](operations.md#operations.operations.messageOf), [operations.operations.agentState](operations.md#operations.operations.agentState), [operations.operations.engineState](operations.md#operations.operations.engineState), [features.explain-llm.oldExplanations](features.md#features.explain-llm.oldExplanations), [features.explain-llm.explainedIds](features.md#features.explain-llm.explainedIds), [features.explain-llm.moveHint](features.md#features.explain-llm.moveHint), [operations.operations.doctorLines](operations.md#operations.operations.doctorLines)
    - fn [agentState](../../src/operations.ts#L170) (config: Config, llmClient: (agent: string | null) => LlmSetup) → DoctorPayload["agent"] <!-- internal -->
      <a id="operations.operations.agentState"></a><br>The configured agent and its credential state, without the key value.
      - calls [operations.operations.messageOf](operations.md#operations.operations.messageOf)
    - fn [engineState](../../src/operations.ts#L182) ( config: Config, nativeAvailable: boolean, voiceEngine: (config: Config["voice"], localAvailable: boolean) => VoiceEngine, ) → { resolved: DoctorPayload["voice"]["resolved"]; missing: string | null; error: string | null } <!-- internal -->
      <a id="operations.operations.engineState"></a><br>The engine the voice configuration resolves to now, without the key.
      - calls [operations.operations.messageOf](operations.md#operations.operations.messageOf)
    - fn [doctorLines](../../src/operations.ts#L199) (payload: DoctorPayload) → string[] <!-- internal -->
      <a id="operations.operations.doctorLines"></a><br>The report lines, exactly as the CLI prints them; the payload carries the data.
    - fn [messageOf](../../src/operations.ts#L227) (error: unknown) → string <!-- internal -->
      <a id="operations.operations.messageOf"></a>
