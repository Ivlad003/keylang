// The clip's chat window (ADR 0021, .scratch/tui-clip/02): moved by its top
// edge and resized by its bottom-right corner inside the terminal, the focus
// between it and the editor, its input line and history, the keys that do
// what the mouse does, the help and the palette over it, and the window of
// a narrow terminal.

import assert from "node:assert/strict";
import { test } from "node:test";
import { checkoutRepo, click, drag, KEY, locate } from "./tui-fixture.ts";
import { esc, session, treeBytes } from "./tui-helpers.ts";

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

/** A row of the window's inside, frame included: 0 is the first history row. */
function windowRow(lines: readonly string[], row: number): string {
  const w = windowAt(lines)!;
  return lines[w.y + 1 + row]!.slice(w.x, w.x + w.width);
}

/** The window's input line, frame included. */
function inputRow(lines: readonly string[]): string {
  const w = windowAt(lines)!;
  return lines[w.y + w.height - 2]!.slice(w.x, w.x + w.width);
}

/** Alt (and Shift) with an arrow, as xterm sends it: A up, B down, C right, D left. */
const alt = (arrow: "A" | "B" | "C" | "D", shift = false): string => `\x1b[1;${shift ? 4 : 3}${arrow}`;
const wheelUp = (x: number, y: number): string => `\x1b[<64;${x + 1};${y + 1}M`;
const PAGE_DOWN = "\x1b[6~";
const PAGE_UP = "\x1b[5~";

test("tui-clip-window: a drag by the top edge moves the window and one by its bottom-right corner resizes it; both stop at the terminal's edges and at 30×7", async (t) => {
  const root = checkoutRepo(t);
  const before = treeBytes(root);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.f7);
  const w = windowAt(s.lines())!;
  assert.deepEqual({ width: w.width, height: w.height }, { width: 40, height: 10 });
  s.send(drag({ x: w.x + 6, y: w.y }, { x: w.x + 6 - 20, y: w.y - 5 }));
  assert.deepEqual(windowAt(s.lines()), { ...w, x: w.x - 20, y: w.y - 5 });
  // Past the top-left corner: under the title row, at the left edge.
  s.send(drag({ x: w.x - 14, y: w.y - 5 }, { x: 0, y: 0 }));
  assert.deepEqual(windowAt(s.lines()), { x: 0, y: 1, width: 40, height: 10 });
  // Past the bottom-right corner, onto the status line: at the right edge, above the detail line.
  s.send(drag({ x: 6, y: 1 }, { x: 109, y: 29 }));
  assert.deepEqual(windowAt(s.lines()), { x: 70, y: 18, width: 40, height: 10 });
  assert.doesNotMatch(s.lines().at(-1)!, /[╭╮╰╯]/, "the status line is not covered");
  s.send(drag({ x: 76, y: 18 }, { x: 16, y: 5 }));
  assert.deepEqual(windowAt(s.lines()), { x: 10, y: 5, width: 40, height: 10 });
  // The corner: the top-left stays; past the edges the window ends at them, below the minimum it is 30×7.
  s.send(drag({ x: 49, y: 14 }, { x: 59, y: 17 }));
  assert.deepEqual(windowAt(s.lines()), { x: 10, y: 5, width: 50, height: 13 });
  s.send(drag({ x: 59, y: 17 }, { x: 200, y: 200 }));
  assert.deepEqual(windowAt(s.lines()), { x: 10, y: 5, width: 100, height: 23 });
  s.send(drag({ x: 109, y: 27 }, { x: 0, y: 0 }));
  assert.deepEqual(windowAt(s.lines()), { x: 10, y: 5, width: 30, height: 7 });
  // `✕` folds it.
  s.send(click(37, 5));
  assert.equal(windowAt(s.lines()), null);
  assert.deepEqual(treeBytes(root), before, "the window writes nothing");
});

test("tui-clip-window: a terminal resized from 110×30 to 70×20 keeps the window and the clip inside, and a smaller one the window's size within it", async (t) => {
  const s = session(checkoutRepo(t));
  t.after(() => s.app.close());
  await s.app.idle();
  const clip = locate(s.lines(), "╭─◕◕╮");
  s.send(drag({ x: clip.x + 2, y: clip.y + 1 }, { x: 109, y: 29 }));
  assert.deepEqual(locate(s.lines(), "╭─◕◕╮"), { x: 105, y: 26 });
  s.send(KEY.f7);
  const w = windowAt(s.lines())!;
  s.send(drag({ x: w.x + 6, y: w.y }, { x: 109, y: 29 }));
  assert.deepEqual(windowAt(s.lines()), { x: 70, y: 18, width: 40, height: 10 });
  s.vt.resize(70, 20);
  s.app.resize(70, 20);
  const small = windowAt(s.lines())!;
  assert.deepEqual(small, { x: 30, y: 8, width: 40, height: 10 }, "moved in whole, above the detail line");
  s.send(KEY.f7);
  const moved = locate(s.lines(), "╭─◕◕╮");
  assert.deepEqual(moved, { x: 65, y: 16 }, "the clip moved in too");
  // Lower than the window: it is no taller than the terminal lets it be.
  s.vt.resize(62, 12);
  s.app.resize(62, 12);
  s.send(KEY.f7);
  const low = windowAt(s.lines())!;
  assert.deepEqual({ y: low.y, height: low.height }, { y: 1, height: 9 });
  assert.ok(low.x + low.width <= 62);
});

