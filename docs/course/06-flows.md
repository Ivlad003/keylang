# 6. Flows

[Course](README.md) · **English** · [Українською](uk/06-flows.md)

A flow is one scenario. You write it. The agent writes the functions on that path. You do not. Rules say which modules may know each other. A flow says one path through them: a trigger, the steps under it, and the evidence you attach.

`keylang/flows/check.md` describes `keylang check` itself:

![The check flow, cursor on the trigger](images/tui-flow.png)

`/` finds `cli.cli.main`. Down one line, `K` opens the function. This clip is from a later run, after `npm test`, so the trace is `ok`. The still above is the older run, where the trace was stale:

![Search, then K on the next step](images/tui-flow.gif)

## Shape

```markdown
# flow checkout

- kind business
- trigger presentation.terminal.checkout
- step application.purchase.buy
  - reads infrastructure.products.find
  - step domain.orderAggregate.create
  - step infrastructure.orderStore.save
  - emits event order.created
- invariant total equals the sum of price times quantity
  - test tests/purchase.test.ts "computes total"
- when the item is out of stock
  - then application.purchase.OutOfStock
  - test tests/purchase.test.ts "rejects out of stock"
```

`kind` is `business` or `technical`. It is a label, not a check. The trigger is where the scenario starts. A step under a step is a call inside the parent. Sibling steps are "this, then that." A step next to the trigger is nested under the trigger.

`reads` and `emits` are claims on a step. `emits` is not resolved against the map. `invariant` and `when` are prose. `then` is a reference when it is a single dotted id, and prose otherwise. `test` binds a file and a quoted test name to the claim it sits under.

## Four evidence lines

Each kind is a separate result. One of them passing does not paint the others.

| Evidence | `ok` | `unverified` | `fail` |
|---|---|---|---|
| `ID` | The symbol is in the fresh snapshot | The id is `planned`, or the member sits in an opaque module | K001. The module was fully read and the member is not there |
| `static` | A path of resolved calls from the parent | A path may not run, or no path exists and something keylang does not follow could have made one | `absence`: nothing reachable can name this call |
| `tests` | The named test passed in a report for this snapshot | No report, test not found, skipped, or the report is for another snapshot | The test failed |
| `trace` | The step was seen in a finished run, nested and in order | The trace is for another snapshot, the run is incomplete, or the `when` branch did not run | A required step is missing in a finished instrumented run, or a step started before the previous sibling |

On the trigger in the screenshot the strip reads `ID ✓`, `static —`, `tests —`, `trace ◌`. A dash means "not reported." A trigger has no parent, so there is no static path to prove. The trace file was built for an older snapshot. The line's mark is `◌`, the worst of the reported kinds. It is not `✓`, even though the id is exact.

`K` opens the same facts, plus a few lines of the declaration:

![Hover for cli.cli.main](images/tui-hover.png)

Marks, worst first: `✗` a failure, `◌` any required kind `unverified`, `!` warnings only, `✓` every reported kind `ok`, `◇` a `planned` declaration.

`--static=behavior` (the default) also follows a hook: the default of `g` in `const g = p.x ?? f`, and a function a caller injected. The message says `through the default of the hook` or `injected at file:line:col`. `--static=shape` follows only calls written in the source. `check.static` in the config is the same switch. The flag wins.

A static `fail` is hard to reach on purpose. If any unresolved call could still perform the step, the answer stays `unverified`. A failure means keylang is confident the call is absent.

## Tests and traces

`check` does not run your tests and does not trace anything. You point `keylang.json` at files:

```json
"check": {
  "tests": ".keylang/reports/*.json",
  "trace": ".keylang/trace/*.jsonl"
}
```

If the keys are absent, those kinds are not printed and `--strict` ignores them. If the files are stale or missing, you get `unverified`, as in the screenshot.

The test report is keylang's own JSON (schema 1, from the `node:test` reporter in this package) or JUnit XML that carries `keylang.snapshotId`. A JUnit file without that property does not confirm the current code. The match is the file path plus the quoted name.

The trace is JSONL, one event per line. `start` and `end` nest by `parentSpanId`. Sibling order is the `end` of the previous before the `start` of the next on the same `clockId`. Sorting by timestamp is not enough. Rust and Python keep one clock per process.

| Language | How you record |
|---|---|
| TypeScript / JavaScript | `node --import keylang/trace script`. A test whose name contains `@flow <name>` is the convention here |
| Python | `python3 adapters/python/keylang_trace.py script`, with `KEYLANG_TRACE_PLAN` pointing at `keylang trace-plan <flow>` |
| Rust | `mod keylang_trace` from `adapters/rust/keylang_trace.rs`, a `span("<id>")` in the function, and `finish()` at the end of `main`. An uninstrumented step stays `unverified` |

`keylang trace-plan checkout` prints the functions to instrument, with file hashes. A file that changes after the plan is not instrumented. The next `check` calls the trace stale because `snapshotId` moved.

## `planned`

A step that names a `planned fn` is not K001. `ID` and `static` are `unverified` with reason `planned`. When the symbol appears with the same kind and signature (spaces ignored, `->` and `→` the same), the declaration warns with K202. A mismatch is K201.

The same declaration can live in `keylang/features/<slug>.md`. `keylang feature <slug>` is done when every `planned` there is implemented, every step is static `ok`, and no rule `fail` remains, including the baseline. Tests and traces are printed. They do not decide that answer.

A package nobody imports yet is `planned module external.<pkg>`, with a step from the module that will import it. Until that module imports it, the step stays `unverified`. When it does, the declaration is K202 and the step is static `ok`.

`spec-to-code <id>` proposes a stub that throws `not implemented`, plus a failing test for each missing test file the flows name. After you accept them, the id check can pass and K202 suggests deleting `planned`. The tests stay `fail` until the agent writes the real function and the real test from the same spec. The stub is not the feature.

## The mark on the line

The worst reported kind wins: `fail`, then `unverified`, then warning, then `ok`. A `when` branch the trace did not take does not require its nested steps in that run.

`check --strict` exits 1 when any required result is `unverified`. On a fresh clone that includes every stale trace. A pipeline that wants "the ids are real and the layer rules hold" runs `check` without `--strict`. A pipeline that wants fresh traces runs the tests in the same job, then `check --strict`.

`?` lists the keys. On a line with a diagnostic it also shows the `explain` text:

![Help overlay on the check flow](images/tui-help.png)

Next: [wiring, the UI, and agents](07-tools.md).
