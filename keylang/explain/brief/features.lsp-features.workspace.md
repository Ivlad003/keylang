<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=1b10b8211069e8489639a8e47a6f8f8ca0a65aaac4d80f6b66d2a0cb113a7238 lang=en detail=brief -->
Builds an editor view of an analysis, reparsing generated map docs with `lang.parser.parse` when an open buffer differs from the fresh render. Its text lookup prefers open buffers, then rendered map content, then disk.
