// Proposals (CONTEXT.md): the full proposed text of one hand-written spec or
// source file, kept in `.keylang/proposals/<path>` until a person takes it:
// hunk by hunk in the TUI's MERGE, or whole with `keylang proposals accept`.
// `draft`, `code-to-spec` and MCP `apply_diff` propose specs, `spec-to-code`
// proposes code and its tests; nothing else changes the file itself (an
// explicit CLI `--apply` aside). `proposalProblem` and `codeProposalProblem`
// are the one gate of every entry point — CLI `--into`, the TUI scan, MCP
// `apply_diff`, `keylang proposals` — and start from the write protocol of
// `safe-write.ts`, so a path gets one reason wherever it comes from.

import { accessSync, constants, existsSync, lstatSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, type Stats } from "node:fs";
import { basename, dirname, join, posix, relative, resolve, win32 } from "node:path";
import { within } from "./analyze.ts";
import { toPosix } from "./config.ts";
import { errorText } from "./diag.ts";
import { existingText } from "./files.ts";
import { languageOf } from "./languages.ts";
import { DISCOVERED_FLOWS_DIR, EXPLAINED_MAP_DIR } from "./map.ts";
import { parse } from "./parser.ts";
import { isGeneratedText, landing, safeWrite, writeProblem } from "./safe-write.ts";
import { compareText } from "./span.ts";
import { addDrafts, statusesIn, updateStats } from "./stats.ts";
import { WIRE_MARKER } from "./wire-gen.ts";

export const PROPOSALS_DIR = ".keylang/proposals";

/** The write protocol's first test (`writeProblem`): a plain relative POSIX path, before anything on disk is looked at. */
function notPlain(path: string): boolean {
  return path === "" || path.includes("\\") || posix.isAbsolute(path) || win32.isAbsolute(path) || path.split("/").some((part) => part === ".." || part === "." || part === "");
}

/** A directory below the spec directory, or the root for code, that `check` and the map do not read: hidden, `node_modules`, `target`. */
function unreadDirectory(dirs: readonly string[]): boolean {
  return dirs.some(unreadName);
}

/** Case does not tell the directories apart: on a case-insensitive file system `Node_Modules` is `node_modules`. */
function unreadName(name: string): boolean {
  const lower = name.toLowerCase();
  return name.startsWith(".") || lower === "node_modules" || lower === "target";
}

function statOrNull(abs: string): Stats | null {
  try {
    return statSync(abs);
  } catch {
    return null;
  }
}

/** The same directory on disk: by device and inode, which a link or another letter case of the name does not change. */
function sameEntry(a: Stats, b: Stats | null): boolean {
  return b !== null && a.dev === b.dev && a.ino === b.ino;
}

/**
 * Whether a write to `abs` lands inside the directory `dir` on disk: `dir`
 * itself or one of the existing ancestors of `abs` is `dir` by device and
 * inode. Links are followed, so `notes/brief/x.md` with `notes -> explain`
 * lands in `explain/`, and on a case-insensitive file system so does
 * `Explain/brief/x.md`; the text of the path is not consulted. A `dir` that
 * is not on disk holds nothing.
 */
export function landsIn(abs: string, dir: string): boolean {
  const target = statOrNull(dir);
  if (target === null || !target.isDirectory()) return false;
  for (let entry = abs; ; entry = dirname(entry)) {
    const stat = statOrNull(entry);
    if (stat !== null && sameEntry(target, stat)) return true;
    if (dirname(entry) === entry) return false;
  }
}

/**
 * Whether the landing place `lands` (below `root`, links resolved) is in a
 * directory `check` does not read: an ancestor below `root` whose name is
 * hidden, `node_modules` or `target` (the segments not on disk yet by their
 * text), or whose entry on disk is the `node_modules` or `target` next to
 * it, so a link into `node_modules/` or another letter case cannot alias it.
 */
function landsUnread(root: string, lands: string): boolean {
  const base = statOrNull(root);
  for (let dir = dirname(lands); dir !== dirname(dir) && within(dir, root); dir = dirname(dir)) {
    const stat = statOrNull(dir);
    if (base !== null && sameEntry(base, stat)) return false;
    if (unreadName(basename(dir))) return true;
    if (stat !== null && ["node_modules", "target"].some((name) => sameEntry(stat, statOrNull(join(dirname(dir), name))))) return true;
  }
  return false;
}

/** The directories under the spec directory keylang generates, each with the refusal a proposal into it gets. */
const GENERATED_SPEC_DIRS: readonly [string, string][] = [
  ["map", "a generated map file: change the code or the rules, then run `keylang map`"],
  [EXPLAINED_MAP_DIR, "the explained map is generated: `keylang map` writes it"],
  ["explain", "saved explanations: only `keylang explain` writes them"],
  [DISCOVERED_FLOWS_DIR, "discovered flows are a generated view: `keylang flows discover` writes it; `keylang flows adopt <name>` proposes one as a spec"],
];

