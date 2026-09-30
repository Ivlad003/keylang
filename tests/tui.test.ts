// The TUI without a TTY: a session driven by the same bytes a terminal sends,
// its ANSI output applied to a virtual terminal. Covers the gutter and the
// separate evidence channels, reindexing without blocking, hover, jumps,
// navigation, editing with completion and K001 while typing, MERGE by hunks,
// text → spec, and the pure pieces (input decoding, hunks, widths).

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { analyze, findRoot, type Analysis, type AnalysisRequest } from "../src/analyze.ts";
import { formatSource } from "../src/fmt.ts";
import { mapCheckLines, mapStepLines, runOperation, type OperationContext, type OperationRequest, type OperationResult } from "../src/operations.ts";
import { App, type AppOptions } from "../src/tui/app.ts";
import { OperationWorker } from "../src/tui/background.ts";
import { findingsOf } from "../src/tui/findings.ts";
import { navEntries } from "../src/tui/view.ts";
import { InputDecoder } from "../src/tui/input.ts";
import { applyHunks, diffLines } from "../src/tui/merge.ts";
import { ENTER, Grid, LEAVE, renderDiff } from "../src/tui/screen.ts";
import { inline } from "../src/tui/markdown.ts";
import { editorCommand, runTerminal, splitCommand, type TerminalHost, type TerminalSignal } from "../src/tui/terminal.ts";
import { textToSpec } from "../src/tui/text-to-spec.ts";
import { stringWidth } from "../src/tui/width.ts";
import { checkoutRepo, CHECKOUT_FILES, CHECKOUT_FLOW, click, KEY, locate, mouseMove } from "./tui-fixture.ts";
import { VirtualTerminal } from "./vt.ts";

function session(root: string, options: { cols?: number; rows?: number; analyzer?: (request: AnalysisRequest) => Promise<Analysis>; operations?: AppOptions["operations"]; microphone?: AppOptions["microphone"] } = {}): { app: App; vt: VirtualTerminal; send: (keys: string) => void; lines: () => string[]; text: () => string } {
  const cols = options.cols ?? 110;
  const rows = options.rows ?? 30;
  const vt = new VirtualTerminal(cols, rows);
  const app = new App({ root, cols, rows, ...(options.analyzer ? { analyzer: options.analyzer } : {}), ...(options.operations ? { operations: options.operations } : {}), ...(options.microphone ? { microphone: options.microphone } : {}) });
  app.attach({ kind: "terminal", write: (ansi) => vt.feed(ansi) }, cols, rows);
  return { app, vt, send: (keys) => app.input(keys), lines: () => vt.lines(), text: () => vt.text() };
}

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

function lineOf(lines: readonly string[], text: string): string {
  const found = lines.find((line) => line.includes(text));
  assert.ok(found, `no line with ${text}:\n${lines.join("\n")}`);
  return found;
}

test("tui: a step with ID and static but no trace is ◌, with the channels shown apart", async (t) => {
  const s = session(checkoutRepo(t));
  t.after(() => s.app.close());
  await s.app.idle();
  const step = lineOf(s.lines(), "- step application.purchase.buy");
  assert.equal(step[0], "◌", step);
  for (const line of s.lines().filter((l) => /- (step|trigger) /.test(l))) assert.notEqual(line[0], "✓", `partial evidence shown as ✓: ${line}`);
  for (let i = 0; i < 5; i++) s.send(KEY.down);
  const detail = s.lines()[s.lines().findIndex((line) => line.includes("- step application.purchase.buy")) + 1]!;
  assert.match(detail, /└ ID ✓ {2}static ✓ {2}tests — {2}trace ◌ {2}planned — {2}stale n\/a/);
  assert.match(lineOf(s.lines(), "trace: unverified"), /no trace/);
  assert.match(s.lines().at(-1)!, /✗ 0 {2}◌ \d+ {2}✓ \d+/);
});

test("tui: planned is its own state, not a gap", async (t) => {
  const flow = CHECKOUT_FLOW + "- planned fn application.purchase.refund (order: Order) → Refund\n- step application.purchase.refund\n";
  const s = session(checkoutRepo(t, { "keylang/flows/checkout.md": flow }));
  t.after(() => s.app.close());
  await s.app.idle();
  assert.equal(lineOf(s.lines(), "- planned fn application.purchase.refund")[0], "◇");
  assert.equal(lineOf(s.lines(), "- step application.purchase.refund")[0], "◇");
});

test("tui: F5 reindexes in the background; old marks are dimmed and keys still work", async (t) => {
  const root = checkoutRepo(t);
  const gate: { release: (() => void) | null } = { release: null };
  let calls = 0;
  const analyzer = async (request: AnalysisRequest): Promise<Analysis> => {
    calls++;
    if (calls > 1) await new Promise<void>((done) => (gate.release = done));
    return analyze(request);
  };
  const s = session(root, { analyzer });
  t.after(() => s.app.close());
  await s.app.idle();
  assert.doesNotMatch(s.text(), /updating/);
  s.send(KEY.f5);
  assert.match(s.lines().at(-1)!, /updating… results shown are stale/);
  const gutter = s.app.frame();
  const y = s.lines().findIndex((line) => line.includes("- step application.purchase.buy"));
  assert.equal(gutter.styleAt(0, y).dim, true, "stale mark is dimmed");
  // The UI answers while the analysis waits.
  s.send(KEY.down);
  s.send(KEY.down);
  assert.equal(s.app.state.cursor.line, 2);
  assert.ok(gate.release, "second analysis started");
  gate.release();
  await s.app.idle();
  assert.doesNotMatch(s.lines().at(-1)!, /updating/);
  assert.notEqual(s.app.frame().styleAt(0, y).dim, true);
});

test("tui: a superseded analysis is dropped", async (t) => {
  const root = checkoutRepo(t);
  const gates: (() => void)[] = [];
  let calls = 0;
  const analyzer = async (request: AnalysisRequest): Promise<Analysis> => {
    const call = ++calls;
    if (call > 1) await new Promise<void>((done) => gates.push(done));
    const result = await analyze(request);
    // The second (superseded) result claims a failure that the third does not.
    return call === 2 ? { ...result, verdicts: result.verdicts.map((v) => ({ ...v, verdict: "fail" as const })) } : result;
  };
  const s = session(root, { analyzer });
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.f5);
  s.send(KEY.f5);
  gates[1]!();
  await sleep(50);
  gates[0]!();
  await s.app.idle();
  assert.match(s.lines().at(-1)!, /✗ 0 /);
});

test("tui: a failed F5 keeps the old report outdated with a persistent reason", async (t) => {
  const root = checkoutRepo(t);
  let calls = 0;
  const analyzer = async (request: AnalysisRequest): Promise<Analysis> => {
    calls++;
    if (calls > 1) throw new Error("no specs: boom");
    return analyze(request);
  };
  const s = session(root, { analyzer });
  t.after(() => s.app.close());
  await s.app.idle();
  assert.match(s.lines().at(-1)!, /✗ 0 /);
  const y = s.lines().findIndex((line) => line.includes("- step application.purchase.buy"));
  assert.notEqual(s.app.frame().styleAt(0, y).dim, true);
  s.send(KEY.f5);
  await s.app.idle();
  assert.equal(s.app.state.outdated, true, "the old verdict is no longer current");
  assert.match(s.app.state.error ?? "", /boom/);
  assert.match(s.lines().at(-1)!, /outdated.*boom/);
  // Keys must neither restore the old verdict nor clear the persistent reason.
  for (let i = 0; i < 3; i++) s.send(KEY.down);
  assert.equal(s.app.state.message, null, "the transient message is gone");
  assert.equal(s.app.state.outdated, true, "keys do not make the old verdict current");
  assert.match(s.lines().at(-1)!, /outdated.*boom/, "the reason survives navigation");
  assert.equal(s.app.frame().styleAt(0, y).dim, true, "the stale mark stays dimmed");
});

test("tui: a successful F5 after a failure clears the reason and restores the marks", async (t) => {
  const root = checkoutRepo(t);
  let calls = 0;
  const analyzer = async (request: AnalysisRequest): Promise<Analysis> => {
    calls++;
    if (calls === 2) throw new Error("boom");
    return analyze(request);
  };
  const s = session(root, { analyzer });
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.f5);
  await s.app.idle();
  assert.match(s.lines().at(-1)!, /outdated.*boom/);
  s.send(KEY.f5);
  await s.app.idle();
  assert.equal(s.app.state.error, null);
  assert.equal(s.app.state.outdated, false);
  assert.doesNotMatch(s.lines().at(-1)!, /boom|outdated/);
  const y = s.lines().findIndex((line) => line.includes("- step application.purchase.buy"));
  assert.notEqual(s.app.frame().styleAt(0, y).dim, true);
});

test("tui: a late failure of a superseded generation cannot spoil the new result", async (t) => {
  const root = checkoutRepo(t);
  const pending: { call: number; settle: () => void; fail: (error: Error) => void }[] = [];
  let calls = 0;
  const analyzer = (request: AnalysisRequest): Promise<Analysis> => {
    const call = ++calls;
    if (call > 1) {
      return new Promise<Analysis>((resolve, reject) => {
        pending.push({ call, settle: () => resolve(analyze(request)), fail: reject });
      });
    }
    return analyze(request);
  };
  const s = session(root, { analyzer });
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.f5);
  s.send(KEY.f5);
  assert.equal(pending.length, 2);
  pending[1]!.settle(); // The third generation succeeds first.
  await sleep(30);
  pending[0]!.fail(new Error("boom")); // The second fails late.
  await s.app.idle();
  assert.equal(s.app.state.error, null, "the stale failure is dropped");
  assert.equal(s.app.state.outdated, false);
  assert.match(s.lines().at(-1)!, /✗ 0 /);
  assert.doesNotMatch(s.lines().at(-1)!, /boom/);
});

test("tui: a failed first analysis leaves no phantom success and the session answers keys", async (t) => {
  const root = checkoutRepo(t);
  const analyzer = async (): Promise<Analysis> => {
    throw new Error("no specs");
  };
  const s = session(root, { analyzer });
  t.after(() => s.app.close());
  await s.app.idle();
  assert.equal(s.app.state.analysis, null, "no empty successful snapshot");
  assert.equal(s.app.state.outdated, true);
  assert.match(s.app.state.error ?? "", /no specs/);
  assert.match(s.lines().at(-1)!, /outdated.*no specs/);
  assert.doesNotMatch(s.lines().at(-1)!, /✗ \d/);
  s.send(KEY.down);
  s.send(KEY.down);
  assert.equal(s.app.state.cursor.line, 2, "the session answers keys");
  s.send("i");
  assert.equal(s.app.state.mode, "edit");
  assert.match(s.app.state.error ?? "", /no specs/, "the reason persists in edit mode");
});

test("tui: hover by mouse and by K shows signature, code, and flows", async (t) => {
  const s = session(checkoutRepo(t));
  t.after(() => s.app.close());
  await s.app.idle();
  const at = locate(s.lines(), "application.purchase.buy");
  s.send(mouseMove(at.x + 3, at.y));
  const shown = s.text();
  assert.match(shown, /fn application\.purchase\.buy \(\) → void/);
  assert.match(shown, /src\/application\/purchase\.ts:3/);
  assert.match(shown, /export function buy\(\): void \{/);
  assert.match(shown, /flows: checkout/);
  s.send(mouseMove(1, 2));
  assert.doesNotMatch(s.text(), /export function buy/);
  for (let i = 0; i < 6; i++) s.send(KEY.down);
  s.send("K");
  assert.match(s.text(), /fn domain\.order\.create/);
});

test("tui: Enter opens the code in the built-in viewer, Ctrl+O comes back, Alt+Enter opens the spec", async (t) => {
  const s = session(checkoutRepo(t));
  t.after(() => s.app.close());
  await s.app.idle();
  for (let i = 0; i < 5; i++) s.send(KEY.down);
  s.send(KEY.enter);
  assert.equal(s.app.state.mode, "code");
  assert.match(s.lines()[1]!, /src\/application\/purchase\.ts:3/);
  assert.match(lineOf(s.lines(), "▶"), /3 export function buy/);
  assert.ok(s.vt.links.some((link) => /^vscode:\/\/file\/.*\/src\/application\/purchase\.ts:3$/.test(link)), s.vt.links.join("\n"));
  s.send(KEY.ctrlO);
  assert.equal(s.app.state.mode, "view");
  assert.equal(s.app.state.current, "keylang/flows/checkout.md");
  s.send(KEY.altEnter);
  assert.equal(s.app.state.current, "keylang/map/application.md");
  assert.match(lineOf(s.lines(), "[buy]"), /fn \[buy\]/);
  assert.match(s.lines()[0]!, /generated, read-only/);
  s.send(KEY.ctrlO);
  assert.equal(s.app.state.current, "keylang/flows/checkout.md");
});

test("tui: the navigation panel lists layers, modules, flows and rules; Enter opens them", async (t) => {
  const s = session(checkoutRepo(t));
  t.after(() => s.app.close());
  await s.app.idle();
  const text = s.text();
  for (const label of ["NAVIGATION", "LAYERS", "▾ domain", "▸ order", "FLOWS", "checkout", "RULES", "layers domain < infra"]) assert.ok(text.includes(label), `${label} missing:\n${text}`);
  assert.match(lineOf(s.lines(), "  checkout "), /◌\s*$/);
  const order = locate(s.lines(), "▸ order");
  s.send(click(order.x, order.y));
  assert.ok(s.text().includes("fn create"), s.text());
  const create = locate(s.lines(), "fn create");
  s.send(click(create.x + 3, create.y));
  assert.equal(s.app.state.mode, "code");
  assert.match(s.lines()[1]!, /src\/domain\/order\.ts:1/);
  s.send(KEY.ctrlO);
  const rules = locate(s.lines(), "layers domain < infra");
  s.send(click(rules.x + 2, rules.y));
  assert.equal(s.app.state.current, "keylang/rules.md");
});

test("tui: an unknown step id typed in the editor shows K001 and a hint at once", async (t) => {
  const root = checkoutRepo(t);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  for (let i = 0; i < 6; i++) s.send(KEY.down);
  s.send("i");
  assert.equal(s.app.state.mode, "edit");
  s.send(KEY.end);
  s.send("x");
  assert.match(s.lines().at(-1)!, /outdated|updating/);
  await s.app.idle();
  const line = lineOf(s.lines(), "- step domain.order.createx");
  assert.equal(line[0], "✗");
  assert.match(s.lines().at(-2)!, /K001 dangling reference `domain\.order\.createx` \(did you mean `domain\.order\.create`\?\)/);
  assert.match(s.lines().at(-2)!, /declare `planned`/);
  assert.equal(readFileSync(join(root, "keylang/flows/checkout.md"), "utf8"), CHECKOUT_FLOW, "nothing written before Ctrl+S");
  s.send("\x7f");
  s.send(KEY.ctrlS);
  await s.app.idle();
  assert.equal(readFileSync(join(root, "keylang/flows/checkout.md"), "utf8"), CHECKOUT_FLOW);
  assert.doesNotMatch(s.text(), /K001/);
});

test("tui: completion after `step` offers callables and Tab inserts one", async (t) => {
  const root = checkoutRepo(t);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  for (let i = 0; i < 7; i++) s.send(KEY.down);
  s.send("i");
  s.send(KEY.end);
  s.send(KEY.enter);
  // Enter on an item continues the list: the new line already has `- `.
  for (const ch of "step infra") s.send(ch);
  assert.ok(s.app.state.completion, "completion open");
  assert.deepEqual(s.app.state.completion!.items.map((item) => item.label), ["infrastructure.store.save"]);
  assert.match(s.text(), /infrastructure\.store\.save {2}\(\) → void/);
  s.send(KEY.tab);
  assert.equal(s.app.state.completion, null);
  assert.equal(s.app.state.buffers.get("keylang/flows/checkout.md")!.text.split("\n")[8], "  - step infrastructure.store.save");
  s.send(KEY.ctrlS);
  await s.app.idle();
  assert.match(readFileSync(join(root, "keylang/flows/checkout.md"), "utf8"), /- step infrastructure\.store\.save\n {2}- step infrastructure\.store\.save\n/);
});

test("tui: MERGE decisions on model lines are counted in .keylang/stats.json", async (t) => {
  const root = checkoutRepo(t);
  const proposed = CHECKOUT_FLOW.replace("Checkout from the terminal.", "Checkout from the terminal.\n\n- step infrastructure.store.save <!-- keylang:llm model=m status=llm-only -->").replace(
    "  - step infrastructure.store.save\n",
    "  - step infrastructure.store.save\n- emits order.created <!-- keylang:algo status=algo-only -->\n",
  );
  mkdirSync(join(root, ".keylang/proposals/keylang/flows"), { recursive: true });
  writeFileSync(join(root, ".keylang/proposals/keylang/flows/checkout.md"), proposed);
  const s = session(root, { cols: 150 });
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("m");
  assert.match(s.lines()[1]!, /hunk 1\/2/);
  s.send("a");
  s.send("r");
  s.send("w");
  await s.app.idle();
  const stats = JSON.parse(readFileSync(join(root, ".keylang/stats.json"), "utf8")) as { drafts: Record<string, { accepted: number; rejected: number }> };
  assert.deepEqual(stats.drafts["llm-only"], { proposed: 0, accepted: 1, rejected: 0 });
  assert.deepEqual(stats.drafts["algo-only"], { proposed: 0, accepted: 0, rejected: 1 });
});

test("tui: MERGE of two hunks: accept one, reject the other, only the first reaches the disk", async (t) => {
  const root = checkoutRepo(t);
  const proposed = CHECKOUT_FLOW.replace("Checkout from the terminal.", "Checkout from the terminal, paid by card.").replace("  - step infrastructure.store.save\n", "  - step infrastructure.store.save\n- emits order.created\n");
  mkdirSync(join(root, ".keylang/proposals/keylang/flows"), { recursive: true });
  writeFileSync(join(root, ".keylang/proposals/keylang/flows/checkout.md"), proposed);
  const s = session(root, { cols: 150 });
  t.after(() => s.app.close());
  await s.app.idle();
  assert.match(s.lines().at(-1)!, /≈ 1 proposal\(s\): m/);
  s.send("m");
  assert.equal(s.app.state.mode, "merge");
  assert.match(s.lines()[1]!, /MERGE keylang\/flows\/checkout\.md · proposal · hunk 1\/2 · 0 accepted, 0 rejected, 2 pending/);
  assert.match(lineOf(s.lines(), "- Checkout from the terminal."), /^▌· - Checkout from the terminal\.\s/);
  assert.match(lineOf(s.lines(), "+ Checkout from the terminal, paid by card."), /^▌· \+ /);
  assert.match(lineOf(s.lines(), "+ - emits order.created"), /^ · \+ /);
  assert.equal(readFileSync(join(root, "keylang/flows/checkout.md"), "utf8"), CHECKOUT_FLOW, "nothing written before w");
  s.send("a");
  s.send("r");
  assert.match(s.lines()[1]!, /1 accepted, 1 rejected, 0 pending/);
  s.send("u");
  assert.match(s.lines()[1]!, /1 accepted, 0 rejected, 1 pending/);
  s.send("r");
  s.send("w");
  await s.app.idle();
  const written = readFileSync(join(root, "keylang/flows/checkout.md"), "utf8");
  assert.equal(written, CHECKOUT_FLOW.replace("Checkout from the terminal.", "Checkout from the terminal, paid by card."));
  assert.equal(existsSync(join(root, ".keylang/proposals/keylang/flows/checkout.md")), false, "the proposal is consumed");
  const once = formatSource("checkout.md", written);
  assert.ok(once.ok);
  const twice = formatSource("checkout.md", once.text);
  assert.ok(twice.ok);
  assert.equal(twice.text, once.text, "fmt of the result is idempotent");
  // `u` in the view undoes the whole merge, on disk too.
  s.send("u");
  await s.app.idle();
  assert.equal(readFileSync(join(root, "keylang/flows/checkout.md"), "utf8"), CHECKOUT_FLOW);
});

test("tui: Esc cancels a merge and writes nothing", async (t) => {
  const root = checkoutRepo(t);
  mkdirSync(join(root, ".keylang/proposals/keylang"), { recursive: true });
  writeFileSync(join(root, ".keylang/proposals/keylang/rules.md"), "# rules\n\n- layers domain < infrastructure < application < presentation\n- no-cycles\n");
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  // The open flow has no proposal: `m` lists the pending targets instead of picking one.
  s.send("m");
  assert.equal(s.app.state.prompt?.kind, "proposal");
  s.send(KEY.enter);
  assert.equal(s.app.state.current, "keylang/rules.md");
  s.send("a");
  s.send("\x1b");
  await sleep(40);
  assert.equal(s.app.state.mode, "view");
  assert.equal(readFileSync(join(root, "keylang/rules.md"), "utf8"), "# rules\n\n- layers domain < infrastructure < application < presentation\n");
  assert.ok(existsSync(join(root, ".keylang/proposals/keylang/rules.md")), "the proposal stays");
});

test("tui: Ctrl+G turns free text into items through MERGE, keeping the text", async (t) => {
  const root = checkoutRepo(t);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.down);
  s.send(KEY.down);
  s.send("i");
  s.send(KEY.end);
  for (const ch of " Then buy is called. It emits order.paid.") s.send(ch);
  s.send("\x1b");
  await sleep(40);
  s.send("i");
  s.send(KEY.ctrlG);
  assert.equal(s.app.state.mode, "merge");
  assert.match(s.text(), /\+ - step application\.purchase\.buy/);
  assert.match(s.text(), /\+ - emits order\.paid/);
  s.send("a");
  s.send("w");
  assert.equal(s.app.state.mode, "edit");
  const text = s.app.state.buffers.get("keylang/flows/checkout.md")!.text;
  assert.match(text, /Checkout from the terminal\. Then buy is called\. It emits order\.paid\.\n- step application\.purchase\.buy\n- emits order\.paid\n/);
  assert.equal(readFileSync(join(root, "keylang/flows/checkout.md"), "utf8"), CHECKOUT_FLOW, "Ctrl+G changes the buffer, not the disk");
});

test("tui: reading mode renders Markdown and keeps the marks; ? explains the code on the line", async (t) => {
  const flow = CHECKOUT_FLOW.replace("- step domain.order.create", "- step domain.order.missing");
  const s = session(checkoutRepo(t, { "keylang/flows/checkout.md": flow }));
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("v");
  assert.equal(s.app.state.mode, "read");
  assert.match(s.text(), /FLOW CHECKOUT/);
  assert.match(lineOf(s.lines(), "• step domain.order.missing"), /^✗/);
  s.send("v");
  for (let i = 0; i < 6; i++) s.send(KEY.down);
  s.send("?");
  assert.match(s.text(), /K001: A reference names an id that is not declared/);
  assert.match(s.text(), /keys · view/);
  s.send(KEY.down);
  assert.equal(s.app.state.help, false);
});

test("tui: palette and search", async (t) => {
  const s = session(checkoutRepo(t));
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(":");
  for (const ch of "rules") s.send(ch);
  assert.match(s.text(), /Open keylang\/rules\.md/);
  s.send(KEY.enter);
  assert.equal(s.app.state.current, "keylang/rules.md");
  s.send(":");
  for (const ch of "checkout") s.send(ch);
  s.send(KEY.enter);
  s.send("/");
  for (const ch of "store") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.cursor.line, 7);
});

test("tui: the palette runs doctor by id; F6 keeps the history and the report matches the CLI", async (t) => {
  const root = checkoutRepo(t);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  // In edit, `:` and `?` are characters, not commands.
  s.send("i");
  s.send(":");
  s.send("?");
  assert.ok(s.lines().some((line) => line.includes(":?# flow checkout")), s.text());
  // Ctrl+P opens the palette and types nothing into the buffer.
  s.send(KEY.ctrlP);
  assert.equal(s.app.state.prompt?.kind, "palette");
  assert.equal(s.app.state.prompt!.text, "");
  // The CLI alias and the visible name find the same action.
  for (const ch of "doctor") s.send(ch);
  assert.match(s.text(), /Environment diagnostics/);
  s.send("\x1b");
  await sleep(40);
  assert.equal(s.app.state.prompt, null);
  assert.equal(s.app.state.mode, "edit");
  s.send(KEY.ctrlP);
  for (const ch of "diagnostics") s.send(ch);
  assert.match(s.text(), /Environment diagnostics/);
  s.send(KEY.enter);
  await s.app.idle();
  // One record: completed, with the same report lines the CLI prints.
  assert.equal(s.app.state.records.length, 1);
  const record = s.app.state.records[0]!;
  assert.equal(record.status, "completed");
  assert.equal(record.result?.exitCode, 0);
  const bin = join(dirname(fileURLToPath(import.meta.url)), "../bin/keylang.js");
  const cli = spawnSync(process.execPath, [bin, "doctor"], { cwd: root, encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr);
  assert.deepEqual(record.result!.messages.map((m) => m.text), cli.stdout.trimEnd().split("\n"));
  // The editor kept its file, text, mode and focus.
  assert.equal(s.app.state.current, "keylang/flows/checkout.md");
  assert.equal(s.app.state.mode, "edit");
  assert.ok(s.lines().some((line) => line.includes(":?# flow checkout")), s.text());
  // F6 shows the history and the scrollable report; Esc returns to the editor.
  s.send(KEY.f6);
  assert.match(s.text(), /RESULTS · F6 · 1 run/);
  assert.match(s.text(), /Environment diagnostics {2}completed · code 0/);
  assert.match(s.text(), /languages: typescript/);
  s.send("\x1b");
  await sleep(40);
  assert.equal(s.app.state.results.open, false);
  assert.equal(s.app.state.focus, "editor");
  assert.equal(s.app.state.mode, "edit");
});

test("tui: F6 reruns a record with the same parameters", async (t) => {
  const s = session(checkoutRepo(t));
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.ctrlP);
  for (const ch of "doctor") s.send(ch);
  s.send(KEY.enter);
  await s.app.idle();
  s.send(KEY.f6);
  s.send(KEY.enter);
  await s.app.idle();
  assert.equal(s.app.state.records.length, 2);
  assert.deepEqual(s.app.state.records[1]!.params, s.app.state.records[0]!.params);
  assert.equal(s.app.state.records[1]!.status, "completed");
  assert.match(s.text(), /RESULTS · F6 · 2 run/);
});

