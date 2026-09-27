// Copies the grammar WASM files into dist/ so the published package can parse
// without relying on the layout of @vscode/tree-sitter-wasm.
import { cpSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const from = join(dirname(require.resolve("@vscode/tree-sitter-wasm/package.json")), "wasm");
const to = join(dirname(fileURLToPath(import.meta.url)), "../dist/wasm");
mkdirSync(to, { recursive: true });
for (const name of ["tree-sitter-typescript.wasm", "tree-sitter-tsx.wasm", "tree-sitter-javascript.wasm"]) {
  cpSync(join(from, name), join(to, name));
}
