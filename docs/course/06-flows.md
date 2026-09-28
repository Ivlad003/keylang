# 6. Flows

[Course](README.md) · **English** · [Українською](uk/06-flows.md)

A flow is a named scenario. It does not replace the rules. Rules talk about which modules may know each other. A flow talks about one path through them: a trigger, the steps under it, and the evidence you are willing to attach.

`keylang/flows/check.md` in this repository describes `keylang check` itself. Opened in the UI, with the cursor on the trigger:

![The check flow, cursor on the trigger](images/tui-flow.png)

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

`kind` is `business` or `technical`. It is a label, not a check. The trigger is the entry of the scenario. A step nested under a step is a call that happens inside the parent. Sibling steps are a sequence: `create` happens, then `save`. A step at the top, next to the trigger, is nested under the trigger.

`reads` and `emits` are claims you attach to a step. `emits` is not resolved against the map. `invariant` and `when` are prose claims. `then` is a reference when it is a single dotted id, and prose otherwise. `test` binds a file and a quoted test name to the claim it sits under.

## Four evidence lines

Every trigger and step reports the evidence kinds that were asked for. They are separate results. One of them passing does not paint the others.

| Evidence | `ok` | `unverified` | `fail` |
|---|---|---|---|
| `ID` | The symbol is in the fresh snapshot | The id is `planned`, or the member sits in an opaque module | K001. The module was fully read and the member is not there. `static` is then omitted |
| `static` | A path of resolved calls from the parent, and none of those calls sit in a closure | A path exists but may not run (unknown decorator, a module that does not parse), or no path exists and some construct keylang does not follow could have made one | `absence`: the step is only reachable by name, and no call from reachable code can name it |
| `tests` | The named test passed in a report for this snapshot | No report, test not found, ambiguous name, skipped, or the report is for another snapshot | The test failed |
| `trace` | The step was observed in a finished run, with nesting and a confirmed order | The trace is for another snapshot, the run is incomplete, the symbol was not instrumented, or the `when` branch did not run | A required step is missing in a finished, instrumented run, or a step started before its previous sibling |

On the trigger line in the screenshot the gutter detail reads `ID ✓`, `static —`, `tests —`, `trace ◌`. The dash means "this kind was not reported". A trigger has no parent, so there is no static path to prove. Tests are reported on the invariant the `test` bullet is attached to, not on the trigger. The trace was reported and did not hold: the JSONL file was built for snapshot `fc0905384061`, and the current snapshot is different. The detail line under the editor says that in words. The line's mark is `◌`, the worst of the reported kinds. It is not `✓`, even though the id is exact.

`K` opens the same facts as a hover, plus a few lines of the declaration and how many spec references point here:

![Hover for cli.cli.main](images/tui-hover.png)

The mark characters, worst first: `✗` a diagnostic error or `fail`, `◌` any required criterion `unverified`, `!` warnings only, `✓` every reported criterion `ok`, `◇` a `planned` declaration or a step whose only gap is that its target is still planned.

`--static=behavior` (the default) also follows a hook: the default of `g` in `const g = p.x ?? f`, and a function a caller injected for that parameter. The message says `through the default of the hook` or `injected at file:line:col`. `--static=shape` follows only calls written in the source. This repository's flow uses the default, which is why `map.analyze.analyze` reaches `map.map.generateMap` "through the default of the hook `generate`".

`fail` for static evidence is deliberately hard to reach. If any unresolved call, escaped function value, or unparsed module could still perform the call, the verdict stays `unverified`. A failure means keylang is confident the call is absent.

## Tests and traces

Nothing is traced or executed by `check` itself. You point `keylang.json` at artifacts:

```json
"check": {
  "tests": ".keylang/reports/*.json",
  "trace": ".keylang/trace/*.jsonl"
}
```

If the keys are absent, those evidence kinds are not printed and `--strict` ignores them. If they are present and the files are stale or missing, you get `unverified`, as in the screenshot.

The test report is either keylang's own JSON (schema 1, written by the `node:test` reporter in this package) or JUnit XML that carries `keylang.snapshotId` on the testcase or its suite. A JUnit file without that property does not confirm the current code. The match is the file path plus the quoted name. `"Suite > name"` selects a nested suite.

The trace is JSONL, one event per line, for a `(runId, testId)` of a named flow. `start` and `end` nest by `parentSpanId`. Order of siblings is the `end` of the previous before the `start` of the next on the same `clockId`, or an explicit `links` entry. Sorting by timestamp is not enough. A `run` event says whether the run finished, how many events were dropped, and which symbols were instrumented.

Adapters, all optional:

| Language | How you record |
|---|---|
| TypeScript / JavaScript | `node --import keylang/trace script`. The adapter wraps the trigger and the steps. A test whose name contains `@flow <name>` is the convention this repository uses |
| Python | `python3 adapters/python/keylang_trace.py script`, with `KEYLANG_TRACE_PLAN` pointing at the JSON from `keylang trace-plan <flow>` |
| Rust | `mod keylang_trace` from `adapters/rust/keylang_trace.rs`, a `span("<id>")` or `instrument("<id>", …)` in the function, and `finish()` at the end of `main`. No runtime hooks exist, so an uninstrumented step stays `unverified` |

`keylang trace-plan checkout` prints the functions to instrument, with file hashes. A file that changes after the plan is not instrumented, and the next `check` calls the trace stale because `snapshotId` moved.

## `planned`

A step that names a `planned fn` is not K001. `ID` and `static` are `unverified` with reason `planned`. Trace is not required for it. When the symbol appears in code with the same kind and the same signature (whitespace ignored, `->` and `→` equivalent), the declaration warns with K202. A mismatch is K201.

`spec-to-code <id>` builds a stub that throws `not implemented`, plus a failing `node:test` for each missing test file the flows name, as proposals. After you accept them, the id check can pass and K202 suggests deleting `planned`. The tests are `fail` until someone writes them. That is intentional: a generated stub is not a passing scenario.

## How a line gets its mark

The worst reported kind wins, in the order `fail`, then `unverified`, then warning, then `ok`. Several tests: any failure fails the step; otherwise any pass is enough to pass. A `when` branch that the trace did not take does not require its nested steps in that run.

`check --strict` exits 1 when any required result is `unverified`. On a fresh clone of this repository that includes every stale trace line and both invariants' tests. ID and static evidence do not need the test run. A pipeline that wants "the ids are real and the layer rules hold" should run `check` without `--strict`. A pipeline that wants "the traces are fresh" should run the tests in the same job and then `check --strict`.

The help overlay (`?`) lists the keys and, when the cursor line has a diagnostic, appends the `explain` text for its code. On a healthy flow line it is just the keys, with the evidence strip still visible behind it:

![Help overlay on the check flow](images/tui-help.png)

Next: [wiring, the UI, and agents](07-tools.md).
