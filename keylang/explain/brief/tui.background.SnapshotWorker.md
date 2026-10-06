<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=313ccdd00538134d0d863343f33f2d68510da5d9684ad7fde0d76599fd85d78b lang=en detail=brief -->
Runs map generation on a lazily started analysis worker thread, matching replies to pending requests by id and failing all of them on worker error; falls back to in-process generation once the worker fails.
