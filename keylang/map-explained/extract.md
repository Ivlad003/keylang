<!-- keylang:generated — не редагувати, `keylang map` -->

[README](README.md) · modules: [bodies](#extract.bodies) · [doc-comments](#extract.doc-comments) · [facts](#extract.facts) · [grammars](#extract.grammars) · [python](#extract.python) · [rust](#extract.rust) · [treesitter](#extract.treesitter) · [ts](#extract.ts)

# map

- extract
  <a id="extract"></a>
  - module [bodies](../../src/extract/bodies.ts#L1)
    <a id="extract.bodies"></a><br>Function bodies by declaration position, for trace instrumentation. Positions match the declaration ranges of `FileFacts` (1-based line/col of the declaring node); offsets index the JS string (UTF-16 code units).
    - treesitter [extract.treesitter](extract.md#extract.treesitter)
    - type [FunctionBody](../../src/extract/bodies.ts#L7)
      <a id="extract.bodies.FunctionBody"></a>
    - fn [functionBodies](../../src/extract/bodies.ts#L21) (path: string, src: string) → Promise<Map<string, FunctionBody>>
      <a id="extract.bodies.functionBodies"></a><br>`line:col` of each declaring node → the body of its function.
      - calls [extract.treesitter.withTree](extract.md#extract.treesitter.withTree), [extract.treesitter.grammarFor](extract.md#extract.treesitter.grammarFor), [extract.bodies.bodiesOf](extract.md#extract.bodies.bodiesOf)
    - fn [parsesCleanly](../../src/extract/bodies.ts#L26) (path: string, src: string) → Promise<boolean>
      <a id="extract.bodies.parsesCleanly"></a><br>The source parses without a syntax error: an instrumented copy is checked before it replaces the original.
      - calls [extract.treesitter.withTree](extract.md#extract.treesitter.withTree), [extract.treesitter.grammarFor](extract.md#extract.treesitter.grammarFor)
    - fn [bodiesOf](../../src/extract/bodies.ts#L30) (root: Node) → Map<string, FunctionBody> <!-- internal -->
      <a id="extract.bodies.bodiesOf"></a>
      - calls [extract.treesitter.startCol](extract.md#extract.treesitter.startCol)
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
      <a id="extract.facts.FileFacts"></a>
    - type [ImportFact](../../src/extract/facts.ts#L42)
      <a id="extract.facts.ImportFact"></a>
    - type [ImportBinding](../../src/extract/facts.ts#L63)
      <a id="extract.facts.ImportBinding"></a>
    - type [DeclKind](../../src/extract/facts.ts#L71) = "fn" | "class" | "type"
      <a id="extract.facts.DeclKind"></a>
    - type [DeclFact](../../src/extract/facts.ts#L73)
      <a id="extract.facts.DeclFact"></a>
    - type [CallFact](../../src/extract/facts.ts#L105)
      <a id="extract.facts.CallFact"></a>
    - type [HookFact](../../src/extract/facts.ts#L143)
      <a id="extract.facts.HookFact"></a><br>A callable chosen at run time with a default written next to it. `param` and `path` say where a caller injects the value: `analyze({ generate })` is parameter 0, path `generate`; `function f(run = defaultRun)` is parameter 0, path "".
    - type [PassFact](../../src/extract/facts.ts#L156)
      <a id="extract.facts.PassFact"></a><br>A function value in the arguments of a call: argument index, property path ("" for the argument itself).
    - type [ValueRefFact](../../src/extract/facts.ts#L164)
      <a id="extract.facts.ValueRefFact"></a>
    - type [TypeRefFact](../../src/extract/facts.ts#L174)
      <a id="extract.facts.TypeRefFact"></a><br>A type name in type position. `text` is the source fragment.
    - type [ExportRow](../../src/extract/facts.ts#L188)
      <a id="extract.facts.ExportRow"></a><br>One public name of a file, compared with the `exports` rule and followed by the graph to the symbol it stands for.
    - type [UnsupportedFact](../../src/extract/facts.ts#L218)
      <a id="extract.facts.UnsupportedFact"></a>
  - module [grammars](../../src/extract/grammars.ts#L1)
    <a id="extract.grammars"></a><br>The tree-sitter grammars keylang parses with. One list for the runtime (`treesitter.ts` loads them) and for packaging (`scripts/copy-wasm.mjs` copies each into dist/wasm), so a new language cannot be left out of the published package.
    - type [Grammar](../../src/extract/grammars.ts#L8) = (typeof GRAMMARS)[number]
      <a id="extract.grammars.Grammar"></a>
    - fn [wasmFile](../../src/extract/grammars.ts#L11) (g: Grammar) → string
      <a id="extract.grammars.wasmFile"></a><br>The grammar's file name in @vscode/tree-sitter-wasm and in dist/wasm.
  - module [python](../../src/extract/python.ts#L1)
    <a id="extract.python"></a><br>Python facts: `def`/`class`, imports, `__all__`, calls. Each imported name is one import whose specifier is the dotted path (`..pkg.mod.f`); the resolver decides how much of it is a module.
    - facts [extract.facts](extract.md#extract.facts)
    - doc-comments [extract.doc-comments](extract.md#extract.doc-comments)
    - treesitter [extract.treesitter](extract.md#extract.treesitter)
    - fn [extractPython](../../src/extract/python.ts#L23) (path: string, src: string) → Promise<FileFacts>
      <a id="extract.python.extractPython"></a>
      - calls [extract.treesitter.withTree](extract.md#extract.treesitter.withTree), [extract.python.extractTree](extract.md#extract.python.extractTree)
    - fn [extractTree](../../src/extract/python.ts#L27) (path: string, root: Node) → FileFacts <!-- internal -->
      <a id="extract.python.extractTree"></a>
      - calls [extract.python.collectTopLevel](extract.md#extract.python.collectTopLevel), [extract.python.dunderAll](extract.md#extract.python.dunderAll), [extract.python.importsIn](extract.md#extract.python.importsIn), [extract.python.fnDecl](extract.md#extract.python.fnDecl), [extract.python.noteDecorators](extract.md#extract.python.noteDecorators), [extract.python.classDecl](extract.md#extract.python.classDecl), [extract.python.exportRow](extract.md#extract.python.exportRow), [extract.python.moduleCalls](extract.md#extract.python.moduleCalls), [extract.python.valueRefs](extract.md#extract.python.valueRefs), [extract.python.collectDynamic](extract.md#extract.python.collectDynamic), [extract.python.docstring](extract.md#extract.python.docstring), [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.treesitter.errorLine](extract.md#extract.treesitter.errorLine)
    - fn [collectTopLevel](../../src/extract/python.ts#L80) (node: Node, out: Node[]) → void <!-- internal -->
      <a id="extract.python.collectTopLevel"></a><br>Top-level statements, including those under `if`/`try` at module level (`if TYPE_CHECKING:`, `try: import x`).
    - fn [dunderAll](../../src/extract/python.ts#L93) (topLevel: Node[]) → Set<string> | null <!-- internal -->
      <a id="extract.python.dunderAll"></a><br>The names of `__all__`: a literal list or tuple, extended by `+=`, `+`, `.extend([...])` and `.append("x")`; null without an `__all__`.
    - fn [exportRow](../../src/extract/python.ts#L121) (facts: FileFacts, name: string, kind: ExportRow["kind"]) → void <!-- internal -->
      <a id="extract.python.exportRow"></a>
    - fn [decorators](../../src/extract/python.ts#L127) (node: Node) → { name: string; node: Node }[] <!-- internal -->
      <a id="extract.python.decorators"></a>
    - fn [isAccessor](../../src/extract/python.ts#L135) (name: string) → boolean <!-- internal -->
      <a id="extract.python.isAccessor"></a><br>`@property`, `@x.setter`: the method runs on attribute access.
    - fn [noteDecorators](../../src/extract/python.ts#L145) (node: Node, symbol: string, member: boolean, facts: FileFacts) → void <!-- internal -->
      <a id="extract.python.noteDecorators"></a><br>A decorator keylang does not know may return another function: calls of the name may not reach the body (a hole of that declaration), and the decorator holds the function as a value, so code keylang cannot follow may call it (a framework calling a registered handler).
      - calls [extract.python.decorators](extract.md#extract.python.decorators), [extract.python.isAccessor](extract.md#extract.python.isAccessor), [extract.python.unsupported](extract.md#extract.python.unsupported), [extract.treesitter.located](extract.md#extract.treesitter.located)
    - fn [classDecl](../../src/extract/python.ts#L155) (def: Node, name: string, symbol: string, topLevel: boolean, facts: FileFacts) → DeclFact <!-- internal -->
      <a id="extract.python.classDecl"></a><br>A class and its members: methods, and nested classes with theirs. `symbol` is its dotted path in the file.
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.python.decorators](extract.md#extract.python.decorators), [extract.python.noteDecorators](extract.md#extract.python.noteDecorators), [extract.python.fnDecl](extract.md#extract.python.fnDecl), [extract.python.docstring](extract.md#extract.python.docstring), [extract.treesitter.fingerprint](extract.md#extract.treesitter.fingerprint)
    - type [Owner](../../src/extract/python.ts#L191) <!-- internal -->
      <a id="extract.python.Owner"></a><br>The class a method belongs to: its name, its static and class methods (for a top-level class), and whether the first parameter is the receiver.
    - fn [fnDecl](../../src/extract/python.ts#L197) (node: Node, name: string, owner: Owner | null) → DeclFact <!-- internal -->
      <a id="extract.python.fnDecl"></a>
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.python.bodyCalls](extract.md#extract.python.bodyCalls), [extract.python.boundNames](extract.md#extract.python.boundNames), [extract.python.docstring](extract.md#extract.python.docstring), [extract.treesitter.fingerprint](extract.md#extract.treesitter.fingerprint)
    - fn [docstring](../../src/extract/python.ts#L217) (body: Node | null) → string | undefined <!-- internal -->
      <a id="extract.python.docstring"></a><br>The docstring of a module, class or function body: its first statement when that is a lone string literal. An f-string, a bytes literal or concatenated strings are code, not documentation, and give none.
      - calls [extract.python.cleandoc](extract.md#extract.python.cleandoc), [extract.doc-comments.isLicense](extract.md#extract.doc-comments.isLicense), [extract.doc-comments.nonEmpty](extract.md#extract.doc-comments.nonEmpty)
    - fn [cleandoc](../../src/extract/python.ts#L228) (text: string) → string <!-- internal -->
      <a id="extract.python.cleandoc"></a><br>`inspect.cleandoc`: the first line stripped, the rest dedented by their common indentation.
    - fn [boundNames](../../src/extract/python.ts#L236) (fn: Node) → Map<string, "parameter" | "local"> <!-- internal -->
      <a id="extract.python.boundNames"></a><br>Parameter and assigned names in a function: a call through one of them is a call through a value.
    - type [CallScope](../../src/extract/python.ts#L261) <!-- internal -->
      <a id="extract.python.CallScope"></a>
    - fn [bodyCalls](../../src/extract/python.ts#L268) (body: Node, scope: CallScope) → CallFact[] <!-- internal -->
      <a id="extract.python.bodyCalls"></a>
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.python.callOf](extract.md#extract.python.callOf)
    - fn [callOf](../../src/extract/python.ts#L288) (fn: Node | null, scope: CallScope) → Pick<CallFact, "callee" | "bound"> <!-- internal -->
      <a id="extract.python.callOf"></a><br>`f()` → `f`; `a.b.f()` → `a.b.f`; `self.m()` → `this.m` (`Order.m` for a static method); `x.m()` through a value → `x.m`, bound. Any other callee (`super().m()`, `f().m()`, `x[0]()`) is a call through a value keylang cannot name, written as in the source.
    - fn [moduleCalls](../../src/extract/python.ts#L315) (root: Node) → CallFact[] <!-- internal -->
      <a id="extract.python.moduleCalls"></a><br>Calls outside every `def`: module level and class bodies run when the module loads; so does a decorator.
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.python.callOf](extract.md#extract.python.callOf)
    - fn [valueRefs](../../src/extract/python.ts#L339) (root: Node, names: ReadonlySet<string>) → ValueRefFact[] <!-- internal -->
      <a id="extract.python.valueRefs"></a><br>Functions read as values: `later(hit)`, `{"save": save}`, `callback=self.save`, `mod.save` without a call. Code holding the value may call it.
      - calls [extract.python.boundNames](extract.md#extract.python.boundNames), [extract.python.bindsOrCalls](extract.md#extract.python.bindsOrCalls), [extract.python.assigned](extract.md#extract.python.assigned)
    - fn [bindsOrCalls](../../src/extract/python.ts#L367) (node: Node, parent: Node) → boolean <!-- internal -->
      <a id="extract.python.bindsOrCalls"></a><br>The identifier is a callee, a declared name or a binding — not a value read.
      - calls [extract.python.assigned](extract.md#extract.python.assigned)
    - fn [assigned](../../src/extract/python.ts#L380) (node: Node, parent: Node) → boolean <!-- internal -->
      <a id="extract.python.assigned"></a><br>The node is the target of an assignment (`x = …`, `x += …`, `self.x = …`).
    - fn [collectDynamic](../../src/extract/python.ts#L389) (root: Node, facts: FileFacts) → void <!-- internal -->
      <a id="extract.python.collectDynamic"></a><br>`getattr(x, name)`, `importlib.import_module(name)`, `__import__(name)`, `exec`/`eval`: what they reach is decided at run time. A `getattr` in a `def` is a hole of that function's calls; the others may import anything.
      - calls [extract.python.enclosingFn](extract.md#extract.python.enclosingFn), [extract.python.unsupported](extract.md#extract.python.unsupported)
    - fn [isDeclarationLevel](../../src/extract/python.ts#L404) (node: Node) → boolean <!-- internal -->
      <a id="extract.python.isDeclarationLevel"></a><br>No `def` or `class` encloses the node: it is at the top of the module (possibly under `if`/`try`).
    - fn [enclosingFn](../../src/extract/python.ts#L414) (node: Node) → string | null <!-- internal -->
      <a id="extract.python.enclosingFn"></a><br>The indexed fn whose body holds the node, as a dotted path (`place`, `Order.save`, `Order.Line.price`); a `def` nested in a `def` belongs to the outer one. Null at module level and in a class body outside methods.
    - fn [importsIn](../../src/extract/python.ts#L436) (root: Node, reexported: (local: string | null) => boolean) → ImportFact[] <!-- internal -->
      <a id="extract.python.importsIn"></a><br>Every import of the file, in source order, wherever it is written. `import a.b as c` → `a.b` bound to `c`; `import a.b` → `a` bound to `a` plus `a.b` bound to the path `a.b`; `from .m import x` → `.m.x` bound to `x`. `reexported(local)`: the name (null for `*`) is part of this…
      - calls [extract.python.importsOf](extract.md#extract.python.importsOf)
    - fn [importsOf](../../src/extract/python.ts#L449) (node: Node, reexported: (local: string | null) => boolean) → ImportFact[] <!-- internal -->
      <a id="extract.python.importsOf"></a>
      - calls [extract.python.isDeclarationLevel](extract.md#extract.python.isDeclarationLevel), [extract.python.importAt](extract.md#extract.python.importAt)
    - fn [importAt](../../src/extract/python.ts#L493) (node: Node, source: string, bindings: ImportFact["bindings"], reexport: boolean) → ImportFact <!-- internal -->
      <a id="extract.python.importAt"></a>
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located)
    - fn [unsupported](../../src/extract/python.ts#L498) (node: Node, reason: string) → UnsupportedFact <!-- internal -->
      <a id="extract.python.unsupported"></a>
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located)
  - module [rust](../../src/extract/rust.ts#L1)
    <a id="extract.rust"></a><br>Rust facts: items, `impl` members, `use` trees, calls. A `use` leaf is one import whose specifier is the full path (`crate::domain::order::place`); the resolver decides how much of it is a module.
    - facts [extract.facts](extract.md#extract.facts)
    - doc-comments [extract.doc-comments](extract.md#extract.doc-comments)
    - treesitter [extract.treesitter](extract.md#extract.treesitter)
    - fn [extractRust](../../src/extract/rust.ts#L35) (path: string, src: string) → Promise<FileFacts>
      <a id="extract.rust.extractRust"></a>
      - calls [extract.treesitter.withTree](extract.md#extract.treesitter.withTree), [extract.rust.extractTree](extract.md#extract.rust.extractTree)
    - fn [extractTree](../../src/extract/rust.ts#L39) (path: string, root: Node) → FileFacts <!-- internal -->
      <a id="extract.rust.extractTree"></a>
      - calls [extract.rust.isTestAttribute](extract.md#extract.rust.isTestAttribute), [extract.rust.isComment](extract.md#extract.rust.isComment), [extract.rust.testOnly](extract.md#extract.rust.testOnly), [extract.rust.useLeaves](extract.md#extract.rust.useLeaves), [extract.rust.useImport](extract.md#extract.rust.useImport), [extract.rust.exported](extract.md#extract.rust.exported), [extract.rust.importAt](extract.md#extract.rust.importAt), [extract.rust.nestedUses](extract.md#extract.rust.nestedUses), [extract.rust.bodyCalls](extract.md#extract.rust.bodyCalls), [extract.rust.fnDecl](extract.md#extract.rust.fnDecl), [extract.rust.exportRow](extract.md#extract.rust.exportRow), [extract.rust.noteAttributes](extract.md#extract.rust.noteAttributes), [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.rust.itemDoc](extract.md#extract.rust.itemDoc), [extract.treesitter.fingerprint](extract.md#extract.treesitter.fingerprint), [extract.rust.members](extract.md#extract.rust.members), [extract.rust.baseType](extract.md#extract.rust.baseType), [extract.rust.unsupported](extract.md#extract.rust.unsupported), [extract.rust.macroName](extract.md#extract.rust.macroName), [extract.rust.valueRefs](extract.md#extract.rust.valueRefs), [extract.rust.moduleDoc](extract.md#extract.rust.moduleDoc), [extract.treesitter.errorLine](extract.md#extract.treesitter.errorLine)
    - fn [isComment](../../src/extract/rust.ts#L148) (node: Node) → boolean <!-- internal -->
      <a id="extract.rust.isComment"></a>
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
      - calls [extract.rust.docText](extract.md#extract.rust.docText)
    - fn [exported](../../src/extract/rust.ts#L187) (node: Node) → boolean <!-- internal -->
      <a id="extract.rust.exported"></a>
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
      <a id="extract.rust.splitTopLevel"></a>
    - fn [nestedUses](../../src/extract/rust.ts#L258) (node: Node, facts: FileFacts) → void <!-- internal -->
      <a id="extract.rust.nestedUses"></a><br>`use` declarations inside items (fn bodies, `impl` members), except inline modules, whose paths start elsewhere, and test code.
      - calls [extract.rust.testOnly](extract.md#extract.rust.testOnly), [extract.rust.useLeaves](extract.md#extract.rust.useLeaves), [extract.rust.useImport](extract.md#extract.rust.useImport)
    - fn [exportRow](../../src/extract/rust.ts#L268) (facts: FileFacts, name: string, kind: ExportRow["kind"]) → void <!-- internal -->
      <a id="extract.rust.exportRow"></a>
    - fn [baseType](../../src/extract/rust.ts#L274) (node: Node | null) → string | null <!-- internal -->
      <a id="extract.rust.baseType"></a><br>`Gen<T>` → `Gen`, `crate::a::S` → `S`; null for references, tuples and the like.
    - fn [takesSelf](../../src/extract/rust.ts#L283) (params: Node | null) → boolean <!-- internal -->
      <a id="extract.rust.takesSelf"></a><br>`&self`, `mut self`, `self: Box<Self>`: the fn is a method.
    - fn [fnDecl](../../src/extract/rust.ts#L287) (node: Node, name: string, exported: boolean, owner: string | null, names: ReadonlySet<string>, facts: FileFacts) → DeclFact <!-- internal -->
      <a id="extract.rust.fnDecl"></a>
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.rust.takesSelf](extract.md#extract.rust.takesSelf), [extract.rust.bodyCalls](extract.md#extract.rust.bodyCalls), [extract.rust.boundNames](extract.md#extract.rust.boundNames), [extract.rust.itemDoc](extract.md#extract.rust.itemDoc), [extract.treesitter.fingerprint](extract.md#extract.treesitter.fingerprint)
    - fn [boundNames](../../src/extract/rust.ts#L303) (fn: Node) → Map<string, "parameter" | "local"> <!-- internal -->
      <a id="extract.rust.boundNames"></a><br>Parameter and `let` names in a function: a call through one of them is a call through a value.
    - type [CallScope](../../src/extract/rust.ts#L323) <!-- internal -->
      <a id="extract.rust.CallScope"></a><br>Where a call is written: the `impl` type, whether the fn takes `self`, its bound names, and the file's item and import names.
    - fn [bodyCalls](../../src/extract/rust.ts#L332) (body: Node, scope: CallScope, facts: FileFacts) → CallFact[] <!-- internal -->
      <a id="extract.rust.bodyCalls"></a>
      - calls [extract.rust.callOf](extract.md#extract.rust.callOf), [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.rust.macroName](extract.md#extract.rust.macroName), [extract.rust.unsupported](extract.md#extract.rust.unsupported)
    - type [Callee](../../src/extract/rust.ts#L355) = Pick<CallFact, "callee" | "bound"> <!-- internal -->
      <a id="extract.rust.Callee"></a>
    - fn [callOf](../../src/extract/rust.ts#L367) (fn: Node | null, scope: CallScope, facts: FileFacts) → Callee | null <!-- internal -->
      <a id="extract.rust.callOf"></a><br>`f()` → `f`; `a::b::f()` → `a.b.f`; `Self::new()` → `<Type>.new`; `self.m()` → `this.m`; `x.m()` → `x.m` (through a value). A path that starts at `crate`, `super`, `self` or a lower-case name keylang does not know imports what it names: the call is an edge to that module's item.
      - calls [extract.rust.throughValue](extract.md#extract.rust.throughValue), [extract.rust.pathCall](extract.md#extract.rust.pathCall)
    - fn [pathCall](../../src/extract/rust.ts#L401) (fn: Node, scope: CallScope, facts: FileFacts) → Callee | null <!-- internal -->
      <a id="extract.rust.pathCall"></a><br>The callee of a path call or a path read as a value; null for a variant or tuple-struct constructor.
      - calls [extract.rust.pathSegments](extract.md#extract.rust.pathSegments), [extract.rust.compact](extract.md#extract.rust.compact), [extract.rust.throughValue](extract.md#extract.rust.throughValue), [extract.treesitter.located](extract.md#extract.treesitter.located)
    - fn [throughValue](../../src/extract/rust.ts#L433) (fn: Node) → Callee <!-- internal -->
      <a id="extract.rust.throughValue"></a><br>A call keylang cannot name, as written: a `dynamic-call` hole, never an edge.
      - calls [extract.rust.compact](extract.md#extract.rust.compact)
    - fn [compact](../../src/extract/rust.ts#L437) (text: string) → string <!-- internal -->
      <a id="extract.rust.compact"></a>
    - fn [pathSegments](../../src/extract/rust.ts#L442) (node: Node) → string[] | null <!-- internal -->
      <a id="extract.rust.pathSegments"></a><br>`a::b::c` → `["a", "b", "c"]`; null when a segment is not a plain name (`<T as X>::f`).
    - fn [valueRefs](../../src/extract/rust.ts#L458) (items: Node[], names: ReadonlySet<string>, facts: FileFacts) → ValueRefFact[] <!-- internal -->
      <a id="extract.rust.valueRefs"></a><br>Functions read as values: `later(hit)`, `.map(Order::total)`, `Handler { run: crate::a::go }`. Code holding the value may call it, so such a fn escapes.
      - calls [extract.rust.testOnly](extract.md#extract.rust.testOnly), [extract.rust.boundNames](extract.md#extract.rust.boundNames), [extract.rust.bindsOrCalls](extract.md#extract.rust.bindsOrCalls), [extract.rust.calledPath](extract.md#extract.rust.calledPath), [extract.rust.pathCall](extract.md#extract.rust.pathCall)
    - fn [calledPath](../../src/extract/rust.ts#L487) (node: Node) → boolean <!-- internal -->
      <a id="extract.rust.calledPath"></a><br>The path is the callee of a call, or a part of a longer path or a pattern: not a value read.
    - fn [bindsOrCalls](../../src/extract/rust.ts#L497) (node: Node) → boolean <!-- internal -->
      <a id="extract.rust.bindsOrCalls"></a><br>The identifier names what is declared, bound or called here, or is part of a path or pattern.
      - calls [extract.rust.calledPath](extract.md#extract.rust.calledPath)
    - type [UseLeaf](../../src/extract/rust.ts#L512) <!-- internal -->
      <a id="extract.rust.UseLeaf"></a>
    - fn [useLeaves](../../src/extract/rust.ts#L519) (node: Node | null, prefix: string[]) → UseLeaf[] <!-- internal -->
      <a id="extract.rust.useLeaves"></a><br>Flatten a `use` tree: `a::{b, c::d as e, f::*}` → `a::b`, `a::c::d` as `e`, `a::f::*`.
      - calls [extract.rust.pathSegments](extract.md#extract.rust.pathSegments)
    - fn [useImport](../../src/extract/rust.ts#L552) (node: Node, leaf: UseLeaf, exported: boolean, facts: FileFacts) → ImportFact <!-- internal -->
      <a id="extract.rust.useImport"></a>
      - calls [extract.rust.importAt](extract.md#extract.rust.importAt), [extract.rust.exportRow](extract.md#extract.rust.exportRow)
    - fn [importAt](../../src/extract/rust.ts#L564) (node: Node, source: string, bindings: ImportFact["bindings"], reexport: boolean) → ImportFact <!-- internal -->
      <a id="extract.rust.importAt"></a>
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located)
    - fn [macroName](../../src/extract/rust.ts#L569) (node: Node) → string <!-- internal -->
      <a id="extract.rust.macroName"></a>
    - fn [unsupported](../../src/extract/rust.ts#L573) (node: Node, reason: string) → UnsupportedFact <!-- internal -->
      <a id="extract.rust.unsupported"></a>
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located)
  - module [treesitter](../../src/extract/treesitter.ts#L1)
    <a id="extract.treesitter"></a><br>web-tree-sitter runtime with the grammar WASM files from @vscode/tree-sitter-wasm. Languages are loaded lazily and cached for the process.
    - node [external.node](external.md#external.node)
    - web-tree-sitter [external.web-tree-sitter](external.md#external.web-tree-sitter)
    - grammars [extract.grammars](extract.md#extract.grammars)
    - fn [wasmDir](../../src/extract/treesitter.ts#L28) () → string <!-- internal -->
      <a id="extract.treesitter.wasmDir"></a>
    - fn [loadLanguage](../../src/extract/treesitter.ts#L35) (g: Grammar) → Promise<Language>
      <a id="extract.treesitter.loadLanguage"></a>
      - calls [extract.treesitter.wasmDir](extract.md#extract.treesitter.wasmDir), [extract.grammars.wasmFile](extract.md#extract.grammars.wasmFile)
    - fn [withTree](../../src/extract/treesitter.ts#L49) (g: Grammar, src: string, use: (tree: Tree, language: Language) => T) → Promise<T>
      <a id="extract.treesitter.withTree"></a><br>Parse `src` and run `use` on the tree, which is freed afterwards: a tree lives in the WASM heap, so nothing `use` returns may hold a node.
      - calls [extract.treesitter.loadLanguage](extract.md#extract.treesitter.loadLanguage), [extract.treesitter.surrogatePairs](extract.md#extract.treesitter.surrogatePairs)
    - fn [query](../../src/extract/treesitter.ts#L69) (language: Language, g: Grammar, name: string, source: string) → Query
      <a id="extract.treesitter.query"></a><br>Compile a query once per (grammar, source).
    - fn [grammarFor](../../src/extract/treesitter.ts#L79) (path: string) → Grammar
      <a id="extract.treesitter.grammarFor"></a>
    - fn [located](../../src/extract/treesitter.ts#L88) (node: Node) → { line: number; col: number; endLine: number; endCol: number; text: string }
      <a id="extract.treesitter.located"></a><br>1-based range and text of a node; columns count code points, and `endCol` is the column after it.
      - calls [extract.treesitter.startCol](extract.md#extract.treesitter.startCol), [extract.treesitter.codePointColumn](extract.md#extract.treesitter.codePointColumn)
    - fn [startCol](../../src/extract/treesitter.ts#L99) (node: Node) → number
      <a id="extract.treesitter.startCol"></a><br>The node's 1-based start column in code points (§7), as `located` gives it.
      - calls [extract.treesitter.codePointColumn](extract.md#extract.treesitter.codePointColumn)
    - fn [codePointColumn](../../src/extract/treesitter.ts#L108) (tree: Tree, index: number, units: number) → number <!-- internal -->
      <a id="extract.treesitter.codePointColumn"></a><br>web-tree-sitter parses a JS string as UTF-16, so its columns and indices count code units. A surrogate pair between the line start and the point is one code point, and so one column.
      - calls [extract.treesitter.firstAtOrAfter](extract.md#extract.treesitter.firstAtOrAfter)
    - fn [surrogatePairs](../../src/extract/treesitter.ts#L114) (src: string) → number[] <!-- internal -->
      <a id="extract.treesitter.surrogatePairs"></a>
    - fn [firstAtOrAfter](../../src/extract/treesitter.ts#L121) (sorted: readonly number[], value: number) → number <!-- internal -->
      <a id="extract.treesitter.firstAtOrAfter"></a><br>Position of the first element `>= value` in an ascending array.
    - fn [errorLine](../../src/extract/treesitter.ts#L133) (node: Node) → number
      <a id="extract.treesitter.errorLine"></a><br>First syntax-error line, or the start of the tree when the grammar only sets `hasError`.
    - fn [fingerprint](../../src/extract/treesitter.ts#L148) (node: Node) → string
      <a id="extract.treesitter.fingerprint"></a><br>SHA-256 of the node's syntax: node types and token texts, without comments and whitespace. `>` → `>=` changes it; reformatting or editing a comment does not. Nesting is part of it, so moving a statement out of a block counts.
  - module [ts](../../src/extract/ts.ts#L1)
    <a id="extract.ts"></a><br>TypeScript / JavaScript facts: imports, declarations, exports, calls. A tree walk over the top level plus tree-sitter queries inside bodies.
    - node [external.node](external.md#external.node)
    - facts [extract.facts](extract.md#extract.facts)
    - doc-comments [extract.doc-comments](extract.md#extract.doc-comments)
    - treesitter [extract.treesitter](extract.md#extract.treesitter)
    - fn [extractTs](../../src/extract/ts.ts#L34) (path: string, src: string) → Promise<FileFacts>
      <a id="extract.ts.extractTs"></a>
      - calls [extract.treesitter.grammarFor](extract.md#extract.treesitter.grammarFor), [extract.treesitter.withTree](extract.md#extract.treesitter.withTree), [extract.ts.extractTree](extract.md#extract.ts.extractTree)
    - fn [parentOf](../../src/extract/ts.ts#L55) (node: Node) → Node | null <!-- internal -->
      <a id="extract.ts.parentOf"></a>
    - fn [parentIndex](../../src/extract/ts.ts#L59) (root: Node) → Map<number, Node> <!-- internal -->
      <a id="extract.ts.parentIndex"></a>
    - fn [extractTree](../../src/extract/ts.ts#L72) (path: string, root: Node, language: Language, g: Grammar) → FileFacts <!-- internal -->
      <a id="extract.ts.extractTree"></a>
      - calls [extract.ts.parentIndex](extract.md#extract.ts.parentIndex), [extract.ts.moduleHeader](extract.md#extract.ts.moduleHeader), [extract.ts.extractIndexed](extract.md#extract.ts.extractIndexed)
    - fn [docOf](../../src/extract/ts.ts#L100) (node: Node) → string | undefined <!-- internal -->
      <a id="extract.ts.docOf"></a><br>The declaration's JSDoc: the nearest `/** … *\/` right above it or above the statements that wrap it (`export`, `const x =`), with decorators and line comments between them allowed. A line comment is a note, not documentation; other code in between, the file's header and a…
      - calls [extract.doc-comments.isLicense](extract.md#extract.doc-comments.isLicense), [extract.doc-comments.nonEmpty](extract.md#extract.doc-comments.nonEmpty), [extract.doc-comments.jsdocDescription](extract.md#extract.doc-comments.jsdocDescription), [extract.doc-comments.blockCommentBody](extract.md#extract.doc-comments.blockCommentBody), [extract.ts.parentOf](extract.md#extract.ts.parentOf)
    - fn [moduleHeader](../../src/extract/ts.ts#L121) (root: Node) → { doc: string | null; nodes: Set<number> } <!-- internal -->
      <a id="extract.ts.moduleHeader"></a><br>The module's documentation: the first block of comments in the file (after `#!`; license notices, `/// <reference>` directives and blocks without text skipped), unless it sits right above the first statement that is not an import or a directive (`"use strict"`): then it…
      - calls [extract.doc-comments.isLicense](extract.md#extract.doc-comments.isLicense), [extract.doc-comments.nonEmpty](extract.md#extract.doc-comments.nonEmpty), [extract.doc-comments.jsdocDescription](extract.md#extract.doc-comments.jsdocDescription), [extract.doc-comments.lineCommentsBody](extract.md#extract.doc-comments.lineCommentsBody), [extract.doc-comments.blockCommentBody](extract.md#extract.doc-comments.blockCommentBody)
    - fn [extractIndexed](../../src/extract/ts.ts#L150) (path: string, root: Node, language: Language, g: Grammar) → FileFacts <!-- internal -->
      <a id="extract.ts.extractIndexed"></a>
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.ts.lineDeeperThan](extract.md#extract.ts.lineDeeperThan), [extract.treesitter.query](extract.md#extract.treesitter.query), [extract.ts.calleeOfCall](extract.md#extract.ts.calleeOfCall), [extract.ts.parentOf](extract.md#extract.ts.parentOf), [extract.ts.passesOf](extract.md#extract.ts.passesOf), [extract.ts.insideClosure](extract.md#extract.ts.insideClosure), [extract.ts.componentOfTag](extract.md#extract.ts.componentOfTag), [extract.ts.requireSource](extract.md#extract.ts.requireSource), [extract.ts.moduleSource](extract.md#extract.ts.moduleSource), [extract.ts.typeSignature](extract.md#extract.ts.typeSignature), [extract.ts.importStatement](extract.md#extract.ts.importStatement), [extract.ts.stringValue](extract.md#extract.ts.stringValue), [extract.ts.importAt](extract.md#extract.ts.importAt), [extract.ts.unwrapValue](extract.md#extract.ts.unwrapValue), [extract.ts.decl](extract.md#extract.ts.decl), [extract.ts.signature](extract.md#extract.ts.signature), [extract.ts.collectTypeRefs](extract.md#extract.ts.collectTypeRefs), [extract.ts.classDecl](extract.md#extract.ts.classDecl), [extract.ts.commonJsExports](extract.md#extract.ts.commonJsExports), [extract.ts.collectDynamicImports](extract.md#extract.ts.collectDynamicImports), [extract.ts.collectUnsupported](extract.md#extract.ts.collectUnsupported), [extract.ts.collectValueRefs](extract.md#extract.ts.collectValueRefs), [extract.treesitter.errorLine](extract.md#extract.treesitter.errorLine)
    - fn [decl](../../src/extract/ts.ts#L409) (kind: DeclFact["kind"], name: string, node: Node, signature: string | null, exported: boolean, calls: CallFact[], types: TypeRefFact[], members: DeclFact[]) → DeclFact <!-- internal -->
      <a id="extract.ts.decl"></a>
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.ts.docOf](extract.md#extract.ts.docOf), [extract.treesitter.fingerprint](extract.md#extract.treesitter.fingerprint)
    - fn [boundCall](../../src/extract/ts.ts#L415) (call: CallFact, bound: "parameter" | "local" | null) → CallFact <!-- internal -->
      <a id="extract.ts.boundCall"></a>
    - fn [callFact](../../src/extract/ts.ts#L419) (callee: string, node: Node) → CallFact <!-- internal -->
      <a id="extract.ts.callFact"></a>
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located)
    - fn [opaqueCall](../../src/extract/ts.ts#L425) (node: Node) → CallFact <!-- internal -->
      <a id="extract.ts.opaqueCall"></a><br>A call through an expression keylang does not name: a hole with the source text.
      - calls [extract.ts.collapse](extract.md#extract.ts.collapse), [extract.ts.callFact](extract.md#extract.ts.callFact)
    - fn [calleeOfCall](../../src/extract/ts.ts#L438) (node: Node, body: Node, cls: ClassScope | null) → CallFact | null <!-- internal -->
      <a id="extract.ts.calleeOfCall"></a><br>The fact of one call or `new` from its callee node. Null only for a call keylang records another way: `require()` and `import()` (imports), `import.meta.resolve()` (an import), a function literal called in place (the calls of its body are read where they are), a class…
      - calls [extract.ts.unwrapValue](extract.md#extract.ts.unwrapValue), [extract.ts.parentOf](extract.md#extract.ts.parentOf), [extract.ts.requireKind](extract.md#extract.ts.requireKind), [extract.ts.boundCall](extract.md#extract.ts.boundCall), [extract.ts.callFact](extract.md#extract.ts.callFact), [extract.ts.bindingOf](extract.md#extract.ts.bindingOf), [extract.ts.localHook](extract.md#extract.ts.localHook), [extract.ts.calleeFact](extract.md#extract.ts.calleeFact), [extract.ts.opaqueCall](extract.md#extract.ts.opaqueCall)
    - fn [componentOfTag](../../src/extract/ts.ts#L478) (name: Node, body: Node, cls: ClassScope | null) → CallFact | null <!-- internal -->
      <a id="extract.ts.componentOfTag"></a><br>The call a JSX tag makes, from its name node: `<Cart />` calls `Cart`, `<Cart.Item />` calls `Cart.Item`, as the call expressions would. Null when the tag is not a component: an intrinsic element (`<div />`, `<my-button />`: a lowercase first letter), a namespace name…
      - calls [extract.ts.calleeFact](extract.md#extract.ts.calleeFact), [extract.ts.collapse](extract.md#extract.ts.collapse), [extract.ts.callFact](extract.md#extract.ts.callFact), [extract.ts.opaqueCall](extract.md#extract.ts.opaqueCall)
    - fn [requireKind](../../src/extract/ts.ts#L496) (node: Node) → "global" | "created" | "shadowed" <!-- internal -->
      <a id="extract.ts.requireKind"></a><br>What a `require` identifier is: Node's (`global`), one made by `createRequire(…)` (`created`), which also loads modules, or a parameter or local of another value (`shadowed`), whose call is not an import.
      - calls [extract.ts.declarationOf](extract.md#extract.ts.declarationOf), [extract.ts.unwrapValue](extract.md#extract.ts.unwrapValue)
    - fn [importAt](../../src/extract/ts.ts#L506) (node: Node, source: string, bindings: ImportBinding[], reexport: boolean) → ImportFact <!-- internal -->
      <a id="extract.ts.importAt"></a>
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located)
    - fn [lineDeeperThan](../../src/extract/ts.ts#L514) (root: Node, limit: number) → number | null <!-- internal -->
      <a id="extract.ts.lineDeeperThan"></a><br>1-based line of the first node nested deeper than `limit` below `root`; null when none is.
    - fn [walkNamed](../../src/extract/ts.ts#L538) (root: Node, enter: (node: Node) => boolean | void) → void <!-- internal -->
      <a id="extract.ts.walkNamed"></a><br>Pre-order walk over named nodes with an explicit stack: an expression nested thousands deep must not overflow the call stack. `enter` returns false to skip the node's subtree.
    - fn [collectTypeRefs](../../src/extract/ts.ts#L551) (node: Node) → TypeRefFact[] <!-- internal -->
      <a id="extract.ts.collectTypeRefs"></a><br>Type names used by `node`, excluding its own declared name and nested declarations.
      - calls [extract.ts.walkNamed](extract.md#extract.ts.walkNamed), [extract.treesitter.located](extract.md#extract.treesitter.located)
    - fn [classDecl](../../src/extract/ts.ts#L579) (name: string, cls: Node, at: Node, exported: boolean, declCalls: (n: Node, scope: ClassScope | null) => CallFact[], facts: FileFacts) → DeclFact <!-- internal -->
      <a id="extract.ts.classDecl"></a><br>Members of a class. Methods and function-valued fields (`handler = () => …`) are fns with their own calls.
      - calls [extract.ts.classScope](extract.md#extract.ts.classScope), [extract.ts.unsupported](extract.md#extract.ts.unsupported), [extract.ts.memberName](extract.md#extract.ts.memberName), [extract.ts.decl](extract.md#extract.ts.decl), [extract.ts.signature](extract.md#extract.ts.signature), [extract.ts.collectTypeRefs](extract.md#extract.ts.collectTypeRefs), [extract.ts.unwrapValue](extract.md#extract.ts.unwrapValue), [extract.ts.initializer](extract.md#extract.ts.initializer), [extract.ts.heritage](extract.md#extract.ts.heritage), [extract.ts.baseClass](extract.md#extract.ts.baseClass)
    - fn [baseClass](../../src/extract/ts.ts#L642) (heritage: Node) → string | null <!-- internal -->
      <a id="extract.ts.baseClass"></a><br>The `extends` expression: `(extends_clause value: …)` in TypeScript, the bare expression in JavaScript.
      - calls [extract.ts.collapse](extract.md#extract.ts.collapse)
    - fn [unwrapValue](../../src/extract/ts.ts#L649) (node: Node) → Node <!-- internal -->
      <a id="extract.ts.unwrapValue"></a><br>`(f)`, `f as T`, `f satisfies T`, `f!`: the expression they wrap.
    - fn [initializer](../../src/extract/ts.ts#L658) (name: "constructor" | "static", items: { node: Node; calls: CallFact[] }[]) → DeclFact <!-- internal -->
      <a id="extract.ts.initializer"></a><br>A synthesized member over the initializers it runs, from the first to the last.
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located), [extract.treesitter.fingerprint](extract.md#extract.treesitter.fingerprint)
    - fn [memberName](../../src/extract/ts.ts#L665) (node: Node) → string <!-- internal -->
      <a id="extract.ts.memberName"></a>
      - calls [extract.ts.stringValue](extract.md#extract.ts.stringValue)
    - type [ClassScope](../../src/extract/ts.ts#L671) <!-- internal -->
      <a id="extract.ts.ClassScope"></a><br>Where `this.<field>` values come from, for `this.decoder.feed()` and `this.run()`.
    - fn [classScope](../../src/extract/ts.ts#L678) (items: readonly Node[]) → ClassScope <!-- internal -->
      <a id="extract.ts.classScope"></a>
      - calls [extract.ts.typeName](extract.md#extract.ts.typeName), [extract.ts.newClass](extract.md#extract.ts.newClass), [extract.ts.memberName](extract.md#extract.ts.memberName), [extract.ts.fallbackCallee](extract.md#extract.ts.fallbackCallee), [extract.ts.fallbackOf](extract.md#extract.ts.fallbackOf)
    - fn [importStatement](../../src/extract/ts.ts#L732) (node: Node) → ImportFact[] <!-- internal -->
      <a id="extract.ts.importStatement"></a>
      - calls [extract.ts.stringValue](extract.md#extract.ts.stringValue), [extract.ts.importAt](extract.md#extract.ts.importAt)
    - fn [collectDynamicImports](../../src/extract/ts.ts#L764) (root: Node, facts: FileFacts) → void <!-- internal -->
      <a id="extract.ts.collectDynamicImports"></a><br>Literal `import("…")` / `require("…")` anywhere in the file. A non-literal specifier is coverage, not an edge.
      - calls [extract.ts.importAt](extract.md#extract.ts.importAt), [extract.ts.walkNamed](extract.md#extract.ts.walkNamed), [extract.ts.moduleUrlSpecs](extract.md#extract.ts.moduleUrlSpecs), [extract.ts.unsupported](extract.md#extract.ts.unsupported), [extract.ts.requireKind](extract.md#extract.ts.requireKind), [extract.ts.stringValue](extract.md#extract.ts.stringValue)
    - fn [collectUnsupported](../../src/extract/ts.ts#L799) (root: Node, facts: FileFacts) → void <!-- internal -->
      <a id="extract.ts.collectUnsupported"></a><br>Namespace, `eval`, `new Function`, and a call through `obj[expr]` are coverage, not edges.
      - calls [extract.ts.walkNamed](extract.md#extract.ts.walkNamed), [extract.ts.parentOf](extract.md#extract.ts.parentOf), [extract.ts.unsupported](extract.md#extract.ts.unsupported), [extract.ts.unwrapValue](extract.md#extract.ts.unwrapValue)
    - fn [unsupported](../../src/extract/ts.ts#L812) (node: Node, reason: string) → UnsupportedFact <!-- internal -->
      <a id="extract.ts.unsupported"></a>
      - calls [extract.treesitter.located](extract.md#extract.treesitter.located)
    - fn [calleeFact](../../src/extract/ts.ts#L822) (n: Node, stop: Node, cls: ClassScope | null) → CallFact | null <!-- internal -->
      <a id="extract.ts.calleeFact"></a><br>The callee of a call or a function value in an argument: `f`, `a.b`, `this.m`, or `this.field.m` when the field's class is known. Null for any other shape.
      - calls [extract.ts.boundCall](extract.md#extract.ts.boundCall), [extract.ts.callFact](extract.md#extract.ts.callFact), [extract.ts.bindingOf](extract.md#extract.ts.bindingOf), [extract.ts.classThis](extract.md#extract.ts.classThis), [extract.ts.memberName](extract.md#extract.ts.memberName), [extract.ts.localClass](extract.md#extract.ts.localClass), [extract.ts.newClass](extract.md#extract.ts.newClass), [extract.ts.unwrapValue](extract.md#extract.ts.unwrapValue), [extract.ts.collapse](extract.md#extract.ts.collapse)
    - fn [classThis](../../src/extract/ts.ts#L854) (n: Node) → boolean <!-- internal -->
      <a id="extract.ts.classThis"></a><br>`this` at `n` is the class instance: the nearest enclosing non-arrow function is a class member, or a field initializer or `static {}` holds it.
      - calls [extract.ts.parentOf](extract.md#extract.ts.parentOf)
    - fn [passesOf](../../src/extract/ts.ts#L863) (call: Node, stop: Node, cls: ClassScope | null) → PassFact[] <!-- internal -->
      <a id="extract.ts.passesOf"></a><br>Function values in the arguments: the argument itself or a property of an object literal.
      - calls [extract.ts.calleeFact](extract.md#extract.ts.calleeFact), [extract.ts.memberName](extract.md#extract.ts.memberName)
    - fn [insideClosure](../../src/extract/ts.ts#L889) (n: Node, stop: Node) → boolean <!-- internal -->
      <a id="extract.ts.insideClosure"></a><br>A call inside a function nested in the declaration `stop`.
      - calls [extract.ts.parentOf](extract.md#extract.ts.parentOf)
    - fn [typeName](../../src/extract/ts.ts#L895) (annotation: Node | null) → string | null <!-- internal -->
      <a id="extract.ts.typeName"></a><br>`: X` → `X`; generics, unions and qualified names are not a class the graph can resolve.
    - fn [newClass](../../src/extract/ts.ts#L901) (value: Node | null) → string | null <!-- internal -->
      <a id="extract.ts.newClass"></a><br>`new X(…)` → `X`.
    - type [Declaration](../../src/extract/ts.ts#L906) <!-- internal -->
      <a id="extract.ts.Declaration"></a>
    - fn [declarationOf](../../src/extract/ts.ts#L913) (from: Node, name: string, stop: Node) → Declaration | null <!-- internal -->
      <a id="extract.ts.declarationOf"></a><br>The nearest binding of `name` between `from` and `stop`, in the scopes `bindingOf` walks: a declarator or a parameter; `other` for a loop or `catch` variable, a nested function or class name. Null when nothing binds it.
      - calls [extract.ts.parentOf](extract.md#extract.ts.parentOf), [extract.ts.patternNames](extract.md#extract.ts.patternNames), [extract.ts.declaredNames](extract.md#extract.ts.declaredNames)
    - fn [localClass](../../src/extract/ts.ts#L956) (from: Node, name: string, stop: Node) → string | null <!-- internal -->
      <a id="extract.ts.localClass"></a><br>Class of a local or parameter: `const w = new X()`, `const w: X = …`, `(w: X) =>`. Null when a nearer binding (a loop variable) hides the declaration, or when `X` itself is rebound between the declaration and `stop` (`const X = Ctor`).
      - calls [extract.ts.declarationOf](extract.md#extract.ts.declarationOf), [extract.ts.typeName](extract.md#extract.ts.typeName), [extract.ts.newClass](extract.md#extract.ts.newClass), [extract.ts.bindingOf](extract.md#extract.ts.bindingOf)
    - fn [fallbackOf](../../src/extract/ts.ts#L966) (expr: Node, stop: Node) → { source: Node; fallback: string } | null <!-- internal -->
      <a id="extract.ts.fallbackOf"></a><br>`x ?? f` / `x || f` with a callee `f`: the value `x` and the default.
      - calls [extract.ts.fallbackCallee](extract.md#extract.ts.fallbackCallee)
    - fn [fallbackCallee](../../src/extract/ts.ts#L977) (node: Node, stop: Node) → string | null <!-- internal -->
      <a id="extract.ts.fallbackCallee"></a><br>A default that names a declaration: an unbound `f`, `mod.f`, or `this.m`.
      - calls [extract.ts.bindingOf](extract.md#extract.ts.bindingOf)
    - fn [localHook](../../src/extract/ts.ts#L993) (from: Node, name: string, stop: Node) → HookFact | null <!-- internal -->
      <a id="extract.ts.localHook"></a><br>The hook behind a call of a local or parameter `name`: `const g = request.generate ?? generateMap`, `const { g = f } = request`, `function run(g = f)`, `function run({ g = f })`. Injection is known only for a parameter of the declaration itself.
      - calls [extract.ts.declarationOf](extract.md#extract.ts.declarationOf), [extract.ts.defaultIn](extract.md#extract.ts.defaultIn), [extract.ts.fallbackCallee](extract.md#extract.ts.fallbackCallee), [extract.ts.fallbackOf](extract.md#extract.ts.fallbackOf), [extract.ts.plainParameter](extract.md#extract.ts.plainParameter)
    - fn [plainParameter](../../src/extract/ts.ts#L1030) (node: Node) → boolean <!-- internal -->
      <a id="extract.ts.plainParameter"></a>
    - fn [defaultIn](../../src/extract/ts.ts#L1037) (node: Node, name: string, path: string) → { value: Node; path: string } | null <!-- internal -->
      <a id="extract.ts.defaultIn"></a><br>The default value of `name` in a parameter or pattern, with its property path.
      - calls [extract.ts.memberName](extract.md#extract.ts.memberName)
    - fn [collectValueRefs](../../src/extract/ts.ts#L1078) (root: Node, facts: FileFacts) → void <!-- internal -->
      <a id="extract.ts.collectValueRefs"></a><br>Names read as values: identifiers outside callee and binding positions, shorthand properties, and member names read without a call. The first position of each name in the file.
      - calls [extract.treesitter.startCol](extract.md#extract.treesitter.startCol), [extract.ts.walkNamed](extract.md#extract.ts.walkNamed), [extract.ts.parentOf](extract.md#extract.ts.parentOf), [extract.ts.bindsOrCalls](extract.md#extract.ts.bindsOrCalls), [extract.ts.exportedValue](extract.md#extract.ts.exportedValue), [extract.ts.bindingOf](extract.md#extract.ts.bindingOf), [extract.ts.moduleSource](extract.md#extract.ts.moduleSource), [extract.ts.memberName](extract.md#extract.ts.memberName)
    - fn [exportedValue](../../src/extract/ts.ts#L1114) (node: Node) → boolean <!-- internal -->
      <a id="extract.ts.exportedValue"></a><br>A name the module exports as a value: `export default handler`, `export = handler`, `module.exports = handler` or `= { handler }`, `exports.run = run`. Importers that call it are resolved callers, as for `export { handler }`.
      - calls [extract.ts.parentOf](extract.md#extract.ts.parentOf)
    - fn [bindsOrCalls](../../src/extract/ts.ts#L1136) (node: Node, parent: Node) → boolean <!-- internal -->
      <a id="extract.ts.bindsOrCalls"></a><br>The identifier is a callee, a declared name, or a binding — not a value read.
    - fn [stringsOf](../../src/extract/ts.ts#L1152) (node: Node) → string[] | null <!-- internal -->
      <a id="extract.ts.stringsOf"></a><br>Strings an expression can evaluate to: a literal, a ternary of literals, a `const` bound to one.
      - calls [extract.ts.stringValue](extract.md#extract.ts.stringValue), [extract.ts.declarationOf](extract.md#extract.ts.declarationOf), [extract.ts.parentOf](extract.md#extract.ts.parentOf)
    - fn [isImportMetaUrl](../../src/extract/ts.ts#L1174) (node: Node | undefined) → boolean <!-- internal -->
      <a id="extract.ts.isImportMetaUrl"></a>
    - fn [moduleUrlSpecs](../../src/extract/ts.ts#L1187) (node: Node) → { spec: string; optional: boolean }[] | null <!-- internal -->
      <a id="extract.ts.moduleUrlSpecs"></a><br>Module files named relative to this module: `new URL("./worker.ts", import.meta.url)` (a `Worker`, a loader) and `register(spec, import.meta.url | { parentURL: import.meta.url })`. Null when the specifier is not a string the syntax fixes: a module edge may be hidden there.
      - calls [extract.ts.isImportMetaUrl](extract.md#extract.ts.isImportMetaUrl), [extract.ts.stringsOf](extract.md#extract.ts.stringsOf), [extract.ts.staticSuffix](extract.md#extract.ts.staticSuffix), [extract.ts.extensionless](extract.md#extract.ts.extensionless)
    - fn [extensionless](../../src/extract/ts.ts#L1203) (spec: string) → boolean <!-- internal -->
      <a id="extract.ts.extensionless"></a><br>`./worker`, `../lib/job`: a path whose last segment has no extension (not a directory `./dir/`, not `.` or `..`).
    - fn [staticSuffix](../../src/extract/ts.ts#L1211) (node: Node) → string <!-- internal -->
      <a id="extract.ts.staticSuffix"></a><br>The literal end of a computed string: the tail of a template, the last operand of `+`.
      - calls [extract.ts.stringValue](extract.md#extract.ts.stringValue)
    - fn [bindingOf](../../src/extract/ts.ts#L1235) (call: Node, name: string, stop: Node) → "parameter" | "local" | null <!-- internal -->
      <a id="extract.ts.bindingOf"></a><br>Where the head identifier of a call is bound between the call and `stop` (the declaration being extracted): a parameter, a local, a destructured name, a nested function or class, a loop or catch variable. Such a call does not name the module-level symbol of the same name.
      - calls [extract.ts.parentOf](extract.md#extract.ts.parentOf), [extract.ts.patternNames](extract.md#extract.ts.patternNames), [extract.ts.blockDeclares](extract.md#extract.ts.blockDeclares), [extract.ts.declaredNames](extract.md#extract.ts.declaredNames)
    - fn [blockDeclares](../../src/extract/ts.ts#L1264) (block: Node, name: string) → boolean <!-- internal -->
      <a id="extract.ts.blockDeclares"></a>
      - calls [extract.ts.declaredNames](extract.md#extract.ts.declaredNames)
    - fn [declaredNames](../../src/extract/ts.ts#L1273) (stmt: Node) → string[] <!-- internal -->
      <a id="extract.ts.declaredNames"></a>
      - calls [extract.ts.patternNames](extract.md#extract.ts.patternNames)
    - fn [patternNames](../../src/extract/ts.ts#L1288) (node: Node) → string[] <!-- internal -->
      <a id="extract.ts.patternNames"></a><br>Every identifier bound by a parameter list or a destructuring pattern.
      - calls [extract.ts.declaredNames](extract.md#extract.ts.declaredNames)
    - fn [moduleSource](../../src/extract/ts.ts#L1321) (facts: FileFacts, local: string, orDefault = false) → string | null <!-- internal -->
      <a id="extract.ts.moduleSource"></a><br>Source of the import that bound `local` as a whole module (a namespace or `require`), if any; with `orDefault`, also as a default import, whose members the graph resolves on the default export.
    - fn [requireSource](../../src/extract/ts.ts#L1329) (value: Node, requires: ReturnType<typeof query>) → string | null <!-- internal -->
      <a id="extract.ts.requireSource"></a><br>`require("./x")`, `import("./x")`, `await import("./x")` as the whole value: the module a declarator binds. A `require` parameter or local is not Node's.
      - calls [extract.ts.parentOf](extract.md#extract.ts.parentOf), [extract.ts.requireKind](extract.md#extract.ts.requireKind)
    - fn [commonJsExports](../../src/extract/ts.ts#L1352) (stmt: Node, facts: FileFacts, declCalls: (n: Node) => CallFact[]) → void <!-- internal -->
      <a id="extract.ts.commonJsExports"></a><br>`module.exports = {…}`, `module.exports = f`, `exports.x = …`. A function value assigned there is a fn of the module, like `export const x = () => …`: `exports.run = function () {}` and `module.exports = { go() {} }` declare `run` and `go`; `module.exports = function () {}`…
      - calls [extract.ts.unwrapValue](extract.md#extract.ts.unwrapValue), [extract.ts.decl](extract.md#extract.ts.decl), [extract.ts.signature](extract.md#extract.ts.signature), [extract.ts.collectTypeRefs](extract.md#extract.ts.collectTypeRefs)
    - fn [stringValue](../../src/extract/ts.ts#L1401) (n: Node) → string | null <!-- internal -->
      <a id="extract.ts.stringValue"></a>
    - fn [signature](../../src/extract/ts.ts#L1406) (fn: Node) → string <!-- internal -->
      <a id="extract.ts.signature"></a>
      - calls [extract.ts.collapse](extract.md#extract.ts.collapse)
    - fn [typeSignature](../../src/extract/ts.ts#L1415) (n: Node) → string | null <!-- internal -->
      <a id="extract.ts.typeSignature"></a>
      - calls [extract.ts.collapse](extract.md#extract.ts.collapse), [extract.ts.heritage](extract.md#extract.ts.heritage)
    - fn [heritage](../../src/extract/ts.ts#L1424) (n: Node) → string | null <!-- internal -->
      <a id="extract.ts.heritage"></a>
      - calls [extract.ts.collapse](extract.md#extract.ts.collapse)
    - fn [collapse](../../src/extract/ts.ts#L1429) (s: string) → string <!-- internal -->
      <a id="extract.ts.collapse"></a>
    - fn [isNodeBuiltin](../../src/extract/ts.ts#L1434) (spec: string) → boolean
      <a id="extract.ts.isNodeBuiltin"></a><br>Is this specifier a Node built-in (`fs`, `node:fs`)?
