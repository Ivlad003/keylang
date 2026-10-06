"""keylang trace adapter for Python: records the functions of one flow as JSONL (schema 1).

    keylang trace-plan <flow> > plan.json
    KEYLANG_TRACE=.keylang/trace/<flow>.jsonl KEYLANG_TRACE_PLAN=plan.json \\
    KEYLANG_TRACE_TEST="<test id>" python3 keylang_trace.py <script> [args...]

Environment:
    KEYLANG_TRACE        JSONL file to append to; without it the script runs untraced
    KEYLANG_TRACE_PLAN   plan from `keylang trace-plan <flow>` (required with KEYLANG_TRACE)
    KEYLANG_TRACE_TEST   test id (required with KEYLANG_TRACE)
    KEYLANG_TRACE_RUN    run id shared by the tests of one run (default: time and pid)
    KEYLANG_TRACE_ROOT   repository root the plan's paths are relative to (default: cwd)

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
false`. Needs no package beyond the standard library; Python 3.12+ uses
`sys.monitoring`, older versions `sys.setprofile` (every span then ends with
outcome `ok`).
"""

import ast
import atexit
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


class Tracer:
    def __init__(self, plan, root, test, run):
        self.flow = plan["flow"]
        self.snapshot = plan["snapshotId"]
        self.test = test
        self.run = run
        self.clock = f"py-{os.getpid()}-{secrets.token_hex(4)}"
        self.lines = []
        self.lock = threading.Lock()
        self.local = threading.local()
        self.open = set()
        self.seq = 0
        self.spans = 0
        self.crashed = False
        self.suspending = set()
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

    def symbol_of(self, code):
        if code in self.codes:
            return self.codes[code]
        found = self.symbols.get((os.path.realpath(code.co_filename), code.co_name, code.co_firstlineno))
        if found is not None and code.co_flags & SUSPENDING:
            self.suspending.add(found)
            found = None
        self.codes[code] = found
        return found

    def write(self, event):
        self.lines.append(json.dumps({"schemaVersion": SCHEMA, "snapshotId": self.snapshot, "runId": self.run, "testId": self.test, "flow": self.flow, "traceId": f"{self.run}:{self.test}", **event}, separators=(",", ":")))

    def stack(self):
        stack = getattr(self.local, "stack", None)
        if stack is None:
            stack = self.local.stack = []
        return stack

    def start(self, symbol):
        with self.lock:
            self.spans += 1
            self.seq += 1
            span = f"{self.clock}:s{self.spans}"
            stack = self.stack()
            self.write({"event": "start", "spanId": span, "parentSpanId": stack[-1] if stack else None, "symbolId": symbol, "clockId": self.clock, "seq": self.seq, "ts": time.perf_counter() * 1000})
            self.open.add(span)
            stack.append(span)

    def end(self, outcome):
        with self.lock:
            stack = self.stack()
            if not stack:
                return
            span = stack.pop()
            self.seq += 1
            self.open.discard(span)
            self.write({"event": "end", "spanId": span, "outcome": outcome, "clockId": self.clock, "seq": self.seq, "ts": time.perf_counter() * 1000})

    def finish(self, path):
        instrumented = sorted(i for i in self.instrumented if i not in self.suspending)
        self.write({"event": "run", "complete": not self.crashed and not self.open, "dropped": 0, "instrumented": instrumented, "open": sorted(self.open)})
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        with open(path, "a", encoding="utf-8") as out:
            out.write("\n".join(self.lines) + "\n")


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
    test = os.environ.get("KEYLANG_TRACE_TEST")
    missing = [name for name, value in (("KEYLANG_TRACE_PLAN", plan_path), ("KEYLANG_TRACE_TEST", test)) if not value]
    if missing:
        fail(f"KEYLANG_TRACE is set, so {' and '.join(missing)} {'is' if len(missing) == 1 else 'are'} required too")
    try:
        with open(plan_path, encoding="utf-8") as source:
            plan = json.load(source)
    except (OSError, ValueError) as error:
        fail(f"{plan_path}: {error}")
    if not isinstance(plan, dict) or plan.get("schemaVersion") != 1 or not isinstance(plan.get("symbols"), list):
        fail(f"{plan_path}: not a plan of schema 1 from `keylang trace-plan`")
    root = os.path.realpath(os.environ.get("KEYLANG_TRACE_ROOT") or os.getcwd())
    run = os.environ.get("KEYLANG_TRACE_RUN") or f"{int(time.time() * 1000):x}-{os.getpid()}"
    # Child processes under the adapter inherit the id, so the processes of one test are one run.
    os.environ["KEYLANG_TRACE_RUN"] = run
    tracer = Tracer(plan, root, test, run)
    atexit.register(tracer.finish, path)
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
