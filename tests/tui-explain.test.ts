// TUI explanations, each against the CLI: offline explanations of ids and
// codes, one explanation by the model, the inventory of explanations to do,
// and the brief batch with the model.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { runOperation, type OperationResult } from "../src/operations.ts";
import { currentBaseline } from "../src/explain-llm.ts";
import { App } from "../src/tui/app.ts";
import { checkoutRepo, CHECKOUT_FILES, CHECKOUT_FLOW, KEY } from "./tui-fixture.ts";
import { answerAll, askedId, BIN, briefReply, esc, explainBatchForm, heldModel, mockModel, promptNote, session, sleep, treeBytes, withConfig } from "./tui-helpers.ts";

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

const storedExplanation = (closure: string, detail: "short" | "full" | "brief", text: string): string =>
  `<!-- keylang:explain agent=anthropic:claude-opus-5 date=2026-09-30 closure=${closure} lang=en detail=${detail} -->\n${text}\n`;

test("tui: a saved full answer reads in sections: its `##` headings are titles of the explain hover (c4-zoom/06)", async (t) => {
  const order = "/** Creates an order. */\nexport function create(): void {}\n";
  const { root, prompts } = await explainRepo(t, { "src/domain/order.ts": order });
  const s = session(root, { cols: 200, rows: 50 });
  t.after(() => s.app.close());
  await s.app.idle();
  const id = "domain.order.create";
  mkdirSync(join(root, "keylang/explain"), { recursive: true });
  const full = "## What it is for\nCreates an order.\n\n## Calls\nNothing it calls is unresolved.";
  writeFileSync(join(root, `keylang/explain/${id}.md`), storedExplanation(currentBaseline(s.app.state.analysis!, id)!, "full", full));
  s.app.state.cursor = { line: 6, col: 0 };
  s.send("e");
  const lines = s.app.state.hover!.lines;
  const at = (text: string): string | undefined => lines.find((line) => line.text === text)?.kind;
  assert.deepEqual([at("What it is for"), at("Calls"), at("Creates an order.")], ["title", "title", "text"], lines.map((line) => `${line.kind}: ${line.text}`).join("\n"));
  assert.ok(!lines.some((line) => line.text.startsWith("## ")), "no heading mark is left");
  assert.ok(lines.some((line) => line.text === "saved full answer · anthropic:claude-opus-5 · 2026-09-30 · fresh"));
  assert.equal(prompts.length, 0, "no model is asked");
});

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
  // The first paragraph has four words: a shorter one before more text is a remark the answer drops (review-ops 6).
  reply = "Makes an order here.\n\nMore than a brief.";
  explainModelForm(s, { steps: 2, submit: false });
  await s.app.idle();
  assert.match(promptNote(s.app), /^domain\.order\.create: no saved brief · asks anthropic:claude-opus-5 once, then saves keylang\/explain\/brief\/domain\.order\.create\.md · brief \(←→\)/);
  s.send(KEY.enter);
  await model.requested(2);
  model.release();
  await s.app.idle();
  const brief = explainLlmRecord(s.app);
  assert.deepEqual([brief.status, brief.written, brief.payload.detail, brief.payload.answer?.text], ["completed", [`keylang/explain/brief/${EXPLAIN_ID}.md`], "brief", "Makes an order here."]);
  assert.equal(s.app.state.briefs.get(EXPLAIN_ID)?.text, "Makes an order here.", "the session reads the new brief");
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
  assert.deepEqual(s.app.state.prompt?.ids, ["list", "limit", "jobs", "run", "batch"], "the last row is the batch itself (ticket 34)");
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
  // The checkout fixture has no README and no manifest description: the repository itself is asked last (c4-zoom/01).
  assert.deepEqual(missing.payload.waves.map((wave) => wave.level), ["fn/type", "class/module", "layer", "system"]);
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

// ---------- brief batch with the model (ticket 34) ----------

type ExplainBatchResult = Extract<OperationResult, { kind: "explain-batch" }> & { payload: NonNullable<Extract<OperationResult, { kind: "explain-batch" }>["payload"]> };

function explainBatchRecord(app: App): ExplainBatchResult {
  const result = app.state.records.at(-1)?.result;
  assert.ok(result?.kind === "explain-batch" && result.payload !== null, JSON.stringify(result?.messages));
  return result as ExplainBatchResult;
}

/** `keylang explain …` run without blocking this process, so the held model in it can answer. */
function cliExplainAsync(root: string, args: string[]): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, "explain", ...args], { cwd: root });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

const BATCH_FNS = ["application.purchase.buy", "domain.order.create", "infrastructure.store.save", "presentation.terminal.checkout"];

