// A system on the diagram page (system-design/03–06): the list groups a
// `# system` with its schema, ER and sequences, and the system of the code;
// the schema draws components in zones with the verdicts of their
// relations, the bar over it switches views and shows the interview notes;
// ER draws tables with their columns and keys; a sequence its lifelines.
// `KEYLANG_SHOTS=<dir>` keeps screenshots of each view.
//
// Not part of `npm test`: `npm run test:web`.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { chromium } from "playwright-core";
import { tempDir, writeTree } from "../cli-helpers.ts";
import { SHOP } from "../system-fixture.ts";
import { browserOptions, startWeb, watch } from "./browser.ts";

const options = browserOptions();
const skip = options === null ? "no Chromium: set KEYLANG_CHROMIUM or PLAYWRIGHT_BROWSERS_PATH" : false;

test("a system on the page: listed with its views, schema with zones and verdicts, notes, ER with keys, a sequence, and the system of the code", { skip }, async (t) => {
  const repo = tempDir(t, "keylang-system-web-");
  writeTree(repo, SHOP);
  const url = await startWeb(t, repo);
  const browser = await chromium.launch(options ?? {});
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  const problems = watch(page);
  const shots = process.env["KEYLANG_SHOTS"];
  const shot = async (name: string): Promise<void> => {
    if (shots) await page.screenshot({ path: join(shots, `${name}.png`) });
  };
  const base = `${url.origin}/diagrams${url.hash}`;
  interface Drawn {
    nodes: { id: string; results?: { verdict: string; message: string }[] }[];
    edges: { from: string; to: string; label?: string; verdict?: string }[];
    groups: { label: string }[];
  }
  // The page's own transport, as the page asks.
  const diagram = (query: Record<string, string>): Promise<Drawn> =>
    page.evaluate(async (q) => {
      const transport = (globalThis as unknown as { keylangTransport: { send(method: string, path: string, query: URLSearchParams): Promise<{ text: string }> } }).keylangTransport;
      return JSON.parse((await transport.send("GET", "/api/diagram", new URLSearchParams(q))).text) as Drawn;
    }, query);
  await page.goto(base);
  // The list is virtual: a search brings the system's items into view.
  await page.locator("#search").fill("shortener");
  for (const label of ["shortener: схема", "shortener: ER", "shortener: redirect"]) await page.locator("#views").getByText(label).waitFor();

  await page.locator("#views").getByText("shortener: схема").click();
  await page.waitForFunction(() => /system:shortener · 8 shapes · 9 edges · ✗ 0 · ◌ 2/.test((globalThis as unknown as { document: { querySelector(s: string): { textContent: string | null } | null } }).document.querySelector("#status")?.textContent ?? ""));
  // The interview notes stand in the panel while no shape is picked.
  assert.match(await page.locator("#details").innerText(), /Система shortener[\s\S]*НЕФУНКЦІОНАЛЬНІ[\s\S]*p99 редиректу < 50 мс[\s\S]*ВІДКРИТІ ПИТАННЯ/i);
  assert.equal(await page.locator("#export-bpmn").isVisible(), false, "no BPMN of a system");
  // The verdicts of the relations from bound code: `api reads db` imports pg through infra.
  const reads = await diagram({ view: "system", name: "shortener" });
  assert.deepEqual(reads.groups.map((group) => group.label), ["vpc"]);
  assert.equal(reads.edges.find((edge) => edge.label === "reads: SELECT")?.verdict, "ok");
  assert.equal(reads.edges.find((edge) => edge.label === "calls: GET")?.verdict, "unverified");
  await shot("system");

  await page.locator("#system-bar").getByRole("button", { name: "ER", exact: true }).click();
  await page.waitForFunction(() => /er:shortener · 2 shapes · 1 edges/.test((globalThis as unknown as { document: { querySelector(s: string): { textContent: string | null } | null } }).document.querySelector("#status")?.textContent ?? ""));
  await shot("er");

  await page.locator("#system-bar").getByRole("button", { name: "↧ redirect" }).click();
  await page.waitForFunction(() => /sequence:shortener\/redirect · 6 shapes · 6 edges/.test((globalThis as unknown as { document: { querySelector(s: string): { textContent: string | null } | null } }).document.querySelector("#status")?.textContent ?? ""));
  await page.getByText("5. click").waitFor();
  await shot("sequence");

  await page.locator("#search").fill("система з коду");
  await page.locator("#views").getByText("система з коду: get-l-code").waitFor();
  await page.locator("#views").getByText("система з коду: схема").click();
  await page.waitForFunction(() => /system:@code · 6 shapes · 4 edges/.test((globalThis as unknown as { document: { querySelector(s: string): { textContent: string | null } | null } }).document.querySelector("#status")?.textContent ?? ""));
  assert.match(await page.locator("#details").innerText(), /Система з коду/);
  await shot("code");
  // A shape's panel: its kind, technology and the verdicts of its relations.
  await page.locator("#search").fill("shortener");
  await page.locator("#views").getByText("shortener: схема").click();
  await page.waitForFunction(() => /system:shortener/.test((globalThis as unknown as { document: { querySelector(s: string): { textContent: string | null } | null } }).document.querySelector("#status")?.textContent ?? ""));
  const api = await diagram({ view: "system", name: "shortener" });
  assert.deepEqual(api.nodes.find((node) => node.id === "component:api")?.results?.map((result) => result.verdict), ["ok", "ok", "unverified", "ok"]);
  assert.deepEqual(problems, []);
});

test("the editor on a system: its palette, a component drawn into a zone and «Запропонувати зміни» as a # system proposal", { skip, timeout: 120000 }, async (t) => {
  const repo = tempDir(t, "keylang-system-editor-web-");
  writeTree(repo, SHOP);
  const url = await startWeb(t, repo);
  const browser = await chromium.launch(options ?? {});
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  const problems = watch(page);
  await page.goto(`${url.origin}/diagrams${url.hash.replace(/^#/, "#view=editor&of=system%3Ashortener&")}`);
  await page.locator(".editor-palette .palette-head", { hasText: "Палітра системи" }).waitFor();
  const items = await page.locator(".editor-palette .palette-item").evaluateAll((buttons) => buttons.map((button) => (button as unknown as { dataset: Record<string, string> }).dataset["item"]));
  assert.deepEqual(items.slice(0, 3), ["sys-client", "sys-cdn", "sys-dns"]);
  assert.ok(items.includes("sys-db") && items.includes("zone"));
  assert.equal(await page.locator("#editor-link-kind").inputValue(), "relation");
  await page.click("#editor-mode-draft");
  // A click drops the shape in the middle of the canvas: inside the zone, which fills it.
  await page.locator('.editor-palette .palette-item[data-item="sys-search"]').click();
  const model = await page.evaluate(() => (globalThis as unknown as { keylangEditor: { currentModel(): { nodes: { kind: string; label: string; component?: string; layer: string | null }[] } } }).keylangEditor.currentModel());
  const drawn = model.nodes.find((node) => node.label === "search");
  assert.deepEqual([drawn?.kind, drawn?.component], ["component", "search"]);
  await page.click("#editor-propose");
  await page.locator("#editor-result", { hasText: "Пропозиції: 1" }).waitFor();
  const proposal = readFileSync(join(repo, ".keylang/proposals/keylang/system/shortener.md"), "utf8");
  assert.match(proposal, /^(?: {2})?- search search$/m);
  assert.match(proposal, /- table urls/, "the tables stay");
  assert.deepEqual(problems, []);
});
