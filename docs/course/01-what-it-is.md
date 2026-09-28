# 1. What keylang is

[Course](README.md) · **English** · [Українською](uk/01-what-it-is.md)

keylang is a Markdown language for architecture claims that a repository can check. A generated map says what the code contains. A hand-written rules file says which dependencies are allowed. A flow names a scenario as a tree of ids and attaches evidence: the id exists, a static call path reaches it, a test passed, a trace observed the call. The same analysis answers the CLI, the editor, the terminal UI and an agent.

The idea follows the architecture language in [`architecture-language.md`](../../architecture-language.md): a tree of layer, module and dependency, written as a Markdown list. keylang keeps that shape and adds module members, rules with a verdict, flows, and an optional wiring generator.

## Four documents, one language

```
code + keylang.json → extract / resolve → snapshot
                                           ├→ keylang/map/*.md     generated, do not edit
                                           └→ .keylang/index.json  fact cache, not committed

specs under keylang/ → parse → claims ────┴→ keylang check
   keylang/rules.md      what is allowed
   keylang/flows/*.md    a named scenario and its evidence
   keylang/wiring.md     factories for `keylang wire`
```

The section heading decides the kind, not the file name. `# map`, `# rules`, `# flow checkout` and `# wiring` may share a file. Anything before the first heading is treated as a map, which is why the original slides parse.

The map is a view of the snapshot. Checking the Markdown alone can confirm that an id is declared in the map. It cannot confirm that the id still exists in the code. `keylang check` rebuilds the snapshot in memory and resolves flow and rule ids against that snapshot, even when the committed map is stale. `keylang map --check` is the separate question "did anyone forget to regenerate the map?".

## Problems it takes on

**Finding your way through a repository.** The map is a stable, linkable outline: layer, module, function signature, and the calls that function contains. A person and an agent can read one layer file instead of opening every source file first. The outline is only as complete as the frontend. Holes are listed; they are not filled in by guesswork.

**Making an architecture rule fail in CI.** "Domain does not import infrastructure" is a `deny` line. The checker looks at import, call, type and re-export edges. A confirmed forbidden edge is `fail` (K102) and exit code 1. A gap in coverage, such as an unresolved import in the same area, keeps the rule `unverified` instead of reporting a clean pass.

**Binding a scenario to code.** A flow step names an id (`step application.purchase.buy`). The id check fails when a fully indexed module has no such member. The static check looks for a call path from the parent step. Tests and traces are optional extra evidence, each with its own line, so a passing id does not paint over a missing trace.

**Reviewing an agent's draft.** Drafts are full proposed files under `.keylang/proposals/`. The spec on disk changes only when a person accepts hunks (`m` in the UI, or an explicit `--apply` for `spec-to-code`). A model comment on a line records where the line came from. It is not a verdict.

**Navigating.** Hover, go-to-definition and completion use the same ids. From a flow step you open the function. From a diagnostic you run `keylang explain K001` and get the reason and a fix.

## Problems it leaves alone

**Whether the program does the right thing.** An invariant line is text. keylang does not parse "total equals the sum of price times quantity". It can record that a named test passed on this snapshot. The test is the proof you wrote; keylang is the bookkeeping.

**Behavior behind a hole.** If the frontend cannot name the callee (`obj[k]()`, a value passed through a local, an unknown decorator that may replace the function, a Rust macro it does not expand), the call is not a confirmed edge. Rules that needed that edge stay `unverified`. That is a limit of the snapshot, and the message names the construct.

**Prose that drifted from the code.** The design calls this staleness. The current tool formats and displays descriptions. It does not yet mark them stale when the body changes. Do not read a green gutter as "the paragraph is still true".

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

[Lesson 2](02-install-and-check.md) runs the CLI on the slide example and on this repository. [Lesson 3](03-the-language.md) is the grammar you need to write a file. Lessons 4–6 are the three kinds of claim. Lesson 7 is the UI and the agent boundary. [Lesson 8](08-use-cases.md) repeats the screenshots as sessions.
