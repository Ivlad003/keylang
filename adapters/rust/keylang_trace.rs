//! keylang trace adapter for Rust: explicit spans, JSONL schema 1, no dependencies.
//!
//! Rust has no runtime hook to wrap a function, so a flow's functions mark
//! themselves. Copy or `#[path]`-include this file as a module, then:
//!
//! ```ignore
//! fn place() {
//!     let _span = keylang_trace::span("domain.order.place");
//!     // …
//! }
//!
//! fn main() {
//!     run();
//!     keylang_trace::finish(); // writes the trace; spans still open are reported as open
//! }
//! ```
//!
//! Environment (nothing is recorded without `KEYLANG_TRACE`):
//!   KEYLANG_TRACE        JSONL file to append to
//!   KEYLANG_TRACE_PLAN   plan from `keylang trace-plan <flow>` (snapshot id, the flow's functions)
//!   KEYLANG_TRACE_TEST   test id
//!   KEYLANG_TRACE_RUN    run id shared by the tests of one run (default: time and pid)
//!   KEYLANG_TRACE_ROOT   repository root the plan's paths are relative to (default: cwd)
//!
//! `instrumented` lists the plan's functions whose file contains
//! `span("<id>")`: a step without a span is unobserved, not missing. Spans
//! nest by the call stack of each thread; a span begun on another thread or
//! in an `async` task is a root of its own.

#![allow(dead_code)]

use std::cell::RefCell;
use std::collections::BTreeSet;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

struct Tracer {
    file: String,
    snapshot: String,
    flow: String,
    test: String,
    run: String,
    clock: String,
    instrumented: Vec<String>,
    start: Instant,
    seq: AtomicU64,
    spans: AtomicU64,
    lines: Mutex<Vec<String>>,
    open: Mutex<BTreeSet<String>>,
}

static TRACER: OnceLock<Option<Tracer>> = OnceLock::new();

thread_local! {
    static STACK: RefCell<Vec<String>> = const { RefCell::new(Vec::new()) };
}

/// A span of `id` until the guard is dropped. Without `KEYLANG_TRACE` it records nothing.
pub fn span(id: &'static str) -> Span {
    let Some(tracer) = tracer() else { return Span { id: None } };
    let n = tracer.spans.fetch_add(1, Ordering::SeqCst) + 1;
    let span_id = format!("{}:s{}", tracer.clock, n);
    let parent = STACK.with(|s| s.borrow().last().cloned());
    let parent = parent.map(|p| json_string(&p)).unwrap_or_else(|| "null".to_string());
    tracer.write(&format!(
        "\"event\":\"start\",\"spanId\":{},\"parentSpanId\":{},\"symbolId\":{},\"clockId\":{},\"seq\":{},\"ts\":{}",
        json_string(&span_id),
        parent,
        json_string(id),
        json_string(&tracer.clock),
        tracer.next_seq(),
        tracer.ts()
    ));
    tracer.open.lock().unwrap().insert(span_id.clone());
    STACK.with(|s| s.borrow_mut().push(span_id.clone()));
    Span { id: Some(span_id) }
}

pub struct Span {
    id: Option<String>,
}

impl Drop for Span {
    fn drop(&mut self) {
        let (Some(tracer), Some(span_id)) = (tracer(), self.id.take()) else { return };
        // A panic unwinding through the span ends it with an error.
        let outcome = if std::thread::panicking() { "error" } else { "ok" };
        STACK.with(|s| {
            let mut stack = s.borrow_mut();
            if let Some(at) = stack.iter().rposition(|x| *x == span_id) {
                stack.remove(at);
            }
        });
        tracer.open.lock().unwrap().remove(&span_id);
        tracer.write(&format!(
            "\"event\":\"end\",\"spanId\":{},\"outcome\":\"{}\",\"clockId\":{},\"seq\":{},\"ts\":{}",
            json_string(&span_id),
            outcome,
            json_string(&tracer.clock),
            tracer.next_seq(),
            tracer.ts()
        ));
    }
}

