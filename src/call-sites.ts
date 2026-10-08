// What the coverage report and the integrations inventory read beside the
// snapshot (business-flows/13, 14): every call written in the analysed files
// with the node that encloses it, matched against lists kept as data
// (`resources/*.json`), and reachability from entry points over the
// snapshot's resolved call edges. The snapshot keeps edges only for calls
// into the repository's own code, so calls into packages and built-ins come
// from the extracted facts: the fact cache when it holds the file's current
// content, else the file read again. The extractors record no arguments; the
// first ones are read from the source text at the call's position. Language
// independent: the facts have one shape for TS/JS, Python, Rust and PHP.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isAnalysed, type Config } from "./config.ts";
import type { CallFact, DeclFact, FileFacts } from "./extract/facts.ts";
import { FACT_CACHE_FILE } from "./fact-cache.ts";
import { frontendFor } from "./frontends.ts";
import { languageOf, type Language } from "./languages.ts";
import type { AnalysisSnapshot, SnapshotNode } from "./snapshot.ts";
import { compareText } from "./span.ts";

/** A data file of `resources/`, beside `src/` and `dist/` alike. */
export function resourcePath(name: string): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "resources", name);
}

/**
 * How a data list names what it looks for. A call matches when any of
 * `callees`, `imports` or `receivers` matches; `methods` narrows `imports`
 * and `receivers` to calls whose last name is listed. `text` matches source
 * lines (a read such as `process.env.X`, which is no call); `languages`
 * limits the matcher to files of those languages.
 */
export interface Matcher {
  /** Regular expressions over the callee as the facts write it: `fetch`, `curl_exec`, `this.scopeConfig.getValue`, `reqwest::get`. */
  callees?: string[];
  /**
   * What an import names: a package (`axios`, `@aws-sdk/*`), a Python module
   * (`requests`), a Rust crate path (`reqwest`), a PHP class or namespace
   * (`GuzzleHttp\`). Exact, a prefix ending in `/`, `\`, `.` or `::`, or a
   * prefix with a trailing `*`. A call through a name such an import binds,
   * or on a receiver of such a class, matches.
   */
  imports?: string[];
  /** Classes of the receiver, fully qualified (`Magento\Framework\App\Config\ScopeConfigInterface`) or by their last name. */
  receivers?: string[];
  methods?: string[];
  /** Regular expressions over one source line; comment lines are skipped. */
  text?: string[];
  languages?: Language[];
}

/** A call written in an analysed file. */
export interface CallSite {
  file: string;
  line: number;
  col: number;
  endLine: number;
  endCol: number;
  callee: string;
  /** The receiver's class, as the facts name it. */
  receiver?: string;
  /** The innermost fn the call is written in; else its class or module; null when no node holds it. */
  in: string | null;
}

/** A read of a name keylang has no call for (`settings.X`), or a source line a `text` pattern matched. */
export interface ReadSite {
  file: string;
  line: number;
  col: number;
  text: string;
  in: string | null;
}

/** The facts of one analysed file with what a matcher needs: the imports by the local name they bind. */
export interface FileCalls {
  file: string;
  language: Language | undefined;
  calls: CallSite[];
  reads: ReadSite[];
  /** Local name → the import's source. */
  bound: Map<string, string>;
  /** Every import's source with its line. */
  imports: { source: string; line: number; text: string }[];
}

type Stored = { schema?: unknown; files?: Record<string, { sha256?: unknown; facts?: unknown }> };

/**
 * The facts of every analysed file of the snapshot, in path order: the fact
 * cache's entry when its hash is the manifest's (an analysis that saves the
 * cache has just written it), else the file extracted again. A file that
 * cannot be read or parsed gives none.
 */
