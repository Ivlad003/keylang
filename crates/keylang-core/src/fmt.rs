//! Canonical formatting (`keylang fmt`). Rendered from the IR, so the output is
//! idempotent by construction: `format(parse(format(x))) == format(x)`.

use crate::diag::{Code, Diagnostic};
use crate::ir::{Document, Item, Node};
use crate::parser::{parse, render_tokens};
use std::path::Path;

/// Format source text. Fails with the structural (K003) diagnostics when the
/// tree shape is ambiguous — formatting would silently re-nest items.
pub fn format_source(path: &Path, src: &str) -> Result<String, Vec<Diagnostic>> {
    let doc = parse(path, src);
    let structural: Vec<_> = doc
        .diagnostics
        .iter()
        .filter(|d| d.code == Code::K003)
        .cloned()
        .collect();
    if structural.is_empty() {
        Ok(format_document(&doc))
    } else {
        Err(structural)
    }
}

pub fn format_document(doc: &Document) -> String {
    let mut blocks: Vec<String> = Vec::new();
    blocks.extend(doc.generated.clone());
    for section in &doc.sections {
        if let Some(h) = &section.heading {
            blocks.push(format!("# {}", h.value).trim_end().to_string());
        }
        let mut list = String::new();
        for item in &section.items {
            match item {
                Item::Node(n) => render_node(&mut list, n, 0),
                Item::Prose { lines } | Item::Code { lines } => {
                    if !list.is_empty() {
                        blocks.push(std::mem::take(&mut list).trim_end().to_string());
                    }
                    blocks.push(lines.join("\n"));
                }
            }
        }
        if !list.is_empty() {
            blocks.push(list.trim_end().to_string());
        }
    }
    if blocks.is_empty() {
        return String::new();
    }
    blocks.join("\n\n") + "\n"
}

fn render_node(out: &mut String, n: &Node, depth: usize) {
    let indent = "  ".repeat(depth);
    out.push_str(&indent);
    out.push_str("- ");
    out.push_str(&render_tokens(&n.tokens));
    if let Some(c) = &n.comment {
        if !n.tokens.is_empty() {
            out.push(' ');
        }
        out.push_str(&c.value);
    }
    out.push('\n');
    for d in &n.description {
        out.push_str(&format!("{indent}  {}\n", d.value));
    }
    for c in &n.children {
        render_node(out, c, depth + 1);
    }
}
