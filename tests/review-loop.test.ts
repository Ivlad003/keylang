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
import { runOperation } from "../src/operations.ts";
import { codeProposalProblem, proposalProblem } from "../src/proposals.ts";
import { App } from "../src/tui/app.ts";
import { KEY } from "./tui-fixture.ts";
import { VirtualTerminal } from "./vt.ts";

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

// ---------- the fact cache ----------

test("check, feature and hook stop leave the fact cache for the next run; map --check does not; a cache that cannot be written changes nothing", async (t) => {
  const dir = repoCopy(t);
  writeTree(dir, { "keylang/features/pay.md": "# flow pay\n\n- trigger app.checkout.checkout\n  - step domain.order.createOrder\n" });
  const cache = join(dir, CACHE);
  assert.equal(keylang(dir, ["map", "--check"]).status, 1);
  assert.equal(existsSync(cache), false, "map --check writes no cache");
  const json = keylang(dir, ["check", "--format", "json"]);
  assert.equal(json.status, 0, json.stdout);
  JSON.parse(json.stdout);
  assert.equal(json.stderr.includes("cache"), false);
  const stored = JSON.parse(readFileSync(cache, "utf8")) as { files: Record<string, unknown> };
  assert.deepEqual(Object.keys(stored.files).sort(), ["src/app/checkout.ts", "src/domain/order.ts", "src/infra/db.ts"]);
  // Nothing changed: the next run reads the cache and leaves the file as it is.
  const mtime = statSync(cache).mtimeMs;
  assert.equal(keylang(dir, ["check"]).status, 0);
  assert.equal(statSync(cache).mtimeMs, mtime);
  // A changed source is extracted again and the cache follows it.
  writeFileSync(join(dir, "src/infra/db.ts"), `${readFileSync(join(dir, "src/infra/db.ts"), "utf8")}export function count(): number {\n  return 0;\n}\n`);
  assert.equal(keylang(dir, ["feature", "pay"]).status, 0);
  assert.match(readFileSync(cache, "utf8"), /"count"/);
  rmSync(cache);
  git(dir, ["init"]);
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "base"]);
  const hook = keylang(dir, ["hook", "stop"], JSON.stringify({ hook_event_name: "Stop", stop_hook_active: false }));
  assert.equal(hook.status, 0, hook.stderr);
  assert.equal(hook.stdout, "{}\n");
  assert.equal(existsSync(cache), true, "hook stop leaves the cache");
  // The cache is keylang's own state, untracked here: no change for the next `--changed`.
  const changed = await runOperation({ kind: "check", root: dir, paths: [], strict: false, changed: true });
  assert.deepEqual(changed.payload?.changed?.files, []);

  // A file where the cache directory belongs (a read-only tree, a sandbox): the same answers, no note.
  rmSync(join(dir, ".keylang"), { recursive: true, force: true });
  writeTree(dir, { ".keylang/cache": "not a directory\n" });
  const blocked = keylang(dir, ["check", "--format", "json"]);
  assert.equal(blocked.status, 0, blocked.stderr);
  JSON.parse(blocked.stdout);
  assert.match(blocked.stderr, /^\d+ fail, \d+ unverified, \d+ ok\n$/, "the summary only: no note about the cache");
  assert.equal(keylang(dir, ["feature", "pay"]).status, 0);
  assert.equal(readFileSync(join(dir, ".keylang/cache"), "utf8"), "not a directory\n");
});

test("MCP saves the fact cache when its facts differ from it, and only then", async (t) => {
  const dir = repoCopy(t);
  const call = await mcpClient(t, dir);
  const cache = join(dir, CACHE);
  assert.equal((await call("search", { query: "order" })).isError, false);
  assert.equal(existsSync(cache), true, "the first answer leaves the cache");
  const mtime = statSync(cache).mtimeMs;
  await call("node", { id: "domain.order.total" });
  assert.equal(statSync(cache).mtimeMs, mtime, "the same snapshot: the cache is not written again");
  writeFileSync(join(dir, "src/domain/order.ts"), `${readFileSync(join(dir, "src/domain/order.ts"), "utf8")}export function discount(): number {\n  return 0;\n}\n`);
  await call("search", { query: "discount" });
  assert.match(readFileSync(cache, "utf8"), /"discount"/);
});

// ---------- feature: only this change's rule fails block ----------