test("tui: a slow doctor does not block the UI, and a second run is refused", async (t) => {
  const root = checkoutRepo(t);
  let release: (() => void) | null = null;
  let calls = 0;
  const operations = async (request: OperationRequest, context: OperationContext): Promise<OperationResult> => {
    calls++;
    await new Promise<void>((done) => (release = done));
    return runOperation(request, context);
  };
  const s = session(root, { operations });
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.ctrlP);
  for (const ch of "doctor") s.send(ch);
  s.send(KEY.enter);
  await sleep(30);
  assert.equal(calls, 1);
  assert.equal(s.app.state.records.length, 1);
  assert.equal(s.app.state.activeOperation, s.app.state.records[0]!.id);
  // Arrows, resize and Esc keep working while the operation runs.
  s.send(KEY.down);
  assert.equal(s.app.state.cursor.line, 1);
  s.vt.resize(70, 16);
  s.app.resize(70, 16);
  assert.equal(s.lines().length, 16);
  // A second start does not create a second job; the reason is visible.
  s.send(KEY.ctrlP);
  for (const ch of "doctor") s.send(ch);
  assert.match(s.text(), /unavailable: an operation is already running|an operation is already running/);
  s.send(KEY.enter);
  assert.equal(calls, 1);
  assert.equal(s.app.state.records.length, 1);
  assert.match(s.lines().at(-2)!, /an operation is already running/);
  // Esc closes the panel, not the work.
  s.send(KEY.f6);
  assert.match(s.text(), /running…/);
  s.send("\x1b");
  await sleep(40);
  assert.equal(s.app.state.results.open, false);
  assert.equal(s.app.state.activeOperation, s.app.state.records[0]!.id);
  release!();
  await s.app.idle();
  assert.equal(s.app.state.activeOperation, null);
  assert.equal(s.app.state.records[0]!.status, "completed");
  assert.equal(s.app.state.records.length, 1);
});

test("tui: in MERGE the palette shows reasons for blocked actions and still runs doctor", async (t) => {
  const root = checkoutRepo(t);
  const proposal = CHECKOUT_FLOW.replace("Checkout from the terminal.", "Checkout from the register.");
  mkdirSync(join(root, ".keylang/proposals/keylang/flows"), { recursive: true });
  writeFileSync(join(root, ".keylang/proposals/keylang/flows/checkout.md"), proposal);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("m");
  assert.equal(s.app.state.mode, "merge");
  // An action that would drop the merge is listed with its reason and does not run.
  s.send(KEY.ctrlP);
  for (const ch of "insert") s.send(ch);
  assert.match(s.text(), /Edit \(i\)/);
  s.send(KEY.enter);
  assert.equal(s.app.state.mode, "merge");
  assert.match(s.lines().at(-2)!, /Edit: finish the merge first/);
  // The independent read-only doctor runs, and the merge stays.
  s.send(KEY.ctrlP);
  for (const ch of "doctor") s.send(ch);
  s.send(KEY.enter);
  await s.app.idle();
  assert.equal(s.app.state.mode, "merge");
  assert.equal(s.app.state.records.length, 1);
  assert.equal(s.app.state.records[0]!.status, "completed");
});

test("tui: a failed operation is a visible record, and quitting is still code 0", async (t) => {
  const root = checkoutRepo(t);
  let quit = 0;
  const operations = async (): Promise<OperationResult> => {
    throw new Error("adapter exploded");
  };
  const vt = new VirtualTerminal(100, 24);
  const app = new App({ root, cols: 100, rows: 24, operations, onQuit: () => quit++ });
  app.attach({ kind: "terminal", write: (ansi) => vt.feed(ansi) }, 100, 24);
  t.after(() => app.close());
  await app.idle();
  app.input(KEY.ctrlP);
  for (const ch of "doctor") app.input(ch);
  app.input(KEY.enter);
  await app.idle();
  assert.equal(app.state.records.length, 1);
  assert.equal(app.state.records[0]!.status, "failed");
  assert.equal(app.state.records[0]!.result?.exitCode, 2);
  assert.match(vt.text(), /doctor: failed · code 2/);
  // F6 shows the error; the session still answers.
  app.input(KEY.f6);
  assert.match(vt.text(), /adapter exploded/);
  app.input("\x1b");
  app.input("q");
  assert.equal(quit, 1);
});

test("tui: help lists the registry keys and the palette actions", async (t) => {
  const s = session(checkoutRepo(t));
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("?");
  assert.match(s.text(), /keys · view/);
  assert.match(s.text(), /actions: F5 Check again/);
  assert.match(s.text(), /F6 Operation results/);
  s.send(KEY.down);
  assert.equal(s.app.state.help, false);
  // The palette action "About keylang" shows the version.
  s.send(KEY.ctrlP);
  for (const ch of "version") s.send(ch);
  s.send(KEY.enter);
  assert.match(s.lines().at(-2)!, /keylang \d+\.\d+\.\d+/);
});

// 04: the full findings list of the current analysis in F6.
const DENY_RULES = "# rules\n\n- layers domain < infrastructure < application < presentation\n- deny application infrastructure\n";

test("tui: F6 lists a K102 on a source line; Enter shows the import, Esc returns to the list", async (t) => {
  const root = checkoutRepo(t, { "keylang/rules.md": DENY_RULES });
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  // The pinned entry is the current analysis; the forbidden import is its first finding (diagnostics first).
  s.send(KEY.f6);
  assert.match(s.text(), /RESULTS · F6 · 0 run/);
  assert.match(s.text(), /Current analysis · ✗ 1/);
  assert.match(s.text(), /K102 src\/application\/purchase\.ts:2:/, s.text());
  // Enter opens the selected finding: the code viewer shows the import line.
  const before = { current: s.app.state.current, mode: s.app.state.mode };
  s.send(KEY.enter);
  assert.equal(s.app.state.results.open, true);
  assert.equal(s.app.state.results.viewing, true);
  assert.equal(s.app.state.code?.file, "src/application/purchase.ts");
  assert.equal(s.app.state.code?.line, 2);
  assert.equal(s.app.state.code?.lines[1], 'import { save } from "../infrastructure/store.ts";');
  // Ctrl+O returns to the list without losing the selection; Esc closes the panel where the session was.
  s.send(KEY.ctrlO);
  assert.equal(s.app.state.results.viewing, false);
  assert.equal(s.app.state.results.open, true);
  assert.equal(s.app.state.results.finding, 0);
  s.send("\x1b");
  await sleep(40);
  assert.equal(s.app.state.results.open, false);
  assert.deepEqual({ current: s.app.state.current, mode: s.app.state.mode }, before);
  assert.equal(s.app.state.code?.file ?? null, null);
  // F6 at the target closes the panel and stays there.
  s.send(KEY.f6);
  s.send(KEY.enter);
  s.send(KEY.f6);
  assert.equal(s.app.state.results.open, false);
  assert.equal(s.app.state.mode, "code");
  assert.equal(s.app.state.code?.line, 2);
});

test("tui: the selected finding shows its full message; MERGE keeps its hunks instead of opening it", async (t) => {
  const root = checkoutRepo(t, { "keylang/rules.md": DENY_RULES });
  const proposal = CHECKOUT_FLOW.replace("Checkout from the terminal.", "Checkout from the register.");
  mkdirSync(join(root, ".keylang/proposals/keylang/flows"), { recursive: true });
  writeFileSync(join(root, ".keylang/proposals/keylang/flows/checkout.md"), proposal);
  const s = session(root, { cols: 60 });
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.f6);
  // The list row is cut at the panel width; the details above it carry the whole message.
  const k102 = findingsOf(s.app.state.analysis).find((result) => result.code === "K102")!;
  const words = s.text().replace(/\s+/g, " ");
  assert.ok(words.includes(k102.evidence), `${k102.evidence}\n${s.text()}`);
  assert.match(s.text(), /provenance syntactic/);
  s.send("\x1b");
  await sleep(40);
  s.send("m");
  assert.equal(s.app.state.mode, "merge");
  s.send(KEY.f6);
  s.send(KEY.enter);
  assert.equal(s.app.state.results.viewing, false);
  assert.equal(s.app.state.mode, "merge");
  assert.match(s.app.state.message ?? "", /finish the merge first/);
});

test("tui: findings on one line stay separate; a diagnostic joined with its verdict is listed once", async (t) => {
  const root = checkoutRepo(t, { "keylang/rules.md": DENY_RULES });
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.f6);
  s.send("o"); // ok findings visible
  const rows = s.text().split("\n").filter((line) => line.includes("keylang/flows/checkout.md:6:1"));
  assert.ok(rows.length >= 2, `separate findings of one line must stay separate:\n${s.text()}`);
  assert.ok(rows.some((row) => row.includes("ID ")), rows.join("\n"));
  assert.ok(rows.some((row) => row.includes("trace ")), rows.join("\n"));
  // The K102 diagnostic and the verdict it explains are one finding, never two.
  assert.equal(s.text().split("\n").filter((line) => line.includes("K102")).length, 1, s.text());
});

test("tui: the findings list equals `check --format json` results on the same saved inputs", async (t) => {
  const root = checkoutRepo(t, { "keylang/rules.md": DENY_RULES });
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  const bin = join(dirname(fileURLToPath(import.meta.url)), "../bin/keylang.js");
  const cli = spawnSync(process.execPath, [bin, "check", "--format", "json"], { cwd: root, encoding: "utf8" });
  assert.equal(cli.status, 1, cli.stderr);
  const json = JSON.parse(cli.stdout) as { results: unknown[] };
  assert.deepEqual(findingsOf(s.app.state.analysis), json.results);
});

test("tui: the selected finding stays selected when a rerun drops the findings above it", async (t) => {
  const root = checkoutRepo(t, { "keylang/rules.md": DENY_RULES });
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.f6);
  s.send("\t");
  s.send(KEY.down);
  assert.equal(s.app.state.results.finding, 1);
  assert.match(s.text(), /K102 src\/application\/purchase\.ts:2:/);
  // The deny goes away on disk: the K102 above the selection leaves the report, the selection stays on its finding.
  writeFileSync(join(root, "keylang/rules.md"), "# rules\n\n- layers domain < infrastructure < application < presentation\n");
  s.send(KEY.f5);
  await s.app.idle();
  assert.doesNotMatch(s.text(), /K102/, s.text());
  assert.equal(s.app.state.results.finding, 0);
  s.send(KEY.enter);
  assert.equal(s.app.state.current, "keylang/flows/checkout.md");
  assert.equal(s.app.state.cursor.line, 4);
});

test("tui: findings of a dirty buffer equal `check --format json` once it is saved", async (t) => {
  const root = checkoutRepo(t);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  // The dirty text denies a dependency the code has: the overlay analysis reports the K102 before any save.
  s.send(KEY.ctrlP);
  for (const ch of "open keylang/rules.md") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.current, "keylang/rules.md");
  s.send("i");
  s.send(KEY.down);
  s.send(KEY.down);
  s.send(KEY.end);
  s.send(KEY.enter);
  for (const ch of "deny application infrastructure") s.send(ch);
  await sleep(40);
  await s.app.idle();
  const dirty = findingsOf(s.app.state.analysis);
  assert.ok(dirty.some((result) => result.code === "K102"), JSON.stringify(dirty.map((result) => result.code)));
  s.send(KEY.ctrlS);
  await s.app.idle();
  const bin = join(dirname(fileURLToPath(import.meta.url)), "../bin/keylang.js");
  const cli = spawnSync(process.execPath, [bin, "check", "--format", "json"], { cwd: root, encoding: "utf8" });
  const json = JSON.parse(cli.stdout) as { results: unknown[] };
  assert.deepEqual(findingsOf(s.app.state.analysis), json.results);
  assert.deepEqual(dirty, json.results, "the dirty analysis already reported what the CLI sees after the save");
});

test("tui: the verdict filters hide findings and count them; the totals stay", async (t) => {
  const root = checkoutRepo(t, { "keylang/rules.md": DENY_RULES });
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.f6);
  const header = /✗ (\d+) ◌ (\d+) ! (\d+) ✓ (\d+) · (\d+) findings · (\d+) hidden/.exec(s.text());
  assert.ok(header, s.text());
  const [, fail, , , ok, total, hidden] = header!;
  assert.ok(Number(total) > 0 && Number(ok) > 0, s.text());
  assert.equal(Number(hidden), Number(ok), "ok is hidden by default and counted as hidden");
  // o shows the ok findings: nothing is hidden, the full counts stay.
  s.send("o");
  assert.match(s.text(), /· 0 hidden/);
  // f hides the fails: the K102 leaves the list, the totals still count it.
  s.send("f");
  assert.doesNotMatch(s.text(), /K102 src\/application\/purchase\.ts:2:/, s.text());
  const headerAfter = /✗ (\d+) ◌ (\d+) ! (\d+) ✓ (\d+) · (\d+) findings · (\d+) hidden/.exec(s.text());
  assert.ok(headerAfter, s.text());
  assert.equal(headerAfter![1], fail, "the full totals never change");
  assert.equal(headerAfter![6], "1", "only the hidden K102 is filtered out");
});

test("tui: Enter on a finding lands on the right cluster after Unicode characters", async (t) => {
  // An astral emoji is two UTF-16 units but one code point and one cluster; the Cyrillic word is one of each per letter.
  const wiring = "# wiring\n\n- wire presentation.terminal.checkout\n  - buy application.purchase.buy\n    - when env.DB = 💾память → infrastructure.store.missing\n";
  const root = checkoutRepo(t, { "keylang/wiring.md": wiring });
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.f6);
  assert.match(s.text(), /K001 keylang\/wiring\.md:5:31/, s.text());
  s.send(KEY.enter);
  assert.equal(s.app.state.results.viewing, true);
  assert.equal(s.app.state.current, "keylang/wiring.md");
  assert.equal(s.app.state.cursor.line, 4);
  const line = s.app.state.buffers.get("keylang/wiring.md")!.text.split("\n")[4]!;
  assert.equal(s.app.state.cursor.col, [...line.slice(0, line.indexOf("infrastructure.store.missing"))].length);
  assert.notEqual(s.app.state.cursor.col, line.indexOf("infrastructure.store.missing"), "the fixture must tell UTF-16 from code points");
  // Esc while editing the target leaves editing first; the next Esc returns to the list.
  s.send("i");
  assert.equal(s.app.state.mode, "edit");
  s.send("\x1b");
  await sleep(40);
  assert.equal(s.app.state.mode, "view");
  assert.equal(s.app.state.results.viewing, true);
  s.send("\x1b");
  await sleep(40);
  assert.equal(s.app.state.results.viewing, false);
  assert.equal(s.app.state.results.finding, 0);
  s.send("\x1b");
  await sleep(40);
  assert.equal(s.app.state.results.open, false);
});

test("tui: the findings panel names unsaved inputs and a failed analysis", async (t) => {
  const root = checkoutRepo(t);
  let calls = 0;
  const analyzer = async (request: AnalysisRequest): Promise<Analysis> => {
    calls++;
    if (calls > 2) throw new Error("boom");
    return analyze(request);
  };
  const s = session(root, { analyzer });
  t.after(() => s.app.close());
  await s.app.idle();
  // An unsaved buffer is an overlay input of the shown report (a change in the prose keeps the flow parseable).
  s.send("i");
  s.send(KEY.down);
  s.send(KEY.down);
  s.send("z");
  s.send("\x1b");
  await sleep(40);
  await s.app.idle();
  s.send(KEY.f6);
  assert.match(s.text(), /unsaved inputs: keylang\/flows\/checkout\.md/, s.text());
  // A failed reanalysis keeps the last list with the persistent reason; the panel names it.
  s.send(KEY.f5);
  await s.app.idle();
  assert.match(s.text(), /outdated: analysis failed: boom/, s.text());
  assert.match(s.text(), /◌ trace keylang\/flows\/checkout\.md:/, s.text());
  // Navigating the list keeps the reason; a successful retry clears it.
  s.send(KEY.enter);
  s.send("\x1b");
  await sleep(40);
  assert.match(s.text(), /outdated: analysis failed: boom/, s.text());
  calls = -10; // the analyzer works again
  s.send(KEY.f5);
  await s.app.idle();
  assert.doesNotMatch(s.text(), /analysis failed/, s.text());
  assert.match(s.text(), /◌ trace keylang\/flows\/checkout\.md:/, s.text());
  s.send("\x1b");
  await sleep(40);
  assert.equal(s.app.state.results.open, false);
});

test("tui: the pinned analysis sits above the records and is reachable with the arrows", async (t) => {
  const s = session(checkoutRepo(t));
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.ctrlP);
  for (const ch of "doctor") s.send(ch);
  s.send(KEY.enter);
  await s.app.idle();
  // With records the newest stays selected; up reaches the pinned analysis.
  s.send(KEY.f6);
  assert.equal(s.app.state.results.entry, "record");
  assert.match(s.text(), /Environment diagnostics {2}completed · code 0/);
  s.send(KEY.up);
  assert.equal(s.app.state.results.entry, "analysis");
  assert.match(s.text(), /Current analysis · ✗ 0/);
  assert.match(s.text(), /◌ trace keylang\/flows\/checkout\.md:/);
  // Down returns to the record; Enter reruns it as before.
  s.send(KEY.down);
  assert.equal(s.app.state.results.entry, "record");
  s.send(KEY.enter);
  await s.app.idle();
  assert.equal(s.app.state.records.length, 2);
});

test("tui: resize and wide characters keep the frame aligned", async (t) => {
  const flow = CHECKOUT_FLOW.replace("Checkout from the terminal.", "Оплата 支付 ✓ з терміналу.");
  const s = session(checkoutRepo(t, { "keylang/flows/checkout.md": flow }), { cols: 90, rows: 20 });
  t.after(() => s.app.close());
  await s.app.idle();
  assert.ok(s.text().includes("Оплата 支付 ✓ з терміналу."), s.text());
  s.vt.resize(70, 16);
  s.app.resize(70, 16);
  assert.equal(s.lines().length, 16);
  for (const line of s.lines()) assert.equal(stringWidth(line), 70);
  assert.match(s.lines().at(-1)!, /✗ 0/);
});

test("tui: quitting with unsaved changes asks twice", async (t) => {
  let quit = 0;
  const root = checkoutRepo(t);
  const vt = new VirtualTerminal(100, 24);
  const app = new App({ root, cols: 100, rows: 24, onQuit: () => quit++ });
  app.attach({ kind: "terminal", write: (ansi) => vt.feed(ansi) }, 100, 24);
  t.after(() => app.close());
  await app.idle();
  app.input("i");
  app.input("z");
  app.input("\x1b");
  await sleep(40);
  app.input("q");
  assert.equal(quit, 0);
  assert.match(vt.text(), /unsaved changes in keylang\/flows\/checkout\.md/);
  app.input("q");
  assert.equal(quit, 1);
});

// ---------- pure pieces ----------

test("input: keys, modifiers, SGR mouse, paste, and sequences split across chunks", () => {
  const decoder = new InputDecoder();
  assert.deepEqual(decoder.feed("a\x1b[15~\x1b[1;5A\x1b\r\x07"), [
    { type: "key", name: "a", ctrl: false, alt: false, shift: false, text: "a" },
    { type: "key", name: "f5", ctrl: false, alt: false, shift: false },
    { type: "key", name: "up", ctrl: true, alt: false, shift: false },
    { type: "key", name: "enter", ctrl: false, alt: true, shift: false },
    { type: "key", name: "g", ctrl: true, alt: false, shift: false },
  ]);
  assert.deepEqual(decoder.feed("\x1b[<35;10;"), []);
  assert.deepEqual(decoder.feed("4M\x1b[<16;2;3M\x1b[<64;1;1M"), [
    { type: "mouse", action: "move", button: 0, x: 9, y: 3, ctrl: false, alt: false, shift: false },
    { type: "mouse", action: "down", button: 0, x: 1, y: 2, ctrl: true, alt: false, shift: false },
    { type: "mouse", action: "wheel-up", button: 0, x: 0, y: 0, ctrl: false, alt: false, shift: false },
  ]);
  assert.deepEqual(decoder.feed("\x1b[200~line 1\r\nї"), []);
  assert.deepEqual(decoder.feed("\x1b[201~"), [{ type: "paste", text: "line 1\nї" }]);
  assert.deepEqual(decoder.feed("\x1b"), []);
  assert.equal(decoder.waiting, true);
  assert.deepEqual(decoder.flush(), [{ type: "key", name: "escape", ctrl: false, alt: false, shift: false }]);
  assert.deepEqual(decoder.feed("K👍"), [
    { type: "key", name: "K", ctrl: false, alt: false, shift: true, text: "K" },
    { type: "key", name: "👍", ctrl: false, alt: false, shift: false, text: "👍" },
  ]);
});

test("merge: hunks, accept/reject application, and rows", () => {
  const base = ["a", "b", "c", "d", "e"];
  const proposed = ["a", "B", "c", "d", "e", "f"];
  const hunks = diffLines(base, proposed);
  assert.deepEqual(hunks, [
    { baseStart: 1, baseCount: 1, lines: ["B"] },
    { baseStart: 5, baseCount: 0, lines: ["f"] },
  ]);
  assert.deepEqual(applyHunks(base, hunks, ["accepted", "rejected"]), ["a", "B", "c", "d", "e"]);
  assert.deepEqual(applyHunks(base, hunks, ["pending", "accepted"]), ["a", "b", "c", "d", "e", "f"]);
  assert.deepEqual(applyHunks(base, hunks, ["accepted", "accepted"]), proposed);
  assert.deepEqual(diffLines(base, base), []);
});

test("text → spec: steps from known ids, when/then, emits, invariant", () => {
  const known = ["application.purchase.buy", "domain.order.create", "infrastructure.store.save"];
  assert.deepEqual(textToSpec("First buy is called. When the cart is empty, then save. It emits order.created. Invariant: stock never goes negative.", 2, known, known), [
    "  - step application.purchase.buy",
    "  - when the cart is empty",
    "    - step infrastructure.store.save",
    "  - emits order.created",
    "  - invariant stock never goes negative",
  ]);
  assert.deepEqual(textToSpec("Nothing to see here.", 0, known, known), []);
});

test("screen: widths, wide characters, and row diffs", () => {
  assert.equal(stringWidth("支付"), 4);
  assert.equal(stringWidth("👍🏽"), 2);
  assert.equal(stringWidth("é"), 1);
  const a = new Grid(10, 2);
  a.write(0, 0, "支付ab");
  assert.equal(a.lines()[0], "支付ab    ");
  // Overwriting half of a wide character blanks the other half.
  a.write(1, 0, "x");
  assert.equal(a.lines()[0], " x付ab    ");
  const b = new Grid(10, 2);
  b.write(0, 1, "row two");
  const full = renderDiff(null, b);
  const same = renderDiff(b, b);
  assert.match(full, /\x1b\[2J/);
  assert.doesNotMatch(same, /row two/);
  const c = new Grid(10, 2);
  c.write(0, 1, "row 2");
  assert.match(renderDiff(b, c), /\x1b\[2;1H/);
  assert.doesNotMatch(renderDiff(b, c), /\x1b\[1;1H/);
});

// ---------- review 2026-09-28: data loss, crashes, and limits ----------

function propose(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, ".keylang/proposals", path)), { recursive: true });
  writeFileSync(join(root, ".keylang/proposals", path), text);
}

const FLOW_PATH = "keylang/flows/checkout.md";
const PAID = CHECKOUT_FLOW.replace("Checkout from the terminal.", "Checkout from the terminal, paid by card.");

