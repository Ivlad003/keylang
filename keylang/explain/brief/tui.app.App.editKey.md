<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-06 closure=853de4c0dd39fef985815e11728f46c22d6c2a9f1c9b0aea5ec26d557d9b9f18 lang=en detail=brief -->
Handles edit-mode keys while a ghost suggestion is shown: Alt+] cycles variants, Tab accepts via `tui.assist.Assist.acceptGhost`, other keys drop it and fall through to `tui.app.App.editKeyWithoutGhost`.
