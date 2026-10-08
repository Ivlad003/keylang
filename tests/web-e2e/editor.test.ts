// The diagram editor of `keylang web` in a real browser (business-flows/23):
// headless Chromium driven by playwright-core over the real CLI. A flow opens
// «з коду» with its lanes and shapes, and only its layout changes there; in
// «чернетка» the palette draws lanes, steps and a gateway with planned IDs,
// the tab's draft survives a reload; the properties panel sets ID (suggested
// by /api/ids), kind, signature, tests and description; steps connect with a
// meaning and a meaningless connection is refused with a tooltip; the keys of
// diagrams.net undo, redo, nudge, copy, paste, duplicate, group and zoom; the
// canvas exports as SVG and PNG. `window.keylangEditor.currentModel()` is
// read after each step. It also takes the screenshot of the docs
// (docs/course/images/diagrams-editor.png).
//
// Not part of `npm test`: `npm run test:web` (tests/web-e2e/browser.ts says
// which browser it takes; without one the test is skipped and says why).

import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { chromium, type Browser, type Page } from "playwright-core";
import { diagramsRepo } from "../diagrams-fixture.ts";
import { browserOptions, root, startWeb, watch } from "./browser.ts";

const SCREENSHOT = join(root, "docs/course/images/diagrams-editor.png");

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
  await dropFromPalette(page, "when", { x: application.x + 330, y: application.y + application.h / 2 });
  let now = await model(page);
  const gateway = now.nodes.find((n) => n.kind === "gateway")!;
  assert.deepEqual([gateway.id, gateway.label, gateway.layer, gateway.planned], ["", "condition", "application", false], "a gateway has a condition, no ID");
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

  assert.deepEqual(problems, []);
});

/** Where the arrow that starts a connection shows when the pointer is over a shape: at its right edge (outside a small one). */
async function arrowOf(page: Page, node: { x: number; y: number; w: number; h: number }): Promise<{ x: number; y: number }> {
  const scale = await page.evaluate(() => (globalThis as unknown as { keylangEditor: { graph: { getView(): { scale: number } } } }).keylangEditor.graph.getView().scale);
  const at = await screenPoint(page, node.x + node.w, node.y + node.h / 2);
  return node.w > 80 ? { x: at.x - 12 * scale, y: at.y } : { x: at.x + 10, y: at.y };
}

/** Starts a connection at the arrow over a shape (it shows on hover; a lane's on its header) and ends it at a page point. */
async function connect(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  await page.mouse.move(from.x + 6, from.y + 6);
  await page.mouse.move(from.x, from.y, { steps: 2 });
  await drag(page, from, to);
}