/** Why the spec path `inside` the spec directory is in a reserved directory by its text alone (case aside), or null: the fast path. */
function reservedSpecText(inside: string): string | null {
  const dirs = inside.split("/").slice(0, -1);
  if (unreadDirectory(dirs)) return "in a directory specs are not read from";
  const first = dirs[0]?.toLowerCase();
  return GENERATED_SPEC_DIRS.find(([name]) => name.toLowerCase() === first)?.[1] ?? null;
}

/** Why the landing place `lands` of a spec is in a reserved directory of `specRoot` (the spec directory on disk), or null. */
function reservedSpecLanding(specRoot: string, lands: string): string | null {
  if (landsUnread(specRoot, lands)) return "in a directory specs are not read from";
  return GENERATED_SPEC_DIRS.find(([name]) => landsIn(lands, join(specRoot, name)))?.[1] ?? null;
}

/**
 * Why `.keylang/proposals/<path>` may not be merged, or null. A proposal
 * replaces one hand-written spec: a Markdown file under the spec directory,
 * not one keylang generates (the map, the explained map, a saved model
 * explanation, a file with the generated marker), and not reached through a
 * link that leads out of the spec directory. `specDir` is relative to the
 * root, POSIX; `generated` says whether the analysis knows the path as a
 * generated document. Nothing outside the spec directory is read.
 */
export function proposalProblem(root: string, specDir: string, path: string, generated: (path: string) => boolean = () => false): string | null {
  if (!path.endsWith(".md")) return "not a Markdown spec";
  if (notPlain(path)) return "not a plain relative path";
  if (specDir === ".." || specDir.startsWith("../")) return "the spec directory is outside the repository";
  const prefix = specDir === "" ? "" : `${specDir}/`;
  if (!path.startsWith(prefix)) return `outside ${specDir}/: a proposal changes specs only`;
  const inside = path.slice(prefix.length);
  // The same files `check` reads as specs: the spec directory itself may be hidden, a directory below it may not.
  // The text of the path is the fast path; the landing place decides below, since a link or another letter
  // case of a reserved directory's name lands in it too.
  const byText = reservedSpecText(inside);
  if (byText !== null) return byText;
  // Links first: nothing outside the spec directory is read, not even to see whether it is generated.
  const specRoot = landing(resolve(root, specDir));
  if (specRoot === null || !within(specRoot, realpathSync(root))) return "the spec directory leads out of the repository through a link";
  const problem = writeProblem(root, path, { ...(specDir === "" ? {} : { under: specDir }), generated: true });
  if (problem !== null) return problem.startsWith("leads out of") ? `leads out of ${specDir || "."}/ through a link` : problem;
  const lands = landing(resolve(root, path))!;
  const byLanding = reservedSpecLanding(specRoot, lands);
  if (byLanding !== null) return byLanding;
  const text = existingText(lands);
  const marker = text === null ? null : parse(path, text).generated;
  if (marker !== null || (text !== null && isGeneratedText(text)) || generated(path)) return generatedSpecProblem(marker, specDir);
  return null;
}

/**
 * The refusal for a generated spec, naming the command its marker names
 * (`keylang baseline` for the baseline; `keylang map` otherwise).
 */
function generatedSpecProblem(marker: string | null, specDir: string): string {
  const command = marker?.match(/`(keylang [a-z-]+)`/)?.[1] ?? "keylang map";
  if (command !== "keylang baseline") return `a generated file: it is written by \`${command}\` only`;
  return `a generated file: it is written by \`keylang baseline\` only; propose rule changes in \`${specDir === "" ? "" : `${specDir}/`}rules.md\``;
}

/**
 * Why a proposal for the source file `path` may not be merged, or null: a
 * file of a language keylang reads, a plain relative path inside the
 * repository (links included, one whose target does not exist yet too),
 * outside the directories sources are not read from, and not one keylang
 * generates (`keylang wire`, any generated marker). Nothing outside the
 * repository is read.
 */
export function codeProposalProblem(root: string, path: string): string | null {
  if (languageOf(path) === undefined) return "not a source file of a language keylang reads";
  if (notPlain(path)) return "not a plain relative path";
  if (unreadDirectory(path.split("/").slice(0, -1))) return "in a directory sources are not read from";
  const problem = writeProblem(root, path, { generated: true });
  if (problem !== null) return problem;
  const lands = landing(resolve(root, path))!;
  // The text was the fast path: a link such as `src/vendor -> ../node_modules/lib` lands in `node_modules/` too.
  if (landsUnread(realpathSync(root), lands)) return "in a directory sources are not read from";
  const text = existingText(lands);
  if (text?.startsWith(WIRE_MARKER)) return "a generated file: it is written by `keylang wire` only";
  if (text !== null && isGeneratedText(text)) return "a generated file: only its generator writes it";
  return null;
}

