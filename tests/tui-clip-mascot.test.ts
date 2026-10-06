// The clip in the editor's corner (ADR 0021, .scratch/tui-clip/01): where
// it stands, a click and F7 opening its window, a drag moving it inside the
// terminal, yielding to the editor's cursor, the badge on a narrow terminal,
// `assistant.clip` in keylang.json, MERGE, and that it writes nothing.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { layout } from "../src/tui/view.ts";
import { checkoutRepo, CHECKOUT_FLOW, click, drag, KEY, locate } from "./tui-fixture.ts";
import { BIN, FLOW_PATH, PAID, propose, session, treeBytes, withConfig } from "./tui-helpers.ts";

const CLIP = ["╭─◕◕╮", "│╭─╮│", "╰╯ ╰╯"];

/** The clip's top-left cell on screen, or null when it is not drawn. */
function clipAt(lines: readonly string[]): { x: number; y: number } | null {
  for (let y = 0; y + 2 < lines.length; y++) {
    const x = lines[y]!.indexOf(CLIP[0]!);
    if (x !== -1 && lines[y + 1]!.slice(x, x + 5) === CLIP[1] && lines[y + 2]!.slice(x, x + 5) === CLIP[2]) return { x, y };
  }
  return null;
}

/** The checkout flow with 30 long lines of prose after it: text under the clip's corner. */
const LONG_FLOW = `${CHECKOUT_FLOW}${Array.from({ length: 30 }, (_, i) => `Note ${String(i + 1).padStart(2, "0")}: ${"abcdefghijklmnopqrstuvwxyz".repeat(4)}`).join("\n")}\n`;