const BATCH_MODULES = ["application.purchase", "domain.order", "infrastructure.store", "presentation.terminal"];

const BATCH_LAYERS = ["application", "domain", "infrastructure", "presentation"];

test("tui: the brief batch plans again and asks jobs at a time within a wave, bottom-up, the parent's prompt carrying its members' new briefs; each brief is saved as it lands; a node that cannot be written fails alone with code 1, as in the CLI; a rerun asks only for it", async (t) => {
  const root = checkoutRepo(t);
  withConfig(root, { agent: "anthropic:claude-opus-5" });
  const model = await heldModel(t, briefReply);
  // The brief of checkout cannot be written: a directory stands at its path.
  const blocked = "keylang/explain/brief/presentation.terminal.checkout.md";
  mkdirSync(join(root, blocked), { recursive: true });
  const s = session(root, { cols: 240, rows: 70 });
  t.after(() => s.app.close());
  await s.app.idle();
  const before = outsideExplain(root);
  explainBatchForm(s, { jobs: "2", submit: false });
  await s.app.idle();
  assert.equal(promptNote(s.app), "explain --missing --llm --jobs 2 · asks anthropic:claude-opus-5 once a brief · plans again on a fresh analysis of the saved files; 2 request(s) at a time within a wave, bottom-up; each brief saved to keylang/explain/brief/ as it lands");
  assert.equal(model.prompts.length, 0, "the form asks nothing");
  // The dry run of the same form asks nothing and writes nothing.
  const tree = treeBytes(root);
  s.send(KEY.up);
  assert.equal(s.app.state.prompt?.ids?.[s.app.state.prompt.index], "run");
  s.send(KEY.enter);
  await s.app.idle();
  assert.equal(explainPlanRecord(s.app).payload.text, cliExplain(root, ["--missing", "--dry-run", "--jobs", "2"]).stdout);
  assert.deepEqual([model.prompts.length, treeBytes(root)], [0, tree]);
  explainBatchForm(s, { jobs: "2" });
  const record = s.app.state.records.at(-1)!;
  await model.requested(2);
  await sleep(150);
  assert.equal(model.prompts.length, 2, "jobs 2: a third request waits for one of them");
  assert.equal(record.status, "running");
  // Release what is held, round by round: never more than two requests in flight.
  const inFlight: number[] = [];
  const progress = new Set<string>();
  let released = 0;
  while (record.status === "running") {
    if (record.progress !== null) progress.add(record.progress);
    inFlight.push(model.prompts.length - released);
    released = model.prompts.length;
    model.release();
    await sleep(30);
  }
  await s.app.idle();
  assert.ok(Math.max(...inFlight) === 2, inFlight.join(" "));
  assert.ok([...progress].some((text) => /^\d+\/13 · \S+$/.test(text)), [...progress].join(" | "));
  assert.equal(s.app.state.results.open, false, "progress and the result never open F6");
  // Bottom-up: the functions, then the modules, then the layers, then the repository itself.
  const asked = model.prompts.map(askedId);
  assert.deepEqual([asked.slice(0, 4).sort(), asked.slice(4, 8).sort(), asked.slice(8, 12).sort(), asked.slice(12)], [BATCH_FNS, BATCH_MODULES, BATCH_LAYERS, ["@system"]]);
  assert.match(model.prompts.at(-1)!, /^- layer `domain`: Brief of domain\.$/m, "the repository's prompt carries the new layer briefs");
  const promptOf = (id: string): string => model.prompts.find((prompt) => askedId(prompt) === id)!;
  assert.match(promptOf("application.purchase"), /^- fn `application\.purchase\.buy`: Brief of application\.purchase\.buy\.$/m);
  assert.match(promptOf("application"), /^- module `application\.purchase`: Brief of application\.purchase\.$/m);
  assert.match(promptOf("presentation.terminal"), /^- fn `presentation\.terminal\.checkout`$/m, "a failed brief is not in its parent's prompt");
  const batch = explainBatchRecord(s.app);
  const reason = `${blocked}: a directory`;
  assert.deepEqual([batch.status, batch.exitCode, batch.payload.stopped, batch.payload.failed, batch.payload.notStarted], ["completed", 1, null, [{ id: "presentation.terminal.checkout", reason }], []]);
  assert.equal(batch.payload.done.length, 12);
  assert.deepEqual(batch.written, batch.payload.done.map((entry) => entry.file));
  assert.equal(batch.payload.text, `explained 12 of 13 node(s)\nfailed: presentation.terminal.checkout: ${reason}\n`);
  const today = new Date().toISOString().slice(0, 10);
  const closure = currentBaseline(s.app.state.analysis!, "application.purchase.buy")!;
  assert.equal(readFileSync(join(root, "keylang/explain/brief/application.purchase.buy.md"), "utf8"), `<!-- keylang:explain agent=anthropic:claude-opus-5 date=${today} closure=${closure} lang=en detail=brief -->\nBrief of application.purchase.buy.\n`);
  assert.equal(s.app.state.briefs.get("domain")?.text, "Brief of domain.", "the session reads the new briefs");
  assert.deepEqual(outsideExplain(root), before, "only briefs are written: no map, spec, code or cache");
  assert.match(s.app.state.message ?? "", /explain --missing --llm --jobs 2: partial: 12 of 13 brief\(s\) written, 1 failed · code 1 · F6 shows the report/);
  s.send(KEY.f6);
  const text = s.text();
  assert.match(text, /Explain briefs with the model · keylang explain --missing --llm --jobs 2 · lang en · agent anthropic:claude-opus-5/);
  assert.match(text, /13 planned · 12 written · 1 failed · 0 not started · jobs 2 · limit none/);
  assert.match(text, /application\.purchase\.buy \(fn\/type\) · written keylang\/explain\/brief\/application\.purchase\.buy\.md/);
  assert.match(text, /presentation\.terminal\.checkout \(fn\/type\) · failed: keylang\/explain\/brief\/presentation\.terminal\.checkout\.md: a directory/);
  assert.match(text, /── layer ──/);
  assert.match(text, /── system ──/);
  // Enter on a node opens its code.
  s.send(KEY.tab);
  s.send(KEY.enter);
  assert.equal(s.app.state.code?.file, "src/application/purchase.ts");
  await esc(s.send);
  await esc(s.send);
  await esc(s.send);

  // The CLI plans the same one node and fails it the same way: code 1, the per-node line, the progress line.
  const cli = await answerAll(model, cliExplainAsync(root, ["--missing", "--llm"]));
  assert.deepEqual([cli.status, cli.stdout, cli.stderr], [1, `explained 0 of 1 node(s)\nfailed: presentation.terminal.checkout: ${reason}\n`, `[1/1] presentation.terminal.checkout: failed: ${reason}\n`]);
  // Once the path is free, a rerun asks only for that node: the fresh briefs are not asked for again.
  rmSync(join(root, blocked), { recursive: true });
  const asks = model.prompts.length;
  explainBatchForm(s);
  const rerun = s.app.state.records.at(-1)!;
  while (rerun.status === "running") {
    model.release();
    await sleep(20);
  }
  await s.app.idle();
  const again = explainBatchRecord(s.app);
  assert.deepEqual([again.status, again.exitCode, again.payload.done.map((entry) => entry.id), again.payload.text], ["completed", 0, ["presentation.terminal.checkout"], "explained 1 of 1 node(s)\n"]);
  assert.deepEqual(model.prompts.slice(asks).map(askedId), ["presentation.terminal.checkout"]);
  const cliAgain = cliExplain(root, ["--missing", "--llm"]);
  assert.deepEqual([cliAgain.status, cliAgain.stdout], [0, "nothing to explain\n"]);
});

