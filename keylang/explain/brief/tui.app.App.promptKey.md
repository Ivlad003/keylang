<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-06 closure=4ef751258d6c0bcc062adbe7fff5e2a8058196c15f4c276b7c66e47d15f4b60a lang=en detail=brief -->
Routes a keypress while a prompt is open: Escape clears the prompt from state, and any other key goes to `tui.prompt-keys.promptKey` with the bindings returned by `tui.app.App.keysFor`.
