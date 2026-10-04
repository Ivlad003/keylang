<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=61549a889e37dd255c797591f1dbb89265b8c3c58e7ff406abc65f5360a94eef lang=en detail=brief -->
Compares two cell styles field by field — colors, link, and the boolean attributes coerced so missing and false match — so `tui.screen.rowEqual` and `tui.screen.renderDiff` can skip unchanged cells.
