// Source positions. Every node, name, link and reference carries a Span so
// that diagnostics and the future LSP (hover, definition) can point at it.

/**
 * A position in a source file. `offset` is an index into the file text
 * (UTF-16 code units, i.e. a JS string index — what LSP expects); `line` and
 * `col` are 1-based, `col` counts Unicode code points.
 */
export interface Pos {
  offset: number;
  line: number;
  col: number;
}

/** Half-open range `[start, end)`. */
export interface Span {
  start: Pos;
  end: Pos;
}

/** A value together with the place it was written. */
export interface Spanned<T> {
  value: T;
  span: Span;
}

export function spanContains(span: Span, offset: number): boolean {
  return span.start.offset <= offset && offset < span.end.offset;
}
