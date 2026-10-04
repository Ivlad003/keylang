<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=f425f20da0178c6268db615978578e40739e154fd7c22aebae908b71d7a28299 lang=en detail=brief -->
Converts any thrown value into a display string, taking `message` from `Error` instances and stringifying everything else. Callers across `tui.app` and `tui.assist` use it to turn caught failures into user-facing notes.
