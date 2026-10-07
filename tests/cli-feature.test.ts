// The feature workflow: `baseline`, `feature` and its base commit, planned
// external packages, `check --changed` and `hook stop`, and the spec
// skeletons of `new flow` and `new module`.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { bin, git, keylang, LAYERS, ORDER, PAY, tempDir, treeBytes, writeTree } from "./cli-helpers.ts";

test("baseline: a new cross-layer import or package is K102; an allowed package is not; --check writes nothing", (t) => {
  const dir = tempDir(t, "keylang-baseline-");
  writeTree(dir, { "package.json": `${JSON.stringify({ name: "shop", private: true, dependencies: { stripe: "1.0.0" } })}\n`, "keylang.json": `${JSON.stringify(LAYERS)}\n`, "src/app/pay.ts": PAY, "src/domain/order.ts": ORDER });
  assert.equal(keylang(dir, ["baseline"]).status, 0);
  const text = readFileSync(join(dir, "keylang/rules.baseline.md"), "utf8");
  assert.match(text, /keylang:generated/);
  assert.match(text, /deny app domain, external, unassigned/);
  assert.equal(keylang(dir, ["baseline"]).status, 0);
  assert.equal(readFileSync(join(dir, "keylang/rules.baseline.md"), "utf8"), text);
  assert.equal(keylang(dir, ["baseline", "--check"]).status, 0);
  writeFileSync(join(dir, "src/app/pay.ts"), 'import { price } from "../domain/order.ts";\nexport function charge(): number {\n  return price();\n}\n');
  const drifted = keylang(dir, ["baseline", "--check"]);
  assert.equal(drifted.status, 1);
  assert.match(drifted.stdout, /keylang baseline/);
  assert.equal(readFileSync(join(dir, "keylang/rules.baseline.md"), "utf8"), text);
  const denied = keylang(dir, ["check"]);
  assert.equal(denied.status, 1, denied.stdout);
  assert.match(denied.stdout, /K102 divergence: `app\.pay` depends on `domain\.order`/);
  assert.match(denied.stdout, /rules\.baseline\.md/);
  writeFileSync(join(dir, "src/app/pay.ts"), 'import Stripe from "stripe";\nexport function charge(): number {\n  return Stripe ? 1 : 0;\n}\n');
  const pkg = keylang(dir, ["check"]);
  assert.match(pkg.stdout, /K102 divergence: `app\.pay` depends on `external\.stripe`/);
  assert.equal(keylang(dir, ["baseline"]).status, 0);
  const allowed = keylang(dir, ["check"]);
  assert.doesNotMatch(allowed.stdout, /external\.stripe/);
  assert.equal(allowed.status, 0, allowed.stdout);
});

test("baseline is a lower rule layer: a manual allow over the same layers lifts its deny; without it the baseline gives K102", (t) => {
  for (const format of [1, 2]) {
    const dir = tempDir(t, `keylang-baseline-layer-${format}-`);
    const config = { languages: ["typescript"], module: "file", format, layers: { article: ["src/article/**"], mail: ["src/mail/**"] } };
    writeTree(dir, {
      "keylang.json": `${JSON.stringify(config)}\n`,
      "src/article/post.ts": "export function publish(): number {\n  return 1;\n}\n",
      "src/mail/send.ts": "export function send(): number {\n  return 2;\n}\n",
      "keylang/rules.md": "# rules\n\n- allow article mail\n",
    });
    assert.equal(keylang(dir, ["baseline"]).status, 0);
    assert.match(readFileSync(join(dir, "keylang/rules.baseline.md"), "utf8"), /- deny article external, mail, unassigned/);
    git(dir, ["init"]);
    git(dir, ["add", "."]);
    git(dir, ["commit", "-m", "base"]);
    writeFileSync(join(dir, "src/article/post.ts"), 'import { send } from "../mail/send.ts";\nexport function publish(): number {\n  return send();\n}\n');
    const event = JSON.stringify({ hook_event_name: "Stop", stop_hook_active: false });
    const hook = (): string => spawnSync(process.execPath, [bin, "hook", "stop"], { cwd: dir, input: event, encoding: "utf8" }).stdout;

    const allowed = keylang(dir, ["check", "--format", "json"]);
    assert.equal(allowed.status, 0, allowed.stdout);
    assert.doesNotMatch(allowed.stdout, /K102/);
    assert.match(allowed.stdout, /manual rules over the baseline \(`allow article mail`\)/);
    assert.equal(hook(), "{}\n");
    // The graph now has the edge a person allowed: the baseline is stale until `keylang baseline` accepts it.
    const stale = keylang(dir, ["baseline", "--check"]);
    assert.equal(stale.status, 1, stale.stdout + stale.stderr);
    assert.match(stale.stdout + stale.stderr, /keylang baseline/);

    writeFileSync(join(dir, "keylang/rules.md"), "# rules\n");
    const denied = keylang(dir, ["check"]);
    assert.equal(denied.status, 1, denied.stdout);
    assert.match(denied.stdout, /K102 divergence: `article\.post` depends on `mail\.send`, which is denied by `deny article external mail unassigned` \(keylang\/rules\.baseline\.md:\d+\)/);
    assert.equal((JSON.parse(hook()) as { decision?: string }).decision, "block");
  }
});

