// Prototype for research.md §7: what keylang asks git (src/git-changes.ts)
// answered by isomorphic-git over the worker's read-only fs in memory
// (web/worker/shims/fs.ts) — the repository copied in with its .git, as a
// folder dropped into app.html would be — and compared with keylang's own
// functions, which run the git CLI on the same repository on disk.
//
// usage: npm install isomorphic-git@1.43.2 in a scratch directory, then
//   node .scratch/web-git/prototype-isomorphic-git.ts <that dir>/node_modules/isomorphic-git/index.js <repo>[,<repo>…] [<that dir>/node_modules/diff/libesm/index.js]
// The last argument switches the line diff from keylang's LCS to jsdiff's Myers (npm install diff@8); NO_CACHE=1 turns the shared cache off.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { featureBaseOrigin, gitChangedFiles, gitChangedLines, gitFileAt, gitSpecFilesAt } from "../../src/git-changes.ts";
import { diffLines } from "../../src/line-diff.ts";
import { compareText } from "../../src/span.ts";
import * as memory from "../../web/worker/shims/fs.ts";

const [libPath, reposArg] = process.argv.slice(2);
if (!libPath || !reposArg) throw new Error("usage: prototype-isomorphic-git.ts <isomorphic-git/index.js> <repo>[,<repo>…]");
const git = (await import(libPath)) as typeof import("isomorphic-git");
// One cache for every call: parsed packfiles and trees are reused (isomorphic-git's `cache` option).
const cache = process.env["NO_CACHE"] ? undefined : {};
// The line diff: keylang's LCS (src/line-diff.ts) or jsdiff's Myers, as git's default is.
const jsdiff = process.argv[4] ? ((await import(process.argv[4])) as { diffArrays: (a: string[], b: string[]) => { added?: boolean; removed?: boolean; count?: number; value: string[] }[] }) : null;

// --- the fs isomorphic-git is given: the worker's, read-only, behind `promises` ---------------------
const writes: string[] = [];
const enoent = (error: unknown): never => {
  throw error;
};
const fs = {
  promises: {
    readFile: async (path: string, options?: unknown) => memory.readFileSync(path, options),
    readdir: async (path: string) => memory.readdirSync(path) as string[],
    stat: async (path: string) => Object.assign(memory.statSync(path)!, { uid: 0, gid: 0 }),
    lstat: async (path: string) => Object.assign(memory.lstatSync(path)!, { uid: 0, gid: 0 }),
    readlink: async (path: string) => memory.readlinkSync(path),
    // isomorphic-git writes `.git/index` while it walks the working tree (its stat cache): into the
    // copy in memory, never back to the person's folder. The writes are counted.
    writeFile: async (path: string, data: Uint8Array | string) => {
      writes.push(path);
      memory.mountFile(path, typeof data === "string" ? data : new Uint8Array(data));
    },
    mkdir: async (path: string) => {
      writes.push(`${path}/`);
      memory.mountDirectory(path);
    },
    rmdir: async (path: string) => enoent(memory.rmdirSync(path)),
    unlink: async (path: string) => enoent(memory.unlinkSync(path)),
    symlink: async (path: string) => enoent(memory.writeFileSync(path)),
    chmod: async (path: string) => enoent(memory.chmodSync(path)),
  },
};

/** Copies a checkout into memory, `.git` included, as app.html would read a dropped folder. */
function mount(from: string, to: string): number {
  let count = 0;
  const walk = (dir: string, rel: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path, `${rel}${entry.name}/`);
      else if (entry.isFile()) {
        memory.mountFile(`${to}/${rel}${entry.name}`, new Uint8Array(readFileSync(path)));
        count++;
      }
    }
  };
  memory.mountDirectory(to);
  walk(from, "");
  return count;
}

// --- keylang's git questions, answered by isomorphic-git ------------------------------------------
const ownState = (path: string): boolean => path === ".keylang" || path.startsWith(".keylang/");

