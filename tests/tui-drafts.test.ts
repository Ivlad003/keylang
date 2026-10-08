// TUI drafts, each against the CLI: a flow, the rules and the layer layout
// (algo, hybrid and with a model, with Cancel), code → spec from a file, a
// line or the git changes, and spec → code from the template or a model,
// merged as proposals or applied as a whole candidate.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { runOperation, type OperationContext, type OperationRequest, type OperationResult } from "../src/operations.ts";
import { MERGE_REASON } from "../src/tui/actions.ts";
import { App } from "../src/tui/app.ts";
import { checkoutRepo, CHECKOUT_FILES, CHECKOUT_FLOW, click, KEY, locate } from "./tui-fixture.ts";
import { answerAll, BIN, BUY_ANSWER, committedCheckout, draftField, draftForm, draftRow, esc, featureForm, FEATURES, FLOW_PATH, gitRun, heldModel, PAID, promptNote, propose, REFUND, repoWith, session, sleep, submitSlug, treeBytes, withConfig, workTree } from "./tui-helpers.ts";

// ---------- algorithmic flow draft (ticket 22) ----------

/** A spec with prose and another flow: a draft into it keeps both. */
const BUYING_SPEC = "# Buying\n\nHow an order is bought.\n\n# flow other\n\n- trigger presentation.terminal.checkout\n";

type DraftResult = Extract<OperationResult, { kind: "draft-flow" }> & { payload: NonNullable<Extract<OperationResult, { kind: "draft-flow" }>["payload"]> };

function draftRecord(app: App): DraftResult {
  const result = app.state.records.at(-1)?.result;
  assert.ok(result?.kind === "draft-flow" && result.payload !== null, JSON.stringify(result?.messages));
  return result as DraftResult;
}

function cliDraft(root: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  return spawnSync(process.execPath, [BIN, "draft", "flow", ...args], { cwd: root, encoding: "utf8" });
}

test("tui: Enter in F6 while a MERGE is open is refused as the palette refuses: the open merge keeps its decisions, no second MERGE or write starts, and Ctrl+O never comes back to a MERGE", async (t) => {
  const root = checkoutRepo(t, { "keylang/flows/z.md": "# flow z\n\nZ.\n" });
  const s = session(root);
  t.after(() => s.app.close());
  // A function, not the field: TypeScript would narrow `merge` to null after the first `assert.equal(…, null)`.
  const merge = () => s.app.state.merge;
  await s.app.idle();
  // Two records in F6 whose Enter writes or opens a MERGE: a map write, and a draft flow proposed for b.md.
  s.send(KEY.ctrlP);
  for (const ch of "map write") s.send(ch);
  s.send(KEY.enter);
  s.send(KEY.enter);
  await s.app.idle();
  assert.equal(s.app.state.records.at(-1)?.result?.kind, "map");
  draftForm(s, { trigger: "application.purchase.buy", into: "keylang/flows/z.md" });
  await s.app.idle();
  assert.equal(merge()?.path, "keylang/flows/z.md", s.app.state.message ?? "");
  await esc(s.send);
  assert.equal(merge(), null, "Esc cancels the merge; its proposal stays");
  // MERGE of the other target with its first hunk accepted.
  propose(root, FLOW_PATH, PAID);
  s.send(KEY.ctrlO);
  assert.equal(s.app.state.current, FLOW_PATH, "Ctrl+O comes back to the file the draft started from");
  s.send("m");
  assert.equal(merge()?.path, FLOW_PATH, s.app.state.message ?? "");
  s.send("a");
  assert.deepEqual(merge()!.decisions, ["accepted"]);
  const before = treeBytes(root);
  const records = s.app.state.records.length;
  // Enter on the draft record (the newest one is selected): the reason the palette gives, and the open merge is untouched.
  s.send(KEY.f6);
  assert.equal(s.app.state.records[s.app.state.results.index]?.result?.kind, "draft-flow");
  s.send(KEY.enter);
  assert.equal(s.app.state.message, MERGE_REASON);
  assert.deepEqual([s.app.state.mode, merge()?.path, merge()?.decisions], ["merge", FLOW_PATH, ["accepted"]]);
  assert.equal(s.app.state.results.open, true, "the panel stays, as for a finding");
  // Enter on the map record: no save step opens, nothing runs.
  s.send(KEY.up);
  assert.equal(s.app.state.records[s.app.state.results.index]?.result?.kind, "map");
  s.send(KEY.enter);
  assert.equal(s.app.state.message, MERGE_REASON);
  assert.equal(s.app.state.barrier, null);
  assert.equal(s.app.state.activeOperation, null);
  assert.equal(s.app.state.records.length, records);
  await esc(s.send);
  assert.equal(s.app.state.results.open, false);
  assert.deepEqual([s.app.state.mode, merge()?.path, merge()?.decisions], ["merge", FLOW_PATH, ["accepted"]]);
  await s.app.idle();
  assert.deepEqual(treeBytes(root), before, "nothing written");
  // Esc cancels the merge; Ctrl+O comes back to a place in the editor, never to a MERGE without a merge.
  await esc(s.send);
  assert.deepEqual([s.app.state.mode, merge()], ["view", null]);
  s.send(KEY.ctrlO);
  assert.deepEqual([s.app.state.mode, merge()], ["view", null]);
  s.send("i");
  assert.equal(s.app.state.mode, "edit", "the keys reach the editor");
});

test("tui: draft flow (algo) of a callable with two calls: the preview is the CLI's --print and writes nothing; the proposal is the CLI's full target with another flow kept; the target stays until w", async (t) => {
  const specs = { "keylang/flows/buying.md": BUYING_SPEC };
  const root = checkoutRepo(t, specs);
  const twin = checkoutRepo(t, specs);
  const s = session(root, { cols: 200 });
  t.after(() => s.app.close());
  await s.app.idle();
  const before = treeBytes(root);
  // The form: the trigger of the flow under the cursor is the default; a typed part lists the callable ids; the defaults and the root are visible.
  s.send(KEY.ctrlP);
  for (const ch of "draft flow") s.send(ch);
  s.send(KEY.enter);
  const prompt = s.app.state.prompt!;
  assert.equal(prompt.kind, "draft-flow");
  assert.equal(s.app.state.current, "keylang/flows/buying.md");
  assert.equal(prompt.draft?.trigger, "", "no flow with a trigger under the cursor: no default");
  assert.match(prompt.items.join("\n"), /target: {4}\(default keylang\/flows\/<name>\.md\)/);
  assert.deepEqual(prompt.details, [`root: ${root} · the target is relative to it · algo: only the calls the snapshot resolved`]);
  draftField(s, "trigger", "purchase.b");
  assert.deepEqual(prompt.ids?.filter((id) => id.startsWith("fn:")), ["fn:application.purchase.buy"]);
  assert.match(promptNote(s.app), /`purchase\.b` is not a fn of the current snapshot/);
  s.send(KEY.down);
  assert.equal(promptNote(s.app), "Enter takes application.purchase.buy as the trigger");
  s.send(KEY.enter);
  assert.equal(prompt.draft?.trigger, "application.purchase.buy");
  assert.equal(prompt.ids?.[prompt.index], "name");
  assert.deepEqual(prompt.items.slice(1, 3), ["name:    ▏  (default buy)", "target:    (default keylang/flows/buy.md)"]);
  assert.equal(promptNote(s.app), "keylang/flows/buy.md is a new file");
  assert.match(s.text(), /draft flow · algo/);
  await esc(s.send);
  assert.deepEqual(treeBytes(root), before, "Esc writes nothing");
  // Preview: the CLI's --print, byte for byte; the candidate keeps the other sections; nothing is written, stats included.
  draftForm(s, { trigger: "application.purchase.buy", into: "keylang/flows/buying.md", output: "preview" });
  assert.equal(s.app.state.barrier, null);
  await s.app.idle();
  const preview = draftRecord(s.app);
  assert.deepEqual([preview.status, preview.exitCode, preview.written, preview.proposals], ["completed", 0, [], []]);
  const printed = cliDraft(twin, ["application.purchase.buy", "--mode", "algo", "--into", "keylang/flows/buying.md", "--print"]);
  assert.deepEqual([printed.status, printed.stderr], [0, ""]);
  const { candidate } = preview.payload;
  assert.equal(candidate.flow, printed.stdout);
  assert.deepEqual(candidate.steps, ["application.purchase.buy", "domain.order.create", "infrastructure.store.save"]);
  assert.deepEqual([candidate.target, candidate.before, candidate.pending, candidate.problem], ["keylang/flows/buying.md", BUYING_SPEC, null, null]);
  assert.ok(candidate.text!.startsWith(BUYING_SPEC), "the prose and the other flow are kept");
  assert.ok(candidate.text!.endsWith(printed.stdout));
  assert.deepEqual(treeBytes(root), before, "a preview writes no proposal, no stats, not the target");
  s.send(KEY.f6);
  let text = s.text();
  assert.match(text, /Draft flow · algo · application\.purchase\.buy → keylang\/flows\/buying\.md · preview, nothing written/);
  assert.match(text, /3 step\(s\), preview, nothing written · code 0/);
  assert.match(text, /── keylang draft flow application\.purchase\.buy --print · stdout ──/);
  assert.match(text, /── keylang\/flows\/buying\.md as proposed ──/);
  await esc(s.send);
  // Proposal: the full proposed text as the CLI writes it in a twin; the target is unchanged; MERGE opens since nothing moved.
  draftForm(s, { trigger: "application.purchase.buy", into: "keylang/flows/buying.md" });
  await s.app.idle();
  const proposed = draftRecord(s.app);
  const store = ".keylang/proposals/keylang/flows/buying.md";
  assert.deepEqual([proposed.status, proposed.exitCode, proposed.written, proposed.proposals, proposed.payload.proposal], ["completed", 0, [], [store], store]);
  const cli = cliDraft(twin, ["application.purchase.buy", "--mode", "algo", "--into", "keylang/flows/buying.md"]);
  assert.deepEqual([cli.status, cli.stdout, cli.stderr], [0, `${store}: proposed flow \`buy\` for keylang/flows/buying.md (3 step(s)); merge it with \`m\` in \`keylang\`\n`, ""]);
  assert.equal(readFileSync(join(root, store), "utf8"), readFileSync(join(twin, store), "utf8"), "the CLI's proposal, byte for byte");
  assert.equal(readFileSync(join(root, store), "utf8"), candidate.text);
  assert.equal(readFileSync(join(root, "keylang/flows/buying.md"), "utf8"), BUYING_SPEC);
  const after = treeBytes(root);
  assert.deepEqual([...after.keys()].filter((path) => !before.has(path)), [store], "only the proposal, no stats");
  assert.equal(s.app.state.mode, "merge", s.app.state.message ?? "");
  assert.equal(s.app.state.merge?.path, "keylang/flows/buying.md");
  assert.equal(s.app.state.current, "keylang/flows/buying.md");
  // Esc leaves the proposal; F6 Enter on the record opens the same MERGE again; w writes the accepted hunks.
  await esc(s.send);
  assert.equal(readFileSync(join(root, "keylang/flows/buying.md"), "utf8"), BUYING_SPEC, "before w the target is byte for byte the same");
  s.send(KEY.f6);
  text = s.text();
  assert.match(text, /3 step\(s\) proposed for keylang\/flows\/buying\.md · code 0/);
  assert.match(text, /Enter open MERGE/);
  s.send(KEY.enter);
  assert.equal(s.app.state.merge?.path, "keylang/flows/buying.md");
  for (let i = 0; i < s.app.state.merge!.hunks.length; i++) s.send("a");
  s.send("w");
  await s.app.idle();
  assert.equal(readFileSync(join(root, "keylang/flows/buying.md"), "utf8"), candidate.text);
  assert.ok(!existsSync(join(root, store)), "every hunk decided: the proposal is gone");
});

test("tui: draft flow refuses an unknown trigger, a waiting or just-created proposal and an unsaved target before it runs; a proposal or target changed during the work is kept; the CLI still replaces its own", async (t) => {
  const root = checkoutRepo(t);
  const hook: { during: (() => void) | null } = { during: null };
  // The operation on this thread, with a hook between the computation and the commit: what another tool does meanwhile.
  const operations = (request: OperationRequest, context: OperationContext): Promise<OperationResult> =>
    runOperation(request, {
      ...context,
      beforeCommit: async () => {
        hook.during?.();
        await context.beforeCommit?.();
      },
    });
  const s = session(root, { cols: 200, operations });
  t.after(() => s.app.close());
  await s.app.idle();
  const before = treeBytes(root);
  // The trigger of the flow under the cursor is the default.
  s.send(KEY.ctrlP);
  for (const ch of "draft flow") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.prompt?.draft?.trigger, "presentation.terminal.checkout");
  assert.equal(promptNote(s.app), "presentation.terminal.checkout: a fn of the current snapshot");
  await esc(s.send);
  // An unknown trigger: the field keeps its text, the suggestion is named, nothing runs.
  draftForm(s, { trigger: "application.purchase.buyy" });
  assert.equal(s.app.state.prompt?.kind, "draft-flow");
  assert.equal(s.app.state.prompt?.draft?.trigger, "application.purchase.buyy");
  assert.equal(s.app.state.prompt?.ids?.[s.app.state.prompt.index], "trigger");
  assert.match(s.app.state.message ?? "", /^draft flow: `application\.purchase\.buyy` is not a fn of the current snapshot \(did you mean `application\.purchase\.buy`\?\)$/);
  assert.equal(s.app.state.records.length, 0);
  await esc(s.send);
  // A proposal already waiting for the target: refused before the run; its bytes stay.
  const store = join(root, ".keylang/proposals/keylang/flows/buy.md");
  mkdirSync(dirname(store), { recursive: true });
  writeFileSync(store, "# flow buy\n\nsomeone's proposal\n");
  draftForm(s, { trigger: "application.purchase.buy" });
  assert.equal(s.app.state.prompt?.kind, "draft-flow");
  assert.equal(s.app.state.message, "draft flow: a proposal for keylang/flows/buy.md is waiting: merge it first (m, or Proposals)");
  assert.equal(s.app.state.records.length, 0);
  await esc(s.send);
  assert.equal(readFileSync(store, "utf8"), "# flow buy\n\nsomeone's proposal\n");
  // The CLI's policy is unchanged: its draft replaces the proposal it finds at the start.
  const cli = cliDraft(root, ["application.purchase.buy", "--mode", "algo"]);
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(readFileSync(store, "utf8"), cliDraft(root, ["application.purchase.buy", "--mode", "algo", "--print"]).stdout);
  rmSync(join(root, ".keylang"), { recursive: true, force: true });
  assert.deepEqual(treeBytes(root), before);
  // An unsaved target: refused, the buffer keeps its text.
  const flow = "keylang/flows/checkout.md";
  s.send("i");
  for (const ch of "Draft me. ") s.send(ch);
  await esc(s.send);
  const typed = s.app.state.buffers.get(flow)!.text;
  draftForm(s, { trigger: "presentation.terminal.checkout", into: flow });
  assert.equal(s.app.state.message, `draft flow: ${flow} has unsaved changes: save (Ctrl+S) or undo them before a draft into it`);
  assert.equal(s.app.state.records.length, 0);
  await esc(s.send);
  assert.equal(s.app.state.buffers.get(flow)!.text, typed);
  s.send("\x1a"); // Ctrl+Z
  // A proposal that appears during the work is never overwritten: failed 1, nothing written.
  const other = ".keylang/proposals/keylang/flows/buy.md";
  hook.during = () => {
    mkdirSync(dirname(join(root, other)), { recursive: true });
    writeFileSync(join(root, other), "agent's proposal\n");
  };
  draftForm(s, { trigger: "application.purchase.buy" });
  await s.app.idle();
  const raced = s.app.state.records.at(-1)!.result!;
  assert.deepEqual([raced.kind, raced.status, raced.exitCode, raced.proposals], ["draft-flow", "failed", 1, []]);
  assert.match(raced.messages[0]!.text, /^\.keylang\/proposals\/keylang\/flows\/buy\.md: created on disk while the proposal was prepared; nothing written$/);
  assert.equal(readFileSync(join(root, other), "utf8"), "agent's proposal\n");
  rmSync(join(root, ".keylang"), { recursive: true, force: true });
  // A target changed during the work: failed 1, the new text stays, no proposal.
  hook.during = () => writeFileSync(join(root, "keylang/flows/buy.md"), "# flow buy\n\nwritten meanwhile\n");
  draftForm(s, { trigger: "application.purchase.buy" });
  await s.app.idle();
  const changed = s.app.state.records.at(-1)!.result!;
  assert.deepEqual([changed.status, changed.exitCode], ["failed", 1]);
  assert.equal(changed.messages[0]!.text, "keylang/flows/buy.md: created on disk while the proposal was prepared; nothing written");
  assert.equal(readFileSync(join(root, "keylang/flows/buy.md"), "utf8"), "# flow buy\n\nwritten meanwhile\n");
  assert.ok(!existsSync(join(root, ".keylang/proposals")));
  // A proposal made while the person moved on (F6 opened meanwhile) waits: no MERGE by itself; a second draft into it is refused.
  hook.during = () => s.send(KEY.f6);
  draftForm(s, { trigger: "application.purchase.buy" });
  await s.app.idle();
  const made = draftRecord(s.app);
  assert.deepEqual([made.status, made.exitCode], ["completed", 0]);
  assert.equal(s.app.state.merge, null);
  assert.equal(s.app.state.message, "draft flow: .keylang/proposals/keylang/flows/buy.md waits: m, Proposals or Enter in F6 opens MERGE");
  const proposal = readFileSync(join(root, other), "utf8");
  hook.during = null;
  await esc(s.send);
  draftForm(s, { trigger: "application.purchase.buy" });
  assert.equal(s.app.state.message, "draft flow: a proposal for keylang/flows/buy.md is waiting: merge it first (m, or Proposals)");
  await esc(s.send);
  assert.equal(readFileSync(join(root, other), "utf8"), proposal);
  assert.equal(readFileSync(join(root, "keylang/flows/buy.md"), "utf8"), "# flow buy\n\nwritten meanwhile\n");
});

// ---------- model flow draft and cancellation (ticket 23) ----------

