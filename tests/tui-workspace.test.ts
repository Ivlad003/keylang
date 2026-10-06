// The TUI's workspace: a start with a missing, invalid or source-less
// keylang.json, feature readiness and the save step before it, the proposals
// list, a new specification buffer, and the whole cycle from a repository
// without keylang.json to a done feature in one session, against the CLI.

import assert from "node:assert/strict";
import childProcess, { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { findRoot } from "../src/analyze.ts";
import { mapStepLines, type OperationResult } from "../src/operations.ts";
import { App } from "../src/tui/app.ts";
import { findingsOf } from "../src/tui/findings.ts";
import { runTerminal } from "../src/tui/terminal.ts";
import { stringWidth } from "../src/tui/width.ts";
import { checkoutRepo, CHECKOUT_FILES, CHECKOUT_FLOW, KEY } from "./tui-fixture.ts";
import { artifacts, BIN, checkJson, checkPayload, cliMapCheck, configKind, countingAnalyzer, DENY_RULES, esc, fakeTerminal, featureForm, FEATURES, FLOW_PATH, gatedWorker, mapCheck, PAID, promptNote, propose, repoWith, session, sleep, stdoutOf, submitSlug, treeBytes, waitUntil } from "./tui-helpers.ts";
import { CYCLE_AUTHOR_CODE, CYCLE_CONFIG_LINE, CYCLE_FEATURE_TEXT, CYCLE_FILES, CYCLE_TEMPLATE_CODE, refundCycle } from "./cycle-fixture.ts";
import { VirtualTerminal } from "./vt.ts";

// ---------- workspace bootstrap: missing, invalid, and source-less configurations ----------

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

function cliFeature(root: string, slug: string): { status: number | null; stdout: string; stderr: string } {
  return spawnSync(process.execPath, [BIN, "feature", slug, "--format", "json"], { cwd: root, encoding: "utf8" });
}

test("tui: feature gives the same object and code as the CLI for done, planned, static and rule gaps; 2 for an unknown slug", async (t) => {
  const root = checkoutRepo(t, FEATURES);
  let quit = 0;
  const vt = new VirtualTerminal(110, 30);
  const app = new App({ root, cols: 110, rows: 30, onQuit: () => quit++ });
  app.attach({ write: (ansi) => vt.feed(ansi) }, 110, 30);
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
  assert.match(s.text(), /planned {2}application\.purchase\.refund {2}keylang\/features\/refund\.md:3:1 {2}pl/);
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
  app.attach({ write: (ansi) => vt.feed(ansi) }, 110, 30);
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

// ---------- 38: the whole cycle, in one session, against the CLI ----------

/** Like `cliFeature`, from any root. */
function cliRun(root: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  return spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: "utf8" });
}

/** The repository with every proposal taken in whole, as MERGE with every hunk accepted leaves it (the emptied store directories stay). */
function acceptProposals(root: string): void {
  const store = join(root, ".keylang/proposals");
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else {
        const target = join(root, abs.slice(store.length + 1));
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, readFileSync(abs));
        rmSync(abs);
      }
    }
  };
  walk(store);
}