test("feature: planned, static and rule gaps, then done; JSON is the only stdout", (t) => {
  const dir = tempDir(t, "keylang-feature-");
  writeTree(dir, {
    "keylang.json": `${JSON.stringify(LAYERS)}\n`,
    "src/app/pay.ts": PAY,
    "src/domain/order.ts": ORDER,
    "keylang/features/pay.md": "# flow pay\n\n- planned fn app.pay.refund (n: number) → number\n- trigger app.pay.charge\n  - step app.pay.refund\n  - step domain.order.price\n  - calls domain.order.price\n",
  });
  assert.equal(keylang(dir, ["baseline"]).status, 0);
  const gap = keylang(dir, ["feature", "pay", "--format", "json"]);
  assert.equal(gap.status, 1, gap.stdout);
  const body = JSON.parse(gap.stdout) as { done: boolean; gaps: { kind: string; id: string }[] };
  assert.equal(body.done, false);
  assert.ok(body.gaps.some((item) => item.kind === "planned" && item.id === "app.pay.refund"));
  // The step and the `calls` line each need their own static ok.
  assert.equal(body.gaps.filter((item) => item.kind === "static" && item.id === "domain.order.price").length, 2);
  assert.equal(gap.stdout.trimEnd() + "\n", gap.stdout);
  const missing = keylang(dir, ["feature", "nope"]);
  assert.equal(missing.status, 2);
  writeFileSync(join(dir, "src/app/pay.ts"), 'import { price } from "../domain/order.ts";\nexport function charge(): number {\n  return refund(price());\n}\nexport function refund(n: number): number {\n  return n;\n}\n');
  const ruled = keylang(dir, ["feature", "pay", "--format", "json"]);
  assert.equal(ruled.status, 1, ruled.stdout);
  const ruledBody = JSON.parse(ruled.stdout) as { gaps: { kind: string }[] };
  assert.ok(ruledBody.gaps.some((item) => item.kind === "rule"));
  assert.match(keylang(dir, ["check"]).stdout, /K102/);
  assert.equal(keylang(dir, ["baseline"]).status, 0);
  const done = keylang(dir, ["feature", "pay", "--format", "json"]);
  assert.equal(done.status, 0, done.stdout + done.stderr);
  const doneBody = JSON.parse(done.stdout) as { done: boolean; info: { base: { ref: string; state: string; reason?: string } } };
  assert.equal(doneBody.done, true);
  // Without git the plan is not compared: an informational field, not a gap.
  assert.equal(doneBody.info.base.state, "unavailable");
  assert.match(doneBody.info.base.reason ?? "", /^feature: /);
});

