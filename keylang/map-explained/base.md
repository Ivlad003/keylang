<!-- keylang:generated — не редагувати, `keylang map` -->

[README](README.md) · modules: [brief](#base.brief) · [config](#base.config) · [diag](#base.diag) · [glob](#base.glob) · [languages](#base.languages) · [safe-write](#base.safe-write) · [span](#base.span)

# map

- base
  <a id="base"></a>
  - module [brief](../../src/brief.ts#L1)
    <a id="base.brief"></a><br>Plain-language text → a brief: its first paragraph cut to two sentences. Doc comments (once an extractor strips their syntax) and model answers go through the same rule, so a brief reads the same whatever wrote it.
    - fn [briefOf](../../src/brief.ts#L16) (text: string) → string | null
      <a id="base.brief.briefOf"></a><br>The first paragraph of `text` with whitespace collapsed, cut to its first two sentences and to about `BRIEF_MAX` characters; null when nothing is left. A sentence ends at `.`, `!` or `?` (closing quotes and brackets after it included) before whitespace and an uppercase letter…
      - calls [base.brief.capText](base.md#base.brief.capText), [base.brief.firstSentences](base.md#base.brief.firstSentences)
    - fn [firstSentences](../../src/brief.ts#L27) (text: string, count: number) → string <!-- internal -->
      <a id="base.brief.firstSentences"></a>
    - fn [capText](../../src/brief.ts#L37) (text: string, max: number) → string
      <a id="base.brief.capText"></a><br>At most `max` code points: cut at the last space before the limit, then `…`.
  - module [config](../../src/config.ts#L1)
    <a id="base.config"></a><br>`keylang.json`: what to index, how files map to layers, where specs live. Without a config file the layout is guessed from the directory tree (`keylang init` writes that guess down so it can be edited).
    - node [external.node](external.md#external.node)
    - glob [base.glob](base.md#base.glob)
    - languages [base.languages](base.md#base.languages)
    - type [RuleFormat](../../src/config.ts#L15) = 1 | 2
      <a id="base.config.RuleFormat"></a><br>`1` keeps depth-sum priority. `2` is deny-overrides for incomparable rules.
    - type [StaticMode](../../src/config.ts#L22) = "behavior" | "shape"
      <a id="base.config.StaticMode"></a><br>Which call edges prove a static path. `shape`: calls written in the code. `behavior`: also the default of a hook and values resolved callers inject for it — what runs, not only what is written.
    - type [StaticSource](../../src/config.ts#L27) = "flag" | "config"
      <a id="base.config.StaticSource"></a><br>Who chose the static mode. Absent when nobody set it and the mode is `behavior`.
    - fn [resolveStatic](../../src/config.ts#L30) (flag: StaticMode | undefined, configured: StaticMode | undefined) → { mode: StaticMode; setBy?: StaticSource }
      <a id="base.config.resolveStatic"></a><br>Flag, then `check.static`, then `behavior`.
    - type [Config](../../src/config.ts#L36)
      <a id="base.config.Config"></a>
    - fn [skipDir](../../src/config.ts#L104) (abs: string, name: string) → boolean <!-- internal -->
      <a id="base.config.skipDir"></a><br>A directory we never descend into: hidden, build output, or a nested repository.
    - type [RawConfig](../../src/config.ts#L108)
      <a id="base.config.RawConfig"></a>
    - fn [loadConfig](../../src/config.ts#L123) (root: string) → Config
      <a id="base.config.loadConfig"></a><br>Load `<root>/keylang.json`, or guess a config for `root`.
      - calls [base.config.parseConfig](base.md#base.config.parseConfig), [base.config.detectLanguages](base.md#base.config.detectLanguages), [base.config.guessLayers](base.md#base.config.guessLayers), [base.config.defaultModule](base.md#base.config.defaultModule)
    - fn [defaultModule](../../src/config.ts#L155) (languages: readonly Language[]) → Config["module"] <!-- internal -->
      <a id="base.config.defaultModule"></a><br>The languages' own module granularity when they agree; a file otherwise.
    - fn [parseConfig](../../src/config.ts#L161) (file: string, text: string) → RawConfig
      <a id="base.config.parseConfig"></a><br>Parse and validate `keylang.json`. Errors name the file and the field.
      - calls [base.glob.globToRegExp](base.md#base.glob.globToRegExp), [base.config.isObject](base.md#base.config.isObject), [base.config.acceptFormat](base.md#base.config.acceptFormat), [base.languages.isLanguage](base.md#base.languages.isLanguage), [base.config.layerName](base.md#base.config.layerName), [base.config.reservedReason](base.md#base.config.reservedReason)
    - fn [isObject](../../src/config.ts#L268) (value: unknown) → value is Record<string, unknown> <!-- internal -->
      <a id="base.config.isObject"></a>
    - fn [acceptFormat](../../src/config.ts#L273) (file: string, got: unknown) → RuleFormat
      <a id="base.config.acceptFormat"></a><br>`format` when it is present: a positive integer this keylang can read.
    - fn [assertFormatOnly](../../src/config.ts#L287) (file: string, text: string) → void
      <a id="base.config.assertFormatOnly"></a><br>`fmt` and `parse` read nothing of the config except `format`. Invalid JSON or a non-object root cannot tell them the edition, so they stop.
      - calls [base.config.isObject](base.md#base.config.isObject), [base.config.acceptFormat](base.md#base.config.acceptFormat)
    - fn [configToJson](../../src/config.ts#L299) (c: Config) → string
      <a id="base.config.configToJson"></a><br>The config as it would be written by `keylang init`.
    - fn [sourceFiles](../../src/config.ts#L313) (c: Config) → string[]
      <a id="base.config.sourceFiles"></a><br>All indexable source files under root, POSIX paths relative to root, sorted.
      - calls [base.config.walkSources](base.md#base.config.walkSources), [base.config.isExcluded](base.md#base.config.isExcluded)
    - fn [sourceTree](../../src/config.ts#L321) (c: Config) → { files: string[]; unreadable: { dir: string; reason: string }[] }
      <a id="base.config.sourceTree"></a><br>The indexable source files and the directories that could not be listed (no permission): their files are unknown, which is a hole, not an absence.
      - calls [base.config.walkSources](base.md#base.config.walkSources), [base.config.isExcluded](base.md#base.config.isExcluded)
    - fn [excludedSourceFiles](../../src/config.ts#L326) (c: Config) → string[]
      <a id="base.config.excludedSourceFiles"></a><br>Source files left out only by the `exclude` of `keylang.json`: their modules are opaque.
      - calls [base.config.walkSources](base.md#base.config.walkSources), [base.config.isExcluded](base.md#base.config.isExcluded)
    - fn [walkSources](../../src/config.ts#L331) (c: Config, keep: (rel: string) => boolean) → { files: string[]; unreadable: { dir: string; reason: string }[] } <!-- internal -->
      <a id="base.config.walkSources"></a>
      - calls [base.config.toPosix](base.md#base.config.toPosix), [base.config.skipDir](base.md#base.config.skipDir), [base.languages.languageOf](base.md#base.languages.languageOf)
    - fn [evidenceFiles](../../src/config.ts#L369) (c: Config, field: "tests" | "trace") → string[] | null
      <a id="base.config.evidenceFiles"></a><br>Files named by `check.tests` / `check.trace`: a plain path (which must exist) or a glob (which may match nothing yet, before the first test run).
      - calls [base.glob.globPrefix](base.md#base.glob.globPrefix), [base.config.toPosix](base.md#base.config.toPosix), [base.glob.matchesGlob](base.md#base.glob.matchesGlob)
    - fn [isExcluded](../../src/config.ts#L391) (rel: string, extra: readonly string[]) → boolean
      <a id="base.config.isExcluded"></a>
      - calls [base.glob.matchesGlob](base.md#base.glob.matchesGlob)
    - fn [toPosix](../../src/config.ts#L395) (p: string) → string
      <a id="base.config.toPosix"></a>
    - fn [detectLanguages](../../src/config.ts#L399) (root: string) → Language[] <!-- internal -->
      <a id="base.config.detectLanguages"></a>
      - calls [base.config.skipDir](base.md#base.config.skipDir), [base.languages.languageOf](base.md#base.languages.languageOf)
    - fn [guessLayers](../../src/config.ts#L423) (root: string, exclude: readonly string[]) → Map<string, string[]>
      <a id="base.config.guessLayers"></a><br>Zero-config layering: the source root is `src/` (or `lib/`) when present, else the repository root. Each directory under it that holds source files becomes a layer; files directly in the source root form the layer `main`.
      - calls [base.config.guessLayout](base.md#base.config.guessLayout)
    - fn [guessLayout](../../src/config.ts#L432) (root: string, exclude: readonly string[]) → { layers: Map<string, string[]>; notes: string[] }
      <a id="base.config.guessLayout"></a><br>The guessed layers, and a note for every directory whose layer name had to change: a reserved name (`src/external/` → `external_`) or one that another directory already sanitizes to (`2fa` and `_2fa` → `_2fa`, `_2fa_2`).
      - calls [base.config.freeLayerName](base.md#base.config.freeLayerName), [base.config.reservedReason](base.md#base.config.reservedReason), [base.config.hasRootFiles](base.md#base.config.hasRootFiles), [base.config.hasSource](base.md#base.config.hasSource), [base.config.skipDir](base.md#base.config.skipDir), [base.glob.matchesGlob](base.md#base.glob.matchesGlob), [base.config.layerName](base.md#base.config.layerName)
    - fn [freeLayerName](../../src/config.ts#L464) (wanted: string, taken: ReadonlyMap<string, unknown>) → string <!-- internal -->
      <a id="base.config.freeLayerName"></a><br>`wanted`, or the first free variant: a reserved name gets `_`, a taken one a number (`_2fa_2`).
    - fn [reservedReason](../../src/config.ts#L473) (name: string) → string <!-- internal -->
      <a id="base.config.reservedReason"></a>
    - fn [hasRootFiles](../../src/config.ts#L479) (root: string, dir: string, exclude: readonly string[]) → boolean <!-- internal -->
      <a id="base.config.hasRootFiles"></a>
      - calls [base.languages.languageOf](base.md#base.languages.languageOf), [base.config.isExcluded](base.md#base.config.isExcluded)
    - fn [hasSource](../../src/config.ts#L483) (absDir: string, rel: string, exclude: readonly string[]) → boolean <!-- internal -->
      <a id="base.config.hasSource"></a>
      - calls [base.config.skipDir](base.md#base.config.skipDir), [base.languages.languageOf](base.md#base.languages.languageOf), [base.config.isExcluded](base.md#base.config.isExcluded)
    - fn [layerName](../../src/config.ts#L496) (name: string) → string
      <a id="base.config.layerName"></a><br>Make a directory or file name a valid ID segment.
  - module [diag](../../src/diag.ts#L1)
    <a id="base.diag"></a><br>Diagnostics with stable codes.
    - span [base.span](base.md#base.span)
    - type [Code](../../src/diag.ts#L5)
      <a id="base.diag.Code"></a>
    - type [Severity](../../src/diag.ts#L44) = "error" | "warning"
      <a id="base.diag.Severity"></a>
    - type [K005Reason](../../src/diag.ts#L47) = "arguments" | "id" | "link" | "quote" | "layer" | "scope"
      <a id="base.diag.K005Reason"></a><br>Why a K005 is malformed. Other codes do not carry this.
    - fn [severityOf](../../src/diag.ts#L49) (code: Code) → Severity
      <a id="base.diag.severityOf"></a>
    - type [Diagnostic](../../src/diag.ts#L53)
      <a id="base.diag.Diagnostic"></a>
    - fn [diagnostic](../../src/diag.ts#L79) (code: Exclude<Code, "K005">, file: string, span: Span, message: string, target?: string) → Diagnostic
      <a id="base.diag.diagnostic"></a>
      - calls [base.diag.severityOf](base.md#base.diag.severityOf)
    - fn [isError](../../src/diag.ts#L90) (d: Diagnostic) → boolean
      <a id="base.diag.isError"></a>
    - fn [formatDiagnostic](../../src/diag.ts#L95) (d: Diagnostic) → string
      <a id="base.diag.formatDiagnostic"></a><br>`file:line:col: CODE message`
    - fn [compareDiagnostics](../../src/diag.ts#L100) (a: Diagnostic, b: Diagnostic) → number
      <a id="base.diag.compareDiagnostics"></a><br>Stable order: file, position, code.
  - module [glob](../../src/glob.ts#L1)
    <a id="base.glob"></a><br>Minimal glob matching for `keylang.json` (no dependency, no experimental Node API). Supports `**`, `*`, `?` and `{a,b}`; paths are POSIX-relative.
    - fn [globToRegExp](../../src/glob.ts#L4) (glob: string) → RegExp
      <a id="base.glob.globToRegExp"></a>
      - calls [base.glob.source](base.md#base.glob.source)
    - fn [source](../../src/glob.ts#L9) (glob: string) → string <!-- internal -->
      <a id="base.glob.source"></a><br>The regex body of a glob; each `{a,b}` alternative is a glob itself (`{src/**,lib/*.ts}`).
      - calls [base.glob.closingBrace](base.md#base.glob.closingBrace), [base.glob.splitAlternatives](base.md#base.glob.splitAlternatives), [base.glob.escape](base.md#base.glob.escape)
    - fn [closingBrace](../../src/glob.ts#L42) (glob: string, open: number) → number <!-- internal -->
      <a id="base.glob.closingBrace"></a>
    - fn [splitAlternatives](../../src/glob.ts#L52) (body: string) → string[] <!-- internal -->
      <a id="base.glob.splitAlternatives"></a><br>Top-level commas of a brace body: `a,{b,c}` → `a`, `{b,c}`.
    - fn [escape](../../src/glob.ts#L68) (s: string) → string <!-- internal -->
      <a id="base.glob.escape"></a>
    - fn [matchesGlob](../../src/glob.ts#L72) (path: string, glob: string) → boolean
      <a id="base.glob.matchesGlob"></a>
      - calls [base.glob.globToRegExp](base.md#base.glob.globToRegExp)
    - fn [globPrefix](../../src/glob.ts#L77) (glob: string) → string
      <a id="base.glob.globPrefix"></a><br>Directory prefix of a glob, up to the first wildcard: `src/domain/**` → `src/domain`.
  - module [languages](../../src/languages.ts#L1)
    <a id="base.languages"></a><br>Languages keylang indexes: names, file extensions and the default module granularity. Plain data, so config and the language core know which files are source without loading any frontend or grammar.
    - type [LanguageInfo](../../src/languages.ts#L5)
      <a id="base.languages.LanguageInfo"></a>
    - type [Language](../../src/languages.ts#L29) = keyof typeof LANGUAGES
      <a id="base.languages.Language"></a>
    - fn [isLanguage](../../src/languages.ts#L33) (name: unknown) → name is Language
      <a id="base.languages.isLanguage"></a>
    - fn [languageOf](../../src/languages.ts#L37) (path: string) → Language | undefined
      <a id="base.languages.languageOf"></a>
    - fn [constructorName](../../src/languages.ts#L45) (file: string | null | undefined) → string | null
      <a id="base.languages.constructorName"></a><br>The member a call of a class declared in `file` runs; JS `constructor` for a file of no known language.
      - calls [base.languages.languageOf](base.md#base.languages.languageOf)
    - fn [implicitMember](../../src/languages.ts#L51) (file: string | null | undefined, name: string) → boolean
      <a id="base.languages.implicitMember"></a><br>A member of a class in `file` that the language calls without naming it.
      - calls [base.languages.languageOf](base.md#base.languages.languageOf)
  - module [safe-write](../../src/safe-write.ts#L1)
    <a id="base.safe-write"></a><br>One protocol for every file keylang writes into a repository: proposals, `spec-to-code --apply`, `wire`, `.keylang/stats.json`, explanations, the map with its index and fact cache (byte-exact, see `writeAtomic`). The path is plain and relative, and it stays inside the…
    - node [external.node](external.md#external.node)
    - type [WriteOptions](../../src/safe-write.ts#L16)
      <a id="base.safe-write.WriteOptions"></a>
    - type [PlannedWrite](../../src/safe-write.ts#L29)
      <a id="base.safe-write.PlannedWrite"></a>
    - fn [writeProblem](../../src/safe-write.ts#L39) (root: string, path: string, options: WriteOptions = {}) → string | null
      <a id="base.safe-write.writeProblem"></a><br>Why `path` (relative to `root`, POSIX) may not be written, or null. Reads nothing outside the repository.
      - calls [base.safe-write.landing](base.md#base.safe-write.landing), [base.safe-write.inside](base.md#base.safe-write.inside), [base.safe-write.statOrNull](base.md#base.safe-write.statOrNull), [base.safe-write.isGeneratedText](base.md#base.safe-write.isGeneratedText)
    - fn [safeWrite](../../src/safe-write.ts#L64) (root: string, path: string, text: string, options: WriteOptions = {}) → string
      <a id="base.safe-write.safeWrite"></a><br>Writes `text` to `path` (relative to `root`, POSIX) when `writeProblem` finds nothing, and returns the absolute path; throws `path: problem` otherwise. A symlinked file is written at its target, so the link stays.
      - calls [base.safe-write.safeWriteAll](base.md#base.safe-write.safeWriteAll)
    - fn [safeWriteAll](../../src/safe-write.ts#L69) (root: string, writes: readonly PlannedWrite[]) → string[]
      <a id="base.safe-write.safeWriteAll"></a><br>Every write is checked before the first one happens: either all land, or (short of an I/O error) none does.
      - calls [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic), [base.safe-write.landing](base.md#base.safe-write.landing)
    - fn [writeAtomic](../../src/safe-write.ts#L88) (abs: string, text: string, options: { exact?: boolean } = {}) → void
      <a id="base.safe-write.writeAtomic"></a><br>A temporary file in the target's directory renamed over the target, so a crash never leaves half a file; missing directories are created. The new file keeps the permissions of the one it replaces, and CRLF when that one has CRLF on every line — unless `exact`: a generated…
      - calls [base.safe-write.statOrNull](base.md#base.safe-write.statOrNull), [base.safe-write.allCrlf](base.md#base.safe-write.allCrlf)
    - fn [isGeneratedText](../../src/safe-write.ts#L106) (text: string) → boolean
      <a id="base.safe-write.isGeneratedText"></a><br>The first non-empty line is a `keylang:generated` marker (`<!-- … -->` of a map file, `// …` of `keylang wire`).
    - fn [allCrlf](../../src/safe-write.ts#L112) (text: string) → boolean
      <a id="base.safe-write.allCrlf"></a><br>Every line ends with CRLF (at least one does): the file keeps them when it is rewritten.
    - fn [landing](../../src/safe-write.ts#L122) (abs: string, hops = 0) → string | null
      <a id="base.safe-write.landing"></a><br>Where bytes written to `abs` land: the longest prefix that exists is resolved through links, and a link on the way is followed even when its target does not exist yet. Null for a loop of links.
      - calls [base.safe-write.lstatOrNull](base.md#base.safe-write.lstatOrNull)
    - fn [inside](../../src/safe-write.ts#L136) (abs: string, dir: string) → boolean <!-- internal -->
      <a id="base.safe-write.inside"></a>
    - fn [lstatOrNull](../../src/safe-write.ts#L141) (abs: string) → Stats | null <!-- internal -->
      <a id="base.safe-write.lstatOrNull"></a>
    - fn [statOrNull](../../src/safe-write.ts#L149) (abs: string) → Stats | null <!-- internal -->
      <a id="base.safe-write.statOrNull"></a>
  - module [span](../../src/span.ts#L1)
    <a id="base.span"></a><br>Source positions. Every node, name, link and reference carries a Span so that diagnostics and the future LSP (hover, definition) can point at it.
    - type [Pos](../../src/span.ts#L9)
      <a id="base.span.Pos"></a><br>A position in a source file. `offset` is an index into the file text (UTF-16 code units, i.e. a JS string index — what LSP expects); `line` and `col` are 1-based, `col` counts Unicode code points.
    - type [Span](../../src/span.ts#L16)
      <a id="base.span.Span"></a><br>Half-open range `[start, end)`.
    - type [Spanned](../../src/span.ts#L22)
      <a id="base.span.Spanned"></a><br>A value together with the place it was written.
    - fn [spanContains](../../src/span.ts#L27) (span: Span, offset: number) → boolean
      <a id="base.span.spanContains"></a>
    - fn [compareText](../../src/span.ts#L32) (a: string, b: string) → number
      <a id="base.span.compareText"></a><br>Code-unit order of two strings, for stable sorting of ids and paths.
