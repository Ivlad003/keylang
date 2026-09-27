//! Markdown → IR. A small line-oriented parser: keylang files use a strict
//! subset of Markdown (headings, bullet lists indented by 2 spaces, paragraphs,
//! fenced code), so a hand-written parser gives exact spans for every token
//! without mapping back from a CommonMark AST. See `docs/format.md`.

use crate::diag::{Code, Diagnostic};
use crate::ir::*;
use crate::span::{Pos, Span, Spanned};
use std::path::Path;

pub fn parse(path: &Path, src: &str) -> Document {
    let mut p = Parser {
        path,
        doc: Document {
            path: path.to_path_buf(),
            generated: None,
            sections: Vec::new(),
            diagnostics: Vec::new(),
        },
        stack: Vec::new(),
        prose: Vec::new(),
        fence: None,
        seen_content: false,
    };
    let mut offset = 0;
    for (i, raw) in src.split_inclusive('\n').enumerate() {
        let text = raw.trim_end_matches(['\n', '\r']);
        p.line(&Line {
            no: i as u32 + 1,
            start: offset,
            text,
        });
        offset += raw.len();
    }
    p.finish()
}

struct Line<'a> {
    no: u32,
    start: usize,
    text: &'a str,
}

impl Line<'_> {
    fn pos(&self, b: usize) -> Pos {
        Pos {
            offset: self.start + b,
            line: self.no,
            col: self.text[..b].chars().count() as u32 + 1,
        }
    }
    fn span(&self, a: usize, b: usize) -> Span {
        Span {
            start: self.pos(a),
            end: self.pos(b),
        }
    }
}

/// Where an item stands, which decides the keywords it may use.
#[derive(Debug, Clone, Copy, PartialEq)]
enum Ctx {
    MapTop,
    RulesTop,
    FlowTop,
    WiringTop,
    Layer,
    Module,
    Fn,
    RefList,
    RuleModule,
    Step,
    Invariant,
    When,
    Then,
    Wire,
    WireDep,
    Leaf(NodeKind),
    Unknown,
}

impl Ctx {
    fn of(section: SectionKind, parent: Option<NodeKind>) -> Ctx {
        use NodeKind as K;
        match parent {
            None => match section {
                SectionKind::Map => Ctx::MapTop,
                SectionKind::Rules => Ctx::RulesTop,
                SectionKind::Flow => Ctx::FlowTop,
                SectionKind::Wiring => Ctx::WiringTop,
            },
            Some(K::Layer) => Ctx::Layer,
            Some(K::Module) => Ctx::Module,
            Some(K::Fn) => Ctx::Fn,
            Some(K::Layers | K::Entry) => Ctx::RefList,
            Some(K::RuleModule) => Ctx::RuleModule,
            Some(K::Step) => Ctx::Step,
            Some(K::Invariant) => Ctx::Invariant,
            Some(K::When) if section == SectionKind::Flow => Ctx::When,
            Some(K::Then) => Ctx::Then,
            Some(K::Wire) => Ctx::Wire,
            Some(K::WireDep) => Ctx::WireDep,
            Some(K::Unknown) => Ctx::Unknown,
            Some(k) => Ctx::Leaf(k),
        }
    }

