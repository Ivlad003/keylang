// Findings of the operations review of 2026-10-05 («Операції та модель»),
// one section each, numbered as the review's fix list: through the real CLI
// with fake agent CLIs on a PATH of their own (`tests/agent-fixture.ts`),
// and the shared operations where the TUI is the caller.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { exportTargetProblem, runOperation } from "../src/operations.ts";
import { fakeAgents, type FakeAgents } from "./agent-fixture.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** keylang with only the fakes (and the system's basic tools) on PATH, HOME in the copy, no keys and no agent from the developer's env. `node` goes before the script (`--import`). */
function keylang(dir: string, args: string[], fake: FakeAgents | null, env: Record<string, string | undefined> = {}, node: string[] = []): Promise<Run> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [...node, bin, ...args], {
      cwd: dir,
      env: {
        ...process.env,
        PATH: [...(fake ? [fake.bin] : []), "/usr/bin", "/bin"].join(":"),
        HOME: join(dir, ".home"),
        KEYLANG_AGENT: undefined,
        KEYLANG_NESTED: undefined,
        KEYLANG_LLM_TIMEOUT_MS: undefined,
        ANTHROPIC_API_KEY: undefined,
        ANTHROPIC_AUTH_TOKEN: undefined,
        OPENROUTER_API_KEY: undefined,
        ...(fake ? fake.env : {}),
        ...env,
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function tempDir(t: TestContext, prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A copy of `tests/fixtures/repo` with `config` merged into its keylang.json and `files` written over it. */
function copy(t: TestContext, config: Record<string, unknown> = {}, files: Record<string, string> = {}): string {
  const dir = tempDir(t, "keylang-review-ops-");
  cpSync(join(root, "tests/fixtures/repo"), dir, { recursive: true });
  mkdirSync(join(dir, ".home"));
  const file = join(dir, "keylang.json");
  writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), ...config }));
  write(dir, files);
  return dir;
}

function write(dir: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
}

/**
 * The fake `claude` of `fake`, which first appends `EDIT_TEXT` to `EDIT_FILE`
 * when its call is number `EDIT_ON_CALL` (every call without it): a person
 * saving a file while the model answers.
 */
function editBeforeAnswer(fake: FakeAgents): void {
  const wrapper = join(fake.bin, "claude");
  const edit = [
    `n=$(( $(ls "$FAKE_AGENT_LOG" | grep -c '[.]json$') + 1 ))`,
    `if [ -n "$EDIT_FILE" ] && { [ -z "$EDIT_ON_CALL" ] || [ "$n" = "$EDIT_ON_CALL" ]; }; then printf '%s' "$EDIT_TEXT" >> "$EDIT_FILE"; fi`,
  ].join("\n");
  // A function, not a string: `$'` in the shell text is no replacement pattern.
  writeFileSync(wrapper, readFileSync(wrapper, "utf8").replace("#!/bin/sh\n", () => `#!/bin/sh\n${edit}\n`));
}

const EDITED = "// edited while the model answered\n";

// ---------- 1. export c4 --out: the write policy before the target is read ----------

test("export c4 --out: a link out of the repository and an absolute path outside are refused by the write policy before the target is read; nothing is written there", async (t) => {
  const dir = copy(t);
  const outside = tempDir(t, "keylang-review-outside-");
  writeFileSync(join(outside, "plain.txt"), "outside text\n");
  writeFileSync(join(outside, "diagram.puml"), "' keylang:generated — keylang export c4\n@startuml\n@enduml\n");
  symlinkSync(join(outside, "plain.txt"), join(dir, "link-plain.puml"));
  symlinkSync(join(outside, "diagram.puml"), join(dir, "link-diagram.puml"));
  symlinkSync(join(outside, "new.puml"), join(dir, "link-new.puml"));
  for (const [out, reason] of [
    ["link-plain.puml", "leads out of the repository through a link"],
    ["link-diagram.puml", "leads out of the repository through a link"],
    ["link-new.puml", "leads out of the repository through a link"],
    [join(outside, "plain.txt"), "not a plain relative path"],
  ] as const) {
    const o = await keylang(dir, ["export", "c4", "--out", out], null);
    assert.equal(o.status, 2, `${out}: ${o.stderr}`);
    assert.equal(o.stdout, "");
    // The policy names the path; the old order read the file first and judged its first line.
    assert.equal(o.stderr, `keylang: export c4: --out ${out}: ${reason}; nothing written\n`);
  }
  assert.deepEqual(readdirSync(outside).sort(), ["diagram.puml", "plain.txt"]);
  assert.equal(readFileSync(join(outside, "plain.txt"), "utf8"), "outside text\n");
  assert.equal(readFileSync(join(outside, "diagram.puml"), "utf8"), "' keylang:generated — keylang export c4\n@startuml\n@enduml\n");
  // Inside the repository the contract stays: a new file is written, a foreign one is judged by its first line.
  writeFileSync(join(dir, "manual.puml"), "@startuml\n@enduml\n");
  const manual = await keylang(dir, ["export", "c4", "--out", "manual.puml"], null);
  assert.equal(manual.status, 2);
  assert.match(manual.stderr, /manual\.puml: not a diagram `keylang export c4` wrote/);
  const fresh = await keylang(dir, ["export", "c4", "--out", join(dir, "docs/c4.puml")], null);
  assert.equal(fresh.status, 0, fresh.stderr);
  assert.equal(fresh.stderr, "docs/c4.puml: written\n");
});
