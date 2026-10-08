// An agent must not switch a rule off by weakening the spec: `keylang.json`
// (`exclude`, `assume`, `outside`, `layers`, `frameworks`) or the rules and
// flows themselves. `hook stop`, `check --changed` and `feature` compare them
// with the base and report K108; `check --changed --accept-weakening` is a
// person's override; a plain `check` is unchanged (ticket 49).

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { bin, git, keylang, LAYERS, ORDER, PAY, tempDir, writeTree } from "./cli-helpers.ts";
import { configWeakenings } from "../src/weakening.ts";

const DENY = "# rules\n\n- deny domain app\n";
const FLOW = "# flow pay\n\n- trigger app.pay.charge\n  - step domain.order.price\n";
/** domain imports app: what `deny domain app` forbids. */
const VIOLATION = 'import { charge } from "../app/pay.ts";\nexport function price(): number {\n  return charge();\n}\n';
const PAY_CALLS = 'import { price } from "../domain/order.ts";\nexport function charge(): number {\n  return price();\n}\n';

/** A committed repository: layers app and domain, `deny domain app`, a flow from app to domain. */
function repo(t: { after: (f: () => void) => void }, extra: Record<string, string> = {}): string {
  const dir = tempDir(t, "keylang-weaken-");
  writeTree(dir, {
    "keylang.json": `${JSON.stringify(LAYERS, null, 2)}\n`,
    "src/app/pay.ts": PAY_CALLS,
    "src/domain/order.ts": ORDER,
    "keylang/rules.md": DENY,
    "keylang/flows/pay.md": FLOW,
    ...extra,
  });
  git(dir, ["init", "-q"]);
  git(dir, ["add", "."]);
  git(dir, ["commit", "-q", "-m", "base"]);
  return dir;
}

