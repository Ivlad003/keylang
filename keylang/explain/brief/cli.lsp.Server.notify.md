<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=53082b96901482db3fc17cedae7bd2e47f3dd68dc1d457346ade622256a9669b lang=en detail=brief -->
Handles LSP notifications: sets the exit code, keeps the open-document overlay in sync on open/change/close via `cli.lsp.Server.edited` and `cli.lsp.Server.changed`, and answers cancelled in-flight requests with an error.
