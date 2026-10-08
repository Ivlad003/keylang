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
//! async fn fetch() -> Order {
//!     // A guard must not live across `.await`: wrap the body instead.
//!     keylang_trace::instrument("infra.db.fetch", async move {
//!         // …
//!     })
//!     .await
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
//!   KEYLANG_TRACE_PLAN   plan from `keylang trace-plan <flow>` or `--entry <id>` (snapshot id, functions)
//!   KEYLANG_TRACE_TEST   test id (default: the command line)
//!   KEYLANG_TRACE_RUN    run id shared by the tests of one run (default: time and pid)
//!   KEYLANG_TRACE_ROOT   repository root the plan's paths are relative to (default: cwd)
//!   KEYLANG_FLOW         the flow of the process's run (default: the plan's)
//!
//! A server names the flow of each request: `keylang_trace::flow("<flow>", || …)`
//! for synchronous code, `keylang_trace::in_flow("<flow>", future).await` for
//! async handlers (an axum layer). The spans inside are a run of their own
//! (a run id and a clock of their own), written with its `run` record when the
//! closure returns or the future completes; an empty name only runs the code.
//!
//! Relative paths are the directory the process started in: a constructor
//! that runs before `main` (`.init_array` on ELF targets, `__mod_init_func` on
//! Apple, `.CRT$XCU` on Windows) takes the working directory and writes the
//! three variables back as absolute paths, so a program that changes its
//! directory before its first span or before `finish()` (and a child it starts)
//! reads the plan and writes the trace where the variables meant. On any other
//! target the directory is the one at the first span.
//!
//! Only the plan's functions are recorded. `instrumented` lists those whose
//! body calls `span("<id>")` or `instrument("<id>", …)` in code (not in a
//! comment): a step without one is unobserved, not missing. Spans nest by the
//! stack of each thread. An `instrument`ed future is on that stack only while
//! it is being polled; its span's parent is the span current where the future
//! was created, with a link when that span has already ended. A `span()`
//! guard in async code (an `async fn`, an `async` block or closure in the
//! body, or beside a `.await` outside them) is not recorded and not
//! instrumented: while the future is suspended the guard would stay on the
//! stack and adopt the spans of other futures polled on that thread. A guard
//! in a synchronous fn that only starts async code (`rt.spawn(async move {
//! … })`) is synchronous. A span
//! that ends while a span begun after it is still open (a guard kept across
//! a suspension) makes the run incomplete. A span begun on another thread is
//! a root.

#![allow(dead_code)]

use std::cell::RefCell;
use std::collections::BTreeSet;
use std::fs::{self, OpenOptions};
use std::future::Future;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::task::{Context, Poll};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

struct Tracer {
    file: String,
    snapshot: String,
    instrumented: Vec<String>,
    /// Plan IDs whose marks are recorded: a guard in synchronous code, or `instrument`.
    recorded: BTreeSet<String>,
    start: Instant,
    lines: Mutex<Vec<String>>,
    /// The process's own run; a `flow()` scope is a run of its own.
    process: Arc<Scope>,
    requests: AtomicU64,
}

/// One run being recorded: the process's, or one request's (`flow`, `in_flow`).
struct Scope {
    run: String,
    test: String,
    flow: String,
    clock: String,
    seq: AtomicU64,
    spans: AtomicU64,
    open: Mutex<BTreeSet<String>>,
    /// A span ended while a span begun after it on the same thread was still open: nesting is unknown.
    interleaved: AtomicBool,
}

impl Scope {
    fn new(run: String, test: String, flow: String, clock: String) -> Scope {
        Scope { run, test, flow, clock, seq: AtomicU64::new(0), spans: AtomicU64::new(0), open: Mutex::new(BTreeSet::new()), interleaved: AtomicBool::new(false) }
    }

    /// The span is this run's: span ids start with the clock of their run.
    fn owns(&self, span_id: &str) -> bool {
        span_id.len() > self.clock.len() && span_id.starts_with(&self.clock) && span_id.as_bytes()[self.clock.len()] == b':'
    }
}

