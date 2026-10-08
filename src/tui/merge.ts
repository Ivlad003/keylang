// Line diff of a document and a proposed version, as hunks a person accepts or
// rejects one by one. The result keeps the base lines of every hunk that is
// not accepted, so nothing reaches the file without an explicit `a`.

import { diffLines, type Hunk } from "../line-diff.ts";

export { diffLines, type Hunk };

export type Decision = "pending" | "accepted" | "rejected";

/** The base with the accepted hunks applied; pending and rejected hunks keep the base lines. */
export function applyHunks(base: readonly string[], hunks: readonly Hunk[], decisions: readonly Decision[]): string[] {
  const out: string[] = [];
  let at = 0;
  hunks.forEach((hunk, index) => {
    out.push(...base.slice(at, hunk.baseStart));
    if (decisions[index] === "accepted") out.push(...hunk.lines);
    else out.push(...base.slice(hunk.baseStart, hunk.baseStart + hunk.baseCount));
    at = hunk.baseStart + hunk.baseCount;
  });
  out.push(...base.slice(at));
  return out;
}

/** One row of the merge view: context, a removed base line, or an added line of hunk `hunk`. */
export interface MergeRow {
  kind: "same" | "removed" | "added";
  text: string;
  hunk: number | null;
  /** Base line number (0-based) for context and removed rows. */
  baseLine: number | null;
}

export function mergeRows(base: readonly string[], hunks: readonly Hunk[]): MergeRow[] {
  const rows: MergeRow[] = [];
  let at = 0;
  hunks.forEach((hunk, index) => {
    for (; at < hunk.baseStart; at++) rows.push({ kind: "same", text: base[at]!, hunk: null, baseLine: at });
    for (let k = 0; k < hunk.baseCount; k++, at++) rows.push({ kind: "removed", text: base[at]!, hunk: index, baseLine: at });
    for (const line of hunk.lines) rows.push({ kind: "added", text: line, hunk: index, baseLine: null });
  });
  for (; at < base.length; at++) rows.push({ kind: "same", text: base[at]!, hunk: null, baseLine: at });
  return rows;
}
