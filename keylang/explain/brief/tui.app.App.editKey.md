<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=098dda32b02fd116936cb2be4cfc634debdc92771834e4c1e3264d7b4139d369 lang=en detail=brief -->
Handles edit-mode keys around a ghost suggestion: Alt+] cycles variants, Tab accepts via `tui.assist.Assist.acceptGhost`, others drop it and fall through to `tui.app.App.editKeyWithoutGhost`, then re-request a ghost.
