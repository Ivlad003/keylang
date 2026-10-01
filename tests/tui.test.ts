// The TUI without a TTY: a session driven by the same bytes a terminal sends,
// its ANSI output applied to a virtual terminal. Covers the gutter and the
// separate evidence channels, reindexing without blocking, hover, jumps,
// navigation, editing with completion and K001 while typing, MERGE by hunks,
// text → spec, and the pure pieces (input decoding, hunks, widths).

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { analyze, findRoot, type Analysis, type AnalysisRequest } from "../src/analyze.ts";
import { formatSource } from "../src/fmt.ts";
import { mapCheckLines, mapStepLines, runOperation, type OperationContext, type OperationRequest, type OperationResult } from "../src/operations.ts";
import { currentBaseline } from "../src/explain-llm.ts";
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
import { HOOK_FLOW, HOOKS } from "./hooks-fixture.ts";
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
  assert.match(screen, /> Init: set up keylang in this repository/);
  assert.match(screen, /  Browse with the guessed configuration/);
  assert.match(screen, /Environment diagnostics/);
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
  s.send(KEY.down);
  s.send(KEY.enter);
  await s.app.idle();
  assert.equal(s.app.state.records.at(-1)?.status, "completed");
  assert.equal(s.app.state.start, 2);
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
  assert.match(s.app.state.message ?? "", /^planned application\.purchase\.refund: planned `application\.purchase\.refund` is not implemented · Enter opens keylang\/features\/refund\.md:3 · g: spec-to-code$/);
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

// ---------- agents: harness integrations (ticket 11) ----------

const PACKAGE_VERSION = (JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../package.json"), "utf8")) as { version: string }).version;

/** The baseline repository with Claude and Codex in use: foreign CRLF text in AGENTS.md and a foreign Claude setting. */
function agentsRepo(t: { after: (f: () => void) => void }): string {
  const dir = baselineRepo(t);
  writeFileSync(join(dir, "AGENTS.md"), "Чужий заголовок\r\n\r\nНе чіпати.\r\n");
  mkdirSync(join(dir, ".claude"));
  writeFileSync(join(dir, ".claude/settings.json"), `${JSON.stringify({ permissions: { allow: ["Bash"] }, theme: "dark" }, null, 2)}\n`);
  mkdirSync(join(dir, ".codex"));
  return dir;
}

/** The palette's agents form: the selection typed as in `--agents` (empty is auto), then the mode. */
function agentsForm(send: (keys: string) => void, selection: string, mode: "write" | "check"): void {
  send(KEY.ctrlP);
  for (const ch of "agents set up") send(ch);
  send(KEY.enter);
  for (const ch of selection) send(ch);
  if (mode === "check") send(KEY.down);
  send(KEY.enter);
}

function agentsRecord(app: App): Extract<OperationResult, { kind: "agents" }> & { payload: NonNullable<Extract<OperationResult, { kind: "agents" }>["payload"]> } {
  const result = app.state.records.at(-1)?.result;
  assert.ok(result?.kind === "agents" && result.payload !== null, JSON.stringify(result?.messages));
  return result as Extract<OperationResult, { kind: "agents" }> & { payload: NonNullable<Extract<OperationResult, { kind: "agents" }>["payload"]> };
}

function cliAgents(root: string, args: string[] = []): { status: number | null; stdout: string; stderr: string } {
  return spawnSync(process.execPath, [BIN, "agents", ...args], { cwd: root, encoding: "utf8" });
}

const stdoutOf = (result: OperationResult): string => result.messages.filter((m) => m.level === "info").map((m) => `${m.text}\n`).join("");

test("tui: agents auto, an explicit list and none write what the CLI writes in a twin; foreign text stays byte for byte; write and check are idempotent", async (t) => {
  const root = agentsRepo(t);
  const twin = agentsRepo(t);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  const before = treeBytes(root);
  // The form resolves the selection on the disk and names what it would change, with the pinned MCP version; nothing runs.
  s.send(KEY.ctrlP);
  for (const ch of "agents: set up or check integrations") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.prompt?.kind, "agents");
  assert.match(s.app.state.prompt?.note ?? "", /^auto: detected claude, codex · changes instructions 2, mcp 2, skill 2, settings 1, hooks 1 · MCP npx -y keylang@/);
  assert.ok(s.app.state.prompt?.note?.includes(`keylang@${PACKAGE_VERSION} mcp`));
  assert.match(s.app.state.prompt?.note ?? "", /does not test the clients/);
  assert.match(s.app.state.prompt?.items[0] ?? "", /^Write 8 file\(s\): AGENTS\.md, CLAUDE\.md, \.mcp\.json, …$/);
  for (const ch of "nope") s.send(ch);
  assert.match(s.app.state.prompt?.note ?? "", /unknown agent `nope`; expected claude, codex, opencode, cursor, or none/);
  s.send(KEY.enter);
  assert.equal(s.app.state.prompt?.kind, "agents", "an invalid selection keeps the form");
  await esc(s.send);
  assert.deepEqual(treeBytes(root), before, "the form writes nothing");
  // Check on auto: code 1 and the CLI's stale lines; nothing written.
  agentsForm(s.send, "", "check");
  await s.app.idle();
  let result = agentsRecord(s.app);
  assert.deepEqual([result.status, result.exitCode, result.payload.choice, result.payload.harnesses], ["completed", 1, "auto", ["claude", "codex"]]);
  const cliCheck = cliAgents(twin, ["--check"]);
  assert.equal(cliCheck.status, 1);
  assert.equal(stdoutOf(result), cliCheck.stdout);
  assert.deepEqual(treeBytes(root), before, "check writes nothing");
  const staleCheck = s.app.state.records.at(-1)!;
  // Write on auto: the CLI's files and bytes, the pinned version, the foreign text kept.
  agentsForm(s.send, "", "write");
  assert.equal(s.app.state.barrier, null);
  await s.app.idle();
  result = agentsRecord(s.app);
  const cliWrite = cliAgents(twin);
  assert.equal(cliWrite.status, 0, cliWrite.stderr);
  assert.deepEqual([result.status, result.exitCode], ["completed", 0]);
  assert.equal(stdoutOf(result), cliWrite.stdout);
  assert.deepEqual(treeBytes(root), treeBytes(twin));
  assert.equal(result.payload.version, PACKAGE_VERSION);
  assert.ok(readFileSync(join(root, "AGENTS.md"), "utf8").startsWith("Чужий заголовок\r\n\r\nНе чіпати.\r\n"));
  const settings = JSON.parse(readFileSync(join(root, ".claude/settings.json"), "utf8")) as { theme: string; permissions: { allow: string[]; deny: string[] } };
  assert.deepEqual([settings.theme, settings.permissions.allow], ["dark", ["Bash"]]);
  assert.match(readFileSync(join(root, ".codex/config.toml"), "utf8"), new RegExp(`keylang@${PACKAGE_VERSION.replace(/\./g, "\\.")}`));
  assert.equal(staleCheck.outdated, "the harness files were written since this run");
  // Idempotent: a second write changes nothing, a check is 0, as the CLI.
  const written = treeBytes(root);
  agentsForm(s.send, "", "write");
  await s.app.idle();
  result = agentsRecord(s.app);
  assert.deepEqual([result.exitCode, result.written, result.payload.steps], [0, [], []]);
  agentsForm(s.send, "", "check");
  await s.app.idle();
  assert.equal(agentsRecord(s.app).exitCode, 0);
  assert.deepEqual(treeBytes(root), written);
  assert.equal(cliAgents(root, ["--check"]).status, 0);
  // An explicit list: the named harness only, as `--agents=cursor`.
  agentsForm(s.send, "cursor", "write");
  await s.app.idle();
  result = agentsRecord(s.app);
  const cliCursor = cliAgents(twin, ["--agents=cursor"]);
  assert.equal(cliCursor.status, 0, cliCursor.stderr);
  assert.deepEqual([result.exitCode, result.payload.choice, result.payload.harnesses], [0, "list", ["cursor"]]);
  assert.equal(stdoutOf(result), cliCursor.stdout);
  assert.deepEqual(treeBytes(root), treeBytes(twin));
  assert.deepEqual((JSON.parse(readFileSync(join(root, ".cursor/mcp.json"), "utf8")) as { mcpServers: { keylang: { args: string[] } } }).mcpServers.keylang.args, ["-y", `keylang@${PACKAGE_VERSION}`, "mcp"]);
  // None: keylang's harness files are stripped as the CLI strips them; the foreign text and setting stay.
  agentsForm(s.send, "none", "write");
  await s.app.idle();
  result = agentsRecord(s.app);
  const cliNone = cliAgents(twin, ["--agents=none"]);
  assert.equal(cliNone.status, 0, cliNone.stderr);
  assert.deepEqual([result.exitCode, result.payload.choice], [0, "none"]);
  assert.equal(stdoutOf(result), cliNone.stdout);
  assert.ok(result.removed.length > 0);
  assert.deepEqual(treeBytes(root), treeBytes(twin));
  assert.ok(readFileSync(join(root, "AGENTS.md"), "utf8").startsWith("Чужий заголовок\r\n\r\nНе чіпати.\r\n"));
  assert.doesNotMatch(readFileSync(join(root, "AGENTS.md"), "utf8"), /keylang:begin/);
  assert.equal(existsSync(join(root, ".agents/skills/keylang-feature/SKILL.md")), false);
  assert.equal((JSON.parse(readFileSync(join(root, ".claude/settings.json"), "utf8")) as { theme: string }).theme, "dark");
  agentsForm(s.send, "none", "check");
  await s.app.idle();
  assert.equal(agentsRecord(s.app).exitCode, 0);
  assert.equal(cliAgents(root, ["--agents=none", "--check"]).status, 0);
  s.send(KEY.f6);
  assert.match(s.text(), /Agents: set up or check integrations · write · none/);
  assert.match(s.text(), /Files only: no client is started or tested\./);
});

test("tui: invalid JSON blocks every write of the plan; an outside edit before the commit is refused; an I/O error names what landed", async (t) => {
  const root = agentsRepo(t);
  writeFileSync(join(root, ".mcp.json"), "{ broken");
  let pause: () => void = () => {};
  const s = session(root, { operations: pausedRunner(() => pause()) });
  t.after(() => s.app.close());
  await s.app.idle();
  // Malformed JSON: code 2 naming the file; AGENTS.md, first in the plan, is not written either.
  let before = treeBytes(root);
  agentsForm(s.send, "", "write");
  await s.app.idle();
  let result = agentsRecord(s.app);
  assert.deepEqual([result.status, result.exitCode, result.payload.error?.file, result.written], ["failed", 2, ".mcp.json", []]);
  assert.deepEqual(treeBytes(root), before);
  const cli = cliAgents(root);
  assert.equal(cli.status, 2);
  assert.equal(cli.stderr, `keylang: ${result.messages[0]!.text}\n`);
  assert.match(cli.stderr, /^keylang: \.mcp\.json: invalid JSON/);
  assert.deepEqual(treeBytes(root), before);
  s.send(KEY.f6);
  assert.match(s.text(), /\.mcp\.json is broken, nothing written · code 2/);
  s.send(KEY.f6);
  // An outside edit of AGENTS.md while the plan waits for the commit: refused, its bytes stay, nothing else written.
  writeFileSync(join(root, ".mcp.json"), "{}\n");
  const outside = "Хтось інший\n";
  pause = () => writeFileSync(join(root, "AGENTS.md"), outside);
  before = treeBytes(root);
  agentsForm(s.send, "", "write");
  await s.app.idle();
  result = agentsRecord(s.app);
  assert.deepEqual([result.status, result.exitCode, result.written], ["failed", 1, []]);
  assert.deepEqual(result.payload.refused, ["AGENTS.md: changed on disk while the integrations were planned; nothing written"]);
  assert.deepEqual(treeBytes(root), new Map([...before, ["AGENTS.md", Buffer.from(outside).toString("latin1")]]));
  // A harness that appears meanwhile changes what auto means: refused as well.
  pause = () => mkdirSync(join(root, ".cursor"));
  before = treeBytes(root);
  agentsForm(s.send, "", "write");
  await s.app.idle();
  result = agentsRecord(s.app);
  assert.deepEqual([result.status, result.exitCode], ["failed", 1]);
  assert.deepEqual(result.payload.refused, ["auto: the detected harnesses changed (claude, codex → claude, codex, cursor); nothing written"]);
  assert.deepEqual(treeBytes(root), new Map([...before, [".cursor/", ""]]));
  // A file where the skill directory must be: the steps before it land, it fails, the rest are not attempted; code 2.
  rmSync(join(root, ".cursor"), { recursive: true });
  pause = () => {};
  writeFileSync(join(root, ".agents"), "not a directory\n");
  agentsForm(s.send, "", "write");
  await s.app.idle();
  result = agentsRecord(s.app);
  assert.deepEqual([result.status, result.exitCode], ["failed", 2]);
  const states = result.payload.steps.map((step) => `${step.state} ${step.path}`);
  const failed = states.indexOf("failed .agents/skills/keylang-feature/SKILL.md");
  assert.ok(failed > 0, states.join("\n"));
  assert.ok(states.slice(0, failed).every((line) => line.startsWith("completed ")), states.join("\n"));
  assert.ok(states.slice(failed + 1).every((line) => line.startsWith("not-attempted ")) && states.length > failed + 1, states.join("\n"));
  assert.deepEqual(result.written, result.payload.steps.slice(0, failed).map((step) => step.path));
  assert.equal(existsSync(join(root, ".claude/skills/keylang-feature/SKILL.md")), false);
  assert.ok(readFileSync(join(root, "AGENTS.md"), "utf8").includes("<!-- keylang:begin -->"));
  s.send(KEY.f6);
  assert.match(s.text(), /step\(s\) done, failed · code 2/);
  assert.match(s.text(), /not written +skill +\.claude\/skills\/keylang-feature\/SKILL\.md/);
});

// ---------- fmt: format or check specifications (ticket 13) ----------

const MESSY = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures/fmt/messy.md"), "utf8");
const MESSY_EXPECTED = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures/fmt/messy.expected"), "utf8");
const INDENT = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures/diagnostics/indent.md"), "utf8");

/** The palette's fmt form; `paths` replaces the default text when given, then the mode. */
function fmtForm(send: (keys: string) => void, app: App, mode: "write" | "check", paths?: string): void {
  send(KEY.ctrlP);
  for (const ch of "format: write or check") send(ch);
  send(KEY.enter);
  if (paths !== undefined) {
    for (const _ of app.state.prompt!.text) send("\x7f");
    for (const ch of paths) send(ch);
  }
  if (mode === "check") send(KEY.down);
  send(KEY.enter);
}

function fmtRecord(app: App): Extract<OperationResult, { kind: "fmt" }> & { payload: NonNullable<Extract<OperationResult, { kind: "fmt" }>["payload"]> } {
  const result = app.state.records.at(-1)?.result;
  assert.ok(result?.kind === "fmt" && result.payload !== null, JSON.stringify(result?.messages));
  return result as Extract<OperationResult, { kind: "fmt" }> & { payload: NonNullable<Extract<OperationResult, { kind: "fmt" }>["payload"]> };
}

function cliFmt(root: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  return spawnSync(process.execPath, [BIN, "fmt", ...args], { cwd: root, encoding: "utf8" });
}

/** What the CLI would print for the same result: stdout lines, stderr lines. */
const fmtStreams = (result: OperationResult): { stdout: string; stderr: string } => ({
  stdout: result.messages.filter((m) => m.level === "info").map((m) => `${m.text}\n`).join(""),
  stderr: result.messages.filter((m) => m.level === "error").map((m) => `${m.text}\n`).join(""),
});

test("tui: fmt of the current spec writes the CLI's bytes and is idempotent; check is 1 and writes nothing; the clean buffer follows", async (t) => {
  const file = "keylang/notes/messy.md";
  const root = checkoutRepo(t, { [file]: MESSY });
  const twin = checkoutRepo(t, { [file]: MESSY });
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.ctrlP);
  for (const ch of `open ${file}`) s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.current, file);
  // The cursor on the last line of the messy text: the formatted text is shorter.
  s.app.state.cursor.line = MESSY.split("\n").length - 2;
  // The form defaults to the current spec and shows the real set and both modes.
  s.send(KEY.ctrlP);
  for (const ch of "keylang fmt") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.prompt?.kind, "fmt");
  assert.equal(s.app.state.prompt?.text, file);
  assert.deepEqual(s.app.state.prompt?.items, ["Write: format 1 file(s)", "Check 1 file(s) (writes nothing)"]);
  assert.match(promptNote(s.app), new RegExp(`^${file} · saved explanations are skipped`));
  // A directory only when typed: the note lists what it expands to.
  for (const _ of file) s.send("\x7f");
  for (const ch of "keylang") s.send(ch);
  assert.match(promptNote(s.app), /^keylang\/flows\/checkout\.md, keylang\/notes\/messy\.md, keylang\/rules\.md/);
  for (const ch of "/nope") s.send(ch);
  assert.match(promptNote(s.app), /keylang\/nope: not found/);
  await esc(s.send);
  assert.equal(s.app.state.records.length, 0);
  const before = treeBytes(root);
  // Check: code 1 and the CLI's line; nothing is written.
  fmtForm(s.send, s.app, "check");
  await s.app.idle();
  let result = fmtRecord(s.app);
  assert.deepEqual([result.status, result.exitCode, result.written], ["completed", 1, []]);
  const cliCheck = cliFmt(twin, ["--check", file]);
  assert.equal(cliCheck.status, 1);
  assert.deepEqual(fmtStreams(result), { stdout: cliCheck.stdout, stderr: cliCheck.stderr });
  assert.deepEqual(treeBytes(root), before, "check writes nothing");
  const staleCheck = s.app.state.records.at(-1)!;
  // Write: the CLI's bytes and lines; only the file changes.
  fmtForm(s.send, s.app, "write");
  assert.equal(s.app.state.barrier, null, "nothing unsaved, no step");
  await s.app.idle();
  result = fmtRecord(s.app);
  assert.deepEqual([result.status, result.exitCode, result.written], ["completed", 0, [file]]);
  const cliWrite = cliFmt(twin, [file]);
  assert.equal(cliWrite.status, 0, cliWrite.stderr);
  assert.deepEqual(fmtStreams(result), { stdout: cliWrite.stdout, stderr: cliWrite.stderr });
  const formatted = readFileSync(join(root, file), "utf8");
  assert.equal(formatted, readFileSync(join(twin, file), "utf8"));
  assert.equal(formatted, MESSY_EXPECTED);
  assert.deepEqual(treeBytes(root), new Map([...before, [file, Buffer.from(formatted).toString("latin1")]]));
  assert.equal(staleCheck.outdated, "the files were formatted since this run");
  const buffer = s.app.state.buffers.get(file)!;
  assert.equal(buffer.text, formatted, "the clean buffer follows the disk");
  assert.equal(isDirtyBuffer(s.app, file), false);
  assert.ok(s.app.state.cursor.line < formatted.split("\n").length, "the cursor stays in range");
  // Idempotent: a second write and a check change nothing and return 0, as the CLI does.
  fmtForm(s.send, s.app, "write");
  await s.app.idle();
  result = fmtRecord(s.app);
  assert.deepEqual([result.exitCode, result.written, result.payload.files.map((f) => f.state)], [0, [], ["current"]]);
  fmtForm(s.send, s.app, "check");
  await s.app.idle();
  assert.equal(fmtRecord(s.app).exitCode, 0);
  assert.equal(cliFmt(root, ["--check", file]).status, 0);
  assert.equal(readFileSync(join(root, file), "utf8"), formatted);
  s.send(KEY.f6);
  assert.match(s.text(), /Format: write or check specifications · check · keylang\/notes\/messy\.md/);
  assert.match(s.text(), /Fmt check · read-only, nothing written · 1 file\(s\)/);
  assert.match(s.text(), /1 file\(s\) canonical · code 0/);
  assert.match(s.text(), /canonical +keylang\/notes\/messy\.md/);
});

function isDirtyBuffer(app: App, path: string): boolean {
  const buffer = app.state.buffers.get(path)!;
  return buffer.text !== buffer.saved;
}

test("tui: fmt over a directory with valid, invalid, unreadable, CRLF and explanation files gives the CLI's lines and code 2; the valid ones are written", { skip: process.getuid?.() === 0 ? "root reads unreadable files" : false }, async (t) => {
  const crlf = "# rules  \r\n\r\n- layers   domain < infrastructure < application < presentation  <!-- порядок 𝒳 -->\r\n";
  const explanation = "<!-- keylang:explain agent=mock date=2026-09-30 closure=abc lang=en detail=short -->\n*  not   keylang  *\n";
  const specs = { "keylang/notes/a-messy.md": MESSY, "keylang/notes/b-indent.md": INDENT, "keylang/notes/c-locked.md": MESSY, "keylang/notes/d-crlf.md": crlf, "keylang/explain/x.md": explanation };
  const root = checkoutRepo(t, specs);
  const twin = checkoutRepo(t, specs);
  for (const dir of [root, twin]) chmodSync(join(dir, "keylang/notes/c-locked.md"), 0o000);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  // A clean CRLF buffer takes the LF bytes fmt writes, so a later save keeps them.
  s.send(KEY.ctrlP);
  for (const ch of "open keylang/notes/d-crlf.md") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.buffers.get("keylang/notes/d-crlf.md")?.eol, "\r\n");
  fmtForm(s.send, s.app, "write", "keylang");
  await s.app.idle();
  const result = fmtRecord(s.app);
  const cli = cliFmt(twin, ["keylang"]);
  assert.deepEqual([result.status, result.exitCode, cli.status], ["failed", 2, 2]);
  const streams = fmtStreams(result);
  assert.equal(streams.stdout, cli.stdout);
  assert.equal(streams.stderr.split(root).join("<root>"), cli.stderr.split(twin).join("<root>"));
  assert.match(cli.stderr, /^keylang\/notes\/b-indent\.md:\d+:\d+: K003 /m);
  assert.match(cli.stderr, /^keylang\/notes\/c-locked\.md: cannot read: EACCES/m);
  assert.equal(cli.stdout, "keylang/notes/a-messy.md: formatted\nkeylang/notes/d-crlf.md: formatted\n");
  const states = Object.fromEntries(result.payload.files.map((f) => [f.path, f.state]));
  assert.equal(states["keylang/notes/a-messy.md"], "formatted");
  assert.equal(states["keylang/notes/b-indent.md"], "invalid");
  assert.equal(states["keylang/notes/c-locked.md"], "unreadable");
  assert.equal(states["keylang/notes/d-crlf.md"], "formatted");
  assert.equal(states["keylang/explain/x.md"], "explanation");
  assert.deepEqual(result.written, ["keylang/notes/a-messy.md", "keylang/notes/d-crlf.md"], "the failures do not hide the written files");
  // The bytes are the CLI's: CRLF becomes LF, Unicode stays; invalid and explanation files are untouched.
  for (const path of ["keylang/notes/a-messy.md", "keylang/notes/d-crlf.md", "keylang/notes/b-indent.md", "keylang/explain/x.md"]) {
    assert.equal(readFileSync(join(root, path), "utf8"), readFileSync(join(twin, path), "utf8"), path);
  }
  const crlfOut = readFileSync(join(root, "keylang/notes/d-crlf.md"), "utf8");
  assert.ok(!crlfOut.includes("\r") && crlfOut.includes("порядок 𝒳"), crlfOut);
  const crlfBuffer = s.app.state.buffers.get("keylang/notes/d-crlf.md")!;
  assert.deepEqual([crlfBuffer.text, crlfBuffer.eol, crlfBuffer.saved], [crlfOut, "\n", crlfOut]);
  assert.equal(readFileSync(join(root, "keylang/explain/x.md"), "utf8"), explanation);
  assert.equal(readFileSync(join(root, "keylang/notes/b-indent.md"), "utf8"), INDENT);
  // A repeat: nothing more to write, the same failures; check writes nothing.
  const locked = join(root, "keylang/notes/c-locked.md");
  const readable = (): Map<string, string> => {
    chmodSync(locked, 0o644);
    const bytes = treeBytes(root);
    chmodSync(locked, 0o000);
    return bytes;
  };
  const before = readable();
  fmtForm(s.send, s.app, "check", "keylang");
  await s.app.idle();
  const again = fmtRecord(s.app);
  assert.deepEqual([again.exitCode, again.written], [2, []]);
  assert.equal(fmtStreams(again).stdout, "");
  assert.deepEqual(readable(), before);
  s.send(KEY.f6);
  const text = s.text();
  assert.match(text, /invalid +keylang\/notes\/b-indent\.md/);
  assert.match(text, /skipped +keylang\/explain\/x\.md: a saved explanation/);
  assert.match(text, /unreadable +keylang\/notes\/c-locked\.md: EACCES/);
});

