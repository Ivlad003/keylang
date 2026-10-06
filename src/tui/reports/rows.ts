// What every report in F6 is made of: rows of text with a style, the kind
// of operation they show, and the few row shapes most reports share. One
// module per group of kinds (setup, check, explain, draft, chat) describes
// its kinds; `records.ts` puts them in one table.

import type { OperationEnvelope, OperationMessage, OperationPayloads, OperationRequest } from "../../operations.ts";
import type { Style } from "../screen.ts";
import type { OperationRecord, State } from "../state.ts";
import { MARK_STYLE, THEME } from "../theme.ts";

export type Kind = OperationRequest["kind"];

/** The request of one kind. */
export type RequestOf<K extends Kind> = { [P in K]: Extract<OperationRequest, { kind: P }> }[K];

/** A result of one kind that has its payload: what a report shows. */
export type Done<K extends Kind> = { [P in K]: OperationEnvelope<P> & { payload: OperationPayloads[P] } }[K];

/** One row of a report; `gap` is the index of the item Tab and the arrows select on it. */
export interface ReportRow {
  text: string;
  style: Style;
  gap?: number;
}

/** A place an item of a report opens; `file` is "" for an item with no place in the code. `text` is its whole reason. */
export interface ReportItem {
  file: string;
  line: number;
  col: number;
  text: string;
}

/**
 * How F6 and the messages show one kind of operation. Presentation only:
 * the payload of `record.result` carries the domain data.
 */
export interface Report<K extends Kind> {
  /** How messages name the request: `map write`, `feature pay`, `check --strict`. */
  label(request: RequestOf<K>): string;
  /** The request after the action's name in the F6 list (`write · auto`); absent: the name alone. */
  params?(request: RequestOf<K>): string;
  /** The domain outcome with the code (`done · code 0`, `2 gap(s) · code 1`); absent: the record's status. */
  summary?(record: OperationRecord, result: Done<K>): string;
  /** The rows of the report under the record's timings. */
  rows(state: State, record: OperationRecord, result: Done<K>, view: ReportView): ReportRow[];
  /** The items Tab and the arrows select, and what the panel's keys call them. */
  items?: { noun: string; of(state: State, result: Done<K>): ReportItem[] };
}

/** What the panel hands every report: the item Tab selected (-1 for none) and the record's summary for the outcome row. */
export interface ReportView {
  selected: number;
  summary: string;
}

export const BOLD: Style = { ...THEME.panel, bold: true };
export const MUTED: Style = { ...THEME.panel, fg: 243 };
export const WARNING: Style = { ...THEME.panel, fg: 179 };
export const ERROR: Style = { ...THEME.panel, ...THEME.error };

/** The outcome row under a report's title: green when the operation did what was asked, red otherwise. */
export function outcomeRow(text: string, ok: boolean): ReportRow {
  return { text, style: { ...THEME.panel, ...(ok ? MARK_STYLE.ok : MARK_STYLE.fail), bg: THEME.panel.bg! } };
}

/** ` · code 1`; nothing for a run with no code (cancelled). */
export function codeOf(exitCode: 0 | 1 | 2 | null): string {
  return exitCode === null ? "" : ` · code ${exitCode}`;
}

/** A message as a report row: an error in red, the rest as written. */
export function messageRow(message: OperationMessage): ReportRow {
  return { text: `  ${message.text}`, style: message.level === "error" ? ERROR : THEME.panel };
}

/** A message as a report row with warnings in amber too. */
export function noticeRow(message: OperationMessage): ReportRow {
  return { text: `  ${message.text}`, style: message.level === "error" ? ERROR : message.level === "warning" ? WARNING : THEME.panel };
}

/** Text as the CLI prints it, under a rule naming where it comes from (`keylang parse · stdout`); the final newline makes no row. */
export function textRows(title: string, text: string): ReportRow[] {
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return [{ text: `── ${title} ──`, style: MUTED }, ...lines.map((line) => ({ text: line, style: THEME.panel }))];
}

/** `abcd1234`, or `none` for a run without a snapshot. */
export function shortId(id: string | null): string {
  return id === null ? "none" : id.slice(0, 8);
}