function hook(dir: string): { decision?: string; reason?: string; systemMessage?: string } {
  const r = spawnSync(process.execPath, [bin, "hook", "stop"], { cwd: dir, input: JSON.stringify({ hook_event_name: "Stop", stop_hook_active: false }), encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout) as { decision?: string; reason?: string; systemMessage?: string };
}

function setConfig(dir: string, patch: Record<string, unknown>): void {
  writeFileSync(join(dir, "keylang.json"), `${JSON.stringify({ ...LAYERS, ...patch }, null, 2)}\n`);
}

test("weakening: exclude, assume or outside over a file a deny reaches blocks hook stop and check --changed with K108; a plain check is unchanged; --accept-weakening passes", (t) => {
  for (const [field, glob] of [
    ["exclude", "src/domain/order.ts"],
    ["assume", "src/app/**"],
    ["outside", "src/domain/**"],
  ] as const) {
    const dir = repo(t);
    writeFileSync(join(dir, "src/domain/order.ts"), VIOLATION);
    // Before the weakening the hook blocks with the rule itself.
    assert.match(hook(dir).reason ?? "", /K102/);
    setConfig(dir, { [field]: [glob] });
    const decision = hook(dir);
    assert.equal(decision.decision, "block", `${field}: ${JSON.stringify(decision)}`);
    assert.match(decision.reason ?? "", new RegExp(`keylang\\.json:\\d+: K108 spec weakened: \`${field}\` \\[\\] → \\["${glob.replace(/[.*]/g, "\\$&")}"\\]`));
    assert.match(decision.reason ?? "", /deny domain app/);

    const changed = keylang(dir, ["check", "--changed"]);
    assert.equal(changed.status, 1, `${field}: ${changed.stdout}${changed.stderr}`);
    assert.match(changed.stdout, /keylang\.json:\d+:\d+: K108 spec weakened/);

    const plain = keylang(dir, ["check"]);
    assert.doesNotMatch(plain.stdout, /K108/);

    const accepted = keylang(dir, ["check", "--changed", "--accept-weakening"]);
    assert.doesNotMatch(accepted.stdout, /K108/);
    assert.match(accepted.stderr, /accepted .*K108 spec weakened/);
    // What is left is the code against the weakened spec: `assume` over app leaves the flow's trigger dangling (K001).
    assert.equal(accepted.status, field === "assume" ? 1 : 0, accepted.stdout + accepted.stderr);
  }
});

test("weakening: a glob or a layer that reaches no ruled file is no weakening", (t) => {
  const dir = repo(t);
  writeTree(dir, { "tools/gen.ts": "export function gen(): number {\n  return 3;\n}\n" });
  setConfig(dir, { layers: { ...LAYERS.layers, tools: ["tools/**"] }, exclude: ["tools/gen.ts"] });
  assert.deepEqual(hook(dir), {});
  const changed = keylang(dir, ["check", "--changed"]);
  assert.equal(changed.status, 0, changed.stdout + changed.stderr);
  assert.doesNotMatch(changed.stdout, /K108/);
});

test("weakening: a layer retargeted away from a ruled file is K108", (t) => {
  const dir = repo(t);
  writeFileSync(join(dir, "src/domain/order.ts"), VIOLATION);
  setConfig(dir, { layers: { app: ["src/nothing/**"], domain: ["src/domain/**"] } });
  const decision = hook(dir);
  assert.equal(decision.decision, "block", JSON.stringify(decision));
  assert.match(decision.reason ?? "", /K108 spec weakened: `layers`/);
  assert.match(decision.reason ?? "", /src\/app\/pay\.ts: app → unassigned/);
});

test("weakening: a new allow, a removed deny, a removed step and rules outside rules.md are K108", (t) => {
  const allow = repo(t);
  writeFileSync(join(allow, "src/domain/order.ts"), VIOLATION);
  writeFileSync(join(allow, "keylang/rules.md"), `${DENY}- allow domain.order app\n`);
  const allowed = hook(allow);
  assert.equal(allowed.decision, "block");
  assert.match(allowed.reason ?? "", /keylang\/rules\.md:4: K108 spec weakened: new `allow domain\.order app`/);

  const removed = repo(t);
  writeFileSync(join(removed, "keylang/rules.md"), "# rules\n");
  const gone = hook(removed);
  assert.equal(gone.decision, "block");
  assert.match(gone.reason ?? "", /keylang\/rules\.md:3: K108 spec weakened: `deny domain app` \(keylang\/rules\.md:3 at HEAD\) was removed/);
  const changed = keylang(removed, ["check", "--changed"]);
  assert.equal(changed.status, 1, changed.stdout);
  assert.match(changed.stdout, /K108/);

  const step = repo(t);
  writeFileSync(join(step, "keylang/flows/pay.md"), "# flow pay\n\n- trigger app.pay.charge\n");
  const stepGone = hook(step);
  assert.equal(stepGone.decision, "block");
  assert.match(stepGone.reason ?? "", /keylang\/flows\/pay\.md:4: K108 spec weakened: step `domain\.order\.price` of flow `pay` \(keylang\/flows\/pay\.md:4 at HEAD\) was removed/);

  const elsewhere = repo(t);
  writeFileSync(join(elsewhere, "keylang/flows/pay.md"), `${FLOW}\n# rules\n\n- deny app domain\n`);
  const outside = hook(elsewhere);
  assert.equal(outside.decision, "block");
  assert.match(outside.reason ?? "", /keylang\/flows\/pay\.md:8: K108 spec weakened: `deny app domain` in a `# rules` section outside keylang\/rules\.md/);
});

test("weakening: a baseline regenerated over a new edge is wider: K108 until a person accepts it", (t) => {
  const dir = tempDir(t, "keylang-weaken-baseline-");
  writeTree(dir, { "keylang.json": `${JSON.stringify(LAYERS)}\n`, "src/app/pay.ts": PAY, "src/domain/order.ts": ORDER });
  assert.equal(keylang(dir, ["baseline"]).status, 0);
  git(dir, ["init", "-q"]);
  git(dir, ["add", "."]);
  git(dir, ["commit", "-q", "-m", "base"]);
  writeFileSync(join(dir, "src/app/pay.ts"), PAY_CALLS);
  assert.match(hook(dir).reason ?? "", /K102/);
  assert.equal(keylang(dir, ["baseline"]).status, 0);
  const decision = hook(dir);
  assert.equal(decision.decision, "block", JSON.stringify(decision));
  assert.match(decision.reason ?? "", /keylang\/rules\.baseline\.md:\d+: K108 spec weakened: `deny app domain` \(keylang\/rules\.baseline\.md:\d+ at HEAD\) was removed/);
  const person = keylang(dir, ["check", "--changed", "--accept-weakening"]);
  assert.equal(person.status, 0, person.stdout + person.stderr);
  git(dir, ["add", "."]);
  git(dir, ["commit", "-q", "-m", "accepted by a person"]);
  assert.deepEqual(hook(dir), {});
});

test("weakening: feature reports a weakened spec since its base as a `weakened` gap", (t) => {
  const dir = repo(t, { "keylang/features/pay.md": "# flow refund\n\n- trigger app.pay.charge\n  - step domain.order.price\n" });
  setConfig(dir, { assume: ["src/app/**"] });
  const out = keylang(dir, ["feature", "pay", "--format", "json"]);
  assert.equal(out.status, 1, out.stdout + out.stderr);
  const report = JSON.parse(out.stdout) as { done: boolean; gaps: { kind: string; file: string; reason: string }[] };
  const gap = report.gaps.find((item) => item.kind === "weakened");
  assert.ok(gap, out.stdout);
  assert.equal(gap.file, "keylang.json");
  assert.match(gap.reason, /K108 spec weakened: `assume`/);
});

test("weakening: --accept-weakening needs --changed", (t) => {
  const dir = repo(t);
  const out = keylang(dir, ["check", "--accept-weakening"]);
  assert.equal(out.status, 2);
  assert.match(out.stderr, /--accept-weakening requires --changed/);
});

test("weakening: `frameworks` turned off is K108; turned on or unchanged is not", () => {
  const ruled = { reached: (): string => "deny a b" };
  const off = configWeakenings({ base: '{ "layers": {} }\n', now: '{ "layers": {}, "frameworks": [] }\n', ...ruled });
  assert.equal(off.length, 1);
  assert.match(off[0]!.message, /`frameworks` \(detected\) → \[\]/);
  const fewer = configWeakenings({ base: '{ "frameworks": ["magento", "symfony"] }\n', now: '{ "frameworks": ["magento"] }\n', ...ruled });
  assert.match(fewer[0]!.message, /`frameworks` \["magento","symfony"\] → \["magento"\]/);
  assert.deepEqual(configWeakenings({ base: '{ "frameworks": [] }\n', now: '{ "frameworks": ["magento"] }\n', ...ruled }), []);
  assert.deepEqual(configWeakenings({ base: '{ "frameworks": ["magento"] }\n', now: '{ "frameworks": ["magento"] }\n', ...ruled }), []);
});

