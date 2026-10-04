<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=b46e38064ca4dca294a46ebbe30796b4d1dd5b2e5b689b2f1cd95decf2f512d0 lang=en detail=brief -->
Marks a span as ended, removes it from the open-span set, and emits an "end" record with the outcome, clock id, next sequence number, and timestamp via `cli.trace.write`.
