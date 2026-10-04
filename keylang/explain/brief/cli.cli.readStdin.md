<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=d05570c9e9e3f110f2928c703e73ca5638979570214fb5c607246e191a3d5ba6 lang=en detail=brief -->
Drains `process.stdin` to completion, buffering each chunk and decoding the concatenated bytes as UTF-8 into a single string. Used by `cli.cli.cmdHook` to receive the hook payload piped in by the caller.
