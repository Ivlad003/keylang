// The full findings list of the current editor analysis, for the F6 panel:
// the same conversion `keylang check --format json` uses (`checkResults`), so
// criteria, codes, order, deduplication, file/line/col and provenance match
// the CLI one-to-one. The gutter stays aggregated per line; this list shows
// every finding separately, including a K102 on a line of source code.

import type { Analysis } from "../analyze.ts";
import { checkResults, type CheckResult } from "../check-results.ts";

export type FindingVerdict = CheckResult["verdict"];

/** The verdicts in the order the panel counts and filters them. */
export const VERDICTS: readonly FindingVerdict[] = ["fail", "unverified", "warning", "ok"];

/** Which verdicts the findings list shows; the report itself never changes. */
export type VerdictFilter = Record<FindingVerdict, boolean>;

/** Problems first: `ok` is the norm and stays hidden until `o` asks for it. */
export const DEFAULT_FILTER: VerdictFilter = { fail: true, unverified: true, warning: true, ok: false };

/** The panel keys that toggle a verdict of the filter. */
export const FILTER_KEYS: ReadonlyMap<string, FindingVerdict> = new Map([
  ["f", "fail"],
  ["u", "unverified"],
  ["w", "warning"],
  ["o", "ok"],
]);

export const FINDING_GLYPH: Record<FindingVerdict, string> = { fail: "✗", unverified: "◌", warning: "!", ok: "✓" };

// An analysis never changes once made, and the panel asks for its findings on every key and frame.
const cache = new WeakMap<Analysis, readonly CheckResult[]>();

/** The current analysis as the CLI reports it in `check --format json`. */
export function findingsOf(analysis: Analysis | null): readonly CheckResult[] {
  if (!analysis) return [];
  let findings = cache.get(analysis);
  if (!findings) {
    findings = checkResults(analysis.verdicts, analysis.snapshot?.snapshotId ?? null, analysis.diagnostics);
    cache.set(analysis, findings);
  }
  return findings;
}

export function visibleFindings(findings: readonly CheckResult[], filter: VerdictFilter): CheckResult[] {
  return findings.filter((result) => filter[result.verdict]);
}

/** The full counts of the report, independent of the filter: findings, not gutter lines. */
export function findingCounts(findings: readonly CheckResult[]): Record<FindingVerdict, number> {
  const counts: Record<FindingVerdict, number> = { fail: 0, unverified: 0, warning: 0, ok: 0 };
  for (const result of findings) counts[result.verdict]++;
  return counts;
}

/** The list row of one finding after its verdict glyph: code or criterion, position, message. */
export function findingRow(result: CheckResult): string {
  return `${result.code ?? result.criterion} ${result.file}:${result.line}:${result.col} ${result.evidence}`;
}

/** Whether two findings are the same one of successive analyses: the selection follows it across a rerun. */
export function sameResult(a: CheckResult, b: CheckResult): boolean {
  return a.verdict === b.verdict && a.code === b.code && a.criterion === b.criterion && a.file === b.file && a.line === b.line && a.col === b.col && a.evidence === b.evidence;
}

/** The details of the selected finding: provenance, snapshot, a K005 reason, then criterion and area. */
export function findingDetailText(result: CheckResult): string {
  return [
    `provenance ${result.provenance}`,
    ...(result.runId !== undefined ? [`run ${result.runId}`] : []),
    ...(result.testId !== undefined ? [`test ${result.testId}`] : []),
    `snapshot ${result.snapshotId?.slice(0, 8) ?? "—"}`,
    ...(result.reason !== undefined ? [`reason ${result.reason}`] : []),
    `criterion ${result.criterion}`,
    `area ${result.area}`,
  ].join(" · ");
}
