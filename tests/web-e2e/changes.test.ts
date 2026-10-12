// «Зміни» in a real browser (.scratch/web-git/issues/02): over `keylang web
// --read-only` on a repository on a feature branch the tab names the base of
// the feature, lists the changed files and the findings over them; a spec
// opens in «Карта», another base is picked from the list; the static export
// from file:// shows the same tab; without git it says why.
//
// Not part of `npm test`: `npm run test:web`.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { chromium, type Page } from "playwright-core";
import { branchRepo, GIT_LAYERS } from "../git-fixture.ts";
import { browserOptions, root, watch } from "./browser.ts";

const options = browserOptions();

const skip = options === null ? "no Chromium: set KEYLANG_CHROMIUM or PLAYWRIGHT_BROWSERS_PATH" : false;

const bin = join(root, "bin/keylang.js");

async function readOnly(t: { after: (f: () => void | Promise<void>) => void }, cwd: string): Promise<string> {
  const child = spawn(process.execPath, [bin, "web", "--read-only", "--port", "0"], { cwd, stdio: ["ignore", "pipe", "pipe"] });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((done) => child.once("exit", done));
    }
  });
  let out = "";
  child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));
  const start = Date.now();

  while (!/keylang web: (\S+)/.test(out)) {
    if (child.exitCode !== null || Date.now() - start > 20000) throw new Error(`no URL: ${out}`);
    await new Promise((done) => setTimeout(done, 20));
  }

  return /keylang web: (\S+)/.exec(out)![1]!;
}

async function openChanges(page: Page): Promise<string> {
  await page.click('#modes button[data-mode="changes"]');
  await page.locator("#changes .changes-summary").waitFor({ timeout: 30000 });

  return page.locator("#changes .changes-summary").innerText();
}

test("«Зміни» over web --read-only: the base of the feature, the changed files by kind and the broken deny; a spec opens in «Карта»; HEAD as the base narrows the list", { skip }, async (t) => {
  const repo = branchRepo(t);
  const url = await readOnly(t, repo);
  const browser = await chromium.launch(options ?? {});
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1300, height: 800 } });
  const problems = watch(page);
  await page.goto(url);
  assert.match(await openChanges(page), /^5 змінено · 1 видалено · ✗ [1-9]\d* fail/);
  assert.match(await page.locator("#changes .note").first().innerText(), /feature @ [0-9a-f]{7} · від merge-base [0-9a-f]{7} with main/);
  const files = await page.locator("#changes .changes-files li").allInnerTexts();
  assert.deepEqual(files.map((text) => text.replace(/\s+/g, " ").trim()), ["other docs/shot.png", "spec keylang/rules.md", "other notes.txt", "code src/app/refund.ts app.refund", "code src/domain/order.ts domain.order", "deleted src/domain/old.ts domain.old"]);
  assert.match(await page.locator("#changes .results").innerText(), /domain.*app|deny/);
  // The list on the left: the files by kind.
  const groups = await page.locator("#views .group").allInnerTexts();
  assert.ok(groups.some((group) => /Змінений код/.test(group)) && groups.some((group) => /Видалені/.test(group)), groups.join(" | "));
  // HEAD as the base: only the working tree's changes.
  await page.selectOption("#changes-base", "HEAD");
  await page.locator("#changes .changes-summary", { hasText: /^3 змінено · 0 видалено/ }).waitFor();
  assert.match(page.url(), /#view=changes&since=HEAD$/);
  // A spec opens in «Карта».
  await page.locator("#changes .changes-files button", { hasText: "keylang/rules.md" }).click();
  await page.locator("#docs pre.md").waitFor();
  assert.match(await page.locator("#docs pre.md").innerText(), /- deny app domain/);
  assert.deepEqual(problems, []);
});

test("«Зміни» → «Діаграма»: the architecture diff on the canvas with its legend — added, removed, changed and context shapes, the new edge; a shape opens in the side panel; «Список» puts the canvas away", { skip }, async (t) => {
  const repo = branchRepo(t);
  const url = await readOnly(t, repo);
  const browser = await chromium.launch(options ?? {});
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1300, height: 800 } });
  const problems = watch(page);
  await page.goto(url);
  await openChanges(page);
  await page.click("#changes-diagram");
  await page.locator("#changes .changes-diff .changes-summary").waitFor({ timeout: 60000 });
  assert.match(await page.locator("#changes .changes-diff .changes-summary").innerText(), /^модулі \+1 −1 ~1 · ребра \+1 −0/);
  assert.match(await page.locator("#changes .diff-legend").innerText(), /додано[\s\S]*видалено[\s\S]*змінено[\s\S]*контекст/);
  assert.equal(await page.locator("#changes-diagram").getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator("#stage").isVisible(), true, "the canvas is shown");
  const labels = await page.locator("#graph").innerText();

  for (const label of ["+ app.refund", "− domain.old", "~ domain.order", "app.pay"]) assert.ok(labels.includes(label), `${label} in ${labels}`);
  await page.locator("#graph").getByText("~ domain.order").click();
  await page.locator("#details h2", { hasText: "domain.order" }).waitFor();
  // Functions too: the level select asks again.
  await page.selectOption("#changes-level", "fn");
  await page.locator("#changes .changes-diff .changes-summary", { hasText: /^вузли/ }).waitFor({ timeout: 60000 });
  await page.click("#changes-list");
  await page.locator("#changes .changes-files").waitFor();
  assert.equal(await page.locator("#stage").isVisible(), false, "the list puts the canvas away");
  assert.deepEqual(problems, []);
});

test("«Зміни» in a static export from file:// for the base of the feature; without git the tab says why", { skip }, async (t) => {
  const repo = branchRepo(t);
  const site = join(mkdtempSync(join(tmpdir(), "keylang-changes-site-")), "site");
  t.after(() => rmSync(join(site, ".."), { recursive: true, force: true }));
  const run = spawnSync(process.execPath, [bin, "web", "--export", site], { cwd: repo, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const browser = await chromium.launch(options ?? {});
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1300, height: 800 } });
  const problems = watch(page);
  await page.goto(`file://${join(site, "index.html")}`);
  assert.match(await openChanges(page), /^5 змінено · 1 видалено/);
  assert.equal(await page.locator("#changes-ref").count(), 0, "a static export answers only the bases it holds");

  const plain = mkdtempSync(join(tmpdir(), "keylang-changes-nogit-"));
  t.after(() => rmSync(plain, { recursive: true, force: true }));
  writeFileSync(join(plain, "keylang.json"), `${JSON.stringify(GIT_LAYERS)}\n`);
  mkdirSync(join(plain, "src/app"), { recursive: true });
  writeFileSync(join(plain, "src/app/pay.ts"), "export const a = 1;\n");
  await page.goto(await readOnly(t, plain));
  await page.click('#modes button[data-mode="changes"]');
  await page.locator("#changes .empty", { hasText: /Git недоступний/ }).waitFor();
  assert.deepEqual(problems, []);
});
