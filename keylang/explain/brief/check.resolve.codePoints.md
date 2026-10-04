<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=76b0a52852385cdecc028e200936bcc4b9eb3f587c7f8f645cddc01fdbde6593 lang=en detail=brief -->
Counts the Unicode code points in a string by spreading it into an array, so surrogate pairs count once rather than twice as with `.length`. Used by `check.resolve.similarity` to size strings for comparison.
