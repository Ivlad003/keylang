<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=83fbd95520169cd095cdae88a6dece8f62303f93981be129f91c9e3b16d397da lang=en detail=brief -->
Shapes an open audio capture as an async stream of 16-bit PCM sample buffers plus a callback that ends the capture. Local voice code in `features.voice-local` consumes the stream and invokes the callback to release the device.
