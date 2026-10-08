// Copy and paste of a diagram fragment between tabs and repositories in a real
// browser (business-flows/25): TWO `keylang web` servers on two fixture
// repositories (two ports, two origins). The editor of the first copies the
// flow `checkout` with Ctrl+A, Ctrl+C — one `text/plain`, the bundle of
// `flow export` with the shapes in its ```keylang-layout``` block — read back
// through the clipboard permissions of the browser context; Ctrl+V in the
// editor of the second opens the layer dialog, the layers are mapped there,
// and the import proposes the feature on `planned` nodes (listed by `keylang
// proposals` in that repository) and draws the shapes with their layout. A
// second tab of the first repository pastes the same text as copies with new
// draft IDs; a plain bundle of `keylang flow export` (no layout) pasted by
// hand through «Вставити пакет…» is laid out by the server.
//
// Not part of `npm test`: `npm run test:web`.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { diagramsRepo, targetRepo } from "../diagrams-fixture.ts";
import { browserOptions, root, startWeb, watch } from "./browser.ts";

const options = browserOptions();
const skip = options === null ? "no Chromium: set KEYLANG_CHROMIUM or PLAYWRIGHT_BROWSERS_PATH" : false;
const bin = join(root, "bin/keylang.js");

interface Box {
  key: string;
  id: string;
  kind: string;
  label: string;
  layer: string | null;
  planned: boolean;
  signature?: string;
  x: number;
  y: number;
}
interface Model {
  mode: string;
  nodes: Box[];
  edges: { kind: string; fromId: string; toId: string }[];
  lanes: { id: string }[];
}

function model(page: Page): Promise<Model> {
  return page.evaluate(() => (globalThis as unknown as { keylangEditor: { currentModel(): unknown } }).keylangEditor.currentModel()) as Promise<Model>;
}

/** The editor of a server's page, on a view of the list or on the empty canvas. */
async function editor(context: BrowserContext, url: URL, view: RegExp | null): Promise<{ page: Page; problems: string[] }> {
  const page = await context.newPage();
  const problems = watch(page);
  await page.goto(`${url.origin}/diagrams${url.hash}`);
  await page.locator("#status", { hasText: /pick a view|nothing to draw/ }).waitFor();
  await page.click('#modes button[data-mode="editor"]');
  if (view !== null) {
    await page.locator("#views .row.item", { hasText: view }).click();
    await page.locator("#status", { hasText: /editor · flow:/ }).waitFor();
  } else await page.locator("#status", { hasText: /an empty canvas/ }).waitFor();
  return { page, problems };
}

/** Moves the pointer over the canvas at a fraction of its box: where a paste lands. */
async function pointAt(page: Page, fx: number, fy: number): Promise<void> {
  const box = (await page.locator("#editor-graph").boundingBox())!;
  await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
}

