// A line diff as hunks (business-flows/24 moved it here from `tui/merge.ts`):
// MERGE in the TUI takes them one by one, and a diagram proposal of
// `keylang web` names how many its targets hold. Pure, no dependencies.

export interface Hunk {
  /** First base line the hunk replaces (0-based) and how many. */
  baseStart: number;
  baseCount: number;
  /** Lines the proposal puts there. */
  lines: string[];
}

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
