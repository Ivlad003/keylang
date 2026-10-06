<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=9443e032c727183400c99205c5d8bd976f84b70fe9b8785a2926d190c2f5bc91 lang=en detail=brief -->
Computes a string's terminal display width by splitting it with `tui.width.graphemes` and summing each cluster's 0/1/2-column width from `tui.width.graphemeWidth`; used throughout layout, padding and wrapping.
