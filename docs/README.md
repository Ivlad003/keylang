# Documentation

**English** · [Українською](course/uk/README.md)

Start with the [course](course/README.md). It exists in English and Ukrainian, and both versions say the same thing.

When you need the exact rules, the format spec that the parser follows is in Ukrainian and split into [`grammar.md`](grammar.md), [`semantics.md`](semantics.md) and [`snapshot.md`](snapshot.md). [`cheatsheet.md`](cheatsheet.md) puts the grammar on one page in English. The commands are described in [`cli.md`](cli.md), MCP and LSP in [`mcp-lsp.md`](mcp-lsp.md), and the terminal and browser UIs in [`tui.md`](tui.md). [`design.md`](design.md) describes the target, so it includes work the tool does not do yet; where the difference matters, the course points it out. [`research.md`](archive/research.md) surveys the background reading, and the decisions that constrain the code are recorded as ADRs in [`adr/`](adr/).

| Document | Role |
|---|---|
| [course/pre/](course/pre/README.md) | The shop example, the key words and the decisions, before any command |
| [course/](course/README.md) | How to use the language, with screenshots |
| [course/uk/](course/uk/README.md) | The same course in Ukrainian |
| [course/existing/](course/existing/README.md) | Adding a feature or a package to a repository that already exists |
| [course/from-scratch/](course/from-scratch/README.md) | Starting from nothing: a Telegram bot, a Python CRUD and a NestJS app |
| [format.md](format.md) | The index of the format spec: which numbered section lives in which document |
| [grammar.md](grammar.md) | Exact syntax: files, sections, indentation, keywords by position, `fmt`, the grammar |
| [semantics.md](semantics.md) | IDs, diagnostics, rules, flows and their evidence |
| [snapshot.md](snapshot.md) | What keylang reads from code, by language |
| [cheatsheet.md](cheatsheet.md) | The grammar on one page, in English, for agents |
| [tools.md](tools.md) | The index of the tool reference: CLI, MCP and LSP, the UIs |
| [cli.md](cli.md) | Commands and their output, harnesses, features, the model |
| [mcp-lsp.md](mcp-lsp.md) | The MCP server and the language server |
| [tui.md](tui.md) | The terminal UI and `keylang web`, with the diagram page and its editor |
| [tui-workspace.md](tui-workspace.md) | The design of the full workspace in the terminal UI (Ukrainian) |
| [design.md](design.md) | Target design, including what is not built yet |
| [archive/research.md](archive/research.md) | Papers and a stack comparison |
| [archive/research-pl.md](archive/research-pl.md) | keylang through programming-language theory (Ukrainian) |
| [talk-ai-development-problems.md](talk-ai-development-problems.md) | Slides and proofread transcript of the talk that motivates an executable architecture spec (Russian) |
| [usability-probe.md](usability-probe.md) | The protocol of a usability session with a person (Ukrainian) |
| [review-2026-10-05.md](review-2026-10-05.md), [review-2026-10-06.md](review-2026-10-06.md), [review-2026-10-11.md](review-2026-10-11.md) | The latest reviews: bugs found, risks and the tickets they produced; the 2026-10-11 one lists unreproduced candidates (Ukrainian) |
| [adr/](adr/) | Accepted decisions |
| [archive/](archive/) | Earlier reviews, research notes and probe results |
| [../llm.txt](../llm.txt) | A single file an agent fetches to install keylang, with rules on when to use it |
