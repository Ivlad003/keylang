<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=9c5425f40f7afb5e5bf2a2b11e4c1c0d35d4cd735c4b01308d4e97af6a14417d lang=en detail=brief -->
Marks the queue as finished, records the given error only if none was stored earlier, and calls `tui.web.AudioQueue.wake` so any pending consumer notices the close. Used by `tui.web.serveWeb` to shut down audio streaming.
