// File discovery and loading.

import { existsSync, readdirSync, readFileSync, realpathSync, statSync, type Dirent } from "node:fs";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { Document } from "./ir.ts";
import { parse } from "./parser.ts";

/**
 * Expand files and directories into a sorted list of `*.md` files.
 * Hidden directories, `node_modules` and `target` are skipped. A link is
 * followed like the file or directory it points to; a file reached through
 * two paths is one document. With `base` (absolute), a relative path is read
 * from there instead of the working directory; the files are still named as
 * the paths were given.
 */
export function collectMdFiles(paths: readonly string[], base?: string): string[] {
  const at = (p: string): string => (base === undefined ? p : resolve(base, p));
  const out: string[] = [];
  const walked = new Set<string>();
  for (const p of paths) {
    let st;
    try {
      st = statSync(at(p));
    } catch {
      throw new Error(`${p}: not found`);
    }
    if (st.isDirectory()) walkDir(p, out, walked, at);
    else out.push(p);
  }
  // `check d ./d/a.md` names one file twice, and so does a link to it; it is one
  // document, not a duplicate declaration. The path without a link names it.
  const chosen = new Map<string, string>();
  for (const file of out) {
    const key = realPath(at(file));
    const current = chosen.get(key);
    if (current === undefined || (resolve(at(current)) !== key && resolve(at(file)) === key)) chosen.set(key, file);
  }
  const keep = new Set(chosen.values());
  return out.filter((file) => keep.delete(file));
}

/** A directory the walk over a spec directory does not enter: hidden, `node_modules`, `target`. */
export function skippedDirectory(name: string): boolean {
  return name.startsWith(".") || name === "target" || name === "node_modules";
}

/** Whether the walk from `dir` (or `dir` itself, a file) reaches `abs`: inside it, and through no skipped directory below it. */
export function walkReaches(dir: string, abs: string): boolean {
  const rel = relative(dir, abs);
  if (rel === "") return true;
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return false;
  return !rel.split(sep).slice(0, -1).some(skippedDirectory);
}

function walkDir(dir: string, out: string[], walked: Set<string>, at: (p: string) => string): void {
  // A link back to an ancestor would walk forever.
  const real = realPath(at(dir));
  if (walked.has(real)) return;
  walked.add(real);
  const entries = readdirSync(at(dir), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    const p = join(dir, e.name);
    const type = entryType(e, at(p));
    if (type === "dir") {
      if (!skippedDirectory(e.name)) walkDir(p, out, walked, at);
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

/** A file's text, or null when it cannot be read for any reason: missing, a directory, no permission. */
export function readTextOrNull(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/** A file's text, or null when there is no file; a directory or an unreadable file throws, so the caller names it. */
export function existingText(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}
