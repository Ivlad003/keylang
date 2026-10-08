// `keylang export bpmn|drawio` and `keylang import drawio`
// (business-flows/28): the picture `/diagrams` draws, written for other
// tools, and a draw.io drawing read back as one proposal for one flow. The
// renderers are pure (`src/bpmn-export.ts`, `src/drawio.ts`); here are the
// analysis, the view names, the write policy of `--out` and the proposal.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { analyze, type Analysis } from "../analyze.ts";
import { renderBpmn } from "../bpmn-export.ts";
import { checkResults } from "../check-results.ts";
import { toPosix } from "../config.ts";
import { errorText } from "../diag.ts";
import type { DiagramInput, DiagramProcess, DiagramResult, DiagramView } from "../diagram.ts";
import { PROCESSES_FILE, processViews, readProcesses } from "../discover-names.ts";
import { withFlow } from "../draft.ts";
import { drawioFlowName, flowFromDrawio, flowSection, parseDrawio, renderDrawio } from "../drawio.ts";
import { existingText } from "../files.ts";
import { DISCOVERED_FLOWS_DIR, sourceInputs } from "../map.ts";
import { parse } from "../parser.ts";
import { lineDiff, PROPOSALS_DIR, proposalProblem } from "../proposals.ts";
import { safeWrite, writeProblem } from "../safe-write.ts";
import { compileSpec, type SpecIR } from "../spec-ir.ts";
import { commitProposal, generatedIn, proposalRefusal, rootRelative } from "./shared.ts";
import type { OperationContext } from "./types.ts";

export const DIAGRAM_FORMATS = ["bpmn", "drawio"] as const;
export type DiagramFormat = (typeof DIAGRAM_FORMATS)[number];

/** A view to export: what `diagramOf` draws, whether it comes from the discovered view, and its name (`flow:checkout`). */
export interface ExportView {
  view: DiagramView;
  discovered: boolean;
  name: string;
}

/**
 * A view as the CLI names it: `<flow>` or `flow:<name>`, `discovered:<name>`,
 * `process:<domain>`, `entry:<id>`, `layers`; or why it names none.
 */
export function parseExportView(text: string): ExportView | string {
  const at = text.indexOf(":");
  const kind = at === -1 ? (text === "layers" ? "layers" : "flow") : text.slice(0, at);
  const value = at === -1 ? text : text.slice(at + 1);
  if (kind === "layers") return { view: { kind: "layers" }, discovered: false, name: "layers" };
  if (value.trim() === "") return `a view needs a name: ${kind}:<name>`;
  switch (kind) {
    case "flow":
      return { view: { kind: "flow", name: value }, discovered: false, name: `flow:${value}` };
    case "discovered":
      return { view: { kind: "flow", name: value }, discovered: true, name: `discovered:${value}` };
    case "process":
      return { view: { kind: "process", domain: value }, discovered: false, name: `process:${value}` };
    case "entry":
      return { view: { kind: "entry", id: value }, discovered: false, name: `entry:${value}` };
    default:
      // A flow whose name has a colon.
      return { view: { kind: "flow", name: text }, discovered: false, name: `flow:${text}` };
  }
}

/** A view from the query of `GET /api/export` — the query `/api/diagram` takes (`view=flow&name=…`, `view=discovered&name=…`, `view=process&domain=…`, `view=entry&id=…`, `view=layers`) — or why it names none. */
export function exportViewOfQuery(query: URLSearchParams): ExportView | string {
  const need = (name: string): string | null => {
    const value = query.get(name);
    return value === null || value === "" ? null : value;
  };
  const view = query.get("view");
  if (view === "layers") return parseExportView("layers");
  const value = view === "process" ? (need("domain") ?? need("name")) : view === "entry" ? need("id") : need("name");
  if (view !== "flow" && view !== "discovered" && view !== "process" && view !== "entry") return "unknown view: expected one of flow, discovered, process, entry, layers";
  if (value === null) return `view=${view} needs ${view === "process" ? "domain" : view === "entry" ? "id" : "name"}=`;
  return parseExportView(`${view}:${value}`);
}

