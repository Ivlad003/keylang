// `keylang coverage [--json]`, the MCP tool `coverage_report` and the TUI's
// «Blind spots» (business-flows/13): what keylang does not see in the
// current snapshot, read-only. One text for the CLI and the F6 report, one
// JSON shape for `--json` and MCP. A view (ADR 0014): `check` never reads it.

import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { analyze, type Analysis } from "../analyze.ts";
import { coverageReport, coverageText, findDataLogic, loadDataLogic } from "../coverage-report.ts";
import { errorText } from "../diag.ts";
import { DISCOVERED_DIR, specifiedTriggers } from "../discover.ts";
import { empty, rootRelative } from "./shared.ts";
import type { CoverageRequest, OperationContext, OperationEnvelope } from "./types.ts";

/**
 * The report over a fresh snapshot of the saved code and the hand-written
 * specs. Code 0 with the report (holes and orphans are no failure); 2 with
 * no payload for a broken keylang.json, a repository without code to read,
 * or an unreadable data file.
 */
export async function runCoverage(request: CoverageRequest, context: OperationContext): Promise<OperationEnvelope<"coverage">> {
  if (!isAbsolute(request.root)) return empty("coverage", "failed", 2, "coverage: root must be an absolute path");
  if (context.signal?.aborted) return empty("coverage", "cancelled", null);
  context.onProgress?.({ text: "reading a fresh snapshot of the saved code" });
  let analyzed: Analysis;
  try {
    analyzed = await (context.analyze ?? analyze)({ root: request.root, withoutEvidence: true, saveFacts: true });
  } catch (error) {
    return empty("coverage", "failed", 2, `coverage: ${errorText(error)}`);
  }
  if (context.signal?.aborted) return empty("coverage", "cancelled", null);
  const snapshot = analyzed.snapshot;
  if (snapshot === null) return empty("coverage", "failed", 2, "coverage: no code to read (`languages` in keylang.json is empty)");
  context.onProgress?.({ text: "looking for logic in data" });
  let report;
  try {
    const signals = loadDataLogic();
    const sites = await findDataLogic(analyzed.config, snapshot, signals);
    const specDir = rootRelative(request.root, analyzed.config.dir);
    const viewDir = join(request.root, specDir, DISCOVERED_DIR);
    report = coverageReport(snapshot, specifiedTriggers(analyzed.spec.flows), signals, sites, (file) => readOrNull(join(viewDir, file)));
    if (context.signal?.aborted) return empty("coverage", "cancelled", null);
    const text = coverageText(report, specDir);
    return { ...empty("coverage", "completed", 0), payload: { ...report, text }, messages: text.trimEnd().split("\n").map((line) => ({ level: "info" as const, text: line })) };
  } catch (error) {
    return empty("coverage", "failed", 2, `coverage: ${errorText(error)}`);
  }
}

function readOrNull(abs: string): string | null {
  try {
    return readFileSync(abs, "utf8");
  } catch {
    return null;
  }
}
