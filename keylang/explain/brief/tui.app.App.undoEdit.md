<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-06 closure=1d48356b09bbb2f5e08870436e3bcb127a555740bceab4c62c3e5ec5511be8d1 lang=en detail=brief -->
Clears any completion, pops the last undo snapshot from the active buffer and restores its text via `tui.buffer.setText` and its cursor, then clamps, scrolls into view and schedules reanalysis; reports "nothing to undo" if empty.
