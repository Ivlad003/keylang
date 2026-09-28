// `.keylang/stats.json`: how often people accept what a model proposed
// (design §5.1 p.7, §7.3). Counts per reconciliation status of draft lines,
// and per kind of suggestion; local, never a verdict. A damaged file starts over.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { safeWrite } from "./safe-write.ts";

export interface Tally {
  proposed: number;
  accepted: number;
  rejected: number;
}

export interface Stats {
  schema: 1;
  /** Draft lines by status: `agree`, `llm-only`, `algo-only`, `conflict`. */
  drafts: Record<string, Tally>;
  /** Editor suggestions by source: `completion`, `ghost`; `ms` sums the time from showing to deciding. */
  suggestions: Record<string, Tally & { ms: number }>;
}

export const STATS_FILE = ".keylang/stats.json";

export function readStats(root: string): Stats {
  const file = join(root, STATS_FILE);
  const empty: Stats = { schema: 1, drafts: {}, suggestions: {} };
  if (!existsSync(file)) return empty;
  try {
    const value = JSON.parse(readFileSync(file, "utf8")) as Partial<Stats>;
    if (value.schema !== 1 || typeof value.drafts !== "object" || typeof value.suggestions !== "object") return empty;
    return { schema: 1, drafts: value.drafts ?? {}, suggestions: value.suggestions ?? {} };
  } catch {
    return empty;
  }
}

export function updateStats(root: string, change: (stats: Stats) => void): void {
  const stats = readStats(root);
  change(stats);
  safeWrite(root, STATS_FILE, `${JSON.stringify(stats, null, 2)}\n`, { under: ".keylang" });
}

/** `status=` of every `keylang:llm` / `keylang:algo` provenance comment in the lines. */
export function statusesIn(lines: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const line of lines) {
    const m = /<!-- keylang:(?:llm|algo)\b[^>]*\bstatus=([a-z-]+)/.exec(line);
    if (m) out[m[1]!] = (out[m[1]!] ?? 0) + 1;
  }
  return out;
}

export function addDrafts(stats: Stats, counts: Record<string, number>, field: keyof Tally): void {
  for (const [status, n] of Object.entries(counts)) {
    const tally = (stats.drafts[status] ??= { proposed: 0, accepted: 0, rejected: 0 });
    tally[field] += n;
  }
}
