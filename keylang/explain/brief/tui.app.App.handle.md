<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-06 closure=597c3f3a6c19781457bb489600305621f4d8f38a89008c44d88df9bdd034e9fb lang=en detail=brief -->
Routes each terminal input event to the right handler by modal state (quit, help, barrier, prompt, results, start screen, clip chat), global F-keys and Ctrl+P, then the current mode's key handler, e.g. `tui.app.App.editKey`.
