<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=d5559dcb033ca22abb6250f1d6d24a349560f7aa0f6a1582518552940b4bda30 lang=en detail=brief -->
Routes each input event to the active surface: mouse via `tui.app.App.mouse`, pastes into prompt or editor, keys through quit, help, prompt and results overlays, then by mode to handlers like `tui.app.App.editKey`.
