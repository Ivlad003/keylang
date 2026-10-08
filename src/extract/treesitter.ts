// web-tree-sitter runtime with the grammar WASM files from @vscode/tree-sitter-wasm.
// Languages are loaded lazily and cached for the process.

import { createHash, type Hash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Language, Parser, Query, type Node, type Tree } from "web-tree-sitter";
import { wasmFile, type Grammar } from "./grammars.ts";

const require = createRequire(import.meta.url);

export type { Grammar };

let ready: Promise<void> | null = null;
const languages = new Map<Grammar, Promise<Language>>();
const queries = new Map<string, Query>();
/** One parser per grammar: parsing is synchronous, and a parser per call leaks WASM heap. */
const parsers = new Map<Grammar, Parser>();
/**
 * Per tree whose source has characters outside the BMP: the index of the low
 * half of each surrogate pair, ascending. Most sources have none, so their
 * columns cost nothing extra.
 */
const surrogates = new WeakMap<Tree, number[]>();

function wasmDir(): string {
  // prepack copies every grammar of `GRAMMARS` next to the compiled extractor (`dist/wasm`).
  const bundled = join(dirname(fileURLToPath(import.meta.url)), "../wasm");
  if (existsSync(bundled)) return bundled;
  return join(dirname(require.resolve("@vscode/tree-sitter-wasm/package.json")), "wasm");
}

export function loadLanguage(g: Grammar): Promise<Language> {
  ready ??= Parser.init();
  let l = languages.get(g);
  if (!l) {
    l = ready.then(() => Language.load(readFileSync(join(wasmDir(), wasmFile(g)))));
    languages.set(g, l);
  }
  return l;
}

/**
 * Parse `src` and run `use` on the tree, which is freed afterwards: a tree
 * lives in the WASM heap, so nothing `use` returns may hold a node.
 */
export async function withTree<T>(g: Grammar, src: string, use: (tree: Tree, language: Language) => T): Promise<T> {
  const language = await loadLanguage(g);
  let parser = parsers.get(g);
  if (!parser) {
    parser = new Parser();
    parser.setLanguage(language);
    parsers.set(g, parser);
  }
  const tree = parser.parse(src);
  if (!tree) throw new Error("tree-sitter: parse returned null");
  const pairs = surrogatePairs(src);
  if (pairs.length > 0) surrogates.set(tree, pairs);
  try {
    return use(tree, language);
  } finally {
    tree.delete();
  }
}

/** Compile a query once per (grammar, source). */
export function query(language: Language, g: Grammar, name: string, source: string): Query {
  const key = `${g}:${name}`;
  let q = queries.get(key);
  if (!q) {
    q = new Query(language, source);
    queries.set(key, q);
  }
  return q;
}

export function grammarFor(path: string): Grammar {
  if (path.endsWith(".rs")) return "rust";
  if (path.endsWith(".py")) return "python";
  if (path.endsWith(".php")) return "php";
  if (path.endsWith(".tsx")) return "tsx";
  if (/\.[cm]?ts$/.test(path)) return "typescript";
  return "javascript";
}

/** 1-based range and text of a node; columns count code points, and `endCol` is the column after it. */
export function located(node: Node): { line: number; col: number; endLine: number; endCol: number; text: string } {
  return {
    line: node.startPosition.row + 1,
    col: startCol(node),
    endLine: node.endPosition.row + 1,
    endCol: codePointColumn(node.tree, node.endIndex, node.endPosition.column),
    text: node.text,
  };
}

/** The node's 1-based start column in code points (§7), as `located` gives it. */
export function startCol(node: Node): number {
  return codePointColumn(node.tree, node.startIndex, node.startPosition.column);
}

/**
 * web-tree-sitter parses a JS string as UTF-16, so its columns and indices
 * count code units. A surrogate pair between the line start and the point is
 * one code point, and so one column.
 */
function codePointColumn(tree: Tree, index: number, units: number): number {
  const pairs = surrogates.get(tree);
  if (pairs === undefined) return units + 1;
  return units + 1 - (firstAtOrAfter(pairs, index) - firstAtOrAfter(pairs, index - units + 1));
}

