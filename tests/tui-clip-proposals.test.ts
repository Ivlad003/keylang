// Proposals from the clip's chat (ADR 0021, .scratch/tui-clip/04): the
// first `keylang path=` block of the model's answer goes through the gate of
// MCP `apply_diff` and is written as a proposal MERGE takes or not; a
// generated, unsaved, already proposed, code or outside target is refused
// with the reason, and nothing but `.keylang/proposals/` changes before `w`.

import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { CHECKOUT_FLOW, checkoutRepo, KEY } from "./tui-fixture.ts";
import { esc, FLOW_PATH, mockModel, PAID, propose, REFUND, session, treeBytes, waitUntil, withConfig, withoutChatLog } from "./tui-helpers.ts";

const AGENT = { agent: "anthropic:claude-opus-5" };

/** An answer with a block of `text` for `path`. */
function block(path: string, text: string): string {
  return `\`\`\`keylang path=${path}\n${text}\`\`\``;
}

/** The model proposes the file the person's last message names after «запропонуй»: a flow for a spec, a line of code for the rest. */
function proposing(prompt: string): string {
  const path = /Person: запропонуй (\S+)$/.exec(prompt)?.[1] ?? "none";
  return `Ось зміна.\n\n${block(path, path.endsWith(".md") ? "# flow proposed\n" : "export const a = 1;\n")}`;
}

/** Types `text` into the focused chat and sends it. */
function say(s: ReturnType<typeof session>, text: string): void {
  for (const ch of text) s.send(ch);
  s.send(KEY.enter);
}

function lastAnswer(s: ReturnType<typeof session>): string {
  const messages = s.app.state.clip.chat.messages;
  assert.equal(messages.at(-1)?.role, "clip", JSON.stringify(messages));
  return messages.at(-1)!.text;
}

/** The tree but the proposals and the chat's log: what must not change before `w`. */
function withoutStores(tree: Map<string, string>): Map<string, string> {
  return new Map([...tree].filter(([path]) => !path.startsWith(".keylang/proposals/") && !path.startsWith(".keylang/chat/") && path !== ".keylang/proposals/" && path !== ".keylang/"));
}

test("tui-clip-proposals: a block for the open flow is a proposal; m opens MERGE; nothing else changes before w, and w writes the model's text", async (t) => {
  const root = checkoutRepo(t);
  withConfig(root, AGENT);
  await mockModel(t, `Додав, як платять.\n\n${block(FLOW_PATH, PAID)}`);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  const before = treeBytes(root);
  const verdicts = s.app.state.analysis!.verdicts;
  s.send(KEY.f7);
  say(s, "як платять за checkout?");
  await s.app.idle();
  assert.equal(lastAnswer(s), `Додав, як платять.\nпропозиція: ${FLOW_PATH} · m — MERGE`);
  assert.equal(readFileSync(join(root, ".keylang/proposals", FLOW_PATH), "utf8"), PAID);
  assert.deepEqual(withoutStores(treeBytes(root)), withoutStores(before), "only the proposal is new");
  assert.match(s.lines().at(-1)!, /≈ 1 proposal\(s\): m/);
  assert.equal(s.app.state.analysis!.verdicts, verdicts, "the verdicts do not depend on the model");
  // The window folded, m opens MERGE of the flow; nothing is written until w.
  s.send(KEY.f7);
  s.send("m");
  assert.equal(s.app.state.mode, "merge");
  assert.equal(s.app.state.merge?.path, FLOW_PATH);
  assert.equal(s.app.state.analysis!.verdicts, verdicts);
  for (let i = 0; i < s.app.state.merge!.hunks.length; i++) s.send("a");
  s.send("w");
  await s.app.idle();
  assert.equal(readFileSync(join(root, FLOW_PATH), "utf8"), PAID);
});

