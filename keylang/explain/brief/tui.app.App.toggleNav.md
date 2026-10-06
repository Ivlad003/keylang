<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=4a3a0eb60c46f8d0a5446261f686d083e28d6b02be9ae32dba887623153b815b lang=en detail=brief -->
Flips the navigation panel's visibility, recording it as the last panel when shown and moving focus to the editor if it was on the hidden panel, then refreshes via `tui.app.App.narrowNote` and `tui.app.App.keepVisible`.
