<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=5a61c7ad4616f45151ca7babf49874d4c783bf736b24aa51efc34eb603ad77e9 lang=en detail=brief -->
Parses Python source text with the tree-sitter grammar via `extract.treesitter.withTree` and passes the syntax tree's root node to `extract.python.extractTree`, asynchronously yielding the file's extracted facts.
