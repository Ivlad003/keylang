// The clip's memory (ADR 0021 п. 6, .scratch/tui-clip/06): where the person
// left the clip and its window is kept in `~/.config/keylang/tui.json` (a
// temporary HOME here), the file's other fields with it; the conversation
// is kept by day in `.keylang/chat/<date>.md` where git ignores it or outside
// any repository, never in Browse and never for a cancelled request, and a
// new session goes on with it. Neither the snapshot nor `check --changed`
// sees the log.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { gitChangedFiles } from "../src/git-changes.ts";
import { chatLogPath, dayOf, lastConversation, NOT_IGNORED, parsePlace, withExchange, withPlace, withSection } from "../src/tui/clip-memory.ts";
import { checkoutRepo, drag, KEY, locate, tempHome } from "./tui-fixture.ts";
import { BIN, cliMapCheck, committedCheckout, esc, FLOW_PATH, gitRun, mockModel, PAID, session, treeBytes, waitUntil, withConfig } from "./tui-helpers.ts";

const AGENT = { agent: "anthropic:claude-opus-5" };

/** The window's frame on screen, or null while it is folded. */
function windowAt(lines: readonly string[]): { x: number; y: number; width: number; height: number } | null {
  const y = lines.findIndex((line) => line.includes("╭─ ◕◕ скрепка "));
  if (y === -1) return null;
  const x = lines[y]!.indexOf("╭─ ◕◕ скрепка ");
  const width = lines[y]!.indexOf("╮", x) - x + 1;
  let bottom = y + 1;
  while (bottom < lines.length && lines[bottom]![x] !== "╰") bottom++;
  return { x, y, width, height: bottom - y + 1 };
}

/** Types `text` into the focused chat and sends it. */
function say(s: ReturnType<typeof session>, text: string): void {
  for (const ch of text) s.send(ch);
  s.send(KEY.enter);
}

/** Alt (and Shift) with an arrow, as xterm sends it: A up, B down, C right, D left. */
const alt = (arrow: "A" | "B" | "C" | "D", shift = false): string => `\x1b[1;${shift ? 4 : 3}${arrow}`;

/** `~/.config/keylang/tui.json` of a home: the file the clip's place is kept in. */
const tuiJson = (home: string): string => join(home, ".config/keylang/tui.json");

function writeTui(home: string, text: string): void {
  mkdirSync(dirname(tuiJson(home)), { recursive: true });
  writeFileSync(tuiJson(home), text);
}

const readTui = (home: string): unknown => JSON.parse(readFileSync(tuiJson(home), "utf8"));

/** Today's log of a repository: its path, and its text or null. */
function todaysLog(root: string): { path: string; text: string | null } {
  const path = join(root, chatLogPath(dayOf(new Date())));
  return { path, text: existsSync(path) ? readFileSync(path, "utf8") : null };
}

/** The clip's default corner in a session with no tui.json, as the frame draws it. */
async function defaultCorner(t: { after: (f: () => void) => void }, root: string): Promise<{ x: number; y: number }> {
  const plain = session(root);
  t.after(() => plain.app.close());
  await plain.app.idle();
  return locate(plain.lines(), "╭─◕◕╮");
}

