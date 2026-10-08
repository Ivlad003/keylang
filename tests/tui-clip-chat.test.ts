// The clip's conversation (ADR 0021, .scratch/tui-clip/03): a message goes
// to the model of `agent` as the session's `assistant-reply` operation with
// the open file, the cursor's line, the ID under it and the F4 pack; one
// request at a time, Esc cancels it, an error says why; without a model the
// commands answer and free text says how to set one. The prompt and the
// reading of the answer are pure functions, tested here too.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { contextText } from "../src/agent-context.ts";
import { assistantPrompt, fileWindow, parseReply, recentTurns, REPLY_TOKENS } from "../src/operations/assistant.ts";
import { runOperation, type AssistantReplyRequest } from "../src/operations.ts";
import type { AppOptions } from "../src/tui/app.ts";
import { checkoutRepo, KEY } from "./tui-fixture.ts";
import { BIN, esc, FEATURES, FLOW_PATH, mapCheck, mockModel, session, sleep, treeBytes, waitUntil, withConfig, withoutChatLog } from "./tui-helpers.ts";

const AGENT = { agent: "anthropic:claude-opus-5" };

/** Types `text` into the focused chat and sends it. */
function say(s: ReturnType<typeof session>, text: string): void {
  for (const ch of text) s.send(ch);
  s.send(KEY.enter);
}

/** The clip's last message. */
function lastAnswer(s: ReturnType<typeof session>): string {
  const messages = s.app.state.clip.chat.messages;
  assert.equal(messages.at(-1)?.role, "clip", JSON.stringify(messages));
  return messages.at(-1)!.text;
}

/** The status line's `✗ N  ◌ N  ✓ N`. */
function statusCounts(s: ReturnType<typeof session>): string {
  const match = /✗ \d+  ◌ \d+  ✓ \d+/.exec(s.lines().at(-1)!);
  assert.ok(match, s.lines().at(-1));
  return match[0];
}