test("feature: a plan weakened since the base commit is a spec gap; planned removed after K202 is done; --since picks the base", (t) => {
  const dir = tempDir(t, "keylang-feature-base-");
  const plan = "# flow remind\n\n- planned fn app.pay.refund (n: number) → number\n- planned fn app.pay.remind () → number\n- trigger app.pay.charge\n  - step app.pay.refund\n  - step app.pay.remind\n";
  writeTree(dir, { "keylang.json": `${JSON.stringify(LAYERS)}\n`, "src/app/pay.ts": PAY, "src/domain/order.ts": ORDER, "keylang/features/remind.md": plan });
  git(dir, ["init"]);
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "plan"]);
  const status = (args: string[] = []): { status: number | null; body: { done: boolean; gaps: { kind: string; id: string; line: number; reason: string }[]; info: { base: { ref: string; state: string } } } } => {
    const r = keylang(dir, ["feature", "remind", "--format", "json", ...args]);
    return { status: r.status, body: JSON.parse(r.stdout || "null") };
  };
  assert.equal(status().body.info.base.state, "compared");

  // Rewrite the plan: drop both planned, and swap the reminder step for a wrapper that the code has.
  writeFileSync(join(dir, "src/app/pay.ts"), "export function charge(): number {\n  return refund(1) + wrapper();\n}\nexport function refund(n: number): number {\n  return n;\n}\nexport function wrapper(): number {\n  return 0;\n}\n");
  writeFileSync(join(dir, "keylang/features/remind.md"), "# flow remind\n\n- trigger app.pay.charge\n  - step app.pay.refund\n  - step app.pay.wrapper\n");
  const rewritten = status();
  assert.equal(rewritten.status, 1, JSON.stringify(rewritten.body));
  assert.equal(rewritten.body.done, false);
  const spec = rewritten.body.gaps.filter((gap) => gap.kind === "spec");
  assert.deepEqual(
    spec.map((gap) => [gap.id, gap.line]),
    [
      ["app.pay.remind", 4],
      ["app.pay.remind", 7],
    ],
  );
  assert.match(spec[0]!.reason, /planned fn `app\.pay\.remind` \(line 4 at HEAD\) was removed, but the code does not have it/);
  assert.match(spec[1]!.reason, /step `app\.pay\.remind` of flow `remind` \(line 7 at HEAD\) was changed or removed/);
  assert.ok(!rewritten.body.gaps.some((gap) => gap.id === "app.pay.refund"), "refund is implemented: removing its planned is fine");
  const human = keylang(dir, ["feature", "remind"]);
  assert.match(human.stdout, /keylang\/features\/remind\.md:7:\d+: spec app\.pay\.remind: /);

  // Implement the plan as written and drop the planned lines after K202: done.
  writeFileSync(join(dir, "src/app/pay.ts"), "export function charge(): number {\n  return refund(1) + remind();\n}\nexport function refund(n: number): number {\n  return n;\n}\nexport function remind(): number {\n  return 0;\n}\n");
  writeFileSync(join(dir, "keylang/features/remind.md"), "# flow remind\n\n- trigger app.pay.charge\n  - step app.pay.refund\n  - step app.pay.remind\n");
  const done = status();
  assert.equal(done.status, 0, JSON.stringify(done.body));
  assert.equal(done.body.done, true);

  // A person commits a changed plan: HEAD is the new base, an older one is still reachable with --since.
  const first = spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).stdout.trim();
  writeFileSync(join(dir, "src/app/pay.ts"), "export function charge(): number {\n  return refund(1) + wrapper();\n}\nexport function refund(n: number): number {\n  return n;\n}\nexport function wrapper(): number {\n  return 0;\n}\n");
  writeFileSync(join(dir, "keylang/features/remind.md"), "# flow remind\n\n- trigger app.pay.charge\n  - step app.pay.refund\n  - step app.pay.wrapper\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "replan"]);
  assert.equal(status().status, 0);
  const since = status(["--since", first]);
  assert.equal(since.status, 1);
  assert.equal(since.body.info.base.ref, first);
  assert.ok(since.body.gaps.some((gap) => gap.kind === "spec" && gap.id === "app.pay.remind"));
  const bad = keylang(dir, ["feature", "remind", "--since", "no-such-ref"]);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /feature: `no-such-ref` is not a commit/);
  assert.equal(bad.stdout, "");
});

