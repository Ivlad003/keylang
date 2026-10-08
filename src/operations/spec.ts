// The operations on the saved specs and the code they describe: `fmt`,
// `parse`, `check`, `check --explain-edge` and `trace-plan`.

import { closeSync, existsSync, openSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { analyze, within, type Analysis } from "../analyze.ts";
import { filterChanged } from "../changed.ts";
import { checkExitCode, checkReport, type CheckCounts } from "../check-results.ts";
import { CONFIG_FILE, assertFormatOnly, loadConfig, resolveStatic, toPosix, type Config } from "../config.ts";
import { errorText, formatDiagnostic, isError } from "../diag.ts";
import { edgeExplanationLines, edgeIdKnown, explainEdge } from "../explain-edge.ts";
import { isStoredExplanation } from "../explanations.ts";
import { collectMdFiles } from "../files.ts";
import { formatSource } from "../fmt.ts";
import type { Document } from "../ir.ts";
import { parse } from "../parser.ts";
import { parseReportText } from "../parse-format.ts";
import { allCrlf, isGeneratedText, landing, writeAtomic } from "../safe-write.ts";
import { compareText } from "../span.ts";
import { changedPathSet, deletedModuleIds, gitChangedFiles, type ChangedFiles } from "../git-changes.ts";
import { readWeakenings, weakeningDiagnostic } from "../weakening.ts";
import { entryTracePlan, tracePlan, tracePlanText } from "../trace-plan.ts";
import type { ChangedSlice, CheckPayload, CheckRequest, ExplainEdgePayload, ExplainEdgeRequest, FmtFile, FmtPayload, FmtRequest, OperationContext, OperationEnvelope, OperationMessage, OperationStatus, ParsePayload, ParseRequest, TracePlanPayload, TracePlanRequest } from "./types.ts";
import { empty } from "./shared.ts";

/**
 * `keylang fmt [--check]` in two phases. Compute: every file is read and
 * formatted by `formatSource`; one that cannot be read, or whose tree shape
 * is ambiguous (K003), is reported and the rest go on; a saved explanation
 * and a generated file are skipped. A file with CRLF on every line is
 * canonical when its LF form is. Check stops here: code 1 for an unformatted
 * or invalid file, 2 when one cannot be read; nothing is written. Write,
 * after `beforeCommit`: each unformatted file in turn is written atomically
 * with the formatter's bytes (CRLF kept on a CRLF file), only inside the
 * repository with links followed and only while it still holds the text it
 * was formatted from — a target outside, a file changed meanwhile, or one
 * that cannot be written, fails on its own and the rest are still written.
 * Code 2 over 1 over 0, as the CLI has it; null when cancelled (the files
 * written by then are named).
 */
export async function runFmt(request: FmtRequest, context: OperationContext): Promise<OperationEnvelope<"fmt">> {
  if (!isAbsolute(request.root)) return empty("fmt", "failed", 2, "fmt: root must be an absolute path");
  const base = request.base ?? request.root;
  if (!isAbsolute(base)) return empty("fmt", "failed", 2, "fmt: base must be an absolute path");
  if (request.paths.length === 0) return empty("fmt", "failed", 2, "fmt: needs at least one path");
  if (context.signal?.aborted) return empty("fmt", "cancelled", null);
  const planned: { file: FmtFile; abs: string; source: string; text: string }[] = [];
  const files: FmtFile[] = [];
  try {
    // `fmt` reads nothing of the config but the edition it asks for.
    const config = join(request.root, CONFIG_FILE);
    if (existsSync(config)) assertFormatOnly(config, readFileSync(config, "utf8"));
    context.onProgress?.({ text: "reading the files" });
    for (const shown of collectMdFiles(request.paths, base)) {
      const abs = resolve(base, shown);
      const file: FmtFile = { shown, path: toPosix(relative(request.root, abs)), state: "current" };
      files.push(file);
      let source: string;
      try {
        source = readFileSync(abs, "utf8");
      } catch (error) {
        file.state = "unreadable";
        file.error = errorText(error);
        continue;
      }
      // The model's text is kept as it was written: formatting it would change a saved answer.
      if (isStoredExplanation(source)) {
        file.state = "explanation";
        continue;
      }
      // A generated file is its generator's, as for every writer of keylang: named, never rewritten.
      if (isGeneratedText(source)) {
        file.state = "generated";
        const generator = generatorCommand(source);
        if (generator !== null) file.generator = generator;
        continue;
      }
      const formatted = formatSource(shown, source);
      if (!formatted.ok) {
        file.state = "invalid";
        file.diagnostics = formatted.diagnostics;
      } else if (formatted.text !== source && !(allCrlf(source) && formatted.text === source.replace(/\r\n/g, "\n"))) {
        file.state = "stale";
        planned.push({ file, abs, source, text: formatted.text });
      }
    }
  } catch (error) {
    return empty("fmt", "failed", 2, errorText(error));
  }
  const payload: FmtPayload = { check: request.check, files };
  const finish = (status: OperationStatus, written: string[]): OperationEnvelope<"fmt"> => {
    const failed = files.some((file) => file.state === "unreadable" || file.state === "failed");
    const findings = files.some((file) => file.state === "invalid" || file.state === "stale");
    const code = failed ? 2 : findings ? 1 : 0;
    return { ...empty("fmt", status === "completed" && failed ? "failed" : status, status === "cancelled" ? null : code), payload, messages: fmtMessages(payload), written };
  };
  if (context.signal?.aborted) return finish("cancelled", []);
  if (request.check || planned.length === 0) return finish("completed", []);
  context.onProgress?.({ text: "waiting to write" });
  try {
    await context.beforeCommit?.();
  } catch (error) {
    const stopped = finish("failed", []);
    return { ...stopped, exitCode: 2, messages: [...stopped.messages, { level: "error", text: errorText(error) }] };
  }
  if (context.signal?.aborted) return finish("cancelled", []);
  const written: string[] = [];
  let cancelled = false;
  for (const step of planned) {
    if (cancelled || context.signal?.aborted) {
      cancelled = true;
      step.file.state = "not-attempted";
      continue;
    }
    context.onProgress?.({ text: `writing ${step.file.path}` });
    try {
      commitFormatted(request.root, step.abs, step.source, step.text);
      step.file.state = "formatted";
      written.push(step.file.path);
    } catch (error) {
      step.file.state = "failed";
      step.file.error = errorText(error);
    }
  }
  return finish(cancelled ? "cancelled" : "completed", written);
}

/**
 * Writes one formatted file under the write policy of every writer
 * (`safe-write.ts`): only where the bytes land inside the repository with
 * every link followed, atomically at that target, with the formatter's
 * bytes in the file's own line ends (CRLF on every line stays CRLF), and
 * only when the file still holds `source`. A file that cannot be written in
 * place (read-only) is not replaced by the rename either.
 */
function commitFormatted(root: string, abs: string, source: string, text: string): void {
  const target = landing(abs);
  if (target === null) throw new Error("leads through a loop of links");
  if (!within(target, realpathSync(root))) throw new Error(within(abs, root) ? "leads out of the repository through a link" : "outside the repository");
  if (readFileSync(target, "utf8") !== source) throw new Error("changed on disk while it was formatted; nothing written");
  closeSync(openSync(target, "r+"));
  writeAtomic(target, text);
}

/** The command a generation marker names (`keylang map`), or null. */
function generatorCommand(source: string): string | null {
  const marker = source.replace(/^\uFEFF/, "").split(/\r?\n/).find((line) => line.trim() !== "") ?? "";
  return /`(keylang [^`]+)`/.exec(marker)?.[1] ?? null;
}

/** `keylang/map/app.md: a generated file, not formatted; \`keylang map\` writes it`: how fmt names a generated file it leaves. */
export function fmtGeneratedNote(file: FmtFile): string {
  return `${file.shown}: a generated file, not formatted; ${file.generator === undefined ? "only its generator writes it" : `\`${file.generator}\` writes it`}`;
}

/**
 * The report, file by file in path order: `info` is what `keylang fmt`
 * prints to stdout, `error` what it prints to stderr; a `warning` names a
 * skipped explanation, which the CLI passes over silently, or a skipped
 * generated file, which the CLI notes on stderr.
 */
export function fmtMessages(payload: FmtPayload): OperationMessage[] {
  const out: OperationMessage[] = [];
  for (const file of payload.files) {
    if (file.state === "stale") out.push({ level: payload.check ? "info" : "error", text: payload.check ? `${file.shown}: not formatted` : `${file.shown}: not written` });
    else if (file.state === "formatted") out.push({ level: "info", text: `${file.shown}: formatted` });
    else if (file.state === "invalid") for (const d of file.diagnostics ?? []) out.push({ level: "error", text: formatDiagnostic(d) });
    else if (file.state === "unreadable") out.push({ level: "error", text: `${file.shown}: cannot read: ${file.error}` });
    else if (file.state === "failed") out.push({ level: "error", text: `${file.shown}: cannot write: ${file.error}` });
    else if (file.state === "not-attempted") out.push({ level: "warning", text: `${file.shown}: not written (cancelled)` });
    else if (file.state === "explanation") out.push({ level: "warning", text: `${file.shown}: a saved explanation, not keylang Markdown; skipped` });
    else if (file.state === "generated") out.push({ level: "warning", text: fmtGeneratedNote(file) });
  }
  return out;
}

/**
 * `keylang check` on the saved files: the paths (the spec directory by
 * default), the static mode (request, then keylang.json, then `behavior`)
 * and `strict`. Code 1 for a failure, or with `strict` for an unverified
 * verdict; an unverified one without `strict` is code 0 and stays in the
 * report. Code 2 for a broken config or a missing path. With `changed` the
 * report is the git slice of the full analysis (`check --changed`); without
 * git, outside a repository or with an unknown ref it is code 2. It writes
 * nothing but the local fact cache (`saveFacts`: best-effort, only when the
 * facts changed, never named in `written`), so the next run parses only
 * what changed.
 */
export async function runCheck(request: CheckRequest, context: OperationContext): Promise<OperationEnvelope<"check">> {
  if (!isAbsolute(request.root)) return empty("check", "failed", 2, "check: root must be an absolute path");
  const base = request.base ?? request.root;
  if (!isAbsolute(base)) return empty("check", "failed", 2, "check: base must be an absolute path");
  if (context.signal?.aborted) return empty("check", "cancelled", null);
  let config: Config;
  try {
    config = loadConfig(request.root);
  } catch (error) {
    return empty("check", "failed", 2, errorText(error));
  }
  const specDir = join(request.root, config.dir);
  if (request.paths.length === 0 && !existsSync(specDir)) return empty("check", "failed", 2, `no \`${config.dir}/\` directory here; run \`keylang init\` or pass paths`);
  const specs = request.paths.length > 0 ? request.paths.map((path) => resolve(base, path)) : [specDir];
  for (const spec of specs) if (!existsSync(spec)) return empty("check", "failed", 2, `${relative(base, spec) || spec}: not found`);
  if (request.since !== undefined && request.changed !== true) return empty("check", "failed", 2, "check: --since requires --changed");
  if (request.acceptWeakening === true && request.changed !== true) return empty("check", "failed", 2, "check: --accept-weakening requires --changed");
  // The git slice is read before the analysis: without git or with an unknown ref the check fails, it never falls back to a full one.
  const since = request.since ?? "HEAD";
  let git: ChangedFiles | null = null;
  if (request.changed === true) {
    try {
      git = gitChangedFiles(request.root, since);
    } catch (error) {
      return empty("check", "failed", 2, errorText(error));
    }
  }
  // Specs outside the repository's spec directory (examples, a slide) have no code to check against.
  const withoutCode = !specs.every((spec) => within(spec, specDir));
  const display = (abs: string): string => toPosix(relative(base, abs));
  context.onProgress?.({ text: "checking the saved specs against the code" });
  // A named hook default: the static evidence of `keylang check` follows it to `analyze`.
  const analyzeSaved = context.analyze ?? analyze;
  let analyzed: Analysis;
  try {
    analyzed = await analyzeSaved({
      root: request.root,
      specs,
      display,
      saveFacts: true,
      ...(request.static ? { static: request.static } : {}),
      ...(withoutCode ? { withoutCode: true } : {}),
    });
  } catch (error) {
    return empty("check", "failed", 2, errorText(error));
  }
  if (context.signal?.aborted) return empty("check", "cancelled", null);
  const snapshotId = analyzed.snapshot?.snapshotId ?? null;
  const full = checkReport(analyzed.verdicts, snapshotId, analyzed.diagnostics);
  let report = full;
  let changed: ChangedSlice | null = null;
  if (git !== null) {
    // The whole analysis, then the slice: only findings that touch the changed files stay.
    const deleted = deletedModuleIds(config, git.deleted);
    const filtered = filterChanged(
      { docs: analyzed.docs, spec: analyzed.spec, diagnostics: analyzed.diagnostics, verdicts: analyzed.verdicts, nodes: analyzed.snapshot?.nodes ?? {}, edges: analyzed.snapshot?.edges ?? [] },
      changedPathSet(request.root, git.paths, base),
      deleted,
    );
    // The spec weakened since the same ref (K108): a finding of the slice, unless a person accepts it.
    const weakening = readWeakenings(analyzed.config, since, "check --changed");
    const weakened = weakening.weakenings.map((item) => weakeningDiagnostic(item, (path) => display(join(request.root, path))));
    const accept = request.acceptWeakening === true;
    const sliced = checkReport(filtered.verdicts, snapshotId, filtered.diagnostics);
    report = accept || weakened.length === 0 ? sliced : checkReport(filtered.verdicts, snapshotId, [...weakened, ...filtered.diagnostics]);
    changed = {
      since,
      unborn: git.unborn,
      files: [...git.paths].sort(compareText),
      deleted,
      shown: report.results.length,
      hidden: full.results.length - sliced.results.length,
      weakening: { accepted: accept ? weakened.map(formatDiagnostic) : [], note: weakening.note },
    };
  }
  const mode = resolveStatic(request.static, analyzed.config.check.static);
  const payload: CheckPayload = {
    results: report.results,
    snapshotId,
    coverage: analyzed.snapshot?.coverage ?? [],
    lines: report.lines,
    counts: report.counts,
    options: {
      paths: specs.map((spec) => display(spec) || "."),
      strict: request.strict,
      static: mode.mode,
      staticFrom: mode.setBy === "flag" ? "request" : (mode.setBy ?? "default"),
      withoutCode,
    },
    notSpecs: analyzed.notSpecs,
    changed,
  };
  const messages: OperationMessage[] = [
    ...payload.notSpecs.map((path) => ({ level: "warning" as const, text: checkSkipNote(path) })),
    ...payload.lines.map((text) => ({ level: "info" as const, text })),
    { level: "info", text: checkSummary(payload.counts) },
  ];
  return { ...empty("check", "completed", checkExitCode(payload.counts, request.strict)), payload, messages };
}

