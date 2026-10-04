<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=e1f05503831c3ecdd25d721bf105ca53bef0607c2f62b8eac1ec255fcea95e54 lang=en detail=brief -->
Parses Rust source with the tree-sitter grammar via `extract.treesitter.withTree` and hands the root node to `extract.rust.extractTree` to build the file's facts. Returns a promise resolving to those facts.
