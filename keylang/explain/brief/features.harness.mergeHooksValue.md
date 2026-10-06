<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=9dbd3c91e04f57f831ac3aa7f7c660de7dc646c02a9b2a2b3268ff4963babbf1 lang=en detail=brief -->
Validates a hooks object and rewrites its Stop groups via `features.harness.rewriteGroup`, appending the versioned `features.harness.hookCommand` if missing and pruning empty groups, returning undefined when nothing remains.
