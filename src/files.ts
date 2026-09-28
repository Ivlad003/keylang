// File discovery and loading.

import { readdirSync, readFileSync, realpathSync, statSync, type Dirent } from "node:fs";
import { extname, join, resolve } from "node:path";
import type { Document } from "./ir.ts";
import { parse } from "./parser.ts";

/**
 * Expand files and directories into a sorted list of `*.md` files.
 * Hidden directories, `node_modules` and `target` are skipped. A link is
 * followed like the file or directory it points to; a file reached through
 * two paths is one document.
 */
export function collectMdFiles(paths: readonly string[]): string[] {
  const out: string[] = [];
  const walked = new Set<string>();
  for (const p of paths) {
    let st;
    try {
      st = statSync(p);
    } catch {
      throw new Error(`${p}: not found`);
    }
    if (st.isDirectory()) walkDir(p, out, walked);
    else out.push(p);
  }
  // `check d ./d/a.md` names one file twice, and so does a link to it; it is one
  // document, not a duplicate declaration. The path without a link names it.
  const chosen = new Map<string, string>();
  for (const file of out) {
    const key = realPath(file);
    const current = chosen.get(key);
    if (current === undefined || (resolve(current) !== key && resolve(file) === key)) chosen.set(key, file);
  }
  const keep = new Set(chosen.values());
  return out.filter((file) => keep.delete(file));
}

function walkDir(dir: string, out: string[], walked: Set<string>): void {
  // A link back to an ancestor would walk forever.
  const real = realPath(dir);
  if (walked.has(real)) return;
  walked.add(real);
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    const p = join(dir, e.name);
    const type = entryType(e, p);
    if (type === "dir") {
      if (!e.name.startsWith(".") && e.name !== "target" && e.name !== "node_modules") walkDir(p, out, walked);
    } else if (type === "file" && extname(e.name) === ".md") {
      out.push(p);
    }
  }
}

/** What a directory entry is, through a link; a dangling link is neither. */
function entryType(e: Dirent, path: string): "dir" | "file" | null {
  if (!e.isSymbolicLink()) return e.isDirectory() ? "dir" : e.isFile() ? "file" : null;
  try {
    const st = statSync(path);
    return st.isDirectory() ? "dir" : st.isFile() ? "file" : null;
  } catch {
    return null;
  }
}

function realPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/** Read and parse files. */
export function load(files: readonly string[]): Document[] {
  return files.map((f) => parse(f, readFileSync(f, "utf8")));
}