test("tui-clip-memory: a drag of the window and of the clip, Alt+arrows and the palette's reset end in tui.json with its other fields kept; the next session puts both where they were left", async (t) => {
  const root = checkoutRepo(t);
  const home = tempHome();
  writeTui(home, `${JSON.stringify({ editor: { theme: "dark" }, assistant: { voice: "quiet" } }, null, 2)}\n`);
  const first = session(root, { home });
  t.after(() => first.app.close());
  await first.app.idle();
  first.send(KEY.f7);
  const w = windowAt(first.lines())!;
  first.send(drag({ x: w.x + 6, y: w.y }, { x: w.x - 14, y: w.y - 5 }));
  const window = { ...w, x: w.x - 20, y: w.y - 5 };
  assert.deepEqual(windowAt(first.lines()), window);
  const corner = locate(first.lines(), "╭─◕◕╮");
  first.send(drag({ x: corner.x + 2, y: corner.y + 1 }, { x: 10, y: 3 }));
  assert.deepEqual(locate(first.lines(), "╭─◕◕╮"), { x: 8, y: 2 });
  assert.deepEqual(readTui(home), { editor: { theme: "dark" }, assistant: { voice: "quiet", clip: { x: 8, y: 2 }, window: { x: window.x, y: window.y, cols: 40, rows: 10 } } });
  assert.deepEqual(readdirSync(dirname(tuiJson(home))), ["tui.json"], "written in place: no temporary file is left");
  first.app.close();

  const second = session(root, { home });
  t.after(() => second.app.close());
  await second.app.idle();
  assert.deepEqual(locate(second.lines(), "╭─◕◕╮"), { x: 8, y: 2 }, "the clip where it was left");
  second.send(KEY.f7);
  assert.deepEqual(windowAt(second.lines()), window, "the window where it was left, at its size");
  // A keyboard move and resize are kept as a drag is.
  second.send(alt("B"));
  second.send(alt("C", true));
  assert.deepEqual(readTui(home), { editor: { theme: "dark" }, assistant: { voice: "quiet", clip: { x: 8, y: 2 }, window: { x: window.x, y: window.y + 1, cols: 41, rows: 10 } } });
  // The palette puts both back: the file keeps no place, and its other fields.
  second.send(KEY.ctrlP);
  for (const ch of "скрепка") second.send(ch);
  second.send(KEY.enter);
  assert.deepEqual(readTui(home), { editor: { theme: "dark" }, assistant: { voice: "quiet" } });
  second.app.close();

  const third = session(root, { home });
  t.after(() => third.app.close());
  await third.app.idle();
  assert.deepEqual(locate(third.lines(), "╭─◕◕╮"), corner, "back in the corner");
});

test("tui-clip-memory: a place kept on a big terminal stands inside a 60×16 one, and where it was left once the terminal is big again", async (t) => {
  const home = tempHome();
  const kept = `${JSON.stringify({ assistant: { clip: { x: 100, y: 25 }, window: { x: 50, y: 12, cols: 50, rows: 14 } } })}\n`;
  writeTui(home, kept);
  const s = session(checkoutRepo(t), { home, cols: 60, rows: 16 });
  t.after(() => s.app.close());
  await s.app.idle();
  assert.deepEqual(locate(s.lines(), "╭─◕◕╮"), { x: 55, y: 12 }, "at the right edge, above the status line");
  s.send(KEY.f7);
  assert.deepEqual(windowAt(s.lines()), { x: 10, y: 1, width: 50, height: 13 }, "under the title row, above the detail line, no taller than that");
  s.vt.resize(110, 30);
  s.app.resize(110, 30);
  assert.deepEqual(windowAt(s.lines()), { x: 50, y: 12, width: 50, height: 14 });
  s.send(KEY.f7);
  assert.deepEqual(locate(s.lines(), "╭─◕◕╮"), { x: 100, y: 25 });
  assert.equal(readFileSync(tuiJson(home), "utf8"), kept, "opening and resizing write nothing");
});

test("tui-clip-memory: an invalid tui.json is one message in the detail line, the default place, and the file as it was until the first drag rewrites it", async (t) => {
  const root = checkoutRepo(t);
  const corner = await defaultCorner(t, root);
  const home = tempHome();
  const broken = '{ "assistant": { "clip": ';
  writeTui(home, broken);
  const s = session(root, { home });
  t.after(() => s.app.close());
  await s.app.idle();
  assert.match(s.app.state.message ?? "", /tui\.json: invalid JSON: .*; ignored: the clip and its window start where they do by default, and the first drag rewrites the file$/);
  assert.ok(s.app.state.message!.startsWith(tuiJson(home)), "the message names the file");
  assert.deepEqual(locate(s.lines(), "╭─◕◕╮"), corner);
  // Said once: not again, and not by the clip, which says nothing until asked.
  s.app.state.message = null;
  s.send(KEY.f5);
  await s.app.idle();
  assert.doesNotMatch(s.app.state.message ?? "", /tui\.json/);
  s.send(KEY.f7);
  assert.deepEqual(s.app.state.clip.chat.messages, []);
  say(s, "/help");
  s.send(KEY.f7);
  assert.equal(readFileSync(tuiJson(home), "utf8"), broken, "not rewritten before a drag");
  s.send(drag({ x: corner.x + 2, y: corner.y + 1 }, { x: corner.x - 8, y: corner.y - 4 }));
  assert.deepEqual(readTui(home), { assistant: { clip: { x: corner.x - 10, y: corner.y - 5 } } });
});

