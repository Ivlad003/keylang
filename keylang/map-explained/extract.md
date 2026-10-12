<!-- keylang:generated — не редагувати, `keylang map` -->

[README](README.md) · modules: [bodies](#extract.bodies) · [doc-comments](#extract.doc-comments) · [facts](#extract.facts) · [grammars](#extract.grammars) · [php](#extract.php) · [python](#extract.python) · [rust](#extract.rust) · [treesitter](#extract.treesitter) · [ts](#extract.ts)

# map

- extract
  <a id="extract"></a><br>Parses TS/JS, Python, Rust and PHP source with tree-sitter into language-independent [`extract.facts`](extract.md#extract.facts), along with function bodies ([`extract.bodies`](extract.md#extract.bodies)) and cleaned doc comments, before any layer or ID assignment. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
  - module [bodies](../../src/extract/bodies.ts#L1)
    <a id="extract.bodies"></a><br>Function bodies by declaration position, for trace instrumentation: the tracer rewrites TS/JS sources to record calls at run time, and needs to know where each function's body starts and ends. Sits beside the TS frontend (source → FileFacts) and parses with the same tree-sitter…
    - treesitter [extract.treesitter](extract.md#extract.treesitter)
    - ts [extract.ts](extract.md#extract.ts)
    - type [FunctionBody](../../src/extract/bodies.ts#L12)
      <a id="extract.bodies.FunctionBody"></a><br>Where one function's body lies in the source, and what kind of function it is.
    - fn [functionBodies](../../src/extract/bodies.ts#L27) (path: string, src: string) → Promise<Map<string, FunctionBody>>
      <a id="extract.bodies.functionBodies"></a><br>`line:col` of each declaring node → the body of its function.
      - calls [extract.ts.withTsTree](extract.md#extract.ts.withTsTree), [extract.bodies.bodiesOf](extract.md#extract.bodies.bodiesOf)
    - fn [parsesCleanly](../../src/extract/bodies.ts#L35) (path: string, src: string) → Promise<boolean>
      <a id="extract.bodies.parsesCleanly"></a><br>The source parses without a syntax error: an instrumented copy is checked before it replaces the original. `export type * from`, which the bundled grammar does not know, is no error here either.
      - calls [extract.ts.withTsTree](extract.md#extract.ts.withTsTree)
    - fn [bodiesOf](../../src/extract/bodies.ts#L40) (root: Node) → Map<string, FunctionBody> <!-- internal -->
      <a id="extract.bodies.bodiesOf"></a><br>Walk the tree and record the body of every function, keyed by the position of the node that declares it.
      - calls [extract.treesitter.startCol](extract.md#extract.treesitter.startCol), [extract.ts.unwrapValue](extract.md#extract.ts.unwrapValue), [extract.bodies.implementationOf](extract.md#extract.bodies.implementationOf)
    - fn [implementationOf](../../src/extract/bodies.ts#L128) (signature: Node) → Node | null <!-- internal -->
      <a id="extract.bodies.implementationOf"></a><br>The implementation an overload signature belongs to: the next function declaration (or method) of the same name, past the other signatures and comments between them. `export function f(…);` is a signature in an `export_statement`, so siblings are compared through that wrapper.
  - module [doc-comments](../../src/extract/doc-comments.ts#L1)
    <a id="extract.doc-comments"></a><br>Documentation comments without their syntax. Frontends decide which comment documents what; this module only turns comment source into text, lines kept, so the brief rule (`src/brief.ts`) can find the first paragraph.
    - fn [isLicense](../../src/extract/doc-comments.ts#L10) (text: string) → boolean
      <a id="extract.doc-comments.isLicense"></a><br>A license or copyright notice: a comment that starts with one (`SPDX-…`, `Copyright …`, `(c) 2024`, `© …`) or carries an SPDX identifier. A comment that only mentions copyright is documentation.
    - fn [blockCommentBody](../../src/extract/doc-comments.ts#L18) (text: string) → string
      <a id="extract.doc-comments.blockCommentBody"></a><br>`/** … *\/`, `/*! … *\/` or `/* … *\/` without delimiters and the ` * ` that starts each line.
    - fn [lineCommentsBody](../../src/extract/doc-comments.ts#L30) (lines: readonly string[], marker: RegExp) → string
      <a id="extract.doc-comments.lineCommentsBody"></a><br>Consecutive line comments (`//`, `///`, `//!`, `#`) as lines of text, one comment marker and one space removed from each.
    - fn [jsdocDescription](../../src/extract/doc-comments.ts#L38) (body: string) → string
      <a id="extract.doc-comments.jsdocDescription"></a><br>JSDoc text: the description before the first block tag (`@param`, `@returns`, …), with inline `x` as `x` and `label` / `label` as `label`.
    - fn [nonEmpty](../../src/extract/doc-comments.ts#L53) (text: string) → string | null
      <a id="extract.doc-comments.nonEmpty"></a><br>Text of the whole comment, or null when it has none: an empty comment, only tags, a directive.
  - module [facts](../../src/extract/facts.ts#L1)
    <a id="extract.facts"></a><br>Language-independent facts extracted from one source file. Everything the map and the index need; nothing about layers or IDs yet.
    - adapter [base.adapter](base.md#base.adapter)
    - type [FileFacts](../../src/extract/facts.ts#L16)
      <a id="extract.facts.FileFacts"></a><br>Everything keylang reads of one source file, before layers and IDs.
    - type [WebFacts](../../src/extract/facts.ts#L116)
      <a id="extract.facts.WebFacts"></a><br>See `FileFacts.web`.
    - type [WebCallFact](../../src/extract/facts.ts#L130)
      <a id="extract.facts.WebCallFact"></a><br>A registration call on a receiver written as a name (`app`, `router`, `fastify`).
    - type [LiteralValue](../../src/extract/facts.ts#L154)
      <a id="extract.facts.LiteralValue"></a><br>A value as the code writes it, for an adapter to read: literals, dotted names and calls with their arguments; anything else is `other` with its text. Containers keep their items in order.
    - type [Kwarg](../../src/extract/facts.ts#L166)
      <a id="extract.facts.Kwarg"></a><br>A keyword argument of a call: `prefix="/x"`.
    - type [DecoratorFact](../../src/extract/facts.ts#L172)
      <a id="extract.facts.DecoratorFact"></a><br>A decorator of a declaration: `@x.get("/a", tags=["t"])` → `x.get` with its arguments; `call` null for `@x`.
    - type [StatementFact](../../src/extract/facts.ts#L185)
      <a id="extract.facts.StatementFact"></a><br>A module-level statement: `target = value`, `target += value` (`augmented`), or a call standing alone (`target` null, `value` the call).
    - type [ParamCallFact](../../src/extract/facts.ts#L195)
      <a id="extract.facts.ParamCallFact"></a><br>A call in a parameter of a declaration: `symbol`'s parameter `param` is `Depends(get_db)`.
    - type [EntryFact](../../src/extract/facts.ts#L214)
      <a id="extract.facts.EntryFact"></a><br>A language-level entry point written in the code, before resolution. `route`: `app.get('/x', h)` with a literal path and a named handler — `label` is `GET /x`, `callee` is `h` as written. `main`: a Python `if __name__ == "__main__":` block — `callee` is the fn it calls, or null…
    - type [QualifiedSymbol](../../src/extract/facts.ts#L228)
      <a id="extract.facts.QualifiedSymbol"></a><br>A top-level declaration by its qualified name.
    - type [ImportFact](../../src/extract/facts.ts#L238)
      <a id="extract.facts.ImportFact"></a><br>One import, require or re-export statement, with the names it binds.
    - type [ImportBinding](../../src/extract/facts.ts#L280)
      <a id="extract.facts.ImportBinding"></a><br>How an import binds one local name.
    - type [DeclKind](../../src/extract/facts.ts#L295) = "fn" | "class" | "type"
      <a id="extract.facts.DeclKind"></a><br>The kinds of declaration the map shows.
    - type [DeclFact](../../src/extract/facts.ts#L298)
      <a id="extract.facts.DeclFact"></a><br>A declaration of the file (or a member of one), with what its body calls and mentions.
    - type [TypeFieldFact](../../src/extract/facts.ts#L388)
      <a id="extract.facts.TypeFieldFact"></a><br>One member of a type's shape: `note?: string` is `{ name: "note", optional: true, type: "string" }`; a method's type is `(x: T) => R`.
    - type [ResultTypeFact](../../src/extract/facts.ts#L400)
      <a id="extract.facts.ResultTypeFact"></a><br>PHP: the class a function returns, or of the elements of the array it returns, as its declaration writes it. A declared return type is a fact PHP checks; `@return` is a docblock (`docblock`, the tag's position) and is read only where the declared type names no class.
    - type [MethodSigFact](../../src/extract/facts.ts#L411)
      <a id="extract.facts.MethodSigFact"></a><br>PHP: one method of an interface (or of an `outside` class): its name and result type.
    - type [FieldFact](../../src/extract/facts.ts#L418)
      <a id="extract.facts.FieldFact"></a><br>PHP: a property and the qualified class of its value (`element`: an array of them).
    - type [OutsideDeclFact](../../src/extract/facts.ts#L429)
      <a id="extract.facts.OutsideDeclFact"></a><br>PHP: a class, interface or trait of a file `outside` the architecture, as declarations only. Names are qualified, without the leading `\`.
    - type [ValueOfFact](../../src/extract/facts.ts#L446)
      <a id="extract.facts.ValueOfFact"></a><br>PHP: a value whose class the graph reads from another declaration — the result of a call (its declared result type) or, with `element`, an element of the array it returns.
    - type [ResultCallFact](../../src/extract/facts.ts#L452)
      <a id="extract.facts.ResultCallFact"></a><br>The call whose result a `ValueOfFact` is, written as `CallFact` writes a call.
    - type [LiteralFact](../../src/extract/facts.ts#L473)
      <a id="extract.facts.LiteralFact"></a><br>A value PHP code writes as a literal, as far as a framework adapter reads it (ADR 0022): a string without interpolation, `X::class` (`self::class` is the enclosing class), a class constant `X::NAME`, `new X(…)`, an array of them, a closure literal at its position; anything else…
    - type [ArgFact](../../src/extract/facts.ts#L483)
      <a id="extract.facts.ArgFact"></a><br>One argument of a call or an attribute: named (`methods: ['POST']`) or positional.
    - type [AttributeFact](../../src/extract/facts.ts#L489)
      <a id="extract.facts.AttributeFact"></a><br>`#[Name(args)]` on a declaration; `name` qualified as PHP resolves it.
    - type [PropertyFact](../../src/extract/facts.ts#L497)
      <a id="extract.facts.PropertyFact"></a><br>A class property with a literal default value.
    - type [ParamFact](../../src/extract/facts.ts#L505)
      <a id="extract.facts.ParamFact"></a><br>A parameter of a function; `type` is the qualified class when the parameter is typed with one.
    - type [ChainLinkFact](../../src/extract/facts.ts#L511)
      <a id="extract.facts.ChainLinkFact"></a><br>One call of a chain `Route::prefix('admin')->name('a.')->group(…)`, root first; the root names its class when it is a static call.
    - type [CallFact](../../src/extract/facts.ts#L518)
      <a id="extract.facts.CallFact"></a><br>One call written in the code, with its callee as written and its range.
    - type [HookFact](../../src/extract/facts.ts#L607)
      <a id="extract.facts.HookFact"></a><br>A callable chosen at run time with a default written next to it. `param` and `path` say where a caller injects the value: `analyze({ generate })` is parameter 0, path `generate`; `function f(run = defaultRun)` is parameter 0, path "".
    - type [PassFact](../../src/extract/facts.ts#L626)
      <a id="extract.facts.PassFact"></a><br>A function value in the arguments of a call: argument index, property path ("" for the argument itself). `callee` names it as a call would (`this.m`, `Cls.m`, `save`); `text` is the argument as written (`[$this, 'm']`), at the position. One passed as the argument itself is a…
    - type [ValueRefFact](../../src/extract/facts.ts#L642)
      <a id="extract.facts.ValueRefFact"></a><br>A name read as a value rather than called (see `FileFacts.valueRefs`).
    - type [TypeRefFact](../../src/extract/facts.ts#L652)
      <a id="extract.facts.TypeRefFact"></a><br>A type name in type position. `text` is the source fragment.
    - type [ExportRow](../../src/extract/facts.ts#L666)
      <a id="extract.facts.ExportRow"></a><br>One public name of a file, compared with the `exports` rule and followed by the graph to the symbol it stands for.
    - type [UnsupportedFact](../../src/extract/facts.ts#L697)
      <a id="extract.facts.UnsupportedFact"></a><br>A construct the extractor does not turn into an edge: a hole, with its source fragment and why.
  - module [grammars](../../src/extract/grammars.ts#L1)
    <a id="extract.grammars"></a><br>The tree-sitter grammars keylang parses with. One list for the runtime (`treesitter.ts` loads them) and for packaging (`scripts/copy-wasm.mjs` copies each into dist/wasm), so a new language cannot be left out of the published package.
    - type [Grammar](../../src/extract/grammars.ts#L10) = (typeof GRAMMARS)[number]
      <a id="extract.grammars.Grammar"></a><br>The name of one shipped grammar.
    - fn [wasmFile](../../src/extract/grammars.ts#L13) (g: Grammar) → string
      <a id="extract.grammars.wasmFile"></a><br>The grammar's file name in @vscode/tree-sitter-wasm and in dist/wasm.
  - module [php](../../src/extract/php.ts#L1)
    <a id="extract.php"></a><br>PHP facts: namespaces, `use`, classes, interfaces, traits, enums, functions and methods, calls, type hints, `require`/`include` and PHPDoc. This is the source → FileFacts stage for `.php` files: `extractPhp` parses a file with tree-sitter and returns its FileFacts, which the…
    - languages [base.languages](base.md#base.languages)
    - facts [extract.facts](extract.md#extract.facts)
    - doc-comments [extract.doc-comments](extract.md#extract.doc-comments)
    - treesitter [extract.treesitter](extract.md#extract.treesitter)
    - fn [extractPhp](../../src/extract/php.ts#L57) (path: string, src: string) → Promise<FileFacts>
      <a id="extract.php.extractPhp"></a><br>The facts of one PHP file: parses `src` with the PHP grammar and reads the tree; `path` is repository-relative and anchors relative includes.
      - calls [extract.treesitter.withTree](extract.md#extract.treesitter.withTree), [extract.php.extractTree](extract.md#extract.php.extractTree)
    - fn [declarationsOnly](../../src/extract/php.ts#L67) (facts: FileFacts) → FileFacts
      <a id="extract.php.declarationsOnly"></a><br>A file `outside` the architecture as declarations only (ADR 0011, business-flows 40): an opaque module — no import, declaration, call or hole of its own — that carries its classes and interfaces with their bases, interfaces, traits, methods, result types and typed properties…
      - calls [extract.php.qualifiedBy](extract.md#extract.php.qualifiedBy), [extract.php.methodSig](extract.md#extract.php.methodSig)
    - fn [methodSig](../../src/extract/php.ts#L100) (member: DeclFact) → MethodSigFact <!-- internal -->
      <a id="extract.php.methodSig"></a><br>A method declaration reduced to what an `outside` declaration keeps: its name, whether it is static, and its result type.
    - fn [qualifiedBy](../../src/extract/php.ts#L111) (facts: FileFacts, written: string) → string <!-- internal -->
      <a id="extract.php.qualifiedBy"></a><br>A class name as the file binds it (`Collector.klass`), qualified through the file's imports: `Foo` with `use A\Foo` → `A\Foo`.
    - type [Names](../../src/extract/php.ts#L127) <!-- internal -->
      <a id="extract.php.Names"></a><br>What names mean in one namespace: its name and the aliases of its `use` statements (keys in ASCII lower case: PHP class and function names ignore ASCII case).
    - type [Alias](../../src/extract/php.ts#L135) <!-- internal -->
      <a id="extract.php.Alias"></a>
    - type [ClassContext](../../src/extract/php.ts#L142) <!-- internal -->
      <a id="extract.php.ClassContext"></a><br>A class while its members are read: what `self::`, `$this->field->` and `static` name.
    - type [FieldType](../../src/extract/php.ts#L156) <!-- internal -->
      <a id="extract.php.FieldType"></a><br>The class of a property, and the docblock it comes from when no checked syntax names it.
    - type [At](../../src/extract/php.ts#L167) <!-- internal -->
      <a id="extract.php.At"></a><br>A position in the file with its source fragment.
    - type [DocType](../../src/extract/php.ts#L176) <!-- internal -->
      <a id="extract.php.DocType"></a><br>A class name written in a docblock tag: `@var Foo`, `@param Foo $x`.
    - type [TypeSource](../../src/extract/php.ts#L182) <!-- internal -->
      <a id="extract.php.TypeSource"></a><br>Where the class of a property comes from: a constructor parameter (typed, or by its `@param`) or a `@var`.
    - module [Collector](../../src/extract/php.ts#L193) <!-- internal -->
      <a id="extract.php.Collector"></a><br>Per file: the imports, values read and holes the names of the code add.
      - fn [constructor](../../src/extract/php.ts#L194)
        <a id="extract.php.Collector.constructor"></a>
      - fn [klass](../../src/extract/php.ts#L201) (written: string, node: Node, names: Names) → string
        <a id="extract.php.Collector.klass"></a><br>A class the code names: the binding it goes through, registered as an optional import unless a `use` binds it.
        - calls [extract.php.Collector.klassAt](extract.md#extract.php.Collector.klassAt), [extract.treesitter.located](extract.md#extract.treesitter.located)
      - fn [klassAt](../../src/extract/php.ts#L206) (written: string, at: At, names: Names, docblock: boolean) → string
        <a id="extract.php.Collector.klassAt"></a><br>The same for a name at `at`; `docblock`: written only in a docblock, so the import is one of provenance `docblock` unless the code names it too.
        - calls [extract.php.canonicalClass](extract.md#extract.php.canonicalClass), [extract.php.Collector.implicit](extract.md#extract.php.Collector.implicit)
      - fn [fn](../../src/extract/php.ts#L215) (written: string, node: Node, names: Names) → string
        <a id="extract.php.Collector.fn"></a><br>A function the code calls by name, likewise.
        - calls [extract.php.canonicalFunction](extract.md#extract.php.canonicalFunction), [extract.php.Collector.implicit](extract.md#extract.php.Collector.implicit), [extract.treesitter.located](extract.md#extract.treesitter.located)
      - fn [implicit](../../src/extract/php.ts#L224) (local: string, spec: string, at: At, docblock: boolean) → void <!-- internal -->
        <a id="extract.php.Collector.implicit"></a><br>A name's first use is its import; a use in the code replaces one in a docblock, whichever came first.
        - calls [extract.php.firstLine](extract.md#extract.php.firstLine), [extract.php.lastSegment](extract.md#extract.php.lastSegment)
      - fn [value](../../src/extract/php.ts#L239) (name: string, node: Node, member: boolean) → void
        <a id="extract.php.Collector.value"></a><br>A name read as a value (`X::class`, `'m'` of `[$obj, 'm']`, `f(...)`), once per name; `member`: a method name, not a top-level one.
      - fn [hole](../../src/extract/php.ts#L249) (node: Node, reason: string, symbol: string | null) → void
        <a id="extract.php.Collector.hole"></a><br>Records a hole at `node` (once per position and reason); `symbol` is the declaration whose behaviour it leaves unknown, if any.
        - calls [extract.php.unsupported](extract.md#extract.php.unsupported)
    - fn [extractTree](../../src/extract/php.ts#L262) (path: string, root: Node) → FileFacts <!-- internal -->
      <a id="extract.php.extractTree"></a><br>The FileFacts of a parsed tree: declarations and symbols per namespace region, then imports, holes and values gathered across the file.
      - calls [extract.php.Collector](extract.md#extract.php.Collector), [extract.php.fileDoc](extract.md#extract.php.fileDoc), [extract.php.regionsOf](extract.md#extract.php.regionsOf), [extract.php.collectTopLevel](extract.md#extract.php.collectTopLevel), [extract.php.usesOf](extract.md#extract.php.usesOf), [extract.php.declarationOf](extract.md#extract.php.declarationOf), [extract.php.qualify](extract.md#extract.php.qualify), [extract.php.exportRow](extract.md#extract.php.exportRow), [extract.php.callsIn](extract.md#extract.php.callsIn), [extract.php.includesIn](extract.md#extract.php.includesIn), [extract.treesitter.valuesFingerprint](extract.md#extract.treesitter.valuesFingerprint), [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.treesitter.errorLine](extract.md#extract.treesitter.errorLine)
    - type [Region](../../src/extract/php.ts#L333) <!-- internal -->
      <a id="extract.php.Region"></a><br>A stretch of the file under one namespace (`""` for the global one) and its top-level statements.
    - fn [regionsOf](../../src/extract/php.ts#L343) (root: Node) → Region[] <!-- internal -->
      <a id="extract.php.regionsOf"></a><br>The file in namespace regions: `namespace A;` runs to the next namespace statement, `namespace A { … }` is its block, and code before the first namespace (or in `namespace { … }`) is global.
    - fn [collectTopLevel](../../src/extract/php.ts#L371) (node: Node, out: Node[]) → void <!-- internal -->
      <a id="extract.php.collectTopLevel"></a><br>Statements of a namespace, including those under a top-level `if` (`if (!function_exists('x')) { function x() {} }`) and in plain blocks.
    - fn [qualify](../../src/extract/php.ts#L383) (ns: string, name: string) → string <!-- internal -->
      <a id="extract.php.qualify"></a><br>`name` in namespace `ns`: `A\B\name`, or `name` itself in the global namespace.
    - fn [lastSegment](../../src/extract/php.ts#L388) (name: string) → string <!-- internal -->
      <a id="extract.php.lastSegment"></a><br>The last segment of a qualified name: `A\B\Foo` → `Foo`.
    - fn [firstLine](../../src/extract/php.ts#L393) (text: string) → string <!-- internal -->
      <a id="extract.php.firstLine"></a><br>The first line of a source fragment: what a fact quotes.
    - fn [useKind](../../src/extract/php.ts#L398) (node: Node) → "function" | "const" | null <!-- internal -->
      <a id="extract.php.useKind"></a><br>`function` or `const` of a `use` or one of its clauses; null for a class.
    - fn [usesOf](../../src/extract/php.ts#L409) (decl: Node, names: Names) → ImportFact[] <!-- internal -->
      <a id="extract.php.usesOf"></a><br>The imports of one `use` statement, one per clause (`use A\{B, C as D}` is two), and the aliases they add to `names`. A function is `function <name>`, a constant `const <name>`, a class its name.
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.php.useKind](extract.md#extract.php.useKind), [extract.php.lastSegment](extract.md#extract.php.lastSegment), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [extract.php.firstLine](extract.md#extract.php.firstLine)
    - type [CanonicalClass](../../src/extract/php.ts#L438) <!-- internal -->
      <a id="extract.php.CanonicalClass"></a>
    - fn [canonicalClass](../../src/extract/php.ts#L451) (written: string, names: Names) → CanonicalClass <!-- internal -->
      <a id="extract.php.canonicalClass"></a><br>A class name as the code writes it → the binding it goes through (`local`) and the qualified name PHP gives it. `explicit`: a `use` binds exactly this name. A name through an alias keeps the alias's spelling, so a call written in another case still finds the binding.
      - calls [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [extract.php.qualify](extract.md#extract.php.qualify)
    - type [CanonicalFunction](../../src/extract/php.ts#L469) <!-- internal -->
      <a id="extract.php.CanonicalFunction"></a>
    - fn [canonicalFunction](../../src/extract/php.ts#L480) (written: string, names: Names) → CanonicalFunction <!-- internal -->
      <a id="extract.php.canonicalFunction"></a><br>A called function name → its binding and the specifier PHP resolves: `function A\f`, or for an unqualified name in a namespace `function A\f ?? f` (the global function when the namespace has none).
      - calls [extract.php.canonicalClass](extract.md#extract.php.canonicalClass), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase)
    - fn [exportRow](../../src/extract/php.ts#L499) (facts: FileFacts, name: string, kind: ExportRow["kind"]) → void <!-- internal -->
      <a id="extract.php.exportRow"></a><br>Adds `name` to the file's exports once: every top-level PHP declaration is public.
    - fn [classNameOf](../../src/extract/php.ts#L506) (node: Node | null) → string | null <!-- internal -->
      <a id="extract.php.classNameOf"></a><br>A class name in a name or qualified-name node, as written.
    - fn [declarationOf](../../src/extract/php.ts#L511) (node: Node, names: Names, collector: Collector) → DeclFact | null <!-- internal -->
      <a id="extract.php.declarationOf"></a><br>A top-level class, interface, trait, enum or function.
      - calls [extract.php.fnDecl](extract.md#extract.php.fnDecl), [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.php.classNameOf](extract.md#extract.php.classNameOf), [extract.php.Collector.klass](extract.md#extract.php.Collector.klass), [extract.php.typeRef](extract.md#extract.php.typeRef), [extract.php.docOf](extract.md#extract.php.docOf), [extract.php.interfaceMethods](extract.md#extract.php.interfaceMethods), [extract.treesitter.fingerprintFacts](extract.md#extract.treesitter.fingerprintFacts), [extract.php.singleClass](extract.md#extract.php.singleClass), [extract.php.classQualified](extract.md#extract.php.classQualified), [extract.php.docTag](extract.md#extract.php.docTag), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [extract.php.docSource](extract.md#extract.php.docSource), [extract.php.namedTypes](extract.md#extract.php.namedTypes), [extract.php.constructorFields](extract.md#extract.php.constructorFields), [extract.php.classType](extract.md#extract.php.classType), [extract.php.qualify](extract.md#extract.php.qualify), [extract.php.literalOf](extract.md#extract.php.literalOf), [extract.php.informative](extract.md#extract.php.informative), [extract.php.attributesOf](extract.md#extract.php.attributesOf), [extract.treesitter.valuesFingerprint](extract.md#extract.treesitter.valuesFingerprint), [extract.php.fieldFact](extract.md#extract.php.fieldFact)
    - fn [fieldFact](../../src/extract/php.ts#L749) (name: string, field: FieldType) → FieldFact <!-- internal -->
      <a id="extract.php.fieldFact"></a><br>A typed property as `DeclFact.fields` stores it: the qualified class, with `element` and `docblock` when set.
    - fn [interfaceMethods](../../src/extract/php.ts#L760) (node: Node, names: Names, collector: Collector) → MethodSigFact[] <!-- internal -->
      <a id="extract.php.interfaceMethods"></a><br>The methods of an interface with their result types.
      - calls [extract.php.resultOf](extract.md#extract.php.resultOf)
    - fn [constructorFields](../../src/extract/php.ts#L790) (method: Node, className: string, names: Names, collector: Collector, fields: Map<string, FieldType>, untyped: ReadonlyMap<string, { node: Node; doc: DocType | null }>, filledBy: Map<string, string | null>) → Set<string> <!-- internal -->
      <a id="extract.php.constructorFields"></a><br>The classes the constructor gives the class's untyped properties. `$this->x = $x` with a parameter `X $x` is a fact of the syntax; with an untyped `$x` and `@param X $x`, or no assignment and `@var X` above the property, the class comes from a docblock PHP does not check. Only…
      - calls [extract.php.docTags](extract.md#extract.php.docTags), [extract.php.singleClass](extract.md#extract.php.singleClass), [extract.php.classKey](extract.md#extract.php.classKey), [extract.php.Collector.klass](extract.md#extract.php.Collector.klass), [extract.php.classQualified](extract.md#extract.php.classQualified), [extract.php.docSource](extract.md#extract.php.docSource), [extract.php.walkScope](extract.md#extract.php.walkScope), [extract.php.unparenthesized](extract.md#extract.php.unparenthesized), [extract.php.Collector.hole](extract.md#extract.php.Collector.hole)
    - fn [classKey](../../src/extract/php.ts#L883) (written: string, names: Names) → string <!-- internal -->
      <a id="extract.php.classKey"></a><br>The qualified name of a class as written, in ASCII lower case: how two spellings compare.
      - calls [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [extract.php.canonicalClass](extract.md#extract.php.canonicalClass)
    - fn [classQualified](../../src/extract/php.ts#L888) (written: string, names: Names) → string <!-- internal -->
      <a id="extract.php.classQualified"></a><br>The qualified name of a class as written (the enclosing class for `self`/`static` is not known here: the name as written).
      - calls [extract.php.canonicalClass](extract.md#extract.php.canonicalClass)
    - fn [docSource](../../src/extract/php.ts#L896) (doc: DocType, names: Names, collector: Collector, arrays = false) → TypeSource | null <!-- internal -->
      <a id="extract.php.docSource"></a><br>The class a docblock type names, registered as a docblock import; null when it names no single class. `arrays`: an array of one class (`Item[]`) counts too, with `element`.
      - calls [extract.php.docType](extract.md#extract.php.docType), [extract.php.singleDocClass](extract.md#extract.php.singleDocClass), [extract.php.classKey](extract.md#extract.php.classKey), [extract.php.Collector.klassAt](extract.md#extract.php.Collector.klassAt), [extract.php.classQualified](extract.md#extract.php.classQualified)
    - fn [singleDocClass](../../src/extract/php.ts#L917) (written: string) → string | null <!-- internal -->
      <a id="extract.php.singleDocClass"></a><br>The one class a docblock type names: `Foo`, `?Foo`, `Foo|null`, `\App\Foo`. Null for a union of classes, an array (`Foo[]`, `array<Foo>`), a built-in type or anything else PHPDoc writes.
      - calls [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase)
    - fn [docType](../../src/extract/php.ts#L943) (written: string) → { cls: string; element?: true } | { self: "self" | "static" } | null <!-- internal -->
      <a id="extract.php.docType"></a><br>What a docblock type says of a value: one class (`Foo`, `?Foo`, `Foo|null`), an array of one class (`Foo[]`, `array<Foo>`, `array<int, Foo>`, `iterable<Foo>`, `list<Foo>`), or the class itself (`$this`, `static`, `self`). Null for a union of classes, a built-in type, generics…
      - calls [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase)
    - fn [resultOf](../../src/extract/php.ts#L972) (node: Node, names: Names, collector: Collector) → ResultTypeFact | undefined <!-- internal -->
      <a id="extract.php.resultOf"></a><br>The result type of a function or method: the declared return type when it names one class (`: Order`, `: ?Order`, `: Order|null`, `: static`, `: self`), else its `@return` when the declared type leaves room for it (none, `mixed`, `object`, or `array`/`iterable` for an array of…
      - calls [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [extract.php.canonicalClass](extract.md#extract.php.canonicalClass), [extract.php.docTag](extract.md#extract.php.docTag), [extract.php.docType](extract.md#extract.php.docType)
    - fn [singleClass](../../src/extract/php.ts#L1023) (type: Node | null) → string | null <!-- internal -->
      <a id="extract.php.singleClass"></a><br>The one class a type names: `Store`, `?Store`; null for a union, an intersection, a built-in type or none.
      - calls [extract.php.classNameOf](extract.md#extract.php.classNameOf), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase)
    - fn [namedTypes](../../src/extract/php.ts#L1034) (type: Node | null) → { text: string; node: Node }[] <!-- internal -->
      <a id="extract.php.namedTypes"></a><br>Every class a type names, in unions, intersections and nullable types.
      - calls [extract.php.classNameOf](extract.md#extract.php.classNameOf), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase)
    - fn [typeRef](../../src/extract/php.ts#L1056) (name: string, node: Node) → TypeRefFact <!-- internal -->
      <a id="extract.php.typeRef"></a><br>A reference to the class `name` (its binding in the file) at `node`: a type dependency of the declaration.
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.php.firstLine](extract.md#extract.php.firstLine)
    - type [VarType](../../src/extract/php.ts#L1067) <!-- internal -->
      <a id="extract.php.VarType"></a><br>What the code says of a variable's value: a class (`cls` its binding in the file, as `Collector.klass` gives it; `element`: an array of that class's values), or the result of a call whose declared result type the graph reads (`of`).
    - type [Binding](../../src/extract/php.ts#L1070) <!-- internal -->
      <a id="extract.php.Binding"></a><br>One way a function binds a variable: a type known as written, an assigned expression, or the element of what `foreach` iterates.
    - fn [sameType](../../src/extract/php.ts#L1073) (a: VarType, b: VarType) → boolean <!-- internal -->
      <a id="extract.php.sameType"></a><br>Two bindings agree: the same class (by qualified name) both ways, or both arrays of it; a call's result agrees with nothing else.
      - calls [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase)
    - fn [classType](../../src/extract/php.ts#L1080) (cls: string, qualified: string, element: boolean, docblock: FieldType["docblock"]) → FieldType <!-- internal -->
      <a id="extract.php.classType"></a><br>The type of a value of a class, its keys in the order every class type keeps: `element`, then `docblock`.
    - fn [elementType](../../src/extract/php.ts#L1091) (type: VarType | null) → VarType | null <!-- internal -->
      <a id="extract.php.elementType"></a><br>What `foreach` over a value gives: an element of an array of a class, or of the array a call returns.
      - calls [extract.php.classType](extract.md#extract.php.classType)
    - fn [valueType](../../src/extract/php.ts#L1104) (expr: Node, scope: Scope, collector: Collector) → VarType | null <!-- internal -->
      <a id="extract.php.valueType"></a><br>The class of an expression's value as the syntax tells it: `new X(…)`, a variable, `$this->x` of a property the class types, `clone`, or a call (`of`: its declared result type, read by the graph). Null for anything else.
      - calls [extract.php.unparenthesized](extract.md#extract.php.unparenthesized), [extract.php.classNameOf](extract.md#extract.php.classNameOf), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [extract.php.qualify](extract.md#extract.php.qualify), [extract.php.Collector.klass](extract.md#extract.php.Collector.klass), [extract.php.classQualified](extract.md#extract.php.classQualified), [extract.php.classType](extract.md#extract.php.classType), [extract.php.firstClassCallable](extract.md#extract.php.firstClassCallable), [extract.php.resultCall](extract.md#extract.php.resultCall)
    - fn [resultCall](../../src/extract/php.ts#L1149) (n: Node, scope: Scope, collector: Collector) → ResultCallFact | null <!-- internal -->
      <a id="extract.php.resultCall"></a><br>A call as the receiver of another: its callee as `calleeOf` reads it, and the member it calls; null when the graph could not look it up.
      - calls [extract.php.calleeOf](extract.md#extract.php.calleeOf), [extract.php.argsOf](extract.md#extract.php.argsOf), [extract.php.qualify](extract.md#extract.php.qualify), [extract.php.informative](extract.md#extract.php.informative)
    - fn [inlineVars](../../src/extract/php.ts#L1180) (comment: Node, names: Names, collector: Collector) → { variable: string; type: VarType }[] <!-- internal -->
      <a id="extract.php.inlineVars"></a><br>The `@var` tags of a comment in a function body: `@var Foo $x`, `@var $x Foo`, or a bare `@var Foo` right above `$x = …`. A class or an array of one.
      - calls [extract.php.docSource](extract.md#extract.php.docSource), [extract.php.classType](extract.md#extract.php.classType)
    - type [Scope](../../src/extract/php.ts#L1212) <!-- internal -->
      <a id="extract.php.Scope"></a><br>What a call in a function sees: the namespace's names, the class, the function's variables and their classes.
    - fn [fnDecl](../../src/extract/php.ts#L1224) (node: Node, name: string, names: Names, ctx: ClassContext | null, collector: Collector, symbol: string) → DeclFact <!-- internal -->
      <a id="extract.php.fnDecl"></a><br>A function or a method. `symbol` is its dotted path in the file.
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.php.qualify](extract.md#extract.php.qualify), [extract.php.docTags](extract.md#extract.php.docTags), [extract.php.singleClass](extract.md#extract.php.singleClass), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [extract.php.canonicalClass](extract.md#extract.php.canonicalClass), [extract.php.docSource](extract.md#extract.php.docSource), [extract.php.Collector.klass](extract.md#extract.php.Collector.klass), [extract.php.classQualified](extract.md#extract.php.classQualified), [extract.php.classType](extract.md#extract.php.classType), [extract.php.namedTypes](extract.md#extract.php.namedTypes), [extract.php.typeRef](extract.md#extract.php.typeRef), [extract.php.walkScope](extract.md#extract.php.walkScope), [extract.php.inlineVars](extract.md#extract.php.inlineVars), [extract.php.sameType](extract.md#extract.php.sameType), [extract.php.classNameOf](extract.md#extract.php.classNameOf), [extract.php.valueType](extract.md#extract.php.valueType), [extract.php.elementType](extract.md#extract.php.elementType), [extract.php.callsIn](extract.md#extract.php.callsIn), [extract.php.docOf](extract.md#extract.php.docOf), [extract.php.literalOf](extract.md#extract.php.literalOf), [extract.php.attributesOf](extract.md#extract.php.attributesOf), [extract.php.resultOf](extract.md#extract.php.resultOf), [extract.treesitter.fingerprintFacts](extract.md#extract.treesitter.fingerprintFacts), [extract.php.informative](extract.md#extract.php.informative)
    - fn [walkScope](../../src/extract/php.ts#L1427) (node: Node, visit: (n: Node) => void) → void <!-- internal -->
      <a id="extract.php.walkScope"></a><br>Every node of a function body that runs in its own scope: not into a nested named function or class.
    - fn [callsIn](../../src/extract/php.ts#L1441) (node: Node, scope: Scope, collector: Collector, closure: boolean) → CallFact[] <!-- internal -->
      <a id="extract.php.callsIn"></a><br>The calls under `node`: in a function body, or in code outside declarations. A call inside a closure, an arrow function or an anonymous class has `closure`: it runs when that value is called.
      - calls [extract.php.qualify](extract.md#extract.php.qualify), [extract.php.callOf](extract.md#extract.php.callOf), [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.php.passesOf](extract.md#extract.php.passesOf), [extract.php.nameArgOf](extract.md#extract.php.nameArgOf), [extract.php.argsOf](extract.md#extract.php.argsOf), [extract.php.chainOf](extract.md#extract.php.chainOf), [extract.php.informative](extract.md#extract.php.informative), [extract.php.classNameOf](extract.md#extract.php.classNameOf), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [extract.php.Collector.value](extract.md#extract.php.Collector.value), [extract.php.Collector.klass](extract.md#extract.php.Collector.klass), [extract.php.arrayCallable](extract.md#extract.php.arrayCallable), [extract.php.closureState](extract.md#extract.php.closureState), [extract.treesitter.startCol](extract.md#extract.treesitter.startCol), [extract.php.narrowing](extract.md#extract.php.narrowing)
    - fn [narrowing](../../src/extract/php.ts#L1518) (n: Node, scope: Scope, collector: Collector) → Scope | null <!-- internal -->
      <a id="extract.php.narrowing"></a><br>The scope of the branch of `if (… $x instanceof Foo …)` (a conjunction may hold several): those variables are of those classes. Null when the condition narrows none.
      - calls [extract.php.unparenthesized](extract.md#extract.php.unparenthesized), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [extract.php.classNameOf](extract.md#extract.php.classNameOf), [extract.php.Collector.klass](extract.md#extract.php.Collector.klass), [extract.php.classQualified](extract.md#extract.php.classQualified)
    - fn [informative](../../src/extract/php.ts#L1561) (value: LiteralFact) → boolean <!-- internal -->
      <a id="extract.php.informative"></a><br>A literal that says something: anything but `other`, and an array only when some key or value does.
    - fn [literalClass](../../src/extract/php.ts#L1568) (scopeNode: Node | null, names: Names, self: string | null) → string | null <!-- internal -->
      <a id="extract.php.literalClass"></a><br>The qualified class a literal names: `self`/`static` the enclosing class; null for `parent` or anything but a name.
      - calls [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [extract.php.classNameOf](extract.md#extract.php.classNameOf), [extract.php.canonicalClass](extract.md#extract.php.canonicalClass)
    - fn [literalOf](../../src/extract/php.ts#L1579) (node: Node, names: Names, self: string | null, depth = 0) → LiteralFact <!-- internal -->
      <a id="extract.php.literalOf"></a><br>An expression as a literal a framework adapter reads (`LiteralFact`).
      - calls [extract.php.unparenthesized](extract.md#extract.php.unparenthesized), [extract.php.stringValue](extract.md#extract.php.stringValue), [extract.php.literalClass](extract.md#extract.php.literalClass), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [extract.treesitter.startCol](extract.md#extract.treesitter.startCol)
    - fn [argList](../../src/extract/php.ts#L1626) (args: Node | null | undefined, names: Names, self: string | null) → ArgFact[] <!-- internal -->
      <a id="extract.php.argList"></a><br>The arguments of an `arguments` node as literals, named or positional.
      - calls [extract.php.literalOf](extract.md#extract.php.literalOf)
    - fn [argsOf](../../src/extract/php.ts#L1642) (call: Node, names: Names, self: string | null) → ArgFact[] <!-- internal -->
      <a id="extract.php.argsOf"></a><br>The arguments of a call node as literals (`argList`); the grammar names the `arguments` field on some call nodes only.
      - calls [extract.php.argList](extract.md#extract.php.argList)
    - fn [chainOf](../../src/extract/php.ts#L1647) (n: Node, names: Names, self: string | null) → ChainLinkFact[] | null <!-- internal -->
      <a id="extract.php.chainOf"></a><br>`X::a(…)->b(…)->c(…)`: the calls of the chain, root first; null for a call on no other call.
      - calls [extract.php.argsOf](extract.md#extract.php.argsOf), [extract.php.unparenthesized](extract.md#extract.php.unparenthesized), [extract.php.literalClass](extract.md#extract.php.literalClass)
    - fn [attributesOf](../../src/extract/php.ts#L1681) (decl: Node, names: Names, self: string | null) → AttributeFact[] <!-- internal -->
      <a id="extract.php.attributesOf"></a><br>`#[A(…), B] #[C]` on a declaration, names qualified as PHP resolves them.
      - calls [extract.php.classNameOf](extract.md#extract.php.classNameOf), [extract.php.canonicalClass](extract.md#extract.php.canonicalClass), [extract.php.argList](extract.md#extract.php.argList), [extract.treesitter.startCol](extract.md#extract.treesitter.startCol)
    - type [ClosureState](../../src/extract/php.ts#L1711) = null | "stored" | { line: number; col: number } <!-- internal -->
      <a id="extract.php.ClosureState"></a><br>Where a call sits with respect to closures: null outside them; `stored` under a closure some value holds (`$f = fn() => …`, a returned closure, an anonymous class); otherwise the position of the outermost closure, every closure between being an argument of a call…
    - type [UnplacedCall](../../src/extract/php.ts#L1714) = Omit<CallFact, "line" | "col" | "endLine" | "endCol"> <!-- internal -->
      <a id="extract.php.UnplacedCall"></a><br>A call fact before its position is known.
    - fn [closureState](../../src/extract/php.ts#L1717) (closure: Node, inner: ClosureState) → ClosureState <!-- internal -->
      <a id="extract.php.closureState"></a><br>The closure state under `closure`, given the state `inner` around it (see `ClosureState`).
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located)
    - fn [passesOf](../../src/extract/php.ts#L1741) (call: Node, scope: Scope, collector: Collector) → PassFact[] <!-- internal -->
      <a id="extract.php.passesOf"></a><br>Callable references among the arguments of a call: `[$this, 'm']`, `[self::class, 'm']`, `[$obj, 'm']` with the class of `$obj` known, `[Order::class, 'm']`, `'Order::m'`, `\Closure::fromCallable(<any of these>)`, the first-class callable `$this->m(...)` / `Order::m(...)` /…
      - calls [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [extract.php.lastSegment](extract.md#extract.php.lastSegment), [extract.php.callableOf](extract.md#extract.php.callableOf), [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.php.firstLine](extract.md#extract.php.firstLine)
    - type [CallableRef](../../src/extract/php.ts#L1773) extends Pick<CallFact, "callee" | "bound" | "receiver" | "docblock"> <!-- internal -->
      <a id="extract.php.CallableRef"></a><br>A callable an expression names, with the node that spells it.
    - fn [callableOf](../../src/extract/php.ts#L1778) (value: Node, scope: Scope, collector: Collector, plainStrings: boolean) → CallableRef | null <!-- internal -->
      <a id="extract.php.callableOf"></a><br>The callable an expression names, with the node that spells it; null when it names none keylang can follow.
      - calls [extract.php.unparenthesized](extract.md#extract.php.unparenthesized), [extract.php.stringValue](extract.md#extract.php.stringValue), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [extract.php.classHolder](extract.md#extract.php.classHolder), [extract.php.Collector.klass](extract.md#extract.php.Collector.klass), [extract.php.qualifiedString](extract.md#extract.php.qualifiedString), [extract.php.Collector.fn](extract.md#extract.php.Collector.fn), [extract.php.firstClassCallable](extract.md#extract.php.firstClassCallable), [extract.php.calleeOf](extract.md#extract.php.calleeOf)
    - fn [qualifiedString](../../src/extract/php.ts#L1886) (name: string) → string <!-- internal -->
      <a id="extract.php.qualifiedString"></a><br>A name in a string (`'Shop\Infra\Logger'`, `'helper'`) is fully qualified: PHP reads no `use` or namespace into it.
    - fn [classHolder](../../src/extract/php.ts#L1891) (scopeNode: Node, member: string, scope: Scope, collector: Collector) → string | null <!-- internal -->
      <a id="extract.php.classHolder"></a><br>What `X::class` in `[X::class, 'm']` holds: `this` for `self`/`static` (the class for a static `m`), the class for a name; null for `parent`.
      - calls [extract.php.classNameOf](extract.md#extract.php.classNameOf), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [extract.php.Collector.klass](extract.md#extract.php.Collector.klass)
    - fn [arrayCallable](../../src/extract/php.ts#L1907) (n: Node, scope: Scope, collector: Collector) → void <!-- internal -->
      <a id="extract.php.arrayCallable"></a><br>`[$this, 'save']`, `[$this->repo, 'save']`, `[Order::class, 'place']`, `['Order', 'place']`: a method read as a callable value.
      - calls [extract.php.stringValue](extract.md#extract.php.stringValue), [extract.php.Collector.value](extract.md#extract.php.Collector.value)
    - fn [nameArgOf](../../src/extract/php.ts#L1932) (n: Node, callee: string) → CallFact["nameArg"] | undefined <!-- internal -->
      <a id="extract.php.nameArgOf"></a><br>The first argument of a method call `NAME_ARG_MEMBERS` lists: its literal value, or null with its text.
      - calls [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [extract.php.unparenthesized](extract.md#extract.php.unparenthesized), [extract.php.stringValue](extract.md#extract.php.stringValue)
    - fn [stringValue](../../src/extract/php.ts#L1948) (node: Node) → string | null <!-- internal -->
      <a id="extract.php.stringValue"></a><br>The text of a string literal without interpolation; null for anything else.
    - fn [firstClassCallable](../../src/extract/php.ts#L1959) (n: Node) → boolean <!-- internal -->
      <a id="extract.php.firstClassCallable"></a><br>The callable `f(...)`, `$x->m(...)`, `X::m(...)` makes from its callee: a value, not a call.
    - fn [callOf](../../src/extract/php.ts#L1976) (n: Node, scope: Scope, collector: Collector) → Pick<CallFact, "callee" | "bound" | "receiver" | "opaque" | "docblock" | "param" | "on" | "member"> | null <!-- internal -->
      <a id="extract.php.callOf"></a><br>One call: `f()` → `f`, `A\f()` → `A\f`; `$this->m()` → `this.m`; `$this->store->m()` → `this.store.m` with the property's class; `$x->m()` → `x.m`, bound, with the variable's class when the syntax names it; `X::m()` → `X.m`; `self::m()` / `static::m()` → `this.m`, or `X.m` for…
      - calls [extract.php.firstClassCallable](extract.md#extract.php.firstClassCallable), [extract.php.callableValue](extract.md#extract.php.callableValue), [extract.php.calleeOf](extract.md#extract.php.calleeOf)
    - fn [calleeOf](../../src/extract/php.ts#L1988) (n: Node, scope: Scope, collector: Collector) → Pick<CallFact, "callee" | "bound" | "receiver" | "opaque" | "docblock" | "param" | "on" | "member"> | null <!-- internal -->
      <a id="extract.php.calleeOf"></a><br>The callee of a call node as `callOf` reads it, whether or not the arguments are `(...)`.
      - calls [extract.php.classNameOf](extract.md#extract.php.classNameOf), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [extract.php.Collector.klass](extract.md#extract.php.Collector.klass), [extract.php.variableCall](extract.md#extract.php.variableCall), [extract.php.lastSegment](extract.md#extract.php.lastSegment), [extract.php.Collector.hole](extract.md#extract.php.Collector.hole), [extract.php.Collector.fn](extract.md#extract.php.Collector.fn), [extract.php.unparenthesized](extract.md#extract.php.unparenthesized), [extract.php.firstClassCallable](extract.md#extract.php.firstClassCallable), [extract.php.resultCall](extract.md#extract.php.resultCall)
    - fn [unparenthesized](../../src/extract/php.ts#L2134) (node: Node) → Node <!-- internal -->
      <a id="extract.php.unparenthesized"></a><br>The expression inside any parentheses around it: `((new X()))` → `new X()`.
    - fn [variableCall](../../src/extract/php.ts#L2143) (callee: string, scope: Scope) → Pick<CallFact, "callee" | "bound"> <!-- internal -->
      <a id="extract.php.variableCall"></a><br>A call through a variable: `$f()`, `$x->m()`, `$class::m()`.
    - fn [callableValue](../../src/extract/php.ts#L2151) (n: Node, scope: Scope, collector: Collector) → void <!-- internal -->
      <a id="extract.php.callableValue"></a><br>`f(...)`, `$this->m(...)`, `X::m(...)`: the function or method read as a value.
      - calls [extract.php.Collector.value](extract.md#extract.php.Collector.value), [extract.php.Collector.fn](extract.md#extract.php.Collector.fn)
    - fn [includesIn](../../src/extract/php.ts#L2171) (root: Node, path: string, collector: Collector) → ImportFact[] <!-- internal -->
      <a id="extract.php.includesIn"></a><br>`require`/`include` of a path the code spells out: a string, or `__DIR__` (`dirname(__DIR__)`, `dirname(__FILE__)`) joined with one. The specifier is `include <path>`, relative to the repository root; a path computed at run time is a hole.
      - calls [extract.php.includedPath](extract.md#extract.php.includedPath), [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.php.Collector.hole](extract.md#extract.php.Collector.hole), [extract.php.firstLine](extract.md#extract.php.firstLine)
    - fn [includedPath](../../src/extract/php.ts#L2198) (expr: Node | null, file: string) → string | null <!-- internal -->
      <a id="extract.php.includedPath"></a><br>The repository-relative path an include expression names: string literals, `__DIR__`, `dirname(__DIR__[, n])` and `dirname(__FILE__[, n])` joined with `.`; a relative literal is taken from the file's directory. Null when part of it is computed at run time.
      - calls [extract.php.stringValue](extract.md#extract.php.stringValue), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [extract.php.normalize](extract.md#extract.php.normalize)
    - fn [normalize](../../src/extract/php.ts#L2251) (path: string) → string <!-- internal -->
      <a id="extract.php.normalize"></a><br>`a/./b/../c` → `a/c`; a path above the root keeps its leading `..`.
    - fn [docOf](../../src/extract/php.ts#L2270) (node: Node, header: number | null) → string | undefined <!-- internal -->
      <a id="extract.php.docOf"></a><br>The PHPDoc of a declaration: the `/** … *\/` right above it. Line comments may stand between them, other code may not.
      - calls [extract.php.docComment](extract.md#extract.php.docComment), [extract.doc-comments.jsdocDescription](extract.md#extract.doc-comments.jsdocDescription), [extract.doc-comments.blockCommentBody](extract.md#extract.doc-comments.blockCommentBody), [extract.doc-comments.isLicense](extract.md#extract.doc-comments.isLicense), [extract.doc-comments.nonEmpty](extract.md#extract.doc-comments.nonEmpty)
    - fn [docComment](../../src/extract/php.ts#L2280) (node: Node, header: number | null) → Node | null <!-- internal -->
      <a id="extract.php.docComment"></a><br>The PHPDoc comment node right above a declaration, as `docOf` finds it; null without one.
    - fn [docTags](../../src/extract/php.ts#L2295) (node: Node, header: number | null, tag: RegExp) → (DocType & { name?: string })[] <!-- internal -->
      <a id="extract.php.docTags"></a><br>The tags of a declaration's PHPDoc that `tag` matches, one per line, with the type (first group) and the variable name (second group, if any) and the position of the `@`. The fragment is the tag's line.
      - calls [extract.php.docComment](extract.md#extract.php.docComment)
    - fn [docTag](../../src/extract/php.ts#L2317) (node: Node, header: number | null, tag: RegExp) → DocType | null <!-- internal -->
      <a id="extract.php.docTag"></a><br>The first tag of a declaration's PHPDoc that `tag` matches; null without one.
      - calls [extract.php.docTags](extract.md#extract.php.docTags)
    - fn [fileDoc](../../src/extract/php.ts#L2326) (root: Node) → { doc: string; id: number } | null <!-- internal -->
      <a id="extract.php.fileDoc"></a><br>The file's PHPDoc and its comment: the first `/** … *\/` after `<?php` (and `declare`), unless it stands right above a declaration, which it documents instead. A license documents nothing.
      - calls [extract.doc-comments.jsdocDescription](extract.md#extract.doc-comments.jsdocDescription), [extract.doc-comments.blockCommentBody](extract.md#extract.doc-comments.blockCommentBody), [extract.doc-comments.isLicense](extract.md#extract.doc-comments.isLicense), [extract.doc-comments.nonEmpty](extract.md#extract.doc-comments.nonEmpty)
    - fn [unsupported](../../src/extract/php.ts#L2342) (node: Node, reason: string) → UnsupportedFact <!-- internal -->
      <a id="extract.php.unsupported"></a><br>A hole at `node`: its span, its first line of source, and why keylang cannot follow it.
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.php.firstLine](extract.md#extract.php.firstLine)
  - module [python](../../src/extract/python.ts#L1)
    <a id="extract.python"></a><br>Python facts: `def`/`class`, imports, `__all__`, calls. Each imported name is one import whose specifier is the dotted path (`..pkg.mod.f`); the resolver decides how much of it is a module.
    - facts [extract.facts](extract.md#extract.facts)
    - doc-comments [extract.doc-comments](extract.md#extract.doc-comments)
    - treesitter [extract.treesitter](extract.md#extract.treesitter)
    - fn [extractPython](../../src/extract/python.ts#L31) (path: string, src: string) → Promise<FileFacts>
      <a id="extract.python.extractPython"></a><br>The facts of one Python file: imports, defs and classes with their calls, exports, entries and holes.
      - calls [extract.treesitter.withTree](extract.md#extract.treesitter.withTree), [extract.python.extractTree](extract.md#extract.python.extractTree)
    - fn [extractTree](../../src/extract/python.ts#L36) (path: string, root: Node) → FileFacts <!-- internal -->
      <a id="extract.python.extractTree"></a><br>Collect the facts of a parsed file in passes: top level, imports, declarations, exports, module code, then file-level data.
      - calls [extract.python.collectTopLevel](extract.md#extract.python.collectTopLevel), [extract.python.dunderAll](extract.md#extract.python.dunderAll), [extract.python.importsIn](extract.md#extract.python.importsIn), [extract.python.fnDecl](extract.md#extract.python.fnDecl), [extract.python.noteDecorators](extract.md#extract.python.noteDecorators), [extract.python.noteParamCalls](extract.md#extract.python.noteParamCalls), [extract.python.classDecl](extract.md#extract.python.classDecl), [extract.python.exportRow](extract.md#extract.python.exportRow), [extract.python.importsOf](extract.md#extract.python.importsOf), [extract.python.bindsUnlisted](extract.md#extract.python.bindsUnlisted), [extract.python.moduleCalls](extract.md#extract.python.moduleCalls), [extract.python.statementsOf](extract.md#extract.python.statementsOf), [extract.python.collectMainEntries](extract.md#extract.python.collectMainEntries), [extract.python.valueRefs](extract.md#extract.python.valueRefs), [extract.python.collectDynamic](extract.md#extract.python.collectDynamic), [extract.python.docstring](extract.md#extract.python.docstring), [extract.treesitter.valuesFingerprint](extract.md#extract.treesitter.valuesFingerprint), [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.treesitter.errorLine](extract.md#extract.treesitter.errorLine)
    - fn [collectTopLevel](../../src/extract/python.ts#L134) (node: Node, out: Node[]) → void <!-- internal -->
      <a id="extract.python.collectTopLevel"></a><br>Top-level statements, including those under `if`/`try` at module level (`if TYPE_CHECKING:`, `try: import x`).
    - fn [dunderAll](../../src/extract/python.ts#L149) (topLevel: Node[]) → Set<string> | null <!-- internal -->
      <a id="extract.python.dunderAll"></a><br>The names of `__all__`: a literal list or tuple, extended by `+=`, `+`, `.extend([...])` and `.append("x")`; null without an `__all__`.
    - fn [bindsUnlisted](../../src/extract/python.ts#L198) (node: Node) → string | null <!-- internal -->
      <a id="extract.python.bindsUnlisted"></a><br>What a module-level statement that binds names the export table does not list is, for the reason (`for`, `with`, `while`, `match`, `except … as`, tuple unpacking); null for one whose bindings the table has.
    - fn [exportRow](../../src/extract/python.ts#L209) (facts: FileFacts, name: string, kind: ExportRow["kind"]) → void <!-- internal -->
      <a id="extract.python.exportRow"></a><br>Record a public name of the module; the first row of a name wins.
    - fn [decorators](../../src/extract/python.ts#L216) (node: Node) → { name: string; node: Node }[] <!-- internal -->
      <a id="extract.python.decorators"></a><br>The decorators of a decorated definition, each named by its expression (the callee of `@d(…)`).
    - fn [isAccessor](../../src/extract/python.ts#L225) (name: string) → boolean <!-- internal -->
      <a id="extract.python.isAccessor"></a><br>`@property`, `@x.setter`: the method runs on attribute access.
    - fn [noteDecorators](../../src/extract/python.ts#L235) (node: Node, symbol: string, member: boolean, facts: FileFacts) → void <!-- internal -->
      <a id="extract.python.noteDecorators"></a><br>A decorator keylang does not know may return another function: calls of the name may not reach the body (a hole of that declaration), and the decorator holds the function as a value, so code keylang cannot follow may call it (a framework calling a registered handler).
      - calls [extract.python.decorators](extract.md#extract.python.decorators), [extract.python.isAccessor](extract.md#extract.python.isAccessor), [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.python.argumentsOf](extract.md#extract.python.argumentsOf), [extract.python.unsupported](extract.md#extract.python.unsupported)
    - fn [classDecl](../../src/extract/python.ts#L249) (def: Node, name: string, symbol: string, topLevel: boolean, facts: FileFacts) → DeclFact <!-- internal -->
      <a id="extract.python.classDecl"></a><br>A class and its members: methods, and nested classes with theirs. `symbol` is its dotted path in the file.
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.python.decorators](extract.md#extract.python.decorators), [extract.python.noteDecorators](extract.md#extract.python.noteDecorators), [extract.python.fnDecl](extract.md#extract.python.fnDecl), [extract.python.noteParamCalls](extract.md#extract.python.noteParamCalls), [extract.python.isAccessor](extract.md#extract.python.isAccessor), [extract.python.docstring](extract.md#extract.python.docstring), [extract.treesitter.valuesFingerprint](extract.md#extract.treesitter.valuesFingerprint), [extract.treesitter.fingerprintFacts](extract.md#extract.treesitter.fingerprintFacts)
    - type [Owner](../../src/extract/python.ts#L310) <!-- internal -->
      <a id="extract.python.Owner"></a><br>The class a method belongs to: its name, its static and class methods (for a top-level class), and whether the first parameter is the receiver.
    - fn [fnDecl](../../src/extract/python.ts#L317) (node: Node, name: string, owner: Owner | null) → DeclFact <!-- internal -->
      <a id="extract.python.fnDecl"></a><br>The declaration of a def: signature, calls (with receiver and owner for a method) and docstring.
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.python.bodyCalls](extract.md#extract.python.bodyCalls), [extract.python.boundNames](extract.md#extract.python.boundNames), [extract.python.typedValues](extract.md#extract.python.typedValues), [extract.python.docstring](extract.md#extract.python.docstring), [extract.treesitter.fingerprintFacts](extract.md#extract.treesitter.fingerprintFacts)
    - fn [docstring](../../src/extract/python.ts#L343) (body: Node | null) → string | undefined <!-- internal -->
      <a id="extract.python.docstring"></a><br>The docstring of a module, class or function body: its first statement when that is a lone string literal. An f-string, a bytes literal or concatenated strings are code, not documentation, and give none.
      - calls [extract.python.cleandoc](extract.md#extract.python.cleandoc), [extract.doc-comments.isLicense](extract.md#extract.doc-comments.isLicense), [extract.doc-comments.nonEmpty](extract.md#extract.doc-comments.nonEmpty)
    - fn [cleandoc](../../src/extract/python.ts#L358) (text: string) → string <!-- internal -->
      <a id="extract.python.cleandoc"></a><br>`inspect.cleandoc`: the first line stripped, the rest dedented by their common indentation.
    - fn [walkBindings](../../src/extract/python.ts#L377) (fn: Node, visit: (target: Node, kind: "parameter" | "local" | "declared", by: Node) => void) → void <!-- internal -->
      <a id="extract.python.walkBindings"></a><br>Every binding a function makes, nested scopes included — one scope for the whole function, as `boundNames` and `typedValues` read it: its parameters, assignments, loop and comprehension variables, `with … as x`, `except … as x`, `:=`, `case` captures (`case (x,)`, `case {"k"…
      - calls [extract.python.captures](extract.md#extract.python.captures)
    - fn [captures](../../src/extract/python.ts#L416) (name: Node) → boolean <!-- internal -->
      <a id="extract.python.captures"></a><br>A bare name in a `case` pattern binds it (`case x:`, `P(k=x)`); a dotted one (`Color.RED`) and a class (`case P():`) are values.
    - fn [boundNames](../../src/extract/python.ts#L423) (fn: Node) → Map<string, "parameter" | "local"> <!-- internal -->
      <a id="extract.python.boundNames"></a><br>Parameter and assigned names in a function: a call through one of them is a call through a value.
      - calls [extract.python.walkBindings](extract.md#extract.python.walkBindings)
    - type [CallScope](../../src/extract/python.ts#L448) <!-- internal -->
      <a id="extract.python.CallScope"></a><br>What a call inside a function is resolved against: the receiver, the class, bound names and their known classes.
    - fn [typedValues](../../src/extract/python.ts#L465) (fn: Node) → Map<string, string> <!-- internal -->
      <a id="extract.python.typedValues"></a><br>Names in a function whose class the syntax names, bound nowhere else in it: a parameter annotated with a class (`repo: Repo`, `repo: Repo = Depends(…)`, `Optional[Repo]`, `Repo | None`, `Annotated[Repo, …]`) or a local whose only assignment is `x = Repo(…)` or `x: Repo = …`.…
      - calls [extract.python.walkBindings](extract.md#extract.python.walkBindings), [extract.python.annotatedClass](extract.md#extract.python.annotatedClass), [extract.python.constructedClass](extract.md#extract.python.constructedClass)
    - fn [annotatedClass](../../src/extract/python.ts#L502) (type: Node | null) → string | null <!-- internal -->
      <a id="extract.python.annotatedClass"></a><br>The one class an annotation names: `X`, `"X"`, `Optional[X]`, `X | None`, `Annotated[X, …]`; null for anything else.
      - calls [extract.python.classInAnnotation](extract.md#extract.python.classInAnnotation)
    - fn [classInAnnotation](../../src/extract/python.ts#L507) (text: string) → string | null <!-- internal -->
      <a id="extract.python.classInAnnotation"></a><br>`classInAnnotation` over annotation text without whitespace; recursive through the wrappers it knows.
    - fn [constructedClass](../../src/extract/python.ts#L529) (value: Node | null) → string | null <!-- internal -->
      <a id="extract.python.constructedClass"></a><br>`X(…)` → `X`.
    - type [ClosureState](../../src/extract/python.ts#L541) = null | "stored" | { line: number; col: number } <!-- internal -->
      <a id="extract.python.ClosureState"></a><br>Where a call sits with respect to closures: null outside them; `stored` under a nested `def` or a lambda some value holds (`g = lambda: …`); otherwise the position of the outermost lambda, every lambda between being an argument of a call (`run(lambda: self.m())`, `sorted(xs…
    - type [UnplacedCall](../../src/extract/python.ts#L544) = Omit<CallFact, "line" | "col" | "endLine" | "endCol"> <!-- internal -->
      <a id="extract.python.UnplacedCall"></a><br>A call fact before its position is known.
    - fn [bodyCalls](../../src/extract/python.ts#L547) (body: Node, scope: CallScope) → CallFact[] <!-- internal -->
      <a id="extract.python.bodyCalls"></a><br>Every call in a function body as a call fact, with its closure state and callable arguments.
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.python.passesOf](extract.md#extract.python.passesOf), [extract.python.callOf](extract.md#extract.python.callOf)
    - fn [passesOf](../../src/extract/python.ts#L592) (call: Node, scope: CallScope) → PassFact[] <!-- internal -->
      <a id="extract.python.passesOf"></a><br>Callable references among the arguments: `run(self.m)`, `run(Order.m)`, `run(obj.m)` with the class of `obj` known, `run(callback=self.m)`, `functools.partial(self.m, …)`. A lambda is not a pass: its calls carry `closureArg`.
      - calls [extract.python.callableOf](extract.md#extract.python.callableOf), [extract.python.callOf](extract.md#extract.python.callOf), [extract.treesitter.located](extract.md#extract.treesitter.located)
    - fn [callableOf](../../src/extract/python.ts#L623) (value: Node) → Node | null <!-- internal -->
      <a id="extract.python.callableOf"></a><br>The expression that names the callable an argument passes: a name, an attribute, or the first argument of `functools.partial(…)`.
    - fn [callOf](../../src/extract/python.ts#L644) (fn: Node | null, scope: CallScope) → Pick<CallFact, "callee" | "bound" | "receiver"> <!-- internal -->
      <a id="extract.python.callOf"></a><br>`f()` → `f`; `a.b.f()` → `a.b.f`; `self.m()` → `this.m` (`Order.m` for a static method); `x.m()` through a value → `x.m`, bound, with the receiver's class when `typedValues` names it. Any other callee (`super().m()`, `f().m()`, `x[0]()`) is a call through a value keylang cannot…
    - fn [collectMainEntries](../../src/extract/python.ts#L696) (root: Node, names: ReadonlySet<string>, facts: FileFacts) → void <!-- internal -->
      <a id="extract.python.collectMainEntries"></a><br>`if __name__ == "__main__":` at module level: the script's entry. Its callee is the first fn of the file (a `def`, or an imported name) the block calls directly (`main()`, `sys.exit(main())`, `asyncio.run(main())`); null when the block calls no such name, and the module's top…
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located)
    - fn [moduleCalls](../../src/extract/python.ts#L735) (root: Node) → CallFact[] <!-- internal -->
      <a id="extract.python.moduleCalls"></a><br>Calls outside every `def`: module level and class bodies run when the module loads; so does a decorator.
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.python.callOf](extract.md#extract.python.callOf)
    - fn [valueRefs](../../src/extract/python.ts#L766) (root: Node, names: ReadonlySet<string>, glob: boolean) → ValueRefFact[] <!-- internal -->
      <a id="extract.python.valueRefs"></a><br>Functions read as values: `later(hit)`, `{"save": save}`, `callback=self.save`, `mod.save` without a call. Code holding the value may call it.
      - calls [extract.python.boundNames](extract.md#extract.python.boundNames), [extract.python.bindsOrCalls](extract.md#extract.python.bindsOrCalls), [extract.python.assigned](extract.md#extract.python.assigned)
    - fn [bindsOrCalls](../../src/extract/python.ts#L808) (node: Node, parent: Node) → boolean <!-- internal -->
      <a id="extract.python.bindsOrCalls"></a><br>The identifier is a callee, a declared name or a binding — not a value read.
      - calls [extract.python.assigned](extract.md#extract.python.assigned)
    - fn [assigned](../../src/extract/python.ts#L829) (node: Node, parent: Node) → boolean <!-- internal -->
      <a id="extract.python.assigned"></a><br>The node is the target of an assignment (`x = …`, `x += …`, `self.x = …`).
    - fn [collectDynamic](../../src/extract/python.ts#L838) (root: Node, facts: FileFacts) → void <!-- internal -->
      <a id="extract.python.collectDynamic"></a><br>`getattr(x, name)`, `importlib.import_module(name)`, `__import__(name)`, `exec`/`eval`: what they reach is decided at run time. A `getattr` in a `def` is a hole of that function's calls; the others may import anything.
      - calls [extract.python.enclosingFn](extract.md#extract.python.enclosingFn), [extract.python.unsupported](extract.md#extract.python.unsupported)
    - fn [isDeclarationLevel](../../src/extract/python.ts#L862) (node: Node) → boolean <!-- internal -->
      <a id="extract.python.isDeclarationLevel"></a><br>No `def` or `class` encloses the node: it is at the top of the module (possibly under `if`/`try`).
    - fn [enclosingFn](../../src/extract/python.ts#L873) (node: Node) → string | null <!-- internal -->
      <a id="extract.python.enclosingFn"></a><br>The indexed fn whose body holds the node, as a dotted path (`place`, `Order.save`, `Order.Line.price`); a `def` nested in a `def` belongs to the outer one. Null at module level and in a class body outside methods.
    - fn [importsIn](../../src/extract/python.ts#L901) (root: Node, reexported: (local: string | null) => boolean) → ImportFact[] <!-- internal -->
      <a id="extract.python.importsIn"></a><br>Every import of the file, in source order, wherever it is written. `import a.b as c` → `a.b` bound to `c`; `import a.b` → `a` bound to `a` plus `a.b` bound to the path `a.b`; `from .m import x` → `.m.x` bound to `x`; `from .m import *` → `.m.*`, which binds no name of its own.…
      - calls [extract.python.importsOf](extract.md#extract.python.importsOf)
    - fn [importsOf](../../src/extract/python.ts#L921) (node: Node, reexported: (local: string | null) => boolean) → ImportFact[] <!-- internal -->
      <a id="extract.python.importsOf"></a><br>The import facts of one `import` or `from … import` statement (see `importsIn`).
      - calls [extract.python.isDeclarationLevel](extract.md#extract.python.isDeclarationLevel), [extract.python.importAt](extract.md#extract.python.importAt)
    - fn [importAt](../../src/extract/python.ts#L981) (node: Node, source: string, bindings: ImportFact["bindings"], reexport: boolean) → ImportFact <!-- internal -->
      <a id="extract.python.importAt"></a><br>An import fact placed at `node`.
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located)
    - fn [unsupported](../../src/extract/python.ts#L988) (node: Node, reason: string) → UnsupportedFact <!-- internal -->
      <a id="extract.python.unsupported"></a><br>A hole at `node`, its text cut to the first line.
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located)
    - fn [statementsOf](../../src/extract/python.ts#L1002) (topLevel: readonly Node[]) → StatementFact[] <!-- internal -->
      <a id="extract.python.statementsOf"></a><br>Module-level statements a framework may execute as its config: an assignment (`x = …`, `x += …`, `a.b = …`) or a call statement whose value has a call in it, the value as written (`LiteralValue`).
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.python.literalOf](extract.md#extract.python.literalOf), [extract.python.dottedName](extract.md#extract.python.dottedName), [extract.python.hasCall](extract.md#extract.python.hasCall)
    - fn [noteParamCalls](../../src/extract/python.ts#L1035) (def: Node, symbol: string, facts: FileFacts) → void <!-- internal -->
      <a id="extract.python.noteParamCalls"></a><br>Calls written in the parameters of a `def`, defaults and annotations: `db = Depends(get_db)`.
      - calls [extract.python.literalOf](extract.md#extract.python.literalOf)
    - fn [hasCall](../../src/extract/python.ts#L1063) (node: Node) → boolean <!-- internal -->
      <a id="extract.python.hasCall"></a><br>The expression contains a call outside any lambda.
    - fn [dottedName](../../src/extract/python.ts#L1072) (node: Node) → boolean <!-- internal -->
      <a id="extract.python.dottedName"></a><br>`a`, `a.b.c`: a name or a chain of attributes on a name.
    - fn [literalOf](../../src/extract/python.ts#L1082) (node: Node, budget: { left: number }) → LiteralValue <!-- internal -->
      <a id="extract.python.literalOf"></a><br>A value as written, within `budget` nodes; past it, `other`.
      - calls [extract.python.other](extract.md#extract.python.other), [extract.python.dottedName](extract.md#extract.python.dottedName), [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.python.argumentsOf](extract.md#extract.python.argumentsOf)
    - type [CallArguments](../../src/extract/python.ts#L1148) <!-- internal -->
      <a id="extract.python.CallArguments"></a><br>The positional and keyword arguments of a call; a `*xs` or `**kw` is an `other` positional.
    - fn [argumentsOf](../../src/extract/python.ts#L1154) (call: Node, budget: { left: number }) → CallArguments <!-- internal -->
      <a id="extract.python.argumentsOf"></a><br>The arguments of a call as literal values, keyword ones by name.
      - calls [extract.python.literalOf](extract.md#extract.python.literalOf)
    - fn [other](../../src/extract/python.ts#L1177) (node: Node) → LiteralValue <!-- internal -->
      <a id="extract.python.other"></a><br>A value that is not literal, kept as its source text on one line, cut to 80 characters.
  - module [rust](../../src/extract/rust.ts#L1)
    <a id="extract.rust"></a><br>Rust facts: items, `impl` members, `use` trees, calls. A `use` leaf is one import whose specifier is the full path (`crate::domain::order::place`); the resolver decides how much of it is a module.
    - facts [extract.facts](extract.md#extract.facts)
    - doc-comments [extract.doc-comments](extract.md#extract.doc-comments)
    - treesitter [extract.treesitter](extract.md#extract.treesitter)
    - fn [extractRust](../../src/extract/rust.ts#L43) (path: string, src: string) → Promise<FileFacts>
      <a id="extract.rust.extractRust"></a><br>The facts of one Rust file: imports, items with their calls, holes and value references.
      - calls [extract.treesitter.withTree](extract.md#extract.treesitter.withTree), [extract.rust.extractTree](extract.md#extract.rust.extractTree)
    - fn [extractTree](../../src/extract/rust.ts#L48) (path: string, root: Node) → FileFacts <!-- internal -->
      <a id="extract.rust.extractTree"></a><br>Collect the facts of a parsed file in passes: imports, items, `impl` members, value references, then file-level data.
      - calls [extract.rust.isTestAttribute](extract.md#extract.rust.isTestAttribute), [extract.rust.isComment](extract.md#extract.rust.isComment), [extract.rust.testOnly](extract.md#extract.rust.testOnly), [extract.rust.useLeaves](extract.md#extract.rust.useLeaves), [extract.rust.useImport](extract.md#extract.rust.useImport), [extract.rust.exported](extract.md#extract.rust.exported), [extract.rust.importAt](extract.md#extract.rust.importAt), [extract.rust.nestedUses](extract.md#extract.rust.nestedUses), [extract.rust.bodyCalls](extract.md#extract.rust.bodyCalls), [extract.rust.fnDecl](extract.md#extract.rust.fnDecl), [extract.rust.exportRow](extract.md#extract.rust.exportRow), [extract.rust.noteAttributes](extract.md#extract.rust.noteAttributes), [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.rust.itemDoc](extract.md#extract.rust.itemDoc), [extract.treesitter.fingerprintFacts](extract.md#extract.treesitter.fingerprintFacts), [extract.rust.members](extract.md#extract.rust.members), [extract.rust.baseType](extract.md#extract.rust.baseType), [extract.rust.unsupported](extract.md#extract.rust.unsupported), [extract.rust.macroName](extract.md#extract.rust.macroName), [extract.rust.valueRefs](extract.md#extract.rust.valueRefs), [extract.rust.moduleDoc](extract.md#extract.rust.moduleDoc), [extract.treesitter.valuesFingerprint](extract.md#extract.treesitter.valuesFingerprint), [extract.treesitter.errorLine](extract.md#extract.treesitter.errorLine)
    - fn [isComment](../../src/extract/rust.ts#L200) (node: Node) → boolean <!-- internal -->
      <a id="extract.rust.isComment"></a><br>A line or block comment node.
    - fn [outerDoc](../../src/extract/rust.ts#L205) (node: Node) → boolean <!-- internal -->
      <a id="extract.rust.outerDoc"></a><br>`///` (not `////`) or `/** … *\/` (not `/**\/`): outer documentation of the item after it.
    - fn [innerDoc](../../src/extract/rust.ts#L210) (node: Node) → boolean <!-- internal -->
      <a id="extract.rust.innerDoc"></a><br>`//!` or `/*! … *\/`: documentation of the module it is written in.
    - fn [docText](../../src/extract/rust.ts#L215) (comments: readonly Node[]) → string | undefined <!-- internal -->
      <a id="extract.rust.docText"></a><br>Text of doc comments in source order: line comments without `///`/`//!`, blocks without delimiters.
      - calls [extract.doc-comments.lineCommentsBody](extract.md#extract.doc-comments.lineCommentsBody), [extract.doc-comments.blockCommentBody](extract.md#extract.doc-comments.blockCommentBody), [extract.doc-comments.isLicense](extract.md#extract.doc-comments.isLicense), [extract.doc-comments.nonEmpty](extract.md#extract.doc-comments.nonEmpty)
    - fn [itemDoc](../../src/extract/rust.ts#L226) (node: Node) → string | undefined <!-- internal -->
      <a id="extract.rust.itemDoc"></a><br>The item's documentation: its outer doc comments, attributes and plain comments between them allowed. `#[doc = "…"]` is an attribute keylang does not read, so an item documented only by it has none.
      - calls [extract.rust.isComment](extract.md#extract.rust.isComment), [extract.rust.innerDoc](extract.md#extract.rust.innerDoc), [extract.rust.outerDoc](extract.md#extract.rust.outerDoc), [extract.rust.docText](extract.md#extract.rust.docText)
    - fn [moduleDoc](../../src/extract/rust.ts#L241) (root: Node) → string | undefined <!-- internal -->
      <a id="extract.rust.moduleDoc"></a><br>The module's documentation: the `//!` and `/*! … *\/` comments of the file (`mod.rs` for a directory).
      - calls [extract.rust.docText](extract.md#extract.rust.docText), [extract.rust.innerDoc](extract.md#extract.rust.innerDoc)
    - fn [exported](../../src/extract/rust.ts#L246) (node: Node) → boolean <!-- internal -->
      <a id="extract.rust.exported"></a><br>The item has any `pub` visibility (`pub`, `pub(crate)`, …).
    - fn [members](../../src/extract/rust.ts#L251) (node: Node) → Node[] <!-- internal -->
      <a id="extract.rust.members"></a><br>Items of an `impl` or a `trait` body, without test-only ones.
      - calls [extract.rust.isComment](extract.md#extract.rust.isComment), [extract.rust.testOnly](extract.md#extract.rust.testOnly)
    - fn [testOnly](../../src/extract/rust.ts#L256) (node: Node) → boolean <!-- internal -->
      <a id="extract.rust.testOnly"></a><br>An item under `#[cfg(test)]` (or `cfg(all(test, …))`) or a `#[test]` fn: test code, kept out of the map like test files.
      - calls [extract.rust.isComment](extract.md#extract.rust.isComment), [extract.rust.isTestAttribute](extract.md#extract.rust.isTestAttribute)
    - fn [noteAttributes](../../src/extract/rust.ts#L271) (node: Node, symbol: string, member: boolean, facts: FileFacts) → void <!-- internal -->
      <a id="extract.rust.noteAttributes"></a><br>An attribute macro keylang does not know (`#[get("/")]`, `#[tauri::command]`) may replace the fn: calls of the name may not reach the body (a hole of that fn), and the macro holds the fn, so a framework may call it. A method of an `impl` for a type of another file is not…
      - calls [extract.rust.isComment](extract.md#extract.rust.isComment), [extract.rust.unsupported](extract.md#extract.rust.unsupported), [extract.treesitter.located](extract.md#extract.treesitter.located)
    - fn [isTestAttribute](../../src/extract/rust.ts#L287) (node: Node) → boolean <!-- internal -->
      <a id="extract.rust.isTestAttribute"></a><br>`#[cfg(test)]`, `#[cfg(all(test, unix))]`, `#[test]`, `#[tokio::test]`, `#[bench]` (or `#![…]`).
      - calls [extract.rust.requiresTest](extract.md#extract.rust.requiresTest)
    - fn [requiresTest](../../src/extract/rust.ts#L299) (predicate: string) → boolean <!-- internal -->
      <a id="extract.rust.requiresTest"></a><br>A `cfg` predicate that holds only in test builds: `test`, `all(…, test, …)`, `any` of such.
      - calls [extract.rust.splitTopLevel](extract.md#extract.rust.splitTopLevel)
    - fn [splitTopLevel](../../src/extract/rust.ts#L311) (text: string) → string[] <!-- internal -->
      <a id="extract.rust.splitTopLevel"></a><br>Split a `cfg` argument list at commas outside parentheses and string literals.
    - fn [nestedUses](../../src/extract/rust.ts#L335) (node: Node, facts: FileFacts) → void <!-- internal -->
      <a id="extract.rust.nestedUses"></a><br>`use` declarations inside items (fn bodies, `impl` members), except inline modules, whose paths start elsewhere, and test code.
      - calls [extract.rust.testOnly](extract.md#extract.rust.testOnly), [extract.rust.useLeaves](extract.md#extract.rust.useLeaves), [extract.rust.useImport](extract.md#extract.rust.useImport)
    - fn [exportRow](../../src/extract/rust.ts#L350) (facts: FileFacts, name: string, kind: ExportRow["kind"]) → void <!-- internal -->
      <a id="extract.rust.exportRow"></a><br>Record a public name of the file.
    - fn [baseType](../../src/extract/rust.ts#L356) (node: Node | null) → string | null <!-- internal -->
      <a id="extract.rust.baseType"></a><br>`Gen<T>` → `Gen`, `crate::a::S` → `S`; null for references, tuples and the like.
    - fn [takesSelf](../../src/extract/rust.ts#L369) (params: Node | null) → boolean <!-- internal -->
      <a id="extract.rust.takesSelf"></a><br>`&self`, `mut self`, `self: Box<Self>`: the fn is a method.
    - fn [fnDecl](../../src/extract/rust.ts#L374) (node: Node, name: string, exported: boolean, owner: string | null, names: ReadonlySet<string>, facts: FileFacts) → DeclFact <!-- internal -->
      <a id="extract.rust.fnDecl"></a><br>The declaration of a fn or method: signature, calls, doc, and whether it is an associated (static) fn.
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.rust.takesSelf](extract.md#extract.rust.takesSelf), [extract.rust.bodyCalls](extract.md#extract.rust.bodyCalls), [extract.rust.boundNames](extract.md#extract.rust.boundNames), [extract.rust.itemDoc](extract.md#extract.rust.itemDoc), [extract.treesitter.fingerprintFacts](extract.md#extract.treesitter.fingerprintFacts)
    - fn [boundNames](../../src/extract/rust.ts#L400) (fn: Node) → Map<string, "parameter" | "local"> <!-- internal -->
      <a id="extract.rust.boundNames"></a><br>Names a function (or closure) binds: parameters, `let`, `for`, `if let` / `while let`, `match` arm patterns and closure parameters. A call through one of them is a call through a value.
    - type [CallScope](../../src/extract/rust.ts#L457) <!-- internal -->
      <a id="extract.rust.CallScope"></a><br>Where a call is written: the `impl` type, whether the fn takes `self`, its bound names, and the file's item and import names.
    - type [ClosureState](../../src/extract/rust.ts#L472) = null | "stored" | { line: number; col: number } <!-- internal -->
      <a id="extract.rust.ClosureState"></a><br>Where a call sits with respect to closures: null outside them; `stored` under a nested `fn`, an `async` block or a closure some value holds (`let g = |x| …`); otherwise the position of the outermost closure, every closure between being an argument of a call…
    - type [UnplacedCall](../../src/extract/rust.ts#L475) = Omit<CallFact, "line" | "col" | "endLine" | "endCol"> <!-- internal -->
      <a id="extract.rust.UnplacedCall"></a><br>A call fact before its position is known.
    - fn [bodyCalls](../../src/extract/rust.ts#L478) (body: Node, scope: CallScope, facts: FileFacts) → CallFact[] <!-- internal -->
      <a id="extract.rust.bodyCalls"></a><br>Every call in a body as a call fact (with closure state and fn arguments), and a hole for each unknown macro.
      - calls [extract.rust.callOf](extract.md#extract.rust.callOf), [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.rust.passesOf](extract.md#extract.rust.passesOf), [extract.rust.macroName](extract.md#extract.rust.macroName), [extract.rust.unsupported](extract.md#extract.rust.unsupported)
    - fn [passesOf](../../src/extract/rust.ts#L530) (call: Node, scope: CallScope, facts: FileFacts) → PassFact[] <!-- internal -->
      <a id="extract.rust.passesOf"></a><br>Function paths among the arguments: `run(Self::m)`, `run(m)`, `run(crate::util::helper)`, `.map(Order::total)`. A closure is not a pass: its calls carry `closureArg`.
      - calls [extract.rust.callOf](extract.md#extract.rust.callOf), [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.rust.compact](extract.md#extract.rust.compact)
    - type [Callee](../../src/extract/rust.ts#L552) = Pick<CallFact, "callee" | "bound"> <!-- internal -->
      <a id="extract.rust.Callee"></a><br>What a callee expression names: the dotted callee, and `bound` when it goes through a local or parameter.
    - fn [callOf](../../src/extract/rust.ts#L564) (fn: Node | null, scope: CallScope, facts: FileFacts) → Callee | null <!-- internal -->
      <a id="extract.rust.callOf"></a><br>`f()` → `f`; `a::b::f()` → `a.b.f`; `Self::new()` → `<Type>.new`; `self.m()` → `this.m`; `x.m()` → `x.m` (through a value). A path that starts at `crate`, `super`, `self` or a lower-case name keylang does not know imports what it names: the call is an edge to that module's item.
      - calls [extract.rust.throughValue](extract.md#extract.rust.throughValue), [extract.rust.pathCall](extract.md#extract.rust.pathCall)
    - fn [pathCall](../../src/extract/rust.ts#L612) (fn: Node, scope: CallScope, facts: FileFacts) → Callee | null <!-- internal -->
      <a id="extract.rust.pathCall"></a><br>The callee of a path call or a path read as a value; null for a variant or tuple-struct constructor.
      - calls [extract.rust.pathSegments](extract.md#extract.rust.pathSegments), [extract.rust.compact](extract.md#extract.rust.compact), [extract.rust.throughValue](extract.md#extract.rust.throughValue), [extract.treesitter.located](extract.md#extract.treesitter.located)
    - fn [throughValue](../../src/extract/rust.ts#L662) (fn: Node) → Callee <!-- internal -->
      <a id="extract.rust.throughValue"></a><br>A call keylang cannot name, as written: a `dynamic-call` hole, never an edge.
      - calls [extract.rust.compact](extract.md#extract.rust.compact)
    - fn [compact](../../src/extract/rust.ts#L667) (text: string) → string <!-- internal -->
      <a id="extract.rust.compact"></a><br>Source text on one line, without spaces around `.` and `:`.
    - fn [pathSegments](../../src/extract/rust.ts#L672) (node: Node) → string[] | null <!-- internal -->
      <a id="extract.rust.pathSegments"></a><br>`a::b::c` → `["a", "b", "c"]`; null when a segment is not a plain name (`<T as X>::f`).
    - fn [valueRefs](../../src/extract/rust.ts#L694) (items: Node[], names: ReadonlySet<string>, facts: FileFacts) → ValueRefFact[] <!-- internal -->
      <a id="extract.rust.valueRefs"></a><br>Functions read as values: `later(hit)`, `.map(Order::total)`, `Handler { run: crate::a::go }`. Code holding the value may call it, so such a fn escapes.
      - calls [extract.rust.testOnly](extract.md#extract.rust.testOnly), [extract.rust.boundNames](extract.md#extract.rust.boundNames), [extract.rust.bindsOrCalls](extract.md#extract.rust.bindsOrCalls), [extract.rust.calledPath](extract.md#extract.rust.calledPath), [extract.rust.pathCall](extract.md#extract.rust.pathCall)
    - fn [calledPath](../../src/extract/rust.ts#L741) (node: Node) → boolean <!-- internal -->
      <a id="extract.rust.calledPath"></a><br>The path is the callee of a call, or a part of a longer path or a pattern: not a value read.
    - fn [bindsOrCalls](../../src/extract/rust.ts#L756) (node: Node) → boolean <!-- internal -->
      <a id="extract.rust.bindsOrCalls"></a><br>The identifier names what is declared, bound or called here, or is part of a path or pattern.
      - calls [extract.rust.calledPath](extract.md#extract.rust.calledPath)
    - type [UseLeaf](../../src/extract/rust.ts#L782) <!-- internal -->
      <a id="extract.rust.UseLeaf"></a><br>One imported path of a `use` tree, with its alias and whether it is a glob.
    - fn [useLeaves](../../src/extract/rust.ts#L789) (node: Node | null, prefix: string[]) → UseLeaf[] <!-- internal -->
      <a id="extract.rust.useLeaves"></a><br>Flatten a `use` tree: `a::{b, c::d as e, f::*}` → `a::b`, `a::c::d` as `e`, `a::f::*`.
      - calls [extract.rust.pathSegments](extract.md#extract.rust.pathSegments)
    - fn [useImport](../../src/extract/rust.ts#L832) (node: Node, leaf: UseLeaf, exported: boolean, facts: FileFacts) → ImportFact <!-- internal -->
      <a id="extract.rust.useImport"></a><br>The import fact of one `use` leaf; a `pub use` also records the re-export.
      - calls [extract.rust.importAt](extract.md#extract.rust.importAt), [extract.rust.exportRow](extract.md#extract.rust.exportRow)
    - fn [importAt](../../src/extract/rust.ts#L851) (node: Node, source: string, bindings: ImportFact["bindings"], reexport: boolean) → ImportFact <!-- internal -->
      <a id="extract.rust.importAt"></a><br>An import fact placed at `node`.
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located)
    - fn [macroName](../../src/extract/rust.ts#L858) (node: Node) → string <!-- internal -->
      <a id="extract.rust.macroName"></a><br>The macro's path as written, without `!`.
    - fn [unsupported](../../src/extract/rust.ts#L863) (node: Node, reason: string) → UnsupportedFact <!-- internal -->
      <a id="extract.rust.unsupported"></a><br>A hole at `node`, its text cut to the first line.
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located)
  - module [treesitter](../../src/extract/treesitter.ts#L1)
    <a id="extract.treesitter"></a><br>web-tree-sitter runtime with the grammar WASM files from @vscode/tree-sitter-wasm. Languages are loaded lazily and cached for the process.
    - node [external.node](external.md#external.node)
    - web-tree-sitter [external.web-tree-sitter](external.md#external.web-tree-sitter)
    - grammars [extract.grammars](extract.md#extract.grammars)
    - fn [wasmDir](../../src/extract/treesitter.ts#L41) () → string <!-- internal -->
      <a id="extract.treesitter.wasmDir"></a><br>The directory holding the grammar WASM files: bundled in `dist/wasm`, else the dependency's own.
    - fn [loadLanguage](../../src/extract/treesitter.ts#L51) (g: Grammar) → Promise<Language>
      <a id="extract.treesitter.loadLanguage"></a><br>The grammar `g`, loaded once per process after the runtime is initialised.
      - calls [extract.treesitter.wasmDir](extract.md#extract.treesitter.wasmDir), [extract.grammars.wasmFile](extract.md#extract.grammars.wasmFile)
    - fn [withTree](../../src/extract/treesitter.ts#L67) (g: Grammar, src: string, use: (tree: Tree, language: Language) => T) → Promise<T>
      <a id="extract.treesitter.withTree"></a><br>Parse `src` and run `use` on the tree, which is freed afterwards: a tree lives in the WASM heap, so nothing `use` returns may hold a node.
      - calls [extract.treesitter.loadLanguage](extract.md#extract.treesitter.loadLanguage), [extract.treesitter.surrogatePairs](extract.md#extract.treesitter.surrogatePairs)
    - fn [query](../../src/extract/treesitter.ts#L95) (language: Language, g: Grammar, name: string, source: string) → Query
      <a id="extract.treesitter.query"></a><br>Compile a query once per (grammar, source).
    - fn [grammarFor](../../src/extract/treesitter.ts#L109) (path: string) → Grammar
      <a id="extract.treesitter.grammarFor"></a><br>The grammar a file is parsed with, by extension; anything unrecognised is read as JavaScript.
    - type [Located](../../src/extract/treesitter.ts#L124)
      <a id="extract.treesitter.Located"></a><br>A node's 1-based range (columns in code points) and its source text.
    - fn [located](../../src/extract/treesitter.ts#L133) (node: Node) → Located
      <a id="extract.treesitter.located"></a><br>1-based range and text of a node; columns count code points, and `endCol` is the column after it.
      - calls [extract.treesitter.startCol](extract.md#extract.treesitter.startCol), [extract.treesitter.codePointColumn](extract.md#extract.treesitter.codePointColumn)
    - fn [startCol](../../src/extract/treesitter.ts#L144) (node: Node) → number
      <a id="extract.treesitter.startCol"></a><br>The node's 1-based start column in code points (§7), as `located` gives it.
      - calls [extract.treesitter.codePointColumn](extract.md#extract.treesitter.codePointColumn)
    - fn [codePointColumn](../../src/extract/treesitter.ts#L153) (tree: Tree, index: number, units: number) → number <!-- internal -->
      <a id="extract.treesitter.codePointColumn"></a><br>web-tree-sitter parses a JS string as UTF-16, so its columns and indices count code units. A surrogate pair between the line start and the point is one code point, and so one column.
      - calls [extract.treesitter.firstAtOrAfter](extract.md#extract.treesitter.firstAtOrAfter)
    - fn [surrogatePairs](../../src/extract/treesitter.ts#L164) (src: string) → number[] <!-- internal -->
      <a id="extract.treesitter.surrogatePairs"></a><br>Indices of the low half of each surrogate pair in `src`, ascending.
    - fn [firstAtOrAfter](../../src/extract/treesitter.ts#L173) (sorted: readonly number[], value: number) → number <!-- internal -->
      <a id="extract.treesitter.firstAtOrAfter"></a><br>Position of the first element `>= value` in an ascending array.
    - fn [errorLine](../../src/extract/treesitter.ts#L188) (node: Node) → number
      <a id="extract.treesitter.errorLine"></a><br>First syntax-error line, or the start of the tree when the grammar only sets `hasError`.
    - fn [fingerprint](../../src/extract/treesitter.ts#L216) (node: Node) → string
      <a id="extract.treesitter.fingerprint"></a><br>SHA-256 of the node's syntax: node types and token texts, without comments and whitespace. `>` → `>=` changes it; reformatting or editing a comment does not. Nesting is part of it, so moving a statement out of a block counts.
      - calls [extract.treesitter.fingerprintFacts](extract.md#extract.treesitter.fingerprintFacts)
    - fn [fingerprintFacts](../../src/extract/treesitter.ts#L228) (node: Node) → FingerprintFacts
      <a id="extract.treesitter.fingerprintFacts"></a><br>`fingerprint` of the node, and `readsImports`: the names it reads as values that an import binds whose syntax does not tell whether its target is in the repository (a Python absolute import, a PHP `use`, a bare TS specifier, a Rust `use` of another crate). The graph, which…
      - calls [extract.treesitter.hashSyntax](extract.md#extract.treesitter.hashSyntax), [extract.treesitter.valuesRead](extract.md#extract.treesitter.valuesRead), [extract.treesitter.importedValueReads](extract.md#extract.treesitter.importedValueReads)
    - type [FingerprintFacts](../../src/extract/treesitter.ts#L247)
      <a id="extract.treesitter.FingerprintFacts"></a><br>A fingerprint, and the imported names whose origin only the graph can judge.
    - fn [valuesFingerprint](../../src/extract/treesitter.ts#L261) (statements: readonly Node[], decls: readonly PlacedDecl[]) → string | undefined
      <a id="extract.treesitter.valuesFingerprint"></a><br>SHA-256 of the value code among `statements` of a module or a class body: constants, assignments, object tables, fields, top-level calls — every statement but a declaration of `decls` (a fn, class or type, which has its own fingerprint), an import, a comment or a docstring.…
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.treesitter.hashSyntax](extract.md#extract.treesitter.hashSyntax), [extract.treesitter.isDocstring](extract.md#extract.treesitter.isDocstring)
    - type [PlacedDecl](../../src/extract/treesitter.ts#L330) <!-- internal -->
      <a id="extract.treesitter.PlacedDecl"></a><br>Where a declaration starts, with its members (a Rust `impl` puts methods under their type).
    - fn [isDocstring](../../src/extract/treesitter.ts#L353) (statement: Node) → boolean <!-- internal -->
      <a id="extract.treesitter.isDocstring"></a><br>A string on its own: a Python docstring.
    - fn [hashSyntax](../../src/extract/treesitter.ts#L368) (node: Node, hash: Hash) → Set<string> <!-- internal -->
      <a id="extract.treesitter.hashSyntax"></a><br>Hash the syntax of `node` into `hash` (see `fingerprint`); the names of the leaves in it.
    - type [ValueDecl](../../src/extract/treesitter.ts#L406) <!-- internal -->
      <a id="extract.treesitter.ValueDecl"></a><br>A value declared by name in a scope: a variable, constant or field.
    - fn [valuesRead](../../src/extract/treesitter.ts#L427) (node: Node, reads: ReadonlySet<string>) → ValueDecl[] <!-- internal -->
      <a id="extract.treesitter.valuesRead"></a><br>The value declarations `node` reads by name, transitively, in every scope around it (an enclosing class body, the module), in document order. A declaration that holds `node` itself (`const f = () => …`) is left out.
      - calls [extract.treesitter.valuesOf](extract.md#extract.treesitter.valuesOf), [extract.treesitter.hashSyntax](extract.md#extract.treesitter.hashSyntax)
    - fn [valuesOf](../../src/extract/treesitter.ts#L464) (scope: Node) → ValueDecl[] <!-- internal -->
      <a id="extract.treesitter.valuesOf"></a><br>The value declarations directly in `scope` (and the fields its constructor sets), cached per tree and scope node.
      - calls [extract.treesitter.valueDeclaration](extract.md#extract.treesitter.valueDeclaration), [extract.treesitter.declaredNames](extract.md#extract.treesitter.declaredNames), [extract.treesitter.constructorFields](extract.md#extract.treesitter.constructorFields)
    - fn [constructorFields](../../src/extract/treesitter.ts#L498) (member: Node) → { name: string; node: Node }[] <!-- internal -->
      <a id="extract.treesitter.constructorFields"></a><br>Fields a class member that is the constructor sets: `this.x = …` (TS/JS `constructor`), `self.x = …` (Python `__init__`), `$this->x = …` (PHP `__construct`), and the constructor's parameters that declare a property (TS `constructor(private x = 1)`, PHP `__construct(private int…
      - calls [extract.treesitter.receiverField](extract.md#extract.treesitter.receiverField)
    - fn [receiverField](../../src/extract/treesitter.ts#L548) (target: Node | null, receiver: string) → string | null <!-- internal -->
      <a id="extract.treesitter.receiverField"></a><br>`this.x`, `self.x`, `$this->x` as an assignment target: `x`. Arrow functions keep the receiver, so they are walked.
    - fn [valueDeclaration](../../src/extract/treesitter.ts#L572) (statement: Node) → Node | null <!-- internal -->
      <a id="extract.treesitter.valueDeclaration"></a><br>The value declaration a statement of a scope is, through `export` (TS) and an expression statement (Python).
    - fn [declaredNames](../../src/extract/treesitter.ts#L602) (decl: Node) → string[] <!-- internal -->
      <a id="extract.treesitter.declaredNames"></a><br>The names a value declaration binds, per declaration syntax of each language.
      - calls [extract.treesitter.patternNames](extract.md#extract.treesitter.patternNames)
    - fn [patternNames](../../src/extract/treesitter.ts#L632) (target: Node | null) → string[] <!-- internal -->
      <a id="extract.treesitter.patternNames"></a><br>Names a declaration target binds: an identifier, or every identifier of a destructuring pattern.
    - type [ImportedValueReads](../../src/extract/treesitter.ts#L652) <!-- internal -->
      <a id="extract.treesitter.ImportedValueReads"></a><br>The names `node` reads as values that an import binds: `relative` when one of them is bound by an import whose syntax places it in another file of the repository, `other` those bound by an import whose syntax does not tell.
    - fn [importedValueReads](../../src/extract/treesitter.ts#L657) (node: Node, reads: ReadonlySet<string>) → ImportedValueReads <!-- internal -->
      <a id="extract.treesitter.importedValueReads"></a>
      - calls [extract.treesitter.importedValueNames](extract.md#extract.treesitter.importedValueNames), [extract.treesitter.isCallee](extract.md#extract.treesitter.isCallee)
    - fn [isCallee](../../src/extract/treesitter.ts#L691) (leaf: Node) → boolean <!-- internal -->
      <a id="extract.treesitter.isCallee"></a><br>Whether a leaf is (the head of) what a call or `new` invokes, rather than a value read.
    - type [ImportedNames](../../src/extract/treesitter.ts#L707) <!-- internal -->
      <a id="extract.treesitter.ImportedNames"></a><br>Local names a file binds to values of other files by its top-level imports; see `importedValueNames`.
    - fn [importedValueNames](../../src/extract/treesitter.ts#L721) (tree: Tree) → ImportedNames <!-- internal -->
      <a id="extract.treesitter.importedValueNames"></a><br>Local names the file binds to values of other files by its top-level imports. `relative`: the import's syntax places them in the repository — a relative TS/JS specifier, a relative Python `from . import`, a Rust `use crate::`/`super::`/`self::`. `other`: it does not tell — a…
      - calls [extract.treesitter.collectImportedNames](extract.md#extract.treesitter.collectImportedNames)
    - fn [collectImportedNames](../../src/extract/treesitter.ts#L734) (statement: Node, names: ImportedNames) → void <!-- internal -->
      <a id="extract.treesitter.collectImportedNames"></a><br>Add the local names one top-level import binds to `names`, by language.
      - calls [extract.treesitter.useNames](extract.md#extract.treesitter.useNames)
    - fn [useNames](../../src/extract/treesitter.ts#L802) (clause: Node) → string[] <!-- internal -->
      <a id="extract.treesitter.useNames"></a><br>The local names a Rust `use` tree binds: the last segment, an alias, or every name of a `{…}` list.
  - module [ts](../../src/extract/ts.ts#L1)
    <a id="extract.ts"></a><br>TypeScript / JavaScript facts: imports, declarations, exports, calls. A tree walk over the top level plus tree-sitter queries inside bodies.
    - node [external.node](external.md#external.node)
    - facts [extract.facts](extract.md#extract.facts)
    - doc-comments [extract.doc-comments](extract.md#extract.doc-comments)
    - treesitter [extract.treesitter](extract.md#extract.treesitter)
    - fn [extractTs](../../src/extract/ts.ts#L49) (path: string, src: string) → Promise<FileFacts>
      <a id="extract.ts.extractTs"></a><br>The facts of one TypeScript or JavaScript file: what the graph reads to build nodes, edges and holes.
      - calls [extract.treesitter.grammarFor](extract.md#extract.treesitter.grammarFor), [extract.ts.withTsTree](extract.md#extract.ts.withTsTree), [extract.ts.extractTree](extract.md#extract.ts.extractTree)
    - fn [withTsTree](../../src/extract/ts.ts#L63) (path: string, src: string, use: (tree: Tree, language: Language, typeStars: ReadonlyMap<number, string>) => T) → Promise<T>
      <a id="extract.ts.withTsTree"></a><br>Parse a TypeScript or JavaScript source and run `use` on the tree. `export type * from` and `export type * as NS from` (TypeScript 5.0) are syntax errors for the bundled grammar, while the same statement without `type` is `export * from`: such a `type` is blanked with spaces…
      - calls [extract.treesitter.grammarFor](extract.md#extract.treesitter.grammarFor), [extract.treesitter.withTree](extract.md#extract.treesitter.withTree), [extract.ts.typeStarKeywords](extract.md#extract.ts.typeStarKeywords)
    - type [TypeStar](../../src/extract/ts.ts#L84) <!-- internal -->
      <a id="extract.ts.TypeStar"></a><br>The `type` of an `export type * from` statement the grammar could not read: offsets in the source (UTF-16 code units).
    - fn [typeStarKeywords](../../src/extract/ts.ts#L92) (root: Node) → TypeStar[] <!-- internal -->
      <a id="extract.ts.typeStarKeywords"></a><br>`export type * from "./t"` read as `export`, an error node holding `type`, then `*` or `* as NS`.
    - fn [parentOf](../../src/extract/ts.ts#L126) (node: Node) → Node | null <!-- internal -->
      <a id="extract.ts.parentOf"></a><br>The parent of a named node: from the index while `extractTree` runs, else from tree-sitter.
    - fn [parentIndex](../../src/extract/ts.ts#L131) (root: Node) → Map<number, Node> <!-- internal -->
      <a id="extract.ts.parentIndex"></a><br>Index every named node's parent by node id. An explicit stack, so a deep tree does not overflow.
    - fn [extractTree](../../src/extract/ts.ts#L150) (path: string, root: Node, language: Language, g: Grammar, typeStars: ReadonlyMap<number, string>) → FileFacts <!-- internal -->
      <a id="extract.ts.extractTree"></a><br>Extract one parsed file. Sets the module-wide `parents` and `header` state that the walk reads, and always clears it, even when extraction throws.
      - calls [extract.ts.parentIndex](extract.md#extract.ts.parentIndex), [extract.ts.moduleHeader](extract.md#extract.ts.moduleHeader), [extract.ts.extractIndexed](extract.md#extract.ts.extractIndexed)
    - fn [docOf](../../src/extract/ts.ts#L182) (node: Node) → string | undefined <!-- internal -->
      <a id="extract.ts.docOf"></a><br>The declaration's JSDoc: the nearest `/** … *\/` right above it or above the statements that wrap it (`export`, `const x =`), with decorators and line comments between them allowed. A line comment is a note, not documentation; other code in between, the file's header and a…
      - calls [extract.doc-comments.isLicense](extract.md#extract.doc-comments.isLicense), [extract.doc-comments.nonEmpty](extract.md#extract.doc-comments.nonEmpty), [extract.doc-comments.jsdocDescription](extract.md#extract.doc-comments.jsdocDescription), [extract.doc-comments.blockCommentBody](extract.md#extract.doc-comments.blockCommentBody), [extract.ts.parentOf](extract.md#extract.ts.parentOf)
    - type [ModuleHeader](../../src/extract/ts.ts#L207) <!-- internal -->
      <a id="extract.ts.ModuleHeader"></a><br>The module's doc comment and the comment nodes it is made of.
    - fn [moduleHeader](../../src/extract/ts.ts#L218) (root: Node) → ModuleHeader <!-- internal -->
      <a id="extract.ts.moduleHeader"></a><br>The module's documentation: the first block of comments in the file (after `#!`; license notices, `/// <reference>` directives and blocks without text skipped), unless it sits right above the first statement that is not an import or a directive (`"use strict"`): then it…
      - calls [extract.doc-comments.isLicense](extract.md#extract.doc-comments.isLicense), [extract.doc-comments.nonEmpty](extract.md#extract.doc-comments.nonEmpty), [extract.doc-comments.jsdocDescription](extract.md#extract.doc-comments.jsdocDescription), [extract.doc-comments.lineCommentsBody](extract.md#extract.doc-comments.lineCommentsBody), [extract.doc-comments.blockCommentBody](extract.md#extract.doc-comments.blockCommentBody)
    - fn [extractIndexed](../../src/extract/ts.ts#L265) (path: string, root: Node, language: Language, g: Grammar, typeStars: ReadonlyMap<number, string>) → FileFacts <!-- internal -->
      <a id="extract.ts.extractIndexed"></a><br>The facts of a file once the parent index and header are set: the top-level walk, then the whole-tree collectors.
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.ts.lineDeeperThan](extract.md#extract.ts.lineDeeperThan), [extract.treesitter.query](extract.md#extract.treesitter.query), [extract.ts.calleeOfCall](extract.md#extract.ts.calleeOfCall), [extract.ts.parentOf](extract.md#extract.ts.parentOf), [extract.ts.templateValue](extract.md#extract.ts.templateValue), [extract.ts.collapse](extract.md#extract.ts.collapse), [extract.ts.passesOf](extract.md#extract.ts.passesOf), [extract.ts.markClosure](extract.md#extract.ts.markClosure), [extract.ts.componentOfFactory](extract.md#extract.ts.componentOfFactory), [extract.ts.componentOfTag](extract.md#extract.ts.componentOfTag), [extract.ts.requireSource](extract.md#extract.ts.requireSource), [extract.ts.superModuleSource](extract.md#extract.ts.superModuleSource), [extract.ts.reactWrapperFn](extract.md#extract.ts.reactWrapperFn), [extract.ts.moduleSource](extract.md#extract.ts.moduleSource), [extract.ts.typeSignature](extract.md#extract.ts.typeSignature), [extract.ts.typeShape](extract.md#extract.ts.typeShape), [extract.ts.reactBindings](extract.md#extract.ts.reactBindings), [extract.ts.importStatement](extract.md#extract.ts.importStatement), [extract.ts.stringValue](extract.md#extract.ts.stringValue), [extract.ts.importAt](extract.md#extract.ts.importAt), [extract.ts.typeKeyword](extract.md#extract.ts.typeKeyword), [extract.ts.inlineTypesOnly](extract.md#extract.ts.inlineTypesOnly), [extract.ts.unwrapValue](extract.md#extract.ts.unwrapValue), [extract.ts.decl](extract.md#extract.ts.decl), [extract.ts.signature](extract.md#extract.ts.signature), [extract.ts.collectTypeRefs](extract.md#extract.ts.collectTypeRefs), [extract.ts.classDecl](extract.md#extract.ts.classDecl), [extract.ts.commonJsExports](extract.md#extract.ts.commonJsExports), [extract.ts.collectDynamicImports](extract.md#extract.ts.collectDynamicImports), [extract.ts.collectUnsupported](extract.md#extract.ts.collectUnsupported), [extract.ts.collectValueRefs](extract.md#extract.ts.collectValueRefs), [extract.ts.collectRouteEntries](extract.md#extract.ts.collectRouteEntries), [extract.ts.collectWebFacts](extract.md#extract.ts.collectWebFacts), [extract.treesitter.valuesFingerprint](extract.md#extract.treesitter.valuesFingerprint), [extract.treesitter.errorLine](extract.md#extract.treesitter.errorLine)
    - type [ReactBindings](../../src/extract/ts.ts#L656) <!-- internal -->
      <a id="extract.ts.ReactBindings"></a><br>What value imports from React bind in one file.
    - fn [reactBindings](../../src/extract/ts.ts#L670) (root: Node) → ReactBindings <!-- internal -->
      <a id="extract.ts.reactBindings"></a><br>React bindings of one file: the single source for wrappers and factories, so both follow one type-only rule. Imports hoist, so a `const` above its import still counts; `require("react")` binds only below itself and is not read. `import type`, `import type * as React` and…
      - calls [extract.ts.typeKeyword](extract.md#extract.ts.typeKeyword), [extract.ts.importStatement](extract.md#extract.ts.importStatement), [extract.ts.typeOnlySpecifier](extract.md#extract.ts.typeOnlySpecifier)
    - fn [reactExportOf](../../src/extract/ts.ts#L696) (callee: Node, react: ReactBindings) → { name: string; local: string } | null <!-- internal -->
      <a id="extract.ts.reactExportOf"></a><br>The React export a callee names through a binding of the file (`memo`, `h`, `React.memo`), with the local it goes through. Shadowing is the caller's.
    - fn [typeKeyword](../../src/extract/ts.ts#L713) (node: Node) → boolean <!-- internal -->
      <a id="extract.ts.typeKeyword"></a><br>The `type` keyword of `import type` or `import { type name }` — an unnamed child, not an identifier.
    - fn [inlineTypesOnly](../../src/extract/ts.ts#L723) (list: Node, specifier: "import_specifier" | "export_specifier") → boolean <!-- internal -->
      <a id="extract.ts.inlineTypesOnly"></a><br>`{ type A, type B as C }` of an import or an `export … from`: at least one name, and every one of them `type`. Whether such a statement runs is the tsconfig's to say (`ImportFact.inlineTypeOnly`), so it stays a fact of the syntax here.
      - calls [extract.ts.typeKeyword](extract.md#extract.ts.typeKeyword)
    - fn [typeOnlySpecifier](../../src/extract/ts.ts#L730) (stmt: Node, local: string) → boolean <!-- internal -->
      <a id="extract.ts.typeOnlySpecifier"></a><br>`import { type memo as m }`: the specifier that binds `local` is type-only.
      - calls [extract.ts.typeKeyword](extract.md#extract.ts.typeKeyword)
    - fn [decl](../../src/extract/ts.ts#L745) (kind: DeclFact["kind"], name: string, node: Node, signature: string | null, exported: boolean, calls: CallFact[], types: TypeRefFact[], members: DeclFact[]) → DeclFact <!-- internal -->
      <a id="extract.ts.decl"></a><br>A declaration fact at `node`'s span, with its JSDoc and its fingerprint facts.
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.ts.docOf](extract.md#extract.ts.docOf), [extract.treesitter.fingerprintFacts](extract.md#extract.treesitter.fingerprintFacts)
    - fn [boundCall](../../src/extract/ts.ts#L757) (call: CallFact, bound: "parameter" | "local" | null) → CallFact <!-- internal -->
      <a id="extract.ts.boundCall"></a><br>The call, marked as made through a parameter or local binding when it is one.
    - fn [callFact](../../src/extract/ts.ts#L762) (callee: string, node: Node) → CallFact <!-- internal -->
      <a id="extract.ts.callFact"></a><br>A call fact named `callee` at `node`'s span.
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located)
    - fn [opaqueCall](../../src/extract/ts.ts#L769) (node: Node) → CallFact <!-- internal -->
      <a id="extract.ts.opaqueCall"></a><br>A call through an expression keylang does not name: a hole with the source text.
      - calls [extract.ts.collapse](extract.md#extract.ts.collapse), [extract.ts.callFact](extract.md#extract.ts.callFact)
    - fn [calleeOfCall](../../src/extract/ts.ts#L783) (node: Node, body: Node, cls: ClassScope | null) → CallFact | null <!-- internal -->
      <a id="extract.ts.calleeOfCall"></a><br>The fact of one call or `new` from its callee node. Null only for a call keylang records another way: `require()` and `import()` (imports), `import.meta.resolve()` (an import), a function literal called in place (the calls of its body are read where they are), a class…
      - calls [extract.ts.unwrapValue](extract.md#extract.ts.unwrapValue), [extract.ts.parentOf](extract.md#extract.ts.parentOf), [extract.ts.requireKind](extract.md#extract.ts.requireKind), [extract.ts.boundCall](extract.md#extract.ts.boundCall), [extract.ts.callFact](extract.md#extract.ts.callFact), [extract.ts.bindingOf](extract.md#extract.ts.bindingOf), [extract.ts.localHook](extract.md#extract.ts.localHook), [extract.ts.calleeFact](extract.md#extract.ts.calleeFact), [extract.ts.opaqueCall](extract.md#extract.ts.opaqueCall)
    - fn [componentOfTag](../../src/extract/ts.ts#L836) (name: Node, body: Node, cls: ClassScope | null) → CallFact | null <!-- internal -->
      <a id="extract.ts.componentOfTag"></a><br>The call a JSX tag makes, from its name node: `<Cart />` calls `Cart`, `<Cart.Item />` calls `Cart.Item`, as the call expressions would. Null when the tag is not a component: an intrinsic element (`<div />`, `<my-button />`: a lowercase first letter), a namespace name…
      - calls [extract.ts.calleeFact](extract.md#extract.ts.calleeFact), [extract.ts.collapse](extract.md#extract.ts.collapse), [extract.ts.callFact](extract.md#extract.ts.callFact), [extract.ts.opaqueCall](extract.md#extract.ts.opaqueCall)
    - fn [componentOfFactory](../../src/extract/ts.ts#L871) (call: Node, calleeNode: Node, body: Node, cls: ClassScope | null, react: ReactBindings) → CallFact | null <!-- internal -->
      <a id="extract.ts.componentOfFactory"></a><br>The component call hidden in a React factory: `createElement(Cart)`, `jsx(Cart)`, `jsxs(Cart.Item)`, `jsxDEV(Cart)` are the call `<Cart />` would be, when the callee is bound by an import from `react`, `react/jsx-runtime` or `react/jsx-dev-runtime` (`h` for `createElement as…
      - calls [extract.ts.factoryCallee](extract.md#extract.ts.factoryCallee), [extract.ts.componentOfTag](extract.md#extract.ts.componentOfTag), [extract.ts.unwrapValue](extract.md#extract.ts.unwrapValue)
    - fn [factoryCallee](../../src/extract/ts.ts#L879) (node: Node, body: Node, react: ReactBindings) → boolean <!-- internal -->
      <a id="extract.ts.factoryCallee"></a><br>The callee node is a React factory binding, and nothing between here and the body shadows it.
      - calls [extract.ts.unwrapValue](extract.md#extract.ts.unwrapValue), [extract.ts.reactExportOf](extract.md#extract.ts.reactExportOf), [extract.ts.bindingOf](extract.md#extract.ts.bindingOf)
    - fn [requireKind](../../src/extract/ts.ts#L894) (node: Node) → "global" | "created" | "shadowed" <!-- internal -->
      <a id="extract.ts.requireKind"></a><br>What a `require` identifier is: Node's (`global`), one made by `createRequire(…)` (`created`), which also loads modules, or a parameter or local of another value (`shadowed`), whose call is not an import.
      - calls [extract.ts.declarationOf](extract.md#extract.ts.declarationOf), [extract.ts.unwrapValue](extract.md#extract.ts.unwrapValue)
    - fn [importAt](../../src/extract/ts.ts#L909) (node: Node, source: string, bindings: ImportBinding[], reexport: boolean) → ImportFact <!-- internal -->
      <a id="extract.ts.importAt"></a><br>An import fact of `source` at `node`'s span, with the statement's text as written.
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located)
    - fn [nestedDeclaration](../../src/extract/ts.ts#L923) (node: Node) → boolean <!-- internal -->
      <a id="extract.ts.nestedDeclaration"></a><br>A declaration of its own below the one whose type names are collected. A method signature is one in a class body (an overload of a member); in an interface or an object type (`{ save(o: Order): void }`) it is part of that type.
    - fn [lineDeeperThan](../../src/extract/ts.ts#L928) (root: Node, limit: number) → number | null <!-- internal -->
      <a id="extract.ts.lineDeeperThan"></a><br>1-based line of the first node nested deeper than `limit` below `root`; null when none is.
    - fn [walkNamed](../../src/extract/ts.ts#L957) (root: Node, enter: (node: Node) => boolean | void) → void <!-- internal -->
      <a id="extract.ts.walkNamed"></a><br>Pre-order walk over named nodes with an explicit stack: an expression nested thousands deep must not overflow the call stack. `enter` returns false to skip the node's subtree.
    - fn [collectTypeRefs](../../src/extract/ts.ts#L982) (node: Node, bound: ReadonlySet<string> = NO_NAMES) → TypeRefFact[] <!-- internal -->
      <a id="extract.ts.collectTypeRefs"></a><br>Type names used by `node`, excluding its own declared name, nested declarations and the names a generic binds in its scope: a type parameter (`<T>`), a mapped type's key (`[K in keyof T]`), an `infer U`. `bound`: the type parameters already in scope, a class's for its members.
      - calls [extract.ts.nestedDeclaration](extract.md#extract.ts.nestedDeclaration), [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.ts.typeNamesBound](extract.md#extract.ts.typeNamesBound)
    - fn [typeNamesBound](../../src/extract/ts.ts#L1022) (node: Node, bound: ReadonlySet<string>) → ReadonlySet<string> <!-- internal -->
      <a id="extract.ts.typeNamesBound"></a><br>`bound` and the type names `node` binds for its subtree: its type parameters, a mapped type's key, the `infer` names of a conditional type.
      - calls [extract.ts.walkNamed](extract.md#extract.ts.walkNamed)
    - fn [classDecl](../../src/extract/ts.ts#L1067) (name: string, cls: Node, at: Node, exported: boolean, declCalls: (n: Node, scope: ClassScope | null) => CallFact[], facts: FileFacts) → DeclFact <!-- internal -->
      <a id="extract.ts.classDecl"></a><br>Members of a class. Methods and function-valued fields (`handler = () => …`) are fns with their own calls and types.
      - calls [extract.ts.classScope](extract.md#extract.ts.classScope), [extract.ts.typeNamesBound](extract.md#extract.ts.typeNamesBound), [extract.ts.decoratorFact](extract.md#extract.ts.decoratorFact), [extract.ts.decoratorsOf](extract.md#extract.ts.decoratorsOf), [extract.ts.collectTypeRefs](extract.md#extract.ts.collectTypeRefs), [extract.ts.unsupported](extract.md#extract.ts.unsupported), [extract.ts.memberName](extract.md#extract.ts.memberName), [extract.ts.decl](extract.md#extract.ts.decl), [extract.ts.signature](extract.md#extract.ts.signature), [extract.ts.parameterDecorators](extract.md#extract.ts.parameterDecorators), [extract.ts.unwrapValue](extract.md#extract.ts.unwrapValue), [extract.ts.initializer](extract.md#extract.ts.initializer), [extract.ts.heritage](extract.md#extract.ts.heritage), [extract.treesitter.valuesFingerprint](extract.md#extract.treesitter.valuesFingerprint), [extract.ts.baseClass](extract.md#extract.ts.baseClass), [extract.ts.parentOf](extract.md#extract.ts.parentOf), [extract.ts.classField](extract.md#extract.ts.classField)
    - fn [typeShape](../../src/extract/ts.ts#L1206) (node: Node) → TypeFieldFact[] | undefined <!-- internal -->
      <a id="extract.ts.typeShape"></a><br>The shape of an interface (its body) or of a type alias whose value is an object type literal; undefined for an enum, any other alias and a body tree-sitter could not read. `planned type` fields are checked against it.
      - calls [extract.ts.signatureField](extract.md#extract.ts.signatureField)
    - fn [signatureField](../../src/extract/ts.ts#L1220) (m: Node) → TypeFieldFact | null <!-- internal -->
      <a id="extract.ts.signatureField"></a><br>One member of an interface or object type: `name?: T` from a property signature, `name?: (params) => R` from a method signature. Null for an index, call or construct signature, a quoted or computed name, and a member without a type annotation (a method without a return type).
      - calls [extract.ts.annotation](extract.md#extract.ts.annotation), [extract.ts.collapse](extract.md#extract.ts.collapse)
    - fn [classField](../../src/extract/ts.ts#L1244) (m: Node) → TypeFieldFact | null <!-- internal -->
      <a id="extract.ts.classField"></a><br>A public instance field of a class with a type annotation: not `static`, `private`, `protected` or `#private`, and not a field whose value is a function (that one is a method of the map). Null for anything else.
      - calls [extract.ts.unwrapValue](extract.md#extract.ts.unwrapValue), [extract.ts.annotation](extract.md#extract.ts.annotation)
    - fn [annotation](../../src/extract/ts.ts#L1260) (node: Node | null) → string | null <!-- internal -->
      <a id="extract.ts.annotation"></a><br>The type of a `: T` annotation node, whitespace collapsed; null without one.
      - calls [extract.ts.collapse](extract.md#extract.ts.collapse)
    - fn [decoratorsOf](../../src/extract/ts.ts#L1268) (node: Node) → CodeDecorator[] <!-- internal -->
      <a id="extract.ts.decoratorsOf"></a><br>The decorators that are children of a node: a class, an `export` statement, a member, a parameter.
      - calls [extract.ts.decoratorFact](extract.md#extract.ts.decoratorFact)
    - fn [parameterDecorators](../../src/extract/ts.ts#L1273) (ctor: Node) → CodeDecorator[] <!-- internal -->
      <a id="extract.ts.parameterDecorators"></a><br>`constructor(@Inject(T) private readonly x: I)`: each parameter's decorators, with its position, name and type.
      - calls [extract.ts.typeName](extract.md#extract.ts.typeName), [extract.ts.decoratorsOf](extract.md#extract.ts.decoratorsOf)
    - fn [decoratorFact](../../src/extract/ts.ts#L1286) (node: Node) → CodeDecorator | null <!-- internal -->
      <a id="extract.ts.decoratorFact"></a><br>`@Get(':id')` → `Get` with its arguments; `@Injectable` → no arguments. Null for a decorator that names nothing (`@(x)`).
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.ts.collapse](extract.md#extract.ts.collapse), [extract.ts.decoratorArg](extract.md#extract.ts.decoratorArg)
    - fn [decoratorArg](../../src/extract/ts.ts#L1301) (node: Node) → DecoratorArg <!-- internal -->
      <a id="extract.ts.decoratorArg"></a><br>A decorator argument as a value keylang reads without running code.
      - calls [extract.ts.unwrapValue](extract.md#extract.ts.unwrapValue), [extract.ts.stringValue](extract.md#extract.ts.stringValue), [extract.ts.templateValue](extract.md#extract.ts.templateValue), [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.ts.collapse](extract.md#extract.ts.collapse)
    - fn [templateValue](../../src/extract/ts.ts#L1347) (n: Node) → string | null <!-- internal -->
      <a id="extract.ts.templateValue"></a><br>A template literal without substitutions: its text; null otherwise.
    - fn [baseClass](../../src/extract/ts.ts#L1354) (heritage: Node) → string | null <!-- internal -->
      <a id="extract.ts.baseClass"></a><br>The `extends` expression: `(extends_clause value: …)` in TypeScript, the bare expression in JavaScript.
      - calls [extract.ts.collapse](extract.md#extract.ts.collapse)
    - fn [unwrapValue](../../src/extract/ts.ts#L1362) (node: Node) → Node
      <a id="extract.ts.unwrapValue"></a><br>`(f)`, `f as T`, `f satisfies T`, `f!`: the expression they wrap.
    - fn [reactWrapperFn](../../src/extract/ts.ts#L1385) (value: Node, react: ReactBindings) → Node | null <!-- internal -->
      <a id="extract.ts.reactWrapperFn"></a><br>The function a React wrapper call hides: `memo(() => …)` is the function it wraps when — and only when — the callee is bound by an import from `react` (the `names` / `objects` such an import binds; `React.memo` through a default or namespace import counts). By name alone a…
      - calls [extract.ts.reactExportOf](extract.md#extract.ts.reactExportOf), [extract.ts.unwrapValue](extract.md#extract.ts.unwrapValue)
    - fn [initializer](../../src/extract/ts.ts#L1398) (name: "constructor" | "static", items: { node: Node; calls: CallFact[] }[]) → DeclFact <!-- internal -->
      <a id="extract.ts.initializer"></a><br>A synthesized member over the initializers it runs, from the first to the last.
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.treesitter.fingerprintFacts](extract.md#extract.treesitter.fingerprintFacts)
    - fn [memberName](../../src/extract/ts.ts#L1414) (node: Node) → string <!-- internal -->
      <a id="extract.ts.memberName"></a><br>A member's name as code calls it: a string key unquoted, a `#private` name without its `#`.
      - calls [extract.ts.stringValue](extract.md#extract.ts.stringValue)
    - type [ClassScope](../../src/extract/ts.ts#L1421) <!-- internal -->
      <a id="extract.ts.ClassScope"></a><br>Where `this.<field>` values come from, for `this.decoder.feed()` and `this.run()`.
    - fn [classScope](../../src/extract/ts.ts#L1431) (items: readonly Node[]) → ClassScope <!-- internal -->
      <a id="extract.ts.classScope"></a><br>What the class body says about its fields: their classes, constructor hooks and the parameters that fill them.
      - calls [extract.ts.typeName](extract.md#extract.ts.typeName), [extract.ts.newClass](extract.md#extract.ts.newClass), [extract.ts.memberName](extract.md#extract.ts.memberName), [extract.ts.fallbackCallee](extract.md#extract.ts.fallbackCallee), [extract.ts.fallbackOf](extract.md#extract.ts.fallbackOf)
    - fn [importStatement](../../src/extract/ts.ts#L1512) (node: Node) → ImportFact[] <!-- internal -->
      <a id="extract.ts.importStatement"></a><br>The import facts of one `import` statement: none when its source is not a plain string.
      - calls [extract.ts.stringValue](extract.md#extract.ts.stringValue), [extract.ts.importAt](extract.md#extract.ts.importAt), [extract.ts.typeKeyword](extract.md#extract.ts.typeKeyword), [extract.ts.inlineTypesOnly](extract.md#extract.ts.inlineTypesOnly)
    - fn [collectDynamicImports](../../src/extract/ts.ts#L1561) (root: Node, facts: FileFacts) → void <!-- internal -->
      <a id="extract.ts.collectDynamicImports"></a><br>Literal `import("…")` / `require("…")` anywhere in the file. A non-literal specifier is coverage, not an edge.
      - calls [extract.ts.importAt](extract.md#extract.ts.importAt), [extract.ts.walkNamed](extract.md#extract.ts.walkNamed), [extract.ts.moduleUrlSpecs](extract.md#extract.ts.moduleUrlSpecs), [extract.ts.unsupported](extract.md#extract.ts.unsupported), [extract.ts.isSuperModule](extract.md#extract.ts.isSuperModule), [extract.ts.requireKind](extract.md#extract.ts.requireKind), [extract.ts.stringValue](extract.md#extract.ts.stringValue), [extract.ts.inTypePosition](extract.md#extract.ts.inTypePosition)
    - fn [inTypePosition](../../src/extract/ts.ts#L1627) (node: Node) → boolean <!-- internal -->
      <a id="extract.ts.inTypePosition"></a><br>Whether an `import(…)` call is written where a type goes (`x: import("./a").A`, `typeof import("./a")`, `v as import("./a").T`): a type-only dependency, as `import type` is.
    - fn [collectUnsupported](../../src/extract/ts.ts#L1642) (root: Node, facts: FileFacts) → void <!-- internal -->
      <a id="extract.ts.collectUnsupported"></a><br>Namespace, `eval`, `new Function`, and a call through `obj[expr]` are coverage, not edges.
      - calls [extract.ts.walkNamed](extract.md#extract.ts.walkNamed), [extract.ts.parentOf](extract.md#extract.ts.parentOf), [extract.ts.unsupported](extract.md#extract.ts.unsupported), [extract.ts.unwrapValue](extract.md#extract.ts.unwrapValue)
    - fn [unsupported](../../src/extract/ts.ts#L1660) (node: Node, reason: string) → UnsupportedFact <!-- internal -->
      <a id="extract.ts.unsupported"></a><br>An unsupported-construct fact at `node`'s span, with its text and the reason.
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located)
    - fn [calleeFact](../../src/extract/ts.ts#L1671) (n: Node, stop: Node, cls: ClassScope | null) → CallFact | null <!-- internal -->
      <a id="extract.ts.calleeFact"></a><br>The callee of a call or a function value in an argument: `f`, `a.b`, `this.m`, or `this.field.m` when the field's class is known. Null for any other shape.
      - calls [extract.ts.boundCall](extract.md#extract.ts.boundCall), [extract.ts.callFact](extract.md#extract.ts.callFact), [extract.ts.bindingOf](extract.md#extract.ts.bindingOf), [extract.ts.classThis](extract.md#extract.ts.classThis), [extract.ts.memberName](extract.md#extract.ts.memberName), [extract.ts.localClass](extract.md#extract.ts.localClass), [extract.ts.newClass](extract.md#extract.ts.newClass), [extract.ts.unwrapValue](extract.md#extract.ts.unwrapValue), [extract.ts.collapse](extract.md#extract.ts.collapse)
    - fn [classThis](../../src/extract/ts.ts#L1732) (n: Node) → boolean <!-- internal -->
      <a id="extract.ts.classThis"></a><br>`this` at `n` is the class instance: the nearest enclosing non-arrow function is a class member, or a field initializer or `static {}` holds it.
      - calls [extract.ts.parentOf](extract.md#extract.ts.parentOf)
    - fn [passesOf](../../src/extract/ts.ts#L1749) (call: Node, stop: Node, cls: ClassScope | null) → PassFact[] <!-- internal -->
      <a id="extract.ts.passesOf"></a><br>Function values in the arguments: the argument itself (`run(save)`, `run(this.m)`, `run(obj.m)` with the class of `obj` known, `run(this.m.bind(this))`) or a property of an object literal. A closure literal is not a pass: its calls carry `closureArg`.
      - calls [extract.ts.calleeFact](extract.md#extract.ts.calleeFact), [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.ts.collapse](extract.md#extract.ts.collapse), [extract.ts.memberName](extract.md#extract.ts.memberName)
    - fn [markClosure](../../src/extract/ts.ts#L1804) (fact: CallFact, n: Node, stop: Node) → void <!-- internal -->
      <a id="extract.ts.markClosure"></a><br>A call inside a function nested in the declaration `stop` gets `closure`; when every such function is a closure literal written as an argument of a call (`items.map(() => hit())`, `new Promise((ok) => hit())`), also `closureArg` at the outermost one. A closure stored in a…
      - calls [extract.ts.parentOf](extract.md#extract.ts.parentOf), [extract.treesitter.startCol](extract.md#extract.treesitter.startCol)
    - fn [typeName](../../src/extract/ts.ts#L1823) (annotation: Node | null) → string | null <!-- internal -->
      <a id="extract.ts.typeName"></a><br>`: X` → `X`; generics, unions and qualified names are not a class the graph can resolve.
    - fn [newClass](../../src/extract/ts.ts#L1830) (value: Node | null) → string | null <!-- internal -->
      <a id="extract.ts.newClass"></a><br>`new X(…)` → `X`.
    - type [Declaration](../../src/extract/ts.ts#L1837) <!-- internal -->
      <a id="extract.ts.Declaration"></a><br>What binds a name in scope: a declarator, a parameter (with its function and position), or another kind of binding.
    - fn [declarationOf](../../src/extract/ts.ts#L1844) (from: Node, name: string, stop: Node) → Declaration | null <!-- internal -->
      <a id="extract.ts.declarationOf"></a><br>The nearest binding of `name` between `from` and `stop`, in the scopes `bindingOf` walks: a declarator or a parameter; `other` for a loop or `catch` variable, a nested function or class name. Null when nothing binds it.
      - calls [extract.ts.parentOf](extract.md#extract.ts.parentOf), [extract.ts.patternNames](extract.md#extract.ts.patternNames), [extract.ts.blockStatements](extract.md#extract.ts.blockStatements), [extract.ts.declaredNames](extract.md#extract.ts.declaredNames)
    - fn [localClass](../../src/extract/ts.ts#L1908) (from: Node, name: string, stop: Node) → string | null <!-- internal -->
      <a id="extract.ts.localClass"></a><br>Class of a local or parameter: `const w = new X()`, `const w: X = …`, `(w: X) =>`. Null when a nearer binding (a loop variable) hides the declaration, or when `X` itself is rebound between the declaration and `stop` (`const X = Ctor`).
      - calls [extract.ts.declarationOf](extract.md#extract.ts.declarationOf), [extract.ts.typeName](extract.md#extract.ts.typeName), [extract.ts.newClass](extract.md#extract.ts.newClass), [extract.ts.bindingOf](extract.md#extract.ts.bindingOf)
    - fn [fallbackOf](../../src/extract/ts.ts#L1923) (expr: Node, stop: Node) → { source: Node; fallback: string } | null <!-- internal -->
      <a id="extract.ts.fallbackOf"></a><br>`x ?? f` / `x || f` with a callee `f`: the value `x` and the default.
      - calls [extract.ts.fallbackCallee](extract.md#extract.ts.fallbackCallee)
    - fn [fallbackCallee](../../src/extract/ts.ts#L1936) (node: Node, stop: Node) → string | null <!-- internal -->
      <a id="extract.ts.fallbackCallee"></a><br>A default that names a declaration: an unbound `f`, `mod.f`, or `this.m`.
      - calls [extract.ts.bindingOf](extract.md#extract.ts.bindingOf)
    - fn [localHook](../../src/extract/ts.ts#L1956) (from: Node, name: string, stop: Node) → HookFact | null <!-- internal -->
      <a id="extract.ts.localHook"></a><br>The hook behind a call of a local or parameter `name`: `const g = request.generate ?? generateMap`, `const { g = f } = request`, `function run(g = f)`, `function run({ g = f })`. Injection is known only for a parameter of the declaration itself.
      - calls [extract.ts.declarationOf](extract.md#extract.ts.declarationOf), [extract.ts.defaultIn](extract.md#extract.ts.defaultIn), [extract.ts.fallbackCallee](extract.md#extract.ts.fallbackCallee), [extract.ts.fallbackOf](extract.md#extract.ts.fallbackOf), [extract.ts.plainParameter](extract.md#extract.ts.plainParameter)
    - fn [plainParameter](../../src/extract/ts.ts#L2009) (node: Node) → boolean <!-- internal -->
      <a id="extract.ts.plainParameter"></a><br>The parameter is a plain name (`p`, `p: T`, `p = d`), not a destructuring pattern.
    - fn [defaultIn](../../src/extract/ts.ts#L2018) (node: Node, name: string, path: string) → { value: Node; path: string } | null <!-- internal -->
      <a id="extract.ts.defaultIn"></a><br>The default value of `name` in a parameter or pattern, with its property path.
      - calls [extract.ts.memberName](extract.md#extract.ts.memberName)
    - fn [collectValueRefs](../../src/extract/ts.ts#L2070) (root: Node, facts: FileFacts) → void <!-- internal -->
      <a id="extract.ts.collectValueRefs"></a><br>Names read as values: identifiers outside callee and binding positions, shorthand properties, and member names read without a call. The first position of each name in the file.
      - calls [extract.treesitter.startCol](extract.md#extract.treesitter.startCol), [extract.ts.walkNamed](extract.md#extract.ts.walkNamed), [extract.ts.parentOf](extract.md#extract.ts.parentOf), [extract.ts.bindsOrCalls](extract.md#extract.ts.bindsOrCalls), [extract.ts.exportedValue](extract.md#extract.ts.exportedValue), [extract.ts.memberObject](extract.md#extract.ts.memberObject), [extract.ts.bindingOf](extract.md#extract.ts.bindingOf), [extract.ts.calledMember](extract.md#extract.ts.calledMember), [extract.ts.moduleSource](extract.md#extract.ts.moduleSource), [extract.ts.memberName](extract.md#extract.ts.memberName)
    - fn [memberObject](../../src/extract/ts.ts#L2119) (node: Node, parent: Node | null, facts: FileFacts) → boolean <!-- internal -->
      <a id="extract.ts.memberObject"></a><br>The identifier is the object of a member access that uses only a member of it: `ns.helper()`, `new ns.X()`, and any `mod.x` of a module binding (the read is `mod.x`, noted on its own). `.call`, `.apply` and `.bind` use the function itself, so they read it.
      - calls [extract.ts.calledMember](extract.md#extract.ts.calledMember), [extract.ts.moduleSource](extract.md#extract.ts.moduleSource)
    - fn [calledMember](../../src/extract/ts.ts#L2129) (member: Node) → boolean <!-- internal -->
      <a id="extract.ts.calledMember"></a><br>The member expression is what a call or `new` runs: `a.b()`, `new a.B()`.
      - calls [extract.ts.parentOf](extract.md#extract.ts.parentOf)
    - fn [exportedValue](../../src/extract/ts.ts#L2140) (node: Node) → boolean <!-- internal -->
      <a id="extract.ts.exportedValue"></a><br>A name the module exports as a value: `export default handler`, `export = handler`, `module.exports = handler` or `= { handler }`, `exports.run = run`. Importers that call it are resolved callers, as for `export { handler }`.
      - calls [extract.ts.parentOf](extract.md#extract.ts.parentOf)
    - fn [bindsOrCalls](../../src/extract/ts.ts#L2171) (node: Node, parent: Node) → boolean <!-- internal -->
      <a id="extract.ts.bindsOrCalls"></a><br>The identifier is a callee, a declared name, or a binding — not a value read.
    - fn [stringsOf](../../src/extract/ts.ts#L2198) (node: Node) → string[] | null <!-- internal -->
      <a id="extract.ts.stringsOf"></a><br>Strings an expression can evaluate to: a literal, a ternary of literals, a `const` bound to one.
      - calls [extract.ts.stringValue](extract.md#extract.ts.stringValue), [extract.ts.declarationOf](extract.md#extract.ts.declarationOf), [extract.ts.parentOf](extract.md#extract.ts.parentOf)
    - fn [isImportMetaUrl](../../src/extract/ts.ts#L2229) (node: Node | undefined) → boolean <!-- internal -->
      <a id="extract.ts.isImportMetaUrl"></a><br>The node is `import.meta.url`, whatever the spacing.
    - fn [moduleUrlSpecs](../../src/extract/ts.ts#L2242) (node: Node) → { spec: string; optional: boolean }[] | null <!-- internal -->
      <a id="extract.ts.moduleUrlSpecs"></a><br>Module files named relative to this module: `new URL("./worker.ts", import.meta.url)` (a `Worker`, a loader) and `register(spec, import.meta.url | { parentURL: import.meta.url })`. Null when the specifier is not a string the syntax fixes: a module edge may be hidden there.
      - calls [extract.ts.isImportMetaUrl](extract.md#extract.ts.isImportMetaUrl), [extract.ts.stringsOf](extract.md#extract.ts.stringsOf), [extract.ts.staticSuffix](extract.md#extract.ts.staticSuffix), [extract.ts.extensionless](extract.md#extract.ts.extensionless)
    - fn [extensionless](../../src/extract/ts.ts#L2267) (spec: string) → boolean <!-- internal -->
      <a id="extract.ts.extensionless"></a><br>`./worker`, `../lib/job`: a path whose last segment has no extension (not a directory `./dir/`, not `.` or `..`).
    - fn [staticSuffix](../../src/extract/ts.ts#L2277) (node: Node) → string <!-- internal -->
      <a id="extract.ts.staticSuffix"></a><br>The literal end of a computed string: the tail of a template, the last operand of `+`.
      - calls [extract.ts.stringValue](extract.md#extract.ts.stringValue)
    - fn [bindingOf](../../src/extract/ts.ts#L2309) (call: Node, name: string, stop: Node) → "parameter" | "local" | null <!-- internal -->
      <a id="extract.ts.bindingOf"></a><br>Where the head identifier of a call is bound between the call and `stop` (the declaration being extracted): a parameter, a local, a destructured name, a nested function or class, a loop or catch variable. Such a call does not name the module-level symbol of the same name.
      - calls [extract.ts.parentOf](extract.md#extract.ts.parentOf), [extract.ts.patternNames](extract.md#extract.ts.patternNames), [extract.ts.blockDeclares](extract.md#extract.ts.blockDeclares), [extract.ts.declaredNames](extract.md#extract.ts.declaredNames)
    - fn [blockStatements](../../src/extract/ts.ts#L2354) (block: Node) → Node[] <!-- internal -->
      <a id="extract.ts.blockStatements"></a><br>The statements of a block. A `switch` is one block: a `const` or `function` of one case is in scope in every case.
    - fn [blockDeclares](../../src/extract/ts.ts#L2361) (block: Node, name: string) → boolean <!-- internal -->
      <a id="extract.ts.blockDeclares"></a><br>Some statement of the block (or an `export` of one) declares `name`.
      - calls [extract.ts.blockStatements](extract.md#extract.ts.blockStatements), [extract.ts.declaredNames](extract.md#extract.ts.declaredNames)
    - fn [declaredNames](../../src/extract/ts.ts#L2374) (stmt: Node) → string[] <!-- internal -->
      <a id="extract.ts.declaredNames"></a><br>Names a statement declares: every name of its declarators, or a function's or class's name.
      - calls [extract.ts.patternNames](extract.md#extract.ts.patternNames)
    - fn [patternNames](../../src/extract/ts.ts#L2393) (node: Node) → string[] <!-- internal -->
      <a id="extract.ts.patternNames"></a><br>Every identifier bound by a parameter list or a destructuring pattern.
      - calls [extract.ts.declaredNames](extract.md#extract.ts.declaredNames)
    - fn [moduleSource](../../src/extract/ts.ts#L2434) (facts: FileFacts, local: string, orDefault = false) → string | null <!-- internal -->
      <a id="extract.ts.moduleSource"></a><br>Source of the import that bound `local` as a whole module (a namespace or `require`), if any; with `orDefault`, also as a default import, whose members the graph resolves on the default export.
    - fn [requireSource](../../src/extract/ts.ts#L2444) (value: Node, requires: ReturnType<typeof query>) → { source: string; namespace: boolean } | null <!-- internal -->
      <a id="extract.ts.requireSource"></a><br>`require("./x")`, `import("./x")`, `await import("./x")` as the whole value: the module a declarator binds. A `require` parameter or local is not Node's. `namespace`: `import()` gives the module's namespace object, `require()` its `module.exports`.
      - calls [extract.ts.parentOf](extract.md#extract.ts.parentOf), [extract.ts.requireKind](extract.md#extract.ts.requireKind)
    - fn [isSuperModule](../../src/extract/ts.ts#L2474) (node: Node) → boolean <!-- internal -->
      <a id="extract.ts.isSuperModule"></a><br>The node is `module.superModule`, whatever the spacing.
    - fn [superModuleSource](../../src/extract/ts.ts#L2479) (value: Node) → { source: string; namespace: boolean } | null <!-- internal -->
      <a id="extract.ts.superModuleSource"></a><br>`const base = module.superModule`: the whole module of the next cartridge, as `require` binds one.
      - calls [extract.ts.isSuperModule](extract.md#extract.ts.isSuperModule)
    - fn [commonJsExports](../../src/extract/ts.ts#L2489) (stmt: Node, facts: FileFacts, declCalls: (n: Node) => CallFact[]) → void <!-- internal -->
      <a id="extract.ts.commonJsExports"></a><br>`module.exports = {…}`, `module.exports = f`, `exports.x = …`. A function value assigned there is a fn of the module, like `export const x = () => …`: `exports.run = function () {}` and `module.exports = { go() {} }` declare `run` and `go`; `module.exports = function () {}`…
      - calls [extract.ts.unwrapValue](extract.md#extract.ts.unwrapValue), [extract.ts.decl](extract.md#extract.ts.decl), [extract.ts.signature](extract.md#extract.ts.signature), [extract.ts.collectTypeRefs](extract.md#extract.ts.collectTypeRefs)
    - fn [stringValue](../../src/extract/ts.ts#L2560) (n: Node) → string | null <!-- internal -->
      <a id="extract.ts.stringValue"></a><br>The text of a string literal without its quotes: its first fragment only, so an escape sequence ends it. `""` for an empty string, null for any other node.
    - fn [collectRouteEntries](../../src/extract/ts.ts#L2581) (root: Node, facts: FileFacts) → void <!-- internal -->
      <a id="extract.ts.collectRouteEntries"></a><br>`app.get('/x', h)`, `router.post('/x', auth, h)`: a handler registered on a literal path — a `route` entry labelled `GET /x` whose callee is the last argument when it is a name (`h`, `handlers.save`). A computed path, or a handler written in place, is not recorded: nothing in…
      - calls [extract.ts.stringValue](extract.md#extract.ts.stringValue), [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.ts.collapse](extract.md#extract.ts.collapse), [extract.ts.parentOf](extract.md#extract.ts.parentOf), [extract.ts.pageOf](extract.md#extract.ts.pageOf), [extract.ts.lazyImports](extract.md#extract.ts.lazyImports)
    - fn [collectWebFacts](../../src/extract/ts.ts#L2644) (root: Node, facts: FileFacts) → void <!-- internal -->
      <a id="extract.ts.collectWebFacts"></a><br>What the web adapters (Express, Fastify, Next.js) read (`FileFacts.web`): registration calls on a named receiver with their arguments, the values the top level creates by a call, `'use server'` directives and an exported `config`. Nothing is resolved here: the adapter follows…
      - calls [extract.ts.unwrapValue](extract.md#extract.ts.unwrapValue), [extract.ts.decoratorArg](extract.md#extract.ts.decoratorArg), [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.ts.directives](extract.md#extract.ts.directives), [extract.ts.walkNamed](extract.md#extract.ts.walkNamed), [extract.ts.functionName](extract.md#extract.ts.functionName), [extract.ts.parentOf](extract.md#extract.ts.parentOf), [extract.ts.firstParameter](extract.md#extract.ts.firstParameter)
    - fn [directives](../../src/extract/ts.ts#L2761) (block: Node) → string[] <!-- internal -->
      <a id="extract.ts.directives"></a><br>The string directives (`'use server'`, `'use strict'`) at the start of a program or a function body.
      - calls [extract.ts.stringValue](extract.md#extract.ts.stringValue)
    - fn [firstParameter](../../src/extract/ts.ts#L2778) (fn: Node) → string | null <!-- internal -->
      <a id="extract.ts.firstParameter"></a><br>A function's first parameter when it is a plain name.
    - type [FunctionName](../../src/extract/ts.ts#L2793) <!-- internal -->
      <a id="extract.ts.FunctionName"></a><br>A function's name, if any, and whether it is declared at the top level of the module.
    - fn [functionName](../../src/extract/ts.ts#L2799) (fn: Node) → FunctionName <!-- internal -->
      <a id="extract.ts.functionName"></a><br>A function's name — its own, its declarator's, `default` for an anonymous default export — and whether it is a top-level declaration.
      - calls [extract.ts.parentOf](extract.md#extract.ts.parentOf)
    - fn [lazyImports](../../src/extract/ts.ts#L2828) (root: Node) → Map<string, string> <!-- internal -->
      <a id="extract.ts.lazyImports"></a><br>`const Cart = loadable(() => import('./pages/cart'))` (or `lazy`, `React.lazy`) at the top level: name → specifier.
      - calls [extract.ts.unwrapValue](extract.md#extract.ts.unwrapValue), [extract.ts.stringValue](extract.md#extract.ts.stringValue)
    - fn [pageOf](../../src/extract/ts.ts#L2859) (node: Node, lazy: ReadonlyMap<string, string>) → EntryFact | null <!-- internal -->
      <a id="extract.ts.pageOf"></a><br>A route object with a literal `path` and a named `component`; null for any other object.
      - calls [extract.ts.stringValue](extract.md#extract.ts.stringValue), [extract.ts.unwrapValue](extract.md#extract.ts.unwrapValue), [extract.ts.templateValue](extract.md#extract.ts.templateValue), [extract.ts.collapse](extract.md#extract.ts.collapse), [extract.treesitter.located](extract.md#extract.treesitter.located)
    - fn [signature](../../src/extract/ts.ts#L2888) (fn: Node) → string <!-- internal -->
      <a id="extract.ts.signature"></a><br>A function's signature as written: its parameters (parenthesized for `x =>`), then `→` and the return type.
      - calls [extract.ts.collapse](extract.md#extract.ts.collapse), [extract.ts.withoutParamDecorators](extract.md#extract.ts.withoutParamDecorators)
    - fn [withoutParamDecorators](../../src/extract/ts.ts#L2901) (params: Node) → string <!-- internal -->
      <a id="extract.ts.withoutParamDecorators"></a><br>`(@Body() body: Dto)` is `(body: Dto)`: a parameter decorator is framework wiring, not the signature a `planned fn` declares.
    - fn [typeSignature](../../src/extract/ts.ts#L2911) (n: Node) → string | null <!-- internal -->
      <a id="extract.ts.typeSignature"></a><br>A type's signature: `= <type>` for a short alias (60 characters at most), else its heritage.
      - calls [extract.ts.collapse](extract.md#extract.ts.collapse), [extract.ts.heritage](extract.md#extract.ts.heritage)
    - fn [heritage](../../src/extract/ts.ts#L2924) (n: Node) → string | null <!-- internal -->
      <a id="extract.ts.heritage"></a><br>A class or interface's `extends`/`implements` clause, whitespace collapsed.
      - calls [extract.ts.collapse](extract.md#extract.ts.collapse)
    - fn [collapse](../../src/extract/ts.ts#L2931) (s: string) → string <!-- internal -->
      <a id="extract.ts.collapse"></a><br>Whitespace runs collapsed to one space, trimmed.
    - fn [isNodeBuiltin](../../src/extract/ts.ts#L2936) (spec: string) → boolean
      <a id="extract.ts.isNodeBuiltin"></a><br>Is this specifier a Node built-in (`fs`, `node:fs`)?
