<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=5f52cd995b2d90a49862dfcc7ef8cb29eae797985e425bd3d9e7265d4b3bf5ca lang=en detail=brief -->
Memoizes import resolution per `(fromFile, spec)` pair in an instance cache keyed by a NUL-joined string, delegating to `map.imports.ImportResolver.resolveUncached` only on a miss and storing its result.
