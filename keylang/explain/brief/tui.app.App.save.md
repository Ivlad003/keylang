<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-06 closure=01dcc2bc9bb6ed3d5c6121f96cddd9775140b88ff65aeb1c7ee53d740ef1a918 lang=en detail=brief -->
Writes the active editable buffer via `tui.app.App.persist`, then runs `tui.app.App.reanalyze`. It refuses a new file whose target now exists, and it warns once before overwriting a file changed on disk.
