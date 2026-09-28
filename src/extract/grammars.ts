// The tree-sitter grammars keylang parses with. One list for the runtime
// (`treesitter.ts` loads them) and for packaging (`scripts/copy-wasm.mjs`
// copies each into dist/wasm), so a new language cannot be left out of the
// published package.

export const GRAMMARS = ["typescript", "tsx", "javascript", "rust", "python"] as const;

export type Grammar = (typeof GRAMMARS)[number];

/** The grammar's file name in @vscode/tree-sitter-wasm and in dist/wasm. */
export function wasmFile(g: Grammar): string {
  return `tree-sitter-${g}.wasm`;
}
