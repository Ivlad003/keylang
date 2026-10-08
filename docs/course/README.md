# keylang course

**English** · [Українською](uk/README.md)

![Ключ до розробки і розуміння проєктів](images/banner.png)

If the words layer, dependency and flow are new to you, start with the [pre-course](pre/README.md) ([українською](pre/uk/README.md)). It explains them on the example of a shop, before you run a single command.

The idea of keylang is a division of labour. You write the spec, and an agent generates the functions from it, so you do not write those functions yourself. keylang does not start the agent either; its job is to check the result, and the final say belongs to `check`.

This course shows how to read and write that spec and how to work with the CLI, the terminal and the browser. The exact grammar lives in [`docs/format.md`](../format.md), which is written in Ukrainian. If this course and that file disagree about a diagnostic, trust the spec. Flags are described in [`docs/tools.md`](../tools.md). [`docs/design.md`](../design.md) describes where the tool is heading rather than what it does today, so whenever a lesson mentions something the tool cannot do yet, it says so.

The screenshots were taken in this repository with `node bin/keylang.js web` on 2026-09-28, and with `node bin/keylang.js check` on `examples/shop`. The local trace and test report were out of date at the time, which is why those marks appear as `unverified`.

| Lesson | You will be able to |
|---|---|
| [1. What keylang is](01-what-it-is.md) | Say what the tool checks, what it leaves alone, and what it costs |
| [2. Install, check, explain](02-install-and-check.md) | Run the CLI, read an exit code, and tell a real break from missing proof |
| [3. The language](03-the-language.md) | Write a map, a rules file and a flow that parse |
| [4. The map](04-map.md) | Set up layers and read a generated map, including its holes and the explained map |
| [5. Rules](05-rules.md) | Write layer order, deny, the baseline, entry, exports and cycles |
| [6. Flows](06-flows.md) | Attach `ID`, `static`, `tests` and `trace`, and read the gutter |
| [7. Wiring, the UI, and agents](07-tools.md) | Generate `wire()`, use the UI, and keep an agent's draft aside while `check` still decides |
| [8. Use cases](08-use-cases.md) | Walk through four screenshot sessions, then an explained map and a feature file |

If you are still deciding whether keylang is worth using, start with lesson 1. If you already have a repository and want to see your first `check`, start with lesson 2.

There are also two shorter tracks that apply the same commands to a concrete job:

- [Adding to a codebase](existing/README.md) — adding a feature and a package to a repository that already exists. You write the spec, and the agent generates the code.
- [Starting a project](from-scratch/README.md) — a Telegram bot, a Python CRUD app, a NestJS app, and a project drawn as a diagram (`keylang web --new`). keylang does not create the empty project for you. An agent generates the code from the spec, so you do not write the functions yourself, and keylang checks that the result keeps the shape you described.