test("check --changed and hook stop in a repository without commits: every file is changed, not a git error", (t) => {
  const dir = tempDir(t, "keylang-unborn-");
  writeTree(dir, {
    "keylang.json": `${JSON.stringify(LAYERS)}\n`,
    "src/app/pay.ts": 'import { price } from "../domain/order.ts";\nexport function charge(): number {\n  return price();\n}\n',
    "src/domain/order.ts": ORDER,
    "keylang/rules.md": "# rules\n\n- deny app domain\n",
  });
  git(dir, ["init"]);
  const untracked = keylang(dir, ["check", "--changed"]);
  assert.equal(untracked.status, 1, untracked.stderr);
  assert.match(untracked.stdout, /K102/);
  git(dir, ["add", "."]);
  const staged = keylang(dir, ["check", "--changed"]);
  assert.equal(staged.status, 1, staged.stderr);
  assert.match(staged.stdout, /K102/);
  const hook = spawnSync(process.execPath, [bin, "hook", "stop"], { cwd: dir, input: JSON.stringify({ hook_event_name: "Stop", stop_hook_active: false }), encoding: "utf8" });
  assert.equal(hook.status, 0, hook.stderr);
  assert.equal(JSON.parse(hook.stdout).decision, "block");
});

test("planned module external.<pkg> is static ok only from the importing parent module", (t) => {
  const feature = "# flow pay\n\n- planned module external.stripe\n- trigger app.pay.charge\n  - step external.stripe\n";
  const dir = tempDir(t, "keylang-external-");
  writeTree(dir, {
    "keylang.json": `${JSON.stringify(LAYERS)}\n`,
    "package.json": "{}\n",
    "src/app/pay.ts": PAY,
    "src/domain/order.ts": ORDER,
    "keylang/features/pay.md": feature,
  });
  const before = keylang(dir, ["check"]);
  assert.match(before.stdout, /unverified external\.stripe: planned module/);
  assert.match(before.stdout, /static unverified external\.stripe: planned module, not implemented/);
  writeFileSync(join(dir, "package.json"), `${JSON.stringify({ dependencies: { stripe: "1.0.0" } })}\n`);
  // Declared in the manifest, not yet imported: still a planned module, not K202.
  const declared = keylang(dir, ["check"]);
  assert.equal(declared.status, 0, declared.stdout + declared.stderr);
  assert.match(declared.stdout, /unverified external\.stripe: planned module/);
  assert.match(declared.stdout, /static unverified external\.stripe: planned module, not implemented/);
  assert.doesNotMatch(declared.stdout, /K202|K002/);
  writeFileSync(join(dir, "src/domain/order.ts"), 'import Stripe from "stripe";\nexport function price(): number {\n  return Stripe ? 2 : 0;\n}\n');
  const other = keylang(dir, ["check"]);
  // A package has no file of its own: the location is its first importer, never `?:1`.
  assert.match(other.stdout, /K202 planned module `external\.stripe` is implemented \(imported by src\/domain\/order\.ts:1\); remove the declaration/);
  assert.doesNotMatch(other.stdout, /\?:1/);
  assert.match(other.stdout, /static unverified external\.stripe: no import of `external\.stripe` from `app\.pay`/);
  const status = JSON.parse(keylang(dir, ["feature", "pay", "--format", "json"]).stdout) as { gaps: { kind: string; id: string; line: number }[] };
  assert.ok(status.gaps.some((gap) => gap.kind === "static" && gap.id === "external.stripe" && gap.line === 5));
  writeFileSync(join(dir, "src/domain/order.ts"), ORDER);
  writeFileSync(join(dir, "src/app/pay.ts"), 'import Stripe from "stripe";\nexport function charge(): number {\n  return Stripe ? 1 : 0;\n}\n');
  const own = keylang(dir, ["check"]);
  assert.match(own.stdout, /K202 planned module `external\.stripe` is implemented \(imported by src\/app\/pay\.ts:1\)/);
  assert.match(own.stdout, /static ok external\.stripe: imported by `app\.pay`/);
});

