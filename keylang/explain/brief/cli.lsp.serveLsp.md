<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=959426dac0c122240435e2618386b86c2a25f3d7b6c4788012341b6d469352ab lang=en detail=brief -->
Runs the language server over a stream, framing `Content-Length` messages into `cli.lsp.Server.receive` and answering bad JSON via `cli.lsp.Server.reject`; returns the server's exit code, or 2 on unframeable input.
