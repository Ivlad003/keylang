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
5. Call `feature_status` or run `npx -y keylang@<version> feature <slug>`. Done means all four: every `planned` in that file is implemented (K202, and not K201), every step of every flow in that file is static ok, no rule fail exists in the specs, including `keylang/rules.baseline.md`, and the plan is not weaker than at the base commit (`HEAD`, or `since`). Tests and trace are informational and do not block.
6. When K202 names a `planned` declaration, delete that declaration. Leave the feature file in place.

Once a feature file is committed, its plan is the target. A `spec` gap means the file no longer has a `planned` that the code does not implement, or a `trigger` or `step` was renamed or removed. Do not rewrite the plan to fit the code: restore the line and implement it as written. If the plan itself is wrong, say so and leave the change to a person, who commits it. `info.base` shows which commit the plan was compared with; `unavailable` means git could not be read.

keylang checks only what has an id. A phrase in the spec without one ("once a day", "within 5 seconds", "retry on failure") is not checked, and done does not cover it. Implement it, and tell the person which phrases keylang could not check.

`context` returns the same bundle the keylang TUI shows for an id or for every id in a feature file: nodes, neighbors, flows, rules, code, e2e tests, and a token estimate. A planned id is marked planned and incomplete.

## Rules

Change `keylang/rules.md` and `keylang/rules.baseline.md` only by proposing the full new text through `apply_diff`. That tool writes a proposal a person merges. It does not edit the spec. A new dependency the baseline does not allow is a K102 from `keylang/rules.baseline.md`. To ask for a new edge between layers, propose `- allow <from-layer> <to-layer>` in `keylang/rules.md`: a manual rule over the same layers overrides the baseline line. After the code has the edge, `npx -y keylang@<version> baseline` regenerates the baseline from the graph; a person runs it.

## CLI fallback

When MCP is not available, run the CLI the MCP server runs, pinned to the same version (no global `keylang` is needed):

- `npx -y keylang@<version> feature <slug> --format json`
- `npx -y keylang@<version> check` and `npx -y keylang@<version> check --changed`
- `npx -y keylang@<version> spec-to-code <id> --print`
- `npx -y keylang@<version> baseline`
