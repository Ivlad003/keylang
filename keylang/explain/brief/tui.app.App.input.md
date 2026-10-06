<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=ebb40a9313d6fd6005664b89f74750bfdeb0f8142d40846332fa17cbe727b182 lang=en detail=brief -->
Decodes a terminal chunk, merging pasted key runs into one paste event and dispatching the rest via `tui.app.App.safely`. Schedules a flush for pending escape/paste input and redraws; ignored once closed.
