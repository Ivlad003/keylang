<!-- keylang:explain agent=cli:claude:claude-opus-5-5 date=2026-10-05 closure=85436a8174d20f3f37cb2cb8f0fbb1fa1e4bd0c5de91651a4910fb3cb40f3abb lang=en detail=brief -->
Recursively walks a node tree, reporting dangling reference targets as K001 errors via `base.diag.diagnostic` and logging refs to opaque snapshot modules as unverified; children of a failing rule-module are skipped.