/** The note on a path that holds no specs, as the CLI writes it after `keylang: `. */
export function checkSkipNote(path: string): string {
  return `note: ${path}: the explained map and saved explanations are not specs; skipped`;
}

/**
 * The CLI's closing line on stderr: `0 fail, 2 unverified, 5 ok`. Once two
 * unverified verdicts name one hole, the line says how many holes they come
 * from: `0 fail, 8 unverified (from 2 holes), 71 ok`, and `9 unverified
 * (8 from 2 holes)` when the others name no hole.
 */
export function checkSummary(counts: CheckCounts): string {
  const holes = counts.holes;
  const from = holes === undefined ? "" : ` (${holes.unverified === counts.unverified ? "" : `${holes.unverified} `}from ${holes.holes} hole${holes.holes === 1 ? "" : "s"})`;
  return `${counts.fail} fail, ${counts.unverified} unverified${from}, ${counts.ok} ok`;
}

/**
 * `keylang check --explain-edge <from> <to>` on the saved code: a fresh
 * analysis without specs, then the edges between the ids. Code 0 whether or
 * not there is an edge; code 2 for a broken config, no snapshot or an
 * unknown id (an unknown tail under a known module included). A message after
 * the error may suggest a near id; the CLI prints only the error. Writes
 * nothing, not even the fact cache.
 */
