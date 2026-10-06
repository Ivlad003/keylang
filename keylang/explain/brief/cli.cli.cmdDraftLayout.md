<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-06 closure=b013b1a670276a18977d0d16776d6fda619b4996a2c0886606c10e4f057bffea lang=en detail=brief -->
Validates that the draft mode is algo, llm or hybrid, locates the project root via `map.analyze.findRoot`, then dispatches to `cli.cli.draftMapPrinter` or `cli.cli.draftRulesPrinter` depending on the requested target.
