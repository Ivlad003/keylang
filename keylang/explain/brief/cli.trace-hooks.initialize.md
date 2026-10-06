<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-06 closure=aaafa4570b9cc067cdbc170de2d83c1b95b97c7e6310af0632a0b9bdfeb3fe00 lang=en detail=brief -->
Builds the map, picks the flow's functions via `map.trace-plan.flowSymbols`, wraps their bodies with `cli.trace-hooks.wrap`, keeps files that still parse, and posts the instrumentation plan (or error) to the port.
