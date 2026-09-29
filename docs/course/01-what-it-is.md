# 1. What keylang is

[Course](README.md) · **English** · [Українською](uk/01-what-it-is.md)

New to the words? The [pre-course](pre/README.md) introduces them on the shop before this lesson.

keylang is a Markdown language for architecture claims that a repository can check. A generated map says what the code contains. A hand-written rules file says which dependencies are allowed. A flow names a scenario as a tree of ids and attaches evidence: the id exists, a static call path reaches it, a test passed, a trace observed the call. The same analysis answers the CLI, the editor, the terminal UI and an agent.

The idea follows the architecture language in [`architecture-language.md`](../../architecture-language.md): a tree of layer, module and dependency, written as a Markdown list. keylang keeps that shape and adds module members, rules with a verdict, flows, and an optional wiring generator.

The rule those layers exist to hold is older than the tool. Two sentences from the free sources are enough to see it. The reading path, with the GitHub repositories the authors published, is [pre-course part 4](pre/04-reading.md).

> Nothing in an inner circle can know anything at all about something in an outer circle. In particular, the name of something declared in an outer circle must not be mentioned by the code in an inner circle.
>
> — Robert C. Martin, [The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html), 13 August 2012. The post's source is [in his site repository](https://github.com/unclebob/unclebob.github.io/blob/master/uncle-bob/_posts/2012-08-13-the-clean-architecture.md).

