# keylang course

**English** · [Українською](uk/README.md)

![Ключ до розробки і розуміння проектів](images/banner.png)

New to the words layer, dependency and flow? Start with the [pre-course](pre/README.md) ([українською](pre/uk/README.md)). It uses the shop, before any command.

You write the spec. An agent generates the functions from it. You do not write them. keylang does not start the agent. `check` decides.

This course shows how to read and write that spec, and how to use the CLI, the terminal and the browser. The exact grammar is [`docs/format.md`](../format.md), in Ukrainian. If this course and that file disagree about a diagnostic, the spec wins. Flags are in [`docs/tools.md`](../tools.md). [`docs/design.md`](../design.md) is the target. When it describes something the tool does not do yet, the lesson says so.

Screenshots are from this repository, `node bin/keylang.js web` on 2026-09-28, and from `node bin/keylang.js check` on `examples/shop`. The local trace and test report were old, so those marks show as `unverified`.

| Lesson | You will be able to |
|---|---|
| [1. What keylang is](01-what-it-is.md) | Say what the tool checks, what it leaves alone, and what it costs |
| [2. Install, check, explain](02-install-and-check.md) | Run the CLI, read an exit code, and tell a real break from missing proof |
| [3. The language](03-the-language.md) | Write a map, a rules file and a flow that parse |
| [4. The map](04-map.md) | Set layers and read a generated map, including holes and the explained map |
| [5. Rules](05-rules.md) | Write layer order, deny, the baseline, entry, exports and cycles |
| [6. Flows](06-flows.md) | Attach `ID`, `static`, `tests` and `trace`, and read the gutter |
| [7. Wiring, the UI, and agents](07-tools.md) | Generate `wire()`, use the UI, and leave an agent's draft aside. `check` still decides |
| [8. Use cases](08-use-cases.md) | Walk four screenshot sessions, then an explained map and a feature file |

Start at lesson 1 if you are deciding whether to use it. Start at lesson 2 if you already have a repository and want a first `check`.

Two shorter tracks use the same commands on a job:

- [Adding to a codebase](existing/README.md) — a feature and a package in a repository that already exists. You write the spec. The agent generates the code.
- [Starting a project](from-scratch/README.md) — a Telegram bot, a Python CRUD, and a NestJS app. keylang does not create the empty project. An agent generates the code from the spec. You do not write the functions. keylang checks the shape.
