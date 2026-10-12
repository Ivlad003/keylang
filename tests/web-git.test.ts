// The «Зміни» tab's API (.scratch/web-git): `GET /api/git` — where the
// working tree stands and the base of a feature — and `GET /api/changes` —
// the files changed since that base and the findings of `check --changed`
// over them, as the CLI reports them; through `keylang web --read-only`,
// which reads git and writes nothing, and through a static export.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { git, treeBytes } from "./cli-helpers.ts";
import { branchRepo, GIT_LAYERS as LAYERS } from "./git-fixture.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const bin = join(root, "bin/keylang.js");

function send(url: URL, path: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: url.hostname, port: url.port, path, headers }, (res) => {
      let text = "";
      res.on("data", (chunk: Buffer) => (text += chunk.toString()));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: text }));
    });

    req.on("error", reject);
    req.end();
  });
}

async function readOnlyServer(t: { after: (f: () => void | Promise<void>) => void }, cwd: string): Promise<{ url: URL; get: (path: string) => Promise<{ status: number; body: string }> }> {
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
    if (child.exitCode !== null || Date.now() - start > 20000) throw new Error(`no URL: ${out}`);
    await new Promise((done) => setTimeout(done, 20));
  }

  const url = new URL(/keylang web: (\S+)/.exec(out)![1]!);
  const bearer = { Authorization: `Bearer ${new URLSearchParams(url.hash.slice(1)).get("t")}` };

  return { url, get: (path) => send(url, path, bearer) };
}

interface Changes {
  base: { ref: string; source: string; label: string; main?: string };
  unborn: boolean;
  files: { path: string; kind: string; modules: string[] }[];
  deleted: { path: string; modules: string[] }[];
  check: { snapshotId: string; results: unknown[]; changed: { since: string; files: string[] } } | null;
}

test("web: /api/git names HEAD, its branch and the base of a feature; /api/changes lists the files the branch changed with their modules and the findings `check --changed --since <base>` reports — and --read-only writes nothing, .git included", async (t) => {
  const repo = branchRepo(t);
  const fork = spawnSync("git", ["merge-base", "HEAD", "main"], { cwd: repo, encoding: "utf8" }).stdout.trim();
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).stdout.trim();
  git(repo, ["remote", "add", "origin", "https://user:secret@example.com/team/shop.git"]);
  // The CLI's own report first: `check` keeps a fact cache, the read-only server must not.
  const cli = spawnSync(process.execPath, [bin, "check", "--changed", "--since", fork, "--format", "json"], { cwd: repo, encoding: "utf8" });
  assert.equal(cli.status, 1, cli.stderr);
  // SAFETY: `check --format json` prints a CheckReport with snapshotId and results; the asserts below compare them field by field
  const report = JSON.parse(cli.stdout) as { snapshotId: string; results: unknown[] };
  const before = treeBytes(repo);
  const server = await readOnlyServer(t, repo);

  // SAFETY: /api/git answers the server git summary in this shape; every field read is asserted below
  const summary = JSON.parse((await server.get("/api/git")).body) as { available: boolean; head: { commit: string; short: string; branch: string }; origin: string; base: Changes["base"]; bases: { ref: string; label: string }[] };
  assert.equal(summary.available, true);
  assert.deepEqual(summary.head, { commit: head, short: head.slice(0, 7), branch: "feature" });
  assert.equal(summary.origin, "https://example.com/team/shop.git", "no credentials");
  assert.deepEqual(summary.base, { ref: fork, source: "merge-base", main: "main", label: `merge-base ${fork.slice(0, 7)} with main` });
  assert.deepEqual(summary.bases.map((base) => base.ref), [fork, "HEAD", "feature", "main"]);

  // SAFETY: /api/changes answers the Changes shape declared above; the asserts below check each field read
  const changes = JSON.parse((await server.get("/api/changes")).body) as Changes;
  assert.deepEqual(changes.base, summary.base);
  assert.equal(changes.unborn, false);
  assert.deepEqual(changes.files, [
    { path: "docs/shot.png", kind: "other", modules: [] },
    { path: "keylang/rules.md", kind: "spec", modules: [] },
    { path: "notes.txt", kind: "other", modules: [] },
    { path: "src/app/refund.ts", kind: "code", modules: ["app.refund"] },
    { path: "src/domain/order.ts", kind: "code", modules: ["domain.order"] },
  ]);
  assert.deepEqual(changes.deleted, [{ path: "src/domain/old.ts", modules: ["domain.old"] }]);
  assert.ok(report.results.length > 0, "the deny is broken on the branch");
  assert.deepEqual(changes.check?.results, report.results, "the findings of the slice, as the CLI reports them");
  assert.equal(changes.check?.snapshotId, report.snapshotId);

  // SAFETY: /api/changes answers the Changes shape declared above; the asserts below check each field read
  const sinceHead = JSON.parse((await server.get("/api/changes?since=HEAD")).body) as Changes;
  assert.deepEqual(sinceHead.base, { ref: "HEAD", source: "since", label: "HEAD" });
  assert.deepEqual(sinceHead.files.map((file) => file.path), ["docs/shot.png", "keylang/rules.md", "notes.txt"]);
  assert.deepEqual(sinceHead.deleted, []);

  const unknown = await server.get("/api/changes?since=no-such-branch");
  assert.equal(unknown.status, 400, unknown.body);
  assert.match(JSON.parse(unknown.body).error, /no-such-branch/);
  assert.equal((await server.get("/api/changes?since=--output=x")).status, 400, "an option is no ref");
  assert.deepEqual(treeBytes(repo), before, "nothing written, .git included");
});