> The asymmetry to exploit is not that between left and right sides of the application but between inside and outside of the application. The rule to obey is that code pertaining to the inside part should not leak into the outside part.
>
> — Alistair Cockburn, [Hexagonal architecture](https://alistair.cockburn.us/hexagonal-architecture/), 2005

## Four documents, one language

```
code + keylang.json → extract / resolve → snapshot
                                           ├→ keylang/map/*.md     generated, do not edit
                                           └→ .keylang/index.json  fact cache, not committed

specs under keylang/ → parse → claims ────┴→ keylang check
   keylang/rules.md             what is allowed, written by hand
   keylang/rules.baseline.md    generated: the dependencies that exist today
   keylang/flows/*.md           a named scenario and its evidence
   keylang/features/*.md        one feature: planned ids, flows, then drop planned
   keylang/wiring.md            factories for `keylang wire`
```

The section heading decides the kind, not the file name. `# map`, `# rules`, `# flow checkout` and `# wiring` may share a file. Anything before the first heading is treated as a map, which is why the original slides parse.

The map is a view of the snapshot. Checking the Markdown alone can confirm that an id is declared in the map. It cannot confirm that the id still exists in the code. `keylang check` rebuilds the snapshot in memory and resolves flow and rule ids against that snapshot, even when the committed map is stale. `keylang map --check` is the separate question "did anyone forget to regenerate the map?".

## Problems it takes on

**Finding your way through a repository.** The map is a stable, linkable outline: layer, module, function signature, and the calls that function contains. A person and an agent can read one layer file instead of opening every source file first. The outline is only as complete as the frontend. Holes are listed; they are not filled in by guesswork.

**Making an architecture rule fail in CI.** "Domain does not import infrastructure" is a `deny` line. The checker looks at import, call, type and re-export edges. A confirmed forbidden edge is `fail` (K102) and exit code 1. A gap in coverage, such as an unresolved import in the same area, keeps the rule `unverified` instead of reporting a clean pass.

**Binding a scenario to code.** A flow step names an id (`step application.purchase.buy`). The id check fails when a fully indexed module has no such member. The static check looks for a call path from the parent step. Tests and traces are optional extra evidence, each with its own line, so a passing id does not paint over a missing trace.

**Reviewing an agent's draft.** Drafts are full proposed files under `.keylang/proposals/`. The spec on disk changes only when a person accepts hunks (`m` in the UI, or an explicit `--apply` for `spec-to-code`). A model comment on a line records where the line came from. It is not a verdict.

**Navigating.** Hover, go-to-definition and completion use the same ids. From a flow step you open the function. From a diagnostic you run `keylang explain K001` and get the reason and a fix. With `"explain": {"map": true}` the same snapshot also renders an explained map: the doc comment under each node, or a saved brief when the code has none. `t` in the UI switches a layer file between the two maps. Neither map is a verdict.

**Saying when a feature is done.** A file `keylang/features/<slug>.md` is an ordinary spec: `planned` ids and a flow. `keylang feature <slug>` is done when every `planned` there is implemented (K202, not K201), every step of its flows is static `ok`, and no rule `fail` remains, including the baseline. Tests and traces are reported and do not block that answer. An integration that is not imported yet is `planned module external.<pkg>` plus a step to that module. No new grammar.

**Pointing a coding agent at a repository it has not seen.** `keylang init` writes `keylang.json`, the map, `rules.baseline.md`, and a short managed block in `AGENTS.md`. Where it finds Claude, Codex, Cursor or opencode, it also registers the MCP server and a skill. The agent writes the code with its own tools. keylang does not launch it. `check` is still the verdict. Hand-written rules change only as a proposal a person merges. The baseline is regenerated with `keylang baseline`. `--agents=none` skips the harness files and still writes the baseline.

## Problems it leaves alone

**Whether the program does the right thing.** An invariant line is text. keylang does not parse "total equals the sum of price times quantity". It can record that a named test passed on this snapshot. The test is the proof you wrote; keylang is the bookkeeping.

**Behavior behind a hole.** If the frontend cannot name the callee (`obj[k]()`, a value passed through a local, an unknown decorator that may replace the function, a Rust macro it does not expand), the call is not a confirmed edge. Rules that needed that edge stay `unverified`. That is a limit of the snapshot, and the message names the construct.

**Prose under a node that drifted from the code.** A description in a spec is still text. `check` does not mark it stale when the body changes. A saved explanation is different: `explain <id>` prints `fresh` or `stale` from the closure fingerprint taken when it was written, and a green gutter is still not "the paragraph is true".

**Everything around the code.** Deployment topology, SLOs, threat models, product scope and ADRs are out of band. keylang will not notice that two services share a database.

**Languages it does not parse.** A Go, Java or Ruby file is not a quiet success. It is absent. Absence is not a proof of isolation.

**Replacing other tools.** `tsc` still typechecks `keylang.gen.ts`. The test runner still runs tests. A reviewer still reads the diff. keylang adds a structural check those tools do not make.

## Strengths

The spec is the document reviewers already know how to read. A rule change is a few lines in a pull request, next to the import that motivated it.

The generator owns only files it marked. Hand-written rules and flows survive `keylang map`.

Verdicts are three-valued on purpose. `ok` means the claim held in the area that was actually analyzed. `fail` means a violation was shown. `unverified` means neither. CI chooses whether a gap blocks the build (`--strict`). The default does not.

Ids are stable under line motion and fragile under rename, which matches how people talk about code ("the `buy` function in `purchase`") better than line numbers do.

The project uses the tool on itself. `keylang/rules.md` forbids the language core and the checker from depending on tree-sitter. That rule is a normal spec, not a special case in the linter.

## Costs

You learn a position-sensitive grammar. `module` under a layer declares a module. `module` at the top of a rules file points at a module that has `exports` or `no-cycles`. `test` is a keyword only in a flow. The formatter will not invent a keyword you omitted, and it refuses to reindent a file with a structural error (K003), because that would change the tree.

You own the ids. Renaming `orderAggregate` to `order` updates every flow and rule that names it, or those references become K001. There is a "did you mean" hint. There is no automatic rewrite.

The map is not a component diagram. Order of `calls` is not execution order. Sibling flow steps are a sequence; nested steps are nesting. If you needed a sequence diagram with timeouts and actors, this is the wrong picture.

Evidence has an operational cost. Static structure is free on every `check`. Tests need the keylang reporter (or a JUnit file that carries the snapshot id). Traces need an adapter and a plan, and they go stale as soon as a hashed source file changes. A team that only wants layer rules can ignore flows.

The honest output is noisier than a red/green linter. A fresh clone of this repository reports unverified trace and test lines until `npm test` has written reports for the current snapshot. Those lines are not failures. They are also not proof.

## Where to go next

[Lesson 2](02-install-and-check.md) runs the CLI on the slide example and on this repository. [Lesson 3](03-the-language.md) is the grammar you need to write a file. Lessons 4–6 are the map, the rules (including the generated baseline) and flows. Lesson 7 is the UI, wiring, and the line between a proposal and a harness that writes code. [Lesson 8](08-use-cases.md) repeats the screenshots as sessions.