test("tui: fmt saves the chosen dirty buffer first (Back writes nothing), leaves other dirty buffers, and never writes over a file changed before the commit", async (t) => {
  const file = "keylang/notes/messy.md";
  const other = "keylang/notes/other.md";
  const root = checkoutRepo(t, { [file]: MESSY, [other]: MESSY });
  let pause: () => void = () => {};
  const s = session(root, { operations: pausedRunner(() => pause()) });
  t.after(() => s.app.close());
  await s.app.idle();
  // Dirty edits in both files; fmt chooses only the first.
  for (const path of [other, file]) {
    s.send(KEY.ctrlP);
    for (const ch of `open ${path}`) s.send(ch);
    s.send(KEY.enter);
    s.send("i");
    s.send("*");
    await esc(s.send);
  }
  assert.equal(s.app.state.current, file);
  const before = treeBytes(root);
  fmtForm(s.send, s.app, "write");
  assert.deepEqual(s.app.state.barrier?.files, [file], "only the chosen file is saved first");
  await esc(s.send);
  assert.deepEqual(treeBytes(root), before, "Back writes nothing");
  assert.equal(s.app.state.records.length, 0);
  // Save and continue: the typed text is saved, then formatted from those bytes; the other buffer stays dirty.
  const typed = s.app.state.buffers.get(file)!.text;
  fmtForm(s.send, s.app, "write");
  s.send(KEY.enter);
  await s.app.idle();
  let result = fmtRecord(s.app);
  assert.deepEqual([result.status, result.exitCode, result.written], ["completed", 0, [file]]);
  const expected = formatSource(file, typed);
  assert.ok(expected.ok);
  assert.equal(readFileSync(join(root, file), "utf8"), expected.text);
  assert.equal(s.app.state.buffers.get(file)!.text, expected.text);
  assert.equal(readFileSync(join(root, other), "utf8"), MESSY, "the other dirty file is not saved or formatted");
  assert.equal(isDirtyBuffer(s.app, other), true);
  // Both files on disk, one changed from outside while the plan waits: that one is refused, the other written; code 2.
  const outside = `${MESSY}\n- outside\n`;
  writeFileSync(join(root, file), MESSY);
  const otherTyped = s.app.state.buffers.get(other)!.text;
  pause = () => writeFileSync(join(root, file), outside);
  fmtForm(s.send, s.app, "write", "keylang/notes");
  assert.deepEqual(s.app.state.barrier?.files, [other], "the directory's dirty buffer is saved first");
  s.send(KEY.enter);
  await s.app.idle();
  result = fmtRecord(s.app);
  assert.deepEqual([result.status, result.exitCode, result.written], ["failed", 2, [other]]);
  assert.equal(readFileSync(join(root, file), "utf8"), outside, "the outside bytes stay");
  const otherExpected = formatSource(other, otherTyped);
  assert.ok(otherExpected.ok);
  assert.equal(readFileSync(join(root, other), "utf8"), otherExpected.text);
  assert.deepEqual(fmtStreams(result).stderr, `${file}: cannot write: changed on disk while it was formatted; nothing written\n`);
  s.send(KEY.f6);
  assert.match(s.text(), /1 formatted, 1 not written · code 2/);
  assert.match(s.text(), /not written +keylang\/notes\/messy\.md: changed on disk/);
});

// ---------- wire ----------

const WIRING_SHOP = join(dirname(fileURLToPath(import.meta.url)), "fixtures/wiring-shop");

function wireRepo(t: { after: (f: () => void) => void }): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-tui-wire-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(WIRING_SHOP, dir, { recursive: true });
  return dir;
}

/** The palette's wire form, the output path replaced when given, then the mode: `write` (the first item) or `check`. */
function wireForm(send: (keys: string) => void, app: App, mode: "write" | "check", out?: string): void {
  send(KEY.ctrlP);
  for (const ch of "wire: generate or check") send(ch);
  send(KEY.enter);
  assert.equal(app.state.prompt?.kind, "wire");
  if (out !== undefined) {
    for (const _ of app.state.prompt!.text) send("\x7f");
    for (const ch of out) send(ch);
  }
  if (mode === "check") send(KEY.down);
  send(KEY.enter);
}

function wireRecord(app: App): Extract<OperationResult, { kind: "wire" }> & { payload: NonNullable<Extract<OperationResult, { kind: "wire" }>["payload"]> } {
  const result = app.state.records.at(-1)?.result;
  assert.ok(result?.kind === "wire" && result.payload !== null, JSON.stringify(result?.messages));
  return result as Extract<OperationResult, { kind: "wire" }> & { payload: NonNullable<Extract<OperationResult, { kind: "wire" }>["payload"]> };
}

function cliWire(root: string, args: string[] = []): { status: number | null; stdout: string; stderr: string } {
  return spawnSync(process.execPath, [BIN, "wire", ...args], { cwd: root, encoding: "utf8" });
}

/** The CLI's two streams for a result: `info` to stdout, the rest to stderr. */
function wireStreams(result: OperationResult): { stdout: string; stderr: string } {
  const lines = (level: (l: string) => boolean): string => result.messages.filter((m) => level(m.level)).map((m) => `${m.text}\n`).join("");
  return { stdout: lines((l) => l === "info"), stderr: lines((l) => l !== "info") };
}

test("tui: wire write and check give the CLI's bytes, lines and codes; check writes nothing, not even a directory; the code opens read-only", async (t) => {
  const root = wireRepo(t);
  const twin = wireRepo(t);
  const out = "keylang.gen.ts";
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  const before = treeBytes(root);
  s.send(KEY.f5);
  await s.app.idle();
  assert.deepEqual(treeBytes(root), before, "F5 writes nothing");
  // The alias finds it; the form starts at the CLI's default file and names both modes.
  s.send(KEY.ctrlP);
  for (const ch of "keylang wire") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.prompt?.kind, "wire");
  assert.equal(s.app.state.prompt?.text, out);
  assert.deepEqual(s.app.state.prompt?.items, [`Write ${out}`, `Check ${out} (writes nothing)`]);
  assert.match(s.app.state.prompt?.note ?? "", /not on disk yet · never compiled or run/);
  await esc(s.send);
  // Check on a missing file: code 1 and the CLI's line; nothing written.
  wireForm(s.send, s.app, "check");
  await s.app.idle();
  let result = wireRecord(s.app);
  assert.deepEqual([result.status, result.exitCode, result.payload.state, result.written], ["completed", 1, "stale", []]);
  const cliMissing = cliWire(twin, ["--check"]);
  assert.equal(cliMissing.status, 1);
  assert.deepEqual(wireStreams(result), { stdout: cliMissing.stdout, stderr: cliMissing.stderr });
  // A check into a missing directory creates none of it.
  wireForm(s.send, s.app, "check", "gen/wiring/keylang.gen.ts");
  await s.app.idle();
  assert.deepEqual([wireRecord(s.app).exitCode, wireRecord(s.app).payload.state], [1, "stale"]);
  assert.deepEqual(treeBytes(root), before, "check writes nothing");
  assert.equal(existsSync(join(root, "gen")), false, "not even the parent directory");
  // Write: no extra step without dirty buffers; the same bytes and line as the CLI.
  wireForm(s.send, s.app, "write");
  assert.equal(s.app.state.barrier, null);
  // The worker runs it: the record is running and the keys still work.
  assert.equal(s.app.state.records.at(-1)?.status, "running");
  s.send(KEY.ctrlP);
  assert.equal(s.app.state.prompt?.kind, "palette");
  await esc(s.send);
  await s.app.idle();
  result = wireRecord(s.app);
  assert.deepEqual([result.status, result.exitCode, result.written], ["completed", 0, [out]]);
  const cliWrite = cliWire(twin);
  assert.equal(cliWrite.status, 0, cliWrite.stderr);
  assert.deepEqual(wireStreams(result), { stdout: cliWrite.stdout, stderr: cliWrite.stderr });
  const text = readFileSync(join(root, out), "utf8");
  assert.equal(text, readFileSync(join(twin, out), "utf8"));
  assert.match(text, /^\/\/ keylang:generated/);
  assert.deepEqual(treeBytes(root), new Map([...before, [out, Buffer.from(text).toString("latin1")]]), "only the generated file is written");
  const staleCheck = s.app.state.records.at(-3)!;
  assert.equal(staleCheck.outdated, "the wiring was written since this run");
  // Idempotent: a second write and a check are 0 with nothing written, as the CLI.
  wireForm(s.send, s.app, "write");
  await s.app.idle();
  result = wireRecord(s.app);
  assert.deepEqual([result.exitCode, result.written, result.messages, result.payload.state], [0, [], [], "current"]);
  wireForm(s.send, s.app, "check");
  await s.app.idle();
  assert.equal(wireRecord(s.app).exitCode, 0);
  assert.equal(cliWire(root, ["--check"]).status, 0);
  // A CRLF checkout of the same file is current, as for the CLI.
  writeFileSync(join(root, out), text.replace(/\n/g, "\r\n"));
  wireForm(s.send, s.app, "check");
  await s.app.idle();
  assert.equal(wireRecord(s.app).exitCode, 0);
  writeFileSync(join(root, out), text);
  // F6: the report, then Tab and Enter show the generated code in the read-only viewer — no buffer is opened for it.
  s.send(KEY.f6);
  assert.match(s.text(), /Wire: generate or check · check · keylang\.gen\.ts {2}completed · code 0/);
  assert.match(s.text(), /Wire check · read-only, nothing written · keylang\.gen\.ts/);
  assert.match(s.text(), /up to date · code 0/);
  s.send(KEY.tab);
  s.send(KEY.enter);
  assert.equal(s.app.state.mode, "code");
  assert.equal(s.app.state.code?.file, out);
  assert.equal(s.app.state.code?.lines[0], text.split("\n")[0]);
  assert.equal(s.app.state.buffers.has(out), false, "the generated code is not a writable buffer");
  s.send("i");
  assert.equal(s.app.state.mode, "code");
  await esc(s.send);
  assert.equal(s.app.state.results.viewing, false);
  assert.equal(readFileSync(join(root, out), "utf8"), text);
});