test("editor properties and connections: a palette shape gets its ID (suggested from /api/ids), kind, signature, tests and description in the panel; two steps connect as a sequence; a lane denying itself is refused with a tooltip", { skip, timeout: 120000 }, async (t) => {
  const { page, problems } = await openEditor(t);
  await page.click("#editor-mode-draft");
  const start = await model(page);
  const application = start.lanes.find((l) => l.id === "application")!;
  const buy = start.nodes.find((n) => n.id === "application.purchase.buy")!;

  // A fn from the palette, right of the step: the panel shows its planned ID.
  await dropFromPalette(page, "fn", { x: buy.x + buy.w + 160, y: buy.y + buy.h / 2 });
  const id = page.locator("#prop-id");
  assert.equal(await id.inputValue(), "planned:application.fn");

  // The ID field suggests the snapshot's IDs under what is typed.
  await id.fill("application.pur");
  await page.locator('#editor-ids option[value="application.purchase.buy"]').waitFor({ state: "attached" });

  // ID, kind, signature, tests, description: each a change of the model.
  await id.fill("planned:application.pay");
  await id.press("Enter");
  await page.selectOption("#prop-kind", "task");
  await page.fill("#prop-signature", "(order: Order) => Receipt");
  await page.press("#prop-signature", "Enter");
  await page.fill("#prop-tests", 'not a test line');
  await page.locator("#prop-description").focus();
  await page.locator("#prop-error", { hasText: /не рядок тесту/ }).waitFor();
  await page.fill("#prop-tests", 'test tests/pay.test.ts "charges the order"\ntest tests/pay.test.ts "refuses a closed order"');
  await page.locator("#prop-description").focus();
  await page.fill("#prop-description", "Charges the order once.");
  await page.locator("#prop-id").focus();
  let now = await model(page);
  const pay = now.nodes.find((n) => n.id === "planned:application.pay")!;
  assert.ok(pay, JSON.stringify(now.nodes));
  assert.deepEqual(
    [pay.kind, pay.layer, pay.planned, pay.label, pay.signature, pay.tests, pay.description],
    ["task", "application", true, "pay", "(order: Order) => Receipt", ['test tests/pay.test.ts "charges the order"', 'test tests/pay.test.ts "refuses a closed order"'], "Charges the order once."],
  );

  // The step of the code connects to the new step: a sequence, by default.
  await page.mouse.move((await centre(page, buy)).x, (await centre(page, buy)).y);
  await connect(page, await arrowOf(page, buy), await centre(page, pay));
  now = await model(page);
  const added = now.edges.filter((e) => e.key.startsWith("draft:"));
  assert.deepEqual(
    added.map((e) => [e.kind, e.fromId, e.toId]),
    [["sequence", "application.purchase.buy", "planned:application.pay"]],
  );

  // A lane that denies a dependency on itself means nothing: refused, with a tooltip saying why.
  await page.selectOption("#editor-link-kind", "deny");
  const lane = now.lanes.find((l) => l.id === "application")!;
  const header = await screenPoint(page, lane.x + 13, lane.y + lane.h / 2);
  await connect(page, header, { x: header.x, y: header.y + 30 });
  const tip = page.locator("#editor-tip");
  await tip.waitFor();
  assert.match((await tip.textContent()) ?? "", /deny: шар не може заборонити залежність від самого себе/);
  assert.equal((await model(page)).edges.length, now.edges.length, "nothing was connected");
  assert.equal(application.id, "application");

  // The panel of a connection: its meaning changes only to one that fits its ends.
  const [p, q] = [await centre(page, buy), await centre(page, pay)];
  await page.mouse.click((p.x + q.x) / 2, (p.y + q.y) / 2);
  await page.locator("#prop-link-kind").waitFor();
  await page.selectOption("#prop-link-kind", "emits");
  await page.locator("#prop-error", { hasText: /emits веде в подію/ }).waitFor();
  assert.equal(await page.locator("#prop-link-kind").inputValue(), "sequence");
  await page.selectOption("#prop-link-kind", "call");
  await page.fill("#prop-link-label", "charge");
  await page.press("#prop-link-label", "Enter");
  const edge = (await model(page)).edges.find((e) => e.key === added[0]!.key)!;
  assert.deepEqual([edge.kind, (edge as { label?: string }).label], ["call", "charge"]);

  // The screenshot of the docs: the new step selected, its panel on the right.
  await page.selectOption("#editor-link-kind", "sequence");
  await page.locator("#editor-tip").waitFor({ state: "hidden", timeout: 10000 });
  await page.mouse.click((await centre(page, pay)).x, (await centre(page, pay)).y + 18);
  await page.locator("#prop-id").waitFor();
  assert.equal(await page.locator("#prop-id").inputValue(), "planned:application.pay");
  mkdirSync(dirname(SCREENSHOT), { recursive: true });
  await page.screenshot({ path: SCREENSHOT });

  assert.deepEqual(problems, []);
});

/** How many cells are selected, and the view's scale. */
function selection(page: Page): Promise<{ count: number; scale: number }> {
  return page.evaluate(() => {
    const graph = (globalThis as unknown as { keylangEditor: { graph: { getSelectionCount(): number; getView(): { scale: number } } } }).keylangEditor.graph;
    return { count: graph.getSelectionCount(), scale: graph.getView().scale };
  });
}

