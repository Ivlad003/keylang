<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=6fa84ffaf864a0dd6d12f91c79259fb5392434fd1928a2bd2633cd30ec407cc1 lang=en detail=brief -->
Clears the stored waiter callback and, if one was set, invokes it so a consumer blocked on the queue resumes. Called by `tui.web.AudioQueue.push` and `tui.web.AudioQueue.end` whenever new data or completion arrives.