static TRACER: OnceLock<Option<Tracer>> = OnceLock::new();

/// The working directory the process started in, taken before `main`.
static STARTUP_DIR: OnceLock<Option<PathBuf>> = OnceLock::new();

#[used]
#[cfg_attr(any(target_os = "linux", target_os = "android", target_os = "freebsd", target_os = "netbsd", target_os = "openbsd", target_os = "dragonfly", target_os = "illumos", target_os = "solaris"), unsafe(link_section = ".init_array"))]
#[cfg_attr(any(target_os = "macos", target_os = "ios"), unsafe(link_section = "__DATA,__mod_init_func"))]
#[cfg_attr(windows, unsafe(link_section = ".CRT$XCU"))]
static STARTUP: extern "C" fn() = startup;

/// Before `main`: relative `KEYLANG_TRACE`, `KEYLANG_TRACE_PLAN` and `KEYLANG_TRACE_ROOT` become absolute in the startup directory.
extern "C" fn startup() {
    let dir = STARTUP_DIR.get_or_init(|| std::env::current_dir().ok()).clone();
    let Some(dir) = dir else { return };
    for name in ["KEYLANG_TRACE", "KEYLANG_TRACE_PLAN", "KEYLANG_TRACE_ROOT"] {
        let Some(value) = std::env::var_os(name).filter(|v| !v.is_empty()) else { continue };
        if Path::new(&value).is_relative() {
            // Single-threaded: nothing else runs before `main`. (`set_var` is `unsafe` from edition 2024.)
            #[allow(unused_unsafe)]
            unsafe {
                std::env::set_var(name, dir.join(&value));
            }
        }
    }
}

/// `path` in the startup directory when it is relative.
fn absolute(path: &str) -> String {
    match STARTUP_DIR.get_or_init(|| std::env::current_dir().ok()) {
        Some(dir) if Path::new(path).is_relative() => dir.join(path).to_string_lossy().into_owned(),
        _ => path.to_string(),
    }
}

thread_local! {
    static STACK: RefCell<Vec<String>> = const { RefCell::new(Vec::new()) };
    /// The `flow` scope this thread runs in; None: the process's run.
    static CURRENT: RefCell<Option<Arc<Scope>>> = const { RefCell::new(None) };
}

/// The run spans begun now on this thread belong to.
fn current(tracer: &Tracer) -> Arc<Scope> {
    CURRENT.with(|c| c.borrow().clone()).unwrap_or_else(|| tracer.process.clone())
}

/// The innermost span of this thread when it is `scope`'s: a span of another run is no parent.
fn parent_in(scope: &Scope) -> Option<String> {
    STACK.with(|s| s.borrow().last().filter(|p| scope.owns(p)).cloned())
}

/// A span of `id` until the guard is dropped. Without `KEYLANG_TRACE`, or for an ID the plan does not record, it records nothing.
pub fn span(id: &'static str) -> Span {
    let Some(tracer) = tracer().filter(|t| t.recorded.contains(id)) else { return Span { id: None, scope: None } };
    let scope = current(tracer);
    let parent = parent_in(&scope);
    let span_id = tracer.begin(&scope, id, parent.as_deref());
    STACK.with(|s| s.borrow_mut().push(span_id.clone()));
    Span { id: Some(span_id), scope: Some(scope) }
}

pub struct Span {
    id: Option<String>,
    scope: Option<Arc<Scope>>,
}

impl Drop for Span {
    fn drop(&mut self) {
        let (Some(tracer), Some(span_id), Some(scope)) = (tracer(), self.id.take(), self.scope.take()) else { return };
        // A panic unwinding through the span ends it with an error.
        let outcome = if std::thread::panicking() { "error" } else { "ok" };
        leave(&scope, &span_id);
        tracer.end(&scope, &span_id, outcome);
    }
}

