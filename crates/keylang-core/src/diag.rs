//! Diagnostics with stable codes.

use crate::span::Span;
use serde::Serialize;
use std::fmt;
use std::path::PathBuf;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub enum Code {
    /// Reference to an ID that is not declared anywhere.
    K001,
    /// The same ID is declared twice.
    K002,
    /// Structural error: indentation, tabs, empty list item.
    K003,
    /// Keyword not allowed (or unknown) at this position.
    K004,
    /// Wrong or malformed arguments of a known keyword.
    K005,
    /// Unknown section heading (warning).
    K006,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Error,
    Warning,
}

impl Code {
    pub fn severity(self) -> Severity {
        match self {
            Code::K006 => Severity::Warning,
            _ => Severity::Error,
        }
    }
}

impl fmt::Display for Code {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(self, f)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Diagnostic {
    pub code: Code,
    pub severity: Severity,
    pub message: String,
    pub file: PathBuf,
    pub span: Span,
}

impl Diagnostic {
    pub fn new(
        code: Code,
        file: impl Into<PathBuf>,
        span: Span,
        message: impl Into<String>,
    ) -> Self {
        Self {
            code,
            severity: code.severity(),
            message: message.into(),
            file: file.into(),
            span,
        }
    }

    pub fn is_error(&self) -> bool {
        self.severity == Severity::Error
    }
}

/// `file:line:col: CODE message`
impl fmt::Display for Diagnostic {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{}:{}:{}: {} {}",
            self.file.display(),
            self.span.start.line,
            self.span.start.col,
            self.code,
            self.message
        )
    }
}
