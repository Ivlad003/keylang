// Line diff of a document and a proposed version, as hunks a person accepts or
// rejects one by one. The result keeps the base lines of every hunk that is
// not accepted, so nothing reaches the file without an explicit `a`.

export interface Hunk {
  /** First base line the hunk replaces (0-based) and how many. */
  baseStart: number;
  baseCount: number;
  /** Lines the proposal puts there. */
  lines: string[];
}

export type Decision = "pending" | "accepted" | "rejected";

/** Longest-common-subsequence diff; specs are small enough for the quadratic table. */
export function diffLines(base: readonly string[], proposed: readonly string[]): Hunk[] {
  const n = base.length;
  const m = proposed.length;
  // Common prefix and suffix are cut first: most proposals touch a few lines.
  let start = 0;
  while (start < n && start < m && base[start] === proposed[start]) start++;
  let endBase = n;
  let endNew = m;
  while (endBase > start && endNew > start && base[endBase - 1] === proposed[endNew - 1]) {
    endBase--;
    endNew--;
  }
  const a = base.slice(start, endBase);
  const b = proposed.slice(start, endNew);
  const table: Uint32Array[] = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i]![j] = a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  const hunks: Hunk[] = [];
  let open: Hunk | null = null;
  let i = 0;
  let j = 0;
  const close = (): void => {
    if (open) hunks.push(open);
    open = null;
  };
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      close();
      i++;
      j++;
    } else if (j < b.length && (i === a.length || table[i]![j + 1]! >= table[i + 1]![j]!)) {
      open ??= { baseStart: start + i, baseCount: 0, lines: [] };
      open.lines.push(b[j]!);
      j++;
    } else {
      open ??= { baseStart: start + i, baseCount: 0, lines: [] };
      open.baseCount++;
      i++;
    }
  }
  close();
  return hunks;
}

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
