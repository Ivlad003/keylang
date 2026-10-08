// A project from a diagram in a real browser (business-flows/29): headless
// Chromium over `keylang web --new <dir>`. The page opens in the editor with
// the «Новий проєкт» panel and the template's lanes; the template changes;
// the canvas is cleared and two lanes are drawn from the palette and named,
// then a process — a trigger and three steps joined by sequence lines; «Створити
// специфікацію» writes the project's files, and `keylang feature` lists the
// three steps planned. The new flow then shows in the list of diagrams.
//
// Not part of `npm test`: `npm run test:web` (tests/web-e2e/browser.ts says
// which browser it takes; without one the test is skipped and says why).

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { chromium, type Browser, type Page } from "playwright-core";
import { browserOptions, root, watch } from "./browser.ts";

const options = browserOptions();
const skip = options === null ? "no Chromium: set KEYLANG_CHROMIUM or PLAYWRIGHT_BROWSERS_PATH" : false;
const bin = join(root, "bin/keylang.js");

interface Model {
  nodes: { key: string; id: string; kind: string; layer: string | null; x: number; y: number; w: number; h: number }[];
  edges: { kind: string; fromId: string; toId: string }[];
  lanes: { key: string; id: string; x: number; y: number; w: number; h: number }[];
  mode: string;
}

function model(page: Page): Promise<Model> {
  return page.evaluate(() => (globalThis as unknown as { keylangEditor: { currentModel(): unknown } }).keylangEditor.currentModel()) as Promise<Model>;
}

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

async function centre(page: Page, node: { x: number; y: number; w: number; h: number }): Promise<{ x: number; y: number }> {
  return screenPoint(page, node.x + node.w / 2, node.y + node.h / 2);
}

async function dropFromPalette(page: Page, item: string, at: { x: number; y: number }): Promise<void> {
  const target = await screenPoint(page, at.x, at.y);
  const box = await page.locator("#editor-graph").boundingBox();
  await page.locator(`#editor-palette [data-item="${item}"]`).dragTo(page.locator("#editor-graph"), { targetPosition: { x: target.x - box!.x, y: target.y - box!.y } });
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 10 });
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.move(to.x + 2, to.y + 2, { steps: 2 });
  await page.mouse.up();
}

/** The arrow that starts a connection: at a shape's right edge, outside a small one. */
async function arrowOf(page: Page, node: { x: number; y: number; w: number; h: number }): Promise<{ x: number; y: number }> {
  const scale = await page.evaluate(() => (globalThis as unknown as { keylangEditor: { graph: { getView(): { scale: number } } } }).keylangEditor.graph.getView().scale);
  const at = await screenPoint(page, node.x + node.w, node.y + node.h / 2);
  return node.w > 80 ? { x: at.x - 12 * scale, y: at.y } : { x: at.x + 10, y: at.y };
}

async function connect(page: Page, from: { x: number; y: number; w: number; h: number }, to: { x: number; y: number; w: number; h: number }): Promise<void> {
  // Away first, so the shape is entered afresh and shows its arrow.
  const away = await page.locator("#editor-graph").boundingBox();
  await page.mouse.move(away!.x + away!.width - 10, away!.y + away!.height - 10);
  const middle = await centre(page, from);
  await page.mouse.move(middle.x, middle.y, { steps: 3 });
  const arrow = await arrowOf(page, from);
  await page.mouse.move(arrow.x + 6, arrow.y + 6);
  await page.mouse.move(arrow.x, arrow.y, { steps: 2 });
  await drag(page, arrow, await centre(page, to));
}

/** Names the selected shape in the properties panel. */
async function rename(page: Page, id: string): Promise<void> {
  await page.locator("#prop-id").fill(id);
  await page.locator("#prop-id").press("Enter");
}

async function startNew(t: { after: (f: () => void | Promise<void>) => void }, dir: string): Promise<URL> {
  const child = spawn(process.execPath, [bin, "web", "--new", dir, "--port", "0"], { stdio: ["pipe", "pipe", "pipe"] });
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
    if (Date.now() - start > 20000) throw new Error(`keylang web --new printed no URL: ${out}`);
    await new Promise((done) => setTimeout(done, 50));
  }
  return new URL(/keylang web: (\S+)/.exec(out)![1]!);
}

