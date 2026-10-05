// The records of the F6 panel through the reports of their kinds: how a
// record is named in the list and the messages, its outcome, its report rows
// and the items Tab selects. Each kind is one entry of one table, so a new
// kind of operation is one more entry, not one more branch in every switch.

import type { OperationRequest, OperationResult } from "../../operations.ts";
import { ACTIONS } from "../actions.ts";
import type { OperationRecord, State } from "../state.ts";
import { THEME } from "../theme.ts";
import { CHECK_REPORTS } from "./check.ts";
import { DRAFT_REPORTS } from "./draft.ts";
import { EXPLAIN_REPORTS } from "./explain.ts";
import { messageRow, MUTED, WARNING, type Done, type Kind, type Report, type ReportItem, type ReportRow, type RequestOf } from "./rows.ts";
import { SETUP_REPORTS } from "./setup.ts";

const REPORTS: { [K in Kind]: Report<K> } = { ...SETUP_REPORTS, ...CHECK_REPORTS, ...EXPLAIN_REPORTS, ...DRAFT_REPORTS };

/** A result that has its payload: the report of its kind can show it. */
function isDone(result: OperationResult): result is Done<Kind> {
  return result.payload !== null;
}

/** How messages name an operation: `doctor`, `feature pay`, `map write`. */
export function operationLabel<K extends Kind>(request: RequestOf<K>): string {
  return REPORTS[request.kind].label(request);
}

function paramsOf<K extends Kind>(request: RequestOf<K>): string | null {
  return REPORTS[request.kind].params?.(request) ?? null;
}

/** The registry label of a record's action, with its parameters (`Feature readiness · pay`), or its id. */
export function recordLabel(record: OperationRecord): string {
  const label = ACTIONS.find((action) => action.id === record.action)?.label ?? (record.action === "agent-draft" ? "Ctrl+Space: the agent's flow draft" : record.action);
  const params = paramsOf(record.params as RequestOf<Kind>);
  return params === null ? label : `${label} · ${params}`;
}

/** The status of a record for the F6 list: `running…` or `completed · code 0`, and `outdated` once its inputs changed. */
export function recordStatus(record: OperationRecord): string {
  if (record.status === "running") return record.progress === null ? "running…" : `running: ${record.progress}…`;
  const code = record.result?.exitCode;
  return `${record.status}${code === null || code === undefined ? "" : ` · code ${code}`}${record.outdated !== null ? " · outdated" : ""}`;
}

function summaryOf<K extends Kind>(record: OperationRecord, result: Done<K>): string {
  return REPORTS[result.kind].summary?.(record, result) ?? recordStatus(record);
}

/** The status with the domain outcome when there is one: `done · code 0`, `2 gap(s) · code 1`. */
export function recordSummary(record: OperationRecord): string {
  const result = record.result;
  return result !== null && isDone(result) ? summaryOf(record, result) : recordStatus(record);
}

function rowsOf<K extends Kind>(state: State, record: OperationRecord, result: Done<K>): ReportRow[] {
  const view = { selected: state.results.scrollReport ? state.results.gap : -1, summary: summaryOf(record, result) };
  return REPORTS[result.kind].rows(state, record, result, view);
}

function timeStr(ms: number): string {
  return new Date(ms).toTimeString().slice(0, 8);
}

/**
 * The report rows of the record selected in the F6 panel: its parameters,
 * timings and what its kind shows of the result. Presentation only — the
 * payload in `record.result` carries the domain data.
 */
export function resultsReportRows(state: State): ReportRow[] {
  const record = state.records[state.results.index];
  if (!record) return [];
  const rows: ReportRow[] = [{ text: `root ${record.params.root} · started ${timeStr(record.started)}`, style: MUTED }];
  if (record.finished !== null) rows.push({ text: `finished ${timeStr(record.finished)} · ${recordStatus(record)}`, style: MUTED });
  if (record.outdated !== null) rows.push({ text: `outdated: ${record.outdated} · Enter reruns`, style: WARNING });
  const result = record.result;
  if (result === null) rows.push({ text: `  ${record.progress === null ? "running…" : `running: ${record.progress}…`} · x cancels`, style: THEME.hint });
  else if (isDone(result)) rows.push(...rowsOf(state, record, result));
  else rows.push(...result.messages.map(messageRow));
  return rows;
}

function itemsOf<K extends Kind>(state: State, result: Done<K>): ReportItem[] {
  return REPORTS[result.kind].items?.of(state, result) ?? [];
}

/**
 * The items of the selected record the arrows select after Tab: the gaps of
 * a feature record, every result of a check record, the evidence of an
 * explained edge, the places of an explanation, the nodes of an inventory or
 * a batch, the diagnostics of a parse, the symbols of a trace plan; none for
 * the others.
 */
export function reportItems(state: State): ReportItem[] {
  const result = state.records[state.results.index]?.result;
  return result !== null && result !== undefined && isDone(result) ? itemsOf(state, result) : [];
}

/** What the panel's keys call the items of a kind: `evidence`, `diagnostic`, `node`; `finding` by default. */
export function itemNoun(kind: OperationRequest["kind"]): string {
  return REPORTS[kind].items?.noun ?? "finding";
}
