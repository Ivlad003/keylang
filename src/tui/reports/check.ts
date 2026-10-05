// Reports of the operations that read the specs against the code: feature
// readiness, check, an explained edge, parse, a trace plan, the C4 diagram,
// and the export of a finished report.

import { relative, resolve } from "node:path";
import { toPosix } from "../../config.ts";
import { formatDiagnostic, isError } from "../../diag.ts";
import { edgeLine, holeLine } from "../../explain-edge.ts";
import { STAGES, type FeatureInfo, type FeatureReport, type Gap, type Hint } from "../../feature-status.ts";
import { checkSummary, exportFormatOf, type CheckRequest, type ExplainEdgePayload, type ExportC4Request } from "../../operations.ts";
import { FINDING_GLYPH, findingRow } from "../findings.ts";
import { THEME } from "../theme.ts";
import { BOLD, codeOf, ERROR, messageRow, MUTED, outcomeRow, shortId, textRows, WARNING, type Report, type ReportRow } from "./rows.ts";

type CheckKind = "feature" | "check" | "explain-edge" | "export" | "parse" | "trace-plan" | "export-c4";

/** One gap or hint of a feature report, as the readiness screen lists it. */
export interface FeatureItem {
  item: Gap | Hint;
  /** A hint: the next step of a stage, never blocking done. */
  hint: boolean;
}

/** The gaps and hints of a feature report up the ladder, a stage's gaps before its hints: the rows Tab and the arrows select. */
export function featureItems(report: FeatureReport): FeatureItem[] {
  return STAGES.flatMap((stage) => [
    ...report.gaps.filter((gap) => gap.stage === stage).map((item) => ({ item, hint: false })),
    ...report.hints.filter((hint) => hint.stage === stage).map((item) => ({ item, hint: true })),
  ]);
}

/** `idea › behavior › [structure] › ready › done`: the ladder with the current stage in brackets. */
function stageLadder(stage: FeatureReport["stage"]): string {
  return STAGES.map((step) => (step === stage ? `[${step}]` : step)).join(" › ");
}

/** `ok 2 · unverified 1`, or `—` when the feature has none. */
function infoSummary(items: readonly FeatureInfo[]): string {
  if (items.length === 0) return "—";
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.verdict, (counts.get(item.verdict) ?? 0) + 1);
  return [...counts].map(([verdict, count]) => `${verdict} ${count}`).join(", ");
}

/** The requested check options as the F6 list names them: `keylang · strict · static shape`. */
function checkParams(request: CheckRequest): string {
  return [
    request.paths.length > 0 ? request.paths.join(" ") : "spec directory",
    request.strict ? "strict" : "not strict",
    `static ${request.static ?? "from config"}`,
    ...(request.changed === true ? [`changed since ${request.since ?? "HEAD"}`] : []),
  ].join(" · ");
}

/**
 * The evidence of an explain-edge report the arrows select after Tab: every
 * edge (`→` from → to, `←` to → from), or every unresolved construct when
 * there is none. `file` is "" for an edge with no position in the code.
 */
function edgeItems(payload: ExplainEdgePayload): { file: string; line: number; col: number; text: string }[] {
  if (payload.edges.length > 0) {
    return payload.edges.map(({ direction, edge }) => ({ file: edge.file ?? "", line: edge.line, col: edge.col, text: `${direction === "forward" ? "→" : "←"} ${edgeLine(edge)}` }));
  }
  return payload.holes.map((hole) => ({ file: hole.file, line: hole.line, col: hole.col, text: holeLine(hole) }));
}

/** How messages name a C4 export: the CLI's command with the flags it got. */
function c4Label(request: ExportC4Request): string {
  return ["export c4", `--format ${request.format}`, `--level ${request.level}`, ...(request.layer !== undefined ? [`--layer ${request.layer}`] : []), ...(request.out !== undefined ? [`--out ${request.out}`] : [])].join(" ");
}

