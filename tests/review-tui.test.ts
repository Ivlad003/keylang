// Regressions from the review of 2026-10-05, «TUI і web»: each test drives a
// session by the bytes a terminal sends and reads what it shows or writes.

import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { readStats, updateStats } from "../src/stats.ts";
import { App, type AppOptions } from "../src/tui/app.ts";
import { checkoutRepo, KEY } from "./tui-fixture.ts";
import { VirtualTerminal } from "./vt.ts";

const FLOW_PATH = "keylang/flows/checkout.md";

interface Session {
  app: App;
  vt: VirtualTerminal;
  send: (keys: string) => void;
  lines: () => string[];
  text: () => string;
}

function session(root: string, options: { cols?: number; rows?: number } & Pick<AppOptions, "operations" | "operationWorker"> = {}): Session {
  const cols = options.cols ?? 110;
  const rows = options.rows ?? 30;
  const vt = new VirtualTerminal(cols, rows);
  const { cols: _cols, rows: _rows, ...rest } = options;
  const app = new App({ root, cols, rows, ...rest });
  app.attach({ write: (ansi) => vt.feed(ansi) }, cols, rows);
  return { app, vt, send: (keys) => app.input(keys), lines: () => vt.lines(), text: () => vt.text() };
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

const CHECKOUT_FLOW_PAID = ["# flow checkout", "", "Checkout from the terminal, paid.", "", "- trigger presentation.terminal.checkout", "- step application.purchase.buy", "  - step domain.order.create", "  - step infrastructure.store.save", ""].join("\n");
