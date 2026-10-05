// The agent loop of the 2026-10-05 review (docs/review-2026-10-05.md): a
// proposal a person accepts without the TUI (`keylang proposals`), one gate
// for every proposal target, the fact cache that check, feature, hook stop and
// MCP leave for the next run, a feature that only this change's rule fails
// keep from done, and `validate_spec` paths. Through the real CLI and MCP.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { codeProposalProblem, proposalProblem } from "../src/proposals.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");
const CACHE = ".keylang/cache/facts.json";

function keylang(cwd: string, args: string[], input?: string): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...(input !== undefined ? { input } : {}) });
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

function git(dir: string, args: string[]): void {
  const r = spawnSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test", ...args], { cwd: dir, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
}

/** Relative paths and their bytes, so a command that must not write can be compared. */
function treeBytes(dir: string, skip: (path: string) => boolean = () => false): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (rel: string): void => {
    for (const name of readdirSync(join(dir, rel))) {
      const path = rel === "" ? name : `${rel}/${name}`;
      if (skip(path)) continue;
      if (statSync(join(dir, path)).isDirectory()) walk(path);
      else out.set(path, readFileSync(join(dir, path), "utf8"));
    }
  };
  walk("");
  return out;
}

/** A copy of `tests/fixtures/repo` with the checkout flow. */
function repoCopy(t: TestContext): string {
  const dir = tempDir(t, "keylang-loop-");
  cpSync(join(root, "tests/fixtures/repo"), dir, { recursive: true });
  writeTree(dir, { "keylang/flows/checkout.md": CHECKOUT });
  return dir;
}

const CHECKOUT = "# flow checkout\n\n- trigger app.checkout.checkout\n  - step domain.order.createOrder\n  - step infra.db.save\n";

