// Cross-file ID resolution: builds the declaration index and reports
// duplicate declarations (K002) and dangling references (K001).

import { CONFIG_FILE, SYNTHETIC_LAYERS } from "./config.ts";
import { diagnostic, type Diagnostic } from "./diag.ts";
import { isDecl, sectionNodes, walk, type Document, type Node, type NodeKind } from "./ir.ts";
import { isSegment, linkTextSpan, renderMeaning } from "./parser.ts";
import { compareText, type Span } from "./span.ts";

export interface Decl {
  id: string;
  kind: NodeKind;
  file: string;
  /** Span of the declared name (LSP: definition target). */
  span: Span;
  /**
   * Module declares `fn`/`type`/`event`/`module` children or dependency
   * aliases. A module without members is opaque: `module.anything` resolves to it.
   */
  hasMembers: boolean;
}

export type Lookup =
  | { kind: "exact"; decl: Decl }
  /** Resolved into an opaque module (the tail is not modelled). */
  | { kind: "opaque"; decl: Decl }
  | { kind: "missing" };

/** What the snapshot knows about a module's members; `undefined` when it has no such module. */
export type Members = (moduleId: string) => "complete" | "opaque" | undefined;

/** What resolution knows besides the documents. */
export interface ResolveContext {
  /** Layers of `keylang.json`: they exist before the map prints them (a layer without modules has no map file). */
  layers?: readonly string[];
  /** Member state of the snapshot's modules. Without it a member-less module of the map is opaque (Р13). */
  members?: Members;
  /** `external.<segment>` ids declared in package.json or Cargo.toml. A reference to one is not K001. */
  knownExternal?: ReadonlySet<string>;
}

/** A reference into a module whose contents the snapshot does not know: neither confirmed nor dangling. */
export interface Unverified {
  file: string;
  line: number;
  col: number;
  message: string;
  /** `kind` plus the line's meaning. A rule line replaces this with its canonical text before hashing. */
  spec: string;
}

const NO_SPAN: Span = { start: { offset: 0, line: 1, col: 1 }, end: { offset: 0, line: 1, col: 1 } };

export class Index {
  readonly decls = new Map<string, Decl>();
  readonly flows = new Map<string, Decl>();
  /** `planned` declarations by ID (a namespace of their own: an intention, not a declaration of the map). */
  readonly planned = new Map<string, Decl>();
  private readonly members: Members | undefined;

  constructor(members?: Members) {
    this.members = members;
  }

  lookup(id: string): Lookup {
    const exact = this.decls.get(id);
    if (exact) return { kind: "exact", decl: exact };
    const prefix = this.longestPrefix(id);
    if (prefix?.kind !== "module") return { kind: "missing" };
    // The snapshot decides when it has the module: a partly parsed file is opaque even with members in the map.
    const members = this.members?.(prefix.id);
    if (members === "opaque") return { kind: "opaque", decl: prefix };
    if (members === "complete" || prefix.hasMembers) return { kind: "missing" };
    return { kind: "opaque", decl: prefix };
  }

  /** The snapshot knows the module and says its contents are unknown. */
  snapshotOpaque(id: string): boolean {
    return this.members?.(id) === "opaque";
  }

  private longestPrefix(id: string): Decl | undefined {
    let end = id.length;
    for (;;) {
      const dot = id.lastIndexOf(".", end - 1);
      if (dot === -1) return undefined;
      end = dot;
      const d = this.decls.get(id.slice(0, end));
      if (d) return d;
    }
  }

  /** Best-effort "did you mean" among siblings of the missing segment. */
  suggest(id: string): string | undefined {
    const prefix = this.longestPrefix(id)?.id;
    const rest = prefix === undefined ? id : id.slice(prefix.length + 1);
    const missing = rest.split(".")[0]?.toLowerCase();
    if (missing === undefined) return undefined;
    const depth = (prefix === undefined ? 0 : prefix.split(".").length) + 1;
    let best: [number, string] | undefined;
    for (const k of this.decls.keys()) {
      if (k.split(".").length !== depth) continue;
      if (prefix !== undefined && !k.startsWith(`${prefix}.`)) continue;
      const last = k.slice(k.lastIndexOf(".") + 1).toLowerCase();
      const score = similarity(last, missing);
      if (score === null) continue;
      if (!best || score < best[0] || (score === best[0] && k < best[1])) best = [score, k];
    }
    return best?.[1];
  }

