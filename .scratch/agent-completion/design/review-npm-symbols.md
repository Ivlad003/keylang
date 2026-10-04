# Adversarial review: `npm-symbols` design

The design mostly holds up. I found one high-severity gap and several medium ones that need fixing before implementation.

## Defects

### HIGH

**H1. The deps-slice contract is incomplete: IDs must come from the graph's own ID function.**
- The graph gives collision suffixes only among packages the code imports: `externalModuleIds()` at `src/graph.ts:880-908`, which walks `f.imports`.
- `declaredExternalIds()` (`src/declared-packages.ts:16-21`) applies no collision logic at all.
- Example: `@scope/pkg` is imported, and both `@scope/pkg` and `scope-pkg` are declared. The snapshot gives `@scope/pkg` the ID `external.scope-pkg`, because it is the only imported name and so it is the keeper. The declared set gives that same ID to `scope-pkg`.
- The `PackageTable` would then attach the wrong package's symbols to an existing snapshot node. Hover and describe would then mix two packages.
- **Correction:** state it as a hard precondition. `DeclaredPackage.id` must be computed by one shared function over the union of declared and imported packages, and the graph must use the same function. Add one assertion to the LSP test: every table key that is also a snapshot external node refers to the same npm name (`node.comment` holds it, see `.keylang/index.json`, for example `external.anthropic-ai-sdk.comment = "@anthropic-ai/sdk"`).

### MEDIUM

**M1. The cache misses inputs that are absent, so installing something later leaves a stale entry.**
- Validity covers only the SHAs of manifests and closure files that were found.
- These cases are never re-checked:
  - `@types/x` installed after a `no-typings` result;
  - a relative `export * from "./x.mjs"` that did not resolve and now does;
  - an `exports` candidate that was missing;
  - `@types/x` newly added to `package.json` (decision 4 makes that an input);
  - `not-installed` becoming installed.
- The resolver already solves this: `this.inputs.set(..., found === null ? null : ...)` at `src/imports.ts:122`.
- **Correction:** `inputs.files` records every probed path, with `null` meaning absent. The key also includes `typesDeclared: boolean` and the resolved package dir. The in-session re-check is then over the manifests plus the `null` probes.

**M2. The cache and table are keyed by npm name, which breaks monorepos.**
- `web/package.json` can declare `zod@3` while the root declares `zod@4`. §3.2 resolves `node_modules` from the declaring manifest, so there are two dirs for one key and one ID.
- **Correction:** key the cache by resolved package dir, relative POSIX. For the table, pick deterministically: the manifest nearest the root, ties broken by path order. Record this choice as an open question.

**M3. Server-side narrowing changes what the TUI shows.**
- The TUI filters case-insensitively, and also by substring: `label.toLowerCase().startsWith(prefix)` / `includes(prefix)` at `src/tui/app.ts:1122-1124`.
- `label.startsWith(typed)` is case-sensitive, so `step external.ws.websocket` would drop `WebSocket` in the TUI. The claim "the visible result is the same" is false.
- VS Code fuzzy filtering after a mid-word Ctrl+Space is also narrowed.
- **Correction:** narrow only by the namespace prefix `m[1] + "." + m[2]` (exact, since it is the ID structure), not by the partial last segment. Or do not narrow at all: at most 5000 items, zod 303. Do not narrow snapshot or planned candidates either.

**M4. The first completion can race with `pending`.**
- In the LSP, `refresh` is started from `analysis().then` (`src/lsp.ts:204-209`). `current()` awaits the same promise, and completion then reads `table()`.
- If `refresh` does not mark packages `"pending"` synchronously before its first `await`, the first response is `isIncomplete: false` with 0 symbols. The test's polling loop ("until isIncomplete is false") would stop there and fail, or pass by accident.
- **Correction:** state that `refresh()` sets every new or changed declared package to `"pending"` synchronously on entry. A key missing from the table means "not declared" and gives `isIncomplete: false`.

**M5. A rejected `refresh` crashes the TUI and the LSP.**
- TUI: `track()` does `void work.finally(...)` (`src/tui/app.ts:339-346`), which re-raises a rejection as an unhandled rejection and kills the process.
- LSP: `void this.packages.refresh(...)` has the same problem.
- Typings are untrusted input: malformed JSON, EACCES, a WASM parse failure.
- **Correction:** state that `refresh()` never rejects. A per-package failure becomes `state: "partial"` or `"no-typings"` with a `reason`. Unexpected errors are caught and reported through the TUI message or LSP stderr (not stdout: the LSP transport is stdout).