test("tui: u after a merge never reverts edits made after it", async (t) => {
  const root = checkoutRepo(t);
  propose(root, FLOW_PATH, PAID);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("m");
  s.send("a");
  s.send("w");
  await s.app.idle();
  assert.equal(readFileSync(join(root, FLOW_PATH), "utf8"), PAID);
  // A later edit, saved: `u` must not bring back the text from before the merge.
  s.send("i");
  s.send(KEY.end);
  s.send("!");
  s.send(KEY.ctrlS);
  s.send("\x1b");
  await sleep(40);
  await s.app.idle();
  s.send("u");
  await s.app.idle();
  assert.match(s.text(), /no merge to undo|u no longer applies/);
  assert.match(readFileSync(join(root, FLOW_PATH), "utf8"), /^# flow checkout!/);
});

test("tui: w writes nothing over a file changed on disk during MERGE", async (t) => {
  const root = checkoutRepo(t);
  propose(root, FLOW_PATH, PAID);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("m");
  s.send("a");
  const outside = CHECKOUT_FLOW.replace("- step application.purchase.buy", "- step application.purchase.buy\n- emits order.created");
  writeFileSync(join(root, FLOW_PATH), outside);
  s.send("w");
  await s.app.idle();
  assert.equal(readFileSync(join(root, FLOW_PATH), "utf8"), outside, "the concurrent change is kept");
  assert.match(s.text(), /changed on disk during the merge; nothing written/);
  assert.ok(existsSync(join(root, ".keylang/proposals", FLOW_PATH)), "the proposal stays");
});

test("tui: a merge with unsaved edits in the file is refused, not diffed against them", async (t) => {
  const root = checkoutRepo(t);
  propose(root, FLOW_PATH, PAID);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("i");
  s.send(KEY.end);
  s.send("?");
  s.send("\x1b");
  await sleep(40);
  s.send("m");
  assert.equal(s.app.state.mode, "view");
  assert.match(s.text(), /unsaved changes: save \(Ctrl\+S\) or undo them before merging/);
});

test("tui: a proposal for a new directory is written; a write that fails is a message, not a crash", async (t) => {
  const root = checkoutRepo(t);
  propose(root, "keylang/flows/pay/card.md", "# flow card\n\n- trigger presentation.terminal.checkout\n");
  // `keylang/rules.md` is a file, so a spec under it cannot be created.
  propose(root, "keylang/rules.md/broken.md", "# rules\n");
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.app.state.current = "keylang/rules.md/broken.md";
  s.send("m");
  s.send("a");
  s.send("w");
  assert.match(s.text(), /error: /);
  s.send("\x1b");
  await sleep(40);
  s.app.state.current = "keylang/flows/pay/card.md";
  s.send("m");
  assert.equal(s.app.state.merge?.path, "keylang/flows/pay/card.md");
  s.send("a");
  s.send("w");
  await s.app.idle();
  assert.equal(readFileSync(join(root, "keylang/flows/pay/card.md"), "utf8"), "# flow card\n\n- trigger presentation.terminal.checkout\n");
  // `u` removes the file it created and brings the proposal back.
  s.send("u");
  await s.app.idle();
  assert.equal(existsSync(join(root, "keylang/flows/pay/card.md")), false);
  assert.ok(existsSync(join(root, ".keylang/proposals/keylang/flows/pay/card.md")));
});

test("tui: spec-to-code proposes code and its test; MERGE writes the accepted hunks to disk, u takes them back", async (t) => {
  const flow = `${CHECKOUT_FLOW}\n# flow refund\n\n- planned fn application.refund.refund (order: Order) → Order\n- trigger application.refund.refund\n  - test tests/refund.test.ts "refund returns the order"\n`;
  const root = checkoutRepo(t, { [FLOW_PATH]: flow });
  const bin = join(dirname(fileURLToPath(import.meta.url)), "../bin/keylang.js");
  const cli = spawnSync(process.execPath, [bin, "spec-to-code", "application.refund.refund"], { cwd: root, encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stderr, /proposed \.keylang\/proposals\/src\/application\/refund\.ts, \.keylang\/proposals\/tests\/refund\.test\.ts; merge them hunk by hunk/);
  assert.ok(!existsSync(join(root, "src/application/refund.ts")), "a proposal, not the code");

  const code = join(root, "src/application/refund.ts");
  const s = session(root, { cols: 150 });
  t.after(() => s.app.close());
  await s.app.idle();
  assert.match(s.lines().at(-1)!, /≈ 2 proposal\(s\): m/);
  s.send("m");
  s.send(KEY.enter);
  assert.match(s.lines()[1]!, /MERGE src\/application\/refund\.ts · code · hunk 1\/1 · 0 accepted, 0 rejected, 1 pending/);
  assert.match(s.text(), /\+ export function refund\(order: Order\): Order \{/);
  s.send("a");
  s.send("w");
  await s.app.idle();
  assert.match(readFileSync(code, "utf8"), /^export function refund\(order: Order\): Order \{\n {2}throw new Error\("not implemented: application\.refund\.refund"\);\n\}\n$/);
  assert.ok(!existsSync(join(root, ".keylang/proposals/src/application/refund.ts")), "the proposal is consumed");
  const verdicts = s.app.state.analysis?.verdicts.filter((v) => v.area === "application.refund.refund").map((v) => `${v.criterion} ${v.verdict}`);
  assert.ok(verdicts?.includes("ID ok"), `the new code is analyzed: ${verdicts?.join(", ")}`);
  // No buffer holds the code: `u` restores the disk and the proposal.
  s.send("u");
  await s.app.idle();
  assert.ok(!existsSync(code));
  assert.ok(existsSync(join(root, ".keylang/proposals/src/application/refund.ts")));

  s.send("m");
  s.send(KEY.enter);
  s.send("a");
  writeFileSync(code, "// written meanwhile\n");
  s.send("w");
  assert.match(s.app.state.message ?? "", /src\/application\/refund\.ts changed on disk during the merge; nothing written/);
  assert.equal(readFileSync(code, "utf8"), "// written meanwhile\n");

  // Compared again with the file as it is now: the hunk shows what accepting would replace.
  s.send("m");
  s.send(KEY.enter);
  assert.match(s.lines()[1]!, /MERGE src\/application\/refund\.ts · code/);
  assert.match(s.text(), /- \/\/ written meanwhile/);
  s.send("a");
  s.send("w");
  await s.app.idle();
  assert.match(readFileSync(code, "utf8"), /^export function refund/);
  s.send("m");
  s.send(KEY.enter);
  assert.match(s.lines()[1]!, /MERGE tests\/refund\.test\.ts · code/);
  s.send("r");
  s.send("w");
  await s.app.idle();
  assert.ok(!existsSync(join(root, "tests/refund.test.ts")));
  assert.equal(s.app.state.proposals.length, 0);
});

test("tui: code proposals outside the sources keylang reads, or for generated wiring, are ignored", async (t) => {
  const root = checkoutRepo(t);
  writeFileSync(join(root, "keylang.gen.ts"), "// keylang:generated — не редагувати, `keylang wire`\n");
  propose(root, "keylang.gen.ts", "export {};\n");
  propose(root, "node_modules/pkg/index.ts", "export {};\n");
  propose(root, "notes.txt", "hi\n");
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("m");
  assert.equal(s.app.state.mode, "view");
  assert.match(s.app.state.message ?? "", /keylang\.gen\.ts \(a generated file: it is written by `keylang wire` only\); node_modules\/pkg\/index\.ts \(in a directory sources are not read from\); notes\.txt \(not a source file of a language keylang reads\)/);
});

test("tui: proposals outside the spec directory or for the generated map are ignored", async (t) => {
  const root = checkoutRepo(t);
  writeFileSync(join(root, "README.md"), "# readme\n");
  propose(root, "README.md", "# overwritten\n");
  propose(root, "keylang/map/domain.md", "# overwritten\n");
  propose(root, "keylang/../README.md", "# overwritten\n");
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  assert.doesNotMatch(s.lines().at(-1)!, /proposal/);
  s.send("m");
  assert.equal(s.app.state.mode, "view");
  assert.match(s.app.state.message ?? "", /proposal ignored: README\.md \(outside keylang\/: a proposal changes specs only\); keylang\/map\/domain\.md \(a generated map file/);
  assert.equal(readFileSync(join(root, "README.md"), "utf8"), "# readme\n");
});

test("tui: w with nothing accepted keeps the proposal; u in MERGE restores the previous decision", async (t) => {
  const root = checkoutRepo(t);
  propose(root, FLOW_PATH, PAID.replace("  - step infrastructure.store.save\n", "  - step infrastructure.store.save\n- emits order.created\n"));
  const s = session(root, { cols: 150 });
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("m");
  s.send("w");
  assert.equal(s.app.state.mode, "merge", "w without a decision stays in MERGE");
  assert.ok(existsSync(join(root, ".keylang/proposals", FLOW_PATH)));
  s.send("a");
  s.send("N");
  s.send("r");
  assert.match(s.lines()[1]!, /0 accepted, 1 rejected, 1 pending/);
  s.send("u");
  assert.match(s.lines()[1]!, /1 accepted, 0 rejected, 1 pending/, "u restores `accepted`, not `pending`");
  // One hunk decided, one pending: the result is written and the proposal keeps the rest.
  s.send("w");
  await s.app.idle();
  assert.equal(readFileSync(join(root, FLOW_PATH), "utf8"), PAID);
  assert.ok(existsSync(join(root, ".keylang/proposals", FLOW_PATH)), "a pending hunk keeps the proposal");
  s.send("m");
  assert.match(s.lines()[1]!, /hunk 1\/1/);
});

test("tui: a click during MERGE keeps the merge; a click in FILES follows the scroll", async (t) => {
  const specs: Record<string, string> = {};
  for (let i = 10; i < 40; i++) specs[`keylang/flows/f${i}.md`] = `# flow f${i}\n`;
  const root = checkoutRepo(t, specs);
  propose(root, FLOW_PATH, PAID);
  const s = session(root, { cols: 110, rows: 16 });
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("\x1b[12~");
  for (let i = 0; i < 25; i++) s.send("j");
  const top = s.lines().findIndex((line) => line.includes("FILES")) + 1;
  const first = s.lines()[top]!.slice(0, 24).trim();
  s.send(click(3, top));
  assert.equal(s.app.state.current, first, "the row clicked, not the row the unscrolled list had there");
  s.app.state.current = FLOW_PATH;
  s.send("m");
  s.send(click(40, 5));
  assert.equal(s.app.state.mode, "merge");
  assert.match(s.text(), /finish the merge first/);
});

test("tui: typing while an analysis runs keeps the result outdated", async (t) => {
  const root = checkoutRepo(t);
  let release: () => void = () => {};
  let calls = 0;
  const s = session(root, {
    analyzer: async (request) => {
      calls++;
      if (calls === 2) await new Promise<void>((done) => (release = done));
      return analyze(request);
    },
  });
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.f5);
  s.send("i");
  s.send(KEY.end);
  s.send("x");
  release();
  await sleep(20);
  assert.equal(s.app.state.outdated, true, "the result belongs to the text before `x`");
  await s.app.idle();
  assert.equal(s.app.state.outdated, false);
});

test("tui: a paste without bracketed paste is one edit", async (t) => {
  const root = checkoutRepo(t);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("i");
  const text = "word ".repeat(3200);
  const started = performance.now();
  s.send(`${text}\rsecond line`);
  assert.ok(performance.now() - started < 1000, `took ${performance.now() - started} ms`);
  assert.match(s.app.state.buffers.get(FLOW_PATH)!.text, /^(word ){3200}\nsecond line# flow checkout/);
});

test("tui: CRLF files diff by line and keep their line endings", async (t) => {
  const crlf = CHECKOUT_FLOW.replace(/\n/g, "\r\n");
  const root = checkoutRepo(t, { [FLOW_PATH]: crlf });
  propose(root, FLOW_PATH, PAID);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("m");
  assert.equal(s.app.state.merge?.hunks.length, 1);
  s.send("a");
  s.send("w");
  await s.app.idle();
  assert.equal(readFileSync(join(root, FLOW_PATH), "utf8"), PAID.replace(/\n/g, "\r\n"));
});

test("tui: combining marks, ZWJ emoji and emoji widths in the editor", async (t) => {
  const line = "Café ✅ 🚀 👨‍👩‍👧 done";
  const s = session(checkoutRepo(t, { [FLOW_PATH]: CHECKOUT_FLOW.replace("Checkout from the terminal.", line) }), { cols: 90, rows: 20 });
  t.after(() => s.app.close());
  await s.app.idle();
  assert.equal(stringWidth("✅"), 2);
  assert.equal(stringWidth("🚀"), 2);
  assert.equal(stringWidth("👨‍👩‍👧"), 2);
  assert.ok(s.text().includes(line), s.text());
  for (const row of s.lines()) assert.equal(stringWidth(row), 90);
  // The cursor steps over whole clusters: End, then Backspace removes the family, not one of its code points.
  s.send(KEY.down);
  s.send(KEY.down);
  s.send("i");
  s.send(KEY.end);
  for (let i = 0; i < 5; i++) s.send("\x7f");
  s.send("\x7f");
  assert.equal(s.app.state.buffers.get(FLOW_PATH)!.text.split("\n")[2], "Café ✅ 🚀 ");
});

test("tui: Ctrl+G joins wrapped lines and does not add the same items twice", async (t) => {
  const flow = CHECKOUT_FLOW.replace("Checkout from the terminal.", "When the cart is full,\nthen buy is called.");
  const root = checkoutRepo(t, { [FLOW_PATH]: flow });
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.down);
  s.send(KEY.down);
  s.send("i");
  s.send(KEY.ctrlG);
  assert.equal(s.app.state.mode, "merge");
  s.send("a");
  s.send("w");
  assert.match(s.app.state.buffers.get(FLOW_PATH)!.text, /then buy is called\.\n- when the cart is full\n {2}- step application\.purchase\.buy\n/);
  s.send(KEY.ctrlG);
  assert.equal(s.app.state.mode, "edit");
  assert.match(s.text(), /already there/);
});

test("input: a paste end split across chunks, and a paste whose end never comes", () => {
  const decoder = new InputDecoder();
  assert.deepEqual(decoder.feed("\x1b[200~abc\x1b[20"), []);
  assert.deepEqual(decoder.feed("1~x"), [
    { type: "paste", text: "abc" },
    { type: "key", name: "x", ctrl: false, alt: false, shift: false, text: "x" },
  ]);
  assert.deepEqual(decoder.feed("\x1b[200~lost end"), []);
  assert.equal(decoder.pasting, true);
  assert.deepEqual(decoder.flush(), [{ type: "paste", text: "lost end" }]);
  assert.deepEqual(decoder.feed("y"), [{ type: "key", name: "y", ctrl: false, alt: false, shift: false, text: "y" }]);
});

test("screen: an OSC 8 target with control characters is dropped", () => {
  const grid = new Grid(20, 1);
  grid.write(0, 0, "evil", { link: "https://x/\x1b]0;pwned\x07" });
  grid.write(5, 0, "good", { link: "https://example.com/a" });
  const ansi = renderDiff(null, grid);
  assert.doesNotMatch(ansi, /pwned/);
  assert.match(ansi, /\x1b\]8;;https:\/\/example\.com\/a\x1b\\/);
  assert.deepEqual(inline("[x](https://a/\x1b[31m)", {}).map((segment) => segment.style.link), [undefined]);
});

test("text → spec: a `then` on the next line or sentence belongs to its `when`", () => {
  const known = ["application.purchase.buy"];
  assert.deepEqual(textToSpec("When the cart is full,\nthen buy is called.", 0, known, known), ["- when the cart is full", "  - step application.purchase.buy"]);
  assert.deepEqual(textToSpec("When the cart is full. Then buy is called.", 0, known, known), ["- when the cart is full", "  - step application.purchase.buy"]);
});

test("terminal: $EDITOR words keep quoted spaces and an existing path", () => {
  assert.deepEqual(splitCommand('"/opt/My Editor/bin/edit" -w', () => false), ["/opt/My Editor/bin/edit", "-w"]);
  assert.deepEqual(splitCommand("/opt/My\\ Editor/edit --wait", () => false), ["/opt/My Editor/edit", "--wait"]);
  assert.deepEqual(splitCommand("/Applications/My Editor", (path) => path === "/Applications/My Editor"), ["/Applications/My Editor"]);
  assert.deepEqual(editorCommand({ EDITOR: "'/opt/Visual Studio Code/code' --reuse-window" }, "/r/a.ts", 3), { command: "/opt/Visual Studio Code/code", args: ["--reuse-window", "-g", "/r/a.ts:3"], wait: false });
});

test("tui: keylang.json opens in the same editor and a saved change reaches the analysis", async (t) => {
  const root = checkoutRepo(t);
  const s = session(root, { cols: 120 });
  t.after(() => s.app.close());
  await s.app.idle();
  assert.equal(s.app.state.files.at(-1), "keylang.json");
  s.send(":");
  for (const ch of "open keylang.json") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.current, "keylang.json");
  assert.match(s.lines()[0]!, /keylang · keylang\.json /);
  assert.doesNotMatch(s.lines()[0]!, /read-only/);
  // Drop the `presentation` layer: its module becomes unassigned and the flow trigger no longer resolves.
  const config = JSON.parse(readFileSync(join(root, "keylang.json"), "utf8")) as { layers: Record<string, string[]> };
  delete config.layers.presentation;
  s.send("i");
  s.app.state.buffers.get("keylang.json")!.text = `${JSON.stringify(config, null, 2)}\n`;
  s.send(KEY.ctrlS);
  await s.app.idle();
  assert.doesNotMatch(readFileSync(join(root, "keylang.json"), "utf8"), /presentation/);
  assert.match(s.lines().at(-1)!, /✗ [1-9]/);
});

// ---------- re-review of the fixes ----------

test("tui: a cut-off escape sequence and pasted colours never reach the spec", async (t) => {
  const root = checkoutRepo(t);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("i");
  s.send("\x1b[1;5");
  await sleep(60);
  s.send("\x1b[200~\x1b[31mred\x1b[0m\x07\x1b]0;title\x07!\x1b[201~");
  assert.equal(s.app.state.buffers.get(FLOW_PATH)!.text.split("\n")[0], "red!# flow checkout");
  const decoder = new InputDecoder();
  assert.deepEqual(decoder.feed("\x1b["), []);
  assert.deepEqual(decoder.flush(), [], "an unfinished CSI is dropped, not typed");
});

test("tui: the cursor stays on screen at the end of a long line of wide characters", async (t) => {
  const root = checkoutRepo(t, { [FLOW_PATH]: CHECKOUT_FLOW.replace("Checkout from the terminal.", "界".repeat(60)) });
  const s = session(root, { cols: 110 });
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.down);
  s.send(KEY.down);
  s.send("i");
  s.send(KEY.end);
  assert.ok(s.app.state.left > 0, "the line scrolls");
  assert.notEqual(s.app.frame().cursor, null, "the cursor is drawn");
});

test("tui: undo closes the completion list, so Tab cannot splice into other text", async (t) => {
  const root = checkoutRepo(t);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("G");
  s.send("i");
  for (const ch of "- step appl") s.send(ch);
  assert.ok(s.app.state.completion, "the list is open");
  s.send("\x1a");
  assert.equal(s.app.state.completion, null);
  s.send(KEY.tab);
  assert.doesNotMatch(s.app.state.buffers.get(FLOW_PATH)!.text, /application\.purchase\.buy\n?$/);
});

test("tui: with `dir: \".\"` a proposal still changes only files that are specs", async (t) => {
  const root = checkoutRepo(t);
  const config = JSON.parse(readFileSync(join(root, "keylang.json"), "utf8")) as Record<string, unknown>;
  writeFileSync(join(root, "keylang.json"), JSON.stringify({ ...config, dir: "." }));
  writeFileSync(join(root, "README.md"), "# readme\n");
  propose(root, "node_modules/pkg/README.md", "# overwritten\n");
  propose(root, ".github/notes.md", "# overwritten\n");
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("m");
  assert.match(s.app.state.message ?? "", /proposal ignored: \.github\/notes\.md \(in a directory specs are not read from\); node_modules\/pkg\/README\.md \(in a directory/);
});

test("tui: Ctrl+S over a file changed on disk asks first; mixed line endings survive a save", async (t) => {
  const mixed = CHECKOUT_FLOW.replace("# flow checkout\n", "# flow checkout\r\n");
  const root = checkoutRepo(t, { [FLOW_PATH]: mixed });
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("G");
  s.send("i");
  s.send("x");
  writeFileSync(join(root, FLOW_PATH), `${mixed}<!-- from another editor -->\n`);
  s.send(KEY.ctrlS);
  assert.match(s.text(), /changed on disk since it was opened: Ctrl\+S again overwrites it/);
  assert.match(readFileSync(join(root, FLOW_PATH), "utf8"), /from another editor/);
  s.send(KEY.ctrlS);
  await s.app.idle();
  const saved = readFileSync(join(root, FLOW_PATH), "utf8");
  assert.equal(saved, `${mixed}x`, "only the edited line changed; the CRLF line and the LF lines stay");
});

test("tui: an unreadable proposals directory is no proposals, not a crash", async (t) => {
  const root = checkoutRepo(t);
  mkdirSync(join(root, ".keylang"), { recursive: true });
  writeFileSync(join(root, ".keylang/proposals"), "a file where the directory should be");
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("m");
  assert.match(s.text(), /no proposals under \.keylang\/proposals\//);
});

test("tui: the context panel (F4) shows what goes to the model; @id adds, x drops, tokens follow; planned is marked", async (t) => {
  const flow = CHECKOUT_FLOW.replace("- trigger presentation.terminal.checkout", "- planned fn application.purchase.refund () → void\n- trigger presentation.terminal.checkout");
  const root = checkoutRepo(t, { "keylang/flows/checkout.md": flow });
  const s = session(root, { cols: 150 });
  t.after(() => s.app.close());
  await s.app.idle();
  // The cursor on `- step application.purchase.buy`.
  for (let i = 0; i < 6; i++) s.send(KEY.down);
  s.send("\x1bOS");
  assert.equal(s.app.state.focus, "context");
  const tokens = (): number => Number(/CONTEXT · (\d+) tok/.exec(s.text())?.[1]);
  const before = tokens();
  assert.ok(before > 0, s.text());
  assert.match(lineOf(s.lines(), "node     application.purchase.buy"), /· \d+/);
  assert.match(s.text(), /neighbor domain\.order\.create/);
  assert.match(s.text(), /flow {5}flow checkout/);
  s.send("@");
  for (const ch of "presentation.terminal.checkout") s.send(ch);
  s.send(KEY.enter);
  assert.match(s.app.state.message ?? "", /context: presentation\.terminal\.checkout added/);
  assert.ok(tokens() > before);
  s.send("@");
  for (const ch of "application.purchase.nope") s.send(ch);
  s.send(KEY.enter);
  assert.match(s.app.state.message ?? "", /unknown id `application\.purchase\.nope`/);
  const withAdded = tokens();
  // The first item is the buffer: x leaves it out.
  s.send("x");
  assert.match(s.app.state.message ?? "", /context: keylang\/flows\/checkout\.md left out/);
  assert.ok(tokens() < withAdded);
  s.send("\x1bOS");
  assert.equal(s.app.state.focus, "editor");
  // On the planned line, the intention is marked in the panel.
  s.send(KEY.up);
  s.send(KEY.up);
  s.send("\x1bOS");
  assert.match(lineOf(s.lines(), "node     application.purchase.refund"), /◇/);
});

/** A Messages API stand-in in this process: the TUI runs here too. `delay` holds each answer back. */
async function mockModel(t: { after: (f: () => void) => void }, reply: string, delay = 0): Promise<{ prompts: string[] }> {
  const prompts: string[] = [];
  const server = createServer((req, res) => {
    let data = "";
    req.on("data", (chunk: Buffer) => (data += chunk.toString()));
    req.on("end", () => {
      prompts.push((JSON.parse(data) as { messages: { content: string }[] }).messages[0]!.content);
      setTimeout(() => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ id: "m", type: "message", role: "assistant", model: "claude-opus-5", content: [{ type: "text", text: reply }], stop_reason: "end_turn", stop_details: null, usage: { input_tokens: 1, output_tokens: 1 } }));
      }, delay);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const saved = { url: process.env.ANTHROPIC_BASE_URL, key: process.env.ANTHROPIC_API_KEY };
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_API_KEY = "test";
  t.after(() => {
    server.close();
    if (saved.url === undefined) delete process.env.ANTHROPIC_BASE_URL;
    else process.env.ANTHROPIC_BASE_URL = saved.url;
    if (saved.key === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = saved.key;
  });
  return { prompts };
}

test("tui: Ctrl+Space in a flow asks the agent with the context pack and opens the draft as MERGE; nothing is written before w", async (t) => {
  const root = checkoutRepo(t);
  const config = join(root, "keylang.json");
  writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, "utf8")), agent: "anthropic:claude-opus-5" }));
  const model = await mockModel(t, "```markdown\n# flow checkout\n\n- trigger presentation.terminal.checkout\n  - step application.purchase.buy\n    - step domain.order.create\n    - step infrastructure.store.save\n```");
  const s = session(root, { cols: 150 });
  t.after(() => s.app.close());
  await s.app.idle();
  for (let i = 0; i < 5; i++) s.send(KEY.down);
  s.send(KEY.ctrlSpace);
  await s.app.idle();
  assert.equal(model.prompts.length, 1);
  assert.match(model.prompts[0]!, /Context chosen by the developer:\n\[buffer\] keylang\/flows\/checkout\.md/);
  assert.equal(s.app.state.mode, "merge", s.app.state.message ?? "");
  assert.equal(readFileSync(join(root, "keylang/flows/checkout.md"), "utf8"), CHECKOUT_FLOW, "nothing written before w");
  for (let i = 0; i < s.app.state.merge!.hunks.length; i++) s.send("a");
  s.send("w");
  await s.app.idle();
  assert.match(readFileSync(join(root, "keylang/flows/checkout.md"), "utf8"), /- step domain\.order\.create <!-- keylang:llm model=anthropic:claude-opus-5 status=agree -->/);
  const stats = JSON.parse(readFileSync(join(root, ".keylang/stats.json"), "utf8")) as { drafts: Record<string, { proposed: number; accepted: number }> };
  assert.equal(stats.drafts.agree?.proposed, 4);
  assert.equal(stats.drafts.agree?.accepted, 4);
});

