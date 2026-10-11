// Test-runner reports as evidence for `test <file> "<name>"` in a flow.
// A report proves the current code only when it names the snapshot it ran
// against; a third-party report without that link stays unverified.
//
// Feeds the evidence step of `check` (spec rules over flows), beside trace
// evidence. Entry points: `loadReports` (JSON or JUnit XML files),
// `parseJsonReport`, `parseJunit` and `matchTest` (a flow's `test` → verdict).

import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { toPosix } from "./config.ts";
import { isJsonObject, isJsonString, parseJson, type JsonValue } from "./json.ts";

/** A test's outcome; a skip proves nothing. */
export type TestStatus = "pass" | "fail" | "skip";

/** One test result from a report, with the snapshot it ran against. */
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

/** The JSON report schema version this module reads. */
export const REPORT_SCHEMA = 1;

/** Read report files (JSON or JUnit XML). Malformed input is an error naming the file. */
export function loadReports(root: string, files: readonly string[]): TestCase[] {
  return files.flatMap((file) => {
    // A report saved with a byte order mark is the same report.
    const text = readFileSync(join(root, file), "utf8").replace(/^\uFEFF/, "");

    // The format is sniffed, not taken from the extension: XML starts with `<`.
    return /^\s*</.test(text) ? parseJunit(file, text, root) : parseJsonReport(file, text);
  });
}

/** The cases of a keylang JSON report; every malformed field is an error naming the file and the field. */
export function parseJsonReport(file: string, text: string): TestCase[] {
  let body: JsonValue;

  try {
    body = parseJson(text);
  } catch (e) {
    throw new Error(`${file}: invalid JSON report: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Validate the envelope: an object with a supported schema and a `tests` array.
  if (!isJsonObject(body)) throw new Error(`${file}: report must be an object`);
  const report = body;

  if (report.schemaVersion === undefined) throw new Error(`${file}: \`schemaVersion\` is missing (expected ${REPORT_SCHEMA})`);

  if (report.schemaVersion !== REPORT_SCHEMA) throw new Error(`${file}: unsupported report schemaVersion ${JSON.stringify(report.schemaVersion)}`);

  if (!Array.isArray(report.tests)) throw new Error(`${file}: \`tests\` must be an array`);
  const snapshotId = optionalString(report.snapshotId, `${file}: \`snapshotId\``);
  const runId = optionalString(report.runId, `${file}: \`runId\``);

  // Validate each row, naming its index in errors.
  return report.tests.map((item, i): TestCase => {
    const at = `${file}: tests[${i}]`;

    if (!isJsonObject(item)) throw new Error(`${at} must be an object`);
    const row = item;

    if (!isJsonString(row.file)) throw new Error(`${at}.file must be a string`);

    if (!isJsonString(row.name)) throw new Error(`${at}.name must be a string`);

    if (row.status !== "pass" && row.status !== "fail" && row.status !== "skip") throw new Error(`${at}.status must be "pass", "fail" or "skip", got ${JSON.stringify(row.status)}`);

    if (row.suite !== undefined && !isJsonString(row.suite)) throw new Error(`${at}.suite must be a string`);
    // A row may name its own snapshot; without one it has the report's.
    const own = optionalString(row.snapshotId, `${at}.snapshotId`);

    return { file: row.file, suite: row.suite ?? "", name: row.name, status: row.status, snapshotId: own ?? snapshotId, runId, report: file };
  });
}

/** A field that may be missing or null (no value) or a string; any other type is an error naming it. */
function optionalString(value: JsonValue | undefined, field: string): string | null {
  if (value === undefined || value === null) return null;

  if (!isJsonString(value)) throw new Error(`${field} must be a string or null, got ${JSON.stringify(value)}`);

  return value;
}

/**
 * `path` of a JUnit `file` attribute as a flow's `test` writes it: relative
 * to the repository root, with `/`. An absolute path under the root (PHPUnit,
 * jest-junit) loses the root; any other path stays as it is.
 */
function repositoryPath(path: string, root: string): string {
  if (!isAbsolute(path)) return path;

  // Try the root as given and as resolved through links: a reporter may print either.
  for (const base of new Set([root, realRoot(root)])) {
    const rel = relative(base, path);

    if (rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)) return toPosix(rel);
  }

  return path;
}

