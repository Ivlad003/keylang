<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=57c446a5b103a37f4cd4697400d4148e3676e11ade588e620b9e47b261f9cd98 lang=en detail=brief -->
Moves the cursor to the next case-insensitive match of the current search query, wrapping around the `tui.app.App.lines`, then scrolls via `tui.app.App.keepVisible`; if nothing matches, sets a "not found" message.
