<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=6ec680bb115166c2fec40d9e5943b158c79a768ccda215825fceda906a6fcae6 lang=en detail=brief -->
Walks every node of each document via `tui.app.forNodes` and collects those with kind "planned" and a non-empty id. Returns their ids paired with the label text, defaulting to "fn" when no label is set.
