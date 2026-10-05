// Review 2026-10-05, harness group: the Stop hook's contract, `.keylang/` in
// `.gitignore`, the spec directory in the harness files, the init hint, the
// grammar in the AGENTS.md block and the English cheatsheet. Every test runs
// the real CLI on a temporary repository.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Run `keylang` with `cwd` as working directory; `input` is stdin, `env` replaces the environment. */
function keylang(cwd: string, args: string[], options: { input?: string; env?: NodeJS.ProcessEnv } = {}): Run {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...(options.input !== undefined ? { input: options.input } : {}), ...(options.env ? { env: options.env } : {}) });
  if (r.error) throw r.error;
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function tempDir(t: { after: (fn: () => void) => void }, prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeTree(dir: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, dirname(path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
}

/** Relative paths and their bytes, so a command that must not write can be compared. */
function treeBytes(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (rel: string): void => {
    let names: string[];
    try {
      names = readdirSync(join(dir, rel));
    } catch {
      return;
    }
    for (const name of names) {
      const path = rel === "" ? name : `${rel}/${name}`;
      if (statSync(join(dir, path)).isDirectory()) walk(path);
      else out.set(path, readFileSync(join(dir, path), "utf8"));
    }
  };
  walk("");
  return out;
}

function git(dir: string, args: string[]): void {
  const r = spawnSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test", ...args], { cwd: dir, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
}

const LAYERS = { languages: ["typescript"], module: "file", layers: { app: ["src/app/**"], domain: ["src/domain/**"] } };
const PAY = "export function charge(): number {\n  return 1;\n}\n";
const ORDER = "export function price(): number {\n  return 2;\n}\n";
const STOP = JSON.stringify({ hook_event_name: "Stop", stop_hook_active: false });

/** A committed repository whose working tree adds an import the rules deny: `hook stop` blocks on it. */
function deniedRepo(t: { after: (fn: () => void) => void }): string {
  const dir = tempDir(t, "keylang-hook-");
  writeTree(dir, { "keylang.json": `${JSON.stringify(LAYERS)}\n`, "src/app/pay.ts": PAY, "src/domain/order.ts": ORDER, "keylang/rules.md": "# rules\n\n- deny app domain\n" });
  git(dir, ["init", "-q"]);
  git(dir, ["add", "."]);
  git(dir, ["commit", "-qm", "base"]);
  writeFileSync(join(dir, "src/app/pay.ts"), 'import { price } from "../domain/order.ts";\nexport function charge(): number {\n  return price();\n}\n');
  return dir;
}

test("hook stop: once started it prints one JSON object and exits 0; a failure is {} and a stderr line that the turn was not checked", (t) => {
  const dir = deniedRepo(t);
  const blocked = keylang(dir, ["hook", "stop"], { input: STOP });
  assert.equal(blocked.status, 0, blocked.stderr);
  assert.equal((JSON.parse(blocked.stdout) as { decision?: string }).decision, "block");
  const before = treeBytes(dir);

  // No git on PATH: the changed files cannot be listed, so the turn is not checked rather than blocked.
  const noGit = keylang(dir, ["hook", "stop"], { input: STOP, env: { ...process.env, PATH: tempDir(t, "keylang-empty-path-") } });
  assert.equal(noGit.status, 0, noGit.stderr);
  assert.equal(noGit.stdout, "{}\n");
  assert.match(noGit.stderr, /^keylang: hook stop: git is not available \([^)]*\); this turn was not checked\n$/);

  // Stdin that is not JSON, or not an object, or a non-boolean stop_hook_active.
  for (const [input, reason] of [
    ["not json", "stdin is not JSON"],
    ["[1]", "stdin is not a JSON object"],
    ['{"stop_hook_active":"yes"}', "stop_hook_active is not a boolean"],
  ] as const) {
    const bad = keylang(dir, ["hook", "stop"], { input });
    assert.equal(bad.status, 0, `${input}: ${bad.stderr}`);
    assert.equal(bad.stdout, "{}\n", input);
    assert.equal(bad.stderr, `keylang: hook stop: ${reason}; this turn was not checked\n`, input);
  }

  // A broken keylang.json: the analysis cannot start.
  writeFileSync(join(dir, "keylang.json"), "{ broken\n");
  const config = keylang(dir, ["hook", "stop"], { input: STOP });
  assert.equal(config.status, 0, config.stderr);
  assert.equal(config.stdout, "{}\n");
  assert.match(config.stderr, /^keylang: hook stop: .*keylang\.json: invalid JSON.*; this turn was not checked\n$/);
  writeFileSync(join(dir, "keylang.json"), `${JSON.stringify(LAYERS)}\n`);
  assert.deepEqual(treeBytes(dir), before, "hook stop writes nothing, on success or failure");

  // `check --changed` keeps its codes: without git it is still a usage or I/O error.
  const changed = keylang(dir, ["check", "--changed"], { env: { ...process.env, PATH: tempDir(t, "keylang-empty-path-") } });
  assert.equal(changed.status, 2, changed.stdout);
  assert.match(changed.stderr, /check --changed: git is not available/);
});

test("hook: a bad invocation is still code 2, with nothing on stdout", (t) => {
  const dir = deniedRepo(t);
  for (const args of [["hook"], ["hook", "nope"], ["hook", "stop", "extra"], ["hook", "install", "extra"]]) {
    const bad = keylang(dir, args, { input: STOP });
    assert.equal(bad.status, 2, `${args.join(" ")}: ${bad.stdout}`);
    assert.equal(bad.stdout, "", args.join(" "));
    assert.match(bad.stderr, /^keylang: hook/, args.join(" "));
  }
});