const F4 = "\x1bOS";

/** The draft counts in `.keylang/stats.json`; empty when there is none. */
function draftCounts(root: string): Record<string, { proposed: number }> {
  const file = join(root, ".keylang/stats.json");
  return existsSync(file) ? ((JSON.parse(readFileSync(file, "utf8")) as { drafts?: Record<string, { proposed: number }> }).drafts ?? {}) : {};
}

test("tui: a hybrid draft from the form sends the F4 pack as it was, asks no ghost line while it runs, and a late answer lands as the first target's proposal without taking the focus", async (t) => {
  const root = checkoutRepo(t, { "keylang/flows/refund.md": REFUND });
  withConfig(root, { agent: "anthropic:claude-opus-5", ghost: { delay: 0 } });
  const model = await heldModel(t, BUY_ANSWER);
  const s = session(root, { cols: 200 });
  t.after(() => s.app.close());
  await s.app.idle();
  // F4: the buffer is left out of the pack; the node under the cursor stays.
  for (let i = 0; i < 6; i++) s.send(KEY.down);
  s.send(F4);
  s.send("x");
  assert.match(s.app.state.message ?? "", /context: keylang\/flows\/checkout\.md left out/);
  s.send(F4);
  draftForm(s, { trigger: "application.purchase.buy", into: "keylang/flows/buying.md" });
  const record = s.app.state.records.at(-1)!;
  assert.equal(record.params.kind === "draft-flow" ? record.params.mode : null, "hybrid", "with a model the form's default is the CLI's hybrid");
  await model.requested(1);
  assert.match(model.prompts[0]!, /Context chosen by the developer:\n\[node\] domain\.order\.create/);
  assert.doesNotMatch(model.prompts[0]!, /\[buffer\]/, "the item left out in F4 is not sent");
  assert.equal(record.status, "running");
  // The session answers meanwhile: a new flow item asks no ghost line while the operation runs.
  s.app.state.cursor = { line: 0, col: 0 };
  s.send("i");
  for (let i = 0; i < 7; i++) s.send(KEY.down);
  s.send(KEY.end);
  s.send(KEY.enter);
  await sleep(60);
  assert.equal(model.prompts.length, 1, "no ghost request during the draft");
  assert.equal(s.app.state.ghost, null);
  await esc(s.send);
  // Another file is opened before the answer comes.
  s.send("\x1b[12~");
  const other = locate(s.lines(), "keylang/flows/refund");
  s.send(click(other.x + 1, other.y));
  assert.equal(s.app.state.current, "keylang/flows/refund.md");
  model.release();
  await s.app.idle();
  assert.equal(record.status, "completed", JSON.stringify(record.result?.messages));
  const result = draftRecord(s.app);
  assert.equal(result.payload.mode, "hybrid");
  assert.equal(result.payload.model?.agent, "anthropic:claude-opus-5");
  assert.equal(result.payload.summary, "3 agree");
  assert.equal(result.payload.candidate.target, "keylang/flows/buying.md", "the proposal is for the target the draft started with");
  assert.equal(readFileSync(join(root, ".keylang/proposals/keylang/flows/buying.md"), "utf8"), result.payload.candidate.text);
  assert.ok(!existsSync(join(root, "keylang/flows/buying.md")), "the target itself is not written");
  assert.equal(s.app.state.current, "keylang/flows/refund.md", "the focus is not taken");
  assert.notEqual(s.app.state.mode, "merge");
  assert.match(s.app.state.message ?? "", /draft flow: \.keylang\/proposals\/keylang\/flows\/buying\.md waits: m, Proposals or Enter in F6 opens MERGE/);
  assert.equal(readFileSync(join(root, FLOW_PATH), "utf8"), CHECKOUT_FLOW, "the dirty buffer is not saved by the draft");
  assert.equal(draftCounts(root).agree?.proposed, 3, "a model proposal counts its lines");
  // F6 names the mode and the model; the statuses are not evidence.
  s.send(KEY.f6);
  const text = s.text();
  assert.match(text, /Draft flow · hybrid · application\.purchase\.buy → keylang\/flows\/buying\.md/);
  assert.match(text, /drafted by anthropic:claude-opus-5 in 1 round\(s\)/);
  assert.match(text, /the statuses are provenance, not evidence/);
  assert.match(text, /keylang draft flow application\.purchase\.buy --mode hybrid --print · stdout/);
});

test("tui: Cancel while the model answers ends the draft as cancelled: the request is dropped and nothing is written, not even the stats; Ctrl+Space in edit mode stays completion", async (t) => {
  const root = checkoutRepo(t);
  withConfig(root, { agent: "anthropic:claude-opus-5" });
  const model = await heldModel(t, BUY_ANSWER);
  const s = session(root, { cols: 200 });
  t.after(() => s.app.close());
  await s.app.idle();
  const before = treeBytes(root);
  draftForm(s, { trigger: "application.purchase.buy", into: "keylang/flows/buying.md", mode: "llm" });
  await model.requested(1);
  const record = s.app.state.records.at(-1)!;
  assert.equal(record.status, "running");
  s.send(KEY.ctrlP);
  for (const ch of "cancel") s.send(ch);
  s.send(KEY.enter);
  assert.deepEqual([record.status, record.result?.exitCode, record.result?.payload], ["cancelled", null, null]);
  for (let i = 0; i < 100 && model.dropped() === 0; i++) await sleep(10);
  assert.equal(model.dropped(), 1, "the model request is closed, not left running");
  model.release();
  await s.app.idle();
  assert.equal(record.status, "cancelled", "a late answer changes nothing");
  assert.deepEqual(treeBytes(root), before, "no proposal, no stats");
  assert.match(s.app.state.message ?? "", /draft flow application\.purchase\.buy --mode llm: cancelled/);
  // In edit mode Ctrl+Space completes IDs; it asks no model and starts no draft.
  const records = s.app.state.records.length;
  s.send("i");
  s.send(KEY.ctrlSpace);
  await sleep(30);
  assert.equal(s.app.state.records.length, records);
  assert.equal(model.prompts.length, 1);
  await esc(s.send);
});

test("tui: a model draft whose target, waiting proposal or buffer changed while the model answered writes nothing and counts nothing", async (t) => {
  const root = checkoutRepo(t);
  withConfig(root, { agent: "anthropic:claude-opus-5" });
  const model = await heldModel(t, BUY_ANSWER);
  const s = session(root, { cols: 200 });
  t.after(() => s.app.close());
  await s.app.idle();
  const target = join(root, "keylang/flows/buying.md");
  const store = join(root, ".keylang/proposals/keylang/flows/buying.md");
  // The target appears on disk meanwhile: kept, no proposal.
  draftForm(s, { trigger: "application.purchase.buy", into: "keylang/flows/buying.md", mode: "llm" });
  await model.requested(1);
  writeFileSync(target, BUYING_SPEC);
  model.release();
  await s.app.idle();
  let result = draftRecord(s.app);
  assert.deepEqual([result.status, result.exitCode], ["failed", 1]);
  assert.deepEqual(result.payload.refused, ["keylang/flows/buying.md: created on disk while the proposal was prepared; nothing written"]);
  assert.equal(readFileSync(target, "utf8"), BUYING_SPEC);
  assert.ok(!existsSync(store));
  assert.deepEqual(draftCounts(root), {});
  // Someone else's proposal appears meanwhile: it is kept.
  draftForm(s, { trigger: "application.purchase.buy", into: "keylang/flows/buying.md", mode: "llm" });
  await model.requested(2);
  mkdirSync(dirname(store), { recursive: true });
  writeFileSync(store, "# flow foreign\n");
  model.release();
  await s.app.idle();
  result = draftRecord(s.app);
  assert.deepEqual([result.status, result.exitCode], ["failed", 1]);
  assert.match(result.payload.refused.join("\n"), /\.keylang\/proposals\/keylang\/flows\/buying\.md: .*while the proposal was prepared/);
  assert.equal(readFileSync(store, "utf8"), "# flow foreign\n");
  assert.deepEqual(draftCounts(root), {});
  rmSync(join(root, ".keylang/proposals"), { recursive: true });
  // Ctrl+Space, then the flow's own buffer is edited before the answer: the text stays, no proposal.
  s.app.state.cursor = { line: 5, col: 0 };
  s.send(KEY.ctrlSpace);
  await model.requested(3);
  const agentRecord = s.app.state.records.at(-1)!;
  assert.equal(agentRecord.action, "agent-draft");
  s.send("i");
  s.send("x");
  await esc(s.send);
  const typed = s.app.state.buffers.get(FLOW_PATH)!.text;
  model.release();
  await s.app.idle();
  result = draftRecord(s.app);
  assert.deepEqual([result.status, result.exitCode], ["failed", 1]);
  assert.deepEqual(result.payload.refused, [`${FLOW_PATH}: edited in this session while the draft was prepared; save or undo the edits, then draft again`]);
  assert.ok(!existsSync(join(root, ".keylang/proposals", FLOW_PATH)));
  assert.equal(s.app.state.buffers.get(FLOW_PATH)!.text, typed);
  assert.equal(readFileSync(join(root, FLOW_PATH), "utf8"), CHECKOUT_FLOW);
  assert.notEqual(s.app.state.mode, "merge");
  assert.deepEqual(draftCounts(root), {});
});

test("tui: without a model the form drafts hybrid as algo and says so, as the CLI does; llm is refused before it runs", async (t) => {
  const root = checkoutRepo(t);
  const s = session(root, { cols: 200 });
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.ctrlP);
  for (const ch of "draft flow") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.prompt?.draft?.mode, "algo", "no model: the form starts on algo");
  draftField(s, "trigger", "application.purchase.buy");
  draftRow(s, "mode");
  s.send(KEY.right);
  assert.equal(s.app.state.prompt?.draft?.mode, "hybrid");
  assert.match(s.app.state.prompt?.note ?? "", /no model configured .*hybrid drafts from the snapshot only, as algo, and says so/);
  assert.match(s.text(), /draft flow · hybrid/);
  s.send(KEY.right);
  assert.equal(s.app.state.prompt?.draft?.mode, "llm");
  draftRow(s, "run");
  s.send(KEY.enter);
  assert.equal(s.app.state.prompt?.kind, "draft-flow", "the form stays");
  assert.equal(s.app.state.prompt?.ids?.[s.app.state.prompt.index], "mode");
  assert.match(s.app.state.message ?? "", /--mode llm needs a model: set `agent` in keylang\.json/);
  assert.equal(s.app.state.records.length, 0);
  s.send("\x1b[D");
  assert.equal(s.app.state.prompt?.draft?.mode, "hybrid");
  draftRow(s, "output");
  s.send(KEY.right);
  draftRow(s, "run");
  s.send(KEY.enter);
  await s.app.idle();
  const result = draftRecord(s.app);
  assert.deepEqual([result.status, result.exitCode], ["completed", 0]);
  assert.equal(result.payload.mode, "algo");
  assert.equal(result.payload.model, null);
  assert.match(result.payload.fallback ?? "", /^no model configured: set `agent` in keylang\.json.*; drafting from the snapshot only \(--mode algo\)$/);
  const cli = cliDraft(root, ["application.purchase.buy", "--mode", "hybrid", "--print"]);
  assert.equal(result.payload.candidate.flow, cli.stdout);
  assert.equal(cli.stderr, `keylang: ${result.payload.fallback}\n`);
  s.send(KEY.f6);
  assert.match(s.text(), /Draft flow · algo \(hybrid without a model\) · application\.purchase\.buy/);
  assert.match(s.text(), /drafting from the snapshot only \(--mode algo\)/);
});

// ---------- rules draft (ticket 24) ----------

/** A rules spec with prose, a rule the draft also finds, and another section: a draft into it keeps all of them. */
const RULES_SPEC = "# Architecture\n\nWhy the layers are so.\n\n# rules\n\nThe rules we keep.\n\n- layers domain < infrastructure < application < presentation\n\n# flow other\n\n- trigger presentation.terminal.checkout\n";

/** The checkout code with `domain.order` calling back into the terminal: the modules (and the layers) form a cycle. */
const CYCLIC_ORDER = 'import { checkout } from "../presentation/terminal.ts";\nexport function create(): void {\n  checkout();\n}\n';

/** The palette's draft-rules form with the given fields; Enter on the run row. */
function rulesForm(s: ReturnType<typeof session>, fields: { into?: string; mode?: "algo" | "hybrid" | "llm"; output?: "proposal" | "preview" } = {}): void {
  s.send(KEY.ctrlP);
  for (const ch of "draft rules") s.send(ch);
  s.send(KEY.enter);
  const prompt = s.app.state.prompt!;
  assert.equal(prompt.kind, "draft-rules", s.app.state.message ?? "");
  const row = (id: string): void => {
    for (let i = 0; i < 8 && prompt.ids?.[prompt.index] !== id; i++) s.send(KEY.down);
    assert.equal(prompt.ids?.[prompt.index], id, JSON.stringify(prompt.ids));
  };
  if (fields.into !== undefined) {
    row("into");
    for (const ch of fields.into) s.send(ch);
  }
  if (fields.mode !== undefined && fields.mode !== prompt.rulesDraft!.mode) {
    row("mode");
    for (let i = 0; i < 3 && prompt.rulesDraft!.mode !== fields.mode; i++) s.send(KEY.right);
    assert.equal(prompt.rulesDraft!.mode, fields.mode);
  }
  if ((fields.output ?? "proposal") !== prompt.rulesDraft!.output) {
    row("output");
    s.send(KEY.right);
  }
  row("run");
  s.send(KEY.enter);
}

type RulesResult = Extract<OperationResult, { kind: "draft-rules" }> & { payload: NonNullable<Extract<OperationResult, { kind: "draft-rules" }>["payload"]> };

function rulesRecord(app: App): RulesResult {
  const result = app.state.records.at(-1)?.result;
  assert.ok(result?.kind === "draft-rules" && result.payload !== null, JSON.stringify(result?.messages));
  return result as RulesResult;
}

function cliRules(root: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  return spawnSync(process.execPath, [BIN, "draft", "rules", ...args], { cwd: root, encoding: "utf8", env: { ...process.env, ANTHROPIC_API_KEY: "", ANTHROPIC_AUTH_TOKEN: "", OPENROUTER_API_KEY: "", HOME: root } });
}

test("tui: draft rules (algo) on an acyclic and a cyclic repository is the CLI's text; the proposal keeps the prose and other sections; the rules file stays until w", async (t) => {
  const specs = { "keylang/rules.md": RULES_SPEC };
  const root = checkoutRepo(t, specs);
  const twin = checkoutRepo(t, specs);
  const s = session(root, { cols: 200 });
  t.after(() => s.app.close());
  await s.app.idle();
  const before = treeBytes(root);
  // The form: the default target and the root are visible; no model, so algo.
  s.send(KEY.ctrlP);
  for (const ch of "draft rules") s.send(ch);
  s.send(KEY.enter);
  const prompt = s.app.state.prompt!;
  assert.equal(prompt.kind, "draft-rules");
  assert.equal(prompt.rulesDraft?.mode, "algo");
  assert.deepEqual(prompt.ids, ["into", "mode", "output", "run"]);
  assert.equal(prompt.items[0], "target:  ▏  (default keylang/rules.md)");
  assert.match(prompt.details![0]!, new RegExp(`^root: ${root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} · the target is relative to it · algo: the rules the code keeps now`));
  assert.equal(promptNote(s.app), "keylang/rules.md exists: its prose and other sections are kept; the rules join its last # rules section");
  assert.match(s.text(), /draft rules · algo/);
  await esc(s.send);
  assert.deepEqual(treeBytes(root), before, "Esc writes nothing");
  // Preview: the CLI's --print byte for byte; nothing written, stats included.
  rulesForm(s, { output: "preview" });
  await s.app.idle();
  const preview = rulesRecord(s.app);
  assert.deepEqual([preview.status, preview.exitCode, preview.written, preview.proposals], ["completed", 0, [], []]);
  const printed = cliRules(twin, ["--mode", "algo", "--print"]);
  assert.deepEqual([printed.status, printed.stderr], [0, ""]);
  const { candidate } = preview.payload;
  assert.equal(candidate.rules, printed.stdout);
  assert.equal(candidate.rules, "# rules\n\n- layers domain < infrastructure < application < presentation <!-- keylang:algo status=algo-only -->\n- no-cycles <!-- keylang:algo status=algo-only -->\n");
  assert.equal(preview.payload.cyclic, false);
  assert.deepEqual([candidate.target, candidate.before, candidate.pending, candidate.problem], ["keylang/rules.md", RULES_SPEC, null, null]);
  // The rule the file has is not repeated; the prose and the flow are kept; no-cycles joins the # rules section.
  assert.equal(candidate.text, RULES_SPEC.replace("presentation\n\n# flow", "presentation\n- no-cycles <!-- keylang:algo status=algo-only -->\n\n# flow"));
  assert.deepEqual(treeBytes(root), before, "a preview writes no proposal, no stats, not the target");
  s.send(KEY.f6);
  let text = s.text();
  assert.match(text, /Draft rules · algo → keylang\/rules\.md · preview, nothing written/);
  assert.match(text, /2 rule\(s\), preview, nothing written · code 0/);
  assert.match(text, /── keylang draft rules --print · stdout ──/);
  assert.match(text, /── keylang\/rules\.md as proposed ──/);
  await esc(s.send);
  // Proposal: the CLI's proposal in the twin, byte for byte; only the proposal is new; MERGE opens since nothing moved.
  rulesForm(s);
  await s.app.idle();
  const proposed = rulesRecord(s.app);
  const store = ".keylang/proposals/keylang/rules.md";
  assert.deepEqual([proposed.status, proposed.exitCode, proposed.written, proposed.proposals, proposed.payload.proposal], ["completed", 0, [], [store], store]);
  const cli = cliRules(twin, ["--mode", "algo"]);
  assert.deepEqual([cli.status, cli.stdout, cli.stderr], [0, `${store}: proposed rules for keylang/rules.md; merge it with \`m\` in \`keylang\`\n`, ""]);
  assert.equal(readFileSync(join(root, store), "utf8"), readFileSync(join(twin, store), "utf8"), "the CLI's proposal, byte for byte");
  assert.equal(readFileSync(join(root, store), "utf8"), candidate.text);
  assert.equal(readFileSync(join(root, "keylang/rules.md"), "utf8"), RULES_SPEC);
  assert.deepEqual([...treeBytes(root).keys()].filter((path) => !before.has(path)), [store], "only the proposal, no stats");
  assert.equal(s.app.state.mode, "merge", s.app.state.message ?? "");
  assert.equal(s.app.state.merge?.path, "keylang/rules.md");
  await esc(s.send);
  assert.equal(readFileSync(join(root, "keylang/rules.md"), "utf8"), RULES_SPEC, "before w the rules are byte for byte the same");
  s.send(KEY.f6);
  assert.match(s.text(), /2 rule\(s\) proposed for keylang\/rules\.md · code 0/);
  assert.match(s.text(), /Enter open MERGE/);
  s.send(KEY.enter);
  assert.equal(s.app.state.merge?.path, "keylang/rules.md");
  for (let i = 0; i < s.app.state.merge!.hunks.length; i++) s.send("a");
  s.send("w");
  await s.app.idle();
  assert.equal(readFileSync(join(root, "keylang/rules.md"), "utf8"), candidate.text);
  assert.ok(!existsSync(join(root, store)));
  // A cyclic repository: deny pairs instead of an order, no no-cycles — the CLI's text again.
  const cyclic = checkoutRepo(t, { "src/domain/order.ts": CYCLIC_ORDER });
  const c = session(cyclic, { cols: 200 });
  t.after(() => c.app.close());
  await c.app.idle();
  rulesForm(c, { output: "preview" });
  await c.app.idle();
  const drafted = rulesRecord(c.app);
  assert.deepEqual([drafted.status, drafted.exitCode], ["completed", 0]);
  assert.equal(drafted.payload.cyclic, true);
  assert.equal(drafted.payload.candidate.rules, cliRules(cyclic, ["--mode", "algo", "--print"]).stdout);
  assert.doesNotMatch(drafted.payload.candidate.rules, /no-cycles|layers/);
  assert.match(drafted.payload.candidate.rules, /^- deny /m);
  c.send(KEY.f6);
  assert.match(c.text(), /the modules form a cycle, so no no-cycles/);
});