test("tui-clip-proposals: a generated, unsaved, already proposed, code or outside target is refused with the reason in the chat, and nothing is written", async (t) => {
  const root = checkoutRepo(t);
  withConfig(root, AGENT);
  const model = await mockModel(t, proposing);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  const before = treeBytes(root);
  s.send(KEY.f7);
  const refusal = async (path: string): Promise<string> => {
    say(s, `запропонуй ${path}`);
    await s.app.idle();
    const answer = lastAnswer(s);
    assert.ok(answer.startsWith(`Ось зміна.\nпропозицію для ${path} не записано: `), answer);
    return answer;
  };
  assert.match(await refusal("keylang/map/app.md"), /a generated map file: change the code or the rules, then run `keylang map`$/);
  assert.match(await refusal("src/app.ts"), /це не специфікація: код пише харнес, скрепка пропонує лише \.md під keylang\/$/);
  assert.match(await refusal("../outside.md"), /not a plain relative path$/);
  assert.match(await refusal("README.md"), /outside keylang\/: a proposal changes specs only$/);
  assert.deepEqual(withoutChatLog(treeBytes(root)), before, "nothing written but the log of the conversation");
  // The target has unsaved edits: the proposal would come back as hunks reverting them.
  s.send(KEY.f7);
  s.send("i");
  s.send("x");
  await esc(s.send);
  s.send(KEY.f7);
  assert.match(await refusal(FLOW_PATH), /файл має незбережені правки: збережіть \(Ctrl\+S\) чи відкотіть їх і спитайте знову$/);
  // A proposal already waits for the target: it is never covered by a new one.
  propose(root, "keylang/flows/other.md", "# flow other\n");
  const waiting = treeBytes(root);
  assert.match(await refusal("keylang/flows/other.md"), /для нього вже чекає пропозиція: m — MERGE, потім спитайте знову$/);
  assert.equal(readFileSync(join(root, ".keylang/proposals/keylang/flows/other.md"), "utf8"), "# flow other\n");
  assert.deepEqual(withoutChatLog(treeBytes(root)), withoutChatLog(waiting), "nothing written but the log of the conversation");
  assert.equal(model.prompts.length, 6);
});

test("tui-clip-proposals: of two blocks only the first is written, with a note about the second; a block for a new spec is a proposal of a new file", async (t) => {
  const root = checkoutRepo(t);
  withConfig(root, AGENT);
  await mockModel(t, (prompt) => (prompt.endsWith("Person: два") ? `${block(FLOW_PATH, PAID)}\n${block("keylang/flows/refund.md", REFUND)}` : `Новий потік.\n${block("keylang/flows/refund.md", REFUND)}`));
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.f7);
  say(s, "два");
  await s.app.idle();
  assert.equal(lastAnswer(s), `пропозиція: ${FLOW_PATH} · m — MERGE\nвідкинуто: keylang/flows/refund.md — береться лише перший закритий блок keylang path=`);
  assert.ok(existsSync(join(root, ".keylang/proposals", FLOW_PATH)));
  assert.ok(!existsSync(join(root, ".keylang/proposals/keylang/flows/refund.md")), "the second block is not written");
  rmSync(join(root, ".keylang/proposals"), { recursive: true });
  // A new spec: proposed as a new file; MERGE creates it on w.
  say(s, "новий");
  await s.app.idle();
  assert.equal(lastAnswer(s), "Новий потік.\nпропозиція: keylang/flows/refund.md · m — MERGE");
  assert.ok(!existsSync(join(root, "keylang/flows/refund.md")));
  s.send(KEY.f7);
  s.send("m");
  assert.equal(s.app.state.prompt?.kind, "proposal", "the proposals list: the open flow has none");
  s.send(KEY.enter);
  assert.equal(s.app.state.merge?.path, "keylang/flows/refund.md");
  for (let i = 0; i < s.app.state.merge!.hunks.length; i++) s.send("a");
  s.send("w");
  await s.app.idle();
  assert.equal(readFileSync(join(root, "keylang/flows/refund.md"), "utf8"), REFUND);
});

test("tui-clip-proposals: Browse writes nothing: a block from the model is refused, and .keylang/ does not appear", async (t) => {
  const root = checkoutRepo(t);
  rmSync(join(root, "keylang.json"));
  const saved = process.env.KEYLANG_AGENT;
  process.env.KEYLANG_AGENT = AGENT.agent;
  t.after(() => {
    if (saved === undefined) delete process.env.KEYLANG_AGENT;
    else process.env.KEYLANG_AGENT = saved;
  });
  const model = await mockModel(t, block(FLOW_PATH, PAID));
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  const before = treeBytes(root);
  assert.equal(s.app.state.config.kind, "missing-config");
  s.send(KEY.down);
  s.send(KEY.enter);
  await s.app.idle();
  assert.equal(s.app.state.start, null, "browsing");
  s.send(KEY.f7);
  say(s, "запропонуй потік");
  await s.app.idle();
  assert.equal(model.prompts.length, 1);
  assert.equal(lastAnswer(s), `пропозицію для ${FLOW_PATH} не записано: режим перегляду нічого не пише; keylang init створює keylang.json`);
  assert.deepEqual(treeBytes(root), before, "nothing written");
  assert.ok(!existsSync(join(root, ".keylang")));
});