test("tui: one session goes from a repository without keylang.json to a done feature — init, config, a new feature with planned, check, spec-to-code, the proposals list and MERGE, an outside proposal, map — with the CLI's bytes and codes at each step and no nested process", async (t) => {
  const root = repoWith(t, CYCLE_FILES);
  const twin = repoWith(t, CYCLE_FILES);
  const s = session(root, { cols: 110, rows: 30 });
  t.after(() => s.app.close());
  // A spawn from the session's thread while the cycle runs would be a nested process; the CLI twin runs between stages.
  let inCycle = true;
  const spawned: string[] = [];
  let twinRuns = 0;
  for (const name of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"] as const) {
    const original = childProcess[name] as (...args: unknown[]) => unknown;
    t.mock.method(childProcess, name, (...args: unknown[]) => {
      if (inCycle) spawned.push(`${name} ${String(args[0])}`);
      else twinRuns++;
      return original(...args);
    });
  }
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  const last = <K extends OperationResult["kind"]>(kind: K): Extract<OperationResult, { kind: K }> => {
    const result = s.app.state.records.at(-1)?.result;
    assert.equal(result?.kind, kind, JSON.stringify(result?.messages));
    return result as Extract<OperationResult, { kind: K }>;
  };
  const featureOf = (kind: "feature"): NonNullable<Extract<OperationResult, { kind: "feature" }>["payload"]> => {
    const result = last(kind);
    assert.ok(result.payload !== null, JSON.stringify(result.messages));
    return result.payload;
  };
  const sameFeature = (code: number): void => {
    const result = last("feature");
    const cli = cliRun(twin, ["feature", "refund", "--format", "json"]);
    assert.deepEqual([result.status, result.exitCode, cli.status], ["completed", code, code], cli.stderr);
    assert.deepEqual(featureOf("feature").report, JSON.parse(cli.stdout), "the CLI's report on the twin");
  };
  const stages: string[] = [];
  let initConfig = "";
  await refundCycle({ input: (keys) => s.send(keys), text: () => s.text(), lines: () => s.lines() }, async (stage) => {
    inCycle = false;
    stages.push(stage);
    switch (stage) {
      case "init": {
        const result = last("init");
        const cli = cliRun(twin, ["init"]);
        assert.deepEqual([result.status, result.exitCode, cli.status], ["completed", 0, 0], cli.stderr);
        assert.equal(stdoutOf(result), cli.stdout);
        assert.deepEqual(artifacts(root), artifacts(twin), "init writes the CLI's files");
        assert.equal(configKind(s.app), "configured", "the workspace opened without a restart");
        initConfig = readFileSync(join(root, "keylang.json"), "utf8");
        break;
      }
      case "config": {
        const text = initConfig.replace("{\n", `{\n${CYCLE_CONFIG_LINE}`);
        assert.equal(readFileSync(join(root, "keylang.json"), "utf8"), text, "Ctrl+S wrote the edit");
        writeFileSync(join(twin, "keylang.json"), text);
        break;
      }
      case "unsaved":
        assert.equal(existsSync(join(root, "keylang/features")), false, "a new spec is a buffer until Ctrl+S");
        assert.ok(s.app.state.analysis?.docs.some((doc) => doc.path === "keylang/features/refund.md"), "the analysis reads the unsaved buffer");
        break;
      case "saved": {
        const text = readFileSync(join(root, "keylang/features/refund.md"), "utf8");
        assert.equal(text, `## refund\n${CYCLE_FEATURE_TEXT}`);
        mkdirSync(join(twin, "keylang/features"), { recursive: true });
        writeFileSync(join(twin, "keylang/features/refund.md"), text);
        const cli = cliRun(twin, ["check", "--format", "json"]);
        assert.equal(cli.status, 0, cli.stderr);
        assert.deepEqual(findingsOf(s.app.state.analysis), (JSON.parse(cli.stdout) as { results: unknown[] }).results, "the editor's findings are the CLI's once saved");
        break;
      }
      case "check": {
        const result = last("check");
        const json = cliRun(twin, ["check", "--format", "json"]);
        const human = cliRun(twin, ["check"]);
        assert.deepEqual([result.status, result.exitCode, json.status, human.status], ["completed", 0, 0, 0]);
        assert.deepEqual(checkJson(s.app.state.records.at(-1)), JSON.parse(json.stdout));
        assert.equal(checkPayload(s.app.state.records.at(-1)).lines.map((line) => `${line}\n`).join(""), human.stdout);
        assert.ok(checkPayload(s.app.state.records.at(-1)).results.some((r) => r.area === "app.order.refund" && r.verdict === "unverified"), "planned is not green");
        break;
      }
      case "gaps":
        sameFeature(1);
        assert.deepEqual(featureOf("feature").report.gaps.map((gap) => `${gap.kind} ${gap.id}`), ["planned app.order.refund", "static app.order.refund"]);
        break;
      case "proposed": {
        const result = last("spec-to-code");
        const cli = cliRun(twin, ["spec-to-code", "app.order.refund"]);
        assert.deepEqual([result.status, result.exitCode, cli.status], ["completed", 0, 0], cli.stderr);
        const stores = [".keylang/proposals/src/app/order.ts", ".keylang/proposals/tests/refund.test.ts"];
        assert.deepEqual(result.proposals, stores);
        assert.deepEqual(result.written, [], "a proposal is not a write of its target");
        for (const store of stores) assert.equal(readFileSync(join(root, store), "utf8"), readFileSync(join(twin, store), "utf8"), `${store}: the CLI's bytes`);
        assert.equal(readFileSync(join(root, "src/app/order.ts"), "utf8"), CYCLE_FILES["src/app/order.ts"], "the code waits for MERGE");
        break;
      }
      case "template":
        acceptProposals(twin);
        assert.equal(readFileSync(join(root, "src/app/order.ts"), "utf8"), CYCLE_TEMPLATE_CODE);
        assert.equal(existsSync(join(root, ".keylang/proposals/src/app/order.ts")) || existsSync(join(root, ".keylang/proposals/tests/refund.test.ts")), false, "both merged");
        assert.deepEqual(specTree(root), specTree(twin), "MERGE with every hunk accepted leaves the proposals' text");
        break;
      case "gap":
        // The stub implements the planned fn; the call checkout → refund is still not in the code.
        sameFeature(1);
        assert.deepEqual(featureOf("feature").report.gaps.map((gap) => `${gap.kind} ${gap.id}`), ["static app.order.refund"]);
        break;
      case "author":
        propose(root, "src/app/order.ts", CYCLE_AUTHOR_CODE);
        writeFileSync(join(twin, "src/app/order.ts"), CYCLE_AUTHOR_CODE);
        break;
      case "merged":
        assert.equal(readFileSync(join(root, "src/app/order.ts"), "utf8"), CYCLE_AUTHOR_CODE);
        assert.deepEqual(specTree(root), specTree(twin));
        // F5 and every analysis after the merges left the map alone: it is stale until the map action.
        assert.deepEqual([cliMapCheck(root).status, cliMapCheck(twin).status], [1, 1]);
        break;
      case "map": {
        const result = last("map");
        const cli = cliRun(twin, ["map"]);
        assert.deepEqual([result.status, result.exitCode, cli.status], ["completed", 0, 0], cli.stderr);
        assert.ok(result.payload !== null);
        assert.equal(mapStepLines(result.payload.steps).map((line) => `${line}\n`).join(""), cli.stdout);
        assert.deepEqual(artifacts(root), artifacts(twin), "the same repository, byte for byte, but for the index's time");
        break;
      }
      case "done": {
        sameFeature(0);
        const report = featureOf("feature").report;
        assert.deepEqual([report.done, report.gaps], [true, []]);
        assert.deepEqual(report.info.tests.map((info) => `${info.verdict} ${info.id}`), ['unverified test tests/refund.test.ts "refund"'], "the test is reported apart and does not block");
        s.send(KEY.f6);
        assert.match(s.text(), /Feature · refund · saved state/);
        assert.match(s.text(), /Done · code 0/);
        assert.match(s.text(), /Info \(not blocking\): tests unverified 1 · trace —/);
        s.send(KEY.f6);
        for (const dir of [root, twin]) {
          assert.equal(cliRun(dir, ["check"]).status, 0);
          assert.equal(cliMapCheck(dir).status, 0);
        }
        break;
      }
    }
    inCycle = true;
  });
  assert.deepEqual(stages, ["init", "config", "unsaved", "saved", "check", "gaps", "proposed", "template", "gap", "author", "merged", "map", "done"]);
  assert.ok(twinRuns >= 15, "the spy sees named imports of node:child_process: the CLI twin's runs went through it");
  assert.deepEqual(spawned, [], "the cycle runs in the session and its worker; no keylang process is started");
  assert.deepEqual(
    s.app.state.records.map((record) => `${record.action} ${record.status} ${record.result?.exitCode}`),
    ["init completed 0", "full-check completed 0", "feature completed 1", "spec-to-code completed 0", "feature completed 1", "map completed 0", "feature completed 0"],
  );
});

