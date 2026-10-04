# Adversarial review: `deps-completion` design

The blocker is real, but six of the design's claims do not hold. The most serious are an ADR number that is already taken, a clash with ADR 0007, and workspace and `@types` packages that are wrongly treated as known externals. I edited no repository files. My probes are in `scratchpad/probes/rv2/`, `insert2.ts` and `p-calls.ts`.

## Checks

**Blocker reproduced.** Repo `rv2` has `pg` only in `package.json`, and its flow has one `step external.pg`. `keylang check` prints `ID fail external.pg: K001 dangling reference` and exits 1, with no K001 diagnostic.
- `src/resolve.ts:253` skips `knownExternal`.
- `idVerdict` (`src/flows.ts:209-224`) never sees it.
- `evaluateFlows` in `src/assess.ts:57-66` passes no `knownExternal`.

**Repo `r1`, today.** All six rows of the design's §3.2 "Today" column match: the K001s, `ID fail external.junkpkg` and the K202 text `(?:1)`.

**Insert position (my probe `insert2.ts`).** I re-ran the insert with the design's actual rule, which skips `kind` and `planned`. The output stays in `fmt` form in all 4 flow cases, and a rules section gets no edit.

## Defects

### High

**H1. The ADR number is taken.** §6 proposes `docs/adr/0007-declared-packages.md`.
- `docs/adr/0007-format-editions.md` already exists.
- `docs/adr/0008-shared-workspace-operations.md` is the user's untracked work (`git status`).
- Fix: use `0009-declared-packages.md`.

**H2. "No format edition" conflicts with ADR 0007 and is not argued.** ADR 0007, Decision 1, says an incompatible change of meaning of already-written texts needs a new edition, so that a package update cannot silently turn a green `check` red. Two parts of the design do exactly that:
- **§1.3:** a reference known today only through a nested or excluded manifest becomes K001. Examples are `bench/**`, `editors/**` (`editors/vscode/package.json` is in git), and a `Cargo.toml` that is not an ancestor of any analysed file.
- **§1.2:** a hand-written `deny app external.scope-pkg` silently changes which package it names when only `@scope/pkg` is imported.

Fix: the new ADR must say explicitly why this is a bug fix under ADR 0007. The argument is that `format.md:421` already specifies "between a code file and the root", so the code is what is wrong. The PR must also flag it as an incompatible change. Otherwise, gate the collision-ID change behind `format: 2`.

**H3. Workspace packages become "known external" wider than before.**
- §4.2 skips the `workspace:`, `file:`, `link:` and `portal:` ranges only in completion. They stay in `knownExternal`.
- The resolver treats these packages as internal workspace modules (`src/imports.ts:95-127`), so `external.<wslib>` never becomes a snapshot node.
- With §3.1, `external.wslib.anything` also becomes unverified instead of K001, which hides real typos.
- Fix: leave these ranges out of `Analysis.packages` and `knownExternal`. Also leave out names that match a root `workspaces` package, via the same lookup as `workspaceDirs`.

### Medium

**M1. The auto-import is no longer "needed", so decision 2's condition is undefined.**
- After §3.2, a declared-only `step external.pg` is already `ID unverified`, with or without the `planned` line. The check exits 0 either way.
- The line then only records intent and later produces a K202 warning (`src/diag.ts:50`) as soon as any module imports the package.
- Fix: state what "needed" means. For example, the static line differs: "planned module, not implemented" versus "not in the snapshot". Or list this as an explicit open question for the user.

**M2. `map` and `map --check` start failing on bad nested manifests.**
- Today only `analyze` reads the manifests (`src/analyze.ts:97`). After §1.2, `buildGraph` does, so plain `keylang map` now fails with exit 2 on invalid JSON in an ancestor `package.json`.
- The TS resolver reads the same file with `parseJsonc` (`src/imports.ts:75`), which tolerates comments and trailing commas. `declared-packages.ts:62` uses strict `JSON.parse`. The same text would then be both accepted and fatal.
- Fix: use one parser for both. Parse the text already held in `resolver.inputs` instead of reading the file again, and document the error in `docs/tools.md` `map`.

**M3. The TUI accept uses a stale range.** §5.1 applies `item.textEdit`, whose range was computed when the list opened. The current accept uses `from`..cursor at accept time (`src/tui/app.ts:1137-1142`).
- Fix: keep building the main replacement from `completion.from`..`cursor.col`. Take only `additionalTextEdits` from the item.
- Also re-check at accept time that the package is still in no `plannedDecls` of the live docs, which avoids a K002 when two `planned` lines land.

**M4. `@types/*` is inconsistent.**
- The resolver counts `@types/x` as declaring `x` (`src/imports.ts:91`).
- Today's manifest code, and the design, put `external.types-x` into `knownExternal` (`declared-packages.ts:20`).
- Fix: map `@types/x` to `x` in `knownExternal`, or drop it, rather than only hiding it in completion. This answers open question 4.

