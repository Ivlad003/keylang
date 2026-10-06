<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=3d6e7c9d6f631e148c8a9e0f1f3b43818f7b5f700aef83cbca867e24f8b33687 lang=en detail=brief -->
Builds the real-process terminal host for `tui.terminal.runTerminal`: wires stdio and env, registers and removes signal and crash handlers, and suspends by sending SIGSTOP to the whole process group.
