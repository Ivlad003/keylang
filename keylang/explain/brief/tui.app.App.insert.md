<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-06 closure=08904264d12b6d7461d78acd01620c11561a91283ea218942dcf5d342c7a6380 lang=en detail=brief -->
Splices filtered input text into the active buffer at the cursor via `tui.app.App.edit`, splitting multi-line pastes into new lines and placing the cursor by grapheme clusters, then refreshes completion via `tui.app.App.complete`.
