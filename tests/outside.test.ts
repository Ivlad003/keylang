// `outside` in keylang.json: code that is not part of the architecture.
// Every case drives the real CLI on a temporary repository.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");

function write(dir: string, path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

function keylang(cwd: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8" });
  if (r.error) throw r.error;
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function repo(t: TestContext, files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-outside-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(files)) write(dir, path, text);
  return dir;
}

const LAYERS = { a: "src/a/**", b: "src/b/**" };
const config = (extra: Record<string, unknown> = {}): string => `${JSON.stringify({ languages: ["typescript"], layers: LAYERS, ...extra })}\n`;

interface Row {
  criterion: string;
  verdict: string;
  evidence: string;
  file: string;
  line: number;
  col: number;
  code: string | null;
}

function check(dir: string): { status: number | null; stdout: string; results: Row[] } {
  const run = keylang(dir, ["check", "--format", "json"]);
  return { status: run.status, stdout: run.stdout, results: (JSON.parse(run.stdout) as { results: Row[] }).results };
}

const verdictOf = (rows: Row[], criterion: string): string | undefined => rows.find((row) => row.criterion === criterion)?.verdict;

const files = {
  "src/a/x.ts": "export function low(): void {}\n",
  "src/b/y.ts": 'import { low } from "../a/x.ts";\nexport function high(): void {\n  low();\n}\n',
  // A script that uses the architecture: allowed from outside.
  "scripts/run.ts": 'import { high } from "../src/b/y.ts";\nhigh();\n',
  "keylang/rules.md": "# rules\n\n- layers a < b\n- no-cycles\n- deny a b\n",
};

test("a file outside the architecture is no hole, unlike an excluded one", (t) => {
  const dir = repo(t, { ...files, "keylang.json": config({ exclude: ["scripts/**"] }) });
  // `exclude`: the script is an opaque module of `unassigned`, a dependency hole.
  const excluded = check(dir);
  assert.equal(excluded.status, 0, excluded.stdout);
  assert.equal(verdictOf(excluded.results, "layers a < b"), "unverified", excluded.stdout);
  assert.equal(verdictOf(excluded.results, "no-cycles"), "unverified", excluded.stdout);
  assert.equal(keylang(dir, ["check", "--strict"]).status, 1);

  write(dir, "keylang.json", config({ outside: ["scripts/**"] }));
  const outside = check(dir);
  assert.equal(outside.status, 0, outside.stdout);
  for (const criterion of ["layers a < b", "no-cycles", "deny a b"]) assert.equal(verdictOf(outside.results, criterion), "ok", `${criterion}: ${outside.stdout}`);
  assert.equal(keylang(dir, ["check", "--strict"]).status, 0);

  // `outside` wins over `exclude` for a file both name.
  write(dir, "keylang.json", config({ exclude: ["scripts/**"], outside: ["scripts/**"] }));
  assert.equal(keylang(dir, ["check", "--strict"]).status, 0);
});

test("the map and the index list files outside the architecture", (t) => {
  const dir = repo(t, { ...files, "keylang.json": config({ outside: ["scripts/**"] }) });
  const map = keylang(dir, ["map"]);
  assert.equal(map.status, 0, map.stderr);
  const layer = readFileSync(join(dir, "keylang/map/outside.md"), "utf8");
  assert.match(layer, /^- outside$/m);
  assert.match(layer, /- module \[run\]\(\.\.\/\.\.\/scripts\/run\.ts#L1\) <!-- outside -->/);
  const index = JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as {
    manifest: { config: { outside: string[] } };
    nodes: Record<string, { layer: string; members?: string }>;
    coverage: { kind: string; file: string; reason: string; source: string | null }[];
  };
  assert.deepEqual(index.manifest.config.outside, ["scripts/**"]);
  assert.equal(index.nodes["outside.scripts.run"]?.members, "opaque");
  assert.deepEqual(
    index.coverage.filter((item) => item.file === "scripts/run.ts"),
    [{ kind: "outside-file", file: "scripts/run.ts", line: 1, col: 1, endLine: 1, endCol: 1, text: "", reason: "outside the architecture (`outside` in keylang.json)", source: "outside.scripts.run" }],
  );
  assert.equal(keylang(dir, ["map", "--check"]).status, 0);
  // The map is valid spec: `check` reads it without a diagnostic.
  const after = check(dir);
  assert.equal(after.status, 0, after.stdout);
});

test("architecture code that imports a file outside the architecture fails with K107", (t) => {
  const dir = repo(t, {
    ...files,
    "src/b/y.ts": 'import { low } from "../a/x.ts";\nimport { tool } from "../../scripts/tool.ts";\nexport function high(): void {\n  low();\n  tool();\n}\n',
    "scripts/tool.ts": "export function tool(): void {}\n",
    "keylang.json": config({ outside: ["scripts/**"] }),
  });
  const found = check(dir);
  assert.equal(found.status, 1, found.stdout);
  const fails = found.results.filter((row) => row.code === "K107");
  // One finding per dependency, however many edges (import, call) show it.
  assert.equal(fails.length, 1, found.stdout);
  assert.deepEqual([fails[0]!.criterion, fails[0]!.verdict, fails[0]!.file, fails[0]!.line, fails[0]!.col], ["outside", "fail", "src/b/y.ts", 2, 1]);
  assert.match(fails[0]!.evidence, /`b\.y` depends on `outside\.scripts\.tool` \(scripts\/tool\.ts\), which `outside` in keylang\.json puts outside the architecture/);
  const human = keylang(dir, ["check"]);
  assert.equal(human.status, 1);
  assert.match(human.stdout, /src\/b\/y\.ts:2:1: K107 divergence:/);
});

test("outside is validated like the other fields of keylang.json", (t) => {
  const dir = repo(t, { ...files, "keylang.json": config({ outside: "scripts/**" }) });
  const notArray = keylang(dir, ["check"]);
  assert.equal(notArray.status, 2);
  assert.match(notArray.stderr, /keylang\.json: `outside` must be an array of globs, got "scripts\/\*\*"/);

  write(dir, "keylang.json", config({ outside: ["scripts/**", 1] }));
  const notGlob = keylang(dir, ["check"]);
  assert.equal(notGlob.status, 2);
  assert.match(notGlob.stderr, /keylang\.json: `outside` must be an array of globs, got \["scripts\/\*\*",1\]/);

  write(dir, "keylang.json", `${JSON.stringify({ languages: ["typescript"], layers: { ...LAYERS, outside: "scripts/**" } })}\n`);
  const reserved = keylang(dir, ["check"]);
  assert.equal(reserved.status, 2);
  assert.match(reserved.stderr, /keylang\.json: `layers\.outside`: `outside` is reserved/);
});
