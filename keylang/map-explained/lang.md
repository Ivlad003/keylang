<!-- keylang:generated — не редагувати, `keylang map` -->

[README](README.md) · modules: [files](#lang.files) · [fmt](#lang.fmt) · [ir](#lang.ir) · [parse-format](#lang.parse-format) · [parser](#lang.parser) · [spec-ir](#lang.spec-ir)

# map

- lang
  <a id="lang"></a><br>Turns keylang Markdown into an IR ([`lang.parser`](lang.md#lang.parser), [`lang.ir`](lang.md#lang.ir)), compiles typed assertions ([`lang.spec-ir`](lang.md#lang.spec-ir)), and renders canonical or parse output ([`lang.fmt`](lang.md#lang.fmt), [`lang.parse-format`](lang.md#lang.parse-format)); it must not depend on `map`, `extract`, or web-tree-sitter. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
  - module [files](../../src/files.ts#L1)
    <a id="lang.files"></a><br>File discovery and loading for the Markdown side of the pipeline (Markdown → IR → resolve/rules): the CLI hands paths here, `collectMdFiles` expands them into the spec documents to read, and `load` parses each into the Text IR `Document`. Also small read helpers that tell a…
    - node [external.node](external.md#external.node)
    - ir [lang.ir](lang.md#lang.ir)
    - parser [lang.parser](lang.md#lang.parser)
    - fn [collectMdFiles](../../src/files.ts#L20) (paths: readonly string[], base?: string) → string[]
      <a id="lang.files.collectMdFiles"></a><br>Expand files and directories into a sorted list of `*.md` files. Hidden directories, `node_modules` and `target` are skipped.
      - calls [lang.files.walkDir](lang.md#lang.files.walkDir), [lang.files.realPath](lang.md#lang.files.realPath)
    - fn [skippedDirectory](../../src/files.ts#L58) (name: string) → boolean
      <a id="lang.files.skippedDirectory"></a><br>A directory the walk over a spec directory does not enter: hidden, `node_modules`, `target`.
    - fn [walkReaches](../../src/files.ts#L63) (dir: string, abs: string) → boolean
      <a id="lang.files.walkReaches"></a><br>Whether the walk from `dir` (or `dir` itself, a file) reaches `abs`: inside it, and through no skipped directory below it.
      - calls [lang.files.skippedDirectory](lang.md#lang.files.skippedDirectory)
    - fn [walkDir](../../src/files.ts#L78) (dir: string, out: string[], walked: Set<string>, at: (p: string) => string) → void <!-- internal -->
      <a id="lang.files.walkDir"></a><br>Append the `*.md` files under `dir` to `out`, depth first in name order.
      - calls [lang.files.realPath](lang.md#lang.files.realPath), [lang.files.entryType](lang.md#lang.files.entryType), [lang.files.skippedDirectory](lang.md#lang.files.skippedDirectory)
    - fn [entryType](../../src/files.ts#L100) (e: Dirent, path: string) → "dir" | "file" | null <!-- internal -->
      <a id="lang.files.entryType"></a><br>What a directory entry is, through a link; a dangling link is neither.
    - fn [realPath](../../src/files.ts#L113) (path: string) → string <!-- internal -->
      <a id="lang.files.realPath"></a><br>The canonical path through links; the plain absolute path when it cannot be resolved.
    - fn [load](../../src/files.ts#L122) (files: readonly string[]) → Document[]
      <a id="lang.files.load"></a><br>Read and parse files.
      - calls [lang.parser.parse](lang.md#lang.parser.parse)
    - fn [readTextOrNull](../../src/files.ts#L127) (path: string) → string | null
      <a id="lang.files.readTextOrNull"></a><br>A file's text, or null when it cannot be read for any reason: missing, a directory, no permission.
    - fn [existingText](../../src/files.ts#L136) (path: string) → string | null
      <a id="lang.files.existingText"></a><br>A file's text, or null when there is no file; a directory or an unreadable file throws, so the caller names it.
  - module [fmt](../../src/fmt.ts#L1)
    <a id="lang.fmt"></a><br>Canonical formatting (`keylang fmt`). Rendered from the IR, so the output is idempotent by construction: `format(parse(format(x))) == format(x)`.
    - diag [base.diag](base.md#base.diag)
    - ir [lang.ir](lang.md#lang.ir)
    - parser [lang.parser](lang.md#lang.parser)
    - fn [formatSource](../../src/fmt.ts#L16) (path: string, src: string) → { ok: true; text: string } | { ok: false; diagnostics: Diagnostic[] }
      <a id="lang.fmt.formatSource"></a><br>Format source text. Returns the structural (K003) diagnostics instead when the tree shape is ambiguous — formatting would silently re-nest items.
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [lang.fmt.formatDocument](lang.md#lang.fmt.formatDocument)
    - fn [formatDocument](../../src/fmt.ts#L27) (doc: Document) → string
      <a id="lang.fmt.formatDocument"></a><br>Render a parsed document in canonical form: the generated marker, then each section's heading and items, with blocks separated by one blank line.
      - calls [lang.fmt.renderNode](lang.md#lang.fmt.renderNode), [lang.parser.dedentFenceLines](lang.md#lang.parser.dedentFenceLines)
    - fn [renderNode](../../src/fmt.ts#L60) (out: string, n: Node, depth: number) → string <!-- internal -->
      <a id="lang.fmt.renderNode"></a><br>Append one item and its subtree to `out`: two spaces of indent per depth level, descriptions one step deeper.
      - calls [lang.parser.renderTokens](lang.md#lang.parser.renderTokens)
  - module [ir](../../src/ir.ts#L1)
    <a id="lang.ir"></a><br>Intermediate representation of keylang Markdown files.
    - diag [base.diag](base.md#base.diag)
    - span [base.span](base.md#base.span)
    - type [Document](../../src/ir.ts#L15)
      <a id="lang.ir.Document"></a><br>One parsed Markdown file: its sections in source order plus parse-time diagnostics.
    - type [SectionKind](../../src/ir.ts#L25) = "map" | "rules" | "flow" | "wiring" | "migration" | "system"
      <a id="lang.ir.SectionKind"></a><br>What a `# …` heading opens; the heading word decides it (`# flow checkout` → "flow").
    - type [Section](../../src/ir.ts#L28)
      <a id="lang.ir.Section"></a><br>Content under one `# …` heading (or before the first heading).
    - type [Item](../../src/ir.ts#L40)
      <a id="lang.ir.Item"></a><br>One entry of a section in source order: a keylang list item, or verbatim prose or code kept for `fmt`.
    - type [NodeKind](../../src/ir.ts#L48)
      <a id="lang.ir.NodeKind"></a><br>What a list item means; the keyword or the item's position decides it. Grouped below by the section kind that allows it.
    - fn [isDecl](../../src/ir.ts#L127) (kind: NodeKind) → boolean
      <a id="lang.ir.isDecl"></a><br>Kinds that declare an ID in the global namespace.
    - fn [kindLabel](../../src/ir.ts#L139) (kind: NodeKind) → string
      <a id="lang.ir.kindLabel"></a><br>The keyword as written in the language (`rule-module` is spelled `module`).
    - type [Node](../../src/ir.ts#L144)
      <a id="lang.ir.Node"></a><br>One list item `- <kind>? <name> <args…>` and everything nested under it.
    - type [Link](../../src/ir.ts#L172)
      <a id="lang.ir.Link"></a><br>A Markdown link `[text](target)`, used as a code anchor or a linked reference.
    - type [Ref](../../src/ir.ts#L184)
      <a id="lang.ir.Ref"></a><br>A reference to an ID that the resolver must find among declarations.
    - type [TokenKind](../../src/ir.ts#L199) = "word" | "link" | "quoted" | "comma"
      <a id="lang.ir.TokenKind"></a><br>Lexical class of a head token: a bare word, a `[…](…)` link, a `"…"` string or a comma.
    - type [Token](../../src/ir.ts#L202)
      <a id="lang.ir.Token"></a><br>A raw token of an item line, kept so `fmt` can re-emit what was written.
    - fn [walk](../../src/ir.ts#L209) (node: Node, f: (n: Node) => void) → void
      <a id="lang.ir.walk"></a><br>Pre-order walk over a node and its descendants.
    - fn [sectionNodes](../../src/ir.ts#L216) (section: Section) → Node[]
      <a id="lang.ir.sectionNodes"></a><br>The keylang nodes of a section, without its prose and code blocks.
  - module [parse-format](../../src/parse-format.ts#L1)
    <a id="lang.parse-format"></a><br>The stdout of `keylang parse [--json]` for parsed documents: the indented tree or the Text IR as JSON. Pure text, shared by the CLI and the TUI (and its export), so both give the same bytes; diagnostics are not part of it.
    - ir [lang.ir](lang.md#lang.ir)
    - type [ParseFormat](../../src/parse-format.ts#L13) = (typeof PARSE_FORMATS)[number]
      <a id="lang.parse-format.ParseFormat"></a><br>Derives a string-literal union type from the element type of the `PARSE_FORMATS` array, so the set of allowed parse format names is defined once as runtime data and reused statically for type checking. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - fn [parseReportText](../../src/parse-format.ts#L16) (format: ParseFormat, docs: readonly Document[]) → string
      <a id="lang.parse-format.parseReportText"></a><br>The whole stdout of `parse` in a format, every line ending in `\n`.
      - calls [lang.parse-format.treeLines](lang.md#lang.parse-format.treeLines)
    - fn [treeLines](../../src/parse-format.ts#L23) (doc: Document) → string[] <!-- internal -->
      <a id="lang.parse-format.treeLines"></a><br>One document as the tree `parse` prints: the path, each section, its nodes with their start.
      - calls [lang.parse-format.nodeLines](lang.md#lang.parse-format.nodeLines)
    - fn [nodeLines](../../src/parse-format.ts#L36) (n: Node, depth: number, out: string[]) → void <!-- internal -->
      <a id="lang.parse-format.nodeLines"></a><br>Appends one node and, depth-first, its children: kind, ID or name, link, text, label, refs, then `@line:col` of its start.
      - calls [lang.ir.kindLabel](lang.md#lang.ir.kindLabel)
  - module [parser](../../src/parser.ts#L1)
    <a id="lang.parser"></a><br>Markdown → IR. A small line-oriented parser: keylang files use a strict subset of Markdown (headings, bullet lists indented by 2 spaces, paragraphs, fenced code), so a hand-written parser gives exact spans for every token without mapping back from a CommonMark AST.
    - diag [base.diag](base.md#base.diag)
    - ir [lang.ir](lang.md#lang.ir)
    - span [base.span](base.md#base.span)
    - fn [parse](../../src/parser.ts#L22) (path: string, src: string) → Document
      <a id="lang.parser.parse"></a><br>Parses one Markdown file into the Text IR: sections, their items, and the parse diagnostics. Never throws.
      - calls [lang.parser.Parser](lang.md#lang.parser.Parser), [lang.parser.splitInclusive](lang.md#lang.parser.splitInclusive), [lang.parser.Parser.line](lang.md#lang.parser.Parser.line), [lang.parser.Line](lang.md#lang.parser.Line), [lang.parser.Parser.finish](lang.md#lang.parser.Parser.finish)
    - fn [splitInclusive](../../src/parser.ts#L40) (src: string) → string[] <!-- internal -->
      <a id="lang.parser.splitInclusive"></a><br>Split keeping the `\n` on each line (like Rust's `split_inclusive`).
    - module [Line](../../src/parser.ts#L57) <!-- internal -->
      <a id="lang.parser.Line"></a><br>One source line: its 1-based number, the offset of its first character, and its text without the line ending.
      - fn [constructor](../../src/parser.ts#L62) (no: number, start: number, text: string)
        <a id="lang.parser.Line.constructor"></a><br>Stores a line's number, its byte offset in the source, and its raw text as fields on a new line record. Performs no parsing or validation of the given values. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - fn [pos](../../src/parser.ts#L69) (b: number) → Pos
        <a id="lang.parser.Line.pos"></a><br>The position of a UTF-16 index into the line's text: absolute offset, 1-based line, 1-based code-point column.
        - calls [lang.parser.codePoints](lang.md#lang.parser.codePoints)
      - fn [span](../../src/parser.ts#L74) (a: number, b: number) → Span
        <a id="lang.parser.Line.span"></a><br>The span between two UTF-16 indexes of the line.
        - calls [lang.parser.Line.pos](lang.md#lang.parser.Line.pos)
    - fn [codePoints](../../src/parser.ts#L80) (s: string) → number <!-- internal -->
      <a id="lang.parser.codePoints"></a><br>The number of Unicode code points in `s` (a surrogate pair counts once).
    - type [Ctx](../../src/parser.ts#L89) <!-- internal -->
      <a id="lang.parser.Ctx"></a><br>Where an item stands, which decides the keywords it may use.
    - fn [ctxOf](../../src/parser.ts#L118) (section: SectionKind, parent: NodeKind | undefined) → Ctx <!-- internal -->
      <a id="lang.parser.ctxOf"></a><br>The position an item under `parent` stands in: section top, under a node of a nesting kind, or a leaf (nothing may nest).
    - type [TriggerKind](../../src/parser.ts#L174) = (typeof TRIGGER_KINDS)[number]
      <a id="lang.parser.TriggerKind"></a>
    - fn [isTriggerKind](../../src/parser.ts#L177) (word: string) → word is TriggerKind
      <a id="lang.parser.isTriggerKind"></a><br>Whether a word names one of the entry-point kinds of `trigger <kind> <id>`.
    - fn [isEventId](../../src/parser.ts#L187) (text: string) → boolean
      <a id="lang.parser.isEventId"></a><br>An event ID (ADR 0022 п. 6, ADR 0023 п. 1): a member of the generated group `events` (`events.checkout_submit_all_after`). `emits [event] <name>` with such a name is a reference checked against the snapshot; any other name stays prose, as before.
      - calls [lang.parser.isId](lang.md#lang.parser.isId)
    - fn [isDuration](../../src/parser.ts#L201) (text: string) → boolean
      <a id="lang.parser.isDuration"></a><br>Whether `text` is a duration such as `15m`.
    - fn [scheduleText](../../src/parser.ts#L210) (words: readonly string[]) → string | null
      <a id="lang.parser.scheduleText"></a><br>The schedule of `every <schedule>` in one canonical text, or null when the words are not one: a duration (`15m`), a cron macro (`@daily`), or five or six cron fields, bare (`*\/5 * * * *`) or in double quotes. Quotes are dropped.
    - type [ComponentKind](../../src/parser.ts#L236) = (typeof COMPONENT_KINDS)[number]
      <a id="lang.parser.ComponentKind"></a>
    - fn [isComponentKind](../../src/parser.ts#L239) (word: string) → word is ComponentKind
      <a id="lang.parser.isComponentKind"></a><br>Whether a word is a component kind of `# system`.
    - fn [isRelationVerb](../../src/parser.ts#L250) (word: string) → word is (typeof RELATION_VERBS)[number]
      <a id="lang.parser.isRelationVerb"></a><br>Whether a word is a relation verb of a `# system` component.
    - fn [isInterviewKind](../../src/parser.ts#L261) (word: string) → word is (typeof INTERVIEW)[number] <!-- internal -->
      <a id="lang.parser.isInterviewKind"></a><br>Whether a word is an interview line kind of `# system`.
    - fn [isSystemCtx](../../src/parser.ts#L266) (ctx: Ctx) → boolean <!-- internal -->
      <a id="lang.parser.isSystemCtx"></a><br>Whether a position is inside `# system`, where keywords map to system node kinds.
    - fn [keywordsAt](../../src/parser.ts#L271) (section: SectionKind, parent: NodeKind | undefined) → readonly string[]
      <a id="lang.parser.keywordsAt"></a><br>Keywords an item may start with under `parent` (none at the top of a section).
      - calls [lang.parser.keywordsOf](lang.md#lang.parser.keywordsOf), [lang.parser.ctxOf](lang.md#lang.parser.ctxOf)
    - fn [keywordsOf](../../src/parser.ts#L276) (ctx: Ctx) → readonly string[] <!-- internal -->
      <a id="lang.parser.keywordsOf"></a><br>The keywords allowed in a position; K004 rejects any other.
    - fn [placeHint](../../src/parser.ts#L357) (word: string, ctx: Ctx, section: SectionKind) → string <!-- internal -->
      <a id="lang.parser.placeHint"></a><br>`; \`calls\` goes under \`- fn\`` when `word` is a keyword of other positions and not of `ctx`, else "". The places of the current section are listed; when the word belongs to other sections, one place is named with its section and several by their sections only (`; \`test\`…
      - calls [lang.parser.keywordsOf](lang.md#lang.parser.keywordsOf)
    - fn [roles](../../src/parser.ts#L403) (entries: readonly (readonly [NodeKind, string])[]) → ReadonlyMap<NodeKind, string> <!-- internal -->
      <a id="lang.parser.roles"></a>
    - fn [roleAt](../../src/parser.ts#L498) (section: SectionKind, parent: NodeKind | undefined, kind: NodeKind) → string | null
      <a id="lang.parser.roleAt"></a><br>The role of an item of `kind` under `parent` (or at the top of `section`), or `null` when it has none there.
      - calls [lang.parser.ctxOf](lang.md#lang.parser.ctxOf)
    - fn [keywordKind](../../src/parser.ts#L507) (ctx: Ctx, kw: string) → NodeKind <!-- internal -->
      <a id="lang.parser.keywordKind"></a><br>The node kind a keyword makes in a position; `unknown` for a word that is no keyword there.
      - calls [lang.parser.isSystemCtx](lang.md#lang.parser.isSystemCtx), [lang.parser.isComponentKind](lang.md#lang.parser.isComponentKind), [lang.parser.isRelationVerb](lang.md#lang.parser.isRelationVerb), [lang.parser.isInterviewKind](lang.md#lang.parser.isInterviewKind)
    - type [Parent](../../src/parser.ts#L560) <!-- internal -->
      <a id="lang.parser.Parent"></a><br>What an item needs to know about its parent: kind, ID, the target it refers to, and its keyword's value.
    - module [Parser](../../src/parser.ts#L569) <!-- internal -->
      <a id="lang.parser.Parser"></a><br>The state machine that turns lines into sections, nodes, prose and code, with diagnostics.
      - fn [constructor](../../src/parser.ts#L584) (path: string)
        <a id="lang.parser.Parser.constructor"></a><br>Stores the given file path and initializes an empty document record carrying that path, a null `generated` marker, and empty `sections` and `diagnostics` lists for later parsing to fill. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - fn [err](../../src/parser.ts#L590) (code: Exclude<Code, "K005">, span: Span, msg: string) → void <!-- internal -->
        <a id="lang.parser.Parser.err"></a><br>Records a parse diagnostic; only K005 carries a reason.
        - calls [base.diag.diagnostic](base.md#base.diag.diagnostic)
      - fn [section](../../src/parser.ts#L598) () → Section <!-- internal -->
        <a id="lang.parser.Parser.section"></a><br>The current section; a file without a heading starts with an implicit map section.
      - fn [sectionKind](../../src/parser.ts#L607) () → SectionKind <!-- internal -->
        <a id="lang.parser.Parser.sectionKind"></a><br>The kind of the current section (`map` before any heading).
      - fn [flushProse](../../src/parser.ts#L612) () → void <!-- internal -->
        <a id="lang.parser.Parser.flushProse"></a><br>Moves buffered prose lines into the current section as one prose item.
        - calls [lang.parser.Parser.section](lang.md#lang.parser.Parser.section)
      - fn [pushDescription](../../src/parser.ts#L620) (l: Line, text: string, lead: Lead, depth: number) → void <!-- internal -->
        <a id="lang.parser.Parser.pushDescription"></a><br>A non-empty line that belongs to an open item as its description (§3).
        - calls [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.parser.Line.span](lang.md#lang.parser.Line.span)
      - fn [closeList](../../src/parser.ts#L628) (depth: number) → void <!-- internal -->
        <a id="lang.parser.Parser.closeList"></a><br>Pops open items deeper than `depth`, attaching each to its parent (or to the section at depth 0).
        - calls [lang.parser.Parser.section](lang.md#lang.parser.Parser.section)
      - fn [finish](../../src/parser.ts#L639) () → Document
        <a id="lang.parser.Parser.finish"></a><br>Closes whatever is still open at the end of the file and returns the document.
        - calls [lang.parser.Parser.section](lang.md#lang.parser.Parser.section), [lang.parser.Parser.flushProse](lang.md#lang.parser.Parser.flushProse), [lang.parser.Parser.closeList](lang.md#lang.parser.Parser.closeList)
      - fn [line](../../src/parser.ts#L657) (l: Line) → void
        <a id="lang.parser.Parser.line"></a><br>Feeds one line to the state machine. Order matters: an open fence takes every line until it closes, an open HTML block takes lines until it ends, then blank lines, the generated marker, headings, fences, bullets, descriptions and prose are told apart.
        - calls [lang.parser.closesFence](lang.md#lang.parser.closesFence), [lang.parser.Parser.section](lang.md#lang.parser.Parser.section), [lang.parser.leadingWhitespace](lang.md#lang.parser.leadingWhitespace), [lang.parser.Parser.pushDescription](lang.md#lang.parser.Parser.pushDescription), [lang.parser.Parser.flushProse](lang.md#lang.parser.Parser.flushProse), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.parser.htmlBlockStart](lang.md#lang.parser.htmlBlockStart), [lang.parser.Parser.closeList](lang.md#lang.parser.Parser.closeList), [lang.parser.Parser.heading](lang.md#lang.parser.Parser.heading), [lang.parser.opensFence](lang.md#lang.parser.opensFence), [lang.parser.openFence](lang.md#lang.parser.openFence), [lang.parser.isBullet](lang.md#lang.parser.isBullet), [lang.parser.Parser.item](lang.md#lang.parser.Parser.item), [lang.parser.Line.span](lang.md#lang.parser.Line.span)
      - fn [heading](../../src/parser.ts#L776) (l: Line) → void <!-- internal -->
        <a id="lang.parser.Parser.heading"></a><br>Ends pending prose and lists, then lexes a `#` line into a new section of kind map, rules, flow or wiring, defaulting to map with a K006 error. Only a flow takes a name, checked by [`lang.parser.isSegment`](lang.md#lang.parser.isSegment); missing names or extra words raise K005. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
        - calls [lang.parser.Parser.flushProse](lang.md#lang.parser.Parser.flushProse), [lang.parser.Parser.closeList](lang.md#lang.parser.Parser.closeList), [lang.parser.lex](lang.md#lang.parser.lex), [lang.parser.Line](lang.md#lang.parser.Line), [lang.parser.headingEnd](lang.md#lang.parser.headingEnd), [lang.parser.renderTokens](lang.md#lang.parser.renderTokens), [lang.parser.Line.span](lang.md#lang.parser.Line.span), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.parser.isSegment](lang.md#lang.parser.isSegment), [lang.parser.nfc](lang.md#lang.parser.nfc)
      - fn [item](../../src/parser.ts#L821) (l: Line, wsLen: number, indent: number) → void <!-- internal -->
        <a id="lang.parser.Parser.item"></a><br>Opens a list item: checks its indentation, closes deeper items, lexes the line and interprets it under its parent.
        - calls [lang.parser.Parser.flushProse](lang.md#lang.parser.Parser.flushProse), [lang.parser.Line.span](lang.md#lang.parser.Line.span), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.parser.Parser.closeList](lang.md#lang.parser.Parser.closeList), [lang.parser.Parser.section](lang.md#lang.parser.Parser.section), [lang.parser.lex](lang.md#lang.parser.lex), [lang.parser.ctxOf](lang.md#lang.parser.ctxOf), [lang.parser.Parser.sectionKind](lang.md#lang.parser.Parser.sectionKind), [lang.parser.Parser.interpret](lang.md#lang.parser.Parser.interpret)
      - fn [interpret](../../src/parser.ts#L891) (n: Node, l: Line, ctx: Ctx, parent: Parent | undefined) → void <!-- internal -->
        <a id="lang.parser.Parser.interpret"></a><br>Gives a lexed item its kind and fields from its first word, or reads it as a bare item when that word is no keyword here.
        - calls [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.parser.keywordsOf](lang.md#lang.parser.keywordsOf), [lang.parser.Parser.bare](lang.md#lang.parser.Parser.bare), [lang.parser.keywordKind](lang.md#lang.parser.keywordKind), [lang.parser.Parser.decl](lang.md#lang.parser.Parser.decl), [lang.parser.Parser.refList](lang.md#lang.parser.Parser.refList), [lang.parser.isSegment](lang.md#lang.parser.isSegment), [lang.parser.nfc](lang.md#lang.parser.nfc), [lang.parser.Parser.layers](lang.md#lang.parser.Parser.layers), [lang.ir.kindLabel](lang.md#lang.ir.kindLabel), [lang.parser.Parser.plannedModifier](lang.md#lang.parser.Parser.plannedModifier), [lang.parser.Parser.typedTrigger](lang.md#lang.parser.Parser.typedTrigger), [lang.parser.Parser.oneRef](lang.md#lang.parser.Parser.oneRef), [lang.parser.isDuration](lang.md#lang.parser.isDuration), [lang.parser.spanned](lang.md#lang.parser.spanned), [lang.parser.scheduleText](lang.md#lang.parser.scheduleText), [lang.parser.renderTokens](lang.md#lang.parser.renderTokens), [lang.parser.parseLink](lang.md#lang.parser.parseLink), [lang.parser.isEventId](lang.md#lang.parser.isEventId), [lang.parser.Parser.makeRef](lang.md#lang.parser.Parser.makeRef), [lang.parser.Parser.freeText](lang.md#lang.parser.Parser.freeText), [lang.parser.isId](lang.md#lang.parser.isId), [lang.parser.Parser.migrationRow](lang.md#lang.parser.Parser.migrationRow), [lang.parser.Parser.systemName](lang.md#lang.parser.Parser.systemName)
      - fn [bare](../../src/parser.ts#L1185) (n: Node, ctx: Ctx, parent: Parent | undefined) → void <!-- internal -->
        <a id="lang.parser.Parser.bare"></a><br>Item whose first word is not a keyword of its context.
        - calls [lang.parser.placeHint](lang.md#lang.parser.placeHint), [lang.parser.Parser.sectionKind](lang.md#lang.parser.Parser.sectionKind), [lang.parser.Parser.decl](lang.md#lang.parser.Parser.decl), [lang.parser.isSegment](lang.md#lang.parser.isSegment), [lang.parser.nfc](lang.md#lang.parser.nfc), [lang.parser.Parser.oneRef](lang.md#lang.parser.Parser.oneRef), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.parser.Parser.column](lang.md#lang.parser.Parser.column), [lang.parser.Parser.message](lang.md#lang.parser.Parser.message), [lang.ir.kindLabel](lang.md#lang.ir.kindLabel), [lang.parser.keywordsOf](lang.md#lang.parser.keywordsOf)
      - fn [decl](../../src/parser.ts#L1260) (n: Node, rest: Token[], parentId: string | null, sig: boolean, hint: () => string = () => "") → void <!-- internal -->
        <a id="lang.parser.Parser.decl"></a><br>`<name>` or `[name](path#Lnn)` + optional signature. `hint` says where a keyword written as an implicit layer or module name goes.
        - calls [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.ir.kindLabel](lang.md#lang.ir.kindLabel), [lang.parser.parseLink](lang.md#lang.parser.parseLink), [lang.parser.isSegment](lang.md#lang.parser.isSegment), [lang.parser.linkTextSpan](lang.md#lang.parser.linkTextSpan), [lang.parser.nfc](lang.md#lang.parser.nfc), [lang.parser.renderTokens](lang.md#lang.parser.renderTokens)
      - fn [makeRef](../../src/parser.ts#L1311) (t: Token) → Ref | null <!-- internal -->
        <a id="lang.parser.Parser.makeRef"></a><br>A bare ID, or `[id](href)`: the link text is the ID, the target is kept and never checked.
        - calls [lang.parser.isId](lang.md#lang.parser.isId), [lang.parser.nfc](lang.md#lang.parser.nfc), [lang.parser.parseLink](lang.md#lang.parser.parseLink), [lang.parser.linkTextSpan](lang.md#lang.parser.linkTextSpan), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err)
      - fn [plannedModifier](../../src/parser.ts#L1338) (n: Node, rest: Token[]) → boolean <!-- internal -->
        <a id="lang.parser.Parser.plannedModifier"></a><br>`step planned <id>` (or `step planned <kind> <id>`) reads like a modifier, but `planned` is a declaration of its own: K005 on the word says how to write it. Without a line kind the hint assumes `fn`.
        - calls [lang.parser.isId](lang.md#lang.parser.isId), [lang.ir.kindLabel](lang.md#lang.ir.kindLabel), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err)
      - fn [typedTrigger](../../src/parser.ts#L1365) (n: Node, rest: Token[]) → boolean <!-- internal -->
        <a id="lang.parser.Parser.typedTrigger"></a><br>`trigger <kind> <id>` (ADR 0023 п. 3): the kind is kept as the label, the ID is the entry point's fn; `trigger event <id>` (п. 1) keeps `event` as the label and the ID is the event's. A first word without a dot that is no kind is K005 on it.
        - calls [lang.parser.isTriggerKind](lang.md#lang.parser.isTriggerKind), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.parser.Parser.oneRef](lang.md#lang.parser.Parser.oneRef)
      - fn [oneRef](../../src/parser.ts#L1385) (n: Node, rest: Token[]) → void <!-- internal -->
        <a id="lang.parser.Parser.oneRef"></a><br>Reads exactly one reference from the arguments; none or several are K005.
        - calls [lang.parser.Parser.makeRef](lang.md#lang.parser.Parser.makeRef), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err)
      - fn [refList](../../src/parser.ts#L1398) (n: Node, rest: Token[], min: number) → void <!-- internal -->
        <a id="lang.parser.Parser.refList"></a><br>Reads a comma- or space-separated list of references, at least `min` of them.
        - calls [lang.parser.Parser.makeRef](lang.md#lang.parser.Parser.makeRef), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.ir.kindLabel](lang.md#lang.ir.kindLabel)
      - fn [layers](../../src/parser.ts#L1415) (n: Node, rest: Token[]) → void <!-- internal -->
        <a id="lang.parser.Parser.layers"></a><br>`layers a < b < c`
        - calls [lang.parser.Parser.makeRef](lang.md#lang.parser.Parser.makeRef), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err)
      - fn [systemName](../../src/parser.ts#L1434) (n: Node, l: Line, rest: Token[], withText: boolean) → void <!-- internal -->
        <a id="lang.parser.Parser.systemName"></a><br>`<kind|zone|table|sequence> <name> [text…]`: a name local to the system; `text` (a technology, a label) only where `withText`.
        - calls [lang.parser.isSegment](lang.md#lang.parser.isSegment), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.ir.kindLabel](lang.md#lang.ir.kindLabel), [lang.parser.nfc](lang.md#lang.parser.nfc), [lang.parser.Parser.freeText](lang.md#lang.parser.Parser.freeText)
      - fn [column](../../src/parser.ts#L1452) (n: Node, tokens: Token[], hint: () => string) → void <!-- internal -->
        <a id="lang.parser.Parser.column"></a><br>`<name> <type> [pk] [unique] [null] [fk <table>.<column>]` under `table`.
        - calls [lang.parser.isSegment](lang.md#lang.parser.isSegment), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.parser.nfc](lang.md#lang.parser.nfc), [lang.parser.spanned](lang.md#lang.parser.spanned), [lang.parser.isId](lang.md#lang.parser.isId)
      - fn [message](../../src/parser.ts#L1487) (n: Node, tokens: Token[], hint: () => string) → void <!-- internal -->
        <a id="lang.parser.Parser.message"></a><br>`<from> → <to> [text…]` under `sequence`; `->` is `→`, `-->` is `⇢`.
        - calls [lang.parser.isSegment](lang.md#lang.parser.isSegment), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.parser.nfc](lang.md#lang.parser.nfc), [lang.parser.renderTokens](lang.md#lang.parser.renderTokens)
      - fn [migrationRow](../../src/parser.ts#L1513) (n: Node, l: Line, rest: Token[]) → void <!-- internal -->
        <a id="lang.parser.Parser.migrationRow"></a><br>`map <old> → [planned] <new>`: `id` is the old stack's ID, `text` the row as written, `label` `planned` when the new ID is an intention. The new ID is a reference of this repository (K001 unless the code has it or a `planned` declares it); the old ID lives in another repository…
        - calls [lang.parser.isId](lang.md#lang.parser.isId), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.parser.nfc](lang.md#lang.parser.nfc), [lang.parser.spanned](lang.md#lang.parser.spanned), [lang.parser.Parser.freeText](lang.md#lang.parser.Parser.freeText)
      - fn [freeText](../../src/parser.ts#L1534) (n: Node, l: Line, rest: Token[]) → void <!-- internal -->
        <a id="lang.parser.Parser.freeText"></a><br>Sets the node's text to the arguments as canonical words; no arguments is K005.
        - calls [lang.parser.renderTokens](lang.md#lang.parser.renderTokens), [lang.parser.Line.span](lang.md#lang.parser.Line.span), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.ir.kindLabel](lang.md#lang.ir.kindLabel)
    - fn [spanned](../../src/parser.ts#L1550) (t: Token) → Spanned<string> <!-- internal -->
      <a id="lang.parser.spanned"></a><br>A token as a spanned string.
    - type [Lead](../../src/parser.ts#L1555) <!-- internal -->
      <a id="lang.parser.Lead"></a><br>The leading whitespace of a line, measured two ways: keylang's indent and CommonMark's columns.
    - fn [leadingWhitespace](../../src/parser.ts#L1565) (text: string) → Lead <!-- internal -->
      <a id="lang.parser.leadingWhitespace"></a><br>Measures a line's leading spaces and tabs.
    - type [FenceOpen](../../src/parser.ts#L1584) <!-- internal -->
      <a id="lang.parser.FenceOpen"></a><br>A fence opener: its character, its length, its indent in columns and in spaces.
    - fn [openFence](../../src/parser.ts#L1593) (text: string) → FenceOpen | null <!-- internal -->
      <a id="lang.parser.openFence"></a><br>A fence opener, ignoring the indent-of-4 rule. An info string with a backtick is not an opener.
      - calls [lang.parser.leadingWhitespace](lang.md#lang.parser.leadingWhitespace)
    - fn [opensFence](../../src/parser.ts#L1616) (text: string, listOpen: boolean) → boolean <!-- internal -->
      <a id="lang.parser.opensFence"></a><br>CommonMark fence: indent under 4 spaces, or any indent while a list is open (Р9). A backtick info string that itself contains a backtick is prose.
      - calls [lang.parser.openFence](lang.md#lang.parser.openFence)
    - fn [closesFence](../../src/parser.ts#L1623) (text: string, open: { char: string; len: number; columns: number }) → boolean <!-- internal -->
      <a id="lang.parser.closesFence"></a><br>Whether a line closes an open fence: the same character, at least as many, nothing but whitespace after.
      - calls [lang.parser.leadingWhitespace](lang.md#lang.parser.leadingWhitespace)
    - fn [dedentFenceLines](../../src/parser.ts#L1645) (lines: string[]) → string[]
      <a id="lang.parser.dedentFenceLines"></a><br>Drop the indent `fmt` owes a fence that was written under a list item. The opener and the closer lose all of their indent; each body line loses as many spaces as the opener had, and never more than it has.
      - calls [lang.parser.openFence](lang.md#lang.parser.openFence), [lang.parser.closesFence](lang.md#lang.parser.closesFence)
    - fn [htmlBlockStart](../../src/parser.ts#L1671) (rest: string) → { end: (line: string) => boolean } | null <!-- internal -->
      <a id="lang.parser.htmlBlockStart"></a><br>Start of a CommonMark HTML block of types 1–5, or null. The end test reads the whole line.
    - fn [headingEnd](../../src/parser.ts#L1695) (text: string) → number <!-- internal -->
      <a id="lang.parser.headingEnd"></a><br>Where the words of a `#` heading line end: before an optional closing sequence of `#` that follows a space or a tab and has only spaces or tabs after it (CommonMark). `# flow a #` has the words `flow a`; in `# flow a#` the `#` is part of a word.
    - fn [isBullet](../../src/parser.ts#L1705) (rest: string) → boolean <!-- internal -->
      <a id="lang.parser.isBullet"></a><br>Whether the text after the indent starts a list item: `-`, `*` or `+` followed by a space or the end of the line.
    - fn [nfc](../../src/parser.ts#L1716) (text: string) → string <!-- internal -->
      <a id="lang.parser.nfc"></a><br>An ID in Unicode normal form C: a composed `café` and a decomposed one are one ID. Tokens and spans keep the text as written, so `fmt` changes nothing.
    - fn [isSegment](../../src/parser.ts#L1721) (s: string) → boolean
      <a id="lang.parser.isSegment"></a><br>A single ID segment: letter or `_`, then letters (with their combining marks), digits, `_`, `-`.
    - fn [isId](../../src/parser.ts#L1727) (s: string) → boolean
      <a id="lang.parser.isId"></a><br>A dotted ID: `segment(.segment)*`.
      - calls [lang.parser.isSegment](lang.md#lang.parser.isSegment)
    - fn [linkTextSpan](../../src/parser.ts#L1732) (t: Token) → Span
      <a id="lang.parser.linkTextSpan"></a><br>The span of the text inside `[…]`, the same span a link reference uses.
      - calls [lang.parser.parseLink](lang.md#lang.parser.parseLink), [lang.parser.codePoints](lang.md#lang.parser.codePoints)
    - fn [parseLink](../../src/parser.ts#L1744) (t: Token) → Link <!-- internal -->
      <a id="lang.parser.parseLink"></a><br>The parts of a link token `[text](target)`: the text, the decoded path, the target as written (decoded path plus fragment), and the line of a `#L12` or `#L12-L20` fragment.
      - calls [lang.parser.decodeLinkPath](lang.md#lang.parser.decodeLinkPath)
    - fn [decodeLinkPath](../../src/parser.ts#L1767) (path: string) → string <!-- internal -->
      <a id="lang.parser.decodeLinkPath"></a><br>Percent-decoding for map links. A broken escape is kept as written so the diagnostic still points at the source.
    - type [LexedLine](../../src/parser.ts#L1775) = { tokens: Token[]; comment: Spanned<string> | null } <!-- internal -->
      <a id="lang.parser.LexedLine"></a>
    - fn [lex](../../src/parser.ts#L1783) (l: Line, start: number, errs: [Span, string][]) → LexedLine <!-- internal -->
      <a id="lang.parser.lex"></a><br>Split an item head into tokens. Words end at whitespace or `,`; `[text](target)` and `"quoted"` are single tokens (a `[` that opens no link is an ordinary word); `<!-- … -->` ends the head and is returned separately.
      - calls [lang.parser.Line.span](lang.md#lang.parser.Line.span), [lang.parser.linkEnd](lang.md#lang.parser.linkEnd)
    - fn [linkEnd](../../src/parser.ts#L1862) (s: string, i: number) → number | null <!-- internal -->
      <a id="lang.parser.linkEnd"></a><br>The end of `[text](destination)` opened at `i`, or null. As in CommonMark, the destination has no whitespace and holds parentheses only in balanced pairs or escaped (`\(`), so `(https://e.com/Foo_(bar))` ends at the last `)`.
    - fn [renderMeaning](../../src/parser.ts#L1892) (node: Node) → string
      <a id="lang.parser.renderMeaning"></a><br>What an item's head says, for comparing meaning (a verdict's `specHash`, a rule already written): canonical tokens, with a reference written as a link `[id](href)` counted as its ID, so linking a reference changes nothing.
      - calls [lang.parser.renderTokens](lang.md#lang.parser.renderTokens)
    - fn [renderTokens](../../src/parser.ts#L1901) (tokens: readonly Token[]) → string
      <a id="lang.parser.renderTokens"></a><br>Canonical rendering of head tokens: single spaces, `a, b` for commas.
  - module [spec-ir](../../src/spec-ir.ts#L1)
    <a id="lang.spec-ir"></a><br>SpecIR: typed assertions compiled from the text IR. `compileSpec` checks assertion form (a layer order, a wiring condition). Checks that need the snapshot still run later.
    - config [base.config](base.md#base.config)
    - diag [base.diag](base.md#base.diag)
    - ir [lang.ir](lang.md#lang.ir)
    - parser [lang.parser](lang.md#lang.parser)
    - span [base.span](base.md#base.span)
    - fn [syntheticLayer](../../src/spec-ir.ts#L19) (name: string) → boolean
      <a id="lang.spec-ir.syntheticLayer"></a><br>Configured names that are layers even when `keylang.json` does not list them. Assertion checks use this later; compilation does not reject them.
    - type [NonEmpty](../../src/spec-ir.ts#L24) = readonly [T, ...T[]]
      <a id="lang.spec-ir.NonEmpty"></a><br>A read-only list with at least one element.
    - type [Located](../../src/spec-ir.ts#L26) <!-- internal -->
      <a id="lang.spec-ir.Located"></a><br>Shared shape for every spec-IR element that must point back to its origin: the source file path, a `Span`, the canonical text whose hash becomes the specHash, and a read-only reference to the parsed `Node`. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [LayerOrder](../../src/spec-ir.ts#L35) extends Located
      <a id="lang.spec-ir.LayerOrder"></a><br>`layers a < b < c`: an accepted layer order.
    - type [RejectedLayers](../../src/spec-ir.ts#L44)
      <a id="lang.spec-ir.RejectedLayers"></a><br>A `layers` line that is not an order. It is not an assertion; its text still enters the no-snapshot hash when it names an order.
    - type [DependencyRule](../../src/spec-ir.ts#L54) extends Located
      <a id="lang.spec-ir.DependencyRule"></a><br>`allow`/`deny <from> -> <to>[, <to>…]`: a dependency rule between areas.
    - type [Entry](../../src/spec-ir.ts#L64) extends Located
      <a id="lang.spec-ir.Entry"></a><br>`entry <id>[, <id>…]`: the declared entry points.
    - type [NoCycles](../../src/spec-ir.ts#L70) extends Located
      <a id="lang.spec-ir.NoCycles"></a><br>`no-cycles <area>` (or `*`): no import cycle inside the area.
    - type [ExportsRule](../../src/spec-ir.ts#L77) extends Located
      <a id="lang.spec-ir.ExportsRule"></a><br>`exports <name>…` under `module x`: the module's public names.
    - type [RuleAssertion](../../src/spec-ir.ts#L84) = LayerOrder | DependencyRule | Entry | NoCycles | ExportsRule
      <a id="lang.spec-ir.RuleAssertion"></a><br>Every assertion a rules or map section can make.
    - type [SpecModule](../../src/spec-ir.ts#L87)
      <a id="lang.spec-ir.SpecModule"></a><br>A `module x` line. It scopes nested rules and is not itself an assertion, so nothing hashes it.
    - type [FlowStep](../../src/spec-ir.ts#L95) extends Located
      <a id="lang.spec-ir.FlowStep"></a><br>A step of a flow: the fn that runs, with nested items about it.
    - type [Trigger](../../src/spec-ir.ts#L102) extends Located
      <a id="lang.spec-ir.Trigger"></a><br>`trigger [<kind>|event] <id>`: where a flow starts.
    - type [ParallelItem](../../src/spec-ir.ts#L113) extends Located
      <a id="lang.spec-ir.ParallelItem"></a><br>`parallel`: every nested step must run, in any order; siblings are ordered against the whole group (ADR 0023 п. 2).
    - type [ContinuesItem](../../src/spec-ir.ts#L120) extends Located
      <a id="lang.spec-ir.ContinuesItem"></a><br>`continues <flow>` at the top of a flow: it continues another flow in a later request (ADR 0023 п. 4).
    - type [TimerItem](../../src/spec-ir.ts#L129) extends Located
      <a id="lang.spec-ir.TimerItem"></a><br>`after <duration>` / `every <schedule>`: a timer only a nested `test` checks; `every` also against a cron entry point (ADR 0023 п. 5).
    - type [WhenItem](../../src/spec-ir.ts#L137) extends Located
      <a id="lang.spec-ir.WhenItem"></a><br>`when <condition>`: a branch of a flow, in prose.
    - type [ThenItem](../../src/spec-ir.ts#L144)
      <a id="lang.spec-ir.ThenItem"></a><br>`then <id>` (a reference) or `then <text>` (prose): an outcome of a flow.
    - type [ClaimItem](../../src/spec-ir.ts#L147) extends Located
      <a id="lang.spec-ir.ClaimItem"></a><br>`invariant`, `reads` or `emits`: a claim about the step it stands under.
    - type [CallsItem](../../src/spec-ir.ts#L157) extends Located
      <a id="lang.spec-ir.CallsItem"></a><br>`calls <id>[, <id>…]` under a step or trigger: the parent fn calls each target directly.
    - type [QuestionItem](../../src/spec-ir.ts#L164) extends Located
      <a id="lang.spec-ir.QuestionItem"></a><br>`? <text>`: an open question of a flow. No claim: `check` judges nothing in it; a feature with one is not done.
    - type [TestItem](../../src/spec-ir.ts#L172) extends Located
      <a id="lang.spec-ir.TestItem"></a><br>`test <file> ["<name>"]`: the test that is evidence for the item above it.
    - type [FlowItem](../../src/spec-ir.ts#L180)
      <a id="lang.spec-ir.FlowItem"></a><br>Every item that may appear inside a flow.
    - type [Flow](../../src/spec-ir.ts#L183)
      <a id="lang.spec-ir.Flow"></a><br>One `# flow <name>` section, compiled.
    - type [Planned](../../src/spec-ir.ts#L196) extends Located
      <a id="lang.spec-ir.Planned"></a><br>`planned fn|module|type|event <id>`: an intention, declared before its code exists.
    - type [WireWhen](../../src/spec-ir.ts#L204) extends Located
      <a id="lang.spec-ir.WireWhen"></a><br>A `when` whose condition is `env.NAME = value` and whose target resolved.
    - type [WireCompose](../../src/spec-ir.ts#L211) extends Located
      <a id="lang.spec-ir.WireCompose"></a><br>`compose <id>` under a wiring dependency: a decorator wrapped around it.
    - type [WireDep](../../src/spec-ir.ts#L216) extends Located
      <a id="lang.spec-ir.WireDep"></a><br>One dependency of a wired target: its implementation, conditional overrides and decorators.
    - type [Wire](../../src/spec-ir.ts#L224) extends Located
      <a id="lang.spec-ir.Wire"></a><br>One target of a `# wiring` section with its dependencies.
    - type [SpecIR](../../src/spec-ir.ts#L230)
      <a id="lang.spec-ir.SpecIR"></a><br>Everything the specs assert, compiled from all documents.
    - fn [walkFlow](../../src/spec-ir.ts#L244) (flow: Flow, visit: (item: Trigger | FlowItem) => void) → void
      <a id="lang.spec-ir.walkFlow"></a><br>Triggers and top-level items, then nested items, in source order.
    - type [LayerCandidate](../../src/spec-ir.ts#L261) <!-- internal -->
      <a id="lang.spec-ir.LayerCandidate"></a><br>A `layers` line before the orders of all documents are settled against each other.
    - type [PlacedRule](../../src/spec-ir.ts#L273) <!-- internal -->
      <a id="lang.spec-ir.PlacedRule"></a><br>A rule with its encounter number, so rules keep source order after layer orders are settled apart.
    - type [CompiledSpec](../../src/spec-ir.ts#L278) = { spec: SpecIR; diagnostics: Diagnostic[] } <!-- internal -->
      <a id="lang.spec-ir.CompiledSpec"></a>
    - fn [compileSpec](../../src/spec-ir.ts#L281) (docs: readonly Document[]) → CompiledSpec
      <a id="lang.spec-ir.compileSpec"></a><br>Compiles every document's rules, map, flow and wiring sections; form errors become diagnostics.
      - calls [lang.spec-ir.compileRules](lang.md#lang.spec-ir.compileRules), [lang.spec-ir.compileFlow](lang.md#lang.spec-ir.compileFlow), [lang.spec-ir.compileWires](lang.md#lang.spec-ir.compileWires), [lang.spec-ir.settleLayers](lang.md#lang.spec-ir.settleLayers)
    - fn [compileRules](../../src/spec-ir.ts#L313) ( file: string, generated: boolean, section: Section, placed: PlacedRule[], candidates: LayerCandidate[], modules: SpecModule[], diagnostics: Diagnostic[], nextSeq: () => number, ) → void <!-- internal -->
      <a id="lang.spec-ir.compileRules"></a><br>One rules or map section: rule lines become placed assertions, `layers` lines candidates, `module` lines scopes.
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.spec-ir.considerLayers](lang.md#lang.spec-ir.considerLayers), [lang.spec-ir.dependency](lang.md#lang.spec-ir.dependency), [lang.spec-ir.entryLine](lang.md#lang.spec-ir.entryLine), [lang.spec-ir.noCycles](lang.md#lang.spec-ir.noCycles), [lang.spec-ir.exportsRule](lang.md#lang.spec-ir.exportsRule)
    - fn [considerLayers](../../src/spec-ir.ts#L360) (file: string, node: Node, diagnostics: Diagnostic[]) → Omit<LayerCandidate, "seq"> | null <!-- internal -->
      <a id="lang.spec-ir.considerLayers"></a><br>A `layers` line the old text IR would have kept, with K005 for a non-layer or a repeated layer. An empty line is absent.
      - calls [base.diag.diagnostic](base.md#base.diag.diagnostic)
    - type [SettledLayers](../../src/spec-ir.ts#L388) = { orders: PlacedRule[]; rejectedLayers: RejectedLayers[] } <!-- internal -->
      <a id="lang.spec-ir.SettledLayers"></a>
    - fn [settleLayers](../../src/spec-ir.ts#L395) (candidates: readonly LayerCandidate[], diagnostics: Diagnostic[]) → SettledLayers <!-- internal -->
      <a id="lang.spec-ir.settleLayers"></a><br>One partial order across every document, in encounter order. A line that contradicts an earlier order is K005 and not an order.
      - calls [base.diag.diagnostic](base.md#base.diag.diagnostic), [lang.spec-ir.layersAbove](lang.md#lang.spec-ir.layersAbove), [lang.spec-ir.at](lang.md#lang.spec-ir.at)
    - fn [layersAbove](../../src/spec-ir.ts#L465) (direct: ReadonlyMap<string, ReadonlySet<string>>) → Map<string, Set<string>> <!-- internal -->
      <a id="lang.spec-ir.layersAbove"></a><br>Transitive closure of `direct`: every layer above each layer, by depth-first search from it.
    - fn [dependency](../../src/spec-ir.ts#L487) (file: string, node: Node, effect: "allow" | "deny", generated: boolean) → DependencyRule | null <!-- internal -->
      <a id="lang.spec-ir.dependency"></a><br>An `allow`/`deny` line: the first reference is the source area, the rest the targets; null without both.
      - calls [lang.spec-ir.nonEmpty](lang.md#lang.spec-ir.nonEmpty), [lang.spec-ir.at](lang.md#lang.spec-ir.at)
    - fn [nonEmpty](../../src/spec-ir.ts#L497) (refs: readonly Ref[]) → NonEmpty<Ref> | null <!-- internal -->
      <a id="lang.spec-ir.nonEmpty"></a><br>`refs` as a `NonEmpty`, or null when there are none.
    - fn [entryLine](../../src/spec-ir.ts#L504) (file: string, node: Node) → Entry | null <!-- internal -->
      <a id="lang.spec-ir.entryLine"></a><br>An `entry` line: its entry points are the references of its nested items.
      - calls [lang.spec-ir.at](lang.md#lang.spec-ir.at)
    - fn [noCycles](../../src/spec-ir.ts#L514) (file: string, node: Node, under: Ref | null) → NoCycles <!-- internal -->
      <a id="lang.spec-ir.noCycles"></a><br>A `no-cycles` assertion; `under` is the enclosing `module`, or null for the whole repository.
      - calls [lang.spec-ir.at](lang.md#lang.spec-ir.at)
    - fn [exportsRule](../../src/spec-ir.ts#L518) (file: string, node: Node, module: Ref) → ExportsRule | null <!-- internal -->
      <a id="lang.spec-ir.exportsRule"></a><br>Builds an `exports` rule record from a parsed line's refs, bailing out with null when there are none; it sorts the ref texts into a readable label and attaches location via [`lang.spec-ir.at`](lang.md#lang.spec-ir.at). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [lang.spec-ir.at](lang.md#lang.spec-ir.at)
    - fn [compileFlow](../../src/spec-ir.ts#L529) (file: string, section: Section, planned: Planned[], diagnostics: Diagnostic[]) → Flow <!-- internal -->
      <a id="lang.spec-ir.compileFlow"></a><br>One `# flow` section: triggers, items, its `kind`, and `planned` lines collected into `planned`.
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.spec-ir.plannedDecl](lang.md#lang.spec-ir.plannedDecl), [lang.spec-ir.triggerItem](lang.md#lang.spec-ir.triggerItem), [lang.spec-ir.flowItems](lang.md#lang.spec-ir.flowItems), [lang.spec-ir.flowNode](lang.md#lang.spec-ir.flowNode), [lang.spec-ir.emptyParallel](lang.md#lang.spec-ir.emptyParallel)
    - fn [emptyParallel](../../src/spec-ir.ts#L581) (file: string, node: Node, diagnostics: Diagnostic[]) → void <!-- internal -->
      <a id="lang.spec-ir.emptyParallel"></a><br>K009: a `parallel` with no nested `step`, at any depth.
      - calls [base.diag.diagnostic](base.md#base.diag.diagnostic)
    - fn [flowNode](../../src/spec-ir.ts#L594) (file: string, flow: string, node: Node) → FlowItem[] <!-- internal -->
      <a id="lang.spec-ir.flowNode"></a><br>One flow item and its children. An item missing what it needs (a step without a target, a `when` without a condition…) is dropped but its children are kept in its place, so one bad line does not hide the claims under it.
      - calls [lang.spec-ir.flowItems](lang.md#lang.spec-ir.flowItems), [lang.spec-ir.flowAt](lang.md#lang.spec-ir.flowAt), [lang.parser.scheduleText](lang.md#lang.parser.scheduleText)
    - fn [flowItems](../../src/spec-ir.ts#L685) (file: string, flow: string, nodes: readonly Node[]) → FlowItem[] <!-- internal -->
      <a id="lang.spec-ir.flowItems"></a><br>The compiled items of a list of nodes, flattened.
      - calls [lang.spec-ir.flowNode](lang.md#lang.spec-ir.flowNode)
    - fn [triggerItem](../../src/spec-ir.ts#L690) (file: string, flow: string, node: Node) → Trigger | null <!-- internal -->
      <a id="lang.spec-ir.triggerItem"></a><br>A `trigger` line; its label is an entry-point kind (`trigger http x`) or `event`. Null without a target.
      - calls [lang.parser.isTriggerKind](lang.md#lang.parser.isTriggerKind), [lang.spec-ir.flowItems](lang.md#lang.spec-ir.flowItems), [lang.spec-ir.flowAt](lang.md#lang.spec-ir.flowAt)
    - fn [plannedDeclKind](../../src/spec-ir.ts#L702) (value: string) → Planned["decl"] | null <!-- internal -->
      <a id="lang.spec-ir.plannedDeclKind"></a><br>The `planned` label as a declaration kind, or null for any other word.
    - fn [plannedDecl](../../src/spec-ir.ts#L709) (file: string, node: Node) → Planned | null <!-- internal -->
      <a id="lang.spec-ir.plannedDecl"></a><br>A `planned` line with a known kind and an ID, or null.
      - calls [lang.spec-ir.plannedDeclKind](lang.md#lang.spec-ir.plannedDeclKind), [lang.spec-ir.at](lang.md#lang.spec-ir.at), [lang.parser.renderMeaning](lang.md#lang.parser.renderMeaning)
    - fn [compileWires](../../src/spec-ir.ts#L718) (file: string, section: Section, wires: Wire[], diagnostics: Diagnostic[]) → void <!-- internal -->
      <a id="lang.spec-ir.compileWires"></a><br>A `# wiring` section: wire targets → named dependencies → `compose` and `when` options; incomplete lines are skipped.
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.spec-ir.at](lang.md#lang.spec-ir.at), [lang.parser.renderMeaning](lang.md#lang.parser.renderMeaning), [lang.spec-ir.wireWhen](lang.md#lang.spec-ir.wireWhen)
    - fn [wireWhen](../../src/spec-ir.ts#L752) (file: string, option: Node, diagnostics: Diagnostic[]) → WireWhen | null <!-- internal -->
      <a id="lang.spec-ir.wireWhen"></a><br>`env.NAME = value` with a target. A condition of another shape is K005 and is not stored.
      - calls [lang.spec-ir.wireConditionText](lang.md#lang.spec-ir.wireConditionText), [base.diag.diagnostic](base.md#base.diag.diagnostic), [lang.spec-ir.at](lang.md#lang.spec-ir.at), [lang.parser.renderMeaning](lang.md#lang.parser.renderMeaning)
    - fn [wireConditionText](../../src/spec-ir.ts#L775) (node: Node) → string <!-- internal -->
      <a id="lang.spec-ir.wireConditionText"></a><br>Condition text of `- when <condition> → <id>`, matching the bytes the wiring check compares: tokens between the keyword and the arrow, joined only where they do not already touch. `env.DB = a,b` stays `a,b`.
    - fn [at](../../src/spec-ir.ts#L792) (file: string, node: Node, text: string) → Located <!-- internal -->
      <a id="lang.spec-ir.at"></a><br>The location fields of an assertion with its canonical text.
    - fn [flowAt](../../src/spec-ir.ts#L797) (file: string, flow: string, node: Node) → Located <!-- internal -->
      <a id="lang.spec-ir.flowAt"></a><br>The location of a flow item: its text is prefixed by the flow name and kind, NUL-separated, so equal lines of two flows hash apart.
      - calls [lang.spec-ir.at](lang.md#lang.spec-ir.at), [lang.parser.renderMeaning](lang.md#lang.parser.renderMeaning)
    - type [PlannedDeclaration](../../src/spec-ir.ts#L804)
      <a id="lang.spec-ir.PlannedDeclaration"></a><br>A `planned` line as hover, explain and spec-to-code read it: its declared kind (`fn` without one), contract and place.
    - fn [plannedDeclaration](../../src/spec-ir.ts#L818) (docs: readonly Document[], id: string) → PlannedDeclaration | null
      <a id="lang.spec-ir.plannedDeclaration"></a><br>The first `planned` item that declares `id`, in document order and at any depth of any section, whatever its label: `SpecIR.planned` keeps only the valid ones of flows.
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes)
    - fn [flowsUsing](../../src/spec-ir.ts#L846) (spec: SpecIR, id: string) → string[]
      <a id="lang.spec-ir.flowsUsing"></a><br>The names of the flows whose steps or trigger name `id`, sorted.
      - calls [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow)
