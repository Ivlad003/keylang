// The clip's counter of open questions (ADR 0021 п. 2, .scratch/tui-clip/05):
// the `- ?` lines of the open file, the gaps of the open feature file, and
// the fails an analysis of the session added, counted until the chat opens.
// The number is all the clip shows by itself. Opening the chat lists the
// questions with their places, `/questions` lists them again and the model
// reads them; the list asks the model nothing and writes nothing.

import assert from "node:assert/strict";
import { test } from "node:test";
import { checkoutRepo, CHECKOUT_FLOW, click, KEY, locate } from "./tui-fixture.ts";
import { esc, FLOW_PATH, mockModel, session, treeBytes, withConfig } from "./tui-helpers.ts";

const AGENT = { agent: "anthropic:claude-opus-5" };

/** The checkout flow asking two questions, on lines 9 and 10. */
const ASKING = `${CHECKOUT_FLOW}  - ? who pays for the delivery?\n- ? what about refunds?\n`;

/** Typed at the top of a spec: a rules section of four lines whose deny the checkout code breaks (purchase.ts imports the store). */
const DENY = "# rules\r\r- deny application infrastructure\r\r";

const FEATURE = "keylang/features/skip.md";
/** A feature with one gap besides its question: the trigger never calls the step (static, line 4); the question is line 5. */
const SKIP = "# flow skip\n\n- trigger domain.order.create\n  - step infrastructure.store.save\n  - ? why skip the order?\n";

const RULES = "keylang/rules.md";

/** The counter right of the clip's top row; "" when it shows none. */
function counter(lines: readonly string[]): string {
  for (const line of lines) {
    const match = /╭─[◕◔]{2}╮(9\+|[1-9])?/.exec(line);
    if (match) return match[1] ?? "";
  }
  throw new Error(`no clip on screen:\n${lines.join("\n")}`);
}

function openFile(s: ReturnType<typeof session>, path: string): void {
  s.send(KEY.ctrlP);
  for (const ch of `open ${path}`) s.send(ch);
  s.send(KEY.enter);
}

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

/** The tree but the chat's log: what a command must not change. */
function withoutLog(tree: Map<string, string>): Map<string, string> {
  return new Map([...tree].filter(([path]) => !path.startsWith(".keylang/chat")));
}

test("tui-clip-questions: a flow with two `- ?` lines counts 2 and a save that brings a deny fail 3; opening the chat lists them by file:line and counts that fail no more; a question counts while its line is there", async (t) => {
  const root = checkoutRepo(t, { [FLOW_PATH]: ASKING });
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  assert.equal(s.app.state.current, FLOW_PATH);
  assert.equal(counter(s.lines()), "2", s.text());
  // A deny the code breaks, typed at the top of the flow file and saved: a fail the analysis before did not have.
  s.send("i");
  s.send(DENY);
  s.send(KEY.ctrlS);
  await s.app.idle();
  assert.match(s.lines().at(-1)!, / ✗ 1 /);
  assert.equal(counter(s.lines()), "3", s.text());
  await esc(s.send);
  const before = treeBytes(root);
  s.send(KEY.f7);
  const [head, ...rows] = lastAnswer(s).split("\n");
  assert.equal(head, "відкриті питання: 3");
  assert.deepEqual(rows.slice(0, 2), [`${FLOW_PATH}:13 ? who pays for the delivery?`, `${FLOW_PATH}:14 ? what about refunds?`]);
  assert.match(rows[2]!, /^src\/application\/purchase\.ts:2 ✗ K102 divergence: `application\.purchase` depends on `infrastructure\.store`, which is denied by `deny application infrastructure` \(keylang\/flows\/checkout\.md:3\)$/);
  assert.equal(rows.length, 3);
  assert.match(s.text(), /╭─ ◕◕ скрепка /);
  assert.match(s.text(), /│ +src\/application\/purchase\.ts:2 ✗ +│/, "the window shows the end of the list");
  // Told once, the fail counts no more; the questions still do.
  assert.equal(counter(s.lines()), "2");
  assert.deepEqual(treeBytes(root), before, "opening the chat writes nothing");
  // The last question goes: G is the empty line after it, one Backspace joins them, 23 clear it; then it is saved.
  await esc(s.send);
  assert.equal(s.app.state.clip.chat.open, false);
  s.send("G");
  s.send("i");
  for (let i = 0; i < 1 + "- ? what about refunds?".length; i++) s.send("\x7f");
  s.send(KEY.ctrlS);
  await s.app.idle();
  assert.match(s.lines().at(-1)!, / ✗ 1 /, "the fail is still reported");
  assert.equal(counter(s.lines()), "1");
});

