<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=8920c3e96c28de448c9e06906ced8f1d2b8673c36aa0cb727b7ad5c3a6abf9c0 lang=en detail=brief -->
Guard that throws an `Error` naming the offending command when the argument list is empty, so `cli.cli.run` can reject subcommands invoked without any path operands before doing any work.
