<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=8a715a1d073363ad575c447feff3e42a0b06ad982f7ffe306187e46aba922a1b lang=en detail=brief -->
Looks up the frontend registered for a language in the module-level `FRONTENDS` table and returns it directly, with no fallback for unknown languages. `map.graph.buildGraph` uses it to pick the parser per file.
