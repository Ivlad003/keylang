<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=f111a58064f2699132eda4f2eb082f6b9343e0aafce30e4452f41b550b24b4ab lang=en detail=brief -->
Walks a tree-sitter syntax tree iteratively from `root` and builds a map from each named child's numeric id to its parent node, skipping null children. `extract.ts.extractTree` uses it to look up parents during fact extraction.
