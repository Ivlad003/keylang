<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=ac8fa5827eb8638888170a923bc1732631991bc511d5a979fc068f9236e3bc60 lang=en detail=brief -->
Replaces a buffer's text, reparses its document via `tui.buffer.docOf`, and bumps its version counter. Used by app edits, undo, commits, and merge-session writes to keep buffer content and parse state in sync.
