// The TUI without a TTY: a session driven by the same bytes a terminal sends,
// its ANSI output applied to a virtual terminal. Covers the gutter and the
// separate evidence channels, reindexing without blocking, hover, jumps,
// navigation, editing with completion and K001 while typing, MERGE by hunks,
// text → spec, the palette, F6 and its findings list, help and the catalogue
// on narrow terminals, the fixes of the 2026-09-28 reviews (MERGE and
// proposals that lose nothing, pastes and wide characters, ghost text,
// Ctrl+Space, voice), the terminal transport, and the pure pieces (input
// decoding, hunks, widths).

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { analyze, type Analysis, type AnalysisRequest } from "../src/analyze.ts";
import { formatSource } from "../src/fmt.ts";
import { runOperation, type OperationContext, type OperationRequest, type OperationResult } from "../src/operations.ts";
import { App, type AppOptions } from "../src/tui/app.ts";
import { findingsOf } from "../src/tui/findings.ts";
import { navEntries } from "../src/tui/view.ts";
import { InputDecoder } from "../src/tui/input.ts";
import { applyHunks, diffLines } from "../src/tui/merge.ts";
import { ENTER, Grid, LEAVE, renderDiff } from "../src/tui/screen.ts";
import { inline } from "../src/tui/markdown.ts";
import { editorCommand, runTerminal, splitCommand } from "../src/tui/terminal.ts";
import { textToSpec } from "../src/tui/text-to-spec.ts";
import { sliceCells, stringWidth } from "../src/tui/width.ts";
import { alive, fakeAgents } from "./agent-fixture.ts";
import { checkoutRepo, CHECKOUT_FLOW, click, KEY, locate, mouseMove } from "./tui-fixture.ts";
import { DENY_RULES, esc, fakeTerminal, FLOW_PATH, mockModel, PAID, parseForm, propose, REFUND, session, sleep, treeBytes, waitUntil, withConfig } from "./tui-helpers.ts";
import { VirtualTerminal } from "./vt.ts";

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
  assert.match(detail, /└ ID ✓ {2}static ✓ {2}tests — {2}trace ◌ {2}planned — {2}· snapshot [0-9a-f]{8} /);
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

test("tui: K on a line without an ID shows the role of the line under its parent", async (t) => {
  const s = session(checkoutRepo(t, { [FLOW_PATH]: `${CHECKOUT_FLOW}- invariant the order is saved once\n` }));
  t.after(() => s.app.close());
  await s.app.idle();
  for (let i = 0; i < 8; i++) s.send(KEY.down);
  s.send("K");
  assert.ok(s.app.state.hover, s.app.state.message ?? "");
  assert.match(s.app.state.hover!.lines[0]!.text, /^invariant in a flow — an invariant: text/);
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
  s.send("\x1b");
  await sleep(40);
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
  // In MERGE `i` is no key of Edit: the label does not advertise it.
  assert.match(s.text(), / Edit {2}/);
  assert.doesNotMatch(s.text(), /Edit \(i\)/);
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
  app.attach({ write: (ansi) => vt.feed(ansi) }, 100, 24);
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
  // The catalogue follows the keys of the mode, grouped, from the same registry as the palette; ↓ scrolls it.
  assert.match(s.text(), /Actions · Ctrl\+P or : finds each by its name or CLI alias:/);
  assert.match(s.text(), /Check again · F5/);
  assert.match(s.text(), /↑↓ PgUp PgDn scroll · any other key closes/);
  for (let i = 0; i < 400; i++) s.send(KEY.down);
  assert.equal(s.app.state.help, true);
  assert.match(s.text(), /Open <file> for each of the \d+ file\(s\)/);
  assert.match(s.text(), /About keylang/);
  s.send("x");
  assert.equal(s.app.state.help, false);
  // The palette action "About keylang" shows the version.
  s.send(KEY.ctrlP);
  for (const ch of "version") s.send(ch);
  s.send(KEY.enter);
  assert.match(s.lines().at(-2)!, /keylang \d+\.\d+\.\d+/);
});

// 04: the full findings list of the current analysis in F6.

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
  app.attach({ write: (ansi) => vt.feed(ansi) }, 100, 24);
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

