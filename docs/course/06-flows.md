# 6. Flows

[Course](README.md) · **English** · [Українською](uk/06-flows.md)

A flow describes one scenario. As with rules, you write it, and the agent writes the functions along that path. The difference is in scope: rules say which modules may know about each other, while a flow follows one path through them. It consists of a trigger, the steps under it, and the evidence you attach to show that the path really works.

`keylang/flows/check.md` describes `keylang check` itself:

![The check flow, cursor on the trigger](images/tui-flow.png)

Here `/` finds `cli.cli.main`, and on the line below it `K` opens the function. The clip comes from a later run, after `npm test`, so its trace is `ok`. The still above shows an older run, in which the trace was stale:

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

`kind` is either `business` or `technical`; it is only a label, and nothing checks it. The trigger is where the scenario starts. A step nested under another step is a call made inside that parent, while sibling steps read as "this, then that." A step written next to the trigger counts as nested under the trigger.

`reads` and `emits` are claims attached to a step, but `emits` with a plain name such as `order.created` is not resolved against the map. `invariant` and `when` are plain prose. `then` is a reference when it is a single dotted id and prose otherwise. `test` binds a file and a quoted test name to the claim it sits under, so that test becomes the evidence for that claim.

## Routes, webhooks, timers and parallel steps

A request, a cron job and a webhook each start their own run, so each gets its own flow. The trigger can say what kind of entry point it is, and `continues` ties together the flows of one business process:

```markdown
# flow place-order

- trigger route application.purchase.buy
- step domain.orderAggregate.create
- parallel
  - step infrastructure.orderStore.save
  - step infrastructure.mailer.confirm
- ? who is told when the mailer is down?

# flow payment-confirmed

- continues place-order
- trigger webhook infrastructure.payments.confirmed
- step application.purchase.markPaid

# flow cancel-unpaid

- continues place-order
- trigger cron application.purchase.cancelUnpaid
- every @hourly
- step application.purchase.cancel
  - after 1h
    - test tests/cancel.test.ts "cancels an order unpaid for an hour"
```

- `trigger route|cron|consumer|webhook <id>` names the entry point's function, not its URL. `check` compares the kind with what `keylang entries` found: a match is `ok` and names the route or the schedule, a function the snapshot records only as another kind is K205, and without an adapter for the framework the answer is `unverified`.
- `parallel` groups steps that must all happen, in any order; the next sibling comes after the whole group. A `parallel` with no `step` is K009.
- `continues <flow>` says that this flow carries on another one in a later request. A flow that does not exist is K206. One trace run is one request, so a trace cannot prove the link and stays `unverified` there.
- `after 1h` and `every @hourly` are timers. Only a nested `test` proves them, and `every` is also compared with the schedule of the cron entry point.
- `emits event events.order_placed` and `trigger event events.order_placed` name an event from the map's `events` group. For `emits`, `check` looks for a `dispatch` of that event in the code the step reaches; under `trigger event`, the steps are checked from the event's subscribers. An unknown event is K204.
- `? <text>` records an open question. It is not a claim, so it gets no verdict.

## Four evidence lines

Each kind of evidence is a separate result, so one of them passing does not paint the others green.

| Evidence | `ok` | `unverified` | `fail` |
|---|---|---|---|
| `ID` | The symbol is in the fresh snapshot | The id is `planned`, or the member sits in an opaque module | K001: the module was fully read and the member is not there |
| `static` | There is a path of resolved calls from the parent | A path might not run, or there is no path but something keylang does not follow could have made one | `absence`: nothing reachable can name this call |
| `tests` | The named test passed in a report for this snapshot | There is no report, the test was not found or was skipped, or the report is for another snapshot | The test failed |
| `trace` | The step was seen in a finished run, nested and in order | The trace is for another snapshot, the run is incomplete, or the `when` branch did not run | A required step is missing from a finished instrumented run, or a step started before the previous sibling |

On the trigger in the screenshot the strip reads `ID ✓`, `static —`, `tests —`, `trace ◌`, where a dash means "not reported." A trigger has no parent, so there is no static path to prove. The trace file was built for an older snapshot, so the trace is `unverified`. The mark for the whole line is `◌`, the worst of the reported kinds, and it is not `✓` even though the id is exact.

`K` opens the same facts together with a few lines of the declaration:

![Hover for cli.cli.main](images/tui-hover.png)

From worst to best, the marks are: `✗` for a failure, `◌` when any required kind is `unverified`, `!` for warnings only, `✓` when every reported kind is `ok`, and `◇` for a `planned` declaration.

`--static=behavior`, the default, also follows a hook. That covers the default of `g` in `const g = p.x ?? f` and a function that a caller injected; the message then says `through the default of the hook` or `injected at file:line:col`. `--static=shape`, by contrast, follows only the calls written in the source. `check.static` in the config is the same switch, and when both are set, the flag wins.

