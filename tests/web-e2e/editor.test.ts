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
  const back = (await model(page)).nodes.find((n) => n.key === buy.key)!;
  assert.deepEqual([back.x, back.y], [a.x, a.y]);

  assert.deepEqual(problems, []);
});
