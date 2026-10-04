<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=368e35a5bc7a223e0155e766436ab1f9de020180e5b998011f86d08d8472e8b7 lang=en detail=brief -->
Converts an LSP line/character position into an absolute character offset by looking up the line's start in `features.lsp-features.lineStarts` and adding the character index; a line past the end falls back to the text length.
