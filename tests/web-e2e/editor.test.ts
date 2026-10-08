// The diagram editor of `keylang web` in a real browser (business-flows/23):
// headless Chromium driven by playwright-core over the real CLI. A flow opens
// «з коду» with its lanes and shapes, and only its layout changes there.
//
// Not part of `npm test`: `npm run test:web` (tests/web-e2e/browser.ts says
// which browser it takes; without one the test is skipped and says why).

import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium, type Browser, type Page } from "playwright-core";
import { diagramsRepo } from "../diagrams-fixture.ts";
import { browserOptions, startWeb, watch } from "./browser.ts";

const options = browserOptions();
const skip = options === null ? "no Chromium: set KEYLANG_CHROMIUM or PLAYWRIGHT_BROWSERS_PATH" : false;

interface Box {
  key: string;
  id: string;
  kind: string;
  label: string;
  layer: string | null;
  planned: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  tests: string[];
  signature?: string;
  description?: string;
}
interface Model {
  view: string;
  mode: string;
  nodes: Box[];
  edges: { key: string; kind: string; from: string; to: string; fromId: string; toId: string }[];
  lanes: { key: string; id: string; label: string; x: number; y: number; w: number; h: number }[];
}

function model(page: Page): Promise<Model> {
  return page.evaluate(() => (globalThis as unknown as { keylangEditor: { currentModel(): unknown } }).keylangEditor.currentModel()) as Promise<Model>;
}

/** The page point of a model point: the canvas's offset, the view's scale and translate. */
async function screenPoint(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([mx, my]) => {
      const editor = (globalThis as unknown as { keylangEditor: { graph: { getView(): { scale: number; translate: { x: number; y: number } }; container: { getBoundingClientRect(): { left: number; top: number } } } } }).keylangEditor;
      const view = editor.graph.getView();
      const box = editor.graph.container.getBoundingClientRect();
      return { x: box.left + (mx! + view.translate.x) * view.scale, y: box.top + (my! + view.translate.y) * view.scale };
    },
    [x, y],
  );
}

/** The centre of a shape on screen. */
async function centre(page: Page, node: { x: number; y: number; w: number; h: number }): Promise<{ x: number; y: number }> {
  return screenPoint(page, node.x + node.w / 2, node.y + node.h / 2);
}

async function openEditor(t: { after: (f: () => void | Promise<void>) => void }): Promise<{ page: Page; problems: string[] }> {
  const repo = diagramsRepo(t);
  const url = await startWeb(t, repo);
  const browser: Browser = await chromium.launch({ headless: true, ...options });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
  const problems = watch(page);
  await page.goto(`${url.origin}/diagrams${url.hash}`);
  await page.locator("#views .row.item", { hasText: "checkout" }).first().waitFor();
  await page.click('#modes button[data-mode="editor"]');
  await page.locator("#views .row.item", { hasText: /^flowcheckout$/ }).click();
  await page.locator("#status", { hasText: /editor · flow:checkout/ }).waitFor();
  assert.match(page.url(), /#view=editor&of=flow%3Acheckout$/);
  return { page, problems };
}

test("editor «з коду»: a flow opens with its lanes and shapes; a shape moves, the model and the layout store follow; the content stays", { skip, timeout: 120000 }, async (t) => {
  const { page, problems } = await openEditor(t);
  const before = await model(page);
  assert.equal(before.mode, "code");
  assert.deepEqual(before.lanes.map((l) => l.id).sort(), ["application", "domain", "infrastructure", "presentation"]);
  const buy = before.nodes.find((n) => n.id === "application.purchase.buy");
  assert.ok(buy, JSON.stringify(before.nodes));
  assert.equal(buy.kind, "task");
  assert.equal(buy.layer, "application");
  assert.equal(before.nodes.find((n) => n.kind === "start")?.id, "presentation.terminal.checkout");
  assert.equal(before.edges.length, 3);

  // Drag the step 60 px right: it moves, nothing else changes.
  const from = await centre(page, buy);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 30, from.y, { steps: 5 });
  await page.mouse.move(from.x + 60, from.y, { steps: 5 });
  await page.mouse.up();
  const after = await model(page);
  const moved = after.nodes.find((n) => n.key === buy.key)!;
  assert.ok(moved.x > buy.x + 20, `${buy.x} → ${moved.x}`);
  assert.equal(after.nodes.length, before.nodes.length);
  assert.equal(after.edges.length, before.edges.length);

  if (process.env["EDITOR_SHOT"]) await page.screenshot({ path: process.env["EDITOR_SHOT"] });
  // «з коду» deletes nothing.
  await page.keyboard.press("Delete");
  assert.equal((await model(page)).nodes.length, before.nodes.length);

  // Shift-click adds a second shape to the selection; «⇤» aligns their left edges; «групувати» frames them.
  const create = after.nodes.find((n) => n.id === "domain.order.create")!;
  const there = await centre(page, create);
  await page.keyboard.down("Shift");
  await page.mouse.click(there.x, there.y);
  await page.keyboard.up("Shift");
  await page.click('#editor button[data-align="left"]');
  const aligned = await model(page);
  const [a, b] = [aligned.nodes.find((n) => n.key === buy.key)!, aligned.nodes.find((n) => n.key === create.key)!];
  assert.equal(a.x, b.x, "aligned on the left");
  assert.equal(a.x, Math.min(moved.x, create.x));
  assert.equal(a.layer, "application", "a shape aligned across lanes keeps its lane");

  // The layout store keeps the positions: another view and back, the step is where it was put.
  await page.locator("#views .row.item", { hasText: "listOrders" }).click();
  await page.locator("#status", { hasText: /editor · discovered:listOrders/ }).waitFor();
  await page.locator("#views .row.item", { hasText: /^flowcheckout$/ }).click();
  await page.locator("#status", { hasText: /editor · flow:checkout/ }).waitFor();
  const again = await model(page);
  assert.equal(again.nodes.length, before.nodes.length, "the view is drawn once, not over the last one");
  const back = again.nodes.find((n) => n.key === buy.key)!;
  assert.deepEqual([back.x, back.y], [a.x, a.y]);

  assert.deepEqual(problems, []);
});