export async function runExplainEdge(request: ExplainEdgeRequest, context: OperationContext): Promise<OperationEnvelope<"explain-edge">> {
  if (!isAbsolute(request.root)) return empty("explain-edge", "failed", 2, "check --explain-edge: root must be an absolute path");
  if (context.signal?.aborted) return empty("explain-edge", "cancelled", null);
  context.onProgress?.({ text: "reading the edges of the saved code" });
  const analyzeSaved = context.analyze ?? analyze;
  let analyzed: Analysis;
  try {
    analyzed = await analyzeSaved({ root: request.root, specs: [] });
  } catch (error) {
    return empty("explain-edge", "failed", 2, errorText(error));
  }
  if (context.signal?.aborted) return empty("explain-edge", "cancelled", null);
  const { snapshot } = analyzed;
  if (!snapshot) return empty("explain-edge", "failed", 2, "no snapshot; run inside a repository with sources");
  for (const id of [request.from, request.to]) {
    if (edgeIdKnown(snapshot, id)) continue;
    const near = analyzed.index.suggest(id);
    const failed = empty("explain-edge", "failed", 2, `unknown id \`${id}\``);
    return near === undefined ? failed : { ...failed, messages: [...failed.messages, { level: "info", text: `did you mean \`${near}\`?` }] };
  }
  const explanation = explainEdge(snapshot, request.from, request.to);
  const payload: ExplainEdgePayload = { ...explanation, snapshotId: snapshot.snapshotId, lines: edgeExplanationLines(explanation) };
  return { ...empty("explain-edge", "completed", 0), payload, messages: payload.lines.map((text) => ({ level: "info" as const, text })) };
}