test("tui: Ctrl+Space says which lines of the model's draft it dropped", async (t) => {
  const root = checkoutRepo(t);
  const config = join(root, "keylang.json");
  writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, "utf8")), agent: "anthropic:claude-opus-5" }));
  await mockModel(t, "# flow checkout\n\n- trigger presentation.terminal.checkout\n  - step application.purchase.buy\n  - invariant paid once\n    - step domain.order.create\n");
  const s = session(root, { cols: 150 });
  t.after(() => s.app.close());
  await s.app.idle();
  for (let i = 0; i < 5; i++) s.send(KEY.down);
  s.send(KEY.ctrlSpace);
  await s.app.idle();
  assert.equal(s.app.state.mode, "merge", s.app.state.message ?? "");
  assert.match(s.app.state.message ?? "", /^agent: dropped from the model's draft: - step domain\.order\.create: /);
});

test("tui: Ctrl+Space without a model or in a flow without a trigger explains what to do", async (t) => {
  const noTrigger = checkoutRepo(t, { "keylang/flows/checkout.md": CHECKOUT_FLOW.replace("- trigger presentation.terminal.checkout\n", "") });
  const bare = session(noTrigger, { cols: 150 });
  t.after(() => bare.app.close());
  await bare.app.idle();
  bare.send(KEY.ctrlSpace);
  assert.match(bare.app.state.message ?? "", /put the cursor in a `# flow` with a `trigger`/);
  const root = checkoutRepo(t);
  const s = session(root, { cols: 150 });
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.ctrlSpace);
  await s.app.idle();
  assert.match(s.app.state.message ?? "", /agent: no model configured: set `agent` in keylang\.json/);
  assert.equal(s.app.state.mode, "view");
});

test("tui: ghost text appears only on a new flow item, never with an unknown id; Alt+] cycles, Tab takes it, Esc drops it; counts go to stats", async (t) => {
  const root = checkoutRepo(t);
  const config = join(root, "keylang.json");
  writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, "utf8")), agent: "anthropic:claude-opus-5", ghost: { delay: 0 } }));
  const model = await mockModel(t, "- step domain.order.create\n- step domain.order.invented\n- invariant the order is saved once");
  const s = session(root, { cols: 150 });
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("i");
  // On a line with content there is no signal: nothing is asked.
  for (let i = 0; i < 7; i++) s.send(KEY.down);
  s.send(KEY.end);
  await s.app.idle();
  assert.equal(model.prompts.length, 0);
  // Enter opens a new `  - ` item under the step: the signal.
  s.send(KEY.enter);
  await s.app.idle();
  assert.equal(model.prompts.length, 1);
  const ghost = s.app.state.ghost!;
  assert.deepEqual(ghost.variants, ["  - step domain.order.create", "  - invariant the order is saved once"], "the invented id is dropped");
  assert.match(s.text(), /- step domain\.order\.create {2}\(1\/2, Alt\+\]\)/);
  s.send("\x1b]");
  assert.equal(s.app.state.ghost!.index, 1);
  s.send(KEY.tab);
  assert.equal(s.app.state.ghost, null);
  assert.equal(s.app.state.buffers.get("keylang/flows/checkout.md")!.text.split("\n")[8], "  - invariant the order is saved once");
  s.send(KEY.enter);
  await s.app.idle();
  assert.ok(s.app.state.ghost);
  s.send("\x1b");
  await sleep(60);
  assert.equal(s.app.state.ghost, null);
  const stats = JSON.parse(readFileSync(join(root, ".keylang/stats.json"), "utf8")) as { suggestions: Record<string, { proposed: number; accepted: number; rejected: number }> };
  assert.equal(stats.suggestions.ghost?.proposed, 2);
  assert.equal(stats.suggestions.ghost?.accepted, 1);
  assert.equal(stats.suggestions.ghost?.rejected, 1);
});

/** An OpenRouter stand-in in this process: records the audio requests, answers with the next text. */
async function mockOpenRouter(t: { after: (f: () => void) => void }, replies: string[]): Promise<{ bodies: { model: string; messages: { content: { type: string; text?: string; input_audio?: { data: string; format: string } }[] }[] }[] }> {
  const bodies: { model: string; messages: { content: { type: string; text?: string; input_audio?: { data: string; format: string } }[] }[] }[] = [];
  const server = createServer((req, res) => {
    let data = "";
    req.on("data", (chunk: Buffer) => (data += chunk.toString()));
    req.on("end", () => {
      bodies.push(JSON.parse(data));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: replies[Math.min(bodies.length - 1, replies.length - 1)] } }] }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const saved = { url: process.env.OPENROUTER_BASE_URL, key: process.env.OPENROUTER_API_KEY };
  process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.OPENROUTER_API_KEY = "test";
  t.after(() => {
    server.close();
    for (const [name, value] of [["OPENROUTER_BASE_URL", saved.url], ["OPENROUTER_API_KEY", saved.key]] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  return { bodies };
}

/** Recorded PCM: `seconds` of a 440 Hz tone, in 0.5 s chunks. */
function recorded(seconds: number): AppOptions["microphone"] {
  return async () => {
    const chunks: Int16Array[] = [];
    for (let s = 0; s < seconds * 2; s++) chunks.push(Int16Array.from({ length: 8000 }, (_, i) => Math.round(Math.sin(((s * 8000 + i) * 2 * Math.PI * 440) / 16000) * 8000)));
    return { chunks: (async function* () { yield* chunks; })(), stop: () => {} };
  };
}

test("tui: Ctrl+R records, OpenRouter recognizes with a glossary; «крок …» on a new item becomes a step with the matched id", async (t) => {
  const root = checkoutRepo(t);
  const config = join(root, "keylang.json");
  writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, "utf8")), voice: { engine: "openrouter" } }));
  const audio = await mockOpenRouter(t, ["крок store save"]);
  const s = session(root, { cols: 150, microphone: recorded(2) });
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("i");
  for (let i = 0; i < 6; i++) s.send(KEY.down);
  s.send(KEY.end);
  s.send(KEY.enter);
  s.send("\x12");
  await s.app.idle();
  assert.equal(audio.bodies.length, 1);
  const parts = audio.bodies[0]!.messages[0]!.content;
  assert.equal(audio.bodies[0]!.model, "openai/gpt-4o-audio-preview");
  assert.equal(parts[1]!.input_audio!.format, "wav");
  assert.equal(Buffer.from(parts[1]!.input_audio!.data, "base64").subarray(0, 4).toString(), "RIFF");
  assert.match(parts[0]!.text!, /Terms that may occur: .*domain\.order\.create/);
  assert.equal(s.app.state.buffers.get("keylang/flows/checkout.md")!.text.split("\n")[7], "  - step infrastructure.store.save");
});

test("tui: Ctrl+R without an engine or a microphone explains what to set up; nothing is recorded", async (t) => {
  const root = checkoutRepo(t);
  const saved = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  t.after(() => {
    if (saved !== undefined) process.env.OPENROUTER_API_KEY = saved;
  });
  const s = session(root, { cols: 150 });
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("\x12");
  assert.match(s.app.state.message ?? "", /press i to edit, then Ctrl\+R/);
  s.send("i");
  s.send("\x12");
  await s.app.idle();
  assert.match(s.app.state.message ?? "", /(install the optional @fugood\/whisper\.node and )?put a model .* or set OPENROUTER_API_KEY/);
});

test("tui: a recording longer than 25 s goes in overlapping windows; the words the overlap repeats are joined once", async (t) => {
  const root = checkoutRepo(t);
  const config = join(root, "keylang.json");
  writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, "utf8")), voice: { engine: "openrouter", model: "some/audio-model" } }));
  const audio = await mockOpenRouter(t, ["paid by card and", "card and then shipped"]);
  const s = session(root, { cols: 150, microphone: recorded(30) });
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("i");
  s.send(KEY.down);
  s.send(KEY.down);
  s.send(KEY.end);
  s.send(" ");
  s.send("\x12");
  await s.app.idle();
  assert.equal(audio.bodies.length, 2, "25 s windows with 1 s overlap: two for 30 s");
  assert.equal(audio.bodies[0]!.model, "some/audio-model");
  assert.equal(s.app.state.buffers.get("keylang/flows/checkout.md")!.text.split("\n")[2], "Checkout from the terminal. paid by card and then shipped");
});

// ---------- review 2026-09-28 (full, session, grok): TUI and web ----------

async function waitUntil(check: () => boolean, what: string, timeout = 10000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error(`timed out waiting for ${what}`);
    await sleep(10);
  }
}

function withConfig(root: string, extra: Record<string, unknown>): void {
  const config = join(root, "keylang.json");
  writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, "utf8")), ...extra }));
}

const REFUND = "# flow refund\n\n- trigger application.purchase.buy\n";

test("tui: a long line costs one pass per key, not one per column; a megabyte typed in the view is one ignored paste", async (t) => {
  const s = session(checkoutRepo(t));
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("i");
  const started = performance.now();
  // Typed without bracketed paste, then pasted with it and ending in a short word (the completion's word search).
  s.send("a".repeat(200_000));
  s.send(`\x1b[200~${"b".repeat(100_000)} c\x1b[201~`);
  s.send("d");
  s.send("\x1b[H");
  s.send(KEY.end);
  s.send(KEY.end);
  s.send("\x7f");
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 5000, `a 300 000-character line took ${Math.round(elapsed)} ms`);
  const line = s.app.state.buffers.get(FLOW_PATH)!.text.split("\n")[0]!;
  assert.equal(line, `${"a".repeat(200_000)}${"b".repeat(100_000)} cd# flow checkou`);
  assert.ok(s.app.state.left > 0, "the line scrolls to its end");
  assert.notEqual(s.app.frame().cursor, null, "the cursor is on screen");
  s.send("\x1b");
  await sleep(40);
  const before = s.app.state.buffers.get(FLOW_PATH)!.text;
  const view = performance.now();
  s.send("j".repeat(1_000_000));
  assert.ok(performance.now() - view < 5000, `a megabyte frame in the view took ${Math.round(performance.now() - view)} ms`);
  assert.match(s.app.state.message ?? "", /paste: press i to edit first/);
  assert.equal(s.app.state.cursor.line, 0, "not a million commands");
  assert.equal(s.app.state.buffers.get(FLOW_PATH)!.text, before);
});

test("tui: text pasted without bracketed paste in MERGE is not a string of commands; a held key still repeats", async (t) => {
  const root = checkoutRepo(t);
  propose(root, FLOW_PATH, PAID);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("m");
  assert.equal(s.app.state.mode, "merge");
  // A path from the clipboard: its `a` would accept and its `w` write.
  s.send("keylang/flows/checkout.md");
  assert.equal(s.app.state.mode, "merge");
  assert.deepEqual(s.app.state.merge!.decisions, ["pending"]);
  assert.match(s.app.state.message ?? "", /paste: press i to edit first/);
  assert.equal(readFileSync(join(root, FLOW_PATH), "utf8"), CHECKOUT_FLOW);
  s.send("\x1b");
  await sleep(40);
  s.send("jjj");
  assert.equal(s.app.state.cursor.line, 3, "a key held down arrives as a few of the same key");
});

test("tui: w with an unwritable .keylang/stats.json still finishes the merge, and u takes it back", async (t) => {
  const root = checkoutRepo(t);
  propose(root, FLOW_PATH, PAID);
  // A directory where the metrics file should be: every write of it fails.
  mkdirSync(join(root, ".keylang/stats.json"), { recursive: true });
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("m");
  s.send("a");
  s.send("w");
  await s.app.idle();
  assert.equal(s.app.state.mode, "view", s.app.state.message ?? "");
  assert.equal(readFileSync(join(root, FLOW_PATH), "utf8"), PAID);
  assert.equal(existsSync(join(root, ".keylang/proposals", FLOW_PATH)), false);
  assert.match(s.app.state.message ?? "", /1 of 1 hunk\(s\) applied and written/);
  s.send("u");
  await s.app.idle();
  assert.equal(readFileSync(join(root, FLOW_PATH), "utf8"), CHECKOUT_FLOW);
  assert.ok(existsSync(join(root, ".keylang/proposals", FLOW_PATH)), "the proposal is back");
});

test("tui: a rejected hunk stays rejected when the rest of the proposal is merged later", async (t) => {
  const root = checkoutRepo(t);
  const proposed = PAID.replace("  - step domain.order.create", "  - step domain.order.create <!-- rejected -->").replace("  - step infrastructure.store.save\n", "  - step infrastructure.store.save\n- emits order.created\n");
  propose(root, FLOW_PATH, proposed);
  const s = session(root, { cols: 150 });
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("m");
  assert.equal(s.app.state.merge!.hunks.length, 3);
  s.send("a");
  s.send("r");
  assert.deepEqual(s.app.state.merge!.decisions, ["accepted", "rejected", "pending"]);
  s.send("w");
  await s.app.idle();
  assert.equal(readFileSync(join(root, FLOW_PATH), "utf8"), PAID);
  s.send("m");
  assert.match(s.lines()[1]!, /hunk 1\/1 · 0 accepted, 0 rejected, 1 pending/, "only the pending hunk comes back");
  assert.doesNotMatch(s.text(), /<!-- rejected -->/);
  assert.match(s.text(), /\+ - emits order\.created/);
});

test("tui: a proposal rewritten during MERGE is neither applied nor removed unseen; u keeps a newer proposal", async (t) => {
  const root = checkoutRepo(t);
  const proposal = join(root, ".keylang/proposals", FLOW_PATH);
  propose(root, FLOW_PATH, PAID);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("m");
  s.send("a");
  const second = CHECKOUT_FLOW.replace("Checkout from the terminal.", "Checkout, second version.");
  propose(root, FLOW_PATH, second);
  s.send("w");
  assert.match(s.app.state.message ?? "", /the proposal for keylang\/flows\/checkout\.md changed during the merge; nothing written/);
  assert.equal(readFileSync(join(root, FLOW_PATH), "utf8"), CHECKOUT_FLOW);
  assert.equal(readFileSync(proposal, "utf8"), second, "the agent's new proposal is kept");
  s.send("m");
  assert.match(s.text(), /\+ Checkout, second version\./);
  s.send("a");
  s.send("w");
  await s.app.idle();
  assert.equal(readFileSync(join(root, FLOW_PATH), "utf8"), second);
  // After the merge an agent proposes again; `u` restores the file but not the proposal it replaced.
  const third = CHECKOUT_FLOW.replace("Checkout from the terminal.", "Checkout, third version.");
  propose(root, FLOW_PATH, third);
  s.send("u");
  await s.app.idle();
  assert.equal(readFileSync(join(root, FLOW_PATH), "utf8"), CHECKOUT_FLOW);
  assert.equal(readFileSync(proposal, "utf8"), third);
  assert.match(s.app.state.message ?? "", /a newer proposal was written since and is kept/);
});

test("tui: a merge never writes outside the repository through a link whose target does not exist yet", async (t) => {
  const root = checkoutRepo(t);
  const outside = mkdtempSync(join(tmpdir(), "keylang-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  const s = session(root, { cols: 150 });
  t.after(() => s.app.close());
  await s.app.idle();
  // Links made after the first analysis: the analysis would stop at a dangling spec, the merge must not follow it.
  symlinkSync(join(outside, "spec.md"), join(root, "keylang/flows/linked.md"));
  symlinkSync(join(outside, "code.ts"), join(root, "src/domain/linked.ts"));
  propose(root, "keylang/flows/linked.md", "# flow linked\n");
  propose(root, "src/domain/linked.ts", "export function linked(): void {}\n");
  // The proposal check follows a dangling link too, so `m` refuses before a merge starts.
  s.send("m");
  assert.equal(s.app.state.merge, null);
  assert.match(s.app.state.message ?? "", /linked\.md.*leads out of .* through a link/);
  assert.equal(existsSync(join(outside, "spec.md")), false);
  s.app.state.current = "src/domain/linked.ts";
  s.send("m");
  assert.equal(s.app.state.merge, null);
  assert.match(s.app.state.message ?? "", /linked\.ts.*leads out of the repository through a link/);
  assert.equal(existsSync(join(outside, "code.ts")), false);
  assert.ok(existsSync(join(root, ".keylang/proposals/src/domain/linked.ts")), "the proposal stays");
});

test("tui: a ghost line is never taken into another file or over a paste", async (t) => {
  const root = checkoutRepo(t, { "keylang/flows/refund.md": REFUND });
  withConfig(root, { agent: "anthropic:claude-opus-5", ghost: { delay: 0 } });
  await mockModel(t, "- step domain.order.create");
  const s = session(root, { cols: 150 });
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("i");
  for (let i = 0; i < 7; i++) s.send(KEY.down);
  s.send(KEY.end);
  s.send(KEY.enter);
  await s.app.idle();
  assert.ok(s.app.state.ghost, "the ghost line is shown");
  // F2 and a click on another file: the ghost goes, and Tab in the other file is just a Tab.
  s.send("\x1b[12~");
  assert.equal(s.app.state.ghost, null);
  assert.equal(s.app.state.focus, "editor", "a panel shown from the editor leaves the keys in the editor");
  const other = locate(s.lines(), "keylang/flows/refund");
  s.send(click(other.x + 1, other.y));
  assert.equal(s.app.state.current, "keylang/flows/refund.md");
  s.send(KEY.tab);
  assert.doesNotMatch(s.app.state.buffers.get("keylang/flows/refund.md")!.text, /domain\.order\.create/);
  // Back in the flow, a new ghost line, then a paste on that line: Tab does not replace the pasted text.
  s.send(KEY.ctrlO);
  assert.equal(s.app.state.current, FLOW_PATH);
  s.send(KEY.end);
  await s.app.idle();
  assert.ok(s.app.state.ghost, "the ghost line is shown again");
  s.send("\x1b[200~step infrastructure.store.save\x1b[201~");
  assert.equal(s.app.state.ghost, null, "a paste drops it");
  s.send(KEY.tab);
  assert.match(s.app.state.buffers.get(FLOW_PATH)!.text.split("\n")[8]!, /^ {2}- step infrastructure\.store\.save/);
});

test("tui: two ghost requests for the same text show and count one line", async (t) => {
  const root = checkoutRepo(t);
  withConfig(root, { agent: "anthropic:claude-opus-5", ghost: { delay: 0 } });
  const model = await mockModel(t, "- step domain.order.create", 150);
  const s = session(root, { cols: 150 });
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("i");
  for (let i = 0; i < 7; i++) s.send(KEY.down);
  s.send(KEY.end);
  s.send(KEY.enter);
  await waitUntil(() => model.prompts.length === 1, "the first request");
  // A key that changes nothing: the same text is asked for again while the first answer is on its way.
  s.send(KEY.end);
  await s.app.idle();
  assert.equal(model.prompts.length, 2);
  assert.ok(s.app.state.ghost);
  const stats = JSON.parse(readFileSync(join(root, ".keylang/stats.json"), "utf8")) as { suggestions: Record<string, { proposed: number }> };
  assert.equal(stats.suggestions.ghost?.proposed, 1, "the superseded answer is not shown or counted");
});

/** A live source: one chunk, then silence until `stop`. */
function liveMicrophone(opened: { count: number }): AppOptions["microphone"] {
  return async () => {
    opened.count++;
    await sleep(50);
    let release: () => void = () => {};
    const stopped = new Promise<void>((done) => (release = done));
    return {
      chunks: (async function* () {
        yield Int16Array.from({ length: 1600 }, (_, i) => Math.round(Math.sin(i / 5) * 8000));
        await stopped;
      })(),
      stop: () => release(),
    };
  };
}

test("tui: two quick Ctrl+R open one microphone and give one transcription", { timeout: 20000 }, async (t) => {
  const root = checkoutRepo(t);
  withConfig(root, { voice: { engine: "openrouter" } });
  const audio = await mockOpenRouter(t, ["крок store save"]);
  const opened = { count: 0 };
  const s = session(root, { cols: 150, microphone: liveMicrophone(opened) });
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("i");
  for (let i = 0; i < 6; i++) s.send(KEY.down);
  s.send(KEY.end);
  s.send(KEY.enter);
  // The second Ctrl+R comes while the microphone is still opening: it stops this recording.
  s.send("\x12");
  s.send("\x12");
  await s.app.idle();
  assert.equal(opened.count, 1);
  assert.equal(audio.bodies.length, 1);
  assert.equal(s.app.state.buffers.get(FLOW_PATH)!.text.split("\n")[7], "  - step infrastructure.store.save");
});

test("tui: Ctrl+R in the view stops a recording; speech is not inserted after the mode or the file changed", { timeout: 20000 }, async (t) => {
  const root = checkoutRepo(t, { "keylang/flows/refund.md": REFUND });
  withConfig(root, { voice: { engine: "openrouter" } });
  const audio = await mockOpenRouter(t, ["крок store save"]);
  const opened = { count: 0 };
  const s = session(root, { cols: 150, microphone: liveMicrophone(opened) });
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("i");
  for (let i = 0; i < 6; i++) s.send(KEY.down);
  s.send(KEY.end);
  s.send(KEY.enter);
  s.send("\x12");
  await waitUntil(() => /recording/.test(s.app.state.message ?? ""), "the recording");
  s.send("\x1b");
  await sleep(40);
  assert.equal(s.app.state.mode, "view");
  s.send("\x12");
  await s.app.idle();
  assert.equal(audio.bodies.length, 1, "Ctrl+R in the view stopped it");
  assert.match(s.app.state.message ?? "", /«крок store save» not inserted: keylang\/flows\/checkout\.md changed or edit mode was left/);
  const flow = s.app.state.buffers.get(FLOW_PATH)!.text;
  // Recording in the flow, stopped in another file: neither gets the speech.
  s.send("i");
  s.send("\x12");
  await waitUntil(() => /recording/.test(s.app.state.message ?? ""), "the second recording");
  s.send("\x1b[12~");
  const other = locate(s.lines(), "keylang/flows/refund");
  s.send(click(other.x + 1, other.y));
  assert.equal(s.app.state.current, "keylang/flows/refund.md");
  s.send("\x12");
  await s.app.idle();
  assert.equal(audio.bodies.length, 2);
  assert.equal(s.app.state.buffers.get("keylang/flows/refund.md")!.text, REFUND);
  assert.equal(s.app.state.buffers.get(FLOW_PATH)!.text, flow);
});

test("tui: Ctrl+Space never overwrites a waiting proposal and asks nothing over unsaved edits", async (t) => {
  const root = checkoutRepo(t);
  withConfig(root, { agent: "anthropic:claude-opus-5" });
  const model = await mockModel(t, "```markdown\n# flow checkout\n\n- trigger presentation.terminal.checkout\n  - step application.purchase.buy\n```");
  propose(root, FLOW_PATH, PAID);
  const s = session(root, { cols: 150 });
  t.after(() => s.app.close());
  await s.app.idle();
  for (let i = 0; i < 5; i++) s.send(KEY.down);
  s.send(KEY.ctrlSpace);
  await s.app.idle();
  assert.match(s.app.state.message ?? "", /a proposal for keylang\/flows\/checkout\.md is waiting: m merges it/);
  assert.equal(model.prompts.length, 0);
  assert.equal(readFileSync(join(root, ".keylang/proposals", FLOW_PATH), "utf8"), PAID);
  rmSync(join(root, ".keylang/proposals", FLOW_PATH));
  s.send("i");
  s.send("x");
  s.send("\x1b");
  await sleep(40);
  s.send(KEY.ctrlSpace);
  await s.app.idle();
  assert.match(s.app.state.message ?? "", /unsaved changes: save \(Ctrl\+S\) or undo them before asking for a draft/);
  assert.equal(model.prompts.length, 0);
});

test("tui: a draft that arrives during another merge waits as a proposal instead of replacing it", async (t) => {
  const root = checkoutRepo(t);
  withConfig(root, { agent: "anthropic:claude-opus-5" });
  await mockModel(t, "```markdown\n# flow checkout\n\n- trigger presentation.terminal.checkout\n  - step application.purchase.buy\n```", 200);
  propose(root, "keylang/rules.md", "# rules\n\n- layers domain < infrastructure < application < presentation\n- no-cycles\n");
  const s = session(root, { cols: 150 });
  t.after(() => s.app.close());
  await s.app.idle();
  for (let i = 0; i < 5; i++) s.send(KEY.down);
  s.send(KEY.ctrlSpace);
  s.send("m");
  s.send(KEY.enter);
  assert.equal(s.app.state.merge?.path, "keylang/rules.md");
  s.send("a");
  await s.app.idle();
  assert.equal(s.app.state.merge?.path, "keylang/rules.md", "the merge in progress is kept");
  assert.deepEqual(s.app.state.merge?.decisions, ["accepted"]);
  assert.match(s.app.state.message ?? "", /the draft of flow checkout is a proposal for keylang\/flows\/checkout\.md: m merges it/);
  assert.ok(existsSync(join(root, ".keylang/proposals", FLOW_PATH)));
});

test("tui: a click in the context panel selects its row, never the navigation item under it", async (t) => {
  const s = session(checkoutRepo(t), { cols: 150 });
  t.after(() => s.app.close());
  await s.app.idle();
  for (let i = 0; i < 6; i++) s.send(KEY.down);
  s.send("\x1bOS");
  const row = locate(s.lines(), "neighbor application.purchase.buy");
  s.send(click(row.x + 2, row.y));
  assert.equal(s.app.state.mode, "view", "no code opened for a hidden navigation item");
  assert.equal(s.app.state.current, FLOW_PATH);
  assert.equal(s.app.state.focus, "context");
  assert.equal(s.app.contextPack()!.items[s.app.state.context.index]!.label, "application.purchase.buy");
});

test("tui: Esc from a Ctrl+G merge goes back to editing; F4 while editing keeps the keys in the editor", async (t) => {
  const root = checkoutRepo(t);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.down);
  s.send(KEY.down);
  s.send("i");
  s.send(KEY.end);
  for (const ch of " Then buy is called.") s.send(ch);
  s.send(KEY.ctrlG);
  assert.equal(s.app.state.mode, "merge");
  s.send("\x1b");
  await sleep(40);
  assert.equal(s.app.state.mode, "edit", "back where Ctrl+G was pressed");
  s.send("\x1bOS");
  assert.equal(s.app.state.context.open, true);
  assert.equal(s.app.state.focus, "editor");
  s.send("!");
  assert.match(s.app.state.buffers.get(FLOW_PATH)!.text.split("\n")[2]!, /Then buy is called\.!$/);
  assert.notEqual(s.app.frame().cursor, null, "the cursor is drawn");
});

test("tui: K in reading mode anchors the hover at the rendered row", async (t) => {
  // A long description wraps into several rows when rendered: the raw line number is not the row.
  const s = session(checkoutRepo(t, { [FLOW_PATH]: CHECKOUT_FLOW.replace("Checkout from the terminal.", "Checkout from the terminal. ".repeat(12)) }));
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("v");
  for (let i = 0; i < 5; i++) s.send(KEY.down);
  s.send("K");
  assert.ok(s.app.state.hover, s.app.state.message ?? "");
  const rendered = s.app.frame().lines().findIndex((line) => line.includes("step application.purchase.buy"));
  assert.equal(s.app.state.hover!.y, rendered);
});

// ---------- the terminal transport ----------

/** A terminal and a process for `runTerminal`: what it writes, and a way to send it keys, signals and crashes. */
function fakeTerminal(env: NodeJS.ProcessEnv = {}): { host: TerminalHost; out: string[]; err: string[]; raw: () => boolean; suspended: () => number; type: (keys: string) => void; signal: (signal: TerminalSignal) => void; crash: (error: unknown) => void; resize: () => void } {
  let raw = false;
  let suspended = 0;
  const out: string[] = [];
  const err: string[] = [];
  const stdin = Object.assign(new EventEmitter(), { isTTY: true, setRawMode: (value: boolean) => (raw = value), setEncoding: () => {}, pause: () => {}, resume: () => {} });
  const stdout = Object.assign(new EventEmitter(), { columns: 100, rows: 30, write: (text: string) => out.push(text) });
  let handlers: { onSignal: (signal: TerminalSignal) => void; onCrash: (error: unknown) => void } | null = null;
  const host: TerminalHost = {
    stdin,
    stdout,
    stderr: (text) => void err.push(text),
    env,
    listen: (onSignal, onCrash) => {
      handlers = { onSignal, onCrash };
      return () => (handlers = null);
    },
    suspend: () => void suspended++,
  };
  return {
    host,
    out,
    err,
    raw: () => raw,
    suspended: () => suspended,
    type: (keys) => void stdin.emit("data", keys),
    signal: (signal) => handlers?.onSignal(signal),
    crash: (error) => handlers?.onCrash(error),
    resize: () => void stdout.emit("resize"),
  };
}

test("terminal: a signal restores the screen and the session returns 0; a crash returns 2 with its message", async (t) => {
  const root = checkoutRepo(t);
  const quit = fakeTerminal();
  const first = runTerminal(root, quit.host);
  await waitUntil(() => /✗ 0/.test(quit.out.join("")), "the first analysis");
  assert.equal(quit.raw(), true);
  quit.signal("SIGINT");
  assert.equal(await first, 0);
  assert.equal(quit.out.at(-1), LEAVE, "the screen is restored");
  assert.equal(quit.raw(), false);
  const crash = fakeTerminal();
  const second = runTerminal(root, crash.host);
  await waitUntil(() => crash.out.join("").includes("checkout"), "the first frame");
  crash.crash(new Error("boom"));
  assert.equal(await second, 2);
  assert.ok(crash.out.includes(LEAVE));
  assert.match(crash.err.join(""), /^keylang: Error: boom/);
  assert.equal(crash.raw(), false);
});

test("terminal: nothing is drawn while $EDITOR or a Ctrl+Z stop has the screen; the frame comes back after", { timeout: 20000 }, async (t) => {
  const root = checkoutRepo(t);
  const term = fakeTerminal({ EDITOR: `"${process.execPath}" -e "setTimeout(() => {}, 500)"` });
  const running = runTerminal(root, term.host);
  t.after(() => term.signal("SIGTERM"));
  await waitUntil(() => /✗ 0/.test(term.out.join("")), "the first analysis");
  for (let i = 0; i < 5; i++) term.type(KEY.down);
  // An analysis still running when the editor starts, and a resize while it runs: neither may draw over it.
  term.type(KEY.f5);
  term.type(KEY.enter);
  const handed = term.out.lastIndexOf(LEAVE);
  assert.notEqual(handed, -1, "the screen was handed to the editor");
  term.resize();
  await sleep(250);
  term.resize();
  // Ctrl+C typed in the editor is the editor's.
  term.signal("SIGINT");
  assert.deepEqual(term.out.slice(handed + 1), [], "no frame over the editor");
  await waitUntil(() => term.out.slice(handed + 1).includes(ENTER), "the screen back after the editor");
  assert.match(term.out.slice(handed + 1).join(""), /\x1b\[2J/, "a full repaint");
  // Ctrl+Z: the screen is restored and the process stops; a resize while stopped draws nothing.
  term.signal("SIGTSTP");
  assert.equal(term.suspended(), 1);
  const stopped = term.out.lastIndexOf(LEAVE);
  term.resize();
  assert.deepEqual(term.out.slice(stopped + 1), []);
  term.signal("SIGCONT");
  assert.equal(term.out[stopped + 1], ENTER);
  assert.match(term.out.slice(stopped + 1).join(""), /\x1b\[2J/);
  term.signal("SIGTERM");
  assert.equal(await running, 0);
});

/** The checkout repository with documented code, a model brief, and the explained map on (or off). */
function explainedRepo(t: { after: (f: () => void) => void }, on: boolean): string {
  const root = checkoutRepo(t, {
    "src/application/purchase.ts": [
      "// Buying: the use case of the shop.",
      "",
      'import { create } from "../domain/order.ts";',
      'import { save } from "../infrastructure/store.ts";',
      "",
      "/** Buys the cart: creates the order, then stores it. */",
      "export function buy(): void {",
      "  create();",
      "  save();",
      "}",
      "",
    ].join("\n"),
    "src/infrastructure/store.ts": "/** Keeps the order on disk for the next run. */\nexport function save(): void {}\n",
  });
  const file = join(root, "keylang.json");
  writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), ...(on ? { explain: { map: true } } : {}) }, null, 2));
  return root;
}

