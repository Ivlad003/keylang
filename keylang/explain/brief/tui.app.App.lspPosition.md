<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=da3858dd294275f0020b9404944c3cc9119e11737833d3cc231b8952c2cc5631 lang=en detail=brief -->
Converts an editor cursor's grapheme-cluster column into an LSP line/character position using the offsets from `tui.buffer.lineLayout`, clamping past line end. Without an open buffer, it returns character 0.
