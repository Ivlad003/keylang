<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=4c1c03563ddb68f96c7d79ae6a285e27e2b56a247381cff06663cd795e580fd5 lang=en detail=brief -->
Normalizes its input to a compiled spec: if the value already has a `rules` field it is returned as-is, otherwise the documents are compiled via `lang.spec-ir.compileSpec` and only the resulting spec is kept, dropping diagnostics.
