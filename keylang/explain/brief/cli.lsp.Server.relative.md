<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=6ed7a5e18d9141695025877f984405ef8b0e787fa8494d5b520815ab80f49cd7 lang=en detail=brief -->
Converts an absolute file path into a POSIX-style path relative to the server root when `map.analyze.within` confirms it lies under that root, otherwise returns the path unchanged through `base.config.toPosix`.
