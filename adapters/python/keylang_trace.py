"""keylang trace adapter for Python: records the functions of one flow as JSONL (schema 1).

    keylang trace-plan <flow> > plan.json
    KEYLANG_TRACE=.keylang/trace/<flow>.jsonl KEYLANG_TRACE_PLAN=plan.json \\
    KEYLANG_TRACE_TEST="<test id>" python3 keylang_trace.py <script> [args...]

Environment:
    KEYLANG_TRACE        JSONL file to append to; without it the script runs untraced
    KEYLANG_TRACE_PLAN   plan from `keylang trace-plan <flow>` or `--entry <id>` (required with KEYLANG_TRACE)
    KEYLANG_TRACE_TEST   test id (default: the command line)
    KEYLANG_TRACE_RUN    run id shared by the tests of one run (default: time and pid)
    KEYLANG_TRACE_ROOT   repository root the plan's paths are relative to (default: cwd)
    KEYLANG_FLOW         the flow the process's run is of (default: the plan's)

A server names the flow of each request with `keylang_trace.flow(name)`, a
context manager (contextvars): the spans inside it, on the thread or task
that entered it, are a run of their own of that flow, with its own run id
and clock and its `run` record when the block ends. Under the wrapper the
module is importable as `keylang_trace`; without it `flow()` does nothing.

Without `KEYLANG_TRACE` there is nothing to record: the script runs as
`python3 <script>` would, and the process exits with its code, so the wrapper
can stay in a test command.

Only the plan's functions are recorded, and only in files whose content still
has the hash the snapshot saw. A code object is the plan's function when its
file, name and first line (the first decorator, else `def`) are the ones the
source gives for that declaration. Generators and coroutines are not recorded
and not `instrumented`: their frames suspend and resume, so a call stack does
not give their nesting. Spans nest by the call stack of each thread. A process
that ends with an uncaught exception or a non-zero `sys.exit` is `complete:
false`. Events reach the file as spans end (and in bounded batches before
that); the `run` record of each process names its clock. A forked child (an
`os.fork()` child, a `multiprocessing` worker under the fork start method)
keeps recording on a clock of its own pid and writes its own `run` record,
through `atexit` or, when it leaves by `os._exit` as a worker does, through
a `multiprocessing.util` finalizer. Needs no package beyond the standard
library; Python 3.12+ uses `sys.monitoring`, older versions `sys.setprofile`
(every span then ends with outcome `ok`).
"""

import ast
import atexit
import contextvars
import hashlib
import json
import os
import runpy
import secrets
import sys
import threading
import time

SCHEMA = 1
# Code flags of generators, coroutines and async generators.
SUSPENDING = 0x20 | 0x80 | 0x200


def fail(message):
    sys.stderr.write(f"keylang trace: {message}\n")
    sys.exit(2)


def declaration(content, name, line):
    """First line of the code of `def <name>` at `line`, and whether it suspends (async, or a generator); None without one."""
    try:
        tree = ast.parse(content)
    except (SyntaxError, ValueError):
        return None
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name and node.lineno == line:
            first = min([node.lineno] + [d.lineno for d in node.decorator_list])
            return first, isinstance(node, ast.AsyncFunctionDef) or yields(node)
    return None


def yields(fn):
    """The body of `fn` itself (not a nested function, lambda or class) has `yield`: it is a generator."""
    stack = list(fn.body)
    while stack:
        node = stack.pop()
        if isinstance(node, (ast.Yield, ast.YieldFrom)):
            return True
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)):
            continue
        stack.extend(ast.iter_child_nodes(node))
    return False


# Events the file does not have yet are written on every `end` and once this many pile up: a process that
# leaves through `os._exit` or a signal keeps its spans, and its missing `run` record tells `check` the run is incomplete.
BUFFER = 64


class Scope:
    """One run being recorded: the process's own, or one request's (`flow()`)."""

    def __init__(self, run, test, flow, clock):
        self.run = run
        self.test = test
        self.flow = flow
        self.clock = clock
        self.seq = 0
        self.spans = 0
        self.open = set()
        # A forked child inherits the scope of a request in flight; it records as a process of its own.
        self.pid = os.getpid()


# The request scope of the current thread or task; None: the process's run.
CURRENT = contextvars.ContextVar("keylang_trace_scope", default=None)
# The tracer of this process, when the wrapper records.
ACTIVE = None


class flow:
    """`with keylang_trace.flow("checkout"):` — the spans of the block are a run of that flow.

    `test` names the run's test id (default: the process's). Without a name, or when nothing is
    recorded, the block runs as it is. A block that raises is an incomplete run, as a crash is.
    """

    def __init__(self, name, test=None):
        self.name = name
        self.test = test
        self.token = None
        self.scope = None

    def __enter__(self):
        tracer = ACTIVE
        if tracer is not None and self.name:
            self.scope = tracer.scope(self.name, self.test)
            self.token = CURRENT.set(self.scope)
        return self

    def __exit__(self, kind, value, traceback):
        if self.scope is not None:
            CURRENT.reset(self.token)
            ACTIVE.finish_scope(self.scope, crashed=kind is not None)
            self.scope = None
        return False


