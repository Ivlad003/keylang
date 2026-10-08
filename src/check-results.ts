// The results of `keylang check --format json`: diagnostics and verdicts in one
// list, a diagnostic joined with the verdict it explains. Shared by the CLI,
// the MCP server and the TUI (the check operation and the findings panel), so
// an agent sees exactly what CI sees.

import { createHash } from "node:crypto";
import { sameFinding } from "./assess.ts";
import { formatDiagnostic, isError, type Diagnostic, type K005Reason } from "./diag.ts";
import { formatVerdict, type Verdict } from "./verdict.ts";

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
  /** Set on a K005 result only. */
  reason?: K005Reason;
  /** Set on an `unverified` rule result only: `file:line:col` of the coverage entry (the hole) that left it unverified. */
  hole?: string;
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
      specHash: owner?.specHash ?? diag.specHash ?? createHash("sha256").update(`${diag.code}\0${diag.message}`).digest("hex"),
      ...(owner?.evidence ?? { provenance: "syntactic" }),
      ...(diag.code === "K005" && diag.reason !== undefined ? { reason: diag.reason } : {}),
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
      ...(verdict.hole !== undefined ? { hole: verdict.hole } : {}),
    }));
  return [...fromDiags, ...fromVerdicts];
}

/** What `keylang check` reports, whatever the format: the verdicts decide it, the format only shows it. */
export interface CheckReport {
  /** The `--format json` results. */
  results: CheckResult[];
  /** The `--format human` lines: every diagnostic, then the verdicts that repeat none (an `ok` only for an evidence channel). */
  lines: string[];
  counts: CheckCounts;
}

/** The summary on stderr: errors and failed verdicts, unverified and ok verdicts. */
export interface CheckCounts {
  fail: number;
  unverified: number;
  ok: number;
  /**
   * Only when two or more unverified verdicts name one hole: how many
   * unverified verdicts name a hole, and how many different holes they name.
   */
  holes?: { unverified: number; holes: number };
}

/** Evidence channels whose `ok` the human lines keep. */
const CHANNELS: ReadonlySet<string> = new Set(["ID", "static", "tests", "trace", "migration"]);

export function checkReport(verdicts: Verdict[], snapshotId: string | null, diags: Diagnostic[]): CheckReport {
  const own = verdicts.filter((verdict) => !sameFinding(verdict, diags));
  // One hole leaves every rule whose area holds it unverified: the summary counts it once.
  const fromHoles = verdicts.filter((verdict) => verdict.verdict === "unverified" && verdict.hole !== undefined);
  const holes = new Set(fromHoles.map((verdict) => verdict.hole)).size;
  return {
    results: checkResults(verdicts, snapshotId, diags),
    lines: [...diags.map(formatDiagnostic), ...own.filter((verdict) => verdict.verdict !== "ok" || CHANNELS.has(verdict.criterion)).map(formatVerdict)],
    counts: {
      fail: diags.filter(isError).length + own.filter((verdict) => verdict.verdict === "fail").length,
      unverified: verdicts.filter((verdict) => verdict.verdict === "unverified").length,
      ok: verdicts.filter((verdict) => verdict.verdict === "ok").length,
      ...(fromHoles.length > holes ? { holes: { unverified: fromHoles.length, holes } } : {}),
    },
  };
}

/** The exit code of `keylang check`: 1 for a failure, or with `strict` for an unverified verdict; else 0 — an unverified one stays visible. */
export function checkExitCode(counts: CheckCounts, strict: boolean): 0 | 1 {
  return counts.fail > 0 || (strict && counts.unverified > 0) ? 1 : 0;
}