test("copy a flow in one keylang web, paste it in another: the layer dialog, a feature proposal on planned nodes, the shapes on the canvas; the same repository pastes copies; a plain bundle is laid out", { skip, timeout: 180000 }, async (t) => {
  const source = diagramsRepo(t);
  const target = targetRepo(t);
  const [first, second] = await Promise.all([startWeb(t, source), startWeb(t, target)]);
  assert.notEqual(first.origin, second.origin, "two origins");
  const browser: Browser = await chromium.launch({ headless: true, ...options });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1440, height: 860 } });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  // The viewer copies the open flow with «Копіювати як пакет».
  const viewer = await context.newPage();
  const viewerProblems = watch(viewer);
  await viewer.goto(`${first.origin}/diagrams${first.hash}`);
  await viewer.locator("#views .row.item", { hasText: /^flowcheckout$/ }).click();
  await viewer.locator("#status", { hasText: /flow:checkout · 4 shapes/ }).waitFor();
  await viewer.click("#copy-bundle");
  await viewer.locator("#status", { hasText: /copied as a bundle: checkout · 4 shape\(s\)/ }).waitFor();
  const fromViewer = await viewer.evaluate(() => (globalThis as unknown as { navigator: { clipboard: { readText(): Promise<string> } } }).navigator.clipboard.readText());
  assert.match(fromViewer, /^# flow checkout$/m);
  assert.match(fromViewer, /"trigger:presentation\.terminal\.checkout": \{/);
  assert.deepEqual(viewerProblems, []);
  await viewer.close();

  // Copy: the whole flow, from the keyboard of the editor.
  const one = await editor(context, first, /^flowcheckout$/);
  await pointAt(one.page, 0.5, 0.5);
  await one.page.keyboard.press("Control+a");
  await one.page.keyboard.press("Control+c");
  await one.page.locator("#status", { hasText: /copied as a bundle: checkout · 4 shape\(s\)/ }).waitFor();
  const copied = await one.page.evaluate(() => (globalThis as unknown as { navigator: { clipboard: { readText(): Promise<string> } } }).navigator.clipboard.readText());
  assert.match(copied, /^<!-- keylang:bundle format=1 repo=\S+ commit=n\/a snapshot=[0-9a-f]{64} keylang=\S+ flows=checkout with-callees=1 -->$/m);
  assert.match(copied, /^# flow checkout$/m);
  const block = /```keylang-layout\n([\s\S]*?)\n```\n$/.exec(copied);
  assert.ok(block, "the layout block closes the bundle");
  const layout = JSON.parse(block[1]!) as { view: string; shapes: Record<string, { id: string; kind: string; layer: string; x: number; y: number }>; edges: Record<string, { kind: string }> };
  assert.equal(layout.view, "flow:checkout");
  assert.deepEqual(Object.keys(layout.shapes).sort(), ["step:application.purchase.buy", "step:domain.order.create", "step:infrastructure.store.save", "trigger:presentation.terminal.checkout"]);
  assert.equal(Math.min(...Object.values(layout.shapes).map((s) => s.x)), 0, "places relative to the fragment");
  assert.deepEqual(Object.values(layout.edges).map((e) => e.kind), ["sequence", "sequence", "sequence"]);

  // Paste in the other repository: Ctrl+V opens the layer dialog, prefilled by the algorithm.
  const two = await editor(context, second, null);
  await pointAt(two.page, 0.3, 0.3);
  await two.page.keyboard.press("Control+v");
  const dialog = two.page.locator("#bundle-dialog");
  await dialog.waitFor();
  assert.match((await dialog.textContent()) ?? "", /Флоу: checkout/);
  assert.equal(await two.page.locator("#bundle-layer-application").inputValue(), "api", "no layer of that name: the first one");
  assert.match((await two.page.locator("#bundle-notes").textContent()) ?? "", /layer `application` has no layer of that name here/);
  for (const [from, to] of [["presentation", "api"], ["application", "core"], ["domain", "core"], ["infrastructure", "core"]] as const) await two.page.selectOption(`#bundle-layer-${from}`, to);
  await two.page.click("#bundle-import");
  await two.page.locator("#status", { hasText: /pasted 4 shape\(s\) from .*proposed \.keylang\/proposals\/keylang\/features\/checkout\.md/ }).waitFor();
  assert.equal(await two.page.locator("#bundle-dialog").count(), 0, "the dialog is gone");
  const result = (await two.page.locator("#editor-result").textContent()) ?? "";
  assert.match(result, /\.keylang\/proposals\/keylang\/features\/checkout\.md/);
  assert.match(result, /\.keylang\/proposals\/keylang\/migration\.md/);
  assert.match(result, /4 ID, з них planned: 4/);
  const pasted = await model(two.page);
  assert.equal(pasted.mode, "draft");
  assert.deepEqual(pasted.nodes.map((n) => [n.id, n.kind, n.layer]).sort(), [
    ["planned:api.terminal.checkout", "start", "api"],
    ["planned:core.order.create", "task", "core"],
    ["planned:core.purchase.buy", "task", "core"],
    ["planned:core.store.save", "task", "core"],
  ]);
  assert.deepEqual(pasted.lanes.map((l) => l.id).sort(), ["api", "core"], "a lane per layer of the fragment");
  assert.deepEqual(pasted.edges.map((e) => `${e.fromId}->${e.toId}`).sort(), ["planned:api.terminal.checkout->planned:core.purchase.buy", "planned:core.order.create->planned:core.store.save", "planned:core.purchase.buy->planned:core.order.create"]);
  // The layout came along: create sits to the right of buy, as in the first repository.
  const at = (id: string): Box => pasted.nodes.find((n) => n.id === id)!;
  assert.ok(at("planned:core.order.create").x > at("planned:core.purchase.buy").x);
  // The proposals of the second repository: the feature and the migration table; nothing in the specs yet.
  const listed = spawnSync(process.execPath, [bin, "proposals"], { cwd: target, encoding: "utf8" });
  assert.equal(listed.status, 0, listed.stderr);
  assert.match(listed.stdout, /^keylang\/features\/checkout\.md: \+\d+ -0 \(new file\)$/m);
  assert.match(listed.stdout, /^keylang\/migration\.md: \+\d+ -0 \(new file\)$/m);
  const feature = readFileSync(join(target, ".keylang/proposals/keylang/features/checkout.md"), "utf8");
  assert.match(feature, /^- planned fn core\.purchase\.buy \(\) → void$/m);
  assert.match(feature, /^- trigger api\.terminal\.checkout$/m);
  assert.equal(existsSync(join(target, "keylang/features/checkout.md")), false, "a proposal, not the spec");

  // The same repository, another tab: the paste makes copies with new draft IDs, and writes nothing.
  const again = await editor(context, first, /^flowcheckout$/);
  await pointAt(again.page, 0.6, 0.8);
  await again.page.keyboard.press("Control+v");
  await again.page.locator("#status", { hasText: /pasted 4 shape\(s\) of .* as copies with new draft IDs/ }).waitFor();
  const copies = (await model(again.page)).nodes.filter((n) => n.id.endsWith("-copy"));
  assert.deepEqual(copies.map((n) => [n.id, n.layer]).sort(), [
    ["planned:application.buy-copy", "application"],
    ["planned:domain.create-copy", "domain"],
    ["planned:infrastructure.save-copy", "infrastructure"],
    ["planned:presentation.checkout-copy", "presentation"],
  ]);
  assert.equal(existsSync(join(source, ".keylang/proposals")), false, "the same repository proposes nothing");

  // A person merges both; the next import adds its section to the migration table.
  for (const file of ["keylang/features/checkout.md", "keylang/migration.md"]) assert.equal(spawnSync(process.execPath, [bin, "proposals", "accept", file], { cwd: target, encoding: "utf8" }).status, 0, file);

  // A plain bundle (no layout block), pasted by hand: the server lays it out, a row per layer.
  const plain = spawnSync(process.execPath, [bin, "flow", "export", "listOrders"], { cwd: source, encoding: "utf8" });
  assert.equal(plain.status, 0, plain.stderr);
  assert.ok(plain.stdout.endsWith("```keylang-layout\n```\n"), "an empty layout block");
  await two.page.click("#editor-paste-bundle");
  await two.page.fill("#bundle-paste-text", plain.stdout);
  await two.page.click("#bundle-paste-ok");
  await two.page.locator("#bundle-dialog").waitFor();
  await two.page.selectOption("#bundle-layer-domain", "core");
  await two.page.click("#bundle-import");
  await two.page.locator("#status", { hasText: /pasted \d+ shape\(s\) from .*features\/listOrders\.md/ }).waitFor();
  const laid = await model(two.page);
  assert.ok(laid.nodes.some((n) => n.id === "planned:api.orders.listOrders" && n.kind === "start"), JSON.stringify(laid.nodes.map((n) => n.id)));
  assert.match(spawnSync(process.execPath, [bin, "proposals"], { cwd: target, encoding: "utf8" }).stdout, /^keylang\/features\/listOrders\.md: /m);

  assert.deepEqual(one.problems, []);
  assert.deepEqual(two.problems, []);
  assert.deepEqual(again.problems, []);
});
