//! Cross-file ID resolution: builds the declaration index and reports
//! duplicate declarations (K002) and dangling references (K001).

use crate::diag::{Code, Diagnostic};
use crate::ir::{Document, Node, NodeKind, SectionKind};
use crate::span::Span;
use serde::Serialize;
use std::collections::BTreeMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize)]
pub struct Decl {
    pub id: String,
    pub kind: NodeKind,
    pub file: PathBuf,
    /// Span of the declared name (LSP: definition target).
    pub span: Span,
    /// Module declares `fn`/`type`/`event`/`module` children. A module without
    /// members is opaque: `module.anything` resolves to it.
    pub has_members: bool,
}

#[derive(Debug, Default, Serialize)]
pub struct Index {
    pub decls: BTreeMap<String, Decl>,
    pub flows: BTreeMap<String, Decl>,
}

#[derive(Debug)]
pub enum Lookup<'a> {
    Exact(&'a Decl),
    /// Resolved into an opaque module (the tail is not modelled).
    Opaque(&'a Decl),
    Missing,
}

impl Index {
    pub fn lookup(&self, id: &str) -> Lookup<'_> {
        if let Some(d) = self.decls.get(id) {
            return Lookup::Exact(d);
        }
        match self.longest_prefix(id) {
            Some(d) if d.kind == NodeKind::Module && !d.has_members => Lookup::Opaque(d),
            _ => Lookup::Missing,
        }
    }

    fn longest_prefix(&self, id: &str) -> Option<&Decl> {
        let mut end = id.len();
        while let Some(dot) = id[..end].rfind('.') {
            end = dot;
            if let Some(d) = self.decls.get(&id[..end]) {
                return Some(d);
            }
        }
        None
    }

    /// Best-effort "did you mean" among siblings of the missing segment.
    fn suggest(&self, id: &str) -> Option<String> {
        let prefix = self.longest_prefix(id).map(|d| d.id.as_str());
        let rest = prefix.map_or(id, |p| &id[p.len() + 1..]);
        let missing = rest.split('.').next()?.to_lowercase();
        let depth = prefix.map_or(0, |p| p.split('.').count()) + 1;
        self.decls
            .keys()
            .filter(|k| {
                k.split('.').count() == depth
                    && prefix.is_none_or(|p| k.starts_with(&format!("{p}.")))
            })
            .filter_map(|k| {
                let last = k.rsplit('.').next()?.to_lowercase();
                let score = if last.contains(&missing) || missing.contains(&last) {
                    0
                } else {
                    levenshtein(&last, &missing)
                };
                (score <= 2).then_some((score, k))
            })
            .min()
            .map(|(_, k)| k.clone())
    }
}

/// Build the index over all documents and check every reference.
pub fn check(docs: &[Document]) -> (Index, Vec<Diagnostic>) {
    let mut index = Index::default();
    let mut diags = Vec::new();

    for doc in docs {
        for section in &doc.sections {
            if let (SectionKind::Flow, Some(name)) = (section.kind, &section.name) {
                let decl = Decl {
                    id: name.value.clone(),
                    kind: NodeKind::Step,
                    file: doc.path.clone(),
                    span: name.span,
                    has_members: false,
                };
                insert(&mut index.flows, decl, "flow", &mut diags);
            }
            for node in section.nodes() {
                node.walk(&mut |n| {
                    if let (true, Some(id), Some(name)) = (n.kind.is_decl(), &n.id, &n.name) {
                        let decl = Decl {
                            id: id.clone(),
                            kind: n.kind,
                            file: doc.path.clone(),
                            span: name.span,
                            has_members: false,
                        };
                        insert(&mut index.decls, decl, "ID", &mut diags);
                    }
                });
            }
        }
    }

    let parents: Vec<String> = index
        .decls
        .values()
        .filter(|d| {
            matches!(
                d.kind,
                NodeKind::Fn | NodeKind::Type | NodeKind::Event | NodeKind::Module
            )
        })
        .filter_map(|d| d.id.rsplit_once('.').map(|(p, _)| p.to_string()))
        .collect();
    for p in parents {
        if let Some(d) = index.decls.get_mut(&p) {
            d.has_members = true;
        }
    }

    for doc in docs {
        for section in &doc.sections {
            for node in section.nodes() {
                check_refs(&index, doc, node, &mut diags);
            }
        }
    }
    (index, diags)
}

fn insert(map: &mut BTreeMap<String, Decl>, decl: Decl, what: &str, diags: &mut Vec<Diagnostic>) {
    match map.get(&decl.id) {
        // A layer may be continued in several map files.
        Some(prev) if prev.kind == NodeKind::Layer && decl.kind == NodeKind::Layer => {}
        Some(prev) => diags.push(Diagnostic::new(
            Code::K002,
            &decl.file,
            decl.span,
            format!(
                "duplicate {what} `{}` (first declared at {}:{}:{})",
                decl.id,
                prev.file.display(),
                prev.span.start.line,
                prev.span.start.col
            ),
        )),
        None => {
            map.insert(decl.id.clone(), decl);
        }
    }
}

fn check_refs(index: &Index, doc: &Document, node: &Node, diags: &mut Vec<Diagnostic>) {
    let mut ok = true;
    for r in &node.refs {
        if let Lookup::Missing = index.lookup(&r.target) {
            ok = false;
            let mut msg = format!("dangling reference `{}`", r.target);
            if let Some(s) = index.suggest(&r.target) {
                msg.push_str(&format!(" (did you mean `{s}`?)"));
            }
            diags.push(Diagnostic::new(Code::K001, &doc.path, r.span, msg));
        }
    }
    for child in &node.children {
        // `exports` of an unknown module would only repeat the error.
        if ok || node.kind != NodeKind::RuleModule {
            check_refs(index, doc, child, diags);
        }
    }
}

fn levenshtein(a: &str, b: &str) -> usize {
    let b: Vec<char> = b.chars().collect();
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    for (i, ca) in a.chars().enumerate() {
        let mut cur = vec![i + 1];
        for (j, cb) in b.iter().enumerate() {
            cur.push(
                (prev[j] + usize::from(ca != *cb))
                    .min(prev[j + 1] + 1)
                    .min(cur[j] + 1),
            );
        }
        prev = cur;
    }
    prev[b.len()]
}
