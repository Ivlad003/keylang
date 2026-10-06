<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-06 closure=3858abcdecd555c13f05914d72c1e9fe2171a7919a998d77cd5c4ae233ecca08 lang=en detail=brief -->
Handles edit-mode keys while a ghost suggestion is shown: Alt+] cycles variants, Tab accepts via `tui.assist.Assist.acceptGhost`, other keys drop it and fall through to `tui.app.App.editKeyWithoutGhost`, then re-arm suggestions.