test("tui: a wiring error, a manual file, a path out of the repository or through a link out are refused with the CLI's diagnostics and codes; nothing is written", async (t) => {
  const root = wireRepo(t);
  const outside = mkdtempSync(join(tmpdir(), "keylang-wire-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  const wiring = join(root, "keylang/wiring.md");
  const good = readFileSync(wiring, "utf8");
  writeFileSync(wiring, good.replace("  - store domain.store.Store", "   - store domain.store.Store").replace("- wire domain.store.Store", "- wire app.purchase"));
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  let before = treeBytes(root);
  // An error on a `# wiring` line: the CLI's diagnostics and summary, code 1, no file — in both modes.
  for (const mode of ["write", "check"] as const) {
    wireForm(s.send, s.app, mode);
    await s.app.idle();
    const result = wireRecord(s.app);
    assert.deepEqual([result.status, result.exitCode, result.payload.state, result.written], ["completed", 1, "blocked", []]);
    const cli = cliWire(root, mode === "check" ? ["--check"] : []);
    assert.equal(cli.status, 1);
    assert.deepEqual(wireStreams(result), { stdout: cli.stdout, stderr: cli.stderr });
    assert.match(cli.stdout, /wiring\.md:4:4: K003 indentation must be a multiple of 2 spaces/);
    assert.match(cli.stdout, /K302 wire `app\.purchase` is a module/);
  }
  assert.deepEqual(treeBytes(root), before, "no generated file");
  // F6 → Tab → Enter opens the first error in the spec.
  s.send(KEY.f6);
  assert.match(s.text(), /2 error\(s\) in wiring, nothing written · code 1/);
  s.send(KEY.tab);
  s.send(KEY.enter);
  assert.equal(s.app.state.current, "keylang/wiring.md");
  assert.equal(s.app.state.cursor.line, 3);
  await esc(s.send);
  s.send(KEY.f6);
  // A manual file on the target: code 1, its bytes stay, as the CLI.
  writeFileSync(wiring, good);
  writeFileSync(join(root, "keylang.gen.ts"), "export const mine = 1;\n");
  before = treeBytes(root);
  wireForm(s.send, s.app, "write");
  await s.app.idle();
  const manual = wireRecord(s.app);
  assert.deepEqual([manual.exitCode, manual.payload.state, manual.written], [1, "manual", []]);
  const cliManual = cliWire(root);
  assert.equal(cliManual.status, 1);
  assert.deepEqual(wireStreams(manual), { stdout: cliManual.stdout, stderr: cliManual.stderr });
  assert.deepEqual(treeBytes(root), before, "a manual file is never written over");
  // Paths out of the repository, through a link out, or not TypeScript: the form refuses them; the operation gives the CLI's code 2 before reading anything.
  const records = s.app.state.records.length;
  // The link exists only for these cases: the tree snapshot does not follow links.
  symlinkSync(outside, join(root, "gen-link"));
  const cases: [string, RegExp][] = [
    [`../${root.split("/").at(-1)}-escape.ts`, /not a plain relative path/],
    ["gen-link/linked.ts", /leads out of the repository through a link/],
    ["gen/wire.js", /must name a TypeScript file/],
  ];
  for (const [out, why] of cases) {
    wireForm(s.send, s.app, "write", out);
    assert.match(s.app.state.prompt?.note ?? "", why);
    assert.match(s.app.state.message ?? "", why);
    await esc(s.send);
    for (const check of [false, true]) {
      const result = await runOperation({ kind: "wire", root, out, check });
      assert.deepEqual([result.status, result.exitCode, result.payload], ["failed", 2, null]);
      const cli = cliWire(root, [...(check ? ["--check"] : []), "--out", out]);
      assert.equal(cli.status, 2);
      assert.equal(cli.stderr, `keylang: ${result.messages[0]!.text}\n`);
      assert.match(cli.stderr, why);
    }
  }
  assert.equal(s.app.state.records.length, records, "a refused path starts nothing");
  assert.deepEqual(readdirSync(outside), [], "nothing lands outside");
  rmSync(join(root, "gen-link"));
  assert.deepEqual(treeBytes(root), before);
});

test("tui: a spec or the target changed between the computation and the write refuses the stale container; a rerun writes it; dirty wiring is saved first", async (t) => {
  const root = wireRepo(t);
  const out = "keylang.gen.ts";
  const wiring = join(root, "keylang/wiring.md");
  const good = readFileSync(wiring, "utf8");
  const edited = good.replace("    - compose infra.logged.logged\n", "");
  const planted = "// keylang:generated — не редагувати, `keylang wire`\nexport const planted = 1;\n";
  const pauses: (() => void)[] = [() => writeFileSync(wiring, edited), () => writeFileSync(join(root, out), planted), () => {}, () => {}];
  let calls = 0;
  const s = session(root, { operations: pausedRunner(() => pauses[calls++]!()) });
  t.after(() => s.app.close());
  await s.app.idle();
  // The wiring changes during the pause: refused with code 1, no file; the reason names the spec.
  wireForm(s.send, s.app, "write");
  await s.app.idle();
  let result = wireRecord(s.app);
  assert.deepEqual([result.status, result.exitCode, result.written], ["failed", 1, []]);
  assert.deepEqual(result.payload.refused, ["keylang/wiring.md: changed on disk while the wiring was computed"]);
  assert.equal(existsSync(join(root, out)), false);
  // The target is created during the pause: refused, its bytes stay.
  wireForm(s.send, s.app, "write");
  await s.app.idle();
  result = wireRecord(s.app);
  assert.deepEqual([result.status, result.exitCode], ["failed", 1]);
  assert.deepEqual(result.payload.refused, [`${out}: created on disk while the change was prepared; nothing written`]);
  assert.equal(readFileSync(join(root, out), "utf8"), planted);
  s.send(KEY.f6);
  assert.match(s.text(), /inputs changed, nothing written · code 1/);
  // Enter on the entry reruns it from the files on disk: the CLI's bytes for the edited wiring.
  s.send(KEY.enter);
  await s.app.idle();
  result = wireRecord(s.app);
  assert.deepEqual([result.status, result.exitCode, result.written], ["completed", 0, [out]]);
  assert.equal(cliWire(root, ["--check"]).status, 0);
  assert.doesNotMatch(readFileSync(join(root, out), "utf8"), /logged/);
  s.send(KEY.f6);
  // A dirty wiring buffer opens the save step naming the target; Back writes nothing; Save and continue generates from the saved text.
  s.send(KEY.ctrlP);
  for (const ch of "open keylang/wiring.md") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.current, "keylang/wiring.md");
  s.send("i");
  s.send(KEY.end);
  for (const ch of " <!-- saved first -->") s.send(ch);
  await esc(s.send);
  const generated = readFileSync(join(root, out), "utf8");
  wireForm(s.send, s.app, "write");
  assert.deepEqual(s.app.state.barrier?.writes, [out]);
  assert.deepEqual(s.app.state.barrier?.files, ["keylang/wiring.md"]);
  await esc(s.send);
  assert.equal(readFileSync(join(root, out), "utf8"), generated);
  wireForm(s.send, s.app, "write");
  s.send(KEY.enter);
  await s.app.idle();
  result = wireRecord(s.app);
  assert.equal(result.exitCode, 0, JSON.stringify(result.messages));
  assert.match(readFileSync(wiring, "utf8"), /^# wiring <!-- saved first -->\n/);
  assert.equal(s.app.state.buffers.get("keylang/wiring.md")!.text, s.app.state.buffers.get("keylang/wiring.md")!.saved);
  assert.equal(cliWire(root, ["--check"]).status, 0);
});

// ---------- full check: paths, strict, static ----------

const LEFT = "\x1b[D";

function cliCheck(root: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  return spawnSync(process.execPath, [BIN, "check", ...args], { cwd: root, encoding: "utf8" });
}

/**
 * The palette's full check: the form, then its paths replaced by `paths`
 * (null keeps the default), strict and the static mode set with ←→ on their
 * rows, then Enter on the run row.
 */
function checkForm(app: App, send: (keys: string) => void, options: { paths?: string; strict?: boolean; static?: "config" | "behavior" | "shape"; changed?: boolean; since?: string } = {}): void {
  send(KEY.ctrlP);
  for (const ch of "keylang check") send(ch);
  send(KEY.enter);
  assert.equal(app.state.prompt?.kind, "full-check");
  if (options.paths !== undefined) {
    for (const _ of app.state.prompt!.text) send("\x7f");
    for (const ch of options.paths) send(ch);
  }
  // The rows: strict, static, changed, since, run (selected first).
  for (let i = 0; i < 4; i++) send(KEY.up);
  if (options.strict) send(KEY.right);
  send(KEY.down);
  const steps = { config: 0, behavior: 1, shape: 2 }[options.static ?? "config"];
  for (let i = 0; i < steps; i++) send(KEY.right);
  send(KEY.down);
  if (options.changed) send(KEY.right);
  send(KEY.down);
  if (options.since !== undefined) {
    for (const _ of app.state.prompt!.checkOptions!.since) send("\x7f");
    for (const ch of options.since) send(ch);
  }
  send(KEY.down);
  send(KEY.enter);
}

function checkPayload(record: App["state"]["records"][number] | undefined): NonNullable<Extract<OperationResult, { kind: "check" }>["payload"]> {
  const result = record?.result;
  assert.ok(result?.kind === "check" && result.payload !== null, JSON.stringify(result?.messages));
  return result.payload;
}

/** What `keylang check --format json` prints, from a record's payload. */
function checkJson(record: App["state"]["records"][number] | undefined): unknown {
  const payload = checkPayload(record);
  return { snapshotId: payload.snapshotId, results: payload.results, coverage: payload.coverage };
}

test("tui: full check and strict give the CLI's codes on the same evidence; the format changes no verdict; nothing is written; the current analysis stays apart", async (t) => {
  const root = checkoutRepo(t);
  let quit = 0;
  const vt = new VirtualTerminal(110, 30);
  const app = new App({ root, cols: 110, rows: 30, onQuit: () => quit++ });
  app.attach({ kind: "terminal", write: (ansi) => vt.feed(ansi) }, 110, 30);
  t.after(() => app.close());
  const send = (keys: string): void => app.input(keys);
  await app.idle();
  const analysis = app.state.analysis;
  const findings = findingsOf(analysis);
  const before = treeBytes(root);
  // The form: the spec directory, not strict, the static mode of keylang.json (the default here).
  send(KEY.ctrlP);
  for (const ch of "keylang check") send(ch);
  send(KEY.enter);
  assert.equal(app.state.prompt?.text, "keylang");
  assert.deepEqual(app.state.prompt?.items, [
    "strict: off · unverified stays visible; code 0 unless something fails",
    "static: behavior, the default",
    "changed: off · every finding of the paths; git is not read",
    "since: HEAD · used with changed on",
    "Run the check (writes nothing)",
  ]);
  assert.match(promptNote(app), /^2 spec file\(s\) · ←→ change the selected option$/);
  await esc(send);
  checkForm(app, send);
  await app.idle();
  const normal = app.state.records.at(-1)!;
  assert.deepEqual([normal.status, normal.result!.exitCode, normal.result!.written], ["completed", 0, []]);
  checkForm(app, send, { strict: true });
  await app.idle();
  const strict = app.state.records.at(-1)!;
  assert.deepEqual([strict.status, strict.result!.exitCode], ["completed", 1]);
  // The same evidence under both policies: only the code differs.
  assert.deepEqual(checkJson(strict), checkJson(normal));
  const payload = checkPayload(normal);
  assert.ok(payload.results.some((result) => result.criterion === "ID" && result.verdict === "ok"));
  assert.ok(payload.results.some((result) => result.criterion === "trace" && result.verdict === "unverified"));
  assert.deepEqual(payload.options, { paths: ["keylang"], strict: false, static: "behavior", staticFrom: "default", withoutCode: false });
  assert.equal(checkPayload(strict).options.strict, true);
  // The CLI on the same saved files: JSON equal to the payload, the human lines and summary, every format the same code.
  for (const [record, flags] of [[normal, []], [strict, ["--strict"]]] as const) {
    const json = cliCheck(root, [...flags, "--format", "json"]);
    assert.equal(json.status, record.result!.exitCode, json.stderr);
    assert.deepEqual(JSON.parse(json.stdout), checkJson(record));
    const human = cliCheck(root, [...flags]);
    assert.equal(human.stdout, checkPayload(record).lines.map((line) => `${line}\n`).join(""));
    assert.equal(human.stderr, record.result!.messages.filter((message) => message.level !== "info" || !checkPayload(record).lines.includes(message.text)).map((message) => `${message.text}\n`).join(""));
    for (const format of ["sarif", "github"]) assert.equal(cliCheck(root, [...flags, "--format", format]).status, record.result!.exitCode, format);
  }
  assert.deepEqual(treeBytes(root), before, "neither the TUI nor the CLI check wrote anything");
  // The pinned current analysis is not replaced by the disk report.
  assert.equal(app.state.analysis, analysis);
  assert.deepEqual(findingsOf(app.state.analysis), findings);
  // F6: the report with its options and the visible incompleteness; every result opens its position.
  send(KEY.f6);
  send(KEY.up);
  assert.match(vt.text(), /Check: paths, strict, static · keylang · not strict · static from config/);
  assert.match(vt.text(), /Check · read-only, nothing written · saved files · keylang/);
  assert.match(vt.text(), /strict off · static behavior \(default\)/);
  assert.match(vt.text(), /0 fail, \d+ unverified, \d+ ok · code 0/);
  assert.match(vt.text(), /incomplete: \d+ unverified, not proven · strict would make it code 1/);
  send(KEY.tab);
  const trace = payload.results.findIndex((result) => result.criterion === "trace");
  for (let i = 0; i < trace; i++) send(KEY.down);
  assert.match(app.state.message ?? "", /^unverified trace: .* · Enter opens keylang\/flows\/checkout\.md:\d+$/);
  send(KEY.enter);
  assert.equal(app.state.results.viewing, true);
  assert.equal(app.state.current, "keylang/flows/checkout.md");
  assert.equal(app.state.cursor.line, payload.results[trace]!.line - 1);
  await esc(send);
  assert.equal(app.state.results.viewing, false);
  await esc(send);
  send("q");
  assert.equal(quit, 1);
});

test("terminal: quitting after a strict check with code 1 and a failed check with code 2 returns 0", async (t) => {
  const root = checkoutRepo(t);
  const term = fakeTerminal();
  const running = runTerminal(root, term.host);
  // The frames are diffs: the screen is what they draw, not their concatenated text.
  const screen = (): string => {
    const vt = new VirtualTerminal(100, 30);
    for (const chunk of term.out) vt.feed(chunk);
    return vt.text();
  };
  await waitUntil(() => screen().includes("checkout"), "the first frame");
  const form = (paths: string, strict: boolean): void => {
    term.type(KEY.ctrlP);
    for (const ch of "keylang check") term.type(ch);
    term.type(KEY.enter);
    for (const _ of "keylang") term.type("\x7f");
    for (const ch of paths) term.type(ch);
    // From the run row up past since, changed and static to strict.
    for (let i = 0; i < 4; i++) term.type(KEY.up);
    if (strict) term.type(KEY.right);
    term.type(KEY.enter);
  };
  form("keylang", true);
  await waitUntil(() => /check --strict: 0 fail, \d+ unverified, \d+ ok · code 1/.test(screen()), "the strict check");
  form("keylang/nope", false);
  await waitUntil(() => screen().includes("check: failed · code 2"), "the failed check");
  term.type("q");
  assert.equal(await running, 0);
});

test("tui: static behavior and shape match the CLI on a hook's default and are named: override, keylang.json or the default", async (t) => {
  const layers = { domain: ["src/domain/**"], application: ["src/application/**"], presentation: ["src/presentation/**"] };
  const hooksRepo = (check: Record<string, string>): string =>
    repoWith(t, { ...HOOKS, "keylang.json": `${JSON.stringify({ languages: ["typescript"], layers, check }, null, 2)}\n`, "keylang/flows/hooks.md": HOOK_FLOW });
  const root = hooksRepo({});
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  const before = treeBytes(root);
  for (const [mode, flags] of [["config", []], ["behavior", ["--static=behavior"]], ["shape", ["--static=shape"]]] as const) {
    checkForm(s.app, s.send, { static: mode });
    await s.app.idle();
    const record = s.app.state.records.at(-1)!;
    const cli = cliCheck(root, [...flags, "--format", "json"]);
    assert.equal(record.result!.exitCode, cli.status, mode);
    assert.deepEqual(checkJson(record), JSON.parse(cli.stdout), mode);
    assert.equal((record.params as { static?: string }).static, mode === "config" ? undefined : mode);
  }
  const [plain, behavior, shape] = s.app.state.records.map(checkPayload);
  assert.deepEqual([plain!.options.static, plain!.options.staticFrom], ["behavior", "default"]);
  assert.deepEqual([behavior!.options.static, behavior!.options.staticFrom], ["behavior", "request"]);
  assert.deepEqual([shape!.options.static, shape!.options.staticFrom], ["shape", "request"]);
  assert.ok(plain!.results.some((result) => result.criterion === "static" && result.verdict === "ok" && /through the default of the hook `generate`/.test(result.evidence)));
  assert.ok(shape!.results.some((result) => result.criterion === "static" && result.verdict === "unverified" && /not followed in static mode shape, set by --static/.test(result.evidence)));
  s.send(KEY.f6);
  assert.match(s.text(), /static shape \(override\)/);
  await esc(s.send);
  // The mode of keylang.json is named as such, and an override still wins over it.
  const shaped = hooksRepo({ static: "shape" });
  const t2 = session(shaped);
  t.after(() => t2.app.close());
  await t2.app.idle();
  t2.send(KEY.ctrlP);
  for (const ch of "keylang check") t2.send(ch);
  t2.send(KEY.enter);
  assert.equal(t2.app.state.prompt?.items[1], "static: shape, from keylang.json check.static");
  // From the run row up past since and changed to static.
  for (let i = 0; i < 3; i++) t2.send(KEY.up);
  t2.send(KEY.right);
  assert.equal(t2.app.state.prompt?.items[1], "static: behavior, override of keylang.json");
  t2.send(LEFT);
  t2.send(KEY.enter);
  await t2.app.idle();
  const configured = t2.app.state.records.at(-1)!;
  assert.deepEqual([checkPayload(configured).options.static, checkPayload(configured).options.staticFrom], ["shape", "config"]);
  assert.deepEqual(checkJson(configured), JSON.parse(cliCheck(shaped, ["--format", "json"]).stdout));
  t2.send(KEY.f6);
  assert.match(t2.text(), /static shape \(keylang\.json check\.static\)/);
  assert.deepEqual(treeBytes(root), before);
});

test("tui: a chosen file narrows the report as the CLI does; an explanation path is skipped with the CLI's note; a missing path or a broken config is code 2", async (t) => {
  const explanation = "<!-- keylang:explain agent=mock date=2026-09-30 closure=abc lang=en detail=short -->\nWhat buy does.\n";
  const other = "# flow other\n\n- trigger domain.order.create\n- step domain.order.nope\n";
  const root = checkoutRepo(t, { "keylang/flows/other.md": other, "keylang/explain/application.purchase.buy.md": explanation });
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  const before = treeBytes(root);
  const file = "keylang/flows/checkout.md";
  checkForm(s.app, s.send, { paths: file });
  await s.app.idle();
  const narrow = s.app.state.records.at(-1)!;
  const cli = cliCheck(root, [file, "--format", "json"]);
  assert.equal(narrow.result!.exitCode, cli.status);
  assert.deepEqual(checkJson(narrow), JSON.parse(cli.stdout));
  assert.ok(checkPayload(narrow).results.every((result) => result.file !== "keylang/flows/other.md"));
  // The whole directory has the failing step of the other flow: code 1, as the CLI.
  checkForm(s.app, s.send);
  await s.app.idle();
  const whole = s.app.state.records.at(-1)!;
  assert.equal(whole.result!.exitCode, 1);
  assert.equal(cliCheck(root, []).status, 1);
  assert.ok(checkPayload(whole).results.some((result) => result.file === "keylang/flows/other.md" && result.verdict === "fail"));
  // A saved explanation is not a spec: skipped with the same note.
  checkForm(s.app, s.send, { paths: `${file} keylang/explain` });
  await s.app.idle();
  const skipped = s.app.state.records.at(-1)!;
  const cliSkipped = cliCheck(root, [file, "keylang/explain", "--format", "json"]);
  assert.deepEqual(checkPayload(skipped).notSpecs, ["keylang/explain"]);
  assert.match(cliSkipped.stderr, /^keylang: note: keylang\/explain: the explained map and saved explanations are not specs; skipped\n/);
  assert.equal(cliSkipped.stderr.split("\n")[0], `keylang: ${skipped.result!.messages[0]!.text}`);
  assert.deepEqual(checkJson(skipped), JSON.parse(cliSkipped.stdout));
  s.send(KEY.f6);
  assert.match(s.text(), /keylang\/explain: the explained map and saved explanations are not specs/);
  await esc(s.send);
  // A missing path: code 2 with the CLI's message; the session goes on.
  checkForm(s.app, s.send, { paths: "keylang/nope" });
  await s.app.idle();
  const missing = s.app.state.records.at(-1)!;
  const cliMissing = cliCheck(root, ["keylang/nope"]);
  assert.deepEqual([missing.status, missing.result!.exitCode, cliMissing.status], ["failed", 2, 2]);
  assert.equal(`keylang: ${missing.result!.messages[0]!.text}\n`, cliMissing.stderr);
  // A path out of the repository is refused in the form.
  checkForm(s.app, s.send, { paths: "../elsewhere" });
  assert.equal(s.app.state.prompt?.kind, "full-check");
  assert.match(s.app.state.message ?? "", /check: \.\.\/elsewhere: outside the repository/);
  await esc(s.send);
  assert.deepEqual(treeBytes(root), before);
  // A broken keylang.json on disk: code 2, the CLI's message.
  writeFileSync(join(root, "keylang.json"), "{ nope");
  checkForm(s.app, s.send);
  await s.app.idle();
  const broken = s.app.state.records.at(-1)!;
  const cliBroken = cliCheck(root, []);
  assert.deepEqual([broken.status, broken.result!.exitCode, cliBroken.status], ["failed", 2, 2]);
  assert.equal(`keylang: ${broken.result!.messages[0]!.text}\n`, cliBroken.stderr);
});

test("tui: the check saves the chosen dirty spec first as its own step — Back writes nothing; other dirty buffers stay; the check reads the saved text", async (t) => {
  const root = checkoutRepo(t, { "keylang/notes/other.md": "# notes\n" });
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  const flow = "keylang/flows/checkout.md";
  // Dirty the flow with an unknown step, and another spec outside the chosen path.
  // Typed on the last (empty) line of each file.
  const edit = async (path: string, text: string): Promise<void> => {
    s.send(KEY.ctrlP);
    for (const ch of `open ${path}`) s.send(ch);
    s.send(KEY.enter);
    assert.equal(s.app.state.current, path);
    s.app.state.cursor = { line: s.app.state.buffers.get(path)!.text.split("\n").length - 1, col: 0 };
    s.send("i");
    for (const ch of text) s.send(ch);
    await esc(s.send);
  };
  await edit("keylang/notes/other.md", "Unsaved.");
  await edit(flow, "- step domain.order.nope");
  const before = treeBytes(root);
  checkForm(s.app, s.send, { paths: flow });
  assert.deepEqual(s.app.state.barrier?.files, [flow], "only the chosen spec is an input");
  await esc(s.send);
  assert.equal(s.app.state.barrier, null);
  assert.equal(s.app.state.records.length, 0, "Back starts nothing");
  assert.deepEqual(treeBytes(root), before, "Back writes nothing");
  checkForm(s.app, s.send, { paths: flow });
  s.send(KEY.enter);
  await s.app.idle();
  const record = s.app.state.records.at(-1)!;
  assert.match(readFileSync(join(root, flow), "utf8"), /^# flow checkout[\s\S]*\n- step domain\.order\.nope\n?$/);
  assert.equal(isDirtyBuffer(s.app, flow), false);
  assert.equal(readFileSync(join(root, "keylang/notes/other.md"), "utf8"), "# notes\n", "the other dirty buffer stays unsaved");
  assert.equal(record.result!.exitCode, 1);
  assert.deepEqual(checkJson(record), JSON.parse(cliCheck(root, [flow, "--format", "json"]).stdout));
  assert.ok(checkPayload(record).results.some((result) => result.verdict === "fail" && result.evidence.includes("domain.order.nope")));
});

// ---------- changed check: the git slice of the full check (ticket 16) ----------

/** Git in a temp repository, as an argument array; commits need a name, never the user's config. */
function gitRun(dir: string, args: string[]): void {
  const r = spawnSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test", "-c", "commit.gpgsign=false", ...args], { cwd: dir, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
}

/** The working tree without `.git`: what a read-only check must leave byte for byte. */
function workTree(root: string): Map<string, string> {
  return new Map([...treeBytes(root)].filter(([path]) => path !== ".git" && !path.startsWith(".git/")));
}

/** The checkout repository committed once: the base `HEAD` of a changed check. */
function committedCheckout(t: { after: (f: () => void) => void }, specs: Record<string, string> = {}): string {
  const root = checkoutRepo(t, specs);
  gitRun(root, ["init", "-q"]);
  gitRun(root, ["add", "."]);
  gitRun(root, ["commit", "-q", "-m", "base"]);
  return root;
}

/** Runs the changed check of the form and returns its record, after comparing it with the CLI's `--changed` JSON. */
async function changedCheck(s: ReturnType<typeof session>, root: string, options: { since?: string; paths?: string } = {}): Promise<App["state"]["records"][number]> {
  checkForm(s.app, s.send, { changed: true, ...options });
  await s.app.idle();
  const record = s.app.state.records.at(-1)!;
  const cli = cliCheck(root, [...(options.paths !== undefined ? [options.paths] : []), "--changed", ...(options.since !== undefined ? ["--since", options.since] : []), "--format", "json"]);
  assert.equal(record.result!.exitCode, cli.status, cli.stderr);
  assert.deepEqual(checkJson(record), JSON.parse(cli.stdout));
  return record;
}

test("tui: changed check is the CLI's --changed slice for a changed source, an untracked source and a changed spec; the full report and the current analysis stay apart", async (t) => {
  const other = "# flow other\n\n- trigger infrastructure.store.save\n- step infrastructure.store.nope\n";
  const root = committedCheckout(t, { "keylang/flows/other.md": other });
  const s = session(root, { cols: 120, rows: 36 });
  t.after(() => s.app.close());
  await s.app.idle();
  const analysis = s.app.state.analysis;
  // The full check first: the other flow fails whatever git says.
  checkForm(s.app, s.send);
  await s.app.idle();
  const full = s.app.state.records.at(-1)!;
  assert.equal(full.result!.exitCode, 1);
  assert.equal(checkPayload(full).changed, null, "a full check reads no git");
  const fullJson = checkJson(full);
  // A clean tree: nothing touches a change, so every result is hidden and the code is 0.
  const clean = await changedCheck(s, root);
  const cleanSlice = checkPayload(clean).changed!;
  assert.deepEqual([clean.result!.exitCode, checkPayload(clean).results.length], [0, 0]);
  assert.deepEqual({ ...cleanSlice }, { since: "HEAD", unborn: false, files: [], deleted: [], shown: 0, hidden: checkPayload(full).results.length });
  assert.deepEqual((clean.params as { changed?: boolean; since?: string }).changed, true);
  assert.equal((clean.params as { since?: string }).since, undefined, "HEAD is the default ref");
  // A changed source: the checkout flow steps into it; the other flow stays hidden.
  const before = workTree(root);
  writeFileSync(join(root, "src/domain/order.ts"), "export function create(): void {\n  return;\n}\n");
  const source = await changedCheck(s, root);
  const sourcePayload = checkPayload(source);
  assert.deepEqual(sourcePayload.changed!.files, ["src/domain/order.ts"]);
  assert.ok(sourcePayload.results.some((result) => result.file === "keylang/flows/checkout.md"));
  assert.ok(sourcePayload.results.every((result) => result.file !== "keylang/flows/other.md"));
  assert.equal(sourcePayload.changed!.shown + sourcePayload.changed!.hidden, checkPayload(full).results.length);
  // A new untracked source that breaks the layers: K101 in the slice, code 1.
  writeFileSync(join(root, "src/domain/leak.ts"), 'import { save } from "../infrastructure/store.ts";\nexport function leak(): void {\n  save();\n}\n');
  const untracked = await changedCheck(s, root);
  assert.equal(untracked.result!.exitCode, 1);
  assert.ok(checkPayload(untracked).changed!.files.includes("src/domain/leak.ts"));
  assert.ok(checkPayload(untracked).results.some((result) => result.code === "K101"));
  // A changed spec: every finding of that file is in the slice.
  writeFileSync(join(root, "keylang/flows/checkout.md"), `${CHECKOUT_FLOW}- step domain.order.gone\n`);
  const spec = await changedCheck(s, root);
  assert.ok(checkPayload(spec).results.some((result) => result.file === "keylang/flows/checkout.md" && result.verdict === "fail" && result.evidence.includes("domain.order.gone")));
  // Strict and a chosen path combine with changed as in the CLI.
  checkForm(s.app, s.send, { changed: true, strict: true, paths: "keylang/flows/checkout.md" });
  await s.app.idle();
  const narrow = s.app.state.records.at(-1)!;
  const cliNarrow = cliCheck(root, ["keylang/flows/checkout.md", "--changed", "--strict", "--format", "json"]);
  assert.equal(narrow.result!.exitCode, cliNarrow.status);
  assert.deepEqual(checkJson(narrow), JSON.parse(cliNarrow.stdout));
  // The disk and the pinned analysis are untouched; the full record keeps its report.
  const edited = workTree(root);
  assert.notDeepEqual(edited, before);
  assert.equal(s.app.state.analysis, analysis);
  assert.deepEqual(checkJson(full), fullJson);
  // A second commit: `since` names an older ref, typed in the form.
  gitRun(root, ["add", "."]);
  gitRun(root, ["commit", "-q", "-m", "second"]);
  const head = await changedCheck(s, root);
  assert.equal(checkPayload(head).results.length, 0, "everything is committed");
  const older = await changedCheck(s, root, { since: "HEAD~1" });
  assert.equal(checkPayload(older).changed!.since, "HEAD~1");
  assert.equal((older.params as { since?: string }).since, "HEAD~1");
  assert.ok(checkPayload(older).changed!.files.includes("src/domain/leak.ts"));
  assert.deepEqual(workTree(root), edited, "no check wrote a file");
  // F6 names the slice: the ref, the changed files, and what the full report had besides.
  s.send(KEY.f6);
  const slice = checkPayload(older).changed!;
  assert.match(s.text(), new RegExp(`changed since HEAD~1 · ${slice.files.length} changed file\\(s\\) · ${slice.shown} of ${slice.shown + slice.hidden} result\\(s\\) shown, ${slice.hidden} hidden`));
  await esc(s.send);
});

test("tui: changed check keeps the step into a deleted module and treats a repository without commits as the CLI does", async (t) => {
  const root = committedCheckout(t);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  rmSync(join(root, "src/domain/order.ts"));
  const deleted = await changedCheck(s, root);
  const payload = checkPayload(deleted);
  assert.equal(deleted.result!.exitCode, 1);
  assert.deepEqual(payload.changed!.deleted, ["domain.order"]);
  assert.ok(payload.results.some((result) => result.code === "K001" && result.evidence.includes("domain.order.create")), JSON.stringify(payload.results));
  s.send(KEY.f6);
  assert.match(s.text(), /deleted module\(s\) kept in the slice: domain\.order/);
  await esc(s.send);
  // Before the first commit HEAD is the empty tree: every file is changed, no missing-ref error.
  const unborn = checkoutRepo(t, { "src/domain/leak.ts": 'import { save } from "../infrastructure/store.ts";\nexport function leak(): void {\n  save();\n}\n' });
  gitRun(unborn, ["init", "-q"]);
  const u = session(unborn);
  t.after(() => u.app.close());
  await u.app.idle();
  const fresh = await changedCheck(u, unborn);
  assert.equal(fresh.status, "completed");
  assert.equal(fresh.result!.exitCode, 1);
  assert.equal(checkPayload(fresh).changed!.unborn, true);
  assert.ok(checkPayload(fresh).results.some((result) => result.code === "K101"));
  assert.equal(checkPayload(fresh).changed!.hidden, 0, "every file is changed");
  gitRun(unborn, ["add", "."]);
  const staged = await changedCheck(u, unborn);
  assert.equal(checkPayload(staged).changed!.unborn, true);
  u.send(KEY.f6);
  assert.match(u.text(), /no commit yet: HEAD is the empty tree, every file is changed/);
});

test("tui: changed check without a repository or with an unknown ref fails with code 2 and the CLI's message; the session goes on; nothing is written", async (t) => {
  const bare = checkoutRepo(t);
  const s = session(bare);
  t.after(() => s.app.close());
  await s.app.idle();
  const before = workTree(bare);
  // A full check never needs git.
  checkForm(s.app, s.send);
  await s.app.idle();
  assert.deepEqual([s.app.state.records.at(-1)!.status, s.app.state.records.at(-1)!.result!.exitCode], ["completed", 0]);
  checkForm(s.app, s.send, { changed: true });
  await s.app.idle();
  const noRepo = s.app.state.records.at(-1)!;
  const cliNoRepo = cliCheck(bare, ["--changed"]);
  assert.deepEqual([noRepo.status, noRepo.result!.exitCode, noRepo.result!.payload, cliNoRepo.status], ["failed", 2, null, 2]);
  assert.match(noRepo.result!.messages[0]!.text, /^check --changed: git /);
  assert.equal(`keylang: ${noRepo.result!.messages[0]!.text}\n`, cliNoRepo.stderr);
  // The session goes on: the palette opens again and F6 names the failure.
  s.send(KEY.f6);
  assert.match(s.text(), /failed · code 2/);
  await esc(s.send);
  const root = committedCheckout(t);
  const r = session(root);
  t.after(() => r.app.close());
  await r.app.idle();
  const committed = workTree(root);
  for (const ref of ["no-such-ref", "--output=leak.txt"]) {
    checkForm(r.app, r.send, { changed: true, since: ref });
    await r.app.idle();
    const bad = r.app.state.records.at(-1)!;
    const cliBad = cliCheck(root, ["--changed", `--since=${ref}`]);
    assert.deepEqual([bad.status, bad.result!.exitCode, cliBad.status], ["failed", 2, 2], ref);
    assert.equal(`keylang: ${bad.result!.messages[0]!.text}\n`, cliBad.stderr);
    assert.equal(cliBad.stdout, "", "no fallback to a full report");
  }
  assert.match(r.app.state.records.at(-1)!.result!.messages[0]!.text, /`--output=leak\.txt` is not a git ref/);
  assert.equal(existsSync(join(root, "leak.txt")), false, "an option-like ref never reaches git");
  // An empty ref is refused in the form; typing after the failures still works.
  checkForm(r.app, r.send, { changed: true, since: "" });
  assert.equal(r.app.state.prompt?.kind, "full-check");
  assert.match(r.app.state.message ?? "", /check: changed needs a git ref/);
  await esc(r.send);
  assert.deepEqual(workTree(bare), before);
  assert.deepEqual(workTree(root), committed);
});

test("check operation: --since without --changed and a missing git binary are code 2 with the CLI's message, never an empty success", async (t) => {
  const root = committedCheckout(t);
  const lone = await runOperation({ kind: "check", root, paths: [], strict: false, since: "HEAD" });
  const cliLone = cliCheck(root, ["--since", "HEAD"]);
  assert.deepEqual([lone.status, lone.exitCode, cliLone.status], ["failed", 2, 2]);
  assert.equal(`keylang: ${lone.messages[0]!.text}\n`, cliLone.stderr);
  const path = process.env.PATH;
  process.env.PATH = join(root, "no-bin");
  let missing: OperationResult;
  try {
    missing = await runOperation({ kind: "check", root, paths: [], strict: false, changed: true });
  } finally {
    process.env.PATH = path;
  }
  const cliMissing = spawnSync(process.execPath, [BIN, "check", "--changed"], { cwd: root, encoding: "utf8", env: { ...process.env, PATH: join(root, "no-bin") } });
  assert.deepEqual([missing.status, missing.exitCode, missing.payload, cliMissing.status], ["failed", 2, null, 2]);
  assert.match(missing.messages[0]!.text, /^check --changed: git is not available/);
  assert.equal(`keylang: ${missing.messages[0]!.text}\n`, cliMissing.stderr);
});

// ---------- init: set up a repository in the session (ticket 12) ----------

/** A TypeScript repository without keylang.json, with Codex in use: what `keylang init` starts from. */
function uninitializedRepo(t: { after: (f: () => void) => void }, extra: Record<string, string> = {}): string {
  const dir = repoWith(t, { ...CHECKOUT_FILES, ...extra });
  mkdirSync(join(dir, ".codex"), { recursive: true });
  return dir;
}

/** The init form from the palette; the selection typed as in `--agents` (empty is auto), then the mode. */
function initForm(send: (keys: string) => void, selection: string, mode: "write" | "check"): void {
  send(KEY.ctrlP);
  for (const ch of "init set up keylang") send(ch);
  send(KEY.enter);
  for (const ch of selection) send(ch);
  if (mode === "check") send(KEY.down);
  send(KEY.enter);
}

function initRecord(app: App): Extract<OperationResult, { kind: "init" }> & { payload: NonNullable<Extract<OperationResult, { kind: "init" }>["payload"]> } {
  const result = app.state.records.at(-1)?.result;
  assert.ok(result?.kind === "init" && result.payload !== null, JSON.stringify(result?.messages));
  return result as Extract<OperationResult, { kind: "init" }> & { payload: NonNullable<Extract<OperationResult, { kind: "init" }>["payload"]> };
}

function cliInit(root: string, args: string[] = []): { status: number | null; stdout: string; stderr: string } {
  return spawnSync(process.execPath, [BIN, "init", ...args], { cwd: root, encoding: "utf8" });
}

function cliEdge(root: string, from: string, to: string): { status: number | null; stdout: string; stderr: string } {
  return spawnSync(process.execPath, [BIN, "check", "--explain-edge", from, to], { cwd: root, encoding: "utf8" });
}

/** The palette's explain-edge form; `from` replaces the first field when given, `to` is typed into the second, then Enter. */
function edgeForm(app: App, send: (keys: string) => void, ids: { from?: string; to: string }): void {
  send(KEY.ctrlP);
  for (const ch of "explain edge") send(ch);
  send(KEY.enter);
  assert.equal(app.state.prompt?.kind, "explain-edge");
  if (ids.from !== undefined) {
    while (app.state.prompt!.index !== 0) send(KEY.up);
    for (const _ of app.state.prompt!.edge!.from) send("\x7f");
    for (const ch of ids.from) send(ch);
    send(KEY.down);
  }
  assert.equal(app.state.prompt!.ids![app.state.prompt!.index], "to");
  for (const _ of app.state.prompt!.edge!.to) send("\x7f");
  for (const ch of ids.to) send(ch);
  send(KEY.enter);
}

function edgePayload(record: App["state"]["records"][number] | undefined): NonNullable<Extract<OperationResult, { kind: "explain-edge" }>["payload"]> {
  const result = record?.result;
  assert.ok(result?.kind === "explain-edge" && result.payload !== null, JSON.stringify(result?.messages));
  return result.payload;
}

test("tui: explain-edge fills the first id from the cursor, lists both directions in the CLI's order and opens the evidence in the code; nothing is written", async (t) => {
  const root = checkoutRepo(t, {
    // A way back: domain.order imports and calls the application.
    "src/domain/order.ts": 'import { buy } from "../application/purchase.ts";\nexport function create(): void {}\nexport function again(): void {\n  buy();\n}\n',
  });
  const s = session(root, { cols: 200 });
  t.after(() => s.app.close());
  await s.app.idle();
  const before = treeBytes(root);
  assert.equal(s.app.state.current, "keylang/flows/checkout.md");
  for (let i = 0; i < 5; i++) s.send(KEY.down);
  s.send(KEY.ctrlP);
  for (const ch of "explain edge") s.send(ch);
  s.send(KEY.enter);
  // The id under the cursor fills only the first field; the second is selected and empty.
  const prompt = s.app.state.prompt!;
  assert.deepEqual(prompt.edge, { from: "application.purchase.buy", to: "" });
  assert.equal(prompt.ids![prompt.index], "to");
  assert.deepEqual(prompt.items, ["from: application.purchase.buy", "to: ▏", "Explain the edge (reads the saved code, writes nothing)"]);
  for (const ch of "domain.ordr") s.send(ch);
  assert.equal(promptNote(s.app), "domain.ordr: not in the current snapshot · did you mean domain.order?");
  s.send("\x7f");
  for (const ch of "er") s.send(ch);
  assert.equal(promptNote(s.app), "domain.order: in the current snapshot");
  assert.match(s.text(), /explain edge: application\.purchase\.buy ↔ domain\.order/);
  s.send(KEY.enter);
  await s.app.idle();
  const record = s.app.state.records.at(-1)!;
  assert.deepEqual([record.kind, record.status, record.result!.exitCode, record.result!.written], ["explain-edge", "completed", 0, []]);
  const payload = edgePayload(record);
  assert.equal(payload.conclusion, "edges");
  const directions = payload.edges.map((item) => item.direction);
  assert.ok(directions.includes("forward") && directions.includes("backward"), JSON.stringify(directions));
  assert.ok(directions.lastIndexOf("forward") < directions.indexOf("backward"), "a → b first, then b → a");
  assert.ok(payload.edges.some(({ direction, edge }) => direction === "forward" && edge.kind === "call" && edge.target === "domain.order.create"));
  assert.ok(payload.edges.some(({ direction, edge }) => direction === "backward" && edge.kind === "call" && edge.source === "domain.order.again"));
  assert.deepEqual(payload.holes, []);
  assert.equal(payload.snapshotId, s.app.state.analysis?.snapshot?.snapshotId);
  // The CLI prints the same result: the same lines, the same code, nothing on stderr.
  const cli = cliEdge(root, "application.purchase.buy", "domain.order");
  assert.deepEqual([cli.status, cli.stderr], [0, ""]);
  assert.equal(cli.stdout, payload.lines.map((line) => `${line}\n`).join(""));
  assert.equal(cliEdge(root, "application.purchase.buy", "domain.order").stdout, cli.stdout, "a stable order");
  assert.deepEqual(treeBytes(root), before, "neither the TUI nor the CLI wrote anything");
  // F6: the ids, both directions and every edge; Tab, then Enter shows the edge's line in the code.
  s.send(KEY.f6);
  assert.match(s.text(), /Check: explain the edge between two ids · application\.purchase\.buy ↔ domain\.order/);
  assert.match(s.text(), /Explain edge · read-only, nothing written · saved code · snapshot/);
  assert.match(s.text(), /\d+ edge\(s\): \d+ → , \d+ ← · code 0/);
  assert.match(s.text(), /→ call resolved syntactic src\/application\/purchase\.ts:4:\d+-\d+:\d+ `create` application\.purchase\.buy → domain\.order\.create/);
  assert.match(s.text(), /← call resolved syntactic src\/domain\/order\.ts:4:\d+/);
  s.send(KEY.tab);
  const back = payload.edges.findIndex(({ direction, edge }) => direction === "backward" && edge.kind === "call");
  for (let i = 0; i < back; i++) s.send(KEY.down);
  assert.match(s.app.state.message ?? "", /^← call resolved syntactic src\/domain\/order\.ts:4:\d+.* · Enter opens src\/domain\/order\.ts:4$/);
  s.send(KEY.enter);
  assert.equal(s.app.state.results.viewing, true);
  assert.deepEqual([s.app.state.code?.file, s.app.state.code?.line], ["src/domain/order.ts", 4]);
  await esc(s.send);
  assert.equal(s.app.state.results.viewing, false);
  assert.equal(s.app.state.current, "keylang/flows/checkout.md");
});

test("tui: explain-edge without an edge tells a complete coverage from an unresolved construct, as the CLI does, on the saved code", async (t) => {
  const root = repoWith(t, {
    "keylang.json": `${JSON.stringify({ languages: ["typescript"], layers: { main: ["src/**"] } }, null, 2)}\n`,
    "keylang/rules.md": "# rules\n\n- layers main\n",
    "src/a.ts": "export function a(): void {}\n",
    "src/b.ts": "export function b(): void {}\n",
  });
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  edgeForm(s.app, s.send, { from: "main.a", to: "main.b" });
  await s.app.idle();
  const complete = edgePayload(s.app.state.records.at(-1));
  assert.deepEqual([complete.conclusion, complete.edges, complete.holes, complete.lines], ["complete", [], [], ["no edge, coverage complete"]]);
  assert.equal(cliEdge(root, "main.a", "main.b").stdout, "no edge, coverage complete\n");
  s.send(KEY.f6);
  assert.match(s.text(), /no edge, coverage complete · code 0/);
  assert.match(s.text(), /absence proven: no edge either way, nothing unresolved in main\.a/);
  await esc(s.send);
  // A call through a local value, saved outside the session: the operation reads the saved code, not the session's snapshot.
  writeFileSync(join(root, "src/a.ts"), "export function a(): void {}\nexport function later(cb: () => void): void { cb(); }\n");
  const before = treeBytes(root);
  edgeForm(s.app, s.send, { from: "main.a", to: "main.b" });
  await s.app.idle();
  const record = s.app.state.records.at(-1)!;
  const holed = edgePayload(record);
  assert.equal(record.result!.exitCode, 0);
  assert.equal(holed.conclusion, "unresolved");
  assert.deepEqual(holed.edges, []);
  assert.deepEqual(holed.holes.map((hole) => [hole.file, hole.line, hole.col, hole.reason]), [["src/a.ts", 2, 47, "call through a local value `cb`"]]);
  const cli = cliEdge(root, "main.a", "main.b");
  assert.equal(cli.stdout, "no confirmed edge; 1 unresolved construct(s) in `main.a` could form one\nunresolved src/a.ts:2:47 call through a local value `cb`\n");
  assert.equal(cli.stdout, holed.lines.map((line) => `${line}\n`).join(""));
  assert.deepEqual(treeBytes(root), before);
  s.send(KEY.f6);
  assert.match(s.text(), /no confirmed edge · code 0/);
  assert.match(s.text(), /not proven absent: 1 unresolved construct\(s\) in main\.a could form one/);
  assert.doesNotMatch(s.text(), /absence proven/);
  s.send(KEY.tab);
  assert.match(s.app.state.message ?? "", /^unresolved src\/a\.ts:2:47 call through a local value `cb` · Enter opens src\/a\.ts:2$/);
  s.send(KEY.enter);
  assert.deepEqual([s.app.state.code?.file, s.app.state.code?.line], ["src/a.ts", 2]);
  await esc(s.send);
});

test("tui: explain-edge with an unknown tail under a known module is code 2 with the CLI's message and a suggestion; dirty specs stay dirty; the session goes on", async (t) => {
  const root = checkoutRepo(t);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  // A dirty spec: the edge reads no spec, so no save step opens and the buffer stays as typed.
  s.send("i");
  s.send("x");
  await esc(s.send);
  const flow = s.app.state.buffers.get("keylang/flows/checkout.md")!;
  assert.notEqual(flow.text, flow.saved);
  const before = treeBytes(root);
  edgeForm(s.app, s.send, { from: "presentation.terminal.checkot", to: "domain.order" });
  assert.equal(s.app.state.barrier, null);
  await s.app.idle();
  const record = s.app.state.records.at(-1)!;
  assert.deepEqual([record.status, record.result!.exitCode, record.result!.payload], ["failed", 2, null]);
  assert.deepEqual(record.result!.messages, [
    { level: "error", text: "unknown id `presentation.terminal.checkot`" },
    { level: "info", text: "did you mean `presentation.terminal.checkout`?" },
  ]);
  const cli = cliEdge(root, "presentation.terminal.checkot", "domain.order");
  assert.deepEqual([cli.status, cli.stdout, cli.stderr], [2, "", "keylang: unknown id `presentation.terminal.checkot`\n"]);
  // Both ids are checked, the second too, with the same contract.
  const second = await runOperation({ kind: "explain-edge", root, from: "domain.order", to: "domain.order.nope" });
  assert.deepEqual([second.status, second.exitCode, second.messages[0]?.text], ["failed", 2, "unknown id `domain.order.nope`"]);
  assert.equal(cliEdge(root, "domain.order", "domain.order.nope").stderr, "keylang: unknown id `domain.order.nope`\n");
  s.send(KEY.f6);
  assert.match(s.text(), /failed · code 2/);
  assert.match(s.text(), /unknown id `presentation\.terminal\.checkot`/);
  assert.match(s.text(), /did you mean `presentation\.terminal\.checkout`\?/);
  await esc(s.send);
  // An empty field keeps the form and names what is missing.
  s.send(KEY.ctrlP);
  for (const ch of "explain edge") s.send(ch);
  s.send(KEY.enter);
  while (s.app.state.prompt!.edge!.from !== "") s.send("\x7f");
  s.send(KEY.enter);
  assert.equal(s.app.state.prompt?.kind, "explain-edge");
  assert.equal(s.app.state.message, "explain edge: two ids are needed: <from> <to>");
  await esc(s.send);
  assert.equal(flow.text !== flow.saved, true, "the dirty spec is still dirty");
  assert.deepEqual(treeBytes(root), before);
  s.send("q");
});

test("tui: init from the start screen writes what the CLI writes in a twin and opens the workspace without a restart; init --check keeps the CLI's codes and the whole tree", async (t) => {
  const root = uninitializedRepo(t);
  const twin = uninitializedRepo(t);
  const counted = countingAnalyzer();
  const s = session(root, { analyzer: counted.analyzer });
  t.after(() => s.app.close());
  await s.app.idle();
  assert.equal(configKind(s.app), "missing-config");
  assert.match(s.text(), /> Init: set up keylang in this repository/);
  assert.match(s.text(), /Browse with the guessed configuration/);
  assert.doesNotMatch(s.text(), /in a shell/);
  const before = treeBytes(root);
  // Enter on the first item opens the form: root, layout, harnesses and the files, before anything runs.
  s.send(KEY.enter);
  assert.equal(s.app.state.prompt?.kind, "init");
  const details = (s.app.state.prompt?.details ?? []).join("\n");
  assert.ok(details.includes(`Root: ${root}`), details);
  assert.match(details, /Found: typescript · layers: application, domain, infrastructure, presentation/);
  assert.match(details, /keylang\.json: none yet, written from this guess/);
  assert.match(details, /Harnesses: auto: detected codex/);
  assert.match(details, /Write, in order: keylang\.json, the map .*keylang\/rules\.baseline\.md, the harness files/);
  assert.match(details, /init --check.*the map is not compared/);
  assert.match(s.text(), /Initialize: write keylang\.json, map, baseline, harness files/);
  for (const ch of "nope") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.prompt?.kind, "init", "an unknown harness keeps the form");
  await esc(s.send);
  assert.deepEqual(treeBytes(root), before, "the form writes nothing");
  // Check first: exactly `init --check` — its code, and not one byte of the tree changes.
  s.send(KEY.enter);
  s.send(KEY.down);
  s.send(KEY.enter);
  await s.app.idle();
  let result = initRecord(s.app);
  const cliCheck = cliInit(twin, ["--check"]);
  assert.deepEqual([result.status, result.exitCode, cliCheck.status], ["completed", 1, 1]);
  assert.equal(stdoutOf(result), cliCheck.stdout);
  assert.equal(result.payload.map, null, "init --check does not compare the map");
  assert.deepEqual(treeBytes(root), before);
  assert.deepEqual(treeBytes(twin), before);
  assert.equal(counted.calls(), 0, "no analysis of the session before init");
  const check = s.app.state.records.at(-1)!;
  // Write: the same artifacts as the CLI in the twin, the workspace opens in the same session.
  assert.notEqual(s.app.state.start, null);
  s.send(KEY.enter);
  s.send(KEY.enter);
  assert.equal(s.app.state.barrier, null, "the form was the confirmation");
  await s.app.idle();
  result = initRecord(s.app);
  const cli = cliInit(twin);
  assert.equal(cli.status, 0, cli.stderr);
  assert.deepEqual([result.status, result.exitCode], ["completed", 0]);
  assert.deepEqual(artifacts(root), artifacts(twin));
  assert.ok(result.written.includes("keylang.json") && result.written.includes("keylang/rules.baseline.md") && result.written.includes("AGENTS.md"), result.written.join(" "));
  assert.equal(result.written[0], "keylang.json", "the config is written first");
  assert.equal(configKind(s.app), "configured");
  assert.equal(s.app.state.start, null, "the start screen is gone");
  assert.ok(counted.calls() >= 1);
  assert.ok(s.app.state.analysis?.snapshot, "the analysis of the new config");
  assert.equal(s.app.state.analysis?.config.guessed, false);
  assert.ok(s.app.state.files.includes("keylang.json") && s.app.state.files.includes("keylang/rules.baseline.md"), s.app.state.files.join(" "));
  assert.equal(check.outdated, "keylang init wrote files since this run");
  s.send(KEY.f6);
  assert.match(s.text(), /set up: map, baseline, agents · code 0/);
  assert.match(s.text(), /keylang\.json +written \(layers: application, domain/);
  s.send(KEY.f6);
  // After init the CLI and the session agree the repository is set up: init --check is 0 and writes nothing.
  const done = treeBytes(root);
  assert.equal(cliInit(root, ["--check"]).status, 0);
  initForm(s.send, "", "check");
  await s.app.idle();
  assert.deepEqual([initRecord(s.app).status, initRecord(s.app).exitCode], ["completed", 0]);
  assert.deepEqual(treeBytes(root), done);
  // The ordinary workspace: F5 analyses and writes nothing.
  s.send(KEY.f5);
  await s.app.idle();
  assert.deepEqual(treeBytes(root), done);
});

test("tui: init keeps a custom keylang.json byte for byte; none and an explicit list follow the agents contract as in the CLI", async (t) => {
  const root = checkoutRepo(t);
  const twin = checkoutRepo(t);
  const config = readFileSync(join(root, "keylang.json"));
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.ctrlP);
  for (const ch of "init set up keylang") s.send(ch);
  s.send(KEY.enter);
  assert.match((s.app.state.prompt?.details ?? []).join("\n"), /keylang\.json: exists, kept byte for byte/);
  assert.match(s.app.state.prompt?.items[0] ?? "", /^Initialize: keep keylang\.json/);
  await esc(s.send);
  initForm(s.send, "none", "write");
  await s.app.idle();
  let result = initRecord(s.app);
  let cli = cliInit(twin, ["--agents=none"]);
  assert.equal(cli.status, 0, cli.stderr);
  assert.deepEqual([result.status, result.exitCode, result.payload.config.existed, result.payload.config.written], ["completed", 0, true, false]);
  assert.ok(readFileSync(join(root, "keylang.json")).equals(config), "the custom config is kept");
  assert.equal(existsSync(join(root, "AGENTS.md")), false, "none writes no harness file");
  assert.deepEqual(artifacts(root), artifacts(twin));
  assert.equal(result.payload.agents?.payload?.choice, "none");
  // An explicit list: exactly the named harness, as `--agents=claude`.
  initForm(s.send, "claude", "write");
  await s.app.idle();
  result = initRecord(s.app);
  cli = cliInit(twin, ["--agents=claude"]);
  assert.equal(cli.status, 0, cli.stderr);
  assert.deepEqual([result.status, result.exitCode, result.payload.agents?.payload?.harnesses], ["completed", 0, ["claude"]]);
  assert.deepEqual(artifacts(root), artifacts(twin));
  assert.ok(existsSync(join(root, ".mcp.json")) && !existsSync(join(root, ".cursor")));
  assert.ok(readFileSync(join(root, "keylang.json")).equals(config));
  // A repeat changes nothing but the index's time, and its check is 0 as in the CLI.
  const done = artifacts(root);
  initForm(s.send, "claude", "write");
  await s.app.idle();
  assert.equal(initRecord(s.app).exitCode, 0);
  assert.deepEqual(artifacts(root), done);
  assert.equal(cliInit(root, ["--agents=claude", "--check"]).status, 0);
});

test("tui: a broken harness file or no supported source stops init before any write, keylang.json included, with the CLI's code and message", async (t) => {
  const broken = { "AGENTS.md": "<!-- keylang:begin -->\nнемає кінця\n" };
  const root = uninitializedRepo(t, broken);
  const twin = uninitializedRepo(t, broken);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  const before = treeBytes(root);
  s.send(KEY.enter);
  s.send(KEY.enter);
  await s.app.idle();
  const result = initRecord(s.app);
  assert.deepEqual([result.status, result.exitCode, result.written], ["failed", 2, []]);
  assert.equal(result.payload.preflight?.payload?.error?.file, "AGENTS.md");
  assert.deepEqual(treeBytes(root), before, "not even keylang.json");
  assert.equal(configKind(s.app), "missing-config");
  assert.notEqual(s.app.state.start, null, "the start screen stays: nothing was set up");
  const cli = cliInit(twin);
  assert.equal(cli.status, 2);
  assert.equal(cli.stderr, `keylang: ${result.messages[0]!.text}\n`);
  assert.equal(existsSync(join(twin, "keylang.json")), false);
  s.send(KEY.f6);
  assert.match(s.text(), /AGENTS\.md is broken, nothing written · code 2/);
  assert.match(s.text(), /nothing was written, keylang\.json included/);
  s.send(KEY.f6);
  // No supported source: code 2 with the CLI's reason; nothing written.
  const empty = repoWith(t, { "README.md": "# nothing to describe\n" });
  const e = session(empty);
  t.after(() => e.app.close());
  await e.app.idle();
  const emptyBefore = treeBytes(empty);
  e.send(KEY.enter);
  assert.match((e.app.state.prompt?.details ?? []).join("\n"), /no supported source files found under \. .*init stops with code 2/);
  e.send(KEY.enter);
  await e.app.idle();
  const failed = e.app.state.records.at(-1)!.result!;
  assert.deepEqual([failed.kind, failed.status, failed.exitCode, failed.payload], ["init", "failed", 2, null]);
  const cliEmpty = cliInit(empty);
  assert.equal(cliEmpty.status, 2);
  assert.equal(cliEmpty.stderr, `keylang: ${failed.messages[0]!.text}\n`);
  assert.deepEqual(treeBytes(empty), emptyBefore);
});

test("tui: an I/O failure after keylang.json names what init wrote, is no success, and a repeat keeps the config and hand-written files", async (t) => {
  const root = uninitializedRepo(t);
  let pause: () => void = () => writeFileSync(join(root, "keylang"), "in the way\n");
  const s = session(root, { operations: pausedRunner(() => pause()) });
  t.after(() => s.app.close());
  await s.app.idle();
  // A file where the spec directory must be: the map and the baseline cannot land; the config and the harness files do.
  s.send(KEY.enter);
  s.send(KEY.enter);
  await s.app.idle();
  let result = initRecord(s.app);
  assert.deepEqual([result.status, result.exitCode], ["failed", 2]);
  assert.equal(result.payload.config.written, true);
  assert.equal(result.payload.map?.status, "failed");
  assert.equal(result.payload.baseline?.status, "failed");
  assert.equal(result.payload.agents?.status, "completed");
  assert.equal(result.written[0], "keylang.json");
  assert.ok(result.written.includes("AGENTS.md"), result.written.join(" "));
  assert.ok(!result.written.some((path) => path.startsWith("keylang/")), result.written.join(" "));
  assert.ok(result.payload.map?.payload?.steps.some((step) => step.state === "failed"));
  const config = readFileSync(join(root, "keylang.json"));
  assert.equal(configKind(s.app), "configured", "the written config is read again");
  assert.equal(s.app.state.start, null);
  assert.equal(s.app.state.activeOperation, null);
  s.send(KEY.f6);
  assert.match(s.text(), /partial: map, baseline did not finish · code 2/);
  assert.match(s.text(), /Enter runs init again/);
  s.send(KEY.f6);
  // A repeat after the obstacle is gone: the config written by the first run and a hand-written spec stay as they are.
  pause = () => {};
  rmSync(join(root, "keylang"));
  mkdirSync(join(root, "keylang"));
  writeFileSync(join(root, "keylang/rules.md"), "# rules\n\n- layers domain < infrastructure < application < presentation\n");
  initForm(s.send, "", "write");
  await s.app.idle();
  result = initRecord(s.app);
  assert.deepEqual([result.status, result.exitCode, result.payload.config.existed], ["completed", 0, true]);
  assert.ok(readFileSync(join(root, "keylang.json")).equals(config));
  assert.equal(readFileSync(join(root, "keylang/rules.md"), "utf8"), "# rules\n\n- layers domain < infrastructure < application < presentation\n");
  assert.ok(existsSync(join(root, "keylang/rules.baseline.md")));
  assert.equal(cliInit(root, ["--check"]).status, 0);
});

// ---------- export (ticket 18) ----------

/** A second flow with a step the code does not have: the check fails, so SARIF and GitHub have results. */
const BROKEN_FLOW = "# flow broken\n\nA step that is not in the code.\n\n- trigger presentation.terminal.checkout\n- step domain.order.nope\n";

/** `e` over the selected F6 record opens the export form; the format is moved with →, the path replaced when given. */
function exportForm(s: ReturnType<typeof session>, options: { format?: "human" | "json" | "sarif" | "github"; path?: string } = {}): void {
  s.send("e");
  assert.equal(s.app.state.prompt?.kind, "export", s.app.state.message ?? "");
  const form = s.app.state.prompt!.exportForm!;
  if (options.format !== undefined) while (form.format !== options.format) s.send(KEY.right);
  if (options.path !== undefined) {
    for (const _ of s.app.state.prompt!.text) s.send("\x7f");
    for (const ch of options.path) s.send(ch);
  }
}

function exportDetails(app: App): string {
  return (app.state.prompt?.details ?? []).join("\n");
}

test("tui: export saves the selected check report in each format byte for byte as the CLI prints it; Esc writes nothing; a new path creates only the file and its parents", async (t) => {
  const root = checkoutRepo(t, { "keylang/flows/broken.md": BROKEN_FLOW });
  const s = session(root, { cols: 160 });
  t.after(() => s.app.close());
  await s.app.idle();
  checkForm(s.app, s.send);
  await s.app.idle();
  const check = s.app.state.records.at(-1)!;
  assert.deepEqual([check.kind, check.status, check.result!.exitCode], ["check", "completed", 1]);
  const checkResult = check.result;
  const before = treeBytes(root);
  s.send(KEY.f6);
  assert.match(s.text(), /e export/);
  // The form shows the report, the format, the default target and that it is new, before anything is written.
  exportForm(s);
  const prompt = s.app.state.prompt!;
  assert.equal(prompt.text, ".keylang/export/check.json");
  assert.deepEqual(prompt.items, ["format: json · ←→ human / json / sarif / github", "path: .keylang/export/check.json▏", "Save .keylang/export/check.json (writes this one file)"]);
  assert.match(exportDetails(s.app), /report #\d+: check · 1 fail, \d+ unverified, \d+ ok · code 1/);
  assert.match(exportDetails(s.app), /target: \.keylang\/export\/check\.json · new file · creates \.keylang\/export\//);
  assert.match(exportDetails(s.app), /\d+ bytes of json: the CLI's stdout, no ANSI, no status lines/);
  assert.equal(promptNote(s.app), "Enter saves · ←→ format · Esc writes nothing");
  assert.match(s.text(), /export the report/);
  // An untouched default path follows the format.
  s.send(KEY.right);
  assert.equal(s.app.state.prompt!.text, ".keylang/export/check.sarif");
  await esc(s.send);
  assert.equal(s.app.state.prompt, null);
  assert.equal(s.app.state.records.length, 1, "Esc starts no operation");
  assert.deepEqual(treeBytes(root), before, "the form and Esc wrote nothing, not even a directory");
  const paths = { human: ".keylang/export/check.txt", json: ".keylang/export/check.json", sarif: ".keylang/export/check.sarif", github: ".keylang/export/check.github.txt" } as const;
  for (const format of ["human", "json", "sarif", "github"] as const) {
    assert.equal(s.app.state.records[s.app.state.results.index], check, "the check report stays selected");
    exportForm(s, { format });
    assert.equal(s.app.state.prompt!.text, paths[format]);
    s.send(KEY.enter);
    await s.app.idle();
    const record = s.app.state.records.at(-1)!;
    assert.deepEqual([record.kind, record.status, record.result!.exitCode, record.result!.written], ["export", "completed", 0, [paths[format]]], JSON.stringify(record.result?.messages));
    const cli = cliCheck(root, ["--format", format]);
    assert.equal(cli.status, 1);
    const saved = readFileSync(join(root, paths[format]), "utf8");
    assert.equal(saved, cli.stdout, `${format}: the file is the CLI's stdout`);
    assert.doesNotMatch(saved, /\x1b/, `${format}: no ANSI`);
    assert.doesNotMatch(saved, /\d+ fail, \d+ unverified, \d+ ok/, `${format}: the stderr summary is not in the file`);
    if (format === "json" || format === "sarif") JSON.parse(saved);
    if (format === "sarif") assert.ok(saved.includes('"ruleId"'), "a SARIF result");
    if (format === "github") assert.match(saved, /^::error file=keylang\/flows\/broken\.md,line=\d+,col=\d+,title=/m);
  }
  assert.deepEqual(JSON.parse(readFileSync(join(root, paths.json), "utf8")), checkJson(check));
  // Only the four files and their parents are new; the report was not run again.
  const after = treeBytes(root);
  const added = [...after.keys()].filter((path) => !before.has(path)).sort();
  assert.deepEqual(added, Object.values(paths).sort());
  for (const [path, bytes] of before) assert.equal(after.get(path), bytes, path);
  assert.equal(check.result, checkResult, "the exported record keeps its report");
  assert.equal(s.app.state.records.filter((record) => record.kind === "check").length, 1, "no hidden check");
  // F6: the export record names its report, format, target and outcome; Enter does not repeat it blindly.
  s.send(KEY.down);
  for (let i = 0; i < 4; i++) s.send(KEY.down);
  assert.equal(s.app.state.records[s.app.state.results.index]?.kind, "export");
  assert.match(s.text(), /Export · github of the check report · \.keylang\/export\/check\.github\.txt · \d+ bytes/);
  assert.match(s.text(), /written · code 0/);
  s.send(KEY.enter);
  assert.match(s.app.state.message ?? "", /^export: select the report and press e/);
  assert.equal(s.app.state.records.length, 5);
});

test("tui: export refuses a target changed after the form, a generated target, a link out of the repository and a dirty buffer; the session goes on", async (t) => {
  const root = checkoutRepo(t, { "keylang/flows/broken.md": BROKEN_FLOW, "out.json": "old\r\n", "gen.md": "<!-- keylang:generated -->\n# map\n" });
  const outside = mkdtempSync(join(tmpdir(), "keylang-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  const s = session(root, { cols: 160 });
  t.after(() => s.app.close());
  await s.app.idle();
  checkForm(s.app, s.send);
  await s.app.idle();
  const check = s.app.state.records.at(-1)!;
  s.send(KEY.f6);
  // An existing target is shown before Save and replaced with the exact bytes (its CRLF is not carried over).
  exportForm(s, { path: "out.json" });
  assert.match(exportDetails(s.app), /target: out\.json · exists, 5 bytes: replaced on Save/);
  s.send(KEY.enter);
  await s.app.idle();
  const replaced = s.app.state.records.at(-1)!;
  assert.deepEqual([replaced.status, replaced.result!.exitCode], ["completed", 0]);
  assert.match(s.text(), /replaced · code 0/);
  assert.equal(readFileSync(join(root, "out.json"), "utf8"), cliCheck(root, ["--format", "json"]).stdout);
  // Changed on disk after the form showed it: a conflict, never an overwrite.
  assert.equal(s.app.state.records[s.app.state.results.index], check, "the check report stays selected");
  exportForm(s, { path: "out.json", format: "human" });
  writeFileSync(join(root, "out.json"), "someone else\n");
  s.send(KEY.enter);
  await s.app.idle();
  const conflict = s.app.state.records.at(-1)!;
  assert.deepEqual([conflict.kind, conflict.status, conflict.result!.exitCode, conflict.result!.written], ["export", "failed", 1, []]);
  assert.match(conflict.result!.messages[0]!.text, /^out\.json: changed on disk while the change was prepared; nothing written$/);
  assert.equal(readFileSync(join(root, "out.json"), "utf8"), "someone else\n");
  assert.match(s.app.state.message ?? "", /export human out\.json: refused, nothing written · code 1/);
  // Refused in the form: the form stays open and nothing is written.
  const refusals: [string, RegExp][] = [
    ["gen.md", /a generated file: only its generator writes it/],
    ["keylang/map/new.md", /a generated artifact: only its generator writes it/],
    [".keylang/index.json", /a generated artifact/],
    ["away/report.json", /leads out of the repository through a link/],
    ["../report.json", /not a plain relative path/],
  ];
  const before = treeBytes(root);
  symlinkSync(outside, join(root, "away"));
  for (const [path, why] of refusals) {
    exportForm(s, { path });
    assert.match(promptNote(s.app), why, path);
    assert.match(exportDetails(s.app), new RegExp(`target: ${path.replace(/\./g, "\\.")} · refused: `));
    s.send(KEY.enter);
    assert.equal(s.app.state.prompt?.kind, "export", `${path}: the form stays`);
    assert.match(s.app.state.message ?? "", why);
    await esc(s.send);
  }
  assert.deepEqual(readdirSync(outside), [], "nothing written through the link");
  rmSync(join(root, "away"));
  // A dirty buffer of the target: its text is never written under.
  await esc(s.send);
  s.send("i");
  s.send("x");
  await esc(s.send);
  assert.deepEqual(s.app.unsaved(), ["keylang/flows/broken.md"]);
  s.send(KEY.f6);
  while (s.app.state.results.index > 0) s.send(KEY.up);
  assert.equal(s.app.state.records[s.app.state.results.index], check);
  assert.notEqual(check.outdated, null, "the edit made the report outdated");
  exportForm(s, { path: "keylang/flows/broken.md" });
  assert.match(promptNote(s.app), /open with unsaved edits/);
  s.send(KEY.enter);
  assert.equal(s.app.state.prompt?.kind, "export");
  // An outdated report is saved as it ran, without a new check: named in the form.
  for (const _ of s.app.state.prompt!.text) s.send("\x7f");
  for (const ch of "old-report.txt") s.send(ch);
  while (s.app.state.prompt!.exportForm!.format !== "human") s.send(KEY.right);
  assert.match(exportDetails(s.app), /outdated: inputs edited since this run · saved as it ran; nothing is checked again/);
  s.send(KEY.enter);
  await s.app.idle();
  assert.equal(s.app.state.records.at(-1)?.status, "completed");
  assert.equal(readFileSync(join(root, "old-report.txt"), "utf8"), checkPayload(check).lines.map((line) => `${line}\n`).join(""));
  assert.equal(s.app.state.records.filter((record) => record.kind === "check").length, 1, "no hidden check");
  const after = treeBytes(root);
  assert.deepEqual([...after.keys()].filter((path) => !before.has(path)), ["old-report.txt"]);
  assert.equal(readFileSync(join(root, "keylang/flows/broken.md"), "utf8"), BROKEN_FLOW, "the dirty spec stays unsaved");
  assert.deepEqual(s.app.unsaved(), ["keylang/flows/broken.md"]);
});

test("tui: export saves an explained edge as the CLI's lines; the palette exports the newest report and says why when there is none", async (t) => {
  const root = checkoutRepo(t);
  const s = session(root, { cols: 160 });
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.ctrlP);
  for (const ch of "export report") s.send(ch);
  assert.match(promptNote(s.app), /no report yet: run a check first/);
  s.send(KEY.enter);
  assert.match(s.app.state.message ?? "", /Export the report to a file: no report yet: run a check first/);
  edgeForm(s.app, s.send, { from: "application.purchase.buy", to: "domain.order" });
  await s.app.idle();
  const edge = s.app.state.records.at(-1)!;
  assert.equal(edge.status, "completed");
  // F6 closed: the palette takes the newest report.
  s.send(KEY.ctrlP);
  for (const ch of "export report") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.prompt?.kind, "export");
  assert.equal(s.app.state.prompt!.text, ".keylang/export/edge.txt");
  assert.equal(s.app.state.prompt!.items[0], "format: human · the only output of an explained edge");
  s.send(KEY.right);
  assert.equal(s.app.state.prompt!.exportForm!.format, "human");
  s.send(KEY.enter);
  await s.app.idle();
  const record = s.app.state.records.at(-1)!;
  assert.deepEqual([record.kind, record.status, record.result!.exitCode], ["export", "completed", 0]);
  assert.equal(readFileSync(join(root, ".keylang/export/edge.txt"), "utf8"), cliEdge(root, "application.purchase.buy", "domain.order").stdout);
  // Another kind of record, like the export itself, is not exported: F6 says why.
  s.send(KEY.f6);
  s.send("e");
  assert.equal(s.app.state.prompt, null);
  assert.match(s.app.state.message ?? "", /^export: only a check, explain-edge, parse or trace-plan report is exported$/);
});

// ---------- parse (ticket 19) ----------

/** A flow with Unicode (a two-code-unit letter before the ids) and a nested list: offsets count UTF-16 code units, columns code points. */
const UNICODE_FLOW = "# flow ціна-𝒳\n\nОплата 𝒳 з терміналу — «швидко».\n\n- trigger presentation.terminal.checkout <!-- 𝒳 -->\n- step application.purchase.buy\n  - step domain.order.create\n    - step infrastructure.store.save\n";
/** A tab in the indentation of a nested step: K003, an error. */
const TAB_FLOW = "# flow tabbed\n\n- trigger presentation.terminal.checkout\n  - step application.purchase.buy\n\t- step domain.order.create\n";
const SAVED_EXPLANATION = "<!-- keylang:explain agent=mock date=2026-10-01 closure=abc lang=en detail=short -->\nThe checkout.\n";

/** The palette's parse form; `paths` replaces the default text when given, then the view. */
function parseForm(s: ReturnType<typeof session>, view: "tree" | "json", paths?: string): void {
  s.send(KEY.ctrlP);
  for (const ch of "keylang parse") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.prompt?.kind, "parse", s.app.state.message ?? "");
  if (paths !== undefined) {
    for (const _ of s.app.state.prompt!.text) s.send("\x7f");
    for (const ch of paths) s.send(ch);
  }
  if (view === "json") s.send(KEY.down);
  s.send(KEY.enter);
}

function parseRecord(app: App): Extract<OperationResult, { kind: "parse" }> & { payload: NonNullable<Extract<OperationResult, { kind: "parse" }>["payload"]> } {
  const result = app.state.records.at(-1)?.result;
  assert.ok(result?.kind === "parse" && result.payload !== null, JSON.stringify(result?.messages));
  return result as Extract<OperationResult, { kind: "parse" }> & { payload: NonNullable<Extract<OperationResult, { kind: "parse" }>["payload"]> };
}

function cliParse(root: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  return spawnSync(process.execPath, [BIN, "parse", ...args], { cwd: root, encoding: "utf8" });
}

/** What the CLI prints to stderr for the same result: the notes, then the diagnostics. */
function parseStderr(result: Extract<OperationResult, { kind: "parse" }> & { payload: NonNullable<Extract<OperationResult, { kind: "parse" }>["payload"]> }): string {
  return [...result.payload.skipped.map((file) => `keylang: note: ${file}: a saved explanation, not keylang Markdown; skipped`), ...result.messages.filter((m) => !m.text.startsWith("note: ")).map((m) => m.text)].map((line) => `${line}\n`).join("");
}

test("tui: parse of the current spec with Unicode and a nested list gives the CLI's tree and JSON byte for byte without a code snapshot; nothing is written; export writes only its target", async (t) => {
  const file = "keylang/flows/unicode.md";
  const root = checkoutRepo(t, { [file]: UNICODE_FLOW });
  // No snapshot of the code at all: parse reads only the specs and the edition of keylang.json.
  const s = session(root, { cols: 160, analyzer: async () => { throw new Error("no code snapshot in this test"); } });
  t.after(() => s.app.close());
  await s.app.idle();
  assert.equal(s.app.state.analysis?.snapshot ?? null, null);
  s.send(KEY.ctrlP);
  for (const ch of `open ${file}`) s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.current, file);
  // The form defaults to the current spec and shows both views; a directory only when typed.
  s.send(KEY.ctrlP);
  for (const ch of "keylang parse") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.prompt?.kind, "parse");
  assert.equal(s.app.state.prompt?.text, file);
  assert.deepEqual(s.app.state.prompt?.items, ["Tree of 1 file(s): as keylang parse prints it", "JSON of 1 file(s): as keylang parse --json prints it"]);
  assert.equal(promptNote(s.app), `${file} · saved explanations are skipped · no code snapshot needed · writes nothing`);
  assert.match(s.text(), /parse specifications: Text IR/);
  await esc(s.send);
  assert.equal(s.app.state.records.length, 0);
  const before = treeBytes(root);
  // JSON: the CLI's stdout, byte for byte, and the same documents; no ANSI, no session summary.
  parseForm(s, "json");
  assert.equal(s.app.state.barrier, null, "nothing unsaved, no step");
  await s.app.idle();
  let result = parseRecord(s.app);
  assert.deepEqual([result.status, result.exitCode, result.written], ["completed", 0, []]);
  const cliJson = cliParse(root, ["--json", file]);
  assert.equal(cliJson.status, 0);
  assert.equal(cliJson.stderr, "");
  assert.equal(result.payload.text, cliJson.stdout);
  assert.deepEqual(result.payload.documents, JSON.parse(cliJson.stdout));
  assert.doesNotMatch(result.payload.text, /\x1b|code 0|completed|F6/);
  // The spans are the parser's: UTF-16 offsets that slice the source, 1-based code-point columns.
  const [doc] = result.payload.documents;
  const buy = doc!.sections[0]!.items.flatMap((item) => (item.type === "node" ? [item] : []))[1]!;
  const deepest = buy.children[0]!.children[0]!;
  assert.equal(deepest.refs[0]?.target, "infrastructure.store.save");
  assert.equal(UNICODE_FLOW.slice(deepest.span.start.offset, deepest.span.end.offset).trimEnd(), "- step infrastructure.store.save");
  assert.equal(deepest.span.start.col, 5);
  assert.deepEqual(treeBytes(root), before, "parse writes nothing");
  // Tree: the CLI's stdout too.
  parseForm(s, "tree");
  await s.app.idle();
  result = parseRecord(s.app);
  const cliTree = cliParse(root, [file]);
  assert.deepEqual([result.exitCode, cliTree.status], [0, 0]);
  assert.equal(result.payload.text, cliTree.stdout);
  assert.match(result.payload.text, /^ {8}step -> infrastructure\.store\.save {2}@8:5$/m);
  // F6: the report, then the tree as stdout; the text scrolls.
  s.send(KEY.f6);
  const text = s.text();
  assert.match(text, /Parse: show the Text IR of specifications · tree · keylang\/flows\/unicode\.md/);
  assert.match(text, /Parse · read-only, nothing written · saved files · keylang\/flows\/unicode\.md · tree/);
  assert.match(text, /1 document\(s\), 0 error\(s\), 0 warning\(s\) · code 0/);
  assert.match(text, /\[flow\] flow ціна-𝒳/);
  assert.match(text, /e export/);
  // Export: the view the report was shown in, then JSON; each file is the CLI's stdout; nothing is parsed again.
  exportForm(s);
  assert.equal(s.app.state.prompt!.text, ".keylang/export/parse.txt");
  assert.equal(s.app.state.prompt!.items[0], "format: tree · ←→ tree / json");
  s.send(KEY.enter);
  await s.app.idle();
  let exported = s.app.state.records.at(-1)!;
  assert.deepEqual([exported.kind, exported.status, exported.result!.exitCode, exported.result!.written], ["export", "completed", 0, [".keylang/export/parse.txt"]]);
  assert.equal(readFileSync(join(root, ".keylang/export/parse.txt"), "utf8"), cliTree.stdout);
  while (s.app.state.results.index > 1) s.send(KEY.up);
  assert.equal(s.app.state.records[s.app.state.results.index]?.kind, "parse");
  exportForm(s, { format: "json" });
  assert.equal(s.app.state.prompt!.text, ".keylang/export/parse.json");
  s.send(KEY.enter);
  await s.app.idle();
  exported = s.app.state.records.at(-1)!;
  assert.deepEqual([exported.status, exported.result!.exitCode], ["completed", 0]);
  assert.equal(readFileSync(join(root, ".keylang/export/parse.json"), "utf8"), cliJson.stdout);
  const after = treeBytes(root);
  assert.deepEqual([...after.keys()].filter((path) => !before.has(path)).sort(), [".keylang/export/parse.json", ".keylang/export/parse.txt"]);
  for (const [path, bytes] of before) assert.equal(after.get(path), bytes, path);
  assert.equal(s.app.state.records.filter((record) => record.kind === "parse").length, 2, "no hidden parse");
  while (s.app.state.results.index < s.app.state.records.length - 1) s.send(KEY.down);
  assert.match(s.text(), /Export · json of the parse report · \.keylang\/export\/parse\.json · \d+ bytes/);
});

test("tui: parse of a syntax error and a directory with a saved explanation keeps the CLI's code, diagnostics and note; Enter opens the diagnostic; a dirty spec is saved first", async (t) => {
  const bad = "keylang/flows/tabbed.md";
  const root = checkoutRepo(t, { [bad]: TAB_FLOW, "keylang/explain/presentation.terminal.checkout.md": SAVED_EXPLANATION });
  const s = session(root, { cols: 160 });
  t.after(() => s.app.close());
  await s.app.idle();
  const before = treeBytes(root);
  parseForm(s, "json", "keylang");
  await s.app.idle();
  const result = parseRecord(s.app);
  const cli = cliParse(root, ["--json", "keylang"]);
  assert.equal(cli.status, 1);
  assert.deepEqual([result.status, result.exitCode], ["completed", 1]);
  assert.equal(result.payload.text, cli.stdout, "the IR is there despite the error, as in the CLI");
  assert.equal(parseStderr(result), cli.stderr);
  assert.deepEqual(result.payload.skipped, ["keylang/explain/presentation.terminal.checkout.md"]);
  assert.ok(!result.payload.documents.some((doc) => doc.path.includes("/explain/")), "the explanation is not parsed");
  assert.deepEqual(result.payload.diagnostics.map((d) => [d.code, d.file, d.span.start.line, d.span.start.col]), [["K003", bad, 5, 1]]);
  assert.match(cli.stderr, /^keylang\/flows\/tabbed\.md:5:1: K003 tab in indentation/m);
  assert.deepEqual(treeBytes(root), before, "parse writes nothing");
  // F6: the note, the diagnostic, and a jump to it in the document.
  s.send(KEY.f6);
  let text = s.text();
  assert.match(text, /\d+ document\(s\), 1 error\(s\), 0 warning\(s\) · code 1/);
  assert.match(text, /keylang\/explain\/presentation\.terminal\.checkout\.md: a saved explanation, not keylang Markdown; skipped/);
  assert.match(text, /keylang\/flows\/tabbed\.md:5:1: K003 tab in indentation/);
  assert.match(text, /Tab diagnostics/);
  s.send(KEY.tab);
  assert.match(s.app.state.message ?? "", /K003 .* · Enter opens keylang\/flows\/tabbed\.md:5$/);
  // A page scrolls the text below the diagnostic; the diagnostic stays selected.
  s.send("\x1b[6~");
  assert.ok(s.app.state.results.top > 0, "PgDn scrolls the long JSON");
  assert.equal(s.app.state.results.gap, 0);
  s.send(KEY.enter);
  assert.equal(s.app.state.current, bad);
  assert.deepEqual(s.app.state.cursor, { line: 4, col: 0 });
  await esc(s.send);
  assert.equal(s.app.state.results.open, true, "Esc comes back to the report");
  await esc(s.send);
  // A dirty spec under the paths is saved first; Back writes nothing and parses nothing.
  s.send(KEY.ctrlP);
  for (const ch of `open ${bad}`) s.send(ch);
  s.send(KEY.enter);
  s.app.state.cursor = { line: 4, col: 0 };
  s.send("i");
  s.send("\x7f");
  await esc(s.send);
  const typed = s.app.state.buffers.get(bad)!.text;
  assert.notEqual(typed, TAB_FLOW);
  const records = s.app.state.records.length;
  parseForm(s, "tree");
  assert.deepEqual(s.app.state.barrier?.files, [bad]);
  await esc(s.send);
  assert.equal(readFileSync(join(root, bad), "utf8"), TAB_FLOW, "Back writes nothing");
  assert.equal(s.app.state.records.length, records);
  parseForm(s, "tree");
  s.send(KEY.enter);
  await s.app.idle();
  const saved = parseRecord(s.app);
  assert.equal(readFileSync(join(root, bad), "utf8"), typed);
  assert.equal(saved.payload.text, cliParse(root, [bad]).stdout, "the saved text is parsed");
  // A missing path: code 2 and the CLI's message, no IR; the session goes on.
  parseForm(s, "json", "keylang/nope.md");
  await s.app.idle();
  const missing = s.app.state.records.at(-1)!;
  assert.deepEqual([missing.kind, missing.status, missing.result!.exitCode, missing.result!.payload], ["parse", "failed", 2, null]);
  const cliMissing = cliParse(root, ["--json", "keylang/nope.md"]);
  assert.deepEqual([cliMissing.status, cliMissing.stdout, cliMissing.stderr], [2, "", `keylang: ${missing.result!.messages[0]!.text}\n`]);
  s.send(KEY.f6);
  text = s.text();
  assert.match(text, /keylang\/nope\.md: not found/);
});

// ---------- trace plan (ticket 20) ----------

/** A second flow: a module and an unknown ID are no functions of the snapshot, so no adapter instruments them. */
const MIXED_FLOW = "# flow mixed\n\n- trigger presentation.terminal.checkout\n  - step domain.order\n  - step domain.order.nope\n";

/** The palette's trace-plan form; `flow` replaces the default name when given, then Enter plans the first match (or the typed name). */
function tracePlanForm(s: ReturnType<typeof session>, flow?: string): void {
  s.send(KEY.ctrlP);
  for (const ch of "trace plan") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.prompt?.kind, "trace-plan", s.app.state.message ?? "");
  if (flow !== undefined) {
    for (const _ of s.app.state.prompt!.text) s.send("\x7f");
    for (const ch of flow) s.send(ch);
  }
  s.send(KEY.enter);
}

type TracePlanResult = Extract<OperationResult, { kind: "trace-plan" }> & { payload: NonNullable<Extract<OperationResult, { kind: "trace-plan" }>["payload"]> };

function tracePlanRecord(app: App): TracePlanResult {
  const result = app.state.records.at(-1)?.result;
  assert.ok(result?.kind === "trace-plan" && result.payload !== null, JSON.stringify(result?.messages));
  return result as TracePlanResult;
}

function cliTracePlan(root: string, flow: string): { status: number | null; stdout: string; stderr: string } {
  return spawnSync(process.execPath, [BIN, "trace-plan", flow], { cwd: root, encoding: "utf8" });
}

const fileSha256 = (root: string, file: string): string => createHash("sha256").update(readFileSync(join(root, file), "utf8")).digest("hex");

test("tui: trace-plan of a flow with a trigger and nested steps gives the CLI's JSON byte for byte — symbols, positions, hashes; Enter opens a symbol; nothing written or run; export writes only the JSON", async (t) => {
  const root = checkoutRepo(t, { "keylang/flows/mixed.md": MIXED_FLOW });
  const s = session(root, { cols: 200 });
  t.after(() => s.app.close());
  await s.app.idle();
  const before = treeBytes(root);
  assert.equal(s.app.state.current, "keylang/flows/checkout.md");
  // The flow under the cursor is the visible default; the list is the declared flows, not the file names.
  s.send(KEY.ctrlP);
  for (const ch of "keylang trace-plan") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.prompt?.kind, "trace-plan");
  assert.equal(s.app.state.prompt?.text, "checkout");
  assert.deepEqual(s.app.state.prompt?.items, ["checkout  keylang/flows/checkout.md"]);
  assert.equal(promptNote(s.app), "checkout · a fresh snapshot of the saved code · writes nothing, runs nothing");
  for (const _ of "checkout") s.send("\x7f");
  assert.deepEqual(s.app.state.prompt?.ids, ["checkout", "mixed"]);
  assert.match(s.text(), /2 flow\(s\): trace plan/);
  await esc(s.send);
  assert.equal(s.app.state.records.length, 0);
  tracePlanForm(s);
  assert.equal(s.app.state.barrier, null, "nothing unsaved, no step");
  await s.app.idle();
  const result = tracePlanRecord(s.app);
  assert.deepEqual([result.status, result.exitCode, result.written], ["completed", 0, []]);
  const cli = cliTracePlan(root, "checkout");
  assert.deepEqual([cli.status, cli.stderr], [0, ""]);
  assert.equal(result.payload.text, cli.stdout, "the CLI's stdout, byte for byte");
  assert.deepEqual(result.payload.plan, JSON.parse(cli.stdout));
  assert.doesNotMatch(result.payload.text, /\x1b|code 0|completed|F6/);
  const { plan } = result.payload;
  assert.deepEqual([plan.schemaVersion, plan.flow], [1, "checkout"]);
  assert.equal(plan.snapshotId, s.app.state.analysis?.snapshot?.snapshotId, "the same saved code, the same snapshot");
  // Every trigger and nested step, sorted by ID, at its declaration, with the hash of the file the snapshot read.
  assert.deepEqual(plan.symbols.map((symbol) => symbol.id), ["application.purchase.buy", "domain.order.create", "infrastructure.store.save", "presentation.terminal.checkout"]);
  const create = plan.symbols.find((symbol) => symbol.id === "domain.order.create")!;
  assert.deepEqual([create.name, create.file, create.line], ["create", "src/domain/order.ts", 1]);
  for (const symbol of plan.symbols) assert.equal(symbol.sha256, fileSha256(root, symbol.file), symbol.id);
  assert.deepEqual(result.payload.omitted, []);
  assert.deepEqual(treeBytes(root), before, "neither the TUI nor the CLI wrote anything: no trace, no cache");
  // What is no function of the snapshot stays out of the plan and is named, never an observed step.
  tracePlanForm(s, "mixed");
  await s.app.idle();
  const mixed = tracePlanRecord(s.app);
  assert.equal(mixed.payload.text, cliTracePlan(root, "mixed").stdout);
  assert.deepEqual(mixed.payload.plan.symbols.map((symbol) => symbol.id), ["presentation.terminal.checkout"]);
  assert.deepEqual(mixed.payload.omitted, ["domain.order", "domain.order.nope"]);
  s.send(KEY.f6);
  let text = s.text();
  assert.match(text, /Trace plan: the functions of a flow to instrument · mixed/);
  assert.match(text, /1 function\(s\) to instrument, 2 id\(s\) left out · code 0/);
  assert.match(text, /not in the plan \(no function of the snapshot\): domain\.order, domain\.order\.nope/);
  assert.match(text, /a plan is no evidence/);
  // F6 over the checkout plan: the summary, each symbol, the JSON; Tab, then Enter opens a symbol in the code.
  s.send(KEY.up);
  assert.equal(s.app.state.records[s.app.state.results.index]?.result, result);
  text = s.text();
  assert.match(text, /Trace plan · flow checkout · read-only, nothing written, nothing run · fresh snapshot/);
  assert.match(text, /4 function\(s\) to instrument · code 0/);
  assert.match(text, new RegExp(`domain\\.order\\.create {2}src/domain/order\\.ts:1:${create.col} {2}sha256 ${create.sha256.slice(0, 12)}`));
  assert.match(text, /── keylang trace-plan checkout · stdout ──/);
  assert.match(text, /"schemaVersion": 1,/);
  assert.match(text, /Tab symbols · e export/);
  s.send(KEY.tab);
  s.send(KEY.down);
  assert.match(s.app.state.message ?? "", /^domain\.order\.create src\/domain\/order\.ts:1:\d+ · Enter opens src\/domain\/order\.ts:1$/);
  s.send(KEY.enter);
  assert.equal(s.app.state.results.viewing, true);
  assert.deepEqual([s.app.state.code?.file, s.app.state.code?.line], ["src/domain/order.ts", 1]);
  await esc(s.send);
  s.send(KEY.tab);
  // Export: the JSON the adapters read, as computed; the file is the CLI's stdout and the only new file.
  exportForm(s);
  assert.equal(s.app.state.prompt!.text, ".keylang/export/trace-plan.json");
  assert.equal(s.app.state.prompt!.exportForm!.format, "json");
  assert.deepEqual(s.app.state.prompt!.exportForm!.formats, ["json"]);
  s.send(KEY.enter);
  await s.app.idle();
  const exported = s.app.state.records.at(-1)!;
  assert.deepEqual([exported.kind, exported.status, exported.result!.exitCode, exported.result!.written], ["export", "completed", 0, [".keylang/export/trace-plan.json"]]);
  assert.equal(readFileSync(join(root, ".keylang/export/trace-plan.json"), "utf8"), cli.stdout);
  const after = treeBytes(root);
  assert.deepEqual([...after.keys()].filter((path) => !before.has(path)), [".keylang/export/trace-plan.json"]);
  for (const [path, bytes] of before) assert.equal(after.get(path), bytes, path);
  assert.equal(s.app.state.records.filter((record) => record.kind === "trace-plan").length, 2, "no hidden plan");
  while (s.app.state.results.index < s.app.state.records.length - 1) s.send(KEY.down);
  assert.match(s.text(), /Export · json of the trace-plan report · \.keylang\/export\/trace-plan\.json · \d+ bytes/);
});