  toJSON(): { decls: Record<string, Decl>; flows: Record<string, Decl> } {
    return { decls: Object.fromEntries(this.decls), flows: Object.fromEntries(this.flows) };
  }
}

/**
 * How close two names are for a suggestion (0 = one contains the other), or
 * null when too far: a short name only matches a near-exact typo, so `zz`
 * does not suggest `ab`, nor `banana` a layer `a`.
 */
function similarity(a: string, b: string): number | null {
  const shorter = Math.min(codePoints(a), codePoints(b));
  const longer = Math.max(codePoints(a), codePoints(b));
  if (shorter >= 3 && (a.includes(b) || b.includes(a))) return 0;
  const allowed = longer <= 2 ? 0 : longer <= 5 ? 1 : 2;
  const distance = levenshtein(a, b);
  return distance <= allowed ? distance : null;
}

function codePoints(s: string): number {
  return [...s].length;
}

/** Build the index over all documents and check every reference. */
export function check(docs: readonly Document[], context: ResolveContext = {}): { index: Index; diagnostics: Diagnostic[]; unverified: Unverified[] } {
  const index = new Index(context.members);
  const diags: Diagnostic[] = [];

  for (const doc of docs) {
    for (const section of doc.sections) {
      if (section.kind === "flow" && section.name) {
        insert(
          index.flows,
          { id: section.name.value, kind: "step", file: doc.path, span: section.name.span, hasMembers: false },
          "flow",
          diags,
        );
      }
      for (const node of sectionNodes(section)) {
        walk(node, (n) => {
          if (isDecl(n.kind) && n.id !== null && n.name) {
            insert(index.decls, { id: n.id, kind: n.kind, file: doc.path, span: n.name.span, hasMembers: false }, "ID", diags);
          } else if (n.kind === "planned" && n.id !== null) {
            // With or without code: a second declaration of one intention is a duplicate.
            insert(index.planned, { id: n.id, kind: "planned", file: doc.path, span: n.span, hasMembers: false }, "planned", diags);
          }
        });
      }
    }
  }
  // A configured layer the map does not print yet (no modules) is declared by `keylang.json`.
  for (const layer of context.layers ?? []) {
    if (!index.decls.has(layer)) index.decls.set(layer, { id: layer, kind: "layer", file: CONFIG_FILE, span: NO_SPAN, hasMembers: false });
  }

  for (const d of index.decls.values()) {
    // A dependency alias is a member too (CONTEXT.md): a module of aliases only is not opaque.
    if (d.kind === "fn" || d.kind === "type" || d.kind === "event" || d.kind === "module" || d.kind === "dep") {
      const dot = d.id.lastIndexOf(".");
      if (dot === -1) continue;
      const parent = index.decls.get(d.id.slice(0, dot));
      if (parent) parent.hasMembers = true;
    }
  }

  const unverified: Unverified[] = [];
  for (const doc of docs) {
    for (const section of doc.sections) {
      for (const node of sectionNodes(section)) checkRefs(index, doc, node, diags, unverified, context.knownExternal ?? new Set());
    }
  }
  return { index, diagnostics: diags, unverified };
}

function insert(map: Map<string, Decl>, decl: Decl, what: string, diags: Diagnostic[]): void {
  const prev = map.get(decl.id);
  if (!prev) {
    map.set(decl.id, decl);
    return;
  }
  // A layer may be continued in several map files.
  if (prev.kind === "layer" && decl.kind === "layer") return;
  diags.push(
    diagnostic(
      "K002",
      decl.file,
      decl.span,
      `duplicate ${what} \`${decl.id}\` (first declared at ${prev.file}:${prev.span.start.line}:${prev.span.start.col})`,
    ),
  );
}

/** `external` and `unassigned` are layers keylang makes itself; a rule may name them before they have modules. */
const SYNTHETIC = new Set<string>(SYNTHETIC_LAYERS);

const THEN_KINDS = new Set(["fn", "type", "event", "module", "planned"]);

/** Ids whose last segment is `word`: map declarations and `planned`, never a layer. */
function thenCandidates(index: Index, word: string): string[] {
  const ids = new Set<string>();
  const take = (decl: Decl): void => {
    if (!THEN_KINDS.has(decl.kind)) return;
    const dot = decl.id.lastIndexOf(".");
    if (dot <= 0) return;
    if (decl.id.slice(dot + 1) === word) ids.add(decl.id);
  };
  for (const decl of index.decls.values()) take(decl);
  for (const decl of index.planned.values()) take(decl);
  return [...ids].sort(compareText);
}

