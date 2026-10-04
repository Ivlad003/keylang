<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=8da4b22a3b3cf87174ff15b554c38e656a283560f4ced57bdd0a13a5b2fdfdfc lang=en detail=brief -->
Returns `null` when the ref array is empty, otherwise copies it into a tuple typed as `NonEmpty<Ref>` with the first element guaranteed present. `lang.spec-ir.dependency` uses it to reject rules that resolve to no references.
