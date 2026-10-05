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
  /**
   * The specifier may name a module or another file: `new URL("./worker", import.meta.url)`
   * without an extension. An edge when it resolves to a source file, nothing otherwise.
   */
  optional?: true;
}

export type ImportBinding =
  /**
   * `import * as x from`, `const x = require()`, `import x = require()` — `x` is the whole module:
   * `x.m` is its export `m`. `namespace`: an ESM namespace object (`import * as x`, `export * as x`,
   * `await import()`), which is no function and holds no default value; without it the binding is
   * the module's value (`module.exports` of `require()`), which `x()` calls as its `default`.
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
  /** The declaration's documentation comment without comment syntax, lines kept; absent when it has none. */
  doc?: string;
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
  /** The callee is a hook with a default: `const generate = request.generate ?? generateMap; generate()`. */
  hook?: HookFact;
  /** Function values the call passes: `analyze({ generate: worker.generate })`, `later(save)`. */
  passes?: PassFact[];
  /** The call sits in a function nested in the declaration: it runs when that value is called. */
  closure?: true;
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

/** A function value in the arguments of a call: argument index, property path ("" for the argument itself). */
export interface PassFact {
  arg: number;
  path: string;
  callee: string;
  bound?: "parameter" | "local";
  receiver?: string;
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