/** `then save` is text (Р10). When `save` is the last segment of a real id, say so. */
function warnBareThen(index: Index, doc: Document, node: Node, diags: Diagnostic[]): void {
  // `tokens` includes the keyword. Р10 reads the arguments: exactly one, and not a dotted id.
  const args = node.tokens[0]?.text === "then" ? node.tokens.slice(1) : node.tokens;
  if (node.kind !== "then" || node.refs.length > 0 || args.length !== 1) return;
  const token = args[0]!;
  let word = "";
  let span = token.span;
  if (token.kind === "word") word = token.text;
  else if (token.kind === "link") {
    const close = token.text.indexOf("](");
    word = token.text.slice(1, close === -1 ? token.text.length : close);
    span = linkTextSpan(token);
  } else return;
  if (word.includes(".") || !isSegment(word)) return;
  // IDs are NFC; the word is as written.
  const ids = thenCandidates(index, word.normalize("NFC"));
  if (ids.length === 0) return;
  const listed = ids.map((id) => `\`then ${id}\``).join(", ");
  diags.push(diagnostic("K008", doc.path, span, `\`then ${word}\` is read as text, not a reference (did you mean ${listed}?)`));
}

/**
 * K001 text. A generated file is regenerated, not edited, so `did you mean` and
 * `planned` would mislead there: the hint names the command from its marker.
 */
function danglingMessage(index: Index, doc: Document, target: string): string {
  if (doc.generated !== null) {
    const command = /`(keylang [^`]+)`/.exec(doc.generated)?.[1];
    return `dangling reference \`${target}\` in a generated file; ${command ? `run \`${command}\`` : "regenerate it"}`;
  }
  const near = index.suggest(target);
  const hint = near === undefined ? "" : ` (did you mean \`${near}\`?)`;
  return `dangling reference \`${target}\`${hint}; declare \`planned\` if this is an intention`;
}

/** K206: `continues <flow>` names a flow no `# flow` declares. */
function checkContinues(index: Index, doc: Document, node: Node, diags: Diagnostic[]): void {
  const flow = node.kind === "continues" ? node.text : null;
  if (flow === null || index.flows.has(flow.value)) return;
  const near = [...index.flows.keys()]
    .map((name) => ({ name, distance: similarity(flow.value, name) }))
    .filter((item): item is { name: string; distance: number } => item.distance !== null)
    .sort((a, b) => a.distance - b.distance || compareText(a.name, b.name))[0];
  const hint = near === undefined ? "" : ` (did you mean \`${near.name}\`?)`;
  diags.push(diagnostic("K206", doc.path, flow.span, `\`continues\` names flow \`${flow.value}\`, which no \`# flow\` declares${hint}`));
}

function checkRefs(index: Index, doc: Document, node: Node, diags: Diagnostic[], unverified: Unverified[], knownExternal: ReadonlySet<string>): void {
  warnBareThen(index, doc, node, diags);
  checkContinues(index, doc, node, diags);
  let ok = true;
  // `exports` lists public names (values, aliases, `default`), compared with the
  // snapshot's export table by the rule, not declarations of the map.
  const refs = node.kind === "exports" ? [] : node.refs;
  for (const r of refs) {
    if (SYNTHETIC.has(r.target)) continue;
    const hit = index.lookup(r.target);
    if (hit.kind === "missing") {
      if (knownExternal.has(r.target)) continue;
      ok = false;
      diags.push(diagnostic("K001", doc.path, r.span, danglingMessage(index, doc, r.target), r.target));
    } else if (hit.kind === "opaque" && index.snapshotOpaque(hit.decl.id)) {
      unverified.push({
        file: doc.path,
        line: r.span.start.line,
        col: r.span.start.col,
        message: `opaque module \`${hit.decl.id}\``,
        spec: `${node.kind} ${renderMeaning(node)}`,
      });
    }
  }
  for (const child of node.children) {
    // `exports` of an unknown module would only repeat the error.
    if (ok || node.kind !== "rule-module") checkRefs(index, doc, child, diags, unverified, knownExternal);
  }
}

function levenshtein(a: string, b: string): number {
  const bs = [...b];
  let prev = Array.from({ length: bs.length + 1 }, (_, i) => i);
  let i = 0;
  for (const ca of a) {
    const cur = [i + 1];
    bs.forEach((cb, j) => {
      cur.push(Math.min(prev[j]! + (ca === cb ? 0 : 1), prev[j + 1]! + 1, cur[j]! + 1));
    });
    prev = cur;
    i++;
  }
  return prev[bs.length]!;
}
