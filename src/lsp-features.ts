// Language features over one analysis: pure functions from an `Analysis`, a
// document, and a position to LSP results. Positions are LSP's: 0-based line,
// UTF-16 character. The server (`lsp.ts`) owns buffers, freshness, and I/O.
//
// Place in the pipeline: a reader of one finished analysis (Text IR of the
// specs, SpecIR, diagnostics, verdicts, snapshot), shared by the language
// server and the TUI. Entry points: `workspace`, `diagnosticsFor`, `hover`
// / `hoverContent`, `definition`, `references`, `documentSymbols`,
// `workspaceSymbols`, `completions`, `signatureHelp`, `codeLenses`. The
// one unit conversion that matters: IR spans count code points, LSP
// characters count UTF-16 code units.

import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Analysis } from "./analyze.ts";
import { sameFinding } from "./assess.ts";
import { CONFIG_FILE, specPath } from "./config.ts";
import type { Diagnostic } from "./diag.ts";
import { isGeneratedMap } from "./emit.ts";
import { capText } from "./brief.ts";
import { nodeFacts, type NodeFacts } from "./explain-node.ts";
import type { StoredExplanation } from "./explanations.ts";
import { readTextOrNull } from "./files.ts";
import { kindLabel, sectionNodes, walk, type Document, type Node, type Section, type SectionKind } from "./ir.ts";
import { EXPLAINED_MAP_DIR } from "./map.ts";
import { searchNodes, type NodeHit } from "./node-search.ts";
import { isTriggerKind, keywordsAt, parse, roleAt, TRIGGER_EVENT, TRIGGER_KINDS } from "./parser.ts";
import { blocksDependency, dependencyKindOf } from "./rules.ts";
import { flowsUsing, plannedDeclaration, walkFlow, type FlowItem, type SpecIR, type Trigger } from "./spec-ir.ts";
import { spanContains, type Pos, type Span } from "./span.ts";
import type { Verdict } from "./verdict.ts";

/** A position as LSP sends it: 0-based line, UTF-16 character. */
export interface LspPosition {
  line: number;
  character: number;
}

/** A range of two LSP positions, end exclusive. */
export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

/** A place in a file, by URI. */
export interface Location {
  uri: string;
  range: LspRange;
}

/** What features read: the analysis, the root, and the text of any document. */
export interface Workspace {
  root: string;
  analysis: Analysis;
  /** Text of a root-relative path: an open buffer, a rendered map, or the file on disk. */
  text(path: string): string | null;
}

/** The workspace of one analysis: the docs as the editor shows them (open map buffers reparsed) and a text lookup that prefers open buffers. */
export function workspace(root: string, analysis: Analysis, buffers: ReadonlyMap<string, string>): Workspace {
  const mapDir = specPath(analysis.config.dir, "map/");

  // The analysis checks a generated map as the fresh render; an open buffer
  // of it that differs (a stale committed map) is what the editor shows, so
  // positions in that file come from the buffer.
  const docs = analysis.docs.map((doc) => {
    const open = buffers.get(resolve(root, doc.path));

    if (open === undefined || doc.generated === null || !doc.path.startsWith(mapDir)) return doc;

    return open === analysis.map?.files.get(doc.path.slice(mapDir.length)) ? doc : parse(doc.path, open);
  });

  const explainedDir = specPath(analysis.config.dir, `${EXPLAINED_MAP_DIR}/`);

  return {
    root,
    analysis: docs.every((doc, i) => doc === analysis.docs[i]) ? analysis : { ...analysis, docs },
    text: (path) => {
      const abs = resolve(root, path);
      const open = buffers.get(abs);

      if (open !== undefined) return open;
      // The explained map as this analysis renders it, unless a hand-written file stands there.
      const rendered = path.startsWith(explainedDir) ? analysis.map?.explained?.get(path.slice(explainedDir.length)) : undefined;

      if (rendered !== undefined) {
        const disk = readTextOrNull(abs);

        return disk === null || isGeneratedMap(disk) ? rendered : disk;
      }

      if (path.startsWith(mapDir) && analysis.map?.files.has(path.slice(mapDir.length))) {
        const doc = analysis.docs.find((d) => d.path === path);

        if (doc && doc.generated !== null) return analysis.map.files.get(path.slice(mapDir.length)) ?? null;
      }

      return readTextOrNull(abs);
    },
  };
}

// ---------- positions ----------

/** The offset of the start of each line (after each `\n`). */
function lineStarts(text: string): number[] {
  const starts = [0];

  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);

  return starts;
}

/**
 * A 1-based line and column in code points — the unit of IR spans and of
 * snapshot positions in code alike — as an LSP position (UTF-16).
 */
function lspPoint(text: string | null, line: number, col: number): LspPosition {
  const content = text?.split("\n")[line - 1];

  // A line outside the known text keeps the code-point column as is.
  if (content === undefined) return { line: line - 1, character: col - 1 };

  // Convert code points to UTF-16 units by re-joining the prefix.
  return { line: line - 1, character: [...content].slice(0, col - 1).join("").length };
}

/** An IR position as an LSP position. */
function fromPos(text: string | null, pos: Pos): LspPosition {
  return lspPoint(text, pos.line, pos.col);
}

/** An IR span as an LSP range. */
function fromSpan(text: string | null, span: Span): LspRange {
  return { start: fromPos(text, span.start), end: fromPos(text, span.end) };
}

/** A 1-based line and a column in code points, to the end of that line. */
function lineRange(text: string | null, line: number, col: number): LspRange {
  const content = text?.split("\n")[line - 1] ?? "";
  const character = [...content].slice(0, col - 1).join("").length;

  return { start: { line: line - 1, character }, end: { line: line - 1, character: Math.max(character + 1, content.length) } };
}

