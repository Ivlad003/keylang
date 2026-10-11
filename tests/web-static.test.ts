// The read-only ways to see a repository (.scratch/web-static): `keylang web
// --read-only` (the diagram page and «Карта», GET only, nothing written) and
// `keylang web --export <dir>` (the same answers computed once into a static
// site), through the real CLI. The pages in a browser — file://, app.html —
// are in tests/web-e2e/static.test.ts.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { treeBytes } from "./cli-helpers.ts";
import { diagramsRepo } from "./diagrams-fixture.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");

interface Answer {
  status: number;
  type: string;
  body: string;
  location?: string;
}

function send(url: URL, method: string, path: string, headers: Record<string, string> = {}, body?: string): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const req = request({ host: url.hostname, port: url.port, path, method, headers }, (res) => {
      let text = "";
      res.on("data", (chunk: Buffer) => (text += chunk.toString()));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, type: String(res.headers["content-type"] ?? ""), body: text, ...(res.headers.location ? { location: res.headers.location } : {}) }));
    });
    req.on("upgrade", (res, socket) => {
      socket.destroy();
      resolve({ status: res.statusCode ?? 0, type: "", body: "" });
    });
    req.on("error", reject);
    req.end(body);
  });
}

async function startReadOnly(t: { after: (f: () => void | Promise<void>) => void }, cwd: string): Promise<URL> {
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
    if (child.exitCode !== null || Date.now() - start > 20000) throw new Error(`keylang web --read-only printed no URL: ${out}`);
    await new Promise((done) => setTimeout(done, 20));
  }
  return new URL(/keylang web: (\S+)/.exec(out)![1]!);
}

/** The answers of a static export, as its page would load them: every data script run with `keylangData` collecting. */
function exportedAnswers(site: string): Map<string, { status: number; type: string; body: string; file?: string }> {
  const answers = new Map<string, { status: number; type: string; body: string; file?: string }>();
  for (const name of readdirSync(join(site, "data"))) {
    runInNewContext(readFileSync(join(site, "data", name), "utf8"), {
      keylangData: (batch: Record<string, { status: number; type: string; body: string }>) => {
        for (const [key, answer] of Object.entries(batch)) answers.set(key, answer);
      },
    });
  }
  return answers;
}

