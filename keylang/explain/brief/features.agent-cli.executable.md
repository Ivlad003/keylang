<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=5f0d5981ee261955120de13734fc54831708aadb01d400ab6ad902def40f32e2 lang=en detail=brief -->
Checks whether a filesystem path points to a regular file that the current process may execute, returning false on any stat or access error. Used by `features.agent-cli.findBinary` to validate candidate binaries.