    fn keywords(self) -> &'static [&'static str] {
        const RULES: &[&str] = &["layers", "allow", "deny", "entry", "module", "no-cycles"];
        match self {
            Ctx::MapTop => &[
                "layer",
                "layers",
                "allow",
                "deny",
                "entry",
                "module",
                "no-cycles",
            ],
            Ctx::RulesTop => RULES,
            Ctx::FlowTop => &[
                "kind",
                "trigger",
                "step",
                "reads",
                "emits",
                "calls",
                "invariant",
                "when",
                "test",
            ],
            Ctx::WiringTop => &["wire"],
            Ctx::Layer => &["module"],
            Ctx::Module => &["module", "fn", "type", "event"],
            Ctx::Fn => &["calls"],
            Ctx::RuleModule => &["exports", "no-cycles"],
            Ctx::Step => &["step", "reads", "emits", "calls", "when", "test"],
            Ctx::Invariant | Ctx::Then => &["test"],
            Ctx::When => &["then", "step", "test"],
            Ctx::WireDep => &["when", "compose"],
            Ctx::RefList | Ctx::Wire | Ctx::Leaf(_) | Ctx::Unknown => &[],
        }
    }

    fn keyword_kind(self, kw: &str) -> NodeKind {
        use NodeKind as K;
        match kw {
            "layer" => K::Layer,
            "module" if matches!(self, Ctx::MapTop | Ctx::RulesTop) => K::RuleModule,
            "module" => K::Module,
            "fn" => K::Fn,
            "type" => K::Type,
            "event" => K::Event,
            "calls" => K::Calls,
            "layers" => K::Layers,
            "allow" => K::Allow,
            "deny" => K::Deny,
            "entry" => K::Entry,
            "exports" => K::Exports,
            "no-cycles" => K::NoCycles,
            "kind" => K::Kind,
            "trigger" => K::Trigger,
            "step" => K::Step,
            "reads" => K::Reads,
            "emits" => K::Emits,
            "invariant" => K::Invariant,
            "when" => K::When,
            "then" => K::Then,
            "test" => K::Test,
            "wire" => K::Wire,
            "compose" => K::Compose,
            _ => K::Unknown,
        }
    }
}

struct Parent {
    kind: NodeKind,
    id: Option<String>,
    target: Option<String>,
}

struct Parser<'a> {
    path: &'a Path,
    doc: Document,
    /// Open list items; index = depth.
    stack: Vec<Node>,
    prose: Vec<String>,
    /// Open code fence: (marker, lines).
    fence: Option<(String, Vec<String>)>,
    seen_content: bool,
}

