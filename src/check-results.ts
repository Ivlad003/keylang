// The results of `keylang check --format json`: diagnostics and verdicts in one
// list, a diagnostic joined with the verdict it explains. Shared by the CLI
// and the MCP server, so an agent sees exactly what CI sees.

import { createHash } from "node:crypto";
import { sameFinding } from "./assess.ts";
import { isError, type Diagnostic } from "./diag.ts";
import type { Verdict } from "./verdict.ts";

type Provenance = NonNullable<Verdict["evidence"]>["provenance"];

export interface CheckResult {
  criterion: string;
  area: string;
  /** `warning` is a diagnostic that does not fail the check (K006, K103). */
  verdict: "ok" | "fail" | "unverified" | "warning";
  evidence: string;
  snapshotId: string | null;
  file: string;
  line: number;
  col: number;
  code: string | null;
  /** SHA-256 of the rule or flow line; for a diagnostic without a verdict of its own, of its code and message. */
  specHash: string;
  /** `syntactic` unless a test report or a trace is the evidence. */
  provenance: Provenance;
  runId?: string;
  testId?: string;
}

/** Diagnostics and verdicts as one list; a verdict that repeats a diagnostic lends it its criterion, hash, and provenance. */
export function checkResults(verdicts: Verdict[], snapshotId: string | null, diags: Diagnostic[]): CheckResult[] {
  const fromDiags = diags.map((diag): CheckResult => {
    const owner = verdicts.find((verdict) => sameFinding(verdict, [diag]));
    return {
      criterion: owner?.criterion ?? diag.criterion ?? diag.code,
      area: owner?.area ?? diag.area ?? diag.file,
      verdict: isError(diag) ? "fail" : "warning",
      evidence: diag.message,
      snapshotId,
      file: diag.file,
      line: diag.span.start.line,
      col: diag.span.start.col,
      code: diag.code,
      specHash: owner?.specHash ?? createHash("sha256").update(`${diag.code}\0${diag.message}`).digest("hex"),
      ...(owner?.evidence ?? { provenance: "syntactic" }),
    };
  });
  const fromVerdicts = verdicts
    .filter((verdict) => !sameFinding(verdict, diags))
    .map((verdict): CheckResult => ({
      criterion: verdict.criterion,
      area: verdict.area,
      verdict: verdict.verdict,
      evidence: verdict.message,
      snapshotId: verdict.snapshotId,
      file: verdict.file,
      line: verdict.line,
      col: verdict.col,
      code: verdict.code,
      specHash: verdict.specHash,
      ...(verdict.evidence ?? { provenance: "syntactic" }),
    }));
  return [...fromDiags, ...fromVerdicts];
}