test("tui: t switches a map file to the explained map and back on the same node; s finds a node by its explanation; F3 shows it", async (t) => {
  const s = session(explainedRepo(t, true));
  t.after(() => s.app.close());
  await s.app.idle();
  for (let i = 0; i < 5; i++) s.send(KEY.down);
  s.send(KEY.altEnter);
  assert.equal(s.app.state.current, "keylang/map/application.md");
  s.send("t");
  assert.equal(s.app.state.current, "keylang/map-explained/application.md");
  assert.match(s.lines()[0]!, /map-explained\/application\.md.*generated, read-only/);
  const cursorLine = (): string => s.app.state.buffers.get(s.app.state.current!)!.text.split("\n")[s.app.state.cursor.line]!;
  assert.match(cursorLine(), /- fn \[buy\]/);
  assert.equal(s.app.state.buffers.get(s.app.state.current!)!.text.split("\n")[s.app.state.cursor.line + 1], '      <a id="application.purchase.buy"></a><br>Buys the cart: creates the order, then stores it.');
  // Reading mode shows the text a Markdown viewer shows: no anchors, no `<br>`.
  s.send("v");
  assert.ok(s.text().includes("Buys the cart: creates the order, then stores it."), s.text());
  assert.doesNotMatch(s.text(), /<a id=|<br>/);
  s.send("v");
  // `/` and `n` search the explained map like any buffer.
  s.send("/");
  for (const ch of "then stores") s.send(ch);
  s.send(KEY.enter);
  assert.match(cursorLine(), /Buys the cart/);
  s.send("t");
  assert.equal(s.app.state.current, "keylang/map/application.md");
  assert.match(cursorLine(), /- fn \[buy\]/, "from the description line back to its node");

  // `s`: a word only the explanation has finds the node; Enter goes to its line in the map the reader is in, Enter again to the code.
  s.send("t");
  s.send("s");
  for (const ch of "next run") s.send(ch);
  assert.match(s.text(), /infrastructure\.store\.save {2}Keeps the order on disk for the next run\./);
  s.send(KEY.enter);
  assert.equal(s.app.state.current, "keylang/map-explained/infrastructure.md");
  assert.match(cursorLine(), /- fn \[save\]/);
  s.send(KEY.enter);
  assert.equal(s.app.state.mode, "code");
  assert.match(s.lines()[1]!, /src\/infrastructure\/store\.ts:2/);
  s.send(KEY.ctrlO);

  // F3: the explanation of the selected node, with its origin; a node without one has none.
  s.send(KEY.tab);
  assert.equal(s.app.state.focus, "nav");
  // The nav panel's column, its rows joined: a wrapped explanation reads as one text.
  const nav = (): string => s.lines().map((line) => line.slice(-31).trim()).join(" ").replace(/\s+/g, " ");
  const selected = (): string | undefined => navEntries(s.app.state)[s.app.state.navIndex]?.id ?? undefined;
  for (let i = 0; i < 20 && selected() !== "application.purchase"; i++) s.send(KEY.down);
  assert.equal(selected(), "application.purchase");
  assert.match(nav(), /Buying: the use case of the shop\./);
  assert.match(nav(), /\(code\)/);
  s.send(KEY.down);
  assert.doesNotMatch(nav(), /\(code\)|\(llm/);
  s.send("?");
  assert.match(s.text(), /s {18}find a node {4}t {20}explained map/);
});

test("tui: t with the explained map off says how to turn it on and changes nothing", async (t) => {
  const s = session(explainedRepo(t, false));
  t.after(() => s.app.close());
  await s.app.idle();
  for (let i = 0; i < 5; i++) s.send(KEY.down);
  s.send(KEY.altEnter);
  const before = { current: s.app.state.current, cursor: { ...s.app.state.cursor } };
  s.send("t");
  assert.deepEqual({ current: s.app.state.current, cursor: s.app.state.cursor }, before);
  assert.match(s.text(), /the explained map is off: add "explain": \{"map": true\} to keylang\.json, then F5/);
  assert.ok(!s.app.state.files.some((file) => file.includes("map-explained")));
});

// ---------- workspace bootstrap: missing, invalid, and source-less configurations ----------

/** Every file under `root` with its bytes: a session that must write nothing leaves this unchanged. */
function treeBytes(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else out.set(abs.slice(root.length + 1), readFileSync(abs, "latin1"));
    }
    if (dir !== root && readdirSync(dir).length === 0) out.set(`${dir.slice(root.length + 1)}/`, "");
  };
  walk(root);
  return out;
}

/** Read through a function, so the assertions on a changing state do not narrow its type. */
function configKind(app: App): string {
  return app.state.config.kind;
}

function promptNote(app: App): string {
  return app.state.prompt?.note ?? "";
}

/** A temp repository with `files` and nothing else. */
function repoWith(t: { after: (f: () => void) => void }, files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-tui-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

/** The shared analyzer, counting its runs. */
function countingAnalyzer(): { analyzer: (request: AnalysisRequest) => Promise<Analysis>; calls: () => number } {
  let calls = 0;
  return {
    analyzer: (request) => {
      calls++;
      return analyze(request);
    },
    calls: () => calls,
  };
}

test("tui: without keylang.json the start screen shows the guess; Browse analyses with it and nothing is written", async (t) => {
  const root = repoWith(t, { ...CHECKOUT_FILES });
  const before = treeBytes(root);
  const counted = countingAnalyzer();
  const s = session(root, { analyzer: counted.analyzer });
  t.after(() => s.app.close());
  await s.app.idle();
  assert.equal(configKind(s.app), "missing-config");
  assert.equal(counted.calls(), 0, "no analysis before Browse");
  const screen = s.text();
  assert.match(screen, /keylang\.json is not here yet/);
  assert.ok(screen.includes(`Root: ${root}`), screen);
  assert.match(screen, /Found: typescript · layers: application, domain, infrastructure, presentation/);
  assert.match(screen, /> Browse with the guessed configuration/);
  assert.match(screen, /Environment diagnostics/);
  assert.doesNotMatch(screen, /Set up keylang|Initialize/, "no fake init before ticket 12");
  assert.match(s.lines().at(-1)!, /no keylang\.json: Browse/);
  assert.doesNotMatch(s.lines().at(-1)!, /analyzing/);
  // Snapshot actions explain why they cannot run yet; the palette works on the start screen.
  s.send(":");
  for (const ch of "find node") s.send(ch);
  assert.match(s.text(), /choose Browse on the start screen first/);
  s.send(KEY.enter);
  assert.equal(s.app.state.prompt, null);
  assert.match(s.lines().at(-2)!, /Find a node: choose Browse/);
  // Doctor from the start screen: a record, and the start screen stays.
  s.send(KEY.down);
  s.send(KEY.enter);
  await s.app.idle();
  assert.equal(s.app.state.records.at(-1)?.status, "completed");
  assert.equal(s.app.state.start, 1);
  // Browse: the shared analysis with the guessed layers, the map shown, still no config on disk.
  s.send(KEY.up);
  s.send(KEY.enter);
  await s.app.idle();
  assert.equal(counted.calls(), 1);
  assert.equal(s.app.state.start, null);
  assert.ok(s.app.state.analysis?.snapshot, "a snapshot of the guessed layout");
  assert.deepEqual([...s.app.state.analysis!.config.layers.keys()], ["application", "domain", "infrastructure", "presentation"]);
  assert.match(s.app.state.current ?? "", /^keylang\/map\//);
  assert.match(s.lines().at(-1)!, /guessed configuration: no keylang\.json, nothing written/);
  s.send(":");
  for (const ch of "find node") s.send(ch);
  assert.doesNotMatch(promptNote(s.app), /Browse|no analysis/);
  s.send("\x1b");
  await sleep(40);
  s.send(KEY.f5);
  await s.app.idle();
  assert.deepEqual(treeBytes(root), before, "the first run without init writes nothing");
});

test("tui: invalid JSON in keylang.json opens its text at the error; a saved fix analyses without a restart", async (t) => {
  const root = checkoutRepo(t);
  writeFileSync(join(root, "keylang.json"), '{\n  "languages": ["typescript"]\n}x\n');
  const counted = countingAnalyzer();
  const s = session(root, { analyzer: counted.analyzer });
  t.after(() => s.app.close());
  await s.app.idle();
  assert.equal(configKind(s.app), "invalid-config");
  assert.equal(s.app.state.current, "keylang.json", "the raw text is open, though specs exist");
  assert.deepEqual(s.app.state.cursor, { line: 2, col: 1 }, "the cursor is at the JSON error");
  assert.match(s.lines().at(-1)!, /invalid keylang\.json: invalid JSON/);
  assert.equal(counted.calls(), 0, "the analyzer never runs on an invalid config");
  // F5 again and typing elsewhere do not repeat the same failure in a loop.
  s.send(KEY.f5);
  s.send(KEY.f5);
  await s.app.idle();
  assert.equal(counted.calls(), 0);
  assert.match(s.app.state.message ?? "", /keylang\.json is invalid: invalid JSON.*Ctrl\+S/);
  // Fix it in the editor: the unsaved text is not applied, the saved one is.
  s.send("i");
  s.send(KEY.end);
  s.send("\x7f");
  await sleep(200);
  await s.app.idle();
  assert.equal(counted.calls(), 0, "unsaved config text is no overlay");
  assert.match(s.lines().at(-1)!, /keylang\.json unsaved: the analysis uses the saved file/);
  s.send(KEY.ctrlS);
  await s.app.idle();
  assert.equal(configKind(s.app), "configured");
  assert.equal(counted.calls(), 1);
  assert.ok(s.app.state.analysis?.snapshot);
  assert.equal(s.app.state.error, null);
  assert.doesNotMatch(s.lines().at(-1)!, /invalid|outdated/);
  assert.match(s.lines().at(-1)!, /✗ \d+ {2}◌ \d+ {2}✓ \d+/);
});

test("tui: an invalid field names the field; breaking the config later keeps the old report outdated; the fix recovers", async (t) => {
  const root = checkoutRepo(t);
  const good = readFileSync(join(root, "keylang.json"), "utf8");
  writeFileSync(join(root, "keylang.json"), good.replace('"languages": [\n    "typescript"\n  ]', '"languages": 3'));
  const counted = countingAnalyzer();
  const s = session(root, { analyzer: counted.analyzer });
  t.after(() => s.app.close());
  await s.app.idle();
  assert.equal(s.app.state.current, "keylang.json");
  assert.match(s.lines().at(-1)!, /invalid keylang\.json: `languages` must be an array, got 3/);
  assert.equal(s.app.state.cursor.line, 1, "the cursor is on the field");
  assert.match(bufferLine(s.app, s.app.state.cursor.line), /"languages": 3/);
  // Snapshot actions say why they are unavailable; doctor still runs.
  s.send(":");
  for (const ch of "find node") s.send(ch);
  assert.match(promptNote(s.app), /keylang\.json is invalid/);
  s.send("\x1b");
  await sleep(40);
  s.send(KEY.ctrlP);
  for (const ch of "doctor") s.send(ch);
  s.send(KEY.enter);
  await s.app.idle();
  assert.equal(s.app.state.records.at(-1)?.result?.kind, "doctor");
  // The fix, saved.
  s.send("i");
  s.app.state.buffers.get("keylang.json")!.text = good.replace(/\n$/, "");
  s.send(KEY.ctrlS);
  await s.app.idle();
  assert.equal(configKind(s.app), "configured");
  assert.equal(counted.calls(), 1);
  assert.ok(s.app.state.analysis?.snapshot);
  // Broken again on disk by another program: F5 keeps the report, outdated with the reason, and runs nothing.
  s.send("\x1b");
  await sleep(40);
  s.send(":");
  for (const ch of "checkout") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.current, "keylang/flows/checkout.md");
  writeFileSync(join(root, "keylang.json"), '{"layers": {"external": ["src/**"]}}\n');
  s.send(KEY.f5);
  await s.app.idle();
  assert.equal(counted.calls(), 1);
  assert.equal(configKind(s.app), "invalid-config");
  assert.ok(s.app.state.analysis, "the last report is kept");
  assert.equal(s.app.state.outdated, true);
  assert.equal(s.app.state.current, "keylang.json", "the broken config is opened");
  assert.match(s.lines().at(-1)!, /invalid keylang\.json: `layers\.external`/);
  s.send(KEY.ctrlO);
  assert.equal(s.app.state.current, "keylang/flows/checkout.md", "Ctrl+O returns");
  writeFileSync(join(root, "keylang.json"), good);
  s.send(KEY.f5);
  await s.app.idle();
  assert.equal(configKind(s.app), "configured");
  assert.equal(s.app.state.outdated, false);
  assert.equal(counted.calls(), 2);
});

function bufferLine(app: App, line: number): string {
  return app.state.buffers.get(app.state.current!)!.text.split("\n")[line] ?? "";
}

test("tui: a valid config without supported sources keeps the editor and doctor; snapshot actions explain why not", async (t) => {
  const root = repoWith(t, { "keylang.json": "{}\n", "keylang/rules.md": "# rules\n\n- layers a < b\n" });
  const before = treeBytes(root);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  assert.equal(configKind(s.app), "configured");
  assert.ok(s.app.state.analysis, "the analysis ran");
  assert.equal(s.app.state.analysis!.snapshot, null, "no invented snapshot");
  assert.match(s.lines().at(-1)!, /no supported source files/);
  assert.equal(s.app.state.current, "keylang/rules.md");
  s.send(":");
  for (const ch of "toggle map") s.send(ch);
  assert.match(promptNote(s.app), /no supported source files/);
  s.send("\x1b");
  await sleep(40);
  s.send("i");
  assert.equal(s.app.state.mode, "edit", "the editor is available");
  s.send("\x1b");
  await sleep(40);
  s.send(KEY.ctrlP);
  for (const ch of "doctor") s.send(ch);
  s.send(KEY.enter);
  await s.app.idle();
  assert.equal(s.app.state.records.at(-1)?.status, "completed");
  assert.deepEqual(treeBytes(root), before);
});

test("tui: a start in a subdirectory uses the root of keylang.json and creates nothing in the subdirectory", async (t) => {
  const root = checkoutRepo(t);
  const sub = join(root, "src", "domain");
  const before = treeBytes(root);
  assert.equal(findRoot(sub), root);
  const s = session(findRoot(sub));
  t.after(() => s.app.close());
  await s.app.idle();
  assert.equal(configKind(s.app), "configured");
  assert.equal(s.app.state.current, "keylang/flows/checkout.md");
  assert.deepEqual(readdirSync(sub), ["order.ts"]);
  assert.deepEqual(treeBytes(root), before);
});

test("cli: keylang without a command and without a TTY prints usage with code 2 and writes nothing", (t) => {
  const root = repoWith(t, { ...CHECKOUT_FILES });
  const before = treeBytes(root);
  const bin = join(dirname(fileURLToPath(import.meta.url)), "../bin/keylang.js");
  const run = spawnSync(process.execPath, [bin], { cwd: root, encoding: "utf8" });
  assert.equal(run.status, 2);
  assert.equal(run.stdout, "");
  assert.match(run.stderr, /Usage: keylang {6,}Open the TUI in this terminal \(needs a TTY\)/);
  assert.deepEqual(treeBytes(root), before);
});

// ---------- feature readiness and the save step (ticket 07) ----------

const FEATURES: Record<string, string> = {
  // Every step statically ok: done (trace stays informational).
  "keylang/features/buy.md": "# flow buy\n\n- trigger presentation.terminal.checkout\n- step application.purchase.buy\n  - step domain.order.create\n",
  // A planned fn not yet in the code: a planned gap and its static gap.
  "keylang/features/refund.md": "# flow refund\n\n- planned fn application.purchase.refund () → void\n- trigger presentation.terminal.checkout\n  - step application.purchase.refund\n",
  // A step its trigger never calls: a static gap.
  "keylang/features/skip.md": "# flow skip\n\n- trigger domain.order.create\n  - step infrastructure.store.save\n",
};

const BIN = join(dirname(fileURLToPath(import.meta.url)), "../bin/keylang.js");

function cliFeature(root: string, slug: string): { status: number | null; stdout: string; stderr: string } {
  return spawnSync(process.execPath, [BIN, "feature", slug, "--format", "json"], { cwd: root, encoding: "utf8" });
}

/** The palette's feature action: its form opens with the slug of the current feature file, or empty. */
function featureForm(send: (keys: string) => void): void {
  send(KEY.ctrlP);
  for (const ch of "feature readiness") send(ch);
  send(KEY.enter);
}

/** Replaces the form's text with `slug` and submits it. */
function submitSlug(app: App, send: (keys: string) => void, slug: string): void {
  for (const _ of app.state.prompt!.text) send("\x7f");
  for (const ch of slug) send(ch);
  send(KEY.enter);
}

test("tui: feature gives the same object and code as the CLI for done, planned, static and rule gaps; 2 for an unknown slug", async (t) => {
  const root = checkoutRepo(t, FEATURES);
  let quit = 0;
  const vt = new VirtualTerminal(110, 30);
  const app = new App({ root, cols: 110, rows: 30, onQuit: () => quit++ });
  app.attach({ kind: "terminal", write: (ansi) => vt.feed(ansi) }, 110, 30);
  t.after(() => app.close());
  const send = (keys: string): void => app.input(keys);
  await app.idle();
  const before = treeBytes(root);
  for (const [slug, code] of [["buy", 0], ["refund", 1], ["skip", 1]] as const) {
    featureForm(send);
    assert.equal(app.state.prompt?.kind, "feature");
    submitSlug(app, send, slug);
    await app.idle();
    const record = app.state.records.at(-1)!;
    assert.equal(record.status, "completed", JSON.stringify(record.result?.messages));
    const cli = cliFeature(root, slug);
    assert.equal(cli.status, code, cli.stderr);
    assert.equal(record.result!.exitCode, cli.status);
    assert.equal(record.result!.kind, "feature");
    assert.deepEqual(record.result!.kind === "feature" ? record.result!.payload?.report : null, JSON.parse(cli.stdout));
  }
  const kinds = app.state.records.map((record) => (record.result?.kind === "feature" ? record.result.payload?.report.gaps.map((gap) => gap.kind) : null));
  assert.deepEqual(kinds, [[], ["planned", "static"], ["static"]]);
  assert.match(vt.text(), /feature skip: 1 gap\(s\) · code 1/);
  // A rule fail anywhere blocks every feature: a rule gap, as in the CLI (the operation reads the saved rules).
  writeFileSync(join(root, "keylang/rules.md"), DENY_RULES);
  before.set("keylang/rules.md", DENY_RULES);
  featureForm(send);
  submitSlug(app, send, "buy");
  await app.idle();
  const ruled = app.state.records.at(-1)!;
  const ruledCli = cliFeature(root, "buy");
  assert.equal(ruledCli.status, 1, ruledCli.stderr);
  assert.equal(ruled.result!.exitCode, 1);
  assert.deepEqual(ruled.result!.kind === "feature" ? ruled.result!.payload?.report : null, JSON.parse(ruledCli.stdout));
  assert.ok(ruled.result!.kind === "feature" && ruled.result!.payload!.report.gaps.some((gap) => gap.kind === "rule"));
  // An unknown slug is an action error with code 2, not "gaps"; the message is the CLI's.
  featureForm(send);
  submitSlug(app, send, "nope");
  await app.idle();
  const missing = app.state.records.at(-1)!;
  assert.equal(missing.status, "failed");
  assert.equal(missing.result!.exitCode, 2);
  const cli = cliFeature(root, "nope");
  assert.equal(cli.status, 2);
  assert.deepEqual(missing.result!.messages.map((message) => `keylang: ${message.text}\n`).join(""), cli.stderr);
  // An invalid slug is refused in the form, as the CLI refuses it: the form and its text stay, nothing runs.
  featureForm(send);
  submitSlug(app, send, "../x");
  assert.equal(app.state.prompt?.kind, "feature");
  assert.equal(app.state.prompt!.text, "../x");
  assert.match(app.state.message ?? "", /feature: invalid slug `\.\.\/x`/);
  assert.equal(app.state.records.length, 5);
  send("\x1b");
  await sleep(40);
  assert.equal(app.state.prompt, null);
  // The session still answers after codes 1 and 2, the feature run wrote nothing, and quitting is normal.
  send(KEY.f6);
  assert.match(vt.text(), /Feature readiness · nope {2}failed · code 2/);
  send("\x1b");
  await sleep(40);
  assert.deepEqual(treeBytes(root), before);
  send("q");
  assert.equal(quit, 1);
});

test("terminal: quitting after a feature with code 1 and one with code 2 returns 0", async (t) => {
  const root = checkoutRepo(t, FEATURES);
  const term = fakeTerminal();
  const running = runTerminal(root, term.host);
  await waitUntil(() => term.out.join("").includes("checkout"), "the first frame");
  term.type(KEY.ctrlP);
  for (const ch of "feature readiness") term.type(ch);
  term.type(KEY.enter);
  for (const ch of "refund") term.type(ch);
  term.type(KEY.enter);
  await waitUntil(() => term.out.join("").includes("code 1"), "the feature with gaps");
  term.type(KEY.ctrlP);
  for (const ch of "feature readiness") term.type(ch);
  term.type(KEY.enter);
  for (const ch of "nope") term.type(ch);
  term.type(KEY.enter);
  await waitUntil(() => term.out.join("").includes("code 2"), "the failed feature");
  term.type("q");
  assert.equal(await running, 0);
});

test("tui: dirty spec and config — Back writes nothing; Save and continue writes both and the feature reads the new bytes", async (t) => {
  const root = checkoutRepo(t, FEATURES);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  // A dirty keylang.json (still valid JSON) …
  s.send(KEY.ctrlP);
  for (const ch of "open keylang.json") s.send(ch);
  s.send(KEY.enter);
  s.send("i");
  s.send(KEY.end);
  s.send(KEY.enter);
  s.send("\x1b");
  await sleep(40);
  // … and a dirty feature that now plans a fn the code does not have.
  s.send(KEY.ctrlP);
  for (const ch of "open keylang/features/buy.md") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.current, "keylang/features/buy.md");
  s.send(KEY.down);
  s.send(KEY.down);
  s.send("i");
  for (const ch of "- planned fn application.purchase.refund () → void") s.send(ch);
  s.send(KEY.enter);
  s.send("\x1b");
  await sleep(40);
  await s.app.idle();
  assert.deepEqual(s.app.unsaved().sort(), ["keylang.json", "keylang/features/buy.md"]);
  // What is on disk now; typing may have counted a completion in .keylang/stats.json before this point.
  const before = treeBytes(root);
  // The form starts with the slug of the current feature file and shows the target.
  featureForm(s.send);
  assert.equal(s.app.state.prompt?.text, "buy");
  assert.match(s.app.state.prompt!.note ?? "", /keylang\/features\/buy\.md on disk/);
  s.send(KEY.enter);
  assert.deepEqual(s.app.state.barrier?.files, ["keylang.json", "keylang/features/buy.md"]);
  assert.match(s.text(), /Save before feature buy/);
  assert.match(s.text(), /\[Save and continue\] {4}\[Back\]/);
  // Back: nothing written, nothing run, the buffers still dirty.
  s.send("\x1b");
  await sleep(40);
  await s.app.idle();
  assert.equal(s.app.state.barrier, null);
  assert.equal(s.app.state.records.length, 0);
  assert.deepEqual(treeBytes(root), before);
  assert.equal(s.app.unsaved().length, 2);
  // Back chosen with the arrows and Enter is the same.
  featureForm(s.send);
  s.send(KEY.enter);
  s.send(KEY.right);
  s.send(KEY.enter);
  assert.equal(s.app.state.barrier, null);
  assert.equal(s.app.state.records.length, 0);
  assert.deepEqual(treeBytes(root), before);
  // Save and continue: both files carry the buffer bytes, then the feature runs on them.
  featureForm(s.send);
  s.send(KEY.enter);
  s.send(KEY.enter);
  await s.app.idle();
  assert.deepEqual(s.app.unsaved(), []);
  for (const path of ["keylang.json", "keylang/features/buy.md"]) assert.equal(readFileSync(join(root, path), "utf8"), s.app.state.buffers.get(path)!.text);
  assert.equal(s.app.state.records.length, 1);
  const record = s.app.state.records[0]!;
  const cli = cliFeature(root, "buy");
  assert.equal(cli.status, 1);
  assert.equal(record.result!.exitCode, 1);
  assert.deepEqual(record.result!.kind === "feature" ? record.result!.payload?.report : null, JSON.parse(cli.stdout));
  assert.ok(record.result!.kind === "feature" && record.result!.payload!.report.gaps.some((gap) => gap.kind === "planned" && gap.id === "application.purchase.refund"));
});

