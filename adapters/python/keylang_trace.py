"""keylang trace adapter for Python: records the functions of one flow as JSONL (schema 1).

    keylang trace-plan <flow> > plan.json
    KEYLANG_TRACE=.keylang/trace/<flow>.jsonl KEYLANG_TRACE_PLAN=plan.json \\
    KEYLANG_TRACE_TEST="<test id>" python3 keylang_trace.py <script> [args...]

Environment:
    KEYLANG_TRACE        JSONL file to append to (required)
    KEYLANG_TRACE_PLAN   plan from `keylang trace-plan <flow>` (required)
    KEYLANG_TRACE_TEST   test id (required)
    KEYLANG_TRACE_RUN    run id shared by the tests of one run (default: time and pid)
    KEYLANG_TRACE_ROOT   repository root the plan's paths are relative to (default: cwd)

Only the plan's functions are recorded, and only in files whose content still
has the hash the snapshot saw. Generators and coroutines are not recorded:
their frames suspend and resume, so a call stack does not give their nesting.
Spans nest by the call stack of each thread. Needs no package beyond the
standard library; Python 3.12+ uses `sys.monitoring`, older versions
`sys.setprofile` (every span then ends with outcome `ok`).
"""

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
        # (real file, function name) → [(declaration line, id)]; a decorated function's code starts at its first decorator.
        self.symbols = {}
        self.instrumented = []
        for symbol in plan["symbols"]:
            path = os.path.realpath(os.path.join(root, symbol["file"]))
            try:
                with open(path, "rb") as source:
                    digest = hashlib.sha256(source.read()).hexdigest()
            except OSError:
                continue
            if digest != symbol["sha256"]:
                continue
            self.symbols.setdefault((path, symbol["name"]), []).append((symbol["line"], symbol["id"]))
            self.instrumented.append(symbol["id"])
        self.codes = {}

    def symbol_of(self, code):
        if code in self.codes:
            return self.codes[code]
        found = None
        candidates = self.symbols.get((os.path.realpath(code.co_filename), code.co_name), [])
        before = [(line - code.co_firstlineno, symbol) for line, symbol in candidates if line >= code.co_firstlineno]
        if before:
            found = min(before)[1]
            if code.co_flags & SUSPENDING:
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


def main():
    path = os.environ.get("KEYLANG_TRACE")
    plan_path = os.environ.get("KEYLANG_TRACE_PLAN")
    test = os.environ.get("KEYLANG_TRACE_TEST")
    if not path or not plan_path or not test:
        fail("KEYLANG_TRACE, KEYLANG_TRACE_PLAN and KEYLANG_TRACE_TEST are required")
    if len(sys.argv) < 2:
        fail("usage: keylang_trace.py <script> [args...]")
    try:
        with open(plan_path, encoding="utf-8") as source:
            plan = json.load(source)
    except (OSError, ValueError) as error:
        fail(f"{plan_path}: {error}")
    if not isinstance(plan, dict) or plan.get("schemaVersion") != 1 or not isinstance(plan.get("symbols"), list):
        fail(f"{plan_path}: not a plan of schema 1 from `keylang trace-plan`")
    root = os.path.realpath(os.environ.get("KEYLANG_TRACE_ROOT") or os.getcwd())
    run = os.environ.get("KEYLANG_TRACE_RUN") or f"{int(time.time() * 1000):x}-{os.getpid()}"
    tracer = Tracer(plan, root, test, run)
    atexit.register(tracer.finish, path)
    script = sys.argv[1]
    sys.argv = sys.argv[1:]
    sys.path.insert(0, os.path.dirname(os.path.abspath(script)))
    install(tracer)
    try:
        runpy.run_path(script, run_name="__main__")
    except SystemExit:
        raise
    except BaseException:
        # A crashed process did not run the flow to its end: its spans are not complete evidence.
        tracer.crashed = True
        raise


if __name__ == "__main__":
    main()