/// Write the trace with its `run` record. Call once, at the end of `main`.
pub fn finish() {
    let Some(tracer) = tracer() else { return };
    let open: Vec<String> = tracer.open.lock().unwrap().iter().cloned().collect();
    let list = |items: &[String]| items.iter().map(|x| json_string(x)).collect::<Vec<_>>().join(",");
    tracer.write(&format!(
        "\"event\":\"run\",\"complete\":{},\"dropped\":0,\"instrumented\":[{}],\"open\":[{}]",
        open.is_empty(),
        list(&tracer.instrumented),
        list(&open)
    ));
    let lines = std::mem::take(&mut *tracer.lines.lock().unwrap());
    if let Some(dir) = Path::new(&tracer.file).parent() {
        let _ = fs::create_dir_all(dir);
    }
    let mut out = OpenOptions::new().create(true).append(true).open(&tracer.file).expect("keylang trace: cannot open KEYLANG_TRACE");
    out.write_all(format!("{}\n", lines.join("\n")).as_bytes()).expect("keylang trace: cannot write KEYLANG_TRACE");
}

impl Tracer {
    fn write(&self, event: &str) {
        let line = format!(
            "{{\"schemaVersion\":1,\"snapshotId\":{},\"runId\":{},\"testId\":{},\"flow\":{},\"traceId\":{},{}}}",
            json_string(&self.snapshot),
            json_string(&self.run),
            json_string(&self.test),
            json_string(&self.flow),
            json_string(&format!("{}:{}", self.run, self.test)),
            event
        );
        self.lines.lock().unwrap().push(line);
    }

    fn next_seq(&self) -> u64 {
        self.seq.fetch_add(1, Ordering::SeqCst) + 1
    }

    fn ts(&self) -> f64 {
        self.start.elapsed().as_secs_f64() * 1000.0
    }
}

fn tracer() -> Option<&'static Tracer> {
    TRACER.get_or_init(init).as_ref()
}

fn init() -> Option<Tracer> {
    let file = std::env::var("KEYLANG_TRACE").ok()?;
    let fail = |m: String| -> ! { panic!("keylang trace: {m}") };
    let plan_path = std::env::var("KEYLANG_TRACE_PLAN").unwrap_or_else(|_| fail("KEYLANG_TRACE_PLAN is required".into()));
    let test = std::env::var("KEYLANG_TRACE_TEST").unwrap_or_else(|_| fail("KEYLANG_TRACE_TEST is required".into()));
    let text = fs::read_to_string(&plan_path).unwrap_or_else(|e| fail(format!("{plan_path}: {e}")));
    let plan = Json::parse(&text).unwrap_or_else(|| fail(format!("{plan_path}: invalid JSON")));
    if plan.get("schemaVersion").and_then(Json::number) != Some(1.0) {
        fail(format!("{plan_path}: not a plan of schema 1 from `keylang trace-plan`"));
    }
    let root = std::env::var("KEYLANG_TRACE_ROOT").unwrap_or_else(|_| ".".into());
    let mut instrumented = Vec::new();
    for symbol in plan.get("symbols").and_then(Json::array).unwrap_or(&[]) {
        let (Some(id), Some(path)) = (symbol.get("id").and_then(Json::string), symbol.get("file").and_then(Json::string)) else { continue };
        let source = fs::read_to_string(Path::new(&root).join(path)).unwrap_or_default();
        if source.contains(&format!("span(\"{id}\")")) {
            instrumented.push(id.to_string());
        }
    }
    instrumented.sort();
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let pid = std::process::id();
    Some(Tracer {
        file,
        snapshot: plan.get("snapshotId").and_then(Json::string).unwrap_or_default().to_string(),
        flow: plan.get("flow").and_then(Json::string).unwrap_or_default().to_string(),
        test,
        run: std::env::var("KEYLANG_TRACE_RUN").unwrap_or_else(|_| format!("{now:x}-{pid}")),
        clock: format!("rs-{pid}-{:x}", now & 0xffff_ffff),
        instrumented,
        start: Instant::now(),
        seq: AtomicU64::new(0),
        spans: AtomicU64::new(0),
        lines: Mutex::new(Vec::new()),
        open: Mutex::new(BTreeSet::new()),
    })
}

