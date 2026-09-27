// Language-independent facts extracted from one source file. Everything the
// map and the index need; nothing about layers or IDs yet.

export interface FileFacts {
  /** POSIX path relative to the repository root. */
  path: string;
  imports: ImportFact[];
  decls: DeclFact[];
  /** Names exported by the file (ESM `export`, CommonJS `module.exports`/`exports.x`). */
  exports: Set<string>;
  /** `export * from "./x"` — the file re-exports everything from these sources. */
  reexportsAll: string[];
}

export interface ImportFact {
  /** Module specifier as written: `./order`, `node:fs`, `@scope/pkg`. */
  source: string;
  /** Line (1-based) of the import. */
  line: number;
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
  endLine: number;
  /** `(a: A) → B` for functions and methods; `extends X` etc. for types. */
  signature: string | null;
  exported: boolean;
  /** Calls made from the body (functions, methods, and class-level for constructors). */
  calls: CallFact[];
  /** Methods for classes. */
  members: DeclFact[];
}

export interface CallFact {
  /** `f()` → `f`; `a.b()` → `a.b`; `this.m()` → `this.m`; `new X()` → `X`. */
  callee: string;
  line: number;
}
