# flow check

`keylang check` on the repository: the CLI runs the shared check operation,
which builds a fresh analysis in memory
(snapshot, specs with the map rendered from it, test reports, traces), then
resolves ids, evaluates rules and flows, and prints the findings. Nothing is
written. The `@flow check` test in `tests/cli.test.ts` records the trace; the
`node:test` reporter records the test results for the current snapshot.

Both land in the git-ignored `.keylang/`, so run `npm test` before
`keylang check --strict`. On a fresh clone, or after any source change
without `npm test`, exactly these are `unverified` (no report / stale
report, no trace / stale trace): the `trace` line of the trigger and of each
of its twelve steps, and the `tests` line of both invariants — 15 in all. ID
and static evidence does not depend on a run.

- trigger cli.cli.main
  - step cli.cli.run
    - step cli.cli.cmdCheck
      - step operations.operations.runCheck
        - step map.analyze.analyze
          - step map.map.generateMap
          - step lang.parser.parse
          - step check.assess.assess
            - step lang.spec-ir.compileSpec
            - step check.resolve.check
            - step check.rules.evaluateRules
            - step check.flows.evaluateFlows
      - step cli.cli.writeCheck
      - invariant a denied import is reported as K102 without writing the map
        - test tests/cli.test.ts "check sees a new denied import without writing the map"
      - invariant a flow id resolves against current code, not the committed map
        - test tests/cli.test.ts "a flow id resolves against current code, not the committed map"