const RULES_ANSWER = "```markdown\n# rules\n\n- deny domain presentation\n- deny application domain\n```";

test("tui: a hybrid rules draft shows the model's conflict with its evidence apart from the workspace, which stays as it was; Cancel and a proposal that appears meanwhile write nothing, not even the stats", async (t) => {
  const root = checkoutRepo(t);
  withConfig(root, { agent: "anthropic:claude-opus-5" });
  const model = await heldModel(t, RULES_ANSWER);
  const s = session(root, { cols: 220 });
  t.after(() => s.app.close());
  await s.app.idle();
  const before = treeBytes(root);
  const verdicts = JSON.stringify(s.app.state.analysis!.verdicts);
  // Preview: the model's rules checked now — one kept, one broken by the code; the algo rules added.
  rulesForm(s, { output: "preview" });
  const record = s.app.state.records.at(-1)!;
  assert.equal(record.params.kind === "draft-rules" ? record.params.mode : null, "hybrid", "with a model the form's default is the CLI's hybrid");
  await model.requested(1);
  assert.match(model.prompts[0]!, /application → domain: \d+/, "the layer dependencies go to the model");
  model.release();
  await s.app.idle();
  const preview = rulesRecord(s.app);
  assert.deepEqual([preview.status, preview.exitCode, preview.proposals], ["completed", 0, []]);
  assert.equal(preview.payload.mode, "hybrid");
  assert.equal(preview.payload.summary, "1 agree, 2 algo-only, 1 conflict");
  assert.deepEqual(preview.payload.model?.counts, { agree: 1, "llm-only": 0, "algo-only": 2, conflict: 1 });
  assert.equal(preview.payload.model?.conflicts.length, 1);
  assert.match(preview.payload.model!.conflicts[0]!, /^- deny application domain → src\/application\/purchase\.ts:\d+: K102 /);
  assert.match(preview.payload.candidate.rules, /- deny application domain <!-- keylang:llm model=anthropic:claude-opus-5 status=conflict -->/);
  assert.match(preview.payload.candidate.rules, /- deny domain presentation <!-- keylang:llm model=anthropic:claude-opus-5 status=agree -->/);
  assert.deepEqual(treeBytes(root), before, "a preview of a model draft writes nothing, stats included");
  assert.equal(JSON.stringify(s.app.state.analysis!.verdicts), verdicts, "the workspace's verdicts are not the draft's");
  s.send(KEY.f6);
  const text = s.text();
  assert.match(text, /Draft rules · hybrid → keylang\/rules\.md · preview, nothing written/);
  assert.match(text, /conflicts \(1\): the code breaks these rules now/);
  assert.match(text, /conflict: - deny application domain → src\/application\/purchase\.ts:\d+: K102/);
  assert.match(text, /not the workspace's verdict/);
  assert.match(text, /── keylang draft rules --mode hybrid --print · stdout ──/);
  await esc(s.send);
  // Cancel while the model answers: cancelled with no code; the request is closed; nothing written.
  rulesForm(s, { mode: "llm" });
  await model.requested(2);
  const cancelled = s.app.state.records.at(-1)!;
  s.send(KEY.ctrlP);
  for (const ch of "cancel") s.send(ch);
  s.send(KEY.enter);
  assert.deepEqual([cancelled.status, cancelled.result?.exitCode, cancelled.result?.payload], ["cancelled", null, null]);
  for (let i = 0; i < 100 && model.dropped() === 0; i++) await sleep(10);
  assert.equal(model.dropped(), 1, "the model request is closed");
  model.release();
  await s.app.idle();
  assert.equal(cancelled.status, "cancelled", "a late answer changes nothing");
  assert.deepEqual(treeBytes(root), before, "no proposal, no stats");
  // Another proposal appears while the model answers: it is kept, nothing is counted.
  const store = join(root, ".keylang/proposals/keylang/rules.md");
  rulesForm(s);
  await model.requested(3);
  mkdirSync(dirname(store), { recursive: true });
  writeFileSync(store, "# rules\n\n- foreign\n");
  model.release();
  await s.app.idle();
  const refused = rulesRecord(s.app);
  assert.deepEqual([refused.status, refused.exitCode], ["failed", 1]);
  assert.match(refused.payload.refused.join("\n"), /\.keylang\/proposals\/keylang\/rules\.md: .*while the proposal was prepared/);
  assert.equal(readFileSync(store, "utf8"), "# rules\n\n- foreign\n");
  assert.deepEqual(draftCounts(root), {});
  rmSync(join(root, ".keylang/proposals"), { recursive: true });
  // The proposal: the full text, the stats count its lines; the rules file changes only through MERGE.
  rulesForm(s);
  await model.requested(4);
  model.release();
  await s.app.idle();
  const proposed = rulesRecord(s.app);
  assert.deepEqual([proposed.status, proposed.exitCode, proposed.payload.proposal], ["completed", 0, ".keylang/proposals/keylang/rules.md"]);
  assert.equal(readFileSync(store, "utf8"), proposed.payload.candidate.text);
  assert.equal(readFileSync(join(root, "keylang/rules.md"), "utf8"), "# rules\n\n- layers domain < infrastructure < application < presentation\n");
  assert.deepEqual(Object.fromEntries(Object.entries(draftCounts(root)).map(([status, n]) => [status, n.proposed])), { agree: 1, "llm-only": 0, "algo-only": 2, conflict: 1 });
  assert.equal(s.app.state.merge?.path, "keylang/rules.md", s.app.state.message ?? "");
  assert.match(s.app.state.message ?? "", /1 conflict\(s\) with the code now: F6 names them/);
  // Merged as it is, the conflicting rule is a finding of the check — never an ok.
  for (let i = 0; i < s.app.state.merge!.hunks.length; i++) s.send("a");
  s.send("w");
  await s.app.idle();
  s.send(KEY.f5);
  await s.app.idle();
  assert.ok(s.app.state.analysis!.diagnostics.some((d) => d.code === "K102"), JSON.stringify(s.app.state.analysis!.diagnostics.map((d) => d.code)));
});

test("tui: without a model the rules form drafts hybrid as algo and says so, as the CLI does; llm, a waiting proposal and an unsaved target are refused before it runs", async (t) => {
  const root = checkoutRepo(t);
  const s = session(root, { cols: 200 });
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.ctrlP);
  for (const ch of "draft rules") s.send(ch);
  s.send(KEY.enter);
  const prompt = s.app.state.prompt!;
  assert.equal(prompt.rulesDraft?.mode, "algo", "no model: the form starts on algo");
  s.send(KEY.down);
  s.send(KEY.right);
  assert.equal(prompt.rulesDraft?.mode, "hybrid");
  assert.match(prompt.note ?? "", /no model configured .*hybrid drafts from the snapshot only, as algo, and says so/);
  s.send(KEY.right);
  assert.equal(prompt.rulesDraft?.mode, "llm");
  s.send(KEY.down);
  s.send(KEY.down);
  s.send(KEY.enter);
  assert.equal(s.app.state.prompt?.kind, "draft-rules", "the form stays");
  assert.equal(prompt.ids?.[prompt.index], "mode");
  assert.match(s.app.state.message ?? "", /draft rules: --mode llm needs a model/);
  assert.equal(s.app.state.records.length, 0);
  await esc(s.send);
  // Hybrid preview without a model: algo with the CLI's note.
  rulesForm(s, { mode: "hybrid", output: "preview" });
  await s.app.idle();
  const result = rulesRecord(s.app);
  assert.deepEqual([result.status, result.exitCode, result.payload.mode, result.payload.model], ["completed", 0, "algo", null]);
  const cli = cliRules(root, ["--mode", "hybrid", "--print"]);
  assert.equal(result.payload.candidate.rules, cli.stdout);
  assert.equal(cli.stderr, `keylang: ${result.payload.fallback}\n`);
  assert.match(result.payload.fallback ?? "", /; drafting from the snapshot only \(--mode algo\)$/);
  s.send(KEY.f6);
  assert.match(s.text(), /Draft rules · algo \(hybrid without a model\) → keylang\/rules\.md/);
  await esc(s.send);
  // A waiting proposal and an unsaved target: refused before the run, the bytes as they were.
  const store = join(root, ".keylang/proposals/keylang/rules.md");
  mkdirSync(dirname(store), { recursive: true });
  writeFileSync(store, "# rules\n\n- waiting\n");
  const records = s.app.state.records.length;
  rulesForm(s);
  assert.equal(s.app.state.prompt?.kind, "draft-rules");
  assert.match(s.app.state.message ?? "", /a proposal for keylang\/rules\.md is waiting: merge it first/);
  assert.equal(s.app.state.records.length, records);
  assert.equal(readFileSync(store, "utf8"), "# rules\n\n- waiting\n");
  await esc(s.send);
  rmSync(join(root, ".keylang/proposals"), { recursive: true });
  s.send("\x1b[12~");
  const file = locate(s.lines(), "keylang/rules");
  s.send(click(file.x + 1, file.y));
  assert.equal(s.app.state.current, "keylang/rules.md", s.app.state.message ?? "");
  s.send("i");
  s.send("x");
  await esc(s.send);
  rulesForm(s);
  assert.match(s.app.state.message ?? "", /keylang\/rules\.md has unsaved changes/);
  assert.equal(s.app.state.records.length, records);
  assert.ok(!existsSync(store));
});

// ---------- layer layout draft (ticket 25) ----------

/** The palette's draft-layout form with the given mode; Enter on the run row. */
function layoutForm(s: ReturnType<typeof session>, mode?: "algo" | "hybrid" | "llm"): void {
  s.send(KEY.ctrlP);
  for (const ch of "draft layers") s.send(ch);
  s.send(KEY.enter);
  const prompt = s.app.state.prompt!;
  assert.equal(prompt.kind, "draft-layout", s.app.state.message ?? "");
  for (let i = 0; i < 3 && mode !== undefined && prompt.layoutDraft!.mode !== mode; i++) s.send(KEY.right);
  if (mode !== undefined) assert.equal(prompt.layoutDraft!.mode, mode);
  s.send(KEY.down);
  assert.equal(prompt.ids?.[prompt.index], "run");
  s.send(KEY.enter);
}

type LayoutResult = Extract<OperationResult, { kind: "draft-layout" }> & { payload: NonNullable<Extract<OperationResult, { kind: "draft-layout" }>["payload"]> };

function layoutRecord(app: App): LayoutResult {
  const result = app.state.records.at(-1)?.result;
  assert.ok(result?.kind === "draft-layout" && result.payload !== null, JSON.stringify(result?.messages));
  return result as LayoutResult;
}

function cliMap(root: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  return spawnSync(process.execPath, [BIN, "draft", "map", ...args], { cwd: root, encoding: "utf8", env: { ...process.env, ANTHROPIC_API_KEY: "", ANTHROPIC_AUTH_TOKEN: "", OPENROUTER_API_KEY: "", HOME: root } });
}

/** The guess for the checkout repository: a layer per directory under src/, in name order. */
const GUESSED_LAYERS = { application: ["src/application/**"], domain: ["src/domain/**"], infrastructure: ["src/infrastructure/**"], presentation: ["src/presentation/**"] };

