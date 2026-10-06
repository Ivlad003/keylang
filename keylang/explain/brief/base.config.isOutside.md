<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=a73b60bf6e3890c201860edffd2b0fbae8fa1064304e85bf6120c134575e6c7d lang=en detail=brief -->
Reports whether a repo-relative path matches any of the configured "outside" glob patterns by delegating to `base.config.matchesAny`; used by `map.graph.placeFile` and `map.graph.notIndexed` to exclude files.
