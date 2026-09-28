// Copies the grammar WASM files into dist/ so the published package can parse
// without relying on the layout of @vscode/tree-sitter-wasm. The list is the
// runtime's own (`src/extract/grammars.ts`): every grammar keylang loads ships.
import { cpSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GRAMMARS, wasmFile } from "../src/extract/grammars.ts";

const require = createRequire(import.meta.url);
const from = join(dirname(require.resolve("@vscode/tree-sitter-wasm/package.json")), "wasm");
const to = join(dirname(fileURLToPath(import.meta.url)), "../dist/wasm");
mkdirSync(to, { recursive: true });
for (const grammar of GRAMMARS) cpSync(join(from, wasmFile(grammar)), join(to, wasmFile(grammar)));
