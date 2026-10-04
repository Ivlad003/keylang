<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=00405f8619e6b00277f1ecb5281ce128bb4bbf0119dc2792a47870874059bcb9 lang=en detail=brief -->
Serialization shape for a cached file's facts: everything from `FileFacts` unchanged, except that `exports` becomes a plain array of strings rather than its in-memory form, so it can be written to and read from the cache on disk.
