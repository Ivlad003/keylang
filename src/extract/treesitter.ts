// web-tree-sitter runtime with the grammar WASM files from @vscode/tree-sitter-wasm.
// Languages are loaded lazily and cached for the process.

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Language, Parser, Query, type Node, type Tree } from "web-tree-sitter";

const require = createRequire(import.meta.url);

export type Grammar = "typescript" | "tsx" | "javascript";

let ready: Promise<void> | null = null;
const languages = new Map<Grammar, Promise<Language>>();
const queries = new Map<string, Query>();
/** One parser per grammar: parsing is synchronous, and a parser per call leaks WASM heap. */
const parsers = new Map<Grammar, Parser>();

function wasmDir(): string {
  // prepack copies grammars next to the compiled extractor (`dist/wasm`).
  const bundled = join(dirname(fileURLToPath(import.meta.url)), "../wasm");
  if (existsSync(join(bundled, "tree-sitter-typescript.wasm"))) return bundled;
  return join(dirname(require.resolve("@vscode/tree-sitter-wasm/package.json")), "wasm");
}

export function loadLanguage(g: Grammar): Promise<Language> {
  ready ??= Parser.init();
  let l = languages.get(g);
  if (!l) {
    l = ready.then(() => Language.load(readFileSync(join(wasmDir(), `tree-sitter-${g}.wasm`))));
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
  if (path.endsWith(".tsx")) return "tsx";
  if (/\.[cm]?ts$/.test(path)) return "typescript";
  return "javascript";
}

export type { Language, Node, Tree };