test("tui-clip-window: the focused window takes j, q, ? and letters while the editor's cursor stays; a click in the editor takes the keys back and the window stays; F7, Esc and a click inside move the focus", async (t) => {
  const s = session(checkoutRepo(t));
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.f7);
  const cursor = { ...s.app.state.cursor };
  for (const ch of "jkq?:i") s.send(ch);
  assert.deepEqual(s.app.state.cursor, cursor);
  assert.equal(s.app.state.mode, "view");
  assert.equal(s.app.state.help, false);
  assert.equal(s.app.state.prompt, null);
  assert.match(inputRow(s.lines()), /^│ > jkq\?:i +│$/);
  const w = windowAt(s.lines())!;
  assert.deepEqual(s.app.frame().cursor, { x: w.x + 10, y: w.y + w.height - 2 }, "the terminal's cursor is in the input line");
  // A click in the editor: the keys go there, the window stays with its text.
  s.send(click(10, 3));
  assert.equal(s.app.state.cursor.line, 2);
  s.send("j");
  assert.equal(s.app.state.cursor.line, 3);
  assert.deepEqual(windowAt(s.lines()), w);
  assert.match(inputRow(s.lines()), /^│ > jkq\?:i +│$/);
  // F7: the open window gets the focus; F7 again folds it.
  s.send(KEY.f7);
  s.send("x");
  s.send(KEY.f7);
  assert.equal(windowAt(s.lines()), null);
  // A click inside the window gives it the focus; Esc folds the focused window, and what was typed stays.
  s.send(KEY.f7);
  s.send(click(10, 3));
  s.send(click(w.x + 5, w.y + 4));
  s.send("y");
  await esc(s.send);
  assert.equal(windowAt(s.lines()), null);
  assert.equal(s.app.state.cursor.line, 2, "the editor got none of it");
  s.send(KEY.f7);
  assert.match(inputRow(s.lines()), /^│ > jkq\?:ixy +│$/);
});

test("tui-clip-window: Enter puts the line into the history after ти ›, a paste is one line, a long line scrolls; the wheel and PgUp over the window scroll the history, not the editor", async (t) => {
  const s = session(checkoutRepo(t));
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.f7);
  for (const ch of "чому save позначено ◌?") s.send(ch);
  s.send(KEY.enter);
  assert.match(windowRow(s.lines(), 0), /^│ ти › чому save позначено ◌\? +│$/);
  assert.match(inputRow(s.lines()), /^│ > +│$/, "the input line is empty");
  s.send(KEY.enter);
  assert.equal(s.app.state.clip.chat.messages.length, 1, "an empty Enter sends nothing");
  // A paste is one line: its breaks are spaces.
  s.send("\x1b[200~first line\nsecond line\x1b[201~");
  assert.match(inputRow(s.lines()), /^│ > first line second line +│$/);
  s.send(KEY.enter);
  // A message longer than the window wraps under its text.
  for (const ch of "a long message about the flow checkout and its steps in the window") s.send(ch);
  s.send(KEY.enter);
  assert.match(windowRow(s.lines(), 2), /^│ ти › a long message about the flow +│$/);
  assert.match(windowRow(s.lines(), 3), /^│ {6}checkout and its steps in the +│$/);
  // A line wider than the input scrolls: its end stays in sight, `…` marks the cut.
  for (const ch of "0123456789".repeat(5)) s.send(ch);
  assert.match(inputRow(s.lines()), /^│ > …\d{33} │$/);
  assert.match(inputRow(s.lines()), /56789 │$/);
  s.send(KEY.enter);
  // More messages than rows: the newest at the bottom; the wheel over the window goes back, the editor stays.
  for (let i = 1; i <= 12; i++) {
    for (const ch of `message ${i}`) s.send(ch);
    s.send(KEY.enter);
  }
  assert.match(s.text(), /ти › message 12/);
  assert.doesNotMatch(s.text(), /ти › чому save/);
  const top = s.app.state.top;
  const w = windowAt(s.lines())!;
  for (let i = 0; i < 10; i++) s.send(wheelUp(w.x + 5, w.y + 3));
  assert.match(windowRow(s.lines(), 0), /^│ ти › чому save позначено/);
  assert.equal(s.app.state.top, top, "the editor did not scroll");
  for (let i = 0; i < 5; i++) s.send(PAGE_DOWN);
  assert.match(s.text(), /ти › message 12/);
  // A new message shows the end of the history, wherever it was scrolled to.
  s.send(PAGE_UP);
  assert.doesNotMatch(s.text(), /ти › message 12/);
  for (const ch of "last") s.send(ch);
  s.send(KEY.enter);
  assert.match(windowRow(s.lines(), 6), /^│ ти › last +│$/);
  assert.equal(s.app.state.top, top);
});

