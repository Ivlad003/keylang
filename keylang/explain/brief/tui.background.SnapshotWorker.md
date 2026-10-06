<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-06 closure=bbc617f566df888cc05c7049b60afddc8d1b57b26a7e3020abb0134b591e8378 lang=en detail=brief -->
Runs map generation on a lazily started worker thread, matching replies to pending promises by request id, and falls back to in-process `generateMap` once the worker fails. Can be terminated during teardown.
