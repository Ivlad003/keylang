// Test-runner reports as evidence for `test <file> "<name>"` in a flow.
// A report proves the current code only when it names the snapshot it ran
// against; a third-party report without that link stays unverified.

import { readFileSync } from "node:fs";
import { join } from "node:path";

export type TestStatus = "pass" | "fail" | "skip";

export interface TestCase {
  file: string;
  /** Enclosing suites, outermost first, joined with ` > `. Empty for a top-level test. */
  suite: string;
  name: string;
  status: TestStatus;
  snapshotId: string | null;
  runId: string | null;
  /** Report file the case came from. */
  report: string;
}

/** keylang JSON report, schema 1 (written by the `node:test` reporter). */
export interface JsonReport {
  schemaVersion: 1;
  snapshotId: string | null;
  runId: string | null;
  tests: { file: string; suite?: string; name: string; status: TestStatus }[];
}

export const REPORT_SCHEMA = 1;

/** Read report files (JSON or JUnit XML). Malformed input is an error naming the file. */
export function loadReports(root: string, files: readonly string[]): TestCase[] {
  return files.flatMap((file) => {
    const text = readFileSync(join(root, file), "utf8");
    return /^\s*</.test(text) ? parseJunit(file, text) : parseJsonReport(file, text);
  });
}

export function parseJsonReport(file: string, text: string): TestCase[] {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch (e) {
    throw new Error(`${file}: invalid JSON report: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (typeof body !== "object" || body === null) throw new Error(`${file}: report must be an object`);
  const report = body as Record<string, unknown>;
  if (report.schemaVersion !== undefined && report.schemaVersion !== REPORT_SCHEMA) throw new Error(`${file}: unsupported report schemaVersion ${JSON.stringify(report.schemaVersion)}`);
  if (!Array.isArray(report.tests)) throw new Error(`${file}: \`tests\` must be an array`);
  const snapshotId = typeof report.snapshotId === "string" ? report.snapshotId : null;
  const runId = typeof report.runId === "string" ? report.runId : null;
  return report.tests.map((item, i): TestCase => {
    const at = `${file}: tests[${i}]`;
    if (typeof item !== "object" || item === null) throw new Error(`${at} must be an object`);
    const row = item as Record<string, unknown>;
    if (typeof row.file !== "string") throw new Error(`${at}.file must be a string`);
    if (typeof row.name !== "string") throw new Error(`${at}.name must be a string`);
    if (row.status !== "pass" && row.status !== "fail" && row.status !== "skip") throw new Error(`${at}.status must be "pass", "fail" or "skip", got ${JSON.stringify(row.status)}`);
    if (row.suite !== undefined && typeof row.suite !== "string") throw new Error(`${at}.suite must be a string`);
    return { file: row.file, suite: row.suite ?? "", name: row.name, status: row.status, snapshotId: typeof row.snapshotId === "string" ? row.snapshotId : snapshotId, runId, report: file };
  });
}

/**
 * JUnit XML: `<testcase classname file name>` with `<failure>`, `<error>` or
 * `<skipped>`. The snapshot comes from `<property name="keylang.snapshotId">`.
 */
export function parseJunit(file: string, text: string): TestCase[] {
  if (!/<testsuites?[\s>]/.test(text)) throw new Error(`${file}: not a JUnit report (no <testsuite>)`);
  const property = (name: string): string | null => {
    const hit = new RegExp(`<property\\s[^>]*name="${name.replace(/\./g, "\\.")}"[^>]*value="([^"]*)"`).exec(text);
    return hit?.[1] !== undefined ? unescapeXml(hit[1]) : null;
  };
  const snapshotId = property("keylang.snapshotId");
  const runId = property("keylang.runId");
  const cases: TestCase[] = [];
  const re = /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const attrs = attributes(m[1] ?? "");
    const inner = m[3] ?? "";
    const name = attrs.name;
    if (name === undefined) throw new Error(`${file}: <testcase> without name`);
    const status: TestStatus = /<(failure|error)\b/.test(inner) ? "fail" : /<skipped\b/.test(inner) ? "skip" : "pass";
    cases.push({ file: attrs.file ?? attrs.classname ?? "", suite: attrs.file !== undefined ? (attrs.classname ?? "") : "", name, status, snapshotId, runId, report: file });
  }
  return cases;
}

function attributes(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of text.matchAll(/([\w:.-]+)="([^"]*)"/g)) if (m[1]) out[m[1]] = unescapeXml(m[2] ?? "");
  return out;
}

function unescapeXml(text: string): string {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

export interface TestEvidence {
  verdict: "ok" | "fail" | "unverified";
  message: string;
  runId: string | null;
}

/**
 * Match `test <file> "<name>"`. The name may carry suites as `Suite > name`.
 * Identity is file, suite, and name; several matches are ambiguous.
 */
export function matchTest(cases: readonly TestCase[] | null, file: string, name: string, snapshotId: string | null): TestEvidence {
  if (cases === null) return { verdict: "unverified", message: "no report (check.tests is not configured)", runId: null };
  const inFile = cases.filter((item) => item.file === file);
  const hits = inFile.filter((item) => item.name === name || (item.suite !== "" && `${item.suite} > ${item.name}` === name));
  if (hits.length === 0) return { verdict: "unverified", message: `no report for ${file} "${name}"`, runId: null };
  if (hits.length > 1) {
    const where = [...new Set(hits.map((hit) => (hit.suite ? `${hit.suite} > ${hit.name}` : `${hit.name} (${hit.report})`)))].sort();
    return { verdict: "unverified", message: `ambiguous: ${where.join(", ")}`, runId: null };
  }
  const hit = hits[0]!;
  if (hit.snapshotId === null) return { verdict: "unverified", message: `report ${hit.report} is not bound to a snapshot`, runId: hit.runId };
  if (hit.snapshotId !== snapshotId) return { verdict: "unverified", message: `stale report ${hit.report} (snapshot ${hit.snapshotId.slice(0, 12)})`, runId: hit.runId };
  if (hit.status === "skip") return { verdict: "unverified", message: `skipped in ${hit.report}`, runId: hit.runId };
  if (hit.status === "fail") return { verdict: "fail", message: `failed in ${hit.report}`, runId: hit.runId };
  return { verdict: "ok", message: `passed in ${hit.report}`, runId: hit.runId };
}