test("tui: draft map (algo) is the CLI's layout; Enter moves only layers into keylang.json's buffer — agent, explain, check, exclude and $schema stay; nothing is written before Ctrl+S, Ctrl+Z gives the text back", async (t) => {
  const root = checkoutRepo(t);
  const config = join(root, "keylang.json");
  const fields = { $schema: "https://example.test/keylang.schema.json", languages: ["typescript"], layers: { core: ["src/domain/**"], rest: ["src/application/**", "src/infrastructure/**", "src/presentation/**"] }, exclude: ["src/legacy/**"], check: { trace: ".keylang/trace/*.jsonl", static: "shape" }, agent: "anthropic:claude-opus-5", explain: { lang: "uk", detail: "full" } };
  writeFileSync(config, `${JSON.stringify(fields, null, 2)}\n`);
  const original = readFileSync(config, "utf8");
  const s = session(root, { cols: 200 });
  t.after(() => s.app.close());
  await s.app.idle();
  const before = treeBytes(root);
  // The form: with a model, hybrid by default; algo chosen; the root is shown.
  s.send(KEY.ctrlP);
  for (const ch of "draft map") s.send(ch);
  s.send(KEY.enter);
  const prompt = s.app.state.prompt!;
  assert.equal(prompt.kind, "draft-layout");
  assert.equal(prompt.layoutDraft?.mode, "hybrid");
  assert.deepEqual(prompt.ids, ["mode", "run"]);
  assert.match(prompt.details![0]!, /drafted from the saved keylang\.json and the code · only layers change, in the buffer, until Ctrl\+S/);
  await esc(s.send);
  layoutForm(s, "algo");
  await s.app.idle();
  const drafted = layoutRecord(s.app);
  assert.deepEqual([drafted.status, drafted.exitCode, drafted.written, drafted.proposals], ["completed", 0, [], []]);
  assert.deepEqual(drafted.payload.layers, GUESSED_LAYERS);
  const cli = cliMap(root, ["--mode", "algo"]);
  assert.deepEqual([cli.status, cli.stdout, cli.stderr], [0, drafted.payload.preview, "keylang: printed only; keylang.json is unchanged\n"], "the CLI prints the same layout");
  assert.deepEqual(treeBytes(root), before, "the draft writes nothing: no proposal, not keylang.json, not the map");
  // F6: the layers and the move.
  s.send(KEY.f6);
  let text = s.text();
  assert.match(text, /Draft layers · algo · nothing written, not even a proposal/);
  assert.match(text, /infrastructure {2}src\/infrastructure\/\*\*/);
  assert.match(text, /Enter: move the layers into keylang\.json's buffer — only layers change/);
  assert.match(text, /── keylang draft map · stdout ──/);
  assert.match(text, /Enter move layers into keylang\.json/);
  s.send(KEY.enter);
  assert.equal(s.app.state.current, "keylang.json", s.app.state.message ?? "");
  assert.equal(s.app.state.mode, "edit");
  const buffer = s.app.state.buffers.get("keylang.json")!;
  const moved = JSON.parse(buffer.text) as Record<string, unknown>;
  assert.deepEqual(moved, { ...fields, layers: GUESSED_LAYERS }, "semantically only layers changed");
  assert.deepEqual(Object.keys(moved), Object.keys(fields), "the fields keep their order");
  assert.equal(buffer.text.split("\n")[s.app.state.cursor.line], '  "layers": {');
  assert.match(s.app.state.message ?? "", /layers moved into keylang\.json \(unsaved\)/);
  assert.deepEqual(treeBytes(root), before, "before Ctrl+S the disk and the proposals are unchanged");
  assert.equal(s.app.state.records.at(-1)!.outdated, "its layers were moved into keylang.json's buffer");
  // Ctrl+Z: the move is one edit.
  s.send("\x1a");
  assert.equal(buffer.text, original.replace(/\n$/, "\n"));
  assert.equal(buffer.text, buffer.saved, "clean again");
  // The moved record drafts again on Enter; the new one moves again; Ctrl+S writes and the analysis reads it.
  await esc(s.send);
  s.send(KEY.f6);
  assert.match(s.text(), /outdated: its layers were moved into keylang\.json's buffer · Enter reruns/);
  s.send(KEY.enter);
  await s.app.idle();
  assert.equal(s.app.state.records.length, 2);
  s.send(KEY.down);
  s.send(KEY.enter);
  assert.equal(s.app.state.mode, "edit");
  s.send(KEY.ctrlS);
  await s.app.idle();
  const saved = JSON.parse(readFileSync(config, "utf8")) as Record<string, unknown>;
  assert.deepEqual(saved, { ...fields, layers: GUESSED_LAYERS });
  assert.equal(s.app.state.config.kind, "configured");
  assert.deepEqual([...s.app.state.analysis!.config.layers.keys()], Object.keys(GUESSED_LAYERS), "the saved layers are the analysis's");
  assert.equal(s.app.state.analysis!.config.agent, "anthropic:claude-opus-5");
  assert.ok(!existsSync(join(root, ".keylang/proposals")));
});

test("tui: without keylang.json draft map moves the layers into a new buffer with the inferred config; the file appears only with Ctrl+S", async (t) => {
  const root = repoWith(t, CHECKOUT_FILES);
  const s = session(root, { cols: 200 });
  t.after(() => s.app.close());
  await s.app.idle();
  assert.equal(s.app.state.config.kind, "missing-config");
  const before = treeBytes(root);
  layoutForm(s);
  await s.app.idle();
  const drafted = layoutRecord(s.app);
  assert.deepEqual([drafted.payload.mode, drafted.payload.configExists, drafted.payload.layers], ["algo", false, GUESSED_LAYERS]);
  const cli = cliMap(root, ["--mode", "algo"]);
  assert.deepEqual([cli.stdout, cli.stderr], [drafted.payload.preview, "keylang: no keylang.json; `keylang init` writes this layout\n"]);
  s.send(KEY.f6);
  assert.match(s.text(), /Enter: move the layers into a new keylang\.json buffer, the inferred config with these layers/);
  s.send(KEY.enter);
  assert.equal(s.app.state.current, "keylang.json", s.app.state.message ?? "");
  const buffer = s.app.state.buffers.get("keylang.json")!;
  assert.equal(buffer.newFile, true);
  assert.equal(buffer.text, drafted.payload.preview, "the inferred config as init writes it, with the drafted layers");
  assert.deepEqual(treeBytes(root), before, "no file before Ctrl+S");
  s.send(KEY.ctrlS);
  await s.app.idle();
  assert.equal(readFileSync(join(root, "keylang.json"), "utf8"), drafted.payload.preview);
  assert.equal(s.app.state.config.kind, "configured");
  assert.deepEqual([...s.app.state.analysis!.config.layers.keys()], Object.keys(GUESSED_LAYERS));
});

const LAYOUT_ANSWER = '{"core": ["src/domain/**"], "edge": ["src/application/**", "src/infrastructure/**", "src/presentation/**"]}';

test("tui: a model layout is the validated answer; an edit of keylang.json during the request makes it outdated with the new text kept; Cancel closes the request; a hybrid without a model and invalid JSON in the buffer move nothing", async (t) => {
  const root = checkoutRepo(t);
  withConfig(root, { agent: "anthropic:claude-opus-5" });
  const model = await heldModel(t, `Here:\n${LAYOUT_ANSWER}`);
  const s = session(root, { cols: 200 });
  t.after(() => s.app.close());
  await s.app.idle();
  const before = treeBytes(root);
  // keylang.json is opened and edited while the model answers.
  s.send(KEY.ctrlP);
  for (const ch of "keylang.json") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.current, "keylang.json");
  layoutForm(s, "llm");
  await model.requested(1);
  assert.match(model.prompts[0]!, /src\/application\/purchase\.ts/, "the model sees the source files");
  s.send("i");
  s.send(" ");
  await esc(s.send);
  const edited = s.app.state.buffers.get("keylang.json")!.text;
  model.release();
  await s.app.idle();
  const late = layoutRecord(s.app);
  assert.deepEqual([late.status, late.payload.mode, late.payload.agent, late.payload.layers], ["completed", "llm", "anthropic:claude-opus-5", JSON.parse(LAYOUT_ANSWER)]);
  assert.match(s.app.state.records.at(-1)!.outdated ?? "", /keylang\.json was edited in this session since the draft started/);
  s.send(KEY.f6);
  s.send(KEY.enter);
  assert.equal(s.app.state.buffers.get("keylang.json")!.text, edited, "an outdated draft never lands over the new text");
  assert.equal(s.app.state.records.length, 2, "Enter drafts again");
  await model.requested(2);
  model.release();
  await s.app.idle();
  s.send(KEY.down);
  s.send(KEY.enter);
  const buffer = s.app.state.buffers.get("keylang.json")!;
  assert.deepEqual((JSON.parse(buffer.text) as { layers: unknown }).layers, JSON.parse(LAYOUT_ANSWER));
  assert.equal((JSON.parse(buffer.text) as { agent: string }).agent, "anthropic:claude-opus-5");
  assert.deepEqual(treeBytes(root), before, "nothing written, the edit stays in the buffer");
  s.send("\x1a");
  assert.equal(buffer.text, edited, "Ctrl+Z gives back the text with the edit");
  await esc(s.send);
  // Cancel while the model answers: cancelled, no code, the request closed.
  layoutForm(s, "llm");
  await model.requested(3);
  const cancelled = s.app.state.records.at(-1)!;
  s.send(KEY.ctrlP);
  for (const ch of "cancel") s.send(ch);
  s.send(KEY.enter);
  assert.deepEqual([cancelled.status, cancelled.result?.exitCode, cancelled.result?.payload], ["cancelled", null, null]);
  for (let i = 0; i < 100 && model.dropped() === 0; i++) await sleep(10);
  assert.equal(model.dropped(), 1);
  model.release();
  await s.app.idle();
  assert.equal(buffer.text, edited);
  // Invalid JSON in the buffer: the layers are not moved, the text is not repaired; keylang.json is shown with the reason.
  s.send("i");
  s.send("{");
  await esc(s.send);
  const broken = buffer.text;
  layoutForm(s, "algo");
  await s.app.idle();
  s.send(KEY.f6);
  s.send(KEY.enter);
  assert.equal(buffer.text, broken);
  assert.equal(s.app.state.current, "keylang.json");
  assert.match(s.app.state.message ?? "", /draft map: keylang\.json: invalid JSON: .* nothing was changed/);
  assert.deepEqual(treeBytes(root), before);
  // A hybrid without a model: algo with the CLI's note.
  const plain = checkoutRepo(t);
  const p = session(plain, { cols: 200 });
  t.after(() => p.app.close());
  await p.app.idle();
  layoutForm(p, "hybrid");
  await p.app.idle();
  const fallback = layoutRecord(p.app);
  assert.deepEqual([fallback.payload.mode, fallback.payload.layers], ["algo", GUESSED_LAYERS]);
  const cli = cliMap(plain, []);
  assert.equal(cli.stdout, fallback.payload.preview);
  assert.equal(cli.stderr, `keylang: ${fallback.payload.fallback}\nkeylang: printed only; keylang.json is unchanged\n`);
  p.send(KEY.f6);
  assert.match(p.text(), /Draft layers · algo \(hybrid without a model\)/);
});

test("tui: invalid layers from the model are a failed draft (2) with the reason; nothing can be moved", async (t) => {
  const root = checkoutRepo(t);
  withConfig(root, { agent: "anthropic:claude-opus-5" });
  const model = await heldModel(t, '{"core.domain": ["src/domain/**"]}');
  const s = session(root, { cols: 200 });
  t.after(() => s.app.close());
  await s.app.idle();
  const before = treeBytes(root);
  layoutForm(s, "llm");
  await model.requested(1);
  model.release();
  await s.app.idle();
  const record = s.app.state.records.at(-1)!;
  assert.deepEqual([record.status, record.result?.exitCode, record.result?.payload], ["failed", 2, null]);
  assert.match(record.result!.messages.map((m) => m.text).join("\n"), /layer name `core\.domain` must be one ID segment/);
  assert.equal(s.app.state.buffers.get("keylang.json"), undefined, "keylang.json was not even opened");
  assert.deepEqual(treeBytes(root), before);
});

// ---------- code-to-spec from a file or a line (ticket 26) ----------

/** Two exported fns and a private one between them: `buy` calls `create` and the private `audit`, which calls `save`. */
const PURCHASE_TWO = [
  'import { create } from "../domain/order.ts";',
  'import { save } from "../infrastructure/store.ts";',
  "export function buy(): void {",
  "  create();",
  "  audit();",
  "}",
  "function audit(): void {",
  "  save();",
  "}",
  "export function refund(): void {",
  "  save();",
  "}",
  "",
].join("\n");

/** The default target of the file: prose, the flow `buy` (replaced by the draft) and a hand-written flow (kept). */
const PURCHASE_SPEC = "# Purchase\n\nWhy we buy.\n\n# flow buy\n\n- trigger application.purchase.buy\n\n# flow manual\n\n- trigger presentation.terminal.checkout\n";

/** Moves the code-to-spec form's selection to the row `id`. */
function codeRow(s: ReturnType<typeof session>, id: string): void {
  const prompt = s.app.state.prompt!;
  for (let i = 0; i < 20 && prompt.ids?.[prompt.index] !== id; i++) s.send(KEY.down);
  assert.equal(prompt.ids?.[prompt.index], id, JSON.stringify(prompt.ids));
}

/** Replaces the text of a field row of the code-to-spec form. */
function codeField(s: ReturnType<typeof session>, id: "file" | "line" | "into" | "since", text: string): void {
  codeRow(s, id);
  for (const _ of s.app.state.prompt!.codeDraft![id]) s.send("\x7f");
  for (const ch of text) s.send(ch);
}

/** The palette's code-to-spec form with the given fields (an absent one keeps its prefill); Enter on the run row. */
function codeForm(s: ReturnType<typeof session>, fields: { file?: string; line?: string; into?: string; output?: "proposal" | "preview" }): void {
  s.send(KEY.ctrlP);
  for (const ch of "code to spec") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.prompt?.kind, "code-to-spec", s.app.state.message ?? "");
  if (fields.file !== undefined) codeField(s, "file", fields.file);
  if (fields.line !== undefined) codeField(s, "line", fields.line);
  if (fields.into !== undefined) codeField(s, "into", fields.into);
  if ((fields.output ?? "proposal") !== s.app.state.prompt!.codeDraft!.output) {
    codeRow(s, "output");
    s.send(KEY.right);
  }
  codeRow(s, "run");
  s.send(KEY.enter);
}

type CodeResult = Extract<OperationResult, { kind: "code-to-spec" }> & { payload: NonNullable<Extract<OperationResult, { kind: "code-to-spec" }>["payload"]> };

function codeRecord(app: App): CodeResult {
  const result = app.state.records.at(-1)?.result;
  assert.ok(result?.kind === "code-to-spec" && result.payload !== null, JSON.stringify(result?.messages));
  return result as CodeResult;
}

function cliCode(root: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  return spawnSync(process.execPath, [BIN, "code-to-spec", ...args, "--mode", "algo"], { cwd: root, encoding: "utf8" });
}

