<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=de92e3c6cdedd4372f261221fc28ab888fd28cdc33131cf560c60a57fec60de3 lang=en detail=brief -->
Terminates the background worker thread if one exists and clears the reference, without waiting for shutdown. Called during teardown by `tui.terminal.runTerminal` and `tui.web.serveWeb`.
