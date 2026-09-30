<!-- keylang:generated — не редагувати, `keylang map` -->

# map

- operations
  - module [operations](../../src/operations.ts#L1)
    - node external.node
    - config base.config
    - explain-llm features.explain-llm
    - llm features.llm
    - voice-local features.voice-local
    - voice features.voice
    - type [DoctorRequest](../../src/operations.ts#L17)
    - type [OperationRequest](../../src/operations.ts#L23) = DoctorRequest
    - type [OperationContext](../../src/operations.ts#L26)
    - type [OperationStatus](../../src/operations.ts#L33) = "completed" | "failed" | "cancelled"
    - type [OperationMessage](../../src/operations.ts#L35)
    - type [DoctorPayload](../../src/operations.ts#L42)
    - type [OperationResult](../../src/operations.ts#L85)
    - fn [runOperation](../../src/operations.ts#L106) (request: OperationRequest, context: OperationContext = {}) → Promise<OperationResult>
      - calls operations.operations.runDoctor
    - fn [emptyDoctor](../../src/operations.ts#L113) (status: OperationStatus, exitCode: 0 | 1 | 2 | null) → OperationResult <!-- internal -->
    - fn [runDoctor](../../src/operations.ts#L117) (request: DoctorRequest, context: OperationContext) → Promise<OperationResult> <!-- internal -->
      - calls operations.operations.emptyDoctor, base.config.loadConfig, operations.operations.messageOf, operations.operations.agentState, operations.operations.engineState, features.explain-llm.oldExplanations, features.explain-llm.explainedIds, features.explain-llm.moveHint, operations.operations.doctorLines
    - fn [agentState](../../src/operations.ts#L170) (config: Config, llmClient: (agent: string | null) => LlmSetup) → DoctorPayload["agent"] <!-- internal -->
      - calls operations.operations.messageOf
    - fn [engineState](../../src/operations.ts#L182) ( config: Config, nativeAvailable: boolean, voiceEngine: (config: Config["voice"], localAvailable: boolean) => VoiceEngine, ) → { resolved: DoctorPayload["voice"]["resolved"]; missing: string | null; error: string | null } <!-- internal -->
      - calls operations.operations.messageOf
    - fn [doctorLines](../../src/operations.ts#L199) (payload: DoctorPayload) → string[] <!-- internal -->
    - fn [messageOf](../../src/operations.ts#L227) (error: unknown) → string <!-- internal -->