function surrogatePairs(src: string): number[] {
  const out: number[] = [];
  for (const m of src.matchAll(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g)) out.push(m.index + 1);
  return out;
}

/** Position of the first element `>= value` in an ascending array. */
function firstAtOrAfter(sorted: readonly number[], value: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (sorted[mid]! < value) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** First syntax-error line, or the start of the tree when the grammar only sets `hasError`. */
export function errorLine(node: Node): number {
  // A loop down the first erroneous child, not recursion: a deep tree must not overflow the stack.
  for (let n = node; ; ) {
    if (n.type === "ERROR" || n.isMissing) return n.startPosition.row + 1;
    const child = n.children.find((c) => c.hasError);
    if (!child) return n.startPosition.row + 1;
    n = child;
  }
}

/**
 * SHA-256 of the node's syntax: node types and token texts, without comments
 * and whitespace. `>` → `>=` changes it; reformatting or editing a comment
 * does not. Nesting is part of it, so moving a statement out of a block counts.
 * Line endings inside a token (a multi-line string, docstring or heredoc) are
 * read as LF: a CRLF checkout of the same commit has the same fingerprint, as
 * the languages themselves read CRLF in such literals as LF.
 *
 * The values the node reads by name in its own file are part of it: a module
 * constant, a class field or property, an object table, a Rust `const` or
 * `static` (and, transitively, the values those read). `LIMIT = 100` → `5`
 * changes every fn that reads `LIMIT`. A value imported from another file of
 * the repository is out of reach, so the fingerprint then ends with
 * {@link READS_IMPORTED_VALUE}: the snapshot marks its closure incomplete.
 */
export function fingerprint(node: Node): string {
  const hash = createHash("sha256");
  const reads = hashSyntax(node, hash);
  for (const value of valuesRead(node, reads)) hash.update(`=${value.print}\u0002`);
  return hash.digest("hex") + (readsImportedValue(node, reads) ? READS_IMPORTED_VALUE : "");
}

/**
 * Ends the fingerprint of a node that reads a value imported from another
 * file of the repository (`import { LIMIT } from "./limits"`, `from .limits
 * import MAX`, `use crate::limits::MAX`). Never a hex digit.
 */
export const READS_IMPORTED_VALUE = "+";

/** Leaf types that name something the code reads: a variable, a field or property, a constant. */
const NAME_LEAVES = new Set(["identifier", "property_identifier", "private_property_identifier", "shorthand_property_identifier", "field_identifier", "name"]);

/** Hash the syntax of `node` into `hash` (see `fingerprint`); the names of the leaves in it. */
function hashSyntax(node: Node, hash: Hash): Set<string> {
  const reads = new Set<string>();
  // An explicit stack in document order (a closing mark after a node's children), not recursion.
  const stack: (Node | typeof CLOSE)[] = [node];
  while (stack.length > 0) {
    const n = stack.pop()!;
    if (n === CLOSE) {
      hash.update(")\u0002");
      continue;
    }
    if (n.type.includes("comment")) continue;
    if (n.childCount === 0) {
      hash.update(`${n.type}\u0001${n.text.replace(/\r\n?/g, "\n")}\u0002`);
      if (NAME_LEAVES.has(n.type)) reads.add(n.text);
      continue;
    }
    hash.update(`(${n.type}\u0002`);
    stack.push(CLOSE);
    const children = n.children;
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]!);
  }
  return reads;
}

const CLOSE = Symbol("close");

/** A value declared by name in a scope: a variable, constant or field. */
interface ValueDecl {
  names: readonly string[];
  start: number;
  end: number;
  node: Node;
  /** Syntax hash and names, computed on first use: most values no fingerprinted node reads. */
  print?: string;
  reads?: ReadonlySet<string>;
}

/** Value declarations per scope node (by `Node.id`), per tree: the fns of a file look into the same scopes. */
const scopeValues = new WeakMap<Tree, Map<number, ValueDecl[]>>();
const importedValues = new WeakMap<Tree, Set<string>>();

/**
 * The value declarations `node` reads by name, transitively, in every scope
 * around it (an enclosing class body, the module), in document order. A
 * declaration that holds `node` itself (`const f = () => …`) is left out.
 */
