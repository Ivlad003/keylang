// Markdown → IR. A small line-oriented parser: keylang files use a strict
// subset of Markdown (headings, bullet lists indented by 2 spaces, paragraphs,
// fenced code), so a hand-written parser gives exact spans for every token
// without mapping back from a CommonMark AST. See `docs/format.md`.

import { diagnostic, type Code } from "./diag.ts";
import type { Document, Item, Link, Node, NodeKind, Ref, Section, SectionKind, Token, TokenKind } from "./ir.ts";
import { kindLabel } from "./ir.ts";
import type { Pos, Span, Spanned } from "./span.ts";

export function parse(path: string, src: string): Document {
  const p = new Parser(path);
  let offset = 0;
  let lineNo = 0;
  for (const raw of splitInclusive(src)) {
    lineNo += 1;
    const text = raw.replace(/[\r\n]+$/, "");
    p.line(new Line(lineNo, offset, text));
    offset += raw.length;
  }
  return p.finish();
}

/** Split keeping the `\n` on each line (like Rust's `split_inclusive`). */
function splitInclusive(src: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < src.length; i++) {
    if (src[i] === "\n") {
      out.push(src.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < src.length) out.push(src.slice(start));
  return out;
}

class Line {
  readonly no: number;
  readonly start: number;
  readonly text: string;

  constructor(no: number, start: number, text: string) {
    this.no = no;
    this.start = start;
    this.text = text;
  }

  pos(b: number): Pos {
    return { offset: this.start + b, line: this.no, col: codePoints(this.text.slice(0, b)) + 1 };
  }

  span(a: number, b: number): Span {
    return { start: this.pos(a), end: this.pos(b) };
  }
}

function codePoints(s: string): number {
  let n = 0;
  for (const _ of s) n++;
  return n;
}

/** Where an item stands, which decides the keywords it may use. */
type Ctx =
  | "map-top"
  | "rules-top"
  | "flow-top"
  | "wiring-top"
  | "layer"
  | "module"
  | "fn"
  | "ref-list"
  | "rule-module"
  | "step"
  | "invariant"
  | "when"
  | "then"
  | "wire"
  | "wire-dep"
  | "unknown"
  | `leaf:${NodeKind}`;

function ctxOf(section: SectionKind, parent: NodeKind | undefined): Ctx {
  switch (parent) {
    case undefined:
      return `${section}-top`;
    case "layer":
      return "layer";
    case "module":
      return "module";
    case "fn":
      return "fn";
    case "layers":
    case "entry":
      return "ref-list";
    case "rule-module":
      return "rule-module";
    case "step":
    case "trigger":
      return "step";
    case "invariant":
      return "invariant";
    case "when":
      return section === "flow" ? "when" : "leaf:when";
    case "then":
      return "then";
    case "wire":
      return "wire";
    case "wire-dep":
      return "wire-dep";
    case "unknown":
      return "unknown";
    default:
      return `leaf:${parent}`;
  }
}

const RULES = ["layers", "allow", "deny", "entry", "module", "no-cycles"];

/** Keywords an item may start with under `parent` (none at the top of a section). */
export function keywordsAt(section: SectionKind, parent: NodeKind | undefined): readonly string[] {
  return keywordsOf(ctxOf(section, parent));
}

function keywordsOf(ctx: Ctx): readonly string[] {
  switch (ctx) {
    case "map-top":
      return ["layer", ...RULES];
    case "rules-top":
      return RULES;
    case "flow-top":
      return ["kind", "trigger", "step", "reads", "emits", "calls", "invariant", "when", "test", "planned"];
    case "wiring-top":
      return ["wire"];
    case "layer":
      return ["module"];
    case "module":
      return ["module", "fn", "type", "event"];
    case "fn":
      return ["calls"];
    case "rule-module":
      return ["exports", "no-cycles"];
    case "step":
      return ["step", "reads", "emits", "calls", "when", "test", "invariant"];
    case "invariant":
    case "then":
      return ["test"];
    case "when":
      return ["then", "step", "test"];
    case "wire-dep":
      return ["when", "compose"];
    default:
      return [];
  }
}

function keywordKind(ctx: Ctx, kw: string): NodeKind {
  switch (kw) {
    case "layer":
      return "layer";
    case "module":
      return ctx === "map-top" || ctx === "rules-top" ? "rule-module" : "module";
    case "fn":
    case "type":
    case "event":
    case "calls":
    case "layers":
    case "allow":
    case "deny":
    case "entry":
    case "exports":
    case "no-cycles":
    case "kind":
    case "trigger":
    case "step":
    case "reads":
    case "emits":
    case "invariant":
    case "when":
    case "then":
    case "test":
    case "planned":
    case "wire":
    case "compose":
      return kw;
    default:
      return "unknown";
  }
}

interface Parent {
  kind: NodeKind;
  id: string | null;
  target: string | null;
}

class Parser {
  readonly doc: Document;
  private readonly path: string;
  /** Open list items; index = depth. */
  private stack: Node[] = [];
  private prose: string[] = [];
  /** Open code fence: marker and lines. */
  private fence: { marker: string; lines: string[] } | null = null;
  private seenContent = false;

  constructor(path: string) {
    this.path = path;
    this.doc = { path, generated: null, sections: [], diagnostics: [] };
  }

  private err(code: Code, span: Span, msg: string): void {
    this.doc.diagnostics.push(diagnostic(code, this.path, span, msg));
  }

  private section(): Section {
    if (this.doc.sections.length === 0) {
      this.doc.sections.push({ kind: "map", heading: null, name: null, items: [] });
    }
    return this.doc.sections[this.doc.sections.length - 1]!;
  }

  private sectionKind(): SectionKind {
    return this.doc.sections.at(-1)?.kind ?? "map";
  }

  private flushProse(): void {
    if (this.prose.length > 0) {
      this.section().items.push({ type: "prose", lines: this.prose });
      this.prose = [];
    }
  }

  private closeList(depth: number): void {
    while (this.stack.length > depth) {
      const node = this.stack.pop()!;
      const parent = this.stack.at(-1);
      if (parent) parent.children.push(node);
      else this.section().items.push({ type: "node", ...node });
    }
  }

  finish(): Document {
    if (this.fence) {
      this.section().items.push({ type: "code", lines: this.fence.lines });
      this.fence = null;
    }
    this.flushProse();
    this.closeList(0);
    return this.doc;
  }

  line(l: Line): void {
    const text = l.text;
    if (this.fence) {
      this.fence.lines.push(text.trimEnd());
      if (text.trim() === this.fence.marker) {
        this.section().items.push({ type: "code", lines: this.fence.lines });
        this.fence = null;
      }
      return;
    }
    if (text.trim() === "") {
      this.flushProse();
      return;
    }
    if (!this.seenContent && text.startsWith("<!--") && text.includes("keylang:generated")) {
      this.seenContent = true;
      this.doc.generated = text.trimEnd();
      return;
    }
    this.seenContent = true;

    const ws = /^[ \t]*/.exec(text)![0];
    const wsLen = ws.length;
    if (ws.includes("\t")) {
      this.err("K003", l.span(0, wsLen), "tab in indentation; indent with 2 spaces");
    }
    let indent = 0;
    for (const c of ws) indent += c === "\t" ? 2 : 1;
    const rest = text.slice(wsLen);

    if (indent === 0 && (rest === "#" || rest.startsWith("# "))) {
      this.heading(l);
    } else if (rest.startsWith("```") || rest.startsWith("~~~")) {
      this.flushProse();
      this.closeList(0);
      const ch = rest[0]!;
      let marker = "";
      for (const c of rest) {
        if (c !== ch) break;
        marker += c;
      }
      this.fence = { marker, lines: [text.trimEnd()] };
    } else if (isBullet(rest)) {
      this.item(l, wsLen, indent);
    } else if (indent >= 2 && this.stack.length > 0) {
      // Description of the deepest open item whose content column fits.
      const depth = Math.min(Math.floor((indent - 2) / 2), this.stack.length - 1);
      const start = wsLen;
      const end = text.trimEnd().length;
      this.stack[depth]!.description.push({ value: text.slice(start, end), span: l.span(start, end) });
    } else {
      this.closeList(0);
      this.prose.push(text.trimEnd());
    }
  }

  private heading(l: Line): void {
    this.flushProse();
    this.closeList(0);
    const { tokens } = lex(l, 1, []);
    const title = renderTokens(tokens);
    const full = l.span(0, l.text.trimEnd().length);
    const first = tokens[0]?.text;
    let kind: SectionKind = "map";
    let known = true;
    if (first === "map" || first === "rules" || first === "flow" || first === "wiring") kind = first;
    else known = false;
    let name: Spanned<string> | null = null;
    if (!known) {
      this.err(
        "K006",
        full,
        `unknown section \`# ${title}\`; expected \`map\`, \`rules\`, \`flow <name>\` or \`wiring\` (treated as map)`,
      );
    } else if (tokens[1]) {
      const t = tokens[1];
      if (isSegment(t.text)) {
        name = { value: t.text, span: t.span };
      } else {
        this.err("K005", t.span, `invalid section name \`${t.text}\``);
      }
      const extra = tokens[2];
      if (extra) this.err("K005", extra.span, "unexpected words in heading");
    } else if (kind === "flow") {
      this.err("K005", full, "`# flow` needs a name, e.g. `# flow checkout`");
    }
    this.doc.sections.push({ kind, heading: { value: title, span: full }, name, items: [] });
  }

  private item(l: Line, wsLen: number, indent: number): void {
    this.flushProse();
    const bulletSpan = l.span(wsLen, wsLen + 1);
    if (indent % 2 !== 0) {
      this.err("K003", bulletSpan, `indentation must be a multiple of 2 spaces, found ${indent}`);
    }
    let depth = Math.floor(indent / 2);
    if (depth > this.stack.length) {
      this.err(
        "K003",
        bulletSpan,
        `item indented too deep: ${indent} spaces, at most ${this.stack.length * 2} expected here`,
      );
      depth = this.stack.length;
    }
    this.closeList(depth);
    this.section();

    const afterBullet = l.text.slice(wsLen + 1);
    const head = wsLen + 1 + (afterBullet.length - afterBullet.trimStart().length);
    if (l.text.slice(head).trim() === "") {
      this.err("K003", bulletSpan, "empty list item");
      return;
    }
    const top = this.stack.at(-1);
    const parent: Parent | undefined = top && {
      kind: top.kind,
      id: top.id,
      target: top.refs[0]?.target ?? null,
    };
    const errs: [Span, string][] = [];
    const { tokens, comment } = lex(l, head, errs);
    for (const [span, msg] of errs) this.err("K005", span, msg);
    const node: Node = {
      kind: "unknown",
      keyword: null,
      name: null,
      id: null,
      link: null,
      refs: [],
      text: null,
      label: null,
      tokens,
      comment,
      description: [],
      children: [],
      span: l.span(wsLen, l.text.trimEnd().length),
    };
    const ctx = ctxOf(this.sectionKind(), parent?.kind);
    this.interpret(node, l, ctx, parent);
    this.stack.push(node);
  }

  private interpret(n: Node, l: Line, ctx: Ctx, parent: Parent | undefined): void {
    const first = n.tokens[0];
    if (!first) {
      this.err("K005", n.span, "item has no content");
      return;
    }
    const isKw = first.kind === "word" && keywordsOf(ctx).includes(first.text);
    if (!isKw) {
      this.bare(n, ctx, parent);
      return;
    }
    n.keyword = first.span;
    n.kind = keywordKind(ctx, first.text);
    const rest = n.tokens.slice(1);
    const parentId = parent?.id ?? null;
    switch (n.kind) {
      case "layer":
        this.decl(n, rest, null, false);
        break;
      case "module":
      case "fn":
      case "type":
      case "event":
        this.decl(n, rest, parentId, n.kind !== "module");
        break;
      case "calls":
      case "reads":
      case "allow":
      case "deny":
        this.refList(n, rest, n.kind === "allow" || n.kind === "deny" ? 2 : 1);
        break;
      case "exports": {
        const base = parent?.target ?? null;
        for (const t of rest) {
          if (t.kind === "comma") continue;
          if (t.kind === "word" && isSegment(t.text)) {
            n.refs.push({ text: t.text, target: base === null ? t.text : `${base}.${t.text}`, span: t.span });
          } else {
            this.err("K005", t.span, `expected a name, found \`${t.text}\``);
          }
        }
        if (n.refs.length === 0 && rest.length === 0) {
          this.err("K005", n.span, "`exports` needs at least one name");
        }
        break;
      }
      case "layers":
        this.layers(n, rest);
        break;
      case "entry":
      case "no-cycles": {
        const t = rest[0];
        if (t) {
          const hint = n.kind === "entry" ? "; list entries as nested items" : "";
          this.err("K005", t.span, `\`${kindLabel(n.kind)}\` takes no arguments${hint}`);
        }
        break;
      }
      case "rule-module":
      case "trigger":
      case "step":
      case "wire":
      case "compose":
        this.oneRef(n, rest);
        break;
      case "kind": {
        const t = rest[0];
        if (rest.length === 1 && t && (t.text === "business" || t.text === "technical")) {
          n.text = spanned(t);
        } else {
          this.err("K005", n.span, "`kind` must be `business` or `technical`");
        }
        break;
      }
      case "emits": {
        const r = rest[0]?.text === "event" ? rest.slice(1) : rest;
        const t = r[0];
        if (r.length === 1 && t && t.kind === "word") n.text = spanned(t);
        else this.err("K005", n.span, "expected `emits [event] <name>`");
        break;
      }
      case "invariant":
        this.freeText(n, l, rest);
        break;
      case "when":
        if (ctx === "wire-dep") {
          const arrow = rest.findIndex((t) => t.text === "→" || t.text === "->");
          if (arrow > 0) {
            this.freeText(n, l, rest.slice(0, arrow));
            this.oneRef(n, rest.slice(arrow + 1));
          } else {
            this.err("K005", n.span, "expected `when <condition> → <id>`");
          }
        } else {
          this.freeText(n, l, rest);
        }
        break;
      case "then": {
        const t = rest[0];
        if (rest.length === 1 && t && t.kind === "word" && t.text.includes(".") && isId(t.text)) {
          this.oneRef(n, rest);
        } else {
          this.freeText(n, l, rest);
        }
        break;
      }
      case "planned": {
        const kindTok = rest[0];
        const idTok = rest[1];
        const kinds = new Set(["fn", "module", "type", "event"]);
        if (!kindTok || !idTok || !kinds.has(kindTok.text) || !isId(idTok.text)) {
          this.err("K005", n.span, "`planned` needs `<fn|module|type|event> <id> [signature]`");
          break;
        }
        n.id = idTok.text;
        n.label = { value: kindTok.text, span: kindTok.span };
        const sig = rest.slice(2);
        const sigStart = sig[0];
        const sigEnd = sig.at(-1);
        if (sigStart && sigEnd) n.text = { value: renderTokens(sig), span: { start: sigStart.span.start, end: sigEnd.span.end } };
        break;
      }
      case "test": {
        const file = rest[0];
        if (file && file.kind === "word") {
          n.text = spanned(file);
          const tail = rest.slice(1);
          const q = tail[0];
          if (tail.length === 0) {
            // no name
          } else if (tail.length === 1 && q && q.kind === "quoted") {
            n.label = { value: q.text.replace(/^"|"$/g, ""), span: q.span };
          } else if (q) {
            this.err("K005", q.span, 'expected `test <file> "<name>"`');
          }
        } else {
          this.err("K005", n.span, 'expected `test <file> "<name>"`');
        }
        break;
      }
      default:
        break;
    }
  }

  /** Item whose first word is not a keyword of its context. */
  private bare(n: Node, ctx: Ctx, parent: Parent | undefined): void {
    const tokens = n.tokens;
    const parentId = parent?.id ?? null;
    switch (ctx) {
      case "map-top":
        n.kind = "layer";
        this.decl(n, tokens, null, false);
        break;
      case "layer":
        n.kind = "module";
        this.decl(n, tokens, parentId, false);
        break;
      case "module":
      case "wire": {
        n.kind = ctx === "module" ? "dep" : "wire-dep";
        const [alias, target] = tokens;
        if (tokens.length === 2 && alias && target && alias.kind === "word" && isSegment(alias.text)) {
          n.name = spanned(alias);
          if (ctx === "module") n.id = parentId === null ? null : `${parentId}.${alias.text}`;
          this.oneRef(n, [target]);
        } else {
          n.kind = "unknown";
          const what =
            ctx === "module"
              ? "`fn`, `type`, `event`, `module` or a dependency `<alias> <path>`"
              : "a dependency `<alias> <path>`";
          this.err("K005", n.span, `expected ${what}`);
        }
        break;
      }
      case "ref-list":
        n.kind = "ref";
        this.oneRef(n, tokens);
        break;
      case "unknown":
        break;
      default: {
        if (ctx.startsWith("leaf:")) {
          const k = ctx.slice("leaf:".length) as NodeKind;
          this.err("K004", n.span, `\`${kindLabel(k)}\` cannot have nested items`);
        } else {
          const t = tokens[0]!;
          const expected = keywordsOf(ctx).join(", ");
          this.err("K004", t.span, `unknown keyword \`${t.text}\` here; expected one of: ${expected}`);
        }
      }
    }
  }

  /** `<name>` or `[name](path#Lnn)` + optional signature. */
  private decl(n: Node, rest: Token[], parentId: string | null, sig: boolean): void {
    const t = rest[0];
    if (!t) {
      this.err("K005", n.span, `\`${kindLabel(n.kind)}\` needs a name`);
      return;
    }
    let name = "";
    let link: Link | null = null;
    if (t.kind === "word") name = t.text;
    else if (t.kind === "link") {
      link = parseLink(t);
      name = link.text;
    }
    if (!isSegment(name)) {
      const msg = t.text.startsWith("[") ? "malformed link, expected `[name](path#Lnn)`" : `invalid name \`${t.text}\``;
      this.err("K005", t.span, msg);
      return;
    }
    // For a link, point at the link text, i.e. just after `[`.
    const nameSpan: Span = link
      ? {
          start: { offset: t.span.start.offset + 1, line: t.span.start.line, col: t.span.start.col + 1 },
          end: {
            offset: t.span.start.offset + 1 + name.length,
            line: t.span.start.line,
            col: t.span.start.col + 1 + codePoints(name),
          },
        }
      : t.span;
    n.id = n.kind === "layer" ? name : parentId === null ? null : `${parentId}.${name}`;
    n.name = { value: name, span: nameSpan };
    n.link = link;
    const tail = rest.slice(1);
    const first = tail[0];
    const last = tail.at(-1);
    if (first && last) {
      if (sig) {
        n.text = { value: renderTokens(tail), span: { start: first.span.start, end: last.span.end } };
      } else {
        const hint = n.kind === "layer" ? " (a dependency `<alias> <path>` must be nested under a module)" : "";
        this.err("K005", first.span, `unexpected arguments after ${kindLabel(n.kind)} \`${name}\`${hint}`);
      }
    }
  }

  private makeRef(t: Token): Ref | null {
    if (t.kind === "word" && isId(t.text)) {
      return { text: t.text, target: t.text, span: t.span };
    }
    this.err("K005", t.span, `expected an ID, found \`${t.text}\``);
    return null;
  }

  private oneRef(n: Node, rest: Token[]): void {
    if (rest.length === 1) {
      const r = this.makeRef(rest[0]!);
      if (r) n.refs.push(r);
    } else if (rest.length === 0) {
      this.err("K005", n.span, "expected an ID");
    } else {
      this.err("K005", rest[1]!.span, "expected a single ID");
    }
  }

  private refList(n: Node, rest: Token[], min: number): void {
    let count = 0;
    for (const t of rest) {
      if (t.kind === "comma") continue;
      count++;
      const r = this.makeRef(t);
      if (r) n.refs.push(r);
    }
    if (count < min) {
      this.err("K005", n.span, `\`${kindLabel(n.kind)}\` needs at least ${min} ID(s)`);
    }
  }

  /** `layers a < b < c` */
  private layers(n: Node, rest: Token[]): void {
    rest.forEach((t, i) => {
      if (i % 2 === 1) {
        if (t.text !== "<") this.err("K005", t.span, `expected \`<\`, found \`${t.text}\``);
      } else {
        const r = this.makeRef(t);
        if (r) n.refs.push(r);
      }
    });
    if (rest.length === 0 || rest.length % 2 === 0) {
      this.err("K005", n.span, "expected `layers <a> < <b> …`");
    }
  }

  private freeText(n: Node, l: Line, rest: Token[]): void {
    const a = rest[0];
    const b = rest.at(-1);
    if (a && b) {
      const s = a.span.start.offset - l.start;
      const e = b.span.end.offset - l.start;
      n.text = { value: l.text.slice(s, e), span: l.span(s, e) };
    } else {
      this.err("K005", n.span, `\`${kindLabel(n.kind)}\` needs a description`);
    }
  }
}

function spanned(t: Token): Spanned<string> {
  return { value: t.text, span: t.span };
}

function isBullet(rest: string): boolean {
  const c0 = rest[0];
  const c1 = rest[1];
  return (c0 === "-" || c0 === "*" || c0 === "+") && (c1 === undefined || c1 === " ");
}

/** A single ID segment: letter or `_`, then letters, digits, `_`, `-`. */
export function isSegment(s: string): boolean {
  return /^[\p{Alphabetic}_][\p{Alphabetic}\p{N}_-]*$/u.test(s);
}

/** A dotted ID: `segment(.segment)*`. */
export function isId(s: string): boolean {
  return s.split(".").every(isSegment);
}

function parseLink(t: Token): Link {
  const close = t.text.indexOf("](");
  const closeAt = close === -1 ? t.text.length : close;
  const text = t.text.slice(1, closeAt);
  const target = t.text.slice(closeAt + 2, t.text.length - 1);
  const hash = target.indexOf("#");
  const rawPath = hash === -1 ? target : target.slice(0, hash);
  const path = decodeLinkPath(rawPath);
  const frag = hash === -1 ? "" : target.slice(hash + 1);
  let line: number | null = null;
  if (frag.startsWith("L")) {
    const first = frag.slice(1).split("-")[0] ?? "";
    if (/^\d+$/.test(first)) line = Number(first);
  }
  const decoded = frag === "" ? path : `${path}#${frag}`;
  return { text, path, target: decoded, line, span: t.span };
}

/** Percent-decoding for map links. A broken escape is kept as written so the diagnostic still points at the source. */
function decodeLinkPath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/**
 * Split an item head into tokens. Words end at whitespace or `,`;
 * `[text](target)` and `"quoted"` are single tokens (a `[` that opens no link
 * is an ordinary word); `<!-- … -->` ends the
 * head and is returned separately.
 */
function lex(l: Line, start: number, errs: [Span, string][]): { tokens: Token[]; comment: Spanned<string> | null } {
  const s = l.text;
  let i = start;
  const tokens: Token[] = [];
  let comment: Spanned<string> | null = null;
  const wordEnd = (from: number): number => {
    for (let k = from; k < s.length; k++) {
      const c = s[k];
      if (c === " " || c === "\t" || c === ",") return k;
    }
    return s.length;
  };
  while (i < s.length) {
    const c = s[i]!;
    if (c === " " || c === "\t") {
      i++;
      continue;
    }
    if (s.startsWith("<!--", i)) {
      const e = s.trimEnd().length;
      comment = { value: s.slice(i, e), span: l.span(i, e) };
      break;
    }
    let kind: TokenKind;
    let e: number;
    if (c === ",") {
      kind = "comma";
      e = i + 1;
    } else if (c === "[") {
      const end = linkEnd(s, i);
      if (end !== null) {
        kind = "link";
        e = end;
      } else {
        // Plain text such as `[Span, string][]` in a signature; a name that
        // should have been a link is reported by `decl`.
        kind = "word";
        e = wordEnd(i);
      }
    } else if (c === '"') {
      const k = s.indexOf('"', i + 1);
      if (k !== -1) {
        kind = "quoted";
        e = k + 1;
      } else {
        errs.push([l.span(i, wordEnd(i)), "unterminated quote"]);
        kind = "word";
        e = wordEnd(i);
      }
    } else {
      kind = "word";
      e = wordEnd(i);
    }
    tokens.push({ kind, text: s.slice(i, e), span: l.span(i, e) });
    i = e;
  }
  return { tokens, comment };
}

function linkEnd(s: string, i: number): number | null {
  const close = s.indexOf("]", i);
  if (close === -1 || s[close + 1] !== "(") return null;
  const end = s.indexOf(")", close + 1);
  if (end === -1) return null;
  const target = s.slice(close + 2, end);
  return close > i + 1 && target.length > 0 && !/\s/.test(target) ? end + 1 : null;
}

/** Canonical rendering of head tokens: single spaces, `a, b` for commas. */
export function renderTokens(tokens: readonly Token[]): string {
  let out = "";
  let previous: Token | undefined;
  for (const t of tokens) {
    // Tokens that touch in the source (`"a")`) stay touching; others, and a comma, get one space after.
    const touching = previous !== undefined && previous.kind !== "comma" && previous.span.end.offset === t.span.start.offset && previous.span.end.line === t.span.start.line;
    if (out !== "" && t.kind !== "comma" && !touching) out += " ";
    out += t.text;
    previous = t;
  }
  return out;
}

export type { Item };
