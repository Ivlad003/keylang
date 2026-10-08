// Language-independent facts extracted from one source file. Everything the
// map and the index need; nothing about layers or IDs yet.

export interface FileFacts {
  /** POSIX path relative to the repository root. */
  path: string;
  /** End of the file, 1-based; `endCol` is the column after the last character. */
  endLine: number;
  endCol: number;
  imports: ImportFact[];
  decls: DeclFact[];
  /** Names exported by the file (ESM `export`, CommonJS `module.exports`/`exports.x`). */
  exports: Set<string>;
  /** `export * from "./x"` — the file re-exports everything from these sources. */
  reexportsAll: string[];
  /** Public names with their kinds. Empty only when the file exports nothing. */
  exportRows: ExportRow[];
  /**
   * Why `exportRows` may miss a public name, when it may: a Python module
   * without `__all__` whose module level binds names keylang does not list
   * (`for x in`, `with … as x`, `a, b = …`). A glob import of the file may
   * then bring any name. Absent when the list is exhaustive.
   */
  exportsIncomplete?: string;
  /** Constructs the extractor does not turn into edges, each with the source fragment. */
  unsupported: UnsupportedFact[];
  /**
   * Names read as values rather than called — `later(save)`, `{ save }`,
   * `obj.save` without a call, `class B extends A` — first position of each.
   * A function named so may be called by code that holds the value.
   */
  valueRefs: ValueRefFact[];
  /**
   * Calls outside every declaration body: module top level, object-literal
   * methods, function values wrapped in a call (`cache(() => …)`). They run
   * when the module loads, or when code holding that value calls it.
   */
  moduleCalls: CallFact[];
  /**
   * `complete`: the declaration list is exhaustive and may be empty.
   * `opaque`: a syntax error or an unparsed file; a missing name is not evidence it does not exist.
   */
  completeness: "complete" | "opaque";
  parseError: { line: number; reason: string } | null;
  /** The file's documentation comment (a header comment, a module docstring) without comment syntax; absent when it has none. */
  doc?: string;
  /**
   * Qualified names of the file's top-level declarations, for a language whose
   * imports name declarations rather than files (PHP: `use App\Domain\Order`
   * names the class `Order` of the namespace `App\Domain`, whatever file
   * declares it). The resolver finds a name's file by them.
   */
  symbols?: QualifiedSymbol[];
  /**
   * Places where execution starts, as the code writes them (ADR 0022 п. 5):
   * a handler registered on a literal path, a script block that calls a fn.
   * The snapshot resolves each to a fn of the graph (`entries` of the index).
   */
  entries?: EntryFact[];
}

/**
 * A language-level entry point written in the code, before resolution.
 * `route`: `app.get('/x', h)` with a literal path and a named handler —
 * `label` is `GET /x`, `callee` is `h` as written. `main`: a Python
 * `if __name__ == "__main__":` block — `callee` is the fn it calls, or null
 * when it names none directly (the module's top level is the entry then).
 * `sfra`: `server.get('Show', …, h)` in an SFRA controller — `callee` is the
 * last argument when it is a name, null for a handler written in place.
 */
export interface EntryFact {
  kind: "route" | "main" | "sfra";
  /** `sfra`: the action name, `Show`; the SFCC adapter adds the controller's. */
  label: string;
  /** `sfra`: the `server` method that registers it (`get`, `post`, `use`, `append`, `prepend`, `replace`). */
  method?: string;
  callee: string | null;
  line: number;
  col: number;
}

/** A top-level declaration by its qualified name. */
export interface QualifiedSymbol {
  /** The name the file declares: `Order`. */
  name: string;
  /** With its namespace: `App\Domain\Order`. */
  qualified: string;
  /** PHP keeps classes (interfaces, traits and enums too), functions and constants in tables of their own. */
  table: "class" | "function" | "const";
}

