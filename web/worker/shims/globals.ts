// The globals of Node the pipeline reads, injected into every module of the
// worker bundle by esbuild (`inject`): `Buffer` (the buffer package) and a
// `process` with an empty environment and `/` as the working directory. No
// `versions.node`: web-tree-sitter must see a browser, not Node.

import { Buffer as BufferPolyfill } from "buffer";

const noop = (): boolean => true;

export const Buffer = BufferPolyfill;
export const process = {
  env: {} as Record<string, string | undefined>,
  platform: "linux",
  arch: "wasm",
  versions: {} as Record<string, string>,
  version: "",
  argv: [] as string[],
  execPath: "/keylang",
  pid: 1,
  exitCode: undefined as number | undefined,
  cwd: (): string => "/",
  stdout: { write: noop, isTTY: false },
  stderr: { write: noop, isTTY: false },
  emitWarning: (): void => {},
  on: (): void => {},
  off: (): void => {},
  once: (): void => {},
  nextTick: (fn: (...args: unknown[]) => void, ...args: unknown[]): void => void queueMicrotask(() => fn(...args)),
  hrtime: Object.assign((): [number, number] => {
    const ms = performance.now();
    return [Math.floor(ms / 1000), Math.round((ms % 1000) * 1e6)];
  }, { bigint: (): bigint => BigInt(Math.round(performance.now() * 1e6)) }),
  memoryUsage: (): { heapUsed: number; rss: number } => ({ heapUsed: 0, rss: 0 }),
};
