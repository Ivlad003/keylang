// What git says changed in the working tree since a ref: the inputs of
// `check --changed`, `hook stop` and `code-to-spec --since`, and for
// `feature` the feature file at its base commit with the files changed
// since. Git runs as an argument array in the given root, never through a
// shell; a ref that looks like an option is refused before git sees it.
// Every failure (no git, not a repository, an unknown ref) is an error naming
// the caller, never an empty change set.

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { join, relative } from "node:path";
import { toPosix, type Config } from "./config.ts";
import { deletedDiffPaths, diffHunks, type ChangedLines } from "./draft.ts";
import type { FeatureBase } from "./feature-status.ts";
import { placeFile } from "./graph.ts";
import { parse } from "./parser.ts";
import { compareText } from "./span.ts";

/** Files changed since a ref. Paths are POSIX, relative to the root. */
export interface ChangedFiles {
  /** Changed, added, deleted and untracked files. */
  paths: Set<string>;
  /** Files removed versus the ref. */
  deleted: string[];
  /** `HEAD` before the first commit: the tracked files were compared with the empty tree. */
  unborn: boolean;
}

/** A git runner for `root`; `label` names the caller in its errors (`check --changed`). */
function gitIn(root: string, label: string): { run: (args: string[]) => SpawnSyncReturns<string>; git: (args: string[]) => string } {
  // Paths as they are, not C-quoted octal escapes, whatever the user's `core.quotePath`.
  // stdin is the null device, never a pipe: the Codex sandbox (seccomp) forbids
  // the `shutdown` that closes a piped stdin, so spawnSync failed with EPERM and
  // a git reading stdin waited forever.
  const run = (args: string[]) => spawnSync("git", ["-c", "core.quotePath=false", ...args], { cwd: root, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  const git = (args: string[]): string => {
    const out = run(args);
    if (out.error) throw new Error(gitUnavailable(label, out.error));
    if (out.status !== 0) throw new Error(`${label}: git ${args[0]}: ${out.stderr.trim().split("\n")[0]}`);
    return out.stdout;
  };
  return { run, git };
}

/** Why git did not run; a refusal (EPERM, EACCES) is most likely a sandbox, and says what still works. */
export function gitUnavailable(label: string, error: Error & { code?: string }): string {
  const refused = error.code === "EPERM" || error.code === "EACCES";
  const advice = refused ? "; a sandbox may forbid keylang to run git: run it outside the sandbox, or without the git option (a full `keylang check`)" : "";
  return `${label}: git is not available (${error.message})${advice}`;
}

/** A ref git would read as an option (`--output=…`) is refused: it is never passed on. */
function assertRef(ref: string, label: string): void {
  if (ref.startsWith("-")) throw new Error(`${label}: \`${ref}\` is not a git ref`);
}

// `--relative`: paths from `root` and only files under it, whatever the repository's top level.
// `--no-renames`: a moved file is all new lines (its fns have new IDs); fixed prefixes, whatever `diff.mnemonicPrefix` says.
const diffArgs = (base: string): string[] => ["diff", "--relative", "--no-renames", "--unified=0", "--no-color", "--no-ext-diff", "--src-prefix=a/", "--dst-prefix=b/", base, "--"];

const untracked = (git: (args: string[]) => string): string[] =>
  git(["ls-files", "-z", "--others", "--exclude-standard"])
    .split("\0")
    .filter((file) => file !== "");

/**
 * keylang's own local state under `.keylang/` — the index, the fact cache an
 * analysis saves, proposals, reports — is never a source or a spec, so it is
 * never a change, tracked or not, gitignored or not.
 */
const ownState = (path: string): boolean => path === ".keylang" || path.startsWith(".keylang/");

/** Files changed since `ref` in the working tree, plus files git does not track yet; keylang's own `.keylang/` left out. */
export function gitChangedFiles(root: string, ref: string, label = "check --changed"): ChangedFiles {
  assertRef(ref, label);
  const { run, git } = gitIn(root, label);
  // Before the first commit there is no HEAD and every file is new: compare with the empty tree.
  const unborn = ref === "HEAD" && run(["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]).status !== 0;
  // `--stdin` reads the null device: the empty tree of this repository's hash.
  const base = unborn ? git(["hash-object", "-t", "tree", "--stdin"]).trim() : ref;
  const diff = git(diffArgs(base));
  const deleted = deletedDiffPaths(diff).filter((path) => !ownState(path));
  const paths = new Set<string>([...diffHunks(diff).keys(), ...deleted].filter((path) => !ownState(path)));
  for (const file of untracked(git)) if (!ownState(file)) paths.add(file);
  return { paths, deleted, unborn };
}

/** The lines changed since `ref` in the working tree, and the files git does not track yet (`all`), relative to `root`. */
export function gitChangedLines(root: string, ref: string, label = "code-to-spec --since"): ChangedLines {
  assertRef(ref, label);
  const { git } = gitIn(root, label);
  const changed: Map<string, readonly (readonly [number, number])[] | "all"> = diffHunks(git(diffArgs(ref)));
  for (const file of untracked(git)) changed.set(file, "all");
  return changed;
}

/** Git paths are relative to `root`; check reports spec paths relative to `base`. Both forms match. */
export function changedPathSet(root: string, files: Iterable<string>, base: string): Set<string> {
  const changed = new Set<string>();
  for (const file of files) {
    changed.add(file);
    changed.add(toPosix(relative(base, join(root, file))));
  }
  return changed;
}

/**
 * The text of `path` (POSIX, relative to `root`) at `ref`, or null when the
 * file is not in that commit or `HEAD` has no commit yet. An unknown ref,
 * no git, or no repository is an error naming the caller.
 */
export function gitFileAt(root: string, ref: string, path: string, label: string): string | null {
  assertRef(ref, label);
  const { run, git } = gitIn(root, label);
  git(["rev-parse", "--is-inside-work-tree"]);
  if (run(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]).status !== 0) {
    if (ref === "HEAD") return null;
    throw new Error(`${label}: \`${ref}\` is not a commit`);
  }
  // `./` makes the path relative to `root`, not to the repository's top level.
  const object = `${ref}:./${path}`;
  if (run(["cat-file", "-e", object]).status !== 0) return null;
  return git(["show", object]);
}

/**
 * The feature file at its base commit (`since`, else `HEAD`), and the files
 * changed since that commit as `check --changed` reads them: a rule fail of
 * this change is one that touches them. Without an explicit `since`, a
 * failure to read git is an informational state, not an error; with it, the
 * error is thrown.
 */
export function readFeatureBase(root: string, path: string, since: string | undefined, label: string): FeatureBase {
  const ref = since ?? "HEAD";
  let text: string | null;
  let changed: ChangedFiles;
  try {
    text = gitFileAt(root, ref, path, label);
    changed = gitChangedFiles(root, ref, label);
  } catch (error) {
    if (since !== undefined) throw error;
    return { ref, state: "unavailable", reason: error instanceof Error ? error.message : String(error) };
  }
  const changes = { files: [...changed.paths].sort(compareText), deleted: [...changed.deleted].sort(compareText) };
  if (text === null) return { ref, state: "absent", changes };
  return { ref, state: "compared", doc: parse(path, text), changes };
}

/** Module id a deleted source file had, so a flow step that named it is still "changed". */
export function deletedModuleIds(config: Config, files: readonly string[]): string[] {
  const ids: string[] = [];
  for (const file of files) {
    const placed = placeFile(config, file);
    if (placed === null) continue;
    const id = [placed.layer, ...placed.segments].filter((part) => part !== "").join(".");
    if (id !== "") ids.push(id);
  }
  return ids;
}