test("tui: on a 50-column terminal a held operation keeps x cancel, the quit step keeps Stay and Cancel and exit, and the save step keeps Save and continue and Back — each whole on screen and working", async (t) => {
  const root = checkoutRepo(t, FEATURES);
  const gated = gatedWorker();
  const vt = new VirtualTerminal(50, 16);
  const app = new App({ root, cols: 50, rows: 16, operationWorker: gated.worker });
  app.attach({ write: (ansi) => vt.feed(ansi) }, 50, 16);
  t.after(() => app.close());
  const send = (keys: string): void => app.input(keys);
  await app.idle();
  const before = treeBytes(root);
  // A held map check: x in F6 cancels it.
  mapCheck(send);
  assert.equal(app.state.records.at(-1)?.status, "running");
  send(KEY.f6);
  assert.match(vt.text(), /x cancel/);
  send("x");
  assert.equal(app.state.records.at(-1)?.status, "cancelled");
  await esc(send);
  // The quit step during another held check: both choices are on screen; Stay keeps the session and the check.
  mapCheck(send);
  assert.equal(app.state.records.at(-1)?.status, "running");
  send("q");
  assert.match(vt.text(), /\[Stay\]/);
  assert.match(vt.text(), /\[Cancel and exit\]/);
  send(KEY.enter);
  assert.equal(app.state.quit, null);
  assert.equal(app.state.records.at(-1)?.status, "running");
  gated.open();
  await waitUntil(() => app.state.records.at(-1)?.status === "completed", "the check after the gate");
  assert.deepEqual(treeBytes(root), before, "the checks write nothing");
  // A dirty feature: the save step before feature; Back writes nothing and runs nothing.
  send(KEY.ctrlP);
  for (const ch of "open keylang/features/buy.md") send(ch);
  send(KEY.enter);
  send("i");
  send("x");
  await esc(send);
  await app.idle();
  const dirty = treeBytes(root);
  const records = app.state.records.length;
  featureForm(send);
  send(KEY.enter);
  assert.deepEqual(app.state.barrier?.files, ["keylang/features/buy.md"]);
  assert.match(vt.text(), /\[Save and continue\]/);
  assert.match(vt.text(), /\[Back\]/);
  assert.ok(vt.lines().every((line) => stringWidth(line) <= 50));
  send(KEY.right);
  send(KEY.enter);
  assert.equal(app.state.barrier, null);
  assert.equal(app.state.records.length, records, "Back runs nothing");
  assert.deepEqual(treeBytes(root), dirty, "Back writes nothing");
});
