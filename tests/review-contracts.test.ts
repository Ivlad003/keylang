// Contracts the author settled on 2026-10-06 (ADR 0016, amendment): a Stop
// hook turn keylang could not check is a warning the person sees; `feature`
// without `--since` judges the change since the merge-base with the main
// branch. Every test runs the real CLI (and, where it says so, MCP and the
// TUI) on a temporary repository and removes it afterwards.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { App } from "../src/tui/app.ts";
import { KEY } from "./tui-fixture.ts";
import { VirtualTerminal } from "./vt.ts";

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

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

// ---------- feature: the default base is the merge-base with the main branch ----------

interface FeatureJson {
  done: boolean;
  stage: string;
  gaps: { kind: string; id: string; file: string; line: number; reason: string }[];
  hints: { kind: string; id: string; file: string; reason: string }[];
  info: { rules: { id: string; file: string }[] | null; base: Record<string, unknown> | null };
}

function featureJson(dir: string, slug: string, args: string[] = []): { status: number | null; report: FeatureJson } {
  const r = keylang(dir, ["feature", slug, "--format", "json", ...args]);
  return { status: r.status, report: JSON.parse(r.stdout) as FeatureJson };
}

const REFUND_LAYERS = { languages: ["typescript"], layers: { ui: "src/ui/**", app: "src/app/**", infra: "src/infra/**" } };
const REFUND_FLOW = "# flow refund\n\n- trigger ui.cli.main\n  - step app.purchase.refund\n    - step app.refund_store.record\n";
const DENIED = "src/app/refund_store.ts:1:1: rule app.refund_store: divergence: `app.refund_store` depends on `infra.db`, which is denied by `deny app infra` (keylang/rules.md:3)";

/** `main` with the refund planned, then the branch `refund` that implements it through an import the rules deny, committed. */
function refundBranch(t: TestContext, extra: Record<string, string> = {}): string {
  const dir = tempDir(t, "keylang-contracts-feature-");
  writeTree(dir, {
    ".gitignore": ".keylang/\n",
    "keylang.json": `${JSON.stringify(REFUND_LAYERS)}\n`,
    "keylang/rules.md": "# rules\n\n- deny app infra\n",
    "src/ui/cli.ts": 'import { refund } from "../app/purchase.ts"; export function main(): void { refund(); }\n',
    "src/app/purchase.ts": "export function refund(): void {}\n",
    "src/infra/db.ts": "export function save(row: string): void { console.log(row); }\n",
    "keylang/features/refund.md": REFUND_FLOW,
    ...extra,
  });
  git(dir, ["init", "-q"]);
  assert.equal(keylang(dir, ["map"]).status, 0);
  git(dir, ["add", "."]);
  git(dir, ["commit", "-qm", "plan the refund"]);
  git(dir, ["checkout", "-qb", "refund"]);
  writeTree(dir, {
    "src/app/refund_store.ts": 'import { save } from "../infra/db.ts"; export function record(): void { save("refund"); }\n',
    "src/app/purchase.ts": 'import { record } from "./refund_store.ts"; export function refund(): void { record(); }\n',
  });
  assert.equal(keylang(dir, ["map"]).status, 0);
  git(dir, ["add", "."]);
  git(dir, ["commit", "-qm", "implement the refund"]);
  return dir;
}