function valuesRead(node: Node, reads: ReadonlySet<string>): ValueDecl[] {
  const scopes: ValueDecl[][] = [];
  for (let scope = node.parent; scope !== null; scope = scope.parent) scopes.push(valuesOf(scope));
  const names = new Set(reads);
  const found = new Set<ValueDecl>();
  for (let grew = true; grew; ) {
    grew = false;
    for (const decls of scopes) {
      for (const decl of decls) {
        if (found.has(decl) || (decl.start <= node.startIndex && decl.end >= node.endIndex)) continue;
        if (!decl.names.some((name) => names.has(name))) continue;
        found.add(decl);
        grew = true;
        if (decl.print === undefined) {
          const hash = createHash("sha256");
          decl.reads = hashSyntax(decl.node, hash);
          decl.print = hash.digest("hex");
        }
        for (const name of decl.reads ?? []) names.add(name);
      }
    }
  }
  return [...found].sort((a, b) => a.start - b.start);
}

function valuesOf(scope: Node): ValueDecl[] {
  let byScope = scopeValues.get(scope.tree);
  if (!byScope) {
    byScope = new Map();
    scopeValues.set(scope.tree, byScope);
  }
  let decls = byScope.get(scope.id);
  if (decls) return decls;
  decls = [];
  for (const child of scope.namedChildren) {
    const decl = valueDeclaration(child);
    const names = decl ? declaredNames(decl) : [];
    if (names.length > 0) decls.push({ names, start: child.startIndex, end: child.endIndex, node: child });
  }
  byScope.set(scope.id, decls);
  return decls;
}

/** The value declaration a statement of a scope is, through `export` (TS) and an expression statement (Python). */
function valueDeclaration(statement: Node): Node | null {
  switch (statement.type) {
    case "export_statement": {
      const decl = statement.childForFieldName("declaration");
      return decl ? valueDeclaration(decl) : null;
    }
    case "expression_statement": {
      // Python `MAX = 100`; a TS assignment statement declares nothing.
      const inner = statement.namedChildren[0];
      return inner?.type === "assignment" ? inner : null;
    }
    case "lexical_declaration": // TS/JS `const`, `let`
    case "variable_declaration": // `var`
    case "public_field_definition": // TS class field
    case "field_definition": // JS class field
    case "const_declaration": // PHP `const`
    case "property_declaration": // PHP property
    case "const_item": // Rust
    case "static_item":
      return statement;
    default:
      return null;
  }
}

function declaredNames(decl: Node): string[] {
  switch (decl.type) {
    case "lexical_declaration":
    case "variable_declaration":
      return decl.namedChildren.filter((d) => d.type === "variable_declarator").flatMap((d) => patternNames(d.childForFieldName("name")));
    case "assignment": {
      const left = decl.childForFieldName("left");
      return left && (left.type === "identifier" || left.type.includes("pattern")) ? patternNames(left) : [];
    }
    case "public_field_definition":
    case "field_definition":
    case "const_item":
    case "static_item": {
      const name = decl.childForFieldName("name") ?? decl.childForFieldName("property");
      return name ? [name.text] : [];
    }
    case "const_declaration":
      return decl.namedChildren.filter((c) => c.type === "const_element").flatMap((c) => c.namedChildren.filter((n) => n.type === "name").slice(0, 1).map((n) => n.text));
    case "property_declaration":
      return decl.namedChildren.filter((c) => c.type === "property_element").flatMap((c) => patternNames(c.namedChildren.find((n) => n.type === "variable_name") ?? null));
    default:
      return [];
  }
}

/** Names a declaration target binds: an identifier, or every identifier of a destructuring pattern. */
function patternNames(target: Node | null): string[] {
  if (target === null) return [];
  if (target.childCount === 0) return NAME_LEAVES.has(target.type) || target.type === "shorthand_property_identifier_pattern" ? [target.text] : [];
  // A default value (`{ a = 1 }`) is code, not a name.
  return target.namedChildren.filter((child) => !child.type.includes("expression") && !child.type.includes("number")).flatMap(patternNames);
}