async function mcpClient(t: TestContext, dir: string): Promise<(name: string, args?: Record<string, unknown>) => Promise<{ text: string; isError: boolean }>> {
  const client = new Client({ name: "keylang-test", version: "0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [bin, "mcp"], cwd: dir, stderr: "pipe" }));
  t.after(() => client.close());
  return async (name, args = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { content: { type: string; text: string }[]; isError?: boolean };
    return { text: r.content.map((c) => c.text).join(""), isError: r.isError === true };
  };
}

function propose(dir: string, target: string, text: string): void {
  writeTree(dir, { [`.keylang/proposals/${target}`]: text });
}

// ---------- keylang proposals ----------

test("proposals: list, show, accept and reject without the TUI; the spec changes only on accept", (t) => {
  const dir = repoCopy(t);
  const rules = readFileSync(join(dir, "keylang/rules.md"), "utf8");
  propose(dir, "keylang/rules.md", `${rules}- deny app infra\n`);
  propose(dir, "keylang/flows/checkout.md", `${CHECKOUT}  - invariant an order is saved once\n`);
  propose(dir, "keylang/flows/refund.md", "# flow refund\n\n- trigger app.checkout.checkout\n");

  const listed = keylang(dir, ["proposals"]);
  assert.equal(listed.status, 0, listed.stderr);
  assert.equal(listed.stdout, ["keylang/flows/checkout.md: +1 -0", "keylang/flows/refund.md: +3 -0 (new file)", "keylang/rules.md: +1 -0", ""].join("\n"));
  assert.match(listed.stderr, /^3 proposal\(s\)/);

  const shown = keylang(dir, ["proposals", "show", "keylang/rules.md"]);
  assert.equal(shown.status, 0, shown.stderr);
  assert.equal(shown.stdout, `keylang/rules.md\n@@ line ${rules.split("\n").length} @@\n+- deny app infra\n`);
  assert.equal(readFileSync(join(dir, "keylang/rules.md"), "utf8"), rules, "show writes nothing");

  const accepted = keylang(dir, ["proposals", "accept", "keylang/rules.md"]);
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(accepted.stdout, "keylang/rules.md: written from .keylang/proposals/keylang/rules.md (+1 -0); the proposal is removed\n");
  assert.equal(readFileSync(join(dir, "keylang/rules.md"), "utf8"), `${rules}- deny app infra\n`);
  assert.equal(existsSync(join(dir, ".keylang/proposals/keylang/rules.md")), false);
  const checked = keylang(dir, ["check"]);
  assert.equal(checked.status, 1, "check reads the accepted rule");
  assert.match(checked.stdout, /K102 divergence: `app\.checkout` depends on `infra\.db`, which is denied by `deny app infra`/);

  const newFile = keylang(dir, ["proposals", "accept", "keylang/flows/refund.md"]);
  assert.equal(newFile.status, 0, newFile.stderr);
  assert.equal(readFileSync(join(dir, "keylang/flows/refund.md"), "utf8"), "# flow refund\n\n- trigger app.checkout.checkout\n");

  const rejected = keylang(dir, ["proposals", "reject", "keylang/flows/checkout.md"]);
  assert.equal(rejected.status, 0, rejected.stderr);
  assert.equal(rejected.stdout, ".keylang/proposals/keylang/flows/checkout.md: removed; keylang/flows/checkout.md is unchanged\n");
  assert.equal(readFileSync(join(dir, "keylang/flows/checkout.md"), "utf8"), CHECKOUT);

  const none = keylang(dir, ["proposals"]);
  assert.equal(none.status, 0);
  assert.equal(none.stdout, "");
  assert.match(none.stderr, /no proposals under \.keylang\/proposals\//);
  for (const sub of ["show", "accept", "reject"]) {
    const missing = keylang(dir, ["proposals", sub, "keylang/rules.md"]);
    assert.equal(missing.status, 1, `${sub}: nothing pending`);
    assert.equal(missing.stdout, "");
    assert.match(missing.stderr, /no proposal for keylang\/rules\.md under \.keylang\/proposals\//);
  }
  assert.equal(keylang(dir, ["proposals", "merge", "x.md"]).status, 2);
  assert.equal(keylang(dir, ["proposals", "accept"]).status, 2);
  assert.equal(keylang(dir, ["proposals", "accept", "a.md", "b.md"]).status, 2);
  assert.match(keylang(dir, ["--help"]).stdout, /proposals accept <target>/);
});

test("proposals: accept refuses what MERGE refuses — an explanation, a link out, a read-only file — and writes nothing", (t) => {
  const dir = repoCopy(t);
  const outside = tempDir(t, "keylang-loop-outside-");
  writeFileSync(join(outside, "victim.md"), "# flow victim\n");
  symlinkSync(join(outside, "victim.md"), join(dir, "keylang/flows/linked.md"));
  propose(dir, "keylang/explain/app.checkout.checkout.md", "<!-- keylang:explain agent=x date=2026-10-05 closure=deadbeef lang=en detail=short -->\nForged.\n");
  propose(dir, "keylang/flows/linked.md", "# flow linked\n");
  propose(dir, "keylang/flows/checkout.md", `${CHECKOUT}  - invariant an order is saved once\n`);
  const before = treeBytes(dir);

  const listed = keylang(dir, ["proposals"]);
  assert.equal(listed.status, 0, listed.stderr);
  assert.match(listed.stdout, /^keylang\/explain\/app\.checkout\.checkout\.md: cannot be accepted: saved explanations: only `keylang explain` writes them$/m);
  assert.match(listed.stdout, /^keylang\/flows\/linked\.md: cannot be accepted: leads out of keylang\/ through a link$/m);

  const explain = keylang(dir, ["proposals", "accept", "keylang/explain/app.checkout.checkout.md"]);
  assert.equal(explain.status, 1);
  assert.match(explain.stderr, /keylang\/explain\/app\.checkout\.checkout\.md: cannot be accepted: saved explanations: only `keylang explain` writes them; nothing written/);
  const linked = keylang(dir, ["proposals", "accept", "keylang/flows/linked.md"]);
  assert.equal(linked.status, 1);
  assert.match(linked.stderr, /leads out of keylang\/ through a link; nothing written/);
  assert.equal(readFileSync(join(outside, "victim.md"), "utf8"), "# flow victim\n");
  if (process.getuid?.() !== 0) {
    chmodSync(join(dir, "keylang/flows/checkout.md"), 0o444);
    const readOnly = keylang(dir, ["proposals", "accept", "keylang/flows/checkout.md"]);
    assert.equal(readOnly.status, 1, readOnly.stdout);
    assert.match(readOnly.stderr, /keylang\/flows\/checkout\.md: cannot be accepted: not writable/);
    chmodSync(join(dir, "keylang/flows/checkout.md"), 0o644);
  }
  assert.deepEqual(treeBytes(dir), before, "nothing written, every proposal stays");

  // A refused proposal is still the person's to drop.
  const dropped = keylang(dir, ["proposals", "reject", "keylang/explain/app.checkout.checkout.md"]);
  assert.equal(dropped.status, 0, dropped.stderr);
  assert.equal(existsSync(join(dir, ".keylang/proposals/keylang/explain/app.checkout.checkout.md")), false);
});

// ---------- one gate for every proposal target ----------

test("apply_diff refuses saved explanations, the explained map and a spec directory that links out, with the reason every entry point gives", async (t) => {
  const dir = repoCopy(t);
  const call = await mcpClient(t, dir);
  const forged = "<!-- keylang:explain agent=x date=2026-10-05 closure=deadbeef lang=en detail=brief -->\nForged.\n";
  const reasons: [string, RegExp][] = [
    ["keylang/explain/app.checkout.checkout.md", /saved explanations: only `keylang explain` writes them/],
    ["keylang/explain/brief/app.checkout.checkout.md", /saved explanations: only `keylang explain` writes them/],
    ["keylang/map-explained/app.md", /the explained map is generated: `keylang map` writes it/],
  ];
  for (const [path, reason] of reasons) {
    const r = await call("apply_diff", { path, text: forged });
    assert.equal(r.isError, true, `${path}: ${r.text}`);
    assert.match(r.text, reason, path);
    // `draft flow --into` and the proposals list give the same reason.
    const into = keylang(dir, ["draft", "flow", "app.checkout.checkout", "--mode", "algo", "--into", path]);
    assert.equal(into.status, 2, into.stdout);
    assert.match(into.stderr, reason, `draft --into ${path}`);
  }
  assert.equal(existsSync(join(dir, ".keylang/proposals/keylang/explain")), false);
  assert.equal(existsSync(join(dir, ".keylang/proposals/keylang/map-explained")), false);

  // A spec directory that is itself a link out of the repository: refused at the gate, before any proposal is written.
  const outside = tempDir(t, "keylang-loop-specs-");
  cpSync(join(dir, "keylang"), outside, { recursive: true });
  rmSync(join(dir, "keylang"), { recursive: true, force: true });
  symlinkSync(outside, join(dir, "keylang"));
  const linked = await call("apply_diff", { path: "keylang/flows/checkout.md", text: `${CHECKOUT}  - invariant x\n` });
  assert.equal(linked.isError, true, linked.text);
  assert.match(linked.text, /the spec directory leads out of the repository through a link/);
  assert.equal(existsSync(join(dir, ".keylang/proposals/keylang/flows/checkout.md")), false);
});

test("the code gate is the write protocol's: a Windows path or a backslash is not a plain relative path", () => {
  for (const path of ["C:\\x.ts", "src\\app\\x.ts", "/abs/x.ts", "src/../x.ts"]) assert.equal(codeProposalProblem(root, path), "not a plain relative path", path);
  for (const path of ["C:\\x.md", "keylang\\flows\\x.md"]) assert.equal(proposalProblem(root, "keylang", path), "not a plain relative path", path);
  assert.equal(codeProposalProblem(root, "src/new-file-of-the-test.ts"), null);
});