const FEATURE_LAYERS = { languages: ["typescript"], module: "file", layers: { app: ["src/app/**"], domain: ["src/domain/**"], infra: ["src/infra/**"] } };
const LEGACY = 'import { save } from "../infra/db.ts";\nexport function old(): number {\n  return save(1);\n}\n';
const PAY = 'import { price } from "../domain/order.ts";\nexport function charge(): number {\n  return price();\n}\n';
const PAID = 'import { price } from "../domain/order.ts";\nexport function charge(): number {\n  return refund(price());\n}\nexport function refund(n: number): number {\n  return n;\n}\n';

type Report = { done: boolean; stage: string; gaps: { kind: string; id: string; file: string }[]; hints: { kind: string; id: string; file: string; reason: string }[]; info: { rules: { id: string; file: string; verdict: string; reason: string }[] | null; base: { state: string } | null } };

/** A committed repository with an inherited forbidden import (`domain.legacy` → `infra.db`) and the refund feature. */
function inheritedRepo(t: TestContext, feature: string): string {
  const dir = tempDir(t, "keylang-loop-feature-");
  writeTree(dir, {
    "keylang.json": `${JSON.stringify(FEATURE_LAYERS)}\n`,
    "keylang/rules.md": "# rules\n\n- deny domain infra\n",
    "src/infra/db.ts": "export function save(n: number): number {\n  return n;\n}\n",
    "src/domain/order.ts": "export function price(): number {\n  return 2;\n}\n",
    "src/domain/legacy.ts": LEGACY,
    "src/app/pay.ts": PAY,
    "keylang/features/refund.md": feature,
  });
  git(dir, ["init"]);
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "base"]);
  return dir;
}

const REFUND = "# flow refund\n\n- planned fn app.pay.refund (n: number) → number\n- trigger app.pay.charge\n  - step app.pay.refund\n";

function feature(dir: string, slug: string, args: string[] = []): { status: number | null; body: Report; human: string } {
  const r = keylang(dir, ["feature", slug, "--format", "json", ...args]);
  const human = keylang(dir, ["feature", slug, ...args]);
  return { status: r.status, body: JSON.parse(r.stdout) as Report, human: human.stdout };
}

test("feature: an inherited rule fail is a hint and info.rules, not a gap; a fail of this change blocks, as check --changed reports it", async (t) => {
  const dir = inheritedRepo(t, REFUND);
  assert.equal(keylang(dir, ["check"]).status, 1, "the inherited K102 fails the full check");
  writeFileSync(join(dir, "src/app/pay.ts"), PAID);
  const done = feature(dir, "refund");
  assert.equal(done.status, 0, JSON.stringify(done.body));
  assert.deepEqual([done.body.done, done.body.stage, done.body.gaps], [true, "done", []]);
  assert.deepEqual(
    done.body.info.rules?.map((item) => [item.id, item.file, item.verdict]),
    [["domain.legacy", "src/domain/legacy.ts", "fail"]],
  );
  assert.match(done.body.info.rules![0]!.reason, /K102|`domain\.legacy` depends on `infra\.db`/);
  const hint = done.body.hints.find((item) => item.kind === "rule");
  assert.ok(hint, JSON.stringify(done.body.hints));
  assert.equal(hint.file, "src/domain/legacy.ts");
  assert.match(hint.reason, /^inherited \(no file changed since HEAD, no id of this feature\): divergence: `domain\.legacy` depends on `infra\.db`/);
  assert.match(done.human, /^hint: src\/domain\/legacy\.ts:1:\d+: rule domain\.legacy: inherited/m);
  // MCP answers the same report.
  const call = await mcpClient(t, dir);
  assert.deepEqual(JSON.parse((await call("feature_status", { slug: "refund" })).text), done.body);

  // This change adds a forbidden import: it blocks, and so does every fail of the rule check --changed reports with it.
  writeFileSync(join(dir, "src/domain/order.ts"), 'import { save } from "../infra/db.ts";\nexport function price(): number {\n  return save(2);\n}\n');
  const blocked = feature(dir, "refund");
  assert.equal(blocked.status, 1);
  const changed = keylang(dir, ["check", "--changed", "--format", "json"]);
  const reported = (JSON.parse(changed.stdout) as { results: { verdict: string; file: string; area: string }[] }).results.filter((row) => row.verdict === "fail");
  assert.deepEqual(
    blocked.body.gaps.filter((gap) => gap.kind === "rule").map((gap) => [gap.id, gap.file]).sort(),
    reported.map((row) => [row.area, row.file]).sort(),
  );
  assert.ok(blocked.body.gaps.some((gap) => gap.kind === "rule" && gap.id === "domain.order"), JSON.stringify(blocked.body.gaps));
  assert.deepEqual(blocked.body.info.rules, []);
});