async function commitOf(dir: string, ref: string): Promise<string | null> {
  try {
    const oid = /^[0-9a-f]{4,39}$/.test(ref) ? await git.expandOid({ fs, dir, cache, oid: ref }) : await git.resolveRef({ fs, dir, cache, ref });
    // `^{commit}`: an annotated tag is peeled to its commit.
    const object = await git.readObject({ fs, dir, cache, oid });
    if (object.type === "tag") return (object.object as { object: string }).object;
    return object.type === "commit" ? oid : null;
  } catch {
    return null;
  }
}

const isBinary = (bytes: Uint8Array): boolean => bytes.subarray(0, 8000).includes(0);
const textOf = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

interface Change {
  path: string;
  base: Uint8Array | null;
  work: Uint8Array | null;
}

/** Tracked files (in the base or the index) whose content differs between the base commit and the working tree. */
async function trackedChanges(dir: string, base: string | null): Promise<Change[]> {
  const trees = [...(base ? [git.TREE({ ref: base })] : []), git.WORKDIR(), git.STAGE()];
  const changes: Change[] = [];
  await git.walk({
    fs,
    dir,
    cache,
    trees,
    map: async (path, entries) => {
      if (path === ".") return true;
      const [baseEntry, work, stage] = base ? entries : [null, ...entries];
      const types = await Promise.all([baseEntry?.type(), work?.type(), stage?.type()]);
      if (types.some((type) => type === "tree")) return true;
      // Untracked (in neither the base nor the index): `ls-files --others` answers for it.
      if (!baseEntry && !stage) return null;
      const baseOid = baseEntry ? await baseEntry.oid() : null;
      const workOid = work && types[1] === "blob" ? await work.oid() : null;
      // Content only: a folder from the browser carries no mode bits.
      if (baseOid === workOid) return null;
      changes.push({ path, base: baseEntry ? await baseEntry.content() ?? null : null, work: work && types[1] === "blob" ? await work.content() ?? null : null });
      return null;
    },
  });
  return changes;
}

/** `ls-files --others --exclude-standard`: files in the working tree, not in the index, not ignored. */
async function untrackedFiles(dir: string): Promise<string[]> {
  const matrix = await git.statusMatrix({ fs, dir, cache });
  return matrix.filter(([, head, work, stage]) => head === 0 && work === 2 && stage === 0).map(([path]) => path);
}

async function isoChangedFiles(dir: string, ref: string): Promise<{ paths: string[]; deleted: string[]; unborn: boolean }> {
  const unborn = ref === "HEAD" && (await commitOf(dir, "HEAD")) === null;
  const base = unborn ? null : await commitOf(dir, ref);
  if (!unborn && base === null) throw new Error(`\`${ref}\` is not a commit`);
  const changes = (await trackedChanges(dir, base)).filter((change) => !ownState(change.path));
  // As `diff --unified=0` lists them: a binary or an empty side has no hunk, so it is no path, unless it was deleted.
  const deleted = changes.filter((change) => change.work === null && change.base !== null).map((change) => change.path);
  const paths = new Set(changes.filter((change) => change.work !== null && change.work.length > 0 && !isBinary(change.work) && !(change.base && isBinary(change.base))).map((change) => change.path));
  for (const path of deleted) paths.add(path);
  for (const path of await untrackedFiles(dir)) if (!ownState(path)) paths.add(path);
  return { paths: [...paths].sort(compareText), deleted: deleted.sort(compareText), unborn };
}