test("check --changed never hands git a piped stdin: the Codex sandbox cannot close one (EPERM), so git runs on the null device", { skip: process.platform === "win32" }, (t) => {
  const dir = tempDir(t, "keylang-sandbox-git-");
  writeTree(dir, {
    "keylang.json": `${JSON.stringify(LAYERS)}\n`,
    "src/app/pay.ts": 'import { price } from "../domain/order.ts";\nexport function charge(): number {\n  return price();\n}\n',
    "src/domain/order.ts": ORDER,
    "keylang/rules.md": "# rules\n\n- deny app domain\n",
  });
  // A `git` first on PATH that refuses a pipe or a socket as stdin, the way the sandbox breaks one.
  const realGit = spawnSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();
  const fakeBin = join(dir, ".bin");
  mkdirSync(fakeBin);
  writeFileSync(join(fakeBin, "git"), `#!/bin/sh\nif [ -p /dev/stdin ] || [ -S /dev/stdin ]; then echo "stdin is a pipe" >&2; exit 97; fi\nexec "${realGit}" "$@"\n`);
  chmodSync(join(fakeBin, "git"), 0o755);
  const env = { ...process.env, PATH: `${fakeBin}:${process.env.PATH ?? ""}` };
  const run = (args: string[]) => spawnSync(process.execPath, [bin, ...args], { cwd: dir, env, encoding: "utf8" });
  for (const commits of [false, true]) {
    git(dir, ["init", "-q"]);
    if (commits) {
      git(dir, ["add", "."]);
      git(dir, ["commit", "-qm", "base"]);
      writeFileSync(join(dir, "src/app/pay.ts"), `${readFileSync(join(dir, "src/app/pay.ts"), "utf8")}// touched\n`);
    }
    const changed = run(["check", "--changed"]);
    assert.doesNotMatch(changed.stderr, /stdin is a pipe|git/, changed.stderr);
    assert.equal(changed.status, 1, changed.stderr);
    assert.match(changed.stdout, /K102/);
  }
});

test("check --changed and hook stop report K001 when the step's source file was deleted", (t) => {
  const dir = tempDir(t, "keylang-deleted-");
  writeTree(dir, {
    "keylang.json": `${JSON.stringify(LAYERS)}\n`,
    "src/app/pay.ts": PAY,
    "src/domain/order.ts": ORDER,
    "keylang/flows/price.md": "# flow price\n\n- trigger app.pay.charge\n  - step domain.order.price\n",
  });
  git(dir, ["init"]);
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "base"]);
  rmSync(join(dir, "src/domain/order.ts"));
  const full = keylang(dir, ["check"]);
  assert.equal(full.status, 1, full.stdout);
  assert.match(full.stdout, /K001 dangling reference `domain\.order\.price`/);
  const changed = keylang(dir, ["check", "--changed"]);
  assert.equal(changed.status, 1, changed.stdout);
  assert.match(changed.stdout, /K001 dangling reference `domain\.order\.price`/);
  const hook = spawnSync(process.execPath, [bin, "hook", "stop"], {
    cwd: dir,
    input: JSON.stringify({ hook_event_name: "Stop", stop_hook_active: false }),
    encoding: "utf8",
  });
  assert.equal(hook.status, 0, hook.stderr);
  const decision = JSON.parse(hook.stdout) as { decision?: string; reason?: string };
  assert.equal(decision.decision, "block");
  assert.match(decision.reason ?? "", /keylang\/flows\/price\.md:\d+/);
});