impl Parser<'_> {
    fn err(&mut self, code: Code, span: Span, msg: impl Into<String>) {
        self.doc
            .diagnostics
            .push(Diagnostic::new(code, self.path, span, msg));
    }

    fn section(&mut self) -> &mut Section {
        if self.doc.sections.is_empty() {
            self.doc.sections.push(Section {
                kind: SectionKind::Map,
                heading: None,
                name: None,
                items: Vec::new(),
            });
        }
        self.doc.sections.last_mut().unwrap()
    }

    fn section_kind(&self) -> SectionKind {
        self.doc
            .sections
            .last()
            .map_or(SectionKind::Map, |s| s.kind)
    }

    fn flush_prose(&mut self) {
        if !self.prose.is_empty() {
            let lines = std::mem::take(&mut self.prose);
            self.section().items.push(Item::Prose { lines });
        }
    }

    fn close_list(&mut self, depth: usize) {
        while self.stack.len() > depth {
            let node = self.stack.pop().unwrap();
            match self.stack.last_mut() {
                Some(parent) => parent.children.push(node),
                None => self.section().items.push(Item::Node(Box::new(node))),
            }
        }
    }

    fn finish(mut self) -> Document {
        if let Some((_, lines)) = self.fence.take() {
            self.section().items.push(Item::Code { lines });
        }
        self.flush_prose();
        self.close_list(0);
        self.doc
    }

    fn line(&mut self, l: &Line) {
        let text = l.text;
        if let Some((marker, lines)) = &mut self.fence {
            lines.push(text.trim_end().to_string());
            if text.trim() == marker.as_str() {
                let (_, lines) = self.fence.take().unwrap();
                self.section().items.push(Item::Code { lines });
            }
            return;
        }
        if text.trim().is_empty() {
            self.flush_prose();
            return;
        }
        if !self.seen_content && text.starts_with("<!--") && text.contains("keylang:generated") {
            self.seen_content = true;
            self.doc.generated = Some(text.trim_end().to_string());
            return;
        }
        self.seen_content = true;

        let ws_len = text.len() - text.trim_start_matches([' ', '\t']).len();
        let ws = &text[..ws_len];
        if ws.contains('\t') {
            self.err(
                Code::K003,
                l.span(0, ws_len),
                "tab in indentation; indent with 2 spaces",
            );
        }
        let indent: usize = ws.chars().map(|c| if c == '\t' { 2 } else { 1 }).sum();
        let rest = &text[ws_len..];

        if indent == 0 && (rest == "#" || rest.starts_with("# ")) {
            self.heading(l);
        } else if rest.starts_with("```") || rest.starts_with("~~~") {
            self.flush_prose();
            self.close_list(0);
            let ch = rest.as_bytes()[0] as char;
            let marker: String = rest.chars().take_while(|&c| c == ch).collect();
            self.fence = Some((marker, vec![text.trim_end().to_string()]));
        } else if is_bullet(rest) {
            self.item(l, ws_len, indent);
        } else if indent >= 2 && !self.stack.is_empty() {
            // Description of the deepest open item whose content column fits.
            let depth = ((indent - 2) / 2).min(self.stack.len() - 1);
            let start = ws_len;
            let end = text.trim_end().len();
            self.stack[depth].description.push(Spanned {
                value: text[start..end].to_string(),
                span: l.span(start, end),
            });
        } else {
            self.close_list(0);
            self.prose.push(text.trim_end().to_string());
        }
    }

    fn heading(&mut self, l: &Line) {
        self.flush_prose();
        self.close_list(0);
        let (tokens, _) = lex(l, 1, &mut Vec::new());
        let title = render_tokens(&tokens);
        let full = l.span(0, l.text.trim_end().len());
        let (kind, known) = match tokens.first().map(|t| t.text.as_str()) {
            Some("map") => (SectionKind::Map, true),
            Some("rules") => (SectionKind::Rules, true),
            Some("flow") => (SectionKind::Flow, true),
            Some("wiring") => (SectionKind::Wiring, true),
            _ => (SectionKind::Map, false),
        };
        let mut name = None;
        if !known {
            self.err(
                Code::K006,
                full,
                format!("unknown section `# {title}`; expected `map`, `rules`, `flow <name>` or `wiring` (treated as map)"),
            );
        } else if let Some(t) = tokens.get(1) {
            if is_segment(&t.text) {
                name = Some(Spanned {
                    value: t.text.clone(),
                    span: t.span,
                });
            } else {
                self.err(
                    Code::K005,
                    t.span,
                    format!("invalid section name `{}`", t.text),
                );
            }
            if let Some(extra) = tokens.get(2) {
                self.err(Code::K005, extra.span, "unexpected words in heading");
            }
        } else if kind == SectionKind::Flow {
            self.err(
                Code::K005,
                full,
                "`# flow` needs a name, e.g. `# flow checkout`",
            );
        }
        self.doc.sections.push(Section {
            kind,
            heading: Some(Spanned {
                value: title,
                span: full,
            }),
            name,
            items: Vec::new(),
        });
    }

    fn item(&mut self, l: &Line, ws_len: usize, indent: usize) {
        self.flush_prose();
        let bullet_span = l.span(ws_len, ws_len + 1);
        if !indent.is_multiple_of(2) {
            self.err(
                Code::K003,
                bullet_span,
                format!("indentation must be a multiple of 2 spaces, found {indent}"),
            );
        }
        let mut depth = indent / 2;
        if depth > self.stack.len() {
            self.err(
                Code::K003,
                bullet_span,
                format!(
                    "item indented too deep: {indent} spaces, at most {} expected here",
                    self.stack.len() * 2
                ),
            );
            depth = self.stack.len();
        }
        self.close_list(depth);
        self.section();

        let head =
            ws_len + 1 + (l.text.len() - ws_len - 1 - l.text[ws_len + 1..].trim_start().len());
        if l.text[head..].trim().is_empty() {
            self.err(Code::K003, bullet_span, "empty list item");
            return;
        }
        let parent = self.stack.last().map(|n| Parent {
            kind: n.kind,
            id: n.id.clone(),
            target: n.refs.first().map(|r| r.target.clone()),
        });
        let mut diags = Vec::new();
        let (tokens, comment) = lex(l, head, &mut diags);
        for d in diags {
            self.err(Code::K005, d.0, d.1);
        }
        let mut node = Node {
            kind: NodeKind::Unknown,
            keyword: None,
            name: None,
            id: None,
            link: None,
            refs: Vec::new(),
            text: None,
            label: None,
            tokens,
            comment,
            description: Vec::new(),
            children: Vec::new(),
            span: l.span(ws_len, l.text.trim_end().len()),
        };
        let ctx = Ctx::of(self.section_kind(), parent.as_ref().map(|p| p.kind));
        self.interpret(&mut node, l, ctx, parent.as_ref());
        self.stack.push(node);
    }

    fn interpret(&mut self, n: &mut Node, l: &Line, ctx: Ctx, parent: Option<&Parent>) {
        let Some(first) = n.tokens.first().cloned() else {
            self.err(Code::K005, n.span, "item has no content");
            return;
        };
        let is_kw = first.kind == TokenKind::Word && ctx.keywords().contains(&first.text.as_str());
        if !is_kw {
            return self.bare(n, ctx, parent);
        }
        n.keyword = Some(first.span);
        n.kind = ctx.keyword_kind(&first.text);
        let rest: Vec<Token> = n.tokens[1..].to_vec();
        let parent_id = parent.and_then(|p| p.id.clone());
        use NodeKind as K;
        match n.kind {
            K::Layer => self.decl(n, &rest, None, false),
            K::Module | K::Fn | K::Type | K::Event => {
                let sig = n.kind != K::Module;
                self.decl(n, &rest, parent_id, sig);
            }
            K::Calls | K::Reads | K::Allow | K::Deny => {
                let min = if matches!(n.kind, K::Allow | K::Deny) {
                    2
                } else {
                    1
                };
                self.ref_list(n, &rest, min);
            }
            K::Exports => {
                let base = parent.and_then(|p| p.target.clone());
                for t in rest.iter().filter(|t| t.kind != TokenKind::Comma) {
                    if t.kind == TokenKind::Word && is_segment(&t.text) {
                        n.refs.push(Ref {
                            text: t.text.clone(),
                            target: base
                                .as_ref()
                                .map_or(t.text.clone(), |b| format!("{b}.{}", t.text)),
                            span: t.span,
                        });
                    } else {
                        self.err(
                            Code::K005,
                            t.span,
                            format!("expected a name, found `{}`", t.text),
                        );
                    }
                }
                if n.refs.is_empty() && rest.is_empty() {
                    self.err(Code::K005, n.span, "`exports` needs at least one name");
                }
            }
            K::Layers => self.layers(n, &rest),
            K::Entry | K::NoCycles => {
                if let Some(t) = rest.first() {
                    let kw = n.kind.as_str();
                    let hint = if n.kind == K::Entry {
                        "; list entries as nested items"
                    } else {
                        ""
                    };
                    self.err(
                        Code::K005,
                        t.span,
                        format!("`{kw}` takes no arguments{hint}"),
                    );
                }
            }
            K::RuleModule | K::Trigger | K::Step | K::Wire | K::Compose => self.one_ref(n, &rest),
            K::Kind => match rest.as_slice() {
                [t] if t.text == "business" || t.text == "technical" => n.text = Some(spanned(t)),
                _ => self.err(
                    Code::K005,
                    n.span,
                    "`kind` must be `business` or `technical`",
                ),
            },
            K::Emits => {
                let r = match rest.first() {
                    Some(t) if t.text == "event" => &rest[1..],
                    _ => &rest[..],
                };
                match r {
                    [t] if t.kind == TokenKind::Word => n.text = Some(spanned(t)),
                    _ => self.err(Code::K005, n.span, "expected `emits [event] <name>`"),
                }
            }
            K::Invariant => self.free_text(n, l, &rest),
            K::When if ctx == Ctx::WireDep => {
                let arrow = rest.iter().position(|t| t.text == "→" || t.text == "->");
                match arrow {
                    Some(i) if i > 0 => {
                        self.free_text(n, l, &rest[..i]);
                        self.one_ref(n, &rest[i + 1..]);
                    }
                    _ => self.err(Code::K005, n.span, "expected `when <condition> → <id>`"),
                }
            }
            K::When => self.free_text(n, l, &rest),
            K::Then => match rest.as_slice() {
                [t] if t.kind == TokenKind::Word && t.text.contains('.') && is_id(&t.text) => {
                    self.one_ref(n, &rest)
                }
                _ => self.free_text(n, l, &rest),
            },
            K::Test => match rest.as_slice() {
                [file, tail @ ..] if file.kind == TokenKind::Word => {
                    n.text = Some(spanned(file));
                    match tail {
                        [] => {}
                        [q] if q.kind == TokenKind::Quoted => {
                            n.label = Some(Spanned {
                                value: q.text.trim_matches('"').to_string(),
                                span: q.span,
                            })
                        }
                        [t, ..] => {
                            self.err(Code::K005, t.span, "expected `test <file> \"<name>\"`")
                        }
                    }
                }
                _ => self.err(Code::K005, n.span, "expected `test <file> \"<name>\"`"),
            },
            _ => {}
        }
    }

    /// Item whose first word is not a keyword of its context.
    fn bare(&mut self, n: &mut Node, ctx: Ctx, parent: Option<&Parent>) {
        let tokens = n.tokens.clone();
        let parent_id = parent.and_then(|p| p.id.clone());
        match ctx {
            Ctx::MapTop => {
                n.kind = NodeKind::Layer;
                self.decl(n, &tokens, None, false);
            }
            Ctx::Layer => {
                n.kind = NodeKind::Module;
                self.decl(n, &tokens, parent_id, false);
            }
            Ctx::Module | Ctx::Wire => {
                n.kind = if ctx == Ctx::Module {
                    NodeKind::Dep
                } else {
                    NodeKind::WireDep
                };
                match tokens.as_slice() {
                    [alias, target] if alias.kind == TokenKind::Word && is_segment(&alias.text) => {
                        n.name = Some(spanned(alias));
                        if ctx == Ctx::Module {
                            n.id = parent_id.map(|p| format!("{p}.{}", alias.text));
                        }
                        self.one_ref(n, std::slice::from_ref(target));
                    }
                    _ => {
                        n.kind = NodeKind::Unknown;
                        let what = if ctx == Ctx::Module {
                            "`fn`, `type`, `event`, `module` or a dependency `<alias> <path>`"
                        } else {
                            "a dependency `<alias> <path>`"
                        };
                        self.err(Code::K005, n.span, format!("expected {what}"));
                    }
                }
            }
            Ctx::RefList => {
                n.kind = NodeKind::Ref;
                self.one_ref(n, &tokens);
            }
            Ctx::Unknown => {}
            Ctx::Leaf(k) => {
                self.err(
                    Code::K004,
                    n.span,
                    format!("`{}` cannot have nested items", k.as_str()),
                );
            }
            _ => {
                let t = &tokens[0];
                let expected = ctx.keywords().join(", ");
                self.err(
                    Code::K004,
                    t.span,
                    format!(
                        "unknown keyword `{}` here; expected one of: {expected}",
                        t.text
                    ),
                );
            }
        }
    }

    /// `<name>` or `[name](path#Lnn)` + optional signature.
    fn decl(&mut self, n: &mut Node, rest: &[Token], parent_id: Option<String>, sig: bool) {
        let Some(t) = rest.first() else {
            self.err(
                Code::K005,
                n.span,
                format!("`{}` needs a name", n.kind.as_str()),
            );
            return;
        };
        let (name, link) = match t.kind {
            TokenKind::Word => (t.text.clone(), None),
            TokenKind::Link => {
                let link = parse_link(t);
                (link.text.clone(), Some(link))
            }
            _ => (String::new(), None),
        };
        if !is_segment(&name) {
            self.err(Code::K005, t.span, format!("invalid name `{}`", t.text));
            return;
        }
        let name_span = match &link {
            // Point at the link text, i.e. just after `[`.
            Some(_) => Span {
                start: Pos {
                    offset: t.span.start.offset + 1,
                    line: t.span.start.line,
                    col: t.span.start.col + 1,
                },
                end: Pos {
                    offset: t.span.start.offset + 1 + name.len(),
                    line: t.span.start.line,
                    col: t.span.start.col + 1 + name.chars().count() as u32,
                },
            },
            None => t.span,
        };
        n.id = match (n.kind, parent_id) {
            (NodeKind::Layer, _) => Some(name.clone()),
            (_, Some(p)) => Some(format!("{p}.{name}")),
            (_, None) => None,
        };
        n.name = Some(Spanned {
            value: name,
            span: name_span,
        });
        n.link = link;
        let tail = &rest[1..];
        if let (Some(first), Some(last)) = (tail.first(), tail.last()) {
            if sig {
                n.text = Some(Spanned {
                    value: render_tokens(tail),
                    span: Span {
                        start: first.span.start,
                        end: last.span.end,
                    },
                });
            } else {
                let hint = if n.kind == NodeKind::Layer {
                    " (a dependency `<alias> <path>` must be nested under a module)"
                } else {
                    ""
                };
                let (kind, name) = (n.kind.as_str(), &n.name.as_ref().unwrap().value);
                let msg = format!("unexpected arguments after {kind} `{name}`{hint}");
                self.err(Code::K005, first.span, msg);
            }
        }
    }

    fn make_ref(&mut self, t: &Token) -> Option<Ref> {
        if t.kind == TokenKind::Word && is_id(&t.text) {
            Some(Ref {
                text: t.text.clone(),
                target: t.text.clone(),
                span: t.span,
            })
        } else {
            self.err(
                Code::K005,
                t.span,
                format!("expected an ID, found `{}`", t.text),
            );
            None
        }
    }

    fn one_ref(&mut self, n: &mut Node, rest: &[Token]) {
        match rest {
            [t] => n.refs.extend(self.make_ref(t)),
            [] => self.err(Code::K005, n.span, "expected an ID"),
            [_, t, ..] => self.err(Code::K005, t.span, "expected a single ID"),
        }
    }

    fn ref_list(&mut self, n: &mut Node, rest: &[Token], min: usize) {
        for t in rest.iter().filter(|t| t.kind != TokenKind::Comma) {
            if let Some(r) = self.make_ref(t) {
                n.refs.push(r);
            }
        }
        let count = rest.iter().filter(|t| t.kind != TokenKind::Comma).count();
        if count < min {
            let msg = format!("`{}` needs at least {min} ID(s)", n.kind.as_str());
            self.err(Code::K005, n.span, msg);
        }
    }

    /// `layers a < b < c`
    fn layers(&mut self, n: &mut Node, rest: &[Token]) {
        for (i, t) in rest.iter().enumerate() {
            if i % 2 == 1 {
                if t.text != "<" {
                    self.err(
                        Code::K005,
                        t.span,
                        format!("expected `<`, found `{}`", t.text),
                    );
                }
            } else if let Some(r) = self.make_ref(t) {
                n.refs.push(r);
            }
        }
        if rest.is_empty() || rest.len().is_multiple_of(2) {
            self.err(Code::K005, n.span, "expected `layers <a> < <b> …`");
        }
    }

    fn free_text(&mut self, n: &mut Node, l: &Line, rest: &[Token]) {
        match (rest.first(), rest.last()) {
            (Some(a), Some(b)) => {
                let (s, e) = (a.span.start.offset - l.start, b.span.end.offset - l.start);
                n.text = Some(Spanned {
                    value: l.text[s..e].to_string(),
                    span: l.span(s, e),
                });
            }
            _ => {
                let msg = format!("`{}` needs a description", n.kind.as_str());
                self.err(Code::K005, n.span, msg);
            }
        }
    }
}

