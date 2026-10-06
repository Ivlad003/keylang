<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-06 closure=4aa2371c34bbe12b57719972c37fa1262874770d15bbecad34bb2d58d1956eba lang=en detail=brief -->
Runs the language server over a byte stream, framing `Content-Length` messages and passing them to `cli.lsp.Server.receive`, rejecting malformed JSON via `cli.lsp.Server.reject`, and returning an exit code.
