# flow check

The check pipeline: the CLI loads specs, resolves ids, then evaluates rules.

- trigger cli.cli.main
  - step cli.cli.run
    - step cli.cli.cmdCheck
      - step check.rules.evaluateRules
      - invariant a denied import is reported
        - test tests/cli.test.ts "check shop reports the dangling slide reference"
