<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-06 closure=860fd2f6fe493d40cf0b67b4127b8311169fb3564978b9ae8a446a158b3d338b lang=en detail=brief -->
Clears any completion, pops the last snapshot from the active buffer's undo stack and restores its text via `tui.buffer.setText` and cursor, or reports "nothing to undo". Then clamps and scrolls the cursor and schedules reanalysis.
