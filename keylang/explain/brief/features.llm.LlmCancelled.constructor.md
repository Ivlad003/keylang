<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=809bcaec24839b9d67fd45459c5b32306d37041e44aa0b1ea7ee8456be80e25f lang=en detail=brief -->
Builds the error message as the provider name followed by ": cancelled", passes it to the parent `Error`, and sets the error's `name` to "LlmCancelled" so callers can identify a cancelled LLM request.
