<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=ae5d7006ade0c66e62f0f5731b757a9c7248440ff1b4b58a08da084666f81d7b lang=en detail=brief -->
Builds the code map, wraps the flow's non-generator functions in tracing code via `cli.trace-hooks.wrap`, and keeps only files that still parse cleanly. Posts the instrumentation plan (or an error) over the port.
