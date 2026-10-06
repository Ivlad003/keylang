// Follow-ups of the 2026-10-05 review, decided on 2026-10-06: the Python trace
// wrapper without `KEYLANG_TRACE`. Every test runs the real CLI or adapter on
// a minimal repository in a temporary directory.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** A repository of `files` in a temporary directory, removed after the test. */
function repo(t: TestContext, files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-extras-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

const python3 = spawnSync("python3", ["--version"], { encoding: "utf8" }).status === 0;

test("python: without KEYLANG_TRACE the trace wrapper records nothing and runs the script as python3 would, exit code included; with it, a missing plan or test is named", { skip: python3 ? false : "python3 is not installed" }, (t) => {
  const wrapper = join(root, "adapters/python/keylang_trace.py");
  const dir = repo(t, { "run.py": 'import os\nimport sys\n\nprint(__name__, sys.argv[1:], os.environ.get("KEYLANG_TRACE_RUN"))\nsys.exit(3)\n' });
  const env: Record<string, string | undefined> = { ...process.env };
  for (const name of ["KEYLANG_TRACE", "KEYLANG_TRACE_PLAN", "KEYLANG_TRACE_TEST", "KEYLANG_TRACE_RUN", "KEYLANG_TRACE_ROOT"]) delete env[name];
  const plain = spawnSync("python3", [wrapper, "run.py", "a", "b"], { cwd: dir, encoding: "utf8", env });
  // The script's own exit code, its arguments, no run id handed to child processes, and no file written.
  assert.equal(plain.status, 3, plain.stderr);
  assert.equal(plain.stdout, "__main__ ['a', 'b'] None\n");
  assert.equal(plain.stderr, "");
  assert.deepEqual(readdirSync(dir), ["run.py"]);
  // A trace file needs the plan and the test id: the error names the missing one, and the script does not run.
  const partial = spawnSync("python3", [wrapper, "run.py"], { cwd: dir, encoding: "utf8", env: { ...env, KEYLANG_TRACE: "trace.jsonl", KEYLANG_TRACE_TEST: "t" } });
  assert.equal(partial.status, 2);
  assert.equal(partial.stdout, "");
  assert.equal(partial.stderr, "keylang trace: KEYLANG_TRACE is set, so KEYLANG_TRACE_PLAN is required too\n");
  assert.deepEqual(readdirSync(dir), ["run.py"]);
});