test("tui-clip-chat: one message is one request with the message, the open file, the cursor's line, the ID under it and the F4 pack; the reply stands in the history and the verdicts stay", async (t) => {
  const root = checkoutRepo(t);
  withConfig(root, AGENT);
  const model = await mockModel(t, "static ok: buy викликає save.\n◌ — немає trace цього кроку.");
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  const before = treeBytes(root);
  const verdicts = s.app.state.analysis!.verdicts;
  s.app.state.cursor = { line: 5, col: 0 };
  const pack = s.app.contextPack()!;
  assert.ok(pack.items.some((item) => item.kind === "node"), "the pack has more than the buffer");
  s.send(KEY.f7);
  say(s, "чому save позначено ◌?");
  assert.equal(s.app.state.clip.waiting, true);
  await s.app.idle();
  assert.equal(model.prompts.length, 1, "one request");
  const prompt = model.prompts[0]!;
  assert.match(prompt, /Person: чому save позначено ◌\?$/, "the person's message is the last thing it reads");
  assert.ok(prompt.includes(`The open file ${FLOW_PATH} (8 line(s), as the editor shows it, unsaved edits included):`), prompt);
  assert.ok(prompt.includes("The cursor is on line 6: - step application.purchase.buy\nThe ID under the cursor: application.purchase.buy"), prompt);
  // The pack as F4 shows it, but for the buffer the file already carries.
  assert.ok(prompt.includes(contextText({ ...pack, items: pack.items.filter((item) => item.kind !== "buffer") })), prompt);
  assert.match(s.text(), /◕◕ › static ok: buy викликає save\./);
  assert.equal(lastAnswer(s), "static ok: buy викликає save.\n◌ — немає trace цього кроку.");
  assert.equal(s.app.state.clip.waiting, false);
  // The request is a record of F6, like any explicit operation; its report shows what the model read.
  const record = s.app.state.records.at(-1)!;
  assert.deepEqual([record.action, record.kind, record.status], ["clip-reply", "assistant-reply", "completed"]);
  s.send(KEY.f6);
  assert.match(s.text(), /Clip: the model's reply · чому save позначено ◌\?/);
  assert.match(s.text(), /Clip · anthropic:claude-opus-5 · the model's reply; nothing written by it/);
  assert.match(s.text(), /── prompt ──/);
  // Enter reruns a record, but a reply belongs to its conversation.
  s.send(KEY.enter);
  assert.equal(s.app.state.records.length, 1);
  assert.match(s.app.state.message ?? "", /ask again in its chat/);
  assert.equal(s.app.state.analysis!.verdicts, verdicts, "a reply does not touch the verdicts");
  assert.deepEqual(withoutChatLog(treeBytes(root)), before, "nothing written but the log of the conversation");
});

test("tui-clip-chat: the second message carries the first and its reply; past 16 000 characters the oldest messages are left out whole", async (t) => {
  const root = checkoutRepo(t);
  withConfig(root, AGENT);
  const model = await mockModel(t, "відповідь");
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.f7);
  say(s, "перше питання");
  await s.app.idle();
  say(s, "друге питання");
  await s.app.idle();
  assert.equal(model.prompts.length, 2);
  assert.ok(model.prompts[1]!.endsWith("Person: перше питання\n\nClip: відповідь\n\nPerson: друге питання"), model.prompts[1]);
  // Two long pastes: the newest is kept whole, the one before it no longer fits, and nothing older goes either.
  s.send(`\x1b[200~${"A".repeat(9000)}\x1b[201~`);
  s.send(KEY.enter);
  await s.app.idle();
  s.send(`\x1b[200~${"B".repeat(9000)}\x1b[201~`);
  s.send(KEY.enter);
  await s.app.idle();
  const last = model.prompts[3]!;
  assert.ok(last.endsWith(`Clip: відповідь\n\nPerson: ${"B".repeat(9000)}`), last.slice(-200));
  assert.ok(!last.includes("AAAAAAAAAA"), "the message that does not fit is left out whole");
  assert.ok(!last.includes("перше питання"), "and so is everything older");
  assert.match(last, /The conversation, oldest first \(5 older message\(s\) left out\)/);
});

test("tui-clip-chat: an open feature file gives the model its stage and gaps as keylang feature reports them", async (t) => {
  const root = checkoutRepo(t, FEATURES);
  withConfig(root, AGENT);
  const model = await mockModel(t, "ok");
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.ctrlP);
  for (const ch of "open keylang/features/skip.md") s.send(ch);
  s.send(KEY.enter);
  await s.app.idle();
  const stage = /feature (\S+) · questions 0/.exec(s.lines().at(-1)!)?.[1];
  assert.ok(stage, s.lines().at(-1));
  s.send(KEY.f7);
  say(s, "що бракує?");
  await s.app.idle();
  const cli = spawnSync(process.execPath, [BIN, "feature", "skip"], { cwd: root, encoding: "utf8" });
  const gaps = cli.stdout.split("\n").filter((line) => line !== "" && !line.startsWith("hint: "));
  assert.ok(gaps.length > 0, cli.stdout);
  assert.match(cli.stderr, new RegExp(`stage ${stage}`));
  assert.ok(model.prompts[0]!.includes(`The open feature: stage ${stage}; its gaps:\n${gaps.map((gap) => `- ${gap}`).join("\n")}\n\n`), model.prompts[0]);
  // Another file, the window still focused: no feature in the request.
  s.send(KEY.ctrlP);
  for (const ch of `open ${FLOW_PATH}`) s.send(ch);
  s.send(KEY.enter);
  await s.app.idle();
  assert.equal(s.app.state.current, FLOW_PATH);
  say(s, "а тут?");
  await s.app.idle();
  assert.ok(!model.prompts[1]!.includes("The open feature"), model.prompts[1]);
});

