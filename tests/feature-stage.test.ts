// The stage of a feature and an honest `done` (.scratch/c4-zoom/issues/03):
// `keylang feature` and MCP `feature_status` say how far a feature file got,
// from an idea to a spec an agent can implement; a file with nothing to
// check, or with lines keylang cannot read, is not done. Through the real CLI.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");

const LAYERS = { languages: ["typescript"], module: "file", layers: { app: ["src/app/**"], domain: ["src/domain/**"] } };
const SHOP = "export function buy(id: string): void {\n  pay(id);\n}\nexport function pay(id: string): void {}\n";

function keylang(cwd: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function repo(t: TestContext, features: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-feature-stage-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const files: Record<string, string> = { "keylang.json": `${JSON.stringify(LAYERS)}\n`, "src/app/shop.ts": SHOP, "src/domain/order.ts": "export type Order = { id: string };\n" };
  for (const [slug, text] of Object.entries(features)) files[`keylang/features/${slug}.md`] = text;
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, dirname(path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

type Item = { kind: string; id: string; line: number; col: number; reason: string; stage: string };
type Report = { done: boolean; stage: string; gaps: Item[]; hints: Item[] };

function report(dir: string, slug: string): { status: number | null; body: Report } {
  const r = keylang(dir, ["feature", slug, "--format", "json"]);
  return { status: r.status, body: JSON.parse(r.stdout) as Report };
}

test("feature: a file with only prose is an idea, not done", (t) => {
  const dir = repo(t, { refund: "## Refund\n\nRefund an order the shop has charged.\n" });
  const human = keylang(dir, ["feature", "refund"]);
  assert.equal(human.status, 1, human.stdout + human.stderr);
  assert.equal(human.stdout, "keylang/features/refund.md:1:1: empty refund: the feature declares nothing to check yet: add a `# flow` with a `trigger`, its steps, and `planned` for what is new\n");
  assert.equal(human.stderr, "1 gap(s) · stage idea\n");
  const { body } = report(dir, "refund");
  assert.deepEqual([body.done, body.stage, body.hints], [false, "idea", []]);
  assert.deepEqual(body.gaps.map((gap) => [gap.kind, gap.stage]), [["empty", "idea"]]);
});

test("feature: a line keylang cannot read is a diagnostic gap at its position, and a dangling step is reported once", (t) => {
  const dir = repo(t, {
    unread: "# flow unread\n\n- trigger app.shop.buy\n  - foo bar\n  - step app.shop.pay\n",
    dangling: "# flow dangling\n\n- trigger app.shop.buy\n  - step app.shop.nothere\n",
  });
  const unread = report(dir, "unread");
  assert.equal(unread.status, 1);
  assert.deepEqual(
    unread.body.gaps.map((gap) => [gap.kind, gap.id, gap.line, gap.col, gap.stage]),
    [["diagnostic", "K004", 4, 5, "structure"]],
  );
  assert.match(unread.body.gaps[0]!.reason, /unknown keyword `foo` here/);
  assert.equal(unread.body.stage, "structure");
  // `check` and `feature` agree: the file has an error, so it is not done.
  assert.equal(keylang(dir, ["check", "keylang/features/unread.md"]).status, 1);

  const dangling = report(dir, "dangling");
  assert.deepEqual(
    dangling.body.gaps.map((gap) => [gap.kind, gap.id, gap.line]),
    [["diagnostic", "K001", 4]],
  );
  assert.match(dangling.body.gaps[0]!.reason, /dangling reference `app\.shop\.nothere`/);
});

test("feature: a flow without a trigger or steps is behavior with hints; implementing it is done all the same", (t) => {
  const dir = repo(t, { payments: "# flow payments\n\n- planned module app.payments\n" });
  const human = keylang(dir, ["feature", "payments"]);
  assert.equal(human.status, 1);
  assert.equal(
    human.stdout,
    [
      "keylang/features/payments.md:3:1: planned app.payments: planned `app.payments` is not implemented",
      "hint: keylang/features/payments.md:1:8: trigger payments: flow `payments` has no trigger: name its entry point with `- trigger <id>`",
      "hint: keylang/features/payments.md:1:8: steps payments: flow `payments` has no steps yet: add `- step`, `- calls`, `- when` or `- invariant`",
      "",
    ].join("\n"),
  );
  assert.equal(human.stderr, "1 gap(s) · stage behavior\n");
  const { body } = report(dir, "payments");
  assert.deepEqual(body.hints.map((hint) => [hint.kind, hint.id, hint.stage]), [["trigger", "payments", "behavior"], ["steps", "payments", "behavior"]]);
  assert.deepEqual(body.gaps.map((gap) => [gap.kind, gap.stage]), [["planned", "ready"]]);
  // Hints do not block: once the module exists, the feature is done and says so.
  writeFileSync(join(dir, "src/app/payments.ts"), "export function charge(): void {}\n");
  const done = keylang(dir, ["feature", "payments"]);
  assert.equal(done.status, 0, done.stdout + done.stderr);
  assert.equal(done.stderr, "done\n");
  assert.equal(report(dir, "payments").body.stage, "done");
});

test("feature: only the implementation missing is ready; nothing missing is done; JSON keeps its shape", (t) => {
  const dir = repo(t, {
    refund: "# flow refund\n\n- planned fn app.shop.refund (id: string) → void\n- trigger app.shop.buy\n  - step app.shop.refund\n",
    buy: "# flow buy\n\n- trigger app.shop.buy\n  - step app.shop.pay\n",
  });
  const ready = report(dir, "refund");
  assert.equal(ready.status, 1);
  assert.deepEqual([ready.body.done, ready.body.stage, ready.body.hints], [false, "ready", []]);
  assert.deepEqual(ready.body.gaps.map((gap) => [gap.kind, gap.id, gap.stage]), [["planned", "app.shop.refund", "ready"], ["static", "app.shop.refund", "ready"]]);
  assert.equal(keylang(dir, ["feature", "refund"]).stderr, "2 gap(s) · stage ready\n");

  const done = keylang(dir, ["feature", "buy", "--format", "json"]);
  assert.equal(done.status, 0, done.stdout + done.stderr);
  const body = JSON.parse(done.stdout) as Record<string, unknown>;
  assert.deepEqual(Object.keys(body), ["done", "stage", "gaps", "hints", "info"]);
  assert.deepEqual([body.done, body.stage, body.gaps, body.hints], [true, "done", [], []]);
  // Nothing is written: the feature command only reads.
  assert.equal(readFileSync(join(dir, "keylang/features/buy.md"), "utf8"), "# flow buy\n\n- trigger app.shop.buy\n  - step app.shop.pay\n");
});

test("mcp: feature_status returns the same stage, gaps and hints as the CLI", async (t) => {
  const dir = repo(t, { payments: "# flow payments\n\n- planned module app.payments\n" });
  const client = new Client({ name: "keylang-test", version: "0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [bin, "mcp"], cwd: dir, stderr: "pipe" }));
  t.after(() => client.close());
  const result = (await client.callTool({ name: "feature_status", arguments: { slug: "payments" } })) as { content: { text: string }[] };
  const mcp = JSON.parse(result.content.map((c) => c.text).join("")) as Report;
  const cli = report(dir, "payments").body;
  assert.deepEqual([mcp.stage, mcp.gaps, mcp.hints], [cli.stage, cli.gaps, cli.hints]);
  assert.equal(mcp.stage, "behavior");
});
