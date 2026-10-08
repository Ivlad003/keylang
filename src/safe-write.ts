// One protocol for every file keylang writes into a repository: proposals,
// `spec-to-code --apply`, `wire`, `.keylang/stats.json`, explanations, the
// map with its index and fact cache (byte-exact, see `writeAtomic`). The
// path is plain and relative, and it stays inside the repository once every
// link on the way is followed — a link whose target does not exist yet
// included, since the write would create that target. A file with a
// `keylang:generated` marker is written only by its generator. The write is
// atomic: a temporary file next to the target, renamed over it, with the
// permissions of the file it replaces; a file with CRLF on every line keeps
// CRLF. Computing what to write stays with the caller.

import { randomBytes } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, statSync, writeFileSync, type Stats } from "node:fs";
import { basename, dirname, isAbsolute, join, posix, relative, resolve, sep, win32 } from "node:path";

export interface WriteOptions {
  /** A directory, relative to the root and POSIX, the file must stay under with links followed. Default: the root. */
  under?: string;
  /** The writer is the file's generator: a file with a `keylang:generated` marker may be replaced. Default: refused. */
  generated?: boolean;
  /**
   * The text the new one was made from. The file must still hold it (`null`:
   * it must not exist yet); otherwise nothing is written, because someone
   * changed it meanwhile. Left out: not compared.
   */
  expect?: string | null;
}

export interface PlannedWrite {
  /** Relative to the root, POSIX. */
  path: string;
  text: string;
  options?: WriteOptions;
}

const LINK_HOPS = 32;

/**
 * Why `path` (relative to `root`, POSIX) may not be a target of keylang's at
 * all — written, removed or read as keylang's own file — or null: not a plain
 * relative path, a loop of links, or a place outside the repository (or
 * outside `under`) once every link on the way is followed. A removal needs
 * this check as much as a write: `rm` of `.cursor/x` follows a linked
 * `.cursor` to wherever it points.
 */
export function targetProblem(root: string, path: string, options: Pick<WriteOptions, "under"> = {}): string | null {
  if (path === "" || path.includes("\\") || posix.isAbsolute(path) || win32.isAbsolute(path)) return "not a plain relative path";
  if (path.split("/").some((part) => part === ".." || part === "." || part === "")) return "not a plain relative path";
  const target = landing(join(root, path));
  if (target === null) return "leads through a loop of links";
  if (!inside(target, realpathSync(root))) return "leads out of the repository through a link";
  if (options.under !== undefined) {
    const base = landing(join(root, options.under));
    if (base === null || !inside(target, base)) return `leads out of ${options.under}/ through a link`;
  }
  return null;
}

/** Why `path` (relative to `root`, POSIX) may not be written, or null. Reads nothing outside the repository. */
export function writeProblem(root: string, path: string, options: WriteOptions = {}): string | null {
  const place = targetProblem(root, path, options);
  if (place !== null) return place;
  const target = landing(join(root, path))!;
  const entry = statOrNull(target);
  if (entry?.isDirectory()) return "a directory";
  const current = entry ? readFileSync(target, "utf8") : null;
  if (current !== null && options.generated !== true && isGeneratedText(current)) return "a generated file: only its generator writes it";
  if (options.expect !== undefined && current !== options.expect) {
    return options.expect === null ? "created on disk while the change was prepared; nothing written" : "changed on disk while the change was prepared; nothing written";
  }
  return null;
}

/**
 * Writes `text` to `path` (relative to `root`, POSIX) when `writeProblem`
 * finds nothing, and returns the absolute path; throws `path: problem`
 * otherwise. A symlinked file is written at its target, so the link stays.
 */
export function safeWrite(root: string, path: string, text: string, options: WriteOptions = {}): string {
  return safeWriteAll(root, [{ path, text, options }])[0]!;
}

/** Every write is checked before the first one happens: either all land, or (short of an I/O error) none does. */
export function safeWriteAll(root: string, writes: readonly PlannedWrite[]): string[] {
  for (const w of writes) {
    const problem = writeProblem(root, w.path, w.options);
    if (problem !== null) throw new Error(`${w.path}: ${problem}`);
  }
  return writes.map((w) => {
    writeAtomic(landing(join(root, w.path))!, w.text);
    return join(root, w.path);
  });
}

/**
 * A temporary file in the target's directory renamed over the target, so a
 * crash never leaves half a file; missing directories are created. The new
 * file keeps the permissions of the one it replaces, and CRLF when that one
 * has CRLF on every line — unless `exact`: a generated artifact (the map, the
 * index) is the generator's bytes, so the next comparison finds it current.
 * `abs` is where the bytes land: not a link.
 */