test("check --changed keeps a flow of an unchanged spec whose step is in a changed file, and drops the others", (t) => {
  const dir = tempDir(t, "keylang-changed-flow-");
  const calls = 'import { price } from "../domain/order.ts";\nexport function charge(): number {\n  return price();\n}\n';
  writeTree(dir, {
    "keylang.json": `${JSON.stringify(LAYERS)}\n`,
    "src/app/pay.ts": calls,
    "src/domain/order.ts": ORDER,
    "src/domain/stock.ts": "export function left(): number {\n  return 0;\n}\nexport function count(): number {\n  return 1;\n}\n",
    "keylang/flows/pay.md": "# flow pay\n\n- trigger app.pay.charge\n  - step domain.order.price\n",
    "keylang/flows/stock.md": "# flow stock\n\n- trigger domain.stock.left\n  - step domain.stock.count\n",
  });
  git(dir, ["init"]);
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "base"]);
  writeFileSync(join(dir, "src/app/pay.ts"), PAY);
  const full = keylang(dir, ["check"]);
  assert.match(full.stdout, /keylang\/flows\/stock\.md:4/);
  const changed = keylang(dir, ["check", "--changed"]);
  assert.equal(changed.status, 1, changed.stdout);
  assert.match(changed.stdout, /keylang\/flows\/pay\.md:4:\d+: static fail/);
  assert.doesNotMatch(changed.stdout, /flows\/stock\.md/);
});

// review-2026-10-06/01: the `exports` rule's area is its module, so K104 on the rules line stays when that module's file changed.
test("check --changed, hook stop and feature keep K104 of an `exports` rule when the module's file changed", (t) => {
  const dir = tempDir(t, "keylang-changed-exports-");
  writeTree(dir, {
    ".gitignore": ".keylang/\n",
    "keylang.json": `${JSON.stringify(LAYERS)}\n`,
    "src/app/a.ts": 'import { b } from "../domain/b.ts";\nexport function a(): number {\n  return b();\n}\n',
    "src/domain/b.ts": "export function b(): number {\n  return 1;\n}\n",
    "keylang/rules.md": "# rules\n\n- module domain.b\n  - exports b\n",
  });
  git(dir, ["init", "-b", "main"]);
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "base"]);
  const clean = keylang(dir, ["check", "--changed"]);
  assert.equal(clean.status, 0, clean.stdout);
  writeFileSync(join(dir, "src/domain/b.ts"), "export function b(): number {\n  return 1;\n}\nexport function leaked(): number {\n  return 2;\n}\n");
  const k104 = /K104 divergence: `domain\.b` exports `leaked`/;
  const full = keylang(dir, ["check"]);
  assert.equal(full.status, 1, full.stdout);
  assert.match(full.stdout, k104);
  const changed = keylang(dir, ["check", "--changed"]);
  assert.equal(changed.status, 1, changed.stdout);
  assert.match(changed.stdout, k104);
  const hook = spawnSync(process.execPath, [bin, "hook", "stop"], { cwd: dir, input: "{}", encoding: "utf8" });
  assert.equal(hook.status, 0, hook.stderr);
  const decision = JSON.parse(hook.stdout) as { decision?: string; reason?: string };
  assert.equal(decision.decision, "block", hook.stdout);
  assert.match(decision.reason ?? "", /K104/);

  // On a feature branch the leaked export implements the feature's planned fn: the fail is this change's, not inherited.
  git(dir, ["checkout", "-q", "-b", "feat"]);
  writeTree(dir, {
    "keylang/features/leak.md": "# flow leak\n\n- planned fn domain.b.leaked () → number\n- trigger app.a.a\n  - step domain.b.leaked\n",
    "src/app/a.ts": 'import { b, leaked } from "../domain/b.ts";\nexport function a(): number {\n  return b() + leaked();\n}\n',
  });
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "leak"]);
  type Body = { done: boolean; gaps: { kind: string; id: string; reason: string }[]; hints: { kind: string; reason: string }[]; info: { rules: unknown[] | null } };
  const feature = keylang(dir, ["feature", "leak", "--format", "json"]);
  assert.equal(feature.status, 1, feature.stdout);
  const body = JSON.parse(feature.stdout) as Body;
  assert.equal(body.done, false);
  assert.ok(body.gaps.some((gap) => gap.kind === "rule" && gap.id === "domain.b" && /exports `leaked`/.test(gap.reason)), JSON.stringify(body.gaps));
  assert.deepEqual(body.info.rules, []);

  // Merged into main, nothing changed since the base: the fail still names the feature's own module, so it is not inherited.
  git(dir, ["checkout", "-q", "main"]);
  git(dir, ["merge", "-q", "feat"]);
  const merged = keylang(dir, ["feature", "leak", "--format", "json"]);
  assert.equal(merged.status, 1, merged.stdout);
  const after = JSON.parse(merged.stdout) as Body;
  assert.ok(after.gaps.some((gap) => gap.kind === "rule" && gap.id === "domain.b"), JSON.stringify(after.gaps));
  assert.ok(!after.hints.some((hint) => hint.kind === "rule"), JSON.stringify(after.hints));
});

