// `keylang migration status [--from <old>] [--json]`, the MCP tool
// `migration_status` and the TUI's «Migration status» (business-flows/27):
// every flow of the old stack against this repository through the rows of
// `# migration`, as `ok`/`fail`/`unverified`, and what is not carried over
// yet. One text for the CLI and the F6 report, one JSON shape for `--json`
// and MCP. Read-only: the old repository is analysed without writing.

import { isAbsolute } from "node:path";
import { analyze, type Analysis } from "../analyze.ts";
import { errorText } from "../diag.ts";
import { migrationRows, migrationStatus, migrationStatusText } from "../migration.ts";
import { fromLabel, loadOldStack, resolveFrom, stackOf } from "../migration-stack.ts";
import { empty } from "./shared.ts";
import type { MigrationStatusPayload, MigrationStatusRequest, OperationContext, OperationEnvelope } from "./types.ts";

/**
 * The parity over a fresh analysis of this repository and the old stack.
 * Code 0 when no flow fails, 1 when one does; 2 with no payload for a broken
 * keylang.json, no old stack named, or one that cannot be read.
 */
export async function runMigrationStatus(request: MigrationStatusRequest, context: OperationContext): Promise<OperationEnvelope<"migration-status">> {
  if (!isAbsolute(request.root)) return empty("migration-status", "failed", 2, "migration status: root must be an absolute path");
  if (context.signal?.aborted) return empty("migration-status", "cancelled", null);
  context.onProgress?.({ text: "reading a fresh snapshot of the saved code" });
  let analysis: Analysis;
  try {
    analysis = await (context.analyze ?? analyze)({ root: request.root, saveFacts: true, withoutMigration: true });
  } catch (error) {
    return empty("migration-status", "failed", 2, `migration status: ${errorText(error)}`);
  }
  if (context.signal?.aborted) return empty("migration-status", "cancelled", null);
  if (analysis.snapshot === null) return empty("migration-status", "failed", 2, "migration status: no code to read (`languages` in keylang.json is empty)");
  const from = request.from ?? analysis.config.migration.from;
  if (from === null) return empty("migration-status", "failed", 2, "migration status: no old stack: pass `--from <old index.json|old repository>` or set `migration.from` in keylang.json");
  const abs = resolveFrom(request.root, from);
  try {
    context.onProgress?.({ text: `reading the old stack ${fromLabel(request.root, abs)} (read-only)` });
    const old = await loadOldStack(abs);
    if (context.signal?.aborted) return empty("migration-status", "cancelled", null);
    context.onProgress?.({ text: "comparing the flows of both stacks" });
    const current = await stackOf(analysis);
    const status = migrationStatus({ from: fromLabel(request.root, abs), old: old.stack, current, rows: migrationRows(analysis.docs), notes: old.notes });
    const text = migrationStatusText(status);
    const payload: MigrationStatusPayload = { ...status, text };
    return { ...empty("migration-status", "completed", status.counts.fail > 0 ? 1 : 0), payload, messages: text.trimEnd().split("\n").map((line) => ({ level: "info" as const, text: line })) };
  } catch (error) {
    return empty("migration-status", "failed", 2, `migration status: ${errorText(error)}`);
  }
}
