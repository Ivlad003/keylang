<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=9cce271b96d4dcf6fe031a2baed3906d6797df96f6c58830a39729f949500986 lang=en detail=brief -->
Replaces a buffer's contents with new text, rebuilding its parsed document via `tui.buffer.docOf` and bumping its version counter. All TUI edit, undo, and merge-write paths go through this single mutation point.
