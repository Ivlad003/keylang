<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-06 closure=2bf88d40da690448d784bd8c109aa5245be2a71eab1f2ad5c4500073de840680 lang=en detail=brief -->
Handles incoming LSP notifications: syncs the open-file buffer overlay, triggers `cli.lsp.Server.changed`, sets the exit code on exit, and errors cancelled requests. Ignored before initialization.
