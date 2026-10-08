// The entry explorer and «Сліпі зони» of `keylang web` in a real browser
// (business-flows/22 and 13): pick an entry point, open its call tree three
// levels down lazily, read a `via` badge and a hole row, tick a branch and
// «Зберегти як флоу» → the proposal is on disk and `keylang proposals`
// lists it; climb «хто викликає» from the deepest fn to the entry point;
// open the blind spots, follow an entry point without a flow into the
// explorer (Python) — no console error or CSP violation on the way. Takes
// the docs' screenshot docs/course/images/diagrams-explorer.png.
//
// `npm run test:web`; the browser as in diagrams.test.ts (skipped without one).

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { chromium, type Browser, type Locator, type Page } from "playwright-core";
import { explorerRepo } from "../explorer-fixture.ts";
import { browserOptions, root, startWeb, watch } from "./browser.ts";

const SCREENSHOT = join(root, "docs/course/images/diagrams-explorer.png");
const options = browserOptions();

/** The row of `id` in a tree (`down` or `up`), at any depth; the first one. */
function row(page: Page, tree: "down" | "up", id: string): Locator {
  return page.locator(`#tree-${tree} li.call[data-id="${id}"]`).first();
}

/** Opens a row with a click on its toggle and waits for its children. */
async function expand(page: Page, tree: "down" | "up", id: string): Promise<void> {
  const target = row(page, tree, id);
  await target.locator(":scope > .row > button.toggle").click();
  await target.locator(":scope > ul.children").waitFor();
}

