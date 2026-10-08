<!-- keylang:generated — не редагувати, `keylang map` -->

[README](README.md) · modules: [operations](#operations.operations) · [assistant](#operations.assistant) · [code](#operations.code) · [coverage](#operations.coverage) · [diagram-export](#operations.diagram-export) · [discover-names](#operations.discover-names) · [discover](#operations.discover) · [doctor](#operations.doctor) · [draft](#operations.draft) · [entries](#operations.entries) · [explain](#operations.explain) · [export](#operations.export) · [feature](#operations.feature) · [generate](#operations.generate) · [integrations](#operations.integrations) · [shared](#operations.shared) · [spec](#operations.spec) · [types](#operations.types)

# map

- operations
  <a id="operations"></a><br>Transport-independent actions the CLI and TUI both call, each a typed request and result defined in [`operations.types`](operations.md#operations.types) and orchestrated by [`operations.operations`](operations.md#operations.operations): generating maps, checking specs, drafting, explaining nodes and exporting. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
  - module [operations](../../src/operations.ts#L1)
    <a id="operations.operations"></a><br>Shared workspace operations (ADR 0008): transport-independent orchestration of the application-level actions. The CLI and the TUI call the same interface: a typed request with an explicit absolute root, a typed result with a domain payload.
    - types [operations.types](operations.md#operations.types)
    - generate [operations.generate](operations.md#operations.generate)
    - spec [operations.spec](operations.md#operations.spec)
    - feature [operations.feature](operations.md#operations.feature)
    - explain [operations.explain](operations.md#operations.explain)
    - draft [operations.draft](operations.md#operations.draft)
    - code [operations.code](operations.md#operations.code)
    - export [operations.export](operations.md#operations.export)
    - doctor [operations.doctor](operations.md#operations.doctor)
    - entries [operations.entries](operations.md#operations.entries)
    - coverage [operations.coverage](operations.md#operations.coverage)
    - integrations [operations.integrations](operations.md#operations.integrations)
    - discover [operations.discover](operations.md#operations.discover)
    - assistant [operations.assistant](operations.md#operations.assistant)
    - shared [operations.shared](operations.md#operations.shared)
    - fn [runOperation](../../src/operations.ts#L39) (request: DoctorRequest, context?: OperationContext) → Promise<OperationEnvelope<"doctor">>
      <a id="operations.operations.runOperation"></a><br>Runs one operation and returns its typed result: the payload type follows the request's kind.
      - calls [operations.doctor.runDoctor](operations.md#operations.doctor.runDoctor), [operations.feature.runFeature](operations.md#operations.feature.runFeature), [operations.feature.runFeatureQuestions](operations.md#operations.feature.runFeatureQuestions), [operations.export.runExportC4](operations.md#operations.export.runExportC4), [operations.generate.runMapCheck](operations.md#operations.generate.runMapCheck), [operations.generate.runMap](operations.md#operations.generate.runMap), [operations.generate.runBaseline](operations.md#operations.generate.runBaseline), [operations.generate.runAgents](operations.md#operations.generate.runAgents), [operations.spec.runFmt](operations.md#operations.spec.runFmt), [operations.generate.runWire](operations.md#operations.generate.runWire), [operations.spec.runCheck](operations.md#operations.spec.runCheck), [operations.spec.runExplainEdge](operations.md#operations.spec.runExplainEdge), [operations.explain.runExplain](operations.md#operations.explain.runExplain), [operations.explain.runExplainLlm](operations.md#operations.explain.runExplainLlm), [operations.explain.runExplainPlan](operations.md#operations.explain.runExplainPlan), [operations.explain.runExplainBatch](operations.md#operations.explain.runExplainBatch), [operations.generate.runInit](operations.md#operations.generate.runInit), [operations.export.runExport](operations.md#operations.export.runExport), [operations.spec.runParse](operations.md#operations.spec.runParse), [operations.spec.runTracePlan](operations.md#operations.spec.runTracePlan), [operations.entries.runEntries](operations.md#operations.entries.runEntries), [operations.coverage.runCoverage](operations.md#operations.coverage.runCoverage), [operations.integrations.runIntegrations](operations.md#operations.integrations.runIntegrations), [operations.discover.runFlowsDiscover](operations.md#operations.discover.runFlowsDiscover), [operations.discover.runFlowsAdopt](operations.md#operations.discover.runFlowsAdopt), [operations.draft.runDraftFlow](operations.md#operations.draft.runDraftFlow), [operations.draft.runDraftRules](operations.md#operations.draft.runDraftRules), [operations.draft.runDraftLayout](operations.md#operations.draft.runDraftLayout), [operations.draft.runCodeToSpec](operations.md#operations.draft.runCodeToSpec), [operations.code.runSpecToCode](operations.md#operations.code.runSpecToCode), [operations.code.runApplyCode](operations.md#operations.code.runApplyCode), [operations.assistant.runAssistantReply](operations.md#operations.assistant.runAssistantReply)
  - module [assistant](../../src/operations/assistant.ts#L1)
    <a id="operations.assistant"></a><br>The clip's reply (ADR 0021, .scratch/tui-clip/03): what the configured model answers in the TUI's chat. The prompt and the reading of the answer are pure functions of the request — the conversation (its newest 16 000 characters, whole messages), the open file around the cursor…
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - diag [base.diag](base.md#base.diag)
    - shared [operations.shared](operations.md#operations.shared)
    - types [operations.types](operations.md#operations.types)
    - llm [features.llm](features.md#features.llm)
    - fn [assistantSystem](../../src/operations/assistant.ts#L29) (specDir: string) → string
      <a id="operations.assistant.assistantSystem"></a><br>What the clip is and may do (spec §4.3): short answers in the person's language, about this repository only, no invented verdicts or edges, a spec change as one block with the whole file, no code.
    - fn [recentTurns](../../src/operations/assistant.ts#L46) (history: readonly ChatTurn[], budget = HISTORY_CHARS) → { turns: ChatTurn[]; dropped: number }
      <a id="operations.assistant.recentTurns"></a><br>The newest messages whose texts take at most `budget` characters together, oldest first, and how many older ones were left out. The last one — the person's new message — is kept however long it is.
    - fn [fileWindow](../../src/operations/assistant.ts#L63) (text: string, line: number, count = FILE_LINES) → { first: number; last: number; total: number; text: string }
      <a id="operations.assistant.fileWindow"></a><br>At most `count` lines of `text` around the 0-based `line`, the cursor's line in their middle where the file allows; `first` and `last` are 1-based and inclusive.
    - fn [assistantPrompt](../../src/operations/assistant.ts#L79) (request: AssistantReplyRequest, specDir: string) → LlmRequest
      <a id="operations.assistant.assistantPrompt"></a><br>The request as the model reads it: the system prompt, and one prompt with the open file around the cursor, the cursor's line and the ID under it, the open feature, the open questions, the F4 pack and the conversation, the person's new message last.
      - calls [operations.assistant.fileWindow](operations.md#operations.assistant.fileWindow), [operations.assistant.fenced](operations.md#operations.assistant.fenced), [operations.assistant.listOf](operations.md#operations.assistant.listOf), [operations.assistant.recentTurns](operations.md#operations.assistant.recentTurns), [operations.assistant.assistantSystem](operations.md#operations.assistant.assistantSystem)
    - fn [listOf](../../src/operations/assistant.ts#L98) (lines: readonly string[]) → string <!-- internal -->
      <a id="operations.assistant.listOf"></a>
    - fn [fenced](../../src/operations/assistant.ts#L103) (text: string) → string <!-- internal -->
      <a id="operations.assistant.fenced"></a><br>`text` in a fence longer than any run of backticks in it, so a spec's own code blocks stay inside.
    - fn [parseReply](../../src/operations/assistant.ts#L125) (answer: string) → Pick<AssistantReplyPayload, "reply" | "proposal" | "dropped">
      <a id="operations.assistant.parseReply"></a><br>The model's answer as the chat shows it and the candidate it proposes: the first `keylang path=<file>` block the answer closes is the candidate, its lines the file's full text. The answer's other such blocks are left out by path, and so is one it never closes: an answer cut at…
      - calls [operations.assistant.candidateEnd](operations.md#operations.assistant.candidateEnd), [operations.assistant.closes](operations.md#operations.assistant.closes)
    - fn [candidateEnd](../../src/operations/assistant.ts#L163) (lines: readonly string[], from: number, fence: string) → number <!-- internal -->
      <a id="operations.assistant.candidateEnd"></a><br>The line that closes a candidate opened by `fence`, from `from` on, or `lines.length`. A fence of the same character at least as long with an info string opens a block of the file's own (CommonMark would close the candidate at its end): the next fence that closes that block is…
      - calls [operations.assistant.closes](operations.md#operations.assistant.closes)
    - fn [closes](../../src/operations/assistant.ts#L179) (line: string, fence: string) → boolean <!-- internal -->
      <a id="operations.assistant.closes"></a><br>Whether `line` closes a block opened by `fence`: the same character, at least as many, nothing after.
    - fn [runAssistantReply](../../src/operations/assistant.ts#L191) (request: AssistantReplyRequest, context: OperationContext) → Promise<OperationEnvelope<"assistant-reply">>
      <a id="operations.assistant.runAssistantReply"></a><br>Asks the model of `agent` once and reads its answer: the reply for the chat and the candidate block, if any. Nothing is written.
      - calls [operations.shared.empty](operations.md#operations.shared.empty), [base.config.loadConfig](base.md#base.config.loadConfig), [base.diag.errorText](base.md#base.diag.errorText), [operations.assistant.assistantPrompt](operations.md#operations.assistant.assistantPrompt), [operations.shared.rootRelative](operations.md#operations.shared.rootRelative), [operations.assistant.parseReply](operations.md#operations.assistant.parseReply), [operations.assistant.replyMessages](operations.md#operations.assistant.replyMessages)
    - fn [replyMessages](../../src/operations/assistant.ts#L226) (payload: AssistantReplyPayload) → OperationMessage[] <!-- internal -->
      <a id="operations.assistant.replyMessages"></a><br>The record's report: who answered, the candidate and what was left out.
  - module [code](../../src/operations/code.ts#L1)
    <a id="operations.code"></a><br>Code from a planned spec: `spec-to-code` builds a candidate (a stub or the model's code, with failing tests) and proposes it file by file; `spec-to-code --apply` writes a candidate already built.
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - config [base.config](base.md#base.config)
    - diag [base.diag](base.md#base.diag)
    - files [lang.files](lang.md#lang.files)
    - proposals [features.proposals](features.md#features.proposals)
    - spec-to-code [features.spec-to-code](features.md#features.spec-to-code)
    - map [map.map](map.md#map.map)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - types [operations.types](operations.md#operations.types)
    - shared [operations.shared](operations.md#operations.shared)
    - llm [features.llm](features.md#features.llm)
    - fn [specToCodeCandidate](../../src/operations/code.ts#L20) (root: string, built: CodeCandidate, basis: CandidateBasis) → SpecToCodeCandidate <!-- internal -->
      <a id="operations.code.specToCodeCandidate"></a><br>The candidate as the operation reports it: each file with the proposal waiting for it now (read only when the store passes the write policy).
      - calls [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [lang.files.existingText](lang.md#lang.files.existingText), [features.spec-to-code.fileDiffText](features.md#features.spec-to-code.fileDiffText), [features.spec-to-code.specToCodeText](features.md#features.spec-to-code.specToCodeText)
    - fn [runSpecToCode](../../src/operations/code.ts#L64) (request: SpecToCodeRequest, context: OperationContext) → Promise<OperationEnvelope<"spec-to-code">>
      <a id="operations.code.runSpecToCode"></a><br>`keylang spec-to-code <id> [--into]`, template mode. Compute: the analysis of the saved files (nothing persisted; no snapshot is 2), then `specToCode` — an ID not planned, implemented (named with its place), a `deny` its flow breaks or a file not of its module is 2 with the…
      - calls [operations.shared.empty](operations.md#operations.shared.empty), [base.diag.errorText](base.md#base.diag.errorText), [map.map.sourceInputs](map.md#map.map.sourceInputs), [operations.shared.specHashes](operations.md#operations.shared.specHashes), [base.config.toPosix](base.md#base.config.toPosix), [operations.shared.modelSetup](operations.md#operations.shared.modelSetup), [features.spec-to-code.plannedCodeTarget](features.md#features.spec-to-code.plannedCodeTarget), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [lang.files.existingText](lang.md#lang.files.existingText), [operations.code.specToCodeCandidate](operations.md#operations.code.specToCodeCandidate), [features.spec-to-code.specToCode](features.md#features.spec-to-code.specToCode), [features.proposals.codeProposalProblem](features.md#features.proposals.codeProposalProblem), [features.proposals.proposalWriteProblem](features.md#features.proposals.proposalWriteProblem), [map.map.sourceInputProblems](map.md#map.map.sourceInputProblems), [operations.shared.specProblems](operations.md#operations.shared.specProblems), [features.proposals.writeProposal](features.md#features.proposals.writeProposal)
    - fn [applyProblems](../../src/operations/code.ts#L214) (request: ApplyCodeRequest) → { policy: string | null; refused: string[] } <!-- internal -->
      <a id="operations.code.applyProblems"></a><br>Why the candidate may not be applied now. `policy`: a file no code proposal may change, or one the write protocol refuses (a link out, a generated file, a directory) — the first such, as `--apply` always named it. `refused`: every file that no longer holds the text the…
      - calls [features.proposals.codeProposalProblem](features.md#features.proposals.codeProposalProblem), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [lang.files.readTextOrNull](lang.md#lang.files.readTextOrNull), [map.map.sourceInputProblems](map.md#map.map.sourceInputProblems), [base.config.loadConfig](base.md#base.config.loadConfig), [operations.shared.specProblems](operations.md#operations.shared.specProblems)
    - fn [runApplyCode](../../src/operations/code.ts#L254) (request: ApplyCodeRequest, context: OperationContext) → Promise<OperationEnvelope<"apply-code">>
      <a id="operations.code.runApplyCode"></a><br>`keylang spec-to-code <id> --apply` on a candidate already built (see `ApplyCodeRequest`). A file of the candidate no code proposal may change is 2; a file, a waiting proposal (under `refuse`) or an input changed since the candidate is 1 with each named, nothing written.
      - calls [operations.shared.empty](operations.md#operations.shared.empty), [operations.code.applyProblems](operations.md#operations.code.applyProblems), [base.diag.errorText](base.md#base.diag.errorText), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic), [base.safe-write.landing](base.md#base.safe-write.landing)
  - module [coverage](../../src/operations/coverage.ts#L1)
    <a id="operations.coverage"></a><br>`keylang coverage [--json]`, the MCP tool `coverage_report` and the TUI's «Blind spots» (business-flows/13): what keylang does not see in the current snapshot, read-only. One text for the CLI and the F6 report, one JSON shape for `--json` and MCP.
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - coverage-report [features.coverage-report](features.md#features.coverage-report)
    - diag [base.diag](base.md#base.diag)
    - discover [features.discover](features.md#features.discover)
    - shared [operations.shared](operations.md#operations.shared)
    - types [operations.types](operations.md#operations.types)
    - fn [runCoverage](../../src/operations/coverage.ts#L21) (request: CoverageRequest, context: OperationContext) → Promise<OperationEnvelope<"coverage">>
      <a id="operations.coverage.runCoverage"></a><br>The report over a fresh snapshot of the saved code and the hand-written specs. Code 0 with the report (holes and orphans are no failure); 2 with no payload for a broken keylang.json, a repository without code to read, or an unreadable data file.
      - calls [operations.shared.empty](operations.md#operations.shared.empty), [base.diag.errorText](base.md#base.diag.errorText), [features.coverage-report.loadDataLogic](features.md#features.coverage-report.loadDataLogic), [features.coverage-report.findDataLogic](features.md#features.coverage-report.findDataLogic), [operations.shared.rootRelative](operations.md#operations.shared.rootRelative), [features.coverage-report.coverageReport](features.md#features.coverage-report.coverageReport), [features.discover.specifiedTriggers](features.md#features.discover.specifiedTriggers), [operations.coverage.readOrNull](operations.md#operations.coverage.readOrNull), [features.coverage-report.coverageText](features.md#features.coverage-report.coverageText)
    - fn [readOrNull](../../src/operations/coverage.ts#L50) (abs: string) → string | null <!-- internal -->
      <a id="operations.coverage.readOrNull"></a>
  - module [diagram-export](../../src/operations/diagram-export.ts#L1)
    <a id="operations.diagram-export"></a><br>`keylang export bpmn|drawio` and `keylang import drawio` (business-flows/28): the picture `/diagrams` draws, written for other tools, and a draw.io drawing read back as one proposal for one flow. The renderers are pure (`src/bpmn-export.ts`, `src/drawio.ts`); here are the…
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - bpmn-export [map.bpmn-export](map.md#map.bpmn-export)
    - check-results [features.check-results](features.md#features.check-results)
    - config [base.config](base.md#base.config)
    - diag [base.diag](base.md#base.diag)
    - diagram [map.diagram](map.md#map.diagram)
    - discover-names [features.discover-names](features.md#features.discover-names)
    - draft [features.draft](features.md#features.draft)
    - drawio [map.drawio](map.md#map.drawio)
    - files [lang.files](lang.md#lang.files)
    - map [map.map](map.md#map.map)
    - parser [lang.parser](lang.md#lang.parser)
    - proposals [features.proposals](features.md#features.proposals)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - shared [operations.shared](operations.md#operations.shared)
    - types [operations.types](operations.md#operations.types)
    - type [DiagramFormat](../../src/operations/diagram-export.ts#L28) = (typeof DIAGRAM_FORMATS)[number]
      <a id="operations.diagram-export.DiagramFormat"></a>
    - type [ExportView](../../src/operations/diagram-export.ts#L31)
      <a id="operations.diagram-export.ExportView"></a><br>A view to export: what `diagramOf` draws, whether it comes from the discovered view, and its name (`flow:checkout`).
    - fn [parseExportView](../../src/operations/diagram-export.ts#L41) (text: string) → ExportView | string
      <a id="operations.diagram-export.parseExportView"></a><br>A view as the CLI names it: `<flow>` or `flow:<name>`, `discovered:<name>`, `process:<domain>`, `entry:<id>`, `layers`; or why it names none.
    - fn [exportViewOfQuery](../../src/operations/diagram-export.ts#L63) (query: URLSearchParams) → ExportView | string
      <a id="operations.diagram-export.exportViewOfQuery"></a><br>A view from the query of `GET /api/export` — the query `/api/diagram` takes (`view=flow&name=…`, `view=discovered&name=…`, `view=process&domain=…`, `view=entry&id=…`, `view=layers`) — or why it names none.
      - calls [operations.diagram-export.parseExportView](operations.md#operations.diagram-export.parseExportView)
    - fn [discoveredSpecOf](../../src/operations/diagram-export.ts#L77) (root: string, specDir: string) → SpecIR | null
      <a id="operations.diagram-export.discoveredSpecOf"></a><br>The discovered view (`<dir>/flows-discovered/*.md`, the README of the processes aside) parsed as specs, or null without it.
      - calls [lang.spec-ir.compileSpec](lang.md#lang.spec-ir.compileSpec), [lang.parser.parse](lang.md#lang.parser.parse), [base.config.toPosix](base.md#base.config.toPosix)
    - type [ExportSources](../../src/operations/diagram-export.ts#L88)
      <a id="operations.diagram-export.ExportSources"></a><br>What a diagram is drawn from, as the API and the CLI read it.
    - fn [exportSourcesOf](../../src/operations/diagram-export.ts#L97) (analysis: Analysis, discovered: SpecIR | null) → ExportSources
      <a id="operations.diagram-export.exportSourcesOf"></a><br>The sources of an analysis: check results as verdicts, the saved business processes found again in its snapshot.
      - calls [features.check-results.checkResults](features.md#features.check-results.checkResults), [features.discover-names.processViews](features.md#features.discover-names.processViews), [features.discover-names.readProcesses](features.md#features.discover-names.readProcesses)
    - fn [diagramExportText](../../src/operations/diagram-export.ts#L104) (format: DiagramFormat, view: ExportView, sources: ExportSources) → string
      <a id="operations.diagram-export.diagramExportText"></a><br>The bytes of one export. A discovered flow is drawn from the discovered view, without verdicts (`check` does not judge it).
      - calls [map.drawio.renderDrawio](map.md#map.drawio.renderDrawio), [map.bpmn-export.renderBpmn](map.md#map.bpmn-export.renderBpmn)
    - fn [isDiagramExport](../../src/operations/diagram-export.ts#L115) (text: string) → boolean
      <a id="operations.diagram-export.isDiagramExport"></a><br>A file one of these exports wrote: `exporter="keylang"` (BPMN) or `<mxfile host="keylang"` (draw.io) near its start.
    - type [DiagramExportRequest](../../src/operations/diagram-export.ts#L120)
      <a id="operations.diagram-export.DiagramExportRequest"></a>
    - type [DiagramExportResult](../../src/operations/diagram-export.ts#L128)
      <a id="operations.diagram-export.DiagramExportResult"></a>
    - fn [failed](../../src/operations/diagram-export.ts#L135) (error: string) → DiagramExportResult <!-- internal -->
      <a id="operations.diagram-export.failed"></a>
    - fn [runDiagramExport](../../src/operations/diagram-export.ts#L144) (request: DiagramExportRequest, context: OperationContext = {}) → Promise<DiagramExportResult>
      <a id="operations.diagram-export.runDiagramExport"></a><br>`keylang export bpmn|drawio <view> [--out f]`: the diagram of the saved code and specs, no model. `--out` must pass the write policy and be new or a file one of these exports wrote; otherwise 2 with nothing written.
      - calls [operations.diagram-export.failed](operations.md#operations.diagram-export.failed), [operations.diagram-export.parseExportView](operations.md#operations.diagram-export.parseExportView), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [base.diag.errorText](base.md#base.diag.errorText), [operations.diagram-export.discoveredSpecOf](operations.md#operations.diagram-export.discoveredSpecOf), [operations.shared.rootRelative](operations.md#operations.shared.rootRelative), [operations.diagram-export.diagramExportText](operations.md#operations.diagram-export.diagramExportText), [operations.diagram-export.exportSourcesOf](operations.md#operations.diagram-export.exportSourcesOf), [lang.files.existingText](lang.md#lang.files.existingText), [operations.diagram-export.isDiagramExport](operations.md#operations.diagram-export.isDiagramExport), [base.safe-write.safeWrite](base.md#base.safe-write.safeWrite)
    - type [ImportDrawioRequest](../../src/operations/diagram-export.ts#L195)
      <a id="operations.diagram-export.ImportDrawioRequest"></a>
    - type [ImportDrawioResult](../../src/operations/diagram-export.ts#L205)
      <a id="operations.diagram-export.ImportDrawioResult"></a>
    - fn [runImportDrawio](../../src/operations/diagram-export.ts#L225) (request: ImportDrawioRequest, context: OperationContext = {}) → Promise<ImportDrawioResult>
      <a id="operations.diagram-export.runImportDrawio"></a><br>`keylang import drawio <file> [--into spec.md] [--print]`: the drawing as ONE proposal for the flow it draws (`keylang_view` `flow:<name>` or `discovered:<name>`). The flow's section is edited as the drawing asks (`flowFromDrawio`) and compared with the section as it is: no…
      - calls [map.drawio.parseDrawio](map.md#map.drawio.parseDrawio), [base.diag.errorText](base.md#base.diag.errorText), [map.drawio.drawioFlowName](map.md#map.drawio.drawioFlowName), [operations.shared.rootRelative](operations.md#operations.shared.rootRelative), [lang.files.existingText](lang.md#lang.files.existingText), [map.drawio.flowSection](map.md#map.drawio.flowSection), [map.drawio.flowFromDrawio](map.md#map.drawio.flowFromDrawio), [features.draft.withFlow](features.md#features.draft.withFlow), [features.proposals.lineDiff](features.md#features.proposals.lineDiff), [operations.shared.generatedIn](operations.md#operations.shared.generatedIn), [features.proposals.proposalProblem](features.md#features.proposals.proposalProblem), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [operations.shared.proposalRefusal](operations.md#operations.shared.proposalRefusal), [operations.shared.commitProposal](operations.md#operations.shared.commitProposal), [map.map.sourceInputs](map.md#map.map.sourceInputs), [base.config.toPosix](base.md#base.config.toPosix)
  - module [discover-names](../../src/operations/discover-names.ts#L1)
    <a id="operations.discover-names"></a><br>`keylang flows discover --names` (business-flows/12): the model's part of the discovery. One request per layer group (`planNames`), at most `jobs` at a time; each answer is checked (`parseNamesAnswer`) and the processes of the groups that answered replace their saved ones, the…
    - analyze [map.analyze](map.md#map.analyze)
    - diag [base.diag](base.md#base.diag)
    - discover-names [features.discover-names](features.md#features.discover-names)
    - discover [features.discover](features.md#features.discover)
    - explain-inventory [features.explain-inventory](features.md#features.explain-inventory)
    - explanations [map.explanations](map.md#map.explanations)
    - agent-cli [features.agent-cli](features.md#features.agent-cli)
    - types [operations.types](operations.md#operations.types)
    - llm [features.llm](features.md#features.llm)
    - type [NamesOutcome](../../src/operations/discover-names.ts#L18)
      <a id="operations.discover-names.NamesOutcome"></a>
    - fn [nameProcesses](../../src/operations/discover-names.ts#L20) (analyzed: Analysis, discovery: Discovery, specDir: string, names: NonNullable<FlowsDiscoverRequest["names"]>, layer: string | undefined, context: OperationContext) → Promise<NamesOutcome>
      <a id="operations.discover-names.nameProcesses"></a>
      - calls [features.discover-names.readProcesses](features.md#features.discover-names.readProcesses), [features.discover-names.planNames](features.md#features.discover-names.planNames), [map.explanations.loadBriefs](map.md#map.explanations.loadBriefs), [features.discover-names.namesRequest](features.md#features.discover-names.namesRequest), [features.discover-names.estimateNameTokens](features.md#features.discover-names.estimateNameTokens), [base.diag.errorText](base.md#base.diag.errorText), [features.explain-inventory.defaultBriefJobs](features.md#features.explain-inventory.defaultBriefJobs), [features.agent-cli.selectedAgent](features.md#features.agent-cli.selectedAgent), [features.discover-names.parseNamesAnswer](features.md#features.discover-names.parseNamesAnswer), [features.discover-names.processBaseline](features.md#features.discover-names.processBaseline), [features.discover-names.processesPath](features.md#features.discover-names.processesPath), [features.discover-names.renderProcesses](features.md#features.discover-names.renderProcesses)
  - module [discover](../../src/operations/discover.ts#L1)
    <a id="operations.discover"></a><br>`keylang flows discover` and `keylang flows adopt` (business-flows/11), the MCP tool `discover_flows` and the TUI's «Discover flows». Discover writes the generated view `<dir>/flows-discovered/<layer>.md` the way `map` writes the map: only files that changed, only over files…
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - diag [base.diag](base.md#base.diag)
    - discover [features.discover](features.md#features.discover)
    - discover-names [features.discover-names](features.md#features.discover-names)
    - map [map.map](map.md#map.map)
    - discover-names2 [operations.discover-names](operations.md#operations.discover-names)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - draft [operations.draft](operations.md#operations.draft)
    - shared [operations.shared](operations.md#operations.shared)
    - types [operations.types](operations.md#operations.types)
    - fn [discoveryOf](../../src/operations/discover.ts#L22) (root: string, options: DiscoverOptions, context: OperationContext) → Promise<{ analyzed: Analysis; discovery: Discovery; specDir: string } | { error: string }> <!-- internal -->
      <a id="operations.discover.discoveryOf"></a><br>The analysis both operations start from: the saved code and the hand-written specs; nothing persisted but the fact cache.
      - calls [base.diag.errorText](base.md#base.diag.errorText), [operations.shared.rootRelative](operations.md#operations.shared.rootRelative), [features.discover.discoverFlows](features.md#features.discover.discoverFlows), [features.discover.specifiedTriggers](features.md#features.discover.specifiedTriggers)
    - fn [runFlowsDiscover](../../src/operations/discover.ts#L40) (request: FlowsDiscoverRequest, context: OperationContext) → Promise<OperationEnvelope<"flows-discover">>
      <a id="operations.discover.runFlowsDiscover"></a><br>`flows discover`. 0: written, current (`check`) or printed; 1: `check` found the view stale, or a file where the view goes has no generated marker (nothing written); 2: a broken keylang.json, no code, an I/O error.
      - calls [operations.shared.empty](operations.md#operations.shared.empty), [operations.discover.discoveryOf](operations.md#operations.discover.discoveryOf), [operations.discover-names.nameProcesses](operations.md#operations.discover-names.nameProcesses), [operations.discover.extraGenerated](operations.md#operations.discover.extraGenerated), [operations.discover.readOrNull](operations.md#operations.discover.readOrNull), [base.safe-write.isGeneratedText](base.md#base.safe-write.isGeneratedText), [features.discover.discoverySummary](features.md#features.discover.discoverySummary), [base.diag.errorText](base.md#base.diag.errorText), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic), [base.safe-write.landing](base.md#base.safe-write.landing)
    - fn [runFlowsAdopt](../../src/operations/discover.ts#L132) (request: FlowsAdoptRequest, context: OperationContext) → Promise<OperationEnvelope<"flows-adopt">>
      <a id="operations.discover.runFlowsAdopt"></a><br>`flows adopt <name> [--into <spec.md>]`. 0: the proposal is written; 1: a proposal for the target is waiting (`pending: refuse`) or the inputs changed meanwhile; 2: no discovered flow of that name, a flow already specified by hand, a target a proposal may not change, an I/O…
      - calls [operations.shared.empty](operations.md#operations.shared.empty), [operations.discover.discoveryOf](operations.md#operations.discover.discoveryOf), [features.discover.adoptedFlow](features.md#features.discover.adoptedFlow), [operations.shared.generatedIn](operations.md#operations.shared.generatedIn), [map.map.sourceInputs](map.md#map.map.sourceInputs), [operations.draft.flowCandidate](operations.md#operations.draft.flowCandidate), [base.diag.errorText](base.md#base.diag.errorText), [operations.shared.proposalRefusal](operations.md#operations.shared.proposalRefusal), [operations.shared.commitProposal](operations.md#operations.shared.commitProposal)
    - fn [extraGenerated](../../src/operations/discover.ts#L175) (dir: string, files: ReadonlyMap<string, string>) → string[] <!-- internal -->
      <a id="operations.discover.extraGenerated"></a><br>Generated `.md` files in `dir` the view no longer has: never the README of the processes, which only `--names` writes. Sorted.
      - calls [base.safe-write.isGeneratedText](base.md#base.safe-write.isGeneratedText), [operations.discover.readOrNull](operations.md#operations.discover.readOrNull)
    - fn [readOrNull](../../src/operations/discover.ts#L182) (abs: string) → string | null <!-- internal -->
      <a id="operations.discover.readOrNull"></a>
  - module [doctor](../../src/operations/doctor.ts#L1)
    <a id="operations.doctor"></a><br>`keylang doctor`: the environment report — languages, the agent and its credentials, the agent CLIs, saved explanations, voice — never a key value.
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - diag [base.diag](base.md#base.diag)
    - explain-llm [features.explain-llm](features.md#features.explain-llm)
    - agent-cli [features.agent-cli](features.md#features.agent-cli)
    - types [operations.types](operations.md#operations.types)
    - shared [operations.shared](operations.md#operations.shared)
    - llm [features.llm](features.md#features.llm)
    - voice-local [features.voice-local](features.md#features.voice-local)
    - voice [features.voice](features.md#features.voice)
    - fn [runDoctor](../../src/operations/doctor.ts#L21) (request: DoctorRequest, context: OperationContext) → Promise<OperationEnvelope<"doctor">>
      <a id="operations.doctor.runDoctor"></a><br>`keylang doctor` on the saved keylang.json: the languages, the agent and its credentials, the agent CLIs, the saved explanations and voice (code 0). A relative root or a broken keylang.json is 2.
      - calls [operations.shared.empty](operations.md#operations.shared.empty), [base.config.loadConfig](base.md#base.config.loadConfig), [base.diag.errorText](base.md#base.diag.errorText), [operations.doctor.agentState](operations.md#operations.doctor.agentState), [features.agent-cli.probeAgentClis](features.md#features.agent-cli.probeAgentClis), [operations.doctor.engineState](operations.md#operations.doctor.engineState), [features.explain-llm.oldExplanations](features.md#features.explain-llm.oldExplanations), [features.explain-llm.explainedIds](features.md#features.explain-llm.explainedIds), [features.explain-llm.moveHint](features.md#features.explain-llm.moveHint), [operations.doctor.doctorLines](operations.md#operations.doctor.doctorLines)
    - fn [agentState](../../src/operations/doctor.ts#L76) (config: Config, llmClient: (agent: string | null, options: LlmClientOptions) => LlmSetup) → Promise<DoctorPayload["agent"]> <!-- internal -->
      <a id="operations.doctor.agentState"></a><br>The effective agent, its source and its credential or binary state, without the key value.
      - calls [features.agent-cli.resolveAgent](features.md#features.agent-cli.resolveAgent), [base.diag.errorText](base.md#base.diag.errorText), [features.agent-cli.cliVersion](features.md#features.agent-cli.cliVersion)
    - fn [engineState](../../src/operations/doctor.ts#L99) ( config: Config, nativeAvailable: boolean, voiceEngine: (config: Config["voice"], localAvailable: boolean) => VoiceEngine, ) → { resolved: DoctorPayload["voice"]["resolved"]; missing: string | null; error: string | null } <!-- internal -->
      <a id="operations.doctor.engineState"></a><br>The engine the voice configuration resolves to now, without the key.
      - calls [base.diag.errorText](base.md#base.diag.errorText)
    - fn [doctorLines](../../src/operations/doctor.ts#L116) (payload: DoctorPayload) → string[] <!-- internal -->
      <a id="operations.doctor.doctorLines"></a><br>The report lines, exactly as the CLI prints them; the payload carries the data.
  - module [draft](../../src/operations/draft.ts#L1)
    <a id="operations.draft"></a><br>Drafts of specs from the code, by the snapshot's edges or by a model, written only as proposals: `draft flow`, `draft rules`, `draft map` (printed only) and `code-to-spec`.
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - config [base.config](base.md#base.config)
    - diag [base.diag](base.md#base.diag)
    - files [lang.files](lang.md#lang.files)
    - ir [lang.ir](lang.md#lang.ir)
    - parser [lang.parser](lang.md#lang.parser)
    - proposals [features.proposals](features.md#features.proposals)
    - draft [features.draft](features.md#features.draft)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - trace-evidence [check.trace-evidence](check.md#check.trace-evidence)
    - stats [features.stats](features.md#features.stats)
    - map [map.map](map.md#map.map)
    - scc [check.scc](check.md#check.scc)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - git-changes [features.git-changes](features.md#features.git-changes)
    - types [operations.types](operations.md#operations.types)
    - shared [operations.shared](operations.md#operations.shared)
    - llm [features.llm](features.md#features.llm)
    - draft-llm [features.draft-llm](features.md#features.draft-llm)
    - fn [flowCandidate](../../src/operations/draft.ts#L33) (root: string, specDir: string, generated: (path: string) => boolean, draft: FlowDraft, into?: string) → FlowCandidate
      <a id="operations.draft.flowCandidate"></a><br>The candidate of `draft` for its target: `into`, else `<specDir>/flows/<name>.md`. A target a proposal may not change is named and not read; otherwise the text on disk and the waiting proposal are read once, here, and `withFlow` keeps the target's other sections.
      - calls [base.config.toPosix](base.md#base.config.toPosix), [features.proposals.proposalProblem](features.md#features.proposals.proposalProblem), [lang.files.existingText](lang.md#lang.files.existingText), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [features.draft.withFlow](features.md#features.draft.withFlow)
    - fn [runDraftFlow](../../src/operations/draft.ts#L59) (request: DraftFlowRequest, context: OperationContext) → Promise<OperationEnvelope<"draft-flow">>
      <a id="operations.draft.runDraftFlow"></a><br>`keylang draft flow <trigger> [--mode algo|llm|hybrid]`. Compute: the analysis of the saved files (nothing persisted), the trigger must be a fn, then the draft — `draftFlow`, or the model's (`llm`; `hybrid`, which drafts as algo with a note when no model is configured) — then…
      - calls [operations.shared.empty](operations.md#operations.shared.empty), [base.diag.errorText](base.md#base.diag.errorText), [map.map.sourceInputs](map.md#map.map.sourceInputs), [operations.draft.traceDraft](operations.md#operations.draft.traceDraft), [features.draft.draftFlow](features.md#features.draft.draftFlow), [operations.shared.modelSetup](operations.md#operations.shared.modelSetup), [operations.shared.rootRelative](operations.md#operations.shared.rootRelative), [operations.shared.generatedIn](operations.md#operations.shared.generatedIn), [operations.draft.flowCandidate](operations.md#operations.draft.flowCandidate), [operations.shared.proposalRefusal](operations.md#operations.shared.proposalRefusal), [operations.draft.modelDraft](operations.md#operations.draft.modelDraft), [features.draft.withFlow](features.md#features.draft.withFlow), [operations.draft.draftCountsText](operations.md#operations.draft.draftCountsText), [operations.draft.draftNotes](operations.md#operations.draft.draftNotes), [operations.shared.commitProposal](operations.md#operations.shared.commitProposal), [operations.draft.countProposed](operations.md#operations.draft.countProposed)
    - fn [rulesCandidate](../../src/operations/draft.ts#L164) (root: string, specDir: string, generated: (path: string) => boolean, rules: string, into?: string) → RulesCandidate
      <a id="operations.draft.rulesCandidate"></a><br>The candidate of the drafted `rules` for its target: `into`, else `<specDir>/rules.md`. As `flowCandidate`: a target a proposal may not change is named and not read; otherwise the text on disk and the waiting proposal are read once, here, and `withRules` keeps the target's text.
      - calls [base.config.toPosix](base.md#base.config.toPosix), [features.proposals.proposalProblem](features.md#features.proposals.proposalProblem), [lang.files.existingText](lang.md#lang.files.existingText), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [features.draft.withRules](features.md#features.draft.withRules)
    - fn [runDraftRules](../../src/operations/draft.ts#L185) (request: DraftRulesRequest, context: OperationContext) → Promise<OperationEnvelope<"draft-rules">>
      <a id="operations.draft.runDraftRules"></a><br>`keylang draft rules [--mode algo|llm|hybrid]`. Compute: the analysis of the saved files (nothing persisted), the algo rules from the module graph and its cycles, then — for a model mode with a model — the model's rules, each checked alone against the snapshot.
      - calls [operations.shared.empty](operations.md#operations.shared.empty), [base.diag.errorText](base.md#base.diag.errorText), [map.map.sourceInputs](map.md#map.map.sourceInputs), [check.scc.stronglyConnected](check.md#check.scc.stronglyConnected), [features.draft.draftRules](features.md#features.draft.draftRules), [operations.shared.modelSetup](operations.md#operations.shared.modelSetup), [operations.shared.rootRelative](operations.md#operations.shared.rootRelative), [operations.shared.generatedIn](operations.md#operations.shared.generatedIn), [operations.draft.rulesCandidate](operations.md#operations.draft.rulesCandidate), [base.config.toPosix](base.md#base.config.toPosix), [operations.shared.proposalRefusal](operations.md#operations.shared.proposalRefusal), [operations.draft.rulesCountText](operations.md#operations.draft.rulesCountText), [features.draft.withRules](features.md#features.draft.withRules), [operations.draft.draftCountsText](operations.md#operations.draft.draftCountsText), [operations.shared.commitProposal](operations.md#operations.shared.commitProposal), [operations.draft.countProposed](operations.md#operations.draft.countProposed)
    - fn [runDraftLayout](../../src/operations/draft.ts#L289) (request: DraftLayoutRequest, context: OperationContext) → Promise<OperationEnvelope<"draft-layout">>
      <a id="operations.draft.runDraftLayout"></a><br>`keylang draft map [--mode algo|llm|hybrid]`. The saved keylang.json (or the inferred one without it) first: invalid, it fails (2) as the CLI does.
      - calls [operations.shared.empty](operations.md#operations.shared.empty), [base.config.loadConfig](base.md#base.config.loadConfig), [base.diag.errorText](base.md#base.diag.errorText), [operations.shared.modelSetup](operations.md#operations.shared.modelSetup), [base.config.guessLayout](base.md#base.config.guessLayout), [base.config.configToJson](base.md#base.config.configToJson)
    - type [CodeDrafted](../../src/operations/draft.ts#L338) <!-- internal -->
      <a id="operations.draft.CodeDrafted"></a><br>What code-to-spec drafted from its source, before the target is read.
    - fn [codeToSpecCandidate](../../src/operations/draft.ts#L353) (root: string, specDir: string, generated: (path: string) => boolean, drafted: CodeDrafted, target: string) → CodeToSpecCandidate
      <a id="operations.draft.codeToSpecCandidate"></a><br>The candidate of the flows drafted from code for `target`. As `flowCandidate`: a target a proposal may not change is named and not read; otherwise the text on disk and the waiting proposal are read once, here, and `withFlow` merges every flow into it in order.
      - calls [operations.draft.codePosition](operations.md#operations.draft.codePosition), [features.proposals.proposalProblem](features.md#features.proposals.proposalProblem), [lang.files.existingText](lang.md#lang.files.existingText), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [operations.draft.mergedFlows](operations.md#operations.draft.mergedFlows)
    - fn [mergedFlows](../../src/operations/draft.ts#L364) (before: string | null, drafts: readonly FlowDraft[]) → string | null <!-- internal -->
      <a id="operations.draft.mergedFlows"></a><br>The target's text with each flow merged by `withFlow`, in order.
      - calls [features.draft.withFlow](features.md#features.draft.withFlow)
    - fn [codePosition](../../src/operations/draft.ts#L371) (drafted: CodeDrafted, target: string) → Pick<CodeToSpecCandidate, "file" | "line" | "since" | "name" | "flows" | "print" | "target"> <!-- internal -->
      <a id="operations.draft.codePosition"></a><br>The drafted flows as a candidate shows them, before the target is read.
    - fn [describedIds](../../src/operations/draft.ts#L377) (docs: readonly Document[]) → Set<string> <!-- internal -->
      <a id="operations.draft.describedIds"></a><br>The IDs the hand-written flows name: a changed fn among them already has a flow to review.
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [runCodeToSpec](../../src/operations/draft.ts#L408) (request: CodeToSpecRequest, context: OperationContext) → Promise<OperationEnvelope<"code-to-spec">>
      <a id="operations.draft.runCodeToSpec"></a><br>`keylang code-to-spec <path[:line]> | --since <ref> [--mode]`. Compute: the analysis of the saved files (nothing persisted), then the source — a position (`codeToSpec`: a line outside every fn, a file without a fn of the snapshot or without an exported one is 2 with the CLI's…
      - calls [operations.shared.empty](operations.md#operations.shared.empty), [base.diag.errorText](base.md#base.diag.errorText), [map.map.sourceInputs](map.md#map.map.sourceInputs), [features.draft.changedFlows](features.md#features.draft.changedFlows), [features.git-changes.gitChangedLines](features.md#features.git-changes.gitChangedLines), [operations.draft.describedIds](operations.md#operations.draft.describedIds), [features.draft.codeToSpec](features.md#features.draft.codeToSpec), [operations.shared.modelSetup](operations.md#operations.shared.modelSetup), [operations.shared.rootRelative](operations.md#operations.shared.rootRelative), [operations.shared.generatedIn](operations.md#operations.shared.generatedIn), [base.config.toPosix](base.md#base.config.toPosix), [operations.draft.codeToSpecCandidate](operations.md#operations.draft.codeToSpecCandidate), [operations.draft.codePosition](operations.md#operations.draft.codePosition), [operations.draft.codeSummary](operations.md#operations.draft.codeSummary), [operations.shared.proposalRefusal](operations.md#operations.shared.proposalRefusal), [operations.draft.modelFlows](operations.md#operations.draft.modelFlows), [operations.draft.mergedFlows](operations.md#operations.draft.mergedFlows), [operations.shared.commitProposal](operations.md#operations.shared.commitProposal), [operations.draft.countProposed](operations.md#operations.draft.countProposed)
    - fn [codeSummary](../../src/operations/draft.ts#L525) (flows: readonly CodeFlow[], model: CodeModelInfo | null) → string <!-- internal -->
      <a id="operations.draft.codeSummary"></a><br>`2 flow(s), 6 step(s)` for algo; `2 flow(s), 3 agree, 1 llm-only` for a model draft.
      - calls [operations.draft.draftCountsText](operations.md#operations.draft.draftCountsText)
    - fn [modelFlows](../../src/operations/draft.ts#L536) ( request: CodeToSpecRequest, mode: "llm" | "hybrid", analyzed: Analysis, client: LlmClient, algo: readonly FlowDraft[], notes: OperationMessage[], context: OperationContext, ) → Promise<{ drafts: FlowDraft[]; model: CodeModelInfo } | { error: string } | { cancelled: true }> <!-- internal -->
      <a id="operations.draft.modelFlows"></a><br>The model's draft of each flow in turn, judged against the snapshot. The notes of each answer (unknown IDs, dropped lines) join `notes` as it comes, as the CLI prints them.
      - calls [operations.draft.flowSteps](operations.md#operations.draft.flowSteps), [base.diag.errorText](base.md#base.diag.errorText)
    - fn [rulesCountText](../../src/operations/draft.ts#L570) (rules: string) → string <!-- internal -->
      <a id="operations.draft.rulesCountText"></a><br>`2 rule(s)`: the list items of a drafted `# rules` section.
    - fn [countProposed](../../src/operations/draft.ts#L575) (root: string, counts: Record<DraftStatus, number>) → string | null <!-- internal -->
      <a id="operations.draft.countProposed"></a><br>The drafted lines count as proposed once the proposal exists; a count that cannot be written never fails the draft: its error, or null.
      - calls [features.stats.updateStats](features.md#features.stats.updateStats), [features.stats.addDrafts](features.md#features.stats.addDrafts), [base.diag.errorText](base.md#base.diag.errorText)
    - fn [modelDraft](../../src/operations/draft.ts#L585) (request: DraftFlowRequest, mode: "llm" | "hybrid", analyzed: Analysis, client: LlmClient, context: OperationContext) → Promise<{ draft: FlowDraft; model: DraftModelInfo } | { error: string } | { cancelled: true }> <!-- internal -->
      <a id="operations.draft.modelDraft"></a><br>The model's draft, judged against the snapshot; a Cancel during its answer is `cancelled`, never an error.
      - calls [operations.draft.flowSteps](operations.md#operations.draft.flowSteps), [base.diag.errorText](base.md#base.diag.errorText)
    - fn [flowSteps](../../src/operations/draft.ts#L603) (text: string, trigger: string) → string[] <!-- internal -->
      <a id="operations.draft.flowSteps"></a><br>The IDs of a drafted flow's trigger and steps in the order they stand, the requested trigger first.
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [draftCountsText](../../src/operations/draft.ts#L615) (counts: Record<string, number>) → string <!-- internal -->
      <a id="operations.draft.draftCountsText"></a><br>`2 agree, 1 llm-only`: the statuses that occur, as the CLI names a model draft.
    - fn [draftNotes](../../src/operations/draft.ts#L620) (payload: DraftFlowPayload) → OperationMessage[] <!-- internal -->
      <a id="operations.draft.draftNotes"></a><br>What the draft's text does not show, as the CLI's stderr notes: the fallback, unknown IDs, dropped lines.
    - fn [traceDraft](../../src/operations/draft.ts#L635) (root: string, snapshot: AnalysisSnapshot, fromTrace: { file: string; run?: string }, name: string | undefined) → { draft: FlowDraft; notes: OperationMessage[] } | { error: string } <!-- internal -->
      <a id="operations.draft.traceDraft"></a><br>The draft of one run of `fromTrace.file` (`draftFlowFromTrace`): the run `fromTrace.run` names (its `runId`), else the file's one run with spans. A file with several, a run id that matches none or several runs, or an unreadable trace is an error naming what there is to choose…
      - calls [check.trace-evidence.loadTraces](check.md#check.trace-evidence.loadTraces), [base.diag.errorText](base.md#base.diag.errorText), [features.draft.draftFlowFromTrace](features.md#features.draft.draftFlowFromTrace)
  - module [entries](../../src/operations/entries.ts#L1)
    <a id="operations.entries"></a><br>`keylang entries [--kind k]`, the MCP tool `list_entries` and the TUI's «Entry points»: the entry points of the current snapshot (ADR 0022 п. 5), read-only. One text for the CLI's table and the F6 report, one JSON shape for `--json` and MCP.
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - diag [base.diag](base.md#base.diag)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - shared [operations.shared](operations.md#operations.shared)
    - types [operations.types](operations.md#operations.types)
    - fn [runEntries](../../src/operations/entries.ts#L23) (request: EntriesRequest, context: OperationContext) → Promise<OperationEnvelope<"entries">>
      <a id="operations.entries.runEntries"></a><br>The entry points of a fresh snapshot of the saved code, optionally one kind. Code 0 with the list (empty included: nothing to find is no failure); 2 with no payload for a broken keylang.json or a repository without code to read.
      - calls [operations.shared.empty](operations.md#operations.shared.empty), [base.diag.errorText](base.md#base.diag.errorText), [operations.entries.entriesText](operations.md#operations.entries.entriesText)
    - fn [entriesText](../../src/operations/entries.ts#L42) (entries: readonly EntryPoint[], kind: EntryPoint["kind"] | null = null) → string
      <a id="operations.entries.entriesText"></a><br>The table `keylang entries` prints: `kind · label · id · file:line`, aligned; or the note and the hint when there is nothing.
  - module [explain](../../src/operations/explain.ts#L1)
    <a id="operations.explain"></a><br>The explanations of a node: the offline help and summary (`explain`), one answer of the model (`explain --llm`), what needs explaining (`explain --stale`, the plan of a brief batch) and the batch itself.
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - diag [base.diag](base.md#base.diag)
    - explain-llm [features.explain-llm](features.md#features.explain-llm)
    - agent-cli [features.agent-cli](features.md#features.agent-cli)
    - explain-inventory [features.explain-inventory](features.md#features.explain-inventory)
    - explain-node [features.explain-node](features.md#features.explain-node)
    - explain-offline [features.explain-offline](features.md#features.explain-offline)
    - explanations [map.explanations](map.md#map.explanations)
    - files [lang.files](lang.md#lang.files)
    - map [map.map](map.md#map.map)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - span [base.span](base.md#base.span)
    - types [operations.types](operations.md#operations.types)
    - shared [operations.shared](operations.md#operations.shared)
    - llm [features.llm](features.md#features.llm)
    - fn [runExplain](../../src/operations/explain.ts#L29) (request: ExplainRequest, context: OperationContext) → Promise<OperationEnvelope<"explain">>
      <a id="operations.explain.runExplain"></a><br>`keylang explain <code|id>` offline. A code needs no analysis: its help, or failed 2 `unknown code`.
      - calls [operations.shared.empty](operations.md#operations.shared.empty), [features.explain-offline.isDiagnosticCode](features.md#features.explain-offline.isDiagnosticCode), [features.explain-offline.codeExplanation](features.md#features.explain-offline.codeExplanation), [features.explain-offline.offlineExplanationText](features.md#features.explain-offline.offlineExplanationText), [map.analyze.analyze](map.md#map.analyze.analyze), [base.diag.errorText](base.md#base.diag.errorText), [features.explain-llm.oldExplanations](features.md#features.explain-llm.oldExplanations), [features.explain-llm.moveHint](features.md#features.explain-llm.moveHint), [features.explain-offline.nodeExplanation](features.md#features.explain-offline.nodeExplanation), [features.explain-offline.unknownIdMessage](features.md#features.explain-offline.unknownIdMessage)
    - fn [runExplainLlm](../../src/operations/explain.ts#L77) (request: ExplainLlmRequest, context: OperationContext) → Promise<OperationEnvelope<"explain-llm">>
      <a id="operations.explain.runExplainLlm"></a><br>`keylang explain <id> --llm`. The analysis of the saved files (no evidence, nothing persisted); an unknown ID is 2 with the CLI's message.
      - calls [operations.shared.empty](operations.md#operations.shared.empty), [features.explain-offline.isDiagnosticCode](features.md#features.explain-offline.isDiagnosticCode), [base.diag.errorText](base.md#base.diag.errorText), [features.explain-llm.oldExplanations](features.md#features.explain-llm.oldExplanations), [features.explain-llm.moveHint](features.md#features.explain-llm.moveHint), [features.explain-offline.nodeExplanation](features.md#features.explain-offline.nodeExplanation), [features.explain-offline.unknownIdMessage](features.md#features.explain-offline.unknownIdMessage), [map.explanations.explanationPath](map.md#map.explanations.explanationPath), [lang.files.readTextOrNull](lang.md#lang.files.readTextOrNull), [features.explain-llm.readExplanation](features.md#features.explain-llm.readExplanation), [features.explain-offline.savedAnswer](features.md#features.explain-offline.savedAnswer), [features.explain-offline.savedAnswerMiss](features.md#features.explain-offline.savedAnswerMiss), [features.agent-cli.selectedAgent](features.md#features.agent-cli.selectedAgent), [features.explain-offline.savedAnswerText](features.md#features.explain-offline.savedAnswerText), [features.explain-node.formatSummary](features.md#features.explain-node.formatSummary), [map.map.sourceInputs](map.md#map.map.sourceInputs), [operations.shared.specHashes](operations.md#operations.shared.specHashes), [features.explain-llm.explanationRequest](features.md#features.explain-llm.explanationRequest), [map.explanations.loadBriefs](map.md#map.explanations.loadBriefs), [features.explain-llm.briefText](features.md#features.explain-llm.briefText), [features.explain-llm.answerText](features.md#features.explain-llm.answerText), [features.explain-llm.currentBaseline](features.md#features.explain-llm.currentBaseline), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [map.explanations.explainDir](map.md#map.explanations.explainDir), [map.map.sourceInputProblems](map.md#map.map.sourceInputProblems), [operations.shared.specProblems](operations.md#operations.shared.specProblems), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic), [base.safe-write.landing](base.md#base.safe-write.landing), [map.explanations.formatStoredExplanation](map.md#map.explanations.formatStoredExplanation)
    - fn [runExplainPlan](../../src/operations/explain.ts#L203) (request: ExplainPlanRequest, context: OperationContext) → Promise<OperationEnvelope<"explain-plan">>
      <a id="operations.explain.runExplainPlan"></a><br>`explain --stale` and the plan of `explain --missing|--stale` (with `--dry-run` its estimate) on a fresh analysis of the saved code and specs (no evidence, no fact cache written). A brief plan needs a snapshot: failed 2 with the CLI's message without one.
      - calls [operations.shared.empty](operations.md#operations.shared.empty), [map.analyze.analyze](map.md#map.analyze.analyze), [base.diag.errorText](base.md#base.diag.errorText), [features.explain-llm.oldExplanations](features.md#features.explain-llm.oldExplanations), [features.explain-llm.moveHint](features.md#features.explain-llm.moveHint), [features.explain-inventory.staleInventory](features.md#features.explain-inventory.staleInventory), [features.explain-inventory.staleInventoryText](features.md#features.explain-inventory.staleInventoryText), [features.explain-inventory.briefPlan](features.md#features.explain-inventory.briefPlan), [features.explain-inventory.defaultBriefJobs](features.md#features.explain-inventory.defaultBriefJobs), [features.agent-cli.selectedAgent](features.md#features.agent-cli.selectedAgent), [features.explain-inventory.briefPlanText](features.md#features.explain-inventory.briefPlanText)
    - fn [explainBatchText](../../src/operations/explain.ts#L237) (payload: Pick<ExplainBatchPayload, "done" | "failed" | "plan">) → string <!-- internal -->
      <a id="operations.explain.explainBatchText"></a><br>`explained 5 of 6 node(s)` and `failed: <id>: <reason>` lines: the CLI's stdout of a batch.
    - fn [runExplainBatch](../../src/operations/explain.ts#L260) (request: ExplainBatchRequest, context: OperationContext) → Promise<OperationEnvelope<"explain-batch">>
      <a id="operations.explain.runExplainBatch"></a><br>`explain --missing|--stale --llm`. Compute: limit and jobs as the CLI checks them (2), a fresh analysis of the saved files (no snapshot is 2 with the CLI's message), the plan (`briefPlan`; empty is `nothing to explain`, 0, no model needed), the model (none is 2).
      - calls [operations.shared.empty](operations.md#operations.shared.empty), [base.diag.errorText](base.md#base.diag.errorText), [features.explain-llm.oldExplanations](features.md#features.explain-llm.oldExplanations), [features.explain-llm.moveHint](features.md#features.explain-llm.moveHint), [features.explain-inventory.defaultBriefJobs](features.md#features.explain-inventory.defaultBriefJobs), [features.agent-cli.selectedAgent](features.md#features.agent-cli.selectedAgent), [features.explain-inventory.briefPlan](features.md#features.explain-inventory.briefPlan), [map.map.sourceInputs](map.md#map.map.sourceInputs), [operations.shared.specHashes](operations.md#operations.shared.specHashes), [map.map.sourceInputProblems](map.md#map.map.sourceInputProblems), [operations.shared.specProblems](operations.md#operations.shared.specProblems), [map.explanations.explanationPath](map.md#map.explanations.explanationPath), [lang.files.readTextOrNull](lang.md#lang.files.readTextOrNull), [map.explanations.loadBriefs](map.md#map.explanations.loadBriefs), [features.explain-llm.briefRequest](features.md#features.explain-llm.briefRequest), [features.explain-llm.briefText](features.md#features.explain-llm.briefText), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [map.explanations.explainDir](map.md#map.explanations.explainDir), [map.explanations.systemBaseline](map.md#map.explanations.systemBaseline), [features.explain-llm.currentBaseline](features.md#features.explain-llm.currentBaseline), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic), [base.safe-write.landing](base.md#base.safe-write.landing), [map.explanations.formatStoredExplanation](map.md#map.explanations.formatStoredExplanation), [base.span.compareText](base.md#base.span.compareText), [operations.explain.explainBatchText](operations.md#operations.explain.explainBatchText)
  - module [export](../../src/operations/export.ts#L1)
    <a id="operations.export"></a><br>Exports: a finished report saved to one file, and a C4 diagram of the saved code (`export c4`).
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - c4-export [map.c4-export](map.md#map.c4-export)
    - check-format [features.check-format](features.md#features.check-format)
    - config [base.config](base.md#base.config)
    - diag [base.diag](base.md#base.diag)
    - explanations [map.explanations](map.md#map.explanations)
    - files [lang.files](lang.md#lang.files)
    - parse-format [lang.parse-format](lang.md#lang.parse-format)
    - fact-cache [map.fact-cache](map.md#map.fact-cache)
    - proposals [features.proposals](features.md#features.proposals)
    - map [map.map](map.md#map.map)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - trace-plan [map.trace-plan](map.md#map.trace-plan)
    - types [operations.types](operations.md#operations.types)
    - shared [operations.shared](operations.md#operations.shared)
    - fn [exportFormatOf](../../src/operations/export.ts#L23) (source: ExportSource) → ExportFormat
      <a id="operations.export.exportFormatOf"></a><br>The format of an export: an explained edge has only the human lines, a trace plan only its JSON.
    - fn [exportText](../../src/operations/export.ts#L28) (source: ExportSource) → string
      <a id="operations.export.exportText"></a><br>The bytes an export writes: the CLI's stdout for the same report.
      - calls [features.check-format.checkReportText](features.md#features.check-format.checkReportText), [lang.parse-format.parseReportText](lang.md#lang.parse-format.parseReportText), [map.trace-plan.tracePlanText](map.md#map.trace-plan.tracePlanText)
    - fn [exportTargetProblem](../../src/operations/export.ts#L44) (root: string, path: string, dir: string = savedSpecDir(root)) → string | null
      <a id="operations.export.exportTargetProblem"></a><br>Why `path` cannot receive an export, or null: the write policy of every repository write (plain, relative, inside through links, no directory, no file with a generation marker) and the artifacts generators own — the map, the explained map, the index, the fact cache and the…
      - calls [operations.export.savedSpecDir](operations.md#operations.export.savedSpecDir), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [base.safe-write.landing](base.md#base.safe-write.landing), [base.config.toPosix](base.md#base.config.toPosix)
    - fn [savedSpecDir](../../src/operations/export.ts#L61) (root: string) → string <!-- internal -->
      <a id="operations.export.savedSpecDir"></a><br>The spec directory of the saved keylang.json as `loadConfig` reads it — the same parser, so `./keylang` and `keylang/` are `keylang` — and `keylang` without the file or with one that does not validate (as the TUI's own).
      - calls [base.config.parseConfig](base.md#base.config.parseConfig)
    - fn [runExport](../../src/operations/export.ts#L78) (request: ExportRequest, context: OperationContext) → Promise<OperationEnvelope<"export">>
      <a id="operations.export.runExport"></a><br>Exports a finished report to one file. Nothing is computed again: the text is the CLI's stdout for the request's report.
      - calls [operations.shared.empty](operations.md#operations.shared.empty), [operations.export.exportText](operations.md#operations.export.exportText), [operations.export.exportFormatOf](operations.md#operations.export.exportFormatOf), [base.diag.errorText](base.md#base.diag.errorText), [operations.export.exportTargetProblem](operations.md#operations.export.exportTargetProblem), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [base.safe-write.landing](base.md#base.safe-write.landing), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic)
    - fn [c4OutProblem](../../src/operations/export.ts#L132) (root: string, out: string) → string | null
      <a id="operations.export.c4OutProblem"></a><br>Why `out` (as typed: relative to the root, or absolute) cannot receive a diagram, the CLI's message, or null. The path policy of every write — plain, relative, inside the repository through links, not a directory — is checked before the target is read, as `wireOutProblem` does…
      - calls [operations.shared.rootRelative](operations.md#operations.shared.rootRelative), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [base.diag.errorText](base.md#base.diag.errorText)
    - fn [runExportC4](../../src/operations/export.ts#L149) (request: ExportC4Request, context: OperationContext) → Promise<OperationEnvelope<"export-c4">>
      <a id="operations.export.runExportC4"></a><br>`keylang export c4` (c4-zoom/12): the diagram of the saved code and the saved briefs, no model. With `out` it is written to that file, which must pass the write policy (`c4OutProblem`, checked before the file is read) and be new or a diagram this command wrote (its marker…
      - calls [operations.shared.empty](operations.md#operations.shared.empty), [operations.export.c4OutProblem](operations.md#operations.export.c4OutProblem), [base.diag.errorText](base.md#base.diag.errorText), [map.explanations.loadBriefs](map.md#map.explanations.loadBriefs), [map.explanations.explanationOf](map.md#map.explanations.explanationOf), [map.c4-export.renderC4](map.md#map.c4-export.renderC4), [operations.shared.rootRelative](operations.md#operations.shared.rootRelative), [lang.files.existingText](lang.md#lang.files.existingText), [map.c4-export.isC4Diagram](map.md#map.c4-export.isC4Diagram), [base.safe-write.safeWrite](base.md#base.safe-write.safeWrite)
  - module [feature](../../src/operations/feature.ts#L1)
    <a id="operations.feature"></a><br>Feature readiness: the status of a feature file (`keylang feature`) and the open questions a model proposes for it (c4-zoom/11).
    - node [external.node](external.md#external.node)
    - agent-context [features.agent-context](features.md#features.agent-context)
    - analyze [map.analyze](map.md#map.analyze)
    - config [base.config](base.md#base.config)
    - diag [base.diag](base.md#base.diag)
    - files [lang.files](lang.md#lang.files)
    - proposals [features.proposals](features.md#features.proposals)
    - feature-status [features.feature-status](features.md#features.feature-status)
    - map [map.map](map.md#map.map)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - git-changes [features.git-changes](features.md#features.git-changes)
    - types [operations.types](operations.md#operations.types)
    - shared [operations.shared](operations.md#operations.shared)
    - llm [features.llm](features.md#features.llm)
    - fn [featureSlugOf](../../src/operations/feature.ts#L23) (path: string, dir: string) → string | null
      <a id="operations.feature.featureSlugOf"></a><br>The slug of `path` when it is a feature file `<dir>/features/<slug>.md`, else null.
      - calls [base.config.specPath](base.md#base.config.specPath)
    - fn [runFeature](../../src/operations/feature.ts#L37) (request: FeatureRequest, context: OperationContext) → Promise<OperationEnvelope<"feature">>
      <a id="operations.feature.runFeature"></a><br>The feature status of the saved files. It never takes unsaved text: a caller with dirty buffers saves them first, explicitly.
      - calls [operations.shared.empty](operations.md#operations.shared.empty), [base.config.loadConfig](base.md#base.config.loadConfig), [base.diag.errorText](base.md#base.diag.errorText), [base.config.specPath](base.md#base.config.specPath), [features.git-changes.readFeatureBase](features.md#features.git-changes.readFeatureBase), [operations.feature.featureReportOf](operations.md#operations.feature.featureReportOf), [operations.feature.gapLine](operations.md#operations.feature.gapLine), [operations.feature.hintLine](operations.md#operations.feature.hintLine), [operations.feature.featureSummary](operations.md#operations.feature.featureSummary)
    - fn [featureReportOf](../../src/operations/feature.ts#L83) (analyzed: Analysis, slug: string, base: FeatureBase) → FeatureReport | null
      <a id="operations.feature.featureReportOf"></a><br>The report of feature `slug` on one analysis and its base: the CLI's `feature`, MCP `feature_status`, and the TUI's status line on the session's analysis. What changed since the base decides which rule fails are this change's, as `check --changed` slices them; without it every…
      - calls [features.git-changes.deletedModuleIds](features.md#features.git-changes.deletedModuleIds), [features.feature-status.featureStatus](features.md#features.feature-status.featureStatus)
    - fn [gapLine](../../src/operations/feature.ts#L106) (gap: Gap) → string
      <a id="operations.feature.gapLine"></a><br>One gap as the CLI prints it: `file:line:col: kind id: reason`.
    - fn [hintLine](../../src/operations/feature.ts#L111) (hint: Hint) → string
      <a id="operations.feature.hintLine"></a><br>One hint as the CLI prints it after the gaps: `hint: file:line:col: kind id: reason`.
    - fn [featureSummary](../../src/operations/feature.ts#L116) (report: FeatureReport) → string
      <a id="operations.feature.featureSummary"></a><br>The CLI's closing line on stderr: `done`, or `N gap(s) · stage <stage>`.
    - fn [questionLines](../../src/operations/feature.ts#L124) (answer: string) → { questions: string[]; dropped: number }
      <a id="operations.feature.questionLines"></a><br>The model's answer as questions: its `- ? <text>` lines, at most `MAX_QUESTIONS`, and how many other lines were left out.
    - fn [withQuestions](../../src/operations/feature.ts#L137) (text: string, questions: readonly string[], slug: string) → string
      <a id="operations.feature.withQuestions"></a><br>`text` with `questions` at the top level of its first flow: after the questions its item list starts with, else before its first item (after the heading and prose); a file with no flow yet gets a `# flow <slug>` with them. The rest of the file is kept as written.
    - fn [runFeatureQuestions](../../src/operations/feature.ts#L161) (request: FeatureQuestionsRequest, context: OperationContext) → Promise<OperationEnvelope<"feature-questions">>
      <a id="operations.feature.runFeatureQuestions"></a><br>«Ask the model for questions» on the feature readiness screen (c4-zoom/11): one request with the feature file and what keylang knows around its ids; the answer's `- ? …` lines, at most five, become a proposal for the file that a person accepts hunk by hunk in MERGE. Nothing is…
      - calls [operations.shared.empty](operations.md#operations.shared.empty), [base.diag.errorText](base.md#base.diag.errorText), [base.config.specPath](base.md#base.config.specPath), [operations.shared.modelSetup](operations.md#operations.shared.modelSetup), [operations.shared.rootRelative](operations.md#operations.shared.rootRelative), [operations.shared.generatedIn](operations.md#operations.shared.generatedIn), [features.proposals.proposalProblem](features.md#features.proposals.proposalProblem), [lang.files.existingText](lang.md#lang.files.existingText), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [operations.shared.proposalRefusal](operations.md#operations.shared.proposalRefusal), [map.map.sourceInputs](map.md#map.map.sourceInputs), [features.agent-context.contextText](features.md#features.agent-context.contextText), [features.agent-context.contextForIds](features.md#features.agent-context.contextForIds), [features.feature-status.idsIn](features.md#features.feature-status.idsIn), [operations.feature.questionLines](operations.md#operations.feature.questionLines), [operations.shared.commitProposal](operations.md#operations.shared.commitProposal), [operations.feature.withQuestions](operations.md#operations.feature.withQuestions)
  - module [generate](../../src/operations/generate.ts#L1)
    <a id="operations.generate"></a><br>The operations that generate files from the code: the map (`map`, `map --check`), the baseline, the harness files (`agents`), the container of `# wiring` (`wire`), and `init`, which sets a repository up with them.
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - baseline [features.baseline](features.md#features.baseline)
    - config [base.config](base.md#base.config)
    - diag [base.diag](base.md#base.diag)
    - files [lang.files](lang.md#lang.files)
    - harness [features.harness](features.md#features.harness)
    - map [map.map](map.md#map.map)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - wire-gen [map.wire-gen](map.md#map.wire-gen)
    - types [operations.types](operations.md#operations.types)
    - shared [operations.shared](operations.md#operations.shared)
    - fn [runMapCheck](../../src/operations/generate.ts#L26) (request: MapCheckRequest, context: OperationContext) → Promise<OperationEnvelope<"map-check">>
      <a id="operations.generate.runMapCheck"></a><br>`keylang map --check`: renders the map from the code and compares it with the files on disk. It writes nothing — not the map, the index, nor the fact cache (`persistFacts` stays off).
      - calls [operations.shared.empty](operations.md#operations.shared.empty), [base.diag.errorText](base.md#base.diag.errorText), [map.map.diffMap](map.md#map.map.diffMap), [base.config.toPosix](base.md#base.config.toPosix), [operations.generate.mapCheckLines](operations.md#operations.generate.mapCheckLines)
    - fn [runMap](../../src/operations/generate.ts#L69) (request: MapRequest, context: OperationContext) → Promise<OperationEnvelope<"map">>
      <a id="operations.generate.runMap"></a><br>`keylang map` in two phases. Compute: the analysis (the fact cache is prepared, not written) and a plan with the expected bytes of every target.
      - calls [operations.shared.empty](operations.md#operations.shared.empty), [base.diag.errorText](base.md#base.diag.errorText), [map.map.planMap](map.md#map.map.planMap), [operations.generate.mapConflictLines](operations.md#operations.generate.mapConflictLines), [map.map.mapPlanProblems](map.md#map.map.mapPlanProblems), [map.map.commitMap](map.md#map.map.commitMap), [operations.generate.mapStepLines](operations.md#operations.generate.mapStepLines)
    - fn [mapConflictLines](../../src/operations/generate.ts#L145) (conflicts: readonly string[], path: (file: string) => string = (file) => file) → string[]
      <a id="operations.generate.mapConflictLines"></a><br>The conflict lines `keylang map` prints: nothing is written while any exists.
    - fn [mapStepLines](../../src/operations/generate.ts#L154) (steps: readonly CommittedStep[], path: (file: string) => string = (file) => file) → string[]
      <a id="operations.generate.mapStepLines"></a><br>The lines `keylang map` prints for its completed steps of both maps: writes, then removals. The index and the fact cache are written silently, as they always were; the payload lists them.
    - fn [mapSummary](../../src/operations/generate.ts#L160) (payload: MapPayload) → string
      <a id="operations.generate.mapSummary"></a><br>The summary `keylang map` writes to stderr after a commit.
    - fn [mapCheckLines](../../src/operations/generate.ts#L177) (diff: { conflicts: readonly string[]; stale: readonly string[] }, path: (file: string) => string = (file) => file) → string[]
      <a id="operations.generate.mapCheckLines"></a><br>The lines `map --check` prints, paths as given (the CLI makes them relative to its working directory). A manual file blocks `map` itself, so with a conflict "run keylang map" would not refresh the rest: stale files are then not listed.
      - calls [operations.generate.mapConflictLines](operations.md#operations.generate.mapConflictLines)
    - fn [runBaseline](../../src/operations/generate.ts#L195) (request: BaselineRequest, context: OperationContext) → Promise<OperationEnvelope<"baseline">>
      <a id="operations.generate.runBaseline"></a><br>`keylang baseline [--check]`: the rules of the current layer graph (the rule algorithm of `baselineText`) against `<dir>/rules.baseline.md`. The analysis reads the code and the saved `keylang.json`, not the specs, and writes no fact cache.
      - calls [operations.shared.empty](operations.md#operations.shared.empty), [base.diag.errorText](base.md#base.diag.errorText), [features.baseline.planBaseline](features.md#features.baseline.planBaseline), [features.baseline.baselinePlanProblems](features.md#features.baseline.baselinePlanProblems), [features.baseline.commitBaseline](features.md#features.baseline.commitBaseline)
    - fn [runAgents](../../src/operations/generate.ts#L274) (request: AgentsRequest, context: OperationContext) → Promise<OperationEnvelope<"agents">>
      <a id="operations.generate.runAgents"></a><br>`keylang agents [--check]`: the managed harness files of the chosen harnesses (the unchanged adapters of `harness.ts`) against the disk. The whole plan is built first: a broken marker or invalid JSON/TOML fails it with code 2 naming the file, and nothing is written.
      - calls [operations.shared.empty](operations.md#operations.shared.empty), [features.harness.planAgents](features.md#features.harness.planAgents), [base.diag.errorText](base.md#base.diag.errorText), [features.harness.agentsPlanProblems](features.md#features.harness.agentsPlanProblems), [features.harness.commitAgents](features.md#features.harness.commitAgents)
    - fn [initSources](../../src/operations/generate.ts#L347) (root: string, label = ".") → { config: Config } | { error: string }
      <a id="operations.generate.initSources"></a><br>The configuration `keylang init` describes: the saved keylang.json, else the guess. An error (a broken keylang.json, no supported sources) is the reason init stops with code 2 before anything else, the harness selection included.
      - calls [base.config.loadConfig](base.md#base.config.loadConfig), [base.diag.errorText](base.md#base.diag.errorText)
    - fn [ignoresKeylangCache](../../src/operations/generate.ts#L366) (text: string) → boolean <!-- internal -->
      <a id="operations.generate.ignoresKeylangCache"></a><br>A line that ignores the root `.keylang` directory: `.keylang`, `.keylang/`, `/.keylang` or `/.keylang/`, with trailing spaces as git ignores them.
    - fn [withKeylangCacheIgnored](../../src/operations/generate.ts#L375) (current: string | null) → string <!-- internal -->
      <a id="operations.generate.withKeylangCacheIgnored"></a><br>`current` (null: no file) with the comment and `.keylang/` appended after one blank line. The bytes before stay as they are; the new lines end in CRLF only when every line of the file does.
      - calls [base.safe-write.allCrlf](base.md#base.safe-write.allCrlf)
    - type [GitignorePlan](../../src/operations/generate.ts#L385) <!-- internal -->
      <a id="operations.generate.GitignorePlan"></a><br>The `.gitignore` stage before the commit: the bytes read (null: no file), and the text to write (null: nothing to write).
    - fn [planGitignore](../../src/operations/generate.ts#L392) (root: string) → GitignorePlan <!-- internal -->
      <a id="operations.generate.planGitignore"></a><br>Reads the root `.gitignore` under the write rules (never through a link out of the repository) and plans the entry. Writes nothing.
      - calls [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [base.safe-write.landing](base.md#base.safe-write.landing), [lang.files.existingText](lang.md#lang.files.existingText), [base.diag.errorText](base.md#base.diag.errorText), [operations.generate.ignoresKeylangCache](operations.md#operations.generate.ignoresKeylangCache), [operations.generate.withKeylangCacheIgnored](operations.md#operations.generate.withKeylangCacheIgnored)
    - fn [commitGitignore](../../src/operations/generate.ts#L408) (root: string, plan: GitignorePlan) → string | null <!-- internal -->
      <a id="operations.generate.commitGitignore"></a><br>Appends the entry while the file still holds the bytes the plan read; the reason when it may not be written. Throws on an I/O error.
      - calls [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [base.safe-write.landing](base.md#base.safe-write.landing), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic)
    - fn [gitignoreCode](../../src/operations/generate.ts#L419) (stage: GitignoreStage) → 0 | 1 | 2 <!-- internal -->
      <a id="operations.generate.gitignoreCode"></a><br>The code of the `.gitignore` stage: 2 an I/O error, 1 refused or (in a check) not listed, else 0.
    - fn [gitignoreMessage](../../src/operations/generate.ts#L425) (stage: GitignoreStage) → OperationMessage | null
      <a id="operations.generate.gitignoreMessage"></a><br>The line init prints for the `.gitignore` stage; null when it was already listed.
    - fn [runInit](../../src/operations/generate.ts#L451) (request: InitRequest, context: OperationContext) → Promise<OperationEnvelope<"init">>
      <a id="operations.generate.runInit"></a><br>`keylang init [--check]`: an orchestration of the shared config, map, baseline and agents steps, not a call of the CLI commands. Before anything: the configuration (2 when it is broken or there is no supported source), then the harness plan (a broken harness file is 2 and…
      - calls [operations.shared.empty](operations.md#operations.shared.empty), [operations.generate.initSources](operations.md#operations.generate.initSources), [base.config.guessLayout](base.md#base.config.guessLayout), [operations.generate.runAgents](operations.md#operations.generate.runAgents), [operations.generate.runBaseline](operations.md#operations.generate.runBaseline), [operations.generate.planGitignore](operations.md#operations.generate.planGitignore), [operations.generate.gitignoreMessage](operations.md#operations.generate.gitignoreMessage), [operations.generate.gitignoreCode](operations.md#operations.generate.gitignoreCode), [base.diag.errorText](base.md#base.diag.errorText), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic), [base.config.configToJson](base.md#base.config.configToJson), [operations.generate.commitGitignore](operations.md#operations.generate.commitGitignore), [operations.generate.runMap](operations.md#operations.generate.runMap)
    - fn [runWire](../../src/operations/generate.ts#L570) (request: WireRequest, context: OperationContext) → Promise<OperationEnvelope<"wire">>
      <a id="operations.generate.runWire"></a><br>`keylang wire [--check]` in two phases. The path policy of `out` is checked before anything is read: a plain relative TypeScript path that stays inside the repository through links (code 2 otherwise).
      - calls [operations.shared.empty](operations.md#operations.shared.empty), [operations.generate.wireOutProblem](operations.md#operations.generate.wireOutProblem), [operations.generate.wireSpecInputs](operations.md#operations.generate.wireSpecInputs), [base.config.loadConfig](base.md#base.config.loadConfig), [base.diag.errorText](base.md#base.diag.errorText), [operations.generate.wiringErrors](operations.md#operations.generate.wiringErrors), [base.diag.formatDiagnostic](base.md#base.diag.formatDiagnostic), [map.wire-gen.generateWire](map.md#map.wire-gen.generateWire), [base.safe-write.landing](base.md#base.safe-write.landing), [lang.files.existingText](lang.md#lang.files.existingText), [map.map.sourceInputs](map.md#map.map.sourceInputs), [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [map.map.sourceInputProblems](map.md#map.map.sourceInputProblems), [operations.generate.wireSpecProblems](operations.md#operations.generate.wireSpecProblems), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic)
    - fn [wireOutProblem](../../src/operations/generate.ts#L661) (root: string, out: string) → string | null
      <a id="operations.generate.wireOutProblem"></a><br>Why `out` cannot be the generated file (the CLI's message), or null: the path policy of every write — plain, relative, inside the repository through links — and a TypeScript extension. Reads nothing outside the repository and writes nothing; a form may call it as the path is…
      - calls [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [base.diag.errorText](base.md#base.diag.errorText)
    - fn [wiringErrors](../../src/operations/generate.ts#L672) (analysis: Analysis) → Diagnostic[] <!-- internal -->
      <a id="operations.generate.wiringErrors"></a><br>Error diagnostics on the lines of a `# wiring` section, whatever their code: any of them can change what is generated.
      - calls [base.diag.isError](base.md#base.diag.isError)
    - type [WireSpecInputs](../../src/operations/generate.ts#L685) <!-- internal -->
      <a id="operations.generate.WireSpecInputs"></a><br>What the generated text depends on besides the snapshot: every saved spec (a `# wiring` section may be in any) and `tsconfig.json` (the import form).
    - fn [wireSpecInputs](../../src/operations/generate.ts#L691) (config: Config) → WireSpecInputs <!-- internal -->
      <a id="operations.generate.wireSpecInputs"></a><br>The saved specs by path (relative, POSIX) with their hash, and the root `tsconfig.json`.
      - calls [lang.files.collectMdFiles](lang.md#lang.files.collectMdFiles), [map.analyze.within](map.md#map.analyze.within), [lang.files.readTextOrNull](lang.md#lang.files.readTextOrNull), [base.config.toPosix](base.md#base.config.toPosix), [map.snapshot.sha256](map.md#map.snapshot.sha256)
    - fn [wireSpecProblems](../../src/operations/generate.ts#L707) (config: Config, before: WireSpecInputs) → string[] <!-- internal -->
      <a id="operations.generate.wireSpecProblems"></a><br>How the specs and `tsconfig.json` differ from the ones the wiring was computed from (`path: reason` lines).
      - calls [operations.generate.wireSpecInputs](operations.md#operations.generate.wireSpecInputs)
  - module [integrations](../../src/operations/integrations.ts#L1)
    <a id="operations.integrations"></a><br>`keylang integrations [--json]`, the MCP tool `list_integrations` and the TUI's «Integrations» (business-flows/14): outgoing clients, incoming webhooks and queues of the current snapshot, read-only. One text for the CLI and the F6 report, one JSON shape for `--json` and MCP.
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - diag [base.diag](base.md#base.diag)
    - discover [features.discover](features.md#features.discover)
    - integrations [features.integrations](features.md#features.integrations)
    - shared [operations.shared](operations.md#operations.shared)
    - types [operations.types](operations.md#operations.types)
    - fn [runIntegrations](../../src/operations/integrations.ts#L20) (request: IntegrationsRequest, context: OperationContext) → Promise<OperationEnvelope<"integrations">>
      <a id="operations.integrations.runIntegrations"></a><br>The inventory over a fresh snapshot of the saved code and the hand-written specs. Code 0 with the inventory (empty included); 2 with no payload for a broken keylang.json, a repository without code, or an unreadable data file.
      - calls [operations.shared.empty](operations.md#operations.shared.empty), [base.diag.errorText](base.md#base.diag.errorText), [features.integrations.findIntegrations](features.md#features.integrations.findIntegrations), [features.integrations.loadIntegrations](features.md#features.integrations.loadIntegrations), [features.discover.specifiedTriggers](features.md#features.discover.specifiedTriggers), [features.integrations.integrationsText](features.md#features.integrations.integrationsText)
  - module [shared](../../src/operations/shared.ts#L1)
    <a id="operations.shared"></a><br>What more than one operation module takes: the envelope without a payload, paths relative to the root and the generated documents of an analysis, the hashes of the specs a result was computed from, and the steps of a model draft that ends in a proposal.
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - diag [base.diag](base.md#base.diag)
    - files [lang.files](lang.md#lang.files)
    - ir [lang.ir](lang.md#lang.ir)
    - proposals [features.proposals](features.md#features.proposals)
    - map [map.map](map.md#map.map)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - types [operations.types](operations.md#operations.types)
    - llm [features.llm](features.md#features.llm)
    - fn [resultWithout](../../src/operations/shared.ts#L22) (kind: OperationRequest["kind"], status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → OperationResult
      <a id="operations.shared.resultWithout"></a><br>A result without a payload, for a failure outside the operation (a transport that could not run it) or a cancellation.
      - calls [operations.shared.empty](operations.md#operations.shared.empty)
    - type [EnvelopeOf](../../src/operations/shared.ts#L27) = { [K in OperationRequest["kind"]]: OperationEnvelope<K> } <!-- internal -->
      <a id="operations.shared.EnvelopeOf"></a><br>Each kind's envelope: indexed with a union of kinds, the union of their envelopes (as `OperationResult`).
    - fn [empty](../../src/operations/shared.ts#L35) (kind: K, status: OperationStatus, exitCode: 0 | 1 | 2 | null, error?: string) → EnvelopeOf[K]
      <a id="operations.shared.empty"></a><br>The envelope of `kind` without a payload and with nothing written; `error` becomes its one message. TypeScript cannot carry a kind that is a union into `OperationEnvelope<K>` per member, so the generic signature states it and the implementation builds the one shape every kind…
    - fn [rootRelative](../../src/operations/shared.ts#L41) (root: string, path: string) → string
      <a id="operations.shared.rootRelative"></a><br>`path` as the caller typed it (relative to the root, or absolute): relative to the root, POSIX.
      - calls [base.config.toPosix](base.md#base.config.toPosix)
    - fn [generatedIn](../../src/operations/shared.ts#L46) (docs: readonly Document[]) → (path: string) => boolean
      <a id="operations.shared.generatedIn"></a><br>Whether the analysis knows a spec path as a generated document (the map): what `proposalProblem` asks.
    - fn [specHashes](../../src/operations/shared.ts#L51) (root: string, docs: readonly Document[]) → CandidateBasis["specs"]
      <a id="operations.shared.specHashes"></a><br>The hand-written specs the candidate was built from, as they are on disk now: a planned signature or a flow's `test` changed meanwhile makes it unfit.
      - calls [operations.shared.hashOrNull](operations.md#operations.shared.hashOrNull), [lang.files.readTextOrNull](lang.md#lang.files.readTextOrNull)
    - fn [hashOrNull](../../src/operations/shared.ts#L56) (text: string | null) → string | null <!-- internal -->
      <a id="operations.shared.hashOrNull"></a><br>The SHA-256 of a spec's text; null stays null (the spec could not be read).
      - calls [map.snapshot.sha256](map.md#map.snapshot.sha256)
    - fn [specProblems](../../src/operations/shared.ts#L61) (root: string, specs: CandidateBasis["specs"], subject = "the candidate") → string[]
      <a id="operations.shared.specProblems"></a><br>`path: changed on disk while the candidate was computed` for each spec of the basis that is not the same now.
      - calls [operations.shared.hashOrNull](operations.md#operations.shared.hashOrNull), [lang.files.readTextOrNull](lang.md#lang.files.readTextOrNull)
    - fn [modelSetup](../../src/operations/shared.ts#L70) (mode: "algo" | "llm" | "hybrid", config: Pick<Config, "agent" | "root">, command = "draft") → Promise<{ client: LlmClient | null; fallback: string | null } | { error: string }>
      <a id="operations.shared.modelSetup"></a><br>The model client of a model mode, read before anything is asked: none configured, and `llm` fails as the CLI does (`<command> --mode llm: …`) while `hybrid` drafts as algo, saying why. Algo: no client.
    - fn [proposalRefusal](../../src/operations/shared.ts#L85) (root: string, candidate: { target: string; problem: string | null; pending: string | null }, pending: "refuse" | "replace" | undefined, command = "draft") → { exitCode: 1 | 2; error: string; refused: string[] } | null
      <a id="operations.shared.proposalRefusal"></a><br>Why a proposal for the candidate's target may not even be drafted, or null — checked before a model is asked: a target a proposal may not change (2, as in the CLI), a store that breaks the write policy (2), a proposal already waiting under `pending: refuse` (1, named in…
      - calls [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem)
    - type [ProposalCommit](../../src/operations/shared.ts#L98) <!-- internal -->
      <a id="operations.shared.ProposalCommit"></a><br>What a drafted proposal is written from and against.
    - fn [commitProposal](../../src/operations/shared.ts#L118) (commit: ProposalCommit, context: OperationContext) → Promise<{ proposal: string } | { refused: string[] } | { failed: string; writing: boolean } | { cancelled: true }>
      <a id="operations.shared.commitProposal"></a><br>The commit of a drafted proposal: after `beforeCommit` (which may refuse) the target, the waiting proposal, keylang.json and the sources must still be the ones read, else it is refused and nothing is written; then the full text is written atomically. `failed` with `writing` is…
      - calls [base.diag.errorText](base.md#base.diag.errorText), [features.proposals.proposalProblem](features.md#features.proposals.proposalProblem), [features.proposals.proposalWriteProblem](features.md#features.proposals.proposalWriteProblem), [map.map.sourceInputProblems](map.md#map.map.sourceInputProblems), [features.proposals.writeProposal](features.md#features.proposals.writeProposal)
  - module [spec](../../src/operations/spec.ts#L1)
    <a id="operations.spec"></a><br>The operations on the saved specs and the code they describe: `fmt`, `parse`, `check`, `check --explain-edge` and `trace-plan`.
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - changed [features.changed](features.md#features.changed)
    - check-results [features.check-results](features.md#features.check-results)
    - config [base.config](base.md#base.config)
    - diag [base.diag](base.md#base.diag)
    - explain-edge [features.explain-edge](features.md#features.explain-edge)
    - explanations [map.explanations](map.md#map.explanations)
    - files [lang.files](lang.md#lang.files)
    - fmt [lang.fmt](lang.md#lang.fmt)
    - ir [lang.ir](lang.md#lang.ir)
    - parser [lang.parser](lang.md#lang.parser)
    - parse-format [lang.parse-format](lang.md#lang.parse-format)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - span [base.span](base.md#base.span)
    - git-changes [features.git-changes](features.md#features.git-changes)
    - trace-plan [map.trace-plan](map.md#map.trace-plan)
    - types [operations.types](operations.md#operations.types)
    - shared [operations.shared](operations.md#operations.shared)
    - fn [runFmt](../../src/operations/spec.ts#L40) (request: FmtRequest, context: OperationContext) → Promise<OperationEnvelope<"fmt">>
      <a id="operations.spec.runFmt"></a><br>`keylang fmt [--check]` in two phases. Compute: every file is read and formatted by `formatSource`; one that cannot be read, or whose tree shape is ambiguous (K003), is reported and the rest go on; a saved explanation and a generated file are skipped.
      - calls [operations.shared.empty](operations.md#operations.shared.empty), [base.config.assertFormatOnly](base.md#base.config.assertFormatOnly), [lang.files.collectMdFiles](lang.md#lang.files.collectMdFiles), [base.config.toPosix](base.md#base.config.toPosix), [base.diag.errorText](base.md#base.diag.errorText), [map.explanations.isStoredExplanation](map.md#map.explanations.isStoredExplanation), [base.safe-write.isGeneratedText](base.md#base.safe-write.isGeneratedText), [operations.spec.generatorCommand](operations.md#operations.spec.generatorCommand), [lang.fmt.formatSource](lang.md#lang.fmt.formatSource), [base.safe-write.allCrlf](base.md#base.safe-write.allCrlf), [operations.spec.fmtMessages](operations.md#operations.spec.fmtMessages), [operations.spec.commitFormatted](operations.md#operations.spec.commitFormatted)
    - fn [commitFormatted](../../src/operations/spec.ts#L135) (root: string, abs: string, source: string, text: string) → void <!-- internal -->
      <a id="operations.spec.commitFormatted"></a><br>Writes one formatted file under the write policy of every writer (`safe-write.ts`): only where the bytes land inside the repository with every link followed, atomically at that target, with the formatter's bytes in the file's own line ends (CRLF on every line stays CRLF), and…
      - calls [base.safe-write.landing](base.md#base.safe-write.landing), [map.analyze.within](map.md#map.analyze.within), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic)
    - fn [generatorCommand](../../src/operations/spec.ts#L145) (source: string) → string | null <!-- internal -->
      <a id="operations.spec.generatorCommand"></a><br>The command a generation marker names (`keylang map`), or null.
    - fn [fmtGeneratedNote](../../src/operations/spec.ts#L151) (file: FmtFile) → string
      <a id="operations.spec.fmtGeneratedNote"></a><br>`keylang/map/app.md: a generated file, not formatted; \`keylang map\` writes it`: how fmt names a generated file it leaves.
    - fn [fmtMessages](../../src/operations/spec.ts#L161) (payload: FmtPayload) → OperationMessage[]
      <a id="operations.spec.fmtMessages"></a><br>The report, file by file in path order: `info` is what `keylang fmt` prints to stdout, `error` what it prints to stderr; a `warning` names a skipped explanation, which the CLI passes over silently, or a skipped generated file, which the CLI notes on stderr.
      - calls [base.diag.formatDiagnostic](base.md#base.diag.formatDiagnostic), [operations.spec.fmtGeneratedNote](operations.md#operations.spec.fmtGeneratedNote)
    - fn [runCheck](../../src/operations/spec.ts#L188) (request: CheckRequest, context: OperationContext) → Promise<OperationEnvelope<"check">>
      <a id="operations.spec.runCheck"></a><br>`keylang check` on the saved files: the paths (the spec directory by default), the static mode (request, then keylang.json, then `behavior`) and `strict`. Code 1 for a failure, or with `strict` for an unverified verdict; an unverified one without `strict` is code 0 and stays in…
      - calls [operations.shared.empty](operations.md#operations.shared.empty), [base.config.loadConfig](base.md#base.config.loadConfig), [base.diag.errorText](base.md#base.diag.errorText), [features.git-changes.gitChangedFiles](features.md#features.git-changes.gitChangedFiles), [map.analyze.within](map.md#map.analyze.within), [base.config.toPosix](base.md#base.config.toPosix), [map.analyze.analyze](map.md#map.analyze.analyze), [features.check-results.checkReport](features.md#features.check-results.checkReport), [features.git-changes.deletedModuleIds](features.md#features.git-changes.deletedModuleIds), [features.changed.filterChanged](features.md#features.changed.filterChanged), [features.git-changes.changedPathSet](features.md#features.git-changes.changedPathSet), [base.span.compareText](base.md#base.span.compareText), [base.config.resolveStatic](base.md#base.config.resolveStatic), [operations.spec.checkSkipNote](operations.md#operations.spec.checkSkipNote), [operations.spec.checkSummary](operations.md#operations.spec.checkSummary), [features.check-results.checkExitCode](features.md#features.check-results.checkExitCode)
    - fn [checkSkipNote](../../src/operations/spec.ts#L275) (path: string) → string
      <a id="operations.spec.checkSkipNote"></a><br>The note on a path that holds no specs, as the CLI writes it after `keylang: `.
    - fn [checkSummary](../../src/operations/spec.ts#L285) (counts: CheckCounts) → string
      <a id="operations.spec.checkSummary"></a><br>The CLI's closing line on stderr: `0 fail, 2 unverified, 5 ok`. Once two unverified verdicts name one hole, the line says how many holes they come from: `0 fail, 8 unverified (from 2 holes), 71 ok`, and `9 unverified (8 from 2 holes)` when the others name no hole.
    - fn [runExplainEdge](../../src/operations/spec.ts#L299) (request: ExplainEdgeRequest, context: OperationContext) → Promise<OperationEnvelope<"explain-edge">>
      <a id="operations.spec.runExplainEdge"></a><br>`keylang check --explain-edge <from> <to>` on the saved code: a fresh analysis without specs, then the edges between the ids. Code 0 whether or not there is an edge; code 2 for a broken config, no snapshot or an unknown id (an unknown tail under a known module included).
      - calls [operations.shared.empty](operations.md#operations.shared.empty), [map.analyze.analyze](map.md#map.analyze.analyze), [base.diag.errorText](base.md#base.diag.errorText), [features.explain-edge.edgeIdKnown](features.md#features.explain-edge.edgeIdKnown), [features.explain-edge.explainEdge](features.md#features.explain-edge.explainEdge), [features.explain-edge.edgeExplanationLines](features.md#features.explain-edge.edgeExplanationLines)
    - fn [runParse](../../src/operations/spec.ts#L334) (request: ParseRequest, context: OperationContext) → Promise<OperationEnvelope<"parse">>
      <a id="operations.spec.runParse"></a><br>`keylang parse`: every Markdown file under the paths, in their order, into the Text IR. The parser alone runs — no snapshot of the code, no rules.
      - calls [operations.shared.empty](operations.md#operations.shared.empty), [base.config.assertFormatOnly](base.md#base.config.assertFormatOnly), [lang.files.collectMdFiles](lang.md#lang.files.collectMdFiles), [base.diag.errorText](base.md#base.diag.errorText), [map.explanations.isStoredExplanation](map.md#map.explanations.isStoredExplanation), [lang.parser.parse](lang.md#lang.parser.parse), [base.diag.isError](base.md#base.diag.isError), [base.diag.formatDiagnostic](base.md#base.diag.formatDiagnostic), [lang.parse-format.parseReportText](lang.md#lang.parse-format.parseReportText)
    - fn [runTracePlan](../../src/operations/spec.ts#L386) (request: TracePlanRequest, context: OperationContext) → Promise<OperationEnvelope<"trace-plan">>
      <a id="operations.spec.runTracePlan"></a><br>`keylang trace-plan <flow>`: the flow's `trigger` and `step` IDs from the saved specs, then a fresh snapshot of the saved code — never the session's or a cached index. With `entry` (`trace-plan --entry <id>`): the fns reachable from that fn (`reachableFrom`), named `flow` or…
      - calls [operations.shared.empty](operations.md#operations.shared.empty), [map.trace-plan.tracePlan](map.md#map.trace-plan.tracePlan), [base.config.loadConfig](base.md#base.config.loadConfig), [map.trace-plan.entryTracePlan](map.md#map.trace-plan.entryTracePlan), [base.diag.errorText](base.md#base.diag.errorText), [map.trace-plan.tracePlanText](map.md#map.trace-plan.tracePlanText)
  - module [types](../../src/operations/types.ts#L1)
    <a id="operations.types"></a><br>The contract of the shared workspace operations (ADR 0008): each request, the payload of its result, the envelope a result comes in, and what an operation may use besides its request. Types, but for two constants: the default target of `wire` and the kinds that write.
    - analyze [map.analyze](map.md#map.analyze)
    - c4-export [map.c4-export](map.md#map.c4-export)
    - check-format [features.check-format](features.md#features.check-format)
    - check-results [features.check-results](features.md#features.check-results)
    - config [base.config](base.md#base.config)
    - diag [base.diag](base.md#base.diag)
    - explain-edge [features.explain-edge](features.md#features.explain-edge)
    - explain-llm [features.explain-llm](features.md#features.explain-llm)
    - agent-cli [features.agent-cli](features.md#features.agent-cli)
    - explain-inventory [features.explain-inventory](features.md#features.explain-inventory)
    - explain-node [features.explain-node](features.md#features.explain-node)
    - explain-offline [features.explain-offline](features.md#features.explain-offline)
    - explanations [map.explanations](map.md#map.explanations)
    - ir [lang.ir](lang.md#lang.ir)
    - parse-format [lang.parse-format](lang.md#lang.parse-format)
    - verdict [check.verdict](check.md#check.verdict)
    - feature-status [features.feature-status](features.md#features.feature-status)
    - harness [features.harness](features.md#features.harness)
    - graph [map.graph](map.md#map.graph)
    - draft-llm [features.draft-llm](features.md#features.draft-llm)
    - map [map.map](map.md#map.map)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - voice-local [features.voice-local](features.md#features.voice-local)
    - trace-plan [map.trace-plan](map.md#map.trace-plan)
    - discover [features.discover](features.md#features.discover)
    - discover-names [features.discover-names](features.md#features.discover-names)
    - coverage-report [features.coverage-report](features.md#features.coverage-report)
    - integrations [features.integrations](features.md#features.integrations)
    - type [DoctorRequest](../../src/operations/types.ts#L37)
      <a id="operations.types.DoctorRequest"></a><br>The known operations. `doctor` is the first; new kinds arrive with their feature.
    - type [FeatureQuestionsRequest](../../src/operations/types.ts#L44)
      <a id="operations.types.FeatureQuestionsRequest"></a><br>«Ask the model for questions» on the feature readiness screen (c4-zoom/11): a proposal of `- ? …` lines for the feature file.
    - type [FeatureRequest](../../src/operations/types.ts#L53)
      <a id="operations.types.FeatureRequest"></a><br>Whether a feature file is done, on the saved state of the repository (cli.md `feature`); a rule fail blocks only when it is this change's.
    - type [MapCheckRequest](../../src/operations/types.ts#L68)
      <a id="operations.types.MapCheckRequest"></a><br>Whether the generated map on disk matches the code (`keylang map --check`). Read-only.
    - type [MapRequest](../../src/operations/types.ts#L77)
      <a id="operations.types.MapRequest"></a><br>Writes the generated map, the explained map, the index and the fact cache (`keylang map`).
    - type [BaselineRequest](../../src/operations/types.ts#L89)
      <a id="operations.types.BaselineRequest"></a><br>Writes `<dir>/rules.baseline.md` from the current layer graph (`keylang baseline`), or with `check` only compares it (`keylang baseline --check`).
    - type [AgentsRequest](../../src/operations/types.ts#L102)
      <a id="operations.types.AgentsRequest"></a><br>Installs or strips the managed harness files (`keylang agents [--agents=LIST]`), or with `check` only compares them (`--check`). Setting files up says nothing about whether a harness client runs.
    - type [FmtRequest](../../src/operations/types.ts#L117)
      <a id="operations.types.FmtRequest"></a><br>Rewrites Markdown files in the canonical form (`keylang fmt <paths…>`), or with `check` only compares them (`--check`). Each file is formatted on its own from its saved bytes by `formatSource`.
    - type [ParseRequest](../../src/operations/types.ts#L134)
      <a id="operations.types.ParseRequest"></a><br>Parses spec files into the Text IR (`keylang parse [--json] <paths…>`). Read-only: nothing is analyzed and nothing is written; of keylang.json only the edition is read.
    - type [WireRequest](../../src/operations/types.ts#L154)
      <a id="operations.types.WireRequest"></a><br>Generates the container of `# wiring` (`keylang wire [--out <file>]`), or with `check` only compares it (`--check`). The generated file is never compiled or run here.
    - type [CheckRequest](../../src/operations/types.ts#L170)
      <a id="operations.types.CheckRequest"></a><br>Checks the saved specs against the code (`keylang check [paths…] [--strict] [--static <mode>]`). Read-only but for the local fact cache, saved best-effort for the next run.
    - type [ExplainEdgeRequest](../../src/operations/types.ts#L196)
      <a id="operations.types.ExplainEdgeRequest"></a><br>Explains the dependency between two ids of the saved code (`keylang check --explain-edge <from> <to>`): the snapshot's edges both ways, or whether their absence is proven. Read-only; the specs are not read.
    - type [ExplainRequest](../../src/operations/types.ts#L211)
      <a id="operations.types.ExplainRequest"></a><br>`keylang explain <code|id>` without `--llm`: the help of a diagnostic code (`K001`, any case; nothing is read), or the offline summary of a node on a fresh analysis of the saved code and specs with the explanations saved for it. Read-only and offline: no model, no write, not…
    - type [ExplainLlmRequest](../../src/operations/types.ts#L230)
      <a id="operations.types.ExplainLlmRequest"></a><br>`keylang explain <id> --llm [--full|--brief]`: one node's explanation by the configured model. A fresh saved answer of the same detail and language is read instead of asking (no request, no write); without a usable model the offline summary and the saved answer are shown, as…
    - type [ExplainPlanRequest](../../src/operations/types.ts#L246)
      <a id="operations.types.ExplainPlanRequest"></a><br>What explanations need work, read-only and offline: `stale-saved` is `explain --stale` (saved answers and briefs that are stale or gone); `briefs` is the plan of a brief batch (`explain --missing|--stale` without `--llm`), `estimate` its `--dry-run` size. No model, no write…
    - type [ExplainBatchRequest](../../src/operations/types.ts#L276)
      <a id="operations.types.ExplainBatchRequest"></a><br>`keylang explain --missing|--stale --llm [--limit N] [--jobs N]`: a brief for each node of the plan, bottom-up, by the configured model. The plan is made again on a fresh analysis of the saved files (a preview is never applied): `briefPlan`, cut to `limit`.
    - type [ExportSource](../../src/operations/types.ts#L293)
      <a id="operations.types.ExportSource"></a><br>The typed result an export writes: a finished check report in one of the CLI's formats, or the lines of an explained edge (the CLI has only its human output), the documents of a parse in a view, or a trace plan (JSON only, as the CLI prints it).
    - type [ExportFormat](../../src/operations/types.ts#L300) = CheckFormat | ParseFormat
      <a id="operations.types.ExportFormat"></a><br>The formats an export writes: the check formats and the parse views.
    - type [TracePlanRequest](../../src/operations/types.ts#L307)
      <a id="operations.types.TracePlanRequest"></a><br>The functions of one flow a trace adapter instruments (`keylang trace-plan <flow>`), on a fresh snapshot of the saved code and specs. Read-only: it writes nothing, not even the fact cache, and runs no test or program.
    - type [EntriesRequest](../../src/operations/types.ts#L325)
      <a id="operations.types.EntriesRequest"></a><br>The entry points of a fresh snapshot of the saved code (`keylang entries [--kind k]`, MCP `list_entries`, «Entry points» in the TUI). Read-only: writes only the fact cache, best-effort, like `check`.
    - type [CoverageRequest](../../src/operations/types.ts#L339)
      <a id="operations.types.CoverageRequest"></a><br>What keylang does not see (`keylang coverage`, MCP `coverage_report`, «Blind spots» in the TUI): reach from entry points, orphan fns, holes by module and reason, entry points without a hand-written flow, and «logic in data». Read-only: writes only the fact cache, best-effort…
    - type [IntegrationsRequest](../../src/operations/types.ts#L352)
      <a id="operations.types.IntegrationsRequest"></a><br>The integrations inventory (`keylang integrations`, MCP `list_integrations`, «Integrations» in the TUI): outgoing HTTP/SOAP/SDK and queue clients with their call sites and the entry points that reach them, incoming webhooks, queue publishers and consumers. Read-only: writes…
    - type [FlowsDiscoverRequest](../../src/operations/types.ts#L366)
      <a id="operations.types.FlowsDiscoverRequest"></a><br>Discovered flows (`keylang flows discover`, MCP `discover_flows`, «Discover flows» in the TUI): a flow draft for every entry point, as the generated view `<dir>/flows-discovered/<layer>.md` that `check` does not read. `write` writes the changed files of the view and removes its…
    - type [FlowsNamesPayload](../../src/operations/types.ts#L390)
      <a id="operations.types.FlowsNamesPayload"></a><br>What `--names` did: the groups asked for, the estimate, the stale processes, the processes now saved.
    - type [FlowsAdoptRequest](../../src/operations/types.ts#L410)
      <a id="operations.types.FlowsAdoptRequest"></a><br>One discovered flow adopted as a spec (`keylang flows adopt <name> [--into <spec.md>]`): the flow as `flows discover` draws it now, with a provenance comment, written as the full proposed text of the target to `.keylang/proposals/<target>`; default target `<dir>/flows/<name>.md`.
    - type [DraftFlowRequest](../../src/operations/types.ts#L436)
      <a id="operations.types.DraftFlowRequest"></a><br>A flow drafted for a trigger (`keylang draft flow <trigger> --mode algo|llm|hybrid`): `algo` is only what the snapshot's call edges show; `llm` and `hybrid` ask the configured model and judge its answer against those edges (`draftFlowWithModel`: agree, llm-only, conflict…
    - type [DraftRulesRequest](../../src/operations/types.ts#L481)
      <a id="operations.types.DraftRulesRequest"></a><br>Rules drafted for the repository (`keylang draft rules --mode algo|llm|hybrid`): `algo` is what the code keeps now (`draftRules`: a `layers` order or `deny` pairs, `no-cycles` without a module cycle); `llm` and `hybrid` ask the configured model and check each of its rules alone…
    - type [CodeToSpecRequest](../../src/operations/types.ts#L512)
      <a id="operations.types.CodeToSpecRequest"></a><br>Flows drafted from code (`keylang code-to-spec <path[:line]> | --since <ref> [--mode algo|llm|hybrid]`). The source is a code position or a git change, never both.
    - type [CodeToSpecSource](../../src/operations/types.ts#L528)
      <a id="operations.types.CodeToSpecSource"></a><br>Where code-to-spec drafts from: a code position or a git change, never both.
    - type [SpecToCodeRequest](../../src/operations/types.ts#L553)
      <a id="operations.types.SpecToCodeRequest"></a><br>`keylang spec-to-code <id> [--into] [--mode algo|llm] [--print]`: for the planned fn `id`, in the file of its module, a stub with its declared signature (`algo`) or the model's function (`llm`), and for each `test` its flows name in a file that does not exist yet a failing…
    - type [ApplyCodeRequest](../../src/operations/types.ts#L579)
      <a id="operations.types.ApplyCodeRequest"></a><br>Applies a whole spec-to-code candidate (`keylang spec-to-code <id> --apply`): every file of it is written with its proposed text, directly — no proposal. The candidate is the one a spec-to-code run reported (preview or proposal, template or model): nothing is computed again.
    - type [DraftLayoutRequest](../../src/operations/types.ts#L605)
      <a id="operations.types.DraftLayoutRequest"></a><br>The layer layout drafted for `keylang.json` (`keylang draft map --mode algo|llm|hybrid`): `algo` is the layout keylang would guess from the directories (`guessLayout`), `llm` and `hybrid` ask the configured model, whose layers pass the validation of a written `keylang.json`.…
    - type [ExportRequest](../../src/operations/types.ts#L620)
      <a id="operations.types.ExportRequest"></a><br>Saves a report that was already computed to one file: exactly the stdout the CLI prints for it, without ANSI or status lines. It never runs the check again.
    - type [ExportC4Request](../../src/operations/types.ts#L635)
      <a id="operations.types.ExportC4Request"></a><br>`keylang export c4` (c4-zoom/12): a C4 diagram of the saved code, as text or written to `out`. `format` and `level` come as typed and are checked here, so the CLI and the TUI refuse the same values with the same message.
    - type [InitRequest](../../src/operations/types.ts#L655)
      <a id="operations.types.InitRequest"></a><br>Sets a repository up (`keylang init [dir] [--agents=LIST]`): keylang.json (an existing one is kept), the map, the baseline and the harness files, in that order. With `check` it runs exactly `init --check`: the harness files and the baseline are compared; the map is not (that is…
    - type [ChatTurn](../../src/operations/types.ts#L668)
      <a id="operations.types.ChatTurn"></a><br>One message of the clip's conversation: the person's or the clip's.
    - type [AssistantReplyRequest](../../src/operations/types.ts#L680)
      <a id="operations.types.AssistantReplyRequest"></a><br>The clip's reply (ADR 0021): one answer of the configured model to the conversation, with what the session shows around it. The TUI is its only caller (spec П3: the chat is interactive, no CLI command asks it).
    - type [OperationRequest](../../src/operations/types.ts#L704)
      <a id="operations.types.OperationRequest"></a><br>Every request `runOperation` takes: its `kind` names the operation and the payload of its result.
    - type [OperationContext](../../src/operations/types.ts#L710)
      <a id="operations.types.OperationContext"></a><br>What an operation may use besides its request. No UI state, no shell.
    - type [OperationProgress](../../src/operations/types.ts#L732)
      <a id="operations.types.OperationProgress"></a><br>A progress note; a batch adds the step it just finished (`[done/total] id` on the CLI's stderr).
    - type [BatchStep](../../src/operations/types.ts#L738)
      <a id="operations.types.BatchStep"></a><br>One node of a batch finished: written, or failed with the reason.
    - type [CommitPlan](../../src/operations/types.ts#L749)
      <a id="operations.types.CommitPlan"></a><br>What a commit is about to write, when the operation names it before it asks (a draft: its target, whose proposal it writes).
    - type [CommitGate](../../src/operations/types.ts#L755) = void | { refused: string[] }
      <a id="operations.types.CommitGate"></a><br>The caller's answer before a commit: nothing (go ahead) or the reasons the files must stay as they are.
    - type [OperationStatus](../../src/operations/types.ts#L758) = "completed" | "failed" | "cancelled"
      <a id="operations.types.OperationStatus"></a><br>How an operation ended: `completed` (with or without findings), `failed`, or `cancelled` by the caller.
    - type [OperationMessage](../../src/operations/types.ts#L761)
      <a id="operations.types.OperationMessage"></a><br>One line of an operation's human-readable report, with its level.
    - type [DoctorPayload](../../src/operations/types.ts#L768)
      <a id="operations.types.DoctorPayload"></a><br>The structured doctor report. Key values never reach it.
    - type [FeatureQuestionsPayload](../../src/operations/types.ts#L817)
      <a id="operations.types.FeatureQuestionsPayload"></a><br>The questions a model proposed for a feature file (c4-zoom/11).
    - type [AssistantReplyPayload](../../src/operations/types.ts#L831)
      <a id="operations.types.AssistantReplyPayload"></a><br>What the model answered in the clip's chat. Nothing was written.
    - type [ExportC4Payload](../../src/operations/types.ts#L843)
      <a id="operations.types.ExportC4Payload"></a><br>A C4 diagram (c4-zoom/12): its text and, with `--out`, the file it went to.
    - type [FeaturePayload](../../src/operations/types.ts#L853)
      <a id="operations.types.FeaturePayload"></a><br>The feature status the CLI prints (`report`), with the file and the snapshot it was computed on.
    - type [MapCheckPayload](../../src/operations/types.ts#L864)
      <a id="operations.types.MapCheckPayload"></a><br>How the generated map on disk differs from a fresh render. Paths are POSIX, relative to the root.
    - type [MapPayload](../../src/operations/types.ts#L883)
      <a id="operations.types.MapPayload"></a><br>What `keylang map` did. With conflicts or refusals nothing is written and `steps` is empty; otherwise every planned file step is listed with its state, so a partial commit names what landed, what failed and what was never tried.
    - type [BaselinePayload](../../src/operations/types.ts#L899)
      <a id="operations.types.BaselinePayload"></a><br>What `keylang baseline [--check]` found and did. The path is POSIX, relative to the root.
    - type [AgentsPayload](../../src/operations/types.ts#L927)
      <a id="operations.types.AgentsPayload"></a><br>What `keylang agents [--check]` planned and did. With `error` or `refused` nothing was written and `steps` is empty; otherwise every changed file is a step with its state.
    - type [FmtFile](../../src/operations/types.ts#L954)
      <a id="operations.types.FmtFile"></a><br>One Markdown file of `keylang fmt`, in the order the paths name them. `current`: already canonical; `stale`: not canonical, and not written (a check, or a write stopped before it); `formatted`: written by this run; `invalid`: the tree shape is ambiguous (K003), never rewritten…
    - type [FmtPayload](../../src/operations/types.ts#L969)
      <a id="operations.types.FmtPayload"></a><br>What `keylang fmt [--check]` found and did, file by file.
    - type [ParsePayload](../../src/operations/types.ts#L975)
      <a id="operations.types.ParsePayload"></a><br>What `keylang parse` read: the documents in path order, the skipped and unreadable files.
    - type [FlowsDiscoverPayload](../../src/operations/types.ts#L990)
      <a id="operations.types.FlowsDiscoverPayload"></a><br>The discovered flows and what became of the view.
    - type [FlowsAdoptPayload](../../src/operations/types.ts#L1013)
      <a id="operations.types.FlowsAdoptPayload"></a><br>The discovered flow adopted, and the proposal written.
    - type [EntriesPayload](../../src/operations/types.ts#L1021)
      <a id="operations.types.EntriesPayload"></a><br>The entry points of the snapshot, as `keylang entries` lists them.
    - type [CoveragePayload](../../src/operations/types.ts#L1032) extends CoverageReport
      <a id="operations.types.CoveragePayload"></a><br>The coverage report (`keylang coverage --json` is it without `text`).
    - type [IntegrationsPayload](../../src/operations/types.ts#L1038) extends IntegrationsReport
      <a id="operations.types.IntegrationsPayload"></a><br>The integrations inventory (`keylang integrations --json` is it without `text`).
    - type [TracePlanPayload](../../src/operations/types.ts#L1044)
      <a id="operations.types.TracePlanPayload"></a><br>The plan `keylang trace-plan` prints, and what it leaves out.
    - type [FlowCandidate](../../src/operations/types.ts#L1058)
      <a id="operations.types.FlowCandidate"></a><br>One drafted flow and what it makes of its target: the typed candidate a preview shows and a proposal writes. `before` and `pending` are the files it was built from — the expected state of a later write.
    - type [DraftFlowPayload](../../src/operations/types.ts#L1078)
      <a id="operations.types.DraftFlowPayload"></a><br>What `keylang draft flow` drafted, and the proposal it wrote.
    - type [RulesCandidate](../../src/operations/types.ts#L1103)
      <a id="operations.types.RulesCandidate"></a><br>The drafted rules and what they make of their target, as `FlowCandidate`: `before` and `pending` are the expected state of a later write.
    - type [DraftRulesPayload](../../src/operations/types.ts#L1119)
      <a id="operations.types.DraftRulesPayload"></a><br>What `keylang draft rules` drafted, and the proposal it wrote.
    - type [CodeFlow](../../src/operations/types.ts#L1143)
      <a id="operations.types.CodeFlow"></a><br>One flow of a code-to-spec draft: its trigger, name, steps and section.
    - type [CodeToSpecCandidate](../../src/operations/types.ts#L1157)
      <a id="operations.types.CodeToSpecCandidate"></a><br>The flows drafted from a code position and what they make of their target, as `FlowCandidate`: `before` and `pending` are the expected state of a later write.
    - type [CodeToSpecPayload](../../src/operations/types.ts#L1182)
      <a id="operations.types.CodeToSpecPayload"></a><br>What `keylang code-to-spec` drafted, and the proposal it wrote.
    - type [CodeModelInfo](../../src/operations/types.ts#L1209)
      <a id="operations.types.CodeModelInfo"></a><br>Who drafted the flows of a code-to-spec, and what each of its answers adds to its text.
    - type [CodeProposalTarget](../../src/operations/types.ts#L1218)
      <a id="operations.types.CodeProposalTarget"></a><br>One file of a spec-to-code candidate, as its proposal would replace it.
    - type [SpecToCodeCandidate](../../src/operations/types.ts#L1234)
      <a id="operations.types.SpecToCodeCandidate"></a><br>What spec-to-code builds for a planned fn: every file it proposes, and what `check` would say with them in place.
    - type [CandidateBasis](../../src/operations/types.ts#L1250) extends SourceInputs
      <a id="operations.types.CandidateBasis"></a><br>What a spec-to-code candidate was read from: `keylang.json`, the snapshot's sources, the hand-written specs.
    - type [AppliedFile](../../src/operations/types.ts#L1256)
      <a id="operations.types.AppliedFile"></a><br>One file of an applied candidate and what happened to it.
    - type [ApplyCodePayload](../../src/operations/types.ts#L1265)
      <a id="operations.types.ApplyCodePayload"></a><br>What `spec-to-code --apply` wrote of a candidate.
    - type [SpecCodeModelInfo](../../src/operations/types.ts#L1276)
      <a id="operations.types.SpecCodeModelInfo"></a><br>The model behind an `llm` spec-to-code candidate.
    - type [SpecToCodePayload](../../src/operations/types.ts#L1283)
      <a id="operations.types.SpecToCodePayload"></a><br>What `keylang spec-to-code` built, and the proposals it wrote.
    - type [DraftLayoutPayload](../../src/operations/types.ts#L1300)
      <a id="operations.types.DraftLayoutPayload"></a><br>What `keylang draft map` drafted: the layers, and the config the CLI prints with them.
    - type [RulesModelInfo](../../src/operations/types.ts#L1316)
      <a id="operations.types.RulesModelInfo"></a><br>Who proposed the rules and how each compares with the code now.
    - type [DraftModelInfo](../../src/operations/types.ts#L1324)
      <a id="operations.types.DraftModelInfo"></a><br>What the model's draft adds to its text: who drafted it, how its steps compare with the snapshot, what it left out.
    - type [WirePayload](../../src/operations/types.ts#L1335)
      <a id="operations.types.WirePayload"></a><br>What `keylang wire [--check]` found and did. The path is POSIX, relative to the root.
    - type [CheckPayload](../../src/operations/types.ts#L1363)
      <a id="operations.types.CheckPayload"></a><br>What `keylang check` found on the saved files. `results`, `snapshotId` and `coverage` are exactly `--format json`; `lines` and `counts` are the human output and its summary. Paths are relative to the request's `base`.
    - type [ChangedSlice](../../src/operations/types.ts#L1388)
      <a id="operations.types.ChangedSlice"></a><br>What `--changed` kept: the ref, what git reported, and how much of the full report the slice left out.
    - type [ExplainEdgePayload](../../src/operations/types.ts#L1403) extends EdgeExplanation
      <a id="operations.types.ExplainEdgePayload"></a><br>The evidence between two ids: the domain result of `--explain-edge`, and the CLI's lines of it.
    - type [ExplainPayload](../../src/operations/types.ts#L1411)
      <a id="operations.types.ExplainPayload"></a><br>An offline explanation (`explain-offline.ts`) with the snapshot it was read on and the CLI's stdout of it.
    - type [ExplainLlmPayload](../../src/operations/types.ts#L1424)
      <a id="operations.types.ExplainLlmPayload"></a><br>What `explain <id> --llm` showed and saved. `source`: `cache` — a fresh saved answer of the same detail and language, read; `model` — a new answer, saved (or refused, failed, with `previous` kept); `offline` — no model could be asked (`unavailable`), the summary and the saved…
    - type [ExplainPlanPayload](../../src/operations/types.ts#L1454)
      <a id="operations.types.ExplainPlanPayload"></a><br>What explanations need work (`explain-inventory.ts`), on the snapshot it was read on, with the CLI's stdout of it.
    - type [ExplainBatchPayload](../../src/operations/types.ts#L1470)
      <a id="operations.types.ExplainBatchPayload"></a><br>What a brief batch planned, wrote and left. `stopped`: null — the batch ran to the end of its plan (failed nodes are named, code 1); `cancelled` — Cancel, no new request was started and the ones in flight were closed; `outdated` — keylang.json, a source or a spec changed while…
    - type [ExportPayload](../../src/operations/types.ts#L1495)
      <a id="operations.types.ExportPayload"></a><br>What an export did with its one file.
    - type [InitPayload](../../src/operations/types.ts#L1517)
      <a id="operations.types.InitPayload"></a><br>What `keylang init [--check]` did, stage by stage. Each stage is the result of its own shared operation, null when it was not run (a check has no map stage; a failure or a cancellation stops the stages after it).
    - type [GitignoreStage](../../src/operations/types.ts#L1549)
      <a id="operations.types.GitignoreStage"></a><br>Whether the root `.gitignore` lists `.keylang/`: the index, the fact cache, proposals, test reports and traces are a local cache, never the spec. Repository hygiene, not a harness file: `--agents=none` has it too.
    - type [OperationPayloads](../../src/operations/types.ts#L1563)
      <a id="operations.types.OperationPayloads"></a><br>The payload type of each operation kind.
    - type [OperationResult](../../src/operations/types.ts#L1599)
      <a id="operations.types.OperationResult"></a><br>The result of one operation. File paths are POSIX, relative to the request's root.
    - type [OperationEnvelope](../../src/operations/types.ts#L1602)
      <a id="operations.types.OperationEnvelope"></a><br>The result of one operation of kind `K`: how it ended, its exit code and payload, its report, and the files it wrote, removed or proposed.
