<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=47f265c3e06654986d85d2c7e2f35e677616394b19bdb763931f4c7b01c4feb1 lang=en detail=brief -->
Clears completion and pops the last snapshot from the active buffer's undo stack, restoring its text via `tui.buffer.setText` and its cursor. It then clamps, scrolls into view and schedules reanalysis, or reports "nothing to undo".
