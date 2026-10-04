<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=2d6d4a60de2a1a77537d9d157d6df1861006b303261c30c9fd74d8303e038a7b lang=en detail=brief -->
Clears any pending ghost-suggestion timeout, nulls the handle, and notifies the host via `settled()` that no more work is in flight; does nothing if no timer is active. Used by `tui.assist.Assist.cancelGhost`.
