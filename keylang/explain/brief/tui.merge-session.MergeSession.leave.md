<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-06 closure=66a4574ac7117fc53c87d7adf7e38f898543d31b4e99315ecba74b05e6bee926 lang=en detail=brief -->
Ends a merge: clears merge state, refreshes the proposal list via `tui.merge-session.MergeSession.scan` (agents may have changed it), restores the prior mode, sets a status message, and clamps the cursor.
