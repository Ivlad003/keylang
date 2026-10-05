// Regressions from the review of 2026-10-05, «TUI і web»: each test drives a
// session by the bytes a terminal sends and reads what it shows or writes.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readStats, updateStats } from "../src/stats.ts";
import { App, type AppOptions, type Surface } from "../src/tui/app.ts";
import type { OperationWorker } from "../src/tui/background.ts";
import { checkoutRepo, KEY } from "./tui-fixture.ts";
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

const CHECKOUT_FLOW_PAID = ["# flow checkout", "", "Checkout from the terminal, paid.", "", "- trigger presentation.terminal.checkout", "- step application.purchase.buy", "  - step domain.order.create", "  - step infrastructure.store.save", ""].join("\n");