// review-2026-10-06/02: the area of `no-cycles` under M is M, its submodules and what they reach by import, not M alone.
test("check --changed, hook stop and feature keep K105 of `no-cycles` under a module when a file it reaches closed the cycle", (t) => {
  const dir = tempDir(t, "keylang-changed-cycle-");
  writeTree(dir, {
    ".gitignore": ".keylang/\n",
    "keylang.json": `${JSON.stringify(LAYERS)}\n`,
    "src/app/a.ts": 'import { b } from "../domain/b.ts";\nexport function a(): number {\n  return b();\n}\n',
    "src/domain/b.ts": "export function b(): number {\n  return 1;\n}\n",
    "keylang/rules.md": "# rules\n\n- module app\n  - no-cycles\n",
    "keylang/features/pay.md": "# flow pay\n\n- trigger app.a.a\n  - step domain.b.b\n",
  });
  git(dir, ["init", "-b", "main"]);
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "base"]);
  const clean = keylang(dir, ["check", "--changed"]);
  assert.equal(clean.status, 0, clean.stdout);
  // Only the domain file changes: the cycle runs through app, which the rule guards.
  writeFileSync(join(dir, "src/domain/b.ts"), 'import { a } from "../app/a.ts";\nexport function b(): number {\n  return a() ? 1 : 2;\n}\n');
  const k105 = /K105 divergence: dependency cycle app\.a → domain\.b → app\.a/;
  const full = keylang(dir, ["check"]);
  assert.equal(full.status, 1, full.stdout);
  assert.match(full.stdout, k105);
  const changed = keylang(dir, ["check", "--changed"]);
  assert.equal(changed.status, 1, changed.stdout);
  assert.match(changed.stdout, k105);
  const hook = spawnSync(process.execPath, [bin, "hook", "stop"], { cwd: dir, input: "{}", encoding: "utf8" });
  assert.equal(hook.status, 0, hook.stderr);
  const decision = JSON.parse(hook.stdout) as { decision?: string; reason?: string };
  assert.equal(decision.decision, "block", hook.stdout);
  assert.match(decision.reason ?? "", /K105/);
  const feature = keylang(dir, ["feature", "pay", "--format", "json"]);
  assert.equal(feature.status, 1, feature.stdout);
  const body = JSON.parse(feature.stdout) as { done: boolean; gaps: { kind: string; id: string; reason: string }[]; info: { rules: unknown[] | null } };
  assert.ok(body.gaps.some((gap) => gap.kind === "rule" && gap.id === "app" && /dependency cycle/.test(gap.reason)), JSON.stringify(body.gaps));
  assert.deepEqual(body.info.rules, []);
  // A change in a file the area does not reach leaves the rule out of the slice.
  writeFileSync(join(dir, "src/domain/b.ts"), "export function b(): number {\n  return 1;\n}\n");
  writeTree(dir, { "src/domain/c.ts": 'import { b } from "./b.ts";\nexport function c(): number {\n  return b();\n}\n' });
  const outside = keylang(dir, ["check", "--changed"]);
  assert.equal(outside.status, 0, outside.stdout);
  assert.doesNotMatch(outside.stdout, /no-cycles/);
});

// DX commands (design §7.5): spec skeletons.

