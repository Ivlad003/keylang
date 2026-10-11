// `.keylang/stats.json`: how often people accept what a model proposed
// (design §5.1 p.7, §7.3). Counts per reconciliation status of draft lines,
// and per kind of suggestion; local, never a verdict. A damaged file starts over.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isJsonNumber, isJsonObject, parseJson, type JsonValue } from "./json.ts";
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

type StatsFile = { text: string | null; stats: Stats };

/** A tally as the file holds it; null when it is not one. */
function tallyOf(value: JsonValue | undefined): Tally | null {
  if (!isJsonObject(value)) return null;
  const { proposed, accepted, rejected } = value;

  return isJsonNumber(proposed) && isJsonNumber(accepted) && isJsonNumber(rejected) ? { proposed, accepted, rejected } : null;
}

/** A suggestion's tally, with its `ms`; null when it is not one. */
function suggestionTallyOf(value: JsonValue | undefined): (Tally & { ms: number }) | null {
  const tally = tallyOf(value);
  const ms = isJsonObject(value) ? value.ms : undefined;

  return tally !== null && isJsonNumber(ms) ? { ...tally, ms } : null;
}

/** Every entry of a table of tallies read by `read`; null when the table or one entry is damaged. A missing table (`null`) is empty. */
function tableOf<T>(value: JsonValue | undefined, read: (entry: JsonValue) => T | null): Record<string, T> | null {
  if (value === null) return {};

  if (!isJsonObject(value)) return null;
  const entries: [string, T][] = [];

  for (const [key, entry] of Object.entries(value)) {
    const tally = read(entry);

    if (tally === null) return null;
    entries.push([key, tally]);
  }

  return Object.fromEntries(entries);
}

/** The file as read — its text, null when there is none (or it cannot be read) — and the counts it holds. */
function readStatsFile(root: string): StatsFile {
  const empty: Stats = { schema: 1, drafts: {}, suggestions: {} };
  let text: string;

  try {
    text = readFileSync(join(root, STATS_FILE), "utf8");
  } catch {
    return { text: null, stats: empty };
  }

  try {
    const value = parseJson(text);

    if (!isJsonObject(value) || value.schema !== 1) return { text, stats: empty };
    const drafts = tableOf(value.drafts, tallyOf);
    const suggestions = tableOf(value.suggestions, suggestionTallyOf);

    if (drafts === null || suggestions === null) return { text, stats: empty };

    return { text, stats: { schema: 1, drafts, suggestions } };
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
export function statusesIn(lines: readonly string[]): Map<string, number> {
  const out = new Map<string, number>();

  for (const line of lines) {
    const m = /<!-- keylang:(?:llm|algo)\b[^>]*\bstatus=([a-z-]+)/.exec(line);

    if (m) out.set(m[1]!, (out.get(m[1]!) ?? 0) + 1);
  }

  return out;
}

export function addDrafts(stats: Stats, counts: Iterable<readonly [string, number]>, field: keyof Tally): void {
  for (const [status, n] of counts) {
    const tally = (stats.drafts[status] ??= { proposed: 0, accepted: 0, rejected: 0 });
    tally[field] += n;
  }
}