/** The UTF-16 offset of an LSP position (a line past the end clamps to the text's end). */
function toOffset(text: string, position: LspPosition): number {
  return (lineStarts(text)[position.line] ?? text.length) + position.character;
}

/** The `file:` URI of a root-relative path. */
function uriOf(root: string, path: string): string {
  return pathToFileURL(resolve(root, path)).href;
}

// ---------- the item under the cursor ----------

/** What the cursor can be on: an ID (a reference or a declared name) or a code link with its line. */
type Target = { kind: "id"; id: string; span: Span } | { kind: "link"; path: string; line: number; span: Span };

/** Every node of a document, depth-first, with its section and parent. */
function nodesOf(doc: Document): { node: Node; section: Section; parent: Node | null }[] {
  const out: { node: Node; section: Section; parent: Node | null }[] = [];

  for (const section of doc.sections) {
    const visit = (node: Node, parent: Node | null): void => {
      out.push({ node, section, parent });

      for (const child of node.children) visit(child, node);
    };

    for (const top of sectionNodes(section)) visit(top, null);
  }

  return out;
}

/** The id, reference, or code link at an offset of a document. Spans are half-open: the offset after an id is not in it. */
export function targetAt(doc: Document, offset: number): Target | null {
  // Nodes come outermost first; within a node, a ref beats a link, a link
  // beats the declared name, and a `planned` line names its ID anywhere.
  for (const { node } of nodesOf(doc)) {
    if (!spanContains(node.span, offset)) continue;

    for (const ref of node.refs) if (spanContains(ref.span, offset)) return { kind: "id", id: ref.target, span: ref.span };

    if (node.link && spanContains(node.link.span, offset) && node.link.line !== null) {
      // The link text is the declared name: it names the node, the target names the code.
      if (node.id && node.name && spanContains(node.name.span, offset)) return { kind: "id", id: node.id, span: node.name.span };

      return { kind: "link", path: node.link.path, line: node.link.line, span: node.link.span };
    }

    if (node.id && node.name && spanContains(node.name.span, offset)) return { kind: "id", id: node.id, span: node.name.span };

    if (node.kind === "planned" && node.id) return { kind: "id", id: node.id, span: node.span };
  }

  return null;
}

/** The document at a path: one the analysis read, else a file of the explained map. */
function docOf(ws: Workspace, path: string): Document | undefined {
  return ws.analysis.docs.find((doc) => doc.path === path) ?? readingDoc(ws, path);
}

/** The last parse of each explained map file: a frame asks for it many times over one text. */
const readingDocs = new Map<string, { text: string; doc: Document }>();

/**
 * A file of the explained map. The analysis does not check it (it is no
 * spec), but its IDs and code links lead where the map's do: hover,
 * definition and Enter in the TUI work there too.
 */
function readingDoc(ws: Workspace, path: string): Document | undefined {
  if (!path.startsWith(specPath(ws.analysis.config.dir, `${EXPLAINED_MAP_DIR}/`))) return undefined;
  const text = ws.text(path);

  if (text === null) return undefined;
  // Reparse only when the text changed since the last call.
  const cached = readingDocs.get(path);

  if (cached?.text === text) return cached.doc;
  const doc = parse(path, text);
  readingDocs.set(path, { text, doc });

  return doc;
}

/** The target at an LSP position of a document, or null. */
function at(ws: Workspace, path: string, position: LspPosition): Target | null {
  const doc = docOf(ws, path);
  const text = ws.text(path);

  if (!doc || text === null) return null;

  return targetAt(doc, toOffset(text, position));
}

// ---------- diagnostics ----------

/** A diagnostic as LSP takes it, with keylang's verdict (and a K005 reason) in `data`. */
export interface LspDiagnostic {
  range: LspRange;
  severity: 1 | 2 | 3 | 4;
  code?: string;
  message: string;
  source: "keylang";
  data: { verdict: string; reason?: string };
}

/** Diagnostics and verdicts of one document, as `check --format json` reports them. */
export function diagnosticsFor(ws: Workspace, path: string): LspDiagnostic[] {
  const text = ws.text(path);
  const { diagnostics, verdicts } = ws.analysis;
  const items: LspDiagnostic[] = [];

  // Parser and resolver diagnostics first, with their exact spans.
  for (const diag of diagnostics) {
    if (diag.file !== path) continue;
    const data: LspDiagnostic["data"] = { verdict: diag.severity === "error" ? "fail" : "warning" };

    if (diag.code === "K005" && diag.reason !== undefined) data.reason = diag.reason;
    items.push({
      range: fromSpan(text, diag.span),
      severity: diag.severity === "error" ? 1 : 2,
      code: diag.code,
      message: diag.message,
      source: "keylang",
      data,
    });
  }

  // Then the verdicts of the file, except those already said by a
  // diagnostic; they cover their line from the column on. `ok` is a hint.
  for (const verdict of verdicts) {
    if (verdict.file !== path || sameFinding(verdict, diagnostics)) continue;
    const severity = verdict.verdict === "fail" ? 1 : verdict.verdict === "unverified" ? 2 : 4;
    const head: Pick<LspDiagnostic, "range" | "severity" | "code"> = { range: lineRange(text, verdict.line, verdict.col), severity };

    if (verdict.code) head.code = verdict.code;
    items.push({ ...head, message: verdict.message, source: "keylang", data: { verdict: verdict.verdict } });
  }

  return items;
}

// ---------- hover, definition, signature ----------

