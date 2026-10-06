<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-06 closure=cf1ff5d6447719f80e6b4ecae615fa52f8953f867d2361b528d5f8e107759b94 lang=en detail=brief -->
Validates the port, starts the browser UI server, prints its URL, and waits for SIGINT/SIGTERM, requiring a second Ctrl+C when sessions hold unsaved buffers, then closes the server; invoked from `cli.cli.run`.
