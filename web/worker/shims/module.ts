// `node:module` for the analysis in the browser. `builtinModules` is Node's
// own list, written in at build time (the TypeScript extractor tells a
// built-in import from a package by it). `createRequire` answers the one
// thing keylang requires by path — its own package.json, for the version —
// and resolves web-tree-sitter to where the worker mounts its package.json
// (its version is part of the snapshot ID); nothing else.

declare const KEYLANG_BUILTINS: string[];
declare const KEYLANG_VERSION: string;

/** Where the worker mounts web-tree-sitter's package.json (web/worker/analysis.ts). */
export const WEB_TREE_SITTER = "/keylang/node_modules/web-tree-sitter/web-tree-sitter.js";

export const builtinModules: readonly string[] = KEYLANG_BUILTINS;

export function createRequire(_from: string | URL): ((id: string) => unknown) & { resolve: (id: string) => string } {
  const require = (id: string): unknown => {
    if (id.endsWith("package.json")) return { name: "keylang", version: KEYLANG_VERSION };
    throw new Error(`require: ${id} is not available in the browser`);
  };
  const resolve = (id: string): string => {
    if (id === "web-tree-sitter") return WEB_TREE_SITTER;
    throw Object.assign(new Error(`Cannot find module '${id}' in the browser`), { code: "MODULE_NOT_FOUND" });
  };
  return Object.assign(require, { resolve });
}

export function isBuiltin(id: string): boolean {
  return builtinModules.includes(id.replace(/^node:/, ""));
}

export default { builtinModules, createRequire, isBuiltin };
