// One rule outcome. `fail` is a known violation, `unverified` is missing evidence, `ok` is a covered pass.

export type VerdictKind = "ok" | "fail" | "unverified";

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
}

export function formatVerdict(v: Verdict): string {
  const tag = v.code ?? v.verdict;
  return `${v.file}:${v.line}:${v.col}: ${tag} ${v.message}`;
}