test("tui-clip-proposals: the open file saved while the model answers — from outside or with Ctrl+S inside the TUI — refuses the proposal built on the text the model saw: nothing written, the saved line stays", async (t) => {
  const LINE = "- ? who refunds a failed payment";
  // The file as saved meanwhile: the person's line the model never saw.
  const SAVED = `${CHECKOUT_FLOW}${LINE}\n`;
  const refusal = `пропозицію для ${FLOW_PATH} не записано: ${FLOW_PATH}: changed on disk while the proposal was prepared; nothing written`;

  // A. Saved from outside the session (another editor, git).
  {
    const root = checkoutRepo(t);
    withConfig(root, AGENT);
    const model = await mockModel(t, `Додав.\n\n${block(FLOW_PATH, PAID)}`, 400);
    const s = session(root);
    t.after(() => s.app.close());
    await s.app.idle();
    s.send(KEY.f7);
    say(s, "додай оплату");
    await waitUntil(() => model.prompts.length === 1, "the request");
    assert.ok(model.prompts[0]!.includes(`The open file ${FLOW_PATH}`), "the model reads the file as it was");
    writeFileSync(join(root, FLOW_PATH), SAVED);
    await s.app.idle();
    assert.equal(lastAnswer(s), `Додав.\n${refusal}`);
    assert.ok(!existsSync(join(root, ".keylang/proposals", FLOW_PATH)), "no proposal against a file the model did not see");
    assert.equal(readFileSync(join(root, FLOW_PATH), "utf8"), SAVED, "the saved line stays");
    assert.doesNotMatch(s.lines().at(-1)!, /proposal\(s\): m/);
  }

  // B. Saved inside the TUI: the window folded with F7, a line typed in edit mode and Ctrl+S while the clip thinks.
  {
    const root = checkoutRepo(t);
    withConfig(root, AGENT);
    const model = await mockModel(t, `Додав.\n\n${block(FLOW_PATH, PAID)}`, 600);
    const s = session(root);
    t.after(() => s.app.close());
    await s.app.idle();
    s.send(KEY.f7);
    say(s, "додай оплату");
    await waitUntil(() => model.prompts.length === 1, "the request");
    assert.equal(s.app.state.clip.waiting, true);
    s.send(KEY.f7);
    assert.equal(s.app.state.clip.chat.focused, false, "the window folded, the keys go to the editor");
    s.send("G");
    s.send("i");
    assert.equal(s.app.state.mode, "edit");
    for (const ch of LINE) s.send(ch);
    s.send(KEY.ctrlS);
    assert.ok(readFileSync(join(root, FLOW_PATH), "utf8").includes(LINE), "saved while the model answers");
    assert.equal(s.app.state.clip.waiting, true, "the model is still answering");
    await s.app.idle();
    assert.equal(lastAnswer(s), `Додав.\n${refusal}`);
    assert.ok(!existsSync(join(root, ".keylang/proposals", FLOW_PATH)), "no proposal against a file the model did not see");
    assert.ok(readFileSync(join(root, FLOW_PATH), "utf8").includes(LINE), "the saved line stays");
  }

  // Control: a proposal for the open file as the model saw it is written as before.
  {
    const root = checkoutRepo(t);
    withConfig(root, AGENT);
    await mockModel(t, `Додав.\n\n${block(FLOW_PATH, PAID)}`);
    const s = session(root);
    t.after(() => s.app.close());
    await s.app.idle();
    s.send(KEY.f7);
    say(s, "додай оплату");
    await s.app.idle();
    assert.equal(lastAnswer(s), `Додав.\nпропозиція: ${FLOW_PATH} · m — MERGE`);
    assert.equal(readFileSync(join(root, ".keylang/proposals", FLOW_PATH), "utf8"), PAID);
  }
});
