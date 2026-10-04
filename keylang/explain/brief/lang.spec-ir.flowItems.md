<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=0b9e89ca4617571ad12a0cbfac3ae53dc442c974eeae36fd3d18ca30608b72d8 lang=en detail=brief -->
Converts a list of parsed syntax nodes into a flat list of flow items by delegating each node to `lang.spec-ir.flowNode` and concatenating the results, serving as the recursive step for nested flow bodies.
