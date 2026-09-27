//! Source positions. Every node, name, link and reference carries a [`Span`]
//! so that diagnostics and the future LSP (hover, definition) can point at it.

use serde::Serialize;

/// A position in a source file.
///
/// `offset` is a byte offset into the file; `line` and `col` are 1-based,
/// `col` counts Unicode scalar values (not bytes, not UTF-16 units).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Default, Serialize)]
pub struct Pos {
    pub offset: usize,
    pub line: u32,
    pub col: u32,
}

/// Half-open range `[start, end)`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Default, Serialize)]
pub struct Span {
    pub start: Pos,
    pub end: Pos,
}

impl Span {
    pub fn contains(&self, offset: usize) -> bool {
        self.start.offset <= offset && offset < self.end.offset
    }
}

/// A value together with the place it was written.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Spanned<T> {
    pub value: T,
    pub span: Span,
}
