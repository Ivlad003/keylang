<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=028d4b6079a27a4c479fb92fda18df26f108dcc2cd033be5427aeef9971629da lang=en detail=brief -->
Looks up the planned entry in the spec whose `id` matches and returns its `decl` field, defaulting to `"fn"` when no match exists; used by `check.rules.dependencyKindOf` and `check.rules.evaluateRules` to classify declarations.
