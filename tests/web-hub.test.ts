// `keylang web --hub`: the start page on one port. A repository URL or path
// is cloned into the clone cache, `init`ed and mounted under `/r/<id>/` with
// a token of its own; the clone is listed and reopened; the start page's API
// needs the hub's token; `--read-only` opens every repository as
// `web --read-only`. Through the real CLI, the cache in a temporary directory.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { branchRepo } from "./git-fixture.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const bin = join(root, "bin/keylang.js");

interface Answer {
  status: number;
  body: string;
  location?: string;
}

function send(port: number, method: string, path: string, headers: Record<string, string> = {}, body?: string): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "localhost", port, path, method, headers: { Host: `localhost:${port}`, ...headers } }, (res) => {
      let text = "";
      res.on("data", (chunk: Buffer) => (text += chunk.toString()));
      res.on("end", () => {
        const answer: Answer = { status: res.statusCode ?? 0, body: text };

        if (res.headers.location) answer.location = res.headers.location;
        resolve(answer);
      });
    });

    req.on("upgrade", (res, socket) => {
      socket.destroy();
      resolve({ status: res.statusCode ?? 0, body: "" });
    });
    req.on("error", reject);
    req.end(body);
  });
}

async function hub(t: { after: (f: () => void | Promise<void>) => void }, args: string[]): Promise<{ port: number; token: string; cache: string }> {
  const scratch = mkdtempSync(join(tmpdir(), "keylang-hub-"));
  const cache = join(scratch, "cache");
  // An empty folder of its own: the hub lists no repository it runs in.
  const cwd = join(scratch, "cwd");
  mkdirSync(cwd);
  const child = spawn(process.execPath, [bin, "web", "--hub", "--port", "0", ...args], { cwd, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, XDG_CACHE_HOME: cache } });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((done) => child.once("exit", done));
    }

    rmSync(scratch, { recursive: true, force: true });
  });
  let out = "";
  child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));
  const start = Date.now();

  while (!/keylang web: (\S+)/.test(out)) {
    if (child.exitCode !== null || Date.now() - start > 20000) throw new Error(`no URL: ${out}`);
    await new Promise((done) => setTimeout(done, 20));
  }

  const url = new URL(/keylang web: (\S+)/.exec(out)![1]!);

  return { port: Number(url.port), token: new URLSearchParams(url.hash.slice(1)).get("t")!, cache };
}

test("web --hub: a path is cloned into the cache, inited and mounted under /r/<id>/ with its own token; the clone is listed and reopened; the start page's API needs the hub's token", async (t) => {
  const repo = branchRepo(t);
  const { port, token, cache } = await hub(t, []);
  const json = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const page = await send(port, "GET", "/");
  assert.equal(page.status, 200);
  assert.match(page.body, /Викачати репозиторій/);
  assert.match(page.body, /href="app\.html"/);
  assert.equal((await send(port, "GET", "/hub/api/repos")).status, 403, "no token");
  assert.equal((await send(port, "GET", "/", { Host: `evil.example:${port}` })).status, 421);
  assert.deepEqual(JSON.parse((await send(port, "GET", "/hub/api/repos", json)).body).repos, []);

  const fetched = await send(port, "POST", "/hub/api/fetch", json, JSON.stringify({ source: repo }));
  assert.equal(fetched.status, 200, fetched.body);
  // SAFETY: /hub/api/fetch answers {id, viewer, action} on 200, asserted just above
  const opened = JSON.parse(fetched.body) as { id: string; viewer: string; action: string };
  assert.equal(opened.action, "cloned");
  const match = /^\/r\/([^/]+)\/#t=([0-9a-f]{32})$/.exec(opened.viewer);
  assert.ok(match, opened.viewer);
  const viewerToken = match[2]!;
  assert.notEqual(viewerToken, token, "a repository has a token of its own");
  const clone = join(cache, "keylang", "repos", ...decodeURIComponent(match[1]!).split("~"));
  assert.ok(existsSync(join(clone, "keylang.json")) && existsSync(join(clone, "keylang/map")), "inited, with a map");

  // The repository's own keylang web, under its prefix: the page, the API with its token only, the socket.
  const prefix = `/r/${match[1]}`;
  assert.equal((await send(port, "GET", prefix)).location, `${prefix}/`, "the slash the relative URLs need");
  assert.match((await send(port, "GET", `${prefix}/`)).body, /<script src="assets\/xterm\.js">/);
  assert.match((await send(port, "GET", `${prefix}/diagrams`)).body, /<script src="assets\/diagrams\.js" defer>/);
  assert.equal((await send(port, "GET", `${prefix}/assets/diagrams.js`)).status, 200);
  const views = await send(port, "GET", `${prefix}/api/views`, { Authorization: `Bearer ${viewerToken}` });
  assert.equal(views.status, 200, views.body);
  // SAFETY: /api/views answers the views payload whose `layers` is a string array
  assert.ok((JSON.parse(views.body) as { layers: string[] }).layers.includes("domain"));
  assert.equal((await send(port, "GET", `${prefix}/api/views`, { Authorization: `Bearer ${token}` })).status, 403, "the hub's token is no repository's");
  const socket = await send(port, "GET", `${prefix}/ws`, { Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==", "Sec-WebSocket-Protocol": `keylang, keylang.t.${viewerToken}` });
  assert.equal(socket.status, 101, "the TUI's socket under the prefix");
  assert.equal((await send(port, "GET", "/r/nope/")).status, 404);

  // Listed, reopened with the same token, updated.
  // SAFETY: /hub/api/repos answers {repos: [...]} with these fields; the deepEqual below checks them
  const repos = JSON.parse((await send(port, "GET", "/hub/api/repos", json)).body) as { repos: { id: string; source: string; cloned: boolean; open: string | null }[] };
  assert.deepEqual(repos.repos.map((r) => [r.id, r.source, r.cloned, r.open]), [[opened.id, repo, true, opened.viewer]]);
  assert.equal(JSON.parse((await send(port, "POST", "/hub/api/open", json, JSON.stringify({ id: opened.id }))).body).viewer, opened.viewer);
  assert.equal(JSON.parse((await send(port, "POST", "/hub/api/fetch", json, JSON.stringify({ id: opened.id }))).body).action, "updated");

  const bad = await send(port, "POST", "/hub/api/fetch", json, JSON.stringify({ source: "--upload-pack=touch /tmp/x" }));
  assert.equal(bad.status, 400);
  assert.equal((await send(port, "POST", "/hub/api/fetch", { ...json, Origin: "http://evil.example" }, JSON.stringify({ source: repo }))).status, 403);
  assert.equal((await send(port, "GET", "/app.html")).status, 200, "a folder of this computer, analysed in the tab");
});

test("web --hub --read-only: every repository opens as web --read-only — the diagram page, no write", async (t) => {
  const repo = branchRepo(t);
  const { port, token } = await hub(t, ["--read-only"]);
  const json = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  // SAFETY: /hub/api/fetch answers {viewer} on success; the regex assert below checks it
  const opened = JSON.parse((await send(port, "POST", "/hub/api/fetch", json, JSON.stringify({ source: repo }))).body) as { viewer: string };
  const match = /^(\/r\/[^/]+\/)diagrams#t=([0-9a-f]{32})$/.exec(opened.viewer);
  assert.ok(match, opened.viewer);
  const refused = await send(port, "PUT", `${match[1]}api/layout?view=layers`, { Authorization: `Bearer ${match[2]}`, "Content-Type": "application/json" }, JSON.stringify({ layout: {} }));
  assert.equal(refused.status, 403);
  assert.match(refused.body, /read-only/);
});
