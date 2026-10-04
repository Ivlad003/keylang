<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=b61f29914eb347161f0b24b6145838cf0ab568e3a6116fe2c73f16c25d564623 lang=en detail=brief -->
Shifts the cursor by a relative line count, then clamps it via `tui.app.App.clampCursor` and scrolls it into view with `tui.app.App.keepVisible`. Any hover popup that was opened by keyboard is dismissed afterward.
