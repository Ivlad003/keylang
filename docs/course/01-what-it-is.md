# 1. What keylang is

[Course](README.md) · **English** · [Українською](uk/01-what-it-is.md)

If the words in this lesson are new to you, the [pre-course](pre/README.md) introduces them using a shop as the example.

keylang is Markdown that lives next to your code. In it you write the spec: what each part of the program is allowed to know about the others, and which scenarios must keep working. You do not write the functions yourself. An agent reads the spec and generates the code. keylang does not start that agent; what it does is check that the generated code still matches the spec.

Take the shop as an example. The screen starts a purchase, and the purchase asks the order rules to build an order. The order rules know nothing about the screen or the database. That last sentence is not just a description — it is a rule, and when the code breaks it, the check can fail the build.

The basic shape comes from [`architecture-language.md`](../../architecture-language.md): a Markdown list of layers, modules and dependencies. keylang keeps that list and adds to it the functions inside each module, a verdict for each rule, flows, and an optional wiring generator.

The rule that layers exist to protect is older than the tool, and two sentences are enough to state it. For what to read next, see [pre-course part 4](pre/04-reading.md).

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
   keylang/migration.md         `# migration`: old ids → new ids when you move stacks

generated views that check does not read:
   keylang/flows-discovered/    a draft flow for every entry point (`flows discover`)
   keylang/map-explained/       the map with a line of words under each node
   keylang/diagrams/            the layout of the diagram page, committed for the team
```

What kind of document a section is depends on its heading, not on the file name. That means `# map`, `# rules`, `# flow checkout` and `# wiring` can all live in one file. Text before the first heading is treated as a map, which is why the original slides still parse.

The map is a view of the snapshot, and that has a consequence. Checking the Markdown alone can confirm that an id is written in the map, but not that the id still exists in the code. So `keylang check` rebuilds the snapshot in memory and resolves ids against it, even when the committed map is out of date. `keylang map --check` answers a different question: did someone forget to regenerate the map?

## What it takes on

**Finding your way.** The map is a short outline of the code: layers, modules, function signatures, and the calls made inside each function. You can read one layer file instead of opening every source file. Places the tool could not read, called holes, are listed explicitly rather than filled in by guesswork. On a codebase you did not write, `keylang tour` prints one page for a newcomer, `keylang entries` lists where execution starts, and `keylang coverage` shows what nothing reaches and where keylang is blind. None of them is a verdict.

**A rule that fails in CI.** "Domain does not import infrastructure" is a single `deny` line. To check it, keylang looks at imports, calls, type mentions and re-exports. A confirmed forbidden edge gives `fail` (K102) and exit code 1. If there is a gap in the same area, such as an import that could not be resolved, the rule stays `unverified`, because the tool cannot be sure — and that is not the same as a clean pass.

**A scenario tied to code.** Each flow step names an id, for example `step application.purchase.buy`. If the module was read completely and has no such member, the id check fails. The static check then looks for a call path from the parent step to this one. Tests and traces are separate lines, so a passing id check does not hide a missing trace.

**An agent's draft.** An agent's drafts are proposed files under `.keylang/proposals/`. The spec on disk changes only when a person accepts hunks from them (`m` in the UI, or `--apply` for `spec-to-code`). A model comment records where a line came from, but it is not a verdict.

**Jumping to the function.** Hover, go-to-definition and completion all use the same ids as the spec. When you see a diagnostic, `keylang explain K001` prints the reason behind it and a fix. With `"explain": {"map": true}`, the same snapshot also renders an explained map, which shows the doc comment under each node, or a saved brief when the code has no comment. Pressing `t` in the UI switches a layer file between the two maps. Neither map is a verdict.

**When a feature is done.** `keylang/features/<slug>.md` is an ordinary spec made of `planned` ids and a flow. `keylang feature <slug>` reports the feature as done when every `planned` id in it is implemented (K202, not K201), every step has static `ok`, no rule is left at `fail`, the baseline included, no open `?` question remains, and the plan was not weakened since the branch began. Tests and traces are reported too, but they do not block that answer. An integration that nobody imports yet is written as `planned module external.<pkg>` plus a step leading to that module.