fn spanned(t: &Token) -> Spanned<String> {
    Spanned {
        value: t.text.clone(),
        span: t.span,
    }
}

fn is_bullet(rest: &str) -> bool {
    let mut c = rest.chars();
    matches!(c.next(), Some('-' | '*' | '+')) && matches!(c.next(), None | Some(' '))
}

/// A single ID segment: letter or `_`, then letters, digits, `_`, `-`.
pub fn is_segment(s: &str) -> bool {
    let mut c = s.chars();
    c.next().is_some_and(|f| f.is_alphabetic() || f == '_')
        && c.all(|ch| ch.is_alphanumeric() || ch == '_' || ch == '-')
}

/// A dotted ID: `segment(.segment)*`.
pub fn is_id(s: &str) -> bool {
    s.split('.').all(is_segment)
}

fn parse_link(t: &Token) -> Link {
    let close = t.text.find("](").unwrap_or(t.text.len());
    let text = t.text[1..close].to_string();
    let target = t.text[close + 2..t.text.len() - 1].to_string();
    let (path, frag) = target.split_once('#').unwrap_or((&target, ""));
    let line = frag
        .strip_prefix('L')
        .map(|s| s.split('-').next().unwrap_or(""))
        .and_then(|s| s.parse().ok());
    Link {
        text,
        path: path.to_string(),
        target: target.clone(),
        line,
        span: t.span,
    }
}

