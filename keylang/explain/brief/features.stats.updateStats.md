<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=da37d7bf4907f2cced34157a3b444a9517afbca153b1184bf74ea79599c4a00a lang=en detail=brief -->
Loads the current stats via `features.stats.readStats`, applies the caller's mutation to the object, then persists it as pretty-printed JSON under `.keylang` through `base.safe-write.safeWrite`.
