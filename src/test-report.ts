// Test-runner reports as evidence for `test <file> "<name>"` in a flow.
// A report proves the current code only when it names the snapshot it ran
// against; a third-party report without that link stays unverified.

import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { toPosix } from "./config.ts";

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
  /** A JUnit testcase without a `file` attribute: `file` is then its classname, a path only for some reporters. */
  fileless?: true;
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
    // A report saved with a byte order mark is the same report.
    const text = readFileSync(join(root, file), "utf8").replace(/^\uFEFF/, "");
    return /^\s*</.test(text) ? parseJunit(file, text, root) : parseJsonReport(file, text);
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
  if (report.schemaVersion === undefined) throw new Error(`${file}: \`schemaVersion\` is missing (expected ${REPORT_SCHEMA})`);
  if (report.schemaVersion !== REPORT_SCHEMA) throw new Error(`${file}: unsupported report schemaVersion ${JSON.stringify(report.schemaVersion)}`);
  if (!Array.isArray(report.tests)) throw new Error(`${file}: \`tests\` must be an array`);
  const snapshotId = optionalString(report.snapshotId, `${file}: \`snapshotId\``);
  const runId = optionalString(report.runId, `${file}: \`runId\``);
  return report.tests.map((item, i): TestCase => {
    const at = `${file}: tests[${i}]`;
    if (typeof item !== "object" || item === null) throw new Error(`${at} must be an object`);
    const row = item as Record<string, unknown>;
    if (typeof row.file !== "string") throw new Error(`${at}.file must be a string`);
    if (typeof row.name !== "string") throw new Error(`${at}.name must be a string`);
    if (row.status !== "pass" && row.status !== "fail" && row.status !== "skip") throw new Error(`${at}.status must be "pass", "fail" or "skip", got ${JSON.stringify(row.status)}`);
    if (row.suite !== undefined && typeof row.suite !== "string") throw new Error(`${at}.suite must be a string`);
    // A row may name its own snapshot; without one it has the report's.
    const own = optionalString(row.snapshotId, `${at}.snapshotId`);
    return { file: row.file, suite: row.suite ?? "", name: row.name, status: row.status, snapshotId: own ?? snapshotId, runId, report: file };
  });
}

/** A field that may be missing or null (no value) or a string; any other type is an error naming it. */
function optionalString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new Error(`${field} must be a string or null, got ${JSON.stringify(value)}`);
  return value;
}

/**
 * `path` of a JUnit `file` attribute as a flow's `test` writes it: relative
 * to the repository root, with `/`. An absolute path under the root (PHPUnit,
 * jest-junit) loses the root; any other path stays as it is.
 */
function repositoryPath(path: string, root: string): string {
  if (!isAbsolute(path)) return path;
  for (const base of new Set([root, realRoot(root)])) {
    const rel = relative(base, path);
    if (rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)) return toPosix(rel);
  }
  return path;
}

function realRoot(root: string): string {
  try {
    return realpathSync(root);
  } catch {
    return root;
  }
}

/**
 * JUnit XML: `<testcase classname file name>` with `<failure>`, `<error>` or
 * `<skipped>`, in `<testsuite>`s that may nest under `<testsuites>`. The
 * snapshot comes from `<property name="keylang.snapshotId">` of the testcase
 * or of the nearest suite around it: each suite of a merged report keeps its own.
 * An absolute `file` under `repository` is made relative to it.
 */
