// TUI operations that write generated files, each against the CLI: map check
// and map write in the operation worker with their commit, the baseline, the
// agents' harness files, fmt and wire; quitting, cancelling and racing while
// an operation runs.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { analyze, type Analysis, type AnalysisRequest } from "../src/analyze.ts";
import { formatSource } from "../src/fmt.ts";
import { mapCheckLines, mapStepLines, runOperation, type OperationRequest, type OperationResult } from "../src/operations.ts";
import { App, type AppOptions } from "../src/tui/app.ts";
import { OperationWorker } from "../src/tui/background.ts";
import { LEAVE } from "../src/tui/screen.ts";
import { runTerminal } from "../src/tui/terminal.ts";
import { checkoutRepo, CHECKOUT_FLOW, KEY } from "./tui-fixture.ts";
import { artifacts, BIN, briefReply, BUY_ANSWER, cliMapCheck, draftForm, esc, explainBatchForm, fakeTerminal, FLOW_PATH, GATE_WORKER, gatedWorker, heldModel, isDirtyBuffer, mapCheck, pausedRunner, promptNote, REFUND, session, sleep, stdoutOf, treeBytes, waitUntil, withConfig } from "./tui-helpers.ts";
import { VirtualTerminal } from "./vt.ts";

// ---------- map check in the operation worker (ticket 08) ----------

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
  app.attach({ write: (ansi) => vt.feed(ansi) }, 110, 30);
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
  app.attach({ write: (ansi) => vt.feed(ansi) }, 100, 24);
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
  // A clean CRLF buffer keeps CRLF: fmt writes a CRLF file in CRLF, so a later save keeps them.
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
  // The bytes are the CLI's: CRLF stays CRLF, Unicode stays; invalid and explanation files are untouched.
  for (const path of ["keylang/notes/a-messy.md", "keylang/notes/d-crlf.md", "keylang/notes/b-indent.md", "keylang/explain/x.md"]) {
    assert.equal(readFileSync(join(root, path), "utf8"), readFileSync(join(twin, path), "utf8"), path);
  }
  const crlfOut = readFileSync(join(root, "keylang/notes/d-crlf.md"), "utf8");
  assert.ok(crlfOut.split("\r\n").length === crlfOut.split("\n").length && crlfOut.includes("порядок 𝒳"), crlfOut);
  const crlfBuffer = s.app.state.buffers.get("keylang/notes/d-crlf.md")!;
  const crlfText = crlfOut.replace(/\r\n/g, "\n");
  assert.deepEqual([crlfBuffer.text, crlfBuffer.eol, crlfBuffer.saved], [crlfText, "\r\n", crlfText]);
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

// ---------- quitting, cancelling and racing during an operation (ticket 35) ----------

/** The screen a terminal shows after everything `runTerminal` wrote. */
function screenOf(out: readonly string[], cols = 100, rows = 30): string {
  const vt = new VirtualTerminal(cols, rows);
  vt.feed(out.join(""));
  return vt.text();
}

test("terminal: q during a held read-only operation asks first; Stay keeps it; Cancel and exit ends the worker, restores the screen and returns 0", async (t) => {
  const root = checkoutRepo(t);
  const gated = gatedWorker();
  const term = fakeTerminal();
  const running = runTerminal(root, term.host, { operationWorker: gated.worker });
  let ended = false;
  void running.then(() => (ended = true));
  await waitUntil(() => /✗ 0/.test(screenOf(term.out)), "the first analysis");
  const before = treeBytes(root);
  term.type(KEY.ctrlP);
  for (const ch of "map check") term.type(ch);
  term.type(KEY.enter);
  await waitUntil(() => /map check: running/.test(screenOf(term.out)), "the held check");
  term.type("q");
  assert.match(screenOf(term.out), /Quit while an operation runs/);
  assert.match(screenOf(term.out), /\[Stay\] +\[Cancel and exit\]/);
  // Esc (and Enter on the default Stay) keep the session and the operation.
  term.type("\x1b");
  await sleep(40);
  assert.match(screenOf(term.out), /map check: still running; the session stays/);
  term.type("q");
  term.type(KEY.enter);
  await sleep(20);
  assert.equal(ended, false);
  assert.equal(term.raw(), true);
  // Cancel and exit: the held read-only check is cancelled at once, the worker ends, the screen is restored.
  term.type("q");
  term.type(KEY.right);
  term.type(KEY.enter);
  assert.equal(await running, 0);
  assert.equal(term.out.at(-1), LEAVE, "the screen is restored");
  assert.equal(term.raw(), false);
  const after = await gated.worker.run({ kind: "map-check", root });
  assert.deepEqual([after.status, after.exitCode, after.messages.map((message) => message.text)], ["failed", 2, ["the session is closed"]], "the session's worker is closed");
  assert.deepEqual(treeBytes(root), before, "nothing was written");
});

