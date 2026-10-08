// `keylang entries [--kind k]`, the MCP tool `list_entries` and the TUI's
// «Entry points»: the entry points of the current snapshot (ADR 0022 п. 5),
// read-only. One text for the CLI's table and the F6 report, one JSON shape
// for `--json` and MCP.

import { isAbsolute } from "node:path";
import { analyze } from "../analyze.ts";
import { errorText } from "../diag.ts";
import type { EntryPoint } from "../snapshot.ts";
import { empty } from "./shared.ts";
import type { EntriesPayload, EntriesRequest, OperationContext, OperationEnvelope } from "./types.ts";

/** What the CLI says under an empty table: where entry points come from, and what finds a framework's. */
export const ENTRIES_HINT =
  "hint: keylang records entry points the code and its manifests write: `bin` of package.json, `[project.scripts]` of pyproject.toml, `fn main` of a Rust bin target, `if __name__ == \"__main__\"`, a script in bin/ or public/index.php, exported GET/POST of app/**/route.ts, app.get('/x', handler) with a literal path; a framework's routes, cron jobs and consumers need its adapter";

/**
 * The entry points of a fresh snapshot of the saved code, optionally one
 * kind. Code 0 with the list (empty included: nothing to find is no
 * failure); 2 with no payload for a broken keylang.json or a repository
 * without code to read.
 */
export async function runEntries(request: EntriesRequest, context: OperationContext): Promise<OperationEnvelope<"entries">> {
  if (!isAbsolute(request.root)) return empty("entries", "failed", 2, "entries: root must be an absolute path");
  if (context.signal?.aborted) return empty("entries", "cancelled", null);
  context.onProgress?.({ text: "reading a fresh snapshot of the saved code" });
  let snapshot: Awaited<ReturnType<typeof analyze>>["snapshot"];
  try {
    snapshot = (await (context.analyze ?? analyze)({ root: request.root, withoutEvidence: true, saveFacts: true })).snapshot;
  } catch (error) {
    return empty("entries", "failed", 2, errorText(error));
  }
  if (context.signal?.aborted) return empty("entries", "cancelled", null);
  if (snapshot === null) return empty("entries", "failed", 2, "entries: no code to read (`languages` in keylang.json is empty)");
  const entries = snapshot.entries.filter((entry) => request.only === undefined || entry.kind === request.only);
  const text = entriesText(entries, request.only ?? null);
  const payload: EntriesPayload = { snapshotId: snapshot.snapshotId, kind: request.only ?? null, entries, text };
  return { ...empty("entries", "completed", 0), payload, messages: text.trimEnd().split("\n").map((line) => ({ level: "info" as const, text: line })) };
}

/** The table `keylang entries` prints: `kind · label · id · file:line`, aligned, and why when the config's class is not a fn keylang read; or the note and the hint when there is nothing. */
export function entriesText(entries: readonly EntryPoint[], kind: EntryPoint["kind"] | null = null): string {
  if (entries.length === 0) return `no entry points found${kind === null ? "" : ` of kind ${kind}`}\n${ENTRIES_HINT}\n`;
  const rows = entries.map((entry) => [entry.kind, entry.label, entry.id, `${entry.file}:${entry.line}${entry.unresolved ? `  unresolved: ${entry.unresolved}` : ""}`]);
  const widths = [0, 1, 2].map((column) => Math.max(...rows.map((row) => row[column]!.length)));
  return rows.map((row) => row.map((cell, column) => (column < 3 ? cell.padEnd(widths[column]!) : cell)).join("  ")).join("\n") + "\n";
}
