// The pages of `keylang web --export` in a real browser (.scratch/web-static):
// index.html opened from file:// — no server at all — draws the views and
// shows «Карта» from the data scripts; app.html, served by a plain static
// server, takes a folder through its input, analyses it in a Worker and
// answers what `keylang web --read-only` answers for the same repository.
//
// Not part of `npm test`: `npm run test:web`.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { test } from "node:test";
import { chromium } from "playwright-core";
import { analyze } from "../../src/analyze.ts";
import { createReadApi } from "../../src/tui/read-api.ts";
import { diagramsRepo } from "../diagrams-fixture.ts";
import { branchRepo } from "../git-fixture.ts";
import { browserOptions, root, watch } from "./browser.ts";

const options = browserOptions();

const skip = options === null ? "no Chromium: set KEYLANG_CHROMIUM or PLAYWRIGHT_BROWSERS_PATH" : false;

const bin = join(root, "bin/keylang.js");

const TYPES = new Map([[".html", "text/html; charset=utf-8"], [".js", "text/javascript"], [".css", "text/css"], [".wasm", "application/wasm"], [".json", "application/json"]]);

/** The transport the exported app exposes as `globalThis.keylangTransport` (web/src/api.ts `Transport`). */
type AppPage = typeof globalThis & {
  keylangTransport: { send<Body>(method: "GET" | "POST" | "PUT", path: string, query: URLSearchParams, body?: Body): Promise<{ status: number; text: string }> };
};

/** A static file server over a directory: what a person would host the export on. */
async function serveDirectory(t: { after: (f: () => void | Promise<void>) => void }, dir: string): Promise<string> {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname)).replace(/^([/\\])+/, "");
    const file = join(dir, path);

    try {
      if (!file.startsWith(dir) || !statSync(file).isFile()) throw new Error("not a file");
      res.writeHead(200, { "Content-Type": TYPES.get(extname(file)) ?? "application/octet-stream" });
      res.end(readFileSync(file));
    } catch {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  t.after(() => new Promise<void>((done) => server.close(() => done())));

  // SAFETY: a server listening on a TCP host and port reports an AddressInfo, not a pipe name.
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function exportSiteOf(t: { after: (f: () => void) => void }, repo: string): string {
  const site = join(mkdtempSync(join(tmpdir(), "keylang-site-")), "site");
  t.after(() => rmSync(join(site, ".."), { recursive: true, force: true }));
  const run = spawnSync(process.execPath, [bin, "web", "--export", site], { cwd: repo, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);

  return site;
}

test("web --export: index.html from file:// lists the views, draws a flow, opens «Карта» with the rendered map and refuses nothing it shows — no server, no console error", { skip }, async (t) => {
  const repo = diagramsRepo(t);
  const site = exportSiteOf(t, repo);
  const browser = await chromium.launch(options ?? {});
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1300, height: 800 } });
  const problems = watch(page);
  await page.goto(`file://${join(site, "index.html")}#view=flow&name=checkout`);
  await page.locator("#status", { hasText: /flow:checkout · \d+ shapes/ }).waitFor();
  assert.ok((await page.locator("#graph svg g").count()) > 0, "the flow is drawn");
  assert.deepEqual(await page.locator("#modes button").allTextContents(), ["Діаграми", "Карта", "Дослідник", "Сліпі зони", "Зміни"], "no editor");
  assert.equal(await page.locator("#copy-bundle").isVisible(), false, "nothing that writes");
  await page.click('#modes button[data-mode="docs"]');
  await page.locator("#views .row", { hasText: "presentation.md" }).first().click();
  await page.locator("#docs pre.md").waitFor();
  assert.match(await page.locator("#docs pre.md").innerText(), /- module \[orders\]/);
  assert.match(page.url(), /#view=docs&path=keylang%2Fmap%2Fpresentation\.md$/);
  await page.click('#modes button[data-mode="blind"]');
  await page.locator("#blind h3").first().waitFor();
  assert.deepEqual(problems, []);
});