test("tui: Cancel and exit before the commit quits with nothing written; during it the session waits for the current file, names what landed, and the disk matches the report", async (t) => {
  // Paused at the commit gate, before the session hears of it: nothing is written, the session ends at once.
  const early = checkoutRepo(t);
  let quits = 0;
  let resume = (): void => {};
  const held = session(early, { onQuit: () => quits++, operations: pausedRunner(() => new Promise<void>((done) => (resume = done))) });
  t.after(() => held.app.close());
  await held.app.idle();
  const before = treeBytes(early);
  mapWrite(held.send);
  held.send(KEY.enter);
  await waitUntil(() => held.app.state.records.at(-1)?.progress === "waiting to write", "the pause before the commit");
  held.send("q");
  held.send("q");
  assert.equal(quits, 1, "nothing is being written: the session ends");
  resume();
  await held.app.idle();
  assert.equal(held.app.state.records.at(-1)!.status, "cancelled");
  assert.deepEqual(treeBytes(early), before, "the cancelled map wrote nothing after the pause");

  // Cancel and exit while a file step runs: the step finishes, no later one starts, then the session ends.
  const root = checkoutRepo(t);
  assert.equal(spawnSync(process.execPath, [BIN, "map"], { cwd: root, encoding: "utf8" }).status, 0);
  writeFileSync(join(root, "src/domain/order.ts"), "export function create(): void {}\nexport function cancel(): void {}\n");
  const disk = treeBytes(root);
  let quit = 0;
  let during: { quit: number; waiting: boolean | undefined; message: string | null } | null = null;
  let s: ReturnType<typeof session> | null = null;
  s = session(root, {
    onQuit: () => quit++,
    operations: pausedRunner(
      () => {},
      (text) => {
        if (text !== "writing .keylang/index.json" || !s) return;
        s.send("q");
        s.send(KEY.right);
        s.send(KEY.enter);
        during = { quit, waiting: s.app.state.quit?.waiting, message: s.app.state.message };
      },
    ),
  });
  t.after(() => s.app.close());
  await s.app.idle();
  mapWrite(s.send);
  s.send(KEY.enter);
  await s.app.idle();
  assert.deepEqual(during, { quit: 0, waiting: true, message: "map write: cancelling after the current file; the session ends when it settles" }, "the session waits for the write");
  assert.equal(quit, 1, "the session ended once the operation settled");
  const result = mapRecord(s.app);
  assert.deepEqual([result.status, result.exitCode], ["cancelled", null]);
  const completed = result.payload.steps.filter((step) => step.state === "completed").map((step) => step.path);
  assert.deepEqual(completed, ["keylang/map/domain.md", ".keylang/index.json"], "the current file finished; no later one started");
  assert.deepEqual(result.written, completed);
  const now = treeBytes(root);
  for (const [path, text] of disk) if (!completed.includes(path)) assert.equal(now.get(path), text, `${path} is as it was`);
  for (const path of completed) assert.notEqual(now.get(path), disk.get(path), `${path} was written`);
  assert.match(readFileSync(join(root, "keylang/map/domain.md"), "utf8"), /cancel/);
});

test("tui: quitting during a brief batch with a brief written and a dirty spec names the written brief and asks about the unsaved text again; q then quits", async (t) => {
  const root = checkoutRepo(t);
  withConfig(root, { agent: "anthropic:claude-opus-5" });
  const model = await heldModel(t, briefReply);
  let quit = 0;
  const s = session(root, { cols: 240, rows: 70, onQuit: () => quit++ });
  t.after(() => s.app.close());
  await s.app.idle();
  explainBatchForm(s, { jobs: "1" });
  const record = s.app.state.records.at(-1)!;
  await model.requested(1);
  model.release();
  await model.requested(2);
  s.app.state.cursor = { line: 2, col: 0 };
  s.send("i");
  s.send("x");
  await esc(s.send);
  const edited = s.app.state.buffers.get(FLOW_PATH)!.text;
  // The first q asks about the operation; q again is Cancel and exit, which waits for the batch to settle.
  s.send("q");
  assert.equal(s.app.state.quit?.waiting, false);
  assert.match(s.text(), /explain .* is running/);
  s.send("q");
  await s.app.idle();
  for (let i = 0; i < 100 && model.dropped() === 0; i++) await sleep(10);
  assert.equal(record.status, "cancelled");
  assert.equal(quit, 0, "Cancel and exit is no leave to drop the unsaved text");
  assert.equal(s.app.state.quit, null);
  const message = s.app.state.message ?? "";
  assert.match(message, /cancelled: 1 of 13 brief\(s\) written, 12 not started/);
  assert.match(message, /written: keylang\/explain\/brief\/application\.purchase\.buy\.md/);
  assert.match(message, /unsaved changes in keylang\/flows\/checkout\.md: Ctrl\+S saves, q or Ctrl\+C again quits/);
  assert.deepEqual(readdirSync(join(root, "keylang/explain/brief")), ["application.purchase.buy.md"], "the written brief stays, no other lands");
  assert.equal(s.app.state.buffers.get(FLOW_PATH)!.text, edited);
  assert.equal(readFileSync(join(root, FLOW_PATH), "utf8"), CHECKOUT_FLOW, "nothing saved the buffer");
  model.release();
  await sleep(30);
  assert.equal(model.prompts.length, 2, "no request after the cancel");
  s.send("q");
  assert.equal(quit, 1);
});

