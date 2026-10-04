<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=304f893909c43198deffd49f0caeac222c99155b9dbd89610c89d89762638f39 lang=en detail=brief -->
Guard that checks whether `ctx.operation` is set and, if so, returns the message "an operation is already running" so an action can be blocked; otherwise yields null to allow it.
