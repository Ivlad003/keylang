# Vendored anti-slop Oxlint plugin

- **Source:** [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop), copied from the `install-anti-slop` skill assets (`skills/install-anti-slop/assets/anti-slop`).
- **Source commit:** `e6676e8d0bf17c678cb45b9dacb2bd6ca8dea53a` (last commit touching `skills/install-anti-slop`); verified by matching the snapshot hash below against `git archive` of that commit.
- **Snapshot hash:** `2cf66fa1be860828766b671ac50f7cadea0b5bff27359c1b27693586b4cb95aa` — `find . -type f | sort | xargs sha256sum | sha256sum` in this directory at install time, before this file was added.
- **Installed:** 2026-10-11 with `oxlint` and `@oxlint/plugins` pinned at 1.87.0.
- **Paths:** `tools/oxlint/anti-slop/index.ts` (generic plugin, enabled in `.oxlintrc.json`); `tools/oxlint/anti-slop/effect/index.ts` copied but not registered — the project does not depend on `effect`.
- **Nested provenance:** `vendor/eslint-stylistic/UPSTREAM.md` and its `LICENSE`.
- **Local deviations:** none in the copied files.