test("tui-clip-questions: a feature file with one gap and one `- ?` counts 2; a click on the clip lists both by file:line, opening again does not repeat it, /questions shows it and the model reads it; the list asks and writes nothing", async (t) => {
  const root = checkoutRepo(t, { [FEATURE]: SKIP });
  withConfig(root, AGENT);
  const model = await mockModel(t, "відповідь");
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  // The feature's static fail was there before the session: no news. The checkout flow asks nothing.
  assert.equal(counter(s.lines()), "");
  s.send(KEY.f7);
  assert.deepEqual(s.app.state.clip.chat.messages, [], "nothing to list");
  say(s, "/questions");
  assert.equal(lastAnswer(s), "немає відкритих питань");
  await esc(s.send);
  openFile(s, FEATURE);
  await s.app.idle();
  assert.match(s.lines().at(-1)!, /feature structure · questions 1/);
  assert.equal(counter(s.lines()), "2", s.text());
  const before = treeBytes(root);
  const at = locate(s.lines(), "╭─◕◕╮");
  s.send(click(at.x + 2, at.y + 1));
  assert.equal(s.app.state.clip.chat.open, true);
  const list = lastAnswer(s);
  const rows = list.split("\n");
  assert.deepEqual(rows.slice(0, 2), ["відкриті питання: 2", `${FEATURE}:5 ? why skip the order?`]);
  assert.match(rows[2]!, /^keylang\/features\/skip\.md:4 static infrastructure\.store\.save: fail infrastructure\.store\.save: absence: no call path from domain\.order\.create/);
  assert.equal(rows.length, 3);
  assert.equal(counter(s.lines()), "2", "a question and a gap count while they are there");
  // Folded and opened again with nothing new: the list is its last message already.
  const told = s.app.state.clip.chat.messages.length;
  s.send(KEY.f7);
  assert.equal(s.app.state.clip.chat.open, false);
  s.send(KEY.f7);
  assert.equal(s.app.state.clip.chat.messages.length, told);
  assert.equal(model.prompts.length, 0, "the list asks the model nothing");
  assert.deepEqual(treeBytes(root), before, "and writes nothing");
  say(s, "/questions");
  assert.equal(lastAnswer(s), list);
  assert.equal(model.prompts.length, 0);
  assert.deepEqual(withoutLog(treeBytes(root)), withoutLog(before));
  // A message to the model carries the same list.
  say(s, "що з ними?");
  await s.app.idle();
  assert.equal(model.prompts.length, 1);
  assert.ok(model.prompts[0]!.includes(`The open questions:\n${rows.slice(1).map((row) => `- ${row}`).join("\n")}\n\n`), model.prompts[0]);
});

test("tui-clip-questions: a session with `- ?` lines, a save that brings a fail and a feature's gaps, without a click or F7, shows the counter, following the open file, and never the window or a word of the clip", async (t) => {
  const root = checkoutRepo(t, { [FLOW_PATH]: ASKING, [FEATURE]: SKIP });
  const s = session(root);
  t.after(() => s.app.close());
  const frames: string[] = [];
  s.app.attach(
    {
      write: (ansi) => {
        s.vt.feed(ansi);
        frames.push(s.vt.text());
      },
    },
    110,
    30,
  );
  await s.app.idle();
  assert.equal(counter(s.lines()), "2");
  s.send("i");
  s.send(DENY);
  s.send(KEY.ctrlS);
  await s.app.idle();
  assert.equal(counter(s.lines()), "3");
  // Undone and saved before anyone looked: the fail is gone, and so is its count.
  s.send("\x1a");
  s.send(KEY.ctrlS);
  await s.app.idle();
  assert.equal(counter(s.lines()), "2");
  await esc(s.send);
  openFile(s, RULES);
  await s.app.idle();
  assert.equal(counter(s.lines()), "", "the rules ask nothing");
  openFile(s, FEATURE);
  await s.app.idle();
  assert.equal(counter(s.lines()), "2", "the feature's question and its static gap");
  s.send(KEY.ctrlO);
  assert.equal(s.app.state.current, RULES);
  assert.equal(counter(s.lines()), "");
  s.send(KEY.ctrlO);
  assert.equal(s.app.state.current, FLOW_PATH);
  assert.equal(counter(s.lines()), "2");
  assert.ok(frames.some((frame) => frame.includes("╭─◕◕╮3")), "the counter was drawn");
  for (const frame of frames) assert.doesNotMatch(frame, /скрепка|◕◕ ›|відкриті питання/, frame);
  assert.equal(s.app.state.clip.chat.open, false);
  assert.deepEqual(s.app.state.clip.chat.messages, []);
});

test("tui-clip-questions: on a narrow terminal the badge in the status line shows the same number; past nine both show 9+", async (t) => {
  const narrow = session(checkoutRepo(t, { [FLOW_PATH]: ASKING }), { cols: 50, rows: 20 });
  t.after(() => narrow.app.close());
  await narrow.app.idle();
  assert.match(narrow.lines().at(-1)!, /^ ◕◕ 2  ✗ 0 /);
  const root = checkoutRepo(t, { [FLOW_PATH]: `${CHECKOUT_FLOW}${Array.from({ length: 10 }, (_, i) => `- ? question ${i + 1}?\n`).join("")}` });
  const wide = session(root);
  const small = session(root, { cols: 50, rows: 20 });
  t.after(() => wide.app.close());
  t.after(() => small.app.close());
  await wide.app.idle();
  await small.app.idle();
  assert.equal(wide.app.state.clip.questions, 10);
  assert.equal(counter(wide.lines()), "9+");
  assert.match(small.lines().at(-1)!, /^ ◕◕ 9\+  ✗ 0 /);
});