**M5. The "2 failing tests are the incomplete copy" claim is unproven.** The failures are "generated maps of the repo parse" and "packed tarball".
- Fix: run the resolver change in a git worktree, not in `kl/`, before claiming 0 regressions. The first test is exactly the one `src/external-ids.ts` and the regenerated `base.md` would affect.

**M6. The alias-position exclusion list is hand-written.** §4.3 lists the words module, fn, type and event.
- My parser probe (`p-calls.ts`) shows that under a map `module`, `- calls x` and `- exports a` both parse as `dep`.
- Fix: derive the exclusion from `keywordsAt("map", "module")` (`src/parser.ts:124`), not a literal list. State that `calls` under a module is an alias in the grammar.

### Low

**L1. Wrong anchors.**
- `evaluateOnSnapshot` starts at `src/rules.ts:149`. Lines 243-297 are its edge loop.
- `wiring.ts:143` calls `denyingRule` directly, not `blocksDependency`, so `dependencyGate` must not replace `denyingRule`.
- `tests/cli.test.ts:1842` and `:1849` need no update: `/K202 planned module \`external\.stripe\`/` still matches the new text. Tighten them if the exact wording matters.

**L2. §1.2 and §1.4 use two names.** §1.4 calls `declaredPackages(config, [])`, but §1.2 only defines `readManifests`. Use one function name.

**L3. Public API.** `check()` is exported from `src/index.ts`, and the meaning of `ResolveContext.knownExternal` widens to cover members. Mention this in the changelog or PR text.

**L4. Cargo scope.** `format.md:421` does not limit `Cargo.toml` to the ancestor rule; the design does. Write this interpretation into the doc, together with how "the only importer is excluded" reads (only excluded files inside a layer count).

**L5. Sorting.** Sort `Graph.packages` and the declarations with `compareText`, as elsewhere, not `<`.

**L6. `EXTRACTOR_VERSION` bump.** The bump is justified, because `snapshotId` hashes inputs, not edges (`src/snapshot.ts:184-189`), and IDs change on the same inputs. It also invalidates every fact cache (`src/map.ts:65`); mention this in the risks.

**L7. Missing coverage.**
- Hover, definition and K001's "did you mean" do not know declared-only packages. List this as out of scope or add it.
- The TUI test should also run `fmt --check` on the saved file.
- The TUI test says "line 4". In `CHECKOUT_FLOW` the anchor `- trigger` is line 5 (1-based), so write the assertion 0-based and say so.

**L8. The popup's `planned` detail shows twice.** `view.ts:447` already prefixes "planned" when `description === "planned"`, and the detail already starts with `planned fn`. This bug already exists. Mind it when adding `+ planned`.

## What holds up

**Code facts:**
- Layers: `src/external-ids.ts` in `base`, importing `layerName` (base), may be imported by check, map and features under `keylang/rules.md`.
- Deny and K101: `dependencyGate` semantics hold. `specific()` is `decide(…,1)` (`src/rules.ts:739-743`), and `external` is unordered (`src/rules.ts:54`, `layerViolation` at `:511`), so K101 never removes externals.
- Rule targets: dropping fn and type from `allow`/`deny` completion is correct, because such rules are K005 (`format.md:547`).
- LSP freshness: requests wait for the current generation (`src/lsp.ts` header, `:293`), so the "didChange, then no edit" test is deterministic.
- TUI buffers: `setText` reparses `buffer.doc` synchronously (`src/tui/buffer.ts:25-28`), and `live()` passes those docs, so `plannedDecls(ws.analysis.docs)` covers unsaved text.
- IDs: segments have no dots (`layerName`, `src/config.ts:496`), so `externalPackageId` with `/^external\.[^.]+/` is sound.

**Design points:**
- MCP caching: putting the manifest texts into `resolverInputs` also fixes the MCP cache key (`src/mcp.ts:55`).
- The auto-import edit is an empty range at column 0, so it cannot overlap the main edit. Applying edits in descending order in the TUI makes one `edit()`, which is one undo entry (`src/tui/app.ts:476`).
- The K202 fix (`src/flows.ts:639`, `code.file === null`) picks a deterministic edge.

**Contracts:**
- There is no new syntax. `planned-args` already allows `planned module external.X` (`format.md:865` area).
- There are no new CLI flags, no stdout pollution, no writes in `--check`, no network, and no spawned processes.

**Test fixtures:**
- `tests/fixtures/repo` imports `node:fs`, so the `external.node` assertion has something to test.
- The line numbers of `FLOW` (`tests/lsp.test.ts:166`) match the claimed insert at line 3 (0-based).
- `checkoutRepo(t, specs)` accepts a `package.json` entry (`tests/tui-fixture.ts:42`).