export function parseJunit(file: string, text: string, repository: string): TestCase[] {
  const root = parseXml(file, text);
  if (root.name !== "testsuites" && root.name !== "testsuite") throw new Error(`${file}: not a JUnit report (no <testsuite>)`);
  const cases: TestCase[] = [];
  const visit = (element: XmlElement, inherited: ReadonlyMap<string, string>): void => {
    const scope = new Map(inherited);
    for (const properties of element.children.filter((child) => child.name === "properties")) {
      for (const property of properties.children.filter((child) => child.name === "property")) {
        const name = property.attributes.name;
        if (name === undefined) throw new Error(`${file}:${property.line}: <property> without name`);
        scope.set(name, property.attributes.value ?? property.text.trim());
      }
    }
    if (element.name === "testcase") {
      const { name, file: path, classname } = element.attributes;
      if (name === undefined) throw new Error(`${file}:${element.line}: <testcase> without name`);
      const has = (tag: string): boolean => element.children.some((child) => child.name === tag);
      const status: TestStatus = has("failure") || has("error") ? "fail" : has("skipped") ? "skip" : "pass";
      const common = { name, status, snapshotId: scope.get("keylang.snapshotId") ?? null, runId: scope.get("keylang.runId") ?? null, report: file };
      if (path !== undefined) cases.push({ file: repositoryPath(path, repository), suite: classname ?? "", ...common });
      else cases.push({ file: classname ?? "", suite: "", ...common, fileless: true });
      return;
    }
    for (const child of element.children) if (child.name === "testsuite" || child.name === "testsuites" || child.name === "testcase") visit(child, scope);
  };
  visit(root, new Map());
  return cases;
}

interface XmlElement {
  name: string;
  attributes: Record<string, string>;
  children: XmlElement[];
  /** Character data directly inside the element. */
  text: string;
  line: number;
}

/**
 * The element tree of an XML document: tags, attributes in either quote,
 * the predefined and numeric entities, comments, CDATA, processing
 * instructions and a DOCTYPE. Enough to read a report; not a validating parser.
 */