test("tui: trace-plan of an unknown flow is code 2 with the CLI's message and no plan; a changed source makes the old plan outdated and a rerun has the new snapshot and hash; a dirty spec is saved first", async (t) => {
  const root = checkoutRepo(t);
  const s = session(root, { cols: 200 });
  t.after(() => s.app.close());
  await s.app.idle();
  const before = treeBytes(root);
  // An unknown flow: the form says so, the operation fails with the CLI's code and message, nothing is written.
  s.send(KEY.ctrlP);
  for (const ch of "trace plan") s.send(ch);
  s.send(KEY.enter);
  for (const _ of s.app.state.prompt!.text) s.send("\x7f");
  for (const ch of "zzz") s.send(ch);
  assert.deepEqual(s.app.state.prompt?.items, []);
  assert.equal(promptNote(s.app), "zzz: not in the current documents · a fresh snapshot of the saved code · writes nothing, runs nothing");
  s.send(KEY.enter);
  await s.app.idle();
  const unknown = s.app.state.records.at(-1)!;
  assert.deepEqual([unknown.kind, unknown.status, unknown.result!.exitCode, unknown.result!.payload, unknown.result!.written], ["trace-plan", "failed", 2, null, []]);
  const cliUnknown = cliTracePlan(root, "zzz");
  assert.deepEqual([cliUnknown.status, cliUnknown.stdout, cliUnknown.stderr], [2, "", `keylang: ${unknown.result!.messages[0]!.text}\n`]);
  assert.equal(unknown.result!.messages[0]!.text, "no flow `zzz` under keylang/");
  assert.deepEqual(treeBytes(root), before);
  // The source changes on disk after a plan: F5 takes a new snapshot, the old plan is outdated; a rerun plans the new code.
  tracePlanForm(s, "checkout");
  await s.app.idle();
  const first = tracePlanRecord(s.app);
  writeFileSync(join(root, "src/domain/order.ts"), "// changed\nexport function create(): void {}\n");
  s.send(KEY.f5);
  await s.app.idle();
  const firstRecord = s.app.state.records.at(-1)!;
  assert.equal(firstRecord.outdated, "the code snapshot changed since this run");
  s.send(KEY.f6);
  assert.match(s.text(), /outdated: the code snapshot changed since this run · Enter reruns/);
  s.send(KEY.enter);
  await s.app.idle();
  const second = tracePlanRecord(s.app);
  assert.notEqual(s.app.state.records.at(-1), firstRecord);
  assert.notEqual(second.payload.plan.snapshotId, first.payload.plan.snapshotId);
  const create = (result: TracePlanResult) => result.payload.plan.symbols.find((symbol) => symbol.id === "domain.order.create")!;
  assert.notEqual(create(second).sha256, create(first).sha256);
  assert.deepEqual([create(second).sha256, create(second).line], [fileSha256(root, "src/domain/order.ts"), 2]);
  assert.equal(second.payload.text, cliTracePlan(root, "checkout").stdout);
  // A dirty spec under the spec directory is saved first: Back writes and plans nothing; Save plans the saved flow.
  await esc(s.send);
  const flow = "keylang/flows/checkout.md";
  s.app.state.cursor = { line: 7, col: 0 };
  s.send("i");
  for (const ch of "  - step domain.order.create\n") s.send(ch);
  await esc(s.send);
  const typed = s.app.state.buffers.get(flow)!.text;
  assert.notEqual(typed, CHECKOUT_FLOW);
  const records = s.app.state.records.length;
  tracePlanForm(s, "checkout");
  assert.deepEqual(s.app.state.barrier?.files, [flow]);
  await esc(s.send);
  assert.equal(readFileSync(join(root, flow), "utf8"), CHECKOUT_FLOW, "Back writes nothing");
  assert.equal(s.app.state.records.length, records);
  tracePlanForm(s, "checkout");
  s.send(KEY.enter);
  await s.app.idle();
  const saved = tracePlanRecord(s.app);
  assert.equal(readFileSync(join(root, flow), "utf8"), typed);
  assert.equal(saved.payload.text, cliTracePlan(root, "checkout").stdout, "the saved flow is planned");
  assert.ok(!existsSync(join(root, ".keylang/trace")), "no trace file");
});

