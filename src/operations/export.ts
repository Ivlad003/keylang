// Exports: a finished report saved to one file, and a C4 diagram of the saved
// code (`export c4`).

import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, posix, relative, resolve } from "node:path";
import { analyze, type Analysis } from "../analyze.ts";
import { C4_FORMATS, C4_LEVELS, isC4Diagram, renderC4 } from "../c4-export.ts";
import { checkReportText } from "../check-format.ts";
import { CONFIG_FILE, parseConfig, toPosix } from "../config.ts";
import { errorText } from "../diag.ts";
import { explanationOf, loadBriefs } from "../explanations.ts";
import { existingText } from "../files.ts";
import { parseReportText } from "../parse-format.ts";
import { FACT_CACHE_FILE } from "../fact-cache.ts";
import { PROPOSALS_DIR } from "../proposals.ts";
import { EXPLAINED_MAP_DIR } from "../map.ts";
import { landing, safeWrite, writeAtomic, writeProblem } from "../safe-write.ts";
import { tracePlanText } from "../trace-plan.ts";
import type { CommitGate, ExportC4Payload, ExportC4Request, ExportFormat, ExportPayload, ExportRequest, ExportSource, OperationContext, OperationEnvelope } from "./types.ts";
import { empty, rootRelative } from "./shared.ts";

/** The format of an export: an explained edge has only the human lines, a trace plan only its JSON. */
export function exportFormatOf(source: ExportSource): ExportFormat {
  return source.kind === "explain-edge" ? "human" : source.kind === "trace-plan" ? "json" : source.format;
}

/** The bytes an export writes: the CLI's stdout for the same report. */
export function exportText(source: ExportSource): string {
  if (source.kind === "check") return checkReportText(source.format, source.report);
  if (source.kind === "parse") return parseReportText(source.format, source.documents);
  if (source.kind === "trace-plan") return tracePlanText(source.plan);
  return source.lines.map((line) => `${line}\n`).join("");
}

/**
 * Why `path` cannot receive an export, or null: the write policy of every
 * repository write (plain, relative, inside through links, no directory, no
 * file with a generation marker) and the artifacts generators own — the map,
 * the explained map, the index, the fact cache and the proposals — even
 * before they exist. `dir` is the spec directory of the caller's loaded
 * config (`Config.dir`); left out, the one the saved keylang.json names.
 * Reads only; a form may call it as the path is typed.
 */
export function exportTargetProblem(root: string, path: string, dir: string = savedSpecDir(root)): string | null {
  const problem = writeProblem(root, path);
  if (problem !== null) return problem;
  const target = landing(join(root, path));
  if (target === null) return "leads through a loop of links";
  const rel = toPosix(relative(realpathSync(root), target));
  // `posix.join`: a spec directory `.` owns `map/`, not `./map/`.
  const owned = [posix.join(dir, "map"), posix.join(dir, EXPLAINED_MAP_DIR), PROPOSALS_DIR].map((prefix) => `${prefix}/`);
  if (rel === ".keylang/index.json" || rel === FACT_CACHE_FILE || owned.some((prefix) => rel.startsWith(prefix))) return "a generated artifact: only its generator writes it";
  return null;
}

/**
 * The spec directory of the saved keylang.json as `loadConfig` reads it — the
 * same parser, so `./keylang` and `keylang/` are `keylang` — and `keylang`
 * without the file or with one that does not validate (as the TUI's own).
 */
function savedSpecDir(root: string): string {
  const file = join(root, CONFIG_FILE);
  try {
    return parseConfig(file, readFileSync(file, "utf8")).dir ?? "keylang";
  } catch {
    return "keylang";
  }
}

/**
 * Exports a finished report to one file. Nothing is computed again: the text
 * is the CLI's stdout for the request's report. After `beforeCommit` the
 * target must pass `exportTargetProblem` and still be the file the form
 * showed (`expect`); otherwise nothing is written (failed, 1). The write is
 * atomic, the exact bytes, with missing parent directories created (0; 2 on
 * an I/O error). Cancelled: null, nothing written.
 */
export async function runExport(request: ExportRequest, context: OperationContext): Promise<OperationEnvelope<"export">> {
  if (!isAbsolute(request.root)) return empty("export", "failed", 2, "export: root must be an absolute path");
  if (context.signal?.aborted) return empty("export", "cancelled", null);
  const text = exportText(request.source);
  const payload: ExportPayload = {
    path: request.path,
    format: exportFormatOf(request.source),
    source: request.source.kind,
    bytes: Buffer.byteLength(text, "utf8"),
    existed: request.expect !== null,
    written: false,
    refused: [],
    error: null,
  };
  context.onProgress?.({ text: "waiting to write" });
  try {
    await context.beforeCommit?.();
  } catch (error) {
    return { ...empty("export", "failed", 2, errorText(error)), payload };
  }
  if (context.signal?.aborted) return { ...empty("export", "cancelled", null), payload };
  let problem: string | null;
  try {
    problem = exportTargetProblem(request.root, request.path) ?? writeProblem(request.root, request.path, { expect: request.expect });
  } catch (error) {
    return { ...empty("export", "failed", 2, errorText(error)), payload };
  }
  if (problem !== null) {
    payload.refused = [`${request.path}: ${problem}`];
    return { ...empty("export", "failed", 1), payload, messages: [{ level: "error", text: payload.refused[0]! }, { level: "info", text: "nothing was written; export the report again to see the file as it is now" }] };
  }
  context.onProgress?.({ text: `writing ${request.path}` });
  try {
    const abs = landing(join(request.root, request.path));
    if (abs === null) throw new Error("leads through a loop of links");
    // The CLI's bytes: no CRLF carried over from a file it replaces.
    writeAtomic(abs, text, { exact: true });
  } catch (error) {
    payload.error = errorText(error);
    return { ...empty("export", "failed", 2), payload, messages: [{ level: "error", text: `${request.path}: ${payload.error}` }] };
  }
  payload.written = true;
  return { ...empty("export", "completed", 0), payload, messages: [{ level: "info", text: `${request.path}: written` }], written: [request.path] };
}

