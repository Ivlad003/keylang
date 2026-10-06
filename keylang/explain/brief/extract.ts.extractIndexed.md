<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-06 closure=338345d48bccdf4cdb30e7412f19089268128bef06dd09dbc5de1bc1f5af3fcd lang=en detail=brief -->
Walks a parsed TS/JS syntax tree's top-level statements to build its file facts: imports, `require` bindings, declarations with their calls and JSX uses, and exports. It marks the file opaque when nesting is too deep.