// ---------- algorithmic flow draft (ticket 22) ----------

/** A spec with prose and another flow: a draft into it keeps both. */
const BUYING_SPEC = "# Buying\n\nHow an order is bought.\n\n# flow other\n\n- trigger presentation.terminal.checkout\n";

/** Moves the draft form's selection to the row `id`. */
function draftRow(s: ReturnType<typeof session>, id: string): void {
  const prompt = s.app.state.prompt!;
  for (let i = 0; i < 20 && prompt.ids?.[prompt.index] !== id; i++) s.send(KEY.down);
  assert.equal(prompt.ids?.[prompt.index], id, JSON.stringify(prompt.ids));
}

/** Replaces the text of a field row of the draft form. */
function draftField(s: ReturnType<typeof session>, id: "trigger" | "name" | "into", text: string): void {
  draftRow(s, id);
  for (const _ of s.app.state.prompt!.draft![id]) s.send("\x7f");
  for (const ch of text) s.send(ch);
}

/** The palette's draft-flow form with the given fields; Enter on the run row. */
function draftForm(s: ReturnType<typeof session>, fields: { trigger: string; name?: string; into?: string; mode?: "algo" | "hybrid" | "llm"; output?: "proposal" | "preview" }): void {
  s.send(KEY.ctrlP);
  for (const ch of "draft flow") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.prompt?.kind, "draft-flow", s.app.state.message ?? "");
  draftField(s, "trigger", fields.trigger);
  if (fields.name !== undefined) draftField(s, "name", fields.name);
  if (fields.into !== undefined) draftField(s, "into", fields.into);
  if (fields.mode !== undefined && fields.mode !== s.app.state.prompt!.draft!.mode) {
    draftRow(s, "mode");
    for (let i = 0; i < 3 && s.app.state.prompt!.draft!.mode !== fields.mode; i++) s.send(KEY.right);
    assert.equal(s.app.state.prompt!.draft!.mode, fields.mode);
  }
  if ((fields.output ?? "proposal") !== s.app.state.prompt!.draft!.output) {
    draftRow(s, "output");
    s.send(KEY.right);
  }
  draftRow(s, "run");
  s.send(KEY.enter);
}

