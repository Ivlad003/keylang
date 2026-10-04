<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=d09c3474f04d2fb30d83115758f470e7769bca07d6e0086ccd0a825f3f6b20a6 lang=en detail=brief -->
Decides whether the Claude harness is in use by listing the `.claude` directory via the probe: missing means no, empty means yes, otherwise it defers to `features.harness.claudeHasUserFile` to check for user-authored files.