test("editor keys of diagrams.net: a move undone and redone (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z), arrows nudge, Ctrl+C/V and Ctrl+D duplicate, Ctrl+G groups, Ctrl+A and the rubber band select, zoom keys; SVG and PNG export in the browser", { skip, timeout: 120000 }, async (t) => {
  const { page, problems } = await openEditor(t);
  const before = await model(page);
  const buy = before.nodes.find((n) => n.id === "application.purchase.buy")!;
  const x = (key: string, m: Model): { x: number; y: number } => {
    const node = m.nodes.find((n) => n.key === key)!;
    return { x: node.x, y: node.y };
  };

  // A move, undone and redone: the positions come back each way.
  const from = await centre(page, buy);
  await drag(page, from, { x: from.x + 80, y: from.y });
  const moved = x(buy.key, await model(page));
  assert.ok(moved.x > buy.x + 30, `${buy.x} → ${moved.x}`);
  await page.keyboard.press("Control+z");
  assert.deepEqual(x(buy.key, await model(page)), { x: buy.x, y: buy.y });
  await page.keyboard.press("Control+y");
  assert.deepEqual(x(buy.key, await model(page)), moved);
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+Shift+z");
  assert.deepEqual(x(buy.key, await model(page)), moved);
  await page.click("#editor-undo");
  assert.deepEqual(x(buy.key, await model(page)), { x: buy.x, y: buy.y });
  await page.click("#editor-redo");
  assert.deepEqual(x(buy.key, await model(page)), moved);

  // Arrows nudge the selection by a pixel, Shift+arrows by a grid step; «з коду» lets that, and Delete removes nothing.
  await page.mouse.click((await centre(page, { ...buy, ...moved })).x, (await centre(page, { ...buy, ...moved })).y);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  assert.deepEqual(x(buy.key, await model(page)), { x: moved.x + 1, y: moved.y + 10 });
  await page.keyboard.press("Backspace");
  assert.equal((await model(page)).nodes.length, before.nodes.length);
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  assert.equal((await model(page)).nodes.length, before.nodes.length, "«з коду» pastes no step");

  // Ctrl+A selects everything; Escape lets go; the rubber band over the whole canvas selects again.
  await page.keyboard.press("Control+a");
  assert.equal((await selection(page)).count, before.nodes.length + before.lanes.length + before.edges.length);
  await page.keyboard.press("Escape");
  assert.equal((await selection(page)).count, 0);
  const canvas = (await page.locator("#editor-graph").boundingBox())!;
  await drag(page, { x: canvas.x + 4, y: canvas.y + 4 }, { x: canvas.x + canvas.width - 4, y: canvas.y + canvas.height - 4 });
  assert.ok((await selection(page)).count >= before.lanes.length, "the rubber band selects the shapes inside it");
  await page.keyboard.press("Escape");

  // «чернетка»: a step from the palette, copied and pasted, then duplicated — each a new planned name in the same lane.
  await page.click("#editor-mode-draft");
  await page.click('#editor-palette [data-item="step"]');
  const first = (await model(page)).nodes.find((n) => n.key.startsWith("draft:"))!;
  await page.locator("#editor-graph").hover({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await page.keyboard.press("Control+d");
  let now = await model(page);
  const drawn = now.nodes.filter((n) => n.key.startsWith("draft:"));
  const prefix = first.id.slice(0, first.id.lastIndexOf(".") + 1) || "planned:";
  assert.deepEqual(
    drawn.map((n) => [n.id, n.layer]),
    [
      [first.id, first.layer],
      [`${prefix}step2`, first.layer],
      [`${prefix}step3`, first.layer],
    ],
  );
  assert.equal(new Set(drawn.map((n) => n.key)).size, 3, "copies get keys of their own");

  // Ctrl+G groups the two copies (Shift-click adds one), Ctrl+Shift+U lets them go; Ctrl+Z takes back the duplicate.
  const [second, third] = [drawn[1]!, drawn[2]!];
  // The copies overlap: the second is clicked at its top-left corner, out from under the third.
  const corner = await screenPoint(page, second.x + 6, second.y + 6);
  await page.mouse.click(corner.x, corner.y);
  await page.keyboard.down("Shift");
  await page.mouse.click((await centre(page, third)).x, (await centre(page, third)).y);
  await page.keyboard.up("Shift");
  await page.keyboard.press("Control+g");
  now = await model(page);
  const groups = new Set(now.nodes.filter((n) => n.key === second.key || n.key === third.key).map((n) => (n as { group?: string }).group));
  assert.equal(groups.size, 1);
  assert.ok([...groups][0], "both in one group");
  await page.keyboard.press("Control+Shift+u");
  assert.ok((await model(page)).nodes.every((n) => (n as { group?: string }).group === undefined));
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  assert.deepEqual(
    (await model(page)).nodes.filter((n) => n.key.startsWith("draft:")).map((n) => n.id),
    [first.id, `${prefix}step2`],
  );

  // + and − zoom, Ctrl+Shift+H fits.
  const scale = (await selection(page)).scale;
  await page.keyboard.press("+");
  assert.ok((await selection(page)).scale > scale);
  await page.keyboard.press("-");
  await page.keyboard.press("-");
  assert.ok((await selection(page)).scale < scale);
  await page.keyboard.press("Control+Shift+h");
  assert.ok(Math.abs((await selection(page)).scale - scale) < 0.05, "fit comes back to the fitted scale");

  // Export: an SVG of the canvas with its labels, and a PNG, both made in the browser and downloaded.
  const [svgFile] = await Promise.all([page.waitForEvent("download"), page.click("#editor-export-svg")]);
  assert.equal(svgFile.suggestedFilename(), "flow-checkout.svg");
  const svg = readFileSync((await svgFile.path())!, "utf8");
  assert.match(svg, /^<\?xml[^>]*>\s*<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /application\.purchase\.buy/);
  assert.match(svg, /<text/);
  assert.ok(svg.length > 2000, `${svg.length} bytes`);
  const [pngFile] = await Promise.all([page.waitForEvent("download"), page.click("#editor-export-png")]);
  assert.equal(pngFile.suggestedFilename(), "flow-checkout.png");
  const png = readFileSync((await pngFile.path())!);
  assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  assert.ok(png.length > 5000, `${png.length} bytes`);

  assert.deepEqual(problems, []);
});
