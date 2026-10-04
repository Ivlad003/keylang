<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=1f607a22708668acef0b4a73ae43f013bbc11f097eb65f23de38f27db90d827b lang=en detail=brief -->
Removes ANSI escape sequences (ESC-bracket codes ending in a letter) from a string via a global regex replace, returning plain text. `features.agent-cli.runInvocation` uses it to clean captured CLI output.