test("tui: Cancel after the first brief keeps it and writes no other — cancelled, not done — and a rerun asks only for the rest; a source changed during a batch stops it as outdated with the new bytes kept; a brief written meanwhile is not written over", async (t) => {
  const root = checkoutRepo(t);
  withConfig(root, { agent: "anthropic:claude-opus-5" });
  const model = await heldModel(t, briefReply);
  const s = session(root, { cols: 240, rows: 70 });
  t.after(() => s.app.close());
  await s.app.idle();
  const first = join(root, "keylang/explain/brief/application.purchase.buy.md");
  explainBatchForm(s, { jobs: "1" });
  const record = s.app.state.records.at(-1)!;
  await model.requested(1);
  model.release();
  await model.requested(2);
  assert.ok(existsSync(first), "the first brief landed before the second request");
  // While the batch writes, a save waits with the text kept in the buffer; resize and Esc change nothing.
  s.app.state.cursor = { line: 2, col: 0 };
  s.send("i");
  s.send("x");
  const edited = s.app.state.buffers.get("keylang/flows/checkout.md")!.text;
  assert.notEqual(edited, CHECKOUT_FLOW);
  s.send(KEY.ctrlS);
  assert.match(s.app.state.message ?? "", /is writing files: try again when it finishes; your text stays in the buffer/);
  await esc(s.send);
  s.vt.resize(100, 30);
  s.app.resize(100, 30);
  s.vt.resize(240, 70);
  s.app.resize(240, 70);
  await esc(s.send);
  assert.deepEqual([s.app.state.buffers.get("keylang/flows/checkout.md")!.text, readFileSync(join(root, "keylang/flows/checkout.md"), "utf8"), record.status], [edited, CHECKOUT_FLOW, "running"]);
  s.send(KEY.ctrlP);
  for (const ch of "cancel") s.send(ch);
  s.send(KEY.enter);
  await s.app.idle();
  for (let i = 0; i < 100 && model.dropped() === 0; i++) await sleep(10);
  assert.equal(model.dropped(), 1, "the request in flight is closed");
  const cancelled = explainBatchRecord(s.app);
  assert.deepEqual([record.status, cancelled.status, cancelled.exitCode, cancelled.payload.stopped], ["cancelled", "cancelled", null, "cancelled"]);
  assert.deepEqual(cancelled.payload.done, [{ id: "application.purchase.buy", file: "keylang/explain/brief/application.purchase.buy.md" }]);
  assert.deepEqual(cancelled.written, ["keylang/explain/brief/application.purchase.buy.md"]);
  assert.deepEqual(cancelled.payload.notStarted, [...BATCH_FNS.slice(1), ...BATCH_MODULES, ...BATCH_LAYERS, "@system"]);
  assert.deepEqual(readdirSync(join(root, "keylang/explain/brief")), ["application.purchase.buy.md"], "no pending brief is written");
  model.release();
  await sleep(50);
  assert.equal(model.prompts.length, 2, "no request starts after Cancel");
  assert.match(s.app.state.message ?? "", /cancelled: 1 of 13 brief\(s\) written, 12 not started/);
  s.send(KEY.f6);
  assert.match(s.text(), /cancelled: no request was started after it, the ones in flight were closed; the briefs written before stay/);
  await esc(s.send);
  // After the batch the save goes through; the rerun plans again: the fresh brief is not asked for.
  s.send("i");
  s.send(KEY.ctrlS);
  assert.match(s.app.state.message ?? "", /keylang\/flows\/checkout\.md: saved/);
  await esc(s.send);
  await s.app.idle();
  assert.notEqual(readFileSync(join(root, "keylang/flows/checkout.md"), "utf8"), CHECKOUT_FLOW);
  explainBatchForm(s);
  const rerun = s.app.state.records.at(-1)!;
  while (rerun.status === "running") {
    model.release();
    await sleep(20);
  }
  await s.app.idle();
  const rest = explainBatchRecord(s.app);
  assert.deepEqual([rest.status, rest.exitCode, rest.payload.done.length], ["completed", 0, 12]);
  assert.ok(!model.prompts.slice(2).map(askedId).includes("application.purchase.buy"));
  assert.equal(model.prompts.length, 14);

  // A source changed while the model answers: nothing is written, no further request, the new bytes stay.
  rmSync(join(root, "keylang/explain"), { recursive: true });
  const order = join(root, "src/domain/order.ts");
  const asks = model.prompts.length;
  const outdated = runOperation({ kind: "explain-batch", root, batch: "missing", jobs: 1 });
  await model.requested(asks + 1);
  const changed = `${readFileSync(order, "utf8")}// changed during the batch\n`;
  writeFileSync(order, changed);
  const stopped = await answerAll(model, outdated);
  assert.deepEqual([stopped.status, stopped.exitCode, stopped.written, stopped.payload?.stopped, stopped.payload?.done], ["failed", 1, [], "outdated", []]);
  assert.deepEqual(stopped.payload?.refused, ["src/domain/order.ts: changed on disk while the batch was computed"]);
  assert.equal(stopped.payload?.notStarted.length, 13);
  assert.equal(model.prompts.length, asks + 1, "no request after the change");
  assert.equal(readFileSync(order, "utf8"), changed);
  assert.ok(!existsSync(join(root, "keylang/explain")), "no brief written");
  // The brief file appears while its request waits: its bytes stay, the node fails alone.
  const mine = storedExplanation("old", "brief", "Mine.");
  const raced = runOperation({ kind: "explain-batch", root, batch: "missing", limit: 1 });
  await model.requested(asks + 2);
  mkdirSync(dirname(first), { recursive: true });
  writeFileSync(first, mine);
  const one = await answerAll(model, raced);
  assert.deepEqual([one.status, one.exitCode, one.written, one.payload?.failed], ["completed", 1, [], [{ id: "application.purchase.buy", reason: "keylang/explain/brief/application.purchase.buy.md: created on disk while the change was prepared; nothing written" }]]);
  assert.equal(readFileSync(first, "utf8"), mine);
});