/** The discovered view (`<dir>/flows-discovered/*.md`, the README of the processes aside) parsed as specs, or null without it. */
export function discoveredSpecOf(root: string, specDir: string): SpecIR | null {
  const dir = join(root, specDir, DISCOVERED_FLOWS_DIR);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".md") && name !== PROCESSES_FILE)
    .sort()
    .map((name) => join(dir, name));
  return compileSpec(files.map((file) => parse(toPosix(relative(root, file)), readFileSync(file, "utf8")))).spec;
}

/** What a diagram is drawn from, as the API and the CLI read it. */
export interface ExportSources {
  snapshot: Analysis["snapshot"];
  spec: SpecIR;
  discovered: SpecIR | null;
  results: readonly DiagramResult[];
  processes: readonly DiagramProcess[];
}

/** The sources of an analysis: check results as verdicts, the saved business processes found again in its snapshot. */
export function exportSourcesOf(analysis: Analysis, discovered: SpecIR | null): ExportSources {
  const results = checkResults(analysis.verdicts, analysis.snapshot?.snapshotId ?? null, analysis.diagnostics);
  const processes = analysis.snapshot ? processViews(analysis.snapshot, analysis.spec, readProcesses(analysis.config.root, analysis.config.dir)) : [];
  return { snapshot: analysis.snapshot, spec: analysis.spec, discovered, results, processes };
}

/** The bytes of one export. A discovered flow is drawn from the discovered view, without verdicts (`check` does not judge it). Throws with the CLI's message. */
export function diagramExportText(format: DiagramFormat, view: ExportView, sources: ExportSources): string {
  if (view.discovered && sources.discovered === null) throw new Error(`export ${format}: no discovered flows: run \`keylang flows discover\``);
  const input: DiagramInput = view.discovered
    ? { snapshot: sources.snapshot, spec: sources.discovered!, results: [], view: view.view }
    : { snapshot: sources.snapshot, spec: sources.spec, results: sources.results, view: view.view, processes: sources.processes };
  if (format === "drawio") return renderDrawio(input, view.name);
  const v = view.view;
  return renderBpmn(input, v.kind === "flow" ? v.name : v.kind === "process" ? v.domain : v.kind === "entry" ? v.id : view.name);
}

/** A file one of these exports wrote: `exporter="keylang"` (BPMN) or `<mxfile host="keylang"` (draw.io) near its start. */
export function isDiagramExport(text: string): boolean {
  const head = text.slice(0, 2000);
  return /<bpmn:definitions\b[^>]*\bexporter="keylang"/.test(head) || /<mxfile\s+host="keylang"/.test(head);
}

export interface DiagramExportRequest {
  root: string;
  format: string;
  view: string;
  /** Relative to the root, or absolute inside it; without it the text is the result. */
  out?: string;
}

export interface DiagramExportResult {
  exitCode: 0 | 2;
  text: string | null;
  out: string | null;
  error: string | null;
}

function failed(error: string): DiagramExportResult {
  return { exitCode: 2, text: null, out: null, error };
}

/**
 * `keylang export bpmn|drawio <view> [--out f]`: the diagram of the saved
 * code and specs, no model. `--out` must pass the write policy and be new or
 * a file one of these exports wrote; otherwise 2 with nothing written.
 */