class Tracer:
    def __init__(self, plan, root, test, run, path):
        self.flow = os.environ.get("KEYLANG_FLOW") or plan["flow"]
        self.snapshot = plan["snapshotId"]
        self.test = test
        self.run = run
        self.path = path
        self.suspending = set()
        self.reset()
        # (real file, function name, first line of its code) → id; a decorated function's code starts at its first decorator.
        self.symbols = {}
        self.instrumented = []
        for symbol in plan["symbols"]:
            path = os.path.realpath(os.path.join(root, symbol["file"]))
            try:
                with open(path, "rb") as source:
                    content = source.read()
            except OSError:
                continue
            if hashlib.sha256(content).hexdigest() != symbol["sha256"]:
                continue
            found = declaration(content, symbol["name"], symbol["line"])
            # No such `def` there (the file does not parse, or the ID's name is not the code's): it cannot be observed.
            if found is None or found[1]:
                continue
            first = found[0]
            self.symbols[(path, symbol["name"], first)] = symbol["id"]
            self.instrumented.append(symbol["id"])
        self.codes = {}

    def reset(self):
        """The state of this process's recording: a clock of its own pid, no events, spans or stacks yet."""
        self.pid = os.getpid()
        self.clock = f"py-{self.pid}-{secrets.token_hex(4)}"
        self.lines = []
        self.lock = threading.Lock()
        self.local = threading.local()
        self.process = Scope(self.run, self.test, self.flow, self.clock)
        self.requests = 0
        self.crashed = False
        self.written = False

    def scope(self, name, test):
        """A run of flow `name` of its own: a run id and a clock of its own, numbered in this process."""
        with self.lock:
            self.requests += 1
            n = self.requests
        return Scope(f"{self.run}.r{n}", test or self.test, name, f"{self.clock}.r{n}")

    def forked(self):
        """In the child after `fork`: the inherited events, open spans, counters and stacks are the parent's.

        The child records on a clock of its own, so its span ids never repeat the parent's, and its `end` of a frame
        the parent started is dropped (the stack is empty). A `multiprocessing` worker leaves through `os._exit`,
        past `atexit`, but runs `multiprocessing.util` finalizers first: the run record goes through one of them.
        `Process._bootstrap` clears the finalizers the child inherited before it runs the after-fork hooks, so the
        finalizer is registered from such a hook, not here.
        """
        self.reset()
        util = sys.modules.get("multiprocessing.util")
        if util is not None:
            util.register_after_fork(self, lambda tracer: util.Finalize(None, tracer.finish, exitpriority=-1))

    def symbol_of(self, code):
        if code in self.codes:
            return self.codes[code]
        found = self.symbols.get((os.path.realpath(code.co_filename), code.co_name, code.co_firstlineno))
        if found is not None and code.co_flags & SUSPENDING:
            self.suspending.add(found)
            found = None
        self.codes[code] = found
        return found

    def write(self, scope, event):
        self.lines.append(json.dumps({"schemaVersion": SCHEMA, "snapshotId": self.snapshot, "runId": scope.run, "testId": scope.test, "flow": scope.flow, "traceId": f"{scope.run}:{scope.test}", **event}, separators=(",", ":")))

    def flush(self):
        """Appends the events not yet in the file; the caller holds the lock."""
        if not self.lines:
            return
        text = "\n".join(self.lines) + "\n"
        self.lines = []
        os.makedirs(os.path.dirname(os.path.abspath(self.path)), exist_ok=True)
        with open(self.path, "a", encoding="utf-8") as out:
            out.write(text)

    def stack(self):
        """The spans open on this thread: (span id, its scope), innermost last."""
        stack = getattr(self.local, "stack", None)
        if stack is None:
            stack = self.local.stack = []
        return stack

    def start(self, symbol):
        scope = CURRENT.get()
        if scope is None or scope.pid != self.pid:
            scope = self.process
        with self.lock:
            scope.spans += 1
            scope.seq += 1
            span = f"{scope.clock}:s{scope.spans}"
            stack = self.stack()
            # A span of another run (the process's, around a request) is no parent: the request's run starts at its root.
            parent = stack[-1][0] if stack and stack[-1][1] is scope else None
            self.write(scope, {"event": "start", "spanId": span, "parentSpanId": parent, "symbolId": symbol, "clockId": scope.clock, "seq": scope.seq, "ts": time.perf_counter() * 1000})
            scope.open.add(span)
            stack.append((span, scope))
            if len(self.lines) >= BUFFER:
                self.flush()

    def end(self, outcome):
        with self.lock:
            stack = self.stack()
            if not stack:
                return
            span, scope = stack.pop()
            scope.seq += 1
            scope.open.discard(span)
            self.write(scope, {"event": "end", "spanId": span, "outcome": outcome, "clockId": scope.clock, "seq": scope.seq, "ts": time.perf_counter() * 1000})
            self.flush()

    def record(self, scope, crashed):
        """The `run` record of `scope`; the caller holds the lock."""
        instrumented = sorted(i for i in self.instrumented if i not in self.suspending)
        self.write(scope, {"event": "run", "clockId": scope.clock, "complete": not crashed and not scope.open, "dropped": 0, "instrumented": instrumented, "open": sorted(scope.open)})
        self.flush()

    def finish_scope(self, scope, crashed):
        # A forked child leaving the block it inherited: the run is the parent's to close.
        if scope.pid != self.pid:
            return
        with self.lock:
            self.record(scope, crashed)

    def finish(self):
        """The `run` record of this process, once, and everything not yet in the file."""
        with self.lock:
            if self.written:
                return
            self.written = True
            # A server whose every span was a request's has no run of its own to report.
            if self.requests > 0 and self.process.spans == 0:
                self.flush()
                return
            self.record(self.process, self.crashed)