test("web: without git /api/git is unavailable with the reason and /api/changes is 409", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "keylang-web-nogit-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "keylang.json"), `${JSON.stringify(LAYERS)}\n`);
  mkdirSync(join(dir, "src/app"), { recursive: true });
  writeFileSync(join(dir, "src/app/pay.ts"), "export const a = 1;\n");
  // No repository above the temporary directory either.
  const server = await readOnlyServer(t, dir);
  // SAFETY: /api/git without a repository answers {available: false, reason}; both fields are asserted below
  const summary = JSON.parse((await server.get("/api/git")).body) as { available: boolean; reason: string };
  assert.equal(summary.available, false);
  assert.match(summary.reason, /not a git repository|git/i);
  assert.equal((await server.get("/api/changes")).status, 409);
  assert.equal((await server.get("/api/graph-diff")).status, 409);
});

test("web --export: the site answers /api/git and /api/changes for the base of a feature and for HEAD, byte for byte as the server", async (t) => {
  const repo = branchRepo(t);
  const site = join(mkdtempSync(join(tmpdir(), "keylang-web-git-site-")), "site");
  t.after(() => rmSync(join(site, ".."), { recursive: true, force: true }));
  const run = spawnSync(process.execPath, [bin, "web", "--export", site], { cwd: repo, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const answers = new Map<string, { status: number; body: string }>();

  for (const name of readdirSync(join(site, "data"))) {
    runInNewContext(readFileSync(join(site, "data", name), "utf8"), {
      keylangData: (batch: Record<string, { status: number; body: string }>) => {
        for (const [key, answer] of Object.entries(batch)) answers.set(key, answer);
      },
    });
  }

  const server = await readOnlyServer(t, repo);

  for (const key of ["/api/git", "/api/changes", "/api/changes?since=HEAD", "/api/graph-diff"]) {
    const exported = answers.get(key);
    assert.ok(exported, key);
    const live = await server.get(key);
    assert.equal(exported.status, live.status, key);
    assert.equal(exported.body, live.body, key);
  }
});

/** The parts of `GET /api/graph-diff` the test reads (src/tui/read-api.ts). */
interface GraphDiffAnswer {
  available: boolean;
  base: { label: string };
  head: { ref: string };
  diff: { level: string; nodes: { id: string; status: string }[] };
  diagram: { nodes: { id: string; kind: string; group?: string; diff?: string | null; w: number }[]; edges: { from: string; to: string; label?: string; diff?: string | null }[]; groups: { id: string }[] };
}

test("web: /api/graph-diff answers the architecture diff since the base of a feature with its picture laid out (shapes and edges marked added, removed, changed or context); level=fn, a bad level and a bad ref; --read-only writes nothing", async (t) => {
  const repo = branchRepo(t);
  const before = treeBytes(repo);
  const server = await readOnlyServer(t, repo);
  const answer = await server.get("/api/graph-diff");
  assert.equal(answer.status, 200, answer.body);
  // SAFETY: a 200 answer of /api/graph-diff has the GraphDiffAnswer shape declared above; each field read is asserted.
  const body = JSON.parse(answer.body) as GraphDiffAnswer;
  assert.equal(body.available, true);
  assert.match(body.base.label, /^merge-base \w+ with main$/);
  assert.equal(body.head.ref, "working tree");
  assert.deepEqual(
    body.diff.nodes.map((node) => `${node.status} ${node.id}`),
    ["added app.refund", "removed domain.old", "changed domain.order"],
  );
  assert.deepEqual(
    body.diagram.nodes.map((node) => [node.id, node.kind, node.group, node.diff]),
    [
      ["mod:app.refund", "module", "app", "added"],
      ["mod:domain.old", "module", "domain", "removed"],
      ["mod:domain.order", "module", "domain", "changed"],
      ["mod:app.pay", "module", "app", null],
    ],
  );
  assert.ok(body.diagram.nodes.every((node) => node.w > 0), "laid out");
  assert.deepEqual(body.diagram.edges, [{ from: "mod:domain.order", to: "mod:app.pay", kind: "dependency", diff: "added", label: "+" }]);
  assert.deepEqual(
    body.diagram.groups.map((group) => group.id),
    ["app", "domain"],
  );

  // SAFETY: as above, a 200 answer of /api/graph-diff.
  const fn = JSON.parse((await server.get("/api/graph-diff?level=fn")).body) as GraphDiffAnswer;
  assert.equal(fn.diff.level, "fn");
  assert.ok(fn.diagram.nodes.some((node) => node.id === "fn:domain.order.price" && node.diff === "changed"));
  assert.equal((await server.get("/api/graph-diff?level=class")).status, 400);
  assert.equal((await server.get("/api/graph-diff?since=no-such-branch")).status, 400);
  // SAFETY: as above, a 200 answer of /api/graph-diff.
  const sinceHead = JSON.parse((await server.get("/api/graph-diff?since=HEAD")).body) as GraphDiffAnswer;
  assert.deepEqual(sinceHead.diff.nodes, [], "HEAD to the working tree: the rules changed, the graph did not");
  assert.deepEqual(treeBytes(repo), before, "nothing written, .git included");
});

test("web: the analysis in the browser (no git runner) answers /api/graph-diff as unavailable with the reason", async () => {
  const { createReadApi } = await import("../src/tui/read-api.ts");
  const read = createReadApi({ root: "/nowhere", analysis: () => Promise.reject(new Error("not asked")), analyze: () => Promise.reject(new Error("not asked")) });
  const answer = await read.answer("/api/graph-diff", new URLSearchParams());
  assert.equal(answer.status, 200);
  // SAFETY: the read API answers JSON on every path; the keys and `available` are asserted.
  const body = JSON.parse(answer.body) as { available: boolean; reason: string };
  assert.deepEqual(Object.keys(body), ["available", "reason"]);
  assert.equal(body.available, false);
});
