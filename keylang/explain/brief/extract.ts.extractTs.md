<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=4669c4a77e4a2eda0e1458b2708088263d01dd444bafaef49228871333132885 lang=en detail=brief -->
Entry point for TypeScript/JavaScript fact extraction: picks the grammar for the file path via `extract.treesitter.grammarFor`, parses the source with `extract.ts.withTsTree`, and hands the root node to `extract.ts.extractTree`.