**M6. The ADR number collides.**
- `docs/adr/0008-shared-workspace-operations.md` already exists (untracked user WIP, visible in `ls docs/adr/`).
- **Correction:** use `0009-package-symbols-advisory.md`, or whatever number is next after the agents and deps slices take theirs. Coordinate with the orchestrator.

**M7. The package build competes with map generation in the single TUI worker.**
- `analysis-worker.ts:7-12` runs every message concurrently on one event loop. The first `generateMap` after startup would interleave with about 1.2 s of typings parsing (up to 151 ms per file for `typescript.d.ts`). That delays the first diagnostics, which is the thing the TUI is waiting for.
- The existing handler also has no `kind` discriminant.
- **Correction:**
  - Add `kind: "map" | "packages"` to every message and `Reply`.
  - Order packages after the map in the worker queue, or give it a second lazy worker.
  - Start `refresh` only after the first `adopt()`. This part already holds.

**M8. The docs contract for declared-package members is missing.**
- `docs/format.md:421` says a reference to a declared *package* gives no K001.
- I confirmed with a probe (`probes/rv1`): `step external.js-only.run` for a declared-only package gives `K001 dangling reference`. `step external.fake-lib.make` for an imported one gives `ID unverified … opaque module`.
- The resolver change at `src/resolve.ts:253` (a prefix match leading to unverified) changes the §6 text at `:421` and Р13 at `:441`. The deps slice owns that, and this design must reference it as a dependency with that doc change.
- Until it lands, the LSP and TUI tests for `js-only`, `ambient-lib` and `cjs-lib` pass while inserting those items yields K001. Either gate symbol items on "package is a snapshot node, or the resolver change is present", or sequence the slices strictly.

### LOW

**L1. `src/extract/dts.ts` must not import `isSegment` from `src/parser.ts`.**
- The layers are `base < extract < lang` (`keylang/rules.md:14`), so extract importing lang is a layer violation.
- The design mentions `isSegment` only for the resolution step, which is in `package-symbols` (the map layer, where it is fine). State explicitly that `dts.ts` imports only `base` (`brief.ts`) and `extract`.

**L2. Several anchors are off, and one is wrong.**

| Design says | Actual |
|---|---|
| `src/imports.ts:181-183` (`.d.ts` skip) | `:176-178` |
| "subpaths collapse" at `src/imports.ts:369-372` (that is `flattenTarget`) | `packageName` at `src/imports.ts:374-377` plus `src/graph.ts:365-367` |
| `declared-packages.ts:72` | `:76` |
| `exports.ts:79` | `:80` |
| `withTree` at `treesitter.ts:48` | `:49` |
| `grammarFor` at `treesitter.ts:78-84` | `:79-84` |

