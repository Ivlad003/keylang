<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-06 closure=dcd455bdb09aac53151f37a1baf08f138749941d0adf4b17e965a9220f1928c1 lang=en detail=brief -->
Inserts filtered typed or pasted text at the cursor via `tui.app.App.edit`, splitting on newlines into multiple lines and placing the cursor by grapheme clusters, then refreshes completion via `tui.app.App.complete`.
