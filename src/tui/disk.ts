// The files a session reads and writes: text with the line endings it came
// with, and writes that never land outside a boundary directory — not through
// a symbolic link either, including one whose target does not exist yet.

import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, parse, resolve, sep } from "node:path";
import { within } from "../analyze.ts";

export type Eol = "\n" | "\r\n";

export function readText(abs: string): string | null {
  try {
    return readFileSync(abs, "utf8");
  } catch {
    return null;
  }
}

export function lf(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

/**
 * A file's text with `\n` line ends, and the ending a save restores. Only a
 * file that uses CRLF throughout is converted; mixed endings stay as they
 * are, so a save does not touch lines nobody edited.
 */
export function splitEol(raw: string): { text: string; eol: Eol } {
  const crlf = raw.split("\r\n").length - 1;
  const lfs = raw.split("\n").length - 1;
  return crlf > 0 && crlf === lfs ? { text: lf(raw), eol: "\r\n" } : { text: raw, eol: "\n" };
}

export function withEol(text: string, eol: Eol): string {
  return eol === "\n" ? text : text.replace(/\n/g, eol);
}

/**
 * Where a write to `abs` lands: every symbolic link on the way followed,
 * the last one too when its target does not exist yet (a write would create
 * that target). The part that does not exist is kept as written.
 */
export function landingPath(abs: string): string {
  let done = parse(abs).root;
  let rest = parts(abs);
  for (let hops = 0; rest.length > 0; ) {
    const [part, ...after] = rest as [string, ...string[]];
    const next = join(done, part);
    let link: string | null = null;
    try {
      const stat = lstatSync(next);
      if (stat.isSymbolicLink()) link = readlinkSync(next);
    } catch {
      // Missing: nothing below it exists either.
      return join(next, ...after);
    }
    if (link === null) {
      done = next;
      rest = after;
      continue;
    }
    if (++hops > 40) throw new Error(`${abs}: too many levels of symbolic links`);
    const target = resolve(done, link);
    done = parse(target).root;
    rest = [...parts(target), ...after];
  }
  return done;
}

function parts(abs: string): string[] {
  return abs.slice(parse(abs).root.length).split(sep).filter((part) => part !== "");
}

/**
 * `link: "follow"` (a spec or source file): a symlinked file is written at
 * its target, so the link stays. `link: "replace"` (a file of keylang's own,
 * such as a proposal): a link there is replaced, never written through.
 */
export interface WriteOptions {
  link?: "follow" | "replace";
}

/** The file a write to `abs` changes. */
function destination(abs: string, options: WriteOptions): string {
  return options.link === "replace" ? join(landingPath(dirname(abs)), basename(abs)) : landingPath(abs);
}

/** Why a write to `abs` may not happen — it lands outside `boundary` — or null when it stays inside. */
export function leavesBoundary(boundary: string, abs: string, options: WriteOptions = {}): string | null {
  if (within(destination(abs, options), landingPath(boundary))) return null;
  return `${abs} leads out of ${boundary} through a link`;
}

/**
 * Writes `text` to `abs` through a temporary file and a rename, so a crash
 * never leaves half a file; a missing directory is created. A write that
 * would land outside `boundary` throws before anything is touched.
 */
export function writeInside(boundary: string, abs: string, text: string, options: WriteOptions = {}): void {
  const problem = leavesBoundary(boundary, abs, options);
  if (problem) throw new Error(`${problem}; nothing written`);
  const target = destination(abs, options);
  mkdirSync(dirname(target), { recursive: true });
  // The new file keeps the permissions of the one it replaces.
  const mode = existsSync(target) && !lstatSync(target).isSymbolicLink() ? statSync(target).mode & 0o7777 : undefined;
  // A random name created exclusively: a prepared file or link at that name is never written through.
  const temporary = `${target}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    writeFileSync(temporary, text, { flag: "wx", ...(mode === undefined ? {} : { mode }) });
    if (mode !== undefined) chmodSync(temporary, mode);
    renameSync(temporary, target);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

/** Removes the file a write to `abs` would change, when it is inside `boundary`; a missing file is no error. */
export function removeInside(boundary: string, abs: string, options: WriteOptions = {}): void {
  const problem = leavesBoundary(boundary, abs, options);
  if (problem) throw new Error(`${problem}; nothing removed`);
  rmSync(destination(abs, options), { force: true });
}
