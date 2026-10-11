// Large repositories made readable on the diagram page: «Карта» opens a long
// map folded below its modules, searches and unfolds what it finds, follows
// a link to its #anchor; a slower answer never draws over the file asked
// last; explanations are grouped by layer; the blind spots group hundreds of
// orphans by layer; the layers view is a stack in the declared order.
//
// Not part of `npm test`: `npm run test:web`.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { chromium } from "playwright-core";
import { browserOptions, startWeb, watch } from "./browser.ts";

const options = browserOptions();
const skip = options === null ? "no Chromium: set KEYLANG_CHROMIUM or PLAYWRIGHT_BROWSERS_PATH" : false;

/** Sixty modules of five fns nobody calls: a map of hundreds of lines and three hundred orphans. */
function largeRepo(t: { after: (f: () => void) => void }): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-large-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  write("keylang.json", `${JSON.stringify({ languages: ["typescript"], module: "file", layers: { app: ["src/app/**"], domain: ["src/domain/**"] }, explain: { map: true } }, null, 2)}\n`);
  write("keylang/rules.md", "# rules\n\n- layers domain < app\n");
  for (let m = 0; m < 60; m++) {
    const layer = m < 40 ? "app" : "domain";
    const body = Array.from({ length: 5 }, (_, f) => `/** Step ${f} of module ${m}. */\nexport function step${m}x${f}(): number {\n  return ${f};\n}\n`).join("");
    write(`src/${layer}/m${m}.ts`, body);
  }
  // Briefs of two layers: «Пояснення» groups them by layer.
  write("keylang/explain/brief/app.m0.step0x0.md", "Step zero of the first module.\n");
  write("keylang/explain/brief/domain.m40.step40x0.md", "Step zero of the first domain module.\n");
  return dir;
}

test("«Карта» on a large map: folded below the modules, search unfolds and counts, a link opens its #anchor marked; the file asked last wins over a slower answer", { skip }, async (t) => {
  const repo = largeRepo(t);
  const url = await startWeb(t, repo);
  const browser = await chromium.launch(options ?? {});
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1300, height: 800 } });
  const problems = watch(page);
  const base = `${url.origin}/diagrams${url.hash}`;
  await page.goto(`${base}&view=docs&path=keylang%2Fmap%2Fapp.md`);
  await page.locator("#docs pre.md").waitFor();
  assert.match(await page.locator("#status").innerText(), /folded below the modules/);
  // Forty modules in sight, their fns folded.
  const visible = page.locator("#docs pre.md .line:visible");
  const modules = await page.locator("#docs pre.md .line:visible", { hasText: "module [m" }).count();
  assert.equal(modules, 40);
  assert.equal(await page.locator("#docs pre.md .line:visible", { hasText: "fn [step" }).count(), 0, "fns folded");
  const folded = await visible.count();
  // One module unfolds.
  await page.locator("#docs .line", { hasText: "module [m7](" }).locator(".md-toggle").click();
  assert.equal(await page.locator("#docs pre.md .line:visible", { hasText: "fn [step7x" }).count(), 5);
  // Everything, then folded again.
  await page.locator("#docs .md-tool", { hasText: /^розгорнути все$/ }).click();
  assert.ok((await visible.count()) > folded + 150);
  await page.locator("#docs .md-tool", { hasText: /^згорнути все$/ }).click();
  // A search unfolds what it finds and counts it.
  await page.fill("#docs .md-find", "step33x4");
  await page.locator("#docs .md-count", { hasText: "1 / 1" }).waitFor();
  assert.ok(await page.locator("#docs .md-hit-now").isVisible());
  assert.match(await page.locator("#docs .md-hit-now").innerText(), /step33x4/);

  // The explained map's link to another file opens it at the anchor, marked, and the fragment names it.
  await page.goto(`${base}&view=docs&path=keylang%2Fmap-explained%2FREADME.md`);
  await page.locator("#docs h2", { hasText: "map-explained/README.md" }).waitFor();
  const link = page.locator('#docs pre.md a[title*="map-explained/domain.md#domain.m4"]').first();
  const anchor = (await link.getAttribute("title"))!.split("#")[1]!;
  await link.click();
  await page.locator("#docs .md-target").waitFor();
  assert.ok(page.url().endsWith(`path=keylang%2Fmap-explained%2Fdomain.md&at=${encodeURIComponent(anchor)}`), page.url());
  assert.match((await page.locator("#docs .md-target").innerText()), new RegExp(`id="${anchor.replace(/\./g, "\\.")}"`));
  assert.ok(await page.locator("#docs .md-target").isVisible());

  // A slow answer for the first file does not draw over the second one, asked after it.
  await page.route(/\/api\/doc\?path=keylang%2Fmap%2Fapp\.md/, async (route) => {
    await new Promise((done) => setTimeout(done, 1500));
    await route.continue();
  });
  await page.goto(`${base}&view=docs&path=keylang%2Frules.md`);
  await page.locator("#docs h2", { hasText: "keylang/rules.md" }).waitFor();
  await page.locator("#views .row.item", { hasText: "app.md" }).first().click();
  await page.locator("#views .row.item", { hasText: "domain.md" }).first().click();
  await page.locator("#docs h2", { hasText: "keylang/map/domain.md" }).waitFor();
  await page.waitForTimeout(2000);
  assert.equal(await page.locator("#docs .md-bar h2").innerText(), "keylang/map/domain.md", "the slower app.md was dropped");

  // Explanations by layer.
  const groups = await page.locator("#views .row.group").allInnerTexts();
  assert.ok(groups.some((g) => /Пояснення · app \(1\)/.test(g)) && groups.some((g) => /Пояснення · domain \(1\)/.test(g)), groups.join(" | "));
  assert.deepEqual(problems, []);
});