test("explorer: open an entry point, expand three levels, see a via badge and a hole, save the ticked branch as a flow → one proposal; «хто викликає» climbs to the entry point; the blind spots lead back into the explorer", { skip: options === null ? "no Chromium: set KEYLANG_CHROMIUM or PLAYWRIGHT_BROWSERS_PATH" : false, timeout: 180000 }, async (t) => {
  const repo = explorerRepo(t);
  const url = await startWeb(t, repo);
  const browser: Browser = await chromium.launch({ headless: true, ...options });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
  const problems = watch(page);

  await page.goto(`${url.origin}/diagrams${url.hash}`);
  await page.locator("#views .row.item").first().waitFor({ timeout: 60000 });
  await page.click('#modes button[data-mode="explore"]');
  assert.match(page.url(), /#view=explore&id=$/);
  // Without event nodes in the snapshot the explorer says why (business-flows/08).
  await page.locator("#explorer .events-reason", { hasText: /no event nodes/ }).waitFor();
  // The list holds the entry points by kind; the search narrows it.
  const groups = await page.locator("#views .row.group").allTextContents();
  assert.ok(groups.some((g) => /Точки входу · route \(2\)/.test(g)), groups.join(" | "));
  assert.ok(groups.some((g) => /Точки входу · cli \(1\)/.test(g)), groups.join(" | "));
  assert.ok(!groups.some((g) => /Флоу/.test(g)), "the explorer lists entry points, not flows");
  await page.fill("#search", "pay");
  await page.locator("#views .row.item", { hasText: "POST /pay" }).click();
  await row(page, "down", "app.handlers.pay").waitFor();
  assert.match(page.url(), /#view=explore&id=app\.handlers\.pay$/);
  assert.match((await page.locator("#explorer h2").first().textContent()) ?? "", /route POST \/pay/);

  // Level 1: the callees in code order, the closure's badge, and the hole of `pay`.
  const charge = row(page, "down", "billing.charge.charge");
  await charge.waitFor();
  assert.equal(await charge.locator(":scope > .row .badge.via").textContent(), "closure");
  const hole = page.locator("#tree-down li.hole", { hasText: "gateway.refund" });
  await hole.waitFor();
  assert.match((await hole.textContent()) ?? "", /тут keylang сліпий — call through a local value `gateway\.refund`/);
  assert.match((await hole.locator("a.code-link").getAttribute("href")) ?? "", /^vscode:\/\/file\/.*\/src\/app\/handlers\.ts:6$/);
  // Levels 2 and 3, each asked when opened; `withLock` opens onto its own hole.
  await expand(page, "down", "billing.charge.charge");
  await expand(page, "down", "billing.audit.audit");
  await row(page, "down", "billing.audit.write").waitFor();
  await expand(page, "down", "billing.lock.withLock");
  await page.locator("#tree-down li.hole", { hasText: "call through a local value `run`" }).waitFor();
  assert.equal(await row(page, "down", "billing.audit.write").locator(":scope > .row button.toggle").isDisabled(), true, "a leaf does not open");

  // Ticking the deepest fn ticks the branch above it; «Зберегти як флоу» writes one proposal.
  await row(page, "down", "billing.audit.write").locator(":scope > .row input.pick").check();
  for (const id of ["billing.charge.charge", "billing.audit.audit"]) assert.equal(await row(page, "down", id).locator(":scope > .row input.pick").isChecked(), true, id);
  assert.equal(await row(page, "down", "billing.lock.withLock").locator(":scope > .row input.pick").isChecked(), false);
  mkdirSync(dirname(SCREENSHOT), { recursive: true });
  await page.screenshot({ path: SCREENSHOT });
  await page.fill("#flow-name", "payment");
  await page.click("#save-flow");
  const result = page.locator("#save-result.ok");
  await result.waitFor();
  assert.match((await result.textContent()) ?? "", /\.keylang\/proposals\/keylang\/flows\/payment\.md → keylang\/flows\/payment\.md\. .*MERGE in the TUI.*keylang proposals accept keylang\/flows\/payment\.md/);
  const proposal = join(repo, ".keylang/proposals/keylang/flows/payment.md");
  assert.ok(existsSync(proposal));
  assert.match(readFileSync(proposal, "utf8"), /^# flow payment\n\n<!-- keylang:web explorer -->\n\n- trigger app\.handlers\.pay .*\n {2}- step billing\.charge\.charge <!-- keylang:algo via closure -->\n {4}- step billing\.audit\.audit\n {6}- step billing\.audit\.write\n$/);
  const listed = spawnSync(process.execPath, [join(root, "bin/keylang.js"), "proposals"], { cwd: repo, encoding: "utf8" });
  assert.equal(listed.stdout, "keylang/flows/payment.md: +8 -0 (new file)\n");
  // A second save while it waits says so, and writes nothing more.
  await page.click("#save-flow");
  await page.locator("#save-result.error", { hasText: /is waiting/ }).waitFor();

  // «Хто викликає»: from `write` up to the entry point, row by row.
  await row(page, "down", "billing.audit.write").locator(":scope > .row button.reroot").click();
  await row(page, "up", "billing.audit.write").waitFor();
  assert.match(page.url(), /#view=explore&id=billing\.audit\.write$/);
  assert.match((await page.locator("#reached-from").textContent()) ?? "", /route POST \/pay \(3\)/);
  await expand(page, "up", "billing.audit.audit");
  await expand(page, "up", "billing.charge.charge");
  const entry = row(page, "up", "app.handlers.pay");
  await entry.waitFor();
  assert.match((await entry.locator(":scope > .row").textContent()) ?? "", /closure.*⏵ route POST \/pay/);
  // A reload comes back to the same root.
  await page.reload();
  await row(page, "up", "billing.audit.write").waitFor();

  // «Сліпі зони»: the five sections; an entry point without a flow opens in the explorer (Python).
  await page.click('#modes button[data-mode="blind"]');
  await page.locator("#blind-reach").waitFor({ timeout: 60000 });
  assert.match(page.url(), /#view=blind$/);
  for (const id of ["#blind-reach", "#blind-orphans", "#blind-holes", "#blind-unflowed", "#blind-data"]) await page.locator(id).waitFor();
  assert.match((await page.locator("#blind-reach").textContent()) ?? "", /100\.0% — 10 з 10 fn; точок входу 3/);
  assert.match((await page.locator("#blind-holes").textContent()) ?? "", /Дірки \(3\)/);
  assert.match((await page.locator("#blind-holes a.code-link").first().getAttribute("href")) ?? "", /^vscode:\/\/file\//);
  const unflowed = page.locator("#blind-unflowed tr", { hasText: "shop-py" });
  assert.match((await unflowed.locator("a.code-link").getAttribute("href")) ?? "", /src\/shop\/cli\.py:13$/);
  await unflowed.locator("button", { hasText: "дослідити" }).click();
  await row(page, "down", "shop.cli.helper").waitFor();
  assert.equal(await row(page, "down", "shop.cli.helper").locator(":scope > .row .badge.via").textContent(), "callable");
  await expand(page, "down", "shop.cli.apply");
  await page.locator("#tree-down li.hole", { hasText: "call through a local value `f`" }).waitFor();

  // Back to the diagrams: the last tab works as before.
  await page.click('#modes button[data-mode="diagrams"]');
  await page.locator("#views .row.group", { hasText: "Точки входу · route" }).waitFor();
  // The refused second save is the only failed request (Chromium logs it to the console as well).
  assert.deepEqual(
    problems.filter((p) => !/^409 \/api\/flow-proposal$|status of 409 \(Conflict\)/.test(p)),
    [],
  );
  assert.equal(problems.filter((p) => /^409 /.test(p)).length, 1);
});
