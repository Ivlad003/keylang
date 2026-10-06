<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=bf8baa3febe92653dad09f0fa6af164174658dd702f73cdc0693b1d38890acc4 lang=en detail=brief -->
Keeps the editor cursor inside the current buffer: line is clamped to the existing lines from `tui.buffer.bufferLines`, column to the line's cluster count from `tui.buffer.lineLayout`. With no buffer, it resets to 0,0.
