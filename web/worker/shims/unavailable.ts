// What the analysis in the browser has no use for and no way to do: processes
// (git, agent CLIs), the home directory, a model's API, zlib. Imported at
// module level by code the read-only pipeline never calls; a call says why it
// cannot run here instead of doing something else.

function unavailable(what: string): () => never {
  return () => {
    throw new Error(`${what} is not available in the browser`);
  };
}

// node:child_process: a process that cannot start, the way `spawnSync` reports one.
export function spawnSync(command: string) {
  return { status: null, signal: null, stdout: "", stderr: "", pid: 0, output: [], error: Object.assign(new Error(`spawnSync ${command} ENOENT (no processes in the browser)`), { code: "ENOENT" }) };
}

export const spawn = unavailable("spawn");

export const execFile = unavailable("execFile");

export const execFileSync = unavailable("execFileSync");

export const execSync = unavailable("execSync");

export class ChildProcess {}

// node:os
export const homedir = (): string => "/home/keylang";

export const tmpdir = (): string => "/tmp";

export const platform = (): string => "browser";

export const EOL = "\n";

// node:zlib
export const inflateRawSync = unavailable("zlib");

export const deflateRawSync = unavailable("zlib");

// @anthropic-ai/sdk, eventsource-parser: no model is asked from the browser.
export class Anthropic {
  constructor() {
    throw new Error("a model is not available in the browser");
  }
}

export const createParser = unavailable("eventsource-parser");

export default { spawnSync, spawn, execFile, homedir, tmpdir, platform, EOL, inflateRawSync, Anthropic, createParser };