export async function snapshotFacts(config: Config, snapshot: AnalysisSnapshot): Promise<FileFacts[]> {
  let stored: Stored["files"] = {};
  try {
    const value = JSON.parse(readFileSync(join(config.root, FACT_CACHE_FILE), "utf8")) as Stored;
    if (typeof value === "object" && value !== null && typeof value.files === "object" && value.files !== null) stored = value.files;
  } catch {
    // No cache, or a damaged one: every file is extracted.
  }
  const out: FileFacts[] = [];
  for (const { path, sha256 } of snapshot.manifest.files) {
    if (!isAnalysed(path, config)) continue;
    const entry = stored[path];
    if (entry !== undefined && entry.sha256 === sha256 && isFacts(entry.facts)) {
      out.push(entry.facts);
      continue;
    }
    const frontend = frontendFor(path);
    if (frontend === undefined) continue;
    try {
      out.push(await frontend.extract(path, readFileSync(join(config.root, path), "utf8")));
    } catch {
      // Unreadable or unparsable now: the snapshot already has its hole.
    }
  }
  return out;
}

function isFacts(value: unknown): value is FileFacts {
  if (typeof value !== "object" || value === null) return false;
  const facts = value as Partial<FileFacts>;
  return typeof facts.path === "string" && Array.isArray(facts.decls) && Array.isArray(facts.imports) && Array.isArray(facts.moduleCalls);
}

/** Spans of the nodes declared in each file: what places a call in a fn. */
type Span = { id: string; line: number; col: number; endLine: number; endCol: number; fn: boolean };

function spansByFile(snapshot: AnalysisSnapshot): { spans: Map<string, Span[]>; modules: Map<string, string> } {
  const spans = new Map<string, Span[]>();
  const modules = new Map<string, string>();
  for (const [id, node] of Object.entries(snapshot.nodes)) {
    if (node.file === null) continue;
    if (node.kind === "module" && node.class !== true) {
      const known = modules.get(node.file);
      if (known === undefined || id.length < known.length) modules.set(node.file, id);
    }
    if ((node.kind !== "fn" && !(node.kind === "module" && node.class === true)) || !hasSpan(node)) continue;
    const list = spans.get(node.file) ?? [];
    list.push({ id, line: node.line!, col: node.col!, endLine: node.endLine!, endCol: node.endCol!, fn: node.kind === "fn" });
    spans.set(node.file, list);
  }
  return { spans, modules };
}

function hasSpan(node: SnapshotNode): boolean {
  return node.line !== null && node.col !== null && node.endLine !== undefined && node.endCol !== undefined;
}

const before = (aLine: number, aCol: number, bLine: number, bCol: number): boolean => aLine < bLine || (aLine === bLine && aCol <= bCol);

/** The innermost fn holding the position, else the innermost class, else the file's module. */
function enclosing(spans: readonly Span[] | undefined, module: string | undefined, line: number, col: number): string | null {
  let best: Span | null = null;
  for (const span of spans ?? []) {
    if (!before(span.line, span.col, line, col) || !before(line, col, span.endLine, span.endCol)) continue;
    if (best === null || (span.fn && !best.fn) || (span.fn === best.fn && before(best.line, best.col, span.line, span.col))) best = span;
  }
  return best?.id ?? module ?? null;
}

/** Calls, reads and imports of each file, each placed in the node that holds it. Sorted by file, then position. */
export function callsOf(snapshot: AnalysisSnapshot, facts: readonly FileFacts[]): FileCalls[] {
  const { spans, modules } = spansByFile(snapshot);
  const out: FileCalls[] = [];
  for (const file of [...facts].sort((a, b) => compareText(a.path, b.path))) {
    const fileSpans = spans.get(file.path);
    const module = modules.get(file.path);
    const seen = new Set<string>();
    const calls: CallSite[] = [];
    const add = (c: CallFact): void => {
      if (c.opaque === true) return;
      const key = `${c.line}:${c.col}:${c.callee}`;
      if (seen.has(key)) return;
      seen.add(key);
      calls.push({ file: file.path, line: c.line, col: c.col, endLine: c.endLine, endCol: c.endCol, callee: c.callee, ...(c.receiver !== undefined ? { receiver: c.receiver } : {}), in: enclosing(fileSpans, module, c.line, c.col) });
    };
    const walk = (decl: DeclFact): void => {
      decl.calls.forEach(add);
      decl.members.forEach(walk);
    };
    file.decls.forEach(walk);
    file.moduleCalls.forEach(add);
    calls.sort((a, b) => a.line - b.line || a.col - b.col || compareText(a.callee, b.callee));
    const reads: ReadSite[] = file.valueRefs
      .filter((ref) => ref.member !== true)
      .map((ref) => ({ file: file.path, line: ref.line, col: ref.col, text: ref.name, in: enclosing(fileSpans, module, ref.line, ref.col) }));
    const bound = new Map<string, string>();
    for (const imp of file.imports) for (const binding of imp.bindings) bound.set(binding.local, imp.source);
    out.push({ file: file.path, language: languageOf(file.path), calls, reads, bound, imports: file.imports.map((imp) => ({ source: imp.source, line: imp.line, text: imp.text })) });
  }
  return out;
}