/** The gate of a proposal's target: a Markdown file is a spec, any other a source file. */
export function targetProblem(root: string, specDir: string, path: string, generated?: (path: string) => boolean): string | null {
  return path.endsWith(".md") ? proposalProblem(root, specDir, path, generated) : codeProposalProblem(root, path);
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
  const target = existingText(abs);
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

// ---------- `keylang proposals`: a person takes a proposal whole ----------

/** One pending proposal as `keylang proposals` lists it. */
export interface PendingProposal {
  /** The file it replaces, relative to the root, POSIX. */
  target: string;
  /** The target is not on disk yet. */
  newFile: boolean;
  /** `+` and `-` lines of `lineDiff` against the target on disk; null when the proposal cannot be accepted. */
  added: number | null;
  removed: number | null;
  /** Why it cannot be accepted, or null. */
  problem: string | null;
}

/**
 * The target of a proposal as a person names it: as `keylang proposals`
 * lists it, or as its store path `.keylang/proposals/<target>`; POSIX. Null
 * when it is no plain relative path.
 */
export function proposalTarget(name: string): string | null {
  const path = toPosix(name);
  const target = path.startsWith(`${PROPOSALS_DIR}/`) ? path.slice(PROPOSALS_DIR.length + 1) : path;
  return notPlain(target) ? null : target;
}

/**
 * Every target with a file or a link under `.keylang/proposals/`, sorted. The
 * store is listed only while it stays inside the repository; a link in it is
 * listed, never followed.
 */
export function pendingTargets(root: string): string[] {
  const dir = join(root, PROPOSALS_DIR);
  const lands = landing(dir);
  if (!existsSync(dir) || lands === null || !within(lands, realpathSync(root))) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() || entry.isSymbolicLink())
    .map((entry) => toPosix(relative(dir, join(entry.parentPath, entry.name))))
    .sort(compareText);
}

/**
 * The store entry of `target` where its directory lands: null when there is
 * none, else the entry and whether it is a link. A store whose directory
 * leads out of the repository is a problem, and nothing there is looked at.
 */
function storeEntry(root: string, target: string): { abs: string; link: boolean } | { problem: string } | null {
  const store = `${PROPOSALS_DIR}/${target}`;
  const parent = landing(dirname(join(root, store)));
  const base = landing(join(root, PROPOSALS_DIR));
  if (parent === null || base === null || !within(parent, realpathSync(root)) || !within(parent, base)) return { problem: `${store}: leads out of the repository through a link` };
  const abs = join(parent, basename(store));
  try {
    return { abs, link: lstatSync(abs).isSymbolicLink() };
  } catch {
    return null;
  }
}

/** A proposal that may be accepted: its text and the target's (null: no file). */
interface ReadProposal {
  proposal: string;
  before: string | null;
}

/**
 * The proposal of `target` read after both gates — a plain file in the store,
 * a target a proposal may change — or why it cannot be accepted; null when
 * none is pending.
 */
function readProposal(root: string, specDir: string, target: string): ReadProposal | { problem: string } | null {
  const entry = storeEntry(root, target);
  if (entry === null || "problem" in entry) return entry;
  if (entry.link) return { problem: `a link under ${PROPOSALS_DIR}/: a proposal is a plain file` };
  const problem = targetProblem(root, specDir, target);
  if (problem !== null) return { problem };
  const abs = landing(resolve(root, target))!;
  return { proposal: readFileSync(entry.abs, "utf8"), before: existingText(abs) };
}

/** `+` and `-` lines `lineDiff` prints. */
function lineCounts(before: string, after: string): { added: number; removed: number } {
  const lines = lineDiff(before, after).split("\n").slice(1);
  return { added: lines.filter((line) => line.startsWith("+")).length, removed: lines.filter((line) => line.startsWith("-")).length };
}

/** Every pending proposal with its target, line counts and why it cannot be accepted. Reads only. */
export function listProposals(root: string, specDir: string): PendingProposal[] {
  return pendingTargets(root).map((target) => {
    const read = readProposal(root, specDir, target);
    if (read === null || "problem" in read) return { target, newFile: false, added: null, removed: null, problem: read === null ? "removed while listed" : read.problem };
    return { target, newFile: read.before === null, ...lineCounts(read.before ?? "", read.proposal), problem: null };
  });
}

/** What `keylang proposals show <target>` prints, or why not. Reads only. */
export type ProposalDiff = { state: "none" } | { state: "refused"; reason: string } | { state: "diff"; newFile: boolean; text: string };