test("web --export: app.html analyses a folder opened in the tab and answers as `keylang web --read-only` does for that repository, in a Worker, with no request beyond the site", { skip }, async (t) => {
  const repo = diagramsRepo(t);
  const site = exportSiteOf(t, repo);
  const base = await serveDirectory(t, site);
  const browser = await chromium.launch(options ?? {});
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1300, height: 800 } });
  const problems = watch(page);
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto(`${base}/app.html`);
  await page.locator("#open-repo-input").setInputFiles(repo);
  await page.locator("#open-repo").waitFor({ state: "detached", timeout: 60000 });
  await page.locator("#views .row", { hasText: "checkout" }).first().waitFor();

  const done = await analyze({ root: repo, persistFacts: false, saveFacts: false });
  const read = createReadApi({ root: repo, analysis: async () => done, analyze: async () => done, showRoot: false });

  const queries: [string, string][] = [
    ["/api/views", ""],
    ["/api/diagram", "view=layers"],
    ["/api/diagram", "view=flow&name=checkout"],
    ["/api/calls", "id=presentation.orders.listOrders"],
    ["/api/usages", "id=presentation.orders.listOrders"],
    ["/api/docs", ""],
    ["/api/doc", "path=keylang/map/presentation.md"],
    ["/api/doc", "path=keylang/map-explained/README.md"],
    ["/api/coverage", ""],
    ["/api/tour", ""],
  ];

  const inBrowser = await page.evaluate(async (list) => {
    // SAFETY: app.html sets globalThis.keylangTransport before it lists the views, which the test awaited.
    const transport = (globalThis as AppPage).keylangTransport;
    const out: { status: number; text: string }[] = [];

    for (const [path, query] of list) out.push(await transport.send("GET", path, new URLSearchParams(query)));

    return out;
  }, queries);

  for (const [i, [path, query]] of queries.entries()) {
    const node = await read.answer(path, new URLSearchParams(query));
    assert.equal(inBrowser[i]!.status, node.status, `${path}?${query}`);
    // The browser's root is its own (`/repo/<name>`); the answers carry no absolute path.
    assert.equal(inBrowser[i]!.text, node.body, `${path}?${query}`);
  }

  // SAFETY: app.html sets globalThis.keylangTransport before it lists the views, which the test awaited.
  const refused = await page.evaluate(() => (globalThis as AppPage).keylangTransport.send("PUT", "/api/layout", new URLSearchParams({ view: "layers" }), { layout: {} }));
  assert.equal(refused.status, 403);
  assert.deepEqual(requests.filter((url) => !url.startsWith(base) && !url.startsWith("data:") && !url.startsWith("blob:")), [], "nothing leaves the tab");
  assert.deepEqual(problems, []);
});

test("web --export: app.html reads the .git of the folder and answers /api/git and /api/changes as `keylang web --read-only` does — with isomorphic-git in the Worker, nothing written to the folder", { skip }, async (t) => {
  const repo = branchRepo(t);
  const site = exportSiteOf(t, repo);
  const base = await serveDirectory(t, site);
  const browser = await chromium.launch(options ?? {});
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1300, height: 800 } });
  const problems = watch(page);
  await page.goto(`${base}/app.html`);
  await page.locator("#open-repo-input").setInputFiles(repo);
  await page.locator("#open-repo").waitFor({ state: "detached", timeout: 60000 });

  const done = await analyze({ root: repo, persistFacts: false, saveFacts: false });
  const read = createReadApi({ root: repo, analysis: async () => done, analyze: (request) => analyze({ ...request, persistFacts: false, saveFacts: false }), showRoot: false });

  const queries: [string, string][] = [
    ["/api/git", ""],
    ["/api/changes", ""],
    ["/api/changes", "since=HEAD"],
    ["/api/changes", "since=main"],
    ["/api/changes", "since=HEAD~1"],
    ["/api/changes", "since=main^{commit}"],
  ];

  const inBrowser = await page.evaluate(async (list) => {
    // SAFETY: app.html sets globalThis.keylangTransport once the opened folder is analysed, which the test awaited.
    const transport = (globalThis as AppPage).keylangTransport;
    const out: { status: number; text: string }[] = [];

    for (const [path, query] of list) out.push(await transport.send("GET", path, new URLSearchParams(query)));

    return out;
  }, queries);

  for (const [i, [path, query]] of queries.entries()) {
    const node = await read.answer(path, new URLSearchParams(query));
    assert.equal(inBrowser[i]!.status, node.status, `${path}?${query}: ${inBrowser[i]!.text}`);
    assert.equal(inBrowser[i]!.text, node.body, `${path}?${query}`);
  }

  // SAFETY: app.html sets globalThis.keylangTransport once the opened folder is analysed, which the test awaited.
  const unknown = await page.evaluate(() => (globalThis as AppPage).keylangTransport.send("GET", "/api/changes", new URLSearchParams({ since: "no-such-branch" })));
  assert.equal(unknown.status, 400);
  // The tab over it.
  await page.click('#modes button[data-mode="changes"]');
  await page.locator("#changes .changes-summary", { hasText: /^5 змінено · 1 видалено/ }).waitFor();
  assert.deepEqual(problems, []);
});

test("web --export: app.html on a folder without .git says git is unavailable and the rest works", { skip }, async (t) => {
  const repo = diagramsRepo(t);
  const site = exportSiteOf(t, repo);
  const base = await serveDirectory(t, site);
  const browser = await chromium.launch(options ?? {});
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1300, height: 800 } });
  const problems = watch(page);
  await page.goto(`${base}/app.html`);
  await page.locator("#open-repo-input").setInputFiles(repo);
  await page.locator("#open-repo").waitFor({ state: "detached", timeout: 60000 });
  await page.click('#modes button[data-mode="changes"]');
  await page.locator("#changes .empty", { hasText: /Git недоступний: .*not a git repository/ }).waitFor();
  assert.deepEqual(problems, []);
});
