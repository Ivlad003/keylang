// `.keylang/stats.json`: how often people accept what a model proposed
// (design §5.1 p.7, §7.3). Counts per reconciliation status of draft lines,
// and per kind of suggestion; local, never a verdict. A damaged file starts over.

import { readFileSync } from "node:fs";
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
  return readStatsFile(root).stats;
}

/** The file as read — its text, null when there is none (or it cannot be read) — and the counts it holds. */
function readStatsFile(root: string): { text: string | null; stats: Stats } {
  const empty: Stats = { schema: 1, drafts: {}, suggestions: {} };
  let text: string;
  try {
    text = readFileSync(join(root, STATS_FILE), "utf8");
  } catch {
    return { text: null, stats: empty };
  }
  try {
    const value = JSON.parse(text) as Partial<Stats>;
    if (value.schema !== 1 || typeof value.drafts !== "object" || typeof value.suggestions !== "object") return { text, stats: empty };
    return { text, stats: { schema: 1, drafts: value.drafts ?? {}, suggestions: value.suggestions ?? {} } };
  } catch {
    return { text, stats: empty };
  }
}

/**
 * Applies `change` to the counts on disk. Another writer (`keylang draft` in
 * a shell beside a MERGE in the TUI) may write between the read and the
 * write: the write lands only over the text it read, and a lost race reads
 * again and applies `change` once more, so neither update is lost.
 */
export function updateStats(root: string, change: (stats: Stats) => void): void {
  for (let attempt = 1; ; attempt++) {
    const { text, stats } = readStatsFile(root);
    change(stats);
    try {
      safeWrite(root, STATS_FILE, `${JSON.stringify(stats, null, 2)}\n`, { under: ".keylang", expect: text });
      return;
    } catch (error) {
      // No race (an unwritable file) or a second lost one: what a lost count costs is the caller's call.
      if (attempt >= 2 || readStatsFile(root).text === text) throw error;
    }
  }
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