test("tui: a conflict on the second save stops the feature; the first save stays and the second text is kept", async (t) => {
  const root = checkoutRepo(t, FEATURES);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.ctrlP);
  for (const ch of "open keylang/rules.md") s.send(ch);
  s.send(KEY.enter);
  s.send(KEY.down);
  s.send("i");
  for (const ch of "Notes.") s.send(ch);
  s.send("\x1b");
  await sleep(40);
  s.send(KEY.ctrlP);
  for (const ch of "open keylang/features/buy.md") s.send(ch);
  s.send(KEY.enter);
  s.send(KEY.down);
  s.send("i");
  for (const ch of "Buying.") s.send(ch);
  s.send("\x1b");
  await sleep(40);
  await s.app.idle();
  // Someone else rewrites the rules while they are dirty here.
  const external = "# rules\n\n- layers domain < infrastructure < application < presentation\n- deny application infrastructure\n";
  writeFileSync(join(root, "keylang/rules.md"), external);
  featureForm(s.send);
  s.send(KEY.enter);
  assert.deepEqual(s.app.state.barrier?.files, ["keylang/features/buy.md", "keylang/rules.md"]);
  s.send(KEY.enter);
  await s.app.idle();
  // The feature did not start; the first save is on disk, the other file keeps both texts apart.
  assert.equal(s.app.state.records.length, 0);
  assert.equal(readFileSync(join(root, "keylang/features/buy.md"), "utf8"), s.app.state.buffers.get("keylang/features/buy.md")!.text);
  assert.equal(readFileSync(join(root, "keylang/rules.md"), "utf8"), external);
  assert.match(s.app.state.buffers.get("keylang/rules.md")!.text, /^Notes\.$/m);
  assert.deepEqual(s.app.unsaved(), ["keylang/rules.md"]);
  assert.deepEqual(s.app.state.barrier?.files, ["keylang/rules.md"]);
  assert.match(s.app.state.barrier?.error ?? "", /keylang\/rules\.md: changed on disk/);
  assert.match(s.text(), /not saved: keylang\/rules\.md: changed on disk/);
  // A second try fails the same way: the step never overwrites the other text silently.
  s.send(KEY.enter);
  assert.equal(readFileSync(join(root, "keylang/rules.md"), "utf8"), external);
  assert.equal(s.app.state.records.length, 0);
  s.send("\x1b");
  await sleep(40);
  assert.equal(s.app.state.barrier, null);
  assert.equal(s.app.state.records.length, 0);
});

test("tui: Enter on a feature gap opens its line and Esc returns; an edit marks the result outdated", async (t) => {
  const root = checkoutRepo(t, FEATURES);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.ctrlP);
  for (const ch of "open keylang/features/refund.md") s.send(ch);
  s.send(KEY.enter);
  featureForm(s.send);
  assert.equal(s.app.state.prompt?.text, "refund");
  s.send(KEY.enter);
  await s.app.idle();
  assert.equal(s.app.state.records[0]!.result?.exitCode, 1);
  // The editor stays where it was; F6 shows the outcome, the snapshot and the gaps.
  assert.equal(s.app.state.results.open, false);
  s.send(KEY.f6);
  assert.match(s.text(), /Feature · refund · saved state · keylang\/features\/refund\.md/);
  assert.match(s.text(), /2 gap\(s\) · code 1 · snapshot [0-9a-f]{8}/);
  assert.match(s.text(), /planned {2}application\.purchase\.refund {2}keylang\/features\/refund\.md:3:1 {2}pla/);
  assert.match(s.text(), /Info \(not blocking\): tests — · trace unverified 2/);
  s.send(KEY.tab);
  assert.match(s.app.state.message ?? "", /^planned application\.purchase\.refund: planned `application\.purchase\.refund` is not implemented · Enter opens keylang\/features\/refund\.md:3$/);
  s.send(KEY.enter);
  assert.equal(s.app.state.results.viewing, true);
  assert.equal(s.app.state.current, "keylang/features/refund.md");
  assert.equal(s.app.state.cursor.line, 2);
  s.send("\x1b");
  await sleep(40);
  assert.equal(s.app.state.results.viewing, false);
  assert.equal(s.app.state.results.open, true);
  s.send(KEY.down);
  s.send(KEY.enter);
  assert.equal(s.app.state.cursor.line, 4);
  assert.equal(s.app.state.cursor.col, 2);
  s.send(KEY.f6);
  assert.equal(s.app.state.results.open, false);
  // An edit of an input: the saved result is outdated, not a current answer.
  assert.equal(s.app.state.records[0]!.outdated, null);
  s.send("i");
  s.send("x");
  s.send("\x1b");
  await sleep(40);
  await s.app.idle();
  assert.notEqual(s.app.state.records[0]!.outdated, null);
  s.send(KEY.f6);
  assert.match(s.text(), /Feature readiness · refund {2}completed · code 1 · outdated/);
  assert.match(s.text(), /outdated: inputs edited since this run · Enter reruns/);
  // The rerun goes through the save step, since its input is dirty now.
  s.send(KEY.enter);
  assert.deepEqual(s.app.state.barrier?.files, ["keylang/features/refund.md"]);
  s.send("\x1b");
  await sleep(40);
  assert.equal(s.app.state.records.length, 1);
});

// ---------- 21: the proposals list ----------

/** The palette's Proposals action: the list whatever the current file. */
function openProposalList(s: ReturnType<typeof session>): void {
  s.send(KEY.ctrlP);
  for (const ch of "proposals") s.send(ch);
  assert.equal(s.app.state.prompt?.ids?.[0], "proposals", s.text());
  s.send(KEY.enter);
  assert.equal(s.app.state.prompt?.kind, "proposal", s.app.state.message ?? s.text());
}

/** The listed proposal paths, read through a function so earlier assertions do not narrow the prompt's type. */
function listed(s: ReturnType<typeof session>): string[] | undefined {
  return s.app.state.prompt?.ids;
}

/** Moves the list selection to `path` with the arrow keys. */
function selectProposal(s: ReturnType<typeof session>, path: string): void {
  const at = s.app.state.prompt!.ids!.indexOf(path);
  assert.notEqual(at, -1, `${path} is not listed: ${s.app.state.prompt!.ids!.join(", ")}`);
  while (s.app.state.prompt!.index !== at) s.send(KEY.down);
}

