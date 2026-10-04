// Gaps of authoring a feature (.scratch/c4-zoom/issues/05): an edge a rule
// would deny once the planned code exists, a planned id outside the layers,
// and a planned fn without a signature, before any code is written. Through
// the real CLI.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");

const LAYERS = { languages: ["typescript"], module: "file", layers: { app: ["src/app/**"], domain: ["src/domain/**"] } };
const SHOP = "export function buy(id: string): void {\n  pay(id);\n}\nexport function pay(id: string): void {}\n";
const ORDER = "export function price(): number {\n  return 2;\n}\n";
const REFUND = "# flow refund\n\n- planned fn domain.order.refund (id: string) → void\n- trigger app.shop.buy\n  - step domain.order.refund\n";

function keylang(cwd: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function repo(t: TestContext, files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-authoring-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  write(dir, { "keylang.json": `${JSON.stringify(LAYERS)}\n`, "src/app/shop.ts": SHOP, "src/domain/order.ts": ORDER, ...files });
  return dir;
}

function write(dir: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, dirname(path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
}

type Item = { kind: string; id: string; line: number; col: number; reason: string; stage: string };

function report(dir: string, slug: string): { status: number | null; done: boolean; stage: string; gaps: Item[]; hints: Item[] } {
  const r = keylang(dir, ["feature", slug, "--format", "json"]);
  return { status: r.status, ...(JSON.parse(r.stdout) as { done: boolean; stage: string; gaps: Item[]; hints: Item[] }) };
}

test("feature: a planned edge the baseline denies is a deny gap that says which allow lifts it; a manual allow does", (t) => {
  const dir = repo(t, { "keylang/features/refund.md": REFUND });
  assert.equal(keylang(dir, ["baseline"]).status, 0);
  const denied = report(dir, "refund");
  assert.equal(denied.stage, "structure");
  const deny = denied.gaps.filter((gap) => gap.kind === "deny");
  assert.deepEqual(deny.map((gap) => [gap.id, gap.line, gap.col, gap.stage]), [["domain.order.refund", 5, 3, "structure"]]);
  assert.match(deny[0]!.reason, /^once implemented, `app\.shop\.buy` → `domain\.order\.refund` breaks `deny app domain external unassigned` \(keylang\/rules\.baseline\.md:\d+\): a person adds `- allow app domain` to keylang\/rules\.md \(an agent proposes it through apply_diff\)$/);
  // A manual rule over the same areas wins over the baseline (ADR 0013): no deny left to predict.
  write(dir, { "keylang/rules.md": "# rules\n\n- allow app domain\n" });
  assert.equal(report(dir, "refund").gaps.some((gap) => gap.kind === "deny"), false);
  // A person's own deny is no baseline to lift: the gap says the plan needs another path.
  write(dir, { "keylang/rules.md": "# rules\n\n- deny app domain\n" });
  const manual = report(dir, "refund").gaps.find((gap) => gap.kind === "deny");
  assert.match(manual?.reason ?? "", /breaks `deny app domain` \(keylang\/rules\.md:3\): the rule is a person's: the plan needs another path, or a person changes the rule$/);
});

test("feature: once both ends are code, the edge is judged by check, not predicted", (t) => {
  const dir = repo(t, { "keylang/features/refund.md": REFUND });
  assert.equal(keylang(dir, ["baseline"]).status, 0);
  write(dir, {
    "src/domain/order.ts": `${ORDER}export function refund(id: string): void {}\n`,
    "src/app/shop.ts": 'import { refund } from "../domain/order.ts";\nexport function buy(id: string): void {\n  pay(id);\n  refund(id);\n}\nexport function pay(id: string): void {}\n',
  });
  const implemented = report(dir, "refund");
  assert.equal(implemented.gaps.some((gap) => gap.kind === "deny"), false, JSON.stringify(implemented.gaps));
  assert.ok(implemented.gaps.some((gap) => gap.kind === "rule"), JSON.stringify(implemented.gaps));
  assert.match(keylang(dir, ["check"]).stdout, /K102/);
});

test("feature: a planned id outside the layers and a planned fn without a signature are structure hints that never block done", (t) => {
  const dir = repo(t, {
    "keylang/features/later.md": "# flow later\n\n- planned module nolayer.thing\n- planned module external.stripe\n- planned fn app.shop.later\n- trigger app.shop.buy\n  - step app.shop.pay\n",
  });
  const later = report(dir, "later");
  assert.equal(later.stage, "structure");
  assert.deepEqual(
    later.hints.map((hint) => [hint.kind, hint.id, hint.line, hint.stage]),
    [
      ["layer", "nolayer.thing", 3, "structure"],
      ["signature", "app.shop.later", 5, "structure"],
    ],
  );
  assert.match(later.hints[0]!.reason, /^`nolayer` is no layer of keylang\.json, so code can never implement `nolayer\.thing`: start the id with a layer \(app, domain\) or `external`$/);
  const human = keylang(dir, ["feature", "later"]);
  assert.match(human.stdout, /^hint: keylang\/features\/later\.md:5:1: signature app\.shop\.later: planned fn `app\.shop\.later` has no signature/m);

  // A planned fn without a signature, once implemented, keeps its hint and is done all the same.
  const done = repo(t, { "keylang/features/later.md": "# flow later\n\n- planned fn app.shop.later\n- trigger app.shop.buy\n  - step app.shop.later\n" });
  write(done, { "src/app/shop.ts": "export function buy(id: string): void {\n  later();\n}\nexport function later(): void {}\n" });
  const finished = report(done, "later");
  assert.deepEqual([finished.status, finished.done, finished.stage], [0, true, "done"]);
  assert.deepEqual(finished.hints.map((hint) => hint.kind), ["signature"]);
});
