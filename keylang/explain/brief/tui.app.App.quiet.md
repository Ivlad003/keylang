<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=3195d6554c862a302cc79aca3b6c4d7f5ad8234d8ce1999b9cf4627b6d4b90c4 lang=en detail=brief -->
Reports whether the TUI is fully idle: no in-flight work counted, no pending settle timer, and the assistant not waiting on anything. `tui.app.App.idle` and `tui.app.App.wake` use it to decide whether to resolve or re-arm.
