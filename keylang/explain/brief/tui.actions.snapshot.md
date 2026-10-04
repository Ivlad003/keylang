<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=9a8295d15c82c17165a52c7a725c55a530d337a6c76521415e33a21776260764 lang=en detail=brief -->
Resolves the text to display for the current context by first asking `tui.actions.editor` for a value and, when that yields nothing, falling back to the context's `noSnapshot` field.