fn json_string(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

/// Just enough JSON to read a plan.
enum Json {
    Null,
    Bool(bool),
    Number(f64),
    String(String),
    Array(Vec<Json>),
    Object(Vec<(String, Json)>),
}

impl Json {
    fn parse(text: &str) -> Option<Json> {
        let mut p = Parser { s: text.as_bytes(), i: 0 };
        let v = p.value()?;
        p.ws();
        (p.i == p.s.len()).then_some(v)
    }
    fn get(&self, key: &str) -> Option<&Json> {
        match self {
            Json::Object(fields) => fields.iter().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }
    fn string(&self) -> Option<&str> {
        match self {
            Json::String(s) => Some(s),
            _ => None,
        }
    }
    fn number(&self) -> Option<f64> {
        match self {
            Json::Number(n) => Some(*n),
            _ => None,
        }
    }
    fn array(&self) -> Option<&[Json]> {
        match self {
            Json::Array(items) => Some(items),
            _ => None,
        }
    }
}

struct Parser<'a> {
    s: &'a [u8],
    i: usize,
}

impl Parser<'_> {
    fn ws(&mut self) {
        while self.i < self.s.len() && self.s[self.i].is_ascii_whitespace() {
            self.i += 1;
        }
    }
    fn eat(&mut self, b: u8) -> bool {
        self.ws();
        if self.s.get(self.i) == Some(&b) {
            self.i += 1;
            true
        } else {
            false
        }
    }
    fn value(&mut self) -> Option<Json> {
        self.ws();
        match *self.s.get(self.i)? {
            b'{' => {
                self.i += 1;
                let mut fields = Vec::new();
                if self.eat(b'}') {
                    return Some(Json::Object(fields));
                }
                loop {
                    self.ws();
                    let Json::String(key) = self.string()? else { return None };
                    if !self.eat(b':') {
                        return None;
                    }
                    fields.push((key, self.value()?));
                    if self.eat(b'}') {
                        return Some(Json::Object(fields));
                    }
                    if !self.eat(b',') {
                        return None;
                    }
                }
            }
            b'[' => {
                self.i += 1;
                let mut items = Vec::new();
                if self.eat(b']') {
                    return Some(Json::Array(items));
                }
                loop {
                    items.push(self.value()?);
                    if self.eat(b']') {
                        return Some(Json::Array(items));
                    }
                    if !self.eat(b',') {
                        return None;
                    }
                }
            }
            b'"' => self.string(),
            b't' => self.word("true", Json::Bool(true)),
            b'f' => self.word("false", Json::Bool(false)),
            b'n' => self.word("null", Json::Null),
            _ => {
                let start = self.i;
                while self.i < self.s.len() && matches!(self.s[self.i], b'-' | b'+' | b'.' | b'e' | b'E' | b'0'..=b'9') {
                    self.i += 1;
                }
                std::str::from_utf8(&self.s[start..self.i]).ok()?.parse().ok().map(Json::Number)
            }
        }
    }
    fn word(&mut self, w: &str, v: Json) -> Option<Json> {
        if self.s[self.i..].starts_with(w.as_bytes()) {
            self.i += w.len();
            Some(v)
        } else {
            None
        }
    }
    fn string(&mut self) -> Option<Json> {
        if self.s.get(self.i) != Some(&b'"') {
            return None;
        }
        self.i += 1;
        let mut out = String::new();
        loop {
            let rest = std::str::from_utf8(&self.s[self.i..]).ok()?;
            let c = rest.chars().next()?;
            self.i += c.len_utf8();
            match c {
                '"' => return Some(Json::String(out)),
                '\\' => {
                    let e = *self.s.get(self.i)?;
                    self.i += 1;
                    match e {
                        b'n' => out.push('\n'),
                        b't' => out.push('\t'),
                        b'r' => out.push('\r'),
                        b'b' => out.push('\u{8}'),
                        b'f' => out.push('\u{c}'),
                        b'u' => {
                            let hex = std::str::from_utf8(self.s.get(self.i..self.i + 4)?).ok()?;
                            self.i += 4;
                            out.push(char::from_u32(u32::from_str_radix(hex, 16).ok()?).unwrap_or('\u{fffd}'));
                        }
                        other => out.push(other as char),
                    }
                }
                c => out.push(c),
            }
        }
    }
}