/// Split an item head into tokens. Words end at whitespace or `,`;
/// `[text](target)` and `"quoted"` are single tokens; `<!-- … -->` ends the
/// head and is returned separately.
fn lex(
    l: &Line,
    start: usize,
    errs: &mut Vec<(Span, String)>,
) -> (Vec<Token>, Option<Spanned<String>>) {
    let s = l.text;
    let b = s.as_bytes();
    let mut i = start;
    let mut tokens = Vec::new();
    let mut comment = None;
    let tok = |kind, a: usize, e: usize| Token {
        kind,
        text: s[a..e].to_string(),
        span: l.span(a, e),
    };
    while i < b.len() {
        if b[i] == b' ' || b[i] == b'\t' {
            i += 1;
            continue;
        }
        if s[i..].starts_with("<!--") {
            let e = s.trim_end().len();
            comment = Some(Spanned {
                value: s[i..e].to_string(),
                span: l.span(i, e),
            });
            break;
        }
        let word_end = |from: usize| {
            s[from..]
                .find([' ', '\t', ','])
                .map_or(s.len(), |k| from + k)
        };
        let (kind, e) = match b[i] {
            b',' => (TokenKind::Comma, i + 1),
            b'[' => match link_end(s, i) {
                Some(e) => (TokenKind::Link, e),
                None => {
                    errs.push((
                        l.span(i, word_end(i)),
                        "malformed link, expected `[name](path#Lnn)`".into(),
                    ));
                    (TokenKind::Word, word_end(i))
                }
            },
            b'"' => match s[i + 1..].find('"') {
                Some(k) => (TokenKind::Quoted, i + k + 2),
                None => {
                    errs.push((l.span(i, word_end(i)), "unterminated quote".into()));
                    (TokenKind::Word, word_end(i))
                }
            },
            _ => (TokenKind::Word, word_end(i)),
        };
        tokens.push(tok(kind, i, e));
        i = e;
    }
    (tokens, comment)
}

fn link_end(s: &str, i: usize) -> Option<usize> {
    let close = i + s[i..].find(']')?;
    if !s[close + 1..].starts_with('(') {
        return None;
    }
    let end = close + 1 + s[close + 1..].find(')')?;
    let target = &s[close + 2..end];
    (close > i + 1 && !target.is_empty() && !target.contains(char::is_whitespace))
        .then_some(end + 1)
}

/// Canonical rendering of head tokens: single spaces, `a, b` for commas.
pub(crate) fn render_tokens(tokens: &[Token]) -> String {
    let mut out = String::new();
    for t in tokens {
        if !out.is_empty() && t.kind != TokenKind::Comma {
            out.push(' ');
        }
        out.push_str(&t.text);
    }
    out
}
