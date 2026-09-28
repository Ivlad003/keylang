// What goes to the model from the TUI (design §7.3): the context pack and
// ghost-text validation, over a real analysis of a copy of `tests/fixtures/repo`.
// The model is a stand-in object; nothing leaves the process.

import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { contextPack } from "../src/agent-context.ts";
import { analyze } from "../src/analyze.ts";
import { explanationRequest } from "../src/explain-llm.ts";
import { summarizeNode } from "../src/explain-node.ts";
import { ghostSuggestions } from "../src/ghost.ts";
import type { LlmClient } from "../src/llm.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function copy(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-context-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(join(root, "tests/fixtures/repo"), dir, { recursive: true });
  return dir;
}

const FLOW = "# flow checkout\n\n- trigger app.checkout.checkout\n  - step domain.order.createOrder\n";
const input = { path: "keylang/flows/checkout.md", text: FLOW, line: 2, added: [], removed: new Set<string>() };

test("context pack: another spec comes from the analysis (an unsaved buffer included), not from the disk; each analysis has its own packs", async (t) => {
  const dir = copy(t);
  const other = join(dir, "keylang/flows/other.md");
  const withOverlay = (invariant: string) => analyze({ root: dir, withoutEvidence: true, overlay: new Map([[other, `# flow other\n\n- trigger app.checkout.checkout\n  - invariant ${invariant}\n`]]) });
  const first = contextPack(await withOverlay("paid once"), input);
  assert.match(first.items.find((i) => i.key === "flow:keylang/flows/other.md:flow other")?.text ?? "", /- invariant paid once/);
  const second = contextPack(await withOverlay("paid twice"), input);
  assert.match(second.items.find((i) => i.key === "flow:keylang/flows/other.md:flow other")?.text ?? "", /- invariant paid twice/, "a changed spec elsewhere is a new pack");
  assert.notEqual(first.key, second.key);
  const saved = contextPack(await analyze({ root: dir, withoutEvidence: true }), input);
  assert.equal(saved.items.some((i) => i.label === "flow other"), false, "without the buffer there is no such flow");
});

test("context pack: code that changed on disk after the snapshot is left out and its node marked incomplete", async (t) => {
  const dir = copy(t);
  const analysis = await analyze({ root: dir, withoutEvidence: true });
  const file = join(dir, "src/app/checkout.ts");
  writeFileSync(file, readFileSync(file, "utf8").replace("db.save(order);", "db.save(order); // edited"));
  const pack = contextPack(analysis, input);
  assert.equal(pack.items.some((i) => i.key === "code:app.checkout.checkout"), false);
  assert.equal(pack.items.find((i) => i.key === "node:app.checkout.checkout")?.incomplete, true);
  // Code that still matches is sent.
  assert.equal(contextPack(analysis, { ...input, line: 3 }).items.some((i) => i.key === "code:domain.order.createOrder"), true);
});

test("explain request: the code comes from the bytes the snapshot read; a file changed since is left out and the prompt says so", async (t) => {
  const dir = copy(t);
  const analysis = await analyze({ root: dir, withoutEvidence: true });
  const result = summarizeNode(analysis, "app.checkout.checkout");
  assert.ok("summary" in result);
  const options = { lang: "en", detail: "short", briefs: new Map() } as const;
  assert.match(explanationRequest(analysis, result.summary, options).prompt, /export function checkout/);
  const file = join(dir, "src/app/checkout.ts");
  writeFileSync(file, readFileSync(file, "utf8").replace("db.save(order);", "db.save(order); // edited"));
  const prompt = explanationRequest(analysis, result.summary, options).prompt;
  assert.doesNotMatch(prompt, /\/\/ edited/);
  assert.doesNotMatch(prompt, /export function checkout/);
  assert.match(prompt, /Code: not shown — src\/app\/checkout\.ts changed after the analysis read it\./);
});

test("ghost: a suggestion is checked where it would stand — a step under an `invariant` is dropped, the same step as a sibling is kept", async (t) => {
  const dir = copy(t);
  const analysis = await analyze({ root: dir, withoutEvidence: true });
  const model: LlmClient = { agent: "test:model", model: "model", complete: () => Promise.resolve("- step domain.order.total\n- test tests/total.test.ts \"sums\"") };
  const text = "# flow checkout\n\n- trigger app.checkout.checkout\n  - invariant the order has a total\n    - \n";
  const under = await ghostSuggestions(analysis, model, input.path, text, 4, null);
  assert.deepEqual(under, ['    - test tests/total.test.ts "sums"'], "an invariant takes a test, not a step");
  const sibling = await ghostSuggestions(analysis, model, input.path, text.replace("    - \n", "  - \n"), 4, null);
  assert.deepEqual(sibling, ["  - step domain.order.total", '  - test tests/total.test.ts "sums"']);
});
