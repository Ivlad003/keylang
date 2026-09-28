// Proposals (CONTEXT.md): the full proposed text of one hand-written spec or
// source file, kept in `.keylang/proposals/<path>` until a person merges it
// hunk by hunk. `draft`, `code-to-spec` and MCP `apply_diff` propose specs,
// `spec-to-code` proposes code and its tests; only the TUI MERGE (or an
// explicit CLI apply) changes the file itself.

import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { within } from "./analyze.ts";
import { languageOf } from "./languages.ts";
import { parse } from "./parser.ts";
import { WIRE_MARKER } from "./wire-gen.ts";

export const PROPOSALS_DIR = ".keylang/proposals";

/**
 * Why `.keylang/proposals/<path>` may not be merged, or null. A proposal
 * replaces one hand-written spec: a Markdown file under the spec directory,
 * not a generated map file, and not reached through a link that leads out.
 * `specDir` is relative to the root, POSIX; `generated` says whether the
 * analysis knows the path as a generated document.
 */
export function proposalProblem(root: string, specDir: string, path: string, generated: (path: string) => boolean = () => false): string | null {
  if (!path.endsWith(".md")) return "not a Markdown spec";
  if (path.split("/").some((part) => part === ".." || part === "." || part === "")) return "not a plain relative path";
  // The same files `check` reads as specs: none under hidden directories, `node_modules` or `target`.
  if (path.split("/").slice(0, -1).some((part) => part.startsWith(".") || part === "node_modules" || part === "target")) return "in a directory specs are not read from";
  if (specDir === ".." || specDir.startsWith("../")) return "the spec directory is outside the repository";
  if (specDir !== "" && !path.startsWith(`${specDir}/`)) return `outside ${specDir}/: a proposal changes specs only`;
  if (path.startsWith(`${specDir === "" ? "" : `${specDir}/`}map/`)) return "a generated map file: change the code or the rules, then run `keylang map`";
  const abs = resolve(root, path);
  if (existsSync(abs) && parse(path, readFileSync(abs, "utf8")).generated !== null) return "a generated file: it is written by `keylang map` only";
  if (generated(path)) return "a generated file: it is written by `keylang map` only";
  const specRoot = resolve(root, specDir);
  if (!within(realPrefix(abs), existsSync(specRoot) ? realpathSync(specRoot) : specRoot)) return `leads out of ${specDir || "."}/ through a link`;
  return null;
}

/**
 * Why a proposal for the source file `path` may not be merged, or null: a
 * file of a language keylang reads, inside the repository (links included),
 * outside the directories sources are not read from, and not one keylang
 * generates (`keylang wire`).
 */
export function codeProposalProblem(root: string, path: string): string | null {
  if (languageOf(path) === undefined) return "not a source file of a language keylang reads";
  if (path.split("/").some((part) => part === ".." || part === "." || part === "")) return "not a plain relative path";
  if (path.split("/").slice(0, -1).some((part) => part.startsWith(".") || part === "node_modules" || part === "target")) return "in a directory sources are not read from";
  const abs = resolve(root, path);
  if (existsSync(abs) && readFileSync(abs, "utf8").startsWith(WIRE_MARKER)) return "a generated file: it is written by `keylang wire` only";
  if (!within(realPrefix(abs), realpathSync(root))) return "leads out of the repository through a link";
  return null;
}

/** Writes the proposal for `path` (relative, POSIX) and returns its file. */
export function writeProposal(root: string, path: string, text: string): string {
  const abs = join(root, PROPOSALS_DIR, path);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text);
  return abs;
}

/** `abs` with the part that exists resolved through links: where a new file would really land. */
export function realPrefix(abs: string): string {
  let dir = abs;
  const rest: string[] = [];
  while (!existsSync(dir)) {
    const parent = dirname(dir);
    if (parent === dir) return abs;
    rest.unshift(relative(parent, dir));
    dir = parent;
  }
  return join(realpathSync(dir), ...rest);
}

/** `-`/`+` lines between a common prefix and suffix: enough to see what a proposal changes. */
export function lineDiff(before: string, after: string): string {
  const a = before.split("\n");
  const b = after.split("\n");
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  return [`@@ line ${start + 1} @@`, ...a.slice(start, endA).map((l) => `-${l}`), ...b.slice(start, endB).map((l) => `+${l}`)].join("\n");
}
