<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=d49521cc6cfb77817887ffff524d0c2a03b0447b3a6960a9ae9d386679931b8c lang=en detail=brief -->
Percent-encodes a path segment with `encodeURIComponent`, then additionally replaces `(` and `)` with `%28` and `%29`, which the standard encoder leaves untouched. Used by `map.emit.codeHref` to build safe link targets.
