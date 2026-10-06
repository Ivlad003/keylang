<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-06 closure=51d6aec8932325ea0d56d5d4111fc592c4e6f76c5b3cd83ed24866354328dd57 lang=en detail=brief -->
Renders the current frame via `tui.app.App.paint` and writes only the changes since the previous frame, computed by `tui.screen.renderDiff`, to the terminal surface. It does nothing when no surface is attached.
