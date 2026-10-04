// `keylang hook install`: the git pre-commit hook that runs `check --changed`.
// The hook file is keylang's as a whole, found by its marker; a hook without
// the marker belongs to someone else and is never rewritten.

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const MARKER = "keylang:pre-commit";

/** What the hook runs: the published CLI of this version, as the harness hooks do. */
export function preCommitCommand(version: string): string {
  return `npx -y keylang@${version} check --changed`;
}

/** The whole hook file. */
export function preCommitText(version: string): string {
  return [
    "#!/bin/sh",
    `# ${MARKER}: written by \`keylang hook install\`; run it again to update, delete this file to remove.`,
    "# A finding that touches a changed file blocks the commit; `git commit --no-verify` skips the hook.",
    `exec ${preCommitCommand(version)}`,
    "",
  ].join("\n");
}

/** `missing`: no file; `foreign`: a hook without keylang's marker; `stale`: keylang's, but other text or not executable. */
export type PreCommitState = "missing" | "foreign" | "stale" | "current";

export function preCommitState(current: string | null, executable: boolean, version: string): PreCommitState {
  if (current === null) return "missing";
  if (!current.includes(MARKER)) return "foreign";
  return current === preCommitText(version) && executable ? "current" : "stale";
}

/**
 * The hooks directory git uses for the repository around `cwd`, absolute:
 * `git rev-parse --git-path hooks` honours `core.hooksPath` and linked
 * worktrees. It is asked from the top level, where a relative
 * `core.hooksPath` is resolved. Throws outside a git work tree.
 */
export function gitHooksDir(cwd: string): string {
  const top = git(cwd, ["rev-parse", "--show-toplevel"]);
  return resolve(top, git(top, ["rev-parse", "--git-path", "hooks"]));
}

function git(cwd: string, args: string[]): string {
  const run = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (run.error) throw new Error(`hook install: cannot run git: ${run.error.message}`);
  if (run.status !== 0) throw new Error(`hook install: not inside a git work tree (git ${args.join(" ")}: ${run.stderr.trim() || `exit ${run.status}`})`);
  return run.stdout.trim();
}
