// `keylang integrations [--json]`, the MCP tool `list_integrations` and the
// TUI's «Integrations» (business-flows/14): outgoing clients, incoming
// webhooks and queues of the current snapshot, read-only. One text for the
// CLI and the F6 report, one JSON shape for `--json` and MCP. A view (ADR
// 0014); no integration is ever contacted.

import { isAbsolute } from "node:path";
import { analyze, type Analysis } from "../analyze.ts";
import { errorText } from "../diag.ts";
import { specifiedTriggers } from "../discover.ts";
import { findIntegrations, integrationsText, loadIntegrations } from "../integrations.ts";
import { empty } from "./shared.ts";
import type { IntegrationsRequest, OperationContext, OperationEnvelope } from "./types.ts";

/**
 * The inventory over a fresh snapshot of the saved code and the hand-written
 * specs. Code 0 with the inventory (empty included); 2 with no payload for a
 * broken keylang.json, a repository without code, or an unreadable data file.
 */
export async function runIntegrations(request: IntegrationsRequest, context: OperationContext): Promise<OperationEnvelope<"integrations">> {
  if (!isAbsolute(request.root)) return empty("integrations", "failed", 2, "integrations: root must be an absolute path");
  if (context.signal?.aborted) return empty("integrations", "cancelled", null);
  context.onProgress?.({ text: "reading a fresh snapshot of the saved code" });
  let analyzed: Analysis;
  try {
    analyzed = await (context.analyze ?? analyze)({ root: request.root, withoutEvidence: true, saveFacts: true });
  } catch (error) {
    return empty("integrations", "failed", 2, `integrations: ${errorText(error)}`);
  }
  if (context.signal?.aborted) return empty("integrations", "cancelled", null);
  const snapshot = analyzed.snapshot;
  if (snapshot === null) return empty("integrations", "failed", 2, "integrations: no code to read (`languages` in keylang.json is empty)");
  context.onProgress?.({ text: "matching calls against resources/integrations.json" });
  try {
    const report = await findIntegrations(analyzed.config, snapshot, loadIntegrations(), specifiedTriggers(analyzed.spec.flows));
    if (context.signal?.aborted) return empty("integrations", "cancelled", null);
    const text = integrationsText(report);
    return { ...empty("integrations", "completed", 0), payload: { ...report, text }, messages: text.trimEnd().split("\n").map((line) => ({ level: "info" as const, text: line })) };
  } catch (error) {
    return empty("integrations", "failed", 2, `integrations: ${errorText(error)}`);
  }
}
