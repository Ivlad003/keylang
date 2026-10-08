<!-- keylang:generated — не редагувати, `keylang map` -->

[README](README.md) · modules: [bodies](#extract.bodies) · [doc-comments](#extract.doc-comments) · [facts](#extract.facts) · [grammars](#extract.grammars) · [php](#extract.php) · [python](#extract.python) · [rust](#extract.rust) · [treesitter](#extract.treesitter) · [ts](#extract.ts)

# map

- extract
  <a id="extract"></a><br>Parses TS/JS, Python, Rust and PHP source with tree-sitter into language-independent [`extract.facts`](extract.md#extract.facts), along with function bodies ([`extract.bodies`](extract.md#extract.bodies)) and cleaned doc comments, before any layer or ID assignment. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
  - module [bodies](../../src/extract/bodies.ts#L1)
    <a id="extract.bodies"></a><br>Function bodies by declaration position, for trace instrumentation. Positions match the declaration ranges of `FileFacts` (1-based line/col of the declaring node); offsets index the JS string (UTF-16 code units).
    - treesitter [extract.treesitter](extract.md#extract.treesitter)
    - ts [extract.ts](extract.md#extract.ts)
    - type [FunctionBody](../../src/extract/bodies.ts#L8)
      <a id="extract.bodies.FunctionBody"></a><br>Describes the span of a function body as source offsets: `start` and `end` bracket the block interior or the bare expression, with `expression` marking arrow-expression bodies plus `generator` and `async` flags. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [functionBodies](../../src/extract/bodies.ts#L22) (path: string, src: string) → Promise<Map<string, FunctionBody>>
      <a id="extract.bodies.functionBodies"></a><br>`line:col` of each declaring node → the body of its function.
      - calls [extract.ts.withTsTree](extract.md#extract.ts.withTsTree), [extract.bodies.bodiesOf](extract.md#extract.bodies.bodiesOf)
    - fn [parsesCleanly](../../src/extract/bodies.ts#L30) (path: string, src: string) → Promise<boolean>
      <a id="extract.bodies.parsesCleanly"></a><br>The source parses without a syntax error: an instrumented copy is checked before it replaces the original. `export type * from`, which the bundled grammar does not know, is no error here either.
      - calls [extract.ts.withTsTree](extract.md#extract.ts.withTsTree)
    - fn [bodiesOf](../../src/extract/bodies.ts#L34) (root: Node) → Map<string, FunctionBody> <!-- internal -->
      <a id="extract.bodies.bodiesOf"></a><br>Walks a tree-sitter syntax tree and records, for each function node (including arrow functions assigned in declarators or class fields), the body's index span plus expression/generator/async flags. Keys are `row:col` of the declaring node, computed via… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [extract.treesitter.startCol](extract.md#extract.treesitter.startCol), [extract.ts.unwrapValue](extract.md#extract.ts.unwrapValue), [extract.bodies.implementationOf](extract.md#extract.bodies.implementationOf)
    - fn [implementationOf](../../src/extract/bodies.ts#L96) (signature: Node) → Node | null <!-- internal -->
      <a id="extract.bodies.implementationOf"></a><br>The implementation an overload signature belongs to: the next function declaration (or method) of the same name, past the other signatures and comments between them. `export function f(…);` is a signature in an `export_statement`, so siblings are compared through that wrapper.
  - module [doc-comments](../../src/extract/doc-comments.ts#L1)
    <a id="extract.doc-comments"></a><br>Documentation comments without their syntax. Frontends decide which comment documents what; this module only turns comment source into text, lines kept, so the brief rule (`src/brief.ts`) can find the first paragraph.
    - fn [isLicense](../../src/extract/doc-comments.ts#L10) (text: string) → boolean
      <a id="extract.doc-comments.isLicense"></a><br>A license or copyright notice: a comment that starts with one (`SPDX-…`, `Copyright …`, `(c) 2024`, `© …`) or carries an SPDX identifier. A comment that only mentions copyright is documentation.
    - fn [blockCommentBody](../../src/extract/doc-comments.ts#L16) (text: string) → string
      <a id="extract.doc-comments.blockCommentBody"></a><br>`/** … *\/`, `/*! … *\/` or `/* … *\/` without delimiters and the ` * ` that starts each line.
    - fn [lineCommentsBody](../../src/extract/doc-comments.ts#L26) (lines: readonly string[], marker: RegExp) → string
      <a id="extract.doc-comments.lineCommentsBody"></a><br>Consecutive line comments (`//`, `///`, `//!`, `#`) as lines of text, one comment marker and one space removed from each.
    - fn [jsdocDescription](../../src/extract/doc-comments.ts#L34) (body: string) → string
      <a id="extract.doc-comments.jsdocDescription"></a><br>JSDoc text: the description before the first block tag (`@param`, `@returns`, …), with inline `x` as `x` and `label` / `label` as `label`.
    - fn [nonEmpty](../../src/extract/doc-comments.ts#L44) (text: string) → string | null
      <a id="extract.doc-comments.nonEmpty"></a><br>Text of the whole comment, or null when it has none: an empty comment, only tags, a directive.
  - module [facts](../../src/extract/facts.ts#L1)
    <a id="extract.facts"></a><br>Language-independent facts extracted from one source file. Everything the map and the index need; nothing about layers or IDs yet.
    - type [FileFacts](../../src/extract/facts.ts#L4)
      <a id="extract.facts.FileFacts"></a><br>Per-file extraction result: imports, declarations, exports and re-exports, value references, module-level calls, unsupported constructs, and whether the declaration list is complete or opaque after a parse error. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
    - type [EntryFact](../../src/extract/facts.ts#L69)
      <a id="extract.facts.EntryFact"></a><br>A language-level entry point written in the code, before resolution. `route`: `app.get('/x', h)` with a literal path and a named handler — `label` is `GET /x`, `callee` is `h` as written. `main`: a Python `if __name__ == "__main__":` block — `callee` is the fn it calls, or null…
    - type [QualifiedSymbol](../../src/extract/facts.ts#L78)
      <a id="extract.facts.QualifiedSymbol"></a><br>A top-level declaration by its qualified name.
    - type [ImportFact](../../src/extract/facts.ts#L87)
      <a id="extract.facts.ImportFact"></a><br>Record of one import, require or re-export in a source file: its specifier, span, source text and name bindings, plus flags for re-exports, glob imports, type-only statements, and specifiers that may not resolve. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
    - type [ImportBinding](../../src/extract/facts.ts#L128)
      <a id="extract.facts.ImportBinding"></a><br>Describes how a local name binds to an imported module: the whole module (optionally an ESM/Python namespace object), its `default` export, or a specific named export under a possibly different local name. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
    - type [DeclKind](../../src/extract/facts.ts#L142) = "fn" | "class" | "type"
      <a id="extract.facts.DeclKind"></a><br>Restricts a declaration's kind to one of three string literals: a function, a class, or a type alias. Code in the extract layer uses it to tag each extracted declaration with its category. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [DeclFact](../../src/extract/facts.ts#L144)
      <a id="extract.facts.DeclFact"></a><br>Records one extracted declaration: its kind, source span, signature, export status, outgoing calls, referenced types, nested members, body fingerprint, doc comment, and modifiers like accessor, static, or private. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
    - type [CallFact](../../src/extract/facts.ts#L184)
      <a id="extract.facts.CallFact"></a><br>Record of one call site: the callee's dotted name (or raw text when `opaque`), how its head is bound, the receiver's class, a `HookFact` default, `PassFact` function arguments, and position. Each call becomes an edge or a `dynamic-call` hole. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - type [HookFact](../../src/extract/facts.ts#L239)
      <a id="extract.facts.HookFact"></a><br>A callable chosen at run time with a default written next to it. `param` and `path` say where a caller injects the value: `analyze({ generate })` is parameter 0, path `generate`; `function f(run = defaultRun)` is parameter 0, path "".
    - type [PassFact](../../src/extract/facts.ts#L258)
      <a id="extract.facts.PassFact"></a><br>A function value in the arguments of a call: argument index, property path ("" for the argument itself). `callee` names it as a call would (`this.m`, `Cls.m`, `save`); `text` is the argument as written (`[$this, 'm']`), at the position. One passed as the argument itself is a…
    - type [ValueRefFact](../../src/extract/facts.ts#L273)
      <a id="extract.facts.ValueRefFact"></a><br>Describes a single occurrence of a value being referenced in source, recording its name (plain or module-qualified), whether it was read as a property off an object, and its line and column. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [TypeRefFact](../../src/extract/facts.ts#L283)
      <a id="extract.facts.TypeRefFact"></a><br>A type name in type position. `text` is the source fragment.
    - type [ExportRow](../../src/extract/facts.ts#L297)
      <a id="extract.facts.ExportRow"></a><br>One public name of a file, compared with the `exports` rule and followed by the graph to the symbol it stands for.
    - type [UnsupportedFact](../../src/extract/facts.ts#L327)
      <a id="extract.facts.UnsupportedFact"></a><br>Records a source construct the extractor could not analyze: its line/column span, raw text, and a reason string. The optional `symbol` names the dotted-path declaration whose call behavior the construct may alter, without adding a dependency. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
  - module [grammars](../../src/extract/grammars.ts#L1)
    <a id="extract.grammars"></a><br>The tree-sitter grammars keylang parses with. One list for the runtime (`treesitter.ts` loads them) and for packaging (`scripts/copy-wasm.mjs` copies each into dist/wasm), so a new language cannot be left out of the published package.
    - type [Grammar](../../src/extract/grammars.ts#L8) = (typeof GRAMMARS)[number]
      <a id="extract.grammars.Grammar"></a><br>Derives a union type of the element types in the `GRAMMARS` array, so each supported grammar entry's shape can be referenced as a single type throughout the extract layer. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - fn [wasmFile](../../src/extract/grammars.ts#L11) (g: Grammar) → string
      <a id="extract.grammars.wasmFile"></a><br>The grammar's file name in @vscode/tree-sitter-wasm and in dist/wasm.
  - module [php](../../src/extract/php.ts#L1)
    <a id="extract.php"></a><br>PHP facts: namespaces, `use`, classes, interfaces, traits, enums, functions and methods, calls, type hints, `require`/`include` and PHPDoc. PHP names a class or a function by its qualified name, never by its file, and a class of the file's own namespace needs no `use`.
    - languages [base.languages](base.md#base.languages)
    - facts [extract.facts](extract.md#extract.facts)
    - doc-comments [extract.doc-comments](extract.md#extract.doc-comments)
    - treesitter [extract.treesitter](extract.md#extract.treesitter)
    - fn [extractPhp](../../src/extract/php.ts#L38) (path: string, src: string) → Promise<FileFacts>
      <a id="extract.php.extractPhp"></a>
      - calls [extract.treesitter.withTree](extract.md#extract.treesitter.withTree), [extract.php.extractTree](extract.md#extract.php.extractTree)
    - type [Names](../../src/extract/php.ts#L43) <!-- internal -->
      <a id="extract.php.Names"></a><br>What names mean in one namespace: its name and the aliases of its `use` statements (keys in ASCII lower case: PHP class and function names ignore ASCII case).
    - type [Alias](../../src/extract/php.ts#L51) <!-- internal -->
      <a id="extract.php.Alias"></a>
    - type [ClassContext](../../src/extract/php.ts#L58) <!-- internal -->
      <a id="extract.php.ClassContext"></a><br>A class while its members are read: what `self::`, `$this->field->` and `static` name.
    - type [FieldType](../../src/extract/php.ts#L70) <!-- internal -->
      <a id="extract.php.FieldType"></a><br>The class of a property, and the docblock it comes from when no checked syntax names it.
    - type [At](../../src/extract/php.ts#L77) <!-- internal -->
      <a id="extract.php.At"></a><br>A position in the file with its source fragment.
    - type [DocType](../../src/extract/php.ts#L86) <!-- internal -->
      <a id="extract.php.DocType"></a><br>A class name written in a docblock tag: `@var Foo`, `@param Foo $x`.
    - type [TypeSource](../../src/extract/php.ts#L92) <!-- internal -->
      <a id="extract.php.TypeSource"></a><br>Where the class of a property comes from: a constructor parameter (typed, or by its `@param`) or a `@var`.
    - module [Collector](../../src/extract/php.ts#L101) <!-- internal -->
      <a id="extract.php.Collector"></a><br>Per file: the imports, values read and holes the names of the code add.
      - fn [constructor](../../src/extract/php.ts#L102)
        <a id="extract.php.Collector.constructor"></a>
      - fn [klass](../../src/extract/php.ts#L109) (written: string, node: Node, names: Names) → string
        <a id="extract.php.Collector.klass"></a><br>A class the code names: the binding it goes through, registered as an optional import unless a `use` binds it.
        - calls [extract.php.Collector.klassAt](extract.md#extract.php.Collector.klassAt), [extract.treesitter.located](extract.md#extract.treesitter.located)
      - fn [klassAt](../../src/extract/php.ts#L114) (written: string, at: At, names: Names, docblock: boolean) → string
        <a id="extract.php.Collector.klassAt"></a><br>The same for a name at `at`; `docblock`: written only in a docblock, so the import is one of provenance `docblock` unless the code names it too.
        - calls [extract.php.canonicalClass](extract.md#extract.php.canonicalClass), [extract.php.Collector.implicit](extract.md#extract.php.Collector.implicit)
      - fn [fn](../../src/extract/php.ts#L121) (written: string, node: Node, names: Names) → string
        <a id="extract.php.Collector.fn"></a><br>A function the code calls by name, likewise.
        - calls [extract.php.canonicalFunction](extract.md#extract.php.canonicalFunction), [extract.php.Collector.implicit](extract.md#extract.php.Collector.implicit), [extract.treesitter.located](extract.md#extract.treesitter.located)
      - fn [implicit](../../src/extract/php.ts#L128) (local: string, spec: string, at: At, docblock: boolean) → void <!-- internal -->
        <a id="extract.php.Collector.implicit"></a><br>A name's first use is its import; a use in the code replaces one in a docblock, whichever came first.
        - calls [extract.php.firstLine](extract.md#extract.php.firstLine), [extract.php.lastSegment](extract.md#extract.php.lastSegment)
      - fn [value](../../src/extract/php.ts#L136) (name: string, node: Node, member: boolean) → void
        <a id="extract.php.Collector.value"></a>
      - fn [hole](../../src/extract/php.ts#L141) (node: Node, reason: string, symbol: string | null) → void
        <a id="extract.php.Collector.hole"></a>
        - calls [extract.php.unsupported](extract.md#extract.php.unsupported)
    - fn [extractTree](../../src/extract/php.ts#L146) (path: string, root: Node) → FileFacts <!-- internal -->
      <a id="extract.php.extractTree"></a>
      - calls [extract.php.Collector](extract.md#extract.php.Collector), [extract.php.fileDoc](extract.md#extract.php.fileDoc), [extract.php.regionsOf](extract.md#extract.php.regionsOf), [extract.php.collectTopLevel](extract.md#extract.php.collectTopLevel), [extract.php.usesOf](extract.md#extract.php.usesOf), [extract.php.declarationOf](extract.md#extract.php.declarationOf), [extract.php.qualify](extract.md#extract.php.qualify), [extract.php.exportRow](extract.md#extract.php.exportRow), [extract.php.callsIn](extract.md#extract.php.callsIn), [extract.php.includesIn](extract.md#extract.php.includesIn), [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.treesitter.errorLine](extract.md#extract.treesitter.errorLine)
    - fn [regionsOf](../../src/extract/php.ts#L200) (root: Node) → { ns: string; statements: Node[] }[] <!-- internal -->
      <a id="extract.php.regionsOf"></a><br>The file in namespace regions: `namespace A;` runs to the next namespace statement, `namespace A { … }` is its block, and code before the first namespace (or in `namespace { … }`) is global.
    - fn [collectTopLevel](../../src/extract/php.ts#L221) (node: Node, out: Node[]) → void <!-- internal -->
      <a id="extract.php.collectTopLevel"></a><br>Statements of a namespace, including those under a top-level `if` (`if (!function_exists('x')) { function x() {} }`) and in plain blocks.
    - fn [qualify](../../src/extract/php.ts#L229) (ns: string, name: string) → string <!-- internal -->
      <a id="extract.php.qualify"></a>
    - fn [lastSegment](../../src/extract/php.ts#L233) (name: string) → string <!-- internal -->
      <a id="extract.php.lastSegment"></a>
    - fn [firstLine](../../src/extract/php.ts#L237) (text: string) → string <!-- internal -->
      <a id="extract.php.firstLine"></a>
    - fn [useKind](../../src/extract/php.ts#L242) (node: Node) → "function" | "const" | null <!-- internal -->
      <a id="extract.php.useKind"></a><br>`function` or `const` of a `use` or one of its clauses; null for a class.
    - fn [usesOf](../../src/extract/php.ts#L252) (decl: Node, names: Names) → ImportFact[] <!-- internal -->
      <a id="extract.php.usesOf"></a><br>The imports of one `use` statement, one per clause (`use A\{B, C as D}` is two), and the aliases they add to `names`. A function is `function <name>`, a constant `const <name>`, a class its name.
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.php.useKind](extract.md#extract.php.useKind), [extract.php.lastSegment](extract.md#extract.php.lastSegment), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [extract.php.firstLine](extract.md#extract.php.firstLine)
    - fn [canonicalClass](../../src/extract/php.ts#L280) (written: string, names: Names) → { local: string; qualified: string | null; explicit: boolean } <!-- internal -->
      <a id="extract.php.canonicalClass"></a><br>A class name as the code writes it → the binding it goes through (`local`) and the qualified name PHP gives it. `explicit`: a `use` binds exactly this name. A name through an alias keeps the alias's spelling, so a call written in another case still finds the binding.
      - calls [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [extract.php.qualify](extract.md#extract.php.qualify)
    - fn [canonicalFunction](../../src/extract/php.ts#L296) (written: string, names: Names) → { local: string; spec: string; explicit: boolean } <!-- internal -->
      <a id="extract.php.canonicalFunction"></a><br>A called function name → its binding and the specifier PHP resolves: `function A\f`, or for an unqualified name in a namespace `function A\f ?? f` (the global function when the namespace has none).
      - calls [extract.php.canonicalClass](extract.md#extract.php.canonicalClass), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase)
    - fn [exportRow](../../src/extract/php.ts#L307) (facts: FileFacts, name: string, kind: ExportRow["kind"]) → void <!-- internal -->
      <a id="extract.php.exportRow"></a>
    - fn [classNameOf](../../src/extract/php.ts#L314) (node: Node | null) → string | null <!-- internal -->
      <a id="extract.php.classNameOf"></a><br>A class name in a name or qualified-name node, as written.
    - fn [declarationOf](../../src/extract/php.ts#L319) (node: Node, names: Names, collector: Collector) → DeclFact | null <!-- internal -->
      <a id="extract.php.declarationOf"></a><br>A top-level class, interface, trait, enum or function.
      - calls [extract.php.fnDecl](extract.md#extract.php.fnDecl), [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.php.classNameOf](extract.md#extract.php.classNameOf), [extract.php.Collector.klass](extract.md#extract.php.Collector.klass), [extract.php.typeRef](extract.md#extract.php.typeRef), [extract.php.docOf](extract.md#extract.php.docOf), [extract.treesitter.fingerprint](extract.md#extract.treesitter.fingerprint), [extract.php.singleClass](extract.md#extract.php.singleClass), [extract.php.docTag](extract.md#extract.php.docTag), [extract.php.namedTypes](extract.md#extract.php.namedTypes), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [extract.php.constructorFields](extract.md#extract.php.constructorFields), [extract.php.docSource](extract.md#extract.php.docSource)
    - fn [constructorFields](../../src/extract/php.ts#L445) (method: Node, className: string, names: Names, collector: Collector, fields: Map<string, FieldType>, untyped: ReadonlyMap<string, { node: Node; doc: DocType | null }>) → Set<string> <!-- internal -->
      <a id="extract.php.constructorFields"></a><br>The classes the constructor gives the class's untyped properties. `$this->x = $x` with a parameter `X $x` is a fact of the syntax; with an untyped `$x` and `@param X $x`, or no assignment and `@var X` above the property, the class comes from a docblock PHP does not check. Only…
      - calls [extract.php.docTags](extract.md#extract.php.docTags), [extract.php.singleClass](extract.md#extract.php.singleClass), [extract.php.classKey](extract.md#extract.php.classKey), [extract.php.Collector.klass](extract.md#extract.php.Collector.klass), [extract.php.docSource](extract.md#extract.php.docSource), [extract.php.walkScope](extract.md#extract.php.walkScope), [extract.php.unparenthesized](extract.md#extract.php.unparenthesized), [extract.php.Collector.hole](extract.md#extract.php.Collector.hole)
    - fn [classKey](../../src/extract/php.ts#L507) (written: string, names: Names) → string <!-- internal -->
      <a id="extract.php.classKey"></a><br>The qualified name of a class as written, in ASCII lower case: how two spellings compare.
      - calls [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [extract.php.canonicalClass](extract.md#extract.php.canonicalClass)
    - fn [docSource](../../src/extract/php.ts#L512) (doc: DocType, names: Names, collector: Collector) → TypeSource | null <!-- internal -->
      <a id="extract.php.docSource"></a><br>The class a docblock type names, registered as a docblock import; null when it names no single class.
      - calls [extract.php.singleDocClass](extract.md#extract.php.singleDocClass), [extract.php.classKey](extract.md#extract.php.classKey), [extract.php.Collector.klassAt](extract.md#extract.php.Collector.klassAt)
    - fn [singleDocClass](../../src/extract/php.ts#L523) (written: string) → string | null <!-- internal -->
      <a id="extract.php.singleDocClass"></a><br>The one class a docblock type names: `Foo`, `?Foo`, `Foo|null`, `\App\Foo`. Null for a union of classes, an array (`Foo[]`, `array<Foo>`), a built-in type or anything else PHPDoc writes.
      - calls [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase)
    - fn [singleClass](../../src/extract/php.ts#L536) (type: Node | null) → string | null <!-- internal -->
      <a id="extract.php.singleClass"></a><br>The one class a type names: `Store`, `?Store`; null for a union, an intersection, a built-in type or none.
      - calls [extract.php.classNameOf](extract.md#extract.php.classNameOf), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase)
    - fn [namedTypes](../../src/extract/php.ts#L545) (type: Node | null) → { text: string; node: Node }[] <!-- internal -->
      <a id="extract.php.namedTypes"></a><br>Every class a type names, in unions, intersections and nullable types.
      - calls [extract.php.classNameOf](extract.md#extract.php.classNameOf), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase)
    - fn [typeRef](../../src/extract/php.ts#L560) (name: string, node: Node) → TypeRefFact <!-- internal -->
      <a id="extract.php.typeRef"></a>
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.php.firstLine](extract.md#extract.php.firstLine)
    - type [Scope](../../src/extract/php.ts#L566) <!-- internal -->
      <a id="extract.php.Scope"></a><br>What a call in a function sees: the namespace's names, the class, the function's variables and their classes.
    - fn [fnDecl](../../src/extract/php.ts#L578) (node: Node, name: string, names: Names, ctx: ClassContext | null, collector: Collector, symbol: string) → DeclFact <!-- internal -->
      <a id="extract.php.fnDecl"></a><br>A function or a method. `symbol` is its dotted path in the file.
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.php.singleClass](extract.md#extract.php.singleClass), [extract.php.Collector.klass](extract.md#extract.php.Collector.klass), [extract.php.namedTypes](extract.md#extract.php.namedTypes), [extract.php.typeRef](extract.md#extract.php.typeRef), [extract.php.walkScope](extract.md#extract.php.walkScope), [extract.php.classNameOf](extract.md#extract.php.classNameOf), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [extract.php.callsIn](extract.md#extract.php.callsIn), [extract.php.docOf](extract.md#extract.php.docOf), [extract.treesitter.fingerprint](extract.md#extract.treesitter.fingerprint)
    - fn [walkScope](../../src/extract/php.ts#L649) (node: Node, visit: (n: Node) => void) → void <!-- internal -->
      <a id="extract.php.walkScope"></a><br>Every node of a function body that runs in its own scope: not into a nested named function or class.
    - fn [callsIn](../../src/extract/php.ts#L662) (node: Node, scope: Scope, collector: Collector, closure: boolean) → CallFact[] <!-- internal -->
      <a id="extract.php.callsIn"></a><br>The calls under `node`: in a function body, or in code outside declarations. A call inside a closure, an arrow function or an anonymous class has `closure`: it runs when that value is called.
      - calls [extract.php.callOf](extract.md#extract.php.callOf), [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.php.passesOf](extract.md#extract.php.passesOf), [extract.php.classNameOf](extract.md#extract.php.classNameOf), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [extract.php.Collector.value](extract.md#extract.php.Collector.value), [extract.php.Collector.klass](extract.md#extract.php.Collector.klass), [extract.php.arrayCallable](extract.md#extract.php.arrayCallable), [extract.php.closureState](extract.md#extract.php.closureState)
    - type [ClosureState](../../src/extract/php.ts#L704) = null | "stored" | { line: number; col: number } <!-- internal -->
      <a id="extract.php.ClosureState"></a><br>Where a call sits with respect to closures: null outside them; `stored` under a closure some value holds (`$f = fn() => …`, a returned closure, an anonymous class); otherwise the position of the outermost closure, every closure between being an argument of a call…
    - fn [closureState](../../src/extract/php.ts#L706) (closure: Node, inner: ClosureState) → ClosureState <!-- internal -->
      <a id="extract.php.closureState"></a>
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located)
    - fn [passesOf](../../src/extract/php.ts#L725) (call: Node, scope: Scope, collector: Collector) → PassFact[] <!-- internal -->
      <a id="extract.php.passesOf"></a><br>Callable references among the arguments of a call: `[$this, 'm']`, `[self::class, 'm']`, `[$obj, 'm']` with the class of `$obj` known, `[Order::class, 'm']`, `'Order::m'`, `\Closure::fromCallable(<any of these>)`, the first-class callable `$this->m(...)` / `Order::m(...)` /…
      - calls [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [extract.php.lastSegment](extract.md#extract.php.lastSegment), [extract.php.callableOf](extract.md#extract.php.callableOf), [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.php.firstLine](extract.md#extract.php.firstLine)
    - fn [callableOf](../../src/extract/php.ts#L757) (value: Node, scope: Scope, collector: Collector, plainStrings: boolean) → { callee: string; bound?: "parameter" | "local"; receiver?: string; docblock?: { line: number; col: number }; node: Node } | null <!-- internal -->
      <a id="extract.php.callableOf"></a><br>The callable an expression names, with the node that spells it; null when it names none keylang can follow.
      - calls [extract.php.unparenthesized](extract.md#extract.php.unparenthesized), [extract.php.stringValue](extract.md#extract.php.stringValue), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [extract.php.classHolder](extract.md#extract.php.classHolder), [extract.php.Collector.klass](extract.md#extract.php.Collector.klass), [extract.php.qualifiedString](extract.md#extract.php.qualifiedString), [extract.php.Collector.fn](extract.md#extract.php.Collector.fn), [extract.php.firstClassCallable](extract.md#extract.php.firstClassCallable), [extract.php.calleeOf](extract.md#extract.php.calleeOf)
    - fn [qualifiedString](../../src/extract/php.ts#L815) (name: string) → string <!-- internal -->
      <a id="extract.php.qualifiedString"></a><br>A name in a string (`'Shop\Infra\Logger'`, `'helper'`) is fully qualified: PHP reads no `use` or namespace into it.
    - fn [classHolder](../../src/extract/php.ts#L820) (scopeNode: Node, member: string, scope: Scope, collector: Collector) → string | null <!-- internal -->
      <a id="extract.php.classHolder"></a><br>What `X::class` in `[X::class, 'm']` holds: `this` for `self`/`static` (the class for a static `m`), the class for a name; null for `parent`.
      - calls [extract.php.classNameOf](extract.md#extract.php.classNameOf), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [extract.php.Collector.klass](extract.md#extract.php.Collector.klass)
    - fn [arrayCallable](../../src/extract/php.ts#L831) (n: Node, scope: Scope, collector: Collector) → void <!-- internal -->
      <a id="extract.php.arrayCallable"></a><br>`[$this, 'save']`, `[$this->repo, 'save']`, `[Order::class, 'place']`, `['Order', 'place']`: a method read as a callable value.
      - calls [extract.php.stringValue](extract.md#extract.php.stringValue), [extract.php.Collector.value](extract.md#extract.php.Collector.value)
    - fn [stringValue](../../src/extract/php.ts#L848) (node: Node) → string | null <!-- internal -->
      <a id="extract.php.stringValue"></a><br>The text of a string literal without interpolation; null for anything else.
    - fn [firstClassCallable](../../src/extract/php.ts#L855) (n: Node) → boolean <!-- internal -->
      <a id="extract.php.firstClassCallable"></a><br>The callable `f(...)`, `$x->m(...)`, `X::m(...)` makes from its callee: a value, not a call.
    - fn [callOf](../../src/extract/php.ts#L871) (n: Node, scope: Scope, collector: Collector) → Pick<CallFact, "callee" | "bound" | "receiver" | "opaque" | "docblock"> | null <!-- internal -->
      <a id="extract.php.callOf"></a><br>One call: `f()` → `f`, `A\f()` → `A\f`; `$this->m()` → `this.m`; `$this->store->m()` → `this.store.m` with the property's class; `$x->m()` → `x.m`, bound, with the variable's class when the syntax names it; `X::m()` → `X.m`; `self::m()` / `static::m()` → `this.m`, or `X.m` for…
      - calls [extract.php.firstClassCallable](extract.md#extract.php.firstClassCallable), [extract.php.callableValue](extract.md#extract.php.callableValue), [extract.php.calleeOf](extract.md#extract.php.calleeOf)
    - fn [calleeOf](../../src/extract/php.ts#L880) (n: Node, scope: Scope, collector: Collector) → Pick<CallFact, "callee" | "bound" | "receiver" | "opaque" | "docblock"> | null <!-- internal -->
      <a id="extract.php.calleeOf"></a><br>The callee of a call node as `callOf` reads it, whether or not the arguments are `(...)`.
      - calls [extract.php.classNameOf](extract.md#extract.php.classNameOf), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [extract.php.Collector.klass](extract.md#extract.php.Collector.klass), [extract.php.variableCall](extract.md#extract.php.variableCall), [extract.php.lastSegment](extract.md#extract.php.lastSegment), [extract.php.Collector.hole](extract.md#extract.php.Collector.hole), [extract.php.Collector.fn](extract.md#extract.php.Collector.fn), [extract.php.unparenthesized](extract.md#extract.php.unparenthesized)
    - fn [unparenthesized](../../src/extract/php.ts#L955) (node: Node) → Node <!-- internal -->
      <a id="extract.php.unparenthesized"></a><br>The expression inside any parentheses around it: `((new X()))` → `new X()`.
    - fn [variableCall](../../src/extract/php.ts#L962) (callee: string, scope: Scope) → Pick<CallFact, "callee" | "bound"> <!-- internal -->
      <a id="extract.php.variableCall"></a><br>A call through a variable: `$f()`, `$x->m()`, `$class::m()`.
    - fn [callableValue](../../src/extract/php.ts#L968) (n: Node, scope: Scope, collector: Collector) → void <!-- internal -->
      <a id="extract.php.callableValue"></a><br>`f(...)`, `$this->m(...)`, `X::m(...)`: the function or method read as a value.
      - calls [extract.php.Collector.value](extract.md#extract.php.Collector.value), [extract.php.Collector.fn](extract.md#extract.php.Collector.fn)
    - fn [includesIn](../../src/extract/php.ts#L984) (root: Node, path: string, collector: Collector) → ImportFact[] <!-- internal -->
      <a id="extract.php.includesIn"></a><br>`require`/`include` of a path the code spells out: a string, or `__DIR__` (`dirname(__DIR__)`, `dirname(__FILE__)`) joined with one. The specifier is `include <path>`, relative to the repository root; a path computed at run time is a hole.
      - calls [extract.php.includedPath](extract.md#extract.php.includedPath), [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.php.Collector.hole](extract.md#extract.php.Collector.hole), [extract.php.firstLine](extract.md#extract.php.firstLine)
    - fn [includedPath](../../src/extract/php.ts#L1005) (expr: Node | null, file: string) → string | null <!-- internal -->
      <a id="extract.php.includedPath"></a><br>The repository-relative path an include expression names: string literals, `__DIR__`, `dirname(__DIR__[, n])` and `dirname(__FILE__[, n])` joined with `.`; a relative literal is taken from the file's directory. Null when part of it is computed at run time.
      - calls [extract.php.stringValue](extract.md#extract.php.stringValue), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [extract.php.normalize](extract.md#extract.php.normalize)
    - fn [normalize](../../src/extract/php.ts#L1038) (path: string) → string <!-- internal -->
      <a id="extract.php.normalize"></a><br>`a/./b/../c` → `a/c`; a path above the root keeps its leading `..`.
    - fn [docOf](../../src/extract/php.ts#L1053) (node: Node, header: number | null) → string | undefined <!-- internal -->
      <a id="extract.php.docOf"></a><br>The PHPDoc of a declaration: the `/** … *\/` right above it. Line comments may stand between them, other code may not.
      - calls [extract.php.docComment](extract.md#extract.php.docComment), [extract.doc-comments.jsdocDescription](extract.md#extract.doc-comments.jsdocDescription), [extract.doc-comments.blockCommentBody](extract.md#extract.doc-comments.blockCommentBody), [extract.doc-comments.isLicense](extract.md#extract.doc-comments.isLicense), [extract.doc-comments.nonEmpty](extract.md#extract.doc-comments.nonEmpty)
    - fn [docComment](../../src/extract/php.ts#L1061) (node: Node, header: number | null) → Node | null <!-- internal -->
      <a id="extract.php.docComment"></a><br>The PHPDoc comment node right above a declaration, as `docOf` finds it; null without one.
    - fn [docTags](../../src/extract/php.ts#L1072) (node: Node, header: number | null, tag: RegExp) → (DocType & { name?: string })[] <!-- internal -->
      <a id="extract.php.docTags"></a><br>The tags of a declaration's PHPDoc that `tag` matches, one per line, with the type (first group) and the variable name (second group, if any) and the position of the `@`. The fragment is the tag's line.
      - calls [extract.php.docComment](extract.md#extract.php.docComment)
    - fn [docTag](../../src/extract/php.ts#L1087) (node: Node, header: number | null, tag: RegExp) → DocType | null <!-- internal -->
      <a id="extract.php.docTag"></a><br>The first tag of a declaration's PHPDoc that `tag` matches; null without one.
      - calls [extract.php.docTags](extract.md#extract.php.docTags)
    - fn [fileDoc](../../src/extract/php.ts#L1096) (root: Node) → { doc: string; id: number } | null <!-- internal -->
      <a id="extract.php.fileDoc"></a><br>The file's PHPDoc and its comment: the first `/** … *\/` after `<?php` (and `declare`), unless it stands right above a declaration, which it documents instead. A license documents nothing.
      - calls [extract.doc-comments.jsdocDescription](extract.md#extract.doc-comments.jsdocDescription), [extract.doc-comments.blockCommentBody](extract.md#extract.doc-comments.blockCommentBody), [extract.doc-comments.isLicense](extract.md#extract.doc-comments.isLicense), [extract.doc-comments.nonEmpty](extract.md#extract.doc-comments.nonEmpty)
    - fn [unsupported](../../src/extract/php.ts#L1106) (node: Node, reason: string) → UnsupportedFact <!-- internal -->
      <a id="extract.php.unsupported"></a>
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.php.firstLine](extract.md#extract.php.firstLine)
  - module [python](../../src/extract/python.ts#L1)
    <a id="extract.python"></a><br>Python facts: `def`/`class`, imports, `__all__`, calls. Each imported name is one import whose specifier is the dotted path (`..pkg.mod.f`); the resolver decides how much of it is a module.
    - facts [extract.facts](extract.md#extract.facts)
    - doc-comments [extract.doc-comments](extract.md#extract.doc-comments)
    - treesitter [extract.treesitter](extract.md#extract.treesitter)
    - fn [extractPython](../../src/extract/python.ts#L24) (path: string, src: string) → Promise<FileFacts>
      <a id="extract.python.extractPython"></a><br>Parses Python source text with the tree-sitter grammar via [`extract.treesitter.withTree`](extract.md#extract.treesitter.withTree) and passes the syntax tree's root node to [`extract.python.extractTree`](extract.md#extract.python.extractTree), asynchronously yielding the file's extracted facts. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [extract.treesitter.withTree](extract.md#extract.treesitter.withTree), [extract.python.extractTree](extract.md#extract.python.extractTree)
    - fn [extractTree](../../src/extract/python.ts#L28) (path: string, root: Node) → FileFacts <!-- internal -->
      <a id="extract.python.extractTree"></a><br>Builds a Python file's facts from its parse tree: imports, top-level functions, classes and assignments, exports governed by `__all__` or underscore privacy and package re-exports, plus calls, value refs, docstring, and syntax-error status. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [extract.python.collectTopLevel](extract.md#extract.python.collectTopLevel), [extract.python.dunderAll](extract.md#extract.python.dunderAll), [extract.python.importsIn](extract.md#extract.python.importsIn), [extract.python.fnDecl](extract.md#extract.python.fnDecl), [extract.python.noteDecorators](extract.md#extract.python.noteDecorators), [extract.python.classDecl](extract.md#extract.python.classDecl), [extract.python.exportRow](extract.md#extract.python.exportRow), [extract.python.importsOf](extract.md#extract.python.importsOf), [extract.python.bindsUnlisted](extract.md#extract.python.bindsUnlisted), [extract.python.moduleCalls](extract.md#extract.python.moduleCalls), [extract.python.collectMainEntries](extract.md#extract.python.collectMainEntries), [extract.python.valueRefs](extract.md#extract.python.valueRefs), [extract.python.collectDynamic](extract.md#extract.python.collectDynamic), [extract.python.docstring](extract.md#extract.python.docstring), [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.treesitter.errorLine](extract.md#extract.treesitter.errorLine)
    - fn [collectTopLevel](../../src/extract/python.ts#L95) (node: Node, out: Node[]) → void <!-- internal -->
      <a id="extract.python.collectTopLevel"></a><br>Top-level statements, including those under `if`/`try` at module level (`if TYPE_CHECKING:`, `try: import x`).
    - fn [dunderAll](../../src/extract/python.ts#L108) (topLevel: Node[]) → Set<string> | null <!-- internal -->
      <a id="extract.python.dunderAll"></a><br>The names of `__all__`: a literal list or tuple, extended by `+=`, `+`, `.extend([...])` and `.append("x")`; null without an `__all__`.
    - fn [bindsUnlisted](../../src/extract/python.ts#L141) (node: Node) → string | null <!-- internal -->
      <a id="extract.python.bindsUnlisted"></a><br>What a module-level statement that binds names the export table does not list is, for the reason (`for`, `with`, `while`, `match`, `except … as`, tuple unpacking); null for one whose bindings the table has.
    - fn [exportRow](../../src/extract/python.ts#L149) (facts: FileFacts, name: string, kind: ExportRow["kind"]) → void <!-- internal -->
      <a id="extract.python.exportRow"></a><br>Records a named export on the per-file facts, skipping duplicates already present in the exports set and appending a row with the given kind and no local binding. Used by [`extract.python.extractTree`](extract.md#extract.python.extractTree) while walking a Python module's tree. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [decorators](../../src/extract/python.ts#L155) (node: Node) → { name: string; node: Node }[] <!-- internal -->
      <a id="extract.python.decorators"></a><br>Collects the decorator children of a Python `decorated_definition` tree-sitter node, pairing each with the decorator's name (the callee text when applied as a call, else the bare expression text). Returns an empty list for any other node type, and is used by… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [isAccessor](../../src/extract/python.ts#L163) (name: string) → boolean <!-- internal -->
      <a id="extract.python.isAccessor"></a><br>`@property`, `@x.setter`: the method runs on attribute access.
    - fn [noteDecorators](../../src/extract/python.ts#L173) (node: Node, symbol: string, member: boolean, facts: FileFacts) → void <!-- internal -->
      <a id="extract.python.noteDecorators"></a><br>A decorator keylang does not know may return another function: calls of the name may not reach the body (a hole of that declaration), and the decorator holds the function as a value, so code keylang cannot follow may call it (a framework calling a registered handler).
      - calls [extract.python.decorators](extract.md#extract.python.decorators), [extract.python.isAccessor](extract.md#extract.python.isAccessor), [extract.python.unsupported](extract.md#extract.python.unsupported), [extract.treesitter.located](extract.md#extract.treesitter.located)
    - fn [classDecl](../../src/extract/python.ts#L183) (def: Node, name: string, symbol: string, topLevel: boolean, facts: FileFacts) → DeclFact <!-- internal -->
      <a id="extract.python.classDecl"></a><br>A class and its members: methods, and nested classes with theirs. `symbol` is its dotted path in the file.
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.python.decorators](extract.md#extract.python.decorators), [extract.python.noteDecorators](extract.md#extract.python.noteDecorators), [extract.python.fnDecl](extract.md#extract.python.fnDecl), [extract.python.isAccessor](extract.md#extract.python.isAccessor), [extract.python.docstring](extract.md#extract.python.docstring), [extract.treesitter.fingerprint](extract.md#extract.treesitter.fingerprint)
    - type [Owner](../../src/extract/python.ts#L219) <!-- internal -->
      <a id="extract.python.Owner"></a><br>The class a method belongs to: its name, its static and class methods (for a top-level class), and whether the first parameter is the receiver.
    - fn [fnDecl](../../src/extract/python.ts#L225) (node: Node, name: string, owner: Owner | null) → DeclFact <!-- internal -->
      <a id="extract.python.fnDecl"></a><br>Builds a function declaration fact from a Python def node: parameter/return signature, source position, docstring, fingerprint, and body calls via [`extract.python.bodyCalls`](extract.md#extract.python.bodyCalls), treating the first parameter as the receiver for methods. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.python.bodyCalls](extract.md#extract.python.bodyCalls), [extract.python.boundNames](extract.md#extract.python.boundNames), [extract.python.typedValues](extract.md#extract.python.typedValues), [extract.python.docstring](extract.md#extract.python.docstring), [extract.treesitter.fingerprint](extract.md#extract.treesitter.fingerprint)
    - fn [docstring](../../src/extract/python.ts#L245) (body: Node | null) → string | undefined <!-- internal -->
      <a id="extract.python.docstring"></a><br>The docstring of a module, class or function body: its first statement when that is a lone string literal. An f-string, a bytes literal or concatenated strings are code, not documentation, and give none.
      - calls [extract.python.cleandoc](extract.md#extract.python.cleandoc), [extract.doc-comments.isLicense](extract.md#extract.doc-comments.isLicense), [extract.doc-comments.nonEmpty](extract.md#extract.doc-comments.nonEmpty)
    - fn [cleandoc](../../src/extract/python.ts#L256) (text: string) → string <!-- internal -->
      <a id="extract.python.cleandoc"></a><br>`inspect.cleandoc`: the first line stripped, the rest dedented by their common indentation.
    - fn [walkBindings](../../src/extract/python.ts#L273) (fn: Node, visit: (target: Node, kind: "parameter" | "local" | "declared", by: Node) => void) → void <!-- internal -->
      <a id="extract.python.walkBindings"></a><br>Every binding a function makes, nested scopes included — one scope for the whole function, as `boundNames` and `typedValues` read it: its parameters, assignments, loop and comprehension variables, `with … as x`, `except … as x`, `:=`, `case` captures (`case (x,)`, `case {"k"…
      - calls [extract.python.captures](extract.md#extract.python.captures)
    - fn [captures](../../src/extract/python.ts#L301) (name: Node) → boolean <!-- internal -->
      <a id="extract.python.captures"></a><br>A bare name in a `case` pattern binds it (`case x:`, `P(k=x)`); a dotted one (`Color.RED`) and a class (`case P():`) are values.
    - fn [boundNames](../../src/extract/python.ts#L307) (fn: Node) → Map<string, "parameter" | "local"> <!-- internal -->
      <a id="extract.python.boundNames"></a><br>Parameter and assigned names in a function: a call through one of them is a call through a value.
      - calls [extract.python.walkBindings](extract.md#extract.python.walkBindings)
    - type [CallScope](../../src/extract/python.ts#L324) <!-- internal -->
      <a id="extract.python.CallScope"></a><br>Carries the name-resolution context for one Python function body while call sites are collected: the `self`/`cls` receiver name, the enclosing `Owner`, which names are parameters or locals, and which of those have a syntactically declared class. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [typedValues](../../src/extract/python.ts#L341) (fn: Node) → Map<string, string> <!-- internal -->
      <a id="extract.python.typedValues"></a><br>Names in a function whose class the syntax names, bound nowhere else in it: a parameter annotated with a class (`repo: Repo`, `repo: Repo = Depends(…)`, `Optional[Repo]`, `Repo | None`, `Annotated[Repo, …]`) or a local whose only assignment is `x = Repo(…)` or `x: Repo = …`.…
      - calls [extract.python.walkBindings](extract.md#extract.python.walkBindings), [extract.python.annotatedClass](extract.md#extract.python.annotatedClass), [extract.python.constructedClass](extract.md#extract.python.constructedClass)
    - fn [annotatedClass](../../src/extract/python.ts#L367) (type: Node | null) → string | null <!-- internal -->
      <a id="extract.python.annotatedClass"></a><br>The one class an annotation names: `X`, `"X"`, `Optional[X]`, `X | None`, `Annotated[X, …]`; null for anything else.
      - calls [extract.python.classInAnnotation](extract.md#extract.python.classInAnnotation)
    - fn [classInAnnotation](../../src/extract/python.ts#L371) (text: string) → string | null <!-- internal -->
      <a id="extract.python.classInAnnotation"></a><br>Reduces a Python type-annotation string to the single class name it wraps, recursively peeling string quotes, `Optional[...]`, `Annotated[...]`, and `X | None` unions while treating `None` as absent. Returns null for generics with brackets or unions with more than one non-None… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - fn [constructedClass](../../src/extract/python.ts#L385) (value: Node | null) → string | null <!-- internal -->
      <a id="extract.python.constructedClass"></a><br>`X(…)` → `X`.
    - type [ClosureState](../../src/extract/python.ts#L396) = null | "stored" | { line: number; col: number } <!-- internal -->
      <a id="extract.python.ClosureState"></a><br>Where a call sits with respect to closures: null outside them; `stored` under a nested `def` or a lambda some value holds (`g = lambda: …`); otherwise the position of the outermost lambda, every lambda between being an argument of a call (`run(lambda: self.m())`, `sorted(xs…
    - fn [bodyCalls](../../src/extract/python.ts#L398) (body: Node, scope: CallScope) → CallFact[] <!-- internal -->
      <a id="extract.python.bodyCalls"></a><br>Walks a Python function body's syntax tree and emits one call record per `call` node, resolving the callee via [`extract.python.callOf`](extract.md#extract.python.callOf) and positioning via [`extract.treesitter.located`](extract.md#extract.treesitter.located). Calls nested inside lambdas or inner `def`s are flagged as closure calls. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.python.passesOf](extract.md#extract.python.passesOf), [extract.python.callOf](extract.md#extract.python.callOf)
    - fn [passesOf](../../src/extract/python.ts#L434) (call: Node, scope: CallScope) → PassFact[] <!-- internal -->
      <a id="extract.python.passesOf"></a><br>Callable references among the arguments: `run(self.m)`, `run(Order.m)`, `run(obj.m)` with the class of `obj` known, `run(callback=self.m)`, `functools.partial(self.m, …)`. A lambda is not a pass: its calls carry `closureArg`.
      - calls [extract.python.callableOf](extract.md#extract.python.callableOf), [extract.python.callOf](extract.md#extract.python.callOf), [extract.treesitter.located](extract.md#extract.treesitter.located)
    - fn [callableOf](../../src/extract/python.ts#L454) (value: Node) → Node | null <!-- internal -->
      <a id="extract.python.callableOf"></a><br>The expression that names the callable an argument passes: a name, an attribute, or the first argument of `functools.partial(…)`.
    - fn [callOf](../../src/extract/python.ts#L471) (fn: Node | null, scope: CallScope) → Pick<CallFact, "callee" | "bound" | "receiver"> <!-- internal -->
      <a id="extract.python.callOf"></a><br>`f()` → `f`; `a.b.f()` → `a.b.f`; `self.m()` → `this.m` (`Order.m` for a static method); `x.m()` through a value → `x.m`, bound, with the receiver's class when `typedValues` names it. Any other callee (`super().m()`, `f().m()`, `x[0]()`) is a call through a value keylang cannot…
    - fn [collectMainEntries](../../src/extract/python.ts#L505) (root: Node, names: ReadonlySet<string>, facts: FileFacts) → void <!-- internal -->
      <a id="extract.python.collectMainEntries"></a><br>`if __name__ == "__main__":` at module level: the script's entry. Its callee is the first fn of the file (a `def`, or an imported name) the block calls directly (`main()`, `sys.exit(main())`, `asyncio.run(main())`); null when the block calls no such name, and the module's top…
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located)
    - fn [moduleCalls](../../src/extract/python.ts#L531) (root: Node) → CallFact[] <!-- internal -->
      <a id="extract.python.moduleCalls"></a><br>Calls outside every `def`: module level and class bodies run when the module loads; so does a decorator.
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.python.callOf](extract.md#extract.python.callOf)
    - fn [valueRefs](../../src/extract/python.ts#L556) (root: Node, names: ReadonlySet<string>, glob: boolean) → ValueRefFact[] <!-- internal -->
      <a id="extract.python.valueRefs"></a><br>Functions read as values: `later(hit)`, `{"save": save}`, `callback=self.save`, `mod.save` without a call. Code holding the value may call it.
      - calls [extract.python.boundNames](extract.md#extract.python.boundNames), [extract.python.bindsOrCalls](extract.md#extract.python.bindsOrCalls), [extract.python.assigned](extract.md#extract.python.assigned)
    - fn [bindsOrCalls](../../src/extract/python.ts#L584) (node: Node, parent: Node) → boolean <!-- internal -->
      <a id="extract.python.bindsOrCalls"></a><br>The identifier is a callee, a declared name or a binding — not a value read.
      - calls [extract.python.assigned](extract.md#extract.python.assigned)
    - fn [assigned](../../src/extract/python.ts#L597) (node: Node, parent: Node) → boolean <!-- internal -->
      <a id="extract.python.assigned"></a><br>The node is the target of an assignment (`x = …`, `x += …`, `self.x = …`).
    - fn [collectDynamic](../../src/extract/python.ts#L606) (root: Node, facts: FileFacts) → void <!-- internal -->
      <a id="extract.python.collectDynamic"></a><br>`getattr(x, name)`, `importlib.import_module(name)`, `__import__(name)`, `exec`/`eval`: what they reach is decided at run time. A `getattr` in a `def` is a hole of that function's calls; the others may import anything.
      - calls [extract.python.enclosingFn](extract.md#extract.python.enclosingFn), [extract.python.unsupported](extract.md#extract.python.unsupported)
    - fn [isDeclarationLevel](../../src/extract/python.ts#L621) (node: Node) → boolean <!-- internal -->
      <a id="extract.python.isDeclarationLevel"></a><br>No `def` or `class` encloses the node: it is at the top of the module (possibly under `if`/`try`).
    - fn [enclosingFn](../../src/extract/python.ts#L631) (node: Node) → string | null <!-- internal -->
      <a id="extract.python.enclosingFn"></a><br>The indexed fn whose body holds the node, as a dotted path (`place`, `Order.save`, `Order.Line.price`); a `def` nested in a `def` belongs to the outer one. Null at module level and in a class body outside methods.
    - fn [importsIn](../../src/extract/python.ts#L654) (root: Node, reexported: (local: string | null) => boolean) → ImportFact[] <!-- internal -->
      <a id="extract.python.importsIn"></a><br>Every import of the file, in source order, wherever it is written. `import a.b as c` → `a.b` bound to `c`; `import a.b` → `a` bound to `a` plus `a.b` bound to the path `a.b`; `from .m import x` → `.m.x` bound to `x`; `from .m import *` → `.m.*`, which binds no name of its own.…
      - calls [extract.python.importsOf](extract.md#extract.python.importsOf)
    - fn [importsOf](../../src/extract/python.ts#L667) (node: Node, reexported: (local: string | null) => boolean) → ImportFact[] <!-- internal -->
      <a id="extract.python.importsOf"></a><br>Turns one Python `import` or `from … import` statement into import facts with module, named, aliased or wildcard bindings, built via [`extract.python.importAt`](extract.md#extract.python.importAt). Re-export applies only to top-level imports, per [`extract.python.isDeclarationLevel`](extract.md#extract.python.isDeclarationLevel). _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [extract.python.isDeclarationLevel](extract.md#extract.python.isDeclarationLevel), [extract.python.importAt](extract.md#extract.python.importAt)
    - fn [importAt](../../src/extract/python.ts#L712) (node: Node, source: string, bindings: ImportFact["bindings"], reexport: boolean) → ImportFact <!-- internal -->
      <a id="extract.python.importAt"></a><br>Builds an `ImportFact` record for a Python import statement by combining the given module source, bindings and re-export flag with the position and text obtained from [`extract.treesitter.located`](extract.md#extract.treesitter.located). It is the single constructor used by [`extract.python.importsOf`](extract.md#extract.python.importsOf) to emit each… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located)
    - fn [unsupported](../../src/extract/python.ts#L717) (node: Node, reason: string) → UnsupportedFact <!-- internal -->
      <a id="extract.python.unsupported"></a><br>Builds a record marking a Python construct the extractor can't analyze, taking its position from [`extract.treesitter.located`](extract.md#extract.treesitter.located) and keeping only the first line of its source text plus the given reason. Used by [`extract.python.collectDynamic`](extract.md#extract.python.collectDynamic) and [`extract.python.noteDecorators`](extract.md#extract.python.noteDecorators) to… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located)
  - module [rust](../../src/extract/rust.ts#L1)
    <a id="extract.rust"></a><br>Rust facts: items, `impl` members, `use` trees, calls. A `use` leaf is one import whose specifier is the full path (`crate::domain::order::place`); the resolver decides how much of it is a module.
    - facts [extract.facts](extract.md#extract.facts)
    - doc-comments [extract.doc-comments](extract.md#extract.doc-comments)
    - treesitter [extract.treesitter](extract.md#extract.treesitter)
    - fn [extractRust](../../src/extract/rust.ts#L35) (path: string, src: string) → Promise<FileFacts>
      <a id="extract.rust.extractRust"></a><br>Parses Rust source with the tree-sitter Rust grammar via [`extract.treesitter.withTree`](extract.md#extract.treesitter.withTree), then hands the syntax tree's root to [`extract.rust.extractTree`](extract.md#extract.rust.extractTree) to produce the file's facts asynchronously. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [extract.treesitter.withTree](extract.md#extract.treesitter.withTree), [extract.rust.extractTree](extract.md#extract.rust.extractTree)
    - fn [extractTree](../../src/extract/rust.ts#L39) (path: string, root: Node) → FileFacts <!-- internal -->
      <a id="extract.rust.extractTree"></a><br>Walks a parsed Rust file's non-test top-level items to build its facts: `use` imports, fn and type declarations, exports, impl methods attached to local types, and unsupported constructs. Marks the result opaque on syntax errors. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [extract.rust.isTestAttribute](extract.md#extract.rust.isTestAttribute), [extract.rust.isComment](extract.md#extract.rust.isComment), [extract.rust.testOnly](extract.md#extract.rust.testOnly), [extract.rust.useLeaves](extract.md#extract.rust.useLeaves), [extract.rust.useImport](extract.md#extract.rust.useImport), [extract.rust.exported](extract.md#extract.rust.exported), [extract.rust.importAt](extract.md#extract.rust.importAt), [extract.rust.nestedUses](extract.md#extract.rust.nestedUses), [extract.rust.bodyCalls](extract.md#extract.rust.bodyCalls), [extract.rust.fnDecl](extract.md#extract.rust.fnDecl), [extract.rust.exportRow](extract.md#extract.rust.exportRow), [extract.rust.noteAttributes](extract.md#extract.rust.noteAttributes), [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.rust.itemDoc](extract.md#extract.rust.itemDoc), [extract.treesitter.fingerprint](extract.md#extract.treesitter.fingerprint), [extract.rust.members](extract.md#extract.rust.members), [extract.rust.baseType](extract.md#extract.rust.baseType), [extract.rust.unsupported](extract.md#extract.rust.unsupported), [extract.rust.macroName](extract.md#extract.rust.macroName), [extract.rust.valueRefs](extract.md#extract.rust.valueRefs), [extract.rust.moduleDoc](extract.md#extract.rust.moduleDoc), [extract.treesitter.errorLine](extract.md#extract.treesitter.errorLine)
    - fn [isComment](../../src/extract/rust.ts#L148) (node: Node) → boolean <!-- internal -->
      <a id="extract.rust.isComment"></a><br>Returns true when a tree-sitter node's type is `line_comment` or `block_comment`, so callers like [`extract.rust.members`](extract.md#extract.rust.members) and [`extract.rust.itemDoc`](extract.md#extract.rust.itemDoc) can skip or collect comment nodes while walking Rust syntax trees. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [outerDoc](../../src/extract/rust.ts#L153) (node: Node) → boolean <!-- internal -->
      <a id="extract.rust.outerDoc"></a><br>`///` (not `////`) or `/** … *\/` (not `/**\/`): outer documentation of the item after it.
    - fn [innerDoc](../../src/extract/rust.ts#L158) (node: Node) → boolean <!-- internal -->
      <a id="extract.rust.innerDoc"></a><br>`//!` or `/*! … *\/`: documentation of the module it is written in.
    - fn [docText](../../src/extract/rust.ts#L163) (comments: readonly Node[]) → string | undefined <!-- internal -->
      <a id="extract.rust.docText"></a><br>Text of doc comments in source order: line comments without `///`/`//!`, blocks without delimiters.
      - calls [extract.doc-comments.lineCommentsBody](extract.md#extract.doc-comments.lineCommentsBody), [extract.doc-comments.blockCommentBody](extract.md#extract.doc-comments.blockCommentBody), [extract.doc-comments.isLicense](extract.md#extract.doc-comments.isLicense), [extract.doc-comments.nonEmpty](extract.md#extract.doc-comments.nonEmpty)
    - fn [itemDoc](../../src/extract/rust.ts#L173) (node: Node) → string | undefined <!-- internal -->
      <a id="extract.rust.itemDoc"></a><br>The item's documentation: its outer doc comments, attributes and plain comments between them allowed. `#[doc = "…"]` is an attribute keylang does not read, so an item documented only by it has none.
      - calls [extract.rust.isComment](extract.md#extract.rust.isComment), [extract.rust.innerDoc](extract.md#extract.rust.innerDoc), [extract.rust.outerDoc](extract.md#extract.rust.outerDoc), [extract.rust.docText](extract.md#extract.rust.docText)
    - fn [moduleDoc](../../src/extract/rust.ts#L183) (root: Node) → string | undefined <!-- internal -->
      <a id="extract.rust.moduleDoc"></a><br>The module's documentation: the `//!` and `/*! … *\/` comments of the file (`mod.rs` for a directory).
      - calls [extract.rust.docText](extract.md#extract.rust.docText), [extract.rust.innerDoc](extract.md#extract.rust.innerDoc)
    - fn [exported](../../src/extract/rust.ts#L187) (node: Node) → boolean <!-- internal -->
      <a id="extract.rust.exported"></a><br>Returns true when a Rust syntax node has a direct `visibility_modifier` child (e.g. `pub`), marking it as exported. Used by [`extract.rust.extractTree`](extract.md#extract.rust.extractTree) to decide which items count as public. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [members](../../src/extract/rust.ts#L192) (node: Node) → Node[] <!-- internal -->
      <a id="extract.rust.members"></a><br>Items of an `impl` or a `trait` body, without test-only ones.
      - calls [extract.rust.isComment](extract.md#extract.rust.isComment), [extract.rust.testOnly](extract.md#extract.rust.testOnly)
    - fn [testOnly](../../src/extract/rust.ts#L197) (node: Node) → boolean <!-- internal -->
      <a id="extract.rust.testOnly"></a><br>An item under `#[cfg(test)]` (or `cfg(all(test, …))`) or a `#[test]` fn: test code, kept out of the map like test files.
      - calls [extract.rust.isComment](extract.md#extract.rust.isComment), [extract.rust.isTestAttribute](extract.md#extract.rust.isTestAttribute)
    - fn [noteAttributes](../../src/extract/rust.ts#L210) (node: Node, symbol: string, member: boolean, facts: FileFacts) → void <!-- internal -->
      <a id="extract.rust.noteAttributes"></a><br>An attribute macro keylang does not know (`#[get("/")]`, `#[tauri::command]`) may replace the fn: calls of the name may not reach the body (a hole of that fn), and the macro holds the fn, so a framework may call it. A method of an `impl` for a type of another file is not…
      - calls [extract.rust.isComment](extract.md#extract.rust.isComment), [extract.rust.unsupported](extract.md#extract.rust.unsupported), [extract.treesitter.located](extract.md#extract.treesitter.located)
    - fn [isTestAttribute](../../src/extract/rust.ts#L222) (node: Node) → boolean <!-- internal -->
      <a id="extract.rust.isTestAttribute"></a><br>`#[cfg(test)]`, `#[cfg(all(test, unix))]`, `#[test]`, `#[tokio::test]`, `#[bench]` (or `#![…]`).
      - calls [extract.rust.requiresTest](extract.md#extract.rust.requiresTest)
    - fn [requiresTest](../../src/extract/rust.ts#L230) (predicate: string) → boolean <!-- internal -->
      <a id="extract.rust.requiresTest"></a><br>A `cfg` predicate that holds only in test builds: `test`, `all(…, test, …)`, `any` of such.
      - calls [extract.rust.splitTopLevel](extract.md#extract.rust.splitTopLevel)
    - fn [splitTopLevel](../../src/extract/rust.ts#L238) (text: string) → string[] <!-- internal -->
      <a id="extract.rust.splitTopLevel"></a><br>Splits a comma-separated argument string into pieces, ignoring commas nested inside parentheses or inside double-quoted strings (with backslash escapes), and drops empty pieces. Used by [`extract.rust.requiresTest`](extract.md#extract.rust.requiresTest) to break apart cfg predicate arguments. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [nestedUses](../../src/extract/rust.ts#L258) (node: Node, facts: FileFacts) → void <!-- internal -->
      <a id="extract.rust.nestedUses"></a><br>`use` declarations inside items (fn bodies, `impl` members), except inline modules, whose paths start elsewhere, and test code.
      - calls [extract.rust.testOnly](extract.md#extract.rust.testOnly), [extract.rust.useLeaves](extract.md#extract.rust.useLeaves), [extract.rust.useImport](extract.md#extract.rust.useImport)
    - fn [exportRow](../../src/extract/rust.ts#L268) (facts: FileFacts, name: string, kind: ExportRow["kind"]) → void <!-- internal -->
      <a id="extract.rust.exportRow"></a><br>Records a Rust export in the per-file facts by adding its name to the exports set and appending a row with the given kind and a null local alias. Used by [`extract.rust.extractTree`](extract.md#extract.rust.extractTree) and [`extract.rust.useImport`](extract.md#extract.rust.useImport) when they encounter exported items. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [baseType](../../src/extract/rust.ts#L274) (node: Node | null) → string | null <!-- internal -->
      <a id="extract.rust.baseType"></a><br>`Gen<T>` → `Gen`, `crate::a::S` → `S`; null for references, tuples and the like.
    - fn [takesSelf](../../src/extract/rust.ts#L283) (params: Node | null) → boolean <!-- internal -->
      <a id="extract.rust.takesSelf"></a><br>`&self`, `mut self`, `self: Box<Self>`: the fn is a method.
    - fn [fnDecl](../../src/extract/rust.ts#L287) (node: Node, name: string, exported: boolean, owner: string | null, names: ReadonlySet<string>, facts: FileFacts) → DeclFact <!-- internal -->
      <a id="extract.rust.fnDecl"></a><br>Builds a function DeclFact from a Rust tree-sitter node: position, flattened signature, doc, [`extract.treesitter.fingerprint`](extract.md#extract.treesitter.fingerprint), and body calls from [`extract.rust.bodyCalls`](extract.md#extract.rust.bodyCalls); owned fns lacking self are marked static. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.rust.takesSelf](extract.md#extract.rust.takesSelf), [extract.rust.bodyCalls](extract.md#extract.rust.bodyCalls), [extract.rust.boundNames](extract.md#extract.rust.boundNames), [extract.rust.itemDoc](extract.md#extract.rust.itemDoc), [extract.treesitter.fingerprint](extract.md#extract.treesitter.fingerprint)
    - fn [boundNames](../../src/extract/rust.ts#L308) (fn: Node) → Map<string, "parameter" | "local"> <!-- internal -->
      <a id="extract.rust.boundNames"></a><br>Names a function (or closure) binds: parameters, `let`, `for`, `if let` / `while let`, `match` arm patterns and closure parameters. A call through one of them is a call through a value.
    - type [CallScope](../../src/extract/rust.ts#L346) <!-- internal -->
      <a id="extract.rust.CallScope"></a><br>Where a call is written: the `impl` type, whether the fn takes `self`, its bound names, and the file's item and import names.
    - type [ClosureState](../../src/extract/rust.ts#L361) = null | "stored" | { line: number; col: number } <!-- internal -->
      <a id="extract.rust.ClosureState"></a><br>Where a call sits with respect to closures: null outside them; `stored` under a nested `fn`, an `async` block or a closure some value holds (`let g = |x| …`); otherwise the position of the outermost closure, every closure between being an argument of a call…
    - fn [bodyCalls](../../src/extract/rust.ts#L363) (body: Node, scope: CallScope, facts: FileFacts) → CallFact[] <!-- internal -->
      <a id="extract.rust.bodyCalls"></a><br>Walks a Rust function body and collects every call expression into `CallFact` entries via [`extract.rust.callOf`](extract.md#extract.rust.callOf), flagging ones nested in closures, async blocks, or inner fns. Unknown local macros are reported through [`extract.rust.unsupported`](extract.md#extract.rust.unsupported) since their calls stay hidden. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [extract.rust.callOf](extract.md#extract.rust.callOf), [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.rust.passesOf](extract.md#extract.rust.passesOf), [extract.rust.macroName](extract.md#extract.rust.macroName), [extract.rust.unsupported](extract.md#extract.rust.unsupported)
    - fn [passesOf](../../src/extract/rust.ts#L403) (call: Node, scope: CallScope, facts: FileFacts) → PassFact[] <!-- internal -->
      <a id="extract.rust.passesOf"></a><br>Function paths among the arguments: `run(Self::m)`, `run(m)`, `run(crate::util::helper)`, `.map(Order::total)`. A closure is not a pass: its calls carry `closureArg`.
      - calls [extract.rust.callOf](extract.md#extract.rust.callOf), [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.rust.compact](extract.md#extract.rust.compact)
    - type [Callee](../../src/extract/rust.ts#L420) = Pick<CallFact, "callee" | "bound"> <!-- internal -->
      <a id="extract.rust.Callee"></a><br>A narrowed view of a call record that keeps only the target name and the bound-receiver flag, so the Rust extractor can resolve and return who is being called without carrying the full fact around. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [callOf](../../src/extract/rust.ts#L432) (fn: Node | null, scope: CallScope, facts: FileFacts) → Callee | null <!-- internal -->
      <a id="extract.rust.callOf"></a><br>`f()` → `f`; `a::b::f()` → `a.b.f`; `Self::new()` → `<Type>.new`; `self.m()` → `this.m`; `x.m()` → `x.m` (through a value). A path that starts at `crate`, `super`, `self` or a lower-case name keylang does not know imports what it names: the call is an edge to that module's item.
      - calls [extract.rust.throughValue](extract.md#extract.rust.throughValue), [extract.rust.pathCall](extract.md#extract.rust.pathCall)
    - fn [pathCall](../../src/extract/rust.ts#L466) (fn: Node, scope: CallScope, facts: FileFacts) → Callee | null <!-- internal -->
      <a id="extract.rust.pathCall"></a><br>The callee of a path call or a path read as a value; null for a variant or tuple-struct constructor.
      - calls [extract.rust.pathSegments](extract.md#extract.rust.pathSegments), [extract.rust.compact](extract.md#extract.rust.compact), [extract.rust.throughValue](extract.md#extract.rust.throughValue), [extract.treesitter.located](extract.md#extract.treesitter.located)
    - fn [throughValue](../../src/extract/rust.ts#L498) (fn: Node) → Callee <!-- internal -->
      <a id="extract.rust.throughValue"></a><br>A call keylang cannot name, as written: a `dynamic-call` hole, never an edge.
      - calls [extract.rust.compact](extract.md#extract.rust.compact)
    - fn [compact](../../src/extract/rust.ts#L502) (text: string) → string <!-- internal -->
      <a id="extract.rust.compact"></a><br>Collapses all whitespace runs in the text to single spaces and strips spaces around `.` and `:`, normalizing Rust path and method-call snippets. Used by [`extract.rust.pathCall`](extract.md#extract.rust.pathCall) and [`extract.rust.throughValue`](extract.md#extract.rust.throughValue) to canonicalize callee text. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [pathSegments](../../src/extract/rust.ts#L507) (node: Node) → string[] | null <!-- internal -->
      <a id="extract.rust.pathSegments"></a><br>`a::b::c` → `["a", "b", "c"]`; null when a segment is not a plain name (`<T as X>::f`).
    - fn [valueRefs](../../src/extract/rust.ts#L524) (items: Node[], names: ReadonlySet<string>, facts: FileFacts) → ValueRefFact[] <!-- internal -->
      <a id="extract.rust.valueRefs"></a><br>Functions read as values: `later(hit)`, `.map(Order::total)`, `Handler { run: crate::a::go }`. Code holding the value may call it, so such a fn escapes.
      - calls [extract.rust.testOnly](extract.md#extract.rust.testOnly), [extract.rust.boundNames](extract.md#extract.rust.boundNames), [extract.rust.bindsOrCalls](extract.md#extract.rust.bindsOrCalls), [extract.rust.calledPath](extract.md#extract.rust.calledPath), [extract.rust.pathCall](extract.md#extract.rust.pathCall)
    - fn [calledPath](../../src/extract/rust.ts#L554) (node: Node) → boolean <!-- internal -->
      <a id="extract.rust.calledPath"></a><br>The path is the callee of a call, or a part of a longer path or a pattern: not a value read.
    - fn [bindsOrCalls](../../src/extract/rust.ts#L564) (node: Node) → boolean <!-- internal -->
      <a id="extract.rust.bindsOrCalls"></a><br>The identifier names what is declared, bound or called here, or is part of a path or pattern.
      - calls [extract.rust.calledPath](extract.md#extract.rust.calledPath)
    - type [UseLeaf](../../src/extract/rust.ts#L579) <!-- internal -->
      <a id="extract.rust.UseLeaf"></a><br>Shape of one resolved item from a Rust `use` declaration: the path segments as a string array, an optional `as` alias, and a flag marking a trailing `*` wildcard import. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [useLeaves](../../src/extract/rust.ts#L586) (node: Node | null, prefix: string[]) → UseLeaf[] <!-- internal -->
      <a id="extract.rust.useLeaves"></a><br>Flatten a `use` tree: `a::{b, c::d as e, f::*}` → `a::b`, `a::c::d` as `e`, `a::f::*`.
      - calls [extract.rust.pathSegments](extract.md#extract.rust.pathSegments)
    - fn [useImport](../../src/extract/rust.ts#L619) (node: Node, leaf: UseLeaf, exported: boolean, facts: FileFacts) → ImportFact <!-- internal -->
      <a id="extract.rust.useImport"></a><br>Turns one Rust `use` leaf into an import fact via [`extract.rust.importAt`](extract.md#extract.rust.importAt), marking glob imports and binding the alias or last path segment unless it is `_`. For `pub use`, it records a re-export through [`extract.rust.exportRow`](extract.md#extract.rust.exportRow) or a glob re-export. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [extract.rust.importAt](extract.md#extract.rust.importAt), [extract.rust.exportRow](extract.md#extract.rust.exportRow)
    - fn [importAt](../../src/extract/rust.ts#L631) (node: Node, source: string, bindings: ImportFact["bindings"], reexport: boolean) → ImportFact <!-- internal -->
      <a id="extract.rust.importAt"></a><br>Builds an `ImportFact` by reading the node's position and text via [`extract.treesitter.located`](extract.md#extract.treesitter.located) and attaching the given source path, bindings, and reexport flag; used by [`extract.rust.extractTree`](extract.md#extract.rust.extractTree) and [`extract.rust.useImport`](extract.md#extract.rust.useImport) to record each Rust `use` item. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located)
    - fn [macroName](../../src/extract/rust.ts#L636) (node: Node) → string <!-- internal -->
      <a id="extract.rust.macroName"></a><br>Reads the invoked macro's identifier from a Rust tree-sitter macro node, taking the `macro` field's text and falling back to the first named child or `"?"`. Used by [`extract.rust.bodyCalls`](extract.md#extract.rust.bodyCalls) and [`extract.rust.extractTree`](extract.md#extract.rust.extractTree) to label macro invocations. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [unsupported](../../src/extract/rust.ts#L640) (node: Node, reason: string) → UnsupportedFact <!-- internal -->
      <a id="extract.rust.unsupported"></a><br>Builds a record describing a Rust syntax node the extractor could not handle, taking its position and first source line from [`extract.treesitter.located`](extract.md#extract.treesitter.located) and attaching the given reason. Used by [`extract.rust.bodyCalls`](extract.md#extract.rust.bodyCalls), [`extract.rust.extractTree`](extract.md#extract.rust.extractTree), and… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located)
  - module [treesitter](../../src/extract/treesitter.ts#L1)
    <a id="extract.treesitter"></a><br>web-tree-sitter runtime with the grammar WASM files from @vscode/tree-sitter-wasm. Languages are loaded lazily and cached for the process.
    - node [external.node](external.md#external.node)
    - web-tree-sitter [external.web-tree-sitter](external.md#external.web-tree-sitter)
    - grammars [extract.grammars](extract.md#extract.grammars)
    - fn [wasmDir](../../src/extract/treesitter.ts#L28) () → string <!-- internal -->
      <a id="extract.treesitter.wasmDir"></a><br>Resolves the directory holding tree-sitter grammar `.wasm` files, preferring the `../wasm` folder bundled beside the compiled module and otherwise falling back to the `@vscode/tree-sitter-wasm` package's `wasm` directory. Used by [`extract.treesitter.loadLanguage`](extract.md#extract.treesitter.loadLanguage) to locate… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - fn [loadLanguage](../../src/extract/treesitter.ts#L35) (g: Grammar) → Promise<Language>
      <a id="extract.treesitter.loadLanguage"></a><br>Lazily initialises the tree-sitter runtime once, then loads and memoises the WASM grammar for a given language, resolving its path via [`extract.treesitter.wasmDir`](extract.md#extract.treesitter.wasmDir) and [`extract.grammars.wasmFile`](extract.md#extract.grammars.wasmFile). Repeated requests for the same grammar share one cached promise, used by… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [extract.treesitter.wasmDir](extract.md#extract.treesitter.wasmDir), [extract.grammars.wasmFile](extract.md#extract.grammars.wasmFile)
    - fn [withTree](../../src/extract/treesitter.ts#L49) (g: Grammar, src: string, use: (tree: Tree, language: Language) => T) → Promise<T>
      <a id="extract.treesitter.withTree"></a><br>Parse `src` and run `use` on the tree, which is freed afterwards: a tree lives in the WASM heap, so nothing `use` returns may hold a node.
      - calls [extract.treesitter.loadLanguage](extract.md#extract.treesitter.loadLanguage), [extract.treesitter.surrogatePairs](extract.md#extract.treesitter.surrogatePairs)
    - fn [query](../../src/extract/treesitter.ts#L69) (language: Language, g: Grammar, name: string, source: string) → Query
      <a id="extract.treesitter.query"></a><br>Compile a query once per (grammar, source).
    - fn [grammarFor](../../src/extract/treesitter.ts#L79) (path: string) → Grammar
      <a id="extract.treesitter.grammarFor"></a><br>Picks the tree-sitter grammar from a file's extension (Rust, Python, PHP, TSX, TypeScript including .mts/.cts), defaulting to JavaScript, for [`extract.ts.extractTs`](extract.md#extract.ts.extractTs) and [`extract.ts.withTsTree`](extract.md#extract.ts.withTsTree). _(llm · claude:claude-opus-5-5 · 2026-10-05)_
    - fn [located](../../src/extract/treesitter.ts#L89) (node: Node) → { line: number; col: number; endLine: number; endCol: number; text: string }
      <a id="extract.treesitter.located"></a><br>1-based range and text of a node; columns count code points, and `endCol` is the column after it.
      - calls [extract.treesitter.startCol](extract.md#extract.treesitter.startCol), [extract.treesitter.codePointColumn](extract.md#extract.treesitter.codePointColumn)
    - fn [startCol](../../src/extract/treesitter.ts#L100) (node: Node) → number
      <a id="extract.treesitter.startCol"></a><br>The node's 1-based start column in code points (§7), as `located` gives it.
      - calls [extract.treesitter.codePointColumn](extract.md#extract.treesitter.codePointColumn)
    - fn [codePointColumn](../../src/extract/treesitter.ts#L109) (tree: Tree, index: number, units: number) → number <!-- internal -->
      <a id="extract.treesitter.codePointColumn"></a><br>web-tree-sitter parses a JS string as UTF-16, so its columns and indices count code units. A surrogate pair between the line start and the point is one code point, and so one column.
      - calls [extract.treesitter.firstAtOrAfter](extract.md#extract.treesitter.firstAtOrAfter)
    - fn [surrogatePairs](../../src/extract/treesitter.ts#L115) (src: string) → number[] <!-- internal -->
      <a id="extract.treesitter.surrogatePairs"></a><br>Scans the source text for UTF-16 surrogate pairs and returns the index just after each pair's high surrogate, giving [`extract.treesitter.withTree`](extract.md#extract.treesitter.withTree) the positions where JavaScript string offsets and tree-sitter byte/code-point offsets diverge. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [firstAtOrAfter](../../src/extract/treesitter.ts#L122) (sorted: readonly number[], value: number) → number <!-- internal -->
      <a id="extract.treesitter.firstAtOrAfter"></a><br>Position of the first element `>= value` in an ascending array.
    - fn [errorLine](../../src/extract/treesitter.ts#L134) (node: Node) → number
      <a id="extract.treesitter.errorLine"></a><br>First syntax-error line, or the start of the tree when the grammar only sets `hasError`.
    - fn [fingerprint](../../src/extract/treesitter.ts#L159) (node: Node) → string
      <a id="extract.treesitter.fingerprint"></a><br>SHA-256 of the node's syntax: node types and token texts, without comments and whitespace. `>` → `>=` changes it; reformatting or editing a comment does not. Nesting is part of it, so moving a statement out of a block counts.
      - calls [extract.treesitter.hashSyntax](extract.md#extract.treesitter.hashSyntax), [extract.treesitter.valuesRead](extract.md#extract.treesitter.valuesRead), [extract.treesitter.readsImportedValue](extract.md#extract.treesitter.readsImportedValue)
    - fn [hashSyntax](../../src/extract/treesitter.ts#L177) (node: Node, hash: Hash) → Set<string> <!-- internal -->
      <a id="extract.treesitter.hashSyntax"></a><br>Hash the syntax of `node` into `hash` (see `fingerprint`); the names of the leaves in it.
    - type [ValueDecl](../../src/extract/treesitter.ts#L204) <!-- internal -->
      <a id="extract.treesitter.ValueDecl"></a><br>A value declared by name in a scope: a variable, constant or field.
    - fn [valuesRead](../../src/extract/treesitter.ts#L223) (node: Node, reads: ReadonlySet<string>) → ValueDecl[] <!-- internal -->
      <a id="extract.treesitter.valuesRead"></a><br>The value declarations `node` reads by name, transitively, in every scope around it (an enclosing class body, the module), in document order. A declaration that holds `node` itself (`const f = () => …`) is left out.
      - calls [extract.treesitter.valuesOf](extract.md#extract.treesitter.valuesOf), [extract.treesitter.hashSyntax](extract.md#extract.treesitter.hashSyntax)
    - fn [valuesOf](../../src/extract/treesitter.ts#L248) (scope: Node) → ValueDecl[] <!-- internal -->
      <a id="extract.treesitter.valuesOf"></a>
      - calls [extract.treesitter.valueDeclaration](extract.md#extract.treesitter.valueDeclaration), [extract.treesitter.declaredNames](extract.md#extract.treesitter.declaredNames)
    - fn [valueDeclaration](../../src/extract/treesitter.ts#L267) (statement: Node) → Node | null <!-- internal -->
      <a id="extract.treesitter.valueDeclaration"></a><br>The value declaration a statement of a scope is, through `export` (TS) and an expression statement (Python).
    - fn [declaredNames](../../src/extract/treesitter.ts#L292) (decl: Node) → string[] <!-- internal -->
      <a id="extract.treesitter.declaredNames"></a>
      - calls [extract.treesitter.patternNames](extract.md#extract.treesitter.patternNames)
    - fn [patternNames](../../src/extract/treesitter.ts#L318) (target: Node | null) → string[] <!-- internal -->
      <a id="extract.treesitter.patternNames"></a><br>Names a declaration target binds: an identifier, or every identifier of a destructuring pattern.
    - fn [readsImportedValue](../../src/extract/treesitter.ts#L331) (node: Node, reads: ReadonlySet<string>) → boolean <!-- internal -->
      <a id="extract.treesitter.readsImportedValue"></a><br>Whether `node` reads, as a value, a name imported from another file of the repository.
      - calls [extract.treesitter.importedValueNames](extract.md#extract.treesitter.importedValueNames), [extract.treesitter.isCallee](extract.md#extract.treesitter.isCallee)
    - fn [isCallee](../../src/extract/treesitter.ts#L348) (leaf: Node) → boolean <!-- internal -->
      <a id="extract.treesitter.isCallee"></a>
    - fn [importedValueNames](../../src/extract/treesitter.ts#L362) (tree: Tree) → Set<string> <!-- internal -->
      <a id="extract.treesitter.importedValueNames"></a><br>Local names the file binds to values of other files of the repository, as far as the import's syntax tells: a relative TS/JS specifier, a relative Python `from . import`, a Rust `use crate::`/`super::`/`self::`. A type-only import binds no value.
      - calls [extract.treesitter.useNames](extract.md#extract.treesitter.useNames)
    - fn [useNames](../../src/extract/treesitter.ts#L399) (clause: Node) → string[] <!-- internal -->
      <a id="extract.treesitter.useNames"></a>
  - module [ts](../../src/extract/ts.ts#L1)
    <a id="extract.ts"></a><br>TypeScript / JavaScript facts: imports, declarations, exports, calls. A tree walk over the top level plus tree-sitter queries inside bodies.
    - node [external.node](external.md#external.node)
    - facts [extract.facts](extract.md#extract.facts)
    - doc-comments [extract.doc-comments](extract.md#extract.doc-comments)
    - treesitter [extract.treesitter](extract.md#extract.treesitter)
    - fn [extractTs](../../src/extract/ts.ts#L34) (path: string, src: string) → Promise<FileFacts>
      <a id="extract.ts.extractTs"></a><br>Resolves the grammar for a TS/JS source file, parses it via [`extract.ts.withTsTree`](extract.md#extract.ts.withTsTree), and hands the syntax tree root to [`extract.ts.extractTree`](extract.md#extract.ts.extractTree) to produce the file's extracted facts asynchronously. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
      - calls [extract.treesitter.grammarFor](extract.md#extract.treesitter.grammarFor), [extract.ts.withTsTree](extract.md#extract.ts.withTsTree), [extract.ts.extractTree](extract.md#extract.ts.extractTree)
    - fn [withTsTree](../../src/extract/ts.ts#L47) (path: string, src: string, use: (tree: Tree, language: Language, typeStars: ReadonlyMap<number, string>) => T) → Promise<T>
      <a id="extract.ts.withTsTree"></a><br>Parse a TypeScript or JavaScript source and run `use` on the tree. `export type * from` and `export type * as NS from` (TypeScript 5.0) are syntax errors for the bundled grammar, while the same statement without `type` is `export * from`: such a `type` is blanked with spaces…
      - calls [extract.treesitter.grammarFor](extract.md#extract.treesitter.grammarFor), [extract.treesitter.withTree](extract.md#extract.treesitter.withTree), [extract.ts.typeStarKeywords](extract.md#extract.ts.typeStarKeywords)
    - type [TypeStar](../../src/extract/ts.ts#L61) <!-- internal -->
      <a id="extract.ts.TypeStar"></a><br>The `type` of an `export type * from` statement the grammar could not read: offsets in the source (UTF-16 code units).
    - fn [typeStarKeywords](../../src/extract/ts.ts#L69) (root: Node) → TypeStar[] <!-- internal -->
      <a id="extract.ts.typeStarKeywords"></a><br>`export type * from "./t"` read as `export`, an error node holding `type`, then `*` or `* as NS`.
    - fn [parentOf](../../src/extract/ts.ts#L97) (node: Node) → Node | null <!-- internal -->
      <a id="extract.ts.parentOf"></a><br>Resolves a syntax node's parent, consulting a module-level `parents` map by node id first and falling back to the node's own `parent` link. Shared by every scope- and ancestry-walking helper in [`extract.ts`](extract.md#extract.ts), such as [`extract.ts.declarationOf`](extract.md#extract.ts.declarationOf) and `extract.ts.insideClosure`. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - fn [parentIndex](../../src/extract/ts.ts#L101) (root: Node) → Map<number, Node> <!-- internal -->
      <a id="extract.ts.parentIndex"></a><br>Walks a tree-sitter syntax tree iteratively from `root` and builds a map from each named child's numeric id to its parent node, skipping null children. [`extract.ts.extractTree`](extract.md#extract.ts.extractTree) uses it to look up parents during fact extraction. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [extractTree](../../src/extract/ts.ts#L114) (path: string, root: Node, language: Language, g: Grammar, typeStars: ReadonlyMap<number, string>) → FileFacts <!-- internal -->
      <a id="extract.ts.extractTree"></a><br>Sets up module-level parent and header-node state via [`extract.ts.parentIndex`](extract.md#extract.ts.parentIndex) and [`extract.ts.moduleHeader`](extract.md#extract.ts.moduleHeader), then runs [`extract.ts.extractIndexed`](extract.md#extract.ts.extractIndexed) and attaches the module doc comment to the returned facts. Always resets that shared state afterwards. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
      - calls [extract.ts.parentIndex](extract.md#extract.ts.parentIndex), [extract.ts.moduleHeader](extract.md#extract.ts.moduleHeader), [extract.ts.extractIndexed](extract.md#extract.ts.extractIndexed)
    - fn [docOf](../../src/extract/ts.ts#L142) (node: Node) → string | undefined <!-- internal -->
      <a id="extract.ts.docOf"></a><br>The declaration's JSDoc: the nearest `/** … *\/` right above it or above the statements that wrap it (`export`, `const x =`), with decorators and line comments between them allowed. A line comment is a note, not documentation; other code in between, the file's header and a…
      - calls [extract.doc-comments.isLicense](extract.md#extract.doc-comments.isLicense), [extract.doc-comments.nonEmpty](extract.md#extract.doc-comments.nonEmpty), [extract.doc-comments.jsdocDescription](extract.md#extract.doc-comments.jsdocDescription), [extract.doc-comments.blockCommentBody](extract.md#extract.doc-comments.blockCommentBody), [extract.ts.parentOf](extract.md#extract.ts.parentOf)
    - fn [moduleHeader](../../src/extract/ts.ts#L163) (root: Node) → { doc: string | null; nodes: Set<number> } <!-- internal -->
      <a id="extract.ts.moduleHeader"></a><br>The module's documentation: the first block of comments in the file (after `#!`; license notices, `/// <reference>` directives and blocks without text skipped), unless it sits right above the first statement that is not an import or a directive (`"use strict"`): then it…
      - calls [extract.doc-comments.isLicense](extract.md#extract.doc-comments.isLicense), [extract.doc-comments.nonEmpty](extract.md#extract.doc-comments.nonEmpty), [extract.doc-comments.jsdocDescription](extract.md#extract.doc-comments.jsdocDescription), [extract.doc-comments.lineCommentsBody](extract.md#extract.doc-comments.lineCommentsBody), [extract.doc-comments.blockCommentBody](extract.md#extract.doc-comments.blockCommentBody)
    - fn [extractIndexed](../../src/extract/ts.ts#L192) (path: string, root: Node, language: Language, g: Grammar, typeStars: ReadonlyMap<number, string>) → FileFacts <!-- internal -->
      <a id="extract.ts.extractIndexed"></a><br>Walks a parsed TS/JS syntax tree's top-level statements to build its file facts: imports, `require` bindings, declarations with their calls and JSX uses, and exports. It marks the file opaque when nesting is too deep. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.ts.lineDeeperThan](extract.md#extract.ts.lineDeeperThan), [extract.treesitter.query](extract.md#extract.treesitter.query), [extract.ts.calleeOfCall](extract.md#extract.ts.calleeOfCall), [extract.ts.parentOf](extract.md#extract.ts.parentOf), [extract.ts.passesOf](extract.md#extract.ts.passesOf), [extract.ts.markClosure](extract.md#extract.ts.markClosure), [extract.ts.componentOfFactory](extract.md#extract.ts.componentOfFactory), [extract.ts.componentOfTag](extract.md#extract.ts.componentOfTag), [extract.ts.requireSource](extract.md#extract.ts.requireSource), [extract.ts.reactWrapperFn](extract.md#extract.ts.reactWrapperFn), [extract.ts.moduleSource](extract.md#extract.ts.moduleSource), [extract.ts.typeSignature](extract.md#extract.ts.typeSignature), [extract.ts.reactBindings](extract.md#extract.ts.reactBindings), [extract.ts.importStatement](extract.md#extract.ts.importStatement), [extract.ts.stringValue](extract.md#extract.ts.stringValue), [extract.ts.importAt](extract.md#extract.ts.importAt), [extract.ts.typeKeyword](extract.md#extract.ts.typeKeyword), [extract.ts.inlineTypesOnly](extract.md#extract.ts.inlineTypesOnly), [extract.ts.unwrapValue](extract.md#extract.ts.unwrapValue), [extract.ts.decl](extract.md#extract.ts.decl), [extract.ts.signature](extract.md#extract.ts.signature), [extract.ts.collectTypeRefs](extract.md#extract.ts.collectTypeRefs), [extract.ts.classDecl](extract.md#extract.ts.classDecl), [extract.ts.commonJsExports](extract.md#extract.ts.commonJsExports), [extract.ts.collectDynamicImports](extract.md#extract.ts.collectDynamicImports), [extract.ts.collectUnsupported](extract.md#extract.ts.collectUnsupported), [extract.ts.collectValueRefs](extract.md#extract.ts.collectValueRefs), [extract.ts.collectRouteEntries](extract.md#extract.ts.collectRouteEntries), [extract.treesitter.errorLine](extract.md#extract.treesitter.errorLine)
    - type [ReactBindings](../../src/extract/ts.ts#L478) <!-- internal -->
      <a id="extract.ts.ReactBindings"></a><br>What value imports from React bind in one file.
    - fn [reactBindings](../../src/extract/ts.ts#L492) (root: Node) → ReactBindings <!-- internal -->
      <a id="extract.ts.reactBindings"></a><br>React bindings of one file: the single source for wrappers and factories, so both follow one type-only rule. Imports hoist, so a `const` above its import still counts; `require("react")` binds only below itself and is not read. `import type`, `import type * as React` and…
      - calls [extract.ts.typeKeyword](extract.md#extract.ts.typeKeyword), [extract.ts.importStatement](extract.md#extract.ts.importStatement), [extract.ts.typeOnlySpecifier](extract.md#extract.ts.typeOnlySpecifier)
    - fn [reactExportOf](../../src/extract/ts.ts#L511) (callee: Node, react: ReactBindings) → { name: string; local: string } | null <!-- internal -->
      <a id="extract.ts.reactExportOf"></a><br>The React export a callee names through a binding of the file (`memo`, `h`, `React.memo`), with the local it goes through. Shadowing is the caller's.
    - fn [typeKeyword](../../src/extract/ts.ts#L524) (node: Node) → boolean <!-- internal -->
      <a id="extract.ts.typeKeyword"></a><br>The `type` keyword of `import type` or `import { type name }` — an unnamed child, not an identifier.
    - fn [inlineTypesOnly](../../src/extract/ts.ts#L534) (list: Node, specifier: "import_specifier" | "export_specifier") → boolean <!-- internal -->
      <a id="extract.ts.inlineTypesOnly"></a><br>`{ type A, type B as C }` of an import or an `export … from`: at least one name, and every one of them `type`. Whether such a statement runs is the tsconfig's to say (`ImportFact.inlineTypeOnly`), so it stays a fact of the syntax here.
      - calls [extract.ts.typeKeyword](extract.md#extract.ts.typeKeyword)
    - fn [typeOnlySpecifier](../../src/extract/ts.ts#L540) (stmt: Node, local: string) → boolean <!-- internal -->
      <a id="extract.ts.typeOnlySpecifier"></a><br>`import { type memo as m }`: the specifier that binds `local` is type-only.
      - calls [extract.ts.typeKeyword](extract.md#extract.ts.typeKeyword)
    - fn [decl](../../src/extract/ts.ts#L551) (kind: DeclFact["kind"], name: string, node: Node, signature: string | null, exported: boolean, calls: CallFact[], types: TypeRefFact[], members: DeclFact[]) → DeclFact <!-- internal -->
      <a id="extract.ts.decl"></a><br>Builds a `DeclFact` record from a parsed TypeScript node, attaching its position via [`extract.treesitter.located`](extract.md#extract.treesitter.located), a content hash via [`extract.treesitter.fingerprint`](extract.md#extract.treesitter.fingerprint), and any doc comment from [`extract.ts.docOf`](extract.md#extract.ts.docOf). The remaining fields (kind, name, signature, export flag, calls… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.ts.docOf](extract.md#extract.ts.docOf), [extract.treesitter.fingerprint](extract.md#extract.treesitter.fingerprint)
    - fn [boundCall](../../src/extract/ts.ts#L557) (call: CallFact, bound: "parameter" | "local" | null) → CallFact <!-- internal -->
      <a id="extract.ts.boundCall"></a><br>Returns a copy of the call fact with a `bound` field set to `"parameter"` or `"local"` when a binding kind is given, otherwise hands back the original fact unchanged. Used by [`extract.ts.calleeFact`](extract.md#extract.ts.calleeFact) and [`extract.ts.calleeOfCall`](extract.md#extract.ts.calleeOfCall) to tag callees that resolve to parameters or… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [callFact](../../src/extract/ts.ts#L561) (callee: string, node: Node) → CallFact <!-- internal -->
      <a id="extract.ts.callFact"></a><br>Builds a call record by pairing a callee name with the start and end line/column positions of a syntax node, obtained via [`extract.treesitter.located`](extract.md#extract.treesitter.located). Shared by [`extract.ts.calleeFact`](extract.md#extract.ts.calleeFact), [`extract.ts.calleeOfCall`](extract.md#extract.ts.calleeOfCall), [`extract.ts.componentOfTag`](extract.md#extract.ts.componentOfTag), and [`extract.ts.opaqueCall`](extract.md#extract.ts.opaqueCall). _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located)
    - fn [opaqueCall](../../src/extract/ts.ts#L567) (node: Node) → CallFact <!-- internal -->
      <a id="extract.ts.opaqueCall"></a><br>A call through an expression keylang does not name: a hole with the source text.
      - calls [extract.ts.collapse](extract.md#extract.ts.collapse), [extract.ts.callFact](extract.md#extract.ts.callFact)
    - fn [calleeOfCall](../../src/extract/ts.ts#L580) (node: Node, body: Node, cls: ClassScope | null) → CallFact | null <!-- internal -->
      <a id="extract.ts.calleeOfCall"></a><br>The fact of one call or `new` from its callee node. Null only for a call keylang records another way: `require()` and `import()` (imports), `import.meta.resolve()` (an import), a function literal called in place (the calls of its body are read where they are), a class…
      - calls [extract.ts.unwrapValue](extract.md#extract.ts.unwrapValue), [extract.ts.parentOf](extract.md#extract.ts.parentOf), [extract.ts.requireKind](extract.md#extract.ts.requireKind), [extract.ts.boundCall](extract.md#extract.ts.boundCall), [extract.ts.callFact](extract.md#extract.ts.callFact), [extract.ts.bindingOf](extract.md#extract.ts.bindingOf), [extract.ts.localHook](extract.md#extract.ts.localHook), [extract.ts.calleeFact](extract.md#extract.ts.calleeFact), [extract.ts.opaqueCall](extract.md#extract.ts.opaqueCall)
    - fn [componentOfTag](../../src/extract/ts.ts#L620) (name: Node, body: Node, cls: ClassScope | null) → CallFact | null <!-- internal -->
      <a id="extract.ts.componentOfTag"></a><br>The call a JSX tag makes, from its name node: `<Cart />` calls `Cart`, `<Cart.Item />` calls `Cart.Item`, as the call expressions would. Null when the tag is not a component: an intrinsic element (`<div />`, `<my-button />`: a lowercase first letter), a namespace name…
      - calls [extract.ts.calleeFact](extract.md#extract.ts.calleeFact), [extract.ts.collapse](extract.md#extract.ts.collapse), [extract.ts.callFact](extract.md#extract.ts.callFact), [extract.ts.opaqueCall](extract.md#extract.ts.opaqueCall)
    - fn [componentOfFactory](../../src/extract/ts.ts#L648) (call: Node, calleeNode: Node, body: Node, cls: ClassScope | null, react: ReactBindings) → CallFact | null <!-- internal -->
      <a id="extract.ts.componentOfFactory"></a><br>The component call hidden in a React factory: `createElement(Cart)`, `jsx(Cart)`, `jsxs(Cart.Item)`, `jsxDEV(Cart)` are the call `<Cart />` would be, when the callee is bound by an import from `react`, `react/jsx-runtime` or `react/jsx-dev-runtime` (`h` for `createElement as…
      - calls [extract.ts.factoryCallee](extract.md#extract.ts.factoryCallee), [extract.ts.componentOfTag](extract.md#extract.ts.componentOfTag), [extract.ts.unwrapValue](extract.md#extract.ts.unwrapValue)
    - fn [factoryCallee](../../src/extract/ts.ts#L655) (node: Node, body: Node, react: ReactBindings) → boolean <!-- internal -->
      <a id="extract.ts.factoryCallee"></a><br>The callee node is a React factory binding, and nothing between here and the body shadows it.
      - calls [extract.ts.unwrapValue](extract.md#extract.ts.unwrapValue), [extract.ts.reactExportOf](extract.md#extract.ts.reactExportOf), [extract.ts.bindingOf](extract.md#extract.ts.bindingOf)
    - fn [requireKind](../../src/extract/ts.ts#L667) (node: Node) → "global" | "created" | "shadowed" <!-- internal -->
      <a id="extract.ts.requireKind"></a><br>What a `require` identifier is: Node's (`global`), one made by `createRequire(…)` (`created`), which also loads modules, or a parameter or local of another value (`shadowed`), whose call is not an import.
      - calls [extract.ts.declarationOf](extract.md#extract.ts.declarationOf), [extract.ts.unwrapValue](extract.md#extract.ts.unwrapValue)
    - fn [importAt](../../src/extract/ts.ts#L677) (node: Node, source: string, bindings: ImportBinding[], reexport: boolean) → ImportFact <!-- internal -->
      <a id="extract.ts.importAt"></a><br>Builds an `ImportFact` record by combining the given module source, bindings, and reexport flag with the line/column span and raw text that [`extract.treesitter.located`](extract.md#extract.treesitter.located) reads from the syntax node. It is the shared constructor used by [`extract.ts.importStatement`](extract.md#extract.ts.importStatement)… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located)
    - fn [nestedDeclaration](../../src/extract/ts.ts#L689) (node: Node) → boolean <!-- internal -->
      <a id="extract.ts.nestedDeclaration"></a><br>A declaration of its own below the one whose type names are collected. A method signature is one in a class body (an overload of a member); in an interface or an object type (`{ save(o: Order): void }`) it is part of that type.
    - fn [lineDeeperThan](../../src/extract/ts.ts#L694) (root: Node, limit: number) → number | null <!-- internal -->
      <a id="extract.ts.lineDeeperThan"></a><br>1-based line of the first node nested deeper than `limit` below `root`; null when none is.
    - fn [walkNamed](../../src/extract/ts.ts#L718) (root: Node, enter: (node: Node) => boolean | void) → void <!-- internal -->
      <a id="extract.ts.walkNamed"></a><br>Pre-order walk over named nodes with an explicit stack: an expression nested thousands deep must not overflow the call stack. `enter` returns false to skip the node's subtree.
    - fn [collectTypeRefs](../../src/extract/ts.ts#L738) (node: Node, bound: ReadonlySet<string> = NO_NAMES) → TypeRefFact[] <!-- internal -->
      <a id="extract.ts.collectTypeRefs"></a><br>Type names used by `node`, excluding its own declared name, nested declarations and the names a generic binds in its scope: a type parameter (`<T>`), a mapped type's key (`[K in keyof T]`), an `infer U`. `bound`: the type parameters already in scope, a class's for its members.
      - calls [extract.ts.nestedDeclaration](extract.md#extract.ts.nestedDeclaration), [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.ts.typeNamesBound](extract.md#extract.ts.typeNamesBound)
    - fn [typeNamesBound](../../src/extract/ts.ts#L766) (node: Node, bound: ReadonlySet<string>) → ReadonlySet<string> <!-- internal -->
      <a id="extract.ts.typeNamesBound"></a><br>`bound` and the type names `node` binds for its subtree: its type parameters, a mapped type's key, the `infer` names of a conditional type.
      - calls [extract.ts.walkNamed](extract.md#extract.ts.walkNamed)
    - fn [classDecl](../../src/extract/ts.ts#L801) (name: string, cls: Node, at: Node, exported: boolean, declCalls: (n: Node, scope: ClassScope | null) => CallFact[], facts: FileFacts) → DeclFact <!-- internal -->
      <a id="extract.ts.classDecl"></a><br>Members of a class. Methods and function-valued fields (`handler = () => …`) are fns with their own calls and types.
      - calls [extract.ts.classScope](extract.md#extract.ts.classScope), [extract.ts.typeNamesBound](extract.md#extract.ts.typeNamesBound), [extract.ts.collectTypeRefs](extract.md#extract.ts.collectTypeRefs), [extract.ts.unsupported](extract.md#extract.ts.unsupported), [extract.ts.memberName](extract.md#extract.ts.memberName), [extract.ts.decl](extract.md#extract.ts.decl), [extract.ts.signature](extract.md#extract.ts.signature), [extract.ts.unwrapValue](extract.md#extract.ts.unwrapValue), [extract.ts.initializer](extract.md#extract.ts.initializer), [extract.ts.heritage](extract.md#extract.ts.heritage), [extract.ts.baseClass](extract.md#extract.ts.baseClass)
    - fn [baseClass](../../src/extract/ts.ts#L875) (heritage: Node) → string | null <!-- internal -->
      <a id="extract.ts.baseClass"></a><br>The `extends` expression: `(extends_clause value: …)` in TypeScript, the bare expression in JavaScript.
      - calls [extract.ts.collapse](extract.md#extract.ts.collapse)
    - fn [unwrapValue](../../src/extract/ts.ts#L882) (node: Node) → Node
      <a id="extract.ts.unwrapValue"></a><br>`(f)`, `f as T`, `f satisfies T`, `f!`: the expression they wrap.
    - fn [reactWrapperFn](../../src/extract/ts.ts#L902) (value: Node, react: ReactBindings) → Node | null <!-- internal -->
      <a id="extract.ts.reactWrapperFn"></a><br>The function a React wrapper call hides: `memo(() => …)` is the function it wraps when — and only when — the callee is bound by an import from `react` (the `names` / `objects` such an import binds; `React.memo` through a default or namespace import counts). By name alone a…
      - calls [extract.ts.reactExportOf](extract.md#extract.ts.reactExportOf), [extract.ts.unwrapValue](extract.md#extract.ts.unwrapValue)
    - fn [initializer](../../src/extract/ts.ts#L913) (name: "constructor" | "static", items: { node: Node; calls: CallFact[] }[]) → DeclFact <!-- internal -->
      <a id="extract.ts.initializer"></a><br>A synthesized member over the initializers it runs, from the first to the last.
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.treesitter.fingerprint](extract.md#extract.treesitter.fingerprint)
    - fn [memberName](../../src/extract/ts.ts#L920) (node: Node) → string <!-- internal -->
      <a id="extract.ts.memberName"></a><br>Normalizes a property-key syntax node to a plain identifier: string-literal keys are unquoted via [`extract.ts.stringValue`](extract.md#extract.ts.stringValue) (falling back to raw text), and a leading `#` on private members is stripped. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [extract.ts.stringValue](extract.md#extract.ts.stringValue)
    - type [ClassScope](../../src/extract/ts.ts#L926) <!-- internal -->
      <a id="extract.ts.ClassScope"></a><br>Where `this.<field>` values come from, for `this.decoder.feed()` and `this.run()`.
    - fn [classScope](../../src/extract/ts.ts#L933) (items: readonly Node[]) → ClassScope <!-- internal -->
      <a id="extract.ts.classScope"></a><br>Maps a class's field names to types from field declarations, constructor parameter properties and `this.x =` assignments, and records constructor fallbacks found via [`extract.ts.fallbackOf`](extract.md#extract.ts.fallbackOf) as injectable hooks. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [extract.ts.typeName](extract.md#extract.ts.typeName), [extract.ts.newClass](extract.md#extract.ts.newClass), [extract.ts.memberName](extract.md#extract.ts.memberName), [extract.ts.fallbackCallee](extract.md#extract.ts.fallbackCallee), [extract.ts.fallbackOf](extract.md#extract.ts.fallbackOf)
    - fn [importStatement](../../src/extract/ts.ts#L987) (node: Node) → ImportFact[] <!-- internal -->
      <a id="extract.ts.importStatement"></a><br>Turns a TypeScript import statement into an import fact via [`extract.ts.importAt`](extract.md#extract.ts.importAt), recording default, namespace, named, and `import = require` bindings. It flags type-only imports using [`extract.ts.typeKeyword`](extract.md#extract.ts.typeKeyword) and [`extract.ts.inlineTypesOnly`](extract.md#extract.ts.inlineTypesOnly). _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
      - calls [extract.ts.stringValue](extract.md#extract.ts.stringValue), [extract.ts.importAt](extract.md#extract.ts.importAt), [extract.ts.typeKeyword](extract.md#extract.ts.typeKeyword), [extract.ts.inlineTypesOnly](extract.md#extract.ts.inlineTypesOnly)
    - fn [collectDynamicImports](../../src/extract/ts.ts#L1025) (root: Node, facts: FileFacts) → void <!-- internal -->
      <a id="extract.ts.collectDynamicImports"></a><br>Literal `import("…")` / `require("…")` anywhere in the file. A non-literal specifier is coverage, not an edge.
      - calls [extract.ts.importAt](extract.md#extract.ts.importAt), [extract.ts.walkNamed](extract.md#extract.ts.walkNamed), [extract.ts.moduleUrlSpecs](extract.md#extract.ts.moduleUrlSpecs), [extract.ts.unsupported](extract.md#extract.ts.unsupported), [extract.ts.requireKind](extract.md#extract.ts.requireKind), [extract.ts.stringValue](extract.md#extract.ts.stringValue), [extract.ts.inTypePosition](extract.md#extract.ts.inTypePosition)
    - fn [inTypePosition](../../src/extract/ts.ts#L1072) (node: Node) → boolean <!-- internal -->
      <a id="extract.ts.inTypePosition"></a><br>Whether an `import(…)` call is written where a type goes (`x: import("./a").A`, `typeof import("./a")`, `v as import("./a").T`): a type-only dependency, as `import type` is.
    - fn [collectUnsupported](../../src/extract/ts.ts#L1083) (root: Node, facts: FileFacts) → void <!-- internal -->
      <a id="extract.ts.collectUnsupported"></a><br>Namespace, `eval`, `new Function`, and a call through `obj[expr]` are coverage, not edges.
      - calls [extract.ts.walkNamed](extract.md#extract.ts.walkNamed), [extract.ts.parentOf](extract.md#extract.ts.parentOf), [extract.ts.unsupported](extract.md#extract.ts.unsupported), [extract.ts.unwrapValue](extract.md#extract.ts.unwrapValue)
    - fn [unsupported](../../src/extract/ts.ts#L1096) (node: Node, reason: string) → UnsupportedFact <!-- internal -->
      <a id="extract.ts.unsupported"></a><br>Builds a record describing a construct the TypeScript extractor refuses to handle, copying the span and source text from [`extract.treesitter.located`](extract.md#extract.treesitter.located) and attaching the given reason. Used by [`extract.ts.classDecl`](extract.md#extract.ts.classDecl), [`extract.ts.collectDynamicImports`](extract.md#extract.ts.collectDynamicImports), and… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located)
    - fn [calleeFact](../../src/extract/ts.ts#L1106) (n: Node, stop: Node, cls: ClassScope | null) → CallFact | null <!-- internal -->
      <a id="extract.ts.calleeFact"></a><br>The callee of a call or a function value in an argument: `f`, `a.b`, `this.m`, or `this.field.m` when the field's class is known. Null for any other shape.
      - calls [extract.ts.boundCall](extract.md#extract.ts.boundCall), [extract.ts.callFact](extract.md#extract.ts.callFact), [extract.ts.bindingOf](extract.md#extract.ts.bindingOf), [extract.ts.classThis](extract.md#extract.ts.classThis), [extract.ts.memberName](extract.md#extract.ts.memberName), [extract.ts.localClass](extract.md#extract.ts.localClass), [extract.ts.newClass](extract.md#extract.ts.newClass), [extract.ts.unwrapValue](extract.md#extract.ts.unwrapValue), [extract.ts.collapse](extract.md#extract.ts.collapse)
    - fn [classThis](../../src/extract/ts.ts#L1138) (n: Node) → boolean <!-- internal -->
      <a id="extract.ts.classThis"></a><br>`this` at `n` is the class instance: the nearest enclosing non-arrow function is a class member, or a field initializer or `static {}` holds it.
      - calls [extract.ts.parentOf](extract.md#extract.ts.parentOf)
    - fn [passesOf](../../src/extract/ts.ts#L1152) (call: Node, stop: Node, cls: ClassScope | null) → PassFact[] <!-- internal -->
      <a id="extract.ts.passesOf"></a><br>Function values in the arguments: the argument itself (`run(save)`, `run(this.m)`, `run(obj.m)` with the class of `obj` known, `run(this.m.bind(this))`) or a property of an object literal. A closure literal is not a pass: its calls carry `closureArg`.
      - calls [extract.ts.calleeFact](extract.md#extract.ts.calleeFact), [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.ts.collapse](extract.md#extract.ts.collapse), [extract.ts.memberName](extract.md#extract.ts.memberName)
    - fn [markClosure](../../src/extract/ts.ts#L1189) (fact: CallFact, n: Node, stop: Node) → void <!-- internal -->
      <a id="extract.ts.markClosure"></a><br>A call inside a function nested in the declaration `stop` gets `closure`; when every such function is a closure literal written as an argument of a call (`items.map(() => hit())`, `new Promise((ok) => hit())`), also `closureArg` at the outermost one. A closure stored in a…
      - calls [extract.ts.parentOf](extract.md#extract.ts.parentOf), [extract.treesitter.startCol](extract.md#extract.treesitter.startCol)
    - fn [typeName](../../src/extract/ts.ts#L1203) (annotation: Node | null) → string | null <!-- internal -->
      <a id="extract.ts.typeName"></a><br>`: X` → `X`; generics, unions and qualified names are not a class the graph can resolve.
    - fn [newClass](../../src/extract/ts.ts#L1209) (value: Node | null) → string | null <!-- internal -->
      <a id="extract.ts.newClass"></a><br>`new X(…)` → `X`.
    - type [Declaration](../../src/extract/ts.ts#L1214) <!-- internal -->
      <a id="extract.ts.Declaration"></a><br>Tagged union classifying what an identifier resolves to during TypeScript extraction: a local binding with its node, a function parameter with its owning function and position, or anything else. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [declarationOf](../../src/extract/ts.ts#L1221) (from: Node, name: string, stop: Node) → Declaration | null <!-- internal -->
      <a id="extract.ts.declarationOf"></a><br>The nearest binding of `name` between `from` and `stop`, in the scopes `bindingOf` walks: a declarator or a parameter; `other` for a loop or `catch` variable, a nested function or class name. Null when nothing binds it.
      - calls [extract.ts.parentOf](extract.md#extract.ts.parentOf), [extract.ts.patternNames](extract.md#extract.ts.patternNames), [extract.ts.blockStatements](extract.md#extract.ts.blockStatements), [extract.ts.declaredNames](extract.md#extract.ts.declaredNames)
    - fn [localClass](../../src/extract/ts.ts#L1264) (from: Node, name: string, stop: Node) → string | null <!-- internal -->
      <a id="extract.ts.localClass"></a><br>Class of a local or parameter: `const w = new X()`, `const w: X = …`, `(w: X) =>`. Null when a nearer binding (a loop variable) hides the declaration, or when `X` itself is rebound between the declaration and `stop` (`const X = Ctor`).
      - calls [extract.ts.declarationOf](extract.md#extract.ts.declarationOf), [extract.ts.typeName](extract.md#extract.ts.typeName), [extract.ts.newClass](extract.md#extract.ts.newClass), [extract.ts.bindingOf](extract.md#extract.ts.bindingOf)
    - fn [fallbackOf](../../src/extract/ts.ts#L1274) (expr: Node, stop: Node) → { source: Node; fallback: string } | null <!-- internal -->
      <a id="extract.ts.fallbackOf"></a><br>`x ?? f` / `x || f` with a callee `f`: the value `x` and the default.
      - calls [extract.ts.fallbackCallee](extract.md#extract.ts.fallbackCallee)
    - fn [fallbackCallee](../../src/extract/ts.ts#L1285) (node: Node, stop: Node) → string | null <!-- internal -->
      <a id="extract.ts.fallbackCallee"></a><br>A default that names a declaration: an unbound `f`, `mod.f`, or `this.m`.
      - calls [extract.ts.bindingOf](extract.md#extract.ts.bindingOf)
    - fn [localHook](../../src/extract/ts.ts#L1301) (from: Node, name: string, stop: Node) → HookFact | null <!-- internal -->
      <a id="extract.ts.localHook"></a><br>The hook behind a call of a local or parameter `name`: `const g = request.generate ?? generateMap`, `const { g = f } = request`, `function run(g = f)`, `function run({ g = f })`. Injection is known only for a parameter of the declaration itself.
      - calls [extract.ts.declarationOf](extract.md#extract.ts.declarationOf), [extract.ts.defaultIn](extract.md#extract.ts.defaultIn), [extract.ts.fallbackCallee](extract.md#extract.ts.fallbackCallee), [extract.ts.fallbackOf](extract.md#extract.ts.fallbackOf), [extract.ts.plainParameter](extract.md#extract.ts.plainParameter)
    - fn [plainParameter](../../src/extract/ts.ts#L1338) (node: Node) → boolean <!-- internal -->
      <a id="extract.ts.plainParameter"></a><br>Returns true when a tree-sitter parameter node is a bare identifier, a required/optional parameter whose pattern is an identifier, or a default-value parameter whose left side is an identifier, rejecting destructured forms. Used by [`extract.ts.localHook`](extract.md#extract.ts.localHook). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [defaultIn](../../src/extract/ts.ts#L1345) (node: Node, name: string, path: string) → { value: Node; path: string } | null <!-- internal -->
      <a id="extract.ts.defaultIn"></a><br>The default value of `name` in a parameter or pattern, with its property path.
      - calls [extract.ts.memberName](extract.md#extract.ts.memberName)
    - fn [collectValueRefs](../../src/extract/ts.ts#L1386) (root: Node, facts: FileFacts) → void <!-- internal -->
      <a id="extract.ts.collectValueRefs"></a><br>Names read as values: identifiers outside callee and binding positions, shorthand properties, and member names read without a call. The first position of each name in the file.
      - calls [extract.treesitter.startCol](extract.md#extract.treesitter.startCol), [extract.ts.walkNamed](extract.md#extract.ts.walkNamed), [extract.ts.parentOf](extract.md#extract.ts.parentOf), [extract.ts.bindsOrCalls](extract.md#extract.ts.bindsOrCalls), [extract.ts.exportedValue](extract.md#extract.ts.exportedValue), [extract.ts.memberObject](extract.md#extract.ts.memberObject), [extract.ts.bindingOf](extract.md#extract.ts.bindingOf), [extract.ts.calledMember](extract.md#extract.ts.calledMember), [extract.ts.moduleSource](extract.md#extract.ts.moduleSource), [extract.ts.memberName](extract.md#extract.ts.memberName)
    - fn [memberObject](../../src/extract/ts.ts#L1423) (node: Node, parent: Node | null, facts: FileFacts) → boolean <!-- internal -->
      <a id="extract.ts.memberObject"></a><br>The identifier is the object of a member access that uses only a member of it: `ns.helper()`, `new ns.X()`, and any `mod.x` of a module binding (the read is `mod.x`, noted on its own). `.call`, `.apply` and `.bind` use the function itself, so they read it.
      - calls [extract.ts.calledMember](extract.md#extract.ts.calledMember), [extract.ts.moduleSource](extract.md#extract.ts.moduleSource)
    - fn [calledMember](../../src/extract/ts.ts#L1431) (member: Node) → boolean <!-- internal -->
      <a id="extract.ts.calledMember"></a><br>The member expression is what a call or `new` runs: `a.b()`, `new a.B()`.
      - calls [extract.ts.parentOf](extract.md#extract.ts.parentOf)
    - fn [exportedValue](../../src/extract/ts.ts#L1441) (node: Node) → boolean <!-- internal -->
      <a id="extract.ts.exportedValue"></a><br>A name the module exports as a value: `export default handler`, `export = handler`, `module.exports = handler` or `= { handler }`, `exports.run = run`. Importers that call it are resolved callers, as for `export { handler }`.
      - calls [extract.ts.parentOf](extract.md#extract.ts.parentOf)
    - fn [bindsOrCalls](../../src/extract/ts.ts#L1463) (node: Node, parent: Node) → boolean <!-- internal -->
      <a id="extract.ts.bindsOrCalls"></a><br>The identifier is a callee, a declared name, or a binding — not a value read.
    - fn [stringsOf](../../src/extract/ts.ts#L1479) (node: Node) → string[] | null <!-- internal -->
      <a id="extract.ts.stringsOf"></a><br>Strings an expression can evaluate to: a literal, a ternary of literals, a `const` bound to one.
      - calls [extract.ts.stringValue](extract.md#extract.ts.stringValue), [extract.ts.declarationOf](extract.md#extract.ts.declarationOf), [extract.ts.parentOf](extract.md#extract.ts.parentOf)
    - fn [isImportMetaUrl](../../src/extract/ts.ts#L1501) (node: Node | undefined) → boolean <!-- internal -->
      <a id="extract.ts.isImportMetaUrl"></a><br>Checks whether a syntax node, after stripping all whitespace, spells exactly `import.meta.url`, returning false for an undefined node. [`extract.ts.moduleUrlSpecs`](extract.md#extract.ts.moduleUrlSpecs) uses it to recognise module-URL expressions. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [moduleUrlSpecs](../../src/extract/ts.ts#L1514) (node: Node) → { spec: string; optional: boolean }[] | null <!-- internal -->
      <a id="extract.ts.moduleUrlSpecs"></a><br>Module files named relative to this module: `new URL("./worker.ts", import.meta.url)` (a `Worker`, a loader) and `register(spec, import.meta.url | { parentURL: import.meta.url })`. Null when the specifier is not a string the syntax fixes: a module edge may be hidden there.
      - calls [extract.ts.isImportMetaUrl](extract.md#extract.ts.isImportMetaUrl), [extract.ts.stringsOf](extract.md#extract.ts.stringsOf), [extract.ts.staticSuffix](extract.md#extract.ts.staticSuffix), [extract.ts.extensionless](extract.md#extract.ts.extensionless)
    - fn [extensionless](../../src/extract/ts.ts#L1530) (spec: string) → boolean <!-- internal -->
      <a id="extract.ts.extensionless"></a><br>`./worker`, `../lib/job`: a path whose last segment has no extension (not a directory `./dir/`, not `.` or `..`).
    - fn [staticSuffix](../../src/extract/ts.ts#L1538) (node: Node) → string <!-- internal -->
      <a id="extract.ts.staticSuffix"></a><br>The literal end of a computed string: the tail of a template, the last operand of `+`.
      - calls [extract.ts.stringValue](extract.md#extract.ts.stringValue)
    - fn [bindingOf](../../src/extract/ts.ts#L1562) (call: Node, name: string, stop: Node) → "parameter" | "local" | null <!-- internal -->
      <a id="extract.ts.bindingOf"></a><br>Where the head identifier of a call is bound between the call and `stop` (the declaration being extracted): a parameter, a local, a destructured name, a nested function or class, a loop or catch variable. Such a call does not name the module-level symbol of the same name.
      - calls [extract.ts.parentOf](extract.md#extract.ts.parentOf), [extract.ts.patternNames](extract.md#extract.ts.patternNames), [extract.ts.blockDeclares](extract.md#extract.ts.blockDeclares), [extract.ts.declaredNames](extract.md#extract.ts.declaredNames)
    - fn [blockStatements](../../src/extract/ts.ts#L1592) (block: Node) → Node[] <!-- internal -->
      <a id="extract.ts.blockStatements"></a><br>The statements of a block. A `switch` is one block: a `const` or `function` of one case is in scope in every case.
    - fn [blockDeclares](../../src/extract/ts.ts#L1597) (block: Node, name: string) → boolean <!-- internal -->
      <a id="extract.ts.blockDeclares"></a><br>Checks whether any statement in a block, including the inner declaration of an export statement, declares the given name, using [`extract.ts.blockStatements`](extract.md#extract.ts.blockStatements) and [`extract.ts.declaredNames`](extract.md#extract.ts.declaredNames); used by [`extract.ts.bindingOf`](extract.md#extract.ts.bindingOf) to detect local bindings. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [extract.ts.blockStatements](extract.md#extract.ts.blockStatements), [extract.ts.declaredNames](extract.md#extract.ts.declaredNames)
    - fn [declaredNames](../../src/extract/ts.ts#L1606) (stmt: Node) → string[] <!-- internal -->
      <a id="extract.ts.declaredNames"></a><br>Collects the identifiers a statement introduces: for `let`/`const`/`var` it expands each declarator's name through [`extract.ts.patternNames`](extract.md#extract.ts.patternNames) (so destructuring yields every bound name), for functions and classes it returns the single name field, and anything else yields nothing. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [extract.ts.patternNames](extract.md#extract.ts.patternNames)
    - fn [patternNames](../../src/extract/ts.ts#L1621) (node: Node) → string[] <!-- internal -->
      <a id="extract.ts.patternNames"></a><br>Every identifier bound by a parameter list or a destructuring pattern.
      - calls [extract.ts.declaredNames](extract.md#extract.ts.declaredNames)
    - fn [moduleSource](../../src/extract/ts.ts#L1654) (facts: FileFacts, local: string, orDefault = false) → string | null <!-- internal -->
      <a id="extract.ts.moduleSource"></a><br>Source of the import that bound `local` as a whole module (a namespace or `require`), if any; with `orDefault`, also as a default import, whose members the graph resolves on the default export.
    - fn [requireSource](../../src/extract/ts.ts#L1664) (value: Node, requires: ReturnType<typeof query>) → { source: string; namespace: boolean } | null <!-- internal -->
      <a id="extract.ts.requireSource"></a><br>`require("./x")`, `import("./x")`, `await import("./x")` as the whole value: the module a declarator binds. A `require` parameter or local is not Node's. `namespace`: `import()` gives the module's namespace object, `require()` its `module.exports`.
      - calls [extract.ts.parentOf](extract.md#extract.ts.parentOf), [extract.ts.requireKind](extract.md#extract.ts.requireKind)
    - fn [commonJsExports](../../src/extract/ts.ts#L1687) (stmt: Node, facts: FileFacts, declCalls: (n: Node) => CallFact[]) → void <!-- internal -->
      <a id="extract.ts.commonJsExports"></a><br>`module.exports = {…}`, `module.exports = f`, `exports.x = …`. A function value assigned there is a fn of the module, like `export const x = () => …`: `exports.run = function () {}` and `module.exports = { go() {} }` declare `run` and `go`; `module.exports = function () {}`…
      - calls [extract.ts.unwrapValue](extract.md#extract.ts.unwrapValue), [extract.ts.decl](extract.md#extract.ts.decl), [extract.ts.signature](extract.md#extract.ts.signature), [extract.ts.collectTypeRefs](extract.md#extract.ts.collectTypeRefs)
    - fn [stringValue](../../src/extract/ts.ts#L1736) (n: Node) → string | null <!-- internal -->
      <a id="extract.ts.stringValue"></a><br>Returns the literal text of a tree-sitter `string` node by reading its `string_fragment` child, yielding an empty string for an empty literal and `null` for any other node type. Used by import, member-name, and string-collection helpers in [`extract.ts`](extract.md#extract.ts) to read literal values. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [collectRouteEntries](../../src/extract/ts.ts#L1750) (root: Node, facts: FileFacts) → void <!-- internal -->
      <a id="extract.ts.collectRouteEntries"></a><br>`app.get('/x', h)`, `router.post('/x', auth, h)`: a handler registered on a literal path — a `route` entry labelled `GET /x` whose callee is the last argument when it is a name (`h`, `handlers.save`). A computed path, or a handler written in place, is not recorded: nothing in…
      - calls [extract.ts.stringValue](extract.md#extract.ts.stringValue), [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.ts.collapse](extract.md#extract.ts.collapse)
    - fn [signature](../../src/extract/ts.ts#L1771) (fn: Node) → string <!-- internal -->
      <a id="extract.ts.signature"></a><br>Builds a one-line signature string from a function-like tree-sitter node: its parameter list (wrapped in parentheses if it isn't a formal parameter list) plus an arrow and return type when present. Whitespace in both parts is squeezed via [`extract.ts.collapse`](extract.md#extract.ts.collapse), and the leading… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [extract.ts.collapse](extract.md#extract.ts.collapse)
    - fn [typeSignature](../../src/extract/ts.ts#L1780) (n: Node) → string | null <!-- internal -->
      <a id="extract.ts.typeSignature"></a><br>Builds the display suffix for a type-like declaration: for a type alias it whitespace-collapses the aliased type via [`extract.ts.collapse`](extract.md#extract.ts.collapse) and returns `= T` only when 60 chars or shorter. For anything else it defers to [`extract.ts.heritage`](extract.md#extract.ts.heritage) to render extends/implements clauses. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [extract.ts.collapse](extract.md#extract.ts.collapse), [extract.ts.heritage](extract.md#extract.ts.heritage)
    - fn [heritage](../../src/extract/ts.ts#L1789) (n: Node) → string | null <!-- internal -->
      <a id="extract.ts.heritage"></a><br>Finds the first child of a tree-sitter node whose type is a class heritage, extends-type, or extends clause and returns its source text whitespace-normalised via [`extract.ts.collapse`](extract.md#extract.ts.collapse), or null when no such clause exists. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [extract.ts.collapse](extract.md#extract.ts.collapse)
    - fn [collapse](../../src/extract/ts.ts#L1794) (s: string) → string <!-- internal -->
      <a id="extract.ts.collapse"></a><br>Squeezes every run of whitespace in a string down to a single space and strips leading and trailing blanks. Normalizes source text extracted for signatures and heritage by callers like [`extract.ts.signature`](extract.md#extract.ts.signature) and [`extract.ts.heritage`](extract.md#extract.ts.heritage). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [isNodeBuiltin](../../src/extract/ts.ts#L1799) (spec: string) → boolean
      <a id="extract.ts.isNodeBuiltin"></a><br>Is this specifier a Node built-in (`fs`, `node:fs`)?
