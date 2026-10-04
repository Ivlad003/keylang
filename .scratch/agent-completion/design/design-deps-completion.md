# Design: package.json dependencies in completion, resolver and auto-import (LSP and TUI)

## 0. Summary

**Blocker (fix first).** Today, a flow step to a package that is declared but not imported fails, even though no K001 diagnostic is shown. I reproduced this:
- `step external.pg`, with `pg` only in `package.json`, gives `ID fail external.pg: K001 dangling reference` and exit 1.
- Cause: `src/resolve.ts:253` suppresses K001, but `idVerdict` (`src/flows.ts:221-223`) never sees `knownExternal`.
- Without this fix, completion would suggest a line that fails.

**What I checked** in probes under `scratchpad/probes/`:
- Repo `r1` shows the current verdicts.
- `kl/` is a patched copy of `src` with the resolver change from §3. Results with that copy:
  - `flows`, `rules-area`, `format-examples`, `analyze` and `core` tests: 99/99 pass.
  - `cli` and `lsp` tests: 98 pass, 2 fail. The two are "generated maps of the repo parse" and "packed tarball". I think the copy is incomplete (no `scripts/` or build config), not that the change is wrong. I have not confirmed this.
- On this repo, the current manifest walk takes 443 ms warm (947 ms in an earlier report) and returns 181 IDs. `package.json` has 18 dependencies; the rest come from `bench/repos/*` and `.claude/worktrees/*`. The walk I propose (§1.3) takes 0.3 ms and reads only the root `package.json`.
- Auto-insert of the `planned` line: the output stays in `fmt` form in all 4 cases I tried (`probes/insert.ts`).
- **K202 already works for an external module:** once any module imports the package, it fires. But the message says `is implemented (?:1)`, because an external node has `file: null` (`src/flows.ts:639`). §3.3 fixes the message.

**Public contract changes:**
- The resolver and flow verdicts for package members (§3).
- External ID collision suffixes are now worked out over declared and imported packages together (§1.2).
- New completion positions, candidates and item fields (§4).
- TUI accept behaviour (§5).

There is no new syntax and no format edition.

---

## 1. Data: declared packages on `Analysis`

### 1.1 New shared helper `src/external-ids.ts` (layer `base`)

It depends only on `layerName` from `config.ts`, which is also `base`. That lets `check` (`resolve.ts`, `flows.ts`) and `features` use it without importing `map`.

```ts
export const EXTERNAL = "external";
/** `@scope/pkg` → `scope-pkg`, `lodash.get` → `lodash_get` (moved from graph.ts:869-872). */
export function externalSegment(pkg: string): string;
/** IDs for a set of package names; collision rule moved verbatim from graph.ts:889-907. */
export function assignExternalIds(names: Iterable<string>): { ids: Map<string, string>; warnings: string[] };
/** `external.<seg>` of an id (`external.pg.Pool` → `external.pg`), or null. */
export function externalPackageId(id: string): string | null; // /^external\.[^.]+/
```

Other changes:
- `src/graph.ts:187` keeps `export const EXTERNAL`, now re-exported from the helper. The callers in `emit.ts` and `explain-llm.ts` stay as they are.
- `src/graph.ts:869-908`: `externalSegment` is removed. `externalModuleIds` keeps only the collection of imported package names and calls `assignExternalIds`.
- `keylang.json`: add `"src/external-ids.ts"` to `base`. Then run `node bin/keylang.js map` and review the diff; `base.md` gains a module.

### 1.2 Rewrite `src/declared-packages.ts` (layer `map`)

```ts
export type DependencyField = "dependencies"|"devDependencies"|"peerDependencies"|"optionalDependencies"|"dev-dependencies"|"build-dependencies";
export interface Declaration { manifest: string /* POSIX, root-relative */; field: DependencyField; range: string | null }
export interface DeclaredPackage { id: string; name: string; declarations: Declaration[] /* sorted: manifest path, then field order */ }
export function readManifests(config: Config, files: readonly string[]): { names: Map<string, Declaration[]>; inputs: Map<string, string> };
```

- `declaredExternalIds` (`:16-37`) is removed; its only caller is `src/analyze.ts:97`.
- **`range`:**
  - npm: the value string, for example `^3.23.0`, `workspace:*` or `npm:x@1`.
  - Cargo: the string value or `table.version`, otherwise null.
