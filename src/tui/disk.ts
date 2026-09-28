// The files a session reads and writes: text with the line endings it came
// with, and writes that never land outside a boundary directory — not through
// a symbolic link either, including one whose target does not exist yet.

import { readFileSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { within } from "../analyze.ts";
import { landing, writeAtomic } from "../safe-write.ts";

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
 * that target). The CLI's write protocol (`safe-write.ts`) decides it the same way.
 */
export function landingPath(abs: string): string {
  const target = landing(abs);
  if (target === null) throw new Error(`${abs}: too many levels of symbolic links`);
  return target;
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
  // The one atomic write of the repository: a temporary file renamed over the target, permissions kept.
  writeAtomic(destination(abs, options), text);
}

/** Removes the file a write to `abs` would change, when it is inside `boundary`; a missing file is no error. */
export function removeInside(boundary: string, abs: string, options: WriteOptions = {}): void {
  const problem = leavesBoundary(boundary, abs, options);
  if (problem) throw new Error(`${problem}; nothing removed`);
  rmSync(destination(abs, options), { force: true });
}