/** The facts of an ID (`explain-node.ts`) with the state hover names: opaque, and a plan with or without code. */
function describe(ws: Workspace, id: string): (NodeFacts & { state: string[] }) | null {
  const facts = nodeFacts(ws.analysis, id);

  if (!facts) return null;
  const state = facts.source === "planned" ? ["planned, not implemented"] : [...(facts.opaque ? ["opaque"] : []), ...(facts.implementsPlan ? ["planned, implemented"] : [])];

  return { ...facts, state };
}

/** A piece of hover text: code (an ID, a keyword, a signature, a message's code span) is in backticks in Markdown, `strong` in bold. */
export interface HoverRun {
  text: string;
  code?: true;
  strong?: true;
}

/**
 * A hover before it is Markdown: `hover()` renders it for an LSP client, and
 * the TUI draws its parts as they are, so neither parses the other's text.
 */
export interface HoverContent {
  /** The ID the hover is about; null for the role of a keyword or of a line without an ID. */
  id: string | null;
  /** The kind, the ID and its signature; or the keyword and its role under its parent. */
  title: HoverRun[];
  /** Where the node is declared, with its state (`src/a.ts:3 · planned, implemented`), or the state alone. */
  place: string | null;
  /** The file and 1-based line that declare the node (code, or a spec for a plan), for a view that shows them. */
  declaration: { file: string; line: number } | null;
  /** One line per diagnostic and verdict: `criterion: message`, `K001: message`. */
  evidence: HoverRun[][];
  /** The flows whose steps or trigger name the ID. */
  flows: string[];
  /** The text the hover is about. */
  range: LspRange;
}

/** A hover answer: Markdown contents and the range it is about. */
type HoverResult = { contents: { kind: "markdown"; value: string }; range: LspRange };

/** Hover at a position as LSP Markdown, or null when there is nothing to say. */
export function hover(ws: Workspace, path: string, position: LspPosition): HoverResult | null {
  const content = hoverContent(ws, path, position);

  return content === null ? null : { contents: { kind: "markdown", value: hoverMarkdown(content) }, range: content.range };
}

/** The hover as LSP Markdown: title, place, a `- ` line per evidence, the flows; a blank line between them. */
export function hoverMarkdown(content: HoverContent): string {
  const flows = content.flows.length > 0 ? [`flows: ${content.flows.join(", ")}`] : [];

  return [runsMarkdown(content.title), ...(content.place === null ? [] : [content.place]), ...content.evidence.map((line) => `- ${runsMarkdown(line)}`), ...flows].join("\n\n");
}

/** Runs as Markdown: code in backticks, strong in `**`. */
function runsMarkdown(runs: readonly HoverRun[]): string {
  return runs
    .map((run) => {
      const text = run.code ? `\`${run.text}\`` : run.text;

      return run.strong ? `**${text}**` : text;
    })
    .join("");
}

/** The text of runs without the Markdown: what a terminal shows. */
export function runsText(runs: readonly HoverRun[]): string {
  return runs.map((run) => run.text).join("");
}

/**
 * Text as keylang writes roles and messages — `code spans` in backticks — as
 * runs; an unpaired backtick stays text. Rendered back, it is the same text.
 */