test("web --read-only: the diagram page with «Карта» and GET alone — the rendered map and explained map without `keylang map`, every write and the TUI socket refused, nothing written, not even the fact cache", async (t) => {
  const repo = diagramsRepo(t);
  const before = treeBytes(repo);
  const url = await startReadOnly(t, repo);
  assert.equal(url.pathname, "/diagrams", "the printed URL opens the diagram page");
  const bearer = { Authorization: `Bearer ${new URLSearchParams(url.hash.slice(1)).get("t")}` };

  const home = await send(url, "GET", "/");
  assert.equal(home.status, 302);
  assert.equal(home.location, "diagrams", "relative: the same server mounted under /r/<id>/ of web --hub");
  const page = await send(url, "GET", "/diagrams");
  assert.equal(page.status, 200);
  assert.match(page.body, /<body data-source="server" data-readonly="1">/);
  assert.match(page.body, /data-mode="docs"/);
  assert.doesNotMatch(page.body, /data-mode="editor"|href="\/">термінал/, "no editor, no terminal");

  const docs = JSON.parse((await send(url, "GET", "/api/docs", bearer)).body) as { dir: string; files: { path: string; group: string }[] };
  assert.equal(docs.dir, "keylang");
  const groups = new Map(docs.files.map((file) => [file.path, file.group]));
  assert.equal(groups.get("keylang/flows/checkout.md"), "flows");
  assert.equal(groups.get("keylang/rules.md"), "spec");
  assert.ok([...groups].some(([path, group]) => group === "flows-discovered" && path.startsWith("keylang/flows-discovered/")), "the discovered view");
  assert.ok([...groups].some(([path, group]) => group === "map" && path === "keylang/map/presentation.md"), "the map, rendered: the repository has none on disk");
  assert.ok([...groups].some(([path, group]) => group === "map-explained" && path === "keylang/map-explained/README.md"), "the explained map, though `explain.map` is off");
  const map = JSON.parse((await send(url, "GET", "/api/doc?path=keylang/map/presentation.md", bearer)).body) as { path: string; text: string };
  assert.match(map.text, /^<!-- keylang:generated/);
  assert.match(map.text, /- module \[orders\]\(\.\.\/\.\.\/src\/presentation\/orders\.ts#L1\)/);
  const flow = JSON.parse((await send(url, "GET", "/api/doc?path=keylang/flows/checkout.md", bearer)).body) as { text: string };
  assert.equal(flow.text, readFileSync(join(repo, "keylang/flows/checkout.md"), "utf8"));
  for (const path of ["../keylang.json", "keylang.json", "src/presentation/orders.ts", ""]) assert.equal((await send(url, "GET", `/api/doc?path=${encodeURIComponent(path)}`, bearer)).status, 404, path);
  assert.equal((await send(url, "GET", "/api/docs")).status, 403, "the token still guards the data");

  for (const path of ["/api/views", "/api/diagram?view=layers", "/api/coverage", "/api/tour", "/api/calls?id=presentation.orders.listOrders", "/api/layout?view=layers"]) assert.equal((await send(url, "GET", path, bearer)).status, 200, path);
  // The search box finds the code by any part of an ID, the name that is the hit first.
  const search = JSON.parse((await send(url, "GET", "/api/search?q=ORDER", bearer)).body) as { hits: { id: string; kind: string }[]; total: number };
  assert.deepEqual(search.hits.slice(0, 2).map((hit) => hit.id), ["domain.order", "presentation.orders"], "the name that is the hit, the shorter first");
  assert.ok(search.hits.some((hit) => hit.id === "presentation.orders.listOrders" && hit.kind === "fn"));
  assert.equal((await send(url, "GET", "/api/search?q=o", bearer)).status, 400, "two characters at least");
  const graph = JSON.parse((await send(url, "GET", "/api/diagram?view=module&id=presentation.orders", bearer)).body) as { nodes: { label: string }[] };
  assert.ok(graph.nodes.some((n) => n.label === "domain.order"), "what the module imports");
  const json = { ...bearer, "Content-Type": "application/json" };
  const writes: [string, string, string][] = [
    ["PUT", "/api/layout?view=layers", JSON.stringify({ layout: {} })],
    ["POST", "/api/flow-proposal", JSON.stringify({ name: "x", trigger: "presentation.orders.listOrders", steps: [] })],
    ["POST", "/api/diagram-proposal", JSON.stringify({ model: { view: "layers" } })],
    ["POST", "/api/bundle", JSON.stringify({ view: "layers" })],
    ["POST", "/api/bundle-import", JSON.stringify({ text: "" })],
    ["POST", "/api/greenfield", JSON.stringify({})],
    ["GET", "/api/greenfield", ""],
  ];
  for (const [method, path, body] of writes) {
    const refused = await send(url, method, path, json, body || undefined);
    assert.equal(refused.status, 403, `${method} ${path}`);
    assert.match(refused.body, /read-only/);
  }
  const socket = await send(url, "GET", "/ws", { ...bearer, Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==", "Sec-WebSocket-Protocol": `keylang, keylang.t.${new URLSearchParams(url.hash.slice(1)).get("t")}` });
  assert.notEqual(socket.status, 101, "no TUI session");
  assert.deepEqual(treeBytes(repo), before, "nothing written: no layout, no proposal, no .keylang/ fact cache");
});

test("web --read-only refuses --new", () => {
  const run = spawnSync(process.execPath, [bin, "web", "--read-only", "--new", "x"], { encoding: "utf8" });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /--read-only writes nothing/);
});

test("web --export <dir>: a static site of the read-only page — the answers of `web --read-only` for every view, doc, ID and export file in data scripts, app.html beside it — and the repository untouched; only a new, empty or earlier export is written", async (t) => {
  const repo = diagramsRepo(t);
  const before = treeBytes(repo);
  const scratch = mkdtempSync(join(tmpdir(), "keylang-export-"));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const site = join(scratch, "site");
  const run = spawnSync(process.execPath, [bin, "web", "--export", site], { cwd: repo, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /index\.html: \d+ answers in \d+ data file\(s\)/);
  assert.deepEqual(treeBytes(repo), before, "the repository is read, never written");

  for (const file of ["index.html", "app.html", ".keylang-export.json", "assets/diagrams.js", "assets/diagrams.css", "assets/analysis.js", "assets/wasm/tree-sitter-typescript.wasm", "assets/wasm/web-tree-sitter.wasm", "assets/maxgraph-core.LICENSE", "data/0.js"]) assert.ok(existsSync(join(site, file)), file);
  const index = readFileSync(join(site, "index.html"), "utf8");
  const shards = readdirSync(join(site, "data")).length;
  assert.match(index, new RegExp(`<body data-source="static" data-readonly="1" data-shards="${shards}">`));
  assert.match(index, /src="assets\/diagrams\.js"/, "relative assets: the site works from any directory and from file://");
  assert.match(readFileSync(join(site, "app.html"), "utf8"), /<body data-source="local" data-readonly="1">/);

  // The answers are the server's, but for the absolute root, which a site does not carry.
  const answers = exportedAnswers(site);
  const url = await startReadOnly(t, repo);
  const bearer = { Authorization: `Bearer ${new URLSearchParams(url.hash.slice(1)).get("t")}` };
  const views = JSON.parse(answers.get("/api/views")!.body) as { root?: string; flows: string[]; entries: { id: string }[]; discovered: { name: string }[] };
  assert.equal(views.root, undefined);
  const served = JSON.parse((await send(url, "GET", "/api/views", bearer)).body) as { root?: string };
  delete served.root;
  assert.deepEqual(views, served);
  const keys = ["/api/diagram?view=layers", "/api/diagram?name=checkout&view=flow", `/api/diagram?name=${encodeURIComponent(views.discovered[0]!.name)}&view=discovered`, `/api/diagram?id=${encodeURIComponent(views.entries[0]!.id)}&view=entry`, "/api/coverage", "/api/tour", "/api/docs", "/api/doc?path=keylang%2Fmap%2Fpresentation.md", "/api/calls?id=presentation.orders.listOrders", "/api/usages?id=presentation.orders.listOrders"];
  for (const key of keys) {
    const exported = answers.get(key);
    assert.ok(exported, `the export answers ${key}`);
    const live = await send(url, "GET", key, bearer);
    assert.equal(exported.status, live.status, key);
    assert.equal(exported.body, live.body, key);
  }
  const bpmn = answers.get("/api/export?format=bpmn&name=checkout&view=flow")!;
  assert.equal(bpmn.file, "flow_checkout.bpmn");
  assert.match(bpmn.body, /<bpmn:definitions/);

  // Written again over itself; refused over anything else, which stays as it was.
  assert.equal(spawnSync(process.execPath, [bin, "web", "--export", site], { cwd: repo, encoding: "utf8" }).status, 0);
  const busy = join(scratch, "busy");
  mkdirSync(busy);
  writeFileSync(join(busy, "notes.txt"), "mine\n");
  const refused = spawnSync(process.execPath, [bin, "web", "--export", busy], { cwd: repo, encoding: "utf8" });
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /not empty and no keylang export/);
  assert.deepEqual(readdirSync(busy), ["notes.txt"]);
  const inside = spawnSync(process.execPath, [bin, "web", "--export", "."], { cwd: repo, encoding: "utf8" });
  assert.equal(inside.status, 2);
  assert.match(inside.stderr, /would hold the repository itself/);
  const served2 = spawnSync(process.execPath, [bin, "web", "--export", site, "--port", "0"], { cwd: repo, encoding: "utf8" });
  assert.equal(served2.status, 2);
  assert.match(served2.stderr, /--port and --host go with a server/);
  assert.deepEqual(treeBytes(repo), before);
});