/** A matcher with its regular expressions compiled once. */
export interface CompiledMatcher {
  callees: RegExp[];
  imports: string[];
  receivers: string[];
  methods: Set<string> | null;
  text: RegExp[];
  languages: Set<string> | null;
}

export function compileMatcher(matcher: Matcher): CompiledMatcher {
  return {
    callees: (matcher.callees ?? []).map((source) => new RegExp(source)),
    imports: (matcher.imports ?? []).map(withoutRoot),
    receivers: (matcher.receivers ?? []).map(withoutRoot),
    methods: matcher.methods === undefined ? null : new Set(matcher.methods),
    text: (matcher.text ?? []).map((source) => new RegExp(source)),
    languages: matcher.languages === undefined ? null : new Set(matcher.languages),
  };
}

/** A PHP name written fully qualified (`\Foo\Bar`) is the name without the leading `\`. */
function withoutRoot(name: string): string {
  return name.replace(/^\\+/, "");
}

/** Whether an import's source is one the pattern names: exact, under a separator-ended prefix, or under a `*` prefix. */
export function importMatches(source: string, pattern: string): boolean {
  const name = withoutRoot(source);
  if (pattern.endsWith("*")) return name.startsWith(pattern.slice(0, -1));
  if (name === pattern) return true;
  if (/[/\\.]$|::$/.test(pattern)) return name.startsWith(pattern);
  return ["/", "\\", ".", "::"].some((sep) => name.startsWith(`${pattern}${sep}`));
}

const segmentCache = new WeakMap<CallSite, string[]>();

/** The segments of a call's callee, split once. */
function segmentsOf(site: CallSite): string[] {
  let parts = segmentCache.get(site);
  if (parts === undefined) {
    parts = segments(site.callee);
    segmentCache.set(site, parts);
  }
  return parts;
}

/** Segments of a callee: `this.config.getValue` → this, config, getValue; `reqwest::get` → reqwest, get. */
function segments(callee: string): string[] {
  return callee.split(/::|\.|->/).filter((part) => part !== "");
}

/** The last segment of a class name: `Magento\Framework\HTTP\Client\Curl` → `Curl`. */
function lastName(name: string): string {
  return name.split(/\\|::|\./).at(-1) ?? name;
}

/** Whether the matcher applies to files of this language. */
export function appliesTo(matcher: CompiledMatcher, language: Language | undefined): boolean {
  return matcher.languages === null || (language !== undefined && matcher.languages.has(language));
}

/**
 * Whether the call matches. `internal`: the call resolved to the repository's
 * own code (a local `fetch`), which no `callees` pattern may claim.
 */
