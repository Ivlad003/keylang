<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=be4d0d7d030d73a0d62d9c07c14bb929eeb98c83ff45c4357cf55d50fd395ad0 lang=en detail=brief -->
Resolves a file path to the language-specific frontend used to parse it, looking the language up via `base.languages.languageOf` and indexing a static table. Returns nothing when the path's language is unknown.
