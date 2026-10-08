<!-- keylang:generated — не редагувати, `keylang map` -->

[README](README.md) · modules: [files](#lang.files) · [fmt](#lang.fmt) · [ir](#lang.ir) · [parse-format](#lang.parse-format) · [parser](#lang.parser) · [spec-ir](#lang.spec-ir)

# map

- lang
  <a id="lang"></a><br>Turns keylang Markdown into an IR ([`lang.parser`](lang.md#lang.parser), [`lang.ir`](lang.md#lang.ir)), compiles typed assertions ([`lang.spec-ir`](lang.md#lang.spec-ir)), and renders canonical or parse output ([`lang.fmt`](lang.md#lang.fmt), [`lang.parse-format`](lang.md#lang.parse-format)); it must not depend on `map`, `extract`, or web-tree-sitter. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
  - module [files](../../src/files.ts#L1)
    <a id="lang.files"></a><br>File discovery and loading.
    - node [external.node](external.md#external.node)
    - ir [lang.ir](lang.md#lang.ir)
    - parser [lang.parser](lang.md#lang.parser)
    - fn [collectMdFiles](../../src/files.ts#L16) (paths: readonly string[], base?: string) → string[]
      <a id="lang.files.collectMdFiles"></a><br>Expand files and directories into a sorted list of `*.md` files. Hidden directories, `node_modules` and `target` are skipped.
      - calls [lang.files.walkDir](lang.md#lang.files.walkDir), [lang.files.realPath](lang.md#lang.files.realPath)
    - fn [skippedDirectory](../../src/files.ts#L43) (name: string) → boolean
      <a id="lang.files.skippedDirectory"></a><br>A directory the walk over a spec directory does not enter: hidden, `node_modules`, `target`.
    - fn [walkReaches](../../src/files.ts#L48) (dir: string, abs: string) → boolean
      <a id="lang.files.walkReaches"></a><br>Whether the walk from `dir` (or `dir` itself, a file) reaches `abs`: inside it, and through no skipped directory below it.
      - calls [lang.files.skippedDirectory](lang.md#lang.files.skippedDirectory)
    - fn [walkDir](../../src/files.ts#L55) (dir: string, out: string[], walked: Set<string>, at: (p: string) => string) → void <!-- internal -->
      <a id="lang.files.walkDir"></a><br>Recursively scans a directory in sorted order, appending `.md` file paths to the output while skipping dot-directories, `target`, and `node_modules`. It records each visited real path via [`lang.files.realPath`](lang.md#lang.files.realPath) so symlink cycles back to an ancestor stop instead of looping… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [lang.files.realPath](lang.md#lang.files.realPath), [lang.files.entryType](lang.md#lang.files.entryType), [lang.files.skippedDirectory](lang.md#lang.files.skippedDirectory)
    - fn [entryType](../../src/files.ts#L73) (e: Dirent, path: string) → "dir" | "file" | null <!-- internal -->
      <a id="lang.files.entryType"></a><br>What a directory entry is, through a link; a dangling link is neither.
    - fn [realPath](../../src/files.ts#L83) (path: string) → string <!-- internal -->
      <a id="lang.files.realPath"></a><br>Resolves a filesystem path to its canonical form with symlinks followed, falling back to a plain absolute resolution when the path does not exist. Used by [`lang.files.walkDir`](lang.md#lang.files.walkDir) and [`lang.files.collectMdFiles`](lang.md#lang.files.collectMdFiles) to dedupe directories and files. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [load](../../src/files.ts#L92) (files: readonly string[]) → Document[]
      <a id="lang.files.load"></a><br>Read and parse files.
      - calls [lang.parser.parse](lang.md#lang.parser.parse)
    - fn [readTextOrNull](../../src/files.ts#L97) (path: string) → string | null
      <a id="lang.files.readTextOrNull"></a><br>A file's text, or null when it cannot be read for any reason: missing, a directory, no permission.
    - fn [existingText](../../src/files.ts#L106) (path: string) → string | null
      <a id="lang.files.existingText"></a><br>A file's text, or null when there is no file; a directory or an unreadable file throws, so the caller names it.
  - module [fmt](../../src/fmt.ts#L1)
    <a id="lang.fmt"></a><br>Canonical formatting (`keylang fmt`). Rendered from the IR, so the output is idempotent by construction: `format(parse(format(x))) == format(x)`.
    - diag [base.diag](base.md#base.diag)
    - ir [lang.ir](lang.md#lang.ir)
    - parser [lang.parser](lang.md#lang.parser)
    - fn [formatSource](../../src/fmt.ts#L12) (path: string, src: string) → { ok: true; text: string } | { ok: false; diagnostics: Diagnostic[] }
      <a id="lang.fmt.formatSource"></a><br>Format source text. Returns the structural (K003) diagnostics instead when the tree shape is ambiguous — formatting would silently re-nest items.
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [lang.fmt.formatDocument](lang.md#lang.fmt.formatDocument)
    - fn [formatDocument](../../src/fmt.ts#L18) (doc: Document) → string
      <a id="lang.fmt.formatDocument"></a><br>Serializes a parsed document back to text: emits the generated block, each section's `#` heading with optional comment, node items rendered as an indented list via [`lang.fmt.renderNode`](lang.md#lang.fmt.renderNode), and code/raw blocks (fences dedented through [`lang.parser.dedentFenceLines`](lang.md#lang.parser.dedentFenceLines)). Blocks are… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [lang.fmt.renderNode](lang.md#lang.fmt.renderNode), [lang.parser.dedentFenceLines](lang.md#lang.parser.dedentFenceLines)
    - fn [renderNode](../../src/fmt.ts#L41) (out: string, n: Node, depth: number) → string <!-- internal -->
      <a id="lang.fmt.renderNode"></a><br>Appends one node to the output as an indented bullet line of its tokens via [`lang.parser.renderTokens`](lang.md#lang.parser.renderTokens), with any trailing comment and description lines beneath it. Then recurses into each child one level deeper and returns the accumulated string. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [lang.parser.renderTokens](lang.md#lang.parser.renderTokens)
  - module [ir](../../src/ir.ts#L1)
    <a id="lang.ir"></a><br>Intermediate representation of keylang Markdown files.
    - diag [base.diag](base.md#base.diag)
    - span [base.span](base.md#base.span)
    - type [Document](../../src/ir.ts#L10)
      <a id="lang.ir.Document"></a><br>Parsed form of one keylang file: its path, the generator marker if the file is a generated map, its ordered sections, and the parse-time diagnostics (K003–K006) collected while reading it. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [SectionKind](../../src/ir.ts#L19) = "map" | "rules" | "flow" | "wiring"
      <a id="lang.ir.SectionKind"></a><br>Defines a closed set of four string literals that tag which section of an architecture description a piece of IR belongs to. Used as a discriminant so consumers can branch on section type without accepting arbitrary strings. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Section](../../src/ir.ts#L22)
      <a id="lang.ir.Section"></a><br>Content under one `# …` heading (or before the first heading).
    - type [Item](../../src/ir.ts#L33)
      <a id="lang.ir.Item"></a><br>A discriminated union over the three kinds of entries in a parsed architecture document: a structured node (a `Node` tagged `"node"`), a verbatim Markdown prose paragraph, or a verbatim fenced code block. Prose and code variants keep raw lines so the document can be re-emitted… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [NodeKind](../../src/ir.ts#L40)
      <a id="lang.ir.NodeKind"></a><br>Union of string tags classifying every IR item across map, rules, flows and wiring sections, from layers, modules and deps to flow steps, open questions and planned items, plus an `unknown` tag for uninterpretable items. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
    - fn [isDecl](../../src/ir.ts#L91) (kind: NodeKind) → boolean
      <a id="lang.ir.isDecl"></a><br>Kinds that declare an ID in the global namespace.
    - fn [kindLabel](../../src/ir.ts#L103) (kind: NodeKind) → string
      <a id="lang.ir.kindLabel"></a><br>The keyword as written in the language (`rule-module` is spelled `module`).
    - type [Node](../../src/ir.ts#L108)
      <a id="lang.ir.Node"></a><br>One list item `- <kind>? <name> <args…>` and everything nested under it.
    - type [Link](../../src/ir.ts#L135)
      <a id="lang.ir.Link"></a><br>Represents a parsed markdown link: the display text, the raw target inside the parentheses, the target path stripped of its `#` fragment, an optional line number parsed from a `#Lnn` fragment, and the source location. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Ref](../../src/ir.ts#L146)
      <a id="lang.ir.Ref"></a><br>Describes a single reference to an ID in a description: the written text, the absolute ID it resolves to, the source `Span` of the ID, and an optional `Link` when it was written as a Markdown link whose href is kept but never checked. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [TokenKind](../../src/ir.ts#L160) = "word" | "link" | "quoted" | "comma"
      <a id="lang.ir.TokenKind"></a><br>A string-literal union naming the four categories a lexed token can fall into: a bare word, a link, a quoted string, or a comma separator. It types the kind field of tokens in the `lang` IR for downstream parsing. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Token](../../src/ir.ts#L162)
      <a id="lang.ir.Token"></a><br>Describes a single lexical unit in the intermediate representation: a `TokenKind` category tag, the raw source text it covers, and the `Span` locating it in the file. It is a pure data shape used by the lang layer to pass tokens between stages. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [walk](../../src/ir.ts#L169) (node: Node, f: (n: Node) => void) → void
      <a id="lang.ir.walk"></a><br>Pre-order walk over a node and its descendants.
    - fn [sectionNodes](../../src/ir.ts#L174) (section: Section) → Node[]
      <a id="lang.ir.sectionNodes"></a><br>Filters a section's mixed item list down to the entries whose type is `"node"`, returning them narrowed to the `Node` shape. A small accessor used throughout the lang, check, features, and tui layers to walk a section's nodes. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
  - module [parse-format](../../src/parse-format.ts#L1)
    <a id="lang.parse-format"></a><br>The stdout of `keylang parse [--json]` for parsed documents: the indented tree or the Text IR as JSON. Pure text, shared by the CLI and the TUI (and its export), so both give the same bytes; diagnostics are not part of it.
    - ir [lang.ir](lang.md#lang.ir)
    - type [ParseFormat](../../src/parse-format.ts#L8) = (typeof PARSE_FORMATS)[number]
      <a id="lang.parse-format.ParseFormat"></a><br>Derives a string-literal union type from the element type of the `PARSE_FORMATS` array, so the set of allowed parse format names is defined once as runtime data and reused statically for type checking. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - fn [parseReportText](../../src/parse-format.ts#L11) (format: ParseFormat, docs: readonly Document[]) → string
      <a id="lang.parse-format.parseReportText"></a><br>The whole stdout of `parse` in a format, every line ending in `\n`.
      - calls [lang.parse-format.treeLines](lang.md#lang.parse-format.treeLines)
    - fn [treeLines](../../src/parse-format.ts#L17) (doc: Document) → string[] <!-- internal -->
      <a id="lang.parse-format.treeLines"></a><br>One document as the tree `parse` prints: the path, each section, its nodes with their start.
      - calls [lang.parse-format.nodeLines](lang.md#lang.parse-format.nodeLines)
    - fn [nodeLines](../../src/parse-format.ts#L26) (n: Node, depth: number, out: string[]) → void <!-- internal -->
      <a id="lang.parse-format.nodeLines"></a><br>Recursively renders a parse node and its children as indented text lines, appending kind label (via [`lang.ir.kindLabel`](lang.md#lang.ir.kindLabel)), id, link target, text, label, refs and start position to the output array. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
      - calls [lang.ir.kindLabel](lang.md#lang.ir.kindLabel)
  - module [parser](../../src/parser.ts#L1)
    <a id="lang.parser"></a><br>Markdown → IR. A small line-oriented parser: keylang files use a strict subset of Markdown (headings, bullet lists indented by 2 spaces, paragraphs, fenced code), so a hand-written parser gives exact spans for every token without mapping back from a CommonMark AST.
    - diag [base.diag](base.md#base.diag)
    - ir [lang.ir](lang.md#lang.ir)
    - span [base.span](base.md#base.span)
    - fn [parse](../../src/parser.ts#L11) (path: string, src: string) → Document
      <a id="lang.parser.parse"></a><br>Feeds each source line, stripped of line endings and any leading BOM, with its number and offset into a [`lang.parser.Parser`](lang.md#lang.parser.Parser), then returns the Document built by [`lang.parser.Parser.finish`](lang.md#lang.parser.Parser.finish). _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [lang.parser.Parser](lang.md#lang.parser.Parser), [lang.parser.splitInclusive](lang.md#lang.parser.splitInclusive), [lang.parser.Parser.line](lang.md#lang.parser.Parser.line), [lang.parser.Line](lang.md#lang.parser.Line), [lang.parser.Parser.finish](lang.md#lang.parser.Parser.finish)
    - fn [splitInclusive](../../src/parser.ts#L27) (src: string) → string[] <!-- internal -->
      <a id="lang.parser.splitInclusive"></a><br>Split keeping the `\n` on each line (like Rust's `split_inclusive`).
    - module [Line](../../src/parser.ts#L40) <!-- internal -->
      <a id="lang.parser.Line"></a><br>Holds one source line's number, absolute byte offset, and text, and maps byte offsets within it to absolute positions with code-point columns via [`lang.parser.Line.pos`](lang.md#lang.parser.Line.pos). [`lang.parser.Line.span`](lang.md#lang.parser.Line.span) pairs two such positions into a range for tokens, nodes, and errors. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - fn [constructor](../../src/parser.ts#L45) (no: number, start: number, text: string)
        <a id="lang.parser.Line.constructor"></a><br>Stores a line's number, its byte offset in the source, and its raw text as fields on a new line record. Performs no parsing or validation of the given values. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - fn [pos](../../src/parser.ts#L51) (b: number) → Pos
        <a id="lang.parser.Line.pos"></a><br>Converts a byte offset within the line into a Pos with absolute offset, line number, and 1-based column counted in code points via [`lang.parser.codePoints`](lang.md#lang.parser.codePoints). Used by [`lang.parser.Line.span`](lang.md#lang.parser.Line.span) to build span endpoints. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [lang.parser.codePoints](lang.md#lang.parser.codePoints)
      - fn [span](../../src/parser.ts#L55) (a: number, b: number) → Span
        <a id="lang.parser.Line.span"></a><br>Builds a `Span` for a slice of the current line by converting two column offsets into absolute positions via [`lang.parser.Line.pos`](lang.md#lang.parser.Line.pos). Used by the lexer and parser routines to attach source ranges to tokens, nodes, and errors. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [lang.parser.Line.pos](lang.md#lang.parser.Line.pos)
    - fn [codePoints](../../src/parser.ts#L60) (s: string) → number <!-- internal -->
      <a id="lang.parser.codePoints"></a><br>Counts the Unicode code points in a string by iterating it, so surrogate pairs count once rather than twice as with `.length`. Used by [`lang.parser.Line.pos`](lang.md#lang.parser.Line.pos) and [`lang.parser.linkTextSpan`](lang.md#lang.parser.linkTextSpan) to compute character-based column positions. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Ctx](../../src/parser.ts#L67) <!-- internal -->
      <a id="lang.parser.Ctx"></a><br>Where an item stands, which decides the keywords it may use.
    - fn [ctxOf](../../src/parser.ts#L89) (section: SectionKind, parent: NodeKind | undefined) → Ctx <!-- internal -->
      <a id="lang.parser.ctxOf"></a><br>Maps a parent node kind and the current section into the parsing context used by [`lang.parser.Parser.item`](lang.md#lang.parser.Parser.item) and [`lang.parser.keywordsAt`](lang.md#lang.parser.keywordsAt), grouping related kinds (e.g. `layers`/`entry` → `ref-list`). Unknown parents fall back to a `leaf:` prefix, and `when` depends on whether the… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - type [TriggerKind](../../src/parser.ts#L135) = (typeof TRIGGER_KINDS)[number]
      <a id="lang.parser.TriggerKind"></a>
    - fn [isTriggerKind](../../src/parser.ts#L137) (word: string) → word is TriggerKind
      <a id="lang.parser.isTriggerKind"></a>
    - fn [isDuration](../../src/parser.ts#L150) (text: string) → boolean
      <a id="lang.parser.isDuration"></a>
    - fn [scheduleText](../../src/parser.ts#L159) (words: readonly string[]) → string | null
      <a id="lang.parser.scheduleText"></a><br>The schedule of `every <schedule>` in one canonical text, or null when the words are not one: a duration (`15m`), a cron macro (`@daily`), or five or six cron fields, bare (`*\/5 * * * *`) or in double quotes. Quotes are dropped.
    - fn [keywordsAt](../../src/parser.ts#L173) (section: SectionKind, parent: NodeKind | undefined) → readonly string[]
      <a id="lang.parser.keywordsAt"></a><br>Keywords an item may start with under `parent` (none at the top of a section).
      - calls [lang.parser.keywordsOf](lang.md#lang.parser.keywordsOf), [lang.parser.ctxOf](lang.md#lang.parser.ctxOf)
    - fn [keywordsOf](../../src/parser.ts#L177) (ctx: Ctx) → readonly string[] <!-- internal -->
      <a id="lang.parser.keywordsOf"></a><br>Maps a parser context to the keywords allowed there, e.g. block keywords at a section's top level or `calls` inside a function, returning an empty list for unknown contexts. Used by [`lang.parser.Parser.interpret`](lang.md#lang.parser.Parser.interpret) and [`lang.parser.placeHint`](lang.md#lang.parser.placeHint). _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
    - fn [placeHint](../../src/parser.ts#L242) (word: string, ctx: Ctx, section: SectionKind) → string <!-- internal -->
      <a id="lang.parser.placeHint"></a><br>`; \`calls\` goes under \`- fn\`` when `word` is a keyword of other positions and not of `ctx`, else "". The places of the current section are listed; when the word belongs to other sections, one place is named with its section and several by their sections only (`; \`test\`…
      - calls [lang.parser.keywordsOf](lang.md#lang.parser.keywordsOf)
    - fn [roleAt](../../src/parser.ts#L343) (section: SectionKind, parent: NodeKind | undefined, kind: NodeKind) → string | null
      <a id="lang.parser.roleAt"></a><br>The role of an item of `kind` under `parent` (or at the top of `section`), or `null` when it has none there.
      - calls [lang.parser.ctxOf](lang.md#lang.parser.ctxOf)
    - fn [keywordKind](../../src/parser.ts#L348) (ctx: Ctx, kw: string) → NodeKind <!-- internal -->
      <a id="lang.parser.keywordKind"></a><br>Maps a parsed keyword to its node kind for [`lang.parser.Parser.interpret`](lang.md#lang.parser.Parser.interpret), passing most keywords through unchanged, turning `?` into a question and top-level `module` into a rule module; unrecognized keywords become unknown. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
    - type [Parent](../../src/parser.ts#L388) <!-- internal -->
      <a id="lang.parser.Parent"></a><br>Describes the enclosing syntax node while walking a parsed tree: its `NodeKind`, the declared identifier if any, and an optional target name, both nullable when the parent has no such piece. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - module [Parser](../../src/parser.ts#L394) <!-- internal -->
      <a id="lang.parser.Parser"></a><br>Line-by-line state machine that builds a keylang document from Markdown, sorting lines into sections, nested items with descriptions, prose, code fences and HTML blocks, and recording diagnostics via [`lang.parser.Parser.err`](lang.md#lang.parser.Parser.err). _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - fn [constructor](../../src/parser.ts#L409) (path: string)
        <a id="lang.parser.Parser.constructor"></a><br>Stores the given file path and initializes an empty document record carrying that path, a null `generated` marker, and empty `sections` and `diagnostics` lists for later parsing to fill. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - fn [err](../../src/parser.ts#L414) (code: Exclude<Code, "K005">, span: Span, msg: string) → void <!-- internal -->
        <a id="lang.parser.Parser.err"></a><br>Appends a diagnostic for the current file to the document's diagnostics list via [`base.diag.diagnostic`](base.md#base.diag.diagnostic), attaching the structured reason only when the code is "K005" and one is supplied. Every parse-error site in [`lang.parser.Parser`](lang.md#lang.parser.Parser) funnels through this method. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [base.diag.diagnostic](base.md#base.diag.diagnostic)
      - fn [section](../../src/parser.ts#L421) () → Section <!-- internal -->
        <a id="lang.parser.Parser.section"></a><br>Returns the last section in `this.doc.sections`, first appending a default heading-less "map" section with no items when the document has none yet, so callers like [`lang.parser.Parser.item`](lang.md#lang.parser.Parser.item) and [`lang.parser.Parser.closeList`](lang.md#lang.parser.Parser.closeList) always have a section to write into. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - fn [sectionKind](../../src/parser.ts#L428) () → SectionKind <!-- internal -->
        <a id="lang.parser.Parser.sectionKind"></a><br>Returns the kind of the most recently opened section in the document being parsed, defaulting to "map" when no section has been started yet; [`lang.parser.Parser.item`](lang.md#lang.parser.Parser.item) uses it to decide how to interpret an item line. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - fn [flushProse](../../src/parser.ts#L432) () → void <!-- internal -->
        <a id="lang.parser.Parser.flushProse"></a><br>If any buffered prose lines exist, wraps them into a single `prose` item appended to the current section from [`lang.parser.Parser.section`](lang.md#lang.parser.Parser.section), then clears the buffer. Does nothing when no prose is pending. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [lang.parser.Parser.section](lang.md#lang.parser.Parser.section)
      - fn [pushDescription](../../src/parser.ts#L440) (l: Line, text: string, lead: Lead, depth: number) → void <!-- internal -->
        <a id="lang.parser.Parser.pushDescription"></a><br>A non-empty line that belongs to an open item as its description (§3).
        - calls [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.parser.Line.span](lang.md#lang.parser.Line.span)
      - fn [closeList](../../src/parser.ts#L447) (depth: number) → void <!-- internal -->
        <a id="lang.parser.Parser.closeList"></a><br>Pops nested list nodes off the parser stack until it is at most `depth` deep, attaching each popped node to its parent's children or, when no parent remains, to the current section from [`lang.parser.Parser.section`](lang.md#lang.parser.Parser.section) as a top-level item. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [lang.parser.Parser.section](lang.md#lang.parser.Parser.section)
      - fn [finish](../../src/parser.ts#L456) () → Document
        <a id="lang.parser.Parser.finish"></a><br>Flushes any still-open code fence as a code item into the current section via [`lang.parser.Parser.section`](lang.md#lang.parser.Parser.section), then runs [`lang.parser.Parser.flushProse`](lang.md#lang.parser.Parser.flushProse) and [`lang.parser.Parser.closeList`](lang.md#lang.parser.Parser.closeList) to depth 0 before returning the built document. Called once at end of input by… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [lang.parser.Parser.section](lang.md#lang.parser.Parser.section), [lang.parser.Parser.flushProse](lang.md#lang.parser.Parser.flushProse), [lang.parser.Parser.closeList](lang.md#lang.parser.Parser.closeList)
      - fn [line](../../src/parser.ts#L466) (l: Line) → void
        <a id="lang.parser.Parser.line"></a><br>Dispatches one source line by parser state: collects fenced code and multi-line HTML blocks, records the generated marker, and routes to [`lang.parser.Parser.heading`](lang.md#lang.parser.Parser.heading), [`lang.parser.Parser.item`](lang.md#lang.parser.Parser.item), item descriptions or prose, flagging tab indentation. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
        - calls [lang.parser.closesFence](lang.md#lang.parser.closesFence), [lang.parser.Parser.section](lang.md#lang.parser.Parser.section), [lang.parser.leadingWhitespace](lang.md#lang.parser.leadingWhitespace), [lang.parser.Parser.pushDescription](lang.md#lang.parser.Parser.pushDescription), [lang.parser.Parser.flushProse](lang.md#lang.parser.Parser.flushProse), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.parser.htmlBlockStart](lang.md#lang.parser.htmlBlockStart), [lang.parser.Parser.closeList](lang.md#lang.parser.Parser.closeList), [lang.parser.Parser.heading](lang.md#lang.parser.Parser.heading), [lang.parser.opensFence](lang.md#lang.parser.opensFence), [lang.parser.openFence](lang.md#lang.parser.openFence), [lang.parser.isBullet](lang.md#lang.parser.isBullet), [lang.parser.Parser.item](lang.md#lang.parser.Parser.item), [lang.parser.Line.span](lang.md#lang.parser.Line.span)
      - fn [heading](../../src/parser.ts#L556) (l: Line) → void <!-- internal -->
        <a id="lang.parser.Parser.heading"></a><br>Ends pending prose and lists, then lexes a `#` line into a new section of kind map, rules, flow or wiring, defaulting to map with a K006 error. Only a flow takes a name, checked by [`lang.parser.isSegment`](lang.md#lang.parser.isSegment); missing names or extra words raise K005. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
        - calls [lang.parser.Parser.flushProse](lang.md#lang.parser.Parser.flushProse), [lang.parser.Parser.closeList](lang.md#lang.parser.Parser.closeList), [lang.parser.lex](lang.md#lang.parser.lex), [lang.parser.Line](lang.md#lang.parser.Line), [lang.parser.headingEnd](lang.md#lang.parser.headingEnd), [lang.parser.renderTokens](lang.md#lang.parser.renderTokens), [lang.parser.Line.span](lang.md#lang.parser.Line.span), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.parser.isSegment](lang.md#lang.parser.isSegment), [lang.parser.nfc](lang.md#lang.parser.nfc)
      - fn [item](../../src/parser.ts#L588) (l: Line, wsLen: number, indent: number) → void <!-- internal -->
        <a id="lang.parser.Parser.item"></a><br>Parses a bulleted list line: checks indentation (K003), closes deeper lists, then lexes the item via [`lang.parser.lex`](lang.md#lang.parser.lex) and classifies it with [`lang.parser.Parser.interpret`](lang.md#lang.parser.Parser.interpret) before pushing it onto the nesting stack. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
        - calls [lang.parser.Parser.flushProse](lang.md#lang.parser.Parser.flushProse), [lang.parser.Line.span](lang.md#lang.parser.Line.span), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.parser.Parser.closeList](lang.md#lang.parser.Parser.closeList), [lang.parser.Parser.section](lang.md#lang.parser.Parser.section), [lang.parser.lex](lang.md#lang.parser.lex), [lang.parser.ctxOf](lang.md#lang.parser.ctxOf), [lang.parser.Parser.sectionKind](lang.md#lang.parser.Parser.sectionKind), [lang.parser.Parser.interpret](lang.md#lang.parser.Parser.interpret)
      - fn [interpret](../../src/parser.ts#L641) (n: Node, l: Line, ctx: Ctx, parent: Parent | undefined) → void <!-- internal -->
        <a id="lang.parser.Parser.interpret"></a><br>Classifies an item by its leading keyword, sending non-keyword items to [`lang.parser.Parser.bare`](lang.md#lang.parser.Parser.bare), and parses the remaining tokens per kind into declarations, references, or text. Malformed arguments raise K005 errors. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
        - calls [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.parser.keywordsOf](lang.md#lang.parser.keywordsOf), [lang.parser.Parser.bare](lang.md#lang.parser.Parser.bare), [lang.parser.keywordKind](lang.md#lang.parser.keywordKind), [lang.parser.Parser.decl](lang.md#lang.parser.Parser.decl), [lang.parser.Parser.refList](lang.md#lang.parser.Parser.refList), [lang.parser.isSegment](lang.md#lang.parser.isSegment), [lang.parser.nfc](lang.md#lang.parser.nfc), [lang.parser.Parser.layers](lang.md#lang.parser.Parser.layers), [lang.ir.kindLabel](lang.md#lang.ir.kindLabel), [lang.parser.Parser.plannedModifier](lang.md#lang.parser.Parser.plannedModifier), [lang.parser.Parser.typedTrigger](lang.md#lang.parser.Parser.typedTrigger), [lang.parser.Parser.oneRef](lang.md#lang.parser.Parser.oneRef), [lang.parser.isDuration](lang.md#lang.parser.isDuration), [lang.parser.spanned](lang.md#lang.parser.spanned), [lang.parser.scheduleText](lang.md#lang.parser.scheduleText), [lang.parser.renderTokens](lang.md#lang.parser.renderTokens), [lang.parser.Parser.freeText](lang.md#lang.parser.Parser.freeText), [lang.parser.parseLink](lang.md#lang.parser.parseLink), [lang.parser.isId](lang.md#lang.parser.isId)
      - fn [bare](../../src/parser.ts#L819) (n: Node, ctx: Ctx, parent: Parent | undefined) → void <!-- internal -->
        <a id="lang.parser.Parser.bare"></a><br>Item whose first word is not a keyword of its context.
        - calls [lang.parser.placeHint](lang.md#lang.parser.placeHint), [lang.parser.Parser.sectionKind](lang.md#lang.parser.Parser.sectionKind), [lang.parser.Parser.decl](lang.md#lang.parser.Parser.decl), [lang.parser.isSegment](lang.md#lang.parser.isSegment), [lang.parser.nfc](lang.md#lang.parser.nfc), [lang.parser.Parser.oneRef](lang.md#lang.parser.Parser.oneRef), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.ir.kindLabel](lang.md#lang.ir.kindLabel), [lang.parser.keywordsOf](lang.md#lang.parser.keywordsOf)
      - fn [decl](../../src/parser.ts#L874) (n: Node, rest: Token[], parentId: string | null, sig: boolean, hint: () => string = () => "") → void <!-- internal -->
        <a id="lang.parser.Parser.decl"></a><br>`<name>` or `[name](path#Lnn)` + optional signature. `hint` says where a keyword written as an implicit layer or module name goes.
        - calls [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.ir.kindLabel](lang.md#lang.ir.kindLabel), [lang.parser.parseLink](lang.md#lang.parser.parseLink), [lang.parser.isSegment](lang.md#lang.parser.isSegment), [lang.parser.linkTextSpan](lang.md#lang.parser.linkTextSpan), [lang.parser.nfc](lang.md#lang.parser.nfc), [lang.parser.renderTokens](lang.md#lang.parser.renderTokens)
      - fn [makeRef](../../src/parser.ts#L912) (t: Token) → Ref | null <!-- internal -->
        <a id="lang.parser.Parser.makeRef"></a><br>A bare ID, or `[id](href)`: the link text is the ID, the target is kept and never checked.
        - calls [lang.parser.isId](lang.md#lang.parser.isId), [lang.parser.nfc](lang.md#lang.parser.nfc), [lang.parser.parseLink](lang.md#lang.parser.parseLink), [lang.parser.linkTextSpan](lang.md#lang.parser.linkTextSpan), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err)
      - fn [plannedModifier](../../src/parser.ts#L934) (n: Node, rest: Token[]) → boolean <!-- internal -->
        <a id="lang.parser.Parser.plannedModifier"></a><br>`step planned <id>` (or `step planned <kind> <id>`) reads like a modifier, but `planned` is a declaration of its own: K005 on the word says how to write it. Without a line kind the hint assumes `fn`.
        - calls [lang.parser.isId](lang.md#lang.parser.isId), [lang.ir.kindLabel](lang.md#lang.ir.kindLabel), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err)
      - fn [typedTrigger](../../src/parser.ts#L955) (n: Node, rest: Token[]) → boolean <!-- internal -->
        <a id="lang.parser.Parser.typedTrigger"></a><br>`trigger <kind> <id>` (ADR 0023 п. 3): the kind is kept as the label, the ID is the entry point's fn. A first word without a dot that is no kind is K005 on it.
        - calls [lang.parser.isTriggerKind](lang.md#lang.parser.isTriggerKind), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.parser.Parser.oneRef](lang.md#lang.parser.Parser.oneRef)
      - fn [oneRef](../../src/parser.ts#L967) (n: Node, rest: Token[]) → void <!-- internal -->
        <a id="lang.parser.Parser.oneRef"></a><br>Requires exactly one argument token, turning it into a reference via [`lang.parser.Parser.makeRef`](lang.md#lang.parser.Parser.makeRef) and appending it to the node's refs. Otherwise it reports K005 via [`lang.parser.Parser.err`](lang.md#lang.parser.Parser.err), at the node for a missing ID or at the second token for extras. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
        - calls [lang.parser.Parser.makeRef](lang.md#lang.parser.Parser.makeRef), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err)
      - fn [refList](../../src/parser.ts#L978) (n: Node, rest: Token[], min: number) → void <!-- internal -->
        <a id="lang.parser.Parser.refList"></a><br>Skips commas in the trailing tokens, converts each remaining token into a reference via [`lang.parser.Parser.makeRef`](lang.md#lang.parser.Parser.makeRef) and appends it to the node. Reports a K005 error through [`lang.parser.Parser.err`](lang.md#lang.parser.Parser.err) if fewer than the minimum IDs appear. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
        - calls [lang.parser.Parser.makeRef](lang.md#lang.parser.Parser.makeRef), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.ir.kindLabel](lang.md#lang.ir.kindLabel)
      - fn [layers](../../src/parser.ts#L992) (n: Node, rest: Token[]) → void <!-- internal -->
        <a id="lang.parser.Parser.layers"></a><br>`layers a < b < c`
        - calls [lang.parser.Parser.makeRef](lang.md#lang.parser.Parser.makeRef), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err)
      - fn [freeText](../../src/parser.ts#L1006) (n: Node, l: Line, rest: Token[]) → void <!-- internal -->
        <a id="lang.parser.Parser.freeText"></a><br>Stores a node's trailing tokens as canonical description text via [`lang.parser.renderTokens`](lang.md#lang.parser.renderTokens), spanning first to last token so reformatting won't change it. If none remain, reports K005 that the node kind needs a description. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
        - calls [lang.parser.renderTokens](lang.md#lang.parser.renderTokens), [lang.parser.Line.span](lang.md#lang.parser.Line.span), [lang.parser.Parser.err](lang.md#lang.parser.Parser.err), [lang.ir.kindLabel](lang.md#lang.ir.kindLabel)
    - fn [spanned](../../src/parser.ts#L1020) (t: Token) → Spanned<string> <!-- internal -->
      <a id="lang.parser.spanned"></a><br>Wraps a token's text together with its source span into a `Spanned<string>` value, so callers like [`lang.parser.Parser.bare`](lang.md#lang.parser.Parser.bare) and [`lang.parser.Parser.interpret`](lang.md#lang.parser.Parser.interpret) can keep location info attached to the extracted string. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Lead](../../src/parser.ts#L1024) <!-- internal -->
      <a id="lang.parser.Lead"></a><br>Holds the measured leading whitespace of a source line: the raw prefix string, its indent width where a tab counts as two spaces, its CommonMark column count where a tab advances to the next multiple of 4, and a flag noting whether any tab was present. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [leadingWhitespace](../../src/parser.ts#L1033) (text: string) → Lead <!-- internal -->
      <a id="lang.parser.leadingWhitespace"></a><br>Measures the run of spaces and tabs at the start of a line, counting each tab as two indent units and advancing columns to the next multiple of four, and reports whether any tab was present. Used by [`lang.parser.Parser.line`](lang.md#lang.parser.Parser.line), [`lang.parser.openFence`](lang.md#lang.parser.openFence), and… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [FenceOpen](../../src/parser.ts#L1049) <!-- internal -->
      <a id="lang.parser.FenceOpen"></a><br>Records the shape of a Markdown fence opener: which fence character was used, how many of them, the fence's column width, and the leading-space count (null when a tab sits in the indent). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [openFence](../../src/parser.ts#L1058) (text: string) → FenceOpen | null <!-- internal -->
      <a id="lang.parser.openFence"></a><br>A fence opener, ignoring the indent-of-4 rule. An info string with a backtick is not an opener.
      - calls [lang.parser.leadingWhitespace](lang.md#lang.parser.leadingWhitespace)
    - fn [opensFence](../../src/parser.ts#L1075) (text: string, listOpen: boolean) → boolean <!-- internal -->
      <a id="lang.parser.opensFence"></a><br>CommonMark fence: indent under 4 spaces, or any indent while a list is open (Р9). A backtick info string that itself contains a backtick is prose.
      - calls [lang.parser.openFence](lang.md#lang.parser.openFence)
    - fn [closesFence](../../src/parser.ts#L1080) (text: string, open: { char: string; len: number; columns: number }) → boolean <!-- internal -->
      <a id="lang.parser.closesFence"></a><br>Decides whether a line terminates a code fence opened with the given character, length, and indent by measuring its leading whitespace via [`lang.parser.leadingWhitespace`](lang.md#lang.parser.leadingWhitespace). The line must be indented at most max(3, opener indent), start with at least as many fence characters as… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [lang.parser.leadingWhitespace](lang.md#lang.parser.leadingWhitespace)
    - fn [dedentFenceLines](../../src/parser.ts#L1097) (lines: string[]) → string[]
      <a id="lang.parser.dedentFenceLines"></a><br>Drop the indent `fmt` owes a fence that was written under a list item. The opener and the closer lose all of their indent; each body line loses as many spaces as the opener had, and never more than it has.
      - calls [lang.parser.openFence](lang.md#lang.parser.openFence), [lang.parser.closesFence](lang.md#lang.parser.closesFence)
    - fn [htmlBlockStart](../../src/parser.ts#L1118) (rest: string) → { end: (line: string) => boolean } | null <!-- internal -->
      <a id="lang.parser.htmlBlockStart"></a><br>Start of a CommonMark HTML block of types 1–5, or null. The end test reads the whole line.
    - fn [headingEnd](../../src/parser.ts#L1135) (text: string) → number <!-- internal -->
      <a id="lang.parser.headingEnd"></a><br>Where the words of a `#` heading line end: before an optional closing sequence of `#` that follows a space or a tab and has only spaces or tabs after it (CommonMark). `# flow a #` has the words `flow a`; in `# flow a#` the `#` is part of a word.
    - fn [isBullet](../../src/parser.ts#L1141) (rest: string) → boolean <!-- internal -->
      <a id="lang.parser.isBullet"></a><br>Checks whether a line remainder starts with `-`, `*`, or `+` followed by either end-of-string or a single space, marking it as a list bullet. Used by [`lang.parser.Parser.line`](lang.md#lang.parser.Parser.line) to classify lines during parsing. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [nfc](../../src/parser.ts#L1151) (text: string) → string <!-- internal -->
      <a id="lang.parser.nfc"></a><br>An ID in Unicode normal form C: a composed `café` and a decomposed one are one ID. Tokens and spans keep the text as written, so `fmt` changes nothing.
    - fn [isSegment](../../src/parser.ts#L1156) (s: string) → boolean
      <a id="lang.parser.isSegment"></a><br>A single ID segment: letter or `_`, then letters (with their combining marks), digits, `_`, `-`.
    - fn [isId](../../src/parser.ts#L1162) (s: string) → boolean
      <a id="lang.parser.isId"></a><br>A dotted ID: `segment(.segment)*`.
      - calls [lang.parser.isSegment](lang.md#lang.parser.isSegment)
    - fn [linkTextSpan](../../src/parser.ts#L1168) (t: Token) → Span
      <a id="lang.parser.linkTextSpan"></a><br>The span of the text inside `[…]`, the same span a link reference uses.
      - calls [lang.parser.parseLink](lang.md#lang.parser.parseLink), [lang.parser.codePoints](lang.md#lang.parser.codePoints)
    - fn [parseLink](../../src/parser.ts#L1174) (t: Token) → Link <!-- internal -->
      <a id="lang.parser.parseLink"></a><br>Splits a markdown-style `[text](target)` token into display text and target, decoding the path via [`lang.parser.decodeLinkPath`](lang.md#lang.parser.decodeLinkPath) and extracting an optional `#L<n>` fragment as a line number. Returns these fields together with the token's span. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [lang.parser.decodeLinkPath](lang.md#lang.parser.decodeLinkPath)
    - fn [decodeLinkPath](../../src/parser.ts#L1193) (path: string) → string <!-- internal -->
      <a id="lang.parser.decodeLinkPath"></a><br>Percent-decoding for map links. A broken escape is kept as written so the diagnostic still points at the source.
    - fn [lex](../../src/parser.ts#L1207) (l: Line, start: number, errs: [Span, string][]) → { tokens: Token[]; comment: Spanned<string> | null } <!-- internal -->
      <a id="lang.parser.lex"></a><br>Split an item head into tokens. Words end at whitespace or `,`; `[text](target)` and `"quoted"` are single tokens (a `[` that opens no link is an ordinary word); `<!-- … -->` ends the head and is returned separately.
      - calls [lang.parser.Line.span](lang.md#lang.parser.Line.span), [lang.parser.linkEnd](lang.md#lang.parser.linkEnd)
    - fn [linkEnd](../../src/parser.ts#L1271) (s: string, i: number) → number | null <!-- internal -->
      <a id="lang.parser.linkEnd"></a><br>The end of `[text](destination)` opened at `i`, or null. As in CommonMark, the destination has no whitespace and holds parentheses only in balanced pairs or escaped (`\(`), so `(https://e.com/Foo_(bar))` ends at the last `)`.
    - fn [renderMeaning](../../src/parser.ts#L1293) (node: Node) → string
      <a id="lang.parser.renderMeaning"></a><br>What an item's head says, for comparing meaning (a verdict's `specHash`, a rule already written): canonical tokens, with a reference written as a link `[id](href)` counted as its ID, so linking a reference changes nothing.
      - calls [lang.parser.renderTokens](lang.md#lang.parser.renderTokens)
    - fn [renderTokens](../../src/parser.ts#L1299) (tokens: readonly Token[]) → string
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
      <a id="lang.spec-ir.NonEmpty"></a><br>A readonly tuple type requiring at least one element of `T`, used to statically guarantee that list-shaped spec IR values are never empty. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Located](../../src/spec-ir.ts#L19) <!-- internal -->
      <a id="lang.spec-ir.Located"></a><br>Shared shape for every spec-IR element that must point back to its origin: the source file path, a `Span`, the canonical text whose hash becomes the specHash, and a read-only reference to the parsed `Node`. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [LayerOrder](../../src/spec-ir.ts#L27) extends Located
      <a id="lang.spec-ir.LayerOrder"></a><br>Spec-IR record for a layering declaration: an ordered list of layer names (lowest first, no repeats, consistent with earlier orders) plus the nested `Ref`s it mentions, with source location via `Located`. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [RejectedLayers](../../src/spec-ir.ts#L36)
      <a id="lang.spec-ir.RejectedLayers"></a><br>A `layers` line that is not an order. It is not an assertion; its text still enters the no-snapshot hash when it names an order.
    - type [DependencyRule](../../src/spec-ir.ts#L45) extends Located
      <a id="lang.spec-ir.DependencyRule"></a><br>Describes one allow/deny edge from a source `Ref` to one or more target refs in the architecture spec's intermediate form. The `generated` flag marks baseline rules from a generated file, which manual rules over the same areas override. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Entry](../../src/spec-ir.ts#L54) extends Located
      <a id="lang.spec-ir.Entry"></a><br>Spec IR node tagged `kind: "entry"` that carries a non-empty list of `Ref` values marking the entry points of a spec, plus the source position inherited from `Located`. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [NoCycles](../../src/spec-ir.ts#L59) extends Located
      <a id="lang.spec-ir.NoCycles"></a><br>Represents a parsed `no-cycles` rule in the spec IR, carrying a `kind` discriminator and an `under` scope that is a `Ref` or null when the whole repository is meant. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [ExportsRule](../../src/spec-ir.ts#L65) extends Located
      <a id="lang.spec-ir.ExportsRule"></a><br>Shape of a parsed spec rule asserting that a given module exports a non-empty list of named symbols, tagged `kind: "exports"` and carrying source location via `Located`. Holds module and names as `Ref`s for later resolution. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [RuleAssertion](../../src/spec-ir.ts#L71) = LayerOrder | DependencyRule | Entry | NoCycles | ExportsRule
      <a id="lang.spec-ir.RuleAssertion"></a><br>Union of the five rule-assertion shapes a parsed spec can carry—layer ordering, allowed/denied dependencies, entry points, cycle bans, and export constraints. Checkers switch on this type to validate a codebase against the spec. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [SpecModule](../../src/spec-ir.ts#L74)
      <a id="lang.spec-ir.SpecModule"></a><br>A `module x` line. It scopes nested rules and is not itself an assertion, so nothing hashes it.
    - type [FlowStep](../../src/spec-ir.ts#L81) extends Located
      <a id="lang.spec-ir.FlowStep"></a><br>Shape of one step inside a spec's flow: a `kind: "step"` discriminator, the `Ref` it points at, and a nested list of `FlowItem` children, plus the source position inherited from `Located`. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Trigger](../../src/spec-ir.ts#L87) extends Located
      <a id="lang.spec-ir.Trigger"></a><br>Describes one event hook in the spec IR: a `Ref` naming the element it fires on, plus the ordered `FlowItem` steps that run when it does, tagged with `kind: "trigger"` and a source location via `Located`. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - type [ParallelItem](../../src/spec-ir.ts#L96) extends Located
      <a id="lang.spec-ir.ParallelItem"></a><br>`parallel`: every nested step must run, in any order; siblings are ordered against the whole group (ADR 0023 п. 2).
    - type [ContinuesItem](../../src/spec-ir.ts#L103) extends Located
      <a id="lang.spec-ir.ContinuesItem"></a><br>`continues <flow>` at the top of a flow: it continues another flow in a later request (ADR 0023 п. 4).
    - type [TimerItem](../../src/spec-ir.ts#L112) extends Located
      <a id="lang.spec-ir.TimerItem"></a><br>`after <duration>` / `every <schedule>`: a timer only a nested `test` checks; `every` also against a cron entry point (ADR 0023 п. 5).
    - type [WhenItem](../../src/spec-ir.ts#L119) extends Located
      <a id="lang.spec-ir.WhenItem"></a><br>Spec-IR shape for a conditional branch in a flow: a `kind: "when"` discriminator, a free-text condition string, and the nested list of `FlowItem` nodes to run when it holds, with source position via `Located`. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [ThenItem](../../src/spec-ir.ts#L125)
      <a id="lang.spec-ir.ThenItem"></a><br>Union type for a "then" step in the spec IR: it carries a source location, a list of nested `FlowItem` children, and either a `Ref` target or free-form prose text, discriminated by the `form` field. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [ClaimItem](../../src/spec-ir.ts#L127) extends Located
      <a id="lang.spec-ir.ClaimItem"></a><br>Represents one claim entry in the spec intermediate form: a `kind` discriminator of invariant, reads, or emits, the prose or referenced ID as `body`, an optional `target` reference, and nested flow steps as `children`. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [CallsItem](../../src/spec-ir.ts#L136) extends Located
      <a id="lang.spec-ir.CallsItem"></a><br>`calls <id>[, <id>…]` under a step or trigger: the parent fn calls each target directly.
    - type [QuestionItem](../../src/spec-ir.ts#L143) extends Located
      <a id="lang.spec-ir.QuestionItem"></a><br>`? <text>`: an open question of a flow. No claim: `check` judges nothing in it; a feature with one is not done.
    - type [TestItem](../../src/spec-ir.ts#L150) extends Located
      <a id="lang.spec-ir.TestItem"></a><br>Represents a test reference in the spec IR: a record tagged `kind: "test"` carrying the test file path as written and an optional test name, with source location inherited from `Located`. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [FlowItem](../../src/spec-ir.ts#L157)
      <a id="lang.spec-ir.FlowItem"></a><br>Union of every entry kind that can appear in a spec flow in the intermediate representation: plain steps, when/then clauses, claims, calls, tests and questions, so flow lists can hold any of them. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
    - type [Flow](../../src/spec-ir.ts#L159)
      <a id="lang.spec-ir.Flow"></a><br>Describes a parsed flow block in the spec IR: its source location, name, business/technical kind, trigger list, and non-trigger items, plus `top` preserving the source-order interleaving of both. Downstream passes read triggers and items separately while `top` keeps the… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Planned](../../src/spec-ir.ts#L171) extends Located
      <a id="lang.spec-ir.Planned"></a><br>Marks a spec entry as a planned-but-unimplemented declaration of a function, module, type, or event, carrying its ID, an optional signature string, and the source location inherited from `Located`. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [WireWhen](../../src/spec-ir.ts#L179) extends Located
      <a id="lang.spec-ir.WireWhen"></a><br>A `when` whose condition is `env.NAME = value` and whose target resolved.
    - type [WireCompose](../../src/spec-ir.ts#L185) extends Located
      <a id="lang.spec-ir.WireCompose"></a><br>Declares the IR shape for a wire-level composition reference: a `Ref` naming the target spec being composed, plus the source position inherited from `Located`. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [WireDep](../../src/spec-ir.ts#L189) extends Located
      <a id="lang.spec-ir.WireDep"></a><br>Describes one declared dependency edge in the spec IR: a named link to a target `Ref`, plus the `WireWhen` conditions under which it applies and the `WireCompose` steps that shape it. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Wire](../../src/spec-ir.ts#L196) extends Located
      <a id="lang.spec-ir.Wire"></a><br>Spec-IR record linking one `Ref` target to the list of `WireDep` entries it depends on, carrying source position via `Located`. Used to express dependency edges between spec nodes. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [SpecIR](../../src/spec-ir.ts#L201)
      <a id="lang.spec-ir.SpecIR"></a><br>The compiled shape of a spec document: rule assertions, declared modules, flows, planned items, and wires, plus `layers` lines that failed to form an order. A `hasRules` flag records that some section produced a rule even when its order was rejected. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [walkFlow](../../src/spec-ir.ts#L215) (flow: Flow, visit: (item: Trigger | FlowItem) => void) → void
      <a id="lang.spec-ir.walkFlow"></a><br>Triggers and top-level items, then nested items, in source order.
    - type [LayerCandidate](../../src/spec-ir.ts#L226) <!-- internal -->
      <a id="lang.spec-ir.LayerCandidate"></a><br>Holds one layer-shaped block found while scanning a spec file: its sequence number, file, `Span`, raw text, the ordered and nested `Ref` lists it declares, the originating `Node`, and whether it passed validation. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [PlacedRule](../../src/spec-ir.ts#L237) <!-- internal -->
      <a id="lang.spec-ir.PlacedRule"></a><br>Pairs a parsed rule assertion with a sequence number recording its position in the spec, so rules can be ordered or referenced by where they appeared. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [compileSpec](../../src/spec-ir.ts#L242) (docs: readonly Document[]) → { spec: SpecIR; diagnostics: Diagnostic[] }
      <a id="lang.spec-ir.compileSpec"></a><br>Walks parsed documents and dispatches rules/map, flow and wiring sections to [`lang.spec-ir.compileRules`](lang.md#lang.spec-ir.compileRules), [`lang.spec-ir.compileFlow`](lang.md#lang.spec-ir.compileFlow) and [`lang.spec-ir.compileWires`](lang.md#lang.spec-ir.compileWires). It then resolves layer orders via [`lang.spec-ir.settleLayers`](lang.md#lang.spec-ir.settleLayers) and returns a sequence-ordered spec plus… _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [lang.spec-ir.compileRules](lang.md#lang.spec-ir.compileRules), [lang.spec-ir.compileFlow](lang.md#lang.spec-ir.compileFlow), [lang.spec-ir.compileWires](lang.md#lang.spec-ir.compileWires), [lang.spec-ir.settleLayers](lang.md#lang.spec-ir.settleLayers)
    - fn [compileRules](../../src/spec-ir.ts#L266) ( file: string, generated: boolean, section: Section, placed: PlacedRule[], candidates: LayerCandidate[], modules: SpecModule[], diagnostics: Diagnostic[], nextSeq: () => number, ) → void <!-- internal -->
      <a id="lang.spec-ir.compileRules"></a><br>Walks a spec section's nodes via [`lang.ir.sectionNodes`](lang.md#lang.ir.sectionNodes), turning allow/deny, entry, no-cycles, layers and rule-module lines into sequenced rules, layer candidates and module entries. Delegates each node kind to [`lang.spec-ir.dependency`](lang.md#lang.spec-ir.dependency), [`lang.spec-ir.entryLine`](lang.md#lang.spec-ir.entryLine)… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.spec-ir.considerLayers](lang.md#lang.spec-ir.considerLayers), [lang.spec-ir.dependency](lang.md#lang.spec-ir.dependency), [lang.spec-ir.entryLine](lang.md#lang.spec-ir.entryLine), [lang.spec-ir.noCycles](lang.md#lang.spec-ir.noCycles), [lang.spec-ir.exportsRule](lang.md#lang.spec-ir.exportsRule)
    - fn [considerLayers](../../src/spec-ir.ts#L306) (file: string, node: Node, diagnostics: Diagnostic[]) → Omit<LayerCandidate, "seq"> | null <!-- internal -->
      <a id="lang.spec-ir.considerLayers"></a><br>A `layers` line the old text IR would have kept, with K005 for a non-layer or a repeated layer. An empty line is absent.
      - calls [base.diag.diagnostic](base.md#base.diag.diagnostic)
    - fn [settleLayers](../../src/spec-ir.ts#L333) (candidates: readonly LayerCandidate[], diagnostics: Diagnostic[]) → { orders: PlacedRule[]; rejectedLayers: RejectedLayers[] } <!-- internal -->
      <a id="lang.spec-ir.settleLayers"></a><br>One partial order across every document, in encounter order. A line that contradicts an earlier order is K005 and not an order.
      - calls [base.diag.diagnostic](base.md#base.diag.diagnostic), [lang.spec-ir.layersAbove](lang.md#lang.spec-ir.layersAbove), [lang.spec-ir.at](lang.md#lang.spec-ir.at)
    - fn [layersAbove](../../src/spec-ir.ts#L385) (direct: ReadonlyMap<string, ReadonlySet<string>>) → Map<string, Set<string>> <!-- internal -->
      <a id="lang.spec-ir.layersAbove"></a><br>Computes the transitive closure of a direct adjacency map: for each key, a depth-first walk collects every name reachable through chained edges, with a visited set guarding against cycles. The result feeds [`lang.spec-ir.settleLayers`](lang.md#lang.spec-ir.settleLayers) for ordering layer candidates. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [dependency](../../src/spec-ir.ts#L401) (file: string, node: Node, effect: "allow" | "deny", generated: boolean) → DependencyRule | null <!-- internal -->
      <a id="lang.spec-ir.dependency"></a><br>Builds a dependency rule from a parsed spec line, taking the first ref as the source and the remaining refs (checked via [`lang.spec-ir.nonEmpty`](lang.md#lang.spec-ir.nonEmpty)) as targets, returning null if either side is missing. Location and reconstructed rule text are attached through [`lang.spec-ir.at`](lang.md#lang.spec-ir.at). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [lang.spec-ir.nonEmpty](lang.md#lang.spec-ir.nonEmpty), [lang.spec-ir.at](lang.md#lang.spec-ir.at)
    - fn [nonEmpty](../../src/spec-ir.ts#L408) (refs: readonly Ref[]) → NonEmpty<Ref> | null <!-- internal -->
      <a id="lang.spec-ir.nonEmpty"></a><br>Returns `null` when the ref array is empty, otherwise copies it into a tuple typed as `NonEmpty<Ref>` with the first element guaranteed present. [`lang.spec-ir.dependency`](lang.md#lang.spec-ir.dependency) uses it to reject rules that resolve to no references. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [entryLine](../../src/spec-ir.ts#L413) (file: string, node: Node) → Entry | null <!-- internal -->
      <a id="lang.spec-ir.entryLine"></a><br>Collects the `refs` from all children of a parsed `entry` line into a single list and returns `null` when there are none. Otherwise it builds an `entry` record holding those refs plus source location from [`lang.spec-ir.at`](lang.md#lang.spec-ir.at), for use by [`lang.spec-ir.compileRules`](lang.md#lang.spec-ir.compileRules). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [lang.spec-ir.at](lang.md#lang.spec-ir.at)
    - fn [noCycles](../../src/spec-ir.ts#L420) (file: string, node: Node, under: Ref | null) → NoCycles <!-- internal -->
      <a id="lang.spec-ir.noCycles"></a><br>Builds a `no-cycles` rule object scoped to an optional `under` reference, attaching source location via [`lang.spec-ir.at`](lang.md#lang.spec-ir.at) with a label that falls back to `*` when no target is given. Used by [`lang.spec-ir.compileRules`](lang.md#lang.spec-ir.compileRules) to turn parsed rule sections into IR. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [lang.spec-ir.at](lang.md#lang.spec-ir.at)
    - fn [exportsRule](../../src/spec-ir.ts#L424) (file: string, node: Node, module: Ref) → ExportsRule | null <!-- internal -->
      <a id="lang.spec-ir.exportsRule"></a><br>Builds an `exports` rule record from a parsed line's refs, bailing out with null when there are none; it sorts the ref texts into a readable label and attaches location via [`lang.spec-ir.at`](lang.md#lang.spec-ir.at). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [lang.spec-ir.at](lang.md#lang.spec-ir.at)
    - fn [compileFlow](../../src/spec-ir.ts#L431) (file: string, section: Section, planned: Planned[], diagnostics: Diagnostic[]) → Flow <!-- internal -->
      <a id="lang.spec-ir.compileFlow"></a><br>Turns a spec section into a flow record, taking the first business/technical kind, triggers via [`lang.spec-ir.triggerItem`](lang.md#lang.spec-ir.triggerItem) and steps via [`lang.spec-ir.flowNode`](lang.md#lang.spec-ir.flowNode). Planned declarations go into the shared list via [`lang.spec-ir.plannedDecl`](lang.md#lang.spec-ir.plannedDecl). _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.spec-ir.plannedDecl](lang.md#lang.spec-ir.plannedDecl), [lang.spec-ir.triggerItem](lang.md#lang.spec-ir.triggerItem), [lang.spec-ir.flowItems](lang.md#lang.spec-ir.flowItems), [lang.spec-ir.flowNode](lang.md#lang.spec-ir.flowNode), [lang.spec-ir.emptyParallel](lang.md#lang.spec-ir.emptyParallel)
    - fn [emptyParallel](../../src/spec-ir.ts#L469) (file: string, node: Node, diagnostics: Diagnostic[]) → void <!-- internal -->
      <a id="lang.spec-ir.emptyParallel"></a><br>K009: a `parallel` with no nested `step`, at any depth.
      - calls [base.diag.diagnostic](base.md#base.diag.diagnostic)
    - fn [flowNode](../../src/spec-ir.ts#L476) (file: string, flow: string, node: Node) → FlowItem[] <!-- internal -->
      <a id="lang.spec-ir.flowNode"></a><br>Converts one parsed spec node into flow items (step, when, then, invariant/reads/emits, calls, question, test) with source location via [`lang.spec-ir.flowAt`](lang.md#lang.spec-ir.flowAt), recursing through [`lang.spec-ir.flowItems`](lang.md#lang.spec-ir.flowItems). Nodes lacking required data are flattened into their children or dropped. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [lang.spec-ir.flowItems](lang.md#lang.spec-ir.flowItems), [lang.spec-ir.flowAt](lang.md#lang.spec-ir.flowAt), [lang.parser.scheduleText](lang.md#lang.parser.scheduleText)
    - fn [flowItems](../../src/spec-ir.ts#L534) (file: string, flow: string, nodes: readonly Node[]) → FlowItem[] <!-- internal -->
      <a id="lang.spec-ir.flowItems"></a><br>Converts a list of spec nodes into one flat list of flow items by running each node through [`lang.spec-ir.flowNode`](lang.md#lang.spec-ir.flowNode) and concatenating the results. Used recursively for nested nodes, triggers and whole flows. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [lang.spec-ir.flowNode](lang.md#lang.spec-ir.flowNode)
    - fn [triggerItem](../../src/spec-ir.ts#L538) (file: string, flow: string, node: Node) → Trigger | null <!-- internal -->
      <a id="lang.spec-ir.triggerItem"></a><br>Builds a trigger flow item from a parsed node whose first reference is the target, returning null when it has none; children are compiled via [`lang.spec-ir.flowItems`](lang.md#lang.spec-ir.flowItems) and location attached via [`lang.spec-ir.flowAt`](lang.md#lang.spec-ir.flowAt). _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [lang.parser.isTriggerKind](lang.md#lang.parser.isTriggerKind), [lang.spec-ir.flowItems](lang.md#lang.spec-ir.flowItems), [lang.spec-ir.flowAt](lang.md#lang.spec-ir.flowAt)
    - fn [plannedDeclKind](../../src/spec-ir.ts#L546) (value: string) → Planned["decl"] | null <!-- internal -->
      <a id="lang.spec-ir.plannedDeclKind"></a><br>Returns the input unchanged when it is one of the four strings "fn", "module", "type" or "event", otherwise yields null. [`lang.spec-ir.plannedDecl`](lang.md#lang.spec-ir.plannedDecl) uses it to narrow a raw declaration keyword into a typed `Planned["decl"]` value. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [plannedDecl](../../src/spec-ir.ts#L551) (file: string, node: Node) → Planned | null <!-- internal -->
      <a id="lang.spec-ir.plannedDecl"></a><br>Converts a parsed spec node into a planned declaration record when it has an id and a label that [`lang.spec-ir.plannedDeclKind`](lang.md#lang.spec-ir.plannedDeclKind) recognizes, otherwise returns null. The record carries the id, optional signature text, and location plus rendered meaning from [`lang.spec-ir.at`](lang.md#lang.spec-ir.at) and… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [lang.spec-ir.plannedDeclKind](lang.md#lang.spec-ir.plannedDeclKind), [lang.spec-ir.at](lang.md#lang.spec-ir.at), [lang.parser.renderMeaning](lang.md#lang.parser.renderMeaning)
    - fn [compileWires](../../src/spec-ir.ts#L557) (file: string, section: Section, wires: Wire[], diagnostics: Diagnostic[]) → void <!-- internal -->
      <a id="lang.spec-ir.compileWires"></a><br>Walks a section's nodes via [`lang.ir.sectionNodes`](lang.md#lang.ir.sectionNodes), turning each "wire" node and its "wire-dep" children (with "compose" and "when" options parsed by [`lang.spec-ir.wireWhen`](lang.md#lang.spec-ir.wireWhen)) into Wire records. Each record is tagged with source location and rendered text through… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.spec-ir.at](lang.md#lang.spec-ir.at), [lang.parser.renderMeaning](lang.md#lang.parser.renderMeaning), [lang.spec-ir.wireWhen](lang.md#lang.spec-ir.wireWhen)
    - fn [wireWhen](../../src/spec-ir.ts#L583) (file: string, option: Node, diagnostics: Diagnostic[]) → WireWhen | null <!-- internal -->
      <a id="lang.spec-ir.wireWhen"></a><br>`env.NAME = value` with a target. A condition of another shape is K005 and is not stored.
      - calls [lang.spec-ir.wireConditionText](lang.md#lang.spec-ir.wireConditionText), [base.diag.diagnostic](base.md#base.diag.diagnostic), [lang.spec-ir.at](lang.md#lang.spec-ir.at), [lang.parser.renderMeaning](lang.md#lang.parser.renderMeaning)
    - fn [wireConditionText](../../src/spec-ir.ts#L601) (node: Node) → string <!-- internal -->
      <a id="lang.spec-ir.wireConditionText"></a><br>Condition text of `- when <condition> → <id>`, matching the bytes the wiring check compares: tokens between the keyword and the arrow, joined only where they do not already touch. `env.DB = a,b` stays `a,b`.
    - fn [at](../../src/spec-ir.ts#L614) (file: string, node: Node, text: string) → Located <!-- internal -->
      <a id="lang.spec-ir.at"></a><br>Builds a `Located` record that pairs a spec file path, the span of a parsed `Node`, a text snippet, and the node itself. Shared helper the spec-IR rule builders use to attach source positions to diagnostics and rules. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [flowAt](../../src/spec-ir.ts#L618) (file: string, flow: string, node: Node) → Located <!-- internal -->
      <a id="lang.spec-ir.flowAt"></a><br>Builds a `Located` entry for a node inside a named flow by delegating to [`lang.spec-ir.at`](lang.md#lang.spec-ir.at) with a text key combining the flow name, the node kind, and the node's rendered meaning from [`lang.parser.renderMeaning`](lang.md#lang.parser.renderMeaning). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [lang.spec-ir.at](lang.md#lang.spec-ir.at), [lang.parser.renderMeaning](lang.md#lang.parser.renderMeaning)
    - type [PlannedDeclaration](../../src/spec-ir.ts#L625)
      <a id="lang.spec-ir.PlannedDeclaration"></a><br>A `planned` line as hover, explain and spec-to-code read it: its declared kind (`fn` without one), contract and place.
    - fn [plannedDeclaration](../../src/spec-ir.ts#L639) (docs: readonly Document[], id: string) → PlannedDeclaration | null
      <a id="lang.spec-ir.plannedDeclaration"></a><br>The first `planned` item that declares `id`, in document order and at any depth of any section, whatever its label: `SpecIR.planned` keeps only the valid ones of flows.
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes)
    - fn [flowsUsing](../../src/spec-ir.ts#L660) (spec: SpecIR, id: string) → string[]
      <a id="lang.spec-ir.flowsUsing"></a><br>The names of the flows whose steps or trigger name `id`, sorted.
      - calls [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow)