type DraftResult = Extract<OperationResult, { kind: "draft-flow" }> & { payload: NonNullable<Extract<OperationResult, { kind: "draft-flow" }>["payload"]> };

function draftRecord(app: App): DraftResult {
  const result = app.state.records.at(-1)?.result;
  assert.ok(result?.kind === "draft-flow" && result.payload !== null, JSON.stringify(result?.messages));
  return result as DraftResult;
}

function cliDraft(root: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  return spawnSync(process.execPath, [BIN, "draft", "flow", ...args], { cwd: root, encoding: "utf8" });
}

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

const BUY_ANSWER = "```markdown\n# flow buy\n\n- trigger application.purchase.buy\n  - step domain.order.create\n  - step infrastructure.store.save\n```";
const F4 = "\x1bOS";

/**
 * A Messages API stand-in that holds every answer until `release`; the TUI's
 * operation worker reaches it through the environment set here, before the
 * session starts. `dropped` counts requests the client closed unanswered.
 */
async function heldModel(t: { after: (f: () => void) => void }, reply: string | ((prompt: string) => string)): Promise<{ prompts: string[]; requested: (n: number) => Promise<void>; release: () => void; dropped: () => number }> {
  const prompts: string[] = [];
  const held: (() => void)[] = [];
  const waiters: { n: number; resolve: () => void }[] = [];
  let dropped = 0;
  const server = createServer((req, res) => {
    let data = "";
    req.on("data", (chunk: Buffer) => (data += chunk.toString()));
    req.on("end", () => {
      const prompt = (JSON.parse(data) as { messages: { content: string }[] }).messages[0]!.content;
      prompts.push(prompt);
      for (const waiter of waiters) if (prompts.length >= waiter.n) waiter.resolve();
      const text = typeof reply === "string" ? reply : reply(prompt);
      held.push(() => {
        if (res.destroyed) return;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ id: "m", type: "message", role: "assistant", model: "claude-opus-5", content: [{ type: "text", text }], stop_reason: "end_turn", stop_details: null, usage: { input_tokens: 1, output_tokens: 1 } }));
      });
    });
    res.on("close", () => {
      if (!res.writableEnded) dropped++;
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const saved = { url: process.env.ANTHROPIC_BASE_URL, key: process.env.ANTHROPIC_API_KEY };
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_API_KEY = "test";
  t.after(() => {
    server.closeAllConnections();
    server.close();
    if (saved.url === undefined) delete process.env.ANTHROPIC_BASE_URL;
    else process.env.ANTHROPIC_BASE_URL = saved.url;
    if (saved.key === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = saved.key;
  });
  return {
    prompts,
    requested: (n) => (prompts.length >= n ? Promise.resolve() : new Promise<void>((resolve) => waiters.push({ n, resolve }))),
    release: () => {
      for (const answer of held.splice(0)) answer();
    },
    dropped: () => dropped,
  };
}

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

/** Releases the held model's answers one request at a time until `done` settles. */
async function answerAll<T>(model: Awaited<ReturnType<typeof heldModel>>, done: Promise<T>): Promise<T> {
  let settled = false;
  void done.then(() => (settled = true));
  while (!settled) {
    model.release();
    await sleep(20);
  }
  return done;
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

// ---------- offline explanations (ticket 31) ----------

/** The palette's explain form; `subject` replaces the default when given, then Enter explains the first match (or the typed text). */
function explainForm(s: ReturnType<typeof session>, subject?: string): void {
  s.send(KEY.ctrlP);
  for (const ch of "keylang explain") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.prompt?.kind, "explain", s.app.state.message ?? "");
  if (subject !== undefined) {
    for (const _ of s.app.state.prompt!.text) s.send("\x7f");
    for (const ch of subject) s.send(ch);
  }
  s.send(KEY.enter);
}

type ExplainResult = Extract<OperationResult, { kind: "explain" }> & { payload: NonNullable<Extract<OperationResult, { kind: "explain" }>["payload"]> };

function explainRecord(app: App): ExplainResult {
  const result = app.state.records.at(-1)?.result;
  assert.ok(result?.kind === "explain" && result.payload !== null, JSON.stringify(result?.messages));
  return result as ExplainResult;
}

function cliExplain(root: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  return spawnSync(process.execPath, [BIN, "explain", ...args], { cwd: root, encoding: "utf8" });
}

/** A repository whose agent is a local mock: every request an action makes is counted. */
async function explainRepo(t: { after: (f: () => void) => void }, specs: Record<string, string>): Promise<{ root: string; prompts: string[] }> {
  const root = checkoutRepo(t, specs);
  const config = join(root, "keylang.json");
  writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, "utf8")), agent: "anthropic:claude-opus-5" }));
  const { prompts } = await mockModel(t, "never asked");
  return { root, prompts };
}

