<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=e28c22b0dab9c3e258c5ac6d7665ecb4efc5583c0d2ae81c703e758fe83d811f lang=en detail=brief -->
Checks via `tui.app.App.quiet` whether no work is pending and, if so, drains the queued waiter callbacks, resetting the list and invoking each one to release anyone awaiting idleness.
