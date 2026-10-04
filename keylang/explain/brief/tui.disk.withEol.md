<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=2c81bd01db1e1426b17ac6ee440d4a0e755dc7b576b4c826aed929a274a4ade9 lang=en detail=brief -->
Converts every `\n` in the text to the requested line ending, returning the input unchanged when the target is already `\n`. Used by `tui.app.App.persist` and `tui.merge-session.MergeSession.write` before writing buffers to disk.
