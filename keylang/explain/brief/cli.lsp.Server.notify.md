<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-06 closure=f7e353547fc369565f840763fa9545918bb9209c41b75e7d4959db363cdef176 lang=en detail=brief -->
Handles LSP notifications: sets the exit code, drops anything before initialization, syncs open-document buffers via `cli.lsp.Server.edited` and calls `cli.lsp.Server.changed`, and errors out cancelled pending requests.
