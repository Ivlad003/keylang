<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=81190b7c109aab88e20a8b2216713a8abccdd58e4c3d6c4d096c8017948e8072 lang=en detail=brief -->
Exits merge mode: clears the merge state, rescans proposals via `tui.merge-session.MergeSession.scan` since agents may have changed them, restores the prior mode, sets a status message and clamps the cursor.