/** The root with links resolved, or as given when it cannot be resolved. */
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

  // Walk suites down to testcases. Each level's `<properties>` override the
  // ones inherited from the suites around it.
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
      // A failure or error child fails the case, a skipped child skips it; none passes it.
      const has = (tag: string): boolean => element.children.some((child) => child.name === tag);
      const status: TestStatus = has("failure") || has("error") ? "fail" : has("skipped") ? "skip" : "pass";
      const common = { name, status, snapshotId: scope.get("keylang.snapshotId") ?? null, runId: scope.get("keylang.runId") ?? null, report: file };

      // With `file`, the classname is the suite; without it, the classname is
      // the best guess at a file and the case is marked fileless.
      if (path !== undefined) cases.push({ file: repositoryPath(path, repository), suite: classname ?? "", ...common });
      else cases.push({ file: classname ?? "", suite: "", ...common, fileless: true });

      return;
    }

    // Only suites and cases are descended into; other elements are ignored.
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

  // Errors are rare, so they count lines from scratch.
  const fail: (offset: number, message: string) => never = (offset, message) => {
    throw new Error(`${file}:${text.slice(0, offset).split("\n").length}: invalid XML: ${message}`);
  };

  // Match a sticky (`y`) regex exactly at the cursor.
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

  // A single forward scan: text up to the next `<` belongs to the open element,
  // then the markup at `<` is dispatched by its opening characters.
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
      // End tag `</name>`: it must close the innermost open element.
      const close = sticky(/<\/([^\s>]+)\s*>/y);

      if (!close) fail(at, "malformed end tag");
      const open = stack.pop();

      if (!open || open.name !== close[1]) fail(at, `</${close[1]}> does not close ${open ? `<${open.name}>` : "any element"}`);
      at += close[0].length;
    } else {
      // Start tag: its name, then attributes until `>` or `/>`.
      const start = at;
      const tag = sticky(/<([^\s/>]+)/y);

      if (!tag) fail(at, "malformed start tag");
      at += tag[0].length;
      const element: XmlElement = { name: tag[1] ?? "", attributes: {}, children: [], text: "", line: lineOf(start) };

      for (;;) {
        const space = sticky(/\s*/y)?.[0] ?? "";
        at += space.length;

        if (text.startsWith("/>", at) || text.startsWith(">", at)) break;
        // `name = "` or `name='`: the value runs to the next matching quote.
        // Attributes must be separated by whitespace.
        const attribute = sticky(/([^\s=/>]+)\s*=\s*(["'])/y);

        if (!attribute || space === "") fail(at, `malformed attribute in <${element.name}>`);
        at += attribute[0].length;
        const end = text.indexOf(attribute[2] ?? "", at);

        if (end === -1) fail(at, `unterminated attribute value in <${element.name}>`);
        element.attributes[attribute[1] ?? ""] = decodeEntities(text.slice(at, end));
        at = end + 1;
      }

      // Attach to the parent (or make it the root); a self-closing tag is never opened.
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

const NAMED_ENTITIES = new Map([
  ["lt", "<"],
  ["gt", ">"],
  ["amp", "&"],
  ["quot", '"'],
  ["apos", "'"],
]);

/** Text with XML's five named entities and decimal or hex character references decoded; anything else stays as written. */
function decodeEntities(text: string): string {
  // An out-of-range character reference is left as written instead of throwing.
  return text.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (whole, entity: string) => {
    if (!entity.startsWith("#")) return NAMED_ENTITIES.get(entity) ?? whole;
    const code = entity[1] === "x" ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);

    return code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

/** The verdict for one `test` line of a flow, with the reason shown to the user. */
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

  // Only a current, non-skipped result is a verdict; everything else is unverified.
  if (hit.snapshotId === null) return { verdict: "unverified", message: `report ${hit.report} is not bound to a snapshot`, runId: hit.runId };

  if (hit.snapshotId !== snapshotId) return { verdict: "unverified", message: `stale report ${hit.report} (snapshot ${hit.snapshotId.slice(0, 12)})`, runId: hit.runId };

  if (hit.status === "skip") return { verdict: "unverified", message: `skipped in ${hit.report}`, runId: hit.runId };

  if (hit.status === "fail") return { verdict: "fail", message: `failed in ${hit.report}`, runId: hit.runId };

  return { verdict: "ok", message: `passed in ${hit.report}`, runId: hit.runId };
}
