//! keylang core: IR, Markdown parser, cross-file resolver, formatter.
//!
//! ```
//! use std::path::Path;
//! let doc = keylang_core::parse(Path::new("map.md"), "- domain\n  - orderAggregate\n");
//! let (index, diags) = keylang_core::check(&[doc]);
//! assert!(diags.is_empty());
//! assert!(index.decls.contains_key("domain.orderAggregate"));
//! ```

pub mod diag;
pub mod fmt;
pub mod ir;
pub mod parser;
pub mod resolve;
pub mod span;

pub use diag::{Code, Diagnostic, Severity};
pub use fmt::{format_document, format_source};
pub use ir::*;
pub use parser::parse;
pub use resolve::{Decl, Index, Lookup, check};
pub use span::{Pos, Span, Spanned};

use std::io;
use std::path::{Path, PathBuf};

/// Expand files and directories into a sorted list of `*.md` files.
/// Hidden directories and `target` are skipped.
pub fn collect_md_files(paths: &[PathBuf]) -> io::Result<Vec<PathBuf>> {
    let mut out = Vec::new();
    for p in paths {
        if p.is_dir() {
            walk(p, &mut out)?;
        } else if p.exists() {
            out.push(p.clone());
        } else {
            return Err(io::Error::new(
                io::ErrorKind::NotFound,
                format!("{}: not found", p.display()),
            ));
        }
    }
    Ok(out)
}

fn walk(dir: &Path, out: &mut Vec<PathBuf>) -> io::Result<()> {
    let mut entries: Vec<PathBuf> = std::fs::read_dir(dir)?
        .map(|e| e.map(|e| e.path()))
        .collect::<io::Result<_>>()?;
    entries.sort();
    for p in entries {
        let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if p.is_dir() {
            if !name.starts_with('.') && name != "target" {
                walk(&p, out)?;
            }
        } else if p.extension().is_some_and(|e| e == "md") {
            out.push(p);
        }
    }
    Ok(())
}

/// Read and parse files.
pub fn load(files: &[PathBuf]) -> io::Result<Vec<Document>> {
    files
        .iter()
        .map(|f| Ok(parse(f, &std::fs::read_to_string(f)?)))
        .collect()
}
