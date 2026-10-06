<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=f37a7db5da0e8767571bebf7cd58c9717b7988331ef7f73f4a3467be86ef5ac7 lang=en detail=brief -->
Validates that the mode is algo, llm or hybrid (throwing otherwise), locates the project root via `map.analyze.findRoot`, then dispatches to `cli.cli.draftMapPrinter` or `cli.cli.draftRulesPrinter`.
