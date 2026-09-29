# 1. What keylang is

[Course](README.md) · **English** · [Українською](uk/01-what-it-is.md)

New to the words? The [pre-course](pre/README.md) introduces them on the shop.

keylang is Markdown next to the code. You write what the program is allowed to know, and which scenario should still happen. keylang checks that the code still matches.

Take the shop. The screen starts a purchase. The purchase asks the order rules to build an order. The order rules do not know about the screen or the database. That last sentence is a rule. When the code breaks it, the check can fail the build.

The shape comes from [`architecture-language.md`](../../architecture-language.md): a Markdown list of layer, module and dependency. keylang keeps that list and adds the functions inside a module, a verdict on each rule, flows, and an optional wiring generator.

The rule the layers exist to hold is older than the tool. Two sentences are enough. The reading path is [pre-course part 4](pre/04-reading.md).

> Nothing in an inner circle can know anything at all about something in an outer circle. In particular, the name of something declared in an outer circle must not be mentioned by the code in an inner circle.
>
> — Robert C. Martin, [The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html), 13 August 2012. The post's source is [in his site repository](https://github.com/unclebob/unclebob.github.io/blob/master/uncle-bob/_posts/2012-08-13-the-clean-architecture.md).

> The asymmetry to exploit is not that between left and right sides of the application but between inside and outside of the application. The rule to obey is that code pertaining to the inside part should not leak into the outside part.
>
> — Alistair Cockburn, [Hexagonal architecture](https://alistair.cockburn.us/hexagonal-architecture/), 2005

## Four documents, one check

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

The heading decides the kind, not the file name. `# map`, `# rules`, `# flow checkout` and `# wiring` may share a file. Text before the first heading is a map, which is why the original slides parse.

The map is a view of the snapshot. Checking the Markdown can confirm that an id is written in the map. It cannot confirm that the id still exists in the code. `keylang check` rebuilds the snapshot in memory and resolves ids against that, even when the committed map is old. `keylang map --check` asks a different question: did anyone forget to regenerate the map?

## What it takes on

**Finding your way.** The map is a short outline: layer, module, function signature, and the calls inside that function. You read one layer file before opening every source file. Holes are listed. They are not filled in by guesswork.

**A rule that fails in CI.** "Domain does not import infrastructure" is one `deny` line. The checker looks at imports, calls, type mentions and re-exports. A confirmed forbidden edge is `fail` (K102) and exit code 1. A gap in the same area, such as an import it could not resolve, keeps the rule `unverified`. That is not a clean pass.

**A scenario tied to code.** A flow step names an id, `step application.purchase.buy`. If the module was fully read and has no such member, the id check fails. The static check looks for a call path from the parent step. A test and a trace are extra lines. A passing id does not hide a missing trace.

**An agent's draft.** Drafts are proposed files under `.keylang/proposals/`. The spec on disk changes only when a person accepts hunks (`m` in the UI, or `--apply` for `spec-to-code`). A model comment records where the line came from. It is not a verdict.

**Jumping to the function.** Hover, go-to-definition and completion use the same ids. From a diagnostic, `keylang explain K001` prints the reason and a fix. With `"explain": {"map": true}` the same snapshot also renders an explained map: the doc comment under each node, or a saved brief when the code has none. `t` in the UI switches a layer file between the two maps. Neither map is a verdict.

**When a feature is done.** `keylang/features/<slug>.md` is an ordinary spec: `planned` ids and a flow. `keylang feature <slug>` is done when every `planned` there is implemented (K202, not K201), every step is static `ok`, and no rule `fail` remains, including the baseline. Tests and traces are reported. They do not block that answer. An integration nobody imports yet is `planned module external.<pkg>` plus a step to that module.

**An agent on a repository it has not seen.** `keylang init` writes `keylang.json`, the map, `rules.baseline.md`, and a short managed block in `AGENTS.md`. Where it finds Claude, Codex, Cursor or opencode, it also registers the MCP server and a skill. The agent writes code with its own tools. keylang does not launch it. `check` is still the verdict. Hand-written rules change only as a proposal a person merges. `--agents=none` skips the harness files and still writes the baseline.

## What it leaves alone

**Whether the program does the right thing.** An invariant line is text. keylang does not parse "total equals the sum of price times quantity." It can record that a named test passed. The test is the proof. keylang is the bookkeeping.

**Behavior behind a hole.** If the frontend cannot name the callee (`obj[k]()`, a value passed through a local, a decorator that may replace the function, a Rust macro it does not expand), the call is not a confirmed edge. Rules that needed that edge stay `unverified`. The message names the construct.

**Prose that drifted from the code.** A description in a spec is still text. `check` does not mark it stale when the body changes. A saved explanation is different: `explain <id>` prints `fresh` or `stale`. A green gutter is still not "the paragraph is true."

**Everything around the code.** Deployments, SLOs, threat models and ADRs are out of band. keylang will not notice that two services share a database.

**Languages it does not parse.** A Go, Java or Ruby file is absent, not a quiet success. Absence is not a proof that nothing depends on it.

**Replacing other tools.** `tsc` still typechecks `keylang.gen.ts`. The test runner still runs tests. A reviewer still reads the diff.

## What you gain, and what it costs

The spec is a file reviewers already know how to read. A rule change is a few lines in a pull request, next to the import that caused it. `keylang map` does not overwrite a file it did not generate.

There are three answers on purpose. `ok` means the claim held where keylang actually looked. `fail` means a violation was shown. `unverified` means neither. `--strict` is how CI refuses a gap. The default does not.

Ids survive moving lines. They break on rename, which matches how people talk: "the `buy` function in `purchase`." There is a "did you mean" hint. There is no automatic rewrite.

The project checks itself. `keylang/rules.md` forbids the language core and the checker from depending on tree-sitter. That rule is a normal spec.

The grammar cares where a word sits. `module` under a layer declares a module. `module` at the top of a rules file points at a module that has `exports` or `no-cycles`. `test` is a keyword only in a flow. `fmt` will not invent a keyword you omitted. It refuses to reindent a file with a structural error (K003), because that would change the tree.

The map is not a sequence diagram. Order of `calls` is not execution order. Sibling flow steps are "this, then that." Nested steps are "this happens inside."

Static structure is free on every `check`. Tests need a report. Traces need an adapter, and they go stale when a hashed source file changes. A team that only wants layer rules can skip flows.

A fresh clone of this repository reports unverified trace and test lines until `npm test` has written reports for the current snapshot. Those lines are not failures. They are also not proof.

## Next

[Lesson 2](02-install-and-check.md) runs the CLI on the shop and on this repository.
