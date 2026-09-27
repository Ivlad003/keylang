// Smoke test of the VS Code client against a real VS Code:
//   node editors/vscode/test/run.mjs [path to the VS Code executable]
// Copies tests/fixtures/repo to a temp workspace that runs this checkout's
// `keylang lsp`, starts VS Code with this extension and `test/smoke.js`, and
// prints each step. Needs a display and `npm install` in editors/vscode.

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const extension = join(dirname(fileURLToPath(import.meta.url)), "..");
const keylang = join(extension, "../..");
const bin = join(keylang, "bin/keylang.js");
const code = process.argv[2] ?? (existsSync("/usr/share/code/code") ? "/usr/share/code/code" : "code");

const work = mkdtempSync(join(tmpdir(), "keylang-vscode-"));
const ws = join(work, "repo");
try {
  cpSync(join(keylang, "tests/fixtures/repo"), ws, { recursive: true });
  mkdirSync(join(ws, "keylang/flows"), { recursive: true });
  writeFileSync(join(ws, "keylang/flows/use.md"), "# flow use\n\n- trigger app.checkout.checkout\n  - step domain.order.createOrder\n");
  mkdirSync(join(ws, ".vscode"), { recursive: true });
  writeFileSync(join(ws, ".vscode/settings.json"), JSON.stringify({ "keylang.command": process.execPath, "keylang.args": process.env.KEYLANG_SMOKE_SERVER ? [process.env.KEYLANG_SMOKE_SERVER] : [bin, "lsp"] }, null, 2));
  if (spawnSync(process.execPath, [bin, "map"], { cwd: ws }).status !== 0) throw new Error("keylang map failed on the fixture");
  const r = spawnSync(
    code,
    [`--extensionDevelopmentPath=${extension}`, `--extensionTestsPath=${join(extension, "test/smoke.js")}`, `--user-data-dir=${join(work, "user")}`, `--extensions-dir=${join(work, "ext")}`, "--disable-workspace-trust", "--skip-welcome", "--skip-release-notes", "--new-window", ws],
    { encoding: "utf8", timeout: 180000 },
  );
  const resultFile = join(ws, ".smoke-result.json");
  if (!existsSync(resultFile)) {
    process.stderr.write(`no result from VS Code (exit ${r.status}):\n${r.stderr}\n${r.stdout}\n`);
    process.exitCode = 2;
  } else {
    const { steps } = JSON.parse(readFileSync(resultFile, "utf8"));
    for (const s of steps) process.stdout.write(`${s.ok ? "ok  " : "FAIL"} ${s.name}\n     ${JSON.stringify(s.detail).slice(0, 300)}\n`);
    process.exitCode = steps.length > 0 && steps.every((s) => s.ok) ? 0 : 1;
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
