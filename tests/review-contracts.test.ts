// Contracts the author settled on 2026-10-06 (ADR 0016, amendment): a Stop
// hook turn keylang could not check is a warning the person sees. Every test
// runs the real CLI on a temporary repository and removes it afterwards.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

/**
 * `keylang` in `cwd`. Git looks for no repository above the temporary
 * directories, so one that has no `.git` is outside every repository.
 */
function keylang(cwd: string, args: string[], input?: string): Run {
  const env = { ...process.env, GIT_CEILING_DIRECTORIES: tmpdir() };
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...(input !== undefined ? { input } : {}) });
  if (r.error) throw r.error;
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function tempDir(t: TestContext, prefix: string): string {
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

function git(dir: string, args: string[]): string {
  const r = spawnSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test", "-c", "init.defaultBranch=main", ...args], { cwd: dir, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return r.stdout;
}

// ---------- hook stop: a turn it cannot check ----------

const STOP = JSON.stringify({ hook_event_name: "Stop", stop_hook_active: false });

test("hook stop: a turn outside any git repository is a systemMessage for the person and the same stderr line, code 0; a clean turn, stop_hook_active and a new fail keep their answers", (t) => {
  const dir = tempDir(t, "keylang-contracts-hook-");
  writeTree(dir, {
    "keylang.json": `${JSON.stringify({ languages: ["typescript"], layers: { app: ["src/app/**"], domain: ["src/domain/**"] } })}\n`,
    "keylang/rules.md": "# rules\n\n- deny app domain\n",
    "src/app/pay.ts": "export function charge(): number {\n  return 1;\n}\n",
    "src/domain/order.ts": "export function price(): number {\n  return 2;\n}\n",
  });

  const outside = keylang(dir, ["hook", "stop"], STOP);
  assert.equal(outside.status, 0, outside.stderr);
  assert.match(outside.stdout, /^\{[^\n]*\}\n$/, "one JSON object on one line");
  const body = JSON.parse(outside.stdout) as Record<string, unknown>;
  assert.deepEqual(Object.keys(body), ["systemMessage"], "a warning, not a decision: the agent is not blocked");
  assert.match(String(body.systemMessage), /^keylang: this turn was not checked: git \S+: .*not a git repository/i);
  assert.equal(outside.stderr, `${String(body.systemMessage)}\n`);

  git(dir, ["init", "-q"]);
  git(dir, ["add", "."]);
  git(dir, ["commit", "-qm", "base"]);
  assert.deepEqual(keylang(dir, ["hook", "stop"], STOP), { status: 0, stdout: "{}\n", stderr: "" }, "nothing new fails");
  writeFileSync(join(dir, "src/app/pay.ts"), 'import { price } from "../domain/order.ts";\nexport function charge(): number {\n  return price();\n}\n');
  const blocked = keylang(dir, ["hook", "stop"], STOP);
  assert.equal(blocked.status, 0, blocked.stderr);
  const decision = JSON.parse(blocked.stdout) as { decision?: string; reason?: string };
  assert.equal(decision.decision, "block");
  assert.match(decision.reason ?? "", /^src\/app\/pay\.ts:1: K102 divergence: `app\.pay` depends on `domain\.order`/m);
  assert.equal(keylang(dir, ["hook", "stop"], JSON.stringify({ hook_event_name: "Stop", stop_hook_active: true })).stdout, "{}\n", "stop_hook_active never blocks");
});
