<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=3a72b37d66773c2352f53596f289c652a7eb6030e8522610a98a8ffa09c8caaa lang=en detail=brief -->
Shape of the on-disk cache file: a schema number and version string, plus a per-file map keyed by path holding the file's sha256 and its cached facts so unchanged files can be skipped on reload.
