// `keylang diff` and `GET /api/graph-diff` up to the model: which two
// revisions a range names, both analysed (a commit in a temporary directory,
// the working tree in place), and their `GraphDiff` with the picture of it.
// Reads git and files; writes nothing in the repository (the temporary
// directories are removed, the fact cache only read).
//
// Sits between the callers (cli.ts, tui/web.ts and tui/web-export.ts through
// read-api.ts) and the pure diff (graph-diff.ts). Entry points: `parseRange`,
// `runGraphDiff`.

import { analyze, type Analysis } from "./analyze.ts";
import { featureBaseOrigin } from "./git-changes.ts";
import { diffSubgraph, graphDiff, type DiffLevel, type DiffSubgraph, type GraphDiff } from "./graph-diff.ts";
import { analyzeRevision, resolveRevision, WORKING_TREE, workingTree, type Revision } from "./revision-tree.ts";

/** The two sides a range names: a ref, or null for the default (the base of a feature; the working tree). */
export interface DiffRange {
  base: string | null;
  head: string | null;
}

/**
 * `<base>`, `<base>..<head>` or nothing. An empty side of `..` is `HEAD`, as
 * git reads it; `...` (a symmetric range) is refused, never guessed at.
 */
export function parseRange(text: string | undefined, label: string): DiffRange {
  if (text === undefined || text === "") return { base: null, head: null };

  if (text.includes("...")) throw new Error(`${label}: \`${text}\`: a range is <base>..<head>; \`...\` is not supported`);
  const at = text.indexOf("..");

  if (at === -1) return { base: text, head: null };

  return { base: text.slice(0, at) || "HEAD", head: text.slice(at + 2) || "HEAD" };
}

/** What one diff asks for. */
export interface DiffRequest {
  root: string;
  range: DiffRange;
  level: DiffLevel;
  /** Names the caller in errors (`diff`, `web`). */
  label: string;
}

/** The diff, the picture of it, and the two analyses it came from. */
export interface DiffRun {
  diff: GraphDiff;
  subgraph: DiffSubgraph;
  base: Analysis;
  head: Analysis;
}

/** Analyses of commits by root and commit id: a commit never changes, so the web page asks git and the parser once. */
const commits = new Map<string, Promise<Analysis>>();

/** At most this many commits kept analysed in one process. */
const KEPT_COMMITS = 4;

/**
 * The analysis of `revision`: the working tree in place, a commit in a
 * temporary directory (cached by its id). Both sides leave test reports,
 * traces and the migration's old stack out, so evidence only one side has
 * makes no finding new; the working tree's fact cache is read, not saved.
 */
function analysisOf(root: string, revision: Revision, label: string): Promise<Analysis> {
  if (revision.ref === WORKING_TREE) return analyze({ root, withoutEvidence: true, withoutMigration: true });
  const key = `${root}\0${revision.commit ?? "unborn"}`;
  let found = commits.get(key);

  if (found === undefined) {
    found = analyzeRevision(root, revision, label);
    commits.set(key, found);
    // A failure is not remembered; past the limit the oldest entry goes first.
    found.catch(() => commits.delete(key));

    if (commits.size > KEPT_COMMITS) commits.delete(commits.keys().next().value!);
  }

  return found;
}

/** Resolves the range, analyses both sides and diffs them. A bad ref, no git or no repository is an error naming `label`. */
export async function runGraphDiff(request: DiffRequest): Promise<DiffRun> {
  const { root, range, level, label } = request;
  // The base: the ref given, else the base of a feature (the merge-base with the main branch, else HEAD).
  const origin = range.base === null ? featureBaseOrigin(root, label) : { ref: range.base, label: range.base };
  const baseRevision = resolveRevision(root, origin.ref, label, origin.label);
  const headRevision = range.head === null ? workingTree(root, label) : resolveRevision(root, range.head, label);
  // One after the other: two analyses at once would only compete for the same cores and memory.
  const base = await analysisOf(root, baseRevision, label);
  const head = await analysisOf(root, headRevision, label);
  const diff = graphDiff({ base, head, baseRevision, headRevision, level });

  return { diff, subgraph: diffSubgraph(diff, base, head), base, head };
}