test("tui-clip-chat: while the model answers the eyes are ◔◔ and the window says it thinks; Enter sends nothing; Esc cancels the request, the history says скасовано and nothing is written", async (t) => {
  const root = checkoutRepo(t);
  withConfig(root, AGENT);
  const model = await mockModel(t, "late", 10_000);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  const before = treeBytes(root);
  s.send(KEY.f7);
  say(s, "що робить buy?");
  await waitUntil(() => model.prompts.length === 1, "the request");
  assert.match(s.text(), /╭─ ◔◔ скрепка /, "the window's eyes");
  assert.match(s.text(), /◔◔ › думаю… Esc — скасувати/);
  assert.match(s.text(), /╭─◔◔╮/, "the clip's eyes");
  // One request at a time: Enter keeps the line and reminds of Esc.
  say(s, "ще");
  await sleep(50);
  assert.equal(model.prompts.length, 1);
  assert.equal(s.app.state.clip.chat.input, "ще");
  assert.match(s.app.state.message ?? "", /Esc скасовує запит/);
  assert.equal(s.app.state.clip.chat.messages.length, 1);
  await esc(s.send);
  assert.equal(s.app.state.clip.chat.open, true, "Esc cancelled the request instead of folding the window");
  assert.equal(lastAnswer(s), "скасовано");
  assert.equal(s.app.state.records.at(-1)!.status, "cancelled");
  await waitUntil(() => model.aborted === 1, "the request dropped");
  await s.app.idle();
  assert.match(s.text(), /╭─◕◕╮/);
  assert.doesNotMatch(s.text(), /думаю/);
  assert.deepEqual(treeBytes(root), before, "nothing written");
  // Without a reply awaited Esc folds the window again.
  await esc(s.send);
  assert.equal(s.app.state.clip.chat.open, false);
});

test("tui-clip-chat: a model error says why in the chat and nothing is written; a message while another operation runs asks nothing", async (t) => {
  const root = checkoutRepo(t);
  withConfig(root, AGENT);
  const model = await mockModel(t, "");
  let open!: () => void;
  const gate = new Promise<void>((resolve) => (open = resolve));
  const operations: NonNullable<AppOptions["operations"]> = async (request, context) => {
    if (request.kind === "map-check") await gate;
    return runOperation(request, context);
  };
  const s = session(root, { operations });
  t.after(() => s.app.close());
  await s.app.idle();
  const before = treeBytes(root);
  s.send(KEY.f7);
  say(s, "чому?");
  await s.app.idle();
  assert.equal(model.prompts.length, 1);
  assert.equal(lastAnswer(s), "помилка моделі: claude-opus-5 answered without text (stop reason: end_turn)");
  assert.equal(s.app.state.records.at(-1)!.status, "failed");
  assert.deepEqual(withoutChatLog(treeBytes(root)), before, "nothing written but the log of the conversation");
  // Another operation runs: the chat says so, and no request is made.
  s.send(KEY.f7);
  mapCheck(s.send);
  assert.notEqual(s.app.state.activeOperation, null);
  s.send(KEY.f7);
  say(s, "а тепер?");
  assert.match(lastAnswer(s), /^вже працює інша операція: /);
  assert.equal(s.app.state.clip.waiting, false);
  open();
  await s.app.idle();
  assert.equal(model.prompts.length, 1, "no request while it ran");
});