/** The new-side ranges of `git diff --unified=0`, from keylang's own line diff. */
function newRanges(base: string, work: string): [number, number][] {
  const lines = (text: string): string[] => (text === "" ? [] : text.replace(/\n$/, "").split("\n"));
  const ranges: [number, number][] = [];
  let shift = 0;
  if (jsdiff) {
    // Myers: a run of removed and added parts is one hunk, as `--unified=0` prints it.
    let line = 1;
    let open: { added: number } | null = null;
    const close = (): void => {
      if (open === null) return;
      ranges.push(open.added === 0 ? [Math.max(1, line - 1), Math.max(1, line - 1)] : [line - open.added, line - 1]);
      open = null;
    };
    for (const part of jsdiff.diffArrays(lines(base), lines(work))) {
      const count = part.count ?? part.value.length;
      if (!part.added && !part.removed) {
        close();
        line += count;
      } else {
        open ??= { added: 0 };
        if (part.added) {
          open.added += count;
          line += count;
        }
      }
    }
    close();
    return ranges;
  }
  for (const hunk of diffLines(lines(base), lines(work))) {
    const start = hunk.baseStart + shift + 1;
    // A deletion is the line it happened after.
    ranges.push(hunk.lines.length === 0 ? [Math.max(1, start - 1), Math.max(1, start - 1)] : [start, start + hunk.lines.length - 1]);
    shift += hunk.lines.length - hunk.baseCount;
  }
  return ranges;
}

async function isoChangedLines(dir: string, ref: string): Promise<Map<string, [number, number][] | "all">> {
  const base = await commitOf(dir, ref);
  if (base === null) throw new Error(`\`${ref}\` is not a commit`);
  const out = new Map<string, [number, number][] | "all">();
  for (const change of await trackedChanges(dir, base)) {
    if (change.work === null || change.work.length === 0 || isBinary(change.work) || (change.base && isBinary(change.base))) continue;
    const ranges = newRanges(change.base ? textOf(change.base) : "", textOf(change.work));
    if (ranges.length > 0) out.set(change.path, ranges);
  }
  for (const path of await untrackedFiles(dir)) out.set(path, "all");
  return out;
}

async function isoFileAt(dir: string, ref: string, path: string): Promise<string | null> {
  const oid = await commitOf(dir, ref);
  if (oid === null) {
    if (ref === "HEAD") return null;
    throw new Error(`\`${ref}\` is not a commit`);
  }
  try {
    return textOf((await git.readBlob({ fs, dir, cache, oid, filepath: path })).blob);
  } catch {
    return null;
  }
}

async function isoSpecFilesAt(dir: string, ref: string, specDir: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const oid = await commitOf(dir, ref);
  if (oid === null) return files;
  const listed = (await git.listFiles({ fs, dir, cache, ref: oid })).filter((path) => (specDir === "" || path.startsWith(`${specDir}/`)) && path.endsWith(".md")).sort(compareText);
  for (const path of listed) files.set(path, textOf((await git.readBlob({ fs, dir, cache, oid, filepath: path })).blob));
  return files;
}

const MAIN_BRANCHES: readonly (readonly [string, string])[] = [
  ["refs/heads/main", "main"],
  ["refs/heads/master", "master"],
  ["refs/remotes/origin/main", "origin/main"],
  ["refs/remotes/origin/master", "origin/master"],
];

async function isoFeatureBaseOrigin(dir: string): Promise<{ ref: string; source: string; label: string; main?: string }> {
  const HEAD_BASE = { ref: "HEAD", source: "HEAD", label: "HEAD" };
  let target = "";
  try {
    target = await git.resolveRef({ fs, dir, ref: "refs/remotes/origin/HEAD", depth: 2 });
  } catch {
    target = "";
  }
  const candidates = target.startsWith("refs/remotes/") ? [[target, target.slice("refs/remotes/".length)] as const, ...MAIN_BRANCHES] : MAIN_BRANCHES;
  let main: readonly [string, string] | undefined;
  for (const candidate of candidates) {
    if ((await commitOf(dir, candidate[0])) !== null) {
      main = candidate;
      break;
    }
  }
  if (main === undefined) return HEAD_BASE;
  const head = await commitOf(dir, "HEAD");
  const tip = await commitOf(dir, main[0]);
  if (head === null || tip === null) return { ...HEAD_BASE, main: main[1] };
  const [fork] = await git.findMergeBase({ fs, dir, cache, oids: [head, tip] });
  if (!fork || fork === head) return { ...HEAD_BASE, main: main[1] };
  return { ref: fork, source: "merge-base", main: main[1], label: `merge-base ${fork.slice(0, 7)} with ${main[1]}` };
}