function inlineRuns(text: string): HoverRun[] {
  const runs: HoverRun[] = [];
  let at = 0;

  // Each backtick pair becomes a code run; the text between stays plain.
  for (const match of text.matchAll(/`([^`]*)`/g)) {
    if (match.index > at) runs.push({ text: text.slice(at, match.index) });
    runs.push({ text: match[1]!, code: true });
    at = match.index + match[0].length;
  }

  if (at < text.length) runs.push({ text: text.slice(at) });

  return runs;
}

/** An evidence line: the criterion (or the diagnostic's code), then the message. */
function evidenceLine(label: string, message: string): HoverRun[] {
  return [{ text: `${label}: ` }, ...inlineRuns(message)];
}

/** What hover says at a position: the ID under it (kind, signature, place, evidence, flows), else the role of the line. */
export function hoverContent(ws: Workspace, path: string, position: LspPosition): HoverContent | null {
  const target = at(ws, path, position);

  if (!target) return roleHover(ws, path, position);

  if (target.kind !== "id") return null;
  const info = describe(ws, target.id);

  if (!info) return null;
  const title: HoverRun[] = [{ text: info.kind, strong: true }, { text: " " }, { text: info.id, code: true }];

  if (info.signature) title.push({ text: " " }, { text: info.signature, code: true });
  // A `planned type` with fields shows its planned shape after the signature.
  const fields = plannedDeclaration(ws.analysis.docs, target.id)?.fields;

  if (fields) title.push({ text: " " }, { text: `{ ${fields.map((f) => `${f.name}${f.optional ? "?" : ""}: ${f.type}`).join("; ")} }`, code: true });
  const state = info.state.join(", ");
  const place = info.file ? `${info.file}:${info.line}${state === "" ? "" : ` · ${state}`}` : state === "" ? null : state;
  // Evidence: the verdicts on this very line for this ID, else every
  // verdict about the ID.
  const own = ws.analysis.verdicts.filter((verdict) => verdict.area === target.id && verdict.file === path && verdict.line === target.span.start.line);
  const verdicts = own.length > 0 ? own : ws.analysis.verdicts.filter((verdict) => verdict.area === target.id);
  // The same line twice (one verdict per area and line) is said once.
  const lines = new Map(verdicts.map((verdict) => [`${verdict.criterion}: ${verdict.message}`, verdict] as const));
  const evidence = [...lines.values()].map((verdict) => evidenceLine(verdict.criterion, verdict.message));
  const declaration = info.file ? { file: info.file, line: info.line } : null;

  return { id: target.id, title, place, declaration, evidence, flows: flowsUsing(ws.analysis.spec, target.id), range: fromSpan(ws.text(path), target.span) };
}

/** How hover names the section a top-level line is in. */
const PLACE: Record<SectionKind, string> = { map: "the map", rules: "rules", flow: "a flow", wiring: "wiring", migration: "a migration", system: "a system" };

/**
 * Hover on a keyword, or on a line without an ID: what the line does under
 * its parent (grammar.md §5), then the diagnostics and verdicts of that line.
 */
function roleHover(ws: Workspace, path: string, position: LspPosition): HoverContent | null {
  const doc = docOf(ws, path);
  const text = ws.text(path);

  if (!doc || text === null) return null;
  const offset = toOffset(text, position);
  // The node whose span holds the cursor. A line with an ID or a ref gets
  // the ID hover instead, unless the cursor is on its keyword.
  const hit = nodesOf(doc).find(({ node }) => spanContains(node.span, offset));

  if (!hit) return null;
  const { node, section, parent } = hit;
  const onKeyword = node.keyword !== null && spanContains(node.keyword, offset);

  if (!onKeyword && (node.id !== null || node.refs.length > 0)) return null;
  const role = roleAt(section.kind, parent?.kind, node.kind);

  if (role === null) return null;
  const where: HoverRun[] = parent ? [{ text: " under " }, { text: kindLabel(parent.kind), code: true }] : [{ text: ` in ${PLACE[section.kind]}` }];
  let detail: HoverRun[] = [];

  if (node.kind === "then") {
    const ref = node.refs[0];
    detail = ref ? [{ text: ": a reference to " }, { text: ref.target, code: true }] : [{ text: ": text, not a reference" }];
  }

  if (node.kind === "test" && section.kind === "flow" && ws.analysis.config.check.tests === undefined) detail = [{ text: "; no evidence is checked: " }, { text: "check.tests", code: true }, { text: " is not set" }];
  const title: HoverRun[] = [{ text: kindLabel(node.kind), code: true, strong: true }, ...where, { text: " — " }, ...inlineRuns(role), ...detail];
  const line = node.span.start.line;
  const { diagnostics, verdicts } = ws.analysis;
  const evidence: HoverRun[][] = [];

  for (const diag of diagnostics) if (diag.file === path && diag.span.start.line === line) evidence.push(evidenceLine(diag.code, diag.message));

  for (const verdict of verdicts) {
    if (verdict.file === path && verdict.line === line && !sameFinding(verdict, diagnostics)) evidence.push(evidenceLine(verdict.criterion, verdict.message));
  }

  return { id: null, title, place: null, declaration: null, evidence, flows: [], range: fromSpan(text, onKeyword && node.keyword ? node.keyword : node.span) };
}

/** Go to definition: a code link opens its file at its line; an ID opens its declaration (code, or a spec for a planned one). */
export function definition(ws: Workspace, path: string, position: LspPosition): Location | null {
  const target = at(ws, path, position);

  if (!target) return null;

  if (target.kind === "link") {
    // A link's path is relative to the document and may be URL-encoded.
    const file = resolve(ws.root, dirname(path), decodeURIComponent(target.path));

    return { uri: pathToFileURL(file).href, range: { start: { line: target.line - 1, character: 0 }, end: { line: target.line - 1, character: 0 } } };
  }

  const info = describe(ws, target.id);

  if (!info?.file) return null;
  // Code and spec positions both count code points; the file's text gives the UTF-16 character.
  const start = lspPoint(ws.text(info.file), info.line, info.col);

  return { uri: uriOf(ws.root, info.file), range: { start, end: start } };
}

/** One signature in a signature-help answer. */
export interface SignatureInformation {
  label: string;
  documentation?: string;
}

/** A signature-help answer: always one signature, nothing active to track. */
export interface SignatureHelp {
  signatures: SignatureInformation[];
  activeSignature: 0;
  activeParameter: 0;
}

/** The signature of the last dotted ID before the cursor on its line, with its place. */
export function signatureHelp(ws: Workspace, path: string, position: LspPosition): SignatureHelp | null {
  const text = ws.text(path);

  if (text === null) return null;
  const line = text.split("\n")[position.line] ?? "";
  // Dotted IDs (at least one dot), Unicode letters allowed; the last one
  // before the cursor is the one being written.
  const ids = [...line.slice(0, position.character).matchAll(/[\p{L}_$][\p{L}\p{N}_$-]*(?:\.[\p{L}_$][\p{L}\p{N}_$-]*)+/gu)].map((m) => m[0]);
  const id = ids.at(-1);
  const info = id ? describe(ws, id) : null;

  if (!info || !info.signature) return null;

  const signature: SignatureInformation = { label: `${info.id} ${info.signature}` };

  if (info.file) signature.documentation = `${info.file}:${info.line}`;

  return { signatures: [signature], activeSignature: 0, activeParameter: 0 };
}

// ---------- references ----------

/** Declarations and uses of the id under the cursor; `includeDeclaration: false` (LSP's `context`) leaves out the declarations. */
export function references(ws: Workspace, path: string, position: LspPosition, includeDeclaration = true): Location[] {
  const target = at(ws, path, position);

  if (!target || target.kind !== "id") return [];
  const out: Location[] = [];

  // Scan every document: declarations by their name span, uses by each ref.
  for (const doc of ws.analysis.docs) {
    const text = ws.text(doc.path);

    for (const { node } of nodesOf(doc)) {
      if (includeDeclaration && node.id === target.id && node.name) out.push({ uri: uriOf(ws.root, doc.path), range: fromSpan(text, node.name.span) });

      for (const ref of node.refs) if (ref.target === target.id) out.push({ uri: uriOf(ws.root, doc.path), range: fromSpan(text, ref.span) });
    }
  }

  return out;
}

// ---------- workspace symbols ----------

/** A symbol in a `workspace/symbol` answer. */
export interface SymbolInformation {
  name: string;
  kind: number;
  location: Location;
  containerName?: string;
}

/** Most symbols one `workspace/symbol` answer carries; an empty query lists the first ones by ID. */
const MAX_WORKSPACE_SYMBOLS = 200;

/** A brief in `containerName` is cut to about this many characters: it says why the node matched, not all of it. */
const CONTAINER_BRIEF = 80;

/**
 * Nodes of the snapshot and planned intentions matching `query` (`searchNodes`,
 * fuzzy): by name and ID first, then by the text of their explanation. Each
 * points at its code, a planned one at its declaration in the spec, a layer at
 * its line in `keylang.json`; `containerName` is the parent ID, and after it
 * the brief when only the explanation matched. A package has no place to point at.
 */
export function workspaceSymbols(ws: Workspace, briefs: ReadonlyMap<string, StoredExplanation>, query: string): SymbolInformation[] {
  const { analysis } = ws;
  const out: SymbolInformation[] = [];

  for (const hit of searchNodes(analysis, briefs, { query, limit: Infinity, fuzzy: true })) {
    if (out.length === MAX_WORKSPACE_SYMBOLS) break;
    const location = symbolLocation(ws, hit);

    if (location === null) continue;
    const dot = hit.id.lastIndexOf(".");
    const parent = dot === -1 ? "" : hit.id.slice(0, dot);
    const brief = hit.by === "explanation" && hit.explanation ? capText(hit.explanation.text, CONTAINER_BRIEF) : null;
    const container = [parent, brief].filter((part) => part !== null && part !== "").join(" — ");
    const symbol: SymbolInformation = { name: hit.id.slice(dot + 1), kind: symbolKind(hit.kind), location };

    if (container !== "") symbol.containerName = container;
    out.push(symbol);
  }

  return out;
}

/** The LSP SymbolKind of a node kind (`planned` ignored). */
function symbolKind(kind: string): number {
  const base = kind.replace(/^planned /, "");

  if (base === "class") return SYMBOL.class;

  if (base === "fn") return SYMBOL.function;

  if (base === "type") return SYMBOL.interface;

  if (base === "event") return SYMBOL.event;

  return SYMBOL.module;
}

/** Where a symbol points: a layer at its key in keylang.json, any other node at its code or spec line; null when it has no place. */
function symbolLocation(ws: Workspace, hit: NodeHit): Location | null {
  if (hit.kind === "layer") {
    // A layer is a key of `layers` in keylang.json.
    const text = ws.text(CONFIG_FILE);

    if (text === null) return null;
    // The key of the layer (`"app": […]`), not the same word as a value elsewhere (`"module": "app"`).
    const key = new RegExp(`^\\s*${JSON.stringify(hit.id).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`);
    const at = text.split("\n").findIndex((line) => key.test(line));
    const line = at === -1 ? 1 : at + 1;

    return { uri: uriOf(ws.root, CONFIG_FILE), range: lineRange(text, line, 1) };
  }

  if (hit.file === null || hit.line === null) return null;
  const col = ws.analysis.snapshot?.nodes[hit.id]?.col ?? plannedDeclaration(ws.analysis.docs, hit.id)?.col ?? 1;
  const start = lspPoint(ws.text(hit.file), hit.line, col);

  return { uri: uriOf(ws.root, hit.file), range: { start, end: start } };
}


// ---------- document symbols ----------

/** An outline entry for `textDocument/documentSymbol`, with its children. */
export interface DocumentSymbol {
  name: string;
  detail?: string;
  kind: number;
  range: LspRange;
  selectionRange: LspRange;
  children: DocumentSymbol[];
}

// LSP SymbolKind values.
const SYMBOL = { module: 2, namespace: 3, class: 5, property: 7, interface: 11, function: 12, event: 24, struct: 23, key: 20 } as const;

/** Worst verdict on a line of this document: `fail` > `unverified` > `ok`. */
function statusOf(verdicts: readonly Verdict[], diagnostics: readonly Diagnostic[], path: string, line: number): string | undefined {
  if (diagnostics.some((diag) => diag.file === path && diag.span.start.line === line && diag.severity === "error")) return "fail";
  const here = verdicts.filter((verdict) => verdict.file === path && verdict.line === line);

  if (here.some((verdict) => verdict.verdict === "fail")) return "fail";

  if (here.some((verdict) => verdict.verdict === "unverified")) return "unverified";

  if (here.some((verdict) => verdict.verdict === "ok")) return "ok";

  return undefined;
}

/** Written phrase of a trigger, step, when, or then, keyed by its text-IR node. */
function flowPhrases(spec: SpecIR): Map<Node, string> {
  const phrases = new Map<Node, string>();

  // Walk every flow item; only triggers, steps, `when` and `then` have a
  // phrase to show in the outline.
  for (const flow of spec.flows) {
    walkFlow(flow, (item) => {
      const phrase = itemPhrase(item);

      if (phrase !== null) phrases.set(item.source, phrase);
    });
  }

  return phrases;
}

/** The phrase an outline shows for a flow item: its target, condition or prose; null for other items. */
function itemPhrase(item: Trigger | FlowItem): string | null {
  if (item.kind === "trigger" || item.kind === "step") return item.target.target;

  if (item.kind === "when") return item.condition;

  if (item.kind === "then") return item.form === "ref" ? item.target.target : item.prose;

  return null;
}

/** The outline of a document: flows and rules as groups, every other node at the top; each entry with the worst status of its lines. */
export function documentSymbols(ws: Workspace, path: string): DocumentSymbol[] {
  const doc = docOf(ws, path);
  const text = ws.text(path);

  if (!doc) return [];
  const { verdicts, diagnostics, spec } = ws.analysis;
  const phrases = flowPhrases(spec);

  // A node's range runs to the end of its last descendant.
  const lastLine = (node: Node): Span => {
    let end = node.span;
    walk(node, (child) => {
      if (child.span.end.offset > end.end.offset) end = child.span;
    });

    return { start: node.span.start, end: end.end };
  };

  const rank = (status: string | undefined): number => (status === "fail" ? 3 : status === "unverified" ? 2 : status === "ok" ? 1 : 0);

  // A node's status is the worst of its own line and its children (a rule module and its `exports`).
  const statusIn = (node: Node): string | undefined => {
    let worst = statusOf(verdicts, diagnostics, path, node.span.start.line);

    for (const child of node.children) {
      const inner = statusIn(child);

      if (rank(inner) > rank(worst)) worst = inner;
    }

    return worst;
  };

  // One outline entry per node kind the outline names; an unknown kind is
  // kept only as a container for its children.
  const symbolOf = (node: Node): DocumentSymbol | null => {
    const children = node.children.map(symbolOf).filter((item): item is DocumentSymbol => item !== null);
    const status = statusIn(node);

    const make = (name: string, kind: number, detail?: string): DocumentSymbol => {
      const head: Pick<DocumentSymbol, "name" | "kind" | "detail"> = { name, kind };

      if (detail ?? status) head.detail = [detail, status].filter(Boolean).join(" · ");

      return { ...head, range: fromSpan(text, lastLine(node)), selectionRange: fromSpan(text, node.name?.span ?? node.span), children };
    };

    switch (node.kind) {
      case "layer":
        return make(node.name?.value ?? node.id ?? "layer", SYMBOL.namespace, node.id ?? undefined);
      case "module":
        return make(node.name?.value ?? "module", SYMBOL.module, node.id ?? undefined);
      case "fn":
        return make(node.name?.value ?? "fn", SYMBOL.function, node.id ?? undefined);
      case "type":
        return make(node.name?.value ?? "type", SYMBOL.struct, node.id ?? undefined);
      case "event":
        return make(node.name?.value ?? "event", SYMBOL.event, node.id ?? undefined);
      case "trigger":
      case "step":
        return make(`${node.kind} ${phrases.get(node) ?? ""}`.trim(), SYMBOL.function);
      case "planned":
        return make(`planned ${node.label?.value ?? "fn"} ${node.id ?? ""}`.trim(), SYMBOL.function, "planned");
      case "invariant":
        return make(`${node.kind} ${node.text?.value ?? ""}`.trim(), SYMBOL.key);
      case "when":
      case "then":
        return make(`${node.kind} ${phrases.get(node) ?? ""}`.trim(), SYMBOL.key);
      case "layers":
      case "allow":
      case "deny":
      case "entry":
      case "no-cycles":
      case "exports":
        return make(`${node.kind} ${node.refs.map((ref) => ref.text).join(" ")}`.trim(), SYMBOL.property);
      case "rule-module":
        return make(`module ${spec.modules.find((item) => item.source === node)?.target.target ?? ""}`.trim(), SYMBOL.module);
      default:
        return children.length > 0 ? make(node.kind, SYMBOL.key) : null;
    }
  };

  const out: DocumentSymbol[] = [];

  // Flows and rules become one group each, spanning their heading to the
  // last child; other sections list their nodes directly.
  for (const section of doc.sections) {
    const nodes = sectionNodes(section).map(symbolOf).filter((item): item is DocumentSymbol => item !== null);

    if (section.kind === "flow" && section.name) {
      const heading = section.heading?.span ?? section.name.span;
      const end = nodes.at(-1)?.range.end ?? fromPos(text, heading.end);
      out.push({ name: `flow ${section.name.value}`, kind: SYMBOL.event, range: { start: fromPos(text, heading.start), end }, selectionRange: fromSpan(text, section.name.span), children: nodes });
    } else if (section.kind === "rules" && section.heading) {
      const end = nodes.at(-1)?.range.end ?? fromPos(text, section.heading.span.end);
      out.push({ name: "rules", kind: SYMBOL.namespace, range: { start: fromPos(text, section.heading.span.start), end }, selectionRange: fromSpan(text, section.heading.span), children: nodes });
    } else {
      out.push(...nodes);
    }
  }

  return out;
}

// ---------- completion ----------

/** A completion item as LSP takes it; the label replaces the whole typed word. */
export interface CompletionItem {
  label: string;
  kind: number;
  detail?: string;
  labelDetails?: { description: string };
  sortText?: string;
  /**
   * The label replaces everything typed of it: an editor's own word ends at
   * a dot (Markdown's does), so inserting at its word would repeat the typed
   * segments (`domain.domain.order.total`) and filter by the last one only.
   */
  filterText?: string;
  textEdit?: { range: LspRange; newText: string };
}

// LSP CompletionItemKind values.
const COMPLETION = { function: 3, module: 9, struct: 22, event: 23, keyword: 14 } as const;

/** Keywords whose arguments are callables, and those whose arguments are any ids. */
const CALLABLE_ARGS = new Set(["step", "trigger"]);

const ID_ARGS = new Set(["calls", "reads", "emits", "allow", "deny", "then", "module"]);

/**
 * Keywords by position at the start of an item; after `step`/`trigger` only
 * functions and planned functions; after other reference keywords, ids that
 * the enclosing module may depend on (`deny` removes the rest).
 */
export function completions(ws: Workspace, path: string, position: LspPosition): CompletionItem[] {
  const text = ws.text(path);
  const doc = docOf(ws, path);

  if (text === null || !doc) return [];
  // Two shapes of line: `- <keyword>` (an item start, so keywords) or
  // `- <keyword> <args…> <word>` (an argument, so IDs or names).
  const lines = text.split("\n");
  const before = (lines[position.line] ?? "").slice(0, position.character);
  const item = /^(\s*)-\s+(\S*)$/.exec(before);
  const argument = /^(\s*)-\s+([\w-]+)\s+(?:.*[\s,])?\S*$/.exec(before);
  const indent = (item?.[1] ?? argument?.[1] ?? /^(\s*)/.exec(before)?.[1] ?? "").length;
  const parent = enclosing(doc, position.line + 1, indent + 1);
  // What is typed of the word under completion: back to a space or a comma, dots included.
  // A scan back from the cursor, not `/[^\s,]*$/`, which retries from every column of a long line.
  let wordStart = before.length;

  while (wordStart > 0 && !/[\s,]/.test(before[wordStart - 1]!)) wordStart--;

  // In a link reference `[id](href)` the ID starts after the `[`.
  if (before[wordStart] === "[") wordStart++;
  const typed = before.slice(wordStart);
  const range: LspRange = { start: { line: position.line, character: position.character - typed.length }, end: { line: position.line, character: position.character } };
  const replacing = (label: string): Pick<CompletionItem, "filterText" | "textEdit"> => ({ filterText: label, textEdit: { range, newText: label } });

  // An item start: the keywords this section allows under the parent.
  if (item) {
    const section = sectionAt(doc, position.line + 1);

    if (!section) return [];

    return keywordsAt(section.kind, parent?.kind).map((word) => ({ label: word, kind: COMPLETION.keyword, sortText: `0${word}`, ...replacing(word) }));
  }

  if (!argument) return [];
  const keyword = argument[2] ?? "";
  // Argument cases in order: a flow name after `continues`, an event, an
  // entry point of a trigger kind, then IDs.
  // The words written after the keyword, the one being typed excluded.
  const written = before.slice(0, wordStart).trim().split(/\s+/).slice(2);

  if (keyword === "continues" && written.length === 0) {
    const current = sectionAt(doc, position.line + 1)?.name?.value;
    const names = [...new Set(ws.analysis.spec.flows.map((flow) => flow.name))].filter((name) => name !== current).sort();

    return names.map((name) => ({ label: name, kind: COMPLETION.event, detail: "flow", sortText: `1${name}`, ...replacing(name) }));
  }

  // `trigger event ` and `emits [event] ` name an event (ADR 0023 п. 1): the IDs of the group `events`, with the literal and the subscribers.
  if ((keyword === "trigger" && written.length === 1 && written[0] === TRIGGER_EVENT) || (keyword === "emits" && (written.length === 0 || (written.length === 1 && written[0] === "event")))) {
    const out = eventCompletions(ws, replacing);

    // `emits ` may go on with the word `event`.
    return keyword === "emits" && written.length === 0 ? [{ label: "event", kind: COMPLETION.keyword, detail: "emits event <id>", sortText: "0event", ...replacing("event") }, ...out] : out;
  }

  if (keyword === "trigger" && written.length === 1 && isTriggerKind(written[0]!)) {
    // `trigger <kind> ` names an entry point of that kind: its fn, with the label it is known by.
    const kind = written[0]!;
    const entries = (ws.analysis.snapshot?.entries ?? []).filter((entry) => entry.kind === kind);
    const seen = new Map<string, CompletionItem>();

    for (const entry of entries) {
      if (seen.has(entry.id)) continue;
      seen.set(entry.id, { label: entry.id, kind: COMPLETION.function, detail: `${kind} ${entry.label}`, labelDetails: { description: entry.label }, sortText: `1${entry.id}`, ...replacing(entry.id) });
    }

    return [...seen.values()].sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  }

  if (keyword === "trigger" && written.length > 0) return [];
  const callableOnly = CALLABLE_ARGS.has(keyword);

  if (!callableOnly && !ID_ARGS.has(keyword)) return [];
  // `allow` / `deny` name the pairs the rules are about, so their targets are not filtered by them.
  const from = keyword === "allow" || keyword === "deny" ? null : moduleAround(ws, doc, parent);
  const kindOf = dependencyKindOf(ws.analysis.spec, ws.analysis.index, ws.analysis.snapshot?.nodes);
  const labels = new Map<string, CompletionItem>();

  // IDs from the snapshot: callables only for `step`/`trigger`, otherwise
  // modules, fns, types and events, minus those a `deny` forbids from the
  // enclosing module.
  for (const [id, node] of Object.entries(ws.analysis.snapshot?.nodes ?? {})) {
    // An event (ADR 0022 п. 6) is a step too: reached through a dispatch, it reaches its observers.
    if (callableOnly ? node.kind !== "fn" && node.kind !== "event" : node.kind !== "module" && node.kind !== "fn" && node.kind !== "type" && node.kind !== "event") continue;

    if (from && blocksDependency(ws.analysis.spec, from, id, kindOf, ws.analysis.config.format)) continue;
    const kind = node.kind === "fn" ? COMPLETION.function : node.kind === "type" ? COMPLETION.struct : node.kind === "event" ? COMPLETION.event : COMPLETION.module;
    const head: Pick<CompletionItem, "label" | "kind" | "detail"> = { label: id, kind };

    if (node.signature) head.detail = node.signature;
    labels.set(id, { ...head, sortText: `1${id}`, ...replacing(id) });
  }

  // Planned declarations the code does not have yet, after the code's.
  for (const item of ws.analysis.spec.planned) {
    if (labels.has(item.id)) continue;

    if (callableOnly && item.decl !== "fn") continue;

    if (from && blocksDependency(ws.analysis.spec, from, item.id, kindOf, ws.analysis.config.format)) continue;
    const kind = item.decl === "fn" ? COMPLETION.function : item.decl === "type" ? COMPLETION.struct : item.decl === "event" ? COMPLETION.event : COMPLETION.module;
    labels.set(item.id, { label: item.id, kind, detail: `planned ${item.decl}${item.signature ? ` ${item.signature}` : ""}`, labelDetails: { description: "planned" }, sortText: `2${item.id}`, ...replacing(item.id) });
  }

  const sorted = [...labels.values()].sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));

  // `trigger ` may go on with the kind of entry point it starts from.
  if (keyword === "trigger") {
    const kinds = TRIGGER_KINDS.map((kind) => ({ label: kind, kind: COMPLETION.keyword, detail: `trigger ${kind} <id>: an entry point of this kind`, sortText: `0${kind}`, ...replacing(kind) }));
    const event = { label: TRIGGER_EVENT, kind: COMPLETION.keyword, detail: "trigger event <id>: the subscribers of an event", sortText: `0${TRIGGER_EVENT}`, ...replacing(TRIGGER_EVENT) };

    return [...kinds, event, ...sorted];
  }

  return sorted;
}

/** The events of the snapshot, then events the map or `planned` declares, as completions of an event ID. */
function eventCompletions(ws: Workspace, replacing: (label: string) => Pick<CompletionItem, "filterText" | "textEdit">): CompletionItem[] {
  const labels = new Map<string, CompletionItem>();
  const nodes = ws.analysis.snapshot?.nodes ?? {};

  for (const [id, node] of Object.entries(nodes)) {
    if (node.kind !== "event") continue;
    const subscribers = node.calls ?? [];
    const detail = `event ${node.name ?? id.slice(id.indexOf(".") + 1)}${subscribers.length > 0 ? `; subscribers: ${subscribers.join(", ")}` : ""}`;
    labels.set(id, { label: id, kind: COMPLETION.event, detail, sortText: `1${id}`, ...replacing(id) });
  }

  for (const decl of ws.analysis.index.decls.values()) {
    if (decl.kind !== "event" || labels.has(decl.id)) continue;
    labels.set(decl.id, { label: decl.id, kind: COMPLETION.event, detail: "event", sortText: `1${decl.id}`, ...replacing(decl.id) });
  }

  for (const item of ws.analysis.spec.planned) {
    if (item.decl !== "event" || labels.has(item.id)) continue;
    labels.set(item.id, { label: item.id, kind: COMPLETION.event, detail: "planned event", labelDetails: { description: "planned" }, sortText: `2${item.id}`, ...replacing(item.id) });
  }

  return [...labels.values()].sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
}

/** The section a 1-based line belongs to: the last one whose heading is at or above it. */
function sectionAt(doc: Document, line: number): Section | undefined {
  let found: Section | undefined = doc.sections[0];

  for (const section of doc.sections) {
    const start = section.heading?.span.start.line ?? 1;

    if (start <= line) found = section;
  }

  return found;
}

/** The nearest item above `line` that starts left of `col`: the parent of a new item there. */
function enclosing(doc: Document, line: number, col: number): Node | undefined {
  let best: Node | undefined;

  for (const { node } of nodesOf(doc)) {
    if (node.span.start.line >= line || node.span.start.col >= col) continue;

    if (!best || node.span.start.line > best.span.start.line) best = node;
  }

  return best;
}

/** The node and its ancestors, innermost first. */
function ancestors(doc: Document, node: Node): Node[] {
  const all = nodesOf(doc);
  const chain: Node[] = [node];
  let cur = all.find((item) => item.node === node)?.parent ?? null;

  while (cur) {
    chain.push(cur);
    const next = all.find((item) => item.node === cur)?.parent ?? null;
    cur = next;
  }

  return chain;
}

/** The module a completion is written in: the nearest enclosing module or fn declaration. */
function moduleAround(ws: Workspace, doc: Document, parent: Node | undefined): string | null {
  if (!parent) return null;

  for (const node of ancestors(doc, parent)) {
    if ((node.kind === "module" || node.kind === "fn") && node.id) {
      let id = node.id;
      const nodes = ws.analysis.snapshot?.nodes ?? {};

      // A fn's ID is trimmed back to the module that holds it.
      while (nodes[id] && nodes[id]!.kind !== "module" && id.includes(".")) id = id.slice(0, id.lastIndexOf("."));

      return id;
    }
  }

  return null;
}

// ---------- code lenses ----------

/** A code lens: where it sits and the editor command it runs. */
type CodeLens = { range: LspRange; command: { title: string; command: string; arguments: string[][] } };

/**
 * `flows: checkout, pay` above each function of a source file that a flow names.
 * The command `keylang.flows` (registered by the editor client) gets the flow names.
 */
export function codeLenses(ws: Workspace, path: string): CodeLens[] {
  const out: CodeLens[] = [];
  const text = ws.text(path);

  // One lens per fn of this file that a flow names; sorted by line.
  for (const [id, node] of Object.entries(ws.analysis.snapshot?.nodes ?? {})) {
    if (node.kind !== "fn" || node.file !== path || node.line === null) continue;
    const flows = flowsUsing(ws.analysis.spec, id);

    if (flows.length === 0) continue;
    const start = lspPoint(text, node.line, node.col ?? 1);
    out.push({ range: { start, end: start }, command: { title: `flows: ${flows.join(", ")}`, command: "keylang.flows", arguments: [flows] } });
  }

  return out.sort((a, b) => a.range.start.line - b.range.start.line);
}