// A file with mixed line endings: MERGE compares both sides without `\r`, so only the real change is a hunk, and the write keeps every kept line's ending.
test("tui: a proposal to a file with mixed line endings is one hunk of its real change; kept lines keep their endings", async (t) => {
  const mixedFlow = CHECKOUT_FLOW.replace("# flow checkout\n", "# flow checkout\r\n");
  const mixedCode = "export const a = 1;\r\nexport const b = 2;\r\nexport const c = 3;\n";
  const cases = [
    { path: FLOW_PATH, disk: mixedFlow, proposal: `${CHECKOUT_FLOW}<!-- added -->\n`, written: `${mixedFlow}<!-- added -->\n` },
    { path: "src/domain/mixed.ts", disk: mixedCode, proposal: "export const a = 1;\nexport const b = 2;\nexport const c = 3;\n\nexport const d = 4;\n", written: `${mixedCode}\r\nexport const d = 4;\r\n` },
  ];
  for (const { path, disk, proposal, written } of cases) {
    const root = checkoutRepo(t, { [path]: disk });
    propose(root, path, proposal);
    const s = session(root);
    t.after(() => s.app.close());
    await s.app.idle();
    s.send("m");
    // The open file's proposal opens at once; another file's is picked from the proposals list.
    if (s.app.state.merge === null) s.send("\r");
    assert.equal(s.app.state.merge?.path, path, `${s.app.state.message} ${s.text()}`);
    assert.deepEqual(s.app.state.merge?.hunks.map((hunk) => hunk.baseCount), [0], `${path}: ${JSON.stringify(s.app.state.merge?.hunks)}`);
    s.send("a");
    s.send("w");
    await s.app.idle();
    assert.equal(readFileSync(join(root, path), "utf8"), written, path);
  }
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
  assert.match(s.app.state.message ?? "", /paste: MERGE takes no text/);
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

/** A session in edit mode with the cursor on a new item of the checkout flow, its ghost request on the way to a model that answers in 2 s. */
async function ghostInFlight(t: { after: (f: () => void) => void }, specs: Record<string, string> = {}): Promise<{ s: ReturnType<typeof session>; model: { prompts: string[]; aborted: number } }> {
  const root = checkoutRepo(t, specs);
  withConfig(root, { agent: "anthropic:claude-opus-5", ghost: { delay: 0 } });
  const model = await mockModel(t, "- step domain.order.create", 2000);
  const s = session(root, { cols: 150 });
  t.after(() => s.app.close());
  await s.app.idle();
  s.send("i");
  for (let i = 0; i < 7; i++) s.send(KEY.down);
  s.send(KEY.end);
  s.send(KEY.enter);
  await waitUntil(() => model.prompts.length === 1, "the ghost request");
  return { s, model };
}

test("tui: Esc aborts a ghost request in flight, silently and without a ghost line", async (t) => {
  const { s, model } = await ghostInFlight(t);
  s.send("\x1b");
  // The connection closes on the model's side a moment after the abort: wait for it, never assume it.
  await waitUntil(() => model.aborted === 1, "the aborted request");
  await s.app.idle();
  assert.equal(s.app.state.mode, "view");
  assert.equal(s.app.state.message, null, "a cancel is no error and no timeout");
  assert.equal(s.app.state.ghost, null);
  assert.equal(model.prompts.length, 1);
  assert.equal(model.aborted, 1);
});

test("tui: ghost through an agent CLI: a newer request kills the older agent, Esc kills the one in flight, close() leaves none alive", async (t) => {
  const root = checkoutRepo(t);
  withConfig(root, { ghost: { delay: 0 } });
  const fake = fakeAgents(t, ["claude"], { modes: "hang,ok,hang", reply: "- step domain.order.create" });
  const saved = { PATH: process.env.PATH, KEYLANG_AGENT: process.env.KEYLANG_AGENT, FAKE_AGENT_LOG: process.env.FAKE_AGENT_LOG, FAKE_AGENT_MODES: process.env.FAKE_AGENT_MODES, FAKE_AGENT_REPLY: process.env.FAKE_AGENT_REPLY };
  Object.assign(process.env, { PATH: `${fake.bin}:${process.env.PATH ?? ""}`, KEYLANG_AGENT: "cli:claude" }, fake.env);
  const s = session(root, { cols: 150 });
  t.after(() => {
    s.app.close();
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  await s.app.idle();
  s.send("i");
  for (let i = 0; i < 7; i++) s.send(KEY.down);
  s.send(KEY.end);
  s.send(KEY.enter);
  await waitUntil(() => fake.pids(1).length === 2, "the first agent, hanging");
  // The same place asked again: the first agent's group is killed, the second one answers.
  s.send(KEY.end);
  await waitUntil(() => s.app.state.ghost !== null, "the second agent's variants");
  assert.deepEqual(s.app.state.ghost!.variants.map((v) => v.trim()), ["- step domain.order.create"]);
  await waitUntil(() => fake.pids(1).every((pid) => !alive(pid)), "the first agent's group to die");
  s.send(KEY.end);
  await waitUntil(() => fake.pids(3).length === 2, "the third agent, hanging");
  s.send("\x1b");
  await waitUntil(() => fake.pids(3).every((pid) => !alive(pid)), "Esc to kill the third agent");
  await s.app.idle();
  assert.equal(s.app.state.message, null, "a cancel is no error");
  assert.equal(fake.calls().length, 3);
  s.app.close();
  for (const n of [1, 2, 3]) for (const pid of fake.pids(n)) await waitUntil(() => !alive(pid), `agent ${n} to be gone after close()`);
});

test("tui: typing on, Ctrl+Space, another buffer and close() each abort the ghost request in flight", async (t) => {
  await t.test("typing", async (t) => {
    const { s, model } = await ghostInFlight(t);
    s.send("s");
    await waitUntil(() => model.aborted === 1, "the aborted request");
    await s.app.idle();
    assert.equal(s.app.state.message, null);
    assert.equal(s.app.state.ghost, null);
  });
  await t.test("Ctrl+Space", async (t) => {
    const { s, model } = await ghostInFlight(t);
    s.send(KEY.ctrlSpace);
    await waitUntil(() => model.aborted === 1, "the aborted request");
    await s.app.idle();
    assert.equal(s.app.state.ghost, null);
  });
  await t.test("another buffer", async (t) => {
    const { s, model } = await ghostInFlight(t, { "keylang/flows/refund.md": REFUND });
    s.send("\x1b[12~");
    const other = locate(s.lines(), "keylang/flows/refund");
    s.send(click(other.x + 1, other.y));
    assert.equal(s.app.state.current, "keylang/flows/refund.md");
    await waitUntil(() => model.aborted === 1, "the aborted request");
    await s.app.idle();
    assert.equal(s.app.state.message, null);
    assert.equal(s.app.state.ghost, null);
  });
  await t.test("close()", async (t) => {
    const { s, model } = await ghostInFlight(t);
    s.app.close();
    await waitUntil(() => model.aborted === 1, "the aborted request");
  });
});

test("tui: close() aborts the agent's flow draft in flight", async (t) => {
  const root = checkoutRepo(t);
  withConfig(root, { agent: "anthropic:claude-opus-5" });
  const model = await mockModel(t, "```markdown\n# flow checkout\n\n- trigger presentation.terminal.checkout\n  - step application.purchase.buy\n```", 2000);
  const s = session(root, { cols: 150 });
  t.after(() => s.app.close());
  await s.app.idle();
  for (let i = 0; i < 5; i++) s.send(KEY.down);
  s.send(KEY.ctrlSpace);
  await waitUntil(() => model.prompts.length === 1, "the draft request");
  s.app.close();
  await waitUntil(() => model.aborted === 1, "the aborted draft request");
  assert.equal(existsSync(join(root, ".keylang/proposals", FLOW_PATH)), false, "nothing is written");
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
  assert.match(s.text(), /s {18}find a node/);
  assert.match(s.text(), /t {18}explained map/);
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

// 37: the whole catalogue, the help from it, and a narrow terminal.

/** The palette's ids for `query`, as Ctrl+P lists them; Esc closes it again. */
async function paletteIds(s: ReturnType<typeof session>, query: string): Promise<string[]> {
  s.send(KEY.ctrlP);
  for (const ch of query) s.send(ch);
  const ids = [...(s.app.state.prompt?.ids ?? [])];
  await esc(s.send);
  return ids;
}

test("tui: every CLI alias of the design's matrix finds its action; unavailable ones say why and where to go; protocol servers are not jobs", async (t) => {
  const s = session(checkoutRepo(t));
  t.after(() => s.app.close());
  await s.app.idle();
  const matrix: [string, string][] = [
    ["init", "init"],
    ["init --check", "init"],
    ["map", "map"],
    ["map --check", "map-check"],
    ["keylang check", "full-check"],
    ["check --explain-edge", "explain-edge"],
    ["fmt --check", "fmt"],
    ["baseline", "baseline"],
    ["agents", "agents"],
    ["feature", "feature"],
    ["draft flow", "draft-flow"],
    ["draft rules", "draft-rules"],
    ["draft map", "draft-layout"],
    ["code-to-spec --since", "code-to-spec"],
    ["spec-to-code", "spec-to-code"],
    ["spec-to-code --apply", "apply-code"],
    ["wire --check", "wire"],
    ["explain", "explain"],
    ["explain --llm", "explain-llm"],
    ["explain --missing", "explain-plan"],
    ["explain --stale --llm", "explain-batch"],
    ["doctor", "doctor"],
    ["parse --json", "parse"],
    ["trace-plan", "trace-plan"],
    ["help", "help"],
    ["version", "version"],
    ["text to spec", "text-to-spec"],
    ["merge", "merge"],
    ["undo merge", "undo-merge"],
    ["proposals", "proposals"],
    ["config", "open-config"],
    ["context", "context"],
    ["search", "search"],
    ["go to code", "go-to-code"],
    ["explained map", "toggle-map"],
    ["voice", "voice"],
    ["agent draft", "agent-draft"],
    ["export", "export"],
  ];
  for (const [query, id] of matrix) assert.ok((await paletteIds(s, query)).includes(id), `${query} → ${id}`);
  // lsp, mcp, web and hook stay with their clients: no action pretends to run them as a job here.
  const ids = new Set((await paletteIds(s, "")).filter((id) => !id.startsWith("open:")));
  for (const transport of ["lsp", "mcp", "web", "hook", "hook-stop"]) assert.ok(!ids.has(transport), transport);
  // Unavailable: listed with the reason, and the way to what it needs.
  s.send(KEY.ctrlP);
  for (const ch of "agent draft") s.send(ch);
  assert.equal(s.app.state.prompt!.ids![0], "agent-draft");
  assert.match(s.app.state.prompt!.note ?? "", /no agent in keylang\.json → Open keylang\.json \(set agent\) · Environment diagnostics/);
  s.send(KEY.enter);
  assert.match(s.app.state.message ?? "", /Agent draft of the flow under the cursor \(MERGE\): no agent/);
  assert.equal(s.app.state.mode, "view");
  s.send(KEY.ctrlP);
  for (const ch of "spec-to-code --apply") s.send(ch);
  assert.match(s.app.state.prompt!.note ?? "", /no spec-to-code run yet → Spec to code/);
  await esc(s.send);
  // A model action that still works without one says what is offline and where to set it up.
  s.send(KEY.ctrlP);
  for (const ch of "draft rules") s.send(ch);
  assert.match(s.app.state.prompt!.note ?? "", /algo works offline; the model modes need an agent → Open keylang\.json · Environment diagnostics/);
  await esc(s.send);
  // The config is one action away: it opens keylang.json in the editor.
  s.send(KEY.ctrlP);
  for (const ch of "config") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.current, "keylang.json");
});

test("tui: editing types ? and :, so the footer and the palette name Ctrl+P; the help says so and lists the edit keys", async (t) => {
  const root = checkoutRepo(t);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  assert.match(s.lines().at(-1)!, /\? keys · Ctrl\+P actions $/);
  s.send("i");
  assert.match(s.lines().at(-1)!, /Esc view · Ctrl\+P actions, help $/);
  assert.doesNotMatch(s.lines().at(-1)!, /\? keys/);
  s.send("?");
  assert.equal(s.app.state.help, false);
  assert.match(s.app.state.buffers.get("keylang/flows/checkout.md")!.text, /^\?# flow checkout/);
  // The palette in editing: no plain key is advertised; Ctrl+S, F-keys and Ctrl+G are.
  s.send(KEY.ctrlP);
  for (const ch of "help") s.send(ch);
  assert.equal(s.app.state.prompt!.items[0], "Keys and help");
  await esc(s.send);
  s.send(KEY.ctrlP);
  for (const ch of "save") s.send(ch);
  assert.equal(s.app.state.prompt!.items[0], "Save the file (Ctrl+S)");
  await esc(s.send);
  s.send(KEY.ctrlP);
  for (const ch of "help") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.help, true);
  assert.match(s.text(), /keys · edit/);
  assert.match(s.text(), /\? and :\s+typed here: Ctrl\+P → Keys and help opens this/);
  assert.match(s.text(), /Tab \/ Alt\+\]\s+ghost line: take \/ next/);
  assert.match(s.text(), /Actions · Ctrl\+P finds each/);
  // The file is not written by any of it.
  assert.equal(readFileSync(join(root, "keylang/flows/checkout.md"), "utf8"), CHECKOUT_FLOW);
});

test("tui: Ctrl+G from the palette over a dirty paragraph keeps the prose and changes only the buffer until Ctrl+S", async (t) => {
  const root = checkoutRepo(t);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  for (let i = 0; i < 2; i++) s.send(KEY.down);
  s.send("i");
  s.send(KEY.end);
  for (const ch of " Then call application.purchase.buy.") s.send(ch);
  s.send(KEY.ctrlP);
  for (const ch of "text to spec") s.send(ch);
  assert.equal(s.app.state.prompt!.ids![0], "text-to-spec");
  s.send(KEY.enter);
  assert.equal(s.app.state.mode, "merge");
  s.send("a");
  s.send("w");
  const buffer = s.app.state.buffers.get("keylang/flows/checkout.md")!;
  assert.match(buffer.text, /Checkout from the terminal\. Then call application\.purchase\.buy\.\n- step application\.purchase\.buy/);
  assert.equal(readFileSync(join(root, "keylang/flows/checkout.md"), "utf8"), CHECKOUT_FLOW);
  // The old quick keys still work: Ctrl+S writes the buffer.
  s.send("i");
  s.send(KEY.ctrlS);
  assert.equal(readFileSync(join(root, "keylang/flows/checkout.md"), "utf8"), buffer.text);
});

test("tui: on 80×24 search → a two-field form → a field error → Run → F6 → Esc, by keys only", async (t) => {
  const root = checkoutRepo(t);
  const s = session(root, { cols: 80, rows: 24 });
  t.after(() => s.app.close());
  await s.app.idle();
  const before = treeBytes(root);
  for (let i = 0; i < 5; i++) s.send(KEY.down);
  const place = { ...s.app.state.cursor };
  s.send(KEY.ctrlP);
  for (const ch of "edge") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.prompt?.kind, "explain-edge");
  // Run with an empty second id: the error is on its field and the typed first id stays.
  s.send(KEY.down);
  s.send(KEY.enter);
  assert.equal(s.app.state.prompt?.kind, "explain-edge");
  assert.equal(s.app.state.prompt!.ids![s.app.state.prompt!.index], "to");
  assert.equal(s.app.state.prompt!.edge!.from, "application.purchase.buy");
  assert.match(s.lines().at(-2)!, /two ids are needed/);
  // A note longer than the line is also shown whole in the form's box.
  for (const ch of "domain.ordr") s.send(ch);
  assert.match(s.text(), /│ domain\.ordr: not in the current snapshot · did you mean domain\.order\?/);
  s.send("\x7f");
  for (const ch of "er") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.prompt, null);
  await s.app.idle();
  assert.equal(s.app.state.records.at(-1)!.status, "completed");
  s.send(KEY.f6);
  // Below 100 columns the panel takes the whole width: no side panel squeezes it.
  assert.match(s.lines()[1]!, /^ RESULTS · F6 · 1 run\(s\)/);
  assert.doesNotMatch(s.lines()[2]!, /│ /);
  assert.match(s.lines()[1]!, /Esc back\s*$/);
  await esc(s.send);
  assert.equal(s.app.state.results.open, false);
  assert.deepEqual(s.app.state.cursor, place);
  assert.deepEqual(treeBytes(root), before);
});

test("tui: on 60×18 the help and a long report scroll to their ends; resize 120↔60 keeps a form, a selection and the report place", async (t) => {
  const root = checkoutRepo(t);
  const s = session(root, { cols: 60, rows: 18 });
  t.after(() => s.app.close());
  await s.app.idle();
  // The footer keeps the way to the help and the palette on a narrow line.
  assert.match(s.lines().at(-1)!, /\? keys · Ctrl\+P actions $/);
  s.send("?");
  assert.match(s.text(), /keys · view/);
  for (let i = 0; i < 40; i++) s.send("\x1b[6~");
  assert.match(s.text(), /Open <file> for each of the \d+ file\(s\) — type its name/);
  for (const line of s.lines()) assert.equal(stringWidth(line), 60);
  s.send("x");
  // A long report: the parse tree; ↓ after Tab and a page reach its end, ←→ its long rows.
  parseForm(s, "json");
  await s.app.idle();
  s.send(KEY.f6);
  s.send(KEY.tab);
  assert.match(s.lines()[1]!, /←→ scroll · Esc back\s*$/);
  s.send(KEY.right);
  assert.equal(s.app.state.results.left, 16);
  assert.ok(s.lines().some((line) => /^ ▌ …/.test(line)), s.text());
  s.send("\x1b[D"); // ←
  assert.equal(s.app.state.results.left, 0);
  for (let i = 0; i < 40; i++) s.send("\x1b[6~");
  assert.ok(s.app.state.results.top > 0);
  // The last page ends at the report's end and stays a full panel.
  assert.match(s.lines().at(-3)!, /^ ▌ \]/);
  s.send(KEY.right);
  const results = { ...s.app.state.results };
  // Resize while the report is open: the selection, the scroll and the sideways place stay.
  for (const [cols, rows] of [[120, 30], [60, 18]] as const) {
    s.vt.resize(cols, rows);
    s.app.resize(cols, rows);
    for (const line of s.lines()) assert.equal(stringWidth(line), cols);
  }
  assert.deepEqual({ ...s.app.state.results }, results);
  s.send(KEY.tab);
  await esc(s.send);
  // A form with typed fields survives a resize too, and Esc brings back the place.
  s.send(KEY.ctrlP);
  for (const ch of "explain edge") s.send(ch);
  s.send(KEY.enter);
  for (const ch of "domain.order") s.send(ch);
  s.send(KEY.down);
  for (const ch of "infrastructure.store") s.send(ch);
  const prompt = structuredClone(s.app.state.prompt);
  s.vt.resize(120, 30);
  s.app.resize(120, 30);
  s.vt.resize(60, 18);
  s.app.resize(60, 18);
  assert.deepEqual(s.app.state.prompt, prompt);
  assert.match(s.lines().at(-2)!, /explain edge: domain\.order ↔ infrastructure\.store/);
  await esc(s.send);
  assert.equal(s.app.state.prompt, null);
});

test("tui: below 100 columns one side panel is shown — the focused one, else the last opened; widening shows both again", async (t) => {
  const s = session(checkoutRepo(t), { cols: 80, rows: 24 });
  t.after(() => s.app.close());
  await s.app.idle();
  assert.match(s.text(), /NAVIGATION/);
  s.send("\x1b[12~"); // F2
  assert.equal(s.app.state.focus, "files");
  assert.match(s.text(), /FILES/);
  assert.doesNotMatch(s.text(), /NAVIGATION/);
  s.send(KEY.tab);
  assert.equal(s.app.state.focus, "editor");
  assert.match(s.text(), /FILES/);
  s.send(KEY.tab);
  assert.equal(s.app.state.focus, "nav");
  assert.match(s.text(), /NAVIGATION/);
  assert.doesNotMatch(s.text(), /FILES/);
  s.vt.resize(120, 24);
  s.app.resize(120, 24);
  assert.match(s.text(), /NAVIGATION/);
  assert.match(s.text(), /FILES/);
  // Under 60 columns no panel fits: the key says so instead of doing nothing visible.
  s.vt.resize(50, 16);
  s.app.resize(50, 16);
  s.send("\x1b[12~");
  assert.match(s.app.state.message ?? "", /side panels need 60 columns \(now 50\)/);
});

test("width: sliceCells keeps whole clusters, blanks a wide one cut by the edge and marks hidden text", () => {
  assert.equal(sliceCells("abcdef", 0, 6), "abcdef");
  assert.equal(sliceCells("abcdefgh", 0, 6), "abcde…");
  assert.equal(sliceCells("abcdefgh", 2, 4), "…cd…");
  assert.equal(sliceCells("a支付b", 2, 4), "…付b");
  assert.equal(sliceCells("支付支付支付", 1, 5), "…付…");
  assert.equal(sliceCells("👨‍👩‍👧 done", 0, 3), "👨‍👩‍👧…");
});