async function mcpFeature(t: TestContext, dir: string, slug: string): Promise<unknown> {
  const client = new Client({ name: "keylang-test", version: "0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [bin, "mcp"], cwd: dir, stderr: "pipe" }));
  t.after(() => client.close());
  const r = (await client.callTool({ name: "feature_status", arguments: { slug } })) as { content: { text: string }[]; isError?: boolean };
  assert.notEqual(r.isError, true, r.content.map((c) => c.text).join(""));
  return JSON.parse(r.content.map((c) => c.text).join(""));
}

test("feature: without --since the base is the merge-base with the main branch, so a rule fail committed on the branch is this change's gap; MCP and the TUI take the same base; --since HEAD and a merged main keep HEAD", async (t) => {
  const dir = refundBranch(t);
  const fork = git(dir, ["rev-parse", "main"]).trim();

  const human = keylang(dir, ["feature", "refund"]);
  assert.equal(human.status, 1, human.stdout + human.stderr);
  assert.equal(human.stdout, `${DENIED}\n`);
  assert.equal(human.stderr, "1 gap(s) · stage ready\n");
  const json = featureJson(dir, "refund");
  assert.equal(json.status, 1);
  assert.deepEqual(json.report.info.base, { ref: fork, state: "compared", source: "merge-base", main: "main" });
  assert.deepEqual(json.report.info.rules, [], "nothing inherited: the fail is the branch's own");

  // MCP feature_status is the same operation, with the same default base.
  assert.deepEqual(await mcpFeature(t, dir, "refund"), json.report);

  // The TUI: the status line of the open feature file and the readiness action agree with the CLI.
  const vt = new VirtualTerminal(130, 32);
  const app = new App({ root: dir, cols: 130, rows: 32 });
  app.attach({ write: (ansi) => vt.feed(ansi) }, 130, 32);
  t.after(() => app.close());
  const palette = (text: string): void => {
    app.input(KEY.ctrlP);
    for (const ch of text) app.input(ch);
    app.input(KEY.enter);
  };
  await app.idle();
  palette("open keylang/features/refund.md");
  await app.idle();
  assert.match(vt.lines().at(-1)!, /feature ready · questions 0/);
  palette("feature readiness");
  app.input(KEY.enter);
  await app.idle();
  const record = app.state.records.at(-1)!;
  assert.equal(record.result?.exitCode, 1, JSON.stringify(record.result?.messages));
  assert.deepEqual(record.result?.kind === "feature" ? record.result.payload?.report : null, json.report);

  // An explicit --since HEAD is the old base: nothing changed since it, so the fail is inherited.
  const since = keylang(dir, ["feature", "refund", "--since", "HEAD"]);
  assert.equal(since.status, 0, since.stdout);
  assert.equal(since.stdout, `hint: ${DENIED.replace("rule app.refund_store: ", "rule app.refund_store: inherited (no file changed since HEAD, no id of this feature): ")}\n`);
  assert.equal(since.stderr, "done\n");
  assert.deepEqual(featureJson(dir, "refund", ["--since", "HEAD"]).report.info.base, { ref: "HEAD", state: "compared", source: "since" });

  // Merged into main, the merge-base is HEAD itself: the base is HEAD, as before.
  git(dir, ["checkout", "-q", "main"]);
  git(dir, ["merge", "-q", "--ff-only", "refund"]);
  const merged = featureJson(dir, "refund");
  assert.equal(merged.status, 0, JSON.stringify(merged.report.gaps));
  assert.deepEqual(merged.report.info.base, { ref: "HEAD", state: "compared", source: "HEAD", main: "main" });
  assert.match(merged.report.hints.find((hint) => hint.kind === "rule")?.reason ?? "", /^inherited \(no file changed since HEAD, no id of this feature\): divergence: /);
});

test("feature: the main branch is origin/HEAD before a local main; an inherited fail names the base as `merge-base <commit> with <branch>`; without a main branch the base is HEAD", (t) => {
  // A fail main already has, under a rule whose layer the branch does not touch: inherited on the branch.
  const dir = refundBranch(t, {
    "keylang/rules.md": "# rules\n\n- deny app infra\n- deny ui infra\n",
    "src/ui/legacy.ts": 'import { save } from "../infra/db.ts"; export function old(): void { save("old"); }\n',
  });
  const fork = git(dir, ["rev-parse", "main"]).trim();
  // The remote's default branch points at the fork; local main moves on, so its merge-base is another commit.
  git(dir, ["update-ref", "refs/remotes/origin/trunk", fork]);
  git(dir, ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/trunk"]);
  git(dir, ["checkout", "-q", "main"]);
  writeTree(dir, { "src/infra/log.ts": "export function log(): void {}\n" });
  git(dir, ["add", "."]);
  git(dir, ["commit", "-qm", "log on main"]);
  git(dir, ["checkout", "-q", "refund"]);
  git(dir, ["merge", "-q", "--no-edit", "main"]);

  const short = git(dir, ["rev-parse", "--short", fork]).trim();
  const human = keylang(dir, ["feature", "refund"]);
  assert.equal(human.status, 1, human.stdout + human.stderr);
  assert.match(human.stdout, new RegExp(`^${escaped(DENIED)}$`, "m"), "the branch's own fail still blocks");
  const legacy = "divergence: `ui.legacy` depends on `infra.db`, which is denied by `deny ui infra` (keylang/rules.md:4)";
  assert.match(human.stdout, new RegExp(`^hint: src/ui/legacy\\.ts:1:1: rule ui\\.legacy: inherited \\(no file changed since merge-base ${short} with origin/trunk, no id of this feature\\): ${escaped(legacy)}$`, "m"));
  assert.deepEqual(featureJson(dir, "refund").report.info.base, { ref: fork, state: "compared", source: "merge-base", main: "origin/trunk" });

  // No branch keylang knows as the main one: HEAD, as before.
  git(dir, ["symbolic-ref", "--delete", "refs/remotes/origin/HEAD"]);
  git(dir, ["update-ref", "-d", "refs/remotes/origin/trunk"]);
  git(dir, ["branch", "-q", "-m", "main", "stable"]);
  const bare = featureJson(dir, "refund");
  assert.equal(bare.status, 0, JSON.stringify(bare.report.gaps));
  assert.deepEqual(bare.report.info.base, { ref: "HEAD", state: "compared", source: "HEAD" });
});

test("feature: the plan is compared with the merge-base and with HEAD: a question removed in a branch commit is a gap; a feature new on the branch still keeps its committed plan; one removal is one gap", (t) => {
  const AUDIT = "# flow audit\n\n- ? who reads the audit log?\n- trigger ui.cli.main\n  - step app.purchase.refund\n";
  const dir = refundBranch(t, { "keylang/features/audit.md": AUDIT });
  const short = git(dir, ["rev-parse", "--short", "main"]).trim();

  // Answered by deleting it, in a commit of the branch: HEAD no longer has it, the merge-base does.
  writeFileSync(join(dir, "keylang/features/audit.md"), AUDIT.replace("- ? who reads the audit log?\n", ""));
  git(dir, ["commit", "-qam", "drop the question"]);
  const audit = featureJson(dir, "audit");
  assert.equal(audit.status, 1, JSON.stringify(audit.report));
  assert.deepEqual(
    audit.report.gaps.filter((gap) => gap.kind === "spec").map((gap) => [gap.id, gap.line, gap.reason]),
    [["audit", 3, `question «who reads the audit log?» of flow \`audit\` (line 3 at merge-base ${short} with main) was removed; done is judged against the plan at merge-base ${short} with main: answer the question in a commit`]],
  );
  // At HEAD as the base the deletion was already accepted: no such gap.
  assert.deepEqual(featureJson(dir, "audit", ["--since", "HEAD"]).report.gaps.filter((gap) => gap.kind === "spec"), []);
  // A step both the merge-base and HEAD have, removed in the working tree: one gap, at the merge-base.
  writeFileSync(join(dir, "keylang/features/audit.md"), "# flow audit\n\n- trigger ui.cli.main\n");
  const removed = featureJson(dir, "audit").report.gaps.filter((gap) => gap.id === "app.purchase.refund");
  assert.deepEqual(removed.map((gap) => [gap.kind, gap.line, gap.reason.replace(/ of flow .*/, "")]), [["spec", 5, "step `app.purchase.refund`"]]);
  assert.match(removed[0]!.reason, new RegExp(`\\(line 5 at merge-base ${short} with main\\)`));

  // A feature the branch added: the merge-base has no such file, HEAD has its committed plan.
  writeFileSync(join(dir, "keylang/features/audit.md"), AUDIT.replace("- ? who reads the audit log?\n", ""));
  writeTree(dir, { "keylang/features/store.md": "# flow store\n\n- trigger ui.cli.main\n  - step app.purchase.refund\n    - step app.refund_store.record\n" });
  git(dir, ["add", "."]);
  git(dir, ["commit", "-qm", "plan the store"]);
  // Weakened before a commit: the plan at HEAD still decides, as when HEAD was the only base.
  writeFileSync(join(dir, "keylang/features/store.md"), "# flow store\n\n- trigger ui.cli.main\n  - step app.purchase.refund\n");
  const store = featureJson(dir, "store");
  assert.equal(store.status, 1);
  assert.equal(store.report.info.base?.state, "absent");
  assert.equal(store.report.info.base?.source, "merge-base");
  assert.deepEqual(
    store.report.gaps.filter((gap) => gap.kind === "spec").map((gap) => [gap.id, gap.line, gap.reason]),
    [["app.refund_store.record", 5, "step `app.refund_store.record` of flow `store` (line 5 at HEAD) was changed or removed; done is judged against the plan at HEAD"]],
  );
});