export const CHECK_REPORTS: { [K in CheckKind]: Report<K> } = {
  feature: {
    label: (request) => `feature ${request.slug}`,
    params: (request) => request.slug,
    summary: (_record, result) => `${result.payload.report.done ? "done" : `${result.payload.report.gaps.length} gap(s)`} · code ${result.exitCode}`,
    rows(_state, _record, result, view) {
      // Design §2.7: the outcome, the saved state it was computed on, the stage on its ladder, the gaps and
      // hints by the stage that fixes them (c4-zoom/11), and the non-blocking tests and trace.
      const { file, snapshot, report } = result.payload;
      const rows: ReportRow[] = [
        { text: `Feature · ${result.payload.slug} · saved state · ${file}`, style: BOLD },
        outcomeRow(`${report.done ? "Done" : `${report.gaps.length} gap(s)`} · code ${result.exitCode} · snapshot ${shortId(snapshot)}`, report.done),
        { text: `stage  ${stageLadder(report.stage)}`, style: BOLD },
      ];
      const items = featureItems(report);
      for (const stage of STAGES) {
        const here = items.flatMap((entry, index) => (entry.item.stage === stage ? [{ ...entry, index }] : []));
        if (here.length === 0) continue;
        const gaps = here.filter((entry) => !entry.hint).length;
        const hints = here.length - gaps;
        // The rows stay flush with the header, as before the stages: a narrow panel cuts the reason, not the place.
        rows.push({ text: `${stage} · ${[...(gaps > 0 ? [`${gaps} gap(s)`] : []), ...(hints > 0 ? [`${hints} hint(s), not blocking`] : [])].join(" · ")}`, style: { ...THEME.panel, fg: 75, bold: true } });
        for (const { item, hint, index } of here) {
          const text = `${hint ? `hint ${item.kind}` : item.kind.padEnd(8)} ${item.id}  ${item.file}:${item.line}:${item.col}  ${item.reason}`;
          rows.push({ text, style: index === view.selected ? THEME.selected : hint ? { ...THEME.panel, fg: 247 } : THEME.panel, gap: index });
        }
      }
      // A rule fail that is not this change's no longer blocks; without git none can be told inherited, so every one blocks.
      const { rules } = report.info;
      const inherited = rules === null ? "unknown without git: every rule fail blocks" : rules.length === 0 ? "—" : String(rules.length);
      rows.push({ text: `Info (not blocking): tests ${infoSummary(report.info.tests)} · trace ${infoSummary(report.info.trace)} · inherited rule fails ${inherited}`, style: MUTED });
      for (const item of [...report.info.tests, ...report.info.trace, ...(rules ?? [])]) rows.push({ text: `  ${item.verdict} ${item.id}  ${item.file}:${item.line}  ${item.reason}`, style: MUTED });
      return rows;
    },
    items: {
      noun: "gap",
      of: (_state, result) => featureItems(result.payload.report).map(({ item, hint }) => ({ file: item.file, line: item.line, col: item.col, text: `${hint ? "hint " : ""}${item.kind} ${item.id}: ${item.reason}` })),
    },
  },
  check: {
    label: (request) => ["check", ...(request.strict ? ["--strict"] : []), ...(request.changed === true ? ["--changed"] : []), ...(request.changed === true && request.since !== undefined ? ["--since", request.since] : [])].join(" "),
    params: checkParams,
    summary: (_record, result) => `${checkSummary(result.payload.counts)} · code ${result.exitCode}`,
    rows(_state, _record, result, view) {
      // A report of the saved files, apart from the pinned current analysis: its options, its outcome, then every result.
      const { payload } = result;
      const { options } = payload;
      const from = options.staticFrom === "request" ? "override" : options.staticFrom === "config" ? "keylang.json check.static" : "default";
      const rows: ReportRow[] = [
        { text: `Check · read-only, nothing written · saved files · ${options.paths.join(" ")}`, style: BOLD },
        { text: `strict ${options.strict ? "on" : "off"} · static ${options.static} (${from}) · snapshot ${shortId(payload.snapshotId)}`, style: MUTED },
      ];
      // The git slice is always named: its ref, what git reported, and what the full report had besides.
      if (payload.changed !== null) {
        const slice = payload.changed;
        rows.push({ text: `changed since ${slice.since} · ${slice.files.length} changed file(s) · ${slice.shown} of ${slice.shown + slice.hidden} result(s) shown, ${slice.hidden} hidden`, style: WARNING });
        if (slice.unborn) rows.push({ text: "  no commit yet: HEAD is the empty tree, every file is changed", style: MUTED });
        if (slice.deleted.length > 0) rows.push({ text: `  deleted module(s) kept in the slice: ${slice.deleted.join(", ")}`, style: MUTED });
      } else rows.push({ text: "scope: every finding of the paths (not changed)", style: MUTED });
      rows.push(outcomeRow(view.summary, result.exitCode === 0));
      // Code 0 is not proof: unverified verdicts stay visible as incomplete evidence.
      if (!options.strict && payload.counts.unverified > 0) rows.push({ text: `  incomplete: ${payload.counts.unverified} unverified, not proven · strict would make it code 1`, style: WARNING });
      if (options.withoutCode) rows.push({ text: "  specs outside the spec directory: checked on their own, without the code", style: MUTED });
      for (const path of payload.notSpecs) rows.push({ text: `  ${path}: the explained map and saved explanations are not specs; skipped`, style: MUTED });
      payload.results.forEach((item, index) => {
        rows.push({ text: `${FINDING_GLYPH[item.verdict]} ${findingRow(item)}`, style: index === view.selected ? THEME.selected : item.verdict === "ok" ? MUTED : THEME.panel, gap: index });
      });
      // An import of a file `assume` names is listed in coverage, but keylang left it unread on purpose: no unresolved construct.
      const unresolved = payload.coverage.filter((item) => item.kind !== "assumed-import").length;
      if (unresolved > 0) rows.push({ text: `coverage: ${unresolved} unresolved construct(s) in the code`, style: MUTED });
      return rows;
    },
    items: {
      noun: "finding",
      of: (_state, result) => result.payload.results.map((item) => ({ file: item.file, line: item.line, col: item.col, text: `${item.verdict} ${item.code ?? item.criterion}: ${item.evidence}` })),
    },
  },
  "explain-edge": {
    label: (request) => `check --explain-edge ${request.from} ${request.to}`,
    params: (request) => `${request.from} ↔ ${request.to}`,
    summary(_record, result) {
      const { payload } = result;
      const outcome = payload.conclusion === "edges" ? `${payload.edges.length} edge(s)` : payload.conclusion === "complete" ? "no edge, coverage complete" : `no confirmed edge, ${payload.holes.length} unresolved`;
      return `${outcome} · code ${result.exitCode}`;
    },
    rows(_state, _record, result, view) {
      // The snapshot's evidence between two ids: both directions, or why an absence is (not) proven.
      const { payload } = result;
      const rows: ReportRow[] = [
        { text: `Explain edge · read-only, nothing written · saved code · snapshot ${payload.snapshotId.slice(0, 8)}`, style: BOLD },
        { text: `→ ${payload.from} → ${payload.to} first, then ← ${payload.to} → ${payload.from}`, style: MUTED },
      ];
      const forward = payload.edges.filter((item) => item.direction === "forward").length;
      if (payload.conclusion === "edges") {
        rows.push(outcomeRow(`${payload.edges.length} edge(s): ${forward} → , ${payload.edges.length - forward} ← · code ${result.exitCode}`, true));
      } else if (payload.conclusion === "complete") {
        rows.push(outcomeRow(`no edge, coverage complete · code ${result.exitCode}`, true));
        rows.push({ text: `  absence proven: no edge either way, nothing unresolved in ${payload.from}`, style: MUTED });
      } else {
        rows.push({ text: `no confirmed edge · code ${result.exitCode}`, style: WARNING });
        rows.push({ text: `  not proven absent: ${payload.holes.length} unresolved construct(s) in ${payload.from} could form one`, style: WARNING });
      }
      const items = edgeItems(payload);
      items.forEach((item, index) => {
        rows.push({ text: `  ${item.text}`, style: index === view.selected ? THEME.selected : THEME.panel, gap: index });
        const candidates = payload.edges[index]?.edge.candidates ?? [];
        if (candidates.length > 0) rows.push({ text: `      ambiguous: one of ${candidates.join(", ")}; no single target is confirmed`, style: WARNING });
      });
      if (items.length > 0) rows.push({ text: "  Tab, then Enter opens the evidence in the code", style: THEME.hint });
      return rows;
    },
    items: { noun: "evidence", of: (_state, result) => edgeItems(result.payload) },
  },
  export: {
    label: (request) => `export ${exportFormatOf(request.source)} ${request.path}`,
    params: (request) => `${exportFormatOf(request.source)} · ${request.path}`,
    summary(record, result) {
      const { payload } = result;
      const outcome = payload.written ? (payload.existed ? "replaced" : "written") : payload.refused.length > 0 ? "refused, nothing written" : payload.error !== null ? "write failed" : `${record.status}, nothing written`;
      return `${outcome}${codeOf(result.exitCode)}`;
    },
    rows(_state, record, result, view) {
      // One file: the report it came from, the format, and what happened to the target.
      const { payload } = result;
      const from = record.params.kind === "export" ? record.params.source.kind : payload.source;
      return [
        { text: `Export · ${payload.format} of the ${from} report · ${payload.path} · ${payload.bytes} bytes`, style: BOLD },
        outcomeRow(view.summary, result.exitCode === 0),
        ...result.messages.map(messageRow),
        { text: "  the report as it ran; nothing was checked again", style: MUTED },
      ];
    },
  },
  parse: {
    label: (request) => (request.format === "json" ? "parse --json" : "parse"),
    params: (request) => `${request.format} · ${request.paths.join(" ")}`,
    summary(_record, result) {
      const errors = result.payload.diagnostics.filter(isError).length;
      return `${result.payload.documents.length} document(s), ${errors} error(s), ${result.payload.diagnostics.length - errors} warning(s) · code ${result.exitCode}`;
    },
    rows(_state, record, result, view) {
      // The Text IR of the saved files: the diagnostics first (Tab, then Enter opens one), then the CLI's stdout.
      const { payload } = result;
      const paths = record.params.kind === "parse" ? record.params.paths.join(" ") : "";
      const rows: ReportRow[] = [
        { text: `Parse · read-only, nothing written · saved files · ${paths} · ${payload.format}`, style: BOLD },
        outcomeRow(view.summary, result.exitCode === 0),
        { text: "  the parser alone: no code snapshot, no rules; offsets count UTF-16 code units, columns code points", style: MUTED },
      ];
      for (const file of payload.skipped) rows.push({ text: `  ${file}: a saved explanation, not keylang Markdown; skipped`, style: MUTED });
      for (const file of payload.unreadable) rows.push({ text: `  ${file}: cannot be read; parsed as empty text, as the CLI does`, style: ERROR });
      payload.diagnostics.forEach((d, index) => {
        rows.push({ text: `  ${formatDiagnostic(d)}`, style: index === view.selected ? THEME.selected : isError(d) ? ERROR : WARNING, gap: index });
      });
      if (payload.diagnostics.length > 0) rows.push({ text: "  Tab, then ↑↓ select a diagnostic and Enter opens it · PgUp PgDn scroll the text", style: THEME.hint });
      rows.push(...textRows(`${payload.format === "json" ? "keylang parse --json" : "keylang parse"} · stdout`, payload.text));
      return rows;
    },
    items: {
      noun: "diagnostic",
      // A diagnostic names its document as the paths did (`./a.md`): opened by its path from the root.
      of: (state, result) => result.payload.diagnostics.map((d) => ({ file: toPosix(relative(state.root, resolve(state.root, d.file))), line: d.span.start.line, col: d.span.start.col, text: formatDiagnostic(d) })),
    },
  },
  "trace-plan": {
    label: (request) => `trace-plan ${request.flow}`,
    params: (request) => request.flow,
    summary: (_record, result) => `${result.payload.plan.symbols.length} function(s) to instrument${result.payload.omitted.length > 0 ? `, ${result.payload.omitted.length} id(s) left out` : ""} · code ${result.exitCode}`,
    rows(_state, _record, result, view) {
      // The plan an adapter reads: a summary, each symbol (Tab, then Enter opens it in the code), then the CLI's stdout.
      const { payload } = result;
      const { plan } = payload;
      const rows: ReportRow[] = [
        { text: `Trace plan · flow ${plan.flow} · read-only, nothing written, nothing run · fresh snapshot ${plan.snapshotId.slice(0, 8)} · schemaVersion ${plan.schemaVersion}`, style: BOLD },
        outcomeRow(view.summary, true),
        { text: "  a plan is no evidence: a step is observed only by a trace run, and an adapter leaves a file whose sha256 changed alone", style: MUTED },
      ];
      plan.symbols.forEach((symbol, index) => {
        rows.push({ text: `  ${symbol.id}  ${symbol.file}:${symbol.line}:${symbol.col}  sha256 ${symbol.sha256.slice(0, 12)}`, style: index === view.selected ? THEME.selected : THEME.panel, gap: index });
      });
      if (payload.omitted.length > 0) rows.push({ text: `  not in the plan (no function of the snapshot): ${payload.omitted.join(", ")}`, style: WARNING });
      if (plan.symbols.length > 0) rows.push({ text: "  Tab, then ↑↓ select a symbol and Enter opens it in the code · PgUp PgDn scroll the JSON", style: THEME.hint });
      rows.push(...textRows(`keylang trace-plan ${plan.flow} · stdout`, payload.text));
      return rows;
    },
    items: {
      noun: "symbol",
      // A symbol of a trace plan: its declaration in the code (1-based line and column, as the snapshot has them).
      of: (_state, result) => result.payload.plan.symbols.map((symbol) => ({ file: symbol.file, line: symbol.line, col: symbol.col, text: `${symbol.id} ${symbol.file}:${symbol.line}:${symbol.col}` })),
    },
  },
  "export-c4": {
    label: c4Label,
    params: (request) => `${request.format} · ${request.level}${request.layer !== undefined ? ` · ${request.layer}` : ""}${request.out !== undefined ? ` · ${request.out}` : ""}`,
    summary(_record, result) {
      const { payload } = result;
      const outcome = payload.out !== null ? `written ${payload.out}` : result.exitCode === 0 ? `${payload.text.split("\n").length - 1} line(s), nothing written` : "nothing written";
      return `${outcome} · code ${result.exitCode}`;
    },
    rows(_state, record, result, view) {
      // The diagram as the CLI prints it; written, only where it went (c4-zoom/12).
      const { payload } = result;
      const rows: ReportRow[] = [
        { text: `C4 diagram · ${payload.format} · ${payload.level}${payload.layer !== null ? ` · layer ${payload.layer}` : ""} · ${payload.out !== null ? `written to ${payload.out}` : "shown here, nothing written"}`, style: BOLD },
        outcomeRow(view.summary, result.exitCode === 0),
        ...result.messages.map(messageRow),
      ];
      if (payload.out === null && result.exitCode === 0 && record.params.kind === "export-c4") rows.push(...textRows(`keylang ${c4Label(record.params)} · stdout`, payload.text));
      return rows;
    },
  },
};
