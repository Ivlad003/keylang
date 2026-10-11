# 6. Flows

[Course](README.md) · **English** · [Українською](uk/06-flows.md)

Rules say which modules may know about each other. A flow is narrower: it follows one scenario through those modules. You write it, just as you write rules, and the agent writes the functions along the path. A flow has a trigger, the steps under it, and the evidence you attach to show that the path really works.

This repository describes `keylang check` itself in `keylang/flows/check.md`. The still below comes from an older run, when the trace was stale:

![The check flow, cursor on the trigger](images/tui-flow.png)

The clip comes from a later run, after `npm test`, so its trace is `ok`. In it, `/` finds `cli.cli.main`, and `K` on the next line opens the function:

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

The trigger is where the scenario starts. Nesting carries meaning: a step under another step is a call made inside that parent, and sibling steps read as "this, then that." A step written next to the trigger counts as nested under it. `kind` is `business` or `technical`, but it is only a label and nothing checks it.

`reads` and `emits` are claims about a step. keylang does not resolve `emits` with a plain name such as `order.created` against the map. `invariant` and `when` are plain prose. `then` is a reference when it is a single dotted id and prose otherwise. `test` binds a file and a quoted test name to the claim it sits under, and that test becomes the evidence for the claim.

## Routes, webhooks, timers and parallel steps

One business process often spans several runs. The order is placed in a request, the payment arrives later by webhook, and a cron job cleans up what was never paid. Each run gets its own flow. The trigger can say what kind of entry point starts it, and `continues` ties the flows of one process together:

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

- `trigger route|cron|consumer|webhook <id>` names the function behind the entry point, not its URL. `check` compares the kind with what `keylang entries` found. A match is `ok` and names the route or the schedule. A function the snapshot records only as another kind is K205. Without an adapter for the framework, the answer is `unverified`.
- `parallel` groups steps that must all happen, in any order. The next sibling comes after the whole group. A `parallel` with no `step` is K009.
- `continues <flow>` says that this flow picks up another one in a later request. Naming a flow that does not exist is K206. A trace records one request per run, so it cannot prove the link, and the link stays `unverified` in the trace.
- `after 1h` and `every @hourly` are timers. Only a nested `test` proves them. `check` also compares `every` with the schedule of the cron entry point.
- `emits event events.order_placed` and `trigger event events.order_placed` name an event from the map's `events` group. For `emits`, `check` looks for a `dispatch` of that event in the code the step reaches. Under `trigger event`, it checks the steps starting from the event's subscribers. An unknown event is K204.
- `? <text>` records an open question. It is not a claim, so it gets no verdict.

## Four evidence lines

Once a flow is written, `check` judges each line on four kinds of evidence. Each kind is a separate result, so one of them passing does not paint the others green.

| Evidence | `ok` | `unverified` | `fail` |
|---|---|---|---|
| `ID` | The symbol is in the fresh snapshot | The id is `planned`, or the member sits in an opaque module | K001: the module was fully read and the member is not there |
| `static` | There is a path of resolved calls from the parent | A path might not run, or there is no path but something keylang does not follow could have made one | `absence`: nothing reachable can name this call |
| `tests` | The named test passed in a report for this snapshot | There is no report, the test was not found or was skipped, or the report is for another snapshot | The test failed |
| `trace` | The step was seen in a finished run, nested and in order | The trace is for another snapshot, the run is incomplete, or the `when` branch did not run | A required step is missing from a finished instrumented run, or a step started before the previous sibling |

Look at the trigger in the screenshot. Its strip reads `ID ✓`, `static —`, `tests —`, `trace ◌`, where a dash means "not reported." A trigger has no parent, so there is no static path to prove. The trace file was built for an older snapshot, so the trace is `unverified`. The whole line gets `◌`, the worst of the reported kinds. The id is exact, and the line is still not `✓`.

`K` shows the same facts next to a few lines of the declaration:

![Hover for cli.cli.main](images/tui-hover.png)

From worst to best, the marks are: `✗` for a failure, `◌` when any required kind is `unverified`, `!` for warnings only, `✓` when every reported kind is `ok`, and `◇` for a `planned` declaration.

You choose how far the static check looks. The default, `--static=behavior`, also follows hooks: the default of `g` in `const g = p.x ?? f`, or a function that a caller injected. The message then says `through the default of the hook` or `injected at file:line:col`. `--static=shape` follows only the calls written in the source. `check.static` in the config is the same switch, and when both are set, the flag wins.

A static `fail` is hard to get on purpose. If any unresolved call could still perform the step, the answer stays `unverified`. So when you do see a failure, keylang is confident that the call is really absent.

## Tests and traces

The static check reads code; tests and traces show what happened when the code ran. `check` does not run your tests or trace anything itself. You point `keylang.json` at the files those runs produce:

```json
"check": {
  "tests": ".keylang/reports/*.json",
  "trace": ".keylang/trace/*.jsonl"
}
```

