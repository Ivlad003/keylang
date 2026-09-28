// File discovery and loading.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import type { Document } from "./ir.ts";
import { parse } from "./parser.ts";

/**
 * Expand files and directories into a sorted list of `*.md` files.
 * Hidden directories, `node_modules` and `target` are skipped.
 */
export function collectMdFiles(paths: readonly string[]): string[] {
  const out: string[] = [];
  for (const p of paths) {
    let st;
    try {
      st = statSync(p);
    } catch {
      throw new Error(`${p}: not found`);
    }
    if (st.isDirectory()) walkDir(p, out);
    else out.push(p);
  }
  // `check d ./d/a.md` names one file twice; it is one document, not a duplicate declaration.
  const seen = new Set<string>();
  return out.filter((file) => {
    const key = resolve(file);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function walkDir(dir: string, out: string[]): void {
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!e.name.startsWith(".") && e.name !== "target" && e.name !== "node_modules") walkDir(p, out);
    } else if (extname(e.name) === ".md") {
      out.push(p);
    }
  }
}

/** Read and parse files. */
export function load(files: readonly string[]): Document[] {
  return files.map((f) => parse(f, readFileSync(f, "utf8")));
}