/**
 * Why `out` (as typed: relative to the root, or absolute) cannot receive a
 * diagram, the CLI's message, or null. The path policy of every write —
 * plain, relative, inside the repository through links, not a directory —
 * is checked before the target is read, as `wireOutProblem` does: a file
 * outside is never opened. A file there passes only as a diagram this
 * command wrote, which the operation checks once the path passes. Reads
 * nothing outside the repository; a form may call it as the path is typed.
 */
export function c4OutProblem(root: string, out: string): string | null {
  const path = rootRelative(root, out);
  try {
    const problem = writeProblem(root, path, { generated: true });
    return problem === null ? null : `export c4: --out ${out}: ${problem}; nothing written`;
  } catch (error) {
    return `export c4: --out ${out}: ${errorText(error)}`;
  }
}

/**
 * `keylang export c4` (c4-zoom/12): the diagram of the saved code and the
 * saved briefs, no model. With `out` it is written to that file, which must
 * pass the write policy (`c4OutProblem`, checked before the file is read)
 * and be new or a diagram this command wrote (its marker line); any other
 * file is 2 with nothing written. An unknown format, level or layer is 2.
 */
export async function runExportC4(request: ExportC4Request, context: OperationContext): Promise<OperationEnvelope<"export-c4">> {
  const { root } = request;
  if (!isAbsolute(root)) return empty("export-c4", "failed", 2, "export c4: root must be an absolute path");
  const format = C4_FORMATS.find((item) => item === request.format);
  if (format === undefined) return empty("export-c4", "failed", 2, `export c4: unknown --format \`${request.format}\`; expected ${C4_FORMATS.join(", ")}`);
  const level = C4_LEVELS.find((item) => item === request.level);
  if (level === undefined) return empty("export-c4", "failed", 2, `export c4: unknown --level \`${request.level}\`; expected ${C4_LEVELS.join(", ")}`);
  if (request.layer !== undefined && level !== "component") return empty("export-c4", "failed", 2, "export c4: --layer draws the components of one layer: use it with --level component");
  if (request.out !== undefined && request.out.trim() === "") return empty("export-c4", "failed", 2, "export c4: --out needs a file path");
  // Before the analysis, as `wire` does: a path the policy refuses costs nothing and is never read.
  const outProblem = request.out === undefined ? null : c4OutProblem(root, request.out);
  if (outProblem !== null) return empty("export-c4", "failed", 2, outProblem);
  if (context.signal?.aborted) return empty("export-c4", "cancelled", null);
  let analyzed: Analysis;
  try {
    analyzed = await (context.analyze ?? analyze)({ root, withoutEvidence: true });
  } catch (error) {
    return empty("export-c4", "failed", 2, errorText(error));
  }
  if (context.signal?.aborted) return empty("export-c4", "cancelled", null);
  const snapshot = analyzed.snapshot;
  if (!snapshot) return empty("export-c4", "failed", 2, "export c4: no supported source files to draw");
  const briefs = loadBriefs(analyzed.config);
  // A brief made for older code would describe what is no longer there: only current ones are drawn.
  const brief = (id: string): string | null => {
    const explained = explanationOf(snapshot, briefs, id);
    return explained !== null && !explained.stale ? explained.text : null;
  };
  let text: string;
  try {
    text = renderC4(snapshot, brief, { format, level, ...(request.layer !== undefined ? { layer: request.layer } : {}) });
  } catch (error) {
    return empty("export-c4", "failed", 2, errorText(error));
  }
  const payload: ExportC4Payload = { text, format, level, layer: request.layer ?? null, out: null };
  if (request.out === undefined) return { ...empty("export-c4", "completed", 0), payload };
  const out = rootRelative(root, request.out);
  // Checked again right before the read: a link may have changed during the analysis.
  const problem = c4OutProblem(root, request.out);
  if (problem !== null) return { ...empty("export-c4", "failed", 2, problem), payload };
  let current: string | null;
  try {
    current = existingText(resolve(root, out));
  } catch (error) {
    return { ...empty("export-c4", "failed", 2, `${out}: ${errorText(error)}`), payload };
  }
  if (current !== null && !isC4Diagram(current)) return { ...empty("export-c4", "failed", 2, `${out}: not a diagram \`keylang export c4\` wrote (no keylang:generated marker on its first line); nothing written`), payload };
  context.onProgress?.({ text: "waiting to write" });
  let gate: CommitGate;
  try {
    gate = await context.beforeCommit?.({ targets: [out] });
  } catch (error) {
    return { ...empty("export-c4", "failed", 2, errorText(error)), payload };
  }
  if (context.signal?.aborted) return { ...empty("export-c4", "cancelled", null), payload };
  if (gate && gate.refused.length > 0) return { ...empty("export-c4", "failed", 2), payload, messages: gate.refused.map((line) => ({ level: "error" as const, text: line })) };
  try {
    safeWrite(root, out, text, { generated: true, expect: current });
  } catch (error) {
    return { ...empty("export-c4", "failed", 2, errorText(error)), payload };
  }
  return { ...empty("export-c4", "completed", 0), payload: { ...payload, out }, written: [out], messages: [{ level: "info", text: `${out}: written` }] };
}
