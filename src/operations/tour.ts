// `keylang tour [--out f] [--json]`, the MCP tool `project_tour`, the TUI's
// «Project tour» and the web page's «Огляд» (business-flows/15): one page
// for a newcomer over a fresh snapshot, read-only. One Markdown text for the
// CLI, the F6 report and `--out`; one JSON shape for `--json`, MCP and
// `/api/tour`. A view (ADR 0014): `--out` writes a generated file that
// `check` never reads, and refuses a place `check` would read as a spec.

import { isAbsolute, join } from "node:path";
import { analyze, specPathProblem, type Analysis } from "../analyze.ts";
import { errorText } from "../diag.ts";
import { existingText } from "../files.ts";
import { landing, safeWrite, targetProblem } from "../safe-write.ts";
import { buildTour, TOUR_MARK, tourMarkdown } from "../tour.ts";
import { empty } from "./shared.ts";
import type { OperationContext, OperationEnvelope, TourRequest } from "./types.ts";

/**
 * The tour over a fresh snapshot of the saved code and the hand-written
 * specs, written to `out` when the request names one. Code 0 with the tour;
 * 1 when `out` is a file someone wrote (no marker), nothing written; 2 with
 * no payload for a broken keylang.json, a repository without code, an
 * unreadable data file, or an `out` that is no place for it.
 */
export async function runTour(request: TourRequest, context: OperationContext): Promise<OperationEnvelope<"tour">> {
  if (!isAbsolute(request.root)) return empty("tour", "failed", 2, "tour: root must be an absolute path");
  if (context.signal?.aborted) return empty("tour", "cancelled", null);
  context.onProgress?.({ text: "reading a fresh snapshot of the saved code" });
  let analyzed: Analysis;
  try {
    analyzed = await (context.analyze ?? analyze)({ root: request.root, withoutEvidence: true, saveFacts: true });
  } catch (error) {
    return empty("tour", "failed", 2, `tour: ${errorText(error)}`);
  }
  if (context.signal?.aborted) return empty("tour", "cancelled", null);
  const snapshot = analyzed.snapshot;
  if (snapshot === null) return empty("tour", "failed", 2, "tour: no code to read (`languages` in keylang.json is empty)");
  const out = request.out;
  if (out !== undefined) {
    const problem = targetProblem(request.root, out) ?? (out.endsWith(".md") && specPathProblem(analyzed.config, join(request.root, out)) === null ? "check would read it as a spec; write the tour beside the specs (keylang/tour.md) or outside the spec directory" : null);
    if (problem !== null) return empty("tour", "failed", 2, `tour: ${out}: ${problem}`);
  }
  context.onProgress?.({ text: "putting the tour together: flows, coverage, integrations" });
  let text: string;
  let tour;
  try {
    tour = await buildTour({ config: analyzed.config, snapshot, spec: analyzed.spec });
    text = tourMarkdown(tour);
  } catch (error) {
    return empty("tour", "failed", 2, `tour: ${errorText(error)}`);
  }
  if (context.signal?.aborted) return empty("tour", "cancelled", null);
  const messages = text.trimEnd().split("\n").map((line) => ({ level: "info" as const, text: line }));
  if (out === undefined) return { ...empty("tour", "completed", 0), payload: { ...tour, text, out: null }, messages };
  const abs = landing(join(request.root, out));
  const current = abs === null ? null : existingText(abs);
  if (current !== null && !current.startsWith(TOUR_MARK)) return { ...empty("tour", "completed", 1), payload: { ...tour, text, out: null }, messages: [{ level: "error", text: `${out}: manual file without keylang:generated marker; nothing written` }] };
  const file = `${TOUR_MARK}\n\n${text}`;
  if (current !== null && current.replace(/\r\n/g, "\n") === file) return { ...empty("tour", "completed", 0), payload: { ...tour, text, out }, messages: [{ level: "info", text: `${out} is current` }] };
  try {
    await context.beforeCommit?.();
    if (context.signal?.aborted) return empty("tour", "cancelled", null);
    safeWrite(request.root, out, file, { generated: true, expect: current });
  } catch (error) {
    return empty("tour", "failed", 2, `tour: ${errorText(error)}`);
  }
  return { ...empty("tour", "completed", 0), payload: { ...tour, text, out }, messages: [{ level: "info", text: `wrote ${out}` }], written: [out] };
}
