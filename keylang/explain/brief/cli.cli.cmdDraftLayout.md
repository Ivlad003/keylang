<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-06 closure=00e5809f68caf8df05d40f7c942c00bf834290858cdbc56a0d72b085feb71d5f lang=en detail=brief -->
Validates that the draft mode is algo, llm or hybrid, locates the project root via `map.analyze.findRoot`, then dispatches to `cli.cli.draftMapPrinter` or `cli.cli.draftRulesPrinter` and returns its exit code.
