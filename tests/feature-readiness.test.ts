// The feature readiness screen (.scratch/c4-zoom/issues/11): the stage on its
// ladder with the gaps and hints by stage, the `?` mark of an open question in
// the gutter, the status line of a feature file after a save, and the model's
// questions as a proposal that only MERGE writes. In a virtual terminal, with a
// local stand-in for the model.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { App } from "../src/tui/app.ts";
import { checkoutRepo, KEY } from "./tui-fixture.ts";
import { VirtualTerminal } from "./vt.ts";

const FEATURE = "keylang/features/refund.md";
// An open question, a planned fn without a signature, and a step its trigger never calls: stage structure.
const REFUND = [
  "# flow refund",
  "",
  "- ? who starts a refund?",
  "- planned fn application.purchase.refund",
  "- trigger presentation.terminal.checkout",
  "  - step application.purchase.refund",
  "",
].join("\n");

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

type Session = { app: App; send: (keys: string) => void; lines: () => string[]; text: () => string };

function session(t: TestContext, root: string, cols = 130, rows = 32): Session {
  const vt = new VirtualTerminal(cols, rows);
  const app = new App({ root, cols, rows });
  app.attach({ write: (ansi) => vt.feed(ansi) }, cols, rows);
  t.after(() => app.close());
  return { app, send: (keys) => app.input(keys), lines: () => vt.lines(), text: () => vt.text() };
}

/** The repository with the refund feature; `agent` goes into keylang.json. */
function repo(t: TestContext, agent: string | null = null): string {
  const root = checkoutRepo(t, { [FEATURE]: REFUND });
  if (agent !== null) {
    const config = JSON.parse(readFileSync(join(root, "keylang.json"), "utf8")) as Record<string, unknown>;
    writeFileSync(join(root, "keylang.json"), `${JSON.stringify({ ...config, agent }, null, 2)}\n`);
  }
  return root;
}

/** Only this test's agent: no KEYLANG_AGENT and no agents.json of the developer's home. */
function isolateAgent(t: TestContext, home: string): void {
  const saved = { home: process.env.HOME, agent: process.env.KEYLANG_AGENT };
  process.env.HOME = home;
  delete process.env.KEYLANG_AGENT;
  t.after(() => {
    if (saved.home === undefined) delete process.env.HOME;
    else process.env.HOME = saved.home;
    if (saved.agent !== undefined) process.env.KEYLANG_AGENT = saved.agent;
  });
}

function palette(s: Session, text: string): void {
  s.send(KEY.ctrlP);
  for (const ch of text) s.send(ch);
  s.send(KEY.enter);
}

function lineOf(lines: readonly string[], text: string): string {
  const found = lines.find((line) => line.includes(text));
  assert.ok(found, `no line with ${text}:\n${lines.join("\n")}`);
  return found;
}

/** The feature file open, its readiness report computed and shown in F6. */
async function readiness(s: Session): Promise<void> {
  await s.app.idle();
  palette(s, `open ${FEATURE}`);
  palette(s, "feature readiness");
  assert.equal(s.app.state.prompt?.text, "refund");
  s.send(KEY.enter);
  await s.app.idle();
  assert.equal(s.app.state.records.at(-1)?.result?.kind, "feature");
  s.send(KEY.f6);
}

test("readiness: the screen shows the ladder at structure and the gaps and hints by stage; Enter goes to a gap's line", async (t) => {
  const s = session(t, repo(t));
  await readiness(s);
  const text = s.text();
  assert.match(text, /Feature · refund · saved state · keylang\/features\/refund\.md/);
  assert.match(text, /3 gap\(s\) · code 1 · snapshot [0-9a-f]{8}/);
  assert.match(text, /stage {2}idea › behavior › \[structure\] › ready › done/);
  const rows = s.lines().map((line) => line.trimEnd());
  const at = (pattern: RegExp): number => {
    const index = rows.findIndex((row) => pattern.test(row));
    assert.ok(index >= 0, `no row ${pattern}:\n${rows.join("\n")}`);
    return index;
  };
  // Structure first: its gap, then its hint; the implementation's gaps under ready.
  const structure = at(/structure · 1 gap\(s\) · 1 hint\(s\), not blocking/);
  const question = at(/ {2}question refund {2}keylang\/features\/refund\.md:3:1 {2}open question: who starts a refund\?/);
  const hint = at(/ {2}hint signature application\.purchase\.refund {2}keylang\/features\/refund\.md:4:1 {2}planned fn/);
  const ready = at(/ready · 2 gap\(s\)/);
  const planned = at(/ {2}planned {2}application\.purchase\.refund {2}keylang\/features\/refund\.md:4:1 {2}planned/);
  const stat = at(/ {2}static {3}application\.purchase\.refund {2}keylang\/features\/refund\.md:6:3/);
  assert.deepEqual([structure < question, question < hint, hint < ready, ready < planned, planned < stat], [true, true, true, true, true]);
  assert.doesNotMatch(text, /m questions/, "no model configured: the screen does not offer the questions");

  // Tab selects the rows up the ladder; Enter opens the selected one's line, Esc comes back.
  s.send(KEY.tab);
  assert.match(s.app.state.message ?? "", /^question refund: open question: who starts a refund\? · Enter opens keylang\/features\/refund\.md:3$/);
  s.send(KEY.enter);
  assert.equal(s.app.state.current, FEATURE);
  assert.equal(s.app.state.cursor.line, 2);
  s.send("\x1b");
  await sleep(40);
  assert.equal(s.app.state.results.open, true);
  s.send(KEY.down);
  assert.match(s.app.state.message ?? "", /^hint signature application\.purchase\.refund: planned fn `application\.purchase\.refund` has no signature/);
  s.send(KEY.down);
  assert.match(s.app.state.message ?? "", /^planned application\.purchase\.refund: .* · Enter opens keylang\/features\/refund\.md:4 · g: spec-to-code$/);
  s.send(KEY.enter);
  assert.equal(s.app.state.cursor.line, 3);
});

