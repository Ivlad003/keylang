// Verdicts: the outcome of checking one rule, flow or other specification
// criterion against the snapshot (the resolve/rules end of Markdown -> IR ->
// resolve/rules). `fail` is a known violation, `unverified` is missing
// evidence, `ok` is a covered pass. Entry points: the `Verdict` record and
// `formatVerdict`, its one-line `file:line:col` text form.

/** The three outcomes a criterion can have; `unverified` is never folded into `ok`. */
export type VerdictKind = "ok" | "fail" | "unverified";

/** One criterion's outcome, tied to the spec position that stated it and to the snapshot and spec it was judged on. */
export interface Verdict {
  verdict: VerdictKind;
  /** What was checked, for example `deny domain infrastructure`. */
  criterion: string;
  /** The ids or files the criterion applies to. */
  area: string;
  snapshotId: string | null;
  specHash: string;
  file: string;
  line: number;
  col: number;
  /** Diagnostic code when the verdict is also a K-line. Unverified often has none. */
  code: string | null;
  message: string;
  /** Where the evidence comes from: the static graph, a test report, or a trace run. */
  evidence?: { provenance: "syntactic" | "test-report" | "trace"; runId?: string; testId?: string };
  /** An `unverified` rule verdict: `file:line:col` of the coverage entry (the hole) that left it unverified. */
  hole?: string;
}

/** One verdict as a `file:line:col: tag message` line; the tag is the diagnostic code when there is one, else the verdict kind. */
export function formatVerdict(v: Verdict): string {
  const tag = v.code ?? v.verdict;

  return `${v.file}:${v.line}:${v.col}: ${tag} ${v.message}`;
}
