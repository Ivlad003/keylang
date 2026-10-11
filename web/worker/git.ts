// Git in the analysis in the browser (.scratch/web-git): isomorphic-git over
// the folder in memory, `.git` included, computing ahead of a request what
// keylang's git questions (src/git-changes.ts) will ask for it — the changes
// since a base, files and specs at that base, the base of a feature, HEAD
// and the branches — so that web/worker/git-changes.ts answers them
// synchronously, as the git CLI does on Node. Content is compared, never
// mode bits: a folder from the browser carries none. A file the tab did not
// read (binary, too large) is still known by its size and modification time.

import { sha1 } from "@noble/hashes/legacy.js";
import * as git from "isomorphic-git";
import type { BaseOrigin } from "../../src/feature-status.ts";
import type { ChangedFiles, GitSummary } from "../../src/git-changes.ts";
import { isJsonObject, isJsonString, parseJson } from "../../src/json.ts";
import { compareText } from "../../src/span.ts";
import type { UnreadFile } from "../src/local-protocol.ts";
import * as memory from "./shims/fs.ts";

/** What one base answers: the changes since it, and the files keylang reads there (keylang.json, the specs). */
export interface PreparedRef {
  /** Null when the ref names no commit; `HEAD` before the first commit is `unborn`, not null. */
  changed: ChangedFiles | null;
  /** Path → text at the ref; null when the file is not there. */
  files: Map<string, string | null>;
  /** Spec directory → its `.md` files at the ref and their text. */
  specs: Map<string, Map<string, string>>;
}

/** Everything prepared for one root: the summary and feature base, computed once, and one entry per base asked so far. */
export interface PreparedGit {
  /** Why there is no git: no `.git`, or one isomorphic-git cannot read. */
  unavailable: string | null;
  summary: GitSummary | null;
  base: BaseOrigin | null;
  refs: Map<string, PreparedRef>;
}

/** Per root: the answers prepared so far; a root is prepared once and then extended ref by ref. */
const prepared = new Map<string, PreparedGit>();

/** Per root: the files of the folder that were not read (binary, too large), by path. */
const unreadOf = new Map<string, Map<string, UnreadFile>>();

/** The files `app.html` left unread: git still sees them, by their size and modification time. */
export function setUnread(root: string, files: readonly UnreadFile[]): void {
  unreadOf.set(root, new Map(files.map((file) => [file.path, file])));
}

