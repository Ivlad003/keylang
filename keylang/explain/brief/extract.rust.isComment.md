<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=d511901ce13f555b25ee5c7495e0f4cba144e52f8cac7579daa54c4a76669055 lang=en detail=brief -->
Returns true when a tree-sitter node's type is `line_comment` or `block_comment`, so callers like `extract.rust.members` and `extract.rust.itemDoc` can skip or collect comment nodes while walking Rust syntax trees.
