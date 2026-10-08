// The diagram page of `keylang web` in a real browser (business-flows/21):
// headless Chromium driven by playwright-core over the real CLI. Search a
// flow, open it, click a step and read its place in the code in the side
// panel, find where an ID is used and follow a usage into a discovered flow,
// come back to the same view after a reload, see a new flow appear without
// one — and no console error or CSP violation on the way. It also takes the
// screenshot of the docs (docs/course/images/diagrams-flow.png).
//
// Not part of `npm test`: `npm run test:web`. The browser is the Chromium
// the environment provides — `KEYLANG_CHROMIUM`, `/opt/pw-browsers/chromium`,
// a system Chromium or Chrome, or Playwright's own under
// `PLAYWRIGHT_BROWSERS_PATH`; playwright-core downloads nothing. Without one
// the test is skipped and says why.

import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { chromium, type Browser, type Page } from "playwright-core";
import { diagramsRepo } from "../diagrams-fixture.ts";
import { checkoutRepo } from "../tui-fixture.ts";
import { browserOptions, root, startWeb, watch } from "./browser.ts";

const SCREENSHOT = join(root, "docs/course/images/diagrams-flow.png");

/** Clicks the shape whose label holds `text` (a label is SVG text, broken into lines). */
async function clickShape(page: Page, text: string): Promise<void> {
  const label = page.locator("#graph svg text", { hasText: text }).first();
  await label.waitFor();
  await label.click();
}

const options = browserOptions();

