// Fake agent CLIs on a PATH of their own (`tests/fixtures/fake-agent.mjs`):
// `/bin/sh` wrappers that exec this Node, so no `node` is needed on PATH.

import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "fixtures/fake-agent.mjs");

export interface FakeCall {
  as: string;
  args: string[];
  stdin: string;
  /** When the call started and when it answered (ms since the epoch; null: it never answered). */
  started: number;
  done: number | null;
  cwd: string;
  promptFile: string | null;
  env: Record<string, string | null>;
}

export interface FakeAgents {
  /** The directory with the wrappers; put it first on PATH. */
  bin: string;
  /** The env a child needs: the log directory and the modes. */
  env: Record<string, string>;
  calls(): FakeCall[];
  /** The pids `hang`/`linger` call `n` logged: its own and its grandchild's. */
  pids(n: number): number[];
}

/** Wrappers named `names` (claude, codex, opencode, cursor-agent, agent, or any custom name). */
export function fakeAgents(t: { after: (f: () => void) => void }, names: string[], options: { modes?: string; reply?: string; version?: string; model?: string } = {}): FakeAgents {
  const dir = mkdtempSync(join(tmpdir(), "keylang-fake-agent-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bin = join(dir, "bin");
  const log = join(dir, "log");
  mkdirSync(bin);
  mkdirSync(log);
  for (const name of names) {
    const file = join(bin, name);
    writeFileSync(file, `#!/bin/sh\nFAKE_AGENT_AS=${name} exec "${process.execPath}" "${script}" "$@"\n`);
    chmodSync(file, 0o755);
  }
  const env: Record<string, string> = { FAKE_AGENT_LOG: log, FAKE_AGENT_MODES: options.modes ?? "ok" };
  if (options.reply !== undefined) env.FAKE_AGENT_REPLY = options.reply;
  if (options.version !== undefined) env.FAKE_AGENT_VERSION = options.version;
  if (options.model !== undefined) env.FAKE_AGENT_MODEL = options.model;
  return {
    bin,
    env,
    calls: () =>
      readdirSync(log)
        .filter((file) => file.endsWith(".json"))
        .map((file) => Number(file.slice(0, -5)))
        .sort((a, b) => a - b)
        .flatMap((n) => {
          const text = readFileSync(join(log, `${n}.json`), "utf8");
          if (text === "") return [];
          const done = join(log, `${n}.done`);
          return [{ ...(JSON.parse(text) as Omit<FakeCall, "done">), done: existsSync(done) ? Number(readFileSync(done, "utf8")) : null }];
        }),
    pids: (n) => {
      const file = join(log, `${n}.pid`);
      return existsSync(file) ? readFileSync(file, "utf8").trim().split(" ").map(Number) : [];
    },
  };
}

/** The process is alive (signal 0 reaches it). */
export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
