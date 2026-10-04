<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=523afc58b4d8ef34c669e3c6700566c125290118b1e6d22b6eb4a6a1cfaed37d lang=en detail=brief -->
Normalizes a property-key syntax node to a plain identifier: string-literal keys are unquoted via `extract.ts.stringValue` (falling back to raw text), and a leading `#` on private members is stripped.
