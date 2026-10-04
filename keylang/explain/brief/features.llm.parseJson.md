<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=6b3d7efb3446662eecff71ea22f066909a9e5bed12747105d9bef7f58244c335 lang=en detail=brief -->
Wraps `JSON.parse` so malformed input yields `undefined` instead of throwing, letting `features.llm.openrouterComplete` safely probe OpenRouter response bodies for JSON.
