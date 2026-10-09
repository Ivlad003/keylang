// `node:fs` for the analysis in the browser: the files of the folder the
// person opened, in memory, read-only. keylang's pipeline reads with the sync
// API (`existsSync`, `statSync`, `readdirSync`, `readFileSync`…); every write
// throws EROFS, so the analysis cannot change what it reads — the same
// promise `web --read-only` makes. No links: a path is its own real path.

import { Buffer } from "buffer";
import { dirname, resolve } from "./path.ts";

type Data = Uint8Array | string;

const files = new Map<string, Data>();
const dirs = new Set<string>(["/"]);
/** Each directory's entries, name → whether it is a directory: a listing reads its own, not every path. */
const children = new Map<string, Map<string, boolean>>([["/", new Map()]]);
const decoder = new TextDecoder("utf-8");
const encoder = new TextEncoder();

function absolute(path: string | URL): string {
  return resolve(typeof path === "string" ? path : decodeURIComponent(path.pathname));
}

function entry(parent: string, name: string, directory: boolean): void {
  let own = children.get(parent);
  if (!own) children.set(parent, (own = new Map()));
  own.set(name, directory);
}

function addDirs(path: string): void {
  for (let dir = path; !dirs.has(dir); dir = dirname(dir)) {
    dirs.add(dir);
    children.set(dir, children.get(dir) ?? new Map());
    entry(dirname(dir), dir.slice(dir.lastIndexOf("/") + 1), true);
  }
}

/** Puts a file (bytes or text) at an absolute path, with the directories above it. */
export function mountFile(path: string, data: Data): void {
  const abs = absolute(path);
  files.set(abs, data);
  addDirs(dirname(abs));
  entry(dirname(abs), abs.slice(abs.lastIndexOf("/") + 1), false);
}

/** An empty directory (the extractor's own, whose code `map.ts` hashes). */
export function mountDirectory(path: string): void {
  addDirs(absolute(path));
}

function failure(code: string, syscall: string, path: string): Error {
  const text: Record<string, string> = { ENOENT: "no such file or directory", ENOTDIR: "not a directory", EISDIR: "illegal operation on a directory", EROFS: "read-only file system", EINVAL: "invalid argument", EBADF: "bad file descriptor" };
  return Object.assign(new Error(`${code}: ${text[code] ?? code}, ${syscall} '${path}'`), { code, syscall, path, errno: -1 });
}

export class Stats {
  readonly size: number;
  readonly mtimeMs = 0;
  readonly mtime = new Date(0);
  readonly ctimeMs = 0;
  readonly birthtimeMs = 0;
  readonly mode: number;
  readonly dev = 1;
  readonly ino: number;
  private readonly directory: boolean;

  constructor(directory: boolean, size: number, ino: number) {
    this.directory = directory;
    this.size = size;
    this.ino = ino;
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

function sizeOf(data: Data): number {
  return typeof data === "string" ? encoder.encode(data).length : data.length;
}

/** A stable number per path: `ino` lets callers tell two paths of one file apart, which here never happens. */
function inode(path: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < path.length; i++) hash = Math.imul(hash ^ path.charCodeAt(i), 0x01000193) >>> 0;
  return hash;
}

export function existsSync(path: string | URL): boolean {
  const abs = absolute(path);
  return files.has(abs) || dirs.has(abs);
}

export function statSync(path: string | URL, options?: { throwIfNoEntry?: boolean }): Stats | undefined {
  const abs = absolute(path);
  const data = files.get(abs);
  if (data !== undefined) return new Stats(false, sizeOf(data), inode(abs));
  if (dirs.has(abs)) return new Stats(true, 0, inode(abs));
  if (options?.throwIfNoEntry === false) return undefined;
  throw failure("ENOENT", "stat", abs);
}

export const lstatSync = statSync;

export function accessSync(path: string | URL): void {
  if (!existsSync(path)) throw failure("ENOENT", "access", absolute(path));
}

export function realpathSync(path: string | URL): string {
  const abs = absolute(path);
  if (!existsSync(abs)) throw failure("ENOENT", "realpath", abs);
  return abs;
}
realpathSync.native = realpathSync;

export function readlinkSync(path: string | URL): string {
  throw failure("EINVAL", "readlink", absolute(path));
}

function encodingOf(options: unknown): string | null {
  if (typeof options === "string") return options;
  if (options !== null && typeof options === "object" && typeof (options as { encoding?: unknown }).encoding === "string") return (options as { encoding: string }).encoding;
  return null;
}

export function readFileSync(path: string | URL | number, options?: unknown): string | Buffer {
  const abs = typeof path === "number" ? descriptor(path, "read").path : absolute(path);
  const data = files.get(abs);
  if (data === undefined) throw failure(dirs.has(abs) ? "EISDIR" : "ENOENT", "open", abs);
  const encoding = encodingOf(options);
  if (encoding !== null) {
    const text = typeof data === "string" ? data : decoder.decode(data);
    // Decoded once: a file read again (the map, a manifest) costs nothing more.
    files.set(abs, text);
    return encoding === "utf8" || encoding === "utf-8" ? text : Buffer.from(text, "utf8").toString(encoding as BufferEncoding);
  }
  return Buffer.from(typeof data === "string" ? encoder.encode(data) : data);
}

export function readdirSync(path: string | URL, options?: unknown): (string | Dirent)[] {
  const abs = absolute(path);
  if (files.has(abs)) throw failure("ENOTDIR", "scandir", abs);
  if (!dirs.has(abs)) throw failure("ENOENT", "scandir", abs);
  const withTypes = typeof options === "object" && options !== null && (options as { withFileTypes?: unknown }).withFileTypes === true;
  const recursive = typeof options === "object" && options !== null && (options as { recursive?: unknown }).recursive === true;
  const out: (string | Dirent)[] = [];
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
let nextFd = 3;

function descriptor(fd: number, syscall: string): { path: string; at: number } {
  const found = open.get(fd);
  if (!found) throw failure("EBADF", syscall, String(fd));
  return found;
}

export function openSync(path: string | URL, flags: string | number = "r"): number {
  const abs = absolute(path);
  if (flags !== "r" && flags !== 0) throw failure("EROFS", "open", abs);
  if (!files.has(abs)) throw failure(dirs.has(abs) ? "EISDIR" : "ENOENT", "open", abs);
  const fd = nextFd++;
  open.set(fd, { path: abs, at: 0 });
  return fd;
}

export function readSync(fd: number, buffer: Uint8Array, offset = 0, length = buffer.length - offset, position: number | null = null): number {
  const state = descriptor(fd, "read");
  const data = files.get(state.path)!;
  const bytes = typeof data === "string" ? encoder.encode(data) : data;
  const from = position ?? state.at;
  const count = Math.max(0, Math.min(length, bytes.length - from));
  buffer.set(bytes.subarray(from, from + count), offset);
  if (position === null) state.at += count;
  return count;
}

export function closeSync(fd: number): void {
  descriptor(fd, "close");
  open.delete(fd);
}

function readOnly(syscall: string): (path: unknown) => never {
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
