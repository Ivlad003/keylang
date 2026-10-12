// `keylang diff` (.scratch/graph-diff): the architecture diff between two
// revisions through the real CLI — modules added, removed and changed, new
// and removed edges, flow steps, new and fixed findings, K108 — in its four
// formats, with its exit codes; a commit is analysed in a temporary
// directory that is gone afterwards, and neither `.git` nor the working tree
// (nor the fact cache) is written.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { bin, git, keylang, tempDir, treeBytes } from "./cli-helpers.ts";
import { branchRepo, GIT_LAYERS } from "./git-fixture.ts";

/** The parts of `--format json` the tests read (src/graph-diff.ts, `GraphDiff`). */
interface Diff {
  base: { ref: string; commit: string | null; short: string | null; subject: string | null; label: string };
  head: { ref: string; commit: string | null; label: string };
  level: string;
  nodes: { id: string; kind: string; status: string; file: string | null; changes: string[] }[];
  edges: { source: string; target: string; kind: string; status: string }[];
  flows: { name: string; status: string; steps: { key: string; status: string }[] }[];
  findings: { code: string | null; criterion: string; area: string; verdict: string; status: string }[];
  weakenings: { file: string; message: string }[];
}

/** One run: the exit code, both streams, and what it left in its TMPDIR. */
interface DiffRun {
  status: number | null;
  stdout: string;
  stderr: string;
  leftovers: string[];
}

