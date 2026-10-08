<!-- keylang:generated — не редагувати, `keylang map` -->

[README](README.md) · modules: [brief](#base.brief) · [config](#base.config) · [diag](#base.diag) · [external-ids](#base.external-ids) · [adapter](#base.adapter) · [bindings](#base.bindings) · [cartridges](#base.cartridges) · [magento](#base.magento) · [python-web](#base.python-web) · [sfcc](#base.sfcc) · [glob](#base.glob) · [languages](#base.languages) · [safe-write](#base.safe-write) · [span](#base.span)

# map

- base
  <a id="base"></a><br>Dependency-free foundations shared by the rest of keylang: [`base.config`](base.md#base.config), [`base.glob`](base.md#base.glob), [`base.span`](base.md#base.span), [`base.diag`](base.md#base.diag), [`base.external-ids`](base.md#base.external-ids), [`base.brief`](base.md#base.brief) and [`base.safe-write`](base.md#base.safe-write). Rules forbid it from loading [`external.web-tree-sitter`](external.md#external.web-tree-sitter). _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
  - module [brief](../../src/brief.ts#L1)
    <a id="base.brief"></a><br>Plain-language text → a brief: its first paragraph cut to two sentences. Doc comments (once an extractor strips their syntax) and model answers go through the same rule, so a brief reads the same whatever wrote it.
    - fn [briefOf](../../src/brief.ts#L16) (text: string) → string | null
      <a id="base.brief.briefOf"></a><br>The first paragraph of `text` with whitespace collapsed, cut to its first two sentences and to about `BRIEF_MAX` characters; null when nothing is left. A sentence ends at `.`, `!` or `?` (closing quotes and brackets after it included) before whitespace and an uppercase letter…
      - calls [base.brief.capText](base.md#base.brief.capText), [base.brief.firstSentences](base.md#base.brief.firstSentences)
    - fn [firstSentence](../../src/brief.ts#L26) (text: string) → string | null
      <a id="base.brief.firstSentence"></a><br>The first sentence of the first paragraph of `text`, by the rule of `briefOf`; null when nothing is left.
      - calls [base.brief.briefOf](base.md#base.brief.briefOf), [base.brief.firstSentences](base.md#base.brief.firstSentences)
    - fn [firstSentences](../../src/brief.ts#L33) (text: string, count: number) → string <!-- internal -->
      <a id="base.brief.firstSentences"></a><br>Scans the input with the `SENTENCE_END` regex and returns the prefix of the text ending at the `count`-th sentence terminator, or the whole text unchanged if fewer terminators are found; it is used only by [`base.brief.briefOf`](base.md#base.brief.briefOf) to trim a description down to its opening… _(llm · claude · 2026-10-04 · stale)_
    - fn [readmeBrief](../../src/brief.ts#L51) (markdown: string) → string | null
      <a id="base.brief.readmeBrief"></a><br>The brief of a README: its first paragraph of prose that reads as a sentence, through `briefOf`. Headings, fenced and indented code, HTML, lists, quotes and tables are passed over; images and badges are dropped, links keep their text, emphasis its words.
      - calls [base.brief.proseParagraphs](base.md#base.brief.proseParagraphs), [base.brief.plainInline](base.md#base.brief.plainInline), [base.brief.words](base.md#base.brief.words), [base.brief.briefOf](base.md#base.brief.briefOf)
    - fn [proseParagraphs](../../src/brief.ts#L60) (markdown: string) → string[] <!-- internal -->
      <a id="base.brief.proseParagraphs"></a><br>Paragraphs of plain text, in order: blocks of non-blank lines that are not another kind of Markdown block.
    - fn [plainInline](../../src/brief.ts#L112) (text: string) → string <!-- internal -->
      <a id="base.brief.plainInline"></a><br>The words of an inline Markdown text: images and badges dropped, links as their text, no tags or emphasis marks.
    - fn [words](../../src/brief.ts#L124) (text: string) → number <!-- internal -->
      <a id="base.brief.words"></a>
    - fn [capText](../../src/brief.ts#L129) (text: string, max: number) → string
      <a id="base.brief.capText"></a><br>At most `max` code points: cut at the last space before the limit, then `…`.
  - module [config](../../src/config.ts#L1)
    <a id="base.config"></a><br>`keylang.json`: what to index, how files map to layers, where specs live. Without a config file the layout is guessed from the directory tree (`keylang init` writes that guess down so it can be edited).
    - node [external.node](external.md#external.node)
    - adapter [base.adapter](base.md#base.adapter)
    - glob [base.glob](base.md#base.glob)
    - languages [base.languages](base.md#base.languages)
    - type [RuleFormat](../../src/config.ts#L16) = 1 | 2
      <a id="base.config.RuleFormat"></a><br>`1` keeps depth-sum priority. `2` is deny-overrides for incomparable rules.
    - type [StaticMode](../../src/config.ts#L23) = "behavior" | "shape"
      <a id="base.config.StaticMode"></a><br>Which call edges prove a static path. `shape`: calls written in the code. `behavior`: also the default of a hook and values resolved callers inject for it — what runs, not only what is written.
    - type [StaticSource](../../src/config.ts#L28) = "flag" | "config"
      <a id="base.config.StaticSource"></a><br>Who chose the static mode. Absent when nobody set it and the mode is `behavior`.
    - fn [resolveStatic](../../src/config.ts#L31) (flag: StaticMode | undefined, configured: StaticMode | undefined) → { mode: StaticMode; setBy?: StaticSource }
      <a id="base.config.resolveStatic"></a><br>Flag, then `check.static`, then `behavior`.
    - type [Config](../../src/config.ts#L37)
      <a id="base.config.Config"></a><br>The resolved repository settings loaded from `keylang.json`: root, rules edition, language, module mode, layer globs, excluded/outside/assumed paths and checks. It also holds the agent, voice, ghost-text, clip and explanation options. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
    - fn [isAgent](../../src/config.ts#L120) (value: string) → boolean
      <a id="base.config.isAgent"></a><br>`agent` as `keylang.json`, `KEYLANG_AGENT` and `agents.json` "use" accept it.
    - fn [isCliAgent](../../src/config.ts#L125) (agent: string | null) → boolean
      <a id="base.config.isCliAgent"></a><br>The agent runs through an agent CLI (`cli:claude`), not an API.
    - fn [isReservedLayerName](../../src/config.ts#L152) (name: string) → boolean
      <a id="base.config.isReservedLayerName"></a><br>A reserved name, or `README` in any case: the explained map writes a layer as `<layer>.md` beside its start page `README.md`, and on a case-insensitive file system `readme.md` is that file too.
    - fn [skipDir](../../src/config.ts#L186) (abs: string, name: string) → boolean <!-- internal -->
      <a id="base.config.skipDir"></a><br>A directory we never descend into: hidden, build output, or a nested repository.
    - type [RawConfig](../../src/config.ts#L190)
      <a id="base.config.RawConfig"></a><br>Describes the unvalidated shape of the project configuration file, with every field optional: rule format, languages, module granularity, layer globs, excludes, check modes, and settings for agent, ghost, assistant, voice and explain. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
    - fn [loadConfig](../../src/config.ts#L211) (root: string) → Config
      <a id="base.config.loadConfig"></a><br>Load `<root>/keylang.json`, or guess a config for `root`.
      - calls [base.config.parseConfig](base.md#base.config.parseConfig), [base.config.detectLanguages](base.md#base.config.detectLanguages), [base.config.guessLayers](base.md#base.config.guessLayers), [base.config.defaultModule](base.md#base.config.defaultModule)
    - fn [defaultModule](../../src/config.ts#L253) (languages: readonly Language[]) → Config["module"] <!-- internal -->
      <a id="base.config.defaultModule"></a><br>The languages' own module granularity when they agree; a file otherwise.
    - fn [withoutBom](../../src/config.ts#L264) (text: string) → string
      <a id="base.config.withoutBom"></a><br>`text` without a leading U+FEFF: a JSON file saved with a UTF-8 BOM (PowerShell 5.1 `-Encoding UTF8`, old Notepad, Visual Studio) is the same JSON, as Node and npm read a `package.json`, and as the `.md` parser, test reports and trace already read theirs.
    - fn [parseConfig](../../src/config.ts#L269) (file: string, text: string) → RawConfig
      <a id="base.config.parseConfig"></a><br>Parse and validate `keylang.json`. Errors name the file and the field.
      - calls [base.config.withoutBom](base.md#base.config.withoutBom), [base.glob.globToRegExp](base.md#base.glob.globToRegExp), [base.config.isObject](base.md#base.config.isObject), [base.config.acceptFormat](base.md#base.config.acceptFormat), [base.languages.isLanguage](base.md#base.languages.isLanguage), [base.config.layerName](base.md#base.config.layerName), [base.config.isReservedLayerName](base.md#base.config.isReservedLayerName), [base.config.reservedReason](base.md#base.config.reservedReason), [base.config.isAgent](base.md#base.config.isAgent)
    - fn [isObject](../../src/config.ts#L428) (value: unknown) → value is Record<string, unknown> <!-- internal -->
      <a id="base.config.isObject"></a><br>Type guard that returns true only when the value is a non-null object and not an array, so callers can safely index it as a string-keyed record; [`base.config.assertFormatOnly`](base.md#base.config.assertFormatOnly), [`base.config.parseConfig`](base.md#base.config.parseConfig), and [`base.config.withLayers`](base.md#base.config.withLayers) use it to validate parsed config shapes… _(llm · claude · 2026-10-04)_
    - fn [acceptFormat](../../src/config.ts#L433) (file: string, got: unknown) → RuleFormat
      <a id="base.config.acceptFormat"></a><br>`format` when it is present: a positive integer this keylang can read.
    - fn [assertFormatOnly](../../src/config.ts#L447) (file: string, text: string) → void
      <a id="base.config.assertFormatOnly"></a><br>`fmt` and `parse` read nothing of the config except `format`. Invalid JSON or a non-object root cannot tell them the edition, so they stop.
      - calls [base.config.withoutBom](base.md#base.config.withoutBom), [base.config.isObject](base.md#base.config.isObject), [base.config.acceptFormat](base.md#base.config.acceptFormat)
    - fn [configToJson](../../src/config.ts#L459) (c: Config) → string
      <a id="base.config.configToJson"></a><br>The config as it would be written by `keylang init`.
    - fn [withLayers](../../src/config.ts#L480) (file: string, text: string, layers: Readonly<Record<string, readonly string[]>>) → { text: string } | { error: string }
      <a id="base.config.withLayers"></a><br>`text` (a `keylang.json` as written or being edited) with only its `layers` replaced: every other field stays, unknown ones included, in its order; a missing `layers` is appended. Whitespace is not kept (the result is 2-space JSON).
      - calls [base.config.withoutBom](base.md#base.config.withoutBom), [base.config.isObject](base.md#base.config.isObject)
    - fn [sourceFiles](../../src/config.ts#L494) (c: Config) → string[]
      <a id="base.config.sourceFiles"></a><br>All indexable source files under root, POSIX paths relative to root, sorted.
      - calls [base.config.classifySources](base.md#base.config.classifySources)
    - fn [sourceTree](../../src/config.ts#L502) (c: Config) → { files: string[]; unreadable: { dir: string; reason: string }[] }
      <a id="base.config.sourceTree"></a><br>The indexable source files and the directories that could not be listed (no permission): their files are unknown, which is a hole, not an absence.
      - calls [base.config.classifySources](base.md#base.config.classifySources)
    - type [SourceClasses](../../src/config.ts#L508)
      <a id="base.config.SourceClasses"></a><br>Every source file of the configured languages by what keylang does with it; paths in walk order.
    - fn [classifySources](../../src/config.ts#L522) (c: Config) → SourceClasses
      <a id="base.config.classifySources"></a><br>The source files by class, from one walk of the tree.
      - calls [base.config.walkSources](base.md#base.config.walkSources), [base.config.sourceClass](base.md#base.config.sourceClass)
    - fn [sourceClass](../../src/config.ts#L536) (rel: string, c: Pick<Config, "exclude" | "outside" | "assume">) → "analysed" | "excluded" | "outside" | "assumed" | null
      <a id="base.config.sourceClass"></a><br>What keylang does with a source file; null when the built-in list leaves it out (tests, declaration files). The built-in list wins over `assume`, `assume` over `outside`, and `outside` over `exclude`.
      - calls [base.config.matchesAny](base.md#base.config.matchesAny)
    - fn [isAnalysed](../../src/config.ts#L544) (rel: string, c: Pick<Config, "exclude" | "outside" | "assume">) → boolean
      <a id="base.config.isAnalysed"></a><br>A source file keylang reads: not left out by the built-in list, `assume`, `exclude` or `outside`.
      - calls [base.config.sourceClass](base.md#base.config.sourceClass)
    - fn [isAssumed](../../src/config.ts#L549) (rel: string, c: Pick<Config, "assume">) → boolean
      <a id="base.config.isAssumed"></a><br>A path `assume` names: keylang neither reads nor requires it.
      - calls [base.config.matchesAny](base.md#base.config.matchesAny)
    - fn [isOutside](../../src/config.ts#L553) (rel: string, outside: readonly string[]) → boolean
      <a id="base.config.isOutside"></a><br>Reports whether a repo-relative path matches any of the configured "outside" glob patterns by delegating to [`base.config.matchesAny`](base.md#base.config.matchesAny); used by [`map.graph.placeFile`](map.md#map.graph.placeFile) and [`map.graph.notIndexed`](map.md#map.graph.notIndexed) to exclude files. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [base.config.matchesAny](base.md#base.config.matchesAny)
    - fn [matchesAny](../../src/config.ts#L557) (rel: string, globs: readonly string[]) → boolean <!-- internal -->
      <a id="base.config.matchesAny"></a>
      - calls [base.glob.firstMatchingGlob](base.md#base.glob.firstMatchingGlob)
    - fn [layerGlobWarnings](../../src/config.ts#L569) (c: Pick<Config, "layers">, files: readonly string[]) → string[]
      <a id="base.config.layerGlobWarnings"></a><br>Layer globs of keylang.json that likely do not say what was meant: files the globs of two layers both match — the layer listed first takes them — and a glob that matches no source file. `files` are the files layers place: read or excluded. Warnings, not errors: the layout works…
      - calls [base.glob.matchesGlob](base.md#base.glob.matchesGlob)
    - fn [walkSources](../../src/config.ts#L614) (c: Config, unreadable: { dir: string; reason: string }[]) → string[] <!-- internal -->
      <a id="base.config.walkSources"></a><br>Source files of the configured languages under the root, depth first with names in code-unit order; the spec directory, hidden and build directories and nested repositories are skipped. A subdirectory that cannot be listed goes to `unreadable`; the root itself is an I/O error.
      - calls [base.config.skipDir](base.md#base.config.skipDir), [base.languages.languageOf](base.md#base.languages.languageOf)
    - fn [evidenceFiles](../../src/config.ts#L648) (c: Config, field: "tests" | "trace") → string[] | null
      <a id="base.config.evidenceFiles"></a><br>Files named by `check.tests` / `check.trace`: a plain path (which must exist) or a glob (which may match nothing yet, before the first test run).
      - calls [base.glob.globPrefix](base.md#base.glob.globPrefix), [base.config.toPosix](base.md#base.config.toPosix), [base.glob.matchesGlob](base.md#base.glob.matchesGlob)
    - fn [isExcluded](../../src/config.ts#L670) (rel: string, extra: readonly string[]) → boolean
      <a id="base.config.isExcluded"></a><br>Reports whether a relative path matches the built-in default exclude globs or any caller-supplied extra globs, via [`base.config.matchesAny`](base.md#base.config.matchesAny). Used by [`base.config.hasSource`](base.md#base.config.hasSource), [`base.config.hasRootFiles`](base.md#base.config.hasRootFiles) and [`map.graph.notIndexed`](map.md#map.graph.notIndexed). _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [base.config.matchesAny](base.md#base.config.matchesAny)
    - fn [toPosix](../../src/config.ts#L674) (p: string) → string
      <a id="base.config.toPosix"></a><br>Replaces every backslash in a path string with a forward slash, normalizing Windows-style separators into the POSIX form used for relative paths across the codebase; it is a pure one-liner with no filesystem access, so the "2 dynamic-call" entries keylang could not resolve are… _(llm · claude · 2026-10-04)_
    - fn [specPath](../../src/config.ts#L685) (dir: string, rest: string) → string
      <a id="base.config.specPath"></a><br>`rest` under the spec directory `dir`, relative to the root and POSIX, as the analysis names its documents: `keylang/features/f1.md`, or plain `features/f1.md` when `dir` is `.` (the root). Every path keylang builds under `dir` goes through here: `./features/f1.md` would match…
    - fn [detectLanguages](../../src/config.ts#L689) (root: string) → Language[] <!-- internal -->
      <a id="base.config.detectLanguages"></a><br>Walks the directory tree under the given root up to four levels deep, skipping directories that [`base.config.skipDir`](base.md#base.config.skipDir) rejects, and collects every distinct language that [`base.languages.languageOf`](base.md#base.languages.languageOf) maps a file name to (ignoring `.d.ts` files), returning them as a sorted array so… _(llm · claude · 2026-10-04 · stale)_
      - calls [base.config.skipDir](base.md#base.config.skipDir), [base.languages.languageOf](base.md#base.languages.languageOf)
    - fn [guessLayers](../../src/config.ts#L716) (root: string, exclude: readonly string[]) → Map<string, string[]>
      <a id="base.config.guessLayers"></a><br>Zero-config layering: the source root is `src/` (or `lib/`) when present, else the one Python package in the repository root when it is the only layer candidate there and has subdirectories with code (`app/` with `app/__init__.py`), else the repository root. Each directory…
      - calls [base.config.guessLayout](base.md#base.config.guessLayout)
    - fn [guessLayout](../../src/config.ts#L725) (root: string, exclude: readonly string[]) → { layers: Map<string, string[]>; notes: string[] }
      <a id="base.config.guessLayout"></a><br>The guessed layers, and a note for every directory whose layer name had to change: a reserved name (`src/external/` → `external_`) or one that another directory already sanitizes to (`2fa` and `_2fa` → `_2fa`, `_2fa_2`).
      - calls [base.config.sourceRoot](base.md#base.config.sourceRoot), [base.config.freeLayerName](base.md#base.config.freeLayerName), [base.config.isReservedLayerName](base.md#base.config.isReservedLayerName), [base.config.reservedReason](base.md#base.config.reservedReason), [base.config.hasRootFiles](base.md#base.config.hasRootFiles), [base.config.hasSource](base.md#base.config.hasSource), [base.config.layerDirs](base.md#base.config.layerDirs), [base.config.layerName](base.md#base.config.layerName)
    - fn [sourceRoot](../../src/config.ts#L756) (root: string, exclude: readonly string[]) → string <!-- internal -->
      <a id="base.config.sourceRoot"></a><br>`src` or `lib`; else the one directory the root `composer.json` maps its PSR-4 namespaces to (Laravel's `app/`); else the single layer candidate of the repository root when it is a Python package (`__init__.py`) whose subdirectories hold code — one layer for the whole…
      - calls [base.config.composerSourceRoot](base.md#base.config.composerSourceRoot), [base.config.layerDirs](base.md#base.config.layerDirs)
    - fn [composerSourceRoot](../../src/config.ts#L768) (root: string) → string | null <!-- internal -->
      <a id="base.config.composerSourceRoot"></a><br>The single directory of the root `composer.json`'s `autoload.psr-4`, when it maps every namespace there; null otherwise.
      - calls [base.config.withoutBom](base.md#base.config.withoutBom), [base.config.toPosix](base.md#base.config.toPosix)
    - fn [layerDirs](../../src/config.ts#L791) (root: string, dir: string, exclude: readonly string[]) → { name: string; rel: string }[] <!-- internal -->
      <a id="base.config.layerDirs"></a><br>The directories directly under `dir` (repository-relative, `""` for the root) that become layers.
      - calls [base.config.skipDir](base.md#base.config.skipDir), [base.glob.matchesGlob](base.md#base.glob.matchesGlob), [base.config.hasSource](base.md#base.config.hasSource)
    - fn [freeLayerName](../../src/config.ts#L806) (wanted: string, taken: ReadonlyMap<string, unknown>) → string <!-- internal -->
      <a id="base.config.freeLayerName"></a><br>`wanted`, or the first free variant: a reserved name gets `_`, a taken one a number (`_2fa_2`).
      - calls [base.config.isReservedLayerName](base.md#base.config.isReservedLayerName)
    - fn [reservedReason](../../src/config.ts#L815) (name: string) → string <!-- internal -->
      <a id="base.config.reservedReason"></a><br>Produces the human-readable explanation of why a given layer name cannot be used: it returns a specific message for `external`, `unassigned`, and the `OUTSIDE_LAYER` constant, and otherwise a generic message saying the name is a top-of-map keyword. [`base.config.guessLayout`](base.md#base.config.guessLayout) and… _(llm · claude · 2026-10-04 · stale)_
    - fn [hasRootFiles](../../src/config.ts#L823) (root: string, dir: string, exclude: readonly string[]) → boolean <!-- internal -->
      <a id="base.config.hasRootFiles"></a><br>Reports whether a directory directly holds at least one source file whose language [`base.languages.languageOf`](base.md#base.languages.languageOf) recognizes and that [`base.config.isExcluded`](base.md#base.config.isExcluded) does not filter out; [`base.config.guessLayout`](base.md#base.config.guessLayout) uses it. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [base.languages.languageOf](base.md#base.languages.languageOf), [base.config.isExcluded](base.md#base.config.isExcluded)
    - fn [hasSource](../../src/config.ts#L827) (absDir: string, rel: string, exclude: readonly string[]) → boolean <!-- internal -->
      <a id="base.config.hasSource"></a><br>Recursively walks a directory and returns true as soon as it finds a file with a recognized language ([`base.languages.languageOf`](base.md#base.languages.languageOf)) that is not excluded ([`base.config.isExcluded`](base.md#base.config.isExcluded)). Subdirectories rejected by [`base.config.skipDir`](base.md#base.config.skipDir) are not searched. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [base.config.skipDir](base.md#base.config.skipDir), [base.languages.languageOf](base.md#base.languages.languageOf), [base.config.isExcluded](base.md#base.config.isExcluded)
    - fn [isIdSegment](../../src/config.ts#L840) (s: string) → boolean <!-- internal -->
      <a id="base.config.isIdSegment"></a><br>Same predicate as `isSegment`. Duplicated so `base` does not import `lang`.
    - fn [encodeBracketSegment](../../src/config.ts#L868) (name: string) → string <!-- internal -->
      <a id="base.config.encodeBracketSegment"></a><br>A path segment that is not an ID and contains `()[]`, written so `decodeLayerName` restores it. A Next route form (`(shop)`, `[id]`, `[...slug]`, `[[...slug]]`) gets a readable prefix (`$g-shop`, `$p-id`, `$all-slug`, `$opt-slug`); any other name keeps its letters and writes…
    - fn [decodeLayerName](../../src/config.ts#L889) (segment: string) → string
      <a id="base.config.decodeLayerName"></a><br>Inverse of the bracket encoding in `layerName`. A segment without a route prefix or `$HH` is unchanged.
    - fn [layerName](../../src/config.ts#L913) (written: string) → string
      <a id="base.config.layerName"></a><br>Make a directory or file name a valid ID segment, in Unicode NFC. An existing segment is kept.
      - calls [base.config.isIdSegment](base.md#base.config.isIdSegment), [base.config.encodeBracketSegment](base.md#base.config.encodeBracketSegment)
  - module [diag](../../src/diag.ts#L1)
    <a id="base.diag"></a><br>Diagnostics with stable codes, and the text of a thrown error.
    - span [base.span](base.md#base.span)
    - type [Code](../../src/diag.ts#L5)
      <a id="base.diag.Code"></a><br>A string union of every diagnostic code keylang can emit, grouped by stage: parsing/resolution (K001–K008), rules (K101–K107), flows (K201–K203), and wiring (K301–K302). Each member carries a doc comment stating what it signals and whether it is a warning. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - type [Severity](../../src/diag.ts#L56) = "error" | "warning"
      <a id="base.diag.Severity"></a><br>A string-literal union naming the two levels a diagnostic can carry, `"error"` or `"warning"`, with no runtime value of its own; the input shows no callers or related types, so where it is consumed is not visible here. _(llm · claude · 2026-10-04)_
    - type [K005Reason](../../src/diag.ts#L59) = "arguments" | "id" | "link" | "quote" | "layer" | "scope"
      <a id="base.diag.K005Reason"></a><br>Why a K005 is malformed. Other codes do not carry this.
    - fn [severityOf](../../src/diag.ts#L61) (code: Code) → Severity
      <a id="base.diag.severityOf"></a><br>Maps a diagnostic code to its severity: a fixed set of six codes (K006, K008, K103, K106, K202, K203) yields "warning", every other code yields "error". Used by [`base.diag.diagnostic`](base.md#base.diag.diagnostic) when constructing a diagnostic record. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Diagnostic](../../src/diag.ts#L65)
      <a id="base.diag.Diagnostic"></a><br>The shape of a single reported finding: a required code, severity, message, file and span, plus optional fields that only certain codes populate — `target` (K001, the dangling reference's ID), `criterion`/`area`/`specHash` (K103 warnings, which carry their own rule and hash… _(llm · claude · 2026-10-04)_
    - fn [diagnostic](../../src/diag.ts#L95) (code: Exclude<Code, "K005">, file: string, span: Span, message: string, target?: string) → Diagnostic
      <a id="base.diag.diagnostic"></a><br>Builds a `Diagnostic` record, deriving its severity from the code via [`base.diag.severityOf`](base.md#base.diag.severityOf). The optional fifth argument becomes `reason` for K005 (only if it matches a known reason) and `target` for any other code. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [base.diag.severityOf](base.md#base.diag.severityOf)
    - fn [isError](../../src/diag.ts#L106) (d: Diagnostic) → boolean
      <a id="base.diag.isError"></a><br>A tiny predicate that returns true only when a diagnostic's `severity` field equals the string `"error"`, so the result and status layers ([`features.check-results.checkResults`](features.md#features.check-results.checkResults), [`features.feature-status.featureStatus`](features.md#features.feature-status.featureStatus), `operations.operations.runParse`… _(llm · claude · 2026-10-04)_
    - fn [formatDiagnostic](../../src/diag.ts#L111) (d: Diagnostic) → string
      <a id="base.diag.formatDiagnostic"></a><br>`file:line:col: CODE message`
    - fn [compareDiagnostics](../../src/diag.ts#L116) (a: Diagnostic, b: Diagnostic) → number
      <a id="base.diag.compareDiagnostics"></a><br>Stable order: file, position, code.
    - fn [errorText](../../src/diag.ts#L126) (error: unknown) → string
      <a id="base.diag.errorText"></a><br>The text of a thrown value: an `Error`'s message, anything else as a string.
  - module [external-ids](../../src/external-ids.ts#L1)
    <a id="base.external-ids"></a><br>IDs of external packages: `external.<segment>`, one ID space for every package name a repository imports or declares. The map, the rules and the language server all name a package by this ID, so they share this module.
    - config [base.config](base.md#base.config)
    - fn [externalSegment](../../src/external-ids.ts#L10) (pkg: string) → string
      <a id="base.external-ids.externalSegment"></a><br>ID segment of a package: `@scope/pkg` → `scope-pkg`, `lodash.get` → `lodash_get`.
      - calls [base.config.layerName](base.md#base.config.layerName)
    - fn [assignExternalIds](../../src/external-ids.ts#L20) (names: Iterable<string>) → { ids: Map<string, string>; warnings: string[] }
      <a id="base.external-ids.assignExternalIds"></a><br>Module IDs of package names. Two names that sanitize to one segment (`@scope/pkg` and `scope-pkg`) get two IDs: the one whose name is the segment keeps it, the others get `-2`, `-3`… in name order, with a warning.
      - calls [base.external-ids.externalSegment](base.md#base.external-ids.externalSegment)
    - fn [externalPackageId](../../src/external-ids.ts#L44) (id: string) → string | null
      <a id="base.external-ids.externalPackageId"></a><br>The package part of an external ID (`external.pg.Pool` → `external.pg`); null for any other ID.
  - module [adapter](../../src/frameworks/adapter.ts#L1)
    <a id="base.adapter"></a><br>Framework adapters (ADR 0022): beside the language frontends, an adapter reads the configuration a framework executes (`etc/di.xml` of Magento) and gives the graph facts the code does not write — bindings of an interface to a class, constructor arguments, interceptors. The…
    - magento [base.magento](base.md#base.magento)
    - python-web [base.python-web](base.md#base.python-web)
    - sfcc [base.sfcc](base.md#base.sfcc)
    - type [TypeName](../../src/frameworks/adapter.ts#L21)
      <a id="base.adapter.TypeName"></a><br>A type the configuration names: a qualified name of a language whose declarations have one (PHP `Magento\Sales\Api\OrderManagementInterface`, without the leading `\`), or a name declared at the top of `file`.
    - type [ConfigAt](../../src/frameworks/adapter.ts#L27)
      <a id="base.adapter.ConfigAt"></a><br>Where in the config file a fact is written: 1-based.
    - type [BindingFact](../../src/frameworks/adapter.ts#L33) extends ConfigAt
      <a id="base.adapter.BindingFact"></a><br>`I → C`: a value typed `from` is an instance of `to` (Magento `<preference>`).
    - type [ArgumentFact](../../src/frameworks/adapter.ts#L39) extends ConfigAt
      <a id="base.adapter.ArgumentFact"></a><br>The constructor parameter `param` of `type` receives an instance of `value` (Magento `<argument xsi:type="object">`).
    - type [AliasFact](../../src/frameworks/adapter.ts#L46) extends ConfigAt
      <a id="base.adapter.AliasFact"></a><br>`name` stands for the class `type` with arguments of its own (Magento `<virtualType>`).
    - type [InterceptFact](../../src/frameworks/adapter.ts#L52) extends ConfigAt
      <a id="base.adapter.InterceptFact"></a><br>A plugin `name` of the class `plugin` wraps the public methods of `target` (Magento `<plugin>`).
    - type [EntryConfigFact](../../src/frameworks/adapter.ts#L68) extends ConfigAt
      <a id="base.adapter.EntryConfigFact"></a><br>An entry point a config file names (SFCC `hooks.json` → `observer`, `steptypes.json` → `cron`): the script it runs, as the paths the framework would try in order (each probed with the usual extensions and `index`), and the fn in it, if the config names one. The snapshot places…
    - type [ConfigFacts](../../src/frameworks/adapter.ts#L76)
      <a id="base.adapter.ConfigFacts"></a><br>The facts of one config file. Depends only on its path and text, so the fact cache keeps it.
    - type [FrameworkConfig](../../src/frameworks/adapter.ts#L91)
      <a id="base.adapter.FrameworkConfig"></a><br>One config file of an active adapter, with the directory of the module that declares it.
    - type [FrameworkInput](../../src/frameworks/adapter.ts#L98)
      <a id="base.adapter.FrameworkInput"></a><br>What the graph receives from one active adapter.
    - type [FrameworkContext](../../src/frameworks/adapter.ts#L104)
      <a id="base.adapter.FrameworkContext"></a><br>What an adapter sees of the repository: the analysed source files and a reader.
    - type [FrameworkAdapter](../../src/frameworks/adapter.ts#L115)
      <a id="base.adapter.FrameworkAdapter"></a>
    - fn [activeAdapters](../../src/frameworks/adapter.ts#L140) (frameworks: readonly string[] | null, context: FrameworkContext, available: readonly FrameworkAdapter[] = FRAMEWORK_ADAPTERS) → FrameworkAdapter[]
      <a id="base.adapter.activeAdapters"></a><br>The adapters of a repository: those `frameworks` names, or with the field absent those detected. `available` lets a test add an adapter of its own.
    - fn [typeLabel](../../src/frameworks/adapter.ts#L146) (t: TypeName) → string
      <a id="base.adapter.typeLabel"></a><br>A label for a type the configuration names: its qualified name, or `file#name`.
    - fn [isConfigFacts](../../src/frameworks/adapter.ts#L151) (value: unknown) → value is ConfigFacts
      <a id="base.adapter.isConfigFacts"></a><br>Whether a cached value has the shape of `ConfigFacts`; a cache entry of another shape is parsed again.
      - calls [base.adapter.isRecord](base.md#base.adapter.isRecord), [base.adapter.every](base.md#base.adapter.every), [base.adapter.isAt](base.md#base.adapter.isAt), [base.adapter.isTypeName](base.md#base.adapter.isTypeName)
    - fn [isAt](../../src/frameworks/adapter.ts#L165) (value: unknown) → value is Record<string, unknown> <!-- internal -->
      <a id="base.adapter.isAt"></a>
      - calls [base.adapter.isRecord](base.md#base.adapter.isRecord)
    - fn [isTypeName](../../src/frameworks/adapter.ts#L169) (value: unknown) → boolean <!-- internal -->
      <a id="base.adapter.isTypeName"></a>
      - calls [base.adapter.isRecord](base.md#base.adapter.isRecord)
    - fn [every](../../src/frameworks/adapter.ts#L173) (value: unknown, check: (item: Record<string, unknown>) => boolean) → boolean <!-- internal -->
      <a id="base.adapter.every"></a>
      - calls [base.adapter.isRecord](base.md#base.adapter.isRecord)
    - fn [isRecord](../../src/frameworks/adapter.ts#L177) (value: unknown) → value is Record<string, unknown> <!-- internal -->
      <a id="base.adapter.isRecord"></a>
  - module [bindings](../../src/frameworks/bindings.ts#L1)
    <a id="base.bindings"></a><br>What the graph does with framework facts (ADR 0022), the same for every language: a call through a type the config binds (an interface, or a class with a preference of its own) becomes a `call` edge to the bound class's member, `via: "preference"`; a call through a property the…
    - adapter [base.adapter](base.md#base.adapter)
    - type [ResolvedType](../../src/frameworks/bindings.ts#L16)
      <a id="base.bindings.ResolvedType"></a><br>What a name of the config stands for in the snapshot.
    - type [BindingDeps](../../src/frameworks/bindings.ts#L19)
      <a id="base.bindings.BindingDeps"></a><br>What the graph lends the bindings: lookups over its declarations.
    - type [ConfigVia](../../src/frameworks/bindings.ts#L33)
      <a id="base.bindings.ConfigVia"></a>
    - type [BoundEdge](../../src/frameworks/bindings.ts#L36)
      <a id="base.bindings.BoundEdge"></a><br>One edge a binding makes, before the graph places it at a call.
    - type [BoundCall](../../src/frameworks/bindings.ts#L48)
      <a id="base.bindings.BoundCall"></a><br>A call through a bound type: the edges, and what keeps it from being resolved in an area.
    - type [BindingHole](../../src/frameworks/bindings.ts#L61)
      <a id="base.bindings.BindingHole"></a><br>A config fact that names a class keylang does not have: a hole of the module whose config it is.
    - type [PluginEdge](../../src/frameworks/bindings.ts#L70)
      <a id="base.bindings.PluginEdge"></a>
    - type [Declared](../../src/frameworks/bindings.ts#L80) <!-- internal -->
      <a id="base.bindings.Declared"></a>
    - type [Plugin](../../src/frameworks/bindings.ts#L96) <!-- internal -->
      <a id="base.bindings.Plugin"></a>
    - module [FrameworkBindings](../../src/frameworks/bindings.ts#L120)
      <a id="base.bindings.FrameworkBindings"></a>
      - fn [constructor](../../src/frameworks/bindings.ts#L134) (inputs: readonly FrameworkInput[], deps: BindingDeps)
        <a id="base.bindings.FrameworkBindings.constructor"></a>
        - calls [base.bindings.key](base.md#base.bindings.key), [base.bindings.FrameworkBindings.hole](base.md#base.bindings.FrameworkBindings.hole), [base.adapter.typeLabel](base.md#base.adapter.typeLabel), [base.bindings.asciiLower](base.md#base.bindings.asciiLower), [base.bindings.FrameworkBindings.activePlugins](base.md#base.bindings.FrameworkBindings.activePlugins)
      - fn [hole](../../src/frameworks/bindings.ts#L190) (file: string, at: { line: number; col: number }, text: string, reason: string, source: string | null) → void <!-- internal -->
        <a id="base.bindings.FrameworkBindings.hole"></a>
      - fn [binds](../../src/frameworks/bindings.ts#L195) (type: string) → boolean
        <a id="base.bindings.FrameworkBindings.binds"></a><br>A type the config binds: a call through it goes where the binding says.
      - fn [argumentFor](../../src/frameworks/bindings.ts#L200) (classId: string, param: string) → boolean
        <a id="base.bindings.FrameworkBindings.argumentFor"></a><br>The values the config sets for the constructor parameter `param` of the class; none when it sets none.
        - calls [base.bindings.asciiLower](base.md#base.bindings.asciiLower)
      - fn [callThroughType](../../src/frameworks/bindings.ts#L205) (type: string, member: string) → BoundCall
        <a id="base.bindings.FrameworkBindings.callThroughType"></a><br>A call of `member` through a value typed `type` (a type or a class the config binds).
        - calls [base.bindings.emptyCall](base.md#base.bindings.emptyCall), [base.bindings.FrameworkBindings.effective](base.md#base.bindings.FrameworkBindings.effective), [base.bindings.FrameworkBindings.place](base.md#base.bindings.FrameworkBindings.place), [base.bindings.finish](base.md#base.bindings.finish)
      - fn [callThroughArgument](../../src/frameworks/bindings.ts#L212) (classId: string, param: string, member: string) → BoundCall
        <a id="base.bindings.FrameworkBindings.callThroughArgument"></a><br>A call of `member` through the property the constructor parameter `param` of `classId` fills.
        - calls [base.bindings.emptyCall](base.md#base.bindings.emptyCall), [base.bindings.asciiLower](base.md#base.bindings.asciiLower), [base.bindings.groupBy](base.md#base.bindings.groupBy), [base.bindings.distinctTargets](base.md#base.bindings.distinctTargets), [base.bindings.describe](base.md#base.bindings.describe), [base.bindings.FrameworkBindings.effective](base.md#base.bindings.FrameworkBindings.effective), [base.bindings.FrameworkBindings.place](base.md#base.bindings.FrameworkBindings.place), [base.bindings.finish](base.md#base.bindings.finish)
      - fn [effective](../../src/frameworks/bindings.ts#L239) (type: string, out: BoundCall) → Map<string, Declared[]> <!-- internal -->
        <a id="base.bindings.FrameworkBindings.effective"></a><br>Per area, the chain of preferences from `type` to the class a value of it is: `I → C`, then `C → D` when C has a preference of its own, until a class without one (or a cycle). An area without its own preference uses the global one; two in one area make it ambiguous.
        - calls [base.bindings.distinctTargets](base.md#base.bindings.distinctTargets), [base.bindings.describe](base.md#base.bindings.describe)
      - fn [place](../../src/frameworks/bindings.ts#L269) (out: BoundCall, chain: readonly Declared[], member: string, via: "preference" | "argument", scope: string, lead = "") → void <!-- internal -->
        <a id="base.bindings.FrameworkBindings.place"></a><br>The edge (or the reason there is none) of one area's chain.
        - calls [base.bindings.scopeOrder](base.md#base.bindings.scopeOrder)
      - fn [activePlugins](../../src/frameworks/bindings.ts#L305) () → Plugin[] <!-- internal -->
        <a id="base.bindings.FrameworkBindings.activePlugins"></a><br>Plugin declarations in effect: per type, name and area, the last one wins; a disabled one or one of no class is not.
        - calls [base.bindings.groupBy](base.md#base.bindings.groupBy), [base.bindings.merge](base.md#base.bindings.merge)
      - fn [interceptors](../../src/frameworks/bindings.ts#L331) (types: readonly string[], member: string) → PluginEdge[]
        <a id="base.bindings.FrameworkBindings.interceptors"></a><br>The plugin methods that wrap `member` of a value of `types` (the receiver's class, and the interface a binding went through), in the order they run: by `sortOrder`, then name; each plugin's `before`, `around`, `after`.
        - calls [base.bindings.asciiLower](base.md#base.bindings.asciiLower), [base.bindings.FrameworkBindings.activePlugins](base.md#base.bindings.FrameworkBindings.activePlugins)
    - fn [emptyCall](../../src/frameworks/bindings.ts#L352) () → BoundCall <!-- internal -->
      <a id="base.bindings.emptyCall"></a>
    - fn [finish](../../src/frameworks/bindings.ts#L356) (out: BoundCall) → BoundCall <!-- internal -->
      <a id="base.bindings.finish"></a>
      - calls [base.bindings.scopeOrder](base.md#base.bindings.scopeOrder)
    - fn [distinctTargets](../../src/frameworks/bindings.ts#L362) (list: readonly T[]) → T[] <!-- internal -->
      <a id="base.bindings.distinctTargets"></a><br>Declarations that name different classes: one per class.
      - calls [base.bindings.key](base.md#base.bindings.key)
    - fn [describe](../../src/frameworks/bindings.ts#L371) (d: Declared) → string <!-- internal -->
      <a id="base.bindings.describe"></a>
    - fn [merge](../../src/frameworks/bindings.ts#L376) (decls: readonly Plugin[]) → Plugin | null <!-- internal -->
      <a id="base.bindings.merge"></a><br>Declarations of one plugin in config order, merged: a later one changes what it writes.
    - fn [groupBy](../../src/frameworks/bindings.ts#L390) (list: readonly T[], keyOf: (item: T) => string) → Map<string, T[]> <!-- internal -->
      <a id="base.bindings.groupBy"></a>
    - fn [scopeOrder](../../src/frameworks/bindings.ts#L396) (a: string, b: string) → number <!-- internal -->
      <a id="base.bindings.scopeOrder"></a>
    - fn [key](../../src/frameworks/bindings.ts#L400) (name: string) → string <!-- internal -->
      <a id="base.bindings.key"></a>
      - calls [base.bindings.asciiLower](base.md#base.bindings.asciiLower)
    - fn [asciiLower](../../src/frameworks/bindings.ts#L404) (name: string) → string <!-- internal -->
      <a id="base.bindings.asciiLower"></a>
  - module [cartridges](../../src/frameworks/cartridges.ts#L1)
    <a id="base.cartridges"></a><br>Salesforce Commerce Cloud cartridges (SFRA): where they are, the cartridge path they are searched in, and what an SFCC `require` names. A cartridge is a directory `…/cartridges/<name>/` with a `cartridge/` inside it; the cartridge path orders them, first cartridge first, and…
    - node [external.node](external.md#external.node)
    - type [Cartridge](../../src/frameworks/cartridges.ts#L18)
      <a id="base.cartridges.Cartridge"></a>
    - type [CartridgeLayout](../../src/frameworks/cartridges.ts#L24)
      <a id="base.cartridges.CartridgeLayout"></a>
    - fn [cartridgeDirs](../../src/frameworks/cartridges.ts#L40) (sources: Iterable<string>) → Cartridge[]
      <a id="base.cartridges.cartridgeDirs"></a><br>The cartridges the analysed files are in, by name; a name met twice is the first directory's.
    - fn [cartridgeLayout](../../src/frameworks/cartridges.ts#L57) (root: string, sources: Iterable<string>, configured: readonly string[] | null) → CartridgeLayout | null
      <a id="base.cartridges.cartridgeLayout"></a><br>The cartridges of the analysed files and their search order; null when the repository has no cartridge and no `dw.json` — no SFCC. `configured`: the `sfcc.cartridgePath` of keylang.json. Without it the order is a hint of `dw.json` (`cartridgePath`/`cartridge_path` as `a:b` or a…
      - calls [base.cartridges.cartridgeDirs](base.md#base.cartridges.cartridgeDirs), [base.cartridges.cartridgePathHint](base.md#base.cartridges.cartridgePathHint)
    - fn [cartridgePathHint](../../src/frameworks/cartridges.ts#L85) (root: string) → { names: string[] | null; from: "dw.json" | "package.json" | null; dw: boolean } <!-- internal -->
      <a id="base.cartridges.cartridgePathHint"></a><br>The cartridge path `dw.json` or the root `package.json` writes, and whether `dw.json` exists.
      - calls [base.cartridges.readJson](base.md#base.cartridges.readJson), [base.cartridges.names](base.md#base.cartridges.names), [base.cartridges.field](base.md#base.cartridges.field)
    - fn [names](../../src/frameworks/cartridges.ts#L95) (value: unknown) → string[] | null <!-- internal -->
      <a id="base.cartridges.names"></a><br>`a:b:c` as Business Manager writes it, or a list of names.
    - fn [field](../../src/frameworks/cartridges.ts#L102) (value: unknown, key: string) → unknown <!-- internal -->
      <a id="base.cartridges.field"></a>
    - fn [readJson](../../src/frameworks/cartridges.ts#L107) (path: string) → unknown <!-- internal -->
      <a id="base.cartridges.readJson"></a><br>A JSON file's value; undefined when it is absent, null when it does not parse.
    - fn [cartridgeOf](../../src/frameworks/cartridges.ts#L123) (layout: CartridgeLayout, file: string) → Cartridge | null
      <a id="base.cartridges.cartridgeOf"></a><br>The cartridge a root-relative file belongs to; null outside every cartridge.
    - fn [cartridgeAnswers](../../src/frameworks/cartridges.ts#L138) (layout: CartridgeLayout, fromFile: string, spec: string, probe: (candidate: string) => string | null) → string[] | "external" | null
      <a id="base.cartridges.cartridgeAnswers"></a><br>What an SFCC specifier names from `fromFile`: `external` for the platform API (`dw/…`); otherwise every file that answers, in the order the platform tries them — the first one wins, a second one says the order decided — where an empty list is a specifier keylang knows and no…
      - calls [base.cartridges.cartridgeOf](base.md#base.cartridges.cartridgeOf)
  - module [magento](../../src/frameworks/magento.ts#L1)
    <a id="base.magento"></a><br>The Magento adapter: `etc/di.xml` of every module, in every area. A module is a directory whose `registration.php` registers a `ComponentRegistrar::MODULE`; its `etc/di.xml` applies everywhere (`global`), `etc/<area>/di.xml` in one area (`frontend`, `adminhtml`, `webapi_rest`…).
    - node [external.node](external.md#external.node)
    - saxes [external.saxes](external.md#external.saxes)
    - adapter [base.adapter](base.md#base.adapter)
    - fn [componentRoots](../../src/frameworks/magento.ts#L52) (context: FrameworkContext, pattern: RegExp) → string[] <!-- internal -->
      <a id="base.magento.componentRoots"></a><br>Directories of the analysed `registration.php` files whose text registers a component as `pattern` says.
    - fn [scopeOf](../../src/frameworks/magento.ts#L63) (path: string) → string <!-- internal -->
      <a id="base.magento.scopeOf"></a><br>`etc/di.xml` → `global`; `etc/frontend/di.xml` → `frontend`.
    - fn [className](../../src/frameworks/magento.ts#L70) (written: string) → string
      <a id="base.magento.className"></a><br>A class name as Magento resolves it: no leading `\`, no spaces; a generated proxy stands for its class.
    - type [Open](../../src/frameworks/magento.ts#L74) <!-- internal -->
      <a id="base.magento.Open"></a>
    - fn [parseDi](../../src/frameworks/magento.ts#L83) (path: string, text: string) → ConfigFacts
      <a id="base.magento.parseDi"></a><br>The facts of one `di.xml`. A file that does not parse gives none, only the reason.
      - calls [base.magento.scopeOf](base.md#base.magento.scopeOf), [base.magento.className](base.md#base.magento.className)
  - module [python-web](../../src/frameworks/python-web.ts#L1)
    <a id="base.python-web"></a><br>The Python web adapters (ADR 0022 п. 2, 5; business-flows/38): Django, FastAPI, Flask and Celery. Each is detected from a dependency in a root manifest (`pyproject.toml`, `requirements*.txt`, `setup.py`, `setup.cfg`, `Pipfile`) or an analysed Python file that imports the package.
    - node [external.node](external.md#external.node)
    - adapter [base.adapter](base.md#base.adapter)
    - type [PythonWebSpec](../../src/frameworks/python-web.ts#L20) <!-- internal -->
      <a id="base.python-web.PythonWebSpec"></a>
    - fn [pythonWebAdapter](../../src/frameworks/python-web.ts#L30) (spec: PythonWebSpec) → FrameworkAdapter <!-- internal -->
      <a id="base.python-web.pythonWebAdapter"></a>
  - module [sfcc](../../src/frameworks/sfcc.ts#L1)
    <a id="base.sfcc"></a><br>The Salesforce Commerce Cloud adapter (SFRA cartridges; ADR 0022 п. 2, 5). Detected from a cartridge among the analysed files (`…/cartridges/<c>/cartridge/…`) or a `dw.json`.
    - node [external.node](external.md#external.node)
    - adapter [base.adapter](base.md#base.adapter)
    - cartridges [base.cartridges](base.md#base.cartridges)
    - fn [hooksFileOf](../../src/frameworks/sfcc.ts#L42) (dir: string, context: Pick<FrameworkContext, "read">) → string | null <!-- internal -->
      <a id="base.sfcc.hooksFileOf"></a><br>The hooks file a cartridge's `package.json` names in `hooks`, relative to the cartridge; null when it names none.
      - calls [base.sfcc.field](base.md#base.sfcc.field), [base.sfcc.parseJson](base.md#base.sfcc.parseJson)
    - fn [parseSfccConfig](../../src/frameworks/sfcc.ts#L60) (path: string, text: string) → ConfigFacts
      <a id="base.sfcc.parseSfccConfig"></a><br>Entry facts of one SFCC config file. `hooks.json` (`{"hooks": [{"name", "script"}]}`): an `observer` per hook, its script written from the cartridge's root (`./cartridge/scripts/…`) or from the hooks file, its fn the hook's last segment (`dw.order.calculate` → `calculate`).…
      - calls [base.sfcc.parseJson](base.md#base.sfcc.parseJson), [base.sfcc.field](base.md#base.sfcc.field)
    - fn [field](../../src/frameworks/sfcc.ts#L98) (value: unknown, key: string) → unknown <!-- internal -->
      <a id="base.sfcc.field"></a>
    - fn [parseJson](../../src/frameworks/sfcc.ts#L102) (text: string | null) → { value: unknown; error: string | null } <!-- internal -->
      <a id="base.sfcc.parseJson"></a>
  - module [glob](../../src/glob.ts#L1)
    <a id="base.glob"></a><br>Minimal glob matching for `keylang.json` (no dependency, no experimental Node API). Supports `**`, `*`, `?` and `{a,b}`; `[` is a literal (Next.js `app/[id]/page.tsx`).
    - fn [globToRegExp](../../src/glob.ts#L11) (glob: string) → RegExp
      <a id="base.glob.globToRegExp"></a><br>The anchored RegExp of a glob, compiled once. It has no `g` or `y` flag, so sharing it keeps `test` stateless.
      - calls [base.glob.source](base.md#base.glob.source)
    - fn [source](../../src/glob.ts#L22) (glob: string) → string <!-- internal -->
      <a id="base.glob.source"></a><br>The regex body of a glob; each `{a,b}` alternative is a glob itself (`{src/**,lib/*.ts}`).
      - calls [base.glob.closingBrace](base.md#base.glob.closingBrace), [base.glob.splitAlternatives](base.md#base.glob.splitAlternatives), [base.glob.escape](base.md#base.glob.escape)
    - fn [closingBrace](../../src/glob.ts#L55) (glob: string, open: number) → number <!-- internal -->
      <a id="base.glob.closingBrace"></a><br>Scans forward from the given index through the pattern string, tracking nesting depth of `{`/`}` characters, and returns the index of the `}` that balances the brace at the starting position, or -1 if the string ends without closing it. It is a helper for [`base.glob.source`](base.md#base.glob.source)… _(llm · claude · 2026-10-04)_
    - fn [splitAlternatives](../../src/glob.ts#L65) (body: string) → string[] <!-- internal -->
      <a id="base.glob.splitAlternatives"></a><br>Top-level commas of a brace body: `a,{b,c}` → `a`, `{b,c}`.
    - fn [escape](../../src/glob.ts#L81) (s: string) → string <!-- internal -->
      <a id="base.glob.escape"></a><br>Backslash-escapes the regex metacharacters `. + ^ $ ( ) | [ ] \ { }` in a string so it can be embedded verbatim in a regular expression; [`base.glob.source`](base.md#base.glob.source) uses it on the literal parts of a glob pattern. Keylang flags one dynamic call it could not resolve here, though the code… _(llm · claude · 2026-10-04)_
    - fn [matchesGlob](../../src/glob.ts#L85) (path: string, glob: string) → boolean
      <a id="base.glob.matchesGlob"></a><br>Tests whether a file path fits a glob pattern by compiling it with [`base.glob.globToRegExp`](base.md#base.glob.globToRegExp) and running the regex. Config helpers like [`base.config.layerDirs`](base.md#base.config.layerDirs) and [`map.graph.placeFile`](map.md#map.graph.placeFile) use it to match files to layers. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [base.glob.globToRegExp](base.md#base.glob.globToRegExp)
    - fn [firstMatchingGlob](../../src/glob.ts#L90) (path: string, globs: readonly string[]) → string | null
      <a id="base.glob.firstMatchingGlob"></a><br>The first of `globs` that matches `path`, or null.
      - calls [base.glob.globToRegExp](base.md#base.glob.globToRegExp)
    - fn [globDirectory](../../src/glob.ts#L101) (globs: readonly string[]) → string | null
      <a id="base.glob.globDirectory"></a><br>The one directory a set of globs owns: `D` when every glob is `D/**` or `D/**` followed by a file pattern, else null. A set that lists files, or spreads over two directories, owns none, so a README beside its files does not speak for it.
    - fn [globPrefix](../../src/glob.ts#L112) (glob: string) → string
      <a id="base.glob.globPrefix"></a><br>Directory prefix of a glob, up to the first wildcard: `src/domain/**` → `src/domain`.
  - module [languages](../../src/languages.ts#L1)
    <a id="base.languages"></a><br>Languages keylang indexes: names, file extensions and the default module granularity. Plain data, so config and the language core know which files are source without loading any frontend or grammar.
    - type [LanguageInfo](../../src/languages.ts#L5)
      <a id="base.languages.LanguageInfo"></a><br>Per-language settings: file extensions, default module granularity, index file names, the constructor member a class call runs, which members get called implicitly, and whether names compare case-insensitively. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
    - type [Language](../../src/languages.ts#L36) = keyof typeof LANGUAGES
      <a id="base.languages.Language"></a><br>A string-literal union derived from the keys of the `LANGUAGES` constant in the same file, so any value typed this way must be one of the language names registered there; the input does not show the contents of `LANGUAGES` or where this alias is consumed. _(llm · claude · 2026-10-04 · stale)_
    - fn [isLanguage](../../src/languages.ts#L40) (name: unknown) → name is Language
      <a id="base.languages.isLanguage"></a><br>Type guard that checks whether an arbitrary value is a string present as an own key of the `LANGUAGES` table, narrowing it to `Language`; used by [`base.config.parseConfig`](base.md#base.config.parseConfig) to validate language names read from configuration. The input does not show how `LANGUAGES` is defined. _(llm · claude · 2026-10-04 · stale)_
    - fn [languageOf](../../src/languages.ts#L44) (path: string) → Language | undefined
      <a id="base.languages.languageOf"></a><br>Maps a file path to a language name by iterating `LANGUAGE_NAMES` in order and returning the first whose `LANGUAGES` entry lists an extension the path ends with, or undefined if none match; this is the single extension-based language lookup that the config walkers, map… _(llm · claude · 2026-10-04 · stale)_
    - fn [constructorName](../../src/languages.ts#L52) (file: string | null | undefined) → string | null
      <a id="base.languages.constructorName"></a><br>The member a call of a class declared in `file` runs; JS `constructor` for a file of no known language.
      - calls [base.languages.languageOf](base.md#base.languages.languageOf)
    - fn [caselessNames](../../src/languages.ts#L58) (file: string | null | undefined) → boolean
      <a id="base.languages.caselessNames"></a><br>Classes, functions and methods declared in `file` compare their names without ASCII case: by `asciiLowerCase`.
      - calls [base.languages.languageOf](base.md#base.languages.languageOf)
    - fn [asciiLowerCase](../../src/languages.ts#L69) (name: string) → string
      <a id="base.languages.asciiLowerCase"></a><br>`name` with A–Z lowered and every other character kept: how PHP compares class, function and method names (from 8.2 whatever the locale). `ORDER` is `order`, while `Äpfel` and `äpfel` stay two names, which `toLowerCase` would make one.
    - fn [interfaceTypes](../../src/languages.ts#L74) (file: string | null | undefined) → boolean
      <a id="base.languages.interfaceTypes"></a><br>The type declarations of `file`'s language are interfaces: a call through a value typed with one goes to a class the code does not name.
      - calls [base.languages.languageOf](base.md#base.languages.languageOf)
    - fn [implicitMember](../../src/languages.ts#L80) (file: string | null | undefined, name: string) → boolean
      <a id="base.languages.implicitMember"></a><br>A member of a class in `file` that the language calls without naming it.
      - calls [base.languages.languageOf](base.md#base.languages.languageOf)
  - module [safe-write](../../src/safe-write.ts#L1)
    <a id="base.safe-write"></a><br>One protocol for every file keylang writes into a repository: proposals, `spec-to-code --apply`, `wire`, `.keylang/stats.json`, explanations, the map with its index and fact cache (byte-exact, see `writeAtomic`). The path is plain and relative, and it stays inside the…
    - node [external.node](external.md#external.node)
    - type [WriteOptions](../../src/safe-write.ts#L16)
      <a id="base.safe-write.WriteOptions"></a><br>Options for a guarded file write: `under` confines the target (with symlinks resolved) to a root-relative POSIX directory, `generated` lets the writer overwrite a file carrying a `keylang:generated` marker that would otherwise be refused, and `expect` makes the write… _(llm · claude · 2026-10-04)_
    - type [PlannedWrite](../../src/safe-write.ts#L29)
      <a id="base.safe-write.PlannedWrite"></a><br>A plain data record describing one file write to be performed later: the target `path` (relative to the root, in POSIX form), the full `text` content to write, and optional `options` whose type (`WriteOptions`) is referenced but not shown in the input, so what it controls is… _(llm · claude · 2026-10-04)_
    - fn [targetProblem](../../src/safe-write.ts#L46) (root: string, path: string, options: Pick<WriteOptions, "under"> = {}) → string | null
      <a id="base.safe-write.targetProblem"></a><br>Why `path` (relative to `root`, POSIX) may not be a target of keylang's at all — written, removed or read as keylang's own file — or null: not a plain relative path, a loop of links, or a place outside the repository (or outside `under`) once every link on the way is followed.…
      - calls [base.safe-write.landing](base.md#base.safe-write.landing), [base.safe-write.inside](base.md#base.safe-write.inside)
    - fn [writeProblem](../../src/safe-write.ts#L60) (root: string, path: string, options: WriteOptions = {}) → string | null
      <a id="base.safe-write.writeProblem"></a><br>Why `path` (relative to `root`, POSIX) may not be written, or null. Reads nothing outside the repository.
      - calls [base.safe-write.targetProblem](base.md#base.safe-write.targetProblem), [base.safe-write.landing](base.md#base.safe-write.landing), [base.safe-write.statOrNull](base.md#base.safe-write.statOrNull), [base.safe-write.isGeneratedText](base.md#base.safe-write.isGeneratedText)
    - fn [safeWrite](../../src/safe-write.ts#L79) (root: string, path: string, text: string, options: WriteOptions = {}) → string
      <a id="base.safe-write.safeWrite"></a><br>Writes `text` to `path` (relative to `root`, POSIX) when `writeProblem` finds nothing, and returns the absolute path; throws `path: problem` otherwise. A symlinked file is written at its target, so the link stays.
      - calls [base.safe-write.safeWriteAll](base.md#base.safe-write.safeWriteAll)
    - fn [safeWriteAll](../../src/safe-write.ts#L84) (root: string, writes: readonly PlannedWrite[]) → string[]
      <a id="base.safe-write.safeWriteAll"></a><br>Every write is checked before the first one happens: either all land, or (short of an I/O error) none does.
      - calls [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic), [base.safe-write.landing](base.md#base.safe-write.landing)
    - fn [writeAtomic](../../src/safe-write.ts#L103) (abs: string, text: string, options: { exact?: boolean } = {}) → void
      <a id="base.safe-write.writeAtomic"></a><br>A temporary file in the target's directory renamed over the target, so a crash never leaves half a file; missing directories are created. The new file keeps the permissions of the one it replaces, and CRLF when that one has CRLF on every line — unless `exact`: a generated…
      - calls [base.safe-write.statOrNull](base.md#base.safe-write.statOrNull), [base.safe-write.allCrlf](base.md#base.safe-write.allCrlf)
    - fn [isGeneratedText](../../src/safe-write.ts#L125) (text: string) → boolean
      <a id="base.safe-write.isGeneratedText"></a><br>The first non-empty line is a `keylang:generated` marker: `<!-- … -->` of a map file, `// …` of `keylang wire`, `' …` or `%% …` of a PlantUML or Mermaid diagram of `keylang export c4`.
    - fn [allCrlf](../../src/safe-write.ts#L131) (text: string) → boolean
      <a id="base.safe-write.allCrlf"></a><br>Every line ends with CRLF (at least one does): the file keeps them when it is rewritten.
    - fn [keepLineEndings](../../src/safe-write.ts#L144) (before: string, next: string) → string
      <a id="base.safe-write.keepLineEndings"></a><br>`next`, an edit of `before` computed on its LF form, in the line endings of `before`. LF stays LF and CRLF on every line stays CRLF on every line.
      - calls [base.safe-write.allCrlf](base.md#base.safe-write.allCrlf)
    - fn [landing](../../src/safe-write.ts#L183) (abs: string, hops = 0) → string | null
      <a id="base.safe-write.landing"></a><br>Where bytes written to `abs` land: the longest prefix that exists is resolved through links, and a link on the way is followed even when its target does not exist yet. Null for a loop of links.
      - calls [base.safe-write.lstatOrNull](base.md#base.safe-write.lstatOrNull)
    - fn [inside](../../src/safe-write.ts#L197) (abs: string, dir: string) → boolean <!-- internal -->
      <a id="base.safe-write.inside"></a><br>Returns true when an absolute path is the directory itself or lies under it: the path relative to the directory is empty, or is not `..`, does not start with `..` plus a separator, and is not absolute (another drive on Windows). _(llm · claude · 2026-10-04)_
    - fn [lstatOrNull](../../src/safe-write.ts#L202) (abs: string) → Stats | null <!-- internal -->
      <a id="base.safe-write.lstatOrNull"></a><br>Wraps `lstatSync` on a path, returning the stat result (without following symlinks) or `null` when the call throws for any reason, such as the path not existing. It is only used by [`base.safe-write.landing`](base.md#base.safe-write.landing), which relies on the null return to detect missing paths while walking… _(llm · claude · 2026-10-04)_
    - fn [statOrNull](../../src/safe-write.ts#L210) (abs: string) → Stats | null <!-- internal -->
      <a id="base.safe-write.statOrNull"></a><br>Wraps a synchronous filesystem stat call so that any failure (missing path, permission error, etc.) yields `null` instead of throwing, giving [`base.safe-write.writeAtomic`](base.md#base.safe-write.writeAtomic) and [`base.safe-write.writeProblem`](base.md#base.safe-write.writeProblem) a non-throwing way to check whether a target path exists and inspect… _(llm · claude · 2026-10-04)_
  - module [span](../../src/span.ts#L1)
    <a id="base.span"></a><br>Source positions. Every node, name, link and reference carries a Span so that diagnostics and the future LSP (hover, definition) can point at it.
    - type [Pos](../../src/span.ts#L9)
      <a id="base.span.Pos"></a><br>A position in a source file. `offset` is an index into the file text (UTF-16 code units, i.e. a JS string index — what LSP expects); `line` and `col` are 1-based, `col` counts Unicode code points.
    - type [Span](../../src/span.ts#L16)
      <a id="base.span.Span"></a><br>Half-open range `[start, end)`.
    - type [Spanned](../../src/span.ts#L22)
      <a id="base.span.Spanned"></a><br>A value together with the place it was written.
    - fn [spanContains](../../src/span.ts#L27) (span: Span, offset: number) → boolean
      <a id="base.span.spanContains"></a><br>Returns true when a numeric document offset falls within a span's half-open range, i.e. at or after `span.start.offset` and strictly before `span.end.offset`, with no other logic or dependencies. Its only caller shown is [`features.lsp-features.targetAt`](features.md#features.lsp-features.targetAt), which uses it to find… _(llm · claude · 2026-10-04)_
    - fn [compareText](../../src/span.ts#L32) (a: string, b: string) → number
      <a id="base.span.compareText"></a><br>Code-unit order of two strings, for stable sorting of ids and paths.