/** Wrappers whose first child is the object read: `a.b`, `a::b`, `a[0]`. */
const MEMBER_CHAINS = new Set(["member_expression", "attribute", "scoped_identifier", "field_expression", "subscript_expression", "subscript"]);
/** Calls by their callee field: an imported fn that is called is the call graph's to follow, not a read. */
const CALLEES: Record<string, string> = { call_expression: "function", call: "function", new_expression: "constructor", macro_invocation: "macro" };

/** Whether `node` reads, as a value, a name imported from another file of the repository. */
function readsImportedValue(node: Node, reads: ReadonlySet<string>): boolean {
  const imported = importedValueNames(node.tree);
  if (imported.size === 0 || ![...reads].some((name) => imported.has(name))) return false;
  const stack: Node[] = [node];
  while (stack.length > 0) {
    const n = stack.pop()!;
    // Types, decorators and JSX are no value reads a closure could follow.
    if (n.type.includes("comment") || n.type.includes("type") || n.type === "decorator" || n.type.startsWith("jsx_")) continue;
    if (n.childCount === 0) {
      if (n.type === "identifier" && imported.has(n.text) && !isCallee(n)) return true;
      continue;
    }
    stack.push(...n.children);
  }
  return false;
}

function isCallee(leaf: Node): boolean {
  let top = leaf;
  for (let parent = top.parent; parent !== null && MEMBER_CHAINS.has(parent.type) && parent.namedChildren[0]?.id === top.id; parent = top.parent) top = parent;
  const call = top.parent;
  const field = call ? CALLEES[call.type] : undefined;
  return call !== null && field !== undefined && call.childForFieldName(field)?.id === top.id;
}

/**
 * Local names the file binds to values of other files of the repository, as
 * far as the import's syntax tells: a relative TS/JS specifier, a relative
 * Python `from . import`, a Rust `use crate::`/`super::`/`self::`. A
 * type-only import binds no value.
 */
function importedValueNames(tree: Tree): Set<string> {
  let names = importedValues.get(tree);
  if (names) return names;
  names = new Set();
  for (const statement of tree.rootNode.namedChildren) {
    const source = statement.type === "import_statement" ? statement.childForFieldName("source") : null;
    if (source) {
      // TS/JS; `import type` binds types only.
      if (!/^["']\./.test(source.text) || statement.children.some((c) => !c.isNamed && c.type === "type")) continue;
      const clause = statement.namedChildren.find((c) => c.type === "import_clause");
      for (const part of clause?.namedChildren ?? []) {
        if (part.type === "identifier") names.add(part.text);
        else if (part.type === "namespace_import") for (const id of part.namedChildren) names.add(id.text);
        else if (part.type === "named_imports") {
          for (const spec of part.namedChildren) {
            if (spec.type !== "import_specifier" || spec.children.some((c) => !c.isNamed && c.type === "type")) continue;
            const local = spec.childForFieldName("alias") ?? spec.childForFieldName("name");
            if (local) names.add(local.text);
          }
        }
      }
    } else if (statement.type === "import_from_statement" && statement.childForFieldName("module_name")?.type === "relative_import") {
      // Python `from .limits import MAX as M`.
      for (const name of statement.childrenForFieldName("name")) {
        const local = name.type === "aliased_import" ? name.childForFieldName("alias") : (name.namedChildren[name.namedChildren.length - 1] ?? name);
        if (local) names.add(local.text);
      }
    } else if (statement.type === "use_declaration") {
      // Rust `use crate::limits::{MAX, MIN as LOW};`.
      const argument = statement.childForFieldName("argument");
      if (argument && /^(crate|super|self)::/.test(argument.text)) for (const name of useNames(argument)) names.add(name);
    }
  }
  importedValues.set(tree, names);
  return names;
}

function useNames(clause: Node): string[] {
  switch (clause.type) {
    case "identifier":
      return [clause.text];
    case "scoped_identifier": {
      const name = clause.childForFieldName("name");
      return name ? [name.text] : [];
    }
    case "use_as_clause": {
      const alias = clause.childForFieldName("alias");
      return alias ? [alias.text] : [];
    }
    case "scoped_use_list": {
      const list = clause.childForFieldName("list");
      return list ? useNames(list) : [];
    }
    case "use_list":
      return clause.namedChildren.flatMap(useNames);
    default:
      return [];
  }
}

export type { Language, Node, Tree };
