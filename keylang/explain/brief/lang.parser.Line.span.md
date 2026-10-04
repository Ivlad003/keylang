<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=00a0cda5cdf61384dec4e00a00a0513f48d66071728c4da74ffcc5583fa3bd9a lang=en detail=brief -->
Builds a `Span` for a slice of the current line by converting two column offsets into absolute positions via `lang.parser.Line.pos`. Used by the lexer and parser routines to attach source ranges to tokens, nodes, and errors.