test("the TUI status line and readiness screen agree with feature: an inherited rule fail keeps no feature from done", async (t) => {
  const dir = inheritedRepo(t, REFUND);
  writeFileSync(join(dir, "src/app/pay.ts"), PAID);
  const vt = new VirtualTerminal(130, 32);
  const app = new App({ root: dir, cols: 130, rows: 32 });
  app.attach({ kind: "terminal", write: (ansi) => vt.feed(ansi) }, 130, 32);
  t.after(() => app.close());
  const palette = (text: string): void => {
    app.input(KEY.ctrlP);
    for (const ch of text) app.input(ch);
    app.input(KEY.enter);
  };
  await app.idle();
  palette("open keylang/features/refund.md");
  await app.idle();
  assert.match(vt.lines().at(-1)!, /feature done · questions 0/);
  palette("feature readiness");
  assert.equal(app.state.prompt?.text, "refund");
  app.input(KEY.enter);
  await app.idle();
  const record = app.state.records.at(-1)!;
  assert.equal(record.result?.exitCode, 0, JSON.stringify(record.result?.messages));
  assert.deepEqual(record.result?.kind === "feature" ? record.result.payload?.report : null, feature(dir, "refund").body);
});

test("feature: a committed rule fail on an id the feature names blocks; without git every rule fail blocks and info.rules is null", (t) => {
  // The feature plans the module the inherited import reaches: the fail is on its id, though nothing changed.
  const dir = inheritedRepo(t, "# flow audit\n\n- planned module infra.db\n- trigger app.pay.charge\n");
  const named = feature(dir, "refund");
  assert.equal(named.status, 1, JSON.stringify(named.body));
  assert.deepEqual(
    named.body.gaps.map((gap) => [gap.kind, gap.id]),
    [["rule", "domain.legacy"]],
  );
  assert.deepEqual(named.body.info.rules, []);

  rmSync(join(dir, ".git"), { recursive: true, force: true });
  writeFileSync(join(dir, "keylang/features/refund.md"), REFUND);
  writeFileSync(join(dir, "src/app/pay.ts"), PAID);
  const bare = feature(dir, "refund");
  assert.equal(bare.status, 1, JSON.stringify(bare.body));
  assert.equal(bare.body.info.base?.state, "unavailable");
  assert.equal(bare.body.info.rules, null);
  assert.deepEqual(
    bare.body.gaps.map((gap) => [gap.kind, gap.id]),
    [["rule", "domain.legacy"]],
  );
  assert.equal(bare.body.hints.some((item) => item.kind === "rule"), false);
});

// ---------- validate_spec ----------

test("validate_spec takes a spec directory whose name starts with two dots; a path out of the repository is still refused", async (t) => {
  const dir = repoCopy(t);
  writeFileSync(join(dir, "keylang.json"), `${JSON.stringify({ ...JSON.parse(readFileSync(join(dir, "keylang.json"), "utf8")), dir: "..specs" })}\n`);
  cpSync(join(dir, "keylang"), join(dir, "..specs"), { recursive: true });
  rmSync(join(dir, "keylang"), { recursive: true, force: true });
  const call = await mcpClient(t, dir);
  const r = await call("validate_spec", { path: "..specs/flows/x.md", text: "# flow x\n\n- trigger app.checkout.nope\n" });
  assert.equal(r.isError, false, r.text);
  const body = JSON.parse(r.text) as { file: string; diagnostics: { code: string; line: number }[] };
  assert.equal(body.file, "..specs/flows/x.md");
  assert.deepEqual(body.diagnostics.map((diag) => [diag.code, diag.line]), [["K001", 3]]);
  for (const path of ["../x.md", "..", "/etc/x.md"]) {
    const out = await call("validate_spec", { path, text: "# flow y\n" });
    assert.equal(out.isError, true, path);
    assert.match(out.text, /outside the repository/, path);
  }
  // apply_diff reads the same directory as specs.
  const proposed = await call("apply_diff", { path: "..specs/flows/checkout.md", text: `${CHECKOUT}  - invariant x\n` });
  assert.equal(proposed.isError, false, proposed.text);
});
