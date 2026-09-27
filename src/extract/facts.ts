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
   * `complete`: the declaration list is exhaustive and may be empty.
   * `opaque`: a syntax error or an unparsed file; a missing name is not evidence it does not exist.
   */
  completeness: "complete" | "opaque";
  parseError: { line: number; reason: string } | null;
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
}

export type ImportBinding =
  /** `import x from`, `import * as x from`, `const x = require()` — `x` is the whole module. */
  | { kind: "module"; local: string }
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
  /** Parameters and locals that hide an outer name inside this function. */
  shadows: ShadowBinding[];
  /** Methods for classes. */
  members: DeclFact[];
}

export interface CallFact {
  /** `f()` → `f`; `a.b()` → `a.b`; `this.m()` → `this.m`; `new X()` → `X`. */
  callee: string;
  line: number;
  col: number;
  endLine: number;
  endCol: number;
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

export interface ShadowBinding {
  name: string;
  kind: "parameter" | "local";
}

/** One public name of a file, compared with the `exports` rule. */
export interface ExportRow {
  /** Name visible to importers. */
  name: string;
  kind: "fn" | "value" | "class" | "type" | "alias" | "default" | "reexport";
  /** Local declaration name, when it differs from `name` (`export { a as b }`). */
  local: string | null;
}

export interface UnsupportedFact {
  line: number;
  col: number;
  endLine: number;
  endCol: number;
  text: string;
  reason: string;
}