**L3. `Described` needs a new shape.**
- Today it has `signature: string | null` (`src/lsp-features.ts:236-240`), and `signatureHelp` returns one entry (`:317`).
- Specify `signatures: string[]`, `doc: string | null` and `advisory: string | null` on `Described`. Also state the precedence between a `planned fn external.x.y` and a package symbol with the same label in the completion `labels` Map (recommended: planned wins, and the symbol's doc is added).

**L4. Write the cache only when its bytes change.** Today every `adopt()` can call `safeWrite`. Compare with the text last written or read first; this also makes the "byte-identical" TUI assertion meaningful.

**L5. Check the closure against the realpath.** "Stays inside the package directory" must be checked on `realpath` (pnpm symlinks, malicious links). Stat each file before reading so the 2 MiB per-file limit is enforced without reading the file.

**L6. `keylang web` duplicates the index per tab.**
- `web.ts:169` shares one `SnapshotWorker`, but each `App` would own its own `PackageIndex`. That means N builds, and N writers of the same file (atomic, last writer wins).
- Pass a shared `PackageIndex` in `AppOptions` (`packages?: PackageIndex`) instead of `packageBuild`.

**L7. The "subpaths" open question rests on a partly wrong premise.**
- The snapshot and `Graph` do not carry specifiers (`src/graph.ts:60-110`).
- `FileFacts.imports[].source` exists during `buildGraph` (`src/graph.ts:880-886`), so option (b) costs one extra field on `MapResult`. It does not need new extraction.
- This repo's most-used dependency (MCP SDK) is only reachable through subpaths: `exports["."].types` points at `./dist/esm/index.d.ts`, which does not exist, and the keys are `./client`, `./server`, … plus `./*`. Root-only V1 gives zero symbols for it.

**L8. Excluding classes after `step` is questionable.** `new WebSocketServer(...)` is a call. Consider allowing `class` after `step`/`trigger` (the constructor signature is already computed), or record the choice as an open question.

**L9. `docs/design.md` is uncommitted user WIP (`M` in git status).** The §7.1 edit must be merged into it without clobbering the WIP, or deferred.

**L10. CLI test 3 is weak.** Deleting `dist` changes nothing that `check` reads (`locate` only calls `existsSync` on the package dir, `src/imports.ts:104-106`). It is acceptable as a contract guard. A stronger version: make the typings disagree with the flow (the name is absent from the typings) and assert that `check` stdout still says `unverified`, not K001.

**L11. The fixture has to fit the checkout layers.** `checkoutRepo` uses the layers `src/domain|application|infrastructure|presentation/**` (`tests/tui-fixture.ts:40`). Put `main.ts` under `src/application/`, not `src/app/`, or the importer falls outside every layer.

## Corrected design points (summary)

1. **IDs:** one shared function produces external IDs for declared ∪ imported packages. It is a precondition from the deps slice, with an LSP test assertion (H1).
2. **Cache:** key by resolved dir; `inputs.files` includes `null` probes; include `typesDeclared`; write only on change; realpath containment (M1, M2, L4, L5).
3. **`PackageIndex.refresh()`:** marks `pending` synchronously, never rejects, and runs after the map in the worker, with `kind`-tagged messages (M4, M5, M7).
4. **Narrowing:** only by the exact namespace prefix; the partial last segment is left to the client or TUI filter (M3).
5. **Numbering, placement and docs:** ADR `0009+`; `dts.ts` imports only base and extract; `format.md:421` and Р13 text from the deps slice is a declared dependency (M6, L1, M8).
6. **Web:** a shared `PackageIndex` passed through `AppOptions` (L6).

## What holds up

I checked these claims against the code and they are correct:

- **Layers:**
  - `src/extract/dts.ts` falls under the `src/extract/**` glob (`keylang.json:10`) and `package-symbols.ts` goes in the map list (`keylang.json:9`).
  - `features` importing only types from `map` is allowed.
  - `tui → map` keeps `deny tui extract`, and `lang`, `check` and `base` stay free of tree-sitter.
- **Resolver behaviour:**
  - K001 is suppressed only on an exact ID match (`src/resolve.ts:253`).
  - Members of an imported package are unverified and opaque (probe). That includes nested `external.fake-lib.ns.helper`.
- **Reusing parser code:** `withTree` keeps one parser per grammar and parses synchronously (`treesitter.ts:49-66`), so sharing it with the map extractor is safe.
- **Fact cache:** `extractorCode()` hashes every file in `src/extract/` (`map.ts:232-238`), so the one-time re-extraction after editing `dts.ts` is a correct statement.
- **Package location:** `inside()` excludes `node_modules` from "workspace" (`imports.ts:314-327`), so mirroring `locate` works, pnpm included.
- **LSP details:**
  - Completion kinds 3, 6, 7, 9 and 22 match the LSP spec.
  - Completion trigger characters already include `.` (`lsp.ts:329`), and capabilities are unchanged.
  - `docs/tools.md:104` ("нічого не записується") supports keeping the LSP read-only.
- **TUI details:**
  - `idle()` waits on work passed to `track()` (`app.ts:248`, `:339-350`), so the TUI test is deterministic.
  - The TUI hover popup already shows code lines of the definition file (`app.ts:581-587`), so symbols pointing at `.d.ts` locations get snippets for free.
- **Package facts:** MCP SDK root types are missing and `ws` has no own types (it uses `@types/ws/index.d.mts`); both confirmed on disk.
- **Advisory status:** keeping the index out of `snapshotId`, `index.json`, `check`, `map` and `--check` is consistent with `docs/format.md:786`. There are no CLI, config or diagnostic changes; this design adds no CLI flags, so none needed checking against agent CLIs.
- **Tests:** three e2e tests through the real harnesses (`tests/lsp.test.ts` Session spawns `keylang lsp --stdio`, `tests/tui.test.ts` `session()`, `tests/cli.test.ts`) fit the few-e2e-tests preference.

Probe for M8 and for the nested-member case: `/tmp/claude-1000/-home-kosmodev-pet-project-keylang/84bcd598-07f5-4d0f-99b0-ee5f051b0245/scratchpad/probes/rv1/`