test("tui: the proposals list reaches any spec, code or test target while the first stays undecided", async (t) => {
  const flow = `${CHECKOUT_FLOW}\n# flow refund\n\n- planned fn application.refund.refund (order: Order) → Order\n- trigger application.refund.refund\n  - test tests/refund.test.ts "refund returns the order"\n`;
  const root = checkoutRepo(t, { [FLOW_PATH]: flow });
  const bin = join(dirname(fileURLToPath(import.meta.url)), "../bin/keylang.js");
  const cli = spawnSync(process.execPath, [bin, "spec-to-code", "application.refund.refund"], { cwd: root, encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr);
  const RULES = "# rules\n\n- layers domain < infrastructure < application < presentation\n";
  propose(root, "keylang/rules.md", `${RULES}- no-cycles\n`);
  propose(root, "keylang/flows/pay.md", "# flow pay\n\n- trigger presentation.terminal.checkout\n");
  const s = session(root, { cols: 150 });
  t.after(() => s.app.close());
  await s.app.idle();
  const before = treeBytes(root);
  // The open flow has no proposal: `m` opens the list, in POSIX path order, with kind, new file and hunks.
  assert.equal(s.app.state.current, FLOW_PATH);
  s.send("m");
  assert.equal(s.app.state.mode, "view");
  assert.deepEqual(listed(s), ["keylang/flows/pay.md", "keylang/rules.md", "src/application/refund.ts", "tests/refund.test.ts"]);
  assert.match(s.text(), /4 proposal\(s\)/);
  assert.match(s.text(), /keylang\/flows\/pay\.md\s+spec · new file · 1 hunk\(s\)/);
  assert.match(s.text(), /keylang\/rules\.md\s+spec · 1 hunk\(s\)/);
  assert.match(s.text(), /src\/application\/refund\.ts\s+code · new file · 1 hunk\(s\)/);
  assert.match(s.text(), /tests\/refund\.test\.ts\s+code · new file · 1 hunk\(s\)/);
  assert.match(s.text(), /Enter merges into keylang\/flows\/pay\.md on disk/);
  // Moving through the list and leaving it writes and removes nothing.
  for (let i = 0; i < 5; i++) s.send(KEY.down);
  s.send("\x1b");
  await sleep(40);
  assert.equal(s.app.state.prompt, null);
  assert.deepEqual(treeBytes(root), before, "viewing the list changes nothing");

  // The first target opened and left undecided.
  s.send("m");
  s.send(KEY.enter);
  assert.equal(s.app.state.merge?.path, "keylang/flows/pay.md");
  s.send("\x1b");
  await sleep(40);
  assert.equal(s.app.state.mode, "view");
  assert.ok(existsSync(join(root, ".keylang/proposals/keylang/flows/pay.md")));

  // The current file now has a proposal (`m` would open it); the palette list picks the third target instead.
  assert.equal(s.app.state.current, "keylang/flows/pay.md");
  openProposalList(s);
  selectProposal(s, "src/application/refund.ts");
  s.send(KEY.enter);
  assert.equal(s.app.state.mode, "merge");
  assert.match(s.lines()[1]!, /MERGE src\/application\/refund\.ts · code · hunk 1\/1/);
  assert.match(s.text(), /\+ export function refund\(order: Order\): Order \{/);
  s.send("a");
  s.send("w");
  await s.app.idle();
  assert.equal(s.app.state.mode, "view", "w returns to the mode the merge began in");
  assert.match(readFileSync(join(root, "src/application/refund.ts"), "utf8"), /^export function refund/);
  assert.ok(!existsSync(join(root, ".keylang/proposals/src/application/refund.ts")), "the merged proposal is consumed");
  assert.ok(existsSync(join(root, ".keylang/proposals/keylang/flows/pay.md")), "the undecided first proposal stays");
  assert.ok(!existsSync(join(root, "keylang/flows/pay.md")));
  assert.equal(readFileSync(join(root, "keylang/rules.md"), "utf8"), RULES);
  assert.deepEqual(s.app.state.proposals, ["keylang/flows/pay.md", "keylang/rules.md", "tests/refund.test.ts"]);
  assert.match(s.lines().at(-1)!, /≈ 3 proposal\(s\): m/);

  // The test next, then the rules: each is written only as decided.
  openProposalList(s);
  assert.deepEqual(listed(s), ["keylang/flows/pay.md", "keylang/rules.md", "tests/refund.test.ts"]);
  selectProposal(s, "tests/refund.test.ts");
  s.send(KEY.enter);
  assert.match(s.lines()[1]!, /MERGE tests\/refund\.test\.ts · code/);
  s.send("r");
  s.send("w");
  await s.app.idle();
  assert.ok(!existsSync(join(root, "tests/refund.test.ts")));
  openProposalList(s);
  selectProposal(s, "keylang/rules.md");
  s.send(KEY.enter);
  assert.equal(s.app.state.merge?.path, "keylang/rules.md");
  assert.match(s.text(), /\+ - no-cycles/);
  s.send("a");
  s.send("w");
  await s.app.idle();
  assert.equal(readFileSync(join(root, "keylang/rules.md"), "utf8"), `${RULES}- no-cycles\n`);
  // `u` keeps its meaning: the last merge is undone and its proposal is back.
  s.send("u");
  await s.app.idle();
  assert.equal(readFileSync(join(root, "keylang/rules.md"), "utf8"), RULES);
  assert.ok(existsSync(join(root, ".keylang/proposals/keylang/rules.md")));
  assert.deepEqual(s.app.state.proposals, ["keylang/flows/pay.md", "keylang/rules.md"]);
});

test("tui: the proposals list shows why a target cannot be merged and writes nothing on Enter", async (t) => {
  const root = checkoutRepo(t);
  const outside = mkdtempSync(join(tmpdir(), "keylang-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(join(outside, "spec.md"), "# flow out\n");
  symlinkSync(join(outside, "spec.md"), join(root, "keylang/flows/out.md"));
  writeFileSync(join(root, "README.md"), "# readme\n");
  propose(root, FLOW_PATH, PAID);
  propose(root, "README.md", "# overwritten\n");
  propose(root, "keylang/map/domain.md", "# overwritten\n");
  propose(root, "keylang/flows/out.md", "# flow out\n\n- trigger presentation.terminal.checkout\n");
  writeFileSync(join(outside, "linked.md"), "# rules\n");
  symlinkSync(join(outside, "linked.md"), join(root, ".keylang/proposals/keylang/linked.md"));
  const s = session(root, { cols: 160 });
  t.after(() => s.app.close());
  await s.app.idle();
  // Unsaved edits in the flow that has a proposal.
  s.send("i");
  s.send(KEY.end);
  s.send("!");
  s.send("\x1b");
  await sleep(40);
  await s.app.idle();
  const before = treeBytes(root);
  openProposalList(s);
  assert.deepEqual(listed(s), ["README.md", FLOW_PATH, "keylang/flows/out.md", "keylang/linked.md", "keylang/map/domain.md"]);
  const reasons: Record<string, RegExp> = {
    "README.md": /cannot merge: outside keylang\/: a proposal changes specs only/,
    [FLOW_PATH]: /cannot merge: unsaved changes: save \(Ctrl\+S\) or undo them before merging/,
    "keylang/flows/out.md": /cannot merge: leads out of keylang\/ through a link/,
    "keylang/linked.md": /cannot merge: a link under \.keylang\/proposals\/: a proposal is a plain file/,
    "keylang/map/domain.md": /cannot merge: a generated map file/,
  };
  assert.match(s.text(), /keylang\/flows\/checkout\.md\s+spec · 1 hunk\(s\) · cannot merge/);
  for (const [path, reason] of Object.entries(reasons)) {
    selectProposal(s, path);
    assert.match(s.text(), reason, path);
    s.send(KEY.enter);
    assert.equal(s.app.state.prompt?.kind, "proposal", `${path}: the list stays open`);
    assert.equal(s.app.state.mode, "view");
    assert.equal(s.app.state.merge, null);
    assert.match(s.text(), reason, `${path}: the reason stays visible after Enter`);
  }
  assert.equal(s.app.state.current, FLOW_PATH);
  assert.match(s.app.state.buffers.get(FLOW_PATH)!.text, /^# flow checkout!/, "the unsaved text is kept");
  assert.deepEqual(treeBytes(root), before, "nothing written or removed");
});

test("tui: the list is scanned again on Enter; a proposal rewritten during MERGE is not written over", async (t) => {
  const root = checkoutRepo(t);
  const RULES = "# rules\n\n- layers domain < infrastructure < application < presentation\n";
  propose(root, "keylang/flows/pay.md", "# flow pay\n\n- trigger presentation.terminal.checkout\n");
  propose(root, "keylang/rules.md", `${RULES}- no-cycles\n`);
  propose(root, "keylang/flows/refund.md", "# flow refund\n");
  const s = session(root, { cols: 150 });
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("m");
  assert.deepEqual(listed(s), ["keylang/flows/pay.md", "keylang/flows/refund.md", "keylang/rules.md"]);
  // Removed after the list was built: not opened from memory, and the list follows the disk.
  rmSync(join(root, ".keylang/proposals/keylang/flows/pay.md"));
  s.send(KEY.enter);
  assert.equal(s.app.state.mode, "view");
  assert.equal(s.app.state.prompt?.kind, "proposal");
  assert.match(s.text(), /keylang\/flows\/pay\.md: the proposal is gone/);
  assert.deepEqual(listed(s), ["keylang/flows/refund.md", "keylang/rules.md"]);
  assert.ok(!existsSync(join(root, "keylang/flows/pay.md")));
  // Rewritten after the list was built: the MERGE shows the text on disk now, not the listed one.
  selectProposal(s, "keylang/rules.md");
  propose(root, "keylang/rules.md", `${RULES}- deny domain application\n`);
  s.send(KEY.enter);
  assert.equal(s.app.state.merge?.path, "keylang/rules.md");
  assert.match(s.text(), /\+ - deny domain application/);
  assert.doesNotMatch(s.text(), /no-cycles/);
  // An agent rewrites the proposal during the merge: w refuses, the new text is kept.
  s.send("a");
  const newer = `${RULES}- no-cycles\n- deny domain application\n`;
  propose(root, "keylang/rules.md", newer);
  s.send("w");
  await s.app.idle();
  assert.equal(s.app.state.mode, "view");
  assert.match(s.app.state.message ?? "", /the proposal for keylang\/rules\.md changed during the merge; nothing written/);
  assert.equal(readFileSync(join(root, "keylang/rules.md"), "utf8"), RULES);
  assert.equal(readFileSync(join(root, ".keylang/proposals/keylang/rules.md"), "utf8"), newer);
  s.send("u");
  assert.match(s.app.state.message ?? "", /no merge to undo/);
  assert.equal(readFileSync(join(root, ".keylang/proposals/keylang/rules.md"), "utf8"), newer);
  // The other undecided proposal was never touched.
  assert.equal(readFileSync(join(root, ".keylang/proposals/keylang/flows/refund.md"), "utf8"), "# flow refund\n");
  // The current file has a proposal now: `m` opens it directly, with the newest text.
  assert.equal(s.app.state.current, "keylang/rules.md");
  s.send("m");
  assert.equal(s.app.state.merge?.path, "keylang/rules.md");
  assert.match(s.text(), /\+ - no-cycles/);
});

// ---------- a new specification buffer (ticket 06) ----------

/** The tree without `.keylang/` (typing may count a completion in its stats); a link is its target, not followed. */
function specTree(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      const rel = abs.slice(root.length + 1);
      if (rel === ".keylang") continue;
      if (entry.isSymbolicLink()) out.set(rel, `-> ${readlinkSync(abs)}`);
      else if (entry.isDirectory()) walk(abs);
      else out.set(rel, readFileSync(abs, "latin1"));
    }
    if (dir !== root && readdirSync(dir).length === 0) out.set(`${dir.slice(root.length + 1)}/`, "");
  };
  walk(root);
  return out;
}

/** The field the new-spec form is on, read through a function so assertions do not narrow the state. */
function formField(app: App): string | undefined {
  return app.state.prompt?.form?.field;
}

/** Esc alone: the decoder waits a moment for the rest of an escape sequence. */
async function esc(send: (keys: string) => void): Promise<void> {
  send("\x1b");
  await sleep(40);
}

/** The palette's "New specification": the kind form opens. */
function newSpecForm(send: (keys: string) => void): void {
  send(KEY.ctrlP);
  for (const ch of "new specification") send(ch);
  send(KEY.enter);
}

/** Chooses `kind` in the form and replaces the path field with `path`, then Enter. */
function newSpecPath(s: ReturnType<typeof session>, kind: string, path: string): void {
  newSpecForm(s.send);
  assert.equal(s.app.state.prompt?.kind, "new-spec");
  for (const ch of kind) s.send(ch);
  s.send(KEY.enter);
  assert.equal(formField(s.app), "path");
  for (const _ of s.app.state.prompt!.text) s.send("\x7f");
  for (const ch of path) s.send(ch);
  s.send(KEY.enter);
}

test("tui: a new flow and a new feature exist only as buffers until Ctrl+S; the analysis then reads their exact text", async (t) => {
  const root = checkoutRepo(t);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  const before = specTree(root);
  // The kind field names the root; the path starts under the configured spec directory.
  newSpecForm(s.send);
  assert.match(promptNote(s.app), new RegExp(`root ${root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  s.send(KEY.enter);
  assert.equal(s.app.state.prompt?.text, "keylang/flows/");
  for (const ch of "refund.md") s.send(ch);
  assert.match(promptNote(s.app), /new file: nothing is written until Ctrl\+S/);
  s.send(KEY.enter);
  // The flow name defaults to the file name.
  assert.equal(formField(s.app), "name");
  assert.equal(s.app.state.prompt?.text, "refund");
  s.send(KEY.enter);
  const flow = "keylang/flows/refund.md";
  assert.equal(s.app.state.prompt, null);
  assert.equal(s.app.state.current, flow);
  assert.equal(s.app.state.mode, "edit");
  assert.equal(s.app.state.buffers.get(flow)!.text, "# flow refund\n");
  assert.equal(s.app.state.buffers.get(flow)!.disk, null);
  assert.ok(s.app.state.files.includes(flow));
  assert.deepEqual(s.app.unsaved(), [flow]);
  assert.match(s.lines()[0]!, /refund\.md \[\+ new, not on disk\]/);
  for (const ch of "- trigger presentation.terminal.checkout") s.send(ch);
  await sleep(200);
  await s.app.idle();
  // The unsaved flow is analysed as overlay; nothing exists on disk.
  assert.ok(s.app.state.analysis!.docs.some((doc) => doc.path === flow));
  assert.ok(s.app.state.files.includes(flow));
  assert.deepEqual(specTree(root), before);
  s.send(KEY.ctrlS);
  await s.app.idle();
  const typed = s.app.state.buffers.get(flow)!.text;
  assert.equal(readFileSync(join(root, flow), "utf8"), typed);
  assert.deepEqual(s.app.unsaved(), []);
  await esc(s.send);
  // A feature: a prose heading, no invented IDs; its directory does not exist before Ctrl+S.
  newSpecPath(s, "feature", "keylang/features/refunds.md");
  const feature = "keylang/features/refunds.md";
  assert.equal(s.app.state.buffers.get(feature)!.text, "## refunds\n");
  assert.equal(existsSync(join(root, "keylang/features")), false);
  for (const ch of "Refunds go back to the card.") s.send(ch);
  await sleep(200);
  await s.app.idle();
  assert.equal(existsSync(join(root, "keylang/features")), false);
  s.send(KEY.ctrlS);
  await s.app.idle();
  assert.equal(readFileSync(join(root, feature), "utf8"), "## refunds\nRefunds go back to the card.");
  const doc = s.app.state.analysis!.docs.find((d) => d.path === feature);
  assert.ok(doc);
  assert.equal(s.app.state.analysis!.docs.find((d) => d.path === flow)?.sections[0]?.name?.value, "refund");
  assert.deepEqual(s.app.unsaved(), []);
});

test("tui: an empty new file stays unsaved across file switches and asks before quitting; Esc in the form creates nothing", async (t) => {
  const root = checkoutRepo(t);
  let quit = 0;
  const vt = new VirtualTerminal(110, 30);
  const app = new App({ root, cols: 110, rows: 30, onQuit: () => quit++ });
  app.attach({ kind: "terminal", write: (ansi) => vt.feed(ansi) }, 110, 30);
  t.after(() => app.close());
  const s = { app, vt, send: (keys: string) => app.input(keys), lines: () => vt.lines(), text: () => vt.text() };
  await app.idle();
  const before = specTree(root);
  // Esc in each field: no buffer, no file.
  newSpecForm(s.send);
  await esc(s.send);
  assert.equal(app.state.prompt, null);
  newSpecForm(s.send);
  s.send(KEY.enter);
  await esc(s.send);
  newSpecForm(s.send);
  s.send(KEY.enter);
  for (const ch of "x.md") s.send(ch);
  s.send(KEY.enter);
  assert.equal(formField(app), "name");
  await esc(s.send);
  assert.equal(app.state.prompt, null);
  assert.equal([...app.state.buffers.values()].some((buffer) => buffer.newFile), false);
  assert.deepEqual(app.unsaved(), []);
  // A blank file: empty text, and still unsaved.
  newSpecPath(s, "blank", "keylang/notes.md");
  const notes = "keylang/notes.md";
  assert.equal(app.state.buffers.get(notes)!.text, "");
  assert.deepEqual(app.unsaved(), [notes]);
  await esc(s.send);
  s.send(KEY.ctrlP);
  for (const ch of "open keylang/rules.md") s.send(ch);
  s.send(KEY.enter);
  assert.equal(app.state.current, "keylang/rules.md");
  await sleep(200);
  await app.idle();
  // After an analysis and a switch the empty buffer is still there, listed and unsaved.
  assert.ok(app.state.files.includes(notes));
  assert.deepEqual(app.unsaved(), [notes]);
  s.send(KEY.ctrlP);
  for (const ch of `open ${notes}`) s.send(ch);
  s.send(KEY.enter);
  assert.equal(app.state.current, notes);
  assert.equal(app.state.buffers.get(notes)!.text, "");
  s.send("q");
  assert.equal(quit, 0);
  assert.match(app.state.message ?? "", /unsaved changes in keylang\/notes\.md/);
  assert.deepEqual(specTree(root), before);
  // An existing file opens as it is.
  newSpecPath(s, "rules", "keylang/rules.md");
  assert.equal(app.state.current, "keylang/rules.md");
  assert.equal(app.state.buffers.get("keylang/rules.md")!.text, readFileSync(join(root, "keylang/rules.md"), "utf8"));
  assert.match(app.state.message ?? "", /exists; opened as it is/);
  assert.deepEqual(app.unsaved(), [notes]);
});

test("tui: a new spec outside the spec directory, in a generated or explanations directory, or through a link out is refused without a write", async (t) => {
  const root = checkoutRepo(t);
  const outside = mkdtempSync(join(tmpdir(), "keylang-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  symlinkSync(outside, join(root, "keylang/out"));
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  const before = specTree(root);
  const cases: [string, RegExp][] = [
    ["../x.md", /not a plain relative path/],
    ["keylang/../x.md", /not a plain relative path/],
    [`${root}/keylang/x.md`, /not a plain relative path/],
    ["src/x.md", /outside keylang\//],
    ["keylang/x.txt", /not a Markdown spec/],
    ["keylang/map/domain.md", /generated map/],
    ["keylang/map-explained/domain.md", /explained map is generated/],
    ["keylang/explain/brief/x.md", /saved explanations/],
    ["keylang/out/x.md", /leads out of keylang\/ through a link/],
  ];
  for (const [path, reason] of cases) {
    newSpecPath(s, "blank", path);
    // The form stays with the typed path and the reason; no buffer is made.
    assert.equal(s.app.state.prompt?.kind, "new-spec", path);
    assert.equal(s.app.state.prompt?.text, path);
    assert.match(s.app.state.message ?? "", reason, path);
    assert.match(promptNote(s.app), reason, path);
    assert.equal(s.app.state.buffers.has(path), false);
    await esc(s.send);
  }
  assert.deepEqual(specTree(root), before);
  assert.deepEqual(readdirSync(outside), []);
  // A buffer whose directory turns into a link out before Ctrl+S: the save checks again and writes nothing.
  newSpecPath(s, "blank", "keylang/drafts/x.md");
  assert.equal(s.app.state.current, "keylang/drafts/x.md");
  for (const ch of "Draft.") s.send(ch);
  symlinkSync(outside, join(root, "keylang/drafts"));
  s.send(KEY.ctrlS);
  assert.match(s.app.state.message ?? "", /not saved: leads out of keylang\/ through a link; your text stays/);
  assert.deepEqual(readdirSync(outside), []);
  assert.equal(s.app.state.buffers.get("keylang/drafts/x.md")!.text, "Draft.");
  assert.deepEqual(s.app.unsaved(), ["keylang/drafts/x.md"]);
});

test("tui: a target created on disk before the first save is kept; the typed text stays and Ctrl+S again does not overwrite", async (t) => {
  const root = checkoutRepo(t, FEATURES);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  newSpecPath(s, "flow", "keylang/flows/refund.md");
  s.send(KEY.enter);
  const flow = "keylang/flows/refund.md";
  for (const ch of "- trigger presentation.terminal.checkout") s.send(ch);
  const typed = s.app.state.buffers.get(flow)!.text;
  // Someone else creates the file between the form and the save.
  const foreign = "# flow refund\n\nWritten elsewhere.\n";
  writeFileSync(join(root, flow), foreign);
  s.send(KEY.ctrlS);
  assert.match(s.app.state.message ?? "", /not saved: the file was created on disk after this buffer opened/);
  s.send(KEY.ctrlS);
  assert.equal(readFileSync(join(root, flow), "utf8"), foreign);
  assert.equal(s.app.state.buffers.get(flow)!.text, typed);
  assert.deepEqual(s.app.unsaved(), [flow]);
  await sleep(200);
  await s.app.idle();
  // The analysis does not take the foreign file into the unsaved buffer.
  assert.equal(s.app.state.buffers.get(flow)!.text, typed);
  // The save step before an operation refuses it the same way.
  await esc(s.send);
  featureForm(s.send);
  submitSlug(s.app, s.send, "buy");
  assert.deepEqual(s.app.state.barrier?.files, [flow]);
  s.send(KEY.enter);
  await s.app.idle();
  assert.equal(s.app.state.records.length, 0);
  assert.match(s.app.state.barrier?.error ?? "", /refund\.md: the file was created on disk after this buffer opened.*the text stays in its buffer/);
  assert.equal(readFileSync(join(root, flow), "utf8"), foreign);
  assert.equal(s.app.state.buffers.get(flow)!.text, typed);
  await esc(s.send);
  // Once the other file is gone, Ctrl+S creates it with the typed text.
  rmSync(join(root, flow));
  s.send("i");
  s.send(KEY.ctrlS);
  await s.app.idle();
  assert.equal(readFileSync(join(root, flow), "utf8"), typed);
  assert.deepEqual(s.app.unsaved(), []);
});

// ---------- map check in the operation worker (ticket 08) ----------

const GATE_WORKER = new URL("./operation-worker-gate.ts", import.meta.url);

/** A worker entry blocked until `open()`: the real operation worker behind a shared gate. */
function gatedWorker(): { worker: OperationWorker; open: () => void } {
  const gate = new SharedArrayBuffer(4);
  return {
    worker: new OperationWorker({ entry: GATE_WORKER, workerData: { gate } }),
    open: () => {
      Atomics.store(new Int32Array(gate), 0, 1);
      Atomics.notify(new Int32Array(gate), 0);
    },
  };
}

function cliMapCheck(root: string): { status: number | null; stdout: string; stderr: string } {
  return spawnSync(process.execPath, [BIN, "map", "--check"], { cwd: root, encoding: "utf8" });
}

function mapCheck(send: (keys: string) => void): void {
  send(KEY.ctrlP);
  for (const ch of "map check") send(ch);
  send(KEY.enter);
}

/** The lines `map --check` prints for a record, from its payload (the CLI runs at the root). */
function mapCheckOut(record: App["state"]["records"][number]): string {
  const result = record.result;
  assert.ok(result?.kind === "map-check" && result.payload !== null, JSON.stringify(result?.messages));
  return mapCheckLines(result.payload).map((line) => `${line}\n`).join("");
}

test("tui: map check in the worker reports what the CLI reports for a fresh, stale and conflicting map, and writes nothing", async (t) => {
  const root = checkoutRepo(t);
  assert.equal(spawnSync(process.execPath, [BIN, "map"], { cwd: root, encoding: "utf8" }).status, 0);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  const cases: [string, () => void, number][] = [
    ["fresh", () => {}, 0],
    // New code: the generated domain map is stale.
    ["stale", () => writeFileSync(join(root, "src/domain/order.ts"), "export function create(): void {}\nexport function cancel(): void {}\n"), 1],
    // A manual file where a generated one belongs: a conflict, and the stale files are not listed.
    ["conflict", () => writeFileSync(join(root, "keylang/map/application.md"), "# notes\n\nWritten by hand.\n"), 1],
  ];
  for (const [name, change, code] of cases) {
    change();
    const before = treeBytes(root);
    mapCheck(s.send);
    await s.app.idle();
    const record = s.app.state.records.at(-1)!;
    assert.equal(record.status, "completed", `${name}: ${JSON.stringify(record.result?.messages)}`);
    assert.deepEqual(treeBytes(root), before, `${name}: the TUI check wrote nothing`);
    const cli = cliMapCheck(root);
    assert.deepEqual(treeBytes(root), before, `${name}: the CLI check wrote nothing`);
    assert.equal(cli.status, code, `${name}: ${cli.stderr}`);
    assert.equal(record.result!.exitCode, cli.status, name);
    assert.equal(mapCheckOut(record), cli.stdout, name);
  }
  const [fresh, stale, conflict] = s.app.state.records.map((record) => (record.result?.kind === "map-check" ? record.result.payload : null));
  assert.deepEqual([fresh?.stale, fresh?.conflicts], [[], []]);
  assert.deepEqual(stale?.stale, ["keylang/map/domain.md"]);
  assert.deepEqual(conflict?.conflicts, ["keylang/map/application.md"]);
  assert.deepEqual(new Set(s.app.state.records.map((record) => record.id)).size, 3, "each run has its own id");
  // F6 shows the outcome; the session answers after code 1.
  s.send(KEY.f6);
  assert.match(s.text(), /Map: check {2}completed · code 1/);
  assert.match(s.text(), /conflict keylang\/map\/application\.md: manual file/);
  assert.match(s.text(), /read-only, nothing written/);
});

test("tui: a delayed map check in a real worker leaves keys and resize live; Esc folds F6, x cancels with nothing written", async (t) => {
  const root = checkoutRepo(t);
  const gated = gatedWorker();
  const vt = new VirtualTerminal(110, 30);
  const app = new App({ root, cols: 110, rows: 30, operationWorker: gated.worker });
  app.attach({ kind: "terminal", write: (ansi) => vt.feed(ansi) }, 110, 30);
  t.after(() => app.close());
  const send = (keys: string): void => app.input(keys);
  await app.idle();
  const before = treeBytes(root);
  mapCheck(send);
  const first = app.state.records[0]!;
  assert.equal(first.status, "running");
  // The worker is blocked, the session thread is not: a key and a resize reach the frame before the result.
  await sleep(100);
  send(KEY.down);
  assert.equal(app.state.cursor.line, 1);
  assert.doesNotMatch(vt.text(), /FILES/);
  send("\x1bOQ"); // F2
  assert.match(vt.text(), /FILES/);
  vt.resize(80, 20);
  app.resize(80, 20);
  assert.equal(vt.lines().length, 20);
  assert.equal(first.status, "running");
  // A second job is refused; Esc folds the panel and the work goes on.
  mapCheck(send);
  assert.equal(app.state.records.length, 1);
  send(KEY.f6);
  assert.match(vt.text(), /x cancel/);
  send("\x1b");
  await sleep(40);
  assert.equal(app.state.results.open, false);
  assert.equal(first.status, "running");
  // Cancel: cancelled with no exit code, the worker ends, nothing is written.
  send(KEY.f6);
  send("x");
  assert.equal(first.status, "cancelled");
  assert.equal(first.result?.exitCode, null);
  assert.equal(app.state.activeOperation, null);
  assert.match(vt.text(), /cancelled/);
  send("\x1b");
  gated.open();
  await app.idle();
  await sleep(100);
  assert.equal(first.status, "cancelled");
  assert.deepEqual(treeBytes(root), before);
  // A new run is a new record with a new id, in a new worker (the gate is open now).
  mapCheck(send);
  await app.idle();
  const second = app.state.records[1]!;
  assert.notEqual(second.id, first.id);
  assert.equal(second.status, "completed");
  assert.equal(second.result?.exitCode, cliMapCheck(root).status);
  assert.equal(first.status, "cancelled");
});

test("tui: a result arriving after Cancel changes nothing in the history", async (t) => {
  const root = checkoutRepo(t);
  let release: (() => void) | null = null;
  const operations = async (request: OperationRequest): Promise<OperationResult> => {
    // Ignores the signal on purpose: the late result must still be dropped.
    await new Promise<void>((done) => (release = done));
    return runOperation(request);
  };
  const s = session(root, { operations });
  t.after(() => s.app.close());
  await s.app.idle();
  mapCheck(s.send);
  await sleep(20);
  s.send(KEY.ctrlP);
  for (const ch of "cancel") s.send(ch);
  s.send(KEY.enter);
  const record = s.app.state.records[0]!;
  assert.equal(record.status, "cancelled");
  const finished = record.finished;
  release!();
  await s.app.idle();
  assert.equal(record.status, "cancelled");
  assert.equal(record.result?.exitCode, null);
  assert.equal(record.result?.payload, null);
  assert.equal(record.finished, finished);
  assert.equal(s.app.state.records.length, 1);
  assert.equal(s.app.state.activeOperation, null);
  assert.match(s.app.state.message ?? "", /map check: cancelled/);
});

test("tui: a worker that cannot start or dies is a code 2 failure; the next run starts a new worker", async (t) => {
  const root = checkoutRepo(t);
  // No such module: the worker never starts.
  const broken = new App({ root, cols: 100, rows: 24, operationWorker: new OperationWorker({ entry: new URL("./no-such-worker.ts", import.meta.url) }) });
  t.after(() => broken.close());
  await broken.idle();
  mapCheck((keys) => broken.input(keys));
  await broken.idle();
  assert.equal(broken.state.records[0]!.status, "failed");
  assert.equal(broken.state.records[0]!.result?.exitCode, 2);
  assert.match(broken.state.records[0]!.result!.messages[0]!.text, /the operation worker failed/);
  broken.input(KEY.down);
  assert.equal(broken.state.cursor.line, 1);
  // Dies once on start, then works: the failure is visible and the retry succeeds.
  const crashes = new SharedArrayBuffer(4);
  Atomics.store(new Int32Array(crashes), 0, 1);
  const vt = new VirtualTerminal(100, 24);
  const app = new App({ root, cols: 100, rows: 24, operationWorker: new OperationWorker({ entry: GATE_WORKER, workerData: { crashes } }) });
  app.attach({ kind: "terminal", write: (ansi) => vt.feed(ansi) }, 100, 24);
  t.after(() => app.close());
  await app.idle();
  mapCheck((keys) => app.input(keys));
  await app.idle();
  assert.equal(app.state.records[0]!.status, "failed");
  assert.match(app.state.records[0]!.result!.messages[0]!.text, /the operation worker exited with code 3/);
  assert.match(vt.text(), /map check: failed · code 2/);
  mapCheck((keys) => app.input(keys));
  await app.idle();
  assert.equal(app.state.records[1]!.status, "completed");
  assert.equal(app.state.records[1]!.result?.exitCode, cliMapCheck(root).status);
});

test("operation worker: every request settles once; close cancels what is pending and refuses new work", async (t) => {
  const root = checkoutRepo(t);
  const gated = gatedWorker();
  const pending = gated.worker.run({ kind: "map-check", root });
  const progress: string[] = [];
  const controller = new AbortController();
  const aborted = gated.worker.run({ kind: "map-check", root }, { signal: controller.signal, onProgress: ({ text }) => progress.push(text) });
  controller.abort();
  const cancelled = await aborted;
  assert.deepEqual([cancelled.status, cancelled.exitCode, cancelled.kind], ["cancelled", null, "map-check"]);
  // Cancelling one read-only request ended the worker: the other one settles as a failure, once.
  const other = await pending;
  assert.deepEqual([other.status, other.exitCode], ["failed", 2]);
  gated.open();
  const fresh = await gated.worker.run({ kind: "map-check", root }, { onProgress: ({ text }) => progress.push(text) });
  assert.equal(fresh.status, "completed");
  assert.deepEqual(progress, ["reading the sources", "comparing with the files on disk"]);
  const open = gated.worker.run({ kind: "feature", root, slug: "nope" });
  gated.worker.close();
  assert.equal((await open).status, "cancelled");
  const after = await gated.worker.run({ kind: "map-check", root });
  assert.deepEqual([after.status, after.exitCode], ["failed", 2]);
});

// ---------- map write and its commit (ticket 09) ----------

/** The palette's "Map: write": the step naming the targets opens; Enter in it starts the write. */
function mapWrite(send: (keys: string) => void): void {
  send(KEY.ctrlP);
  for (const ch of "map write") send(ch);
  send(KEY.enter);
}

/** The repository's files with the index's `generated` time taken out: what two runs must share. */
function artifacts(root: string): Map<string, string> {
  const tree = treeBytes(root);
  const index = tree.get(".keylang/index.json");
  if (index !== undefined) tree.set(".keylang/index.json", index.replace(/"generated": "[^"]*"/, '"generated": "…"'));
  return tree;
}

/** A runner that calls the shared operation on this thread, with `pause` run at the commit barrier before the session hears of it. */
function pausedRunner(pause: () => void | Promise<void>, onProgress?: (text: string) => void): NonNullable<AppOptions["operations"]> {
  return (request, context) =>
    runOperation(request, {
      ...context,
      onProgress: (progress) => {
        context.onProgress?.(progress);
        onProgress?.(progress.text);
      },
      beforeCommit: async () => {
        await pause();
        await context.beforeCommit?.();
      },
    });
}

function mapRecord(app: App): Extract<OperationResult, { kind: "map" }> & { payload: NonNullable<Extract<OperationResult, { kind: "map" }>["payload"]> } {
  const result = app.state.records.at(-1)?.result;
  assert.ok(result?.kind === "map" && result.payload !== null, JSON.stringify(result?.messages));
  return result as Extract<OperationResult, { kind: "map" }> & { payload: NonNullable<Extract<OperationResult, { kind: "map" }>["payload"]> };
}

test("tui: Map: write names its targets first and writes what the CLI writes in a twin repository; F5 and Back write nothing; the map stays read-only", async (t) => {
  const root = checkoutRepo(t);
  const twin = checkoutRepo(t);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  const before = treeBytes(root);
  s.send(KEY.f5);
  await s.app.idle();
  assert.deepEqual(treeBytes(root), before, "F5 writes nothing");
  // The generated map is open as a read-only buffer before it exists on disk.
  s.send(KEY.ctrlP);
  for (const ch of "open keylang/map/domain.md") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.current, "keylang/map/domain.md");
  assert.equal(s.app.state.buffers.get("keylang/map/domain.md")!.readOnly, true);
  // The step names the targets; Back writes nothing and starts nothing.
  mapWrite(s.send);
  assert.deepEqual(s.app.state.barrier?.writes, ["keylang/map/*.md", "keylang/map-explained/*.md", ".keylang/index.json", ".keylang/cache/facts.json"]);
  assert.deepEqual(s.app.state.barrier?.files, []);
  assert.match(s.text(), /Writes \(generated files only/);
  assert.match(s.text(), /\[Continue\]/);
  await esc(s.send);
  assert.equal(s.app.state.barrier, null);
  assert.equal(s.app.state.records.length, 0);
  assert.deepEqual(treeBytes(root), before, "Back writes nothing");
  mapWrite(s.send);
  s.send(KEY.enter);
  await s.app.idle();
  const result = mapRecord(s.app);
  assert.equal(result.status, "completed");
  assert.equal(result.exitCode, 0);
  const cli = spawnSync(process.execPath, [BIN, "map"], { cwd: twin, encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr);
  assert.deepEqual(artifacts(root), artifacts(twin), "the same bytes as the CLI, but for the index's generated time");
  assert.equal(mapStepLines(result.payload.steps).map((line) => `${line}\n`).join(""), cli.stdout);
  assert.deepEqual(result.written, [...mapStepLines(result.payload.steps).map((line) => line.replace(/: written$/, "")), ".keylang/index.json", ".keylang/cache/facts.json"]);
  assert.ok(result.payload.steps.every((step) => step.state === "completed"));
  // The map buffer follows the disk and stays read-only.
  const buffer = s.app.state.buffers.get("keylang/map/domain.md")!;
  assert.equal(buffer.readOnly, true);
  assert.equal(buffer.text, readFileSync(join(root, "keylang/map/domain.md"), "utf8"));
  s.send("i");
  assert.match(s.app.state.message ?? "", /generated by `keylang map`/);
  assert.notEqual(s.app.state.mode, "edit");
  s.send(KEY.f6);
  assert.match(s.text(), /Map: write {2}completed · code 0/);
  assert.match(s.text(), /written {2}keylang\/map\/domain\.md/);
  // Nothing changed since: a second write only refreshes the index and the cache; map check agrees.
  const after = treeBytes(root);
  assert.equal(cliMapCheck(root).status, 0);
  assert.deepEqual(treeBytes(root), after);
});

test("tui: a manual target or a changed source during the pause before the commit refuses the map; the new bytes stay; a rerun writes", async (t) => {
  const root = checkoutRepo(t);
  assert.equal(spawnSync(process.execPath, [BIN, "map"], { cwd: root, encoding: "utf8" }).status, 0);
  rmSync(join(root, "keylang/map/domain.md"));
  const manual = "# notes\n\nWritten by hand while the map was computed.\n";
  const source = "export function create(): void {}\nexport function cancel(): void {}\n";
  const pauses: (() => void)[] = [
    () => writeFileSync(join(root, "keylang/map/domain.md"), manual),
    () => writeFileSync(join(root, "src/domain/order.ts"), source),
    () => {},
  ];
  let calls = 0;
  const s = session(root, { operations: pausedRunner(() => pauses[calls++]!()) });
  t.after(() => s.app.close());
  await s.app.idle();
  // A manual file where the plan expected none.
  let before = treeBytes(root);
  mapWrite(s.send);
  s.send(KEY.enter);
  await s.app.idle();
  let result = mapRecord(s.app);
  assert.deepEqual([result.status, result.exitCode], ["failed", 1]);
  assert.deepEqual(result.payload.refused, ["keylang/map/domain.md: created on disk while the change was prepared; nothing written"]);
  assert.deepEqual([result.written, result.payload.steps], [[], []]);
  assert.deepEqual(treeBytes(root), new Map([...before, ["keylang/map/domain.md", manual]]), "only the outside write is on disk");
  // Code changed after it was read: refused as well.
  rmSync(join(root, "keylang/map/domain.md"));
  before = treeBytes(root);
  mapWrite(s.send);
  s.send(KEY.enter);
  await s.app.idle();
  result = mapRecord(s.app);
  assert.deepEqual([result.status, result.exitCode], ["failed", 1]);
  assert.deepEqual(result.payload.refused, ["src/domain/order.ts: changed on disk while the map was computed"]);
  assert.deepEqual(treeBytes(root), new Map([...before, ["src/domain/order.ts", source]]));
  s.send(KEY.f6);
  assert.match(s.text(), /inputs changed, nothing written · code 1/);
  assert.match(s.text(), /Enter computes the map again/);
  // Enter reruns through the same step; the map is now computed from the new code.
  s.send(KEY.enter);
  assert.ok(s.app.state.barrier?.writes);
  s.send(KEY.enter);
  await s.app.idle();
  result = mapRecord(s.app);
  assert.deepEqual([result.status, result.exitCode], ["completed", 0]);
  assert.match(readFileSync(join(root, "keylang/map/domain.md"), "utf8"), /cancel/);
  assert.equal(cliMapCheck(root).status, 0);
});

test("tui: an I/O failure on the second step names the first as written, the second as failed and the rest as not attempted; code 2, the session goes on", async (t) => {
  const root = checkoutRepo(t);
  assert.equal(spawnSync(process.execPath, [BIN, "map"], { cwd: root, encoding: "utf8" }).status, 0);
  withConfig(root, { explain: { map: true } });
  writeFileSync(join(root, "src/domain/order.ts"), "export function create(): void {}\nexport function cancel(): void {}\n");
  const index = readFileSync(join(root, ".keylang/index.json"), "utf8");
  // Not a permission trick: a file where the explained map's directory must be makes its first write fail.
  const s = session(root, { operations: pausedRunner(() => writeFileSync(join(root, "keylang/map-explained"), "in the way\n")) });
  t.after(() => s.app.close());
  await s.app.idle();
  mapWrite(s.send);
  s.send(KEY.enter);
  await s.app.idle();
  const result = mapRecord(s.app);
  assert.deepEqual([result.status, result.exitCode], ["failed", 2]);
  const [first, second, ...rest] = result.payload.steps;
  assert.deepEqual([first?.path, first?.state], ["keylang/map/domain.md", "completed"]);
  assert.equal(second?.state, "failed");
  assert.match(second?.path ?? "", /^keylang\/map-explained\//);
  assert.match(second?.error ?? "", /ENOTDIR|EEXIST|not a directory/);
  assert.ok(rest.length > 0 && rest.every((step) => step.state === "not-attempted"), JSON.stringify(rest));
  assert.ok(rest.some((step) => step.path === ".keylang/index.json"));
  assert.deepEqual([result.written, result.removed], [["keylang/map/domain.md"], []]);
  assert.match(readFileSync(join(root, "keylang/map/domain.md"), "utf8"), /cancel/, "the completed step stays: no rollback");
  assert.equal(readFileSync(join(root, ".keylang/index.json"), "utf8"), index, "a not-attempted step wrote nothing");
  assert.equal(readFileSync(join(root, "keylang/map-explained"), "utf8"), "in the way\n");
  assert.ok(result.messages.some((message) => message.level === "error" && /not attempted: .*\.keylang\/index\.json/.test(message.text)));
  s.send(KEY.f6);
  assert.match(s.text(), /1 of \d+ step\(s\) done, failed · code 2/);
  assert.match(s.text(), /not attempted \.keylang\/index\.json/);
  // The session answers; a fresh analysis ran after the partial write.
  s.send("\x1b");
  await sleep(40);
  s.send(KEY.down);
  assert.equal(s.app.state.cursor.line, 1);
  assert.equal(s.app.state.updating, false);
  assert.equal(s.app.state.activeOperation, null);
});

test("tui: Cancel during the commit lets the current file finish and names what was written; nothing is rolled back", async (t) => {
  const root = checkoutRepo(t);
  assert.equal(spawnSync(process.execPath, [BIN, "map"], { cwd: root, encoding: "utf8" }).status, 0);
  writeFileSync(join(root, "src/domain/order.ts"), "export function create(): void {}\nexport function cancel(): void {}\n");
  const cache = readFileSync(join(root, ".keylang/cache/facts.json"), "utf8");
  let cancel = (): void => {};
  const s = session(root, { operations: pausedRunner(() => {}, (text) => text === "writing .keylang/index.json" && cancel()) });
  cancel = () => {
    s.send(KEY.ctrlP);
    for (const ch of "cancel") s.send(ch);
    s.send(KEY.enter);
  };
  t.after(() => s.app.close());
  await s.app.idle();
  mapWrite(s.send);
  s.send(KEY.enter);
  await s.app.idle();
  const result = mapRecord(s.app);
  assert.deepEqual([result.status, result.exitCode], ["cancelled", null]);
  assert.deepEqual(
    result.payload.steps.map((step) => [step.path, step.state]),
    [
      ["keylang/map/domain.md", "completed"],
      [".keylang/index.json", "completed"],
      [".keylang/cache/facts.json", "not-attempted"],
    ],
  );
  assert.deepEqual(result.written, ["keylang/map/domain.md", ".keylang/index.json"]);
  assert.equal(readFileSync(join(root, ".keylang/cache/facts.json"), "utf8"), cache);
  assert.equal(s.app.state.records.at(-1)!.status, "cancelled");
  assert.match(s.app.state.message ?? "", /map write: 2 of 3 step\(s\) done, cancelled/);
});

test("tui: an analysis finishing during the commit is not adopted; the report after it matches the disk and keeps the dirty buffers", async (t) => {
  const root = checkoutRepo(t);
  let gateNext = false;
  let release: (() => void) | null = null;
  let dropped: Analysis | null = null;
  let committed = false;
  const reports: { analysis: Analysis; afterCommit: boolean; overlay: string[] }[] = [];
  const analyzer = async (request: AnalysisRequest): Promise<Analysis> => {
    const afterCommit = committed;
    // The map's own analysis (persistFacts) is not the editor's report.
    const gated = gateNext && request.persistFacts !== true;
    if (gated) {
      gateNext = false;
      await new Promise<void>((done) => (release = done));
    }
    const analysis = await analyze(request);
    if (gated) dropped = analysis;
    if (request.persistFacts !== true) reports.push({ analysis, afterCommit, overlay: [...(request.overlay?.keys() ?? [])] });
    return analysis;
  };
  const operations: NonNullable<AppOptions["operations"]> = async (request, context) => {
    const result = await pausedRunner(async () => {
      await context.beforeCommit?.();
      // The session knows of the commit now; the F5 started before it finishes meanwhile.
      release!();
      await waitUntil(() => dropped !== null, "the analysis started before the commit");
    })(request, { ...context, beforeCommit: () => {} });
    committed = true;
    return result;
  };
  const s = session(root, { analyzer, operations });
  t.after(() => s.app.close());
  await s.app.idle();
  // An unsaved flow: the map does not read it, so the step does not list it and it stays dirty.
  s.send("i");
  s.send("x");
  await esc(s.send);
  await s.app.idle();
  const typed = s.app.state.buffers.get("keylang/flows/checkout.md")!.text;
  gateNext = true;
  s.send(KEY.f5);
  mapWrite(s.send);
  assert.deepEqual(s.app.state.barrier?.files, []);
  s.send(KEY.enter);
  await s.app.idle();
  assert.equal(mapRecord(s.app).exitCode, 0);
  assert.ok(dropped !== null);
  assert.notEqual(s.app.state.analysis, dropped, "the analysis from before the commit is not adopted");
  const current = reports.at(-1)!;
  assert.equal(current.afterCommit, true, "the report was computed after the commit");
  assert.equal(s.app.state.analysis, current.analysis);
  assert.deepEqual(s.app.unsaved(), ["keylang/flows/checkout.md"]);
  assert.equal(s.app.state.buffers.get("keylang/flows/checkout.md")!.text, typed);
  assert.deepEqual(current.overlay, [join(root, "keylang/flows/checkout.md")], "the dirty buffer is the overlay");
  assert.equal(current.analysis.snapshot?.snapshotId, (JSON.parse(readFileSync(join(root, ".keylang/index.json"), "utf8")) as { snapshotId: string }).snapshotId);
  assert.equal(cliMapCheck(root).status, 0);
});

test("map: the commit keeps permissions, writes through links inside the repository, refuses one leading out, and never writes over a manual file", async (t) => {
  const root = checkoutRepo(t);
  const outside = mkdtempSync(join(tmpdir(), "keylang-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  const map = (): { status: number | null; stdout: string; stderr: string } => spawnSync(process.execPath, [BIN, "map"], { cwd: root, encoding: "utf8" });
  assert.equal(map().status, 0);
  const stale = (): void => writeFileSync(join(root, "src/domain/order.ts"), `export function create(): void {}\nexport function v${Date.now()}(): void {}\n`);
  // Permissions of the file replaced.
  chmodSync(join(root, "keylang/map/domain.md"), 0o640);
  stale();
  assert.equal(map().status, 0);
  assert.equal(statSync(join(root, "keylang/map/domain.md")).mode & 0o777, 0o640);
  // A generated file with CRLF gets the generator's exact bytes, so the next check finds it current.
  writeFileSync(join(root, "keylang/map/domain.md"), readFileSync(join(root, "keylang/map/domain.md"), "utf8").replace(/\n/g, "\r\n"));
  stale();
  assert.equal(map().status, 0);
  assert.doesNotMatch(readFileSync(join(root, "keylang/map/domain.md"), "utf8"), /\r/);
  assert.equal(cliMapCheck(root).status, 0);
  // A link inside the repository: written at its target, the link stays.
  mkdirSync(join(root, "docs"));
  writeFileSync(join(root, "docs/domain.md"), readFileSync(join(root, "keylang/map/domain.md"), "utf8"));
  rmSync(join(root, "keylang/map/domain.md"));
  symlinkSync("../../docs/domain.md", join(root, "keylang/map/domain.md"));
  stale();
  assert.equal(map().status, 0);
  assert.equal(readlinkSync(join(root, "keylang/map/domain.md")), "../../docs/domain.md");
  assert.match(readFileSync(join(root, "docs/domain.md"), "utf8"), /fn \[v\d+\]/);
  // A link out of the repository: the whole plan is refused, nothing is written, code 1.
  writeFileSync(join(outside, "domain.md"), readFileSync(join(root, "docs/domain.md"), "utf8"));
  rmSync(join(root, "keylang/map/domain.md"));
  symlinkSync(join(outside, "domain.md"), join(root, "keylang/map/domain.md"));
  stale();
  let before = treeBytes(root);
  const outsideBefore = readFileSync(join(outside, "domain.md"), "utf8");
  let out = map();
  assert.equal(out.status, 1, out.stderr);
  assert.match(out.stdout, /keylang\/map\/domain\.md: leads out of the repository through a link/);
  assert.match(out.stderr, /nothing was written/);
  assert.deepEqual(treeBytes(root), before);
  assert.equal(readFileSync(join(outside, "domain.md"), "utf8"), outsideBefore);
  // A manual file where a generated one belongs: code 1, nothing written — the index and the fact cache included.
  rmSync(join(root, "keylang/map/domain.md"));
  writeFileSync(join(root, "keylang/map/domain.md"), "# domain notes\n");
  stale();
  before = treeBytes(root);
  out = map();
  assert.equal(out.status, 1);
  assert.equal(out.stdout, "keylang/map/domain.md: manual file without keylang:generated marker\n");
  assert.deepEqual(treeBytes(root), before);
});

test("operation worker: a map cancelled before its commit ends the worker with nothing written; the next one writes what the CLI writes", async (t) => {
  const root = checkoutRepo(t);
  const twin = checkoutRepo(t);
  const gated = gatedWorker();
  const before = treeBytes(root);
  const controller = new AbortController();
  const cancelled = gated.worker.run({ kind: "map", root }, { signal: controller.signal });
  controller.abort();
  assert.deepEqual([(await cancelled).status, (await cancelled).exitCode], ["cancelled", null]);
  gated.open();
  await sleep(100);
  assert.deepEqual(treeBytes(root), before);
  let told = 0;
  const done = await gated.worker.run({ kind: "map", root }, { beforeCommit: () => void told++ });
  gated.worker.close();
  assert.deepEqual([done.status, done.exitCode, told], ["completed", 0, 1]);
  assert.equal(spawnSync(process.execPath, [BIN, "map"], { cwd: twin, encoding: "utf8" }).status, 0);
  assert.deepEqual(artifacts(root), artifacts(twin));
});

// ---------- baseline write and check (ticket 10) ----------

/** Two layers, `app` importing `domain` and the `stripe` package. */
function baselineRepo(t: { after: (f: () => void) => void }): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-tui-baseline-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const files: Record<string, string> = {
    "package.json": `${JSON.stringify({ name: "shop", private: true, dependencies: { stripe: "1.0.0" } })}\n`,
    "keylang.json": `${JSON.stringify({ languages: ["typescript"], layers: { app: ["src/app/**"], domain: ["src/domain/**"] } }, null, 2)}\n`,
    "src/domain/order.ts": "export function price(): number {\n  return 1;\n}\n",
    "src/app/pay.ts": 'import Stripe from "stripe";\nimport { price } from "../domain/order.ts";\nexport function charge(): number {\n  return Stripe ? price() : 0;\n}\n',
    "keylang/rules.md": "# rules\n\n- layers domain < app\n",
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

/** The palette's baseline form, then the mode: `write` (the first item) or `check`. */
function baselineForm(send: (keys: string) => void, mode: "write" | "check"): void {
  send(KEY.ctrlP);
  for (const ch of "baseline") send(ch);
  send(KEY.enter);
  if (mode === "check") send(KEY.down);
  send(KEY.enter);
}

function baselineRecord(app: App): Extract<OperationResult, { kind: "baseline" }> & { payload: NonNullable<Extract<OperationResult, { kind: "baseline" }>["payload"]> } {
  const result = app.state.records.at(-1)?.result;
  assert.ok(result?.kind === "baseline" && result.payload !== null, JSON.stringify(result?.messages));
  return result as Extract<OperationResult, { kind: "baseline" }> & { payload: NonNullable<Extract<OperationResult, { kind: "baseline" }>["payload"]> };
}

function cliBaseline(root: string, args: string[] = []): { status: number | null; stdout: string; stderr: string } {
  return spawnSync(process.execPath, [BIN, "baseline", ...args], { cwd: root, encoding: "utf8" });
}

test("tui: baseline write and check in the worker give the CLI's bytes and codes; F5 never writes it; a new edge is stale until written", async (t) => {
  const root = baselineRepo(t);
  const twin = baselineRepo(t);
  const file = "keylang/rules.baseline.md";
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  const before = treeBytes(root);
  s.send(KEY.f5);
  await s.app.idle();
  assert.deepEqual(treeBytes(root), before, "F5 writes nothing");
  // The human name finds it as the alias `baseline` does; the form names the mode and the target from the config's spec directory and explains the write.
  s.send(KEY.ctrlP);
  for (const ch of "baseline: write or check") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.prompt?.kind, "baseline");
  assert.deepEqual(s.app.state.prompt?.items, [`Write ${file}`, `Check ${file} (writes nothing)`]);
  assert.match(s.app.state.prompt?.note ?? "", /dependencies the code has now become the allowed ones/);
  await esc(s.send);
  assert.equal(s.app.state.records.length, 0);
  // Check on a missing file: code 1, as the CLI, and nothing written.
  baselineForm(s.send, "check");
  await s.app.idle();
  let result = baselineRecord(s.app);
  assert.deepEqual([result.status, result.exitCode, result.payload.state], ["completed", 1, "stale"]);
  const cliMissing = cliBaseline(twin, ["--check"]);
  assert.equal(cliMissing.status, 1);
  assert.equal(result.messages.map((m) => `${m.text}\n`).join(""), cliMissing.stdout);
  assert.deepEqual(treeBytes(root), before, "check writes nothing");
  // Write: no extra step without a dirty keylang.json; the bytes are the CLI's.
  baselineForm(s.send, "write");
  assert.equal(s.app.state.barrier, null);
  await s.app.idle();
  result = baselineRecord(s.app);
  assert.deepEqual([result.status, result.exitCode, result.written], ["completed", 0, [file]]);
  const cliWrite = cliBaseline(twin);
  assert.equal(cliWrite.status, 0, cliWrite.stderr);
  assert.equal(result.messages.map((m) => `${m.text}\n`).join(""), cliWrite.stdout);
  const text = readFileSync(join(root, file), "utf8");
  assert.equal(text, readFileSync(join(twin, file), "utf8"));
  assert.match(text, /^- deny app external$/m);
  assert.match(text, /^- allow app external\.stripe$/m);
  assert.match(text, /^- deny domain app, external, unassigned$/m);
  assert.deepEqual(treeBytes(root), new Map([...before, [file, Buffer.from(text).toString("latin1")]]), "only the baseline is written");
  assert.ok(result.payload.added.includes("- allow app external.stripe"));
  // Idempotent: a second write and a check change nothing and return 0.
  baselineForm(s.send, "write");
  await s.app.idle();
  result = baselineRecord(s.app);
  assert.deepEqual([result.exitCode, result.written, result.payload.state], [0, [], "current"]);
  baselineForm(s.send, "check");
  await s.app.idle();
  assert.equal(baselineRecord(s.app).exitCode, 0);
  assert.equal(readFileSync(join(root, file), "utf8"), text);
  // The baseline opens read-only, named after its generator.
  s.send(KEY.ctrlP);
  for (const ch of `open ${file}`) s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.current, file);
  const buffer = s.app.state.buffers.get(file)!;
  assert.equal(buffer.readOnly, true);
  s.send("i");
  assert.match(s.app.state.message ?? "", /generated by `keylang baseline`/);
  assert.notEqual(s.app.state.mode, "edit");
  // A new edge: check is 1 and writes nothing, F5 writes nothing; write updates the file and the clean buffer.
  writeFileSync(join(root, "src/domain/order.ts"), 'import Stripe from "stripe";\nexport function price(): number {\n  return Stripe ? 1 : 2;\n}\n');
  writeFileSync(join(twin, "src/domain/order.ts"), readFileSync(join(root, "src/domain/order.ts"), "utf8"));
  const drifted = treeBytes(root);
  baselineForm(s.send, "check");
  await s.app.idle();
  result = baselineRecord(s.app);
  assert.deepEqual([result.exitCode, result.payload.state], [1, "stale"]);
  assert.ok(result.payload.added.includes("- allow domain external.stripe"), JSON.stringify(result.payload));
  s.send(KEY.f5);
  await s.app.idle();
  assert.deepEqual(treeBytes(root), drifted, "check and F5 write nothing");
  const staleCheck = s.app.state.records.at(-1)!;
  baselineForm(s.send, "write");
  await s.app.idle();
  result = baselineRecord(s.app);
  assert.deepEqual([result.exitCode, result.written], [0, [file]]);
  assert.equal(cliBaseline(twin).status, 0);
  const updated = readFileSync(join(root, file), "utf8");
  assert.equal(updated, readFileSync(join(twin, file), "utf8"));
  assert.match(updated, /^- allow domain external\.stripe$/m);
  assert.equal(staleCheck.outdated, "the baseline was written since this run");
  assert.equal(s.app.state.buffers.get(file)!.text, updated, "the clean buffer follows the disk");
  assert.equal(s.app.state.buffers.get(file)!.readOnly, true);
  assert.equal(cliBaseline(root, ["--check"]).status, 0);
  s.send(KEY.f6);
  assert.match(s.text(), /Baseline: write or check · write {2}completed · code 0/);
  assert.match(s.text(), /\+ - allow domain external\.stripe/);
});

test("tui: a manual baseline, an outside edit or a changed source before the commit is never written over; a dirty keylang.json is saved first", async (t) => {
  const root = baselineRepo(t);
  const file = "keylang/rules.baseline.md";
  const manual = "# rules\n\n- deny app domain\n";
  writeFileSync(join(root, file), manual);
  const outside = "<!-- keylang:generated — не редагувати, `keylang baseline` -->\n\n# rules\n\n- deny domain app\n";
  const source = "export function price(): number {\n  return 2;\n}\nexport function tax(): number {\n  return 0;\n}\n";
  const pauses: (() => void)[] = [() => writeFileSync(join(root, file), outside), () => writeFileSync(join(root, "src/domain/order.ts"), source), () => {}];
  let calls = 0;
  const s = session(root, { operations: pausedRunner(() => pauses[calls++]!()) });
  t.after(() => s.app.close());
  await s.app.idle();
  // A manual file: write and check both refuse it with code 1, as the CLI does; nothing is written.
  let before = treeBytes(root);
  baselineForm(s.send, "write");
  await s.app.idle();
  let result = baselineRecord(s.app);
  assert.deepEqual([result.status, result.exitCode, result.payload.state, result.written], ["completed", 1, "manual", []]);
  assert.deepEqual(result.messages.map((m) => m.text), [`${file}: manual file without keylang:generated marker`]);
  baselineForm(s.send, "check");
  await s.app.idle();
  assert.deepEqual([baselineRecord(s.app).exitCode, baselineRecord(s.app).payload.state], [1, "manual"]);
  const cli = cliBaseline(root);
  assert.equal(cli.status, 1);
  assert.equal(cli.stdout, `${file}: manual file without keylang:generated marker\n`);
  assert.deepEqual(treeBytes(root), before, "a manual baseline is never written");
  assert.equal(calls, 0, "no commit was asked for");
  // An outside edit of the target during the pause: refused, its bytes stay.
  rmSync(join(root, file));
  before = treeBytes(root);
  baselineForm(s.send, "write");
  await s.app.idle();
  result = baselineRecord(s.app);
  assert.deepEqual([result.status, result.exitCode, result.written], ["failed", 1, []]);
  assert.deepEqual(result.payload.refused, [`${file}: created on disk while the change was prepared; nothing written`]);
  assert.deepEqual(treeBytes(root), new Map([...before, [file, Buffer.from(outside).toString("latin1")]]));
  // A source changed after it was read: refused as well.
  rmSync(join(root, file));
  before = treeBytes(root);
  baselineForm(s.send, "write");
  await s.app.idle();
  result = baselineRecord(s.app);
  assert.deepEqual([result.status, result.exitCode], ["failed", 1]);
  assert.deepEqual(result.payload.refused, ["src/domain/order.ts: changed on disk while the baseline was computed"]);
  assert.deepEqual(treeBytes(root), new Map([...before, ["src/domain/order.ts", source]]));
  s.send(KEY.f6);
  assert.match(s.text(), /inputs changed, nothing written · code 1/);
  s.send(KEY.f6);
  // A dirty keylang.json opens the step, which names the target; Back writes nothing.
  s.send(KEY.ctrlP);
  for (const ch of "open keylang.json") s.send(ch);
  s.send(KEY.enter);
  s.send("i");
  s.send(" ");
  await esc(s.send);
  baselineForm(s.send, "write");
  assert.deepEqual(s.app.state.barrier?.writes, [file]);
  assert.deepEqual(s.app.state.barrier?.files, ["keylang.json"]);
  await esc(s.send);
  assert.equal(existsSync(join(root, file)), false);
  // Save and continue: the config is saved, then the baseline is written from the new code.
  baselineForm(s.send, "write");
  s.send(KEY.enter);
  await s.app.idle();
  result = baselineRecord(s.app);
  assert.deepEqual([result.status, result.exitCode, result.written], ["completed", 0, [file]]);
  assert.match(readFileSync(join(root, "keylang.json"), "utf8"), /^ \{/);
  assert.equal(cliBaseline(root, ["--check"]).status, 0);
});

test("baseline: without supported sources the TUI and the CLI give a reason with code 2 and write nothing; a CRLF checkout is current", async (t) => {
  const empty = mkdtempSync(join(tmpdir(), "keylang-tui-baseline-empty-"));
  t.after(() => rmSync(empty, { recursive: true, force: true }));
  // No `languages` and no source file: nothing to analyse, so no snapshot.
  writeFileSync(join(empty, "keylang.json"), `${JSON.stringify({ layers: { app: ["src/app/**"] } })}\n`);
  const before = treeBytes(empty);
  const s = session(empty);
  t.after(() => s.app.close());
  await s.app.idle();
  baselineForm(s.send, "write");
  await s.app.idle();
  const result = s.app.state.records.at(-1)?.result;
  assert.deepEqual([result?.kind, result?.status, result?.exitCode, result?.payload], ["baseline", "failed", 2, null]);
  assert.deepEqual(result?.messages.map((m) => m.text), ["baseline: no supported source files; run `keylang init`"]);
  const cli = cliBaseline(empty);
  assert.equal(cli.status, 2);
  assert.equal(cli.stderr, "keylang: baseline: no supported source files; run `keylang init`\n");
  assert.deepEqual(treeBytes(empty), before);
  // A checkout that turned LF into CRLF holds the same baseline: check is 0 and write keeps the bytes.
  const root = baselineRepo(t);
  assert.equal(cliBaseline(root).status, 0);
  const crlf = readFileSync(join(root, "keylang/rules.baseline.md"), "utf8").replace(/\n/g, "\r\n");
  writeFileSync(join(root, "keylang/rules.baseline.md"), crlf);
  assert.equal(cliBaseline(root, ["--check"]).status, 0);
  const again = cliBaseline(root);
  assert.deepEqual([again.status, again.stdout], [0, ""]);
  assert.equal(readFileSync(join(root, "keylang/rules.baseline.md"), "utf8"), crlf);
});