export interface ImportFact {
  /** Module specifier as written: `./order`, `node:fs`, `@scope/pkg`. */
  source: string;
  /** 1-based start. `endCol` is the column after the fragment. */
  line: number;
  col: number;
  endLine: number;
  endCol: number;
  /** Source text of the import or require. */
  text: string;
  /** How the import binds names in this file. */
  bindings: ImportBinding[];
  /** `export … from`: the import is re-exported. */
  reexport: boolean;
  /** `use a::*`, `from a import *`: every public name of the source is in scope in this file, with no binding of its own. */
  glob?: true;
  /**
   * TypeScript `import type …`, `export type … from`, `export type * from`: the statement names
   * types only and is erased from the code that runs, so its edge forms no cycle that runs.
   */
  typeOnly?: true;
  /**
   * TypeScript `import { type A, type B as C } from`, `export { type A } from`: every name in the
   * braces is `type` (at least one, with no default or namespace binding beside them). tsc and
   * esbuild erase the statement unless the tsconfig that governs the file sets
   * `verbatimModuleSyntax`, which keeps it as `import {} from`: a fact of the syntax, whose
   * `typeOnly` edge the graph decides with the tsconfig, so cached facts do not depend on it.
   */
  inlineTypeOnly?: true;
  /**
   * The specifier may name a module or another file: `new URL("./worker", import.meta.url)`
   * without an extension. An edge when it resolves to a source file, nothing otherwise.
   */
  optional?: true;
  /**
   * The name is written only in a docblock the language does not check (PHP `@var Foo` above a
   * property, `@param Foo $x`), never in the code: the edge's provenance is `docblock`.
   */
  docblock?: true;
}

export type ImportBinding =
  /**
   * `import * as x from`, `const x = require()`, `import x = require()` — `x` is the whole module:
   * `x.m` is its export `m`. `namespace`: a module object that is no function and holds no default
   * value — an ESM namespace object (`import * as x`, `export * as x`, `await import()`), a Python
   * module (`import x`); without it the binding is the module's value (`module.exports` of
   * `require()`), which `x()` calls as its `default`.
   */
  | { kind: "module"; local: string; namespace?: true }
  /** `import x from` — `x` is the export `default` (for a CommonJS module without one, `module.exports`). */
  | { kind: "default"; local: string }
  /** `import { a as b } from` — `b` is the export `a`. */
  | { kind: "named"; local: string; imported: string };

export type DeclKind = "fn" | "class" | "type";

export interface DeclFact {
  kind: DeclKind;
  name: string;
  line: number;
  col: number;
  endLine: number;
  endCol: number;
  /** `(a: A) → B` for functions and methods; `extends X` etc. for types. */
  signature: string | null;
  exported: boolean;
  /** Calls made from the body (functions, methods, and class-level for constructors). */
  calls: CallFact[];
  /** Type names mentioned by this declaration, not including its own name. */
  types: TypeRefFact[];
  /** Methods for classes. */
  members: DeclFact[];
  /** `fingerprint()` of the declaring node: changes with the body and signature, not with comments or layout. */
  fingerprint?: string;
  /** A getter or setter: property access runs it without a call expression. */
  accessor?: true;
  /** The language calls the member through syntax, not a call that names it: a Rust `Drop::drop`, `Display::fmt`, `Add::add`. */
  implicit?: true;
  /** A `static` class member. */
  static?: true;
  /** An ECMAScript private member (`#name`); `name` is written without `#`. */
  hash?: true;
  /** Classes: the `extends` expression as written (`Readable`, `React.Component`). */
  base?: string;
  /** Classes: the traits the class uses, as written (PHP `use Logs;`): their methods are the class's own. */
  traits?: string[];
  /**
   * Classes: the conflict rules of the PHP `use` block, traits as written: `T::m insteadof U, V`
   * (`insteadof`: U's and V's `m` are not the class's) and `T::m as alias` / `m as alias` (`alias`;
   * `trait` null when not named).
   */
  traitRules?: { trait: string | null; method: string; insteadof?: string[]; alias?: string }[];
  /**
   * Classes: the interfaces the class implements; interfaces: those it extends — as written
   * (PHP `implements A, B`, `interface I extends J`). A framework's interceptor on an
   * interface wraps the classes that implement it.
   */
  implements?: string[];
  /** The declaration's documentation comment without comment syntax, lines kept; absent when it has none. */
  doc?: string;
  /** PHP: the attributes written on the class or the method (`#[Route('/x', methods: ['POST'])]`), in order. A framework adapter reads them (ADR 0022). */
  attributes?: AttributeFact[];
  /** PHP classes: the properties whose default value is a literal a framework reads (`protected $listen = [OrderPlaced::class => [...]]`). */
  properties?: PropertyFact[];
  /** PHP functions and methods: the parameters, when at least one is typed with a single class (`handle(OrderPlaced $event)`). */
  params?: ParamFact[];
  /** PHP functions and methods: the literal a body of one `return <literal>;` gives (`getSubscribedEvents`, `getFacadeAccessor`). */
  returns?: LiteralFact;
}