test("diagrams page: search a flow, open it, click a step → file:line in the panel; usages lead into a discovered flow; the fragment survives a reload; a new flow appears by itself; no console errors or CSP violations", { skip: options === null ? "no Chromium: set KEYLANG_CHROMIUM or PLAYWRIGHT_BROWSERS_PATH" : false, timeout: 120000 }, async (t) => {
  const repo = diagramsRepo(t);
  const url = await startWeb(t, repo);
  const browser: Browser = await chromium.launch({ headless: true, ...options });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 820 } });
  const problems = watch(page);

  await page.goto(`${url.origin}/diagrams${url.hash}`);
  // The token left the address bar for sessionStorage.
  await page.locator("#views .row.item", { hasText: "checkout" }).first().waitFor();
  assert.doesNotMatch(page.url(), /[#&]t=/);

  // The list groups flows, discovered flows and entry points; the search narrows it.
  const groups = await page.locator("#views .row.group").allTextContents();
  assert.ok(groups.some((g) => /Флоу · presentation \(1\)/.test(g)), groups.join(" | "));
  assert.ok(groups.some((g) => /Знайдені флоу · presentation \(1\)/.test(g)), groups.join(" | "));
  assert.ok(groups.some((g) => /Точки входу · route \(2\)/.test(g)), groups.join(" | "));
  await page.fill("#search", "purchase.buy");
  await page.locator("#views .row.item").nth(1).waitFor({ state: "detached" });
  assert.match((await page.locator("#views .row.item").textContent()) ?? "", /checkout/, "an ID inside a flow finds the flow");
  await page.fill("#search", "checkout");
  await page.locator("#views .row.item", { hasText: /^flowcheckout$/ }).click();
  await page.locator("#status", { hasText: /flow:checkout · 4 shapes/ }).waitFor();
  assert.match(page.url(), /#view=flow&name=checkout$/);

  // A step → its panel: ID, kind, code and spec as text and as vscode:// links, the verdicts with their messages.
  await clickShape(page, "purchase.");
  const details = page.locator("#details");
  await details.locator("h2", { hasText: "application.purchase.buy" }).waitFor();
  const panel = (await details.textContent()) ?? "";
  assert.match(panel, /src\/application\/purchase\.ts:3/);
  assert.match(panel, /keylang\/flows\/checkout\.md:6/);
  assert.match(panel, /task \(step\)/);
  assert.match(panel, /static ok application\.purchase\.buy: called from presentation\.terminal\.checkout/);
  const href = await details.locator("a.code-link", { hasText: "purchase.ts:3" }).getAttribute("href");
  assert.match(href ?? "", /^vscode:\/\/file\/.*\/src\/application\/purchase\.ts:3$/);
  assert.match(page.url(), /&node=step%3A6$/);
  mkdirSync(dirname(SCREENSHOT), { recursive: true });
  await page.screenshot({ path: SCREENSHOT });

  // Where is an ID used: the flow, the discovered flow, the entry points; a click opens the discovered flow.
  await page.fill("#search", "domain.order.create");
  await page.click("#find-usages");
  const usages = page.locator("#usages");
  await usages.locator("button", { hasText: "discovered listOrders" }).waitFor();
  const used = (await usages.textContent()) ?? "";
  assert.match(used, /flow checkout/);
  assert.match(used, /route GET \/orders/);
  assert.match(used, /route POST \/checkout/);
  assert.equal(await page.locator("#views .row.item.marked").count(), 4, "the list keeps the views that use the ID");
  await usages.locator("button", { hasText: "discovered listOrders" }).click();
  await page.locator("#status", { hasText: /discovered:listOrders · 2 shapes/ }).waitFor();
  assert.match(page.url(), /#view=discovered&name=listOrders$/);

  // A reload comes back to the same view: the token is in sessionStorage, the view in the fragment.
  await page.reload();
  await page.locator("#status", { hasText: /discovered:listOrders · 2 shapes/ }).waitFor();

  // A new flow on disk shows up in the list without a reload (the page polls every 5 s).
  writeFileSync(join(repo, "keylang/flows/orders.md"), "# flow orders\n\n- trigger presentation.orders.listOrders\n- step domain.order.create\n");
  await page.locator("#views .row.item", { hasText: /^floworders$/ }).waitFor({ timeout: 20000 });

  // Zoom and fit keep working; the minimap is drawn.
  await page.click("#zoom-in");
  await page.click("#zoom-fit");
  assert.ok((await page.locator("#minimap svg").count()) > 0, "the outline draws into the minimap");

  assert.deepEqual(problems, []);
});

test("diagrams page: hundreds of entry points stay a few dozen rows in the DOM; scrolling and search answer at once", { skip: options === null ? "no Chromium: set KEYLANG_CHROMIUM or PLAYWRIGHT_BROWSERS_PATH" : false, timeout: 180000 }, async (t) => {
  const routes = 800;
  const names = Array.from({ length: routes }, (_, i) => `handle${i}`);
  const repo = checkoutRepo(t, {
    "src/presentation/handlers.ts": `import { create } from "../domain/order.ts";\n${names.map((name) => `export function ${name}(): void {\n  create();\n}\n`).join("")}`,
    "src/presentation/server.ts": `import { ${names.join(", ")} } from "./handlers.ts";\nconst app = { get: (_p: string, ..._h: unknown[]) => 0 };\n${names.map((name, i) => `app.get("/r${i}", ${name});`).join("\n")}\n`,
  });
  const url = await startWeb(t, repo);
  const browser: Browser = await chromium.launch({ headless: true, ...options });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const problems = watch(page);
  await page.goto(`${url.origin}/diagrams${url.hash}`);
  await page.locator("#views .row.group", { hasText: `Точки входу · route (${routes})` }).waitFor({ timeout: 60000 });
  const rows = await page.locator("#views .row").count();
  assert.ok(rows < 80, `${rows} rows in the DOM for ${routes + 2} items`);
  // The last row is reachable by scrolling, and still only a window of rows exists.
  await page.locator("#views").evaluate((list) => (list.scrollTop = list.scrollHeight));
  await page.locator("#views .row.item", { hasText: `GET /r${routes - 1}` }).waitFor();
  assert.ok((await page.locator("#views .row").count()) < 80);
  const started = Date.now();
  await page.fill("#search", `/r${routes - 2}`);
  await page.locator("#views .row.item", { hasText: `GET /r${routes - 2}` }).waitFor();
  const took = Date.now() - started;
  assert.ok(took < 1500, `search took ${took} ms`);
  await page.locator("#views .row.item", { hasText: `GET /r${routes - 2}` }).click();
  await page.locator("#status", { hasText: `entry:presentation.handlers.handle${routes - 2} · 2 shapes` }).waitFor();
  assert.deepEqual(problems, []);
});