const storedExplanation = (closure: string, detail: "short" | "brief", text: string): string =>
  `<!-- keylang:explain agent=anthropic:claude-opus-5 date=2026-09-30 closure=${closure} lang=en detail=${detail} -->\n${text}\n`;

test("tui: explain of a diagnostic code in any case and of an unknown code is the CLI's text and code with no save step; e on a line with K001 shows its help; no model is asked, nothing written", async (t) => {
  const { root, prompts } = await explainRepo(t, { "keylang/flows/checkout.md": `${CHECKOUT_FLOW}  - step domain.order.nope\n` });
  const s = session(root, { cols: 200 });
  t.after(() => s.app.close());
  await s.app.idle();
  const before = treeBytes(root);
  const k001 = cliExplain(root, ["K001"]);
  assert.deepEqual([k001.status, k001.stderr], [0, ""]);
  assert.equal(cliExplain(root, ["k001"]).stdout, k001.stdout, "the case of a code does not matter");
  // e on the line of an unknown ID: no node to sum up, the help of the line's K001 instead, as the CLI prints it.
  s.app.state.cursor = { line: 8, col: 0 };
  s.send("e");
  const hover = s.app.state.hover!.lines.map((line) => line.text);
  assert.deepEqual(hover.slice(0, k001.stdout.trimEnd().split("\n").length), k001.stdout.trimEnd().split("\n"));
  assert.ok(hover.some((line) => line.startsWith("unknown id `domain.order.nope`")), hover.join("\n"));
  await esc(s.send);
  // A dirty spec: a code's help reads nothing, so no save step opens and the buffer stays dirty.
  s.app.state.cursor = { line: 2, col: 0 };
  s.send("i");
  s.send("x");
  await esc(s.send);
  s.send(KEY.ctrlP);
  for (const ch of "keylang explain") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.prompt?.text, "", "no id or diagnostic on a prose line");
  for (const ch of "k001") s.send(ch);
  assert.deepEqual(s.app.state.prompt?.ids, ["K001"]);
  assert.equal(promptNote(s.app), "K001: offline help of the code · reads nothing, saves nothing first");
  s.send(KEY.enter);
  assert.equal(s.app.state.barrier, null);
  await s.app.idle();
  const code = explainRecord(s.app);
  assert.deepEqual([code.status, code.exitCode, code.written], ["completed", 0, []]);
  assert.equal(code.payload.text, k001.stdout, "the CLI's stdout, byte for byte");
  assert.ok(code.payload.subject === "code" && code.payload.code === "K001");
  assert.equal(code.payload.snapshotId, null);
  const lower = await runOperation({ kind: "explain", root, subject: "k001" });
  assert.deepEqual([lower.status, lower.exitCode, lower.payload?.text], ["completed", 0, k001.stdout]);
  s.send(KEY.f6);
  let text = s.text();
  assert.match(text, /Explain: a diagnostic code or an id, offline · K001/);
  assert.match(text, /Explain · K001 · offline help of the code · nothing read, nothing written/);
  assert.match(text, /K001: offline help · code 0/);
  await esc(s.send);
  // An unknown code: failed 2 with the CLI's message, typed in either case.
  explainForm(s, "K999");
  await s.app.idle();
  const unknown = s.app.state.records.at(-1)!;
  assert.deepEqual([unknown.kind, unknown.status, unknown.result!.exitCode, unknown.result!.payload, unknown.result!.written], ["explain", "failed", 2, null, []]);
  assert.equal(unknown.result!.messages[0]!.text, "unknown code `K999`");
  for (const typed of ["K999", "k999"]) {
    const op = await runOperation({ kind: "explain", root, subject: typed });
    const cli = cliExplain(root, [typed]);
    assert.deepEqual([op.status, op.exitCode, cli.status, cli.stdout, cli.stderr], ["failed", 2, 2, "", `keylang: ${op.messages[0]!.text}\n`]);
  }
  s.send(KEY.f6);
  assert.match(s.text(), /unknown code `K999`/);
  assert.notEqual(s.app.state.buffers.get("keylang/flows/checkout.md")!.text, s.app.state.buffers.get("keylang/flows/checkout.md")!.saved, "still dirty");
  assert.deepEqual(treeBytes(root), before, "nothing written by the TUI or the CLI");
  assert.equal(prompts.length, 0, "no request to the model");
  text = s.text();
  assert.doesNotMatch(text, /provider|credentials/);
});

test("tui: explain of an id is the CLI's summary with the doc comment, the saved answer and the brief apart, with their provenance; places open the code; a code change makes the answer stale; a missing answer is no error; an unknown id has the CLI's suggestion; no model is asked", async (t) => {
  const order = "/** Creates an order. */\nexport function create(): void {}\n";
  const { root, prompts } = await explainRepo(t, { "src/domain/order.ts": order });
  const s = session(root, { cols: 200 });
  t.after(() => s.app.close());
  await s.app.idle();
  const id = "domain.order.create";
  const baseline = currentBaseline(s.app.state.analysis!, id)!;
  const answerFile = `keylang/explain/${id}.md`;
  mkdirSync(join(root, "keylang/explain/brief"), { recursive: true });
  writeFileSync(join(root, answerFile), storedExplanation(baseline, "short", "Creates the order through `domain.order.create`; `domain.order.ghost` is made up."));
  writeFileSync(join(root, `keylang/explain/brief/${id}.md`), storedExplanation(baseline, "brief", "Makes an order."));
  const before = treeBytes(root);
  // e: the session's analysis as shown, with each explanation's origin; no model.
  s.app.state.cursor = { line: 6, col: 0 };
  s.send("e");
  let hover = s.app.state.hover!.lines.map((line) => line.text);
  assert.equal(hover[0], `fn ${id} () → void`);
  assert.ok(hover.includes("doc: Creates an order."), hover.join("\n"));
  assert.ok(hover.includes("the session's analysis · Ctrl+P Explain reads the saved files"), hover.join("\n"));
  assert.ok(hover.includes("saved short answer · anthropic:claude-opus-5 · 2026-09-30 · fresh"), hover.join("\n"));
  assert.ok(hover.includes("saved brief · anthropic:claude-opus-5 · 2026-09-30 · fresh"), hover.join("\n"));
  assert.ok(hover.includes("unknown ids: domain.order.ghost"), hover.join("\n"));
  await esc(s.send);
  // The palette: the ID under the cursor by default; a fresh analysis of the saved files in the worker.
  s.send(KEY.ctrlP);
  for (const ch of "keylang explain") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.prompt?.text, id);
  assert.equal(s.app.state.prompt?.ids?.[0], id);
  assert.equal(promptNote(s.app), `${id}: in the current snapshot · a fresh analysis of the saved code and specs · offline: no model, writes nothing`);
  s.send(KEY.enter);
  await s.app.idle();
  const fresh = explainRecord(s.app);
  assert.deepEqual([fresh.status, fresh.exitCode, fresh.written], ["completed", 0, []]);
  const cli = cliExplain(root, [id]);
  assert.deepEqual([cli.status, cli.stderr], [0, ""]);
  assert.equal(fresh.payload.text, cli.stdout, "the CLI's stdout, byte for byte");
  assert.ok(fresh.payload.subject === "node");
  const node = fresh.payload;
  assert.equal(node.snapshotId, s.app.state.analysis?.snapshot?.snapshotId);
  assert.equal(node.summary.doc, "Creates an order.", "the doc comment comes from the code");
  assert.deepEqual([node.saved?.agent, node.saved?.date, node.saved?.detail, node.saved?.fresh, node.saved?.file, node.saved?.unknownIds], ["anthropic:claude-opus-5", "2026-09-30", "short", true, answerFile, ["domain.order.ghost"]]);
  assert.deepEqual([node.brief?.text, node.brief?.detail, node.brief?.fresh, node.brief?.file], ["Makes an order.", "brief", true, `keylang/explain/brief/${id}.md`]);
  assert.doesNotMatch(node.saved!.text, /Makes an order|Creates an order\./, "the answer is neither the brief nor the doc comment");
  assert.doesNotMatch(cli.stdout, /Makes an order/, "the CLI prints the answer of its detail, not the brief");
  assert.deepEqual(node.links.map((link) => link.text), [
    "at src/domain/order.ts:2",
    "called by application.purchase.buy  src/application/purchase.ts:3",
    "flow checkout  keylang/flows/checkout.md:1",
  ]);
  s.send(KEY.f6);
  const text = s.text();
  assert.match(text, /Explain · domain\.order\.create · offline, no model, nothing written · saved code and specs · snapshot/);
  assert.match(text, /fn domain\.order\.create: saved answer fresh · code 0/);
  assert.match(text, /doc: Creates an order\./);
  assert.match(text, /── saved answer · short · anthropic:claude-opus-5 · 2026-09-30 · fresh · keylang\/explain\/domain\.order\.create\.md ──/);
  assert.match(text, /── saved brief \(the explained map\) · brief · anthropic:claude-opus-5 · 2026-09-30 · fresh/);
  assert.match(text, /unknown ids \(in no snapshot, no planned; not followed\): domain\.order\.ghost/);
  // Places: Tab, then ↑↓ and Enter open a known ID's code; nothing is made of the made-up ID.
  s.send(KEY.tab);
  s.send(KEY.down);
  assert.match(s.app.state.message ?? "", /^called by application\.purchase\.buy {2}src\/application\/purchase\.ts:3 · Enter opens src\/application\/purchase\.ts:3$/);
  s.send(KEY.enter);
  assert.deepEqual([s.app.state.code?.file, s.app.state.code?.line], ["src/application/purchase.ts", 3]);
  await esc(s.send);
  await esc(s.send);
  await esc(s.send);
  assert.deepEqual(treeBytes(root), before, "nothing written: no explanation, cache or stats");
  // The code changes: the old record is outdated, a rerun and e say stale; the CLI agrees.
  writeFileSync(join(root, "src/domain/order.ts"), order.replace("{}", "{\n  return;\n}"));
  s.send(KEY.f5);
  await s.app.idle();
  assert.equal(s.app.state.records.at(-1)!.outdated, "the code snapshot changed since this run");
  s.send(KEY.f6);
  while (s.app.state.results.index < s.app.state.records.length - 1) s.send(KEY.down);
  s.send(KEY.enter);
  await s.app.idle();
  const stale = explainRecord(s.app);
  assert.ok(stale.payload.subject === "node");
  assert.deepEqual([stale.payload.saved?.fresh, stale.payload.brief?.fresh], [false, false]);
  assert.equal(stale.payload.text, cliExplain(root, [id]).stdout);
  assert.match(stale.payload.text, /anthropic:claude-opus-5 · 2026-09-30 · stale\n/);
  s.send(KEY.down);
  assert.equal(s.app.state.records[s.app.state.results.index]?.result, stale);
  assert.match(s.text(), /stale: the code changed since/);
  assert.match(s.text(), /Enter rerun · Tab places · Esc back/, "an explanation is no report to export");
  await esc(s.send);
  s.app.state.cursor = { line: 6, col: 0 };
  s.send("e");
  hover = s.app.state.hover!.lines.map((line) => line.text);
  assert.ok(hover.includes("saved short answer · anthropic:claude-opus-5 · 2026-09-30 · stale"), hover.join("\n"));
  await esc(s.send);
  // No saved answer: the summary alone, completed — not a provider error.
  rmSync(join(root, answerFile));
  explainForm(s);
  await s.app.idle();
  const missing = explainRecord(s.app);
  assert.deepEqual([missing.status, missing.exitCode], ["completed", 0]);
  assert.ok(missing.payload.subject === "node" && missing.payload.saved === null);
  assert.ok(missing.messages.every((message) => message.level !== "error"));
  assert.equal(missing.payload.text, cliExplain(root, [id]).stdout);
  s.send(KEY.f6);
  assert.match(s.text(), /no saved answer: keylang explain domain\.order\.create --llm asks the model; nothing here does/);
  await esc(s.send);
  // An unknown id: failed 2 with the CLI's message and its suggestion, nothing invented.
  const near = await runOperation({ kind: "explain", root, subject: "domain.order.creat" });
  const cliNear = cliExplain(root, ["domain.order.creat"]);
  assert.deepEqual([near.status, near.exitCode, near.payload], ["failed", 2, null]);
  assert.equal(near.messages[0]!.text, "unknown id `domain.order.creat` (did you mean `domain.order.create`?)");
  assert.deepEqual([cliNear.status, cliNear.stdout, cliNear.stderr], [2, "", `keylang: ${near.messages[0]!.text}\n`]);
  explainForm(s, "qqq.zzz");
  await s.app.idle();
  const nope = s.app.state.records.at(-1)!;
  assert.deepEqual([nope.status, nope.result!.exitCode, nope.result!.messages.map((message) => message.text)], ["failed", 2, [cliExplain(root, ["qqq.zzz"]).stderr.replace(/^keylang: |\n$/g, "")]]);
  // A dirty spec is saved first for an id: Back writes and explains nothing.
  s.app.state.cursor = { line: 2, col: 0 };
  s.send("i");
  s.send("x");
  await esc(s.send);
  const records = s.app.state.records.length;
  explainForm(s, id);
  assert.deepEqual(s.app.state.barrier?.files, ["keylang/flows/checkout.md"]);
  await esc(s.send);
  assert.equal(s.app.state.records.length, records);
  assert.equal(readFileSync(join(root, "keylang/flows/checkout.md"), "utf8"), CHECKOUT_FLOW, "Back writes nothing");
  const after = treeBytes(root);
  assert.deepEqual([...after.keys()].filter((path) => !before.has(path)), [], "no explanation, cache or stats appeared");
  assert.equal(prompts.length, 0, "no request to the model");
});

// ---------- one explanation by the model (ticket 32) ----------

/** The palette's model form; `id` replaces the default when given, ←→ step the detail, then Enter. */
function explainModelForm(s: ReturnType<typeof session>, options: { id?: string; steps?: number; submit?: boolean } = {}): void {
  s.send(KEY.ctrlP);
  for (const ch of "explain --llm") s.send(ch);
  s.send(KEY.enter);
  assert.ok(s.app.state.prompt?.kind === "explain" && s.app.state.prompt.explainModel, s.app.state.message ?? "");
  if (options.id !== undefined) {
    for (const _ of s.app.state.prompt.text) s.send("\x7f");
    for (const ch of options.id) s.send(ch);
  }
  for (let i = 0; i < (options.steps ?? 0); i++) s.send(KEY.right);
  if (options.submit !== false) s.send(KEY.enter);
}

type ExplainLlmResult = Extract<OperationResult, { kind: "explain-llm" }> & { payload: NonNullable<Extract<OperationResult, { kind: "explain-llm" }>["payload"]> };

function explainLlmRecord(app: App): ExplainLlmResult {
  const result = app.state.records.at(-1)?.result;
  assert.ok(result?.kind === "explain-llm" && result.payload !== null, JSON.stringify(result?.messages));
  return result as ExplainLlmResult;
}

/** Every file but the explanation store: what an explanation must leave as it was (the map, the baseline, the specs, the code). */
function outsideExplain(root: string): Map<string, string> {
  return new Map([...treeBytes(root)].filter(([path]) => !path.startsWith("keylang/explain/")));
}

const EXPLAIN_ID = "domain.order.create";
const EXPLAIN_FILE = `keylang/explain/${EXPLAIN_ID}.md`;
const EXPLAIN_REPLY = "Creates an order through `domain.order.create`; `domain.order.ghost` is made up.\n\nIt is called from the checkout.";

test("tui: explain with the model asks once for a missing answer and saves it with its provenance; a fresh one is read with no request, as the CLI reads it; brief and full ask again; the map, the baseline and the check stay as they were", async (t) => {
  const root = checkoutRepo(t);
  withConfig(root, { agent: "anthropic:claude-opus-5" });
  let reply = EXPLAIN_REPLY;
  const model = await heldModel(t, () => reply);
  // The map and the baseline exist, so the test sees that neither is written with an explanation.
  assert.equal(spawnSync(process.execPath, [BIN, "map"], { cwd: root, encoding: "utf8" }).status, 0);
  assert.equal(spawnSync(process.execPath, [BIN, "baseline"], { cwd: root, encoding: "utf8" }).status, 0);
  const check = spawnSync(process.execPath, [BIN, "check"], { cwd: root, encoding: "utf8" });
  const s = session(root, { cols: 220 });
  t.after(() => s.app.close());
  await s.app.idle();
  const before = outsideExplain(root);
  // The form: the ID under the cursor, the detail, the language and the agent of keylang.json; what Enter would do.
  s.app.state.cursor = { line: 6, col: 0 };
  explainModelForm(s, { submit: false });
  await s.app.idle();
  assert.equal(s.app.state.prompt?.text, EXPLAIN_ID);
  assert.equal(promptNote(s.app), `${EXPLAIN_ID}: no saved answer · asks anthropic:claude-opus-5 once, then saves ${EXPLAIN_FILE} · short (←→) · lang en · agent anthropic:claude-opus-5 · keylang.json sets lang and agent`);
  assert.equal(model.prompts.length, 0, "the form asks nothing");
  s.send(KEY.enter);
  await model.requested(1);
  assert.equal(s.app.state.records.at(-1)!.status, "running");
  assert.match(model.prompts[0]!, /Node:\nfn domain\.order\.create/);
  model.release();
  await s.app.idle();
  const asked = explainLlmRecord(s.app);
  assert.deepEqual([asked.status, asked.exitCode, asked.written, asked.payload.source, asked.payload.reason, asked.payload.written], ["completed", 0, [EXPLAIN_FILE], "model", "missing", EXPLAIN_FILE]);
  const today = new Date().toISOString().slice(0, 10);
  const closure = currentBaseline(s.app.state.analysis!, EXPLAIN_ID)!;
  assert.equal(readFileSync(join(root, EXPLAIN_FILE), "utf8"), `<!-- keylang:explain agent=anthropic:claude-opus-5 date=${today} closure=${closure} lang=en detail=short -->\n${EXPLAIN_REPLY}\n`);
  assert.deepEqual([asked.payload.answer?.agent, asked.payload.answer?.date, asked.payload.answer?.lang, asked.payload.answer?.detail, asked.payload.answer?.fresh, asked.payload.answer?.unknownIds], ["anthropic:claude-opus-5", today, "en", "short", true, ["domain.order.ghost"]]);
  assert.equal(asked.payload.text, `${EXPLAIN_REPLY}\n\nanthropic:claude-opus-5 · ${today} · fresh\nunknown ids: domain.order.ghost\n`);
  s.send(KEY.f6);
  let text = s.text();
  assert.match(text, /Explain with the model · domain\.order\.create · short · lang en · agent anthropic:claude-opus-5/);
  assert.match(text, /fn domain\.order\.create: new short answer saved to keylang\/explain\/domain\.order\.create\.md · code 0/);
  assert.match(text, /no saved answer: the model was asked once; the map is not written/);
  assert.match(text, /── new answer, saved · short · anthropic:claude-opus-5 · \d{4}-\d\d-\d\d · fresh · keylang\/explain\/domain\.order\.create\.md ──/);
  assert.match(text, /unknown ids \(in no snapshot, no planned; not followed\): domain\.order\.ghost/);
  await esc(s.send);
  // e reads the new answer at once; the made-up ID is named, no node is made of it.
  s.app.state.cursor = { line: 6, col: 0 };
  s.send("e");
  const hover = s.app.state.hover!.lines.map((line) => line.text);
  assert.ok(hover.includes(`saved short answer · anthropic:claude-opus-5 · ${today} · fresh`), hover.join("\n"));
  assert.ok(hover.includes("unknown ids: domain.order.ghost"), hover.join("\n"));
  assert.equal(s.app.state.analysis?.snapshot?.nodes["domain.order.ghost"], undefined);
  await esc(s.send);
  // A fresh answer of the same detail and language: read, no request, nothing written — the CLI's stdout.
  const saved = treeBytes(root);
  explainModelForm(s, { submit: false });
  await s.app.idle();
  assert.equal(promptNote(s.app), `${EXPLAIN_ID}: the saved short answer (anthropic:claude-opus-5 · ${today}) is fresh: read, no request, nothing written · short (←→) · lang en · agent anthropic:claude-opus-5 · keylang.json sets lang and agent`);
  s.send(KEY.enter);
  await s.app.idle();
  const cached = explainLlmRecord(s.app);
  assert.deepEqual([cached.status, cached.exitCode, cached.written, cached.payload.source, cached.payload.reason], ["completed", 0, [], "cache", null]);
  const cli = cliExplain(root, [EXPLAIN_ID, "--llm"]);
  assert.deepEqual([cli.status, cli.stderr, cli.stdout], [0, "", cached.payload.text]);
  assert.equal(cached.payload.text, asked.payload.text);
  assert.equal(model.prompts.length, 1, "neither the session nor the CLI asked again");
  assert.deepEqual(treeBytes(root), saved);
  s.send(KEY.f6);
  assert.match(s.text(), /fn domain\.order\.create: the fresh saved short answer, no request · code 0/);
  assert.match(s.text(), /read from the saved file: fresh, same detail and language; the model was not asked, nothing was written/);
  await esc(s.send);
  // brief (two steps right): its own file, cut by the brief rule, in the session's explained map after the write.
  reply = "Makes an order.\n\nMore than a brief.";
  explainModelForm(s, { steps: 2, submit: false });
  await s.app.idle();
  assert.match(promptNote(s.app), /^domain\.order\.create: no saved brief · asks anthropic:claude-opus-5 once, then saves keylang\/explain\/brief\/domain\.order\.create\.md · brief \(←→\)/);
  s.send(KEY.enter);
  await model.requested(2);
  model.release();
  await s.app.idle();
  const brief = explainLlmRecord(s.app);
  assert.deepEqual([brief.status, brief.written, brief.payload.detail, brief.payload.answer?.text], ["completed", [`keylang/explain/brief/${EXPLAIN_ID}.md`], "brief", "Makes an order."]);
  assert.equal(s.app.state.briefs.get(EXPLAIN_ID)?.text, "Makes an order.", "the session reads the new brief");
  assert.equal(readFileSync(join(root, EXPLAIN_FILE), "utf8").includes(EXPLAIN_REPLY), true, "the short answer stays");
  reply = EXPLAIN_REPLY;
  // full: the saved answer is short, so the model is asked once more and the shared file takes the full one.
  explainModelForm(s, { steps: 1, submit: false });
  await s.app.idle();
  assert.match(promptNote(s.app), /^domain\.order\.create: the saved answer is short · asks anthropic:claude-opus-5 once/);
  s.send(KEY.enter);
  await model.requested(3);
  model.release();
  await s.app.idle();
  const full = explainLlmRecord(s.app);
  assert.deepEqual([full.status, full.payload.reason, full.payload.previous?.detail, full.payload.answer?.detail], ["completed", "detail", "short", "full"]);
  assert.match(readFileSync(join(root, EXPLAIN_FILE), "utf8"), / detail=full -->/);
  assert.equal(cliExplain(root, [EXPLAIN_ID, "--llm", "--full"]).stdout, full.payload.text, "the CLI reads the full answer now");
  assert.equal(model.prompts.length, 3);
  // Only the explanation store changed: no map, baseline, spec, code or cache written; the check is the same.
  assert.deepEqual(outsideExplain(root), before);
  assert.deepEqual(spawnSync(process.execPath, [BIN, "check"], { cwd: root, encoding: "utf8" }).stdout, check.stdout);
  // A dirty spec is saved first: the step names it; Back asks nothing and writes nothing.
  s.app.state.cursor = { line: 2, col: 0 };
  s.send("i");
  s.send("x");
  await esc(s.send);
  const records = s.app.state.records.length;
  s.app.state.cursor = { line: 6, col: 0 };
  explainModelForm(s);
  assert.deepEqual(s.app.state.barrier?.files, ["keylang/flows/checkout.md"]);
  await esc(s.send);
  assert.equal(s.app.state.records.length, records);
  assert.equal(readFileSync(join(root, "keylang/flows/checkout.md"), "utf8"), CHECKOUT_FLOW);
  assert.equal(model.prompts.length, 3);
});