export function writeAtomic(abs: string, text: string, options: { exact?: boolean } = {}): void {
  mkdirSync(dirname(abs), { recursive: true });
  const existing = statOrNull(abs);
  const mode = existing?.isFile() ? existing.mode & 0o7777 : undefined;
  const out = options.exact !== true && existing?.isFile() && allCrlf(readFileSync(abs, "utf8")) ? text.replace(/\r?\n/g, "\r\n") : text;
  const temporary = join(dirname(abs), `.${basename(abs)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  try {
    // `wx`: a link planted at the temporary name is never followed.
    writeFileSync(temporary, out, { flag: "wx", ...(mode === undefined ? {} : { mode }) });
    if (mode !== undefined) chmodSync(temporary, mode);
    renameSync(temporary, abs);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

/**
 * The first non-empty line is a `keylang:generated` marker: `<!-- … -->` of a
 * map file, `// …` of `keylang wire`, `' …` or `%% …` of a PlantUML or
 * Mermaid diagram of `keylang export c4`.
 */
export function isGeneratedText(text: string): boolean {
  const first = text.replace(/^﻿/, "").split(/\r?\n/).find((line) => line.trim() !== "");
  return first !== undefined && /^\s*(?:<!--|\/\/|'|%%).*keylang:generated/.test(first);
}

/** Every line ends with CRLF (at least one does): the file keeps them when it is rewritten. */
export function allCrlf(text: string): boolean {
  const crlf = text.split("\r\n").length - 1;
  return crlf > 0 && crlf === text.split("\n").length - 1;
}

/**
 * `next`, an edit of `before` computed on its LF form, in the line endings
 * of `before`. LF stays LF and CRLF on every line stays CRLF on every line.
 * A file with mixed endings is not normalized: a line kept from `before`
 * keeps its own ending, a new line takes the file's most common one (LF on a
 * tie). Kept lines are the common head and tail, and in between the lines
 * met again in order: linear, so a large file costs no diff table.
 */
export function keepLineEndings(before: string, next: string): string {
  if (!before.includes("\r\n")) return next;
  if (allCrlf(before)) return next.replace(/\n/g, "\r\n");
  const old = before.split("\n");
  // A line has an ending when a `\n` follows it; its `\r` is part of that ending.
  const oldCr = old.map((line, i) => i < old.length - 1 && line.endsWith("\r"));
  const oldText = old.map((line, i) => (oldCr[i] ? line.slice(0, -1) : line));
  const crlf = oldCr.filter(Boolean).length;
  const preferCr = crlf > old.length - 1 - crlf;
  const lines = next.split("\n");
  const cr: boolean[] = lines.map(() => preferCr);
  // The last piece (after the last `\n`) is no line with an ending: it pairs only with the other last piece, in the tail.
  let head = 0;
  while (head < lines.length - 1 && head < oldText.length - 1 && lines[head] === oldText[head]) {
    cr[head] = oldCr[head]!;
    head++;
  }
  let tailNew = lines.length;
  let tailOld = oldText.length;
  while (tailNew > head && tailOld > head && lines[tailNew - 1] === oldText[tailOld - 1]) {
    tailNew--;
    tailOld--;
    cr[tailNew] = oldCr[tailOld]!;
  }
  const midNew = Math.min(tailNew, lines.length - 1);
  const midOld = Math.min(tailOld, oldText.length - 1);
  for (let i = head, j = head; i < midNew && j < midOld; i++) {
    if (lines[i] !== oldText[j]) continue;
    cr[i] = oldCr[j]!;
    j++;
  }
  return lines.map((line, i) => (i < lines.length - 1 && cr[i] ? `${line}\r` : line)).join("\n");
}

/**
 * Where bytes written to `abs` land: the longest prefix that exists is
 * resolved through links, and a link on the way is followed even when its
 * target does not exist yet. Null for a loop of links.
 */
export function landing(abs: string, hops = 0): string | null {
  if (hops > LINK_HOPS) return null;
  let entry = abs;
  const rest: string[] = [];
  while (lstatOrNull(entry) === null) {
    const parent = dirname(entry);
    if (parent === entry) return abs;
    rest.unshift(basename(entry));
    entry = parent;
  }
  if (lstatOrNull(entry)!.isSymbolicLink()) return landing(join(resolve(dirname(entry), readlinkSync(entry)), ...rest), hops + 1);
  return join(realpathSync(entry), ...rest);
}

function inside(abs: string, dir: string): boolean {
  const rel = relative(dir, abs);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function lstatOrNull(abs: string): Stats | null {
  try {
    return lstatSync(abs);
  } catch {
    return null;
  }
}

function statOrNull(abs: string): Stats | null {
  try {
    return statSync(abs);
  } catch {
    return null;
  }
}