export function proposalDiff(root: string, specDir: string, target: string): ProposalDiff {
  const read = readProposal(root, specDir, target);
  if (read === null) return { state: "none" };
  if ("problem" in read) return { state: "refused", reason: read.problem };
  return { state: "diff", newFile: read.before === null, text: `${target}${read.before === null ? " (new file)" : ""}\n${lineDiff(read.before ?? "", read.proposal)}\n` };
}

export type AcceptResult =
  | { state: "none" }
  | { state: "refused"; reason: string }
  /** The proposal matched the target: nothing written, the proposal removed. */
  | { state: "unchanged"; kept: string | null }
  /** `kept`: why the proposal is still there (it changed meanwhile, or could not be removed), or null. */
  | { state: "written"; newFile: boolean; added: number; removed: number; kept: string | null };

/**
 * `keylang proposals accept <target>`: the proposal's full text replaces the
 * target, as MERGE does with every hunk accepted. The same gates as MERGE
 * (the target's, a plain file in the store), a target that is not writable
 * (a person's `chmod a-w`) is refused, and the write follows the protocol of
 * `safe-write.ts`: inside the spec directory for a spec (the repository for
 * code), atomic, the permissions and CRLF of the file it replaces, and only
 * while the target still holds what was read. Then the proposal is removed
 * while it is still the text accepted. An I/O error throws.
 */
export function acceptProposal(root: string, specDir: string, target: string): AcceptResult {
  const read = readProposal(root, specDir, target);
  if (read === null) return { state: "none" };
  if ("problem" in read) return { state: "refused", reason: read.problem };
  const abs = landing(resolve(root, target))!;
  if (read.before !== null) {
    try {
      accessSync(abs, constants.W_OK);
    } catch (error) {
      return { state: "refused", reason: `not writable (${(error as NodeJS.ErrnoException).code ?? "error"})` };
    }
  }
  if (read.before === read.proposal) return { state: "unchanged", kept: dropProposal(root, target, read.proposal) };
  const spec = target.endsWith(".md");
  // MERGE's boundary: the spec directory for a spec, the repository for code; and the target as it was read.
  const options = { ...(spec && specDir !== "" ? { under: specDir } : {}), expect: read.before };
  const problem = writeProblem(root, target, options);
  if (problem !== null) return { state: "refused", reason: problem };
  safeWrite(root, target, read.proposal, options);
  if (spec) countDecision(root, read.before ?? "", read.proposal, "accepted");
  return { state: "written", newFile: read.before === null, ...lineCounts(read.before ?? "", read.proposal), kept: dropProposal(root, target, read.proposal) };
}

export type RejectResult = { state: "none" } | { state: "refused"; reason: string } | { state: "removed" };

/**
 * `keylang proposals reject <target>`: the proposal is removed and the target
 * stays as it is. A proposal no gate admits is still the person's to drop;
 * a link in the store is removed itself, never followed. An I/O error throws.
 */
export function rejectProposal(root: string, specDir: string, target: string): RejectResult {
  const entry = storeEntry(root, target);
  if (entry === null) return { state: "none" };
  if ("problem" in entry) return { state: "refused", reason: entry.problem };
  if (!entry.link && target.endsWith(".md") && targetProblem(root, specDir, target) === null) {
    const abs = landing(resolve(root, target))!;
    countDecision(root, existingText(abs) ?? "", readFileSync(entry.abs, "utf8"), "rejected");
  }
  rmSync(entry.abs, { force: true });
  return { state: "removed" };
}

/** Removes the proposal while it still holds `text`: null, or why it stays. */
function dropProposal(root: string, target: string, text: string): string | null {
  try {
    const entry = storeEntry(root, target);
    if (entry === null || "problem" in entry || entry.link || readFileSync(entry.abs, "utf8") !== text) return `${PROPOSALS_DIR}/${target} changed while it was accepted; the newer proposal stays`;
    rmSync(entry.abs);
    return null;
  } catch (error) {
    return `${PROPOSALS_DIR}/${target} could not be removed (${errorText(error)})`;
  }
}

/** The model lines a decision took or dropped, as MERGE counts them (design §5.1 p.7); a count that cannot be written is lost, never the decision. */
function countDecision(root: string, before: string, after: string, decision: "accepted" | "rejected"): void {
  const added = lineDiff(before, after)
    .split("\n")
    .slice(1)
    .filter((line) => line.startsWith("+"));
  const counts = statusesIn(added);
  if (Object.keys(counts).length === 0) return;
  try {
    updateStats(root, (stats) => addDrafts(stats, counts, decision));
  } catch {
    // `.keylang/stats.json` that cannot be written loses the count.
  }
}