/// `future` inside a span of `id`: the span begins at the first poll and ends when the future completes.
pub fn instrument<F: Future>(id: &'static str, future: F) -> Instrumented<F> {
    let recorded = tracer().is_some_and(|t| t.recorded.contains(id));
    let scope = tracer().filter(|_| recorded).map(current);
    let parent = scope.as_deref().and_then(parent_in);
    Instrumented { id, recorded, scope, parent, span: None, future: Box::pin(future) }
}

pub struct Instrumented<F> {
    id: &'static str,
    recorded: bool,
    /// The run the future was created in: its span is that run's, whichever thread polls it.
    scope: Option<Arc<Scope>>,
    parent: Option<String>,
    span: Option<String>,
    future: Pin<Box<F>>,
}

impl<F: Future> Future for Instrumented<F> {
    type Output = F::Output;

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<F::Output> {
        let this = self.get_mut();
        let (Some(tracer), Some(scope)) = (tracer().filter(|_| this.recorded), this.scope.clone()) else { return this.future.as_mut().poll(cx) };
        if this.span.is_none() {
            this.span = Some(tracer.begin(&scope, this.id, this.parent.as_deref()));
        }
        let span_id = this.span.clone().unwrap_or_default();
        STACK.with(|s| s.borrow_mut().push(span_id.clone()));
        let result = within(Some(scope.clone()), || this.future.as_mut().poll(cx));
        leave(&scope, &span_id);
        if result.is_ready() {
            this.span = None;
            tracer.end(&scope, &span_id, "ok");
        }
        result
    }
}

impl<F> Drop for Instrumented<F> {
    fn drop(&mut self) {
        // Dropped before it completed: cancelled, or unwound by a panic.
        if let (Some(tracer), Some(span_id), Some(scope)) = (tracer(), self.span.take(), self.scope.as_ref()) {
            tracer.end(scope, &span_id, "error");
        }
    }
}

/// `f` with `scope` as this thread's run (None: the process's), the previous one restored after it, also on a panic.
fn within<T>(scope: Option<Arc<Scope>>, f: impl FnOnce() -> T) -> T {
    struct Restore(Option<Arc<Scope>>);
    impl Drop for Restore {
        fn drop(&mut self) {
            let previous = self.0.take();
            CURRENT.with(|c| *c.borrow_mut() = previous);
        }
    }
    let previous = CURRENT.with(|c| std::mem::replace(&mut *c.borrow_mut(), scope));
    let _restore = Restore(previous);
    f()
}

/// A run of flow `name` of its own (a run id and a clock of its own); None without a tracer or a name.
fn new_scope(name: &str) -> Option<(&'static Tracer, Arc<Scope>)> {
    let tracer = tracer()?;
    if name.is_empty() {
        return None;
    }
    let n = tracer.requests.fetch_add(1, Ordering::SeqCst) + 1;
    let process = &tracer.process;
    Some((tracer, Arc::new(Scope::new(format!("{}.r{n}", process.run), process.test.clone(), name.to_string(), format!("{}.r{n}", process.clock)))))
}

