// `keylang clone` and `keylang web <url>`: a repository named by URL or path
// becomes a clone in keylang's cache with a map, through the real CLI. The
// "remote" is a local git repository, so nothing here needs the network.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { fakeAgents, type FakeAgents } from "./agent-fixture.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** keylang in `cwd` with the cache and HOME in the sandbox, and no model from the developer's env. */
function keylang(sandbox: string, args: string[], fake: FakeAgents | null = null, env: Record<string, string | undefined> = {}): Promise<Run> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [bin, ...args], {
      cwd: sandbox,
      env: {
        ...process.env,
        PATH: [...(fake ? [fake.bin] : []), ...(process.env.PATH ?? "/usr/bin:/bin").split(":")].join(":"),
        HOME: join(sandbox, "home"),
        XDG_CACHE_HOME: join(sandbox, "cache"),
        KEYLANG_AGENT: undefined,
        KEYLANG_NESTED: undefined,
        ANTHROPIC_API_KEY: undefined,
        ANTHROPIC_AUTH_TOKEN: undefined,
        OPENROUTER_API_KEY: undefined,
        ...(fake ? fake.env : {}),
        ...env,
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function git(cwd: string, args: string[]): void {
  const r = spawnSync("git", ["-c", "user.email=t@example.com", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
}

/** A sandbox with `origin/`, a two-layer TypeScript repository with one commit. */
function sandbox(t: TestContext): { dir: string; origin: string } {
  const dir = mkdtempSync(join(tmpdir(), "keylang-clone-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const origin = join(dir, "origin");
  mkdirSync(join(origin, "src/api"), { recursive: true });
  mkdirSync(join(origin, "src/domain"), { recursive: true });
  writeFileSync(join(origin, "src/api/buy.ts"), 'import { total } from "../domain/order.ts";\nexport function buy(n: number): number {\n  return total(n);\n}\n');
  writeFileSync(join(origin, "src/domain/order.ts"), "export function total(n: number): number {\n  return n * 2;\n}\n");
  git(origin, ["init", "-q"]);
  git(origin, ["add", "-A"]);
  git(origin, ["commit", "-qm", "init"]);
  return { dir, origin };
}

/** The single clone under the sandbox's cache: `local/origin-<hash>`. */
function clonePath(dir: string): string {
  const local = join(dir, "cache/keylang/repos/local");
  const [only] = readdirSync(local);
  assert.match(only ?? "", /^origin-[0-9a-f]{8}$/);
  return join(local, only!);
}

test("clone: a path becomes a shallow clone in the cache with keylang.json and a map; a rerun takes the remote's new commit", async (t) => {
  const { dir, origin } = sandbox(t);
  const first = await keylang(dir, ["clone", "origin"]);
  assert.equal(first.status, 0, first.stderr);
  const clone = clonePath(dir);
  assert.match(first.stdout, new RegExp(`^${clone}: cloned from ${origin}\n`));
  assert.match(first.stdout, /keylang\/map\/api\.md: written/);
  assert.ok(existsSync(join(clone, "keylang/map/domain.md")));
  // A clone gets no harness files: init ran with --agents=none.
  assert.ok(!existsSync(join(clone, "AGENTS.md")));
  assert.ok(!existsSync(join(clone, "keylang/map-explained")));

  writeFileSync(join(origin, "src/domain/tax.ts"), "export function tax(n: number): number {\n  return n / 5;\n}\n");
  git(origin, ["add", "-A"]);
  git(origin, ["commit", "-qm", "tax"]);
  const again = await keylang(dir, ["clone", "origin"]);
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, new RegExp(`^${clone}: updated from ${origin}\n`));
  assert.match(again.stdout, /keylang\.json: already exists, kept/);
  assert.match(readFileSync(join(clone, "keylang/map/domain.md"), "utf8"), /tax/);

  // The same repository spelled as a file:// URL is the same clone, not a refusal.
  const spelled = await keylang(dir, ["clone", `file://${origin}`]);
  assert.equal(spelled.status, 0, spelled.stderr);
  assert.match(spelled.stdout, new RegExp(`^${clone}: updated from ${origin}\n`));
});

test("clone: refuses a directory it did not clone, a bad --explain, --dry-run without the model, and a source that is neither URL nor directory", async (t) => {
  const { dir } = sandbox(t);
  mkdirSync(join(dir, "mine"));
  writeFileSync(join(dir, "mine/notes.txt"), "keep me\n");
  const taken = await keylang(dir, ["clone", "origin", "--dir", "mine"]);
  assert.equal(taken.status, 2);
  assert.match(taken.stderr, /mine exists and keylang did not clone it; pass another --dir/);
  assert.equal(readFileSync(join(dir, "mine/notes.txt"), "utf8"), "keep me\n");

  const mode = await keylang(dir, ["clone", "origin", "--explain", "everything"]);
  assert.equal(mode.status, 2);
  assert.match(mode.stderr, /--explain is one of map-only, map-and-ai, all, got `everything`/);

  const dry = await keylang(dir, ["clone", "origin", "--dry-run"]);
  assert.equal(dry.status, 2);
  assert.match(dry.stderr, /--dry-run estimates the model's part; pass --explain map-and-ai or all/);

  const nowhere = await keylang(dir, ["clone", "no-such-dir"]);
  assert.equal(nowhere.status, 2);
  assert.match(nowhere.stderr, /`no-such-dir` is neither a URL nor an existing directory/);
  assert.ok(!existsSync(join(dir, "cache")), "nothing is cloned before the arguments are valid");

  const noModel = await keylang(dir, ["clone", "origin", "--explain", "map-and-ai"]);
  assert.equal(noModel.status, 2);
  assert.match(noModel.stderr, /clone --explain map-and-ai: no model configured; set KEYLANG_AGENT/);
  assert.ok(existsSync(join(clonePath(dir), "keylang/map/api.md")), "the map is built before the model is asked for");
  assert.equal(JSON.parse(readFileSync(join(clonePath(dir), "keylang.json"), "utf8")).explain, undefined);
});

test("clone: a repository whose `.keylang` is a link out of the clone gets no marker written through it, and such a marker is never read", async (t) => {
  const { dir, origin } = sandbox(t);
  const outside = join(dir, "outside/kl");
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(outside, "clone.json"), "ORIGINAL\n");
  symlinkSync(outside, join(origin, ".keylang"), "dir");
  git(origin, ["add", "-A"]);
  git(origin, ["commit", "-qm", "link"]);

  const refused = await keylang(dir, ["clone", "origin"]);
  assert.equal(refused.status, 2, refused.stdout + refused.stderr);
  assert.match(refused.stderr, /\.keylang\/clone\.json: leads out of the repository through a link/);
  assert.equal(readFileSync(join(outside, "clone.json"), "utf8"), "ORIGINAL\n", "the file behind the link is untouched");
  assert.deepEqual(readdirSync(outside), ["clone.json"]);
  assert.ok(!existsSync(join(dir, "cache/keylang/repos/local")) || readdirSync(join(dir, "cache/keylang/repos/local")).length === 0, "no half-made clone is left in the cache");
  const again = await keylang(dir, ["clone", "origin"]);
  assert.equal(again.status, 2);
  assert.match(again.stderr, /leads out of the repository through a link/);

  // A marker behind a link is no proof keylang cloned the directory: the directory is not reset.
  const mine = join(dir, "mine");
  const elsewhere = join(dir, "outside/marker");
  mkdirSync(elsewhere, { recursive: true });
  writeFileSync(join(elsewhere, "clone.json"), `${JSON.stringify({ url: origin, key: ["local", "origin-x"] })}\n`);
  mkdirSync(mine);
  writeFileSync(join(mine, "notes.txt"), "keep me\n");
  symlinkSync(elsewhere, join(mine, ".keylang"), "dir");
  const taken = await keylang(dir, ["clone", "origin", "--dir", "mine"]);
  assert.equal(taken.status, 2, taken.stdout + taken.stderr);
  assert.match(taken.stderr, /mine exists and keylang did not clone it/);
  assert.equal(readFileSync(join(mine, "notes.txt"), "utf8"), "keep me\n");
});

test("clone --explain: a committed `keylang.json` that is a link out of the clone is not written through; the clone is removed, no model is asked", async (t) => {
  const { dir, origin } = sandbox(t);
  const outside = join(dir, "outside");
  mkdirSync(outside, { recursive: true });
  const config = `${JSON.stringify({ layers: { api: ["src/api/**"], domain: ["src/domain/**"] } }, null, 2)}\n`;
  writeFileSync(join(outside, "keylang.json"), config);
  symlinkSync(join(outside, "keylang.json"), join(origin, "keylang.json"), "file");
  git(origin, ["add", "-A"]);
  git(origin, ["commit", "-qm", "config link"]);
  const fake = fakeAgents(t, ["claude"], { reply: "Does the thing." });

  const refused = await keylang(dir, ["clone", "origin", "--explain", "map-and-ai"], fake, { KEYLANG_AGENT: "cli:claude" });
  assert.equal(refused.status, 2, refused.stdout + refused.stderr);
  assert.match(refused.stderr, /clone: keylang\.json: leads out of the repository through a link; the clone of .* was removed/);
  assert.equal(readFileSync(join(outside, "keylang.json"), "utf8"), config, "the file behind the link is untouched");
  assert.deepEqual(readdirSync(outside), ["keylang.json"]);
  assert.equal(fake.calls().length, 0, "no explanation is asked for a clone keylang cannot configure");
  const local = join(dir, "cache/keylang/repos/local");
  assert.ok(!existsSync(local) || readdirSync(local).length === 0, "the clone is removed");
  // Without --explain the clone is a plain map of the repository: nothing is written to keylang.json.
  const plain = await keylang(dir, ["clone", "origin"]);
  assert.equal(plain.status, 0, plain.stdout + plain.stderr);
  assert.equal(readFileSync(join(outside, "keylang.json"), "utf8"), config);
});

test("clone --explain map-and-ai --dry-run estimates and asks nothing; map-and-ai writes briefs and the explained map; all adds a full explanation per layer", async (t) => {
  const { dir } = sandbox(t);
  const fake = fakeAgents(t, ["claude"], { reply: "Does the thing." });
  const agent = { KEYLANG_AGENT: "cli:claude" };

  const dry = await keylang(dir, ["clone", "origin", "--explain", "all", "--dry-run"], fake, agent);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /^would explain \d+ node\(s\):/m);
  assert.match(dry.stdout, /^and 2 full layer explanation\(s\): api, domain$/m);
  assert.equal(fake.calls().length, 0);
  const clone = clonePath(dir);
  assert.equal(JSON.parse(readFileSync(join(clone, "keylang.json"), "utf8")).explain, undefined, "the estimate leaves keylang.json as init wrote it");

  const briefs = await keylang(dir, ["clone", "origin", "--explain", "map-and-ai"], fake, agent);
  assert.equal(briefs.status, 0, briefs.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(clone, "keylang.json"), "utf8")).explain, { map: true });
  assert.match(readFileSync(join(clone, "keylang/map-explained/domain.md"), "utf8"), /Does the thing\./);
  assert.ok(!existsSync(join(clone, "keylang/explain/api.md")));
  const asked = fake.calls().length;
  assert.ok(asked > 0);

  const all = await keylang(dir, ["clone", "origin", "--explain", "all"], fake, agent);
  assert.equal(all.status, 0, all.stderr);
  assert.match(all.stdout, /keylang\/explain\/api\.md: written/);
  assert.match(all.stdout, /keylang\/explain\/domain\.md: written/);
  // The briefs were fresh: only the two layers were asked.
  assert.equal(fake.calls().length, asked + 2);
});