Without these keys, `check` does not print those kinds of evidence and `--strict` ignores them. With the keys set but the files stale or missing, you get `unverified`, as in the screenshot.

The test report can be keylang's own JSON (schema 1, written by the `node:test` reporter in this package) or JUnit XML that carries `keylang.snapshotId`. A JUnit file without that property cannot confirm the current code, because nothing ties it to this snapshot. keylang matches a test by its file path plus the quoted name.

The trace is JSONL, one event per line. `start` and `end` events nest by `parentSpanId`. For siblings, order means that the `end` of the previous step comes before the `start` of the next one on the same `clockId`. Sorting by timestamp is not enough. Rust and Python keep one clock per process.

| Language | How you record |
|---|---|
| TypeScript / JavaScript | `node --import keylang/trace script`. By convention here, the test's name contains `@flow <name>` |
| Python | `python3 adapters/python/keylang_trace.py script`, with `KEYLANG_TRACE_PLAN` pointing at the output of `keylang trace-plan <flow>` |
| Rust | `mod keylang_trace` from `adapters/rust/keylang_trace.rs`, a `span("<id>")` in the function, and `finish()` at the end of `main`. A step without instrumentation stays `unverified` |
| PHP | `php adapters/php/keylang_trace.php script`, with the same variables as Python; `adapters/php/keylang_phpunit.php` writes a test report for PHPUnit |

`keylang trace-plan checkout` prints the functions to instrument, along with file hashes. If a file changes after the plan was made, it is not instrumented, and the next `check` calls the trace stale because `snapshotId` has moved.

A run does not have to be a test. keylang records the same way a request to an instrumented server that names its flow in the `X-Keylang-Flow` header, or a process started with `KEYLANG_FLOW`. You can trace even before a flow exists: `keylang trace-plan --entry <id>` plans the functions an entry point reaches, and `keylang draft flow --from-trace <file.jsonl>` turns what one run observed into a proposed flow.

## `planned`

So far every step named code that exists. A flow can also describe code the agent has not written yet. A step that names a `planned fn` is not K001. Its `ID` and `static` are `unverified` with the reason `planned`. Once the symbol appears with the same kind and signature, the declaration warns with K202 to tell you it can go. Spaces are ignored in that comparison, and `->` and `→` count as the same. If the signature does not match, it is K201.

The same declaration can also live in `keylang/features/<slug>.md`. `keylang feature <slug>` says the feature is done when all of these hold:

- the file declares something to check and has no spec errors (K001–K005);
- every `planned` there is implemented (K202, not K201);
- every step is static `ok`;
- no rule `fail` of this change remains: one on a file changed since the branch began, or on an id the feature names (baseline rules included);
- no open `?` question is left;
- the plan was not weakened since the branch began.

"Since the branch began" means since `--since <ref>`, which defaults to the merge-base of `HEAD` with the main branch. A rule `fail` that the branch inherited is shown as a hint and does not block. The command prints tests and traces too, but they do not decide the answer.

A package nobody imports yet is written as `planned module external.<pkg>`, together with a step from the module that will import it. Until that module imports it, the step stays `unverified`. Once it does, the declaration gives K202 and the step becomes static `ok`.

`spec-to-code <id>` proposes a stub that throws `not implemented`, plus a failing test for each missing test file the flows name. After you accept them, the id check can pass, and K202 suggests deleting `planned`. The tests stay `fail`, though, until the agent writes the real function and the real test from the same spec. The stub is not the feature.

## Flows you did not write

On a codebase with hundreds of entry points, writing every flow by hand is not where you start. `keylang flows discover` writes a draft flow for every entry point to `keylang/flows-discovered/<layer>.md`, with a description taken from the doc comments. That file is a generated view: `check` does not read it, and it skips entry points that already have a hand-written flow. When a draft is worth keeping, adopt it:

```sh
keylang flows discover
keylang flows adopt main
keylang proposals accept keylang/flows/main.md
```

`flows adopt` writes a proposal under `.keylang/proposals/`. You merge it with `m` in the UI, or a person accepts it with `keylang proposals accept`. From then on it is an ordinary flow that `check` evaluates. `flows discover --names` also asks the configured model to group the drafts into business processes; without a model it stays offline.

## The mark on the line

All of this evidence ends up as one mark in the gutter. The worst reported kind wins, in the order `fail`, then `unverified`, then warning, then `ok`. If the trace did not take a `when` branch, the steps nested in that branch are not required in that run.

In a pipeline, you decide how strict to be. `check --strict` exits with 1 when any required result is `unverified`, and on a fresh clone that includes every stale trace. A pipeline that only wants to know that "the ids are real and the layer rules hold" runs `check` without `--strict`. A pipeline that wants fresh traces runs the tests first in the same job, then `check --strict`.

`?` lists the keys. On a line with a diagnostic, it also shows the `explain` text:

![Help overlay on the check flow](images/tui-help.png)

Next: [wiring, the UI, and agents](07-tools.md).