/** Drags a palette item onto the canvas at a model point. */
async function dropFromPalette(page: Page, item: string, at: { x: number; y: number }): Promise<void> {
  const target = await screenPoint(page, at.x, at.y);
  const box = await page.locator("#editor-graph").boundingBox();
  await page.locator(`#editor-palette [data-item="${item}"]`).dragTo(page.locator("#editor-graph"), { targetPosition: { x: target.x - box!.x, y: target.y - box!.y } });
}

/** Drags with the mouse from one page point to another, in steps, as a person does. */
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 5 });
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
}

test("editor «чернетка»: the palette draws a lane and steps with planned IDs of their lane; the tab's draft survives a reload; «скинути чернетку» goes back to the code", { skip, timeout: 120000 }, async (t) => {
  const { page, problems } = await openEditor(t);
  const start = await model(page);
  const application = start.lanes.find((l) => l.id === "application")!;

  // «з коду» draws no step: only notes.
  assert.equal(await page.locator('#editor-palette [data-item="step"]').isDisabled(), true);
  assert.equal(await page.locator('#editor-palette [data-item="note"]').isDisabled(), false);

  await page.click("#editor-mode-draft");
  assert.equal((await model(page)).mode, "draft");
  // Room below the lanes: the wheel zooms out around the cursor.
  const canvas = (await page.locator("#editor-graph").boundingBox())!;
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + 40);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 100);
  await dropFromPalette(page, "step", { x: application.x + 120, y: application.y + application.h / 2 });
  const bottom = (await model(page)).lanes.reduce((max, l) => Math.max(max, l.y + l.h), 0);
  await dropFromPalette(page, "step", { x: application.x + 120, y: bottom + 60 });
  await dropFromPalette(page, "layer", { x: application.x, y: bottom + 200 });
  let now = await model(page);
  const steps = now.nodes.filter((n) => n.key.startsWith("draft:") && n.kind === "task");
  assert.deepEqual(
    steps.map((n) => [n.id, n.layer, n.planned]),
    [
      ["planned:application.step", "application", true],
      ["planned:step", null, true],
    ],
  );
  const lane = now.lanes.find((l) => l.key.startsWith("draft:"))!;
  assert.equal(lane.id, "planned:layer");

  // The second step moves into the new lane: its planned ID takes the layer.
  const loose = steps[1]!;
  await drag(page, await centre(page, loose), await screenPoint(page, lane.x + 200, lane.y + lane.h / 2));
  now = await model(page);
  assert.deepEqual(
    now.nodes.filter((n) => n.key === loose.key).map((n) => [n.id, n.layer]),
    [["planned:layer.step", "layer"]],
  );

  // A reload comes back to the draft of this tab: the mode, the new lane and steps.
  await page.waitForTimeout(400);
  await page.reload();
  await page.locator("#status", { hasText: /draft of this tab is back/ }).waitFor();
  const back = await model(page);
  assert.equal(back.mode, "draft");
  assert.deepEqual(back.nodes.map((n) => n.id).sort(), now.nodes.map((n) => n.id).sort());
  assert.equal(back.lanes.length, 5);

  // «видалити» removes a drawn step; «скинути чернетку» draws the view from the code again.
  const drawn = back.nodes.find((n) => n.id === "planned:application.step")!;
  const there = await centre(page, drawn);
  await page.mouse.click(there.x, there.y);
  await page.click("#editor-delete");
  assert.equal((await model(page)).nodes.some((n) => n.id === "planned:application.step"), false);
  await page.click("#editor-reset");
  await page.locator("#status", { hasText: /з коду: 4 shapes/ }).waitFor();
  const reset = await model(page);
  assert.equal(reset.mode, "code");
  assert.equal(reset.nodes.length, 4);
  assert.equal(reset.lanes.length, 4);

  if (process.env["EDITOR_SHOT2"]) await page.screenshot({ path: process.env["EDITOR_SHOT2"] });
  assert.deepEqual(problems, []);
});