test("readiness: an open question has its own ? mark; the status line shows the stage and the questions, updated by a save, not by typing", async (t) => {
  const root = repo(t);
  const s = session(t, root);
  await s.app.idle();
  palette(s, `open ${FEATURE}`);
  await s.app.idle();
  assert.equal(lineOf(s.lines(), "- ? who starts a refund?")[0], "?");
  assert.match(s.lines().at(-1)!, /feature structure · questions 1/);
  // A second question typed under the first (Enter continues the list with `- `): the line keeps
  // the saved state until Ctrl+S and the analysis after it.
  s.send(KEY.down);
  s.send(KEY.down);
  s.send("i");
  s.send(KEY.end);
  s.send(KEY.enter);
  for (const ch of "? and a partial refund?") s.send(ch);
  assert.ok(s.app.state.buffers.get(FEATURE)!.text.includes("- ? who starts a refund?\n- ? and a partial refund?\n"));
  await sleep(200);
  await s.app.idle();
  assert.match(s.lines().at(-1)!, /feature structure · questions 1/, "typing does not change it");
  s.send(KEY.ctrlS);
  await s.app.idle();
  await sleep(50);
  await s.app.idle();
  assert.ok(readFileSync(join(root, FEATURE), "utf8").includes("- ? who starts a refund?\n- ? and a partial refund?\n"));
  assert.match(s.lines().at(-1)!, /feature structure · questions 2/);
  // Another file has no feature line.
  s.send("\x1b");
  await sleep(40);
  palette(s, "open keylang/flows/checkout.md");
  await s.app.idle();
  assert.doesNotMatch(s.lines().at(-1)!, /feature /);
});

