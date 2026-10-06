// The mouse on the zoom screen (.scratch/c4-zoom/issues/10): the buttons of
// its header do what their keys do, a click on a row only selects it, and on
// a narrow terminal every button stays. In a virtual terminal.

import assert from "node:assert/strict";
import { test } from "node:test";
import { App } from "../src/tui/app.ts";
import { ZOOM_ROOT } from "../src/tui/zoom.ts";
import { checkoutRepo, click, KEY, locate } from "./tui-fixture.ts";
import { VirtualTerminal } from "./vt.ts";

function session(root: string, cols = 120, rows = 30): { app: App; send: (keys: string) => void; lines: () => string[] } {
  const vt = new VirtualTerminal(cols, rows);
  const app = new App({ root, cols, rows });
  app.attach({ write: (ansi) => vt.feed(ansi) }, cols, rows);
  return { app, send: (keys) => app.input(keys), lines: () => vt.lines() };
}

function zoom(s: ReturnType<typeof session>): void {
  s.send(KEY.ctrlP);
  for (const ch of "zoom") s.send(ch);
  s.send(KEY.enter);
}

/** A click on the first cell of `text` on the screen. */
function press(s: ReturnType<typeof session>, text: string): void {
  const at = locate(s.lines(), text);
  s.send(click(at.x, at.y));
}

test("tui zoom mouse: [+] and [−] zoom in and out, ▾ and ▴ change the depth, [c …] and [f …] act as c and f", async (t) => {
  const s = session(checkoutRepo(t));
  t.after(() => s.app.close());
  await s.app.idle();
  zoom(s);
  assert.equal(s.app.state.zoom?.focus, ZOOM_ROOT);
  press(s, "[+]");
  assert.equal(s.app.state.zoom?.focus, "domain");
  press(s, "[−]");
  assert.equal(s.app.state.zoom?.focus, ZOOM_ROOT);
  press(s, "[+]");
  press(s, "▴");
  assert.equal(s.app.state.zoom?.depth, 2);
  press(s, "▾");
  assert.equal(s.app.state.zoom?.depth, 1);
  press(s, "[c edges]");
  assert.equal(s.app.state.zoom?.view, "edges");
  press(s, "[c nodes]");
  assert.equal(s.app.state.zoom?.view, "nodes");
  press(s, "[f flow ▾]");
  assert.equal(s.app.state.prompt?.kind, "flow");
  s.send(KEY.enter);
  assert.equal(s.app.state.zoom?.flow, "checkout");
  press(s, "[f checkout ×]");
  assert.equal(s.app.state.zoom?.flow, null);
});

test("tui zoom mouse: a click on a row selects it and opens nothing; at 80 columns every button is on the screen", async (t) => {
  const root = checkoutRepo(t);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  zoom(s);
  press(s, "layer  infrastructure");
  assert.equal(s.app.state.zoom?.selected.get(ZOOM_ROOT), 2);
  assert.equal(s.app.state.zoom?.focus, ZOOM_ROOT);
  assert.equal(s.app.state.mode, "zoom");

  const narrow = session(root, 80, 24);
  t.after(() => narrow.app.close());
  await narrow.app.idle();
  zoom(narrow);
  narrow.send("+");
  narrow.send("+");
  const header = narrow.lines()[1]!;
  for (const text of ["[−]", "[+]", "▾▴]", "[c edges]", "[f flow ▾]"]) assert.ok(header.includes(text), `${text} in ${header}`);
  // The crumbs give way to the buttons: what is left of them is cut from the start.
  assert.ok(header.indexOf("[−]") > 1, header);
});
