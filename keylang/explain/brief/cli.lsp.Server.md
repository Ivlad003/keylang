<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=4dbc9a2ca1bcbc426db644b92033983e36d47501c7c34f4bee23d4aab797e03d lang=en detail=brief -->
Validates and dispatches JSON-RPC messages via `cli.lsp.Server.receive`, tracking open buffers and cancelled requests. Edits trigger a debounced, one-at-a-time re-analysis whose diagnostics `cli.lsp.Server.publish` sends.