def install(tracer):
    monitoring = getattr(sys, "monitoring", None)
    if monitoring is not None:
        tool = next((t for t in range(5, 0, -1) if monitoring.get_tool(t) is None), None)
        if tool is None:
            fail("no free sys.monitoring tool id")
        monitoring.use_tool_id(tool, "keylang")
        events = monitoring.events

        def on_start(code, offset):
            symbol = tracer.symbol_of(code)
            if symbol is None:
                return monitoring.DISABLE
            tracer.start(symbol)

        def on_return(code, offset, value):
            if tracer.symbol_of(code) is None:
                return monitoring.DISABLE
            tracer.end("ok")

        def on_unwind(code, offset, exception):
            if tracer.symbol_of(code) is not None:
                tracer.end("error")

        monitoring.register_callback(tool, events.PY_START, on_start)
        monitoring.register_callback(tool, events.PY_RETURN, on_return)
        monitoring.register_callback(tool, events.PY_UNWIND, on_unwind)
        monitoring.set_events(tool, events.PY_START | events.PY_RETURN | events.PY_UNWIND)
        return

    def profile(frame, event, arg):
        if event not in ("call", "return") or tracer.symbol_of(frame.f_code) is None:
            return
        if event == "call":
            tracer.start(tracer.symbol_of(frame.f_code))
        else:
            tracer.end("ok")

    sys.setprofile(profile)
    threading.setprofile(profile)


def run_script(script):
    """Runs `script` as `python3 <script>` does: as `__main__`, with its own arguments and its directory first on `sys.path`."""
    sys.argv = sys.argv[1:]
    sys.path.insert(0, os.path.dirname(os.path.abspath(script)))
    runpy.run_path(script, run_name="__main__")


def main():
    if len(sys.argv) < 2:
        fail("usage: keylang_trace.py <script> [args...]")
    script = sys.argv[1]
    path = os.environ.get("KEYLANG_TRACE")
    if not path:
        # Nothing to record: no tracer, no hooks, no run id; the script's exit is the process's.
        run_script(script)
        return
    plan_path = os.environ.get("KEYLANG_TRACE_PLAN")
    if not plan_path:
        fail("KEYLANG_TRACE is set, so KEYLANG_TRACE_PLAN is required too")
    test = os.environ.get("KEYLANG_TRACE_TEST") or " ".join(["python3", *sys.argv[1:]])
    # Relative paths are the startup directory's, once: a script that calls os.chdir() still writes into the
    # repository, and a child process started elsewhere gets the same absolute paths.
    path = os.environ["KEYLANG_TRACE"] = os.path.abspath(path)
    plan_path = os.environ["KEYLANG_TRACE_PLAN"] = os.path.abspath(plan_path)
    try:
        with open(plan_path, encoding="utf-8") as source:
            plan = json.load(source)
    except (OSError, ValueError) as error:
        fail(f"{plan_path}: {error}")
    if not isinstance(plan, dict) or plan.get("schemaVersion") != 1 or not isinstance(plan.get("symbols"), list):
        fail(f"{plan_path}: not a plan of schema 1 from `keylang trace-plan`")
    root = os.environ["KEYLANG_TRACE_ROOT"] = os.path.realpath(os.environ.get("KEYLANG_TRACE_ROOT") or os.getcwd())
    run = os.environ.get("KEYLANG_TRACE_RUN") or f"{int(time.time() * 1000):x}-{os.getpid()}"
    # Child processes under the adapter inherit the id, so the processes of one test are one run.
    os.environ["KEYLANG_TRACE_RUN"] = run
    global ACTIVE
    tracer = ACTIVE = Tracer(plan, root, test, run, path)
    # The script's `import keylang_trace` (for `flow()`) is this module, with this tracer.
    sys.modules["keylang_trace"] = sys.modules[__name__]
    atexit.register(tracer.finish)
    # A forked child (`os.fork`, a `multiprocessing` worker on the fork start method) inherits the hooks and keeps recording, as its own process.
    os.register_at_fork(after_in_child=tracer.forked)
    install(tracer)
    try:
        run_script(script)
    except SystemExit as exit:
        # `sys.exit(3)` stopped the flow short of its end, as a crash does; `sys.exit()` and `sys.exit(0)` did not.
        if exit.code not in (None, 0):
            tracer.crashed = True
        raise
    except BaseException:
        # A crashed process did not run the flow to its end: its spans are not complete evidence.
        tracer.crashed = True
        raise


if __name__ == "__main__":
    main()
