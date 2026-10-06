<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=f7c1134e80b118a60ca0bb6109283df5a0497a327dbe5ca16f042f2b57c3ff87 lang=en detail=brief -->
Handles arrow, page, home and end keys, moving the cursor via `tui.app.App.move` and returning false for other keys. Shift+up/down in edit mode starts a line selection; other navigation clears it.
