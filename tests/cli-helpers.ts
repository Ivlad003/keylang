// Shared by the cli-*.test.ts files: the repository root and the CLI entry,
// a run of `keylang`, temp repositories (a copy of tests/fixtures/repo, one
// layer `main`, a tree of files) and the bytes of their files, git, and the
// small two-layer repository of the harness and feature tests.

import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const bin = join(root, "bin/keylang.js");

/** Run `keylang` with `cwd` as working directory. */
export function keylang(cwd: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  // `check --format json` on this repository is over the default 1 MiB buffer; a cut output must fail, not parse half.
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw r.error;
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** Copy `tests/fixtures/repo` to a temp dir so `map` can write into it. */
export function repoCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-repo-"));
  cpSync(join(root, "tests/fixtures/repo"), dir, { recursive: true });
  return dir;
}

/** A temp repository with one layer `main` over `src/**`, the given files, and rules. */
export function mainRepo(t: { after: (f: () => void) => void }, files: Record<string, string>, rules: string): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-main-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "keylang.json"), `${JSON.stringify({ languages: ["typescript"], layers: { main: ["src/**"] } }, null, 2)}\n`);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  mkdirSync(join(dir, "keylang"), { recursive: true });
  writeFileSync(join(dir, "keylang/rules.md"), `# rules\n\n${rules}`);
  return dir;
}

export function tempDir(t: { after: (fn: () => void) => void }, prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

export function writeTree(dir: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, dirname(path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
}

/** Relative paths and their bytes, so a command that must not write can be compared. */
export function treeBytes(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (rel: string): void => {
    let names: string[];
    try {
      names = readdirSync(join(dir, rel));
    } catch {
      return;
    }
    for (const name of names) {
      const path = rel === "" ? name : `${rel}/${name}`;
      if (statSync(join(dir, path)).isDirectory()) walk(path);
      else out.set(path, readFileSync(join(dir, path), "utf8"));
    }
  };
  walk("");
  return out;
}

export function git(dir: string, args: string[]): void {
  const r = spawnSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test", ...args], { cwd: dir, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
}

export const LAYERS = { languages: ["typescript"], module: "file", layers: { app: ["src/app/**"], domain: ["src/domain/**"] } };
export const PAY = "export function charge(): number {\n  return 1;\n}\n";
export const ORDER = "export function price(): number {\n  return 2;\n}\n";
