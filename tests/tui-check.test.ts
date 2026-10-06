// TUI operations around the check, each against the CLI: the full check
// (paths, strict, static) and the changed check, explain-edge, init, export
// of a report, parse, and the trace plan.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runOperation, type OperationResult } from "../src/operations.ts";
import { App } from "../src/tui/app.ts";
import { findingsOf } from "../src/tui/findings.ts";
import { runTerminal } from "../src/tui/terminal.ts";
import { HOOK_FLOW, HOOKS } from "./hooks-fixture.ts";
import { checkoutRepo, CHECKOUT_FILES, CHECKOUT_FLOW, KEY } from "./tui-fixture.ts";
import { artifacts, BIN, checkJson, checkPayload, committedCheckout, configKind, countingAnalyzer, esc, fakeTerminal, gitRun, isDirtyBuffer, parseForm, pausedRunner, promptNote, repoWith, session, stdoutOf, treeBytes, waitUntil, workTree } from "./tui-helpers.ts";
import { VirtualTerminal } from "./vt.ts";

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

test("tui: full check and strict give the CLI's codes on the same evidence; the format changes no verdict; nothing is written; the current analysis stays apart", async (t) => {
  const root = checkoutRepo(t);
  let quit = 0;
  const vt = new VirtualTerminal(110, 30);
  const app = new App({ root, cols: 110, rows: 30, onQuit: () => quit++ });
  app.attach({ write: (ansi) => vt.feed(ansi) }, 110, 30);
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
    "Run the check (writes only the local fact cache, .keylang/cache/facts.json)",
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
  // The row is cut at the panel's edge with `…`; ←→ after Tab scroll it to its end.
  assert.match(s.text(), /keylang\/explain: the explained map and saved explanations are not spec/);
  s.send(KEY.tab);
  s.send(KEY.right);
  assert.match(s.text(), /are not specs; skipped/);
  s.send(KEY.tab);
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
  assert.match(details, /Write, in order: keylang\.json, \.keylang\/ into \.gitignore \(unless a line lists it\), the map .*keylang\/rules\.baseline\.md, the harness files/);
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