/**
 * A value PHP code writes as a literal, as far as a framework adapter reads it
 * (ADR 0022): a string without interpolation, `X::class` (`self::class` is the
 * enclosing class), a class constant `X::NAME`, `new X(…)`, an array of them,
 * a closure literal at its position; anything else is `other`. Class names are
 * qualified as PHP resolves them, without the leading `\`.
 */
export type LiteralFact =
  | { kind: "string"; value: string }
  | { kind: "class"; name: string }
  | { kind: "const"; class: string; name: string }
  | { kind: "new"; name: string }
  | { kind: "array"; items: { key: LiteralFact | null; value: LiteralFact }[] }
  | { kind: "closure"; line: number; col: number }
  | { kind: "other" };

/** One argument of a call or an attribute: named (`methods: ['POST']`) or positional. */
export interface ArgFact {
  name?: string;
  value: LiteralFact;
}

/** `#[Name(args)]` on a declaration; `name` qualified as PHP resolves it. */
export interface AttributeFact {
  name: string;
  args: ArgFact[];
  line: number;
  col: number;
}

/** A class property with a literal default value. */
export interface PropertyFact {
  name: string;
  value: LiteralFact;
  line: number;
  col: number;
}

/** A parameter of a function; `type` is the qualified class when the parameter is typed with one. */
export interface ParamFact {
  name: string;
  type?: string;
}

/** One call of a chain `Route::prefix('admin')->name('a.')->group(…)`, root first; the root names its class when it is a static call. */
export interface ChainLinkFact {
  name: string;
  class?: string;
  args: ArgFact[];
}

export interface CallFact {
  /**
   * `f()` → `f`; `a.b()` → `a.b`; `this.m()` → `this.m`; `new X()` → `X`;
   * `new ns.X()` → `ns.X`; `super()` → `super`. For an `opaque` call, the
   * callee's source text (at most 80 characters).
   */
  callee: string;
  /**
   * The callee is an expression keylang does not name (`f()()`, `(a || b)()`,
   * `new (load())()`, a chain too long to read): never an edge, always a
   * `dynamic-call` hole. Every call in the code is an edge or a hole.
   */
  opaque?: true;
  /** The head of the callee is bound in a scope between the call and the module; for `this.m`, `this` is not the class. */
  bound?: "parameter" | "local";
  /**
   * Class of the receiver when the syntax names it: `this.decoder.feed()` with a
   * field `decoder: InputDecoder` or `= new InputDecoder()`, `worker.generate()`
   * with `const worker = new SnapshotWorker()` or a parameter `worker: SnapshotWorker`.
   */
  receiver?: string;
  /**
   * The receiver is a property the constructor fills from its parameter `param` (PHP
   * `$this->x = $x`, a promoted `private X $x`): a framework's config may set that argument.
   */
  param?: string;
  /**
   * The receiver's class is written in a docblock the language does not check (PHP `@var Foo`
   * above the property, `@param Foo $x` of the constructor parameter assigned to it), at this
   * position: the edge's provenance is `docblock`, not `syntactic`.
   */
  docblock?: { line: number; col: number };
  /** The callee is a hook with a default: `const generate = request.generate ?? generateMap; generate()`. */
  hook?: HookFact;
  /**
   * Function values the call passes: `analyze({ generate: worker.generate })`, `later(save)`,
   * and callable references — PHP `[$this, 'm']`, `'Cls::m'`, `\Closure::fromCallable(…)`,
   * `$this->m(...)`; TS `this.m.bind(this)`; Python `functools.partial(self.m)`; Rust `Self::m`.
   */
  passes?: PassFact[];
  /** The call sits in a function nested in the declaration: it runs when that value is called. */
  closure?: true;
  /**
   * Every function the call is nested in is a closure literal written as an argument of a call
   * (`run(() => hit())`, `items.map(fn($x) => $this->m($x))`): the enclosing call's callee holds
   * them, so the call is a possible route from the declaration. Position of the outermost such
   * closure. Absent when some enclosing closure is stored in a value (`const f = () => hit()`).
   */
  closureArg?: { line: number; col: number };
  /** PHP: every closure literal the call is nested in as an argument, outermost first, when there are two or more (`closureArg` is the first). */
  closures?: { line: number; col: number }[];
  /** PHP: the arguments as literals, when at least one is a literal a framework reads (a string, `X::class`, `new X`, an array, a closure). */
  args?: ArgFact[];
  /** PHP: a call on the result of other calls (`Route::prefix('admin')->group(…)`): the calls of the chain, root first, this one last. */
  chain?: ChainLinkFact[];
  line: number;
  col: number;
  endLine: number;
  endCol: number;
}

