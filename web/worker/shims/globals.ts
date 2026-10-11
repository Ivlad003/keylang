// The globals of Node the pipeline reads, injected into every module of the
// worker bundle by esbuild (`inject`): `Buffer` (the buffer package) and a
// `process` with an empty environment and `/` as the working directory. No
// `versions.node`: web-tree-sitter must see a browser, not Node.

import { Buffer as BufferPolyfill } from "buffer";

const noop = (): boolean => true;

export const Buffer = BufferPolyfill;

/** The `process` the pipeline reads in the browser: Node's fields it touches, empty or inert. */
interface BrowserProcess {
  env: Record<string, string | undefined>;
  platform: string;
  arch: string;
  versions: Record<string, string>;
  version: string;
  argv: string[];
  execPath: string;
  pid: number;
  exitCode: number | undefined;
  cwd: () => string;
  stdout: { write: () => boolean; isTTY: boolean };
  stderr: { write: () => boolean; isTTY: boolean };
  emitWarning: () => void;
  on: () => void;
  off: () => void;
  once: () => void;
  nextTick: (fn: (...args: unknown[]) => void, ...args: unknown[]) => void;
  hrtime: (() => [number, number]) & { bigint: () => bigint };
  memoryUsage: () => { heapUsed: number; rss: number };
}

export const process: BrowserProcess = {
  env: {},
  platform: "linux",
  arch: "wasm",
  versions: {},
  version: "",
  argv: [],
  execPath: "/keylang",
  pid: 1,
  exitCode: undefined,
  cwd: () => "/",
  stdout: { write: noop, isTTY: false },
  stderr: { write: noop, isTTY: false },
  emitWarning: () => {},
  on: () => {},
  off: () => {},
  once: () => {},
  nextTick: (fn, ...args) => void queueMicrotask(() => fn(...args)),
  hrtime: Object.assign((): [number, number] => {
    const ms = performance.now();

    return [Math.floor(ms / 1000), Math.round((ms % 1000) * 1e6)];
  }, { bigint: (): bigint => BigInt(Math.round(performance.now() * 1e6)) }),
  memoryUsage: () => ({ heapUsed: 0, rss: 0 }),
};
