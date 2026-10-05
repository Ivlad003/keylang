// Regressions from the review of 2026-10-05, «TUI і web»: each test drives a
// session by the bytes a terminal sends and reads what it shows or writes.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { analyze } from "../src/analyze.ts";
import { nodeFacts, summarizeNode } from "../src/explain-node.ts";
import { hover, hoverContent, hoverMarkdown, runsText, workspace } from "../src/lsp-features.ts";
import { readStats, updateStats } from "../src/stats.ts";
import { App, type AppOptions, type Surface } from "../src/tui/app.ts";
import type { OperationWorker } from "../src/tui/background.ts";
import { InputDecoder, type InputEvent } from "../src/tui/input.ts";
import { mergeRows } from "../src/tui/merge.ts";
import { ENTER, Grid, LEAVE } from "../src/tui/screen.ts";
import { runTerminal, type TerminalHost, type TerminalSignal } from "../src/tui/terminal.ts";
import { layout, navEntries, reportOverflow } from "../src/tui/view.ts";
import { clusterAt, graphemeWidth, sliceCells, stringWidth } from "../src/tui/width.ts";
import { ZOOM_ROOT } from "../src/tui/zoom.ts";
import { checkoutRepo, CHECKOUT_FLOW, click, KEY, locate, mouseMove } from "./tui-fixture.ts";
import { VirtualTerminal } from "./vt.ts";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const FLOW_PATH = "keylang/flows/checkout.md";

interface Session {
  app: App;
  vt: VirtualTerminal;
  send: (keys: string) => void;
  lines: () => string[];
  text: () => string;
}

/** A session on a virtual terminal; `surface` adds what a transport can do besides drawing. */
function session(root: string, options: { cols?: number; rows?: number; surface?: Omit<Surface, "write"> } & Pick<AppOptions, "operationWorker"> = {}): Session {
  const cols = options.cols ?? 110;
  const rows = options.rows ?? 30;
  const vt = new VirtualTerminal(cols, rows);
  const app = new App({ root, cols, rows, ...(options.operationWorker ? { operationWorker: options.operationWorker } : {}) });
  app.attach({ write: (ansi) => vt.feed(ansi), ...options.surface }, cols, rows);
  return { app, vt, send: (keys) => app.input(keys), lines: () => vt.lines(), text: () => vt.text() };
}

const tick = (): Promise<void> => new Promise((done) => setImmediate(done));
/** 200 moves over a long spec in reading mode: under a second with the rows cached, two minutes when every frame rendered them all. */
const READ_BUDGET_MS = 20_000;
const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

/** A lone ESC is the Escape key once the decoder's pause has passed. */
async function escape(s: Session): Promise<void> {
  s.send("\x1b");
  await sleep(40);
}

function lineOf(lines: readonly string[], text: string): string {
  const found = lines.find((line) => line.includes(text));
  assert.ok(found, `no line with ${text}:\n${lines.join("\n")}`);
  return found;
}

async function waitUntil(ready: () => boolean, what: string): Promise<void> {
  for (let waited = 0; !ready(); waited += 10) {
    if (waited > 15000) throw new Error(`timed out waiting for ${what}`);
    await sleep(10);
  }
}

/** A terminal and a process for `runTerminal`: what it writes, and a way to type and send signals. */
function fakeTerminal(env: NodeJS.ProcessEnv = {}): { host: TerminalHost; out: string[]; screen: () => string; suspended: () => number; type: (keys: string) => void; signal: (signal: TerminalSignal) => void } {
  const out: string[] = [];
  let suspended = 0;
  const stdin = Object.assign(new EventEmitter(), { isTTY: true, setRawMode: () => {}, setEncoding: () => {}, pause: () => {}, resume: () => {} });
  const stdout = Object.assign(new EventEmitter(), { columns: 100, rows: 30, write: (text: string) => void out.push(text) });
  let onSignal: ((signal: TerminalSignal) => void) | null = null;
  const host: TerminalHost = {
    stdin,
    stdout,
    stderr: () => {},
    env,
    listen: (listener) => {
      onSignal = listener;
      return () => (onSignal = null);
    },
    suspend: () => void suspended++,
  };
  const screen = (): string => {
    const vt = new VirtualTerminal(100, 30);
    vt.feed(out.join(""));
    return vt.text();
  };
  return { host, out, screen, suspended: () => suspended, type: (keys) => void stdin.emit("data", keys), signal: (signal) => onSignal?.(signal) };
}

