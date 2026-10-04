<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=7a62941c5ee078f9c193767d0be2e8110a76b43e70b3f5f3df27e8ef59b7621f lang=en detail=brief -->
Replaces any lone UTF-16 surrogate halves in the string with the U+FFFD replacement character so the result is valid Unicode. Used by `features.agent-cli.invocation` to sanitize text before passing it on.
