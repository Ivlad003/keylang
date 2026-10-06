<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-06 closure=8cf35bdc32ecc0c39bd8da3fd1281635f022b56c2062a7194cfeba3402524585 lang=en detail=brief -->
Closes the open completion list, records the acceptance via `tui.assist.countSuggestion`, and, if the cursor hasn't moved before the word's start, replaces the typed prefix with the selected label through `tui.app.App.edit`.
