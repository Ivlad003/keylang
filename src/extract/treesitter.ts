// web-tree-sitter runtime with the grammar WASM files from @vscode/tree-sitter-wasm.
// Languages are loaded lazily and cached for the process.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { Language, Parser, Query, type Node, type Tree } from "web-tree-sitter";

const require = createRequire(import.meta.url);

export type Grammar = "typescript" | "tsx" | "javascript";

let ready: Promise<void> | null = null;
const languages = new Map<Grammar, Promise<Language>>();
const queries = new Map<string, Query>();

function wasmDir(): string {
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

export async function parseSource(g: Grammar, src: string): Promise<{ tree: Tree; language: Language }> {
  const language = await loadLanguage(g);
  const parser = new Parser();
  parser.setLanguage(language);
  const tree = parser.parse(src);
  if (!tree) throw new Error("tree-sitter: parse returned null");
  return { tree, language };
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

export type { Node, Tree };
