<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=b460c820ef29a520404700d39e72882f40a7200908fb463193a358ddb7a31988 lang=en detail=brief -->
Checks a snapshot's module dependency edges against deny/allow/layer rules, emitting K101/K102/K107 failures and ok or unverified verdicts that account for coverage holes, using `check.scc.stronglyConnected` for cycles.