/// Runs `f` as a run of flow `name`: the spans it begins on this thread are that run's, and its `run`
/// record is written when `f` returns (incomplete when it panics). A request handler takes the name
/// from `X-Keylang-Flow`; an empty name, or no `KEYLANG_TRACE`, only runs `f`.
pub fn flow<T>(name: &str, f: impl FnOnce() -> T) -> T {
    let Some((tracer, scope)) = new_scope(name) else { return f() };
    struct Close(&'static Tracer, Arc<Scope>);
    impl Drop for Close {
        fn drop(&mut self) {
            self.0.record(&self.1, std::thread::panicking());
        }
    }
    let _close = Close(tracer, scope.clone());
    within(Some(scope), f)
}

/// `future` as a run of flow `name`, for async handlers (an axum or tower layer): the scope is the
/// thread's run while the future is polled; the `run` record is written when it completes, or as
/// incomplete when it is dropped before.
pub fn in_flow<F: Future>(name: &str, future: F) -> InFlow<F> {
    InFlow { scope: new_scope(name), future: Box::pin(future) }
}

pub struct InFlow<F> {
    scope: Option<(&'static Tracer, Arc<Scope>)>,
    future: Pin<Box<F>>,
}

impl<F: Future> Future for InFlow<F> {
    type Output = F::Output;

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<F::Output> {
        let this = self.get_mut();
        let Some((tracer, scope)) = this.scope.clone() else { return this.future.as_mut().poll(cx) };
        let result = within(Some(scope.clone()), || this.future.as_mut().poll(cx));
        if result.is_ready() {
            this.scope = None;
            tracer.record(&scope, false);
        }
        result
    }
}

impl<F> Drop for InFlow<F> {
    fn drop(&mut self) {
        if let Some((tracer, scope)) = self.scope.take() {
            tracer.record(&scope, true);
        }
    }
}

/// Take `span_id` off this thread's stack; a span above it means spans interleaved.
fn leave(scope: &Scope, span_id: &str) {
    STACK.with(|s| {
        let mut stack = s.borrow_mut();
        if let Some(at) = stack.iter().rposition(|x| x == span_id) {
            if at + 1 != stack.len() {
                scope.interleaved.store(true, Ordering::SeqCst);
            }
            stack.remove(at);
        }
    });
}

/// Write the trace with the process's `run` record. Call once, at the end of `main`.
pub fn finish() {
    let Some(tracer) = tracer() else { return };
    // A server whose every span was a request's has no run of its own to report.
    if tracer.requests.load(Ordering::SeqCst) > 0 && tracer.process.spans.load(Ordering::SeqCst) == 0 {
        tracer.flush();
        return;
    }
    tracer.record(&tracer.process, false);
}

impl Tracer {
    /// Record the start of a span of `id` under `parent`; a parent that has already ended is a link, as for an async continuation.
    fn begin(&self, scope: &Scope, id: &str, parent: Option<&str>) -> String {
        let n = scope.spans.fetch_add(1, Ordering::SeqCst) + 1;
        let span_id = format!("{}:s{}", scope.clock, n);
        let ended = parent.is_some_and(|p| !scope.open.lock().unwrap().contains(p));
        let links = match parent {
            Some(p) if ended => format!(",\"links\":[{}]", json_string(p)),
            _ => String::new(),
        };
        self.write(
            scope,
            &format!(
                "\"event\":\"start\",\"spanId\":{},\"parentSpanId\":{},\"symbolId\":{},\"clockId\":{},\"seq\":{},\"ts\":{}{}",
                json_string(&span_id),
                parent.map(json_string).unwrap_or_else(|| "null".to_string()),
                json_string(id),
                json_string(&scope.clock),
                scope.seq.fetch_add(1, Ordering::SeqCst) + 1,
                self.ts(),
                links
            ),
        );
        scope.open.lock().unwrap().insert(span_id.clone());
        span_id
    }

    fn end(&self, scope: &Scope, span_id: &str, outcome: &str) {
        scope.open.lock().unwrap().remove(span_id);
        self.write(
            scope,
            &format!(
                "\"event\":\"end\",\"spanId\":{},\"outcome\":\"{}\",\"clockId\":{},\"seq\":{},\"ts\":{}",
                json_string(span_id),
                outcome,
                json_string(&scope.clock),
                scope.seq.fetch_add(1, Ordering::SeqCst) + 1,
                self.ts()
            ),
        );
    }

    /// The `run` record of `scope`, then everything not yet in the file.
    fn record(&self, scope: &Scope, failed: bool) {
        let open: Vec<String> = scope.open.lock().unwrap().iter().cloned().collect();
        let list = |items: &[String]| items.iter().map(|x| json_string(x)).collect::<Vec<_>>().join(",");
        self.write(
            scope,
            &format!(
                "\"event\":\"run\",\"clockId\":{},\"complete\":{},\"dropped\":0,\"instrumented\":[{}],\"open\":[{}]",
                json_string(&scope.clock),
                !failed && open.is_empty() && !scope.interleaved.load(Ordering::SeqCst),
                list(&self.instrumented),
                list(&open)
            ),
        );
        self.flush();
    }

    /// Append the events the file does not have yet.
    fn flush(&self) {
        let lines = std::mem::take(&mut *self.lines.lock().unwrap());
        if lines.is_empty() {
            return;
        }
        if let Some(dir) = Path::new(&self.file).parent() {
            let _ = fs::create_dir_all(dir);
        }
        let mut out = OpenOptions::new().create(true).append(true).open(&self.file).expect("keylang trace: cannot open KEYLANG_TRACE");
        out.write_all(format!("{}\n", lines.join("\n")).as_bytes()).expect("keylang trace: cannot write KEYLANG_TRACE");
    }

    fn write(&self, scope: &Scope, event: &str) {
        let line = format!(
            "{{\"schemaVersion\":1,\"snapshotId\":{},\"runId\":{},\"testId\":{},\"flow\":{},\"traceId\":{},{}}}",
            json_string(&self.snapshot),
            json_string(&scope.run),
            json_string(&scope.test),
            json_string(&scope.flow),
            json_string(&format!("{}:{}", scope.run, scope.test)),
            event
        );
        self.lines.lock().unwrap().push(line);
    }

    fn ts(&self) -> f64 {
        self.start.elapsed().as_secs_f64() * 1000.0
    }
}

fn tracer() -> Option<&'static Tracer> {
    TRACER.get_or_init(init).as_ref()
}

fn init() -> Option<Tracer> {
    let file = absolute(&std::env::var("KEYLANG_TRACE").ok()?);
    let fail = |m: String| -> ! { panic!("keylang trace: {m}") };
    let plan_path = absolute(&std::env::var("KEYLANG_TRACE_PLAN").unwrap_or_else(|_| fail("KEYLANG_TRACE_PLAN is required".into())));
    // Without a test id the run is named by the command line.
    let test = std::env::var("KEYLANG_TRACE_TEST").ok().filter(|t| !t.is_empty()).unwrap_or_else(|| std::env::args().collect::<Vec<_>>().join(" "));
    let text = fs::read_to_string(&plan_path).unwrap_or_else(|e| fail(format!("{plan_path}: {e}")));
    let plan = Json::parse(&text).unwrap_or_else(|| fail(format!("{plan_path}: invalid JSON")));
    if plan.get("schemaVersion").and_then(Json::number) != Some(1.0) {
        fail(format!("{plan_path}: not a plan of schema 1 from `keylang trace-plan`"));
    }
    let root = absolute(&std::env::var("KEYLANG_TRACE_ROOT").unwrap_or_else(|_| ".".into()));
    let mut recorded = BTreeSet::new();
    for symbol in plan.get("symbols").and_then(Json::array).unwrap_or(&[]) {
        let (Some(id), Some(path), Some(line)) = (symbol.get("id").and_then(Json::string), symbol.get("file").and_then(Json::string), symbol.get("line").and_then(Json::number)) else { continue };
        let source = fs::read_to_string(Path::new(&root).join(path)).unwrap_or_default();
        let mark = marks(&source, line as usize, id);
        if mark == Mark::Guard || mark == Mark::Instrument {
            recorded.insert(id.to_string());
        }
    }
    let instrumented: Vec<String> = recorded.iter().cloned().collect();
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let pid = std::process::id();
    // `KEYLANG_FLOW` names the flow of the process's run; the plan's flow otherwise.
    let flow = std::env::var("KEYLANG_FLOW").ok().filter(|f| !f.is_empty()).unwrap_or_else(|| plan.get("flow").and_then(Json::string).unwrap_or_default().to_string());
    let run = std::env::var("KEYLANG_TRACE_RUN").unwrap_or_else(|_| format!("{now:x}-{pid}"));
    Some(Tracer {
        file,
        snapshot: plan.get("snapshotId").and_then(Json::string).unwrap_or_default().to_string(),
        instrumented,
        recorded,
        start: Instant::now(),
        lines: Mutex::new(Vec::new()),
        process: Arc::new(Scope::new(run, test, flow, format!("rs-{pid}-{:x}", now & 0xffff_ffff))),
        requests: AtomicU64::new(0),
    })
}

/// How the fn of a plan marks itself.
#[derive(PartialEq)]
enum Mark {
    None,
    /// `span("<id>")` in synchronous code (not an `async fn`, not in an `async` block or closure): the guard lives in one call.
    Guard,
    /// `span("<id>")` in async code: the guard may stay on the thread's stack while the future is suspended, so its nesting is unknown.
    AsyncGuard,
    /// `instrument("<id>", …)`.
    Instrument,
}

/// How the body of the fn that starts on `line` (1-based) marks `id`: code only, not comments or strings.
fn marks(source: &str, line: usize, id: &str) -> Mark {
    let s = source.as_bytes();
    let class = classify(s);
    let mut start = 0;
    for _ in 1..line {
        start = s[start..].iter().position(|&b| b == b'\n').map_or(s.len(), |p| start + p + 1);
    }
    // The body is the first `{` after the signature; a `;` first means the fn has none. Only a `;` outside
    // brackets counts: the one in an array type (`[u8; 32]`, `-> [u8; N]`, `Fn(&[u8; 4])`) is part of the signature.
    let mut nested = 0usize;
    let body = (start..s.len()).find(|&i| {
        if class[i] != CODE {
            return false;
        }
        match s[i] {
            b'(' | b'[' => nested += 1,
            b')' | b']' => nested = nested.saturating_sub(1),
            b'{' => return nested == 0,
            b';' => return nested == 0,
            _ => {}
        }
        false
    });
    let Some(open) = body.filter(|&i| s[i] == b'{') else { return Mark::None };
    // The `}` that closes the `{` at `from`, in code; the end of the source when there is none.
    let closing = |from: usize| {
        let mut depth = 0usize;
        for i in from..s.len() {
            if class[i] != CODE {
                continue;
            }
            if s[i] == b'{' {
                depth += 1;
            } else if s[i] == b'}' {
                depth -= 1;
                if depth == 0 {
                    return i;
                }
            }
        }
        s.len()
    };
    let end = closing(open);
    let quoted = format!("\"{id}\"");
    let skip = |mut i: usize| {
        while i < end && s[i].is_ascii_whitespace() {
            i += 1;
        }
        i
    };
    let word = |i: usize, name: &[u8]| {
        i < end && class[i] == CODE && s[i..end].starts_with(name) && (i == 0 || !(s[i - 1].is_ascii_alphanumeric() || s[i - 1] == b'_' || s[i - 1] == b'#')) && !s.get(i + name.len()).is_some_and(|b| b.is_ascii_alphanumeric() || *b == b'_')
    };
    // Async code: the whole body of an `async fn`; in the body of a synchronous fn, each `async` block or
    // closure (`rt.spawn(async move { … })` leaves the fn's own guard synchronous). A closure with an
    // expression body (`async || f().await`) is taken to run to the end of the fn body.
    let async_fn = (start..open).any(|i| word(i, b"async"));
    let mut blocks: Vec<(usize, usize)> = Vec::new();
    for i in open + 1..end {
        if !word(i, b"async") {
            continue;
        }
        let mut at = skip(i + b"async".len());
        if word(at, b"move") {
            at = skip(at + b"move".len());
        }
        if at < end && s[at] == b'|' {
            let params = (at + 1..end).find(|&k| class[k] == CODE && s[k] == b'|').unwrap_or(end);
            at = skip((params + 1).min(end));
            // A return type needs a block body: `async |x| -> T { … }`.
            if s[at..end].starts_with(b"->") {
                at = (at..end).find(|&k| class[k] == CODE && s[k] == b'{').unwrap_or(end);
            }
            blocks.push(if at < end && s[at] == b'{' { (at, closing(at)) } else { (i, end) });
        } else if at < end && s[at] == b'{' {
            blocks.push((at, closing(at)));
        }
    }
    let in_async = |i: usize| blocks.iter().any(|&(from, to)| from < i && i < to);
    // Outside every `async` block of a synchronous fn, a `.await` is in async code that a macro made.
    let macro_await = (open..end).any(|i| word(i, b"await") && i > 0 && s[i - 1] == b'.' && !in_async(i));
    let mut mark = Mark::None;
    for i in open..end {
        for (name, close) in [(&b"span"[..], b')'), (&b"instrument"[..], b',')] {
            if !word(i, name) {
                continue;
            }
            let paren = skip(i + name.len());
            if paren >= end || s[paren] != b'(' {
                continue;
            }
            let arg = skip(paren + 1);
            if !s[arg..end].starts_with(quoted.as_bytes()) {
                continue;
            }
            let after = skip(arg + quoted.len());
            if after >= end || s[after] != close {
                continue;
            }
            if name == b"instrument" {
                return Mark::Instrument;
            }
            mark = if async_fn || macro_await || in_async(i) { Mark::AsyncGuard } else { Mark::Guard };
        }
    }
    mark
}

const CODE: u8 = 0;
const COMMENT: u8 = 1;
const LITERAL: u8 = 2;

/// Each byte of Rust source as code, comment, or the inside of a string or char literal (its quotes are code).
fn classify(s: &[u8]) -> Vec<u8> {
    let mut class = vec![CODE; s.len()];
    let mut i = 0;
    while i < s.len() {
        let ident_before = i > 0 && (s[i - 1].is_ascii_alphanumeric() || s[i - 1] == b'_');
        if s[i..].starts_with(b"//") {
            while i < s.len() && s[i] != b'\n' {
                class[i] = COMMENT;
                i += 1;
            }
        } else if s[i..].starts_with(b"/*") {
            // Block comments nest.
            let mut depth = 0;
            while i < s.len() {
                if s[i..].starts_with(b"/*") {
                    depth += 1;
                    class[i] = COMMENT;
                    class[i + 1] = COMMENT;
                    i += 2;
                } else if s[i..].starts_with(b"*/") {
                    depth -= 1;
                    class[i] = COMMENT;
                    class[i + 1] = COMMENT;
                    i += 2;
                    if depth == 0 {
                        break;
                    }
                } else {
                    class[i] = COMMENT;
                    i += 1;
                }
            }
        } else if !ident_before && (s[i] == b'r' || s[i..].starts_with(b"br")) && {
            let r = if s[i] == b'r' { i + 1 } else { i + 2 };
            let hashes = s[r..].iter().take_while(|&&b| b == b'#').count();
            s.get(r + hashes) == Some(&b'"')
        } {
            // `r#"…"#`: ends at a quote followed by as many `#`.
            let r = if s[i] == b'r' { i + 1 } else { i + 2 };
            let hashes = s[r..].iter().take_while(|&&b| b == b'#').count();
            let mut j = r + hashes + 1;
            let close: Vec<u8> = std::iter::once(b'"').chain(std::iter::repeat(b'#').take(hashes)).collect();
            while j < s.len() && !s[j..].starts_with(&close) {
                class[j] = LITERAL;
                j += 1;
            }
            i = (j + close.len()).min(s.len());
        } else if s[i] == b'"' {
            let mut j = i + 1;
            while j < s.len() && s[j] != b'"' {
                if s[j] == b'\\' {
                    class[j] = LITERAL;
                    j += 1;
                }
                if j < s.len() {
                    class[j] = LITERAL;
                }
                j += 1;
            }
            i = j + 1;
        } else if s[i] == b'\'' && (s.get(i + 1) == Some(&b'\\') || s.get(i + 2) == Some(&b'\'')) {
            // A char literal (`'"'`, `'\''`); a lifetime (`'a`) has no closing quote.
            let mut j = i + 1;
            if s.get(j) == Some(&b'\\') {
                class[j] = LITERAL;
                j += 1;
            }
            while j < s.len() && s[j] != b'\'' {
                class[j] = LITERAL;
                j += 1;
            }
            i = j + 1;
        } else {
            i += 1;
        }
    }
    class
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
