// `node:fs` for the analysis in the browser: the files of the folder the
// person opened, in memory, read-only. keylang's pipeline reads with the sync
// API (`existsSync`, `statSync`, `readdirSync`, `readFileSync`…); every write
// throws EROFS, so the analysis cannot change what it reads — the same
// promise `web --read-only` makes. No links: a path is its own real path.

import { Buffer } from "buffer";
import { dirname, resolve } from "./path.ts";

type Data = Uint8Array | string;

/** What a read is passed, as Node takes it: an encoding, or options that may name one. */
export type ReadOptions = BufferEncoding | { encoding?: BufferEncoding | null; flag?: string } | null;

/** What a listing is passed, as Node takes it. */
export type ReaddirOptions = BufferEncoding | { encoding?: BufferEncoding | null; withFileTypes?: boolean; recursive?: boolean } | null;

/** Node lets an options argument be the encoding alone. */
function isEncodingName<Options>(options: BufferEncoding | Options): options is BufferEncoding {
  return typeof options === "string";
}

/** A number in place of a path is a file descriptor from `openSync`. */
function isDescriptor(path: string | URL | number): path is number {
  return typeof path === "number";
}

/** Absolute path → content: bytes as mounted, or text once a read decoded it. */
const files = new Map<string, Data>();

/** The modification time a file came with (`File.lastModified`), ms; 0 when none was given. */
const mtimes = new Map<string, number>();

/** Every directory that exists: the root, and each one above a mounted file or directory. */
const dirs = new Set<string>(["/"]);

/** Each directory's entries, name → whether it is a directory: a listing reads its own, not every path. */
const children = new Map<string, Map<string, boolean>>([["/", new Map()]]);

const decoder = new TextDecoder("utf-8");

const encoder = new TextEncoder();

/** The absolute POSIX path for a path or file URL; relative paths resolve against the shimmed cwd, `/`. */
function absolute(path: string | URL): string {
  return resolve(path instanceof URL ? decodeURIComponent(path.pathname) : path);
}

/** Records `name` in its parent's listing, creating the listing on first use. */
function entry(parent: string, name: string, directory: boolean): void {
  let own = children.get(parent);

  if (!own) children.set(parent, (own = new Map()));
  own.set(name, directory);
}

/** Creates `path` and every missing directory above it, linking each into its parent's listing. */
function addDirs(path: string): void {
  // Climb until an existing directory: everything above it is already linked (the root always exists).
  for (let dir = path; !dirs.has(dir); dir = dirname(dir)) {
    dirs.add(dir);
    children.set(dir, children.get(dir) ?? new Map());
    entry(dirname(dir), dir.slice(dir.lastIndexOf("/") + 1), true);
  }
}

/** Puts a file (bytes or text) at an absolute path, with the directories above it; `mtime` in ms. */
export function mountFile(path: string, data: Data, mtime?: number): void {
  const abs = absolute(path);
  files.set(abs, data);

  if (mtime !== undefined) mtimes.set(abs, mtime);
  addDirs(dirname(abs));
  entry(dirname(abs), abs.slice(abs.lastIndexOf("/") + 1), false);
}

/** An empty directory (the extractor's own, whose code `map.ts` hashes). */
export function mountDirectory(path: string): void {
  addDirs(absolute(path));
}

const ERROR_TEXT = new Map([
  ["ENOENT", "no such file or directory"],
  ["ENOTDIR", "not a directory"],
  ["EISDIR", "illegal operation on a directory"],
  ["EROFS", "read-only file system"],
  ["EINVAL", "invalid argument"],
  ["EBADF", "bad file descriptor"],
]);

/** An error shaped as Node's fs errors are (`code`, `syscall`, `path`), since callers branch on `code`. */
function failure(code: string, syscall: string, path: string): Error {
  return Object.assign(new Error(`${code}: ${ERROR_TEXT.get(code) ?? code}, ${syscall} '${path}'`), { code, syscall, path, errno: -1 });
}

/** The fields of Node's `Stats` the pipeline and isomorphic-git read; modes are read-only, there are no links. */
export class Stats {
  readonly size: number;
  readonly mtimeMs: number;
  readonly mtime: Date;
  readonly ctimeMs = 0;
  readonly birthtimeMs = 0;
  readonly mode: number;
  readonly dev = 1;
  readonly ino: number;
  private readonly directory: boolean;

