<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=276a4f38aaa0892ba81d23aa18d888b3658e37f8a8aa8a328819daff7efb93a3 lang=en detail=brief -->
Draws the hover popup in the editor as a box sized to its lines (capped at 72 columns) via `tui.view.drawBox`, placed below the cursor or above if it won't fit, and writes each line styled by its kind with `tui.screen.Grid.write`.