/** `keylang diff` in `cwd` with its own TMPDIR, so the test sees every temporary directory it leaves behind. */
function diff(t: { after: (f: () => void) => void }, cwd: string, args: string[]): DiffRun {
  const tmp = mkdtempSync(join(tmpdir(), "keylang-diff-tmp-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const run = spawnSync(process.execPath, [bin, "diff", ...args], { cwd, encoding: "utf8", env: { ...process.env, TMPDIR: tmp, TMP: tmp, TEMP: tmp }, maxBuffer: 64 * 1024 * 1024 });

  return { status: run.status, stdout: run.stdout, stderr: run.stderr, leftovers: readdirSync(tmp) };
}

function parsed(stdout: string): Diff {
  // SAFETY: `diff --format json` prints a `GraphDiff`; the asserts below check every field they read.
  return JSON.parse(stdout) as Diff;
}

test("diff: from the base of a feature to the working tree — an added, a removed and a changed module, a new edge and a new rule fail (exit 1); .git, the working tree and the fact cache are not written, the temporary tree is gone", (t) => {
  const repo = branchRepo(t);
  // A fact cache to read: `map` writes it (and the map) before the bytes are taken.
  assert.equal(keylang(repo, ["map"]).status, 0);
  const before = treeBytes(repo);
  const fork = spawnSync("git", ["merge-base", "HEAD", "main"], { cwd: repo, encoding: "utf8" }).stdout.trim();
  const run = diff(t, repo, ["--format", "json"]);
  assert.equal(run.status, 1, run.stderr);
  const result = parsed(run.stdout);
  assert.equal(result.base.commit, fork);
  assert.equal(result.base.label, `merge-base ${fork.slice(0, 7)} with main`);
  assert.equal(result.base.subject, "main");
  assert.equal(result.head.ref, "working tree");
  assert.equal(result.level, "module");
  assert.deepEqual(
    result.nodes.map((node) => [node.status, node.id, node.changes]),
    [
      ["added", "app.refund", []],
      ["removed", "domain.old", []],
      ["changed", "domain.order", ["body", "deps"]],
    ],
  );
  assert.deepEqual(result.edges, [{ source: "domain.order", target: "app.pay", kind: "dep", status: "added" }]);
  assert.deepEqual(
    result.findings.map((finding) => [finding.status, finding.verdict, finding.code, finding.area]),
    [["new", "fail", "K102", "domain.order"]],
  );
  assert.deepEqual(result.weakenings, [], "a deny added in the working tree makes the spec stricter, not weaker");
  assert.deepEqual(run.leftovers, [], "the temporary tree is removed");
  assert.deepEqual(treeBytes(repo), before, "nothing written: .git, the working tree and .keylang/cache");
});

test("diff <base>..<head>: two commits; --level fn adds functions and calls; text, md and mermaid show the same change", (t) => {
  const repo = branchRepo(t);
  const fn = diff(t, repo, ["main..feature", "--level", "fn", "--format", "json"]);
  assert.equal(fn.status, 1, fn.stderr);
  const result = parsed(fn.stdout);
  assert.equal(result.head.ref, "feature");
  assert.equal(result.head.commit, spawnSync("git", ["rev-parse", "feature"], { cwd: repo, encoding: "utf8" }).stdout.trim());
  assert.deepEqual(
    result.nodes.map((node) => `${node.status} ${node.kind} ${node.id}`),
    ["added module app.refund", "added fn app.refund.refund", "removed module domain.old", "removed fn domain.old.legacy", "changed module domain.order", "changed fn domain.order.price"],
  );
  assert.ok(result.edges.some((edge) => edge.kind === "call" && edge.source === "domain.order.price" && edge.target === "app.pay.charge" && edge.status === "added"));

  const text = diff(t, repo, ["main..feature"]);
  assert.equal(text.status, 1);
  assert.match(text.stdout, /^keylang diff: main \(\w+\) «main» → feature \(\w+\) «feature» \(level module\)$/m);
  assert.match(text.stdout, /^ {2}\+ app\.refund {2}src\/app\/refund\.ts$/m);
  assert.match(text.stdout, /^ {2}\+ domain\.order → app\.pay \(dep\)$/m);

  const md = diff(t, repo, ["main..feature", "--format", "md"]);
  assert.equal(md.status, 1);
  assert.match(md.stdout, /^## keylang diff$/m);
  assert.match(md.stdout, /^\| ~ \| `domain\.order` \| module \| body, deps \| `src\/domain\/order\.ts` \|$/m);
  assert.match(md.stdout, /^```mermaid\nflowchart LR$/m);

  const mermaid = diff(t, repo, ["main..feature", "--format", "mermaid"]);
  assert.equal(mermaid.status, 1);
  const lines = mermaid.stdout.split("\n");
  assert.equal(lines[0], "flowchart LR");
  // Changed nodes first by ID, then their neighbours; IDs only as escaped labels.
  assert.deepEqual(lines.slice(1, 5), ['  n0["app.refund"]:::added', '  n1["domain.old"]:::removed', '  n2["domain.order"]:::changed', '  n3["app.pay"]:::unchanged']);
  assert.ok(lines.includes("  n2 -->|+| n3"));
  assert.ok(lines.includes("  classDef added fill:#d4f8d4,stroke:#2e7d32,color:#1b1b1b"));
  assert.deepEqual([fn.leftovers, text.leftovers, md.leftovers, mermaid.leftovers], [[], [], [], []]);
});

test("diff feature..main: the edge is removed (dashed −), the rule fail is fixed, exit 0", (t) => {
  const repo = branchRepo(t);
  const run = diff(t, repo, ["feature..main", "--format", "json"]);
  assert.equal(run.status, 0, run.stderr);
  const result = parsed(run.stdout);
  assert.deepEqual(result.edges, [{ source: "domain.order", target: "app.pay", kind: "dep", status: "removed" }]);
  assert.deepEqual(
    result.findings.map((finding) => [finding.status, finding.code]),
    [["fixed", "K102"]],
  );
  const mermaid = diff(t, repo, ["feature..main", "--format", "mermaid"]);
  assert.match(mermaid.stdout, /^ {2}n\d+ -\.->\|−\| n\d+$/m);
});

test("diff: a flow added in the working tree and a deny removed (K108, exit 1)", (t) => {
  const repo = branchRepo(t);
  mkdirSync(join(repo, "keylang/flows"), { recursive: true });
  writeFileSync(join(repo, "keylang/flows/pay.md"), "# flow pay\n\n- trigger app.pay.charge\n  - step domain.order.price\n");
  writeFileSync(join(repo, "keylang/rules.md"), "# rules\n\n");
  const run = diff(t, repo, ["HEAD", "--format", "json"]);
  assert.equal(run.status, 1, run.stderr);
  const result = parsed(run.stdout);
  assert.deepEqual(result.flows, [
    {
      name: "pay",
      status: "added",
      steps: [
        { key: "trigger app.pay.charge", status: "added" },
        { key: "trigger app.pay.charge › step domain.order.price", status: "added" },
      ],
    },
  ]);
  assert.equal(result.weakenings.length, 1);
  assert.match(result.weakenings[0]!.message, /spec weakened: `deny domain app`/);
  assert.ok(result.findings.some((finding) => finding.status === "fixed" && finding.code === "K102"), "no deny, no K102");
});

test("diff: a keylang project in a subdirectory of the repository reads the revision's tree from there", (t) => {
  const repo = tempDir(t, "keylang-diff-sub-");

  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), text);
  };

  write("README.md", "outer\n");
  write("svc/keylang.json", `${JSON.stringify(GIT_LAYERS)}\n`);
  write("svc/src/app/pay.ts", "export function charge(): number {\n  return 1;\n}\n");
  git(repo, ["init", "-q", "-b", "main"]);
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-qm", "one"]);
  write("svc/src/domain/order.ts", "export const price = 2;\n");
  const run = diff(t, join(repo, "svc"), ["HEAD", "--format", "json"]);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(
    parsed(run.stdout).nodes.map((node) => [node.status, node.id, node.file]),
    [["added", "domain.order", "src/domain/order.ts"]],
  );
});

test("diff: before the first commit the base is the empty tree — every module is added", (t) => {
  const repo = tempDir(t, "keylang-diff-unborn-");
  writeFileSync(join(repo, "keylang.json"), `${JSON.stringify(GIT_LAYERS)}\n`);
  mkdirSync(join(repo, "src/app"), { recursive: true });
  writeFileSync(join(repo, "src/app/pay.ts"), "export const a = 1;\n");
  git(repo, ["init", "-q", "-b", "main"]);
  const run = diff(t, repo, ["--format", "json"]);
  assert.equal(run.status, 0, run.stderr);
  const result = parsed(run.stdout);
  assert.equal(result.base.commit, null);
  assert.match(result.base.label, /no commit yet/);
  assert.deepEqual(
    result.nodes.map((node) => [node.status, node.id]),
    [["added", "app.pay"]],
  );
  assert.deepEqual(run.leftovers, []);
});

test("diff: a bad ref, a symmetric range, a bad format or level, or no repository is exit 2 with the reason", (t) => {
  const repo = branchRepo(t);
  const unknown = diff(t, repo, ["no-such-branch"]);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /keylang: diff: `no-such-branch` is not a commit/);
  assert.match(diff(t, repo, ["--", "--output=x"]).stderr, /`--output=x` is not a git ref/, "an option is never passed to git");
  assert.equal(diff(t, repo, ["main...feature"]).status, 2);
  const format = diff(t, repo, ["--format", "xml"]);
  assert.equal(format.status, 2);
  assert.match(format.stderr, /unknown --format `xml`; expected text, md, mermaid, json/);
  assert.match(diff(t, repo, ["--level", "class"]).stderr, /unknown --level `class`; expected module, fn/);
  const plain = tempDir(t, "keylang-diff-plain-");
  writeFileSync(join(plain, "keylang.json"), `${JSON.stringify(GIT_LAYERS)}\n`);
  const none = diff(t, plain, []);
  assert.equal(none.status, 2);
  assert.match(none.stderr, /keylang: diff: git/);
});
