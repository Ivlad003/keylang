<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=a1ec1a27fee7a3fe11470d30dee459e554c65df2c1caad88c764ab7acecc372d lang=en detail=brief -->
Appends empty strings to the given rows until the array is at least `DETAIL_MESSAGE_ROWS + DETAIL_META_ROWS` long, never truncating. Used by `tui.view.findingDetailRows` so the finding detail panel keeps a fixed height.