/**
 * `keylang parse`: every Markdown file under the paths, in their order, into
 * the Text IR. The parser alone runs — no snapshot of the code, no rules.
 * Messages: a `warning` note per skipped explanation, then each diagnostic
 * by its severity, and an `error` `<file>: cannot read: <reason>` per file it
 * could not read — all of which the CLI prints to stderr. Code 2 when a file
 * could not be read (it is still parsed as empty text, so the payload shows
 * the rest), else 1 when a diagnostic is an error, else 0; 2 for a missing
 * path or an edition this keylang cannot read, with no payload.
 */
export async function runParse(request: ParseRequest, context: OperationContext): Promise<OperationEnvelope<"parse">> {
  if (!isAbsolute(request.root)) return empty("parse", "failed", 2, "parse: root must be an absolute path");
  const base = request.base ?? request.root;
  if (!isAbsolute(base)) return empty("parse", "failed", 2, "parse: base must be an absolute path");
  if (request.paths.length === 0) return empty("parse", "failed", 2, "parse: at least one path is required");
  if (context.signal?.aborted) return empty("parse", "cancelled", null);
  const documents: Document[] = [];
  const skipped: string[] = [];
  const unreadable: string[] = [];
  const readErrors: OperationMessage[] = [];
  const messages: OperationMessage[] = [];
  try {
    // `parse` reads nothing of the config but the edition it asks for.
    const config = join(request.root, CONFIG_FILE);
    if (existsSync(config)) assertFormatOnly(config, readFileSync(config, "utf8"));
    context.onProgress?.({ text: "parsing the files" });
    for (const file of collectMdFiles(request.paths, base)) {
      let text: string;
      try {
        text = readFileSync(resolve(base, file), "utf8");
      } catch (error) {
        unreadable.push(file);
        readErrors.push({ level: "error", text: `${file}: cannot read: ${errorText(error)}` });
        text = "";
      }
      if (isStoredExplanation(text)) {
        skipped.push(file);
        messages.push({ level: "warning", text: `note: ${file}: a saved explanation, not keylang Markdown; skipped` });
      } else documents.push(parse(file, text));
    }
  } catch (error) {
    return empty("parse", "failed", 2, errorText(error));
  }
  if (context.signal?.aborted) return empty("parse", "cancelled", null);
  const diagnostics = documents.flatMap((doc) => doc.diagnostics);
  messages.push(...readErrors);
  for (const d of diagnostics) messages.push({ level: isError(d) ? "error" : "warning", text: formatDiagnostic(d) });
  const payload: ParsePayload = { format: request.format, documents, skipped, unreadable, diagnostics, text: parseReportText(request.format, documents) };
  // An unreadable file is an I/O error, as in `fmt` and `check`: not a valid empty document.
  const exitCode = unreadable.length > 0 ? 2 : diagnostics.some(isError) ? 1 : 0;
  return { ...empty("parse", "completed", exitCode), payload, messages };
}