test("tui: code-to-spec of a file with two exports and a private fn is the CLI's file mode; a line picks the fn holding it; the proposal keeps the prose and the other flow; source and target stay until w", async (t) => {
  const specs = { "src/application/purchase.ts": PURCHASE_TWO, "keylang/flows/purchase.md": PURCHASE_SPEC };
  const root = checkoutRepo(t, specs);
  const twin = checkoutRepo(t, specs);
  const s = session(root, { cols: 200, rows: 60 });
  t.after(() => s.app.close());
  await s.app.idle();
  const before = treeBytes(root);
  // No ID under the cursor: empty fields; a typed part lists the source files; Enter takes one and moves to the line.
  s.send(KEY.ctrlP);
  for (const ch of "code to spec") s.send(ch);
  s.send(KEY.enter);
  const prompt = s.app.state.prompt!;
  assert.equal(prompt.kind, "code-to-spec");
  assert.deepEqual(prompt.codeDraft, { source: "file", file: "", line: "", since: "HEAD", into: "", mode: "algo", output: "proposal" });
  assert.equal(promptNote(s.app), "type a source file · ↓ picks a match");
  assert.deepEqual(prompt.details, [`root: ${root} · the file and the target are relative to it · algo: only the calls the snapshot resolved; no model, no search beyond the file`]);
  for (const ch of "purch") s.send(ch);
  assert.deepEqual(prompt.ids?.filter((id) => id.startsWith("src:")), ["src:src/application/purchase.ts"]);
  s.send(KEY.down);
  assert.equal(promptNote(s.app), "Enter takes src/application/purchase.ts as the file");
  s.send(KEY.enter);
  assert.equal(prompt.codeDraft?.file, "src/application/purchase.ts");
  assert.equal(prompt.ids?.[prompt.index], "line");
  assert.equal(promptNote(s.app), "2 exported fn(s): application.purchase.buy, application.purchase.refund");
  assert.match(prompt.items.join("\n"), /target: {4}\(default keylang\/flows\/purchase\.md\)/);
  // The line takes digits only; inside the private fn it names that fn and its own target.
  for (const ch of "8x") s.send(ch);
  assert.equal(prompt.codeDraft?.line, "8");
  assert.equal(promptNote(s.app), "line 8 is in application.purchase.audit");
  assert.match(prompt.items.join("\n"), /target: {4}\(default keylang\/flows\/audit\.md\)/);
  assert.match(s.text(), /code to spec · algo/);
  await esc(s.send);
  assert.deepEqual(treeBytes(root), before, "Esc writes nothing");
  // Preview of the file: the CLI's --print byte for byte (both exports, not the private fn); nothing is written.
  codeForm(s, { file: "src/application/purchase.ts", output: "preview" });
  await s.app.idle();
  const preview = codeRecord(s.app);
  assert.deepEqual([preview.status, preview.exitCode, preview.written, preview.proposals], ["completed", 0, [], []]);
  const printed = cliCode(twin, ["src/application/purchase.ts", "--print"]);
  assert.deepEqual([printed.status, printed.stderr], [0, ""]);
  const candidate = preview.payload.candidate!;
  assert.equal(candidate.print, printed.stdout);
  assert.deepEqual(candidate.flows.map((flow) => [flow.name, flow.trigger, flow.steps]), [
    ["buy", "application.purchase.buy", ["application.purchase.buy", "domain.order.create", "application.purchase.audit", "infrastructure.store.save"]],
    ["refund", "application.purchase.refund", ["application.purchase.refund", "infrastructure.store.save"]],
  ]);
  assert.deepEqual([candidate.name, candidate.target, candidate.before, candidate.pending, candidate.problem], ["purchase", "keylang/flows/purchase.md", PURCHASE_SPEC, null, null]);
  assert.ok(candidate.text!.startsWith("# Purchase\n\nWhy we buy.\n\n# flow buy\n"), "the prose stays; the flow buy is replaced in place");
  assert.match(candidate.text!, /# flow manual\n\n- trigger presentation\.terminal\.checkout\n/);
  assert.ok(candidate.text!.endsWith(candidate.flows[1]!.flow), "refund is appended");
  assert.deepEqual(treeBytes(root), before, "a preview writes no proposal, no stats, not the target");
  s.send(KEY.f6);
  let text = s.text();
  assert.match(text, /Code to spec · algo · src\/application\/purchase\.ts → keylang\/flows\/purchase\.md · preview, nothing written/);
  assert.match(text, /2 flow\(s\), 6 step\(s\), preview, nothing written · code 0/);
  assert.match(text, /── keylang code-to-spec src\/application\/purchase\.ts --mode algo --print · stdout ──/);
  assert.match(text, /── keylang\/flows\/purchase\.md as proposed ──/);
  await esc(s.send);
  // A line inside a fn: the same fn as the CLI's :line, and the same target.
  codeForm(s, { file: "src/application/purchase.ts", line: "8", output: "preview" });
  await s.app.idle();
  const atLine = codeRecord(s.app).payload.candidate!;
  assert.equal(atLine.print, cliCode(twin, ["src/application/purchase.ts:8", "--print"]).stdout);
  assert.deepEqual([atLine.line, atLine.name, atLine.target, atLine.flows.map((flow) => flow.trigger)], [8, "audit", "keylang/flows/audit.md", ["application.purchase.audit"]]);
  // Proposal of the file: the CLI's proposal in the twin byte for byte; only the proposal is new; MERGE opens since nothing moved.
  codeForm(s, { file: "src/application/purchase.ts" });
  await s.app.idle();
  const proposed = codeRecord(s.app);
  const store = ".keylang/proposals/keylang/flows/purchase.md";
  assert.deepEqual([proposed.status, proposed.exitCode, proposed.written, proposed.proposals, proposed.payload.proposal], ["completed", 0, [], [store], store]);
  const cli = cliCode(twin, ["src/application/purchase.ts"]);
  assert.deepEqual([cli.status, cli.stdout, cli.stderr], [0, `${store}: proposed \`buy\`, \`refund\` for keylang/flows/purchase.md; merge it with \`m\` in \`keylang\`\n`, ""]);
  assert.equal(readFileSync(join(root, store), "utf8"), readFileSync(join(twin, store), "utf8"), "the CLI's proposal, byte for byte");
  assert.equal(readFileSync(join(root, store), "utf8"), candidate.text);
  assert.equal(readFileSync(join(root, "keylang/flows/purchase.md"), "utf8"), PURCHASE_SPEC);
  assert.equal(readFileSync(join(root, "src/application/purchase.ts"), "utf8"), PURCHASE_TWO, "the source is never written");
  assert.deepEqual([...treeBytes(root).keys()].filter((path) => !before.has(path)), [store], "only the proposal, no stats");
  assert.equal(s.app.state.mode, "merge", s.app.state.message ?? "");
  assert.equal(s.app.state.merge?.path, "keylang/flows/purchase.md");
  assert.match(s.app.state.message ?? "", /code-to-spec: \.keylang\/proposals\/keylang\/flows\/purchase\.md \(buy, refund\) · MERGE/);
  await esc(s.send);
  assert.equal(readFileSync(join(root, "keylang/flows/purchase.md"), "utf8"), PURCHASE_SPEC, "before w the target is byte for byte the same");
  s.send(KEY.f6);
  text = s.text();
  assert.match(text, /2 flow\(s\), 6 step\(s\) proposed for keylang\/flows\/purchase\.md · code 0/);
  assert.match(text, /flow buy · trigger application\.purchase\.buy · 4 step\(s\)/);
  assert.match(text, /flow refund · trigger application\.purchase\.refund · 2 step\(s\)/);
  assert.match(text, /Enter open MERGE/);
  s.send(KEY.enter);
  assert.equal(s.app.state.merge?.path, "keylang/flows/purchase.md");
  for (let i = 0; i < s.app.state.merge!.hunks.length; i++) s.send("a");
  s.send("w");
  await s.app.idle();
  assert.equal(readFileSync(join(root, "keylang/flows/purchase.md"), "utf8"), candidate.text);
  assert.ok(!existsSync(join(root, store)));
});

test("tui: code-to-spec takes the code viewer's or the cursor's position; a line outside every fn, a file that is not source, a waiting proposal and an unsaved target keep the form; a target edited during the work gets no proposal", async (t) => {
  const root = checkoutRepo(t, { "src/application/purchase.ts": PURCHASE_TWO });
  const hook: { during: (() => void) | null } = { during: null };
  // The operation on this thread, with a hook before the session's own answer to the commit.
  const operations = (request: OperationRequest, context: OperationContext): Promise<OperationResult> =>
    runOperation(request, {
      ...context,
      beforeCommit: async (plan) => {
        hook.during?.();
        return context.beforeCommit?.(plan);
      },
    });
  const s = session(root, { cols: 200, operations });
  t.after(() => s.app.close());
  await s.app.idle();
  const before = treeBytes(root);
  // The ID under the cursor (a fn): its file and line.
  for (let i = 0; i < 5; i++) s.send(KEY.down);
  s.send(KEY.ctrlP);
  for (const ch of "code to spec") s.send(ch);
  s.send(KEY.enter);
  assert.deepEqual(s.app.state.prompt?.codeDraft, { source: "file", file: "src/application/purchase.ts", line: "3", since: "HEAD", into: "", mode: "algo", output: "proposal" });
  assert.equal(promptNote(s.app), "line 3 is in application.purchase.buy");
  await esc(s.send);
  // The code viewer: its file and line.
  s.send(KEY.enter);
  assert.equal(s.app.state.mode, "code");
  s.send(KEY.ctrlP);
  for (const ch of "code to spec") s.send(ch);
  s.send(KEY.enter);
  assert.deepEqual(s.app.state.prompt?.codeDraft, { source: "file", file: "src/application/purchase.ts", line: "3", since: "HEAD", into: "", mode: "algo", output: "proposal" });
  await esc(s.send);
  s.send(KEY.ctrlO);
  assert.equal(s.app.state.mode, "view");
  // A line outside every fn: the CLI's reason, the typed values stay, the line is selected, nothing runs.
  codeForm(s, { file: "src/application/purchase.ts", line: "1" });
  let prompt = s.app.state.prompt!;
  assert.equal(prompt.kind, "code-to-spec");
  assert.deepEqual([prompt.codeDraft?.file, prompt.codeDraft?.line, prompt.ids?.[prompt.index]], ["src/application/purchase.ts", "1", "line"]);
  assert.equal(s.app.state.message, "code-to-spec: src/application/purchase.ts:1: no function holds this line");
  assert.equal(cliCode(root, ["src/application/purchase.ts:1"]).stderr, "keylang: src/application/purchase.ts:1: no function holds this line\n");
  codeField(s, "line", "0");
  codeRow(s, "run");
  s.send(KEY.enter);
  assert.equal(s.app.state.message, "code-to-spec: line `0`: a whole number from 1, or empty for every exported fn of the file");
  await esc(s.send);
  // Not a source file: the CLI's reason on the file row.
  codeForm(s, { file: "keylang.json", line: "" });
  prompt = s.app.state.prompt!;
  assert.deepEqual([prompt.codeDraft?.file, prompt.ids?.[prompt.index]], ["keylang.json", "file"]);
  assert.equal(s.app.state.message, "code-to-spec: keylang.json: no function of the snapshot is declared here");
  await esc(s.send);
  assert.equal(s.app.state.records.length, 0);
  assert.deepEqual(treeBytes(root), before);
  // A proposal waiting for the target: refused before the run, its bytes stay; the CLI still replaces its own.
  const store = join(root, ".keylang/proposals/keylang/flows/purchase.md");
  mkdirSync(dirname(store), { recursive: true });
  writeFileSync(store, "someone's proposal\n");
  codeForm(s, { file: "src/application/purchase.ts", line: "" });
  assert.equal(s.app.state.message, "code-to-spec: a proposal for keylang/flows/purchase.md is waiting: merge it first (m, or Proposals)");
  assert.equal(s.app.state.prompt?.codeDraft?.file, "src/application/purchase.ts");
  await esc(s.send);
  assert.equal(readFileSync(store, "utf8"), "someone's proposal\n");
  assert.equal(cliCode(root, ["src/application/purchase.ts"]).status, 0);
  assert.equal(readFileSync(store, "utf8"), cliCode(root, ["src/application/purchase.ts", "--print"]).stdout);
  rmSync(join(root, ".keylang"), { recursive: true, force: true });
  // An unsaved target: refused before the run; the buffer keeps its text.
  const flow = "keylang/flows/checkout.md";
  s.send("i");
  for (const ch of "Draft me. ") s.send(ch);
  await esc(s.send);
  const typed = s.app.state.buffers.get(flow)!.text;
  codeForm(s, { file: "src/application/purchase.ts", line: "10", into: flow });
  assert.equal(s.app.state.message, `code-to-spec: ${flow} has unsaved changes: save (Ctrl+S) or undo them before a draft into it`);
  await esc(s.send);
  assert.equal(s.app.state.buffers.get(flow)!.text, typed);
  const buffer = s.app.state.buffers.get(flow)!;
  for (let i = 0; i < 20 && buffer.text !== buffer.saved; i++) s.send("\x1a"); // Ctrl+Z
  assert.equal(buffer.text, buffer.saved);
  // The target edited in the session while the draft was prepared: the operation names it, the session refuses, nothing is written.
  hook.during = () => {
    s.send("i");
    s.send("x");
    s.send("\x1b");
  };
  codeForm(s, { file: "src/application/purchase.ts", line: "10", into: flow });
  await s.app.idle();
  const refused = s.app.state.records.at(-1)!.result!;
  assert.deepEqual([refused.kind, refused.status, refused.exitCode, refused.proposals], ["code-to-spec", "failed", 1, []]);
  assert.equal(refused.messages[0]!.text, `${flow}: edited in this session while the draft was prepared; save or undo the edits, then draft again`);
  assert.ok(!existsSync(join(root, ".keylang/proposals")));
  assert.equal(readFileSync(join(root, flow), "utf8"), CHECKOUT_FLOW);
});

// ---------- code-to-spec from the git changes and with a model (ticket 27) ----------

/** PURCHASE_TWO after an edit of `buy` (already in the checkout flow) and of `refund` (in no flow). */
const PURCHASE_CHANGED = PURCHASE_TWO.replace("  audit();\n", "  audit(); // audited\n").replace("export function refund(): void {\n  save();\n", "export function refund(): void {\n  save(); // refunded\n");

/** The changes of a committed checkout: two edited fns of purchase.ts and a new untracked source. */
function changeCheckout(root: string): void {
  writeFileSync(join(root, "src/application/purchase.ts"), PURCHASE_CHANGED);
  writeFileSync(join(root, "src/domain/payment.ts"), "export function pay(): void {}\n");
}

/**
 * The palette's code-to-spec form drafting from the git changes: a file and a
 * line are typed first and must not be sent; then the source is switched,
 * the fields set (an absent one keeps its default), and Enter on run.
 */
function sinceForm(s: ReturnType<typeof session>, fields: { since?: string; into?: string; mode?: "algo" | "hybrid" | "llm"; output?: "proposal" | "preview" }): void {
  s.send(KEY.ctrlP);
  for (const ch of "code to spec") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.prompt?.kind, "code-to-spec", s.app.state.message ?? "");
  codeField(s, "file", "src/application/purchase.ts");
  codeField(s, "line", "3");
  codeRow(s, "source");
  s.send(KEY.right);
  const form = s.app.state.prompt!.codeDraft!;
  assert.equal(form.source, "since");
  assert.ok(!s.app.state.prompt!.ids!.includes("file") && !s.app.state.prompt!.ids!.includes("line"), "the file's rows are hidden");
  if (fields.since !== undefined) codeField(s, "since", fields.since);
  if (fields.into !== undefined) codeField(s, "into", fields.into);
  if (fields.mode !== undefined) {
    codeRow(s, "mode");
    for (let i = 0; i < 3 && form.mode !== fields.mode; i++) s.send(KEY.right);
    assert.equal(form.mode, fields.mode);
  }
  if ((fields.output ?? "proposal") !== form.output) {
    codeRow(s, "output");
    s.send(KEY.right);
  }
  codeRow(s, "run");
  s.send(KEY.enter);
}

/** `keylang code-to-spec --since=<ref> …`: the `=` form, so a ref that looks like an option reaches the command. */
function cliSince(root: string, [ref, ...args]: string[]): { status: number | null; stdout: string; stderr: string } {
  return spawnSync(process.execPath, [BIN, "code-to-spec", `--since=${ref}`, ...args], { cwd: root, encoding: "utf8" });
}

test("tui: code-to-spec from the git changes is the CLI's --since: a changed fn and an untracked file drafted, a fn already in a flow named; no change is a no-op that writes nothing; a bad ref or no git is code 2", async (t) => {
  const files = { "src/application/purchase.ts": PURCHASE_TWO };
  const root = committedCheckout(t, files);
  const twin = committedCheckout(t, files);
  changeCheckout(root);
  changeCheckout(twin);
  const s = session(root, { cols: 200, rows: 60 });
  t.after(() => s.app.close());
  await s.app.idle();
  const before = workTree(root);
  // The form switches the source explicitly; the git rows show the default ref and the default target.
  s.send(KEY.ctrlP);
  for (const ch of "code to spec") s.send(ch);
  s.send(KEY.enter);
  codeRow(s, "source");
  s.send(KEY.right);
  let prompt = s.app.state.prompt!;
  assert.deepEqual(prompt.ids, ["source", "since", "into", "mode", "output", "run"]);
  assert.match(prompt.items.join("\n"), /since: {3}HEAD/);
  assert.match(prompt.items.join("\n"), /target: {4}\(default keylang\/flows\/changes\.md\)/);
  codeField(s, "since", "");
  codeRow(s, "run");
  s.send(KEY.enter);
  assert.equal(s.app.state.message, "code-to-spec: a git ref is required (HEAD: the changes not committed yet)");
  assert.equal(s.app.state.prompt?.ids?.[s.app.state.prompt.index], "since");
  // llm without a model is refused before it runs.
  codeField(s, "since", "HEAD");
  codeRow(s, "mode");
  s.send("\x1b[D");
  assert.equal(s.app.state.prompt?.codeDraft?.mode, "llm", "← goes back from algo to llm");
  codeRow(s, "run");
  s.send(KEY.enter);
  assert.match(s.app.state.message ?? "", /^code-to-spec: --mode llm needs a model/);
  await esc(s.send);
  assert.equal(s.app.state.records.length, 0);
  // Preview: the CLI's --print byte for byte; the typed file and line are not sent; nothing is written.
  sinceForm(s, { output: "preview" });
  await s.app.idle();
  const record = s.app.state.records.at(-1)!;
  assert.equal(record.params.kind === "code-to-spec" ? [record.params.since, "file" in record.params, "line" in record.params].join(" ") : "", "HEAD false false", "only the chosen source is sent");
  const preview = codeRecord(s.app);
  const printed = cliSince(twin, ["HEAD", "--mode", "algo", "--print"]);
  assert.deepEqual([preview.status, preview.exitCode, printed.status], ["completed", 0, 0]);
  assert.equal(printed.stderr, "keylang: changed and already in flows (review those): application.purchase.buy\n");
  assert.deepEqual(preview.messages.filter((m) => m.level === "warning").map((m) => `keylang: ${m.text}\n`).join(""), printed.stderr);
  const candidate = preview.payload.candidate!;
  assert.equal(candidate.print, printed.stdout);
  assert.deepEqual(preview.payload.described, ["application.purchase.buy"]);
  assert.deepEqual([candidate.since, candidate.file, candidate.name, candidate.target], ["HEAD", null, "changes", "keylang/flows/changes.md"]);
  assert.deepEqual(candidate.flows.map((flow) => flow.trigger), ["application.purchase.refund", "domain.payment.pay"], "the changed fn and the untracked file; not the fn already in a flow");
  assert.deepEqual(workTree(root), before, "a preview writes nothing");
  s.send(KEY.f6);
  let text = s.text();
  assert.match(text, /Code to spec · algo · --since HEAD → keylang\/flows\/changes\.md · preview, nothing written/);
  assert.match(text, /already in flows \(review those\): application\.purchase\.buy/);
  assert.match(text, /── keylang code-to-spec --since HEAD --mode algo --print · stdout ──/);
  await esc(s.send);
  // Hybrid without a model drafts as algo and says so, as the CLI's default mode does.
  sinceForm(s, { mode: "hybrid", output: "preview" });
  await s.app.idle();
  const fallback = codeRecord(s.app);
  const cliHybrid = cliSince(twin, ["HEAD", "--print"]);
  assert.deepEqual([fallback.payload.mode, fallback.payload.candidate!.print], ["algo", cliHybrid.stdout]);
  assert.ok(fallback.payload.fallback !== null);
  assert.equal(fallback.messages.filter((m) => m.level === "warning").map((m) => `keylang: ${m.text}\n`).join(""), cliHybrid.stderr);
  // Proposal: the CLI's in the twin byte for byte; only the proposal is new; MERGE opens.
  sinceForm(s, {});
  await s.app.idle();
  const proposed = codeRecord(s.app);
  const store = ".keylang/proposals/keylang/flows/changes.md";
  assert.deepEqual([proposed.status, proposed.exitCode, proposed.proposals], ["completed", 0, [store]]);
  const cli = cliSince(twin, ["HEAD", "--mode", "algo"]);
  assert.deepEqual([cli.status, cli.stdout], [0, `${store}: proposed \`refund\`, \`pay\` for keylang/flows/changes.md; merge it with \`m\` in \`keylang\`\n`]);
  assert.equal(readFileSync(join(root, store), "utf8"), readFileSync(join(twin, store), "utf8"));
  assert.deepEqual([...workTree(root).keys()].filter((path) => !before.has(path)), [".keylang", ".keylang/proposals", ".keylang/proposals/keylang", ".keylang/proposals/keylang/flows", store].filter((path) => workTree(root).has(path)));
  assert.equal(readFileSync(join(root, "src/application/purchase.ts"), "utf8"), PURCHASE_CHANGED, "the source is never written");
  assert.equal(s.app.state.merge?.path, "keylang/flows/changes.md", s.app.state.message ?? "");
  assert.match(s.app.state.message ?? "", /already in flows \(review those\): application\.purchase\.buy/);
  await esc(s.send);
  // Nothing changed since the ref: a success with no candidate, no proposal, no stats, no directory.
  rmSync(join(root, ".keylang"), { recursive: true, force: true });
  rmSync(join(twin, ".keylang"), { recursive: true, force: true });
  for (const dir of [root, twin]) {
    gitRun(dir, ["add", "."]);
    gitRun(dir, ["commit", "-q", "-m", "changes"]);
  }
  const clean = workTree(root);
  sinceForm(s, {});
  await s.app.idle();
  const noop = codeRecord(s.app);
  assert.deepEqual([noop.status, noop.exitCode, noop.payload.candidate, noop.proposals, noop.written], ["completed", 0, null, [], []]);
  assert.deepEqual(workTree(root), clean, "a no-op writes nothing at all");
  const cliNoop = cliSince(twin, ["HEAD", "--mode", "algo"]);
  assert.deepEqual([cliNoop.status, cliNoop.stdout, cliNoop.stderr], [0, "", "keylang: no fn outside the flows changed since HEAD; nothing proposed\n"]);
  assert.equal(noop.messages.map((m) => `keylang: ${m.text}\n`).join(""), cliNoop.stderr);
  assert.match(s.app.state.message ?? "", /no fn outside the flows changed since HEAD, nothing written/);
  // An earlier ref sees the committed changes again; a bad ref and an option-like ref are code 2 with the CLI's message.
  sinceForm(s, { since: "HEAD~1", output: "preview" });
  await s.app.idle();
  assert.equal(codeRecord(s.app).payload.candidate!.print, cliSince(twin, ["HEAD~1", "--mode", "algo", "--print"]).stdout);
  for (const ref of ["no-such-ref", "--output=leak.txt"]) {
    sinceForm(s, { since: ref, output: "preview" });
    await s.app.idle();
    const failed = s.app.state.records.at(-1)!.result!;
    const cliBad = cliSince(twin, [ref, "--mode", "algo", "--print"]);
    assert.deepEqual([failed.status, failed.exitCode, failed.payload, cliBad.status, cliBad.stdout], ["failed", 2, null, 2, ""]);
    assert.equal(`keylang: ${failed.messages[0]!.text}\n`, cliBad.stderr);
  }
  assert.ok(!existsSync(join(root, "leak.txt")) && !existsSync(join(twin, "leak.txt")));
  assert.deepEqual(workTree(root), clean);
  // Without a repository: code 2 with the CLI's message; the session goes on.
  const bare = checkoutRepo(t);
  const s2 = session(bare, { cols: 200 });
  t.after(() => s2.app.close());
  await s2.app.idle();
  sinceForm(s2, { output: "preview" });
  await s2.app.idle();
  const nogit = s2.app.state.records.at(-1)!.result!;
  const cliNogit = cliSince(bare, ["HEAD", "--mode", "algo", "--print"]);
  assert.deepEqual([nogit.status, nogit.exitCode, nogit.payload, cliNogit.status], ["failed", 2, null, 2]);
  assert.equal(`keylang: ${nogit.messages[0]!.text}\n`, cliNogit.stderr);
  s2.send(KEY.f6);
  text = s2.text();
  assert.match(text, /Code to spec: flows from code .* failed · code 2/);
});

