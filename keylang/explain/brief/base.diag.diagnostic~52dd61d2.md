<!-- keylang:explain agent=cli:claude:claude-fable-5-1 date=2026-10-04 closure=4b6e6410a99fc18f49aaf27f6a3a8237dc439a697f522ab715327bd750988f4f lang=en detail=brief -->
Builds a `Diagnostic` record, deriving its severity from the code via `base.diag.severityOf`. The optional fifth argument becomes `reason` for K005 (only if it matches a known reason) and `target` for any other code.