/**
 * `keylang trace-plan <flow>`: the flow's `trigger` and `step` IDs from the
 * saved specs, then a fresh snapshot of the saved code — never the session's
 * or a cached index. With `entry` (`trace-plan --entry <id>`): the fns
 * reachable from that fn (`reachableFrom`), named `flow` or the entry's last
 * segment. Nothing is written and nothing is run. Code 0 with the plan; 2
 * with no payload for a missing name, an unknown flow or entry or a broken
 * keylang.json, with the CLI's message.
 */
export async function runTracePlan(request: TracePlanRequest, context: OperationContext): Promise<OperationEnvelope<"trace-plan">> {
  if (!isAbsolute(request.root)) return empty("trace-plan", "failed", 2, "trace-plan: root must be an absolute path");
  if (request.flow === "" && request.entry === undefined) return empty("trace-plan", "failed", 2, "trace-plan: a flow name is required");
  if (request.entry === "") return empty("trace-plan", "failed", 2, "trace-plan: --entry needs a fn id");
  if (context.signal?.aborted) return empty("trace-plan", "cancelled", null);
  context.onProgress?.({ text: request.entry === undefined ? "reading the flow and a fresh snapshot of the saved code" : "a fresh snapshot of the saved code and what the entry reaches" });
  let found: Awaited<ReturnType<typeof tracePlan>>;
  try {
    found = request.entry === undefined ? await tracePlan(loadConfig(request.root), request.flow) : await entryTracePlan(loadConfig(request.root), request.entry, request.flow);
  } catch (error) {
    return empty("trace-plan", "failed", 2, errorText(error));
  }
  if (context.signal?.aborted) return empty("trace-plan", "cancelled", null);
  const { plan, omitted } = found;
  const payload: TracePlanPayload = { plan, omitted, text: tracePlanText(plan) };
  return { ...empty("trace-plan", "completed", 0), payload, messages: [{ level: "info", text: `flow ${plan.flow}: ${plan.symbols.length} function(s) to instrument on snapshot ${plan.snapshotId}` }] };
}