test("tui: a cancelled model draft answering late, with a ghost-eligible edit and another current file, inserts, saves and opens nothing", async (t) => {
  const root = checkoutRepo(t, { "keylang/flows/refund.md": REFUND });
  withConfig(root, { agent: "anthropic:claude-opus-5", ghost: { delay: 0 } });
  const model = await heldModel(t, BUY_ANSWER);
  let quit = 0;
  const s = session(root, { cols: 200, onQuit: () => quit++ });
  t.after(() => s.app.close());
  await s.app.idle();
  draftForm(s, { trigger: "application.purchase.buy", into: "keylang/flows/buying.md", mode: "llm" });
  const record = s.app.state.records.at(-1)!;
  await model.requested(1);
  // A new flow item while the draft runs: no ghost request is made.
  s.app.state.cursor = { line: 0, col: 0 };
  s.send("i");
  for (let i = 0; i < 7; i++) s.send(KEY.down);
  s.send(KEY.end);
  s.send(KEY.enter);
  await sleep(60);
  assert.equal(model.prompts.length, 1, "no ghost request during the draft");
  await esc(s.send);
  const edited = s.app.state.buffers.get(FLOW_PATH)!.text;
  s.send(KEY.ctrlP);
  for (const ch of "open keylang/flows/refund.md") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.current, "keylang/flows/refund.md");
  // Stay keeps the draft; Cancel and exit cancels it and then asks about the unsaved checkout flow.
  s.send("q");
  s.send(KEY.enter);
  assert.deepEqual([s.app.state.quit, record.status], [null, "running"]);
  s.send("q");
  s.send(KEY.right);
  s.send(KEY.enter);
  assert.equal(record.status, "cancelled");
  assert.equal(quit, 0);
  assert.match(s.app.state.message ?? "", /draft flow .*: cancelled.* · nothing written · unsaved changes in keylang\/flows\/checkout\.md/);
  const before = treeBytes(root);
  model.release();
  await s.app.idle();
  await sleep(30);
  assert.equal(record.status, "cancelled", "the late answer changes nothing");
  assert.deepEqual(treeBytes(root), before, "no proposal, stats or save");
  assert.deepEqual([s.app.state.current, s.app.state.mode, s.app.state.ghost], ["keylang/flows/refund.md", "view", null]);
  assert.equal(s.app.state.buffers.get(FLOW_PATH)!.text, edited);
  assert.equal(model.prompts.length, 1);
  s.send("q");
  assert.equal(quit, 1);
});

test("operation worker: close during a commit lets the current file finish and settles with the steps that landed; the worker then refuses work", async (t) => {
  const root = checkoutRepo(t);
  const before = treeBytes(root);
  const worker = new OperationWorker();
  let closedAt: string | null = null;
  const result = await worker.run(
    { kind: "map", root },
    {
      beforeCommit: () => {},
      onProgress: ({ text }) => {
        // A file step's note (`writing keylang/map/…`), not the phase's "writing the map".
        if (closedAt !== null || !/^writing \S+\//.test(text)) return;
        closedAt = text;
        worker.close();
      },
    },
  );
  assert.ok(result.kind === "map" && result.payload !== null, `the report is kept: ${JSON.stringify(result)}`);
  assert.equal(result.status, "cancelled");
  const steps = result.payload.steps;
  const completed = steps.filter((step) => step.state === "completed").map((step) => step.path);
  assert.ok(completed.length >= 1 && steps.some((step) => step.state === "not-attempted"), JSON.stringify(steps));
  assert.deepEqual(result.written, completed);
  const now = treeBytes(root);
  for (const path of completed) assert.ok(now.has(path), `${path} landed`);
  for (const step of steps.filter((entry) => entry.state === "not-attempted")) assert.equal(now.get(step.path), before.get(step.path), `${step.path} not written`);
  const after = await worker.run({ kind: "map-check", root });
  assert.deepEqual([after.status, after.exitCode], ["failed", 2]);
});
