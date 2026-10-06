<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-06 closure=35f329532a90cf70edf7b94e820b0ddbb4c4eff24a12daf7cc5bb9ea9309a6ff lang=en detail=brief -->
Shuts the app down: clears pending timers, closes `tui.assist.Assist.close` and `tui.clip-chat.ClipChat.close`, drops the surface and pending quit, cancels any running operation and ends its worker, then calls `tui.app.App.wake`.