function parseXml(file: string, text: string): XmlElement {
  let at = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  // Lines of start tags, counted forward once: a report may hold thousands of testcases.
  let line = 1;
  let counted = 0;
  const lineOf = (offset: number): number => {
    for (; counted < offset; counted++) if (text.charCodeAt(counted) === 10) line++;
    return line;
  };
  const fail: (offset: number, message: string) => never = (offset, message) => {
    throw new Error(`${file}:${text.slice(0, offset).split("\n").length}: invalid XML: ${message}`);
  };
  const sticky = (re: RegExp): RegExpExecArray | null => {
    re.lastIndex = at;
    return re.exec(text);
  };
  const skipPast = (end: string, what: string): void => {
    const found = text.indexOf(end, at);
    if (found === -1) fail(at, `unterminated ${what}`);
    at = found + end.length;
  };
  const stack: XmlElement[] = [];
  let root: XmlElement | null = null;
  while (at < text.length) {
    const lt = text.indexOf("<", at);
    const chunk = text.slice(at, lt === -1 ? text.length : lt);
    const top = stack.at(-1);
    if (top) top.text += decodeEntities(chunk);
    else if (chunk.trim() !== "") fail(at, "text outside the root element");
    if (lt === -1) break;
    at = lt;
    if (text.startsWith("<!--", at)) skipPast("-->", "comment");
    else if (text.startsWith("<![CDATA[", at)) {
      const end = text.indexOf("]]>", at);
      if (end === -1) fail(at, "unterminated CDATA section");
      if (top) top.text += text.slice(at + "<![CDATA[".length, end);
      at = end + 3;
    } else if (text.startsWith("<?", at)) skipPast("?>", "processing instruction");
    else if (text.startsWith("<!", at)) {
      // `<!DOCTYPE …>`, whose internal subset in brackets may itself hold `>`.
      const declaration = sticky(/<!(?:[^[>]|\[[^\]]*\])*>/y);
      if (!declaration) fail(at, "unterminated declaration");
      at += declaration[0].length;
    } else if (text.startsWith("</", at)) {
      const close = sticky(/<\/([^\s>]+)\s*>/y);
      if (!close) fail(at, "malformed end tag");
      const open = stack.pop();
      if (!open || open.name !== close[1]) fail(at, `</${close[1]}> does not close ${open ? `<${open.name}>` : "any element"}`);
      at += close[0].length;
    } else {
      const start = at;
      const tag = sticky(/<([^\s/>]+)/y);
      if (!tag) fail(at, "malformed start tag");
      at += tag[0].length;
      const element: XmlElement = { name: tag[1] ?? "", attributes: {}, children: [], text: "", line: lineOf(start) };
      for (;;) {
        const space = sticky(/\s*/y)?.[0] ?? "";
        at += space.length;
        if (text.startsWith("/>", at) || text.startsWith(">", at)) break;
        const attribute = sticky(/([^\s=/>]+)\s*=\s*(["'])/y);
        if (!attribute || space === "") fail(at, `malformed attribute in <${element.name}>`);
        at += attribute[0].length;
        const end = text.indexOf(attribute[2] ?? "", at);
        if (end === -1) fail(at, `unterminated attribute value in <${element.name}>`);
        element.attributes[attribute[1] ?? ""] = decodeEntities(text.slice(at, end));
        at = end + 1;
      }
      const empty = text.startsWith("/>", at);
      at += empty ? 2 : 1;
      if (top) top.children.push(element);
      else if (root) fail(start, "more than one root element");
      else root = element;
      if (!empty) stack.push(element);
    }
  }
  const unclosed = stack.at(-1);
  if (unclosed) fail(text.length, `<${unclosed.name}> is not closed`);
  if (!root) fail(0, "no root element");
  return root;
}

const NAMED_ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function decodeEntities(text: string): string {
  return text.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (whole, entity: string) => {
    if (!entity.startsWith("#")) return NAMED_ENTITIES[entity] ?? whole;
    const code = entity[1] === "x" ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
    return code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

export interface TestEvidence {
  verdict: "ok" | "fail" | "unverified";
  message: string;
  runId: string | null;
}

/**
 * Match `test <file> "<name>"`. The name may carry suites as `Suite > name`.
 * Identity is file, suite, and name: an exact match wins, a bare name also
 * matches a test inside a suite. Several current matches are ambiguous.
 */
export function matchTest(cases: readonly TestCase[], file: string, name: string, snapshotId: string | null): TestEvidence {
  const inFile = cases.filter((item) => item.file === file);
  // An exact identity wins: `works` is the top-level test, `S > works` the one in suite S.
  const exact = inFile.filter((item) => (item.suite === "" ? item.name : `${item.suite} > ${item.name}`) === name);
  const all = exact.length > 0 ? exact : inFile.filter((item) => item.name === name);
  if (all.length === 0) {
    // A JUnit testcase without `file` (pytest's default xunit2, jest-junit by default) names no file to match: say so.
    const bare = name.split(" > ").at(-1);
    const fileless = cases.find((item) => item.fileless && (item.name === name || item.name === bare));
    return { verdict: "unverified", message: fileless ? `no report: ${fileless.report} has the test without a \`file\` attribute` : "no report", runId: null };
  }
  // Results of other snapshots are history, not rivals: only a current result can be ambiguous.
  const current = all.filter((item) => item.snapshotId !== null && item.snapshotId === snapshotId);
  if (current.length > 1) {
    const where = [...new Set(current.map((hit) => (hit.suite ? `${hit.suite} > ${hit.name}` : `${hit.name} (${hit.report})`)))].sort();
    return { verdict: "unverified", message: `ambiguous: ${where.join(", ")}`, runId: null };
  }
  // Without a current result, the first one says why it does not count: another snapshot or none.
  const hit = current[0] ?? all[0]!;
  if (hit.snapshotId === null) return { verdict: "unverified", message: `report ${hit.report} is not bound to a snapshot`, runId: hit.runId };
  if (hit.snapshotId !== snapshotId) return { verdict: "unverified", message: `stale report ${hit.report} (snapshot ${hit.snapshotId.slice(0, 12)})`, runId: hit.runId };
  if (hit.status === "skip") return { verdict: "unverified", message: `skipped in ${hit.report}`, runId: hit.runId };
  if (hit.status === "fail") return { verdict: "fail", message: `failed in ${hit.report}`, runId: hit.runId };
  return { verdict: "ok", message: `passed in ${hit.report}`, runId: hit.runId };
}
