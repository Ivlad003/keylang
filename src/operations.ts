// Shared workspace operations (ADR 0008): transport-independent orchestration
// of the application-level actions. The CLI and the TUI call the same
// interface: a typed request with an explicit absolute root, a typed result
// with a domain payload. These modules never import a transport, read the
// working directory, or write stdout/stderr. One operation variant at a
// time: each feature ticket adds its own, not every handler in advance.
//
// This file is the facade: `runOperation` hands each request to its module
// under `operations/` — the contract is `types.ts`, the steps several
// operations take are `shared.ts` — and every name a caller uses is
// exported from here.

import type { AgentsRequest, ApplyCodeRequest, AssistantReplyRequest, BaselineRequest, CheckRequest, CodeToSpecRequest, DoctorRequest, DraftFlowRequest, DraftLayoutRequest, DraftRulesRequest, EntriesRequest, CoverageRequest, IntegrationsRequest, TourRequest, FlowsAdoptRequest, FlowsDiscoverRequest, FlowExportRequest, FlowImportRequest, ExplainBatchRequest, ExplainEdgeRequest, ExplainLlmRequest, ExplainPlanRequest, ExplainRequest, ExportC4Request, ExportRequest, FeatureQuestionsRequest, FeatureRequest, FmtRequest, InitRequest, MapCheckRequest, MapRequest, OperationContext, OperationEnvelope, OperationRequest, OperationResult, ParseRequest, SpecToCodeRequest, TracePlanRequest, WireRequest } from "./operations/types.ts";
import { runAgents, runBaseline, runInit, runMap, runMapCheck, runWire } from "./operations/generate.ts";
import { runCheck, runExplainEdge, runFmt, runParse, runTracePlan } from "./operations/spec.ts";
import { runFeature, runFeatureQuestions } from "./operations/feature.ts";
import { runExplain, runExplainBatch, runExplainLlm, runExplainPlan } from "./operations/explain.ts";
import { runCodeToSpec, runDraftFlow, runDraftLayout, runDraftRules } from "./operations/draft.ts";
import { runApplyCode, runSpecToCode } from "./operations/code.ts";
import { runExport, runExportC4 } from "./operations/export.ts";
import { runDoctor } from "./operations/doctor.ts";
import { runEntries } from "./operations/entries.ts";
import { runCoverage } from "./operations/coverage.ts";
import { runIntegrations } from "./operations/integrations.ts";
import { runTour } from "./operations/tour.ts";
import { runFlowsAdopt, runFlowsDiscover } from "./operations/discover.ts";
import { runFlowExport, runFlowImport } from "./operations/flow-bundle.ts";
import { runAssistantReply } from "./operations/assistant.ts";

export * from "./operations/types.ts";
export { resultWithout } from "./operations/shared.ts";
export { gitignoreMessage, initSources, mapCheckLines, mapConflictLines, mapStepLines, mapSummary, wireOutProblem } from "./operations/generate.ts";
export { checkSkipNote, checkSummary, fmtGeneratedNote, fmtMessages } from "./operations/spec.ts";
export { FEATURE_SLUG, featureReportOf, featureSlugOf, featureSummary, gapLine, hintLine, questionLines, withQuestions } from "./operations/feature.ts";
export { codeToSpecCandidate, flowCandidate, rulesCandidate } from "./operations/draft.ts";
export { c4OutProblem, exportFormatOf, exportTargetProblem, exportText } from "./operations/export.ts";
export { assistantPrompt, parseReply } from "./operations/assistant.ts";
export { ENTRIES_HINT, entriesText } from "./operations/entries.ts";

