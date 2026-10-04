<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=b9fff6a95ab0faf545c9d4a9980b38e7af8eb48a1fda712956b510e899c61567 lang=en detail=brief -->
Looks up the language frontend for a file path via `map.frontends.frontendFor` and returns its globals table, falling back to an empty set when no frontend matches. Used by `map.graph.buildGraph` to seed per-file global symbols.