test("web --new: the editor opens with the template's lanes; two lanes and a process of three steps drawn from the palette become the project's files; feature lists the three steps planned", { skip, timeout: 180000 }, async (t) => {
  const parent = mkdtempSync(join(tmpdir(), "keylang-greenfield-e2e-"));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const dir = join(parent, "shop");
  const url = await startNew(t, dir);
  const browser: Browser = await chromium.launch({ headless: true, ...options });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const problems = watch(page);
  await page.goto(url.toString());

  // `#new=1`: the editor on an empty canvas, «чернетка», the panel, and the lanes of «4 шари».
  await page.locator("#greenfield").waitFor();
  await page.waitForFunction(() => (globalThis as unknown as { keylangEditor: { currentModel(): { lanes: unknown[] } } }).keylangEditor.currentModel().lanes.length === 4);
  let now = await model(page);
  assert.equal(now.mode, "draft");
  assert.deepEqual([...now.lanes].sort((a, b) => a.y - b.y).map((l) => l.id), ["planned:presentation", "planned:application", "planned:infrastructure", "planned:domain"]);
  assert.equal(await page.locator("#greenfield-new").isVisible(), true);

  // Another template: its lanes go below, a layer the canvas has already once.
  await page.selectOption("#greenfield-template", "hexagonal");
  await page.click("#greenfield-apply");
  assert.deepEqual((await model(page)).lanes.map((l) => l.id).slice(4), ["planned:adapters", "planned:ports"]);

  // A clean canvas, the view at scale 1, and two lanes from the palette, named in the panel.
  await page.locator("#editor-graph").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  assert.equal((await model(page)).lanes.length, 0);
  await page.evaluate(() => (globalThis as unknown as { keylangEditor: { graph: { getView(): { scaleAndTranslate(s: number, x: number, y: number): void } } } }).keylangEditor.graph.getView().scaleAndTranslate(1, 0, 0));
  await dropFromPalette(page, "layer", { x: 20, y: 20 });
  await rename(page, "planned:application");
  await dropFromPalette(page, "layer", { x: 20, y: 190 });
  await rename(page, "planned:domain");
  now = await model(page);
  assert.deepEqual(now.lanes.map((l) => l.id), ["planned:application", "planned:domain"]);

  // A process: a route trigger and three steps, two in application and one in domain.
  await dropFromPalette(page, "trigger", { x: 80, y: 95 });
  await rename(page, "planned:application.placeOrder");
  await page.selectOption("#prop-trigger", "route");
  await dropFromPalette(page, "step", { x: 230, y: 95 });
  await dropFromPalette(page, "step", { x: 430, y: 95 });
  await dropFromPalette(page, "step", { x: 330, y: 265 });
  now = await model(page);
  const trigger = now.nodes.find((n) => n.kind === "start")!;
  const steps = now.nodes.filter((n) => n.kind === "task").sort((a, b) => a.y - b.y || a.x - b.x);
  assert.deepEqual(steps.map((s) => s.id), ["planned:application.step", "planned:application.step2", "planned:domain.step"]);
  await connect(page, trigger, steps[0]!);
  await connect(page, steps[0]!, steps[2]!);
  await connect(page, steps[2]!, steps[1]!);
  now = await model(page);
  assert.deepEqual(
    now.edges.map((e) => [e.kind, e.fromId, e.toId]),
    [
      ["sequence", "planned:application.placeOrder", "planned:application.step"],
      ["sequence", "planned:application.step", "planned:domain.step"],
      ["sequence", "planned:domain.step", "planned:application.step2"],
    ],
  );

  // The idea, a language, and «Створити специфікацію».
  await page.fill("#greenfield-idea", "Книжкова крамниця: кошик і замовлення.");
  await page.check("#greenfield-lang-python");
  await page.click("#greenfield-create");
  await page.locator('#greenfield-result[data-status="written"]').waitFor();
  for (const file of ["keylang.json", "keylang/rules.md", "keylang/features/placeOrder.md", "keylang/README.md", "keylang/diagrams/flow--placeOrder.layout.json", "src/application/.gitkeep", "src/domain/.gitkeep"]) {
    assert.ok(existsSync(join(dir, file)), file);
  }
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "keylang.json"), "utf8")).languages, ["typescript", "python"]);
  assert.equal(readFileSync(join(dir, "keylang/rules.md"), "utf8"), "# rules\n\n- layers domain < application\n");
  assert.match(await page.locator("#greenfield-next").innerText(), /keylang feature placeOrder/);
  assert.equal(await page.locator("#greenfield-new").isVisible(), false, "the project exists now");

  // `feature`: the three steps planned (with the trigger's fn).
  const feature = spawnSync(process.execPath, [bin, "feature", "placeOrder", "--format", "json"], { cwd: dir, encoding: "utf8" });
  assert.equal(feature.status, 1, feature.stderr);
  const planned = (JSON.parse(feature.stdout) as { gaps: { kind: string; id: string }[] }).gaps.filter((g) => g.kind === "planned").map((g) => g.id);
  assert.deepEqual(planned.filter((id) => id !== "application.placeOrder").sort(), ["application.step", "application.step2", "domain.step"]);
  assert.match(readFileSync(join(dir, "keylang/features/placeOrder.md"), "utf8"), /^- trigger route application\.placeOrder\n- step application\.step\n- step domain\.step\n- step application\.step2\n/m);
  const check = spawnSync(process.execPath, [bin, "check"], { cwd: dir, encoding: "utf8" });
  assert.equal(check.status, 0, check.stdout + check.stderr);

  // The list of diagrams picks the new flow up by itself.
  await page.click('#modes button[data-mode="diagrams"]');
  await page.locator("#views .row.item", { hasText: "placeOrder" }).first().waitFor({ timeout: 15000 });

  assert.deepEqual(problems, []);
});
