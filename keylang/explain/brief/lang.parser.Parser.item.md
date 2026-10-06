<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=437345210adc80735fbcb6400afdcc2ef3a5b28b91694cdaa06244333413b9ee lang=en detail=brief -->
Parses a bulleted list line: checks indentation (K003), closes deeper lists, then lexes the item via `lang.parser.lex` and classifies it with `lang.parser.Parser.interpret` before pushing it onto the nesting stack.
