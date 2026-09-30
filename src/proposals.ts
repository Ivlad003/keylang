// Proposals (CONTEXT.md): the full proposed text of one hand-written spec or
// source file, kept in `.keylang/proposals/<path>` until a person merges it
// hunk by hunk. `draft`, `code-to-spec` and MCP `apply_diff` propose specs,
// `spec-to-code` proposes code and its tests; only the TUI MERGE (or an
// explicit CLI apply) changes the file itself.

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { within } from "./analyze.ts";
import { languageOf } from "./languages.ts";
import { parse } from "./parser.ts";
import { landing, safeWrite, writeProblem } from "./safe-write.ts";
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
  if (generated(path)) return "a generated file: it is written by `keylang map` only";
  // Links first: nothing outside the spec directory is read, not even to see whether it is generated.
  const abs = resolve(root, path);
  const specRoot = resolve(root, specDir);
  const lands = landing(abs);
  if (lands === null || !within(lands, existsSync(specRoot) ? realpathSync(specRoot) : specRoot)) return `leads out of ${specDir || "."}/ through a link`;
  if (existsSync(lands) && parse(path, readFileSync(lands, "utf8")).generated !== null) return "a generated file: it is written by `keylang map` only";
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
  // Links first (one whose target does not exist yet too): nothing outside the repository is read.
  const lands = landing(resolve(root, path));
  if (lands === null || !within(lands, realpathSync(root))) return "leads out of the repository through a link";
  if (existsSync(lands) && readFileSync(lands, "utf8").startsWith(WIRE_MARKER)) return "a generated file: it is written by `keylang wire` only";
  return null;
}

/**
 * What a proposal was built from: the target on disk and the proposal already
 * waiting for it (null: no file). A write that carries it lands only while
 * both are still so.
 */
export interface ProposalBasis {
  target: string | null;
  proposal: string | null;
}

/**
 * Why the proposal of `path` built from `basis` may not be written now, or
 * null: the target or the waiting proposal changed, appeared or went away
 * since, or the store breaks the write policy. Each reason names its file.
 */
export function proposalWriteProblem(root: string, path: string, basis: ProposalBasis): string | null {
  const abs = resolve(root, path);
  const target = existsSync(abs) ? readFileSync(abs, "utf8") : null;
  if (target !== basis.target) return `${path}: ${basis.target === null ? "created" : target === null ? "removed" : "changed"} on disk while the proposal was prepared; nothing written`;
  const problem = writeProblem(root, `${PROPOSALS_DIR}/${path}`, { under: PROPOSALS_DIR, generated: true, expect: basis.proposal });
  if (problem === null) return null;
  return `${PROPOSALS_DIR}/${path}: ${problem.replace("while the change was prepared", "while the proposal was prepared")}`;
}

/**
 * Writes the proposal for `path` (relative, POSIX) atomically and returns its
 * file; `.keylang/proposals/` is keylang's own store, so a link there that
 * leads elsewhere is refused like any other. With `basis` nothing is written
 * unless the target and the waiting proposal are still what it says: a
 * proposal that appeared or changed meanwhile is never overwritten.
 */
export function writeProposal(root: string, path: string, text: string, basis?: ProposalBasis): string {
  if (basis !== undefined) {
    const problem = proposalWriteProblem(root, path, basis);
    if (problem !== null) throw new Error(problem);
  }
  return safeWrite(root, `${PROPOSALS_DIR}/${path}`, text, { under: PROPOSALS_DIR, generated: true, ...(basis !== undefined ? { expect: basis.proposal } : {}) });
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