test("tui-clip-memory: in a git repository that ignores .keylang/ two exchanges are today's log in the format of spec §4.7; a new session shows them and goes on in the same section; /new starts another", async (t) => {
  const root = checkoutRepo(t, { ".gitignore": ".keylang/\n" });
  gitRun(root, ["init", "-q"]);
  withConfig(root, AGENT);
  await mockModel(t, (prompt) => (prompt.endsWith("Person: запропонуй опис") ? `Додав опис.\n\n\`\`\`keylang path=${FLOW_PATH}\n${PAID}\`\`\`` : "static ok: buy викликає save.\n◌ — немає trace цього кроку."));
  const first = session(root);
  t.after(() => first.app.close());
  await first.app.idle();
  first.send(KEY.f7);
  say(first, "чому save позначено ◌?");
  await first.app.idle();
  say(first, "запропонуй опис");
  await first.app.idle();
  assert.equal(first.app.state.clip.chat.messages.at(-1)?.text, `Додав опис.\nпропозиція: ${FLOW_PATH} · m — MERGE`);
  first.app.close();
  const day = dayOf(new Date());
  const log = todaysLog(root).text ?? "";
  const time = /^## (\d\d:\d\d) · /m.exec(log)?.[1];
  assert.ok(time, log);
  assert.equal(
    log,
    [
      `# chat ${day}`,
      "",
      `## ${time} · anthropic:claude-opus-5`,
      "",
      "**ти:** чому save позначено ◌?",
      "",
      "**скрепка:** static ok: buy викликає save.",
      "  ◌ — немає trace цього кроку.",
      "",
      "**ти:** запропонуй опис",
      "",
      "**скрепка:** Додав опис.",
      "",
      `**пропозиція:** ${FLOW_PATH}`,
      "",
    ].join("\n"),
  );

  // A new session goes on with today's conversation: the history shows it, and the next exchange joins its section.
  const second = session(root);
  t.after(() => second.app.close());
  await second.app.idle();
  assert.deepEqual(second.app.state.clip.chat.messages, [
    { role: "you", text: "чому save позначено ◌?" },
    { role: "clip", text: "static ok: buy викликає save.\n◌ — немає trace цього кроку." },
    { role: "you", text: "запропонуй опис" },
    { role: "clip", text: `Додав опис.\nпропозиція: ${FLOW_PATH}` },
  ]);
  second.send(KEY.f7);
  assert.match(second.text(), /ти › чому save позначено ◌\?/);
  assert.match(second.text(), /◕◕ › Додав опис\./);
  say(second, "/check");
  const counts = second.app.state.clip.chat.messages.at(-1)!.text;
  const going = todaysLog(root).text ?? "";
  assert.ok(going.startsWith(log), "appended to the log");
  assert.equal(going.slice(log.length), `\n**ти:** /check\n\n**скрепка:** ${counts.replace(/\n/g, "\n  ")}\n`);
  assert.equal(going.match(/^## /gm)?.length, 1, "one conversation, one section");
  // `/new`: a section of its own, and a session after it starts with an empty history.
  say(second, "/new");
  assert.deepEqual(second.app.state.clip.chat.messages, []);
  const sections = (todaysLog(root).text ?? "").match(/^## \d\d:\d\d$/gm);
  assert.equal(sections?.length, 1, "a new section, with no model yet");
  second.app.close();
  const third = session(root);
  t.after(() => third.app.close());
  await third.app.idle();
  assert.deepEqual(third.app.state.clip.chat.messages, []);
});

test("tui-clip-memory: in a git repository that does not ignore .keylang/ the log is not written and the chat says why once; once .gitignore lists it, the next exchange is written", async (t) => {
  const root = checkoutRepo(t);
  gitRun(root, ["init", "-q"]);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.f7);
  say(s, "/check");
  const messages = (): string[] => s.app.state.clip.chat.messages.map((message) => message.text);
  assert.equal(messages().length, 3, JSON.stringify(messages()));
  assert.equal(messages()[2], NOT_IGNORED);
  assert.match(NOT_IGNORED, /додайте \.keylang\/ у \.gitignore — keylang init це робить$/);
  say(s, "/help");
  say(s, "/new");
  assert.deepEqual(messages(), [], "said once a session");
  assert.ok(!existsSync(join(root, ".keylang")), "nothing written");
  writeFileSync(join(root, ".gitignore"), ".keylang/\n");
  say(s, "/check");
  const log = todaysLog(root).text ?? "";
  assert.match(log, /^# chat \d{4}-\d\d-\d\d\n\n## \d\d:\d\d\n\n\*\*ти:\*\* \/check\n\n\*\*скрепка:\*\* ✗ /);
  assert.doesNotMatch(log, /\/help/, "what was said before is not written after");
});

test("tui-clip-memory: Browse and a cancelled request write no log: .keylang/chat/ does not appear", async (t) => {
  const browsed = checkoutRepo(t);
  rmSync(join(browsed, "keylang.json"));
  const b = session(browsed);
  t.after(() => b.app.close());
  await b.app.idle();
  b.send(KEY.down);
  b.send(KEY.enter);
  await b.app.idle();
  assert.equal(b.app.state.config.kind, "missing-config");
  assert.equal(b.app.state.start, null, "browsing");
  const before = treeBytes(browsed);
  b.send(KEY.f7);
  say(b, "/check");
  say(b, "/help");
  assert.equal(b.app.state.clip.chat.messages.length, 4, "answers, and nothing said about the log");
  say(b, "/new");
  assert.deepEqual(treeBytes(browsed), before, "Browse writes nothing");
  assert.ok(!existsSync(join(browsed, ".keylang/chat")));

  const root = checkoutRepo(t);
  withConfig(root, AGENT);
  const model = await mockModel(t, "late", 10_000);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.f7);
  say(s, "що робить buy?");
  await waitUntil(() => model.prompts.length === 1, "the request");
  await esc(s.send);
  assert.equal(s.app.state.clip.chat.messages.at(-1)?.text, "скасовано");
  await waitUntil(() => model.aborted === 1, "the request dropped");
  await s.app.idle();
  assert.ok(!existsSync(join(root, ".keylang/chat")), "a cancelled request is no exchange");
  // Outside git the log is written: the next exchange, without the cancelled one.
  say(s, "/help");
  const log = todaysLog(root).text ?? "";
  assert.match(log, /\*\*ти:\*\* \/help\n/);
  assert.doesNotMatch(log, /що робить buy|скасовано/);
});

test("tui-clip-memory: check --changed and map do not see .keylang/chat/: the snapshot, the changed files and the map stay as they were", async (t) => {
  const root = committedCheckout(t, { ".gitignore": ".keylang/\n" });
  const cli = (args: string[]): { status: number | null; stdout: string } => {
    const run = spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: "utf8" });
    return { status: run.status, stdout: run.stdout };
  };
  assert.equal(cli(["map"]).status, 0);
  gitRun(root, ["add", "."]);
  gitRun(root, ["commit", "-q", "-m", "map"]);
  const changed = cli(["check", "--changed", "--format", "json"]);
  const snapshot = (JSON.parse(cli(["check", "--format", "json"]).stdout) as { snapshotId: string }).snapshotId;
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.f7);
  say(s, "/check");
  say(s, "/help");
  assert.ok(todaysLog(root).text?.includes("**ти:** /help"), "the log is written");
  assert.deepEqual(cli(["check", "--changed", "--format", "json"]), changed);
  assert.equal((JSON.parse(cli(["check", "--format", "json"]).stdout) as { snapshotId: string }).snapshotId, snapshot);
  assert.equal(cliMapCheck(root).status, 0, "the map is current");
  // Where git does not ignore it, a log is still no change: keylang's own state under .keylang/.
  const plain = committedCheckout(t);
  mkdirSync(join(plain, ".keylang/chat"), { recursive: true });
  writeFileSync(join(plain, chatLogPath("2026-10-06")), "# chat 2026-10-06\n\n## 14:05\n\n**ти:** /check\n");
  assert.deepEqual([...gitChangedFiles(plain, "HEAD").paths], []);
});

