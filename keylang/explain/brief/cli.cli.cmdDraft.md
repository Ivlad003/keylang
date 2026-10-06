<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-06 closure=9ca9b043283d396075411504f758c64504a662e7564af1ed5d5d0a92a96847d2 lang=en detail=brief -->
Dispatches the draft subcommand: `rules`/`map` go to `cli.cli.cmdDraftLayout`, while `flow <trigger>` validates the trigger and algo/llm/hybrid mode, then calls `cli.cli.draftFlowPrinter` at the root from `map.analyze.findRoot`.
