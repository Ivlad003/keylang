// What git says changed in the working tree since a ref: the inputs of
// `check --changed`, `hook stop` and `code-to-spec --since`, and for
// `feature` its base commit (the merge-base with the main branch unless
// `--since` names one), the feature file there with the files changed
// since. Git runs as an argument array in the given root, never through a
// shell; a ref that looks like an option is refused before git sees it.
// Every failure (no git, not a repository, an unknown ref) is an error naming
// the caller, never an empty change set. With `core.ignorecase=true` (macOS,
// Windows) git keeps the index's spelling of a file renamed by case only;
// the paths here are spelled as the disk spells them, which is how the
// analysis names a module's file.

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { toPosix, type Config } from "./config.ts";
import { deletedDiffPaths, diffHunks, type ChangedLines } from "./draft.ts";
import { HEAD_BASE, type BaseOrigin, type FeatureBase } from "./feature-status.ts";
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
  let deleted = deletedDiffPaths(diff).filter((path) => !ownState(path));
  let paths = new Set<string>([...diffHunks(diff).keys(), ...deleted].filter((path) => !ownState(path)));
  for (const file of untracked(git)) if (!ownState(file)) paths.add(file);
  // Unset, the option is false: `--get` exits 1 and prints nothing.
  if (run(["config", "--type=bool", "--get", "core.ignorecase"]).stdout.trim() === "true") {
    const onDisk = diskCaseResolver(root);
    paths = new Set([...paths].map((path) => onDisk(path) ?? path));
    // A file git calls deleted that the disk has under another case was renamed, not removed.
    deleted = deleted.filter((path) => onDisk(path) === null);
  }
  return { paths, deleted, unborn };
}

/**
 * Paths (POSIX, relative to `root`) as the disk spells them: each segment is
 * matched against its directory's entries, exactly first, then without regard
 * to case (and Unicode normalization, as macOS compares names); null when no
 * file is there. Directories are read once per call.
 */
export function diskCaseResolver(root: string): (path: string) => string | null {
  const listings = new Map<string, readonly string[] | null>();
  const entries = (dir: string): readonly string[] | null => {
    if (!listings.has(dir)) {
      try {
        listings.set(dir, readdirSync(dir));
      } catch {
        listings.set(dir, null);
      }
    }
    return listings.get(dir) ?? null;
  };
  const fold = (name: string): string => name.normalize("NFC").toLowerCase();
  return (path) => {
    const spelled: string[] = [];
    let dir = root;
    for (const part of path.split("/")) {
      const names = entries(dir);
      if (names === null) return null;
      const name = names.includes(part) ? part : names.find((candidate) => fold(candidate) === fold(part));
      if (name === undefined) return null;
      spelled.push(name);
      dir = join(dir, name);
    }
    return spelled.join("/");
  };
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
 * The feature file at its base commit, and the files changed since that
 * commit as `check --changed --since <base>` reads them: a rule fail of this
 * change is one that touches them. The base is `since`, else
 * `featureBaseOrigin`. With a merge-base the file at HEAD is read too: the
 * plan is compared with both. Without an explicit `since`, a failure to read
 * git is an informational state, not an error; with it, the error is thrown.
 */
export function readFeatureBase(root: string, path: string, since: string | undefined, label: string): FeatureBase {
  let origin: BaseOrigin = since === undefined ? HEAD_BASE : { ref: since, source: "since", label: since };
  let text: string | null;
  // Undefined: HEAD is the base, or `since` is; null: HEAD has no such file.
  let headText: string | null | undefined;
  let changed: ChangedFiles;
  try {
    if (since === undefined) origin = featureBaseOrigin(root, label);
    text = gitFileAt(root, origin.ref, path, label);
    if (origin.source === "merge-base") headText = gitFileAt(root, "HEAD", path, label);
    changed = gitChangedFiles(root, origin.ref, label);
  } catch (error) {
    if (since !== undefined) throw error;
    return { ...origin, state: "unavailable", reason: error instanceof Error ? error.message : String(error) };
  }
  const changes = { files: [...changed.paths].sort(compareText), deleted: [...changed.deleted].sort(compareText) };
  const atHead = headText === undefined ? {} : { head: headText === null ? null : parse(path, headText) };
  if (text === null) return { ...origin, state: "absent", changes, ...atHead };
  return { ...origin, state: "compared", doc: parse(path, text), changes, ...atHead };
}

/** Where to look for the main branch after `origin/HEAD`, in order: the ref, and how a sentence names it. */
const MAIN_BRANCHES: readonly (readonly [ref: string, name: string])[] = [
  ["refs/heads/main", "main"],
  ["refs/heads/master", "master"],
  ["refs/remotes/origin/main", "origin/main"],
  ["refs/remotes/origin/master", "origin/master"],
];

/**
 * The base `feature` judges a change against when no `since` is given: the
 * merge-base of HEAD with the main branch, so a fail committed on a feature
 * branch is still the change's own. The main branch is the one
 * `refs/remotes/origin/HEAD` points at, else a local `main`, `master`, else
 * `origin/main`, `origin/master`. HEAD when there is none, when HEAD and it
 * have no merge-base (no commit yet, unrelated histories), or when the
 * merge-base is HEAD itself (on the main branch, or behind it). No git, or no
 * repository, is an error naming the caller.
 */
export function featureBaseOrigin(root: string, label: string): BaseOrigin {
  const { run, git } = gitIn(root, label);
  git(["rev-parse", "--is-inside-work-tree"]);
  const commit = (ref: string): string | null => {
    const out = run(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
    return out.status === 0 ? out.stdout.trim() : null;
  };
  // A dangling `origin/HEAD` (the remote branch was deleted) is passed over like a missing one.
  const remote = run(["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"]);
  const target = remote.status === 0 ? remote.stdout.trim() : "";
  const candidates = target.startsWith("refs/remotes/") ? [[target, target.slice("refs/remotes/".length)] as const, ...MAIN_BRANCHES] : MAIN_BRANCHES;
  const main = candidates.find(([ref]) => commit(ref) !== null);
  if (main === undefined) return HEAD_BASE;
  const [ref, name] = main;
  const found = run(["merge-base", "HEAD", ref]);
  const fork = found.status === 0 ? found.stdout.trim() : "";
  if (fork === "" || fork === commit("HEAD")) return { ...HEAD_BASE, main: name };
  // Git's own abbreviation: unambiguous in this repository, so `--since` takes it back.
  const short = run(["rev-parse", "--short", fork]).stdout.trim() || fork.slice(0, 7);
  return { ref: fork, source: "merge-base", main: name, label: `merge-base ${short} with ${name}` };
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
