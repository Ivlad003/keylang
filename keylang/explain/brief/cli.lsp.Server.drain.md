<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=d409b0318e79f705d7ab42be5dce1bb033de63ea618aea4c6e1bcbf5faf94e13 lang=en detail=brief -->
Repeatedly awaits every in-flight request promise until the pending set is empty, then cancels any scheduled timer so the server can shut down cleanly; `cli.lsp.serveLsp` calls it at the end of a session.
