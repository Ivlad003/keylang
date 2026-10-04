<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=2211501f86da6e2db3f459adcb89fae9a11cdcce5ba519598c46899d115aa409 lang=en detail=brief -->
Joins the root and relative path, and if that file exists reads it as UTF-8 and hands the text to `map.explanations.parseStoredExplanation`; otherwise returns null without touching disk further.
