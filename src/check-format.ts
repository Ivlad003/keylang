// The text of one check report in each `--format`: exactly what `keylang
// check` prints on stdout. The CLI writes it; the TUI exports the same bytes
// to a file. It works on the report's data, never on a rendered screen, and
// the format never changes the verdicts or the exit code.
// Pipeline: check results (check-results.ts) → text for one output format.
// Entry points: `checkReportText`, `isCheckFormat`; formats: human, json,
// SARIF 2.1.0, GitHub workflow commands.

import type { CheckResult } from "./check-results.ts";
import { explainCode } from "./explain.ts";
import type { CoverageItem } from "./snapshot.ts";

/** The values `--format` accepts, in the order help lists them. */
export const CHECK_FORMATS = ["human", "json", "sarif", "github"] as const;

/** One `--format` value. */
export type CheckFormat = (typeof CHECK_FORMATS)[number];

/** What a format shows: the `--format json` data and the human lines of the same report. */
export interface CheckReportData {
  results: CheckResult[];
  snapshotId: string | null;
  coverage: CoverageItem[];
  lines: string[];
}

/** Whether `name` is a supported `--format` value. */
export function isCheckFormat(name: string): name is CheckFormat {
  return CHECK_FORMATS.some((format) => format === name);
}

/** The stdout of `keylang check --format <format>` for `report`, every line ending with `\n`. */
export function checkReportText(format: CheckFormat, report: CheckReportData): string {
  if (format === "human") return report.lines.map((line) => `${line}\n`).join("");

  if (format === "github") return githubText(report.results);

  if (format === "json") return `${JSON.stringify({ snapshotId: report.snapshotId, results: report.results, coverage: report.coverage }, null, 2)}\n`;

  return `${JSON.stringify(sarifLog(report), null, 2)}\n`;
}

/** One `::error`/`::warning`/`::notice` workflow command per non-ok result; ok results print nothing. */
function githubText(results: readonly CheckResult[]): string {
  let out = "";

  // Map verdicts onto GitHub annotation levels: fail → error, warning → warning, unverified → notice.
  for (const result of results) {
    if (result.verdict === "ok") continue;
    const level = result.verdict === "fail" ? "error" : result.verdict === "warning" ? "warning" : "notice";
    out += `::${level} file=${githubProperty(result.file)},line=${result.line},col=${result.col},title=${githubProperty(ruleOf(result))}::${githubData(result.evidence)}\n`;
  }

  return out;
}

/** A SARIF 2.1.0 log with one run: every non-ok result, and one rule per distinct rule id. */
function sarifLog(report: CheckReportData) {
  const { snapshotId, results } = report;
  const reported = results.filter((result) => result.verdict !== "ok");
  // Sorted so rule indexes, and hence the SARIF output, are stable across runs.
  const ruleIds = [...new Set(reported.map(ruleOf))].sort();

  return {
    $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: { driver: { name: "keylang", informationUri: "https://www.npmjs.com/package/keylang", rules: ruleIds.map((id) => ({ id, shortDescription: { text: ruleText(id) } })) } },
        // keylang counts columns in code points; SARIF's default is UTF-16 code units (§3.14.17).
        columnKind: "unicodeCodePoints",
        results: reported.map((result) => ({
          ruleId: ruleOf(result),
          ruleIndex: ruleIds.indexOf(ruleOf(result)),
          level: result.verdict === "fail" ? "error" : result.verdict === "warning" ? "warning" : "note",
          message: { text: result.evidence },
          locations: [{ physicalLocation: { artifactLocation: { uri: result.file }, region: { startLine: result.line, startColumn: result.col } } }],
          properties: sarifProperties(result),
        })),
        properties: { snapshotId },
      },
    ],
  };
}

/** What SARIF keeps of a result beside its location and message. */
type SarifProperties = Pick<CheckResult, "verdict" | "criterion" | "area" | "snapshotId" | "specHash" | "provenance" | "reason">;

function sarifProperties(result: CheckResult): SarifProperties {
  const properties: SarifProperties = {
    verdict: result.verdict,
    criterion: result.criterion,
    area: result.area,
    snapshotId: result.snapshotId,
    specHash: result.specHash,
    provenance: result.provenance,
  };

  if (result.reason !== undefined) properties.reason = result.reason;

  return properties;
}

/** The SARIF rule and GitHub title: every unverified result is `unverified`, a finding its K-code or evidence kind. */
function ruleOf(result: CheckResult): string {
  return result.verdict === "unverified" ? "unverified" : (result.code ?? result.verdict);
}

/** A flow verdict's evidence kind names its rule when it fails. */
const EVIDENCE_RULES = new Map([
  ["ID", "flow: the id is not in the snapshot"],
  ["static", "flow: no call path can reach the step from its parent"],
  ["tests", "flow: the test of the claim failed"],
  ["trace", "flow: the trace of a test contradicts the step"],
]);

/** The short description of a SARIF rule: the first line of a K-code's explanation, or a flow evidence kind's text. */
function ruleText(id: string): string {
  if (id === "unverified") return "evidence for this criterion is incomplete";

  return EVIDENCE_RULES.get(id) ?? explainCode(id)?.split("\n")[0] ?? id;
}

// GitHub workflow commands: https://docs.github.com/actions/reference/workflow-commands-for-github-actions
// Escape the message part of a workflow command, as GitHub decodes it.
function githubData(text: string): string {
  return text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

/** Escape a property value (`file=`, `title=`), which additionally must not contain `:` or `,`. */
function githubProperty(text: string): string {
  return githubData(text).replace(/:/g, "%3A").replace(/,/g, "%2C");
}
