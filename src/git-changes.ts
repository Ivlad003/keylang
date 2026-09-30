// What git says changed in the working tree since a ref: the inputs of
// `check --changed`, `hook stop` and `code-to-spec --since`. Git runs as an
// argument array in the given root, never through a shell; a ref that looks
// like an option is refused before git sees it. Every failure (no git, not a
// repository, an unknown ref) is an error naming the caller, never an empty
// change set.

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { join, relative } from "node:path";
import { toPosix, type Config } from "./config.ts";
import { deletedDiffPaths, diffHunks, type ChangedLines } from "./draft.ts";
import { placeFile } from "./graph.ts";

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
function gitIn(root: string, label: string): { run: (args: string[], input?: string) => SpawnSyncReturns<string>; git: (args: string[], input?: string) => string } {
  // Paths as they are, not C-quoted octal escapes, whatever the user's `core.quotePath`.
  const run = (args: string[], input?: string) => spawnSync("git", ["-c", "core.quotePath=false", ...args], { cwd: root, input, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  const git = (args: string[], input?: string): string => {
    const out = run(args, input);
    if (out.error) throw new Error(`${label}: git is not available (${out.error.message})`);
    if (out.status !== 0) throw new Error(`${label}: git ${args[0]}: ${out.stderr.trim().split("\n")[0]}`);
    return out.stdout;
  };
  return { run, git };
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

/** Files changed since `ref` in the working tree, plus files git does not track yet. */
export function gitChangedFiles(root: string, ref: string, label = "check --changed"): ChangedFiles {
  assertRef(ref, label);
  const { run, git } = gitIn(root, label);
  // Before the first commit there is no HEAD and every file is new: compare with the empty tree.
  const unborn = ref === "HEAD" && run(["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]).status !== 0;
  const base = unborn ? git(["hash-object", "-t", "tree", "--stdin"], "").trim() : ref;
  const diff = git(diffArgs(base));
  const deleted = deletedDiffPaths(diff);
  const paths = new Set<string>([...diffHunks(diff).keys(), ...deleted]);
  for (const file of untracked(git)) paths.add(file);
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
