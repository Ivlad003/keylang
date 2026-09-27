//! Intermediate representation of keylang Markdown files.
//!
//! The IR is a faithful tree of what was written: it keeps the raw tokens of
//! every item (for `keylang fmt`) plus the interpreted parts (declared name and
//! ID, code link, references, free text) with spans (for diagnostics and LSP).

use crate::diag::Diagnostic;
use crate::span::{Span, Spanned};
use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize)]
pub struct Document {
    pub path: PathBuf,
    /// The `<!-- keylang:generated … -->` line, if the file is a generated map.
    pub generated: Option<String>,
    pub sections: Vec<Section>,
    /// Parse-time diagnostics (K003–K006). Resolution diagnostics come from
    /// [`crate::resolve::check`].
    pub diagnostics: Vec<Diagnostic>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SectionKind {
    Map,
    Rules,
    Flow,
    Wiring,
}

impl SectionKind {
    pub fn as_str(self) -> &'static str {
        match self {
            SectionKind::Map => "map",
            SectionKind::Rules => "rules",
            SectionKind::Flow => "flow",
            SectionKind::Wiring => "wiring",
        }
    }
}

/// Content under one `# …` heading (or before the first heading).
#[derive(Debug, Clone, Serialize)]
pub struct Section {
    pub kind: SectionKind,
    /// Canonical heading text without `# `, e.g. `flow checkout`.
    pub heading: Option<Spanned<String>>,
    /// Second heading word, e.g. the flow name.
    pub name: Option<Spanned<String>>,
    pub items: Vec<Item>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Item {
    Node(Box<Node>),
    /// A paragraph of free Markdown (lines verbatim).
    Prose {
        lines: Vec<String>,
    },
    /// A fenced code block (lines verbatim, fences included).
    Code {
        lines: Vec<String>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum NodeKind {
    // map
    Layer,
    Module,
    Fn,
    Type,
    Event,
    /// `alias path` under a module.
    Dep,
    Calls,
    // rules
    Layers,
    Allow,
    Deny,
    Entry,
    /// `module <id>` at top level: rules about an existing module.
    RuleModule,
    Exports,
    NoCycles,
    /// A bare ID under `entry` or `layers`.
    Ref,
    // flows
    Kind,
    Trigger,
    Step,
    Reads,
    Emits,
    Invariant,
    When,
    Then,
    Test,
    // wiring
    Wire,
    /// `alias path` under `wire`.
    WireDep,
    Compose,
    /// Item that could not be interpreted (a diagnostic was reported).
    Unknown,
}

impl NodeKind {
    /// Kinds that declare an ID in the global namespace.
    pub fn is_decl(self) -> bool {
        matches!(
            self,
            NodeKind::Layer
                | NodeKind::Module
                | NodeKind::Fn
                | NodeKind::Type
                | NodeKind::Event
                | NodeKind::Dep
        )
    }

    pub fn as_str(self) -> &'static str {
        match self {
            NodeKind::Layer => "layer",
            NodeKind::Module => "module",
            NodeKind::Fn => "fn",
            NodeKind::Type => "type",
            NodeKind::Event => "event",
            NodeKind::Dep => "dep",
            NodeKind::Calls => "calls",
            NodeKind::Layers => "layers",
            NodeKind::Allow => "allow",
            NodeKind::Deny => "deny",
            NodeKind::Entry => "entry",
            NodeKind::RuleModule => "module",
            NodeKind::Exports => "exports",
            NodeKind::NoCycles => "no-cycles",
            NodeKind::Ref => "ref",
            NodeKind::Kind => "kind",
            NodeKind::Trigger => "trigger",
            NodeKind::Step => "step",
            NodeKind::Reads => "reads",
            NodeKind::Emits => "emits",
            NodeKind::Invariant => "invariant",
            NodeKind::When => "when",
            NodeKind::Then => "then",
            NodeKind::Test => "test",
            NodeKind::Wire => "wire",
            NodeKind::WireDep => "wire-dep",
            NodeKind::Compose => "compose",
            NodeKind::Unknown => "unknown",
        }
    }
}

/// One list item `- <kind>? <name> <args…>` and everything nested under it.
#[derive(Debug, Clone, Serialize)]
pub struct Node {
    pub kind: NodeKind,
    /// Span of the explicit keyword, `None` when implied by position.
    pub keyword: Option<Span>,
    /// Declared name (layer, module, fn, type, event, dependency alias).
    pub name: Option<Spanned<String>>,
    /// Full dotted ID for declarations, e.g. `application.purchase.buy`.
    pub id: Option<String>,
    /// Code anchor `[name](path#Lnn)`.
    pub link: Option<Link>,
    /// IDs this item refers to (checked by the resolver).
    pub refs: Vec<Ref>,
    /// Free text: fn signature, condition, invariant, `kind` value, test file.
    pub text: Option<Spanned<String>>,
    /// Quoted test name of `test <file> "name"`.
    pub label: Option<Spanned<String>>,
    /// Raw head tokens after the bullet (used by the formatter).
    pub tokens: Vec<Token>,
    /// Trailing `<!-- … -->` on the item line.
    pub comment: Option<Spanned<String>>,
    /// Text lines under the item (not list items) — its description.
    pub description: Vec<Spanned<String>>,
    pub children: Vec<Node>,
    /// The item line from the bullet to the end of the line.
    pub span: Span,
}

#[derive(Debug, Clone, Serialize)]
pub struct Link {
    pub text: String,
    /// Everything inside `(…)`.
    pub target: String,
    /// Target without the `#…` fragment.
    pub path: String,
    /// `nn` from a `#Lnn` fragment.
    pub line: Option<u32>,
    pub span: Span,
}

#[derive(Debug, Clone, Serialize)]
pub struct Ref {
    /// As written.
    pub text: String,
    /// Absolute ID to resolve (differs from `text` for relative names such as
    /// `exports buy` under `module application.purchase`).
    pub target: String,
    pub span: Span,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TokenKind {
    Word,
    Link,
    Quoted,
    Comma,
}

#[derive(Debug, Clone, Serialize)]
pub struct Token {
    pub kind: TokenKind,
    pub text: String,
    pub span: Span,
}

impl Node {
    /// Pre-order walk over this node and its descendants.
    pub fn walk<'a>(&'a self, f: &mut impl FnMut(&'a Node)) {
        f(self);
        for c in &self.children {
            c.walk(f);
        }
    }
}

impl Section {
    pub fn nodes(&self) -> impl Iterator<Item = &Node> {
        self.items.iter().filter_map(|i| match i {
            Item::Node(n) => Some(n.as_ref()),
            _ => None,
        })
    }
}