  constructor(directory: boolean, size: number, ino: number, mtimeMs = 0) {
    this.directory = directory;
    this.size = size;
    this.ino = ino;
    this.mtimeMs = mtimeMs;
    this.mtime = new Date(mtimeMs);
    this.mode = directory ? 0o40555 : 0o100444;
  }

  isFile(): boolean {
    return !this.directory;
  }

  isDirectory(): boolean {
    return this.directory;
  }

  isSymbolicLink(): boolean {
    return false;
  }
}

/** A listing entry for `readdirSync(…, { withFileTypes: true })`; `path` is Node's older alias of `parentPath`. */
export class Dirent {
  readonly name: string;
  readonly parentPath: string;
  readonly path: string;
  private readonly directory: boolean;

  constructor(name: string, parentPath: string, directory: boolean) {
    this.name = name;
    this.parentPath = parentPath;
    this.path = parentPath;
    this.directory = directory;
  }

  isFile(): boolean {
    return !this.directory;
  }

  isDirectory(): boolean {
    return this.directory;
  }

  isSymbolicLink(): boolean {
    return false;
  }
}

function bytesOf(data: Data): Uint8Array {
  return data instanceof Uint8Array ? data : encoder.encode(data);
}

/** A stable number per path: `ino` lets callers tell two paths of one file apart, which here never happens. */
function inode(path: string): number {
  // FNV-1a, 32-bit: cheap and deterministic, so the same path keeps its number across reads.
  let hash = 0x811c9dc5;

  for (let i = 0; i < path.length; i++) hash = Math.imul(hash ^ path.charCodeAt(i), 0x01000193) >>> 0;

  return hash;
}

/** Whether a file or directory is mounted at the path. */
export function existsSync(path: string | URL): boolean {
  const abs = absolute(path);

  return files.has(abs) || dirs.has(abs);
}

/** A file's or directory's `Stats`; with `throwIfNoEntry: false` a missing path is `undefined`, as on Node. */
export function statSync(path: string | URL, options?: { throwIfNoEntry?: boolean }): Stats | undefined {
  const abs = absolute(path);
  const data = files.get(abs);

  if (data !== undefined) return new Stats(false, bytesOf(data).length, inode(abs), mtimes.get(abs) ?? 0);

  if (dirs.has(abs)) return new Stats(true, 0, inode(abs));

  if (options?.throwIfNoEntry === false) return undefined;
  throw failure("ENOENT", "stat", abs);
}

export const lstatSync = statSync;

export function accessSync(path: string | URL): void {
  if (!existsSync(path)) throw failure("ENOENT", "access", absolute(path));
}

/** The absolute path itself: with no links, every path is already real. */
export function realpathSync(path: string | URL): string {
  const abs = absolute(path);

  if (!existsSync(abs)) throw failure("ENOENT", "realpath", abs);

  return abs;
}

realpathSync.native = realpathSync;

/** Always EINVAL, Node's answer for a path that is not a link. */
export function readlinkSync(path: string | URL): string {
  throw failure("EINVAL", "readlink", absolute(path));
}

/** The encoding a read asks for, or null for raw bytes. */
function encodingOf(options: ReadOptions | undefined): BufferEncoding | null {
  if (isEncodingName(options)) return options;

  return options?.encoding ?? null;
}

/** A file's content as a Buffer, or as text when an encoding is given; a path or an `openSync` descriptor. */
export function readFileSync(path: string | URL | number, options?: { encoding?: null; flag?: string } | null): Buffer;
export function readFileSync(path: string | URL | number, options: BufferEncoding | { encoding: BufferEncoding; flag?: string }): string;
export function readFileSync(path: string | URL | number, options?: ReadOptions): string | Buffer;
export function readFileSync(path: string | URL | number, options?: ReadOptions): string | Buffer {
  const abs = isDescriptor(path) ? descriptor(path, "read").path : absolute(path);
  const data = files.get(abs);

  if (data === undefined) throw failure(dirs.has(abs) ? "EISDIR" : "ENOENT", "open", abs);
  const encoding = encodingOf(options);

  if (encoding !== null) {
    const text = data instanceof Uint8Array ? decoder.decode(data) : data;
    // Decoded once: a file read again (the map, a manifest) costs nothing more.
    files.set(abs, text);

    return encoding === "utf8" || encoding === "utf-8" ? text : Buffer.from(text, "utf8").toString(encoding);
  }

  return Buffer.from(bytesOf(data));
}