export async function runDiagramExport(request: DiagramExportRequest, context: OperationContext = {}): Promise<DiagramExportResult> {
  const { root } = request;
  if (!isAbsolute(root)) return failed("export: root must be an absolute path");
  const format = DIAGRAM_FORMATS.find((item) => item === request.format);
  if (format === undefined) return failed(`export: unknown format \`${request.format}\`; expected c4, ${DIAGRAM_FORMATS.join(", ")}`);
  const view = parseExportView(request.view);
  if (typeof view === "string") return failed(`export ${format}: ${view}`);
  if (request.out !== undefined && request.out.trim() === "") return failed(`export ${format}: --out needs a file path`);
  const outProblem = (): string | null => {
    if (request.out === undefined) return null;
    try {
      const problem = writeProblem(root, rootRelative(root, request.out), { generated: true });
      return problem === null ? null : `export ${format}: --out ${request.out}: ${problem}; nothing written`;
    } catch (error) {
      return `export ${format}: --out ${request.out}: ${errorText(error)}`;
    }
  };
  const before = outProblem();
  if (before !== null) return failed(before);
  let analyzed: Analysis;
  try {
    analyzed = await (context.analyze ?? analyze)({ root });
  } catch (error) {
    return failed(errorText(error));
  }
  let text: string;
  try {
    const discovered = view.discovered ? discoveredSpecOf(root, rootRelative(root, analyzed.config.dir)) : null;
    text = diagramExportText(format, view, exportSourcesOf(analyzed, discovered));
  } catch (error) {
    return failed(errorText(error));
  }
  if (request.out === undefined) return { exitCode: 0, text, out: null, error: null };
  const out = rootRelative(root, request.out);
  const again = outProblem();
  if (again !== null) return { ...failed(again), text };
  let current: string | null;
  try {
    current = existingText(join(root, out));
  } catch (error) {
    return { ...failed(`${out}: ${errorText(error)}`), text };
  }
  if (current !== null && !isDiagramExport(current)) return { ...failed(`${out}: not a diagram \`keylang export ${format}\` wrote; nothing written`), text };
  try {
    safeWrite(root, out, text, { generated: true, expect: current });
  } catch (error) {
    return { ...failed(errorText(error)), text };
  }
  return { exitCode: 0, text, out, error: null };
}

export interface ImportDrawioRequest {
  root: string;
  /** The `.drawio` file, absolute. */
  file: string;
  /** The spec to propose the flow for; default: the flow's own file, or `<dir>/flows/<name>.md` for a new flow. */
  into?: string;
  /** Print the change, write nothing. */
  print?: boolean;
}

export interface ImportDrawioResult {
  exitCode: 0 | 1 | 2;
  flow: string | null;
  target: string | null;
  /** The change as `lineDiff` shows it; null when the drawing changes nothing. */
  diff: string | null;
  proposal: string | null;
  messages: { level: "info" | "error"; text: string }[];
}

/**
 * `keylang import drawio <file> [--into spec.md] [--print]`: the drawing as
 * ONE proposal for the flow it draws (`keylang_view` `flow:<name>` or
 * `discovered:<name>`). The flow's section is edited as the drawing asks
 * (`flowFromDrawio`) and compared with the section as it is: no change, no
 * proposal (0). Otherwise the full text of the target is proposed through the
 * gates every proposal passes (`proposalRefusal`, `commitProposal`): a target
 * a proposal may not change, a store link out — 2; a proposal already waiting
 * — 1, nothing written.
 */
