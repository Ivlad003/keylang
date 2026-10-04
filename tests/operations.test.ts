// The shared operations module (ticket 01): a direct call computes the same
// doctor report as the CLI, without a child process, the working directory,
// stdout/stderr, or any file writes.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runOperation, type OperationResult } from "../src/operations.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");

/** A temp copy of the checkout fixture plus extra files; removed with the test. */
function repo(t: { after: (fn: () => void) => void }, files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-ops-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(join(root, "tests/fixtures/repo"), dir, { recursive: true });
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

/** Relative paths and bytes, so a read-only operation can be compared. */
function treeBytes(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (rel: string): void => {
    for (const name of readdirSync(join(dir, rel))) {
      const path = rel === "" ? name : `${rel}/${name}`;
      if (statSync(join(dir, path)).isDirectory()) walk(path);
      else out.set(path, readFileSync(join(dir, path), "utf8"));
    }
  };
  walk("");
  return out;
}

/** Everything an operation writes to stdout/stderr, captured instead of printed. */
function captureWrites(): { restore: () => void; calls: string[] } {
  const calls: string[] = [];
  const out = process.stdout.write;
  const err = process.stderr.write;
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    calls.push(`stdout: ${typeof chunk === "string" ? chunk : Buffer.from(chunk).toString()}`);
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array): boolean => {
    calls.push(`stderr: ${typeof chunk === "string" ? chunk : Buffer.from(chunk).toString()}`);
    return true;
  }) as typeof process.stderr.write;
  return {
    restore: () => {
      process.stdout.write = out;
      process.stderr.write = err;
    },
    calls,
  };
}

/** Runs `fn` with the machine's model keys removed and HOME pointed at a temp dir. */
async function withoutKeys<T>(t: { after: (fn: () => void) => void }, fn: () => Promise<T>): Promise<T> {
  const home = mkdtempSync(join(tmpdir(), "keylang-ops-home-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const saved = new Map<string, string | undefined>();
  for (const name of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "OPENROUTER_API_KEY"]) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
  const oldHome = process.env.HOME;
  process.env.HOME = home;
  try {
    return await fn();
  } finally {
    process.env.HOME = oldHome;
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test("doctor: computes the report for an explicit root, writes nothing, and matches the CLI", async (t) => {
  await withoutKeys(t, async () => {
    const home = process.env.HOME!;
    // No agent CLI on PATH: probing the machine's real ones would take this
    // process off the CPU, and the test runner's own messages would land in the capture.
    const path = process.env.PATH;
    process.env.PATH = join(home, "no-bin");
    t.after(() => {
      process.env.PATH = path;
    });
    const dir = repo(t);
    const twin = repo(t);
    const before = treeBytes(dir);
    const capture = captureWrites();
    let result: OperationResult;
    try {
      // The working directory is the checkout of keylang itself, not `dir`:
      // the operation must follow the request's root, not the process cwd.
      result = await runOperation({ kind: "doctor", root: dir });
    } finally {
      capture.restore();
    }
    assert.equal(result.kind, "doctor");
    assert.equal(result.status, "completed");
    assert.equal(result.exitCode, 0);
    assert.equal(result.written.length, 0);
    assert.equal(result.removed.length, 0);
    assert.equal(result.proposals.length, 0);
    assert.deepEqual(capture.calls, [], "the operation writes no stdout/stderr");
    assert.deepEqual(treeBytes(dir), before, "the operation writes no files");
    assert.deepEqual(result.payload!.languages, ["typescript"]);
    assert.equal(result.payload!.configFile, true);
    assert.equal(result.payload!.agent.configured, null);
    assert.equal(result.payload!.agent.state, "missing");
    // The report lines are exactly what the CLI prints on the same input.
    const cli = spawnSync(process.execPath, [bin, "doctor"], {
      cwd: twin,
      encoding: "utf8",
      env: { ...process.env, HOME: home, ANTHROPIC_API_KEY: undefined, ANTHROPIC_AUTH_TOKEN: undefined, OPENROUTER_API_KEY: undefined },
    });
    assert.equal(cli.status, 0, cli.stderr);
    assert.equal(cli.stderr, "");
    assert.equal(`${result.messages.map((m) => m.text).join("\n")}\n`, cli.stdout);
    assert.match(cli.stdout, /^languages: typescript$/m);
    assert.match(cli.stdout, /^agent: not configured \(keylang\.json `agent`, KEYLANG_AGENT or ~\/\.config\/keylang\/agents\.json\)$/m);
    assert.match(cli.stdout, /^agent CLIs: claude — · codex — · opencode — · cursor —$/m);
  });
});

test("doctor: a broken keylang.json is a failed operation naming the file and field", async (t) => {
  const dir = repo(t, { "keylang.json": '{"languages": ["typescript"], "agent": [1]}\n' });
  const result = await runOperation({ kind: "doctor", root: dir });
  assert.equal(result.status, "failed");
  assert.equal(result.exitCode, 2);
  assert.equal(result.payload, null);
  assert.equal(result.messages.length, 1);
  assert.match(result.messages[0]!.text, new RegExp(`keylang\\.json: .agent. must be`));
});

test("doctor: a missing key is an environment diagnostic and key values never reach the result", async (t) => {
  await withoutKeys(t, async () => {
    const home = process.env.HOME!;
    const dir = repo(t, { "keylang.json": '{"languages": ["typescript"], "agent": "anthropic:claude-opus-5"}\n' });
    const missing = await runOperation({ kind: "doctor", root: dir });
    assert.equal(missing.status, "completed", JSON.stringify(missing.messages));
    assert.equal(missing.exitCode, 0, "a missing key is a diagnostic, not a failure");
    assert.equal(missing.payload!.agent.configured, "anthropic:claude-opus-5");
    assert.equal(missing.payload!.agent.state, "missing");
    assert.doesNotMatch(JSON.stringify(missing), /secret-value/);
    // With a mode-0600 key file the agent works, and its value stays out.
    mkdirSync(join(home, ".config/keylang"), { recursive: true });
    const keyFile = join(home, ".config/keylang/anthropic.key");
    writeFileSync(keyFile, "secret-value\n");
    chmodSync(keyFile, 0o600);
    const withKey = await runOperation({ kind: "doctor", root: dir });
    assert.equal(withKey.payload!.agent.state, "ok");
    assert.match(withKey.messages.map((m) => m.text).join("\n"), /^agent: anthropic:claude-opus-5: credentials found$/m);
    assert.doesNotMatch(JSON.stringify(withKey), /secret-value/);
  });
});

test("doctor: a relative root is a usage error, not a read from the working directory", async (t) => {
  const dir = repo(t);
  const capture = captureWrites();
  let result: OperationResult;
  try {
    result = await runOperation({ kind: "doctor", root: `some/relative/${dir}` });
  } finally {
    capture.restore();
  }
  assert.equal(result.status, "failed");
  assert.equal(result.exitCode, 2);
  assert.match(result.messages[0]!.text, /root must be an absolute path/);
  assert.deepEqual(capture.calls, []);
});

test("doctor: an aborted signal cancels before any work", async (t) => {
  const dir = repo(t);
  const result = await runOperation({ kind: "doctor", root: dir }, { signal: AbortSignal.abort() });
  assert.equal(result.status, "cancelled");
  assert.equal(result.exitCode, null);
  assert.equal(result.payload, null);
  assert.equal(result.messages.length, 0);
  assert.equal(result.written.length, 0);
});