test("tui: explain with the model keeps the saved answer on Cancel, a timeout, an empty answer, a stream error and when a source or the saved file changes while it waits; without a model the form says why and Enter is the CLI's offline summary", async (t) => {
  const root = checkoutRepo(t);
  withConfig(root, { agent: "anthropic:claude-opus-5" });
  let reply = EXPLAIN_REPLY;
  const model = await heldModel(t, () => reply);
  const s = session(root, { cols: 220 });
  t.after(() => s.app.close());
  await s.app.idle();
  // A stale saved answer: every request below may replace it, none that fails does.
  const old = storedExplanation("old-closure", "short", "The old answer.");
  mkdirSync(join(root, "keylang/explain"), { recursive: true });
  writeFileSync(join(root, EXPLAIN_FILE), old);
  const before = treeBytes(root);
  s.app.state.cursor = { line: 6, col: 0 };
  explainModelForm(s, { submit: false });
  await s.app.idle();
  assert.match(promptNote(s.app), /^domain\.order\.create: the saved answer is stale · asks anthropic:claude-opus-5 once/);
  s.send(KEY.enter);
  const cancelled = s.app.state.records.at(-1)!;
  await model.requested(1);
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
  // The operation as the session runs it: Cancel through the signal, then the failures of the model.
  const request = { kind: "explain-llm", root, id: EXPLAIN_ID, detail: "short" } as const;
  const controller = new AbortController();
  const aborted = runOperation(request, { signal: controller.signal });
  await model.requested(2);
  controller.abort();
  const stopped = await aborted;
  assert.deepEqual([stopped.status, stopped.exitCode, stopped.written], ["cancelled", null, []]);
  model.release();
  reply = "";
  const blank = await answerAll(model, runOperation(request, {}));
  assert.deepEqual([blank.status, blank.exitCode, blank.written, blank.payload?.previous?.text], ["failed", 2, [], "The old answer."]);
  assert.match(blank.messages.at(-1)!.text, /^claude-opus-5 answered without text/);
  reply = EXPLAIN_REPLY;
  process.env.KEYLANG_LLM_TIMEOUT_MS = "200";
  t.after(() => delete process.env.KEYLANG_LLM_TIMEOUT_MS);
  const timedOut = await runOperation(request, {});
  delete process.env.KEYLANG_LLM_TIMEOUT_MS;
  assert.deepEqual([timedOut.status, timedOut.exitCode, timedOut.written], ["failed", 2, []]);
  assert.equal(timedOut.messages.at(-1)!.text, "anthropic: no answer within 200 ms (KEYLANG_LLM_TIMEOUT_MS)");
  model.release();
  assert.deepEqual(treeBytes(root), before, "no failure touched the saved answer");
  // A source changed while the model answered: refused (1), the saved answer kept, the new code kept.
  const asked = model.prompts.length;
  const changing = runOperation(request, {});
  await model.requested(asked + 1);
  const code = "export function create(): void {\n  return;\n}\n";
  writeFileSync(join(root, "src/domain/order.ts"), code);
  const refused = await answerAll(model, changing);
  assert.deepEqual([refused.status, refused.exitCode, refused.written], ["failed", 1, []]);
  assert.deepEqual(refused.payload?.refused, ["src/domain/order.ts: changed on disk while the explanation was computed"]);
  assert.equal(refused.messages.at(-1)!.text, `nothing was written; ${EXPLAIN_FILE} keeps the saved answer`);
  assert.equal(readFileSync(join(root, EXPLAIN_FILE), "utf8"), old);
  assert.equal(readFileSync(join(root, "src/domain/order.ts"), "utf8"), code);
  writeFileSync(join(root, "src/domain/order.ts"), CHECKOUT_FILES["src/domain/order.ts"]!);
  // The saved answer changed while the model answered: the old candidate does not overwrite the new one.
  const waiting = runOperation(request, {});
  await model.requested(asked + 2);
  const newer = storedExplanation("someone-else", "short", "A newer answer.");
  writeFileSync(join(root, EXPLAIN_FILE), newer);
  const overwritten = await answerAll(model, waiting);
  assert.deepEqual([overwritten.status, overwritten.exitCode, overwritten.payload?.refused], ["failed", 1, [`${EXPLAIN_FILE}: changed on disk while the change was prepared; nothing written`]]);
  assert.equal(readFileSync(join(root, EXPLAIN_FILE), "utf8"), newer);
  writeFileSync(join(root, EXPLAIN_FILE), old);
  // An unknown ID: the CLI's message, no request.
  const unknown = await runOperation({ ...request, id: "domain.order.creat" });
  assert.deepEqual([unknown.status, unknown.exitCode, unknown.messages.at(-1)?.text], ["failed", 2, "unknown id `domain.order.creat` (did you mean `domain.order.create`?)"]);
  assert.equal(model.prompts.length, asked + 2);
  // A stream error of OpenRouter: 2, the saved answer kept.
  const sse = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end('data: {"choices":[{"delta":{"content":"Half an"}}]}\n\ndata: {"error":{"message":"overloaded"}}\n\n');
  });
  await new Promise<void>((resolve) => sse.listen(0, "127.0.0.1", resolve));
  t.after(() => sse.close());
  withConfig(root, { agent: "openrouter:some/model" });
  process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${(sse.address() as AddressInfo).port}`;
  process.env.OPENROUTER_API_KEY = "test";
  t.after(() => {
    delete process.env.OPENROUTER_BASE_URL;
    delete process.env.OPENROUTER_API_KEY;
  });
  const streamed = await runOperation(request, {});
  assert.deepEqual([streamed.status, streamed.exitCode, streamed.written, streamed.messages.at(-1)?.text], ["failed", 2, [], "openrouter: overloaded"]);
  assert.equal(readFileSync(join(root, EXPLAIN_FILE), "utf8"), old);
  // No credentials: a new session's form says why before the run; Enter is the CLI's offline summary with its note.
  withConfig(root, { agent: "anthropic:claude-opus-5" });
  const key = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  t.after(() => (process.env.ANTHROPIC_API_KEY = key));
  const offline = session(root, { cols: 220 });
  t.after(() => offline.app.close());
  await offline.app.idle();
  offline.app.state.cursor = { line: 6, col: 0 };
  explainModelForm(offline, { submit: false });
  await offline.app.idle();
  assert.match(promptNote(offline.app), /^domain\.order\.create: the saved answer is stale · no request can be made: no Anthropic credentials: .*; Enter shows the summary and the saved answer · short/);
  offline.send(KEY.enter);
  await offline.app.idle();
  const summary = explainLlmRecord(offline.app);
  const cli = spawnSync(process.execPath, [BIN, "explain", EXPLAIN_ID, "--llm"], { cwd: root, encoding: "utf8", env: { ...process.env, HOME: root } });
  assert.deepEqual([summary.status, summary.exitCode, summary.written, summary.payload.source], ["completed", 0, [], "offline"]);
  assert.equal(summary.payload.text, cli.stdout);
  assert.equal(cli.stderr, `keylang: ${summary.messages.find((message) => message.level === "warning")!.text}\n`);
  assert.match(summary.payload.text, /The old answer\.\n\nanthropic:claude-opus-5 · 2026-09-30 · stale\n$/);
  offline.send(KEY.f6);
  assert.match(offline.text(), /fn domain\.order\.create: no model, nothing asked; saved answer stale · code 0/);
  assert.equal(model.prompts.length, asked + 2, "no request without credentials");
  assert.deepEqual(treeBytes(root), before);
});

// ---------- explanations to do: inventory and dry run (ticket 33) ----------

/** The palette's inventory form: `steps` → on the list row, then `limit` and `jobs` typed into their rows; Enter unless `submit` is false. */
function explainPlanForm(s: ReturnType<typeof session>, options: { steps?: number; limit?: string; jobs?: string; submit?: boolean } = {}): void {
  s.send(KEY.ctrlP);
  for (const ch of "explain --stale") s.send(ch);
  s.send(KEY.enter);
  assert.ok(s.app.state.prompt?.kind === "explain" && s.app.state.prompt.explainPlan, s.app.state.message ?? "");
  for (let i = 0; i < (options.steps ?? 0); i++) s.send(KEY.right);
  for (const [row, value] of [["limit", options.limit], ["jobs", options.jobs]] as const) {
    if (value === undefined) continue;
    while (s.app.state.prompt!.ids![s.app.state.prompt!.index] !== row) s.send(KEY.down);
    for (const ch of value) s.send(ch);
  }
  if (options.submit !== false) s.send(KEY.enter);
}

type ExplainPlanResult = Extract<OperationResult, { kind: "explain-plan" }> & { payload: NonNullable<Extract<OperationResult, { kind: "explain-plan" }>["payload"]> };

function explainPlanRecord(app: App): ExplainPlanResult {
  const result = app.state.records.at(-1)?.result;
  assert.ok(result?.kind === "explain-plan" && result.payload !== null, JSON.stringify(result?.messages));
  return result as ExplainPlanResult;
}

test("tui: explanations to do — the stale saved list and the missing/stale brief plans are the CLI's, with waves, counts and an approximate estimate; limit and jobs are checked as the CLI checks them; an empty plan is zero work; no model, nothing written", async (t) => {
  const order = "/** Creates an order. */\nexport function create(): void {}\n";
  const { root, prompts } = await explainRepo(t, { "src/domain/order.ts": order });
  const s = session(root, { cols: 220, rows: 60 });
  t.after(() => s.app.close());
  await s.app.idle();
  const analysis = s.app.state.analysis!;
  // A doc comment (domain.order.create), a fresh brief (save), a stale brief and answer (buy), no brief (checkout), a gone brief and answer.
  mkdirSync(join(root, "keylang/explain/brief"), { recursive: true });
  writeFileSync(join(root, "keylang/explain/brief/infrastructure.store.save.md"), storedExplanation(currentBaseline(analysis, "infrastructure.store.save")!, "brief", "Saves."));
  writeFileSync(join(root, "keylang/explain/brief/application.purchase.buy.md"), storedExplanation("old", "brief", "Buys."));
  writeFileSync(join(root, "keylang/explain/application.purchase.buy.md"), storedExplanation("old", "short", "Buys the order."));
  writeFileSync(join(root, "keylang/explain/brief/domain.order.ghost.md"), storedExplanation("old", "brief", "Gone."));
  writeFileSync(join(root, "keylang/explain/domain.old.thing.md"), storedExplanation("old", "short", "Gone."));
  const before = treeBytes(root);
  const cli = (args: string[]): string => {
    const run = cliExplain(root, args);
    assert.deepEqual([run.status, run.stderr], [0, ""], args.join(" "));
    return run.stdout;
  };

  // The stale saved list: answers and briefs, stale and gone, as `explain --stale` prints them.
  explainPlanForm(s, { submit: false });
  assert.deepEqual(s.app.state.prompt?.ids, ["list", "run"], "the inventory takes no limit or jobs");
  assert.match(s.app.state.prompt!.details![0]!, /^keylang explain --stale: every saved answer and brief .*not the brief plan$/);
  assert.equal(promptNote(s.app), "explain --stale · a fresh analysis of the saved code and specs · no model, writes nothing");
  s.send(KEY.enter);
  await s.app.idle();
  const saved = explainPlanRecord(s.app);
  assert.deepEqual([saved.status, saved.exitCode, saved.written], ["completed", 0, []]);
  assert.equal(saved.payload.text, cli(["--stale"]), "the CLI's stdout, byte for byte");
  assert.ok(saved.payload.list === "stale-saved");
  assert.deepEqual(saved.payload.entries.map((entry) => [entry.id, entry.kind, entry.state, entry.place?.file ?? null]), [
    ["application.purchase.buy", "answer", "stale", "src/application/purchase.ts"],
    ["domain.old.thing", "answer", "gone", null],
    ["application.purchase.buy", "brief", "stale", "src/application/purchase.ts"],
    ["domain.order.ghost", "brief", "gone", null],
  ]);
  assert.equal(saved.payload.saved, 5);
  s.send(KEY.f6);
  let text = s.text();
  assert.match(text, /Explanations to do · stale saved answers and briefs \(keylang explain --stale\) · no model, nothing written/);
  assert.match(text, /2 stale, 2 gone of 5 saved explanation\(s\) · code 0/);
  assert.match(text, /the saved explanations themselves, not the brief plan/);
  assert.match(text, /domain\.order\.ghost \(brief\): gone \(explained 2026-09-30\) · keylang\/explain\/brief\/domain\.order\.ghost\.md · not in the snapshot, not planned/);
  // A known node opens its code; a gone ID has no place.
  s.send(KEY.tab);
  s.send(KEY.down);
  assert.match(s.app.state.message ?? "", /^domain\.old\.thing: gone · no position in the code$/);
  s.send(KEY.up);
  s.send(KEY.enter);
  assert.deepEqual([s.app.state.code?.file, s.app.state.code?.line], ["src/application/purchase.ts", 3]);
  await esc(s.send);
  await esc(s.send);
  await esc(s.send);

  // The missing plan: stale briefs included, the doc comment and the fresh brief left out, bottom-up; the estimate approximate.
  explainPlanForm(s, { steps: 1, submit: false });
  assert.deepEqual(s.app.state.prompt?.ids, ["list", "limit", "jobs", "run"]);
  assert.match(s.app.state.prompt!.details![0]!, /^keylang explain --missing --dry-run: .*stale briefs included$/);
  s.send(KEY.enter);
  await s.app.idle();
  const missing = explainPlanRecord(s.app);
  assert.ok(missing.payload.list === "briefs");
  assert.equal(missing.payload.text, cli(["--missing", "--dry-run"]));
  assert.equal(missing.payload.text, cli(["--missing", "--llm", "--dry-run"]), "--llm with --dry-run asks nothing");
  const listed = cli(["--missing"]);
  assert.equal(missing.payload.plan.map((entry) => `${entry.id} (${entry.level})\n`).join(""), listed, "the same planner as the CLI's list");
  const ids = missing.payload.plan.map((entry) => entry.id);
  assert.ok(!ids.includes("domain.order.create") && !ids.includes("infrastructure.store.save") && !ids.includes("domain.order.ghost"), ids.join(" "));
  assert.deepEqual(missing.payload.plan.filter((entry) => entry.level === "fn/type").map((entry) => [entry.id, entry.reason]), [
    ["application.purchase.buy", "stale"],
    ["presentation.terminal.checkout", "missing"],
  ]);
  assert.deepEqual(missing.payload.waves.map((wave) => wave.level), ["fn/type", "class/module", "layer"]);
  assert.deepEqual([missing.payload.jobs, missing.payload.limit, missing.payload.skipped, missing.payload.gone], [4, null, { documented: 1, fresh: 1 }, ["domain.order.ghost"]]);
  assert.ok(missing.payload.estimate !== null && missing.payload.estimate.input > 0 && missing.payload.estimate.output === ids.length * 80);
  s.send(KEY.f6);
  text = s.text();
  assert.match(text, /Explanations to do · brief plan: missing and stale briefs \(keylang explain --missing --dry-run --jobs 4\) · a preview: no model, nothing written/);
  assert.match(text, /approximate tokens: ~\d+ in, ~\d+ out — about 4 characters a token and 80 a brief; not the API's count or cost/);
  assert.match(text, /left out: 1 node\(s\) with a doc comment, 1 with a fresh brief · gone, never asked for: domain\.order\.ghost/);
  assert.match(text, /a preview, not a permission/);
  assert.match(text, /── wave 1 · fn\/type · 2 ──/);
  assert.match(text, /application\.purchase\.buy \(fn\/type\) · stale brief {2}src\/application\/purchase\.ts:3/);
  await esc(s.send);

  // A limit cuts the plan before the estimate; jobs are the batch's.
  explainPlanForm(s, { steps: 1, limit: "2", jobs: "2" });
  await s.app.idle();
  const limited = explainPlanRecord(s.app);
  assert.ok(limited.payload.list === "briefs");
  assert.equal(limited.payload.text, cli(["--missing", "--dry-run", "--limit", "2", "--jobs", "2"]));
  assert.equal(limited.payload.plan.map((entry) => `${entry.id} (${entry.level})\n`).join(""), cli(["--missing", "--limit", "2"]));
  assert.deepEqual([limited.payload.plan.length, limited.payload.candidates, limited.payload.jobs, limited.payload.estimate!.output], [2, ids.length, 2, 160]);
  assert.ok(limited.payload.estimate!.input < missing.payload.estimate!.input);
  s.send(KEY.f6);
  assert.match(s.text(), /Explanations to do: stale saved answers, or a brief plan with a dry-run estimate · explain --missing --dry-run --limit 2 --jobs 2/);
  assert.match(s.text(), /2 of \d+ brief\(s\) planned, ~\d+ in, ~160 out tokens \(approximate\)/);
  await esc(s.send);

  // 0, a fraction, a word: the form stays on the field with the CLI's message; nothing runs.
  const records = s.app.state.records.length;
  for (const [row, value] of [["limit", "0"], ["limit", "1.5"], ["limit", "abc"], ["jobs", "0"]] as const) {
    explainPlanForm(s, { steps: 1, [row]: value });
    const flag = `--${row}`;
    const run = cliExplain(root, ["--missing", "--dry-run", flag, value]);
    assert.deepEqual([run.status, run.stdout], [2, ""]);
    assert.equal(s.app.state.message, `explain: ${run.stderr.replace(/^keylang: |\n$/g, "")}`);
    assert.equal(s.app.state.prompt?.ids?.[s.app.state.prompt.index], row);
    await esc(s.send);
    const op = await runOperation({ kind: "explain-plan", root, list: "briefs", batch: "missing", [row]: Number(value) });
    assert.deepEqual([op.status, op.exitCode, op.payload], ["failed", 2, null]);
  }
  assert.equal(s.app.state.records.length, records);

  // The stale brief plan is not the stale list: only buy's brief, no answer, no gone ID.
  explainPlanForm(s, { steps: 2 });
  await s.app.idle();
  const stale = explainPlanRecord(s.app);
  assert.ok(stale.payload.list === "briefs");
  assert.deepEqual(stale.payload.plan.map((entry) => entry.id), ["application.purchase.buy"]);
  assert.equal(stale.payload.text, cli(["--stale", "--dry-run"]));
  assert.equal(stale.payload.plan.map((entry) => `${entry.id} (${entry.level})\n`).join(""), cli(["--stale", "--limit", "5"]));
  assert.notEqual(stale.payload.text, saved.payload.text);
  assert.deepEqual(treeBytes(root), before, "nothing written: no explanation, cache, stats or proposal");

  // Nothing stale: zero work, no error and no request.
  rmSync(join(root, "keylang/explain/brief/application.purchase.buy.md"));
  explainPlanForm(s, { steps: 2 });
  await s.app.idle();
  const empty = explainPlanRecord(s.app);
  assert.ok(empty.payload.list === "briefs");
  assert.deepEqual([empty.status, empty.exitCode, empty.payload.plan, empty.payload.estimate], ["completed", 0, [], { input: 0, output: 0 }]);
  assert.equal(empty.payload.text, cli(["--stale", "--dry-run"]));
  assert.ok(empty.messages.every((message) => message.level !== "error"));
  s.send(KEY.f6);
  text = s.text();
  assert.match(text, /nothing to explain: zero work, no request · code 0/);
  assert.match(text, /zero work: no node needs a brief; no request would be made/);
  await esc(s.send);

  // A dirty spec is saved first: Back plans nothing and writes nothing.
  s.app.state.cursor = { line: 2, col: 0 };
  s.send("i");
  s.send("x");
  await esc(s.send);
  const count = s.app.state.records.length;
  explainPlanForm(s, { steps: 1 });
  assert.deepEqual(s.app.state.barrier?.files, ["keylang/flows/checkout.md"]);
  await esc(s.send);
  assert.equal(s.app.state.records.length, count);
  assert.equal(readFileSync(join(root, "keylang/flows/checkout.md"), "utf8"), CHECKOUT_FLOW, "Back writes nothing");
  const after = treeBytes(root);
  assert.deepEqual([...after.keys()].filter((path) => !before.has(path)), [], "no explanation, cache, stats or proposal appeared");
  assert.equal(prompts.length, 0, "no request to the model");
});
