// Run `keylang map` + `keylang check` on a scratch copy of every benchmark
// repository (the originals are never written to) and print one line each.
// Usage: node bench/run.ts [--work <dir>]   (default: <os tmpdir>/keylang-bench)

import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

// Build output, dependencies, VCS data and an existing spec are not part of the benchmark input.
const SKIPPED = new Set(["node_modules", "target", ".git", "keylang", ".keylang"]);

function parseArgs(argv: string[]): { work: string } {
  let work = join(tmpdir(), "keylang-bench");
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--work" && argv[i + 1]) work = resolve(argv[++i]!);
    else {
      process.stderr.write(`unknown argument: ${argv[i]}\nusage: node bench/run.ts [--work <dir>]\n`);
      process.exit(2);
    }
  }
  return { work };
}

const lastLine = (text: string): string => text.trimEnd().split("\n").at(-1) ?? "";

const { work } = parseArgs(process.argv.slice(2));
const bin = join(import.meta.dirname, "../bin/keylang.js");
const inject = join(import.meta.dirname, "inject.ts");
const repos = join(import.meta.dirname, "repos");
const node = (cwd: string, ...args: string[]) => spawnSync(process.execPath, args, { cwd, encoding: "utf8", maxBuffer: 1 << 28 });

rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
for (const name of readdirSync(repos).sort()) {
  const source = join(repos, name);
  if (!statSync(source).isDirectory()) continue;
  const copy = join(work, name);
  // `dereference` follows the voice-transcriber link to copy the real checkout.
  cpSync(source, copy, { recursive: true, dereference: true, filter: (path) => !SKIPPED.has(basename(path)) || path === source });
  const start = process.hrtime.bigint();
  const map = node(copy, bin, "map");
  const ms = Number((process.hrtime.bigint() - start) / 1_000_000n);
  writeFileSync(join(work, `${name}.log`), map.stderr);
  if (map.status !== 0) {
    console.log(`${name} | — | ${lastLine(map.stderr)}`);
    continue;
  }
  const warnings = map.stderr.split("\n").filter((line) => line.startsWith("warning:")).length;
  const check = node(copy, bin, "check");
  writeFileSync(join(work, `${name}.check`), check.stdout + check.stderr);
  const probes = node(copy, inject, copy);
  writeFileSync(join(work, `${name}.probes`), probes.stdout + probes.stderr);
  console.log(`${name} | ${ms} ms | ${lastLine(map.stderr)} | ${warnings} warning(s) | check: ${lastLine(check.stdout + check.stderr)} | probe: ${lastLine(probes.stdout + probes.stderr)}`);
}
console.log(`logs and maps: ${work}`);
