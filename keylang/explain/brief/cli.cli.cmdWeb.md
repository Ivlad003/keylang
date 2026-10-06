<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=0f5bdd19122bdc94c3136755d18f0312ed90ebf0ec6b6d1e34dd212759ddcdbb lang=en detail=brief -->
Validates the port, starts the browser UI server on the repo root from `map.analyze.findRoot`, and prints its URL. Runs until SIGTERM or Ctrl+C, which asks once more when unsaved buffers exist, then closes the server.