export function callMatches(matcher: CompiledMatcher, site: CallSite, file: FileCalls, internal: boolean): boolean {
  if (!appliesTo(matcher, file.language)) return false;
  if (!internal && matcher.callees.some((re) => re.test(site.callee))) return true;
  if (matcher.imports.length === 0 && matcher.receivers.length === 0) return false;
  const parts = segmentsOf(site);
  const method = parts.at(-1) ?? site.callee;
  const methodOk = matcher.methods === null || matcher.methods.has(method);
  if (!methodOk) return false;
  if (matcher.imports.length > 0) {
    const sources: string[] = [];
    const head = parts[0];
    // The head is a name an import binds (`axios.get`, `requests.post`, `new Client()`), or a crate path (`reqwest::get`).
    if (head !== undefined) {
      const source = file.bound.get(head);
      if (source !== undefined) sources.push(source);
      if (site.callee.includes("::")) sources.push(parts.slice(0, -1).join("::"));
    }
    const bareCall = file.bound.get(site.callee);
    if (bareCall !== undefined) sources.push(bareCall);
    if (site.receiver !== undefined) sources.push(file.bound.get(site.receiver) ?? site.receiver);
    if (sources.some((source) => matcher.imports.some((pattern) => importMatches(source, pattern)))) return true;
  }
  if (matcher.receivers.length > 0 && site.receiver !== undefined) {
    const written = withoutRoot(file.bound.get(site.receiver) ?? site.receiver);
    if (matcher.receivers.some((name) => name === written || (!/\\|::|\./.test(name) && name === lastName(written)))) return true;
  }
  return false;
}

/** Whether a read (`settings.PAYMENT_URL`) goes through a name an import the matcher lists binds. */
export function readMatches(matcher: CompiledMatcher, read: ReadSite, file: FileCalls): boolean {
  if (!appliesTo(matcher, file.language) || matcher.imports.length === 0) return false;
  const parts = segments(read.text);
  const source = parts[0] === undefined ? undefined : file.bound.get(parts[0]);
  if (source === undefined || parts.length < 2) return false;
  if (matcher.methods !== null && !matcher.methods.has(parts.at(-1)!)) return false;
  return matcher.imports.some((pattern) => importMatches(source, pattern));
}

/** Lines that are comments in every language keylang reads, as far as one line shows. */
const COMMENT_LINE = /^\s*(\/\/|#(?!\[)|\/\*|\*|--)/;

/** Source lines the matcher's `text` patterns match, each placed in its node: 1-based line, column of the match. */
export function textMatches(matcher: CompiledMatcher, file: FileCalls, source: string, place: (line: number, col: number) => string | null): ReadSite[] {
  if (matcher.text.length === 0 || !appliesTo(matcher, file.language)) return [];
  const out: ReadSite[] = [];
  source.split("\n").forEach((text, index) => {
    if (COMMENT_LINE.test(text)) return;
    for (const re of matcher.text) {
      const found = re.exec(text);
      if (found === null) continue;
      out.push({ file: file.file, line: index + 1, col: found.index + 1, text: found[0], in: place(index + 1, found.index + 1) });
      break;
    }
  });
  return out;
}

/** A placer of positions of one file in its nodes, for matches the facts do not place. */
export function placer(snapshot: AnalysisSnapshot): (file: string, line: number, col: number) => string | null {
  const { spans, modules } = spansByFile(snapshot);
  return (file, line, col) => enclosing(spans.get(file), modules.get(file), line, col);
}

/** `file:line:col` of every call edge that resolved into the repository: no built-in or package is called there. */
export function internalCallPositions(snapshot: AnalysisSnapshot): Set<string> {
  const out = new Set<string>();
  for (const edge of snapshot.edges) if (edge.kind === "call" && edge.file !== null && (edge.target !== null || edge.resolution === "ambiguous")) out.add(`${edge.file}:${edge.line}:${edge.col}`);
  return out;
}

/** The resolved call edges as adjacency: source → targets, and target → sources. Hook (`via`) edges included. */
export function callGraph(snapshot: AnalysisSnapshot): { out: Map<string, Set<string>>; in: Map<string, Set<string>> } {
  const out = new Map<string, Set<string>>();
  const inward = new Map<string, Set<string>>();
  for (const edge of snapshot.edges) {
    if (edge.kind !== "call" || edge.target === null || edge.resolution !== "resolved") continue;
    if (!out.has(edge.source)) out.set(edge.source, new Set());
    out.get(edge.source)!.add(edge.target);
    if (!inward.has(edge.target)) inward.set(edge.target, new Set());
    inward.get(edge.target)!.add(edge.source);
  }
  return { out, in: inward };
}

/** Every node reachable from the starts over the adjacency, the starts included. */
export function reachable(adjacency: ReadonlyMap<string, ReadonlySet<string>>, starts: Iterable<string>): Set<string> {
  const seen = new Set<string>();
  const stack = [...starts];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of adjacency.get(id) ?? []) if (!seen.has(next)) stack.push(next);
  }
  return seen;
}

