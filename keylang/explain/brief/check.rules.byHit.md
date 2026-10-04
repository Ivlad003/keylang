<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=45f567fbe9123bcdf8ef3c94ba57fc85ad92b6c031780e9fbb3f0b599ca6d601 lang=en detail=brief -->
Comparator that orders two rule hits by the file path of the rule that produced them, falling back to the rule's starting line number when the files match. Used to give rule hits a stable, source-ordered sort.
