<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=79697173e023e161b672199ac6e975d848432fe4ddf98afc6eac793caed98f7a lang=en detail=brief -->
Completes a pending background operation: removes and releases it, unrefs the idle worker, terminates the worker if closed with nothing pending, then resolves the caller's promise with the result.