test("tui-clip: the clip stands in the editor's bottom-right corner; a click opens its window, F7 folds and opens it", async (t) => {
  const root = checkoutRepo(t);
  const before = treeBytes(root);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  const editor = layout(s.app.state).editor;
  const corner = { x: editor.x + editor.width - 6, y: editor.y + editor.height - 4 };
  assert.deepEqual(clipAt(s.lines()), corner, s.text());
  assert.doesNotMatch(s.text(), /скрепка/, "no window and no words before a click");
  // A press and a release in the same cell: the window over the clip, its right edge at the clip's.
  s.send(click(corner.x + 2, corner.y + 1));
  const title = locate(s.lines(), "╭─ ◕◕ скрепка ");
  const right = s.lines()[title.y]!.indexOf("╮", title.x);
  assert.equal(right, corner.x + 4, s.text());
  assert.ok(title.y < corner.y, "above the clip");
  assert.deepEqual(clipAt(s.lines()), corner, "the clip stays where it was");
  s.send(KEY.f7);
  assert.doesNotMatch(s.text(), /скрепка/);
  s.send(KEY.f7);
  assert.match(s.text(), /╭─ ◕◕ скрепка /);
  // The footer and the help name F7.
  assert.match(s.lines().at(-1)!, /F7 chat/);
  s.send(KEY.f7);
  s.send("?");
  assert.match(s.text(), /F7 \/ clip click\s+the clip's chat/);
  s.send("x");
  assert.deepEqual(treeBytes(root), before, "the clip writes nothing");
});

test("tui-clip: a drag moves the clip and shows the text under it again; past an edge, onto the title or the status line it stops at the edge", async (t) => {
  const root = checkoutRepo(t, { [FLOW_PATH]: LONG_FLOW });
  const before = treeBytes(root);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  const at = clipAt(s.lines())!;
  const source = LONG_FLOW.split("\n");
  // What the editor shows of a source line in a cell: the gutter is 6 cells, nothing is scrolled.
  const text = (x: number, y: number, width: number): string => (source[y - 1] ?? "").padEnd(x + width).slice(x - 6, x - 6 + width);
  assert.notEqual(text(at.x, at.y, 5).trim(), "", "there is text under the clip");
  s.send(drag({ x: at.x + 2, y: at.y + 1 }, { x: at.x + 2 - 30, y: at.y + 1 - 10 }));
  assert.deepEqual(clipAt(s.lines()), { x: at.x - 30, y: at.y - 10 });
  for (let dy = 0; dy < 3; dy++) assert.equal(s.lines()[at.y + dy]!.slice(at.x, at.x + 5), text(at.x, at.y + dy, 5), "the text under the old place is back");
  assert.equal(s.app.state.clip.chat.open, false, "a drag is no click");
  // Past the bottom-right corner, onto the status line: the clip stops at the terminal's right edge, above the status line.
  const moved = clipAt(s.lines())!;
  s.send(drag({ x: moved.x + 2, y: moved.y + 1 }, { x: 109, y: 29 }));
  assert.deepEqual(clipAt(s.lines()), { x: 105, y: 26 });
  assert.doesNotMatch(s.lines().at(-1)!, /[╭╮╰╯]/, "the status line is not covered");
  // Onto the title, past the left edge: the first row under the title.
  s.send(drag({ x: 107, y: 27 }, { x: 0, y: 0 }));
  assert.deepEqual(clipAt(s.lines()), { x: 0, y: 1 });
  assert.match(s.lines()[0]!, /^ keylang · keylang\/flows\/checkout\.md/);
  assert.deepEqual(treeBytes(root), before, "a drag writes nothing");
});

test("tui-clip: the editor's cursor under the clip is shown, and that frame draws no clip", async (t) => {
  // The cursor's line runs under the clip: a word at the text column under it.
  const corner = { x: 71, y: 24 };
  const lines = LONG_FLOW.split("\n");
  lines[corner.y - 1] = `${"x".repeat(corner.x + 1 - 6)}MARK and more text`;
  const s = session(checkoutRepo(t, { [FLOW_PATH]: lines.join("\n") }));
  t.after(() => s.app.close());
  await s.app.idle();
  assert.deepEqual(clipAt(s.lines()), corner);
  s.send("/");
  for (const ch of "MARK") s.send(ch);
  s.send(KEY.enter);
  assert.deepEqual(s.app.state.cursor, { line: corner.y - 1, col: corner.x + 1 - 6 });
  assert.equal(clipAt(s.lines()), null, "the clip yields to the cursor in the view");
  assert.equal(s.lines()[corner.y]!.slice(corner.x, corner.x + 5), "xMARK", "the text under it is seen");
  s.send("i");
  assert.deepEqual(s.app.frame().cursor, { x: corner.x + 1, y: corner.y }, "the terminal shows the cursor there");
  assert.equal(clipAt(s.lines()), null);
  // The cursor leaves the clip's cells: it is back.
  s.send("\x1b[H");
  assert.deepEqual(clipAt(s.lines()), corner);
});

test("tui-clip: below 60 columns or 12 rows the clip is a badge in the status line; a click on it opens the window", async (t) => {
  const root = checkoutRepo(t);
  const s = session(root, { cols: 50, rows: 20 });
  t.after(() => s.app.close());
  await s.app.idle();
  assert.equal(clipAt(s.lines()), null);
  assert.match(s.lines().at(-1)!, /^ ◕◕  ✗ 0 /);
  s.send(click(2, 19));
  assert.match(s.text(), /╭─ ◕◕ скрепка /);
  const low = session(root, { cols: 100, rows: 11 });
  t.after(() => low.app.close());
  await low.app.idle();
  assert.equal(clipAt(low.lines()), null);
  assert.match(low.lines().at(-1)!, /^ ◕◕ /);
});

test("tui-clip: assistant.clip false hides the clip and its badge and F7 still opens the window; another field is an error naming it; the snapshot does not change", async (t) => {
  const root = checkoutRepo(t);
  const plain = session(root);
  await plain.app.idle();
  const snapshotId = plain.app.state.analysis?.snapshot?.snapshotId;
  plain.app.close();
  assert.ok(snapshotId);
  withConfig(root, { assistant: { clip: false } });
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  assert.equal(clipAt(s.lines()), null);
  assert.equal(s.app.state.analysis?.snapshot?.snapshotId, snapshotId, "assistant is no part of the snapshot");
  s.send(KEY.f7);
  assert.match(s.text(), /╭─ ◕◕ скрепка /);
  const narrow = session(root, { cols: 50, rows: 20 });
  t.after(() => narrow.app.close());
  await narrow.app.idle();
  assert.doesNotMatch(narrow.lines().at(-1)!, /◕◕/, "no badge either");
  // Fields other than `clip`, and a `clip` that is not a boolean, name the field.
  withConfig(root, { assistant: { x: 1 } });
  const unknown = session(root);
  t.after(() => unknown.app.close());
  await unknown.app.idle();
  assert.match(unknown.lines().at(-1)!, /invalid keylang\.json: unknown field `assistant\.x`/);
  const cli = spawnSync(process.execPath, [BIN, "check"], { cwd: root, encoding: "utf8" });
  assert.equal(cli.status, 2);
  assert.match(cli.stderr, /keylang\.json: unknown field `assistant\.x`/);
  withConfig(root, { assistant: { clip: "no" } });
  const wrong = session(root);
  t.after(() => wrong.app.close());
  await wrong.app.idle();
  assert.match(wrong.lines().at(-1)!, /invalid keylang\.json: `assistant\.clip` must be true or false, got "no"/);
});

test("tui-clip: during MERGE a click on the clip says to finish the merge first, and MERGE stays", async (t) => {
  const root = checkoutRepo(t);
  propose(root, FLOW_PATH, PAID);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("m");
  assert.equal(s.app.state.mode, "merge");
  const at = clipAt(s.lines())!;
  assert.ok(at, "the clip is seen during MERGE");
  s.send(click(at.x + 2, at.y + 1));
  assert.match(s.lines().at(-2)!, /finish the merge first: w writes the decided hunks, Esc cancels/);
  assert.equal(s.app.state.mode, "merge");
  assert.equal(s.app.state.clip.chat.open, false);
  // A drag is a click too, and F7 says the same.
  s.send(drag({ x: at.x + 2, y: at.y + 1 }, { x: 10, y: 5 }));
  assert.deepEqual(clipAt(s.lines()), at);
  s.send(KEY.f7);
  assert.match(s.app.state.message ?? "", /^finish the merge first/);
  assert.equal(s.app.state.clip.chat.open, false);
  assert.equal(s.app.state.mode, "merge");
});
