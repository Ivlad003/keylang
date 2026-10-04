<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=51d7e513ab77159ec17292b061c4b3f58e47697c3be0fd96a666b7ecd106644e lang=en detail=brief -->
Abstracts the output target the TUI renders to: a `kind` tag distinguishing terminal from web, a `write` sink that receives ANSI strings, and an optional terminal-only hook that opens a file at a line in `$EDITOR`.
