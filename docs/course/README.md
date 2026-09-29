# keylang course

**English** · [Українською](uk/README.md)

![Ключ до розробки і розуміння проектів](images/banner.png)

If the words layer, dependency and flow are new, start with the [pre-course](pre/README.md) ([українською](pre/uk/README.md)). It teaches them on the shop example, before any command.

A guide to reading and writing keylang, and to the CLI, the terminal UI and the browser UI. The normative grammar remains [`docs/format.md`](../format.md), in Ukrainian. When this course and that file disagree about a diagnostic or a flag, the spec wins. [`docs/design.md`](../design.md) is the target design; it describes things the tool does not do yet, and those are called out here as not implemented.

Screenshots were taken from this repository with `node bin/keylang.js web` on 2026-09-28, and from `node bin/keylang.js check` on `examples/shop`. The local trace and test report were stale, so those kinds of evidence show as `unverified`.

| Lesson | You will be able to |
|---|---|
| [1. What keylang is](01-what-it-is.md) | Say which problems the tool takes on, which it leaves alone, and what it costs |
| [2. Install, check, explain](02-install-and-check.md) | Run the CLI, read an exit code, and tell a violation from missing evidence |
| [3. The language](03-the-language.md) | Write a map, a rules file and a flow that parse |
| [4. The map](04-map.md) | Configure layers and read a generated map, including its holes and the optional explained map |
| [5. Rules](05-rules.md) | Express layer order, deny, the generated baseline, entry, exports and cycles, and read K101–K105 |
| [6. Flows](06-flows.md) | Attach `ID`, `static`, `tests` and `trace` evidence and read the gutter |
| [7. Wiring, the UI, and agents](07-tools.md) | Generate `wire()`, drive the TUI, and keep an agent's code and proposals on the side `check` decides |
| [8. Use cases](08-use-cases.md) | Walk four screenshot sessions, then read an explained map and judge a feature file |

Start at lesson 1 if you are deciding whether to use it. Start at lesson 2 if you already have a repository and want a first `check`.
