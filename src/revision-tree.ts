// A revision of the repository as an analysis (`keylang diff`, `GET
// /api/graph-diff`): the tree of a commit is written into a temporary
// directory from `git ls-tree -r -z -l` and `git cat-file --batch` — no
// `worktree add`, so `.git` is never written, and no `tar` — analysed there
// read-only, and the directory is removed whatever happens. The analysis
// reads the repository's fact cache (`factCacheRoot`), so files the revision
// shares with the working tree are not parsed again, and writes none.
// `node_modules` of the root is linked in, so packages resolve as they do in
// the working tree.
//
// Sits at the I/O edge beside git-changes.ts: it feeds `analyze` a directory
// and hands the analysis to the pure diff (graph-diff.ts). Entry points:
// `resolveRevision`, `analyzeRevision`, `WORKING_TREE`.

import { spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { analyze, type Analysis } from "./analyze.ts";
import { assertRef, gitIn, gitUnavailable } from "./git-changes.ts";

/** One side of a diff: a commit, or the working tree (`commit` null, `ref` `WORKING_TREE`). */
export interface Revision {
  /** The ref as the caller named it (`main`, `HEAD~2`, a merge-base id), or `WORKING_TREE`. */
  ref: string;
  /** The full commit id; null for the working tree and for an unborn HEAD (no commit yet: an empty tree). */
  commit: string | null;
  /** Git's abbreviation of the commit (of HEAD for the working tree); null without a commit. */
  short: string | null;
  /** The first line of the commit message; null without a commit. */
  subject: string | null;
  /** In a sentence: `main (1a2b3c4)`, `merge-base 1a2b3c4 with main`, `working tree`. */
  label: string;
}

/** How the working tree is named as a side of a diff. */
export const WORKING_TREE = "working tree";

/** Bytes of blobs one `cat-file --batch` call reads at most, so a large tree is not held in memory at once. */
const BATCH_BYTES = 64 * 1024 * 1024;

/**
 * The commit `ref` names, its abbreviation and subject. `HEAD` before the
 * first commit is the empty tree (commit null); any other ref that is not a
 * commit, no git, or no repository is an error naming `label`.
 */
export function resolveRevision(root: string, ref: string, label: string, sentence: string = ref): Revision {
  assertRef(ref, label);
  const { run, git } = gitIn(root, label);
  git(["rev-parse", "--is-inside-work-tree"]);
  const found = run(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);

  // An unborn HEAD has no files: the diff starts from nothing.
  if (found.status !== 0) {
    if (ref === "HEAD") return { ref, commit: null, short: null, subject: null, label: `${sentence} (no commit yet)` };
    throw new Error(`${label}: \`${ref}\` is not a commit`);
  }

  const commit = found.stdout.trim();
  const short = git(["rev-parse", "--short", commit]).trim();
  const subject = git(["log", "-1", "--format=%s", commit]).trim();

  return { ref, commit, short, subject, label: sentence.includes(short) ? sentence : `${sentence} (${short})` };
}

/** The working tree as a side of a diff, with HEAD's abbreviation when there is a commit. */
export function workingTree(root: string, label: string): Revision {
  const { run } = gitIn(root, label);
  const head = run(["rev-parse", "--verify", "--quiet", "--short", "HEAD^{commit}"]);
  const short = head.status === 0 ? head.stdout.trim() : null;

  return { ref: WORKING_TREE, commit: null, short, subject: null, label: WORKING_TREE };
}

/** What `ls-tree -r -l` lists: the mode, type, object id and size of a path. */
interface TreeEntry {
  mode: string;
  type: string;
  oid: string;
  size: number;
  path: string;
}

/** The entries of the tree of `commit` under `root` (paths relative to it, as git prints them from there). */
function treeEntries(root: string, commit: string, label: string): TreeEntry[] {
  const { git } = gitIn(root, label);
  const entries: TreeEntry[] = [];

  // `<mode> SP <type> SP <oid> SP <size>\t<path>`, NUL-terminated; the size is `-` for a submodule.
  for (const record of git(["ls-tree", "-r", "-z", "-l", commit]).split("\0")) {
    if (record === "") continue;
    const tab = record.indexOf("\t");
    const [mode = "", type = "", oid = "", size = "-"] = record.slice(0, tab).split(/ +/);
    entries.push({ mode, type, oid, size: size === "-" ? 0 : Number(size), path: record.slice(tab + 1) });
  }

  return entries;
}

/**
 * The blobs of `entries` by object id, read with `cat-file --batch` in chunks
 * of about `BATCH_BYTES`. Stdin is a file, never a pipe: a sandbox that
 * forbids closing a piped stdin (git-changes.ts, `gitIn`) still runs it.
 */
function readBlobs(root: string, entries: readonly TreeEntry[], scratch: string, label: string, write: (entry: TreeEntry, bytes: Buffer) => void): void {
  let start = 0;

  while (start < entries.length) {
    // One chunk: entries until their sizes pass the budget (at least one).
    let end = start;
    let bytes = 0;

    while (end < entries.length && (end === start || bytes + entries[end]!.size <= BATCH_BYTES)) bytes += entries[end++]!.size;
    const chunk = entries.slice(start, end);
    const list = join(scratch, "objects");
    writeFileSync(list, chunk.map((entry) => `${entry.oid}\n`).join(""));
    const input = openSync(list, "r");
    let out;

    try {
      out = spawnSync("git", ["cat-file", "--batch"], { cwd: root, stdio: [input, "pipe", "pipe"], maxBuffer: bytes + chunk.length * 128 + 1024 * 1024 });
    } finally {
      closeSync(input);
    }

    if (out.error) throw new Error(gitUnavailable(label, out.error));

    if (out.status !== 0) throw new Error(`${label}: git cat-file: ${out.stderr.toString("utf8").trim().split("\n")[0]}`);
    const data = out.stdout;
    let at = 0;

    // Each answer: `<oid> <type> <size>\n<bytes>\n`, in the order asked.
    for (const entry of chunk) {
      const eol = data.indexOf(0x0a, at);
      const header = data.subarray(at, eol).toString("utf8").split(" ");

      if (header[1] === "missing" || header.length < 3) throw new Error(`${label}: git cat-file: object ${entry.oid} of ${entry.path} is missing`);
      const size = Number(header[2]);
      write(entry, data.subarray(eol + 1, eol + 1 + size));
      at = eol + 1 + size + 1;
    }

    start = end;
  }
}

/** Writes the tree of `commit` (paths relative to `root`) into `dir`; a submodule is an empty directory, a link a link. */
function writeTree(root: string, commit: string, dir: string, scratch: string, label: string): void {
  const entries = treeEntries(root, commit, label);
  const inside = resolve(dir) + sep;

  // A path git lists never leaves the tree; one that would (a crafted object) is refused, not written.
  const target = (path: string): string => {
    const abs = resolve(dir, path);

    if (!abs.startsWith(inside)) throw new Error(`${label}: \`${path}\` of the tree lies outside it`);

    return abs;
  };

  for (const entry of entries) if (entry.type === "commit") mkdirSync(target(entry.path), { recursive: true });

  readBlobs(
    root,
    entries.filter((entry) => entry.type === "blob"),
    scratch,
    label,
    (entry, bytes) => {
      const abs = target(entry.path);
      mkdirSync(dirname(abs), { recursive: true });

      // A symbolic link holds its target as the blob; a file system that refuses links leaves it out.
      if (entry.mode === "120000") {
        try {
          symlinkSync(bytes.toString("utf8"), abs);
        } catch {
          // No link: the analysis reads the revision without it.
        }

        return;
      }

      writeFileSync(abs, bytes);
    },
  );
}

/**
 * The analysis of `revision` (a commit, or the empty tree of an unborn HEAD):
 * its tree in a temporary directory, analysed without evidence or migration,
 * with the repository's fact cache read and none written. The directory is
 * removed when the analysis ends or fails.
 */
export async function analyzeRevision(root: string, revision: Revision, label: string): Promise<Analysis> {
  const scratch = mkdtempSync(join(tmpdir(), "keylang-rev-"));

  try {
    const dir = join(scratch, "tree");
    mkdirSync(dir);

    if (revision.commit !== null) writeTree(root, revision.commit, dir, scratch, label);
    const modules = join(root, "node_modules");

    // Packages resolve as in the working tree: its node_modules, linked (a junction on Windows).
    if (existsSync(modules) && !existsSync(join(dir, "node_modules"))) {
      try {
        symlinkSync(modules, join(dir, "node_modules"), "junction");
      } catch {
        // Without the link only declared packages are told apart less well.
      }
    }

    return await analyze({ root: dir, withoutEvidence: true, withoutMigration: true, factCacheRoot: root });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
