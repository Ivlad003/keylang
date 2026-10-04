<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=798af944e39b46011fe70fe43a0bc2a26c74e99ceb2e90d850afca56db42b927 lang=en detail=brief -->
Wraps a token's text together with its source span into a `Spanned<string>` value, so callers like `lang.parser.Parser.bare` and `lang.parser.Parser.interpret` can keep location info attached to the extracted string.