A static `fail` is deliberately hard to get. If any unresolved call could still perform the step, the answer stays `unverified`, so a failure means keylang is confident that the call is really absent.

## Tests and traces

`check` neither runs your tests nor traces anything itself. Instead, you point `keylang.json` at the files those runs produce:

```json
"check": {
  "tests": ".keylang/reports/*.json",
  "trace": ".keylang/trace/*.jsonl"
}
```

If these keys are absent, those kinds of evidence are not printed and `--strict` ignores them. If the files are stale or missing, you get `unverified`, as in the screenshot.

The test report is either keylang's own JSON (schema 1, produced by the `node:test` reporter in this package) or JUnit XML that carries `keylang.snapshotId`. A JUnit file without that property cannot confirm the current code, because nothing ties it to this snapshot. A test is matched by the file path plus the quoted name.

The trace is JSONL, with one event per line. `start` and `end` events nest by `parentSpanId`. Sibling order means that the `end` of the previous step comes before the `start` of the next one on the same `clockId`; sorting by timestamp is not enough. Rust and Python keep one clock per process.

| Language | How you record |
|---|---|
| TypeScript / JavaScript | `node --import keylang/trace script`. By convention here, the test's name contains `@flow <name>` |
| Python | `python3 adapters/python/keylang_trace.py script`, with `KEYLANG_TRACE_PLAN` pointing at the output of `keylang trace-plan <flow>` |
| Rust | `mod keylang_trace` from `adapters/rust/keylang_trace.rs`, a `span("<id>")` in the function, and `finish()` at the end of `main`. A step without instrumentation stays `unverified` |
| PHP | `php adapters/php/keylang_trace.php script`, with the same variables as Python; `adapters/php/keylang_phpunit.php` writes a test report for PHPUnit |

`keylang trace-plan checkout` prints the functions to instrument, along with file hashes. A file that changes after the plan was made is not instrumented, and the next `check` calls the trace stale because `snapshotId` has moved.

A run does not have to be a test. A request to an instrumented server that names its flow in the `X-Keylang-Flow` header, or a process started with `KEYLANG_FLOW`, is recorded the same way. Before a flow exists, `keylang trace-plan --entry <id>` plans the functions an entry point reaches, and `keylang draft flow --from-trace <file.jsonl>` turns what one run observed into a proposed flow.

## `planned`

A step that names a `planned fn` is not K001. Instead, `ID` and `static` are `unverified` with the reason `planned`. When the symbol appears with the same kind and signature (spaces are ignored, and `->` and `→` count as the same), the declaration warns with K202 to tell you it can go. If the signature does not match, it is K201.

The same declaration can also live in `keylang/features/<slug>.md`. `keylang feature <slug>` is done when every `planned` there is implemented, every step is static `ok`, no rule `fail` remains, including those from the baseline, no open `?` question is left, and the plan was not weakened since the branch began. Tests and traces are printed too, but they do not decide that answer.

A package nobody imports yet is written as `planned module external.<pkg>`, together with a step from the module that will import it. Until that module imports it, the step stays `unverified`. Once it does, the declaration gives K202 and the step becomes static `ok`.

`spec-to-code <id>` proposes a stub that throws `not implemented`, plus a failing test for each missing test file the flows name. After you accept them, the id check can pass, and K202 suggests deleting `planned`. The tests, however, stay `fail` until the agent writes the real function and the real test from the same spec, because the stub is not the feature.

## Flows you did not write

On a codebase with hundreds of entry points, you do not start by writing every flow by hand. `keylang flows discover` writes a draft flow for every entry point to `keylang/flows-discovered/<layer>.md`, with a description taken from the doc comments. That is a generated view: `check` does not read it, and an entry point that already has a hand-written flow is skipped. When a draft is worth keeping, adopt it:

```sh
keylang flows discover
keylang flows adopt main
keylang proposals accept keylang/flows/main.md
```

`flows adopt` writes a proposal under `.keylang/proposals/`. You merge it with `m` in the UI, or a person accepts it with `keylang proposals accept`, and from then on it is an ordinary flow that `check` evaluates. `flows discover --names` also asks the configured model to group the drafts into business processes; without a model it stays offline.

## The mark on the line

The worst reported kind wins, in the order `fail`, then `unverified`, then warning, then `ok`. If the trace did not take a `when` branch, the steps nested in that branch are not required in that run.

`check --strict` exits with 1 when any required result is `unverified`, and on a fresh clone that includes every stale trace. So a pipeline that only wants to know that "the ids are real and the layer rules hold" runs `check` without `--strict`. A pipeline that wants fresh traces runs the tests in the same job first and then `check --strict`.

`?` lists the keys, and on a line with a diagnostic it also shows the `explain` text:

![Help overlay on the check flow](images/tui-help.png)

Next: [wiring, the UI, and agents](07-tools.md).
