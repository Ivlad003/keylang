<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=37d4e25f12934a96ebb5b4e321e5695b1bf1c52e8ff6e71683187f1d46572581 lang=en detail=brief -->
Clamps the terminal size into allowed bounds (at least 20 columns, 8 rows), clears hover state, then calls `tui.app.App.keepVisible` and redraws via `tui.app.App.draw`.
