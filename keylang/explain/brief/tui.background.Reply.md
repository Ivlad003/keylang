<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=c50c9f939f5cacf9c400cbb8ebcf556340df717dc71da341a9722bbb997d1128 lang=en detail=brief -->
Message shape sent back from the background worker to the TUI, carrying a request `id` plus either a `MapResult` payload or an `error` string so the caller can match the response to its pending request.
