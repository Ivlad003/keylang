<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=67ebd33c8d05e19f5493bf03cb08d87b1f29d815b80ec99c2317f528033262fb lang=en detail=brief -->
Appends a block of audio samples to the pending buffer, silently dropping it if the queue has ended or the total would exceed the sample cap. After enqueueing, it calls `tui.web.AudioQueue.wake` to resume playback.
