// Review 2026-10-05, the config group: snapshot inputs, map order, layer
// globs, agent values, NFC IDs and `assume`. Every case drives the real CLI on
// a temporary repository.

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

function keylang(cwd: string, args: string[], env: NodeJS.ProcessEnv = process.env): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8", env });
  if (r.error) throw r.error;
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function repo(t: TestContext, files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-review-config-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(files)) write(dir, path, text);
  return dir;
}

const json = (value: unknown): string => `${JSON.stringify(value)}\n`;

interface Index {
  snapshotId: string;
  manifest: { grammars: Record<string, string>; config: Record<string, unknown> };
  nodes: Record<string, { kind: string; file: string | null }>;
  edges: { kind: string; source: string; target: string | null; resolution: string }[];
  coverage: { kind: string; file: string; line: number; col: number; text: string; reason: string; source: string | null }[];
}

function index(dir: string): Index {
  return JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as Index;
}

test("the map lists modules in code-unit order, whatever the ICU of the Node build", (t) => {
  // ICU collation puts `a_b` before `a-b` and `alpha` before `Zeta`; code units do the opposite.
  const dir = repo(t, {
    "keylang.json": json({ languages: ["typescript"], layers: { app: ["src/**"] } }),
    "src/alpha.ts": "export function alpha(): void {}\n",
    "src/Zeta.ts": "export function zeta(): void {}\n",
    "src/a_b.ts": "export function underscore(): void {}\n",
    "src/a-b.ts": "export function dash(): void {}\n",
  });
  const run = keylang(dir, ["map"]);
  assert.equal(run.status, 0, run.stderr);
  const modules = readFileSync(join(dir, "keylang/map/app.md"), "utf8")
    .split("\n")
    .flatMap((line) => /^ {2}- module \[([^\]]+)\]/.exec(line)?.slice(1) ?? []);
  assert.deepEqual(modules, ["Zeta", "a-b", "a_b", "alpha"]);
});

test("the snapshot records the real versions of the tree-sitter runtime and grammars", (t) => {
  const dir = repo(t, {
    "keylang.json": json({ languages: ["typescript"], layers: { app: ["src/**"] } }),
    "src/a.ts": "export function a(): void {}\n",
  });
  const run = keylang(dir, ["map"]);
  assert.equal(run.status, 0, run.stderr);
  const grammars = index(dir).manifest.grammars;
  assert.deepEqual(Object.keys(grammars).sort(), ["@vscode/tree-sitter-wasm", "web-tree-sitter"]);
  // `web-tree-sitter` does not export `./package.json`: reading it by name gave "unknown", and an upgrade changed no snapshot id.
  for (const [name, version] of Object.entries(grammars)) assert.match(version, /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/, name);
  const installed = (name: string): string => (JSON.parse(readFileSync(join(root, "node_modules", name, "package.json"), "utf8")) as { version: string }).version;
  assert.equal(grammars["web-tree-sitter"], installed("web-tree-sitter"));
  assert.equal(grammars["@vscode/tree-sitter-wasm"], installed("@vscode/tree-sitter-wasm"));
});