/** Runs one operation and returns its typed result: the payload type follows the request's kind. */
export function runOperation(request: DoctorRequest, context?: OperationContext): Promise<OperationEnvelope<"doctor">>;
export function runOperation(request: FeatureRequest, context?: OperationContext): Promise<OperationEnvelope<"feature">>;
export function runOperation(request: MapCheckRequest, context?: OperationContext): Promise<OperationEnvelope<"map-check">>;
export function runOperation(request: MapRequest, context?: OperationContext): Promise<OperationEnvelope<"map">>;
export function runOperation(request: BaselineRequest, context?: OperationContext): Promise<OperationEnvelope<"baseline">>;
export function runOperation(request: AgentsRequest, context?: OperationContext): Promise<OperationEnvelope<"agents">>;
export function runOperation(request: FmtRequest, context?: OperationContext): Promise<OperationEnvelope<"fmt">>;
export function runOperation(request: WireRequest, context?: OperationContext): Promise<OperationEnvelope<"wire">>;
export function runOperation(request: CheckRequest, context?: OperationContext): Promise<OperationEnvelope<"check">>;
export function runOperation(request: ExplainEdgeRequest, context?: OperationContext): Promise<OperationEnvelope<"explain-edge">>;
export function runOperation(request: ExplainRequest, context?: OperationContext): Promise<OperationEnvelope<"explain">>;
export function runOperation(request: ExplainLlmRequest, context?: OperationContext): Promise<OperationEnvelope<"explain-llm">>;
export function runOperation(request: ExplainPlanRequest, context?: OperationContext): Promise<OperationEnvelope<"explain-plan">>;
export function runOperation(request: ExplainBatchRequest, context?: OperationContext): Promise<OperationEnvelope<"explain-batch">>;
export function runOperation(request: InitRequest, context?: OperationContext): Promise<OperationEnvelope<"init">>;
export function runOperation(request: ExportRequest, context?: OperationContext): Promise<OperationEnvelope<"export">>;
export function runOperation(request: ParseRequest, context?: OperationContext): Promise<OperationEnvelope<"parse">>;
export function runOperation(request: TracePlanRequest, context?: OperationContext): Promise<OperationEnvelope<"trace-plan">>;
export function runOperation(request: EntriesRequest, context?: OperationContext): Promise<OperationEnvelope<"entries">>;
export function runOperation(request: CoverageRequest, context?: OperationContext): Promise<OperationEnvelope<"coverage">>;
export function runOperation(request: IntegrationsRequest, context?: OperationContext): Promise<OperationEnvelope<"integrations">>;
export function runOperation(request: TourRequest, context?: OperationContext): Promise<OperationEnvelope<"tour">>;
export function runOperation(request: FlowsDiscoverRequest, context?: OperationContext): Promise<OperationEnvelope<"flows-discover">>;
export function runOperation(request: FlowsAdoptRequest, context?: OperationContext): Promise<OperationEnvelope<"flows-adopt">>;
export function runOperation(request: FlowExportRequest, context?: OperationContext): Promise<OperationEnvelope<"flow-export">>;
export function runOperation(request: FlowImportRequest, context?: OperationContext): Promise<OperationEnvelope<"flow-import">>;
export function runOperation(request: DraftFlowRequest, context?: OperationContext): Promise<OperationEnvelope<"draft-flow">>;
export function runOperation(request: DraftRulesRequest, context?: OperationContext): Promise<OperationEnvelope<"draft-rules">>;
export function runOperation(request: DraftLayoutRequest, context?: OperationContext): Promise<OperationEnvelope<"draft-layout">>;
export function runOperation(request: CodeToSpecRequest, context?: OperationContext): Promise<OperationEnvelope<"code-to-spec">>;
export function runOperation(request: SpecToCodeRequest, context?: OperationContext): Promise<OperationEnvelope<"spec-to-code">>;
export function runOperation(request: ApplyCodeRequest, context?: OperationContext): Promise<OperationEnvelope<"apply-code">>;
export function runOperation(request: FeatureQuestionsRequest, context?: OperationContext): Promise<OperationEnvelope<"feature-questions">>;
export function runOperation(request: ExportC4Request, context?: OperationContext): Promise<OperationEnvelope<"export-c4">>;
export function runOperation(request: AssistantReplyRequest, context?: OperationContext): Promise<OperationEnvelope<"assistant-reply">>;
export function runOperation(request: OperationRequest, context?: OperationContext): Promise<OperationResult>;
export async function runOperation(request: OperationRequest, context: OperationContext = {}): Promise<OperationResult> {
  switch (request.kind) {
    case "doctor":
      return runDoctor(request, context);
    case "feature":
      return runFeature(request, context);
    case "feature-questions":
      return runFeatureQuestions(request, context);
    case "export-c4":
      return runExportC4(request, context);
    case "map-check":
      return runMapCheck(request, context);
    case "map":
      return runMap(request, context);
    case "baseline":
      return runBaseline(request, context);
    case "agents":
      return runAgents(request, context);
    case "fmt":
      return runFmt(request, context);
    case "wire":
      return runWire(request, context);
    case "check":
      return runCheck(request, context);
    case "explain-edge":
      return runExplainEdge(request, context);
    case "explain":
      return runExplain(request, context);
    case "explain-llm":
      return runExplainLlm(request, context);
    case "explain-plan":
      return runExplainPlan(request, context);
    case "explain-batch":
      return runExplainBatch(request, context);
    case "init":
      return runInit(request, context);
    case "export":
      return runExport(request, context);
    case "parse":
      return runParse(request, context);
    case "trace-plan":
      return runTracePlan(request, context);
    case "entries":
      return runEntries(request, context);
    case "coverage":
      return runCoverage(request, context);
    case "integrations":
      return runIntegrations(request, context);
    case "tour":
      return runTour(request, context);
    case "flows-discover":
      return runFlowsDiscover(request, context);
    case "flows-adopt":
      return runFlowsAdopt(request, context);
    case "flow-export":
      return runFlowExport(request, context);
    case "flow-import":
      return runFlowImport(request, context);
    case "draft-flow":
      return runDraftFlow(request, context);
    case "draft-rules":
      return runDraftRules(request, context);
    case "draft-layout":
      return runDraftLayout(request, context);
    case "code-to-spec":
      return runCodeToSpec(request, context);
    case "spec-to-code":
      return runSpecToCode(request, context);
    case "apply-code":
      return runApplyCode(request, context);
    case "assistant-reply":
      return runAssistantReply(request, context);
  }
}
