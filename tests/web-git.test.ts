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

  for (const key of ["/api/git", "/api/changes", "/api/changes?since=HEAD"]) {
    const exported = answers.get(key);
    assert.ok(exported, key);
    const live = await server.get(key);
    assert.equal(exported.status, live.status, key);
    assert.equal(exported.body, live.body, key);
  }
});