test("tui-clip-memory: the log's blocks read back as the history — a message's other lines indented, a blank line, a heading or a label inside it; a section learns its models; tui.json names a wrong field and keeps the others", () => {
  const exchange = { you: "що це?", clip: "Ось:\n\n## не розділ\n**ти:** не мітка\n    code", agent: null, proposal: "keylang/flows/a.md" };
  const one = withExchange(null, "2026-10-06", "14:05", exchange, false);
  assert.equal(one, "# chat 2026-10-06\n\n## 14:05\n\n**ти:** що це?\n\n**скрепка:** Ось:\n\n  ## не розділ\n  **ти:** не мітка\n      code\n\n**пропозиція:** keylang/flows/a.md\n");
  assert.deepEqual(lastConversation(one), [
    { role: "you", text: "що це?" },
    { role: "clip", text: "Ось:\n\n## не розділ\n**ти:** не мітка\n    code\nпропозиція: keylang/flows/a.md" },
  ]);
  // The conversation goes on: its heading names each model that answered in it, once.
  const two = withExchange(one, "2026-10-06", "14:07", { you: "а далі?", clip: "нічого", agent: "cli:claude", proposal: null }, true);
  const three = withExchange(two, "2026-10-06", "14:08", { you: "точно?", clip: "так", agent: "cli:claude", proposal: null }, true);
  assert.equal(three.match(/^## .*$/gm)?.join("|"), "## 14:05 · cli:claude");
  assert.equal(lastConversation(three)?.length, 6);
  // An answer with nothing to say but its proposal; a section of `/new`; a log with no section.
  const bare = withExchange(withSection(three, "2026-10-06", "15:00"), "2026-10-06", "15:01", { you: "лише блок", clip: "", agent: "cli:codex", proposal: "keylang/flows/b.md" }, true);
  assert.equal(bare.match(/^## .*$/gm)?.at(-1), "## 15:00 · cli:codex");
  assert.deepEqual(lastConversation(bare), [{ role: "you", text: "лише блок" }, { role: "clip", text: "пропозиція: keylang/flows/b.md" }]);
  assert.equal(lastConversation("# chat 2026-10-06\n"), null);

  const file = "/home/u/.config/keylang/tui.json";
  assert.deepEqual(parsePlace(file, { editor: {}, assistant: { clip: null } }), { clip: null, window: null });
  assert.throws(() => parsePlace(file, [1]), { message: `${file}: must be a JSON object, got [1]` });
  assert.throws(() => parsePlace(file, { assistant: { clip: { x: -1, y: 3 } } }), { message: `${file}: \`assistant.clip.x\` must be an integer, at least 0, got -1` });
  assert.throws(() => parsePlace(file, { assistant: { window: { x: 1, y: 1, cols: 40 } } }), { message: `${file}: \`assistant.window.rows\` is missing` });
  assert.throws(() => parsePlace(file, { assistant: { window: { x: 1, y: 1, cols: 20, rows: 10 } } }), { message: `${file}: \`assistant.window.cols\` must be an integer, at least 30, got 20` });
  assert.throws(() => parsePlace(file, { assistant: { clip: { x: 1, y: 1, z: 1 } } }), { message: `${file}: unknown field \`assistant.clip.z\` (known: x, y)` });
  const place = { clip: null, window: { x: 2, y: 3, cols: 40, rows: 10 } };
  assert.equal(withPlace('{"editor":{"theme":"dark"},"assistant":{"clip":{"x":1,"y":1},"voice":"quiet"}}', place), `${JSON.stringify({ editor: { theme: "dark" }, assistant: { voice: "quiet", window: place.window } }, null, 2)}\n`);
  assert.equal(withPlace("{ broken", place), `${JSON.stringify({ assistant: { window: place.window } }, null, 2)}\n`);
});