test("tui-clip-chat: without an agent free text says how to set one and the commands answer: /explain K105 prints what keylang explain does, /check sums up the session; no request", async (t) => {
  const root = checkoutRepo(t);
  const model = await mockModel(t, "never");
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  const before = treeBytes(root);
  s.send(KEY.f7);
  say(s, "чому save позначено ◌?");
  assert.equal(lastAnswer(s), "немає моделі: задайте `agent` у keylang.json або `KEYLANG_AGENT`; без неї працюють /explain, /feature, /check, /questions");
  assert.equal(s.app.state.clip.waiting, false);
  say(s, "/explain K105");
  await s.app.idle();
  const cli = spawnSync(process.execPath, [BIN, "explain", "K105"], { cwd: root, encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(lastAnswer(s), cli.stdout.trimEnd());
  say(s, "/check");
  const check = lastAnswer(s).split("\n");
  assert.equal(check[0], statusCounts(s), "the counts of the status line");
  assert.equal(model.prompts.length, 0, "no request");
  assert.deepEqual(withoutChatLog(treeBytes(root)), before, "nothing written but the log of the conversation");
});

test("tui-clip-chat: /check names the first fails with their positions; /feature shows the stage and gaps keylang feature prints; /new starts over; an unknown command lists the commands", async (t) => {
  const root = checkoutRepo(t, { ...FEATURES, "keylang/rules.md": "# rules\n\n- layers domain < infrastructure < application < presentation\n- deny application infrastructure\n" });
  const model = await mockModel(t, "never");
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.f7);
  say(s, "/check");
  const [counts, ...fails] = lastAnswer(s).split("\n");
  assert.equal(counts, statusCounts(s));
  assert.ok(fails.length > 0, lastAnswer(s));
  assert.match(fails[0]!, /^✗ K102 src\/application\/purchase\.ts:2:1 divergence: `application\.purchase` depends on `infrastructure\.store`/, "a fail with its position");
  say(s, "/feature skip");
  await s.app.idle();
  const cli = spawnSync(process.execPath, [BIN, "feature", "skip"], { cwd: root, encoding: "utf8" });
  assert.equal(cli.status, 1, cli.stderr);
  assert.equal(lastAnswer(s), `${cli.stdout}${cli.stderr}`.trimEnd());
  assert.match(lastAnswer(s), /gap\(s\) · stage /);
  say(s, "/feature nope");
  await s.app.idle();
  assert.equal(lastAnswer(s), "помилка: feature: keylang/features/nope.md: not found");
  say(s, "/nope");
  assert.match(lastAnswer(s), /^невідома команда \/nope; команди:\n\/explain <код\|ID> — .*\n\/feature <slug> — .*\n\/check — .*\n\/questions — .*\n\/new — .*\n\/help — /);
  say(s, "/help");
  assert.match(lastAnswer(s), /^команди, без моделі:\n\/explain/);
  assert.match(lastAnswer(s), /Esc — згорнути, а поки скрепка думає — скасувати/);
  say(s, "/new");
  assert.deepEqual(s.app.state.clip.chat.messages, [], "a new conversation");
  assert.doesNotMatch(s.text(), /ти › /);
  assert.equal(model.prompts.length, 0, "no command asks the model");
});

// ---------- the prompt and the answer, as pure functions ----------

const REQUEST: AssistantReplyRequest = {
  kind: "assistant-reply",
  root: "/repo",
  history: [
    { role: "you", text: "що тут?" },
    { role: "clip", text: "потік checkout." },
    { role: "you", text: "чому save позначено ◌?" },
  ],
  file: { path: FLOW_PATH, text: "# flow checkout\n\n- step application.purchase.buy\n", line: 2, id: "application.purchase.buy" },
  context: "[node] application.purchase.buy\nfn application.purchase.buy",
  feature: null,
  questions: [],
};

test("tui-clip-chat: the prompt has the file around the cursor, the line and the ID, the feature, the questions, the pack and the conversation; the system prompt keeps the clip to this repository", () => {
  const asked = assistantPrompt(REQUEST, "keylang");
  assert.equal(asked.maxTokens, REPLY_TOKENS);
  assert.equal(REPLY_TOKENS, 1500);
  assert.equal(
    asked.prompt,
    [
      `The open file ${FLOW_PATH} (3 line(s), as the editor shows it, unsaved edits included):\n\`\`\`\n# flow checkout\n\n- step application.purchase.buy\n\`\`\``,
      "The cursor is on line 3: - step application.purchase.buy\nThe ID under the cursor: application.purchase.buy",
      "What keylang shows the person around the cursor (the context panel):\n[node] application.purchase.buy\nfn application.purchase.buy",
      "The conversation, oldest first. Answer the person's last message.\n\nPerson: що тут?\n\nClip: потік checkout.\n\nPerson: чому save позначено ◌?",
    ].join("\n\n"),
  );
  for (const rule of ["in the language the person writes in", "only about this repository", "Never invent a verdict, an edge or an id", "````keylang path=<file>", "longer than any run of backticks in the file", "under keylang/", "full new text of that file, never a diff", "Do not write code"]) assert.ok(asked.system.includes(rule), rule);
  // A feature and open questions when there are any; a fence longer than the file's own.
  const feature = assistantPrompt({ ...REQUEST, file: { ...REQUEST.file!, text: "```\ncode\n```\n" }, feature: { stage: "ready", gaps: ["keylang/features/skip.md:4:5: static infrastructure.store.save: no call"] }, questions: ["keylang/flows/checkout.md:7: хто платить?"], context: null }, "keylang");
  assert.ok(feature.prompt.includes("````\n```\ncode\n```\n````"), feature.prompt);
  assert.ok(feature.prompt.includes("The open feature: stage ready; its gaps:\n- keylang/features/skip.md:4:5: static infrastructure.store.save: no call"));
  assert.ok(feature.prompt.includes("The open questions:\n- keylang/flows/checkout.md:7: хто платить?"));
  assert.ok(!feature.prompt.includes("context panel"));
  assert.ok(assistantPrompt({ ...REQUEST, file: null }, "keylang").prompt.startsWith("No file is open."));
});

test("tui-clip-chat: the history keeps the newest 16 000 characters in whole messages, the new message however long; the file keeps 400 lines around the cursor", () => {
  const turn = (text: string, role: "you" | "clip" = "you") => ({ role, text });
  assert.deepEqual(recentTurns([turn("a".repeat(10)), turn("b".repeat(6), "clip"), turn("c".repeat(4))], 10), { turns: [turn("b".repeat(6), "clip"), turn("c".repeat(4))], dropped: 1 });
  assert.deepEqual(recentTurns([turn("a"), turn("b".repeat(20))], 10), { turns: [turn("b".repeat(20))], dropped: 1 });
  assert.deepEqual(recentTurns([turn("a".repeat(8_000)), turn("b".repeat(8_000))]).dropped, 0, "16 000 exactly fits");
  assert.deepEqual(recentTurns([turn("x"), turn("a".repeat(8_000)), turn("b".repeat(8_000))]).dropped, 1);
  const text = `${Array.from({ length: 1000 }, (_, i) => `line ${i + 1}`).join("\n")}\n`;
  assert.deepEqual({ ...fileWindow(text, 499), text: undefined }, { first: 300, last: 699, total: 1000, text: undefined });
  assert.equal(fileWindow(text, 499).text.split("\n").length, 400);
  assert.deepEqual([fileWindow(text, 5).first, fileWindow(text, 5).last], [1, 400]);
  assert.deepEqual([fileWindow(text, 998).first, fileWindow(text, 998).last], [601, 1000]);
  assert.deepEqual(fileWindow("one\ntwo\n", 0), { first: 1, last: 2, total: 2, text: "one\ntwo" });
  const long = assistantPrompt({ ...REQUEST, file: { path: FLOW_PATH, text, line: 499, id: null } }, "keylang");
  assert.ok(long.prompt.includes("(lines 300–699 of 1000, as the editor shows it"), long.prompt.slice(0, 200));
  assert.ok(long.prompt.includes("line 300\n") && !long.prompt.includes("line 299\n") && long.prompt.includes("line 699\n") && !long.prompt.includes("line 700\n"));
});

test("tui-clip-chat: the answer's first closed keylang path= block is the candidate; other such blocks and an unclosed one are left out by path; other fences stay in the reply", () => {
  assert.deepEqual(parseReply("Коротко: так."), { reply: "Коротко: так.", proposal: null, dropped: [] });
  const block = "# flow refund\n\n- trigger application.purchase.buy\n";
  assert.deepEqual(parseReply(`Ось потік:\n\n\`\`\`keylang path=keylang/flows/refund.md\n${block}\`\`\`\n\nПеревірте в MERGE.`), { reply: "Ось потік:\n\nПеревірте в MERGE.", proposal: { path: "keylang/flows/refund.md", text: block }, dropped: [] });
  // Two blocks: only the first; a quoted path and `./` are the same path.
  const two = parseReply(`\`\`\`keylang path="./keylang/flows/a.md"\n# flow a\n\`\`\`\ntext\n~~~keylang path=keylang/flows/b.md\n# flow b\n~~~`);
  assert.deepEqual(two, { reply: "text", proposal: { path: "keylang/flows/a.md", text: "# flow a\n" }, dropped: ["keylang/flows/b.md"] });
  // An answer cut at the token limit holds no whole file.
  assert.deepEqual(parseReply("Ось:\n```keylang path=keylang/flows/a.md\n# flow a\n- step"), { reply: "Ось:", proposal: null, dropped: ["keylang/flows/a.md"] });
  // A longer fence keeps the spec's own code block; another fenced block stays as text.
  const nested = parseReply("````keylang path=keylang/flows/a.md\n# flow a\n```\ncode\n```\n````\n```ts\nconst a = 1;\n```");
  assert.deepEqual(nested, { reply: "```ts\nconst a = 1;\n```", proposal: { path: "keylang/flows/a.md", text: "# flow a\n```\ncode\n```\n" }, dropped: [] });
  assert.deepEqual(parseReply("```keylang\n# no path\n```").proposal, null, "a block without a path is text");
});

test("tui-clip-chat: a spec's own code block inside the candidate survives: a three-backtick block closes at the fence that matches it, not at the inner block's end; the opening fence's indent leaves the body", () => {
  const spec = "# flow checkout\n\nCheckout from the terminal, paid by card.\n\n```ts\ncheckout();\n```\n\n- trigger presentation.terminal.checkout\n- step application.purchase.buy\n";
  // The fence the system prompt asks for: longer than the spec's own.
  assert.deepEqual(parseReply(`Додав.\n\n\`\`\`\`keylang path=keylang/flows/checkout.md\n${spec}\`\`\`\`\nГотово.`), { reply: "Додав.\n\nГотово.", proposal: { path: "keylang/flows/checkout.md", text: spec }, dropped: [] });
  // A model that still gives three backticks: the inner ```ts opens a block of its own, and its bare ``` closes that one.
  assert.deepEqual(parseReply(`Додав.\n\n\`\`\`keylang path=keylang/flows/checkout.md\n${spec}\`\`\`\nГотово.`), { reply: "Додав.\n\nГотово.", proposal: { path: "keylang/flows/checkout.md", text: spec }, dropped: [] });
  // An inner block left open leaves the candidate unclosed: no whole file, left out by path.
  assert.deepEqual(parseReply("```keylang path=keylang/flows/a.md\n# flow a\n```ts\ncode();\n"), { reply: "", proposal: null, dropped: ["keylang/flows/a.md"] });
  // A fence in a list item: its indent is not part of the file (CommonMark), deeper lines keep the rest.
  assert.deepEqual(parseReply("1. Ось:\n   ```keylang path=keylang/flows/a.md\n   # flow a\n\n   - trigger x.y\n     - step a.b\n  short\n   ```").proposal, { path: "keylang/flows/a.md", text: "# flow a\n\n- trigger x.y\n  - step a.b\nshort\n" });
});
