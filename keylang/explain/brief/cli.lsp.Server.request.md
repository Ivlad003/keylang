<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-06 closure=08f097647d6e77592d196b0301245484d233464245707e38c7af591ab3b1d03d lang=en detail=brief -->
Dispatches LSP requests after enforcing initialize/shutdown ordering, syncing inline buffer text, then awaits a current workspace via `cli.lsp.Server.current` and routes to `features.lsp-features.hover` and sibling handlers.