/**
 * A callable chosen at run time with a default written next to it. `param` and
 * `path` say where a caller injects the value: `analyze({ generate })` is
 * parameter 0, path `generate`; `function f(run = defaultRun)` is parameter 0, path "".
 */
export interface HookFact {
  /** Local, parameter or field the call goes through. */
  name: string;
  /** Callee text of the default: `generateMap`, `this.run`. */
  fallback: string;
  /** Parameter index of the function that receives the injected value; null when it is not a parameter. */
  param: number | null;
  path: string;
  /** `self`: a parameter of the declaration itself; `constructor`: a field set from a constructor parameter. */
  owner: "self" | "constructor";
}

/**
 * A function value in the arguments of a call: argument index, property path
 * ("" for the argument itself). `callee` names it as a call would (`this.m`,
 * `Cls.m`, `save`); `text` is the argument as written (`[$this, 'm']`), at the
 * position. One passed as the argument itself is a `callable-arg` edge of the
 * enclosing fn when it resolves.
 */
export interface PassFact {
  arg: number;
  path: string;
  callee: string;
  bound?: "parameter" | "local";
  receiver?: string;
  /** The receiver's class is written only in a docblock (PHP `[$this->store, 'm']` with `@var Store`), at this position. */
  docblock?: { line: number; col: number };
  text: string;
  line: number;
  col: number;
  endLine: number;
  endCol: number;
}

export interface ValueRefFact {
  /** `save`, or `mod.save` for a module import; the member name for a property read. */
  name: string;
  /** A property read (`obj.save`, `const { save } = obj`): it can hold a method, not a module function. */
  member?: true;
  line: number;
  col: number;
}

/** A type name in type position. `text` is the source fragment. */
export interface TypeRefFact {
  name: string;
  line: number;
  col: number;
  endLine: number;
  endCol: number;
  text: string;
}


/**
 * One public name of a file, compared with the `exports` rule and followed by
 * the graph to the symbol it stands for.
 */
export interface ExportRow {
  /**
   * Name visible to importers: `default` for `export default …`, `export =`
   * and `module.exports = …`; `*` for `export * from`.
   */
  name: string;
  /**
   * What the name is as far as the file shows (`fn`, `class`, `type`,
   * `value`). `alias`, `default` and `reexport` say how it is exported
   * instead; a frontend that sets `form` gives the kind here.
   */
  kind: "fn" | "value" | "class" | "type" | "alias" | "default" | "reexport";
  /**
   * The local declaration or binding the name stands for (`export { a as b }`
   * → `a`, `export default function main` → `main`, `export { a as b } from`
   * → `a` in that module); null when no name is written (`export default 3`,
   * `export * from`) or the frontend does not say.
   */
  local: string | null;
  /**
   * How the name is exported; absent for a declaration under its own name.
   * `alias`: `export { a as b }`; `default`: the default export;
   * `reexport`: a name of another module (`from`); `namespace`: a module
   * object (`export * as ns from`, `export namespace N {}`).
   */
  form?: "alias" | "default" | "reexport" | "namespace";
  /** Specifier of the module a re-export or an exported namespace comes from. */
  from?: string;
}

export interface UnsupportedFact {
  line: number;
  col: number;
  endLine: number;
  endCol: number;
  text: string;
  reason: string;
  /**
   * The declaration the construct changes, as a dotted path in the file
   * (`place`, `Order.save`): a decorator that may replace a fn. Such a hole
   * is in how calls of that declaration behave; it adds no dependency.
   */
  symbol?: string;
}
