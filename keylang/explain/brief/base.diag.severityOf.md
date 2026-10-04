<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=ab57cd363e3633160f31efaa7384682132f21c2e460040b1eb6d6b322a489d1d lang=en detail=brief -->
Maps a diagnostic code to its severity: a fixed set of six codes (K006, K008, K103, K106, K202, K203) yields "warning", every other code yields "error". Used by `base.diag.diagnostic` when constructing a diagnostic record.