// --- side by side ---------------------------------------------------------------------------------
const rangesText = (map: ReadonlyMap<string, unknown>): string => JSON.stringify([...map].sort(([a], [b]) => compareText(a, b)));
let same = 0;
let differ = 0;

async function compare(name: string, cli: () => unknown, iso: () => Promise<unknown>): Promise<void> {
  const started = performance.now();
  const expected = cli();
  const cliMs = performance.now() - started;
  const begun = performance.now();
  const actual = await iso();
  const isoMs = performance.now() - begun;
  const timing = `git ${Math.round(cliMs)} ms, isomorphic-git ${Math.round(isoMs)} ms`;
  try {
    assert.deepEqual(actual, expected);
    same++;
    console.log(`SAME  ${name}  (${timing})`);
  } catch (error) {
    differ++;
    // Two path → ranges listings: how many files differ, and which.
    if (typeof expected === "string" && typeof actual === "string" && expected.startsWith("[[")) {
      const want = new Map(JSON.parse(expected) as [string, unknown][]);
      const got = new Map(JSON.parse(actual) as [string, unknown][]);
      const paths = [...new Set([...want.keys(), ...got.keys()])];
      const off = paths.filter((path) => JSON.stringify(want.get(path)) !== JSON.stringify(got.get(path)));
      console.log(`DIFF  ${name}  (${timing}): ${off.length} of ${paths.length} files`);
      for (const path of off) console.log(`   ${path}\n     git: ${JSON.stringify(want.get(path))}\n     iso: ${JSON.stringify(got.get(path))}`);
      return;
    }
    console.log(`DIFF  ${name}  (${timing})\n${String((error as Error).message).split("\n").slice(0, 24).join("\n")}`);
  }
}

for (const [index, repo] of reposArg.split(",").entries()) {
  const dir = `/repo${index}`;
  const begun = performance.now();
  const files = mount(repo, dir);
  console.log(`\n# ${repo}: ${files} files copied into memory in ${Math.round(performance.now() - begun)} ms`);
  const cliChanged = (ref: string) => {
    const changed = gitChangedFiles(repo, ref);
    return { paths: [...changed.paths].sort(compareText), deleted: [...changed.deleted].sort(compareText), unborn: changed.unborn };
  };
  const refs = ["HEAD", "master"];
  for (const ref of refs) {
    let known = true;
    try {
      gitChangedFiles(repo, ref);
    } catch {
      known = false;
    }
    if (!known) continue;
    await compare(`changed files since ${ref}`, () => cliChanged(ref), () => isoChangedFiles(dir, ref));
    if (ref !== "HEAD" || !cliChanged("HEAD").unborn) await compare(`changed lines since ${ref}`, () => rangesText(gitChangedLines(repo, ref)), async () => rangesText(await isoChangedLines(dir, ref)));
    await compare(`package.json at ${ref}`, () => gitFileAt(repo, ref, "package.json", "probe"), () => isoFileAt(dir, ref, "package.json"));
    await compare(`a missing file at ${ref}`, () => gitFileAt(repo, ref, "no/such/file.md", "probe"), () => isoFileAt(dir, ref, "no/such/file.md"));
    await compare(`spec files under keylang/ at ${ref}`, () => rangesText(gitSpecFilesAt(repo, ref, "keylang", "probe")), async () => rangesText(await isoSpecFilesAt(dir, ref, "keylang")));
  }
  await compare("the base of a feature", () => featureBaseOrigin(repo, "probe"), () => isoFeatureBaseOrigin(dir));
}
console.log(`\n${same} same, ${differ} different; writes into the copy in memory: ${JSON.stringify([...new Set(writes)])}`);