/** A directory's entries, names or `Dirent`s, optionally recursive (names then relative to `path`). */
export function readdirSync(path: string | URL, options: { withFileTypes: true; recursive?: boolean }): Dirent[];
export function readdirSync(path: string | URL, options?: BufferEncoding | { encoding?: BufferEncoding | null; withFileTypes?: false; recursive?: boolean } | null): string[];
export function readdirSync(path: string | URL, options?: ReaddirOptions): (string | Dirent)[];
export function readdirSync(path: string | URL, options?: ReaddirOptions): (string | Dirent)[] {
  const abs = absolute(path);

  if (files.has(abs)) throw failure("ENOTDIR", "scandir", abs);

  if (!dirs.has(abs)) throw failure("ENOENT", "scandir", abs);

  // Node accepts an encoding name in place of options; then there are no flags to read.
  const listing = isEncodingName(options) ? null : options;
  const withTypes = listing?.withFileTypes === true;
  const recursive = listing?.recursive === true;
  const out: (string | Dirent)[] = [];

  // Depth-first, each directory's entries sorted by name, so a listing is the same whatever order files were mounted in.
  const walk = (dir: string, rel: string): void => {
    for (const [name, directory] of [...(children.get(dir) ?? [])].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      const path = dir === "/" ? `/${name}` : `${dir}/${name}`;
      out.push(withTypes ? new Dirent(name, dir, directory) : `${rel}${name}`);

      if (recursive && directory) walk(path, `${rel}${name}/`);
    }
  };

  walk(abs, "");

  return out;
}

// Descriptors for the readers that stream a file (trace evidence): read-only, in memory.
const open = new Map<number, { path: string; at: number }>();

/** Descriptors start at 3, after the standard streams, as on a real process. */
let nextFd = 3;

/** The open file behind a descriptor, or EBADF naming the call. */
function descriptor(fd: number, syscall: string): { path: string; at: number } {
  const found = open.get(fd);

  if (!found) throw failure("EBADF", syscall, String(fd));

  return found;
}

/** Opens a file for reading only; any write flag fails with EROFS. */
export function openSync(path: string | URL, flags: string | number = "r"): number {
  const abs = absolute(path);

  if (flags !== "r" && flags !== 0) throw failure("EROFS", "open", abs);

  if (!files.has(abs)) throw failure(dirs.has(abs) ? "EISDIR" : "ENOENT", "open", abs);
  const fd = nextFd++;
  open.set(fd, { path: abs, at: 0 });

  return fd;
}

/**
 * Reads up to `length` bytes into `buffer` at `offset`; from `position` when given,
 * else from the descriptor's own position, which then advances.
 */
export function readSync(fd: number, buffer: Uint8Array, offset = 0, length = buffer.length - offset, position: number | null = null): number {
  const state = descriptor(fd, "read");
  const data = files.get(state.path)!;
  const bytes = bytesOf(data);
  const from = position ?? state.at;
  // Clamp to the end of the file: past it, a read returns 0 bytes rather than failing.
  const count = Math.max(0, Math.min(length, bytes.length - from));
  buffer.set(bytes.subarray(from, from + count), offset);

  if (position === null) state.at += count;

  return count;
}

/** Closes a descriptor; closing an unknown one is EBADF. */
export function closeSync(fd: number): void {
  descriptor(fd, "close");
  open.delete(fd);
}

/** A write operation that always fails with EROFS: the folder is read-only. */
function readOnly(syscall: string): (path: string | URL | number) => never {
  return (path) => {
    throw failure("EROFS", syscall, String(path));
  };
}

export const writeFileSync = readOnly("open");

export const mkdirSync = readOnly("mkdir");

export const mkdtempSync = readOnly("mkdtemp");

export const rmSync = readOnly("rm");

export const rmdirSync = readOnly("rmdir");

export const renameSync = readOnly("rename");

export const chmodSync = readOnly("chmod");

export const unlinkSync = readOnly("unlink");

export const appendFileSync = readOnly("open");

export const copyFileSync = readOnly("copyfile");

export const cpSync = readOnly("cp");

export const constants = { F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1, O_RDONLY: 0 };

export default { existsSync, statSync, lstatSync, accessSync, realpathSync, readlinkSync, readFileSync, readdirSync, openSync, readSync, closeSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, rmdirSync, renameSync, chmodSync, unlinkSync, appendFileSync, copyFileSync, cpSync, constants, Stats, Dirent };
