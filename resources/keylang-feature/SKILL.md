---
name: keylang-feature
description: Implement a feature or integration from a keylang spec. Use when adding behavior described in keylang/features, when working with planned declarations and flows, or when keylang check should decide that the work is done.
---

# keylang feature

keylang is the spec and the check. You write the code with your own edits. Do not treat a draft as done until `feature_status` says so.

## Cycle

1. Write `keylang/features/<slug>.md`. Declare each new fn, module, or integration with `planned`, and add a flow whose steps name those ids. An integration that is not in the repo yet is `planned module external.<pkg>` plus a flow step from the module that will import it. No new grammar.
2. Call `validate_spec` with that path and the full text before saving, and fix every diagnostic it returns (a K001 includes line and column).
3. Call `scaffold` for each planned fn. It returns the target path, a stub, and failing e2e tests. It does not write files and does not call a model. An id that already exists is an error that names the file.
4. Implement the bodies yourself. Put the code where `scaffold` says. Keep the declared name and signature so check can report K202 rather than K201.
5. Call `feature_status` or run `keylang feature <slug>`. Done means all three: every `planned` in that file is implemented (K202, and not K201), every step of every flow in that file is static ok, and no rule fail exists in the specs, including `keylang/rules.baseline.md`. Tests and trace are informational and do not block.
6. When K202 names a `planned` declaration, delete that declaration. Leave the feature file in place.

`context` returns the same bundle the keylang TUI shows for an id or for every id in a feature file: nodes, neighbors, flows, rules, code, e2e tests, and a token estimate. A planned id is marked planned and incomplete.

## Rules

Change `keylang/rules.md` and `keylang/rules.baseline.md` only by proposing the full new text through `apply_diff`. That tool writes a proposal a person merges. It does not edit the spec. A new dependency the baseline does not allow is a K102; after it is accepted, `keylang baseline` regenerates the baseline from the graph.

## CLI fallback

When MCP is not available:

- `keylang feature <slug> --format json`
- `keylang check` and `keylang check --changed`
- `keylang spec-to-code <id> --print`
- `keylang baseline`