test("readiness: the status line judges the plan against HEAD, as `feature` does: a question deleted before a commit is no done", async (t) => {
  const BUY = "# flow buy\n\n- ? who buys?\n- trigger presentation.terminal.checkout\n- step application.purchase.buy\n";
  const root = checkoutRepo(t, { "keylang/features/buy.md": BUY });
  const git = (args: string[]): void => {
    const r = spawnSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test", ...args], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  };
  git(["init", "-q"]);
  git(["add", "."]);
  git(["commit", "-qm", "plan"]);
  const s = session(t, root);
  await s.app.idle();
  palette(s, "open keylang/features/buy.md");
  await s.app.idle();
  assert.match(s.lines().at(-1)!, /feature structure · questions 1/);
  // The question deleted and saved: without HEAD it would be done; the plan at HEAD still has it.
  writeFileSync(join(root, "keylang/features/buy.md"), BUY.replace("- ? who buys?\n", ""));
  s.send(KEY.f5);
  await s.app.idle();
  assert.match(s.lines().at(-1)!, /feature ready · questions 0/);
  // Answered in a commit: done.
  git(["commit", "-qam", "answer"]);
  s.send(KEY.f5);
  await s.app.idle();
  assert.match(s.lines().at(-1)!, /feature done · questions 0/);
});

const ANSWER = [
  "Here are the questions:",
  "- ? Can an operator refund part of an order?",
  "1. Who pays the fee?",
  "- ? What happens when the payment provider is down?",
  "- ? Is a refund allowed after 30 days?",
  "- ? Which currency does a refund use?",
  "- ? Does the customer get an email?",
  "- ? Is the order closed after a refund?",
].join("\n");

/** A local stand-in for the Anthropic API: every request gets `answer`, and is kept. */
async function mockModel(t: TestContext, answer: string): Promise<{ requests: { system: string; prompt: string }[] }> {
  const requests: { system: string; prompt: string }[] = [];
  const server = createServer((req, res) => {
    let data = "";
    req.on("data", (chunk: Buffer) => (data += chunk.toString()));
    req.on("end", () => {
      const body = JSON.parse(data) as { system: string; messages: { content: string }[] };
      requests.push({ system: body.system, prompt: body.messages[0]?.content ?? "" });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "m", type: "message", role: "assistant", model: "claude-opus-5", content: [{ type: "text", text: answer }], stop_reason: "end_turn", stop_details: null, usage: { input_tokens: 1, output_tokens: 1 } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const saved = { url: process.env.ANTHROPIC_BASE_URL, key: process.env.ANTHROPIC_API_KEY, token: process.env.ANTHROPIC_AUTH_TOKEN };
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_API_KEY = "test";
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  t.after(() => {
    server.closeAllConnections();
    server.close();
    for (const [name, value] of [["ANTHROPIC_BASE_URL", saved.url], ["ANTHROPIC_API_KEY", saved.key], ["ANTHROPIC_AUTH_TOKEN", saved.token]] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  return { requests };
}

test("readiness: m asks the model once; its first five `- ? …` lines open in MERGE, the rest is counted; the file changes only on w", async (t) => {
  const root = repo(t, "anthropic:claude-opus-5");
  isolateAgent(t, root);
  const model = await mockModel(t, ANSWER);
  const s = session(t, root);
  await readiness(s);
  assert.match(s.text(), /Enter rerun · Tab gaps · m questions · Esc back/);
  s.send("m");
  await s.app.idle();
  assert.equal(model.requests.length, 1);
  assert.match(model.requests[0]!.system, /Write each question on a line of its own as `- \? <question>`/);
  assert.ok(model.requests[0]!.prompt.includes(`Feature file ${FEATURE}:\n\`\`\`\n${REFUND}`), model.requests[0]!.prompt);
  assert.match(model.requests[0]!.prompt, /application\.purchase\.buy|presentation\.terminal\.checkout/, "the context around the feature's ids");

  const record = s.app.state.records.at(-1)!;
  assert.equal(record.result?.kind, "feature-questions");
  assert.equal(record.result?.exitCode, 0, JSON.stringify(record.result?.messages));
  // MERGE of the feature file: the proposal is the file with the questions after the flow's own.
  assert.equal(s.app.state.mode, "merge");
  assert.equal(s.app.state.merge?.path, FEATURE);
  assert.match(s.app.state.message ?? "", /^questions: 5 proposed for keylang\/features\/refund\.md · 3 line\(s\) of the answer left out: no `- \? …` question, or past the fifth · MERGE/);
  assert.equal(readFileSync(join(root, FEATURE), "utf8"), REFUND, "nothing is written before the merge");
  const proposed = readFileSync(join(root, ".keylang/proposals", FEATURE), "utf8");
  const questions = ANSWER.split("\n").filter((line) => line.startsWith("- ? ")).slice(0, 5);
  assert.equal(proposed, REFUND.replace("- ? who starts a refund?\n", `- ? who starts a refund?\n${questions.join("\n")}\n`));
  assert.doesNotMatch(proposed, /Who pays the fee|Is the order closed/);

  // Accepted and written: the questions are the feature's own now.
  for (let i = 0; i < (s.app.state.merge?.hunks.length ?? 0); i++) s.send("a");
  s.send("w");
  await s.app.idle();
  assert.equal(readFileSync(join(root, FEATURE), "utf8"), proposed);
  assert.equal(existsSync(join(root, ".keylang/proposals", FEATURE)), false);
  await sleep(50);
  await s.app.idle();
  assert.match(s.lines().at(-1)!, /feature structure · questions 6/);
});

test("readiness: without a model, m and the palette say how to set one, and nothing changes", async (t) => {
  const root = repo(t);
  isolateAgent(t, root);
  const s = session(t, root);
  await readiness(s);
  const records = s.app.state.records.length;
  s.send("m");
  assert.equal(s.app.state.message, "ask the model for questions: no agent in keylang.json → Open keylang.json (set agent) · Environment diagnostics (credentials)");
  assert.equal(s.app.state.records.length, records, "no operation");
  assert.equal(s.app.state.results.open, true);
  assert.equal(s.app.state.merge, null);
  s.send("\x1b");
  await sleep(40);
  palette(s, "ask the model for questions");
  assert.equal(s.app.state.message, "Ask the model for questions: no agent in keylang.json → Open keylang.json (set agent) · Environment diagnostics (credentials)");
  assert.equal(s.app.state.records.length, records);
  assert.equal(existsSync(join(root, ".keylang/proposals")), false);
  assert.equal(readFileSync(join(root, FEATURE), "utf8"), REFUND);
});
