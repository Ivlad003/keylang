// Diagnostics with stable codes.

import type { Span } from "./span.ts";

export type Code =
  /** Reference to an ID that is not declared anywhere. */
  | "K001"
  /** The same ID is declared twice. */
  | "K002"
  /** Structural error: indentation, tabs, empty list item. */
  | "K003"
  /** Keyword not allowed (or unknown) at this position. */
  | "K004"
  /** Wrong or malformed arguments of a known keyword. */
  | "K005"
  /** Unknown section heading (warning). */
  | "K006"
  // rules (M1)
  /** Dependency against the layer order (divergence). */
  | "K101"
  /** Dependency forbidden by `deny` (divergence). */
  | "K102"
  /** Module unreachable from any `entry` (warning). */
  | "K103"
  /** Module exports a name missing from its `exports` list. */
  | "K104"
  /** Dependency cycle where `no-cycles` is declared. */
  | "K105";

export type Severity = "error" | "warning";

export function severityOf(code: Code): Severity {
  return code === "K006" || code === "K103" ? "warning" : "error";
}

export interface Diagnostic {
  code: Code;
  severity: Severity;
  message: string;
  file: string;
  span: Span;
}

export function diagnostic(code: Code, file: string, span: Span, message: string): Diagnostic {
  return { code, severity: severityOf(code), message, file, span };
}

export function isError(d: Diagnostic): boolean {
  return d.severity === "error";
}

/** `file:line:col: CODE message` */
export function formatDiagnostic(d: Diagnostic): string {
  return `${d.file}:${d.span.start.line}:${d.span.start.col}: ${d.code} ${d.message}`;
}

/** Stable order: file, position, code. */
export function compareDiagnostics(a: Diagnostic, b: Diagnostic): number {
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  if (a.span.start.offset !== b.span.start.offset) return a.span.start.offset - b.span.start.offset;
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
}
