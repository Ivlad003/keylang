// Diagnostics with stable codes, and the text of a thrown error.

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
  /** A one-word `then` matches a declared id and is still read as text (warning). K007 stays reserved. */
  | "K008"
  /** A `parallel` group with no steps. */
  | "K009"
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
  | "K105"
  /** Incomparable `allow` and `deny`: the depth sum and deny-overrides disagree (warning). */
  | "K106"
  /** Architecture code depends on a file `outside` in keylang.json puts outside the architecture. */
  | "K107"
  /** The spec was weakened since the base commit (`hook stop`, `check --changed`, `feature`): a rule's scope, a rule line or a flow step taken away. */
  | "K108"
  // flows (M2)
  /** A `planned` declaration disagrees with the implemented symbol (kind or signature). */
  | "K201"
  /** A `planned` declaration is implemented and can be removed (warning). */
  | "K202"
  /** A flow `test` names a file that does not exist in the repository (warning). */
  | "K203"
  /** `trigger <kind> <id>`: the snapshot records the fn as an entry point of another kind. */
  | "K205"
  /** `continues <flow>` names a flow that does not exist. */
  | "K206"
  // wiring (M6)
  /** A cycle among `wire` factories. */
  | "K301"
  /** A `wire` factory or dependency that is not a fn or a class. */
  | "K302";

export type Severity = "error" | "warning";

/** Why a K005 is malformed. Other codes do not carry this. */
export type K005Reason = "arguments" | "id" | "link" | "quote" | "layer" | "scope";

export function severityOf(code: Code): Severity {
  return code === "K006" || code === "K008" || code === "K103" || code === "K106" || code === "K202" || code === "K203" ? "warning" : "error";
}

export interface Diagnostic {
  code: Code;
  severity: Severity;
  message: string;
  file: string;
  span: Span;
  /**
   * K001: the ID the dangling reference names, so a `planned` declaration
   * matches it exactly. K104: the export row the finding is about
   * (`<module>.<name>`), so a feature that plans that member owns the fail.
   */
  target?: string;
  /**
   * The rule a warning-level rule finding belongs to (K103: `entry` and the
   * module). A warning is not a verdict, so it carries its criterion itself.
   */
  criterion?: string;
  area?: string;
  /**
   * SHA-256 input of a warning that has no verdict of its own (K103: the
   * canonical `entry` lines). Absent on every other diagnostic, so `parse --json`
   * does not grow a field.
   */
  specHash?: string;
  /** K005 only. Absent on every other code, including in `parse --json`. */
  reason?: K005Reason;
}

const K005_REASONS: readonly K005Reason[] = ["arguments", "id", "link", "quote", "layer", "scope"];

export function diagnostic(code: Exclude<Code, "K005">, file: string, span: Span, message: string, target?: string): Diagnostic;
export function diagnostic(code: "K005", file: string, span: Span, message: string, reason: K005Reason): Diagnostic;
export function diagnostic(code: Code, file: string, span: Span, message: string, extra?: string): Diagnostic {
  const diag: Diagnostic = { code, severity: severityOf(code), message, file, span };
  if (code === "K005") {
    const reason = K005_REASONS.find((item) => item === extra);
    if (reason !== undefined) diag.reason = reason;
  } else if (extra !== undefined) diag.target = extra;
  return diag;
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
  // Line and column first: rule diagnostics built without a source offset still sort by position.
  if (a.span.start.line !== b.span.start.line) return a.span.start.line - b.span.start.line;
  if (a.span.start.col !== b.span.start.col) return a.span.start.col - b.span.start.col;
  if (a.span.start.offset !== b.span.start.offset) return a.span.start.offset - b.span.start.offset;
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
}

/** The text of a thrown value: an `Error`'s message, anything else as a string. */
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