/** The model's flow for the trigger it is asked about: the trigger and one step of the snapshot. */
function flowReply(prompt: string): string {
  const [, name, trigger] = /Draft `# flow ([^`]+)` for the trigger `([^`]+)`/.exec(prompt)!;
  return `\`\`\`markdown\n# flow ${name}\n\n- trigger ${trigger}\n  - step infrastructure.store.save\n\`\`\``;
}

test("tui: a hybrid code-to-spec from the git changes asks the model once per flow and proposes them together; Cancel during the second answer leaves no partial proposal and counts nothing", async (t) => {
  const root = committedCheckout(t, { "src/application/purchase.ts": PURCHASE_TWO });
  withConfig(root, { agent: "anthropic:claude-opus-5" });
  gitRun(root, ["commit", "-q", "-am", "agent"]);
  changeCheckout(root);
  const model = await heldModel(t, flowReply);
  const s = session(root, { cols: 200, rows: 60 });
  t.after(() => s.app.close());
  await s.app.idle();
  const before = workTree(root);
  // With a model the form's default is the CLI's hybrid.
  sinceForm(s, {});
  const record = s.app.state.records.at(-1)!;
  assert.equal(record.params.kind === "code-to-spec" ? record.params.mode : null, "hybrid");
  await model.requested(1);
  assert.match(model.prompts[0]!, /Draft `# flow refund` for the trigger `application\.purchase\.refund`/);
  assert.equal(record.status, "running");
  model.release();
  await model.requested(2);
  assert.match(model.prompts[1]!, /Draft `# flow pay` for the trigger `domain\.payment\.pay`/);
  assert.equal(record.status, "running", "one proposal for both flows, not one per answer");
  assert.ok(!existsSync(join(root, ".keylang/proposals")));
  model.release();
  await s.app.idle();
  const done = codeRecord(s.app);
  assert.deepEqual([done.status, done.exitCode, done.payload.mode, done.payload.model?.agent, done.payload.model?.flows.map((flow) => flow.name)], ["completed", 0, "hybrid", "anthropic:claude-opus-5", ["refund", "pay"]]);
  assert.equal(done.payload.summary, "2 flow(s), 3 agree, 1 llm-only");
  const store = join(root, ".keylang/proposals/keylang/flows/changes.md");
  assert.equal(readFileSync(store, "utf8"), done.payload.candidate!.text);
  assert.match(done.payload.candidate!.text!, /# flow refund\n\n- trigger application\.purchase\.refund <!-- keylang:llm model=anthropic:claude-opus-5 status=agree -->/);
  assert.match(done.payload.candidate!.text!, /# flow pay\n\n- trigger domain\.payment\.pay <!-- keylang:llm [^>]*-->\n {2}- step infrastructure\.store\.save <!-- keylang:llm model=anthropic:claude-opus-5 status=llm-only -->/);
  assert.ok(!existsSync(join(root, "keylang/flows/changes.md")), "a proposal, not the spec");
  assert.deepEqual([draftCounts(root).agree?.proposed, draftCounts(root)["llm-only"]?.proposed], [3, 1], "the model's lines count once the proposal exists");
  s.send(KEY.f6);
  const text = s.text();
  assert.match(text, /Code to spec · hybrid · --since HEAD → keylang\/flows\/changes\.md/);
  assert.match(text, /drafted by anthropic:claude-opus-5, one request per flow/);
  assert.match(text, /the statuses are provenance, not evidence/);
  await esc(s.send);
  await esc(s.send);
  // Again, cancelled while the model answers the second flow: no proposal, no stats, the first answer is not a result.
  rmSync(join(root, ".keylang"), { recursive: true, force: true });
  assert.deepEqual(workTree(root), before);
  sinceForm(s, {});
  const second = s.app.state.records.at(-1)!;
  await model.requested(3);
  model.release();
  await model.requested(4);
  s.send(KEY.ctrlP);
  for (const ch of "cancel") s.send(ch);
  s.send(KEY.enter);
  assert.deepEqual([second.status, second.result?.exitCode, second.result?.payload], ["cancelled", null, null]);
  for (let i = 0; i < 100 && model.dropped() === 0; i++) await sleep(10);
  assert.equal(model.dropped(), 1, "the second request is closed");
  model.release();
  await s.app.idle();
  assert.equal(second.status, "cancelled", "a late answer changes nothing");
  assert.deepEqual(workTree(root), before, "no proposal, no stats");
});

test("code-to-spec operation: a Cancel between two flows asks no second request; a source changed while the model answers is refused with nothing written; llm without a model is 2", async (t) => {
  const root = committedCheckout(t, { "src/application/purchase.ts": PURCHASE_TWO });
  withConfig(root, { agent: "anthropic:claude-opus-5" });
  gitRun(root, ["commit", "-q", "-am", "agent"]);
  changeCheckout(root);
  const model = await heldModel(t, flowReply);
  const before = workTree(root);
  const request = { kind: "code-to-spec", root, since: "HEAD", output: "proposal", mode: "llm" } as const;
  // Abort once the first answer is in, before the second flow is asked.
  const controller = new AbortController();
  const between = runOperation(request, {
    signal: controller.signal,
    onProgress: ({ text }) => {
      if (/flow 2 of 2/.test(text)) controller.abort();
    },
  });
  await model.requested(1);
  model.release();
  const cancelled = await between;
  assert.deepEqual([cancelled.status, cancelled.exitCode, cancelled.payload, cancelled.proposals], ["cancelled", null, null, []]);
  await sleep(30);
  assert.equal(model.prompts.length, 1, "no request for the second flow");
  assert.deepEqual(workTree(root), before);
  // The source changes on disk while the model answers: the candidate is not current, nothing is written or counted.
  const stale = runOperation(request, {});
  await model.requested(2);
  writeFileSync(join(root, "src/domain/payment.ts"), "export function pay(): void {\n  return;\n}\n");
  model.release();
  await model.requested(3);
  model.release();
  const refused = await stale;
  assert.deepEqual([refused.status, refused.exitCode, refused.proposals], ["failed", 1, []]);
  assert.ok(refused.messages.some((m) => m.level === "error" && m.text === "src/domain/payment.ts: changed on disk while the draft was computed"), JSON.stringify(refused.messages));
  assert.ok(!existsSync(join(root, ".keylang")), "no proposal, no stats");
  // llm without a model: 2 with the CLI's message, before any request.
  const config = join(root, "keylang.json");
  const { agent: _agent, ...withoutAgent } = JSON.parse(readFileSync(config, "utf8")) as Record<string, unknown>;
  writeFileSync(config, JSON.stringify(withoutAgent));
  const noModel = await runOperation(request, {});
  assert.deepEqual([noModel.status, noModel.exitCode], ["failed", 2]);
  assert.match(noModel.messages.at(-1)!.text, /^code-to-spec --mode llm: /);
  assert.equal(model.prompts.length, 3);
});

// ---------- spec-to-code: the template for a planned fn (ticket 28) ----------

/** A planned fn of a new module with two tests in new files and one in Python, which the template leaves to the person. */
const REFUND_PLAN = [
  "# flow refund",
  "",
  "- planned fn application.refund.refund (order: Order) → Order",
  "- trigger application.refund.refund",
  '  - test tests/refund.test.ts "refund returns the order"',
  '  - test tests/refund-audit.test.ts "refund is audited"',
  '  - test tests/refund.py "refund in python"',
  "",
].join("\n");

/** Moves the spec-to-code form's selection to the row `id`. */
function specRow(s: ReturnType<typeof session>, id: string): void {
  const prompt = s.app.state.prompt!;
  for (let i = 0; i < 20 && prompt.ids?.[prompt.index] !== id; i++) s.send(KEY.down);
  assert.equal(prompt.ids?.[prompt.index], id, JSON.stringify(prompt.ids));
}

/** The palette's spec-to-code form with the given fields (an absent one keeps its prefill); Enter on the run row. */
function specForm(s: ReturnType<typeof session>, fields: { id?: string; into?: string; mode?: "algo" | "llm"; output?: "proposal" | "preview" }): void {
  s.send(KEY.ctrlP);
  for (const ch of "spec to code") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.prompt?.kind, "spec-to-code", s.app.state.message ?? "");
  const form = s.app.state.prompt!.specCode!;
  for (const field of ["id", "into"] as const) {
    const text = fields[field];
    if (text === undefined) continue;
    specRow(s, field);
    for (const _ of form[field]) s.send("\x7f");
    for (const ch of text) s.send(ch);
  }
  if ((fields.mode ?? "algo") !== form.mode) {
    specRow(s, "mode");
    s.send(KEY.right);
  }
  if ((fields.output ?? "proposal") !== form.output) {
    specRow(s, "output");
    s.send(KEY.right);
  }
  specRow(s, "run");
  s.send(KEY.enter);
}

type SpecCodeResult = Extract<OperationResult, { kind: "spec-to-code" }> & { payload: NonNullable<Extract<OperationResult, { kind: "spec-to-code" }>["payload"]> };

function specRecord(app: App): SpecCodeResult {
  const result = app.state.records.at(-1)?.result;
  assert.ok(result?.kind === "spec-to-code" && result.payload !== null, JSON.stringify(result?.messages));
  return result as SpecCodeResult;
}

function cliSpec(root: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  return spawnSync(process.execPath, [BIN, "spec-to-code", ...args], { cwd: root, encoding: "utf8" });
}

const REFUND_STORES = [".keylang/proposals/src/application/refund.ts", ".keylang/proposals/tests/refund-audit.test.ts", ".keylang/proposals/tests/refund.test.ts"];

test("tui: spec-to-code proposes the CLI's code and each test as separate code proposals; the preview writes nothing; each merges on its own and none makes the plan implemented", async (t) => {
  const specs = { "keylang/flows/refund.md": REFUND_PLAN };
  const root = checkoutRepo(t, specs);
  const twin = checkoutRepo(t, specs);
  const s = session(root, { cols: 200, rows: 60 });
  t.after(() => s.app.close());
  await s.app.idle();
  const before = treeBytes(root);
  const idVerdicts = (): string[] => (s.app.state.analysis?.verdicts ?? []).filter((v) => v.area === "application.refund.refund" && v.criterion === "ID").map((v) => v.verdict);
  const planned = idVerdicts();
  assert.deepEqual(planned, ["unverified"]);
  // The form lists the planned fns no code implements; Enter takes one and moves to the target.
  s.send(KEY.ctrlP);
  for (const ch of "spec to code") s.send(ch);
  s.send(KEY.enter);
  const prompt = s.app.state.prompt!;
  assert.equal(prompt.kind, "spec-to-code", s.app.state.message ?? "");
  assert.deepEqual(prompt.specCode, { id: "", into: "", mode: "algo", output: "proposal" }, "the offline template unless llm is chosen");
  assert.equal(promptNote(s.app), "type a planned fn · ↓ picks one (1 planned, not implemented)");
  assert.deepEqual(prompt.ids?.filter((id) => id.startsWith("planned:")), ["planned:application.refund.refund"]);
  for (const ch of "refu") s.send(ch);
  s.send(KEY.down);
  assert.equal(promptNote(s.app), "Enter takes application.refund.refund");
  s.send(KEY.enter);
  assert.equal(prompt.specCode?.id, "application.refund.refund");
  assert.equal(prompt.ids?.[prompt.index], "into");
  assert.match(prompt.items.join("\n"), /target: {2}▏ {2}\(default src\/application\/refund\.ts\)/);
  assert.equal(promptNote(s.app), "src/application/refund.ts is a new file");
  assert.match(s.text(), /spec to code · template/);
  await esc(s.send);
  assert.deepEqual(treeBytes(root), before, "Esc writes nothing");

  // Preview: the CLI's --print stdout and its test notes; no proposal, no stats, no directory.
  specForm(s, { id: "application.refund.refund", output: "preview" });
  await s.app.idle();
  const preview = specRecord(s.app);
  assert.deepEqual([preview.status, preview.exitCode, preview.written, preview.proposals, preview.payload.proposals], ["completed", 0, [], [], []]);
  const printed = cliSpec(twin, ["application.refund.refund", "--print"]);
  assert.equal(printed.status, 0, printed.stderr);
  const candidate = preview.payload.candidate;
  assert.equal(candidate.print, printed.stdout);
  assert.deepEqual(
    candidate.testNotes.map((note) => `keylang: ${note}`),
    printed.stderr.split("\n").filter((line) => line.startsWith("keylang: test ")),
  );
  assert.match(candidate.testNotes.join("\n"), /test tests\/refund\.py "refund in python": write it by hand/);
  assert.deepEqual(
    candidate.targets.map((target) => [target.role, target.file, target.before, target.pending]),
    [
      ["code", "src/application/refund.ts", null, null],
      ["test", "tests/refund-audit.test.ts", null, null],
      ["test", "tests/refund.test.ts", null, null],
    ],
  );
  assert.match(candidate.targets[0]!.after, /^export function refund\(order: Order\): Order \{\n {2}throw new Error\("not implemented: application\.refund\.refund"\);\n\}\n$/);
  assert.match(candidate.targets[2]!.after, /test\("refund returns the order"/);
  assert.match(candidate.targets[1]!.diff, /^tests\/refund-audit\.test\.ts \(new file\)\n@@ line 1 @@\n\+import assert/);
  assert.ok(candidate.verdicts.some((v) => v.area === "application.refund.refund" && v.criterion === "ID" && v.verdict === "ok"), "the candidate is checked as code");
  assert.deepEqual(treeBytes(root), before, "a preview writes no proposal, no stats, no directory");
  assert.deepEqual(idVerdicts(), planned, "the workspace's verdict is not the candidate's");
  s.send(KEY.f6);
  let text = s.text();
  assert.match(text, /Spec to code · template · application\.refund\.refund → 3 file\(s\) · preview, nothing written/);
  assert.match(text, /code src\/application\/refund\.ts \+ 2 test file\(s\), preview, nothing written · code 0/);
  assert.match(text, /code src\/application\/refund\.ts \(new file\) · previewed/);
  assert.match(text, /test tests\/refund-audit\.test\.ts \(new file\) · previewed/);
  assert.match(text, /a preview of check; not the workspace's verdict, and not the feature done/);
  assert.match(text, /── keylang spec-to-code application\.refund\.refund --print · stdout ──/);
  await esc(s.send);

  // Proposal: three separate code proposals, the CLI's bytes; no source or test file; MERGE opens on the code.
  specForm(s, { id: "application.refund.refund" });
  await s.app.idle();
  const proposed = specRecord(s.app);
  assert.deepEqual([proposed.status, proposed.exitCode, proposed.written, proposed.proposals, proposed.payload.proposals], ["completed", 0, [], REFUND_STORES, REFUND_STORES]);
  const cli = cliSpec(twin, ["application.refund.refund"]);
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stderr, /keylang: proposed \.keylang\/proposals\/src\/application\/refund\.ts, \.keylang\/proposals\/tests\/refund-audit\.test\.ts, \.keylang\/proposals\/tests\/refund\.test\.ts; merge them hunk by hunk/);
  for (const [i, store] of REFUND_STORES.entries()) {
    assert.equal(readFileSync(join(root, store), "utf8"), readFileSync(join(twin, store), "utf8"), `${store}: the CLI's bytes`);
    assert.equal(readFileSync(join(root, store), "utf8"), candidate.targets[i]!.after);
  }
  assert.deepEqual([...treeBytes(root).keys()].filter((path) => !before.has(path)).sort(), [...REFUND_STORES].sort(), "only the proposals, no stats");
  assert.equal(s.app.state.mode, "merge", s.app.state.message ?? "");
  assert.equal(s.app.state.merge?.path, "src/application/refund.ts");
  assert.match(s.app.state.message ?? "", /then m or Proposals: tests\/refund-audit\.test\.ts, tests\/refund\.test\.ts · run check after: the stub is not the feature done/);
  await esc(s.send);
  assert.ok(!existsSync(join(root, "src/application/refund.ts")) && !existsSync(join(root, "tests")), "before MERGE no target is written");
  await s.app.idle();
  assert.deepEqual(idVerdicts(), planned, "a proposal makes no plan implemented");
  s.send(KEY.f6);
  text = s.text();
  assert.match(text, /code src\/application\/refund\.ts \+ 2 test file\(s\) proposed · code 0/);
  assert.match(text, /test tests\/refund\.test\.ts \(new file\) · proposed as \.keylang\/proposals\/tests\/refund\.test\.ts/);
  assert.match(text, /Enter pick a proposal/);
  // Enter: the proposals list on the code file; any test is reachable and merges alone.
  s.send(KEY.enter);
  assert.equal(s.app.state.prompt?.kind, "proposal");
  assert.equal(s.app.state.prompt?.ids?.[s.app.state.prompt.index], "src/application/refund.ts");
  specRowOf(s, "tests/refund.test.ts");
  s.send(KEY.enter);
  assert.equal(s.app.state.merge?.path, "tests/refund.test.ts");
  s.send("a");
  s.send("w");
  await s.app.idle();
  assert.equal(readFileSync(join(root, "tests/refund.test.ts"), "utf8"), candidate.targets[2]!.after);
  assert.ok(!existsSync(join(root, "src/application/refund.ts")) && !existsSync(join(root, "tests/refund-audit.test.ts")), "the other targets are untouched");
  assert.ok(existsSync(join(root, REFUND_STORES[0]!)) && existsSync(join(root, REFUND_STORES[1]!)), "their proposals still wait");
});

/** Moves the proposals list's selection to `path`. */
function specRowOf(s: ReturnType<typeof session>, path: string): void {
  const prompt = s.app.state.prompt!;
  for (let i = 0; i < 20 && prompt.ids?.[prompt.index] !== path; i++) s.send(KEY.down);
  assert.equal(prompt.ids?.[prompt.index], path, JSON.stringify(prompt.ids));
}

test("tui: spec-to-code refuses an implemented ID with its place, a file of another module and a waiting proposal before the run; a test proposal waiting or a test file created during the work writes nothing; an I/O failure names the proposals written; g on a planned gap opens the form", async (t) => {
  const root = checkoutRepo(t, { "keylang/flows/refund.md": REFUND_PLAN, "keylang/features/later.md": FEATURES["keylang/features/refund.md"]! });
  const hook: { during: (() => void) | null } = { during: null };
  const operations = (request: OperationRequest, context: OperationContext): Promise<OperationResult> =>
    runOperation(request, {
      ...context,
      beforeCommit: async (plan) => {
        hook.during?.();
        return context.beforeCommit?.(plan);
      },
    });
  const s = session(root, { cols: 200, rows: 60, operations });
  t.after(() => s.app.close());
  await s.app.idle();
  const before = treeBytes(root);
  // An implemented ID: the CLI's reason with the place of the code, on the id row; nothing runs.
  specForm(s, { id: "application.purchase.buy" });
  let prompt = s.app.state.prompt!;
  assert.deepEqual([prompt.kind, prompt.specCode?.id, prompt.ids?.[prompt.index]], ["spec-to-code", "application.purchase.buy", "id"]);
  const implemented = cliSpec(root, ["application.purchase.buy"]);
  assert.equal(implemented.status, 2);
  assert.equal(implemented.stderr, `keylang: ${(s.app.state.message ?? "").replace(/^spec-to-code: /, "")}\n`);
  assert.match(s.app.state.message ?? "", /`application\.purchase\.buy` is already implemented \(src\/application\/purchase\.ts:3\)/);
  await esc(s.send);
  // A file of another module, and one keylang does not read: the CLI's reasons, on the target row.
  for (const into of ["src/domain/order.ts", "src/application/refund.txt"]) {
    specForm(s, { id: "application.refund.refund", into });
    prompt = s.app.state.prompt!;
    assert.deepEqual([prompt.kind, prompt.ids?.[prompt.index]], ["spec-to-code", "into"], into);
    const cli = cliSpec(root, ["application.refund.refund", "--into", into]);
    assert.equal(cli.status, 2);
    assert.equal(cli.stderr, `keylang: ${(s.app.state.message ?? "").replace(/^spec-to-code: /, "")}\n`);
    await esc(s.send);
  }
  assert.equal(s.app.state.records.length, 0);
  assert.deepEqual(treeBytes(root), before, "no write for a refused ID or target");
  // A proposal waiting for the code file: refused by the form.
  const codeStore = join(root, REFUND_STORES[0]!);
  mkdirSync(dirname(codeStore), { recursive: true });
  writeFileSync(codeStore, "someone's code\n");
  specForm(s, { id: "application.refund.refund" });
  assert.equal(s.app.state.message, "spec-to-code: a proposal for src/application/refund.ts is waiting: merge it first (m, or Proposals)");
  await esc(s.send);
  rmSync(join(root, ".keylang"), { recursive: true, force: true });
  // A proposal waiting for one test: the operation refuses the whole set, code 1; nothing is written, the waiting one stays.
  const testStore = join(root, REFUND_STORES[2]!);
  mkdirSync(dirname(testStore), { recursive: true });
  writeFileSync(testStore, "someone's test\n");
  specForm(s, { id: "application.refund.refund" });
  await s.app.idle();
  let result = specRecord(s.app);
  assert.deepEqual([result.status, result.exitCode, result.proposals, result.payload.refused], ["failed", 1, [], [`${REFUND_STORES[2]}: a proposal for tests/refund.test.ts is waiting; merge it (m) or remove it before a new candidate`]]);
  assert.equal(readFileSync(testStore, "utf8"), "someone's test\n");
  assert.ok(!existsSync(codeStore), "no proposal of the set is written");
  // The CLI replaces its own, as before.
  assert.equal(cliSpec(root, ["application.refund.refund"]).status, 0);
  assert.match(readFileSync(testStore, "utf8"), /refund returns the order/);
  rmSync(join(root, ".keylang"), { recursive: true, force: true });
  // A test file created while the candidate was prepared: refused, nothing written, the new file kept.
  hook.during = () => {
    mkdirSync(join(root, "tests"), { recursive: true });
    writeFileSync(join(root, "tests/refund.test.ts"), "// mine\n");
  };
  specForm(s, { id: "application.refund.refund" });
  await s.app.idle();
  result = specRecord(s.app);
  assert.deepEqual([result.status, result.exitCode, result.proposals], ["failed", 1, []]);
  assert.deepEqual(result.payload.refused, ["tests/refund.test.ts: created on disk while the proposal was prepared; nothing written"]);
  assert.ok(!existsSync(join(root, ".keylang/proposals")));
  assert.equal(readFileSync(join(root, "tests/refund.test.ts"), "utf8"), "// mine\n");
  rmSync(join(root, "tests"), { recursive: true, force: true });
  // A store directory that cannot be written: the code proposal is written, the failure and what was written are named.
  if (process.getuid?.() !== 0) {
    hook.during = () => {
      mkdirSync(join(root, ".keylang/proposals/tests"), { recursive: true });
      chmodSync(join(root, ".keylang/proposals/tests"), 0o555);
    };
    t.after(() => {
      if (existsSync(join(root, ".keylang/proposals/tests"))) chmodSync(join(root, ".keylang/proposals/tests"), 0o755);
    });
    specForm(s, { id: "application.refund.refund" });
    await s.app.idle();
    result = specRecord(s.app);
    assert.deepEqual([result.status, result.exitCode, result.proposals, result.payload.proposals], ["failed", 2, [REFUND_STORES[0]], [REFUND_STORES[0]]]);
    assert.ok(result.payload.error !== null);
    assert.equal(result.messages.at(-1)!.text, `proposed before it stopped: ${REFUND_STORES[0]}`);
    assert.match(s.app.state.message ?? "", /spec-to-code: 1 proposal\(s\) wait: src\/application\/refund\.ts · m, Proposals or Enter in F6 opens them · failed: only these were proposed/);
    s.send(KEY.f6);
    assert.match(s.text(), /failed after 1 of 3 proposal\(s\) · code 2/);
    await esc(s.send);
    chmodSync(join(root, ".keylang/proposals/tests"), 0o755);
    hook.during = null;
  }
  rmSync(join(root, ".keylang"), { recursive: true, force: true });
  // A planned gap of a feature report: g opens the form with its ID; a proposal does not make the feature done.
  featureForm(s.send);
  submitSlug(s.app, s.send, "later");
  await s.app.idle();
  s.send(KEY.f6);
  s.send(KEY.tab);
  assert.match(s.app.state.message ?? "", /planned application\.purchase\.refund: .* · g: spec-to-code/);
  s.send("g");
  assert.deepEqual(s.app.state.prompt?.specCode, { id: "application.purchase.refund", into: "", mode: "algo", output: "proposal" });
  assert.equal(promptNote(s.app), "application.purchase.refund: planned fn, its code goes to src/application/purchase.ts");
  specRow(s, "run");
  s.send(KEY.enter);
  await s.app.idle();
  result = specRecord(s.app);
  assert.deepEqual([result.status, result.proposals], ["completed", [".keylang/proposals/src/application/purchase.ts"]]);
  assert.match(readFileSync(join(root, ".keylang/proposals/src/application/purchase.ts"), "utf8"), /^import \{ create \}[\s\S]*\n\nexport function refund\(\): void \{\n {2}throw new Error/);
  await esc(s.send);
  featureForm(s.send);
  submitSlug(s.app, s.send, "later");
  await s.app.idle();
  const feature = s.app.state.records.at(-1)!.result!;
  assert.ok(feature.kind === "feature" && feature.payload !== null && !feature.payload.report.done && feature.exitCode === 1, "the feature is not done by a candidate");
});

// ---------- spec-to-code with the model (ticket 29) ----------

/** The model's answers for REFUND_PLAN: the function for the code request, a test file with the declared names for each test request. */
function refundReply(prompt: string): string {
  if (/^Planned: `application\.refund\.refund`/.test(prompt)) return "```ts\nexport function refund(order: Order): Order {\n  return order;\n}\n```";
  const names = [...prompt.matchAll(/- flow refund: ("[^"]+")/g)].map((m) => m[1]!);
  const cases = names.map((name) => `test(${name}, () => {\n  assert.equal(typeof refund, "function");\n});\n`).join("\n");
  return `\`\`\`ts\nimport assert from "node:assert/strict";\nimport { test } from "node:test";\nimport { refund } from "../src/application/refund.ts";\n\n${cases}\`\`\``;
}

/** `keylang spec-to-code` run without blocking this process, so the held model in it can answer. */
function cliSpecAsync(root: string, args: string[]): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, "spec-to-code", ...args], { cwd: root });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

test("tui: spec-to-code with the model shows the CLI's llm candidate with its provenance; the proposal lands for the target it started with without taking the focus; nothing is accepted and the plan stays planned", async (t) => {
  // A feature whose flow reaches the planned fn: its status is the code's, never the candidate's.
  const specs = { "keylang/flows/refund.md": REFUND_PLAN, "keylang/features/refunds.md": "# flow refunds\n\n- trigger application.refund.refund\n" };
  const root = checkoutRepo(t, specs);
  const twin = checkoutRepo(t, specs);
  withConfig(root, { agent: "anthropic:claude-opus-5" });
  withConfig(twin, { agent: "anthropic:claude-opus-5" });
  const model = await heldModel(t, refundReply);
  const s = session(root, { cols: 200, rows: 60 });
  t.after(() => s.app.close());
  await s.app.idle();
  const before = treeBytes(root);
  const idVerdicts = (): string[] => (s.app.state.analysis?.verdicts ?? []).filter((v) => v.area === "application.refund.refund" && v.criterion === "ID").map((v) => v.verdict);
  const planned = idVerdicts();
  assert.ok(planned.length > 0 && planned.every((verdict) => verdict === "unverified"), JSON.stringify(planned));
  const featureReport = async (): Promise<string> => {
    const feature = await runOperation({ kind: "feature", root, slug: "refunds" });
    assert.ok(feature.payload !== null, JSON.stringify(feature.messages));
    return JSON.stringify([feature.exitCode, feature.payload.report]);
  };
  const featureBefore = await featureReport();
  // The mode row: algo by default even with a model; llm names the agent and what it writes.
  s.send(KEY.ctrlP);
  for (const ch of "spec to code") s.send(ch);
  s.send(KEY.enter);
  for (const ch of "application.refund.refund") s.send(ch);
  specRow(s, "mode");
  assert.equal(promptNote(s.app), "algo: the template, offline; no model");
  s.send(KEY.right);
  assert.equal(s.app.state.prompt?.specCode?.mode, "llm");
  assert.equal(promptNote(s.app), "anthropic:claude-opus-5 writes the code, then each new test file: one request each; its credentials are checked before the first");
  assert.match(s.text(), /spec to code · llm/);
  await esc(s.send);
  assert.equal(model.prompts.length, 0, "the form asks nothing");

  // Preview: three requests (the code, then each new TS test), the CLI's --mode llm --print bytes; nothing written.
  specForm(s, { id: "application.refund.refund", mode: "llm", output: "preview" });
  const previewRecord = s.app.state.records.at(-1)!;
  assert.equal(previewRecord.params.kind === "spec-to-code" ? previewRecord.params.mode : null, "llm");
  await model.requested(1);
  assert.match(model.prompts[0]!, /^Planned: `application\.refund\.refund` \(order: Order\) → Order/);
  assert.equal(previewRecord.status, "running");
  for (let i = 0; i < 100 && !/asking anthropic:claude-opus-5/.test(previewRecord.progress ?? ""); i++) await sleep(10);
  assert.match(previewRecord.progress ?? "", /asking anthropic:claude-opus-5/, "the progress of the same operation names the model");
  const preview = await answerAll(model, s.app.idle().then(() => specRecord(s.app)));
  assert.deepEqual([preview.status, preview.exitCode, preview.written, preview.proposals], ["completed", 0, [], []]);
  assert.deepEqual([preview.payload.mode, preview.payload.model], ["llm", { agent: "anthropic:claude-opus-5", requests: 3 }]);
  assert.match(model.prompts[1]!, /^Test file: tests\/refund-audit\.test\.ts/);
  assert.match(model.prompts[2]!, /^Test file: tests\/refund\.test\.ts/);
  const candidate = preview.payload.candidate;
  assert.equal(candidate.targets[0]!.after, "export function refund(order: Order): Order {\n  return order;\n}\n");
  assert.ok(candidate.verdicts.some((v) => v.area === "application.refund.refund" && v.criterion === "ID" && v.verdict === "ok"), "the model's code is checked as code");
  assert.deepEqual(treeBytes(root), before, "a preview writes nothing");
  const printed = await answerAll(model, cliSpecAsync(twin, ["application.refund.refund", "--mode", "llm", "--print"]));
  assert.equal(printed.status, 0, printed.stderr);
  assert.equal(candidate.print, printed.stdout, "the CLI's candidate byte for byte");
  assert.deepEqual(
    candidate.testNotes.map((note) => `keylang: ${note}`),
    printed.stderr.split("\n").filter((line) => line.startsWith("keylang: test ")),
  );
  s.send(KEY.f6);
  let text = s.text();
  assert.match(text, /Spec to code · llm · application\.refund\.refund → 3 file\(s\) · preview, nothing written/);
  assert.match(text, /written by anthropic:claude-opus-5 in 3 request\(s\): provenance, not evidence — review each hunk in MERGE; nothing is accepted for you/);
  assert.match(text, /── keylang spec-to-code application\.refund\.refund --mode llm --print · stdout ──/);
  await esc(s.send);

  // Proposal: another file is opened while the model answers; the proposals are the CLI's, MERGE does not take the focus.
  const asked = model.prompts.length;
  specForm(s, { id: "application.refund.refund", mode: "llm" });
  await model.requested(asked + 1);
  assert.notEqual(s.app.state.current, "keylang/flows/refund.md");
  s.send("\x1b[12~");
  const other = locate(s.lines(), "keylang/flows/refund");
  s.send(click(other.x + 1, other.y));
  assert.equal(s.app.state.current, "keylang/flows/refund.md");
  const proposed = await answerAll(model, s.app.idle().then(() => specRecord(s.app)));
  assert.deepEqual([proposed.status, proposed.exitCode, proposed.written, proposed.proposals], ["completed", 0, [], REFUND_STORES]);
  assert.equal(s.app.state.current, "keylang/flows/refund.md", "the focus is not taken");
  assert.notEqual(s.app.state.mode, "merge", "an unrelated navigation only drops the auto-open");
  assert.match(s.app.state.message ?? "", /spec-to-code: 3 proposal\(s\) wait: src\/application\/refund\.ts, tests\/refund-audit\.test\.ts, tests\/refund\.test\.ts/);
  const cli = await answerAll(model, cliSpecAsync(twin, ["application.refund.refund", "--mode", "llm"]));
  assert.equal(cli.status, 0, cli.stderr);
  for (const store of REFUND_STORES) assert.equal(readFileSync(join(root, store), "utf8"), readFileSync(join(twin, store), "utf8"), `${store}: the CLI's bytes`);
  assert.deepEqual([...treeBytes(root).keys()].filter((path) => !before.has(path)).sort(), [...REFUND_STORES].sort(), "only the proposals: no source, test, spec or stats");
  await s.app.idle();
  assert.deepEqual(idVerdicts(), planned, "the model's candidate does not make the plan implemented");
  assert.equal(await featureReport(), featureBefore, "nor changes the feature's status");
  assert.ok(featureBefore.includes("application.refund.refund"), featureBefore);
  // The same MERGE and proposals list: the code merges on its own; the tests wait.
  s.send(KEY.f6);
  s.send(KEY.enter);
  assert.equal(s.app.state.prompt?.kind, "proposal");
  s.send(KEY.enter);
  assert.equal(s.app.state.merge?.path, "src/application/refund.ts");
  s.send("a");
  s.send("w");
  await s.app.idle();
  assert.equal(readFileSync(join(root, "src/application/refund.ts"), "utf8"), candidate.targets[0]!.after);
  assert.ok(!existsSync(join(root, "tests/refund.test.ts")) && existsSync(join(root, REFUND_STORES[2]!)), "the tests still wait as proposals");
});

test("tui: spec-to-code llm — Cancel, an empty or wrong answer and a timeout write nothing; a spec changed during the answer refuses the proposal and keeps the new bytes; an edit makes a preview outdated; no model is refused before any request", async (t) => {
  const root = checkoutRepo(t, { "keylang/flows/refund.md": REFUND_PLAN });
  withConfig(root, { agent: "anthropic:claude-opus-5" });
  let reply: (prompt: string) => string = refundReply;
  const model = await heldModel(t, (prompt) => reply(prompt));
  const s = session(root, { cols: 200, rows: 60 });
  t.after(() => s.app.close());
  await s.app.idle();
  const before = treeBytes(root);
  // Cancel from the palette while the second request is answered: cancelled, no payload, the request closed, nothing written.
  specForm(s, { id: "application.refund.refund", mode: "llm" });
  const cancelled = s.app.state.records.at(-1)!;
  await model.requested(1);
  model.release();
  await model.requested(2);
  s.send(KEY.ctrlP);
  for (const ch of "cancel") s.send(ch);
  s.send(KEY.enter);
  assert.deepEqual([cancelled.status, cancelled.result?.exitCode, cancelled.result?.payload], ["cancelled", null, null]);
  for (let i = 0; i < 100 && model.dropped() === 0; i++) await sleep(10);
  assert.equal(model.dropped(), 1, "the request is closed");
  model.release();
  await s.app.idle();
  assert.equal(cancelled.status, "cancelled", "a late answer changes nothing");
  assert.deepEqual(treeBytes(root), before);

  // An edit while a preview is answered: the preview is outdated, the edited text kept.
  specForm(s, { id: "application.refund.refund", mode: "llm", output: "preview" });
  const preview = s.app.state.records.at(-1)!;
  await model.requested(3);
  assert.equal(s.app.state.current, FLOW_PATH);
  s.send("i");
  s.send("x");
  await esc(s.send);
  await answerAll(model, s.app.idle());
  assert.equal(preview.status, "completed");
  assert.equal(preview.outdated, "inputs edited since this run");
  assert.notEqual(s.app.state.buffers.get(FLOW_PATH)!.text, CHECKOUT_FLOW, "the edit is kept");
  s.send(KEY.f6);
  assert.match(s.text(), /outdated: inputs edited since this run · Enter reruns/);
  await esc(s.send);

  // The operation itself, as the session runs it: an empty answer and a function of another name are 2 with nothing written.
  const request = { kind: "spec-to-code", root, id: "application.refund.refund", output: "proposal", mode: "llm" } as const;
  for (const [answer, message] of [
    ["", /^claude-opus-5 answered without text/],
    ["```ts\n```", /^the model did not return a function named `refund`; nothing written$/],
    ["```ts\nexport function reimburse(): void {}\n```", /^the model did not return a function named `refund`; nothing written$/],
  ] as const) {
    reply = () => answer;
    const failed = await answerAll(model, runOperation(request, {}));
    assert.deepEqual([failed.status, failed.exitCode, failed.payload, failed.proposals], ["failed", 2, null, []]);
    assert.match(failed.messages.at(-1)!.text, message);
  }
  reply = refundReply;
  assert.deepEqual(treeBytes(root), before, "no proposal for a bad answer");
  // A spec changed on disk during the answer: refused (1), the new bytes kept, no proposal.
  const asked = model.prompts.length;
  const stale = runOperation(request, {});
  await model.requested(asked + 1);
  const edited = `${REFUND_PLAN}\n<!-- edited meanwhile -->\n`;
  writeFileSync(join(root, "keylang/flows/refund.md"), edited);
  const refused = await answerAll(model, stale);
  assert.deepEqual([refused.status, refused.exitCode, refused.proposals], ["failed", 1, []]);
  assert.ok(refused.payload?.refused.includes("keylang/flows/refund.md: changed on disk while the candidate was computed"), JSON.stringify(refused.messages));
  assert.equal(readFileSync(join(root, "keylang/flows/refund.md"), "utf8"), edited);
  assert.ok(!existsSync(join(root, ".keylang/proposals")));
  writeFileSync(join(root, "keylang/flows/refund.md"), REFUND_PLAN);
  // A timeout is 2 with the provider's message.
  process.env.KEYLANG_LLM_TIMEOUT_MS = "200";
  t.after(() => delete process.env.KEYLANG_LLM_TIMEOUT_MS);
  const timedOut = await runOperation(request, {});
  delete process.env.KEYLANG_LLM_TIMEOUT_MS;
  assert.deepEqual([timedOut.status, timedOut.exitCode, timedOut.payload], ["failed", 2, null]);
  assert.match(timedOut.messages.at(-1)!.text, /^anthropic: no answer within 200 ms \(KEYLANG_LLM_TIMEOUT_MS\)$/);
  // A proposal waiting for the code file: refused before the model is asked.
  const waiting = join(root, REFUND_STORES[0]!);
  mkdirSync(dirname(waiting), { recursive: true });
  writeFileSync(waiting, "someone's code\n");
  const count = model.prompts.length;
  const pending = await runOperation(request, {});
  assert.deepEqual([pending.status, pending.exitCode, pending.proposals], ["failed", 1, []]);
  assert.equal(pending.messages[0]!.text, `${REFUND_STORES[0]}: a proposal for src/application/refund.ts is waiting; merge it (m) or remove it before a new candidate`);
  assert.equal(model.prompts.length, count, "no request");
  assert.equal(readFileSync(waiting, "utf8"), "someone's code\n");
  rmSync(join(root, ".keylang"), { recursive: true, force: true });
  // Credentials missing: 2 with the CLI's message, before any request.
  const key = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  const noKey = await runOperation(request, {});
  process.env.ANTHROPIC_API_KEY = key;
  assert.deepEqual([noKey.status, noKey.exitCode], ["failed", 2]);
  assert.match(noKey.messages.at(-1)!.text, /^spec-to-code --mode llm: /);
  assert.equal(model.prompts.length, count);
  // Without `agent` the form refuses llm on its mode row; algo still runs offline.
  const { agent: _agent, ...withoutAgent } = JSON.parse(readFileSync(join(root, "keylang.json"), "utf8")) as Record<string, unknown>;
  writeFileSync(join(root, "keylang.json"), `${JSON.stringify(withoutAgent, null, 2)}\n`);
  await s.app.idle();
  const offline = session(root, { cols: 200, rows: 60 });
  t.after(() => offline.app.close());
  await offline.app.idle();
  specForm(offline, { id: "application.refund.refund", mode: "llm" });
  assert.deepEqual([offline.app.state.prompt?.kind, offline.app.state.prompt?.ids?.[offline.app.state.prompt.index]], ["spec-to-code", "mode"]);
  assert.equal(offline.app.state.message, "spec-to-code: --mode llm needs a model: set `agent` in keylang.json (algo writes the template without one)");
  await esc(offline.send);
  assert.equal(offline.app.state.records.length, 0);
  specForm(offline, { id: "application.refund.refund", output: "preview" });
  await offline.app.idle();
  const algo = specRecord(offline.app);
  assert.deepEqual([algo.status, algo.payload.mode, algo.payload.model], ["completed", "algo", null]);
  assert.equal(model.prompts.length, count, "the template asks no model");
});

// ---------- spec-to-code: applying the entire candidate (ticket 30) ----------

const REFUND_FILES = ["src/application/refund.ts", "tests/refund-audit.test.ts", "tests/refund.test.ts"];

type ApplyCodeResult = Extract<OperationResult, { kind: "apply-code" }> & { payload: NonNullable<Extract<OperationResult, { kind: "apply-code" }>["payload"]> };

function applyRecord(app: App): ApplyCodeResult {
  const result = app.state.records.at(-1)?.result;
  assert.ok(result?.kind === "apply-code" && result.payload !== null, JSON.stringify(result?.messages));
  return result as ApplyCodeResult;
}

test("tui: a spec-to-code candidate is applied only by a in F6 after a step naming every file — the CLI's --apply bytes, no proposal, new directories — for the template and the model alike; the old candidate is refused after it", async (t) => {
  const specs = { "keylang/flows/refund.md": REFUND_PLAN };
  const root = checkoutRepo(t, specs);
  const twin = checkoutRepo(t, specs);
  const s = session(root, { cols: 200, rows: 60 });
  t.after(() => s.app.close());
  await s.app.idle();
  const before = treeBytes(root);
  specForm(s, { id: "application.refund.refund", output: "preview" });
  await s.app.idle();
  const preview = specRecord(s.app);
  const candidate = preview.payload.candidate;
  assert.deepEqual(treeBytes(root), before, "the end of a generation applies nothing");
  // Every file and its diff are visible before the action.
  s.send(KEY.f6);
  let text = s.text();
  assert.match(text, /a applies the entire candidate: writes these 3 file\(s\) directly, as --apply/);
  assert.match(text, /Enter rerun · a apply all · Esc back/);
  for (const file of REFUND_FILES) assert.ok(text.includes(`${file} (new file)`), file);
  // The step names every file; Back writes nothing and starts nothing.
  s.send("a");
  assert.deepEqual([s.app.state.barrier?.action, s.app.state.barrier?.files, s.app.state.barrier?.writes], ["spec-to-code application.refund.refund --apply", [], REFUND_FILES]);
  assert.match(s.text(), /Writes these files directly, as spec-to-code --apply \(no proposal, no test is run\):/);
  await esc(s.send);
  assert.deepEqual(treeBytes(root), before, "Back writes nothing");
  assert.equal(s.app.state.records.length, 1);
  // Continue: the real worker writes the three files, as the CLI's --apply does in the twin.
  s.send("a");
  s.send(KEY.enter);
  await s.app.idle();
  const applied = applyRecord(s.app);
  assert.deepEqual(
    [applied.status, applied.exitCode, applied.written, applied.proposals, applied.payload.files.map((file) => file.state)],
    ["completed", 0, REFUND_FILES, [], ["completed", "completed", "completed"]],
  );
  const cli = cliSpec(twin, ["application.refund.refund", "--apply"]);
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(cli.stdout, candidate.print);
  assert.ok(cli.stderr.endsWith(`keylang: ${REFUND_FILES.join(", ")} written; run \`keylang map\`, then write the body and its tests\n`), cli.stderr);
  for (const [i, file] of REFUND_FILES.entries()) {
    assert.equal(readFileSync(join(root, file), "utf8"), readFileSync(join(twin, file), "utf8"), `${file}: the CLI's bytes`);
    assert.equal(readFileSync(join(root, file), "utf8"), candidate.targets[i]!.after);
  }
  assert.deepEqual([...treeBytes(root).keys()].filter((path) => !before.has(path)).sort(), [...REFUND_FILES].sort(), "the files only: no proposal, no stats");
  assert.match(s.app.state.message ?? "", /spec-to-code --apply: .* written · no test was run; run them, then check · u undoes only the last MERGE, not this write/);
  // The analysis after the write sees the code.
  assert.ok((s.app.state.analysis?.verdicts ?? []).some((v) => v.area === "application.refund.refund" && v.criterion === "ID" && v.verdict === "ok"));
  // The candidate it came from is outdated: a second apply is refused before anything runs.
  assert.equal(s.app.state.records[0]!.outdated, "its files were written since this run");
  s.send("a");
  assert.equal(s.app.state.message, "spec-to-code --apply: not started: the candidate is outdated (its files were written since this run); Enter builds it again");
  assert.equal(s.app.state.records.length, 2);
  s.send(KEY.down);
  text = s.text();
  assert.match(text, /Apply spec-to-code candidate · application\.refund\.refund → 3 file\(s\) · written directly, no proposal/);
  assert.match(text, /3 file\(s\) written · code 0/);
  assert.match(text, /test tests\/refund\.test\.ts · written/);
  await esc(s.send);
  // u is the undo of a MERGE, not of this write.
  s.send("u");
  assert.equal(s.app.state.message, "no merge to undo");
  // The same candidate sent again: every file is newer than it; nothing is overwritten.
  const written = treeBytes(root);
  const again = await runOperation({ kind: "apply-code", root, candidate });
  assert.deepEqual([again.status, again.exitCode, again.written], ["failed", 1, []]);
  assert.deepEqual(again.payload?.refused, REFUND_FILES.map((file) => `${file}: created on disk while the change was prepared; nothing written`));
  assert.deepEqual(treeBytes(root), written);

  // The model's candidate goes through the same apply.
  const llmRoot = checkoutRepo(t, specs);
  const llmTwin = checkoutRepo(t, specs);
  withConfig(llmRoot, { agent: "anthropic:claude-opus-5" });
  withConfig(llmTwin, { agent: "anthropic:claude-opus-5" });
  const model = await heldModel(t, refundReply);
  const m = session(llmRoot, { cols: 200, rows: 60 });
  t.after(() => m.app.close());
  await m.app.idle();
  specForm(m, { id: "application.refund.refund", mode: "llm", output: "preview" });
  const llmPreview = await answerAll(model, m.app.idle().then(() => specRecord(m.app)));
  assert.equal(llmPreview.payload.mode, "llm");
  m.send(KEY.f6);
  m.send("a");
  assert.equal(m.app.state.barrier?.action, "spec-to-code application.refund.refund --mode llm --apply");
  m.send(KEY.enter);
  await m.app.idle();
  const llmApplied = applyRecord(m.app);
  assert.deepEqual([llmApplied.status, llmApplied.exitCode, llmApplied.written], ["completed", 0, REFUND_FILES]);
  assert.equal(model.prompts.length, 3, "applying asks the model nothing");
  const llmCli = await answerAll(model, cliSpecAsync(llmTwin, ["application.refund.refund", "--mode", "llm", "--apply"]));
  assert.equal(llmCli.status, 0, llmCli.stderr);
  assert.ok(llmCli.stderr.endsWith(`keylang: ${REFUND_FILES.join(", ")} written; run \`keylang map\`, then review the body and the tests, then run them\n`), llmCli.stderr);
  for (const file of REFUND_FILES) assert.equal(readFileSync(join(llmRoot, file), "utf8"), readFileSync(join(llmTwin, file), "utf8"), `${file}: the CLI's bytes`);
  assert.equal(readFileSync(join(llmRoot, REFUND_FILES[0]!), "utf8"), "export function refund(order: Order): Order {\n  return order;\n}\n");
});

test("tui: applying a candidate checks every file and input first — a target created after the preview, a spec changed at the commit, an open MERGE or a waiting proposal refuse it with nothing written; a failed second write names the first as written and the rest as not attempted, as the CLI does", async (t) => {
  const root = checkoutRepo(t, { "keylang/flows/refund.md": REFUND_PLAN });
  const hook: { during: (() => void) | null } = { during: null };
  const operations = (request: OperationRequest, context: OperationContext): Promise<OperationResult> =>
    runOperation(request, {
      ...context,
      beforeCommit: async (plan) => {
        hook.during?.();
        return context.beforeCommit?.(plan);
      },
    });
  const s = session(root, { cols: 200, rows: 60, operations });
  t.after(() => s.app.close());
  await s.app.idle();
  const preview = async (): Promise<SpecCodeResult> => {
    specForm(s, { id: "application.refund.refund", output: "preview" });
    await s.app.idle();
    return specRecord(s.app);
  };
  const apply = async (): Promise<ApplyCodeResult> => {
    s.send(KEY.f6);
    s.send("a");
    s.send(KEY.enter);
    await s.app.idle();
    const result = applyRecord(s.app);
    await esc(s.send);
    return result;
  };
  const nothing = (): void => {
    for (const file of REFUND_FILES) assert.ok(!existsSync(join(root, file)) || file === "tests/refund.test.ts", `${file} not written`);
  };

  // One target created after the preview: no file of the candidate is written, the new one is kept.
  await preview();
  mkdirSync(join(root, "tests"));
  writeFileSync(join(root, "tests/refund.test.ts"), "// mine\n");
  let result = await apply();
  assert.deepEqual([result.status, result.exitCode, result.written, result.payload.refused], ["failed", 1, [], ["tests/refund.test.ts: created on disk while the change was prepared; nothing written"]]);
  assert.deepEqual(result.payload.files.map((file) => file.state), ["not-attempted", "not-attempted", "not-attempted"]);
  nothing();
  assert.equal(readFileSync(join(root, "tests/refund.test.ts"), "utf8"), "// mine\n");
  rmSync(join(root, "tests"), { recursive: true });

  // A spec changed while the step waited (at the commit): refused, the new bytes kept.
  const candidate = (await preview()).payload.candidate;
  const edited = `${REFUND_PLAN}\n<!-- edited meanwhile -->\n`;
  hook.during = () => writeFileSync(join(root, "keylang/flows/refund.md"), edited);
  result = await apply();
  hook.during = null;
  assert.deepEqual([result.status, result.exitCode, result.payload.refused], ["failed", 1, ["keylang/flows/refund.md: changed on disk while the candidate was computed"]]);
  nothing();
  assert.equal(readFileSync(join(root, "keylang/flows/refund.md"), "utf8"), edited);
  writeFileSync(join(root, "keylang/flows/refund.md"), REFUND_PLAN);

  // The second write fails (a file where its directory goes): the first is written and named, the third not attempted; code 2, the session lives.
  await preview();
  writeFileSync(join(root, "tests"), "not a directory\n");
  result = await apply();
  assert.deepEqual([result.status, result.exitCode, result.written], ["failed", 2, [REFUND_FILES[0]]]);
  assert.deepEqual(result.payload.files.map((file) => file.state), ["completed", "failed", "not-attempted"]);
  assert.ok(result.payload.error !== null && result.payload.files[1]!.error === result.payload.error);
  assert.deepEqual(result.messages.slice(1).map((message) => message.text), [`written before it stopped: ${REFUND_FILES[0]}`, `not written: ${REFUND_FILES[2]}`]);
  assert.equal(readFileSync(join(root, REFUND_FILES[0]!), "utf8"), candidate.targets[0]!.after);
  assert.equal(readFileSync(join(root, "tests"), "utf8"), "not a directory\n");
  s.send(KEY.f6);
  let text = s.text();
  assert.match(text, /1 of 3 file\(s\) written, failed · code 2/);
  assert.match(text, /test tests\/refund-audit\.test\.ts · failed: /);
  assert.match(text, /test tests\/refund\.test\.ts · not attempted/);
  await esc(s.send);
  // The CLI says the same on stderr after the error, with code 2.
  const twin = checkoutRepo(t, { "keylang/flows/refund.md": REFUND_PLAN });
  writeFileSync(join(twin, "tests"), "not a directory\n");
  const cli = cliSpec(twin, ["application.refund.refund", "--apply"]);
  assert.equal(cli.status, 2);
  assert.ok(cli.stderr.endsWith(`keylang: ${REFUND_FILES[0]}: written\nkeylang: ${REFUND_FILES[2]}: not written\n`), cli.stderr);
  assert.equal(readFileSync(join(twin, REFUND_FILES[0]!), "utf8"), candidate.targets[0]!.after);
  rmSync(join(root, "tests"));
  rmSync(join(root, REFUND_FILES[0]!));
  s.send(KEY.f5);
  await s.app.idle();

  // Proposals of the candidate: MERGE opens on the code; while it is open, a in F6 is refused and starts nothing.
  const records = s.app.state.records.length;
  specForm(s, { id: "application.refund.refund" });
  await s.app.idle();
  assert.equal(s.app.state.merge?.path, REFUND_FILES[0]);
  const stores = treeBytes(join(root, ".keylang/proposals"));
  s.send(KEY.f6);
  s.send("a");
  assert.match(s.app.state.message ?? "", /^spec-to-code --apply: not started: MERGE is open on src\/application\/refund\.ts: write it \(w\) or leave it \(Esc\) first; a proposal for tests\/refund-audit\.test\.ts is waiting: merge it in MERGE/);
  await esc(s.send);
  await esc(s.send);
  assert.equal(s.app.state.mode, "view");
  // Once MERGE is left, the waiting proposals still refuse it: MERGE is the way, nothing is cleared.
  s.send(KEY.f6);
  s.send("a");
  assert.equal(s.app.state.message, `spec-to-code --apply: not started: ${REFUND_FILES.map((file) => `a proposal for ${file} is waiting: merge it in MERGE (Enter in F6, m or Proposals) instead; applying never removes it`).join("; ")}`);
  await esc(s.send);
  assert.equal(s.app.state.records.length, records + 1, "no apply ran");
  nothing();
  assert.deepEqual(treeBytes(join(root, ".keylang/proposals")), stores);
  // The operation refuses them too; the CLI's policy writes the files and keeps every proposal.
  const refused = await runOperation({ kind: "apply-code", root, candidate });
  assert.deepEqual([refused.status, refused.exitCode], ["failed", 1]);
  assert.deepEqual(refused.payload?.refused, REFUND_FILES.map((file) => `.keylang/proposals/${file}: a proposal for ${file} is waiting; merge it in MERGE (m) instead of applying the candidate — applying never removes it`));
  nothing();
  const kept = await runOperation({ kind: "apply-code", root, candidate, pending: "keep" });
  assert.deepEqual([kept.status, kept.exitCode, kept.written], ["completed", 0, REFUND_FILES]);
  assert.deepEqual(treeBytes(join(root, ".keylang/proposals")), stores, "no proposal is removed");
});
