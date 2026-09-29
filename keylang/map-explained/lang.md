<!-- keylang:generated — не редагувати, `keylang map` -->

[README](README.md) · modules: [files](#lang.files) · [fmt](#lang.fmt) · [ir](#lang.ir) · [parser](#lang.parser) · [spec-ir](#lang.spec-ir)

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
      - calls [lang.fmt.renderNode](lang.md#lang.fmt.renderNode), [lang.parser.dedentFenceLines](lang.md#lang.parser.dedentFenceLines)
    - fn [renderNode](../../src/fmt.ts#L41) (out: string, n: Node, depth: number) → string <!-- internal -->
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
      - fn [constructor](../../src/parser.ts#L215) (path: string)
        <a id="lang.parser.Parser.constructor"></a>
      - fn [err](../../src/parser.ts#L220) (code: Exclude<Code, "K005">, span: Span, msg: string) → void <!-- internal -->
        <a id="lang.parser.Parser.err"></a>
        - calls [base.diag.diagnostic](base.md#base.diag.diagnostic)
      - fn [section](../../src/parser.ts#L227) () → Section <!-- internal -->
        <a id="lang.parser.Parser.section"></a>
      - fn [sectionKind](../../src/parser.ts#L234) () → SectionKind <!-- internal -->
        <a id="lang.parser.Parser.sectionKind"></a>
      - fn [flushProse](../../src/parser.ts#L238) () → void <!-- internal -->
        <a id="lang.parser.Parser.flushProse"></a>
        - calls [lang.parser.Parser.section](lang.md#lang.parser.Parser.section)
      - fn [pushDescription](../../src/parser.ts#L246) (l: Line, text: string, lead: Lead, depth: number) → void <!-- internal -->
        <a id="lang.parser.Parser.pushDescription"></a><br>A non-empty line that belongs to an open item as its description (§3).
        - calls [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.parser.Line.span](lang.md#lang.parser.Line.span)
      - fn [closeList](../../src/parser.ts#L253) (depth: number) → void <!-- internal -->
        <a id="lang.parser.Parser.closeList"></a>
        - calls [lang.parser.Parser.section](lang.md#lang.parser.Parser.section)
      - fn [finish](../../src/parser.ts#L262) () → Document
        <a id="lang.parser.Parser.finish"></a>
        - calls [lang.parser.Parser.section](lang.md#lang.parser.Parser.section), [lang.parser.Parser.flushProse](lang.md#lang.parser.Parser.flushProse), [lang.parser.Parser.closeList](lang.md#lang.parser.Parser.closeList)
      - fn [line](../../src/parser.ts#L272) (l: Line) → void
        <a id="lang.parser.Parser.line"></a>
        - calls [lang.parser.closesFence](lang.md#lang.parser.closesFence), [lang.parser.Parser.section](lang.md#lang.parser.Parser.section), [lang.parser.leadingWhitespace](lang.md#lang.parser.leadingWhitespace), [lang.parser.Parser.pushDescription](lang.md#lang.parser.Parser.pushDescription), [lang.parser.Parser.flushProse](lang.md#lang.parser.Parser.flushProse), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.parser.htmlBlockStart](lang.md#lang.parser.htmlBlockStart), [lang.parser.Parser.closeList](lang.md#lang.parser.Parser.closeList), [lang.parser.Parser.heading](lang.md#lang.parser.Parser.heading), [lang.parser.opensFence](lang.md#lang.parser.opensFence), [lang.parser.openFence](lang.md#lang.parser.openFence), [lang.parser.isBullet](lang.md#lang.parser.isBullet), [lang.parser.Parser.item](lang.md#lang.parser.Parser.item), [lang.parser.Line.span](lang.md#lang.parser.Line.span)
      - fn [heading](../../src/parser.ts#L362) (l: Line) → void <!-- internal -->
        <a id="lang.parser.Parser.heading"></a>
        - calls [lang.parser.Parser.flushProse](lang.md#lang.parser.Parser.flushProse), [lang.parser.Parser.closeList](lang.md#lang.parser.Parser.closeList), [lang.parser.lex](lang.md#lang.parser.lex), [lang.parser.renderTokens](lang.md#lang.parser.renderTokens), [lang.parser.Line.span](lang.md#lang.parser.Line.span), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.parser.isSegment](lang.md#lang.parser.isSegment)
      - fn [item](../../src/parser.ts#L393) (l: Line, wsLen: number, indent: number) → void <!-- internal -->
        <a id="lang.parser.Parser.item"></a>
        - calls [lang.parser.Parser.flushProse](lang.md#lang.parser.Parser.flushProse), [lang.parser.Line.span](lang.md#lang.parser.Line.span), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.parser.Parser.closeList](lang.md#lang.parser.Parser.closeList), [lang.parser.Parser.section](lang.md#lang.parser.Parser.section), [lang.parser.lex](lang.md#lang.parser.lex), [lang.parser.ctxOf](lang.md#lang.parser.ctxOf), [lang.parser.Parser.sectionKind](lang.md#lang.parser.Parser.sectionKind), [lang.parser.Parser.interpret](lang.md#lang.parser.Parser.interpret)
      - fn [interpret](../../src/parser.ts#L446) (n: Node, l: Line, ctx: Ctx, parent: Parent | undefined) → void <!-- internal -->
        <a id="lang.parser.Parser.interpret"></a>
        - calls [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.parser.keywordsOf](lang.md#lang.parser.keywordsOf), [lang.parser.Parser.bare](lang.md#lang.parser.Parser.bare), [lang.parser.keywordKind](lang.md#lang.parser.keywordKind), [lang.parser.Parser.decl](lang.md#lang.parser.Parser.decl), [lang.parser.Parser.refList](lang.md#lang.parser.Parser.refList), [lang.parser.isSegment](lang.md#lang.parser.isSegment), [lang.parser.Parser.layers](lang.md#lang.parser.Parser.layers), [lang.ir.kindLabel](lang.md#lang.ir.kindLabel), [lang.parser.Parser.oneRef](lang.md#lang.parser.Parser.oneRef), [lang.parser.spanned](lang.md#lang.parser.spanned), [lang.parser.Parser.freeText](lang.md#lang.parser.Parser.freeText), [lang.parser.parseLink](lang.md#lang.parser.parseLink), [lang.parser.isId](lang.md#lang.parser.isId), [lang.parser.renderTokens](lang.md#lang.parser.renderTokens)
      - fn [bare](../../src/parser.ts#L595) (n: Node, ctx: Ctx, parent: Parent | undefined) → void <!-- internal -->
        <a id="lang.parser.Parser.bare"></a><br>Item whose first word is not a keyword of its context.
        - calls [lang.parser.Parser.decl](lang.md#lang.parser.Parser.decl), [lang.parser.isSegment](lang.md#lang.parser.isSegment), [lang.parser.spanned](lang.md#lang.parser.spanned), [lang.parser.Parser.oneRef](lang.md#lang.parser.Parser.oneRef), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.ir.kindLabel](lang.md#lang.ir.kindLabel), [lang.parser.keywordsOf](lang.md#lang.parser.keywordsOf)
      - fn [decl](../../src/parser.ts#L645) (n: Node, rest: Token[], parentId: string | null, sig: boolean) → void <!-- internal -->
        <a id="lang.parser.Parser.decl"></a><br>`<name>` or `[name](path#Lnn)` + optional signature.
        - calls [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.ir.kindLabel](lang.md#lang.ir.kindLabel), [lang.parser.parseLink](lang.md#lang.parser.parseLink), [lang.parser.isSegment](lang.md#lang.parser.isSegment), [lang.parser.linkTextSpan](lang.md#lang.parser.linkTextSpan), [lang.parser.renderTokens](lang.md#lang.parser.renderTokens)
      - fn [makeRef](../../src/parser.ts#L682) (t: Token) → Ref | null <!-- internal -->
        <a id="lang.parser.Parser.makeRef"></a><br>A bare ID, or `[id](href)`: the link text is the ID, the target is kept and never checked.
        - calls [lang.parser.isId](lang.md#lang.parser.isId), [lang.parser.parseLink](lang.md#lang.parser.parseLink), [lang.parser.linkTextSpan](lang.md#lang.parser.linkTextSpan), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err)
      - fn [oneRef](../../src/parser.ts#L699) (n: Node, rest: Token[]) → void <!-- internal -->
        <a id="lang.parser.Parser.oneRef"></a>
        - calls [lang.parser.Parser.makeRef](lang.md#lang.parser.Parser.makeRef), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err)
      - fn [refList](../../src/parser.ts#L710) (n: Node, rest: Token[], min: number) → void <!-- internal -->
        <a id="lang.parser.Parser.refList"></a>
        - calls [lang.parser.Parser.makeRef](lang.md#lang.parser.Parser.makeRef), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.ir.kindLabel](lang.md#lang.ir.kindLabel)
      - fn [layers](../../src/parser.ts#L724) (n: Node, rest: Token[]) → void <!-- internal -->
        <a id="lang.parser.Parser.layers"></a><br>`layers a < b < c`
        - calls [lang.parser.Parser.makeRef](lang.md#lang.parser.Parser.makeRef), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err)
      - fn [freeText](../../src/parser.ts#L738) (n: Node, l: Line, rest: Token[]) → void <!-- internal -->
        <a id="lang.parser.Parser.freeText"></a>
        - calls [lang.parser.renderTokens](lang.md#lang.parser.renderTokens), [lang.parser.Line.span](lang.md#lang.parser.Line.span), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.ir.kindLabel](lang.md#lang.ir.kindLabel)
    - fn [spanned](../../src/parser.ts#L752) (t: Token) → Spanned<string> <!-- internal -->
      <a id="lang.parser.spanned"></a>
    - type [Lead](../../src/parser.ts#L756) <!-- internal -->
      <a id="lang.parser.Lead"></a>
    - fn [leadingWhitespace](../../src/parser.ts#L765) (text: string) → Lead <!-- internal -->
      <a id="lang.parser.leadingWhitespace"></a>
    - type [FenceOpen](../../src/parser.ts#L781) <!-- internal -->
      <a id="lang.parser.FenceOpen"></a>
    - fn [openFence](../../src/parser.ts#L790) (text: string) → FenceOpen | null <!-- internal -->
      <a id="lang.parser.openFence"></a><br>A fence opener, ignoring the indent-of-4 rule. An info string with a backtick is not an opener.
      - calls [lang.parser.leadingWhitespace](lang.md#lang.parser.leadingWhitespace)
    - fn [opensFence](../../src/parser.ts#L807) (text: string, listOpen: boolean) → boolean <!-- internal -->
      <a id="lang.parser.opensFence"></a><br>CommonMark fence: indent under 4 spaces, or any indent while a list is open (Р9). A backtick info string that itself contains a backtick is prose.
      - calls [lang.parser.openFence](lang.md#lang.parser.openFence)
    - fn [closesFence](../../src/parser.ts#L812) (text: string, open: { char: string; len: number; columns: number }) → boolean <!-- internal -->
      <a id="lang.parser.closesFence"></a>
      - calls [lang.parser.leadingWhitespace](lang.md#lang.parser.leadingWhitespace)
    - fn [dedentFenceLines](../../src/parser.ts#L829) (lines: string[]) → string[]
      <a id="lang.parser.dedentFenceLines"></a><br>Drop the indent `fmt` owes a fence that was written under a list item. The opener and the closer lose all of their indent; each body line loses as many spaces as the opener had, and never more than it has.
      - calls [lang.parser.openFence](lang.md#lang.parser.openFence), [lang.parser.closesFence](lang.md#lang.parser.closesFence)
    - fn [htmlBlockStart](../../src/parser.ts#L850) (rest: string) → { end: (line: string) => boolean } | null <!-- internal -->
      <a id="lang.parser.htmlBlockStart"></a><br>Start of a CommonMark HTML block of types 1–5, or null. The end test reads the whole line.
    - fn [isBullet](../../src/parser.ts#L861) (rest: string) → boolean <!-- internal -->
      <a id="lang.parser.isBullet"></a>
    - fn [isSegment](../../src/parser.ts#L868) (s: string) → boolean
      <a id="lang.parser.isSegment"></a><br>A single ID segment: letter or `_`, then letters (with their combining marks), digits, `_`, `-`.
    - fn [isId](../../src/parser.ts#L874) (s: string) → boolean
      <a id="lang.parser.isId"></a><br>A dotted ID: `segment(.segment)*`.
    - fn [linkTextSpan](../../src/parser.ts#L880) (t: Token) → Span
      <a id="lang.parser.linkTextSpan"></a><br>The span of the text inside `[…]`, the same span a link reference uses.
      - calls [lang.parser.parseLink](lang.md#lang.parser.parseLink), [lang.parser.codePoints](lang.md#lang.parser.codePoints)
    - fn [parseLink](../../src/parser.ts#L886) (t: Token) → Link <!-- internal -->
      <a id="lang.parser.parseLink"></a>
      - calls [lang.parser.decodeLinkPath](lang.md#lang.parser.decodeLinkPath)
    - fn [decodeLinkPath](../../src/parser.ts#L905) (path: string) → string <!-- internal -->
      <a id="lang.parser.decodeLinkPath"></a><br>Percent-decoding for map links. A broken escape is kept as written so the diagnostic still points at the source.
    - fn [lex](../../src/parser.ts#L919) (l: Line, start: number, errs: [Span, string][]) → { tokens: Token[]; comment: Spanned<string> | null } <!-- internal -->
      <a id="lang.parser.lex"></a><br>Split an item head into tokens. Words end at whitespace or `,`; `[text](target)` and `"quoted"` are single tokens (a `[` that opens no link is an ordinary word); `<!-- … -->` ends the head and is returned separately.
      - calls [lang.parser.Line.span](lang.md#lang.parser.Line.span), [lang.parser.linkEnd](lang.md#lang.parser.linkEnd)
    - fn [linkEnd](../../src/parser.ts#L978) (s: string, i: number) → number | null <!-- internal -->
      <a id="lang.parser.linkEnd"></a>
    - fn [renderMeaning](../../src/parser.ts#L992) (node: Node) → string
      <a id="lang.parser.renderMeaning"></a><br>What an item's head says, for comparing meaning (a verdict's `specHash`, a rule already written): canonical tokens, with a reference written as a link `[id](href)` counted as its ID, so linking a reference changes nothing.
      - calls [lang.parser.renderTokens](lang.md#lang.parser.renderTokens)
    - fn [renderTokens](../../src/parser.ts#L998) (tokens: readonly Token[]) → string
      <a id="lang.parser.renderTokens"></a><br>Canonical rendering of head tokens: single spaces, `a, b` for commas.
  - module [spec-ir](../../src/spec-ir.ts#L1)
    <a id="lang.spec-ir"></a><br>SpecIR: typed assertions compiled from the text IR. `compileSpec` checks assertion form (a layer order, a wiring condition). Checks that need the snapshot still run later.
    - config [base.config](base.md#base.config)
    - diag [base.diag](base.md#base.diag)
    - ir [lang.ir](lang.md#lang.ir)
    - parser [lang.parser](lang.md#lang.parser)
    - span [base.span](base.md#base.span)
    - fn [syntheticLayer](../../src/spec-ir.ts#L13) (name: string) → boolean
      <a id="lang.spec-ir.syntheticLayer"></a><br>Configured names that are layers even when `keylang.json` does not list them. Assertion checks use this later; compilation does not reject them.
    - type [NonEmpty](../../src/spec-ir.ts#L17) = readonly [T, ...T[]]
      <a id="lang.spec-ir.NonEmpty"></a>
    - type [Located](../../src/spec-ir.ts#L19) <!-- internal -->
      <a id="lang.spec-ir.Located"></a>
    - type [LayerOrder](../../src/spec-ir.ts#L27) extends Located
      <a id="lang.spec-ir.LayerOrder"></a>
    - type [RejectedLayers](../../src/spec-ir.ts#L36)
      <a id="lang.spec-ir.RejectedLayers"></a><br>A `layers` line that is not an order. It is not an assertion; its text still enters the no-snapshot hash when it names an order.
    - type [DependencyRule](../../src/spec-ir.ts#L45) extends Located
      <a id="lang.spec-ir.DependencyRule"></a>
    - type [Entry](../../src/spec-ir.ts#L52) extends Located
      <a id="lang.spec-ir.Entry"></a>
    - type [NoCycles](../../src/spec-ir.ts#L57) extends Located
      <a id="lang.spec-ir.NoCycles"></a>
    - type [ExportsRule](../../src/spec-ir.ts#L63) extends Located
      <a id="lang.spec-ir.ExportsRule"></a>
    - type [RuleAssertion](../../src/spec-ir.ts#L69) = LayerOrder | DependencyRule | Entry | NoCycles | ExportsRule
      <a id="lang.spec-ir.RuleAssertion"></a>
    - type [SpecModule](../../src/spec-ir.ts#L72)
      <a id="lang.spec-ir.SpecModule"></a><br>A `module x` line. It scopes nested rules and is not itself an assertion, so nothing hashes it.
    - type [FlowStep](../../src/spec-ir.ts#L79) extends Located
      <a id="lang.spec-ir.FlowStep"></a>
    - type [Trigger](../../src/spec-ir.ts#L85) extends Located
      <a id="lang.spec-ir.Trigger"></a>
    - type [WhenItem](../../src/spec-ir.ts#L91) extends Located
      <a id="lang.spec-ir.WhenItem"></a>
    - type [ThenItem](../../src/spec-ir.ts#L97)
      <a id="lang.spec-ir.ThenItem"></a>
    - type [ClaimItem](../../src/spec-ir.ts#L99) extends Located
      <a id="lang.spec-ir.ClaimItem"></a>
    - type [TestItem](../../src/spec-ir.ts#L107) extends Located
      <a id="lang.spec-ir.TestItem"></a>
    - type [FlowItem](../../src/spec-ir.ts#L114) = FlowStep | WhenItem | ThenItem | ClaimItem | TestItem
      <a id="lang.spec-ir.FlowItem"></a>
    - type [Flow](../../src/spec-ir.ts#L116)
      <a id="lang.spec-ir.Flow"></a>
    - type [Planned](../../src/spec-ir.ts#L128) extends Located
      <a id="lang.spec-ir.Planned"></a>
    - type [WireWhen](../../src/spec-ir.ts#L136) extends Located
      <a id="lang.spec-ir.WireWhen"></a><br>A `when` whose condition is `env.NAME = value` and whose target resolved.
    - type [WireCompose](../../src/spec-ir.ts#L142) extends Located
      <a id="lang.spec-ir.WireCompose"></a>
    - type [WireDep](../../src/spec-ir.ts#L146) extends Located
      <a id="lang.spec-ir.WireDep"></a>
    - type [Wire](../../src/spec-ir.ts#L153) extends Located
      <a id="lang.spec-ir.Wire"></a>
    - type [SpecIR](../../src/spec-ir.ts#L158)
      <a id="lang.spec-ir.SpecIR"></a>
    - fn [walkFlow](../../src/spec-ir.ts#L172) (flow: Flow, visit: (item: Trigger | FlowItem) => void) → void
      <a id="lang.spec-ir.walkFlow"></a><br>Triggers and top-level items, then nested items, in source order.
    - type [LayerCandidate](../../src/spec-ir.ts#L183) <!-- internal -->
      <a id="lang.spec-ir.LayerCandidate"></a>
    - type [PlacedRule](../../src/spec-ir.ts#L194) <!-- internal -->
      <a id="lang.spec-ir.PlacedRule"></a>
    - fn [compileSpec](../../src/spec-ir.ts#L199) (docs: readonly Document[]) → { spec: SpecIR; diagnostics: Diagnostic[] }
      <a id="lang.spec-ir.compileSpec"></a>
      - calls [lang.spec-ir.compileRules](lang.md#lang.spec-ir.compileRules), [lang.spec-ir.compileFlow](lang.md#lang.spec-ir.compileFlow), [lang.spec-ir.compileWires](lang.md#lang.spec-ir.compileWires), [lang.spec-ir.settleLayers](lang.md#lang.spec-ir.settleLayers)
    - fn [compileRules](../../src/spec-ir.ts#L223) ( file: string, section: Section, placed: PlacedRule[], candidates: LayerCandidate[], modules: SpecModule[], diagnostics: Diagnostic[], nextSeq: () => number, ) → void <!-- internal -->
      <a id="lang.spec-ir.compileRules"></a>
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.spec-ir.considerLayers](lang.md#lang.spec-ir.considerLayers), [lang.spec-ir.dependency](lang.md#lang.spec-ir.dependency), [lang.spec-ir.entryLine](lang.md#lang.spec-ir.entryLine), [lang.spec-ir.noCycles](lang.md#lang.spec-ir.noCycles), [lang.spec-ir.exportsRule](lang.md#lang.spec-ir.exportsRule)
    - fn [considerLayers](../../src/spec-ir.ts#L262) (file: string, node: Node, diagnostics: Diagnostic[]) → Omit<LayerCandidate, "seq"> | null <!-- internal -->
      <a id="lang.spec-ir.considerLayers"></a><br>A `layers` line the old text IR would have kept, with K005 for a non-layer or a repeated layer. An empty line is absent.
      - calls [base.diag.diagnostic](base.md#base.diag.diagnostic)
    - fn [settleLayers](../../src/spec-ir.ts#L289) (candidates: readonly LayerCandidate[], diagnostics: Diagnostic[]) → { orders: PlacedRule[]; rejectedLayers: RejectedLayers[] } <!-- internal -->
      <a id="lang.spec-ir.settleLayers"></a><br>One partial order across every document, in encounter order. A line that contradicts an earlier order is K005 and not an order.
      - calls [base.diag.diagnostic](base.md#base.diag.diagnostic), [lang.spec-ir.layersAbove](lang.md#lang.spec-ir.layersAbove), [lang.spec-ir.at](lang.md#lang.spec-ir.at)
    - fn [layersAbove](../../src/spec-ir.ts#L341) (direct: ReadonlyMap<string, ReadonlySet<string>>) → Map<string, Set<string>> <!-- internal -->
      <a id="lang.spec-ir.layersAbove"></a>
    - fn [dependency](../../src/spec-ir.ts#L357) (file: string, node: Node, effect: "allow" | "deny") → DependencyRule | null <!-- internal -->
      <a id="lang.spec-ir.dependency"></a>
      - calls [lang.spec-ir.nonEmpty](lang.md#lang.spec-ir.nonEmpty), [lang.spec-ir.at](lang.md#lang.spec-ir.at)
    - fn [nonEmpty](../../src/spec-ir.ts#L364) (refs: readonly Ref[]) → NonEmpty<Ref> | null <!-- internal -->
      <a id="lang.spec-ir.nonEmpty"></a>
    - fn [entryLine](../../src/spec-ir.ts#L369) (file: string, node: Node) → Entry | null <!-- internal -->
      <a id="lang.spec-ir.entryLine"></a>
      - calls [lang.spec-ir.at](lang.md#lang.spec-ir.at)
    - fn [noCycles](../../src/spec-ir.ts#L376) (file: string, node: Node, under: Ref | null) → NoCycles <!-- internal -->
      <a id="lang.spec-ir.noCycles"></a>
      - calls [lang.spec-ir.at](lang.md#lang.spec-ir.at)
    - fn [exportsRule](../../src/spec-ir.ts#L380) (file: string, node: Node, module: Ref) → ExportsRule | null <!-- internal -->
      <a id="lang.spec-ir.exportsRule"></a>
      - calls [lang.spec-ir.at](lang.md#lang.spec-ir.at)
    - fn [compileFlow](../../src/spec-ir.ts#L387) (file: string, section: Section, planned: Planned[]) → Flow <!-- internal -->
      <a id="lang.spec-ir.compileFlow"></a>
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.spec-ir.plannedDecl](lang.md#lang.spec-ir.plannedDecl), [lang.spec-ir.triggerItem](lang.md#lang.spec-ir.triggerItem), [lang.spec-ir.flowItems](lang.md#lang.spec-ir.flowItems), [lang.spec-ir.flowNode](lang.md#lang.spec-ir.flowNode)
    - fn [flowNode](../../src/spec-ir.ts#L423) (file: string, flow: string, node: Node) → FlowItem[] <!-- internal -->
      <a id="lang.spec-ir.flowNode"></a>
      - calls [lang.spec-ir.flowItems](lang.md#lang.spec-ir.flowItems), [lang.spec-ir.flowAt](lang.md#lang.spec-ir.flowAt)
    - fn [flowItems](../../src/spec-ir.ts#L457) (file: string, flow: string, nodes: readonly Node[]) → FlowItem[] <!-- internal -->
      <a id="lang.spec-ir.flowItems"></a>
      - calls [lang.spec-ir.flowNode](lang.md#lang.spec-ir.flowNode)
    - fn [triggerItem](../../src/spec-ir.ts#L461) (file: string, flow: string, node: Node) → Trigger | null <!-- internal -->
      <a id="lang.spec-ir.triggerItem"></a>
      - calls [lang.spec-ir.flowItems](lang.md#lang.spec-ir.flowItems), [lang.spec-ir.flowAt](lang.md#lang.spec-ir.flowAt)
    - fn [plannedDeclKind](../../src/spec-ir.ts#L467) (value: string) → Planned["decl"] | null <!-- internal -->
      <a id="lang.spec-ir.plannedDeclKind"></a>
    - fn [plannedDecl](../../src/spec-ir.ts#L472) (file: string, node: Node) → Planned | null <!-- internal -->
      <a id="lang.spec-ir.plannedDecl"></a>
      - calls [lang.spec-ir.plannedDeclKind](lang.md#lang.spec-ir.plannedDeclKind), [lang.spec-ir.at](lang.md#lang.spec-ir.at), [lang.parser.renderMeaning](lang.md#lang.parser.renderMeaning)
    - fn [compileWires](../../src/spec-ir.ts#L478) (file: string, section: Section, wires: Wire[], diagnostics: Diagnostic[]) → void <!-- internal -->
      <a id="lang.spec-ir.compileWires"></a>
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.spec-ir.at](lang.md#lang.spec-ir.at), [lang.parser.renderMeaning](lang.md#lang.parser.renderMeaning), [lang.spec-ir.wireWhen](lang.md#lang.spec-ir.wireWhen)
    - fn [wireWhen](../../src/spec-ir.ts#L504) (file: string, option: Node, diagnostics: Diagnostic[]) → WireWhen | null <!-- internal -->
      <a id="lang.spec-ir.wireWhen"></a><br>`env.NAME = value` with a target. A condition of another shape is K005 and is not stored.
      - calls [lang.spec-ir.wireConditionText](lang.md#lang.spec-ir.wireConditionText), [base.diag.diagnostic](base.md#base.diag.diagnostic), [lang.spec-ir.at](lang.md#lang.spec-ir.at), [lang.parser.renderMeaning](lang.md#lang.parser.renderMeaning)
    - fn [wireConditionText](../../src/spec-ir.ts#L522) (node: Node) → string <!-- internal -->
      <a id="lang.spec-ir.wireConditionText"></a><br>Condition text of `- when <condition> → <id>`, matching the bytes the wiring check compares: tokens between the keyword and the arrow, joined only where they do not already touch. `env.DB = a,b` stays `a,b`.
    - fn [at](../../src/spec-ir.ts#L535) (file: string, node: Node, text: string) → Located <!-- internal -->
      <a id="lang.spec-ir.at"></a>
    - fn [flowAt](../../src/spec-ir.ts#L539) (file: string, flow: string, node: Node) → Located <!-- internal -->
      <a id="lang.spec-ir.flowAt"></a>
      - calls [lang.spec-ir.at](lang.md#lang.spec-ir.at), [lang.parser.renderMeaning](lang.md#lang.parser.renderMeaning)
