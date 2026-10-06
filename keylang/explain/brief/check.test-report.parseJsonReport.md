<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=91f5d111b198aae6eaca88a8d1dcb9a449eb0b36708ca89ea9f657798e0658b5 lang=en detail=brief -->
Parses and validates a JSON test report against the expected schema version, turning each `tests` entry into a test case with its status, suite and snapshot. Malformed input throws an error naming the file and field.