test("tui-clip-window: Alt+arrows and Alt+Shift+arrows move and resize the window as a drag does; the palette's «Скрепка: повернути на місце» puts the clip and the window back", async (t) => {
  const root = checkoutRepo(t);
  const keys = session(root);
  const mouse = session(root);
  t.after(() => keys.app.close());
  t.after(() => mouse.app.close());
  await keys.app.idle();
  await mouse.app.idle();
  keys.send(KEY.f7);
  mouse.send(KEY.f7);
  const w = windowAt(keys.lines())!;
  for (let i = 0; i < 4; i++) keys.send(alt("D"));
  for (let i = 0; i < 2; i++) keys.send(alt("A"));
  mouse.send(drag({ x: w.x + 6, y: w.y }, { x: w.x + 2, y: w.y - 2 }));
  assert.deepEqual(windowAt(keys.lines()), { ...w, x: w.x - 4, y: w.y - 2 });
  assert.deepEqual(windowAt(keys.lines()), windowAt(mouse.lines()));
  for (let i = 0; i < 3; i++) keys.send(alt("C", true));
  keys.send(alt("B", true));
  const m = windowAt(mouse.lines())!;
  mouse.send(drag({ x: m.x + m.width - 1, y: m.y + m.height - 1 }, { x: m.x + m.width + 2, y: m.y + m.height }));
  assert.deepEqual(windowAt(keys.lines()), { x: w.x - 4, y: w.y - 2, width: 43, height: 11 });
  assert.deepEqual(windowAt(keys.lines()), windowAt(mouse.lines()));
  for (let i = 0; i < 20; i++) keys.send(alt("D", true));
  assert.equal(windowAt(keys.lines())!.width, 30, "not below the minimum");
  // The clip dragged away too; the palette puts both back.
  const corner = locate(keys.lines(), "╭─◕◕╮");
  keys.send(drag({ x: corner.x + 2, y: corner.y + 1 }, { x: 10, y: 3 }));
  assert.notDeepEqual(locate(keys.lines(), "╭─◕◕╮"), corner);
  keys.send(KEY.ctrlP);
  for (const ch of "скрепка") keys.send(ch);
  assert.equal(keys.app.state.prompt?.ids?.[0], "clip-reset");
  keys.send(KEY.enter);
  assert.equal(keys.app.state.prompt, null);
  assert.deepEqual(windowAt(keys.lines()), w);
  assert.deepEqual(locate(keys.lines(), "╭─◕◕╮"), corner);
});

test("tui-clip-window: with the window open the help and the palette draw over it, and their keys and clicks do not reach it", async (t) => {
  const s = session(checkoutRepo(t));
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.f7);
  for (const ch of "hi") s.send(ch);
  const w = windowAt(s.lines())!;
  // With the keys in the editor, `?` opens the help over the window; it takes its keys and clicks.
  s.send(click(10, 3));
  s.send("?");
  assert.equal(s.app.state.help, true);
  assert.doesNotMatch(s.text(), /◕◕ скрепка/, "the help covers the window");
  s.send(click(w.x + 5, w.y + 4));
  assert.equal(s.app.state.clip.chat.focused, false, "a click under the help does not reach the window");
  s.send("j");
  s.send("x");
  assert.equal(s.app.state.help, false);
  assert.deepEqual(windowAt(s.lines()), w);
  // Ctrl+P from the focused window: the palette opens over it and takes the typing.
  s.send(KEY.f7);
  s.send(KEY.ctrlP);
  for (const ch of "zoom") s.send(ch);
  assert.equal(s.app.state.prompt?.kind, "palette");
  assert.equal(s.app.state.prompt?.text, "zoom");
  assert.match(inputRow(s.lines()), /^│ > hi +│$/);
  assert.match(s.text(), /Zoom: explore the map by levels/);
  await esc(s.send);
  assert.equal(s.app.state.prompt, null);
  s.send("!");
  assert.match(inputRow(s.lines()), /^│ > hi! +│$/, "the window has the keys again");
});

test("tui-clip-window: on 50×20 the window takes the width above the detail line, and neither a drag nor Alt+arrows change it", async (t) => {
  const s = session(checkoutRepo(t), { cols: 50, rows: 20 });
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.f7);
  const w = windowAt(s.lines())!;
  assert.deepEqual(w, { x: 0, y: 10, width: 50, height: 8 });
  s.send(drag({ x: 10, y: 10 }, { x: 5, y: 2 }));
  s.send(drag({ x: 49, y: 17 }, { x: 30, y: 12 }));
  assert.deepEqual(windowAt(s.lines()), w);
  s.send(alt("A"));
  assert.match(s.app.state.message ?? "", /narrow terminal/);
  s.send(alt("D", true));
  assert.deepEqual(windowAt(s.lines()), w);
  for (const ch of "hi") s.send(ch);
  s.send(KEY.enter);
  assert.match(windowRow(s.lines(), 0), /^│ ти › hi +│$/);
});
