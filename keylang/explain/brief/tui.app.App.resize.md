<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-06 closure=037ab75481853a189486e15d0995538eb399b7be1777eaead631bc8b38920c07 lang=en detail=brief -->
Clamps the new terminal size to at least 20 columns and 8 rows and to fixed maximums, then clears hover. It then calls `tui.app.App.keepVisible` to keep the view in range and `tui.app.App.draw` to repaint.