/** A blob's git ID: SHA-1 of `blob <size>\0` and the bytes. */
function blobOid(bytes: Uint8Array): string {
  const head = new TextEncoder().encode(`blob ${bytes.length}\0`);
  // Header and content concatenated, exactly the bytes git hashes for a loose blob object.
  const all = new Uint8Array(head.length + bytes.length);
  all.set(head);
  all.set(bytes, head.length);

  return [...sha1(all)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The prepared answers of a root, or null when nothing was prepared for it yet. */
export function preparedFor(root: string): PreparedGit | null {
  return prepared.get(root) ?? null;
}

/**
 * The fs isomorphic-git reads through: the worker's, read-only. The working
 * tree is never walked by isomorphic-git (see `changed`), so it has no reason
 * to rewrite `.git/index`, and every write fails as keylang's own do.
 */
function fsFor() {
  // isomorphic-git expects uid and gid on stats; the in-memory fs has no owners, so both are 0.
  const withIds = <T extends object>(stats: T): T & { uid: number; gid: number } => Object.assign(stats, { uid: 0, gid: 0 });

  return {
    promises: {
      readFile: async (path: string, options?: memory.ReadOptions) => memory.readFileSync(path, options),
      readdir: async (path: string) => memory.readdirSync(path),
      stat: async (path: string) => withIds(memory.statSync(path)!),
      lstat: async (path: string) => withIds(memory.lstatSync(path)!),
      readlink: async (path: string) => memory.readlinkSync(path),
      writeFile: async (path: string) => memory.writeFileSync(path),
      mkdir: async (path: string) => memory.mkdirSync(path),
      rmdir: async (path: string) => memory.rmdirSync(path),
      unlink: async (path: string) => memory.unlinkSync(path),
      symlink: async (path: string) => memory.writeFileSync(path),
      chmod: async (path: string) => memory.chmodSync(path),
    },
  };
}

/** keylang's own state is never a change (src/git-changes.ts, `ownState`). */
const ownState = (path: string): boolean => path === ".keylang" || path.startsWith(".keylang/");

/** Git's own heuristic: a NUL byte within the first 8000 bytes makes a file binary. */
const isBinary = (bytes: Uint8Array): boolean => bytes.subarray(0, 8000).includes(0);

const decoder = new TextDecoder();

/** isomorphic-git types a config value and a merge base as `any`: a string is what keylang asks for. */
function isGitText(value: unknown): value is string {
  return typeof value === "string";
}

/** The branches tried as the main line, in git-changes.ts's order, as full ref and display name. */
const MAIN_BRANCHES: readonly (readonly [string, string])[] = [
  ["refs/heads/main", "main"],
  ["refs/heads/master", "master"],
  ["refs/remotes/origin/main", "origin/main"],
  ["refs/remotes/origin/master", "origin/master"],
];

/** Reads one root's repository with isomorphic-git, sharing one object cache across all its questions. */
class Reader {
  private readonly root: string;
  private readonly fs: ReturnType<typeof fsFor>;
  // One cache for every call: parsed packfiles and trees are reused (without it, reading 860 files takes 81 s, not 2).
  private readonly cache = {};

  constructor(root: string) {
    this.root = root;
    this.fs = fsFor();
  }

  private get base() {
    return { fs: this.fs, dir: this.root, cache: this.cache };
  }

  /**
   * The commit a ref names (`^{commit}`: an annotated tag is peeled), or null. Ancestry suffixes are
   * followed as git does (`HEAD~2`, `main^2`, `v1^^`): isomorphic-git resolves names, not revisions.
   */
  async commit(ref: string): Promise<string | null> {
    if (ref.startsWith("-")) return null;

    // Split the ref into a name and its trailing ancestry suffix (any run of `~N` / `^N`).
    // `^{commit}` and `^{}` peel to the commit, which this does anyway.
    const [, name = "", suffix = ""] = /^(.*?)((?:[~^]\d*)*)$/.exec(ref.replace(/\^\{(commit)?\}$/, "")) ?? [];

    if (name === "") return null;

    try {
      // A hex string of 4–40 characters is an abbreviated or full object ID; anything else is a ref name.
      const oid = /^[0-9a-f]{4,40}$/.test(name) ? await git.expandOid({ ...this.base, oid: name }) : await git.resolveRef({ ...this.base, ref: name });
      const object = await git.readObject({ ...this.base, oid });
      let commit = object.format === "parsed" && object.type === "tag" ? object.object.object : object.type === "commit" ? oid : null;

      // Walk the suffix left to right: `~N` follows first parents N times, `^N` takes the N-th parent (`^0` is the commit itself).
      for (const [, op, digits] of suffix.matchAll(/([~^])(\d*)/g)) {
        if (commit === null) return null;
        const n = digits === "" ? 1 : Number(digits);

        if (op === "~") {
          for (let i = 0; i < n && commit !== null; i++) commit = (await git.readCommit({ ...this.base, oid: commit })).commit.parent[0] ?? null;
        } else if (n > 0) commit = (await git.readCommit({ ...this.base, oid: commit })).commit.parent[n - 1] ?? null;
      }

      return commit;
    } catch {
      // An unknown name, a missing object or a parent past the root: no commit, as `rev-parse --verify` fails.
      return null;
    }
  }

  /** As `gitSummary` of src/git-changes.ts: HEAD's commit and branch, the origin URL, and every branch, local then remote. */
  async summary(): Promise<GitSummary> {
    const commit = await this.commit("HEAD");
    let branch: string | null = null;

    // Resolving HEAD one level deep gives the branch ref it points at; a detached HEAD gives an object ID, so no branch.
    try {
      const target = await git.resolveRef({ ...this.base, ref: "HEAD", depth: 2 });
      branch = target.startsWith("refs/heads/") ? target.slice("refs/heads/".length) : null;
    } catch {
      branch = null;
    }

    const configured = await git.getConfig({ fs: this.fs, dir: this.root, path: "remote.origin.url" });
    const origin = isGitText(configured) ? configured : null;
    // Branches are sorted so the summary is stable whatever order the refs are stored in; a remote's HEAD alias is not a branch.
    const local = (await git.listBranches({ ...this.base })).sort(compareText);
    const remotes = (await git.listRemotes({ fs: this.fs, dir: this.root })).map((remote) => remote.remote).sort(compareText);
    const remote: string[] = [];

    for (const name of remotes) for (const branchName of (await git.listBranches({ ...this.base, remote: name })).filter((b) => b !== "HEAD").sort(compareText)) remote.push(`${name}/${branchName}`);

    return { commit, branch, origin: origin === "" ? null : origin, branches: [...local, ...remote] };
  }

  /** As `featureBaseOrigin` of src/git-changes.ts. */
  async featureBase(): Promise<BaseOrigin> {
    const headBase: BaseOrigin = { ref: "HEAD", source: "HEAD", label: "HEAD" };
    let target = "";

    // origin/HEAD, when the clone recorded it, names the remote's default branch and is tried first.
    try {
      target = await git.resolveRef({ ...this.base, ref: "refs/remotes/origin/HEAD", depth: 2 });
    } catch {
      target = "";
    }

    const candidates = target.startsWith("refs/remotes/") ? [[target, target.slice("refs/remotes/".length)] as const, ...MAIN_BRANCHES] : MAIN_BRANCHES;
    let main: readonly [string, string] | undefined;

    // The first candidate that resolves to a commit is the main line.
    for (const candidate of candidates) {
      if ((await this.commit(candidate[0])) !== null) {
        main = candidate;
        break;
      }
    }

    // Without a main line, or on it (merge base is HEAD itself), the feature's base is HEAD.
    if (main === undefined) return headBase;

    const head = await this.commit("HEAD");
    const tip = await this.commit(main[0]);

    if (head === null || tip === null) return { ...headBase, main: main[1] };
    const [fork] = await git.findMergeBase({ ...this.base, oids: [head, tip] });

    if (!isGitText(fork) || fork === "" || fork === head) return { ...headBase, main: main[1] };

    // Git's abbreviation is the shortest unambiguous one, seven characters at least; a repository the browser holds rarely needs more.
    return { ref: fork, source: "merge-base", main: main[1], label: `merge-base ${fork.slice(0, 7)} with ${main[1]}` };
  }

  /**
   * As `gitChangedFiles` of src/git-changes.ts: the files `diff --unified=0 <base>` names (a binary
   * or emptied file has no hunk), the deleted, the untracked. The base and the index come from the
   * objects; a working file is the index's when its size and modification time are the index
   * entry's — git's own stat check (`core.checkStat=minimal`) — else its content is hashed. The
   * working tree is never walked by isomorphic-git, which would hash every file (no stat of the
   * browser matches its index) and rewrite `.git/index`.
   */
  async changed(ref: string): Promise<ChangedFiles | null> {
    const unborn = ref === "HEAD" && (await this.commit("HEAD")) === null;
    const base = unborn ? null : await this.commit(ref);

    if (!unborn && base === null) return null;

    // Pass 1: walk the base tree and the index together, recording per path its blob in each and the index's stat.
    const tracked = new Map<string, { base: string | null; stage: string | null; size: number | null; mtime: number | null }>();
    await git.walk({
      ...this.base,
      trees: [...(base ? [git.TREE({ ref: base })] : []), git.STAGE()],
      map: async (path, entries) => {
        if (path === ".") return true;

        // With no base tree (unborn HEAD) the walk has only the index, so the base slot is filled with null.
        const [baseEntry, stage] = base ? entries : [null, ...entries];
        const types = await Promise.all([baseEntry?.type(), stage?.type()]);

        // Descend into directories; only files are recorded.
        if (types.some((type) => type === "tree")) return true;
        const stat = stage ? await stage.stat() : null;
        tracked.set(path, {
          base: baseEntry && types[0] === "blob" ? await baseEntry.oid() : null,
          stage: stage ? await stage.oid() : null,
          size: stat ? stat.size : null,
          mtime: stat ? stat.mtimeSeconds * 1000 + Math.floor(stat.mtimeNanoseconds / 1e6) : null,
        });

        return null;
      },
    });
    // Pass 2: compare each tracked file's working copy (read or unread) with the base.
    const unread = unreadOf.get(this.root) ?? new Map<string, UnreadFile>();
    // Racy git: a file modified no earlier than the index was written may differ at the same size and time.
    const indexTime = memory.existsSync(`${this.root}/.git/index`) ? memory.statSync(`${this.root}/.git/index`)!.mtimeMs : 0;
    const paths = new Set<string>();
    const deleted: string[] = [];

    for (const [path, entry] of tracked) {
      if (ownState(path)) continue;
      const abs = `${this.root}/${path}`;
      const work = memory.existsSync(abs) && memory.statSync(abs)!.isFile() ? memory.statSync(abs)! : null;
      const skipped = unread.get(path) ?? null;

      if (work === null && skipped === null) {
        // Gone from the working tree; a file only staged and then removed is no change against the base.
        if (entry.base !== null) {
          deleted.push(path);
          paths.add(path);
        }

        continue;
      }

      // In the base, out of the index, still on disk (`git rm --cached`): `diff <base>` calls it deleted, `ls-files --others` lists it.
      if (entry.stage === null) {
        if (entry.base !== null) {
          deleted.push(path);
          paths.add(path);
        }

        continue;
      }

      // Git's stat check: same size and mtime as the index entry, and not racy, means the working file is the indexed blob.
      const size = work ? work.size : skipped!.size;
      const mtime = work ? work.mtimeMs : skipped!.mtime;
      const asIndexed = entry.stage !== null && entry.size === size && entry.mtime === Math.floor(mtime) && Math.floor(mtime) < indexTime;

      if (skipped !== null) {
        // Not read: unchanged when the stat check says so, else changed; a binary one has no hunk.
        if ((asIndexed ? entry.stage : "changed") !== entry.base && !skipped.binary) paths.add(path);
        continue;
      }

      // Read files: hash only when the stat check fails, then drop what `diff -U0` would show no hunk for (empty or binary on either side).
      const bytes = memory.readFileSync(abs);
      const oid = asIndexed ? entry.stage : blobOid(bytes);

      if (oid === entry.base) continue;

      if (bytes.length === 0 || isBinary(bytes)) continue;

      if (entry.base !== null && isBinary(await this.blob(entry.base))) continue;
      paths.add(path);
    }

    // `ls-files --others --exclude-standard`: in the folder, not in the index, not ignored.
    const candidates = [...memory.readdirSync(this.root, { recursive: true }).filter((path) => !path.startsWith(".git/") && path !== ".git" && memory.statSync(`${this.root}/${path}`)!.isFile()), ...unread.keys()];

    for (const path of candidates) {
      if (ownState(path) || tracked.get(path)?.stage) continue;

      if (await git.isIgnored({ fs: this.fs, dir: this.root, filepath: path })) continue;
      paths.add(path);
    }

    return { paths, deleted: deleted.sort(compareText), unborn };
  }

  private async blob(oid: string): Promise<Uint8Array> {
    return (await git.readBlob({ ...this.base, oid })).blob;
  }

  /** The text of `path` in commit `oid`, or null when the commit has no such file. */
  async file(oid: string, path: string): Promise<string | null> {
    try {
      return decoder.decode((await git.readBlob({ ...this.base, oid, filepath: path })).blob);
    } catch {
      return null;
    }
  }

  /** The `.md` files under `dir` in commit `oid` with their text, in path order; `""` or `.` means the whole tree. */
  async specs(oid: string, dir: string): Promise<Map<string, string>> {
    const files = new Map<string, string>();
    const listed = (await git.listFiles({ ...this.base, ref: oid })).filter((path) => (dir === "" || dir === "." || path.startsWith(`${dir}/`)) && path.endsWith(".md")).sort(compareText);

    for (const path of listed) files.set(path, (await this.file(oid, path)) ?? "");

    return files;
  }
}

/** The spec directory a keylang.json names (its `dir`), else the default. */
function specDirOf(config: string | null, fallback: string): string {
  if (config === null) return fallback;

  try {
    const parsed = parseJson(config);

    // `null` has no `dir` to read: as unreadable as malformed JSON.
    if (parsed === null) return fallback;
    const dir = isJsonObject(parsed) ? parsed.dir : undefined;

    return isJsonString(dir) && dir !== "" ? dir.replace(/\/+$/, "") : "keylang";
  } catch {
    return fallback;
  }
}

/**
 * Computes what a request of the «Зміни» tab will ask git: the summary and the base of a feature
 * once, then for the base `since` (null: the base of a feature) the changes and keylang.json and the
 * specs there. `specDir` is the spec directory of the working tree's keylang.json.
 */
export async function prepareGit(root: string, since: string | null, specDir: string): Promise<void> {
  let state = prepared.get(root);

  // First request for this root: compute the summary and feature base once, or record why git is unavailable.
  if (!state) {
    if (!memory.existsSync(`${root}/.git/HEAD`)) {
      prepared.set(root, { unavailable: "not a git repository (the folder was opened without its .git, or it has none)", summary: null, base: null, refs: new Map() });

      return;
    }

    const reader = new Reader(root);

    try {
      state = { unavailable: null, summary: await reader.summary(), base: await reader.featureBase(), refs: new Map() };
    } catch (error) {
      state = { unavailable: `git cannot be read in the browser: ${error instanceof Error ? error.message : String(error)}`, summary: null, base: null, refs: new Map() };
    }

    prepared.set(root, state);
    readers.set(root, reader);
  }

  if (state.unavailable !== null || state.base === null) return;

  // Each base is prepared once; an empty `since` means the feature's base, as on the CLI.
  const ref = since === null || since === "" ? state.base.ref : since;

  if (state.refs.has(ref)) return;
  const reader = readers.get(root)!;
  const changed = await reader.changed(ref);
  const oid = await reader.commit(ref);
  const files = new Map<string, string | null>();
  const specs = new Map<string, Map<string, string>>();

  // The spec directory may differ at the base: read both the base's own and the working tree's, deduplicated.
  if (oid !== null) {
    const config = await reader.file(oid, "keylang.json");
    files.set("keylang.json", config);

    for (const dir of new Set([specDirOf(config, specDir), specDir])) specs.set(dir, await reader.specs(oid, dir));
  }

  state.refs.set(ref, { changed, files, specs });
}

/** Per root: the reader whose object cache later bases reuse. */
const readers = new Map<string, Reader>();