**An agent on a repository it has not seen.** `keylang init` writes `keylang.json`, the map, `rules.baseline.md`, and a short managed block in `AGENTS.md`. If it finds Claude, Codex, Cursor or opencode, it also registers the MCP server and a skill for them. The agent then generates the program from that spec using its own tools, so you do not write those functions, and keylang does not launch the agent. The verdict still comes from `check`. Hand-written rules change only through a proposal that a person merges, and when a change deletes a `deny` or a step, or adds an `allow`, `check --changed` and the agent's Stop hook report K108: the spec was weakened. `--agents=none` skips the harness files but still writes the baseline.

## What it leaves alone

**Whether the program does the right thing.** An invariant line is just text: keylang does not parse "total equals the sum of price times quantity." What it can do is record that a named test passed. The test is the proof, and keylang only keeps the books.

**Behavior behind a hole.** Sometimes the language frontend cannot name the function being called: `obj[k]()`, a value passed through a local variable, a decorator that may replace the function, or a Rust macro it does not expand. In those cases the call is not a confirmed edge, so rules that depended on that edge stay `unverified`, and the message names the construct that got in the way. Calls a framework makes from its configuration (Magento `di.xml`, Laravel, Symfony, NestJS, Django and others) are read by framework adapters, but only for the frameworks keylang knows.

**Prose that drifted from the code.** A description in a spec is still just text, and a plain `check` does not mark it stale when the function body changes. You can opt in: `check --stale` lists each description, `when`, `then` and `invariant` whose code changed since a person accepted it (`check --stale --accept`). A saved explanation has the same mark: `explain <id>` prints `fresh` or `stale` for it. Even so, keylang never reads what the words say, and a green gutter does not mean "this paragraph is true."

**Everything around the code.** Deployments, SLOs, threat models and ADRs are outside what the tool sees. For example, keylang will not notice that two services share a database.

**Languages it does not parse.** keylang reads TypeScript, JavaScript, Python, Rust and PHP. A Go, Java or Ruby file is simply absent from the snapshot; it does not count as a quiet success. And absence is no proof that nothing depends on that file.

**Replacing other tools.** `tsc` still typechecks `keylang.gen.ts`, the test runner still runs the tests, and a reviewer still reads the diff.

## What you gain, and what it costs

The spec is a kind of file that reviewers already know how to read. A rule change is a few lines in a pull request, right next to the import that caused it. And `keylang map` does not overwrite a file that it did not generate itself.

There are three possible answers, and that is deliberate. `ok` means the claim held wherever keylang was actually able to look. `fail` means a violation was found and shown. `unverified` means neither could be established. `--strict` is how CI refuses to accept a gap; by default, a gap does not fail the run.

Ids survive lines moving around in a file, but they break when something is renamed. That matches how people talk about code: "the `buy` function in `purchase`." After a rename you get a "did you mean" hint, but nothing is rewritten automatically.

The project checks itself with keylang. `keylang/rules.md` forbids the language core and the checker from depending on tree-sitter, and that rule is an ordinary spec like any other.

The grammar pays attention to where a word appears. `module` under a layer declares a module, while `module` at the top of a rules file points to a module that has `exports` or `no-cycles`. `test` is a keyword only inside a flow. `fmt` will not invent a keyword you left out. It also refuses to reindent a file with a structural error (K003), because doing so would change the tree.

The map is not a sequence diagram: the order of `calls` is not the order of execution. In a flow, sibling steps mean "this, then that," and nested steps mean "this happens inside that."

Static structure comes for free with every `check`. Tests need a report, and traces need an adapter; traces also go stale when a hashed source file changes. A team that only wants layer rules can skip flows altogether.

In a fresh clone of this repository, the trace and test lines are reported as unverified until `npm test` has written reports for the current snapshot. Those lines are not failures, but they are not proof either.

## Next

[Lesson 2](02-install-and-check.md) runs the CLI on the shop and on this repository.