test("new flow and new module write a skeleton that check accepts and never overwrite", (t) => {
  const dir = tempDir(t, "keylang-new-");
  writeTree(dir, { "keylang.json": `${JSON.stringify(LAYERS)}\n`, "src/app/pay.ts": PAY, "src/domain/order.ts": ORDER });

  const flow = keylang(dir, ["new", "flow", "refund"]);
  assert.equal(flow.status, 0, flow.stderr);
  assert.match(flow.stdout, /keylang\/flows\/refund\.md/);
  const flowText = readFileSync(join(dir, "keylang/flows/refund.md"), "utf8");
  assert.match(flowText, /^# flow refund\n/);

  const module = keylang(dir, ["new", "module", "payments", "--layer", "app"]);
  assert.equal(module.status, 0, module.stderr);
  assert.match(module.stdout, /keylang\/features\/payments\.md/);
  const moduleText = readFileSync(join(dir, "keylang/features/payments.md"), "utf8");
  assert.match(moduleText, /^# flow payments\n\nA feature file: .*`keylang feature payments` says what is still missing\. .*`- trigger` and `- step`.*\n\n- planned module app\.payments\n$/);
  // The explanatory paragraph is prose only: check and feature see the same file without it.
  const withNote = [keylang(dir, ["check", "keylang/features/payments.md"]), keylang(dir, ["feature", "payments"])];
  writeFileSync(join(dir, "keylang/features/payments.md"), "# flow payments\n\n- planned module app.payments\n");
  const withoutNote = [keylang(dir, ["check", "keylang/features/payments.md"]), keylang(dir, ["feature", "payments"])];
  writeFileSync(join(dir, "keylang/features/payments.md"), moduleText);
  const outcome = (runs: typeof withNote) =>
    runs.map((run) => ({ status: run.status, stdout: run.stdout.replace(/payments\.md:\d+:/g, "payments.md:N:"), stderr: run.stderr }));
  assert.deepEqual(outcome(withNote), outcome(withoutNote));
  assert.match(withNote[1]!.stdout, /planned `app\.payments` is not implemented/);

  const checked = keylang(dir, ["check"]);
  assert.equal(checked.status, 0, checked.stdout);
  assert.doesNotMatch(checked.stdout, /K\d{3}/);
  assert.equal(keylang(dir, ["fmt", "--check", "keylang/flows/refund.md", "keylang/features/payments.md"]).status, 0);

  const before = treeBytes(dir);
  const twice = keylang(dir, ["new", "flow", "refund"]);
  assert.equal(twice.status, 2);
  assert.match(twice.stderr, /exists/);
  assert.equal(keylang(dir, ["new", "module", "payments", "--layer", "app"]).status, 2);
  const badLayer = keylang(dir, ["new", "module", "billing", "--layer", "infra"]);
  assert.equal(badLayer.status, 2);
  assert.match(badLayer.stderr, /infra/);
  assert.match(badLayer.stderr, /app, domain/);
  assert.equal(keylang(dir, ["new", "module", "billing"]).status, 2);
  assert.equal(keylang(dir, ["new", "flow", "bad name"]).status, 2);
  assert.equal(keylang(dir, ["new", "flow"]).status, 2);
  assert.equal(keylang(dir, ["new", "thing", "x"]).status, 2);
  assert.deepEqual(treeBytes(dir), before);
});

test("new module names the missing keylang.json or its missing layers instead of an empty layer list, and writes nothing", (t) => {
  const empty = tempDir(t, "keylang-new-empty-");
  const none = keylang(empty, ["new", "module", "orders", "--layer", "domain"]);
  assert.equal(none.status, 2);
  assert.equal(none.stderr, 'keylang: new module: no keylang.json here; add "layers" to keylang.json (or run `keylang init` once there is code)\n');
  assert.deepEqual(readdirSync(empty), []);

  const noLayers = tempDir(t, "keylang-new-nolayers-");
  writeTree(noLayers, { "keylang.json": '{ "format": 2 }\n' });
  const before = treeBytes(noLayers);
  const o = keylang(noLayers, ["new", "module", "orders", "--layer", "domain"]);
  assert.equal(o.status, 2);
  assert.equal(o.stderr, "keylang: new module: no layers in keylang.json\n");
  assert.deepEqual(treeBytes(noLayers), before);
});
