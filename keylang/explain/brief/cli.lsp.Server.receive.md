<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-06 closure=cc5e8d4196732318374954ba248c77bad56334b4e50f8a1e7dc97bb06c68d57d lang=en detail=brief -->
Dispatches each incoming JSON-RPC message: invalid ids or methods go to `cli.lsp.Server.reject`, notifications to `cli.lsp.Server.notify` (errors logged), and requests to `cli.lsp.Server.request`, sending replies unless cancelled.
