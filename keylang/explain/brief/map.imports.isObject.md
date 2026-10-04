<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=9cbdc84f9ee02b832d45069ccbf81b33118650c082ac48e6ea4b793d479fab0b lang=en detail=brief -->
Type guard that returns true only for non-null, non-array object values, narrowing them to a string-keyed record. Used by the resolver and tsconfig loaders in `map.imports` to validate parsed JSON before reading fields.
