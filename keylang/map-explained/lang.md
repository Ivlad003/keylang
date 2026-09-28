<!-- keylang:generated — не редагувати, `keylang map` -->

[README](README.md) · modules: [files](#lang.files) · [fmt](#lang.fmt) · [ir](#lang.ir) · [parser](#lang.parser)

# map

- lang
  <a id="lang"></a>
  - module [files](../../src/files.ts#L1)
    <a id="lang.files"></a><br>File discovery and loading.
    - node [external.node](external.md#external.node)
    - ir [lang.ir](lang.md#lang.ir)
    - parser [lang.parser](lang.md#lang.parser)
    - fn [collectMdFiles](../../src/files.ts#L14) (paths: readonly string[]) → string[]
      <a id="lang.files.collectMdFiles"></a><br>Expand files and directories into a sorted list of `*.md` files. Hidden directories, `node_modules` and `target` are skipped.
      - calls [lang.files.walkDir](lang.md#lang.files.walkDir), [lang.files.realPath](lang.md#lang.files.realPath)
    - fn [walkDir](../../src/files.ts#L39) (dir: string, out: string[], walked: Set<string>) → void <!-- internal -->
      <a id="lang.files.walkDir"></a>
      - calls [lang.files.realPath](lang.md#lang.files.realPath), [lang.files.entryType](lang.md#lang.files.entryType)
    - fn [entryType](../../src/files.ts#L57) (e: Dirent, path: string) → "dir" | "file" | null <!-- internal -->
      <a id="lang.files.entryType"></a><br>What a directory entry is, through a link; a dangling link is neither.
    - fn [realPath](../../src/files.ts#L67) (path: string) → string <!-- internal -->
      <a id="lang.files.realPath"></a>
    - fn [load](../../src/files.ts#L76) (files: readonly string[]) → Document[]
      <a id="lang.files.load"></a><br>Read and parse files.
      - calls [lang.parser.parse](lang.md#lang.parser.parse)
  - module [fmt](../../src/fmt.ts#L1)
    <a id="lang.fmt"></a><br>Canonical formatting (`keylang fmt`). Rendered from the IR, so the output is idempotent by construction: `format(parse(format(x))) == format(x)`.
    - diag [base.diag](base.md#base.diag)
    - ir [lang.ir](lang.md#lang.ir)
    - parser [lang.parser](lang.md#lang.parser)
    - fn [formatSource](../../src/fmt.ts#L12) (path: string, src: string) → { ok: true; text: string } | { ok: false; diagnostics: Diagnostic[] }
      <a id="lang.fmt.formatSource"></a><br>Format source text. Returns the structural (K003) diagnostics instead when the tree shape is ambiguous — formatting would silently re-nest items.
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [lang.fmt.formatDocument](lang.md#lang.fmt.formatDocument)
    - fn [formatDocument](../../src/fmt.ts#L18) (doc: Document) → string
      <a id="lang.fmt.formatDocument"></a>
      - calls [lang.fmt.renderNode](lang.md#lang.fmt.renderNode)
    - fn [renderNode](../../src/fmt.ts#L40) (out: string, n: Node, depth: number) → string <!-- internal -->
      <a id="lang.fmt.renderNode"></a>
      - calls [lang.parser.renderTokens](lang.md#lang.parser.renderTokens)
  - module [ir](../../src/ir.ts#L1)
    <a id="lang.ir"></a><br>Intermediate representation of keylang Markdown files.
    - diag [base.diag](base.md#base.diag)
    - span [base.span](base.md#base.span)
    - type [Document](../../src/ir.ts#L10)
      <a id="lang.ir.Document"></a>
    - type [SectionKind](../../src/ir.ts#L19) = "map" | "rules" | "flow" | "wiring"
      <a id="lang.ir.SectionKind"></a>
    - type [Section](../../src/ir.ts#L22)
      <a id="lang.ir.Section"></a><br>Content under one `# …` heading (or before the first heading).
    - type [Item](../../src/ir.ts#L33)
      <a id="lang.ir.Item"></a>
    - type [NodeKind](../../src/ir.ts#L40)
      <a id="lang.ir.NodeKind"></a>
    - fn [isDecl](../../src/ir.ts#L82) (kind: NodeKind) → boolean
      <a id="lang.ir.isDecl"></a><br>Kinds that declare an ID in the global namespace.
    - fn [kindLabel](../../src/ir.ts#L94) (kind: NodeKind) → string
      <a id="lang.ir.kindLabel"></a><br>The keyword as written in the language (`rule-module` is spelled `module`).
    - type [Node](../../src/ir.ts#L99)
      <a id="lang.ir.Node"></a><br>One list item `- <kind>? <name> <args…>` and everything nested under it.
    - type [Link](../../src/ir.ts#L126)
      <a id="lang.ir.Link"></a>
    - type [Ref](../../src/ir.ts#L137)
      <a id="lang.ir.Ref"></a>
    - type [TokenKind](../../src/ir.ts#L151) = "word" | "link" | "quoted" | "comma"
      <a id="lang.ir.TokenKind"></a>
    - type [Token](../../src/ir.ts#L153)
      <a id="lang.ir.Token"></a>
    - fn [walk](../../src/ir.ts#L160) (node: Node, f: (n: Node) => void) → void
      <a id="lang.ir.walk"></a><br>Pre-order walk over a node and its descendants.
    - fn [sectionNodes](../../src/ir.ts#L165) (section: Section) → Node[]
      <a id="lang.ir.sectionNodes"></a>
  - module [parser](../../src/parser.ts#L1)
    <a id="lang.parser"></a><br>Markdown → IR. A small line-oriented parser: keylang files use a strict subset of Markdown (headings, bullet lists indented by 2 spaces, paragraphs, fenced code), so a hand-written parser gives exact spans for every token without mapping back from a CommonMark AST.
    - diag [base.diag](base.md#base.diag)
    - ir [lang.ir](lang.md#lang.ir)
    - span [base.span](base.md#base.span)
    - fn [parse](../../src/parser.ts#L11) (path: string, src: string) → Document
      <a id="lang.parser.parse"></a>
      - calls [lang.parser.Parser](lang.md#lang.parser.Parser), [lang.parser.splitInclusive](lang.md#lang.parser.splitInclusive), [lang.parser.Parser.line](lang.md#lang.parser.Parser.line), [lang.parser.Line](lang.md#lang.parser.Line), [lang.parser.Parser.finish](lang.md#lang.parser.Parser.finish)
    - fn [splitInclusive](../../src/parser.ts#L27) (src: string) → string[] <!-- internal -->
      <a id="lang.parser.splitInclusive"></a><br>Split keeping the `\n` on each line (like Rust's `split_inclusive`).
    - module [Line](../../src/parser.ts#L40) <!-- internal -->
      <a id="lang.parser.Line"></a>
      - fn [constructor](../../src/parser.ts#L45) (no: number, start: number, text: string)
        <a id="lang.parser.Line.constructor"></a>
      - fn [pos](../../src/parser.ts#L51) (b: number) → Pos
        <a id="lang.parser.Line.pos"></a>
        - calls [lang.parser.codePoints](lang.md#lang.parser.codePoints)
      - fn [span](../../src/parser.ts#L55) (a: number, b: number) → Span
        <a id="lang.parser.Line.span"></a>
        - calls [lang.parser.Line.pos](lang.md#lang.parser.Line.pos)
    - fn [codePoints](../../src/parser.ts#L60) (s: string) → number <!-- internal -->
      <a id="lang.parser.codePoints"></a>
    - type [Ctx](../../src/parser.ts#L67) <!-- internal -->
      <a id="lang.parser.Ctx"></a><br>Where an item stands, which decides the keywords it may use.
    - fn [ctxOf](../../src/parser.ts#L86) (section: SectionKind, parent: NodeKind | undefined) → Ctx <!-- internal -->
      <a id="lang.parser.ctxOf"></a>
    - fn [keywordsAt](../../src/parser.ts#L124) (section: SectionKind, parent: NodeKind | undefined) → readonly string[]
      <a id="lang.parser.keywordsAt"></a><br>Keywords an item may start with under `parent` (none at the top of a section).
      - calls [lang.parser.keywordsOf](lang.md#lang.parser.keywordsOf), [lang.parser.ctxOf](lang.md#lang.parser.ctxOf)
    - fn [keywordsOf](../../src/parser.ts#L128) (ctx: Ctx) → readonly string[] <!-- internal -->
      <a id="lang.parser.keywordsOf"></a>
    - fn [keywordKind](../../src/parser.ts#L160) (ctx: Ctx, kw: string) → NodeKind <!-- internal -->
      <a id="lang.parser.keywordKind"></a>
    - type [Parent](../../src/parser.ts#L194) <!-- internal -->
      <a id="lang.parser.Parent"></a>
    - module [Parser](../../src/parser.ts#L200) <!-- internal -->
      <a id="lang.parser.Parser"></a>
      - fn [constructor](../../src/parser.ts#L210) (path: string)
        <a id="lang.parser.Parser.constructor"></a>
      - fn [err](../../src/parser.ts#L215) (code: Code, span: Span, msg: string) → void <!-- internal -->
        <a id="lang.parser.Parser.err"></a>
        - calls [base.diag.diagnostic](base.md#base.diag.diagnostic)
      - fn [section](../../src/parser.ts#L219) () → Section <!-- internal -->
        <a id="lang.parser.Parser.section"></a>
      - fn [sectionKind](../../src/parser.ts#L226) () → SectionKind <!-- internal -->
        <a id="lang.parser.Parser.sectionKind"></a>
      - fn [flushProse](../../src/parser.ts#L230) () → void <!-- internal -->
        <a id="lang.parser.Parser.flushProse"></a>
        - calls [lang.parser.Parser.section](lang.md#lang.parser.Parser.section)
      - fn [closeList](../../src/parser.ts#L237) (depth: number) → void <!-- internal -->
        <a id="lang.parser.Parser.closeList"></a>
        - calls [lang.parser.Parser.section](lang.md#lang.parser.Parser.section)
      - fn [finish](../../src/parser.ts#L246) () → Document
        <a id="lang.parser.Parser.finish"></a>
        - calls [lang.parser.Parser.section](lang.md#lang.parser.Parser.section), [lang.parser.Parser.flushProse](lang.md#lang.parser.Parser.flushProse), [lang.parser.Parser.closeList](lang.md#lang.parser.Parser.closeList)
      - fn [line](../../src/parser.ts#L256) (l: Line) → void
        <a id="lang.parser.Parser.line"></a>
        - calls [lang.parser.Parser.section](lang.md#lang.parser.Parser.section), [lang.parser.Parser.flushProse](lang.md#lang.parser.Parser.flushProse), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.parser.Parser.heading](lang.md#lang.parser.Parser.heading), [lang.parser.Parser.closeList](lang.md#lang.parser.Parser.closeList), [lang.parser.isBullet](lang.md#lang.parser.isBullet), [lang.parser.Parser.item](lang.md#lang.parser.Parser.item), [lang.parser.Line.span](lang.md#lang.parser.Line.span)
      - fn [heading](../../src/parser.ts#L315) (l: Line) → void <!-- internal -->
        <a id="lang.parser.Parser.heading"></a>
        - calls [lang.parser.Parser.flushProse](lang.md#lang.parser.Parser.flushProse), [lang.parser.Parser.closeList](lang.md#lang.parser.Parser.closeList), [lang.parser.lex](lang.md#lang.parser.lex), [lang.parser.renderTokens](lang.md#lang.parser.renderTokens), [lang.parser.Line.span](lang.md#lang.parser.Line.span), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.parser.isSegment](lang.md#lang.parser.isSegment)
      - fn [item](../../src/parser.ts#L346) (l: Line, wsLen: number, indent: number) → void <!-- internal -->
        <a id="lang.parser.Parser.item"></a>
        - calls [lang.parser.Parser.flushProse](lang.md#lang.parser.Parser.flushProse), [lang.parser.Line.span](lang.md#lang.parser.Line.span), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.parser.Parser.closeList](lang.md#lang.parser.Parser.closeList), [lang.parser.Parser.section](lang.md#lang.parser.Parser.section), [lang.parser.lex](lang.md#lang.parser.lex), [lang.parser.ctxOf](lang.md#lang.parser.ctxOf), [lang.parser.Parser.sectionKind](lang.md#lang.parser.Parser.sectionKind), [lang.parser.Parser.interpret](lang.md#lang.parser.Parser.interpret)
      - fn [interpret](../../src/parser.ts#L399) (n: Node, l: Line, ctx: Ctx, parent: Parent | undefined) → void <!-- internal -->
        <a id="lang.parser.Parser.interpret"></a>
        - calls [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.parser.keywordsOf](lang.md#lang.parser.keywordsOf), [lang.parser.Parser.bare](lang.md#lang.parser.Parser.bare), [lang.parser.keywordKind](lang.md#lang.parser.keywordKind), [lang.parser.Parser.decl](lang.md#lang.parser.Parser.decl), [lang.parser.Parser.refList](lang.md#lang.parser.Parser.refList), [lang.parser.isSegment](lang.md#lang.parser.isSegment), [lang.parser.Parser.layers](lang.md#lang.parser.Parser.layers), [lang.ir.kindLabel](lang.md#lang.ir.kindLabel), [lang.parser.Parser.oneRef](lang.md#lang.parser.Parser.oneRef), [lang.parser.spanned](lang.md#lang.parser.spanned), [lang.parser.Parser.freeText](lang.md#lang.parser.Parser.freeText), [lang.parser.parseLink](lang.md#lang.parser.parseLink), [lang.parser.isId](lang.md#lang.parser.isId), [lang.parser.renderTokens](lang.md#lang.parser.renderTokens)
      - fn [bare](../../src/parser.ts#L547) (n: Node, ctx: Ctx, parent: Parent | undefined) → void <!-- internal -->
        <a id="lang.parser.Parser.bare"></a><br>Item whose first word is not a keyword of its context.
        - calls [lang.parser.Parser.decl](lang.md#lang.parser.Parser.decl), [lang.parser.isSegment](lang.md#lang.parser.isSegment), [lang.parser.spanned](lang.md#lang.parser.spanned), [lang.parser.Parser.oneRef](lang.md#lang.parser.Parser.oneRef), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.ir.kindLabel](lang.md#lang.ir.kindLabel), [lang.parser.keywordsOf](lang.md#lang.parser.keywordsOf)
      - fn [decl](../../src/parser.ts#L597) (n: Node, rest: Token[], parentId: string | null, sig: boolean) → void <!-- internal -->
        <a id="lang.parser.Parser.decl"></a><br>`<name>` or `[name](path#Lnn)` + optional signature.
        - calls [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.ir.kindLabel](lang.md#lang.ir.kindLabel), [lang.parser.parseLink](lang.md#lang.parser.parseLink), [lang.parser.isSegment](lang.md#lang.parser.isSegment), [lang.parser.linkTextSpan](lang.md#lang.parser.linkTextSpan), [lang.parser.renderTokens](lang.md#lang.parser.renderTokens)
      - fn [makeRef](../../src/parser.ts#L633) (t: Token) → Ref | null <!-- internal -->
        <a id="lang.parser.Parser.makeRef"></a><br>A bare ID, or `[id](href)`: the link text is the ID, the target is kept and never checked.
        - calls [lang.parser.isId](lang.md#lang.parser.isId), [lang.parser.parseLink](lang.md#lang.parser.parseLink), [lang.parser.linkTextSpan](lang.md#lang.parser.linkTextSpan), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err)
      - fn [oneRef](../../src/parser.ts#L649) (n: Node, rest: Token[]) → void <!-- internal -->
        <a id="lang.parser.Parser.oneRef"></a>
        - calls [lang.parser.Parser.makeRef](lang.md#lang.parser.Parser.makeRef), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err)
      - fn [refList](../../src/parser.ts#L660) (n: Node, rest: Token[], min: number) → void <!-- internal -->
        <a id="lang.parser.Parser.refList"></a>
        - calls [lang.parser.Parser.makeRef](lang.md#lang.parser.Parser.makeRef), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.ir.kindLabel](lang.md#lang.ir.kindLabel)
      - fn [layers](../../src/parser.ts#L674) (n: Node, rest: Token[]) → void <!-- internal -->
        <a id="lang.parser.Parser.layers"></a><br>`layers a < b < c`
        - calls [lang.parser.Parser.makeRef](lang.md#lang.parser.Parser.makeRef), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err)
      - fn [freeText](../../src/parser.ts#L688) (n: Node, l: Line, rest: Token[]) → void <!-- internal -->
        <a id="lang.parser.Parser.freeText"></a>
        - calls [lang.parser.renderTokens](lang.md#lang.parser.renderTokens), [lang.parser.Line.span](lang.md#lang.parser.Line.span), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.ir.kindLabel](lang.md#lang.ir.kindLabel)
    - fn [spanned](../../src/parser.ts#L702) (t: Token) → Spanned<string> <!-- internal -->
      <a id="lang.parser.spanned"></a>
    - fn [isBullet](../../src/parser.ts#L706) (rest: string) → boolean <!-- internal -->
      <a id="lang.parser.isBullet"></a>
    - fn [isSegment](../../src/parser.ts#L713) (s: string) → boolean
      <a id="lang.parser.isSegment"></a><br>A single ID segment: letter or `_`, then letters (with their combining marks), digits, `_`, `-`.
    - fn [isId](../../src/parser.ts#L719) (s: string) → boolean
      <a id="lang.parser.isId"></a><br>A dotted ID: `segment(.segment)*`.
    - fn [linkTextSpan](../../src/parser.ts#L724) (t: Token) → Span <!-- internal -->
      <a id="lang.parser.linkTextSpan"></a><br>The text of a link token `[text](…)`, i.e. from just after `[`.
      - calls [lang.parser.parseLink](lang.md#lang.parser.parseLink), [lang.parser.codePoints](lang.md#lang.parser.codePoints)
    - fn [parseLink](../../src/parser.ts#L730) (t: Token) → Link <!-- internal -->
      <a id="lang.parser.parseLink"></a>
      - calls [lang.parser.decodeLinkPath](lang.md#lang.parser.decodeLinkPath)
    - fn [decodeLinkPath](../../src/parser.ts#L749) (path: string) → string <!-- internal -->
      <a id="lang.parser.decodeLinkPath"></a><br>Percent-decoding for map links. A broken escape is kept as written so the diagnostic still points at the source.
    - fn [lex](../../src/parser.ts#L763) (l: Line, start: number, errs: [Span, string][]) → { tokens: Token[]; comment: Spanned<string> | null } <!-- internal -->
      <a id="lang.parser.lex"></a><br>Split an item head into tokens. Words end at whitespace or `,`; `[text](target)` and `"quoted"` are single tokens (a `[` that opens no link is an ordinary word); `&lt;!-- … --&gt;` ends the head and is returned separately.
      - calls [lang.parser.Line.span](lang.md#lang.parser.Line.span), [lang.parser.linkEnd](lang.md#lang.parser.linkEnd)
    - fn [linkEnd](../../src/parser.ts#L822) (s: string, i: number) → number | null <!-- internal -->
      <a id="lang.parser.linkEnd"></a>
    - fn [renderMeaning](../../src/parser.ts#L836) (node: Node) → string
      <a id="lang.parser.renderMeaning"></a><br>What an item's head says, for comparing meaning (a verdict's `specHash`, a rule already written): canonical tokens, with a reference written as a link `[id](href)` counted as its ID, so linking a reference changes nothing.
      - calls [lang.parser.renderTokens](lang.md#lang.parser.renderTokens)
    - fn [renderTokens](../../src/parser.ts#L842) (tokens: readonly Token[]) → string
      <a id="lang.parser.renderTokens"></a><br>Canonical rendering of head tokens: single spaces, `a, b` for commas.