test("blind spots group hundreds of orphans by layer, largest first, a table opened on demand; the layers view is a stack in the declared order", { skip }, async (t) => {
  const repo = largeRepo(t);
  const url = await startWeb(t, repo);
  const browser = await chromium.launch(options ?? {});
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1300, height: 800 } });
  const problems = watch(page);
  const base = `${url.origin}/diagrams${url.hash}`;
  await page.goto(`${base}&view=blind`);
  await page.locator("#blind-orphans .blind-group").first().waitFor({ timeout: 60000 });
  assert.deepEqual(await page.locator("#blind-orphans .blind-group summary").allInnerTexts(), ["app — 200", "domain — 100"]);
  assert.equal(await page.locator("#blind-orphans table").count(), 0, "no table before a group opens");
  await page.locator("#blind-orphans .blind-group summary", { hasText: "domain" }).click();
  await page.locator("#blind-orphans .blind-group[open] tbody tr").first().waitFor();
  assert.equal(await page.locator("#blind-orphans .blind-group[open] tbody tr").count(), 100);

  // The search box finds the code, not only the views: a module opens its dependency graph, marked.
  await page.click('#modes button[data-mode="diagrams"]');
  await page.fill("#search", "m17");
  await page.locator("#views .row.group", { hasText: "Код · module" }).waitFor();
  assert.match(await page.locator("#status").innerText(), /«m17»: \d+ у коді/);
  await page.locator("#views .row.item", { hasText: "app.m17" }).first().click();
  await page.locator("#status", { hasText: /^module:app\.m17 · \d+ shapes/ }).waitFor();
  assert.match(await page.locator("#details h2").innerText(), /app\.m17/, "the module itself picked");
  await page.fill("#search", "");

  await page.goto(`${base}&view=layers`);
  await page.locator("#status", { hasText: /^layers · \d+ shapes/ }).waitFor();
  // A few edges: drawn; «матриця» shows the same layers as a dependency matrix, «схема» goes back.
  assert.equal(await page.locator("#matrix").isVisible(), false);
  await page.click("#matrix-toggle");
  await page.locator("#matrix table.dsm").waitFor();
  assert.equal(await page.locator("#matrix th.row").count(), await page.locator("#matrix th.col").count(), "a row and a column per layer");
  const rows = (await page.locator("#matrix th.row").allInnerTexts()).map((text) => text.replace(/^\S+\s/, "").trim());
  assert.ok(rows.includes("app") && rows.includes("domain"), rows.join(","));
  await page.click("#matrix-toggle");
  assert.equal(await page.locator("#matrix").isVisible(), false);
  assert.deepEqual(problems, []);
});