export async function runImportDrawio(request: ImportDrawioRequest, context: OperationContext = {}): Promise<ImportDrawioResult> {
  const { root } = request;
  const result: ImportDrawioResult = { exitCode: 2, flow: null, target: null, diff: null, proposal: null, messages: [] };
  const fail = (text: string, exitCode: 1 | 2 = 2): ImportDrawioResult => ({ ...result, exitCode, messages: [...result.messages, { level: "error", text }] });
  if (!isAbsolute(root) || !isAbsolute(request.file)) return fail("import drawio: root and file must be absolute paths");
  let model;
  try {
    model = parseDrawio(readFileSync(request.file, "utf8"));
  } catch (error) {
    return fail(`import drawio: ${request.file}: ${errorText(error)}`);
  }
  const name = drawioFlowName(model);
  if (name === null) return fail(`import drawio: ${request.file}: draws ${model.view === null ? "no keylang view" : `\`${model.view}\``}, not a flow; export a flow with \`keylang export drawio <flow>\``);
  result.flow = name;
  let analyzed: Analysis;
  try {
    analyzed = await (context.analyze ?? analyze)({ root, withoutEvidence: true });
  } catch (error) {
    return fail(errorText(error));
  }
  const specDir = rootRelative(root, analyzed.config.dir);
  const flow = analyzed.spec.flows.find((f) => f.name === name) ?? null;
  const into = request.into === undefined ? undefined : rootRelative(root, request.into);
  let target: string;
  let before: string | null;
  let text: string;
  try {
    if (flow !== null) {
      const own = existingText(join(root, flow.file));
      const section = own === null ? null : flowSection(own, name);
      if (own === null || section === null) return fail(`import drawio: ${flow.file}: flow \`${name}\` is no longer there; nothing written`);
      const edited = flowFromDrawio(model, name, { text: section.text, flow, firstLine: section.firstLine });
      // The guarantee of a round trip: the section as it is, and nothing to propose.
      if (edited === section.text && (into === undefined || into === flow.file)) {
        result.target = flow.file;
        return { ...result, exitCode: 0, messages: [{ level: "info", text: `${flow.file}: flow \`${name}\` already says what the drawing says; nothing to propose` }] };
      }
      target = into ?? flow.file;
      if (target === flow.file) {
        const lines = own.replace(/\r\n/g, "\n").split("\n");
        const sectionLines = section.text.split("\n").length;
        const out = [...lines.slice(0, section.firstLine - 1), ...edited.split("\n"), ...lines.slice(section.firstLine - 1 + sectionLines)].join("\n");
        before = own;
        text = /\r\n/.test(own) ? out.replace(/\n/g, "\r\n") : out;
      } else {
        before = existingText(join(root, target));
        text = withFlow(before, { name, text: edited.replace(/\n*$/, "\n") });
      }
    } else {
      target = into ?? `${specDir === "" ? "" : `${specDir}/`}flows/${name}.md`;
      before = existingText(join(root, target));
      text = withFlow(before, { name, text: flowFromDrawio(model, name, null) });
    }
  } catch (error) {
    return fail(`import drawio: ${errorText(error)}`);
  }
  result.target = target;
  if (before === text) return { ...result, exitCode: 0, messages: [{ level: "info", text: `${target}: nothing to propose` }] };
  result.diff = lineDiff(before ?? "", text);
  if (request.print === true) return { ...result, exitCode: 0 };
  const generated = generatedIn(analyzed.docs);
  const store = `${PROPOSALS_DIR}/${target}`;
  let candidate;
  try {
    const problem = proposalProblem(root, specDir, target, generated);
    const pending = problem === null && writeProblem(root, store, { under: PROPOSALS_DIR, generated: true }) === null ? existingText(join(root, store)) : null;
    candidate = { target, problem, pending };
  } catch (error) {
    return fail(errorText(error));
  }
  const refusal = proposalRefusal(root, candidate, "refuse", "import drawio");
  if (refusal !== null) return fail(refusal.error, refusal.exitCode);
  const committed = await commitProposal({ root, specDir, generated, target, text, expected: { target: before, proposal: candidate.pending }, config: analyzed.config, inputs: sourceInputs(analyzed.config, analyzed.snapshot?.manifest.files ?? []) }, context);
  if ("cancelled" in committed) return fail("import drawio: cancelled", 2);
  if ("refused" in committed) return { ...result, exitCode: 1, messages: [...committed.refused.map((text) => ({ level: "error" as const, text })), { level: "info", text: "nothing was written" }] };
  if ("failed" in committed) return fail(committed.failed);
  return {
    ...result,
    exitCode: 0,
    proposal: committed.proposal,
    messages: [{ level: "info", text: `proposed flow \`${name}\` from ${toPosix(relative(root, request.file))} for ${target} as ${committed.proposal}; merge it with \`m\` in \`keylang\`, or a person runs \`keylang proposals accept ${target}\`` }],
  };
}
