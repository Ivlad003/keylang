<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=1d81fdd5186d40bc80044109bf7d22a5c4212b0dc9d337a2baf5f3fddb72f91a lang=en detail=brief -->
Renders the current app state into a grid via `tui.view.render`, writes only the changes since the last frame using `tui.screen.renderDiff`, and keeps the grid for the next diff; skips drawing when no surface exists.