/** A file in the repository, with its directories. */
function put(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

// ---------- 1, 2: .keylang/stats.json ----------

test("review-tui: Browse without keylang.json counts no completion and no merge: nothing is written to .keylang/", async (t) => {
  const root = checkoutRepo(t);
  rmSync(join(root, "keylang.json"));
  const s = session(root);
  t.after(() => s.app.close());
  assert.equal(s.app.state.start, 0, "the start screen");
  s.send("j");
  s.send(KEY.enter);
  await s.app.idle();
  assert.ok(s.app.state.analysis?.snapshot, "Browse analyses with the guessed configuration");
  s.send("i");
  for (let i = 0; i < 4; i++) s.send(KEY.down);
  s.send(KEY.end);
  s.send(KEY.enter);
  s.send("step app");
  await s.app.idle();
  assert.ok(s.app.state.completion, "the completion popup is shown");
  s.send(KEY.tab);
  assert.equal(s.app.state.completion, null, "taken");
  assert.equal(existsSync(join(root, ".keylang")), false, "a completion shown and taken writes nothing in Browse");
});

test("review-tui: a MERGE in Browse writes the merged spec but no count", async (t) => {
  const root = checkoutRepo(t);
  rmSync(join(root, "keylang.json"));
  put(root, `.keylang/proposals/${FLOW_PATH}`, CHECKOUT_FLOW_PAID);
  const s = session(root);
  t.after(() => s.app.close());
  s.send("j");
  s.send(KEY.enter);
  await s.app.idle();
  s.send("m");
  assert.equal(s.app.state.mode, "merge", s.app.state.message ?? "");
  s.send("a");
  s.send("w");
  await s.app.idle();
  assert.equal(readFileSync(join(root, FLOW_PATH), "utf8"), CHECKOUT_FLOW_PAID, "the merge the person confirmed is written");
  assert.equal(existsSync(join(root, ".keylang/stats.json")), false, "no count in Browse");
});

test("review-tui: a stats update that loses a race reads again: neither writer's count is lost", (t) => {
  const root = checkoutRepo(t);
  updateStats(root, (stats) => void (stats.drafts.agree = { proposed: 1, accepted: 0, rejected: 0 }));
  let raced = false;
  updateStats(root, (stats) => {
    // Another writer (a `draft` in a shell) lands between this read and this write.
    if (!raced) {
      raced = true;
      updateStats(root, (other) => void (other.suggestions.completion = { proposed: 1, accepted: 0, rejected: 0, ms: 0 }));
    }
    stats.drafts.agree!.accepted++;
  });
  const stats = readStats(root);
  assert.deepEqual(stats.drafts.agree, { proposed: 1, accepted: 1, rejected: 0 });
  assert.deepEqual(stats.suggestions.completion, { proposed: 1, accepted: 0, rejected: 0, ms: 0 }, "the other writer's count survives");
});

// ---------- 7: a helper that fails ----------

test("review-tui: a helper that fails is a message in the session, never an unhandled rejection", async (t) => {
  const root = checkoutRepo(t, { "keylang/features/refund.md": "# flow refund\n\n- trigger presentation.terminal.checkout\n" });
  const unhandled: unknown[] = [];
  const record = (reason: unknown): void => void unhandled.push(reason);
  process.on("unhandledRejection", record);
  t.after(() => process.off("unhandledRejection", record));
  // The worker that reads a feature's plan at HEAD fails underneath the status line's refresh.
  const worker = { featureBase: () => Promise.reject(new Error("the plan at HEAD could not be read")), close: () => {} } as unknown as OperationWorker;
  const s = session(root, { operationWorker: worker });
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(":");
  s.send("refund");
  s.send(KEY.enter);
  await s.app.idle();
  await tick();
  assert.equal(s.app.state.current, "keylang/features/refund.md");
  assert.deepEqual(unhandled, []);
  assert.match(s.app.state.message ?? "", /^error: the plan at HEAD could not be read/);
  s.send(KEY.down);
  assert.equal(s.app.state.cursor.line, 1, "the session goes on");
});

test("review-tui: keylang web logs a rejection no session handled and goes on serving", (t) => {
  const root = checkoutRepo(t);
  const script = [
    `import { serveWeb } from ${JSON.stringify(pathToFileURL(join(REPO, "src/tui/web.ts")).href)};`,
    `const server = await serveWeb({ root: ${JSON.stringify(root)}, port: 0 });`,
    `Promise.reject(new Error("a stray rejection in one session"));`,
    "await new Promise((done) => setTimeout(done, 50));",
    "const response = await fetch(`http://localhost:${server.port}/`);",
    `console.log("served", response.status);`,
    "await server.close();",
  ].join("\n");
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", timeout: 60000 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^served 200$/m);
  assert.match(result.stderr, /keylang web: unhandled rejection: Error: a stray rejection in one session/);
});

// ---------- 4, 13: keys that come together ----------

test("review-tui: outside the editor a few different keys in one chunk are commands; a long run or one with Enter is a paste", async (t) => {
  const s = session(checkoutRepo(t));
  t.after(() => s.app.close());
  await s.app.idle();
  const last = s.app.state.buffers.get(FLOW_PATH)!.text.split("\n").length - 1;
  // Keys typed while the session was busy arrive in one chunk.
  s.send("jjk");
  assert.equal(s.app.state.cursor.line, 1, "j, j, k");
  assert.equal(s.app.state.message, null);
  s.send("Gk");
  assert.equal(s.app.state.cursor.line, last - 1, "G, k");
  s.send("gj");
  assert.equal(s.app.state.cursor.line, 1, "g, j");
  // A path from the clipboard of a terminal without bracketed paste is still no string of commands.
  s.send("keylang/flows/x.md");
  assert.equal(s.app.state.cursor.line, 1);
  assert.match(s.app.state.message ?? "", /^paste: /);
  s.send("j\r");
  assert.equal(s.app.state.cursor.line, 1, "a run with Enter is pasted text, not a move and a jump");
  assert.match(s.app.state.message ?? "", /^paste: /);
});

const names = (events: readonly InputEvent[]): string[] => events.map((event) => (event.type === "key" ? `${event.ctrl ? "ctrl+" : ""}${event.alt ? "alt+" : ""}${event.name}` : event.type));

test("review-tui: input keeps a cluster whole at a chunk's end, folds CRLF and drops reports the terminal sends", () => {
  const decoder = new InputDecoder();
  // A decomposed é alone in its chunk may still go on: it waits, then is one key.
  assert.deepEqual(names(decoder.feed("e\u0301")), []);
  assert.equal(decoder.waiting, true);
  assert.deepEqual(names(decoder.flush()), ["e\u0301"]);
  // A ZWJ sequence cut by the chunk's end is one key once the next chunk ends it.
  assert.deepEqual(names(decoder.feed("👨\u200d👩")), []);
  assert.deepEqual(names(decoder.feed("\u200d👧x")), ["👨\u200d👩\u200d👧", "x"]);
  assert.deepEqual(names(decoder.feed("👨\u200d👩\u200d👧")), []);
  assert.deepEqual(names(decoder.flush()), ["👨\u200d👩\u200d👧"]);
  // Alt with a waiting cluster.
  assert.deepEqual(names(decoder.feed("\x1be\u0301")), []);
  assert.deepEqual(names(decoder.flush()), ["alt+e\u0301"]);
  // A letter typed alone is a key at once.
  assert.deepEqual(names(decoder.feed("ї")), ["ї"]);
  assert.deepEqual(names(decoder.feed("a\r\nb")), ["a", "enter", "b"]);
  // DECRPM and device attributes are reports, not Alt+[ and typed text.
  assert.deepEqual(names(decoder.feed("\x1b[?2004;1$y")), []);
  assert.deepEqual(names(decoder.feed("\x1b[?1;2c\x1b[>0;95;0cj")), ["j"]);
  assert.deepEqual(names(decoder.feed("\x1b[?2004")), [], "a report cut by the chunk's end waits");
  assert.deepEqual(names(decoder.feed(";2$yk")), ["k"]);
  assert.deepEqual(names(decoder.feed("\x1b[1;5A")), ["ctrl+up"], "keys with parameters still decode");
});

test("review-tui: a decomposed letter arriving alone in the view is one key, not e (Explain) and a mark", async (t) => {
  const s = session(checkoutRepo(t));
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("e\u0301");
  await new Promise((done) => setTimeout(done, 60));
  assert.equal(s.app.state.hover, null);
  assert.equal(s.app.state.message, null, "e did not run");
});

// ---------- 11, 12: widths and slices ----------

test("review-tui: a keycap takes two cells; invisible format characters and Hangul vowels and finals take none and are not drawn", () => {
  assert.equal(graphemeWidth("1\ufe0f\u20e3"), 2);
  assert.equal(graphemeWidth("#\u20e3"), 2);
  for (const ch of ["\u200b", "\u00ad", "\u2060", "\u200d", "\ufe0f", "\u1161", "\u11a8", "\ud7b0"]) assert.equal(graphemeWidth(ch), 0, `U+${ch.codePointAt(0)!.toString(16)}`);
  assert.equal(stringWidth("\u1100\u1161\u11a8"), 2, "a syllable written in jamo is one wide cluster");
  assert.equal(stringWidth("a\u200bb\u00adc"), 3);
  const grid = new Grid(8, 1);
  grid.write(0, 0, "1\ufe0f\u20e3a\u200bb");
  assert.equal(grid.lines()[0], "1\ufe0f\u20e3ab    ", "the keycap in two cells, the ZWSP in none");
});

test("review-tui: clusterAt maps a column inside a cluster to that cluster; sliceCells never hides a cluster in view behind the left …", () => {
  assert.equal(clusterAt("e\u0301x", 0), 0);
  assert.equal(clusterAt("e\u0301x", 1), 0, "inside é");
  assert.equal(clusterAt("e\u0301x", 2), 1);
  assert.equal(clusterAt("e\u0301x", 3), 2);
  assert.equal(sliceCells("abcdef", 2, 10), "…cdef");
  assert.equal(sliceCells("abcdefgh", 2, 4), "…cd…");
  assert.equal(sliceCells("a支付b", 2, 4), "…付b", "the cut half of a wide cluster is the marker's cell");
  assert.equal(sliceCells("abc", 5, 4), "", "scrolled past its end");
  // Scrolled as far as the report allows, the widest row ends in view.
  const rows = [{ text: `${"x".repeat(29)}y` }, { text: "short" }];
  const max = reportOverflow(rows, 20);
  assert.equal(sliceCells(rows[0]!.text, max, 20), `…${"x".repeat(18)}y`);
  assert.equal(sliceCells(rows[1]!.text, max, 20), "");
});

// ---------- 3, 5, 6, 8, 9, 10: where the screen goes ----------

test("review-tui: a file opened from the zoom screen is shown in the view; Ctrl+O, and Esc from a finding, come back to the zoom", async (t) => {
  const s = session(checkoutRepo(t));
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("z");
  assert.equal(s.app.state.mode, "zoom");
  s.send(":");
  s.send("rules");
  assert.match(s.app.state.prompt!.items[0]!, /keylang\/rules\.md/);
  s.send(KEY.enter);
  assert.equal(s.app.state.mode, "view");
  assert.equal(s.app.state.current, "keylang/rules.md");
  assert.match(s.lines()[1]!, /# rules/, "the file, not the zoom screen");
  s.send(KEY.ctrlO);
  assert.equal(s.app.state.mode, "zoom", "back where it was opened from");
  s.send(KEY.f6);
  s.send(KEY.enter);
  assert.equal(s.app.state.results.viewing, true);
  assert.equal(s.app.state.mode, "view", "the finding's line is shown, not the zoom over it");
  assert.equal(s.app.state.current, FLOW_PATH);
  assert.match(lineOf(s.lines(), "- step application.purchase.buy"), /^◌/);
  await escape(s);
  assert.equal(s.app.state.results.viewing, false);
  assert.equal(s.app.state.mode, "zoom", "Esc brings the list back over the zoom it was opened from");
});

test("review-tui: a short line after the end of a long one scrolls back and is drawn", async (t) => {
  const long = `- step application.purchase.buy ${"x".repeat(150)}`;
  const s = session(checkoutRepo(t, { [FLOW_PATH]: `# flow checkout\n\n- trigger presentation.terminal.checkout\n${long}\n- step domain.order.create\n` }));
  t.after(() => s.app.close());
  await s.app.idle();
  for (let i = 0; i < 3; i++) s.send(KEY.down);
  s.send(KEY.end);
  assert.ok(s.app.state.left > 0, "the long line scrolls to its end");
  s.send(KEY.down);
  assert.equal(s.app.state.cursor.col, "- step domain.order.create".length);
  assert.equal(s.app.state.left, 0);
  assert.match(s.text(), /5 - step domain\.order\.create/);
  assert.match(s.text(), /3 - trigger presentation\.terminal\.checkout/, "every line is drawn from its start again");
});

test("review-tui: below 60 columns F2, F4 and Tab leave the focus in the editor, where the keys still go", async (t) => {
  const s = session(checkoutRepo(t), { cols: 50, rows: 24 });
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("\x1b[12~"); // F2
  assert.equal(s.app.state.focus, "editor");
  assert.match(s.app.state.message ?? "", /side panels need 60 columns \(now 50\)/);
  s.send("\x1b[14~"); // F4
  assert.equal(s.app.state.focus, "editor");
  s.send(KEY.tab);
  assert.equal(s.app.state.focus, "editor");
  s.send("j");
  assert.equal(s.app.state.cursor.line, 1, "the keys go to the editor");
});

test("review-tui: the palette's agent context panel in edit mode leaves the focus and the cursor in the editor", async (t) => {
  const s = session(checkoutRepo(t));
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("i");
  s.send(KEY.ctrlP);
  s.send("agent context");
  s.send(KEY.enter);
  assert.equal(s.app.state.context.open, true);
  assert.equal(s.app.state.mode, "edit");
  assert.equal(s.app.state.focus, "editor");
  assert.notEqual(s.app.frame().cursor, null, "the editor's cursor is drawn");
  s.send("x");
  assert.match(s.app.state.buffers.get(FLOW_PATH)!.text, /^x# flow checkout/);
});

test("review-tui: a click below the last item of the navigation opens nothing", async (t) => {
  const s = session(checkoutRepo(t));
  t.after(() => s.app.close());
  await s.app.idle();
  const nav = layout(s.app.state).nav!;
  assert.ok(navEntries(s.app.state).length < nav.height - 3, "the list ends above the panel's bottom");
  const before = { current: s.app.state.current, mode: s.app.state.mode, cursor: { ...s.app.state.cursor }, focus: s.app.state.focus, navIndex: s.app.state.navIndex };
  s.send(click(nav.x + 4, nav.y + nav.height - 2));
  assert.deepEqual({ current: s.app.state.current, mode: s.app.state.mode, cursor: s.app.state.cursor, focus: s.app.state.focus, navIndex: s.app.state.navIndex }, before);
});

test("review-tui: the wheel stops at the last row in MERGE and over the navigation", async (t) => {
  const root = checkoutRepo(t);
  put(root, `.keylang/proposals/${FLOW_PATH}`, "# flow checkout\n\nChanged.\n\n- trigger presentation.terminal.checkout\n- step application.purchase.buy\n");
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("m");
  assert.equal(s.app.state.mode, "merge");
  const merge = s.app.state.merge!;
  const rows = mergeRows(merge.base, merge.hunks).length;
  for (let i = 0; i < 30; i++) s.send("\x1b[<65;10;10M");
  assert.equal(merge.top, rows - 1);
  assert.ok(s.lines()[2]!.trim() !== "", "the body still shows a row");
  await escape(s);
  const nav = layout(s.app.state).nav!;
  for (let i = 0; i < 40; i++) s.send(`\x1b[<65;${nav.x + 5};10M`);
  assert.equal(s.app.state.navTop, navEntries(s.app.state).length - 1);
});

// ---------- 14: Ctrl+Z ----------

test("review-tui: Ctrl+Z in the view gives the screen back and stops keylang; SIGCONT repaints; in the editor it still undoes", async (t) => {
  const term = fakeTerminal();
  const running = runTerminal(checkoutRepo(t), term.host);
  t.after(() => term.signal("SIGTERM"));
  await waitUntil(() => /✗ 0/.test(term.out.join("")), "the first analysis");
  // A terminal in raw mode sends Ctrl+Z as a byte, not as SIGTSTP.
  term.type("\x1a");
  assert.equal(term.suspended(), 1);
  assert.equal(term.out.at(-1), LEAVE, "the screen is restored before the stop");
  const stopped = term.out.length;
  term.signal("SIGCONT");
  assert.equal(term.out[stopped], ENTER);
  assert.match(term.out.slice(stopped).join(""), /\x1b\[2J/, "a full repaint");
  term.type("i");
  term.type("x");
  await waitUntil(() => /x# flow checkout/.test(term.screen()), "the typed x");
  term.type("\x1a");
  assert.equal(term.suspended(), 1, "no stop while editing");
  await waitUntil(() => !/x# flow checkout/.test(term.screen()), "the undo");
  term.signal("SIGTERM");
  assert.equal(await running, 0);
});

test("review-tui: Ctrl+Z where the surface cannot stop (keylang web) does nothing", async (t) => {
  const s = session(checkoutRepo(t));
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("j");
  s.send("\x1a");
  assert.equal(s.app.state.mode, "view");
  assert.equal(s.app.state.cursor.line, 1);
  assert.equal(s.app.state.message, null);
});

// ---------- 15: what the session says ----------

test("review-tui: a jump to code in a GUI $EDITOR says where it opened, or that the editor did not start", { skip: process.platform === "win32" }, async (t) => {
  const tools = mkdtempSync(join(tmpdir(), "keylang-editor-"));
  t.after(() => rmSync(tools, { recursive: true, force: true }));
  const code = join(tools, "code");
  writeFileSync(code, "#!/bin/sh\nexit 0\n");
  chmodSync(code, 0o755);
  const cases: [string, RegExp][] = [
    [code, /src\/application\/purchase\.ts:3 opened in code/],
    [join(tools, "missing", "code"), /code: could not start \(spawn \S*missing\/code ENOENT/],
  ];
  for (const [editor, note] of cases) {
    const term = fakeTerminal({ EDITOR: editor });
    const running = runTerminal(checkoutRepo(t), term.host);
    await waitUntil(() => /✗ 0/.test(term.out.join("")), "the first analysis");
    for (let i = 0; i < 5; i++) term.type(KEY.down);
    term.type(KEY.enter);
    await waitUntil(() => note.test(term.screen()), `the note about ${editor}`);
    term.signal("SIGTERM");
    assert.equal(await running, 0);
  }
});

test("review-tui: a paste where no text goes says where it can go, mode by mode", async (t) => {
  const root = checkoutRepo(t);
  put(root, `.keylang/proposals/${FLOW_PATH}`, CHECKOUT_FLOW_PAID);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  const paste = (): string => {
    s.send("\x1b[200~src/a.ts\x1b[201~");
    return s.app.state.message ?? "";
  };
  assert.match(paste(), /^paste: press i to edit first/);
  s.send("m");
  assert.equal(s.app.state.mode, "merge");
  assert.match(paste(), /^paste: MERGE takes no text: finish it \(w writes, Esc cancels\), then i edits/);
  await escape(s);
  for (let i = 0; i < 5; i++) s.send(KEY.down);
  s.send(KEY.enter);
  assert.equal(s.app.state.mode, "code");
  assert.match(paste(), /^paste: the code viewer is read-only/);
  s.send(KEY.ctrlO);
  s.send("z");
  assert.equal(s.app.state.mode, "zoom");
  assert.match(paste(), /^paste: the zoom screen takes no text/);
  s.send("q");
  s.send(KEY.tab);
  assert.equal(s.app.state.focus, "nav");
  assert.match(paste(), /^paste: the panel takes no text/);
});

test("review-tui: the expanded row names no placeholder for staleness it does not compute", async (t) => {
  const s = session(checkoutRepo(t));
  t.after(() => s.app.close());
  await s.app.idle();
  for (let i = 0; i < 5; i++) s.send(KEY.down);
  const detail = s.lines()[s.lines().findIndex((line) => line.includes("- step application.purchase.buy")) + 1]!;
  assert.match(detail, /planned — {2}· snapshot [0-9a-f]{8} /);
  assert.doesNotMatch(detail, /stale/);
});

test("review-tui: Ctrl+P in a form keeps the form and says how to reach the palette; Enter on no match keeps the palette", async (t) => {
  const s = session(checkoutRepo(t));
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("/");
  s.send("checkout");
  s.send(KEY.ctrlP);
  assert.equal(s.app.state.prompt?.kind, "search");
  assert.equal(s.app.state.prompt?.text, "checkout", "what was typed stays");
  assert.match(s.app.state.message ?? "", /the palette does not open over a form: Enter runs it, Esc closes it/);
  await escape(s);
  s.send(":");
  s.send("qqzzxx");
  assert.deepEqual(s.app.state.prompt?.items, []);
  assert.match(s.text(), /:qqzzxx +no action matches: Backspace edits the query, Esc closes/, "the prompt line says so before Enter");
  s.send(KEY.enter);
  assert.equal(s.app.state.prompt?.kind, "palette", "still open, with its query");
  assert.match(s.app.state.message ?? "", /^no action matches "qqzzxx": Backspace edits the query, Esc closes/);
});

test("review-tui: Esc at the top of the zoom closes it and leaves the view where it was; q goes to the selected node", async (t) => {
  const s = session(checkoutRepo(t));
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("z");
  assert.equal(s.app.state.zoom?.focus, ZOOM_ROOT, "the top level");
  await escape(s);
  assert.equal(s.app.state.mode, "view");
  assert.equal(s.app.state.current, FLOW_PATH);
  assert.deepEqual(s.app.state.cursor, { line: 0, col: 0 });
  s.send("z");
  s.send("q");
  assert.notEqual(s.app.state.current, FLOW_PATH, "q follows the selection");
});

// ---------- 17, 18: hover as a structure, made once per target ----------

test("review-tui: hover is one structure: LSP renders it as Markdown and the TUI draws its parts as they are", async (t) => {
  const root = checkoutRepo(t);
  const analysis = await analyze({ root });
  const ws = workspace(root, analysis, new Map());
  const lines = ws.text(FLOW_PATH)!.split("\n");
  const line = lines.findIndex((text) => text.includes("- step application.purchase.buy"));
  const position = { line, character: lines[line]!.indexOf("application") + 3 };
  const content = hoverContent(ws, FLOW_PATH, position)!;
  assert.equal(content.id, "application.purchase.buy");
  assert.equal(content.title.map((run) => run.text).join(""), "fn application.purchase.buy () → void");
  assert.equal(content.place, "src/application/purchase.ts:3");
  assert.deepEqual(content.declaration, { file: "src/application/purchase.ts", line: 3 });
  assert.deepEqual(content.flows, ["checkout"]);
  // A message's code span is a run of its own: Markdown puts it back in backticks, a terminal shows the text.
  const trace = content.evidence.find((line) => runsText(line).startsWith("trace: "))!;
  assert.deepEqual(trace, [{ text: "trace: " }, { text: "unverified application.purchase.buy: no trace for flow " }, { text: "checkout", code: true }]);
  assert.equal(hover(ws, FLOW_PATH, position)!.contents.value, hoverMarkdown(content));
  assert.match(hoverMarkdown(content), /^\*\*fn\*\* `application\.purchase\.buy` `\(\) → void`\n\nsrc\/application\/purchase\.ts:3\n\n- ID: ok .*\n\n- trace: unverified application\.purchase\.buy: no trace for flow `checkout`\n\nflows: checkout$/s);
});

test("review-tui: the TUI draws the hover's parts, so a signature with ** or backticks is shown as written", async (t) => {
  // Parsing the Markdown back stripped every ** and backtick, the signature's own too.
  const purchase = 'import { create } from "../domain/order.ts";\nimport { save } from "../infrastructure/store.ts";\nexport function buy(/** the **whole** cart */ cart: string, tag: `a${string}`): void {\n  create();\n  save();\n}\n';
  const s = session(checkoutRepo(t, { "src/application/purchase.ts": purchase }));
  t.after(() => s.app.close());
  await s.app.idle();
  for (let i = 0; i < 5; i++) s.send(KEY.down);
  s.send("K");
  const rows = s.app.state.hover!.lines.map((row) => row.text);
  assert.equal(rows[0], "fn application.purchase.buy (/** the **whole** cart */ cart: string, tag: `a${string}`) → void");
  assert.equal(rows[1], "src/application/purchase.ts:3");
  assert.ok(rows.includes("• trace: unverified application.purchase.buy: no trace for flow checkout"), rows.join("\n"));
  assert.ok(rows.includes("flows: checkout"));
  assert.ok(rows.includes("export function buy(/** the **whole** cart */ cart: string, tag: `a${string}`): void {"), "the code at the declaration");
});

test("review-tui: explain and hover take a node's kind, place and plan from the same facts", async (t) => {
  const root = checkoutRepo(t, { [FLOW_PATH]: `${CHECKOUT_FLOW}- planned fn application.purchase.refund (order: Order) → Refund\n- planned fn application.purchase.buy () → void\n` });
  const analysis = await analyze({ root });
  const ws = workspace(root, analysis, new Map());
  const lines = ws.text(FLOW_PATH)!.split("\n");
  const placeOf = (id: string): string | null => {
    const line = lines.findIndex((text) => text.includes(`planned fn ${id}`));
    return hoverContent(ws, FLOW_PATH, { line, character: lines[line]!.indexOf(id) + 1 })?.place ?? null;
  };
  const buy = nodeFacts(analysis, "application.purchase.buy")!;
  assert.deepEqual({ source: buy.source, kind: buy.kind, implementsPlan: buy.implementsPlan }, { source: "code", kind: "fn", implementsPlan: true });
  const bought = summarizeNode(analysis, "application.purchase.buy");
  assert.ok("summary" in bought);
  assert.deepEqual({ kind: bought.summary.kind, at: bought.summary.at, planned: bought.summary.planned }, { kind: "fn", at: "src/application/purchase.ts:3", planned: true });
  assert.equal(placeOf("application.purchase.buy"), "src/application/purchase.ts:3 · planned, implemented");
  const refund = nodeFacts(analysis, "application.purchase.refund")!;
  const planLine = lines.findIndex((text) => text.includes("planned fn application.purchase.refund")) + 1;
  assert.deepEqual({ source: refund.source, kind: refund.kind, file: refund.file, line: refund.line }, { source: "planned", kind: "planned fn", file: FLOW_PATH, line: planLine });
  const refunded = summarizeNode(analysis, "application.purchase.refund");
  assert.ok("summary" in refunded);
  assert.deepEqual({ kind: refunded.summary.kind, signature: refunded.summary.signature, at: refunded.summary.at }, { kind: "planned fn", signature: "(order: Order) → Refund", at: `${FLOW_PATH}:${planLine}` });
  assert.equal(placeOf("application.purchase.refund"), `${FLOW_PATH}:${planLine} · planned, not implemented`);
});

test("review-tui: the pointer moving along one ID reads its code once; an edit makes the hover anew", async (t) => {
  const s = session(checkoutRepo(t));
  t.after(() => s.app.close());
  await s.app.idle();
  const at = locate(s.lines(), "application.purchase.buy");
  const fs = createRequire(import.meta.url)("node:fs") as { readFileSync: typeof readFileSync };
  const read = fs.readFileSync;
  const reads: string[] = [];
  const restore = (): void => {
    fs.readFileSync = read;
    syncBuiltinESMExports();
  };
  t.after(restore);
  fs.readFileSync = ((...args: Parameters<typeof readFileSync>) => {
    reads.push(String(args[0]));
    return read(...args);
  }) as typeof readFileSync;
  syncBuiltinESMExports();
  const purchase = (): number => reads.filter((path) => path.endsWith(join("src", "application", "purchase.ts"))).length;
  for (let i = 0; i < 20; i++) s.send(mouseMove(at.x + i, at.y));
  assert.match(s.text(), /export function buy\(\): void \{/);
  assert.equal(purchase(), 1, "one read for twenty moves over the same ID");
  // Typing in the prose changes the buffer: the next hover is made again.
  s.send(KEY.down);
  s.send(KEY.down);
  s.send("i");
  s.send(KEY.end);
  s.send("!");
  s.send("\x1b");
  await sleep(40);
  const again = locate(s.lines(), "application.purchase.buy");
  s.send(mouseMove(again.x + 1, again.y));
  s.send(mouseMove(again.x + 3, again.y));
  restore();
  assert.equal(purchase(), 2);
});

test("review-tui: the hover of a node whose file is a directory (an outside module) shows, with no code read", async (t) => {
  const root = checkoutRepo(t, { "tools/build.ts": "export function build(): void {}\n" });
  const config = JSON.parse(readFileSync(join(root, "keylang.json"), "utf8")) as Record<string, unknown>;
  put(root, "keylang.json", `${JSON.stringify({ ...config, outside: ["tools/**"] }, null, 2)}\n`);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(":");
  s.send("outside.md");
  s.send(KEY.enter);
  await s.app.idle();
  assert.equal(s.app.state.current, "keylang/map/outside.md");
  const line = s.app.state.buffers.get("keylang/map/outside.md")!.text.split("\n").findIndex((text) => text.trim() === "- module tools");
  assert.ok(line > 0, s.app.state.buffers.get("keylang/map/outside.md")!.text);
  for (let i = 0; i < line; i++) s.send(KEY.down);
  s.send("K");
  assert.equal(s.app.state.message, null, "no error from reading a directory as code");
  assert.match(s.app.state.hover?.lines[0]?.text ?? "", /^module outside\.tools/);
  assert.ok(s.app.state.hover!.lines.every((row) => row.kind !== "code"));
});

test("review-tui: reading mode renders a long spec once per text and width, not once per frame and row", async (t) => {
  const paragraph = "Checkout from the terminal, step by step, with every word wrapped onto the next row. ".repeat(4);
  const flow = `${CHECKOUT_FLOW}\n${Array.from({ length: 1500 }, (_, i) => (i % 2 === 0 ? `${paragraph}\n` : `## Part ${i}\n`)).join("\n")}`;
  const s = session(checkoutRepo(t, { [FLOW_PATH]: flow }));
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("v");
  const started = performance.now();
  for (let i = 0; i < 200; i++) s.send(KEY.down);
  const elapsed = performance.now() - started;
  assert.equal(s.app.state.cursor.line, 200);
  assert.ok(elapsed < READ_BUDGET_MS, `200 moves in reading mode took ${Math.round(elapsed)} ms`);
  assert.match(s.text(), /Part/, "the rendered rows are drawn");
});

const CHECKOUT_FLOW_PAID = ["# flow checkout", "", "Checkout from the terminal, paid.", "", "- trigger presentation.terminal.checkout", "- step application.purchase.buy", "  - step domain.order.create", "  - step infrastructure.store.save", ""].join("\n");
