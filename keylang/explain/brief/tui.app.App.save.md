<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=6e4d984b13369d9a995b36583df5f2e44a30ec5b739e5d2bf52361af8ef567b8 lang=en detail=brief -->
Writes the active editable buffer to disk via `tui.app.App.persist`, refusing new files whose path now exists and requiring a second press to overwrite external changes, then re-runs analysis via `tui.app.App.reanalyze`.
