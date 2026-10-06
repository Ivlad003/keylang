<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=d992958fb65f77d49065047ff0dd46eebd46ef7720dd3d9f292ebc870071ccb7 lang=en detail=brief -->
Parses Rust source with the tree-sitter Rust grammar via `extract.treesitter.withTree`, then hands the syntax tree's root to `extract.rust.extractTree` to produce the file's facts asynchronously.