/** A file of tests: its fns are not expected to be reached from an entry point. */
export function isTestFile(path: string): boolean {
  return /(^|\/)(tests?|__tests__|specs?|Test)\//.test(path) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(path) || /(^|\/)test_[^/]*\.py$|_test\.py$/.test(path) || /Test\.php$/.test(path);
}

/** Lines of a source text, for reading a call's arguments. */
export function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

/**
 * The URL a call names: the host of a literal absolute URL among its first two
 * arguments (a literal prefix counts: `"https://api.x.com/" + id`),
 * `dynamic` when an argument there is an expression, `n/a` when the call has
 * no arguments, only literals that are no URL, or no argument list keylang
 * can read at its position.
 */
export function urlOf(text: string, starts: readonly number[], line: number, col: number, callee: string): { url: "literal" | "dynamic" | "n/a"; host: string | null } {
  const args = firstArguments(text, starts, line, col, callee, 2);
  if (args === null || args.length === 0) return { url: "n/a", host: null };
  let dynamic = false;
  for (const arg of args) {
    const value = arg.replace(/^[A-Za-z_]\w*\s*(=(?!=)|:(?!:))\s*/, "");
    const literal = /^(?:[rRbBuU]|[fF])?(['"`])/.exec(value);
    if (literal === null) {
      dynamic = true;
      continue;
    }
    const quote = literal[1]!;
    const body = value.slice(literal[0].length);
    const end = body.indexOf(quote);
    const prefix = (end === -1 ? body : body.slice(0, end)).split(/\$\{|\{|\$/)[0]!;
    const host = /^[a-z][a-z0-9+.-]*:\/\/([^/:?#\s]+)/i.exec(prefix)?.[1];
    if (host !== undefined && host !== "") return { url: "literal", host };
  }
  return dynamic ? { url: "dynamic", host: null } : { url: "n/a", host: null };
}

/** The first `max` arguments of the call at the position, as written: after the callee's last name; null when no argument list follows it. */
function firstArguments(text: string, starts: readonly number[], line: number, col: number, callee: string, max: number): string[] | null {
  const at = (starts[line - 1] ?? -1) + col - 1;
  if (at < 0 || at >= text.length) return null;
  const name = segments(callee).at(-1) ?? callee;
  const window = text.slice(at, at + 400);
  const found = new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(::\\s*<[^;{}]*?>\\s*)?\\(`).exec(window);
  if (found === null || /[;{}]/.test(window.slice(0, found.index))) return null;
  const open = at + found.index + found[0].length - 1;
  const args: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = "";
  for (let i = open + 1; i < Math.min(text.length, open + 4000); i++) {
    const ch = text[i]!;
    if (quote !== null) {
      current += ch;
      if (ch === "\\") {
        current += text[i + 1] ?? "";
        i++;
      } else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    if (ch === ")" || ch === "]" || ch === "}") {
      if (depth === 0) {
        if (current.trim() !== "") args.push(current.trim());
        return args.slice(0, max);
      }
      depth--;
    }
    if (ch === "," && depth === 0) {
      args.push(current.trim());
      if (args.length >= max) return args;
      current = "";
      continue;
    }
    current += ch;
  }
  return args.slice(0, max);
}

/** A text read once per file. */
export function sourceReader(root: string): (file: string) => { text: string; starts: number[] } | null {
  const cache = new Map<string, { text: string; starts: number[] } | null>();
  return (file) => {
    if (cache.has(file)) return cache.get(file)!;
    let value: { text: string; starts: number[] } | null = null;
    try {
      const text = readFileSync(join(root, file), "utf8");
      value = { text, starts: lineStarts(text) };
    } catch {
      value = null;
    }
    cache.set(file, value);
    return value;
  };
}
