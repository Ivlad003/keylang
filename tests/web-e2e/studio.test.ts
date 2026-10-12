// «Студія» of `keylang web` in a real browser (.scratch/studio): headless
// Chromium over the real CLI. The three panes are on screen; the checkout
// flow's projection shows its spec; a type dropped on the canvas in
// «чернетка» comes back in the keylang projection as an added line and in the
// TypeScript projection as a type, highlighted while it is selected; a
// splitter drag changes the widths and a reload keeps them.
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

interface Model {
  nodes: { key: string; id: string; kind: string; x: number; y: number; w: number; h: number }[];
  lanes: { id: string; x: number; y: number; w: number; h: number }[];
}

/** The editor and the studio the page exposes. */
type StudioPage = typeof globalThis & {
  keylangEditor: {
    currentModel(): Model;
    graph: { getView(): { scale: number; translate: { x: number; y: number } }; container: { getBoundingClientRect(): { left: number; top: number } } };
  };
};

function model(page: Page): Promise<Model> {
  // SAFETY: the studio script sets globalThis.keylangEditor before it opens the first view.
  return page.evaluate(() => (globalThis as StudioPage).keylangEditor.currentModel());
}

/** The page point of a model point: the canvas's offset, the view's scale and translate. */
async function screenPoint(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([mx, my]) => {
      // SAFETY: as in `model`.
      const editor = (globalThis as StudioPage).keylangEditor;
      const view = editor.graph.getView();
      const box = editor.graph.container.getBoundingClientRect();

      return { x: box.left + (mx! + view.translate.x) * view.scale, y: box.top + (my! + view.translate.y) * view.scale };
    },
    [x, y],
  );
}

test("studio: three panes; the flow's projection; a type drawn on the canvas shows up in keylang and TypeScript, highlighted when selected; the splitter widths are kept", { skip, timeout: 120000 }, async (t) => {
  const repo = diagramsRepo(t);
  const url = await startWeb(t, repo);
  const browser: Browser = await chromium.launch({ headless: true, ...options });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const problems = watch(page);
  await page.goto(`${url.origin}/studio${url.hash}&view=${encodeURIComponent("flow:checkout")}`);

  // The view opens and its spec is projected as it is.
  await page.locator("#status", { hasText: /editor · flow:checkout/ }).waitFor();
  await page.locator("#projection .file-head", { hasText: "keylang/flows/checkout.md" }).waitFor();
  assert.equal(await page.locator("#studio-view").inputValue(), "flow:checkout");
  assert.equal(await page.locator("#projection-state").textContent(), "без змін");

  // Three panes side by side, each with room.
  const boxes = await Promise.all(["#pane-diagram", "#pane-projection", "#pane-agent"].map(async (id) => (await page.locator(id).boundingBox())!));
  assert.ok(boxes.every((box) => box.width > 200 && box.height > 400), JSON.stringify(boxes));
  assert.ok(boxes[0]!.x < boxes[1]!.x && boxes[1]!.x < boxes[2]!.x);

  // «чернетка»: a type dropped into the domain lane is a planned type of the flow.
  await page.click("#editor-mode-draft");
  const domain = (await model(page)).lanes.find((lane) => lane.id === "domain")!;
  const target = await screenPoint(page, domain.x + domain.w - 120, domain.y + domain.h / 2);
  const canvas = (await page.locator("#editor-graph").boundingBox())!;
  await page.locator('#editor-palette [data-item="type"]').dragTo(page.locator("#editor-graph"), { targetPosition: { x: target.x - canvas.x, y: target.y - canvas.y } });
  const drawn = (await model(page)).nodes.find((node) => node.key.startsWith("draft:") && node.kind === "type")!;
  assert.equal(drawn.id, "planned:domain.Type");
  const added = page.locator("#projection .line.added", { hasText: "- planned type domain.Type" });
  await added.waitFor();
  assert.match((await page.locator("#projection-state").textContent()) ?? "", /змінює 1 файл/);
  // The drop selected the shape: its line is highlighted.
  await page.locator("#projection .line.added.hit", { hasText: "domain.Type" }).waitFor();

  // TypeScript: the same canvas as a declaration, highlighted for the selected shape.
  await page.click('#pane-projection [data-format="ts"]');
  // A type without fields is `unknown` until its fields are written.
  await page.locator("#projection .line.hit", { hasText: /export type Type = unknown/ }).waitFor();
  assert.match((await page.locator("#projection .code").textContent()) ?? "", /keylang:generated by `keylang types`/);

  // The splitter: a drag right widens the canvas, a reload keeps the widths.
  const splitter = (await page.locator('.splitter[data-split="0"]').boundingBox())!;
  await page.mouse.move(splitter.x + 3, splitter.y + 200);
  await page.mouse.down();
  await page.mouse.move(splitter.x + 103, splitter.y + 200, { steps: 5 });
  await page.mouse.up();
  const wider = (await page.locator("#pane-diagram").boundingBox())!.width;
  assert.ok(wider > boxes[0]!.width + 60, `${boxes[0]!.width} → ${wider}`);
  await page.reload();
  await page.locator("#projection .file-head").first().waitFor();
  assert.ok(Math.abs((await page.locator("#pane-diagram").boundingBox())!.width - wider) < 4);

  assert.deepEqual(problems, []);
});
