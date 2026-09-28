// web-tree-sitter runtime with the grammar WASM files from @vscode/tree-sitter-wasm.
// Languages are loaded lazily and cached for the process.

import { createHash } from "node:crypto";
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
 */
export function fingerprint(node: Node): string {
  const hash = createHash("sha256");
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
      hash.update(`${n.type}\u0001${n.text}\u0002`);
      continue;
    }
    hash.update(`(${n.type}\u0002`);
    stack.push(CLOSE);
    const children = n.children;
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]!);
  }
  return hash.digest("hex");
}

const CLOSE = Symbol("close");

export type { Language, Node, Tree };
