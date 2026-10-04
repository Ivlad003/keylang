<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=bfff810a07071108e8b5620ae6758bea71003a8b8d895ca231913e0eafa892bb lang=en detail=brief -->
Clamps the viewport size to a 20..MAX_COLS by 8..MAX_ROWS range, clears the hover target, then calls `tui.app.App.keepVisible` and `tui.app.App.draw` to realign and repaint the screen.
