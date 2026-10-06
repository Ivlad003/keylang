<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=e43745e4611d06cb2d74e2fd34d0389d9144bd11b390df9451eab78b69f57c6e lang=en detail=brief -->
Parses existing JSON text via `features.harness.parseObject`, merges its `hooks` key using `features.harness.mergeHooksValue` (removing it when undefined), and serializes via `features.harness.finishJson`, passing errors through.
