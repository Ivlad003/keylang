<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=68b4f4655f5a1ded227cb2769f4c2a30cdb2c3be0d789298d8ca3e9587145146 lang=en detail=brief -->
Reports whether a saved explanation no longer matches the node's current closure hash by comparing `features.explain-llm.currentBaseline` against `e.closure`. Used to decide when cached answers must be regenerated.
