<!-- keylang:generated — не редагувати, `keylang map` -->

[README](README.md) · modules: [brief](#base.brief) · [config](#base.config) · [diag](#base.diag) · [external-ids](#base.external-ids) · [adapter](#base.adapter) · [bindings](#base.bindings) · [cartridges](#base.cartridges) · [entries](#base.entries) · [events](#base.events) · [laravel](#base.laravel) · [magento](#base.magento) · [nestjs](#base.nestjs) · [pwa-kit](#base.pwa-kit) · [python-web](#base.python-web) · [react-router](#base.react-router) · [sfcc](#base.sfcc) · [symfony](#base.symfony) · [web](#base.web) · [glob](#base.glob) · [json](#base.json) · [languages](#base.languages) · [line-diff](#base.line-diff) · [safe-write](#base.safe-write) · [span](#base.span)

# map

- base
  <a id="base"></a><br>Dependency-free foundations shared by the rest of keylang: [`base.config`](base.md#base.config), [`base.glob`](base.md#base.glob), [`base.span`](base.md#base.span), [`base.diag`](base.md#base.diag), [`base.external-ids`](base.md#base.external-ids), [`base.brief`](base.md#base.brief) and [`base.safe-write`](base.md#base.safe-write). Rules forbid it from loading [`external.web-tree-sitter`](external.md#external.web-tree-sitter). _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
  - module [brief](../../src/brief.ts#L1)
    <a id="base.brief"></a><br>Plain-language text → a brief: its first paragraph cut to two sentences. Doc comments (once an extractor strips their syntax) and model answers go through the same rule, so a brief reads the same whatever wrote it.
    - fn [briefOf](../../src/brief.ts#L18) (text: string) → string | null
      <a id="base.brief.briefOf"></a><br>The first paragraph of `text` with whitespace collapsed, cut to its first two sentences and to about `BRIEF_MAX` characters; null when nothing is left. A sentence ends at `.`, `!` or `?` (closing quotes and brackets after it included) before whitespace and an uppercase letter…
      - calls [base.brief.capText](base.md#base.brief.capText), [base.brief.firstSentences](base.md#base.brief.firstSentences)
    - fn [firstSentence](../../src/brief.ts#L31) (text: string) → string | null
      <a id="base.brief.firstSentence"></a><br>The first sentence of the first paragraph of `text`, by the rule of `briefOf`; null when nothing is left.
      - calls [base.brief.briefOf](base.md#base.brief.briefOf), [base.brief.firstSentences](base.md#base.brief.firstSentences)
    - fn [firstSentences](../../src/brief.ts#L42) (text: string, count: number) → string <!-- internal -->
      <a id="base.brief.firstSentences"></a><br>`text` up to the end of its `count`-th sentence, or all of it when it has fewer.
    - fn [readmeBrief](../../src/brief.ts#L63) (markdown: string) → string | null
      <a id="base.brief.readmeBrief"></a><br>The brief of a README: its first paragraph of prose that reads as a sentence, through `briefOf`. Headings, fenced and indented code, HTML, lists, quotes and tables are passed over; images and badges are dropped, links keep their text, emphasis its words.
      - calls [base.brief.proseParagraphs](base.md#base.brief.proseParagraphs), [base.brief.plainInline](base.md#base.brief.plainInline), [base.brief.words](base.md#base.brief.words), [base.brief.briefOf](base.md#base.brief.briefOf)
    - fn [proseParagraphs](../../src/brief.ts#L75) (markdown: string) → string[] <!-- internal -->
      <a id="base.brief.proseParagraphs"></a><br>Paragraphs of plain text, in order: blocks of non-blank lines that are not another kind of Markdown block.
    - fn [plainInline](../../src/brief.ts#L146) (text: string) → string <!-- internal -->
      <a id="base.brief.plainInline"></a><br>The words of an inline Markdown text: images and badges dropped, links as their text, no tags or emphasis marks.
    - fn [words](../../src/brief.ts#L165) (text: string) → number <!-- internal -->
      <a id="base.brief.words"></a><br>How many words `text` has: runs of letters and digits, with inner apostrophes and hyphens.
    - fn [capText](../../src/brief.ts#L170) (text: string, max: number) → string
      <a id="base.brief.capText"></a><br>At most `max` code points: cut at the last space before the limit, then `…`.
  - module [config](../../src/config.ts#L1)
    <a id="base.config"></a><br>`keylang.json`: what to index, how files map to layers, where specs live. Without a config file the layout is guessed from the directory tree (`keylang init` writes that guess down so it can be edited).
    - node [external.node](external.md#external.node)
    - adapter [base.adapter](base.md#base.adapter)
    - glob [base.glob](base.md#base.glob)
    - json [base.json](base.md#base.json)
    - languages [base.languages](base.md#base.languages)
    - type [RuleFormat](../../src/config.ts#L22) = 1 | 2
      <a id="base.config.RuleFormat"></a><br>`1` keeps depth-sum priority. `2` is deny-overrides for incomparable rules.
    - type [StaticMode](../../src/config.ts#L29) = "behavior" | "shape"
      <a id="base.config.StaticMode"></a><br>Which call edges prove a static path. `shape`: calls written in the code. `behavior`: also the default of a hook and values resolved callers inject for it — what runs, not only what is written.
    - type [StaticSource](../../src/config.ts#L35) = "flag" | "config"
      <a id="base.config.StaticSource"></a><br>Who chose the static mode. Absent when nobody set it and the mode is `behavior`.
    - type [StaticChoice](../../src/config.ts#L38)
      <a id="base.config.StaticChoice"></a><br>The static mode in effect and who chose it.
    - fn [resolveStatic](../../src/config.ts#L44) (flag: StaticMode | undefined, configured: StaticMode | undefined) → StaticChoice
      <a id="base.config.resolveStatic"></a><br>Flag, then `check.static`, then `behavior`.
    - type [Config](../../src/config.ts#L53)
      <a id="base.config.Config"></a><br>A validated, defaulted configuration: everything a run needs, with the root it applies to.
    - fn [isAgent](../../src/config.ts#L146) (value: string) → boolean
      <a id="base.config.isAgent"></a><br>`agent` as `keylang.json`, `KEYLANG_AGENT` and `agents.json` "use" accept it.
    - fn [isCliAgent](../../src/config.ts#L151) (agent: string | null) → boolean
      <a id="base.config.isCliAgent"></a><br>The agent runs through an agent CLI (`cli:claude`), not an API.
    - fn [isReservedLayerName](../../src/config.ts#L180) (name: string) → boolean
      <a id="base.config.isReservedLayerName"></a><br>A reserved name, or `README` in any case: the explained map writes a layer as `<layer>.md` beside its start page `README.md`, and on a case-insensitive file system `readme.md` is that file too.
    - fn [skipDir](../../src/config.ts#L215) (abs: string, name: string) → boolean <!-- internal -->
      <a id="base.config.skipDir"></a><br>A directory we never descend into: hidden, build output, or a nested repository.
    - type [RawConfig](../../src/config.ts#L220)
      <a id="base.config.RawConfig"></a><br>`keylang.json` as written and validated: every field optional, before defaults.
    - fn [loadConfig](../../src/config.ts#L242) (root: string) → Config
      <a id="base.config.loadConfig"></a><br>Load `<root>/keylang.json`, or guess a config for `root`.
      - calls [base.config.parseConfig](base.md#base.config.parseConfig), [base.config.detectLanguages](base.md#base.config.detectLanguages), [base.config.guessLayers](base.md#base.config.guessLayers), [base.config.defaultModule](base.md#base.config.defaultModule)
    - fn [defaultModule](../../src/config.ts#L289) (languages: readonly Language[]) → Config["module"] <!-- internal -->
      <a id="base.config.defaultModule"></a><br>The languages' own module granularity when they agree; a file otherwise.
    - fn [withoutBom](../../src/config.ts#L301) (text: string) → string
      <a id="base.config.withoutBom"></a><br>`text` without a leading U+FEFF: a JSON file saved with a UTF-8 BOM (PowerShell 5.1 `-Encoding UTF8`, old Notepad, Visual Studio) is the same JSON, as Node and npm read a `package.json`, and as the `.md` parser, test reports and trace already read theirs.
    - fn [parseConfig](../../src/config.ts#L306) (file: string, text: string) → RawConfig
      <a id="base.config.parseConfig"></a><br>Parse and validate `keylang.json`. Errors name the file and the field.
      - calls [base.json.parseJson](base.md#base.json.parseJson), [base.config.withoutBom](base.md#base.config.withoutBom), [base.glob.globToRegExp](base.md#base.glob.globToRegExp), [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.config.acceptFormat](base.md#base.config.acceptFormat), [base.json.isJsonString](base.md#base.json.isJsonString), [base.languages.isLanguage](base.md#base.languages.isLanguage), [base.config.layerName](base.md#base.config.layerName), [base.config.isReservedLayerName](base.md#base.config.isReservedLayerName), [base.config.reservedReason](base.md#base.config.reservedReason), [base.config.isAgent](base.md#base.config.isAgent), [base.json.isJsonNumber](base.md#base.json.isJsonNumber), [base.json.isJsonBoolean](base.md#base.json.isJsonBoolean), [base.config.isCartridgeName](base.md#base.config.isCartridgeName)
    - fn [isCartridgeName](../../src/config.ts#L541) (value: JsonValue) → value is string <!-- internal -->
      <a id="base.config.isCartridgeName"></a><br>A cartridge of `sfcc.cartridgePath`: Business Manager names them with letters, digits, `_`, `.` and `-`.
      - calls [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [acceptFormat](../../src/config.ts#L546) (file: string, got: JsonValue) → RuleFormat
      <a id="base.config.acceptFormat"></a><br>`format` when it is present: a positive integer this keylang can read.
      - calls [base.json.isJsonNumber](base.md#base.json.isJsonNumber)
    - fn [assertFormatOnly](../../src/config.ts#L563) (file: string, text: string) → void
      <a id="base.config.assertFormatOnly"></a><br>`fmt` and `parse` read nothing of the config except `format`. Invalid JSON or a non-object root cannot tell them the edition, so they stop.
      - calls [base.json.parseJson](base.md#base.json.parseJson), [base.config.withoutBom](base.md#base.config.withoutBom), [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.config.acceptFormat](base.md#base.config.acceptFormat)
    - fn [configToJson](../../src/config.ts#L578) (c: Config) → string
      <a id="base.config.configToJson"></a><br>The config as it would be written by `keylang init`.
    - fn [withLayers](../../src/config.ts#L605) (file: string, text: string, layers: Readonly<Record<string, readonly string[]>>) → { text: string } | { error: string }
      <a id="base.config.withLayers"></a><br>`text` (a `keylang.json` as written or being edited) with only its `layers` replaced: every other field stays, unknown ones included, in its order; a missing `layers` is appended. Whitespace is not kept (the result is 2-space JSON).
      - calls [base.json.parseJson](base.md#base.json.parseJson), [base.config.withoutBom](base.md#base.config.withoutBom), [base.json.isJsonObject](base.md#base.json.isJsonObject)
    - fn [sourceFiles](../../src/config.ts#L622) (c: Config) → string[]
      <a id="base.config.sourceFiles"></a><br>All indexable source files under root, POSIX paths relative to root, sorted.
      - calls [base.config.classifySources](base.md#base.config.classifySources)
    - type [SourceTree](../../src/config.ts#L630)
      <a id="base.config.SourceTree"></a><br>The indexable source files and the directories that could not be listed (no permission): their files are unknown, which is a hole, not an absence.
    - fn [sourceTree](../../src/config.ts#L636) (c: Config) → SourceTree
      <a id="base.config.sourceTree"></a><br>The analysed files and the directories that could not be listed.
      - calls [base.config.classifySources](base.md#base.config.classifySources)
    - type [SourceClasses](../../src/config.ts#L643)
      <a id="base.config.SourceClasses"></a><br>Every source file of the configured languages by what keylang does with it; paths in walk order.
    - fn [classifySources](../../src/config.ts#L657) (c: Config) → SourceClasses
      <a id="base.config.classifySources"></a><br>The source files by class, from one walk of the tree.
      - calls [base.config.walkSources](base.md#base.config.walkSources), [base.config.sourceClass](base.md#base.config.sourceClass)
    - fn [sourceClass](../../src/config.ts#L675) (rel: string, c: Pick<Config, "exclude" | "outside" | "assume">) → "analysed" | "excluded" | "outside" | "assumed" | null
      <a id="base.config.sourceClass"></a><br>What keylang does with a source file; null when the built-in list leaves it out (tests, declaration files). The built-in list wins over `assume`, `assume` over `outside`, and `outside` over `exclude`.
      - calls [base.config.matchesAny](base.md#base.config.matchesAny)
    - fn [isAnalysed](../../src/config.ts#L686) (rel: string, c: Pick<Config, "exclude" | "outside" | "assume">) → boolean
      <a id="base.config.isAnalysed"></a><br>A source file keylang reads: not left out by the built-in list, `assume`, `exclude` or `outside`.
      - calls [base.config.sourceClass](base.md#base.config.sourceClass)
    - fn [isAssumed](../../src/config.ts#L691) (rel: string, c: Pick<Config, "assume">) → boolean
      <a id="base.config.isAssumed"></a><br>A path `assume` names: keylang neither reads nor requires it.
      - calls [base.config.matchesAny](base.md#base.config.matchesAny)
    - fn [isOutside](../../src/config.ts#L696) (rel: string, outside: readonly string[]) → boolean
      <a id="base.config.isOutside"></a><br>A path `outside` names.
      - calls [base.config.matchesAny](base.md#base.config.matchesAny)
    - fn [matchesAny](../../src/config.ts#L701) (rel: string, globs: readonly string[]) → boolean <!-- internal -->
      <a id="base.config.matchesAny"></a><br>Whether any glob matches `rel`.
      - calls [base.glob.firstMatchingGlob](base.md#base.glob.firstMatchingGlob)
    - fn [layerGlobWarnings](../../src/config.ts#L713) (c: Pick<Config, "layers">, files: readonly string[]) → string[]
      <a id="base.config.layerGlobWarnings"></a><br>Layer globs of keylang.json that likely do not say what was meant: files the globs of two layers both match — the layer listed first takes them — and a glob that matches no source file. `files` are the files layers place: read or excluded. Warnings, not errors: the layout works…
      - calls [base.glob.matchesGlob](base.md#base.glob.matchesGlob)
    - fn [walkSources](../../src/config.ts#L773) (c: Config, unreadable: { dir: string; reason: string }[]) → string[] <!-- internal -->
      <a id="base.config.walkSources"></a><br>Source files of the configured languages under the root, depth first with names in code-unit order; the spec directory, hidden and build directories and nested repositories are skipped. A subdirectory that cannot be listed goes to `unreadable`; the root itself is an I/O error.
      - calls [base.config.skipDir](base.md#base.config.skipDir), [base.languages.languageOf](base.md#base.languages.languageOf)
    - fn [evidenceFiles](../../src/config.ts#L821) (c: Config, field: "tests" | "trace") → string[] | null
      <a id="base.config.evidenceFiles"></a><br>Files named by `check.tests` / `check.trace`: a plain path (which must exist) or a glob (which may match nothing yet, before the first test run).
      - calls [base.glob.globPrefix](base.md#base.glob.globPrefix), [base.config.toPosix](base.md#base.config.toPosix), [base.glob.matchesGlob](base.md#base.glob.matchesGlob)
    - fn [isExcluded](../../src/config.ts#L853) (rel: string, extra: readonly string[]) → boolean
      <a id="base.config.isExcluded"></a><br>Whether the built-in list or the given globs leave `rel` out.
      - calls [base.config.matchesAny](base.md#base.config.matchesAny)
    - fn [toPosix](../../src/config.ts#L858) (p: string) → string
      <a id="base.config.toPosix"></a><br>A path with backslashes turned into `/`, as artifacts store paths.
    - fn [specPath](../../src/config.ts#L869) (dir: string, rest: string) → string
      <a id="base.config.specPath"></a><br>`rest` under the spec directory `dir`, relative to the root and POSIX, as the analysis names its documents: `keylang/features/f1.md`, or plain `features/f1.md` when `dir` is `.` (the root). Every path keylang builds under `dir` goes through here: `./features/f1.md` would match…
    - fn [detectLanguages](../../src/config.ts#L874) (root: string) → Language[] <!-- internal -->
      <a id="base.config.detectLanguages"></a><br>The languages of source files found up to four levels deep (declaration files aside), sorted.
      - calls [base.config.skipDir](base.md#base.config.skipDir), [base.languages.languageOf](base.md#base.languages.languageOf)
    - fn [guessLayers](../../src/config.ts#L906) (root: string, exclude: readonly string[]) → Map<string, string[]>
      <a id="base.config.guessLayers"></a><br>Zero-config layering: the source root is `src/` (or `lib/`) when present, else the one Python package in the repository root when it is the only layer candidate there and has subdirectories with code (`app/` with `app/__init__.py`), else the repository root. Each directory…
      - calls [base.config.guessLayout](base.md#base.config.guessLayout)
    - type [GuessedLayout](../../src/config.ts#L915)
      <a id="base.config.GuessedLayout"></a><br>The guessed layers, and a note for every directory whose layer name had to change: a reserved name (`src/external/` → `external_`) or one that another directory already sanitizes to (`2fa` and `_2fa` → `_2fa`, `_2fa_2`).
    - fn [guessLayout](../../src/config.ts#L921) (root: string, exclude: readonly string[]) → GuessedLayout
      <a id="base.config.guessLayout"></a><br>The guessed layers of `root` and notes on renamed layers (see `guessLayers`).
      - calls [base.config.sourceRoot](base.md#base.config.sourceRoot), [base.config.freeLayerName](base.md#base.config.freeLayerName), [base.config.isReservedLayerName](base.md#base.config.isReservedLayerName), [base.config.reservedReason](base.md#base.config.reservedReason), [base.config.hasRootFiles](base.md#base.config.hasRootFiles), [base.config.hasSource](base.md#base.config.hasSource), [base.config.layerDirs](base.md#base.config.layerDirs), [base.config.layerName](base.md#base.config.layerName)
    - fn [sourceRoot](../../src/config.ts#L963) (root: string, exclude: readonly string[]) → string <!-- internal -->
      <a id="base.config.sourceRoot"></a><br>`src` or `lib`; else the one directory the root `composer.json` maps its PSR-4 namespaces to (Laravel's `app/`); else the single layer candidate of the repository root when it is a Python package (`__init__.py`) whose subdirectories hold code — one layer for the whole…
      - calls [base.config.composerSourceRoot](base.md#base.config.composerSourceRoot), [base.config.layerDirs](base.md#base.config.layerDirs)
    - fn [composerSourceRoot](../../src/config.ts#L979) (root: string) → string | null <!-- internal -->
      <a id="base.config.composerSourceRoot"></a><br>The single directory of the root `composer.json`'s `autoload.psr-4`, when it maps every namespace there; null otherwise.
      - calls [base.json.parseJson](base.md#base.json.parseJson), [base.config.withoutBom](base.md#base.config.withoutBom), [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString), [base.config.toPosix](base.md#base.config.toPosix)
    - fn [layerDirs](../../src/config.ts#L1011) (root: string, dir: string, exclude: readonly string[]) → { name: string; rel: string }[] <!-- internal -->
      <a id="base.config.layerDirs"></a><br>The directories directly under `dir` (repository-relative, `""` for the root) that become layers.
      - calls [base.config.skipDir](base.md#base.config.skipDir), [base.glob.matchesGlob](base.md#base.glob.matchesGlob), [base.config.hasSource](base.md#base.config.hasSource)
    - fn [freeLayerName](../../src/config.ts#L1033) (wanted: string, taken: ReadonlyMap<string, unknown>) → string <!-- internal -->
      <a id="base.config.freeLayerName"></a><br>`wanted`, or the first free variant: a reserved name gets `_`, a taken one a number (`_2fa_2`).
      - calls [base.config.isReservedLayerName](base.md#base.config.isReservedLayerName)
    - fn [reservedReason](../../src/config.ts#L1046) (name: string) → string <!-- internal -->
      <a id="base.config.reservedReason"></a><br>Why a name cannot be a layer, for error messages and notes.
    - fn [hasRootFiles](../../src/config.ts#L1061) (root: string, dir: string, exclude: readonly string[]) → boolean <!-- internal -->
      <a id="base.config.hasRootFiles"></a><br>Whether `dir` itself (not its subdirectories) holds an indexable source file.
      - calls [base.languages.languageOf](base.md#base.languages.languageOf), [base.config.isExcluded](base.md#base.config.isExcluded)
    - fn [hasSource](../../src/config.ts#L1066) (absDir: string, rel: string, exclude: readonly string[]) → boolean <!-- internal -->
      <a id="base.config.hasSource"></a><br>Whether `absDir` or any directory under it (skipped ones aside) holds an indexable source file.
      - calls [base.config.skipDir](base.md#base.config.skipDir), [base.languages.languageOf](base.md#base.languages.languageOf), [base.config.isExcluded](base.md#base.config.isExcluded)
    - fn [isIdSegment](../../src/config.ts#L1081) (s: string) → boolean <!-- internal -->
      <a id="base.config.isIdSegment"></a><br>Same predicate as `isSegment`. Duplicated so `base` does not import `lang`.
    - fn [encodeBracketSegment](../../src/config.ts#L1114) (name: string) → string <!-- internal -->
      <a id="base.config.encodeBracketSegment"></a><br>A path segment that is not an ID and contains `()[]`, written so `decodeLayerName` restores it. A Next route form (`(shop)`, `[id]`, `[...slug]`, `[[...slug]]`) gets a readable prefix (`$g-shop`, `$p-id`, `$all-slug`, `$opt-slug`); any other name keeps its letters and writes…
    - fn [decodeLayerName](../../src/config.ts#L1142) (segment: string) → string
      <a id="base.config.decodeLayerName"></a><br>Inverse of the bracket encoding in `layerName`. A segment without a route prefix or `$HH` is unchanged.
    - fn [layerName](../../src/config.ts#L1173) (written: string) → string
      <a id="base.config.layerName"></a><br>Make a directory or file name a valid ID segment, in Unicode NFC. An existing segment is kept.
      - calls [base.config.isIdSegment](base.md#base.config.isIdSegment), [base.config.encodeBracketSegment](base.md#base.config.encodeBracketSegment)
  - module [diag](../../src/diag.ts#L1)
    <a id="base.diag"></a><br>Diagnostics with stable codes, and the text of a thrown error. Shared by every stage: the parser and resolver (K0xx), the dependency rules (K1xx), flows (K2xx), wiring (K3xx) and the system design (K4xx) all report through `diagnostic`; the CLI prints them with…
    - span [base.span](base.md#base.span)
    - type [Code](../../src/diag.ts#L10)
      <a id="base.diag.Code"></a><br>Every diagnostic code keylang emits; a code's meaning never changes once published.
    - type [Severity](../../src/diag.ts#L71) = "error" | "warning"
      <a id="base.diag.Severity"></a><br>An error fails `keylang check`; a warning is reported but does not.
    - type [K005Reason](../../src/diag.ts#L74)
      <a id="base.diag.K005Reason"></a><br>Why a K005 is malformed. Other codes do not carry this.
    - fn [severityOf](../../src/diag.ts#L77) (code: Code) → Severity
      <a id="base.diag.severityOf"></a><br>The fixed severity of a code: a short list of warnings, everything else an error.
    - type [Diagnostic](../../src/diag.ts#L82)
      <a id="base.diag.Diagnostic"></a><br>One finding at a span of a file; the optional fields exist only for the codes that need them.
    - fn [diagnostic](../../src/diag.ts#L117) (code: Exclude<Code, "K005">, file: string, span: Span, message: string, target?: string) → Diagnostic
      <a id="base.diag.diagnostic"></a><br>Build a diagnostic with the code's severity. The last argument is a K005's reason, or for every other code the `target` it is about.
      - calls [base.diag.severityOf](base.md#base.diag.severityOf)
    - fn [isError](../../src/diag.ts#L133) (d: Diagnostic) → boolean
      <a id="base.diag.isError"></a><br>Whether the diagnostic fails the check.
    - fn [formatDiagnostic](../../src/diag.ts#L138) (d: Diagnostic) → string
      <a id="base.diag.formatDiagnostic"></a><br>`file:line:col: CODE message`
    - fn [compareDiagnostics](../../src/diag.ts#L143) (a: Diagnostic, b: Diagnostic) → number
      <a id="base.diag.compareDiagnostics"></a><br>Stable order: file, position, code.
    - fn [errorText](../../src/diag.ts#L157) (cause: unknown) → string
      <a id="base.diag.errorText"></a><br>The text of a thrown value: an `Error`'s message, anything else as a string.
  - module [external-ids](../../src/external-ids.ts#L1)
    <a id="base.external-ids"></a><br>IDs of external packages: `external.<segment>`, one ID space for every package name a repository imports or declares. The map, the rules and the language server all name a package by this ID, so they share this module.
    - config [base.config](base.md#base.config)
    - fn [externalSegment](../../src/external-ids.ts#L11) (pkg: string) → string
      <a id="base.external-ids.externalSegment"></a><br>ID segment of a package: `@scope/pkg` → `scope-pkg`, `lodash.get` → `lodash_get`.
      - calls [base.config.layerName](base.md#base.config.layerName)
    - type [ExternalIds](../../src/external-ids.ts#L16)
      <a id="base.external-ids.ExternalIds"></a><br>The ID of each package name, and a warning for each name that lost its plain segment.
    - fn [assignExternalIds](../../src/external-ids.ts#L27) (names: Iterable<string>) → ExternalIds
      <a id="base.external-ids.assignExternalIds"></a><br>Module IDs of package names. Two names that sanitize to one segment (`@scope/pkg` and `scope-pkg`) get two IDs: the one whose name is the segment keeps it, the others get `-2`, `-3`… in name order, with a warning.
      - calls [base.external-ids.externalSegment](base.md#base.external-ids.externalSegment)
    - fn [externalPackageId](../../src/external-ids.ts#L62) (id: string) → string | null
      <a id="base.external-ids.externalPackageId"></a><br>The package part of an external ID (`external.pg.Pool` → `external.pg`); null for any other ID.
  - module [adapter](../../src/frameworks/adapter.ts#L1)
    <a id="base.adapter"></a><br>Framework adapters (ADR 0022): beside the language frontends, an adapter reads the configuration a framework executes (`etc/di.xml` of Magento) and gives the graph facts the code does not write — bindings of an interface to a class, constructor arguments, interceptors. The…
    - json [base.json](base.md#base.json)
    - laravel [base.laravel](base.md#base.laravel)
    - magento [base.magento](base.md#base.magento)
    - nestjs [base.nestjs](base.md#base.nestjs)
    - pwa-kit [base.pwa-kit](base.md#base.pwa-kit)
    - react-router [base.react-router](base.md#base.react-router)
    - python-web [base.python-web](base.md#base.python-web)
    - sfcc [base.sfcc](base.md#base.sfcc)
    - symfony [base.symfony](base.md#base.symfony)
    - web [base.web](base.md#base.web)
    - type [TypeName](../../src/frameworks/adapter.ts#L37)
      <a id="base.adapter.TypeName"></a><br>A type the configuration names: a qualified name of a language whose declarations have one (PHP `Magento\Sales\Api\OrderManagementInterface`, without the leading `\`), or a name declared at the top of `file`.
    - type [ConfigAt](../../src/frameworks/adapter.ts#L43)
      <a id="base.adapter.ConfigAt"></a><br>Where in the config file a fact is written: 1-based.
    - type [BindingFact](../../src/frameworks/adapter.ts#L49) extends ConfigAt
      <a id="base.adapter.BindingFact"></a><br>`I → C`: a value typed `from` is an instance of `to` (Magento `<preference>`).
    - type [ArgumentFact](../../src/frameworks/adapter.ts#L59) extends ConfigAt
      <a id="base.adapter.ArgumentFact"></a><br>The constructor parameter `param` of `type` receives an instance of `value` (Magento `<argument xsi:type="object">`). A `type` named `*` (`EVERY_CLASS`) is every class: Symfony `_defaults: bind: $p: '@C'`.
    - type [AliasFact](../../src/frameworks/adapter.ts#L66) extends ConfigAt
      <a id="base.adapter.AliasFact"></a><br>`name` stands for the class `type` with arguments of its own (Magento `<virtualType>`).
    - type [InterceptFact](../../src/frameworks/adapter.ts#L72) extends ConfigAt
      <a id="base.adapter.InterceptFact"></a><br>A plugin `name` of the class `plugin` wraps the public methods of `target` (Magento `<plugin>`).
    - type [ObserverFact](../../src/frameworks/adapter.ts#L89) extends ConfigAt
      <a id="base.adapter.ObserverFact"></a><br>An observer `name` of the event `event`: the framework calls `method` of `instance` when code dispatches the event (Magento `etc/events.xml` `<event name><observer name instance method? disabled?>`).
    - type [ConfigEntryKind](../../src/frameworks/adapter.ts#L102) = "rest" | "graphql" | "cron" | "consumer" | "cli"
      <a id="base.adapter.ConfigEntryKind"></a><br>Entry kinds an adapter writes straight from a config line (`route` needs the controllers, `observer` the events).
    - type [EntryFact](../../src/frameworks/adapter.ts#L109) extends ConfigAt
      <a id="base.adapter.EntryFact"></a><br>An entry point the config names: the framework calls `method` of `target` from outside (a REST route, a GraphQL resolver, a cron job, a queue consumer, a console command). `label` is how the outside names it.
    - type [RouteFact](../../src/frameworks/adapter.ts#L121) extends ConfigAt
      <a id="base.adapter.RouteFact"></a><br>A router of the framework: URLs under `/<frontName>/` run the controllers of `modules` (Magento `etc/<area>/routes.xml` `<router id><route id frontName><module name/>`).
    - type [EntryConfigFact](../../src/frameworks/adapter.ts#L138) extends ConfigAt
      <a id="base.adapter.EntryConfigFact"></a><br>An entry point a config file names (SFCC `hooks.json` → `observer`, `steptypes.json` → `cron`): the script it runs, as the paths the framework would try in order (each probed with the usual extensions and `index`), and the fn in it, if the config names one. A PHP framework…
    - type [DispatchFact](../../src/frameworks/adapter.ts#L157) extends ConfigAt
      <a id="base.adapter.DispatchFact"></a><br>A call in the code that dispatches an event or a message object (`event(new X)`, `$bus->dispatch(new X)`), in the declaration `symbol` of the file: an edge `via: "dispatch"` from that fn to the event `event`, named by the class (or the string a Symfony dispatch passes as its…
    - type [ConfigHole](../../src/frameworks/adapter.ts#L166) extends ConfigAt
      <a id="base.adapter.ConfigHole"></a><br>Something the config writes that keylang does not read (a binding to a closure, an expression): a hole of the file with the reason.
    - type [RoutePrefixFact](../../src/frameworks/adapter.ts#L172) extends ConfigAt
      <a id="base.adapter.RoutePrefixFact"></a><br>Symfony `config/routes.yaml`: the routes of the attributes of classes under `dir` have `prefix` before their path.
    - type [TokenRef](../../src/frameworks/adapter.ts#L178)
      <a id="base.adapter.TokenRef"></a><br>A provider token as the code writes it: a string, or a name (a const, a class) written in `file`.
    - type [ProviderFact](../../src/frameworks/adapter.ts#L185) extends ConfigAt
      <a id="base.adapter.ProviderFact"></a><br>A module provides `token` (NestJS `providers`): a class (`useClass`, a class provider `[C]`), what another token provides (`useExisting`), or a value keylang cannot name (`useFactory`, `useValue`).
    - type [InjectionFact](../../src/frameworks/adapter.ts#L191) extends ConfigAt
      <a id="base.adapter.InjectionFact"></a><br>The constructor parameter `param` of `type` receives what `token` provides (NestJS `@Inject(T)`).
    - type [CodeDecorator](../../src/frameworks/adapter.ts#L203)
      <a id="base.adapter.CodeDecorator"></a><br>A decorator as written: its name (`Get`, `Nest.Get`) and its arguments as values keylang reads without running code. `param`: a decorator of a constructor parameter — the parameter's position, its name (the field a parameter property declares) and its type as written.
    - type [DecoratorArg](../../src/frameworks/adapter.ts#L217)
      <a id="base.adapter.DecoratorArg"></a><br>A decorator argument: a string literal (a template without substitutions too), a number, a name (`ORDER_REPO`, `CronExpression.EVERY_HOUR`), an object or an array literal of those, a function (`() => String`), else `other` with the text.
    - type [CodeDecl](../../src/frameworks/adapter.ts#L227)
      <a id="base.adapter.CodeDecl"></a><br>A declaration as `code` reads it: the extractor's `DeclFact`, of which a framework needs the decorators.
    - type [CodeFacts](../../src/frameworks/adapter.ts#L235)
      <a id="base.adapter.CodeFacts"></a><br>What `code` reads of a source file: the extractor's `FileFacts`, structurally.
    - type [ConfigFacts](../../src/frameworks/adapter.ts#L240)
      <a id="base.adapter.ConfigFacts"></a><br>The facts of one config file. Depends only on its path and text, so the fact cache keeps it.
    - type [FrameworkConfig](../../src/frameworks/adapter.ts#L271)
      <a id="base.adapter.FrameworkConfig"></a><br>One config file of an active adapter, with the directory of the module that declares it.
    - type [FrameworkModule](../../src/frameworks/adapter.ts#L278)
      <a id="base.adapter.FrameworkModule"></a><br>A module of the framework, by the name its config uses (`Magento_Checkout`), and its directory.
    - type [FrameworkInput](../../src/frameworks/adapter.ts#L284)
      <a id="base.adapter.FrameworkInput"></a><br>What the graph receives from one active adapter.
    - type [ServiceLocator](../../src/frameworks/adapter.ts#L309)
      <a id="base.adapter.ServiceLocator"></a><br>A service locator of the framework (Magento's ObjectManager, business-flows 40): a call of one of `methods` on a value of one of `types` (or of a class implementing one) whose first argument names a class as a literal (`X::class`, `'Vendor\X'`) gives an instance of that class…
    - type [GeneratedClass](../../src/frameworks/adapter.ts#L322)
      <a id="base.adapter.GeneratedClass"></a><br>A class the framework generates instead of the code declaring it, by a convention of names (Magento's ObjectManager: `XFactory` with `create(): X`, business-flows 40). keylang applies it only to a class no file it reads declares, whose stem (`X`) is a class or an interface it…
    - type [FrameworkContext](../../src/frameworks/adapter.ts#L330)
      <a id="base.adapter.FrameworkContext"></a><br>What an adapter sees of the repository: the analysed source files and a reader.
    - type [FrameworkAdapter](../../src/frameworks/adapter.ts#L349)
      <a id="base.adapter.FrameworkAdapter"></a><br>One framework adapter: how to detect the framework, which config files it executes, and how to read them.
    - type [ControllerConvention](../../src/frameworks/adapter.ts#L387)
      <a id="base.adapter.ControllerConvention"></a><br>Where a framework keeps the controllers of a route and how it names their URLs: a controller is a class in a file under `<module dir>/<dir>/`, whose `member` runs; the HTTP method comes from the interfaces it implements.
    - fn [activeAdapters](../../src/frameworks/adapter.ts#L413) (frameworks: readonly string[] | null, context: FrameworkContext, available: readonly FrameworkAdapter[] = FRAMEWORK_ADAPTERS) → FrameworkAdapter[]
      <a id="base.adapter.activeAdapters"></a><br>The adapters of a repository: those `frameworks` names, or with the field absent those detected. `available` lets a test add an adapter of its own.
    - fn [typeLabel](../../src/frameworks/adapter.ts#L420) (t: TypeName) → string
      <a id="base.adapter.typeLabel"></a><br>A label for a type the configuration names: its qualified name, or `file#name`.
    - fn [isConfigFacts](../../src/frameworks/adapter.ts#L425) (value: unknown) → value is ConfigFacts
      <a id="base.adapter.isConfigFacts"></a><br>Whether a cached value has the shape of `ConfigFacts`; a cache entry of another shape is parsed again.
      - calls [base.adapter.isCachedObject](base.md#base.adapter.isCachedObject), [base.json.isJsonString](base.md#base.json.isJsonString), [base.adapter.every](base.md#base.adapter.every), [base.adapter.isAt](base.md#base.adapter.isAt), [base.adapter.isTypeName](base.md#base.adapter.isTypeName), [base.json.isJsonBoolean](base.md#base.json.isJsonBoolean), [base.adapter.isStringList](base.md#base.adapter.isStringList), [base.adapter.isToken](base.md#base.adapter.isToken), [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonNumber](base.md#base.json.isJsonNumber)
    - fn [isCachedObject](../../src/frameworks/adapter.ts#L450) (value: unknown) → value is JsonObject <!-- internal -->
      <a id="base.adapter.isCachedObject"></a><br>The fact cache is read with `JSON.parse`, so an object in it holds only JSON values.
    - fn [isAt](../../src/frameworks/adapter.ts#L455) (value: JsonObject) → boolean <!-- internal -->
      <a id="base.adapter.isAt"></a><br>Has an integer `line` and `col`.
    - fn [isToken](../../src/frameworks/adapter.ts#L460) (value: JsonValue | undefined) → boolean <!-- internal -->
      <a id="base.adapter.isToken"></a><br>A `TokenRef` shape: a string token or a name with its file.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [isTypeName](../../src/frameworks/adapter.ts#L465) (value: JsonValue | undefined) → boolean <!-- internal -->
      <a id="base.adapter.isTypeName"></a><br>A `TypeName` shape: a name, with an optional file.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [isStringList](../../src/frameworks/adapter.ts#L470) (value: JsonValue | undefined) → boolean <!-- internal -->
      <a id="base.adapter.isStringList"></a><br>An array of strings.
      - calls [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [every](../../src/frameworks/adapter.ts#L475) (value: JsonValue | undefined, check: (item: JsonObject) => boolean) → boolean <!-- internal -->
      <a id="base.adapter.every"></a><br>An array whose every item is a JSON object passing `check`; anything else (including absent) fails.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject)
  - module [bindings](../../src/frameworks/bindings.ts#L1)
    <a id="base.bindings"></a><br>What the graph does with framework facts (ADR 0022), the same for every language: a call through a type the config binds (an interface, or a class with a preference of its own) becomes a `call` edge to the bound class's member, `via: "preference"`; a call through a property the…
    - adapter [base.adapter](base.md#base.adapter)
    - type [ResolvedType](../../src/frameworks/bindings.ts#L22)
      <a id="base.bindings.ResolvedType"></a><br>What a name of the config stands for in the snapshot.
    - type [BindingDeps](../../src/frameworks/bindings.ts#L25)
      <a id="base.bindings.BindingDeps"></a><br>What the graph lends the bindings: lookups over its declarations.
    - type [ConfigVia](../../src/frameworks/bindings.ts#L47)
      <a id="base.bindings.ConfigVia"></a><br>How a framework-made edge got its target: a preference, a constructor argument or a plugin method.
    - type [BoundEdge](../../src/frameworks/bindings.ts#L50)
      <a id="base.bindings.BoundEdge"></a><br>One edge a binding makes, before the graph places it at a call.
    - type [BoundCall](../../src/frameworks/bindings.ts#L62)
      <a id="base.bindings.BoundCall"></a><br>A call through a bound type: the edges, and what keeps it from being resolved in an area.
    - type [BoundClasses](../../src/frameworks/bindings.ts#L75)
      <a id="base.bindings.BoundClasses"></a><br>Per area, the class a value of a bound type is: its name, its node when the graph has one, and the preferences it rests on.
    - type [BindingHole](../../src/frameworks/bindings.ts#L82)
      <a id="base.bindings.BindingHole"></a><br>A config fact that names a class keylang does not have: a hole of the module whose config it is.
    - type [PluginEdge](../../src/frameworks/bindings.ts#L92)
      <a id="base.bindings.PluginEdge"></a><br>An edge from an intercepted call to a plugin's `before`/`around`/`after` method.
    - type [Declared](../../src/frameworks/bindings.ts#L103) <!-- internal -->
      <a id="base.bindings.Declared"></a><br>One class a config fact names (the value of a preference or argument), resolved and with its config site.
    - type [Plugin](../../src/frameworks/bindings.ts#L120) <!-- internal -->
      <a id="base.bindings.Plugin"></a><br>One plugin declaration on a resolved target type, as one config file writes it.
    - type [Unaliased](../../src/frameworks/bindings.ts#L138) <!-- internal -->
      <a id="base.bindings.Unaliased"></a><br>A type with its aliases followed: the type they end at, and the aliases it went through.
    - module [FrameworkBindings](../../src/frameworks/bindings.ts#L158)
      <a id="base.bindings.FrameworkBindings"></a><br>The framework facts of all active adapters, indexed once per graph build: preferences, constructor arguments and plugins by the type they apply to, plus the holes found while indexing.
      - fn [constructor](../../src/frameworks/bindings.ts#L178) (inputs: readonly FrameworkInput[], deps: BindingDeps)
        <a id="base.bindings.FrameworkBindings.constructor"></a>
        - calls [base.bindings.key](base.md#base.bindings.key), [base.bindings.FrameworkBindings.hole](base.md#base.bindings.FrameworkBindings.hole), [base.adapter.typeLabel](base.md#base.adapter.typeLabel), [base.bindings.asciiLower](base.md#base.bindings.asciiLower), [base.bindings.FrameworkBindings.linkTokens](base.md#base.bindings.FrameworkBindings.linkTokens), [base.bindings.FrameworkBindings.activePlugins](base.md#base.bindings.FrameworkBindings.activePlugins)
      - fn [linkTokens](../../src/frameworks/bindings.ts#L284) (configs: readonly FrameworkInput["configs"][number][], declared: (written: TypeName, scope: string, file: string, at: { line: number; col: number }, owner: string | null, from?: string | null) => Declared) → void <!-- internal -->
        <a id="base.bindings.FrameworkBindings.linkTokens"></a><br>Tokens (NestJS): an injection `@Inject(T)` of a constructor parameter gets what the providers of `T` give — the class of `useClass` (or of a class provider), through `useExisting` to another token's — as a constructor argument the config sets, so `this.x.m()` goes to that…
        - calls [base.bindings.FrameworkBindings.hole](base.md#base.bindings.FrameworkBindings.hole), [base.bindings.tokenLabel](base.md#base.bindings.tokenLabel), [base.adapter.typeLabel](base.md#base.adapter.typeLabel), [base.bindings.asciiLower](base.md#base.bindings.asciiLower)
      - fn [hole](../../src/frameworks/bindings.ts#L344) (file: string, at: { line: number; col: number }, text: string, reason: string, source: string | null) → void <!-- internal -->
        <a id="base.bindings.FrameworkBindings.hole"></a><br>Record a hole of a config line.
      - fn [binds](../../src/frameworks/bindings.ts#L349) (type: string) → boolean
        <a id="base.bindings.FrameworkBindings.binds"></a><br>A type the config binds: a call through it goes where the binding says.
      - fn [argumentFor](../../src/frameworks/bindings.ts#L354) (classId: string, param: string) → boolean
        <a id="base.bindings.FrameworkBindings.argumentFor"></a><br>The values the config sets for the constructor parameter `param` of the class; none when it sets none.
        - calls [base.bindings.FrameworkBindings.valuesOf](base.md#base.bindings.FrameworkBindings.valuesOf)
      - fn [callThroughType](../../src/frameworks/bindings.ts#L359) (type: string, member: string) → BoundCall
        <a id="base.bindings.FrameworkBindings.callThroughType"></a><br>A call of `member` through a value typed `type` (a type or a class the config binds).
        - calls [base.bindings.emptyCall](base.md#base.bindings.emptyCall), [base.bindings.FrameworkBindings.effective](base.md#base.bindings.FrameworkBindings.effective), [base.bindings.FrameworkBindings.place](base.md#base.bindings.FrameworkBindings.place), [base.bindings.finish](base.md#base.bindings.finish)
      - fn [callThroughArgument](../../src/frameworks/bindings.ts#L368) (classId: string, param: string, member: string) → BoundCall
        <a id="base.bindings.FrameworkBindings.callThroughArgument"></a><br>A call of `member` through the property the constructor parameter `param` of `classId` fills.
        - calls [base.bindings.emptyCall](base.md#base.bindings.emptyCall), [base.bindings.FrameworkBindings.valuesOf](base.md#base.bindings.FrameworkBindings.valuesOf), [base.bindings.groupBy](base.md#base.bindings.groupBy), [base.bindings.distinctTargets](base.md#base.bindings.distinctTargets), [base.bindings.describe](base.md#base.bindings.describe), [base.bindings.FrameworkBindings.effective](base.md#base.bindings.FrameworkBindings.effective), [base.bindings.FrameworkBindings.place](base.md#base.bindings.FrameworkBindings.place), [base.bindings.finish](base.md#base.bindings.finish)
      - fn [valuesOf](../../src/frameworks/bindings.ts#L398) (classId: string, param: string) → (Declared & { param: string })[] <!-- internal -->
        <a id="base.bindings.FrameworkBindings.valuesOf"></a><br>What the config sets for the parameter of the class: its own arguments, else those for every class.
        - calls [base.bindings.asciiLower](base.md#base.bindings.asciiLower)
      - fn [effective](../../src/frameworks/bindings.ts#L410) (type: string, out: BoundCall) → Map<string, Declared[]> <!-- internal -->
        <a id="base.bindings.FrameworkBindings.effective"></a><br>Per area, the chain of preferences from `type` to the class a value of it is: `I → C`, then `C → D` when C has a preference of its own, until a class without one (or a cycle). An area without its own preference uses the global one; two in one area make it ambiguous.
        - calls [base.bindings.distinctTargets](base.md#base.bindings.distinctTargets), [base.bindings.describe](base.md#base.bindings.describe)
      - fn [boundByName](../../src/frameworks/bindings.ts#L455) (name: string) → BoundClasses
        <a id="base.bindings.FrameworkBindings.boundByName"></a><br>A type the graph has no node for (an interface `outside` the architecture, business-flows 40), by its qualified name: per area, the class a value of it is through the preferences — the last name of the chain as `effective` follows it, by name until a preference names a graph…
        - calls [base.bindings.FrameworkBindings.bound](base.md#base.bindings.FrameworkBindings.bound), [base.bindings.key](base.md#base.bindings.key)
      - fn [boundClasses](../../src/frameworks/bindings.ts#L460) (type: string) → BoundClasses
        <a id="base.bindings.FrameworkBindings.boundClasses"></a><br>The same for a type of the graph (`effective`, ending at the class rather than at a member).
        - calls [base.bindings.FrameworkBindings.bound](base.md#base.bindings.FrameworkBindings.bound)
      - fn [bound](../../src/frameworks/bindings.ts#L465) ({ name }: { name: string }, own: readonly Declared[]) → BoundClasses <!-- internal -->
        <a id="base.bindings.FrameworkBindings.bound"></a><br>Shared by `boundByName` and `boundClasses`: walks the chain by node ID or, for types without a node, by name.
        - calls [base.bindings.emptyCall](base.md#base.bindings.emptyCall), [base.bindings.key](base.md#base.bindings.key), [base.bindings.distinctTargets](base.md#base.bindings.distinctTargets), [base.bindings.describe](base.md#base.bindings.describe)
      - fn [place](../../src/frameworks/bindings.ts#L510) (out: BoundCall, chain: readonly Declared[], member: string, via: "preference" | "argument", scope: string, lead = "") → void <!-- internal -->
        <a id="base.bindings.FrameworkBindings.place"></a><br>The edge (or the reason there is none) of one area's chain.
        - calls [base.bindings.scopeOrder](base.md#base.bindings.scopeOrder)
      - fn [activePlugins](../../src/frameworks/bindings.ts#L564) () → Plugin[] <!-- internal -->
        <a id="base.bindings.FrameworkBindings.activePlugins"></a><br>Plugin declarations in effect: per type, name and area, the last one wins; a disabled one or one of no class is not.
        - calls [base.bindings.groupBy](base.md#base.bindings.groupBy), [base.bindings.merge](base.md#base.bindings.merge)
      - fn [interceptors](../../src/frameworks/bindings.ts#L599) (types: readonly string[], member: string) → PluginEdge[]
        <a id="base.bindings.FrameworkBindings.interceptors"></a><br>The plugin methods that wrap `member` of a value of `types` (the receiver's class, and the interface a binding went through), in the order they run: by `sortOrder`, then name; each plugin's `before`, `around`, `after`.
        - calls [base.bindings.asciiLower](base.md#base.bindings.asciiLower), [base.bindings.FrameworkBindings.activePlugins](base.md#base.bindings.FrameworkBindings.activePlugins)
    - fn [tokenLabel](../../src/frameworks/bindings.ts#L631) (t: TokenRef) → string <!-- internal -->
      <a id="base.bindings.tokenLabel"></a><br>A token as the code writes it: `ORDER_REPO`, `'CLOCK'`.
    - fn [emptyCall](../../src/frameworks/bindings.ts#L636) () → BoundCall <!-- internal -->
      <a id="base.bindings.emptyCall"></a><br>A call result with no edges and no reasons yet.
    - fn [finish](../../src/frameworks/bindings.ts#L641) (out: BoundCall) → BoundCall <!-- internal -->
      <a id="base.bindings.finish"></a><br>Sort a call's edges by scope (global first) then target, for stable output.
      - calls [base.bindings.scopeOrder](base.md#base.bindings.scopeOrder)
    - fn [distinctTargets](../../src/frameworks/bindings.ts#L648) (list: readonly T[]) → T[] <!-- internal -->
      <a id="base.bindings.distinctTargets"></a><br>Declarations that name different classes: one per class.
      - calls [base.bindings.key](base.md#base.bindings.key)
    - fn [describe](../../src/frameworks/bindings.ts#L661) (d: Declared) → string <!-- internal -->
      <a id="base.bindings.describe"></a><br>A class with the config line that names it, for messages.
    - fn [merge](../../src/frameworks/bindings.ts#L666) (decls: readonly Plugin[]) → Plugin | null <!-- internal -->
      <a id="base.bindings.merge"></a><br>Declarations of one plugin in config order, merged: a later one changes what it writes.
    - fn [groupBy](../../src/frameworks/bindings.ts#L685) (list: readonly T[], keyOf: (item: T) => string) → Map<string, T[]> <!-- internal -->
      <a id="base.bindings.groupBy"></a><br>Group items by key, keeping their order inside each group.
    - fn [scopeOrder](../../src/frameworks/bindings.ts#L694) (a: string, b: string) → number <!-- internal -->
      <a id="base.bindings.scopeOrder"></a><br>Order scopes with `global` first, then by code units.
    - fn [key](../../src/frameworks/bindings.ts#L699) (name: string) → string <!-- internal -->
      <a id="base.bindings.key"></a><br>The lookup key of a PHP class name: no leading `\`, ASCII lower case.
      - calls [base.bindings.asciiLower](base.md#base.bindings.asciiLower)
    - fn [asciiLower](../../src/frameworks/bindings.ts#L704) (name: string) → string <!-- internal -->
      <a id="base.bindings.asciiLower"></a><br>Lower A–Z only, like PHP compares class names.
  - module [cartridges](../../src/frameworks/cartridges.ts#L1)
    <a id="base.cartridges"></a><br>Salesforce Commerce Cloud cartridges (SFRA): where they are, the cartridge path they are searched in, and what an SFCC `require` names. A cartridge is a directory `…/cartridges/<name>/` with a `cartridge/` inside it; the cartridge path orders them, first cartridge first, and…
    - node [external.node](external.md#external.node)
    - json [base.json](base.md#base.json)
    - type [Cartridge](../../src/frameworks/cartridges.ts#L24)
      <a id="base.cartridges.Cartridge"></a><br>One SFCC cartridge found among the analysed files.
    - type [CartridgeLayout](../../src/frameworks/cartridges.ts#L31)
      <a id="base.cartridges.CartridgeLayout"></a><br>All cartridges, their search order and where that order came from.
    - fn [cartridgeDirs](../../src/frameworks/cartridges.ts#L49) (sources: Iterable<string>) → Cartridge[]
      <a id="base.cartridges.cartridgeDirs"></a><br>The cartridges the analysed files are in, by name; a name met twice is the first directory's.
    - fn [cartridgeLayout](../../src/frameworks/cartridges.ts#L70) (root: string, sources: Iterable<string>, configured: readonly string[] | null) → CartridgeLayout | null
      <a id="base.cartridges.cartridgeLayout"></a><br>The cartridges of the analysed files and their search order; null when the repository has no cartridge and no `dw.json` — no SFCC. `configured`: the `sfcc.cartridgePath` of keylang.json. Without it the order is a hint of `dw.json` (`cartridgePath`/`cartridge_path` as `a:b` or a…
      - calls [base.cartridges.cartridgeDirs](base.md#base.cartridges.cartridgeDirs), [base.cartridges.cartridgePathHint](base.md#base.cartridges.cartridgePathHint)
    - type [CartridgePathHint](../../src/frameworks/cartridges.ts#L107) <!-- internal -->
      <a id="base.cartridges.CartridgePathHint"></a><br>The cartridge path `dw.json` or the root `package.json` writes, and whether `dw.json` exists.
    - fn [cartridgePathHint](../../src/frameworks/cartridges.ts#L114) (root: string) → CartridgePathHint <!-- internal -->
      <a id="base.cartridges.cartridgePathHint"></a><br>Read the cartridge path hint: dw.json fields in order of preference, then the root package.json.
      - calls [base.cartridges.readJson](base.md#base.cartridges.readJson), [base.cartridges.names](base.md#base.cartridges.names), [base.cartridges.field](base.md#base.cartridges.field)
    - fn [names](../../src/frameworks/cartridges.ts#L126) (value: JsonValue | undefined) → string[] | null <!-- internal -->
      <a id="base.cartridges.names"></a><br>`a:b:c` as Business Manager writes it, or a list of names.
      - calls [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [field](../../src/frameworks/cartridges.ts#L136) (value: JsonValue | undefined, key: string) → JsonValue | undefined <!-- internal -->
      <a id="base.cartridges.field"></a><br>`value[key]` when `value` is a JSON object, else undefined.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject)
    - fn [readJson](../../src/frameworks/cartridges.ts#L141) (path: string) → JsonValue | undefined <!-- internal -->
      <a id="base.cartridges.readJson"></a><br>A JSON file's value; undefined when it is absent, null when it does not parse.
      - calls [base.json.parseJson](base.md#base.json.parseJson)
    - fn [cartridgeOf](../../src/frameworks/cartridges.ts#L159) (layout: CartridgeLayout, file: string) → Cartridge | null
      <a id="base.cartridges.cartridgeOf"></a><br>The cartridge a root-relative file belongs to; null outside every cartridge.
    - fn [cartridgeAnswers](../../src/frameworks/cartridges.ts#L176) (layout: CartridgeLayout, fromFile: string, spec: string, probe: (candidate: string) => string | null) → string[] | "external" | null
      <a id="base.cartridges.cartridgeAnswers"></a><br>What an SFCC specifier names from `fromFile`: `external` for the platform API (`dw/…`); otherwise every file that answers, in the order the platform tries them — the first one wins, a second one says the order decided — where an empty list is a specifier keylang knows and no…
      - calls [base.cartridges.cartridgeOf](base.md#base.cartridges.cartridgeOf)
  - module [entries](../../src/frameworks/entries.ts#L1)
    <a id="base.entries"></a><br>What a framework calls from outside, by its config (ADR 0022 п. 5–6, business-flows 08, 10): observers of events (an edge from the event to the observer's fn, and an `observer` entry point), and the entry points a config line names — REST routes, GraphQL resolvers, cron jobs…
    - adapter [base.adapter](base.md#base.adapter)
    - bindings [base.bindings](base.md#base.bindings)
    - type [EntryDeps](../../src/frameworks/entries.ts#L18)
      <a id="base.entries.EntryDeps"></a><br>What the graph lends: its declarations by the names a config writes, and how a call through a type goes.
    - type [ConfigEntry](../../src/frameworks/entries.ts#L40)
      <a id="base.entries.ConfigEntry"></a><br>An entry point a framework's config names: the shape of the snapshot's `EntryPoint` (ADR 0022 п. 5), for the kinds a config writes.
    - type [ObserverEdge](../../src/frameworks/entries.ts#L52)
      <a id="base.entries.ObserverEdge"></a><br>An edge from an event to the fn an observer runs.
    - type [FrameworkEntries](../../src/frameworks/entries.ts#L68)
      <a id="base.entries.FrameworkEntries"></a><br>Everything the framework configs add to the graph: observer edges, event names, entry points and holes.
    - type [Declared](../../src/frameworks/entries.ts#L86) <!-- internal -->
      <a id="base.entries.Declared"></a><br>An observer as one config file declares it, with the area that file configures.
    - fn [frameworkEntries](../../src/frameworks/entries.ts#L96) (inputs: readonly FrameworkInput[], deps: EntryDeps) → FrameworkEntries
      <a id="base.entries.frameworkEntries"></a><br>Turn every adapter's parsed configs into observer edges, entry points and holes; configs that failed to parse are skipped.
      - calls [base.entries.target](base.md#base.entries.target), [base.entries.entryOf](base.md#base.entries.entryOf), [base.entries.effectiveObservers](base.md#base.entries.effectiveObservers), [base.adapter.typeLabel](base.md#base.adapter.typeLabel), [base.entries.controllerEntries](base.md#base.entries.controllerEntries)
    - type [EntryTarget](../../src/frameworks/entries.ts#L152) <!-- internal -->
      <a id="base.entries.EntryTarget"></a><br>The fn an entry runs, and why keylang is not sure of it.
    - fn [target](../../src/frameworks/entries.ts#L158) (deps: EntryDeps, type: TypeName, method: string, area: string) → EntryTarget <!-- internal -->
      <a id="base.entries.target"></a><br>The fn a config's class and method stand for: through a preference of the area when the class is an interface the config binds.
      - calls [base.adapter.typeLabel](base.md#base.adapter.typeLabel)
    - fn [entryOf](../../src/frameworks/entries.ts#L189) (deps: EntryDeps, framework: string, kind: ConfigEntry["kind"], found: EntryTarget, label: string, at: { file: string; line: number }) → ConfigEntry <!-- internal -->
      <a id="base.entries.entryOf"></a><br>The entry point for a found target: placed at the fn's declaration when known, else at the config line.
    - fn [effectiveObservers](../../src/frameworks/entries.ts#L204) (declared: readonly Declared[]) → Declared[] <!-- internal -->
      <a id="base.entries.effectiveObservers"></a><br>Observers in effect, per event, observer name and area: an area's declaration changes the global one there (Magento merges `etc/<area>/` over `etc/`); one disabled, or one of no class, runs nowhere. An area that only repeats the global observer adds nothing.
      - calls [base.adapter.typeLabel](base.md#base.adapter.typeLabel)
    - fn [controllerEntries](../../src/frameworks/entries.ts#L263) (input: FrameworkInput, deps: EntryDeps) → ConfigEntry[] <!-- internal -->
      <a id="base.entries.controllerEntries"></a><br>The controllers of the routes of one framework: every class in a file under `<module dir>/<controller dir>/<Path>/<Action>.php` of a module a route names, labelled `GET|POST /<frontName>/<path>/<action>` by the HTTP interfaces it (or a base) implements, `*` with none.
      - calls [base.entries.asciiLower](base.md#base.entries.asciiLower)
    - fn [asciiLower](../../src/frameworks/entries.ts#L312) (name: string) → string <!-- internal -->
      <a id="base.entries.asciiLower"></a><br>Lower A–Z only, like PHP compares class names.
  - module [events](../../src/frameworks/events.ts#L1)
    <a id="base.events"></a><br>Event IDs (ADR 0022 п. 6, business-flows/08). An event is a node of the snapshot named by its literal, whoever dispatches it: a member of the generated top-level group `events` (`events.checkout_submit_all_after`).
    - fn [eventSegment](../../src/frameworks/events.ts#L26) (name: string) → string
      <a id="base.events.eventSegment"></a><br>The ID segment of an event name: every character a segment does not allow becomes `-`, and a name that does not start like a segment gets `_` in front (`sales.order.place` → `sales-order-place`, `2fa_passed` → `_2fa_passed`).
    - fn [eventIds](../../src/frameworks/events.ts#L37) (names: Iterable<string>) → Map<string, string>
      <a id="base.events.eventIds"></a><br>The ID of every event name, by name: `events.<segment>`. Two names with one segment (`a.b` and `a-b`) keep it in code-unit order of the names; the later ones get `-2`, `-3`…, so the IDs are stable for the same names.
      - calls [base.events.eventSegment](base.md#base.events.eventSegment)
  - module [laravel](../../src/frameworks/laravel.ts#L1)
    <a id="base.laravel"></a><br>The Laravel adapter (ADR 0022; business-flows 35). Laravel writes its wiring in PHP, not in config files: service providers, `routes/*.php`, `routes/console.php` and the console kernel.
    - json [base.json](base.md#base.json)
    - adapter [base.adapter](base.md#base.adapter)
    - fn [readJson](../../src/frameworks/laravel.ts#L48) (text: string | null) → JsonValue <!-- internal -->
      <a id="base.laravel.readJson"></a><br>Parse a JSON file, tolerating a BOM; missing or malformed JSON is `null`, so detection just fails.
      - calls [base.json.parseJson](base.md#base.json.parseJson)
  - module [magento](../../src/frameworks/magento.ts#L1)
    <a id="base.magento"></a><br>The Magento adapter: the config Magento executes, in every module and area. A module is a directory whose `registration.php` registers a `ComponentRegistrar::MODULE`; its `etc/<file>` applies everywhere (`global`), `etc/<area>/<file>` in one area (`frontend`, `adminhtml`…
    - node [external.node](external.md#external.node)
    - saxes [external.saxes](external.md#external.saxes)
    - adapter [base.adapter](base.md#base.adapter)
    - fn [componentRoots](../../src/frameworks/magento.ts#L170) (context: FrameworkContext, pattern: RegExp, files: readonly string[] = context.sources) → string[] <!-- internal -->
      <a id="base.magento.componentRoots"></a><br>Directories of the `registration.php` files of `files` (the analysed sources) whose text registers a component as `pattern` says.
    - fn [scopeOf](../../src/frameworks/magento.ts#L184) (path: string) → string <!-- internal -->
      <a id="base.magento.scopeOf"></a><br>`etc/di.xml` → `global`; `etc/frontend/di.xml` → `frontend`.
    - fn [className](../../src/frameworks/magento.ts#L193) (written: string) → string
      <a id="base.magento.className"></a><br>A class name as Magento resolves it: no leading `\`, no spaces; a generated proxy stands for its class.
    - type [MagentoFacts](../../src/frameworks/magento.ts#L198) <!-- internal -->
      <a id="base.magento.MagentoFacts"></a><br>The facts of a Magento config file: every kind it may hold is present.
    - fn [noFacts](../../src/frameworks/magento.ts#L201) (path: string, scope: string, error: ConfigFacts["error"] = null) → MagentoFacts <!-- internal -->
      <a id="base.magento.noFacts"></a><br>The `ConfigFacts` of a file with no facts, and the reason when it gave none.
    - fn [type](../../src/frameworks/magento.ts#L206) (name: string) → TypeName <!-- internal -->
      <a id="base.magento.type"></a><br>A `TypeName` from a class name as the config writes it.
      - calls [base.magento.className](base.md#base.magento.className)
    - type [XmlElement](../../src/frameworks/magento.ts#L211)
      <a id="base.magento.XmlElement"></a><br>An element of a config file, with where its start tag is and the text directly in it.
    - fn [parseXml](../../src/frameworks/magento.ts#L221) (path: string, text: string) → { root: XmlElement | null; error: { line: number; reason: string } | null }
      <a id="base.magento.parseXml"></a><br>The root element of an XML file, or why it does not parse.
    - fn [fromXml](../../src/frameworks/magento.ts#L263) (path: string, text: string, read: (root: XmlElement, facts: MagentoFacts) => void) → ConfigFacts <!-- internal -->
      <a id="base.magento.fromXml"></a><br>The facts of an XML config file: `read` takes them from the root element. A file that does not parse gives none, only the reason.
      - calls [base.magento.noFacts](base.md#base.magento.noFacts), [base.magento.scopeOf](base.md#base.magento.scopeOf), [base.magento.parseXml](base.md#base.magento.parseXml)
    - fn [childrenNamed](../../src/frameworks/magento.ts#L275) (element: XmlElement, name: string) → XmlElement[] <!-- internal -->
      <a id="base.magento.childrenNamed"></a><br>The direct children of an element with a given tag name, in document order.
    - fn [flag](../../src/frameworks/magento.ts#L280) (value: string | undefined) → boolean <!-- internal -->
      <a id="base.magento.flag"></a><br>`true` or `1` in an attribute Magento reads as a boolean.
    - fn [parseDi](../../src/frameworks/magento.ts#L285) (path: string, text: string) → ConfigFacts
      <a id="base.magento.parseDi"></a><br>The facts of one `di.xml`.
      - calls [base.magento.fromXml](base.md#base.magento.fromXml), [base.magento.type](base.md#base.magento.type), [base.magento.className](base.md#base.magento.className), [base.magento.childrenNamed](base.md#base.magento.childrenNamed), [base.magento.flag](base.md#base.magento.flag)
    - fn [parseEvents](../../src/frameworks/magento.ts#L336) (path: string, text: string) → ConfigFacts
      <a id="base.magento.parseEvents"></a><br>`etc/events.xml`: `<event name="e"><observer name="o" instance="C" method="m" disabled="true"/>`.
      - calls [base.magento.fromXml](base.md#base.magento.fromXml), [base.magento.childrenNamed](base.md#base.magento.childrenNamed), [base.magento.type](base.md#base.magento.type), [base.magento.flag](base.md#base.magento.flag)
    - fn [parseRoutes](../../src/frameworks/magento.ts#L356) (path: string, text: string) → ConfigFacts
      <a id="base.magento.parseRoutes"></a><br>`etc/<area>/routes.xml`: `<router id="standard"><route id="checkout" frontName="checkout"><module name="Magento_Checkout"/>`.
      - calls [base.magento.fromXml](base.md#base.magento.fromXml), [base.magento.childrenNamed](base.md#base.magento.childrenNamed)
    - fn [parseWebapi](../../src/frameworks/magento.ts#L373) (path: string, text: string) → ConfigFacts
      <a id="base.magento.parseWebapi"></a><br>`etc/webapi.xml`: `<route url="/V1/x" method="POST"><service class="I" method="m"/><resources><resource ref="self"/>` → `rest`, labelled `POST /V1/x [self]`.
      - calls [base.magento.fromXml](base.md#base.magento.fromXml), [base.magento.childrenNamed](base.md#base.magento.childrenNamed), [base.magento.type](base.md#base.magento.type)
    - fn [parseCrontab](../../src/frameworks/magento.ts#L398) (path: string, text: string) → ConfigFacts
      <a id="base.magento.parseCrontab"></a><br>`etc/crontab.xml`: `<group id="default"><job name="n" instance="C" method="m"><schedule>0 0 * * *</schedule>` → `cron`, labelled `n 0 0 * * *` (the schedule last, as `every` reads it); a job the admin's config schedules says `(config_path …)` instead.
      - calls [base.magento.fromXml](base.md#base.magento.fromXml), [base.magento.childrenNamed](base.md#base.magento.childrenNamed), [base.magento.type](base.md#base.magento.type)
    - fn [parseConsumers](../../src/frameworks/magento.ts#L419) (path: string, text: string) → ConfigFacts
      <a id="base.magento.parseConsumers"></a><br>`etc/queue_consumer.xml`: `<consumer name="n" queue="q" handler="C::m"/>` → `consumer` on `C::m`; without a handler, the `consumerInstance`'s `process`.
      - calls [base.magento.fromXml](base.md#base.magento.fromXml), [base.magento.childrenNamed](base.md#base.magento.childrenNamed), [base.magento.type](base.md#base.magento.type)
    - fn [parseGraphql](../../src/frameworks/magento.ts#L449) (path: string, text: string) → ConfigFacts
      <a id="base.magento.parseGraphql"></a><br>`etc/schema.graphqls`: a field with `@resolver(class: "C")` → `graphql` on `C::resolve`, labelled `Type.field`. A small scanner over the SDL (no XML, no parser package for it): comments, strings, braces and parentheses; a field is a name followed by `(` or `:` right inside a…
      - calls [base.magento.noFacts](base.md#base.magento.noFacts), [base.magento.scopeOf](base.md#base.magento.scopeOf), [base.magento.type](base.md#base.magento.type)
  - module [nestjs](../../src/frameworks/nestjs.ts#L1)
    <a id="base.nestjs"></a><br>The NestJS adapter (ADR 0022). NestJS keeps its configuration in the code: decorators the framework runs when it boots.
    - node [external.node](external.md#external.node)
    - json [base.json](base.md#base.json)
    - adapter [base.adapter](base.md#base.adapter)
    - fn [ownerOf](../../src/frameworks/nestjs.ts#L69) (path: string) → string | null <!-- internal -->
      <a id="base.nestjs.ownerOf"></a><br>The directory that owns a config file; null for a file at the root.
    - fn [emptyFacts](../../src/frameworks/nestjs.ts#L76) (path: string) → ConfigFacts <!-- internal -->
      <a id="base.nestjs.emptyFacts"></a><br>Config facts with every list empty, including the NestJS-only providers, injections and observers.
    - fn [nestFacts](../../src/frameworks/nestjs.ts#L81) (path: string, file: CodeFacts) → ConfigFacts
      <a id="base.nestjs.nestFacts"></a><br>The providers, injections and event observers the decorators of one source file declare.
      - calls [base.nestjs.emptyFacts](base.md#base.nestjs.emptyFacts), [base.nestjs.classes](base.md#base.nestjs.classes)
    - fn [classes](../../src/frameworks/nestjs.ts#L156) (decls: readonly CodeDecl[]) → CodeDecl[] <!-- internal -->
      <a id="base.nestjs.classes"></a><br>The top-level classes of a file.
    - fn [readJson](../../src/frameworks/nestjs.ts#L161) (text: string | null) → JsonValue <!-- internal -->
      <a id="base.nestjs.readJson"></a><br>Parse a JSON file, tolerating a BOM; missing or malformed JSON is `null`.
      - calls [base.json.parseJson](base.md#base.json.parseJson)
  - module [pwa-kit](../../src/frameworks/pwa-kit.ts#L1)
    <a id="base.pwa-kit"></a><br>The PWA Kit adapter: Salesforce Composable Storefront (ADR 0022). A project is a directory whose `package.json` writes `ccExtensibility` (template extensibility: `extends` names the base template package, `overridesDir` the directory whose `app/…` files replace the base's) or…
    - node [external.node](external.md#external.node)
    - json [base.json](base.md#base.json)
    - adapter [base.adapter](base.md#base.adapter)
    - type [Extensibility](../../src/frameworks/pwa-kit.ts#L41)
      <a id="base.pwa-kit.Extensibility"></a><br>Template extensibility of a `package.json`: the base package and the overrides directory (POSIX, relative to the manifest, no `./`).
    - fn [extensibilityOf](../../src/frameworks/pwa-kit.ts#L47) (manifest: JsonValue) → Extensibility | null
      <a id="base.pwa-kit.extensibilityOf"></a><br>`ccExtensibility` of a parsed `package.json`; null when it writes none or no base package.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [projects](../../src/frameworks/pwa-kit.ts#L104) (context: Pick<FrameworkContext, "sources" | "read">) → { dir: string; extensibility: Extensibility | null }[]
      <a id="base.pwa-kit.projects"></a><br>The PWA Kit projects of the analysis: the root, and each directory above an `app/routes.*` or `app/ssr.*`, whose `package.json` says so.
      - calls [base.pwa-kit.readJson](base.md#base.pwa-kit.readJson), [base.pwa-kit.extensibilityOf](base.md#base.pwa-kit.extensibilityOf), [base.json.isJsonObject](base.md#base.json.isJsonObject)
    - fn [readJson](../../src/frameworks/pwa-kit.ts#L137) (text: string | null) → JsonValue <!-- internal -->
      <a id="base.pwa-kit.readJson"></a><br>Parse a JSON file, tolerating a BOM; missing or malformed JSON is `null`.
      - calls [base.json.parseJson](base.md#base.json.parseJson)
  - module [python-web](../../src/frameworks/python-web.ts#L1)
    <a id="base.python-web"></a><br>The Python web adapters (ADR 0022 п. 2, 5; business-flows/38): Django, FastAPI, Flask and Celery. Each is detected from a dependency in a root manifest (`pyproject.toml`, `requirements*.txt`, `setup.py`, `setup.cfg`, `Pipfile`) or an analysed Python file that imports the package.
    - node [external.node](external.md#external.node)
    - adapter [base.adapter](base.md#base.adapter)
    - type [PythonWebSpec](../../src/frameworks/python-web.ts#L25) <!-- internal -->
      <a id="base.python-web.PythonWebSpec"></a><br>What tells one Python framework apart; the adapter itself is the same for all four.
    - fn [pythonWebAdapter](../../src/frameworks/python-web.ts#L36) (spec: PythonWebSpec) → FrameworkAdapter <!-- internal -->
      <a id="base.python-web.pythonWebAdapter"></a><br>Build the adapter of one Python framework from its spec.
  - module [react-router](../../src/frameworks/react-router.ts#L1)
    <a id="base.react-router"></a><br>The React Router adapter (framework mode, v7; ADR 0022): file-system routes of `@react-router/fs-routes`. An app directory is `app/` or `src/` (or the literal `appDirectory` of `react-router.config.*`) holding a `root.*` and a `routes.*` whose default export calls…
    - node [external.node](external.md#external.node)
    - json [base.json](base.md#base.json)
    - adapter [base.adapter](base.md#base.adapter)
    - type [App](../../src/frameworks/react-router.ts#L82) <!-- internal -->
      <a id="base.react-router.App"></a><br>An app directory: its route config and the directories of its route modules.
    - fn [apps](../../src/frameworks/react-router.ts#L88) (context: Pick<FrameworkContext, "sources" | "read" | "dirs" | "analysed">) → App[] <!-- internal -->
      <a id="base.react-router.apps"></a><br>The app directories of the project: a literal `appDirectory`, else `app/` and `src/`, each needing `routes.*` and `root.*`.
      - calls [base.react-router.normalize](base.md#base.react-router.normalize)
    - fn [routeModules](../../src/frameworks/react-router.ts#L115) (sources: readonly string[], dir: string) → string[]
      <a id="base.react-router.routeModules"></a><br>The route modules of a routes directory, sorted: `<name>.<ext>` and `<name>/route.<ext>`, tests left out.
    - fn [routeId](../../src/frameworks/react-router.ts#L128) (dir: string, path: string) → string
      <a id="base.react-router.routeId"></a><br>The route ID of a route module: its file name without the extension, or its folder.
    - fn [flatRoutePath](../../src/frameworks/react-router.ts#L140) (id: string) → string
      <a id="base.react-router.flatRoutePath"></a><br>The URL path of a flat route ID (`_app.orders.$orderNo` → `/orders/:orderNo`): `.` separates segments (`[.]` escapes), `_x` is pathless, `x_` opts out of the layout but keeps `x`, `_index` is the index, `$x` a parameter, `$` the splat, `(x)` optional.
      - calls [base.react-router.splitSegments](base.md#base.react-router.splitSegments)
    - fn [isLayout](../../src/frameworks/react-router.ts#L163) (id: string, ids: readonly string[]) → boolean
      <a id="base.react-router.isLayout"></a><br>Whether another route ID nests under this one (`_app` of `_app.cart`).
      - calls [base.react-router.splitSegments](base.md#base.react-router.splitSegments)
    - fn [splitSegments](../../src/frameworks/react-router.ts#L175) (id: string) → string[] <!-- internal -->
      <a id="base.react-router.splitSegments"></a><br>Split a route ID at `.`, except inside `[…]` escapes.
    - fn [normalize](../../src/frameworks/react-router.ts#L196) (dir: string) → string <!-- internal -->
      <a id="base.react-router.normalize"></a><br>A directory as POSIX, relative, without `./` or a trailing slash.
    - fn [depends](../../src/frameworks/react-router.ts#L201) (context: Pick<FrameworkContext, "read">) → boolean <!-- internal -->
      <a id="base.react-router.depends"></a><br>Whether the root `package.json` depends on a React Router framework package; unparseable JSON is no.
      - calls [base.json.parseJson](base.md#base.json.parseJson), [base.json.isJsonObject](base.md#base.json.isJsonObject)
  - module [sfcc](../../src/frameworks/sfcc.ts#L1)
    <a id="base.sfcc"></a><br>The Salesforce Commerce Cloud adapter (SFRA cartridges; ADR 0022 п. 2, 5). Detected from a cartridge among the analysed files (`…/cartridges/<c>/cartridge/…`) or a `dw.json`.
    - node [external.node](external.md#external.node)
    - json [base.json](base.md#base.json)
    - adapter [base.adapter](base.md#base.adapter)
    - cartridges [base.cartridges](base.md#base.cartridges)
    - fn [hooksFileOf](../../src/frameworks/sfcc.ts#L54) (dir: string, context: Pick<FrameworkContext, "read">) → string | null <!-- internal -->
      <a id="base.sfcc.hooksFileOf"></a><br>The hooks file a cartridge's `package.json` names in `hooks`, relative to the cartridge; null when it names none.
      - calls [base.sfcc.field](base.md#base.sfcc.field), [base.sfcc.readJson](base.md#base.sfcc.readJson), [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [parseSfccConfig](../../src/frameworks/sfcc.ts#L74) (path: string, text: string) → ConfigFacts
      <a id="base.sfcc.parseSfccConfig"></a><br>Entry facts of one SFCC config file. `hooks.json` (`{"hooks": [{"name", "script"}]}`): an `observer` per hook, its script written from the cartridge's root (`./cartridge/scripts/…`) or from the hooks file, its fn the hook's last segment (`dw.order.calculate` → `calculate`).…
      - calls [base.sfcc.readJson](base.md#base.sfcc.readJson), [base.sfcc.field](base.md#base.sfcc.field), [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [field](../../src/frameworks/sfcc.ts#L130) (value: JsonValue | undefined, key: string) → JsonValue | undefined <!-- internal -->
      <a id="base.sfcc.field"></a><br>`value[key]` when `value` is a JSON object, else undefined.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject)
    - type [ParsedConfig](../../src/frameworks/sfcc.ts#L135) <!-- internal -->
      <a id="base.sfcc.ParsedConfig"></a><br>A config file's JSON, or why it does not parse; an absent file is `null` without an error.
    - fn [readJson](../../src/frameworks/sfcc.ts#L141) (text: string | null) → ParsedConfig <!-- internal -->
      <a id="base.sfcc.readJson"></a><br>Parse a JSON file, tolerating a BOM; the parse error message is kept for the config fact.
      - calls [base.json.parseJson](base.md#base.json.parseJson)
  - module [symfony](../../src/frameworks/symfony.ts#L1)
    <a id="base.symfony"></a><br>The Symfony adapter (ADR 0022; business-flows 36). The container is written in `config/services.yaml` (and `services_<env>.yaml`): an alias `I: '@C'` or `I: { alias: C }` binds an interface, `arguments: { $p: '@C' }` sets a constructor argument of one service, `bind: { $p: '@C'…
    - node [external.node](external.md#external.node)
    - yaml [external.yaml](external.md#external.yaml)
    - json [base.json](base.md#base.json)
    - adapter [base.adapter](base.md#base.adapter)
    - fn [type](../../src/frameworks/symfony.ts#L32) (name: string) → TypeName <!-- internal -->
      <a id="base.symfony.type"></a><br>A type reference by class name, the form adapter facts use.
    - fn [key](../../src/frameworks/symfony.ts#L35) (name: string) → string <!-- internal -->
      <a id="base.symfony.key"></a><br>PHP class names compare without ASCII case.
    - fn [readJson](../../src/frameworks/symfony.ts#L72) (text: string | null) → JsonValue <!-- internal -->
      <a id="base.symfony.readJson"></a><br>Parse a JSON file, tolerating a BOM; missing or malformed JSON is `null`.
      - calls [base.json.parseJson](base.md#base.json.parseJson)
    - fn [className](../../src/frameworks/symfony.ts#L83) (written: string) → string <!-- internal -->
      <a id="base.symfony.className"></a><br>A class name as a Symfony config writes it: no leading `\`, single separators.
    - fn [parseSymfonyConfig](../../src/frameworks/symfony.ts#L97) (path: string, text: string) → ConfigFacts
      <a id="base.symfony.parseSymfonyConfig"></a><br>The facts of one Symfony config file. `services*.yaml`: aliases (bindings), `arguments` and `bind` (constructor arguments; under `_defaults` for every class); `routes*.yaml`: routes with `path` and `controller`, and the `prefix` of an attribute import of a directory. XML and…
      - calls [base.symfony.argument](base.md#base.symfony.argument), [base.symfony.isTextScalar](base.md#base.symfony.isTextScalar), [base.symfony.serviceRef](base.md#base.symfony.serviceRef), [base.symfony.type](base.md#base.symfony.type), [base.symfony.className](base.md#base.symfony.className), [base.symfony.key](base.md#base.symfony.key), [base.symfony.mapJson](base.md#base.symfony.mapJson), [base.json.isJsonString](base.md#base.json.isJsonString), [base.symfony.isStructured](base.md#base.symfony.isStructured), [base.json.isJsonObject](base.md#base.json.isJsonObject)
    - fn [serviceRef](../../src/frameworks/symfony.ts#L241) (value: string) → string | null <!-- internal -->
      <a id="base.symfony.serviceRef"></a><br>`'@App\Infra\Mailer'` → the class; `@?x`, `@=expr`, a service id that is no class → null.
      - calls [base.symfony.className](base.md#base.symfony.className)
    - fn [argument](../../src/frameworks/symfony.ts#L249) (facts: ConfigFacts, owner: string, pair: Pair, at: (node: YamlNode | Pair | null | undefined) => { line: number; col: number }, hole: (node: YamlNode | Pair | null | undefined, text: string, reason: string) => void) → void <!-- internal -->
      <a id="base.symfony.argument"></a><br>`$param: '@C'` (or `I $param: '@C'`) of `arguments` or `bind`: the constructor argument `param` of `owner` is a `C`.
      - calls [base.symfony.isTextScalar](base.md#base.symfony.isTextScalar), [base.symfony.serviceRef](base.md#base.symfony.serviceRef), [base.symfony.type](base.md#base.symfony.type)
    - fn [isTextScalar](../../src/frameworks/symfony.ts#L272) (node: YamlNode | null) → node is Scalar<string> <!-- internal -->
      <a id="base.symfony.isTextScalar"></a><br>A YAML scalar whose value is a string: a class name, a service reference.
    - fn [isStructured](../../src/frameworks/symfony.ts#L277) (value: JsonValue | undefined) → boolean <!-- internal -->
      <a id="base.symfony.isStructured"></a><br>A route field written as a map or a list: a form keylang does not read where it expects a string.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject)
    - fn [mapJson](../../src/frameworks/symfony.ts#L282) (map: YAMLMap) → JsonObject <!-- internal -->
      <a id="base.symfony.mapJson"></a><br>A route of `routes.yaml` as plain data.
  - module [web](../../src/frameworks/web.ts#L1)
    <a id="base.web"></a><br>The JavaScript web adapters (ADR 0022; business-flows/37): Express, Fastify and Next.js. These frameworks keep their routing in the code itself — `app.use('/api', router)`, `fastify.register(plugin, { prefix })`, the files of `pages/api/`, `'use server'`, `middleware.ts` — so…
    - node [external.node](external.md#external.node)
    - json [base.json](base.md#base.json)
    - adapter [base.adapter](base.md#base.adapter)
    - fn [depends](../../src/frameworks/web.ts#L36) (context: FrameworkContext, pkg: string) → boolean <!-- internal -->
      <a id="base.web.depends"></a><br>Whether the root `package.json` lists `pkg` as any kind of dependency.
      - calls [base.web.readJson](base.md#base.web.readJson), [base.json.isJsonObject](base.md#base.json.isJsonObject)
    - fn [owner](../../src/frameworks/web.ts#L43) (path: string) → string | null <!-- internal -->
      <a id="base.web.owner"></a><br>The directory that owns a config file; null for a file at the root.
    - fn [emptyFacts](../../src/frameworks/web.ts#L50) (path: string) → ConfigFacts <!-- internal -->
      <a id="base.web.emptyFacts"></a><br>The facts `parse` gives: none, since the extractor records these frameworks' registrations.
    - fn [routerAdapter](../../src/frameworks/web.ts#L55) (name: string, pkg: string, marker: RegExp) → FrameworkAdapter <!-- internal -->
      <a id="base.web.routerAdapter"></a><br>Express and Fastify: the files that import the package, or register a route, a mount or a plugin.
      - calls [base.web.depends](base.md#base.web.depends), [base.web.owner](base.md#base.web.owner)
    - fn [readJson](../../src/frameworks/web.ts#L117) (text: string | null) → JsonValue <!-- internal -->
      <a id="base.web.readJson"></a><br>Parse a JSON file, tolerating a BOM; missing or malformed JSON is `null`.
      - calls [base.json.parseJson](base.md#base.json.parseJson)
  - module [glob](../../src/glob.ts#L1)
    <a id="base.glob"></a><br>Minimal glob matching for `keylang.json` (no dependency, no experimental Node API). Supports `**`, `*`, `?` and `{a,b}`; `[` is a literal (Next.js `app/[id]/page.tsx`).
    - fn [globToRegExp](../../src/glob.ts#L17) (glob: string) → RegExp
      <a id="base.glob.globToRegExp"></a><br>The anchored RegExp of a glob, compiled once. It has no `g` or `y` flag, so sharing it keeps `test` stateless.
      - calls [base.glob.source](base.md#base.glob.source)
    - fn [source](../../src/glob.ts#L32) (glob: string) → string <!-- internal -->
      <a id="base.glob.source"></a><br>The regex body of a glob; each `{a,b}` alternative is a glob itself (`{src/**,lib/*.ts}`).
      - calls [base.glob.closingBrace](base.md#base.glob.closingBrace), [base.glob.splitAlternatives](base.md#base.glob.splitAlternatives), [base.glob.escape](base.md#base.glob.escape)
    - fn [closingBrace](../../src/glob.ts#L73) (glob: string, open: number) → number <!-- internal -->
      <a id="base.glob.closingBrace"></a><br>Index of the `}` that closes the `{` at `open`, counting nested braces; -1 when unclosed.
    - fn [splitAlternatives](../../src/glob.ts#L85) (body: string) → string[] <!-- internal -->
      <a id="base.glob.splitAlternatives"></a><br>Top-level commas of a brace body: `a,{b,c}` → `a`, `{b,c}`.
    - fn [escape](../../src/glob.ts#L105) (s: string) → string <!-- internal -->
      <a id="base.glob.escape"></a><br>Escape regex metacharacters; `[` is among them, so a bracket in a path stays literal.
    - fn [matchesGlob](../../src/glob.ts#L110) (path: string, glob: string) → boolean
      <a id="base.glob.matchesGlob"></a><br>True when the whole POSIX-relative `path` matches `glob`.
      - calls [base.glob.globToRegExp](base.md#base.glob.globToRegExp)
    - fn [firstMatchingGlob](../../src/glob.ts#L115) (path: string, globs: readonly string[]) → string | null
      <a id="base.glob.firstMatchingGlob"></a><br>The first of `globs` that matches `path`, or null.
      - calls [base.glob.globToRegExp](base.md#base.glob.globToRegExp)
    - fn [globDirectory](../../src/glob.ts#L127) (globs: readonly string[]) → string | null
      <a id="base.glob.globDirectory"></a><br>The one directory a set of globs owns: `D` when every glob is `D/**` or `D/**` followed by a file pattern, else null. A set that lists files, or spreads over two directories, owns none, so a README beside its files does not speak for it.
    - fn [globPrefix](../../src/glob.ts#L142) (glob: string) → string
      <a id="base.glob.globPrefix"></a><br>Directory prefix of a glob, up to the first wildcard: `src/domain/**` → `src/domain`.
  - module [json](../../src/json.ts#L1)
    <a id="base.json"></a><br>JSON values at I/O boundaries: what `JSON.parse` returns, named so callers branch on a known contract instead of `unknown`. Used wherever external JSON enters: config, index, LLM replies, LSP/MCP messages.
    - type [JsonPrimitive](../../src/json.ts#L6) = string | number | boolean | null
      <a id="base.json.JsonPrimitive"></a>
    - type [JsonValue](../../src/json.ts#L8) = JsonPrimitive | JsonValue[] | JsonObject
      <a id="base.json.JsonValue"></a>
    - type [JsonObject](../../src/json.ts#L10) = { [key: string]: JsonValue }
      <a id="base.json.JsonObject"></a>
    - fn [parseJson](../../src/json.ts#L13) (text: string) → JsonValue
      <a id="base.json.parseJson"></a><br>Parses JSON text; throws `SyntaxError` like `JSON.parse`.
    - fn [isJsonObject](../../src/json.ts#L19) (value: JsonValue | undefined) → value is JsonObject
      <a id="base.json.isJsonObject"></a><br>True for a plain JSON object; arrays and `null` are excluded although `typeof` says "object".
    - fn [isJsonString](../../src/json.ts#L24) (value: JsonValue | undefined) → value is string
      <a id="base.json.isJsonString"></a><br>Narrows a JSON value to a string.
    - fn [isJsonNumber](../../src/json.ts#L29) (value: JsonValue | undefined) → value is number
      <a id="base.json.isJsonNumber"></a><br>Narrows a JSON value to a number.
    - fn [isJsonBoolean](../../src/json.ts#L34) (value: JsonValue | undefined) → value is boolean
      <a id="base.json.isJsonBoolean"></a><br>Narrows a JSON value to a boolean.
  - module [languages](../../src/languages.ts#L1)
    <a id="base.languages"></a><br>Languages keylang indexes: names, file extensions and the default module granularity. Plain data, so config and the language core know which files are source without loading any frontend or grammar.
    - type [LanguageInfo](../../src/languages.ts#L10)
      <a id="base.languages.LanguageInfo"></a><br>What keylang needs to know about one source language, without its grammar.
    - type [Language](../../src/languages.ts#L43) = keyof typeof LANGUAGES
      <a id="base.languages.Language"></a><br>A supported language name (`typescript`, `php`…).
    - fn [isLanguage](../../src/languages.ts#L49) (name: unknown) → name is Language
      <a id="base.languages.isLanguage"></a><br>Narrows a config value to a supported language name.
    - fn [languageOf](../../src/languages.ts#L54) (path: string) → Language | undefined
      <a id="base.languages.languageOf"></a><br>The language a path belongs to by its extension, or `undefined` for a non-source file.
    - fn [constructorName](../../src/languages.ts#L63) (file: string | null | undefined) → string | null
      <a id="base.languages.constructorName"></a><br>The member a call of a class declared in `file` runs; JS `constructor` for a file of no known language.
      - calls [base.languages.languageOf](base.md#base.languages.languageOf)
    - fn [caselessNames](../../src/languages.ts#L70) (file: string | null | undefined) → boolean
      <a id="base.languages.caselessNames"></a><br>Classes, functions and methods declared in `file` compare their names without ASCII case: by `asciiLowerCase`.
      - calls [base.languages.languageOf](base.md#base.languages.languageOf)
    - fn [asciiLowerCase](../../src/languages.ts#L82) (name: string) → string
      <a id="base.languages.asciiLowerCase"></a><br>`name` with A–Z lowered and every other character kept: how PHP compares class, function and method names (from 8.2 whatever the locale). `ORDER` is `order`, while `Äpfel` and `äpfel` stay two names, which `toLowerCase` would make one.
    - fn [interfaceTypes](../../src/languages.ts#L87) (file: string | null | undefined) → boolean
      <a id="base.languages.interfaceTypes"></a><br>The type declarations of `file`'s language are interfaces: a call through a value typed with one goes to a class the code does not name.
      - calls [base.languages.languageOf](base.md#base.languages.languageOf)
    - fn [implicitMember](../../src/languages.ts#L94) (file: string | null | undefined, name: string) → boolean
      <a id="base.languages.implicitMember"></a><br>A member of a class in `file` that the language calls without naming it.
      - calls [base.languages.languageOf](base.md#base.languages.languageOf)
  - module [line-diff](../../src/line-diff.ts#L1)
    <a id="base.line-diff"></a><br>A line diff as hunks (business-flows/24 moved it here from `tui/merge.ts`): MERGE in the TUI takes them one by one, and a diagram proposal of `keylang web` names how many its targets hold. Pure, no dependencies.
    - type [Hunk](../../src/line-diff.ts#L6)
      <a id="base.line-diff.Hunk"></a>
    - fn [diffLines](../../src/line-diff.ts#L15) (base: readonly string[], proposed: readonly string[]) → Hunk[]
      <a id="base.line-diff.diffLines"></a><br>Longest-common-subsequence diff; specs are small enough for the quadratic table.
  - module [safe-write](../../src/safe-write.ts#L1)
    <a id="base.safe-write"></a><br>One protocol for every file keylang writes into a repository: proposals, `spec-to-code --apply`, `wire`, `.keylang/stats.json`, explanations, the map with its index and fact cache (byte-exact, see `writeAtomic`). The path is plain and relative, and it stays inside the…
    - node [external.node](external.md#external.node)
    - type [WriteOptions](../../src/safe-write.ts#L22)
      <a id="base.safe-write.WriteOptions"></a><br>Guards a write: where it may land, who may replace a generated file, and what the file must still hold.
    - type [PlannedWrite](../../src/safe-write.ts#L36)
      <a id="base.safe-write.PlannedWrite"></a><br>One write of a batch for `safeWriteAll`.
    - fn [targetProblem](../../src/safe-write.ts#L54) (root: string, path: string, options: Pick<WriteOptions, "under"> = {}) → string | null
      <a id="base.safe-write.targetProblem"></a><br>Why `path` (relative to `root`, POSIX) may not be a target of keylang's at all — written, removed or read as keylang's own file — or null: not a plain relative path, a loop of links, or a place outside the repository (or outside `under`) once every link on the way is followed.…
      - calls [base.safe-write.landing](base.md#base.safe-write.landing), [base.safe-write.inside](base.md#base.safe-write.inside)
    - fn [writeProblem](../../src/safe-write.ts#L78) (root: string, path: string, options: WriteOptions = {}) → string | null
      <a id="base.safe-write.writeProblem"></a><br>Why `path` (relative to `root`, POSIX) may not be written, or null. Reads nothing outside the repository.
      - calls [base.safe-write.targetProblem](base.md#base.safe-write.targetProblem), [base.safe-write.landing](base.md#base.safe-write.landing), [base.safe-write.statOrNull](base.md#base.safe-write.statOrNull), [base.safe-write.isGeneratedText](base.md#base.safe-write.isGeneratedText)
    - fn [safeWrite](../../src/safe-write.ts#L104) (root: string, path: string, text: string, options: WriteOptions = {}) → string
      <a id="base.safe-write.safeWrite"></a><br>Writes `text` to `path` (relative to `root`, POSIX) when `writeProblem` finds nothing, and returns the absolute path; throws `path: problem` otherwise. A symlinked file is written at its target, so the link stays.
      - calls [base.safe-write.safeWriteAll](base.md#base.safe-write.safeWriteAll)
    - fn [safeWriteAll](../../src/safe-write.ts#L109) (root: string, writes: readonly PlannedWrite[]) → string[]
      <a id="base.safe-write.safeWriteAll"></a><br>Every write is checked before the first one happens: either all land, or (short of an I/O error) none does.
      - calls [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic), [base.safe-write.landing](base.md#base.safe-write.landing)
    - type [TemporaryWriteOptions](../../src/safe-write.ts#L126) = { flag: "wx"; mode?: number } <!-- internal -->
      <a id="base.safe-write.TemporaryWriteOptions"></a><br>How the temporary file of `writeAtomic` is created: `mode` copies the replaced file's permissions.
    - fn [writeAtomic](../../src/safe-write.ts#L136) (abs: string, text: string, options: { exact?: boolean } = {}) → void
      <a id="base.safe-write.writeAtomic"></a><br>A temporary file in the target's directory renamed over the target, so a crash never leaves half a file; missing directories are created. The new file keeps the permissions of the one it replaces, and CRLF when that one has CRLF on every line — unless `exact`: a generated…
      - calls [base.safe-write.statOrNull](base.md#base.safe-write.statOrNull), [base.safe-write.allCrlf](base.md#base.safe-write.allCrlf)
    - fn [isGeneratedText](../../src/safe-write.ts#L168) (text: string) → boolean
      <a id="base.safe-write.isGeneratedText"></a><br>The first non-empty line is a `keylang:generated` marker: `<!-- … -->` of a map file, `// …` of `keylang wire`, `' …` or `%% …` of a PlantUML or Mermaid diagram of `keylang export c4`.
    - fn [allCrlf](../../src/safe-write.ts#L177) (text: string) → boolean
      <a id="base.safe-write.allCrlf"></a><br>Every line ends with CRLF (at least one does): the file keeps them when it is rewritten.
    - fn [keepLineEndings](../../src/safe-write.ts#L192) (before: string, next: string) → string
      <a id="base.safe-write.keepLineEndings"></a><br>`next`, an edit of `before` computed on its LF form, in the line endings of `before`. LF stays LF and CRLF on every line stays CRLF on every line.
      - calls [base.safe-write.allCrlf](base.md#base.safe-write.allCrlf)
    - fn [landing](../../src/safe-write.ts#L245) (abs: string, hops = 0) → string | null
      <a id="base.safe-write.landing"></a><br>Where bytes written to `abs` land: the longest prefix that exists is resolved through links, and a link on the way is followed even when its target does not exist yet. Null for a loop of links.
      - calls [base.safe-write.lstatOrNull](base.md#base.safe-write.lstatOrNull)
    - fn [inside](../../src/safe-write.ts#L267) (abs: string, dir: string) → boolean <!-- internal -->
      <a id="base.safe-write.inside"></a><br>`abs` is `dir` itself or below it.
    - fn [lstatOrNull](../../src/safe-write.ts#L273) (abs: string) → Stats | null <!-- internal -->
      <a id="base.safe-write.lstatOrNull"></a><br>Wraps `lstatSync` on a path, returning the stat result (without following symlinks) or `null` when the call throws for any reason, such as the path not existing. It is only used by [`base.safe-write.landing`](base.md#base.safe-write.landing), which relies on the null return to detect missing paths while walking… _(llm · claude · 2026-10-04)_
    - fn [statOrNull](../../src/safe-write.ts#L281) (abs: string) → Stats | null <!-- internal -->
      <a id="base.safe-write.statOrNull"></a><br>Wraps a synchronous filesystem stat call so that any failure (missing path, permission error, etc.) yields `null` instead of throwing, giving [`base.safe-write.writeAtomic`](base.md#base.safe-write.writeAtomic) and [`base.safe-write.writeProblem`](base.md#base.safe-write.writeProblem) a non-throwing way to check whether a target path exists and inspect… _(llm · claude · 2026-10-04)_
  - module [span](../../src/span.ts#L1)
    <a id="base.span"></a><br>Source positions shared by the whole Markdown pipeline (Text IR, SpecIR, resolve, rules) and by the editor surfaces (LSP, MCP). Every node, name, link and reference carries a Span so that diagnostics and the LSP (hover, definition) can point at it.
    - type [Pos](../../src/span.ts#L12)
      <a id="base.span.Pos"></a><br>A position in a source file. `offset` is an index into the file text (UTF-16 code units, i.e. a JS string index — what LSP expects); `line` and `col` are 1-based, `col` counts Unicode code points.
    - type [Span](../../src/span.ts#L19)
      <a id="base.span.Span"></a><br>Half-open range `[start, end)`.
    - type [Spanned](../../src/span.ts#L25)
      <a id="base.span.Spanned"></a><br>A value together with the place it was written.
    - fn [spanContains](../../src/span.ts#L31) (span: Span, offset: number) → boolean
      <a id="base.span.spanContains"></a><br>The span covers `offset` (half-open: the end offset itself is outside).
    - fn [compareText](../../src/span.ts#L36) (a: string, b: string) → number
      <a id="base.span.compareText"></a><br>Code-unit order of two strings, for stable sorting of ids and paths.