- **Cargo rename:** `package =` keeps today's rule (`:94`), and it matches `src/rust-imports.ts:186`.
- **Errors:** the existing messages that name the file and the field (`:40-58`, `:66`, `:82`) stay unchanged.
- **Collisions:** `buildGraph` calls `assignExternalIds` once over the union of imported names and `names.keys()`. So a package's ID no longer depends on which colliding package the code happens to import.
  - Example: `@scope/pkg` and `scope-pkg` are both declared, and only `@scope/pkg` is imported. It becomes `external.scope-pkg-2` from the start, where today it is `external.scope-pkg`.
  - This is a contract change, but it only affects repos with colliding names.
  - Bump `EXTRACTOR_VERSION` to `"m1.9"` (`src/snapshot.ts:16`).

### 1.3 Which manifests are read (implements docs/format.md:421 as written)

A manifest (`package.json` or `Cargo.toml`) is read when all of these hold:
- It sits at the root, or in a directory between a file of the analysis and the root. The files are `buildGraph`'s `files`: the indexed ones plus excluded files that are inside a layer (`map.ts:77`).
- `isExcluded(rel, config.exclude)` does not match it.

Nothing is walked. At most one `existsSync` per distinct ancestor directory:
- `bench/**`, hidden directories and `node_modules` never contribute, because `walkSources` already skips them (`config.ts:105`).
- `Cargo.toml` without `[package]` is still skipped (`:86`).
- Python manifests are still not read (state it in the doc).
  - Reason: distribution names are not import names (`Pillow` is imported as `PIL`), so the IDs would be wrong.
  - Python packages appear only when imported, at package level.

The manifest texts go into `graph.resolverInputs` (`graph.ts:823`), so the `snapshotId` covers them.
- The key and text are the same as `ImportResolver.read`, so there is no conflict.
- This also fixes the MCP cache key (`mcp.ts:55`), which is keyed on `snapshotId`.

### 1.4 Plumbing

- `Graph` (`src/graph.ts:14-29`) gets `packages: DeclaredPackage[]`, sorted by `id`. `MapResult` carries it inside `graph`, which structured-clones fine through `tui/analysis-worker.ts:9`.
- `Analysis` (`src/analyze.ts:41-48`) gets `packages: readonly DeclaredPackage[]`:

```ts
const packages = request.withoutCode ? [] : map?.graph.packages ?? declaredPackages(config, []) /* root manifests only: languages [] */;
... knownExternal: new Set(packages.map((p) => p.id))   // replaces :97
```

---

## 2. Rules helper (performance and the K101 filter)

In `src/rules.ts`, next to `blocksDependency` (`:74-83`):

```ts
export interface DependencyBlock { code: "K102" | "K101"; text: string; file: string; line: number }
/** Collects the rules once; per pair: the winning deny, else an upward layer edge no allow keeps (same order of checks as evaluateOnSnapshot :243-297). */
export function dependencyGate(spec: SpecIR, kindOf: (id: string) => string | undefined, format: RuleFormat): (from: string, to: string) => DependencyBlock | null;
```

- It reuses `collectRules`, `ruleHits`, `decide` and `layerViolation` (`:511`).
- `blocksDependency` becomes `dependencyGate(...)(from,to)?.code === "K102"`, so its callers (`wiring.ts:143` via `denyingRule`, `spec-to-code.ts:64`) keep today's behaviour.
- `lsp-features` builds the gate once per request. Today it calls `collectRules` once per candidate.

---

## 3. Resolver and verdict changes

### 3.1 `src/resolve.ts` `checkRefs` (`:252-259`)

This goes after the existing `knownExternal.has(r.target)` check:

```ts
const pkg = externalPackageId(r.target);
if (pkg !== null && pkg !== r.target && !index.planned.has(r.target) && (knownExternal.has(pkg) || index.planned.has(pkg))) {
  unverified.push({ ..., message: `opaque module \`${pkg}\` (${knownExternal.has(pkg) ? "declared, not imported" : "planned"})`, spec: ... });
  continue;
}
```

Also update the `ResolveContext.knownExternal` doc (`:38`).

### 3.2 `src/flows.ts`

- `FlowInput` (`:47`) gets `knownExternal?: ReadonlySet<string>`, passed from `assess.ts:57-66`.
- `idVerdict` (`:209-224`) gets the `planned` map. Before the fail branch:
  - If `pkg` is not a snapshot node and is in `knownExternal`: `unverified`, with `"declared, not imported"` for the package itself, or `` opaque module `pkg` (declared, not imported)`` for a member.
  - If `pkg` is planned: `` opaque module `pkg` (planned)``.
- Optional: the static message for a declared-only package step, today "not in the snapshot (opaque module)" (`:149`), becomes ``no module imports `external.pg` ``.

Verdicts before and after the change (probe, repo `r1`):

| Reference | Today | New |
|---|---|---|
| `step external.pg` (declared only) | ID **fail** K001, exit 1 | ID unverified "declared, not imported" |
| `step external.pg.Pool` (declared only) | **K001** | unverified "opaque module `external.pg` (declared, not imported)" |
| `step external.stripe.Charges` with `planned module external.stripe` | **K001** | unverified "… (planned)" |
| `step external.zod.object` (imported) | unverified opaque | unchanged |
| `step external.junkpkg` (only in `bench/repos/x/package.json`, excluded) | "known" (ID fail) | **K001** (§1.3) |
| `@scope/pkg` when `scope-pkg` is also declared | `external.scope-pkg-2` → K001 | resolves |

Non-external `planned module` members stay K001, because a member of an intended internal module has to be declared `planned` itself. Only external modules are opaque by definition (design Р13).

### 3.3 K202 message (`src/flows.ts:639`)

When `code.file === null`, take the first resolved `import`/`reexport` edge whose target is the ID, sorted by file, line and column:

`` planned module `external.stripe` is imported by `app.pay` (src/app/pay.ts:1); remove the declaration ``

---

## 4. Completion (`src/lsp-features.ts:531-606`)

### 4.1 Item type

Add to `CompletionItem`:

```ts
additionalTextEdits?: { range: LspRange; newText: string }[];
```

`labelDetails.description` takes `"planned"` (existing) or `"+ planned"`, which marks that the item brings an auto-import edit.

### 4.2 Candidate sources

All are merged by ID, in priority order snapshot, then declared, then planned:

1. **Snapshot module nodes in `layer === "external"`** (imported).
   - `detail`: the declared text if the package is declared. Otherwise `` `${comment ?? name}` (imported)``; for `external.node` it is `node (built-in)`.
2. **`ws.analysis.packages`.**
   - Skip `@types/*`.
   - Skip ranges with a `workspace:`, `file:`, `link:` or `portal:` protocol; those are internal code.
   - `detail`: `${name} ${range} (${manifest}${field ≠ dependencies ? ", dev|peer|optional|build" : ""}${n>1 ? `, +${n-1}` : ""})`. Example: `pg ^8.11.0 (package.json)`.
3. **`planned` items from `plannedDecls(ws.analysis.docs)`**, which replaces `ws.analysis.spec.planned` (`:598`).
   - A new export in `src/spec-ir.ts`, wrapping the private `plannedDecl` (`:472`) over named flow sections.
   - It reads the live documents, so a TUI buffer that `live()` has not reanalysed yet is covered (`app.ts:511-518`).

Sort order stays by label. `sortText` prefixes:
- `1` imported
- `2` planned
- `3` declared only

### 4.3 Positions

| Line before the cursor | Candidates | Filter | Auto-import |
|---|---|---|---|
| `- step ▮` | fn, planned fn, **all external** | externals only: gate from the parent step's file module (walk up to the nearest step or trigger, else the section's first trigger) | yes |
| `- trigger ▮` | unchanged (fn only) | — | no |
| `calls` / `reads` / `then` in a flow | as today, plus declared packages | externals: same gate | yes |
| `calls` under a map fn or module | as today, plus declared packages | `dependencyGate` (deny and K101) from `moduleAround` | no |
| `- <alias> ▮` under a map `module` (new: the parent is a module and the word is not `module`/`fn`/`type`/`event`) | module, fn, type, external | gate | no |
| `- allow` / `deny` ▮ | **config layers plus `external`**, modules (classes included), declared packages, planned module | none (`:589` stays) | no |
| `- planned module ▮` (new regex `^(\s*)-\s+planned\s+module\s+\S*$`) | declared packages that are neither imported nor planned | none | no |

Notes:
- In flows, fn candidates are not filtered by the gate. A step may be reached through an injected hook, and rules do not see `injected` edges (`snapshot.ts:44`). An external step, however, is proved only by an import from the parent's module (`flows.ts:383`), so a `deny` on that import really does forbid it.
- K101 never removes externals, because `external` is an unordered layer (`rules.ts:54`).
- `allow`/`deny` is not filtered by K101, because an `allow` exists precisely to lift K101.

### 4.4 Auto-import rule

This is a pure function next to `completions`:

```ts
function plannedImport(doc: Document, docs: readonly Document[], ws: Workspace, line0: number, id: string): { range: LspRange; newText: string } | null
```

An edit is attached only when all of these hold:
- `pkg = externalPackageId(id)` is in `ws.analysis.packages`.
- `pkg` has no snapshot node.
- `pkg` is in no `plannedDecls(ws.analysis.docs)`.
- `sectionAt` is a `flow` section.
- The current item is not itself `planned`.

It is keyed by the package, so the later symbol slice (`external.pg.Pool`) reuses it unchanged.

Where the line goes:
- The anchor is the first top-level node of the section (`sectionNodes`) whose kind is neither `kind` nor `planned`. If there is none, no edit.
- The edit is `{start:{line: anchor.line-1, character:0}, end: same, newText: " ".repeat(col-1) + "- planned module " + pkg + "\n"}`.
- It does not overlap the main `textEdit`, because it is an empty range at column 0 and the main edit starts after `- step `.
- `fmt` keeps the result canonical (probe): `fmt` does not reorder items (`fmt.ts:18-37`).

### 4.5 Optional cap

With the option, `lsp.ts:293` calls a new `completionList(ws, path, pos, 300)`:
- Keep labels containing the typed text.
- Starts-with matches first.
- `isIncomplete: true` when cut.

The TUI keeps the uncapped `completions()`.

---

## 5. TUI

### 5.1 `src/tui/app.ts:1101-1145`

- **`complete()`:** after the scan loop (`:1114-1115`), add `if (line.clusters[from] === "[") from++;`, mirroring `lsp-features.ts:575`.
- **`acceptCompletion()`:** one `edit()` applies `item.textEdit` (falling back to a range built from `from`..cursor with `line.units`) plus `item.additionalTextEdits`.
  - Uses a pure `applyTextEdits(lines, edits): LspPosition` in `src/tui/buffer.ts`.
  - It converts to UTF-16 offsets, applies the edits in descending order, and returns where the main edit's inserted text ends after all edits.
  - Cursor: `line` is that line; `col` is `graphemes(line.slice(0, character)).length`. So the cursor moves down by one when the `planned` line lands above it.
  - Because there is one `edit()`, there is one undo entry (`:476`).
  - `state.message` reads ``added `- planned module external.pg` to flow <name>``.

### 5.2 `src/tui/view.ts:436-452`

- The detail is followed by `  + planned` when `additionalTextEdits` is non-empty.
- The width calculation includes it.

---

## 6. Docs

- **docs/format.md:421** (and :633): rewrite:
  - Which manifests count, per §1.3: exclude, ancestors of analysed files, Python not read.
  - "a member `external.<pkg>.X` of a declared package or of a `planned module external.<pkg>` is `unverified` «opaque module», not K001".
  - Collision suffixes are worked out over declared and imported packages together.
- **docs/format.md:441 (Р13)** and **:641 (the `ID` row):** add the declared and planned package cases to the `unverified` column.
- **docs/format.md:709:** the K202 message form for a package.
- **docs/tools.md:108 (LSP completion):**
  - The new positions and candidates.
  - `external.*` after `step`.
  - `allow`/`deny` offers layers and modules.
  - The detail format.
  - `additionalTextEdits` and `labelDetails "+ planned"`.
  - Add `module` to the keyword list.
- **docs/tools.md:156 (TUI):** one-step accept with the `planned` line, the `+ planned` marker, and completion inside `[`.
- **ADR:** a new `docs/adr/0007-declared-packages.md` covering the manifest scope, opaque package members, and advisory-only completion data. It prepares the `.d.ts` index slice.

---

## 7. E2E tests

- **CLI** (`tests/rules-area.test.ts`, next to `:413-470`, using its helpers `repo`, `config`, `check`):
  - Fixture:
    - layers app/infra, `exclude: ["bench/**"]`
    - `package.json` declaring `pg`, `@scope/pkg` and `scope-pkg`
    - `bench/x/package.json` declaring `junk`
    - a flow with steps `external.pg`, `external.pg.Pool`, `external.scope-pkg-2` and `external.junk`, and a second flow with `planned module external.stripe` plus `step external.stripe.Charges`
  - Assert:
    - exit 1, with K001 only for `external.junk`
    - the JSON rows from the §3.2 table
  - Then an import of `pg` in `app` makes the member `unverified opaque` with no K202. Then `planned module external.pg` gives the new K202 text.
- **Collision** (`tests/analyzer.test.ts:488-500`): add a case where both names are declared and only `@scope/pkg` is imported. Expect `external.scope-pkg-2` plus a warning.
- **Existing assertion to update** (`tests/cli.test.ts:1842`, `:1849`): the new K202 text.
- **LSP** (`tests/lsp.test.ts`):
  - Update `:599`: after `step`, expect "every item is kind 3 or `external.*`" (`external.node` now appears).
  - New test with `fixture(t, { "package.json": …pg, vitest(dev), @types/node, "@scope/pkg", "scope-pkg"; "keylang/flows/buy.md": FLOW })`.
    - After `  - step `:
      - `external.pg` has detail `pg ^8.11.0 (package.json)`, `labelDetails "+ planned"`, and `additionalTextEdits` at line 3 (after the existing `planned fn`) with newText `- planned module external.pg\n`.
      - `external.node` has no edits.
      - There is no `external.types-node`.
    - `didChange` adding the `planned` line: the item now has no edits.
    - `- deny app ▮`: labels are layers and modules only; the fn `domain.order.total` and the type `domain.order.Order` are absent; `external` is present.
    - Rules `- deny app external.pg`: the `step` list under `app.checkout.checkout` lacks `external.pg`.
    - `calls` under the `domain.order` map module lacks `app.*` (K101).
    - `- planned module ▮`: only declared packages that are not imported.
- **TUI** (`tests/tui.test.ts`, next to `:206`, using `checkoutRepo(t, {"package.json": stripe ^14})`):
  - Type `step external.st`. The popup shows `stripe ^14.0.0 (package.json)` and `+ planned`.
  - Tab:
    - line 4 is `- planned module external.stripe`
    - the step line is `  - step external.stripe`
    - the cursor is at its end
  - Ctrl+Z gives the exact text from before the accept (one undo step).
  - A second `step external.st` in the same unsaved buffer attaches no edit (the stale-spec case).
  - Ctrl+S, then CLI `check`: exit 0 and `ID unverified external.stripe: planned module`.
  - Also: `step [infra` opens the list.

Validation: `npm run typecheck`, `npm test`, `node bin/keylang.js map` (review the diff), `map --check`, `check`.

---

## 8. Risks

- **Behaviour change:** `external.*` references that are known today only through a manifest outside the analysed tree (bench, fixtures, a Rust crate in a TypeScript-only config) become K001. This is intended per format.md:421, but it is visible.
- **`snapshotId` changes** once for repos with nested manifests, and `EXTRACTOR_VERSION` goes up; fact caches are rebuilt.
- **Workspace packages** declared with a plain version (not `workspace:`) would still be offered as external.
- **LSP clients** that ignore `labelDetails` show no `+ planned` marker; the edit still applies.

## 9. Open questions

1. Is the planned-line insertion position right: after any leading `kind` and `planned` lines, before the first other item?
2. Should `installed version` from `node_modules/<pkg>/package.json` also go into the detail? It is local and read-only, but decision 4 says node_modules contents are advisory only.
3. Should `emits` stop offering IDs? The grammar makes its argument a segment, not an ID (`format.md:865`). This is a pre-existing bug outside this slice.
4. `@types/x`: skip it (my proposal) or map it to `x`?
5. Should MCP `currentAnalysis` add `package.json` to its cache key when `languages: []`?