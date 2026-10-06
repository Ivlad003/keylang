<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-06 closure=535ce977b59dc102fed8718c1e9845301111c87dff8ee3a9b187ce4d7027f81f lang=en detail=brief -->
Parses CLI arguments, handles help/version, opens the terminal UI when no command is given, and dispatches each subcommand to its handler such as `cli.cli.cmdCheck` or `cli.cli.cmdExplain`, returning an exit code.
