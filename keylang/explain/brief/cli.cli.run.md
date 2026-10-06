<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-06 closure=3ac4f1758680f2eda9a318564cb0464e2d8250af032235f85e1b342537e4b83a lang=en detail=brief -->
Parses CLI arguments, handles help/version, opens the terminal UI when no command is given, and dispatches each subcommand to its handler such as `cli.cli.cmdCheck` or `cli.cli.cmdWeb`, returning an exit code.
