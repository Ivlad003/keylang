<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=b4cfa04b2127a0969ba2d9d990962a615f4e90855e481fc9d8ecb6b1c444ef25 lang=en detail=brief -->
Validates an optional manifest field: returns `undefined` when absent, passes the value through when `map.declared-packages.isRecord` accepts it, and otherwise throws an error naming the file, field, and expected shape.
