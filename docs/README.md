# Documentation

**English** · [Українською](course/uk/README.md)

The place to start is the [course](course/README.md). It exists in English and Ukrainian, and both versions say the same thing.

The exact format spec (in Ukrainian), which the parser follows, is split into [`grammar.md`](grammar.md), [`semantics.md`](semantics.md) and [`snapshot.md`](snapshot.md); [`cheatsheet.md`](cheatsheet.md) is the grammar on one page in English. The commands are described in [`cli.md`](cli.md), MCP and LSP in [`mcp-lsp.md`](mcp-lsp.md), and the terminal UI and the browser UI in [`tui.md`](tui.md). [`design.md`](design.md) describes the target, so it still includes work the tool does not do yet; where that difference matters, the course points it out. [`research.md`](archive/research.md) is a survey of the background reading. Finally, the decisions that constrain the code are recorded as ADRs in [`adr/`](adr/).

| Document | Role |
|---|---|
| [course/pre/](course/pre/README.md) | The shop example, the key words and the decisions, before any command |
| [course/](course/README.md) | How to use the language, with screenshots |
| [course/uk/](course/uk/README.md) | The same course in Ukrainian |
| [course/existing/](course/existing/README.md) | Adding a feature or a package to a repository that already exists |
| [course/from-scratch/](course/from-scratch/README.md) | Starting from nothing: a Telegram bot, a Python CRUD and a NestJS app |
| [grammar.md](grammar.md) | Exact syntax: files, sections, indentation, keywords by position, `fmt`, the grammar |
| [semantics.md](semantics.md) | IDs, diagnostics, rules, flows and their evidence |
| [snapshot.md](snapshot.md) | What keylang reads from code, by language |
| [cheatsheet.md](cheatsheet.md) | The grammar on one page, in English, for agents |
| [cli.md](cli.md) | Commands and their output, harnesses, features, the model |
| [mcp-lsp.md](mcp-lsp.md) | The MCP server and the language server |
| [tui.md](tui.md) | The terminal UI and `keylang web` |
| [design.md](design.md) | Target design, including what is not built yet |
| [research.md](archive/research.md) | Papers and a stack comparison |
| [research-pl.md](archive/research-pl.md) | keylang through programming-language theory (Ukrainian) |
| [talk-ai-development-problems.md](talk-ai-development-problems.md) | Slides and proofread transcript of the talk that motivates an executable architecture spec (Russian) |
| [adr/](adr/) | Accepted decisions |
| [archive/](archive/) | Earlier reviews, research notes and probe results |
| [../llm.txt](../llm.txt) | A single file an agent fetches to install keylang, with rules on when to use it |
