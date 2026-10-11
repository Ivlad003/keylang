# keylang course

**English** · [Українською](uk/README.md)

![Ключ до розробки і розуміння проєктів](images/banner.png)

If the words layer, dependency and flow are new to you, start with the [pre-course](pre/README.md) ([українською](pre/uk/README.md)). It explains them with a small shop as the example, before you run a single command.

keylang is built around a division of labour. You write the spec, and an agent generates the functions from it, so you never write those functions yourself. keylang does not start the agent either. Its job is to check the result, and `check` has the final say.

This course teaches you to read and write that spec and to work with it from the CLI, the terminal and the browser. The exact format spec is written in Ukrainian and split into the syntax in [`docs/grammar.md`](../grammar.md), ids, diagnostics and evidence in [`docs/semantics.md`](../semantics.md), and the code snapshot in [`docs/snapshot.md`](../snapshot.md). If this course and the spec disagree about a diagnostic, trust the spec. Commands and flags are described in [`docs/cli.md`](../cli.md) and in `keylang --help`; the terminal and browser UIs are described in [`docs/tui.md`](../tui.md). [`docs/design.md`](../design.md) describes where the tool is heading rather than what it does today, so when a lesson mentions something the tool cannot do yet, it says so.

The UI screenshots were taken in this repository with `node bin/keylang.js web` on 2026-09-28. The local trace and test report were out of date that day, so the marks that depend on them show as `unverified`. The CLI pictures show the output of 0.7.0; `node scripts/cli-screenshots.mjs` takes them again from the current checkout.

| Lesson | You will be able to |
|---|---|
| [1. What keylang is](01-what-it-is.md) | Say what the tool checks, what it leaves alone, and what it costs |
| [2. Install, check, explain](02-install-and-check.md) | Run the CLI, read an exit code, and tell a real break from missing proof |
| [3. The language](03-the-language.md) | Write a map, a rules file and a flow that parse |
| [4. The map](04-map.md) | Set up layers and read a generated map, including its holes and the explained map |
| [5. Rules](05-rules.md) | Write layer order, deny, the baseline, entry, exports and cycles |
| [6. Flows](06-flows.md) | Attach `ID`, `static`, `tests` and `trace`, read the gutter, write routes, webhooks, timers and parallel steps, and adopt a discovered flow |
| [7. Wiring, the UI, and agents](07-tools.md) | Generate `wire()`, use the UI and the diagram page, and keep an agent's draft aside while `check` still decides |
| [8. Use cases](08-use-cases.md) | Walk through four screenshot sessions, then an explained map and a feature file, and a repository you have never seen |

If you are still deciding whether keylang is worth using, start with lesson 1. If you already have a repository and want to see your first `check`, start with lesson 2.

Two shorter tracks apply the same commands to a concrete job:

- [Adding to a codebase](existing/README.md): add a feature and a package to a repository that already exists. You write the spec, and the agent generates the code.
- [Starting a project](from-scratch/README.md): a Telegram bot, a Python CRUD app, a NestJS app, and a project drawn as a diagram (`keylang web --new`). You create the empty project yourself, an agent generates the code from your spec, and keylang checks that the result keeps the shape you described.
