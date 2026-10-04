<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=508b4c54650a35eda493c794714e00a1243919685e39332c87fc74dd09bda884 lang=en detail=brief -->
Holds the per-browser-tab state of the web TUI: the running `App`, the open WebSocket (or null when disconnected), a pending timer, and an `AudioQueue` that buffers PCM sent by the page while Ctrl+R recording is active.
